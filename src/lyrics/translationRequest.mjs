import { isUserEditedTranslation, readTranslationResultLines } from "./translationCache.mjs";
import { createTranslationStream } from "./translationStream.mjs";

export function createTranslationRequester({
  registerLegacySettings, getMemoryCacheKey, getGenerationOptions, readMemoryCache, writeMemoryCache,
  getNonSectionLyricsText, getLegacyNonSectionLyricsText, getTranslationCacheId, getCachedTranslationForText,
  mapTranslationLinesToLyrics, canMakeCall, getRateLimitError, callProvider, shouldRequestPronunciationSlots, getCacheRevision,
}) {
  return async function requestLyricsTranslation({ lyricsState, lyrics, mode, onProgress, session }) {
    registerLegacySettings();
    const wantSmartPhonetic = mode === "gemini_romaji";
    const targetField = wantSmartPhonetic ? "phonetic" : "translation";
    if (!Array.isArray(lyrics) || lyrics.length === 0) {
      throw new Error("Gemini API key missing. Please add at least one key in Settings.");
    }
    if (!session.isCurrentLyricsState(lyricsState)) return null;

    const cacheKey = getMemoryCacheKey(lyricsState, mode);
    const generationOptions = getGenerationOptions(mode);
    const cached = readMemoryCache(cacheKey);
    if (cached) return cached;

    const trackId = getTranslationCacheId(lyricsState.uri);
    const mapResult = (lines, splitVocalParts = true, userEdited = false) => mapTranslationLinesToLyrics(lyrics, lines, {
      targetField,
      splitVocalParts,
      userEdited,
    });
    const subscribe = (stream) => {
      if (!onProgress) return;
      const streamedLines = [];
      stream.subscribe({
        onLine(lineIndex, lineText) {
          if (!session.isCurrentLyricsState(lyricsState)) return;
          streamedLines[lineIndex] = typeof lineText === "string" ? lineText : "";
          const mapped = mapResult(streamedLines);
          if (mapped) onProgress(mapped);
        },
        onStreamReset(detail) {
          streamedLines.length = 0;
          if (session.isCurrentLyricsState(lyricsState)) {
            onProgress(null, { ...detail, reset: true });
          }
        },
      });
    };
    const cacheRevision = getCacheRevision?.(trackId);
    const inflightRequests = session.ensureInflightRequests();
    const pending = inflightRequests.get(cacheKey);
    if (pending && pending.cacheRevision === cacheRevision) {
      pending.lyricsState = lyricsState;
      subscribe(pending.stream);
      return pending.promise;
    }
    pending?.stream.close();

    const text = getNonSectionLyricsText(lyrics);
    const legacyText = getLegacyNonSectionLyricsText(lyrics);
    const lang = session.getTargetLanguage();
    const isCurrentRequest = () =>
      session.getInflightRequests() === inflightRequests &&
      inflightRequests.get(cacheKey) === request &&
      session.isCurrentLyricsState(request.lyricsState) &&
      getCacheRevision?.(trackId) === cacheRevision &&
      getGenerationOptions(mode) === generationOptions;

    const loadingToken = session.startLoading(wantSmartPhonetic);
    let loadingCompleted = false;
    const getCachedOutput = cacheText => getCachedTranslationForText({
      trackId, lang, isPhonetic: wantSmartPhonetic, provider: lyricsState.provider, text: cacheText,
      canUse: isCurrentRequest,
    });

    // Establish request ownership before invoking any asynchronous provider callbacks.
    const stream = createTranslationStream(isCurrentRequest);
    const request = { lyricsState, cacheRevision, stream, promise: null };
    request.promise = Promise.resolve().then(async () => {
      if (!isCurrentRequest()) return null;
      let splitVocalParts = true;
      let output = await getCachedOutput(text);
      if (!output && legacyText !== text && isCurrentRequest()) {
        const legacyOutput = await getCachedOutput(legacyText);
        if (legacyOutput) {
          splitVocalParts = false;
          output = legacyOutput;
        }
      }
      if (!isCurrentRequest()) return null;

      if (!output) {
        if (!canMakeCall(mode.replace("gemini_", "gemini-"), 5, 2000)) {
          throw new Error(getRateLimitError());
        }
        const current = session.getState();
        const owner = request.lyricsState;
        const liveMetadata = current.uri === owner.uri ? current : owner;
        output = await callProvider({
          trackId,
          apiKey: "no",
          artist: liveMetadata.artist || owner.artist,
          title: liveMetadata.title || owner.title,
          text,
          wantSmartPhonetic,
          sourceLang: session.getSourceLanguage(lyrics),
          provider: lyricsState.provider,
          onLine: stream.onLine,
          onStreamReset: stream.onStreamReset,
          pronunciationSlots: wantSmartPhonetic && shouldRequestPronunciationSlots(lyrics, lyricsState.karaokeSource),
        });
        if (!isCurrentRequest()) return null;
      }
      if (!output) throw new Error("Empty result from Gemini.");

      const lines = readTranslationResultLines(output, wantSmartPhonetic);
      if (!lines) throw new Error("Invalid translation format received from Gemini.");
      const mapped = mapResult(lines, splitVocalParts, isUserEditedTranslation(output));
      if (!mapped) throw new Error("Failed to map streamed translation lines.");
      if (!isCurrentRequest()) return null;
      writeMemoryCache(cacheKey, mapped);
      loadingCompleted = true;
      return mapped;
    }).finally(() => {
      stream.close();
      session.finishLoading(wantSmartPhonetic, loadingToken, {
        completed: loadingCompleted, cancelled: !isCurrentRequest(),
      });
      if (inflightRequests.get(cacheKey) === request) inflightRequests.delete(cacheKey);
    });
    inflightRequests.set(cacheKey, request);
    subscribe(stream);
    return request.promise;
  };
}
