import {
	countSyncCreatorRangeChars, isFiniteSyncCreatorTime, normalizeSyncCreatorGranularity,
	normalizeSyncCreatorTimeSequence, roundSyncCreatorTime,
} from './timingGranularity.mjs';
import { hasReusableSyncCreatorParallelChars, preserveSyncCreatorParallelTimingRuns } from './parallelTiming.mjs';
import { repairSyncCreatorLineCharsFromParallel } from './timingValidation.mjs';
import { SYNC_CREATOR_DEFAULT_KIND, SYNC_CREATOR_DEFAULT_SPEAKER } from './syncCreatorVocalStyles.mjs';

export function buildRecordedSyncCreatorParallelParts({
	currentParts, existingParts, activePartId, normalizedRawChars, syncGranularity,
}, {
	sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, projectSyncCreatorUnitLayout,
}) {
	return currentParts
		.map((part) => {
			const existingPart = existingParts.find(item => item.id === part.id);
			const partSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
				part.speaker,
				part['speaker-fallback'],
				true,
				existingPart?.speaker || part.speaker
			);
			const partSpeakerColor = sanitizeSyncCreatorSpeakerColor(
				part.speaker,
				part['speaker-color'],
				true,
				partSpeakerFallback
			);
			const expectedChars = countSyncCreatorRangeChars(part.ranges);
			const syncedChars = part.id === activePartId
				? normalizedRawChars.map(roundSyncCreatorTime)
				: (hasReusableSyncCreatorParallelChars(part, part)
					? part.chars
					: (hasReusableSyncCreatorParallelChars(part, existingPart) ? existingPart.chars : undefined));
			if (part.id === activePartId && (!Array.isArray(syncedChars) || syncedChars.length !== expectedChars)) {
				return null;
			}
			const nextPart = {
				id: part.id,
				role: part.role,
				granularity: part.id === activePartId
					? syncGranularity
					: normalizeSyncCreatorGranularity(existingPart?.granularity || part.granularity),
				speaker: part.speaker,
				...(partSpeakerFallback
					? { 'speaker-fallback': partSpeakerFallback }
					: {}),
				...(partSpeakerColor
					? { 'speaker-color': partSpeakerColor }
					: {}),
				kind: part.kind,
				...(part.id !== activePartId && (existingPart?.unitLayout || part.unitLayout) ? { unitLayout: existingPart?.unitLayout || part.unitLayout } : {}),
				ranges: part.ranges,
				join: part.join || []
			};
			if (Array.isArray(syncedChars) && syncedChars.length === expectedChars) {
				nextPart.chars = syncedChars;
				// Unchanged vocals keep their held end; the re-recorded one starts without it.
				const heldEnd = part.id === activePartId ? undefined
					: syncedChars === part.chars ? part.lastCharEnd
						: syncedChars === existingPart?.chars ? existingPart.lastCharEnd : undefined;
				if (isFiniteSyncCreatorTime(heldEnd)) nextPart.lastCharEnd = heldEnd;
			}
			return part.id === activePartId ? nextPart : projectSyncCreatorUnitLayout(existingPart || part, nextPart);
		})
		.filter(Boolean);
}

export function prepareSyncCreatorLineCommit({
	rawChars, syncData, syncGranularity, lyricsLanguage, scoreInput, version,
	line: {
		start: lineStart, charCount: fullCharCount, chars: currentLineChars, charRefs: currentLineCharRefs,
		meta: currentLineMeta, metaDraft, styleRanges: currentLineStyleRanges,
		mergedWithNext: currentLineMergedWithNext,
	},
	vocal: { activePart: activeParallelPart, parallel: currentParallelData, targetId: activeParallelTargetId, multiVocalMode },
}, {
	normalizeCommittedLineChars, sanitizeSyncCreatorParallel, getCodec, getSyncCreatorWordRanges,
	getRecordingLockRange, projectSyncCreatorUnitLayout, clipSyncCreatorLineToBounds,
	normalizeSyncCreatorSpeaker, normalizeSyncCreatorKind, sanitizeSyncCreatorSpeakerFallback,
	sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorStyleRanges,
}) {
	const lineEnd = lineStart + fullCharCount - 1;
	// Only the recorded row changes. Keep all other rows (and their timing
	// arrays) stable so one tap does not copy/sanitize the entire song.
	const nextLines = syncData?.lines ? [...syncData.lines] : [];
	const existingIndex = nextLines.findIndex((line) => line.start === lineStart);
	const sourceLine = existingIndex >= 0 ? nextLines[existingIndex] : null;
	const existingLine = sourceLine ? {
		...sourceLine,
		chars: Array.isArray(sourceLine.chars) ? [...sourceLine.chars] : [],
		parallel: sourceLine.parallel ? sanitizeSyncCreatorParallel({
			...sourceLine.parallel,
			parts: Array.isArray(sourceLine.parallel.parts)
				? sourceLine.parallel.parts.map(part => ({
					...part,
					ranges: Array.isArray(part.ranges) ? part.ranges.map(range => ({ ...range })) : [],
					join: Array.isArray(part.join) ? [...part.join] : [],
					chars: Array.isArray(part.chars) ? [...part.chars] : undefined
				}))
				: []
		}) : undefined
	} : null;
	const normalizedRawChars = normalizeCommittedLineChars(
		rawChars,
		syncGranularity,
		currentLineChars
	);

	const buildFullLineChars = () => {
		if (!activeParallelPart) {
			return normalizedRawChars;
		}

		const fullChars = Array.isArray(existingLine?.chars) && existingLine.chars.length === fullCharCount
			? [...existingLine.chars]
			: new Array(fullCharCount).fill(null);

		currentLineCharRefs.forEach((ref, index) => {
			if (ref.localIndex >= 0 && ref.localIndex < fullChars.length) {
				fullChars[ref.localIndex] = normalizedRawChars[index];
			}
		});

		const firstKnown = fullChars.find(isFiniteSyncCreatorTime);
		for (let index = 0; index < fullChars.length; index++) {
			if (isFiniteSyncCreatorTime(fullChars[index])) continue;
			const previous = index > 0 && isFiniteSyncCreatorTime(fullChars[index - 1]) ? fullChars[index - 1] : null;
			const next = fullChars.slice(index + 1).find(isFiniteSyncCreatorTime);
			fullChars[index] = previous ?? next ?? firstKnown ?? 0;
		}

		return normalizeSyncCreatorTimeSequence(fullChars, 'word');
	};

	const fullLineChars = buildFullLineChars();
	let lineData = {
		...(existingLine || {}),
		start: lineStart,
		end: lineEnd,
		chars: fullLineChars.map(roundSyncCreatorTime),
		granularity: activeParallelPart
			? normalizeSyncCreatorGranularity(existingLine?.granularity)
			: syncGranularity
	};
	const applyLineSpeakerMeta = () => {
		const leadMetaPart = currentParallelData?.parts?.find(part => part.role === 'lead') || currentParallelData?.parts?.[0] || activeParallelPart;
		const lineMetaDraft = metaDraft || {};
		const hasLineSpeakerDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'speaker');
		const hasLineSpeakerColorDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'speaker-color');
		const hasLineSpeakerFallbackDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'speaker-fallback');
		const hasLineKindDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'kind');
		const draftLineSpeaker = normalizeSyncCreatorSpeaker(lineMetaDraft.speaker);
		const draftLineKind = normalizeSyncCreatorKind(lineMetaDraft.kind);
		const existingLineSpeaker = normalizeSyncCreatorSpeaker(existingLine?.speaker);
		const existingLineKind = normalizeSyncCreatorKind(existingLine?.kind);
		const lineSpeaker = hasLineSpeakerDraft
			? draftLineSpeaker || SYNC_CREATOR_DEFAULT_SPEAKER
			: currentLineMeta.speaker || existingLineSpeaker || leadMetaPart?.speaker || SYNC_CREATOR_DEFAULT_SPEAKER;
		const lineKind = hasLineKindDraft
			? draftLineKind || SYNC_CREATOR_DEFAULT_KIND
			: currentLineMeta.kind || existingLineKind || leadMetaPart?.kind || SYNC_CREATOR_DEFAULT_KIND;
		const lineSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
			lineSpeaker,
			hasLineSpeakerFallbackDraft
				? lineMetaDraft['speaker-fallback']
				: currentLineMeta['speaker-fallback'] || existingLine?.['speaker-fallback'] || leadMetaPart?.['speaker-fallback'],
			true,
			hasLineSpeakerDraft ? lineMetaDraft.speaker : existingLine?.speaker || leadMetaPart?.speaker || lineSpeaker
		);
		const lineSpeakerColor = sanitizeSyncCreatorSpeakerColor(
			lineSpeaker,
			hasLineSpeakerColorDraft
				? lineMetaDraft['speaker-color']
				: currentLineMeta['speaker-color'] || existingLine?.['speaker-color'] || leadMetaPart?.['speaker-color'],
			true,
			lineSpeakerFallback
		);
		const shouldPersistLineSpeaker = multiVocalMode || lineSpeaker !== SYNC_CREATOR_DEFAULT_SPEAKER;
		const shouldPersistLineKind = multiVocalMode || lineKind !== SYNC_CREATOR_DEFAULT_KIND;
		if (lineSpeaker && shouldPersistLineSpeaker) {
			lineData.speaker = lineSpeaker;
		} else {
			delete lineData.speaker;
		}
		if (lineSpeakerFallback) {
			lineData['speaker-fallback'] = lineSpeakerFallback;
		} else {
			delete lineData['speaker-fallback'];
		}
		if (lineSpeakerColor) {
			lineData['speaker-color'] = lineSpeakerColor;
		} else {
			delete lineData['speaker-color'];
		}
		if (lineKind && shouldPersistLineKind) {
			lineData.kind = lineKind;
		} else {
			delete lineData.kind;
		}
	};
	applyLineSpeakerMeta();

	if (activeParallelPart && currentParallelData) {
		const existingParts = Array.isArray(existingLine?.parallel?.parts) ? existingLine.parallel.parts : [];
		const parts = buildRecordedSyncCreatorParallelParts({
			currentParts: currentParallelData.parts,
			existingParts,
			activePartId: activeParallelPart.id,
			normalizedRawChars,
			syncGranularity,
		}, {
			sanitizeSyncCreatorSpeakerFallback,
			sanitizeSyncCreatorSpeakerColor,
			projectSyncCreatorUnitLayout,
		});

		if (parts.length > 0) {
			lineData.granularity = parts.length > 1
				? 'line'
				: normalizeSyncCreatorGranularity(parts[0]?.granularity || lineData.granularity);
			lineData.parallel = sanitizeSyncCreatorParallel(preserveSyncCreatorParallelTimingRuns({
				layout: currentParallelData.layout || 'stack',
				...(Array.isArray(currentParallelData.manualSplitPoints) ? { manualSplitPoints: currentParallelData.manualSplitPoints } : {}),
				hiddenRanges: currentParallelData.hiddenRanges || [],
				parts
			}));
		} else {
			delete lineData.parallel;
		}
	} else {
		// Recording the joined target replaces the archived split timings.
		delete lineData.parallel;
		// A re-recorded line starts without the old held end of its last character.
		delete lineData.lastCharEnd;
	}

	const codec = scoreInput?.key === `${lineStart}:${activeParallelTargetId}` && scoreInput.indexes?.size
		? getCodec() : null;
	if (codec) {
		const previousTarget = activeParallelPart ? existingLine?.parallel?.parts?.find(part => part.id === activeParallelPart.id) : existingLine;
		const target = activeParallelPart ? lineData.parallel?.parts?.find(part => part.id === activeParallelPart.id) : lineData;
		if (previousTarget && target) {
			const localIndexes = currentLineCharRefs
				.map((ref, index) => scoreInput.indexes.has(ref.absoluteIndex) ? index : -1)
				.filter(index => index >= 0);
			const recorded = codec.recordedUnits(previousTarget, target, localIndexes, scoreInput.granularity,
				getSyncCreatorWordRanges(currentLineChars, lyricsLanguage || undefined));
			if (activeParallelPart) Object.assign(target, recorded);
			else lineData = recorded;
		}
	}

	const normalizedStyleRanges = normalizeSyncCreatorStyleRanges(currentLineStyleRanges, lineStart, lineEnd);
	if (normalizedStyleRanges.length > 0) {
		lineData.styleRanges = normalizedStyleRanges;
	} else {
		delete lineData.styleRanges;
	}

	// The committed row is authoritative; a stale wider layout cannot leave
	// vocal parts outside it.
	lineData = repairSyncCreatorLineCharsFromParallel(clipSyncCreatorLineToBounds(lineData));

	if (existingIndex >= 0) {
		nextLines[existingIndex] = lineData;
	} else {
		nextLines.push(lineData);
	}

	nextLines.sort((a, b) => a.start - b.start);

	const committedLineIndex = nextLines.findIndex((line) => line.start === lineStart);
	const normalizedLineData = {
		...lineData,
		chars: !activeParallelPart && getRecordingLockRange() ? lineData.chars : normalizeSyncCreatorTimeSequence(
			lineData.chars,
			lineData.granularity
		)
	};

	nextLines[committedLineIndex] = normalizedLineData;

	const mergedLineComplete = currentLineMergedWithNext
		&& Array.isArray(currentParallelData?.parts)
		&& currentParallelData.parts.length > 1
		&& Array.isArray(normalizedLineData.parallel?.parts)
		&& currentParallelData.parts.every(part => {
			const savedPart = normalizedLineData.parallel.parts.find(item => item.id === part.id);
			return hasReusableSyncCreatorParallelChars(part, savedPart);
		});
	const candidateLines = mergedLineComplete
		? nextLines.filter(line => line.start <= lineStart || line.start > lineEnd)
		: nextLines;
	const nextSyncData = candidateLines.length > 0
		? { version, lines: candidateLines }
		: null;
	return { nextSyncData, normalizedLineData, existingLine, lineEnd };
}

export function prepareSyncCreatorRecordingScore({
	scoreInput, pendingEffectsByKey, nextSyncData, existingLine,
	rawChars, charRefs: currentLineCharRefs, start: lineStart, end: lineEnd,
	activePart: activeParallelPart, activeParallelTargetId,
}) {
	if (scoreInput?.key !== `${lineStart}:${activeParallelTargetId}` || !(scoreInput.inputCount > 0)) return null;
	// Metadata selected before the first recording becomes committed with
	// that line. Keep its explicit effect action separate from timing so
	// neither event consumes the other's before/after comparison.
	let timingSnapshot = nextSyncData;
	const pendingEffects = [...pendingEffectsByKey.values()].filter(effect => effect.start === lineStart);
	if (pendingEffects.length) {
		timingSnapshot = JSON.parse(JSON.stringify(nextSyncData));
		const timingLine = timingSnapshot.lines.find(line => line.start === lineStart);
		for (const pending of pendingEffects) {
			const previousItem = pending.partId ? existingLine?.parallel?.parts?.find(part => part.id === pending.partId) : existingLine;
			const nextItem = pending.partId ? timingLine.parallel?.parts?.find(part => part.id === pending.partId) : timingLine;
			if (!nextItem) continue;
			const field = pending.style ? 'styleRanges' : 'kind';
			if (previousItem?.[field] !== undefined) nextItem[field] = previousItem[field];
			else delete nextItem[field];
		}
	}
	const recordedIndexes = currentLineCharRefs
		.filter((ref, index) => scoreInput.indexes.has(ref.absoluteIndex) && isFiniteSyncCreatorTime(rawChars[index]))
		.map(ref => ref.absoluteIndex).sort((a, b) => a - b);
	const ranges = [];
	for (const index of recordedIndexes) {
		if (ranges.length && ranges[ranges.length - 1].end + 1 === index) ranges[ranges.length - 1].end = index;
		else ranges.push({ start: index, end: index });
	}
	if (!ranges.length) return null;

	return {
		snapshot: timingSnapshot,
		work: {
			start: lineStart, end: lineEnd,
			...(activeParallelPart ? { partId: activeParallelPart.id } : {}),
			granularity: scoreInput.granularity,
			inputCount: scoreInput.inputCount,
			inputIndexes: [...scoreInput.anchors].filter(index => recordedIndexes.includes(index)),
			ranges,
		},
	};
}
