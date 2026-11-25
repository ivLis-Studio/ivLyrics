import { stripSyncCreatorStandaloneParentheticalCharRange } from './syncCreatorLyricText.mjs';
import { SYNC_CREATOR_DEFAULT_KIND, SYNC_CREATOR_DEFAULT_SPEAKER } from './syncCreatorVocalStyles.mjs';

const PART_LABELS = 'abcdefghijklmnopqrstuvwxyz';
const buildPart = (index, ranges, role = index === 0 ? 'lead' : 'background', joinMode = 1) => ({
	id: PART_LABELS[index] || `p${index + 1}`,
	role,
	speaker: SYNC_CREATOR_DEFAULT_SPEAKER,
	kind: SYNC_CREATOR_DEFAULT_KIND,
	ranges,
	join: new Array(Math.max(0, ranges.length - 1)).fill(joinMode),
});

const pushSyncCreatorRange = (ranges, start, end, lineStart) => {
	if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return;
	ranges.push({ start: lineStart + start, end: lineStart + end });
};

const pushSyncCreatorHiddenIndex = (hiddenRanges, lineStart, index) => {
	const previous = hiddenRanges[hiddenRanges.length - 1];
	const absoluteIndex = lineStart + index;
	if (previous && previous.end + 1 === absoluteIndex) {
		previous.end = absoluteIndex;
	} else {
		hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
	}
};

const trimSyncCreatorRunWhitespace = (chars, runStart, endIndex, pushHidden) => {
	if (runStart !== null && endIndex >= runStart) {
		while (runStart <= endIndex && /\s/u.test(chars[runStart] || '')) {
			pushHidden(runStart);
			runStart++;
		}
		const originalEndIndex = endIndex;
		while (endIndex >= runStart && /\s/u.test(chars[endIndex] || '')) {
			endIndex--;
		}
		for (let index = endIndex + 1; index <= originalEndIndex; index++) {
			pushHidden(index);
		}
	}
	return { runStart, endIndex };
};

export function createSyncCreatorVocalTemplates(sanitizeSyncCreatorParallel) {
	const buildParentheticalParallelTemplate = (lineChars, lineStart = 0, options = {}) => {
		const chars = Array.isArray(lineChars) ? lineChars : [];
		if (!chars.length) return null;

		const groupBackgroundParts = options.groupBackgroundParts === true;

		const buildSeparatorTemplate = () => {
			const partRanges = [];
			const hiddenRanges = [];
			let depth = 0;
			let partIndex = 0;
			let runStart = null;

			const pushHidden = (index) => pushSyncCreatorHiddenIndex(hiddenRanges, lineStart, index);

			const flushRun = (endIndex) => {
				const trimmed = trimSyncCreatorRunWhitespace(chars, runStart, endIndex, pushHidden);
				runStart = trimmed.runStart;
				endIndex = trimmed.endIndex;
				if (runStart !== null && endIndex >= runStart) {
					if (!partRanges[partIndex]) partRanges[partIndex] = [];
					pushSyncCreatorRange(partRanges[partIndex], runStart, endIndex, lineStart);
				}
				runStart = null;
			};

			for (let index = 0; index < chars.length; index++) {
				const char = chars[index] || '';
				if (char === '(' || char === '（') depth++;
				if (char === ')' || char === '）') depth = Math.max(0, depth - 1);

				if ((char === '/' || char === '|' || char === '／' || char === '｜') && depth === 0) {
					flushRun(index - 1);
					pushHidden(index);
					partIndex++;
					continue;
				}

				if (/\s/u.test(char) && runStart === null) {
					pushHidden(index);
					continue;
				}

				if (runStart === null) {
					runStart = index;
				}
			}

			flushRun(chars.length - 1);

			const parts = partRanges
				.filter(ranges => Array.isArray(ranges) && ranges.length > 0)
				.map((ranges, index) => buildPart(index, ranges));

			if (parts.length < 2) return null;

			return sanitizeSyncCreatorParallel({
				layout: 'stack',
				parts,
				hiddenRanges
			});
		};

		const separatorTemplate = buildSeparatorTemplate();
		if (separatorTemplate) return separatorTemplate;

		const leadRanges = [];
		const backgroundRangeGroups = [];
		const hiddenRanges = [];
		let depth = 0;
		let runStart = null;
		let runPart = null;

		const flushRun = (endIndex) => {
			const trimmed = trimSyncCreatorRunWhitespace(chars, runStart, endIndex, pushHidden);
			runStart = trimmed.runStart;
			endIndex = trimmed.endIndex;
			if (runStart !== null && endIndex >= runStart) {
				if (runPart === 'background') {
					const ranges = [];
					pushSyncCreatorRange(ranges, runStart, endIndex, lineStart);
					if (ranges.length > 0) backgroundRangeGroups.push(ranges);
				} else {
					pushSyncCreatorRange(leadRanges, runStart, endIndex, lineStart);
				}
			}
			runStart = null;
			runPart = null;
		};

		const pushHidden = (index) => pushSyncCreatorHiddenIndex(hiddenRanges, lineStart, index);

		for (let index = 0; index < chars.length; index++) {
			const char = chars[index] || '';
			const isOpen = char === '(' || char === '（';
			const isClose = char === ')' || char === '）';
			if (isOpen || isClose) {
				flushRun(index - 1);
				pushHidden(index);
				depth = isOpen ? depth + 1 : Math.max(0, depth - 1);
				continue;
			}

			const part = depth > 0 ? 'background' : 'lead';
			if (runStart === null) {
				runStart = index;
				runPart = part;
			} else if (runPart !== part) {
				flushRun(index - 1);
				runStart = index;
				runPart = part;
			}
		}
		flushRun(chars.length - 1);

		if (!leadRanges.length || !backgroundRangeGroups.length) return null;
		const orderedRangeGroups = [
			{ role: 'lead', ranges: leadRanges, joinMode: 1 },
			...(groupBackgroundParts
				? [{ role: 'background', ranges: backgroundRangeGroups.flat(), joinMode: 2 }]
				: backgroundRangeGroups.map(ranges => ({ role: 'background', ranges, joinMode: 1 })))
		]
			.filter(group => group.ranges.length > 0)
			.sort((a, b) => a.ranges[0].start - b.ranges[0].start);

		return sanitizeSyncCreatorParallel({
			layout: 'stack',
			parts: orderedRangeGroups.map((group, index) =>
				buildPart(index, group.ranges, group.role, group.joinMode)
			),
			hiddenRanges
		}, {
			splitHiddenDelimitedBackgroundParts: !groupBackgroundParts
		});
	};

	const buildManualParallelTemplate = (lineChars, lineStart = 0, splitPoints = []) => {
		const chars = Array.isArray(lineChars) ? lineChars : [];
		if (chars.length < 2 || !Array.isArray(splitPoints) || splitPoints.length === 0) return null;

		const normalizedSplitPoints = [...new Set(splitPoints
			.map(value => Number(value))
			.filter(value => Number.isInteger(value) && value > 0 && value < chars.length))]
			.sort((a, b) => a - b);
		if (normalizedSplitPoints.length === 0) return null;

		const hiddenRanges = [];
		const parts = [];

		const pushHidden = (index) => pushSyncCreatorHiddenIndex(hiddenRanges, lineStart, index);

		const boundaries = [0, ...normalizedSplitPoints, chars.length];
		for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex++) {
			let { runStart: start, endIndex: end } = trimSyncCreatorRunWhitespace(
				chars, boundaries[boundaryIndex], boundaries[boundaryIndex + 1] - 1, pushHidden
			);
			if (start > end) continue;

			const stripped = stripSyncCreatorStandaloneParentheticalCharRange(chars, start, end, pushHidden);
			if (stripped.changed) {
				start = stripped.start;
				end = stripped.end;
				if (start > end) continue;
			}

			parts.push(buildPart(parts.length, [{ start: lineStart + start, end: lineStart + end }]));
		}

		if (parts.length < 2) return null;
		return sanitizeSyncCreatorParallel({
			layout: 'stack',
			parts,
			hiddenRanges
		});
	};

	return { buildParentheticalParallelTemplate, buildManualParallelTemplate };
}
