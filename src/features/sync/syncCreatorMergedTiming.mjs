import {
	resolveSyncCreatorManualSplitState, preserveSyncCreatorParallelTimingRuns,
} from "./parallelTiming.mjs";
import { normalizeSyncCreatorGranularity, normalizeSyncCreatorTimeSequence } from "./timingGranularity.mjs";
import { SYNC_CREATOR_DEFAULT_SPEAKER, SYNC_CREATOR_DEFAULT_KIND } from "./syncCreatorVocalStyles.mjs";

const partIds = 'abcdefghijklmnopqrstuvwxyz'.split('');

export function distributeSyncCreatorManualSplitDraft(drafts, {
	lineStart, mergedEnd, currentMergedLineIndexes, lineCharOffsets, getLineEndAtIndex,
}) {
	if (!Object.prototype.hasOwnProperty.call(drafts, lineStart)) return drafts;
	const { manualSplitPoints } = resolveSyncCreatorManualSplitState(drafts, lineStart, mergedEnd - lineStart + 1);
	const next = { ...drafts };
	for (const index of currentMergedLineIndexes) {
		const start = lineCharOffsets[index];
		const end = getLineEndAtIndex(index);
		// An explicit empty list keeps a removed boundary from being restored
		// by the previously saved layout when a source line is shown again.
		next[start] = manualSplitPoints.map(point => lineStart + point - start)
			.filter(point => point > 0 && point <= end - start);
	}
	return next;
}

export function prepareSyncCreatorLineMerge({
	currentStart, currentMergedLineIndexes, nextMergeLineIndexes, getLineEndAtIndex,
	lineCharOffsets, syncData, manualParallelSplitDrafts,
}) {
	const nextMergedLineIndexes = [...currentMergedLineIndexes, ...nextMergeLineIndexes];
	const mergedEnd = getLineEndAtIndex(nextMergedLineIndexes.at(-1));
	const sourceLinesByStart = new Map((syncData?.lines || []).map(line => [line.start, line]));
	const ownersByIndex = new Map();
	for (const group of [currentMergedLineIndexes, nextMergeLineIndexes]) {
		const owner = { start: lineCharOffsets[group[0]], end: getLineEndAtIndex(group.at(-1)) };
		for (const index of group) ownersByIndex.set(index, owner);
	}
	let hasManualSplitState = false;
	const mergedManualSplitPoints = [...new Set(nextMergedLineIndexes.flatMap(index => {
		const start = lineCharOffsets[index];
		const end = getLineEndAtIndex(index);
		const owner = ownersByIndex.get(index);
		const sourceLine = sourceLinesByStart.get(start) || sourceLinesByStart.get(owner.start);
		const sourceStart = sourceLine?.start ?? owner.start;
		const sourceEnd = sourceStart === owner.start ? Math.max(owner.end, sourceLine?.end ?? owner.end) : end;
		hasManualSplitState ||= Object.prototype.hasOwnProperty.call(manualParallelSplitDrafts, sourceStart)
			|| Array.isArray(sourceLine?.parallel?.manualSplitPoints);
		return resolveSyncCreatorManualSplitState(
			manualParallelSplitDrafts, sourceStart, sourceEnd - sourceStart + 1, sourceLine?.parallel
		).manualSplitPoints
			.map(point => sourceStart + point)
			.filter(point => point > start && point <= end)
			.map(point => point - currentStart);
	}))].sort((left, right) => left - right);
	return { nextMergedLineIndexes, mergedEnd, ownersByIndex, hasManualSplitState, mergedManualSplitPoints };
}

export function mergeSyncCreatorLineTiming(prev, {
	currentStart, mergedEnd, nextMergedLineIndexes, ownersByIndex, hasManualSplitState, mergedManualSplitPoints,
	lineCharOffsets, getLineEndAtIndex, lyricsLines, editingVersion,
}, {
	inheritSyncCreatorParallelPartChars, sliceSyncCreatorLineTiming, normalizeSyncCreatorSpeaker,
	sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorKind,
	normalizeSyncCreatorHiddenRanges, normalizeSyncCreatorStyleRanges, sanitizeSyncCreatorParallel,
}) {
	if (!prev || !Array.isArray(prev.lines)) return prev;

	const linesByStart = new Map(prev.lines.map(line => [line.start, line]));

	const getPartSnapshot = (lineIndex) => {
		const lineStart = lineCharOffsets[lineIndex];
		const lineEnd = getLineEndAtIndex(lineIndex);
		const lineChars = Array.from(lyricsLines[lineIndex] || '');
		if (!Number.isInteger(lineStart) || lineEnd < lineStart || lineChars.length === 0) return null;

		const directLine = linesByStart.get(lineStart);
		const timingSource = directLine || linesByStart.get(ownersByIndex.get(lineIndex).start);
		const existingPart = timingSource?.parallel?.parts?.find(part =>
			Array.isArray(part?.ranges)
			&& part.ranges.some(range =>
				Number(range?.start) <= lineStart
				&& Number(range?.end) >= lineEnd
			)
		);
		const chars = inheritSyncCreatorParallelPartChars({ ranges: [{ start: lineStart, end: lineEnd }] }, timingSource);
		if (!Array.isArray(chars) || chars.length !== lineChars.length) return null;
		const sliced = sliceSyncCreatorLineTiming(timingSource, lineStart, lineEnd);

		const sourceSpeaker = directLine?.speaker || existingPart?.speaker || timingSource?.speaker;
		const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
		const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
			speaker,
			directLine?.['speaker-fallback'] || existingPart?.['speaker-fallback'] || timingSource?.['speaker-fallback'],
			true,
			sourceSpeaker
		);
		return {
			start: lineStart,
			end: lineEnd,
			chars,
			parallel: sliced?.parallel,
			hiddenRanges: sliced?.hiddenRanges || [],
			styleRanges: sliced?.styleRanges || [],
			granularity: normalizeSyncCreatorGranularity(
				directLine?.granularity || existingPart?.granularity || timingSource?.granularity
			),
			speaker,
			...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {}),
			'speaker-color': sanitizeSyncCreatorSpeakerColor(
				speaker,
				directLine?.['speaker-color'] || existingPart?.['speaker-color'] || timingSource?.['speaker-color'],
				true,
				speakerFallback
			),
			kind: normalizeSyncCreatorKind(directLine?.kind || existingPart?.kind || timingSource?.kind) || SYNC_CREATOR_DEFAULT_KIND
		};
	};

	const snapshots = nextMergedLineIndexes.map(getPartSnapshot);
	const mergedLine = snapshots.every(Boolean)
		? {
			start: currentStart,
			end: mergedEnd,
			chars: normalizeSyncCreatorTimeSequence(
				snapshots.flatMap(snapshot => snapshot.chars),
				'word'
			),
			// Parallel parts carry their own precise timing. Keep only one line-level
			// start mark instead of duplicating every character timestamp here.
			granularity: 'line',
			speaker: snapshots[0].speaker,
			...(snapshots[0]['speaker-fallback'] ? { 'speaker-fallback': snapshots[0]['speaker-fallback'] } : {}),
			...(snapshots[0]['speaker-color'] ? { 'speaker-color': snapshots[0]['speaker-color'] } : {}),
			kind: snapshots[0].kind,
			...(snapshots.some(snapshot => snapshot.hiddenRanges.length) ? {
				hiddenRanges: normalizeSyncCreatorHiddenRanges(snapshots.flatMap(snapshot => snapshot.hiddenRanges))
			} : {}),
			...(snapshots.some(snapshot => snapshot.styleRanges.length) ? {
				styleRanges: normalizeSyncCreatorStyleRanges(snapshots.flatMap(snapshot => snapshot.styleRanges), currentStart, mergedEnd)
			} : {}),
			mergedLineContinuationStarts: nextMergedLineIndexes.slice(1).map(index => lineCharOffsets[index]),
			parallel: sanitizeSyncCreatorParallel(preserveSyncCreatorParallelTimingRuns({
				layout: 'stack',
				...(hasManualSplitState ? { manualSplitPoints: mergedManualSplitPoints } : {}),
				hiddenRanges: snapshots.flatMap(snapshot => snapshot.parallel?.hiddenRanges || []),
				parts: snapshots.flatMap((snapshot, index) => snapshot.parallel?.parts || [{
					role: index === 0 ? 'lead' : 'background',
					granularity: snapshot.granularity,
					speaker: snapshot.speaker,
					...(snapshot['speaker-fallback'] ? { 'speaker-fallback': snapshot['speaker-fallback'] } : {}),
					...(snapshot['speaker-color'] ? { 'speaker-color': snapshot['speaker-color'] } : {}),
					kind: snapshot.kind,
					ranges: [{ start: snapshot.start, end: snapshot.end }],
					join: [],
					chars: snapshot.chars
				}]).map((part, index) => ({ ...part, id: partIds[index] || `p${index + 1}` }))
			}))
		}
		: null;
	if (!mergedLine) return prev;

	const lines = prev.lines
		.filter(line => line.start < currentStart || line.start > mergedEnd);

	lines.push(mergedLine);

	lines.sort((a, b) => a.start - b.start);
	return lines.length > 0 ? {
		...prev,
		version: editingVersion,
		lines
	} : null;
}

export function unmergeSyncCreatorLineTiming(prev, {
	lineStart, mergedEnd, currentMergedLineIndexes, lineCharOffsets, getLineEndAtIndex, lyricsLines, editingVersion,
}, {
	inheritSyncCreatorParallelPartChars, sliceSyncCreatorLineTiming, normalizeSyncCreatorSpeaker,
	sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorKind,
}) {
	if (!prev || !Array.isArray(prev.lines)) return prev;
	const mergedLine = prev.lines.find(line => line.start === lineStart);
	if (!mergedLine || Number(mergedLine.end) < mergedEnd) return prev;

	const restoredLines = currentMergedLineIndexes
		.map((lineIndex) => {
			const start = lineCharOffsets[lineIndex];
			const end = getLineEndAtIndex(lineIndex);
			const lineChars = Array.from(lyricsLines[lineIndex] || '');
			if (!Number.isInteger(start) || end < start || lineChars.length === 0) return null;

			const part = mergedLine.parallel?.parts?.find(item =>
				Array.isArray(item?.ranges)
				&& item.ranges.some(range =>
					Number(range?.start) <= start
					&& Number(range?.end) >= end
				)
			);
			const chars = inheritSyncCreatorParallelPartChars({ ranges: [{ start, end }] }, mergedLine);
			if (!Array.isArray(chars) || chars.length !== lineChars.length) return null;

			const speaker = normalizeSyncCreatorSpeaker(part?.speaker || mergedLine.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
			const kind = normalizeSyncCreatorKind(part?.kind || mergedLine.kind) || SYNC_CREATOR_DEFAULT_KIND;
			const granularity = part ? normalizeSyncCreatorGranularity(part.granularity || mergedLine.granularity) : 'character';
			const restored = sliceSyncCreatorLineTiming(mergedLine, start, end);
			if (!restored) return null;
			const speakerFallback = sanitizeSyncCreatorSpeakerFallback(speaker, part?.['speaker-fallback'] || mergedLine['speaker-fallback'], true, part?.speaker || mergedLine.speaker);
			const speakerColor = sanitizeSyncCreatorSpeakerColor(speaker, part?.['speaker-color'] || mergedLine['speaker-color'], true, speakerFallback);
			return {
				...restored, granularity: restored.parallel ? 'character' : granularity, speaker, kind,
				'speaker-fallback': speakerFallback || undefined,
				'speaker-color': speakerColor || undefined
			};
		})
		.filter(Boolean);
	if (restoredLines.length !== currentMergedLineIndexes.length) return prev;

	const lines = prev.lines
		.filter(line => line.start < lineStart || line.start > mergedEnd);
	lines.push(...restoredLines);
	lines.sort((a, b) => a.start - b.start);
	return lines.length > 0
		? { ...prev, version: lines.some(line => line.parallel) ? editingVersion : (prev.version || 1), lines }
		: null;
}
