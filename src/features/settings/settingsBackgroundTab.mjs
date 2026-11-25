import { SETTINGS_BACKGROUND_MODE_KEY } from "./settingsDefaults.mjs";
import { normalizeSettingsHexColor } from "./settingsColorControls.mjs";

export function useSettingsBackgroundTab({
  react, translate, getSettingsText, getVisualSettings, saveVisualSetting, saveVisualSettings, updatePreviewStyles,
  refreshLyrics, publishConfig, subscribeConfig, openHelperDownload, applyMotionClasses,
  backgroundPresets, getCurrentSettingsBackgroundMode, useSettingsConfigRevision, isFadActive,
  controls: {
    ConfigSliderRange, ColorPresetSelector, ConfigWarning, ConfigSelection, VideoHelperToggle,
    ConfigInfo, ConfigSlider, SettingsChoiceCards, OptionList,
  },
}) {
  // ---- Background (visual effects) ----
  const handleBackgroundVisualChange = (name, value) => {
    saveVisualSetting(name, value);
    if (name === "alignment") updatePreviewStyles();
    refreshLyrics();
    publishConfig(name, value);
  };

  const applyBackgroundMode = (modeId) => {
    const values = Object.fromEntries(backgroundPresets
      .filter(({ id }) => id !== "none")
      .map(({ id }) => [id, id === modeId]));
    saveVisualSettings(values);
    refreshLyrics();
    publishConfig("background-mode", modeId);
  };

  const buildBackgroundModeItems = (selectedMode) => {
    const modeSpecificItems = [];

    if (
      selectedMode === "gradient-background" ||
      selectedMode === "blur-gradient-background"
    ) {
      modeSpecificItems.push({
        desc: translate("settings.albumBgBlur.label"),
        info: translate("settings.albumBgBlur.desc"),
        key: "album-bg-blur",
        type: ConfigSliderRange,
        min: 0,
        max: 100,
        step: 5,
        unit: "px",
      });
    }

    if (selectedMode === "solid-background") {
      modeSpecificItems.push(
        {
          desc: translate("settings.solidBackgroundColor.label"),
          key: "solid-background-color",
          info: translate("settings.solidBackgroundColor.desc"),
          type: ColorPresetSelector,
        },
        {
          desc: "",
          key: "solid-background-warning",
          type: ConfigWarning,
          message: translate("settings.solidBackgroundWarning"),
        }
      );
    }

    if (selectedMode === "video-background") {
      modeSpecificItems.push(
        {
          desc: translate("settings.videoFallback.label"),
          info: translate("settings.videoFallback.desc"),
          key: "video-fallback-background",
          type: ConfigSelection,
          options: {
            "album-cover": translate("settings.gradientBackground.label"),
            "blur-gradient": translate("settings.blurGradientBackground.label"),
            solid: translate("settings.solidBackground.label"),
          },
        },
        {
          desc: translate("settings.solidBackgroundColor.label"),
          info: translate("settings.solidBackgroundColor.desc"),
          key: "solid-background-color",
          type: ColorPresetSelector,
          when: () => getVisualSettings()["video-fallback-background"] === "solid",
        },
        {
          desc: translate("settings.videoHelper.label"),
          info: translate("settings.videoHelper.desc"),
          key: "video-helper-enabled",
          type: VideoHelperToggle,
          disabled: isFadActive,
        },
        {
          desc: "",
          key: "video-helper-info",
          type: ConfigInfo,
          message: translate("settings.videoHelper.info"),
          buttonText: translate("settings.videoHelper.download"),
          onButtonClick: openHelperDownload,
          when: () => !getVisualSettings()["video-helper-enabled"],
        },
        {
          desc: translate("settings.videoBlur.label"),
          info: translate("settings.videoBlur.desc"),
          key: "video-blur",
          type: ConfigSliderRange,
          min: 0,
          max: 40,
          step: 1,
          unit: "px",
        },
        {
          desc: translate("settings.videoCover.label"),
          info: translate("settings.videoCover.desc"),
          key: "video-cover",
          type: ConfigSlider,
        },
        {
          desc: translate("settings.videoScale.label"),
          info: translate("settings.videoScale.desc"),
          key: "video-scale",
          type: ConfigSliderRange,
          min: 50,
          max: 200,
          step: 1,
          unit: "%",
        }
      );
    }

    if (selectedMode !== "solid-background" && selectedMode !== "none") {
      modeSpecificItems.push({
        desc: translate("settings.backgroundBrightness.label"),
        key: "background-brightness",
        info: translate("settings.backgroundBrightness.desc"),
        type: ConfigSliderRange,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
      });
    }
    return modeSpecificItems;
  };

  const buildBackgroundLayoutItems = () => [
    {
      desc: translate("settings.alignment.label"),
      key: "alignment",
      info: translate("settings.alignment.desc"),
      type: ConfigSelection,
      disabled: isFadActive,
      presentation: "seg",
      iconMap: { left: "alignLeft", center: "alignCenter", right: "alignRight" },
      options: {
        left: translate("settings.alignment.options.left"),
        center: translate("settings.alignment.options.center"),
        right: translate("settings.alignment.options.right"),
      },
    },
    {
      desc: translate("settings.sideMargin.label"),
      key: "lyrics-side-margin",
      info: translate("settings.sideMargin.desc"),
      type: ConfigSliderRange,
      disabled: isFadActive,
      min: 0,
      max: 30,
      step: 1,
      unit: "%",
    },
    {
      desc: translate("settings.lyricsBackdropBlur.label"),
      key: "lyrics-backdrop-blur",
      info: translate("settings.lyricsBackdropBlur.desc"),
      type: ConfigSliderRange,
      disabled: isFadActive,
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
    },
    {
      desc: translate("settings.noise.label"),
      key: "noise",
      info: translate("settings.noise.desc"),
      type: ConfigSlider,
      disabled: isFadActive,
    },
  ];

  const getBackgroundPresetOptions = () =>
    Object.fromEntries(
      backgroundPresets.map((preset) => [
        preset.id,
        getSettingsText(preset.labelKey, preset.fallbackLabel),
      ])
    );

  // Every background setting, for the changed-settings registry.
  const getBackgroundRegistryItems = () => {
    const items = [{
      item: {
        desc: translate("sections.visualEffects"),
        key: SETTINGS_BACKGROUND_MODE_KEY,
        type: ConfigSelection,
        presentation: "select",
        options: getBackgroundPresetOptions(),
        defaultValue: getCurrentSettingsBackgroundMode(),
      },
      onChange: (_name, value) => applyBackgroundMode(value),
    }];
    const seen = new Set();
    ["gradient-background", "solid-background", "video-background"].forEach((mode) => {
      buildBackgroundModeItems(mode).forEach((item) => {
        if (seen.has(item.key)) return;
        seen.add(item.key);
        items.push({ item, onChange: handleBackgroundVisualChange });
      });
    });
    buildBackgroundLayoutItems().forEach((item) => items.push({ item, onChange: handleBackgroundVisualChange }));
    return items;
  };

  // This component owns stateful helper controls. Keep its type stable across
  // ConfigModal renders so their mount effects cannot trigger a remount loop.
  const BackgroundExperienceSection = react.useMemo(() => function BackgroundExperienceSectionContent() {
    const [selectedMode, setSelectedMode] = react.useState(
      getCurrentSettingsBackgroundMode()
    );
    useSettingsConfigRevision();

    const applyMode = (modeId) => {
      setSelectedMode(modeId);
      applyBackgroundMode(modeId);
    };

    react.useEffect(() => {
      const handleConfigChange = (event) => {
        if (event.detail?.type !== "config") return;
        const changedName = event.detail?.name;
        const isBackgroundModeChange =
          changedName === "background-mode" ||
          backgroundPresets.some((preset) => preset.id === changedName);
        if (isBackgroundModeChange) {
          setSelectedMode(getCurrentSettingsBackgroundMode());
        }
      };

      return subscribeConfig(handleConfigChange);
    }, []);

    const modeSpecificItems = buildBackgroundModeItems(selectedMode);
    const solidColor = normalizeSettingsHexColor(getVisualSettings()["solid-background-color"]) || "#1e3a8a";

    return react.createElement(
      react.Fragment,
      null,
      react.createElement(
        "div",
        { className: "settings-panel settings-modes-panel", "data-setting-key": SETTINGS_BACKGROUND_MODE_KEY },
        react.createElement(SettingsChoiceCards, {
          className: "settings-mode-grid",
          label: translate("sections.visualEffects"),
          value: selectedMode,
          disabled: isFadActive,
          onChange: applyMode,
          options: backgroundPresets.map((preset) => ({
            value: preset.id,
            anchor: preset.id === "none" ? undefined : preset.id,
            label: getSettingsText(preset.labelKey, preset.fallbackLabel),
            description: getSettingsText(preset.descriptionKey, preset.fallbackDescription),
            visual: react.createElement("span", {
              className: `settings-mode-visual vis-${preset.id}`,
              style: preset.id === "solid-background" ? { "--solid": solidColor } : undefined,
              "aria-hidden": "true",
            }),
          })),
        })
      ),
      modeSpecificItems.length > 0 &&
        react.createElement(
          "div",
          { className: "settings-group" },
          react.createElement(
            "div",
            { className: "settings-group-title" },
            getSettingsText("settingsUi.background.finetune", "Background Details")
          ),
          react.createElement(OptionList, {
            items: modeSpecificItems,
            onChange: handleBackgroundVisualChange,
          })
        ),
      react.createElement(
        "div",
        { className: "settings-group" },
        react.createElement(
          "div",
          { className: "settings-group-title" },
          getSettingsText("settingsUi.background.layout", "Layout & Motion")
        ),
        react.createElement(OptionList, {
          items: buildBackgroundLayoutItems(),
          onChange: handleBackgroundVisualChange,
        })
      )
    );
  }, [isFadActive]);

  const performanceBackgroundKeys = new Set(
    backgroundPresets.map((preset) => preset.id).filter((id) => id !== "none")
  );

  const handlePerformanceSettingChange = (name, value) => {
    if (performanceBackgroundKeys.has(name) && value) {
      applyBackgroundMode(name);
      return;
    }

    saveVisualSetting(name, value);
    if (name === "reduce-motion") {
      applyMotionClasses();
    }
    refreshLyrics();
    publishConfig(name, value);
  };

  return { getBackgroundRegistryItems, BackgroundExperienceSection, handlePerformanceSettingChange };
}
