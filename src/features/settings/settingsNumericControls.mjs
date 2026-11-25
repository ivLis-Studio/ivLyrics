import { commitSettingsControlValue } from "./settingsControlCommit.mjs";
import { SETTINGS_TEXT_DRAFT_ATTRIBUTE, useSettingsTextDraft } from "./settingsTextDraft.mjs";

const getSettingsWeightSample = (language) => {
  const code = String(language || "").toLowerCase();
  if (code.startsWith("ko")) return "가";
  if (code.startsWith("ja")) return "あ";
  if (code.startsWith("zh")) return "字";
  return "Aa";
};

export function createSettingsNumericControls({
  react, host, getDocument, getLanguage, getSettingsText, SettingsUiIcon,
  hasSettingDefault, getSettingDefaultValue, settingValuesEqual, onSaveError,
}) {
  const { useCallback, useEffect, useRef, useState } = react;

  const commitNumber = (next, committed, showValue, onChange) => {
    const accepted = next === committed.current || commitSettingsControlValue(onChange, onSaveError, next);
    if (accepted) committed.current = next;
    showValue(committed.current);
    return accepted;
  };

  function useDragCleanup(dragRef, finishDrag, disabled) {
    useEffect(() => {
      if (disabled) finishDrag();
    }, [disabled]);
    useEffect(() => {
      const cancel = () => finishDrag();
      host.addEventListener("blur", cancel);
      return () => {
        host.removeEventListener("blur", cancel);
        dragRef.current = null;
      };
    }, []);
  }

  const getSettingsStepDecimals = (step) => {
    const text = String(step ?? "");
    return text.includes(".") ? text.split(".")[1].length : 0;
  };

  const formatSettingsNumber = (value, step) => {
    const number = Number(value);
    if (value === "" || value === null || value === undefined || !Number.isFinite(number)) return "";
    const decimals = getSettingsStepDecimals(step);
    return decimals
      ? number.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")
      : String(Math.round(number));
  };

  const snapSettingsNumber = (value, min, max, step) => {
    const safeStep = Number(step) > 0 ? Number(step) : 1;
    const low = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
    const high = Number.isFinite(Number(max)) ? Number(max) : Infinity;
    const base = Number.isFinite(low) ? low : 0;
    const snapped = Math.round((Number(value) - base) / safeStep) * safeStep + base;
    return Number(Math.min(high, Math.max(low, snapped)).toFixed(getSettingsStepDecimals(safeStep)));
  };

  const getSettingsFineKeyLabel = (browser) =>
    /Mac/i.test(browser?.platform || "") ? "⌥" : "Alt";

  const parseDraftNumber = (text) => {
    const raw = text.replace(",", ".").trim();
    const number = Number(raw);
    return raw && Number.isFinite(number) ? number : null;
  };

  // Typed numbers commit on Enter or blur; the wheel never edits them because
  // they are text fields. Escape is handled by the settings window: it puts the
  // value from before the edit back and leaves the field.
  const SettingsNumberField = ({
    value, min, max, step = 1, unit = "", label, disabled, onCommit = () => { }, className = "",
    readConfiguredValue,
  }) => {
    const draft = useSettingsTextDraft(react, formatSettingsNumber(value, step), readConfiguredValue);
    const commitDraft = (text) => {
      const parsed = parseDraftNumber(text);
      if (parsed === null || disabled) return;
      const next = snapSettingsNumber(parsed, min, max, step);
      if (!settingValuesEqual(next, value)) onCommit(next);
    };
    const stepBy = (event, direction) => {
      const base = Number(draft.text);
      const start = Number.isFinite(base) ? base : Number(min) || 0;
      const next = snapSettingsNumber(start + direction * (Number(step) || 1) * (event.shiftKey ? 10 : 1), min, max, step);
      draft.cancel();
      if (!settingValuesEqual(next, value)) onCommit(next);
    };
    return react.createElement(
      "label",
      { className: `settings-value-chip${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}` },
      react.createElement("input", {
        type: "text",
        inputMode: "decimal",
        className: "settings-value-input",
        value: draft.text,
        [SETTINGS_TEXT_DRAFT_ATTRIBUTE]: "",
        disabled,
        spellCheck: false,
        autoComplete: "off",
        "aria-label": label,
        onFocus: (event) => event.target.select?.(),
        onChange: (event) => draft.change(event.target.value),
        onBlur: (event) => draft.finish(event, commitDraft),
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            stepBy(event, event.key === "ArrowUp" ? 1 : -1);
          }
        },
      }),
      unit ? react.createElement("span", { className: "settings-unit", "aria-hidden": "true" }, unit) : null
    );
  };

  // − value + for small whole-number ranges and numeric option lists.
  const SettingsStepper = ({ value, values, min, max, step = 1, label, disabled, onChange = () => { } }) => {
    const list = Array.isArray(values) ? values : null;
    const index = list ? list.findIndex((candidate) => String(candidate) === String(value)) : -1;
    const numeric = Number(value);
    const atMin = list ? index <= 0 : Number.isFinite(Number(min)) && numeric <= Number(min);
    const atMax = list ? index === list.length - 1 || index < 0 : Number.isFinite(Number(max)) && numeric >= Number(max);
    const move = (direction) => {
      if (disabled) return;
      if (list) {
        const next = list[Math.min(list.length - 1, Math.max(0, (index < 0 ? 0 : index) + direction))];
        if (next !== undefined && String(next) !== String(value)) onChange(next);
        return;
      }
      const next = snapSettingsNumber((Number.isFinite(numeric) ? numeric : Number(min) || 0) + direction * (Number(step) || 1), min, max, step);
      if (!settingValuesEqual(next, value)) onChange(next);
    };
    return react.createElement(
      "div",
      { className: "settings-stepper", role: "group", "aria-label": label },
      react.createElement(
        "button",
        { type: "button", className: "settings-stepper-btn", "aria-label": `${label} −`, disabled: disabled || atMin, onClick: () => move(-1) },
        react.createElement(SettingsUiIcon, { name: "minus", size: 15 })
      ),
      react.createElement("output", { className: "settings-stepper-value", "aria-live": "polite" }, String(value ?? "")),
      react.createElement(
        "button",
        { type: "button", className: "settings-stepper-btn", "aria-label": `${label} +`, disabled: disabled || atMax, onClick: () => move(1) },
        react.createElement(SettingsUiIcon, { name: "plus", size: 15 })
      )
    );
  };

  // Compact number for table cells: drag sideways to adjust (Shift faster,
  // Alt/Option finer), click to type, arrow keys step.
  const SettingsScrubField = ({
    value, min = 0, max = 100, step = 1, unit = "", label, weight = false, disabled, onChange = () => { },
    readConfiguredValue,
  }) => {
    const low = Number(min);
    const high = Number(max);
    const toNumber = (input) => {
      const number = Number(input);
      return input !== "" && input !== null && input !== undefined && Number.isFinite(number) ? number : low;
    };
    const [current, setCurrent] = useState(() => toNumber(value));
    const draft = useSettingsTextDraft(react, formatSettingsNumber(current, step), readConfiguredValue);
    const [dragging, setDragging] = useState(false);
    const currentRef = useRef(current);
    const committedRef = useRef(current);
    const dragRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
      dragRef.current = null;
      const next = toNumber(value);
      committedRef.current = next;
      currentRef.current = next;
      setCurrent(next);
      setDragging(false);
    }, [value]);

    const showValue = (next) => {
      if (next === currentRef.current) return;
      currentRef.current = next;
      setCurrent(next);
    };
    const emit = (next) => {
      if (!disabled) commitNumber(next, committedRef, showValue, onChange);
    };
    const span = high - low || 1;
    const percent = Math.min(100, Math.max(0, ((current - low) / span) * 100));
    const finishDrag = (event) => {
      const drag = dragRef.current;
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      dragRef.current = null;
      setDragging(false);
      if (event?.type !== "pointerup" || disabled || !Object.is(drag.configured, readConfiguredValue?.())) {
        showValue(committedRef.current);
      } else if (drag.moved) {
        emit(currentRef.current);
      } else {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      }
    };
    useDragCleanup(dragRef, finishDrag, disabled);
    const commitDraft = (text) => {
      const parsed = parseDraftNumber(text);
      if (parsed === null) return;
      emit(snapSettingsNumber(parsed, low, high, step));
    };
    const hint = getSettingsText("settingsUi.controls.scrubHint", "Drag sideways to adjust · Shift faster · {fineKey} finer")
      .replace("{fineKey}", getSettingsFineKeyLabel(host.navigator));
    return react.createElement(
      "div",
      {
        className: `settings-scrub${weight ? " is-weight" : ""}${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`,
        style: { "--scrub-percent": `${percent}%` },
        title: `${label} · ${hint}`,
        onPointerDown: (event) => {
          if (disabled || event.button !== 0 || dragRef.current || getDocument().activeElement === inputRef.current) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragRef.current = {
            x: event.clientX, last: event.clientX, value: currentRef.current,
            moved: false, pointerId: event.pointerId, configured: readConfiguredValue?.(),
          };
          setDragging(true);
        },
        onPointerMove: (event) => {
          const drag = dragRef.current;
          if (!drag || event.pointerId !== drag.pointerId) return;
          if (!drag.moved && Math.abs(event.clientX - drag.x) <= 2) return;
          drag.moved = true;
          // Apply each movement separately so changing Shift/Alt mid-drag never jumps.
          const speed = event.shiftKey ? 4 : event.altKey ? 0.2 : 1;
          drag.value = Math.min(high, Math.max(low, drag.value + (event.clientX - drag.last) * (span / 240) * speed));
          drag.last = event.clientX;
          // Keep high-frequency motion local; saving also refreshes every
          // settings row and the playing lyrics, so do that once on release.
          showValue(snapSettingsNumber(drag.value, low, high, step));
        },
        onPointerUp: finishDrag,
        onPointerCancel: finishDrag,
        onLostPointerCapture: finishDrag,
      },
      react.createElement("span", { className: "settings-scrub-bar", "aria-hidden": "true" }),
      react.createElement("input", {
        ref: inputRef,
        type: "text",
        inputMode: "decimal",
        className: "settings-scrub-input",
        value: draft.text,
        [SETTINGS_TEXT_DRAFT_ATTRIBUTE]: "",
        disabled,
        spellCheck: false,
        autoComplete: "off",
        "aria-label": label,
        onChange: (event) => draft.change(event.target.value),
        onBlur: (event) => draft.finish(event, commitDraft),
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = snapSettingsNumber(currentRef.current + (event.key === "ArrowUp" ? 1 : -1) * (Number(step) || 1) * (event.shiftKey ? 10 : 1), low, high, step);
            draft.cancel();
            emit(next);
          }
        },
      }),
      weight
        ? react.createElement("span", { className: "settings-scrub-tail", "aria-hidden": "true" }, FONT_WEIGHT_NAMES[current] || "")
        : unit
          ? react.createElement("span", { className: "settings-scrub-tail", "aria-hidden": "true" }, String(unit).trim())
          : null
    );
  };

  const ConfigSliderRange = ({
    name,
    settingKey,
    defaultValue,
    min = 0,
    max = 100,
    step = 1,
    unit = "",
    disabled,
    className = "",
    ariaValueFormatter,
    variant = "range",
    onChange = () => { },
    readConfiguredValue,
  }) => {
    const toNumber = (input) => {
      const number = Number(input);
      return input !== "" && input !== null && input !== undefined && Number.isFinite(number)
        ? number
        : Number(min) || 0;
    };
    const [value, setValue] = useState(() => toNumber(defaultValue));
    const currentRef = useRef(value);
    const committedRef = useRef(value);
    const dragRef = useRef(null);
    useEffect(() => {
      dragRef.current = null;
      const next = toNumber(defaultValue);
      currentRef.current = next;
      committedRef.current = next;
      setValue(next);
    }, [defaultValue]);

    const showValue = (next) => {
      currentRef.current = next;
      setValue(next);
    };
    const updateValue = useCallback(
      (newValue) => {
        return !disabled && commitNumber(newValue, committedRef, showValue, onChange);
      },
      [onChange, disabled]
    );

    const handleInput = useCallback(
      (event) => {
        if (disabled) return;
        const next = Number(event.target.value);
        if (dragRef.current) showValue(next);
        else updateValue(next);
      },
      [updateValue, disabled]
    );
    const finishDrag = (event) => {
      const drag = dragRef.current;
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      dragRef.current = null;
      if (event?.type === "pointerup" && !disabled && Object.is(drag.configured, readConfiguredValue?.())) updateValue(currentRef.current);
      else showValue(committedRef.current);
    };
    useDragCleanup(dragRef, finishDrag, disabled);

    const span = max - min || 1;
    const progress = Math.min(100, Math.max(0, ((value - min) / span) * 100));
    const unitText = String(unit || "").trim();
    const defaultNumber = settingKey && hasSettingDefault(settingKey) && getSettingDefaultValue(settingKey) !== ""
      ? Number(getSettingDefaultValue(settingKey))
      : NaN;
    const showDefault = Number.isFinite(defaultNumber) && defaultNumber >= min && defaultNumber <= max;
    const isWeight = variant === "weight";

    if (variant === "stepper") {
      return react.createElement(SettingsStepper, {
        value,
        min,
        max,
        step,
        label: name,
        disabled,
        onChange: updateValue,
      });
    }

    const slider = react.createElement(
      "div",
      {
        className: `slider-container settings-range${isWeight ? " settings-weight" : ""}${className ? ` ${className}` : ""}${disabled ? " disabled" : ""}`,
      },
      isWeight
        ? react.createElement("span", {
          className: "settings-weight-sample",
          style: { fontWeight: value },
          "aria-hidden": "true",
        }, getSettingsWeightSample(getLanguage()))
        : null,
      react.createElement(
        "div",
        { className: "settings-range-track" },
        react.createElement("input", {
          type: "range",
          min,
          max,
          step,
          value,
          disabled,
          onChange: handleInput,
          onPointerDown: (event) => {
            if (disabled || event.button !== 0 || dragRef.current) return;
            dragRef.current = { pointerId: event.pointerId, configured: readConfiguredValue?.() };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          },
          onPointerUp: finishDrag,
          onPointerCancel: finishDrag,
          onLostPointerCapture: finishDrag,
          "aria-label": name,
          "aria-valuetext": ariaValueFormatter
            ? ariaValueFormatter(Number(value))
            : `${value}${unit}`,
          className: "config-slider",
          style: { "--progress-percent": `${progress}%` },
        }),
        showDefault
          ? react.createElement("span", {
            className: "settings-range-default",
            style: { "--default-percent": ((defaultNumber - min) / span) * 100 },
            "aria-hidden": "true",
          })
          : null
      ),
      isWeight
        ? react.createElement("span", { className: "settings-weight-name" }, FONT_WEIGHT_NAMES[value] || String(value))
        : react.createElement(SettingsNumberField, {
          value,
          min,
          max,
          step,
          unit: unitText,
          label: name,
          disabled,
          onCommit: updateValue,
          readConfiguredValue,
        })
    );

    if (variant !== "fps") return slider;

    // Frame cap: a large readout, the slider and the common refresh rates.
    const presets = [30, 60, 90, 120, 144, 165, 240].filter((mark) => mark >= min && mark <= max);
    return react.createElement(
      "div",
      { className: "settings-fps" },
      react.createElement(
        "div",
        { className: "settings-fps-top" },
        react.createElement(
          "div",
          { className: "settings-fps-value", "aria-hidden": "true" },
          String(value),
          react.createElement("small", null, unitText)
        ),
        slider
      ),
      react.createElement(
        "div",
        { className: "settings-presets", role: "group", "aria-label": name },
        ...presets.map((mark) =>
          react.createElement(
            "button",
            {
              key: mark,
              type: "button",
              className: `settings-preset-btn${Number(value) === mark ? " is-on" : ""}`,
              "aria-pressed": Number(value) === mark,
              disabled,
              onClick: () => updateValue(mark),
            },
            String(mark)
          )
        )
      )
    );
  };

  const FONT_WEIGHT_NAMES = {
    100: "Thin",
    200: "Extra Light",
    300: "Light",
    400: "Regular",
    500: "Medium",
    600: "Semi Bold",
    700: "Bold",
    800: "Extra Bold",
    900: "Black",
  };

  const ConfigFontWeightSlider = (props) =>
    react.createElement(ConfigSliderRange, {
      ...props,
      min: 100,
      max: 900,
      step: 100,
      unit: "",
      variant: "weight",
      className: `font-weight-slider${props.className ? ` ${props.className}` : ""}`,
      ariaValueFormatter: (value) => `${value} ${FONT_WEIGHT_NAMES[value] || ""}`.trim(),
    });

  return { ConfigSliderRange, ConfigFontWeightSlider, SettingsStepper, SettingsScrubField };
}
