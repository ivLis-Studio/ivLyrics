const OptionsMenuItemIcon = react.createElement(
  "svg",
  {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "currentColor",
  },
  react.createElement("path", {
    d: "M13.985 2.383L5.127 12.754 1.388 8.375l-.658.77 4.397 5.149 9.618-11.262z",
  })
);

function getSettingsSurfaceTheme() {
  const storedTheme = window.ivLyricsStoragePersistence?.getItem("ivLyrics:settings-ui-theme")
    ?? localStorage.getItem("ivLyrics:settings-ui-theme");
  return storedTheme === "light"
    ? "light"
    : "dark";
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
    document.removeEventListener("keydown", handleKeydown, true);
    onBeforeClose?.();

    if (overlay.parentNode) {
      overlay.remove();
    }

    if (previouslyFocused && document.contains(previouslyFocused)) {
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

.ivlyrics-first-language-shell {
  width: min(440px, calc(100vw - 32px));
  max-height: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px !important;
  background: rgba(24, 24, 27, 0.98);
  box-shadow: 0 20px 64px rgba(0, 0, 0, 0.44);
  color: #f8fafc;
  pointer-events: auto;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 20px 56px rgba(15, 23, 42, 0.18);
  color: #111827;
}

.ivlyrics-first-language-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 30px 18px;
  text-align: center;
}

.ivlyrics-first-language-icon {
  width: 58px;
  height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  border-radius: 50%;
  background: rgba(96, 165, 250, 0.22);
  color: #93c5fd;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.12em;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-icon {
  background: #dbeafe;
  color: #1d4f91;
}

.ivlyrics-first-language-title {
  margin: 0;
  color: inherit;
  font-size: 20px;
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.35;
}

.ivlyrics-first-language-description {
  margin: 5px 0 0;
  color: rgba(248, 250, 252, 0.58);
  font-size: 17px;
  line-height: 1.45;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-description {
  color: rgba(17, 24, 39, 0.64);
}

.ivlyrics-first-language-body {
  padding: 0 28px;
}

.ivlyrics-first-language-provider-hint {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 14px;
  padding: 11px 12px;
  border: 1px solid rgba(96, 165, 250, 0.22);
  border-radius: 11px;
  background: rgba(59, 130, 246, 0.10);
  color: rgba(219, 234, 254, 0.88);
  font-size: 12.5px;
  line-height: 1.45;
}

.ivlyrics-first-language-provider-hint-icon {
  flex: 0 0 auto;
  color: #93c5fd;
  font-weight: 800;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-provider-hint {
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(59, 130, 246, 0.08);
  color: #1e4f8f;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-provider-hint-icon {
  color: #2563a9;
}

.ivlyrics-first-language-toggle-row {
  width: 100%;
  min-height: 58px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.ivlyrics-first-language-toggle-row:last-child {
  border-bottom: 0;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-toggle-row {
  border-bottom-color: rgba(15, 23, 42, 0.1);
}

.ivlyrics-first-language-row-icon {
  width: 24px;
  color: rgba(248, 250, 252, 0.62);
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-row-icon {
  color: rgba(17, 24, 39, 0.68);
}

.ivlyrics-first-language-row-label {
  flex: 1;
  font-size: 16px;
  font-weight: 650;
}

.ivlyrics-first-language-switch {
  width: 50px;
  height: 28px;
  padding: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.16s ease, border-color 0.16s ease;
}

.ivlyrics-first-language-switch.is-on {
  justify-content: flex-end;
  border-color: #2f7ddd;
  background: #2f7ddd;
}

.ivlyrics-first-language-switch-knob {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-switch {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.04);
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-switch.is-on {
  border-color: #2f7ddd;
  background: #2f7ddd;
}

.ivlyrics-first-language-action {
  width: calc(100% - 56px);
  min-height: 48px;
  margin: 16px 28px 22px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: rgba(248, 250, 252, 0.62);
  font-size: 15px;
  font-weight: 650;
  cursor: pointer;
}

.ivlyrics-first-language-action.has-selection {
  background: #2f7ddd;
  color: #ffffff;
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-action {
  color: rgba(17, 24, 39, 0.55);
}

.ivlyrics-first-language-shell[data-ui-theme="light"] .ivlyrics-first-language-action.has-selection {
  color: #ffffff;
}

.ivlyrics-first-language-toggle-row:focus-visible,
.ivlyrics-first-language-action:focus-visible,
.ivlyrics-fluent-btn:focus-visible,
.ivlyrics-fluent-close:focus-visible {
  outline: 2px solid var(--spice-accent, #1ed760);
  outline-offset: 2px;
}

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
  border-color: rgba(255, 255, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.1) !important;
  color: #f8fafc !important;
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
  color: #0f172a !important;
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
  width: min(440px, 100%);
  max-height: none;
  background: rgba(24, 24, 27, 0.98) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  border-radius: 24px !important;
  box-shadow: 0 20px 64px rgba(0, 0, 0, 0.44) !important;
  backdrop-filter: blur(20px) saturate(130%);
  -webkit-backdrop-filter: blur(20px) saturate(130%);
  color: #f8fafc;
  pointer-events: auto;
}

.ivlyrics-fluent-shell.ivlyrics-first-language-shell[data-ui-theme="light"] {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(15, 23, 42, 0.08) !important;
  box-shadow: 0 20px 56px rgba(15, 23, 42, 0.18) !important;
  color: #111827;
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
    width: min(420px, 100%);
    max-height: calc(100% - 24px);
    border-radius: 22px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ivlyrics-fluent-overlay,
  .ivlyrics-fluent-shell {
    transition-duration: 1ms !important;
  }
}
`;
  document.head.appendChild(style);
}

// Optimized OptionsMenuItem with better performance
const OptionsMenuItem = react.memo(({ onSelect, value, isSelected }) => {
  // React 130 방지: Hook 순서 일관성 유지
  const menuItemProps = useMemo(
    () => ({
      onClick: onSelect,
      icon: isSelected ? OptionsMenuItemIcon : null,
      trailingIcon: isSelected ? OptionsMenuItemIcon : null,
    }),
    [onSelect, isSelected]
  );

  // React 31 방지: value가 유효한지 확인
  const safeValue = value || "";

  return react.createElement(
    Spicetify.ReactComponent.MenuItem,
    menuItemProps,
    safeValue
  );
});

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
    const getInitialSelected = () => {
      let initialItem = selected || defaultValue;
      if (initialItem && typeof initialItem !== 'object') {
        initialItem = optionByKey.get(initialItem);
      } else if (initialItem && initialItem.key && !initialItem.value) {
        const found = optionByKey.get(initialItem.key);
        if (found) initialItem = found;
      }
      return initialItem;
    };

    // 내부 상태로 선택된 항목 관리
    const [selectedItem, setSelectedItem] = react.useState(getInitialSelected);

    // props가 변경되면 내부 상태 업데이트
    react.useEffect(() => {
      setSelectedItem(getInitialSelected());
    }, [selected, defaultValue, optionByKey]);

    // Resolve default item for display fallback
    let defaultItem = defaultValue;
    if (defaultValue && typeof defaultValue !== 'object') {
      defaultItem = optionByKey.get(defaultValue);
    } else if (defaultValue && defaultValue.key && !defaultValue.value) {
      const found = optionByKey.get(defaultValue.key);
      if (found) defaultItem = found;
    }

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
              key: key,
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
  karaoke: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8"/>',
  character: '<path d="m5 18 4.5-12h2L16 18M7 13h7"/><path d="M18 7h3M19.5 5.5v3"/>',
  word: '<path d="m3 18 4-12h2l4 12M5 13h6"/><path d="M16 8h5M16 12h5M16 16h5"/>',
  synced: '<path d="M4 6h10M4 11h9M4 16h7"/><path d="M18 6v7"/><circle cx="18" cy="15" r="2"/>',
  unsynced: '<path d="M4 6h14M4 11h16M4 16h12"/>',
  syncCreator: '<path d="M3 12h2l2-5 3 10 3-8 2 6"/><path d="m16 19 4-4 2 2-4 4-3 1 1-3Z"/>',
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
      onClick: onClick,
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
        { key: key, className: `ivlyrics-popup-setting-row${control ? "" : " no-control"}` },
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

function shouldShowFirstLanguageAIProviderHint() {
  try {
    const enabledTranslationProviders = (window.AIAddonManager?.getEnabledProviders?.() || [])
      .filter((provider) => provider?.supports?.translate === true);
    return enabledTranslationProviders.length > 0
      && enabledTranslationProviders.every((provider) => FIRST_LANGUAGE_KEYLESS_PROVIDER_IDS.has(provider.id));
  } catch {
    return false;
  }
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
      autoFocus: true,
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
    const icon = document.createElement("span");
    icon.className = "ivlyrics-first-language-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "文A";
    const title = document.createElement("h2");
    title.id = titleId;
    title.className = "ivlyrics-first-language-title";
    title.textContent = I18n.t("firstLanguagePrompt.title", { language: languageName });
    const description = document.createElement("p");
    description.id = descriptionId;
    description.className = "ivlyrics-first-language-description";
    description.textContent = I18n.t("firstLanguagePrompt.description");
    header.append(icon, title, description);

    const body = document.createElement("div");
    body.className = "ivlyrics-first-language-body";
    const draft = {
      pronunciation: false,
      translation: false,
    };
    let providerHintText = null;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "ivlyrics-first-language-action";

    const updateAction = () => {
      const hasSelection = draft.pronunciation || draft.translation;
      action.classList.toggle("has-selection", hasSelection);
      action.textContent = I18n.t(
        hasSelection ? "firstLanguagePrompt.apply" : "firstLanguagePrompt.notNow"
      );
      if (providerHintText) {
        providerHintText.textContent = I18n.t(
          draft.pronunciation
            ? "firstLanguagePrompt.pronunciationAiProviderHint"
            : "firstLanguagePrompt.aiProviderHint"
        );
      }
    };

    const createToggleRow = ({ key, iconText, label }) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ivlyrics-first-language-toggle-row";
      row.setAttribute("role", "switch");
      row.setAttribute("aria-checked", "false");

      const rowIcon = document.createElement("span");
      rowIcon.className = "ivlyrics-first-language-row-icon";
      rowIcon.setAttribute("aria-hidden", "true");
      rowIcon.textContent = iconText;
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
        key: "pronunciation",
        iconText: "Abc",
        label: I18n.t("firstLanguagePrompt.pronunciation"),
      }),
      createToggleRow({
        key: "translation",
        iconText: "文A",
        label: I18n.t("firstLanguagePrompt.translation"),
      })
    );

    if (shouldShowFirstLanguageAIProviderHint()) {
      const providerHintId = "ivLyrics-first-language-provider-hint";
      const providerHint = document.createElement("div");
      providerHint.id = providerHintId;
      providerHint.className = "ivlyrics-first-language-provider-hint";
      providerHint.setAttribute("role", "note");
      const providerHintIcon = document.createElement("span");
      providerHintIcon.className = "ivlyrics-first-language-provider-hint-icon";
      providerHintIcon.setAttribute("aria-hidden", "true");
      providerHintIcon.textContent = "✦";
      providerHintText = document.createElement("span");
      providerHintText.textContent = I18n.t("firstLanguagePrompt.aiProviderHint");
      providerHint.append(providerHintIcon, providerHintText);
      body.appendChild(providerHint);
      host.shell.setAttribute("aria-describedby", `${descriptionId} ${providerHintId}`);
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

  return react.createElement(
    react.Fragment,
    null,
    react.createElement(
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
        },
        react.createElement("svg", {
          viewBox: "0 0 16 16",
          fill: "currentColor",
          dangerouslySetInnerHTML: {
            __html: '<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>',
          },
        })
      )
    ),
    react.createElement(
      "div",
      { className: "ivlyrics-fluent-body ivlyrics-options-modal-body" },
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "8px",
            alignItems: "stretch",
            marginBottom: "12px",
          },
        },
        react.createElement("input", {
          value: query,
          onChange: (event) => setQuery(event.target.value),
          onKeyDown: handleKeyDown,
          placeholder: getOptionsText("menu.localLyricsSearchPlaceholder", "곡명 또는 아티스트 검색"),
          style: {
            flex: "1 1 auto",
            minWidth: 0,
            height: "38px",
            padding: "0 12px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
            borderRadius: "0",
          },
        }),
        react.createElement(
          "button",
          {
            className: "ivlyrics-fluent-btn",
            type: "button",
            onClick: () => void performSearch(),
            disabled: isSearching,
          },
          isSearching
            ? getOptionsText("menu.localLyricsSearching", "검색 중")
            : getOptionsText("menu.search", "검색")
        )
      ),
      statusText && react.createElement(
        "div",
        {
          style: {
            marginBottom: "12px",
            color: "rgba(255,255,255,0.68)",
            fontSize: "13px",
          },
        },
        statusText
      ),
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          },
        },
        candidates.map((candidate, index) => {
          const candidateKey = candidate.candidateKey || `${candidate.id || "candidate"}-${index}`;
          const title = candidate.trackName || candidate.name || getOptionsText("menu.unknownTitle", "Unknown title");
          const artist = candidate.artistName || getOptionsText("menu.unknownArtist", "Unknown artist");
          const album = candidate.albumName || "";
          const duration = formatLrclibCandidateDuration(candidate.duration);
          const previewLines = getLrclibCandidatePreviewLines(candidate);
          const badges = [
            (candidate.hasSyncedLyrics || candidate.syncedLyrics) && getOptionsText("syncCreator.lrclibBadgeSynced", "Synced"),
            (candidate.hasPlainLyrics || candidate.plainLyrics) && getOptionsText("syncCreator.lrclibBadgePlain", "Plain"),
            candidate.instrumental && getOptionsText("syncCreator.lrclibBadgeInstrumental", "Instrumental"),
          ].filter(Boolean);

          return react.createElement(
            "div",
            {
              key: candidateKey,
              style: {
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "12px",
                padding: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
              },
            },
            react.createElement(
              "div",
              { style: { minWidth: 0 } },
              react.createElement(
                "div",
                {
                  style: {
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                  title,
                },
                title
              ),
              react.createElement(
                "div",
                {
                  style: {
                    marginTop: "3px",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "13px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                  title: [artist, album, duration].filter(Boolean).join(" · "),
                },
                [artist, album, duration].filter(Boolean).join(" · ")
              ),
              badges.length > 0 && react.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                    marginTop: "8px",
                  },
                },
                badges.map((badge) => react.createElement(
                  "span",
                  {
                    key: badge,
                    style: {
                      padding: "2px 6px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.78)",
                    },
                  },
                  badge
                ))
              ),
              previewLines.length > 0 && react.createElement(
                "div",
                {
                  style: {
                    marginTop: "8px",
                    color: "rgba(255,255,255,0.58)",
                    fontSize: "12px",
                    lineHeight: 1.45,
                  },
                },
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
                style: { alignSelf: "start" },
              },
              applyingKey === candidateKey
                ? getOptionsText("menu.localLyricsApplying", "적용 중")
                : getOptionsText("menu.apply", "적용")
            )
          );
        })
      )
    )
  );
};

function openLocalLyricsLrclibSearchModal({ trackInfo, onApplyLocalLyrics }) {
  return openFluentReactModal({
    overlayId: "ivLyrics-local-lyrics-lrclib-overlay",
    shellClassName: "ivlyrics-options-modal-shell",
    render: (closeModal) => react.createElement(LocalLyricsLrclibSearchModal, {
      trackInfo,
      onApplyLocalLyrics,
      onClose: closeModal,
    }),
  });
}

const TranslationMenu = react.memo(({ friendlyLanguage, hasTranslation }) => {
  // Open modal on click instead of ContextMenu to avoid xpui hook errors
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
    const modeKey = friendlyLanguage || "gemini";

    window.__ivLyricsDebugLog?.(
      "[TranslationMenu] Language:",
      friendlyLanguage,
      "ModeKey:",
      modeKey
    );
    window.__ivLyricsDebugLog?.("[TranslationMenu] Current values:");
    window.__ivLyricsDebugLog?.(
      `translation-mode:${modeKey} =`,
      CONFIG.visual[`translation-mode:${modeKey}`]
    );
    window.__ivLyricsDebugLog?.(
      `translation-mode-2:${modeKey} =`,
      CONFIG.visual[`translation-mode-2:${modeKey}`]
    );

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

    const displayLanguageName = getDisplayLanguageName(friendlyLanguage);

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
    const translationTargetName = getTranslationTargetDisplay();
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
    const pronunciationNotation = normalizePronunciationNotation(
      CONFIG.visual?.["translate:pronunciation-notation"] ||
      StorageManager.getItem(`${APP_NAME}:visual:translate:pronunciation-notation`)
    );
    const pronunciationNotationOptions = [
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
    ];

    // 지원되는 언어 목록
    const supportedLanguages = [
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
    ];

    // 현재 트랙의 언어 오버라이드 상태 (비동기로 로드)
    let currentOverride = window.lyricContainer?.trackLanguageOverride || null;

    const items = [
      {
        section: I18n.t("menu.detectedLanguage"),
        subtitle: I18n.t("menu.detectedLanguageInfo"),
        items: [
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.language,
              text: displayLanguageName,
            }),
            key: "detected-language-display",
            type: "info",
          },
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.language,
              text: I18n.t("menu.overrideLanguage") || "언어 수동 설정",
            }),
            key: "track-language-override",
            type: OptionsMenu,
            options: supportedLanguages,
            defaultValue: currentOverride
              ? supportedLanguages.find(l => l.key === currentOverride)
              : supportedLanguages[0],
            info: I18n.t("menu.overrideLanguageInfo") || "이 곡의 언어를 수동으로 설정합니다. 자동 감지 대신 선택한 언어로 번역됩니다.",
          },
        ],
      },
      {
        section: I18n.t("menu.translationOptions"),
        subtitle: I18n.t("menu.translationOptionsSubtitle"),
        items: [
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.mode,
              text: I18n.t("menu.pronunciation"),
            }),
            key: `translation-mode:${modeKey}`,
            type: ConfigSlider,
            defaultValue:
              CONFIG.visual[`translation-mode:${modeKey}`] !== "none",
            renderInline: true,
            info: I18n.t("menu.pronunciationInfo"),
          },
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.language,
              text: I18n.t("menu.pronunciationNotation") || "Pronunciation notation",
            }),
            key: "translate:pronunciation-notation",
            type: OptionsMenu,
            options: pronunciationNotationOptions,
            defaultValue:
              pronunciationNotationOptions.find(option => option.key === pronunciationNotation) ||
              pronunciationNotationOptions[0],
            info: I18n.t("menu.pronunciationNotationInfo") || "Choose how generated pronunciation is written. Regenerate pronunciation to update the current lyrics.",
          },
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.mode,
              text: I18n.t("menu.translationLabel"),
            }),
            key: `translation-mode-2:${modeKey}`,
            type: ConfigSlider,
            defaultValue:
              CONFIG.visual[`translation-mode-2:${modeKey}`] !== "none",
            renderInline: true,
            info: I18n.t("menu.translationInfo"),
          },
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.language,
              text: `${I18n.t("menu.translationTargetLang")}: ${translationTargetName}`,
            }),
            key: "translation-target-display",
            type: "info",
            info: I18n.t("menu.translationTargetLangInfo"),
          },
        ],
      },
      {
        section: I18n.t("menu.apiSettings"),
        subtitle: I18n.t("menu.apiSettingsSubtitle"),
        items: [
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.provider,
              text: I18n.t("menu.apiKeySettings"),
            }),
            key: "open-api-settings",
            type: ConfigButton,
            text: I18n.t("menu.openSettings"),
            onChange: () => {
              const overlay = document.getElementById(
                "ivLyrics-settings-overlay"
              );
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
                openConfig({ initialTab: "ai-providers" });
              }, overlay ? getSettingsMotionDurationMs() + 24 : 0);
            },
            info: I18n.t("menu.apiKeySettingsInfo"),
          },
        ],
      },
    ];

    openOptionsModal(I18n.t("menu.translationSettings"), items, async (name, value) => {
      // Skip processing for button items
      if (name === "open-api-settings") {
        return;
      }

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
    });
  };

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("menu.translation"), showDelay: 0 },
    react.createElement(
      "button",
      {
        className: "lyrics-config-button",
        onClick: open,
        "aria-label": I18n.t("menu.translation"),
      },
      react.createElement(IvLyricsToolbarIcon, { name: "translation" })
    )
  );
});

const LyricsProviderSelectButton = react.memo(
  ({
    currentProvider,
    selectedProvider,
    isLoading,
    onSelectProvider,
    isLocalTrack = false,
    trackInfo = null,
    onImportLocalLyricsFile,
    onApplyLocalLyrics,
  }) => {
    const open = () => {
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

      const selectedValue = selectedProvider || "auto";
      const selectedOption =
        providerOptions.find((option) => option.key === selectedValue) ||
        providerOptions[0];
      const currentProviderLabel =
        isLocalTrack
          ? getOptionsText("menu.localLyricsProvider", "Local")
          : (
            providers.find((provider) => provider.id === currentProvider)?.name ||
            currentProvider ||
            I18n.t("menu.unknownLanguage")
          );

      let closeModal = null;
      const items = [];
      if (isLocalTrack) {
        items.push({
          section: getOptionsText("menu.localLyricsTools", "로컬 가사"),
          subtitle: getOptionsText(
            "menu.localLyricsToolsSubtitle",
            "로컬 곡은 ivLyrics 서버와 분리됩니다. LRC 파일을 가져오거나 LRCLIB에서 직접 검색해 이 기기에 저장합니다."
          ),
          items: [
            {
              desc: react.createElement(SettingRowDescription, {
                icon: ICONS.localLyrics,
                text: getOptionsText("menu.localLyricsCurrent", "현재 로컬 가사"),
              }),
              key: "current-local-lyrics-provider",
              type: "info",
              info: currentProviderLabel || "local",
            },
            {
              desc: react.createElement(SettingRowDescription, {
                icon: ICONS.file,
                text: getOptionsText("menu.importLrcFile", "LRC 파일 가져오기"),
              }),
              key: "local-lyrics-import",
              type: IvConfigButton,
              text: getOptionsText("menu.import", "가져오기"),
              onChange: () => {
                closeModal?.();
                onImportLocalLyricsFile?.();
              },
            },
            {
              desc: react.createElement(SettingRowDescription, {
                icon: ICONS.search,
                text: getOptionsText("menu.searchLrclibLocal", "LRCLIB에서 검색"),
              }),
              key: "local-lyrics-lrclib-search",
              type: IvConfigButton,
              text: getOptionsText("menu.search", "검색"),
              onChange: () => {
                closeModal?.();
                openLocalLyricsLrclibSearchModal({
                  trackInfo,
                  onApplyLocalLyrics,
                });
              },
            },
          ],
        });
      } else {
        items.push({
          section: I18n.t("menu.lyricsProviderSelect"),
          subtitle: I18n.t("menu.lyricsProviderSelectSubtitle"),
          items: [
            {
              desc: react.createElement(SettingRowDescription, {
                icon: ICONS.provider,
                text: I18n.t("menu.lyricsProviderCurrent"),
              }),
              key: "current-lyrics-provider",
              type: "info",
              info: currentProviderLabel,
            },
            {
              desc: react.createElement(SettingRowDescription, {
                icon: ICONS.provider,
                text: I18n.t("menu.lyricsProviderSelect"),
              }),
              key: "track-lyrics-provider",
              type: OptionsMenu,
              options: providerOptions,
              defaultValue: selectedOption,
              info: I18n.t("menu.lyricsProviderSelectSubtitle"),
            },
          ],
        });
      }

      closeModal = openOptionsModal(
        isLocalTrack
          ? getOptionsText("menu.localLyricsTools", "로컬 가사")
          : I18n.t("menu.lyricsProviderSelect"),
        items,
        async (name, value) => {
          if (name !== "track-lyrics-provider") {
            return;
          }
          if (isLocalTrack) {
            return;
          }
          await onSelectProvider?.(value === "auto" ? null : value);
          closeModal?.();
        }
      );
    };

    return react.createElement(
      Spicetify.ReactComponent.TooltipWrapper,
      { label: isLocalTrack ? getOptionsText("menu.localLyricsTools", "로컬 가사") : I18n.t("menu.lyricsProviderSelect"), showDelay: 0 },
      react.createElement(
        "button",
        {
          className: "lyrics-config-button",
          onClick: open,
          disabled: isLoading && !isLocalTrack,
          "aria-label": isLocalTrack
            ? getOptionsText("menu.localLyricsTools", "로컬 가사")
            : I18n.t("menu.lyricsProviderSelect"),
        },
        react.createElement(IvLyricsToolbarIcon, {
          name: isLocalTrack ? "localLyrics" : "provider",
        })
      )
    );
  }
);

function openRegenerateTranslationChoiceModal({
  onSelect,
  targets = {},
  includeCulturalAnnotations = false,
}) {
  let closeModal = null;
  const makeTargetButton = (key, text, target) => ({
    desc: react.createElement(SettingRowDescription, {
      icon: ICONS.language,
      text,
    }),
    key,
    type: ConfigButton,
    text: I18n.t("menu.regenerateAction"),
    onChange: () => {
      closeModal?.();
      onSelect?.(target);
    },
  });

  const targetItems = [];
  if (targets.needPhonetic) {
    targetItems.push(
      makeTargetButton(
        "regenerate-phonetic-only",
        I18n.t("menu.regeneratePronunciationOnly"),
        "phonetic"
      )
    );
  }
  if (targets.needTranslation) {
    targetItems.push(
      makeTargetButton(
        "regenerate-translation-only",
        I18n.t("menu.regenerateTranslationOnly"),
        "translation"
      )
    );
  }
  if (targets.needPhonetic && targets.needTranslation) {
    targetItems.push(
      makeTargetButton(
        "regenerate-both",
        I18n.t("menu.regenerateBoth"),
        "all"
      )
    );
  }
  if (includeCulturalAnnotations) {
    targetItems.push(
      makeTargetButton(
        "regenerate-cultural-annotations",
        I18n.t("settings.culturalAnnotations.label"),
        "cultural-annotations"
      )
    );
  }

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

const RegenerateTranslationButton = react.memo(
  ({ onRegenerate, isEnabled, isLoading }) => {
    return react.createElement(
      Spicetify.ReactComponent.TooltipWrapper,
      { label: I18n.t("menu.regenerateTranslation"), showDelay: 0 },
      react.createElement(
        "button",
        {
          className: "lyrics-config-button" + (isLoading ? " loading-spin" : ""),
          onClick: onRegenerate,
          disabled: !isEnabled || isLoading,
          "aria-label": I18n.t("menu.regenerateTranslation"),
        },
        react.createElement(IvLyricsToolbarIcon, { name: "regenerate" })
      )
    );
  }
);

const TrackBackgroundButton = react.memo(
  ({ trackUri, overrideMode, effectiveMode, onSelectBackground }) => {
    const open = () => {
      if (!trackUri) {
        Toast.error(I18n.t("notifications.noTrackPlaying"));
        return;
      }

      const backgroundOptions = getTrackBackgroundOptions();
      const selectedKey = overrideMode || "inherit";
      const selectedOption =
        backgroundOptions.find((option) => option.key === selectedKey) ||
        backgroundOptions[0];
      const effectiveLabel = getBackgroundPresetLabel(effectiveMode || "none");

      const items = [
        {
          section: getOptionsText("menu.trackBackgroundTitle", "개별 배경"),
          subtitle: getOptionsText(
            "menu.trackBackgroundSubtitle",
            "이 곡에서만 사용할 배경 종류를 선택합니다. 블러, 밝기, 영상 배율 같은 세부 옵션은 기본 배경 설정을 따릅니다."
          ),
          items: [
            {
              desc: react.createElement(SettingRowDescription, {
                icon: ICONS.background,
                text: getOptionsText("menu.trackBackgroundCurrent", "현재 적용 배경"),
              }),
              key: "current-track-background",
              type: "info",
              info: effectiveLabel,
            },
            {
              desc: react.createElement(SettingRowDescription, {
                icon: ICONS.background,
                text: getOptionsText("menu.trackBackgroundSelect", "이 곡의 배경"),
              }),
              key: "track-background-mode",
              type: OptionsMenu,
              options: backgroundOptions,
              defaultValue: selectedOption,
              info: getOptionsText(
                "menu.trackBackgroundSelectInfo",
                "기본 설정 사용을 선택하면 설정 > 외관 > 시각효과의 배경을 그대로 사용합니다."
              ),
            },
          ],
        },
      ];

      openOptionsModal(
        getOptionsText("menu.trackBackgroundTitle", "개별 배경"),
        items,
        async (name, value) => {
          if (name !== "track-background-mode") {
            return;
          }
          await onSelectBackground?.(value === "inherit" ? null : value);
        }
      );
    };

    return react.createElement(
      Spicetify.ReactComponent.TooltipWrapper,
      { label: getOptionsText("menu.trackBackground", "개별 배경"), showDelay: 0 },
      react.createElement(
        "button",
        {
          className: "lyrics-config-button lyrics-track-background-button",
          onClick: open,
          "data-active": overrideMode ? "true" : "false",
          "aria-label": getOptionsText("menu.trackBackground", "개별 배경"),
        },
        react.createElement(IvLyricsToolbarIcon, { name: "background" })
      )
    );
  }
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

const TrackSyncAdjustPill = react.memo(({ trackUri }) => {
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
    const displayValue = `${step > 0 ? "+" : "−"}${absoluteStep}ms`;
    return react.createElement(
      "button",
      {
        key: step,
        type: "button",
        className: "lyrics-track-sync-step",
        disabled: !isOffsetLoaded,
        "data-step-size": absoluteStep,
        "data-feedback-source": interactionFeedback?.kind === "step"
          && interactionFeedback.step === step
          ? "true"
          : undefined,
        onClick: (event) => {
          handleOffsetChange(optimisticOffsetRef.current + step);
          showInteractionFeedback("step", event, step);
        },
        onPointerUp: (event) => event.currentTarget.blur(),
        "aria-label": `${I18n.t("menu.syncAdjustTitle")} ${displayValue}`,
      },
      displayValue
    );
  };

  const compactControls = [];
  [-100, -50, -10, "current", 10, 50, 100].forEach((control, index) => {
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
          disabled: !isOffsetLoaded,
          "data-active": offset !== 0 ? "true" : "false",
          "data-feedback-kind": interactionFeedback?.kind || undefined,
          onClick: (event) => {
            if (optimisticOffsetRef.current !== 0) handleOffsetChange(0);
            showInteractionFeedback("reset", event);
          },
          onPointerUp: (event) => event.currentTarget.blur(),
          title: I18n.t("syncAdjust.reset"),
          "aria-label": isOffsetLoaded
            ? `${formatSyncOffset(offset)}, ${I18n.t("syncAdjust.reset")}`
            : I18n.t("syncAdjust.loading"),
        },
        react.createElement(
          "span",
          {
            key: `current-${interactionFeedback?.id || 0}-${isOffsetLoaded}-${offset}`,
            className: "lyrics-track-sync-value-current",
            "data-change-direction": interactionFeedback?.kind === "step"
              ? interactionFeedback.direction
              : undefined,
            "aria-live": "polite",
            "aria-atomic": "true",
          },
          isOffsetLoaded ? formatSyncOffset(offset) : "…"
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
          "✓ 0ms"
        )
      ));
      return;
    }

    compactControls.push(renderStepButton(control));
  });

  const movementFeedback = interactionFeedback
    ? react.createElement(
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
    )
    : null;

  if (!trackUri) return null;

  return react.createElement(
    "div",
    {
      className: "lyrics-track-sync-pill",
      role: "group",
      "aria-label": I18n.t("menu.syncAdjustTitle"),
      "aria-busy": !isOffsetLoaded,
      "data-offset-active": offset !== 0 ? "true" : "false",
    },
    react.createElement(
      "div",
      { className: "lyrics-track-sync-controls" },
      movementFeedback,
      compactControls
    )
  );
});

const SyncAdjustButtonFluent = react.memo(({
  trackUri = null,
  includeTrackOffset = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [globalOffset, setGlobalOffset] = useState(() => Utils.getGlobalSyncOffset?.() || 0);
  const [panelPosition, setPanelPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const globalSliderRef = useRef(null);
  const previousFocusRef = useRef(null);
  const reactDom = window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null;
  const hasTrackOffsetControls = Boolean(
    includeTrackOffset &&
    trackUri &&
    typeof TrackSyncAdjustPill !== "undefined"
  );
  const updatePanelPosition = react.useCallback(() => {
    if (window.innerWidth <= 840) {
      setPanelPosition(null);
      return;
    }

    const triggerRect = triggerRef.current?.getBoundingClientRect?.();
    const panelRect = panelRef.current?.getBoundingClientRect?.();
    if (!triggerRect || !panelRect?.width || !panelRect?.height) return;

    const viewportPadding = 12;
    const gap = 10;
    const left = Math.max(
      viewportPadding,
      Math.min(
        triggerRect.left - panelRect.width - gap,
        window.innerWidth - panelRect.width - viewportPadding
      )
    );
    const top = Math.max(
      viewportPadding,
      Math.min(
        triggerRect.top + (triggerRect.height - panelRect.height) / 2,
        window.innerHeight - panelRect.height - viewportPadding
      )
    );
    setPanelPosition({ left, top });
  }, []);

  useEffect(() => {
    ensureFluentModalStyles();
  }, []);

  useEffect(() => {
    const handleGlobalOffsetChange = (event) => {
      setGlobalOffset(clampSyncOffset(event.detail?.offset));
    };

    window.addEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
    return () => {
      window.removeEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    setGlobalOffset(clampSyncOffset(Utils.getGlobalSyncOffset?.() || 0));
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePanelPosition);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePanelPosition);
      const previousFocus = previousFocusRef.current;
      requestAnimationFrame(() => {
        if (previousFocus && document.contains(previousFocus)) {
          previousFocus.focus();
        } else if (triggerRef.current && document.contains(triggerRef.current)) {
          triggerRef.current.focus();
        }
      });
    };
  }, [isOpen, updatePanelPosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let focusFrame = null;
    const layoutFrame = requestAnimationFrame(() => {
      updatePanelPosition();
      focusFrame = requestAnimationFrame(() => {
        const panel = panelRef.current;
        if (!panel || panel.contains(document.activeElement)) return;

        const initialControl = hasTrackOffsetControls
          ? panel.querySelector?.(".lyrics-track-sync-step:not([disabled])") ||
            panel.querySelector?.(".ivlyrics-fluent-close") ||
            globalSliderRef.current
          : globalSliderRef.current;
        initialControl?.focus();
      });
    });

    return () => {
      cancelAnimationFrame(layoutFrame);
      if (focusFrame !== null) {
        cancelAnimationFrame(focusFrame);
      }
    };
  }, [isOpen, hasTrackOffsetControls, trackUri, updatePanelPosition]);

  const handleGlobalOffsetChange = (newOffset) => {
    const safeOffset = clampSyncOffset(newOffset);
    setGlobalOffset(safeOffset);
    Utils.setGlobalSyncOffset?.(safeOffset);
  };

  const globalTitle = I18n.t("syncAdjust.globalTitle");
  const modalTitle = hasTrackOffsetControls
    ? I18n.t("menu.syncAdjustTitle")
    : globalTitle;
  const modalDescription = hasTrackOffsetControls
    ? I18n.t("syncAdjust.info")
    : I18n.t("syncAdjust.globalInfo");
  const globalControls = react.createElement(
    "div",
    { className: "lyrics-sync-adjust-layout" },
    react.createElement(
      "div",
      { className: "lyrics-sync-adjust-track" },
      react.createElement(
        "div",
        { className: "lyrics-sync-adjust-slider-container" },
        react.createElement("input", {
          ref: globalSliderRef,
          type: "range",
          className: "sync-slider",
          min: -10000,
          max: 10000,
          step: 10,
          value: globalOffset,
          onInput: (event) => handleGlobalOffsetChange(Number(event.target.value)),
          "aria-label": globalTitle,
          "aria-valuetext": formatSyncOffset(globalOffset),
          style: {
            "--progress-percent": `${((globalOffset + 10000) / 20000) * 100}%`,
          },
        }),
        react.createElement(
          "div",
          { className: "lyrics-sync-adjust-slider-summary" },
          react.createElement("span", null, "-10s"),
          react.createElement("span", { className: "lyrics-sync-adjust-current" }, formatSyncOffset(globalOffset)),
          react.createElement("span", null, "+10s")
        )
      )
    ),
    react.createElement(
      "div",
      { className: "lyrics-sync-adjust-side" },
      react.createElement(
        "div",
        { className: "lyrics-sync-adjust-fine" },
        react.createElement(
          "div",
          { className: "lyrics-sync-adjust-quick" },
          react.createElement(AdjustButton, { value: "-1000", ariaLabel: `${globalTitle} -1000ms`, onClick: () => handleGlobalOffsetChange(globalOffset - 1000) }),
          react.createElement(AdjustButton, { value: "-100", ariaLabel: `${globalTitle} -100ms`, onClick: () => handleGlobalOffsetChange(globalOffset - 100) }),
          react.createElement(AdjustButton, { value: "-10", ariaLabel: `${globalTitle} -10ms`, onClick: () => handleGlobalOffsetChange(globalOffset - 10) })
        ),
        react.createElement(
          "div",
          { className: "lyrics-sync-adjust-quick" },
          react.createElement(AdjustButton, { value: "+1000", ariaLabel: `${globalTitle} +1000ms`, onClick: () => handleGlobalOffsetChange(globalOffset + 1000) }),
          react.createElement(AdjustButton, { value: "+100", ariaLabel: `${globalTitle} +100ms`, onClick: () => handleGlobalOffsetChange(globalOffset + 100) }),
          react.createElement(AdjustButton, { value: "+10", ariaLabel: `${globalTitle} +10ms`, onClick: () => handleGlobalOffsetChange(globalOffset + 10) })
        )
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "ivlyrics-fluent-btn lyrics-sync-adjust-reset",
          onClick: () => handleGlobalOffsetChange(0),
        },
        I18n.t("syncAdjust.reset")
      )
    )
  );
  const modalOverlay = isOpen
    ? react.createElement(
        "div",
        {
          className: "lyrics-sync-adjust-floating",
          style: panelPosition
            ? { left: `${panelPosition.left}px`, top: `${panelPosition.top}px`, right: "auto", bottom: "auto" }
            : (window.innerWidth > 840 ? { visibility: "hidden" } : undefined),
          onMouseDown: (event) => event.stopPropagation(),
          onClick: (event) => event.stopPropagation(),
        },
        react.createElement(
          "div",
          {
            ref: panelRef,
            className: "ivlyrics-fluent-shell lyrics-sync-adjust-modal-shell",
            "data-ui-theme": getSettingsSurfaceTheme(),
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "ivlyrics-sync-adjust-title",
            "aria-describedby": "ivlyrics-sync-adjust-description",
          },
          react.createElement(
            "div",
            { className: "ivlyrics-fluent-header" },
            react.createElement(
              "div",
              { className: "ivlyrics-fluent-title-wrap" },
              react.createElement("div", { id: "ivlyrics-sync-adjust-title", className: "ivlyrics-fluent-title" }, modalTitle),
              react.createElement("p", { id: "ivlyrics-sync-adjust-description", className: "ivlyrics-fluent-subtitle" }, modalDescription)
            ),
            react.createElement(
              "button",
              {
                type: "button",
                className: "ivlyrics-fluent-close",
                onClick: () => setIsOpen(false),
                "aria-label": I18n.t("buttons.close") || "Close",
              },
              react.createElement(
                "svg",
                { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true" },
                react.createElement("path", { d: "M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z" })
              )
            )
          ),
          react.createElement(
            "div",
            { className: "ivlyrics-fluent-body lyrics-sync-adjust-modal" },
            hasTrackOffsetControls &&
            react.createElement(
              "div",
              { className: "lyrics-sync-adjust-track-section" },
              react.createElement("div", { className: "lyrics-sync-adjust-section-title" }, I18n.t("syncAdjust.trackTitle")),
              react.createElement("p", { className: "lyrics-sync-adjust-section-desc" }, I18n.t("syncAdjust.trackInfo")),
              react.createElement(TrackSyncAdjustPill, {
                key: trackUri,
                trackUri,
              })
            ),
            hasTrackOffsetControls
              ? react.createElement(
                "div",
                { className: "lyrics-sync-adjust-global-section" },
                react.createElement("div", { className: "lyrics-sync-adjust-section-title" }, globalTitle),
                react.createElement("p", { className: "lyrics-sync-adjust-section-desc" }, I18n.t("syncAdjust.globalInfo")),
                globalControls
              )
              : globalControls
          )
        )
      )
    : null;

  return react.createElement(
    react.Fragment,
    null,
    react.createElement(
      Spicetify.ReactComponent.TooltipWrapper,
      { label: modalTitle, showDelay: 0 },
      react.createElement(
        "button",
        {
          ref: triggerRef,
          type: "button",
          className: "lyrics-config-button lyrics-global-sync-button",
          onClick: () => setIsOpen((prev) => !prev),
          "aria-label": modalTitle,
          "aria-expanded": isOpen,
        },
        react.createElement(IvLyricsToolbarIcon, { name: "globalSync" })
      )
    ),
    modalOverlay && reactDom?.createPortal
      ? reactDom.createPortal(modalOverlay, document.body)
      : modalOverlay
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
    overlayClassName: "community-video-overlay",
    shellClassName: "community-video-modal-shell",
    shellStyle: `
      max-width: 90vw;
      height: min(70vh, 760px);
      max-height: 70vh;
      width: 560px;
    `,
    removeExisting: false,
    render: (closeModal) =>
      react.createElement(CommunityVideoSelector, {
        trackUri: trackUri,
        currentVideoId: currentVideoId,
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

// Community Video Selector Button
const CommunityVideoButton = react.memo(({ trackUri, videoInfo, onVideoSelect, defaultStartTime = 0, enabled = CONFIG.visual["video-background"] }) => {
  // 비디오 배경이 비활성화되어 있으면 버튼 숨김
  if (!enabled) {
    return null;
  }

  const handleClick = () => {
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

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("communityVideo.selectVideo"), showDelay: 0 },
    react.createElement(
      "button",
      {
        className: "lyrics-config-button",
        onClick: handleClick,
        "aria-label": I18n.t("communityVideo.selectVideo"),
      },
      react.createElement(IvLyricsToolbarIcon, { name: "communityVideo" })
    )
  );
});

const SettingsMenu = react.memo(() => {
  const openSettings = () => {
    openConfig();
  };

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("menu.settings"), showDelay: 0 },
    react.createElement(
      "button",
      {
        className: "lyrics-config-button",
        onClick: openSettings,
        "aria-label": I18n.t("menu.settings"),
      },
      react.createElement(IvLyricsToolbarIcon, { name: "settings" })
    )
  );
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
    section('lyrics', '가사'),
    checkbox('showPronunciation', '발음'),
    checkbox('showTranslation', '번역'),
    choice('lyricsAlign', '가사 정렬', [
      ['left', labelText('alignLeft', '왼쪽')], ['center', labelText('alignCenter', '가운데')]
    ]),
    range('fontSize', '글꼴 크기', 32, 20, 48),
    range('blockGap', '줄 간격', 32, 16, 60),
    section('layout', '레이아웃'),
    choice('aspectRatio', '이미지 비율', [[null, '자동'], [1, '1:1'], [9 / 16, '9:16'], [16 / 9, '16:9']], true),
    range('imageWidth', '이미지 너비', 1080, 720, 1920, { step: 60 }),
    range('padding', '여백', 60, 30, 100),
    section('other', '기타'),
    checkbox('showWatermark', '워터마크 표시', true)
  ];
};

// Share Lyrics Image Modal Component
const ShareImageModal = ({ lyrics, trackInfo, onClose }) => {
  const [selectedIndices, setSelectedIndices] = react.useState([]);
  const [template, setTemplate] = react.useState('cover');
  const [previewUrl, setPreviewUrl] = react.useState(null);
  const [isGenerating, setIsGenerating] = react.useState(false);
  const [showAdvanced, setShowAdvanced] = react.useState(false);
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
  const selectedLines = react.useMemo(() => {
    return selectedIndices.map((idx) => normalizedLyricsByIdx.get(idx)).filter(Boolean);
  }, [selectedIndices, normalizedLyricsByIdx]);

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
          width: '45%',
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

      // Right: Preview & Options
      react.createElement("div", {
        className: "share-image-modal-config-pane",
        style: {
          width: '55%',
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

        // Advanced settings toggle
        react.createElement("button", {
          className: "share-image-advanced-toggle",
          onClick: () => setShowAdvanced(!showAdvanced),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 0',
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '12px',
            cursor: 'pointer',
            marginBottom: showAdvanced ? '12px' : '0',
          }
        },
          react.createElement(
            "svg",
            {
              width: 12,
              height: 12,
              viewBox: "0 0 12 12",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.8,
              style: {
                transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }
            },
            react.createElement("path", { d: "M4 2.5 7.5 6 4 9.5" })
          ),
          I18n.t("shareImage.advancedSettings") || "세부 설정"
        ),

        // Advanced settings panel
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
            maxHeight: '320px',
            overflowY: 'auto',
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }
        },
          ...renderShareImageControls(currentSettings, updateSetting)
        ),

        // Preview
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
    shellClassName: "share-image-modal-shell",
    shellStyle: `
      width: 90%;
      max-width: 900px;
      max-height: 85vh;
    `,
    render: (closeModal) =>
      react.createElement(ShareImageModal, {
        lyrics,
        trackInfo,
        onClose: closeModal,
      }),
  });
}

// Share Image Button
const ShareImageButton = react.memo(({ lyrics, trackInfo }) => {
  const handleClick = () => {
    if (!lyrics || lyrics.length === 0) {
      Toast.error(I18n.t("notifications.shareImageNoLyrics"));
      return;
    }
    openShareImageModal(lyrics, trackInfo);
  };

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("menu.shareImage"), showDelay: 0 },
    react.createElement(
      "button",
      {
        className: "lyrics-config-button",
        onClick: handleClick,
        "aria-label": I18n.t("menu.shareImage"),
      },
      react.createElement(IvLyricsToolbarIcon, { name: "shareImage" })
    )
  );
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
    trackInfo: trackInfo,
    initialData: initialData,
    onClose: closeModal
  });

  dom.render(creatorComponent, overlay);
}

// Sync Data Creator Button
const SyncDataCreatorButton = react.memo(({ trackInfo, showHint, isFullscreen = false }) => {
  const wrapperRef = react.useRef(null);
  const [hintPosition, setHintPosition] = react.useState(null);
  const reactDom = resolveOptionsReactDom();
  const hasTrackId = !!Utils.extractTrackId(trackInfo?.uri);
  const disabledTooltip = I18n.t("syncCreator.trackIdRequired") || "Spotify trackId가 없는 로컬 곡은 노래방 싱크를 등록할 수 없습니다.";

  const updateHintPosition = react.useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      setHintPosition(null);
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    setHintPosition({
      left: rect.left - 10,
      top: rect.top + (rect.height / 2)
    });
  }, []);

  react.useEffect(() => {
    if (!showHint) {
      setHintPosition(null);
      return undefined;
    }

    updateHintPosition();
    const rafId = requestAnimationFrame(updateHintPosition);

    window.addEventListener("resize", updateHintPosition);
    document.addEventListener("scroll", updateHintPosition, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateHintPosition);
      document.removeEventListener("scroll", updateHintPosition, true);
    };
  }, [showHint, isFullscreen, updateHintPosition]);

  const handleClick = () => {
    if (!hasTrackId) {
      Toast.error(disabledTooltip);
      return;
    }
    void openSyncDataCreator(trackInfo, null);
  };
  const hintText = I18n.t("syncCreator.clickHereHint") || "";
  const canPortalHint = !!reactDom?.createPortal;
  const inlineHint = showHint && !canPortalHint
    ? react.createElement("div", {
      className: `sync-creator-hint${isFullscreen ? " is-fullscreen" : ""}`,
    }, hintText)
    : null;
  const portalHint = showHint && canPortalHint && hintPosition
    ? reactDom.createPortal(
      react.createElement("div", {
        className: `sync-creator-hint sync-creator-hint--portal${isFullscreen ? " is-fullscreen" : ""}`,
        style: {
          "--sync-creator-hint-left": `${hintPosition.left}px`,
          "--sync-creator-hint-top": `${hintPosition.top}px`
        },
        "aria-hidden": "true"
      }, hintText),
      document.body
    )
    : null;

  return react.createElement(
    react.Fragment,
    null,
    react.createElement(
      "div",
      {
        className: "sync-creator-button-wrapper",
        ref: wrapperRef,
        style: { position: "relative", display: "inline-flex", alignItems: "center" }
      },
      inlineHint,
    react.createElement(
      Spicetify.ReactComponent.TooltipWrapper,
      { label: hasTrackId ? (I18n.t("syncCreator.buttonTooltip") || "Create Karaoke Sync") : disabledTooltip, showDelay: 0 },
      react.createElement(
        "button",
        {
        className: `lyrics-config-button${hasTrackId ? "" : " disabled"}`,
          onClick: handleClick,
          disabled: !hasTrackId,
          "aria-label": hasTrackId
            ? (I18n.t("syncCreator.buttonTooltip") || "Create Karaoke Sync")
            : disabledTooltip,
        },
        react.createElement(IvLyricsToolbarIcon, { name: "syncCreator" })
      )
    ),
    ),
    portalHint
  );
});

// 전역으로 노출
window.openSyncDataCreator = openSyncDataCreator;
window.SyncDataCreatorButton = SyncDataCreatorButton;
