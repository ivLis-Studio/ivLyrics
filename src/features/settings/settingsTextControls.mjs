import { renderSettingsControlRow } from "./settingsSectionShell.mjs";
import { commitSettingsControlValue } from "./settingsControlCommit.mjs";

export function createSettingsTextControls({ react, translate, SettingsUiIcon, getCheckIcon, isSettingChanged, onSaveError }) {
  const { useCallback, useEffect, useRef, useState } = react;

  const ButtonSVG = react.memo(
    ({ icon, active = true, onClick, disabled = false, label }) => {
      return react.createElement(
        "button",
        {
          type: "button",
          className: `switch-checkbox${active ? " active" : ""}`,
          onClick,
          disabled,
          "aria-checked": active,
          "aria-label": label,
          role: "switch",
        },
        react.createElement("svg", {
          width: 12,
          height: 12,
          viewBox: "0 0 16 16",
          fill: "currentColor",
          dangerouslySetInnerHTML: {
            __html: icon,
          },
        })
      );
    }
  );

  const ConfigButton = ({ name, settingKey, info, text, rowClassName, disabled = false, searchable = true, onChange = () => { } }) => {
    return renderSettingsControlRow(react, {
      rowProps: {
        className: rowClassName ? `setting-row ${rowClassName}` : "setting-row",
        "data-setting-key": settingKey,
        "data-search-exclude": searchable === false ? "true" : undefined,
      },
      name,
      description: [info && react.createElement("div", {
        className: "setting-description", dangerouslySetInnerHTML: { __html: info },
      })],
    },
      react.createElement(
        "button",
        {
          className: "btn",
          disabled,
          onClick: (event) => onChange(settingKey || name, event),
        },
        text
      )
    );
  };

  const ConfigSlider = react.memo(
    ({ name, defaultValue, disabled, onChange = () => { } }) => {
      const [active, setActive] = useState(defaultValue);
      const activeRef = useRef(defaultValue);

      useEffect(() => {
        activeRef.current = defaultValue;
        setActive(defaultValue);
      }, [defaultValue]);

      const toggleState = useCallback(() => {
        if (disabled) return;
        const newState = !activeRef.current;
        // Persist from the input event, not a replayable React state updater.
        if (commitSettingsControlValue(onChange, onSaveError, newState)) {
          activeRef.current = newState;
          setActive(newState);
        }
      }, [onChange, disabled]);

      return react.createElement(ButtonSVG, {
        icon: getCheckIcon(),
        active,
        onClick: toggleState,
        disabled,
        label: name,
      });
    }
  );

  const ConfigWarning = ({ message, settingKey }) => {
    return react.createElement(
      "div",
      {
        className: "setting-row settings-note-row",
        "data-setting-key": settingKey,
        "data-control": "note",
      },
      react.createElement(
        "div",
        { className: "settings-note is-warn" },
        react.createElement(SettingsUiIcon, { name: "warn", size: 16 }),
        react.createElement(
          "div",
          { className: "settings-note-body" },
          react.createElement("div", { className: "setting-name" }, translate("settings.solidBackgroundInUse")),
          react.createElement("div", { className: "setting-description" }, message)
        )
      )
    );
  };

  // 정보 표시용 컴포넌트 (헬퍼 프로그램 안내 등)
  const ConfigInfo = ({ message, buttonText, onButtonClick, settingKey }) => {
    return react.createElement(
      "div",
      {
        className: "setting-row config-info-row settings-note-row",
        "data-setting-key": settingKey,
        "data-control": "note",
      },
      react.createElement(
        "div",
        { className: "settings-note is-info" },
        react.createElement(SettingsUiIcon, { name: "info", size: 16 }),
        react.createElement(
          "div",
          { className: "settings-note-body" },
          react.createElement("div", { className: "setting-description config-info-message" }, message),
          buttonText && onButtonClick && react.createElement(
            "div",
            { className: "settings-note-actions" },
            react.createElement(
              "button",
              { type: "button", className: "btn btn-sm", onClick: onButtonClick },
              buttonText
            )
          )
        )
      )
    );
  };

  const ConfigInput = ({ name, settingKey, defaultValue, onChange = () => { }, inputType = "text", disabled = false }) => {
    const [value, setValue] = useState(defaultValue);

    useEffect(() => {
      setValue(defaultValue ?? "");
    }, [defaultValue]);

    const setValueCallback = useCallback(
      (event) => {
        if (disabled) return;
        const nextValue = event.target.value;
        if (commitSettingsControlValue(onChange, onSaveError, settingKey || name, nextValue)) setValue(nextValue);
      },
      [name, settingKey, onChange, disabled]
    );

    return renderSettingsControlRow(react, {
      rowProps: {
        className: `setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
        "data-setting-key": settingKey,
      },
      name,
    },
      react.createElement("input", {
        className: "config-text-input",
        type: inputType,
        disabled,
        value: value ?? "",
        onChange: setValueCallback,
        "aria-label": name,
      })
    );
  };

  return { ConfigButton, ConfigSlider, ConfigWarning, ConfigInfo, ConfigInput };
}
