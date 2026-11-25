import { getPlaylistIdFromUri, getPlaylistImage } from "../player/spotifyPlaylistMetadata.mjs";

const CONTEXT_TYPES = ["playlist", "album", "artist", "collection", "station"];

export function createFullscreenPlaybackContext({ readContext, fetchPlaylistMetadata, publish, showImage, onError }) {
    let selection = null;
    let disposed = false;

    function readSelection() {
        const context = readContext();
        const uri = typeof context?.uri === "string" ? context.uri : "";
        const rawImage = showImage ? context?.metadata?.image_url || "" : "";
        return {
            uri,
            name: context?.metadata?.context_description || "",
            type: CONTEXT_TYPES.find(type => uri.includes(type)) || "",
            image: /^[a-f0-9]+$/i.test(rawImage) ? `https://i.scdn.co/image/${rawImage}` : getPlaylistImage(rawImage),
        };
    }

    function matches(left, right) {
        return left !== null && left.uri === right.uri && left.name === right.name && left.image === right.image;
    }

    async function loadArtwork(selected, playlistId) {
        try {
            const data = await fetchPlaylistMetadata(`spotify:playlist:${playlistId}`);
            if (selection !== selected || !matches(selected, readSelection())) return;
            const image = getPlaylistImage(data?.images, data?.image);
            if (image) publish({ ...selected, image });
        } catch (error) {
            if (selection === selected) onError?.(error);
        }
    }

    return {
        update() {
            if (disposed) return;
            const next = readSelection();
            if (matches(selection, next)) return;
            selection = next;
            publish(next);
            const playlistId = showImage && next.name && !next.image && getPlaylistIdFromUri(next.uri);
            if (playlistId) void loadArtwork(next, playlistId);
        },
        dispose() {
            disposed = true;
            selection = null;
        },
    };
}
