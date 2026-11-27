// Section frame shared by every settings menu. The title is the scroll-spy,
// section-tab and search anchor; the body holds the rows. It is plain markup
// so the provider tabs can render their own sections.
export const renderSettingsSectionShell = (react, {
  sectionKey, title, subtitle, view, hidden, className = "", children,
}) =>
  react.createElement(
    "section",
    {
      key: sectionKey,
      className: `settings-section${className ? ` ${className}` : ""}`,
      "data-section-key": sectionKey,
      "data-view": view || undefined,
      hidden: hidden ? true : undefined,
    },
    react.createElement(
      "div",
      { className: "section-title", "data-setting-key": sectionKey },
      react.createElement(
        "div",
        { className: "section-title-content" },
        react.createElement(
          "div",
          { className: "section-text" },
          react.createElement("h3", null, title),
          subtitle ? react.createElement("p", null, subtitle) : null
        )
      )
    ),
    react.createElement(
      "div",
      { className: "settings-section-body" },
      ...(Array.isArray(children) ? children : [children])
    )
  );

// Self-rendering controls share the same row and label structure as the option list.
export function renderSettingsControlRow(react, {
  rowProps, name, description = [], controlClassName = "setting-row-right",
}, ...controls) {
  return react.createElement(
    "div",
    rowProps,
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" }, name),
        ...description
      ),
      react.createElement("div", { className: controlClassName }, ...controls)
    )
  );
}
