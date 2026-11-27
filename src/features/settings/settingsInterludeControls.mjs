import { renderSettingsControlRow } from "./settingsSectionShell.mjs";
import {
  createBreakIconChildren as createSettingsBreakIcon, createInterludeIndicator as createSettingsInterludeIndicator,
  getInstrumentalBreakMotionStyle,
} from '../../lyrics/lyricInterludePresentation.mjs';

export function createSettingsInterludeControls({ react, readVisualSettings, translate, isSettingChanged }) {
  const { useState, useMemo, useCallback, useEffect } = react;

  const SettingsInterludeIndicator = createSettingsInterludeIndicator({
    react,
    getVisualSettings: readVisualSettings,
    translate,
  });

  const getInstrumentalBreakLabelStyleDefault = (settingSuffix, originalKey, fallbackValue) => {
    const settingValue = readVisualSettings()?.[`instrumental-break-label-${settingSuffix}`];
    if (settingValue !== undefined && settingValue !== null && settingValue !== "") {
      return settingValue;
    }

    const originalValue = originalKey ? readVisualSettings()?.[originalKey] : undefined;
    return originalValue !== undefined && originalValue !== null && originalValue !== ""
      ? originalValue
      : fallbackValue;
  };

  const InstrumentalBreakIconPreview = ({ icon }) => {
    return react.createElement(
      "span",
      {
        className: `lyrics-break-icon lyrics-break-icon-${icon}`,
        style: getInstrumentalBreakMotionStyle(readVisualSettings()?.["instrumental-break-animation-speed"]),
        "aria-hidden": "true",
      },
      createSettingsBreakIcon(react, icon)
    );
  };

  const ConfigInstrumentalBreakIconPicker = ({
    name,
    settingKey,
    info,
    defaultValue,
    options = {},
    disabled,
    onChange = () => { },
  }) => {
    const optionKeys = useMemo(() => Object.keys(options), [options]);
    const fallbackValue = optionKeys.includes("equalizer") ? "equalizer" : optionKeys[0];
    const normalizeValue = useCallback(
      (value) => optionKeys.includes(value) ? value : fallbackValue,
      [optionKeys, fallbackValue]
    );
    const [value, setValue] = useState(normalizeValue(defaultValue));

    useEffect(() => {
      setValue(normalizeValue(defaultValue));
    }, [defaultValue, normalizeValue]);

    const handleSelect = useCallback(
      (nextValue) => {
        if (disabled || !optionKeys.includes(nextValue)) return;
        setValue(nextValue);
        onChange(settingKey || name, nextValue);
      },
      [disabled, optionKeys, onChange, settingKey, name]
    );

    if (!optionKeys.length) return null;

    const selectedLabel = options[value] || value;

    return renderSettingsControlRow(react, {
      rowProps: {
        className: `setting-row instrumental-break-picker-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
        "data-setting-key": settingKey,
        style: disabled ? { opacity: 0.5, pointerEvents: "none" } : {},
      },
      name,
      description: [info && react.createElement("div", {
        className: "setting-description", dangerouslySetInnerHTML: { __html: info },
      })],
      controlClassName: "setting-row-right instrumental-break-picker-control",
    },
      react.createElement(
        "div",
        { className: "instrumental-break-selected-preview" },
        react.createElement(
          "span",
          { className: "instrumental-break-selected-stage" },
          react.createElement(InstrumentalBreakIconPreview, { icon: value })
        ),
        react.createElement("span", { className: "instrumental-break-selected-label" }, selectedLabel)
      ),
      react.createElement(
        "div",
        { className: "instrumental-break-preview-grid" },
        ...optionKeys.map((key) => {
          const isSelected = key === value;

          return react.createElement(
            "button",
            {
              key,
              type: "button",
              className: `instrumental-break-preview-option${isSelected ? " active" : ""}`,
              onClick: () => handleSelect(key),
              "aria-pressed": isSelected,
              "aria-label": options[key] || key,
              title: options[key] || key,
            },
            react.createElement(
              "span",
              { className: "instrumental-break-option-stage" },
              react.createElement(InstrumentalBreakIconPreview, { icon: key })
            ),
            react.createElement("span", { className: "instrumental-break-option-label" }, options[key] || key)
          );
        })
      )
    );
  };

  return { SettingsInterludeIndicator, getInstrumentalBreakLabelStyleDefault, ConfigInstrumentalBreakIconPicker };
}
