import { readSettingsPersistence } from "../../core/settingsRuntime.mjs";
import { getKeyboardShortcutChord, getPrimaryKeyboardModifier } from "../../core/keyboardShortcut.mjs";
import { getMountedLyricsPage, LYRICS_PAGE_READY_EVENT } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { getSettingsModalOpen } from "#ivlyrics/features/settings/settingsModalHost.mjs";
import { isIvLyricsRoute } from "#ivlyrics/spicetify/lyricsRoute.mjs";
import { getRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { createFullscreenNavigation } from "./fullscreenNavigation.mjs";
import { createFullscreenShortcutActions } from "./fullscreenShortcutActions.mjs";
import { createFullscreenShortcutBindings } from "./fullscreenShortcutBindings.mjs";
import {
    FULLSCREEN_SHORTCUT, TV_SHORTCUT, FULLSCREEN_SHORTCUT_DEFAULTS, createFullscreenShortcutPreferences,
} from "./fullscreenShortcutSettings.mjs";

const VISUAL_PREFIX = "ivLyrics:visual:";

export default function GlobalShortcuts() {
    const host = window;
    if (host.__ivLyricsGlobalShortcuts?.navigationInstalled) return;
    const state = host.__ivLyricsGlobalShortcuts = { navigationInstalled: true, initialized: false };

    const readSpicetify = () => host.Spicetify;
    const getHistory = () => readSpicetify()?.Platform?.History;
    const getStorage = () => readSettingsPersistence(host) ?? readSpicetify()?.LocalStorage;
    const getPage = () => getMountedLyricsPage(host);
    const isOnLyricsPage = () => isIvLyricsRoute(getHistory()?.location?.pathname);
    const readSetting = (name) => {
        const key = VISUAL_PREFIX + name;
        const persistence = readSettingsPersistence(host);
        return persistence ? persistence.getItem(key) : readSpicetify()?.LocalStorage?.get(key);
    };
    const writeSetting = (name, value) => {
        const key = VISUAL_PREFIX + name;
        const persistence = readSettingsPersistence(host);
        if (persistence) persistence.setItem(key, value);
        else readSpicetify()?.LocalStorage?.set(key, value);
    };

    const navigation = createFullscreenNavigation({
        getHistory, getPage,
        setPreviousPath: path => { host._ivLyricsPreviousPath = path; },
    });
    const actions = createFullscreenShortcutActions({
        document, getPage, isOnLyricsPage, readSetting, writeSetting,
        getSettingsOpen: () => getSettingsModalOpen(host),
        getVisualSettings: () => getRuntimeService("CONFIG", host)?.visual,
        publishChange: detail => host.dispatchEvent(new CustomEvent("ivLyrics", { detail })),
        onOrphanedFullscreen: () => host.dispatchEvent(new CustomEvent("ivLyrics:fullscreen-closed")),
        debug: (...args) => console.debug(...args),
    });
    const bindings = createFullscreenShortcutBindings({
        primaryModifier: getPrimaryKeyboardModifier(host.navigator?.platform),
    });
    const preferences = createFullscreenShortcutPreferences({ getStorage, readSetting, configure: bindings.configure });

    let observedHistory;
    let unlistenHistory;
    let cleanupTimer;
    function cleanupOrphanedFullscreen() {
        const pathname = getHistory()?.location?.pathname;
        if (pathname && !isIvLyricsRoute(pathname)) actions.cleanupOrphanedFullscreen();
    }
    function scheduleOrphanCleanup(delay) {
        if (cleanupTimer != null) clearTimeout(cleanupTimer);
        cleanupTimer = setTimeout(() => {
            cleanupTimer = null;
            cleanupOrphanedFullscreen();
        }, delay);
    }
    function bindHistory() {
        const history = getHistory();
        // Treat a History object without a listener as unavailable until it is initialized.
        const nextHistory = typeof history?.listen === "function" ? history : undefined;
        if (observedHistory === nextHistory) return;
        const unsubscribe = unlistenHistory;
        observedHistory = nextHistory;
        unlistenHistory = undefined;
        unsubscribe?.();
        if (!nextHistory) return;
        navigation.onRouteChange(nextHistory.location?.pathname);
        const release = nextHistory.listen((change) => {
            if (observedHistory !== nextHistory || getHistory() !== nextHistory) return;
            bindings.reset();
            navigation.onRouteChange(change?.pathname ?? change?.location?.pathname ?? nextHistory.location?.pathname);
            scheduleOrphanCleanup(100);
        });
        if (typeof release === "function") unlistenHistory = release;
    }

    function toggleFullscreen() {
        bindHistory();
        return navigation.toggleFromPlaybarOrShortcut();
    }

    function handleKeyDown(event) {
        preferences.refreshIfChanged();
        if (actions.ignoreShortcut(event)) {
            if (!event.repeat) bindings.reset();
            return;
        }
        const chord = getKeyboardShortcutChord(event);
        if (!chord) return;
        const pageShortcut = actions.readPageShortcut(event);
        if ((!bindings.includes(chord) && !pageShortcut) || actions.hasOpenDialog()) {
            bindings.reset();
            return;
        }
        const fullscreen = actions.isFullscreen();
        const shortcut = bindings.match(chord, fullscreen);
        if (shortcut === TV_SHORTCUT) actions.toggleTvMode();
        else if (shortcut === FULLSCREEN_SHORTCUT) {
            if (!toggleFullscreen()) return;
        } else if (bindings.hasPartialMatch() || !actions.handlePageShortcut(pageShortcut, fullscreen)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function refresh() {
        bindHistory();
        bindings.reset();
        preferences.sync();
        cleanupOrphanedFullscreen();
    }

    host.addEventListener("ivLyrics:fullscreen-closed", navigation.goBackToPreviousPage);
    host.addEventListener(LYRICS_PAGE_READY_EVENT, (event) => {
        bindHistory();
        navigation.onPageReady(event.detail);
    });
    host.addEventListener("ivLyrics", (event) => {
        if (event.detail?.type === "fullscreen-toggle") toggleFullscreen();
        if (Object.hasOwn(FULLSCREEN_SHORTCUT_DEFAULTS, event.detail?.name)) preferences.sync();
    });
    host.addEventListener("storage", (event) => {
        if (event.key === null || (event.key?.startsWith(VISUAL_PREFIX)
            && Object.hasOwn(FULLSCREEN_SHORTCUT_DEFAULTS, event.key.slice(VISUAL_PREFIX.length)))) refresh();
    });
    host.addEventListener("focus", refresh);
    host.addEventListener("blur", bindings.reset);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refresh();
        else bindings.reset();
    });
    document.addEventListener("keydown", handleKeyDown, true);
    preferences.sync();
    state.initialized = true;
    scheduleOrphanCleanup(500);

    let retryDelay = 100;
    function waitForHistory() {
        bindHistory();
        if (observedHistory) return;
        setTimeout(waitForHistory, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 2000);
    }
    waitForHistory();
}
