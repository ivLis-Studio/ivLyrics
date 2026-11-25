const OVERLAY_ID = "lyrics-fullscreen-container";
const LYRICS_CONTAINER = ".lyrics-lyricsContainer-LyricsContainer";
const FULLSCREEN_CONTAINER = LYRICS_CONTAINER + ".fullscreen-active";
const TV_MODE_SETTING = "fullscreen-tv-mode";
const PRESENTATIONS = Object.freeze({
    "1": "standard",
    "2": "compact-vinyl",
    "3": "vinyl",
    "4": "video",
    "5": "motion",
});
const DIALOGS = [
    "#ivLyrics-settings-overlay",
    "#ivLyrics-sync-creator-overlay",
    '.ivlyrics-fluent-overlay:not([aria-hidden="true"])',
    '.lyrics-sync-adjust-floating [role="dialog"]',
    ".community-video-overlay",
    ".ivlyrics-cache-edit-overlay",
    ".notice-modal-overlay",
    ".ivlyrics-marketplace-confirm-overlay",
    ".confirm-dialog-overlay",
    ".ivLyrics-update-banner",
    ".ivlyrics-study-panel",
].join(", ");

function isEditableElement(element) {
    const tag = element?.tagName?.toLowerCase();
    const role = element?.getAttribute?.("role");
    return tag === "input" || tag === "textarea" || tag === "select"
        || element?.isContentEditable || role === "textbox" || role === "combobox"
        || !!element?.closest?.('[role="textbox"], [role="combobox"]');
}

function getPresentation(event) {
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(event.code)?.[1];
    if (digit) return PRESENTATIONS[digit];
    return /^[1-5]$/.test(event.key) ? PRESENTATIONS[event.key] : null;
}

export function createFullscreenShortcutActions({
    document, getPage, isOnLyricsPage, getSettingsOpen, readSetting, writeSetting,
    getVisualSettings, publishChange, onOrphanedFullscreen, debug,
}) {
    const getFullscreenOverlay = () => document.getElementById(OVERLAY_ID);
    const isFullscreen = () => {
        const active = getPage()?.state?.isFullscreen;
        if (typeof active === "boolean") return active;
        return Boolean(getFullscreenOverlay() || document.querySelector(FULLSCREEN_CONTAINER));
    };
    const isTvMode = () => {
        const value = readSetting(TV_MODE_SETTING);
        return value === true || value === "true";
    };
    const ignoreShortcut = (event) => event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.getModifierState?.("AltGraph")
        || isEditableElement(event.composedPath?.()[0] ?? event.target) || isEditableElement(document.activeElement);
    const hasOpenDialog = () => !!document.querySelector(DIALOGS);

    function setTvMode(value) {
        writeSetting(TV_MODE_SETTING, String(value));
        const visual = getVisualSettings();
        if (visual) visual[TV_MODE_SETTING] = value;
        publishChange({ name: TV_MODE_SETTING, value });
        getPage()?.forceUpdate?.();
        const container = getFullscreenOverlay()?.querySelector(LYRICS_CONTAINER)
            || document.querySelector(FULLSCREEN_CONTAINER);
        container?.classList.toggle("tv-mode-active", value);
    }

    function readPageShortcut(event) {
        if (event.metaKey || event.ctrlKey || event.altKey) return null;
        const key = String(event.key || "").toLowerCase();
        if (event.code === "KeyL" || key === "l") return "lyrics-visibility";
        if (event.shiftKey) return null;
        const settingsKey = event.code === "KeyS" || key === "s";
        return settingsKey ? "settings" : getPresentation(event);
    }

    function handlePageShortcut(shortcut, fullscreen) {
        if (shortcut === "settings") {
            if (!isOnLyricsPage() && !fullscreen) return false;
            const open = getSettingsOpen();
            if (typeof open !== "function") return false;
            open();
            return true;
        }
        if (!shortcut || !fullscreen) return false;
        if (shortcut === "lyrics-visibility") {
            const page = getPage();
            if (typeof page?.toggleFullscreenLyricsHidden !== "function") return false;
            page.toggleFullscreenLyricsHidden();
            return true;
        }
        try {
            if (isTvMode()) setTvMode(false);
        } catch (error) {
            debug("[ivLyrics] Failed to leave TV mode for presentation shortcut:", error);
        }
        publishChange({ type: "fullscreen-presentation", value: shortcut, source: "keyboard" });
        return true;
    }

    function cleanupOrphanedFullscreen() {
        const page = getPage();
        if (page?.fullscreenController?.close?.({ immediate: true })) return;
        const overlay = getFullscreenOverlay();
        if (!overlay) return;
        document.body?.classList.remove("ivlyrics-fullscreen-active");
        overlay.remove();
        const pageState = page?.state;
        if (pageState) pageState.isFullscreen = false;
        onOrphanedFullscreen();
    }

    return {
        isFullscreen, toggleTvMode: () => setTvMode(!isTvMode()), ignoreShortcut, hasOpenDialog,
        readPageShortcut, handlePageShortcut, cleanupOrphanedFullscreen,
    };
}
