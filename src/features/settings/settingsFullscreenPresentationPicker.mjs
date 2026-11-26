import { normalizeFullscreenFocusPresentation } from '../fullscreen/fullscreenPresentation.mjs';
import { handleSettingsRadioKeys } from './settingsChoiceControls.mjs';

const FULLSCREEN_PRESENTATION_PRESETS = Object.freeze([
  {
    id: "compact-vinyl",
    labelKey: "vinyl.presentation.compactLabel",
    fallbackLabel: "CD mode",
    descriptionKey: "vinyl.presentation.compactDescription",
    fallbackDescription:
      "Show a circular album cover with a centre hole and a surrounding visualizer.",
    icon:
      '<path d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0" fill="currentColor" fill-opacity=".15" fill-rule="evenodd" stroke="none"/><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4" stroke-opacity=".45"/><circle cx="12" cy="12" r="2"/><path d="M4.5 7.5 8 5M16 19l3.5-2.5" stroke-opacity=".65"/>',
  },
  {
    id: "vinyl",
    labelKey: "vinyl.presentation.vinylLabel",
    fallbackLabel: "Full vinyl",
    descriptionKey: "vinyl.presentation.vinylDescription",
    fallbackDescription:
      "Show the full record player with the focused lyric at the bottom.",
    icon:
      '<rect x="3" y="5" width="9" height="14" rx="2"/><circle cx="15" cy="12" r="6"/><circle cx="15" cy="12" r="1.5"/>',
  },
  {
    id: "video",
    labelKey: "vinyl.presentation.videoLabel",
    fallbackLabel: "Video stage",
    descriptionKey: "vinyl.presentation.videoDescription",
    fallbackDescription:
      "Show the synchronized YouTube video with the focused lyric at the bottom.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  },
  {
    id: "motion",
    labelKey: "vinyl.presentation.motionLabel",
    fallbackLabel: "Motion",
    descriptionKey: "vinyl.presentation.motionDescription",
    fallbackDescription:
      "Words fly in as they are sung while the camera moves over the video. Plays songs with word or character timing.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15.5 10 9l2.5 4.5L17 8.5M14.5 8.5H17v2.5"/>',
  },
]);
const FULLSCREEN_PRESENTATION_OPTIONS = FULLSCREEN_PRESENTATION_PRESETS.map(option => ({ value: option.id }));

// The picker draws its own cards, so it also publishes the same choice as a
// select row through `settingsRegistryItems`. Search, the changed-settings
// view and the settings assistant read controls from the registry only.
export function createFullscreenPresentationSettingItem({ translate, ConfigSelection, defaultValue }) {
  return {
    key: "fullscreen-focus-presentation",
    desc: translate("vinyl.presentation.settingsTitle"),
    info: translate("vinyl.presentation.settingsDescription"),
    type: ConfigSelection,
    presentation: "cards",
    options: Object.fromEntries(FULLSCREEN_PRESENTATION_PRESETS.map((preset) => [preset.id, translate(preset.labelKey)])),
    defaultValue: normalizeFullscreenFocusPresentation(defaultValue),
  };
}

export function createFullscreenPresentationPicker({ react, getSettingsText }) {
  const { useEffect, useState } = react;
  const FullscreenPresentationPicker = ({ defaultValue, onChange }) => {
    const [selectedMode, setSelectedMode] = useState(() =>
      normalizeFullscreenFocusPresentation(defaultValue)
    );
    useEffect(() => {
      setSelectedMode(normalizeFullscreenFocusPresentation(defaultValue));
    }, [defaultValue]);
    const selectedIndex = FULLSCREEN_PRESENTATION_PRESETS.findIndex(preset => preset.id === selectedMode);

    const applyMode = (modeId) => {
      const normalized = normalizeFullscreenFocusPresentation(modeId);
      setSelectedMode(normalized);
      onChange?.("fullscreen-focus-presentation", normalized);
    };

    return react.createElement(
      "div",
      {
        className: "fullscreen-presentation-picker",
        "data-setting-key": "fullscreen-focus-presentation",
      },
      react.createElement(
        "div",
        { className: "fullscreen-presentation-picker-heading" },
        react.createElement(
          "strong",
          null,
          getSettingsText(
            "vinyl.presentation.settingsTitle",
            "Focused lyric layout"
          )
        ),
        react.createElement(
          "span",
          null,
          getSettingsText(
            "vinyl.presentation.settingsDescription",
            "Choose the visual used when the album opens focused lyrics."
          )
        )
      ),
      react.createElement(
        "div",
        {
          className: "settings-card-grid fullscreen-presentation-grid",
          role: "radiogroup",
          "aria-label": getSettingsText(
            "vinyl.presentation.settingsTitle",
            "Focused lyric layout"
          ),
        },
        FULLSCREEN_PRESENTATION_PRESETS.map((preset) =>
          react.createElement(
            "button",
            {
              key: preset.id,
              className: `settings-choice-card ${
                selectedMode === preset.id ? "active" : ""
              }`,
              type: "button",
              role: "radio",
              "aria-checked": selectedMode === preset.id,
              tabIndex: selectedMode === preset.id ? 0 : -1,
              onClick: () => applyMode(preset.id),
              onKeyDown: (event) => handleSettingsRadioKeys(
                event,
                FULLSCREEN_PRESENTATION_OPTIONS,
                selectedIndex,
                applyMode
              ),
            },
            react.createElement(
              "div",
              { className: "settings-choice-icon" },
              react.createElement("svg", {
                className: preset.id === "compact-vinyl" ? "settings-cd-presentation-preview" : undefined,
                width: preset.id === "compact-vinyl" ? 30 : 20,
                height: preset.id === "compact-vinyl" ? 30 : 20,
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.7,
                strokeLinecap: "round",
                strokeLinejoin: "round",
                dangerouslySetInnerHTML: { __html: preset.icon },
              })
            ),
            react.createElement(
              "div",
              { className: "settings-choice-content" },
              react.createElement(
                "strong",
                null,
                getSettingsText(preset.labelKey, preset.fallbackLabel)
              ),
              react.createElement(
                "span",
                null,
                getSettingsText(
                  preset.descriptionKey,
                  preset.fallbackDescription
                )
              )
            )
          )
        )
      )
    );
  };

  return FullscreenPresentationPicker;
}
