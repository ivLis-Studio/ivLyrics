import {
	countSyncCreatorRangeChars, decodeSyncCreatorCompactTiming, isFiniteSyncCreatorTime, normalizeSyncCreatorGranularity,
} from './timingGranularity.mjs';
import {
	areSyncCreatorParallelRangesEqual, getSyncCreatorConcurrentParallelParts, preserveSyncCreatorParallelTimingRuns,
} from './parallelTiming.mjs';
import { repairSyncCreatorLineCharsFromParallel, SYNC_CREATOR_MAX_PART_ID_LENGTH } from './timingValidation.mjs';
import { SYNC_CREATOR_DEFAULT_KIND, SYNC_CREATOR_DEFAULT_SPEAKER } from './syncCreatorVocalStyles.mjs';
import {
	normalizeSyncCreatorHiddenRanges, normalizeSyncCreatorParentheticalParallelRanges,
	splitSyncCreatorHiddenDelimitedParallelParts,
} from './syncCreatorVocalRanges.mjs';
import { createSyncCreatorVocalTemplates } from './syncCreatorVocalTemplates.mjs';

function clipVocalDisplayRange(range, lineStart, charCount) {
	const start = Math.max(lineStart, Number(range?.start));
	const end = Math.min(lineStart + charCount - 1, Number(range?.end));
	return Number.isInteger(start) && Number.isInteger(end) && start <= end ? { start, end } : null;
}

export const rangesToCharRefs = (ranges, lineChars, lineStart = 0) => {
	if (!Array.isArray(ranges) || !Array.isArray(lineChars)) return [];
	const refs = [];
	ranges.forEach((range) => {
		const clipped = clipVocalDisplayRange(range, lineStart, lineChars.length);
		if (!clipped) return;
		const { start, end } = clipped;
		for (let index = start; index <= end; index++) {
			refs.push({ absoluteIndex: index, localIndex: index - lineStart, char: lineChars[index - lineStart] || '' });
		}
	});
	return refs;
};

const getSyncCreatorParallelJoinText = (joinMode) => {
	const mode = Number(joinMode);
	return mode === 1 || mode === 2 ? ' ' : '';
};

const getSyncCreatorParallelPartText = (part, lineChars, lineStart = 0) => {
	if (!part || !Array.isArray(part.ranges) || !Array.isArray(lineChars)) return '';
	let text = '';
	part.ranges.forEach((range, rangeIndex) => {
		if (rangeIndex > 0) {
			text += getSyncCreatorParallelJoinText(Array.isArray(part.join) ? part.join[rangeIndex - 1] : 1);
		}
		const clipped = clipVocalDisplayRange(range, lineStart, lineChars.length);
		if (!clipped) return;
		const { start, end } = clipped;
		text += lineChars.slice(start - lineStart, end - lineStart + 1).join('');
	});
	return text.trim();
};

export const getSyncCreatorParallelPartDisplayItems = (part, lineChars, lineStart = 0) => {
	if (!part || !Array.isArray(part.ranges) || !Array.isArray(lineChars)) return [];
	const items = [];
	let charIndex = 0;
	part.ranges.forEach((range, rangeIndex) => {
		if (rangeIndex > 0) {
			const separator = getSyncCreatorParallelJoinText(Array.isArray(part.join) ? part.join[rangeIndex - 1] : 1);
			if (separator) {
				items.push({ type: 'separator', text: separator, key: `join-${rangeIndex}` });
			}
		}
		const clipped = clipVocalDisplayRange(range, lineStart, lineChars.length);
		if (!clipped) return;
		const { start, end } = clipped;
		for (let index = start; index <= end; index++) {
			items.push({
				type: 'char',
				key: `char-${index}`,
				charIndex,
				absoluteIndex: index,
				localIndex: index - lineStart,
				char: lineChars[index - lineStart] || ''
			});
			charIndex++;
		}
	});
	return items;
};

export const formatSyncCreatorParallelPreviewLines = (parallel, lineChars, lineStart = 0) => (
	Array.isArray(parallel?.parts)
		? parallel.parts
			.map(part => getSyncCreatorParallelPartText(part, lineChars, lineStart))
			.filter(Boolean)
		: []
);

export function createSyncCreatorVocalLayout({
	getCodec, getSyncCreatorWordRanges, editingVersion,
	normalizeSyncCreatorSpeaker, normalizeSyncCreatorKind, sanitizeSyncCreatorSpeakerColor,
	sanitizeSyncCreatorSpeakerFallback, normalizeSyncCreatorStyleRanges,
	resolveSyncCreatorParallelTemplateParts, projectSyncCreatorUnitLayout,
}) {
	const sanitizeSpeakerInPlace = (target) => {
		const sourceSpeaker = target.speaker;
		const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker);
		if (speaker) target.speaker = speaker;
		const fallback = sanitizeSyncCreatorSpeakerFallback(speaker, target['speaker-fallback'], true, sourceSpeaker);
		if (fallback) target['speaker-fallback'] = fallback;
		else delete target['speaker-fallback'];
		const color = sanitizeSyncCreatorSpeakerColor(speaker, target['speaker-color'], true, fallback);
		if (color) target['speaker-color'] = color;
		else delete target['speaker-color'];
		return target;
	};

	const sanitizeSyncCreatorParallel = (parallel, options = {}) => {
		if (!parallel || typeof parallel !== 'object') return parallel;
		const nextParallel = { ...parallel };
		if (Array.isArray(nextParallel.parts)) {
			nextParallel.parts = nextParallel.parts.map(part => part && typeof part === 'object'
				? sanitizeSpeakerInPlace({ ...part }) : part);
		}
		const hiddenRanges = normalizeSyncCreatorHiddenRanges(nextParallel.hiddenRanges);
		if (hiddenRanges.length > 0) {
			nextParallel.hiddenRanges = hiddenRanges;
		} else {
			delete nextParallel.hiddenRanges;
		}
		return splitSyncCreatorHiddenDelimitedParallelParts(nextParallel, options);
	};

	const sanitizeSyncCreatorSyncData = (data, fullTextChars = null) => {
		if (data?.version === 6) data = getCodec().decode(data);
		if (!data || !Array.isArray(data.lines)) return data;
		let migratedParallelRanges = false;
		const lines = data.lines.map((line) => {
			const lineStart = Number(line?.start);
			const lineEnd = Number(line?.end);
			const expectedLineLength = Number.isInteger(lineStart) && Number.isInteger(lineEnd) && lineEnd >= lineStart
				? lineEnd - lineStart + 1
				: 0;
			const nextLine = decodeSyncCreatorCompactTiming(line, expectedLineLength);
			if (nextLine.parallel && Array.isArray(nextLine.parallel.parts)) {
				nextLine.parallel = {
					...nextLine.parallel,
					parts: nextLine.parallel.parts.map(part => decodeSyncCreatorCompactTiming(
						part,
						countSyncCreatorRangeChars(part?.ranges)
					))
				};
			}
			sanitizeSpeakerInPlace(nextLine);
			if (nextLine.parallel) {
				const normalized = normalizeSyncCreatorParentheticalParallelRanges(nextLine.parallel, fullTextChars);
				nextLine.parallel = sanitizeSyncCreatorParallel(normalized.parallel);
				migratedParallelRanges = migratedParallelRanges || normalized.changed;
			}
			const hiddenRanges = normalizeSyncCreatorHiddenRanges(nextLine.hiddenRanges);
			if (hiddenRanges.length > 0) {
				nextLine.hiddenRanges = hiddenRanges;
			} else {
				delete nextLine.hiddenRanges;
			}
			const styleRanges = normalizeSyncCreatorStyleRanges(nextLine.styleRanges, lineStart, lineEnd);
			if (styleRanges.length > 0) {
				nextLine.styleRanges = styleRanges;
			} else {
				delete nextLine.styleRanges;
			}
			return repairSyncCreatorLineCharsFromParallel(nextLine);
		});
		const hasParallelLines = lines.some(line => Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1);
		const hasInlineStyleRanges = lines.some(line => Array.isArray(line?.styleRanges) && line.styleRanges.length > 0);
		const version = Number(data.version);

		return {
			...data,
			...(hasParallelLines || migratedParallelRanges || hasInlineStyleRanges
				? { version: Math.max(Number.isFinite(version) ? version : 1, editingVersion) }
				: {}),
			lines
		};
	};

	const compactSyncCreatorSyncData = (data, fullTextChars = null, locale = undefined) => {
		if (!data || !Array.isArray(data.lines)) return data;
		const codec = getCodec();
		if (!codec) throw new Error('Sync v6 codec is unavailable. Please update ivLyrics.');
		return codec.encode(data, {
			chars: Array.isArray(fullTextChars) ? fullTextChars : [],
			wordRanges: chars => getSyncCreatorWordRanges(chars, locale)
		});
	};

	const mergeSyncCreatorParallelTemplate = (template, existingLine) => {
		if (!template) return null;
		const existingParallel = existingLine?.parallel;
		const parallel = sanitizeSyncCreatorParallel({
			layout: existingParallel?.layout || template.layout || 'stack',
			...(Array.isArray(template.manualSplitPoints) ? { manualSplitPoints: template.manualSplitPoints } : {}),
			hiddenRanges: Array.isArray(template.hiddenRanges) ? template.hiddenRanges : [],
			parts: resolveSyncCreatorParallelTemplateParts(template.parts, existingLine).map(({ part, sourcePart: existing, chars: reusableChars }) => {
				const sourceSpeaker = existing?.speaker || part.speaker;
				const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					existing?.['speaker-fallback'] || part['speaker-fallback'],
					true,
					sourceSpeaker
				);
				return projectSyncCreatorUnitLayout(existing, {
					...part,
					role: existing?.role || part.role,
					speaker,
					...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {}),
					'speaker-color': sanitizeSyncCreatorSpeakerColor(
						speaker,
						existing?.['speaker-color'] || part['speaker-color'],
						true,
						speakerFallback
					) || undefined,
					kind: normalizeSyncCreatorKind(existing?.kind || part.kind) || SYNC_CREATOR_DEFAULT_KIND,
					granularity: normalizeSyncCreatorGranularity(existing?.granularity || existingLine?.granularity),
					chars: reusableChars,
					// The held end stays with the same saved vocal and its marks.
					...(isFiniteSyncCreatorTime(existing?.lastCharEnd) && reusableChars === existing.chars
						&& areSyncCreatorParallelRangesEqual(part.ranges, existing.ranges)
						? { lastCharEnd: existing.lastCharEnd }
						: {})
				});
			})
		});
		// Partitioning the main lyric text must not discard a second voice that
		// sings the same source indexes with its own timing, ranges and styling.
		for (const part of getSyncCreatorConcurrentParallelParts(existingParallel)) {
			if (parallel.parts.some(target => target.id === part.id
				&& areSyncCreatorParallelRangesEqual(target.ranges, part.ranges))) continue;
			const usedIds = new Set(parallel.parts.map(target => target.id));
			let id = part.id;
			for (let suffix = 1; usedIds.has(id); suffix++) {
				const ending = `_${suffix}`;
				id = `${String(part.id).slice(0, SYNC_CREATOR_MAX_PART_ID_LENGTH - ending.length)}${ending}`;
			}
			parallel.parts.push({ ...part, id });
		}
		return parallel;
	};

	return {
		normalizeSyncCreatorHiddenRanges,
		sanitizeSyncCreatorParallel,
		sanitizeSyncCreatorSyncData,
		compactSyncCreatorSyncData,
		...createSyncCreatorVocalTemplates(sanitizeSyncCreatorParallel),
		mergeSyncCreatorParallelTemplate,
	};
}

export function materializeSyncCreatorVocalDrafts(sourceData, options, {
	editingVersion, lyricDocument, getMergedLineIndexesForStart, getParallelTemplateForLineData,
	manualParallelSplitDrafts, mergeSyncCreatorParallelTemplate, rejoinSyncCreatorParallelLine,
	getSyncCreatorRejoinedLineChars, refreshSyncCreatorLineCharsFromParallel,
}) {
	if (!sourceData || !Array.isArray(sourceData.lines)) return sourceData;
	const linesByStart = new Map(sourceData.lines.map(line => [Number(line?.start), line]));
	const lines = sourceData.lines.map((line) => {
		const lineStart = Number(line?.start);
		if (options.lineStarts && !options.lineStarts.has(lineStart)) return line;
		const lineIndex = lyricDocument.lineIndexByStart.get(lineStart);
		if (!Number.isInteger(lineIndex)) return line;
		const mergedIndexes = getMergedLineIndexesForStart(lineIndex, linesByStart);
		const isMergedWithNext = mergedIndexes.length > 1;
		const lineChars = isMergedWithNext
			? mergedIndexes.flatMap(index => lyricDocument.lineChars[index] || [])
			: lyricDocument.lineChars[lineIndex] || [];
		const template = getParallelTemplateForLineData(
			line,
			lineChars,
			lineStart,
			isMergedWithNext
		);
		const parallel = mergeSyncCreatorParallelTemplate(template, line);
		if (!parallel || !Array.isArray(parallel.parts) || parallel.parts.length <= 1) {
			if ((!Object.prototype.hasOwnProperty.call(manualParallelSplitDrafts, line.start)
				&& !Array.isArray(line.parallel?.manualSplitPoints)) || !line.parallel) {
				return line;
			}
			return rejoinSyncCreatorParallelLine(line, options);
		}
		const projectedLine = {
			...line,
			parallel: options.preview === true ? parallel : preserveSyncCreatorParallelTimingRuns(parallel)
		};
		return options.preview === true
			? { ...projectedLine, chars: getSyncCreatorRejoinedLineChars(projectedLine) }
			: refreshSyncCreatorLineCharsFromParallel(projectedLine);
	});
	return {
		...sourceData,
		version: lines.some(line => (
			(Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1)
			|| (Array.isArray(line?.styleRanges) && line.styleRanges.length > 0)
		))
			? editingVersion
			: sourceData.version,
		lines
	};
}
