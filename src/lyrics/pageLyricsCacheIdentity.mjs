import { normalizeLyricSourceLanguage } from "./lyricPresentationIdentity.mjs";

export const SYNC_DATA_RENDERER_VERSION = "2026-07-13-timestamp-cluster-v1";

const getLyricsTextCacheHash = (lyrics = []) => {
  const lines = Array.isArray(lyrics) ? lyrics : [];
  let hash = 2166136261;
  let length = 0;

  for (const line of lines) {
    const value = String(line?.text || "").normalize("NFC");
    length += value.length + 1;
    for (const char of `${value}\n`) {
      hash ^= char.codePointAt(0) || 0;
      hash = Math.imul(hash, 16777619);
    }
  }

  return `txt-${(hash >>> 0).toString(36)}-${length.toString(36)}`;
};

export const getSyncDataRendererCacheVersion = (lyricsState = {}) => (
  lyricsState?.syncDataApplied
    ? `${lyricsState.syncDataRendererVersion || "legacy-sync-data-renderer"}:${getLyricsTextCacheHash(
      lyricsState.karaoke || lyricsState.synced || lyricsState.unsynced
    )}`
    : "base"
);

export function createPageLyricsCacheIdentity({
  readVisualSettings, isAutomaticWordSyncFallbackEnabled, translationPreferences, getLyricsProcessingShapeSignature,
}) {
  function getLyricsProviderSelectionPolicy() {
    const visualSettings = readVisualSettings();
    const preferLyricsType = visualSettings["prefer-lyrics-type-over-provider-order"];
    const typeFirst = (preferLyricsType !== false && preferLyricsType !== "false")
      || isAutomaticWordSyncFallbackEnabled();
    const preferSyncData = visualSettings["prefer-sync-data-provider"];
    const syncDataFirst = preferSyncData !== false && preferSyncData !== "false";
    return `${typeFirst ? "type-first-v1" : "provider-first-v1"}:${syncDataFirst ? "sync-data-first" : "configured-order"}`;
  }

  const isLyricsRenderCacheCurrent = (lyricsState = {}) => (
    (!lyricsState?.syncDataApplied ||
      lyricsState.syncDataRendererVersion === SYNC_DATA_RENDERER_VERSION)
    && (!lyricsState?.provider
      || lyricsState.provider === "local"
      || !!lyricsState?.trackLyricsProviderOverride
      || (lyricsState?.providerSelectionPolicy || "provider-first-v1:sync-data-first") === getLyricsProviderSelectionPolicy())
  );

  const getDisplayModeGenerationOptions = (mode = "", sourceLanguage) => {
    const source = sourceLanguage ? `:source=${normalizeLyricSourceLanguage(sourceLanguage)}` : "";
    if (!String(mode || "").startsWith("gemini_")) return mode && mode !== "none" ? source : "";
    const options = mode === "gemini_romaji"
      ? translationPreferences.getPronunciationCacheTag()
      : `style=${translationPreferences.getTranslationStyle()}`;
    return `:${translationPreferences.getCurrentTranslationTargetLanguage()}:${options}${source}`;
  };

  const getDisplayModeCacheKey = (lyricsState = {}, mode = "", sourceLanguage) => {
    const providerKey = lyricsState.provider || "";
    const providerCacheVersion = lyricsState.cacheVersion || "provider-cache-legacy";
    const sourceLyrics = lyricsState.currentLyrics
      || lyricsState.karaoke
      || lyricsState.synced
      || lyricsState.unsynced
      || [];
    const lyricsShape = getLyricsProcessingShapeSignature(sourceLyrics);
    const generationOptions = getDisplayModeGenerationOptions(mode, sourceLanguage);
    return `${lyricsState.uri}:${providerKey}:${mode}${generationOptions}:${getSyncDataRendererCacheVersion(lyricsState)}:${providerCacheVersion}:${lyricsShape}`;
  };
  return { isLyricsRenderCacheCurrent, getDisplayModeGenerationOptions, getDisplayModeCacheKey };
}
