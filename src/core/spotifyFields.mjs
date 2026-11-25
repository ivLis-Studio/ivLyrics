export const getNonEmptyString = (...values) => {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return "";
};

export function getSpotifyArtistNames(value) {
	const artists = Array.isArray(value) ? value : typeof value === "string" ? value.split(", ") : [];
	return artists.map(artist => getNonEmptyString(artist?.name, artist)).filter(Boolean);
}

export const getSpotifyAccountKey = (spotify) => getNonEmptyString(
	spotify?.Platform?.LocalStorageAPI?.namespace,
	spotify?.Config?.username,
	spotify?.Platform?.Session?.username,
).replace(/^spotify:user:/, "");

export const getFirstSpotifyUri = (...values) => {
	for (const value of values) {
		if (!value) continue;

		if (Array.isArray(value)) {
			const nestedUri = getFirstSpotifyUri(...value);
			if (nestedUri) return nestedUri;
			continue;
		}

		if (typeof value === "object") {
			const nestedUri = getFirstSpotifyUri(value.uri, value.link);
			if (nestedUri) return nestedUri;
			continue;
		}

		const legacyPlaylistMatch = String(value).match(/spotify:user:[^:]+:playlist:[A-Za-z0-9]+/);
		if (legacyPlaylistMatch) return legacyPlaylistMatch[0];

		const match = String(value).match(/spotify:(track|artist|album|playlist|playlist-v2):[A-Za-z0-9]+/);
		if (match) return match[0];
	}

	return "";
};
