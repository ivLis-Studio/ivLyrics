import { normalizeSyncCreatorLrclibId, SYNC_CREATOR_SOURCE_ADDON_ID } from './lrclibSyncSource.mjs';

export function createSyncCreatorLrclibClient({ getTransport, getLyricsSnapshot }) {
	// The startup extension publishes this transport before the provider is
	// registered, and keeps it available when the provider itself is disabled.
	async function fetchLrclib(url, options = {}) {
		const transport = getTransport();
		if (typeof transport?.fetch !== 'function') throw new Error('LRCLIB transport unavailable');
		const response = await transport.fetch(url, options, 35000);
		if (!response) throw new Error('LRCLIB network request failed');
		return response;
	}

	async function readLrclibJson(url, options) {
		const response = await fetchLrclib(url, options);
		if (!response.ok) throw new Error(`LRCLIB ${response.status}`);
		return response.json();
	}

	const getLrclibRecord = (id, signal) => readLrclibJson(`https://lrclib.net/api/get/${encodeURIComponent(id)}`, { signal });
	const searchLrclibRecords = (query, signal) => {
		const params = new URLSearchParams({ q: query });
		return readLrclibJson(`https://lrclib.net/api/search?${params.toString()}`, { signal });
	};

	function getLoadedLrclibId(trackUri) {
		try {
			const snapshot = getLyricsSnapshot(trackUri);
			if (!snapshot) return '';
			const provider = snapshot.provider || snapshot.rawResult?.provider || '';
			if (provider !== SYNC_CREATOR_SOURCE_ADDON_ID) return '';
			const source = snapshot.rawResult?.lrclibSource || null;
			return normalizeSyncCreatorLrclibId(source?.lrclibId ?? snapshot.rawResult?.lrclibId);
		} catch {
			return '';
		}
	}

	return { fetchLrclib, getLoadedLrclibId, getLrclibRecord, searchLrclibRecords };
}
