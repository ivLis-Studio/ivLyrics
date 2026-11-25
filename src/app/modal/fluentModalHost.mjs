import { getSettingsSurfaceTokenCss } from "../../features/settings/settingsSurfaceTokens.mjs";
import { getSettingsSurfaceTheme } from "../../features/settings/settingsSurfaceTheme.mjs";
import { canMountReactDom, createReactDomMount, createReactMountBoundary } from "../../spicetify/routeReactDom.mjs";
import { FLUENT_MODAL_CSS } from "./fluentModalStyles.mjs";

export function createFluentModalHost({
  overlayId,
  overlayClassName = "",
  shellId,
  shellClassName = "",
  shellStyle = "",
  mountNode = document.body,
  removeExisting = true,
  modal = true,
  closeOnBackdrop = modal,
  trapFocus = modal,
  autoFocus = modal,
  deferOpen = false,
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
  if (shellId) shell.id = shellId;
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
  let closeTimer = null;
  const lifetime = new AbortController();

  const finalizeClose = () => {
    closeTimer = null;
    const restoreFocus = modal || shell.contains(document.activeElement);
    document.removeEventListener("keydown", handleKeydown, true);
    try {
      onBeforeClose?.();
    } finally {
      overlay.remove();
      if (restoreFocus && previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    }
  };

  const closeModal = (immediate = false) => {
    if (isClosed) {
      if (immediate === true && closeTimer !== null) {
        window.clearTimeout(closeTimer);
        finalizeClose();
      }
      return;
    }
    isClosed = true;
    lifetime.abort();
    overlay.classList.remove("is-open");
    overlay.classList.add("is-closing");
    overlay.setAttribute("aria-hidden", "true");

    if (immediate === true || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      finalizeClose();
      return;
    }

    closeTimer = window.setTimeout(finalizeClose, 180);
  };

  const getFocusableElements = () => Array.from(shell.querySelectorAll(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
  )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && !element.closest?.("[inert]"));

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

  const show = () => {
    window.requestAnimationFrame(() => {
      if (isClosed || !overlay.isConnected) return;
      overlay.classList.add("is-open");
      if (!autoFocus) return;
      const focusTarget = shell.querySelector(
        ".ivlyrics-fluent-close, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      (focusTarget ?? shell).focus?.();
    });
  };
  if (!deferOpen) show();

  return { overlay, shell, closeModal, show, signal: lifetime.signal };
}

export function openFluentReactModal({ react, render, ...hostOptions }) {
  const spicetifyRenderer = window.Spicetify?.ReactDOM;
  const renderer = canMountReactDom(spicetifyRenderer) ? spicetifyRenderer : window.ReactDOM;
  if (!canMountReactDom(renderer)) return null;

  let mount;
  const host = createFluentModalHost({
    ...hostOptions,
    deferOpen: true,
    onBeforeClose: () => mount?.unmount(),
  });
  try {
    mount = createReactDomMount(renderer, host.shell);
    const content = render(host.closeModal, host.signal);
    if (mount.waitsForCommit) {
      const Boundary = createReactMountBoundary(react);
      const onError = error => {
        console.error("[ivLyrics] Dialog render failed:", error);
        window.setTimeout(() => host.closeModal(true), 0);
      };
      mount.render(react.createElement(Boundary, { onCommit: host.show, onError }, content));
    } else {
      mount.render(content);
      host.show();
    }
  } catch (error) {
    try {
      host.closeModal(true);
    } catch (cleanupError) {
      console.error("[ivLyrics] Failed to close the dialog:", cleanupError);
    }
    throw error;
  }
  return host.closeModal;
}

function ensureFluentModalStyles() {
  if (document.getElementById("ivLyrics-fluent-modal-styles")) return;

  const style = document.createElement("style");
  style.id = "ivLyrics-fluent-modal-styles";
  style.textContent = FLUENT_MODAL_CSS + getSettingsSurfaceTokenCss(".ivlyrics-first-language-shell");
  document.head.appendChild(style);
}
