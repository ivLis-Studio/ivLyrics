import { getSyncCreatorStyleSelectionRanges } from './selectionTiming.mjs';
import {
	SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK, SYNC_CREATOR_DEFAULT_SPEAKER, SYNC_CREATOR_DEFAULT_KIND,
} from './syncCreatorVocalStyles.mjs';

export function useSyncCreatorVocalEditor({
	react: { useCallback }, toast: Toast, i18n: I18n, syncDataVersion: SYNC_CREATOR_SYNC_DATA_VERSION,
	styles: {
		normalizeSyncCreatorMetaFieldValue, applySyncCreatorStyleRangePatch, normalizeSyncCreatorStyleRanges,
		resolveSyncCreatorBulkSpeakerMeta, isSyncCreatorCustomSpeaker, applySyncCreatorSpeakerMeta,
		normalizeSyncCreatorSpeaker, normalizeSyncCreatorSpeakerFallback, normalizeSyncCreatorSpeakerColor,
		getSyncCreatorCustomSpeakerDefaultColor,
	},
	target: {
		mode, multiVocalMode, currentLineIndex, currentLineStart, currentLineText, currentFullLineChars,
		activeParallelTargetId, currentLineCharRefs, currentLineStyleRanges,
	},
	song: { trackId, lyricsLines, lineCharOffsets, syncData, lineMetaDrafts, parallelPartMetaDrafts },
	bulkSpeaker: {
		bulkCustomSpeakerColor, bulkCustomSpeakerFallback,
		setBulkCustomSpeakerColor, setBulkCustomSpeakerFallback, setShowBulkCustomSpeakerDialog,
	},
	refs: { offsetSelectionRangeRef, offsetSelectionTargetRef, scorePendingEffectsRef, customSpeakerMetaMemoryRef },
	edit: { claimSessionForLocalEditing, setParallelPartMetaDrafts, setLineMetaDrafts, setLineStyleDrafts, setSyncData },
	layout: { isLineCoveredByMergedPrevious, getMergedLineIndexesForStart, getParallelTemplateForLineData },
}) {
	const updateParallelPartMeta = useCallback((partId, field, value) => {
		const safeValue = normalizeSyncCreatorMetaFieldValue(field, value);
		const shouldDelete = (field === 'speaker-color' || field === 'speaker-fallback') && !safeValue;
		if (!partId || !field || (!safeValue && !shouldDelete)) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		const draftKey = `${lineStart}:${partId}`;
		if (field === 'kind') {
			scorePendingEffectsRef.current.set(`part:${draftKey}`, { start: lineStart, partId, expectedKind: safeValue });
		}
		setParallelPartMetaDrafts(prev => ({
			...prev,
			[draftKey]: {
				...(prev[draftKey] || {}),
				[field]: shouldDelete ? '' : safeValue
			}
		}));

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => {
					if (line.start !== lineStart || !Array.isArray(line.parallel?.parts)) return line;
					return {
						...line,
						parallel: {
							...line.parallel,
							parts: line.parallel.parts.map(part => {
								if (part.id !== partId) return part;
								const nextPart = { ...part };
								if (shouldDelete) delete nextPart[field];
								else nextPart[field] = safeValue;
								return nextPart;
							})
						}
					};
				})
			};
		});
	}, [lineCharOffsets, currentLineIndex, claimSessionForLocalEditing]);

	const updateCurrentLineMeta = useCallback((field, value) => {
		const safeValue = normalizeSyncCreatorMetaFieldValue(field, value);
		const shouldDelete = (field === 'speaker-color' || field === 'speaker-fallback') && !safeValue;
		if (!field || (!safeValue && !shouldDelete)) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		const shouldOmitDefaultValue = !multiVocalMode && (
			(field === 'speaker' && safeValue === SYNC_CREATOR_DEFAULT_SPEAKER)
			|| (field === 'kind' && safeValue === SYNC_CREATOR_DEFAULT_KIND)
		);
		if (field === 'kind') {
			scorePendingEffectsRef.current.set(`line:${lineStart}`, { start: lineStart, expectedKind: safeValue });
		}
		setLineMetaDrafts(prev => ({
			...prev,
			[lineStart]: {
				...(prev[lineStart] || {}),
				[field]: shouldDelete ? '' : safeValue
			}
		}));

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => {
					if (line.start !== lineStart) return line;
					if (!shouldOmitDefaultValue && !shouldDelete) {
						return { ...line, [field]: safeValue };
					}
					const nextLine = { ...line };
					delete nextLine[field];
					return nextLine;
				})
			};
		});
	}, [lineCharOffsets, currentLineIndex, multiVocalMode, claimSessionForLocalEditing]);

	const updateCurrentLineStyleRanges = useCallback((patch) => {
		// Selection coordinates belong to the displayed vocal, not necessarily
		// the full row. Reject old targets before the clearing effect runs.
		const range = mode !== 'record' ? offsetSelectionRangeRef.current : null;
		const target = offsetSelectionTargetRef.current;
		if (!range || !target || currentFullLineChars.length === 0
			|| target.lineStart !== currentLineStart || target.targetId !== activeParallelTargetId
			|| target.text !== currentLineText || target.indexes.length !== currentLineCharRefs.length
			|| target.indexes.some((index, position) => index !== currentLineCharRefs[position]?.absoluteIndex)) return false;
		const lineEnd = currentLineStart + currentFullLineChars.length - 1;
		const selections = getSyncCreatorStyleSelectionRanges(range, currentLineCharRefs, currentLineStart, lineEnd);
		if (!selections.length) return false;
		const patchRanges = (ranges, start = currentLineStart, end = lineEnd) => selections.reduce(
			(result, selection) => selection.end < start || selection.start > end ? result
				: applySyncCreatorStyleRangePatch(result, selection.start, selection.end, patch, start, end),
			normalizeSyncCreatorStyleRanges(ranges, start, end)
		);
		claimSessionForLocalEditing();
		setLineStyleDrafts(prev => ({
			...prev,
			[currentLineStart]: patchRanges(Object.prototype.hasOwnProperty.call(prev, currentLineStart)
				? prev[currentLineStart] : currentLineStyleRanges)
		}));
		if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
			scorePendingEffectsRef.current.set(`style:${currentLineStart}:${activeParallelTargetId}:${range.start}:${range.end}`, {
				start: currentLineStart,
				ranges: selections,
				expectedKind: patch.kind, style: true
			});
		}
		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			let changed = false;
			const lines = prev.lines.map(line => {
				if (!selections.some(selection => selection.start <= line.end && selection.end >= line.start)) return line;
				changed = true;
				// Patch each persisted row independently. Merged display rows may
				// still contain separate source records until their next commit.
				const nextRanges = patchRanges(line.styleRanges, line.start, line.end);
				const nextLine = { ...line };
				if (nextRanges.length) nextLine.styleRanges = nextRanges;
				else delete nextLine.styleRanges;
				return nextLine;
			});
			return changed ? { ...prev, version: SYNC_CREATOR_SYNC_DATA_VERSION, lines } : prev;
		});
		return true;
	}, [
		claimSessionForLocalEditing,
		currentFullLineChars.length,
		currentLineStart,
		currentLineStyleRanges,
		activeParallelTargetId,
		currentLineCharRefs,
		currentLineText,
		mode
	]);

	const applySongVocalSpeaker = useCallback((value, customMeta = {}) => {
		const speakerMeta = resolveSyncCreatorBulkSpeakerMeta(
			value,
			customMeta.color,
			customMeta.fallback
		);
		if (!speakerMeta || !lyricsLines.length) return;
		claimSessionForLocalEditing();
		const { speaker, color: speakerColor, fallback: speakerFallback } = speakerMeta;
		const isCustomSpeaker = isSyncCreatorCustomSpeaker(speaker);
		const rememberedCustomMeta = { color: speakerColor, fallback: speakerFallback };

		const syncLinesByStart = new Map((Array.isArray(syncData?.lines) ? syncData.lines : []).map(line => [line.start, line]));
		const nextLineMetaDrafts = {};
		const nextParallelPartMetaDrafts = {};

		lyricsLines.forEach((lineText, index) => {
			const lineStart = lineCharOffsets[index];
			if (!Number.isInteger(lineStart)) return;
			nextLineMetaDrafts[lineStart] = {
				...(lineMetaDrafts[lineStart] || {}),
				speaker,
				'speaker-color': speakerColor,
				'speaker-fallback': speakerFallback
			};
			if (isCustomSpeaker) {
				customSpeakerMetaMemoryRef.current.set(
					`${trackId || 'track'}:${lineStart}:line`,
					rememberedCustomMeta
				);
			}

			if (isLineCoveredByMergedPrevious(index, syncLinesByStart)) {
				return;
			}

			const lineData = syncLinesByStart.get(lineStart);
			const mergedIndexes = getMergedLineIndexesForStart(index, syncLinesByStart);
			const isMergedWithNext = mergedIndexes.length > 1;
			const templateChars = isMergedWithNext
				? mergedIndexes.flatMap(lineIndex => Array.from(lyricsLines[lineIndex] || ''))
				: Array.from(lineText || '');
			const template = getParallelTemplateForLineData(lineData, templateChars, lineStart, isMergedWithNext);
			if (Array.isArray(template?.parts)) {
				template.parts.forEach(part => {
					if (!part?.id) return;
					nextParallelPartMetaDrafts[`${lineStart}:${part.id}`] = {
						...(parallelPartMetaDrafts[`${lineStart}:${part.id}`] || {}),
						speaker,
						'speaker-color': speakerColor,
						'speaker-fallback': speakerFallback
					};
					if (isCustomSpeaker) {
						customSpeakerMetaMemoryRef.current.set(
							`${trackId || 'track'}:${lineStart}:${part.id}`,
							rememberedCustomMeta
						);
					}
				});
			}
		});

		setLineMetaDrafts(prev => ({
			...prev,
			...nextLineMetaDrafts
		}));
		setParallelPartMetaDrafts(prev => ({
			...prev,
			...nextParallelPartMetaDrafts
		}));
		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => {
					const nextLine = applySyncCreatorSpeakerMeta({
						...line,
						parallel: line.parallel ? {
							...line.parallel,
							parts: Array.isArray(line.parallel.parts)
								? line.parallel.parts.map(part => applySyncCreatorSpeakerMeta(part, speakerMeta))
								: line.parallel.parts
						} : line.parallel
					}, speakerMeta);
					return nextLine;
				})
			};
		});
		Toast.success(I18n.t('syncCreator.bulkVocalApplied') || 'Applied the vocal speaker to the whole song.');
	}, [
		lyricsLines,
		lineCharOffsets,
		syncData,
		lineMetaDrafts,
		parallelPartMetaDrafts,
		trackId,
		claimSessionForLocalEditing,
		isLineCoveredByMergedPrevious,
		getMergedLineIndexesForStart,
		getParallelTemplateForLineData
	]);
	const requestSongVocalSpeaker = useCallback((value, customSeed = {}) => {
		const speaker = normalizeSyncCreatorSpeaker(value);
		if (!speaker) return;
		if (!isSyncCreatorCustomSpeaker(speaker)) {
			setShowBulkCustomSpeakerDialog(false);
			applySongVocalSpeaker(speaker);
			return;
		}

		const fallback = normalizeSyncCreatorSpeakerFallback(customSeed.fallback)
			|| normalizeSyncCreatorSpeakerFallback(bulkCustomSpeakerFallback)
			|| SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK;
		const color = normalizeSyncCreatorSpeakerColor(customSeed.color)
			|| normalizeSyncCreatorSpeakerColor(bulkCustomSpeakerColor)
			|| getSyncCreatorCustomSpeakerDefaultColor('CUSTOM', fallback);
		setBulkCustomSpeakerFallback(fallback);
		setBulkCustomSpeakerColor(color);
		setShowBulkCustomSpeakerDialog(true);
	}, [applySongVocalSpeaker, bulkCustomSpeakerColor, bulkCustomSpeakerFallback]);
	const applyBulkCustomSpeaker = useCallback(() => {
		const color = normalizeSyncCreatorSpeakerColor(bulkCustomSpeakerColor);
		if (!color) {
			Toast.error(I18n.t('syncCreator.speakerCustomColorInvalid') || 'Enter a valid HEX color.');
			return;
		}
		const fallback = normalizeSyncCreatorSpeakerFallback(bulkCustomSpeakerFallback)
			|| SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK;
		setBulkCustomSpeakerColor(color);
		setBulkCustomSpeakerFallback(fallback);
		applySongVocalSpeaker('CUSTOM', { color, fallback });
		setShowBulkCustomSpeakerDialog(false);
	}, [applySongVocalSpeaker, bulkCustomSpeakerColor, bulkCustomSpeakerFallback]);

	return {
		updateParallelPartMeta, updateCurrentLineMeta, updateCurrentLineStyleRanges, requestSongVocalSpeaker, applyBulkCustomSpeaker,
	};
}
