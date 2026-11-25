import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { takeSettingsReturn } from "../../spicetify/routeReload.mjs";
import { canMountReactDom, createReactDomMount } from "../../spicetify/routeReactDom.mjs";
import { getMountedLyricsPage, LYRICS_PAGE_READY_EVENT } from "../../spicetify/lyricsPageEffects.mjs";
import { getRecordingHotkeyControl } from "./settingsHotkeyControls.mjs";
import { discardFocusedSettingsTextDraft } from "./settingsTextDraft.mjs";

const OPEN_SERVICE = "ivLyricsOpenConfig";
const CLOSE_SERVICE = "ivLyricsCloseConfig";
const OVERLAY_ID = "ivLyrics-settings-overlay";
const OPEN_CLASS = "ivlyrics-settings-open";
const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const INITIAL_FOCUS_SELECTOR = '.settings-close-btn, button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const getSettingsModalOpen = (host) => getRuntimeService(OPEN_SERVICE, host);
export const getSettingsModalClose = (host) => getRuntimeService(CLOSE_SERVICE, host);

export function registerSettingsModalOpen(host, open) {
  publishRuntimeService(OPEN_SERVICE, open, host);
}

export function restoreSettingsOnFirstLyricsMount(host, open) {
  function handlePageReady(event) {
    const page = event.detail;
    if (!page || getMountedLyricsPage(host) !== page) return;
    host.removeEventListener?.(LYRICS_PAGE_READY_EVENT, handlePageReady);
    restoreSettingsModalAfterReload({
      getStorage: () => host.localStorage,
      isDocumentReady: () => Boolean(host.document.body),
      schedule: (callback, delay) => host.setTimeout(callback, delay),
      open: options => {
        if (getMountedLyricsPage(host) === page) open(options);
      },
    });
  }
  host.addEventListener?.(LYRICS_PAGE_READY_EVENT, handlePageReady);
}

export function restoreSettingsModalAfterReload({
  getStorage, isDocumentReady, schedule, open, reportError = console.error,
}) {
  let options;
  try {
    options = takeSettingsReturn(getStorage());
  } catch (error) {
    reportError("[ivLyrics] Failed to restore the settings dialog:", error);
    return;
  }
  if (!options) return;

  function openWhenReady() {
    if (isDocumentReady()) schedule(() => open(options), 500);
    else schedule(openWhenReady, 100);
  }
  openWhenReady();
}

function consumeEscape(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function createEscapeReleaseGuard(host) {
  let timer = null;
  const clear = () => {
    host.removeEventListener("keydown", suppress, true);
    host.removeEventListener("keyup", suppress, true);
    host.clearTimeout(timer);
    timer = null;
  };
  const suppress = (event) => {
    if (event.key !== "Escape") return;
    consumeEscape(event);
    if (event.type === "keyup") clear();
  };

  return () => {
    if (timer !== null) return;
    host.addEventListener("keydown", suppress, true);
    host.addEventListener("keyup", suppress, true);
    timer = host.setTimeout(clear, 1500);
  };
}

function restoreFieldValue(host, field) {
  if (discardFocusedSettingsTextDraft(field)) return;
  const before = field.dataset?.ivBefore;
  if (before !== undefined && field.value !== before) {
    const fieldType = field.tagName === "TEXTAREA" ? host.HTMLTextAreaElement : host.HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(fieldType.prototype, "value")?.set;
    if (setValue) setValue.call(field, before);
    else field.value = before;
    field.dispatchEvent(new host.Event("input", { bubbles: true }));
  }
  field.blur();
}

function trapTabFocus(document, shell, event) {
  const focusable = Array.from(shell.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) {
    event.preventDefault();
    shell.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  const from = event.shiftKey ? first : last;
  if (document.activeElement === from) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function bindModalKeyboard(host, shell, close, isEditableField) {
  const guardEscapeUntilRelease = createEscapeReleaseGuard(host);
  const onKeydown = (event) => {
    if (event.key === "Tab") {
      if (!getRecordingHotkeyControl(event)) trapTabFocus(host.document, shell, event);
      return;
    }
    if (event.key !== "Escape") return;

    // The release guard outlives a closed dialog so one press cannot also
    // escape Spotify fullscreen. Let a hotkey recorder see the initial press.
    guardEscapeUntilRelease();
    if (getRecordingHotkeyControl(event)) return;
    consumeEscape(event);

    const search = event.target?.closest?.(".settings-search-input");
    if (search?.value) {
      search.closest(".settings-search-wrapper")?.querySelector(".settings-search-clear")?.click();
    } else if (isEditableField(event.target)) {
      restoreFieldValue(host, event.target);
    } else {
      close(true);
    }
  };

  host.addEventListener("keydown", onKeydown, true);
  return () => host.removeEventListener("keydown", onKeydown, true);
}

export function mountSettingsModal({
  host, getRenderer, renderContent, isReducedMotion, getCloseDuration, isEditableField,
}) {
  const { document } = host;
  if (document.getElementById(OVERLAY_ID)) return;
  const dom = getRenderer();
  if (!canMountReactDom(dom)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "ivlyrics-settings-overlay is-entering";
  if (isReducedMotion()) overlay.classList.add("motion-reduced");

  const shell = document.createElement("div");
  shell.className = "ivlyrics-settings-modal-shell";
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-modal", "true");
  shell.setAttribute("aria-label", "ivLyrics Settings");
  shell.tabIndex = -1;
  overlay.appendChild(shell);

  const focused = document.activeElement;
  const previouslyFocused = focused instanceof host.HTMLElement ? focused : null;
  const setVisible = (open) => {
    document.documentElement.classList.toggle(OPEN_CLASS, open);
    document.body?.classList.toggle(OPEN_CLASS, open);
    host.dispatchEvent(new host.CustomEvent("ivLyrics:settings-visibility", { detail: { open } }));
  };

  let isClosing = false;
  let closeTimer = null;
  let mount;
  const finalizeClose = () => {
    isClosing = true;
    if (closeTimer !== null) {
      host.clearTimeout(closeTimer);
      closeTimer = null;
    }
    try {
      mount?.unmount();
    } finally {
      overlay.remove();
      removeKeyboard();
      if (getSettingsModalClose(host) === close) {
        publishRuntimeService(CLOSE_SERVICE, null, host);
      }
      setVisible(false);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    }
  };
  const close = (immediate = false) => {
    if (isClosing) return;
    isClosing = true;
    overlay.classList.remove("is-open", "is-entering");
    overlay.classList.add("is-closing");
    if (immediate === true || isReducedMotion()) finalizeClose();
    else closeTimer = host.setTimeout(finalizeClose, getCloseDuration());
  };

  const removeKeyboard = bindModalKeyboard(host, shell, close, isEditableField);
  publishRuntimeService(CLOSE_SERVICE, close, host);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.body.appendChild(overlay);
  setVisible(true);
  if (isClosing) return;

  let openingScheduled = false;
  const onContentReady = () => {
    if (isClosing || openingScheduled) return;
    openingScheduled = true;
    const open = () => {
      if (isClosing || !overlay.isConnected) return;
      overlay.classList.remove("is-entering");
      overlay.classList.add("is-open");
      (shell.querySelector(INITIAL_FOCUS_SELECTOR) ?? shell).focus?.();
    };
    // Spotify can restore settings while its webview is hidden and not painting.
    if (document.hidden) open();
    else host.requestAnimationFrame(open);
  };
  const onContentError = (error) => {
    console.error("[ivLyrics] Failed to render the settings dialog:", error);
    // Error boundaries notify during commit. Close outside that commit so
    // React can unmount the root before the host removes its container.
    host.setTimeout(() => close(true), 0);
  };

  try {
    mount = createReactDomMount(dom, shell);
    mount.render(renderContent(close, onContentReady, mount.waitsForCommit ? onContentError : null));
    if (!mount.waitsForCommit) onContentReady();
  } catch (error) {
    if (overlay.isConnected) {
      try {
        finalizeClose();
      } catch {
        // Report the original render failure even if React cleanup also fails.
      }
    }
    throw error;
  }
}
