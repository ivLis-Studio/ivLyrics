import { getNonEmptyString, getSpotifyArtistNames } from '../../core/spotifyFields.mjs';
import { firstNormalizedSyncDataIsrc } from '../../lyrics/syncDataIdentity.mjs';

export function captureSyncCreatorTrackInfo(trackUri, playerItem, lyricsState) {
	const playing = playerItem?.uri === trackUri ? playerItem : null;
	const displayed = lyricsState?.uri === trackUri ? lyricsState : null;
	return {
		uri: trackUri,
		name: getNonEmptyString(playing?.name, playing?.metadata?.title, displayed?.title),
		artists: playing?.artists || [],
		artist: getNonEmptyString(playing?.metadata?.artist_name, displayed?.artist),
		album: playing?.album || {},
		metadata: playing?.metadata || {},
		external_ids: playing?.external_ids || {},
		externalIds: playing?.externalIds || {},
		duration: playing?.duration,
		image: displayed?.coverUrl,
	};
}

function getDurationMs(duration) {
	const value = Number(duration?.milliseconds ?? duration);
	return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function resolveSyncCreatorTrack(trackInfo, {
	getPlayerItem, getPlayerDuration, extractTrackId, getSpotifyTrackData, getSyncService,
}) {
	const item = getPlayerItem();
	const trackUri = trackInfo?.uri || item?.uri;
	const trackId = extractTrackId(trackUri) || '';
	const playing = trackUri && item?.uri === trackUri ? item : null;
	const inputMetadata = trackInfo?.metadata;
	const playerMetadata = playing?.metadata;
	let spotifyData;
	try {
		spotifyData = getSpotifyTrackData(trackUri);
	} catch {
		// Track metadata is optional while Spotify starts or switches tracks.
	}
	const trackIsrc = firstNormalizedSyncDataIsrc(
		trackInfo?.external_ids?.isrc, trackInfo?.externalIds?.isrc, inputMetadata?.isrc,
		trackInfo?.item?.metadata?.isrc, trackInfo?.isrc, spotifyData?.isrc,
		playing?.external_ids?.isrc, playing?.externalIds?.isrc, playerMetadata?.isrc,
	) || (trackId && firstNormalizedSyncDataIsrc(getSyncService()?.getTrackIsrc?.(trackId, trackInfo)));
	const trackName = getNonEmptyString(trackInfo?.name, trackInfo?.title, inputMetadata?.title,
		playing?.name, playerMetadata?.title, spotifyData?.name);
	const artists = [trackInfo?.artists, trackInfo?.artist, inputMetadata?.artist_name,
		playing?.artists, playerMetadata?.artist_name, spotifyData?.artists]
		.map(getSpotifyArtistNames).find(names => names.length > 0) || [];
	const albumName = getNonEmptyString(trackInfo?.album?.name, trackInfo?.album, inputMetadata?.album_title,
		playing?.album?.name, playerMetadata?.album_title, spotifyData?.album?.name, spotifyData?.album, spotifyData?.albumName);
	const trackDurationMs = getDurationMs(trackInfo?.duration?.milliseconds) || getDurationMs(trackInfo?.durationMs)
		|| getDurationMs(trackInfo?.duration_ms) || getDurationMs(trackInfo?.duration) || getDurationMs(inputMetadata?.duration)
		|| getDurationMs(playing?.duration) || getDurationMs(playerMetadata?.duration) || getDurationMs(spotifyData?.duration_ms)
		|| (playing ? getDurationMs(getPlayerDuration()) : 0);
	const albumArt = getNonEmptyString(trackInfo?.album?.images?.[0]?.url, trackInfo?.image, inputMetadata?.image_url,
		playing?.album?.images?.[0]?.url, playerMetadata?.image_url);

	return {
		trackUri, trackId, trackIsrc, trackName, artistName: artists.join(', '), primaryArtist: artists[0] || '',
		albumName, trackDurationMs, albumArt, sessionTrackKey: trackId || trackIsrc || trackUri || '',
	};
}
