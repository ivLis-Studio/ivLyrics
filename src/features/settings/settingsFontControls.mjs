import { GOOGLE_FONTS } from "../../core/lyricsFontCatalog.mjs";
import { commitSettingsControlValue } from "./settingsControlCommit.mjs";
import { SETTINGS_TEXT_DRAFT_ATTRIBUTE, useSettingsTextDraft } from "./settingsTextDraft.mjs";

const cleanEditableFont = (value) => {
  const family = typeof value === "string" ? value.trim() : "";
  return family === "undefined" ? "" : family;
};

const isCustomFontValue = (family) => Boolean(family) && !GOOGLE_FONTS.includes(family);

export function createSettingsFontControls({ react, translate, getSettingsText, SettingsUiIcon, isSettingChanged, onSaveError }) {
  const { useEffect, useRef, useState } = react;

  const SETTINGS_CUSTOM_FONT_OPTION = "__ivlyrics_custom_font__";

  // Compact font choice for table cells: the font list, the current custom
  // font, and manual input (the same values ConfigFontSelector accepts).
  const SettingsFontPicker = ({ value, label, disabled, allowEmpty = false, onChange = () => { }, readConfiguredValue }) => {
    const safeValue = cleanEditableFont(value);
    const [editing, setEditing] = useState(false);
    const draft = useSettingsTextDraft(react, safeValue, readConfiguredValue);
    const shown = safeValue || (allowEmpty ? "" : "Pretendard Variable");
    const manualLabel = getSettingsText("settings.fontSelector.custom", "Manual input");
    if (editing) {
      const finish = (text) => {
        const next = text.trim();
        if (!disabled && next && next !== safeValue) commitSettingsControlValue(onChange, onSaveError, next);
      };
      return react.createElement("input", {
        className: "settings-font-input config-text-input",
        type: "text",
        value: draft.text,
        [SETTINGS_TEXT_DRAFT_ATTRIBUTE]: "",
        autoFocus: true,
        disabled,
        spellCheck: false,
        placeholder: translate("settings.fontPlaceholder") || "Enter font name (e.g., Arial, Roboto)",
        "aria-label": `${label} ${manualLabel}`,
        onChange: (event) => draft.change(event.target.value),
        onBlur: (event) => {
          setEditing(false);
          draft.finish(event, finish);
        },
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        },
      });
    }
    const options = [];
    if (allowEmpty) options.push(["", getSettingsText("misc.default", "Default")]);
    GOOGLE_FONTS.forEach((font) => options.push([font, font]));
    if (shown && !GOOGLE_FONTS.includes(shown)) options.push([shown, shown]);
    options.push([SETTINGS_CUSTOM_FONT_OPTION, `${manualLabel}…`]);
    return react.createElement(
      "label",
      { className: `settings-select is-compact${disabled ? " is-disabled" : ""}`, title: shown || getSettingsText("misc.default", "Default") },
      react.createElement(
        "select",
        {
          className: "config-select",
          value: shown,
          disabled,
          "aria-label": label,
          style: shown ? { fontFamily: `"${shown.split(",")[0].replace(/["']/g, "").trim()}", inherit` } : undefined,
          onChange: (event) => {
            const next = event.target.value;
            if (next === SETTINGS_CUSTOM_FONT_OPTION) {
              setEditing(true);
              return;
            }
            if (next !== shown) commitSettingsControlValue(onChange, onSaveError, next);
          },
        },
        ...options.map(([optionValue, optionLabel]) =>
          react.createElement("option", { key: optionValue || "default", value: optionValue }, optionLabel)
        )
      ),
      react.createElement(SettingsUiIcon, { name: "down", size: 14, className: "settings-select-chevron" })
    );
  };

  const ConfigFontSelector = ({
    name,
    info,
    settingKey,
    defaultValue,
    disabled,
    onChange = () => { },
  }) => {
    const safeDefaultValue = cleanEditableFont(defaultValue);
    const [useCustomFont, setUseCustomFont] = useState(() => isCustomFontValue(safeDefaultValue));
    const [selectedFont, setSelectedFont] = useState(() =>
      GOOGLE_FONTS.includes(safeDefaultValue) ? safeDefaultValue : "Pretendard Variable");
    const [customFont, setCustomFont] = useState(() =>
      isCustomFontValue(safeDefaultValue) ? safeDefaultValue : "");
    const fontChangeSourceRef = useRef(null);

    useEffect(() => {
      const safeVal = cleanEditableFont(defaultValue);
      const localChangeSource = fontChangeSourceRef.current;
      fontChangeSourceRef.current = null;

      if (localChangeSource === "custom") {
        setUseCustomFont(true);
        setCustomFont(safeVal);
        return;
      }

      if (localChangeSource === "preset") {
        setUseCustomFont(false);
        if (safeVal && GOOGLE_FONTS.includes(safeVal)) setSelectedFont(safeVal);
        return;
      }

      const isCustom = isCustomFontValue(safeVal);
      setUseCustomFont(isCustom);
      if (isCustom) {
        setCustomFont(safeVal);
      } else if (safeVal && GOOGLE_FONTS.includes(safeVal)) {
        setSelectedFont(safeVal);
      }
    }, [defaultValue]);

    const commitFont = (source, font) => {
      fontChangeSourceRef.current = source;
      if (commitSettingsControlValue(onChange, onSaveError, settingKey || name, font)) return true;
      fontChangeSourceRef.current = null;
      return false;
    };

    const handleFontChange = (event) => {
      if (disabled) return;
      const font = event.target.value;
      if (useCustomFont || commitFont("preset", font)) setSelectedFont(font);
    };

    const handleCustomFontChange = (event) => {
      if (disabled) return;
      const font = event.target.value;
      if (!useCustomFont || commitFont("custom", font)) setCustomFont(font);
    };

    const handleModeChange = (nextMode) => {
      if (disabled) return;
      const nextUseCustom = nextMode === "custom";
      if (nextUseCustom === useCustomFont) return;

      const font = nextUseCustom ? customFont.trim() : selectedFont;
      if (!font || commitFont(nextMode, font)) setUseCustomFont(nextUseCustom);
    };

    const fontSelector = react.createElement(
      "div",
      { className: "config-font-selector" },
      react.createElement(
        "div",
        {
          className: "config-font-mode",
          role: "group",
          "aria-label": getSettingsText("settings.fontSelector.mode", "Font input mode"),
        },
        react.createElement(
          "button",
          {
            type: "button",
            className: `config-font-mode-button${useCustomFont ? "" : " active"}`,
            onClick: () => handleModeChange("preset"),
            disabled,
            "aria-pressed": !useCustomFont,
          },
          getSettingsText("settings.fontSelector.preset", "Font list")
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: `config-font-mode-button${useCustomFont ? " active" : ""}`,
            onClick: () => handleModeChange("custom"),
            disabled,
            "aria-pressed": useCustomFont,
          },
          getSettingsText("settings.fontSelector.custom", "Manual input")
        )
      ),
      react.createElement(
        "div",
        { className: "config-font-field" },
        useCustomFont
          ? react.createElement("input", {
            className: "config-font-selector-control config-text-input",
            type: "text",
            value: customFont,
            onChange: handleCustomFontChange,
            disabled,
            placeholder: translate("settings.fontPlaceholder") || "Enter font name (e.g., Arial, Roboto)",
            "aria-label": `${name || "Font"} ${getSettingsText("settings.fontSelector.custom", "Manual input")}`,
            spellCheck: false,
          })
          : react.createElement(
            "select",
            {
              className: "config-font-selector-control config-select",
              value: selectedFont,
              onChange: handleFontChange,
              disabled,
              "aria-label": `${name || "Font"} ${getSettingsText("settings.fontSelector.preset", "Font list")}`,
            },
            GOOGLE_FONTS.map((font) =>
              react.createElement("option", { key: font, value: font }, font)
            )
          )
      )
    );

    // name이 있으면 전체 setting-row로 래핑, 없으면 컨트롤만 반환
    if (name) {
      return react.createElement(
        "div",
        {
          className: `setting-row config-font-setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
          "data-setting-key": settingKey,
          style: disabled ? { opacity: 0.5, pointerEvents: "none" } : {},
        },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            { className: "setting-row-left" },
            react.createElement("div", { className: "setting-name" }, name),
            info &&
            react.createElement("div", {
              className: "setting-description",
              dangerouslySetInnerHTML: {
                __html: info,
              },
            })
          ),
          react.createElement(
            "div",
            { className: "setting-row-right" },
            fontSelector
          )
        )
      );
    }

    return fontSelector;
  };

  return { SettingsFontPicker, ConfigFontSelector };
}
