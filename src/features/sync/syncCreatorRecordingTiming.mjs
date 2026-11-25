import {
	SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC,
	isFiniteSyncCreatorTime,
	roundSyncCreatorTime,
} from './timingGranularity.mjs';
import { clampSyncCreatorTimesToLockRange } from './selectionTiming.mjs';

const WORD_GAP_MS = 80;
const EDGE_INTERPOLATION_GAP_SEC = 0.045;

export function sameSyncCreatorRecordingTarget(previous, next) {
	return previous === next || Object.keys(next).every(key => previous[key] === next[key]);
}

const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
const isInternalJoiner = (chars, index) => {
	const ch = chars[index];
	if (!ch || !/['’"]/u.test(ch)) return false;
	return isWordChar(chars[index - 1]) && isWordChar(chars[index + 1]);
};
const isWordBoundary = (chars, index) => {
	const ch = chars[index];
	if (!ch) return false;
	if (isInternalJoiner(chars, index)) return false;
	return /[\s\-–—]/u.test(ch);
};
const isLeadingChar = (chars, index) => {
	const ch = chars[index];
	if (!ch) return false;
	if (isInternalJoiner(chars, index)) return false;
	return /[([{「『【〈《¿¡'"“”‘’]/u.test(ch);
};
const isTrailingChar = (chars, index) => {
	const ch = chars[index];
	if (!ch) return false;
	if (isInternalJoiner(chars, index)) return false;
	return /[\s!?.,;:)\]}」』】〉》'"“”‘’]/u.test(ch);
};

const edgeInterpolation = (progress) => {
	if (progress <= 0) return 0;
	if (progress >= 1) return 1;
	if (progress < 0.5) {
		const scaled = progress * 2;
		return 0.5 * (1 - Math.pow(1 - scaled, 3));
	}
	const scaled = (progress - 0.5) * 2;
	return 0.5 + (0.5 * Math.pow(scaled, 3));
};
const smoothStepInterpolation = (progress) => {
	if (progress <= 0) return 0;
	if (progress >= 1) return 1;
	return progress * progress * (3 - (2 * progress));
};
const applyInterpolatedRangeToCharTimes = (target, startIdx, endIdx, startTime, endTime, interpolationFn = edgeInterpolation) => {
	if (!target || startIdx > endIdx || startIdx < 0) return;
	const count = endIdx - startIdx + 1;
	const safeEndTime = Math.max(startTime, endTime);
	if (count <= 1) {
		target[startIdx] = roundSyncCreatorTime(startTime);
		return;
	}
	for (let i = 0; i < count; i++) {
		const progress = i / (count - 1);
		target[startIdx + i] = roundSyncCreatorTime(startTime + ((safeEndTime - startTime) * interpolationFn(progress)));
	}
};
const getPreviousRecordedSyncTime = (target, beforeIndex) => {
	if (!Array.isArray(target)) return null;
	for (let index = Math.min(beforeIndex - 1, target.length - 1); index >= 0; index--) {
		if (isFiniteSyncCreatorTime(target[index])) return target[index];
	}
	return null;
};
const getSequentialSyncTime = (rawTime, previousTime = null) => {
	const safeRawTime = Number.isFinite(rawTime) ? rawTime : 0;
	if (typeof previousTime !== 'number' || !Number.isFinite(previousTime)) {
		return roundSyncCreatorTime(safeRawTime);
	}
	return roundSyncCreatorTime(Math.max(safeRawTime, previousTime + SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC));
};
const estimateSyllableInterpolationDuration = (startIdx, endIdx) =>
	Math.min(0.22, Math.max(0.07, (endIdx - startIdx + 1) * 0.05));
const estimateWordInterpolationDuration = (startIdx, endIdx) => {
	const charCount = Math.max(1, endIdx - startIdx + 1);
	const preferredDuration = charCount * 0.085;
	const minimumDuration = 0.11 + Math.max(0, charCount - 1) * 0.05;
	return Math.min(0.42, Math.max(minimumDuration, preferredDuration));
};

function interpolateSyncCreatorUnit(times, { startIdx, endIdx, startTime }, unit, nextTime = null) {
	const isWord = unit === 'word';
	const gap = isWord ? WORD_GAP_MS / 1000 : EDGE_INTERPOLATION_GAP_SEC;
	const estimateDuration = isWord ? estimateWordInterpolationDuration : estimateSyllableInterpolationDuration;
	const endTime = Number.isFinite(nextTime) ? Math.max(startTime, nextTime - gap)
		: startTime + estimateDuration(startIdx, endIdx);
	applyInterpolatedRangeToCharTimes(times, startIdx, endIdx, startTime, endTime,
		isWord ? smoothStepInterpolation : undefined);
	return endTime - startTime;
}

function finishSyncCreatorRecordedTimes(input, { endIndex, charCount, endTime, startTime, lockRange, savedChars }) {
	const chars = [];
	const firstAnchor = startTime ?? (isFiniteSyncCreatorTime(input[0]) ? input[0] : endTime);
	const perCharDuration = 0.5 / Math.max(1, charCount - endIndex - 1);
	for (let index = 0; index < charCount; index++) {
		let time = input[index];
		if (!isFiniteSyncCreatorTime(time)) {
			time = index <= endIndex
				? (chars[index - 1] ?? firstAnchor) + 0.02
				: endTime + ((index - endIndex) * perCharDuration);
		}
		chars.push(roundSyncCreatorTime(time));
	}
	return lockRange
		? clampSyncCreatorTimesToLockRange(chars, savedChars, lockRange, SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC)
		: chars;
}

function getSyncCreatorPunctuationSpanEnd(chars, index) {
	let end = index;
	while (end + 1 < chars.length && isLeadingChar(chars, end)) end++;
	while (end + 1 < chars.length && isTrailingChar(chars, end + 1)) end++;
	return end;
}

const isLatinChar = (ch) => !!ch && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch);
const isLatinVowel = (ch) => !!ch && /[AEIOUYaeiouyÀ-ÖØ-öø-ÿ]/.test(ch);
const isValidOnsetCluster = (cluster) => /^(bl|br|ch|chr|cl|cr|dr|fl|fr|gl|gr|ph|pl|pr|qu|sc|sch|scr|sh|sk|sl|sm|sn|sp|spl|spr|st|str|sw|th|thr|tr|tw|wh|wr)$/i.test(cluster);
const buildLatinWordSyllables = (chars, wordStart, wordEnd) => {
	const nuclei = [];
	let index = wordStart;

	while (index <= wordEnd) {
		if (!isLatinVowel(chars[index])) {
			index++;
			continue;
		}

		const nucleusStart = index;
		index++;
		while (index <= wordEnd && isLatinVowel(chars[index])) {
			index++;
		}
		nuclei.push({ start: nucleusStart, end: index - 1 });
	}

	if (nuclei.length > 1) {
		const lastNucleus = nuclei[nuclei.length - 1];
		if (lastNucleus.start === lastNucleus.end &&
			lastNucleus.end === wordEnd &&
			/[eE]/.test(chars[lastNucleus.start]) &&
			isWordChar(chars[lastNucleus.start - 1])) {
			nuclei.pop();
		}
	}

	if (!nuclei.length) {
		return [{ start: wordStart, end: wordEnd }];
	}

	const syllables = [];
	let currentStart = wordStart;

	for (let i = 0; i < nuclei.length; i++) {
		const nucleus = nuclei[i];
		const nextNucleus = nuclei[i + 1];

		if (!nextNucleus) {
			syllables.push({ start: currentStart, end: wordEnd });
			break;
		}

		const consonantRunStart = nucleus.end + 1;
		const consonantRunEnd = nextNucleus.start - 1;
		let splitAfter = nucleus.end;

		if (consonantRunEnd >= consonantRunStart) {
			const runLength = consonantRunEnd - consonantRunStart + 1;
			if (runLength === 1) {
				splitAfter = nucleus.end;
			} else {
				splitAfter = consonantRunEnd - 1;
				const onsetCluster = chars.slice(splitAfter + 1, consonantRunEnd + 1).join('').toLowerCase();
				if (runLength > 2 && isValidOnsetCluster(onsetCluster)) {
					splitAfter = consonantRunStart - 1;
				}
			}
		}

		syllables.push({ start: currentStart, end: splitAfter });
		currentStart = splitAfter + 1;
	}

	return syllables.filter(segment => segment.start <= segment.end);
};

const buildLineSyllableSegments = (chars) => {
	if (!Array.isArray(chars) || !chars.length) return [];
	const segments = [];
	let index = 0;
	let pendingPrefixStart = 0;

	while (index < chars.length) {
		while (index < chars.length && isWordBoundary(chars, index)) {
			index++;
		}

		if (index >= chars.length) {
			break;
		}

		const prefixStart = pendingPrefixStart;
		let wordStart = index;
		while (wordStart < chars.length && isLeadingChar(chars, wordStart) && !isWordBoundary(chars, wordStart)) {
			wordStart++;
		}

		let wordEnd = wordStart;
		while (wordEnd < chars.length && !isWordBoundary(chars, wordEnd)) {
			wordEnd++;
		}
		wordEnd--;

		if (wordEnd < wordStart) {
			index++;
			pendingPrefixStart = index;
			continue;
		}

		let trailingEnd = wordEnd;
		while (trailingEnd >= wordStart && isTrailingChar(chars, trailingEnd) && !isInternalJoiner(chars, trailingEnd)) {
			trailingEnd--;
		}

		const coreEnd = Math.max(wordStart, trailingEnd);
		const isLatinWord = isLatinChar(chars[wordStart])
			&& chars.slice(wordStart, coreEnd + 1).every(ch => isLatinChar(ch) || /['’]/u.test(ch));
		let wordSegments = isLatinWord
			? buildLatinWordSyllables(chars, wordStart, coreEnd)
			: Array.from({ length: coreEnd - wordStart + 1 }, (_, offset) => {
				const charIndex = wordStart + offset;
				return { start: charIndex, end: charIndex };
			});

		if (!wordSegments.length) {
			wordSegments = [{ start: wordStart, end: coreEnd }];
		}

		wordSegments = wordSegments.map((segment, segmentIndex) => ({
			start: segmentIndex === 0 ? prefixStart : segment.start,
			end: segmentIndex === wordSegments.length - 1 ? wordEnd : segment.end,
		}));

		segments.push(...wordSegments.filter(segment => segment.start <= segment.end));
		index = wordEnd + 1;
		pendingPrefixStart = index;
	}

	if (!segments.length && chars.length) {
		segments.push({ start: 0, end: chars.length - 1 });
	}

	return segments;
};

export {
	buildLineSyllableSegments,
	WORD_GAP_MS,
	isWordBoundary,
	isLeadingChar,
	isTrailingChar,
	isInternalJoiner,
	isWordChar,
	getPreviousRecordedSyncTime,
	getSequentialSyncTime,
	interpolateSyncCreatorUnit,
	finishSyncCreatorRecordedTimes,
	getSyncCreatorPunctuationSpanEnd,
};

