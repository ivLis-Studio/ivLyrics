import { createReactDomMount } from "../spicetify/routeReactDom.mjs";
import { NOW_PLAYING_PANEL_DISCOVERY_SELECTOR } from "./nowPlayingPanelPlacement.mjs";

const PLAYING_BAR = ".Root__now-playing-bar";
const THEME_MARKER = ".starrynight-bg-container";
const MOUNT_TARGETS = [NOW_PLAYING_PANEL_DISCOVERY_SELECTOR, PLAYING_BAR, THEME_MARKER].join(", ");
const PANEL_SLOT_MAX_RETRIES = 10;
const PANEL_SLOT_RETRY_DELAY = 150;
const RENDER_CHECK_DELAY = 300;
const MAX_RENDER_ATTEMPTS = 2;

export function createNowPlayingPanelMount({
    document, placement, Observer, getReactDOM, createPanelLyricsElement, injectStyles,
    isIvLyricsPageActive, schedule, cancel, now, debug, reportError,
    containerClass, sectionClass, barContainerClass,
}) {
    let observer = null;
    let pendingInsert = null;
    let mounted = null;
    let panel = null;
    let panelSlotRetryCount = 0;
    let failures = new WeakMap();

    function hasRenderedSection(record) {
        if (!record.section || !record.container.contains(record.section)) {
            record.section = record.container.querySelector(`.${sectionClass}`);
        }
        return Boolean(record.section);
    }

    function clearInsertTimer() {
        if (!pendingInsert) return;
        cancel(pendingInsert.timer);
        pendingInsert = null;
    }

    function scheduleInsertPanelLyrics(delay = 100) {
        const dueAt = now() + delay;
        if (pendingInsert && pendingInsert.dueAt <= dueAt) return;
        clearInsertTimer();
        const entry = { dueAt, timer: null };
        pendingInsert = entry;
        entry.timer = schedule(() => {
            if (pendingInsert !== entry) return;
            pendingInsert = null;
            insertPanelLyrics();
        }, delay);
    }

    function renderFailed(record) {
        if (mounted === record) removePanelLyrics();
        const count = (failures.get(record.target) ?? 0) + 1;
        failures.set(record.target, count);
        if (count < MAX_RENDER_ATTEMPTS || record.kind === "bar") scheduleInsertPanelLyrics();
    }

    function mountLyrics(target, kind, slot) {
        removePanelLyrics();
        injectStyles();
        const container = document.createElement("div");
        container.className = kind === "bar" ? barContainerClass : containerClass;
        if (kind === "bar" || !placement.placePanelContainer(target, container, slot)) {
            target.appendChild(container);
        }
        const record = { target, kind, container, reactMount: null, verifyTimer: null, section: null };
        mounted = record;
        try {
            record.reactMount = createReactDomMount(getReactDOM(), container);
            record.reactMount.render(createPanelLyricsElement());
        } catch (error) {
            reportError("[NowPlayingPanelLyrics] Failed to render:", error);
            renderFailed(record);
            return false;
        }

        record.verifyTimer = schedule(() => {
            if (mounted !== record) return;
            record.verifyTimer = null;
            if (!container.isConnected || !target.contains(container)) {
                removePanelLyrics();
                scheduleInsertPanelLyrics();
            } else if (!hasRenderedSection(record)) {
                renderFailed(record);
            } else {
                failures.delete(target);
            }
        }, RENDER_CHECK_DELAY);
        return true;
    }

    function removePanelLyrics() {
        if (!mounted) return;
        const { container, reactMount, verifyTimer } = mounted;
        mounted = null;
        if (verifyTimer != null) cancel(verifyTimer);
        try {
            // Spotify can remove the parent before delivering the mutation.
            reactMount?.unmount();
        } catch (error) {
            debug("[NowPlayingPanelLyrics] Failed to unmount:", error);
        } finally {
            container.remove();
        }
    }

    function ensureLyrics(target, kind, slot) {
        if (target === mounted?.target && target.contains(mounted.container)) {
            if (mounted.verifyTimer == null && !hasRenderedSection(mounted)) {
                renderFailed(mounted);
                return false;
            }
            if (kind === "panel") placement.ensurePanelContainerPlacement(target, mounted.container);
            return true;
        }
        if ((failures.get(target) ?? 0) >= MAX_RENDER_ATTEMPTS) return false;
        return mountLyrics(target, kind, slot);
    }

    function insertPanelLyrics() {
        if (isIvLyricsPageActive()) {
            removePanelLyrics();
            return;
        }
        const starryNight = Boolean(document.querySelector(THEME_MARKER));
        document.body.classList.toggle("ivlyrics-starrynight-theme", starryNight);
        const bar = starryNight ? document.querySelector(PLAYING_BAR) : null;
        if (bar && ensureLyrics(bar, "bar")) return;

        const nextPanel = placement.findNowPlayingPanel();
        if (panel !== nextPanel) {
            panel = nextPanel;
            panelSlotRetryCount = 0;
        }
        if (!panel || (mounted && (mounted.target !== panel || !mounted.container.isConnected))) {
            removePanelLyrics();
        }
        if (!panel) return;

        const slot = placement.getPanelLyricsSlot(panel);
        if (!mounted && !slot && panelSlotRetryCount < PANEL_SLOT_MAX_RETRIES) {
            panelSlotRetryCount++;
            scheduleInsertPanelLyrics(PANEL_SLOT_RETRY_DELAY);
            return;
        }
        panelSlotRetryCount = 0;
        ensureLyrics(panel, "panel", slot);
    }

    function isPanelMutation(record) {
        if (mounted?.container.contains(record.target)) {
            // Normal lyric commits, changes to the clock and text are local to
            // the mounted React tree. Only its disappearance needs recovery.
            return mounted.verifyTimer == null && !hasRenderedSection(mounted);
        }
        if (record.target && panel?.contains(record.target)) return true;
        for (const list of [record.addedNodes, record.removedNodes]) {
            for (const node of list) {
                if (node.nodeType === 1 && (node.matches(MOUNT_TARGETS) || node.querySelector(MOUNT_TARGETS))) return true;
            }
        }
        return false;
    }

    function setupObserver() {
        if (observer) return;
        const next = new Observer((records) => {
            if (observer !== next) return;
            if ((mounted && !mounted.container.isConnected) || (panel && !panel.isConnected)
                || records.some(isPanelMutation)) scheduleInsertPanelLyrics();
        });
        observer = next;
        next.observe(document.body, { childList: true, subtree: true });
    }

    function teardownObserver() {
        observer?.disconnect();
        observer = null;
        panel = null;
        panelSlotRetryCount = 0;
        failures = new WeakMap();
    }

    function retryFailedMountOnTrackChange() {
        if (mounted || isIvLyricsPageActive()
            || (!panel && !document.body.classList.contains("ivlyrics-starrynight-theme"))) return;
        failures = new WeakMap();
        scheduleInsertPanelLyrics();
    }

    return {
        insertPanelLyrics, removePanelLyrics, scheduleInsertPanelLyrics, clearInsertTimer, setupObserver, teardownObserver,
        retryFailedMountOnTrackChange,
    };
}
