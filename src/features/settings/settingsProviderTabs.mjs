export function createProviderSettingsTabs({
  react, t, activeTab,
  getSettingsText, getVisualSettings, createTextOutlineSettingItems, handleCulturalSettingChange,
  controls,
}) {
  const { LyricsProvidersTab, ConfigFontSelector, ConfigSliderRange, ConfigFontWeightSlider, SettingsLayerMatrix, AIProvidersTab, SettingsSection, SettingsUiIcon, DebugInfoPanel, OptionList, ConfigSlider } = controls;

  const renderLyricsProvidersTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "lyrics-providers" ? "active" : ""}`,
        "data-tab-id": "lyrics-providers",
      },
      react.createElement(LyricsProvidersTab)
    );

  const renderCulturalAnnotationsSection = () => {
    const vinylModeLabel = t("vinyl.mode") || "LP";
    const columns = [
      {
        id: "normal",
        anchor: "cultural-annotations-normal-style",
        label: getSettingsText("settingsUi.fullscreenViews.normal", "Normal mode"),
        color: "var(--settings-layer-translation)",
        items: [
          {
            desc: t("settings.culturalAnnotations.fontFamily.label"),
            key: "cultural-annotations-font-family",
            info: t("settings.culturalAnnotations.fontFamily.desc"),
            type: ConfigFontSelector,
            defaultValue: getVisualSettings()["cultural-annotations-font-family"] || "Pretendard Variable",
          },
          {
            desc: t("settings.culturalAnnotations.fontSize.label"),
            key: "cultural-annotations-font-size",
            info: t("settings.culturalAnnotations.fontSize.desc"),
            type: ConfigSliderRange,
            min: 12,
            max: 48,
            step: 1,
            unit: "px",
          },
          {
            desc: t("settings.culturalAnnotations.fontWeight.label"),
            key: "cultural-annotations-font-weight",
            info: t("settings.culturalAnnotations.fontWeight.desc"),
            type: ConfigFontWeightSlider,
          },
          {
            desc: t("settings.culturalAnnotations.opacity.label"),
            key: "cultural-annotations-opacity",
            info: t("settings.culturalAnnotations.opacity.desc"),
            type: ConfigSliderRange,
            min: 20,
            max: 100,
            step: 1,
            unit: "%",
          },
          ...createTextOutlineSettingItems("cultural-annotations"),
        ],
      },
      {
        id: "vinyl",
        anchor: "cultural-annotations-vinyl-style",
        label: vinylModeLabel,
        color: "var(--settings-layer-base)",
        items: [
          {
            desc: `${vinylModeLabel} · ${t("settings.culturalAnnotations.fontFamily.label")}`,
            key: "cultural-annotations-vinyl-font-family",
            info: `${vinylModeLabel}: ${t("settings.culturalAnnotations.fontFamily.desc")}`,
            type: ConfigFontSelector,
            defaultValue: getVisualSettings()["cultural-annotations-vinyl-font-family"] || "Pretendard Variable",
          },
          {
            desc: `${vinylModeLabel} · ${t("settings.culturalAnnotations.fontSize.label")}`,
            key: "cultural-annotations-vinyl-font-size",
            info: `${vinylModeLabel}: ${t("settings.culturalAnnotations.fontSize.desc")}`,
            type: ConfigSliderRange,
            min: 10,
            max: 32,
            step: 1,
            unit: "px",
          },
          {
            desc: `${vinylModeLabel} · ${t("settings.culturalAnnotations.fontWeight.label")}`,
            key: "cultural-annotations-vinyl-font-weight",
            info: `${vinylModeLabel}: ${t("settings.culturalAnnotations.fontWeight.desc")}`,
            type: ConfigFontWeightSlider,
          },
          {
            desc: `${vinylModeLabel} · ${t("settings.culturalAnnotations.opacity.label")}`,
            key: "cultural-annotations-vinyl-opacity",
            info: `${vinylModeLabel}: ${t("settings.culturalAnnotations.opacity.desc")}`,
            type: ConfigSliderRange,
            min: 20,
            max: 100,
            step: 1,
            unit: "%",
          },
          ...createTextOutlineSettingItems("cultural-annotations-vinyl", {
            labelPrefix: `${vinylModeLabel} · `,
            infoPrefix: `${vinylModeLabel}: `,
          }),
        ],
      },
    ];
    return react.createElement(
      SettingsSection,
      {
        key: "cultural-annotations",
        sectionKey: "cultural-annotations",
        title: t("settings.culturalAnnotations.label"),
        subtitle: t("settings.culturalAnnotations.desc"),
      },
      react.createElement(
        "div",
        { className: "settings-group settings-matrix-group", "data-setting-key": "cultural-annotations-group" },
        react.createElement(OptionList, {
          items: [
            {
              desc: t("settings.culturalAnnotations.label"),
              key: "cultural-annotations-enabled",
              type: ConfigSlider,
              defaultValue: getVisualSettings()["cultural-annotations-enabled"] ?? false,
            },
          ],
          onChange: handleCulturalSettingChange,
        }),
        react.createElement(SettingsLayerMatrix, {
          columns,
          rows: [
            { id: "font", label: t("settings.culturalAnnotations.fontFamily.label") },
            { id: "size", label: t("settings.culturalAnnotations.fontSize.label") },
            { id: "weight", label: t("settings.culturalAnnotations.fontWeight.label") },
            { id: "opacity", label: t("settings.culturalAnnotations.opacity.label") },
            { id: "outlineWidth", label: t("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness" },
            { id: "outlineColor", label: t("settingsAdvanced.textOutline.color.label") || "Text Outline Color" },
          ],
          onChange: handleCulturalSettingChange,
          label: t("settings.culturalAnnotations.label"),
          masterKey: "cultural-annotations-enabled",
        })
      )
    );
  };

  const renderAiProvidersTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "ai-providers" ? "active" : ""}`,
        "data-tab-id": "ai-providers",
      },
      react.createElement(AIProvidersTab, null, renderCulturalAnnotationsSection()),
      react.createElement(
        "p",
        { className: "settings-footnote" },
        react.createElement(SettingsUiIcon, { name: "info", size: 15 }),
        react.createElement("span", null, t("settingsUi.aiAutosave"))
      )
    );

  const renderDebugTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "debug" ? "active" : ""}`,
        "data-tab-id": "debug",
      },
      react.createElement(
        SettingsSection,
        {
          sectionKey: "debug-overview",
          title: t("settingsAdvanced.debugTab.title"),
          subtitle: t("settingsAdvanced.debugTab.subtitle"),
        },
        react.createElement(DebugInfoPanel)
      )
    );

  return { renderLyricsProvidersTab, renderAiProvidersTab, renderDebugTab };
}
