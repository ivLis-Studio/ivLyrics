import { joinToolbarClasses } from "./createToolbarControls.mjs";
import { computeSyncAdjustPanelPosition, SYNC_ADJUST_PANEL_POSITION_ATTEMPTS } from "./sync/syncAdjustPanelPosition.mjs";

export function createToolbarFlyout({ react, host, getOptionsText, translate, useToolbarControlId, ToolbarGlyph }) {
  const { useCallback, useEffect, useRef } = react;

  const getToolbarFlyoutBounds = (toolbar) => {
    const pageRect = toolbar?.closest?.(".lyrics-lyricsContainer-LyricsContainer")?.getBoundingClientRect?.();
    const bounds = {
      left: Math.max(0, pageRect?.left ?? 0),
      top: Math.max(0, pageRect?.top ?? 0),
      right: Math.min(host.innerWidth, pageRect?.right ?? host.innerWidth),
      bottom: Math.min(host.innerHeight, pageRect?.bottom ?? host.innerHeight),
    };
    return bounds.right - bounds.left > 0 && bounds.bottom - bounds.top > 0
      ? bounds
      : { left: 0, top: 0, right: host.innerWidth, bottom: host.innerHeight };
  };

  // A panel next to the toolbar: header with title (and 뒤로 inside a drilled
  // view), a scrolling body and an optional footer. It is positioned from the
  // entry that opened it and kept inside the lyrics page.
  return function ToolbarFlyout({ entryId, anchor, toolbar, view, viewKey, direction, onBack, onClose }) {
    const ref = useRef(null);
    const titleId = useToolbarControlId("ivl-tb-fly-title");

    const place = useCallback(() => {
      const flyout = ref.current;
      if (!flyout || !toolbar || !anchor?.isConnected) return false;
      const bounds = getToolbarFlyoutBounds(toolbar);
      flyout.style.setProperty("--ivl-tb-fly-max-w", Math.max(240, bounds.right - bounds.left - 24) + "px");
      flyout.style.setProperty("--ivl-tb-fly-max-h", Math.max(200, bounds.bottom - bounds.top - 24) + "px");
      const toolbarRect = toolbar.getBoundingClientRect();
      const position = computeSyncAdjustPanelPosition(
        anchor.getBoundingClientRect(),
        flyout.getBoundingClientRect(),
        host.innerWidth,
        host.innerHeight,
        { align: "start", edge: toolbarRect.left, bounds }
      );
      if (!position) return false;
      flyout.style.left = Math.round(position.left - toolbarRect.left - toolbar.clientLeft) + "px";
      flyout.style.top = Math.round(position.top - toolbarRect.top - toolbar.clientTop) + "px";
      flyout.style.right = "auto";
      flyout.style.bottom = "auto";
      return true;
    }, [anchor, toolbar]);

    // Place before paint; rects can be unmeasurable for a frame right after
    // mounting, so retry across a few frames (the default CSS spot stays visible).
    react.useLayoutEffect(() => {
      let frame = 0;
      let attempts = 0;
      const measure = () => {
        if (place() || attempts >= SYNC_ADJUST_PANEL_POSITION_ATTEMPTS) return;
        attempts += 1;
        frame = host.requestAnimationFrame(measure);
      };
      measure();
      return () => host.cancelAnimationFrame(frame);
    }, [place, viewKey]);

    useEffect(() => {
      const flyout = ref.current;
      if (!flyout) return undefined;
      let frame = 0;
      const schedule = () => {
        host.cancelAnimationFrame(frame);
        frame = host.requestAnimationFrame(() => place());
      };
      const observer = typeof host.ResizeObserver === "function" ? new host.ResizeObserver(schedule) : null;
      observer?.observe(flyout);
      if (toolbar) observer?.observe(toolbar);
      host.addEventListener("resize", schedule);
      return () => {
        host.cancelAnimationFrame(frame);
        observer?.disconnect();
        host.removeEventListener("resize", schedule);
      };
    }, [place, toolbar]);

    useEffect(() => {
      ref.current?.focus({ preventScroll: true });
    }, [viewKey]);

    // Text cut off with an ellipsis shows its full wording on hover.
    const handlePointerOver = (event) => {
      const node = event.target?.closest?.(".ivl-tb-trunc");
      if (!node || !ref.current?.contains(node)) return;
      if (node.scrollWidth > node.clientWidth + 1) node.title = node.textContent.trim();
      else node.removeAttribute("title");
    };

    const backLabel = getOptionsText("creatorProfile.back", "뒤로");
    const closeLabel = translate("buttons.close") || "Close";
    return react.createElement(
      "section",
      {
        ref,
        className: "ivl-tb-fly",
        role: "dialog",
        tabIndex: -1,
        "aria-labelledby": titleId,
        "data-entry": entryId,
        onPointerOver: handlePointerOver,
      },
      react.createElement(
        "header",
        { className: "ivl-tb-fly-head" },
        onBack
          ? react.createElement("button", {
            type: "button",
            className: "ivl-tb-icon-btn ivl-tb-fly-back",
            "aria-label": backLabel,
            title: backLabel,
            onClick: onBack,
          }, react.createElement(ToolbarGlyph, { name: "back", size: 16 }))
          : null,
        react.createElement(
          "div",
          { className: "ivl-tb-fly-titles" },
          react.createElement("h2", { className: "ivl-tb-fly-title", id: titleId }, view.title),
          view.subtitle ? react.createElement("p", { className: "ivl-tb-fly-sub" }, view.subtitle) : null
        ),
        react.createElement("button", {
          type: "button",
          className: "ivl-tb-icon-btn",
          "aria-label": closeLabel,
          title: closeLabel,
          onClick: onClose,
        }, react.createElement(ToolbarGlyph, { name: "close", size: 16 }))
      ),
      react.createElement(
        "div",
        {
          key: viewKey,
          className: joinToolbarClasses("ivl-tb-fly-body", direction && "is-sliding-" + direction),
        },
        view.body
      ),
      view.footer ? react.createElement("footer", { className: "ivl-tb-fly-foot" }, view.footer) : null
    );
  };
}
