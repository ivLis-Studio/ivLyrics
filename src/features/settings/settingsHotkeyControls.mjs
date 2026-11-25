import { captureKeyboardShortcut, formatKeyboardShortcut } from "../../core/keyboardShortcut.mjs";

export function getRecordingHotkeyControl(event) {
  const target = event.composedPath?.()[0] ?? event.target;
  return target?.closest?.(".config-hotkey-recorder.recording") ?? null;
}

export function createSettingsHotkeyControls({ react, host, getSettingsText, isSettingChanged, translate }) {
  const { useState, useRef, useEffect, useCallback } = react;

  const ConfigHotkey = ({ name, settingKey, defaultValue, onChange = () => { } }) => {
    const [value, setValue] = useState(defaultValue || "");
    const [isRecording, setIsRecording] = useState(false);
    const recorderRef = useRef(null);

    useEffect(() => {
      setValue(defaultValue || "");
    }, [defaultValue]);

    const commitHotkey = useCallback((nextValue) => {
      setValue(nextValue);
      onChange(settingKey || name, nextValue);
    }, [name, onChange, settingKey]);

    useEffect(() => {
      if (!isRecording) return undefined;

      const handleRecordingKeyDown = (event) => {
        const recorder = recorderRef.current;
        if (!recorder || getRecordingHotkeyControl(event) !== recorder) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        if (event.repeat || event.isComposing || event.keyCode === 229) return;

        if (event.key === "Escape") {
          setIsRecording(false);
          return;
        }

        const hasModifiers = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
        if (!hasModifiers && (event.key === "Backspace" || event.key === "Delete")) {
          commitHotkey("");
          setIsRecording(false);
          return;
        }

        const nextValue = captureKeyboardShortcut(event);
        if (!nextValue) return;

        commitHotkey(nextValue);
        setIsRecording(false);
      };

      host.addEventListener("keydown", handleRecordingKeyDown, true);
      return () => host.removeEventListener("keydown", handleRecordingKeyDown, true);
    }, [commitHotkey, isRecording]);

    const keycaps = formatKeyboardShortcut(value);
    const startRecording = () => {
      setIsRecording(true);
      recorderRef.current?.focus();
    };

    return react.createElement(
      "div",
      {
        className: `setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
        "data-setting-key": settingKey,
      },
      react.createElement(
        "div",
        { className: "setting-row-content" },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement("div", { className: "setting-name" }, name)
        ),
        react.createElement(
          "div",
          { className: "setting-row-right" },
          react.createElement(
            "div",
            { className: "config-hotkey-control" },
            react.createElement(
              "button",
              {
                ref: recorderRef,
                type: "button",
                className: `config-hotkey-recorder${isRecording ? " recording" : ""}`,
                onClick: startRecording,
                onBlur: () => setIsRecording(false),
                "aria-label": isRecording
                  ? `${name}: ${getSettingsText("settings.hotkey.recording", "Press a key combination")}`
                  : `${name}: ${value || getSettingsText("settings.hotkey.unassigned", "Not assigned")}`,
                "aria-pressed": isRecording,
                title: getSettingsText("settings.hotkey.hint", "Click, then press the desired key combination"),
              },
              isRecording
                ? react.createElement(
                  "span",
                  { className: "config-hotkey-recording-state" },
                  react.createElement("span", { className: "config-hotkey-recording-dot", "aria-hidden": "true" }),
                  getSettingsText("settings.hotkey.recording", "Press a key combination")
                )
                : keycaps.length > 0
                  ? react.createElement(
                    "span",
                    { className: "config-hotkey-keycaps", "aria-hidden": "true" },
                    ...keycaps.map((label, index) =>
                      react.createElement(
                        "kbd",
                        { className: "config-hotkey-keycap", key: `${label}-${index}` },
                        label
                      )
                    )
                  )
                  : react.createElement(
                    "span",
                    { className: "config-hotkey-empty" },
                    getSettingsText("settings.hotkey.unassigned", "Not assigned")
                  ),
              react.createElement(
                "span",
                { className: "config-hotkey-edit-label", "aria-hidden": "true" },
                isRecording ? "Esc" : getSettingsText("settings.hotkey.change", "Change")
              )
            ),
            value && !isRecording && react.createElement(
              "button",
              {
                type: "button",
                className: "config-hotkey-clear",
                onClick: () => commitHotkey(""),
                "aria-label": `${name} ${getSettingsText("settings.hotkey.clear", "Clear shortcut")}`,
                title: getSettingsText("settings.hotkey.clear", "Clear shortcut"),
              },
              "×"
            ),
            react.createElement(
              "span",
              { className: "settings-visually-hidden", "aria-live": "polite" },
              isRecording
                ? getSettingsText("settings.hotkey.recording", "Press a key combination")
                : value
                  ? `${getSettingsText("settings.hotkey.saved", "Saved")}: ${value}`
                  : getSettingsText("settings.hotkey.unassigned", "Not assigned")
            )
          )
        )
      )
    );
  };

  const ConfigKeyList = ({ name, settingKey, defaultValue, onChange = () => { } }) => {
    const [keys, setKeys] = useState(() => {
      try {
        if (!defaultValue) return [""];
        // If it starts with [, treat as JSON array
        if (typeof defaultValue === 'string' && defaultValue.trim().startsWith('[')) {
          const parsed = JSON.parse(defaultValue);
          return Array.isArray(parsed) && parsed.length > 0 ? parsed : [""];
        }
        // Otherwise treat as single key
        return [defaultValue];
      } catch {
        return [defaultValue || ""];
      }
    });

    const updateKeys = (newKeys) => {
      setKeys(newKeys);
      // Save as JSON string
      onChange(settingKey || name, JSON.stringify(newKeys.filter(k => k.trim() !== "")));
    };

    const addKey = () => {
      updateKeys([...keys, ""]);
    };

    const removeKey = (index) => {
      const newKeys = keys.filter((_, i) => i !== index);
      if (newKeys.length === 0) newKeys.push(""); // Keep at least one input
      updateKeys(newKeys);
    };

    const updateKey = (index, value) => {
      const newKeys = [...keys];
      newKeys[index] = value;
      updateKeys(newKeys);
    };

    return react.createElement(
      "div",
      {
        className: `setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
        "data-setting-key": settingKey,
      },
      react.createElement(
        "div",
        { className: "setting-row-content", style: { flexDirection: "column", alignItems: "stretch", gap: "10px" } },
        react.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          react.createElement("div", { className: "setting-name" }, name),
          react.createElement("button", {
            className: "btn",
            onClick: addKey,
            style: { width: "auto", minWidth: "60px", padding: "4px 12px", fontSize: "12px" }
          }, translate("buttons.add"))
        ),
        keys.map((key, index) =>
          react.createElement("div", { key: index, style: { display: "flex", gap: "8px" } },
            react.createElement("input", {
              type: "text",
              value: key,
              placeholder: `${name} ${index + 1}`,
              onChange: (e) => updateKey(index, e.target.value),
              style: { flex: 1 }
            }),
            keys.length > 1 && react.createElement("button", {
              className: "btn",
              onClick: () => removeKey(index),
              style: { background: "#e91e63", borderColor: "#c2185b", minWidth: "36px", width: "36px", padding: 0 }
            }, "X")
          )
        )
      )
    );
  };

  // Sync Creator shortcuts: one row per action, primary and secondary keys.
  const SettingsHotkeyTable = ({ rows, columns, onChange }) =>
    react.createElement(
      "div",
      { className: "settings-hotkey-table", role: "table", "data-section-content": "true" },
      react.createElement("div", { className: "settings-hotkey-head", role: "columnheader" }),
      ...columns.map((column) =>
        react.createElement("div", { key: column, className: "settings-hotkey-head", role: "columnheader" }, column)
      ),
      ...rows.flatMap((row) => [
        react.createElement("div", { key: `${row.id}-label`, className: "settings-hotkey-label", role: "rowheader" }, row.label),
        ...row.items.map((item, index) =>
          react.createElement(
            "div",
            {
              key: item.key,
              className: `settings-hotkey-cell${isSettingChanged(item.key) ? " is-changed" : ""}`,
              role: "cell",
            },
            react.createElement(ConfigHotkey, {
              name: `${row.label} (${columns[index]})`,
              settingKey: item.key,
              defaultValue: item.defaultValue,
              onChange: (key, value) => onChange(key || item.key, value),
            })
          )
        ),
      ])
    );

  return { ConfigHotkey, ConfigKeyList, SettingsHotkeyTable };
}
