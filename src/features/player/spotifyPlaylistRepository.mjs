import { readSpotifyPlaylistMembership } from "./spotifyPlaylistMembership.mjs";
import { createSpotifyPlaylistReadPool } from "./spotifyPlaylistReadPool.mjs";
import { getNonEmptyString as getPlaylistFieldText, getSpotifyAccountKey } from "#ivlyrics/core/spotifyFields.mjs";
import {
  fetchPlaylistMetadata as fetchPickerPlaylistMetadata, getPlaylistIdFromUri, getPlaylistUriFromItem, getPlaylistImage,
} from "#ivlyrics/features/player/spotifyPlaylistMetadata.mjs";

const PLAYLIST_CACHE_TTL_MS = 5 * 60 * 1000;
const PLAYLIST_METADATA_BATCH_SIZE = 12;

export function createSpotifyPlaylistRepository(spotify, { now = Date.now } = {}) {
	let cache = null;
	const readRootlist = createSpotifyPlaylistReadPool();
	const readMembership = createSpotifyPlaylistReadPool();
	const pendingChanges = new Map();
	const membershipListeners = new Map();

	const getCurrentSpotifyUserId = () => getSpotifyAccountKey(spotify);

	const getPlaylistOwnerId = (...owners) => {
		for (const owner of owners) {
			const rawOwner = getPlaylistFieldText(owner?.username, owner?.id, owner?.uri, owner);
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

	const getRootlistContents = async (isCurrent) => {
		if (!isCurrent()) return null;
		const rootlistApi = spotify?.Platform?.RootlistAPI;
		if (rootlistApi?.getContents) {
			try {
				return await rootlistApi.getContents({ flatten: true });
			} catch (error) {
				if (!isCurrent()) return null;
				try {
					return await rootlistApi.getContents();
				} catch (fallbackError) {
					if (!isCurrent()) return null;
					console.warn("[PlaylistPicker] RootlistAPI failed; falling back to Cosmos rootlist.", fallbackError);
				}
			}
		}

		if (spotify?.CosmosAsync?.get) {
			return await spotify.CosmosAsync.get("sp://core-playlist/v1/rootlist");
		}

		throw new Error("Rootlist API is unavailable.");
	};

	const normalizeRootlistPlaylist = async (playlist, currentUserId) => {
		const uri = getPlaylistUriFromItem(playlist);
		const id = playlist?.id || getPlaylistIdFromUri(uri);
		if (!id) return null;

		const metadata = await fetchPickerPlaylistMetadata(spotify, uri);
		if (!isWritablePlaylist(playlist, metadata, currentUserId)) return null;

		return {
			id,
			uri,
			name: getPlaylistFieldText(metadata?.name, playlist?.name, playlist?.title) || "Playlist",
			image: getPlaylistImage(metadata?.images, playlist?.images, metadata?.image, playlist?.image),
			total: getPlaylistTotal(playlist, metadata)
		};
	};

	const fetchWritableUserPlaylists = async (currentUserId, isCurrent) => {
		const rootlist = await getRootlistContents(isCurrent);
		if (!isCurrent()) return null;
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
			if (!isCurrent()) return null;
			for (const normalizedPlaylist of normalizedBatch) {
				if (normalizedPlaylist) {
					normalizedPlaylists.push(normalizedPlaylist);
				}
			}
		}

		return normalizedPlaylists;
	};

	const getCachedPlaylists = (accountId) => (
		cache?.accountId === accountId && now() - cache.savedAt < PLAYLIST_CACHE_TTL_MS ? cache.playlists : null
	);

	const requestWritableUserPlaylists = (accountId, signal) => readRootlist(accountId, signal, async (sharedSignal) => {
		const isCurrent = () => !sharedSignal.aborted && getCurrentSpotifyUserId() === accountId;
		const playlists = await fetchWritableUserPlaylists(accountId, isCurrent);
		if (!isCurrent() || !playlists) return null;
		cache = { accountId, playlists, savedAt: now() };
		return playlists;
	});

	const getPlaylistUri = playlist => playlist?.uri || (playlist?.id ? `spotify:playlist:${playlist.id}` : "");
	const membershipKey = (accountId, trackUri, playlistUri) => JSON.stringify([accountId, trackUri, playlistUri]);

	function getPlaylistTrackMatch(playlist, trackUri, accountId, signal) {
		const playlistUri = getPlaylistUri(playlist);
		const key = membershipKey(accountId, trackUri, playlistUri);
		return readMembership(key, signal, async (sharedSignal) => {
			const isCurrent = () => !sharedSignal.aborted && getCurrentSpotifyUserId() === accountId;
			// A picker opened while an earlier mutation is in flight should read
			// the committed contents. A failed mutation still needs a fresh read.
			let waitedFor;
			while (isCurrent()) {
				const change = pendingChanges.get(key);
				if (!change || change === waitedFor) break;
				waitedFor = change;
				await change.catch(() => {});
			}
			return readSpotifyPlaylistMembership(spotify?.Platform?.PlaylistAPI, playlistUri, trackUri, { isCurrent });
		});
	}

	function subscribeToMembershipChanges(accountId, trackUri, listener) {
		const key = membershipKey(accountId, trackUri);
		const listeners = membershipListeners.get(key) ?? new Set();
		listeners.add(listener);
		membershipListeners.set(key, listeners);
		return () => {
			listeners.delete(listener);
			if (!listeners.size) membershipListeners.delete(key);
		};
	}

	function publishMembership(accountId, trackUri, playlistId, contains) {
		if (getCurrentSpotifyUserId() !== accountId) return;
		const listeners = membershipListeners.get(membershipKey(accountId, trackUri));
		for (const listener of [...(listeners || [])]) {
			try {
				if (listeners.has(listener)) listener(playlistId, contains);
			} catch (error) {
				console.warn("[PlaylistPicker] Membership listener failed:", error);
			}
		}
	}

	// Both the fullscreen player and profile rows can select the same track.
	// Serialize their writes and re-read membership before each change.
	async function setPlaylistTrackMembership(playlist, trackUri, contains, accountId, ownsSelection) {
		const playlistUri = getPlaylistUri(playlist);
		const key = membershipKey(accountId, trackUri, playlistUri);
		const isCurrent = () => ownsSelection() && getCurrentSpotifyUserId() === accountId;
		const previous = pendingChanges.get(key);
		const change = (previous ? previous.catch(() => {}) : Promise.resolve()).then(async () => {
			if (!isCurrent()) return null;
			if (!playlistUri || !trackUri) throw new Error("Spotify playlist or track URI is unavailable.");
			const api = spotify?.Platform?.PlaylistAPI;
			const match = await readSpotifyPlaylistMembership(api, playlistUri, trackUri, { requireUids: !contains, isCurrent });
			if (!match || !isCurrent()) return null;
			const changed = match.contains !== contains;
			if (changed && contains) {
				if (!api?.add) throw new Error("Spicetify PlaylistAPI.add is unavailable.");
				await api.add(playlistUri, [trackUri], { after: "end" });
			} else if (changed) {
				if (!api?.remove) throw new Error("Spicetify PlaylistAPI.remove is unavailable.");
				await api.remove(playlistUri, match.uids.map(uid => ({ uri: trackUri, uid })));
			}
			publishMembership(accountId, trackUri, playlist.id, contains);
			return { contains, changed };
		});
		pendingChanges.set(key, change);
		try {
			return await change;
		} finally {
			if (pendingChanges.get(key) === change) pendingChanges.delete(key);
		}
	}

	return {
		getCurrentSpotifyUserId,
		getCachedPlaylists,
		requestWritableUserPlaylists,
		getPlaylistTrackMatch,
		subscribeToMembershipChanges,
		setPlaylistTrackMembership,
	};
}
