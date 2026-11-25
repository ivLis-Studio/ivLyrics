import {
    hasExactSyncDataLineShape as hasExactSyncCreatorLineShape,
    findSyncDataLineShapePrefix as findSyncCreatorSourceLinePrefix,
    getSyncDataLeadingCharOffset as getSyncCreatorLeadingCharOffset,
    shiftSyncDataLineIndexes as shiftSyncCreatorLineIndexes,
    fingerprintSyncDataLyricsText,
} from "./syncLyricSourceShape.mjs";
import { SyncDataSourceCompatibility } from "../../lyrics/syncDataSourceCompatibility.mjs";

const SYNC_CREATOR_SOURCE_ADDON_ID = 'lrclib';

const normalizeSyncCreatorLrclibId = (value) => {
	const normalized = value === null || value === undefined ? '' : String(value).trim();
	return /^[1-9]\d*$/.test(normalized) ? normalized : '';
};

const isCompleteSyncCreatorLrclibSource = (source) => {
	if (!source || source.provider !== SYNC_CREATOR_SOURCE_ADDON_ID) return false;
	if (!normalizeSyncCreatorLrclibId(source.lrclibId)) return false;
	if (!['synced', 'plain', 'unknown'].includes(source.preferredLyricsSource)) return false;
	if (!Number.isFinite(source.duration) || source.duration < 0 || source.duration > 86400) return false;
	if (!/^lrclib-[a-z0-9]+-[a-z0-9]+$/i.test(String(source.lyricsFingerprint || ''))) return false;
	if (!Array.isArray(source.lineCharCounts) || source.lineCharCounts.length === 0 || source.lineCharCounts.length > 5000) return false;
	if (source.lineCount !== source.lineCharCounts.length) return false;
	let textCharCount = 0;
	for (const count of source.lineCharCounts) {
		if (!Number.isInteger(count) || count < 0 || count > 2000) return false;
		textCharCount += count;
	}
	return source.textCharCount === textCharCount;
};

const normalizeSourceLines = (text) => String(text || '')
    .normalize('NFC')
    .split('\n')
    .map(line => line.trim().normalize('NFC'))
    .filter(Boolean);

const getLineCharCounts = (lines) => lines.map(line => Array.from(line).length);

const getSyncCreatorLineCharCountsFromText = (text) => getLineCharCounts(normalizeSourceLines(text));

const fingerprintSourceLines = (lines) => fingerprintSyncDataLyricsText(lines.join('\n'));

const getSyncCreatorLyricsFingerprintFromText = (text) => fingerprintSourceLines(normalizeSourceLines(text));

const normalizeSyncBodyForSource = (syncBody, lyricsText, decodeSyncBody) => {
	if (syncBody?.version === 6) syncBody = decodeSyncBody(syncBody);
	if (!syncBody || !Array.isArray(syncBody.lines)) return syncBody;

	const sourceLineCounts = Array.isArray(syncBody?.source?.lineCharCounts)
		? syncBody.source.lineCharCounts
		: null;
	const currentLines = normalizeSourceLines(lyricsText);
	const currentLineCounts = getLineCharCounts(currentLines);
	if (!sourceLineCounts) {
		return SyncDataSourceCompatibility.hasCompatibleLegacyLineRanges(syncBody.lines, currentLineCounts)
			? syncBody
			: null;
	}
	const prefix = findSyncCreatorSourceLinePrefix(sourceLineCounts, currentLineCounts);
	if (prefix < 0) return null;
	if (prefix === 0 && syncBody?.source?.lyricsFingerprint) {
		const currentFingerprint = fingerprintSourceLines(currentLines);
		if (syncBody.source.lyricsFingerprint !== currentFingerprint) return null;
	}
	if (prefix <= 0) return syncBody;

	const charOffset = getSyncCreatorLeadingCharOffset(sourceLineCounts, prefix);
	if (!charOffset) return syncBody;

	return {
		...syncBody,
		lines: shiftSyncCreatorLineIndexes(syncBody.lines, charOffset)
	};
};

// Fingerprint and line lengths of a lyrics text, as an LRCLIB source records them.
const getSyncCreatorLrclibTextShape = (text) => {
    const lines = normalizeSourceLines(text);
    return {
        lyricsFingerprint: fingerprintSourceLines(lines),
        lineCharCounts: getLineCharCounts(lines),
    };
};

// True when a complete LRCLIB source was made from exactly the text with this
// shape. Sync timings are character positions, so they only fit that text.
const doesSyncCreatorLrclibSourceMatchShape = (source, shape) => (
	isCompleteSyncCreatorLrclibSource(source)
	&& source.lyricsFingerprint === shape?.lyricsFingerprint
	&& hasExactSyncCreatorLineShape(source.lineCharCounts, shape?.lineCharCounts)
);

export {
    SYNC_CREATOR_SOURCE_ADDON_ID,
    normalizeSyncCreatorLrclibId,
    isCompleteSyncCreatorLrclibSource,
    getSyncCreatorLineCharCountsFromText,
    hasExactSyncCreatorLineShape,
    getSyncCreatorLyricsFingerprintFromText,
    normalizeSyncBodyForSource,
    getSyncCreatorLrclibTextShape,
    doesSyncCreatorLrclibSourceMatchShape,
};
