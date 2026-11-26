export function createSettingsProviderListView({ react, translate }) {
  const ProviderDragHandle = ({ provider, label, onDragStart, onDragEnd, onMove }) =>
    react.createElement("button", {
      type: "button",
      className: "provider-drag-handle",
      draggable: true,
      title: label,
      "aria-label": label,
      onDragStart: (event) => onDragStart(event, provider.id),
      onDragEnd,
      onKeyDown: (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        onMove(provider.id, event.key === "ArrowUp" ? "up" : "down");
      },
    },
      react.createElement("svg", {
        width: 16,
        height: 20,
        viewBox: "0 0 16 20",
        fill: "currentColor",
        "aria-hidden": "true",
      },
        [4, 10, 16].flatMap((y) => [5, 11].map((x) =>
          react.createElement("circle", { key: `${x}-${y}`, cx: x, cy: y, r: 1.35 })
        ))
      )
    );

  const SETTINGS_PROVIDER_GLYPHS = Object.freeze({
    character: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
    word: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5",
    synced: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3 2",
    unsynced: "M5 6h14M5 12h14M5 18h9",
    translate: "M4 5h8M8 3v2M6 5c0 4 2 7 6 9M11 5c-.4 3.4-2.2 6.2-5.5 8M14 21l3.5-9L21 21M15.5 18h4",
    pronunciation: "M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
    metadata: "M4 4h7l9 9-7 7-9-9V4Zm4 4h.01",
    tmi: "M21 12a9 9 0 0 1-9 9H5l1.8-3.2A9 9 0 1 1 21 12Zm-9-1v5M12 7h.01",
    researchWebSearch: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35",
    lyricsStudy: "M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z",
    characterPronunciation: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
    culturalAnnotations: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-20c3 3 4.5 6.3 4.5 10S15 19 12 22M12 2C9 5 7.5 8.3 7.5 12S9 19 12 22M2 12h20",
    wordSupplements: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5M4 20h16",
    motionDirection: "M3 7h12v10H3V7Zm12 4 6-3v8l-6-3",
    settingsAssistant: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12ZM12 8l.8 2.2L15 11l-2.2.8L12 14l-.8-2.2L9 11l2.2-.8L12 8Z",
    arrow: "m9 6 6 6-6 6",
  });

  const renderSettingsProviderGlyph = (name) =>
    SETTINGS_PROVIDER_GLYPHS[name]
      ? react.createElement("svg", {
        className: "settings-provider-glyph",
        width: 15,
        height: 15,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.6,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
      }, react.createElement("path", { d: SETTINGS_PROVIDER_GLYPHS[name] }))
      : null;

  const renderSettingsProviderItems = ({
    sortedProviders, dragState, enabledProviders, expandedProviders,
    handleDragOver, handleDrop, handleDragStart, clearDragState, moveProvider,
    handleToggleEnabled, toggleExpanded, translationKey, Card, providerProp,
    onExpandProvider, cardProps
  }) => (
    sortedProviders.map((provider, providerIndex) =>
      react.createElement("div", {
        key: provider.id,
        role: "listitem",
        className: [
          "lyrics-provider-item",
          dragState.sourceId === provider.id ? "dragging" : "",
          dragState.targetId === provider.id ? `drag-over-${dragState.position}` : "",
          enabledProviders[provider.id] === false ? "is-off" : "",
        ].filter(Boolean).join(" "),
        onDragOver: (event) => handleDragOver(event, provider.id),
        onDrop: (event) => handleDrop(event, provider.id),
      },
        react.createElement(ProviderDragHandle, {
          provider,
          label: `${provider.name || provider.id}: ${translate(`${translationKey}.moveUp`) || "Move Up"} / ${translate(`${translationKey}.moveDown`) || "Move Down"}`,
          onDragStart: handleDragStart,
          onDragEnd: clearDragState,
          onMove: moveProvider,
        }),
        react.createElement("span", {
          className: "provider-order-index",
          "aria-hidden": "true",
        }, providerIndex + 1),
        // Provider 카드
        react.createElement(Card, {
          ...(cardProps || {}),
          [providerProp]: provider,
          isEnabled: enabledProviders[provider.id] !== false,
          onToggle: (enabled) => handleToggleEnabled(provider.id, enabled),
          isExpanded: expandedProviders.has(provider.id),
          onExpandToggle: () => (onExpandProvider || toggleExpanded)(provider.id)
        })
      )
    )
  );

  // Column header of a provider table. Its cells use the same grid as the rows.
  const renderSettingsProviderTableHead = ({
    columns, labelFor, owners, providerNames, noneLabel, providerLabel,
  }) =>
    react.createElement("div", { className: "settings-provider-head" },
      react.createElement("span", { className: "settings-provider-head-spacer", "aria-hidden": "true" }),
      react.createElement("div", { className: "settings-provider-head-cells" },
        react.createElement("span", { className: "settings-provider-head-label" }, providerLabel),
        react.createElement("span", { "aria-hidden": "true" }),
        ...columns.map((column) => {
          const ownerId = owners ? owners[column] : null;
          const ownerName = ownerId ? (providerNames[ownerId] || ownerId) : "";
          return react.createElement("span", {
            key: column,
            className: "settings-provider-head-cap",
            title: labelFor(column),
          },
            renderSettingsProviderGlyph(column),
            react.createElement("span", { className: "settings-provider-head-text" }, labelFor(column)),
            owners ? react.createElement("span", {
              className: `settings-provider-owner${ownerId ? "" : " is-none"}`,
              title: ownerName || noneLabel,
            }, ownerName || noneLabel) : null
          );
        }),
        react.createElement("span", { "aria-hidden": "true" })
      )
    );

  const renderSettingsProviderLegend = () =>
    react.createElement("div", { className: "settings-provider-legend", "aria-hidden": "true" },
      react.createElement("span", null,
        react.createElement("i", { className: "is-on" }),
        translate("misc.enabled") || "Enabled"),
      react.createElement("span", null,
        react.createElement("i", { className: "is-owner" }),
        translate("settingsUi.providers.firstTried") || "Tried first")
    );

  return { renderSettingsProviderItems, renderSettingsProviderTableHead, renderSettingsProviderLegend, renderSettingsProviderGlyph };
}
