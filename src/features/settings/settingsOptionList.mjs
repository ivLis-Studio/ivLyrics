import { getSettingsSelectionEntries, resolveSettingsSelectionPresentation } from "./settingsChoiceControls.mjs";
import { isSettingsControlDisabled, resetSettingsControl } from "./settingsControlCommit.mjs";

// Controls that need the full row width sit under their label.
const SETTINGS_STACKED_ROW_KINDS = new Set(["cards", "color-presets", "fps", "custom"]);

export function createSettingsToggleRowInteractions(getSelection) {
  const settingsToggleRowPointers = new WeakMap();

  const handleSettingsToggleRowPointerDown = (event) => {
    settingsToggleRowPointers.set(event.currentTarget, { x: event.clientX, y: event.clientY });
  };

  // On/off rows toggle from their label and description too. A press that
  // wandered (drag, text selection) is not a click.
  const handleSettingsToggleRowClick = (event) => {
    const area = event.currentTarget;
    if (event.target?.closest?.("a, button, input, select, textarea, label, [role='switch']")) return;
    const down = settingsToggleRowPointers.get(area);
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const selection = getSelection();
    if (selection && String(selection)) return;
    const row = area.closest(".setting-row");
    if (!row || row.classList.contains("is-disabled")) return;
    const toggle = row.querySelector(".setting-row-right .switch-checkbox");
    if (toggle && !toggle.disabled) toggle.click();
  };

  return { handleSettingsToggleRowPointerDown, handleSettingsToggleRowClick };
}

export function createSettingsOptionList({
  react, controls, ownRowControls, SettingsUiIcon, getSettingsText, readVisualSettings,
  isSettingChanged, hasSettingDefault, getSettingDefaultValue, listenForSettings,
  publishSettingsRefresh, handleSettingsToggleRowPointerDown, handleSettingsToggleRowClick, onSaveError,
}) {
  const { useEffect, useState } = react;
  const { ConfigSlider, ConfigFontWeightSlider, ConfigSliderRange, ConfigSelection, ConfigColorPicker, ColorPresetSelector } = controls;
  const selfRenderedTypes = new Set(ownRowControls);

  const getSettingsRowKind = (item) => {
    if (item.type === ConfigSlider) return "toggle";
    if (item.type === ConfigFontWeightSlider) return "weight";
    if (item.type === ConfigSliderRange) {
      if (item.presentation === "stepper") return "stepper";
      if (item.presentation === "fps") return "fps";
      return "range";
    }
    if (item.type === ConfigSelection) {
      return resolveSettingsSelectionPresentation(getSettingsSelectionEntries(item.options), item.presentation);
    }
    if (item.type === ConfigColorPicker) return "color";
    if (item.type === ColorPresetSelector) return "color-presets";
    return "custom";
  };

  const renderSettingsJumpLink = (jump) =>
    jump && react.createElement(
      "button",
      {
        type: "button",
        className: "settings-jump-link",
        onClick: jump.onClick,
      },
      react.createElement("span", null, jump.label),
      react.createElement(SettingsUiIcon, { name: "right", size: 13 })
    );

  const OptionList = ({ items, onChange }) => {
    const [, forceUpdate] = useState();

    useEffect(() => {
      const configListener = (event) => {
        if (event.detail?.type !== "config") return;
        forceUpdate({});
      };

      return listenForSettings(configListener);
    }, []);

    const resetLabel = getSettingsText("creatorProfile.resetDecoration", "Reset to default");

    const renderedItems = (items || []).map((item, index) => {
      if (!item || (item.when && !item.when())) {
        return;
      }

      const onChangeItem = item.onChange || onChange;
      // Changed-setting rows disappear as they are reset. Keep each control's
      // local state with its setting instead of reusing the following row's state.
      const rowKey = item.key || index;
      const isDisabled = isSettingsControlDisabled(item.disabled);
      const dispatchRowChange = (name, ...args) => {
        if (isSettingsControlDisabled(item.disabled)) return false;
        const saved = onChangeItem(name, ...args);
        if (saved !== false) forceUpdate({});
        return saved;
      };

      // type이 "info"인 경우 - 정보 표시만 (토글 없음)
      if (item.type === "info") {
        return react.createElement(
          "div",
          {
            key: rowKey,
            className: "setting-row is-inline",
            "data-setting-key": item.key,
          },
          react.createElement(
            "div",
            { className: "setting-row-content" },
            react.createElement(
              "div",
              { className: "setting-row-left" },
              react.createElement("div", { className: "setting-name" }, item.desc)
            )
          )
        );
      }

      // ConfigButton, ConfigInput, ConfigHotkey, ConfigFontSelector는 자체적으로 setting-row를 만들므로 wrapper 불필요
      if (selfRenderedTypes.has(item.type)) {
        // item.onChange가 있으면 그것을 우선 사용 (업데이트 확인, 내보내기 등 커스텀 핸들러)
        const itemOnChange = item.onChange
          ? (...args) => isSettingsControlDisabled(item.disabled) ? false : item.onChange(...args)
          : (name, ...args) => dispatchRowChange(item.key || name, ...args);

        const selfRenderedRow = react.createElement(item.type, {
          ...item,
          key: rowKey,
          name: item.desc || item.key,
          settingKey: item.key,
          text: item.text,
          disabled: isDisabled,
          defaultValue:
            item.defaultValue !== undefined
              ? item.defaultValue
              : readVisualSettings()[item.key],
          onChange: itemOnChange,
        });
        if (!item.jump) return selfRenderedRow;
        return react.createElement(
          react.Fragment,
          { key: rowKey },
          selfRenderedRow,
          react.createElement("div", { className: "settings-jump-row" }, renderSettingsJumpLink(item.jump))
        );
      }

      const kind = getSettingsRowKind(item);
      const stacked = SETTINGS_STACKED_ROW_KINDS.has(kind) || item.layout === "stack";
      const changed = isSettingChanged(item.key);
      const canReset = kind !== "toggle" && !item.noReset && hasSettingDefault(item.key);
      const controlProps = {
        ...item,
        name: item.desc,
        settingKey: item.key,
        disabled: isDisabled,
        presentation: kind === "custom" ? item.presentation : kind,
        variant: kind === "stepper" || kind === "fps" ? kind : item.variant,
        defaultValue:
          item.defaultValue !== undefined
            ? item.defaultValue
            : readVisualSettings()[item.key],
        readConfiguredValue: item.readConfiguredValue || (() => readVisualSettings()[item.key]),
        onChange: (value) => dispatchRowChange(item.key, value),
      };
      delete controlProps.key;

      return react.createElement(
        "div",
        {
          key: rowKey,
          className: [
            "setting-row",
            stacked ? "is-stack" : "is-inline",
            kind === "toggle" ? "is-toggle-row" : "",
            changed ? "is-changed" : "",
            isDisabled ? "is-disabled" : "",
          ].filter(Boolean).join(" "),
          "data-setting-key": item.key,
          "data-control": kind,
          "data-search-exclude": item.searchable === false ? "true" : undefined,
        },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            {
              className: "setting-row-left",
              onPointerDown: kind === "toggle" ? handleSettingsToggleRowPointerDown : undefined,
              onClick: kind === "toggle" ? handleSettingsToggleRowClick : undefined,
            },
            react.createElement(
              "div",
              { className: "setting-name-row" },
              react.createElement("div", { className: "setting-name" }, item.desc),
              item.cost && react.createElement("span", { className: "settings-cost-tag" }, "GPU")
            ),
            item.info &&
            react.createElement("div", {
              className: "setting-description",
              dangerouslySetInnerHTML: {
                __html: item.info,
              },
            }),
            renderSettingsJumpLink(item.jump)
          ),
          react.createElement(
            "div",
            { className: "setting-row-right" },
            react.createElement(item.type, controlProps),
            canReset && react.createElement(
              "button",
              {
                type: "button",
                className: "settings-reset-btn",
                title: resetLabel,
                "aria-label": `${item.desc} · ${resetLabel}`,
                "aria-hidden": changed ? undefined : "true",
                tabIndex: changed ? 0 : -1,
                disabled: isDisabled,
                onClick: () => {
                  if (resetSettingsControl(item, dispatchRowChange, getSettingDefaultValue, onSaveError)) {
                    publishSettingsRefresh(item.key);
                  }
                },
              },
              react.createElement(SettingsUiIcon, { name: "reset", size: 14 })
            )
          )
        )
      );
    });

    // Wrapper로 감싸서 반환
    return react.createElement(
      "div",
      { className: "option-list-wrapper" },
      ...renderedItems
    );
  };

  return OptionList;
}
