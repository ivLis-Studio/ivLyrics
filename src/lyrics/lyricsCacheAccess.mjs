import { createTrackRevisions } from "../core/trackRevisions.mjs";
import { getLocalTrackUriFromCacheId } from "../core/trackIdentity.mjs";

const scopeKey = trackId => getLocalTrackUriFromCacheId(trackId) || trackId;
const createScope = () => ({ ...createTrackRevisions(), clears: new Map() });

export function createLyricsCacheAccess() {
    const track = createScope();
    const translation = createScope();
    const word = createScope();
    const cultural = createScope();
    const sync = createScope();
    const scopes = {
        track, translation, word, cultural, sync,
    };
    const recordScopes = {
        translation: [track, translation],
        phonetic: [track, translation],
        motion: [track, translation],
        word: [track, translation, word],
        cultural: [track, translation, cultural],
        sync: [track, sync],
    };
    const trackScope = [track];
    let clearQueue = Promise.resolve();

    function capture(trackId, type) {
        const key = scopeKey(trackId);
        const owners = recordScopes[type] || trackScope;
        const revisions = owners.map(owner => owner.getRevision(key));
        const clears = owners.flatMap(owner =>
            [owner.clears.get(null), owner.clears.get(key)].filter(Boolean));
        return {
            isCurrent: () => owners.every((owner, index) => owner.getRevision(key) === revisions[index]),
            pendingClear: clears.length ? Promise.all(clears) : null,
        };
    }

    function clear(trackId, type, remove) {
        const key = scopeKey(trackId);
        const scope = scopes[type];
        scope.invalidate(key);
        if (type === "track") translation.invalidate(key);
        // Preserve the order of overlapping clears, including video fallback
        // markers written for a single track.
        const result = clearQueue.then(remove);
        const pending = result.catch(() => {}).finally(() => {
            if (scope.clears.get(key) === pending) scope.clears.delete(key);
        });
        clearQueue = pending;
        scope.clears.set(key, pending);
        return result;
    }

    return {
        capture, clear,
        getRevision: trackId => track.getRevision(scopeKey(trackId)),
        getTranslationRevision: trackId => translation.getRevision(scopeKey(trackId)),
    };
}
