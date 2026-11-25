import { doesSyncCreatorLrclibSourceMatchShape } from "./lrclibSyncSource.mjs";
import { encodeSyncCreatorWorkSnapshot } from "./syncSnapshot.mjs";
import { sanitizeSyncCreatorLastCharEnds } from "./timingValidation.mjs";

export function buildSyncCreatorScoreSnapshot(data, {
	editingVersion, trackDurationMs, lyricsFullTextChars, lyricsLanguage, lyricsTextLrclibShape,
	prepareSyncCreatorWorkSnapshot, clipSyncCreatorSyncDataToLineBounds,
	attachSelectedLrclibSource, compactSyncCreatorSyncData,
}) {
	const raw = sanitizeSyncCreatorLastCharEnds(clipSyncCreatorSyncDataToLineBounds(
		prepareSyncCreatorWorkSnapshot(data || { version: editingVersion, lines: [] })
	));
	const expanded = attachSelectedLrclibSource(raw);
	if (!expanded) return null;
	// A source the data already carries stays, but only one made from the
	// lyrics these timings are on: an older version's source (a restored
	// draft, an earlier load) would be rejected by the server and stop the
	// work queue. Otherwise the source matched to the shown lyrics is used.
	if (doesSyncCreatorLrclibSourceMatchShape(raw.source, lyricsTextLrclibShape)) expanded.source = raw.source;
	return compactSyncCreatorSyncData({
		...expanded, ...(trackDurationMs > 0 ? { trackDurationMs } : {})
	}, lyricsFullTextChars, lyricsLanguage || undefined);
}

export function repairSyncCreatorScoreSnapshot(data, {
	prepareSyncCreatorWorkSnapshot, clipSyncCreatorSyncDataToLineBounds, assertValidSyncCreatorSyncData, readSyncCreatorCodec,
}) {
	try {
		const repaired = sanitizeSyncCreatorLastCharEnds(clipSyncCreatorSyncDataToLineBounds(prepareSyncCreatorWorkSnapshot(data)));
		assertValidSyncCreatorSyncData(repaired);
		// Keep the historical source and body. Current layout drafts and the
		// current song's source must never be projected onto queued work.
		const codec = readSyncCreatorCodec();
		return codec.encode(encodeSyncCreatorWorkSnapshot(repaired, codec.decode(data)));
	} catch (_) {
		return null;
	}
}

export function buildSyncCreatorImportedScoreWork(data, target, { editingVersion, trackDurationMs, compactSyncCreatorSyncData }) {
	const source = target.lrclibSource;
	const track = trackDurationMs > 0 ? { trackDurationMs } : {};
	const compact = (body) => compactSyncCreatorSyncData({ ...body, ...track, source }, target.lyricsChars);
	return {
		snapshot: compact(data),
		baseline: compact(target.publishedBaseline || { version: editingVersion, lines: [] }),
	};
}
