import { createSettingsPage } from "#ivlyrics/features/settings/Settings.js";
import { createSettingsServices } from "#ivlyrics/spicetify/settingsServices.mjs";
import { createOptionsMenu } from "#ivlyrics/app/OptionsMenu.js";
import { createSyncDataCreator } from "#ivlyrics/features/sync/SyncDataCreator.js";
import { createSyncCreatorServices } from "#ivlyrics/spicetify/syncCreatorServices.mjs";
import { initializeLearningMode } from "#ivlyrics/features/learning/LearningMode.js";
import { createMarketplacePage } from "#ivlyrics/features/marketplace/Marketplace.js";
import { readMarketplaceManager } from "#ivlyrics/features/marketplace/marketplaceRuntime.mjs";
import { publishRuntimeService as publishPageMenuCompatibility } from "#ivlyrics/spicetify/runtimeServices.mjs";

export function startPageMenus({
  host: window, document, react, spicetify: Spicetify, appName: APP_NAME, i18n: I18n,
  config: CONFIG, storage: StorageManager, utils: Utils, toast: Toast, KaraokeLine,
  speakerColors: ivLyricsSpeakerColors, videoHelper: VideoHelperService, CommunityVideoSelector,
  lyricRendererPrimitives, thresholdSizeLimit, readReactDom, getLegacyProviders,
}) {
  const { openConfig, ConfigButton, ConfigSlider, getSettingsMotionDurationMs } = createSettingsPage({
    host: window, react, appName: APP_NAME, i18n: I18n, config: CONFIG,
    storage: StorageManager, spicetify: Spicetify, utils: Utils, toast: Toast,
    readKaraokeLine: () => KaraokeLine,
    readSpeakerColors: () => ivLyricsSpeakerColors,
    services: createSettingsServices(window),
    readVideoHelper: () => VideoHelperService,
    readReactDom,
    thresholdSizeLimit,
  });

  const { SyncDataCreator, SyncCreatorScoreTracker } = createSyncDataCreator({
    react, host: window, spicetify: Spicetify, i18n: I18n, utils: Utils, toast: Toast,
    speakerColors: ivLyricsSpeakerColors, services: createSyncCreatorServices(window),
    readVisualSettings: () => CONFIG.visual,
    readLyricRenderer: () => lyricRendererPrimitives,
    getLegacyProviders,
  });

  const {
    IvLyricsFloatingToolbar, IvLyricsTooltip, IvLyricsToolbarIcon, ivLyricsFirstLanguagePrompt,
    openRegenerateTranslationChoiceModal, getRegenerateTranslationChoiceItems, openSyncDataCreator, SyncDataCreatorButton, TrackSyncAdjustPill,
  } = createOptionsMenu({
    react, host: window, document, spicetify: Spicetify, i18n: I18n, utils: Utils, toast: Toast,
    appName: APP_NAME, config: CONFIG, storage: StorageManager,
    ConfigSlider, ConfigButton, CommunityVideoSelector, SyncDataCreator, getSettingsMotionDurationMs,
    openSettings: openConfig,
  });

  for (const [name, service] of Object.entries({
    SyncDataCreator, SyncCreatorScoreTracker, IvLyricsFloatingToolbar, IvLyricsTooltip, IvLyricsToolbarIcon,
    ivLyricsFirstLanguagePrompt, openSyncDataCreator, SyncDataCreatorButton,
  })) {
    publishPageMenuCompatibility(name, service, window);
  }

  initializeLearningMode({
    host: window, document, ToolbarIcon: IvLyricsToolbarIcon, readTooltip: () => IvLyricsTooltip,
  });

  const MarketplacePage = createMarketplacePage({
    react, host: window, i18n: I18n, utils: Utils, toast: Toast,
    readManager: () => readMarketplaceManager(window),
  });
  return {
    openConfig, IvLyricsFloatingToolbar, openRegenerateTranslationChoiceModal,
    getRegenerateTranslationChoiceItems, ivLyricsFirstLanguagePrompt, MarketplacePage, TrackSyncAdjustPill,
  };
}
