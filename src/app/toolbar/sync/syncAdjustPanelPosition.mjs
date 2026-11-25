const SYNC_ADJUST_PANEL_GAP = 10;
const SYNC_ADJUST_VIEWPORT_PADDING = 12;
export const SYNC_ADJUST_PANEL_POSITION_ATTEMPTS = 8;
// A panel aligned to the start of its trigger sits this far above the
// trigger's top edge, so the panel header lines up with the toolbar entry.
const SYNC_ADJUST_PANEL_START_OFFSET = 6;

// Pure helper (kept outside the component so it can be unit-tested):
// positions a toolbar panel to the left of its trigger, clamped into the
// viewport (or options.bounds). By default the panel is vertically centred on
// the trigger; options.align "start" lines its top up with the trigger
// instead, which is how the toolbar panels open. options.edge is the x the
// panel keeps its gap from (the toolbar's left edge). Returns null when the
// rects are not measurable yet.
export const computeSyncAdjustPanelPosition = (triggerRect, panelRect, viewportWidth, viewportHeight, options = {}) => {
  if (!triggerRect || !panelRect?.width || !panelRect?.height) return null;

  const viewportPadding = SYNC_ADJUST_VIEWPORT_PADDING;
  const gap = SYNC_ADJUST_PANEL_GAP;
  const bounds = options.bounds || { left: 0, top: 0, right: viewportWidth, bottom: viewportHeight };
  const edge = Number.isFinite(options.edge) ? options.edge : triggerRect.left;
  const desiredTop = options.align === "start"
    ? triggerRect.top - SYNC_ADJUST_PANEL_START_OFFSET
    : triggerRect.top + (triggerRect.height - panelRect.height) / 2;
  const left = Math.max(
    bounds.left + viewportPadding,
    Math.min(
      edge - panelRect.width - gap,
      bounds.right - panelRect.width - viewportPadding
    )
  );
  const top = Math.max(
    bounds.top + viewportPadding,
    Math.min(
      desiredTop,
      bounds.bottom - panelRect.height - viewportPadding
    )
  );
  return { left, top };
};
