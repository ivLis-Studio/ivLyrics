export function canMountReactDom(dom) {
  return typeof dom?.createRoot === "function" || typeof dom?.render === "function";
}

export function createReactDomMount(dom, container) {
  if (typeof dom.createRoot === "function") {
    const root = dom.createRoot(container);
    return {
      waitsForCommit: true,
      render: (node) => root.render(node),
      unmount: () => root.unmount(),
    };
  }
  return {
    waitsForCommit: false,
    render: (node) => dom.render(node, container),
    unmount: () => dom.unmountComponentAtNode?.(container),
  };
}

export function createReactMountBoundary(react) {
  return class ReactMountBoundary extends react.Component {
    state = { failed: false };

    static getDerivedStateFromError() {
      return { failed: true };
    }

    componentDidMount() {
      if (!this.state.failed) this.props.onCommit?.();
    }

    componentDidCatch(error) {
      this.props.onError(error);
    }

    render() {
      return this.state.failed ? null : this.props.children;
    }
  };
}

export function createRouteReactDomResolver(host, initialReactDom) {
  let reactDOM = initialReactDom;
  return function ensureReactDOM() {
    if (canMountReactDom(reactDOM) || typeof reactDOM?.createPortal === "function") {
      return reactDOM;
    }

    const resolved = host?.Spicetify?.ReactDOM || host?.ReactDOM || null;
    if (resolved && resolved !== reactDOM) {
      reactDOM = resolved;
      host.reactDOM = resolved;
    }

    return reactDOM;
  };
}
