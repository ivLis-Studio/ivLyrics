import { getFirstSpotifyUri } from "../../core/spotifyFields.mjs";
import { trimTrackMetadataLabel as trimFullscreenTitle } from "../../core/spotifyTrackMetadata.mjs";
import { trackIdentity } from "../../core/trackIdentity.mjs";

export { trimFullscreenTitle };

// Local URIs identify playback even though they have no Spotify detail page.
function readPlaybackTrackUri(value) {
    const uri = typeof value === "string" ? value.trim() : value;
    return trackIdentity.isLocalTrackUri(uri) ? uri : getFirstSpotifyUri(uri);
}

const resolveVinylMetadataLabel = (original, metadata, field, mode, trimEnabled) => {
    const values = {
        original,
        translated: metadata?.translated?.[field],
        romanized: metadata?.romanized?.[field]
    };
    const kinds = {
        translated: [values.translated ? "translated" : "original"],
        romanized: [values.romanized ? "romanized" : "original"],
        "original-translated": ["original", "translated"],
        "original-romanized": ["original", "romanized"],
        all: ["original", "translated", "romanized"]
    }[mode] || ["original"];
    const labels = kinds.map((kind) => {
        const text = values[kind] || "";
        return trimEnabled ? trimFullscreenTitle(text) : text;
    }).filter(Boolean);
    return [...new Set(labels)].join(" / ");
};

export function createFullscreenTrackMetadata({ readCurrentItem, getTrackArtwork, readVisualSettings }) {
    const getAlbumUri = (item) => {
        const metadata = item?.metadata || {};
        return getFirstSpotifyUri(
            item?.album?.uri,
            metadata.album_uri,
            metadata.album?.uri
        );
    };

    const getArtistUri = (item) => {
        const metadata = item?.metadata || {};
        return getFirstSpotifyUri(
            item?.artists,
            metadata.artist_uri,
            metadata.artist_uris
        );
    };

    // These fields are read directly while rendering the overlay. Keep their
    // polling fallback even when playback position is not used by this layout,
    // including metadata that arrives after songchange or mutates in place.
    const getOverlayMetadataSnapshot = () => {
        const item = readCurrentItem();
        const metadata = item?.metadata;
        return [
            readPlaybackTrackUri(item?.uri),
            getArtistUri(item),
            getAlbumUri(item),
            metadata?.title,
            metadata?.artist_name,
            metadata?.album_title,
            metadata?.album_disc_number,
            metadata?.year,
            metadata?.image_xlarge_url,
            metadata?.image_large_url,
            item?.album?.images?.[0]?.url,
            metadata?.image_url
        ];
    };

    function readTrackPresentation({
        trackUri, coverUrl, title, artist, translatedMetadata, trimTitleEnabled, trackAccentUri, trackAccent,
    }) {
        const currentPlayerItem = readCurrentItem();
        const currentPlayerMetadata = currentPlayerItem?.metadata;
        const currentTrackUri = readPlaybackTrackUri(currentPlayerItem?.uri) || readPlaybackTrackUri(trackUri);
        const pageTrackMatches = !trackUri || !currentTrackUri || currentTrackUri === trackUri;
        const currentArtistUri = getArtistUri(currentPlayerItem);
        const currentAlbumUri = getAlbumUri(currentPlayerItem);
        const currentCoverUrl = getTrackArtwork(currentPlayerItem)
            || (currentTrackUri === trackUri ? coverUrl : "");
        const currentVinylTitle = currentPlayerMetadata?.title || (pageTrackMatches && title) || "LP";
        const currentVinylArtist = currentPlayerMetadata?.artist_name || (pageTrackMatches && artist) || "";
        const currentVinylAlbum = currentPlayerMetadata?.album_title || currentVinylTitle;
        const visual = readVisualSettings();
        const vinylMetadataMode = visual?.["translate-metadata"] === true
            ? visual["translate-metadata-mode"] || "translated"
            : "original";
        const vinylMetadata = currentTrackUri === trackUri ? translatedMetadata : null;
        const displayMetadata = {
            title: (pageTrackMatches && title) || currentPlayerMetadata?.title,
            artist: (pageTrackMatches && artist) || currentPlayerMetadata?.artist_name,
            albumName: currentPlayerMetadata?.album_title || "",
            releaseYear: currentPlayerMetadata?.album_disc_number ? "" : (currentPlayerMetadata?.year || ""),
            coverUrl: (pageTrackMatches && coverUrl) || currentPlayerMetadata?.image_url,
            translated: pageTrackMatches ? translatedMetadata : null,
        };
        const liveVinylTrack = {
            uri: currentTrackUri || `${currentVinylTitle}\u0000${currentVinylArtist}`,
            coverUrl: currentCoverUrl,
            title: resolveVinylMetadataLabel(currentVinylTitle, vinylMetadata, "title", vinylMetadataMode, trimTitleEnabled),
            artist: resolveVinylMetadataLabel(currentVinylArtist, vinylMetadata, "artist", vinylMetadataMode, trimTitleEnabled),
            album: currentVinylAlbum,
            accent: currentTrackUri && currentTrackUri === trackAccentUri
                ? String(trackAccent || "").trim()
                : ""
        };
        return {
            currentTrackUri, currentArtistUri, currentAlbumUri, currentCoverUrl, liveVinylTrack, displayMetadata,
        };
    }

    return { getOverlayMetadataSnapshot, readTrackPresentation };
}
