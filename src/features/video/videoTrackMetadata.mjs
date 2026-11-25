import { getNonEmptyString, getSpotifyArtistNames } from "../../core/spotifyFields.mjs";

function readArtists(value) {
    const artists = getSpotifyArtistNames(value);
    return artists.length ? artists : null;
}

export function describeVideoTrack({ trackUri, trackId, spotifyData, playerItem, queuedTrack }) {
    // Playback metadata describes the playing song, even when the queue has already changed.
    const playing = playerItem?.uri === trackUri ? playerItem : null;
    const playerMetadata = playing?.metadata;
    const queued = queuedTrack?.uri && queuedTrack.uri !== trackUri ? null : queuedTrack;
    const artists = readArtists(spotifyData?.artists) || readArtists(queued?.artist)
        || readArtists(playing?.artists) || readArtists(playerMetadata?.artist_name) || [];
    const name = getNonEmptyString(spotifyData?.name, queued?.title, playerMetadata?.title, playing?.name);
    const album = getNonEmptyString(
        spotifyData?.album, spotifyData?.albumName, spotifyData?.album?.name, queued?.album,
        playing?.album?.name, playerMetadata?.album_title,
    );

    return {
        trackId,
        name,
        title: name,
        trackName: name,
        artists,
        album,
        isrc: getNonEmptyString(
            spotifyData?.isrc, spotifyData?.external_ids?.isrc, queued?.isrc,
            playerMetadata?.isrc, playing?.external_ids?.isrc,
        ),
        durationMs: Number(spotifyData?.duration_ms) || Number(queued?.durationMs ?? queued?.duration)
            || Number(playing?.duration?.milliseconds) || Number(playerMetadata?.duration) || 0,
    };
}
