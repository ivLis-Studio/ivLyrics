import {
	doesSyncCreatorLrclibSourceMatchShape, getSyncCreatorLrclibTextShape, getSyncCreatorLyricsFingerprintFromText,
	isCompleteSyncCreatorLrclibSource,
	normalizeSyncCreatorLrclibId,
} from './lrclibSyncSource.mjs';
import { normalizeSyncCreatorStandaloneParentheticalLines } from './syncCreatorLyricText.mjs';
import { fingerprintSyncDataLyricsText } from './syncLyricSourceShape.mjs';

const SYNC_CREATOR_LRC_METADATA_LINE_REGEX = /^\s*\[(?:ar|al|ti|au|length|by|offset|re|ve):[^\]]*\]\s*$/i;

const stripLrclibTimestamp = (text) => {
	if (!text || typeof text !== 'string') return '';
	const trimmed = text.trim();
	if (SYNC_CREATOR_LRC_METADATA_LINE_REGEX.test(trimmed)) return '';
	return trimmed.replace(/^\[\d+:\d+(?:[.,]\d+)?\]\s*/, '').trim();
};

export const extractLyricsText = (lyricsSource) => {
	let text = '';

	if (Array.isArray(lyricsSource)) {
		text = lyricsSource.map(line => {
			if (typeof line === 'string') return line;
			if (line.originalText && typeof line.originalText === 'string' && line.originalText.trim().length > 0) return line.originalText;
			if (line.text) return typeof line.text === 'string' ? line.text : '';
			return '';
		}).filter(t => t.trim().length > 0).join('\n');
	} else if (typeof lyricsSource === 'string') {
		text = lyricsSource;
	}

	return text ? normalizeSyncCreatorStandaloneParentheticalLines(text) : '';
};

const buildLineObjectsFromText = (text) => {
	if (!text || typeof text !== 'string') return [];
	return text
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => ({ text: line.normalize('NFC') }));
};

export const getLrclibCandidateText = (candidate) => {
	if (!candidate) return '';

	const usePlain = candidate.preferredLyricsSource === 'plain' && candidate.plainLyrics;
	const sourceText = usePlain
		? candidate.plainLyrics
		: (candidate.syncedLyrics || candidate.plainLyrics || '');

	if (!sourceText) return '';

	return normalizeSyncCreatorStandaloneParentheticalLines(sourceText
		.split('\n')
		.map(line => stripLrclibTimestamp(line))
		.filter(Boolean)
		.join('\n'));
};

const getSyncCreatorLyricsFingerprint = (text) => fingerprintSyncDataLyricsText(String(text || '').normalize('NFC'));

export const buildLrclibSyncSource = (candidate) => {
	if (!candidate) return null;
	const lrclibId = normalizeSyncCreatorLrclibId(candidate.id ?? candidate.lrclibId);
	if (!lrclibId) return null;
	const text = getLrclibCandidateText(candidate).normalize('NFC');
	const comparableLines = text
		.split('\n')
		.map(line => line.trim().normalize('NFC'))
		.filter(Boolean);
	if (comparableLines.length === 0) return null;
	const comparableText = comparableLines.join('\n');
	const lineCharCounts = comparableLines
		.map(line => Array.from(line).length);
	const preferredLyricsSource = candidate.preferredLyricsSource
		|| (candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : 'unknown'));

	return {
		provider: 'lrclib',
		lrclibId,
		searchSource: candidate.searchSource || '',
		preferredLyricsSource,
		trackName: candidate.trackName || candidate.name || '',
		artistName: candidate.artistName || '',
		albumName: candidate.albumName || '',
		duration: Number(candidate.duration || 0) || 0,
		lyricsFingerprint: getSyncCreatorLyricsFingerprint(comparableText),
		lineCharCounts,
		lineCount: lineCharCounts.length,
		textCharCount: Array.from(comparableLines.join('')).length
	};
};

export const buildSyntheticLrclibResult = (candidate) => {
	const text = getLrclibCandidateText(candidate);
	const lines = buildLineObjectsFromText(text);
	const timedSource = String(candidate?.syncedLyrics || '').split('\n')
		.filter(line => stripLrclibTimestamp(line));
	const timedLines = normalizeSyncCreatorStandaloneParentheticalLines(timedSource.map(stripLrclibTimestamp).join('\n'))
		.split('\n').map((text, index) => {
			const line = { text: text.trim() };
			const match = timedSource[index]?.trim().match(/^\[(\d+):(\d+(?:[.,]\d+)?)\]/);
			return match ? { ...line, startTime: (Number(match[1]) * 60 + Number(match[2].replace(',', '.'))) * 1000 } : line;
		}).filter(line => line.text);
	const syncedLines = timedLines.length === lines.length && timedLines.every((line, index) => line.text === lines[index].text)
		? timedLines : lines;
	return {
		provider: 'lrclib',
		lrclibSource: buildLrclibSyncSource(candidate),
		synced: candidate?.preferredLyricsSource === 'synced' ? syncedLines : null,
		unsynced: lines
	};
};

// One LRCLIB entry can carry different timed and plain texts. These find
// the version a saved sync source was made from.
const getLrclibRecordVariantText = (record, variant) => {
	const hasVariant = variant === 'synced' ? !!record?.syncedLyrics : (variant === 'plain' && !!record?.plainLyrics);
	return hasVariant ? getLrclibCandidateText({ ...record, preferredLyricsSource: variant }) : '';
};

export const getLrclibRecordVariantForSource = (record, source) => {
	if (!record || !isCompleteSyncCreatorLrclibSource(source)) return '';
	const recordId = normalizeSyncCreatorLrclibId(record.id ?? record.lrclibId);
	if (recordId && recordId !== normalizeSyncCreatorLrclibId(source.lrclibId)) return '';
	return [...new Set([source.preferredLyricsSource, 'synced', 'plain'])].find(variant => {
		const variantText = getLrclibRecordVariantText(record, variant);
		return !!variantText && doesSyncCreatorLrclibSourceMatchShape(source, getSyncCreatorLrclibTextShape(variantText));
	}) || '';
};

export const buildLrclibIdCandidate = (candidate, requestedId, variant, { trackName, artistName, durationMs }) => {
	if (!candidate) return null;
	const preferredLyricsSource = (variant === 'synced' && candidate.syncedLyrics) || (variant === 'plain' && candidate.plainLyrics)
		? variant
		: (candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : 'unknown'));
	const baseCandidate = {
		...candidate,
		id: candidate.id ?? requestedId,
		preferredLyricsSource,
		searchSource: 'id'
	};
	const previewText = getLrclibCandidateText(baseCandidate);
	const previewLines = previewText
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);
	const trackDurationSec = Math.max(0, Number(durationMs) || 0) / 1000;

	return {
		...baseCandidate,
		candidateKey: `id:0:${candidate.id ?? requestedId}:${getSyncCreatorLyricsFingerprint(previewText)}`,
		trackName: candidate.trackName || candidate.name || trackName,
		artistName: candidate.artistName || artistName,
		albumName: candidate.albumName || '',
		previewText,
		previewLineCount: previewLines.length,
		hasSyncedLyrics: !!candidate.syncedLyrics,
		hasPlainLyrics: !!candidate.plainLyrics,
		artistScore: 1,
		titleScore: 1,
		durationDiff: trackDurationSec > 0 ? Math.abs(Number(candidate.duration || 0) - trackDurationSec) : 0,
		isSelectedByDefault: true
	};
};

export const buildLrclibSearchCandidate = (candidate, index, sourceLabel, track) => {
	const requestedId = candidate?.id ?? `manual-${index}`;
	const baseCandidate = buildLrclibIdCandidate(candidate, requestedId, '', track);
	if (!baseCandidate) return null;
	const previewText = baseCandidate.previewText || getLrclibCandidateText(baseCandidate);
	return {
		...baseCandidate,
		candidateKey: `${sourceLabel}:${index}:${candidate?.id ?? requestedId}:${getSyncCreatorLyricsFingerprint(previewText)}`,
		searchSource: sourceLabel,
		isSelectedByDefault: index === 0
	};
};

export function getSyncCreatorLrclibCandidateVariants(candidates, shape) {
	return new Map(candidates.map(candidate => [
		candidate,
		['synced', 'plain'].filter(variant => {
			const text = getLrclibRecordVariantText(candidate, variant);
			return !!text && getSyncCreatorLyricsFingerprintFromText(text) === shape.lyricsFingerprint;
		}),
	]));
}

function resolveSyncCreatorLrclibSource({
	currentLrclibSource, loadedLrclibSource, persistedLrclibSource, loadedId,
	lrclibCandidates, lrclibCandidateVariantsForLyrics, lyricsTextLrclibShape, selectedLrclibCandidateKey,
}) {
	const knownLrclibSources = [currentLrclibSource, loadedLrclibSource, persistedLrclibSource];
	const desiredLrclibId = [
		currentLrclibSource?.lrclibId,
		loadedLrclibSource?.lrclibId,
		persistedLrclibSource?.lrclibId,
		loadedId
	].map(normalizeSyncCreatorLrclibId).find(Boolean) || '';
	const selectedCandidate = lrclibCandidates.find(candidate => (
		desiredLrclibId
			? normalizeSyncCreatorLrclibId(candidate?.id ?? candidate?.lrclibId) === desiredLrclibId
			: candidate?.candidateKey === selectedLrclibCandidateKey
	)) || null;
	// The source has to describe the text these timings are on. One LRCLIB
	// entry can carry different timed and plain texts, and a source taken
	// from an imported file or an older submission may name the other one.
	let resolvedSource = knownLrclibSources
		.find(source => doesSyncCreatorLrclibSourceMatchShape(source, lyricsTextLrclibShape)) || null;
	const selectedCandidateId = normalizeSyncCreatorLrclibId(selectedCandidate?.id ?? selectedCandidate?.lrclibId);
	if (selectedCandidate && (!resolvedSource || normalizeSyncCreatorLrclibId(resolvedSource.lrclibId) === selectedCandidateId)) {
		const matchingVariants = lrclibCandidateVariantsForLyrics.get(selectedCandidate) || [];
		const labeledVariant = resolvedSource?.preferredLyricsSource || selectedCandidate.preferredLyricsSource;
		const variant = matchingVariants.includes(labeledVariant) ? labeledVariant : (matchingVariants[0] || '');
		if (variant) {
			resolvedSource = resolvedSource
				? { ...resolvedSource, preferredLyricsSource: variant }
				: buildLrclibSyncSource({ ...selectedCandidate, preferredLyricsSource: variant });
		}
	}
	// Lyrics that no known source describes keep the earlier fallback.
	if (!resolvedSource) {
		resolvedSource = knownLrclibSources.find(isCompleteSyncCreatorLrclibSource)
			|| buildLrclibSyncSource(selectedCandidate);
	}
	return resolvedSource;
}

export function attachSyncCreatorLrclibSource(data, { provider, ...selection }) {
	const resolved = provider === 'lrclib'
		? resolveSyncCreatorLrclibSource({ ...selection, persistedLrclibSource: data.source })
		: null;
	if (resolved) {
		return {
			...data,
			source: { ...resolved, provider: 'lrclib', lrclibId: normalizeSyncCreatorLrclibId(resolved.lrclibId) },
		};
	}
	if (!Object.prototype.hasOwnProperty.call(data, 'source')) return data;
	const withoutSource = { ...data };
	delete withoutSource.source;
	return withoutSource;
}
