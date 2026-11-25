import { resolveModeSpecificLyrics } from "./lyricsRenderModes.mjs";
import { applyCulturalAnnotationsToLyrics } from "./lyricCulturalAnnotations.mjs";
import { getTranslationSourceCacheHash } from "./translationPresentation.mjs";

export function createPageCulturalAnnotations({
  page, getVisualSettings, buildTranslationLineRequests, getTranslator,
  playbackUri, extractTrackId, getLyricsCache, toast, translate,
}) {
  const resultsByTrack = new Map();
  const pendingRequests = new Map();
  const activeRequestsByTrack = new Map();
  const getAnnotationTrackId = uri => extractTrackId(uri) || uri;
  let cacheEpoch = 0;

  function isEnabled() {
    const value = getVisualSettings()["cultural-annotations-enabled"];
    return value === true || value === "true";
  }

  function getSourceLines(lyrics) {
    return buildTranslationLineRequests(lyrics, { splitVocalParts: false })
      .map(({ lineIndex, text }) => ({ lineIndex, text }));
  }

  function getCurrentLyrics() {
    const currentMode = page.getCurrentMode();
    return (
      resolveModeSpecificLyrics(page.state, currentMode) ??
      (Array.isArray(page.state.currentLyrics) ? page.state.currentLyrics : [])
    );
  }

  function clearTrack(uri, { updateState = false } = {}) {
    if (!uri) return;

    cacheEpoch += 1;
    getTranslator()?.clearCulturalAnnotationRequests?.(getAnnotationTrackId(uri));
    resultsByTrack.delete(uri);
    activeRequestsByTrack.delete(uri);
    for (const requestKey of pendingRequests.keys()) {
      if (requestKey.startsWith(`${uri}:`)) {
        pendingRequests.delete(requestKey);
      }
    }
    page.clearCulturalAnnotationsLoading();

    if (updateState && page._isComponentMounted && page.state.uri === uri) {
      page.setState(state => ({
        currentLyrics: apply(state.currentLyrics, uri),
      }));
    }
  }

  function clearAll({ updateState = false } = {}) {
    cacheEpoch += 1;
    resultsByTrack.clear();
    pendingRequests.clear();
    activeRequestsByTrack.clear();
    page.clearCulturalAnnotationsLoading();

    if (updateState && page._isComponentMounted) {
      page.setState(state => ({
        currentLyrics: apply(state.currentLyrics, state.uri),
      }));
    }
  }

  function apply(lyrics, uri = page.state.uri) {
    if (!Array.isArray(lyrics)) return [];

    const result = isEnabled()
      ? resultsByTrack.get(uri)
      : null;
    const notesByIndex = result?.notesByIndex || null;

    return applyCulturalAnnotationsToLyrics(lyrics, notesByIndex);
  }

  function requestAnnotations({
    lyricsState,
    lyrics,
    sourceLang,
    uri,
    ignoreCache = false,
    notifyOnError = true,
    onSuperseded = null,
  }) {
    if (!isEnabled()) return Promise.resolve(null);
    const translator = getTranslator();
    if (!translator?.generateCulturalAnnotations) {
      return Promise.resolve(null);
    }

    const lines = getSourceLines(lyrics);
    if (lines.length === 0) return Promise.resolve(null);

    const targetLang = page.getTranslationTargetLanguage();
    const sourceSignature = getTranslationSourceCacheHash(JSON.stringify(lines));
    const schemaVersion = 4;
    const resultKey = `v${schemaVersion}:${sourceLang || "auto"}:${targetLang}:${sourceSignature}`;
    if (!ignoreCache && resultsByTrack.get(uri)?.key === resultKey) {
      // Returning to a cached language/source also supersedes an older fetch.
      activeRequestsByTrack.delete(uri);
      return Promise.resolve(resultsByTrack.get(uri));
    }

    const requestKey = `${uri}:${resultKey}`;
    if (!ignoreCache && pendingRequests.has(requestKey)) {
      const pending = pendingRequests.get(requestKey);
      activeRequestsByTrack.set(uri, pending);
      return pending;
    }

    const requestEpoch = cacheEpoch;
    const culturalAnnotationLabel =
      translate("generationStatus.culturalAnnotations") || "문화적 설명";
    const culturalAnnotationLoadingDescription =
      translate("generationStatus.culturalAnnotationsLoading") ||
      "문화적 설명을 생성하는 중...";
    const loadingToken = page.startCulturalAnnotationsLoading({
      label: culturalAnnotationLabel,
      description: culturalAnnotationLoadingDescription,
    });
    const isCurrentRequest = () => requestEpoch === cacheEpoch
      && activeRequestsByTrack.get(uri) === request
      && page.getTranslationTargetLanguage() === targetLang
      && isEnabled();
    let completed = false;
    const request = translator.generateCulturalAnnotations({
      trackId: getAnnotationTrackId(uri),
      title: lyricsState.title || page.state.title,
      artist: lyricsState.artist || page.state.artist,
      lines,
      sourceLang: sourceLang || "auto",
      schemaVersion,
      ignoreCache,
      onProviderLoading: ({ providerId, providerName }) => {
        const providerLabel = String(providerName || providerId || "").trim();
        if (!providerLabel) return;
        queueMicrotask(() => {
          if (isCurrentRequest() && page.isCurrentLyricsUri(uri)) {
            page.updateGenerationRequestLoading("cultural-annotations", {
              description: `${culturalAnnotationLoadingDescription}: ${providerLabel}`,
            });
          }
        });
      },
    }).then((result) => {
      if (!isCurrentRequest()) {
        onSuperseded?.();
        return null;
      }
      const notesByIndex = new Map();
      for (const annotation of Array.isArray(result?.annotations) ? result.annotations : []) {
        const lineIndex = Number(annotation.lineIndex);
        const expression = String(annotation.expression || "").trim();
        const note = String(annotation.note || "").trim();
        if (!Number.isInteger(lineIndex) || !expression || !note) continue;

        const lineAnnotations = notesByIndex.get(lineIndex) || [];
        lineAnnotations.push({
          marker: lineAnnotations.length + 1,
          expression,
          note,
        });
        notesByIndex.set(lineIndex, lineAnnotations);
      }
      resultsByTrack.set(uri, {
        key: resultKey,
        notesByIndex,
        provider: result?.provider || null,
      });
      completed = true;

      if (page._isComponentMounted && page.state.uri === uri) {
        page.setState(state => ({
          currentLyrics: apply(state.currentLyrics, uri),
        }));
      }
      return result;
    }).catch((error) => {
      if (!isCurrentRequest()) {
        onSuperseded?.();
        return null;
      }
      console.warn("[ivLyrics] Cultural annotation request failed:", error);
      if (notifyOnError && page._isComponentMounted && page.state.uri === uri) {
        toast.error(
          `${translate("notifications.culturalAnnotationsFailed") || "문화적 배경 설명을 불러오지 못했습니다."} ${error?.message || ""}`.trim()
        );
      }
      return null;
    }).finally(() => {
      const cancelled = !isCurrentRequest();
      if (pendingRequests.get(requestKey) === request) {
        pendingRequests.delete(requestKey);
      }
      if (activeRequestsByTrack.get(uri) === request) {
        activeRequestsByTrack.delete(uri);
      }
      page.clearCulturalAnnotationsLoading(loadingToken, { completed, cancelled });
    });

    pendingRequests.set(requestKey, request);
    activeRequestsByTrack.set(uri, request);
    return request;
  }

  async function regenerate() {
    if (!isEnabled()) return;

    const lyricsState = page.state;
    const uri = lyricsState.uri || playbackUri();
    const lyrics = getCurrentLyrics();
    const targetLang = page.getTranslationTargetLanguage();
    let regenerationEpoch = null;
    let superseded = false;
    const isCurrentRegeneration = () => !superseded &&
      page.isCurrentLyricsUri(uri) && isEnabled() &&
      page.getTranslationTargetLanguage() === targetLang &&
      (regenerationEpoch === null || regenerationEpoch === cacheEpoch);
    if (!uri) {
      toast.error(translate("notifications.noTrackPlaying"));
      return;
    }
    if (!Array.isArray(lyrics) || lyrics.length === 0) {
      toast.error(translate("notifications.noLyricsLoaded"));
      return;
    }

    toast.show(
      translate("generationStatus.culturalAnnotationsLoading") ||
        "문화적 배경 설명을 재생성하는 중...",
      false,
      2000
    );

    try {
      clearTrack(uri, { updateState: true });
      regenerationEpoch = cacheEpoch;
      const cacheCleared = await getLyricsCache().clearCulturalAnnotationsForTrack(getAnnotationTrackId(uri));
      if (!isCurrentRegeneration()) return;
      if (!cacheCleared) {
        throw new Error("Failed to clear cultural annotation cache.");
      }
      const result = await requestAnnotations({
        lyricsState,
        lyrics,
        sourceLang: page.provideLanguageCode(lyrics),
        uri,
        ignoreCache: true,
        notifyOnError: false,
        onSuperseded: () => { superseded = true; },
      });
      if (!isCurrentRegeneration()) return;
      if (!result) {
        throw new Error("No cultural annotation result.");
      }
      toast.success(
        translate("notifications.culturalAnnotationsRegenerated") ||
          "문화적 배경 설명이 재생성되었습니다."
      );
    } catch (error) {
      if (isCurrentRegeneration()) {
        toast.error(
          `${translate("notifications.culturalAnnotationsRegenerateFailed") ||
            "문화적 배경 설명 재생성 실패"}: ${error.message}`
        );
      }
    }
  }

  return { isEnabled, clearTrack, clearAll, apply, request: requestAnnotations, regenerate };
}
