export const LYRIC_PRESENTATION_OWNER_RELEASED = "ivLyrics:presentation-owner-released";

const panelOwnersKey = Symbol.for("ivLyrics.panelLyricPresentationOwners");

export function notifyLyricPresentationOwnerReleased(host, source, trackUri) {
    const EventConstructor = host.CustomEvent || globalThis.CustomEvent;
    if (typeof EventConstructor !== "function") return;
    host.dispatchEvent(new EventConstructor(LYRIC_PRESENTATION_OWNER_RELEASED, { detail: { source, trackUri } }));
}

export function registerPanelLyricPresentationOwner(host, readTrackUri) {
    const owners = host[panelOwnersKey] ??= new Set();
    const owner = { readTrackUri };
    owners.add(owner);
    return () => {
        if (!owners.delete(owner)) return;
        if (owners.size === 0) delete host[panelOwnersKey];
        notifyLyricPresentationOwnerReleased(host, "now-playing-panel", readTrackUri());
    };
}

export function hasPanelLyricPresentationOwner(host, trackUri) {
    const owners = host[panelOwnersKey];
    if (!trackUri || !owners) return false;
    for (const owner of owners) {
        if (owner.readTrackUri() === trackUri) return true;
    }
    return false;
}
