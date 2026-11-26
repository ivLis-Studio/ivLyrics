import {
	resolveSyncCreatorManualSplitState, preserveSyncCreatorParallelTimingRuns,
} from "./parallelTiming.mjs";
import { isFiniteSyncCreatorTime, normalizeSyncCreatorGranularity, normalizeSyncCreatorTimeSequence } from "./timingGranularity.mjs";
import { SYNC_CREATOR_DEFAULT_SPEAKER, SYNC_CREATOR_DEFAULT_KIND } from "./syncCreatorVocalStyles.mjs";
import { createSyncCreatorMergedLayout } from "./syncCreatorMergedLayout.mjs";
import { createSyncCreatorLyricDocument } from "./syncCreatorLyricText.mjs";

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

function prepareMergedTiming({
	currentStart, nextMergedLineIndexes, sourceGroups, getLineEndAtIndex,
	lineCharOffsets, syncData, manualParallelSplitDrafts,
}) {
	const mergedEnd = getLineEndAtIndex(nextMergedLineIndexes.at(-1));
	const sourceLinesByStart = new Map((syncData?.lines || []).map(line => [line.start, line]));
	const ownersByIndex = new Map();
	for (const group of sourceGroups) {
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

export function prepareSyncCreatorLineMerge({ currentMergedLineIndexes, nextMergeLineIndexes, ...timing }) {
	return prepareMergedTiming({
		...timing,
		nextMergedLineIndexes: [...currentMergedLineIndexes, ...nextMergeLineIndexes],
		sourceGroups: [currentMergedLineIndexes, nextMergeLineIndexes],
	});
}

export function restoreSyncCreatorDraftMergeTiming(syncData, lyricsText, {
	mergedLineDrafts = {}, manualParallelSplitDrafts = {},
}, editingVersion, timing) {
	if (!syncData?.lines?.length || !mergedLineDrafts || !Object.keys(mergedLineDrafts).length) return syncData;

	const lyricDocument = createSyncCreatorLyricDocument(lyricsText);
	const { lineIndexByStart, lineCharOffsets, getLineEndAtIndex } = lyricDocument;
	const draftLayout = createSyncCreatorMergedLayout(lyricDocument, mergedLineDrafts, syncData);
	let restored = syncData;
	for (const key of Object.keys(mergedLineDrafts)) {
		const currentStart = Number(key);
		const lineIndex = lineIndexByStart.get(currentStart);
		if (lineIndex === undefined || draftLayout.findMergedOwnerLineIndex(lineIndex) >= 0) continue;
		const nextMergedLineIndexes = draftLayout.getMergedLineIndexesForStart(lineIndex);
		if (nextMergedLineIndexes.length < 2) continue;

		const savedLayout = createSyncCreatorMergedLayout(lyricDocument, {}, restored);
		const endIndex = nextMergedLineIndexes.at(-1);
		const end = getLineEndAtIndex(endIndex);
		const sourceOwners = new Set(nextMergedLineIndexes.map(index => {
			const owner = savedLayout.findMergedOwnerLineIndex(index);
			return owner < 0 ? index : owner;
		}));
		const sourceGroups = [...sourceOwners].map(index => savedLayout.getMergedLineIndexesForStart(index));
		if (sourceGroups.some(group => group[0] < lineIndex || group.at(-1) > endIndex
			|| savedLayout.getSavedLineAtIndex(group[0])?.end > end)) continue;
		const separateRows = nextMergedLineIndexes.slice(1).some(index => savedLayout.getSavedLineAtIndex(index));
		const alreadyGrouped = sourceGroups.length === 1 && savedLayout.getSavedLineAtIndex(lineIndex)?.end === end;
		if (alreadyGrouped && !separateRows) continue;

		const plan = prepareMergedTiming({
			currentStart, nextMergedLineIndexes, sourceGroups, getLineEndAtIndex,
			lineCharOffsets, syncData: restored, manualParallelSplitDrafts,
		});
		restored = mergeSyncCreatorLineTiming(restored, {
			...plan, currentStart, lineCharOffsets, getLineEndAtIndex, editingVersion,
		}, timing).data;
	}
	return restored;
}

export function mergeSyncCreatorLineTiming(prev, {
	currentStart, mergedEnd, nextMergedLineIndexes, ownersByIndex, hasManualSplitState, mergedManualSplitPoints,
	lineCharOffsets, getLineEndAtIndex, editingVersion,
}, {
	sliceSyncCreatorLineTiming, normalizeSyncCreatorSpeaker,
	sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorKind,
	normalizeSyncCreatorHiddenRanges, normalizeSyncCreatorStyleRanges, sanitizeSyncCreatorParallel,
	getSyncCreatorSyncDataValidationError,
}) {
	if (!prev || !Array.isArray(prev.lines)) return { data: prev };

	const linesByStart = new Map(prev.lines.map(line => [line.start, line]));

	const getPartSnapshot = (lineIndex) => {
		const lineStart = lineCharOffsets[lineIndex];
		const lineEnd = getLineEndAtIndex(lineIndex);
		if (!Number.isInteger(lineStart) || lineEnd < lineStart) return null;

		const directLine = linesByStart.get(lineStart);
		const timingSource = directLine || linesByStart.get(ownersByIndex.get(lineIndex).start);
		const existingPart = timingSource?.parallel?.parts?.find(part =>
			Array.isArray(part?.ranges)
			&& part.ranges.some(range =>
				Number(range?.start) <= lineStart
				&& Number(range?.end) >= lineEnd
			)
		);
		const sliced = sliceSyncCreatorLineTiming(timingSource, lineStart, lineEnd, { keepParallel: true });

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
			chars: sliced?.chars,
			...(sliced?.unitLayout ? { unitLayout: sliced.unitLayout } : {}),
			...(isFiniteSyncCreatorTime(sliced?.lastCharEnd) ? { lastCharEnd: sliced.lastCharEnd } : {}),
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
	const firstRecorded = snapshots.find(snapshot => snapshot?.chars);
	if (!firstRecorded || snapshots.some(snapshot => !snapshot)) return { data: prev };
	const initialTime = firstRecorded.chars[0];
	const mergedLine = {
		start: currentStart,
		end: mergedEnd,
		chars: normalizeSyncCreatorTimeSequence(
			snapshots.flatMap(snapshot => snapshot.chars ?? new Array(snapshot.end - snapshot.start + 1).fill(initialTime)),
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
				chars: snapshot.chars,
				...(snapshot.unitLayout ? { unitLayout: snapshot.unitLayout } : {}),
				...(snapshot.lastCharEnd !== undefined ? { lastCharEnd: snapshot.lastCharEnd } : {})
			}]).map((part, index) => ({ ...part, id: partIds[index] || `p${index + 1}` }))
		}))
	};

	const issue = getSyncCreatorSyncDataValidationError({ lines: [mergedLine] });
	if (issue) return { data: prev, issue };

	const lines = prev.lines.filter(line => line.start < currentStart || line.start > mergedEnd);
	lines.push(mergedLine);
	lines.sort((a, b) => a.start - b.start);
	return { data: { ...prev, version: editingVersion, lines } };
}

export function unmergeSyncCreatorLineTiming(prev, {
	lineStart, lineIndex, lineCharOffsets, getLineEndAtIndex, editingVersion,
}, {
	sliceSyncCreatorLineTiming, normalizeSyncCreatorSpeaker,
	sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorKind,
}) {
	if (!prev || !Array.isArray(prev.lines)) return prev;
	const linesByStart = new Map(prev.lines.map(line => [line.start, line]));
	const mergedLine = linesByStart.get(lineStart);
	const savedEnd = Number(mergedLine?.end);
	if (!Number.isInteger(savedEnd) || savedEnd <= getLineEndAtIndex(lineIndex)) return prev;

	const lines = prev.lines
		.filter(line => line.start < lineStart || line.start > savedEnd);
	// Slice the stored span so even a partial row outside the editor's group
	// survives removal of the parent record.
	for (let index = lineIndex; index < lineCharOffsets.length && lineCharOffsets[index] <= savedEnd; index++) {
		const start = lineCharOffsets[index];
		const end = Math.min(getLineEndAtIndex(index), savedEnd);
		const restored = sliceSyncCreatorLineTiming(mergedLine, start, end);
		if (!restored) {
			// Older work could retain an independent row beside an unrecorded vocal.
			const independent = start !== lineStart && linesByStart.get(start);
			if (independent) lines.push(independent);
			continue;
		}
		const part = mergedLine.parallel?.parts?.find(item =>
			Array.isArray(item?.ranges)
			&& item.ranges.some(range => Number(range?.start) <= start && Number(range?.end) >= end)
		);
		const speaker = normalizeSyncCreatorSpeaker(part?.speaker || mergedLine.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
		const kind = normalizeSyncCreatorKind(part?.kind || mergedLine.kind) || SYNC_CREATOR_DEFAULT_KIND;
		const granularity = part ? normalizeSyncCreatorGranularity(part.granularity || mergedLine.granularity) : 'character';
		const speakerFallback = sanitizeSyncCreatorSpeakerFallback(speaker, part?.['speaker-fallback'] || mergedLine['speaker-fallback'], true, part?.speaker || mergedLine.speaker);
		const speakerColor = sanitizeSyncCreatorSpeakerColor(speaker, part?.['speaker-color'] || mergedLine['speaker-color'], true, speakerFallback);
		lines.push({
			...restored, granularity: restored.parallel ? restored.granularity : granularity, speaker, kind,
			'speaker-fallback': speakerFallback || undefined,
			'speaker-color': speakerColor || undefined
		});
	}
	lines.sort((a, b) => a.start - b.start);
	return lines.length > 0
		? { ...prev, version: lines.some(line => line.parallel) ? editingVersion : (prev.version || 1), lines }
		: null;
}
