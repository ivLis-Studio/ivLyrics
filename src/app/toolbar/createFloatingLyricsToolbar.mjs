import { buildToolbarEntries, TOOLBAR_ENTRY_GROUPS } from "./toolbarEntries.mjs";
import { joinToolbarClasses } from "./createToolbarControls.mjs";
import { createToolbarInteraction } from "./createToolbarInteraction.mjs";

export function createFloatingLyricsToolbar({
  react, host, document, translate, getOptionsText, readVisualSettings, readTheme,
  useToolbarSyncOffsets, openSettings, openToolbarSettings, buildPanelView, ToolbarGlyph, ToolbarFlyout,
}) {
  const useToolbarInteraction = createToolbarInteraction({ react, host, document, readTheme, useToolbarSyncOffsets });

  return react.memo(function IvLyricsFloatingToolbar(toolbar) {
    const { actions } = toolbar;
    const {
      rootRef, columnRef, anchorsRef, entriesRef, openId, trackViews, slide, tip, theme, offsets, closePanel,
      hideTip, togglePanel, getAnchorRef, handleColumnPointerOver, handleColumnFocus, handleKeyDown,
      openTrackView, leaveTrackView,
    } = useToolbarInteraction(toolbar);

    const lyricsState = {
      hasKaraoke: toolbar.hasKaraoke,
      karaokeEnabled: toolbar.karaokeEnabled,
      hasSynced: toolbar.hasSynced,
      hasUnsynced: toolbar.hasUnsynced,
      isLoading: toolbar.isLyricsLoading,
    };
    const trackLine = [toolbar.trackTitle, toolbar.trackArtist].filter(Boolean).join(" · ");
    const entries = buildToolbarEntries({
      toolbar, trackLine, offsets, getOptionsText, hideTip,
      translate, readVisualSettings,
      openSettings: () => openSettings?.(),
    });
    entriesRef.current = entries;

    const activate = (id) => {
      const entry = entries[id];
      if (entry.panel) {
        togglePanel(id);
        return;
      }
      hideTip();
      closePanel();
      entry.onActivate?.();
    };

    const renderEntry = (id) => {
      const entry = entries[id];
      if (!entry || entry.hidden) return null;
      const isOpen = openId === id;
      return react.createElement(
        "button",
        {
          key: id,
          type: "button",
          ref: getAnchorRef(id),
          className: joinToolbarClasses("ivl-tb-item", isOpen && "is-open", entry.busy && "is-busy"),
          "data-entry": id,
          "aria-label": entry.ariaLabel || entry.label,
          "aria-haspopup": entry.panel ? "dialog" : undefined,
          "aria-expanded": entry.panel ? isOpen : undefined,
          "aria-pressed": entry.pressed === undefined ? undefined : entry.pressed,
          onClick: () => activate(id),
          onContextMenu: entry.onContextMenu,
        },
        react.createElement(
          "span",
          { className: "ivl-tb-ico" },
          react.createElement(ToolbarGlyph, { name: entry.icon, size: 20 }),
          entry.lock ? react.createElement("span", { className: "ivl-tb-lock" }, react.createElement(ToolbarGlyph, { name: "lock", size: 9 })) : null,
          entry.dot ? react.createElement("span", { className: "ivl-tb-dot" }) : null
        ),
        react.createElement("span", { className: "ivl-tb-label" }, entry.label)
      );
    };

    const openSettingsFromPanel = (options) => {
      closePanel();
      openToolbarSettings(options);
    };

    const panelView = openId ? buildPanelView(openId, {
      toolbar, actions, lyricsState, trackLine, offsets, trackViews, openTrackView, leaveTrackView, closePanel, openSettingsFromPanel,
    }) : null;
    const showEntries = !toolbar.isFullscreen || toolbar.isMenuOpen || toolbar.isMenuClosing;
    return react.createElement(
      "div",
      {
        ref: rootRef,
        className: joinToolbarClasses(
          "lyrics-config-button-container",
          "ivl-tb",
          toolbar.isFullscreen && "is-fullscreen",
          toolbar.isFullscreen && toolbar.isMenuOpen && "is-menu-open",
          toolbar.isFullscreen && toolbar.isMenuClosing && "is-menu-closing",
          openId && "is-engaged"
        ),
        "data-ui-theme": theme,
        style: toolbar.contentTopOffset
          ? { "--iv-floating-menu-content-top-offset": toolbar.contentTopOffset + "px" }
          : undefined,
        onKeyDown: handleKeyDown,
      },
      react.createElement(
        "div",
        {
          ref: columnRef,
          className: "ivl-tb-col",
          role: "toolbar",
          "aria-label": translate("fullscreen.menuToggle") || "ivLyrics",
          "aria-orientation": "vertical",
          onPointerOver: handleColumnPointerOver,
          onPointerLeave: hideTip,
          onPointerDown: hideTip,
          onFocus: handleColumnFocus,
          onBlur: hideTip,
        },
        showEntries && react.createElement(
          "div",
          { className: "ivl-tb-content", ref: actions?.setContentRef },
          TOOLBAR_ENTRY_GROUPS.map((group) => {
            const items = group.filter((id) => !entries[id].hidden);
            return items.length
              ? react.createElement("div", { key: group[0], className: "ivl-tb-cluster", role: "group" }, items.map(renderEntry))
              : null;
          })
        ),
        toolbar.isFullscreen && react.createElement(
          "button",
          {
            type: "button",
            ref: getAnchorRef("menu"),
            className: joinToolbarClasses("ivl-tb-item", "ivl-tb-toggle", toolbar.isMenuOpen && "is-open"),
            "data-entry": "menu",
            "aria-label": entries.menu.ariaLabel,
            "aria-expanded": !!toolbar.isMenuOpen,
            onClick: (event) => {
              event.stopPropagation();
              hideTip();
              actions?.onToggleMenu?.();
            },
          },
          react.createElement("span", { className: "ivl-tb-ico" }, react.createElement(ToolbarGlyph, { name: entries.menu.icon, size: 20 })),
          react.createElement("span", { className: "ivl-tb-label" }, entries.menu.label)
        )
      ),
      tip && react.createElement(
        "div",
        { className: "ivl-tb-tip", role: "tooltip", style: { top: tip.top + "px" } },
        react.createElement("b", null, tip.title),
        tip.lines.map((line, index) => react.createElement("span", { key: index }, line)),
        tip.keys.length
          ? react.createElement(
            "span",
            { className: "ivl-tb-tip-keys" },
            tip.keys.map((key, index) => react.createElement("kbd", { key: index, className: "ivl-tb-kbd" }, key))
          )
          : null
      ),
      panelView && react.createElement(ToolbarFlyout, {
        entryId: openId,
        anchor: anchorsRef.current.get(openId),
        toolbar: rootRef.current,
        view: panelView,
        viewKey: openId + ":" + trackViews.join("/"),
        direction: slide,
        onBack: openId === "track" && trackViews.length ? leaveTrackView : null,
        onClose: closePanel,
      })
    );
  });
}
