import { isToolbarSurfaceEvent } from "./toolbarSurfaceEvent.mjs";
import { observeToolbarProgressClearance } from "./toolbarProgressClearance.mjs";
import { moveToolbarFocus } from "./createToolbarControls.mjs";

const TOOLBAR_TOOLTIP_DELAY_MS = 420;
const TOOLBAR_TOOLTIP_SWITCH_DELAY_MS = 40;
// Dialogs that take over from a panel: Esc belongs to them while they are open.
const TOOLBAR_PANEL_DIALOG_SURFACES = [
  ".ivlyrics-fluent-overlay",
  ".ivlyrics-cache-edit-overlay",
  ".community-video-overlay",
  ".confirm-dialog-overlay",
  "#ivLyrics-settings-overlay",
  "#ivLyrics-sync-creator-overlay",
].join(", ");
// Pressing inside these does not count as a click outside the open panel.
const TOOLBAR_PANEL_COMPANION_SURFACES = TOOLBAR_PANEL_DIALOG_SURFACES +
  ", .optionsMenu-dropdown-list, .ivlyrics-toast-container";
// In fullscreen, a click outside the opened menu folds it, except in these.
const TOOLBAR_FULLSCREEN_MENU_SURFACES = TOOLBAR_PANEL_COMPANION_SURFACES +
  ", #ivLyrics-share-image-overlay, .lyrics-creator-profile-overlay";

export function createToolbarInteraction({ react, host, document, readTheme, useToolbarSyncOffsets }) {
  const { useState, useEffect, useRef, useCallback, useLayoutEffect } = react;

  return function useToolbarInteraction(toolbar) {
    const { actions } = toolbar;
    const rootRef = useRef(null);
    const columnRef = useRef(null);
    const anchorsRef = useRef(new Map());
    const anchorRefCallbacks = useRef(new Map());
    const entriesRef = useRef({});
    const tipRef = useRef(null);
    const tipTimerRef = useRef(0);
    const openIdRef = useRef(null);
    const [openId, setOpenId] = useState(null);
    const [trackViews, setTrackViews] = useState([]);
    const currentTrackView = useRef(null);
    if (currentTrackView.current?.uri !== toolbar.trackUri || currentTrackView.current?.views !== trackViews) {
      currentTrackView.current = { uri: toolbar.trackUri, views: trackViews };
    }
    const trackView = currentTrackView.current;
    const [slide, setSlide] = useState(null);
    const [tip, setTip] = useState(null);
    const [theme, setTheme] = useState(readTheme);
    const offsets = useToolbarSyncOffsets(toolbar.syncTrackUri);
    openIdRef.current = openId;
    tipRef.current = tip;

    useLayoutEffect(() => {
      if (!toolbar.isFullscreen) return undefined;
      return observeToolbarProgressClearance(columnRef.current);
    }, [toolbar.isFullscreen]);

    const hideTip = useCallback(() => {
      clearTimeout(tipTimerRef.current);
      if (tipRef.current) setTip(null);
    }, []);

    // Esc, the close button, an outside click and any action that hands over to
    // a dialog close the panel; focus inside it goes back to its entry first.
    const closePanel = useCallback(() => {
      const current = openIdRef.current;
      if (!current) return;
      const flyout = rootRef.current?.querySelector(".ivl-tb-fly");
      const hadFocus = !!flyout?.contains(document.activeElement);
      openIdRef.current = null;
      setOpenId(null);
      setTrackViews([]);
      setSlide(null);
      if (hadFocus) anchorsRef.current.get(current)?.focus({ preventScroll: true });
    }, []);

    const togglePanel = useCallback((id) => {
      hideTip();
      if (openIdRef.current === id) {
        closePanel();
        return;
      }
      setTheme(readTheme());
      setTrackViews([]);
      setSlide(null);
      openIdRef.current = id;
      setOpenId(id);
    }, [closePanel, hideTip]);

    const getAnchorRef = (id) => {
      let callback = anchorRefCallbacks.current.get(id);
      if (!callback) {
        callback = (element) => {
          if (element) anchorsRef.current.set(id, element);
          else anchorsRef.current.delete(id);
        };
        anchorRefCallbacks.current.set(id, callback);
      }
      return callback;
    };

    useEffect(() => {
      actions?.setEngaged?.(!!openId);
    }, [openId, actions]);
    useEffect(() => () => {
      clearTimeout(tipTimerRef.current);
      actions?.setEngaged?.(false);
    }, [actions]);

    useEffect(() => {
      if (!openId) return undefined;
      const handlePointerDown = (event) => {
        if (isToolbarSurfaceEvent(event, rootRef.current, TOOLBAR_PANEL_COMPANION_SURFACES)) return;
        closePanel();
      };
      // Focus outside the toolbar (e.g. on the page) still lets Esc close it.
      const handleKeyDown = (event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (rootRef.current?.contains(document.activeElement)) return;
        if (document.querySelector(TOOLBAR_PANEL_DIALOG_SURFACES)) return;
        closePanel();
      };
      document.addEventListener("pointerdown", handlePointerDown, true);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown, true);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [openId, closePanel]);

    // Folding the fullscreen menu folds an open panel with it.
    useEffect(() => {
      if (toolbar.isFullscreen && !toolbar.isMenuOpen) closePanel();
    }, [toolbar.isFullscreen, toolbar.isMenuOpen, closePanel]);

    const isMenuUnfolded = !!toolbar.isFullscreen && !!(toolbar.isMenuOpen || toolbar.isMenuClosing);
    useEffect(() => {
      if (!isMenuUnfolded) return undefined;
      const handleClickOutside = (event) => {
        if (isToolbarSurfaceEvent(event, rootRef.current, TOOLBAR_FULLSCREEN_MENU_SURFACES)) return;
        actions?.onCloseMenu?.();
      };
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, [isMenuUnfolded, actions]);

    // The panels follow the settings theme; it can only change while the
    // settings window is open.
    useEffect(() => {
      const refreshTheme = () => setTheme(readTheme());
      host.addEventListener("ivLyrics:settings-visibility", refreshTheme);
      return () => host.removeEventListener("ivLyrics:settings-visibility", refreshTheme);
    }, []);

    const showTip = (id) => {
      const button = anchorsRef.current.get(id);
      const root = rootRef.current;
      const entry = entriesRef.current[id];
      if (!button || !root || !entry || openIdRef.current === id) return;
      const content = entry.tip ? entry.tip() : { title: entry.label };
      const rect = button.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      setTip({
        id,
        top: rect.top - rootRect.top - root.clientTop + rect.height / 2,
        title: content.title,
        lines: content.lines || [],
        keys: entry.keys || [],
      });
    };

    const handleColumnPointerOver = (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const button = event.target?.closest?.(".ivl-tb-item");
      if (!button) return;
      const id = button.dataset.entry;
      if (tipRef.current?.id === id) return;
      clearTimeout(tipTimerRef.current);
      tipTimerRef.current = setTimeout(
        () => showTip(id),
        tipRef.current ? TOOLBAR_TOOLTIP_SWITCH_DELAY_MS : TOOLBAR_TOOLTIP_DELAY_MS
      );
    };

    const handleColumnFocus = (event) => {
      const button = event.target?.closest?.(".ivl-tb-item");
      if (!button || !button.matches?.(":focus-visible")) return;
      clearTimeout(tipTimerRef.current);
      showTip(button.dataset.entry);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (openIdRef.current) {
          event.preventDefault();
          event.stopPropagation();
          closePanel();
        } else {
          hideTip();
        }
        return;
      }
      if (event.target?.classList?.contains("ivl-tb-item")) {
        moveToolbarFocus(event, columnRef.current, ".ivl-tb-item");
      }
    };

    const openTrackView = (view) => {
      setSlide("in");
      setTrackViews((views) => views.concat(view));
    };
    const leaveTrackView = () => {
      if (openIdRef.current !== "track" || currentTrackView.current !== trackView) return;
      setSlide("out");
      setTrackViews(trackViews.slice(0, -1));
    };

    return {
      rootRef, columnRef, anchorsRef, entriesRef, openId, trackViews, slide, tip, theme, offsets, closePanel,
      hideTip, togglePanel, getAnchorRef, handleColumnPointerOver, handleColumnFocus, handleKeyDown,
      openTrackView, leaveTrackView,
    };
  };
}
