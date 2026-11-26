export const SYNC_DATA_UPDATED_EVENT = "ivLyrics:sync-data-updated";

export function getPublishedSyncTrackUri(detail) {
    if (typeof detail?.trackUri === "string" && detail.trackUri) return detail.trackUri;
    if (typeof detail?.trackId === "string" && detail.trackId) return `spotify:track:${detail.trackId}`;
    return null;
}
