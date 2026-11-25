import { commitSettingsControlValue } from "./settingsControlCommit.mjs";

export const handleSettingsRadioKeys = (event, options, index, select) => {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  let next = null;
  if (event.key in keys) next = (Math.max(0, index) + keys[event.key] + options.length) % options.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = options.length - 1;
  if (next === null) return;
  event.preventDefault();
  select(options[next].value);
  const group = event.currentTarget.closest('[role="radiogroup"]');
  group?.querySelectorAll('[role="radio"]')?.[next]?.focus?.();
};

export const getSettingsSelectionEntries = (options) =>
  Object.keys(options || {}).map((optionKey) => [optionKey, String(options[optionKey])]);

const SETTINGS_WIDE_GLYPH_PATTERN = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;
const measureSettingsLabelUnits = (text) =>
  Array.from(String(text || "")).reduce(
    (sum, character) => sum + (SETTINGS_WIDE_GLYPH_PATTERN.test(character) ? 1 : 0.58),
    0
  );

// One place decides how a choice is shown, so rows can lay out the control
// inline (slide toggle, list) or under the label (cards).
export const resolveSettingsSelectionPresentation = (entries, presentation) => {
  if (presentation) return presentation;
  if (!entries.length) return "select";
  if (entries.length > 5) {
    return entries.every(([optionKey]) => /^-?d+$/.test(optionKey)) ? "stepper" : "select";
  }
  if (entries.length <= 4) {
    const budget = (360 / entries.length / 14 - 1) * 1.75;
    return entries.every(([, optionLabel]) => measureSettingsLabelUnits(optionLabel) <= budget)
      ? "seg"
      : "cards";
  }
  return "select";
};

export function createSettingsChoiceControls({ react, SettingsUiIcon, SettingsStepper, onSaveError }) {
  const { useCallback, useEffect, useState } = react;

  // Slide toggle for two to four short choices.
  const SettingsSegmented = ({ options, value, onChange = () => { }, label, disabled, compact = false, className = "" }) => {
    const index = options.findIndex((option) => String(option.value) === String(value));
    return react.createElement(
      "div",
      {
        className: `settings-seg${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`,
        role: "radiogroup",
        "aria-label": label,
        "aria-disabled": disabled ? true : undefined,
        style: { "--count": options.length, "--index": Math.max(0, index) },
      },
      react.createElement("span", {
        className: `settings-seg-thumb${index < 0 ? " is-empty" : ""}`,
        "aria-hidden": "true",
      }),
      ...options.map((option, optionIndex) => {
        const active = optionIndex === index;
        return react.createElement(
          "button",
          {
            key: String(option.value),
            type: "button",
            role: "radio",
            "aria-checked": active,
            tabIndex: active || (index < 0 && optionIndex === 0) ? 0 : -1,
            className: `settings-seg-option${active ? " is-on" : ""}`,
            disabled,
            title: option.label,
            "data-setting-key": option.anchor || undefined,
            onClick: () => {
              if (!active) onChange(option.value);
            },
            onKeyDown: (event) => handleSettingsRadioKeys(event, options, index, onChange),
          },
          option.color ? react.createElement("i", { className: "settings-seg-swatch", style: { "--swatch": option.color } }) : null,
          option.icon ? react.createElement(SettingsUiIcon, { name: option.icon, size: 15 }) : null,
          react.createElement("span", { className: "settings-seg-text" }, option.label)
        );
      })
    );
  };

  // Radio cards for a few choices with longer labels or a description.
  const SettingsChoiceCards = ({ options, value, onChange = () => { }, label, disabled, className = "" }) => {
    const index = options.findIndex((option) => String(option.value) === String(value));
    return react.createElement(
      "div",
      { className: `settings-cards${className ? ` ${className}` : ""}`, role: "radiogroup", "aria-label": label },
      ...options.map((option, optionIndex) => {
        const active = optionIndex === index;
        return react.createElement(
          "button",
          {
            key: String(option.value),
            type: "button",
            role: "radio",
            "aria-checked": active,
            tabIndex: active || (index < 0 && optionIndex === 0) ? 0 : -1,
            className: `settings-card-opt${active ? " is-on" : ""}${option.description ? "" : " is-plain"}`,
            disabled,
            "data-setting-key": option.anchor || undefined,
            onClick: () => {
              if (!active) onChange(option.value);
            },
            onKeyDown: (event) => handleSettingsRadioKeys(event, options, index, onChange),
          },
          option.visual || null,
          react.createElement(
            "span",
            { className: "settings-card-title" },
            react.createElement("span", { className: "settings-card-label" }, option.label),
            react.createElement(
              "span",
              { className: "settings-card-check", "aria-hidden": "true" },
              react.createElement(SettingsUiIcon, { name: "check", size: 10 })
            )
          ),
          option.description
            ? react.createElement("span", { className: "settings-card-desc" }, option.description)
            : null
        );
      })
    );
  };

  const ConfigSelection = ({
    name,
    defaultValue,
    options,
    disabled,
    presentation,
    iconMap,
    swatchMap,
    visualMap,
    cardsClassName = "",
    compact = false,
    onChange = () => { },
  }) => {
    const [value, setValue] = useState(defaultValue);

    const setValueCallback = useCallback(
      (rawValue) => {
        if (disabled) return;
        let value = rawValue;
        if (!Number.isNaN(Number(value))) {
          value = Number.parseInt(value);
        }
        if (commitSettingsControlValue(onChange, onSaveError, value)) setValue(value);
      },
      [disabled, onChange]
    );

    useEffect(() => {
      setValue(defaultValue);
    }, [defaultValue]);

    const entries = getSettingsSelectionEntries(options);
    if (!entries.length) return null;

    const kind = compact ? "select" : resolveSettingsSelectionPresentation(entries, presentation);
    const choices = entries.map(([optionKey, optionLabel]) => ({
      value: optionKey,
      label: optionLabel,
      icon: iconMap?.[optionKey],
      color: swatchMap?.[optionKey],
      visual: visualMap?.[optionKey],
    }));

    if (kind === "seg") {
      return react.createElement(SettingsSegmented, {
        options: choices,
        value: value === undefined || value === null ? "" : String(value),
        label: name,
        disabled,
        onChange: setValueCallback,
      });
    }
    if (kind === "cards") {
      return react.createElement(SettingsChoiceCards, {
        options: choices,
        value: value === undefined || value === null ? "" : String(value),
        label: name,
        disabled,
        className: cardsClassName,
        onChange: setValueCallback,
      });
    }
    if (kind === "stepper") {
      return react.createElement(SettingsStepper, {
        value: value === undefined || value === null ? "" : String(value),
        values: entries.map(([optionKey]) => optionKey),
        label: name,
        disabled,
        onChange: setValueCallback,
      });
    }

    return react.createElement(
      "label",
      { className: `settings-select${compact ? " is-compact" : ""}${disabled ? " is-disabled" : ""}` },
      react.createElement(
        "select",
        {
          className: "config-select",
          value,
          disabled,
          "aria-label": name,
          onChange: (event) => setValueCallback(event.target.value),
        },
        ...entries.map(([optionKey, optionLabel]) =>
          react.createElement(
            "option",
            {
              key: optionKey,
              value: optionKey,
            },
            optionLabel
          )
        )
      ),
      react.createElement(SettingsUiIcon, { name: "down", size: 14, className: "settings-select-chevron" })
    );
  };

  return { SettingsSegmented, SettingsChoiceCards, ConfigSelection };
}
