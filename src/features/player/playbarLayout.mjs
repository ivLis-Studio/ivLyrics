const LEGACY_RIGHT = ".main-nowPlayingBar-right";
const PLAYER_CONTROLS = '[data-testid="now-playing-bar"] [data-testid="player-controls"]';
const DISCOVERY_SELECTOR = `${LEGACY_RIGHT}, ${PLAYER_CONTROLS}`;

export function findPlaybarLayout(document) {
    const legacyRight = document.querySelector(LEGACY_RIGHT);
    if (legacyRight) return { anchor: legacyRight, right: legacyRight };

    // The current Spotify layout exposes the center column's controls and
    // places its right column last in the same row.
    const center = document.querySelector(PLAYER_CONTROLS)?.parentElement;
    const row = center?.parentElement;
    const last = row?.children[row.children.length - 1];
    const right = last && last !== center ? last : null;
    return { anchor: right || row || null, right };
}

export function findPlaybarControlContainer(right) {
    return Array.from(right?.children || []).find(node => node.tagName === "DIV") ?? null;
}

export function observePlaybarLayout({
    document, createObserver, anchor, container, hasMissingControl, onLayoutChange,
}) {
    const ancestors = [];
    let active = true;
    const observer = createObserver((records) => {
        if (!active) return;
        if (!anchor) {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1 && (node.matches(DISCOVERY_SELECTOR) || node.querySelector(DISCOVERY_SELECTOR))) {
                        onLayoutChange(true);
                        return;
                    }
                }
            }
            return;
        }

        const moved = ancestors.some((node, index) => node.parentElement !== (ancestors[index + 1] || null));
        if (moved || !anchor.isConnected) onLayoutChange(true);
        else if (records.some(record => record.target === anchor) || hasMissingControl()) onLayoutChange(false);
    });
    if (!anchor) {
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } else {
        if (container) observer.observe(container, { childList: true });
        // Track the row and its ancestors even while the right column is still
        // missing. This also catches a footer moved into a different layout.
        for (let node = anchor; node; node = node.parentElement) {
            ancestors.push(node);
            observer.observe(node, { childList: true });
        }
    }
    return () => {
        active = false;
        observer.disconnect();
    };
}
