import { useSettingsSignal } from "./settingsSignals.mjs";

const getSettingsPreviewKind = (menu, section) => {
  if (menu === "fullscreen") return "fullscreen";
  if (menu === "nowplaying") return "panel";
  if (section === "instrumental-break") return "interlude";
  if (section === "cultural-annotations") return "annotation";
  return "lyrics";
};

export function createSettingsPreviewDock({
  react, getSettingsText, SettingsUiIcon, SettingsLyricsPreview,
  NowPlayingPanelPreview, SettingsFullscreenPreview,
}) {
  const getSettingsLayerLegend = () => [
    ["original", getSettingsText("lyricsCacheEditor.original", "Original")],
    ["phonetic", getSettingsText("menu.pronunciation", "Pronunciation")],
    ["translation", getSettingsText("translationMenu.translation", "Translation")],
    ["furigana", getSettingsText("translationMenu.furigana", "Furigana")],
  ];

  // All four layers share one editor. Keep their color key informational and
  // offer one explicit action rather than four buttons to the same matrix.
  const SettingsPreviewLayerControls = ({ onNavigate }) => {
    const title = getSettingsText("settingsUi.sections.lyricLayers.title", "Lyric layers");
    const edit = getSettingsText("buttons.edit", "Edit");
    return react.createElement(
      "div",
      { className: "settings-preview-layers", role: "group", "aria-label": title },
      react.createElement(
        "div",
        { className: "settings-preview-layer-heading" },
        react.createElement("span", null, title),
        react.createElement(
          "button",
          {
            type: "button",
            className: "settings-preview-edit-link",
            "aria-label": `${title} · ${edit}`,
            onClick: () => onNavigate("appearance", "lyric-layers"),
          },
          react.createElement("span", null, edit),
          react.createElement(SettingsUiIcon, { name: "right", size: 12 })
        )
      ),
      react.createElement(
        "ul",
        { className: "settings-preview-legend" },
        ...getSettingsLayerLegend().map(([role, label]) => react.createElement(
          "li",
          {
            key: role,
            className: "settings-preview-layer-label",
            "data-layer": role,
            style: { "--layer-color": `var(--settings-layer-${role})` },
          },
          react.createElement("i", { "aria-hidden": "true" }),
          react.createElement("span", null, label)
        ))
      )
    );
  };

  return function SettingsDock({ open, onToggle, menu, signal, fullscreenView, onNavigate }) {
    const section = useSettingsSignal(react, signal);
    const kind = getSettingsPreviewKind(menu, section);
    const title = getSettingsText("settingsAdvanced.livePreview.title", "Live Preview");
    let preview;
    if (kind === "panel") preview = react.createElement(NowPlayingPanelPreview);
    else if (kind === "fullscreen") preview = react.createElement(SettingsFullscreenPreview, { view: fullscreenView });
    else preview = react.createElement(SettingsLyricsPreview, { kind });
    return react.createElement(
      "aside",
      { className: `settings-dock${open ? "" : " is-collapsed"}`, "aria-label": title },
      react.createElement(
        "div",
        { className: "settings-dock-head" },
        open
          ? react.createElement(
            "div",
            { className: "settings-dock-copy" },
            react.createElement("h2", null, title),
            react.createElement("p", null, getSettingsText("settingsAdvanced.livePreview.subtitle", "Instantly see your style changes"))
          )
          : null,
        react.createElement(
          "button",
          {
            type: "button",
            className: "settings-icon-btn settings-dock-toggle",
            "aria-expanded": open,
            "aria-label": title,
            title,
            onClick: onToggle,
          },
          react.createElement(SettingsUiIcon, { name: "dock", size: 16 })
        )
      ),
      open
        ? react.createElement(
          "div",
          { className: "settings-dock-body" },
          preview,
          kind === "lyrics" || kind === "annotation"
            ? react.createElement(SettingsPreviewLayerControls, { onNavigate })
            : null,
          react.createElement(
            "p",
            { className: "settings-dock-foot" },
            getSettingsText("settingsUi.preview.sampleNote", "Shown with sample data; not your current track.")
          )
        )
        : null
    );
  };
}
