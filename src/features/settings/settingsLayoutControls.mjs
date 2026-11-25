import { readSettingFlag } from "./settingsPreviewValues.mjs";

export function createSettingsLayoutControls({
  react, useSettingsConfigRevision, getVisualSettings, getSettingsStepper, getSettingsText,
  isSettingChanged, SettingsUiIcon, OptionList,
}) {
  const getSettingsPreviewFlag = (key, fallback) => readSettingFlag(getVisualSettings(), key, fallback);

  // Lines shown before and after the current line in synced mode.
  const SettingsLineWindow = ({ items, onChange }) => {
    useSettingsConfigRevision();
    const [beforeItem, afterItem] = items;
    const count = (key) => Math.max(0, Math.min(10, Math.floor(Number(getVisualSettings()?.[key])) || 0));
    const before = count(beforeItem.key);
    const after = count(afterItem.key);
    const lines = [];
    for (let index = before; index >= 1; index -= 1) {
      lines.push(react.createElement("span", {
        key: `before-${index}`,
        className: "settings-linewin-line",
        style: { "--w": `${50 + ((index * 13) % 30)}%`, "--o": Math.max(0.14, 0.25 + 0.12 * (3 - index)) },
      }));
    }
    lines.push(react.createElement("span", { key: "active", className: "settings-linewin-line is-active", style: { "--w": "82%" } }));
    for (let index = 1; index <= after; index += 1) {
      lines.push(react.createElement("span", {
        key: `after-${index}`,
        className: "settings-linewin-line",
        style: { "--w": `${45 + ((index * 17) % 35)}%`, "--o": Math.max(0.14, 0.55 - 0.12 * index) },
      }));
    }
    const values = Array.from({ length: 11 }, (_, index) => String(index));
    return react.createElement(
      "div",
      { className: "settings-linewin", "data-section-content": "true" },
      react.createElement("div", { className: "settings-linewin-visual", "aria-hidden": "true" }, ...lines),
      react.createElement(
        "div",
        { className: "settings-linewin-controls" },
        ...[beforeItem, afterItem].map((item) =>
          react.createElement(
            "div",
            {
              key: item.key,
              className: `settings-linewin-control${isSettingChanged(item.key) ? " is-changed" : ""}`,
              "data-setting-key": item.key,
              title: item.info || undefined,
            },
            react.createElement("span", { className: "setting-name" }, item.desc),
            react.createElement(getSettingsStepper(), {
              value: String(Number(getVisualSettings()?.[item.key]) || 0),
              values,
              label: item.desc,
              onChange: (value) => onChange(item.key, Number.parseInt(value, 10)),
            })
          )
        )
      )
    );
  };

  // Fullscreen UI elements as on/off tiles; a tile's own settings show below it.
  const SettingsTiles = ({ chips, onChange }) => {
    useSettingsConfigRevision();
    const enabledLabel = getSettingsText("misc.enabled", "Enabled");
    const disabledLabel = getSettingsText("misc.disabled", "Disabled");
    return react.createElement(
      "div",
      { className: "settings-tiles-stack", "data-section-content": "true" },
      react.createElement(
        "div",
        { className: "settings-tiles" },
        ...chips.map((chip) => {
          const on = getSettingsPreviewFlag(chip.item.key, chip.item.defaultValue !== false);
          return react.createElement(
            "button",
            {
              key: chip.item.key,
              type: "button",
              role: "switch",
              "aria-checked": on,
              className: `settings-tile${on ? " is-on" : ""}${isSettingChanged(chip.item.key) ? " is-changed" : ""}`,
              "data-setting-key": chip.item.key,
              title: chip.item.info || undefined,
              onClick: () => onChange(chip.item.key, !on),
            },
            react.createElement(
              "span",
              { className: "settings-tile-top" },
              react.createElement("span", { className: "settings-tile-icon", "aria-hidden": "true" }, react.createElement(SettingsUiIcon, { name: chip.icon, size: 16 })),
              react.createElement("span", { className: "settings-tile-state" }, on ? enabledLabel : disabledLabel)
            ),
            react.createElement("span", { className: "setting-name settings-tile-label" }, chip.item.desc)
          );
        })
      ),
      ...chips
        .filter((chip) => chip.children.length && getSettingsPreviewFlag(chip.item.key, chip.item.defaultValue !== false))
        .map((chip) =>
          react.createElement(
            "div",
            { key: `${chip.item.key}-details`, className: "settings-group settings-tile-details" },
            react.createElement("div", { className: "settings-group-title" }, chip.item.desc),
            react.createElement(OptionList, { items: chip.children, onChange })
          )
        )
    );
  };

  return { SettingsLineWindow, SettingsTiles };
}
