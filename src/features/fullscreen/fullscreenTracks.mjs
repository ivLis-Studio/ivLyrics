import { getNonEmptyString } from "../../core/spotifyFields.mjs";

export { getNonEmptyString };

export const isUnknownTrackMetadata = (meta) => {
    if (!meta) return true;
    const title = meta.title || '';
    const artist = meta.artist_name || '';
    return (title.toLowerCase() === 'unknown' && artist.toLowerCase() === 'unknown') || (!title && !artist);
};

const resolveQueueTrackFields = (track) => {
    const contextTrack = track?.contextTrack || track || {};
    const meta = contextTrack.metadata || track?.metadata || {};
    return {
        meta,
        ids: {
            uri: contextTrack.uri || track?.uri || "",
            uid: contextTrack.uid || track?.uid || "",
            contextUri:
                contextTrack.contextUri ||
                contextTrack.context_uri ||
                contextTrack.context?.uri ||
                track?.contextUri ||
                track?.context_uri ||
                track?.context?.uri ||
                ""
        }
    };
};

function createQueueTrackInfo(meta, ids, source, index, allowContextPlayback) {
    const uri = getNonEmptyString(ids.uri, meta?.uri);
    const uid = getNonEmptyString(ids.uid, meta?.uid);
    const contextUri = getNonEmptyString(meta?.context_uri, ids.contextUri);
    return {
        title: meta?.title || "Unknown",
        artist: meta?.artist_name || "Unknown",
        image: meta?.image_url || "",
        uri,
        uid,
        contextUri,
        queueSource: source,
        canPlayInContext: Boolean(allowContextPlayback && uri && contextUri && contextUri !== uri),
        index,
        key: `${source}:${uid || uri || "unknown"}:${index}`,
    };
}

export function getNextQueueTracks(queueState) {
    const next = [];
    const append = (items, source, allowContextPlayback) => {
        if (!Array.isArray(items) || next.length >= 15) return false;
        for (const track of items) {
            const { meta, ids } = resolveQueueTrackFields(track);
            // Spotify can append an empty metadata entry at the end of a context.
            if (isUnknownTrackMetadata(meta)) return true;
            next.push(createQueueTrackInfo(meta, ids, source, next.length + 1, allowContextPlayback));
            if (next.length >= 15) return true;
        }
        return false;
    };

    if (Array.isArray(queueState.queued) || Array.isArray(queueState.nextUp)) {
        if (!append(queueState.queued || [], "queued", false)) {
            append(queueState.nextUp || [], "nextUp", true);
        }
    } else {
        append(queueState.nextTracks || [], "nextTracks", true);
    }
    return next;
}

export function getRecentQueueTracks(prevSource) {
    const recent = [];
    for (let index = prevSource.length - 1; index >= 0 && recent.length < 10; index--) {
        const { meta, ids } = resolveQueueTrackFields(prevSource[index]);
        recent.push(createQueueTrackInfo(meta, ids, "recent", recent.length + 1, false));
    }
    return recent;
}

export const isRecommendedQueueTrack = (track) => Boolean(
    track &&
    track.queueSource !== "queued" &&
    !track.canPlayInContext
);

export const areTrackInfoEqual = (prev, next) => {
    if (prev === next) return true;
    if (!prev || !next) return false;

    return prev.title === next.title &&
        prev.artist === next.artist &&
        prev.image === next.image &&
        prev.uri === next.uri &&
        prev.uid === next.uid &&
        prev.contextUri === next.contextUri &&
        prev.queueSource === next.queueSource &&
        prev.canPlayInContext === next.canPlayInContext &&
        prev.index === next.index;
};

export const areTrackListsEqual = (prev, next) => {
    if (prev === next) return true;
    if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) {
        return false;
    }

    for (let i = 0; i < prev.length; i++) {
        if (!areTrackInfoEqual(prev[i], next[i])) {
            return false;
        }
    }

    return true;
};
