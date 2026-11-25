import { normalizeSettingsHexColor } from './settingsColorControls.mjs';
import { SETTINGS_CD_RAINBOW_HUES, SETTINGS_CD_STYLE_ORDER } from './createSettingsFullscreenPreview.mjs';

// One catalog owns CD controls, search aliases and changed-setting destinations.
// Keep conditional rows in the catalog so saved custom colours remain reachable
// even when the visualizer is off or another colour mode is selected.
export const isCdSettingsKey = (key) => typeof key === "string" && (
  key.startsWith("fullscreen-cd-") || key === "cd-mode" || key === "cd-visualizer"
);

export function createCdSettingsCatalog({
  react, translate, readVisualSettings, getSettingsPreviewFlag, SettingsCdDiscPreview,
  components: { ConfigSlider, ConfigSliderRange, ConfigSelection, ConfigColorPicker },
}) {
  // Search only needs metadata, not references to inactive input components.
  const getCdSettingsSections = ({ controls = true } = {}) => {
    const option = (key, name, extra = {}) => ({
      key: `fullscreen-cd-${key}`,
      desc: translate(`vinyl.cd.${name}Label`),
      info: translate(`vinyl.cd.${name}Desc`),
      i18nKeys: [`vinyl.cd.${name}Label`, `vinyl.cd.${name}Desc`],
      ...extra,
    });
    const slider = (key, name, fallback, min, max, step, unit = "%", extra = {}) => option(key, name, {
      type: controls ? ConfigSliderRange : null, min, max, step, unit,
      defaultValue: readVisualSettings()[`fullscreen-cd-${key}`] ?? fallback,
      ...extra,
    });
    const visualizerOff = () => !getSettingsPreviewFlag("fullscreen-cd-visualizer-enabled", true);
    // Pulse rings are circular and level-driven, so density and mirroring would
    // have no visible effect there; their saved values are kept for other shapes.
    const pulseShapeOrOff = () => visualizerOff() || readVisualSettings()["fullscreen-cd-visualizer-style"] === "pulse";
    const choices = (key, name, values, group, fallback, extra = {}) => option(key, name, {
      type: controls ? ConfigSelection : null, presentation: "cards", disabled: visualizerOff,
      options: Object.fromEntries(values.map((value) => [value, translate(`vinyl.cd.${group}.${value}`)])),
      defaultValue: readVisualSettings()[`fullscreen-cd-${key}`] || fallback,
      i18nKeys: [`vinyl.cd.${name}Label`, `vinyl.cd.${name}Desc`, ...values.map((value) => `vinyl.cd.${group}.${value}`)],
      ...extra,
    });
    const mirrored = getSettingsPreviewFlag("fullscreen-cd-visualizer-mirror", false);
    const swatch = (background) => react.createElement("span", { className: "settings-cd-color-swatch", style: { background }, "aria-hidden": "true" });
    return [
      {
        sectionKey: "cd-mode", titleKey: "vinyl.cd.mode", subtitleKey: "vinyl.cd.subtitle",
        items: [
          slider("disc-size", "discSize", 100, 70, 140, 5),
          option("rotation-enabled", "rotation", { type: controls ? ConfigSlider : null, defaultValue: getSettingsPreviewFlag("fullscreen-cd-rotation-enabled", true) }),
          slider("rotation-speed", "rotationSpeed", 100, 25, 200, 5, "%", {
            disabled: () => !getSettingsPreviewFlag("fullscreen-cd-rotation-enabled", true),
          }),
        ],
      },
      {
        sectionKey: "cd-visualizer", titleKey: "vinyl.cd.visualizerTitle", subtitleKey: "vinyl.cd.visualizerDesc",
        items: [
          option("visualizer-enabled", "enabled", { type: controls ? ConfigSlider : null, defaultValue: getSettingsPreviewFlag("fullscreen-cd-visualizer-enabled", true) }),
          choices("visualizer-style", "style", SETTINGS_CD_STYLE_ORDER, "styles", "bars", {
            cardsClassName: "settings-cd-style-cards",
            visualMap: controls ? Object.fromEntries(SETTINGS_CD_STYLE_ORDER.map((value) => [value, react.createElement(SettingsCdDiscPreview, {
              variant: "mini", style: value, color: "currentColor", density: 24, thickness: 2, mirror: mirrored,
            })])) : undefined,
          }),
          option("visualizer-mirror", "mirror", {
            type: controls ? ConfigSlider : null, defaultValue: mirrored, disabled: pulseShapeOrOff,
          }),
          choices("visualizer-color-mode", "colorMode", ["album", "white", "custom", "rainbow"], "colorModes", "album", {
            cardsClassName: "settings-cd-color-cards",
            visualMap: controls ? {
              album: swatch("radial-gradient(circle at 15% 20%, #c8925a, transparent 70%), radial-gradient(circle at 85% 80%, #4d7472, transparent 70%), #8c8160"),
              white: swatch("#ffffff"),
              custom: swatch(normalizeSettingsHexColor(readVisualSettings()["fullscreen-cd-visualizer-color"]) || "#ffffff"),
              rainbow: swatch(`linear-gradient(90deg, ${SETTINGS_CD_RAINBOW_HUES.map((hue) => `hsl(${hue}, 82%, 68%)`).join(", ")})`),
            } : undefined,
          }),
          option("visualizer-color", "color", {
            type: controls ? ConfigColorPicker : null, defaultValue: readVisualSettings()["fullscreen-cd-visualizer-color"] || "#ffffff",
            when: () => !visualizerOff() && readVisualSettings()["fullscreen-cd-visualizer-color-mode"] === "custom",
          }),
          option("visualizer-album-gradient", "albumGradient", {
            type: controls ? ConfigSlider : null,
            defaultValue: getSettingsPreviewFlag("fullscreen-cd-visualizer-album-gradient", true),
            disabled: visualizerOff,
            when: () => (readVisualSettings()["fullscreen-cd-visualizer-color-mode"] || "album") === "album",
          }),
          slider("visualizer-sensitivity", "sensitivity", 100, 25, 200, 5, "%", { disabled: visualizerOff }),
          slider("visualizer-density", "density", 64, 24, 128, 8, "", { disabled: pulseShapeOrOff }),
          slider("visualizer-thickness", "thickness", 2, 1, 6, 0.5, "px", { disabled: visualizerOff }),
        ],
      },
    ];
  };

  return getCdSettingsSections;
}
