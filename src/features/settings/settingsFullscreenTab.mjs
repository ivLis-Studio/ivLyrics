import {
  getResearchFontSize, RESEARCH_FONT_SIZE_KEY, RESEARCH_FONT_SIZE_MAX, RESEARCH_FONT_SIZE_MIN, RESEARCH_FONT_SIZE_STEP,
} from "../../app/researchReaderSettings.mjs";

export function createFullscreenSettingsTab({
  react, t, activeTab,
  getVisualSettings, fullscreenView, createTextOutlineSettingItems, handleVisualConfigChange, getCdSettingsSections, saveVinylSetting, buildLyricsTypographyColumns, getLyricsTypographyRows,
  controls,
}) {
  const { ConfigSlider, ConfigSliderRange, SettingsTiles, OptionList, SettingsSection, ConfigHotkey, FullscreenPresentationPicker, ConfigSelection, SettingsLayerMatrix, ConfigFontSelector, ConfigColorPicker } = controls;

  const renderFullscreenUiSection = () => {
    const items = [
            {
              desc: t("settingsAdvanced.fullscreenUI.showClock.desc"),
              info: t("settingsAdvanced.fullscreenUI.showClock.info"),
              key: "fullscreen-show-clock",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["fullscreen-show-clock"] ?? true,
            },
            {
              desc: t("settingsAdvanced.fullscreenUI.clockSize.desc"),
              info: t("settingsAdvanced.fullscreenUI.clockSize.info"),
              key: "fullscreen-clock-size",
              type: ConfigSliderRange,
              min: 24,
              max: 72,
              step: 2,
              unit: "px",
              defaultValue: getVisualSettings()["fullscreen-clock-size"] || 48,
              when: () => getVisualSettings()["fullscreen-show-clock"] !== false,
            },
            ...createTextOutlineSettingItems("fullscreen-clock", {
              when: () => getVisualSettings()["fullscreen-show-clock"] !== false,
            }),
            {
              desc: t("settingsAdvanced.fullscreenUI.showContext.desc"),
              info: t("settingsAdvanced.fullscreenUI.showContext.info"),
              key: "fullscreen-show-context",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["fullscreen-show-context"] ?? true,
            },
            {
              desc: t("settingsAdvanced.fullscreenUI.showContextImage.desc"),
              info: t("settingsAdvanced.fullscreenUI.showContextImage.info"),
              key: "fullscreen-show-context-image",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["fullscreen-show-context-image"] ?? true,
              when: () => getVisualSettings()["fullscreen-show-context"] !== false,
            },
            {
              desc: t("settingsAdvanced.fullscreenUI.showNextTrack.desc"),
              info: t("settingsAdvanced.fullscreenUI.showNextTrack.info"),
              key: "fullscreen-show-next-track",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["fullscreen-show-next-track"] ?? true,
            },
            {
              desc: t("settingsAdvanced.fullscreenUI.nextTrackTime.desc"),
              info: t("settingsAdvanced.fullscreenUI.nextTrackTime.info"),
              key: "fullscreen-next-track-seconds",
              type: ConfigSliderRange,
              min: 5,
              max: 30,
              step: 1,
              unit: t("settingsAdvanced.fullscreenUI.nextTrackTime.unit"),
              defaultValue: getVisualSettings()["fullscreen-next-track-seconds"] || 15,
              when: () => getVisualSettings()["fullscreen-show-next-track"] !== false,
            },
            {
              desc: t("settingsAdvanced.fullscreenUI.showLyricsProgress.desc"),
              info: t("settingsAdvanced.fullscreenUI.showLyricsProgress.info"),
              key: "fullscreen-show-lyrics-progress",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["fullscreen-show-lyrics-progress"] ?? false,
            },
            {
              desc: t("settingsAdvanced.fullscreenUI.showQueue.desc"),
              info: t("settingsAdvanced.fullscreenUI.showQueue.info"),
              key: "fullscreen-show-queue",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["fullscreen-show-queue"] ?? true,
            },
          ];
    const itemsByKey = new Map(items.map((item) => [item.key, item]));
    const chip = (key, icon, children) => ({
      item: itemsByKey.get(key),
      icon,
      children: children.map((childKey) => itemsByKey.get(childKey)).filter(Boolean),
    });
    return react.createElement(SettingsTiles, {
      chips: [
        chip("fullscreen-show-clock", "clock", ["fullscreen-clock-size", "fullscreen-clock-outline-width", "fullscreen-clock-outline-color"]),
        chip("fullscreen-show-context", "context", ["fullscreen-show-context-image"]),
        chip("fullscreen-show-next-track", "next", ["fullscreen-next-track-seconds"]),
        chip("fullscreen-show-lyrics-progress", "lprogress", []),
        chip("fullscreen-show-queue", "queue", []),
      ],
      onChange: handleVisualConfigChange,
      settingsRegistryItems: items.map((item) => ({ item, onChange: handleVisualConfigChange })),
    });
  };
  const renderFullscreenStyleSection = () =>
react.createElement(OptionList, {
          items: [
            {
              desc: t("settingsAdvanced.fullscreenStyle.albumSize.desc"),
              info: t("settingsAdvanced.fullscreenStyle.albumSize.info"),
              key: "fullscreen-album-size",
              type: ConfigSliderRange,
              min: 100,
              max: 800,
              step: 10,
              unit: "px",
              defaultValue: getVisualSettings()["fullscreen-album-size"] || 400,
            },
            {
              desc: t("settingsAdvanced.fullscreenStyle.albumRadius.desc"),
              info: t("settingsAdvanced.fullscreenStyle.albumRadius.info"),
              key: "fullscreen-album-radius",
              type: ConfigSliderRange,
              min: 0,
              max: 50,
              step: 1,
              unit: "px",
              defaultValue: getVisualSettings()["fullscreen-album-radius"] || 12,
            },
            {
              desc: t("settingsAdvanced.fullscreenMode.infoGap.desc"),
              info: t("settingsAdvanced.fullscreenMode.infoGap.info"),
              key: "fullscreen-info-gap",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 1,
              unit: "px",
              defaultValue: (getVisualSettings()["fullscreen-info-gap"] !== undefined) ? getVisualSettings()["fullscreen-info-gap"] : 24,
            },
            {
              desc: t("settingsAdvanced.fullscreenStyle.titleFontSize.desc"),
              info: t("settingsAdvanced.fullscreenStyle.titleFontSize.info"),
              key: "fullscreen-title-size",
              type: ConfigSliderRange,
              min: 24,
              max: 72,
              step: 2,
              unit: "px",
              defaultValue: getVisualSettings()["fullscreen-title-size"] || 48,
            },
            ...createTextOutlineSettingItems("fullscreen-title"),
            {
              desc: t("settingsAdvanced.fullscreenStyle.artistFontSize.desc"),
              info: t("settingsAdvanced.fullscreenStyle.artistFontSize.info"),
              key: "fullscreen-artist-size",
              type: ConfigSliderRange,
              min: 14,
              max: 36,
              step: 1,
              unit: "px",
              defaultValue: getVisualSettings()["fullscreen-artist-size"] || 24,
            },
            ...createTextOutlineSettingItems("fullscreen-artist"),
          ],
          onChange: handleVisualConfigChange,
        });
  const renderFullscreenTab = () => {
    // ===== 기본 설정 섹션 =====
    const renderFullscreenBasicSection = () => [
          react.createElement(SettingsSection, {
            key: "fullscreen-mode",
            sectionKey: "fullscreen-mode",
            title: t("settingsAdvanced.fullscreenMode.title"),
            subtitle: t("settingsAdvanced.fullscreenMode.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.playback.fullscreenShortcut.label"),
                info: t("settingsAdvanced.fullscreenMode.shortcut.info"),
                key: "fullscreen-key",
                type: ConfigHotkey,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.browserFullscreen.desc"),
                info: t("settingsAdvanced.fullscreenMode.browserFullscreen.info"),
                key: "fullscreen-browser-fullscreen",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-browser-fullscreen"] ?? false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.pageUiOnly.desc"),
                info: t("settingsAdvanced.fullscreenMode.pageUiOnly.info"),
                key: "fullscreen-page-ui-only",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-page-ui-only"] ?? false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.separateButtons.desc"),
                info: t("settingsAdvanced.fullscreenMode.separateButtons.info"),
                key: "fullscreen-separate-buttons",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-separate-buttons"] ?? false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.hideOverlay.desc"),
                info: t("settingsAdvanced.fullscreenMode.hideOverlay.info"),
                key: "fullscreen-hide-overlay",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-hide-overlay"] ?? true,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.tvMode.desc"),
                info: t("settingsAdvanced.fullscreenMode.tvMode.info"),
                key: "fullscreen-tv-mode",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-tv-mode"] ?? false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.toggleTvModeKey.desc"),
                info: t("settingsAdvanced.fullscreenMode.toggleTvModeKey.info"),
                key: "toggle-tv-mode-key",
                type: ConfigHotkey,
              },
            ],
            onChange: handleVisualConfigChange,
          })
          ),
    ];
    // CD owns its appearance and visualizer controls, independently of LP.
    const renderFullscreenCdSection = () => getCdSettingsSections().map((section) =>
      react.createElement(SettingsSection, {
        key: section.sectionKey, sectionKey: section.sectionKey,
        title: t(section.titleKey), subtitle: t(section.subtitleKey),
        view: "cd", hidden: fullscreenView !== "cd",
      }, react.createElement(OptionList, { items: section.items, onChange: saveVinylSetting }))
    );
    // ===== LP 모드 섹션 =====
    const renderFullscreenVinylSection = () => [
          react.createElement(SettingsSection, {
            key: "vinyl-mode",
            sectionKey: "vinyl-mode",
            title: t("vinyl.mode"),
            subtitle: t("vinyl.settings.subtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
          react.createElement(FullscreenPresentationPicker, {
            defaultValue:
              getVisualSettings()["fullscreen-focus-presentation"] || "vinyl",
            onChange: saveVinylSetting,
          }),
          react.createElement(OptionList, {
            items: [
              {
                desc: t("vinyl.settings.albumClickOpensModeLabel"),
                info: t("vinyl.settings.albumClickOpensModeDesc"),
                key: "fullscreen-album-open-lp",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-album-open-lp"] !== false,
              },
              {
                desc: t("vinyl.settings.albumSizeLabel"),
                info: t("vinyl.settings.albumSizeDesc"),
                key: "fullscreen-vinyl-album-size",
                type: ConfigSliderRange,
                min: 70,
                max: 140,
                step: 5,
                unit: "%",
                defaultValue: getVisualSettings()["fullscreen-vinyl-album-size"] ?? 100,
              },
              {
                desc: t("vinyl.settings.recordSizeLabel"),
                info: t("vinyl.settings.recordSizeDesc"),
                key: "fullscreen-vinyl-record-size",
                type: ConfigSliderRange,
                min: 70,
                max: 140,
                step: 5,
                unit: "%",
                defaultValue: getVisualSettings()["fullscreen-vinyl-record-size"] ?? 100,
              },
              {
                desc: t("vinyl.settings.backgroundBlurLabel"),
                info: t("vinyl.settings.backgroundBlurDesc"),
                key: "fullscreen-vinyl-background-blur",
                type: ConfigSliderRange,
                min: 0,
                max: 100,
                step: 5,
                unit: "px",
                defaultValue: getVisualSettings()["fullscreen-vinyl-background-blur"] ?? 0,
              },
              {
                desc: t("vinyl.settings.animationsLabel"),
                info: t("vinyl.settings.animationsDesc"),
                key: "fullscreen-vinyl-animations",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-vinyl-animations"] !== false,
              },
              {
                desc: t("vinyl.settings.trackChangeAnimationLabel"),
                info: t("vinyl.settings.trackChangeAnimationDesc"),
                key: "fullscreen-vinyl-track-change-animation",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-vinyl-track-change-animation"] !== false,
              },
              {
                desc: t("vinyl.settings.rotationSpeedLabel"),
                info: t("vinyl.settings.rotationSpeedDesc"),
                key: "fullscreen-vinyl-rotation-speed",
                type: ConfigSliderRange,
                min: 25,
                max: 200,
                step: 5,
                unit: "%",
                defaultValue: getVisualSettings()["fullscreen-vinyl-rotation-speed"] ?? 100,
              },
              {
                desc: t("vinyl.settings.centerRotationLabel"),
                info: t("vinyl.settings.centerRotationDesc"),
                key: "fullscreen-vinyl-center-rotation",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-vinyl-center-rotation"] !== false,
              },
              {
                desc: t("vinyl.settings.lyricsLabel"),
                info: t("vinyl.settings.lyricsDesc"),
                key: "fullscreen-vinyl-lyrics-enabled",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-vinyl-lyrics-enabled"] !== false,
              },
              {
                desc: t("vinyl.settings.motionBackgroundLabel"),
                info: t("vinyl.settings.motionBackgroundDesc"),
                key: "fullscreen-motion-background",
                type: ConfigSelection,
                presentation: "seg",
                options: {
                  video: t("vinyl.settings.motionBackgroundVideo"),
                  track: t("vinyl.settings.motionBackgroundTrack"),
                },
                defaultValue: getVisualSettings()["fullscreen-motion-background"] === "track" ? "track" : "video",
              },
              {
                desc: t("vinyl.settings.motionIntensityLabel"),
                info: t("vinyl.settings.motionIntensityDesc"),
                key: "fullscreen-motion-intensity",
                type: ConfigSelection,
                presentation: "seg",
                options: {
                  calm: t("vinyl.settings.motionIntensityCalm"),
                  normal: t("vinyl.settings.motionIntensityNormal"),
                  wild: t("vinyl.settings.motionIntensityWild"),
                },
                defaultValue: ["calm", "wild"].includes(getVisualSettings()["fullscreen-motion-intensity"]) ? getVisualSettings()["fullscreen-motion-intensity"] : "normal",
              },
              {
                desc: t("vinyl.settings.motionRotationLabel"),
                info: t("vinyl.settings.motionRotationDesc"),
                key: "fullscreen-motion-rotation",
                type: ConfigSelection,
                presentation: "seg",
                options: {
                  full: t("vinyl.settings.motionRotationFull"),
                  gentle: t("vinyl.settings.motionRotationGentle"),
                  off: t("vinyl.settings.motionRotationOff"),
                },
                defaultValue: ["gentle", "off"].includes(getVisualSettings()["fullscreen-motion-rotation"]) ? getVisualSettings()["fullscreen-motion-rotation"] : "full",
              },
              {
                desc: t("vinyl.settings.motionSafeLabel"),
                info: t("vinyl.settings.motionSafeDesc"),
                key: "fullscreen-motion-safe",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-motion-safe"] === true,
              },
            ],
            onChange: saveVinylSetting,
          }),

          ),
          react.createElement(SettingsSection, {
            key: "vinyl-tonearm",
            sectionKey: "vinyl-tonearm",
            title: t("vinyl.settings.tonearmTitle"),
            subtitle: t("vinyl.settings.tonearmSubtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("vinyl.settings.tonearmStyleLabel"),
                info: t("vinyl.settings.tonearmStyleDesc"),
                key: "fullscreen-vinyl-tonearm-style",
                type: ConfigSelection,
                options: {
                  s: t("vinyl.settings.tonearmStyleS"),
                  straight: t("vinyl.settings.tonearmStyleStraight"),
                  j: t("vinyl.settings.tonearmStyleJ"),
                  linear: t("vinyl.settings.tonearmStyleLinear"),
                },
                defaultValue: getVisualSettings()["fullscreen-vinyl-tonearm-style"] || "s",
              },
              {
                desc: t("vinyl.settings.tonearmFinishLabel"),
                info: t("vinyl.settings.tonearmFinishDesc"),
                key: "fullscreen-vinyl-tonearm-finish",
                type: ConfigSelection,
                presentation: "seg",
                swatchMap: { white: "#f2f2f2", silver: "#b9bec7", black: "#1d1f24" },
                options: {
                  white: t("vinyl.settings.tonearmFinishWhite"),
                  silver: t("vinyl.settings.tonearmFinishSilver"),
                  black: t("vinyl.settings.tonearmFinishBlack"),
                },
                defaultValue: getVisualSettings()["fullscreen-vinyl-tonearm-finish"] || "white",
              },
              {
                desc: t("vinyl.settings.tonearmSizeLabel"),
                info: t("vinyl.settings.tonearmSizeDesc"),
                key: "fullscreen-vinyl-tonearm-size",
                type: ConfigSliderRange,
                min: 80,
                max: 120,
                step: 5,
                unit: "%",
                defaultValue: getVisualSettings()["fullscreen-vinyl-tonearm-size"] ?? 100,
              },
            ],
            onChange: saveVinylSetting,
          }),

          ),
          react.createElement(SettingsSection, {
            key: "vinyl-typography",
            sectionKey: "vinyl-typography",
            title: t("sections.typography"),
            subtitle: t("vinyl.settings.typographySubtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
          react.createElement(
            "div",
            { className: "settings-group settings-matrix-group" },
            react.createElement(SettingsLayerMatrix, {
              columns: buildLyricsTypographyColumns({ vinyl: true, onChange: saveVinylSetting }),
              rows: getLyricsTypographyRows(),
              onChange: saveVinylSetting,
              label: t("sections.typography"),
            })
          ),

          ),
          react.createElement(SettingsSection, {
            key: "video-stage-typography",
            sectionKey: "video-stage-typography",
            title: t("vinyl.settings.videoStageTypographyTitle"),
            subtitle: t("vinyl.settings.videoStageTypographySubtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.originalStyle.fontFamily"),
                info: t("settingsAdvanced.originalStyle.fontFamilyDesc"),
                key: "fullscreen-video-stage-original-font-family",
                type: ConfigFontSelector,
                defaultValue:
                  getVisualSettings()["fullscreen-video-stage-original-font-family"] ||
                  getVisualSettings()["fullscreen-vinyl-original-font-family"] ||
                  "Pretendard Variable",
              },
              {
                desc: t("settingsAdvanced.pronunciationStyle.title"),
                info: t("settingsAdvanced.pronunciationStyle.fontFamilyDesc"),
                key: "fullscreen-video-stage-phonetic-font-family",
                type: ConfigFontSelector,
                defaultValue:
                  getVisualSettings()["fullscreen-video-stage-phonetic-font-family"] ||
                  getVisualSettings()["fullscreen-vinyl-phonetic-font-family"] ||
                  "Pretendard Variable",
              },
              {
                desc: t("settingsAdvanced.translationStyle.title"),
                info: t("settingsAdvanced.translationStyle.fontFamilyDesc"),
                key: "fullscreen-video-stage-translation-font-family",
                type: ConfigFontSelector,
                defaultValue:
                  getVisualSettings()["fullscreen-video-stage-translation-font-family"] ||
                  getVisualSettings()["fullscreen-vinyl-translation-font-family"] ||
                  "Pretendard Variable",
              },
              {
                desc: t("settings.culturalAnnotations.fontFamily.label"),
                info: t("settings.culturalAnnotations.fontFamily.desc"),
                key: "fullscreen-video-stage-cultural-font-family",
                type: ConfigFontSelector,
                defaultValue:
                  getVisualSettings()["fullscreen-video-stage-cultural-font-family"] ||
                  getVisualSettings()["cultural-annotations-vinyl-font-family"] ||
                  "Pretendard Variable",
              },
              {
                desc: t("vinyl.settings.videoStageBackgroundColorLabel"),
                info: t("vinyl.settings.videoStageBackgroundColorDesc"),
                key: "fullscreen-video-stage-lyric-background-color",
                type: ConfigColorPicker,
                defaultValue:
                  getVisualSettings()["fullscreen-video-stage-lyric-background-color"] ||
                  "#000000",
              },
              {
                desc: t("vinyl.settings.videoStageBackgroundOpacityLabel"),
                info: t("vinyl.settings.videoStageBackgroundOpacityDesc"),
                key: "fullscreen-video-stage-lyric-background-opacity",
                type: ConfigSliderRange,
                min: 0,
                max: 100,
                step: 1,
                unit: "%",
                defaultValue:
                  getVisualSettings()["fullscreen-video-stage-lyric-background-opacity"] ??
                  46,
              },
            ],
            onChange: saveVinylSetting,
          })
          ),
    ];
    // ===== 일반 모드 레이아웃 섹션 =====
    const renderFullscreenNormalLayoutSection = () => [
          react.createElement(SettingsSection, {
            key: "normal-mode",
            sectionKey: "normal-mode",
            title: t("settingsAdvanced.normalMode.title"),
            subtitle: t("settingsAdvanced.normalMode.subtitle"),
            view: "normal",
            hidden: fullscreenView !== "normal",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.fullscreenMode.twoColumnLayout.desc"),
                info: t("settingsAdvanced.fullscreenMode.splitView.info"),
                key: "fullscreen-two-column",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-two-column"] ?? true,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.invertPosition.desc"),
                info: t("settingsAdvanced.fullscreenMode.invertPosition.info"),
                key: "fullscreen-layout-reverse",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-layout-reverse"] ?? false,
                when: () => getVisualSettings()["fullscreen-two-column"] !== false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.showAlbumArt.desc"),
                info: t("settingsAdvanced.fullscreenMode.showAlbumArt.info"),
                key: "fullscreen-show-album",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-show-album"] ?? true,
                when: () => getVisualSettings()["fullscreen-two-column"] !== false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.showTrackInfo.desc"),
                info: t("settingsAdvanced.fullscreenMode.showTrackInfo.info"),
                key: "fullscreen-show-info",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-show-info"] ?? true,
                when: () => getVisualSettings()["fullscreen-two-column"] !== false,
              },
              {
                desc: t("settingsAdvanced.normalMode.showAlbumName.desc"),
                info: t("settingsAdvanced.normalMode.showAlbumName.info"),
                key: "fullscreen-show-album-name",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-show-album-name"] ?? false,
                when: () => getVisualSettings()["fullscreen-two-column"] !== false && getVisualSettings()["fullscreen-show-info"] !== false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.centerWhenNoLyrics.desc"),
                info: t("settingsAdvanced.fullscreenMode.centerWhenNoLyrics.info"),
                key: "fullscreen-center-when-no-lyrics",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-center-when-no-lyrics"] ?? true,
              },
            ],
            onChange: handleVisualConfigChange,
          })
          ),
    ];
    // ===== TV 모드 섹션 =====
    const renderFullscreenTvModeSection = () => [
          react.createElement(SettingsSection, {
            key: "tv-mode",
            sectionKey: "tv-mode",
            title: t("settingsAdvanced.tvMode.title"),
            subtitle: t("settingsAdvanced.tvMode.subtitle"),
            view: "tv",
            hidden: fullscreenView !== "tv",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.fullscreenMode.tvModeAlbumSize.desc"),
                info: t("settingsAdvanced.fullscreenMode.tvModeAlbumSize.info"),
                key: "fullscreen-tv-album-size",
                type: ConfigSliderRange,
                min: 80,
                max: 200,
                step: 10,
                unit: "px",
                defaultValue: getVisualSettings()["fullscreen-tv-album-size"] || 140,
              },
              {
                desc: t("settingsAdvanced.tvMode.showAlbumName.desc"),
                info: t("settingsAdvanced.tvMode.showAlbumName.info"),
                key: "fullscreen-tv-show-album-name",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-tv-show-album-name"] ?? true,
              },
              {
                desc: t("settingsAdvanced.tvMode.showControls.desc"),
                info: t("settingsAdvanced.tvMode.showControls.info"),
                key: "fullscreen-tv-show-controls",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-tv-show-controls"] ?? false,
              },
              {
                desc: t("settingsAdvanced.tvMode.showProgress.desc"),
                info: t("settingsAdvanced.tvMode.showProgress.info"),
                key: "fullscreen-tv-show-progress",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-tv-show-progress"] ?? false,
              },
            ],
            onChange: handleVisualConfigChange,
          })
          ),
    ];
    // ===== 제목/아티스트 설정 섹션 =====
    const renderFullscreenTitleArtistSection = () => [
          react.createElement(SettingsSection, {
            key: "metadata-display",
            sectionKey: "metadata-display",
            title: t("settingsAdvanced.metadataDisplay.title"),
            subtitle: t("settingsAdvanced.metadataDisplay.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.fullscreenMode.trimTitle.desc"),
                info: t("settingsAdvanced.fullscreenMode.trimTitle.info"),
                key: "fullscreen-trim-title",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-trim-title"] ?? false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.translateMetadata.desc"),
                info: t("settingsAdvanced.fullscreenMode.translateMetadata.info"),
                key: "translate-metadata",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["translate-metadata"] ?? false,
              },
              {
                desc: t("settingsAdvanced.fullscreenMode.translateMetadataMode.desc"),
                info: t("settingsAdvanced.fullscreenMode.translateMetadataMode.info"),
                key: "translate-metadata-mode",
                type: ConfigSelection,
                options: {
                  "translated": t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.translated"),
                  "romanized": t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.romanized"),
                  "original-translated": t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.originalTranslated"),
                  "original-romanized": t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.originalRomanized"),
                  "all": t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.all")
                },
                defaultValue: getVisualSettings()["translate-metadata-mode"] || "translated",
                when: () => getVisualSettings()["translate-metadata"] === true,
              },
            ],
            onChange: handleVisualConfigChange,
          }),
          ),
          react.createElement(SettingsSection, {
            key: "fullscreen-style",
            sectionKey: "fullscreen-style",
            title: t("settingsAdvanced.fullscreenStyle.title"),
            subtitle: t("settingsAdvanced.fullscreenStyle.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          renderFullscreenStyleSection(),
          ),
          react.createElement(SettingsSection, {
            key: "fullscreen-ui",
            sectionKey: "fullscreen-ui",
            title: t("settingsAdvanced.fullscreenUI.title"),
            subtitle: t("settingsAdvanced.fullscreenUI.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          renderFullscreenUiSection(),
          ),
          react.createElement(SettingsSection, {
            key: "controller-style",
            sectionKey: "controller-style",
            title: t("settingsAdvanced.controllerStyle.title"),
            subtitle: t("settingsAdvanced.controllerStyle.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.fullscreenUI.showControls.desc"),
                info: t("settingsAdvanced.fullscreenUI.showControls.info"),
                key: "fullscreen-show-controls",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-show-controls"] ?? true,
              },
              {
                desc: t("settingsAdvanced.fullscreenUI.showVolume.desc"),
                info: t("settingsAdvanced.fullscreenUI.showVolume.info"),
                key: "fullscreen-show-volume",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-show-volume"] ?? true,
                when: () => getVisualSettings()["fullscreen-show-controls"] !== false,
              },
              {
                desc: t("settingsAdvanced.fullscreenUI.showProgressBar.desc"),
                info: t("settingsAdvanced.fullscreenUI.showProgressBar.info"),
                key: "fullscreen-show-progress",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-show-progress"] ?? true,
                when: () => getVisualSettings()["fullscreen-show-controls"] !== false,
              },
              {
                desc: t("settingsAdvanced.controllerStyle.buttonSize.desc"),
                info: t("settingsAdvanced.controllerStyle.buttonSize.info"),
                key: "fullscreen-control-button-size",
                type: ConfigSliderRange,
                min: 28,
                max: 48,
                step: 2,
                unit: "px",
                defaultValue: getVisualSettings()["fullscreen-control-button-size"] || 36,
              },
              {
                desc: t("settingsAdvanced.controllerStyle.background.desc"),
                info: t("settingsAdvanced.controllerStyle.background.info"),
                key: "fullscreen-controls-background",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-controls-background"] ?? false,
              },
            ],
            onChange: handleVisualConfigChange,
          }),
          ),
          react.createElement(SettingsSection, {
            key: "auto-hide",
            sectionKey: "auto-hide",
            title: t("settingsAdvanced.autoHide.title"),
            subtitle: t("settingsAdvanced.autoHide.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.autoHide.enabled.desc"),
                info: t("settingsAdvanced.autoHide.enabled.info"),
                key: "fullscreen-auto-hide-ui",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["fullscreen-auto-hide-ui"] ?? true,
              },
              {
                desc: t("settingsAdvanced.autoHide.delay.desc"),
                info: t("settingsAdvanced.autoHide.delay.info"),
                key: "fullscreen-auto-hide-delay",
                type: ConfigSliderRange,
                min: 1,
                max: 10,
                step: 0.5,
                unit: t("settingsAdvanced.fullscreenUI.nextTrackTime.unit"),
                defaultValue: getVisualSettings()["fullscreen-auto-hide-delay"] || 3,
                when: () => getVisualSettings()["fullscreen-auto-hide-ui"] !== false,
              },
            ],
            onChange: handleVisualConfigChange,
          }),
          ),
          react.createElement(SettingsSection, {
            key: "tmi-style",
            sectionKey: "tmi-style",
            title: t("settingsAdvanced.tmiStyle.title"),
            subtitle: t("settingsAdvanced.tmiStyle.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.tmiStyle.fontSize.desc"),
                info: t("settingsAdvanced.tmiStyle.fontSize.info"),
                key: RESEARCH_FONT_SIZE_KEY,
                type: ConfigSliderRange,
                min: RESEARCH_FONT_SIZE_MIN,
                max: RESEARCH_FONT_SIZE_MAX,
                step: RESEARCH_FONT_SIZE_STEP,
                unit: "%",
                defaultValue: getResearchFontSize(getVisualSettings()),
              },
              ...createTextOutlineSettingItems("fullscreen-tmi"),
            ],
            onChange: handleVisualConfigChange,
          })
          ),
    ];

    return react.createElement(
      "div",
        {
          className: `tab-content ${activeTab === "fullscreen" ? "active" : ""}`,
          "data-tab-id": "fullscreen",
        },
      ...renderFullscreenBasicSection(),
      ...renderFullscreenTitleArtistSection(),
      ...renderFullscreenNormalLayoutSection(),
      ...renderFullscreenTvModeSection(),
      ...renderFullscreenCdSection(),
      ...renderFullscreenVinylSection(),
    );
  };

  return { renderFullscreenTab };
}
