export function createAppearanceSettingsTab({
  react, t, activeTab,
  getVisualSettings, getInstrumentalBreakLabelStyleDefault, createTextOutlineSettingItems, saveInstrumentalLabelSetting, getMultiVocalRegistryItems, getBackgroundRegistryItems, getSettingsText, buildLyricsTypographyColumns, saveLyricsTypographySetting, handleAppearancePreviewChange, getLyricsTypographyRows, handleVisualConfigChange, isFadActive,
  controls,
}) {
  const { OptionList, ConfigSlider, ConfigInstrumentalBreakIconPicker, ConfigFontSelector, ConfigSliderRange, ConfigFontWeightSlider, ConfigColorPicker, SettingsSection, SettingsUiIcon, BackgroundExperienceSection, SettingsLayerMatrix, ConfigSelection, SettingsLineWindow, ConfigMultiVocalColorSettings } = controls;

  const renderAppearanceInstrumentalBreakSection = () =>
react.createElement(OptionList, {
          items: [
            {
              desc: t("settingsAdvanced.instrumentalBreak.autoDetect.label") || "Auto-detect instrumental gaps",
              key: "instrumental-break-auto-detect",
              info: t("settingsAdvanced.instrumentalBreak.autoDetect.desc") || "After a karaoke lyric line finishes, show an instrumental marker for a long gap before the next line.",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["instrumental-break-auto-detect"] ?? true,
            },
            {
              desc: t("settingsAdvanced.instrumentalBreak.keepPreviousLyrics.label"),
              key: "instrumental-break-keep-previous",
              info: t("settingsAdvanced.instrumentalBreak.keepPreviousLyrics.desc"),
              type: ConfigSlider,
              defaultValue: getVisualSettings()["instrumental-break-keep-previous"] ?? false,
            },
            {
              desc: t("settingsAdvanced.instrumentalBreak.icon.label") || "Icon Design",
              key: "instrumental-break-icon",
              info: t("settingsAdvanced.instrumentalBreak.icon.desc") || "Choose the animation shown for instrumental gaps longer than 0.5 seconds",
              type: ConfigInstrumentalBreakIconPicker,
              options: {
                equalizer: t("settingsAdvanced.instrumentalBreak.icon.options.equalizer") || "01 Equalizer",
                dotWave: t("settingsAdvanced.instrumentalBreak.icon.options.dotWave") || "02 Dot Wave",
                ripples: t("settingsAdvanced.instrumentalBreak.icon.options.ripples") || "03 Ripples",
                orbit: t("settingsAdvanced.instrumentalBreak.icon.options.orbit") || "04 Orbit",
                diamonds: t("settingsAdvanced.instrumentalBreak.icon.options.diamonds") || "05 Diamonds",
                scan: t("settingsAdvanced.instrumentalBreak.icon.options.scan") || "06 Scan",
                arcs: t("settingsAdvanced.instrumentalBreak.icon.options.arcs") || "07 Arcs",
                signal: t("settingsAdvanced.instrumentalBreak.icon.options.signal") || "08 Signal",
                pulseDot: t("settingsAdvanced.instrumentalBreak.icon.options.pulseDot") || "09 Pulse Dot",
                stack: t("settingsAdvanced.instrumentalBreak.icon.options.stack") || "10 Stack",
                spark: t("settingsAdvanced.instrumentalBreak.icon.options.spark") || "11 Spark",
                splitBars: t("settingsAdvanced.instrumentalBreak.icon.options.splitBars") || "12 Split Bars",
                metronome: t("settingsAdvanced.instrumentalBreak.icon.options.metronome") || "13 Metronome",
                vinyl: t("settingsAdvanced.instrumentalBreak.icon.options.vinyl") || "14 Vinyl",
                beat: t("settingsAdvanced.instrumentalBreak.icon.options.beat") || "15 Beat",
                reels: t("settingsAdvanced.instrumentalBreak.icon.options.reels") || "16 Reels",
                triangle: t("settingsAdvanced.instrumentalBreak.icon.options.triangle") || "17 Triangle",
                morph: t("settingsAdvanced.instrumentalBreak.icon.options.morph") || "18 Morph",
                strings: t("settingsAdvanced.instrumentalBreak.icon.options.strings") || "19 Strings",
                piano: t("settingsAdvanced.instrumentalBreak.icon.options.piano") || "20 Piano",
                bloom: t("settingsAdvanced.instrumentalBreak.icon.options.bloom") || "21 Bloom",
                speaker: t("settingsAdvanced.instrumentalBreak.icon.options.speaker") || "22 Speaker",
                crossfade: t("settingsAdvanced.instrumentalBreak.icon.options.crossfade") || "23 Crossfade",
              },
            },
            {
              desc: t("settingsAdvanced.instrumentalBreak.showLabel.label") || "Show Text Label",
              key: "instrumental-break-show-label",
              info: t("settingsAdvanced.instrumentalBreak.showLabel.desc") || "Show Intro, Break, or Outro next to the icon based on lyric position",
              type: ConfigSlider,
            },
            {
              desc: t("settingsAdvanced.instrumentalBreak.labelStyle.fontFamily.label") || "Text Label Font",
              key: "instrumental-break-label-font-family",
              info: t("settingsAdvanced.instrumentalBreak.labelStyle.fontFamily.desc") || "Select the font for the Intro, Break, or Outro label",
              type: ConfigFontSelector,
              defaultValue: getInstrumentalBreakLabelStyleDefault("font-family", "original-font-family", "Pretendard Variable"),
              when: () => getVisualSettings()["instrumental-break-show-label"] === true,
            },
            {
              desc: t("settingsAdvanced.instrumentalBreak.labelStyle.fontSize.label") || "Text Label Size",
              key: "instrumental-break-label-font-size",
              info: t("settingsAdvanced.instrumentalBreak.labelStyle.fontSize.desc") || "Font size for the text label",
              type: ConfigSliderRange,
              min: 12,
              max: 128,
              step: 2,
              unit: "px",
              defaultValue: getInstrumentalBreakLabelStyleDefault("font-size", null, 20),
              when: () => getVisualSettings()["instrumental-break-show-label"] === true,
            },
            {
              desc: t("settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.label") || "Text Label Weight",
              key: "instrumental-break-label-font-weight",
              info: t("settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.desc") || "Font weight for the text label",
              type: ConfigFontWeightSlider,
              defaultValue: getInstrumentalBreakLabelStyleDefault("font-weight", null, 200),
              when: () => getVisualSettings()["instrumental-break-show-label"] === true,
            },
            {
              desc: t("settingsAdvanced.instrumentalBreak.labelStyle.opacity.label") || "Text Label Opacity",
              key: "instrumental-break-label-opacity",
              info: t("settingsAdvanced.instrumentalBreak.labelStyle.opacity.desc") || "Opacity for the text label",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
              defaultValue: getInstrumentalBreakLabelStyleDefault("opacity", null, 65),
              when: () => getVisualSettings()["instrumental-break-show-label"] === true,
            },
            ...createTextOutlineSettingItems("instrumental-break-label", {
              when: () => getVisualSettings()["instrumental-break-show-label"] === true,
            }),
            {
              desc: t("settingsAdvanced.instrumentalBreak.speed.label") || "Animation Speed",
              key: "instrumental-break-animation-speed",
              info: t("settingsAdvanced.instrumentalBreak.speed.desc") || "Adjust the animation speed for the instrumental marker",
              type: ConfigSliderRange,
              min: 50,
              max: 200,
              step: 5,
              unit: "%",
            },
          ],
          onChange: saveInstrumentalLabelSetting,
        });

  const renderAppearanceTab = () => {
    const renderAppearanceVisualEffectsSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "background-experience",
          sectionKey: "background-experience",
          title: t("sections.visualEffects"),
          subtitle: t("sections.visualEffectsSubtitle"),
        },
        isFadActive &&
          react.createElement(
            "div",
            { className: "settings-note is-info", "data-section-content": "true" },
            react.createElement(SettingsUiIcon, { name: "info", size: 16 }),
            react.createElement(
              "div",
              { className: "settings-note-body" },
              react.createElement("b", null, t("sections.fadWarningTitle")),
              " ",
              t("sections.fadWarningDesc"),
              react.createElement("br"),
              t("sections.fadWarningTip")
            )
          ),
        react.createElement(BackgroundExperienceSection, {
          isFadActive,
          settingsRegistryItems: getBackgroundRegistryItems,
        })
      ),
    ];
    const renderAppearanceLyricLayersSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "lyric-layers",
          sectionKey: "lyric-layers",
          title: getSettingsText("settingsUi.sections.lyricLayers.title", "Lyric layers"),
          subtitle: getSettingsText(
            "settingsUi.sections.lyricLayers.subtitle",
            "Compare and adjust the original, pronunciation, translation and furigana fonts in one place."
          ),
        },
        react.createElement(
          "div",
          { className: "settings-group settings-matrix-group" },
          react.createElement(SettingsLayerMatrix, {
            columns: buildLyricsTypographyColumns({
              onChange: saveLyricsTypographySetting,
              furiganaOnChange: handleAppearancePreviewChange,
            }),
            rows: getLyricsTypographyRows(),
            onChange: saveLyricsTypographySetting,
            label: getSettingsText("settingsUi.sections.lyricLayers.title", "Lyric layers"),
          })
        )
      ),
    ];
    const renderAppearanceSyncModeSection = () => {
      const lineWindowItems = [
        {
          desc: t("settingsAdvanced.syncMode.linesBefore.label"),
          key: "lines-before",
          info: t("settingsAdvanced.syncMode.linesBefore.desc"),
          type: ConfigSelection,
          options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
        {
          desc: t("settingsAdvanced.syncMode.linesAfter.label"),
          key: "lines-after",
          info: t("settingsAdvanced.syncMode.linesAfter.desc"),
          type: ConfigSelection,
          options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
      ];
      return [
        react.createElement(
          SettingsSection,
          {
            key: "sync-mode",
            sectionKey: "sync-mode",
            title: t("settingsAdvanced.syncMode.title"),
            subtitle: t("settingsAdvanced.syncMode.subtitle"),
          },
          react.createElement(
            "div",
            { className: "settings-group" },
            react.createElement(SettingsLineWindow, {
              items: lineWindowItems,
              onChange: handleVisualConfigChange,
              settingsRegistryItems: lineWindowItems.map((item) => ({ item, onChange: handleVisualConfigChange })),
            })
          ),
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.syncMode.anchorPosition.label"),
                key: "lyrics-anchor-position",
                info: t("settingsAdvanced.syncMode.anchorPosition.desc"),
                type: ConfigSliderRange,
                min: 20,
                max: 80,
                step: 5,
                unit: "%",
              },
              {
                desc: t("settingsAdvanced.syncMode.highlightIntensity.label"),
                key: "highlight-intensity",
                info: t("settingsAdvanced.syncMode.highlightIntensity.desc"),
                type: ConfigSliderRange,
                min: 30,
                max: 90,
                step: 5,
                unit: "%",
                when: () => getVisualSettings()["highlight-mode"] === true,
              },
            ],
            onChange: handleVisualConfigChange,
          })
        ),
      ];
    };
    const renderAppearanceMultiVocalSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "multi-vocal-colors",
          sectionKey: "multi-vocal-colors",
          title: t("settingsAdvanced.multiVocalColors.title") || "Multi-vocal Colors",
          subtitle: t("settingsAdvanced.multiVocalColors.subtitle") || "Customize male, female, and duet speaker colors.",
        },
        react.createElement(
          "div",
          { className: "settings-group" },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.multiVocalColors.useCreatorColors.label") || "Use sync creator custom colors",
                key: "sync-data-custom-speaker-colors-enabled",
                info: t("settingsAdvanced.multiVocalColors.useCreatorColors.desc") || "Use custom speaker colors embedded by sync creators. When disabled, CUSTOM speakers use the fallback selected by the sync creator.",
                type: ConfigSlider,
                defaultValue: getVisualSettings()["sync-data-custom-speaker-colors-enabled"] ?? true,
              },
            ],
            onChange: handleVisualConfigChange,
          }),
          react.createElement(ConfigMultiVocalColorSettings, {
            settingsRegistryItems: getMultiVocalRegistryItems,
          })
        )
      ),
    ];
    const renderAppearanceInstrumentalSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "instrumental-break",
          sectionKey: "instrumental-break",
          title: t("settingsAdvanced.instrumentalBreak.title") || "Instrumental Marker",
          subtitle: t("settingsAdvanced.instrumentalBreak.subtitle") || "Replace long blank or note-only lyric gaps with an icon",
        },
        renderAppearanceInstrumentalBreakSection()
      ),
    ];
    const renderAppearanceTextShadowSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "text-shadow",
          sectionKey: "text-shadow",
          title: t("settingsAdvanced.textShadow.title"),
          subtitle: t("settingsAdvanced.textShadow.subtitle"),
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settingsAdvanced.textShadow.color.label"),
              info: t("settingsAdvanced.textShadow.color.desc"),
              key: "text-shadow-color",
              type: ConfigColorPicker,
            },
            {
              desc: t("settingsAdvanced.textShadow.opacity.label"),
              info: t("settingsAdvanced.textShadow.opacity.desc"),
              key: "text-shadow-opacity",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
            },
            {
              desc: t("settingsAdvanced.textShadow.blur.label"),
              info: t("settingsAdvanced.textShadow.blur.desc"),
              key: "text-shadow-blur",
              type: ConfigSliderRange,
              min: 0,
              max: 10,
              step: 1,
              unit: "px",
            },
          ],
          onChange: handleAppearancePreviewChange,
        })
      ),
    ];

    return react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "appearance" ? "active" : ""}`,
        "data-tab-id": "appearance",
      },
      ...renderAppearanceVisualEffectsSection(),
      ...renderAppearanceLyricLayersSection(),
      ...renderAppearanceTextShadowSection(),
      ...renderAppearanceSyncModeSection(),
      ...renderAppearanceMultiVocalSection(),
      ...renderAppearanceInstrumentalSection(),
    );
  };

  return { renderAppearanceTab };
}
