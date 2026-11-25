// Additional aliases, translations and destinations for settings search.
export function buildSettingsSearchCatalog({ translate, getPerformanceSettingsSections, getSettingsText, getCdSettingsSections }) {
  // 일반 탭 - 언어
  const buildGeneralLanguageSettings = () => [
    {
      section: translate("tabs.general"),
      sectionKey: "general",
      settingKey: "language",
      name: translate("settings.language.label"),
      desc: translate("settings.language.desc"),
      i18nKeys: ["tabs.general", "settings.language.label", "settings.language.desc"]
    },
  ];
  // 일반 탭 - 시각 효과
  const buildAppearanceVisualSettings = () => [
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "alignment",
      name: translate("settings.alignment.label"),
      desc: translate("settings.alignment.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.alignment.label", "settings.alignment.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "lyrics-side-margin",
      name: translate("settings.sideMargin.label"),
      desc: translate("settings.sideMargin.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.sideMargin.label", "settings.sideMargin.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "lyrics-backdrop-blur",
      name: translate("settings.lyricsBackdropBlur.label"),
      desc: translate("settings.lyricsBackdropBlur.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.lyricsBackdropBlur.label", "settings.lyricsBackdropBlur.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "noise",
      name: translate("settings.noise.label"),
      desc: translate("settings.noise.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.noise.label", "settings.noise.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "colorful",
      name: translate("settings.colorful.label"),
      desc: translate("settings.colorful.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.colorful.label", "settings.colorful.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "gradient-background",
      name: translate("settings.gradientBackground.label"),
      desc: translate("settings.gradientBackground.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.gradientBackground.label", "settings.gradientBackground.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "solid-background",
      name: translate("settings.solidBackground.label"),
      desc: translate("settings.solidBackground.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.solidBackground.label", "settings.solidBackground.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "video-background",
      name: translate("settings.videoBackground.label"),
      desc: translate("settings.videoBackground.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.videoBackground.label", "settings.videoBackground.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "video-fallback-background",
      name: translate("settings.videoFallback.label"),
      desc: translate("settings.videoFallback.desc"),
      i18nKeys: ["tabs.appearance", "settings.videoFallback.label", "settings.videoFallback.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "background-brightness",
      name: translate("settings.backgroundBrightness.label"),
      desc: translate("settings.backgroundBrightness.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.backgroundBrightness.label", "settings.backgroundBrightness.desc"]
    },
  ];
  const buildPerformanceSettings = () => getPerformanceSettingsSections().flatMap((section) => [
    {
      section: translate("tabs.performance"), sectionKey: "performance",
      settingKey: section.sectionKey,
      name: translate(section.titleKey), desc: translate(section.subtitleKey),
      i18nKeys: ["tabs.performance", section.titleKey, section.subtitleKey, ...(section.searchKeys || [])],
    },
    ...section.items.filter((item) => item.searchable !== false).map((item) => ({
      section: translate("tabs.performance"), sectionKey: "performance",
      settingKey: item.key, name: item.desc, desc: item.info || "",
      i18nKeys: ["tabs.performance", section.titleKey, ...item.i18nKeys],
    })),
  ]);
  // 일반 탭 - 데스크탑 오버레이
  const buildGeneralOverlaySettings = () => [
    {
      section: translate("tabs.general"),
      sectionKey: "general",
      settingKey: "overlay-enabled",
      name: translate("overlay.enabled.label"),
      desc: translate("overlay.enabled.desc"),
      i18nKeys: ["tabs.general", "overlay.enabled.label", "overlay.enabled.desc"]
    },
    {
      section: translate("tabs.general"),
      sectionKey: "general",
      settingKey: "overlay-trim-metadata",
      name: translate("overlay.trimMetadata.label"),
      desc: translate("overlay.trimMetadata.desc"),
      i18nKeys: ["tabs.general", "sections.desktopOverlay", "overlay.trimMetadata.label", "overlay.trimMetadata.desc"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "sync-mode",
      name: translate("settingsAdvanced.syncMode.title"),
      desc: translate("settingsAdvanced.syncMode.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.syncMode.title", "settingsAdvanced.syncMode.subtitle", "sections.visualEffects"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "multi-vocal-colors",
      name: translate("settingsAdvanced.multiVocalColors.title"),
      desc: translate("settingsAdvanced.multiVocalColors.subtitle"),
      i18nKeys: [
        "tabs.appearance",
        "settingsAdvanced.multiVocalColors.title",
        "settingsAdvanced.multiVocalColors.subtitle",
        "settingsAdvanced.multiVocalColors.description",
        "settingsAdvanced.multiVocalColors.useCreatorColors.label",
        "settingsAdvanced.multiVocalColors.useCreatorColors.desc",
      ],
      keywords: ["multi vocal speaker color male female duet karaoke creator custom sync data"]
    },

  ];
  // 외관 탭
  const buildAppearanceTabSettings = () => [
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "original-style",
      name: translate("settingsAdvanced.originalStyle.title"),
      desc: translate("settingsAdvanced.originalStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.originalStyle.title", "settingsAdvanced.originalStyle.subtitle"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "pronunciation-style",
      name: translate("settingsAdvanced.pronunciationStyle.title"),
      desc: translate("settingsAdvanced.pronunciationStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.pronunciationStyle.title", "settingsAdvanced.pronunciationStyle.subtitle"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "translation-style",
      name: translate("settingsAdvanced.translationStyle.title"),
      desc: translate("settingsAdvanced.translationStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.translationStyle.title", "settingsAdvanced.translationStyle.subtitle"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "furigana-style",
      name: translate("settingsAdvanced.furiganaStyle.title"),
      desc: translate("settingsAdvanced.furiganaStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.furiganaStyle.title", "settingsAdvanced.furiganaStyle.subtitle"]
    },
    {
      section: translate("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "text-shadow",
      name: translate("settingsAdvanced.textShadow.title"),
      desc: translate("settingsAdvanced.textShadow.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.textShadow.title", "settingsAdvanced.textShadow.subtitle"]
    },

  ];
  // 동작 탭
  const buildBehaviorTabSettings = () => [
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "auto-scroll",
      name: translate("settings.autoScroll.label"),
      desc: translate("settings.autoScroll.desc"),
      i18nKeys: ["tabs.behavior", "settings.autoScroll.label", "settings.autoScroll.desc"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "animation",
      name: translate("settings.animation.label"),
      desc: translate("settings.animation.desc"),
      i18nKeys: ["tabs.behavior", "settings.animation.label", "settings.animation.desc"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "karaoke",
      name: translate("settings.karaoke.label"),
      desc: translate("settings.karaoke.desc"),
      i18nKeys: ["tabs.behavior", "settings.karaoke.label", "settings.karaoke.desc"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "blur-inactive",
      name: translate("settings.blurInactive.label"),
      desc: translate("settings.blurInactive.desc"),
      i18nKeys: ["tabs.behavior", "settings.blurInactive.label", "settings.blurInactive.desc"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "synced-fallback",
      name: translate("settings.syncedAsFallback.label"),
      desc: translate("settings.syncedAsFallback.desc"),
      i18nKeys: ["tabs.behavior", "settings.syncedAsFallback.label", "settings.syncedAsFallback.desc"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "unsynced-fallback",
      name: translate("settings.unsyncedAsFallback.label"),
      desc: translate("settings.unsyncedAsFallback.desc"),
      i18nKeys: ["tabs.behavior", "settings.unsyncedAsFallback.label", "settings.unsyncedAsFallback.desc"]
    },

  ];
  // 고급 탭
  const buildAdvancedTabSettings = () => [
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "playback",
      name: translate("settingsAdvanced.playback.title"),
      desc: translate("settingsAdvanced.playback.subtitle"),
      i18nKeys: ["tabs.behavior", "settingsAdvanced.playback.title", "settingsAdvanced.playback.subtitle"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "quick-sync-controls-enabled",
      name: translate("settingsAdvanced.playback.quickSyncControls.label"),
      desc: translate("settingsAdvanced.playback.quickSyncControls.info"),
      i18nKeys: [
        "tabs.behavior",
        "settingsAdvanced.playback.quickSyncControls.label",
        "settingsAdvanced.playback.quickSyncControls.info",
      ]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "seek-fade-compensation",
      name: translate("settingsAdvanced.playback.seekFadeCompensation.label"),
      desc: translate("settingsAdvanced.playback.seekFadeCompensation.info"),
      i18nKeys: [
        "tabs.behavior",
        "settingsAdvanced.playback.seekFadeCompensation.label",
        "settingsAdvanced.playback.seekFadeCompensation.info",
      ]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "sync-creator-settings",
      name: getSettingsText("settings.syncCreatorSettings.title", "Sync Creator Settings"),
      desc: getSettingsText("settings.syncCreatorSettings.subtitle", "Configure Sync Creator keyboard behavior and recording shortcuts."),
      i18nKeys: [
        "tabs.behavior",
        "settings.syncCreatorSettings.title",
        "settings.syncCreatorSettings.subtitle",
        "settings.syncCreatorSettings.autoBoundaryChars.label",
        "settings.syncCreatorSettings.autoBoundaryChars.desc",
        "settings.syncCreatorSettings.fillCurve.label",
        "settings.syncCreatorSettings.fillCurve.desc",
        "settings.syncCreatorSettings.fillCurve.reset"
      ],
      keywords: ["sync creator shortcuts hotkeys keybinds karaoke recording syllable word character drag slash punctuation space special characters fill curve graph correction easing quadratic"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "karaoke-mode",
      name: translate("settingsAdvanced.karaokeMode.title"),
      desc: translate("settingsAdvanced.karaokeMode.subtitle"),
      i18nKeys: ["tabs.behavior", "settingsAdvanced.karaokeMode.title", "settingsAdvanced.karaokeMode.subtitle"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "karaoke-motion-style",
      name: translate("settingsAdvanced.karaokeMode.motionStyle.label"),
      desc: translate("settingsAdvanced.karaokeMode.motionStyle.desc"),
      i18nKeys: [
        "tabs.behavior",
        "settingsAdvanced.karaokeMode.motionStyle.label",
        "settingsAdvanced.karaokeMode.motionStyle.desc",
        "settingsAdvanced.karaokeMode.motionStyle.options.classic",
        "settingsAdvanced.karaokeMode.motionStyle.options.expressive",
      ]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "cache-management",
      name: translate("settingsAdvanced.cacheManagement.title"),
      desc: translate("settingsAdvanced.cacheManagement.subtitle"),
      i18nKeys: ["tabs.behavior", "settingsAdvanced.cacheManagement.title", "settingsAdvanced.cacheManagement.subtitle"]
    },
    {
      section: translate("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "lyrics-helper",
      name: translate("settings.lyricsHelper.sectionTitle") || "Helper Integration",
      desc:
        translate("settings.lyricsHelper.sectionSubtitle") ||
        "Send lyrics to external helper applications",
      i18nKeys: ["tabs.behavior", "settings.lyricsHelper.sectionTitle", "settings.lyricsHelper.sectionSubtitle"]
    },
    {
      section: translate("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "language-detection",
      name: translate("settingsAdvanced.languageDetection.title"),
      desc: translate("settingsAdvanced.languageDetection.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.languageDetection.title", "settingsAdvanced.languageDetection.subtitle"]
    },
    {
      section: translate("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "cloud-sync",
      name: translate("settingsAdvanced.cloudSync.title"),
      desc: translate("settingsAdvanced.cloudSync.monthlyRequired"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.cloudSync.title", "settingsAdvanced.cloudSync.monthlyRequired"]
    },
    {
      section: translate("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "export-import",
      name: translate("settingsAdvanced.exportImport.title"),
      desc: translate("settingsAdvanced.exportImport.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.exportImport.title", "settingsAdvanced.exportImport.subtitle"]
    },
    {
      section: translate("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "settings-presets",
      name: translate("settingsAdvanced.settingsPresets.title"),
      desc: translate("settingsAdvanced.settingsPresets.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.settingsPresets.title", "settingsAdvanced.settingsPresets.subtitle"]
    },
    {
      section: translate("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "db-export-import",
      name: translate("settingsAdvanced.dbExportImport.title"),
      desc: translate("settingsAdvanced.dbExportImport.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.dbExportImport.title", "settingsAdvanced.dbExportImport.subtitle"]
    },
    {
      section: translate("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "reset-settings",
      name: translate("settingsAdvanced.resetSettings.title"),
      desc: translate("settingsAdvanced.resetSettings.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.resetSettings.title", "settingsAdvanced.resetSettings.subtitle"]
    },

  ];
  // 전체화면 탭
  const buildFullscreenTabSettings = () => [
    ...getCdSettingsSections({ controls: false }).flatMap((section) => [
      {
        section: translate("tabs.fullscreen"), sectionKey: "fullscreen", settingKey: section.sectionKey,
        name: translate(section.titleKey), desc: translate(section.subtitleKey),
        i18nKeys: ["tabs.fullscreen", "vinyl.cd.mode", section.titleKey, section.subtitleKey],
      },
      ...section.items.map((item) => ({
        section: translate("tabs.fullscreen"), sectionKey: "fullscreen", settingKey: item.key,
        name: item.desc, desc: item.info,
        i18nKeys: ["tabs.fullscreen", "vinyl.cd.mode", section.titleKey, ...item.i18nKeys],
      })),
    ]),
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-mode",
      name: translate("settingsAdvanced.fullscreenMode.title"),
      desc: translate("settingsAdvanced.fullscreenMode.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.fullscreenMode.title", "settingsAdvanced.fullscreenMode.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-album-open-lp",
      name: translate("vinyl.settings.albumClickOpensModeLabel"),
      desc: translate("vinyl.settings.albumClickOpensModeDesc"),
      i18nKeys: ["tabs.fullscreen", "vinyl.mode", "vinyl.settings.albumClickOpensModeLabel", "vinyl.settings.albumClickOpensModeDesc"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "vinyl-mode",
      name: translate("vinyl.mode"),
      desc: translate("vinyl.settings.subtitle"),
      i18nKeys: [
        "tabs.fullscreen",
        "vinyl.mode",
        "vinyl.settings.subtitle",
        "vinyl.presentation.settingsTitle",
        "vinyl.presentation.settingsDescription",
        "vinyl.presentation.vinylLabel",
        "vinyl.presentation.videoLabel",
        "vinyl.settings.backgroundBlurLabel",
        "vinyl.settings.backgroundBlurDesc",
        "vinyl.settings.trackChangeAnimationLabel",
        "vinyl.settings.trackChangeAnimationDesc",
        "vinyl.settings.rotationSpeedLabel",
        "vinyl.settings.rotationSpeedDesc"
      ]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "normal-mode",
      name: translate("settingsAdvanced.normalMode.title"),
      desc: translate("settingsAdvanced.normalMode.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.normalMode.title", "settingsAdvanced.normalMode.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "tv-mode",
      name: translate("settingsAdvanced.tvMode.title"),
      desc: translate("settingsAdvanced.tvMode.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.tvMode.title", "settingsAdvanced.tvMode.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "metadata-display",
      name: translate("settingsAdvanced.metadataDisplay.title"),
      desc: translate("settingsAdvanced.metadataDisplay.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.metadataDisplay.title", "settingsAdvanced.metadataDisplay.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-style",
      name: translate("settingsAdvanced.fullscreenStyle.title"),
      desc: translate("settingsAdvanced.fullscreenStyle.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.fullscreenStyle.title", "settingsAdvanced.fullscreenStyle.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-ui",
      name: translate("settingsAdvanced.fullscreenUI.title"),
      desc: translate("settingsAdvanced.fullscreenUI.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.fullscreenUI.title", "settingsAdvanced.fullscreenUI.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "controller-style",
      name: translate("settingsAdvanced.controllerStyle.title"),
      desc: translate("settingsAdvanced.controllerStyle.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.controllerStyle.title", "settingsAdvanced.controllerStyle.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "auto-hide",
      name: translate("settingsAdvanced.autoHide.title"),
      desc: translate("settingsAdvanced.autoHide.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.autoHide.title", "settingsAdvanced.autoHide.subtitle"]
    },
    {
      section: translate("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "tmi-style",
      name: translate("settingsAdvanced.tmiStyle.title"),
      desc: translate("settingsAdvanced.tmiStyle.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.tmiStyle.title", "settingsAdvanced.tmiStyle.subtitle"]
    },
    {
      section: translate("tabs.nowplaying"),
      sectionKey: "nowplaying",
      settingKey: "panel-lyrics-general",
      name: translate("settingsAdvanced.nowPlayingPanel.title"),
      desc: translate("settingsAdvanced.nowPlayingPanel.subtitle"),
      i18nKeys: ["tabs.nowplaying", "settingsAdvanced.nowPlayingPanel.title", "settingsAdvanced.nowPlayingPanel.subtitle"]
    },
    {
      section: translate("tabs.nowplaying"),
      sectionKey: "nowplaying",
      settingKey: "panel-background",
      name: translate("settingsAdvanced.nowPlayingPanel.background.title"),
      desc: translate("settingsAdvanced.nowPlayingPanel.background.subtitle"),
      i18nKeys: ["tabs.nowplaying", "settingsAdvanced.nowPlayingPanel.background.title", "settingsAdvanced.nowPlayingPanel.background.subtitle"]
    },
    {
      section: translate("tabs.nowplaying"),
      sectionKey: "nowplaying",
      settingKey: "panel-border",
      name: translate("settingsAdvanced.nowPlayingPanel.border.title"),
      desc: translate("settingsAdvanced.nowPlayingPanel.border.subtitle"),
      i18nKeys: ["tabs.nowplaying", "settingsAdvanced.nowPlayingPanel.border.title", "settingsAdvanced.nowPlayingPanel.border.subtitle"]
    },
    {
      section: translate("tabs.lyricsProviders") || "Lyrics Providers",
      sectionKey: "lyrics-providers",
      settingKey: "lyrics-providers",
      name: translate("tabs.lyricsProviders") || "Lyrics Providers",
      desc: translate("settings.lyricsProviders.description") || "Choose and order lyrics providers",
      i18nKeys: ["tabs.lyricsProviders", "settings.lyricsProviders.title", "settings.lyricsProviders.description"]
    },
    {
      section: translate("tabs.lyricsProviders") || "Lyrics Providers",
      sectionKey: "lyrics-providers",
      settingKey: "prefer-sync-data-provider",
      name: translate("settings.lyricsProviders.preferSyncDataProvider.label") || "Prioritize providers with sync data",
      desc: translate("settings.lyricsProviders.preferSyncDataProvider.desc") || "Try the matching lyrics provider first when sync data is available",
      i18nKeys: [
        "tabs.lyricsProviders",
        "settings.lyricsProviders.preferSyncDataProvider.label",
        "settings.lyricsProviders.preferSyncDataProvider.desc"
      ]
    },
    {
      section: translate("tabs.lyricsProviders") || "Lyrics Providers",
      sectionKey: "lyrics-providers",
      settingKey: "prefer-lyrics-type-over-provider-order",
      name: translate("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.label") || "Prioritize lyrics type over provider order",
      desc: translate("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.desc") || "Try karaoke across all providers before synced and plain lyrics",
      i18nKeys: [
        "tabs.lyricsProviders",
        "settings.lyricsProviders.preferLyricsTypeOverProviderOrder.label",
        "settings.lyricsProviders.preferLyricsTypeOverProviderOrder.desc"
      ]
    },
    {
      section: translate("tabs.aiProviders"),
      sectionKey: "ai-providers",
      settingKey: "ai-providers",
      name: translate("tabs.aiProviders"),
      desc: translate("settings.aiProviders.description") || "Configure AI providers and capabilities",
      i18nKeys: [
        "tabs.aiProviders",
        "settings.aiProviders.title",
        "settings.aiProviders.description",
        "settings.aiProviders.translationStyle.title",
        "settings.aiProviders.translationStyle.description",
        "settings.aiProviders.translationStyle.natural.label",
        "settings.aiProviders.translationStyle.literal.label",
        "settings.aiProviders.translationStyle.adaptive.label",
        "settings.aiProviders.retryCount.label",
        "settings.aiProviders.retryCount.description"
      ]
    },
    {
      section: translate("tabs.aiProviders"),
      sectionKey: "ai-providers",
      settingKey: "ai-provider-retry-count",
      name: translate("settings.aiProviders.retryCount.label") || "Retries per provider",
      desc: translate("settings.aiProviders.retryCount.description")
        || "Number of additional attempts after a failed request. Set to 0 to switch to the next provider immediately.",
      i18nKeys: [
        "tabs.aiProviders",
        "settings.aiProviders.retryCount.label",
        "settings.aiProviders.retryCount.description"
      ]
    },
    {
      section: translate("tabs.about"),
      sectionKey: "about",
      settingKey: "about-account",
      name: translate("settingsAdvanced.aboutTab.account.title"),
      desc: translate("settingsAdvanced.aboutTab.account.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.account.title", "settingsAdvanced.aboutTab.account.subtitle"]
    },
    {
      section: translate("tabs.about"),
      sectionKey: "about",
      settingKey: "about-app-info",
      name: translate("settingsAdvanced.aboutTab.appInfo.title"),
      desc: translate("settingsAdvanced.aboutTab.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.appInfo.title", "settingsAdvanced.aboutTab.subtitle"]
    },
    {
      section: translate("tabs.about"),
      sectionKey: "about",
      settingKey: "about-client-info",
      name: translate("settingsAdvanced.aboutTab.clientInfo.title"),
      desc: translate("settingsAdvanced.aboutTab.clientInfo.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.clientInfo.title", "settingsAdvanced.aboutTab.clientInfo.subtitle"]
    },
    {
      section: translate("tabs.about"),
      sectionKey: "about",
      settingKey: "about-update",
      name: translate("settingsAdvanced.aboutTab.update.title"),
      desc: translate("settingsAdvanced.aboutTab.update.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.update.title", "settingsAdvanced.aboutTab.update.subtitle"]
    },
    {
      section: translate("tabs.about"),
      sectionKey: "about",
      settingKey: "about-patch-notes",
      name: translate("settingsAdvanced.aboutTab.patchNotes.title"),
      desc: translate("settingsAdvanced.aboutTab.patchNotes.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.patchNotes.title", "settingsAdvanced.aboutTab.patchNotes.subtitle"]
    },
    {
      section: translate("tabs.debug"),
      sectionKey: "debug",
      settingKey: "debug-overview",
      name: translate("settingsAdvanced.debugTab.title"),
      desc: translate("settingsAdvanced.debugTab.subtitle"),
      i18nKeys: ["tabs.debug", "settingsAdvanced.debugTab.title", "settingsAdvanced.debugTab.subtitle"]
    },
  ];

  return [
    ...buildGeneralLanguageSettings(),
    ...buildAppearanceVisualSettings(),
    ...buildPerformanceSettings(),
    ...buildGeneralOverlaySettings(),
    ...buildAppearanceTabSettings(),
    ...buildBehaviorTabSettings(),
    ...buildAdvancedTabSettings(),
    ...buildFullscreenTabSettings(),
  ];
}
