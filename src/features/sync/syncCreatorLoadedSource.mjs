import { normalizeSyncBodyForSource } from './lrclibSyncSource.mjs';
import {
	detectSyncCreatorParallelVocalHints, getSyncCreatorFlatLyricsCharsFromText, SYNC_CREATOR_PARALLEL_HINT_REGEX,
} from './syncCreatorLyricText.mjs';

export function describeSyncCreatorLoadedSource(result, addonId) {
	const provider = result.provider || addonId;
	const source = provider === 'lrclib' ? (result.lrclibSource || null) : null;
	return {
		provider: (provider === 'Spotify' || provider === 'spotify') && result.spotifyLyricsProvider
			? `spotify-${result.spotifyLyricsProvider}` : provider,
		lrclibSource: source,
		lrclibId: provider === 'lrclib' ? (source?.lrclibId || result.lrclibId) : null,
	};
}

export function requestSyncCreatorPublishedSync(syncService, trackId, provider, { isrc, title, artist, album }) {
	return syncService.getSyncData(trackId, provider, { isrc: isrc || undefined, title, artist, album });
}

export function prepareSyncCreatorPublishedSync(body, lyricsText, { getCodec, sanitize, debug }) {
	const matching = normalizeSyncBodyForSource(body, lyricsText, value => getCodec().decode(value));
	if (!matching) {
		debug?.('[SyncDataCreator] Existing sync source does not match the selected lyrics; starting without its timings');
	} else if (matching !== body) {
		debug?.('[SyncDataCreator] Trimmed leading sync-data source lines for current lyrics');
	}
	return sanitize(matching, getSyncCreatorFlatLyricsCharsFromText(lyricsText));
}

export function hasPublishedSyncLines(body) {
	return Array.isArray(body?.lines) && body.lines.length > 0;
}

export function getSyncCreatorLoadedVocalMode(text, effectiveSyncBody) {
	const multiVocal = Array.isArray(effectiveSyncBody?.lines)
		&& effectiveSyncBody.lines.some(line => Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1);
	if (multiVocal || !detectSyncCreatorParallelVocalHints(text)) return { multiVocal, decision: null };
	return {
		multiVocal,
		decision: { text, preview: text.split('\n').find(line => SYNC_CREATOR_PARALLEL_HINT_REGEX.test(line.trim())) || '' },
	};
}
