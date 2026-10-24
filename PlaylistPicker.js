/**
 * Shared "Add to playlist" menu.
 *
 * The fullscreen player controls and the Sync Creator profile offer the same
 * picker, so playlist discovery, membership lookup and the add/remove calls
 * live here once. Each host only decides where the menu is anchored.
 */

const PLAYLIST_POPOVER_GAP = 12;
const PLAYLIST_POPOVER_PADDING = 8;
const PLAYLIST_METADATA_BATCH_SIZE = 12;
const PLAYLIST_STATUS_BATCH_SIZE = 4;
const PLAYLIST_ADD_ICON_PATH = '<path d="M5 6h8"/><path d="M5 12h8"/><path d="M5 18h6"/><path d="M17 10v8"/><path d="M13 14h8"/>';

function getPlaylistStatusValue(state) {
	return typeof state === "string" ? state : state?.status;
}

function getPlaylistStatusUids(state) {
	return Array.isArray(state?.uids) ? state.uids : [];
}

function getPlaylistPickerCopy() {
	return {
		title: I18n.t("fullscreen.controls.addToPlaylist") || "Add to playlist",
		loading: I18n.t("fullscreen.controls.playlistLoading") || "Loading playlists...",
		empty: I18n.t("fullscreen.controls.playlistEmpty") || "No editable playlists found.",
		loadFailed: I18n.t("fullscreen.controls.playlistLoadFailed") || "Failed to load playlists.",
		noTrack: I18n.t("fullscreen.controls.playlistNoTrack") || "Only Spotify tracks can be added to playlists.",
		added: I18n.t("fullscreen.controls.playlistAdded") || "Added to {playlist}.",
		removed: I18n.t("fullscreen.controls.playlistRemoved") || "Removed from {playlist}.",
		addFailed: I18n.t("fullscreen.controls.playlistAddFailed") || "Failed to add to playlist.",
		removeFailed: I18n.t("fullscreen.controls.playlistRemoveFailed") || "Failed to remove from playlist.",
		tracks: I18n.t("fullscreen.controls.playlistTracks") || "tracks",
		checking: I18n.t("fullscreen.controls.playlistChecking") || "Checking...",
		alreadyIn: I18n.t("fullscreen.controls.playlistAlreadyInList") || "Already in",
		remove: I18n.t("fullscreen.controls.playlistRemove") || "Remove"
	};
}

/**
 * Presentational body of the picker. It owns no state, so the same markup and
 * the same `fullscreen-playlist-*` styles apply wherever it is mounted.
 */
function PlaylistPickerPanel({
	copy,
	playlists,
	error,
	loading,
	statuses,
	pendingPlaylistId,
	onItemAction
}) {
	const renderItem = (playlist) => {
		const status = getPlaylistStatusValue(statuses?.[playlist.id]);
		const isChecking = status === "checking";
		const alreadyContainsTrack = status === "contains";
		const isPending = pendingPlaylistId === playlist.id;

		return react.createElement(
			"button",
			{
				key: playlist.id,
				className: `fullscreen-playlist-item ${alreadyContainsTrack ? "contains-current-track" : ""}`.trim(),
				onClick: () => onItemAction(playlist),
				disabled: !!pendingPlaylistId || isChecking,
				role: "menuitem"
			},
			playlist.image
				? react.createElement("img", {
					src: playlist.image,
					className: "fullscreen-playlist-item-image",
					alt: ""
				})
				: react.createElement("span", { className: "fullscreen-playlist-item-fallback" }, "♪"),
			react.createElement(
				"span",
				{ className: "fullscreen-playlist-item-text" },
				react.createElement("span", { className: "fullscreen-playlist-item-name" }, playlist.name),
				react.createElement("span", { className: "fullscreen-playlist-item-count" }, `${playlist.total} ${copy.tracks}`)
			),
			isPending
				? react.createElement("span", { className: "fullscreen-playlist-item-loading" }, "...")
				: isChecking
					? react.createElement(
						"span",
						{ className: "fullscreen-playlist-item-status checking" },
						copy.checking
					)
					: alreadyContainsTrack && react.createElement(
						"span",
						{ className: "fullscreen-playlist-item-status contains" },
						react.createElement(
							"span",
							{ className: "fullscreen-playlist-item-status-default" },
							copy.alreadyIn
						),
						react.createElement(
							"span",
							{ className: "fullscreen-playlist-item-status-remove" },
							copy.remove
						)
					)
		);
	};

	return react.createElement(
		react.Fragment,
		null,
		react.createElement("div", { className: "fullscreen-playlist-popover-title" }, copy.title),
		loading && react.createElement("div", { className: "fullscreen-playlist-state" }, copy.loading),
		!loading && error && react.createElement("div", { className: "fullscreen-playlist-state error" }, error),
		!loading && !error && playlists.map(renderItem)
	);
}

function resolvePlaylistPopoverPlacement({
	anchor,
	popover,
	viewport,
	boundary,
	gap = PLAYLIST_POPOVER_GAP,
	padding = PLAYLIST_POPOVER_PADDING
} = {}) {
	const anchorTop = Number(anchor?.top) || 0;
	const anchorBottom = Number(anchor?.bottom) || 0;
	const anchorLeft = Number(anchor?.left) || 0;
	const anchorRight = Number(anchor?.right) || 0;
	const popoverWidth = Number(popover?.width) || 0;
	const popoverHeight = Number(popover?.height) || 0;
	const viewportWidth = Number(viewport?.width) || 0;
	const viewportHeight = Number(viewport?.height) || 0;

	const aboveTop = anchorTop - popoverHeight - gap;
	const belowTop = anchorBottom + gap;
	const fitsAbove = aboveTop >= padding;
	const fitsBelow = belowTop + popoverHeight <= viewportHeight - padding;

	let placement;
	let top;
	if (fitsAbove) {
		placement = "above";
		top = aboveTop;
	} else if (fitsBelow) {
		placement = "below";
		top = belowTop;
	} else {
		placement = anchorTop - padding >= viewportHeight - padding - anchorBottom ? "above" : "below";
		top = placement === "above" ? aboveTop : belowTop;
		top = Math.max(padding, Math.min(top, viewportHeight - popoverHeight - padding));
	}

	// A right-edge control (a track row's playlist button) keeps the menu inside
	// the panel that owns it: hang left of the trigger, flip right only when that
	// would not fit, and never leave the boundary.
	const boundaryLeft = Number.isFinite(Number(boundary?.left)) ? Number(boundary.left) : 0;
	const boundaryRight = Number.isFinite(Number(boundary?.right)) ? Number(boundary.right) : viewportWidth;
	const minLeft = boundaryLeft + padding;
	const maxLeft = Math.max(minLeft, boundaryRight - popoverWidth - padding);

	let preferredLeft = anchorLeft - popoverWidth;
	if (preferredLeft < minLeft) preferredLeft = anchorRight;
	const left = Math.max(minLeft, Math.min(preferredLeft, maxLeft));

	return { placement, top, left };
}

const PlaylistPicker = (() => {
	const react = Spicetify.React;
	const { useState, useEffect, useCallback, useRef } = react;
	// Spicetify bundles every subfile into one scope and has no bare `reactDom`
	// binding, so it has to be resolved off window the way the rest of the app does.
	const reactDom = window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null;

	// These two mirror the copies inside FullscreenOverlay.js on purpose. They
	// are pure and stateless, and neither module can reach the other's: the
	// shared utility module (Utils.js) is loaded after this one, and the test
	// harnesses run each file in isolation, so moving them to a common home
	// would mean loading one file from the other and stubbing the result in
	// every harness. Keep them local rather than couple the two modules.
	const getNonEmptyString = (...values) => {
		for (const value of values) {
			if (typeof value === "string" && value.trim()) {
				return value.trim();
			}
		}
		return "";
	};

	const getFirstSpotifyUri = (...values) => {
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

	// The editable playlist list rarely changes, so it is shared across pickers
	// and refreshed on a TTL rather than on every open.
	const PLAYLIST_CACHE_TTL_MS = 5 * 60 * 1000;
	let cachedPlaylists = null;
	let cachedAt = 0;
	let pendingPlaylistsRequest = null;


	const getPlaylistIdFromUri = (uri) => {
		const uriString = String(uri || "");
		const modernMatch = uriString.match(/^spotify:(?:playlist|playlist-v2):([^:]+)/);
		if (modernMatch?.[1]) return modernMatch[1];
		const legacyMatch = uriString.match(/^spotify:user:[^:]+:playlist:([^:]+)/);
		return legacyMatch?.[1] || "";
	};

	const getTrackIdFromUri = (uri) => {
		const match = String(uri || "").match(/^spotify:track:([^:]+)/);
		return match?.[1] || "";
	};

	const getPlaylistUriFromItem = (playlist) => {
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

	const getPlaylistImage = (...sources) => {
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

	const getCurrentSpotifyUserId = () => {
		const rawUserId = getNonEmptyString(
			Spicetify?.Platform?.LocalStorageAPI?.namespace,
			Spicetify?.Config?.username,
			Spicetify?.Platform?.Session?.username
		);
		return rawUserId.replace(/^spotify:user:/, "");
	};

	const getPlaylistOwnerId = (...owners) => {
		for (const owner of owners) {
			const rawOwner = getNonEmptyString(owner?.username, owner?.id, owner?.uri, owner);
			if (!rawOwner) continue;
			const match = rawOwner.match(/^spotify:user:(.+)$/);
			return match?.[1] || rawOwner;
		}
		return "";
	};

	const isPlaylistItem = (item) => item?.type === "playlist" || String(item?.uri || "").startsWith("spotify:playlist");

	const flattenRootlistItems = (rootlist) => {
		const flattened = [];
		const visit = (item) => {
			if (!item) return;
			if (Array.isArray(item)) {
				item.forEach(visit);
				return;
			}
			if (isPlaylistItem(item)) {
				flattened.push(item);
			}
			visit(item.items);
			visit(item.rows);
			visit(item.children);
			visit(item.contents);
		};

		visit(rootlist?.items || rootlist?.rows || rootlist);
		return flattened;
	};

	const isWritablePlaylist = (playlist, metadata, currentUserId) => {
		const candidates = [playlist, metadata];
		if (candidates.some((item) =>
			item?.isOwnedBySelf ||
			item?.ownedBySelf ||
			item?.collaborative ||
			item?.isCollaborative ||
			item?.editable ||
			item?.isEditable ||
			item?.canEdit ||
			item?.canWrite ||
			item?.canAddTracks ||
			item?.capabilities?.canAddTracks ||
			item?.capabilities?.canWrite ||
			item?.permissions?.canAdd ||
			item?.permissions?.canAddTracks ||
			item?.permissions?.canWrite
		)) {
			return true;
		}

		const ownerId = getPlaylistOwnerId(
			playlist?.owner,
			metadata?.owner,
			playlist?.ownerUri,
			metadata?.ownerUri,
			playlist?.ownerUsername,
			metadata?.ownerUsername
		);
		return !currentUserId || !ownerId || ownerId === currentUserId;
	};

	const getPlaylistTotal = (playlist, metadata) => Number(
		metadata?.tracks?.total ||
		playlist?.tracks?.total ||
		metadata?.totalLength ||
		playlist?.totalLength ||
		metadata?.trackCount ||
		playlist?.trackCount ||
		metadata?.length ||
		playlist?.length ||
		0
	);

	const getRootlistContents = async () => {
		const rootlistApi = Spicetify?.Platform?.RootlistAPI;
		if (rootlistApi?.getContents) {
			try {
				return await rootlistApi.getContents({ flatten: true });
			} catch (error) {
				try {
					return await rootlistApi.getContents();
				} catch (fallbackError) {
					console.warn("[PlaylistPicker] RootlistAPI failed; falling back to Cosmos rootlist.", fallbackError);
				}
			}
		}

		if (Spicetify?.CosmosAsync?.get) {
			return await Spicetify.CosmosAsync.get("sp://core-playlist/v1/rootlist");
		}

		throw new Error("Rootlist API is unavailable.");
	};

	const fetchPlaylistMetadata = async (playlistUri) => {
		const playlistApi = Spicetify?.Platform?.PlaylistAPI;
		if (!playlistApi?.getMetadata || !playlistUri) return null;

		try {
			return await playlistApi.getMetadata(playlistUri, { limit: 1 });
		} catch (error) {
			console.warn("[PlaylistPicker] Failed to load playlist metadata:", playlistUri, error);
			return null;
		}
	};

	const normalizeRootlistPlaylist = async (playlist, currentUserId) => {
		const uri = getPlaylistUriFromItem(playlist);
		const id = playlist?.id || getPlaylistIdFromUri(uri);
		if (!id) return null;

		const metadata = await fetchPlaylistMetadata(uri);
		if (!isWritablePlaylist(playlist, metadata, currentUserId)) return null;

		return {
			id,
			uri,
			name: getNonEmptyString(metadata?.name, playlist?.name, playlist?.title) || "Playlist",
			image: getPlaylistImage(metadata?.images, playlist?.images, metadata?.image, playlist?.image),
			total: getPlaylistTotal(playlist, metadata)
		};
	};

	const fetchWritableUserPlaylists = async () => {
		const rootlist = await getRootlistContents();
		const currentUserId = getCurrentSpotifyUserId();
		const seenIds = new Set();
		const rootlistPlaylists = flattenRootlistItems(rootlist).filter((playlist) => {
			const uri = getPlaylistUriFromItem(playlist);
			const id = playlist?.id || getPlaylistIdFromUri(uri);
			if (!id || seenIds.has(id)) return false;
			seenIds.add(id);
			return true;
		});

		const normalizedPlaylists = [];
		for (let index = 0; index < rootlistPlaylists.length; index += PLAYLIST_METADATA_BATCH_SIZE) {
			const batch = rootlistPlaylists.slice(index, index + PLAYLIST_METADATA_BATCH_SIZE);
			const normalizedBatch = await Promise.all(
				batch.map((playlist) => normalizeRootlistPlaylist(playlist, currentUserId))
			);
			for (const normalizedPlaylist of normalizedBatch) {
				if (normalizedPlaylist) {
					normalizedPlaylists.push(normalizedPlaylist);
				}
			}
		}

		return normalizedPlaylists;
	};

	const getCachedPlaylists = () => (
		cachedPlaylists && Date.now() - cachedAt < PLAYLIST_CACHE_TTL_MS ? cachedPlaylists : null
	);

	// One shared request for every picker on screen: concurrent openers await the
	// same promise instead of each walking the rootlist and its metadata batches.
	const requestWritableUserPlaylists = async () => {
		if (pendingPlaylistsRequest) return pendingPlaylistsRequest;

		pendingPlaylistsRequest = fetchWritableUserPlaylists()
			.then((writablePlaylists) => {
				cachedPlaylists = writablePlaylists;
				cachedAt = Date.now();
				return writablePlaylists;
			})
			.finally(() => {
				pendingPlaylistsRequest = null;
			});

		return pendingPlaylistsRequest;
	};

	const getPlaylistContentItems = (contents) => {
		const candidates = [
			contents?.items?.data,
			contents?.items,
			contents?.data?.items,
			contents?.data,
			contents
		];
		return candidates.find((candidate) => Array.isArray(candidate)) || [];
	};

	const createPlaylistTrackMatch = (contains = false, uids = []) => ({
		contains,
		uids: [...new Set(uids.filter(Boolean).map(String))]
	});

	const isSameTrackUri = (candidateUri, trackUri) => {
		if (!candidateUri || !trackUri) return false;
		if (candidateUri === trackUri) return true;

		const candidateTrackId = getTrackIdFromUri(candidateUri);
		const trackId = getTrackIdFromUri(trackUri);
		return Boolean(candidateTrackId && trackId && candidateTrackId === trackId);
	};

	const getPlaylistItemUid = (item) => getNonEmptyString(
		item?.uid,
		item?.rowId,
		item?.row_id,
		item?.track?.uid,
		item?.track?.rowId,
		item?.track?.row_id,
		item?.item?.uid,
		item?.item?.rowId,
		item?.item?.row_id
	);

	const getPlaylistFindTrackMatch = (matches, trackUri) => {
		const trackId = getTrackIdFromUri(trackUri);
		if (!matches) return createPlaylistTrackMatch();

		if (!Array.isArray(matches) && typeof matches === "object") {
			const directMatch = matches[trackUri] || matches[trackId];
			if (Array.isArray(directMatch)) {
				return createPlaylistTrackMatch(directMatch.length > 0, directMatch);
			}
			if (directMatch && typeof directMatch === "object") {
				const uids = [
					...(Array.isArray(directMatch.uids) ? directMatch.uids : []),
					directMatch.uid
				];
				return createPlaylistTrackMatch(Boolean(
					directMatch.found ||
					directMatch.contains ||
					directMatch.exists ||
					directMatch.uid ||
					directMatch.count > 0 ||
					directMatch.uids?.length > 0
				), uids);
			}
			return createPlaylistTrackMatch(Boolean(directMatch));
		}

		if (!Array.isArray(matches)) return createPlaylistTrackMatch();

		for (const match of matches) {
			if (typeof match === "string" && isSameTrackUri(match, trackUri)) {
				return createPlaylistTrackMatch(true);
			}
			if (!match || typeof match !== "object") continue;

			const matchUri = getFirstSpotifyUri(match.uri, match.track?.uri, match.item?.uri, match.linkedUri);
			if (matchUri && !isSameTrackUri(matchUri, trackUri)) continue;

			const uids = [
				...(Array.isArray(match.uids) ? match.uids : []),
				...(Array.isArray(match.items) ? match.items.map(getPlaylistItemUid) : []),
				match.uid
			];
			const contains = Boolean(
				match.uids?.length > 0 ||
				match.items?.length > 0 ||
				match.found ||
				match.contains ||
				match.exists ||
				match.uid ||
				match.count > 0
			);
			if (contains) return createPlaylistTrackMatch(true, uids);
		}

		return createPlaylistTrackMatch();
	};

	const playlistItemContainsTrack = (item, trackUri) => {
		const itemUris = [
			item?.uri,
			item?.track?.uri,
			item?.item?.uri,
			item?.linkedUri,
			item?.linked_uri,
			item?.linkedFrom?.uri,
			item?.track?.linkedFrom?.uri,
			item?.track?.linked_from?.uri
		];
		return itemUris.some((uri) => isSameTrackUri(getFirstSpotifyUri(uri), trackUri));
	};

	const getPlaylistTrackMatchFromItems = (items, trackUri) => {
		const uids = [];
		let contains = false;

		for (const item of items) {
			if (!playlistItemContainsTrack(item, trackUri)) continue;
			contains = true;
			uids.push(getPlaylistItemUid(item));
		}

		return createPlaylistTrackMatch(contains, uids);
	};

	const getPlaylistTrackMatch = async (playlist, trackUri) => {
		const playlistUri = playlist?.uri || (playlist?.id ? `spotify:playlist:${playlist.id}` : "");
		const playlistApi = Spicetify?.Platform?.PlaylistAPI;
		if (!playlistUri || !trackUri) return createPlaylistTrackMatch();

		if (playlistApi?.find) {
			try {
				const matches = await playlistApi.find(playlistUri, [trackUri]);
				const findMatch = getPlaylistFindTrackMatch(matches, trackUri);
				if (findMatch.contains) return findMatch;
			} catch (error) {
				console.warn("[PlaylistPicker] Failed to check playlist membership with find:", playlistUri, error);
			}
		}

		if (playlistApi?.getContents) {
			try {
				const contents = await playlistApi.getContents(playlistUri, { limit: 9999999 });
				const contentsMatch = getPlaylistTrackMatchFromItems(getPlaylistContentItems(contents), trackUri);
				if (contentsMatch.contains) return contentsMatch;
			} catch (error) {
				console.warn("[PlaylistPicker] Failed to check playlist membership with getContents:", playlistUri, error);
			}
		}

		if (playlistApi?.getListContents) {
			try {
				const contents = await playlistApi.getListContents(playlistUri, { limit: 10000 });
				const listContentsMatch = getPlaylistTrackMatchFromItems(getPlaylistContentItems(contents), trackUri);
				if (listContentsMatch.contains) return listContentsMatch;
			} catch (error) {
				console.warn("[PlaylistPicker] Failed to check playlist membership with contents:", playlistUri, error);
			}
		}

		return createPlaylistTrackMatch();
	};

	const addTrackToSpotifyPlaylist = async (playlist, trackUri) => {
		const playlistUri = playlist?.uri || (playlist?.id ? `spotify:playlist:${playlist.id}` : "");
		if (Spicetify?.Platform?.PlaylistAPI?.add && playlistUri) {
			return await Spicetify.Platform.PlaylistAPI.add(playlistUri, [trackUri], { after: "end" });
		}

		throw new Error("Spicetify PlaylistAPI.add is unavailable.");
	};

	const removeTrackFromSpotifyPlaylist = async (playlist, trackUri, knownUids = []) => {
		const playlistUri = playlist?.uri || (playlist?.id ? `spotify:playlist:${playlist.id}` : "");
		const playlistApi = Spicetify?.Platform?.PlaylistAPI;
		if (!playlistApi?.remove || !playlistUri) {
			throw new Error("Spicetify PlaylistAPI.remove is unavailable.");
		}

		let targetUids = [...new Set(knownUids.filter(Boolean).map(String))];
		if (targetUids.length === 0) {
			const trackMatch = await getPlaylistTrackMatch(playlist, trackUri);
			targetUids = trackMatch.uids;
		}

		if (targetUids.length === 0) {
			throw new Error("Playlist item UID is unavailable.");
		}

		return await playlistApi.remove(
			playlistUri,
			targetUids.map((uid) => ({ uri: trackUri, uid }))
		);
	};

	const PlaylistPickerMenu = ({
		trackUri,
		open,
		onClose,
		anchored = false,
		anchorRef,
		menuRef,
		theme,
		boundary
	}) => {
		const copy = getPlaylistPickerCopy();
		const [playlists, setPlaylists] = useState([]);
		const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);
		const [playlistError, setPlaylistError] = useState("");
		const [addingPlaylistId, setAddingPlaylistId] = useState("");
		const [playlistTrackStatus, setPlaylistTrackStatus] = useState({});
		const [placement, setPlacement] = useState(null);
		const statusCheckRef = useRef(0);
		const previousTrackUriRef = useRef(trackUri);

		const loadPlaylists = useCallback(async () => {
			if (isPlaylistsLoading) return;

			// Every picker on screen shares one cached list, so a second row (or a
			// reopened profile) paints it immediately instead of showing a spinner.
			const cached = getCachedPlaylists();
			if (cached) {
				setPlaylists(cached);
				setPlaylistError("");
				return;
			}

			setIsPlaylistsLoading(true);
			setPlaylistError("");
			try {
				const writablePlaylists = await requestWritableUserPlaylists();
				setPlaylists(writablePlaylists);
				if (writablePlaylists.length === 0) {
					setPlaylistError(copy.empty);
				}
			} catch (error) {
				// Failures are deliberately not cached, so the next open retries.
				console.warn("[PlaylistPicker] Failed to load playlists:", error);
				setPlaylistError(copy.loadFailed);
			} finally {
				setIsPlaylistsLoading(false);
			}
		}, [copy.empty, copy.loadFailed, isPlaylistsLoading]);

		// The load is requested when the menu opens, and the in-flight request
		// is released by the promise itself. A ref holds the latest callback so
		// the effect below stays keyed on `open` alone: keying it on the loading
		// flag re-fires the request on every state change, which hammers a
		// failing rootlist in a loop.
		const loadPlaylistsRef = useRef(loadPlaylists);
		useEffect(() => {
			loadPlaylistsRef.current = loadPlaylists;
		}, [loadPlaylists]);

		const loadPlaylistTrackStatuses = useCallback(async (targetPlaylists, uri) => {
			const checkToken = ++statusCheckRef.current;
			const validPlaylists = Array.isArray(targetPlaylists) ? targetPlaylists.filter((playlist) => playlist?.id) : [];

			if (!String(uri || "").startsWith("spotify:track:") || validPlaylists.length === 0) {
				setPlaylistTrackStatus({});
				return;
			}

			const initialStatus = {};
			for (const playlist of validPlaylists) {
				initialStatus[playlist.id] = { status: "checking", uids: [] };
			}
			setPlaylistTrackStatus(initialStatus);

			for (let index = 0; index < validPlaylists.length; index += PLAYLIST_STATUS_BATCH_SIZE) {
				const batch = validPlaylists.slice(index, index + PLAYLIST_STATUS_BATCH_SIZE);
				const batchResults = await Promise.all(batch.map(async (playlist) => {
					try {
						const trackMatch = await getPlaylistTrackMatch(playlist, uri);
						return [
							playlist.id,
							{
								status: trackMatch.contains ? "contains" : "missing",
								uids: trackMatch.uids
							}
						];
					} catch (error) {
						console.warn("[PlaylistPicker] Failed to check playlist track status:", playlist?.uri || playlist?.id, error);
						return [playlist.id, { status: "missing", uids: [] }];
					}
				}));

				if (statusCheckRef.current !== checkToken) return;

				setPlaylistTrackStatus((previousStatus) => {
					const nextStatus = { ...previousStatus };
					for (const [playlistId, status] of batchResults) {
						nextStatus[playlistId] = status;
					}
					return nextStatus;
				});
			}
		}, []);

		const handlePlaylistItemAction = useCallback(async (playlist) => {
			const uri = trackUri || "";
			if (!uri.startsWith("spotify:track:")) {
				Toast.error(copy.noTrack);
				return;
			}
			if (!playlist?.id || addingPlaylistId) return;

			setAddingPlaylistId(playlist.id);
			let attemptedPlaylistRemoval = false;
			const markPlaylistTrackRemoved = () => {
				setPlaylistTrackStatus((previousStatus) => ({
					...previousStatus,
					[playlist.id]: { status: "missing", uids: [] }
				}));
				Toast.success(copy.removed.replace("{playlist}", playlist.name || "playlist"));
			};
			try {
				if (getPlaylistStatusValue(playlistTrackStatus[playlist.id]) === "contains") {
					attemptedPlaylistRemoval = true;
					await removeTrackFromSpotifyPlaylist(playlist, uri, getPlaylistStatusUids(playlistTrackStatus[playlist.id]));
					markPlaylistTrackRemoved();
					return;
				}

				const trackMatch = await getPlaylistTrackMatch(playlist, uri);
				if (trackMatch.contains) {
					setPlaylistTrackStatus((previousStatus) => ({
						...previousStatus,
						[playlist.id]: { status: "contains", uids: trackMatch.uids }
					}));
					attemptedPlaylistRemoval = true;
					await removeTrackFromSpotifyPlaylist(playlist, uri, trackMatch.uids);
					markPlaylistTrackRemoved();
					return;
				}

				await addTrackToSpotifyPlaylist(playlist, uri);
				setPlaylistTrackStatus((previousStatus) => ({
					...previousStatus,
					[playlist.id]: { status: "contains", uids: [] }
				}));
				onClose?.();
				Toast.success(copy.added.replace("{playlist}", playlist.name || "playlist"));
			} catch (error) {
				console.warn("[PlaylistPicker] Failed to update playlist track:", error);
				Toast.error(attemptedPlaylistRemoval ? copy.removeFailed : copy.addFailed);
			} finally {
				setAddingPlaylistId("");
			}
		}, [addingPlaylistId, copy, onClose, playlistTrackStatus, trackUri]);

		// A different track invalidates the membership of the previous one.
		useEffect(() => {
			if (previousTrackUriRef.current === trackUri) return;
			previousTrackUriRef.current = trackUri;
			statusCheckRef.current += 1;
			setPlaylistTrackStatus({});
		}, [trackUri]);

		// Request the list when the menu opens. Keyed on `open` alone, so it fires
		// once per opening and never again while the menu stays open.
		useEffect(() => {
			if (!open) return;
			loadPlaylistsRef.current();
		}, [open]);

		useEffect(() => {
			if (!open || isPlaylistsLoading || playlistError || playlists.length === 0) return;

			loadPlaylistTrackStatuses(playlists, trackUri);
			return () => {
				statusCheckRef.current += 1;
			};
		}, [open, isPlaylistsLoading, playlistError, playlists, trackUri, loadPlaylistTrackStatuses]);

		// Anchored hosts (the creator profile grid) scroll and resize under the
		// menu, so the placement is recomputed rather than measured once.
		useEffect(() => {
			if (!anchored || !open) {
				setPlacement(null);
				return undefined;
			}

			const update = () => {
				const anchorRect = anchorRef?.current?.getBoundingClientRect?.();
				if (!anchorRect) return;
				const popoverRect = menuRef?.current?.getBoundingClientRect?.();
				const boundaryElement = typeof boundary === "string"
					? anchorRef?.current?.closest?.(boundary)
					: boundary;
				setPlacement(resolvePlaylistPopoverPlacement({
					anchor: anchorRect,
					popover: popoverRect || { width: 0, height: 0 },
					viewport: { width: window.innerWidth, height: window.innerHeight },
					boundary: boundaryElement?.getBoundingClientRect?.() || null
				}));
			};

			update();
			window.addEventListener("scroll", update, true);
			window.addEventListener("resize", update);
			return () => {
				window.removeEventListener("scroll", update, true);
				window.removeEventListener("resize", update);
			};
		}, [anchored, anchorRef, boundary, menuRef, open, trackUri]);

		if (!open) return null;

		const popover = react.createElement(
			"div",
			{
				className: "fullscreen-playlist-popover",
				role: "menu",
				ref: menuRef,
				// An anchored menu is portalled to <body>, so it carries the host
				// theme itself and cannot rely on an ancestor selector.
				"data-ui-theme": theme,
				style: anchored
					? {
						position: "fixed",
						top: `${placement?.top ?? 0}px`,
						left: `${placement?.left ?? 0}px`,
						right: "auto",
						bottom: "auto",
						// The creator profile modal already owns the topmost layer.
						zIndex: "var(--iv-layer-modal)",
						visibility: placement ? "visible" : "hidden"
					}
					: undefined
			},
			PlaylistPickerPanel({
				copy,
				playlists,
				error: playlistError,
				loading: isPlaylistsLoading,
				statuses: playlistTrackStatus,
				pendingPlaylistId: addingPlaylistId,
				onItemAction: handlePlaylistItemAction
			})
		);

		// The creator profile grid scrolls, so an in-flow menu would be clipped.
		return anchored && reactDom?.createPortal && document.body
			? reactDom.createPortal(popover, document.body)
			: popover;	};

	const PlaylistPickerButton = ({
		trackUri,
		buttonClassName = "",
		buttonStyle,
		buttonTitle,
		iconSize = 24,
		anchored = false,
		activeClassName = "active",
		theme,
		boundary,
		wrapperClassName = "fullscreen-playlist-control",
		open: controlledOpen,
		onOpenChange
	}) => {
		const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
		const wrapperRef = useRef(null);
		const triggerRef = useRef(null);
		const menuRef = useRef(null);
		const isControlled = controlledOpen !== undefined;
		const open = isControlled ? controlledOpen : uncontrolledOpen;

		const setOpen = (next) => {
			if (!isControlled) setUncontrolledOpen(next);
			if (onOpenChange) onOpenChange(next);
		};

		useEffect(() => {
			if (!open) return undefined;

			const handleOutsidePointer = (event) => {
				if (wrapperRef.current?.contains?.(event.target)) return;
				if (menuRef.current?.contains?.(event.target)) return;
				setOpen(false);
			};

			document.addEventListener("mousedown", handleOutsidePointer, true);
			return () => document.removeEventListener("mousedown", handleOutsidePointer, true);
		}, [open]);

		return react.createElement(
			"div",
			{ className: wrapperClassName, ref: wrapperRef },
			react.createElement(
				"button",
				{
					className: `${buttonClassName}${open && activeClassName ? ` ${activeClassName}` : ""}`.trim(),
					style: buttonStyle,
					onClick: () => setOpen(!open),
					title: buttonTitle || getPlaylistPickerCopy().title,
					"aria-haspopup": "menu",
					"aria-expanded": open ? "true" : "false",
					ref: triggerRef
				},
				react.createElement("svg", {
					viewBox: "0 0 24 24",
					width: iconSize,
					height: iconSize,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					dangerouslySetInnerHTML: { __html: PLAYLIST_ADD_ICON_PATH }
				})
			),
			PlaylistPickerMenu({
				trackUri,
				open,
				onClose: () => setOpen(false),
				anchored,
				anchorRef: triggerRef,
				menuRef,
				theme,
				boundary
			})
		);
	};

	return { PlaylistPickerMenu, PlaylistPickerButton };
})();

window.PlaylistPicker = PlaylistPicker;
