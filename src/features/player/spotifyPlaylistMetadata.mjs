import { getNonEmptyString, getFirstSpotifyUri } from "../../core/spotifyFields.mjs";

export const getPlaylistIdFromUri = (uri) => {
	const uriString = String(uri || "");
	const modernMatch = uriString.match(/^spotify:(?:playlist|playlist-v2):([^:]+)/);
	if (modernMatch?.[1]) return modernMatch[1];
	const legacyMatch = uriString.match(/^spotify:user:[^:]+:playlist:([^:]+)/);
	return legacyMatch?.[1] || "";
};

export const getPlaylistUriFromItem = (playlist) => {
	const rawUri = getFirstSpotifyUri(playlist?.uri, playlist?.link) || "";
	const id = playlist?.id || getPlaylistIdFromUri(rawUri);
	return id ? `spotify:playlist:${id}` : rawUri;
};

const normalizeSpotifyImageUrl = (image) => {
	const rawUrl = getNonEmptyString(image?.url, image?.uri, image?.sources?.[0]?.url, image);
	if (!rawUrl) return "";
	if (rawUrl.startsWith("spotify:image:")) {
		return `https://i.scdn.co/image/${rawUrl.split(":").pop()}`;
	}
	if (rawUrl.startsWith("spotify:mosaic:")) {
		return `https://mosaic.scdn.co/640/${rawUrl.replace("spotify:mosaic:", "").replace(/:/g, "")}`;
	}
	return rawUrl;
};

export const getPlaylistImage = (...sources) => {
	for (const source of sources) {
		if (Array.isArray(source)) {
			for (const image of source) {
				const imageUrl = normalizeSpotifyImageUrl(image);
				if (imageUrl) return imageUrl;
			}
			continue;
		}

		const imageUrl = normalizeSpotifyImageUrl(source);
		if (imageUrl) return imageUrl;
	}
	return "";
};

export const fetchPlaylistMetadata = async (spotify, playlistUri) => {
	const playlistApi = spotify?.Platform?.PlaylistAPI;
	if (!playlistApi?.getMetadata || !playlistUri) return null;

	try {
		return await playlistApi.getMetadata(playlistUri, { limit: 1 });
	} catch (error) {
		console.warn("[PlaylistPicker] Failed to load playlist metadata:", playlistUri, error);
		return null;
	}
};
