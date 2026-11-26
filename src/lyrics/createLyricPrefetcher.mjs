import { isUserEditedTranslation, readTranslationResultLines } from "./translationCache.mjs";
import { getLyricDisplayModes, getLyricLanguageMode } from "./lyricPresentationIdentity.mjs";
import { isAiMode, isPronunciationMode } from "./lyricTranslationModes.mjs";
import { readPageLyricsSource, writePageLyricsSource } from "./pageLyricsSourceCache.mjs";
import { getWordSupplementTrackId } from "./wordSupplementRuntime.mjs";

export function createLyricPrefetcher({
  requests, sourceCache, translationCache, readVisual, getService, getWordSupplementPrefetcher, getPronunciationSlots, getMarketplaceReady, extractTrackId,
  getTranslationCacheId, getDisplayModeCacheKey, getDisplayModeGenerationOptions,
  getNonSectionLyricsText, getLegacyNonSectionLyricsText, getCurrentTranslationTargetLanguage,
  getCachedTranslationForText, mapTranslationLinesToLyrics, debug, warn = console.warn,
}) {
  async function loadLyrics(trackInfo, { wanted = () => true, signal } = {}) {
    const uri = trackInfo.uri;
    const getRevision = () => getService("LyricsService")?.getLyricsRequestRevision?.(uri);
    const revision = getRevision();
    const isCurrent = () => !signal?.aborted && wanted() && getRevision() === revision;
    if (!isCurrent()) return null;
    const existingSource = readPageLyricsSource(sourceCache, uri, revision);

    if (existingSource) {
      debug(`[Prefetcher] Lyrics already cached for: ${trackInfo.title}`);
      return existingSource;
    }

    try {
      debug(`[Prefetcher] Fetching lyrics for: ${trackInfo.title}`);
      const ready = getMarketplaceReady?.();
      if (ready) await ready;

      if (!isCurrent()) return null;
      const service = getService("LyricsService");
      const override = (await service.getTrackLyricsProviderOverride?.(uri)) || null;
      if (!isCurrent()) return null;
      const readMatchingSource = () => {
        const cached = readPageLyricsSource(sourceCache, uri, revision);
        return (cached?.trackLyricsProviderOverride || null) === override ? cached : null;
      };
      const existing = readMatchingSource();
      if (existing) return existing;
      const result = await service.getLyricsFromProviders(trackInfo, [], 1, override, { signal });
      if (!isCurrent()) return null;
      const loaded = readMatchingSource();
      if (loaded) return loaded;
      if (!result?.provider || result.error || (result.uri && result.uri !== uri)) return null;
      const cached = writePageLyricsSource(sourceCache, uri, { ...result, uri, trackLyricsProviderOverride: override }, revision);
      debug(`[Prefetcher] Lyrics cached for: ${trackInfo.title} (provider: ${cached.provider})`);
      return cached;
    } catch (error) {
      if (isCurrent()) warn(`[Prefetcher] Lyrics prefetch failed:`, error.message);
      return null;
    }
  }

  async function loadTranslations(trackInfo, lyrics, { wanted = () => true } = {}) {
    const lyricsArray = lyrics?.karaoke || lyrics?.synced || lyrics?.unsynced;
    if (!Array.isArray(lyricsArray) || lyricsArray.length === 0) return;
    const detectedLanguage = getService("LyricsService").detectLanguage(lyricsArray);
    if (!detectedLanguage) return;
    const modes = [...new Set(getLyricDisplayModes(readVisual(), getLyricLanguageMode(detectedLanguage)).filter(isAiMode))];
    if (modes.length === 0 || !wanted()) return;

    const text = getNonSectionLyricsText(lyricsArray);
    if (!text.trim()) return;
    const inputs = modes.map((mode) => ({
      mode, key: getDisplayModeCacheKey(lyrics, mode), options: getDisplayModeGenerationOptions(mode),
    }));
    const needed = inputs.filter(({ key }) => !translationCache.get(key));
    if (needed.length === 0) return true;

    const trackId = getTranslationCacheId(trackInfo.uri);
    const getTranslationRevision = () => getService("Translator")?.getCacheRevision?.(trackId);
    const cacheRevision = getTranslationRevision();
    const requestKey = `prefetch:translation:${JSON.stringify([cacheRevision, inputs.map(({ key }) => key).sort()])}`;
    const pending = requests.get(requestKey);
    if (pending) {
      pending.interested.add(wanted);
      return pending.promise;
    }

    const targetLanguage = getCurrentTranslationTargetLanguage();
    const legacyText = getLegacyNonSectionLyricsText(lyricsArray);
    const request = { interested: new Set([wanted]), promise: null };
    const isCurrentRequest = () =>
      requests.get(requestKey) === request &&
      getTranslationRevision() === cacheRevision &&
      inputs.every(({ mode, options }) => getDisplayModeGenerationOptions(mode) === options);
    const shouldStart = () =>
      isCurrentRequest() && readVisual()["prefetch-enabled"] !== false && [...request.interested].some(isWanted => isWanted());

    const mapOutput = (record, field, splitVocalParts = true) => {
      const lines = readTranslationResultLines(record, field === "phonetic");
      if (!lines?.length) return null;
      return mapTranslationLinesToLyrics(lyricsArray, lines, {
        targetField: field, splitVocalParts, userEdited: isUserEditedTranslation(record),
      });
    };

    async function prefetchOutput(group, phonetic) {
      if (group.length === 0) return true;
      if (!shouldStart()) return false;
      const field = phonetic ? "phonetic" : "translation";
      const label = phonetic ? "Phonetic" : "Translation";
      const readStored = async (source, splitVocalParts) => {
        const cached = await getCachedTranslationForText({
          trackId, lang: targetLanguage, isPhonetic: phonetic, provider: lyrics.provider, text: source,
          canUse: isCurrentRequest,
        });
        return mapOutput(cached, field, splitVocalParts);
      };
      try {
        let mapped = await readStored(text, true);
        if (!mapped && text !== legacyText && shouldStart()) mapped = await readStored(legacyText, false);
        if (!mapped) {
          if (!shouldStart()) return false;
          if (group.every(({ key }) => translationCache.get(key))) return true;
          const options = {
            trackId, artist: trackInfo.artist, title: trackInfo.title, text,
            wantSmartPhonetic: phonetic, provider: lyrics.provider, ignoreCache: false,
          };
          if (phonetic) {
            options.sourceLang = detectedLanguage;
            options.pronunciationSlots = !!getPronunciationSlots?.()?.isRequested?.(lyricsArray, lyrics.karaokeSource);
          }
          const result = await getService("Translator").callGemini(options);
          mapped = mapOutput(result, field);
        }
        if (!mapped || !isCurrentRequest()) return false;
        // A current foreground calculation may win while prefetch is waiting.
        for (const { key } of group) {
          if (!translationCache.get(key)) translationCache.set(key, mapped);
        }
        return true;
      } catch (error) {
        warn(`[Prefetcher] ${label} prefetch failed:`, error.message);
        return false;
      }
    }

    request.promise = Promise.resolve().then(async () => {
      try {
        debug(`[Prefetcher] Fetching translation for: ${trackInfo.title}`);
        const results = await Promise.all([
          prefetchOutput(needed.filter(({ mode }) => isPronunciationMode(mode)), true),
          prefetchOutput(needed.filter(({ mode }) => !isPronunciationMode(mode)), false),
        ]);
        return results.every(Boolean) ? true : null;
      } catch (error) {
        warn("[Prefetcher] Translation prefetch failed:", error.message);
        return null;
      } finally {
        if (requests.get(requestKey) === request) requests.delete(requestKey);
      }
    });

    requests.set(requestKey, request);
    return request.promise;
  }

  /**
   * 단어 수준 보조 가사(읽기/글로스) 프리페치. Pages.js의 실제 렌더 파이프라인과
   * 동일한 timed-char 경로로 유닛을 계산하므로, 마운트 시 캐시가 적중한다.
   */
  async function loadWordSupplements(trackInfo, lyrics, { wanted } = {}) {
    try {
      if (wanted && !wanted()) return null;
      const karaoke = Array.isArray(lyrics?.karaoke) ? lyrics.karaoke : [];
      if (karaoke.length === 0) return null;
      const prefetch = getWordSupplementPrefetcher?.();
      if (typeof prefetch !== "function") return null;
      const detected = getService("LyricsService").detectLanguage(karaoke);
      // Target track must be explicit: supplements cached while prefetching B
      // must not be keyed by whichever track (A) is still playing.
      const trackId = getWordSupplementTrackId(trackInfo?.uri);
      const loaded = await prefetch(karaoke, { sourceLang: detected, trackId, ...(wanted && { wanted }) });
      return loaded ? true : null;
    } catch (error) {
      warn(`[Prefetcher] Word details prefetch failed:`, error?.message || error);
      return null;
    }
  }

  return { loadLyrics, loadTranslations, loadWordSupplements };
}
