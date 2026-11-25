export function createFullscreenTrackLibrary({ readTrackUri, readLibrary, publish, reportError, pendingWrites = new Map() }) {
    let active = null;
    let disposed = false;

    const ownsTrack = (track) => active === track && readTrackUri() === track.uri;
    const updateLiked = (track, liked) => {
        if (!ownsTrack(track) || track.liked === liked) return;
        track.liked = liked;
        publish({ uri: track.uri, liked });
    };

    function loadLiked(track) {
        if (track.read) return track.read;
        if (!track.uri || typeof track.library?.contains !== "function") return Promise.resolve(null);

        // Returning to the same track while an earlier write is in flight
        // must read the saved state after that write settles.
        const pendingWrite = pendingWrites.get(track.uri);
        const read = Promise.resolve().then(async () => {
            await pendingWrite;
            if (!ownsTrack(track)) return null;
            const result = await track.library.contains(track.uri);
            const liked = Array.isArray(result) ? result[0] : result;
            if (typeof liked !== "boolean") return null;
            updateLiked(track, liked);
            return liked;
        }).catch(() => null).finally(() => {
            track.read = null;
        });
        track.read = read;
        return read;
    }

    function syncTrack({ refresh = false } = {}) {
        if (disposed) return;
        const uri = readTrackUri();
        const library = readLibrary();
        if (active?.uri === uri && active.library === library) {
            if (refresh && !pendingWrites.has(uri)) void loadLiked(active);
            return;
        }
        active = { uri, library, liked: null, read: null };
        publish({ uri, liked: null });
        void loadLiked(active);
    }

    async function toggle(expectedUri) {
        syncTrack();
        const track = active;
        if (!track?.uri || track.uri !== expectedUri || pendingWrites.has(track.uri)) return;

        const status = track.read || (track.liked === null ? loadLiked(track) : Promise.resolve(track.liked));
        const operation = status.then(async (liked) => {
            if (liked === null || !ownsTrack(track)) return;
            const method = liked ? "remove" : "add";
            if (typeof track.library?.[method] !== "function") return;
            await track.library[method]({ uris: [track.uri] });
            updateLiked(track, !liked);
        }).catch(error => {
            if (ownsTrack(track)) reportError(error);
        });
        pendingWrites.set(track.uri, operation);
        try {
            await operation;
        } finally {
            if (pendingWrites.get(track.uri) === operation) pendingWrites.delete(track.uri);
        }
    }

    return {
        syncTrack,
        toggle,
        dispose() {
            disposed = true;
            active = null;
        },
    };
}
