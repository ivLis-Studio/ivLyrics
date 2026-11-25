import {
  getBuiltInSpeakerColorSettingKey,
  IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS,
} from '../../lyrics/speakerColors.mjs';
import { normalizeSettingsHexColor } from './settingsColorControls.mjs';
import { commitSettingsControlValue } from './settingsControlCommit.mjs';

const MULTI_VOCAL_COLOR_GROUPS = [
  {
    id: "male",
    labelKey: "settingsAdvanced.multiVocalColors.maleGroup",
    fallbackLabel: "Male",
    speakers: ["MALE 1", "MALE 2", "MALE 3", "MALE 4", "MALE 5"],
  },
  {
    id: "female",
    labelKey: "settingsAdvanced.multiVocalColors.femaleGroup",
    fallbackLabel: "Female",
    speakers: ["FEMALE 1", "FEMALE 2", "FEMALE 3", "FEMALE 4", "FEMALE 5"],
  },
  {
    id: "duet",
    labelKey: "settingsAdvanced.multiVocalColors.duetGroup",
    fallbackLabel: "Duet",
    speakers: ["DUET 1", "DUET 2", "DUET 3", "DUET 4", "DUET 5"],
  },
];
export function createSettingsMultiVocalColors({
  react, ConfigColorControl, ConfigColorPicker, translate, toast, readSpeakerColors, readVisualSettings,
  saveVisualSetting, resetVisualSettings, applyColorChange, useSettingsConfigRevision, onSaveError,
}) {
  const readColor = (speaker) => {
    const key = getBuiltInSpeakerColorSettingKey(speaker);
    return readSpeakerColors()?.getTextColor?.(speaker)
      || normalizeSettingsHexColor(readVisualSettings()[key])
      || IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS[key];
  };

  const publishColorChange = (key, value) => {
    readSpeakerColors()?.applyCssVariables?.();
    applyColorChange(key, value);
  };

  const saveColor = (speaker, value) => {
    const color = normalizeSettingsHexColor(value);
    if (!color) {
      toast?.error?.(translate("settingsAdvanced.multiVocalColors.invalidColor") || "Enter a valid hex color.");
      return false;
    }
    if (readColor(speaker) === color) return true;
    const key = getBuiltInSpeakerColorSettingKey(speaker);
    saveVisualSetting(key, color);
    publishColorChange(key, color);
    return true;
  };

  const getMultiVocalRegistryItems = () => MULTI_VOCAL_COLOR_GROUPS.flatMap(group => group.speakers.map(speaker => ({
    item: {
      desc: `${translate(group.labelKey) || group.fallbackLabel} · ${speaker}`,
      key: getBuiltInSpeakerColorSettingKey(speaker),
      type: ConfigColorPicker,
      defaultValue: readColor(speaker),
    },
    onChange: (_name, value) => saveColor(speaker, value),
  })));

  const ConfigMultiVocalColorSettings = () => {
    useSettingsConfigRevision();

    const commitColor = (speaker, value) => {
      commitSettingsControlValue(saveColor, onSaveError, speaker, value);
    };

    const resetColors = () => {
      const saved = commitSettingsControlValue(resetVisualSettings, onSaveError, IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS);
      if (!saved) return;
      publishColorChange("multi-vocal-speaker-color-reset", "default");
      toast?.success?.(translate("settingsAdvanced.multiVocalColors.resetDone") || "Multi-vocal colors were reset.");
    };

    return react.createElement(
      "div",
      { className: "option-list-wrapper multi-vocal-color-settings", "data-setting-key": "multi-vocal-colors" },
      react.createElement(
        "div",
        { className: "setting-row multi-vocal-color-setting-row" },
        react.createElement(
          "div",
          { className: "setting-row-content multi-vocal-color-content" },
          react.createElement(
            "div",
            { className: "multi-vocal-color-header" },
            react.createElement(
              "div",
              { className: "multi-vocal-color-copy" },
              react.createElement("div", { className: "setting-name" }, translate("settingsAdvanced.multiVocalColors.description") || "Customize the lyric color for each multi-vocal speaker."),
              react.createElement("div", { className: "setting-description" }, translate("settingsAdvanced.multiVocalColors.subtitle") || "These colors are used in karaoke lyrics, the Now Playing panel, and the sync creator.")
            ),
            react.createElement(
              "button",
              { className: "btn", type: "button", onClick: resetColors, style: { whiteSpace: "nowrap" } },
              translate("settingsAdvanced.multiVocalColors.reset") || "Reset"
            )
          ),
          react.createElement(
            "div",
            { className: "multi-vocal-color-groups" },
            ...MULTI_VOCAL_COLOR_GROUPS.map((group) =>
              react.createElement(
                "div",
                { key: group.id, className: "multi-vocal-color-group" },
                react.createElement(
                  "div",
                  { className: "multi-vocal-color-group-title" },
                  translate(group.labelKey) || group.fallbackLabel
                ),
                ...group.speakers.map((speaker) => react.createElement(
                  "div",
                  { key: speaker, className: "multi-vocal-color-row" },
                  react.createElement("span", { className: "multi-vocal-color-speaker" }, speaker),
                  react.createElement(ConfigColorControl, {
                    value: readColor(speaker),
                    label: speaker,
                    readConfiguredValue: () => readColor(speaker),
                    onCommit: (nextColor) => commitColor(speaker, nextColor),
                  })
                ))
              )
            )
          )
        )
      )
    );
  };

  return { ConfigMultiVocalColorSettings, getMultiVocalRegistryItems };
}
