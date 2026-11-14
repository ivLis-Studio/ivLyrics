// Keep toolbar tooltips outside the scrollable toolbar and independent of
// Spotify's private menu context. Cloning without a ref preserves button refs.
const IvLyricsTooltip = ({ label, children }) => {
  const [anchor, setAnchor] = useState(null);
  const reactDom = window.Spicetify?.ReactDOM ?? window.ReactDOM;
  useEffect(() => {
    if (!anchor) return undefined;
    const hide = () => setAnchor(null);
    const onKeyDown = (event) => { if (event.key === "Escape") hide(); };
    window.addEventListener("resize", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor]);
  const show = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({ right: Math.max(8, window.innerWidth - rect.left + 8), top: Math.max(20, Math.min(window.innerHeight - 20, rect.top + rect.height / 2)) });
  };
  const positionTooltip = (element) => {
    if (!element || !anchor) return;
    // Measure only when the tooltip mounts/changes. Long translations can be
    // taller or wider than the space beside a button near the window edges.
    element.style.right = `${anchor.right}px`;
    element.style.top = `${anchor.top}px`;
    const rect = element.getBoundingClientRect();
    const shiftX = Math.max(8 - rect.left, Math.min(0, window.innerWidth - 8 - rect.right));
    const shiftY = Math.max(8 - rect.top, Math.min(0, window.innerHeight - 8 - rect.bottom));
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
};
window.IvLyricsTooltip = IvLyricsTooltip;

function getSettingsSurfaceTheme() {
  const storedTheme = window.ivLyricsStoragePersistence?.getItem("ivLyrics:settings-ui-theme")
    ?? localStorage.getItem("ivLyrics:settings-ui-theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }
  // Follow the settings screen when it resolves an older "auto" preference;
  // popups stay dark when the settings module is not available.
  try {
    return window.ivLyricsResolveSettingsUiTheme?.(storedTheme || "auto") === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

function resolveOptionsReactDom() {
  return window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null;
}

function createFluentModalHost({
  overlayId,
  overlayClassName = "",
  shellClassName = "",
  shellStyle = "",
  mountNode = document.body,
  removeExisting = true,
  modal = true,
  closeOnBackdrop = modal,
  trapFocus = modal,
  autoFocus = modal,
  onBeforeClose = null,
}) {
  if (removeExisting && overlayId) {
    const existingOverlay = document.getElementById(overlayId);
    if (existingOverlay) {
      if (typeof existingOverlay.__ivLyricsCloseModal === "function") {
        existingOverlay.__ivLyricsCloseModal(true);
      } else {
        existingOverlay.remove();
      }
    }
  }

  ensureFluentModalStyles();

  const uiTheme = getSettingsSurfaceTheme();
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.className = ["ivlyrics-fluent-overlay", overlayClassName]
    .filter(Boolean)
    .join(" ");
  overlay.dataset.uiTheme = uiTheme;

  const shell = document.createElement("div");
  shell.className = ["ivlyrics-fluent-shell", shellClassName]
    .filter(Boolean)
    .join(" ");
  shell.dataset.uiTheme = uiTheme;
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-modal", modal ? "true" : "false");
  if (shellStyle) {
    shell.style.cssText = shellStyle;
  }

  let isClosed = false;

  const finalizeClose = () => {
    const restoreFocus = modal || shell.contains(document.activeElement);
    document.removeEventListener("keydown", handleKeydown, true);
    onBeforeClose?.();

    if (overlay.parentNode) {
      overlay.remove();
    }

    if (restoreFocus && previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  };

  const closeModal = (immediate = false) => {
    if (isClosed) return;
    isClosed = true;
    overlay.classList.remove("is-open");
    overlay.classList.add("is-closing");
    overlay.setAttribute("aria-hidden", "true");

    if (immediate === true || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      finalizeClose();
      return;
    }

    window.setTimeout(finalizeClose, 180);
  };

  const getFocusableElements = () => Array.from(shell.querySelectorAll(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
  )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

  const handleKeydown = (event) => {
    if (event.key === "Escape" && (modal || shell.contains(document.activeElement))) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeModal();
      return;
    }

    if (event.key === "Tab" && trapFocus) {
      const focusable = getFocusableElements();
      if (!focusable.length) {
        event.preventDefault();
        shell.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  if (closeOnBackdrop) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
  }
  document.addEventListener("keydown", handleKeydown, true);

  overlay.appendChild(shell);
  const resolvedMountNode = mountNode?.isConnected ? mountNode : document.body;
  resolvedMountNode.appendChild(overlay);
  overlay.__ivLyricsCloseModal = closeModal;
  shell.tabIndex = -1;

  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    if (!autoFocus) return;
    const focusTarget = shell.querySelector(
      ".ivlyrics-fluent-close, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    (focusTarget ?? shell).focus?.();
  });

  return { overlay, shell, closeModal };
}

function resolveFirstLanguagePromptMountNode() {
  const lyricsSurface = document.querySelector(
    ".lyrics-lyricsContainer-LyricsContainer"
  );
  return lyricsSurface?.closest("#lyrics-fullscreen-container, .Root__main-view")
    ?? document.querySelector(".Root__main-view")
    ?? document.body;
}

function openFluentReactModal({
  overlayId,
  overlayClassName = "",
  shellClassName = "",
  shellStyle = "",
  removeExisting = true,
  render,
}) {
  const reactDom = resolveOptionsReactDom();
  if (!reactDom?.render) {
    return null;
  }

  let shell = null;
  const host = createFluentModalHost({
    overlayId,
    overlayClassName,
    shellClassName,
    shellStyle,
    removeExisting,
    onBeforeClose: () => {
      if (shell && reactDom.unmountComponentAtNode) {
        reactDom.unmountComponentAtNode(shell);
      }
    },
  });
  shell = host.shell;
  reactDom.render(render(host.closeModal), shell);
  return host.closeModal;
}

function ensureFluentModalStyles() {
  if (document.getElementById("ivLyrics-fluent-modal-styles")) return;

  const style = document.createElement("style");
  style.id = "ivLyrics-fluent-modal-styles";
  style.textContent = `
.ivlyrics-fluent-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  z-index: var(--iv-layer-modal, 2147483647);
}

.ivlyrics-fluent-overlay[data-ui-theme="light"] {
  background: rgba(248, 250, 252, 0.82);
}

.ivlyrics-fluent-shell {
  --iv-popup-bg: rgba(20, 20, 22, 0.78);
  --iv-popup-bg-strong: rgba(28, 28, 31, 0.9);
  --iv-popup-fill: rgba(255, 255, 255, 0.055);
  --iv-popup-fill-hover: rgba(255, 255, 255, 0.095);
  --iv-popup-border: rgba(255, 255, 255, 0.12);
  --iv-popup-divider: rgba(255, 255, 255, 0.085);
  width: min(92vw, 720px);
  max-height: min(88vh, 920px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(12, 12, 12, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.48);
  border-radius: 0 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] {
  --iv-popup-bg: rgba(252, 252, 253, 0.82);
  --iv-popup-bg-strong: rgba(255, 255, 255, 0.94);
  --iv-popup-fill: rgba(15, 23, 42, 0.045);
  --iv-popup-fill-hover: rgba(15, 23, 42, 0.075);
  --iv-popup-border: rgba(15, 23, 42, 0.12);
  --iv-popup-divider: rgba(15, 23, 42, 0.085);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] {
  background: rgba(255, 255, 255, 0.96);
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.16);
}

.ivlyrics-fluent-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-header {
  border-bottom-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-fluent-title-wrap {
  min-width: 0;
}

.ivlyrics-fluent-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.03em;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-title {
  color: #0f172a;
}

.ivlyrics-fluent-subtitle {
  margin: 8px 0 0;
  color: rgba(248, 250, 252, 0.62);
  font-size: 13px;
  line-height: 1.5;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-subtitle {
  color: rgba(15, 23, 42, 0.62);
}

.ivlyrics-fluent-close {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #f8fafc;
  cursor: pointer;
  border-radius: 0 !important;
  flex: 0 0 auto;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-close {
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.04);
  color: #0f172a;
}

.ivlyrics-fluent-close:hover {
  background: rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-close:hover {
  background: rgba(15, 23, 42, 0.08);
}

.ivlyrics-fluent-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px 24px;
}

.ivlyrics-fluent-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-footer {
  border-top-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-fluent-btn {
  min-height: 38px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 0 !important;
}

.ivlyrics-fluent-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-btn {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.04);
  color: #0f172a;
}

.ivlyrics-fluent-btn.primary {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-btn.primary {
  color: #0f172a;
  background: rgba(15, 23, 42, 0.08);
  border-color: rgba(15, 23, 42, 0.18);
}

.ivlyrics-first-language-overlay {
  align-items: flex-end;
  justify-content: flex-end;
  padding: 20px 24px 108px;
  background: transparent !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
}

.ivlyrics-first-language-header { padding: 18px 18px 12px; text-align: start; position: relative; }
.ivlyrics-first-language-title { margin: 0 38px 0 0; color: var(--text); font-size: 16px; font-weight: 600; letter-spacing: -.015em; line-height: 1.4; }
.ivlyrics-first-language-description { margin: 6px 0 0; color: var(--text-2); font-size: 13px; line-height: 1.55; }
.ivlyrics-first-language-close { position: absolute; top: 7px; right: 8px; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; color: var(--text-3); background: transparent; cursor: pointer; }
.ivlyrics-first-language-close:hover { color: var(--text); background: var(--surface-3); }
.ivlyrics-first-language-body { padding: 0 18px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.ivlyrics-first-language-toggle-row { width: 100%; min-height: 48px; padding: 10px 0; display: flex; align-items: center; gap: 10px; background: transparent; border: 0; border-bottom: 1px solid var(--line); color: var(--text); cursor: pointer; text-align: start; }
.ivlyrics-first-language-toggle-row:last-of-type { border-bottom: 0; }
.ivlyrics-first-language-toggle-row:hover { color: var(--accent-text); }
.ivlyrics-first-language-row-icon { display: flex; color: var(--text-3); flex-shrink: 0; }
.ivlyrics-first-language-row-label { flex: 1; font-size: 14px; font-weight: 500; line-height: 1.5; }
.ivlyrics-first-language-switch { display: flex; width: 40px; height: 24px; padding: 2px; border: 1px solid var(--line-2); border-radius: 999px; background: var(--switch-off); flex-shrink: 0; }
.ivlyrics-first-language-switch-knob { width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 160ms ease-out; }
.ivlyrics-first-language-switch.is-on { background: var(--accent); border-color: var(--accent); }
.ivlyrics-first-language-switch.is-on .ivlyrics-first-language-switch-knob { transform: translateX(14px); }
.ivlyrics-first-language-provider-hint { margin: 8px 0 0; padding: 10px; border: 1px solid var(--line-2); border-radius: 6px; color: var(--text-2); background: var(--surface-2); font-size: 12px; line-height: 1.55; }
.ivlyrics-first-language-provider-hint[hidden] { display: none; }
.ivlyrics-first-language-action { width: calc(100% - 36px); min-height: 40px; margin: 12px 18px 18px; padding: 10px 14px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--surface-2); color: var(--text-2); font-size: 13px; font-weight: 600; line-height: 1.4; cursor: pointer; flex-shrink: 0; }
.ivlyrics-first-language-action.has-selection { color: var(--ink-text); background: var(--ink); border-color: transparent; }
.ivlyrics-first-language-action:hover { opacity: .85; }
.ivlyrics-first-language-toggle-row:focus-visible, .ivlyrics-first-language-action:focus-visible, .ivlyrics-first-language-close:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }

.ivlyrics-adjust-btn {
  min-width: 52px;
  padding-inline: 10px;
}

.ivlyrics-options-root {
  width: 100%;
  color: #f8fafc;
  font-family: "Segoe UI Variable Text", "Segoe UI", "Pretendard Variable", Pretendard, sans-serif;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root {
  color: #0f172a;
}

.ivlyrics-options-root .ivlyrics-popup-section-title {
  margin: 20px 0 0;
  padding: 0 0 10px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-title {
  border-bottom-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-options-root .ivlyrics-popup-section-title:first-child {
  margin-top: 0;
}

.ivlyrics-options-root .ivlyrics-popup-section-title h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
  color: inherit;
}

.ivlyrics-options-root .ivlyrics-popup-section-title p {
  margin: 0;
  font-size: 12px;
  color: rgba(248, 250, 252, 0.58);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-title p {
  color: rgba(15, 23, 42, 0.58);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row {
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-top: none;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-setting-row {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
  gap: 16px;
  align-items: center;
  padding: 12px 0;
}

.ivlyrics-options-root .ivlyrics-popup-setting-row.no-control .ivlyrics-popup-setting-row-content {
  grid-template-columns: minmax(0, 1fr);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row.no-control {
  background: rgba(255, 255, 255, 0.02);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-setting-row.no-control {
  background: rgba(15, 23, 42, 0.025);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-right:empty {
  display: none;
}

.ivlyrics-options-modal-shell {
  width: min(92vw, 860px);
}

.ivlyrics-options-modal-body {
  padding-top: 18px;
}

.ivlyrics-options-root {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ivlyrics-options-root .ivlyrics-popup-section-list {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-list {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.02);
}

.ivlyrics-options-root .ivlyrics-popup-setting-name,
.ivlyrics-options-root .ivlyrics-popup-row-with-icon {
  color: inherit;
  font-size: 14px;
  font-weight: 600;
}

.ivlyrics-options-root .ivlyrics-popup-row-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ivlyrics-options-root .ivlyrics-popup-row-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(248, 250, 252, 0.72);
  flex: 0 0 auto;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-row-icon {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(15, 23, 42, 0.04);
  color: rgba(15, 23, 42, 0.72);
}

.ivlyrics-options-root .ivlyrics-popup-row-icon svg {
  width: 13px;
  height: 13px;
}

.ivlyrics-options-root .ivlyrics-popup-row-with-icon span {
  min-width: 0;
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-left,
.ivlyrics-options-root .ivlyrics-popup-setting-row-right {
  min-width: 0;
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.ivlyrics-options-root .ivlyrics-popup-setting-description {
  color: rgba(248, 250, 252, 0.56);
  font-size: 12px;
  line-height: 1.45;
  margin-top: 4px;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-setting-description,
.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-row-with-icon svg {
  color: rgba(15, 23, 42, 0.58);
}

.ivlyrics-popup-switch {
  width: 44px;
  min-width: 44px;
  height: 24px;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  border-radius: 0;
}

.ivlyrics-popup-switch.active {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.12);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-popup-switch {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.04);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-popup-switch.active {
  border-color: rgba(15, 23, 42, 0.18);
  background: rgba(15, 23, 42, 0.08);
}

.ivlyrics-popup-switch-knob {
  width: 18px;
  height: 18px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.14);
  transform: translateX(0);
  transition: transform 0.18s ease;
  border-radius: 0;
}

.ivlyrics-popup-switch.active .ivlyrics-popup-switch-knob {
  transform: translateX(18px);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-popup-switch-knob {
  background: #ffffff;
}

.ivlyrics-options-root .optionsMenu-dropBox,
.optionsMenu-dropdown-list {
  border-radius: 0 !important;
}

.ivlyrics-options-root .optionsMenu-dropBox {
  min-width: 120px;
  min-height: 36px;
  width: 100%;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font-size: 13px;
  justify-content: space-between;
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row {
  border-left: none;
  border-right: none;
  border-bottom: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row {
  border-top-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row:first-child {
  border-top: none;
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row-content {
  padding-inline: 14px;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .optionsMenu-dropBox {
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.05);
}

.optionsMenu-dropdown-list {
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  z-index: var(--iv-layer-modal, 2147483647) !important;
}

.optionsMenu-dropdown-list[data-ui-theme="light"] {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16);
}

.optionsMenu-item {
  color: #f8fafc;
}

.optionsMenu-dropdown-list[data-ui-theme="light"] .optionsMenu-item {
  color: #0f172a;
}

.optionsMenu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.optionsMenu-dropdown-list[data-ui-theme="light"] .optionsMenu-item:hover {
  background: rgba(15, 23, 42, 0.06);
}

.optionsMenu-item.selected {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.optionsMenu-dropdown-list[data-ui-theme="light"] .optionsMenu-item.selected {
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
}

.lyrics-sync-adjust-modal-shell {
  width: min(92vw, 480px);
  max-height: min(78vh, 760px);
}

.lyrics-sync-adjust-floating {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: var(--iv-layer-modal, 2147483647);
  pointer-events: none;
}

.lyrics-sync-adjust-floating > * {
  pointer-events: auto;
}

.lyrics-sync-adjust-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lyrics-sync-adjust-info {
  color: rgba(248, 250, 252, 0.62);
  font-size: 13px;
  line-height: 1.5;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-info {
  color: rgba(15, 23, 42, 0.6);
}

.lyrics-sync-adjust-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.lyrics-sync-adjust-side {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: space-between;
  gap: 8px;
}

.lyrics-sync-adjust-fine {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lyrics-sync-adjust-quick {
  display: flex;
  gap: 6px;
}

.lyrics-sync-adjust-modal .lyrics-sync-adjust-slider-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lyrics-sync-adjust-modal .sync-slider {
  width: 100%;
  height: 28px;
  background: transparent;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-runnable-track {
  height: 2px;
  background: linear-gradient(to right, rgba(255,255,255,0.76) var(--progress-percent, 50%), rgba(255,255,255,0.18) var(--progress-percent, 50%));
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -6px;
  background: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.38);
  box-shadow: none;
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-track {
  height: 2px;
  background: rgba(255,255,255,0.18);
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-progress {
  height: 2px;
  background: rgba(255, 255, 255, 0.76);
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  background: #ffffff;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-webkit-slider-runnable-track {
  background: linear-gradient(to right, rgba(15,23,42,0.72) var(--progress-percent, 50%), rgba(15,23,42,0.18) var(--progress-percent, 50%));
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-webkit-slider-thumb {
  background: #ffffff;
  border-color: rgba(15, 23, 42, 0.28);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-moz-range-track {
  background: rgba(15,23,42,0.18);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-moz-range-progress {
  background: rgba(15,23,42,0.72);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-moz-range-thumb {
  border-color: rgba(15, 23, 42, 0.28);
}

.lyrics-sync-adjust-slider-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  color: rgba(248, 250, 252, 0.52);
  font-size: 11px;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-slider-summary {
  color: rgba(15, 23, 42, 0.56);
}

.lyrics-sync-adjust-current {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 700;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-current {
  color: #0f172a;
}

.lyrics-sync-adjust-reset {
  flex: 0 0 auto;
}

.lyrics-sync-adjust-track {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.lyrics-sync-adjust-track-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-pill {
  position: static;
  left: auto;
  bottom: auto;
  z-index: auto;
  align-self: stretch;
  justify-content: center;
  width: 100%;
  max-width: none;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-controls {
  justify-content: center;
  width: 100%;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-step {
  flex: 1 1 0;
  padding-inline: 4px;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-value {
  flex: 1.25 1 0;
  min-width: 54px;
  padding-inline: 5px;
}

.lyrics-sync-adjust-global-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-global-section {
  border-top-color: rgba(15, 23, 42, 0.08);
}

.lyrics-sync-adjust-section-title {
  color: #f8fafc;
  font-size: 13px;
  font-weight: 700;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-section-title {
  color: #0f172a;
}

.lyrics-sync-adjust-section-desc {
  margin: -4px 0 0;
  color: rgba(248, 250, 252, 0.58);
  font-size: 12px;
  line-height: 1.45;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-section-desc {
  color: rgba(15, 23, 42, 0.58);
}

.share-image-modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 84vh;
  color: #f8fafc;
  font-family: "Segoe UI Variable Text", "Segoe UI", "Pretendard Variable", Pretendard, sans-serif;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal {
  color: #0f172a;
}

.share-image-modal-header {
  padding-bottom: 18px;
}

.share-image-modal-content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 0.46fr) minmax(0, 0.54fr);
  overflow: hidden;
}

.share-image-modal-selection-pane {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  min-width: 0;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-selection-pane {
  border-right-color: rgba(15, 23, 42, 0.08);
}

.share-image-modal-selection-label {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(248, 250, 252, 0.58);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-selection-label {
  border-bottom-color: rgba(15, 23, 42, 0.08);
  color: rgba(15, 23, 42, 0.58);
}

.share-image-modal-selection-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-image-modal-lyric-line {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  border-radius: 0 !important;
}

.share-image-modal-lyric-line[data-selected="true"] {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line[data-selected="true"] {
  border-color: rgba(15, 23, 42, 0.18);
  background: rgba(15, 23, 42, 0.08);
}

.share-image-modal-lyric-line > div:first-child {
  font-size: 14px !important;
  font-weight: 600 !important;
  color: inherit !important;
}

.share-image-modal-lyric-line > div:nth-child(2) {
  color: rgba(248, 250, 252, 0.52) !important;
}

.share-image-modal-lyric-line > div:nth-child(3) {
  color: rgba(248, 250, 252, 0.72) !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line > div:nth-child(2) {
  color: rgba(15, 23, 42, 0.52) !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line > div:nth-child(3) {
  color: rgba(15, 23, 42, 0.72) !important;
}

.share-image-modal-config-pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
}

.share-image-control-group > label,
.share-image-advanced-panel label {
  color: rgba(248, 250, 252, 0.62) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-control-group > label,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel label {
  color: rgba(15, 23, 42, 0.62) !important;
}

.share-image-segment-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.share-image-chip,
.share-image-segment-btn,
.share-image-advanced-toggle,
.share-image-modal button:not(.ivlyrics-fluent-close):not(.ivlyrics-fluent-btn) {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  color: inherit !important;
  border-radius: 0 !important;
  cursor: pointer;
}

.share-image-chip[data-active="true"],
.share-image-segment-btn[data-active="true"] {
  border-color: #1db954 !important;
  background: rgba(29, 185, 84, 0.18) !important;
  color: #f8fafc !important;
  box-shadow: 0 0 0 1px #1db954, 0 0 12px rgba(29, 185, 84, 0.35) !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-chip,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-segment-btn,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-toggle,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal button:not(.ivlyrics-fluent-close):not(.ivlyrics-fluent-btn) {
  border-color: rgba(15, 23, 42, 0.12) !important;
  background: rgba(15, 23, 42, 0.04) !important;
  color: #0f172a !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-chip[data-active="true"],
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-segment-btn[data-active="true"] {
  border-color: #1db954 !important;
  background: rgba(29, 185, 84, 0.14) !important;
  color: #0f172a !important;
  box-shadow: 0 0 0 1px #1db954, 0 0 12px rgba(29, 185, 84, 0.25) !important;
}

.share-image-advanced-toggle {
  justify-content: flex-start;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
}

.share-image-advanced-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.03) !important;
  border-radius: 0 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel {
  border-color: rgba(15, 23, 42, 0.08) !important;
  background: rgba(15, 23, 42, 0.03) !important;
}

.share-image-panel-section {
  grid-column: span 2;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: rgba(248, 250, 252, 0.72) !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-panel-section {
  border-bottom-color: rgba(15, 23, 42, 0.08) !important;
  color: rgba(15, 23, 42, 0.72) !important;
}

.share-image-advanced-panel input[type="range"],
.share-image-modal input[type="range"] {
  width: 100%;
  accent-color: #e5e7eb;
}

.share-image-advanced-panel input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #e5e7eb;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel input[type="range"],
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal input[type="range"],
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel input[type="checkbox"] {
  accent-color: #334155;
}

.share-image-check {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share-image-preview-panel {
  flex: 1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
  border-radius: 0 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-preview-panel {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
}

.share-image-preview-panel img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 0 !important;
}

.share-image-placeholder {
  color: rgba(248, 250, 252, 0.52);
  font-size: 13px;
  text-align: center;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-placeholder {
  color: rgba(15, 23, 42, 0.52);
}

.share-image-modal-footer {
  justify-content: space-between;
}

.share-image-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.share-image-modal-footer .ivlyrics-fluent-btn {
  border-radius: 0 !important;
}

.share-image-modal-footer .ivlyrics-fluent-btn:not(.primary) {
  border-color: rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  color: #f8fafc !important;
}

.share-image-modal-footer .ivlyrics-fluent-btn.primary {
  border-color: rgba(255, 255, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.12) !important;
  color: #f8fafc !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-footer .ivlyrics-fluent-btn:not(.primary) {
  border-color: rgba(15, 23, 42, 0.12) !important;
  background: rgba(15, 23, 42, 0.04) !important;
  color: #0f172a !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-footer .ivlyrics-fluent-btn.primary {
  border-color: rgba(15, 23, 42, 0.18) !important;
  background: rgba(15, 23, 42, 0.08) !important;
  color: #0f172a !important;
}

.share-image-copyright-shell {
  width: min(92vw, 460px);
  background: rgba(12, 12, 12, 0.96) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.42) !important;
}

.share-image-copyright-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.share-image-copyright-icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.share-image-copyright-points {
  margin: 0;
  padding-left: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding-top: 12px;
  padding-bottom: 12px;
  padding-right: 12px;
  line-height: 1.7;
  color: rgba(248, 250, 252, 0.68);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-copyright-points {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
  color: rgba(15, 23, 42, 0.68);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-copyright-shell {
  background: rgba(255, 255, 255, 0.96) !important;
  border-color: rgba(15, 23, 42, 0.12) !important;
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.16) !important;
}

.share-image-copyright-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.share-image-copyright-actions .ivlyrics-fluent-btn {
  flex: 1 1 0;
}

.share-image-copyright-confirm {
  border-color: rgba(255, 255, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.12) !important;
  color: #f8fafc !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-copyright-confirm {
  border-color: rgba(15, 23, 42, 0.18) !important;
  background: rgba(15, 23, 42, 0.08) !important;
  color: #0f172a !important;
}

@media (max-width: 960px) {
  .share-image-modal-content {
    grid-template-columns: 1fr;
  }

  .share-image-modal-selection-pane {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    max-height: 240px;
  }

  .ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-selection-pane {
    border-bottom-color: rgba(15, 23, 42, 0.08);
  }
}

@media (max-width: 840px) {
  .ivlyrics-options-root .ivlyrics-popup-setting-row-content {
    grid-template-columns: 1fr;
  }

  .ivlyrics-options-root .ivlyrics-popup-setting-row-right {
    justify-content: flex-start;
  }

  .lyrics-sync-adjust-floating {
    right: 16px;
    left: 16px;
    bottom: 16px;
  }

  .lyrics-sync-adjust-modal-shell {
    width: auto;
    max-height: min(72vh, 760px);
  }

  .lyrics-sync-adjust-layout {
    grid-template-columns: 1fr;
  }

  .lyrics-sync-adjust-side,
  .lyrics-sync-adjust-track {
    width: 100%;
  }

  .lyrics-sync-adjust-track {
    flex-direction: column;
    align-items: stretch;
  }

  .lyrics-sync-adjust-quick {
    flex-wrap: wrap;
  }

  .ivlyrics-first-language-overlay {
    padding: 12px 12px 96px;
  }

  .ivlyrics-first-language-shell {
    width: min(420px, calc(100vw - 24px));
  }
}

/* Compact glass surface shared by toolbar popups and editors */
.ivlyrics-fluent-overlay {
  --iv-popup-bg: rgba(20, 20, 22, 0.78);
  --iv-popup-bg-strong: rgba(28, 28, 31, 0.9);
  --iv-popup-fill: rgba(255, 255, 255, 0.055);
  --iv-popup-fill-hover: rgba(255, 255, 255, 0.095);
  --iv-popup-border: rgba(255, 255, 255, 0.12);
  --iv-popup-divider: rgba(255, 255, 255, 0.085);
  padding: 18px;
  background: rgba(0, 0, 0, 0.42);
  opacity: 0;
  transition: opacity 180ms var(--iv-motion-ease-standard, ease);
}

.ivlyrics-fluent-overlay[data-ui-theme="light"] {
  --iv-popup-bg: rgba(252, 252, 253, 0.82);
  --iv-popup-bg-strong: rgba(255, 255, 255, 0.94);
  --iv-popup-fill: rgba(15, 23, 42, 0.045);
  --iv-popup-fill-hover: rgba(15, 23, 42, 0.075);
  --iv-popup-border: rgba(15, 23, 42, 0.12);
  --iv-popup-divider: rgba(15, 23, 42, 0.085);
  background: rgba(236, 239, 244, 0.55);
}

.ivlyrics-fluent-overlay.is-open {
  opacity: 1;
}

.ivlyrics-fluent-overlay.is-closing {
  pointer-events: none;
}

.ivlyrics-fluent-shell {
  width: min(92vw, 720px);
  background: var(--iv-popup-bg) !important;
  border: 1px solid var(--iv-popup-border) !important;
  border-radius: 24px !important;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.36) !important;
  backdrop-filter: blur(24px) saturate(142%);
  -webkit-backdrop-filter: blur(24px) saturate(142%);
  transform: translateY(12px) scale(0.975);
  opacity: 0;
  transition:
    transform 180ms var(--iv-motion-ease-emphasis, ease),
    opacity 140ms var(--iv-motion-ease-standard, ease);
}

.ivlyrics-fluent-overlay.is-open .ivlyrics-fluent-shell {
  transform: translateY(0) scale(1);
  opacity: 1;
}

.ivlyrics-fluent-overlay.is-closing .ivlyrics-fluent-shell {
  transform: translateY(6px) scale(0.985);
  opacity: 0;
}

.ivlyrics-fluent-header {
  align-items: center;
  min-height: 64px;
  padding: 14px 16px 12px 20px;
  border-bottom-color: var(--iv-popup-divider);
}

.ivlyrics-fluent-title {
  font-size: 18px;
  letter-spacing: -0.025em;
}

.ivlyrics-fluent-subtitle {
  margin-top: 5px;
  line-height: 1.4;
}

.ivlyrics-fluent-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--iv-popup-border);
  border-radius: 999px !important;
  background: var(--iv-popup-fill);
  transition:
    background 140ms ease,
    transform 140ms ease;
}

.ivlyrics-fluent-close:hover {
  background: var(--iv-popup-fill-hover);
  transform: scale(1.04);
}

.ivlyrics-fluent-body {
  padding: 16px 20px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.ivlyrics-fluent-body::-webkit-scrollbar,
.share-image-modal-selection-list::-webkit-scrollbar,
.share-image-modal-config-pane::-webkit-scrollbar {
  width: 5px;
}

.ivlyrics-fluent-body::-webkit-scrollbar-thumb,
.share-image-modal-selection-list::-webkit-scrollbar-thumb,
.share-image-modal-config-pane::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.ivlyrics-fluent-footer {
  padding: 12px 16px 16px;
  border-top-color: var(--iv-popup-divider);
}

.ivlyrics-fluent-btn,
.share-image-modal-footer .ivlyrics-fluent-btn,
.share-image-copyright-actions .ivlyrics-fluent-btn {
  min-height: 34px;
  border-radius: 999px !important;
  border-color: var(--iv-popup-border) !important;
  background: var(--iv-popup-fill) !important;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    transform 140ms ease;
}

.ivlyrics-fluent-btn:hover:not(:disabled) {
  background: var(--iv-popup-fill-hover) !important;
  transform: translateY(-1px);
}

.ivlyrics-fluent-btn.primary,
.share-image-modal-footer .ivlyrics-fluent-btn.primary,
.share-image-copyright-confirm {
  color: var(--spice-text, #fff) !important;
  border-color: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.34) !important;
  background: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.16) !important;
}

.ivlyrics-fluent-close:focus-visible,
.ivlyrics-fluent-btn:focus-visible,
.ivlyrics-popup-switch:focus-visible,
.ivlyrics-options-root .optionsMenu-dropBox:focus-visible,
.share-image-modal button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--spice-rgb-accent, 30, 215, 96), 0.24) !important;
}

.ivlyrics-options-modal-shell {
  width: min(92vw, 700px);
}

.ivlyrics-options-root {
  gap: 14px;
}

.ivlyrics-options-root .ivlyrics-popup-section-title {
  margin-top: 16px;
  padding: 0 4px 8px;
  border: 0;
}

.ivlyrics-options-root .ivlyrics-popup-section-title h3 {
  font-size: 13px;
}

.ivlyrics-options-root .ivlyrics-popup-section-list {
  overflow: hidden;
  border: 1px solid var(--iv-popup-divider);
  border-radius: 16px;
  background: var(--iv-popup-fill);
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row {
  border-color: var(--iv-popup-divider);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-content {
  min-height: 54px;
  padding: 10px 14px;
}

.ivlyrics-options-root .ivlyrics-popup-row-icon {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: var(--iv-popup-fill-hover);
}

.ivlyrics-popup-switch {
  border-radius: 999px;
}

.ivlyrics-popup-switch.active {
  border-color: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.36);
  background: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.2);
}

.ivlyrics-popup-switch-knob {
  border-radius: 999px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.24);
}

.ivlyrics-options-root .optionsMenu-dropBox {
  min-height: 34px;
  border-radius: 11px !important;
  border-color: var(--iv-popup-border);
  background: var(--iv-popup-fill);
}

.optionsMenu-dropdown-list {
  max-height: min(320px, 48vh);
  overflow-y: auto;
  border-radius: 14px !important;
  background: var(--iv-popup-bg-strong, rgba(20, 20, 22, 0.96));
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
}

.optionsMenu-item:first-child {
  border-radius: 10px 10px 0 0;
}

.optionsMenu-item:last-child {
  border-radius: 0 0 10px 10px;
}

.lyrics-sync-adjust-floating {
  right: 70px;
  bottom: 16px;
}

.lyrics-sync-adjust-floating .ivlyrics-fluent-shell {
  opacity: 1;
  transform: none;
}

.lyrics-sync-adjust-modal-shell {
  width: min(92vw, 410px);
  border-radius: 22px !important;
  background: rgba(20, 20, 22, 0.8) !important;
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-runnable-track,
.lyrics-sync-adjust-modal .sync-slider::-moz-range-track,
.lyrics-sync-adjust-modal .sync-slider::-moz-range-progress {
  border-radius: 999px;
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-thumb,
.lyrics-sync-adjust-modal .sync-slider::-moz-range-thumb {
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}

.share-image-modal-lyric-line,
.share-image-advanced-panel,
.share-image-preview-panel,
.share-image-preview-panel img,
.share-image-copyright-points {
  border-radius: 14px !important;
}

.share-image-chip,
.share-image-segment-btn,
.share-image-advanced-toggle,
.share-image-modal button:not(.ivlyrics-fluent-close):not(.ivlyrics-fluent-btn) {
  border-radius: 999px !important;
}

.share-image-copyright-shell {
  border-radius: 22px !important;
  background: var(--iv-popup-bg) !important;
}

.share-image-copyright-icon {
  border-radius: 999px;
  background: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.14);
  color: var(--spice-accent, #1ed760);
}

/* The first-language card is non-modal and contained by the current ivLyrics page. */
.ivlyrics-fluent-overlay.ivlyrics-first-language-overlay {
  position: absolute;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 20px 24px 24px;
  background: transparent !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
}

.ivlyrics-fluent-shell.ivlyrics-first-language-shell {
  box-sizing: border-box;
  width: min(340px, 100%);
  max-height: min(560px, 100%);
  background: var(--surface) !important;
  border-color: var(--line-2) !important;
  border-radius: 10px !important;
  box-shadow: var(--shadow-2) !important;
  color: var(--text);
  font-family: var(--font);
  pointer-events: auto;
}

.ivlyrics-fluent-shell.ivlyrics-first-language-shell[data-ui-theme="light"] {
  background: var(--surface) !important;
  border-color: var(--line-2) !important;
  box-shadow: var(--shadow-2) !important;
  color: var(--text);
}

@media (max-width: 840px) {
  .ivlyrics-fluent-overlay {
    padding: 10px;
  }

  .ivlyrics-fluent-shell {
    max-height: calc(100dvh - 20px);
    border-radius: 20px !important;
  }

  .ivlyrics-options-root .ivlyrics-popup-setting-row-content {
    gap: 8px;
  }

  .lyrics-sync-adjust-floating {
    right: 12px;
    left: 12px;
    bottom: 12px;
  }

  .ivlyrics-fluent-overlay.ivlyrics-first-language-overlay {
    padding: 12px;
  }

  .ivlyrics-fluent-shell.ivlyrics-first-language-shell {
    width: min(340px, 100%);
    max-height: calc(100% - 24px);
    border-radius: 10px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ivlyrics-fluent-overlay,
  .ivlyrics-fluent-shell {
    transition-duration: 1ms !important;
  }
}
`;
  style.textContent += getSettingsSurfaceTokenCss(".ivlyrics-first-language-shell");
  document.head.appendChild(style);
}

const OptionsMenu = react.memo(
  ({ options, onSelect, selected, defaultValue, bold = false }) => {
    // Custom Dropdown State
    const [isOpen, setIsOpen] = react.useState(false);
    const containerRef = react.useRef(null);
    const dropdownRef = react.useRef(null);
    const [dropdownPosition, setDropdownPosition] = react.useState({ top: 0, left: 0, width: 0 });

    // React 31 방지: options 배열 유효성 검사
    const safeOptions = Array.isArray(options) ? options : [];
    const optionByKey = react.useMemo(
      () => new Map(safeOptions.map((option) => [option.key, option])),
      [safeOptions]
    );

    // 초기 선택 값 결정 (selected 또는 defaultValue에서)
    const resolveOptionItem = (candidate) => {
      let item = candidate;
      if (item && typeof item !== 'object') {
        item = optionByKey.get(item);
      } else if (item && item.key && !item.value) {
        const found = optionByKey.get(item.key);
        if (found) item = found;
      }
      return item;
    };
    const getInitialSelected = () => resolveOptionItem(selected || defaultValue);

    // 내부 상태로 선택된 항목 관리
    const [selectedItem, setSelectedItem] = react.useState(getInitialSelected);

    // props가 변경되면 내부 상태 업데이트
    react.useEffect(() => {
      setSelectedItem(getInitialSelected());
    }, [selected, defaultValue, optionByKey]);

    // Resolve default item for display fallback
    const defaultItem = resolveOptionItem(defaultValue);

    // Determine display text
    const displayValue = selectedItem?.value || defaultItem?.value || (typeof defaultValue === 'string' ? defaultValue : "") || "";

    // Toggle Dropdown and Calculate Position
    const toggleDropdown = () => {
      if (!isOpen) {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.right + window.scrollX, // Align Right
            width: Math.max(rect.width, 160)
          });
        }
      }
      setIsOpen(!isOpen);
    };

    // Close on outside click & scroll
    react.useEffect(() => {
      if (!isOpen) return;

      const handleOutsideClick = (e) => {
        // 드롭다운 내부 클릭은 무시 (개별 아이템 클릭 핸들러에서 처리)
        if (e.target.closest('.optionsMenu-dropdown-list')) return;

        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      };

      const handleScroll = (e) => {
        // 드롭다운 목록 내부 스크롤은 무시
        if (dropdownRef.current && dropdownRef.current.contains(e.target)) {
          return;
        }
        // 외부 스크롤 시 위치가 어긋나므로 닫음
        setIsOpen(false);
      };

      window.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('scroll', handleScroll, true); // Capture phase for all scrollable parents
      window.addEventListener('resize', handleScroll);

      return () => {
        window.removeEventListener('mousedown', handleOutsideClick);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
      };
    }, [isOpen]);

    // Render Dropdown via Portal
    const surfaceTheme = getSettingsSurfaceTheme();
    const dropdownMenu = isOpen && Spicetify.ReactDOM.createPortal(
      react.createElement(
        "div",
        {
          ref: dropdownRef,
          className: "optionsMenu-dropdown-list",
          "data-ui-theme": surfaceTheme,
          style: {
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: 'auto',
            right: `${window.innerWidth - dropdownPosition.left}px`, // Right Align
            width: 'max-content',
            minWidth: `${dropdownPosition.width}px`,
            maxWidth: '300px',
            marginTop: '0', // Portal 사용 시 margin 불필요
            zIndex: 'var(--iv-layer-modal, 2147483647)' // 최상위
          }
        },
        safeOptions.map(({ key, value }) => {
          const isSelected = selectedItem?.key === key;
          return react.createElement(
            "div",
            {
              key,
              className: `optionsMenu-item ${isSelected ? "selected" : ""}`,
              onMouseDown: (e) => {
                // onClick 대신 onMouseDown 사용: window의 mousedown 리스너가 먼저 실행되어 메뉴를 닫는 것을 방지
                e.preventDefault();
                e.stopPropagation();

                // 내부 상태 업데이트
                const selectedOption = optionByKey.get(key);
                if (selectedOption) {
                  setSelectedItem(selectedOption);
                }

                // 외부 콜백 호출
                window.__ivLyricsDebugLog?.('[OptionsMenu] Item clicked:', key, 'onSelect type:', typeof onSelect);
                if (typeof onSelect === 'function') {
                  onSelect(key);
                } else {
                  console.error('[OptionsMenu] onSelect is not a function:', onSelect);
                }
                setIsOpen(false);
              }
            },
            react.createElement("span", null, value),
            isSelected && react.createElement(
              "svg",
              {
                width: 16,
                height: 16,
                viewBox: "0 0 16 16",
                fill: "currentColor"
              },
              react.createElement("path", {
                d: "M13.985 2.383L5.127 12.754 1.388 8.375l-.658.77 4.397 5.149 9.618-11.262z"
              })
            )
          );
        })
      ),
      document.body // Body에 직접 렌더링
    );

    return react.createElement(
      "div",
      {
        ref: containerRef,
        style: { position: "relative" }
      },
      react.createElement(
        "button",
        {
          className: "optionsMenu-dropBox",
          onClick: toggleDropdown,
        },
        react.createElement(
          "span",
          {
            className: bold ? "main-type-mestoBold" : "main-type-mesto",
          },
          displayValue
        ),
        react.createElement(
          "svg",
          {
            height: "16",
            width: "16",
            fill: "currentColor",
            viewBox: "0 0 16 16",
            style: {
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease"
            }
          },
          react.createElement("path", {
            d: "M3 6l5 5.794L13 6z",
          })
        )
      ),
      dropdownMenu
    );
  }
);

const ICONS = {
  provider: `<path d="M8 1.5a1 1 0 0 1 1 1v.56a4.97 4.97 0 0 1 1.4.58l.4-.4a1 1 0 0 1 1.42 0l.78.78a1 1 0 0 1 0 1.42l-.4.4c.27.44.47.91.58 1.4H14.5a1 1 0 0 1 1 1v1.1a1 1 0 0 1-1 1h-.56a4.97 4.97 0 0 1-.58 1.4l.4.4a1 1 0 0 1 0 1.42l-.78.78a1 1 0 0 1-1.42 0l-.4-.4a4.97 4.97 0 0 1-1.4.58v.56a1 1 0 0 1-1 1H7.4a1 1 0 0 1-1-1v-.56a4.97 4.97 0 0 1-1.4-.58l-.4.4a1 1 0 0 1-1.42 0l-.78-.78a1 1 0 0 1 0-1.42l.4-.4a4.97 4.97 0 0 1-.58-1.4H1.5a1 1 0 0 1-1-1V7.4a1 1 0 0 1 1-1h.56c.11-.49.31-.96.58-1.4l-.4-.4a1 1 0 0 1 0-1.42l.78-.78a1 1 0 0 1 1.42 0l.4.4c.44-.27.91-.47 1.4-.58V2.5a1 1 0 0 1 1-1H8Zm-.05 4.1a2.45 2.45 0 1 0 0 4.9 2.45 2.45 0 0 0 0-4.9Z"/>`,
  display: `<path d="M1.5 2.5h13v11h-13v-11Zm1 1v9h11v-9h-11Zm1.5 1.5h3v3h-3v-3Zm4 0h4v1h-4v-1Zm0 2h4v1h-4V7Zm-4 2h8v1h-8V9Zm0 2h6v1h-6v-1Z"/>`,
  mode: `<path d="M2 4.5h7v1H2v-1Zm0 6h12v1H2v-1Zm9-7h3v3h-3v-3Zm-4 5h3v3H7v-3Z"/>`,
  language: `<path d="M8 1.25a6.75 6.75 0 1 1 0 13.5 6.75 6.75 0 0 1 0-13.5Zm0 1a5.75 5.75 0 0 0-4.61 9.18h1.44c-.2-.6-.33-1.27-.38-1.97H2.83v-1h1.6c.06-.98.29-1.9.65-2.7H3.86v-1h1.8A5.73 5.73 0 0 1 8 2.25Zm1.34 2.5H6.66c-.42.8-.69 1.72-.76 2.7h4.2c-.07-.98-.34-1.9-.76-2.7Zm.99 3.7H5.67c.06.7.2 1.37.42 1.97h3.82c.22-.6.36-1.27.42-1.97Zm-.58 2.97H6.25c.49.88 1.12 1.33 1.75 1.33s1.26-.45 1.75-1.33Zm2.86-1.97h-1.62c-.05.7-.18 1.37-.38 1.97h1.44a5.72 5.72 0 0 0 .56-1.97Zm-.02-1c-.07-.98-.3-1.9-.66-2.7h1.22a5.72 5.72 0 0 1 .68 2.7H12.6Zm-1.66-3.7c-.5-.98-1.16-1.5-1.93-1.5s-1.43.52-1.93 1.5h3.86Z"/>`,
  background: `<path d="M2 3h12v10H2V3Zm1 1v8h10V4H3Zm1.5 6.25 2.1-2.6 1.55 1.8 1.05-1.25 2.3 2.05H4.5Zm6.25-4.75a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"/>`,
  localLyrics: `<path d="M3 1.5h6.5L13 5v9.5H3v-13Zm1 1v11h8V5.5H9V2.5H4Zm6 .7V4.5h1.3L10 3.2ZM5.25 7.5h5.5v1h-5.5v-1Zm0 2h5.5v1h-5.5v-1Zm0 2h3.5v1h-3.5v-1Z"/>`,
  search: `<path d="M6.75 1.75a4.75 4.75 0 0 1 3.8 7.6l3.2 3.2-.7.7-3.2-3.2a4.75 4.75 0 1 1-3.1-8.3Zm0 1a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z"/>`,
  file: `<path d="M3 1.5h6.5L13 5v9.5H3v-13Zm1 1v11h8V5.5H9V2.5H4Zm6 .7V4.5h1.3L10 3.2ZM5 7.5h6v1H5v-1Zm0 2h6v1H5v-1Zm0 2h4v1H5v-1Z"/>`,
  trash: `<path d="M6.25 1.5h3.5l.5 1H14v1H2v-1h3.75l.5-1ZM3.5 4.5h9l-.75 10h-7.5l-.75-10Zm1.08 1 .6 8h5.64l.6-8H4.58ZM6.5 6.5h1v5h-1v-5Zm2 0h1v5h-1v-5Z"/>`,
};

// Toolbar icons use one optical grid so every action stays distinct at compact sizes.
const IVLYRICS_TOOLBAR_ICON_PATHS = Object.freeze({
  menu: '<path d="M6 7h12M6 12h12M6 17h12"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  translation: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  provider: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  localLyrics: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h4"/><path d="M10 12v5m0-5 5-1v5"/><circle cx="8.5" cy="18" r="1.5"/><circle cx="13.5" cy="17" r="1.5"/>',
  background: '<path d="M3 15V7a3 3 0 0 1 3-3h11"/><rect x="5" y="5" width="16" height="14" rx="3"/><circle cx="16.5" cy="9" r="1.5"/><path d="m7 16 4-4 3 3 2-2 3 3"/>',
  regenerate: '<path d="M20 7A8 8 0 0 0 6.3 5.3L4 8"/><path d="M4 8V3m0 5h5"/><path d="M4 17a8 8 0 0 0 13.7 1.7L20 16"/><path d="M20 16v5m0-5h-5"/>',
  study: '<path d="M3 5a3 3 0 0 1 3-1h6v16H6a3 3 0 0 0-3 1V5Z"/><path d="M21 5a3 3 0 0 0-3-1h-6v16h6a3 3 0 0 1 3 1V5Z"/>',
  globalSync: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  communityVideo: '<path d="M5 3h16l-2 4H3l2-4Z"/><path d="m10 3-2 4m8-4-2 4"/><path d="M3 7h18v13H3Z"/><path d="m10 11 5 3-5 3Z"/>',
  shareImage: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5m-7.6 6.9 7.6 4.5"/>',
  editLyrics: '<path d="M6 3h8l4 4v5"/><path d="M14 3v5h4"/><path d="M12 21H6V3"/><path d="m13.5 18.5 5-5 2 2-5 5-3 1 1-3Z"/>',
  marketplace: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14.5v6m-3-3h6"/>',
  settings: '<path d="M4 6h10m4 0h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h2m4 0h10"/><circle cx="8" cy="12" r="2"/><path d="M4 18h8m4 0h4"/><circle cx="14" cy="18" r="2"/>',
  fullscreenEnter: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  fullscreenExit: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  fullscreenPage: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/><path d="M7 8h10v6H7Z"/>',
  fullscreenScreen: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/><path d="M8 11V8h3m5 3v3h-3"/>',
  karaoke: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8"/>',
  character: '<path d="m5 18 4.5-12h2L16 18M7 13h7"/><path d="M18 7h3M19.5 5.5v3"/>',
  word: '<path d="m3 18 4-12h2l4 12M5 13h6"/><path d="M16 8h5M16 12h5M16 16h5"/>',
  synced: '<path d="M4 6h10M4 11h9M4 16h7"/><path d="M18 6v7"/><circle cx="18" cy="15" r="2"/>',
  unsynced: '<path d="M4 6h14M4 11h16M4 16h12"/>',
  syncCreator: '<path d="M3 12h2l2-5 3 10 3-8 2 6"/><path d="m16 19 4-4 2 2-4 4-3 1 1-3Z"/>',
  // Lyrics-page toolbar: entries and panel controls drawn on the same grid.
  track: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  // Pronunciation-first: the two lyric rows trade places.
  pronunciationFirst: '<path d="M3 7h10M3 12h6M3 17h10"/><path d="M18 4v16"/><path d="m15 7 3-3 3 3"/><path d="m15 17 3 3 3-3"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 11.5h1v5h1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
});

const IvLyricsToolbarIcon = ({ name, size = 18, className = "" }) =>
  react.createElement("svg", {
    className: `ivlyrics-toolbar-icon${className ? ` ${className}` : ""}`,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    focusable: "false",
    "aria-hidden": "true",
    "data-icon": name,
    dangerouslySetInnerHTML: {
      __html: IVLYRICS_TOOLBAR_ICON_PATHS[name] || IVLYRICS_TOOLBAR_ICON_PATHS.menu,
    },
  });

window.IvLyricsToolbarIcon = IvLyricsToolbarIcon;

const getOptionsText = (key, fallback) => {
  const value = I18n?.t?.(key);
  return value && value !== key ? value : fallback;
};

// ---------------------------------------------------------------------------
// Lyrics-page toolbar: panel parts
// The toolbar's panels are small settings pages: groups of rows with switches,
// pickers, option lists, offsets and sliders on neutral surfaces, with the
// accent kept for state. They render inside the toolbar element (no portals),
// so hover, focus-within and outside clicks treat the toolbar and its open
// panel as one surface.
// ---------------------------------------------------------------------------
const joinToolbarClasses = (...names) => names.filter(Boolean).join(" ");
let toolbarControlIdSeq = 0;
const useToolbarControlId = (prefix) => {
  const ref = useRef(null);
  if (!ref.current) {
    toolbarControlIdSeq += 1;
    ref.current = prefix + "-" + toolbarControlIdSeq.toString(36);
  }
  return ref.current;
};

const ToolbarGlyph = ({ name, size = 18, className = "" }) =>
  react.createElement(IvLyricsToolbarIcon, { name, size, className });

const ToolbarPanelSection = ({ title, children, className = "" }) =>
  react.createElement(
    "section",
    { className: joinToolbarClasses("ivl-tb-sec", className) },
    title ? react.createElement("h3", { className: "ivl-tb-sec-title" }, title) : null,
    children
  );

const ToolbarPanelGroup = ({ children, className = "" }) =>
  react.createElement("div", { className: joinToolbarClasses("ivl-tb-group", className) }, children);

const ToolbarPanelRow = ({ label, desc, control, stack = false, indent = false, className = "", mainProps = null }) =>
  react.createElement(
    "div",
    { className: joinToolbarClasses("ivl-tb-row", stack ? "is-stack" : "is-inline", indent && "is-indent", className) },
    react.createElement(
      "div",
      { className: "ivl-tb-row-main", ...(mainProps || {}) },
      label ? react.createElement("div", { className: "ivl-tb-row-label" }, label) : null,
      desc ? react.createElement("div", { className: "ivl-tb-row-desc" }, desc) : null
    ),
    control ? react.createElement("div", { className: "ivl-tb-row-control" }, control) : null
  );

const ToolbarButton = ({ children, onClick, variant = "", size = "sm", disabled = false, className = "", ...rest }) =>
  react.createElement(
    "button",
    {
      type: "button",
      className: joinToolbarClasses(
        "ivl-tb-btn",
        size === "sm" && "is-sm",
        variant && "is-" + variant,
        className
      ),
      disabled,
      onClick,
      ...rest,
    },
    children
  );

const ToolbarSwitch = ({ checked, onChange, label, disabled = false }) =>
  react.createElement(
    "label",
    { className: "ivl-tb-switch" },
    react.createElement("input", {
      type: "checkbox",
      role: "switch",
      checked: !!checked,
      disabled,
      "aria-label": label,
      onChange: (event) => onChange(event.target.checked),
    }),
    react.createElement("span", { className: "ivl-tb-switch-track", "aria-hidden": "true" }),
    react.createElement("span", { className: "ivl-tb-switch-thumb", "aria-hidden": "true" })
  );

// On/off rows: the title and description are part of the hit area. A press
// that wandered (drag) or ended in a text selection is not a toggle.
const ToolbarToggleRow = ({ label, desc, checked, onChange, indent = false, disabled = false }) => {
  const pressRef = useRef(null);
  return react.createElement(ToolbarPanelRow, {
    label,
    desc,
    indent,
    className: joinToolbarClasses("is-toggle-row", disabled && "is-disabled"),
    mainProps: {
      onPointerDown: (event) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
      },
      onClick: (event) => {
        if (disabled || event.target.closest?.("a, button, input, select, textarea, label")) return;
        const press = pressRef.current;
        if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return;
        if (String(window.getSelection?.() || "")) return;
        onChange(!checked);
      },
    },
    control: react.createElement(ToolbarSwitch, { checked, onChange, label, disabled }),
  });
};

// Picker button with a listbox below (or above, when the panel has no room).
// Esc and outside clicks close the list without closing the panel.
const ToolbarSelect = ({ value, options, onChange, label, disabled = false }) => {
  const safeOptions = Array.isArray(options) ? options : [];
  const selectedIndex = Math.max(0, safeOptions.findIndex((option) => option.key === value));
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [placement, setPlacement] = useState("below");
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useToolbarControlId("ivl-tb-select");

  const openList = () => {
    setActiveIndex(selectedIndex);
    setPlacement("below");
    setIsOpen(true);
  };
  const closeList = (restoreFocus) => {
    setIsOpen(false);
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  };
  const pick = (option) => {
    if (!option || option.disabled) return;
    closeList(true);
    if (option.key !== value) onChange(option.key);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen]);

  react.useLayoutEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    const wrap = wrapRef.current;
    const scroller = wrap?.closest?.(".ivl-tb-fly-body");
    if (list && wrap && scroller) {
      const wrapRect = wrap.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const below = scrollerRect.bottom - wrapRect.bottom;
      const above = wrapRect.top - scrollerRect.top;
      if (below < list.offsetHeight + 8 && above > below) setPlacement("above");
    }
    list?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.children?.[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, activeIndex]);

  const handleListKeyDown = (event) => {
    const last = safeOptions.length - 1;
    let next = null;
    if (event.key === "ArrowDown") next = Math.min(last, activeIndex + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, activeIndex - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(next);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      pick(safeOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeList(true);
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  };

  return react.createElement(
    "div",
    { className: joinToolbarClasses("ivl-tb-select", isOpen && "is-open"), ref: wrapRef },
    react.createElement(
      "button",
      {
        type: "button",
        ref: buttonRef,
        className: "ivl-tb-picker",
        disabled,
        "aria-haspopup": "listbox",
        "aria-expanded": isOpen,
        "aria-controls": isOpen ? listId : undefined,
        "aria-label": label + ": " + (safeOptions[selectedIndex]?.value || ""),
        onClick: () => (isOpen ? closeList(false) : openList()),
        onKeyDown: (event) => {
          if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            event.stopPropagation();
            openList();
          }
        },
      },
      react.createElement("span", { className: "ivl-tb-picker-value ivl-tb-trunc" }, safeOptions[selectedIndex]?.value || ""),
      react.createElement(ToolbarGlyph, { name: "chevronDown", size: 15 })
    ),
    isOpen && react.createElement(
      "div",
      {
        ref: listRef,
        id: listId,
        className: "ivl-tb-pop is-" + placement,
        role: "listbox",
        tabIndex: -1,
        "aria-label": label,
        "aria-activedescendant": listId + "-" + activeIndex,
        onKeyDown: handleListKeyDown,
      },
      safeOptions.map((option, index) => react.createElement(
        "div",
        {
          key: option.key,
          id: listId + "-" + index,
          role: "option",
          className: joinToolbarClasses("ivl-tb-opt", index === activeIndex && "is-active"),
          "aria-selected": index === selectedIndex,
          "aria-disabled": option.disabled ? "true" : undefined,
          onPointerDown: (event) => event.preventDefault(),
          onPointerMove: () => {
            if (index !== activeIndex) setActiveIndex(index);
          },
          onClick: () => pick(option),
        },
        react.createElement("span", { className: "ivl-tb-opt-label ivl-tb-trunc" }, option.value),
        react.createElement(ToolbarGlyph, { name: "check", size: 15, className: "ivl-tb-opt-check" })
      ))
    )
  );
};

const moveToolbarFocus = (event, container, selector) => {
  if (!container || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  const items = Array.from(container.querySelectorAll(selector))
    .filter((item) => !item.disabled && item.getClientRects().length > 0);
  if (!items.length) return false;
  const index = items.indexOf(document.activeElement);
  let next = 0;
  if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
  else if (event.key === "ArrowUp") next = index <= 0 ? items.length - 1 : index - 1;
  else if (event.key === "End") next = items.length - 1;
  event.preventDefault();
  event.stopPropagation();
  items[next].focus();
  return true;
};

// Inline option list (provider, background): the selected option is the tab
// stop, arrows move between options, Enter, Space or a click picks one.
const ToolbarOptionList = ({ options, value, onPick, label, disabled = false }) => {
  const listRef = useRef(null);
  const safeOptions = Array.isArray(options) ? options : [];
  const selectedKey = safeOptions.some((option) => option.key === value) ? value : safeOptions[0]?.key;
  return react.createElement(
    "div",
    {
      ref: listRef,
      className: joinToolbarClasses("ivl-tb-options", disabled && "is-disabled"),
      role: "listbox",
      "aria-label": label,
      "aria-disabled": disabled || undefined,
      onKeyDown: (event) => moveToolbarFocus(event, listRef.current, ".ivl-tb-opt"),
    },
    safeOptions.map((option) => react.createElement(
      "button",
      {
        key: option.key,
        type: "button",
        role: "option",
        className: "ivl-tb-opt",
        "aria-selected": option.key === value,
        tabIndex: option.key === selectedKey ? 0 : -1,
        disabled: disabled || option.disabled,
        onClick: () => onPick(option.key),
      },
      react.createElement("span", { className: "ivl-tb-opt-label ivl-tb-trunc" }, option.value),
      react.createElement(ToolbarGlyph, { name: "check", size: 15, className: "ivl-tb-opt-check" })
    ))
  );
};

const ToolbarMenuList = ({ label, children }) => {
  const listRef = useRef(null);
  return react.createElement(
    "div",
    {
      ref: listRef,
      className: "ivl-tb-group ivl-tb-menu",
      role: "menu",
      "aria-label": label,
      onKeyDown: (event) => moveToolbarFocus(event, listRef.current, ".ivl-tb-mi"),
    },
    children
  );
};

const ToolbarMenuItem = ({ icon, label, desc, value, drill = false, popup, checked, current = false, disabled = false, onClick }) =>
  react.createElement(
    "button",
    {
      type: "button",
      className: joinToolbarClasses("ivl-tb-mi", current && "is-current"),
      role: checked === undefined ? "menuitem" : "menuitemcheckbox",
      "aria-checked": checked === undefined ? undefined : !!checked,
      "aria-haspopup": popup || (drill ? "true" : undefined),
      "aria-current": current ? "page" : undefined,
      disabled,
      onClick,
    },
    react.createElement("span", { className: "ivl-tb-mi-ico" }, react.createElement(ToolbarGlyph, { name: icon, size: 18 })),
    react.createElement(
      "span",
      { className: "ivl-tb-mi-main" },
      react.createElement("span", { className: "ivl-tb-mi-label ivl-tb-trunc" }, label),
      desc ? react.createElement("small", null, desc) : null
    ),
    value ? react.createElement("span", { className: "ivl-tb-mi-value ivl-tb-trunc" }, value) : null,
    checked === undefined ? null : react.createElement("span", {
      className: joinToolbarClasses("ivl-tb-mi-state", checked && "is-on"),
      "aria-hidden": "true",
    }),
    current ? react.createElement(ToolbarGlyph, { name: "check", size: 16, className: "ivl-tb-mi-check" }) : null,
    drill ? react.createElement(ToolbarGlyph, { name: "chevronRight", size: 16, className: "ivl-tb-mi-chev" }) : null
  );

const ToolbarNote = ({ children, actions = null }) =>
  react.createElement(
    "div",
    { className: "ivl-tb-note" },
    react.createElement(ToolbarGlyph, { name: "info", size: 16 }),
    react.createElement(
      "div",
      { className: "ivl-tb-note-body" },
      children,
      actions ? react.createElement("div", { className: "ivl-tb-note-actions" }, actions) : null
    )
  );

const formatToolbarOffsetStep = (step) => {
  const sign = step > 0 ? "+" : "\u2212";
  const absoluteMs = Math.abs(step);
  if (absoluteMs >= 1000 && absoluteMs % 1000 === 0) return `${sign}${absoluteMs / 1000}s`;
  return `${sign}${absoluteMs}ms`;
};

const ToolbarOffsetSteps = ({ steps, onStep, label, disabled = false, unit = true }) =>
  react.createElement(
    "div",
    { className: "ivl-tb-offset-quick", role: "group", "aria-label": label },
    steps.map((step) => react.createElement(ToolbarButton, {
      key: step,
      disabled,
      "aria-label": label + " " + formatToolbarOffsetStep(step),
      onClick: () => onStep(step),
    }, unit ? formatToolbarOffsetStep(step) : (step > 0 ? "+" : "\u2212") + Math.abs(step)))
  );

// Numeric value field: the wheel never changes it (it blurs, so the panel
// scrolls), Enter commits and Esc puts the value from before back.
const ToolbarNumberField = ({ value, min, max, step = 1, unit, label, onCommit }) => {
  const [draft, setDraft] = useState(null);
  const cancelRef = useRef(false);
  const commit = () => {
    if (cancelRef.current || draft === null) {
      cancelRef.current = false;
      setDraft(null);
      return;
    }
    const numericValue = Number(draft);
    setDraft(null);
    if (!Number.isFinite(numericValue)) return;
    const snapped = Math.round(numericValue / step) * step;
    onCommit(Math.max(min, Math.min(max, snapped)));
  };
  return react.createElement(
    "label",
    { className: "ivl-tb-value-chip" },
    react.createElement("input", {
      type: "number",
      inputMode: "numeric",
      min,
      max,
      step,
      value: draft === null ? String(value) : draft,
      "aria-label": label,
      onChange: (event) => setDraft(event.target.value),
      onBlur: commit,
      onWheel: (event) => {
        if (document.activeElement === event.currentTarget) event.currentTarget.blur();
      },
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          // The value from before typing stays (nothing was committed). An
          // untouched field lets Esc through, so it still closes the panel.
          if (draft !== null) {
            event.preventDefault();
            event.stopPropagation();
          }
          cancelRef.current = true;
          event.currentTarget.blur();
        }
      },
    }),
    unit ? react.createElement("span", { className: "ivl-tb-unit" }, unit) : null
  );
};

const ToolbarRangeField = ({ value, min, max, step, label, unit, onChange }) => {
  const percent = ((Math.max(min, Math.min(max, value)) - min) / (max - min)) * 100;
  const zero = ((0 - min) / (max - min)) * 100;
  return react.createElement(
    "div",
    { className: "ivl-tb-range", style: { "--ivl-tb-p": percent, "--ivl-tb-d": zero } },
    react.createElement(
      "div",
      { className: "ivl-tb-range-track" },
      react.createElement("span", { className: "ivl-tb-range-rail" }, react.createElement("span", { className: "ivl-tb-range-fill" })),
      react.createElement("span", { className: "ivl-tb-range-default", "aria-hidden": "true" }),
      react.createElement("input", {
        type: "range",
        min,
        max,
        step,
        value,
        "aria-label": label,
        "aria-valuetext": formatSyncOffset(value),
        onChange: (event) => onChange(Number(event.target.value)),
      })
    ),
    react.createElement(ToolbarNumberField, { value, min, max, step, unit, label, onCommit: onChange })
  );
};


const FALLBACK_BACKGROUND_PRESETS = [
  { id: "none", labelKey: "settingsUi.background.none", fallbackLabel: "Minimal" },
  { id: "colorful", labelKey: "settings.colorful.label", fallbackLabel: "Colorful" },
  { id: "gradient-background", labelKey: "settings.gradientBackground.label", fallbackLabel: "Album Gradient" },
  { id: "blur-gradient-background", labelKey: "settings.blurGradientBackground.label", fallbackLabel: "Blur Gradient" },
  { id: "solid-background", labelKey: "settings.solidBackground.label", fallbackLabel: "Solid Color" },
  { id: "video-background", labelKey: "settings.videoBackground.label", fallbackLabel: "Community Video" },
];

const getBackgroundPresetLabel = (modeId) => {
  if (typeof window.ivLyricsGetBackgroundPresetLabel === "function") {
    return window.ivLyricsGetBackgroundPresetLabel(modeId);
  }

  const presets = window.ivLyricsBackgroundPresets || FALLBACK_BACKGROUND_PRESETS;
  const preset = presets.find((item) => item.id === modeId);
  return preset
    ? getOptionsText(preset.labelKey, preset.fallbackLabel)
    : modeId;
};

const getTrackBackgroundOptions = () => {
  const presets = window.ivLyricsBackgroundPresets || FALLBACK_BACKGROUND_PRESETS;
  return [
    {
      key: "inherit",
      value: getOptionsText("menu.trackBackgroundUseGlobal", "기본 설정 사용"),
    },
    ...presets.map((preset) => ({
      key: preset.id,
      value: getBackgroundPresetLabel(preset.id),
    })),
  ];
};

// 최적화 #5 - 재사용 가능한 Adjust 버튼 컴포넌트
const AdjustButton = ({ value, onClick, ariaLabel = null }) => {
  return react.createElement(
    "button",
    {
      type: "button",
      className: "ivlyrics-fluent-btn ivlyrics-adjust-btn",
      onClick,
      "aria-label": ariaLabel || value,
    },
    value
  );
};

const SettingRowDescription = ({ icon, text }) => {
  return react.createElement(
    "div",
    { className: "ivlyrics-popup-row-with-icon" },
    // React 310 방지: icon이 문자열이고 비어있지 않을 때만 렌더링
    icon &&
    typeof icon === "string" &&
    icon &&
    react.createElement(
      "span",
      { className: "ivlyrics-popup-row-icon" },
      react.createElement("svg", {
        width: 16,
        height: 16,
        viewBox: "0 0 16 16",
        fill: "currentColor",
        dangerouslySetInnerHTML: { __html: icon },
      })
    ),
    react.createElement("span", null, text || "")
  );
};

// Helper Component: Toggle Switch
const IvConfigSlider = react.memo(({ defaultValue, onToggle }) => {
  const [isActive, setIsActive] = react.useState(defaultValue);

  const handleClick = () => {
    const newState = !isActive;
    setIsActive(newState);
    onToggle(newState);
  };

  return react.createElement(
    "button",
    {
      className: `ivlyrics-popup-switch ${isActive ? "active" : ""}`,
      onClick: handleClick,
    },
    react.createElement("div", { className: "ivlyrics-popup-switch-knob" })
  );
});

// Helper Component: Simple Button
const IvConfigButton = react.memo(({ text, onClick }) => {
  return react.createElement(
    "button",
    {
      className: "ivlyrics-fluent-btn",
      onClick,
    },
    text
  );
});

// OptionList Component (Renamed to avoid collision)
const IvOptionList = react.memo(({ items, onChange }) => {
  return react.createElement(
    "div",
    { className: "ivlyrics-popup-section-list" },
    items.map((item) => {
      const { key, type, desc, info, ...props } = item;

      let control = null;
      if (type === OptionsMenu) {
        control = react.createElement(OptionsMenu, {
          ...props,
          onSelect: (val) => onChange(key, val),
          selected: props.defaultValue
        });
      } else if (type === IvConfigSlider || type === ConfigSlider) { // Handle both just in case
        control = react.createElement(IvConfigSlider, {
          defaultValue: props.defaultValue,
          onToggle: (val) => onChange(key, val)
        });
      } else if (type === IvConfigButton || type === ConfigButton) {
        control = react.createElement(IvConfigButton, {
          text: props.text,
          onClick: props.onChange || (() => { })
        });
      }

      // info 타입은 컨트롤 없음

      return react.createElement(
        "div",
        { key, className: `ivlyrics-popup-setting-row${control ? "" : " no-control"}` },
        react.createElement(
          "div",
          { className: "ivlyrics-popup-setting-row-content" },
          react.createElement(
            "div",
            { className: "ivlyrics-popup-setting-row-left" },
            react.createElement("div", { className: "ivlyrics-popup-setting-name" }, desc),
            info && react.createElement("div", { className: "ivlyrics-popup-setting-description" }, info)
          ),
          react.createElement(
            "div",
            { className: "ivlyrics-popup-setting-row-right" },
            control
          )
        )
      );
    })
  );
});

// Helper: open a compact options modal using Fluent shell styles
function openOptionsModal(title, items, onChange, eventType = null) {
  const reactDom = resolveOptionsReactDom();
  if (!reactDom?.render) {
    return;
  }

  const container = react.createElement(
    "div",
    { className: "ivlyrics-options-root" },
    items.map((section, sectionIndex) =>
      react.createElement(
        react.Fragment,
        { key: sectionIndex },
        section.section &&
          react.createElement(
            "div",
            { className: "ivlyrics-popup-section-title" },
            react.createElement("h3", null, section.section),
            section.subtitle && react.createElement("p", null, section.subtitle)
          ),
        react.createElement(
          IvOptionList,
          Object.assign(
            {
              items: section.items || [section],
              onChange,
            },
            eventType ? { type: eventType } : {}
          )
        )
      )
    )
  );

  let body = null;
  const host = createFluentModalHost({
    overlayId: "ivLyrics-options-overlay",
    shellClassName: "ivlyrics-options-modal-shell",
    onBeforeClose: () => {
      if (body && reactDom.unmountComponentAtNode) {
        reactDom.unmountComponentAtNode(body);
      }
    },
  });

  const header = document.createElement("div");
  header.className = "ivlyrics-fluent-header";

  const headerText = document.createElement("div");
  headerText.className = "ivlyrics-fluent-title-wrap";

  const headerTitle = document.createElement("h2");
  headerTitle.className = "ivlyrics-fluent-title";
  headerTitle.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.className = "ivlyrics-fluent-close";
  closeBtn.innerHTML =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>';
  closeBtn.onclick = host.closeModal;
  headerText.appendChild(headerTitle);
  header.appendChild(headerText);
  header.appendChild(closeBtn);

  body = document.createElement("div");
  body.className = "ivlyrics-fluent-body ivlyrics-options-modal-body";

  host.shell.id = "ivLyrics-options-modal";
  host.shell.appendChild(header);
  host.shell.appendChild(body);

  reactDom.render(container, body);
  return host.closeModal;
}

const FIRST_LANGUAGE_PROMPT_STORAGE_PREFIX = `${APP_NAME}:first-language-prompted:v1:`;
const firstLanguagePromptPromises = new Map();

function readFirstLanguagePromptStorage(key) {
  try {
    const persisted = window.ivLyricsStoragePersistence?.getItem?.(key);
    if (persisted !== undefined && persisted !== null) return persisted;
  } catch {}
  try {
    const persisted = Spicetify?.LocalStorage?.get?.(key);
    if (persisted !== undefined && persisted !== null) return persisted;
  } catch {}
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFirstLanguagePromptStorage(key, value) {
  try {
    window.ivLyricsStoragePersistence?.setItem?.(key, value);
  } catch {}
  try {
    Spicetify?.LocalStorage?.set?.(key, value);
  } catch {}
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function normalizeFirstLanguagePromptCode(language) {
  const normalized = String(language || "")
    .trim()
    .replaceAll("_", "-")
    .toLowerCase();
  if (["", "auto", "default", "unknown", "und"].includes(normalized)) return "";
  if (normalized === "jp") return "ja";
  if (normalized === "kr") return "ko";
  if (["cn", "zh", "zh-hans", "zh-cn", "zh-sg"].includes(normalized)) return "zh-hans";
  if (["tw", "hk", "zh-hant", "zh-tw", "zh-hk"].includes(normalized)) return "zh-hant";
  return normalized.split("-")[0];
}

function firstLanguagePromptDisplayName(language) {
  try {
    const uiLanguage = I18n.getCurrentLanguage?.() || "en";
    return new Intl.DisplayNames([uiLanguage], { type: "language" }).of(language) || language;
  } catch {
    return language;
  }
}

function hasExplicitFirstLanguageModes(modeKey) {
  const firstKey = `${APP_NAME}:visual:translation-mode:${modeKey}`;
  const secondKey = `${APP_NAME}:visual:translation-mode-2:${modeKey}`;
  return readFirstLanguagePromptStorage(firstKey) !== null
    || readFirstLanguagePromptStorage(secondKey) !== null;
}

const FIRST_LANGUAGE_KEYLESS_PROVIDER_IDS = new Set(["bing-translate", "google-translate"]);

// Translation and pronunciation are separate provider capabilities, so each
// one is checked on its own: keyless-only translation, and whether any enabled
// provider still has pronunciation turned on.
function getFirstLanguageAIProviderHintState() {
  try {
    const manager = window.AIAddonManager;
    const enabledProviders = manager?.getEnabledProviders?.() || [];
    const getProvidersFor = (capability) => (typeof manager?.getEnabledProvidersFor === "function"
      ? manager.getEnabledProvidersFor(capability) || []
      : enabledProviders.filter((provider) => provider?.supports?.[capability] === true));
    const translationProviders = getProvidersFor("translate");
    return {
      missingTranslation: translationProviders.length === 0,
      keylessTranslationOnly: translationProviders.length > 0
        && translationProviders.every((provider) => FIRST_LANGUAGE_KEYLESS_PROVIDER_IDS.has(provider?.id)),
      missingPronunciation: getProvidersFor("pronunciation").length === 0,
      hasPronunciationCapableProvider: enabledProviders.some((provider) => provider?.supports?.pronunciation === true),
    };
  } catch {
    return { missingTranslation: false, keylessTranslationOnly: false, missingPronunciation: false, hasPronunciationCapableProvider: false };
  }
}

function getFirstLanguageAIProviderHintKey(state, wantsPronunciation) {
  if (wantsPronunciation && state.missingPronunciation) {
    // An enabled provider that can pronounce only needs its Pronunciation chip.
    return state.hasPronunciationCapableProvider
      ? "settings.aiProviders.noPronunciationProviders"
      : "firstLanguagePrompt.pronunciationAiProviderHint";
  }
  return state.keylessTranslationOnly ? "firstLanguagePrompt.aiProviderHint" : null;
}

function createFirstLanguageIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", name === "close" ? "m6 6 12 12M6 18 18 6"
    : name === "pronunciation" ? "m4 9 4 0 5-4v14l-5-4H4V9Zm12-2c3 3 3 7 0 10m-1-7c1 1 1 3 0 4"
    : "M3 5h12M9 3v2c0 5-2 8-6 11m1-7c2 3 5 5 8 6m2 5 4-12 4 12m-6-4h4");
  svg.appendChild(path);
  return svg;
}

function openFirstLanguagePrompt({ sourceLang, modeKey }) {
  const normalizedSource = normalizeFirstLanguagePromptCode(sourceLang);
  if (!normalizedSource) return null;

  const pending = firstLanguagePromptPromises.get(normalizedSource);
  if (pending) return pending;

  const promptedKey = `${FIRST_LANGUAGE_PROMPT_STORAGE_PREFIX}${normalizedSource}`;
  if (readFirstLanguagePromptStorage(promptedKey) === "1") return null;
  if (hasExplicitFirstLanguageModes(modeKey)) return null;

  // Mark on presentation, including Escape/backdrop/close, so it never nags on every track.
  writeFirstLanguagePromptStorage(promptedKey, "1");

  const promise = new Promise((resolve) => {
    let settled = false;
    const finish = (choice = "dismissed") => {
      if (settled) return;
      settled = true;
      firstLanguagePromptPromises.delete(normalizedSource);
      resolve(choice);
    };

    const host = createFluentModalHost({
      overlayId: "ivLyrics-first-language-overlay",
      overlayClassName: "ivlyrics-first-language-overlay",
      shellClassName: "ivlyrics-first-language-shell",
      mountNode: resolveFirstLanguagePromptMountNode(),
      modal: false,
      closeOnBackdrop: false,
      trapFocus: false,
      autoFocus: false,
      onBeforeClose: () => finish(),
    });

    const languageName = firstLanguagePromptDisplayName(normalizedSource);
    const titleId = "ivLyrics-first-language-title";
    const descriptionId = "ivLyrics-first-language-description";
    host.shell.setAttribute("aria-labelledby", titleId);
    host.shell.setAttribute("aria-describedby", descriptionId);
    host.shell.setAttribute("aria-live", "polite");

    const header = document.createElement("div");
    header.className = "ivlyrics-first-language-header";
    const buildFirstLanguageHeader = () => {
      const title = document.createElement("h2");
      title.id = titleId;
      title.className = "ivlyrics-first-language-title";
      title.textContent = I18n.t("firstLanguagePrompt.title", { language: languageName });
      const description = document.createElement("p");
      description.id = descriptionId;
      description.className = "ivlyrics-first-language-description";
      description.textContent = I18n.t("firstLanguagePrompt.description");
      const close = document.createElement("button");
      close.type = "button";
      close.className = "ivlyrics-first-language-close";
      close.setAttribute("aria-label", I18n.t("buttons.close"));
      close.appendChild(createFirstLanguageIcon("close"));
      close.addEventListener("click", () => host.closeModal());
      header.append(title, description, close);
    };
    buildFirstLanguageHeader();

    const body = document.createElement("div");
    body.className = "ivlyrics-first-language-body";
    const draft = {
      pronunciation: false,
      translation: false,
    };
    const providerHintState = getFirstLanguageAIProviderHintState();
    const providerHintId = "ivLyrics-first-language-provider-hint";
    let providerHint = null;
    let providerHintText = null;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "ivlyrics-first-language-action";

    const updateProviderHint = () => {
      if (!providerHint || !providerHintText) return;
      // Only show a hint when the selected task needs a provider, keeping the default card quiet.
      const hintKey = draft.pronunciation && providerHintState.missingPronunciation
        ? getFirstLanguageAIProviderHintKey(providerHintState, true)
        : draft.translation && providerHintState.missingTranslation ? "translator.noProviderConfigured" : null;
      providerHint.hidden = !hintKey;
      if (hintKey) providerHintText.textContent = I18n.t(hintKey);
      host.shell.setAttribute("aria-describedby", hintKey ? `${descriptionId} ${providerHintId}` : descriptionId);
    };

    const updateAction = () => {
      const hasSelection = draft.pronunciation || draft.translation;
      action.classList.toggle("has-selection", hasSelection);
      action.textContent = I18n.t(
        hasSelection ? "firstLanguagePrompt.apply" : "firstLanguagePrompt.notNow"
      );
      updateProviderHint();
    };

    const createToggleRow = ({ key, label }) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ivlyrics-first-language-toggle-row";
      row.setAttribute("role", "switch");
      row.setAttribute("aria-checked", "false");

      const rowIcon = document.createElement("span");
      rowIcon.className = "ivlyrics-first-language-row-icon";
      rowIcon.setAttribute("aria-hidden", "true");
      rowIcon.appendChild(createFirstLanguageIcon(key));
      const rowLabel = document.createElement("span");
      rowLabel.className = "ivlyrics-first-language-row-label";
      rowLabel.textContent = label;
      const switchTrack = document.createElement("span");
      switchTrack.className = "ivlyrics-first-language-switch";
      switchTrack.setAttribute("aria-hidden", "true");
      const switchKnob = document.createElement("span");
      switchKnob.className = "ivlyrics-first-language-switch-knob";
      switchTrack.appendChild(switchKnob);
      row.append(rowIcon, rowLabel, switchTrack);

      row.addEventListener("click", () => {
        draft[key] = !draft[key];
        row.setAttribute("aria-checked", draft[key] ? "true" : "false");
        switchTrack.classList.toggle("is-on", draft[key]);
        updateAction();
      });
      return row;
    };

    body.append(
      createToggleRow({
        key: "translation",
        label: I18n.t("firstLanguagePrompt.translation"),
      }),
      createToggleRow({
        key: "pronunciation",
        label: I18n.t("firstLanguagePrompt.pronunciation"),
      })
    );

    if (providerHintState.missingTranslation || providerHintState.missingPronunciation) {
      providerHint = document.createElement("div");
      providerHint.id = providerHintId;
      providerHint.className = "ivlyrics-first-language-provider-hint";
      providerHint.setAttribute("role", "note");
      providerHintText = document.createElement("span");
      providerHint.append(providerHintText);
      body.appendChild(providerHint);
      updateProviderHint();
    }

    action.addEventListener("click", () => {
      if (draft.pronunciation || draft.translation) {
        const pronunciationMode = draft.pronunciation ? "gemini_romaji" : "none";
        const translationMode = draft.translation ? "gemini_ko" : "none";
        CONFIG.visual[`translation-mode:${modeKey}`] = pronunciationMode;
        CONFIG.visual[`translation-mode-2:${modeKey}`] = translationMode;
        StorageManager.setItem(`${APP_NAME}:visual:translation-mode:${modeKey}`, pronunciationMode);
        StorageManager.setItem(`${APP_NAME}:visual:translation-mode-2:${modeKey}`, translationMode);
        finish("configured");
      }
      host.closeModal();
    });
    updateAction();
    host.shell.append(header, body, action);
  });

  firstLanguagePromptPromises.set(normalizedSource, promise);
  return promise;
}

window.ivLyricsFirstLanguagePrompt = {
  maybePrompt({ sourceLang, targetLang, modeKey }) {
    const source = normalizeFirstLanguagePromptCode(sourceLang);
    const target = normalizeFirstLanguagePromptCode(targetLang);
    if (!source || (target && source === target)) return null;
    return openFirstLanguagePrompt({ sourceLang: source, modeKey });
  },
};

const formatLrclibCandidateDuration = (duration) => {
  const seconds = Number(duration);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const getLrclibCandidatePreviewLines = (candidate) => {
  const text = candidate?.previewText || candidate?.syncedLyrics || candidate?.plainLyrics || "";
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]+\]/g, "").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
};

const getLrclibLocalSearchAddon = () => {
  const manager = window.LyricsAddonManager;
  const addon = manager?.getAddon?.("lrclib");
  if (addon?.searchCandidatesByQuery) {
    return addon;
  }
  const addons = manager?.getAddons?.() || [];
  return addons.find((item) => item?.id === "lrclib" && item?.searchCandidatesByQuery) || null;
};

const LocalLyricsLrclibSearchModal = ({ trackInfo = {}, onApplyLocalLyrics, onClose }) => {
  const initialQuery = react.useMemo(() => {
    return [trackInfo?.title, trackInfo?.artist].filter(Boolean).join(" ").trim();
  }, [trackInfo?.title, trackInfo?.artist]);
  const [query, setQuery] = react.useState(initialQuery);
  const [candidates, setCandidates] = react.useState([]);
  const [statusText, setStatusText] = react.useState("");
  const [isSearching, setIsSearching] = react.useState(false);
  const [applyingKey, setApplyingKey] = react.useState(null);

  const performSearch = react.useCallback(async () => {
    const searchValue = String(query || "").trim();
    if (!searchValue) {
      setStatusText(getOptionsText("menu.localLyricsSearchEmpty", "검색어를 입력해 주세요."));
      return;
    }

    const addon = getLrclibLocalSearchAddon();
    if (!addon?.searchCandidatesByQuery) {
      setCandidates([]);
      setStatusText(getOptionsText("menu.localLyricsLrclibUnavailable", "LRCLIB provider를 사용할 수 없습니다."));
      return;
    }

    setIsSearching(true);
    setStatusText("");
    try {
      const result = await addon.searchCandidatesByQuery(searchValue, trackInfo || {});
      const nextCandidates = Array.isArray(result?.candidates) ? result.candidates : [];
      setCandidates(nextCandidates);
      setStatusText(
        nextCandidates.length
          ? getOptionsText("menu.localLyricsSearchResultCount", "{count}개 결과").replace("{count}", nextCandidates.length)
          : (result?.error || getOptionsText("menu.localLyricsSearchNoResults", "검색 결과가 없습니다."))
      );
    } catch (error) {
      console.error("[ivLyrics] LRCLIB local lyrics search failed:", error);
      setCandidates([]);
      setStatusText(error?.message || getOptionsText("menu.localLyricsSearchFailed", "가사 검색에 실패했습니다."));
    } finally {
      setIsSearching(false);
    }
  }, [query, trackInfo]);

  const applyCandidate = react.useCallback(async (candidate) => {
    if (!candidate || applyingKey) {
      return;
    }

    const candidateKey = candidate.candidateKey || `${candidate.id || "candidate"}`;
    setApplyingKey(candidateKey);
    try {
      await onApplyLocalLyrics?.(candidate, { source: "lrclib-local-search", query });
      onClose?.();
    } catch (error) {
      console.error("[ivLyrics] Failed to apply local LRCLIB lyrics:", error);
      Toast.error(error?.message || getOptionsText("menu.localLyricsApplyFailed", "가사를 적용하지 못했습니다."));
    } finally {
      setApplyingKey(null);
    }
  }, [applyingKey, onApplyLocalLyrics, onClose, query]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void performSearch();
    }
  };

  const renderSearchHeader = () => react.createElement(
    "div",
    { className: "ivlyrics-fluent-header" },
    react.createElement(
      "div",
      { className: "ivlyrics-fluent-title-wrap" },
      react.createElement("h2", { className: "ivlyrics-fluent-title" }, getOptionsText("menu.localLyricsLrclibSearch", "LRCLIB 가사 검색")),
      react.createElement(
        "p",
        { className: "ivlyrics-fluent-subtitle" },
        getOptionsText("menu.localLyricsLrclibSearchSubtitle", "로컬 곡에는 ivLyrics 서버를 사용하지 않고 선택한 가사만 이 기기에 저장합니다.")
      )
    ),
    react.createElement(
      "button",
      {
        className: "ivlyrics-fluent-close",
        type: "button",
        onClick: onClose,
        "aria-label": I18n.t("buttons.close") || "Close",
      },
      react.createElement("svg", {
        viewBox: "0 0 16 16",
        fill: "currentColor",
        dangerouslySetInnerHTML: {
          __html: '<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>',
        },
      })
    )
  );

  const renderLrclibCandidate = (candidate, index) => {
    const candidateKey = candidate.candidateKey || `${candidate.id || "candidate"}-${index}`;
    const title = candidate.trackName || candidate.name || getOptionsText("menu.unknownTitle", "Unknown title");
    const artist = candidate.artistName || getOptionsText("menu.unknownArtist", "Unknown artist");
    const album = candidate.albumName || "";
    const duration = formatLrclibCandidateDuration(candidate.duration);
    const previewLines = getLrclibCandidatePreviewLines(candidate);
    const meta = [artist, album, duration].filter(Boolean).join(" · ");
    const badges = [
      (candidate.hasSyncedLyrics || candidate.syncedLyrics) && getOptionsText("syncCreator.lrclibBadgeSynced", "Synced"),
      (candidate.hasPlainLyrics || candidate.plainLyrics) && getOptionsText("syncCreator.lrclibBadgePlain", "Plain"),
      candidate.instrumental && getOptionsText("syncCreator.lrclibBadgeInstrumental", "Instrumental"),
    ].filter(Boolean);

    return react.createElement(
      "div",
      { key: candidateKey, className: "ivl-tb-lrclib-result" },
      react.createElement(
        "div",
        { className: "ivl-tb-lrclib-main" },
        react.createElement(
          "div",
          { className: "ivl-tb-lrclib-title" },
          react.createElement("span", { className: "ivl-tb-trunc", title }, title),
          badges.map((badge) => react.createElement("span", { key: badge, className: "ivl-tb-pill" }, badge))
        ),
        react.createElement("div", { className: "ivl-tb-lrclib-meta ivl-tb-trunc", title: meta }, meta),
        previewLines.length > 0 && react.createElement(
          "div",
          { className: "ivl-tb-lrclib-preview" },
          previewLines.join(" / ")
        )
      ),
      react.createElement(
        "button",
        {
          className: "ivlyrics-fluent-btn",
          type: "button",
          onClick: () => void applyCandidate(candidate),
          disabled: !!applyingKey,
        },
        applyingKey === candidateKey
          ? getOptionsText("menu.localLyricsApplying", "적용 중")
          : getOptionsText("menu.apply", "적용")
      )
    );
  };

  const searchPlaceholder = getOptionsText("menu.localLyricsSearchPlaceholder", "곡명 또는 아티스트 검색");
  const renderLrclibSearchBar = () => react.createElement(
    "div",
    { className: "ivl-tb-lrclib-search" },
    react.createElement("input", {
      className: "ivl-tb-lrclib-input",
      type: "search",
      value: query,
      onChange: (event) => setQuery(event.target.value),
      onKeyDown: handleKeyDown,
      placeholder: searchPlaceholder,
      "aria-label": searchPlaceholder,
      autoComplete: "off",
    }),
    react.createElement(
      "button",
      {
        className: "ivlyrics-fluent-btn primary",
        type: "button",
        onClick: () => void performSearch(),
        disabled: isSearching,
      },
      isSearching
        ? getOptionsText("menu.localLyricsSearching", "검색 중")
        : getOptionsText("menu.search", "검색")
    )
  );

  return react.createElement(
    react.Fragment,
    null,
    renderSearchHeader(),
    react.createElement(
      "div",
      { className: "ivlyrics-fluent-body ivlyrics-options-modal-body ivl-tb-lrclib" },
      renderLrclibSearchBar(),
      statusText && react.createElement("p", { className: "ivl-tb-lrclib-status", role: "status" }, statusText),
      candidates.length > 0 && react.createElement(
        "div",
        { className: "ivl-tb-lrclib-results" },
        candidates.map(renderLrclibCandidate)
      )
    )
  );
};

function openLocalLyricsLrclibSearchModal({ trackInfo, onApplyLocalLyrics }) {
  return openFluentReactModal({
    overlayId: "ivLyrics-local-lyrics-lrclib-overlay",
    // ivl-tb-dialog: dialogs opened from the lyrics-page toolbar share its look.
    overlayClassName: "ivl-tb-dialog-overlay",
    shellClassName: "ivlyrics-options-modal-shell ivl-tb-dialog ivl-tb-lrclib-shell",
    render: (closeModal) => react.createElement(LocalLyricsLrclibSearchModal, {
      trackInfo,
      onApplyLocalLyrics,
      onClose: closeModal,
    }),
  });
}

// Opens the settings window on a tab (and section) from a toolbar panel. An
// already open settings window is closed first, as the conversion dialog did.
const openToolbarSettings = (options = {}) => {
  const overlay = document.getElementById("ivLyrics-settings-overlay");
  if (overlay) {
    if (typeof window.ivLyricsCloseConfig === "function") {
      window.ivLyricsCloseConfig();
    } else {
      overlay.remove();
      document.documentElement.classList.remove("ivlyrics-settings-open");
      document.body?.classList.remove("ivlyrics-settings-open");
    }
  }
  setTimeout(() => {
    openConfig(options);
  }, overlay ? getSettingsMotionDurationMs() + 24 : 0);
};

// 변환 (conversion) panel. It mounts each time the panel opens; opening it
// leaves the legacy replacement display mode exactly as opening the old
// conversion dialog did, and every control writes the same keys with the same
// side effects as that dialog's rows.
const TranslationMenu = react.memo(({ friendlyLanguage, detectedLanguage = null, regenerate = null, cacheEdit = null, onOpenSettings }) => {
  const open = () => {
    // Refresh prepared lyric rows when leaving the legacy replacement mode.
    const displayModeChanged = CONFIG.visual["translate:display-mode"] !== "below";
    CONFIG.visual["translate:display-mode"] = "below";
    StorageManager.setItem(
      `${APP_NAME}:visual:translate:display-mode`,
      "below"
    );
    if (displayModeChanged) lyricContainerUpdate?.();

    // Determine the correct mode key based on language
    window.__ivLyricsDebugLog?.(
      "[TranslationMenu] Language:",
      friendlyLanguage,
      "ModeKey:",
      friendlyLanguage || "gemini"
    );
  };
  useEffect(() => {
    open();
  }, []);

  const modeKey = friendlyLanguage || "gemini";

  // 감지된 언어를 사용자 친화적인 이름으로 변환
  const getDisplayLanguageName = (lang) => {
    if (!lang) return I18n.t("menu.unknownLanguage");
    try {
      // 현재 UI 언어로 언어 이름 표시
      const uiLang = I18n.getCurrentLanguage();
      const displayName = new Intl.DisplayNames([uiLang], { type: "language" }).of(lang);
      return displayName || lang;
    } catch {
      return lang;
    }
  };

  // Get target language for translation (to display)
  const getTranslationTargetDisplay = () => {
    const targetLang = CONFIG.visual?.["translate:target-language"];
    if (targetLang && targetLang !== "auto") {
      return getDisplayLanguageName(targetLang);
    }
    // If "auto", defaults to interface language.
    const interfaceLang = I18n.getCurrentLanguage();
    const autoText = I18n.t("settings.translationTargetLanguage.options.auto") || "Same as interface language";
    return `${autoText} (${getDisplayLanguageName(interfaceLang)})`;
  };
  const normalizePronunciationNotation = (value) => {
    const sharedNormalize = window.ivLyricsPronunciationNotation?.normalize;
    if (typeof sharedNormalize === "function") {
      return sharedNormalize(value);
    }
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "latin" || normalized === "ipa"
      ? normalized
      : "translation";
  };
  const pronunciationNotationOptions = useMemo(() => [
    {
      key: "translation",
      value: I18n.t("menu.pronunciationNotationTranslation") || "Current translation language",
    },
    {
      key: "latin",
      value: I18n.t("menu.pronunciationNotationLatin") || "Latin (Romanization)",
    },
    {
      key: "ipa",
      value: I18n.t("menu.pronunciationNotationIpa") || "International Phonetic Alphabet (IPA)",
    },
  ], []);

  // 지원되는 언어 목록
  const supportedLanguages = useMemo(() => [
    { key: "auto", value: I18n.t("menu.autoDetect") || "자동 감지" },
    { key: "ja", value: getDisplayLanguageName("ja") },
    { key: "ko", value: getDisplayLanguageName("ko") },
    { key: "zh-hans", value: getDisplayLanguageName("zh-Hans") },
    { key: "zh-hant", value: getDisplayLanguageName("zh-Hant") },
    { key: "en", value: getDisplayLanguageName("en") },
    { key: "ru", value: getDisplayLanguageName("ru") },
    { key: "vi", value: getDisplayLanguageName("vi") },
    { key: "de", value: getDisplayLanguageName("de") },
    { key: "sv", value: getDisplayLanguageName("sv") },
    { key: "es", value: getDisplayLanguageName("es") },
    { key: "fr", value: getDisplayLanguageName("fr") },
    { key: "pt", value: getDisplayLanguageName("pt") },
    { key: "tr", value: getDisplayLanguageName("tr") },
    { key: "cs", value: getDisplayLanguageName("cs") },
    { key: "pl", value: getDisplayLanguageName("pl") },
    { key: "ar", value: getDisplayLanguageName("ar") },
    { key: "th", value: getDisplayLanguageName("th") },
    { key: "hi", value: getDisplayLanguageName("hi") },
    { key: "id", value: getDisplayLanguageName("id") },
    { key: "ms", value: getDisplayLanguageName("ms") },
    // Also detected since the language model; names come from Intl.
    ...["it", "nl", "uk", "bg", "sr", "hr", "ro", "hu", "fi", "da", "no", "sk", "el", "he", "fa", "ur", "bn", "pa", "ta", "tl", "ca",
      "az", "sq", "kk", "mk", "be", "lt", "lv", "et", "af", "is", "mr", "te"]
      .map((key) => ({ key, value: getDisplayLanguageName(key) })),
  ], []);

  const [isPronunciationOn, setPronunciationOn] = useState(
    () => CONFIG.visual[`translation-mode:${modeKey}`] !== "none"
  );
  const [isTranslationOn, setTranslationOn] = useState(
    () => CONFIG.visual[`translation-mode-2:${modeKey}`] !== "none"
  );
  const [pronunciationNotation, setPronunciationNotation] = useState(() => normalizePronunciationNotation(
    CONFIG.visual?.["translate:pronunciation-notation"] ||
    StorageManager.getItem(`${APP_NAME}:visual:translate:pronunciation-notation`)
  ));
  // 현재 트랙의 언어 오버라이드 상태
  const [languageOverride, setLanguageOverride] = useState(
    () => window.lyricContainer?.trackLanguageOverride || "auto"
  );

  const handleTranslationMenuChange = async (name, value) => {
    // 트랙별 언어 오버라이드 처리
    if (name === "track-language-override") {
      const trackUri = Spicetify.Player.data?.item?.uri;
      if (!trackUri) return;

      if (value === "auto") {
        // 자동 감지로 되돌리기 - DB에서 삭제
        await window.TrackLanguageDB?.clearLanguage(trackUri);
        if (window.lyricContainer) {
          window.lyricContainer.trackLanguageOverride = null;
        }
      } else {
        // 언어 오버라이드 저장
        await window.TrackLanguageDB?.setLanguage(trackUri, value);
        if (window.lyricContainer) {
          window.lyricContainer.trackLanguageOverride = value;
        }
      }

      // 번역 캐시 클리어 및 강제 리로드
      window.LyricsService?.clearLyricsSnapshot?.(trackUri);
      if (window.lyricContainer) {
        window.lyricContainer._dmResults = {};
        window.lyricContainer.lastProcessedUri = null;
        window.lyricContainer.lastProcessedMode = null;
        window.lyricContainer.forceUpdate();
      }
      lyricContainerUpdate?.();
      return;
    }

    if (name === "translate:pronunciation-notation") {
      const normalizedNotation = normalizePronunciationNotation(value);
      CONFIG.visual[name] = normalizedNotation;
      StorageManager.setItem(`${APP_NAME}:visual:${name}`, normalizedNotation);
      return;
    }

    // Handle toggle values - convert boolean to appropriate mode string
    if (name.startsWith("translation-mode")) {
      // For first line (발음), set to romaji or none
      if (name.startsWith(`translation-mode:`) && !name.includes("mode-2")) {
        value = value ? "gemini_romaji" : "none";
      }
      // For second line (번역), set to korean or none
      else if (name.startsWith(`translation-mode-2:`)) {
        value = value ? "gemini_ko" : "none";
      }
    }

    CONFIG.visual[name] = value;
    StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);

    if (name.startsWith("translation-mode")) {
      if (window.lyricContainer) {
        // Clear translation cache to force reload with new settings
        window.lyricContainer._dmResults = {};
        window.lyricContainer.lastProcessedUri = null;
        window.lyricContainer.lastProcessedMode = null;
        window.lyricContainer.forceUpdate();
      }
    }

    lyricContainerUpdate?.();
  };

  return react.createElement(
    "div",
    { className: "ivl-tb-stack" },
    react.createElement(
      ToolbarPanelSection,
      { title: I18n.t("menu.translationOptions") },
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarToggleRow, {
          label: I18n.t("menu.pronunciation"),
          desc: I18n.t("menu.pronunciationInfo"),
          checked: isPronunciationOn,
          onChange: (checked) => {
            setPronunciationOn(checked);
            void handleTranslationMenuChange(`translation-mode:${modeKey}`, checked);
          },
        }),
        isPronunciationOn && react.createElement(ToolbarPanelRow, {
          indent: true,
          stack: true,
          label: I18n.t("menu.pronunciationNotation") || "Pronunciation notation",
          desc: I18n.t("menu.pronunciationNotationInfo") || "Choose how generated pronunciation is written. Regenerate pronunciation to update the current lyrics.",
          control: react.createElement(ToolbarSelect, {
            value: pronunciationNotation,
            options: pronunciationNotationOptions,
            label: I18n.t("menu.pronunciationNotation") || "Pronunciation notation",
            onChange: (key) => {
              setPronunciationNotation(normalizePronunciationNotation(key));
              void handleTranslationMenuChange("translate:pronunciation-notation", key);
            },
          }),
        }),
        react.createElement(ToolbarToggleRow, {
          label: I18n.t("menu.translationLabel"),
          desc: I18n.t("menu.translationInfo"),
          checked: isTranslationOn,
          onChange: (checked) => {
            setTranslationOn(checked);
            void handleTranslationMenuChange(`translation-mode-2:${modeKey}`, checked);
          },
        }),
        react.createElement(ToolbarPanelRow, {
          stack: true,
          label: I18n.t("menu.translationTargetLang"),
          desc: I18n.t("menu.translationTargetLangInfo"),
          control: react.createElement(
            "span",
            { className: "ivl-tb-value-wrap" },
            react.createElement("span", { className: "ivl-tb-value ivl-tb-trunc" }, getTranslationTargetDisplay()),
            react.createElement(ToolbarButton, {
              variant: "link",
              onClick: () => onOpenSettings?.({ initialTab: "general", initialSettingKey: "language" }),
            }, getOptionsText("settings.hotkey.change", "변경"))
          ),
        })
      )
    ),
    react.createElement(
      ToolbarPanelSection,
      { title: I18n.t("menu.detectedLanguage") },
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarPanelRow, {
          // The detected code reads as a localized name (friendlyLanguage is an
          // English config key such as "japanese").
          label: getDisplayLanguageName(detectedLanguage || friendlyLanguage),
          desc: I18n.t("menu.detectedLanguageInfo"),
          control: languageOverride === "auto"
            ? react.createElement("span", { className: "ivl-tb-pill" }, I18n.t("menu.autoDetect") || "자동 감지")
            : null,
        }),
        react.createElement(ToolbarPanelRow, {
          stack: true,
          label: I18n.t("menu.overrideLanguage") || "언어 수동 설정",
          desc: I18n.t("menu.overrideLanguageInfo") || "이 곡의 언어를 수동으로 설정합니다. 자동 감지 대신 선택한 언어로 번역됩니다.",
          control: react.createElement(ToolbarSelect, {
            value: languageOverride,
            options: supportedLanguages,
            label: I18n.t("menu.overrideLanguage") || "언어 수동 설정",
            onChange: (key) => {
              setLanguageOverride(key);
              void handleTranslationMenuChange("track-language-override", key);
            },
          }),
        })
      )
    ),
    (regenerate || cacheEdit) && react.createElement(
      ToolbarPanelSection,
      { title: I18n.t("menu.regenerateTranslation") },
      react.createElement(
        ToolbarPanelGroup,
        null,
        regenerate && react.createElement(RegenerateTranslationButton, regenerate),
        cacheEdit && react.createElement(ToolbarPanelRow, {
          label: I18n.t("lyricsCacheEditor.button"),
          control: react.createElement(ToolbarButton, {
            disabled: cacheEdit.disabled,
            onClick: cacheEdit.onOpen,
          }, I18n.t("buttons.edit")),
        })
      )
    ),
    react.createElement(
      ToolbarPanelSection,
      { title: I18n.t("menu.apiSettings") },
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarPanelRow, {
          label: I18n.t("menu.apiKeySettings"),
          desc: I18n.t("menu.apiSettingsSubtitle"),
          control: react.createElement(ToolbarButton, {
            onClick: () => onOpenSettings?.({ initialTab: "ai-providers" }),
          }, I18n.t("menu.openSettings")),
        })
      )
    )
  );
});

// 현재 곡 > 가사 제공자 선택 (로컬 가사 on a local track). The item drills into
// the view built below, which keeps the rows, choices and handlers of the
// dialog it replaces.
const LyricsProviderSelectButton = react.memo(
  ({
    selectedProvider,
    isLoading,
    isLocalTrack = false,
    hasLocalLyrics = false,
    onOpen,
  }) => {
    const providers = !isLocalTrack && selectedProvider
      ? window.LyricsAddonManager?.getEnabledProviders?.() || []
      : [];
    const value = isLocalTrack
      ? (hasLocalLyrics ? getOptionsText("menu.localLyricsProvider", "Local") : "")
      : selectedProvider
        ? providers.find((provider) => provider.id === selectedProvider)?.name || selectedProvider
        : I18n.t("menu.lyricsProviderAuto");

    return react.createElement(ToolbarMenuItem, {
      icon: isLocalTrack ? "localLyrics" : "provider",
      label: isLocalTrack
        ? getOptionsText("menu.localLyricsTools", "로컬 가사")
        : I18n.t("menu.lyricsProviderSelect"),
      value,
      drill: true,
      disabled: isLoading && !isLocalTrack,
      onClick: onOpen,
    });
  }
);

// The view behind the provider item. closeModal closes the whole panel (a file
// picker or a dialog takes over); closeView goes back to the 현재 곡 list.
function buildLyricsProviderView({
  currentProvider,
  selectedProvider,
  isLocalTrack = false,
  trackInfo = null,
  onSelectProvider,
  onImportLocalLyricsFile,
  onApplyLocalLyrics,
  getHasLocalLyrics,
  onDeleteLocalLyrics,
  closeModal,
  closeView,
}) {
  const providers = window.LyricsAddonManager?.getEnabledProviders?.() || [];
  const providerOptions = [
    { key: "auto", value: I18n.t("menu.lyricsProviderAuto") },
    ...providers.map((provider) => ({
      key: provider.id,
      value: provider.name || provider.id,
    })),
  ];

  if (
    selectedProvider &&
    !providerOptions.some((option) => option.key === selectedProvider)
  ) {
    providerOptions.push({
      key: selectedProvider,
      value: `${selectedProvider} (${I18n.t("menu.lyricsProviderUnavailable")})`,
    });
  }

  const currentProviderLabel =
    isLocalTrack
      ? getOptionsText("menu.localLyricsProvider", "Local")
      : (
        providers.find((provider) => provider.id === currentProvider)?.name ||
        currentProvider ||
        I18n.t("menu.unknownLanguage")
      );

  if (isLocalTrack) {
    const hasLocalLyrics = !!getHasLocalLyrics?.();
    return {
      title: getOptionsText("menu.localLyricsTools", "로컬 가사"),
      subtitle: getOptionsText(
        "menu.localLyricsToolsSubtitle",
        "로컬 곡은 ivLyrics 서버와 분리됩니다. LRC 파일을 가져오거나 LRCLIB에서 직접 검색해 이 기기에 저장합니다."
      ),
      groups: [
        [
          {
            key: "current-local-lyrics-provider",
            type: "info",
            label: getOptionsText("menu.localLyricsCurrent", "현재 로컬 가사"),
            value: currentProviderLabel || "local",
          },
          {
            key: "local-lyrics-import",
            type: "button",
            label: getOptionsText("menu.importLrcFile", "LRC 파일 가져오기"),
            buttonText: getOptionsText("menu.import", "가져오기"),
            onClick: () => {
              closeModal?.();
              onImportLocalLyricsFile?.();
            },
          },
          {
            key: "local-lyrics-lrclib-search",
            type: "button",
            label: getOptionsText("menu.searchLrclibLocal", "LRCLIB에서 검색"),
            buttonText: getOptionsText("menu.search", "검색"),
            onClick: () => {
              closeModal?.();
              openLocalLyricsLrclibSearchModal({
                trackInfo,
                onApplyLocalLyrics,
              });
            },
          },
          // 가져온 로컬 가사는 곡 캐시가 아니라 이 기기에 저장된 사용자 데이터라서,
          // 캐시 삭제로는 지워지지 않는다. 저장된 가사가 있을 때 여기서 직접 지운다.
          hasLocalLyrics && {
            key: "local-lyrics-delete",
            type: "button",
            danger: true,
            label: getOptionsText("menu.localLyricsDelete", "로컬 가사 삭제"),
            buttonText: getOptionsText("buttons.delete", "삭제"),
            onClick: () => {
              closeModal?.();
              onDeleteLocalLyrics?.();
            },
          },
        ].filter(Boolean),
      ],
    };
  }

  return {
    title: I18n.t("menu.lyricsProviderSelect"),
    subtitle: I18n.t("menu.lyricsProviderSelectSubtitle"),
    groups: [
      [
        {
          key: "current-lyrics-provider",
          type: "info",
          label: I18n.t("menu.lyricsProviderCurrent"),
          value: currentProviderLabel,
        },
      ],
      [
        {
          key: "track-lyrics-provider",
          type: "choice",
          label: I18n.t("menu.lyricsProviderSelect"),
          options: providerOptions,
          value: selectedProvider || "auto",
          onPick: async (value) => {
            await onSelectProvider?.(value === "auto" ? null : value);
            closeView?.();
          },
        },
      ],
    ],
  };
}

function openRegenerateTranslationChoiceModal({
  onSelect,
  targets = {},
  includeCulturalAnnotations = false,
  includeWordSupplements = false,
}) {
  let closeModal = null;
  const targetItems = getRegenerateTranslationChoiceItems({
    targets,
    includeCulturalAnnotations,
    includeWordSupplements,
  }).map(({ key, label, target }) => ({
    desc: react.createElement(SettingRowDescription, {
      icon: ICONS.language,
      text: label,
    }),
    key,
    type: ConfigButton,
    text: I18n.t("menu.regenerateAction"),
    onChange: () => {
      closeModal?.();
      onSelect?.(target);
    },
  }));

  const items = [
    {
      section: I18n.t("menu.regenerateTranslationOptions"),
      subtitle: I18n.t("menu.regenerateTranslationOptionsSubtitle"),
      items: targetItems,
    },
  ];

  closeModal = openOptionsModal(
    I18n.t("menu.regenerateTranslationOptions"),
    items,
    () => {}
  );
}

// Regeneration targets offered for the current lyrics, in the order the choice
// dialog above lists them. The conversion panel shows the same list inline.
const getRegenerateTranslationChoiceItems = ({
  targets = {},
  includeCulturalAnnotations = false,
  includeWordSupplements = false,
}) => {
  const items = [];
  if (targets.needPhonetic) {
    items.push({ key: "regenerate-phonetic-only", target: "phonetic", label: I18n.t("menu.regeneratePronunciationOnly") });
  }
  if (targets.needTranslation) {
    items.push({ key: "regenerate-translation-only", target: "translation", label: I18n.t("menu.regenerateTranslationOnly") });
  }
  if (includeCulturalAnnotations) {
    items.push({ key: "regenerate-cultural-annotations", target: "cultural-annotations", label: I18n.t("settings.culturalAnnotations.label") });
  }
  if (includeWordSupplements) {
    items.push({ key: "regenerate-word-supplements", target: "word-supplements", label: I18n.t("menu.regenerateWordDetails") || "Word details" });
  }
  return items;
};

// 번역 재생성 in the conversion panel: one button per target. The panel stays
// open, and the button that started a regeneration spins until it finishes.
const getToolbarRegenerationKinds = (target) => target === "all"
  ? ["phonetic", "translation"]
  : [target];

const RegenerateTranslationButton = react.memo(
  ({ choices = [], onRegenerate, isEnabled, busyTargets = [] }) => {
    const [pendingTargets, setPendingTargets] = useState([]);
    const pendingRef = useRef(new Set());
    const mountedRef = useRef(true);
    useEffect(() => {
      mountedRef.current = true;
      return () => { mountedRef.current = false; };
    }, []);
    const isBusy = target => getToolbarRegenerationKinds(target)
      .some(kind => busyTargets.includes(kind) || pendingTargets.includes(kind));

    return react.createElement(ToolbarPanelRow, {
      stack: true,
      className: "ivl-tb-regen",
      desc: I18n.t("menu.regenerateTranslationOptionsSubtitle"),
      control: react.createElement(
        "div",
        { className: "ivl-tb-chips" },
        choices.map((choice) => react.createElement(
          ToolbarButton,
          {
            key: choice.key,
            className: joinToolbarClasses("ivl-tb-chip", isBusy(choice.target) && "is-busy"),
            disabled: !isEnabled || isBusy(choice.target),
            "aria-busy": isBusy(choice.target),
            onClick: async () => {
              const kinds = getToolbarRegenerationKinds(choice.target);
              if (kinds.some(kind => pendingRef.current.has(kind) || busyTargets.includes(kind))) return;
              kinds.forEach(kind => pendingRef.current.add(kind));
              setPendingTargets([...pendingRef.current]);
              try {
                await onRegenerate?.(choice.target);
              } catch (error) {
                console.warn("[ivLyrics] Regeneration action failed:", error);
              } finally {
                kinds.forEach(kind => pendingRef.current.delete(kind));
                if (mountedRef.current) setPendingTargets([...pendingRef.current]);
              }
            },
          },
          react.createElement(ToolbarGlyph, { name: "refresh", size: 14 }),
          react.createElement("span", null, choice.label)
        ))
      ),
    });
  }
);

// 현재 곡 > 개별 배경: drills into the background view below, which keeps the
// choices and handler of the dialog it replaces.
const TrackBackgroundButton = react.memo(
  ({ trackUri, overrideMode, onOpen }) =>
    react.createElement(ToolbarMenuItem, {
      icon: "background",
      label: getOptionsText("menu.trackBackground", "개별 배경"),
      value: overrideMode
        ? getBackgroundPresetLabel(overrideMode)
        : getOptionsText("menu.trackBackgroundUseGlobal", "기본 설정 사용"),
      drill: true,
      onClick: () => {
        if (!trackUri) {
          Toast.error(I18n.t("notifications.noTrackPlaying"));
          return;
        }
        onOpen?.();
      },
    })
);

function buildTrackBackgroundView({ overrideMode, effectiveMode, onSelectBackground, onOpenSettings }) {
  const backgroundOptions = getTrackBackgroundOptions();
  const selectedKey = overrideMode || "inherit";
  const selectedOption =
    backgroundOptions.find((option) => option.key === selectedKey) ||
    backgroundOptions[0];

  return {
    title: getOptionsText("menu.trackBackgroundTitle", "개별 배경"),
    subtitle: getOptionsText(
      "menu.trackBackgroundSubtitle",
      "이 곡에서만 사용할 배경 종류를 선택합니다. 블러, 밝기, 영상 배율 같은 세부 옵션은 기본 배경 설정을 따릅니다."
    ),
    groups: [
      [
        {
          key: "current-track-background",
          type: "info",
          label: getOptionsText("menu.trackBackgroundCurrent", "현재 적용 배경"),
          value: getBackgroundPresetLabel(effectiveMode || "none"),
        },
      ],
      [
        {
          key: "track-background-mode",
          type: "choice",
          label: getOptionsText("menu.trackBackgroundSelect", "이 곡의 배경"),
          options: backgroundOptions,
          value: selectedOption?.key,
          onPick: async (value) => {
            await onSelectBackground?.(value === "inherit" ? null : value);
          },
        },
      ],
    ],
    note: {
      text: getOptionsText(
        "menu.trackBackgroundSelectInfo",
        "기본 설정 사용을 선택하면 설정 > 외관 > 시각효과의 배경을 그대로 사용합니다."
      ),
      actionLabel: I18n.t("menu.openSettings"),
      onAction: () => onOpenSettings?.({ initialTab: "appearance", initialSettingKey: "background-experience" }),
    },
  };
}

// Renders a view description (see the builders above) with the panel parts.
const ToolbarModelView = ({ view }) =>
  react.createElement(
    "div",
    { className: "ivl-tb-stack" },
    (view?.groups || []).filter((rows) => rows.length > 0).map((rows, index) => react.createElement(
      ToolbarPanelGroup,
      { key: index, className: rows.every((row) => row.type === "choice") ? "is-options" : "" },
      rows.map((row) => {
        if (row.type === "choice") {
          return react.createElement(ToolbarOptionList, {
            key: row.key,
            label: row.label,
            options: row.options,
            value: row.value,
            onPick: row.onPick,
          });
        }
        if (row.type === "button") {
          return react.createElement(ToolbarPanelRow, {
            key: row.key,
            label: row.label,
            desc: row.desc,
            control: react.createElement(ToolbarButton, {
              variant: row.danger ? "danger" : "",
              onClick: row.onClick,
            }, row.buttonText),
          });
        }
        return react.createElement(ToolbarPanelRow, {
          key: row.key,
          label: row.label,
          control: react.createElement("span", { className: "ivl-tb-value ivl-tb-trunc" }, row.value),
        });
      })
    )),
    view?.note
      ? react.createElement(ToolbarNote, {
        actions: view.note.onAction
          ? react.createElement(ToolbarButton, { onClick: view.note.onAction }, view.note.actionLabel)
          : null,
      }, view.note.text)
      : null
  );

const clampSyncOffset = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(-10000, Math.min(10000, Math.round(numericValue)))
    : 0;
};

const formatSyncOffset = (value) => {
  const safeOffset = clampSyncOffset(value);
  return `${safeOffset > 0 ? "+" : ""}${safeOffset}ms`;
};

const pendingTrackSyncOffsetWrites = new Map();
let trackSyncOffsetWriteLoop = null;

const startTrackSyncOffsetWriteLoop = () => {
  if (trackSyncOffsetWriteLoop) return;

  trackSyncOffsetWriteLoop = (async () => {
    while (pendingTrackSyncOffsetWrites.size > 0) {
      const [trackUri, offset] =
        pendingTrackSyncOffsetWrites.entries().next().value;
      pendingTrackSyncOffsetWrites.delete(trackUri);
      try {
        const persisted = await Utils.setTrackSyncOffset(trackUri, offset, {
          dispatch: false,
        });
        if (persisted && !pendingTrackSyncOffsetWrites.has(trackUri)) {
          window.dispatchEvent(new CustomEvent("ivLyrics:offset-changed", {
            detail: { trackUri, offset },
          }));
        }
      } catch (error) {
        console.error("[ivLyrics] Failed to persist track sync offset:", error);
      }
    }
  })()
    .catch((error) => {
      console.error("[ivLyrics] Track sync offset write loop failed:", error);
    })
    .finally(() => {
      trackSyncOffsetWriteLoop = null;
      if (pendingTrackSyncOffsetWrites.size > 0) {
        startTrackSyncOffsetWriteLoop();
      }
    });
};

const queueTrackSyncOffsetWrite = (trackUri, offset) => {
  pendingTrackSyncOffsetWrites.set(trackUri, offset);
  startTrackSyncOffsetWriteLoop();
};

const COMMUNITY_VIDEO_SYNC_MAX_SECONDS = 3600;

const normalizeCommunityVideoSyncSeconds = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  const clamped = Math.max(0, Math.min(COMMUNITY_VIDEO_SYNC_MAX_SECONDS, parsed));
  return Math.round(clamped * 1000) / 1000;
};

const clampCommunityVideoSyncSeconds = (value, videoDurationSeconds) => {
  const normalized = normalizeCommunityVideoSyncSeconds(value);
  const parsedDuration = Number(videoDurationSeconds);
  const maxSeconds = Number.isFinite(parsedDuration) && parsedDuration > 0
    ? Math.min(COMMUNITY_VIDEO_SYNC_MAX_SECONDS, parsedDuration)
    : COMMUNITY_VIDEO_SYNC_MAX_SECONDS;
  return Math.max(0, Math.min(maxSeconds, normalized));
};

const formatCommunityVideoSyncSeconds = (value) => {
  const normalized = normalizeCommunityVideoSyncSeconds(value);
  return `${normalized.toFixed(3)}s`;
};

// An automatic zero/missing anchor means video time equals song time. Once
// edited, store the corresponding absolute first-lyric time, not a second
// relative offset. Unknown lyrics must never be coerced into a zero anchor.
const getCurrentVideoCaptionStartTime = (info) => {
  if (!info) return null;
  const rawStart = info.captionStartTime;
  const start = rawStart == null || rawStart === "" ? NaN : Number(rawStart);
  const isAutomatic = info.isAutoGenerated === true ||
    (info.isAutoGenerated !== false && info.submitterId === "system");
  if (Number.isFinite(start) && !(isAutomatic && Math.abs(start) < 0.001)) {
    return start >= 0 ? start : null;
  }
  const firstLyricTime = window.ivLyrics_firstLyricTime;
  if (firstLyricTime == null || firstLyricTime === "") return null;
  const firstLyricSeconds = Number(firstLyricTime) / 1000;
  return Number.isFinite(firstLyricSeconds) && firstLyricSeconds >= 0
    ? firstLyricSeconds
    : null;
};

const pendingCommunityVideoSyncWrites = new Map();
const communityVideoSyncWriteChains = new Map();

// Quick adjustments are local preferences, not implicit community submissions.
// Serialize/coalesce them; the atomic store update also checks the video ID.
const queueCommunityVideoSyncWrite = (trackUri, info) => {
  if (!trackUri || !info?.youtubeVideoId) return Promise.resolve();
  pendingCommunityVideoSyncWrites.set(trackUri, { ...info });
  if (communityVideoSyncWriteChains.has(trackUri)) return communityVideoSyncWriteChains.get(trackUri);
  const write = (async () => {
    while (pendingCommunityVideoSyncWrites.has(trackUri)) {
      const next = pendingCommunityVideoSyncWrites.get(trackUri);
      pendingCommunityVideoSyncWrites.delete(trackUri);
      try {
        await Utils.updateSelectedVideoSyncOffset(trackUri, next);
      } catch (error) {
        console.error("[ivLyrics] Failed to save the local video offset:", error);
      }
    }
  })().finally(() => {
    communityVideoSyncWriteChains.delete(trackUri);
    // A tap can arrive after the loop drains but before this cleanup runs.
    const pending = pendingCommunityVideoSyncWrites.get(trackUri);
    if (pending) return queueCommunityVideoSyncWrite(trackUri, pending);
  });
  communityVideoSyncWriteChains.set(trackUri, write);
  return write;
};

const readActiveCommunityVideoInfo = (trackUri) => {
  const active = window.ivLyricsActiveCommunityVideoInfo;
  if (!trackUri || !active?.youtubeVideoId || active.trackUri !== trackUri) return null;
  return active;
};

const useCurrentVideoSync = (trackUri) => {
  const [activeInfo, setActiveInfo] = useState(() => readActiveCommunityVideoInfo(trackUri));
  const activeInfoRef = useRef(activeInfo);

  const currentTrackUriRef = useRef(trackUri);
  currentTrackUriRef.current = trackUri;
  const renderedVideoId = activeInfo?.trackUri === trackUri ? activeInfo.youtubeVideoId : null;

  useEffect(() => {
    const handleChange = () => {
      const next = readActiveCommunityVideoInfo(trackUri);
      activeInfoRef.current = next;
      setActiveInfo(next);
    };
    const handleStartChange = (event) => {
      const detail = event?.detail;
      if (!trackUri || detail?.trackUri !== trackUri) return;
      const current = readActiveCommunityVideoInfo(trackUri);
      if (!current || detail.youtubeVideoId !== current.youtubeVideoId) return;
      if (detail.captionStartTime == null || !Number.isFinite(Number(detail.captionStartTime))) return;
      const nextStart = clampCommunityVideoSyncSeconds(
        detail.captionStartTime,
        detail.videoDurationSeconds ?? current.videoDurationSeconds
      );
      const next = { ...current, captionStartTime: nextStart };
      if (typeof detail.isAutoGenerated === "boolean") next.isAutoGenerated = detail.isAutoGenerated;
      if (detail.videoDurationSeconds != null) {
        next.videoDurationSeconds = detail.videoDurationSeconds;
      }
      activeInfoRef.current = next;
      window.ivLyricsActiveCommunityVideoInfo = next;
      setActiveInfo(next);
    };
    handleChange();
    window.addEventListener("ivLyrics:communityVideoChanged", handleChange);
    window.addEventListener("ivLyrics:community-video-start-changed", handleStartChange);
    return () => {
      window.removeEventListener("ivLyrics:communityVideoChanged", handleChange);
      window.removeEventListener("ivLyrics:community-video-start-changed", handleStartChange);
    };
  }, [trackUri]);

  const handleStep = (stepMs) => {
    const current = readActiveCommunityVideoInfo(trackUri);
    if (!current || currentTrackUriRef.current !== trackUri ||
      current.youtubeVideoId !== renderedVideoId ||
      activeInfoRef.current?.youtubeVideoId !== current.youtubeVideoId) return null;
    const deltaSeconds = Number(stepMs) / 1000;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return null;
    const baseSeconds = getCurrentVideoCaptionStartTime(current);
    if (baseSeconds === null) return null;
    const nextStart = clampCommunityVideoSyncSeconds(
      normalizeCommunityVideoSyncSeconds(baseSeconds + deltaSeconds),
      current.videoDurationSeconds
    );
    if (Math.abs(baseSeconds - nextStart) < 0.0005) return null;
    const next = { ...current, captionStartTime: nextStart, isAutoGenerated: false };
    activeInfoRef.current = next;
    window.ivLyricsActiveCommunityVideoInfo = next;
    setActiveInfo(next);
    window.dispatchEvent(new CustomEvent("ivLyrics:community-video-start-changed", {
      detail: {
        trackUri,
        youtubeVideoId: next.youtubeVideoId,
        captionStartTime: nextStart,
        isAutoGenerated: false,
        videoDurationSeconds: current.videoDurationSeconds ?? null,
      },
    }));
    void queueCommunityVideoSyncWrite(trackUri, next);
    return next;
  };

  return { activeInfo: activeInfo?.trackUri === trackUri ? activeInfo : null, handleStep };
};

// Both video timing surfaces share only after an explicit click. Read the
// applied player selection again, then freeze that selection before auth.
const pendingCommunityVideoSyncShares = new Set();

const useCurrentVideoSyncShare = (trackUri, renderedInfo) => {
  const currentTrackUriRef = useRef(trackUri);
  currentTrackUriRef.current = trackUri;
  const shareKey = trackUri && renderedInfo?.youtubeVideoId
    ? JSON.stringify([trackUri, renderedInfo.youtubeVideoId]) : null;
  const [, refreshSharing] = useState(0);
  useEffect(() => {
    const handleSharingChange = (event) => {
      if (event?.detail?.key === shareKey) refreshSharing((revision) => revision + 1);
    };
    window.addEventListener("ivLyrics:community-video-share-changed", handleSharingChange);
    return () => window.removeEventListener("ivLyrics:community-video-share-changed", handleSharingChange);
  }, [shareKey]);
  const notifySharingChange = () => window.dispatchEvent(new CustomEvent("ivLyrics:community-video-share-changed", {
    detail: { key: shareKey },
  }));
  const isSharing = pendingCommunityVideoSyncShares.has(shareKey);
  const canShare = renderedInfo?.trackUri === trackUri &&
    renderedInfo?.playerReady === true && renderedInfo?.isAutoGenerated === false;

  const shareVideoTiming = async () => {
    const active = readActiveCommunityVideoInfo(trackUri);
    if (!active || currentTrackUriRef.current !== trackUri ||
      active.playerReady !== true || active.isAutoGenerated !== false ||
      active.youtubeVideoId !== renderedInfo?.youtubeVideoId || !shareKey || pendingCommunityVideoSyncShares.has(shareKey)) return;
    const rawStart = active.captionStartTime;
    const startTime = rawStart == null || rawStart === "" ? NaN : Number(rawStart);
    const firstLyricTime = window.ivLyrics_firstLyricTime;
    const duration = Number(active.videoDurationSeconds);
    if (firstLyricTime == null || firstLyricTime === "" ||
      !Number.isFinite(Number(firstLyricTime)) || Number(firstLyricTime) < 0 ||
      !Number.isFinite(startTime) || startTime < 0 || startTime > COMMUNITY_VIDEO_SYNC_MAX_SECONDS ||
      (Number.isFinite(duration) && duration > 0 && startTime > duration)) {
      Toast.error(I18n.t("videoSync.cannotShare"));
      return;
    }
    const submission = {
      trackUri,
      videoId: active.youtubeVideoId,
      videoTitle: active.youtubeTitle || "",
      startTime,
      skipSegments: Array.isArray(active.skipSegments) ? active.skipSegments.map((segment) => ({ ...segment })) : [],
    };
    pendingCommunityVideoSyncShares.add(shareKey);
    notifySharingChange();
    try {
      await Utils.submitCommunityVideo(
        submission.trackUri,
        submission.videoId,
        submission.videoTitle,
        submission.startTime,
        submission.skipSegments
      );
      Toast.success(I18n.t("videoSync.shared"));
    } catch (error) {
      Toast.error(error?.message || I18n.t("videoSync.shareFailed"));
    } finally {
      pendingCommunityVideoSyncShares.delete(shareKey);
      notifySharingChange();
    }
  };

  return { canShare, isSharing, shareVideoTiming };
};

const CurrentVideoSyncPill = react.memo(({ trackUri, hideWhenEmpty = false }) => {
  const { activeInfo, handleStep } = useCurrentVideoSync(trackUri);

  if (!trackUri) return null;
  if (!activeInfo?.youtubeVideoId) {
    if (hideWhenEmpty) return null;
    return react.createElement(
      "div",
      { className: "lyrics-track-sync-pill", "data-video-sync": "empty" },
      react.createElement(
        "div",
        { className: "lyrics-sync-adjust-current", style: { padding: "8px 12px" } },
        I18n.t("syncAdjust.noVideo") || "No video playing"
      )
    );
  }

  const currentSeconds = getCurrentVideoCaptionStartTime(activeInfo);
  const stepDefs = [-1000, -100, -10, "current", 10, 100, 1000];
  const controls = stepDefs.map((step, index) => {
    const parts = [];
    if (index > 0) {
      parts.push(react.createElement("span", {
        key: `separator-${index}`,
        className: "lyrics-track-sync-separator",
        "aria-hidden": "true",
      }));
    }
    if (step === "current") {
      parts.push(react.createElement(
        "span",
        {
          key: "current-video-sync",
          className: "lyrics-track-sync-value lyrics-track-sync-value-static",
          "data-active": currentSeconds !== 0 ? "true" : "false",
          title: activeInfo.youtubeTitle || activeInfo.youtubeVideoId,
          "aria-live": "polite",
          "aria-atomic": "true",
        },
        react.createElement(
          "span",
          { className: "lyrics-track-sync-value-current" },
          currentSeconds === null ? "…" : formatCommunityVideoSyncSeconds(currentSeconds)
        )
      ));
      return parts;
    }
    const absoluteMs = Math.abs(step);
    const displayValue = `${step > 0 ? "+" : "−"}${absoluteMs >= 1000 ? `${absoluteMs / 1000}s` : `${absoluteMs}ms`}`;
    parts.push(react.createElement(
      "button",
      {
        key: step,
        type: "button",
        className: "lyrics-track-sync-step",
        disabled: currentSeconds === null,
        onClick: () => handleStep(step),
        onPointerUp: (event) => event.currentTarget.blur(),
        "aria-label": `${I18n.t("syncAdjust.videoTitle") || "Current video"} ${displayValue}`,
      },
      displayValue
    ));
    return parts;
  });

  return react.createElement(
    "div",
    {
      className: "lyrics-track-sync-pill",
      role: "group",
      "aria-label": I18n.t("syncAdjust.videoTitle") || "Current video",
      "data-video-sync": "active",
    },
    react.createElement(
      "div",
      { className: "lyrics-track-sync-controls" },
      controls
    )
  );
});

// Panel variant of the video sync control. It follows the same
// value-plus-steps structure as the track and global sync rows
// instead of reusing the floating pill markup.
const CurrentVideoSyncPanelControl = react.memo(({ trackUri }) => {
  const { activeInfo, handleStep } = useCurrentVideoSync(trackUri);
  const { canShare, isSharing, shareVideoTiming } = useCurrentVideoSyncShare(trackUri, activeInfo);
  if (!trackUri || !activeInfo?.youtubeVideoId) return null;
  const currentSeconds = getCurrentVideoCaptionStartTime(activeInfo);
  return react.createElement(
    "div",
    { className: "ivl-tb-offset" },
    react.createElement(
      "div",
      { className: "ivl-tb-offset-header" },
      react.createElement(
        "output",
        {
          className: "ivl-tb-offset-value",
          "aria-live": "polite",
          "aria-busy": currentSeconds === null,
          title: activeInfo.youtubeTitle || activeInfo.youtubeVideoId,
        },
        currentSeconds === null ? "…" : formatCommunityVideoSyncSeconds(currentSeconds)
      ),
      react.createElement(ToolbarButton, {
        className: "ivl-tb-video-sync-share",
        disabled: !canShare || isSharing,
        "aria-busy": isSharing,
        "aria-label": I18n.t("videoSync.share"),
        title: I18n.t("videoSync.shareInfo"),
        onClick: shareVideoTiming,
      },
      react.createElement(IvLyricsToolbarIcon, { name: "shareImage", size: 14 }),
      I18n.t("videoSync.share"))
    ),
    react.createElement(ToolbarOffsetSteps, {
      steps: [-1000, -100, -10, 10, 100, 1000],
      label: I18n.t("syncAdjust.videoTitle") || "Current video",
      disabled: currentSeconds === null,
      onStep: handleStep,
    })
  );
});

// Quick video sync: the same pill adjusts the background video's timing when
// its Lyrics/Video switch is on Video. Every step edits the canonical absolute
// captionStartTime through the same hook used by the Current-video submenu.
const VIDEO_SYNC_STEPS_MS = [-2000, -500, -100, "current", 100, 500, 2000];
const VIDEO_SYNC_KEY_STEP_MS = 100;
const VIDEO_SYNC_KEY_LARGE_STEP_MS = 2000;
// The switch keeps its position from one song to the next.
let lastTrackSyncPillMode = "lyrics";

const formatVideoSyncOffset = (offsetMs) => {
  const value = (Number(offsetMs) || 0) / 1000;
  const magnitude = Number(Math.abs(value).toFixed(2)).toString();
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${magnitude}s`;
};

const TrackSyncAdjustPill = react.memo(({ trackUri, lyricsAdjustable = true, videoTrackUri = trackUri }) => {
  const [offset, setOffset] = useState(0);
  const [loadedTrackUri, setLoadedTrackUri] = useState(null);
  const [interactionFeedback, setInteractionFeedback] = useState(null);
  const activeTrackUriRef = useRef(trackUri || null);
  const optimisticOffsetRef = useRef(0);
  const loadSeqRef = useRef(0);
  const feedbackSeqRef = useRef(0);
  const feedbackTimerRef = useRef(null);
  const isOffsetLoaded = Boolean(
    trackUri && loadedTrackUri === trackUri
  );

  useEffect(() => {
    activeTrackUriRef.current = trackUri || null;
    optimisticOffsetRef.current = 0;
    setLoadedTrackUri(null);
    setOffset(0);
    setInteractionFeedback(null);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    const loadSeq = ++loadSeqRef.current;
    if (!trackUri) return undefined;

    let active = true;
    Promise.resolve(Utils.getTrackSyncOffset(trackUri))
      .then((savedOffset) => {
        if (!active || loadSeqRef.current !== loadSeq || activeTrackUriRef.current !== trackUri) {
          return;
        }
        const safeOffset = clampSyncOffset(savedOffset);
        optimisticOffsetRef.current = safeOffset;
        setOffset(safeOffset);
        setLoadedTrackUri(trackUri);
      })
      .catch((error) => {
        if (!active || loadSeqRef.current !== loadSeq || activeTrackUriRef.current !== trackUri) {
          return;
        }
        console.error("[ivLyrics] Failed to load track sync offset:", error);
        optimisticOffsetRef.current = 0;
        setOffset(0);
        setLoadedTrackUri(trackUri);
      });

    return () => {
      active = false;
      loadSeqRef.current += 1;
    };
  }, [trackUri]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const handleOffsetChange = (event) => {
      if (!trackUri || event.detail?.trackUri !== trackUri) return;
      const nextOffset = clampSyncOffset(event.detail?.offset);
      loadSeqRef.current += 1;
      optimisticOffsetRef.current = nextOffset;
      setOffset(nextOffset);
      setLoadedTrackUri(trackUri);
    };

    window.addEventListener("ivLyrics:offset-changed", handleOffsetChange);
    return () => {
      window.removeEventListener("ivLyrics:offset-changed", handleOffsetChange);
    };
  }, [trackUri]);

  // Video timing is offered only while video is the chosen background
  // (videoTrackUri is null otherwise) and its video is actually showing.
  const { activeInfo: videoInfo, handleStep: handleVideoStep } = useCurrentVideoSync(videoTrackUri);
  const readActiveVideo = () => {
    const info = readActiveCommunityVideoInfo(videoTrackUri);
    return videoTrackUri === trackUri && info?.playerReady === true
      ? info
      : null;
  };
  const video = videoTrackUri === trackUri && videoInfo?.playerReady === true ? videoInfo : null;
  const [mode, setMode] = useState(lastTrackSyncPillMode);
  const { canShare, isSharing, shareVideoTiming } = useCurrentVideoSyncShare(videoTrackUri, video);
  const videoStepRef = useRef(null);
  const showsVideo = Boolean(video) && (!lyricsAdjustable || mode === "video");

  const selectMode = (nextMode) => {
    lastTrackSyncPillMode = nextMode;
    setMode(nextMode);
  };

  const applyVideoStep = (step) => {
    const active = readActiveVideo();
    if (!active || active.youtubeVideoId !== video?.youtubeVideoId) return null;
    return handleVideoStep(step);
  };
  // Keyboard callbacks see the latest owner without waiting for an effect.
  videoStepRef.current = applyVideoStep;

  // [ and ] nudge the video (Shift: 2 s) and show the video side of the pill.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code !== "BracketLeft" && event.code !== "BracketRight") return;
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase?.();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) return;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .monaco-editor, .CodeMirror, .cm-editor')) return;
      const step = event.shiftKey ? VIDEO_SYNC_KEY_LARGE_STEP_MS : VIDEO_SYNC_KEY_STEP_MS;
      if (!videoStepRef.current?.(event.code === "BracketLeft" ? -step : step)) return;
      event.preventDefault();
      selectMode("video");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [videoTrackUri]);

  const handleOffsetChange = (newOffset) => {
    if (
      !isOffsetLoaded ||
      !trackUri ||
      activeTrackUriRef.current !== trackUri
    ) return;
    const safeOffset = clampSyncOffset(newOffset);
    loadSeqRef.current += 1;
    optimisticOffsetRef.current = safeOffset;
    setOffset(safeOffset);
    window.dispatchEvent(new CustomEvent("ivLyrics:offset-changed", {
      detail: { trackUri, offset: safeOffset }
    }));
    queueTrackSyncOffsetWrite(trackUri, safeOffset);
  };

  const showInteractionFeedback = (kind, event, step = 0) => {
    const feedbackId = ++feedbackSeqRef.current;
    const nextFeedback = {
      id: feedbackId,
      kind,
      step,
      direction: step < 0 ? "left" : "right",
      fromX: 0,
      toX: 0,
      fromWidth: 0,
      toWidth: 0,
      targetCenterX: 0,
    };

    const controls = event?.currentTarget?.closest?.(".lyrics-track-sync-controls");
    const valueButton = controls?.querySelector?.(".lyrics-track-sync-value");
    const sourceRect = event?.currentTarget?.getBoundingClientRect?.();
    const controlsRect = controls?.getBoundingClientRect?.();
    const targetRect = valueButton?.getBoundingClientRect?.();

    if (controlsRect && targetRect) {
      nextFeedback.toX = targetRect.left - controlsRect.left;
      nextFeedback.toWidth = targetRect.width;
      nextFeedback.targetCenterX = nextFeedback.toX + targetRect.width / 2;
      if (kind === "step" && sourceRect) {
        nextFeedback.fromX = sourceRect.left - controlsRect.left;
        nextFeedback.fromWidth = sourceRect.width;
      } else {
        nextFeedback.fromX = nextFeedback.toX;
        nextFeedback.fromWidth = nextFeedback.toWidth;
      }
    }

    setInteractionFeedback(nextFeedback);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setInteractionFeedback((current) => current?.id === feedbackId ? null : current);
      if (feedbackSeqRef.current === feedbackId) {
        feedbackTimerRef.current = null;
      }
    }, kind === "reset" ? 520 : 460);
  };

  const renderStepButton = (step) => {
    const absoluteStep = Math.abs(step);
    const displayValue = showsVideo
      ? formatVideoSyncOffset(step)
      : `${step > 0 ? "+" : "−"}${absoluteStep}ms`;
    return react.createElement(
      "button",
      {
        key: step,
        type: "button",
        className: "lyrics-track-sync-step",
        disabled: showsVideo ? getCurrentVideoCaptionStartTime(video) === null : !isOffsetLoaded,
        "data-step-size": absoluteStep,
        "data-feedback-source": interactionFeedback?.kind === "step"
          && interactionFeedback.step === step
          ? "true"
          : undefined,
        onClick: (event) => {
          if (showsVideo) {
            if (!applyVideoStep(step)) return;
          } else handleOffsetChange(optimisticOffsetRef.current + step);
          showInteractionFeedback("step", event, step);
        },
        onPointerUp: (event) => event.currentTarget.blur(),
        "aria-label": `${I18n.t(showsVideo ? "videoSync.title" : "menu.syncAdjustTitle")} ${displayValue}`,
      },
      displayValue
    );
  };

  const shownOffset = showsVideo ? getCurrentVideoCaptionStartTime(video) : offset;
  const formatShownOffset = showsVideo ? formatCommunityVideoSyncSeconds : formatSyncOffset;
  const isShownOffsetLoaded = showsVideo ? shownOffset !== null : isOffsetLoaded;
  const compactControls = [];
  (showsVideo ? VIDEO_SYNC_STEPS_MS : [-100, -50, -10, "current", 10, 50, 100]).forEach((control, index) => {
    if (index > 0) {
      compactControls.push(react.createElement("span", {
        key: `separator-${index}`,
        className: "lyrics-track-sync-separator",
        "aria-hidden": "true",
      }));
    }

    if (control === "current") {
      compactControls.push(react.createElement(
        "button",
        {
          key: "current-offset",
          type: "button",
          className: "lyrics-track-sync-value",
          disabled: !isShownOffsetLoaded,
          "data-active": isShownOffsetLoaded && shownOffset !== 0 ? "true" : "false",
          "data-feedback-kind": interactionFeedback?.kind || undefined,
          onClick: (event) => {
            if (showsVideo) {
              const current = readActiveVideo();
              const currentStart = getCurrentVideoCaptionStartTime(current);
              if (currentStart === null || !applyVideoStep(-currentStart * 1000)) return;
            } else if (optimisticOffsetRef.current !== 0) {
              handleOffsetChange(0);
            }
            showInteractionFeedback("reset", event);
          },
          onPointerUp: (event) => event.currentTarget.blur(),
          title: I18n.t("syncAdjust.reset"),
          "aria-label": isShownOffsetLoaded
            ? `${formatShownOffset(shownOffset)}, ${I18n.t("syncAdjust.reset")}`
            : I18n.t("syncAdjust.loading"),
        },
        react.createElement(
          "span",
          {
            key: `current-${interactionFeedback?.id || 0}-${isShownOffsetLoaded}-${showsVideo ? "video" : "lyrics"}-${shownOffset}`,
            className: "lyrics-track-sync-value-current",
            "data-change-direction": interactionFeedback?.kind === "step"
              ? interactionFeedback.direction
              : undefined,
            "aria-live": "polite",
            "aria-atomic": "true",
          },
          isShownOffsetLoaded ? formatShownOffset(shownOffset) : "…"
        ),
        react.createElement(
          "span",
          {
            className: "lyrics-track-sync-value-reset",
            "aria-hidden": "true",
          },
          I18n.t("syncAdjust.reset")
        ),
        react.createElement(
          "span",
          {
            className: "lyrics-track-sync-value-reset-done",
            "aria-hidden": "true",
          },
          showsVideo ? "✓ 0s" : "✓ 0ms"
        )
      ));
      return;
    }

    compactControls.push(renderStepButton(control));
  });

  const renderTrackSyncMovementFeedback = () => react.createElement(
      "span",
      {
        key: `flow-${interactionFeedback.id}`,
        className: "lyrics-track-sync-movement-feedback",
        "data-direction": interactionFeedback.direction,
        "data-kind": interactionFeedback.kind,
        "aria-hidden": "true",
        style: {
          "--sync-feedback-from-x": `${interactionFeedback.fromX}px`,
          "--sync-feedback-to-x": `${interactionFeedback.toX}px`,
          "--sync-feedback-from-width": `${interactionFeedback.fromWidth}px`,
          "--sync-feedback-to-width": `${interactionFeedback.toWidth}px`,
          "--sync-feedback-target-center-x": `${interactionFeedback.targetCenterX}px`,
        },
      },
      interactionFeedback.kind === "step"
        ? react.createElement("span", { className: "lyrics-track-sync-hover-transfer" })
        : null,
      interactionFeedback.kind === "reset"
        ? react.createElement("span", {
          className: "lyrics-track-sync-value-impact is-reset",
        })
        : null
    );

  const movementFeedback = interactionFeedback
    ? renderTrackSyncMovementFeedback()
    : null;

  if (!trackUri) return null;
  if (!lyricsAdjustable && !video) return null;

  // Lyrics/Video switch, only while a background video plays.
  const renderModeButton = (buttonMode, icon, label) => react.createElement(
    "button",
    {
      key: buttonMode,
      type: "button",
      className: "lyrics-track-sync-mode-button",
      "aria-pressed": (buttonMode === "video") === showsVideo ? "true" : "false",
      onClick: () => selectMode(buttonMode),
      onPointerUp: (event) => event.currentTarget.blur(),
      title: label,
      "aria-label": label,
    },
    react.createElement(IvLyricsToolbarIcon, { name: icon, size: 15 })
  );
  const modeSwitch = video ? react.createElement(
    "div",
    {
      className: "lyrics-track-sync-mode",
      role: "group",
      "aria-label": `${I18n.t("menu.syncAdjustTitle")} / ${I18n.t("videoSync.title")}`,
    },
    lyricsAdjustable ? renderModeButton("lyrics", "synced", I18n.t("menu.syncAdjustTitle")) : null,
    renderModeButton("video", "communityVideo", I18n.t("videoSync.title"))
  ) : null;
  const shareButton = showsVideo && video.isAutoGenerated === false ? react.createElement(
    "button",
    {
      type: "button",
      className: "lyrics-track-sync-share",
      disabled: !canShare || isSharing,
      "aria-busy": isSharing,
      onClick: shareVideoTiming,
      onPointerUp: (event) => event.currentTarget.blur(),
      title: I18n.t("videoSync.shareInfo"),
      "aria-label": I18n.t("videoSync.share"),
    },
    react.createElement(IvLyricsToolbarIcon, { name: "shareImage", size: 14 })
  ) : null;

  return react.createElement(
    "div",
    {
      className: `lyrics-track-sync-pill${showsVideo ? " is-video-mode" : ""}`,
      role: "group",
      "aria-label": I18n.t(showsVideo ? "videoSync.title" : "menu.syncAdjustTitle"),
      "aria-busy": !isShownOffsetLoaded,
      "data-offset-active": isShownOffsetLoaded && shownOffset !== 0 ? "true" : "false",
    },
    modeSwitch,
    react.createElement(
      "div",
      { className: "lyrics-track-sync-controls" },
      movementFeedback,
      compactControls
    ),
    shareButton
  );
});

const SYNC_ADJUST_PANEL_GAP = 10;
const SYNC_ADJUST_VIEWPORT_PADDING = 12;
const SYNC_ADJUST_PANEL_POSITION_ATTEMPTS = 8;
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
const computeSyncAdjustPanelPosition = (triggerRect, panelRect, viewportWidth, viewportHeight, options = {}) => {
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

// Current-track and global offsets as the toolbar shows and edits them. The
// track value goes through the quick sync pill's write queue and event, so
// both stay in step; the global value through Utils, as before.
const useToolbarSyncOffsets = (trackUri) => {
  const [trackOffset, setTrackOffset] = useState(0);
  const [loadedTrackUri, setLoadedTrackUri] = useState(null);
  const [globalOffset, setGlobalOffset] = useState(() => clampSyncOffset(Utils.getGlobalSyncOffset?.() || 0));
  const trackOffsetRef = useRef(0);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    trackOffsetRef.current = 0;
    setTrackOffset(0);
    setLoadedTrackUri(null);
    const loadSeq = ++loadSeqRef.current;
    if (!trackUri) return undefined;

    let active = true;
    const apply = (offset) => {
      if (!active || loadSeqRef.current !== loadSeq) return;
      trackOffsetRef.current = offset;
      setTrackOffset(offset);
      setLoadedTrackUri(trackUri);
    };
    Promise.resolve(Utils.getTrackSyncOffset(trackUri))
      .then((savedOffset) => apply(clampSyncOffset(savedOffset)))
      .catch((error) => {
        console.error("[ivLyrics] Failed to load track sync offset:", error);
        apply(0);
      });
    return () => {
      active = false;
    };
  }, [trackUri]);

  useEffect(() => {
    const handleTrackOffsetChange = (event) => {
      if (!trackUri || event.detail?.trackUri !== trackUri) return;
      const nextOffset = clampSyncOffset(event.detail?.offset);
      loadSeqRef.current += 1;
      trackOffsetRef.current = nextOffset;
      setTrackOffset(nextOffset);
      setLoadedTrackUri(trackUri);
    };
    const handleGlobalOffsetChange = (event) => {
      setGlobalOffset(clampSyncOffset(event.detail?.offset));
    };
    window.addEventListener("ivLyrics:offset-changed", handleTrackOffsetChange);
    window.addEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
    return () => {
      window.removeEventListener("ivLyrics:offset-changed", handleTrackOffsetChange);
      window.removeEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
    };
  }, [trackUri]);

  const isTrackOffsetLoaded = Boolean(trackUri && loadedTrackUri === trackUri);
  const changeTrackOffset = (nextOffset) => {
    if (!isTrackOffsetLoaded) return;
    const safeOffset = clampSyncOffset(nextOffset);
    loadSeqRef.current += 1;
    trackOffsetRef.current = safeOffset;
    setTrackOffset(safeOffset);
    window.dispatchEvent(new CustomEvent("ivLyrics:offset-changed", {
      detail: { trackUri, offset: safeOffset },
    }));
    queueTrackSyncOffsetWrite(trackUri, safeOffset);
  };
  const changeGlobalOffset = (nextOffset) => {
    const safeOffset = clampSyncOffset(nextOffset);
    setGlobalOffset(safeOffset);
    Utils.setGlobalSyncOffset?.(safeOffset);
  };

  return {
    trackOffset,
    isTrackOffsetLoaded,
    globalOffset,
    trackOffsetRef,
    changeTrackOffset,
    changeGlobalOffset,
  };
};

// 싱크 조절 panel (the name is kept from the toolbar button it replaces): the
// current track's offset (when the track has timed lyrics), the global offset
// and the quick sync controls switch. Its footer resets both offsets.
const SyncAdjustButtonFluent = react.memo(({
  offsets,
  includeTrackOffset = false,
  quickSyncEnabled = true,
  onQuickSyncChange,
  trackUri = null,
}) => {
  const trackTitle = I18n.t("syncAdjust.trackTitle");
  const globalTitle = I18n.t("syncAdjust.globalTitle");
  // The Current-video section renders only while a video is active for this
  // track, and follows live video changes like the quick-sync bubble.
  const [hasActiveVideo, setHasActiveVideo] = useState(
    () => !!readActiveCommunityVideoInfo(trackUri)?.youtubeVideoId
  );
  useEffect(() => {
    setHasActiveVideo(!!readActiveCommunityVideoInfo(trackUri)?.youtubeVideoId);
    const handleVideoChange = (event) => {
      if (trackUri && event?.detail?.trackUri && event.detail.trackUri !== trackUri) return;
      setHasActiveVideo(!!readActiveCommunityVideoInfo(trackUri)?.youtubeVideoId);
    };
    window.addEventListener("ivLyrics:communityVideoChanged", handleVideoChange);
    return () => {
      window.removeEventListener("ivLyrics:communityVideoChanged", handleVideoChange);
    };
  }, [trackUri]);
  const hasVideoSyncControls = Boolean(
    trackUri &&
    hasActiveVideo &&
    typeof CurrentVideoSyncPanelControl !== "undefined"
  );
  return react.createElement(
    "div",
    { className: "ivl-tb-stack" },
    includeTrackOffset && react.createElement(
      ToolbarPanelSection,
      { title: trackTitle },
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarPanelRow, {
          stack: true,
          className: "ivl-tb-offset-row",
          desc: I18n.t("syncAdjust.trackInfo"),
          control: react.createElement(
            "div",
            { className: "ivl-tb-offset" },
            react.createElement(
              "output",
              {
                className: joinToolbarClasses("ivl-tb-offset-value", offsets.trackOffset === 0 && "is-zero"),
                "aria-live": "polite",
                "aria-busy": !offsets.isTrackOffsetLoaded,
              },
              offsets.isTrackOffsetLoaded ? formatSyncOffset(offsets.trackOffset) : "…"
            ),
            react.createElement(ToolbarOffsetSteps, {
              steps: [-100, -50, -10, 10, 50, 100],
              label: trackTitle,
              disabled: !offsets.isTrackOffsetLoaded,
              onStep: (step) => offsets.changeTrackOffset(offsets.trackOffsetRef.current + step),
            })
          ),
        })
      )
    ),
    react.createElement(
      ToolbarPanelSection,
      { title: globalTitle },
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarPanelRow, {
          stack: true,
          className: "ivl-tb-offset-row",
          desc: I18n.t("syncAdjust.globalInfo"),
          control: react.createElement(
            "div",
            { className: "ivl-tb-offset" },
            react.createElement(ToolbarRangeField, {
              value: offsets.globalOffset,
              min: -10000,
              max: 10000,
              step: 10,
              unit: "ms",
              label: globalTitle,
              onChange: offsets.changeGlobalOffset,
            }),
            react.createElement(ToolbarOffsetSteps, {
              steps: [-1000, -100, -10, 10, 100, 1000],
              label: globalTitle,
              unit: false,
              onStep: (step) => offsets.changeGlobalOffset(offsets.globalOffset + step),
            })
          ),
        })
      )
    ),
    hasVideoSyncControls && react.createElement(
      "div",
      { "data-section": "video-sync" },
      react.createElement(
      ToolbarPanelSection,
      { title: I18n.t("syncAdjust.videoTitle") || "Current video" },
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarPanelRow, {
          stack: true,
          className: "ivl-tb-offset-row",
          desc: I18n.t("syncAdjust.videoInfo") || "Fine-tune the current video's first-lyric time after auto-match.",
          control: react.createElement(CurrentVideoSyncPanelControl, {
            key: `video-${trackUri}`,
            trackUri,
          }),
        })
      )
      )
    ),
    react.createElement(
      ToolbarPanelGroup,
      null,
      react.createElement(ToolbarToggleRow, {
        label: I18n.t("settingsAdvanced.playback.quickSyncControls.label"),
        checked: quickSyncEnabled,
        onChange: onQuickSyncChange,
      })
    )
  );
});

// Community Video Selector를 document.body에 직접 렌더링
function openCommunityVideoSelector(trackUri, currentVideoId, onVideoSelect, defaultStartTime = 0) {
  // 이미 열려있으면 무시
  if (document.getElementById("ivLyrics-community-video-overlay")) {
    return;
  }

  openFluentReactModal({
    overlayId: "ivLyrics-community-video-overlay",
    overlayClassName: "community-video-overlay ivl-tb-dialog-overlay",
    shellClassName: "community-video-modal-shell ivl-tb-dialog",
    shellStyle: `
      max-width: 90vw;
      height: min(70vh, 760px);
      max-height: 70vh;
      width: 560px;
    `,
    removeExisting: false,
    render: (closeModal) =>
      react.createElement(CommunityVideoSelector, {
        trackUri,
        currentVideoId,
        defaultStartTime,
        onVideoSelect: async (newVideoInfo) => {
          try {
            await onVideoSelect?.(newVideoInfo);
          } finally {
            closeModal();
          }
        },
        onClose: closeModal
      }),
  });
}

// 현재 곡 > 영상 선택, listed while the video background is in use.
const CommunityVideoButton = react.memo(({ trackUri, videoInfo, onVideoSelect, defaultStartTime = 0, enabled = CONFIG.visual["video-background"], onBeforeOpen }) => {
  // 비디오 배경이 비활성화되어 있으면 항목 숨김
  if (!enabled) {
    return null;
  }

  const handleClick = () => {
    onBeforeOpen?.();
    const activeVideoInfo = window.ivLyricsActiveCommunityVideoInfo;
    const activeVideoId = activeVideoInfo?.trackUri === trackUri
      ? activeVideoInfo.youtubeVideoId
      : null;
    openCommunityVideoSelector(
      trackUri,
      activeVideoId || videoInfo?.youtubeVideoId,
      onVideoSelect,
      defaultStartTime
    );
  };

  return react.createElement(ToolbarMenuItem, {
    icon: "communityVideo",
    label: I18n.t("communityVideo.selectVideo"),
    onClick: handleClick,
  });
});
// Reuse the advanced panel's controls without adding component or DOM wrappers.
const renderShareImageControls = (settings, updateSetting) => {
  const labelText = (key, fallback) => I18n.t(`shareImage.settings.${key}`) || fallback;
  const field = (label, control) => react.createElement("div", { style: { gridColumn: 'span 2' } },
    react.createElement("label", {
      style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }
    }, label),
    control
  );
  const section = (key, fallback, first = false) => react.createElement("div", {
    className: "share-image-panel-section",
    style: {
      gridColumn: 'span 2',
      fontSize: '12px',
      fontWeight: '600',
      color: '#1db954',
      ...(!first ? { marginTop: '12px' } : {}),
      marginBottom: '4px',
      borderBottom: '1px solid rgba(29,185,84,0.2)',
      paddingBottom: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      letterSpacing: '0.5px',
      textTransform: 'uppercase'
    }
  }, I18n.t(`shareImage.sections.${key}`) || fallback);
  const range = (key, fallbackLabel, fallback, min, max, { step, percent = false } = {}) => {
    const value = percent ? Math.round((settings[key] ?? fallback) * 100) : settings[key] ?? fallback;
    return field(`${labelText(key, fallbackLabel)}: ${value}${percent ? '%' : 'px'}`,
      react.createElement("input", {
        type: 'range', min, max,
        ...(step !== undefined ? { step } : {}),
        value,
        onChange: (event) => updateSetting(key, percent ? parseInt(event.target.value) / 100 : parseInt(event.target.value)),
        style: { width: '100%', accentColor: '#1db954' }
      })
    );
  };
  const checkbox = (key, fallbackLabel, wide = false) => react.createElement("div",
    wide ? { style: { gridColumn: 'span 2' } } : null,
    react.createElement("label", {
      className: "share-image-check",
      style: { display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }
    },
      react.createElement("input", {
        type: 'checkbox', checked: settings[key] !== false,
        onChange: (event) => updateSetting(key, event.target.checked),
        style: { accentColor: '#1db954' }
      }),
      labelText(key, fallbackLabel)
    )
  );
  const choice = (key, fallbackLabel, options, compact = false) => field(labelText(key, fallbackLabel),
    react.createElement("div", { style: { display: 'flex', gap: '4px' } },
      options.map(([value, label]) => react.createElement("button", {
        key: value === null ? 'auto' : value,
        className: "share-image-segment-btn",
        "data-active": settings[key] === value,
        onClick: () => updateSetting(key, value),
        style: {
          flex: 1,
          padding: compact ? '5px 6px' : '5px 8px',
          borderRadius: '4px',
          border: settings[key] === value ? '1px solid #1db954' : '1px solid rgba(255,255,255,0.15)',
          background: settings[key] === value ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)',
          color: '#fff',
          fontSize: compact ? '9px' : '10px',
          cursor: 'pointer'
        }
      }, label))
    )
  );
  const color = (key, fallbackLabel) => field(labelText(key, fallbackLabel),
    react.createElement("input", {
      type: 'color',
      value: /^#[0-9a-f]{6}$/i.test(settings[key] ?? '') ? settings[key] : '#ffffff',
      onChange: (event) => updateSetting(key, event.target.value),
      style: { width: '100%', height: '28px', padding: '2px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }
    })
  );
  const weights = ['400', '500', '600', '700'];
  const text = (key, fallbackLabel, placeholder = '') => field(labelText(key, fallbackLabel),
    react.createElement("input", {
      type: 'text',
      value: settings[key] ?? '',
      placeholder,
      onChange: (event) => updateSetting(key, event.target.value),
      style: { width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '12px' }
    })
  );

  return [
    section('background', '배경', true),
    choice('backgroundType', '배경 스타일', [
      ['coverBlur', labelText('coverBlur', '블러')],
      ['gradient', labelText('gradient', '그라디언트')],
      ['solid', labelText('solid', '단색')]
    ]),
    settings.backgroundType === 'coverBlur' && range('backgroundBlur', '배경 블러', 30, 0, 80),
    range('backgroundOpacity', '배경 어둡기', 0.6, 20, 90, { percent: true }),
    section('cover', '앨범 커버'),
    checkbox('showCover', '앨범 커버'),
    checkbox('showTrackInfo', '곡 정보'),
    settings.showCover && choice('coverPosition', '커버 위치', [
      ['left', labelText('posLeft', '좌측')], ['center', labelText('posCenter', '중앙')]
    ]),
    settings.showCover && range('coverSize', '커버 크기', 120, 60, 200),
    settings.showCover && range('coverRadius', '커버 둥글기', 16, 0, 50),
    settings.showCover && range('coverBlur', '커버 블러', 0, 0, 30),
    settings.showTrackInfo && range('trackTitleSize', '곡 제목 크기', 26, 12, 48),
    settings.showTrackInfo && color('trackTitleColor', '곡 제목 색상'),
    settings.showTrackInfo && choice('trackTitleWeight', '곡 제목 굵기', weights.map((weight) => [weight, weight]), true),
    settings.showTrackInfo && range('trackArtistSize', '아티스트 크기', 18, 10, 36),
    settings.showTrackInfo && color('trackArtistColor', '아티스트 색상'),
    settings.showTrackInfo && choice('trackArtistWeight', '아티스트 굵기', weights.map((weight) => [weight, weight]), true),
    section('lyrics', '가사'),
    choice('lyricsDetail', '내보내기 방식', [
      ['line', labelText('lineLevel', '줄 단위')], ['word', labelText('wordLevel', '단어 단위')]
    ]),
    choice('fontSource', '글꼴', [
      ['default', labelText('fontDefault', '기본')], ['settings', labelText('fontSettings', '앱 설정')], ['custom', labelText('fontCustom', '직접 입력')]
    ]),
    settings.fontSource === 'custom' && text('customFontFamily', '글꼴 이름', '예: Pretendard Variable'),
    checkbox('showPronunciation', '발음'),
    settings.lyricsDetail !== 'word' && range('pronSize', '발음 크기', 20, 10, 32),
    settings.lyricsDetail === 'word' && range('wordReadingSize', '문자 발음 크기', 21, 8, 40),
    settings.lyricsDetail === 'word' && color('wordReadingColor', '문자 발음 색상'),
    settings.lyricsDetail === 'word' && choice('wordReadingWeight', '문자 발음 굵기', weights.map((weight) => [weight, weight]), true),
    settings.lyricsDetail !== 'word' && color('pronColor', '발음 색상'),
    settings.lyricsDetail !== 'word' && choice('pronWeight', '발음 굵기', weights.map((weight) => [weight, weight]), true),
    checkbox('showTranslation', '번역'),
    settings.lyricsDetail === 'word' && range('wordGlossSize', '단어 번역 크기', 21, 8, 40),
    settings.lyricsDetail === 'word' && color('wordGlossColor', '문자 번역 색상'),
    settings.lyricsDetail === 'word' && choice('wordGlossWeight', '문자 번역 굵기', weights.map((weight) => [weight, weight]), true),
    range('transSize', '번역 크기', 22, 10, 32),
    color('transColor', '번역 색상'),
    choice('transWeight', '번역 굵기', weights.map((weight) => [weight, weight]), true),
    choice('lyricsAlign', '가사 정렬', [
      ['left', labelText('alignLeft', '왼쪽')], ['center', labelText('alignCenter', '가운데')], ['right', labelText('alignRight', '오른쪽')]
    ]),
    range('fontSize', '글꼴 크기', 32, 20, 48),
    range('blockGap', '줄 간격', 32, 16, 60),
    color('origColor', '원어 색상'),
    choice('origWeight', '원어 굵기', weights.map((weight) => [weight, weight]), true),
    section('layout', '레이아웃'),
    choice('exportScale', '내보내기 배율', [[1, '1x'], [2, '2x'], [3, '3x']], true),
    choice('aspectRatio', '이미지 비율', [[null, labelText('ratioAuto', '자동')], [1, '1:1'], [9 / 16, '9:16'], [16 / 9, '16:9']], true),
    range('imageWidth', '이미지 너비', 1080, 720, 1920, { step: 60 }),
    range('padding', '여백', 60, 30, 100),
    section('other', '기타'),
    checkbox('showWatermark', '워터마크 표시', true)
  ];
};

// Resolve per-word reading/gloss for share export using the same word-level
// supplements as the karaoke view (segmenter + ivLyricsWordSupplements).
// Returns a Map of line idx -> [{w, reading, gloss}]. Lines without data are
// absent from the map so the renderer falls back to line rendering.
async function resolveShareWordDetails(lines) {
  const details = new Map();
  const segmenter = window.LyricsWordSegmenter;
  if (!segmenter?.segmentLyrics) return details;
  const supplements = window.ivLyricsWordSupplements || null;
  await Promise.all((lines || []).map(async (line) => {
    try {
      const text = line?.originalText || line?.displayText || '';
      if (!text.trim()) return;
      const sourceLang = supplements?.resolveSourceLanguage
        ? supplements.resolveSourceLanguage(text)
        : 'auto';
      const surfaces = segmenter.segmentLyrics(text, sourceLang);
      if (!surfaces || surfaces.length === 0) return;
      const units = surfaces.map((surface) => ({ surface }));
      let readings = [];
      let glosses = [];
      if (supplements) {
        try {
          const readingMode = supplements.resolveReadingMode?.(sourceLang);
          if (readingMode) {
            readings = await supplements.getWordReadings(units, sourceLang, readingMode, text).catch(() => []);
          }
        } catch { /* reading stays empty */ }
        try {
          if (supplements.isGlossModeActive?.(sourceLang)) {
            glosses = await supplements.getWordGlosses(units, text, sourceLang).catch(() => []);
          }
        } catch { /* gloss stays empty */ }
      }
      details.set(line.idx, units.map((unit, index) => ({
        w: unit.surface,
        reading: String(readings?.[index] || ''),
        gloss: String(glosses?.[index] || ''),
      })));
    } catch { /* per-line failure falls back to line rendering */ }
  }));
  return details;
}

// Share Lyrics Image Modal Component
const ShareImageModal = ({ lyrics, trackInfo, onClose }) => {
  const [selectedIndices, setSelectedIndices] = react.useState([]);
  const [template, setTemplate] = react.useState('cover');
  const [previewUrl, setPreviewUrl] = react.useState(null);
  const [isGenerating, setIsGenerating] = react.useState(false);
  // Advanced panel is always open; the state slot is kept so hook order is stable.
  const [showAdvanced] = react.useState(true);
  const [customSettings, setCustomSettings] = react.useState({});
  const [showCopyrightModal, setShowCopyrightModal] = react.useState(false);
  const [pendingAction, setPendingAction] = react.useState(null); // 'copy' | 'download' | 'share'
  const MAX_LINES = 10;

  const presets = Object.entries(LyricsShareImage?.PRESETS || {}).map(([key, val]) => ({
    key,
    name: I18n.t(`shareImage.templates.${key}`) || val.name
  }));

  // 현재 프리셋의 기본 설정값 가져오기
  const getPresetSettings = (presetKey) => {
    const preset = LyricsShareImage?.PRESETS?.[presetKey]?.settings || {};
    const defaults = LyricsShareImage?.DEFAULT_SETTINGS || {};
    return { ...defaults, ...preset };
  };

  // 현재 유효한 설정값 계산 (프리셋 + 커스텀 설정)
  const currentSettings = react.useMemo(() => {
    const base = getPresetSettings(template);
    // customSettings의 값이 존재하면 (숫자 0 포함) 사용
    const merged = { ...base };
    for (const key in customSettings) {
      if (customSettings[key] !== undefined) {
        merged[key] = customSettings[key];
      }
    }
    return merged;
  }, [template, customSettings]);

  // 템플릿 변경 시 커스텀 설정을 프리셋 값으로 초기화
  const handleTemplateChange = (newTemplate) => {
    setTemplate(newTemplate);
    // 프리셋의 설정값을 커스텀 설정으로 복사
    const presetSettings = getPresetSettings(newTemplate);
    setCustomSettings({ ...presetSettings });
  };

  // 개별 설정 변경
  const updateSetting = (key, value) => {
    setCustomSettings(prev => ({ ...prev, [key]: value }));
  };

  // 컴포넌트 마운트 시 초기 프리셋 설정 로드
  react.useEffect(() => {
    const initialSettings = getPresetSettings(template);
    setCustomSettings({ ...initialSettings });
  }, []); // 마운트 시 한 번만 실행

  // 가사 라인을 정규화 (원어/발음/번역 추출)
  const normalizedLyrics = react.useMemo(() => {
    return (lyrics || []).map((line, idx) => {
      // 원어 텍스트
      const originalText = line.originalText || line.text || '';
      // 발음 텍스트 (text와 originalText가 다르면 발음)
      const pronText = (line.text && line.text !== line.originalText && line.originalText) ? line.text : null;
      // 번역 텍스트
      const transText = line.text2 || line.translation || line.transText || null;

      return {
        idx,
        originalText: originalText.trim(),
        pronText: pronText ? pronText.trim() : null,
        transText: transText ? transText.trim() : null,
        // 표시용 텍스트 (원어 우선)
        displayText: originalText.trim() || pronText?.trim() || ''
      };
    }).filter(l => l.displayText && !l.displayText.startsWith('♪'));
  }, [lyrics]);

  // 선택된 가사 라인 객체들
  const normalizedLyricsByIdx = react.useMemo(
    () => new Map(normalizedLyrics.map((line) => [line.idx, line])),
    [normalizedLyrics]
  );
  const selectedIndexSet = react.useMemo(() => new Set(selectedIndices), [selectedIndices]);
  const selectedLinesBase = react.useMemo(() => {
    return selectedIndices.map((idx) => normalizedLyricsByIdx.get(idx)).filter(Boolean);
  }, [selectedIndices, normalizedLyricsByIdx]);

  // Word-level export details: fetched on demand when the word toggle is
  // active, then merged into the selected lines so preview and export
  // (which both consume `selectedLines`) stay in sync.
  const isWordExport = currentSettings.lyricsDetail === 'word';
  const [wordDetails, setWordDetails] = react.useState(new Map());
  react.useEffect(() => {
    if (!isWordExport) return undefined;
    let cancelled = false;
    resolveShareWordDetails(selectedLinesBase).then((details) => {
      if (!cancelled) setWordDetails(details);
    }).catch(() => { /* fallback to line rendering */ });
    return () => {
      cancelled = true;
    };
  }, [isWordExport, selectedLinesBase]);
  const selectedLines = react.useMemo(() => {
    if (!isWordExport) return selectedLinesBase;
    return selectedLinesBase.map((line) => (
      wordDetails.has(line.idx) ? { ...line, words: wordDetails.get(line.idx) } : line
    ));
  }, [selectedLinesBase, wordDetails, isWordExport]);

  // Keep one render in flight and retain only the newest pending preview.
  const previewGenerationRef = react.useRef({ running: false, pending: null });
  react.useEffect(() => {
    if (selectedLines.length === 0 || !trackInfo) {
      setPreviewUrl(null);
      setIsGenerating(false);
      return;
    }

    let cancelled = false;
    const queue = previewGenerationRef.current;
    const generatePreview = async () => {
      if (cancelled) return;
      setIsGenerating(true);
      try {
        const result = await LyricsShareImage.generateImage({
          lyrics: selectedLines,
          trackName: trackInfo.name || '',
          artistName: trackInfo.artist || '',
          albumCover: trackInfo.cover || '',
          template,
          customSettings,
          width: 1080, // same width as export for consistency
          output: 'dataUrl',
        });
        if (!cancelled) setPreviewUrl(result.dataUrl);
      } catch (e) {
        if (!cancelled) console.error('[ShareImage] Preview generation failed:', e);
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    };

    queue.pending = generatePreview;
    const frameId = requestAnimationFrame(async () => {
      if (queue.running) return;
      queue.running = true;
      try {
        while (queue.pending) {
          const next = queue.pending;
          queue.pending = null;
          await next();
        }
      } finally {
        queue.running = false;
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (queue.pending === generatePreview) queue.pending = null;
    };
  }, [selectedLines, template, customSettings, trackInfo]);

  const toggleLine = (lineIdx) => {
    setSelectedIndices(prev => {
      if (prev.includes(lineIdx)) {
        return prev.filter(i => i !== lineIdx);
      }
      if (prev.length >= MAX_LINES) {
        Toast.error(I18n.t("shareImage.maxLinesReached"));
        return prev;
      }
      return [...prev, lineIdx];
    });
  };

  // 저작권 경고 모달 확인 처리
  const handleCopyrightConfirm = async () => {
    setShowCopyrightModal(false);
    const action = pendingAction;
    setPendingAction(null);

    if (action === 'copy') {
      await executeCopy();
    } else if (action === 'download') {
      await executeDownload();
    } else if (action === 'share') {
      await executeShare();
    }
  };

  const handleCopyrightCancel = () => {
    setShowCopyrightModal(false);
    setPendingAction(null);
  };

  // 실제 복사 실행
  const executeCopy = async () => {
    setIsGenerating(true);
    try {
      const result = await LyricsShareImage.generateImage({
        lyrics: selectedLines,
        trackName: trackInfo.name || '',
        artistName: trackInfo.artist || '',
        albumCover: trackInfo.cover || '',
        template,
        customSettings,
        width: 1080,
        output: 'blob',
      });
      const success = await LyricsShareImage.copyToClipboard(result.blob);
      if (success) {
        Toast.success(I18n.t("notifications.shareImageCopied"));
        onClose();
      }
    } catch (e) {
      Toast.error(I18n.t("notifications.shareImageFailed"));
    }
    setIsGenerating(false);
  };

  // 실제 다운로드 실행
  const executeDownload = async () => {
    setIsGenerating(true);
    try {
      const result = await LyricsShareImage.generateImage({
        lyrics: selectedLines,
        trackName: trackInfo.name || '',
        artistName: trackInfo.artist || '',
        albumCover: trackInfo.cover || '',
        template,
        customSettings,
        width: 1080,
        output: 'dataUrl',
      });
      const filename = `${trackInfo.name || 'lyrics'} - ${trackInfo.artist || 'unknown'}.png`.replace(/[/\\?%*:|"<>]/g, '-');
      LyricsShareImage.download(result.dataUrl, filename);
      Toast.success(I18n.t("notifications.shareImageDownloaded"));
      onClose();
    } catch (e) {
      Toast.error(I18n.t("notifications.shareImageFailed"));
    }
    setIsGenerating(false);
  };

  // 실제 공유 실행
  const executeShare = async () => {
    setIsGenerating(true);
    try {
      const result = await LyricsShareImage.generateImage({
        lyrics: selectedLines,
        trackName: trackInfo.name || '',
        artistName: trackInfo.artist || '',
        albumCover: trackInfo.cover || '',
        template,
        customSettings,
        width: 1080,
        output: 'blob',
      });
      const success = await LyricsShareImage.share(result.blob, trackInfo.name, trackInfo.artist);
      if (success) {
        Toast.success(I18n.t("notifications.shareImageShared"));
        onClose();
      } else {
        // Fallback to download if share not supported
        executeDownload();
      }
    } catch (e) {
      Toast.error(I18n.t("notifications.shareImageFailed"));
    }
    setIsGenerating(false);
  };

  const handleCopy = async () => {
    if (selectedIndices.length === 0) {
      Toast.error(I18n.t("shareImage.noSelection"));
      return;
    }
    setPendingAction('copy');
    setShowCopyrightModal(true);
  };

  const handleDownload = async () => {
    if (selectedIndices.length === 0) {
      Toast.error(I18n.t("shareImage.noSelection"));
      return;
    }
    setPendingAction('download');
    setShowCopyrightModal(true);
  };

  const handleShare = async () => {
    if (selectedIndices.length === 0) {
      Toast.error(I18n.t("shareImage.noSelection"));
      return;
    }
    setPendingAction('share');
    setShowCopyrightModal(true);
  };

  return react.createElement("div", {
    className: "share-image-modal",
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: '80vh',
    }
  },
    // Header
    react.createElement("div", {
      className: "ivlyrics-fluent-header share-image-modal-header",
      style: {
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }
    },
      react.createElement(
        "div",
        { className: "ivlyrics-fluent-title-wrap" },
        react.createElement("h2", { className: "ivlyrics-fluent-title", style: { margin: 0 } }, I18n.t("shareImage.title")),
        react.createElement("p", { className: "ivlyrics-fluent-subtitle" }, I18n.t("shareImage.subtitle"))
      ),
      react.createElement(
        "button",
        {
          onClick: onClose,
          className: "ivlyrics-fluent-close",
        },
        react.createElement(
          "svg",
          { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
          react.createElement("path", { d: "M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" })
        )
      )
    ),

    // Content
    react.createElement("div", {
      className: "share-image-modal-content",
      style: {
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
      }
    },
      // Left: Lyrics selection
      react.createElement("div", {
        className: "share-image-modal-selection-pane",
        style: {
          width: '30%',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
        }
      },
        react.createElement("div", {
          className: "share-image-modal-selection-label",
          style: {
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            fontSize: '13px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.7)',
          }
        }, `${I18n.t("shareImage.selectLyrics")} (${selectedIndices.length}/${MAX_LINES})`),
        react.createElement("div", {
          className: "share-image-modal-selection-list",
          style: {
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
          }
        },
          normalizedLyrics.map((line) =>
            react.createElement("div", {
              key: line.idx,
              className: "share-image-modal-lyric-line",
              "data-selected": selectedIndexSet.has(line.idx),
              onClick: () => toggleLine(line.idx),
              style: {
                padding: '10px 12px',
                marginBottom: '4px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: selectedIndexSet.has(line.idx) ? 'rgba(29, 185, 84, 0.2)' : 'rgba(255,255,255,0.05)',
                border: selectedIndexSet.has(line.idx) ? '1px solid rgba(29, 185, 84, 0.5)' : '1px solid transparent',
                transition: 'all 0.15s ease',
              }
            },
              // 원어 텍스트
              react.createElement("div", {
                style: { fontSize: '14px', fontWeight: '500', color: '#fff' }
              }, line.originalText || line.pronText),
              // 발음 텍스트 (원어와 다를 때만)
              line.pronText && line.originalText && react.createElement("div", {
                style: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }
              }, line.pronText),
              // 번역 텍스트
              line.transText && react.createElement("div", {
                style: { fontSize: '12px', color: 'rgba(29, 185, 84, 0.8)', marginTop: '2px' }
              }, line.transText)
            )
          )
        )
      ),

      // Middle: Preset & Options
      react.createElement("div", {
        className: "share-image-modal-config-pane",
        style: {
          width: '36%',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          overflowY: 'auto',
        }
      },
        // Preset selector
        react.createElement("div", {
          className: "share-image-control-group",
          style: { marginBottom: '12px' }
        },
          react.createElement("label", {
            style: { fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }
          }, I18n.t("shareImage.template")),
          react.createElement("div", {
            className: "share-image-segment-group",
            style: { display: 'flex', gap: '6px', flexWrap: 'wrap' }
          },
            presets.map(t =>
              react.createElement("button", {
                key: t.key,
                className: "share-image-chip",
                "data-active": template === t.key,
                onClick: () => handleTemplateChange(t.key),
                style: {
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: template === t.key ? '2px solid #1db954' : '1px solid rgba(255,255,255,0.2)',
                  background: template === t.key ? 'rgba(29, 185, 84, 0.15)' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: '11px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }
              }, t.name)
            )
          )
        ),

        // Advanced settings panel (always open, fills the middle section)
        showAdvanced && react.createElement("div", {
          className: "share-image-advanced-panel",
          style: {
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            fontSize: '11px',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }
        },
          ...renderShareImageControls(currentSettings, updateSetting)
        ),

      ),

      // Right: Preview (separate panel)
      react.createElement("div", {
        className: "share-image-preview-pane",
        style: {
          width: '34%',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          overflowY: 'auto',
        }
      },
        react.createElement("div", {
          className: "share-image-preview-label",
          style: {
            fontSize: '13px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.7)',
            marginBottom: '12px',
          }
        }, I18n.t("shareImage.preview")),
        react.createElement("div", {
          className: "share-image-preview-panel",
          style: {
            flex: 1,
            borderRadius: '12px',
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            minHeight: '180px',
          }
        },
          isGenerating ? react.createElement("div", {
            className: "share-image-placeholder",
            style: { color: 'rgba(255,255,255,0.5)', fontSize: '14px' }
          }, "...") :
            previewUrl ? react.createElement("img", {
              src: previewUrl,
              style: {
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '8px',
              }
            }) : react.createElement("div", {
              className: "share-image-placeholder",
              style: { color: 'rgba(255,255,255,0.4)', fontSize: '14px', textAlign: 'center' }
            }, I18n.t("shareImage.selectLyricsHint"))
        )
      )
    ),

    // Footer: Actions
    react.createElement("div", {
      className: "ivlyrics-fluent-footer share-image-modal-footer",
      style: {
        padding: '16px 24px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '10px',
      }
    },
      react.createElement("button", {
        onClick: onClose,
        className: "ivlyrics-fluent-btn",
        style: {
          padding: '10px 20px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'transparent',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
        }
      }, I18n.t("buttons.cancel")),
      react.createElement(
        "div",
        { className: "share-image-modal-actions" },
        react.createElement("button", {
          onClick: handleCopy,
          className: "ivlyrics-fluent-btn",
          disabled: selectedIndices.length === 0 || isGenerating,
          style: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: selectedIndices.length === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
            color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff',
            fontSize: '14px',
            fontWeight: '500',
            cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
          }
        }, I18n.t("shareImage.actions.copy")),
        react.createElement("button", {
          onClick: handleDownload,
          className: "ivlyrics-fluent-btn",
          disabled: selectedIndices.length === 0 || isGenerating,
          style: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: selectedIndices.length === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
            color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff',
            fontSize: '14px',
            fontWeight: '500',
            cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
          }
        }, I18n.t("shareImage.actions.download")),
        navigator.canShare && react.createElement("button", {
          onClick: handleShare,
          className: "ivlyrics-fluent-btn primary",
          disabled: selectedIndices.length === 0 || isGenerating,
          style: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: selectedIndices.length === 0 ? 'rgba(29, 185, 84, 0.3)' : '#1db954',
            color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.5)' : '#000',
            fontSize: '14px',
            fontWeight: '600',
            cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
          }
        }, I18n.t("shareImage.actions.share"))
      )
    ),

    // 저작권 경고 모달
    showCopyrightModal && react.createElement("div", {
      className: "ivlyrics-fluent-overlay is-open",
      "data-ui-theme": getSettingsSurfaceTheme(),
      onClick: (e) => {
        if (e.target === e.currentTarget) handleCopyrightCancel();
      }
    },
      react.createElement("div", {
        className: "ivlyrics-fluent-shell share-image-copyright-shell",
        "data-ui-theme": getSettingsSurfaceTheme(),
        role: "dialog",
        "aria-modal": "true",
      },
        react.createElement(
          "div",
          { className: "ivlyrics-fluent-body share-image-copyright-body" },
          react.createElement(
            "div",
            { className: "share-image-copyright-icon" },
            react.createElement(
              "svg",
              { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
              react.createElement("path", { d: "M10 3 18 17H2L10 3Z" }),
              react.createElement("path", { d: "M10 7.5v4.5" }),
              react.createElement("circle", { cx: 10, cy: 14.2, r: 0.7, fill: "currentColor", stroke: "none" })
            )
          ),
          react.createElement("h3", { className: "ivlyrics-fluent-title", style: { margin: 0, fontSize: '18px' } }, I18n.t("shareImage.copyrightTitle") || "저작권 알림"),
          react.createElement("p", { className: "ivlyrics-fluent-subtitle", style: { margin: 0 } }, I18n.t("shareImage.copyrightDesc") || "이 가사 이미지에는 저작권이 있는 콘텐츠가 포함될 수 있습니다."),
          react.createElement("ul", { className: "share-image-copyright-points" },
            react.createElement("li", null, I18n.t("shareImage.copyrightPoint1") || "개인적인 용도로만 사용해 주세요"),
            react.createElement("li", null, I18n.t("shareImage.copyrightPoint2") || "상업적 목적으로 사용하지 마세요"),
            react.createElement("li", null, I18n.t("shareImage.copyrightPoint3") || "SNS 공유 시 원작자를 존중해 주세요")
          ),
          react.createElement("div", { className: "share-image-copyright-actions" },
          react.createElement("button", {
            onClick: handleCopyrightCancel,
            className: "ivlyrics-fluent-btn",
          }, I18n.t("buttons.cancel") || "취소"),
          react.createElement("button", {
            onClick: handleCopyrightConfirm,
            className: "ivlyrics-fluent-btn primary share-image-copyright-confirm",
          }, I18n.t("shareImage.copyrightConfirm") || "동의 후 계속")
          )
        )
      )
    )
  );
};

// Open Share Image Modal
function openShareImageModal(lyrics, trackInfo) {
  openFluentReactModal({
    overlayId: "ivLyrics-share-image-overlay",
    overlayClassName: "ivl-tb-dialog-overlay",
    shellClassName: "share-image-modal-shell ivl-tb-dialog",
    shellStyle: `
      width: 94%;
      max-width: 1600px;
      max-height: 92vh;
    `,
    render: (closeModal) =>
      react.createElement(ShareImageModal, {
        lyrics,
        trackInfo,
        onClose: closeModal,
      }),
  });
}

// 더보기 > 가사 이미지 공유. Track details are read when the dialog opens.
const ShareImageButton = react.memo(({ lyrics, getTrackInfo, onBeforeOpen }) => {
  const handleClick = () => {
    onBeforeOpen?.();
    if (!lyrics || lyrics.length === 0) {
      Toast.error(I18n.t("notifications.shareImageNoLyrics"));
      return;
    }
    openShareImageModal(lyrics, getTrackInfo?.() || {});
  };

  return react.createElement(ToolbarMenuItem, {
    icon: "shareImage",
    label: I18n.t("menu.shareImage"),
    onClick: handleClick,
  });
});

function setSyncDataCreatorVisibility(active) {
  document.body.classList.toggle("ivlyrics-sync-creator-active", !!active);
  window.dispatchEvent(new CustomEvent("ivLyrics:sync-creator-visibility", {
    detail: { active: !!active }
  }));
}

// Sync Data Creator - 노래방 싱크 데이터 생성 (전체화면)
async function openSyncDataCreator(trackInfo, initialData = null) {
  const trackId = Utils.extractTrackId(trackInfo?.uri);
  if (!trackId) {
    Toast.error(I18n.t("syncCreator.trackIdRequired") || "Spotify trackId가 없는 로컬 곡은 노래방 싱크를 등록할 수 없습니다.");
    return;
  }

  try {
    await Utils.requireDiscordAuth(
      I18n.t("syncCreator.loginRequired"),
      { checkingMessage: I18n.t("settingsAdvanced.aboutTab.account.checking") }
    );
  } catch (e) {
    Utils.promptDiscordLoginRequired(e?.message || I18n.t("syncCreator.loginRequired"));
    return;
  }

  // 이미 열려있으면 무시
  if (document.getElementById("ivLyrics-sync-creator-overlay")) {
    setSyncDataCreatorVisibility(true);
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "ivLyrics-sync-creator-overlay";
  overlay.className = "ivlyrics-sync-creator-overlay";

  // Render React component
  const dom = window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null;
  if (!dom?.render) {
    return;
  }

  let isClosed = false;
  const closeModal = () => {
    if (isClosed) return;
    isClosed = true;
    // React 컴포넌트 unmount (리스너 정리를 위해)
    if (dom.unmountComponentAtNode) {
      dom.unmountComponentAtNode(overlay);
    }
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
    document.removeEventListener("keydown", handleEscape);
    setSyncDataCreatorVisibility(false);
  };

  // Close on escape key (only if not in recording mode - check global state)
  const handleEscape = (e) => {
    // record 모드에서는 Escape로 닫지 않음 (SyncDataCreator에서 Backspace로 취소)
    // 키보드 싱크 단축키가 먼저 처리되도록 capture phase에서 처리됨
    if (e.key === "Escape" && !e.defaultPrevented) {
      closeModal();
    }
  };
  document.addEventListener("keydown", handleEscape);

  document.body.appendChild(overlay);
  setSyncDataCreatorVisibility(true);

  // SyncDataCreator 컴포넌트가 없으면 경고
  if (typeof SyncDataCreator === "undefined") {
    console.error("[OptionsMenu] SyncDataCreator component not found");
    Toast.error("SyncDataCreator not available");
    closeModal();
    return;
  }

  const creatorComponent = react.createElement(SyncDataCreator, {
    trackInfo,
    initialData,
    onClose: closeModal
  });

  dom.render(creatorComponent, overlay);
}

// 현재 곡 > 노래방 싱크 생성. A local track cannot be submitted (it has no
// Spotify trackId); a song without karaoke sync carries the invitation that
// used to float beside the toolbar.
const SyncDataCreatorButton = react.memo(({ trackUri, getTrackInfo, hasKaraokeSync = true, onBeforeOpen }) => {
  const hasTrackId = !!Utils.extractTrackId(trackUri);
  const disabledTooltip = I18n.t("syncCreator.trackIdRequired") || "Spotify trackId가 없는 로컬 곡은 노래방 싱크를 등록할 수 없습니다.";

  const handleClick = () => {
    if (!hasTrackId) {
      Toast.error(disabledTooltip);
      return;
    }
    onBeforeOpen?.();
    void openSyncDataCreator(getTrackInfo?.() || { uri: trackUri }, null);
  };

  return react.createElement(ToolbarMenuItem, {
    icon: "syncCreator",
    label: I18n.t("syncCreator.buttonTooltip") || "Create Karaoke Sync",
    desc: !hasTrackId
      ? disabledTooltip
      : hasKaraokeSync
        ? null
        : I18n.t("syncCreator.clickHereHint") || null,
    disabled: !hasTrackId,
    onClick: handleClick,
  });
});

// ---------------------------------------------------------------------------
// Lyrics-page floating toolbar
// Labelled entries in three groups: the lyrics mode (named after the current
// mode), 변환, 발음 우선 (while pronunciation is shown) and 싱크 조절 |
// 현재 곡 and 더보기 | 설정 and 전체화면.
// In fullscreen they fold into one 메뉴 button. Entries with a panel open it
// to the left of the toolbar; 현재 곡 drills into the provider, local lyrics
// and background views. Video selection, image sharing, the cache editor,
// LRCLIB search and the karaoke sync creator keep their dialogs.
// ---------------------------------------------------------------------------
const TOOLBAR_ENTRY_GROUPS = Object.freeze([
  Object.freeze(["mode", "convert", "pronunciationFirst", "sync"]),
  Object.freeze(["track", "more"]),
  Object.freeze(["settings", "fullscreen", "fullscreenAlt"]),
]);
const TOOLBAR_MODE_KEYS = Object.freeze(["character", "word", "synced", "unsynced"]);
const TOOLBAR_MODE_LABEL_KEYS = Object.freeze({
  character: "modes.character",
  word: "modes.word",
  synced: "modes.synced",
  unsynced: "modes.unsynced",
});
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

// React may replace the clicked submenu before the document's bubbling click
// listener runs. The original event path still identifies it as an inside click.
const isToolbarSurfaceEvent = (event, root, companionSurfaces) =>
  !!root?.contains(event.target) ||
  !!event.target?.closest?.(companionSurfaces) ||
  !!event.composedPath?.().some((node) => node === root || node?.matches?.(companionSurfaces));

const TOOLBAR_HOTKEY_LABELS = Object.freeze({
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  meta: "⌘",
  command: "⌘",
  cmd: "⌘",
  space: "Space",
  enter: "Enter",
  return: "Enter",
  esc: "Esc",
  escape: "Esc",
  tab: "Tab",
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
});

const getToolbarHotkeyParts = (combo) =>
  String(combo || "")
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (TOOLBAR_HOTKEY_LABELS[lower]) return TOOLBAR_HOTKEY_LABELS[lower];
      return token.length === 1 || /^f\d{1,2}$/.test(lower) ? token.toUpperCase() : token;
    });

const isToolbarModeAvailable = (modeKey, lyrics) => {
  if (modeKey === "character" || modeKey === "word") return !!lyrics.hasKaraoke && !!lyrics.karaokeEnabled;
  if (modeKey === "synced") return !!lyrics.hasSynced;
  if (modeKey === "unsynced") return !!lyrics.hasUnsynced;
  return false;
};

// Why a mode cannot be chosen for the current song. Nothing is claimed while
// the song's lyrics are still loading.
const getToolbarModeUnavailableReason = (modeKey, lyrics) => {
  if (lyrics.isLoading) return "";
  if (modeKey === "character" || modeKey === "word") {
    if (!lyrics.hasKaraoke) return getOptionsText("modes.unavailableNoKaraoke", "이 곡에는 노래방 싱크가 없습니다");
    if (!lyrics.karaokeEnabled) return getOptionsText("modes.unavailableKaraokeOff", "노래방 모드 사용이 꺼져 있습니다");
    return "";
  }
  if (modeKey === "synced") return getOptionsText("modes.unavailableNoSynced", "이 곡에는 동기화 가사가 없습니다");
  return getOptionsText("messages.noLyrics", "사용 가능한 가사가 없음");
};

const getToolbarFlyoutBounds = (toolbar) => {
  const pageRect = toolbar?.closest?.(".lyrics-lyricsContainer-LyricsContainer")?.getBoundingClientRect?.();
  const bounds = {
    left: Math.max(0, pageRect?.left ?? 0),
    top: Math.max(0, pageRect?.top ?? 0),
    right: Math.min(window.innerWidth, pageRect?.right ?? window.innerWidth),
    bottom: Math.min(window.innerHeight, pageRect?.bottom ?? window.innerHeight),
  };
  return bounds.right - bounds.left > 0 && bounds.bottom - bounds.top > 0
    ? bounds
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
};

// A panel next to the toolbar: header with title (and 뒤로 inside a drilled
// view), a scrolling body and an optional footer. It is positioned from the
// entry that opened it and kept inside the lyrics page.
const ToolbarFlyout = ({ entryId, anchor, toolbar, view, viewKey, direction, onBack, onClose }) => {
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
      window.innerWidth,
      window.innerHeight,
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
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [place, viewKey]);

  useEffect(() => {
    const flyout = ref.current;
    if (!flyout) return undefined;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place());
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(flyout);
    if (toolbar) observer?.observe(toolbar);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
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
  const closeLabel = I18n.t("buttons.close") || "Close";
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

// 가사 모드 panel: the four modes, each with the reason it cannot be used for
// this song, and the switch that replaced locking by right-click.
const LyricsModeMenu = ({ modeKey, lockedModeKey, lockInEffect, lyrics, onSelectMode, onSetModeLock }) => {
  const listRef = useRef(null);
  const label = getOptionsText("settings.lyricsMode.label", "가사 모드");
  const canLock = TOOLBAR_MODE_KEYS.some((key) => isToolbarModeAvailable(key, lyrics));
  return react.createElement(
    "div",
    { className: "ivl-tb-stack" },
    react.createElement(
      "div",
      {
        ref: listRef,
        className: "ivl-tb-group ivl-tb-choices",
        role: "radiogroup",
        "aria-label": label,
        onKeyDown: (event) => moveToolbarFocus(event, listRef.current, ".ivl-tb-choice"),
      },
      TOOLBAR_MODE_KEYS.map((key) => {
        const isAvailable = isToolbarModeAvailable(key, lyrics);
        const reason = isAvailable ? "" : getToolbarModeUnavailableReason(key, lyrics);
        const isOn = isAvailable && key === modeKey;
        return react.createElement(
          "button",
          {
            key,
            type: "button",
            role: "radio",
            className: joinToolbarClasses("ivl-tb-choice", isOn && "is-on"),
            "aria-checked": isOn,
            disabled: !isAvailable,
            onClick: () => onSelectMode?.(key),
          },
          react.createElement("span", { className: "ivl-tb-choice-ico" }, react.createElement(ToolbarGlyph, { name: key, size: 18 })),
          react.createElement(
            "span",
            { className: "ivl-tb-choice-main" },
            react.createElement(
              "span",
              { className: "ivl-tb-choice-label" },
              react.createElement("span", null, I18n.t(TOOLBAR_MODE_LABEL_KEYS[key])),
              lockInEffect && lockedModeKey === key
                ? react.createElement(
                  "span",
                  { className: "ivl-tb-pill is-accent" },
                  react.createElement(ToolbarGlyph, { name: "lock", size: 11 }),
                  getOptionsText("modes.locked", "고정됨")
                )
                : null
            ),
            reason ? react.createElement("small", null, reason) : null
          ),
          react.createElement("span", { className: "ivl-tb-choice-check", "aria-hidden": "true" }, react.createElement(ToolbarGlyph, { name: "check", size: 16 }))
        );
      })
    ),
    react.createElement(
      ToolbarPanelGroup,
      null,
      react.createElement(ToolbarToggleRow, {
        label: getOptionsText("modes.lockSelected", "선택한 모드로 고정"),
        desc: getOptionsText("modes.lockSelectedDesc", "다른 곡에서도 이 모드를 쓸 수 있으면 항상 이 모드로 보여 줍니다."),
        checked: !!lockInEffect,
        disabled: !canLock,
        onChange: (checked) => onSetModeLock?.(checked),
      })
    )
  );
};

// 현재 곡 panel: provider (or local lyrics), the song's own background, video
// selection while the video background is used, and the karaoke sync creator.
const CurrentTrackMenu = ({ toolbar, actions, onOpenView, closePanel }) => {
  const hasLocalLyrics = toolbar.isLocalTrack && !!actions.getHasLocalLyrics?.();
  return react.createElement(
    ToolbarMenuList,
    { label: getOptionsText("menu.currentTrack", "현재 곡") },
    react.createElement(LyricsProviderSelectButton, {
      selectedProvider: toolbar.providerOverride,
      isLoading: toolbar.isLyricsLoading,
      isLocalTrack: toolbar.isLocalTrack,
      hasLocalLyrics,
      onOpen: () => onOpenView("provider"),
    }),
    react.createElement(TrackBackgroundButton, {
      trackUri: toolbar.trackUri,
      overrideMode: toolbar.backgroundOverride,
      onOpen: () => onOpenView("background"),
    }),
    react.createElement(CommunityVideoButton, {
      trackUri: toolbar.trackUri,
      enabled: toolbar.videoEnabled,
      videoInfo: toolbar.videoInfo,
      defaultStartTime: toolbar.videoStartTime,
      onVideoSelect: actions.onVideoSelect,
      onBeforeOpen: closePanel,
    }),
    react.createElement(SyncDataCreatorButton, {
      trackUri: toolbar.trackUri,
      getTrackInfo: actions.getSyncCreatorTrackInfo,
      hasKaraokeSync: toolbar.hasKaraoke,
      onBeforeOpen: closePanel,
    })
  );
};

// 더보기 panel: open learning, share an image or visit the marketplace.
const ToolbarMoreMenu = ({ toolbar, actions, closePanel }) => {
  const learning = window.IvLyricsLearningMode;
  return react.createElement(
    ToolbarMenuList,
    { label: getOptionsText("menu.more", "더보기") },
    typeof learning?.open === "function"
      ? react.createElement(ToolbarMenuItem, {
        icon: "study",
        label: I18n.t("learningMode.button"),
        desc: I18n.t("learningMode.title"),
        popup: "dialog",
        disabled: !toolbar.hasLyrics || toolbar.isLyricsLoading,
        onClick: () => {
          closePanel();
          learning.open();
        },
      })
      : null,
    react.createElement(ShareImageButton, {
      lyrics: toolbar.lyrics,
      getTrackInfo: actions.getShareTrackInfo,
      onBeforeOpen: closePanel,
    }),
    react.createElement("div", { className: "ivl-tb-mi-sep", role: "separator" }),
    react.createElement(ToolbarMenuItem, {
      icon: "marketplace",
      label: I18n.t("marketplace.title"),
      current: !!toolbar.showMarketplace,
      onClick: () => {
        closePanel();
        actions.onToggleMarketplace?.();
      },
    })
  );
};

// Keep the fullscreen progress clearance tied to the actual toolbar column,
// including translated labels, without observing lyric content or visibility.
const observeToolbarProgressClearance = (column) => {
  const container = column?.closest?.(".lyrics-lyricsContainer-LyricsContainer");
  if (!container) return undefined;
  const view = column.ownerDocument?.defaultView || window;
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
};

const IvLyricsFloatingToolbar = react.memo((toolbar) => {
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
  const [slide, setSlide] = useState(null);
  const [tip, setTip] = useState(null);
  const [theme, setTheme] = useState(getSettingsSurfaceTheme);
  const offsets = useToolbarSyncOffsets(toolbar.syncTrackUri);
  openIdRef.current = openId;
  tipRef.current = tip;

  react.useLayoutEffect(() => {
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
    setTheme(getSettingsSurfaceTheme());
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
    const refreshTheme = () => setTheme(getSettingsSurfaceTheme());
    window.addEventListener("ivLyrics:settings-visibility", refreshTheme);
    return () => window.removeEventListener("ivLyrics:settings-visibility", refreshTheme);
  }, []);

  const lyricsState = {
    hasKaraoke: toolbar.hasKaraoke,
    karaokeEnabled: toolbar.karaokeEnabled,
    hasSynced: toolbar.hasSynced,
    hasUnsynced: toolbar.hasUnsynced,
    isLoading: toolbar.isLyricsLoading,
  };
  const modeLabel = TOOLBAR_MODE_LABEL_KEYS[toolbar.modeKey]
    ? I18n.t(TOOLBAR_MODE_LABEL_KEYS[toolbar.modeKey])
    : getOptionsText("settings.lyricsMode.label", "가사 모드");
  const modeTitle = getOptionsText("settings.lyricsMode.label", "가사 모드") + " · " + modeLabel +
    (toolbar.lockInEffect ? " · " + getOptionsText("modes.locked", "고정됨") : "");
  const trackLine = [toolbar.trackTitle, toolbar.trackArtist].filter(Boolean).join(" · ");
  const entries = {
    mode: {
      panel: true,
      icon: toolbar.modeKey || "synced",
      label: modeLabel,
      ariaLabel: modeTitle,
      lock: !!toolbar.lockInEffect,
      tip: () => ({
        title: modeTitle,
        lines: [I18n.t(toolbar.lockInEffect ? "modes.rightClickToUnlock" : "modes.rightClickToLock")],
      }),
      onContextMenu: (event) => {
        event.preventDefault();
        hideTip();
        actions?.onToggleModeLock?.();
      },
    },
    convert: {
      panel: true,
      hidden: !toolbar.showConvert,
      icon: "translation",
      label: I18n.t("menu.translation"),
      busy: !!toolbar.isRegenerating,
      tip: () => {
        const modeKey = toolbar.friendlyLanguage || "gemini";
        const shown = [
          CONFIG.visual?.["translation-mode:" + modeKey] !== "none" && I18n.t("menu.pronunciation"),
          CONFIG.visual?.["translation-mode-2:" + modeKey] !== "none" && I18n.t("menu.translationLabel"),
        ].filter(Boolean);
        return { title: I18n.t("menu.translationSettings"), lines: shown.length ? [shown.join(" · ")] : [] };
      },
    },
    pronunciationFirst: {
      // Shown only while the pronunciation supplement is on for this song.
      hidden: !toolbar.showPronunciationFirst,
      icon: "pronunciationFirst",
      label: getOptionsText("menu.pronunciationFirst", "발음 우선"),
      ariaLabel: getOptionsText("menu.pronunciationFirstTitle", "발음 우선 모드"),
      pressed: !!toolbar.pronunciationFirst,
      tip: () => ({
        title: getOptionsText("menu.pronunciationFirstTitle", "발음 우선 모드"),
        lines: [getOptionsText("menu.pronunciationFirstDesc", "원문과 발음의 위치를 바꿔 외국어 가사를 따라 읽기 쉽게 표시합니다")],
      }),
      onActivate: () => actions?.onTogglePronunciationFirst?.(),
    },
    sync: {
      panel: true,
      icon: "globalSync",
      label: I18n.t("menu.syncAdjust"),
      dot: offsets.trackOffset !== 0 || offsets.globalOffset !== 0,
      tip: () => ({
        title: I18n.t("menu.syncAdjustTitle"),
        lines: [[
          toolbar.canAdjustTrackSync && I18n.t("syncAdjust.trackTitle") + " " + formatSyncOffset(offsets.trackOffset),
          I18n.t("syncAdjust.globalTitle") + " " + formatSyncOffset(offsets.globalOffset),
        ].filter(Boolean).join(" · ")],
      }),
    },
    track: {
      panel: true,
      icon: "track",
      label: getOptionsText("menu.currentTrack", "현재 곡"),
      dot: !!toolbar.providerOverride || !!toolbar.backgroundOverride,
      tip: () => ({ title: getOptionsText("menu.currentTrack", "현재 곡"), lines: trackLine ? [trackLine] : [] }),
    },
    more: {
      panel: true,
      icon: "more",
      label: getOptionsText("menu.more", "더보기"),
      tip: () => ({
        title: getOptionsText("menu.more", "더보기"),
        lines: [[I18n.t("learningMode.button"), I18n.t("menu.shareImage"), I18n.t("marketplace.title")].join(" · ")],
      }),
    },
    settings: {
      icon: "settings",
      label: I18n.t("menu.settings"),
      onActivate: () => openConfig(),
    },
    fullscreen: {
      hidden: !toolbar.canToggleFullscreen,
      icon: toolbar.isFullscreen ? "fullscreenExit" : "fullscreenEnter",
      // The label stays put; the icon, the pressed state and the accessible
      // name say whether the click enters or leaves fullscreen.
      label: I18n.t("menu.fullscreen"),
      ariaLabel: toolbar.isFullscreen ? I18n.t("menu.exitFullscreen") || "Exit Fullscreen" : I18n.t("menu.fullscreen"),
      pressed: !!toolbar.isFullscreen,
      keys: getToolbarHotkeyParts(CONFIG.visual?.["fullscreen-key"] || "f12"),
      tip: () => ({
        title: toolbar.isFullscreen ? I18n.t("menu.exitFullscreen") || "Exit Fullscreen" : I18n.t("menu.fullscreen"),
      }),
      onActivate: () => actions?.onToggleFullscreen?.(),
    },
    // Optional second button for the other presentation: the lyrics-page layout
    // when the main button fills the monitor, otherwise monitor fullscreen.
    fullscreenAlt: (() => {
      const mainFillsScreen = CONFIG.visual?.["fullscreen-page-ui-only"] !== true
        && CONFIG.visual?.["fullscreen-browser-fullscreen"] === true;
      const presentation = mainFillsScreen ? "page" : "screen";
      const label = presentation === "page" ? I18n.t("menu.fullscreenInPage") : I18n.t("menu.fullscreenScreen");
      return {
        hidden: !toolbar.canToggleFullscreen || !!toolbar.isFullscreen
          || CONFIG.visual?.["fullscreen-separate-buttons"] !== true,
        icon: presentation === "page" ? "fullscreenPage" : "fullscreenScreen",
        label,
        ariaLabel: label,
        tip: () => ({
          title: label,
          lines: [presentation === "page" ? I18n.t("menu.fullscreenInPageHint") : I18n.t("menu.fullscreenScreenHint")],
        }),
        onActivate: () => actions?.onToggleFullscreen?.({ presentation }),
      };
    })(),
    menu: {
      icon: toolbar.isMenuOpen ? "close" : "menu",
      label: toolbar.isMenuOpen ? I18n.t("buttons.close") || "Close" : getOptionsText("fullscreen.menuToggleShort", "메뉴"),
      ariaLabel: toolbar.isMenuOpen ? I18n.t("buttons.close") || "Close" : I18n.t("fullscreen.menuToggle") || "ivLyrics",
      tip: () => ({ title: toolbar.isMenuOpen ? I18n.t("buttons.close") || "Close" : I18n.t("fullscreen.menuToggle") || "ivLyrics" }),
    },
  };
  entriesRef.current = entries;

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

  const openTrackView = (view) => {
    setSlide("in");
    setTrackViews((views) => views.concat(view));
  };
  const leaveTrackView = () => {
    setSlide("out");
    setTrackViews((views) => views.slice(0, -1));
  };
  const openSettingsFromPanel = (options) => {
    closePanel();
    openToolbarSettings(options);
  };

  const buildPanelView = (id) => {
    if (id === "mode") {
      return {
        title: getOptionsText("settings.lyricsMode.label", "가사 모드"),
        body: react.createElement(LyricsModeMenu, {
          modeKey: toolbar.modeKey,
          lockedModeKey: toolbar.lockedModeKey,
          lockInEffect: toolbar.lockInEffect,
          lyrics: lyricsState,
          onSelectMode: actions?.onSelectMode,
          onSetModeLock: actions?.onSetModeLock,
        }),
      };
    }
    if (id === "convert") {
      return {
        title: I18n.t("menu.translationSettings"),
        subtitle: I18n.t("menu.translationOptionsSubtitle"),
        body: react.createElement(TranslationMenu, {
          key: `${toolbar.trackUri || ""}:${toolbar.friendlyLanguage || "gemini"}`,
          friendlyLanguage: toolbar.friendlyLanguage,
          detectedLanguage: toolbar.detectedLanguage,
          regenerate: {
            choices: actions?.getRegenerateChoices?.() || [],
            onRegenerate: actions?.onRegenerate,
            isEnabled: !!toolbar.canRegenerate,
            busyTargets: [
              toolbar.isPronunciationRegenerating && "phonetic",
              toolbar.isTranslationRegenerating && "translation",
              toolbar.isCulturalAnnotationsRegenerating && "cultural-annotations",
              toolbar.isWordSupplementsRegenerating && "word-supplements",
            ].filter(Boolean),
          },
          cacheEdit: toolbar.hasLyrics
            ? {
              disabled: !!toolbar.isLyricsEditBusy,
              onOpen: () => {
                closePanel();
                actions?.onOpenLyricsEditor?.();
              },
            }
            : null,
          onOpenSettings: openSettingsFromPanel,
        }),
      };
    }
    if (id === "sync") {
      const hasOffsets = (toolbar.canAdjustTrackSync && offsets.trackOffset !== 0) || offsets.globalOffset !== 0;
      return {
        title: I18n.t("menu.syncAdjustTitle"),
        subtitle: I18n.t("syncAdjust.info"),
        body: react.createElement(SyncAdjustButtonFluent, {
          offsets,
          includeTrackOffset: !!toolbar.canAdjustTrackSync,
          quickSyncEnabled: toolbar.quickSyncEnabled !== false,
          trackUri: toolbar.syncTrackUri,
          onQuickSyncChange: (value) => actions?.onVisualConfigChange?.("quick-sync-controls-enabled", value),
        }),
        footer: react.createElement(
          "div",
          { className: "ivl-tb-foot-row" },
          react.createElement(
            ToolbarButton,
            {
              disabled: !hasOffsets,
              onClick: () => {
                if (toolbar.canAdjustTrackSync && offsets.trackOffset !== 0) offsets.changeTrackOffset(0);
                if (offsets.globalOffset !== 0) offsets.changeGlobalOffset(0);
              },
            },
            react.createElement(ToolbarGlyph, { name: "reset", size: 15 }),
            react.createElement("span", null, I18n.t("syncAdjust.reset"))
          )
        ),
      };
    }
    if (id === "track") {
      const view = trackViews[trackViews.length - 1];
      if (view === "provider" || view === "background") {
        const built = view === "provider"
          ? buildLyricsProviderView({
            currentProvider: toolbar.currentProvider,
            selectedProvider: toolbar.providerOverride,
            isLocalTrack: toolbar.isLocalTrack,
            trackInfo: actions?.getCurrentTrackInfo?.() || null,
            onSelectProvider: actions?.onSelectProvider,
            onImportLocalLyricsFile: actions?.onImportLocalLyricsFile,
            onApplyLocalLyrics: actions?.onApplyLocalLyrics,
            getHasLocalLyrics: actions?.getHasLocalLyrics,
            onDeleteLocalLyrics: actions?.onDeleteLocalLyrics,
            closeModal: closePanel,
            closeView: leaveTrackView,
          })
          : buildTrackBackgroundView({
            overrideMode: toolbar.backgroundOverride,
            effectiveMode: toolbar.effectiveBackground,
            onSelectBackground: actions?.onSelectBackground,
            onOpenSettings: openSettingsFromPanel,
          });
        return { title: built.title, subtitle: built.subtitle, body: react.createElement(ToolbarModelView, { view: built }) };
      }
      return {
        title: getOptionsText("menu.currentTrack", "현재 곡"),
        subtitle: trackLine,
        body: react.createElement(CurrentTrackMenu, { toolbar, actions, onOpenView: openTrackView, closePanel }),
      };
    }
    if (id === "more") {
      return {
        title: getOptionsText("menu.more", "더보기"),
        body: react.createElement(ToolbarMoreMenu, { toolbar, actions, closePanel }),
      };
    }
    return null;
  };

  const panelView = openId ? buildPanelView(openId) : null;
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
        "aria-label": I18n.t("fullscreen.menuToggle") || "ivLyrics",
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

// 전역으로 노출
window.openSyncDataCreator = openSyncDataCreator;
window.SyncDataCreatorButton = SyncDataCreatorButton;
window.IvLyricsFloatingToolbar = IvLyricsFloatingToolbar;
