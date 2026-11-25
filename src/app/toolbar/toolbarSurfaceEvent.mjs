// React may replace the clicked submenu before the document's bubbling click
// listener runs. The original event path still identifies it as an inside click.
export const isToolbarSurfaceEvent = (event, root, companionSurfaces) =>
  !!root?.contains(event.target) ||
  !!event.target?.closest?.(companionSurfaces) ||
  !!event.composedPath?.().some((node) => node === root || node?.matches?.(companionSurfaces));
