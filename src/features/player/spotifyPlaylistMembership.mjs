import { getFirstSpotifyUri, getNonEmptyString } from "../../core/spotifyFields.mjs";

const trackId = (uri) => String(uri || "").match(/^spotify:track:([^:]+)/)?.[1];
const isSameTrack = (left, right) => {
	if (left === right) return true;
	const id = trackId(left);
	return id && id === trackId(right);
};
const asArray = (value) => Array.isArray(value) ? value : [];
const normalizeUid = (value) => typeof value === "number" && value ? String(value) : getNonEmptyString(value);
const uniqueUids = (values) => [...new Set(values.map(normalizeUid).filter(Boolean))];
const emptyMatch = { contains: false, uids: [], complete: true };

function readRowUid(item) {
	return getNonEmptyString(
		item?.uid, item?.rowId, item?.row_id,
		item?.track?.uid, item?.track?.rowId, item?.track?.row_id,
		item?.item?.uid, item?.item?.rowId, item?.item?.row_id,
	);
}

function getReferencedTracks(item) {
	return [item?.uri, item?.track?.uri, item?.item?.uri,
		item?.linkedUri, item?.linked_uri, item?.linkedFrom?.uri, item?.linked_from?.uri,
		item?.track?.linkedFrom?.uri, item?.track?.linked_from?.uri,
	].map(value => getFirstSpotifyUri(value)).filter(Boolean);
}

function normalizeFindEntry(value) {
	if (Array.isArray(value)) {
		const uids = value.map(entry => typeof entry === "object" ? readRowUid(entry) : normalizeUid(entry));
		return { contains: value.length > 0, uids: [...new Set(uids.filter(Boolean))], complete: uids.every(Boolean) };
	}
	if (!value || typeof value !== "object") {
		return value ? { contains: true, uids: [], complete: false } : emptyMatch;
	}
	const rows = asArray(value.items);
	const uids = uniqueUids([...asArray(value.uids), ...rows.map(readRowUid), readRowUid(value)]);
	const count = Number(value.count) || 0;
	const contains = uids.length > 0 || rows.length > 0 || count > 0 || Boolean(value.found || value.contains || value.exists);
	return { contains, uids, complete: !contains || uids.length >= Math.max(1, count, rows.length) };
}

function readFindResult(result, trackUri) {
	if (typeof result === "boolean") return normalizeFindEntry(result);
	if (!result || typeof result !== "object" || result.error) return null;
	if (!Array.isArray(result)) return normalizeFindEntry(result[trackUri] ?? result[trackId(trackUri)]);

	let contains = false;
	let complete = true;
	const uids = new Set();
	for (const entry of result) {
		if (typeof entry === "string") {
			if (isSameTrack(entry, trackUri)) {
				contains = true;
				complete = false;
			}
			continue;
		}
		if (!entry || typeof entry !== "object") continue;
		const references = getReferencedTracks(entry);
		if (references.length && !references.some(uri => isSameTrack(uri, trackUri))) continue;
		const match = normalizeFindEntry(entry);
		contains ||= match.contains;
		complete &&= match.complete;
		for (const uid of match.uids) uids.add(uid);
	}
	return { contains, uids: [...uids], complete };
}

function readContentsResult(result, trackUri) {
	const items = [result?.items?.data, result?.items, result?.data?.items, result?.data, result].find(Array.isArray);
	if (!items) return null;
	let contains = false;
	let complete = true;
	const uids = new Set();
	for (const item of items) {
		if (!getReferencedTracks(item).some(uri => isSameTrack(uri, trackUri))) continue;
		contains = true;
		const uid = readRowUid(item);
		if (uid) uids.add(uid);
		else complete = false;
	}
	return { contains, uids: [...uids], complete };
}

export async function readSpotifyPlaylistMembership(api, playlistUri, trackUri, { requireUids = false, isCurrent = () => true } = {}) {
	const sources = [
		["find", [trackUri], readFindResult],
		["getContents", { limit: 9999999 }, readContentsResult],
		["getListContents", { limit: 10000 }, readContentsResult],
	];
	let known = null;
	for (const [method, options, normalize] of sources) {
		if (!isCurrent()) return null;
		if (typeof api?.[method] !== "function") continue;
		try {
			const result = await api[method](playlistUri, options);
			if (!isCurrent()) return null;
			const match = normalize(result, trackUri);
			if (!match) continue;
			if (match.contains && (!requireUids || match.complete)) return match;
			if (match.contains || !known) known = match;
		} catch (error) {
			if (!isCurrent()) return null;
			console.warn("[PlaylistPicker] Failed to check playlist membership:", method, playlistUri, error);
		}
	}
	if (!known) throw new Error("Playlist membership is unavailable.");
	if (known.contains && requireUids) throw new Error("Playlist item UIDs are incomplete.");
	return known;
}
