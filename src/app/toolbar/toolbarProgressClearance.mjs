// Keep the fullscreen progress clearance tied to the actual toolbar column,
// including translated labels, without observing lyric content or visibility.
export function observeToolbarProgressClearance(column, host = globalThis) {
  const container = column?.closest?.(".lyrics-lyricsContainer-LyricsContainer");
  if (!container) return undefined;
  const view = column.ownerDocument?.defaultView || host;
  const property = "--iv-fullscreen-toolbar-width";
  let observer = null;
  let frame = null;
  let pendingWidth;
  let lastWidth = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    view.removeEventListener("resize", handleResize);
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
    pendingWidth = undefined;
    container.style.removeProperty(property);
  };
  const measure = () => {
    frame = null;
    if (stopped) return;
    if (!column.isConnected || !container.isConnected || !container.contains(column)) {
      stop();
      return;
    }
    const width = pendingWidth ?? column.getBoundingClientRect().width;
    pendingWidth = undefined;
    if (!Number.isFinite(width) || width <= 0) return;
    const roundedWidth = Math.ceil(width);
    if (roundedWidth === lastWidth) return;
    lastWidth = roundedWidth;
    container.style.setProperty(property, roundedWidth + "px");
  };
  const schedule = (width) => {
    if (stopped) return;
    pendingWidth = width;
    if (frame === null) frame = view.requestAnimationFrame(measure);
  };
  const handleResize = () => schedule();

  measure();
  if (stopped) return stop;
  if (typeof view.ResizeObserver === "function") {
    observer = new view.ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === column);
      if (!entry) return;
      const box = entry.borderBoxSize?.[0] || entry.borderBoxSize;
      schedule(box?.inlineSize);
    });
    observer.observe(column, { box: "border-box" });
  } else {
    view.addEventListener("resize", handleResize);
  }
  return stop;
}
