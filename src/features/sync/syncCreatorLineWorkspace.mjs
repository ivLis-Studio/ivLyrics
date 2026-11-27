import { SYNC_CREATOR_MAX_MERGED_LINES, createSyncCreatorMergedLayout } from './syncCreatorMergedLayout.mjs';
import {
	getSyncCreatorConcurrentParallelParts, hasReusableSyncCreatorParallelChars,
	resolveSyncCreatorManualSplitState, selectSyncCreatorParallelTemplate,
} from './parallelTiming.mjs';
import { formatSyncCreatorParallelPreviewLines, rangesToCharRefs } from './syncCreatorVocalLayout.mjs';
import { SYNC_CREATOR_DEFAULT_KIND } from './syncCreatorVocalStyles.mjs';
import { countSyncCreatorCompletedLines, isSyncCreatorLineSynced } from './syncCreatorLineCompletion.mjs';

const EMPTY_SYNC_CREATOR_LINE_CHARS = [];
const EMPTY_SYNC_CREATOR_PARTS = [];

export function useSyncCreatorLineWorkspace({
	react, lyricDocument, lyricsText, syncData, currentLineIndex, drafts, vocalSelection,
	readVisualSettings, vocalLayout, vocalStyles,
}) {
	const { useMemo, useEffect, useCallback } = react;
	const { lineCharOffsets } = lyricDocument;
	const {
		mergedLineDrafts, lineMetaDrafts, lineStyleDrafts, parallelPartMetaDrafts,
		manualParallelSplitDrafts, parentheticalLayoutDrafts,
	} = drafts;
	const {
		multiVocalMode, activeParallelPartId, setActiveParallelPartId, pendingParallelNavigationRef,
		pendingMultiVocalDecision, pendingParentheticalLayoutDecision, setPendingParentheticalLayoutDecision,
	} = vocalSelection;
	const { buildManualParallelTemplate, buildParentheticalParallelTemplate, mergeSyncCreatorParallelTemplate } = vocalLayout;
	const {
		resolveSyncCreatorDraftSpeakerMeta, normalizeSyncCreatorKind, normalizeSyncCreatorStyleRanges,
		getSyncCreatorSpeakerTextColor, isSyncCreatorSpeakerMetaComplete,
	} = vocalStyles;

	const currentLineStart = lineCharOffsets[currentLineIndex] ?? 0;
	const currentBaseLineChars = lyricDocument.lineChars[currentLineIndex] || EMPTY_SYNC_CREATOR_LINE_CHARS;
	const currentExistingLineData = useMemo(() => {
		if (!Array.isArray(syncData?.lines)) return null;
		return syncData.lines.find(line => line.start === currentLineStart) || null;
	}, [syncData, currentLineStart]);
	const getLineEndAtIndex = lyricDocument.getLineEndAtIndex;
	const mergedLayout = useMemo(
		() => createSyncCreatorMergedLayout(lyricDocument, mergedLineDrafts, syncData),
		[lyricDocument, mergedLineDrafts, syncData]
	);
	const {
		getMergedLineIndexesForStart,
		findMergedOwnerLineIndex,
		isLineCoveredByMergedPrevious,
		findNavigableLineIndex,
		getAutoMergeSplitPointsForLine,
	} = mergedLayout;
	const currentMergedLineIndexes = useMemo(
		() => getMergedLineIndexesForStart(currentLineIndex),
		[getMergedLineIndexesForStart, currentLineIndex]
	);
	const currentLineMergedWithNext = currentMergedLineIndexes.length > 1;
	const currentLineCoveredByPrevious = useMemo(
		() => isLineCoveredByMergedPrevious(currentLineIndex),
		[isLineCoveredByMergedPrevious, currentLineIndex]
	);
	const previousNavigableLineIndex = useMemo(
		() => findNavigableLineIndex(currentLineIndex, -1),
		[findNavigableLineIndex, currentLineIndex]
	);
	const nextNavigableLineIndex = useMemo(
		() => findNavigableLineIndex(currentLineIndex, 1),
		[findNavigableLineIndex, currentLineIndex]
	);
	const currentFullLineChars = useMemo(() => {
		if (!currentLineMergedWithNext) return currentBaseLineChars;
		return currentMergedLineIndexes.flatMap(index => lyricDocument.lineChars[index] || []);
	}, [currentBaseLineChars, currentLineMergedWithNext, currentMergedLineIndexes, lyricDocument]);
	const currentAutoMergeSplitPoints = useMemo(
		() => getAutoMergeSplitPointsForLine(currentLineStart),
		[getAutoMergeSplitPointsForLine, currentLineStart]
	);
	const currentAutoMergeSplitPointSet = useMemo(
		() => new Set(currentAutoMergeSplitPoints),
		[currentAutoMergeSplitPoints]
	);
	const currentNextMergeLineIndex = currentMergedLineIndexes.length > 0
		? currentMergedLineIndexes[currentMergedLineIndexes.length - 1] + 1
		: currentLineIndex + 1;
	const nextMergeLineIndexes = useMemo(
		() => getMergedLineIndexesForStart(currentNextMergeLineIndex),
		[getMergedLineIndexesForStart, currentNextMergeLineIndex]
	);
	const canMergeCurrentLineWithNext = !currentLineCoveredByPrevious
		&& nextMergeLineIndexes.length > 0
		&& currentMergedLineIndexes.length + nextMergeLineIndexes.length <= SYNC_CREATOR_MAX_MERGED_LINES;
	const currentLineMeta = useMemo(() => {
		const draft = lineMetaDrafts[currentLineStart] || {};
		const speakerMeta = resolveSyncCreatorDraftSpeakerMeta({
			draft,
			source: currentExistingLineData
		});
		return {
			...speakerMeta,
			kind: normalizeSyncCreatorKind(draft.kind || currentExistingLineData?.kind) || SYNC_CREATOR_DEFAULT_KIND
		};
	}, [lineMetaDrafts, currentLineStart, currentExistingLineData]);
	const currentLineStyleRanges = useMemo(() => {
		const hasDraft = Object.prototype.hasOwnProperty.call(lineStyleDrafts, currentLineStart);
		const currentLineEnd = currentLineStart + Math.max(0, currentFullLineChars.length - 1);
		const source = hasDraft ? lineStyleDrafts[currentLineStart] : (Array.isArray(syncData?.lines) ? syncData.lines : [])
			.filter(line => Number(line?.end) >= currentLineStart && Number(line?.start) <= currentLineEnd)
			.flatMap(line => Array.isArray(line?.styleRanges) ? line.styleRanges : []);
		return normalizeSyncCreatorStyleRanges(
			source,
			currentLineStart,
			currentLineEnd
		);
	}, [lineStyleDrafts, currentLineStart, currentFullLineChars.length, syncData?.lines]);
	const getParallelTemplateForLine = useCallback((lineChars, lineStart, manualSplitPointsOverride = null) => {
		const splitPoints = [
			...getAutoMergeSplitPointsForLine(lineStart),
			...(Array.isArray(manualSplitPointsOverride)
				? manualSplitPointsOverride
				: (Array.isArray(manualParallelSplitDrafts[lineStart]) ? manualParallelSplitDrafts[lineStart] : []))
		];
		const manualTemplate = buildManualParallelTemplate(lineChars, lineStart, splitPoints);
		if (manualTemplate) return manualTemplate;
		return buildParentheticalParallelTemplate(lineChars, lineStart, {
			groupBackgroundParts: parentheticalLayoutDrafts[lineStart] === 'grouped'
		});
	}, [getAutoMergeSplitPointsForLine, manualParallelSplitDrafts, parentheticalLayoutDrafts]);
	const getParallelTemplateForLineData = useCallback((lineData, lineChars, lineStart, isMergedWithNext = false) => {
		const splitState = resolveSyncCreatorManualSplitState(
			manualParallelSplitDrafts,
			lineStart,
			lineChars.length,
			lineData?.parallel,
			getAutoMergeSplitPointsForLine(lineStart)
		);
		const textTemplate = getParallelTemplateForLine(lineChars, lineStart, splitState.manualSplitPoints);
		const hasManualSplitState = splitState.hasManualDraft || Array.isArray(lineData?.parallel?.manualSplitPoints);
		let template = selectSyncCreatorParallelTemplate(lineData?.parallel, textTemplate, {
			hasManualDraft: hasManualSplitState,
			isMergedWithNext
		});
		if (!template && hasManualSplitState && getSyncCreatorConcurrentParallelParts(lineData?.parallel).length) {
			template = { layout: 'stack', parts: [{
				id: 'full', role: 'lead', speaker: lineData.speaker, kind: lineData.kind,
				ranges: [{ start: lineStart, end: lineStart + lineChars.length - 1 }], join: []
			}] };
		}
		return template && hasManualSplitState
			? { ...template, manualSplitPoints: splitState.manualSplitPoints }
			: template;
	}, [getAutoMergeSplitPointsForLine, getParallelTemplateForLine, manualParallelSplitDrafts]);
	const currentParallelTemplate = useMemo(() => {
		if (!multiVocalMode) return null;
		return getParallelTemplateForLineData(
			currentExistingLineData,
			currentFullLineChars,
			currentLineStart,
			currentLineMergedWithNext
		);
	}, [multiVocalMode, getParallelTemplateForLineData, currentFullLineChars, currentLineStart, currentLineMergedWithNext, currentExistingLineData]);
	const currentParallelData = useMemo(() => {
		const merged = mergeSyncCreatorParallelTemplate(currentParallelTemplate, currentExistingLineData);
		if (!merged) return null;
		const existingParts = Array.isArray(currentExistingLineData?.parallel?.parts)
			? currentExistingLineData.parallel.parts
			: [];
		const currentLineDraft = lineMetaDrafts[currentLineStart] || {};
		const hasExplicitLineSpeaker = Object.prototype.hasOwnProperty.call(currentLineDraft, 'speaker')
			|| Object.prototype.hasOwnProperty.call(currentExistingLineData || {}, 'speaker');
		return {
			...merged,
			parts: merged.parts.map((part) => {
				const draft = parallelPartMetaDrafts[`${currentLineStart}:${part.id}`] || {};
				const existingPart = existingParts.find(item => item?.id === part.id);
				const speakerMeta = resolveSyncCreatorDraftSpeakerMeta({
					draft,
					source: part,
					inheritedSource: currentLineMeta,
					inheritSource: hasExplicitLineSpeaker && !existingPart
				});
				return {
					...part,
					...speakerMeta,
					kind: normalizeSyncCreatorKind(draft.kind || part.kind) || SYNC_CREATOR_DEFAULT_KIND
				};
			})
		};
	}, [
		currentParallelTemplate,
		currentExistingLineData,
		parallelPartMetaDrafts,
		lineMetaDrafts,
		currentLineStart,
		currentLineMeta
	]);
	const currentParallelParts = currentParallelData?.parts || EMPTY_SYNC_CREATOR_PARTS;
	const hasCurrentParallelParts = currentParallelParts.length > 1;
	const currentParentheticalLayoutCandidate = useMemo(() => {
		if (
			!multiVocalMode
			|| pendingMultiVocalDecision
			|| currentLineCoveredByPrevious
			|| currentLineMergedWithNext
			|| currentFullLineChars.length < 2
			|| Object.prototype.hasOwnProperty.call(parentheticalLayoutDrafts, currentLineStart)
			|| Object.prototype.hasOwnProperty.call(manualParallelSplitDrafts, currentLineStart)
			|| (Array.isArray(currentExistingLineData?.parallel?.parts) && currentExistingLineData.parallel.parts.length > 1)
		) {
			return null;
		}

		const separateTemplate = buildParentheticalParallelTemplate(currentFullLineChars, currentLineStart, {
			groupBackgroundParts: false
		});
		const groupedTemplate = buildParentheticalParallelTemplate(currentFullLineChars, currentLineStart, {
			groupBackgroundParts: true
		});
		const groupedBackgroundPart = groupedTemplate?.parts?.find(part =>
			part.role === 'background'
			&& Array.isArray(part.ranges)
			&& part.ranges.length > 1
		);
		if (
			!separateTemplate
			|| !groupedTemplate
			|| !groupedBackgroundPart
			|| !Array.isArray(separateTemplate.parts)
			|| !Array.isArray(groupedTemplate.parts)
			|| separateTemplate.parts.length <= groupedTemplate.parts.length
		) {
			return null;
		}

		return {
			lineStart: currentLineStart,
			lineIndex: currentLineIndex,
			original: currentFullLineChars.join(''),
			separatePreview: formatSyncCreatorParallelPreviewLines(separateTemplate, currentFullLineChars, currentLineStart),
			groupedPreview: formatSyncCreatorParallelPreviewLines(groupedTemplate, currentFullLineChars, currentLineStart)
		};
	}, [
		multiVocalMode,
		pendingMultiVocalDecision,
		currentLineCoveredByPrevious,
		currentLineMergedWithNext,
		currentFullLineChars,
		currentLineStart,
		currentLineIndex,
		parentheticalLayoutDrafts,
		manualParallelSplitDrafts,
		currentExistingLineData
	]);
	useEffect(() => {
		if (!currentParentheticalLayoutCandidate || pendingParentheticalLayoutDecision) return;
		setPendingParentheticalLayoutDecision(currentParentheticalLayoutCandidate);
	}, [currentParentheticalLayoutCandidate, pendingParentheticalLayoutDecision]);
	const activeParallelPart = hasCurrentParallelParts
		? currentParallelParts.find(part => part.id === activeParallelPartId) || currentParallelParts[0] || null
		: null;
	const activeParallelTargetId = activeParallelPart?.id || (hasCurrentParallelParts ? currentParallelParts[0]?.id || 'full' : 'full');
	const currentSpeakerMeta = activeParallelPart || currentLineMeta;
	const currentSpeakerTextColor = getSyncCreatorSpeakerTextColor(
		currentSpeakerMeta?.speaker,
		currentSpeakerMeta?.['speaker-color'],
		currentSpeakerMeta?.['speaker-fallback']
	);
	const currentSpeakerMutedColor = `color-mix(in srgb, ${currentSpeakerTextColor} 54%, transparent)`;
	const currentTextEffectKind = normalizeSyncCreatorKind(currentSpeakerMeta?.kind) || SYNC_CREATOR_DEFAULT_KIND;
	const textEffectsDisabled = readVisualSettings()?.['karaoke-text-effects'] === false;
	useEffect(() => {
		const pendingNavigation = pendingParallelNavigationRef.current;
		if (pendingNavigation?.lineIndex === currentLineIndex) {
			pendingParallelNavigationRef.current = null;
			if (multiVocalMode && hasCurrentParallelParts) {
				const targetPart = pendingNavigation.edge === 'last'
					? currentParallelParts[currentParallelParts.length - 1]
					: currentParallelParts[0];
				setActiveParallelPartId(targetPart?.id || 'full');
				return;
			}
			setActiveParallelPartId('full');
			return;
		}
		if (multiVocalMode && hasCurrentParallelParts) {
			const hasActivePart = currentParallelParts.some(part => part.id === activeParallelPartId);
			if (!hasActivePart) {
				setActiveParallelPartId(currentParallelParts[0]?.id || 'full');
			}
			return;
		}
		setActiveParallelPartId('full');
	}, [multiVocalMode, hasCurrentParallelParts, currentParallelParts, activeParallelPartId, currentLineIndex, lyricsText]);
	const getIncompleteParallelPartId = useCallback((lineData) => {
		if (!multiVocalMode || !currentParallelData || currentParallelParts.length <= 1) return null;
		for (const part of currentParallelParts) {
			if (!hasReusableSyncCreatorParallelChars(part, part)) {
				return part.id;
			}
			if (!isSyncCreatorSpeakerMetaComplete(part) || !(normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND)) {
				return part.id;
			}
		}
		return null;
	}, [multiVocalMode, currentParallelData, currentParallelParts]);
	const isCurrentSyncTargetMetaComplete = useMemo(() => {
		if (!multiVocalMode) return true;
		if (hasCurrentParallelParts) {
			const targetPart = activeParallelPart || currentParallelParts[0] || null;
			return !!(isSyncCreatorSpeakerMetaComplete(targetPart) && normalizeSyncCreatorKind(targetPart?.kind));
		}
		return !!(isSyncCreatorSpeakerMetaComplete(currentLineMeta) && normalizeSyncCreatorKind(currentLineMeta.kind));
	}, [multiVocalMode, hasCurrentParallelParts, activeParallelPart, currentParallelParts, currentLineMeta]);
	const completedLines = useMemo(() => countSyncCreatorCompletedLines({
		lyricDocument, syncData, multiVocalMode, mergedLayout,
		getParallelTemplateForLineData, mergeParallelTemplate: mergeSyncCreatorParallelTemplate,
	}), [lyricDocument, syncData, multiVocalMode, mergedLayout, getParallelTemplateForLineData, mergeSyncCreatorParallelTemplate]);
	const currentOffset = lineCharOffsets[currentLineIndex];
	const isCurrentLineSynced = useMemo(() => isSyncCreatorLineSynced(
		currentOffset === undefined ? null : currentExistingLineData, activeParallelPart, currentLineCoveredByPrevious,
	), [currentOffset, currentExistingLineData, activeParallelPart, currentLineCoveredByPrevious]);
	const currentLineCharRefs = useMemo(() => {
		if (activeParallelPart) {
			return rangesToCharRefs(activeParallelPart.ranges, currentFullLineChars, currentLineStart);
		}
		return currentFullLineChars.map((char, index) => ({
			absoluteIndex: currentLineStart + index,
			localIndex: index,
			char
		}));
	}, [activeParallelPart, currentFullLineChars, currentLineStart]);
	const currentLineChars = useMemo(
		() => currentLineCharRefs.map(ref => ref.char),
		[currentLineCharRefs]
	);

	return {
		currentLineStart, currentExistingLineData, getLineEndAtIndex, getMergedLineIndexesForStart, findMergedOwnerLineIndex,
		isLineCoveredByMergedPrevious, findNavigableLineIndex, currentMergedLineIndexes,
		currentLineMergedWithNext, currentLineCoveredByPrevious, previousNavigableLineIndex, nextNavigableLineIndex,
		currentFullLineChars, currentAutoMergeSplitPoints, currentAutoMergeSplitPointSet, nextMergeLineIndexes,
		canMergeCurrentLineWithNext, currentLineMeta, currentLineStyleRanges, getParallelTemplateForLineData,
		currentParallelTemplate, currentParallelData, currentParallelParts, hasCurrentParallelParts, activeParallelPart,
		activeParallelTargetId, currentSpeakerTextColor, currentSpeakerMutedColor, currentTextEffectKind,
		textEffectsDisabled, getIncompleteParallelPartId, isCurrentSyncTargetMetaComplete, currentLineCharRefs,
		currentLineChars, completedLines, isCurrentLineSynced,
	};
}
