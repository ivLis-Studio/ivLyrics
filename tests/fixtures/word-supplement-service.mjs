import { createWordSupplementService } from "#ivlyrics/lyrics/createWordSupplementService.mjs";

export function createFixtureWordSupplementService(host, {
  localStorage, logger = { warn() {} }, getDetectedLanguage = () => host.Utils?.getDetectedLanguage?.(),
  schedule, cancelTimer,
} = {}) {
  const service = createWordSupplementService({
    getLyricsService: () => host.LyricsService,
    getTranslationModes: () => host.ivLyricsTranslationModes,
    getDetectedLanguage,
    getVisualSettings: () => host.CONFIG?.visual,
    getInterfaceLanguage: () => host.I18n?.getCurrentLanguage?.(),
    getNotationService: () => host.ivLyricsPronunciationNotation,
    getAiManager: () => host.AIAddonManager,
    getTrackUri: () => host.Spicetify?.Player?.data?.item?.uri,
    readStoredSetting: key => host.ivLyricsStoragePersistence?.getItem?.(key) || localStorage?.getItem(key),
    emit: (type, detail) => host.dispatchEvent?.({ type, detail }),
    logger, schedule, cancelTimer,
  });
  host.ivLyricsWordSupplements = service;
  return service;
}
