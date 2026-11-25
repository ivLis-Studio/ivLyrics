import { getRuntimeService } from './runtimeServices.mjs';
import { publishPronunciationNotation, readPronunciationSlots } from '../lyrics/pronunciationRuntime.mjs';
import { createPageLyricsCacheIdentity } from '../lyrics/pageLyricsCacheIdentity.mjs';
import { createTranslationCache } from '../lyrics/translationCache.mjs';
import {
  createTranslationPreferences, LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY, normalizeIvLyricsPronunciationNotation,
} from '../lyrics/translationPreferences.mjs';
import { createTranslationPresentation } from '../lyrics/translationPresentation.mjs';
import { createTranslationRequester } from '../lyrics/translationRequest.mjs';

export function createPageTranslation({
  host, memoryCache, readVisualSettings, readLocalSetting, readPersistedSetting,
  readAppLanguage, readSpotifyLocale, getTranslationCacheId, translate, now = () => Date.now(),
}) {
  const getService = (name) => getRuntimeService(name, host);
  const getPronunciationSlots = () => readPronunciationSlots(host);
  const preferences = createTranslationPreferences({
    getVisualSetting: (key) => readVisualSettings()?.[key],
    readLocalSetting,
    getAppLanguage: readAppLanguage,
    getSpotifyLocale: readSpotifyLocale,
    getProviderStyle: () => getService('AIAddonManager')?.getTranslationStyle?.(),
  });
  publishPronunciationNotation(host, Object.freeze({
    storageKey: LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY,
    normalize: normalizeIvLyricsPronunciationNotation,
    getCurrent: preferences.getCurrentLyricsPronunciationNotation,
  }));

  const presentation = createTranslationPresentation({
    getPhoneticHyphenMode: () => readVisualSettings()['phonetic-hyphen-replace'],
  });
  const cache = createTranslationCache({
    getCache: () => getService('LyricsCache'),
    getTranslationStyle: preferences.getTranslationStyle,
    getPronunciationCacheTag: preferences.getPronunciationCacheTag,
    rememberPronunciationSlots: (trackId, text, result) => getPronunciationSlots()?.remember?.(trackId, text, result),
  });
  const cacheIdentity = createPageLyricsCacheIdentity({
    readVisualSettings,
    isAutomaticWordSyncFallbackEnabled: () => getService('LyricsAddonManager')?.isAutomaticWordSyncFallbackEnabled?.(),
    translationPreferences: preferences,
    getLyricsProcessingShapeSignature: presentation.getLyricsProcessingShapeSignature,
  });

  const callsByMode = new Map();
  function canMakeCall(mode, maxCalls, windowMs) {
    const currentTime = now();
    const calls = callsByMode.get(mode) ?? [];
    let keepFrom = 0;
    while (keepFrom < calls.length && currentTime - calls[keepFrom] >= windowMs) keepFrom++;
    const recentCalls = keepFrom === 0 ? calls : calls.slice(keepFrom);
    if (recentCalls.length >= maxCalls) return false;
    recentCalls.push(currentTime);
    callsByMode.set(mode, recentCalls);
    return true;
  }

  const requestLyricsTranslation = createTranslationRequester({
    registerLegacySettings() {
      // The settings store registers legacy keys when they are read.
      readPersistedSetting('ivLyrics:visual:gemini-api-key');
      readPersistedSetting('ivLyrics:visual:gemini-api-key-romaji');
    },
    getMemoryCacheKey: cacheIdentity.getDisplayModeCacheKey,
    getGenerationOptions: cacheIdentity.getDisplayModeGenerationOptions,
    readMemoryCache: (key) => memoryCache.get(key),
    writeMemoryCache: (key, value) => memoryCache.set(key, value),
    getNonSectionLyricsText: presentation.getNonSectionLyricsText,
    getLegacyNonSectionLyricsText: presentation.getLegacyNonSectionLyricsText,
    getTranslationCacheId,
    getCachedTranslationForText: cache.getCachedTranslationForText,
    createTranslationLineMapper: presentation.createTranslationLineMapper,
    canMakeCall,
    getRateLimitError: () => translate('notifications.tooManyTranslationRequests'),
    callProvider: (request) => getService('Translator').callGemini(request),
    getCacheRevision: trackId => getService('Translator')?.getCacheRevision?.(trackId),
    shouldRequestPronunciationSlots: (lyrics, source) => !!getPronunciationSlots()?.isRequested?.(lyrics, source),
  });

  return {
    getCurrentTranslationTargetLanguage: preferences.getCurrentTranslationTargetLanguage,
    getCurrentLyricsPronunciationNotation: preferences.getCurrentLyricsPronunciationNotation,
    getTranslationStyle: preferences.getTranslationStyle,
    ...presentation, ...cache, ...cacheIdentity, requestLyricsTranslation,
  };
}
