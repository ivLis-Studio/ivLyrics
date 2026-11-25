export function createSettingsPerformanceControls({
  react, translate, getSettingsText, readVisualSettings, useSettingsConfigRevision,
  getSettingsPreviewFlag, getSettingsPreviewNumber, controls: { ConfigSlider, ConfigSliderRange, ConfigButton },
}) {
  // One definition for the Performance controls, their search destinations and
  // changed-setting ownership. Other menus keep styling details, not these toggles.
  const getPerformanceSettingsSections = () => {
    const option = (key, labelKey, descriptionKey, extra = {}) => ({
      key,
      desc: translate(labelKey),
      info: translate(descriptionKey),
      type: ConfigSlider,
      i18nKeys: [labelKey, descriptionKey],
      ...extra,
    });
    return [
      {
        sectionKey: "performance-rendering",
        titleKey: "settingsAdvanced.performance.rendering.title",
        subtitleKey: "settingsAdvanced.performance.rendering.subtitle",
        items: [
          option("performance-frame-rate", "settingsAdvanced.performance.frameRate.label", "settingsAdvanced.performance.frameRate.desc", {
            type: ConfigSliderRange, presentation: "fps",
            defaultValue: Number(readVisualSettings()["performance-frame-rate"] ?? 60),
            min: 10, max: 240, step: 1, unit: translate("settingsAdvanced.performance.frameRate.unit"),
          }),
          option("reduce-motion", "settings.reduceMotion.label", "settings.reduceMotion.desc", {
            defaultValue: readVisualSettings()["reduce-motion"] ?? false,
          }),
          option("karaoke-bounce", "settingsAdvanced.karaokeMode.bounce.label", "settingsAdvanced.karaokeMode.bounce.desc", { cost: true }),
          option("karaoke-line-transition", "settingsAdvanced.karaokeMode.lineTransition.label", "settingsAdvanced.karaokeMode.lineTransition.desc", { cost: true }),
          option("karaoke-text-effects", "settingsAdvanced.performance.textEffects.label", "settingsAdvanced.performance.textEffects.desc", {
            cost: true, defaultValue: readVisualSettings()["karaoke-text-effects"] ?? true,
          }),
        ],
      },
      {
        sectionKey: "performance-visual-cost",
        titleKey: "settingsAdvanced.performance.visualCost.title",
        subtitleKey: "settingsAdvanced.performance.visualCost.subtitle",
        items: [
          option("fade-blur", "settingsAdvanced.syncMode.fadeoutBlur.label", "settingsAdvanced.syncMode.fadeoutBlur.desc", { cost: true }),
          option("highlight-mode", "settingsAdvanced.syncMode.highlightMode.label", "settingsAdvanced.syncMode.highlightMode.desc", { cost: true }),
          option("text-shadow-enabled", "settingsAdvanced.textShadow.enabled.label", "settingsAdvanced.textShadow.enabled.desc", { cost: true }),
          // Video is an exclusive background choice, not an independent effect
          // toggle. Keep one editor in Appearance and offer a shortcut here.
          option("video-background-settings", "settings.videoBackground.label", "settings.videoBackground.desc", {
            type: ConfigButton, text: translate("tabs.appearance"), searchable: false,
          }),
        ],
      },
      {
        sectionKey: "performance-background-work",
        titleKey: "settingsAdvanced.performance.backgroundWork.title",
        subtitleKey: "settingsAdvanced.performance.backgroundWork.subtitle",
        searchKeys: ["settingsAdvanced.prefetch.title", "settingsAdvanced.prefetch.subtitle"],
        items: [
          option("prefetch-enabled", "settingsAdvanced.prefetch.enabled.label", "settingsAdvanced.prefetch.enabled.desc"),
          option("prefetch-video-enabled", "settingsAdvanced.prefetch.videoEnabled.label", "settingsAdvanced.prefetch.videoEnabled.desc"),
          option("prefetch-word-details-enabled", "settingsAdvanced.prefetch.wordDetailsEnabled.label", "settingsAdvanced.prefetch.wordDetailsEnabled.desc"),
        ],
      },
    ];
  };

  // How many GPU-heavy display effects are on, plus the frame cap.
  const SettingsLoadMeter = ({ costKeys, frameKey }) => {
    useSettingsConfigRevision();
    const on = costKeys.filter((key) => getSettingsPreviewFlag(key, false)).length;
    const fps = getSettingsPreviewNumber(frameKey, 60);
    const score = (on + (fps > 120 ? 2 : fps > 60 ? 1 : 0)) / (costKeys.length + 2);
    const lit = Math.max(1, Math.round(score * 8));
    const level = score < 0.34 ? " is-low" : score > 0.67 ? " is-high" : "";
    return react.createElement(
      "div",
      { className: "settings-group settings-load-group", "data-section-content": "true" },
      react.createElement(
        "div",
        { className: "settings-load-meter" },
        react.createElement(
          "div",
          { className: `settings-load-bars${level}`, "aria-hidden": "true" },
          ...Array.from({ length: 8 }, (_, index) =>
            react.createElement("i", { key: index, className: index < lit ? "is-on" : "" })
          )
        ),
        react.createElement(
          "div",
          { className: "settings-load-text" },
          react.createElement("b", null, getSettingsText("settingsAdvanced.performance.visualCost.title", "Visual cost")),
          react.createElement(
            "small",
            null,
            getSettingsText("settingsUi.performance.loadSummary", "GPU-heavy effects on: {on}/{total} · {fps} FPS")
              .replace("{on}", String(on))
              .replace("{total}", String(costKeys.length))
              .replace("{fps}", String(fps))
          )
        )
      )
    );
  };

  return { getPerformanceSettingsSections, SettingsLoadMeter };
}
