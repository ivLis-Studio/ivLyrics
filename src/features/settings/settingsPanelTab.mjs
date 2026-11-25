export function createPanelSettingsTab({
  react, t, activeTab,
  getSettingsText, getVisualSettings, createTextOutlineSettingItems, handleNowPlayingPanelChange,
  controls,
}) {
  const { ConfigFontSelector, ConfigSliderRange, SettingsSection, OptionList, ConfigSlider, SettingsLayerMatrix, ConfigSelection, ConfigColorPicker } = controls;

  const renderNowPlayingTab = () => {
    const panelTitle = getSettingsText("tabs.nowplaying", "Panel Lyrics");
    const panelLayer = (role, labelKey, fallbackLabel, fontKey, fontFallbackLabel, sizeKey, sizeFallback, sizeMin, sizeMax) => ({
      id: role,
      anchor: `panel-${role}-style`,
      label: getSettingsText(labelKey, fallbackLabel),
      groupTitle: panelTitle,
      color: `var(--settings-layer-${role})`,
      items: [
        {
          desc: t(`settingsAdvanced.nowPlayingPanel.${fontKey}.label`) || fontFallbackLabel,
          key: `panel-lyrics-${role}-font`,
          info: t(`settingsAdvanced.nowPlayingPanel.${fontKey}.desc`) || "",
          type: ConfigFontSelector,
        },
        {
          desc: t(`settingsAdvanced.nowPlayingPanel.${sizeKey}.label`) || sizeFallback,
          key: `panel-lyrics-${role}-size`,
          info: t(`settingsAdvanced.nowPlayingPanel.${sizeKey}.desc`) || "",
          type: ConfigSliderRange,
          min: sizeMin,
          max: sizeMax,
          step: 1,
          unit: "px",
        },
        ...createTextOutlineSettingItems(`panel-lyrics-${role}`, {
          labelPrefix: `${t(`settingsAdvanced.nowPlayingPanel.${fontKey}.label`) || fontFallbackLabel} · `,
        }),
      ],
    });
    const panelColumns = [
      {
        id: "base",
        anchor: "panel-base-style",
        label: getSettingsText("misc.default", "Default"),
        groupTitle: panelTitle,
        color: "var(--settings-layer-base)",
        items: [
          {
            desc: t("settingsAdvanced.nowPlayingPanel.fontFamily.label") || "Font Family",
            key: "panel-lyrics-font-family",
            info: t("settingsAdvanced.nowPlayingPanel.fontFamily.desc") || "Font for panel lyrics",
            type: ConfigFontSelector,
          },
          {
            desc: t("settingsAdvanced.nowPlayingPanel.fontScale.label") || "Overall Font Scale",
            key: "panel-font-scale",
            info: t("settingsAdvanced.nowPlayingPanel.fontScale.desc") || "Overall font scale for panel lyrics (50%-200%)",
            type: ConfigSliderRange,
            min: 50,
            max: 200,
            step: 5,
            unit: "%",
          },
        ],
      },
      panelLayer("original", "lyricsCacheEditor.original", "Original", "originalFont", "Original Text Font", "originalSize", "Original Text Size", 10, 30),
      panelLayer("phonetic", "menu.pronunciation", "Pronunciation", "phoneticFont", "Phonetic Text Font", "phoneticSize", "Phonetic Text Size", 8, 24),
      panelLayer("translation", "translationMenu.translation", "Translation", "translationFont", "Translation Text Font", "translationSize", "Translation Text Size", 8, 24),
    ];
    const renderNowPlayingPanelSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "panel-lyrics-general",
          sectionKey: "panel-lyrics-general",
          title: t("settingsAdvanced.nowPlayingPanel.title") || "NowPlaying Panel Lyrics",
          subtitle: t("settingsAdvanced.nowPlayingPanel.subtitle") || "Lyrics display settings for the Now Playing panel",
        },
        react.createElement(
          "div",
          { className: "settings-group settings-matrix-group" },
          react.createElement(OptionList, {
            items: [
              {
                desc: t("settingsAdvanced.nowPlayingPanel.enabled.label") || "Enable Panel Lyrics",
                key: "panel-lyrics-enabled",
                info: t("settingsAdvanced.nowPlayingPanel.enabled.desc") || "Display current lyrics in the Now Playing panel",
                type: ConfigSlider,
              },
            ],
            onChange: handleNowPlayingPanelChange,
          }),
          react.createElement(SettingsLayerMatrix, {
            columns: panelColumns,
            rows: [
              { id: "font", label: t("settingsAdvanced.originalStyle.fontFamily") },
              { id: "size", label: t("settingsAdvanced.originalStyle.fontSize.label") },
              { id: "outlineWidth", label: t("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness" },
              { id: "outlineColor", label: t("settingsAdvanced.textOutline.color.label") || "Text Outline Color" },
            ],
            onChange: handleNowPlayingPanelChange,
            label: t("settingsAdvanced.nowPlayingPanel.title") || "NowPlaying Panel Lyrics",
          })
        )
      ),
    ];
    const renderNowPlayingBackgroundSection = () => [
      // 배경 설정 섹션
      react.createElement(
        SettingsSection,
        {
          key: "panel-background",
          sectionKey: "panel-background",
          title: t("settingsAdvanced.nowPlayingPanel.background.title") || "Background",
          subtitle: t("settingsAdvanced.nowPlayingPanel.background.subtitle") || "Customize the panel background",
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settingsAdvanced.nowPlayingPanel.background.type.label") || "Background Type",
              key: "panel-bg-type",
              info: t("settingsAdvanced.nowPlayingPanel.background.type.desc") || "Choose background style",
              type: ConfigSelection,
              options: {
                "album": t("settingsAdvanced.nowPlayingPanel.background.type.album") || "Album Color",
                "gradient": t("settingsAdvanced.nowPlayingPanel.background.type.gradient") || "Custom Gradient",
                "custom": t("settingsAdvanced.nowPlayingPanel.background.type.custom") || "Solid Color",
                "transparent": t("settingsAdvanced.nowPlayingPanel.background.type.transparent") || "Transparent",
              },
            },
            {
              desc: t("settingsAdvanced.nowPlayingPanel.background.color.label") || "Background Color",
              key: "panel-bg-color",
              info: t("settingsAdvanced.nowPlayingPanel.background.color.desc") || "Custom background color",
              type: ConfigColorPicker,
              when: () => getVisualSettings()["panel-bg-type"] === "custom",
            },
            {
              desc: t("settingsAdvanced.nowPlayingPanel.background.gradient1.label") || "Gradient Color 1",
              key: "panel-bg-gradient-1",
              info: t("settingsAdvanced.nowPlayingPanel.background.gradient1.desc") || "First gradient color",
              type: ConfigColorPicker,
              when: () => getVisualSettings()["panel-bg-type"] === "gradient",
            },
            {
              desc: t("settingsAdvanced.nowPlayingPanel.background.gradient2.label") || "Gradient Color 2",
              key: "panel-bg-gradient-2",
              info: t("settingsAdvanced.nowPlayingPanel.background.gradient2.desc") || "Second gradient color",
              type: ConfigColorPicker,
              when: () => getVisualSettings()["panel-bg-type"] === "gradient",
            },
            {
              desc: t("settingsAdvanced.nowPlayingPanel.background.opacity.label") || "Background Opacity",
              key: "panel-bg-opacity",
              info: t("settingsAdvanced.nowPlayingPanel.background.opacity.desc") || "Background transparency (0-100%)",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
              when: () => getVisualSettings()["panel-bg-type"] !== "transparent",
            },
          ],
          onChange: handleNowPlayingPanelChange,
        })
      ),
    ];
    const renderNowPlayingBorderSection = () => [
      // Border 설정 섹션
      react.createElement(
        SettingsSection,
        {
          key: "panel-border",
          sectionKey: "panel-border",
          title: t("settingsAdvanced.nowPlayingPanel.border.title") || "Border",
          subtitle: t("settingsAdvanced.nowPlayingPanel.border.subtitle") || "Customize the panel border",
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settingsAdvanced.nowPlayingPanel.border.enabled.label") || "Enable Border",
              key: "panel-border-enabled",
              info: t("settingsAdvanced.nowPlayingPanel.border.enabled.desc") || "Show border around the panel",
              type: ConfigSlider,
            },
            {
              desc: t("settingsAdvanced.nowPlayingPanel.border.color.label") || "Border Color",
              key: "panel-border-color",
              info: t("settingsAdvanced.nowPlayingPanel.border.color.desc") || "Border color",
              type: ConfigColorPicker,
              when: () => getVisualSettings()["panel-border-enabled"] === true,
            },
            {
              desc: t("settingsAdvanced.nowPlayingPanel.border.opacity.label") || "Border Opacity",
              key: "panel-border-opacity",
              info: t("settingsAdvanced.nowPlayingPanel.border.opacity.desc") || "Border transparency (0-100%)",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
              when: () => getVisualSettings()["panel-border-enabled"] === true,
            },
          ],
          onChange: handleNowPlayingPanelChange,
        })
      ),
    ];

    return react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "nowplaying" ? "active" : ""}`,
        "data-tab-id": "nowplaying",
      },
      ...renderNowPlayingPanelSection(),
      ...renderNowPlayingBackgroundSection(),
      ...renderNowPlayingBorderSection(),
    );
  };

  return { renderNowPlayingTab };
}
