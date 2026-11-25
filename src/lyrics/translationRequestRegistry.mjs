import { supersededAiRequest } from "../providers/ai/aiRequestCancellation.mjs";
import { createTrackRevisions } from "../core/trackRevisions.mjs";
import { createTranslationStream } from "./translationStream.mjs";

export function createTranslationRequestRegistry() {
    const pending = new Map();
    const { getRevision, invalidate } = createTrackRevisions();

    function run(trackId, type, identity, { refresh, streamUpdates = false, observer }, execute) {
        const key = JSON.stringify([trackId, type, ...identity]);
        const existing = pending.get(key);
        if (!refresh && existing) {
            existing.stream?.subscribe(observer);
            return existing.promise;
        }

        let resolve, reject;
        const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
        const controller = new AbortController();
        const isCurrent = () => pending.get(key) === request;
        const stream = streamUpdates ? createTranslationStream(isCurrent) : null;
        const request = {
            trackId, type, promise, stream,
            retire() {
                stream?.close();
                resolve(null);
                controller.abort(supersededAiRequest());
            },
        };
        pending.set(key, request);
        stream?.subscribe(observer);
        existing?.retire();

        const settle = (finish) => (value) => {
            if (!isCurrent()) return;
            pending.delete(key);
            stream?.close();
            finish(value);
        };
        // Register first for synchronous provider callbacks and re-entrant refreshes.
        const executeOwned = async () => {
            if (isCurrent()) return execute(isCurrent, controller.signal, stream);
        };
        executeOwned().then(settle(resolve), settle(reject));
        return promise;
    }

    function clear(trackId = null, type = null) {
        if (!type) invalidate(trackId);
        const retired = [];
        for (const [key, request] of pending) {
            if ((trackId && request.trackId !== trackId) || (type && request.type !== type)) continue;
            pending.delete(key);
            retired.push(request);
        }
        for (const request of retired) request.retire();
    }

    return { run, clear, getRevision };
}
