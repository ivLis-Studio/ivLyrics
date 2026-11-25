import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";

const TRACK_IDENTITY_SERVICE = "ivLyricsTrackIdentity";
const LOCAL_CACHE_ID_PREFIX = "local-uri:";

export const readTrackIdentityService = (host) => getRuntimeService(TRACK_IDENTITY_SERVICE, host);

function resolveTrackArtwork(track, isLocalUri) {
    const meta = track?.metadata || {};
    const images = [meta.image_xlarge_url, meta.image_large_url, meta.image_url,
        ...(track?.album?.images || []).map(image => image?.url)];
    const embedded = images.find(url => typeof url === "string" && /localfile/i.test(url));
    if (embedded) return embedded;
    const isCatalogImage = url => typeof url === "string"
        && (/^spotify:image:/i.test(url) || /^https?:\/\/i\.scdn\.co\/image\//i.test(url));
    const image = isLocalUri(track?.uri)
        ? [meta.image_url, meta.image_large_url, meta.image_xlarge_url]
            .find(url => typeof url === "string" && url && !isCatalogImage(url))
        : images.find(url => typeof url === "string" && url);
    if (typeof image !== "string") return "";
    return image.startsWith("spotify:image:")
        ? `https://i.scdn.co/image/${image.slice("spotify:image:".length)}`
        : image;
}

function resolveTrackId(uri, isTrackId) {
    if (!uri || typeof uri !== "string") return null;
    const value = uri.trim();
    if (isTrackId(value)) return value;

    const uriMatch = value.match(/^spotify:track:([A-Za-z0-9]{22})(?:$|[?#])/);
    if (uriMatch) return uriMatch[1];

    const webMatch = value.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/);
    return webMatch ? webMatch[1] : null;
}

// Translation providers need a stable cache identity, not a Spotify ID.
// Keep the complete local URI: its last component is only the duration.
function resolveTranslationCacheId(uri, extractId, isLocalUri) {
    const trackId = extractId(uri);
    if (trackId) return trackId;
    const value = typeof uri === "string" ? uri.trim() : "";
    return isLocalUri(value) ? `${LOCAL_CACHE_ID_PREFIX}${value}` : null;
}

export const trackIdentity = {
    isSpotifyTrackId(value) {
        return typeof value === "string" && /^[A-Za-z0-9]{22}$/.test(value.trim());
    },

    isSpotifyTrackUri(uri) {
        return typeof uri === "string" && /^spotify:track:[A-Za-z0-9]{22}$/.test(uri.trim());
    },

    isLocalTrackUri(uri) {
        return typeof uri === "string" && uri.startsWith("spotify:local:");
    },

    getTrackArtwork(track) { return resolveTrackArtwork(track, trackIdentity.isLocalTrackUri); },
    extractTrackId(uri) { return resolveTrackId(uri, trackIdentity.isSpotifyTrackId); },
    getTranslationCacheId(uri) {
        return resolveTranslationCacheId(uri, trackIdentity.extractTrackId, trackIdentity.isLocalTrackUri);
    }
};

export function getLocalTrackUriFromCacheId(cacheId) {
    if (typeof cacheId !== "string" || !cacheId.startsWith(LOCAL_CACHE_ID_PREFIX)) return null;
    const uri = cacheId.slice(LOCAL_CACHE_ID_PREFIX.length);
    return trackIdentity.isLocalTrackUri(uri) ? uri : null;
}

// The page honors the compatibility globals when an older extension is
// installed. The fallback uses the same core as the bundled lyrics service.
export function createTrackIdentityFacade(resolveExternal) {
    const call = (name, value, fallback = trackIdentity[name]) => {
        const method = resolveExternal(name);
        return (typeof method === "function" ? method : fallback)(value);
    };
    return {
        isSpotifyTrackId(value) { return call("isSpotifyTrackId", value); },
        isSpotifyTrackUri(uri) { return call("isSpotifyTrackUri", uri); },
        isLocalTrackUri(uri) { return call("isLocalTrackUri", uri); },
        getTrackArtwork(track) {
            return call("getTrackArtwork", track, (value) => resolveTrackArtwork(value, (uri) => this.isLocalTrackUri(uri)));
        },
        extractTrackId(uri) {
            return call("extractTrackId", uri, (value) => resolveTrackId(value, (id) => this.isSpotifyTrackId(id)));
        },
        getTranslationCacheId(uri) {
            return call("getTranslationCacheId", uri, (value) => resolveTranslationCacheId(
                value, (uri) => this.extractTrackId(uri), (uri) => this.isLocalTrackUri(uri),
            ));
        },
    };
}

export function createRuntimeTrackIdentity(host) {
    return createTrackIdentityFacade((name) =>
        getRuntimeService("LyricsService", host)?.[name] || readTrackIdentityService(host)?.[name]);
}

export function installTrackIdentityService(host) {
    const identity = { ...host[TRACK_IDENTITY_SERVICE], ...trackIdentity };
    return publishRuntimeService(TRACK_IDENTITY_SERVICE, identity, host);
}
