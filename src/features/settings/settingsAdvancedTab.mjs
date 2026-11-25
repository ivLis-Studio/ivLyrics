export function renderAdvancedSettingsTab(react, {
  activeTab, translate, thresholdSizeLimit, handleVisualConfigChange, actions,
  SettingsSection, OptionList, ConfigSliderRange, SettingsBackupButton, ConfigCloudSync, ConfigSettingsPresets,
}) {
  const section = (sectionKey, keyPrefix, subtitleKey, children) => react.createElement(
    SettingsSection,
    {
      key: sectionKey,
      sectionKey,
      title: translate(`${keyPrefix}.title`),
      subtitle: translate(subtitleKey),
    },
    children
  );
  const backupControls = items => react.createElement(OptionList, { items, onChange: () => {} });
  const button = (key, labelKey, action, descriptionKey = labelKey + ".label") => ({
    desc: translate(labelKey + ".label"),
    info: translate(descriptionKey),
    key,
    text: translate(labelKey + ".button"),
    type: SettingsBackupButton,
    onChange: action,
  });
  const threshold = (key, textKey) => ({
    desc: translate(textKey + ".label"),
    info: translate(textKey + ".desc"),
    key,
    type: ConfigSliderRange,
    min: thresholdSizeLimit.min,
    max: thresholdSizeLimit.max,
    step: thresholdSizeLimit.step,
    unit: "%",
  });

  return react.createElement(
    "div",
    {
      className: `tab-content ${activeTab === "advanced" ? "active" : ""}`,
      "data-tab-id": "advanced",
    },
    section("language-detection", "settingsAdvanced.languageDetection", "settingsAdvanced.languageDetection.subtitle",
      react.createElement(OptionList, {
        items: [
          threshold("ja-detect-threshold", "settingsAdvanced.languageDetection.japaneseThreshold"),
          threshold("hans-detect-threshold", "settingsAdvanced.languageDetection.chineseThreshold"),
        ],
        onChange: handleVisualConfigChange,
      })),
    section("settings-presets", "settingsAdvanced.settingsPresets", "settingsAdvanced.settingsPresets.subtitle",
      react.createElement(ConfigSettingsPresets)),
    section("cloud-sync", "settingsAdvanced.cloudSync", "settingsAdvanced.cloudSync.monthlyRequired",
      react.createElement(ConfigCloudSync)),
    section("export-import", "settingsAdvanced.exportImport", "settingsAdvanced.exportImport.subtitle", backupControls([
      button("export-settings", "settingsAdvanced.exportImport.export", actions.exportSettings),
      button("import-settings", "settingsAdvanced.exportImport.import", actions.importSettings),
    ])),
    section("db-export-import", "settingsAdvanced.dbExportImport", "settingsAdvanced.dbExportImport.subtitle", backupControls([
      button("export-db", "settingsAdvanced.dbExportImport.export", actions.exportDatabaseBackup),
      button("import-db", "settingsAdvanced.dbExportImport.import", actions.importDatabaseBackup),
    ])),
    section("reset-settings", "settingsAdvanced.resetSettings", "settingsAdvanced.resetSettings.subtitle", backupControls([
      button("reset-settings", "settingsAdvanced.resetSettings.reset", actions.resetSettings, "settingsAdvanced.resetSettings.reset.desc"),
    ]))
  );
}
