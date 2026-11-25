import { isSettingsControlDisabled, resetSettingsControl } from "./settingsControlCommit.mjs";

const getSettingsMatrixRowId = (key) => {
  const text = String(key || "");
  if (/-hyphen-replace$/.test(text)) return "hyphen";
  if (/-letter-spacing$/.test(text)) return "letterSpacing";
  if (/-outline-width$/.test(text)) return "outlineWidth";
  if (/-outline-color$/.test(text)) return "outlineColor";
  if (/-font-family$|-font$/.test(text)) return "font";
  if (/-font-weight$/.test(text)) return "weight";
  if (/-opacity$/.test(text)) return "opacity";
  if (/-spacing$/.test(text)) return "spacing";
  if (/-font-size$|-size$|-font-scale$/.test(text)) return "size";
  return text;
};

export function createSettingsLayerMatrix({
  react, host, useSettingsConfigRevision, getVisualSettings, getControls, getSettingsText,
  getSettingDefaultValue, hasSettingDefault, isSettingChanged, publishSettingsRefresh, onSaveError,
}) {
  const { useRef, useState, useEffect } = react;

  const getSettingsMatrixValue = (item) => {
    const current = item.readConfiguredValue ? item.readConfiguredValue() : getVisualSettings()?.[item.key];
    if (current !== undefined && current !== null && current !== "") return current;
    return item.defaultValue !== undefined ? item.defaultValue : current;
  };

  const isSettingsMatrixToggleOn = (toggle) => {
    if (!toggle) return true;
    const value = getVisualSettings()?.[toggle.key];
    return value === true || value === "true";
  };

  // Layers × properties table (lyric layers, panel lyrics, cultural notes, LP).
  // It follows its own width: a table, a table with labels above the cells,
  // or one layer at a time behind layer tabs in narrow windows.
  return function SettingsLayerMatrix({ columns, rows, onChange, label, muted = false, masterKey }) {
    const {
      ConfigFontSelector, SettingsFontPicker, ConfigFontWeightSlider, SettingsScrubField, ConfigSliderRange,
      ConfigColorPicker, ConfigSelection, ConfigSlider, SettingsSegmented, OptionList, SettingsUiIcon,
    } = getControls();
    useSettingsConfigRevision();
    const isMuted = muted || (masterKey ? !isSettingsMatrixToggleOn({ key: masterKey }) : false);
    const rootRef = useRef(null);
    const columnsRef = useRef(columns);
    columnsRef.current = columns;
    const [mode, setMode] = useState("table");
    const [activeColumn, setActiveColumn] = useState(columns[0]?.id);

    useEffect(() => {
      const root = rootRef.current;
      if (!root || typeof host.ResizeObserver !== "function") return undefined;
      const observer = new host.ResizeObserver((entries) => {
        const width = entries[0]?.contentRect?.width || root.clientWidth;
        const next = width <= 520 ? "tabs" : width < 780 ? "stacked" : "table";
        setMode((previous) => (previous === next ? previous : next));
      });
      observer.observe(root);
      return () => observer.disconnect();
    }, []);

    // Search and the changed view open the layer that holds the setting.
    useEffect(() => {
      const handleReveal = (event) => {
        const key = event.detail?.key;
        const column = columnsRef.current.find((candidate) =>
          candidate.anchor === key
          || candidate.toggle?.key === key
          || candidate.items.some((item) => item.key === key));
        if (column) setActiveColumn(column.id);
      };
      host.addEventListener("ivLyrics:settings-reveal", handleReveal);
      return () => host.removeEventListener("ivLyrics:settings-reveal", handleReveal);
    }, []);

    const resetLabel = getSettingsText("creatorProfile.resetDecoration", "Reset to default");
    const handlerFor = (column) => column.onChange || onChange;
    const handlerForItem = (column, item) => item.onChange || handlerFor(column);
    const rowLabels = new Map(rows.map((row) => [row.id, row.label]));
    const cellFor = (column, rowId) => column.items.find((item) => (item.row || getSettingsMatrixRowId(item.key)) === rowId);

    const renderControl = (column, item, ariaLabel, disabled) => {
      const commit = (value) => {
        if (!isSettingsMatrixToggleOn(column.toggle) || isSettingsControlDisabled(item.disabled)) return false;
        return handlerForItem(column, item)(item.key, value);
      };
      const readConfiguredValue = () => getSettingsMatrixValue(item);
      const value = readConfiguredValue();
      if (item.type === ConfigFontSelector) {
        return react.createElement(SettingsFontPicker, {
          value, readConfiguredValue, label: ariaLabel, disabled, allowEmpty: getSettingDefaultValue(item.key) === "", onChange: commit,
        });
      }
      if (item.type === ConfigFontWeightSlider) {
        return react.createElement(SettingsScrubField, {
          value, readConfiguredValue, min: 100, max: 900, step: 100, label: ariaLabel, weight: true, disabled, onChange: commit,
        });
      }
      if (item.type === ConfigSliderRange) {
        return react.createElement(SettingsScrubField, {
          value, readConfiguredValue, min: item.min, max: item.max, step: item.step, unit: item.unit, label: ariaLabel, disabled, onChange: commit,
        });
      }
      if (item.type === ConfigColorPicker) {
        return react.createElement(ConfigColorPicker, { name: ariaLabel, defaultValue: value, readConfiguredValue, disabled, onChange: commit });
      }
      if (item.type === ConfigSelection) {
        return react.createElement(ConfigSelection, {
          name: ariaLabel, defaultValue: value, options: item.options, compact: true, disabled, onChange: commit,
        });
      }
      return null;
    };

    const renderHead = (column, last) =>
      react.createElement(
        "div",
        {
          key: `head-${column.id}`,
          className: `settings-matrix-head${last ? " is-last" : ""}`,
          role: "columnheader",
          "data-setting-key": column.anchor || undefined,
          style: { "--layer-color": column.color },
        },
        react.createElement(
          "div",
          { className: "settings-matrix-layer" },
          react.createElement(
            "span",
            { className: "settings-matrix-layer-name" },
            react.createElement("i", { "aria-hidden": "true" }),
            column.label
          ),
          column.toggle
            ? react.createElement(ConfigSlider, {
              name: column.toggle.desc,
              defaultValue: isSettingsMatrixToggleOn(column.toggle),
              disabled: isSettingsControlDisabled(column.toggle.disabled),
              onChange: (value) => !isSettingsControlDisabled(column.toggle.disabled)
                && handlerForItem(column, column.toggle)(column.toggle.key, value),
            })
            : null
        ),
        column.subtitle ? react.createElement("div", { className: "settings-matrix-layer-sub" }, column.subtitle) : null
      );

    if (mode === "tabs") {
      const column = columns.find((candidate) => candidate.id === activeColumn) || columns[0];
      const listItems = [
        ...(column.toggle ? [{ ...column.toggle, type: ConfigSlider, defaultValue: isSettingsMatrixToggleOn(column.toggle) }] : []),
        ...column.items.map((item) => ({
          ...item,
          defaultValue: getSettingsMatrixValue(item),
          readConfiguredValue: () => getSettingsMatrixValue(item),
          when: () => isSettingsMatrixToggleOn(column.toggle) && (!item.when || item.when()),
        })),
      ];
      return react.createElement(
        "div",
        { ref: rootRef, className: `settings-matrix is-tabs${isMuted ? " is-muted" : ""}`, "data-section-content": "true" },
        react.createElement(
          "div",
          { className: "settings-matrix-switcher" },
          react.createElement(SettingsSegmented, {
            options: columns.map((candidate) => ({
              value: candidate.id,
              label: candidate.label,
              color: candidate.color,
              anchor: candidate.anchor,
            })),
            value: column.id,
            label,
            onChange: setActiveColumn,
          })
        ),
        react.createElement(OptionList, {
          key: column.id,
          items: listItems,
          onChange: handlerFor(column),
        })
      );
    }

    const cells = [react.createElement("div", { key: "corner", className: "settings-matrix-head is-corner", role: "columnheader" })];
    columns.forEach((column, index) => cells.push(renderHead(column, index === columns.length - 1)));
    rows.forEach((row) => {
      if (!columns.some((column) => cellFor(column, row.id))) return;
      cells.push(react.createElement("div", { key: `label-${row.id}`, className: "settings-matrix-label", role: "rowheader" }, row.label));
      columns.forEach((column, index) => {
        const item = cellFor(column, row.id);
        const last = index === columns.length - 1;
        if (!item) {
          cells.push(react.createElement("div", {
            key: `${row.id}-${column.id}`,
            className: `settings-matrix-cell is-empty${last ? " is-last" : ""}`,
            role: "cell",
            "aria-hidden": "true",
          }));
          return;
        }
        const off = column.toggle ? !isSettingsMatrixToggleOn(column.toggle) : false;
        const disabled = isSettingsControlDisabled(item.disabled);
        const changed = isSettingChanged(item.key);
        const ariaLabel = `${column.label} · ${rowLabels.get(row.id) || item.desc}`;
        cells.push(react.createElement(
          "div",
          {
            key: `${row.id}-${column.id}`,
            className: `settings-matrix-cell${changed ? " is-changed" : ""}${off ? " is-off" : ""}${last ? " is-last" : ""}`,
            role: "cell",
            "data-setting-key": item.key,
            style: { "--layer-color": column.color },
          },
          react.createElement("span", { className: "settings-visually-hidden setting-name" }, ariaLabel),
          renderControl(column, item, ariaLabel, off || disabled),
          !item.noReset && hasSettingDefault(item.key)
            ? react.createElement(
              "button",
              {
                type: "button",
                className: "settings-reset-btn is-cell",
                title: resetLabel,
                "aria-label": `${ariaLabel} · ${resetLabel}`,
                "aria-hidden": changed ? undefined : "true",
                tabIndex: changed ? 0 : -1,
                disabled,
                onClick: () => {
                  if (resetSettingsControl(item, handlerForItem(column, item), getSettingDefaultValue, onSaveError)) {
                    publishSettingsRefresh(item.key);
                  }
                },
              },
              react.createElement(SettingsUiIcon, { name: "reset", size: 12 })
            )
            : null
        ));
      });
    });

    return react.createElement(
      "div",
      {
        ref: rootRef,
        className: `settings-matrix is-${mode}${isMuted ? " is-muted" : ""}`,
        role: "table",
        "aria-label": label,
        "data-section-content": "true",
        style: { "--columns": columns.length },
      },
      ...cells
    );
  };
}
