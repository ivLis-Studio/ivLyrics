import {
  getSyncCreatorShortcutRow,
  SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY,
  SYNC_CREATOR_AUTO_BOUNDARY_CHARS_DEFAULT,
} from '../sync/syncCreatorShortcutSettings.mjs';

export function createPlaybackSettingsTabs({
  react, t, activeTab,
  getAvailableLanguages, getVisualSettings, changeInterfaceLanguage, saveSettingsTranslationTargetLanguage, getPerformanceSettingsSections, navigateToDestination, handlePerformanceSettingChange, handleVisualConfigChange, getSettingsText, isFadActive, openLyricsHelperDownload, saveLyricsHelperSetting,
  controls,
}) {
  const { SettingsSection, OptionList, ConfigSelection, OverlaySettings, SettingsLoadMeter, ConfigSlider, ConfigKaraokeFillCurveEditor, SettingsHotkeyTable, ConfigHotkey, ConfigSliderRange, LocalCacheManager, LyricsHelperToggle, ConfigInfo } = controls;

  const renderGeneralTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "general" ? "active" : ""}`,
        "data-tab-id": "general",
      },
      // 언어 설정 섹션
      react.createElement(
        SettingsSection,
        {
          sectionKey: "language",
          title: t("sections.language"),
          subtitle: t("settings.language.desc"),
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settings.language.label"),
              key: "language",
              info: t("settings.language.desc"),
              type: ConfigSelection,
              presentation: "select",
              options: Object.fromEntries(
                getAvailableLanguages().map(language => [language.code, language.name])
              ),
              onChange: changeInterfaceLanguage,
            },
            {
              desc: t("settings.translationTargetLanguage.label"),
              key: "translate:target-language",
              info: t("settings.translationTargetLanguage.desc"),
              type: ConfigSelection,
              presentation: "select",
              options: {
                auto: t("settings.translationTargetLanguage.options.auto"),
                ...Object.fromEntries(
                  getAvailableLanguages().map(language => [language.code, language.name])
                ),
              },
              onChange: saveSettingsTranslationTargetLanguage,
            },
          ],
        })
      ),
      // 데스크탑 오버레이 섹션
      react.createElement(
        SettingsSection,
        {
          sectionKey: "overlay-enabled",
          title: t("sections.desktopOverlay"),
          subtitle: t("sections.desktopOverlaySubtitle"),
        },
        react.createElement(OverlaySettings)
      )
    );

  const renderPerformanceTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "performance" ? "active" : ""}`,
        "data-tab-id": "performance",
      },
      react.createElement(SettingsLoadMeter, {
        costKeys: [
          "karaoke-bounce", "karaoke-line-transition", "karaoke-text-effects",
          "fade-blur", "highlight-mode", "text-shadow-enabled", "video-background",
        ],
        frameKey: "performance-frame-rate",
      }),
      ...getPerformanceSettingsSections().map((section) =>
        react.createElement(
          SettingsSection,
          {
            key: section.sectionKey,
            sectionKey: section.sectionKey,
            title: t(section.titleKey),
            subtitle: t(section.subtitleKey),
          },
          react.createElement(OptionList, {
            items: section.items.map((item) => item.key === "video-background-settings"
              ? { ...item, onChange: () => navigateToDestination("appearance", "video-background") }
              : item),
            onChange: handlePerformanceSettingChange,
          })
        )
      )
    );

  const renderLyricsTab = () => {
    const renderLyricsPlaybackSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "playback",
          sectionKey: "playback",
          title: t("settingsAdvanced.playback.title"),
          subtitle: t("settingsAdvanced.playback.subtitle"),
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settingsAdvanced.playback.replaceButton.label"),
              key: "playbar-button",
              info: t("settingsAdvanced.playback.replaceButton.info") || "Replaces Spotify's default lyrics button with ivLyrics",
              type: ConfigSlider,
            },
            {
              desc: t("settingsAdvanced.playback.replaceFullscreenButton.label"),
              key: "fullscreen-button",
              info: t("settingsAdvanced.playback.replaceFullscreenButton.info") || "Replaces Spotify's default fullscreen button with ivLyrics fullscreen",
              type: ConfigSlider,
            },
            {
              desc: t("settingsAdvanced.playback.quickSyncControls.label"),
              key: "quick-sync-controls-enabled",
              info: t("settingsAdvanced.playback.quickSyncControls.info"),
              type: ConfigSlider,
              defaultValue: getVisualSettings()["quick-sync-controls-enabled"] ?? true,
            },
            {
              desc: t("settingsAdvanced.playback.seekFadeCompensation.label"),
              key: "seek-fade-compensation",
              info: t("settingsAdvanced.playback.seekFadeCompensation.info"),
              type: ConfigSlider,
              defaultValue: getVisualSettings()["seek-fade-compensation"] === true,
            },
          ],
          onChange: handleVisualConfigChange,
        })
      ),
    ];
    const syncCreatorHotkeyRows = [
      ["charForward", "syncCreator.shortcuts.charForward", "Advance one character"],
      ["charBack", "syncCreator.shortcuts.charBack", "Revert one character"],
      ["wordForward", "syncCreator.shortcuts.wordForward", "Advance one word"],
      ["wordBack", "syncCreator.shortcuts.wordBack", "Revert one word"],
      ["syllable", "syncCreator.shortcuts.syllable", "Advance one syllable"],
      ["drag", "syncCreator.shortcuts.drag", "Hold to drag"],
      ["lastCharEnd", "syncCreator.lastCharEnd.markNow", "End now"],
    ].map(([action, labelKey, fallbackLabel]) => ({
      ...getSyncCreatorShortcutRow(action, getVisualSettings()),
      label: getSettingsText(labelKey, fallbackLabel),
    }));
    const syncCreatorHotkeyColumns = [
      getSettingsText("settings.shortcuts.primary", "Primary"),
      getSettingsText("settings.shortcuts.secondary", "Secondary"),
    ];
    const renderLyricsSyncControlsSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "sync-creator-settings",
          sectionKey: "sync-creator-settings",
          title: getSettingsText("settings.syncCreatorSettings.title", "Sync Creator Settings"),
          subtitle: getSettingsText("settings.syncCreatorSettings.subtitle", "Configure Sync Creator keyboard behavior and recording shortcuts."),
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: getSettingsText("settings.syncCreatorSettings.autoBoundaryChars.label", "Auto-handle spaces and punctuation"),
              info: getSettingsText("settings.syncCreatorSettings.autoBoundaryChars.desc", "When using keyboard sync, automatically include nearby spaces and punctuation. Turn this off to time those characters manually."),
              key: SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY,
              type: ConfigSlider,
              defaultValue: getVisualSettings()[SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY] ?? SYNC_CREATOR_AUTO_BOUNDARY_CHARS_DEFAULT,
            },
            {
              desc: getSettingsText("settings.syncCreatorSettings.fillCurve.label", "Karaoke fill correction curve"),
              info: getSettingsText("settings.syncCreatorSettings.fillCurve.desc", "Drag the three middle points to adjust how word and character fill progresses during karaoke playback. The default diagonal line keeps the current timing."),
              key: "karaoke-fill-correction-curve",
              type: ConfigKaraokeFillCurveEditor,
              defaultValue: getVisualSettings()["karaoke-fill-correction-curve"],
            },
          ],
          onChange: handleVisualConfigChange,
        }),
        react.createElement(SettingsHotkeyTable, {
          rows: syncCreatorHotkeyRows,
          columns: syncCreatorHotkeyColumns,
          onChange: handleVisualConfigChange,
          settingsRegistryItems: syncCreatorHotkeyRows.flatMap((row) =>
            row.items.map((item, index) => ({
              item: {
                ...item,
                desc: `${row.label} (${syncCreatorHotkeyColumns[index]})`,
                type: ConfigHotkey,
              },
              onChange: handleVisualConfigChange,
            }))
          ),
        })
      ),
    ];
    const renderLyricsLanguageSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "karaoke-mode",
          sectionKey: "karaoke-mode",
          title: t("settingsAdvanced.karaokeMode.title"),
          subtitle: t("settingsAdvanced.karaokeMode.subtitle"),
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settingsAdvanced.karaokeMode.enabled.label"),
              info: t("settingsAdvanced.karaokeMode.enabled.desc"),
              key: "karaoke-mode-enabled",
              type: ConfigSlider,
            },
            {
              desc: t("settingsAdvanced.karaokeMode.motionStyle.label"),
              info: t("settingsAdvanced.karaokeMode.motionStyle.desc"),
              key: "karaoke-motion-style",
              type: ConfigSelection,
              defaultValue: getVisualSettings()["karaoke-motion-style"] === "expressive" ? "expressive" : "classic",
              options: {
                classic: t("settingsAdvanced.karaokeMode.motionStyle.options.classic"),
                expressive: t("settingsAdvanced.karaokeMode.motionStyle.options.expressive"),
              },
              // Expressive motion is a style of the bounce, so it needs the bounce on.
              when: () => getVisualSettings()["karaoke-bounce"] !== false,
            },
            {
              desc: t("settingsAdvanced.karaokeMode.syncedPronunciation.label"),
              info: t("settingsAdvanced.karaokeMode.syncedPronunciation.desc"),
              key: "synced-pronunciation",
              type: ConfigSlider,
            },
            {
              desc: t("settingsAdvanced.karaokeMode.pronunciationFill.label"),
              info: t("settingsAdvanced.karaokeMode.pronunciationFill.desc"),
              key: "pronunciation-karaoke-fill",
              type: ConfigSlider,
              // The fill splits the pronunciation by sung unit.
              when: () => getVisualSettings()["synced-pronunciation"] === true,
            },
            {
              desc: t("settingsAdvanced.karaokeMode.spotifyFakeKaraoke.label"),
              info: t("settingsAdvanced.karaokeMode.spotifyFakeKaraoke.desc"),
              key: "spotify-fake-karaoke-enabled",
              type: ConfigSlider,
            },
            {
              desc: t("settingsAdvanced.karaokeMode.pseudoKaraokeRenderAdvance.label"),
              info: t("settingsAdvanced.karaokeMode.pseudoKaraokeRenderAdvance.desc"),
              key: "pseudo-karaoke-render-advance",
              type: ConfigSliderRange,
              min: 0,
              max: 500,
              step: 10,
              unit: "ms",
              when: () => getVisualSettings()["spotify-fake-karaoke-enabled"] === true,
            },
          ],
          onChange: handleVisualConfigChange,
        })
      ),
    ];
    const renderLyricsCacheSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "cache-management",
          sectionKey: "cache-management",
          title: t("settingsAdvanced.cacheManagement.title"),
          subtitle: t("settingsAdvanced.cacheManagement.subtitle"),
        },
        // 로컬 캐시 관리 (IndexedDB) - 메모리 캐시와 통합됨
        react.createElement(LocalCacheManager)
      ),
    ];
    const renderLyricsHelperSection = () => [
      // 헬퍼 연동 섹션
      react.createElement(
        SettingsSection,
        {
          key: "lyrics-helper",
          sectionKey: "lyrics-helper",
          title: t("settings.lyricsHelper.sectionTitle") || "Helper Integration",
          subtitle: t("settings.lyricsHelper.sectionSubtitle") || "Send lyrics to external helper applications",
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settings.lyricsHelper.label"),
              info: t("settings.lyricsHelper.desc"),
              key: "lyrics-helper-enabled",
              type: LyricsHelperToggle,
              disabled: isFadActive,
            },
            {
              desc: "",
              key: "lyrics-helper-info",
              type: ConfigInfo,
              message: t("settings.lyricsHelper.info") || "Helper app allows external applications to display synced lyrics",
              buttonText: t("settings.lyricsHelper.download") || "Download Helper",
              onButtonClick: openLyricsHelperDownload,
              when: () => !getVisualSettings()["lyrics-helper-enabled"],
            },
          ],
          onChange: saveLyricsHelperSetting,
        })
      ),
    ];

    return react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "lyrics" ? "active" : ""}`,
        "data-tab-id": "lyrics",
      },
      ...renderLyricsPlaybackSection(),
      ...renderLyricsLanguageSection(),
      ...renderLyricsSyncControlsSection(),
      ...renderLyricsCacheSection(),
      ...renderLyricsHelperSection(),
    );
  };

  return { renderGeneralTab, renderPerformanceTab, renderLyricsTab };
}
