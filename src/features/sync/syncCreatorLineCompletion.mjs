import { hasReusableSyncCreatorParallelChars } from './parallelTiming.mjs';
import { countSyncCreatorRangeChars } from './timingGranularity.mjs';

export function countSyncCreatorCompletedLines({
	lyricDocument, syncData, multiVocalMode, mergedLayout, getParallelTemplateForLineData, mergeParallelTemplate,
}) {
	if (!syncData?.lines) return 0;
	if (!multiVocalMode) return syncData.lines.length;

	const { lineCharOffsets, lineChars } = lyricDocument;
	const { findMergedOwnerLineIndex, getMergedLineIndexesForStart, getSavedLineAtIndex } = mergedLayout;
	let completed = 0;
	for (let index = 0; index < lineChars.length; index++) {
		const ownerIndex = findMergedOwnerLineIndex(index);
		if (ownerIndex >= 0) {
			const savedParts = getSavedLineAtIndex(ownerIndex)?.parallel?.parts;
			// Continuations reflect saved vocal marks on their owner. Draft splits
			// affect the owner's editor row, but don't replace these saved marks.
			if (Array.isArray(savedParts) && savedParts.length > 1 && savedParts.every(part => (
				Array.isArray(part.chars) && part.chars.length === countSyncCreatorRangeChars(part.ranges)
			))) completed++;
			continue;
		}

		const savedLine = getSavedLineAtIndex(index);
		if (!savedLine) continue;
		const mergedIndexes = getMergedLineIndexesForStart(index);
		const mergesNextLine = mergedIndexes.length > 1;
		const chars = mergesNextLine ? mergedIndexes.flatMap(mergedIndex => lineChars[mergedIndex]) : lineChars[index];
		const template = getParallelTemplateForLineData(savedLine, chars, lineCharOffsets[index], mergesNextLine);
		const parts = mergeParallelTemplate(template, savedLine)?.parts;
		if (!(parts?.length > 1) || parts.every(part => hasReusableSyncCreatorParallelChars(part, part))) completed++;
	}
	return completed;
}

function hasVocalTiming(part, line) {
	if (hasReusableSyncCreatorParallelChars(part, part)) return true;
	const savedPart = line?.parallel?.parts?.find(entry => entry.id === part.id);
	return hasReusableSyncCreatorParallelChars(part, savedPart);
}

export function findSyncCreatorIncompleteVocal(parts, committedLine, isMetaComplete) {
	for (const part of parts) {
		// A recording completes before the next render replaces the editor's parts.
		if (!hasVocalTiming(part, committedLine) || !isMetaComplete(part)) return part.id;
	}
	return null;
}

export function isSyncCreatorLineSynced(line, activePart, coveredByPrevious) {
	if (coveredByPrevious) return true;
	if (!line) return false;
	return !activePart || hasVocalTiming(activePart, line);
}
