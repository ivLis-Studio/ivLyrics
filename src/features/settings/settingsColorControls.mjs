import { commitSettingsControlValue } from "./settingsControlCommit.mjs";
import { SETTINGS_TEXT_DRAFT_ATTRIBUTE, useSettingsTextDraft } from "./settingsTextDraft.mjs";

export const normalizeSettingsHexColor = (value) => {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map((character) => character + character).join("")}`.toLowerCase();
  }
  return "";
};

export function createSettingsColorControls({ react, translate, onSaveError }) {
  const { useCallback, useEffect, useRef, useState } = react;

  const ConfigColorControl = ({
    value,
    label,
    disabled = false,
    readConfiguredValue,
    onCommit = () => { },
  }) => {
    const draft = useSettingsTextDraft(react, value || "", readConfiguredValue);
    const normalizedColor = normalizeSettingsHexColor(draft.text);
    const isValid = Boolean(normalizedColor);
    const ariaParams = { name: label || "" };
    const pickerLabel = translate("settingsUi.controls.colorPickerAriaLabel", ariaParams).trim();
    const hexLabel = translate("settingsUi.controls.colorHexAriaLabel", ariaParams).trim();

    return react.createElement(
      "div",
      { className: `config-color-control${isValid ? "" : " invalid"}` },
      react.createElement(
        "span",
        { className: "config-color-swatch", style: { "--swatch-color": normalizedColor || "transparent" } },
        react.createElement("input", {
          type: "color",
          disabled,
          value: normalizedColor || "#000000",
          onChange: (event) => {
            draft.cancel();
            onCommit(event.target.value.toLowerCase());
          },
          className: "config-color-picker",
          "aria-label": pickerLabel,
          title: pickerLabel,
        })
      ),
      react.createElement("input", {
        type: "text",
        disabled,
        value: draft.text,
        [SETTINGS_TEXT_DRAFT_ATTRIBUTE]: "",
        onChange: (event) => draft.change(event.target.value),
        onBlur: (event) => draft.finish(event, onCommit),
        onKeyDown: (event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        },
        className: "config-color-input",
        pattern: "^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$",
        placeholder: "#000000",
        spellCheck: false,
        "aria-label": hexLabel,
        "aria-invalid": !isValid,
      })
    );
  };

  const ConfigColorPicker = ({ name, defaultValue, onChange = () => { }, readConfiguredValue, disabled = false }) => {
    const initialColor = normalizeSettingsHexColor(defaultValue) || "#000000";
    const [value, setValue] = useState(initialColor);
    const committedValueRef = useRef(initialColor);

    useEffect(() => {
      const nextColor = normalizeSettingsHexColor(defaultValue) || "#000000";
      committedValueRef.current = nextColor;
      setValue(nextColor);
    }, [defaultValue]);

    const handleCommit = useCallback(
      (nextValue) => {
        if (disabled) return;
        const normalizedColor = normalizeSettingsHexColor(nextValue);
        const current = normalizeSettingsHexColor(readConfiguredValue?.()) || committedValueRef.current;
        if (normalizedColor && normalizedColor !== current &&
            commitSettingsControlValue(onChange, onSaveError, normalizedColor)) {
          committedValueRef.current = normalizedColor;
        }
        setValue(committedValueRef.current);
      },
      [onChange, readConfiguredValue, disabled]
    );

    return react.createElement(
      "div",
      { className: "color-picker-container" },
      react.createElement(ConfigColorControl, {
        value,
        label: name,
        disabled,
        readConfiguredValue,
        onCommit: handleCommit,
      })
    );
  };

  const ColorPresetSelector = ({ defaultValue, onChange = () => { } }) => {
    const [selectedColor, setSelectedColor] = useState(defaultValue);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
      setSelectedColor(defaultValue);
    }, [defaultValue]);

    // 엄선된 인기 색상 (24개)
    const colorPresets = [
      { name: translate("settings.colors.black"), color: "#000000" },
      { name: translate("settings.colors.charcoal"), color: "#1a1a1a" },
      { name: translate("settings.colors.darkSlate"), color: "#334155" },
      { name: translate("settings.colors.gray"), color: "#64748b" },

      { name: translate("settings.colors.darkNavy"), color: "#0f172a" },
      { name: translate("settings.colors.navy"), color: "#1e3a8a" },
      { name: translate("settings.colors.royalBlue"), color: "#2563eb" },
      { name: translate("settings.colors.sky"), color: "#0ea5e9" },

      { name: translate("settings.colors.indigo"), color: "#4f46e5" },
      { name: translate("settings.colors.purple"), color: "#8b5cf6" },
      { name: translate("settings.colors.fuchsia"), color: "#d946ef" },
      { name: translate("settings.colors.pink"), color: "#ec4899" },

      { name: translate("settings.colors.wine"), color: "#7f1d1d" },
      { name: translate("settings.colors.red"), color: "#dc2626" },
      { name: translate("settings.colors.orange"), color: "#f97316" },
      { name: translate("settings.colors.amber"), color: "#f59e0b" },

      { name: translate("settings.colors.gold"), color: "#ca8a04" },
      { name: translate("settings.colors.lime"), color: "#84cc16" },
      { name: translate("settings.colors.green"), color: "#22c55e" },
      { name: translate("settings.colors.emerald"), color: "#10b981" },

      { name: translate("settings.colors.teal"), color: "#14b8a6" },
      { name: translate("settings.colors.cyan"), color: "#06b6d4" },
      { name: translate("settings.colors.brown"), color: "#92400e" },
      { name: translate("settings.colors.chocolate"), color: "#78350f" },
    ];

    const handleColorClick = (color) => {
      if (commitSettingsControlValue(onChange, onSaveError, color)) setSelectedColor(color);
    };

    // 현재 선택된 색상 찾기
    const selectedPreset = colorPresets.find((p) => p.color === selectedColor);

    return react.createElement(
      "div",
      { className: "color-preset-selector" },
      // 현재 선택된 색상 표시
      react.createElement(
        "div",
        { className: "color-preset-summary" },
        react.createElement("div", {
          className: "color-preset-swatch",
          style: { backgroundColor: selectedColor },
        }),
        react.createElement(
          "div",
          { className: "color-preset-meta" },
          react.createElement(
            "span",
            { className: "color-preset-name" },
            selectedPreset ? selectedPreset.name : translate("settings.colors.customColor")
          ),
          react.createElement(
            "span",
            { className: "color-preset-code" },
            selectedColor.toUpperCase()
          )
        ),
        react.createElement(
          "button",
          {
            className: "btn color-preset-toggle-btn",
            type: "button",
            onClick: () => setShowAll(!showAll),
          },
          showAll ? translate("settings.colors.showLess") : translate("settings.colors.showMore")
        )
      ),
      // 색상 팔레트
      showAll &&
      react.createElement(
        "div",
        { className: "color-preset-grid" },
        ...colorPresets.map((preset, index) =>
          react.createElement("button", {
            key: index,
            type: "button",
            className: "color-preset-grid-item",
            onClick: () => handleColorClick(preset.color),
            title: preset.name,
            "aria-label": preset.name,
            "data-selected": selectedColor === preset.color ? "true" : "false",
            style: {
              backgroundColor: preset.color,
            },
          })
        )
      )
    );
  };

  return { ConfigColorControl, ConfigColorPicker, ColorPresetSelector };
}
