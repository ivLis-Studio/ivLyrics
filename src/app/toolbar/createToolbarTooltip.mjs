// Keep toolbar tooltips outside the scrollable toolbar and independent of
// Spotify's private menu context. Cloning without a ref preserves button refs.
export function createToolbarTooltip({ react, host, document }) {
  const { useState, useEffect } = react;
  return function IvLyricsTooltip({ label, children }) {
    const [anchor, setAnchor] = useState(null);
    const reactDom = host.Spicetify?.ReactDOM ?? host.ReactDOM;
    useEffect(() => {
      if (!anchor) return undefined;
      const hide = () => setAnchor(null);
      const onKeyDown = (event) => { if (event.key === "Escape") hide(); };
      host.addEventListener("resize", hide);
      document.addEventListener("scroll", hide, true);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        host.removeEventListener("resize", hide);
        document.removeEventListener("scroll", hide, true);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [anchor]);
    const show = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setAnchor({ right: Math.max(8, host.innerWidth - rect.left + 8), top: Math.max(20, Math.min(host.innerHeight - 20, rect.top + rect.height / 2)) });
    };
    const positionTooltip = (element) => {
      if (!element || !anchor) return;
      // Measure only when the tooltip mounts/changes. Long translations can be
      // taller or wider than the space beside a button near the host edges.
      element.style.right = `${anchor.right}px`;
      element.style.top = `${anchor.top}px`;
      const rect = element.getBoundingClientRect();
      const shiftX = Math.max(8 - rect.left, Math.min(0, host.innerWidth - 8 - rect.right));
      const shiftY = Math.max(8 - rect.top, Math.min(0, host.innerHeight - 8 - rect.bottom));
      element.style.right = `${anchor.right - shiftX}px`;
      element.style.top = `${anchor.top + shiftY}px`;
    };
    const handlers = {};
    for (const name of ["onMouseEnter", "onFocus", "onMouseLeave", "onBlur", "onClick"]) {
      handlers[name] = (event) => {
        children.props[name]?.(event);
        if (name === "onMouseEnter" || name === "onFocus") show(event);
        else setAnchor(null);
      };
    }
    const button = react.cloneElement(children, {
      ...(children.props.disabled ? {} : handlers),
      title: reactDom?.createPortal ? undefined : label,
    });
    // Disabled native buttons suppress mouse events. Receive hover on a wrapper
    // without forwarding clicks to the disabled action or replacing its ref.
    const trigger = children.props.disabled
      ? react.createElement("span", {
          className: "ivlyrics-tooltip-disabled-trigger",
          onMouseEnter: show,
          onMouseLeave: () => setAnchor(null),
          title: reactDom?.createPortal ? undefined : label,
        }, button)
      : button;
    return react.createElement(react.Fragment, null, trigger,
      anchor && label && reactDom?.createPortal
        ? reactDom.createPortal(react.createElement("div", {
            className: "ivlyrics-toolbar-tooltip", role: "tooltip",
            ref: positionTooltip,
            style: { right: `${anchor.right}px`, top: `${anchor.top}px` },
          }, label), document.body)
        : null);
  }
}
