import { formatContributorTimestamp } from "./profileData.mjs";

export function createSyncScoreBadge({ react, getPointsLabel }) {
	return function SyncScoreBadge({ points = null }) {
		const numericPoints = Number(points);
		const hasPoints = points != null && Number.isFinite(numericPoints) && numericPoints >= 0;
		if (!hasPoints) return null;
		const formattedPoints = numericPoints.toLocaleString(undefined, { maximumFractionDigits: 2 });
		const title = `${formattedPoints} ${getPointsLabel()}`;
		return react.createElement(
			"span",
			{
				className: "lyrics-sync-score-badge",
				title,
				"aria-label": title
			},
			title
		);
	};
}

function normalizeCreatorCoverText(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
		.replace(/[^a-z0-9가-힣ぁ-ゔァ-ヴー一-龯]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function getCreatorCoverFirstArtist(value) {
	return String(value || "")
		.split(/,|&|\bfeat\.?\b|\bfeaturing\b|\bwith\b|\bx\b/i)[0]
		.trim();
}

function upgradeCreatorItunesArtwork(url) {
	return String(url || "").replace(/\/\d+x\d+bb(?=\.(jpg|jpeg|png|webp)(\?|$))/i, "/600x600bb");
}

async function fetchCreatorProfileJson(fetch, url) {
	const response = await fetch(url, { headers: { Accept: "application/json" } });
	if (!response.ok) {
		throw new Error("Cover lookup failed");
	}
	return await response.json();
}

async function searchCreatorItunesCover(fetch, title, artist) {
	const term = [title, getCreatorCoverFirstArtist(artist)].filter(Boolean).join(" ").trim();
	if (!term) return null;

	const url = new URL("https://itunes.apple.com/search");
	url.searchParams.set("term", term);
	url.searchParams.set("media", "music");
	url.searchParams.set("entity", "song");
	url.searchParams.set("limit", "8");

	const data = await fetchCreatorProfileJson(fetch, url.toString());
	const results = Array.isArray(data.results) ? data.results : [];
	if (!results.length) return null;

	const wantedTitle = normalizeCreatorCoverText(title);
	const wantedArtist = normalizeCreatorCoverText(getCreatorCoverFirstArtist(artist));
	const best = results.find((item) => {
		const itemTitle = normalizeCreatorCoverText(item.trackName);
		const itemArtist = normalizeCreatorCoverText(item.artistName);
		return itemTitle === wantedTitle && (!wantedArtist || itemArtist.includes(wantedArtist) || wantedArtist.includes(itemArtist));
	}) || results.find((item) => normalizeCreatorCoverText(item.trackName) === wantedTitle) || results[0];

	return best?.artworkUrl100 ? upgradeCreatorItunesArtwork(best.artworkUrl100) : null;
}

function escapeCreatorMusicBrainzQuery(value) {
	return String(value || "").replace(/["\\]/g, " ").trim();
}

async function searchCreatorMusicBrainzCover(fetch, title, artist) {
	const safeTitle = escapeCreatorMusicBrainzQuery(title);
	const safeArtist = escapeCreatorMusicBrainzQuery(getCreatorCoverFirstArtist(artist));
	if (!safeTitle) return null;

	const query = safeArtist
		? `recording:"${safeTitle}" AND artist:"${safeArtist}"`
		: `recording:"${safeTitle}"`;
	const url = new URL("https://musicbrainz.org/ws/2/recording/");
	url.searchParams.set("query", query);
	url.searchParams.set("fmt", "json");
	url.searchParams.set("limit", "5");

	const data = await fetchCreatorProfileJson(fetch, url.toString());
	const releaseIds = [];
	for (const recording of data.recordings || []) {
		for (const release of recording.releases || []) {
			if (release.id && !releaseIds.includes(release.id)) {
				releaseIds.push(release.id);
			}
		}
	}

	for (const releaseId of releaseIds.slice(0, 4)) {
		try {
			const coverData = await fetchCreatorProfileJson(fetch, `https://coverartarchive.org/release/${encodeURIComponent(releaseId)}`);
			const images = Array.isArray(coverData.images) ? coverData.images : [];
			const image = images.find((item) => item.front) || images[0];
			const thumbs = image?.thumbnails || {};
			const coverUrl = thumbs.large || thumbs["500"] || thumbs.small || image?.image;
			if (coverUrl) return coverUrl;
		} catch (error) {
			// Try the next release when Cover Art Archive has no image.
		}
	}

	return null;
}

async function findCreatorTrackCover(fetch, title, artist) {
	try {
		const itunesCover = await searchCreatorItunesCover(fetch, title, artist);
		if (itunesCover) return itunesCover;
	} catch (error) {
		// Fall through to MusicBrainz.
	}

	try {
		return await searchCreatorMusicBrainzCover(fetch, title, artist);
	} catch (error) {
		return null;
	}
}

export function createCreatorTrackCover({ react, fetchCover }) {
	const { useState, useMemo, useEffect } = react;
	return react.memo(function CreatorProfileTrackCover({ title, artist }) {
		const [coverUrl, setCoverUrl] = useState(null);
		const [failed, setFailed] = useState(false);
		const cacheKey = useMemo(() => (
			`${normalizeCreatorCoverText(title)}|${normalizeCreatorCoverText(getCreatorCoverFirstArtist(artist))}`
		), [artist, title]);

		useEffect(() => {
			let cancelled = false;
			setCoverUrl(null);
			setFailed(false);
			if (!title) return undefined;

			findCreatorTrackCover(fetchCover, title, artist).then((url) => {
				if (!cancelled && url) {
					setCoverUrl(url);
				}
			}).catch(() => {
				if (!cancelled) {
					setFailed(true);
				}
			});

			return () => {
				cancelled = true;
			};
		}, [artist, cacheKey, title]);

		return react.createElement(
			"div",
			{ className: `lyrics-creator-profile-track-cover ${coverUrl && !failed ? "is-loaded" : ""}`.trim() },
			react.createElement("div", { className: "lyrics-creator-profile-track-cover-ph" }),
			react.createElement("div", { className: "lyrics-creator-profile-track-cover-glyph" }, "♪"),
			coverUrl && !failed && react.createElement("img", {
				src: coverUrl,
				alt: "",
				loading: "lazy",
				decoding: "async",
				onError: () => setFailed(true)
			})
		);
	});
}

export function createCreatorTrackRow({ react, CreatorProfileTrackCover, SyncScoreBadge, getPlaylistPickerButton }) {
	return react.memo(function CreatorProfileTrackRow({
		item,
		copy,
		onTrackClick,
		openPlaylistTrackKey,
		onPlaylistOpenChange,
		theme
	}) {
		const trackKey = `${item.trackId}:${item.provider}`;
		const updatedLabel = formatContributorTimestamp(item.updatedAt || item.createdAt);
		const title = item.trackName || copy.unknownTrack;
		const subtitle = item.artists || item.trackId;

		return react.createElement(
			"div",
			{ className: "lyrics-creator-profile-track", key: trackKey },
			// The row is a container rather than a button so the playlist picker can
			// sit beside it without nesting one interactive element inside another.
			react.createElement(
				"button",
				{
					type: "button",
					className: "lyrics-creator-profile-track-open",
					onClick: () => onTrackClick(item.trackId)
				},
				react.createElement(CreatorProfileTrackCover, { title, artist: subtitle }),
				react.createElement(
					"div",
					{ className: "lyrics-creator-profile-track-main" },
					react.createElement("div", { className: "lyrics-creator-profile-track-title" }, title),
					react.createElement(
						"div",
						{ className: "lyrics-creator-profile-track-subline" },
						react.createElement("span", { className: "lyrics-creator-profile-track-artist" }, subtitle),
						updatedLabel && react.createElement("span", { className: "lyrics-creator-profile-track-updated" }, `${copy.updated} ${updatedLabel}`)
					)
				)
			),
			react.createElement(
				"div",
				{ className: "lyrics-creator-profile-track-actions" },
				react.createElement(
					"div",
					{ className: "lyrics-creator-profile-track-side" },
					react.createElement(SyncScoreBadge, { points: item.syncPoints }),
					react.createElement("span", { className: "lyrics-creator-profile-track-provider" }, item.provider)
				),
				item.trackId && react.createElement(getPlaylistPickerButton(), {
					trackUri: `spotify:track:${item.trackId}`,
					buttonClassName: "lyrics-creator-profile-track-playlist",
					iconSize: 16,
					// The contribution grid scrolls, so an in-flow menu would be clipped.
					anchored: true,
					theme,
					// Keep the portalled menu inside the panel that owns the row.
					boundary: ".lyrics-creator-profile-modal",
					open: openPlaylistTrackKey === trackKey,
					onOpenChange: (nextOpen) => onPlaylistOpenChange(nextOpen ? trackKey : null)
				})
			)
		);
	});
}
