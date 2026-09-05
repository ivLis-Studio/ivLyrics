/**
 * SyncDataCreator - 노래방 싱크 데이터 생성 UI
 */

const SYNC_CREATOR_RTL_STRONG_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const SYNC_CREATOR_LTR_STRONG_CHAR_REGEX = /[A-Za-z\u00C0-\u02AF\u0370-\u052F\u1E00-\u1EFF]/u;
const SYNC_CREATOR_JAPANESE_KANA_REGEX = /[\u3040-\u30ff\uff66-\uff9f]/u;
const SYNC_CREATOR_KANJI_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const SYNC_CREATOR_JAPANESE_ATTACH_KANA_REGEX = /^[\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u3093\u3095\u3096\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f3\u30f5\u30f6\u30fc\uff67-\uff70\uff9d]$/u;
const SYNC_CREATOR_HANGUL_JAMO_ONLY_REGEX = /^[\u3131-\u3163\u1100-\u11ff]+$/u;
const SYNC_CREATOR_SPEAKER_OPTIONS = [
	'NORMAL',
	...Array.from({ length: 5 }, (_, index) => `MALE ${index + 1}`),
	...Array.from({ length: 5 }, (_, index) => `FEMALE ${index + 1}`),
	...Array.from({ length: 5 }, (_, index) => `DUET ${index + 1}`),
	'CUSTOM'
];
const SYNC_CREATOR_LEGACY_CUSTOM_SPEAKER_FALLBACKS = {
	'MALE CUSTOM': 'MALE 1',
	'FEMALE CUSTOM': 'FEMALE 1',
	'DUET CUSTOM': 'DUET 1'
};
const SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS = ['MALE 1', 'FEMALE 1', 'DUET 1'];
const SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK = 'MALE 1';
const SYNC_CREATOR_BULK_SPEAKER_OPTIONS = [...SYNC_CREATOR_SPEAKER_OPTIONS];
const SYNC_CREATOR_SPEAKER_TEXT_COLORS = {
	'NORMAL': '#f2f4f7',
	'MALE 1': '#a8ccff',
	'MALE 2': '#9ae8d4',
	'MALE 3': '#bfe8ff',
	'MALE 4': '#7fb5e6',
	'MALE 5': '#6cb8b8',
	'FEMALE 1': '#ffb8c7',
	'FEMALE 2': '#ffd6b3',
	'FEMALE 3': '#f6c8ff',
	'FEMALE 4': '#e6b4d4',
	'FEMALE 5': '#f6e5a5',
	'DUET 1': '#e4d8ff',
	'DUET 2': '#d6e4ff',
	'DUET 3': '#ffddf2',
	'DUET 4': '#bfaeff',
	'DUET 5': '#9d8cf2'
};
const SYNC_CREATOR_DEFAULT_SPEAKER = 'NORMAL';
const SYNC_CREATOR_DEFAULT_KIND = 'vocal';
const SYNC_CREATOR_MAX_MERGED_LINES = 5;
const SYNC_CREATOR_SYNC_DATA_VERSION = 5;
const SYNC_CREATOR_SOURCE_ADDON_ID = 'lrclib';
const SYNC_CREATOR_GRANULARITIES = new Set(['line', 'word', 'character']);
const SYNC_CREATOR_DEFAULT_GRANULARITY = 'character';
const SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC = 0.001;
const SYNC_CREATOR_PREVIEW_POSITION_UPDATE_INTERVAL_MS = 100;
const SYNC_CREATOR_RECORD_POSITION_UPDATE_INTERVAL_MS = 50;
const SYNC_CREATOR_IDLE_POSITION_UPDATE_INTERVAL_MS = 500;
const SYNC_CREATOR_POSITION_COMMIT_THRESHOLD_MS = 80;
const SYNC_CREATOR_RECORD_POSITION_COMMIT_THRESHOLD_MS = 35;
const SYNC_CREATOR_HISTORY_HEIGHT_STORAGE_KEY = 'ivLyrics:syncCreator:history-panel-height';
const SYNC_CREATOR_AUTOSAVE_ENABLED_STORAGE_KEY = 'ivLyrics:syncCreator:autosave-enabled';
const SYNC_CREATOR_AUTOSAVE_INTERVAL_MS = 30_000;
const SYNC_CREATOR_HISTORY_MIN_HEIGHT = 130;
const SYNC_CREATOR_PROGRESS_COLOR = 'rgb(var(--spice-rgb-accent, 30, 215, 96))';
const SYNC_CREATOR_PROGRESS_BACKGROUND = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.18)';
const SYNC_CREATOR_SYNCED_BACKGROUND = 'rgba(255, 255, 255, 0.055)';
const SYNC_CREATOR_RECORDING_BACKGROUND = 'rgba(255, 152, 0, 0.6)';
const SYNC_CREATOR_PRONUNCIATION_TARGET_STORAGE_KEY = 'ivLyrics:syncCreator:pronunciation-target-mode';
const SYNC_CREATOR_PRONUNCIATION_TARGET_MODES = new Set(['latin', 'translation']);
const normalizeSyncCreatorLrclibId = (value) => {
	const normalized = value === null || value === undefined ? '' : String(value).trim();
	return /^[1-9]\d*$/.test(normalized) ? normalized : '';
};
const isCompleteSyncCreatorLrclibSource = (source) => {
	if (!source || source.provider !== SYNC_CREATOR_SOURCE_ADDON_ID) return false;
	if (!normalizeSyncCreatorLrclibId(source.lrclibId)) return false;
	if (!['synced', 'plain', 'unknown'].includes(source.preferredLyricsSource)) return false;
	if (!Number.isFinite(Number(source.duration)) || Number(source.duration) < 0) return false;
	if (!/^lrclib-[a-z0-9]+-[a-z0-9]+$/i.test(String(source.lyricsFingerprint || ''))) return false;
	if (!Array.isArray(source.lineCharCounts) || source.lineCharCounts.length === 0) return false;
	if (source.lineCount !== source.lineCharCounts.length) return false;
	let textCharCount = 0;
	for (const count of source.lineCharCounts) {
		if (!Number.isInteger(count) || count < 0) return false;
		textCharCount += count;
	}
	return source.textCharCount === textCharCount;
};
const normalizeSyncCreatorPronunciationTargetMode = (value) => {
	const normalized = String(value || '').trim().toLowerCase();
	return SYNC_CREATOR_PRONUNCIATION_TARGET_MODES.has(normalized) ? normalized : 'latin';
};
const getSyncCreatorUiLanguage = () => (
	window.I18n?.getCurrentLanguage?.()
	|| window.CONFIG?.visual?.language
	|| Spicetify.Locale?.getLocale?.()?.split('-')[0]
	|| navigator.language?.split('-')[0]
	|| 'en'
);
const getSyncCreatorTranslationTargetLanguage = () => {
	const configuredLanguage = window.CONFIG?.visual?.['translate:target-language']
		|| localStorage.getItem('ivLyrics:visual:translate:target-language');
	if (configuredLanguage && configuredLanguage !== 'auto') {
		return configuredLanguage;
	}
	return getSyncCreatorUiLanguage();
};
const getSyncCreatorPronunciationTargetLanguage = (mode = 'latin') => {
	switch (normalizeSyncCreatorPronunciationTargetMode(mode)) {
		case 'translation':
			return getSyncCreatorTranslationTargetLanguage();
		case 'latin':
		default:
			return 'en';
	}
};
const getSyncCreatorLockedPlaybackProgressIndex = (previewIndex, lockIndex, recordingIndex) => {
	const numericLockIndex = Number(lockIndex);
	const numericRecordingIndex = Number(recordingIndex);
	if (
		!Number.isInteger(numericLockIndex)
		|| numericLockIndex < 0
		|| (Number.isFinite(numericRecordingIndex) && numericRecordingIndex >= 0)
	) {
		return null;
	}

	const numericPreviewIndex = Number(previewIndex);
	if (!Number.isFinite(numericPreviewIndex)) return -1;
	return Math.max(-1, Math.min(numericLockIndex, numericPreviewIndex));
};
const countSyncCreatorRangeChars = (ranges) => (Array.isArray(ranges) ? ranges : []).reduce((sum, range) => {
	const start = Number(range?.start);
	const end = Number(range?.end);
	return Number.isInteger(start) && Number.isInteger(end) && end >= start ? sum + end - start + 1 : sum;
}, 0);
const isFiniteSyncCreatorTime = (value) => typeof value === 'number' && Number.isFinite(value);
const roundSyncCreatorTime = (value) => Math.round(value * 1000) / 1000;
const normalizeSyncCreatorGranularity = (value) => (
	SYNC_CREATOR_GRANULARITIES.has(String(value || '').trim().toLowerCase())
		? String(value).trim().toLowerCase()
		: SYNC_CREATOR_DEFAULT_GRANULARITY
);
const getSyncCreatorWordRanges = (chars, locale = undefined) => {
	const sourceChars = Array.isArray(chars) ? chars : [];
	if (sourceChars.length === 0) return [];
	const text = sourceChars.join('');
	const codeUnitOffsets = [0];
	let codeUnitOffset = 0;
	for (const char of sourceChars) {
		codeUnitOffset += String(char).length;
		codeUnitOffsets.push(codeUnitOffset);
	}
	const codeUnitToCharIndex = (offset) => {
		let low = 0;
		let high = codeUnitOffsets.length - 1;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			if (codeUnitOffsets[middle] <= offset) low = middle;
			else high = middle - 1;
		}
		return Math.max(0, Math.min(sourceChars.length - 1, low));
	};

	let wordStarts = [];
	try {
		if (window.LyricsWordSegmenter?.segmentRanges) {
			wordStarts = window.LyricsWordSegmenter.segmentRanges(text, locale || 'auto')
				.map(segment => codeUnitToCharIndex(Number(segment.start) || 0));
		} else if (typeof Intl?.Segmenter === 'function') {
			const segmenter = new Intl.Segmenter(locale || undefined, { granularity: 'word' });
			wordStarts = Array.from(segmenter.segment(text))
				.filter(segment => segment?.isWordLike)
				.map(segment => codeUnitToCharIndex(Number(segment.index) || 0));
		}
	} catch (error) {
		wordStarts = [];
	}

	if (wordStarts.length === 0) {
		for (let index = 0; index < sourceChars.length; index++) {
			if (!/[\p{L}\p{N}]/u.test(sourceChars[index] || '')) continue;
			if (index === 0 || !/[\p{L}\p{N}'’]/u.test(sourceChars[index - 1] || '')) {
				wordStarts.push(index);
			}
		}
	}

	wordStarts = [...new Set(wordStarts)].sort((left, right) => left - right);
	if (wordStarts.length === 0) return [{ start: 0, end: sourceChars.length - 1 }];
	return wordStarts.map((start, index) => ({
		start: index === 0 ? 0 : start,
		end: index + 1 < wordStarts.length ? wordStarts[index + 1] - 1 : sourceChars.length - 1
	}));
};
const getSyncCreatorGranularityRanges = (chars, granularity, locale = undefined) => {
	const sourceChars = Array.isArray(chars) ? chars : [];
	if (sourceChars.length === 0) return [];
	const normalizedGranularity = normalizeSyncCreatorGranularity(granularity);
	if (normalizedGranularity === 'line') return [{ start: 0, end: sourceChars.length - 1 }];
	if (normalizedGranularity === 'word') return getSyncCreatorWordRanges(sourceChars, locale);
	return sourceChars.map((_, index) => ({ start: index, end: index }));
};
const collapseSyncCreatorTimesByGranularity = (rawChars, sourceChars, granularity, locale = undefined) => {
	const times = Array.isArray(rawChars) ? [...rawChars] : [];
	const normalizedGranularity = normalizeSyncCreatorGranularity(granularity);
	if (normalizedGranularity === 'character' || times.length === 0) return times;
	const ranges = getSyncCreatorGranularityRanges(sourceChars, normalizedGranularity, locale);
	let lastKnownTime = times.find(isFiniteSyncCreatorTime) ?? 0;
	for (const range of ranges) {
		const rangeTime = times
			.slice(range.start, range.end + 1)
			.find(isFiniteSyncCreatorTime);
		if (isFiniteSyncCreatorTime(rangeTime)) lastKnownTime = rangeTime;
		for (let index = range.start; index <= range.end && index < times.length; index++) {
			times[index] = lastKnownTime;
		}
	}
	return times;
};
const decodeSyncCreatorCompactTiming = (target, expectedLength) => {
	if (!target || typeof target !== 'object') return target;
	if (Array.isArray(target.chars)) return { ...target, granularity: normalizeSyncCreatorGranularity(target.granularity) };
	const granularity = normalizeSyncCreatorGranularity(target.granularity);
	const length = Math.max(0, Number(expectedLength) || 0);
	if (length === 0) return { ...target, granularity };
	let chars = null;
	if (granularity === 'line' && isFiniteSyncCreatorTime(target.timing)) {
		chars = new Array(length).fill(roundSyncCreatorTime(target.timing));
	} else if (granularity === 'word' && Array.isArray(target.timing)) {
		chars = new Array(length).fill(null);
		let start = 0;
		for (const mark of target.timing) {
			if (!Array.isArray(mark) || mark.length !== 2) return target;
			const end = Number(mark[0]);
			const time = Number(mark[1]);
			if (!Number.isInteger(end) || end < start || end >= length || !isFiniteSyncCreatorTime(time)) return target;
			for (let index = start; index <= end; index++) chars[index] = roundSyncCreatorTime(time);
			start = end + 1;
		}
		if (start !== length) return target;
	}
	if (!chars) return { ...target, granularity };
	const decoded = { ...target, granularity, chars };
	delete decoded.timing;
	return decoded;
};
const encodeSyncCreatorCompactTiming = (target, sourceChars, locale = undefined) => {
	if (!target || typeof target !== 'object' || !Array.isArray(target.chars)) return target;
	const granularity = normalizeSyncCreatorGranularity(target.granularity);
	const normalizedChars = collapseSyncCreatorTimesByGranularity(
		target.chars,
		sourceChars,
		granularity,
		locale
	).map(roundSyncCreatorTime);
	if (granularity === 'character') {
		const encoded = { ...target, granularity, chars: normalizedChars };
		delete encoded.timing;
		return encoded;
	}
	const encoded = { ...target, granularity };
	delete encoded.chars;
	if (granularity === 'line') {
		encoded.timing = normalizedChars.find(isFiniteSyncCreatorTime) ?? 0;
		return encoded;
	}
	encoded.timing = getSyncCreatorWordRanges(sourceChars, locale).map(range => ([
		range.end,
		normalizedChars[range.start] ?? normalizedChars.find(isFiniteSyncCreatorTime) ?? 0
	]));
	return encoded;
};
const normalizeSyncCreatorTimeSequence = (rawChars, previousLineEndTime = -1, granularity = 'character') => {
	const sourceChars = Array.isArray(rawChars) ? rawChars : [];
	const normalizedChars = [];
	const preserveEqualTimestamps = normalizeSyncCreatorGranularity(granularity) !== 'character';
	let minimumAllowedTime = isFiniteSyncCreatorTime(previousLineEndTime) && previousLineEndTime >= 0
		? previousLineEndTime
		: 0;

	for (let index = 0; index < sourceChars.length; index++) {
		const rawTime = isFiniteSyncCreatorTime(sourceChars[index])
			? sourceChars[index]
			: minimumAllowedTime;
		const mayReusePreviousTime = preserveEqualTimestamps
			&& index > 0
			&& rawTime <= minimumAllowedTime + (SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC / 2);
		const minimumForChar = index === 0 || mayReusePreviousTime
			? minimumAllowedTime
			: minimumAllowedTime + SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC;
		const normalizedTime = roundSyncCreatorTime(Math.max(minimumForChar, rawTime));
		normalizedChars.push(normalizedTime);
		minimumAllowedTime = normalizedTime;
	}

	return normalizedChars;
};
const repairSyncCreatorLineCharsFromParallel = (line) => {
	const lineStart = Number(line?.start);
	const lineEnd = Number(line?.end);
	if (!Number.isInteger(lineStart) || !Number.isInteger(lineEnd) || lineEnd < lineStart) return line;

	const expectedLength = lineEnd - lineStart + 1;
	if (
		Array.isArray(line?.chars)
		&& line.chars.length === expectedLength
		&& line.chars.every(isFiniteSyncCreatorTime)
	) {
		return line;
	}

	const parts = line?.parallel?.parts;
	if (!Array.isArray(parts) || parts.length === 0) return line;

	const rebuiltChars = new Array(expectedLength).fill(null);
	for (const part of parts) {
		const expectedPartLength = countSyncCreatorRangeChars(part?.ranges);
		if (
			expectedPartLength <= 0
			|| !Array.isArray(part?.chars)
			|| part.chars.length !== expectedPartLength
			|| !part.chars.every(isFiniteSyncCreatorTime)
		) {
			return line;
		}

		let partCharIndex = 0;
		for (const range of part.ranges) {
			const rangeStart = Number(range?.start);
			const rangeEnd = Number(range?.end);
			if (
				!Number.isInteger(rangeStart)
				|| !Number.isInteger(rangeEnd)
				|| rangeStart < lineStart
				|| rangeEnd > lineEnd
				|| rangeEnd < rangeStart
			) {
				return line;
			}
			for (let absoluteIndex = rangeStart; absoluteIndex <= rangeEnd; absoluteIndex++) {
				rebuiltChars[absoluteIndex - lineStart] = part.chars[partCharIndex++];
			}
		}
	}

	const hiddenIndexes = new Set();
	const hiddenRanges = [
		...(Array.isArray(line?.hiddenRanges) ? line.hiddenRanges : []),
		...(Array.isArray(line?.parallel?.hiddenRanges) ? line.parallel.hiddenRanges : [])
	];
	for (const range of hiddenRanges) {
		const rangeStart = Math.max(lineStart, Number(range?.start));
		const rangeEnd = Math.min(lineEnd, Number(range?.end));
		if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeEnd < rangeStart) continue;
		for (let absoluteIndex = rangeStart; absoluteIndex <= rangeEnd; absoluteIndex++) {
			hiddenIndexes.add(absoluteIndex - lineStart);
		}
	}

	for (let index = 0; index < rebuiltChars.length; index++) {
		if (isFiniteSyncCreatorTime(rebuiltChars[index])) continue;
		if (!hiddenIndexes.has(index)) return line;
		const previous = index > 0 && isFiniteSyncCreatorTime(rebuiltChars[index - 1])
			? rebuiltChars[index - 1]
			: null;
		const next = rebuiltChars.slice(index + 1).find(isFiniteSyncCreatorTime);
		const fallback = previous ?? next;
		if (!isFiniteSyncCreatorTime(fallback)) return line;
		rebuiltChars[index] = fallback;
	}

	return {
		...line,
		chars: normalizeSyncCreatorTimeSequence(rebuiltChars, -1, line?.granularity)
	};
};
const getSyncCreatorRangesValidationError = (ranges, lineStart, lineEnd, label) => {
	if (!Array.isArray(ranges) || ranges.length === 0) {
		return `${label}: ranges must be a non-empty array`;
	}

	let previousEnd = lineStart - 1;
	for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
		const range = ranges[rangeIndex];
		const start = Number(range?.start);
		const end = Number(range?.end);
		if (!Number.isInteger(start) || !Number.isInteger(end)) {
			return `${label}: range ${rangeIndex + 1} start/end must be integers`;
		}
		if (start < lineStart || end > lineEnd || end < start) {
			return `${label}: range ${rangeIndex + 1} is outside the parent line`;
		}
		if (start <= previousEnd) {
			return `${label}: range ${rangeIndex + 1} overlaps or is out of order`;
		}
		previousEnd = end;
	}

	return null;
};
const getSyncCreatorSyncDataValidationError = (data) => {
	if (!data || !Array.isArray(data.lines)) return 'Invalid sync data format';

	for (let lineIndex = 0; lineIndex < data.lines.length; lineIndex++) {
		const line = data.lines[lineIndex];
		const start = Number(line?.start);
		const end = Number(line?.end);
		if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
			return `Line ${lineIndex + 1}: invalid character range`;
		}

		const expectedLength = end - start + 1;
		if (!Array.isArray(line?.chars) || line.chars.length !== expectedLength) {
			return `Line ${lineIndex + 1}: expected ${expectedLength} char timings, received ${Array.isArray(line?.chars) ? line.chars.length : 0}`;
		}
		const invalidLineCharIndex = line.chars.findIndex(value => !isFiniteSyncCreatorTime(value) || value < 0);
		if (invalidLineCharIndex >= 0) {
			return `Line ${lineIndex + 1}, char ${invalidLineCharIndex}: invalid time value`;
		}
		const backwardLineCharIndex = line.chars.findIndex((value, index) => index > 0 && value < line.chars[index - 1]);
		if (backwardLineCharIndex >= 0) {
			return `Line ${lineIndex + 1}, char ${backwardLineCharIndex}: time goes backwards`;
		}
		if (line.granularity !== undefined && normalizeSyncCreatorGranularity(line.granularity) !== line.granularity) {
			return `Line ${lineIndex + 1}: invalid sync granularity`;
		}

		if (line.hiddenRanges !== undefined) {
			const hiddenError = getSyncCreatorRangesValidationError(
				line.hiddenRanges,
				start,
				end,
				`Line ${lineIndex + 1}, hiddenRanges`
			);
			if (hiddenError) return hiddenError;
		}

		if (line.styleRanges !== undefined) {
			const styleError = getSyncCreatorRangesValidationError(
				line.styleRanges,
				start,
				end,
				`Line ${lineIndex + 1}, styleRanges`
			);
			if (styleError) return styleError;
			for (let styleIndex = 0; styleIndex < line.styleRanges.length; styleIndex++) {
				const styleRange = line.styleRanges[styleIndex];
				const styleSpeakerMeta = getSyncCreatorStyleRangeSpeakerMeta(styleRange);
				if (!normalizeSyncCreatorKind(styleRange?.kind) && !styleSpeakerMeta) {
					return `Line ${lineIndex + 1}, style range ${styleIndex + 1}: effect or speaker color is required`;
				}
				if (styleRange?.kind !== undefined && !normalizeSyncCreatorKind(styleRange.kind)) {
					return `Line ${lineIndex + 1}, style range ${styleIndex + 1}: invalid text effect`;
				}
				if (styleRange?.speaker !== undefined && !styleSpeakerMeta) {
					return `Line ${lineIndex + 1}, style range ${styleIndex + 1}: invalid speaker color`;
				}
			}
		}

		const parts = Array.isArray(line?.parallel?.parts) ? line.parallel.parts : [];
		for (let partIndex = 0; partIndex < parts.length; partIndex++) {
			const part = parts[partIndex];
			const partLabel = String(part?.id || partIndex + 1);
			const rangeError = getSyncCreatorRangesValidationError(
				part?.ranges,
				start,
				end,
				`Line ${lineIndex + 1}, parallel part ${partLabel}`
			);
			if (rangeError) return rangeError;
			if (!Array.isArray(part?.chars)) continue;
			const expectedPartLength = countSyncCreatorRangeChars(part.ranges);
			if (part.chars.length !== expectedPartLength) {
				return `Line ${lineIndex + 1}, parallel part ${partLabel}: expected ${expectedPartLength} char timings, received ${part.chars.length}`;
			}
			const invalidPartCharIndex = part.chars.findIndex(value => !isFiniteSyncCreatorTime(value) || value < 0);
			if (invalidPartCharIndex >= 0) {
				return `Line ${lineIndex + 1}, parallel part ${partLabel}, char ${invalidPartCharIndex}: invalid time value`;
			}
			const backwardPartCharIndex = part.chars.findIndex((value, index) => index > 0 && value < part.chars[index - 1]);
			if (backwardPartCharIndex >= 0) {
				return `Line ${lineIndex + 1}, parallel part ${partLabel}, char ${backwardPartCharIndex}: time goes backwards`;
			}
			if (part.granularity !== undefined && normalizeSyncCreatorGranularity(part.granularity) !== part.granularity) {
				return `Line ${lineIndex + 1}, parallel part ${partLabel}: invalid sync granularity`;
			}
		}

		if (line?.parallel?.hiddenRanges !== undefined) {
			const hiddenError = getSyncCreatorRangesValidationError(
				line.parallel.hiddenRanges,
				start,
				end,
				`Line ${lineIndex + 1}, hiddenRanges`
			);
			if (hiddenError) return hiddenError;
		}
	}

	return null;
};
const assertValidSyncCreatorSyncData = (data) => {
	const validationError = getSyncCreatorSyncDataValidationError(data);
	if (validationError) throw new Error(`Invalid sync data: ${validationError}`);
	return data;
};
const areSyncCreatorParallelRangesEqual = (leftRanges, rightRanges) => (
	Array.isArray(leftRanges)
	&& Array.isArray(rightRanges)
	&& leftRanges.length === rightRanges.length
	&& leftRanges.every((range, index) => (
		Number(range?.start) === Number(rightRanges[index]?.start)
		&& Number(range?.end) === Number(rightRanges[index]?.end)
	))
);
const hasReusableSyncCreatorParallelChars = (targetPart, sourcePart) => (
	Array.isArray(sourcePart?.chars)
	&& areSyncCreatorParallelRangesEqual(targetPart?.ranges, sourcePart?.ranges)
	&& sourcePart.chars.length === countSyncCreatorRangeChars(targetPart?.ranges)
);
const countSyncCreatorParallelRangeOverlap = (leftRanges, rightRanges) => {
	let overlap = 0;
	for (const left of Array.isArray(leftRanges) ? leftRanges : []) {
		const leftStart = Number(left?.start);
		const leftEnd = Number(left?.end);
		if (!Number.isInteger(leftStart) || !Number.isInteger(leftEnd) || leftEnd < leftStart) continue;
		for (const right of Array.isArray(rightRanges) ? rightRanges : []) {
			const rightStart = Number(right?.start);
			const rightEnd = Number(right?.end);
			if (!Number.isInteger(rightStart) || !Number.isInteger(rightEnd) || rightEnd < rightStart) continue;
			overlap += Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart) + 1);
		}
	}
	return overlap;
};
const getSyncCreatorPersistedParallelSplitPoints = (parallel, lineStart, lineLength) => {
	const numericLineStart = Number(lineStart);
	const numericLineLength = Number(lineLength);
	if (!Number.isInteger(numericLineStart) || !Number.isInteger(numericLineLength) || numericLineLength < 2) return [];
	const parts = Array.isArray(parallel?.parts) ? parallel.parts : [];
	if (parts.length < 2 || parts.some(part => !Array.isArray(part?.ranges) || part.ranges.length !== 1)) return [];
	const orderedRanges = parts
		.map(part => {
			const start = Number(part.ranges[0]?.start);
			const end = Number(part.ranges[0]?.end);
			return Number.isInteger(start) && Number.isInteger(end) && end >= start
				? { start, end }
				: null;
		})
		.filter(Boolean)
		.sort((left, right) => left.start - right.start || left.end - right.end);
	if (orderedRanges.length !== parts.length) return [];
	for (let index = 1; index < orderedRanges.length; index++) {
		if (orderedRanges[index].start <= orderedRanges[index - 1].end) return [];
	}
	return [...new Set(orderedRanges.slice(1)
		.map(range => range.start - numericLineStart)
		.filter(point => point > 0 && point < numericLineLength))]
		.sort((left, right) => left - right);
};
const resolveSyncCreatorManualSplitState = (
	drafts,
	lineStart,
	lineLength,
	existingParallel,
	autoSplitPoints = []
) => {
	const sourceDrafts = drafts && typeof drafts === 'object' ? drafts : {};
	const hasManualDraft = Object.prototype.hasOwnProperty.call(sourceDrafts, lineStart);
	const manualSource = hasManualDraft
		? sourceDrafts[lineStart]
		: getSyncCreatorPersistedParallelSplitPoints(existingParallel, lineStart, lineLength);
	const normalizePoints = (values) => [...new Set((Array.isArray(values) ? values : [])
		.map(value => Number(value))
		.filter(value => Number.isInteger(value) && value > 0 && value < lineLength))]
		.sort((left, right) => left - right);
	const manualSplitPoints = normalizePoints(manualSource);
	return {
		hasManualDraft,
		manualSplitPoints,
		splitPoints: normalizePoints([...autoSplitPoints, ...manualSplitPoints])
	};
};
const findSyncCreatorParallelSourcePart = (targetPart, sourceParts) => {
	const candidates = Array.isArray(sourceParts) ? sourceParts : [];
	const exact = candidates.find(part => (
		part?.id === targetPart?.id
		&& areSyncCreatorParallelRangesEqual(targetPart?.ranges, part?.ranges)
	));
	if (exact) return exact;

	let bestPart = null;
	let bestOverlap = 0;
	for (const part of candidates) {
		const overlap = countSyncCreatorParallelRangeOverlap(targetPart?.ranges, part?.ranges);
		if (
			overlap > bestOverlap
			|| (overlap > 0 && overlap === bestOverlap && part?.id === targetPart?.id)
		) {
			bestPart = part;
			bestOverlap = overlap;
		}
	}
	return bestPart;
};
const buildSyncCreatorExistingTimingIndex = (line) => {
	const timingByAbsoluteIndex = new Map();
	const parts = Array.isArray(line?.parallel?.parts) ? line.parallel.parts : [];
	for (const part of parts) {
		const expectedLength = countSyncCreatorRangeChars(part?.ranges);
		if (!expectedLength || !Array.isArray(part?.chars) || part.chars.length !== expectedLength) continue;
		let charIndex = 0;
		for (const range of part.ranges) {
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) break;
			for (let absoluteIndex = start; absoluteIndex <= end; absoluteIndex++) {
				const time = part.chars[charIndex++];
				if (isFiniteSyncCreatorTime(time) && !timingByAbsoluteIndex.has(absoluteIndex)) {
					timingByAbsoluteIndex.set(absoluteIndex, time);
				}
			}
		}
	}

	const lineStart = Number(line?.start);
	const lineEnd = Number(line?.end);
	const expectedLineLength = Number.isInteger(lineStart) && Number.isInteger(lineEnd) && lineEnd >= lineStart
		? lineEnd - lineStart + 1
		: 0;
	if (expectedLineLength && Array.isArray(line?.chars) && line.chars.length === expectedLineLength) {
		line.chars.forEach((time, index) => {
			const absoluteIndex = lineStart + index;
			if (isFiniteSyncCreatorTime(time) && !timingByAbsoluteIndex.has(absoluteIndex)) {
				timingByAbsoluteIndex.set(absoluteIndex, time);
			}
		});
	}
	return timingByAbsoluteIndex;
};
const inheritSyncCreatorParallelPartChars = (targetPart, existingLine) => {
	const expectedLength = countSyncCreatorRangeChars(targetPart?.ranges);
	if (!expectedLength) return undefined;
	const timingByAbsoluteIndex = buildSyncCreatorExistingTimingIndex(existingLine);
	const inheritedChars = [];
	for (const range of Array.isArray(targetPart?.ranges) ? targetPart.ranges : []) {
		const start = Number(range?.start);
		const end = Number(range?.end);
		if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return undefined;
		for (let absoluteIndex = start; absoluteIndex <= end; absoluteIndex++) {
			if (!timingByAbsoluteIndex.has(absoluteIndex)) return undefined;
			inheritedChars.push(timingByAbsoluteIndex.get(absoluteIndex));
		}
	}
	return inheritedChars.length === expectedLength ? inheritedChars : undefined;
};
const resolveSyncCreatorParallelTemplateParts = (templateParts, existingLine) => {
	const existingParts = Array.isArray(existingLine?.parallel?.parts) ? existingLine.parallel.parts : [];
	return (Array.isArray(templateParts) ? templateParts : []).map(part => ({
		part,
		sourcePart: findSyncCreatorParallelSourcePart(part, existingParts),
		chars: inheritSyncCreatorParallelPartChars(part, existingLine)
	}));
};
const hasExplicitSyncCreatorGroupedBackground = (parallel) => (
	Array.isArray(parallel?.parts)
	&& parallel.parts.some((part) => {
		if (part?.role !== 'background' || !Array.isArray(part.ranges) || part.ranges.length < 2) return false;
		if (!Array.isArray(part.join) || part.join.length !== part.ranges.length - 1) return false;
		const hasValidRanges = part.ranges.every((range, index) => {
			const start = Number(range?.start);
			const end = Number(range?.end);
			const previousEnd = index > 0 ? Number(part.ranges[index - 1]?.end) : -1;
			return Number.isInteger(start)
				&& Number.isInteger(end)
				&& end >= start
				&& (index === 0 || start > previousEnd);
		});
		const hasValidJoins = part.join.every((joinMode) => {
			const mode = Number(joinMode);
			return Number.isInteger(mode) && mode >= 0 && mode <= 2;
		});
		return hasValidRanges && hasValidJoins && part.join.some(joinMode => Number(joinMode) === 2);
	})
);
const selectSyncCreatorParallelTemplate = (existingParallel, textTemplate, options = {}) => {
	const hasManualDraft = options.hasManualDraft === true;
	if (!hasManualDraft && hasExplicitSyncCreatorGroupedBackground(existingParallel)) {
		return existingParallel;
	}

	if (!hasManualDraft && Array.isArray(existingParallel?.parts) && existingParallel.parts.length > 1) {
		if (textTemplate && textTemplate.parts.length > existingParallel.parts.length) {
			return textTemplate;
		}
		return existingParallel;
	}

	return textTemplate || (options.isMergedWithNext ? existingParallel : null);
};
const getSyncCreatorProgressGradient = (
	direction,
	percent,
	color = SYNC_CREATOR_PROGRESS_COLOR,
	inactiveColor = 'var(--spice-subtext)'
) => (
	`linear-gradient(${direction === 'rtl' ? 'to left' : 'to right'}, ${color} 0%, ${color} ${percent}%, ${inactiveColor} ${percent}%, ${inactiveColor} 100%)`
);
const normalizeSyncCreatorIsrc = (value) => {
	if (typeof value !== 'string') return '';
	const normalized = value.trim().replace(/[\s-]/g, '').toUpperCase();
	return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : '';
};
const SYNC_CREATOR_KIND_OPTIONS = [
	['vocal', 'syncCreator.kindVocal'],
	['effect', 'syncCreator.kindEffect'],
	['adlib', 'syncCreator.kindAdlib'],
	['pulse', 'syncCreator.kindPulse'],
	['wave', 'syncCreator.kindWave'],
	['sparkle', 'syncCreator.kindSparkle'],
	['echo', 'syncCreator.kindEcho'],
	['whisper', 'syncCreator.kindWhisper'],
	['bounce', 'syncCreator.kindBounce'],
	['sway', 'syncCreator.kindSway'],
	['glow', 'syncCreator.kindGlow'],
	['glitch', 'syncCreator.kindGlitch'],
	['flicker', 'syncCreator.kindFlicker'],
	['float', 'syncCreator.kindFloat'],
	['blur', 'syncCreator.kindBlur'],
	['pop', 'syncCreator.kindPop']
];
const SYNC_CREATOR_KIND_LABELS = new Map(SYNC_CREATOR_KIND_OPTIONS);
const SYNC_CREATOR_PARALLEL_HINT_REGEX = /[()（）\/|／｜]/u;
const SYNC_CREATOR_LRC_METADATA_LINE_REGEX = /^\s*\[(?:ar|al|ti|au|length|by|offset|re|ve):[^\]]*\]\s*$/i;
const SYNC_CREATOR_HANGUL_CODA_BY_JAMO = new Map([
	['ㄱ', 1], ['ㄲ', 2], ['ㄳ', 3], ['ㄴ', 4], ['ㄵ', 5], ['ㄶ', 6], ['ㄷ', 7], ['ㄹ', 8],
	['ㄺ', 9], ['ㄻ', 10], ['ㄼ', 11], ['ㄽ', 12], ['ㄾ', 13], ['ㄿ', 14], ['ㅀ', 15], ['ㅁ', 16],
	['ㅂ', 17], ['ㅄ', 18], ['ㅅ', 19], ['ㅆ', 20], ['ㅇ', 21], ['ㅈ', 22], ['ㅊ', 23], ['ㅋ', 24],
	['ㅌ', 25], ['ㅍ', 26], ['ㅎ', 27]
]);

const mergeSyncCreatorPronunciationText = (base, addition) => {
	const baseText = String(base || '');
	let additionText = String(addition || '');
	if (!baseText || !additionText) return baseText + additionText;

	const firstAdditionChar = Array.from(additionText)[0] || '';
	const codaIndex = SYNC_CREATOR_HANGUL_CODA_BY_JAMO.get(firstAdditionChar);
	if (!codaIndex) {
		return baseText + additionText;
	}

	const baseChars = Array.from(baseText);
	const lastChar = baseChars[baseChars.length - 1] || '';
	const lastCode = lastChar.charCodeAt(0);
	const hangulOffset = lastCode - 0xac00;
	if (hangulOffset < 0 || hangulOffset >= 11172 || hangulOffset % 28 !== 0) {
		return baseText + additionText;
	}

	baseChars[baseChars.length - 1] = String.fromCharCode(lastCode + codaIndex);
	additionText = additionText.slice(firstAdditionChar.length);
	return baseChars.join('') + additionText;
};

const getSyncCreatorTextDirection = (text) => {
	const normalizedText = typeof text === 'string' ? text : '';
	let rtlCount = 0;
	let ltrCount = 0;

	for (const char of Array.from(normalizedText)) {
		if (SYNC_CREATOR_RTL_STRONG_CHAR_REGEX.test(char)) {
			rtlCount++;
			continue;
		}
		if (SYNC_CREATOR_LTR_STRONG_CHAR_REGEX.test(char)) {
			ltrCount++;
		}
	}

	return rtlCount > ltrCount ? 'rtl' : 'ltr';
};

const getSyncCreatorLineCharCountsFromText = (text) => (
	String(text || '')
		.normalize('NFC')
		.split('\n')
		.map(line => line.trim().normalize('NFC'))
		.filter(Boolean)
		.map(line => Array.from(line).length)
);

const hasExactSyncCreatorLineShape = (expectedCounts, actualCounts) => (
	Array.isArray(expectedCounts)
	&& Array.isArray(actualCounts)
	&& expectedCounts.length > 0
	&& expectedCounts.length === actualCounts.length
	&& expectedCounts.every((count, index) => Number(count) === Number(actualCounts[index]))
);

const findSyncCreatorSourceLinePrefix = (expectedCounts, actualCounts) => {
	if (hasExactSyncCreatorLineShape(expectedCounts, actualCounts)) return 0;
	if (!Array.isArray(expectedCounts) || !Array.isArray(actualCounts)) return -1;
	if (actualCounts.length === 0 || expectedCounts.length <= actualCounts.length) return -1;

	const maxPrefix = expectedCounts.length - actualCounts.length;
	for (let prefix = 1; prefix <= maxPrefix; prefix++) {
		const matches = actualCounts.every((count, index) => (
			Number(count) === Number(expectedCounts[prefix + index])
		));
		if (matches) return prefix;
	}

	return -1;
};

const getSyncCreatorLeadingCharOffset = (lineCounts, prefixLength) => (
	(Array.isArray(lineCounts) ? lineCounts.slice(0, prefixLength) : [])
		.reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0)
);

const getSyncCreatorLyricsFingerprintFromText = (text) => {
	const comparableText = String(text || '')
		.normalize('NFC')
		.split('\n')
		.map(line => line.trim().normalize('NFC'))
		.filter(Boolean)
		.join('\n');
	let hash = 2166136261;
	for (const char of Array.from(comparableText)) {
		hash ^= char.codePointAt(0) || 0;
		hash = Math.imul(hash, 16777619);
	}
	return `lrclib-${(hash >>> 0).toString(36)}-${Array.from(comparableText).length.toString(36)}`;
};

const shiftSyncCreatorRange = (range, charOffset) => {
	const start = Number(range?.start);
	const end = Number(range?.end);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	if (end < charOffset) return null;
	return {
		...range,
		start: Math.max(0, start - charOffset),
		end: Math.max(0, end - charOffset)
	};
};

const shiftSyncCreatorRanges = (ranges, charOffset) => (
	(Array.isArray(ranges) ? ranges : [])
		.map(range => shiftSyncCreatorRange(range, charOffset))
		.filter(Boolean)
);

const shiftSyncCreatorLineIndexes = (lines, charOffset) => {
	if (!charOffset) return lines;

	return (Array.isArray(lines) ? lines : [])
		.filter(line => Number(line?.end) >= charOffset)
		.map(line => {
			const shifted = {
				...line,
				start: Math.max(0, Number(line.start) - charOffset),
				end: Math.max(0, Number(line.end) - charOffset)
			};
			if (Array.isArray(line.styleRanges)) {
				shifted.styleRanges = shiftSyncCreatorRanges(line.styleRanges, charOffset);
			}

			if (line?.parallel) {
				shifted.parallel = {
					...line.parallel,
					hiddenRanges: shiftSyncCreatorRanges(line.parallel.hiddenRanges, charOffset),
					parts: (Array.isArray(line.parallel.parts) ? line.parallel.parts : [])
						.map(part => ({
							...part,
							ranges: shiftSyncCreatorRanges(part.ranges, charOffset)
						}))
						.filter(part => part.ranges.length > 0)
				};
			}

			return shifted;
		});
};

const normalizeLoadedSyncCreatorBodyForLyrics = (syncBody, lyricsText) => {
	if (!syncBody || !Array.isArray(syncBody.lines)) return syncBody;

	const sourceLineCounts = Array.isArray(syncBody?.source?.lineCharCounts)
		? syncBody.source.lineCharCounts
		: null;
	if (!sourceLineCounts) return syncBody;
	const currentLineCounts = getSyncCreatorLineCharCountsFromText(lyricsText);
	const prefix = findSyncCreatorSourceLinePrefix(sourceLineCounts, currentLineCounts);
	if (prefix < 0) return null;
	if (prefix === 0 && syncBody?.source?.lyricsFingerprint) {
		const currentFingerprint = getSyncCreatorLyricsFingerprintFromText(lyricsText);
		if (syncBody.source.lyricsFingerprint !== currentFingerprint) return null;
	}
	if (prefix <= 0) return syncBody;

	const charOffset = getSyncCreatorLeadingCharOffset(sourceLineCounts, prefix);
	if (!charOffset) return syncBody;

	return {
		...syncBody,
		lines: shiftSyncCreatorLineIndexes(syncBody.lines, charOffset)
	};
};

const normalizeSyncCreatorSpeakerToken = (value) => {
	const raw = String(value || '').trim();
	if (!raw) return '';
	return raw
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.toUpperCase();
};

const normalizeSyncCreatorSpeaker = (value) => {
	const normalized = normalizeSyncCreatorSpeakerToken(value);
	if (/^NORMAL(?:\s+1)?$/.test(normalized)) return 'NORMAL';
	if (normalized === 'CUSTOM' || SYNC_CREATOR_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalized]) return 'CUSTOM';
	return SYNC_CREATOR_SPEAKER_OPTIONS.includes(normalized) ? normalized : '';
};

const isSyncCreatorCustomSpeaker = (value) => (
	normalizeSyncCreatorSpeaker(value) === 'CUSTOM'
);

const normalizeSyncCreatorSpeakerFallback = (value) => {
	const normalized = normalizeSyncCreatorSpeakerToken(value);
	return SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS.includes(normalized) ? normalized : '';
};

const sanitizeSyncCreatorSpeakerFallback = (speaker, fallback, useDefault = false, sourceSpeaker = speaker) => {
	if (!isSyncCreatorCustomSpeaker(speaker)) return '';
	return normalizeSyncCreatorSpeakerFallback(fallback)
		|| SYNC_CREATOR_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalizeSyncCreatorSpeakerToken(sourceSpeaker)]
		|| (useDefault ? SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK : '');
};

const normalizeSyncCreatorSpeakerColor = (value) => {
	const rawColor = String(value || '').trim();
	const color = rawColor && !rawColor.startsWith('#') ? `#${rawColor}` : rawColor;
	const helperColor = window.ivLyricsSpeakerColors?.normalizeColor?.(color);
	if (helperColor) return helperColor;
	if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
	if (/^#[0-9a-f]{3}$/i.test(color)) {
		return `#${color.slice(1).split('').map(char => char + char).join('')}`.toLowerCase();
	}
	return '';
};

const getSyncCreatorCustomSpeakerDefaultColor = (value, fallback) => {
	const fallbackSpeaker = sanitizeSyncCreatorSpeakerFallback(value, fallback, true);
	return fallbackSpeaker
		? (SYNC_CREATOR_SPEAKER_TEXT_COLORS[fallbackSpeaker]
			|| window.ivLyricsSpeakerColors?.getTextColor?.(fallbackSpeaker)
			|| '#ffffff')
		: '';
};

const sanitizeSyncCreatorSpeakerColor = (speaker, color, useDefault = false, fallback = '') => {
	if (!isSyncCreatorCustomSpeaker(speaker)) return '';
	return normalizeSyncCreatorSpeakerColor(color)
		|| (useDefault ? getSyncCreatorCustomSpeakerDefaultColor(speaker, fallback) : '');
};

const resolveSyncCreatorSpeakerTransition = ({
	currentSpeaker,
	currentColor = '',
	currentFallback = '',
	nextSpeaker,
	remembered = {}
}) => {
	const speaker = normalizeSyncCreatorSpeaker(nextSpeaker);
	if (!speaker) return null;

	let rememberedColor = normalizeSyncCreatorSpeakerColor(remembered.color);
	let rememberedFallback = normalizeSyncCreatorSpeakerFallback(remembered.fallback);
	if (isSyncCreatorCustomSpeaker(currentSpeaker)) {
		rememberedColor = normalizeSyncCreatorSpeakerColor(currentColor) || rememberedColor;
		rememberedFallback = normalizeSyncCreatorSpeakerFallback(currentFallback) || rememberedFallback;
	}

	if (!isSyncCreatorCustomSpeaker(speaker)) {
		return {
			speaker,
			color: '',
			fallback: '',
			remembered: {
				color: rememberedColor,
				fallback: rememberedFallback
			}
		};
	}

	const fallback = sanitizeSyncCreatorSpeakerFallback(
		speaker,
		rememberedFallback || currentFallback,
		true,
		nextSpeaker
	);
	const color = sanitizeSyncCreatorSpeakerColor(
		speaker,
		rememberedColor || currentColor,
		true,
		fallback
	);
	return {
		speaker,
		color,
		fallback,
		remembered: { color, fallback }
	};
};

const resolveSyncCreatorRememberedCustomSpeakerMeta = (remembered = {}, sticky = {}) => {
	const fallback = normalizeSyncCreatorSpeakerFallback(remembered.fallback)
		|| normalizeSyncCreatorSpeakerFallback(sticky.fallback)
		|| SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK;
	return {
		color: normalizeSyncCreatorSpeakerColor(remembered.color)
			|| normalizeSyncCreatorSpeakerColor(sticky.color)
			|| getSyncCreatorCustomSpeakerDefaultColor('CUSTOM', fallback),
		fallback
	};
};

const resolveSyncCreatorDraftSpeakerMeta = ({
	draft = {},
	source = {},
	inheritedSource = null,
	inheritSource = false
} = {}) => {
	const baseSource = inheritSource && inheritedSource ? inheritedSource : source;
	const hasSpeakerDraft = Object.prototype.hasOwnProperty.call(draft, 'speaker');
	const sourceSpeaker = hasSpeakerDraft ? draft.speaker : baseSource?.speaker;
	const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
	const hasColorDraft = Object.prototype.hasOwnProperty.call(draft, 'speaker-color');
	const hasFallbackDraft = Object.prototype.hasOwnProperty.call(draft, 'speaker-fallback');
	const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
		speaker,
		hasFallbackDraft ? draft['speaker-fallback'] : baseSource?.['speaker-fallback'],
		true,
		sourceSpeaker
	);
	return {
		speaker,
		'speaker-fallback': speakerFallback,
		'speaker-color': sanitizeSyncCreatorSpeakerColor(
			speaker,
			hasColorDraft ? draft['speaker-color'] : baseSource?.['speaker-color'],
			true,
			speakerFallback
		)
	};
};

const resolveSyncCreatorBulkSpeakerMeta = (value, color = '', fallback = '') => {
	const speaker = normalizeSyncCreatorSpeaker(value);
	if (!speaker) return null;
	const speakerFallback = sanitizeSyncCreatorSpeakerFallback(speaker, fallback, true, value);
	return {
		speaker,
		color: sanitizeSyncCreatorSpeakerColor(speaker, color, true, speakerFallback),
		fallback: speakerFallback
	};
};

const applySyncCreatorSpeakerMeta = (target, speakerMeta) => {
	if (!target || !speakerMeta?.speaker) return target;
	const next = { ...target, speaker: speakerMeta.speaker };
	if (isSyncCreatorCustomSpeaker(speakerMeta.speaker)) {
		next['speaker-color'] = speakerMeta.color;
		next['speaker-fallback'] = speakerMeta.fallback;
	} else {
		delete next['speaker-color'];
		delete next['speaker-fallback'];
	}
	return next;
};

const isSyncCreatorSpeakerMetaComplete = (value) => {
	const speaker = normalizeSyncCreatorSpeaker(value?.speaker);
	if (!speaker) return false;
	return !isSyncCreatorCustomSpeaker(speaker)
		|| (
			!!sanitizeSyncCreatorSpeakerFallback(speaker, value?.['speaker-fallback'], false, value?.speaker)
			&& !!sanitizeSyncCreatorSpeakerColor(speaker, value?.['speaker-color'])
		);
};

const getSyncCreatorSpeakerTextColor = (value, speakerColor = '', speakerFallback = '') => {
	const speaker = normalizeSyncCreatorSpeaker(value);
	if (!speaker) return 'var(--spice-text)';
	const fallbackSpeaker = isSyncCreatorCustomSpeaker(speaker)
		? sanitizeSyncCreatorSpeakerFallback(speaker, speakerFallback, true, value)
		: speaker;
	return sanitizeSyncCreatorSpeakerColor(speaker, speakerColor)
		|| window.ivLyricsSpeakerColors?.getTextColor?.(fallbackSpeaker)
		|| SYNC_CREATOR_SPEAKER_TEXT_COLORS[fallbackSpeaker]
		|| 'var(--spice-text)';
};

const getSyncCreatorHexColorWithAlpha = (color, alpha) => {
	const normalized = String(color || '').trim();
	const match = /^#([0-9a-f]{6})$/i.exec(normalized);
	if (!match) return '';

	const hex = match[1];
	const red = parseInt(hex.slice(0, 2), 16);
	const green = parseInt(hex.slice(2, 4), 16);
	const blue = parseInt(hex.slice(4, 6), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const isSyncCreatorDuetSpeaker = (value, fallback = '') => (
	String(isSyncCreatorCustomSpeaker(value) ? fallback : value).trim().toUpperCase().startsWith('DUET ')
);

const getSyncCreatorKindLabel = (value) => {
	const labelKey = SYNC_CREATOR_KIND_LABELS.get(value);
	return labelKey ? (I18n.t(labelKey) || value) : '';
};

const normalizeSyncCreatorKind = (value) => (
	SYNC_CREATOR_KIND_LABELS.has(value) ? value : ''
);

const getSyncCreatorStyleRangeSpeakerMeta = (range = {}) => {
	const sourceSpeaker = range?.speaker;
	const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker);
	if (!speaker) return null;
	const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
		speaker,
		range?.['speaker-fallback'],
		true,
		sourceSpeaker
	);
	const speakerColor = sanitizeSyncCreatorSpeakerColor(
		speaker,
		range?.['speaker-color'],
		true,
		speakerFallback
	);
	return {
		speaker,
		...(speakerColor ? { 'speaker-color': speakerColor } : {}),
		...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {})
	};
};

const getSyncCreatorStyleRangeKey = (range = {}) => [
	range?.kind || '',
	range?.speaker || '',
	range?.['speaker-color'] || '',
	range?.['speaker-fallback'] || ''
].join('|');

const normalizeSyncCreatorStyleRanges = (ranges, lineStart = 0, lineEnd = Number.MAX_SAFE_INTEGER) => {
	if (!Array.isArray(ranges)) return [];
	const normalized = ranges
		.map((range) => {
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
			const clippedStart = Math.max(lineStart, start);
			const clippedEnd = Math.min(lineEnd, end);
			if (clippedEnd < clippedStart) return null;
			const kind = normalizeSyncCreatorKind(range?.kind);
			const speakerMeta = getSyncCreatorStyleRangeSpeakerMeta(range);
			if (!kind && !speakerMeta) return null;
			return {
				start: clippedStart,
				end: clippedEnd,
				...(kind ? { kind } : {}),
				...(speakerMeta || {})
			};
		})
		.filter(Boolean)
		.sort((left, right) => left.start - right.start || left.end - right.end);

	const boundaries = new Set();
	for (const range of normalized) {
		boundaries.add(range.start);
		boundaries.add(range.end + 1);
	}
	const points = [...boundaries].sort((left, right) => left - right);
	const flattened = [];
	for (let index = 0; index < points.length - 1; index++) {
		const start = points[index];
		const end = points[index + 1] - 1;
		const covering = normalized.filter(range => range.start <= start && range.end >= end);
		if (!covering.length) continue;
		const reversed = [...covering].reverse();
		const kind = reversed.map(range => range.kind).find(Boolean) || '';
		const speakerRange = reversed.find(range => range.speaker) || null;
		if (!kind && !speakerRange) continue;
		const flattenedRange = {
			start,
			end,
			...(kind ? { kind } : {}),
			...(speakerRange ? {
				speaker: speakerRange.speaker,
				...(speakerRange['speaker-color'] ? { 'speaker-color': speakerRange['speaker-color'] } : {}),
				...(speakerRange['speaker-fallback'] ? { 'speaker-fallback': speakerRange['speaker-fallback'] } : {})
			} : {})
		};
		const previous = flattened[flattened.length - 1];
		if (previous && previous.end + 1 === start && getSyncCreatorStyleRangeKey(previous) === getSyncCreatorStyleRangeKey(flattenedRange)) {
			previous.end = end;
			continue;
		}
		flattened.push(flattenedRange);
	}
	return flattened;
};

const applySyncCreatorStyleRangePatch = (ranges, start, end, patch, lineStart, lineEnd) => {
	const selectionStart = Math.max(lineStart, Math.min(Number(start), Number(end)));
	const selectionEnd = Math.min(lineEnd, Math.max(Number(start), Number(end)));
	if (!Number.isInteger(selectionStart) || !Number.isInteger(selectionEnd) || selectionEnd < selectionStart) {
		return normalizeSyncCreatorStyleRanges(ranges, lineStart, lineEnd);
	}
	const source = normalizeSyncCreatorStyleRanges(ranges, lineStart, lineEnd);
	const boundaries = new Set([selectionStart, selectionEnd + 1]);
	for (const range of source) {
		boundaries.add(range.start);
		boundaries.add(range.end + 1);
	}
	const points = [...boundaries].sort((left, right) => left - right);
	const next = [];
	for (let index = 0; index < points.length - 1; index++) {
		const segmentStart = points[index];
		const segmentEnd = points[index + 1] - 1;
		if (segmentEnd < lineStart || segmentStart > lineEnd) continue;
		const sourceRange = source.find(range => range.start <= segmentStart && range.end >= segmentEnd);
		let kind = sourceRange?.kind || '';
		let speaker = sourceRange?.speaker || '';
		let speakerColor = sourceRange?.['speaker-color'] || '';
		let speakerFallback = sourceRange?.['speaker-fallback'] || '';
		if (segmentStart >= selectionStart && segmentEnd <= selectionEnd) {
			if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
				kind = patch.kind === null ? '' : normalizeSyncCreatorKind(patch.kind);
			}
			if (Object.prototype.hasOwnProperty.call(patch, 'speaker')) {
				const speakerMeta = patch.speaker === null ? null : getSyncCreatorStyleRangeSpeakerMeta(patch);
				speaker = speakerMeta?.speaker || '';
				speakerColor = speakerMeta?.['speaker-color'] || '';
				speakerFallback = speakerMeta?.['speaker-fallback'] || '';
			}
		}
		if (!kind && !speaker) continue;
		next.push({
			start: Math.max(lineStart, segmentStart),
			end: Math.min(lineEnd, segmentEnd),
			...(kind ? { kind } : {}),
			...(speaker ? { speaker } : {}),
			...(speakerColor ? { 'speaker-color': speakerColor } : {}),
			...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {})
		});
	}
	return normalizeSyncCreatorStyleRanges(next, lineStart, lineEnd);
};

const getSyncCreatorParenthesisClose = (char) => {
	if (char === '(') return ')';
	if (char === '\uFF08') return '\uFF09';
	return '';
};

const isSyncCreatorParenthesisClose = (char) => char === ')' || char === '\uFF09';

const isSyncCreatorStandaloneParentheticalLine = (line) => {
	const chars = Array.from(String(line || '').trim());
	if (chars.length < 2 || !getSyncCreatorParenthesisClose(chars[0])) return false;

	const expectedStack = [];
	for (let index = 0; index < chars.length; index++) {
		const char = chars[index];
		const expectedClose = getSyncCreatorParenthesisClose(char);
		if (expectedClose) {
			expectedStack.push(expectedClose);
			continue;
		}
		if (isSyncCreatorParenthesisClose(char)) {
			if (!expectedStack.length || expectedStack[expectedStack.length - 1] !== char) {
				return false;
			}
			expectedStack.pop();
			if (expectedStack.length === 0 && index < chars.length - 1) {
				return false;
			}
		}
	}

	return expectedStack.length === 0;
};

const stripSyncCreatorStandaloneParentheticalLine = (line) => {
	let value = String(line || '').normalize('NFC').trim();
	let changed = false;

	while (isSyncCreatorStandaloneParentheticalLine(value)) {
		const chars = Array.from(value);
		value = chars.slice(1, -1).join('').trim();
		changed = true;
	}

	return changed ? value : String(line || '').normalize('NFC');
};

const trimSyncCreatorCharRangeWhitespace = (chars, start, end, pushHidden = () => {}) => {
	let nextStart = start;
	let nextEnd = end;

	while (nextStart <= nextEnd && /\s/u.test(chars[nextStart] || '')) {
		pushHidden(nextStart);
		nextStart++;
	}

	const trailingHiddenIndexes = [];
	while (nextEnd >= nextStart && /\s/u.test(chars[nextEnd] || '')) {
		trailingHiddenIndexes.push(nextEnd);
		nextEnd--;
	}
	trailingHiddenIndexes.reverse().forEach(pushHidden);

	return { start: nextStart, end: nextEnd };
};

const stripSyncCreatorStandaloneParentheticalCharRange = (chars, start, end, pushHidden = () => {}) => {
	const sourceChars = Array.isArray(chars) ? chars : [];
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= sourceChars.length || start > end) {
		return { start, end, changed: false };
	}

	let nextStart = start;
	let nextEnd = end;
	let changed = false;
	const pendingHiddenIndexes = [];
	const queueHidden = (index) => pendingHiddenIndexes.push(index);

	({ start: nextStart, end: nextEnd } = trimSyncCreatorCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
	while (
		nextStart < nextEnd
		&& isSyncCreatorStandaloneParentheticalLine(sourceChars.slice(nextStart, nextEnd + 1).join(''))
	) {
		queueHidden(nextStart);
		queueHidden(nextEnd);
		nextStart++;
		nextEnd--;
		changed = true;
		({ start: nextStart, end: nextEnd } = trimSyncCreatorCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
	}

	if (changed) {
		[...new Set(pendingHiddenIndexes)]
			.sort((a, b) => a - b)
			.forEach(pushHidden);
	}

	return { start: nextStart, end: nextEnd, changed };
};

const getSyncCreatorFlatLyricsCharsFromText = (text) => (
	String(text || '')
		.normalize('NFC')
		.split('\n')
		.map(line => line.trim().normalize('NFC'))
		.filter(Boolean)
		.flatMap(line => Array.from(line))
);

const getSyncCreatorFlatLyricsCharsFromLines = (lines) => (
	(Array.isArray(lines) ? lines : [])
		.map(line => String(line || '').trim().normalize('NFC'))
		.filter(Boolean)
		.flatMap(line => Array.from(line))
);

const stripSyncCreatorLeadingParenthesis = (line) => {
	const value = String(line || '').normalize('NFC');
	const chars = Array.from(value);
	const index = chars.findIndex(char => !/\s/u.test(char));
	if (index < 0 || !getSyncCreatorParenthesisClose(chars[index])) return value;
	return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
};

const stripSyncCreatorTrailingParenthesis = (line, closeChar) => {
	const value = String(line || '').normalize('NFC');
	const chars = Array.from(value);
	for (let index = chars.length - 1; index >= 0; index--) {
		if (/\s/u.test(chars[index])) continue;
		if (chars[index] !== closeChar) return value;
		return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
	}
	return value;
};

const normalizeSyncCreatorStandaloneParentheticalBlocks = (lines) => {
	const normalizedLines = Array.isArray(lines) ? [...lines] : [];

	for (let index = 0; index < normalizedLines.length; index++) {
		const trimmed = String(normalizedLines[index] || '').trim();
		if (!trimmed) continue;

		const openChar = Array.from(trimmed)[0] || '';
		const closeChar = getSyncCreatorParenthesisClose(openChar);
		if (!closeChar || trimmed.includes(closeChar)) continue;

		let closeLineIndex = -1;
		for (let candidate = index + 1; candidate < normalizedLines.length; candidate++) {
			const candidateTrimmed = String(normalizedLines[candidate] || '').trim();
			if (!candidateTrimmed) continue;
			if (candidateTrimmed.endsWith(closeChar)) {
				closeLineIndex = candidate;
				break;
			}
		}

		if (closeLineIndex < 0) continue;

		normalizedLines[index] = stripSyncCreatorLeadingParenthesis(normalizedLines[index]).trim();
		normalizedLines[closeLineIndex] = stripSyncCreatorTrailingParenthesis(normalizedLines[closeLineIndex], closeChar).trim();
	}

	return normalizedLines;
};

const normalizeSyncCreatorStandaloneParentheticalLines = (text) => (
	normalizeSyncCreatorStandaloneParentheticalBlocks(
		String(text || '')
			.normalize('NFC')
			.split('\n')
			.map(line => stripSyncCreatorStandaloneParentheticalLine(line))
	).join('\n')
);

const detectSyncCreatorParallelVocalHints = (text) => {
	const normalized = normalizeSyncCreatorStandaloneParentheticalLines(text);
	if (!normalized.trim()) return false;
	return normalized
		.split('\n')
		.some(line => {
			const trimmed = line.trim();
			return trimmed.length > 1 && SYNC_CREATOR_PARALLEL_HINT_REGEX.test(trimmed);
		});
};

const hasSyncCreatorRtlText = (text) => {
	const normalizedText = typeof text === 'string' ? text : '';
	return SYNC_CREATOR_RTL_STRONG_CHAR_REGEX.test(normalizedText);
};

const getSyncCreatorCodeUnitOffsets = (chars) => {
	const offsets = [0];
	let offset = 0;
	(Array.isArray(chars) ? chars : []).forEach((char) => {
		offset += String(char || '').length;
		offsets.push(offset);
	});
	return offsets;
};

const getSyncCreatorCharIndexFromCodeUnitOffset = (offsets, offset) => {
	if (!Array.isArray(offsets) || offsets.length < 2) {
		return 0;
	}

	const safeOffset = Math.max(0, Math.min(offset, offsets[offsets.length - 1]));
	for (let index = 0; index < offsets.length - 1; index++) {
		if (safeOffset >= offsets[index] && safeOffset < offsets[index + 1]) {
			return index;
		}
	}
	return Math.max(0, offsets.length - 2);
};

const getSyncCreatorCharacterPronunciationProgressInfo = (progress) => {
	if (!progress) return null;

	const total = Math.max(0, Number(progress.total) || 0);
	const completed = Math.max(0, Math.min(total, Number(progress.completed) || 0));
	const current = total > 0
		? Math.max(1, Math.min(total, Number(progress.current) || completed || 1))
		: 0;
	const remaining = total > 0
		? Math.max(0, Number.isFinite(Number(progress.remaining)) ? Number(progress.remaining) : total - completed)
		: 0;
	const percent = total > 0
		? Math.max(0, Math.min(100, Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : Math.round((completed / total) * 100)))
		: 0;

	if (progress.phase === 'retry-split') {
		return {
			percent,
			buttonLabel: total > 0 ? `${current}/${total} (${percent}%)` : (I18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...'),
			label: progress.reason === 'format'
				? (I18n.t('syncCreator.characterPronunciationProgressRetryFormat') || 'Invalid AI alignment. Retrying with smaller chunks...')
				: (I18n.t('syncCreator.characterPronunciationProgressRetry') || 'Response was truncated. Splitting this chunk smaller...')
		};
	}

	if (progress.phase === 'chunk-error' || progress.phase === 'provider-error') {
		return {
			percent,
			buttonLabel: total > 0 ? `${current}/${total} (${percent}%)` : (I18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...'),
			label: progress.error || I18n.t('syncCreator.characterPronunciationProgressError') || 'AI pronunciation generation failed. Trying fallback...'
		};
	}

	if (total > 0) {
		return {
			percent,
			buttonLabel: `${current}/${total} (${percent}%)`,
			label: I18n.t('syncCreator.characterPronunciationProgress', {
				current,
				total,
				percent,
				remaining
			}) || `${current}/${total} chunks - ${percent}% - ${remaining} left`
		};
	}

	return {
		percent,
		buttonLabel: I18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...',
		label: I18n.t('syncCreator.characterPronunciationProgressPreparing') || 'Preparing pronunciation generation...'
	};
};

const normalizeSyncCreatorPronunciationUnits = (lineData, lineChars) => {
	const chars = Array.isArray(lineChars) ? lineChars : [];
	if (lineData?.unitMode && lineData.unitMode !== 'word') {
		return [];
	}

	const rawUnits = Array.isArray(lineData?.units)
		? lineData.units
		: (Array.isArray(lineData?.u) ? lineData.u : []);

	return rawUnits
		.map((unit) => {
			const start = Number(unit?.start ?? unit?.s);
			const end = Number(unit?.end ?? unit?.e);
			const pronunciation = typeof (unit?.pronunciation ?? unit?.p) === 'string'
				? (unit.pronunciation ?? unit.p).trim()
				: '';

			if (!pronunciation || !Number.isInteger(start) || !Number.isInteger(end)) {
				return null;
			}
			if (start < 0 || end < start || end >= chars.length) {
				return null;
			}

			return {
				start,
				end,
				pronunciation,
				text: chars.slice(start, end + 1).join('')
			};
		})
		.filter(Boolean)
		.sort((a, b) => a.start - b.start || a.end - b.end);
};

const buildSyncCreatorVisualPronunciationUnits = (lineChars, pronunciationMap) => {
	const chars = Array.isArray(lineChars) ? lineChars : [];
	if (!chars.length || !(pronunciationMap instanceof Map) || pronunciationMap.size === 0) {
		return [];
	}

	const lineText = chars.join('');
	if (!SYNC_CREATOR_JAPANESE_KANA_REGEX.test(lineText) && !SYNC_CREATOR_KANJI_REGEX.test(lineText)) {
		return [];
	}

	const units = [];
	const appendToPreviousUnit = (index, pronunciation = '') => {
		const previous = units[units.length - 1];
		if (!previous) return false;
		previous.end = index;
		previous.text += chars[index] || '';
		if (pronunciation) {
			previous.pronunciation = mergeSyncCreatorPronunciationText(previous.pronunciation, pronunciation);
		}
		return true;
	};

	for (let index = 0; index < chars.length; index++) {
		const char = chars[index] || '';
		const pronunciation = String(pronunciationMap.get(index) || '').trim();
		if (/\s/u.test(char)) {
			continue;
		}

		const shouldAttachToPrevious =
			SYNC_CREATOR_JAPANESE_ATTACH_KANA_REGEX.test(char) ||
			(SYNC_CREATOR_JAPANESE_KANA_REGEX.test(char) && SYNC_CREATOR_HANGUL_JAMO_ONLY_REGEX.test(pronunciation));

		if (shouldAttachToPrevious && appendToPreviousUnit(index, pronunciation)) {
			continue;
		}

		if (!pronunciation) {
			continue;
		}

		units.push({
			start: index,
			end: index,
			text: char,
			pronunciation
		});
	}

	return units.filter(unit => unit.pronunciation);
};

const hasSyncCreatorCharacterPronunciation = (result) => (
	Array.isArray(result?.lines) && result.lines.some(line => (
		(Array.isArray(line?.chars) && line.chars.some(item => item?.pronunciation))
		|| (Array.isArray(line?.units) && line.units.some(item => item?.pronunciation))
	))
);

const isSyncCreatorCharacterPronunciationCompatible = (result, lyricsLines) => {
	const sourceLines = Array.isArray(lyricsLines) ? lyricsLines : [];
	if (!Array.isArray(result?.lines) || result.lines.length !== sourceLines.length) return false;

	return sourceLines.every((text, lineIndex) => {
		const resultLine = result.lines.find(line => Number(line?.index) === lineIndex)
			|| result.lines[lineIndex];
		const sourceChars = Array.from(String(text || ''));
		if (!Array.isArray(resultLine?.chars) || resultLine.chars.length !== sourceChars.length) {
			return false;
		}
		return resultLine.chars.every((item, charIndex) => (
			Number(item?.i ?? charIndex) === charIndex
			&& String(item?.char ?? '') === sourceChars[charIndex]
		));
	});
};

const SyncDataCreator = ({ trackInfo, initialData, onClose }) => {
	const { useState, useEffect, useRef, useCallback, useMemo } = react;
	const syncCreatorDraftStore = window.SyncCreatorDraftStore || null;

	const roundSyncTime = roundSyncCreatorTime;
	const SYNC_CREATOR_DRAG_INITIAL_BURST_STEPS = 3;
	const SYNC_CREATOR_DRAG_INTERVAL_MS = 27;
	const EDGE_INTERPOLATION_GAP_SEC = 0.045;
	const getSyncCreatorLineTimes = (line) => {
		const times = [];
		const appendTimes = (values) => {
			if (!Array.isArray(values)) return;
			values.forEach((value) => {
				if (typeof value === 'number' && Number.isFinite(value)) {
					times.push(value);
				}
			});
		};

		appendTimes(line?.chars);
		if (Array.isArray(line?.parallel?.parts)) {
			line.parallel.parts.forEach(part => appendTimes(part?.chars));
		}

		return times;
	};
	const SYNC_CREATOR_SHORTCUTS = {
		charForward: { primary: 'sync-creator-char-forward-key', secondary: 'sync-creator-char-forward-alt-key', defaultPrimary: 'right' },
		charBack: { primary: 'sync-creator-char-back-key', secondary: 'sync-creator-char-back-alt-key', defaultPrimary: 'left' },
		wordForward: { primary: 'sync-creator-word-forward-key', secondary: 'sync-creator-word-forward-alt-key', defaultPrimary: '.' },
		wordBack: { primary: 'sync-creator-word-back-key', secondary: 'sync-creator-word-back-alt-key', defaultPrimary: ',' },
		syllable: { primary: 'sync-creator-syllable-key', secondary: 'sync-creator-syllable-alt-key', defaultPrimary: ';' },
		drag: { primary: 'sync-creator-drag-key', secondary: 'sync-creator-drag-alt-key', defaultPrimary: '/', defaultSecondary: 'numpaddivide' },
	};
	const SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY = 'sync-creator-auto-boundary-chars';
	const normalizeHotkeyToken = (value) => {
		if (value === null || value === undefined) return '';
		const normalized = String(value).trim().toLowerCase();
		if (!normalized) return '';

		const aliases = {
			arrowright: 'right',
			arrowleft: 'left',
			arrowup: 'up',
			arrowdown: 'down',
			' ': 'space',
			spacebar: 'space',
			escape: 'esc',
			return: 'enter',
			del: 'delete',
			slash: '/',
			divide: 'numpaddivide',
			'num /': 'numpaddivide',
			'num/': 'numpaddivide',
			control: 'ctrl',
			command: 'meta',
			cmd: 'meta',
		};

		return aliases[normalized] || normalized;
	};
	const readSyncCreatorShortcutSetting = (settingKey, fallback = '') => {
		try {
			const fullKey = `ivLyrics:visual:${settingKey}`;
			const stored = localStorage.getItem(fullKey) ?? Spicetify.LocalStorage?.get(fullKey);
			const effectiveValue = stored !== null && stored !== undefined ? stored : fallback;
			return normalizeHotkeyToken(effectiveValue);
		} catch (e) {
			return normalizeHotkeyToken(fallback);
		}
	};
	const readSyncCreatorBooleanSetting = (settingKey, fallback = true) => {
		try {
			const fullKey = `ivLyrics:visual:${settingKey}`;
			const stored = localStorage.getItem(fullKey)
				?? Spicetify.LocalStorage?.get(fullKey)
				?? window.CONFIG?.visual?.[settingKey];
			if (stored === null || stored === undefined) return fallback;
			if (typeof stored === 'boolean') return stored;
			const normalized = String(stored).trim().toLowerCase();
			if (!normalized) return fallback;
			return !['false', '0', 'off', 'no'].includes(normalized);
		} catch (e) {
			return fallback;
		}
	};
	const getSyncCreatorShortcutBindings = () => Object.entries(SYNC_CREATOR_SHORTCUTS).reduce((acc, [action, config]) => {
		const primary = readSyncCreatorShortcutSetting(config.primary, config.defaultPrimary);
		const secondary = readSyncCreatorShortcutSetting(config.secondary, config.defaultSecondary || '');
		acc[action] = [primary, secondary].filter(Boolean);
		return acc;
	}, {});
	const getNormalizedHotkeyFromEvent = (event) => {
		const parts = [];
		if (event.ctrlKey) parts.push('ctrl');
		if (event.altKey) parts.push('alt');
		if (event.shiftKey && normalizeHotkeyToken(event.key) !== 'shift') parts.push('shift');
		if (event.metaKey) parts.push('meta');

		const baseKey = event.code === 'NumpadDivide'
			? 'numpaddivide'
			: normalizeHotkeyToken(event.key);
		if (!['ctrl', 'alt', 'shift', 'meta'].includes(baseKey)) {
			parts.push(baseKey);
		}
		return parts.join('+');
	};
	const isSyncCreatorDragHotkeyEvent = (event, normalizedHotkey = getNormalizedHotkeyFromEvent(event)) => {
		if (normalizedHotkey === '/' || normalizedHotkey === 'numpaddivide') return true;
		if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
		return event.code === 'Slash' || event.code === 'NumpadDivide';
	};
	const formatHotkeyToken = (value) => {
		const token = normalizeHotkeyToken(value);
		const displayMap = {
			right: '→',
			left: '←',
			up: '↑',
			down: '↓',
			enter: 'Enter',
			backspace: '⌫',
			space: 'Space',
			esc: 'Esc',
			ctrl: 'Ctrl',
			alt: 'Alt',
			shift: 'Shift',
			meta: 'Meta',
			'/': 'Slash',
			numpaddivide: 'Num /',
		};
		if (displayMap[token]) return displayMap[token];
		return token.length === 1 ? token.toUpperCase() : token;
	};
	const formatHotkeyBinding = (binding) => binding
		.split('+')
		.filter(Boolean)
		.map(formatHotkeyToken)
		.join('+');
	const getSyncCreatorShortcutDisplay = (action) => {
		const bindings = getSyncCreatorShortcutBindings()[action] || [];
		return bindings.length ? bindings.map(formatHotkeyBinding).join(' / ') : '';
	};

	const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
	const isLatinChar = (ch) => !!ch && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch);
	const isLatinVowel = (ch) => !!ch && /[AEIOUYaeiouyÀ-ÖØ-öø-ÿ]/.test(ch);
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
		return /[\(\[\{「『【〈《¿¡'"“”‘’]/u.test(ch);
	};
	const isTrailingChar = (chars, index) => {
		const ch = chars[index];
		if (!ch) return false;
		if (isInternalJoiner(chars, index)) return false;
		return /[\s!?\.,;:\)\]\}」』】〉》'"“”‘’]/u.test(ch);
	};
	const isValidOnsetCluster = (cluster) => /^(bl|br|ch|chr|cl|cr|dr|fl|fr|gl|gr|ph|pl|pr|qu|sc|sch|scr|sh|sk|sl|sm|sn|sp|spl|spr|st|str|sw|th|thr|tr|tw|wh|wr)$/i.test(cluster);
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
			target[startIdx] = roundSyncTime(startTime);
			return;
		}
		for (let i = 0; i < count; i++) {
			const progress = count === 1 ? 1 : i / (count - 1);
			target[startIdx + i] = roundSyncTime(startTime + ((safeEndTime - startTime) * interpolationFn(progress)));
		}
	};
	const getLastRecordedSyncIndex = (target) => {
		if (!Array.isArray(target)) return -1;
		for (let index = target.length - 1; index >= 0; index--) {
			if (isFiniteSyncCreatorTime(target[index])) return index;
		}
		return -1;
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
			return roundSyncTime(safeRawTime);
		}
		return roundSyncTime(Math.max(safeRawTime, previousTime + SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC));
	};
	const estimateSegmentDuration = (startIdx, endIdx, scale = 0.055, maxDuration = 0.26) =>
		Math.min(maxDuration, Math.max(0.07, (endIdx - startIdx + 1) * scale));
	const estimateWordInterpolationDuration = (startIdx, endIdx) => {
		const charCount = Math.max(1, endIdx - startIdx + 1);
		const preferredDuration = charCount * 0.085;
		const minimumDuration = 0.11 + Math.max(0, charCount - 1) * 0.05;
		return Math.min(0.42, Math.max(minimumDuration, preferredDuration));
	};
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
			let wordSegments;

			if (!isLatinChar(chars[wordStart])) {
				wordSegments = [];
				for (let i = wordStart; i <= coreEnd; i++) {
					wordSegments.push({ start: i, end: i });
				}
			} else if (chars.slice(wordStart, coreEnd + 1).every(ch => isLatinChar(ch) || /['’]/u.test(ch))) {
				wordSegments = buildLatinWordSyllables(chars, wordStart, coreEnd);
			} else {
				wordSegments = [];
				for (let i = wordStart; i <= coreEnd; i++) {
					wordSegments.push({ start: i, end: i });
				}
			}

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

	const rangesToCharRefs = (ranges, lineChars, lineStart = 0) => {
		if (!Array.isArray(ranges) || !Array.isArray(lineChars)) return [];
		const refs = [];
		ranges.forEach((range) => {
			const start = Math.max(lineStart, Number(range?.start));
			const end = Math.min(lineStart + lineChars.length - 1, Number(range?.end));
			if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return;
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
			const start = Math.max(lineStart, Number(range?.start));
			const end = Math.min(lineStart + lineChars.length - 1, Number(range?.end));
			if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return;
			text += lineChars.slice(start - lineStart, end - lineStart + 1).join('');
		});
		return text.trim();
	};

	const getSyncCreatorParallelPartDisplayItems = (part, lineChars, lineStart = 0) => {
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
			const start = Math.max(lineStart, Number(range?.start));
			const end = Math.min(lineStart + lineChars.length - 1, Number(range?.end));
			if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return;
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

	const formatSyncCreatorParallelPreviewLines = (parallel, lineChars, lineStart = 0) => (
		Array.isArray(parallel?.parts)
			? parallel.parts
				.map(part => getSyncCreatorParallelPartText(part, lineChars, lineStart))
				.filter(Boolean)
			: []
	);

	const countRangeChars = countSyncCreatorRangeChars;

	const pushSyncCreatorRange = (ranges, start, end, lineStart) => {
		if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return;
		ranges.push({ start: lineStart + start, end: lineStart + end });
	};

	const normalizeSyncCreatorHiddenRanges = (ranges) => {
		if (!Array.isArray(ranges)) return [];
		const normalizedRanges = ranges
			.map((range) => {
				const start = Number(range?.start);
				const end = Number(range?.end);
				return Number.isInteger(start) && Number.isInteger(end) && end >= start
					? { start, end }
					: null;
			})
			.filter(Boolean)
			.sort((a, b) => a.start - b.start || a.end - b.end);

		return normalizedRanges.reduce((merged, range) => {
			const previous = merged[merged.length - 1];
			if (previous && range.start <= previous.end + 1) {
				previous.end = Math.max(previous.end, range.end);
			} else {
				merged.push(range);
			}
			return merged;
		}, []);
	};

	const isSyncCreatorRangeGapFullyHidden = (hiddenRanges, gapStart, gapEnd) => {
		if (gapStart > gapEnd || !Array.isArray(hiddenRanges) || hiddenRanges.length === 0) return false;

		let cursor = gapStart;
		for (const hiddenRange of hiddenRanges) {
			const start = Number(hiddenRange?.start);
			const end = Number(hiddenRange?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return false;
			if (end < cursor) continue;
			if (start > cursor) return false;
			cursor = Math.max(cursor, end + 1);
			if (cursor > gapEnd) return true;
		}

		return false;
	};

	const getNextSyncCreatorPartId = (usedIds) => {
		for (const label of 'abcdefghijklmnopqrstuvwxyz') {
			if (!usedIds.has(label)) {
				usedIds.add(label);
				return label;
			}
		}

		let index = 1;
		while (index <= 16) {
			const id = `p${index}`;
			if (!usedIds.has(id)) {
				usedIds.add(id);
				return id;
			}
			index++;
		}

		return null;
	};

	const splitSyncCreatorHiddenDelimitedParallelPart = (part, hiddenRanges, usedIds) => {
		if (
			!part
			|| typeof part !== 'object'
			|| part.role !== 'background'
			|| typeof part.id !== 'string'
			|| !Array.isArray(part.ranges)
			|| part.ranges.length < 2
			|| !Array.isArray(part.join)
			|| part.join.length !== part.ranges.length - 1
			|| !part.join.every(joinMode => Number.isInteger(joinMode) && joinMode >= 0 && joinMode <= 2)
		) {
			return null;
		}

		const hasSyncedChars = Array.isArray(part.chars);
		if (hasSyncedChars && part.chars.length !== countRangeChars(part.ranges)) {
			return null;
		}
		if (part.join.some(joinMode => Number(joinMode) === 2)) {
			return null;
		}

		for (let index = 0; index < part.ranges.length; index++) {
			const range = part.ranges[index];
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
			if (index > 0) {
				const previousRange = part.ranges[index - 1];
				const previousEnd = Number(previousRange?.end);
				if (!Number.isInteger(previousEnd) || start <= previousEnd) return null;
				if (!isSyncCreatorRangeGapFullyHidden(hiddenRanges, previousEnd + 1, start - 1)) {
					return null;
				}
			}
		}

		const splitParts = [];
		let charOffset = 0;
		for (let index = 0; index < part.ranges.length; index++) {
			const range = part.ranges[index];
			const charCount = range.end - range.start + 1;
			const id = index === 0 ? part.id : getNextSyncCreatorPartId(usedIds);
			if (!id) return null;

			const splitPart = {
				...part,
				id,
				ranges: [{ ...range }],
				join: []
			};
			if (hasSyncedChars) {
				splitPart.chars = part.chars.slice(charOffset, charOffset + charCount);
			} else {
				delete splitPart.chars;
			}
			splitParts.push(splitPart);
			charOffset += charCount;
		}

		return splitParts;
	};

	const splitSyncCreatorHiddenDelimitedParallelParts = (parallel, options = {}) => {
		if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts) || !Array.isArray(parallel.hiddenRanges)) {
			return parallel;
		}
		if (options.splitHiddenDelimitedBackgroundParts === false) {
			return parallel;
		}

		const usedIds = new Set(parallel.parts
			.map(part => (typeof part?.id === 'string' ? part.id : null))
			.filter(Boolean));
		const parts = [];
		let changed = false;

		parallel.parts.forEach((part) => {
			const splitParts = splitSyncCreatorHiddenDelimitedParallelPart(part, parallel.hiddenRanges, usedIds);
			if (splitParts) {
				changed = true;
				parts.push(...splitParts);
			} else {
				parts.push(part);
			}
		});

		return changed && parts.length <= 16 ? { ...parallel, parts } : parallel;
	};

	const sanitizeSyncCreatorParallel = (parallel, options = {}) => {
		if (!parallel || typeof parallel !== 'object') return parallel;
		const nextParallel = { ...parallel };
		if (Array.isArray(nextParallel.parts)) {
			nextParallel.parts = nextParallel.parts.map((part) => {
				if (!part || typeof part !== 'object') return part;
				const nextPart = { ...part };
				const sourceSpeaker = nextPart.speaker;
				const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker);
				if (speaker) nextPart.speaker = speaker;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					nextPart['speaker-fallback'],
					true,
					sourceSpeaker
				);
				if (speakerFallback) nextPart['speaker-fallback'] = speakerFallback;
				else delete nextPart['speaker-fallback'];
				const speakerColor = sanitizeSyncCreatorSpeakerColor(
					speaker,
					nextPart['speaker-color'],
					true,
					speakerFallback
				);
				if (speakerColor) nextPart['speaker-color'] = speakerColor;
				else delete nextPart['speaker-color'];
				return nextPart;
			});
		}
		const hiddenRanges = normalizeSyncCreatorHiddenRanges(nextParallel.hiddenRanges);
		if (hiddenRanges.length > 0) {
			nextParallel.hiddenRanges = hiddenRanges;
		} else {
			delete nextParallel.hiddenRanges;
		}
		return splitSyncCreatorHiddenDelimitedParallelParts(nextParallel, options);
	};

	const normalizeSyncCreatorParentheticalParallelRanges = (parallel, fullTextChars) => {
		const sourceChars = Array.isArray(fullTextChars) ? fullTextChars : [];
		if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts) || sourceChars.length === 0) {
			return { parallel: sanitizeSyncCreatorParallel(parallel), changed: false };
		}

		const hiddenRanges = Array.isArray(parallel.hiddenRanges) ? [...parallel.hiddenRanges] : [];
		let changed = false;
		const parts = parallel.parts.map((part) => {
			if (!part || !Array.isArray(part.ranges) || part.ranges.length !== 1 || !Array.isArray(part.chars)) {
				return part;
			}

			const range = part.ranges[0];
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (
				!Number.isInteger(start)
				|| !Number.isInteger(end)
				|| start < 0
				|| end < start
				|| end >= sourceChars.length
				|| part.chars.length !== end - start + 1
			) {
				return part;
			}

			const localChars = sourceChars.slice(start, end + 1);
			const hiddenLocalIndexes = [];
			const stripped = stripSyncCreatorStandaloneParentheticalCharRange(
				localChars,
				0,
				localChars.length - 1,
				index => hiddenLocalIndexes.push(index)
			);
			if (!stripped.changed || stripped.start > stripped.end) return part;

			const nextChars = part.chars.slice(stripped.start, stripped.end + 1);
			if (nextChars.length !== stripped.end - stripped.start + 1) return part;

			changed = true;
			hiddenLocalIndexes.forEach(index => {
				const absoluteIndex = start + index;
				hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
			});

			return {
				...part,
				ranges: [{ ...range, start: start + stripped.start, end: start + stripped.end }],
				chars: nextChars
			};
		});

		if (!changed) {
			return { parallel: sanitizeSyncCreatorParallel(parallel), changed: false };
		}

		return {
			parallel: sanitizeSyncCreatorParallel({
				...parallel,
				hiddenRanges,
				parts
			}),
			changed: true
		};
	};

	const sanitizeSyncCreatorSyncData = (data, fullTextChars = null) => {
		if (!data || !Array.isArray(data.lines)) return data;
		let migratedParallelRanges = false;
		const lines = data.lines.map((line) => {
			const lineStart = Number(line?.start);
			const lineEnd = Number(line?.end);
			const expectedLineLength = Number.isInteger(lineStart) && Number.isInteger(lineEnd) && lineEnd >= lineStart
				? lineEnd - lineStart + 1
				: 0;
			let nextLine = decodeSyncCreatorCompactTiming(line, expectedLineLength);
			if (nextLine.parallel && Array.isArray(nextLine.parallel.parts)) {
				nextLine = {
					...nextLine,
					parallel: {
						...nextLine.parallel,
						parts: nextLine.parallel.parts.map(part => decodeSyncCreatorCompactTiming(
							part,
							countSyncCreatorRangeChars(part?.ranges)
						))
					}
				};
			}
			const sourceSpeaker = nextLine.speaker;
			const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker);
			if (speaker) nextLine.speaker = speaker;
			const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
				speaker,
				nextLine['speaker-fallback'],
				true,
				sourceSpeaker
			);
			if (speakerFallback) nextLine['speaker-fallback'] = speakerFallback;
			else delete nextLine['speaker-fallback'];
			const speakerColor = sanitizeSyncCreatorSpeakerColor(
				speaker,
				nextLine['speaker-color'],
				true,
				speakerFallback
			);
			if (speakerColor) nextLine['speaker-color'] = speakerColor;
			else delete nextLine['speaker-color'];
			if (nextLine.parallel) {
				const normalized = normalizeSyncCreatorParentheticalParallelRanges(nextLine.parallel, fullTextChars);
				nextLine.parallel = normalized.parallel;
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
			nextLine = repairSyncCreatorLineCharsFromParallel(nextLine);
			return nextLine;
		});
		const hasParallelLines = lines.some(line => Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1);
		const hasInlineStyleRanges = lines.some(line => Array.isArray(line?.styleRanges) && line.styleRanges.length > 0);
		const version = Number(data.version);

		return {
			...data,
			...(hasParallelLines || migratedParallelRanges || hasInlineStyleRanges
				? { version: Math.max(Number.isFinite(version) ? version : 1, SYNC_CREATOR_SYNC_DATA_VERSION) }
				: {}),
			lines
		};
	};

	const compactSyncCreatorSyncData = (data, fullTextChars = null, locale = undefined) => {
		if (!data || !Array.isArray(data.lines)) return data;
		const sourceChars = Array.isArray(fullTextChars) ? fullTextChars : [];
		const lines = data.lines.map((line) => {
			const lineChars = sourceChars.slice(Number(line.start), Number(line.end) + 1);
			let nextLine = encodeSyncCreatorCompactTiming(line, lineChars, locale);
			if (line.parallel && Array.isArray(line.parallel.parts)) {
				nextLine = {
					...nextLine,
					parallel: {
						...line.parallel,
						parts: line.parallel.parts.map((part) => {
							const partChars = (Array.isArray(part.ranges) ? part.ranges : [])
								.flatMap(range => sourceChars.slice(Number(range.start), Number(range.end) + 1));
							return encodeSyncCreatorCompactTiming(part, partChars, locale);
						})
					}
				};
			}
			return nextLine;
		});
		return {
			...data,
			version: Math.max(SYNC_CREATOR_SYNC_DATA_VERSION, Number(data.version) || 1),
			lines
		};
	};

	const buildParentheticalParallelTemplate = (lineChars, lineStart = 0, options = {}) => {
		const chars = Array.isArray(lineChars) ? lineChars : [];
		if (!chars.length) return null;

		const groupBackgroundParts = options.groupBackgroundParts === true;
		const speakerLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
		const buildPart = (index, ranges, role = index === 0 ? 'lead' : 'background', joinMode = 1) => ({
			id: speakerLabels[index]?.toLowerCase() || `p${index + 1}`,
			role,
			speaker: SYNC_CREATOR_DEFAULT_SPEAKER,
			kind: SYNC_CREATOR_DEFAULT_KIND,
			ranges,
			join: ranges.length > 1 ? new Array(ranges.length - 1).fill(joinMode) : []
		});

		const buildSeparatorTemplate = () => {
			const partRanges = [];
			const hiddenRanges = [];
			let depth = 0;
			let partIndex = 0;
			let runStart = null;

			const pushHidden = (index) => {
				const previous = hiddenRanges[hiddenRanges.length - 1];
				const absoluteIndex = lineStart + index;
				if (previous && previous.end + 1 === absoluteIndex) {
					previous.end = absoluteIndex;
				} else {
					hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
				}
			};

			const flushRun = (endIndex) => {
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

		const pushHidden = (index) => {
			const previous = hiddenRanges[hiddenRanges.length - 1];
			const absoluteIndex = lineStart + index;
			if (previous && previous.end + 1 === absoluteIndex) {
				previous.end = absoluteIndex;
			} else {
				hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
			}
		};

		for (let index = 0; index < chars.length; index++) {
			const char = chars[index] || '';
			const isOpen = char === '(' || char === '（';
			const isClose = char === ')' || char === '）';
			const isHidden = isOpen || isClose;

			if (isOpen || isClose) {
				flushRun(index - 1);
				pushHidden(index);
				depth = isOpen ? depth + 1 : Math.max(0, depth - 1);
				continue;
			}

			if (isHidden) {
				flushRun(index - 1);
				pushHidden(index);
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

		const speakerLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
		const hiddenRanges = [];
		const parts = [];

		const pushHidden = (index) => {
			const absoluteIndex = lineStart + index;
			const previous = hiddenRanges[hiddenRanges.length - 1];
			if (previous && previous.end + 1 === absoluteIndex) {
				previous.end = absoluteIndex;
			} else {
				hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
			}
		};

		const boundaries = [0, ...normalizedSplitPoints, chars.length];
		for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex++) {
			let start = boundaries[boundaryIndex];
			let end = boundaries[boundaryIndex + 1] - 1;

			while (start <= end && /\s/u.test(chars[start] || '')) {
				pushHidden(start);
				start++;
			}
			const trailingHiddenIndexes = [];
			while (end >= start && /\s/u.test(chars[end] || '')) {
				trailingHiddenIndexes.push(end);
				end--;
			}
			trailingHiddenIndexes.reverse().forEach(pushHidden);
			if (start > end) continue;

			const stripped = stripSyncCreatorStandaloneParentheticalCharRange(chars, start, end, pushHidden);
			if (stripped.changed) {
				start = stripped.start;
				end = stripped.end;
				if (start > end) continue;
			}

			parts.push({
				id: speakerLabels[parts.length]?.toLowerCase() || `p${parts.length + 1}`,
				role: parts.length === 0 ? 'lead' : 'background',
				speaker: SYNC_CREATOR_DEFAULT_SPEAKER,
				kind: SYNC_CREATOR_DEFAULT_KIND,
				ranges: [{ start: lineStart + start, end: lineStart + end }],
				join: []
			});
		}

		if (parts.length < 2) return null;
		return sanitizeSyncCreatorParallel({
			layout: 'stack',
			parts,
			hiddenRanges
		});
	};

	const mergeSyncCreatorParallelTemplate = (template, existingLine) => {
		if (!template) return null;
		const existingParallel = existingLine?.parallel;
		return sanitizeSyncCreatorParallel({
			layout: existingParallel?.layout || template.layout || 'stack',
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
				return {
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
						chars: reusableChars
					};
				})
		});
	};

	// 상태 관리
	const [provider, setProvider] = useState('');   // 상세 provider (sync-data 매칭용, 예: spotify-MusixMatch)
	const [addonId, setAddonId] = useState(SYNC_CREATOR_SOURCE_ADDON_ID);
	const [lyrics, setLyrics] = useState(null);
	const [lyricsText, setLyricsText] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [currentLineIndex, setCurrentLineIndex] = useState(0);
	const [activeParallelPartId, setActiveParallelPartId] = useState('full');
	const pendingParallelNavigationRef = useRef(null);
	const [parallelPartMetaDrafts, setParallelPartMetaDrafts] = useState({});
	const [manualParallelSplitDrafts, setManualParallelSplitDrafts] = useState({});
	const [parentheticalLayoutDrafts, setParentheticalLayoutDrafts] = useState({});
	const [pendingParentheticalLayoutDecision, setPendingParentheticalLayoutDecision] = useState(null);
	const [mergedLineDrafts, setMergedLineDrafts] = useState({});
	const [isParallelSplitCollapsed, setIsParallelSplitCollapsed] = useState(false);
	const [lineMetaDrafts, setLineMetaDrafts] = useState({});
	const [lineStyleDrafts, setLineStyleDrafts] = useState({});
	const [styleRangeSelection, setStyleRangeSelection] = useState(null);
	const [styleRangeEffect, setStyleRangeEffect] = useState('');
	const [styleRangeSpeaker, setStyleRangeSpeaker] = useState(SYNC_CREATOR_DEFAULT_SPEAKER);
	const [styleRangeSpeakerColor, setStyleRangeSpeakerColor] = useState('');
	const [styleRangeSpeakerFallback, setStyleRangeSpeakerFallback] = useState(SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK);
	const [isStyleRangeEditorExpanded, setIsStyleRangeEditorExpanded] = useState(false);
	const [multiVocalMode, setMultiVocalMode] = useState(false);
	const [pendingMultiVocalDecision, setPendingMultiVocalDecision] = useState(null);
	const [syncData, setSyncData] = useState(null);
	const [furiganaRevision, setFuriganaRevision] = useState(0);
	const [characterPronunciations, setCharacterPronunciations] = useState(null);
	const [showCharacterPronunciations, setShowCharacterPronunciations] = useState(false);
	const [isCharacterPronunciationPrimary, setIsCharacterPronunciationPrimary] = useState(false);
	const [characterPronunciationTargetMode, setCharacterPronunciationTargetMode] = useState(() => (
		normalizeSyncCreatorPronunciationTargetMode(
			localStorage.getItem(SYNC_CREATOR_PRONUNCIATION_TARGET_STORAGE_KEY)
		)
	));
	const [isGeneratingCharacterPronunciations, setIsGeneratingCharacterPronunciations] = useState(false);
	const [characterPronunciationProgress, setCharacterPronunciationProgress] = useState(null);
	const [showCharacterPronunciationConsent, setShowCharacterPronunciationConsent] = useState(false);
	const [mode, setMode] = useState('idle');
	const [syncGranularity, setSyncGranularity] = useState(SYNC_CREATOR_DEFAULT_GRANULARITY);
	const [position, setPosition] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [recordingCharIndex, setRecordingCharIndex] = useState(-1);
	const [recordingLockIndex, setRecordingLockIndex] = useState(-1);
	const [dragStartTime, setDragStartTime] = useState(null);
	const [dragStartCharIndex, setDragStartCharIndex] = useState(-1);
	const [isDragging, setIsDragging] = useState(false);
	const [globalOffset, setGlobalOffset] = useState(0);
	const [lrclibCandidates, setLrclibCandidates] = useState([]);
	const [selectedLrclibCandidateKey, setSelectedLrclibCandidateKey] = useState('');
	const [selectedLrclibSource, setSelectedLrclibSource] = useState(null);
	const [previewLrclibCandidateKey, setPreviewLrclibCandidateKey] = useState('');
	const [lrclibSearchMeta, setLrclibSearchMeta] = useState(null);
	const [showLrclibCandidates, setShowLrclibCandidates] = useState(true);
	const [lrclibIdInput, setLrclibIdInput] = useState('');
	const [isLoadingLrclibId, setIsLoadingLrclibId] = useState(false);
	const [lrclibSearchQuery, setLrclibSearchQuery] = useState('');
	const [isSearchingLrclib, setIsSearchingLrclib] = useState(false);
	const [showBulkCustomSpeakerDialog, setShowBulkCustomSpeakerDialog] = useState(false);
	const [bulkCustomSpeakerFallback, setBulkCustomSpeakerFallback] = useState(SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK);
	const [bulkCustomSpeakerColor, setBulkCustomSpeakerColor] = useState(() => (
		getSyncCreatorCustomSpeakerDefaultColor('CUSTOM', SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK)
	));
	const [sessionHistory, setSessionHistory] = useState([]);
	const [sessionHistoryCursorId, setSessionHistoryCursorId] = useState('');
	const [sessionHydrationComplete, setSessionHydrationComplete] = useState(false);
	const [sessionReadyDraftKey, setSessionReadyDraftKey] = useState('');
	const [sessionSaveState, setSessionSaveState] = useState('idle');
	const [lastSessionSavedAt, setLastSessionSavedAt] = useState(0);
	const [historyAnnouncement, setHistoryAnnouncement] = useState('');
	const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
	const [isSessionAutosaveEnabled, setIsSessionAutosaveEnabled] = useState(() => {
		try {
			return window.localStorage?.getItem(SYNC_CREATOR_AUTOSAVE_ENABLED_STORAGE_KEY) !== 'false';
		} catch (error) {
			return true;
		}
	});
	const [historyPanelHeight, setHistoryPanelHeight] = useState(() => {
		try {
			const storedHeight = Number(window.localStorage?.getItem(SYNC_CREATOR_HISTORY_HEIGHT_STORAGE_KEY));
			return Number.isFinite(storedHeight) && storedHeight >= SYNC_CREATOR_HISTORY_MIN_HEIGHT
				? storedHeight
				: null;
		} catch (error) {
			return null;
		}
	});

	// Refs
	const containerRef = useRef(null);
	const lyricsScrollRef = useRef(null);
	const positionUpdateTimerRef = useRef(null);
	const charTimesRef = useRef([]);
	const charElementsRef = useRef([]);
	const charHitBoxesRef = useRef([]);
	const charScrollMetricsRef = useRef([]);
	const rtlTextRunRef = useRef(null);
	const recordingCharIndexRef = useRef(-1);
	const recordingLockIndexRef = useRef(-1);
	const lastPaintedRecordingIndexRef = useRef(-1);
	const recordingVisualIndexRef = useRef(-1);
	const recordingVisualTargetIndexRef = useRef(-1);
	const recordingVisualFrameRef = useRef(null);
	const recordingVisualFrameTimeRef = useRef(0);
	const lastPaintedPlaybackIndexRef = useRef(-1);
	const preventNextTrackRef = useRef(false);
	const hasAutoLoadedLyricsRef = useRef(false);
	const providerRef = useRef(provider);
	const selectedLrclibSourceRef = useRef(selectedLrclibSource);
	const customSpeakerMetaMemoryRef = useRef(new Map());
	const sessionAppliedDraftKeyRef = useRef('');
	const sessionRecoveryRequestRef = useRef(0);
	const sessionSourceChangeRequestRef = useRef(0);
	const sessionCheckpointRestoreRequestRef = useRef(0);
	const sessionWriteGenerationRef = useRef(0);
	const sessionClientRevisionRef = useRef(Date.now() * 1000);
	const sessionAutosaveTimerRef = useRef(null);
	const sessionAutosaveEnabledRef = useRef(isSessionAutosaveEnabled);
	const sessionAutosaveSuppressedRef = useRef(false);
	const sessionAutoRecoveryBlockedRef = useRef(false);
	const sessionBaselineDraftRef = useRef(null);
	const activeSessionDraftKeyRef = useRef('');
	const sessionSkipRecoveryDraftKeyRef = useRef('');
	const sessionSkipNextSourceRecoveryRef = useRef(false);
	const latestSessionRecordRef = useRef(null);
	const sessionLastRecoveryAnnouncementRef = useRef('');
	const historyListRef = useRef(null);
	const historyPanelRef = useRef(null);
	const historyResizeDragRef = useRef(null);
	const styleRangeDragRef = useRef(null);
	const characterPronunciationCacheRequestRef = useRef(0);
	const characterPronunciationGenerationRequestRef = useRef(0);
	const characterPronunciationProgressOwnerRef = useRef(0);
	const characterPronunciationConsentForceRef = useRef(false);
	const nextSessionClientRevision = useCallback(() => {
		const wallClockRevision = Date.now() * 1000;
		sessionClientRevisionRef.current = Math.max(
			sessionClientRevisionRef.current + 1,
			wallClockRevision
		);
		return sessionClientRevisionRef.current;
	}, []);
	const claimSessionForLocalEditing = useCallback(() => {
		// Once the user starts editing, no pending or newly scheduled automatic
		// recovery may replace the live editor state.
		sessionAutoRecoveryBlockedRef.current = true;
		sessionRecoveryRequestRef.current += 1;
		sessionCheckpointRestoreRequestRef.current += 1;
		sessionWriteGenerationRef.current += 1;
		setIsRestoringCheckpoint(false);
		setSessionHydrationComplete(true);
		if (activeSessionDraftKeyRef.current) {
			sessionAppliedDraftKeyRef.current = activeSessionDraftKeyRef.current;
			setSessionReadyDraftKey(activeSessionDraftKeyRef.current);
		}
	}, []);
	const toggleSessionAutosave = useCallback(() => {
		setIsSessionAutosaveEnabled((currentValue) => {
			const nextValue = !currentValue;
			sessionAutosaveEnabledRef.current = nextValue;
			try {
				window.localStorage?.setItem(
					SYNC_CREATOR_AUTOSAVE_ENABLED_STORAGE_KEY,
					String(nextValue)
				);
			} catch (error) {
				// The toggle still applies to this session when storage is unavailable.
			}
			sessionWriteGenerationRef.current += 1;
			if (sessionAutosaveTimerRef.current) {
				clearTimeout(sessionAutosaveTimerRef.current);
				sessionAutosaveTimerRef.current = null;
			}
			setSessionSaveState(nextValue && latestSessionRecordRef.current ? 'dirty' : (nextValue ? 'idle' : 'disabled'));
			return nextValue;
		});
	}, []);
	const getHistoryPanelHeightBounds = useCallback(() => {
		const railHeight = historyPanelRef.current?.parentElement?.clientHeight || 720;
		return {
			min: SYNC_CREATOR_HISTORY_MIN_HEIGHT,
			max: Math.max(SYNC_CREATOR_HISTORY_MIN_HEIGHT, railHeight - 180)
		};
	}, []);
	const persistHistoryPanelHeight = useCallback((height) => {
		try {
			window.localStorage?.setItem(SYNC_CREATOR_HISTORY_HEIGHT_STORAGE_KEY, String(Math.round(height)));
		} catch (error) {
			// Resizing still works for this session when storage is unavailable.
		}
	}, []);
	const handleHistoryResizePointerDown = useCallback((event) => {
		if (event.button !== 0 || !historyPanelRef.current) return;
		event.preventDefault();
		const bounds = getHistoryPanelHeightBounds();
		const startHeight = historyPanelRef.current.getBoundingClientRect().height;
		historyResizeDragRef.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			startHeight,
			minHeight: bounds.min,
			maxHeight: bounds.max,
			lastHeight: startHeight
		};
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}, [getHistoryPanelHeightBounds]);
	const handleHistoryResizePointerMove = useCallback((event) => {
		const drag = historyResizeDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const nextHeight = Math.max(
			drag.minHeight,
			Math.min(drag.maxHeight, drag.startHeight + drag.startY - event.clientY)
		);
		drag.lastHeight = nextHeight;
		setHistoryPanelHeight(nextHeight);
	}, []);
	const finishHistoryResize = useCallback((event) => {
		const drag = historyResizeDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		historyResizeDragRef.current = null;
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		persistHistoryPanelHeight(drag.lastHeight);
	}, [persistHistoryPanelHeight]);
	const handleHistoryResizeKeyDown = useCallback((event) => {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const bounds = getHistoryPanelHeightBounds();
		const currentHeight = historyPanelHeight
			|| historyPanelRef.current?.getBoundingClientRect().height
			|| SYNC_CREATOR_HISTORY_MIN_HEIGHT;
		const direction = event.key === 'ArrowUp' ? 1 : -1;
		const nextHeight = Math.max(bounds.min, Math.min(bounds.max, currentHeight + direction * 24));
		setHistoryPanelHeight(nextHeight);
		persistHistoryPanelHeight(nextHeight);
	}, [getHistoryPanelHeightBounds, historyPanelHeight, persistHistoryPanelHeight]);

	const setProviderValue = useCallback((nextProvider = '') => {
		const normalizedProvider = nextProvider || '';
		providerRef.current = normalizedProvider;
		setProvider(normalizedProvider);
	}, []);

	const setSelectedLrclibSourceValue = useCallback((nextSource = null) => {
		const normalizedSource = nextSource || null;
		selectedLrclibSourceRef.current = normalizedSource;
		setSelectedLrclibSource(normalizedSource);
	}, []);

	const setRecordingLockIndexValue = useCallback((index) => {
		const safeIndex = Number.isInteger(index) && index >= 0 ? index : -1;
		recordingLockIndexRef.current = safeIndex;
		setRecordingLockIndex(safeIndex);
	}, []);

	const clearRecordingLock = useCallback(() => {
		recordingLockIndexRef.current = -1;
		setRecordingLockIndex(-1);
	}, []);

	// 트랙 정보
	const trackUri = trackInfo?.uri || Spicetify.Player?.data?.item?.uri;
	const trackId = Utils.extractTrackId(trackUri) || '';
	const spotifyDataForTrack = (() => {
		try {
			return window.SpotifyDataHelper?.extractSpotifyData?.(trackUri || (trackId ? `spotify:track:${trackId}` : '')) || null;
		} catch (e) {
			return null;
		}
	})();
	const trackIsrc = normalizeSyncCreatorIsrc(
		trackInfo?.external_ids?.isrc
		|| trackInfo?.externalIds?.isrc
		|| trackInfo?.metadata?.isrc
		|| trackInfo?.item?.metadata?.isrc
		|| spotifyDataForTrack?.isrc
		|| window.SyncDataService?.getTrackIsrc?.(trackId, trackInfo)
	);
	const trackName = trackInfo?.name || Spicetify.Player?.data?.item?.name || '';
	const artistName = trackInfo?.artists?.map(a => a.name).join(', ') ||
		Spicetify.Player?.data?.item?.artists?.map(a => a.name).join(', ') || '';
	const albumName = trackInfo?.album?.name ||
		Spicetify.Player?.data?.item?.album?.name ||
		spotifyDataForTrack?.album ||
		spotifyDataForTrack?.albumName ||
		'';
	const trackDurationMs = Math.max(0, Math.round(Number(
		trackInfo?.duration?.milliseconds
		|| trackInfo?.durationMs
		|| trackInfo?.duration_ms
		|| trackInfo?.duration
		|| Spicetify.Player?.data?.item?.duration?.milliseconds
		|| Spicetify.Player?.getDuration?.()
		|| 0
	) || 0));
	const isVirtualKaraokeSource =
		lyrics?.karaokeSource === 'spotify-audio-analysis' ||
		lyrics?.karaokeSource === 'audio-analysis-pseudo' ||
		lyrics?.karaokeSource === 'line-timing-pseudo';
	const albumArt = trackInfo?.album?.images?.[0]?.url ||
		Spicetify.Player?.data?.item?.album?.images?.[0]?.url || '';

	const stripLrclibTimestamp = useCallback((text) => {
		if (!text || typeof text !== 'string') return '';
		const trimmed = text.trim();
		if (SYNC_CREATOR_LRC_METADATA_LINE_REGEX.test(trimmed)) return '';
		return trimmed.replace(/^\[\d+:\d+(?:[.,]\d+)?\]\s*/, '').trim();
	}, []);

	const extractLyricsText = useCallback((lyricsSource) => {
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
	}, []);

	const buildLineObjectsFromText = useCallback((text) => {
		if (!text || typeof text !== 'string') return [];
		return text
			.split('\n')
			.map(line => line.trim())
			.filter(Boolean)
			.map(line => ({ text: line.normalize('NFC') }));
	}, []);

	const getLrclibCandidateText = useCallback((candidate) => {
		if (!candidate) return '';

		const usePlain = candidate.preferredLyricsSource === 'plain' && candidate.plainLyrics;
		const sourceText = usePlain
			? candidate.plainLyrics
			: (candidate.syncedLyrics || candidate.plainLyrics || '');

		if (!sourceText) return '';

		if (usePlain || !candidate.syncedLyrics) {
			return normalizeSyncCreatorStandaloneParentheticalLines(sourceText
				.split('\n')
				.map(line => stripLrclibTimestamp(line))
				.filter(Boolean)
				.join('\n'));
		}

		return normalizeSyncCreatorStandaloneParentheticalLines(sourceText
			.split('\n')
			.map(line => stripLrclibTimestamp(line))
			.filter(Boolean)
			.join('\n'));
	}, [stripLrclibTimestamp]);

	const getSyncCreatorLyricsFingerprint = useCallback((text) => {
		const value = String(text || '').normalize('NFC');
		let hash = 2166136261;
		for (const char of Array.from(value)) {
			hash ^= char.codePointAt(0) || 0;
			hash = Math.imul(hash, 16777619);
		}
		return `lrclib-${(hash >>> 0).toString(36)}-${Array.from(value).length.toString(36)}`;
	}, []);

	const buildLrclibSyncSource = useCallback((candidate) => {
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
	}, [getLrclibCandidateText, getSyncCreatorLyricsFingerprint]);

	const buildSyntheticLrclibResult = useCallback((candidate) => {
		const text = getLrclibCandidateText(candidate);
		const lines = buildLineObjectsFromText(text);
		return {
			provider: 'lrclib',
			lrclibSource: buildLrclibSyncSource(candidate),
			synced: candidate?.preferredLyricsSource === 'synced' ? lines : null,
			unsynced: lines
		};
	}, [buildLineObjectsFromText, buildLrclibSyncSource, getLrclibCandidateText]);

	const clearLrclibCandidateState = useCallback(() => {
		setLrclibCandidates([]);
		setSelectedLrclibCandidateKey('');
		setSelectedLrclibSourceValue(null);
		setPreviewLrclibCandidateKey('');
		setLrclibSearchMeta(null);
	}, [setSelectedLrclibSourceValue]);
	const isCurrentSyncCreatorSourceChange = useCallback((requestId) => (
		requestId === sessionSourceChangeRequestRef.current
	), []);
	const beginSyncCreatorSourceChange = useCallback(() => {
		const sourceChangeRequestId = ++sessionSourceChangeRequestRef.current;
		const latestRecord = latestSessionRecordRef.current;
		if (sessionAutosaveTimerRef.current) {
			clearTimeout(sessionAutosaveTimerRef.current);
			sessionAutosaveTimerRef.current = null;
		}
		if (latestRecord && syncCreatorDraftStore && sessionAutosaveEnabledRef.current) {
			syncCreatorDraftStore.saveDraft(latestRecord).catch((error) => {
				console.warn('[SyncDataCreator] Failed to flush the previous source draft:', error);
			});
		}
		sessionRecoveryRequestRef.current += 1;
		sessionCheckpointRestoreRequestRef.current += 1;
		sessionWriteGenerationRef.current += 1;
		sessionAutosaveSuppressedRef.current = false;
		sessionAutoRecoveryBlockedRef.current = true;
		sessionBaselineDraftRef.current = null;
		sessionSkipRecoveryDraftKeyRef.current = '';
		sessionSkipNextSourceRecoveryRef.current = true;
		sessionAppliedDraftKeyRef.current = '';
		sessionLastRecoveryAnnouncementRef.current = '';
		latestSessionRecordRef.current = null;
		setIsRestoringCheckpoint(false);
		setSessionReadyDraftKey('');
		setSessionHistory([]);
		setSessionHistoryCursorId('');
		setHistoryAnnouncement('');
		setSessionSaveState('loading');
		setSessionHydrationComplete(true);
		setIsLoadingLrclibId(false);
		return sourceChangeRequestId;
	}, [syncCreatorDraftStore]);

	const applyLoadedLyricsResult = useCallback(async (result, usedProvider, sourceChangeRequestId) => {
		if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return false;
		let finalProvider = result.provider || usedProvider;
		let loadedSyncBody = null;

		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		if ((finalProvider === 'Spotify' || finalProvider === 'spotify') && result.spotifyLyricsProvider) {
			finalProvider = `spotify-${result.spotifyLyricsProvider}`;
		}

		setProviderValue(finalProvider);
		setAddonId(usedProvider);
		setLyrics(result);
		setSelectedLrclibSourceValue(finalProvider === 'lrclib' ? (result?.lrclibSource || null) : null);

		if (window.SyncDataService && trackId) {
			try {
				const existingSyncData = await window.SyncDataService.getSyncData(trackId, finalProvider, {
					isrc: trackIsrc || undefined,
					title: trackName,
					artist: artistName,
					album: albumName
				});
				if (existingSyncData && existingSyncData.syncData && existingSyncData.syncData.lines) {
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Found matching existing sync data');
					loadedSyncBody = existingSyncData.syncData;
				}
			} catch (e) {
				console.warn('[SyncDataCreator] Failed to load existing sync data:', e);
			}
		}
		if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return false;

		const text = extractLyricsText(result.synced || result.unsynced);
		if (loadedSyncBody) {
			const normalizedLoadedSyncBody = normalizeLoadedSyncCreatorBodyForLyrics(loadedSyncBody, text);
			if (normalizedLoadedSyncBody !== loadedSyncBody) {
				window.__ivLyricsDebugLog?.('[SyncDataCreator] Trimmed leading sync-data source lines for current lyrics');
			}
			loadedSyncBody = sanitizeSyncCreatorSyncData(
				normalizedLoadedSyncBody,
				getSyncCreatorFlatLyricsCharsFromText(text)
			);
			if (loadedSyncBody) {
				setSyncData(loadedSyncBody);
				Toast.success(I18n.t('syncCreator.loadedExistingSyncData') || 'Loaded existing sync data');
			}
		}
		if (text.trim().length > 0) {
			const existingHasParallel = Array.isArray(loadedSyncBody?.lines)
				&& loadedSyncBody.lines.some(line => Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1);
			const detectedParallel = detectSyncCreatorParallelVocalHints(text);
			if (!existingHasParallel && detectedParallel) {
				setPendingMultiVocalDecision({
					text,
					preview: text.split('\n').find(line => SYNC_CREATOR_PARALLEL_HINT_REGEX.test(line.trim())) || ''
				});
				setError(null);
				return true;
			}
			const shouldUseMultiVocalMode = existingHasParallel;
			setMultiVocalMode(shouldUseMultiVocalMode);
			setActiveParallelPartId(shouldUseMultiVocalMode ? '' : 'full');
			setLyricsText(text);
			setError(null);
		} else {
			setPendingMultiVocalDecision(null);
			setMultiVocalMode(false);
			setError(I18n.t('syncCreator.noLyrics'));
		}
		return true;
	}, [
		albumName,
		artistName,
		extractLyricsText,
		isCurrentSyncCreatorSourceChange,
		setProviderValue,
		setSelectedLrclibSourceValue,
		trackId,
		trackIsrc,
		trackName
	]);

	const resolveMultiVocalDecision = useCallback((useMultiVocalMode) => {
		if (!pendingMultiVocalDecision) return;
		setPendingMultiVocalDecision(null);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setMultiVocalMode(useMultiVocalMode);
		setActiveParallelPartId(useMultiVocalMode ? '' : 'full');
		setLyricsText(pendingMultiVocalDecision.text);
		setError(null);
	}, [pendingMultiVocalDecision]);

	const previewLrclibCandidate = useMemo(() => {
		if (!lrclibCandidates.length) return null;
		return lrclibCandidates.find(candidate => candidate.candidateKey === previewLrclibCandidateKey)
			|| lrclibCandidates.find(candidate => candidate.candidateKey === selectedLrclibCandidateKey)
			|| lrclibCandidates[0]
			|| null;
	}, [lrclibCandidates, previewLrclibCandidateKey, selectedLrclibCandidateKey]);

	const applySelectedLrclibCandidate = useCallback(async (candidateKey) => {
		const candidate = lrclibCandidates.find(item => item.candidateKey === candidateKey);
		if (!candidate) return;

		const sourceChangeRequestId = beginSyncCreatorSourceChange();
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setCurrentLineIndex(0);
		setMultiVocalMode(false);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setPendingMultiVocalDecision(null);
		setActiveParallelPartId('full');
		setMode('idle');

		try {
			const syntheticResult = buildSyntheticLrclibResult(candidate);
			const applied = await applyLoadedLyricsResult(syntheticResult, SYNC_CREATOR_SOURCE_ADDON_ID, sourceChangeRequestId);
			if (!applied || !isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			setSelectedLrclibCandidateKey(candidate.candidateKey);
			setSelectedLrclibSourceValue(syntheticResult.lrclibSource || buildLrclibSyncSource(candidate));
			setPreviewLrclibCandidateKey(candidate.candidateKey);
		} catch (e) {
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			console.error('[SyncDataCreator] Failed to apply LRCLIB candidate:', e);
			setError(I18n.t('syncCreator.loadError'));
		}

		if (isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) setIsLoading(false);
	}, [
		applyLoadedLyricsResult,
		beginSyncCreatorSourceChange,
		buildLrclibSyncSource,
		buildSyntheticLrclibResult,
		isCurrentSyncCreatorSourceChange,
		lrclibCandidates,
		setSelectedLrclibSourceValue
	]);

	const buildLrclibIdCandidate = useCallback((candidate, requestedId) => {
		if (!candidate) return null;
		const preferredLyricsSource = candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : 'unknown');
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
		const durationMs = Number(
			trackInfo?.duration?.milliseconds
			|| Spicetify.Player?.data?.item?.duration?.milliseconds
			|| 0
		);
		const trackDurationSec = durationMs > 0 ? durationMs / 1000 : 0;

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
	}, [artistName, getLrclibCandidateText, getSyncCreatorLyricsFingerprint, trackInfo, trackName]);

	const buildLrclibSearchCandidate = useCallback((candidate, index, sourceLabel = 'manual') => {
		const requestedId = candidate?.id ?? `manual-${index}`;
		const baseCandidate = buildLrclibIdCandidate(candidate, requestedId);
		if (!baseCandidate) return null;
		const previewText = baseCandidate.previewText || getLrclibCandidateText(baseCandidate);
		return {
			...baseCandidate,
			candidateKey: `${sourceLabel}:${index}:${candidate?.id ?? requestedId}:${getSyncCreatorLyricsFingerprint(previewText)}`,
			searchSource: sourceLabel,
			isSelectedByDefault: index === 0
		};
	}, [buildLrclibIdCandidate, getLrclibCandidateText, getSyncCreatorLyricsFingerprint]);

	const loadLrclibById = useCallback(async () => {
		const lrclibId = String(lrclibIdInput || '').trim();
		if (!/^\d+$/.test(lrclibId)) {
			Toast.error(I18n.t('syncCreator.lrclibIdInvalid') || 'Enter a valid LRCLIB ID.');
			return;
		}

		const sourceChangeRequestId = beginSyncCreatorSourceChange();
		setIsLoadingLrclibId(true);
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setCurrentLineIndex(0);
		setMultiVocalMode(false);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setPendingMultiVocalDecision(null);
		setActiveParallelPartId('full');
		setMode('idle');
		clearLrclibCandidateState();

		try {
			const response = await fetch(`https://lrclib.net/api/get/${encodeURIComponent(lrclibId)}`, {
				headers: {
					'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}`
				}
			});
			if (!response.ok) {
				throw new Error(`LRCLIB ${response.status}`);
			}

			const candidate = await response.json();
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			if (!candidate || (!candidate.syncedLyrics && !candidate.plainLyrics)) {
				throw new Error('No lyrics found');
			}

			const decoratedCandidate = buildLrclibIdCandidate(candidate, lrclibId);
			if (!decoratedCandidate || !getLrclibCandidateText(decoratedCandidate).trim()) {
				throw new Error('No lyrics found');
			}

			const syntheticResult = buildSyntheticLrclibResult(decoratedCandidate);
			setAddonId(SYNC_CREATOR_SOURCE_ADDON_ID);
			setProviderValue(SYNC_CREATOR_SOURCE_ADDON_ID);
			setLrclibCandidates([decoratedCandidate]);
			setSelectedLrclibCandidateKey(decoratedCandidate.candidateKey);
			setPreviewLrclibCandidateKey(decoratedCandidate.candidateKey);
			setLrclibSearchMeta({
				success: true,
				totalResults: 1,
				selectedCandidateKey: decoratedCandidate.candidateKey,
				selectedSource: 'id',
				searchMode: 'id',
				directLrclibId: lrclibId
			});
			setShowLrclibCandidates(true);
			const applied = await applyLoadedLyricsResult(syntheticResult, SYNC_CREATOR_SOURCE_ADDON_ID, sourceChangeRequestId);
			if (!applied || !isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			setSelectedLrclibSourceValue(syntheticResult.lrclibSource || buildLrclibSyncSource(decoratedCandidate));
			Toast.success(I18n.t('syncCreator.lrclibIdLoadSuccess') || 'Loaded lyrics from LRCLIB ID.');
		} catch (e) {
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			console.error('[SyncDataCreator] Failed to load LRCLIB ID:', e);
			setError(I18n.t('syncCreator.lrclibIdLoadError') || 'Failed to load lyrics from LRCLIB ID.');
			Toast.error((I18n.t('syncCreator.lrclibIdLoadError') || 'Failed to load lyrics from LRCLIB ID.') + ': ' + e.message);
		}

		if (isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) {
			setIsLoading(false);
			setIsLoadingLrclibId(false);
		}
	}, [
		applyLoadedLyricsResult,
		buildLrclibIdCandidate,
		buildLrclibSyncSource,
		buildSyntheticLrclibResult,
		beginSyncCreatorSourceChange,
		clearLrclibCandidateState,
		getLrclibCandidateText,
		isCurrentSyncCreatorSourceChange,
		lrclibIdInput,
		setProviderValue,
		setSelectedLrclibSourceValue
	]);

	const searchLrclibByQuery = useCallback(async () => {
		const query = String(lrclibSearchQuery || '').trim();
		if (!query) {
			Toast.error(I18n.t('syncCreator.lrclibSearchQueryRequired') || 'Enter a LRCLIB search query.');
			return;
		}

		setIsSearchingLrclib(true);
		setError(null);
		try {
			const params = new URLSearchParams({ q: query });
			const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
				headers: {
					'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}`
				}
			});
			if (!response.ok) {
				throw new Error(`LRCLIB ${response.status}`);
			}

			const body = await response.json();
			const candidates = (Array.isArray(body) ? body : [])
				.map((candidate, index) => buildLrclibSearchCandidate(candidate, index, 'manual'))
				.filter(candidate => candidate && getLrclibCandidateText(candidate).trim().length > 0);
			setLrclibCandidates(candidates);
			setPreviewLrclibCandidateKey(candidates[0]?.candidateKey || '');
			setSelectedLrclibCandidateKey(prev => (
				candidates.some(candidate => candidate.candidateKey === prev) ? prev : ''
			));
			setLrclibSearchMeta({
				success: candidates.length > 0,
				totalResults: candidates.length,
				selectedCandidateKey: candidates[0]?.candidateKey || null,
				selectedSource: 'manual',
				searchMode: 'manual',
				manualQuery: query,
				error: candidates.length > 0 ? null : (I18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')
			});
			setShowLrclibCandidates(true);
		} catch (e) {
			console.error('[SyncDataCreator] Failed to search LRCLIB:', e);
			setLrclibCandidates([]);
			setPreviewLrclibCandidateKey('');
			setLrclibSearchMeta({
				success: false,
				totalResults: 0,
				selectedCandidateKey: null,
				selectedSource: 'manual',
				searchMode: 'manual',
				manualQuery: query,
				error: (I18n.t('syncCreator.lrclibSearchError') || 'Failed to search LRCLIB') + ': ' + e.message
			});
			setShowLrclibCandidates(true);
		}
		setIsSearchingLrclib(false);
	}, [buildLrclibSearchCandidate, getLrclibCandidateText, lrclibSearchQuery]);

	// 가사를 줄 단위로 파싱
	// NFC 정규화를 적용하여 결합 문자(NFD)를 합성 문자로 변환
	// 예: "e" + 결합 액센트 -> "é" (1개 코드포인트)
	const lyricsLines = useMemo(() => {
		if (!lyricsText) return [];
		return lyricsText.split('\n')
			.filter(line => line.trim().length > 0)
			.map(line => line.normalize('NFC'));
	}, [lyricsText]);
	const lyricsFullTextChars = useMemo(
		() => getSyncCreatorFlatLyricsCharsFromLines(lyricsLines),
		[lyricsLines]
	);

	const totalChars = useMemo(() => {
		// NFC 정규화된 lyricsLines를 사용하므로 Array.from()이 정확한 문자 수를 반환
		return lyricsLines.reduce((sum, line) => sum + Array.from(line).length, 0);
	}, [lyricsLines]);

	const syncedChars = useMemo(() => {
		if (!syncData || !syncData.lines) return 0;
		return syncData.lines.reduce((sum, line) => sum + (line.chars?.length || 0), 0);
	}, [syncData]);

	const lineCharOffsets = useMemo(() => {
		const offsets = [];
		let total = 0;
		lyricsLines.forEach((line) => {
			offsets.push(total);
			total += Array.from(line).length;
		});
		return offsets;
	}, [lyricsLines]);
	const lineIndexByStart = useMemo(() => {
		const map = new Map();
		lineCharOffsets.forEach((start, index) => map.set(start, index));
		return map;
	}, [lineCharOffsets]);
	const sessionTrackKey = trackId || trackIsrc || trackUri || '';
	const sessionLyricsFingerprint = useMemo(() => (
		syncCreatorDraftStore?.createLyricsFingerprint?.(lyricsText)
			|| getSyncCreatorLyricsFingerprintFromText(lyricsText)
	), [lyricsText, syncCreatorDraftStore]);
	const activeSessionDraftKey = useMemo(() => {
		if (!syncCreatorDraftStore || !sessionTrackKey || !lyricsText || (!provider && !addonId)) return '';
		return syncCreatorDraftStore.createDraftKey({
			trackKey: sessionTrackKey,
			provider,
			addonId,
			lyricsFingerprint: sessionLyricsFingerprint,
			lrclibId: selectedLrclibSource?.lrclibId ?? ''
		});
	}, [
		addonId,
		lyricsText,
		provider,
		selectedLrclibSource?.lrclibId,
		sessionLyricsFingerprint,
		sessionTrackKey,
		syncCreatorDraftStore
	]);
	activeSessionDraftKeyRef.current = activeSessionDraftKey;

	const currentLineStart = lineCharOffsets[currentLineIndex] ?? 0;
	const currentBaseLineChars = useMemo(() => {
		if (currentLineIndex < 0 || currentLineIndex >= lyricsLines.length) return [];
		return Array.from(lyricsLines[currentLineIndex]);
	}, [lyricsLines, currentLineIndex]);
	const currentExistingLineData = useMemo(() => {
		if (!Array.isArray(syncData?.lines)) return null;
		return syncData.lines.find(line => line.start === currentLineStart) || null;
	}, [syncData, currentLineStart]);
	const getLineEndAtIndex = useCallback((index) => {
		if (index < 0 || index >= lyricsLines.length) return -1;
		const lineStart = lineCharOffsets[index];
		const lineChars = Array.from(lyricsLines[index] || '');
		return Number.isInteger(lineStart) && lineChars.length > 0
			? lineStart + lineChars.length - 1
			: -1;
	}, [lineCharOffsets, lyricsLines]);
	const normalizeMergedLineDraftStarts = useCallback((value) => {
		const rawStarts = Array.isArray(value)
			? value
			: Number.isInteger(Number(value))
				? [Number(value)]
				: [];
		return [...new Set(rawStarts
			.map(start => Number(start))
			.filter(start => Number.isInteger(start)))]
			.sort((a, b) => a - b)
			.slice(0, SYNC_CREATOR_MAX_MERGED_LINES - 1);
	}, []);
	const lineHasParallelRangeOverlapping = useCallback((line, lineStart, lineEnd) => (
		Array.isArray(line?.parallel?.parts)
		&& line.parallel.parts.some(part =>
			Array.isArray(part?.ranges)
			&& part.ranges.some((range) => {
				const rangeStart = Number(range?.start);
				const rangeEnd = Number(range?.end);
				return Number.isInteger(rangeStart)
					&& Number.isInteger(rangeEnd)
					&& rangeStart <= lineEnd
					&& rangeEnd >= lineStart;
			})
		)
	), []);
	const getMergedLineIndexesForStart = useCallback((startIndex, linesByStartOverride = null) => {
		if (startIndex < 0 || startIndex >= lyricsLines.length) return [];
		const lineStart = lineCharOffsets[startIndex];
		if (!Number.isInteger(lineStart)) return [startIndex];

		const getIndexesFromMergedStarts = (mergedStarts) => {
			const indexes = [startIndex];
			for (let index = startIndex + 1; index < lyricsLines.length && indexes.length < SYNC_CREATOR_MAX_MERGED_LINES; index++) {
				const nextStart = lineCharOffsets[index];
				if (mergedStarts.includes(nextStart)) {
					indexes.push(index);
					continue;
				}
				break;
			}
			return indexes;
		};

		const draftStarts = normalizeMergedLineDraftStarts(mergedLineDrafts[lineStart]);
		if (draftStarts.length > 0) return getIndexesFromMergedStarts(draftStarts);

		const linesByStart = linesByStartOverride
			|| new Map((Array.isArray(syncData?.lines) ? syncData.lines : []).map(line => [line.start, line]));
		const lineData = linesByStart.get(lineStart);
		if (!lineData) return [startIndex];

		const persistedMergedStarts = normalizeMergedLineDraftStarts(lineData.mergedLineContinuationStarts);
		if (persistedMergedStarts.length > 0) {
			const indexes = getIndexesFromMergedStarts(persistedMergedStarts);
			if (indexes.length > 1) return indexes;
		}

		if (!Array.isArray(lineData.parallel?.parts)) return [startIndex];

		const indexes = [startIndex];
		for (let index = startIndex + 1; index < lyricsLines.length && indexes.length < SYNC_CREATOR_MAX_MERGED_LINES; index++) {
			const nextStart = lineCharOffsets[index];
			const nextEnd = getLineEndAtIndex(index);
			if (!Number.isInteger(nextStart) || nextEnd < nextStart || Number(lineData.end) < nextEnd) break;
			if (!lineHasParallelRangeOverlapping(lineData, nextStart, nextEnd)) break;
			indexes.push(index);
		}
		return indexes;
	}, [
		getLineEndAtIndex,
		lineCharOffsets,
		lineHasParallelRangeOverlapping,
		lyricsLines.length,
		mergedLineDrafts,
		normalizeMergedLineDraftStarts,
		syncData
	]);
	const findMergedOwnerLineIndex = useCallback((index, linesByStartOverride = null) => {
		if (index <= 0 || index >= lyricsLines.length) return -1;
		const minIndex = Math.max(0, index - SYNC_CREATOR_MAX_MERGED_LINES + 1);
		for (let ownerIndex = index - 1; ownerIndex >= minIndex; ownerIndex--) {
			const mergedIndexes = getMergedLineIndexesForStart(ownerIndex, linesByStartOverride);
			if (mergedIndexes.includes(index)) return ownerIndex;
		}
		return -1;
	}, [getMergedLineIndexesForStart, lyricsLines.length]);
	const currentMergedLineIndexes = useMemo(
		() => getMergedLineIndexesForStart(currentLineIndex),
		[getMergedLineIndexesForStart, currentLineIndex]
	);
	const currentLineMergedWithNext = currentMergedLineIndexes.length > 1;
	const isLineCoveredByMergedPrevious = useCallback((index, linesByStartOverride = null) => {
		return findMergedOwnerLineIndex(index, linesByStartOverride) >= 0;
	}, [findMergedOwnerLineIndex]);
	const currentLineCoveredByPrevious = useMemo(
		() => isLineCoveredByMergedPrevious(currentLineIndex),
		[isLineCoveredByMergedPrevious, currentLineIndex]
	);
	const findNavigableLineIndex = useCallback((fromIndex, direction) => {
		const step = direction < 0 ? -1 : 1;
		for (let index = fromIndex + step; index >= 0 && index < lyricsLines.length; index += step) {
			if (!isLineCoveredByMergedPrevious(index)) return index;
		}
		return -1;
	}, [lyricsLines.length, isLineCoveredByMergedPrevious]);
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
		return currentMergedLineIndexes.flatMap(index => Array.from(lyricsLines[index] || ''));
	}, [currentBaseLineChars, currentLineMergedWithNext, currentMergedLineIndexes, lyricsLines]);
	const getAutoMergeSplitPointsForLine = useCallback((lineStart) => {
		const startIndex = lineCharOffsets.indexOf(lineStart);
		if (startIndex < 0) return [];
		const mergedIndexes = getMergedLineIndexesForStart(startIndex);
		if (mergedIndexes.length <= 1) return [];

		const splitPoints = [];
		let offset = 0;
		for (let index = 0; index < mergedIndexes.length - 1; index++) {
			offset += Array.from(lyricsLines[mergedIndexes[index]] || '').length;
			if (offset > 0) splitPoints.push(offset);
		}
		return splitPoints;
	}, [getMergedLineIndexesForStart, lineCharOffsets, lyricsLines]);
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
	const canMergeCurrentLineWithNext = !currentLineCoveredByPrevious
		&& currentMergedLineIndexes.length < SYNC_CREATOR_MAX_MERGED_LINES
		&& currentNextMergeLineIndex < lyricsLines.length;
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
		const persistedRanges = (Array.isArray(syncData?.lines) ? syncData.lines : [])
			.filter(line => Number(line?.end) >= currentLineStart && Number(line?.start) <= currentLineEnd)
			.flatMap(line => Array.isArray(line?.styleRanges) ? line.styleRanges : []);
		const source = hasDraft ? lineStyleDrafts[currentLineStart] : persistedRanges;
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
		return selectSyncCreatorParallelTemplate(lineData?.parallel, textTemplate, {
			hasManualDraft: splitState.hasManualDraft,
			isMergedWithNext
		});
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
	const currentParallelParts = currentParallelData?.parts || [];
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
	const textEffectsDisabled = window.CONFIG?.visual?.['karaoke-text-effects'] === false;
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
	const showMissingMetaToast = useCallback(() => {
		Toast.error(I18n.t('syncCreator.multiVocalMetaRequired') || 'Select SPEAKER and text effect for the current vocal first.');
	}, []);
	const advanceAfterCompletedTarget = useCallback((lineData) => {
		const nextPartId = getIncompleteParallelPartId(lineData);
		if (nextPartId) {
			setActiveParallelPartId(nextPartId);
			recordingCharIndexRef.current = -1;
			setRecordingCharIndex(-1);
			clearRecordingLock();
			charTimesRef.current = [];
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
			return;
		}

		const nextIndex = findNavigableLineIndex(currentLineIndex, 1);
		if (nextIndex >= 0) {
			clearRecordingLock();
			setCurrentLineIndex(nextIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [getIncompleteParallelPartId, currentLineIndex, findNavigableLineIndex, clearRecordingLock]);
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
	const getCurrentSyncTargetSavedChars = useCallback(() => {
		const expectedLength = currentLineChars.length;
		if (!expectedLength) return [];

		let savedChars = null;
		if (activeParallelPart) {
			if (hasReusableSyncCreatorParallelChars(activeParallelPart, activeParallelPart)) {
				savedChars = activeParallelPart.chars;
			} else {
				const savedPart = currentExistingLineData?.parallel?.parts?.find(part => part.id === activeParallelTargetId);
				if (hasReusableSyncCreatorParallelChars(activeParallelPart, savedPart)) savedChars = savedPart.chars;
			}
		} else if (Array.isArray(currentExistingLineData?.chars)) {
			savedChars = currentExistingLineData.chars;
		}

		if (!Array.isArray(savedChars)) return new Array(expectedLength).fill(null);
		return Array.from({ length: expectedLength }, (_, index) => {
			const time = Number(savedChars[index]);
			return Number.isFinite(time) ? time : null;
		});
	}, [activeParallelPart, activeParallelTargetId, currentExistingLineData, currentLineChars.length]);
	const getActiveRecordingLockIndex = useCallback(() => {
		const lockIndex = recordingLockIndexRef.current;
		if (!Number.isInteger(lockIndex) || lockIndex < 0 || currentLineChars.length === 0) return -1;
		return Math.min(lockIndex, currentLineChars.length - 1);
	}, [currentLineChars.length]);
	const buildLockedCharTimes = useCallback((lockIndex = getActiveRecordingLockIndex()) => {
		const nextCharTimes = new Array(currentLineChars.length).fill(null);
		const safeLockIndex = Number.isInteger(lockIndex)
			? Math.min(lockIndex, currentLineChars.length - 1)
			: -1;
		if (safeLockIndex < 0) return nextCharTimes;

		const savedChars = getCurrentSyncTargetSavedChars();
		for (let i = 0; i <= safeLockIndex; i++) {
			nextCharTimes[i] = savedChars[i];
		}
		return nextCharTimes;
	}, [currentLineChars.length, getActiveRecordingLockIndex, getCurrentSyncTargetSavedChars]);
	const currentLineText = currentLineChars.join('');
	const currentLineDirection = useMemo(
		() => getSyncCreatorTextDirection(currentLineText),
		[currentLineText]
	);
	const isCurrentLineRtl = currentLineDirection === 'rtl';
	const useCurrentLineTextRun = useMemo(
		() => hasSyncCreatorRtlText(currentLineText),
		[currentLineText]
	);
	const currentLineCodeUnitOffsets = useMemo(
		() => getSyncCreatorCodeUnitOffsets(currentLineChars),
		[currentLineChars]
	);

	const currentLineSyllableSegments = useMemo(
		() => buildLineSyllableSegments(currentLineChars),
		[currentLineChars]
	);

	const lyricsLanguage = useMemo(() => {
		if (!lyricsLines.length) return null;
		const selectedOrDetected = String(Utils?.getDetectedLanguage?.() || '').trim();
		if (selectedOrDetected && selectedOrDetected !== 'auto') return selectedOrDetected;

		const lyricObjects = lyricsLines.map(text => ({ text }));
		const detected = window.LyricsService?.detectLanguage?.(lyricObjects)
			|| Utils?.detectLanguage?.(lyricObjects)
			|| null;

		if (detected) return detected;
		return SYNC_CREATOR_JAPANESE_KANA_REGEX.test(`${lyricsLines.join('\n')} ${trackName} ${artistName}`) ? 'ja' : null;
	}, [lyricsLines, trackName, artistName]);
	const characterPronunciationTargetLanguage = getSyncCreatorPronunciationTargetLanguage(
		characterPronunciationTargetMode
	);
	const handleCharacterPronunciationTargetModeChange = useCallback((nextMode) => {
		const normalizedMode = normalizeSyncCreatorPronunciationTargetMode(nextMode);
		localStorage.setItem(SYNC_CREATOR_PRONUNCIATION_TARGET_STORAGE_KEY, normalizedMode);
		setCharacterPronunciationTargetMode(normalizedMode);
	}, []);
	const characterPronunciationCacheOptions = useMemo(() => ({
		trackKey: sessionTrackKey,
		lyricsFingerprint: sessionLyricsFingerprint,
		sourceLang: lyricsLanguage || 'auto',
		targetLang: characterPronunciationTargetLanguage
	}), [
		characterPronunciationTargetLanguage,
		lyricsLanguage,
		sessionLyricsFingerprint,
		sessionTrackKey
	]);
	const readCachedCharacterPronunciation = useCallback(async () => {
		if (
			!lyricsLines.length
			|| typeof syncCreatorDraftStore?.getCharacterPronunciationCache !== 'function'
		) return null;

		try {
			const cached = await syncCreatorDraftStore.getCharacterPronunciationCache(
				characterPronunciationCacheOptions
			);
			return isSyncCreatorCharacterPronunciationCompatible(cached, lyricsLines)
				? cached
				: null;
		} catch (error) {
			console.warn('[SyncDataCreator] Failed to load cached character pronunciation:', error);
			return null;
		}
	}, [characterPronunciationCacheOptions, lyricsLines, syncCreatorDraftStore]);

	useEffect(() => {
		const cacheRequestId = ++characterPronunciationCacheRequestRef.current;
		const previousGenerationRequestId = characterPronunciationGenerationRequestRef.current;
		characterPronunciationGenerationRequestRef.current = previousGenerationRequestId + 1;
		if (
			previousGenerationRequestId > 0
			&& characterPronunciationProgressOwnerRef.current === previousGenerationRequestId
		) {
			characterPronunciationProgressOwnerRef.current = 0;
			Toast.dismissProgress?.();
		}
		setCharacterPronunciations(null);
		setShowCharacterPronunciations(false);
		setIsGeneratingCharacterPronunciations(false);
		setCharacterPronunciationProgress(null);

		let cancelled = false;
		readCachedCharacterPronunciation().then((cached) => {
			if (
				cancelled
				|| cacheRequestId !== characterPronunciationCacheRequestRef.current
				|| !cached
			) return;
			setCharacterPronunciations(cached);
			setShowCharacterPronunciations(true);
		});

		return () => {
			cancelled = true;
			if (characterPronunciationCacheRequestRef.current === cacheRequestId) {
				characterPronunciationCacheRequestRef.current += 1;
			}
		};
	}, [readCachedCharacterPronunciation]);
	const currentGranularityRanges = useMemo(() => (
		getSyncCreatorGranularityRanges(currentLineChars, syncGranularity, lyricsLanguage || undefined)
	), [currentLineChars, syncGranularity, lyricsLanguage]);
	const currentWordBoundaryStartIndexes = useMemo(() => new Set(
		syncGranularity === 'word'
			? currentGranularityRanges.slice(1).map(range => range.start)
			: []
	), [currentGranularityRanges, syncGranularity]);
	const getGranularityRangeForIndex = useCallback((index) => (
		currentGranularityRanges.find(range => index >= range.start && index <= range.end) || null
	), [currentGranularityRanges]);
	const getGranularityEndIndex = useCallback((index) => (
		getGranularityRangeForIndex(index)?.end ?? index
	), [getGranularityRangeForIndex]);
	const shouldShowSyncCreatorFurigana = useMemo(() => {
		if (lyricsLanguage !== 'ja') return false;
		if (!lyricsLines.some(line => SYNC_CREATOR_KANJI_REGEX.test(line))) return false;
		return typeof window.FuriganaConverter?.convertToFurigana === 'function';
	}, [lyricsLanguage, lyricsLines, furiganaRevision]);
	const getSyncCreatorFuriganaMap = useCallback((lineText) => {
		if (!shouldShowSyncCreatorFurigana || !lineText || !SYNC_CREATOR_KANJI_REGEX.test(lineText)) {
			return new Map();
		}

		try {
			const converted = window.FuriganaConverter.convertToFurigana(lineText);
			if (!converted || converted === lineText || !converted.includes('<ruby>')) {
				return new Map();
			}
			return Utils?.parseFuriganaMapping?.(converted) || new Map();
		} catch (e) {
			return new Map();
		}
	}, [shouldShowSyncCreatorFurigana, furiganaRevision]);
	const getSyncCreatorFuriganaReact = useCallback((lineText) => {
		if (!shouldShowSyncCreatorFurigana || !lineText || !SYNC_CREATOR_KANJI_REGEX.test(lineText)) {
			return lineText;
		}

		try {
			const converted = window.FuriganaConverter.convertToFurigana(lineText);
			if (!converted || converted === lineText || !converted.includes('<ruby>')) {
				return lineText;
			}
			return Utils?.rubyTextToReact?.(converted) || lineText;
		} catch (e) {
			return lineText;
		}
	}, [shouldShowSyncCreatorFurigana, furiganaRevision]);
	const currentLineFuriganaMap = useMemo(
		() => getSyncCreatorFuriganaMap(currentLineText),
		[getSyncCreatorFuriganaMap, currentLineText]
	);
	const hasCurrentLineFurigana = currentLineFuriganaMap.size > 0;
	const currentLineCharacterPronunciationData = useMemo(() => {
		if (!showCharacterPronunciations || !Array.isArray(characterPronunciations?.lines)) {
			return null;
		}

		return characterPronunciations.lines.find(line => Number(line?.index) === currentLineIndex)
			|| characterPronunciations.lines[currentLineIndex]
			|| null;
	}, [showCharacterPronunciations, characterPronunciations, currentLineIndex]);
	const currentLinePronunciationUnits = useMemo(
		() => activeParallelPart ? [] : normalizeSyncCreatorPronunciationUnits(currentLineCharacterPronunciationData, currentLineChars),
		[activeParallelPart, currentLineCharacterPronunciationData, currentLineChars]
	);
	const currentLineEffectiveSyllableSegments = useMemo(() => {
		if (currentLinePronunciationUnits.length > 0) {
			return currentLinePronunciationUnits.map(unit => ({
				start: unit.start,
				end: unit.end
			}));
		}
		return currentLineSyllableSegments;
	}, [currentLinePronunciationUnits, currentLineSyllableSegments]);
	const currentLineCharacterPronunciationMap = useMemo(() => {
		const lineData = currentLineCharacterPronunciationData;
		if (!Array.isArray(lineData?.chars)) {
			return new Map();
		}

		const partIndexMap = activeParallelPart
			? new Map(currentLineCharRefs.map((ref, displayIndex) => [ref.localIndex, displayIndex]))
			: null;
		const map = new Map();
		lineData.chars.forEach((item, fallbackIndex) => {
			const sourceIndex = Number.isInteger(Number(item?.i)) ? Number(item.i) : fallbackIndex;
			const index = partIndexMap ? partIndexMap.get(sourceIndex) : sourceIndex;
			const pronunciation = typeof item?.pronunciation === 'string' ? item.pronunciation.trim() : '';
			if (pronunciation && Number.isInteger(index)) {
				map.set(index, pronunciation);
			}
		});
		return map;
	}, [activeParallelPart, currentLineCharacterPronunciationData, currentLineCharRefs]);
	const hasCurrentLineCharacterPronunciation = currentLineCharacterPronunciationMap.size > 0 || currentLinePronunciationUnits.length > 0;
	const usePrimaryCharacterPronunciation = isCharacterPronunciationPrimary && hasCurrentLineCharacterPronunciation;
	const currentLineRenderedPronunciationUnits = useMemo(() => {
		if (currentLinePronunciationUnits.length > 0) {
			return currentLinePronunciationUnits;
		}
		return buildSyncCreatorVisualPronunciationUnits(currentLineChars, currentLineCharacterPronunciationMap);
	}, [
		currentLinePronunciationUnits,
		currentLineChars,
		currentLineCharacterPronunciationMap
	]);
	const currentLineRenderedPronunciationUnitByStart = useMemo(() => {
		const map = new Map();
		currentLineRenderedPronunciationUnits.forEach(unit => map.set(unit.start, unit));
		return map;
	}, [currentLineRenderedPronunciationUnits]);
	const currentLineRenderedPronunciationCoveredIndexes = useMemo(() => {
		const set = new Set();
		currentLineRenderedPronunciationUnits.forEach(unit => {
			for (let i = unit.start + 1; i <= unit.end; i++) {
				set.add(i);
			}
		});
		return set;
	}, [currentLineRenderedPronunciationUnits]);
	const useFixedPrimaryCharacterCells = usePrimaryCharacterPronunciation
		&& currentLineRenderedPronunciationUnits.length === 0
		&& /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(currentLineText);
	const characterPronunciationProgressInfo = useMemo(
		() => getSyncCreatorCharacterPronunciationProgressInfo(characterPronunciationProgress),
		[characterPronunciationProgress]
	);

	const completedLines = useMemo(() => {
		if (!syncData || !syncData.lines) return 0;
		if (multiVocalMode) {
			const linesByStart = new Map(syncData.lines.map(line => [line.start, line]));
			return lyricsLines.reduce((count, lineText, index) => {
				if (isLineCoveredByMergedPrevious(index, linesByStart)) {
					const ownerIndex = findMergedOwnerLineIndex(index, linesByStart);
					const previousLine = ownerIndex >= 0 ? linesByStart.get(lineCharOffsets[ownerIndex]) : null;
					const previousParts = Array.isArray(previousLine?.parallel?.parts) ? previousLine.parallel.parts : [];
					const previousComplete = previousParts.length > 1 && previousParts.every(part =>
						Array.isArray(part.chars)
						&& part.chars.length === countRangeChars(part.ranges)
						&& (normalizeSyncCreatorSpeaker(part.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER)
						&& (normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND)
					);
					return count + (previousComplete ? 1 : 0);
				}
				const lineStart = lineCharOffsets[index];
				const lineData = linesByStart.get(lineStart);
				if (!lineData) return count;
				const mergedIndexes = getMergedLineIndexesForStart(index, linesByStart);
				const isMergedWithNext = mergedIndexes.length > 1;
				const templateChars = isMergedWithNext
					? mergedIndexes.flatMap(lineIndex => Array.from(lyricsLines[lineIndex] || ''))
					: Array.from(lineText || '');
				const template = getParallelTemplateForLineData(lineData, templateChars, lineStart, isMergedWithNext);
				const resolvedParallel = mergeSyncCreatorParallelTemplate(template, lineData);
				if (resolvedParallel?.parts?.length > 1) {
					const isComplete = resolvedParallel.parts.every(part => {
						return hasReusableSyncCreatorParallelChars(part, part)
							&& (normalizeSyncCreatorSpeaker(part.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER)
							&& (normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND);
					});
					return count + (isComplete ? 1 : 0);
				}
				return count + ((normalizeSyncCreatorSpeaker(lineData.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER) && (normalizeSyncCreatorKind(lineData.kind) || SYNC_CREATOR_DEFAULT_KIND) ? 1 : 0);
			}, 0);
		}
		return syncData.lines.length;
	}, [syncData, multiVocalMode, lyricsLines, lineCharOffsets, getParallelTemplateForLineData, isLineCoveredByMergedPrevious, findMergedOwnerLineIndex, getMergedLineIndexesForStart]);

	// 현재 줄이 싱크되어 있는지
	const isCurrentLineSynced = useMemo(() => {
		if (currentLineCoveredByPrevious) return true;
		if (!syncData || !syncData.lines) return false;
		const lineStart = lineCharOffsets[currentLineIndex];
		const line = syncData.lines.find(l => l.start === lineStart);
		if (!line) return false;
		if (activeParallelPart) {
			if (hasReusableSyncCreatorParallelChars(activeParallelPart, activeParallelPart)) return true;
			const part = line.parallel?.parts?.find(item => item.id === activeParallelPart.id);
			return hasReusableSyncCreatorParallelChars(activeParallelPart, part);
		}
		return true;
	}, [currentLineCoveredByPrevious, syncData, lineCharOffsets, currentLineIndex, activeParallelPart, currentLineChars.length]);

	// Visibility tracking for robust lock handling
	const isVisibleRef = useRef(false);

	useEffect(() => {
		const handleFuriganaReady = () => setFuriganaRevision(value => value + 1);

		window.addEventListener('furigana-ready', handleFuriganaReady);
		if (typeof window.FuriganaConverter?.init === 'function' && !window.FuriganaConverter?.isAvailable?.()) {
			window.FuriganaConverter.init().then(handleFuriganaReady).catch(() => {});
		}

		return () => window.removeEventListener('furigana-ready', handleFuriganaReady);
	}, []);

	const handleCharacterPronunciationToggle = useCallback(async (options = {}) => {
		const forceRegenerate = options?.forceRegenerate === true;
		if (
			!forceRegenerate
			&&
			characterPronunciations
			&& isSyncCreatorCharacterPronunciationCompatible(characterPronunciations, lyricsLines)
		) {
			setShowCharacterPronunciations(value => !value);
			return;
		}

		if (!lyricsLines.length) {
			return;
		}

		if (!forceRegenerate) {
			const cachedPronunciation = await readCachedCharacterPronunciation();
			if (cachedPronunciation) {
				setCharacterPronunciations(cachedPronunciation);
				setShowCharacterPronunciations(true);
				return;
			}
		}

		if (typeof window.AIAddonManager?.generateCharacterPronunciation !== 'function') {
			Toast.error(I18n.t('syncCreator.characterPronunciationNoProvider') || 'No AI provider supports character-level pronunciation.');
			return;
		}

		if (options?.skipConsent !== true) {
			characterPronunciationConsentForceRef.current = forceRegenerate;
			setShowCharacterPronunciationConsent(true);
			return;
		}
		characterPronunciationConsentForceRef.current = false;

		const generationRequestId = ++characterPronunciationGenerationRequestRef.current;
		characterPronunciationProgressOwnerRef.current = generationRequestId;
		setIsGeneratingCharacterPronunciations(true);
		setCharacterPronunciationProgress({
			phase: 'prepared',
			total: 0,
			current: 0,
			completed: 0,
			remaining: 0,
			percent: 0
		});
		Toast.progress?.(
			I18n.t('syncCreator.characterPronunciationProgressPreparing') || 'Preparing pronunciation generation...',
			0
		);

		try {
			const handleProgress = (progress) => {
				if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;
				const nextProgress = progress || null;
				setCharacterPronunciationProgress(nextProgress);
				const progressInfo = getSyncCreatorCharacterPronunciationProgressInfo(nextProgress);
				if (progressInfo) {
					Toast.progress?.(progressInfo.label, progressInfo.percent);
				}
			};
			const result = await window.AIAddonManager.generateCharacterPronunciation({
				trackId,
				title: trackName,
				artist: artistName,
				lines: lyricsLines,
				sourceLang: characterPronunciationCacheOptions.sourceLang,
				lang: characterPronunciationCacheOptions.targetLang,
				onProgress: handleProgress
			});
			if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;
			if (!isSyncCreatorCharacterPronunciationCompatible(result, lyricsLines)) {
				throw new Error('Generated character pronunciation does not match the current lyrics.');
			}
			const hasAnyPronunciation = hasSyncCreatorCharacterPronunciation(result);

			setCharacterPronunciations(result);
			setShowCharacterPronunciations(true);
			if (typeof syncCreatorDraftStore?.setCharacterPronunciationCache === 'function') {
				try {
					await syncCreatorDraftStore.setCharacterPronunciationCache(
						characterPronunciationCacheOptions,
						result
					);
				} catch (cacheError) {
					console.warn('[SyncDataCreator] Failed to cache character pronunciation:', cacheError);
				}
			}
			if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;

			if (hasAnyPronunciation) {
				Toast.success(I18n.t('syncCreator.characterPronunciationGenerated') || 'Generated AI character pronunciation.');
			} else {
				Toast.warning(I18n.t('syncCreator.characterPronunciationEmpty') || 'Generated character pronunciation is empty.');
			}
		} catch (e) {
			if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;
			console.error('[SyncDataCreator] Character pronunciation generation failed:', e);
			Toast.error((I18n.t('syncCreator.characterPronunciationError') || 'Failed to generate character pronunciation') + ': ' + (e?.message || e));
		} finally {
			if (generationRequestId === characterPronunciationGenerationRequestRef.current) {
				characterPronunciationProgressOwnerRef.current = 0;
				setIsGeneratingCharacterPronunciations(false);
				setCharacterPronunciationProgress(null);
				Toast.dismissProgress?.();
			}
		}
	}, [
		artistName,
		characterPronunciationCacheOptions,
		characterPronunciations,
		lyricsLines,
		readCachedCharacterPronunciation,
		syncCreatorDraftStore,
		trackId,
		trackName
	]);

	// Visibility Observer
	useEffect(() => {
		if (!containerRef.current) return;

		const observer = new IntersectionObserver(([entry]) => {
			isVisibleRef.current = entry.isIntersecting;
			preventNextTrackRef.current = entry.isIntersecting;
			// console.log("[SyncDataCreator] Visibility changed:", entry.isIntersecting);
		}, { threshold: 0 });

		observer.observe(containerRef.current);

		return () => observer.disconnect();
	}, []);

	// 다음 곡 방지 - 싱크 생성기가 보일 때만 활성화
	useEffect(() => {
		// 초기 마운트/업데이트 시 visibility 상태 동기화
		preventNextTrackRef.current = isVisibleRef.current;

		const handleSongChange = () => {
			// 화면에 보이지 않으면 동작하지 않음
			if (!isVisibleRef.current) return;
			// preventNextTrackRef가 false여도 동작하지 않음 (이중 체크)
			if (!preventNextTrackRef.current) return;

			const currentTrackUri = Spicetify.Player?.data?.item?.uri;
			if (currentTrackUri && currentTrackUri !== trackUri) {
				Spicetify.Player.playUri(trackUri);
			}
		};

		const handleProgress = () => {
			// 화면에 보이지 않으면 동작하지 않음
			if (!isVisibleRef.current) return;
			if (!preventNextTrackRef.current) return;

			const duration = Spicetify.Player?.data?.item?.duration?.milliseconds || 0;
			const progress = Spicetify.Player.getProgress();
			if (duration > 0 && progress >= duration - 250) {
				Spicetify.Player.seek(0);
			}
		};

		const progressInterval = setInterval(handleProgress, 200);
		Spicetify.Player.addEventListener('songchange', handleSongChange);

		return () => {
			// 언마운트 시 해제 (단, 숨김 상태일 뿐이면 observer가 false로 설정함)
			preventNextTrackRef.current = false;
			clearInterval(progressInterval);
			Spicetify.Player.removeEventListener('songchange', handleSongChange);
		};
	}, [trackUri]);

	// 새 sync-data의 원본 가사는 LRCLIB에서만 불러온다. 이미 등록된 다른
	// 제공자의 sync-data를 재생하는 경로와는 별개인 제작 전용 제한이다.
	const loadLyrics = useCallback(async () => {
		const sourceChangeRequestId = beginSyncCreatorSourceChange();
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setAddonId(SYNC_CREATOR_SOURCE_ADDON_ID);
		setProviderValue('');
		setCurrentLineIndex(0);
		setMultiVocalMode(false);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setPendingMultiVocalDecision(null);
		setActiveParallelPartId('full');
		setMode('idle');
		clearLrclibCandidateState();

		try {
			const firstArtist = trackInfo?.artists?.[0]?.name ||
				Spicetify.Player?.data?.item?.artists?.[0]?.name ||
				artistName.split(',')[0].trim();

			let result = null;
			const info = {
				uri: trackInfo?.uri || Spicetify.Player?.data?.item?.uri,
				title: trackName,
				name: trackName,
				artist: firstArtist,
				album: trackInfo?.album?.name || Spicetify.Player?.data?.item?.album?.name || '',
				duration: Spicetify.Player?.data?.item?.duration?.milliseconds || 0
			};
			const lrclibAddon = window.LyricsAddonManager?.getAddon?.(SYNC_CREATOR_SOURCE_ADDON_ID);
			window.__ivLyricsDebugLog?.('[SyncDataCreator] Trying fixed provider:', SYNC_CREATOR_SOURCE_ADDON_ID);

			if (typeof lrclibAddon?.searchCandidates === 'function') {
				const searchResult = await lrclibAddon.searchCandidates(info);
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
				if (!searchResult?.success) {
					throw new Error(searchResult?.error || 'No lyrics found');
				}

				const candidates = Array.isArray(searchResult.candidates) ? searchResult.candidates : [];
				const selectedCandidate = candidates.find(candidate => candidate.candidateKey === searchResult.selectedCandidateKey)
					|| candidates[0]
					|| null;
				if (!selectedCandidate) throw new Error('No ranked LRCLIB candidates');

				setLrclibCandidates(candidates);
				setSelectedLrclibCandidateKey(selectedCandidate.candidateKey);
				setPreviewLrclibCandidateKey(selectedCandidate.candidateKey);
				setLrclibSearchMeta(searchResult);
				setShowLrclibCandidates(true);
				result = buildSyntheticLrclibResult(selectedCandidate);
			} else if (window.LyricsAddonManager?.getLyricsFrom) {
				result = await window.LyricsAddonManager.getLyricsFrom(SYNC_CREATOR_SOURCE_ADDON_ID, info);
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			} else if (typeof Providers !== 'undefined' && Providers[SYNC_CREATOR_SOURCE_ADDON_ID]) {
				result = await Providers[SYNC_CREATOR_SOURCE_ADDON_ID](info);
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			} else {
				throw new Error('LRCLIB provider is unavailable');
			}

			if (result?.error) throw new Error(result.error);

			if (result && (result.synced || result.unsynced)) {
				await applyLoadedLyricsResult(result, SYNC_CREATOR_SOURCE_ADDON_ID, sourceChangeRequestId);
			} else {
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
				setError(I18n.t('syncCreator.noLyrics'));
			}
		} catch (e) {
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			console.error('[SyncDataCreator] Load lyrics error:', e);
			setError(I18n.t('syncCreator.loadError'));
		}

		if (isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) setIsLoading(false);
	}, [
		albumName,
		applyLoadedLyricsResult,
		artistName,
		beginSyncCreatorSourceChange,
		buildSyntheticLrclibResult,
		clearLrclibCandidateState,
		isCurrentSyncCreatorSourceChange,
		setProviderValue,
		trackInfo,
		trackName
	]);



	// 제작기에 진입하면 '다시 로드' 버튼과 같은 LRCLIB 로드 흐름을 한 번 실행한다.
	// ref 가드는 callback 의존성이 갱신되더라도 같은 화면에서 중복 요청하지 않도록 한다.
	useEffect(() => {
		if (hasAutoLoadedLyricsRef.current) return;
		hasAutoLoadedLyricsRef.current = true;
		void loadLyrics();
	}, [loadLyrics]);

	// 재생 위치 업데이트 + 미리보기 자동 줄 이동
	useEffect(() => {
		let lastCommittedPosition = -1;

		const updatePosition = () => {
			const pos = Number(Spicetify.Player?.getProgress?.() || 0);
			if (!Number.isFinite(pos)) return;
			const commitThreshold = mode === 'record'
				? SYNC_CREATOR_RECORD_POSITION_COMMIT_THRESHOLD_MS
				: SYNC_CREATOR_POSITION_COMMIT_THRESHOLD_MS;

			if (
				lastCommittedPosition < 0
				|| Math.abs(pos - lastCommittedPosition) >= commitThreshold
				|| pos === 0
			) {
				lastCommittedPosition = pos;
				setPosition(pos);
			}

			if (mode === 'preview' && syncData && syncData.lines) {
				const currentTimeSec = pos / 1000;

				for (let i = syncData.lines.length - 1; i >= 0; i--) {
					const lineData = syncData.lines[i];
					if (lineData.chars && lineData.chars[0] <= currentTimeSec) {
						const lineIdx = lineIndexByStart.get(lineData.start) ?? -1;

						if (lineIdx >= 0 && lineIdx !== currentLineIndex) {
							setCurrentLineIndex(lineIdx);
							if (lyricsScrollRef.current) {
								lyricsScrollRef.current.scrollLeft = 0;
							}
						}
						break;
					}
				}
			}
		};

		updatePosition();
		const intervalMs = mode === 'preview'
			? SYNC_CREATOR_PREVIEW_POSITION_UPDATE_INTERVAL_MS
			: mode === 'record'
				? SYNC_CREATOR_RECORD_POSITION_UPDATE_INTERVAL_MS
				: SYNC_CREATOR_IDLE_POSITION_UPDATE_INTERVAL_MS;
		positionUpdateTimerRef.current = setInterval(updatePosition, intervalMs);

		return () => {
			if (positionUpdateTimerRef.current) {
				clearInterval(positionUpdateTimerRef.current);
				positionUpdateTimerRef.current = null;
			}
		};
	}, [mode, syncData, lineIndexByStart, currentLineIndex]);

	const autoScroll = useCallback((charIndex) => {
		if (!lyricsScrollRef.current || charIndex < 0) return;
		const scrollContainer = lyricsScrollRef.current;
		const numericIndex = Number(charIndex);
		if (!Number.isFinite(numericIndex)) return;
		const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
		if (maxScrollLeft <= 0) return;

		if (useCurrentLineTextRun && currentLineChars.length > 0) {
			const progress = Math.max(0, Math.min(1, numericIndex / Math.max(1, currentLineChars.length - 1)));
			scrollContainer.scrollLeft = isCurrentLineRtl ? -maxScrollLeft * progress : maxScrollLeft * progress;
			return;
		}

		let metrics = charScrollMetricsRef.current;
		if (!Array.isArray(metrics) || metrics.length !== charElementsRef.current.length || metrics.length === 0) {
			metrics = charElementsRef.current.map((el) => {
				if (!el) return null;
				const width = el.offsetWidth || 0;
				return {
					center: (el.offsetLeft || 0) + (width / 2)
				};
			});
			charScrollMetricsRef.current = metrics;
		}

		const lowerIndex = Math.max(0, Math.min(metrics.length - 1, Math.floor(numericIndex)));
		const upperIndex = Math.max(0, Math.min(metrics.length - 1, Math.ceil(numericIndex)));
		const lower = metrics[lowerIndex];
		const upper = metrics[upperIndex] || lower;
		if (!lower) return;

		const ratio = Math.max(0, Math.min(1, numericIndex - lowerIndex));
		const center = lower.center + (((upper?.center ?? lower.center) - lower.center) * ratio);
		const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, center - (scrollContainer.clientWidth / 2)));

		if (Math.abs(scrollContainer.scrollLeft - targetScrollLeft) > 1) {
			scrollContainer.scrollLeft = targetScrollLeft;
		}
	}, [currentLineChars.length, isCurrentLineRtl, useCurrentLineTextRun]);

	const applyRecordingProgressVisual = useCallback((nextIndex) => {
		const numericIndex = Number(nextIndex);
		const normalizedIndex = Number.isFinite(numericIndex) ? Math.max(-1, Math.floor(numericIndex)) : -1;
		const previousIndex = lastPaintedRecordingIndexRef.current;
		if (previousIndex === normalizedIndex) return;
		lastPaintedRecordingIndexRef.current = normalizedIndex;

		if (useCurrentLineTextRun && rtlTextRunRef.current) {
			const percent = currentLineChars.length > 0 && normalizedIndex >= 0
				? Math.max(0, Math.min(100, ((normalizedIndex + 1) / currentLineChars.length) * 100))
				: 0;
			rtlTextRunRef.current.style.backgroundImage = getSyncCreatorProgressGradient(
				currentLineDirection,
				percent,
				currentSpeakerTextColor,
				currentSpeakerMutedColor
			);
			autoScroll(normalizedIndex);
			return;
		}

		const completedIndex = normalizedIndex;

		const paintChar = (index) => {
			const el = charElementsRef.current[index];
			if (!el) return;
			const baseBackground = el.dataset.ivSyncCreatorBaseBackground || '';
			if (normalizedIndex >= 0 && index <= completedIndex) {
				el.style.background = SYNC_CREATOR_RECORDING_BACKGROUND;
				el.style.color = currentSpeakerTextColor;
			} else {
				el.style.background = baseBackground;
				el.style.color = el.dataset.ivSyncCreatorBaseColor || currentSpeakerTextColor;
			}
		};

		if (previousIndex < -1.5 || normalizedIndex < 0) {
			for (let index = 0; index < currentLineChars.length; index++) {
				paintChar(index);
			}
			autoScroll(normalizedIndex);
			return;
		}

		const previousCompletedIndex = previousIndex;
		const minChangedIndex = Math.max(0, Math.min(
			completedIndex,
			previousCompletedIndex
		));
		const maxChangedIndex = Math.min(currentLineChars.length - 1, Math.max(
			completedIndex,
			previousCompletedIndex
		));

		for (let index = minChangedIndex; index <= maxChangedIndex; index++) {
			paintChar(index);
		}

		autoScroll(normalizedIndex);
	}, [
		autoScroll,
		currentLineChars.length,
		currentLineDirection,
		currentSpeakerMutedColor,
		currentSpeakerTextColor,
		useCurrentLineTextRun
	]);

	const cancelRecordingProgressAnimation = useCallback(() => {
		if (recordingVisualFrameRef.current === null) return;
		if (typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(recordingVisualFrameRef.current);
		} else {
			clearTimeout(recordingVisualFrameRef.current);
		}
		recordingVisualFrameRef.current = null;
		recordingVisualFrameTimeRef.current = 0;
	}, []);

	const scheduleRecordingProgressAnimation = useCallback(() => {
		if (recordingVisualFrameRef.current !== null) return;

		const requestFrame = typeof requestAnimationFrame === 'function'
			? requestAnimationFrame
			: (callback) => setTimeout(() => callback(Date.now()), 16);

		const paint = (timestamp) => {
			recordingVisualFrameRef.current = null;

			const targetIndex = recordingVisualTargetIndexRef.current;
			let visualIndex = Number(recordingVisualIndexRef.current);
			if (!Number.isFinite(visualIndex)) {
				visualIndex = targetIndex >= 0 ? Math.max(-1, targetIndex - 1) : -1;
			}

			if (targetIndex < 0 || mode !== 'record') {
				visualIndex = targetIndex;
			} else {
				const previousTimestamp = recordingVisualFrameTimeRef.current || timestamp;
				const deltaMs = Math.min(50, Math.max(8, timestamp - previousTimestamp));
				const distance = targetIndex - visualIndex;
				const maxStep = Math.max(0.18, deltaMs / 22);

				if (Math.abs(distance) <= maxStep) {
					visualIndex = targetIndex;
				} else {
					visualIndex += Math.sign(distance) * maxStep;
				}
				recordingVisualFrameTimeRef.current = timestamp;
			}

			recordingVisualIndexRef.current = visualIndex;
			applyRecordingProgressVisual(visualIndex);

			if (mode === 'record' && Math.abs(recordingVisualTargetIndexRef.current - visualIndex) > 0.01) {
				recordingVisualFrameRef.current = requestFrame(paint);
			} else {
				recordingVisualFrameTimeRef.current = 0;
			}
		};

		recordingVisualFrameRef.current = requestFrame(paint);
	}, [applyRecordingProgressVisual, mode]);

	const setRecordingProgressIndex = useCallback((nextIndex, options = {}) => {
		const normalizedIndex = Number.isInteger(nextIndex) ? nextIndex : -1;
		recordingCharIndexRef.current = normalizedIndex;
		recordingVisualTargetIndexRef.current = normalizedIndex;
		if (mode === 'record') {
			lastPaintedPlaybackIndexRef.current = -2;
		}

		const shouldAnimate = mode === 'record'
			&& normalizedIndex >= 0
			&& options.animate !== false
			&& normalizedIndex >= recordingVisualIndexRef.current;

		if (shouldAnimate) {
			if (recordingVisualIndexRef.current < -0.5) {
				recordingVisualIndexRef.current = Math.max(-1, normalizedIndex - 1);
			}
			scheduleRecordingProgressAnimation();
		} else {
			cancelRecordingProgressAnimation();
			recordingVisualIndexRef.current = normalizedIndex;
			applyRecordingProgressVisual(normalizedIndex);
		}

		if (options.commitState !== false) {
			setRecordingCharIndex(normalizedIndex);
		}
	}, [applyRecordingProgressVisual, cancelRecordingProgressAnimation, mode, scheduleRecordingProgressAnimation]);

	useEffect(() => {
		cancelRecordingProgressAnimation();
		const nextVisualIndex = mode === 'record' ? recordingCharIndexRef.current : -1;
		recordingVisualTargetIndexRef.current = nextVisualIndex;
		recordingVisualIndexRef.current = nextVisualIndex;
		lastPaintedRecordingIndexRef.current = -2;
		applyRecordingProgressVisual(nextVisualIndex);
	}, [mode, currentLineIndex, activeParallelTargetId, lyricsText, applyRecordingProgressVisual, cancelRecordingProgressAnimation]);

	useEffect(() => () => {
		cancelRecordingProgressAnimation();
	}, [cancelRecordingProgressAnimation]);

	const cacheCharHitBoxes = useCallback(() => {
		if (useCurrentLineTextRun) {
			charHitBoxesRef.current = [];
			charScrollMetricsRef.current = [];
			return;
		}

		const nextHitBoxes = [];
		const nextScrollMetrics = [];
		for (let index = 0; index < charElementsRef.current.length; index++) {
			const el = charElementsRef.current[index];
			if (!el) {
				nextHitBoxes.push(null);
				nextScrollMetrics.push(null);
				continue;
			}
			const rect = el.getBoundingClientRect();
			nextHitBoxes.push({
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				centerX: rect.left + (rect.width / 2)
			});
			const width = el.offsetWidth || rect.width || 0;
			nextScrollMetrics.push({
				center: (el.offsetLeft || 0) + (width / 2)
			});
		}
		charHitBoxesRef.current = nextHitBoxes;
		charScrollMetricsRef.current = nextScrollMetrics;
	}, [useCurrentLineTextRun]);

	const getCharIndexFromPoint = useCallback((clientX, clientY) => {
		if (useCurrentLineTextRun && rtlTextRunRef.current && currentLineChars.length > 0) {
			const textEl = rtlTextRunRef.current;
			const resolveTextOffset = (node, offset) => {
				if (!node || !textEl.contains(node)) return null;
				if (node.nodeType === Node.TEXT_NODE) {
					let totalOffset = 0;
					const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
					let textNode = walker.nextNode();
					while (textNode) {
						if (textNode === node) {
							return totalOffset + offset;
						}
						totalOffset += textNode.nodeValue?.length || 0;
						textNode = walker.nextNode();
					}
				}
				return null;
			};

			let textOffset = null;
			if (typeof document.caretPositionFromPoint === 'function') {
				const caretPosition = document.caretPositionFromPoint(clientX, clientY);
				textOffset = resolveTextOffset(caretPosition?.offsetNode, caretPosition?.offset || 0);
			}
			if (textOffset === null && typeof document.caretRangeFromPoint === 'function') {
				const caretRange = document.caretRangeFromPoint(clientX, clientY);
				textOffset = resolveTextOffset(caretRange?.startContainer, caretRange?.startOffset || 0);
			}
			if (textOffset !== null) {
				return getSyncCreatorCharIndexFromCodeUnitOffset(currentLineCodeUnitOffsets, textOffset);
			}

			const rect = textEl.getBoundingClientRect();
			if (rect.width > 0) {
				const rawRatio = isCurrentLineRtl
					? (rect.right - clientX) / rect.width
					: (clientX - rect.left) / rect.width;
				const ratio = Math.max(0, Math.min(1, rawRatio));
				return Math.max(0, Math.min(currentLineChars.length - 1, Math.floor(ratio * currentLineChars.length)));
			}
		}

		const cachedHitBoxes = charHitBoxesRef.current;
		if (cachedHitBoxes.length > 0) {
			for (let i = 0; i < cachedHitBoxes.length; i++) {
				const rect = cachedHitBoxes[i];
				if (!rect) continue;
				if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
					return i;
				}
			}

			let firstRect = null;
			let firstIndex = -1;
			for (let i = 0; i < cachedHitBoxes.length; i++) {
				if (cachedHitBoxes[i]) {
					firstRect = cachedHitBoxes[i];
					firstIndex = i;
					break;
				}
			}
			let lastRect = null;
			let lastIndex = -1;
			for (let i = cachedHitBoxes.length - 1; i >= 0; i--) {
				if (cachedHitBoxes[i]) {
					lastRect = cachedHitBoxes[i];
					lastIndex = i;
					break;
				}
			}
			if (firstRect && lastRect) {
				if (clientX < firstRect.left) return firstIndex;
				if (clientX > lastRect.right) return lastIndex;

				let closestIndex = 0;
				let closestDist = Infinity;
				for (let i = 0; i < cachedHitBoxes.length; i++) {
					const rect = cachedHitBoxes[i];
					if (!rect) continue;
					const dist = Math.abs(clientX - rect.centerX);
					if (dist < closestDist) {
						closestDist = dist;
						closestIndex = i;
					}
				}
				return closestIndex;
			}
		}

		for (let i = 0; i < charElementsRef.current.length; i++) {
			const el = charElementsRef.current[i];
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
				return i;
			}
		}

		if (charElementsRef.current.length > 0) {
			const firstEl = charElementsRef.current[0];
			const lastEl = charElementsRef.current[charElementsRef.current.length - 1];
			if (firstEl && lastEl) {
				const firstRect = firstEl.getBoundingClientRect();
				const lastRect = lastEl.getBoundingClientRect();
				if (clientX < firstRect.left) return 0;
				if (clientX > lastRect.right) return charElementsRef.current.length - 1;

				let closestIndex = 0;
				let closestDist = Infinity;
				for (let i = 0; i < charElementsRef.current.length; i++) {
					const el = charElementsRef.current[i];
					if (!el) continue;
					const rect = el.getBoundingClientRect();
					const centerX = rect.left + rect.width / 2;
					const dist = Math.abs(clientX - centerX);
					if (dist < closestDist) {
						closestDist = dist;
						closestIndex = i;
					}
				}
				return closestIndex;
			}
		}
		return 0;
	}, [currentLineChars.length, currentLineCodeUnitOffsets, isCurrentLineRtl, useCurrentLineTextRun]);

	const handleDragStart = useCallback((charIndex, e) => {
		if (mode !== 'record' || currentLineIndex >= lyricsLines.length) return;
		e.preventDefault();
		e.stopPropagation();
		cacheCharHitBoxes();

		const currentTime = Spicetify.Player.getProgress() / 1000;
		const lockIndex = getActiveRecordingLockIndex();
		if (lockIndex >= currentLineChars.length - 1) {
			Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
			return;
		}
		const firstEditableIndex = Math.max(0, lockIndex + 1);
		const requestedStartIndex = Math.max(charIndex < 0 ? 0 : charIndex, firstEditableIndex);
		const startIndex = Math.max(
			firstEditableIndex,
			Math.min(currentLineChars.length - 1, getGranularityEndIndex(requestedStartIndex))
		);
		const hasKeyboardProgress = isKeyboardSyncingRef.current
			&& Array.isArray(charTimesRef.current)
			&& charTimesRef.current.length === currentLineChars.length;
		const nextCharTimes = hasKeyboardProgress
			? [...charTimesRef.current]
			: buildLockedCharTimes(lockIndex);

		if (hasKeyboardProgress) {
			if (pendingWordSyncRef.current && interpolationEnabledRef.current) {
				const { startIdx, endIdx, startTime } = pendingWordSyncRef.current;
				const wordEndTime = Math.max(startTime, currentTime - (WORD_GAP_MS / 1000));
				applyInterpolatedRangeToCharTimes(nextCharTimes, startIdx, endIdx, startTime, wordEndTime, smoothStepInterpolation);
			}
			if (pendingSyllableSyncRef.current && interpolationEnabledRef.current) {
				const { startIdx, endIdx, startTime } = pendingSyllableSyncRef.current;
				const endTime = Math.max(startTime, currentTime - EDGE_INTERPOLATION_GAP_SEC);
				applyInterpolatedRangeToCharTimes(nextCharTimes, startIdx, endIdx, startTime, endTime);
			}
			if (lockIndex >= 0) {
				const lockedCharTimes = buildLockedCharTimes(lockIndex);
				for (let i = 0; i <= lockIndex; i++) {
					nextCharTimes[i] = lockedCharTimes[i];
				}
			}
		}

		setDragStartTime(currentTime);
		setDragStartCharIndex(startIndex);
		setRecordingProgressIndex(startIndex, { commitState: false });
		setIsDragging(true);

		if (hasKeyboardProgress) {
			const lastRecordedIndex = getLastRecordedSyncIndex(nextCharTimes);
			if (startIndex <= lastRecordedIndex) {
				for (let i = firstEditableIndex; i < nextCharTimes.length; i++) {
					nextCharTimes[i] = null;
				}
				nextCharTimes[startIndex] = getSequentialSyncTime(currentTime, getPreviousRecordedSyncTime(nextCharTimes, startIndex));
			} else {
				let previousTime = getPreviousRecordedSyncTime(nextCharTimes, startIndex + 1);
				for (let i = lastRecordedIndex + 1; i <= startIndex; i++) {
					nextCharTimes[i] = getSequentialSyncTime(currentTime, previousTime);
					previousTime = nextCharTimes[i];
				}
			}
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			if (isKeyboardDraggingRef.current) {
				isKeyboardDraggingRef.current = false;
			}
			if (keyboardDragIntervalRef.current) {
				clearInterval(keyboardDragIntervalRef.current);
				keyboardDragIntervalRef.current = null;
			}
			if (keyboardDragWarmupTimerRef.current) {
				clearTimeout(keyboardDragWarmupTimerRef.current);
				keyboardDragWarmupTimerRef.current = null;
			}
		} else {
			let previousTime = getPreviousRecordedSyncTime(nextCharTimes, firstEditableIndex);
			for (let i = firstEditableIndex; i <= startIndex; i++) {
				nextCharTimes[i] = getSequentialSyncTime(currentTime, previousTime);
				previousTime = nextCharTimes[i];
			}
		}
		charTimesRef.current = nextCharTimes;
	}, [mode, currentLineIndex, lyricsLines.length, currentLineChars.length, setRecordingProgressIndex, cacheCharHitBoxes, getActiveRecordingLockIndex, buildLockedCharTimes, getGranularityEndIndex]);

	const handleDragMove = useCallback((charIndex, e) => {
		if (mode !== 'record' || !isDragging || dragStartTime === null) return;
		e.preventDefault();
		const currentTime = Spicetify.Player.getProgress() / 1000;
		const previousRecordingCharIndex = recordingCharIndexRef.current;

		// 마우스를 너무 위/아래로 움직였거나 영역을 벗어났을 때도 처리가 필요할 수 있음
		// 현재는 index 기반으로만 처리

		if (charIndex < 0) {
			// 영역 왼쪽 밖으로 나감 - 전체 취소 아님, 그냥 인덱스 0 처리?
			// 아니면 드래그 시작점보다 왼쪽으로 가면 그만큼 취소
			// 여기서는 -1이면 아무것도 안함
			return;
		}

		charIndex = Math.min(currentLineChars.length - 1, getGranularityEndIndex(charIndex));
		const lockIndex = getActiveRecordingLockIndex();
		const firstEditableIndex = Math.max(0, lockIndex + 1);
		if (charIndex < firstEditableIndex) {
			for (let i = firstEditableIndex; i <= previousRecordingCharIndex; i++) {
				charTimesRef.current[i] = null;
			}
			setRecordingProgressIndex(lockIndex, { commitState: false });
			return;
		}

		if (charIndex >= previousRecordingCharIndex) {
			// 정방향 진행
			for (let i = previousRecordingCharIndex + 1; i <= charIndex; i++) {
				if (!isFiniteSyncCreatorTime(charTimesRef.current[i])) {
					charTimesRef.current[i] = currentTime;
				}
			}
			setRecordingProgressIndex(charIndex, { commitState: false });
		} else {
			// 역방향 진행 (취소)
			// 현재 recordingCharIndex에서 charIndex+1 까지의 기록을 지움
			for (let i = Math.max(charIndex + 1, firstEditableIndex); i <= previousRecordingCharIndex; i++) {
				charTimesRef.current[i] = null;
			}
			setRecordingProgressIndex(Math.max(charIndex, lockIndex), { commitState: false });
		}
	}, [mode, isDragging, dragStartTime, currentLineChars.length, setRecordingProgressIndex, getActiveRecordingLockIndex, getGranularityEndIndex]);

	// Commit-time normalization keeps the client aligned with backend validation:
	// chars must be non-decreasing and a line must not start before the previous line ends.
	const normalizeCommittedLineChars = useCallback((
		rawChars,
		previousLineEndTime = -1,
		granularity = syncGranularity,
		sourceChars = currentLineChars
	) => {
		const normalizedGranularity = normalizeSyncCreatorGranularity(granularity);
		const collapsedChars = collapseSyncCreatorTimesByGranularity(
			rawChars,
			sourceChars,
			normalizedGranularity,
			lyricsLanguage || undefined
		);
		return normalizeSyncCreatorTimeSequence(
			collapsedChars,
			previousLineEndTime,
			normalizedGranularity
		);
	}, [syncGranularity, currentLineChars, lyricsLanguage]);

	const mergeCurrentLineWithNext = useCallback(() => {
		if (!canMergeCurrentLineWithNext) return;

		const currentStart = lineCharOffsets[currentLineIndex] ?? 0;
		const nextStart = lineCharOffsets[currentNextMergeLineIndex];
		const nextEnd = getLineEndAtIndex(currentNextMergeLineIndex);
		if (!Number.isInteger(currentStart) || !Number.isInteger(nextStart) || nextEnd < nextStart) return;
		claimSessionForLocalEditing();

		const nextMergedLineIndexes = [...currentMergedLineIndexes, currentNextMergeLineIndex]
			.filter((index, position, indexes) => indexes.indexOf(index) === position)
			.sort((a, b) => a - b)
			.slice(0, SYNC_CREATOR_MAX_MERGED_LINES);
		const mergedEnd = getLineEndAtIndex(nextMergedLineIndexes[nextMergedLineIndexes.length - 1]);
		const partIds = 'abcdefghijklmnopqrstuvwxyz'.split('');

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;

			const linesByStart = new Map(prev.lines.map(line => [line.start, line]));
			const currentLineData = linesByStart.get(currentStart);
			const previousLine = prev.lines.reduce((best, line) => {
				if (line.start >= currentStart || !Array.isArray(line.chars) || !line.chars.length) return best;
				return !best || line.start > best.start ? line : best;
			}, null);
			const previousLineEndTime = previousLine?.chars?.[previousLine.chars.length - 1] ?? -1;

			const getPartSnapshot = (lineIndex) => {
				const lineStart = lineCharOffsets[lineIndex];
				const lineEnd = getLineEndAtIndex(lineIndex);
				const lineChars = Array.from(lyricsLines[lineIndex] || '');
				if (!Number.isInteger(lineStart) || lineEnd < lineStart || lineChars.length === 0) return null;

				const directLine = linesByStart.get(lineStart);
				const existingPart = currentLineData?.parallel?.parts?.find(part =>
					Array.isArray(part?.ranges)
					&& part.ranges.some(range =>
						Number(range?.start) <= lineStart
						&& Number(range?.end) >= lineEnd
					)
				);
				const mergedOffsetStart = lineStart - currentStart;
				const mergedOffsetEnd = mergedOffsetStart + lineChars.length;
				const chars = Array.isArray(directLine?.chars) && directLine.chars.length === lineChars.length
					? directLine.chars
					: Array.isArray(existingPart?.chars) && existingPart.chars.length === lineChars.length
						? existingPart.chars
						: Array.isArray(currentLineData?.chars) && currentLineData.chars.length >= mergedOffsetEnd
							? currentLineData.chars.slice(mergedOffsetStart, mergedOffsetEnd)
							: null;
				if (!Array.isArray(chars) || chars.length !== lineChars.length) return null;

				const sourceSpeaker = directLine?.speaker || existingPart?.speaker || currentLineData?.speaker;
				const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					directLine?.['speaker-fallback'] || existingPart?.['speaker-fallback'] || currentLineData?.['speaker-fallback'],
					true,
					sourceSpeaker
				);
				return {
					start: lineStart,
					end: lineEnd,
					chars,
					granularity: normalizeSyncCreatorGranularity(
						directLine?.granularity || existingPart?.granularity || currentLineData?.granularity
					),
					speaker,
					...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {}),
					'speaker-color': sanitizeSyncCreatorSpeakerColor(
						speaker,
						directLine?.['speaker-color'] || existingPart?.['speaker-color'] || currentLineData?.['speaker-color'],
						true,
						speakerFallback
					),
					kind: normalizeSyncCreatorKind(directLine?.kind || existingPart?.kind || currentLineData?.kind) || SYNC_CREATOR_DEFAULT_KIND
				};
			};

			const snapshots = nextMergedLineIndexes.map(getPartSnapshot);
			const mergedLine = snapshots.every(Boolean)
				? {
					start: currentStart,
					end: mergedEnd,
					chars: normalizeSyncCreatorTimeSequence(
						snapshots.flatMap(snapshot => snapshot.chars),
						previousLineEndTime,
						'word'
					),
					// Parallel parts carry their own precise timing. Keep only one line-level
					// start mark instead of duplicating every character timestamp here.
					granularity: 'line',
					speaker: snapshots[0].speaker,
					...(snapshots[0]['speaker-fallback'] ? { 'speaker-fallback': snapshots[0]['speaker-fallback'] } : {}),
					...(snapshots[0]['speaker-color'] ? { 'speaker-color': snapshots[0]['speaker-color'] } : {}),
					kind: snapshots[0].kind,
					mergedLineContinuationStarts: nextMergedLineIndexes.slice(1).map(index => lineCharOffsets[index]),
					parallel: sanitizeSyncCreatorParallel({
						layout: 'stack',
						parts: snapshots.map((snapshot, index) => ({
							id: partIds[index] || `p${index + 1}`,
							role: index === 0 ? 'lead' : 'background',
							granularity: snapshot.granularity,
							speaker: snapshot.speaker,
							...(snapshot['speaker-fallback'] ? { 'speaker-fallback': snapshot['speaker-fallback'] } : {}),
							...(snapshot['speaker-color'] ? { 'speaker-color': snapshot['speaker-color'] } : {}),
							kind: snapshot.kind,
							ranges: [{ start: snapshot.start, end: snapshot.end }],
							join: [],
							chars: snapshot.chars
						}))
					})
				}
				: null;
			if (!mergedLine) return prev;

			const lines = prev.lines
				.filter(line => line.start < currentStart || line.start > mergedEnd);

			lines.push(mergedLine);

			lines.sort((a, b) => a.start - b.start);
			return lines.length > 0 ? {
				...prev,
				version: SYNC_CREATOR_SYNC_DATA_VERSION,
				lines
			} : null;
		});

		setMultiVocalMode(true);
		setActiveParallelPartId('a');
		setMergedLineDrafts(prev => ({
			...prev,
			[currentStart]: nextMergedLineIndexes.slice(1).map(index => lineCharOffsets[index])
		}));
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		Toast.success(I18n.t('syncCreator.mergedWithNextLine') || 'Merged with the next line as separate vocal parts.');
	}, [
		canMergeCurrentLineWithNext,
		claimSessionForLocalEditing,
		currentLineIndex,
		currentMergedLineIndexes,
		currentNextMergeLineIndex,
		getLineEndAtIndex,
		lineCharOffsets,
		lyricsLines,
		normalizeCommittedLineChars,
		setRecordingProgressIndex
	]);

	const commitCurrentLineSync = useCallback((rawChars, options = {}) => {
		if (multiVocalMode && !isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return null;
		}
		if (multiVocalMode && hasCurrentParallelParts && !activeParallelPart) {
			setActiveParallelPartId(currentParallelParts[0]?.id || 'full');
			Toast.error(I18n.t('syncCreator.selectVocalPartFirst') || 'Select the vocal part to sync first.');
			return null;
		}
		const lineStart = currentLineStart;
		const lineEnd = lineStart + currentFullLineChars.length - 1;
		const fullCharCount = currentFullLineChars.length;
		const nextLines = syncData?.lines
			? syncData.lines.map((line) => ({
				...line,
				chars: Array.isArray(line.chars) ? [...line.chars] : [],
				parallel: line.parallel ? sanitizeSyncCreatorParallel({
					...line.parallel,
					parts: Array.isArray(line.parallel.parts)
						? line.parallel.parts.map(part => ({
							...part,
							ranges: Array.isArray(part.ranges) ? part.ranges.map(range => ({ ...range })) : [],
							join: Array.isArray(part.join) ? [...part.join] : [],
							chars: Array.isArray(part.chars) ? [...part.chars] : undefined
						}))
						: []
				}) : undefined
			}))
			: [];
		const existingIndex = nextLines.findIndex((line) => line.start === lineStart);
		const existingLine = existingIndex >= 0 ? nextLines[existingIndex] : null;
		const previousLine = nextLines.reduce((best, line) => {
			if (line.start >= lineStart) return best;
			if (!best || line.start > best.start) return line;
			return best;
		}, null);
		const previousLineEndTime = previousLine?.chars?.[previousLine.chars.length - 1] ?? -1;
		const normalizedRawChars = normalizeCommittedLineChars(
			rawChars,
			previousLineEndTime,
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

			return normalizeSyncCreatorTimeSequence(fullChars, previousLineEndTime, 'word');
		};

		const fullLineChars = buildFullLineChars();
		let lineData = {
			...(existingLine || {}),
			start: lineStart,
			end: lineEnd,
			chars: fullLineChars.map((time) => roundSyncTime(time)),
			granularity: activeParallelPart
				? normalizeSyncCreatorGranularity(existingLine?.granularity)
				: syncGranularity
		};
		const leadMetaPart = currentParallelData?.parts?.find(part => part.role === 'lead') || currentParallelData?.parts?.[0] || activeParallelPart;
		const lineMetaDraft = lineMetaDrafts[lineStart] || {};
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

		if (activeParallelPart && currentParallelData) {
			const existingParts = Array.isArray(existingLine?.parallel?.parts) ? existingLine.parallel.parts : [];
			const parts = currentParallelData.parts
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
					const expectedChars = countRangeChars(part.ranges);
					const syncedChars = part.id === activeParallelPart.id
						? normalizedRawChars.map((time) => roundSyncTime(time))
						: (hasReusableSyncCreatorParallelChars(part, part)
							? part.chars
							: (hasReusableSyncCreatorParallelChars(part, existingPart) ? existingPart.chars : undefined));
					if (part.id === activeParallelPart.id && (!Array.isArray(syncedChars) || syncedChars.length !== expectedChars)) {
						return null;
					}
					const nextPart = {
						id: part.id,
						role: part.role,
						granularity: part.id === activeParallelPart.id
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
						ranges: part.ranges,
						join: part.join || []
					};
					if (Array.isArray(syncedChars) && syncedChars.length === expectedChars) {
						nextPart.chars = syncedChars;
					}
					return nextPart;
				})
				.filter(Boolean);

			if (parts.length > 0) {
				lineData.granularity = parts.length > 1
					? 'line'
					: normalizeSyncCreatorGranularity(parts[0]?.granularity || lineData.granularity);
				lineData.parallel = sanitizeSyncCreatorParallel({
					layout: currentParallelData.layout || 'stack',
					hiddenRanges: currentParallelData.hiddenRanges || [],
					parts
				});
			} else {
				delete lineData.parallel;
			}
		}

		const normalizedStyleRanges = normalizeSyncCreatorStyleRanges(currentLineStyleRanges, lineStart, lineEnd);
		if (normalizedStyleRanges.length > 0) {
			lineData.styleRanges = normalizedStyleRanges;
		} else {
			delete lineData.styleRanges;
		}

		lineData = repairSyncCreatorLineCharsFromParallel(lineData);

		if (existingIndex >= 0) {
			nextLines[existingIndex] = lineData;
		} else {
			nextLines.push(lineData);
		}

		nextLines.sort((a, b) => a.start - b.start);

		const committedLineIndex = nextLines.findIndex((line) => line.start === lineStart);
		const previousSortedLine = committedLineIndex > 0 ? nextLines[committedLineIndex - 1] : null;
		const previousSortedLineEndTime = previousSortedLine?.chars?.[previousSortedLine.chars.length - 1] ?? -1;
		const normalizedLineData = {
			...lineData,
			chars: normalizeSyncCreatorTimeSequence(
				lineData.chars,
				previousSortedLineEndTime,
				lineData.granularity
			)
		};
		const normalizedLastCharTime = normalizedLineData.chars[normalizedLineData.chars.length - 1];

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
		const updatedCommittedLineIndex = candidateLines.findIndex((line) => line.start === lineStart);

		const validLines = candidateLines.filter((line, index) => {
			if (index <= updatedCommittedLineIndex) return true;
			return !(line.chars && line.chars[0] < normalizedLastCharTime);
		});

		const nextSyncData = validLines.length > 0
			? { version: SYNC_CREATOR_SYNC_DATA_VERSION, lines: validLines }
			: null;
		setSyncData(nextSyncData);
		return normalizedLineData;
	}, [
		syncData,
		currentLineStart,
		currentFullLineChars.length,
		currentLineCharRefs,
		activeParallelPart,
		hasCurrentParallelParts,
		currentParallelData,
		currentParallelParts,
		currentLineMeta,
		currentLineStyleRanges,
		lineMetaDrafts,
		multiVocalMode,
		currentLineMergedWithNext,
		currentLineIndex,
		currentMergedLineIndexes,
		lyricsLines,
		activeParallelTargetId,
		isCurrentSyncTargetMetaComplete,
		showMissingMetaToast,
		normalizeCommittedLineChars,
		syncGranularity,
		currentLineChars
	]);

	const handleDragEnd = useCallback((e) => {
		const endCharIndex = recordingCharIndexRef.current;
		if (mode !== 'record' || !isDragging || dragStartTime === null || endCharIndex === -1) {
			setIsDragging(false);
			return;
		}

		e.preventDefault();

		// 드래그가 시작점보다 왼쪽에서 끝났으면 취소로 간주할 수도 있으나,
		// 여기서는 recordingCharIndex가 유효한 마지막 지점이므로 거기까지만 저장

		const endTime = Spicetify.Player.getProgress() / 1000;
		const charCount = currentLineChars.length;
		const lockIndex = getActiveRecordingLockIndex();
		if (lockIndex >= 0 && endCharIndex <= lockIndex) {
			setDragStartTime(null);
			setDragStartCharIndex(-1);
			setRecordingProgressIndex(lockIndex, { commitState: false });
			setIsDragging(false);
			charTimesRef.current = buildLockedCharTimes(lockIndex);
			charHitBoxesRef.current = [];
			charScrollMetricsRef.current = [];
			return;
		}

		// 유효성 체크: 만약 드래그 시작하자마자 바로 끝나거나 이상한 경우
		if (endCharIndex < dragStartCharIndex) {
			// 시작점보다 뒤로 가서 끝났으면 해당 부분은 싱크 안함 (혹은 이전 싱크 유지)
			// 여기서는 그냥 저장 진행 (지워진 상태로)
			// 만약 전체를 취소하고 싶다면 별도 처리가 필요하지만, 
			// UX상 왼쪽으로 가서 놓으면 그 부분은 싱크가 안 된 상태가 됨.
		}

		const chars = [];
		for (let i = 0; i < charCount; i++) {
			let time;
			if (isFiniteSyncCreatorTime(charTimesRef.current[i])) {
				time = charTimesRef.current[i];
			} else if (i <= endCharIndex) {
				// 중간에 빈 곳이 있으면 채움 (보간)
				const prevTime = chars[chars.length - 1] || dragStartTime;
				time = prevTime + 0.02;
			} else {
				// 끝부분 이후는 자동 채움 (보간)
				const remainingCount = charCount - endCharIndex - 1;
				const perCharDuration = 0.5 / Math.max(1, remainingCount);
				time = endTime + ((i - endCharIndex) * perCharDuration);
			}
			// 소수점 3자리로 반올림
			chars.push(Math.round(time * 1000) / 1000);
		}

		const isComplete = endCharIndex >= charCount - 1;
		const committedLine = commitCurrentLineSync(chars, { createCheckpoint: isComplete });
		if (!committedLine) {
			setDragStartTime(null);
			setDragStartCharIndex(-1);
			setRecordingProgressIndex(-1);
			setIsDragging(false);
			charTimesRef.current = [];
			charHitBoxesRef.current = [];
			charScrollMetricsRef.current = [];
			return;
		}

		if (isComplete) {
			advanceAfterCompletedTarget(committedLine);
		}

		clearRecordingLock();
		setDragStartTime(null);
		setDragStartCharIndex(-1);
		setRecordingProgressIndex(-1);
		setIsDragging(false);
		charTimesRef.current = [];
		charHitBoxesRef.current = [];
		charScrollMetricsRef.current = [];
	}, [mode, isDragging, dragStartTime, currentLineIndex, currentLineChars, lyricsLines.length, dragStartCharIndex, commitCurrentLineSync, advanceAfterCompletedTarget, setRecordingProgressIndex, getActiveRecordingLockIndex, buildLockedCharTimes, clearRecordingLock]);

	// 키보드 싱크 상태 ref (isDragging과 별개로 키보드용)
	const isKeyboardSyncingRef = useRef(false);
	const keyboardCharIndexRef = useRef(-1);

	// 드래그 키(/) 연속 입력을 위한 인터벌 ref
	const keyboardDragIntervalRef = useRef(null);
	const keyboardDragWarmupTimerRef = useRef(null);
	const isKeyboardDraggingRef = useRef(false);

	// 이전 라인 인덱스 추적 (라인 변경 감지용)
	const prevLineIndexRef = useRef(currentLineIndex);
	const prevKeyboardTargetRef = useRef(activeParallelTargetId);

	// 동적 보간 모드를 위한 ref
	// pendingWordSync: 이전 단어의 시작 시간과 인덱스 범위를 저장
	// 다음 단어가 탭되면 이전 단어의 글자들에 보간된 시간 적용
	const pendingWordSyncRef = useRef(null);
	const pendingSyllableSyncRef = useRef(null);
	// 단어 간 최소 간격 (ms) - 단어가 즉시 전환되지 않도록
	const WORD_GAP_MS = 80;
	// 단어 내 보간 활성화 여부
	const interpolationEnabledRef = useRef(true);

	const resetCurrentSyncInput = useCallback(() => {
		isKeyboardSyncingRef.current = false;
		keyboardCharIndexRef.current = -1;
		charTimesRef.current = [];
		pendingWordSyncRef.current = null;
		pendingSyllableSyncRef.current = null;
		clearRecordingLock();
		setDragStartTime(null);
		setDragStartCharIndex(-1);
		setRecordingProgressIndex(-1);
		setIsDragging(false);
		charHitBoxesRef.current = [];
		charScrollMetricsRef.current = [];
		if (keyboardDragIntervalRef.current) {
			clearInterval(keyboardDragIntervalRef.current);
			keyboardDragIntervalRef.current = null;
		}
		if (keyboardDragWarmupTimerRef.current) {
			clearTimeout(keyboardDragWarmupTimerRef.current);
			keyboardDragWarmupTimerRef.current = null;
		}
		isKeyboardDraggingRef.current = false;
	}, [setRecordingProgressIndex, clearRecordingLock]);

	const handleSyncGranularityChange = useCallback((nextValue) => {
		const nextGranularity = normalizeSyncCreatorGranularity(nextValue);
		if (nextGranularity === syncGranularity) return;
		claimSessionForLocalEditing();
		resetCurrentSyncInput();
		setSyncGranularity(nextGranularity);
	}, [claimSessionForLocalEditing, resetCurrentSyncInput, syncGranularity]);

	const handleCharacterContextMenu = useCallback((charIndex, e) => {
		e.preventDefault();
		e.stopPropagation();

		if (syncGranularity !== 'character' || mode !== 'record' || currentLineIndex >= lyricsLines.length || !currentLineChars.length) return;
		if (!isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return;
		}

		const safeIndex = Math.max(0, Math.min(charIndex, currentLineChars.length - 1));
		if (recordingLockIndexRef.current === safeIndex) {
			clearRecordingLock();
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			setDragStartTime(null);
			setDragStartCharIndex(-1);
			setRecordingProgressIndex(-1);
			setIsDragging(false);
			Toast.success(I18n.t('settings.syncLockCleared') || 'Sync lock cleared.');
			return;
		}

		if (safeIndex >= currentLineChars.length - 1) {
			Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
			return;
		}

		const savedChars = getCurrentSyncTargetSavedChars();
		const missingSavedIndex = savedChars.findIndex((time, index) => index <= safeIndex && !isFiniteSyncCreatorTime(time));
		if (missingSavedIndex >= 0) {
			Toast.error(I18n.t('settings.syncLockRequiresTiming') || 'Sync this line once before locking part of it.');
			return;
		}

		isKeyboardSyncingRef.current = false;
		keyboardCharIndexRef.current = safeIndex;
		pendingWordSyncRef.current = null;
		pendingSyllableSyncRef.current = null;
		isKeyboardDraggingRef.current = false;
		if (keyboardDragIntervalRef.current) {
			clearInterval(keyboardDragIntervalRef.current);
			keyboardDragIntervalRef.current = null;
		}
		if (keyboardDragWarmupTimerRef.current) {
			clearTimeout(keyboardDragWarmupTimerRef.current);
			keyboardDragWarmupTimerRef.current = null;
		}
		setRecordingLockIndexValue(safeIndex);
		charTimesRef.current = buildLockedCharTimes(safeIndex);
		setDragStartTime(null);
		setDragStartCharIndex(-1);
		// Keep the lock armed without treating the locked prefix as live input.
		// Playback can then animate the preserved timing up to the lock boundary,
		// and the next recording action continues the orange progress from there.
		setRecordingProgressIndex(-1, { animate: false, commitState: false });
		setIsDragging(false);
		Toast.success(I18n.t('settings.syncLockSet') || 'Locked timing up to the selected character.');
	}, [
		syncGranularity,
		mode,
		currentLineIndex,
		lyricsLines.length,
		currentLineChars.length,
		isCurrentSyncTargetMetaComplete,
		showMissingMetaToast,
		clearRecordingLock,
		getCurrentSyncTargetSavedChars,
		setRecordingLockIndexValue,
		buildLockedCharTimes,
		setRecordingProgressIndex
	]);

	useEffect(() => () => {
		if (keyboardDragIntervalRef.current) {
			clearInterval(keyboardDragIntervalRef.current);
			keyboardDragIntervalRef.current = null;
		}
		if (keyboardDragWarmupTimerRef.current) {
			clearTimeout(keyboardDragWarmupTimerRef.current);
			keyboardDragWarmupTimerRef.current = null;
		}
		isKeyboardDraggingRef.current = false;
	}, []);

	const selectParallelPart = useCallback((partId) => {
		if (!partId) return;
		if (activeParallelTargetId !== partId) {
			claimSessionForLocalEditing();
			resetCurrentSyncInput();
		}
		setActiveParallelPartId(partId);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [activeParallelTargetId, claimSessionForLocalEditing, resetCurrentSyncInput]);

	// 키보드 이벤트 리스너 등록
	useEffect(() => {
		// 라인이 변경되었는지 확인
		const lineChanged = prevLineIndexRef.current !== currentLineIndex;
		if (lineChanged) {
			prevLineIndexRef.current = currentLineIndex;
		}
		const targetChanged = prevKeyboardTargetRef.current !== activeParallelTargetId;
		if (targetChanged) {
			prevKeyboardTargetRef.current = activeParallelTargetId;
		}

		// record 모드가 아니거나 라인이 변경되면 키보드 싱크 상태 초기화
		const shouldReset = mode !== 'record' || lineChanged || targetChanged;
		if (shouldReset && recordingLockIndexRef.current >= 0) {
			clearRecordingLock();
		}
		if (shouldReset && (isKeyboardSyncingRef.current || isKeyboardDraggingRef.current)) {
			window.__ivLyricsDebugLog?.('[SyncDataCreator] Resetting keyboard sync state, mode:', mode, 'lineChanged:', lineChanged, 'targetChanged:', targetChanged);
			// 진행 중인 키보드 싱크 초기화
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null; // 보간 대기 상태도 초기화
			pendingSyllableSyncRef.current = null;
			setDragStartTime(null);
			setRecordingProgressIndex(-1);
			// 드래그 모드도 초기화
			if (isKeyboardDraggingRef.current) {
				isKeyboardDraggingRef.current = false;
				if (keyboardDragIntervalRef.current) {
					clearInterval(keyboardDragIntervalRef.current);
					keyboardDragIntervalRef.current = null;
				}
			}
			if (keyboardDragWarmupTimerRef.current) {
				clearTimeout(keyboardDragWarmupTimerRef.current);
				keyboardDragWarmupTimerRef.current = null;
			}
		}

		const finishKeyboardSync = () => {
			if (!isKeyboardSyncingRef.current) return;

			const endTime = Spicetify.Player.getProgress() / 1000;
			const endCharIndex = keyboardCharIndexRef.current;
			const charCount = currentLineChars.length;

			const chars = [];
			const startTime = charTimesRef.current[0] || endTime;
			for (let i = 0; i < charCount; i++) {
				let time;
				if (isFiniteSyncCreatorTime(charTimesRef.current[i])) {
					time = charTimesRef.current[i];
				} else if (i <= endCharIndex) {
					const prevTime = chars[chars.length - 1] || startTime;
					time = prevTime + 0.02;
				} else {
					const remainingCount = charCount - endCharIndex - 1;
					const perCharDuration = 0.5 / Math.max(1, remainingCount);
					time = endTime + ((i - endCharIndex) * perCharDuration);
				}
				chars.push(Math.round(time * 1000) / 1000);
			}

			const committedLine = commitCurrentLineSync(chars, { createCheckpoint: true });

			// 다음 라인으로 이동
			if (committedLine) {
				advanceAfterCompletedTarget(committedLine);
			}

			// 키보드 싱크 상태 초기화
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			clearRecordingLock();
			setDragStartTime(null);
			setRecordingProgressIndex(-1);
		};

		const syncWholeLine = (currentTime) => {
			const lockIndex = getActiveRecordingLockIndex();
			if (lockIndex >= 0) clearRecordingLock();
			const chars = new Array(currentLineChars.length).fill(roundSyncTime(currentTime));
			const committedLine = commitCurrentLineSync(chars, { createCheckpoint: true });
			if (committedLine) advanceAfterCompletedTarget(committedLine);
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			setDragStartTime(null);
			setRecordingProgressIndex(-1);
		};

		const handleKeyDown = (e) => {
			const normalizedHotkey = getNormalizedHotkeyFromEvent(e);
			const consumeKeyboardEvent = () => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			};
			const isSeekHotkey = normalizedHotkey === 'z' || normalizedHotkey === 'x';
			if (isSeekHotkey) {
				const target = e.target;
				if (
					target?.isContentEditable
					|| ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
					|| target?.closest?.('[role="listbox"], [role="menu"], [role="menuitem"], [aria-haspopup]')
				) return;

				consumeKeyboardEvent();
				const currentPos = Spicetify.Player.getProgress();
				if (normalizedHotkey === 'z') {
					Spicetify.Player.seek(Math.max(0, currentPos - 3000));
				} else {
					const duration = Spicetify.Player.getDuration();
					Spicetify.Player.seek(Math.min(duration, currentPos + 3000));
				}
				return;
			}

			const isDragHotkey = isSyncCreatorDragHotkeyEvent(e, normalizedHotkey);
			const shortcutBindings = getSyncCreatorShortcutBindings();
			const shortcutAction = Object.entries(shortcutBindings)
				.find(([, bindings]) => bindings.includes(normalizedHotkey))?.[0] || null;
			const staticHotkeys = new Set(['enter', 'backspace', 'space']);
			if (!shortcutAction && !isDragHotkey && !staticHotkeys.has(normalizedHotkey)) return;

			// record 모드가 아니면 처리하지 않음
			if (mode !== 'record') return;
			if (!isCurrentSyncTargetMetaComplete) {
				showMissingMetaToast();
				return;
			}

			window.__ivLyricsDebugLog?.('[SyncDataCreator] KeyDown:', e.key, 'normalized:', normalizedHotkey, 'mode:', mode, 'lineIndex:', currentLineIndex);

			if (currentLineIndex >= lyricsLines.length) return;
			if (!currentLineChars.length) return;
			const shouldAutoAdvanceBoundaryChars = readSyncCreatorBooleanSetting(SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY, true);

			// 한 글자 앞으로 진행하는 헬퍼 함수
			const advanceOneChar = (currentTime) => {
				if (!isKeyboardSyncingRef.current) {
					const lockIndex = getActiveRecordingLockIndex();
					if (lockIndex >= currentLineChars.length - 1) {
						Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
						return -1;
					}
					// 키보드 싱크 시작
					isKeyboardSyncingRef.current = true;
					let startIndex = Math.max(0, lockIndex + 1);
					charTimesRef.current = buildLockedCharTimes(lockIndex);
					pendingWordSyncRef.current = null;
					pendingSyllableSyncRef.current = null;
					charTimesRef.current[startIndex] = currentTime;

					// 첫 글자가 여는 괄호면 다음 글자까지 포함
					if (shouldAutoAdvanceBoundaryChars && isLeadingChar(currentLineChars, startIndex)) {
						while (startIndex + 1 < currentLineChars.length && isLeadingChar(currentLineChars, startIndex)) {
							startIndex++;
							charTimesRef.current[startIndex] = currentTime;
						}
					}

					// 다음 글자가 구두점/닫는괄호/공백이면 함께 처리
					if (shouldAutoAdvanceBoundaryChars) {
						while (startIndex + 1 < currentLineChars.length && isTrailingChar(currentLineChars, startIndex + 1)) {
							startIndex++;
							charTimesRef.current[startIndex] = currentTime;
						}
					}

					keyboardCharIndexRef.current = startIndex;
					setDragStartTime(currentTime);
					setRecordingProgressIndex(startIndex, { commitState: false });
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Started keyboard sync, chars:', currentLineChars.length, 'startIndex:', startIndex);
					return startIndex;
				} else {
					// 다음 글자로 진행
					const lockIndex = getActiveRecordingLockIndex();
					let nextIndex = Math.max(keyboardCharIndexRef.current + 1, lockIndex + 1);
					if (nextIndex < currentLineChars.length) {
						charTimesRef.current[nextIndex] = currentTime;

						// 현재 글자가 여는 괄호면 다음 글자까지 포함
						if (shouldAutoAdvanceBoundaryChars) {
							while (nextIndex + 1 < currentLineChars.length && isLeadingChar(currentLineChars, nextIndex)) {
								nextIndex++;
								charTimesRef.current[nextIndex] = currentTime;
							}
						}

						// 다음 글자가 구두점/닫는괄호/공백이면 함께 처리
						if (shouldAutoAdvanceBoundaryChars) {
							while (nextIndex + 1 < currentLineChars.length && isTrailingChar(currentLineChars, nextIndex + 1)) {
								nextIndex++;
								charTimesRef.current[nextIndex] = currentTime;
							}
						}

						keyboardCharIndexRef.current = nextIndex;
						setRecordingProgressIndex(nextIndex, { commitState: false });
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Advanced to char:', nextIndex);
					}

					// 마지막 글자면 라인 완료
					if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
						finishKeyboardSync();
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed');
						return -1; // 완료됨
					}
					return keyboardCharIndexRef.current;
				}
			};

			// 이전 단어에 보간 적용하는 헬퍼 함수
			const applyInterpolationToPendingWord = (nextWordStartTime) => {
				if (!pendingWordSyncRef.current || !interpolationEnabledRef.current) return;

				const { startIdx, endIdx, startTime } = pendingWordSyncRef.current;
				const charCount = endIdx - startIdx + 1;

				if (charCount <= 1) {
					// 한 글자 단어는 보간 불필요
					pendingWordSyncRef.current = null;
					return;
				}

				// 단어 간 최소 간격을 뺀 시간 내에서 보간
				const wordEndTime = nextWordStartTime - (WORD_GAP_MS / 1000);
				const duration = Math.max(0, wordEndTime - startTime);

				applyInterpolatedRangeToCharTimes(
					charTimesRef.current,
					startIdx,
					endIdx,
					startTime,
					startTime + duration,
					smoothStepInterpolation
				);

				window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to word:', startIdx, '-', endIdx, 'duration:', duration.toFixed(3));
				pendingWordSyncRef.current = null;
			};

			const applyInterpolationToPendingSyllable = (nextSyllableStartTime) => {
				if (!pendingSyllableSyncRef.current || !interpolationEnabledRef.current) return;

				const { startIdx, endIdx, startTime } = pendingSyllableSyncRef.current;
				const endTime = Math.max(startTime, nextSyllableStartTime - EDGE_INTERPOLATION_GAP_SEC);
				applyInterpolatedRangeToCharTimes(
					charTimesRef.current,
					startIdx,
					endIdx,
					startTime,
					endTime
				);

				window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to syllable:', startIdx, '-', endIdx, 'duration:', (endTime - startTime).toFixed(3));
				pendingSyllableSyncRef.current = null;
			};

			// 한 단어 앞으로 진행하는 헬퍼 함수
			const advanceOneWord = (currentTime) => {
				// 싱크가 시작되지 않은 경우: 첫 단어만 처리
				if (!isKeyboardSyncingRef.current) {
					const lockIndex = getActiveRecordingLockIndex();
					if (lockIndex >= currentLineChars.length - 1) {
						Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
						return;
					}
					isKeyboardSyncingRef.current = true;
					charTimesRef.current = buildLockedCharTimes(lockIndex);
					setDragStartTime(currentTime);

					let startIdx = Math.max(0, lockIndex + 1);
					const wordStartIdx = startIdx;
					charTimesRef.current[startIdx] = currentTime;

					// 첫 글자가 여는 괄호면 다음 글자까지 포함
					while (startIdx + 1 < currentLineChars.length && isLeadingChar(currentLineChars, startIdx)) {
						startIdx++;
						charTimesRef.current[startIdx] = currentTime;
					}

					// 첫 단어의 끝까지 진행 (단어 경계 만나면 멈춤)
					let endIdx = startIdx;
					while (endIdx + 1 < currentLineChars.length &&
						!isWordBoundary(currentLineChars, endIdx + 1) &&
						!isTrailingChar(currentLineChars, endIdx + 1)) {
						endIdx++;
						charTimesRef.current[endIdx] = currentTime;
					}

					// trailing 문자들(구두점 등) 포함
					while (endIdx + 1 < currentLineChars.length &&
						isTrailingChar(currentLineChars, endIdx + 1) &&
						!isWordBoundary(currentLineChars, endIdx + 1)) {
						endIdx++;
						charTimesRef.current[endIdx] = currentTime;
					}

					keyboardCharIndexRef.current = endIdx;
					setRecordingProgressIndex(endIdx, { commitState: false });

					window.__ivLyricsDebugLog?.('[SyncDataCreator] Word sync started, first word ends at:', endIdx);

					// 마지막 글자면 라인 완료 (보간 적용 후)
					if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
						// 첫 단어이자 마지막 단어인 경우에도 보간 적용
						if (interpolationEnabledRef.current && endIdx > wordStartIdx) {
							const duration = estimateWordInterpolationDuration(wordStartIdx, endIdx);
							applyInterpolatedRangeToCharTimes(charTimesRef.current, wordStartIdx, endIdx, currentTime, currentTime + duration, smoothStepInterpolation);
							window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to single word line');
						}
						finishKeyboardSync();
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by word');
					} else {
						// 보간을 위해 현재 단어 정보 저장 (보간 활성화 시)
						if (interpolationEnabledRef.current) {
							pendingWordSyncRef.current = {
								startIdx: wordStartIdx,
								endIdx: endIdx,
								startTime: currentTime
							};
						}
					}
					return;
				}

				// 이미 싱크 중인 경우: 이전 단어에 보간 적용 후 다음 단어로 진행
				applyInterpolationToPendingWord(currentTime);

				const lockIndex = getActiveRecordingLockIndex();
				const startIdx = Math.max(keyboardCharIndexRef.current, lockIndex);
				let endIdx = startIdx + 1;

				// 먼저 현재 공백들 건너뛰기
				while (endIdx < currentLineChars.length && isWordBoundary(currentLineChars, endIdx)) {
					// 공백에는 이전 단어 끝 시간 + 갭 적용
					charTimesRef.current[endIdx] = currentTime - (WORD_GAP_MS / 2000);
					endIdx++;
				}

				// 다음 단어의 시작 인덱스
				const nextWordStartIdx = endIdx;

				// 다음 단어 경계까지 진행
				while (endIdx < currentLineChars.length && !isWordBoundary(currentLineChars, endIdx) && !isTrailingChar(currentLineChars, endIdx)) {
					charTimesRef.current[endIdx] = currentTime;
					endIdx++;
				}

				// trailing 문자들도 함께 처리
				while (endIdx < currentLineChars.length && isTrailingChar(currentLineChars, endIdx) && !isWordBoundary(currentLineChars, endIdx)) {
					charTimesRef.current[endIdx] = currentTime;
					endIdx++;
				}

				// 최소 한 글자는 진행했는지 확인
				if (endIdx <= startIdx + 1) {
					endIdx = Math.min(startIdx + 1, currentLineChars.length - 1);
					charTimesRef.current[endIdx] = currentTime;
				}

				// endIdx는 마지막으로 처리된 글자의 다음 인덱스이므로 -1
				const finalEndIdx = endIdx - 1;
				keyboardCharIndexRef.current = Math.max(0, finalEndIdx);

				setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });

				// 보간을 위해 현재 단어 정보 저장
				if (interpolationEnabledRef.current && nextWordStartIdx < currentLineChars.length) {
					pendingWordSyncRef.current = {
						startIdx: nextWordStartIdx,
						endIdx: keyboardCharIndexRef.current,
						startTime: currentTime
					};
				}

				window.__ivLyricsDebugLog?.('[SyncDataCreator] Word advanced to char:', keyboardCharIndexRef.current);

				// 마지막 글자면 라인 완료
				if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
					// 마지막 단어에도 보간 적용 (현재 시간 기준으로 약간의 지속시간 부여)
					if (pendingWordSyncRef.current && interpolationEnabledRef.current) {
						const { startIdx, endIdx, startTime } = pendingWordSyncRef.current;
						const charCount = endIdx - startIdx + 1;
						if (charCount > 1) {
							// 마지막 단어는 시작 시간으로부터 글자 수에 비례한 짧은 지속시간 부여
							const duration = estimateWordInterpolationDuration(startIdx, endIdx);
							applyInterpolatedRangeToCharTimes(charTimesRef.current, startIdx, endIdx, startTime, startTime + duration, smoothStepInterpolation);
							window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to last word:', startIdx, '-', endIdx);
						}
					}
					pendingWordSyncRef.current = null;
					finishKeyboardSync();
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by word');
				}
			};

			// 한 단어 뒤로 취소하는 헬퍼 함수 (첫 글자도 취소 가능)
			const revertOneWord = () => {
				if (!isKeyboardSyncingRef.current || keyboardCharIndexRef.current < 0) return;
				const lockIndex = getActiveRecordingLockIndex();
				if (keyboardCharIndexRef.current <= lockIndex) return;

				// 보간 대기 중인 단어 취소
				pendingWordSyncRef.current = null;

				let targetIdx = keyboardCharIndexRef.current - 1;

				// trailing 문자들 건너뛰기
				while (targetIdx > lockIndex && isTrailingChar(currentLineChars, targetIdx)) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 단어 경계까지 뒤로 가기
				while (targetIdx > lockIndex && !isWordBoundary(currentLineChars, targetIdx)) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 공백들 건너뛰기
				while (targetIdx > lockIndex && isWordBoundary(currentLineChars, targetIdx)) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 현재 위치부터 targetIdx+1까지의 타임 null 처리
				for (let i = Math.max(targetIdx + 1, lockIndex + 1); i <= keyboardCharIndexRef.current; i++) {
					charTimesRef.current[i] = null;
				}

				keyboardCharIndexRef.current = Math.max(targetIdx, lockIndex);
				setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
				window.__ivLyricsDebugLog?.('[SyncDataCreator] Word reverted to char:', keyboardCharIndexRef.current);

				// 모든 글자 취소시 싱크 상태 초기화
				if (keyboardCharIndexRef.current <= lockIndex) {
					isKeyboardSyncingRef.current = false;
					setDragStartTime(null);
					window.__ivLyricsDebugLog?.('[SyncDataCreator] All chars reverted by word, sync reset');
				}
			};

			const advanceOneSelectedWord = (currentTime) => {
				const lockIndex = getActiveRecordingLockIndex();
				if (lockIndex >= currentLineChars.length - 1) {
					Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
					return -1;
				}
				if (!isKeyboardSyncingRef.current) {
					isKeyboardSyncingRef.current = true;
					charTimesRef.current = buildLockedCharTimes(lockIndex);
					setDragStartTime(currentTime);
					keyboardCharIndexRef.current = lockIndex;
				}
				const nextRange = currentGranularityRanges.find(range => range.end > keyboardCharIndexRef.current);
				if (!nextRange) {
					finishKeyboardSync();
					return -1;
				}
				const start = Math.max(lockIndex + 1, keyboardCharIndexRef.current + 1, nextRange.start);
				for (let index = start; index <= nextRange.end; index++) {
					charTimesRef.current[index] = currentTime;
				}
				keyboardCharIndexRef.current = nextRange.end;
				setRecordingProgressIndex(nextRange.end, { commitState: false });
				if (nextRange.end >= currentLineChars.length - 1) {
					finishKeyboardSync();
					return -1;
				}
				return nextRange.end;
			};

			const revertOneSelectedWord = () => {
				if (!isKeyboardSyncingRef.current || keyboardCharIndexRef.current < 0) return;
				const lockIndex = getActiveRecordingLockIndex();
				const currentRangeIndex = currentGranularityRanges.findIndex(range => (
					keyboardCharIndexRef.current >= range.start && keyboardCharIndexRef.current <= range.end
				));
				const currentRange = currentGranularityRanges[currentRangeIndex];
				if (!currentRange) return;
				for (let index = Math.max(lockIndex + 1, currentRange.start); index <= currentRange.end; index++) {
					charTimesRef.current[index] = null;
				}
				const previousRange = currentGranularityRanges[currentRangeIndex - 1];
				keyboardCharIndexRef.current = previousRange && previousRange.end > lockIndex
					? previousRange.end
					: lockIndex;
				setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
				if (keyboardCharIndexRef.current <= lockIndex) {
					isKeyboardSyncingRef.current = false;
					setDragStartTime(null);
				}
			};

			// 오른쪽 방향키: 한 글자 싱크
			if (shortcutAction === 'charForward') {
				consumeKeyboardEvent();
				const currentTime = Spicetify.Player.getProgress() / 1000;
				if (syncGranularity === 'line') syncWholeLine(currentTime);
				else if (syncGranularity === 'word') advanceOneSelectedWord(currentTime);
				else advanceOneChar(currentTime);
				return;
			}

			// 왼쪽 방향키: 한 글자 취소 (첫 글자도 취소 가능)
			if (shortcutAction === 'charBack') {
				consumeKeyboardEvent();
				if (syncGranularity === 'word') {
					pendingSyllableSyncRef.current = null;
					revertOneSelectedWord();
					return;
				}
				if (isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0) {
					const lockIndex = getActiveRecordingLockIndex();
					if (keyboardCharIndexRef.current <= lockIndex) return;
					pendingWordSyncRef.current = null;
					pendingSyllableSyncRef.current = null;
					charTimesRef.current[keyboardCharIndexRef.current] = null;
					keyboardCharIndexRef.current--;
					setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Reverted to char:', keyboardCharIndexRef.current);
					// 모든 글자 취소시 싱크 상태 초기화
					if (keyboardCharIndexRef.current <= lockIndex) {
						isKeyboardSyncingRef.current = false;
						setDragStartTime(null);
						window.__ivLyricsDebugLog?.('[SyncDataCreator] All chars reverted, sync reset');
					}
				}
				return;
			}

			// . (> 키): 한 단어 싱크
			if (shortcutAction === 'wordForward') {
				consumeKeyboardEvent();
				const currentTime = Spicetify.Player.getProgress() / 1000;
				if (syncGranularity === 'line') syncWholeLine(currentTime);
				else if (syncGranularity === 'word') advanceOneSelectedWord(currentTime);
				else advanceOneWord(currentTime);
				return;
			}

			// , (< 키): 한 단어 취소
			if (shortcutAction === 'wordBack') {
				consumeKeyboardEvent();
				pendingSyllableSyncRef.current = null;
				if (syncGranularity === 'word') revertOneSelectedWord();
				else revertOneWord();
				return;
			}

			// ; 키: 음절 단위 싱크 (다음 모음까지 진행)
			if (shortcutAction === 'syllable') {
				consumeKeyboardEvent();
				const currentTime = Spicetify.Player.getProgress() / 1000;

				if (!currentLineEffectiveSyllableSegments.length) {
					return;
				}

				if (!isKeyboardSyncingRef.current) {
					const lockIndex = getActiveRecordingLockIndex();
					if (lockIndex >= currentLineChars.length - 1) {
						Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
						return;
					}
					isKeyboardSyncingRef.current = true;
					charTimesRef.current = buildLockedCharTimes(lockIndex);
					pendingSyllableSyncRef.current = null;
					setDragStartTime(currentTime);
					pendingWordSyncRef.current = null;

					const firstSegment = currentLineEffectiveSyllableSegments.find(segment => segment.end > lockIndex);
					if (!firstSegment) {
						isKeyboardSyncingRef.current = false;
						keyboardCharIndexRef.current = lockIndex;
						return;
					}
					const segmentStart = Math.max(firstSegment.start, lockIndex + 1);
					for (let i = segmentStart; i <= firstSegment.end; i++) {
						charTimesRef.current[i] = currentTime;
					}

					keyboardCharIndexRef.current = firstSegment.end;
					setRecordingProgressIndex(firstSegment.end, { commitState: false });
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Syllable sync started, segment:', firstSegment.start, '-', firstSegment.end);

					if (firstSegment.end >= currentLineChars.length - 1) {
						const duration = estimateSegmentDuration(segmentStart, firstSegment.end, 0.05, 0.22);
						applyInterpolatedRangeToCharTimes(charTimesRef.current, segmentStart, firstSegment.end, currentTime, currentTime + duration);
						finishKeyboardSync();
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by syllable');
						return;
					}

					pendingSyllableSyncRef.current = {
						startIdx: segmentStart,
						endIdx: firstSegment.end,
						startTime: currentTime
					};
					return;
				}

				const currentSegmentIndex = currentLineEffectiveSyllableSegments.findIndex(
					(segment) => keyboardCharIndexRef.current >= segment.start && keyboardCharIndexRef.current <= segment.end
				);
				const nextSegment = currentLineEffectiveSyllableSegments[(currentSegmentIndex >= 0 ? currentSegmentIndex : -1) + 1];

				if (!nextSegment) {
					applyInterpolationToPendingSyllable(currentTime);
					finishKeyboardSync();
					return;
				}

				applyInterpolationToPendingSyllable(currentTime);
				const lockIndex = getActiveRecordingLockIndex();
				const segmentStart = Math.max(nextSegment.start, lockIndex + 1);
				for (let i = segmentStart; i <= nextSegment.end; i++) {
					charTimesRef.current[i] = currentTime;
				}

				keyboardCharIndexRef.current = nextSegment.end;
				setRecordingProgressIndex(nextSegment.end, { commitState: false });
				window.__ivLyricsDebugLog?.('[SyncDataCreator] Syllable advanced to segment:', nextSegment.start, '-', nextSegment.end);

				if (nextSegment.end >= currentLineChars.length - 1) {
					const duration = estimateSegmentDuration(segmentStart, nextSegment.end, 0.05, 0.22);
					applyInterpolatedRangeToCharTimes(charTimesRef.current, segmentStart, nextSegment.end, currentTime, currentTime + duration);
					pendingSyllableSyncRef.current = null;
					finishKeyboardSync();
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by syllable');
					return;
				}

				pendingSyllableSyncRef.current = {
					startIdx: segmentStart,
					endIdx: nextSegment.end,
					startTime: currentTime
				};
				return;
			}

			const startKeyboardDrag = () => {
				consumeKeyboardEvent();

				// 이미 드래그 중이면 무시
				if (isKeyboardDraggingRef.current) return;

				isKeyboardDraggingRef.current = true;

				const stopKeyboardDragLoop = () => {
					isKeyboardDraggingRef.current = false;
					if (keyboardDragIntervalRef.current) {
						clearInterval(keyboardDragIntervalRef.current);
						keyboardDragIntervalRef.current = null;
					}
					if (keyboardDragWarmupTimerRef.current) {
						clearTimeout(keyboardDragWarmupTimerRef.current);
						keyboardDragWarmupTimerRef.current = null;
					}
				};

				const runKeyboardDragStep = () => {
					if (!isKeyboardDraggingRef.current) {
						stopKeyboardDragLoop();
						return -1;
					}

					const time = Spicetify.Player.getProgress() / 1000;
					if (syncGranularity === 'line') {
						syncWholeLine(time);
						stopKeyboardDragLoop();
						return -1;
					}
					const result = syncGranularity === 'word'
						? advanceOneSelectedWord(time)
						: advanceOneChar(time);
					if (result === -1) {
						stopKeyboardDragLoop();
					}
					return result;
				};

				// 첫 keydown 안에서 여러 글자를 바로 전진시켜 우측 화살표 1회처럼 멈칫하지 않게 한다.
				for (let index = 0; index < SYNC_CREATOR_DRAG_INITIAL_BURST_STEPS; index++) {
					if (runKeyboardDragStep() === -1) {
						return;
					}
				}

				keyboardDragIntervalRef.current = setInterval(runKeyboardDragStep, SYNC_CREATOR_DRAG_INTERVAL_MS);
			};

			// 드래그 모드 시작 (누르고 있으면 연속으로 빠르게 진행)
			if (shortcutAction === 'drag' || isDragHotkey) {
				startKeyboardDrag();
				return;
			}

			// Enter: 현재 라인 완료 (중간에서도 완료 가능, 키보드 싱크 중일 때만)
			if (normalizedHotkey === 'enter') {
				// 키보드 싱크 중일 때만 처리 (글자를 하나라도 맞췄을 때)
				if (isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0) {
					consumeKeyboardEvent();
					finishKeyboardSync();
				}
				// 싱크 중이 아닐 때는 기본 동작 허용 (다른 버튼 클릭 등)
				return;
			}

			// Backspace: 현재 라인 싱크 취소
			if (normalizedHotkey === 'backspace') {
				consumeKeyboardEvent();
				if (isKeyboardSyncingRef.current) {
					isKeyboardSyncingRef.current = false;
					keyboardCharIndexRef.current = -1;
					charTimesRef.current = [];
					pendingWordSyncRef.current = null;
					pendingSyllableSyncRef.current = null;
					clearRecordingLock();
					setDragStartTime(null);
					setRecordingProgressIndex(-1);

					// 드래그 모드도 취소
					if (isKeyboardDraggingRef.current) {
						isKeyboardDraggingRef.current = false;
						if (keyboardDragIntervalRef.current) {
							clearInterval(keyboardDragIntervalRef.current);
							keyboardDragIntervalRef.current = null;
						}
						if (keyboardDragWarmupTimerRef.current) {
							clearTimeout(keyboardDragWarmupTimerRef.current);
							keyboardDragWarmupTimerRef.current = null;
						}
					}
				}
				return;
			}

			if (normalizedHotkey === 'space') {
				consumeKeyboardEvent();
				if (typeof Spicetify.Player?.togglePlay === 'function') {
					Spicetify.Player.togglePlay();
				} else if (Spicetify.Player?.isPlaying?.()) {
					Spicetify.Player.pause?.();
				} else {
					Spicetify.Player?.play?.();
				}
				return;
			}

		};

		const handleKeyPress = (e) => {
			const normalizedHotkey = getNormalizedHotkeyFromEvent(e);
			const shortcutBindings = getSyncCreatorShortcutBindings();
			const isConfiguredDragHotkey = (shortcutBindings.drag || []).includes(normalizedHotkey);
			if (!isConfiguredDragHotkey && !isSyncCreatorDragHotkeyEvent(e, normalizedHotkey)) return;

			// 일부 WebView/IME 조합에서 첫 keydown을 놓치는 경우가 있어 문자 입력 단계에서도 즉시 시작한다.
			handleKeyDown(e);
		};

		// / 키 keyup 이벤트 핸들러 (드래그 종료)
		const handleKeyUp = (e) => {
			const normalizedHotkey = getNormalizedHotkeyFromEvent(e);
			const shortcutBindings = getSyncCreatorShortcutBindings();
			const isConfiguredDragHotkey = (shortcutBindings.drag || []).includes(normalizedHotkey);
			if (isConfiguredDragHotkey || isSyncCreatorDragHotkeyEvent(e, normalizedHotkey)) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				isKeyboardDraggingRef.current = false;
				if (keyboardDragIntervalRef.current) {
					clearInterval(keyboardDragIntervalRef.current);
					keyboardDragIntervalRef.current = null;
				}
				if (keyboardDragWarmupTimerRef.current) {
					clearTimeout(keyboardDragWarmupTimerRef.current);
					keyboardDragWarmupTimerRef.current = null;
				}
			}
		};

		window.__ivLyricsDebugLog?.('[SyncDataCreator] Registering keydown/keyup listeners, mode:', mode);
		document.addEventListener('keydown', handleKeyDown, true); // capture phase
		document.addEventListener('keypress', handleKeyPress, true); // fallback for IME/WebView first-press handling
		document.addEventListener('keyup', handleKeyUp, true); // capture phase
		return () => {
			window.__ivLyricsDebugLog?.('[SyncDataCreator] Removing keydown/keyup listeners');
			document.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keypress', handleKeyPress, true);
			document.removeEventListener('keyup', handleKeyUp, true);
		};
	}, [mode, currentLineIndex, activeParallelTargetId, lyricsLines.length, currentLineChars, currentLineEffectiveSyllableSegments, currentGranularityRanges, lineCharOffsets, commitCurrentLineSync, advanceAfterCompletedTarget, isCurrentSyncTargetMetaComplete, showMissingMetaToast, setRecordingProgressIndex, getActiveRecordingLockIndex, buildLockedCharTimes, clearRecordingLock, syncGranularity]);

	const handleContainerMouseDown = useCallback((e) => {
		if (mode !== 'record' || currentLineIndex >= lyricsLines.length) return;
		if (e.button === 2) return;
		if (!isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return;
		}
		const touch = e.touches ? e.touches[0] : e;
		const charIndex = getCharIndexFromPoint(touch.clientX, touch.clientY);
		if (charIndex >= 0) handleDragStart(charIndex, e);
	}, [mode, currentLineIndex, lyricsLines.length, getCharIndexFromPoint, handleDragStart, isCurrentSyncTargetMetaComplete, showMissingMetaToast]);

	useEffect(() => {
		if (!isDragging) return;

		const handleGlobalMove = (e) => {
			if (!isDragging) return;
			const touch = e.touches ? e.touches[0] : e;
			const charIndex = getCharIndexFromPoint(touch.clientX, touch.clientY);
			if (charIndex !== null) handleDragMove(charIndex, e);
		};

		const handleGlobalEnd = (e) => {
			if (isDragging) handleDragEnd(e);
		};

		document.addEventListener('mousemove', handleGlobalMove);
		document.addEventListener('mouseup', handleGlobalEnd);
		document.addEventListener('touchmove', handleGlobalMove, { passive: false });
		document.addEventListener('touchend', handleGlobalEnd);

		return () => {
			document.removeEventListener('mousemove', handleGlobalMove);
			document.removeEventListener('mouseup', handleGlobalEnd);
			document.removeEventListener('touchmove', handleGlobalMove);
			document.removeEventListener('touchend', handleGlobalEnd);
		};
	}, [isDragging, getCharIndexFromPoint, handleDragMove, handleDragEnd]);

	// 현재 줄 싱크 삭제
	const deleteCurrentLineSync = useCallback(() => {
		if (!syncData || !syncData.lines) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];

		setSyncData(prev => {
			const newLines = prev.lines.filter(l => l.start !== lineStart);
			return newLines.length > 0 ? { ...prev, lines: newLines } : null;
		});
		clearRecordingLock();
	}, [syncData, lineCharOffsets, currentLineIndex, claimSessionForLocalEditing, clearRecordingLock]);

	const updateParallelPartMeta = useCallback((partId, field, value) => {
		const safeValue = field === 'speaker'
			? normalizeSyncCreatorSpeaker(value)
			: field === 'speaker-color'
				? normalizeSyncCreatorSpeakerColor(value)
			: field === 'speaker-fallback'
				? normalizeSyncCreatorSpeakerFallback(value)
			: field === 'kind'
				? normalizeSyncCreatorKind(value)
				: String(value || '').trim();
		const shouldDelete = (field === 'speaker-color' || field === 'speaker-fallback') && !safeValue;
		if (!partId || !field || (!safeValue && !shouldDelete)) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		const draftKey = `${lineStart}:${partId}`;
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
		const safeValue = field === 'speaker'
			? normalizeSyncCreatorSpeaker(value)
			: field === 'speaker-color'
				? normalizeSyncCreatorSpeakerColor(value)
			: field === 'speaker-fallback'
				? normalizeSyncCreatorSpeakerFallback(value)
			: field === 'kind'
				? normalizeSyncCreatorKind(value)
				: String(value || '').trim();
		const shouldDelete = (field === 'speaker-color' || field === 'speaker-fallback') && !safeValue;
		if (!field || (!safeValue && !shouldDelete)) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		const shouldOmitDefaultValue = !multiVocalMode && (
			(field === 'speaker' && safeValue === SYNC_CREATOR_DEFAULT_SPEAKER)
			|| (field === 'kind' && safeValue === SYNC_CREATOR_DEFAULT_KIND)
		);
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

	const beginStyleRangeSelection = useCallback((localIndex, event) => {
		if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= currentFullLineChars.length) return;
		event?.preventDefault?.();
		event?.stopPropagation?.();
		styleRangeDragRef.current = { anchor: localIndex };
		setStyleRangeSelection({ anchor: localIndex, focus: localIndex });
		setStyleRangeEffect('');
	}, [currentFullLineChars.length]);

	const extendStyleRangeSelection = useCallback((localIndex) => {
		const drag = styleRangeDragRef.current;
		if (!drag || !Number.isInteger(localIndex)) return;
		setStyleRangeSelection({ anchor: drag.anchor, focus: localIndex });
	}, []);

	useEffect(() => {
		const finishSelection = () => {
			styleRangeDragRef.current = null;
		};
		document.addEventListener('pointerup', finishSelection, true);
		document.addEventListener('pointercancel', finishSelection, true);
		return () => {
			document.removeEventListener('pointerup', finishSelection, true);
			document.removeEventListener('pointercancel', finishSelection, true);
		};
	}, []);

	useEffect(() => {
		styleRangeDragRef.current = null;
		setStyleRangeSelection(null);
	}, [currentLineStart, currentFullLineChars.length]);

	const updateCurrentLineStyleRanges = useCallback((patch) => {
		if (!styleRangeSelection || currentFullLineChars.length === 0) return false;
		const localStart = Math.min(styleRangeSelection.anchor, styleRangeSelection.focus);
		const localEnd = Math.max(styleRangeSelection.anchor, styleRangeSelection.focus);
		const lineEnd = currentLineStart + currentFullLineChars.length - 1;
		const nextRanges = applySyncCreatorStyleRangePatch(
			currentLineStyleRanges,
			currentLineStart + localStart,
			currentLineStart + localEnd,
			patch,
			currentLineStart,
			lineEnd
		);
		claimSessionForLocalEditing();
		setLineStyleDrafts(prev => ({ ...prev, [currentLineStart]: nextRanges }));
		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			let changed = false;
			const lines = prev.lines.map(line => {
				if (line.start !== currentLineStart) return line;
				changed = true;
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
		styleRangeSelection
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

	const currentManualSplitPoints = useMemo(() => {
		return resolveSyncCreatorManualSplitState(
			manualParallelSplitDrafts,
			currentLineStart,
			currentFullLineChars.length,
			currentExistingLineData?.parallel,
			currentAutoMergeSplitPoints
		).splitPoints;
	}, [manualParallelSplitDrafts, currentLineStart, currentFullLineChars.length, currentAutoMergeSplitPoints, currentExistingLineData]);
	const currentManualSplitPointSet = useMemo(
		() => new Set(currentManualSplitPoints),
		[currentManualSplitPoints]
	);
	const hasManualParallelSplit = currentManualSplitPoints.length > 0;
	const hasManualDraftSplit = Object.prototype.hasOwnProperty.call(manualParallelSplitDrafts, currentLineStart);
	const resetCurrentLineManualSplit = useCallback(() => {
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		setManualParallelSplitDrafts(prev => {
			if (!Object.prototype.hasOwnProperty.call(prev, lineStart)) return prev;
			const next = { ...prev };
			delete next[lineStart];
			return next;
		});
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing, lineCharOffsets, currentLineIndex, setRecordingProgressIndex, clearRecordingLock]);
	const unmergeCurrentLine = useCallback(() => {
		if (!currentLineMergedWithNext || currentMergedLineIndexes.length <= 1) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		const mergedEnd = getLineEndAtIndex(currentMergedLineIndexes[currentMergedLineIndexes.length - 1]);

		setSyncData(prev => {
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
					const sliceStart = start - lineStart;
					const sliceEnd = sliceStart + lineChars.length;
					const chars = Array.isArray(part?.chars) && part.chars.length === lineChars.length
						? part.chars
						: Array.isArray(mergedLine.chars) && mergedLine.chars.length >= sliceEnd
							? mergedLine.chars.slice(sliceStart, sliceEnd)
							: null;
					if (!Array.isArray(chars) || chars.length !== lineChars.length) return null;

					const speaker = normalizeSyncCreatorSpeaker(part?.speaker || mergedLine.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
					const kind = normalizeSyncCreatorKind(part?.kind || mergedLine.kind) || SYNC_CREATOR_DEFAULT_KIND;
					const granularity = normalizeSyncCreatorGranularity(part?.granularity || mergedLine.granularity);
					return { start, end, chars, granularity, speaker, kind };
				})
				.filter(Boolean);
			if (restoredLines.length !== currentMergedLineIndexes.length) return prev;

			const lines = prev.lines
				.filter(line => line.start < lineStart || line.start > mergedEnd);
			lines.push(...restoredLines);
			lines.sort((a, b) => a.start - b.start);
			return lines.length > 0
				? { ...prev, version: lines.some(line => line.parallel) ? SYNC_CREATOR_SYNC_DATA_VERSION : (prev.version || 1), lines }
				: null;
		});

		setMergedLineDrafts(prev => {
			if (!Object.prototype.hasOwnProperty.call(prev, lineStart)) return prev;
			const next = { ...prev };
			delete next[lineStart];
			return next;
		});
		setManualParallelSplitDrafts(prev => {
			if (!Object.prototype.hasOwnProperty.call(prev, lineStart)) return prev;
			const next = { ...prev };
			delete next[lineStart];
			return next;
		});
		setActiveParallelPartId('full');
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [
		currentLineIndex,
		claimSessionForLocalEditing,
		currentLineMergedWithNext,
		currentMergedLineIndexes,
		getLineEndAtIndex,
		lineCharOffsets,
		lyricsLines,
		setRecordingProgressIndex,
		clearRecordingLock
	]);
	const toggleManualParallelSplitPoint = useCallback((splitPoint) => {
		if (!multiVocalMode || currentFullLineChars.length < 2) return;
		const normalizedSplitPoint = Number(splitPoint);
		if (!Number.isInteger(normalizedSplitPoint) || normalizedSplitPoint <= 0 || normalizedSplitPoint >= currentFullLineChars.length) {
			return;
		}
		if (currentAutoMergeSplitPointSet.has(normalizedSplitPoint)) {
			unmergeCurrentLine();
			return;
		}
		claimSessionForLocalEditing();

		const lineStart = lineCharOffsets[currentLineIndex];
		setManualParallelSplitDrafts(prev => {
			const splitState = resolveSyncCreatorManualSplitState(
				prev,
				lineStart,
				currentFullLineChars.length,
				currentExistingLineData?.parallel,
				currentAutoMergeSplitPoints
			);
			const current = new Set(splitState.manualSplitPoints
				.filter(point => !currentAutoMergeSplitPointSet.has(point)));
			if (current.has(normalizedSplitPoint)) {
				current.delete(normalizedSplitPoint);
			} else {
				current.add(normalizedSplitPoint);
			}

			const nextSplitPoints = [...current]
				.filter(value => Number.isInteger(value) && value > 0 && value < currentFullLineChars.length)
				.sort((a, b) => a - b);
			const next = { ...prev };
			next[lineStart] = nextSplitPoints;
			return next;
		});
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [
		multiVocalMode,
		currentFullLineChars.length,
		currentAutoMergeSplitPointSet,
		unmergeCurrentLine,
		lineCharOffsets,
		currentLineIndex,
		currentExistingLineData,
		claimSessionForLocalEditing,
		setRecordingProgressIndex,
		clearRecordingLock
	]);
	const resolveParentheticalLayoutDecision = useCallback((layoutMode) => {
		const decision = pendingParentheticalLayoutDecision;
		if (!decision || !Number.isInteger(Number(decision.lineStart))) return;
		claimSessionForLocalEditing();
		const safeMode = layoutMode === 'grouped' ? 'grouped' : 'separate';
		const lineStart = Number(decision.lineStart);

		setParentheticalLayoutDrafts(prev => ({
			...prev,
			[lineStart]: safeMode
		}));
		setPendingParentheticalLayoutDecision(null);
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing, pendingParentheticalLayoutDecision, setRecordingProgressIndex, clearRecordingLock]);
	const enableManualMultiVocalMode = useCallback(() => {
		claimSessionForLocalEditing();
		setMultiVocalMode(true);
		setActiveParallelPartId('');
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing, setRecordingProgressIndex, clearRecordingLock]);

	const toggleMode = useCallback((newMode) => {
		claimSessionForLocalEditing();
		if (mode === newMode) {
			setMode('idle');
		} else {
			if (newMode === 'record' && !isCurrentSyncTargetMetaComplete) {
				showMissingMetaToast();
				return;
			}
			setMode(newMode);
			if (newMode === 'preview') Spicetify.Player.seek(0);
			if (!Spicetify.Player.isPlaying()) Spicetify.Player.play();
		}
	}, [claimSessionForLocalEditing, mode, isCurrentSyncTargetMetaComplete, showMissingMetaToast]);

	const adjustGlobalOffset = useCallback((deltaMs) => {
		claimSessionForLocalEditing();
		const deltaSec = deltaMs / 1000;

		setSyncData(prev => {
			if (!prev || !prev.lines) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => ({
					...line,
					chars: line.chars.map(t => Math.round((t + deltaSec) * 1000) / 1000),
					parallel: line.parallel ? {
						...line.parallel,
						parts: Array.isArray(line.parallel.parts)
							? line.parallel.parts.map(part => ({
								...part,
								chars: Array.isArray(part.chars)
									? part.chars.map(t => Math.round((t + deltaSec) * 1000) / 1000)
									: part.chars
							}))
							: line.parallel.parts
					} : line.parallel
				}))
			};
		});
		setGlobalOffset(prev => prev + deltaMs);
	}, [claimSessionForLocalEditing]);

	const adjustCurrentLineOffset = useCallback((deltaMs) => {
		claimSessionForLocalEditing();
		const requestedDeltaSec = deltaMs / 1000;
		resetCurrentSyncInput();

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines) || !Number.isInteger(currentLineStart)) return prev;

			const targetIndex = prev.lines.findIndex(line => line.start === currentLineStart);
			if (targetIndex < 0) return prev;

			const targetLine = prev.lines[targetIndex];
			const targetTimes = getSyncCreatorLineTimes(targetLine);
			if (targetTimes.length === 0) return prev;

			const firstTime = Math.min(...targetTimes);
			const lastTime = Math.max(...targetTimes);
			const previousLine = prev.lines
				.filter(line => line.start < currentLineStart)
				.sort((a, b) => b.start - a.start)[0] || null;
			const nextLine = prev.lines
				.filter(line => line.start > currentLineStart)
				.sort((a, b) => a.start - b.start)[0] || null;
			const previousTimes = getSyncCreatorLineTimes(previousLine);
			const nextTimes = getSyncCreatorLineTimes(nextLine);
			const minFirstTime = previousTimes.length > 0
				? Math.max(...previousTimes) + SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC
				: 0;
			const maxLastTime = nextTimes.length > 0
				? Math.min(...nextTimes) - SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC
				: Infinity;
			const minDeltaSec = minFirstTime - firstTime;
			const maxDeltaSec = Number.isFinite(maxLastTime) ? maxLastTime - lastTime : Infinity;
			if (Number.isFinite(maxDeltaSec) && maxDeltaSec < minDeltaSec) return prev;

			const boundedDeltaSec = Math.min(Math.max(requestedDeltaSec, minDeltaSec), maxDeltaSec);
			if ((requestedDeltaSec > 0 && boundedDeltaSec <= 0) || (requestedDeltaSec < 0 && boundedDeltaSec >= 0)) return prev;
			if (!Number.isFinite(boundedDeltaSec) || Math.abs(boundedDeltaSec) < 0.0005) return prev;

			const shiftTimes = (values) => Array.isArray(values)
				? values.map(time => (
					typeof time === 'number' && Number.isFinite(time)
						? roundSyncTime(Math.max(0, time + boundedDeltaSec))
						: time
				))
				: values;
			const shiftLine = (line) => ({
				...line,
				chars: shiftTimes(line.chars),
				parallel: line.parallel ? {
					...line.parallel,
					parts: Array.isArray(line.parallel.parts)
						? line.parallel.parts.map(part => ({
							...part,
							chars: shiftTimes(part.chars)
						}))
						: line.parallel.parts
				} : line.parallel
			});

			return {
				...prev,
				lines: prev.lines.map((line, index) => index === targetIndex ? shiftLine(line) : line)
			};
		});
	}, [claimSessionForLocalEditing, currentLineStart, resetCurrentSyncInput]);

	const resetFromStart = useCallback(async () => {
		const confirmed = window.confirm(
			I18n.t('syncCreator.resetConfirm')
			|| '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.\n정말 처음부터 다시 시작할까요?'
		);
		if (!confirmed) return;

		setCurrentLineIndex(0);
		setSyncData(null);
		setParallelPartMetaDrafts({});
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setLineMetaDrafts({});
		setLineStyleDrafts({});
		setStyleRangeSelection(null);
		setGlobalOffset(0);
		setMode('idle');
		const draftKey = activeSessionDraftKeyRef.current;
		sessionAutosaveSuppressedRef.current = true;
		if (sessionAutosaveTimerRef.current) {
			clearTimeout(sessionAutosaveTimerRef.current);
			sessionAutosaveTimerRef.current = null;
		}
		sessionRecoveryRequestRef.current += 1;
		sessionCheckpointRestoreRequestRef.current += 1;
		sessionWriteGenerationRef.current += 1;
		latestSessionRecordRef.current = null;
		sessionAppliedDraftKeyRef.current = '';
		sessionBaselineDraftRef.current = null;
		setIsRestoringCheckpoint(false);
		setSessionReadyDraftKey('');
		setSessionHistory([]);
		setSessionHistoryCursorId('');
		setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
		if (syncCreatorDraftStore && draftKey) {
			try {
				await syncCreatorDraftStore.flush();
				await syncCreatorDraftStore.deleteDraft(draftKey);
			} catch (error) {
				console.warn('[SyncDataCreator] Failed to delete the reset draft:', error);
			}
		}
		if (draftKey === activeSessionDraftKeyRef.current) {
			sessionAutosaveSuppressedRef.current = false;
			sessionAppliedDraftKeyRef.current = draftKey;
			setSessionReadyDraftKey(draftKey);
		}
		Spicetify.Player.seek(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [syncCreatorDraftStore]);

	const goToPrevLine = useCallback(() => {
		if (previousNavigableLineIndex >= 0) {
			claimSessionForLocalEditing();
			setCurrentLineIndex(previousNavigableLineIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [claimSessionForLocalEditing, previousNavigableLineIndex]);

	const goToNextLine = useCallback(() => {
		if (nextNavigableLineIndex >= 0) {
			claimSessionForLocalEditing();
			setCurrentLineIndex(nextNavigableLineIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [claimSessionForLocalEditing, nextNavigableLineIndex]);

	const goToSyncTarget = useCallback((lineIndex, edge = 'first') => {
		if (lineIndex < 0 || lineIndex >= lyricsLines.length) return;
		claimSessionForLocalEditing();
		resetCurrentSyncInput();
		pendingParallelNavigationRef.current = { lineIndex, edge };
		setCurrentLineIndex(lineIndex);
		setActiveParallelPartId('');
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing, lyricsLines.length, resetCurrentSyncInput]);

	const goToPreviousSyncTarget = useCallback(() => {
		const currentPartIndex = currentParallelParts.findIndex(part => part.id === activeParallelTargetId);
		if (currentPartIndex > 0) {
			selectParallelPart(currentParallelParts[currentPartIndex - 1].id);
			return;
		}
		if (previousNavigableLineIndex < 0) return;
		goToSyncTarget(previousNavigableLineIndex, 'last');
	}, [
		activeParallelTargetId,
		currentParallelParts,
		goToSyncTarget,
		previousNavigableLineIndex,
		selectParallelPart
	]);

	const goToNextSyncTarget = useCallback(() => {
		const currentPartIndex = currentParallelParts.findIndex(part => part.id === activeParallelTargetId);
		if (currentPartIndex >= 0 && currentPartIndex < currentParallelParts.length - 1) {
			selectParallelPart(currentParallelParts[currentPartIndex + 1].id);
			return;
		}
		if (nextNavigableLineIndex < 0) return;
		goToSyncTarget(nextNavigableLineIndex, 'first');
	}, [
		activeParallelTargetId,
		currentParallelParts,
		goToSyncTarget,
		nextNavigableLineIndex,
		selectParallelPart
	]);

	useEffect(() => {
		const handleLineNavigationShortcut = (event) => {
			if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
			if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
			const target = event.target;
			if (
				target?.isContentEditable
				|| ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
				|| target?.closest?.('[role="dialog"], [role="separator"], [role="slider"], [role="listbox"], [role="menu"], [role="menuitem"], [aria-haspopup]')
			) return;
			if (!lyricsText || lyricsLines.length === 0) return;

			event.preventDefault();
			event.stopPropagation();
			if (event.key === 'ArrowUp') goToPreviousSyncTarget();
			else goToNextSyncTarget();
		};

		window.addEventListener('keydown', handleLineNavigationShortcut, true);
		return () => window.removeEventListener('keydown', handleLineNavigationShortcut, true);
	}, [goToNextSyncTarget, goToPreviousSyncTarget, lyricsLines.length, lyricsText]);

	const goToFirstLine = useCallback(() => {
		claimSessionForLocalEditing();
		setCurrentLineIndex(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing]);

	const handleSeek = useCallback((e) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
		const percent = Math.max(0, Math.min(1, x / rect.width));
		const duration = Spicetify.Player?.data?.item?.duration?.milliseconds || 0;
		Spicetify.Player.seek(duration * percent);
	}, []);

	const handleSeekOffset = useCallback((offsetMs) => {
		Spicetify.Player.seek(Math.max(0, Spicetify.Player.getProgress() + offsetMs));
	}, []);

	const attachSelectedLrclibSource = useCallback((data) => {
		const sanitized = sanitizeSyncCreatorSyncData(data, lyricsFullTextChars);
		if (!sanitized) {
			return sanitized;
		}

		const currentProvider = providerRef.current;
		if (currentProvider !== 'lrclib') {
			if (Object.prototype.hasOwnProperty.call(sanitized, 'source')) {
				const { source, ...withoutSource } = sanitized;
				return withoutSource;
			}
			return sanitized;
		}

		const currentLrclibSource = selectedLrclibSourceRef.current;
		const loadedLrclibSource = lyrics?.lrclibSource;
		const persistedLrclibSource = sanitized?.source;
		let resolvedSource = [currentLrclibSource, loadedLrclibSource, persistedLrclibSource]
			.find(isCompleteSyncCreatorLrclibSource) || null;

		if (!resolvedSource) {
			const desiredLrclibId = [
				currentLrclibSource?.lrclibId,
				loadedLrclibSource?.lrclibId,
				persistedLrclibSource?.lrclibId,
				lyrics?.lrclibId
			].map(normalizeSyncCreatorLrclibId).find(Boolean) || '';
			const selectedCandidate = lrclibCandidates.find(candidate => (
				desiredLrclibId
					? normalizeSyncCreatorLrclibId(candidate?.id ?? candidate?.lrclibId) === desiredLrclibId
					: candidate?.candidateKey === selectedLrclibCandidateKey
			)) || null;
			resolvedSource = buildLrclibSyncSource(selectedCandidate);
		}

		if (!resolvedSource) {
			if (Object.prototype.hasOwnProperty.call(sanitized, 'source')) {
				const { source, ...withoutSource } = sanitized;
				return withoutSource;
			}
			return sanitized;
		}
		return {
			...sanitized,
			source: {
				...resolvedSource,
				provider: 'lrclib',
				lrclibId: normalizeSyncCreatorLrclibId(resolvedSource.lrclibId)
			}
		};
	}, [
		buildLrclibSyncSource,
		lrclibCandidates,
		lyrics,
		lyricsFullTextChars,
		selectedLrclibCandidateKey
	]);

	const buildSyncCreatorSessionRecord = useCallback((syncDataOverride = syncData, editorOverrides = {}) => {
		if (!syncCreatorDraftStore || !activeSessionDraftKey || !sessionTrackKey || !lyricsText) return null;

		let persistedSyncData = null;
		if (syncDataOverride) {
			const expandedSyncData = attachSelectedLrclibSource(syncDataOverride);
			assertValidSyncCreatorSyncData(expandedSyncData);
			persistedSyncData = compactSyncCreatorSyncData(
				expandedSyncData,
				lyricsFullTextChars,
				lyricsLanguage || undefined
			);
		}

		const editor = {
			currentLineIndex,
			activeParallelPartId,
			multiVocalMode,
			syncGranularity,
			globalOffset,
			parallelPartMetaDrafts: syncCreatorDraftStore.cloneValue(parallelPartMetaDrafts),
			manualParallelSplitDrafts: syncCreatorDraftStore.cloneValue(manualParallelSplitDrafts),
			parentheticalLayoutDrafts: syncCreatorDraftStore.cloneValue(parentheticalLayoutDrafts),
			mergedLineDrafts: syncCreatorDraftStore.cloneValue(mergedLineDrafts),
			lineMetaDrafts: syncCreatorDraftStore.cloneValue(lineMetaDrafts),
			lineStyleDrafts: syncCreatorDraftStore.cloneValue(lineStyleDrafts),
			selectedLrclibCandidateKey,
			...editorOverrides
		};

		return {
			recordVersion: syncCreatorDraftStore.RECORD_VERSION,
			draftKey: activeSessionDraftKey,
			trackKey: sessionTrackKey,
			trackId,
			trackUri,
			isrc: trackIsrc,
			title: trackName,
			artist: artistName,
			album: albumName,
			durationMs: trackDurationMs,
			provider,
			addonId,
			lyricsFingerprint: sessionLyricsFingerprint,
			lyricsText,
			lrclibSource: selectedLrclibSource
				? syncCreatorDraftStore.cloneValue(selectedLrclibSource)
				: null,
			karaokeSource: lyrics?.karaokeSource || '',
			clientRevision: nextSessionClientRevision(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			draft: {
				syncData: persistedSyncData
					? syncCreatorDraftStore.cloneValue(persistedSyncData)
					: null,
				editor
			}
		};
	}, [
		activeParallelPartId,
		activeSessionDraftKey,
		addonId,
		albumName,
		artistName,
		attachSelectedLrclibSource,
		currentLineIndex,
		globalOffset,
		lineMetaDrafts,
		lineStyleDrafts,
		lyricsFullTextChars,
		lyricsLanguage,
		lyrics?.karaokeSource,
		lyricsText,
		manualParallelSplitDrafts,
		mergedLineDrafts,
		multiVocalMode,
		nextSessionClientRevision,
		parallelPartMetaDrafts,
		parentheticalLayoutDrafts,
		provider,
		selectedLrclibCandidateKey,
		selectedLrclibSource,
		sessionLyricsFingerprint,
		sessionTrackKey,
		syncCreatorDraftStore,
		syncData,
		syncGranularity,
		trackDurationMs,
		trackId,
		trackIsrc,
		trackName,
		trackUri
	]);

	const syncSessionUiFromRecord = useCallback((record) => {
		setSessionHistory(Array.isArray(record?.history) ? record.history : []);
		setSessionHistoryCursorId(record?.historyCursorId || '');
		setLastSessionSavedAt(Number(record?.updatedAt) || Date.now());
		setSessionSaveState(sessionAutosaveEnabledRef.current ? 'saved' : 'disabled');
		const sourceCheckpoint = Array.isArray(record?.history)
			? record.history.find(entry => entry?.kind === 'source')
			: null;
		if (sourceCheckpoint?.snapshot) {
			sessionBaselineDraftRef.current = syncCreatorDraftStore?.cloneValue?.(sourceCheckpoint.snapshot)
				|| sourceCheckpoint.snapshot;
		}
	}, [syncCreatorDraftStore]);
	const announceHistoryStatus = useCallback((message) => {
		setHistoryAnnouncement('');
		window.requestAnimationFrame(() => setHistoryAnnouncement(message));
	}, []);
	const announceRecoveredSession = useCallback((record) => {
		const announcementKey = [
			record?.draftKey || '',
			record?.historyCursorId || '',
			Number(record?.clientRevision) || Number(record?.updatedAt) || 0
		].join(':');
		if (announcementKey === sessionLastRecoveryAnnouncementRef.current) return;
		sessionLastRecoveryAnnouncementRef.current = announcementKey;
		const message = I18n.t('syncCreator.historyRecovered') || '이 곡의 이전 작업을 자동으로 복구했습니다.';
		announceHistoryStatus(message);
		Toast.success(message);
	}, [announceHistoryStatus]);

	const applySyncCreatorSessionRecord = useCallback((record, options = {}) => {
		if (!record?.draft || !record.lyricsText) {
			throw new Error('Invalid Sync Creator recovery data.');
		}

		const restoredLyricsText = normalizeSyncCreatorStandaloneParentheticalLines(
			String(record.lyricsText || '').normalize('NFC')
		);
		if (!restoredLyricsText.trim()) {
			throw new Error('Recovered lyrics are empty.');
		}

		const restoredFingerprint = syncCreatorDraftStore?.createLyricsFingerprint?.(restoredLyricsText);
		if (record.lyricsFingerprint && restoredFingerprint && record.lyricsFingerprint !== restoredFingerprint) {
			throw new Error('Recovered lyrics fingerprint does not match.');
		}

		const flatLyricsChars = getSyncCreatorFlatLyricsCharsFromText(restoredLyricsText);
		let restoredSyncData = null;
		if (record.draft.syncData) {
			restoredSyncData = sanitizeSyncCreatorSyncData(record.draft.syncData, flatLyricsChars);
			if (!restoredSyncData) throw new Error('Recovered sync data does not match the lyrics.');
			assertValidSyncCreatorSyncData(restoredSyncData);
		}

		const restoredLines = restoredLyricsText
			.split('\n')
			.map(line => line.trim())
			.filter(Boolean)
			.map(text => ({ text }));
		const editor = record.draft.editor && typeof record.draft.editor === 'object'
			? record.draft.editor
			: {};
		const restoreObject = (value) => (
			value && typeof value === 'object' && !Array.isArray(value)
				? syncCreatorDraftStore.cloneValue(value)
				: {}
		);
		const restoredLineIndex = Math.max(
			0,
			Math.min(restoredLines.length - 1, Number(editor.currentLineIndex) || 0)
		);
		const restoredProvider = String(record.provider || record.lrclibSource?.provider || '').trim();
		const restoredAddonId = String(record.addonId || restoredProvider.split('-')[0] || '').trim();
		if (restoredAddonId.toLowerCase() !== SYNC_CREATOR_SOURCE_ADDON_ID) {
			throw new Error('Only LRCLIB Sync Creator sessions can be restored.');
		}
		const validatedRecord = {
			...record,
			draft: {
				...record.draft,
				syncData: restoredSyncData
			}
		};
		if (options.validateOnly === true) return validatedRecord;
		if (options.automatic === true && sessionAutoRecoveryBlockedRef.current) return null;

		setProviderValue(restoredProvider);
		setAddonId(SYNC_CREATOR_SOURCE_ADDON_ID);
		setLyrics({
			provider: restoredProvider,
			synced: restoredLines,
			unsynced: restoredLines,
			karaokeSource: record.karaokeSource || undefined
		});
		setLyricsText(restoredLyricsText);
		setSyncData(restoredSyncData);
		setSelectedLrclibSourceValue(record.lrclibSource || null);
		setLrclibIdInput(record.lrclibSource?.lrclibId === null || record.lrclibSource?.lrclibId === undefined
			? ''
			: String(record.lrclibSource.lrclibId));
		setSelectedLrclibCandidateKey(String(editor.selectedLrclibCandidateKey || ''));
		setCurrentLineIndex(restoredLineIndex);
		setActiveParallelPartId(String(editor.activeParallelPartId || 'full'));
		setMultiVocalMode(editor.multiVocalMode === true);
		if (Object.prototype.hasOwnProperty.call(editor, 'syncGranularity')) {
			setSyncGranularity(normalizeSyncCreatorGranularity(editor.syncGranularity));
		}
		setGlobalOffset(Number.isFinite(Number(editor.globalOffset)) ? Number(editor.globalOffset) : 0);
		setParallelPartMetaDrafts(restoreObject(editor.parallelPartMetaDrafts));
		setManualParallelSplitDrafts(restoreObject(editor.manualParallelSplitDrafts));
		setParentheticalLayoutDrafts(restoreObject(editor.parentheticalLayoutDrafts));
		setMergedLineDrafts(restoreObject(editor.mergedLineDrafts));
		setLineMetaDrafts(restoreObject(editor.lineMetaDrafts));
		setLineStyleDrafts(restoreObject(editor.lineStyleDrafts));
		setPendingMultiVocalDecision(null);
		setPendingParentheticalLayoutDecision(null);
		setError(null);
		setIsLoading(false);
		if (options.automatic === true) {
			// If a direct mode change was queued in the same React batch, recovery
			// must not switch it back to idle.
			setMode(currentMode => (
				currentMode === 'record' || currentMode === 'preview'
					? currentMode
					: 'idle'
			));
		} else {
			setMode('idle');
		}
		setDragStartTime(null);
		setDragStartCharIndex(-1);
		setIsDragging(false);
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		isKeyboardSyncingRef.current = false;
		keyboardCharIndexRef.current = -1;
		pendingWordSyncRef.current = null;
		pendingSyllableSyncRef.current = null;
		sessionAppliedDraftKeyRef.current = record.draftKey;
		sessionClientRevisionRef.current = Math.max(
			sessionClientRevisionRef.current,
			Number(validatedRecord.clientRevision) || 0
		);
		latestSessionRecordRef.current = validatedRecord;
		syncSessionUiFromRecord(validatedRecord);

		if (options.announce !== false) {
			announceHistoryStatus(I18n.t('syncCreator.historyRestored') || '작업 상태를 복원했습니다.');
		}
		return validatedRecord;
	}, [
		announceHistoryStatus,
		clearRecordingLock,
		setProviderValue,
		setRecordingProgressIndex,
		setSelectedLrclibSourceValue,
		syncCreatorDraftStore,
		syncSessionUiFromRecord
	]);

	const saveSessionCheckpoint = useCallback(async ({
		kind = 'manual',
		syncData: syncDataOverride = syncData,
		lineIndex = currentLineIndex,
		editorLineIndex = lineIndex,
		lineText = lyricsLines[currentLineIndex] || '',
		partId = activeParallelTargetId
	} = {}) => {
		if (!syncCreatorDraftStore || !activeSessionDraftKey || !lyricsText) return null;
		if (sessionAutosaveTimerRef.current) {
			clearTimeout(sessionAutosaveTimerRef.current);
			sessionAutosaveTimerRef.current = null;
		}
		const writeGeneration = ++sessionWriteGenerationRef.current;
		let record = null;
		try {
			record = buildSyncCreatorSessionRecord(syncDataOverride, {
				currentLineIndex: editorLineIndex,
				activeParallelPartId: partId || 'full'
			});
		} catch (error) {
			console.warn('[SyncDataCreator] Skipped invalid checkpoint:', error);
			return null;
		}
		if (!record) return null;

		latestSessionRecordRef.current = record;
		setSessionSaveState('saving');
		try {
			const saved = await syncCreatorDraftStore.appendCheckpoint(record, {
				kind,
				lineIndex,
				lineText,
				partId,
				snapshot: record.draft,
				baselineSnapshot: sessionBaselineDraftRef.current
			});
			if (
				saved?.draftKey === activeSessionDraftKeyRef.current
				&& writeGeneration === sessionWriteGenerationRef.current
			) {
				latestSessionRecordRef.current = saved;
				sessionAppliedDraftKeyRef.current = saved.draftKey;
				setSessionReadyDraftKey(saved.draftKey);
				syncSessionUiFromRecord(saved);
			}
			return saved;
		} catch (error) {
			console.warn('[SyncDataCreator] Failed to save checkpoint:', error);
			if (writeGeneration === sessionWriteGenerationRef.current) {
				setSessionSaveState('error');
			}
			return null;
		}
	}, [
		activeParallelTargetId,
		activeSessionDraftKey,
		buildSyncCreatorSessionRecord,
		currentLineIndex,
		lyricsLines,
		lyricsText,
		syncCreatorDraftStore,
		syncData,
		syncSessionUiFromRecord
	]);

	const addManualCheckpoint = useCallback(() => {
		claimSessionForLocalEditing();
		return saveSessionCheckpoint({ kind: 'manual' }).then((saved) => {
			if (saved) {
				announceHistoryStatus(I18n.t('syncCreator.historyCheckpointSaved') || '체크포인트를 저장했습니다.');
			}
		});
	}, [announceHistoryStatus, claimSessionForLocalEditing, saveSessionCheckpoint]);

	const restoreHistoryCheckpoint = useCallback(async (checkpointId) => {
		if (
			!syncCreatorDraftStore
			|| !activeSessionDraftKey
			|| !checkpointId
			|| checkpointId === sessionHistoryCursorId
			|| isRestoringCheckpoint
		) return;
		if (mode === 'record' || isDragging || isKeyboardSyncingRef.current) {
			Toast.error(I18n.t('syncCreator.historyStopRecording') || '기록을 멈춘 뒤 작업 내역을 복원하세요.');
			return;
		}

		if (sessionAutosaveTimerRef.current) {
			clearTimeout(sessionAutosaveTimerRef.current);
			sessionAutosaveTimerRef.current = null;
		}
		const requestId = ++sessionCheckpointRestoreRequestRef.current;
		const writeGeneration = ++sessionWriteGenerationRef.current;
		const restoringDraftKey = activeSessionDraftKey;
		setIsRestoringCheckpoint(true);
		setSessionSaveState('loading');
		announceHistoryStatus(I18n.t('syncCreator.historyRestoring') || '복원 중');
		try {
			const currentWorkingRecord = latestSessionRecordRef.current;
			if (currentWorkingRecord?.draftKey === restoringDraftKey) {
				await syncCreatorDraftStore.saveDraft(currentWorkingRecord);
			}
			await syncCreatorDraftStore.flush();
			if (
				requestId !== sessionCheckpointRestoreRequestRef.current
				|| writeGeneration !== sessionWriteGenerationRef.current
				|| restoringDraftKey !== activeSessionDraftKeyRef.current
			) return;

			const candidate = await syncCreatorDraftStore.getCheckpointCandidate(restoringDraftKey, checkpointId);
			const validatedCandidate = applySyncCreatorSessionRecord(candidate, { validateOnly: true });
			const restored = await syncCreatorDraftStore.restoreCheckpoint(
				restoringDraftKey,
				checkpointId,
				validatedCandidate.draft,
				nextSessionClientRevision()
			);
			if (
				requestId !== sessionCheckpointRestoreRequestRef.current
				|| writeGeneration !== sessionWriteGenerationRef.current
				|| restoringDraftKey !== activeSessionDraftKeyRef.current
				|| !restored
			) return;
			if (restored.historyCursorId !== checkpointId) {
				throw new Error('A newer Sync Creator state replaced this restore request.');
			}
			applySyncCreatorSessionRecord(restored);
			setSessionReadyDraftKey(restored.draftKey);
			Toast.success(I18n.t('syncCreator.historyRestored') || '작업 상태를 복원했습니다.');
		} catch (error) {
			console.error('[SyncDataCreator] Failed to restore checkpoint:', error);
			announceHistoryStatus(I18n.t('syncCreator.historyRestoreError') || '작업 상태를 복원하지 못했습니다.');
			Toast.error(I18n.t('syncCreator.historyRestoreError') || '작업 상태를 복원하지 못했습니다.');
		} finally {
			if (requestId === sessionCheckpointRestoreRequestRef.current) {
				setIsRestoringCheckpoint(false);
			}
		}
	}, [
		activeSessionDraftKey,
		announceHistoryStatus,
		applySyncCreatorSessionRecord,
		isDragging,
		isRestoringCheckpoint,
		mode,
		nextSessionClientRevision,
		sessionHistoryCursorId,
		syncCreatorDraftStore
	]);

	const historyCursorIndex = useMemo(() => (
		sessionHistory.findIndex(entry => entry.id === sessionHistoryCursorId)
	), [sessionHistory, sessionHistoryCursorId]);
	const moveHistoryCursor = useCallback((direction) => {
		if (!sessionHistory.length) return;
		const currentIndex = historyCursorIndex >= 0 ? historyCursorIndex : sessionHistory.length - 1;
		const nextIndex = Math.max(0, Math.min(sessionHistory.length - 1, currentIndex + direction));
		const nextEntry = sessionHistory[nextIndex];
		if (nextEntry && nextEntry.id !== sessionHistoryCursorId) {
			restoreHistoryCheckpoint(nextEntry.id);
		}
	}, [historyCursorIndex, restoreHistoryCheckpoint, sessionHistory, sessionHistoryCursorId]);
	const findRecoverableSessionRecord = useCallback((records) => {
		for (const record of Array.isArray(records) ? records : []) {
			const candidates = [record];
			const history = Array.isArray(record?.history) ? [...record.history].reverse() : [];
			history.forEach((entry) => {
				if (!entry?.snapshot || entry.id === record.historyCursorId) return;
				candidates.push({
					...record,
					draft: syncCreatorDraftStore.cloneValue(entry.snapshot),
					historyCursorId: entry.id
				});
			});
			for (const candidate of candidates) {
				try {
					return applySyncCreatorSessionRecord(candidate, { validateOnly: true });
				} catch (error) {
					console.warn('[SyncDataCreator] Skipped a damaged recovery state:', error);
				}
			}
		}
		return null;
	}, [applySyncCreatorSessionRecord, syncCreatorDraftStore]);

	useEffect(() => {
		if (!syncCreatorDraftStore || !sessionTrackKey) {
			setSessionHydrationComplete(true);
			return undefined;
		}

		let cancelled = false;
		const requestId = ++sessionRecoveryRequestRef.current;
		setSessionHydrationComplete(false);
		setSessionSaveState('loading');

		syncCreatorDraftStore.getDraftsForTrack(sessionTrackKey)
			.then((records) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				const record = findRecoverableSessionRecord(records);
				if (record) {
					const appliedRecord = applySyncCreatorSessionRecord(record, {
						announce: false,
						automatic: true
					});
					if (!appliedRecord) return;
					setSessionReadyDraftKey(record.draftKey);
					announceRecoveredSession(appliedRecord);
				} else {
					setSessionHistory([]);
					setSessionHistoryCursorId('');
					setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
				}
			})
			.catch((error) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				console.warn('[SyncDataCreator] Draft recovery is unavailable:', error);
				setSessionSaveState('error');
			})
			.finally(() => {
				if (!cancelled && requestId === sessionRecoveryRequestRef.current) {
					setSessionHydrationComplete(true);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [announceRecoveredSession, applySyncCreatorSessionRecord, findRecoverableSessionRecord, sessionTrackKey, syncCreatorDraftStore]);

	useEffect(() => {
		if (!sessionHydrationComplete || !activeSessionDraftKey || !syncCreatorDraftStore) return undefined;
		const shouldKeepCurrentSource = sessionSkipNextSourceRecoveryRef.current
			|| sessionAutoRecoveryBlockedRef.current;
		if (
			shouldKeepCurrentSource
			&& sessionAppliedDraftKeyRef.current !== activeSessionDraftKey
		) {
			sessionSkipNextSourceRecoveryRef.current = false;
			sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
			setSessionReadyDraftKey(activeSessionDraftKey);
			setSessionHistory([]);
			setSessionHistoryCursorId('');
			try {
				const baselineRecord = buildSyncCreatorSessionRecord();
				if (baselineRecord) {
					sessionBaselineDraftRef.current = syncCreatorDraftStore.cloneValue(baselineRecord.draft);
					latestSessionRecordRef.current = baselineRecord;
				}
				setSessionSaveState(sessionAutosaveEnabledRef.current ? 'dirty' : 'disabled');
			} catch (error) {
				console.warn('[SyncDataCreator] Failed to prepare the selected lyrics source:', error);
				setSessionSaveState('error');
			}
			return undefined;
		}
		if (sessionAppliedDraftKeyRef.current === activeSessionDraftKey) {
			setSessionReadyDraftKey(activeSessionDraftKey);
			return undefined;
		}
		if (sessionSkipRecoveryDraftKeyRef.current === activeSessionDraftKey) {
			sessionSkipRecoveryDraftKeyRef.current = '';
			sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
			setSessionReadyDraftKey(activeSessionDraftKey);
			setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
			return undefined;
		}

		let cancelled = false;
		const requestId = ++sessionRecoveryRequestRef.current;
		setSessionReadyDraftKey('');
		setSessionSaveState('loading');
		syncCreatorDraftStore.getDraft(activeSessionDraftKey)
			.then((record) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				const recoveredRecord = findRecoverableSessionRecord(record ? [record] : []);
				if (recoveredRecord) {
					const appliedRecord = applySyncCreatorSessionRecord(recoveredRecord, {
						announce: false,
						automatic: true
					});
					if (!appliedRecord) return;
					announceRecoveredSession(appliedRecord);
				} else {
					sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
					setSessionHistory([]);
					setSessionHistoryCursorId('');
					setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
					const baselineRecord = buildSyncCreatorSessionRecord();
					if (baselineRecord) {
						sessionBaselineDraftRef.current = syncCreatorDraftStore.cloneValue(baselineRecord.draft);
						latestSessionRecordRef.current = baselineRecord;
						if (sessionAutosaveEnabledRef.current) {
							syncCreatorDraftStore.saveDraft(baselineRecord).then((saved) => {
								if (
									!cancelled
									&& requestId === sessionRecoveryRequestRef.current
									&& activeSessionDraftKeyRef.current === saved?.draftKey
								) syncSessionUiFromRecord(saved);
							}).catch((error) => {
								console.warn('[SyncDataCreator] Failed to create the source checkpoint:', error);
							});
						}
					}
				}
				setSessionReadyDraftKey(activeSessionDraftKey);
			})
			.catch((error) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				console.warn('[SyncDataCreator] Failed to check the selected source draft:', error);
				sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
				setSessionReadyDraftKey(activeSessionDraftKey);
				setSessionSaveState('error');
			});

		return () => {
			cancelled = true;
		};
	}, [
		activeSessionDraftKey,
		announceRecoveredSession,
		applySyncCreatorSessionRecord,
		buildSyncCreatorSessionRecord,
		findRecoverableSessionRecord,
		sessionHydrationComplete,
		syncCreatorDraftStore,
		syncSessionUiFromRecord
	]);

	useEffect(() => {
		if (
			!syncCreatorDraftStore
			|| !sessionHydrationComplete
			|| !activeSessionDraftKey
			|| sessionReadyDraftKey !== activeSessionDraftKey
			|| !lyricsText
			|| sessionAutosaveSuppressedRef.current
		) return undefined;

		let record = null;
		try {
			record = buildSyncCreatorSessionRecord();
		} catch (error) {
			console.warn('[SyncDataCreator] Autosave skipped invalid data:', error);
			setSessionSaveState('error');
			return undefined;
		}
		if (!record) return undefined;

		latestSessionRecordRef.current = record;
		if (!isSessionAutosaveEnabled) {
			setSessionSaveState('disabled');
			return undefined;
		}
		setSessionSaveState('dirty');
		if (sessionAutosaveTimerRef.current) return undefined;
		sessionAutosaveTimerRef.current = setTimeout(async () => {
			sessionAutosaveTimerRef.current = null;
			const pendingRecord = latestSessionRecordRef.current;
			const writeGeneration = sessionWriteGenerationRef.current;
			if (
				!pendingRecord
				|| !sessionAutosaveEnabledRef.current
				|| pendingRecord.draftKey !== activeSessionDraftKeyRef.current
				|| sessionAutosaveSuppressedRef.current
			) return;
			setSessionSaveState('saving');
			try {
				const saved = await syncCreatorDraftStore.saveDraft(pendingRecord);
				if (
					saved?.draftKey === activeSessionDraftKeyRef.current
					&& writeGeneration === sessionWriteGenerationRef.current
					&& sessionAutosaveEnabledRef.current
					&& !sessionAutosaveSuppressedRef.current
				) {
					latestSessionRecordRef.current = saved;
					sessionAppliedDraftKeyRef.current = saved.draftKey;
					syncSessionUiFromRecord(saved);
				}
			} catch (error) {
				console.warn('[SyncDataCreator] Autosave failed:', error);
				if (writeGeneration === sessionWriteGenerationRef.current) {
					setSessionSaveState('error');
				}
			}
		}, SYNC_CREATOR_AUTOSAVE_INTERVAL_MS);

		return undefined;
	}, [
		activeSessionDraftKey,
		buildSyncCreatorSessionRecord,
		isSessionAutosaveEnabled,
		lyricsText,
		sessionHydrationComplete,
		sessionReadyDraftKey,
		syncCreatorDraftStore,
		syncSessionUiFromRecord
	]);

	useEffect(() => {
		const flushLatestSession = () => {
			const record = latestSessionRecordRef.current;
			if (
				record
				&& syncCreatorDraftStore
				&& sessionAutosaveEnabledRef.current
				&& !sessionAutosaveSuppressedRef.current
				&& record.draftKey === activeSessionDraftKeyRef.current
			) {
				syncCreatorDraftStore.saveDraft(record).catch((error) => {
					console.warn('[SyncDataCreator] Final autosave failed:', error);
				});
			}
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') flushLatestSession();
		};

		window.addEventListener('beforeunload', flushLatestSession);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			window.removeEventListener('beforeunload', flushLatestSession);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (sessionAutosaveTimerRef.current) {
				clearTimeout(sessionAutosaveTimerRef.current);
				sessionAutosaveTimerRef.current = null;
			}
			flushLatestSession();
		};
	}, [syncCreatorDraftStore]);

	useEffect(() => {
		const activeEntry = historyListRef.current?.querySelector?.('[aria-current="step"]');
		activeEntry?.scrollIntoView?.({ block: 'nearest' });
	}, [sessionHistory.length, sessionHistoryCursorId]);

	useEffect(() => {
		const handleHistoryShortcut = (event) => {
			const target = event.target;
			if (
				target?.isContentEditable
				|| ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
			) return;
			const key = String(event.key || '').toLowerCase();
			const hasPrimaryModifier = event.metaKey || event.ctrlKey;
			const isUndo = hasPrimaryModifier && key === 'z' && !event.shiftKey;
			const isRedo = (hasPrimaryModifier && key === 'z' && event.shiftKey)
				|| (event.ctrlKey && key === 'y');
			if (!isUndo && !isRedo) return;
			event.preventDefault();
			event.stopPropagation();
			moveHistoryCursor(isUndo ? -1 : 1);
		};

		window.addEventListener('keydown', handleHistoryShortcut, true);
		return () => window.removeEventListener('keydown', handleHistoryShortcut, true);
	}, [moveHistoryCursor]);

	const deleteActiveSyncCreatorDraft = useCallback(async ({ resumeAutosave = false } = {}) => {
		const draftKey = activeSessionDraftKeyRef.current;
		sessionAutosaveSuppressedRef.current = true;
		if (sessionAutosaveTimerRef.current) {
			clearTimeout(sessionAutosaveTimerRef.current);
			sessionAutosaveTimerRef.current = null;
		}
		sessionRecoveryRequestRef.current += 1;
		sessionCheckpointRestoreRequestRef.current += 1;
		sessionWriteGenerationRef.current += 1;
		latestSessionRecordRef.current = null;
		sessionAppliedDraftKeyRef.current = '';
		sessionBaselineDraftRef.current = null;
		setIsRestoringCheckpoint(false);
		setSessionReadyDraftKey('');
		setSessionHistory([]);
		setSessionHistoryCursorId('');
		setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
		if (!syncCreatorDraftStore || !draftKey) return;
		try {
			await syncCreatorDraftStore.flush();
			await syncCreatorDraftStore.deleteDraft(draftKey);
			if (resumeAutosave && draftKey === activeSessionDraftKeyRef.current) {
				sessionAutosaveSuppressedRef.current = false;
				sessionAppliedDraftKeyRef.current = draftKey;
				setSessionReadyDraftKey(draftKey);
			}
		} catch (error) {
			console.warn('[SyncDataCreator] Failed to clear the completed draft:', error);
			if (resumeAutosave && draftKey === activeSessionDraftKeyRef.current) {
				sessionAutosaveSuppressedRef.current = false;
				sessionAppliedDraftKeyRef.current = draftKey;
				setSessionReadyDraftKey(draftKey);
				setSessionSaveState('error');
			}
		}
	}, [syncCreatorDraftStore]);

	const clearLyricsCachesAfterSyncSubmit = useCallback(async (resolvedIsrc = '') => {
		const cacheIsrc = normalizeSyncCreatorIsrc(resolvedIsrc) || trackIsrc;
		window.SyncDataService?.clearCache?.(cacheIsrc || trackId, cacheIsrc ? { isrc: cacheIsrc } : {});
		const dispatchSyncDataUpdated = () => window.dispatchEvent(new CustomEvent('ivLyrics:sync-data-updated', {
			detail: {
				isrc: cacheIsrc || null,
				trackId,
				trackUri: trackId ? `spotify:track:${trackId}` : null,
				provider
			}
		}));
		try {
			await window.LyricsService?.clearTrackCache?.(trackId);
		} catch (error) {
			console.warn('[SyncDataCreator] Failed to clear lyrics cache after sync-data submit:', error);
		} finally {
			dispatchSyncDataUpdated();
		}
	}, [trackId, trackIsrc, provider]);

	const materializeSyncCreatorParallelDrafts = useCallback((sourceData) => {
		if (!sourceData || !Array.isArray(sourceData.lines)) return sourceData;
		const linesByStart = new Map(sourceData.lines.map(line => [Number(line?.start), line]));
		const lines = sourceData.lines.map((line) => {
			const lineIndex = lineIndexByStart.get(Number(line?.start));
			if (!Number.isInteger(lineIndex)) return line;
			const mergedIndexes = getMergedLineIndexesForStart(lineIndex, linesByStart);
			const isMergedWithNext = mergedIndexes.length > 1;
			const lineChars = isMergedWithNext
				? mergedIndexes.flatMap(index => Array.from(lyricsLines[index] || ''))
				: Array.from(lyricsLines[lineIndex] || '');
			const template = getParallelTemplateForLineData(
				line,
				lineChars,
				Number(line.start),
				isMergedWithNext
			);
			const parallel = mergeSyncCreatorParallelTemplate(template, line);
			if (!parallel || !Array.isArray(parallel.parts) || parallel.parts.length <= 1) {
				if (!Object.prototype.hasOwnProperty.call(manualParallelSplitDrafts, line.start) || !line.parallel) {
					return line;
				}
				const collapsedLine = { ...line };
				delete collapsedLine.parallel;
				return collapsedLine;
			}
			return repairSyncCreatorLineCharsFromParallel({
				...line,
				parallel
			});
		});
		return {
			...sourceData,
			version: lines.some(line => (
				(Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1)
				|| (Array.isArray(line?.styleRanges) && line.styleRanges.length > 0)
			))
				? SYNC_CREATOR_SYNC_DATA_VERSION
				: sourceData.version,
			lines
		};
	}, [getMergedLineIndexesForStart, getParallelTemplateForLineData, lineIndexByStart, lyricsLines, manualParallelSplitDrafts]);

	const handleSubmit = useCallback(async () => {
		if (!syncData || !syncData.lines || syncData.lines.length === 0) {
			Toast.error(I18n.t('syncCreator.noSyncData'));
			return;
		}
		const materializedSyncData = materializeSyncCreatorParallelDrafts(syncData);

		if (multiVocalMode) {
			const linesByStart = new Map(materializedSyncData.lines.map(line => [line.start, line]));
			for (let index = 0; index < lyricsLines.length; index++) {
				if (isLineCoveredByMergedPrevious(index, linesByStart)) {
					continue;
				}
				const lineText = lyricsLines[index] || '';
				const lineStart = lineCharOffsets[index];
				const lineData = linesByStart.get(lineStart);
				if (!lineData) {
					Toast.error(I18n.t('syncCreator.lineMissingSync', { line: index + 1 }) || `Line ${index + 1} has no sync yet.`);
					return;
				}

				const mergedIndexes = getMergedLineIndexesForStart(index, linesByStart);
				const isMergedWithNext = mergedIndexes.length > 1;
				const lineChars = isMergedWithNext
					? mergedIndexes.flatMap(lineIndex => Array.from(lyricsLines[lineIndex] || ''))
					: Array.from(lineText);
				const template = getParallelTemplateForLineData(lineData, lineChars, lineStart, isMergedWithNext);
				if (template?.parts?.length > 1) {
					const existingParts = Array.isArray(lineData.parallel?.parts) ? lineData.parallel.parts : [];
					for (const part of template.parts) {
						const existingPart = existingParts.find(item => item.id === part.id);
						if (!existingPart || !hasReusableSyncCreatorParallelChars(part, existingPart)) {
							Toast.error(I18n.t('syncCreator.lineAllPartsMissingSync', { line: index + 1 }) || `Sync every vocal part on line ${index + 1}.`);
							return;
						}
						if (!isSyncCreatorSpeakerMetaComplete(existingPart) || !(normalizeSyncCreatorKind(existingPart.kind) || SYNC_CREATOR_DEFAULT_KIND)) {
							Toast.error(I18n.t('syncCreator.linePartMetaRequired', { line: index + 1 }) || `Select SPEAKER and text effect for every vocal part on line ${index + 1}.`);
							return;
						}
					}
				} else if (!isSyncCreatorSpeakerMetaComplete({
					speaker: normalizeSyncCreatorSpeaker(lineData.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER,
					'speaker-fallback': sanitizeSyncCreatorSpeakerFallback(
						lineData.speaker,
						lineData['speaker-fallback'],
						false,
						lineData.speaker
					),
					'speaker-color': lineData['speaker-color']
				}) || !(normalizeSyncCreatorKind(lineData.kind) || SYNC_CREATOR_DEFAULT_KIND)) {
					Toast.error(I18n.t('syncCreator.lineMetaRequired', { line: index + 1 }) || `Select SPEAKER and text effect for line ${index + 1}.`);
					return;
				}
			}
		}

		const linesByStart = new Map();
		const coveredLineCount = lyricsLines.reduce((count, _, index) => {
			linesByStart.clear();
			for (const line of materializedSyncData.lines) {
				linesByStart.set(line.start, line);
			}
			return count + (isLineCoveredByMergedPrevious(index, linesByStart) ? 1 : 0);
		}, 0);
		if (materializedSyncData.lines.length + coveredLineCount < lyricsLines.length) {
			if (!confirm(I18n.t('syncCreator.incompleteConfirm'))) return;
		}

		const syncDataToSubmit = attachSelectedLrclibSource({
			...materializedSyncData,
			...(trackDurationMs > 0 ? { trackDurationMs } : {}),
			lines: materializedSyncData.lines.map(line => {
				const speaker = normalizeSyncCreatorSpeaker(line.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
				const kind = normalizeSyncCreatorKind(line.kind) || SYNC_CREATOR_DEFAULT_KIND;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					line['speaker-fallback'],
					true,
					line.speaker
				);
				const speakerColor = sanitizeSyncCreatorSpeakerColor(
					speaker,
					line['speaker-color'],
					true,
					speakerFallback
				);
				const nextLine = {
					...line,
					parallel: line.parallel ? sanitizeSyncCreatorParallel({
						...line.parallel,
						parts: Array.isArray(line.parallel.parts)
							? line.parallel.parts.map(part => {
								const partSpeaker = normalizeSyncCreatorSpeaker(part.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
								const partSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
									partSpeaker,
									part['speaker-fallback'],
									true,
									part.speaker
								);
								const partSpeakerColor = sanitizeSyncCreatorSpeakerColor(
									partSpeaker,
									part['speaker-color'],
									true,
									partSpeakerFallback
								);
								const nextPart = {
									...part,
									speaker: partSpeaker,
									kind: normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND
								};
								if (partSpeakerFallback) nextPart['speaker-fallback'] = partSpeakerFallback;
								else delete nextPart['speaker-fallback'];
								if (partSpeakerColor) nextPart['speaker-color'] = partSpeakerColor;
								else delete nextPart['speaker-color'];
								return nextPart;
							})
							: line.parallel.parts
					}) : line.parallel
				};

				if (multiVocalMode || speaker !== SYNC_CREATOR_DEFAULT_SPEAKER) {
					nextLine.speaker = speaker;
				} else {
					delete nextLine.speaker;
				}
				if (speakerFallback) nextLine['speaker-fallback'] = speakerFallback;
				else delete nextLine['speaker-fallback'];
				if (speakerColor) nextLine['speaker-color'] = speakerColor;
				else delete nextLine['speaker-color'];
				if (multiVocalMode || kind !== SYNC_CREATOR_DEFAULT_KIND) {
					nextLine.kind = kind;
				} else {
					delete nextLine.kind;
				}
				return nextLine;
			})
		});
		if (providerRef.current === 'lrclib' && !isCompleteSyncCreatorLrclibSource(syncDataToSubmit?.source)) {
			Toast.error(I18n.t('syncCreator.lrclibIdInvalid') || 'Enter a valid LRCLIB ID.');
			return;
		}
		try {
			assertValidSyncCreatorSyncData(syncDataToSubmit);
		} catch (error) {
			console.error('[SyncDataCreator] Submit validation error:', error);
			Toast.error(error?.message || I18n.t('syncCreator.submitError'));
			return;
		}
		const compactSyncDataToSubmit = compactSyncCreatorSyncData(
			syncDataToSubmit,
			lyricsFullTextChars,
			lyricsLanguage || undefined
		);

		const resolvedTrackIsrc = trackIsrc
			|| await window.SyncDataService?.resolveTrackIsrc?.(trackId, {
				...trackInfo,
				title: trackName,
				artist: artistName,
				album: albumName
			})
			|| '';

		if (!resolvedTrackIsrc) {
			Toast.error('이 곡의 ISRC를 확인할 수 없어 sync-data를 등록할 수 없습니다.');
			return;
		}

		setIsSubmitting(true);

		try {
			const submitMetadata = {
				isrc: resolvedTrackIsrc,
				title: trackName,
				artist: artistName,
				album: albumName,
				...(trackDurationMs > 0 ? { durationMs: trackDurationMs } : {})
			};
			if (typeof SyncDataService !== 'undefined' && SyncDataService.submitSyncData) {
				const result = await SyncDataService.submitSyncData(trackId, provider, compactSyncDataToSubmit, submitMetadata);
				if (result) {
					Toast.success(I18n.t('syncCreator.submitSuccess'));
					// 캐시 무효화
					await clearLyricsCachesAfterSyncSubmit(resolvedTrackIsrc);
					await deleteActiveSyncCreatorDraft();
					// 가사 페이지 새로고침
					setTimeout(() => {
						if (typeof window.reloadLyrics === 'function') {
							window.reloadLyrics(true);
						} else if (typeof window.lyricContainer?.reloadLyrics === 'function') {
							window.lyricContainer.reloadLyrics(true);
						}
					}, 500);
					if (onClose) onClose();
				} else {
					Toast.error(I18n.t('syncCreator.submitError'));
				}
			} else {
				const fallbackPayload = {
					isrc: resolvedTrackIsrc,
					'request-version': '20260701',
					provider,
					syncData: compactSyncDataToSubmit,
					...submitMetadata,
					...(trackId ? { trackId } : {})
				};
				const response = await fetch('https://lyrics.api.ivl.is/lyrics/sync-data', {
					method: 'POST',
					headers: Utils.getApiHeaders({ 'Content-Type': 'application/json' }),
					body: JSON.stringify(fallbackPayload)
				});

				if (response.ok) {
					Toast.success(I18n.t('syncCreator.submitSuccess'));
					// 캐시 무효화
					await clearLyricsCachesAfterSyncSubmit(resolvedTrackIsrc);
					await deleteActiveSyncCreatorDraft();
					// 가사 페이지 새로고침
					setTimeout(() => {
						if (typeof window.reloadLyrics === 'function') {
							window.reloadLyrics(true);
						} else if (typeof window.lyricContainer?.reloadLyrics === 'function') {
							window.lyricContainer.reloadLyrics(true);
						}
					}, 500);
					if (onClose) onClose();
				} else {
					Toast.error((await response.json()).error || I18n.t('syncCreator.submitError'));
				}
			}
		} catch (e) {
			console.error('[SyncDataCreator] Submit error:', e);
			Toast.error(e?.message || I18n.t('syncCreator.submitError'));
		}

		setIsSubmitting(false);
	}, [syncData, lyricsLines, lyricsFullTextChars, lyricsLanguage, lineCharOffsets, multiVocalMode, trackId, trackIsrc, provider, trackName, artistName, albumName, trackInfo, onClose, attachSelectedLrclibSource, clearLyricsCachesAfterSyncSubmit, deleteActiveSyncCreatorDraft, getParallelTemplateForLineData, getMergedLineIndexesForStart, isLineCoveredByMergedPrevious, materializeSyncCreatorParallelDrafts]);

	// 싱크 데이터 내보내기 (JSON 파일로 저장)
	const exportSyncData = useCallback(async () => {
		if (!syncData || !syncData.lines || syncData.lines.length === 0) {
			Toast.error(I18n.t('syncCreator.noSyncData') || 'No sync data to export');
			return;
		}

		try {
			const expandedExportData = attachSelectedLrclibSource(materializeSyncCreatorParallelDrafts(syncData));
			assertValidSyncCreatorSyncData(expandedExportData);
			const exportData = compactSyncCreatorSyncData(
				expandedExportData,
				lyricsFullTextChars,
				lyricsLanguage || undefined
			);
			const exportBaseName = [trackName, artistName]
				.map(value => String(value || '').trim())
				.filter(Boolean)
				.join('-');
			const fallbackBaseName = trackId ? `sync-${trackId}` : 'ivLyrics-sync';
			const fileName = `${Utils.sanitizeFileName(exportBaseName, fallbackBaseName)}.json`;
			const saveTarget = await Utils.requestSaveFileTarget(fileName, {
				description: 'ivLyrics Sync Data',
				mimeType: 'application/json',
				extensions: ['.json'],
			});
			if (saveTarget.canceled) return;

			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
			await Utils.saveBlobAs(blob, fileName, saveTarget);

			Toast.success(I18n.t('syncCreator.exportSuccess') || 'Exported sync data');
		} catch (error) {
			console.error('[SyncDataCreator] Export error:', error);
			Toast.error(error?.message || I18n.t('syncCreator.submitError'));
		}
	}, [artistName, attachSelectedLrclibSource, lyricsFullTextChars, lyricsLanguage, materializeSyncCreatorParallelDrafts, syncData, trackId, trackName]);

	// 싱크 데이터 불러오기 (JSON 파일에서)
	const importSyncData = useCallback(() => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async (e) => {
			const file = e.target.files[0];
			if (!file) return;

			try {
				const text = await file.text();
				const importedData = JSON.parse(text);

				// 형식 검증 - lines 배열이 있는지 확인
				if (!importedData.lines || !Array.isArray(importedData.lines)) {
					throw new Error('Invalid sync data format');
				}

				// 싱크 데이터 적용
				const sanitizedData = sanitizeSyncCreatorSyncData(importedData, lyricsFullTextChars);
				assertValidSyncCreatorSyncData(sanitizedData);
				if (sessionAutosaveTimerRef.current) {
					clearTimeout(sessionAutosaveTimerRef.current);
					sessionAutosaveTimerRef.current = null;
				}
				sessionRecoveryRequestRef.current += 1;
				sessionCheckpointRestoreRequestRef.current += 1;
				sessionWriteGenerationRef.current += 1;
				sessionAutosaveSuppressedRef.current = false;
				latestSessionRecordRef.current = null;
				setIsRestoringCheckpoint(false);
				const importedLrclibSource = sanitizedData?.source?.provider === 'lrclib'
					? sanitizedData.source
					: null;
				const importedDraftKey = syncCreatorDraftStore?.createDraftKey?.({
					trackKey: sessionTrackKey,
					provider,
					addonId,
					lyricsFingerprint: sessionLyricsFingerprint,
					lrclibId: importedLrclibSource?.lrclibId ?? ''
				}) || activeSessionDraftKey;
				if (importedDraftKey) {
					sessionSkipRecoveryDraftKeyRef.current = importedDraftKey;
					sessionAppliedDraftKeyRef.current = importedDraftKey;
					setSessionReadyDraftKey(importedDraftKey);
				}
				setSyncData(sanitizedData);
				setSelectedLrclibSourceValue(importedLrclibSource);
				setSessionSaveState(sessionAutosaveEnabledRef.current ? 'dirty' : 'disabled');

				Toast.success(I18n.t('syncCreator.importSuccess') || 'Imported sync data');
			} catch (err) {
				console.error('[SyncDataCreator] Import error:', err);
				Toast.error((I18n.t('syncCreator.importError') || 'Import failed') + ': ' + err.message);
			}
		};
		input.click();
	}, [
		activeSessionDraftKey,
		addonId,
		lyricsFullTextChars,
		provider,
		sessionLyricsFingerprint,
		sessionTrackKey,
		setSelectedLrclibSourceValue,
		syncCreatorDraftStore
	]);

	// 가사 전체 복사
	const copyAllLyrics = useCallback(async () => {
		if (!lyricsText) {
			Toast.error(I18n.t('syncCreator.noLyrics') || 'No lyrics to copy');
			return;
		}

		try {
			await navigator.clipboard.writeText(lyricsText);
			Toast.success(I18n.t('syncCreator.lyricsCopied') || 'Copied lyrics to clipboard');
		} catch (err) {
			console.error('[SyncDataCreator] Copy error:', err);
			Toast.error((I18n.t('syncCreator.copyError') || 'Copy failed') + ': ' + err.message);
		}
	}, [lyricsText]);

	const getLrclibCandidateId = useCallback((candidate) => {
		const id = candidate?.id ?? candidate?.lrclibId;
		if (id === undefined || id === null) return '';
		return String(id).trim();
	}, []);

	const copyLrclibCandidateId = useCallback(async (candidateOrId, event = null) => {
		event?.preventDefault?.();
		event?.stopPropagation?.();

		const id = typeof candidateOrId === 'object'
			? getLrclibCandidateId(candidateOrId)
			: String(candidateOrId || '').trim();
		if (!id) return;

		try {
			await navigator.clipboard.writeText(id);
			Toast.success(I18n.t('syncCreator.lrclibIdCopied') || 'Copied LRCLIB ID');
		} catch (err) {
			console.error('[SyncDataCreator] LRCLIB ID copy error:', err);
			Toast.error((I18n.t('syncCreator.copyError') || 'Copy failed') + ': ' + err.message);
		}
	}, [getLrclibCandidateId]);

	const formatTime = useCallback((ms) => {
		const totalSeconds = Math.floor(ms / 1000);
		return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
	}, []);

	const formatSeconds = useCallback((seconds) => `${seconds.toFixed(1)}s`, []);
	const syncLinesByStart = useMemo(() => {
		if (!Array.isArray(syncData?.lines) || syncData.lines.length === 0) return null;
		return new Map(syncData.lines.map((line) => [line.start, line]));
	}, [syncData]);

	const isCharSynced = useCallback((lineIndex, charIndex) => {
		if (!syncLinesByStart) return false;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncLinesByStart.get(lineStart);
		if (activeParallelPart) {
			const part = lineData?.parallel?.parts?.find(item => item.id === activeParallelPart.id);
			return hasReusableSyncCreatorParallelChars(activeParallelPart, part)
				&& part.chars.length > charIndex;
		}
		return lineData && lineData.chars && lineData.chars.length > charIndex;
	}, [syncLinesByStart, lineCharOffsets, activeParallelPart]);

	const getCharSyncTime = useCallback((lineIndex, charIndex) => {
		if (!syncLinesByStart) return null;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncLinesByStart.get(lineStart);
		if (activeParallelPart) {
			const part = lineData?.parallel?.parts?.find(item => item.id === activeParallelPart.id);
			return hasReusableSyncCreatorParallelChars(activeParallelPart, part)
				? part.chars[charIndex] ?? null
				: null;
		}
		return lineData?.chars?.[charIndex] ?? null;
	}, [syncLinesByStart, lineCharOffsets, activeParallelPart]);

	const getPreviewProgressIndexAtTime = useCallback((lineIndex, currentTimeSec) => {
		if (!syncLinesByStart) return -1;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncLinesByStart.get(lineStart);
		const savedPart = activeParallelPart
			? lineData?.parallel?.parts?.find(item => item.id === activeParallelPart.id)
			: null;
		const chars = activeParallelPart
			? (hasReusableSyncCreatorParallelChars(activeParallelPart, savedPart) ? savedPart.chars : null)
			: lineData?.chars;
		if (!lineData || !Array.isArray(chars) || chars.length === 0) return -1;
		if (currentTimeSec < chars[0]) return -1;

		for (let i = chars.length - 1; i >= 0; i--) {
			if (currentTimeSec < chars[i]) continue;
			if (i >= chars.length - 1) return i;

			const currentCharTime = Number(chars[i]);
			const nextCharTime = Number(chars[i + 1]);
			if (!Number.isFinite(currentCharTime) || !Number.isFinite(nextCharTime) || nextCharTime <= currentCharTime) {
				return i;
			}

			const ratio = Math.max(0, Math.min(1, (currentTimeSec - currentCharTime) / (nextCharTime - currentCharTime)));
			return i + ratio;
		}

		return -1;
	}, [syncLinesByStart, lineCharOffsets, activeParallelPart]);

	const getPreviewProgressIndex = useCallback((lineIndex) => {
		const progressIndex = getPreviewProgressIndexAtTime(lineIndex, position / 1000);
		return Number.isFinite(progressIndex) ? Math.floor(progressIndex) : -1;
	}, [getPreviewProgressIndexAtTime, position]);

	const applyPlaybackProgressVisual = useCallback((nextIndex) => {
		const numericIndex = Number(nextIndex);
		const normalizedIndex = Number.isFinite(numericIndex) ? Math.max(-1, Math.floor(numericIndex)) : -1;
		const previousIndex = lastPaintedPlaybackIndexRef.current;
		if (previousIndex === normalizedIndex) return;
		lastPaintedPlaybackIndexRef.current = normalizedIndex;

		if (useCurrentLineTextRun && rtlTextRunRef.current) {
			const percent = currentLineChars.length > 0 && normalizedIndex >= 0
				? Math.max(0, Math.min(100, ((normalizedIndex + 1) / currentLineChars.length) * 100))
				: 0;
			rtlTextRunRef.current.style.backgroundImage = getSyncCreatorProgressGradient(
				currentLineDirection,
				percent,
				currentSpeakerTextColor,
				currentSpeakerMutedColor
			);
			return;
		}

		const completedIndex = normalizedIndex;

		const paintChar = (index) => {
			const el = charElementsRef.current[index];
			if (!el) return;

			const isSynced = el.dataset.ivSyncCreatorSynced === '1';
			el.style.color = currentSpeakerTextColor;
			if (isSynced && normalizedIndex >= 0 && index <= completedIndex) {
				el.style.background = SYNC_CREATOR_PROGRESS_BACKGROUND;
			} else {
				el.style.background = isSynced ? SYNC_CREATOR_SYNCED_BACKGROUND : '';
			}
		};

		if (previousIndex < -1.5 || normalizedIndex < 0) {
			for (let index = 0; index < currentLineChars.length; index++) {
				paintChar(index);
			}
			return;
		}

		const previousCompletedIndex = previousIndex;
		const minChangedIndex = Math.max(0, Math.min(
			completedIndex,
			previousCompletedIndex
		));
		const maxChangedIndex = Math.min(currentLineChars.length - 1, Math.max(
			completedIndex,
			previousCompletedIndex
		));

		for (let index = minChangedIndex; index <= maxChangedIndex; index++) {
			paintChar(index);
		}
	}, [
		currentLineChars.length,
		currentLineDirection,
		currentSpeakerMutedColor,
		currentSpeakerTextColor,
		useCurrentLineTextRun
	]);

	useEffect(() => {
		charElementsRef.current = [];
		charHitBoxesRef.current = [];
		charScrollMetricsRef.current = [];
		lastPaintedPlaybackIndexRef.current = -2;
		lastPaintedRecordingIndexRef.current = -2;
	}, [currentLineIndex, lyricsText, activeParallelPartId, currentSpeakerTextColor]);

	useEffect(() => {
		if (mode === 'record') {
			lastPaintedPlaybackIndexRef.current = -2;
		}
	}, [mode, position, currentLineIndex, activeParallelPartId]);

	useEffect(() => {
		if (!syncLinesByStart || currentLineIndex >= lyricsLines.length) {
			applyPlaybackProgressVisual(-1);
			return;
		}

		let frameId = 0;
		let disposed = false;
		let lastPreviewPosition = NaN;
		const scheduleFrame = typeof requestAnimationFrame === 'function'
			? requestAnimationFrame
			: (callback) => setTimeout(() => callback(Date.now()), 16);
		const cancelFrame = typeof cancelAnimationFrame === 'function'
			? cancelAnimationFrame
			: clearTimeout;

		lastPaintedPlaybackIndexRef.current = -2;
		const paint = () => {
			if (disposed) return;
			const pos = Number(Spicetify.Player?.getProgress?.() || 0);
			// Keep polling for seeks/resume. A paused preview needs no repeat lookup,
			// unless another effect invalidated its paint; recording locks stay live.
			if (mode !== 'record' && Number.isFinite(pos) && pos === lastPreviewPosition
				&& lastPaintedPlaybackIndexRef.current >= -1) {
				frameId = scheduleFrame(paint);
				return;
			}
			lastPreviewPosition = pos;
			const nextIndex = Number.isFinite(pos)
				? getPreviewProgressIndexAtTime(currentLineIndex, pos / 1000)
				: -1;
			const lockedPlaybackIndex = mode === 'record'
				? getSyncCreatorLockedPlaybackProgressIndex(
					nextIndex,
					getActiveRecordingLockIndex(),
					recordingCharIndexRef.current
				)
				: null;

			if (lockedPlaybackIndex !== null) {
				applyRecordingProgressVisual(lockedPlaybackIndex);
			} else if (!(mode === 'record' && recordingCharIndexRef.current >= 0)) {
				applyPlaybackProgressVisual(nextIndex);
			}
			frameId = scheduleFrame(paint);
		};

		frameId = scheduleFrame(paint);
		return () => {
			disposed = true;
			if (frameId) cancelFrame(frameId);
		};
	}, [
		mode,
		syncLinesByStart,
		currentLineIndex,
		lyricsText,
		activeParallelPartId,
		lyricsLines.length,
		getPreviewProgressIndexAtTime,
		applyPlaybackProgressVisual,
		applyRecordingProgressVisual,
		getActiveRecordingLockIndex
	]);

	// Keep the creator on the same restrained visual system as Settings.
	// The names are retained because timing-state code already references them widely.
	const TOSS_BLUE = 'rgb(var(--spice-rgb-accent, 30, 215, 96))';
	const TOSS_BLUE_DEEP = 'rgb(var(--spice-rgb-accent, 30, 190, 82))';
	const TOSS_BLUE_SOFT = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.13)';
	const TOSS_BLUE_BORDER = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.36)';
	const TOSS_BLUE_RING = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.15)';
	const TOSS_SURFACE = '#11161b';
	const TOSS_SURFACE_STRONG = '#151a1f';
	const TOSS_BORDER = 'rgba(255,255,255,0.08)';

	const getModeStyle = () => {
		if (mode === 'record') return { background: 'rgba(255, 93, 93, 0.14)', color: '#ff8a8a', borderColor: 'rgba(255, 93, 93, 0.36)' };
		if (mode === 'preview') return { background: TOSS_BLUE_SOFT, color: TOSS_BLUE, borderColor: TOSS_BLUE_BORDER };
		return { background: 'rgba(255,255,255,0.06)', color: 'var(--spice-subtext)', borderColor: TOSS_BORDER };
	};

	const getModeLabel = () => {
		if (mode === 'record') return I18n.t('syncCreator.recordMode');
		if (mode === 'preview') return I18n.t('syncCreator.previewMode');
		return I18n.t('syncCreator.idleMode');
	};

	// 스타일
	const s = {
		overlay: {
			position: 'fixed', inset: 0,
			background: '#0f1215',
			color: 'var(--spice-text)',
			zIndex: 'var(--iv-layer-modal, 2147483647)',
			display: 'flex', flexDirection: 'column',
			overflow: 'hidden',
			fontFamily: 'var(--font-family, inherit)',
			letterSpacing: '-0.005em',
			'--iv-sync-accent-rgb': 'var(--spice-rgb-accent, 30, 215, 96)'
		},
		header: {
			display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
			minHeight: '56px',
			padding: '0 18px',
			background: '#11161b',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			flexShrink: 0,
			position: 'relative', zIndex: 3
		},
		backBtn: {
			background: 'transparent',
			border: '1px solid transparent',
			color: 'var(--spice-text)', cursor: 'pointer',
			padding: '7px 9px', borderRadius: '8px',
			display: 'inline-flex', alignItems: 'center', gap: '6px',
			fontSize: '12px', fontWeight: '600',
			letterSpacing: '-0.005em'
		},
		title: { fontSize: '15px', fontWeight: '700', margin: '0 0 0 2px', color: 'var(--spice-text)', letterSpacing: '-0.01em' },
		modeBadge: {
			padding: '4px 9px', borderRadius: '999px',
			fontSize: '10.5px', fontWeight: '700',
			letterSpacing: '0.02em',
			border: '1px solid transparent'
		},
		granularityControl: {
			display: 'inline-flex', alignItems: 'center', gap: '2px',
			padding: '3px', borderRadius: '9px',
			background: 'rgba(255,255,255,0.035)',
			border: `1px solid ${TOSS_BORDER}`
		},
		granularityButton: {
			height: '26px', padding: '0 9px', borderRadius: '6px',
			background: 'transparent', border: '1px solid transparent',
			color: 'var(--spice-subtext)', cursor: 'pointer',
			fontSize: '10.5px', fontWeight: '600', lineHeight: 1,
			whiteSpace: 'nowrap'
		},
		granularityButtonActive: {
			background: TOSS_BLUE_SOFT,
			borderColor: TOSS_BLUE_BORDER,
			color: TOSS_BLUE
		},
		wordInputSeparator: {
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			alignSelf: 'stretch', flexShrink: 0, boxSizing: 'border-box',
			margin: '0 0.22em',
			padding: usePrimaryCharacterPronunciation
				? '4px 0 6px'
				: `${hasCurrentLineFurigana ? 18 : 10}px 0 ${(hasCurrentLineCharacterPronunciation && currentLineRenderedPronunciationUnits.length === 0) ? 26 : 10}px`,
			fontSize: usePrimaryCharacterPronunciation ? '15px' : '32px',
			lineHeight: usePrimaryCharacterPronunciation ? 1.05 : 1.15,
			color: 'var(--spice-subtext)', opacity: 0.55,
			fontWeight: '500', userSelect: 'none', pointerEvents: 'none'
		},
		submitBtn: {
			background: TOSS_BLUE, color: '#fff',
			border: 'none', padding: '8px 17px', borderRadius: '999px',
			fontWeight: '700', cursor: 'pointer', fontSize: '13px',
			letterSpacing: '-0.005em',
			boxShadow: 'none'
		},
		trackRow: {
			display: 'flex', alignItems: 'center', gap: '14px',
			padding: '14px 18px',
			background: '#11161b',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			flexShrink: 0
		},
		albumArt: {
			width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover',
			boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)'
		},
		trackMeta: { flex: 1, minWidth: 0 },
		trackName: { fontSize: '14px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		artistName: { fontSize: '12px', color: 'var(--spice-subtext)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		providerRow: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' },
		bulkVocalControl: {
			display: 'inline-flex',
			alignItems: 'center',
			gap: '5px',
			padding: '0',
			borderRadius: '0',
			background: 'transparent',
			border: 'none'
		},
		bulkVocalLabel: { fontSize: '10.5px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
		virtualKaraokeBadge: {
			background: TOSS_BLUE_SOFT, color: TOSS_BLUE,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			borderRadius: '999px', padding: '5px 11px',
			fontSize: '10.5px', fontWeight: '700', whiteSpace: 'nowrap',
			letterSpacing: '0.02em'
		},
		select: {
			background: 'rgba(255,255,255,0.04)', color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`, borderRadius: '10px',
			height: '34px', padding: '0 11px', fontSize: '12px', fontWeight: '500',
			cursor: 'pointer', outline: 'none'
		},
		loadBtn: {
			background: 'rgba(255,255,255,0.055)', color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`,
			height: '32px', padding: '0 12px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '12px',
			letterSpacing: '-0.005em'
		},
		candidatePanelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px', gridColumn: '1 / -1' },
		candidatePanelTitle: { fontSize: '12px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '0.02em', textTransform: 'uppercase', opacity: 0.8 },
		candidatePanel: {
			display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)',
			gap: '12px', padding: '14px 18px',
			background: 'transparent',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			flexShrink: 0,
			minHeight: 0,
			overflow: 'hidden'
		},
		candidateList: { display: 'flex', flexDirection: 'column', gap: 0, maxHeight: '230px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px', minWidth: 0 },
		candidateItem: {
			background: 'transparent',
			border: 'none',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			borderRadius: '0', padding: '11px 10px',
			cursor: 'pointer', textAlign: 'left',
			color: 'var(--spice-text)'
		},
		candidateItemActive: {
			border: 'none',
			borderBottom: `1px solid ${TOSS_BLUE_BORDER}`,
			background: TOSS_BLUE_SOFT,
			boxShadow: `inset 2px 0 0 ${TOSS_BLUE}`
		},
		candidateItemApplied: { background: TOSS_BLUE_SOFT, borderColor: TOSS_BLUE_BORDER },
		candidateTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 },
		candidateTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.005em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		candidateSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '3px' },
		candidateMetaRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' },
		candidateBadge: {
			display: 'inline-flex', alignItems: 'center',
			padding: '3px 9px', borderRadius: '999px',
			fontSize: '10px', fontWeight: '700',
			background: TOSS_BLUE_SOFT,
			color: TOSS_BLUE,
			letterSpacing: '0.02em', textTransform: 'uppercase'
		},
		candidateIdBadge: {
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			flexShrink: 0, padding: '3px 8px', borderRadius: '999px',
			fontSize: '10px', fontWeight: '800',
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: TOSS_BLUE, cursor: 'copy',
			letterSpacing: '0', textTransform: 'none', lineHeight: 1.2
		},
		candidatePreview: {
			minHeight: '0',
			background: 'rgba(255,255,255,0.025)',
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '12px', padding: '14px 16px',
			display: 'flex', flexDirection: 'column', gap: '12px',
			maxHeight: '230px', overflow: 'hidden', minWidth: 0
		},
		candidatePreviewHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
		candidatePreviewTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.01em' },
		candidatePreviewSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '3px' },
		candidatePreviewActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
		candidateIdButton: {
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			flexShrink: 0, padding: '7px 11px', borderRadius: '999px',
			fontSize: '11px', fontWeight: '800',
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: TOSS_BLUE, cursor: 'copy',
			letterSpacing: '0', lineHeight: 1
		},
		candidatePreviewText: {
			margin: 0, whiteSpace: 'pre-wrap',
			fontSize: '12px', lineHeight: 1.6,
			color: 'var(--spice-text)',
			maxHeight: '140px', overflowY: 'auto',
			padding: '10px 12px',
			background: '#101418',
			border: '1px solid rgba(255,255,255,0.04)',
			borderRadius: '10px'
		},
		candidateEmpty: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', fontSize: '12px', color: 'var(--spice-subtext)', opacity: 0.7 },
		secondaryBtn: {
			background: 'transparent', color: 'var(--spice-subtext)',
			border: '1px solid transparent',
			height: '32px', padding: '0 10px', borderRadius: '8px',
			fontWeight: '600', cursor: 'pointer', fontSize: '12px',
			letterSpacing: '-0.005em'
		},
		characterPronunciationProgress: {
			display: 'flex', flexDirection: 'column', gap: '5px',
			width: '220px', maxWidth: 'min(220px, 100%)',
			padding: '8px 0', borderRadius: '0',
			border: 'none',
			background: 'transparent',
			boxSizing: 'border-box'
		},
		characterPronunciationProgressText: { fontSize: '11px', lineHeight: 1.3, color: 'var(--spice-subtext)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
		characterPronunciationProgressTrack: { width: '100%', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
		characterPronunciationProgressFill: { height: '100%', borderRadius: '999px', background: TOSS_BLUE, transition: 'width 160ms ease', boxShadow: 'none' },
		playbackRow: {
			display: 'flex', alignItems: 'center', gap: '10px',
			padding: '11px 18px',
			background: 'transparent',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			flexShrink: 0
		},
		playbackTime: { fontSize: '11px', color: 'var(--spice-subtext)', minWidth: '42px', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', fontWeight: '500' },
		playbackBar: {
			flex: 1, height: '6px',
			background: 'rgba(255,255,255,0.08)',
			borderRadius: '999px', cursor: 'pointer',
			overflow: 'hidden', position: 'relative'
		},
		playbackFill: { height: '100%', background: TOSS_BLUE, borderRadius: '999px', boxShadow: 'none' },
		seekBtn: {
			background: 'transparent', color: 'var(--spice-subtext)',
			border: '1px solid transparent',
			height: '28px', padding: '0 7px', borderRadius: '7px',
			fontSize: '10.5px', fontWeight: '600', cursor: 'pointer',
			letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums'
		},
		offsetRow: {
			display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
			padding: '9px 18px',
			background: 'transparent',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			flexShrink: 0
		},
		offsetLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '600', letterSpacing: '0.02em', textTransform: 'uppercase', opacity: 0.8 },
		offsetValue: {
			fontSize: '12px', color: 'var(--spice-text)', fontWeight: '700',
			minWidth: '64px', textAlign: 'center',
			padding: '4px 8px', borderRadius: '7px',
			background: 'transparent',
			border: 'none',
			fontVariantNumeric: 'tabular-nums'
		},
		offsetBtn: {
			background: 'transparent', color: 'var(--spice-subtext)',
			border: '1px solid transparent',
			height: '28px', padding: '0 7px', borderRadius: '7px',
			fontSize: '10.5px', fontWeight: '600', cursor: 'pointer',
			fontVariantNumeric: 'tabular-nums'
		},
		lineOffsetBox: {
			display: 'flex',
			flexDirection: 'column',
			gap: '8px',
			marginTop: '8px',
			padding: '10px 0',
			borderRadius: '0',
			background: 'transparent',
			borderTop: `1px solid ${TOSS_BORDER}`,
			borderBottom: `1px solid ${TOSS_BORDER}`
		},
		lineOffsetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
		lineOffsetLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase' },
		lineOffsetValue: {
			fontSize: '11px',
			color: 'var(--spice-text)',
			fontWeight: '800',
			fontVariantNumeric: 'tabular-nums',
			padding: '3px 0',
			borderRadius: '0',
			background: 'transparent',
			border: 'none'
		},
		lineOffsetButtonRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' },
		lineOffsetBtn: {
			background: 'transparent',
			color: 'var(--spice-subtext)',
			border: '1px solid transparent',
			borderRadius: '7px',
			height: '28px',
			padding: '0 8px',
			fontSize: '10.5px',
			fontWeight: '800',
			cursor: 'pointer',
			fontVariantNumeric: 'tabular-nums'
		},
		lyricsArea: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '18px 22px', overflow: 'hidden', position: 'relative', zIndex: 1 },
		lineNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '14px' },
		navBtn: {
			background: 'transparent', color: 'var(--spice-subtext)',
			border: '1px solid transparent',
			width: '34px', height: '34px', borderRadius: '8px',
			cursor: 'pointer',
			display: 'flex', alignItems: 'center', justifyContent: 'center',
			fontSize: '14px', fontWeight: '600'
		},
		lineInfo: { textAlign: 'center', minWidth: '120px' },
		lineCount: { fontSize: '18px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
		lineStatus: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '2px', fontWeight: '500' },
		multiVocalSwitchRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', margin: '-6px 0 12px' },
		multiVocalSwitchBtn: {
			background: 'transparent',
			border: '1px solid transparent',
			color: TOSS_BLUE,
			height: '30px', padding: '0 9px',
			borderRadius: '7px',
			fontSize: '11px',
			fontWeight: '800',
			cursor: 'pointer',
			letterSpacing: '-0.005em'
		},
		multiVocalBanner: {
			alignSelf: 'center',
			margin: '-6px 0 12px',
			padding: '7px 10px',
			borderRadius: '8px',
			background: TOSS_BLUE_SOFT,
			border: 'none',
			color: 'var(--spice-text)',
			fontSize: '11px',
			fontWeight: '700',
			letterSpacing: '-0.005em'
		},
		parallelSplitEditor: {
			alignSelf: 'stretch',
			maxWidth: '920px',
			width: '100%',
			margin: '-2px auto 12px',
			padding: '10px 0',
			borderRadius: '0',
			background: 'transparent',
			borderTop: `1px solid ${TOSS_BORDER}`,
			borderBottom: `1px solid ${TOSS_BORDER}`,
			boxSizing: 'border-box'
		},
		parallelSplitHeader: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
		parallelSplitTitle: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase' },
		parallelSplitBadge: {
			padding: '3px 8px',
			borderRadius: '999px',
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: 'var(--spice-text)',
			fontSize: '10px',
			fontWeight: '800',
			fontVariantNumeric: 'tabular-nums'
		},
		parallelSplitResetBtn: {
			background: 'transparent',
			border: '1px solid transparent',
			color: 'var(--spice-subtext)',
			padding: '4px 9px',
			borderRadius: '7px',
			fontSize: '10px',
			fontWeight: '800',
			cursor: 'pointer'
		},
		parallelSplitToggleBtn: {
			background: 'transparent',
			border: '1px solid transparent',
			color: 'var(--spice-subtext)',
			padding: '4px 9px',
			borderRadius: '7px',
			fontSize: '10px',
			fontWeight: '800',
			cursor: 'pointer'
		},
		parallelSplitBody: {
			maxHeight: 'min(220px, 24vh)',
			overflowY: 'auto',
			overflowX: 'hidden',
			overscrollBehavior: 'contain',
			scrollbarWidth: 'thin',
			padding: '2px 4px 4px'
		},
		parallelSplitTape: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', gap: '2px 0', lineHeight: 1.2 },
		parallelSplitChar: {
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			minWidth: '12px',
			padding: '5px 1px',
			color: 'var(--spice-text)',
			fontSize: '17px',
			fontWeight: '700',
			boxSizing: 'border-box'
		},
		parallelSplitBoundary: {
			width: '12px',
			minWidth: '12px',
			margin: '0 -2px',
			padding: 0,
			border: 'none',
			borderRadius: '999px',
			background: 'transparent',
			color: 'rgba(255,255,255,0.28)',
			cursor: 'pointer',
			fontSize: '14px',
			fontWeight: '900',
			lineHeight: 1
		},
		parallelSplitBoundaryActive: {
			background: TOSS_BLUE_SOFT,
			color: 'var(--spice-text)',
			boxShadow: `0 0 0 1px ${TOSS_BLUE_BORDER}`
		},
		parallelPartRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
		parallelPartBtn: {
			background: 'rgba(255,255,255,0.05)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '7px 12px', borderRadius: '999px',
			fontSize: '11px', fontWeight: '700', cursor: 'pointer',
			fontVariantNumeric: 'tabular-nums'
		},
		parallelPartBtnActive: {
			background: TOSS_BLUE_SOFT,
			borderColor: TOSS_BLUE_BORDER,
			color: 'var(--spice-text)'
		},
		parallelMetaRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '-4px 0 12px', flexWrap: 'wrap' },
		parallelMetaLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '700', letterSpacing: '0.02em', textTransform: 'uppercase' },
		parallelMetaSelect: {
			background: 'rgba(255,255,255,0.05)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '6px 10px', borderRadius: '8px',
			fontSize: '11px', fontWeight: '700', outline: 'none'
		},
		parallelMetaSelectDuet: {
			color: '#d9c7ff',
			background: 'rgba(156, 92, 255, 0.10)',
			borderColor: 'rgba(190, 150, 255, 0.38)'
		},
		parallelMetaOptionDuet: { color: '#c9a7ff', background: '#1b1424' },
		inspectorBlock: {
			width: 'min(940px, 100%)',
			margin: '0 auto 14px',
			padding: '0 0 14px',
			borderRadius: '0',
			background: 'transparent',
			border: 'none',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			boxShadow: 'none',
			boxSizing: 'border-box'
		},
		inspectorTitle: {
			fontSize: '11px',
			fontWeight: '850',
			color: 'var(--spice-subtext)',
			letterSpacing: '0.06em',
			textTransform: 'uppercase',
			margin: '0 0 10px'
		},
		inspectorGrid: {
			display: 'grid',
			gridTemplateColumns: 'minmax(0, 1fr)',
			gap: '16px',
			alignItems: 'start'
		},
		speakerGroups: { display: 'flex', flexDirection: 'column', gap: '11px' },
		speakerGroupTitle: { fontSize: '10px', fontWeight: '850', color: 'var(--spice-subtext)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' },
		speakerGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px' },
		speakerChoice: {
			minHeight: '34px',
			borderRadius: '8px',
			border: '1px solid transparent',
			background: 'transparent',
			color: 'var(--spice-text)',
			display: 'inline-flex',
			alignItems: 'center',
			gap: '8px',
			padding: '0 11px',
			fontSize: '11px',
			fontWeight: '850',
			cursor: 'pointer',
			textAlign: 'left',
			letterSpacing: '0.01em',
			outline: 'none'
		},
		speakerDot: { width: '8px', height: '8px', borderRadius: '999px', flexShrink: 0 },
		customSpeakerColorEditor: {
			display: 'grid',
			gridTemplateColumns: '42px minmax(0, 1fr)',
			gap: '10px',
			alignItems: 'start',
			marginTop: '10px',
			padding: '12px 0 0',
			borderRadius: '0',
			border: 'none',
			borderTop: `1px solid ${TOSS_BORDER}`,
			background: 'transparent'
		},
		customSpeakerColorPicker: {
			width: '42px',
			height: '42px',
			padding: '3px',
			borderRadius: '8px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'transparent',
			cursor: 'pointer'
		},
		customSpeakerColorFields: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
		customSpeakerColorLabel: { fontSize: '11px', fontWeight: '850', color: 'var(--spice-text)' },
		customSpeakerColorDescription: { fontSize: '10px', lineHeight: 1.45, color: 'var(--spice-subtext)' },
		customSpeakerColorText: {
			width: '100%',
			minHeight: '34px',
			boxSizing: 'border-box',
			borderRadius: '8px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'rgba(0,0,0,0.18)',
			color: 'var(--spice-text)',
			fontFamily: 'monospace',
			fontSize: '12px',
			padding: '0 10px',
			outline: 'none'
		},
		effectGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' },
		effectCard: {
			minHeight: '72px',
			borderRadius: '8px',
			border: '1px solid transparent',
			background: 'rgba(255,255,255,0.025)',
			color: 'var(--spice-text)',
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			padding: '12px 8px',
			cursor: 'pointer',
			overflow: 'visible',
			boxSizing: 'border-box',
			outline: 'none'
		},
		effectLabel: {
			minWidth: 0,
			maxWidth: '100%',
			overflow: 'visible',
			whiteSpace: 'nowrap',
			fontSize: '19px',
			lineHeight: 1.1,
			fontWeight: '900',
			color: 'var(--spice-text)',
			transformOrigin: 'center',
			letterSpacing: 0
		},
		effectStripRow: {
			flexShrink: 0,
			display: 'grid',
			gridTemplateColumns: 'auto minmax(0, 1fr)',
			alignItems: 'center',
			gap: '12px',
			marginTop: '4px',
			padding: '12px 0 0',
			borderTop: `1px solid ${TOSS_BORDER}`,
			containerType: 'inline-size',
			containerName: 'ivlyrics-sync-effects'
		},
		effectStripTitle: {
			fontSize: '12px',
			fontWeight: '850',
			color: 'var(--spice-subtext)',
			whiteSpace: 'nowrap',
			letterSpacing: '0.04em'
		},
		effectStrip: {
			display: 'flex',
			flexWrap: 'nowrap',
			alignItems: 'stretch',
			gap: '6px',
			width: '100%',
			minWidth: 0,
			overflowX: 'auto',
			overflowY: 'hidden',
			padding: '4px 4px 8px',
			overscrollBehaviorX: 'contain',
			scrollbarWidth: 'thin',
			scrollPaddingInline: '4px'
		},
		effectPill: {
			flex: '0 0 auto',
			minWidth: '105px',
			height: '54px',
			borderRadius: '9px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'rgba(255,255,255,0.025)',
			color: 'var(--spice-text)',
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			padding: '0 14px',
			cursor: 'pointer',
			overflow: 'visible',
			outline: 'none',
			scrollSnapAlign: 'start'
		},
		effectPillLabel: {
			minWidth: 0,
			whiteSpace: 'nowrap',
			fontSize: '16px',
			fontWeight: '850',
			lineHeight: 1.1,
			color: 'inherit',
			transformOrigin: 'center'
		},
		stageEffectPreview: {
			width: '100%',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			overflow: 'visible',
			color: currentSpeakerTextColor,
			'--lyrics-color-active': currentSpeakerTextColor,
			'--lyrics-color-inactive': currentSpeakerMutedColor
		},
		parallelStack: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'stretch' },
		parallelStackLine: {
			width: '100%',
			flexShrink: 0,
			background: 'transparent',
			color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '10px',
			padding: '12px 14px 10px',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			gap: '7px',
			textAlign: 'center',
			cursor: mode === 'record' ? 'pointer' : 'default',
			boxSizing: 'border-box'
		},
		parallelStackLineActive: {
			background: TOSS_BLUE_SOFT,
			borderColor: TOSS_BLUE_BORDER,
			boxShadow: `inset 0 0 0 1px ${TOSS_BLUE_RING}`
		},
		parallelStackLineDuet: {
			background: 'rgba(156, 92, 255, 0.055)',
			borderColor: 'rgba(190, 150, 255, 0.20)'
		},
		parallelStackLineDuetActive: {
			background: 'rgba(156, 92, 255, 0.13)',
			borderColor: 'rgba(200, 168, 255, 0.52)'
		},
		parallelStackMeta: {
			color: 'var(--spice-subtext)',
			fontSize: '10px',
			fontWeight: '800',
			letterSpacing: '0.04em',
			textTransform: 'uppercase',
			fontVariantNumeric: 'tabular-nums',
			lineHeight: 1
		},
		parallelStackMetaDuet: { color: '#d9c7ff' },
		parallelStackText: { display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', gap: '0px', maxWidth: '100%' },
		parallelStackJoinSeparator: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', minWidth: '14px', flexShrink: 0, color: 'transparent', pointerEvents: 'none' },
		parallelStackChar: {
			padding: '6px 1px',
			borderRadius: 0,
			fontSize: '28px',
			fontWeight: '600',
			minWidth: '6px',
			boxSizing: 'border-box',
			textAlign: 'center',
			flexShrink: 0,
			color: 'inherit',
			letterSpacing: 0,
			lineHeight: 1.15
		},
		parallelStackCharSynced: { background: SYNC_CREATOR_SYNCED_BACKGROUND },
		lyricsBox: {
			background: '#12171c',
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '12px',
			padding: '32px 20px',
			display: 'flex', flexDirection: 'column', alignItems: 'center',
			cursor: mode === 'record' ? 'pointer' : 'default',
			userSelect: 'none', marginBottom: '12px',
			boxShadow: 'none'
		},
		lyricsBoxParallelScrollable: {
			alignItems: 'stretch',
			maxHeight: 'min(430px, 44vh)',
			overflowY: 'auto',
			overflowX: 'hidden',
			overscrollBehavior: 'contain',
			scrollbarWidth: 'thin',
			paddingRight: '14px',
			paddingLeft: '14px',
			touchAction: 'pan-y'
		},
		lyricsScroll: { width: '100%', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '28px', display: 'flex', justifyContent: 'center' },
		lyricsLine: { display: 'inline-flex', flexWrap: 'nowrap', gap: '0px', paddingLeft: '32px', paddingRight: '32px', justifyContent: 'center', alignItems: usePrimaryCharacterPronunciation ? 'flex-start' : 'stretch', color: currentSpeakerTextColor },
		rtlLyricsLine: { display: 'block', width: '100%', paddingLeft: '32px', paddingRight: '32px', textAlign: 'center', direction: 'rtl', unicodeBidi: 'plaintext', color: currentSpeakerTextColor },
		rtlTextRun: { display: 'inline-block', maxWidth: '100%', padding: '10px 1px', fontSize: '32px', fontWeight: '600', lineHeight: 1.45, letterSpacing: 0, whiteSpace: 'pre', cursor: mode === 'record' ? 'pointer' : 'default', color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' },
		charSpan: { padding: usePrimaryCharacterPronunciation ? '4px 4px 6px' : `${hasCurrentLineFurigana ? 18 : 10}px 1px ${(hasCurrentLineCharacterPronunciation && currentLineRenderedPronunciationUnits.length === 0) ? 26 : 10}px`, marginInline: 0, borderRadius: 0, cursor: mode === 'record' ? 'pointer' : 'default', position: 'relative', fontSize: usePrimaryCharacterPronunciation ? '15px' : '32px', fontWeight: '600', minWidth: usePrimaryCharacterPronunciation ? '18px' : '6px', minHeight: usePrimaryCharacterPronunciation ? '68px' : undefined, boxSizing: 'border-box', textAlign: 'center', flexShrink: 0, color: currentSpeakerTextColor, letterSpacing: 0, lineHeight: usePrimaryCharacterPronunciation ? 1.05 : 1.15 },
		charJoinSeparator: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: usePrimaryCharacterPronunciation ? '12px' : '16px', minWidth: usePrimaryCharacterPronunciation ? '12px' : '16px', padding: 0, flexShrink: 0, color: 'transparent', pointerEvents: 'none' },
		charSpanPronunciationPrimary: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '2px' },
		charWordGroup: { display: 'inline-flex', position: 'relative', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', flexShrink: 0, borderRadius: 0, padding: '0 0 3px', boxSizing: 'border-box', color: currentSpeakerTextColor },
		charWordGroupPrimary: { flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', minHeight: '68px', padding: '2px 3px 6px', boxSizing: 'border-box' },
		charWordOriginalRow: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: usePrimaryCharacterPronunciation ? '30px' : 'auto', whiteSpace: 'nowrap' },
		charWordSpace: { display: 'inline-flex', width: usePrimaryCharacterPronunciation ? '10px' : '12px', minWidth: usePrimaryCharacterPronunciation ? '10px' : '12px', padding: 0, margin: 0, flexShrink: 0, color: 'transparent', background: 'transparent', pointerEvents: mode === 'record' ? 'auto' : 'none', boxSizing: 'border-box' },
		charSpanInWord: { padding: `${hasCurrentLineFurigana ? 18 : 10}px 1px 8px`, minWidth: '6px', minHeight: undefined },
		charSpanInWordPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', width: 'auto', minHeight: '24px', padding: '4px 0 0', fontSize: '14px', lineHeight: 1, letterSpacing: 0 },
		charWordPronunciation: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '13px', marginTop: '1px', fontSize: '10px', fontWeight: '700', color: currentSpeakerTextColor, opacity: 0.76, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charWordPronunciationPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '28px', fontSize: '24px', fontWeight: '700', color: currentSpeakerTextColor, lineHeight: 1.05, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charFixedPrimaryCell: { width: '28px', minWidth: '28px', maxWidth: '28px', padding: '4px 0 6px', overflow: 'visible' },
		charFuriganaWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1em', lineHeight: 'inherit' },
		charFuriganaText: { position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: '1px', fontSize: `${Number(window.CONFIG?.visual?.["furigana-font-size"]) || 11}px`, fontWeight: window.CONFIG?.visual?.["furigana-font-weight"] || '500', color: 'inherit', opacity: (Number(window.CONFIG?.visual?.["furigana-opacity"]) || 80) / 100, lineHeight: 1, letterSpacing: 0, whiteSpace: 'nowrap', pointerEvents: 'none' },
		charPronunciation: { position: 'absolute', bottom: '7px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '600', color: currentSpeakerTextColor, opacity: 0.76, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charOriginalSmall: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '30px', minWidth: '100%', fontSize: '14px', fontWeight: '600', color: 'inherit', opacity: 0.82, lineHeight: 1, letterSpacing: 0 },
		charPronunciationPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '26px', fontSize: '24px', fontWeight: '700', color: 'inherit', lineHeight: 1.05, whiteSpace: 'nowrap', letterSpacing: 0 },
		charPronunciationPrimaryFixed: { position: 'absolute', left: '50%', bottom: '7px', transform: 'translateX(-50%)', width: 'max-content', minWidth: '100%', textAlign: 'center', pointerEvents: 'none' },
		charSynced: { background: SYNC_CREATOR_SYNCED_BACKGROUND },
		charPlayed: { background: SYNC_CREATOR_PROGRESS_BACKGROUND, color: currentSpeakerTextColor },
		charRecording: { background: 'rgba(255, 152, 0, 0.6)' },
		charLocked: { boxShadow: `inset 0 -3px 0 ${TOSS_BLUE}` },
		charTime: { position: 'absolute', bottom: usePrimaryCharacterPronunciation ? '-18px' : (hasCurrentLineCharacterPronunciation ? '-16px' : '-20px'), left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: 'var(--spice-subtext)', whiteSpace: 'nowrap' },
		nextLineBox: { textAlign: 'center', padding: '10px 8px', opacity: 0.55 },
		nextLineLabel: { fontSize: '10px', color: 'var(--spice-subtext)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' },
		nextLineText: { fontSize: '14px', color: 'var(--spice-subtext)', lineHeight: 1.7, letterSpacing: '-0.005em' },
		hint: { fontSize: '12px', color: 'var(--spice-subtext)', textAlign: 'center', padding: '10px 8px', fontStyle: 'italic', opacity: 0.8 },
		progressRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '7px 18px', fontSize: '11.5px', color: 'var(--spice-subtext)', flexShrink: 0, fontWeight: '500', fontVariantNumeric: 'tabular-nums' },
		controls: {
			display: 'flex', flexWrap: 'wrap', gap: '4px',
			padding: '10px 18px',
			justifyContent: 'center',
			borderTop: `1px solid ${TOSS_BORDER}`,
			background: '#11161b',
			flexShrink: 0
		},
		ctrlBtn: {
			background: 'transparent', color: 'var(--spice-subtext)',
			border: '1px solid transparent',
			height: '32px', padding: '0 10px', borderRadius: '7px',
			fontWeight: '600', cursor: 'pointer', fontSize: '12px',
			letterSpacing: '-0.005em'
		},
		modeBtn: {
			border: '1px solid transparent',
			height: '32px', padding: '0 12px', borderRadius: '8px',
			fontWeight: '700', cursor: 'pointer', fontSize: '12px',
			minWidth: '92px', letterSpacing: '-0.005em'
		},
		deleteBtn: {
			background: 'transparent',
			color: '#ff7c73',
			border: '1px solid transparent',
			height: '32px', padding: '0 10px', borderRadius: '7px',
			fontWeight: '600', cursor: 'pointer', fontSize: '12px',
			letterSpacing: '-0.005em'
		},
		loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--spice-subtext)', fontSize: '13px', fontWeight: '500' },
		error: { textAlign: 'center', padding: '40px', color: '#ff7a72', fontSize: '13px', fontWeight: '500' },
		// 공통 모달 스타일
		lrcLibModal: {
			position: 'fixed', inset: 0,
			background: 'rgba(0,0,0,0.72)',
			zIndex: 'var(--iv-layer-modal, 2147483647)',
			display: 'flex', alignItems: 'center', justifyContent: 'center',
			padding: '24px'
		},
		lrcLibContent: {
			background: '#171b20',
			border: '1px solid rgba(255,255,255,0.08)',
			borderRadius: '14px', padding: '24px',
			width: '90%', maxWidth: '620px', maxHeight: '85vh',
			display: 'flex', flexDirection: 'column', gap: '14px',
			boxShadow: '0 24px 64px rgba(0,0,0,0.42)'
		},
		lrcLibTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--spice-text)', margin: 0, letterSpacing: '-0.015em' },
		lrcLibDesc: { fontSize: '13px', color: 'var(--spice-subtext)', lineHeight: 1.55 },
		multiVocalDecisionPreview: {
			fontSize: '13px',
			lineHeight: 1.55,
			color: 'var(--spice-text)',
			padding: '12px 14px',
			background: 'rgba(255,255,255,0.045)',
			border: '1px solid rgba(255,255,255,0.08)',
			borderRadius: '12px',
			whiteSpace: 'nowrap',
			overflow: 'hidden',
			textOverflow: 'ellipsis'
		},
		parentheticalLayoutOriginal: {
			fontSize: '12px',
			lineHeight: 1.55,
			color: 'var(--spice-subtext)',
			padding: '10px 12px',
			background: 'rgba(255,255,255,0.035)',
			border: '1px solid rgba(255,255,255,0.07)',
			borderRadius: '10px',
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-word'
		},
		parentheticalLayoutGrid: {
			display: 'grid',
			gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
			gap: '10px'
		},
		parentheticalLayoutOption: {
			background: 'transparent',
			border: '1px solid rgba(255,255,255,0.09)',
			borderRadius: '10px',
			padding: '13px',
			color: 'var(--spice-text)',
			textAlign: 'left',
			cursor: 'pointer',
			display: 'flex',
			flexDirection: 'column',
			gap: '9px',
			minWidth: 0
		},
		parentheticalLayoutOptionPrimary: {
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			boxShadow: 'none'
		},
		parentheticalLayoutOptionTitle: { fontSize: '13px', fontWeight: '800', letterSpacing: '-0.005em' },
		parentheticalLayoutOptionDesc: { fontSize: '11.5px', color: 'var(--spice-subtext)', lineHeight: 1.45 },
		parentheticalLayoutPreview: {
			display: 'flex',
			flexDirection: 'column',
			gap: '4px',
			padding: '10px',
			borderRadius: '9px',
			background: 'rgba(0,0,0,0.22)',
			border: '1px solid rgba(255,255,255,0.07)',
			fontSize: '13px',
			fontWeight: '700',
			lineHeight: 1.35,
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-word'
		},
		lrcLibBtnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '4px' },
		lrcLibBtn: {
			background: TOSS_BLUE, color: '#fff',
			border: 'none', height: '34px', padding: '0 16px', borderRadius: '999px',
			fontWeight: '700', cursor: 'pointer', fontSize: '13px',
			letterSpacing: '-0.005em',
			boxShadow: 'none'
		},
		lrcLibBtnSecondary: {
			background: 'rgba(255,255,255,0.045)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			height: '34px', padding: '0 16px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '13px'
		},
		lrcLibBtnCancel: {
			background: 'transparent', color: 'var(--spice-subtext)',
			border: '1px solid transparent',
			height: '34px', padding: '0 14px', borderRadius: '8px',
			fontWeight: '600', cursor: 'pointer', fontSize: '13px'
		},
		// 키보드 단축키 스타일
		shortcutsContainer: {
			display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px 10px',
			padding: '12px 0',
			background: 'transparent',
			border: 'none',
			borderRadius: '0', marginTop: '10px'
		},
		shortcutItem: { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '500' },
		shortcutKey: {
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			minWidth: '26px', height: '24px', padding: '0 7px',
			background: 'rgba(255,255,255,0.06)',
			color: 'var(--spice-text)', borderRadius: '6px',
			fontSize: '10.5px', fontWeight: '700',
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
			border: '1px solid rgba(255,255,255,0.10)',
			boxShadow: 'none'
		},
		shortcutDesc: { color: 'var(--spice-subtext)' },
		workspace: {
			flex: 1,
			minHeight: 0,
			display: 'grid',
			gridTemplateColumns: 'minmax(220px, 260px) minmax(480px, 1fr) minmax(280px, 340px)',
			gap: 0,
			padding: 0,
			overflow: 'hidden'
		},
		sideRail: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 0', background: '#11161b', borderRight: `1px solid ${TOSS_BORDER}` },
		centerRail: { minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, background: '#0f1215' },
		rightRail: { minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, padding: 0, background: '#11161b', borderLeft: `1px solid ${TOSS_BORDER}` },
		inspectorScroll: { minHeight: 0, flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' },
		historyPanel: {
			flex: '0 1 clamp(190px, 28vh, 300px)',
			minHeight: '130px',
			display: 'flex',
			flexDirection: 'column',
			background: '#11161b',
			borderTop: `1px solid ${TOSS_BORDER}`,
			overflow: 'hidden'
		},
		historyResizeHandle: {
			height: '9px',
			flexShrink: 0,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			cursor: 'ns-resize',
			touchAction: 'none',
			outline: 'none'
		},
		historyResizeGrip: {
			width: '34px',
			height: '2px',
			borderRadius: '999px',
			background: 'rgba(255,255,255,0.22)'
		},
		historyHeader: { padding: '12px 14px 9px', flexShrink: 0 },
		historyTitleRow: { display: 'flex', alignItems: 'center', gap: '8px' },
		historyTitle: { flex: 1, minWidth: 0, fontSize: '12px', fontWeight: '800', color: 'var(--spice-text)', letterSpacing: '-0.01em' },
		historyCount: { fontSize: '10px', color: 'var(--spice-subtext)', fontVariantNumeric: 'tabular-nums' },
		historyAutosaveToggle: {
			height: '26px', padding: '0 5px 0 7px',
			display: 'inline-flex', alignItems: 'center', gap: '6px',
			border: '1px solid transparent', borderRadius: '7px',
			background: 'transparent', color: 'var(--spice-subtext)', cursor: 'pointer',
			whiteSpace: 'nowrap'
		},
		historyAutosaveLabel: { fontSize: '9.5px', fontWeight: '700', lineHeight: 1 },
		historyAutosaveTrack: {
			position: 'relative', width: '27px', height: '15px', flexShrink: 0,
			borderRadius: '999px', background: 'rgba(255,255,255,0.16)',
			boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
			transition: 'background 160ms ease, box-shadow 160ms ease'
		},
		historyAutosaveTrackActive: {
			background: TOSS_BLUE,
			boxShadow: `inset 0 0 0 1px ${TOSS_BLUE_BORDER}`
		},
		historyAutosaveThumb: {
			position: 'absolute', top: '2px', left: '2px',
			width: '11px', height: '11px', borderRadius: '999px',
			background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
			transition: 'transform 160ms ease'
		},
		historyActions: { display: 'inline-flex', alignItems: 'center', gap: '2px' },
		historyIconButton: {
			width: '28px', height: '28px', padding: 0,
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			border: '1px solid transparent', borderRadius: '7px',
			background: 'transparent', color: 'var(--spice-subtext)', cursor: 'pointer'
		},
		historyMeta: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, marginTop: '5px', fontSize: '10px', color: 'var(--spice-subtext)' },
		historySource: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		historySaveState: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' },
		historySaveDot: { width: '5px', height: '5px', borderRadius: '999px', flexShrink: 0 },
		historyList: {
			listStyle: 'none', margin: 0, padding: '0 0 8px',
			minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
			overscrollBehavior: 'contain'
		},
		historyItem: { listStyle: 'none', margin: 0, padding: 0 },
		historyButton: {
			position: 'relative', width: '100%', minHeight: '42px',
			display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto',
			alignItems: 'center', gap: '7px',
			padding: '7px 13px 7px 11px',
			border: 'none', borderRadius: 0,
			background: 'transparent', color: 'var(--spice-text)',
			textAlign: 'left', cursor: 'pointer', boxShadow: 'none'
		},
		historyButtonActive: {
			background: TOSS_BLUE_SOFT,
			boxShadow: `inset 2px 0 0 ${TOSS_BLUE}`,
			cursor: 'default'
		},
		historyTimeline: { alignSelf: 'stretch', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' },
		historyLine: { position: 'absolute', top: '-7px', bottom: '-7px', width: '1px', background: TOSS_BORDER },
		historyDot: { position: 'relative', zIndex: 1, width: '7px', height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.30)', boxShadow: '0 0 0 3px #11161b' },
		historyDotActive: { background: TOSS_BLUE, boxShadow: `0 0 0 3px #11161b, 0 0 0 4px ${TOSS_BLUE_BORDER}` },
		historyContent: { minWidth: 0 },
		historyLabel: { fontSize: '11px', fontWeight: '750', color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		historyText: { marginTop: '2px', fontSize: '9.5px', color: 'var(--spice-subtext)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		historyTime: { fontSize: '9.5px', color: 'var(--spice-subtext)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
		historyEmpty: { padding: '18px 14px', color: 'var(--spice-subtext)', fontSize: '10.5px', lineHeight: 1.5, textAlign: 'center' },
		historyLive: { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 },
		panel: {
			background: 'transparent',
			border: 'none',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			borderRadius: 0,
			padding: '16px 18px',
			boxShadow: 'none'
		},
		panelTight: { padding: '14px 18px' },
		panelTitle: { fontSize: '12px', fontWeight: '700', color: 'var(--spice-text)', marginBottom: '10px', letterSpacing: '-0.01em' },
		panelSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', lineHeight: 1.4, marginTop: '-6px', marginBottom: '10px' },
		sourceTrack: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', minWidth: 0 },
		sourceAlbumArt: { width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.36)' },
		sourceControls: { display: 'flex', flexDirection: 'column', gap: '6px' },
		characterPronunciationTarget: {
			display: 'flex', flexDirection: 'column', gap: '6px',
			padding: '9px 0 3px', color: 'var(--spice-subtext)'
		},
		characterPronunciationTargetCompact: {
			display: 'inline-flex', alignItems: 'center', gap: '6px'
		},
		characterPronunciationTargetLabel: {
			fontSize: '10.5px', fontWeight: '700', letterSpacing: '0.02em'
		},
		sourceProvider: {
			display: 'flex', alignItems: 'center', gap: '8px',
			minHeight: '34px', padding: '0 11px', borderRadius: '10px',
			background: 'rgba(255,255,255,0.035)', border: `1px solid ${TOSS_BORDER}`
		},
		sourceProviderName: { fontSize: '12px', fontWeight: '700', color: 'var(--spice-text)' },
		sourceButtonRow: { display: 'grid', gridTemplateColumns: '1fr', gap: '6px' },
		fullWidthButton: { width: '100%', justifyContent: 'center' },
		lrclibIdBox: {
			display: 'flex',
			flexDirection: 'column',
			gap: '6px',
			padding: '10px 0',
			borderRadius: 0,
			background: 'transparent',
			borderTop: `1px solid ${TOSS_BORDER}`,
			borderBottom: `1px solid ${TOSS_BORDER}`
		},
		lrclibIdLabel: {
			fontSize: '10.5px',
			fontWeight: '850',
			color: 'var(--spice-subtext)',
			letterSpacing: '0.06em',
			textTransform: 'uppercase'
		},
		lrclibIdRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' },
		lrclibSearchBox: {
			gridColumn: '1 / -1',
			display: 'flex',
			flexDirection: 'column',
			gap: '6px',
			padding: '10px 0',
			borderRadius: 0,
			background: 'transparent',
			borderTop: `1px solid ${TOSS_BORDER}`,
			borderBottom: `1px solid ${TOSS_BORDER}`
		},
		lrclibSearchRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' },
		lrclibIdInput: {
			minWidth: 0,
			background: 'rgba(255,255,255,0.035)',
			color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '10px',
			height: '34px', padding: '0 11px',
			fontSize: '12px',
			fontWeight: '700',
			outline: 'none',
			boxSizing: 'border-box'
		},
		bulkVocalPanelRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '8px', alignItems: 'center' },
		statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: '10px', borderTop: `1px solid ${TOSS_BORDER}`, borderBottom: `1px solid ${TOSS_BORDER}` },
		statCard: { background: 'transparent', border: 'none', borderRight: `1px solid ${TOSS_BORDER}`, borderRadius: 0, padding: '11px 10px' },
		statValue: { fontSize: '18px', fontWeight: '800', color: 'var(--spice-text)', fontVariantNumeric: 'tabular-nums' },
		statLabel: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '4px', fontWeight: '700' },
		actionGrid: { display: 'flex', flexWrap: 'wrap', gap: '3px' },
		stagePanel: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 18px 10px', overflow: 'hidden', borderBottom: 'none' },
		stageBody: {
			flex: 1,
			minHeight: 0,
			display: 'flex',
			flexDirection: 'column',
			justifyContent: 'flex-start',
			overflowY: 'auto',
			overflowX: 'hidden',
			overscrollBehavior: 'contain',
			scrollbarGutter: 'stable',
			paddingRight: '4px'
		},
		stageLyricsBox: {
			flex: '0 0 auto',
			minHeight: 'clamp(120px, 18vh, 176px)',
			maxHeight: 'min(280px, 36vh)',
			padding: 'clamp(18px, 2.8vh, 26px) 18px',
			marginBottom: '8px'
		},
		transportPanel: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 18px' },
		transportRow: { display: 'flex', alignItems: 'center', gap: '10px' },
		offsetCompactRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' },
		rightActionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
		railDivider: { height: '1px', background: TOSS_BORDER, margin: '10px 0' },
		sideInspectorGrid: { display: 'flex', flexDirection: 'column', gap: '12px' },
	};

	const currentLineData = syncLinesByStart?.get(lineCharOffsets[currentLineIndex]);
	const currentLineTimes = getSyncCreatorLineTimes(currentLineData);
	const hasCurrentLineTiming = currentLineTimes.length > 0;
	const currentLineTimingLabel = hasCurrentLineTiming
		? `${formatSeconds(Math.min(...currentLineTimes))} - ${formatSeconds(Math.max(...currentLineTimes))}`
		: (I18n.t('syncCreator.lineOffsetUnavailable') || '싱크 후 조정 가능');
	const currentLinePreviewIndex = currentLineText
		? getPreviewProgressIndex(currentLineIndex)
		: -1;
	const currentRecordingCharIndex = recordingCharIndexRef.current;
	const isRecordingLockArmed = mode === 'record' && recordingLockIndex >= 0;
	const currentLockedPlaybackIndex = mode === 'record'
		? getSyncCreatorLockedPlaybackProgressIndex(
			currentLinePreviewIndex,
			recordingLockIndex,
			currentRecordingCharIndex
		)
		: null;
	const currentLineProgressIndex = mode === 'record' && currentRecordingCharIndex >= 0
		? currentRecordingCharIndex
		: (currentLockedPlaybackIndex ?? currentLinePreviewIndex);
	const currentLineProgressPercent = currentLineChars.length > 0 && currentLineProgressIndex >= 0
		? Math.max(0, Math.min(100, ((currentLineProgressIndex + 1) / currentLineChars.length) * 100))
		: 0;
	const rtlTextRunStyle = {
		...s.rtlTextRun,
		direction: currentLineDirection,
		backgroundImage: getSyncCreatorProgressGradient(
			currentLineDirection,
			currentLineProgressPercent,
			currentSpeakerTextColor,
			currentSpeakerMutedColor
		),
	};
	const renderCharacterSpan = (char, i, options = {}) => {
		const absoluteIndex = currentLineCharRefs[i]?.absoluteIndex ?? (currentLineStart + i);
		const inlineStyleRange = options.wordSpacer
			? null
			: currentLineStyleRanges.find(range => range.start <= absoluteIndex && range.end >= absoluteIndex);
		const inlineStyleColor = inlineStyleRange?.speaker
			? getSyncCreatorSpeakerTextColor(
				inlineStyleRange.speaker,
				inlineStyleRange['speaker-color'],
				inlineStyleRange['speaker-fallback']
			)
			: '';
		const inlineStyleKind = normalizeSyncCreatorKind(inlineStyleRange?.kind) || 'vocal';
		const isSynced = isCharSynced(currentLineIndex, i);
		const isRec = mode === 'record' && currentRecordingCharIndex >= 0 && i <= currentRecordingCharIndex;
		const isLocked = isRecordingLockArmed && i <= recordingLockIndex;
		const lockedPlaybackCompletedIndex = currentLockedPlaybackIndex === null
			? -1
			: Math.floor(currentLockedPlaybackIndex);
		const isLockedPlaybackProgress = isLocked && i <= lockedPlaybackCompletedIndex;
		const previewIdx = currentLinePreviewIndex;
		const previewNumericIndex = Number(previewIdx);
		const previewCompletedIndex = Number.isFinite(previewNumericIndex) ? Math.floor(previewNumericIndex) : -1;
		const isPlayed = isSynced && !isRecordingLockArmed && previewCompletedIndex >= i;
		const charTime = getCharSyncTime(currentLineIndex, i);
		const furigana = currentLineFuriganaMap.get(i);
		const characterPronunciation = options.hidePronunciation ? '' : currentLineCharacterPronunciationMap.get(i);
		const usePrimaryLayout = usePrimaryCharacterPronunciation && !options.suppressPrimaryPronunciation;
		const useFixedPrimaryLayout = usePrimaryLayout && useFixedPrimaryCharacterCells;
		const shouldShowCharTime = !options.hideTime && currentLineRenderedPronunciationUnits.length === 0;
		const baseBackground = !options.wordSpacer && isSynced
			? (isPlayed ? SYNC_CREATOR_PROGRESS_BACKGROUND : SYNC_CREATOR_SYNCED_BACKGROUND)
			: '';
		const baseColor = !options.wordSpacer ? currentSpeakerTextColor : '';
		const originalContent = furigana
			? react.createElement('span', { style: s.charFuriganaWrap },
				char === ' ' ? '\u00A0' : char,
				react.createElement('span', { style: s.charFuriganaText }, furigana)
			)
			: (char === ' ' ? '\u00A0' : char);

		let style = { ...s.charSpan };
		if (usePrimaryLayout) style = { ...style, ...s.charSpanPronunciationPrimary };
		if (useFixedPrimaryLayout) style = { ...style, ...s.charFixedPrimaryCell };
		if (options.wordSpacer) style = { ...style, ...s.charWordSpace };
		if (options.inWordUnit) style = { ...style, ...s.charSpanInWord };
		if (options.inWordPrimary) style = { ...style, ...s.charSpanInWordPrimary };
		if (!options.wordSpacer) {
			if (isRec || isLockedPlaybackProgress) style = { ...style, ...s.charRecording };
			else if (isSynced) style = isPlayed ? { ...style, ...s.charPlayed } : { ...style, ...s.charSynced };
			if (isLocked) style = { ...style, ...s.charLocked };
			if (inlineStyleColor) {
				style = {
					...style,
					color: inlineStyleColor,
					'--lyrics-color-active': inlineStyleColor,
					'--lyrics-color-inactive': inlineStyleColor
				};
			}
			if (inlineStyleRange) style['--ivlyrics-range-index'] = i;
		}

		const pronunciationStyle = usePrimaryLayout
			? {
				...s.charPronunciationPrimary,
				...(useFixedPrimaryLayout ? s.charPronunciationPrimaryFixed : null),
				visibility: characterPronunciation ? 'visible' : 'hidden',
				color: currentSpeakerTextColor
			}
			: {
				...s.charPronunciation,
				color: currentSpeakerTextColor
			};

		const charNode = react.createElement('span', {
			key: options.key || i,
			className: [
				'lyrics-karaoke-char',
				inlineStyleRange ? 'ivlyrics-karaoke-range-style lyrics-karaoke-part' : '',
				inlineStyleRange ? inlineStyleKind : '',
				inlineStyleRange && textEffectsDisabled ? 'text-effects-disabled' : ''
			].filter(Boolean).join(' '),
			style,
			ref: (el) => { charElementsRef.current[i] = el; },
			'data-char-index': i,
			'data-iv-sync-creator-synced': !options.wordSpacer && isSynced ? '1' : '0',
			'data-iv-sync-creator-base-background': baseBackground,
			'data-iv-sync-creator-base-color': baseColor,
			onContextMenu: options.wordSpacer || syncGranularity !== 'character' ? undefined : (e) => handleCharacterContextMenu(i, e),
			title: options.wordSpacer || mode !== 'record' || syncGranularity !== 'character'
				? undefined
				: (I18n.t('settings.syncLockTooltip') || 'Right-click to lock timing up to this character')
		},
			usePrimaryLayout
				? react.createElement('span', { style: s.charOriginalSmall }, originalContent)
				: originalContent,
			usePrimaryLayout
				? react.createElement('span', { style: pronunciationStyle }, characterPronunciation || '\u00A0')
				: (characterPronunciation && react.createElement('span', { style: pronunciationStyle }, characterPronunciation)),
			shouldShowCharTime && isSynced && charTime !== null && react.createElement('span', { style: s.charTime }, formatSeconds(charTime))
		);
		return charNode;
	};
	const renderPronunciationUnit = (unit) => {
		const wordChars = [];
		for (let i = unit.start; i <= unit.end; i++) {
			wordChars.push(renderCharacterSpan(currentLineChars[i], i, {
				key: `unit-${unit.start}-${i}`,
				hidePronunciation: true,
				suppressPrimaryPronunciation: true,
				inWordUnit: true,
				inWordPrimary: usePrimaryCharacterPronunciation
			}));
		}

		const groupStyle = usePrimaryCharacterPronunciation
			? { ...s.charWordGroup, ...s.charWordGroupPrimary }
			: s.charWordGroup;
		const pronunciationStyle = usePrimaryCharacterPronunciation
			? s.charWordPronunciationPrimary
			: s.charWordPronunciation;

		return react.createElement('span', {
			key: `unit-${unit.start}-${unit.end}`,
			style: groupStyle
		},
			react.createElement('span', { style: s.charWordOriginalRow }, wordChars),
			react.createElement('span', { style: pronunciationStyle }, unit.pronunciation)
		);
	};
	const renderCurrentLineCharacters = () => {
		const displayItems = activeParallelPart && Array.isArray(activeParallelPart.ranges) && activeParallelPart.ranges.length > 1
			? getSyncCreatorParallelPartDisplayItems(activeParallelPart, currentFullLineChars, currentLineStart)
			: null;
		const renderWordInputSeparator = (key) => react.createElement('span', {
			key,
			className: 'sync-creator-word-input-separator',
			style: s.wordInputSeparator,
			'aria-hidden': 'true'
		}, '/');
		if (useCurrentLineTextRun) {
			const textRunContent = syncGranularity === 'word'
				? currentGranularityRanges.flatMap((range, index) => [
					index > 0 && renderWordInputSeparator(`rtl-separator-${index}`),
					react.createElement('span', { key: `rtl-word-${index}` }, (
						currentLineChars.slice(range.start, range.end + 1).join('')
					))
				]).filter(Boolean)
				: (displayItems ? displayItems.map(item => item.text || item.char || '').join('') : currentLineText);
			return react.createElement('span', {
				ref: rtlTextRunRef,
				className: 'lyrics-karaoke-text-run-segment',
				style: rtlTextRunStyle,
				dir: currentLineDirection,
				'data-rtl-text-run': 'true',
				onContextMenu: (e) => {
					const charIndex = getCharIndexFromPoint(e.clientX, e.clientY);
					if (charIndex >= 0) handleCharacterContextMenu(charIndex, e);
				}
			}, textRunContent);
		}

		const items = displayItems || currentLineChars.map((char, i) => ({ type: 'char', key: `char-${i}`, charIndex: i, char }));
		return items.flatMap((item) => {
			if (item.type === 'separator') {
				return [react.createElement('span', {
					key: item.key,
					style: s.charJoinSeparator
				}, item.text === ' ' ? '\u00A0' : item.text)];
			}
			const char = item.char;
			const i = item.charIndex;
			const wordSeparator = currentWordBoundaryStartIndexes.has(i)
				? renderWordInputSeparator(`word-separator-${i}`)
				: null;
			const pronunciationUnit = currentLineRenderedPronunciationUnitByStart.get(i);
			if (pronunciationUnit) {
				return [wordSeparator, renderPronunciationUnit(pronunciationUnit)].filter(Boolean);
			}
			if (currentLineRenderedPronunciationCoveredIndexes.has(i)) {
				return wordSeparator ? [wordSeparator] : [];
			}
			if (currentLineRenderedPronunciationUnits.length > 0 && /\s/u.test(char)) {
				return [wordSeparator, renderCharacterSpan(char, i, {
					key: `word-space-${i}`,
					hidePronunciation: true,
					hideTime: true,
					suppressPrimaryPronunciation: true,
					wordSpacer: true
				})].filter(Boolean);
			}
			return [wordSeparator, renderCharacterSpan(char, i)].filter(Boolean);
		});
	};
	const renderParallelPartLine = (part, index) => {
		const isActive = activeParallelTargetId === part.id;
		const partCharRefs = rangesToCharRefs(part.ranges, currentFullLineChars, currentLineStart);
		const partChars = partCharRefs.map(ref => ref.char);
		const partDisplayItems = getSyncCreatorParallelPartDisplayItems(part, currentFullLineChars, currentLineStart);
		const savedPart = currentLineData?.parallel?.parts?.find(item => item.id === part.id);
		const syncedCount = hasReusableSyncCreatorParallelChars(part, savedPart)
			? Math.min(savedPart.chars.length, partChars.length)
			: 0;
		const speakerLabel = part.speaker || SYNC_CREATOR_DEFAULT_SPEAKER;
		const partSpeakerTextColor = getSyncCreatorSpeakerTextColor(
			speakerLabel,
			part['speaker-color'],
			part['speaker-fallback']
		);
		const isDuetSpeaker = isSyncCreatorDuetSpeaker(speakerLabel, part['speaker-fallback']);
		const kindLabel = getSyncCreatorKindLabel(part.kind) || part.kind || SYNC_CREATOR_DEFAULT_KIND;
		const handlePartPointerDown = (e) => {
			if (isActive) {
				handleContainerMouseDown(e);
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			selectParallelPart(part.id);
		};

		return react.createElement('button', {
			key: part.id,
			type: 'button',
			className: `ivlyrics-sync-stage-part lyrics-karaoke-part lead ${normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND}${textEffectsDisabled ? ' text-effects-disabled' : ''}`,
			style: {
				...s.parallelStackLine,
				...(isDuetSpeaker ? s.parallelStackLineDuet : null),
				...(isActive ? s.parallelStackLineActive : null),
				...(isDuetSpeaker && isActive ? s.parallelStackLineDuetActive : null),
				color: partSpeakerTextColor
			},
			onMouseDown: handlePartPointerDown,
			onTouchStart: handlePartPointerDown,
			onClick: () => {
				if (!isActive) selectParallelPart(part.id);
			}
		},
			react.createElement('div', { style: { ...s.parallelStackMeta, ...(isDuetSpeaker ? s.parallelStackMetaDuet : null) } },
				`${index + 1} | ${speakerLabel} | ${kindLabel} | ${partChars.length}`
			),
			isActive
				? react.createElement('div', {
					className: 'lyrics-karaoke-line is-active is-effect-live is-effect-focused',
					style: useCurrentLineTextRun ? { ...s.rtlLyricsLine, direction: currentLineDirection, paddingLeft: 0, paddingRight: 0 } : s.parallelStackText
				},
					renderCurrentLineCharacters()
				)
				: react.createElement('div', { style: s.parallelStackText },
					partDisplayItems.map((item) => {
						if (item.type === 'separator') {
							return react.createElement('span', {
								key: `${part.id}-${item.key}`,
								style: s.parallelStackJoinSeparator
							}, item.text === ' ' ? '\u00A0' : item.text);
						}
						return react.createElement('span', {
							key: `${part.id}-${item.charIndex}`,
							style: {
								...s.parallelStackChar,
								...(item.charIndex < syncedCount ? s.parallelStackCharSynced : null),
								color: partSpeakerTextColor
							}
						}, item.char === ' ' ? '\u00A0' : item.char);
					})
				)
		);
	};

	const getSpeakerTone = (speaker, speakerColor = '', speakerFallback = '') => {
		const value = String(speaker || '').toUpperCase();
		const text = getSyncCreatorSpeakerTextColor(value, speakerColor, speakerFallback);
		const colorTone = {
			text,
			dot: text,
			background: getSyncCreatorHexColorWithAlpha(text, 0.12),
			border: getSyncCreatorHexColorWithAlpha(text, 0.34),
			borderActive: getSyncCreatorHexColorWithAlpha(text, 0.78),
			ring: getSyncCreatorHexColorWithAlpha(text, 0.22)
		};
		const withActualColor = (fallback) => ({
			...fallback,
			text,
			dot: text,
			background: colorTone.background || fallback.background,
			border: colorTone.border || fallback.border,
			borderActive: colorTone.borderActive || fallback.borderActive,
			ring: colorTone.ring || fallback.ring
		});

		if (value.startsWith('NORMAL')) {
			return withActualColor({
				text,
				dot: text,
				background: 'rgba(148, 163, 184, 0.105)',
				border: 'rgba(148, 163, 184, 0.25)',
				borderActive: 'rgba(148, 163, 184, 0.58)',
				ring: 'rgba(148, 163, 184, 0.16)'
			});
		}
		if (value.startsWith('FEMALE')) {
			return withActualColor({
				text,
				dot: text,
				background: 'rgba(255, 122, 168, 0.105)',
				border: 'rgba(255, 122, 168, 0.25)',
				borderActive: 'rgba(255, 122, 168, 0.58)',
				ring: 'rgba(255, 122, 168, 0.16)'
			});
		}
		if (value.startsWith('DUET')) {
			return withActualColor({
				text,
				dot: text,
				background: 'rgba(180, 147, 255, 0.105)',
				border: 'rgba(180, 147, 255, 0.25)',
				borderActive: 'rgba(180, 147, 255, 0.58)',
				ring: 'rgba(180, 147, 255, 0.16)'
			});
		}
		return withActualColor({
			text,
			dot: text,
			background: TOSS_BLUE_SOFT,
			border: TOSS_BLUE_BORDER,
			borderActive: TOSS_BLUE_BORDER,
			ring: TOSS_BLUE_RING
		});
	};

	const renderSpeakerPicker = (selectedSpeaker, selectedSpeakerColor, selectedSpeakerFallback, onSelect, { disabled = false } = {}) => {
		const groups = [
			{ title: 'NORMAL', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('NORMAL')) },
			{ title: 'MALE', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('MALE')) },
			{ title: 'FEMALE', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('FEMALE')) },
			{ title: 'DUET', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('DUET')) },
			{ title: 'CUSTOM', values: ['CUSTOM'] }
		];

		return react.createElement('div', { className: 'sync-creator-speaker-groups', style: s.speakerGroups },
			groups.map(group => react.createElement('div', { className: 'sync-creator-speaker-group', key: group.title },
				react.createElement('div', { className: 'sync-creator-speaker-group-title', style: s.speakerGroupTitle }, group.title),
				react.createElement('div', { className: 'sync-creator-speaker-grid', style: s.speakerGrid },
					group.values.map(value => {
						const isSelected = selectedSpeaker === value;
						const tone = getSpeakerTone(
							value,
							isSelected ? selectedSpeakerColor : '',
							isSelected ? selectedSpeakerFallback : SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK
						);
						return react.createElement('button', {
							key: value,
							type: 'button',
							className: 'sync-creator-speaker-choice',
							'data-speaker': value,
							disabled,
							style: {
								...s.speakerChoice,
								...(value === 'CUSTOM' ? { gridColumn: '1 / -1' } : null),
								color: tone.text,
								background: tone.background,
								borderColor: isSelected ? tone.borderActive : tone.border,
								boxShadow: isSelected ? `inset 2px 0 0 ${tone.borderActive}` : 'none'
							},
							onClick: () => onSelect(value)
						},
							react.createElement('span', { className: 'sync-creator-speaker-dot', style: { ...s.speakerDot, background: tone.dot } }),
							value === 'CUSTOM' ? 'CUSTOM' : value.replace(' ', '')
						);
					})
				)
			))
		);
	};

	const renderTextEffectPicker = (selectedKind, onSelect, { compact = false, disabled = false, allowEmpty = false } = {}) => {
		const normalizedKind = allowEmpty ? selectedKind : (selectedKind || SYNC_CREATOR_DEFAULT_KIND);
		const renderEffectPreview = (label, value) => react.createElement('span', {
			style: {
				...(compact ? s.effectPillLabel : s.effectLabel),
				color: currentSpeakerTextColor,
				pointerEvents: 'none',
				'--lyrics-color-active': currentSpeakerTextColor,
				'--lyrics-color-inactive': currentSpeakerMutedColor
			},
			className: `ivlyrics-sync-kind-preview lyrics-karaoke-part lead ${value}${textEffectsDisabled ? ' text-effects-disabled' : ''}`,
			'aria-hidden': true
		}, react.createElement('span', {
			className: 'lyrics-karaoke-line is-active is-effect-live is-effect-focused'
		}, Array.from(label).map((char, index) => react.createElement('span', {
			key: `${value}-${index}`,
			className: 'ivlyrics-sync-kind-preview-char lyrics-karaoke-char lyrics-karaoke-char--done',
			style: char === ' ' ? { minWidth: '0.35em' } : null,
			'data-outline-text': char === ' ' ? '' : char
		}, react.createElement('span', {
			className: 'lyrics-karaoke-glyph-fill'
		}, char === ' ' ? '\u00A0' : char)))));

		return react.createElement('div', {
			className: compact ? 'sync-creator-effect-strip' : undefined,
			style: compact ? s.effectStrip : s.effectGrid,
			role: 'group',
			'aria-label': I18n.t('syncCreator.typeLabel') || 'Text effect'
		},
			SYNC_CREATOR_KIND_OPTIONS.map(([value, labelKey]) => {
				const isSelected = normalizedKind === value;
				const label = I18n.t(labelKey) || value;
				return react.createElement('button', {
					key: value,
					type: 'button',
					className: 'ivlyrics-sync-effect-card',
					disabled,
					style: {
						...(compact ? s.effectPill : s.effectCard),
						background: isSelected ? TOSS_BLUE_SOFT : (compact ? s.effectPill.background : s.effectCard.background),
						borderColor: isSelected ? TOSS_BLUE_BORDER : (compact ? TOSS_BORDER : s.effectCard.border),
						boxShadow: isSelected ? `inset 0 -2px 0 ${TOSS_BLUE}` : 'none'
					},
					onMouseDown: (e) => e.preventDefault(),
					onClick: () => onSelect(value),
					'aria-pressed': isSelected,
					'aria-label': label,
					title: label
				}, renderEffectPreview(label, value));
			})
		);
	};

	const renderBulkSpeakerControl = ({ compact = false, seedColor = '', seedFallback = '' } = {}) => lyricsLines.length > 0 && react.createElement('label', {
		style: compact ? s.bulkVocalControl : s.bulkVocalPanelRow
	},
		react.createElement('span', { style: s.bulkVocalLabel }, I18n.t('syncCreator.bulkVocalLabel') || 'All vocals'),
		react.createElement('select', {
			style: compact ? s.select : { ...s.select, width: '100%' },
			value: '',
			onChange: (event) => requestSongVocalSpeaker(event.target.value, {
				color: seedColor,
				fallback: seedFallback
			})
		},
			[
				react.createElement('option', { key: 'placeholder', value: '', disabled: true }, I18n.t('syncCreator.bulkVocalPlaceholder') || 'Set speaker...'),
				...SYNC_CREATOR_BULK_SPEAKER_OPTIONS.map(value => react.createElement('option', { key: value, value }, value))
			]
		)
	);
	const updateCurrentTextEffect = useCallback((value) => {
		if (activeParallelPart) updateParallelPartMeta(activeParallelPart.id, 'kind', value);
		else updateCurrentLineMeta('kind', value);
	}, [activeParallelPart, updateCurrentLineMeta, updateParallelPartMeta]);

	const renderLineInspector = () => {
		const targetSpeaker = activeParallelPart ? activeParallelPart.speaker : currentLineMeta.speaker;
		const targetSpeakerColor = activeParallelPart ? activeParallelPart['speaker-color'] : currentLineMeta['speaker-color'];
		const targetSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
			targetSpeaker,
			activeParallelPart ? activeParallelPart['speaker-fallback'] : currentLineMeta['speaker-fallback'],
			true,
			targetSpeaker
		);
		const updateSpeakerMeta = (field, value) => {
			if (activeParallelPart) updateParallelPartMeta(activeParallelPart.id, field, value);
			else updateCurrentLineMeta(field, value);
		};
		const customSpeakerMemoryKey = `${trackId || 'track'}:${currentLineStart}:${activeParallelPart?.id || 'line'}`;
		const targetRememberedCustomSpeakerMeta = customSpeakerMetaMemoryRef.current.get(customSpeakerMemoryKey) || {};
		const rememberedCustomSpeakerMeta = resolveSyncCreatorRememberedCustomSpeakerMeta(
			targetRememberedCustomSpeakerMeta,
			{ color: bulkCustomSpeakerColor, fallback: bulkCustomSpeakerFallback }
		);
		const updateSpeaker = (value) => {
			const transition = resolveSyncCreatorSpeakerTransition({
				currentSpeaker: targetSpeaker,
				currentColor: targetSpeakerColor,
				currentFallback: targetSpeakerFallback,
				nextSpeaker: value,
				remembered: rememberedCustomSpeakerMeta
			});
			if (!transition) return;
			customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, transition.remembered);
			if (isSyncCreatorCustomSpeaker(transition.speaker)) {
				setBulkCustomSpeakerColor(transition.color);
				setBulkCustomSpeakerFallback(transition.fallback);
			}
			updateSpeakerMeta('speaker', transition.speaker);
			updateSpeakerMeta('speaker-fallback', transition.fallback);
			updateSpeakerMeta('speaker-color', transition.color);
		};
		const updateSpeakerColor = (value) => {
			const color = normalizeSyncCreatorSpeakerColor(value);
			if (!color) return false;
			customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, {
				color,
				fallback: normalizeSyncCreatorSpeakerFallback(targetSpeakerFallback)
					|| rememberedCustomSpeakerMeta.fallback
			});
			setBulkCustomSpeakerColor(color);
			updateSpeakerMeta('speaker-color', color);
			return true;
		};
		const updateSpeakerFallback = (value) => {
			const fallback = normalizeSyncCreatorSpeakerFallback(value);
			if (!fallback) return;
			customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, {
				color: normalizeSyncCreatorSpeakerColor(targetSpeakerColor)
					|| rememberedCustomSpeakerMeta.color,
				fallback
			});
			setBulkCustomSpeakerFallback(fallback);
			updateSpeakerMeta('speaker-fallback', fallback);
		};
		return react.createElement('div', { style: s.sideInspectorGrid },
			react.createElement('div', { style: s.panel },
				react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.speakerLabel') || 'SPEAKER'),
				react.createElement('div', { style: s.panelSubtitle }, activeParallelPart ? (activeParallelPart.role || '') : (I18n.t('syncCreator.allLine') || 'Full line')),
				renderSpeakerPicker(targetSpeaker, targetSpeakerColor, targetSpeakerFallback, updateSpeaker),
				isSyncCreatorCustomSpeaker(targetSpeaker) && react.createElement('div', { style: s.customSpeakerColorEditor },
					react.createElement('input', {
						type: 'color',
						style: s.customSpeakerColorPicker,
						value: sanitizeSyncCreatorSpeakerColor(targetSpeaker, targetSpeakerColor, true, targetSpeakerFallback),
						onChange: (event) => updateSpeakerColor(event.target.value),
						'aria-label': I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'
					}),
					react.createElement('div', { style: s.customSpeakerColorFields },
						react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'),
						react.createElement('input', {
							key: `${currentLineStart}:${activeParallelPart?.id || 'line'}:${targetSpeakerColor}`,
							type: 'text',
							style: s.customSpeakerColorText,
							defaultValue: sanitizeSyncCreatorSpeakerColor(targetSpeaker, targetSpeakerColor, true, targetSpeakerFallback),
							placeholder: '#00ff00',
							maxLength: 7,
							onKeyDown: (event) => {
								if (event.key === 'Enter') event.currentTarget.blur();
							},
							onBlur: (event) => {
								if (updateSpeakerColor(event.target.value)) return;
								event.target.value = sanitizeSyncCreatorSpeakerColor(targetSpeaker, targetSpeakerColor, true, targetSpeakerFallback);
								Toast.error(I18n.t('syncCreator.speakerCustomColorInvalid') || 'Enter a valid HEX color.');
							}
						}),
						react.createElement('div', { style: s.customSpeakerColorDescription }, I18n.t('syncCreator.speakerCustomColorDesc') || 'This color is stored in sync-data for listeners who allow creator colors.'),
						react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomFallback') || 'Fallback color group'),
						react.createElement('select', {
							style: { ...s.select, width: '100%' },
							value: targetSpeakerFallback,
							onChange: (event) => updateSpeakerFallback(event.target.value)
						}, SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS.map(value => react.createElement('option', {
							key: value,
							value
						}, value.replace(' 1', '')))),
						react.createElement('div', { style: s.customSpeakerColorDescription }, I18n.t('syncCreator.speakerCustomFallbackDesc') || 'Used when listeners disable creator custom colors.')
					)
				),
				react.createElement('div', { style: s.railDivider }),
				renderBulkSpeakerControl({
					seedColor: isSyncCreatorCustomSpeaker(targetSpeaker) ? targetSpeakerColor : rememberedCustomSpeakerMeta.color,
					seedFallback: isSyncCreatorCustomSpeaker(targetSpeaker) ? targetSpeakerFallback : rememberedCustomSpeakerMeta.fallback
				})
			)
		);
	};

	const renderGranularitySelector = () => react.createElement('div', {
		className: 'sync-creator-granularity',
		style: s.granularityControl,
		role: 'group',
		'aria-label': I18n.t('syncCreator.syncGranularityLabel') || 'Sync unit',
		title: I18n.t('syncCreator.syncGranularityHint') || 'Choose how precisely timing is recorded'
	}, [
		['line', I18n.t('syncCreator.syncGranularityLine') || 'Line'],
		['word', I18n.t('syncCreator.syncGranularityWord') || 'Word'],
		['character', I18n.t('syncCreator.syncGranularityCharacter') || 'Character']
	].map(([value, label]) => react.createElement('button', {
		key: value,
		type: 'button',
		style: syncGranularity === value
			? { ...s.granularityButton, ...s.granularityButtonActive }
			: s.granularityButton,
		'aria-pressed': syncGranularity === value,
		onClick: () => handleSyncGranularityChange(value)
	}, label)));

	const renderHeader = () => react.createElement('div', { className: 'sync-creator-header', style: s.header },
		react.createElement('button', {
			className: 'sync-creator-header-back',
			style: s.backBtn,
			onClick: () => {
				preventNextTrackRef.current = false;
				if (onClose) onClose();
			}
		},
			react.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' },
				react.createElement('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
			),
			I18n.t('syncCreator.back') || '닫기'
		),
		renderGranularitySelector(),
		react.createElement('button', {
			className: 'sync-creator-submit',
			style: { ...s.submitBtn, opacity: isSubmitting || !syncData ? 0.5 : 1, cursor: isSubmitting || !syncData ? 'not-allowed' : 'pointer' },
			onClick: handleSubmit,
			disabled: isSubmitting || !syncData
		}, isSubmitting ? I18n.t('syncCreator.submitting') : I18n.t('syncCreator.submit'))
	);

	const renderCharacterPronunciationTargetControl = ({ compact = false } = {}) => react.createElement('label', {
		style: compact
			? s.characterPronunciationTargetCompact
			: s.characterPronunciationTarget,
		title: I18n.t('syncCreator.characterPronunciationTargetDesc') || 'Choose the writing system used for generated pronunciation.'
	},
		!compact && react.createElement('span', { style: s.characterPronunciationTargetLabel },
			I18n.t('syncCreator.characterPronunciationTarget') || 'Pronunciation notation'
		),
		react.createElement('select', {
			style: compact
				? { ...s.select, minWidth: '150px' }
				: { ...s.select, width: '100%' },
			value: characterPronunciationTargetMode,
			onChange: (event) => handleCharacterPronunciationTargetModeChange(event.target.value),
			disabled: isGeneratingCharacterPronunciations,
			'aria-label': I18n.t('syncCreator.characterPronunciationTarget') || 'Pronunciation notation'
		},
			react.createElement('option', { value: 'latin' }, I18n.t('syncCreator.characterPronunciationTargetLatin') || 'Latin (Romanization)'),
			react.createElement('option', { value: 'translation' }, I18n.t('syncCreator.characterPronunciationTargetTranslation') || 'Translation language')
		)
	);

	const renderSourcePanel = () => react.createElement('div', { className: 'sync-creator-section sync-creator-source-section', style: s.panel },
		react.createElement('div', { style: s.panelTitle }, 'Source'),
		react.createElement('div', { style: s.sourceTrack },
			albumArt && react.createElement('img', { src: albumArt, style: s.sourceAlbumArt, alt: trackName }),
			react.createElement('div', { style: s.trackMeta },
				react.createElement('div', { style: s.trackName }, trackName),
				react.createElement('div', { style: s.artistName }, artistName)
			)
		),
		react.createElement('div', { style: s.sourceControls },
			react.createElement('div', { style: s.sourceProvider },
				react.createElement('span', { style: s.sourceProviderName }, 'LRCLIB')
			),
			react.createElement('div', { style: s.sourceButtonRow },
				react.createElement('button', {
					style: { ...s.loadBtn, ...s.fullWidthButton, opacity: isLoading ? 0.5 : 1 },
					onClick: loadLyrics,
					disabled: isLoading
				}, isLoading ? I18n.t('syncCreator.loading') : I18n.t('syncCreator.reload') || '다시 로드')
			),
			addonId === SYNC_CREATOR_SOURCE_ADDON_ID && react.createElement('div', { style: s.lrclibIdBox },
				react.createElement('div', { style: s.lrclibIdLabel }, I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'),
				react.createElement('div', { style: s.lrclibIdRow },
					react.createElement('input', {
						type: 'text',
						inputMode: 'numeric',
						style: s.lrclibIdInput,
						value: lrclibIdInput,
						placeholder: I18n.t('syncCreator.lrclibIdPlaceholder') || 'e.g. 5206921',
						onChange: (e) => setLrclibIdInput(e.target.value.replace(/[^\d]/g, '')),
						onKeyDown: (e) => {
							if (e.key === 'Enter') loadLrclibById();
						},
						disabled: isLoadingLrclibId
					}),
					react.createElement('button', {
						type: 'button',
						style: { ...s.loadBtn, whiteSpace: 'nowrap', opacity: isLoadingLrclibId ? 0.6 : 1 },
						onClick: loadLrclibById,
						disabled: isLoadingLrclibId
					}, isLoadingLrclibId
						? (I18n.t('syncCreator.lrclibIdLoading') || 'Loading...')
						: (I18n.t('syncCreator.lrclibIdLoad') || 'Load by ID'))
				)
			),
			lyricsLines.length > 0 && renderCharacterPronunciationTargetControl(),
			lyricsLines.length > 0 && react.createElement('button', {
				style: {
					...s.secondaryBtn,
					...s.fullWidthButton,
					opacity: isGeneratingCharacterPronunciations ? 0.6 : 1,
					background: showCharacterPronunciations ? TOSS_BLUE_SOFT : s.secondaryBtn.background,
					color: showCharacterPronunciations ? TOSS_BLUE : s.secondaryBtn.color
				},
				onClick: handleCharacterPronunciationToggle,
				disabled: isGeneratingCharacterPronunciations,
				title: I18n.t('syncCreator.characterPronunciationDesc') || 'Generate character-aligned pronunciation with AI and show it below the current line.'
			}, isGeneratingCharacterPronunciations
				? (characterPronunciationProgressInfo?.buttonLabel || I18n.t('syncCreator.characterPronunciationGenerating') || 'AI 발음 생성 중...')
				: characterPronunciations
					? (showCharacterPronunciations
						? (I18n.t('syncCreator.characterPronunciationHide') || '발음 숨기기')
						: (I18n.t('syncCreator.characterPronunciationShow') || '발음 표시'))
					: (I18n.t('syncCreator.characterPronunciationGenerate') || 'AI 글자 발음')
			),
			characterPronunciations && react.createElement('button', {
				style: { ...s.secondaryBtn, ...s.fullWidthButton },
				onClick: () => handleCharacterPronunciationToggle({ forceRegenerate: true }),
				disabled: isGeneratingCharacterPronunciations,
				title: I18n.t('syncCreator.characterPronunciationRegenerateDesc') || 'Ignore the saved result and generate pronunciation again.'
			}, I18n.t('syncCreator.characterPronunciationRegenerate') || 'Regenerate Pronunciation'),
			isGeneratingCharacterPronunciations && characterPronunciationProgressInfo && react.createElement('div', {
				style: { ...s.characterPronunciationProgress, width: '100%', maxWidth: '100%' },
				title: characterPronunciationProgressInfo.label
			},
				react.createElement('div', { style: s.characterPronunciationProgressText }, characterPronunciationProgressInfo.label),
				react.createElement('div', { style: s.characterPronunciationProgressTrack },
					react.createElement('div', {
						style: {
							...s.characterPronunciationProgressFill,
							width: `${Math.max(0, Math.min(100, characterPronunciationProgressInfo.percent || 0))}%`
						}
					})
				)
			),
			characterPronunciations && showCharacterPronunciations && react.createElement('button', {
				style: {
					...s.secondaryBtn,
					...s.fullWidthButton,
					background: isCharacterPronunciationPrimary ? TOSS_BLUE_SOFT : s.secondaryBtn.background,
					color: isCharacterPronunciationPrimary ? TOSS_BLUE : s.secondaryBtn.color
				},
				onClick: () => setIsCharacterPronunciationPrimary(value => !value),
				title: I18n.t('syncCreator.characterPronunciationPrimaryDesc') || '생성된 발음을 크게, 원어 가사를 작게 표시합니다.'
			}, I18n.t('syncCreator.characterPronunciationPrimary') || '발음 크게'),
			isVirtualKaraokeSource && react.createElement('span', { style: s.virtualKaraokeBadge }, I18n.t('syncCreator.virtualKaraoke') || '가상 노래방 데이터')
		)
	);

	const syncGranularityRecordingHint = syncGranularity === 'line'
		? (I18n.t('syncCreator.lineSyncHint') || 'Tap the line at the moment it starts.')
		: syncGranularity === 'word'
			? (I18n.t('syncCreator.wordSyncHint') || 'Tap or drag in time with each word.')
			: I18n.t('syncCreator.dragHint');

	const renderProgressPanel = () => lyricsText && react.createElement('div', { className: 'sync-creator-section sync-creator-progress-section', style: s.panel },
		react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.progress') || '진행'),
		react.createElement('div', { style: s.statsGrid },
			react.createElement('div', { style: s.statCard },
				react.createElement('div', { style: s.statValue }, `${completedLines}/${lyricsLines.length}`),
				react.createElement('div', { style: s.statLabel }, I18n.t('syncCreator.linesCompleted') || '줄 완료')
			),
			react.createElement('div', { style: { ...s.statCard, borderRight: 'none' } },
				react.createElement('div', { style: s.statValue }, `${syncedChars}/${totalChars}`),
				react.createElement('div', { style: s.statLabel }, I18n.t('syncCreator.chars') || '글자')
			)
		),
		react.createElement('div', { style: s.actionGrid },
			react.createElement('button', { style: s.ctrlBtn, onClick: goToFirstLine, disabled: currentLineIndex <= 0 }, I18n.t('syncCreator.firstLine')),
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'record' ? '#ed4f5d' : TOSS_BLUE,
					color: '#fff',
					boxShadow: 'none'
				},
				onClick: () => toggleMode('record')
			}, mode === 'record' ? I18n.t('syncCreator.stopRecord') : I18n.t('syncCreator.recordMode')),
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'preview' ? TOSS_BLUE : 'transparent',
					color: mode === 'preview' ? '#fff' : 'var(--spice-text)',
					border: mode === 'preview' ? '1px solid transparent' : `1px solid ${TOSS_BORDER}`,
					boxShadow: 'none'
				},
				onClick: () => toggleMode('preview'),
				disabled: !syncData || syncData.lines.length === 0
			}, mode === 'preview' ? I18n.t('syncCreator.stopPreview') : I18n.t('syncCreator.previewMode')),
			react.createElement('button', { style: s.ctrlBtn, onClick: copyAllLyrics, disabled: !lyricsText }, I18n.t('syncCreator.copyLyrics') || '가사 복사'),
			react.createElement('button', { style: s.ctrlBtn, onClick: exportSyncData, disabled: !syncData || !syncData.lines || syncData.lines.length === 0 }, I18n.t('syncCreator.export') || '내보내기'),
			react.createElement('button', { style: s.ctrlBtn, onClick: importSyncData }, I18n.t('syncCreator.import') || '불러오기'),
			isCurrentLineSynced && react.createElement('button', { style: s.deleteBtn, onClick: deleteCurrentLineSync }, I18n.t('syncCreator.deleteLine')),
			react.createElement('button', {
				style: s.deleteBtn,
				onClick: resetFromStart,
				title: I18n.t('syncCreator.resetConfirm') || '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.'
			}, I18n.t('syncCreator.reset'))
		)
	);

	const renderShortcutGuide = () => lyricsText && react.createElement('div', { className: 'sync-creator-section sync-creator-shortcut-section', style: s.panel },
		react.createElement('div', { style: s.panelTitle }, 'Sync Creator 단축키'),
		react.createElement('div', { style: s.panelSubtitle }, syncGranularityRecordingHint),
		react.createElement('div', { style: { ...s.shortcutsContainer, marginTop: 0, padding: 0, background: 'transparent', border: 'none' } },
			[
				[getSyncCreatorShortcutDisplay('charForward'), I18n.t('syncCreator.shortcuts.charForward') || '한 글자'],
				[getSyncCreatorShortcutDisplay('charBack'), I18n.t('syncCreator.shortcuts.charBack') || '한 글자 취소'],
				[getSyncCreatorShortcutDisplay('wordForward'), I18n.t('syncCreator.shortcuts.wordForward') || '한 단어'],
				[getSyncCreatorShortcutDisplay('wordBack'), I18n.t('syncCreator.shortcuts.wordBack') || '한 단어 취소'],
				[getSyncCreatorShortcutDisplay('syllable'), I18n.t('syncCreator.shortcuts.syllable') || '음절'],
				[getSyncCreatorShortcutDisplay('drag'), I18n.t('syncCreator.shortcuts.drag') || '누르면 드래그'],
				[I18n.t('syncCreator.shortcuts.rightClick') || 'Right click', I18n.t('syncCreator.shortcuts.lockToCharacter') || '해당 글자까지 잠금'],
				['↑ / ↓', `${I18n.t('syncCreator.prevLine') || 'Previous Line'} / ${I18n.t('syncCreator.nextLineBtn') || 'Next Line'}`],
				['Enter', I18n.t('syncCreator.shortcuts.finish') || '라인 완료'],
				['Backspace', I18n.t('syncCreator.shortcuts.cancel') || '취소'],
				['Space', I18n.t('syncCreator.shortcuts.playPause') || '재생/일시정지'],
				['Z', I18n.t('syncCreator.shortcuts.seekBack') || '-3초'],
				['X', I18n.t('syncCreator.shortcuts.seekForward') || '+3초']
			].map(([key, desc]) => react.createElement('div', { key: `${key}-${desc}`, style: s.shortcutItem },
				react.createElement('span', { style: s.shortcutKey }, key),
				react.createElement('span', { style: s.shortcutDesc }, desc)
			))
		)
	);

	const renderLrclibSearchControls = () => react.createElement('div', { style: s.lrclibSearchBox },
		react.createElement('div', { style: s.lrclibIdLabel }, I18n.t('syncCreator.lrclibSearchQueryLabel') || 'LRCLIB Search'),
		react.createElement('div', { style: s.lrclibSearchRow },
			react.createElement('input', {
				type: 'text',
				style: s.lrclibIdInput,
				value: lrclibSearchQuery,
				placeholder: I18n.t('syncCreator.lrclibSearchQueryPlaceholder') || `${trackName} ${artistName}`.trim(),
				onChange: (e) => setLrclibSearchQuery(e.target.value),
				onKeyDown: (e) => {
					if (e.key === 'Enter') searchLrclibByQuery();
				},
				disabled: isSearchingLrclib
			}),
			react.createElement('button', {
				type: 'button',
				style: { ...s.loadBtn, whiteSpace: 'nowrap', opacity: isSearchingLrclib ? 0.6 : 1 },
				onClick: searchLrclibByQuery,
				disabled: isSearchingLrclib
			}, isSearchingLrclib
				? (I18n.t('syncCreator.lrclibSearchLoading') || 'Searching...')
				: (I18n.t('syncCreator.lrclibSearchButton') || 'Search'))
		)
	);

	const renderLrclibCandidatesPanel = () => addonId === SYNC_CREATOR_SOURCE_ADDON_ID && react.createElement('div', {
		className: 'sync-creator-candidate-section',
		style: { ...s.candidatePanel, padding: '14px 18px', borderRadius: 0 }
	},
		react.createElement('div', { style: s.candidatePanelHeader },
			react.createElement('div', { style: s.candidatePanelTitle },
				`${I18n.t('syncCreator.lrclibSearchResults') || 'LRCLIB Search Results'} ${(lrclibSearchMeta?.totalResults || lrclibCandidates.length || 0) > 0 ? `(${lrclibSearchMeta?.totalResults || lrclibCandidates.length})` : ''}`
			),
			react.createElement('button', {
				type: 'button',
				style: s.secondaryBtn,
				onClick: () => setShowLrclibCandidates(prev => !prev)
			}, showLrclibCandidates
				? (I18n.t('syncCreator.hideLrclibSearchResults') || 'Hide Search Results')
				: (I18n.t('syncCreator.showLrclibSearchResults') || 'Show Search Results'))
		),
		showLrclibCandidates && renderLrclibSearchControls(),
		showLrclibCandidates && react.createElement('div', { style: s.candidateList },
			isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty }, I18n.t('syncCreator.loadingLyrics') || 'Loading lyrics...'),
			!isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty }, lrclibSearchMeta?.error || (I18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')),
			lrclibCandidates.map((candidate, index) => {
				const isPreviewing = previewLrclibCandidate?.candidateKey === candidate.candidateKey;
				const isApplied = selectedLrclibCandidateKey === candidate.candidateKey;
				const candidateId = getLrclibCandidateId(candidate);
				let itemStyle = { ...s.candidateItem };
				if (isPreviewing) itemStyle = { ...itemStyle, ...s.candidateItemActive };
				if (isApplied) itemStyle = { ...itemStyle, ...s.candidateItemApplied };

				return react.createElement('button', {
					key: candidate.candidateKey,
					type: 'button',
					style: itemStyle,
					onClick: () => setPreviewLrclibCandidateKey(candidate.candidateKey)
				},
					react.createElement('div', { style: s.candidateTitleRow },
						react.createElement('span', { style: s.candidateTitle }, `${index + 1}. ${candidate.trackName || candidate.name || trackName}`),
						candidateId && react.createElement('span', {
							style: s.candidateIdBadge,
							title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${candidateId}`,
							onClick: (event) => copyLrclibCandidateId(candidateId, event)
						}, `ID ${candidateId}`)
					),
					react.createElement('div', { style: s.candidateSubtitle }, `${candidate.artistName || artistName} · ${formatSeconds(Number(candidate.duration || 0))}`),
					react.createElement('div', { style: s.candidateMetaRow },
						candidate.syncLineExactMatch && react.createElement('span', { style: { ...s.candidateBadge, color: TOSS_BLUE } }, I18n.t('syncCreator.lrclibBadgeExact') || 'Exact'),
						candidate.hasSyncedLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
						candidate.hasPlainLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain'),
						candidate.searchSource === 'primary' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePrimary') || 'Primary'),
						candidate.searchSource === 'english' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeEnglish') || 'English'),
						isApplied && react.createElement('span', { style: { ...s.candidateBadge, color: TOSS_BLUE } }, I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
					)
				);
			})
		),
		showLrclibCandidates && react.createElement('div', { style: s.candidatePreview },
			previewLrclibCandidate
				? react.createElement(react.Fragment, null,
					react.createElement('div', { style: s.candidatePreviewHeader },
						react.createElement('div', null,
							react.createElement('div', { style: s.candidatePreviewTitle }, previewLrclibCandidate.trackName || previewLrclibCandidate.name || trackName),
							react.createElement('div', { style: s.candidatePreviewSubtitle }, `${previewLrclibCandidate.artistName || artistName} · ${previewLrclibCandidate.albumName || ''}`.replace(/\s·\s$/, ''))
						),
						react.createElement('div', { style: s.candidatePreviewActions },
							getLrclibCandidateId(previewLrclibCandidate) && react.createElement('button', {
								type: 'button',
								style: s.candidateIdButton,
								title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${getLrclibCandidateId(previewLrclibCandidate)}`,
								onClick: (event) => copyLrclibCandidateId(previewLrclibCandidate, event)
							}, `ID ${getLrclibCandidateId(previewLrclibCandidate)}`),
							react.createElement('button', {
								type: 'button',
								style: { ...s.secondaryBtn, opacity: selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey ? 0.7 : 1 },
								onClick: () => applySelectedLrclibCandidate(previewLrclibCandidate.candidateKey),
								disabled: isLoading
							}, selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey
								? (I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
								: (I18n.t('syncCreator.lrclibApplyCandidate') || 'Load This Lyrics'))
						)
					),
					react.createElement('div', { style: s.candidateMetaRow },
						react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricArtist') || 'artist'} ${Number(previewLrclibCandidate.artistScore || 0).toFixed(3)}`),
						react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricTitle') || 'title'} ${Number(previewLrclibCandidate.titleScore || 0).toFixed(3)}`),
						react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricDiff') || 'diff'} ${formatSeconds(Number(previewLrclibCandidate.durationDiff || 0))}`),
						previewLrclibCandidate.preferredLyricsSource === 'synced' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
						previewLrclibCandidate.preferredLyricsSource === 'plain' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain')
					),
					react.createElement('pre', { style: s.candidatePreviewText }, previewLrclibCandidate.previewText || '')
				)
				: react.createElement('div', { style: s.candidateEmpty }, I18n.t('syncCreator.lrclibSelectCandidate') || 'Select a candidate')
		)
	);

	const renderPlaybackPanel = () => {
		if (!lyricsText) return null;
		const playbackPercent = (position / (Spicetify.Player?.data?.item?.duration?.milliseconds || 1)) * 100;
		return react.createElement('div', { className: 'sync-creator-transport-section', style: { ...s.panel, ...s.transportPanel } },
			react.createElement('div', { style: s.transportRow },
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-3000) }, '-3s'),
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-1000) }, '-1s'),
				react.createElement('span', { style: s.playbackTime }, formatTime(position)),
				react.createElement('div', {
					style: { ...s.playbackBar, '--iv-progress': `${playbackPercent}%` },
					'data-iv-progress-bar': 'true',
					onClick: handleSeek
				}, react.createElement('div', { style: { ...s.playbackFill, width: `${playbackPercent}%` } })),
				react.createElement('span', { style: s.playbackTime }, formatTime(Spicetify.Player?.data?.item?.duration?.milliseconds || 0)),
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(1000) }, '+1s'),
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(3000) }, '+3s')
			),
			syncData && react.createElement('div', { style: s.offsetCompactRow },
				react.createElement('span', { style: s.offsetLabel }, I18n.t('syncCreator.globalOffset')),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-100) }, '-100ms'),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-10) }, '-10ms'),
				react.createElement('span', { style: s.offsetValue }, `${globalOffset >= 0 ? '+' : ''}${globalOffset}ms`),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(10) }, '+10ms'),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(100) }, '+100ms')
			)
		);
	};

	const renderManualSplitEditor = () => multiVocalMode && currentFullLineChars.length > 1 && react.createElement('div', { style: s.parallelSplitEditor },
		react.createElement('div', { style: s.parallelSplitHeader },
			react.createElement('span', { style: s.parallelSplitTitle }, I18n.t('syncCreator.manualSplit') || 'Manual split'),
			hasManualParallelSplit && react.createElement('span', { style: s.parallelSplitBadge }, `${currentManualSplitPoints.length + 1} parts`),
			hasManualDraftSplit && react.createElement('button', {
				type: 'button',
				style: s.parallelSplitResetBtn,
				onClick: resetCurrentLineManualSplit
			}, I18n.t('syncCreator.useAutoSplit') || 'Use auto'),
			react.createElement('button', {
				type: 'button',
				style: s.parallelSplitToggleBtn,
				onClick: () => setIsParallelSplitCollapsed(prev => !prev)
			}, isParallelSplitCollapsed ? (I18n.t('update.expand') || 'Expand') : (I18n.t('update.collapse') || 'Collapse'))
		),
		!isParallelSplitCollapsed && react.createElement('div', { style: s.parallelSplitBody },
			react.createElement('div', { style: s.parallelSplitTape },
				currentFullLineChars.map((char, index) => react.createElement(react.Fragment, { key: `manual-split-${currentLineStart}-${index}` },
					index > 0 && react.createElement('button', {
						type: 'button',
						style: {
							...s.parallelSplitBoundary,
							...(currentManualSplitPointSet.has(index) ? s.parallelSplitBoundaryActive : null)
						},
						title: I18n.t('syncCreator.splitHere') || 'Split here',
						onClick: (e) => {
							e.preventDefault();
							e.stopPropagation();
							toggleManualParallelSplitPoint(index);
						}
					}, currentManualSplitPointSet.has(index) ? '|' : '·'),
					react.createElement('span', { style: s.parallelSplitChar }, char === ' ' ? '\u00A0' : char)
				))
			)
		)
	);

	const renderStyleRangeEditor = () => {
		if (!currentFullLineChars.length) return null;
		const selectionStart = styleRangeSelection
			? Math.min(styleRangeSelection.anchor, styleRangeSelection.focus)
			: -1;
		const selectionEnd = styleRangeSelection
			? Math.max(styleRangeSelection.anchor, styleRangeSelection.focus)
			: -1;
		const selectedText = selectionStart >= 0
			? currentFullLineChars.slice(selectionStart, selectionEnd + 1).join('')
			: '';
		const selectRangeEffect = (value) => {
			if (!value) return;
			setStyleRangeEffect(value);
			updateCurrentLineStyleRanges({ kind: value });
		};
		const applyRangeSpeakerMeta = (speaker, color, fallback) => {
			const speakerMeta = resolveSyncCreatorBulkSpeakerMeta(speaker, color, fallback);
			if (!speakerMeta) return false;
			return updateCurrentLineStyleRanges({
				speaker: speakerMeta.speaker,
				'speaker-color': speakerMeta.color,
				'speaker-fallback': speakerMeta.fallback
			});
		};
		const selectRangeSpeaker = (value) => {
			const transition = resolveSyncCreatorSpeakerTransition({
				currentSpeaker: styleRangeSpeaker,
				currentColor: styleRangeSpeakerColor,
				currentFallback: styleRangeSpeakerFallback,
				nextSpeaker: value,
				remembered: {
					color: styleRangeSpeakerColor || bulkCustomSpeakerColor,
					fallback: styleRangeSpeakerFallback || bulkCustomSpeakerFallback
				}
			});
			if (!transition) return;
			setStyleRangeSpeaker(transition.speaker);
			setStyleRangeSpeakerColor(transition.color);
			setStyleRangeSpeakerFallback(transition.fallback || SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK);
			applyRangeSpeakerMeta(
				transition.speaker,
				transition.color,
				transition.fallback || SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK
			);
		};
		const clearStyle = () => {
			if (!updateCurrentLineStyleRanges({ kind: null, speaker: null })) return;
			setStyleRangeEffect('');
			Toast.success(I18n.t('syncCreator.rangeStyleCleared') || '선택 범위의 스타일을 지웠습니다.');
		};

		return react.createElement('section', {
			className: 'sync-creator-range-style-editor',
			style: {
				flexShrink: 0,
				marginTop: 8,
				border: `1px solid ${TOSS_BORDER}`,
				borderRadius: 10,
				background: 'rgba(255,255,255,0.025)',
				overflow: 'hidden'
			}
		},
			react.createElement('button', {
				type: 'button',
				style: {
					width: '100%',
					minHeight: 38,
					display: 'grid',
					gridTemplateColumns: 'minmax(0, 1fr) auto auto',
					alignItems: 'center',
					gap: 9,
					padding: '8px 11px',
					border: 'none',
					borderRadius: 0,
					background: 'transparent',
					color: 'var(--spice-text)',
					textAlign: 'left',
					cursor: 'pointer'
				},
				onClick: () => {
					setIsStyleRangeEditorExpanded(value => !value);
				},
				'aria-expanded': isStyleRangeEditorExpanded
			},
				react.createElement('strong', {
					style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700 }
				}, I18n.t('syncCreator.rangeStyleTitle') || '부분 효과 · 색상'),
				react.createElement('span', { style: { fontSize: 10.5, color: 'var(--spice-subtext)', whiteSpace: 'nowrap' } },
					currentLineStyleRanges.length
						? `${currentLineStyleRanges.length} ${I18n.t('syncCreator.rangeStyleCount') || '개 범위'}`
						: (I18n.t('syncCreator.rangeStyleEmpty') || '설정된 범위 없음')
				),
				react.createElement('span', { style: { color: 'var(--spice-subtext)', fontSize: 16, lineHeight: 1 } }, isStyleRangeEditorExpanded ? '⌃' : '⌄')
			),
			isStyleRangeEditorExpanded && react.createElement('div', {
				style: { padding: '0 11px 10px', borderTop: `1px solid ${TOSS_BORDER}` }
			},
				react.createElement('div', { style: { marginTop: 8, fontSize: 10.5, color: 'var(--spice-subtext)', lineHeight: 1.4 } },
					I18n.t('syncCreator.rangeStyleHint') || '싱크 단위와 관계없이 원하는 글자를 드래그해 선택하세요.'
				),
				react.createElement('div', {
					style: {
						display: 'flex',
						flexWrap: 'wrap',
						alignItems: 'baseline',
						gap: 0,
						maxHeight: 80,
						overflowY: 'auto',
						marginTop: 7,
						padding: '7px 8px',
						borderRadius: 7,
						background: 'rgba(0,0,0,0.22)',
						fontSize: 16,
						lineHeight: 1.55,
						userSelect: 'none',
						cursor: 'text',
						overscrollBehavior: 'contain'
					},
					role: 'listbox',
					'aria-label': I18n.t('syncCreator.rangeStyleSelectLabel') || '스타일을 적용할 글자 범위'
				}, currentFullLineChars.map((char, index) => {
					const absoluteIndex = currentLineStart + index;
					const existingStyle = currentLineStyleRanges.find(range => range.start <= absoluteIndex && range.end >= absoluteIndex);
					const selected = index >= selectionStart && index <= selectionEnd;
					const color = existingStyle?.speaker
						? getSyncCreatorSpeakerTextColor(
							existingStyle.speaker,
							existingStyle['speaker-color'],
							existingStyle['speaker-fallback']
						)
						: '';
					return react.createElement('span', {
						key: `range-style-${currentLineStart}-${index}`,
						role: 'option',
						'aria-selected': selected,
						onPointerDown: (event) => beginStyleRangeSelection(index, event),
						onPointerEnter: () => extendStyleRangeSelection(index),
						style: {
							display: 'inline-block',
							minWidth: char === ' ' ? '0.42em' : undefined,
							padding: 0,
							margin: 0,
							borderRadius: 3,
							color: color || 'var(--spice-text)',
							background: selected
								? 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.32)'
								: (existingStyle ? 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.10)' : 'transparent'),
							boxShadow: existingStyle?.kind && existingStyle.kind !== 'vocal'
								? 'inset 0 -2px 0 rgba(var(--spice-rgb-accent, 30, 215, 96), 0.75)'
								: 'none'
						},
						title: existingStyle
							? [getSyncCreatorKindLabel(existingStyle.kind), existingStyle.speaker].filter(Boolean).join(' · ')
							: undefined
					}, char === ' ' ? '\u00A0' : char);
				})),
				react.createElement('div', {
					style: { minHeight: 28, marginTop: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
				},
					react.createElement('div', {
						style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5, color: selectedText ? 'var(--spice-text)' : 'var(--spice-subtext)' }
					}, selectedText
						? `${I18n.t('syncCreator.rangeStyleSelected') || '선택'}: “${selectedText}” (${selectionStart + 1}–${selectionEnd + 1})`
						: (I18n.t('syncCreator.rangeStyleSelectPrompt') || '먼저 적용할 글자를 드래그하세요.')
					),
					react.createElement('button', {
						type: 'button',
						style: { ...s.deleteBtn, flexShrink: 0, opacity: selectedText ? 1 : 0.45 },
						disabled: !selectedText,
						onClick: clearStyle
					}, I18n.t('syncCreator.rangeStyleClear') || '스타일 지우기')
				),
				react.createElement('div', { className: 'sync-creator-range-style-columns' },
					react.createElement('section', { className: 'sync-creator-range-style-pane sync-creator-range-effect-picker' },
						react.createElement('div', { className: 'sync-creator-range-style-pane-title' }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
						renderTextEffectPicker(styleRangeEffect, selectRangeEffect, {
							compact: true,
							disabled: !selectedText,
							allowEmpty: true
						})
					),
					react.createElement('section', { className: 'sync-creator-range-style-pane sync-creator-range-color-picker' },
						react.createElement('div', { className: 'sync-creator-range-style-pane-title' }, I18n.t('syncCreator.rangeColorLabel') || '부분 색상'),
						react.createElement('div', {
							className: 'sync-creator-range-speaker-palette',
							style: {
								width: '100%',
								maxHeight: 270,
								overflowY: 'auto',
								overflowX: 'hidden',
								overscrollBehavior: 'contain'
							}
						},
							renderSpeakerPicker(
								styleRangeSpeaker,
								styleRangeSpeakerColor,
								styleRangeSpeakerFallback,
								selectRangeSpeaker,
								{ disabled: !selectedText }
							),
							isSyncCreatorCustomSpeaker(styleRangeSpeaker) && react.createElement('div', {
								style: { display: 'grid', gridTemplateColumns: '34px minmax(110px, 1fr)', gap: 7, marginTop: 7, alignItems: 'center' }
							},
								react.createElement('input', {
									type: 'color',
									disabled: !selectedText,
									value: sanitizeSyncCreatorSpeakerColor(styleRangeSpeaker, styleRangeSpeakerColor, true, styleRangeSpeakerFallback),
									onChange: event => {
										const nextColor = normalizeSyncCreatorSpeakerColor(event.target.value);
										setStyleRangeSpeakerColor(nextColor);
										applyRangeSpeakerMeta(styleRangeSpeaker, nextColor, styleRangeSpeakerFallback);
									},
									style: { width: 34, height: 30, padding: 2, border: `1px solid ${TOSS_BORDER}`, borderRadius: 7, background: 'transparent' },
									'aria-label': I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'
								}),
								react.createElement('select', {
									style: { ...s.select, width: '100%' },
									disabled: !selectedText,
									value: styleRangeSpeakerFallback,
									onChange: event => {
										const nextFallback = normalizeSyncCreatorSpeakerFallback(event.target.value) || SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK;
										setStyleRangeSpeakerFallback(nextFallback);
										applyRangeSpeakerMeta(styleRangeSpeaker, styleRangeSpeakerColor, nextFallback);
									}
								}, SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS.map(value => react.createElement('option', {
									key: value,
									value
								}, value.replace(' 1', ''))))
							)
						)
					)
				)
			)
		);
	};

	const renderStagePanel = () => react.createElement('div', { className: 'sync-creator-stage', style: { ...s.panel, ...s.stagePanel } },
		isLoading && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadingLyrics')),
		error && react.createElement('div', { style: { ...s.error, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
			react.createElement('div', null, error)
		),
		!isLoading && !error && !lyricsText && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadLyrics')),
		lyricsText && lyricsLines.length > 0 && react.createElement('div', { style: s.stageBody },
			react.createElement('div', { style: s.lineNav },
				react.createElement('button', { style: { ...s.navBtn, opacity: previousNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToPrevLine, disabled: previousNavigableLineIndex < 0 }, '‹'),
				react.createElement('div', { style: s.lineInfo },
					react.createElement('div', { style: s.lineCount }, `${currentLineIndex + 1} / ${lyricsLines.length}`),
					react.createElement('div', { style: s.lineStatus }, isCurrentLineSynced ? '✓ ' + I18n.t('syncCreator.synced') : I18n.t('syncCreator.notSynced'))
				),
				react.createElement('button', { style: { ...s.navBtn, opacity: nextNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToNextLine, disabled: nextNavigableLineIndex < 0 }, '›')
			),
			multiVocalMode && react.createElement('div', { style: s.multiVocalBanner },
				hasCurrentParallelParts
					? (I18n.t('syncCreator.multiVocalBannerParts') || 'Multiple vocal mode: sync each vocal part separately.')
					: (I18n.t('syncCreator.multiVocalBannerLine') || 'Multiple vocal mode: choose SPEAKER and text effect for this line.')
			),
			renderManualSplitEditor(),
			react.createElement('div', {
				className: `sync-creator-stage-lyrics${hasCurrentParallelParts ? ' is-parallel' : ''}`,
				style: hasCurrentParallelParts
					? { ...s.lyricsBox, ...s.lyricsBoxParallelScrollable, ...s.stageLyricsBox }
					: { ...s.lyricsBox, ...s.stageLyricsBox },
				onMouseDown: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
				onTouchStart: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
				ref: lyricsScrollRef
			},
				hasCurrentParallelParts
					? react.createElement('div', { style: s.parallelStack }, currentParallelParts.map((part, index) => renderParallelPartLine(part, index)))
					: react.createElement('div', {
						className: `ivlyrics-sync-stage-effect-preview lyrics-karaoke-part lead ${currentTextEffectKind}${textEffectsDisabled ? ' text-effects-disabled' : ''}`,
						style: s.stageEffectPreview
					}, react.createElement('div', {
						className: 'lyrics-karaoke-line is-active is-effect-live is-effect-focused',
						style: useCurrentLineTextRun ? { ...s.rtlLyricsLine, direction: currentLineDirection } : s.lyricsLine
					}, renderCurrentLineCharacters()))
			),
			nextNavigableLineIndex >= 0 && react.createElement('div', { style: s.nextLineBox },
				react.createElement('div', { style: s.nextLineLabel }, I18n.t('syncCreator.nextLine')),
				react.createElement('div', {
					style: {
						...s.nextLineText,
						direction: getSyncCreatorTextDirection(lyricsLines[nextNavigableLineIndex]),
						unicodeBidi: 'plaintext'
					}
				}, getSyncCreatorFuriganaReact(lyricsLines[nextNavigableLineIndex]))
			),
			mode === 'record' && react.createElement('div', { style: s.hint }, syncGranularityRecordingHint),
			react.createElement('div', { style: s.effectStripRow },
				react.createElement('span', { style: s.effectStripTitle }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
				renderTextEffectPicker(currentTextEffectKind, updateCurrentTextEffect, { compact: true })
			),
			renderStyleRangeEditor()
		)
	);

	const renderLineOffsetControls = () => {
		const buttonStyle = hasCurrentLineTiming ? s.lineOffsetBtn : { ...s.lineOffsetBtn, opacity: 0.45, cursor: 'not-allowed' };
		const renderOffsetButton = (deltaMs) => react.createElement('button', {
			key: deltaMs,
			type: 'button',
			style: buttonStyle,
			disabled: !hasCurrentLineTiming,
			onClick: () => adjustCurrentLineOffset(deltaMs)
		}, `${deltaMs > 0 ? '+' : ''}${deltaMs}ms`);

		return react.createElement('div', { style: s.lineOffsetBox },
			react.createElement('div', { style: s.lineOffsetHeader },
				react.createElement('span', { style: s.lineOffsetLabel }, I18n.t('syncCreator.lineOffset') || '라인 오프셋'),
				react.createElement('span', { style: s.lineOffsetValue }, currentLineTimingLabel)
			),
			react.createElement('div', { style: s.lineOffsetButtonRow },
				[-100, -10, 10, 100].map(renderOffsetButton)
			)
		);
	};

	const renderCurrentLineTools = () => lyricsText && lyricsLines.length > 0 && react.createElement('div', { className: 'sync-creator-section sync-creator-current-line-section', style: s.panel },
		react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.currentLine') || '현재 가사'),
		renderLineOffsetControls(),
		react.createElement('div', { style: s.rightActionRow },
			!multiVocalMode && currentFullLineChars.length > 1 && react.createElement('button', {
				type: 'button',
				style: s.multiVocalSwitchBtn,
				onClick: enableManualMultiVocalMode
			}, I18n.t('syncCreator.enableMultiVocalMode') || 'Enable multiple vocal mode'),
			canMergeCurrentLineWithNext && react.createElement('button', {
				type: 'button',
				style: s.multiVocalSwitchBtn,
				onClick: mergeCurrentLineWithNext
			}, I18n.t('syncCreator.mergeWithNextLine') || 'Merge next line')
		)
	);

	const getHistoryDate = (timestamp) => {
		if (timestamp === null || timestamp === undefined || timestamp === '') return null;
		const numericTimestamp = Number(timestamp);
		if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return null;
		const date = new Date(numericTimestamp);
		return Number.isFinite(date.getTime()) ? date : null;
	};
	const formatHistoryTime = (timestamp) => {
		const date = getHistoryDate(timestamp);
		if (!date) return '';
		try {
			return new Intl.DateTimeFormat(undefined, {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			}).format(date);
		} catch (error) {
			return date.toLocaleTimeString();
		}
	};
	const formatHistoryDateTime = (timestamp) => {
		const date = getHistoryDate(timestamp);
		return date ? date.toISOString() : undefined;
	};
	const getHistoryEntryLabel = (entry) => {
		const lineNumber = Math.max(1, Number(entry?.lineIndex) + 1 || 1);
		if (entry?.kind === 'source') {
			return I18n.t('syncCreator.historySourceLoaded') || '가사 원본 불러옴';
		}
		if (entry?.kind === 'line') {
			if (entry.partId && entry.partId !== 'full') {
				return I18n.t('syncCreator.historyPartCompleted', {
					line: lineNumber,
					part: String(entry.partId).toUpperCase()
				}) || `${lineNumber}번 줄 · ${String(entry.partId).toUpperCase()} 완료`;
			}
			return I18n.t('syncCreator.historyLineCompleted', { line: lineNumber })
				|| `${lineNumber}번 줄 완료`;
		}
		if (entry?.kind === 'working') {
			return I18n.t('syncCreator.historyCurrentWork') || '현재 작업';
		}
		return I18n.t('syncCreator.historyManualCheckpoint') || '수동 체크포인트';
	};
	const historySaveLabel = (() => {
		if (isRestoringCheckpoint) return I18n.t('syncCreator.historyRestoring') || '복원 중';
		if (sessionSaveState === 'loading') return I18n.t('syncCreator.historyChecking') || '복구 확인 중';
		if (sessionSaveState === 'saving') return I18n.t('syncCreator.historySaving') || '저장 중';
		if (sessionSaveState === 'dirty') return I18n.t('syncCreator.historyAutosavePending') || '다음 자동 저장 대기';
		if (sessionSaveState === 'disabled') return I18n.t('syncCreator.historyAutosaveDisabled') || '자동 저장 꺼짐';
		if (sessionSaveState === 'error') return I18n.t('syncCreator.historySaveError') || '저장 실패';
		if (sessionSaveState === 'idle') return I18n.t('syncCreator.historyIdle') || '저장 대기';
		return I18n.t('syncCreator.historySaved') || '자동 저장됨';
	})();
	const historySaveDotColor = sessionSaveState === 'error'
		? '#ff7878'
		: (isRestoringCheckpoint || sessionSaveState === 'saving' || sessionSaveState === 'dirty' || sessionSaveState === 'loading')
			? '#f6c76b'
			: (sessionSaveState === 'idle' || sessionSaveState === 'disabled' ? 'rgba(255,255,255,0.30)' : TOSS_BLUE);
	const historySourceLabel = [
		provider || addonId,
		selectedLrclibSource?.lrclibId !== null && selectedLrclibSource?.lrclibId !== undefined
			? `LRCLIB #${selectedLrclibSource.lrclibId}`
			: ''
	].filter(Boolean).join(' · ');

	const renderHistoryPanel = () => react.createElement('section', {
		ref: historyPanelRef,
		className: 'sync-creator-history-panel',
		style: {
			...s.historyPanel,
			maxHeight: 'calc(100% - 180px)',
			...(historyPanelHeight ? {
				flex: `0 0 ${Math.round(historyPanelHeight)}px`,
				height: `${Math.round(historyPanelHeight)}px`
			} : null)
		},
		'aria-busy': isRestoringCheckpoint ? 'true' : undefined,
		'aria-label': I18n.t('syncCreator.historyTitle') || '작업 내역'
	},
		react.createElement('div', {
			className: 'sync-creator-history-resize-handle',
			style: s.historyResizeHandle,
			role: 'separator',
			tabIndex: 0,
			'aria-orientation': 'horizontal',
			'aria-label': I18n.t('syncCreator.historyResize') || '작업 내역 높이 조절',
			'aria-valuemin': SYNC_CREATOR_HISTORY_MIN_HEIGHT,
			'aria-valuemax': Math.round(getHistoryPanelHeightBounds().max),
			'aria-valuenow': Math.round(historyPanelHeight || 190),
			title: I18n.t('syncCreator.historyResizeHint') || '위아래로 드래그해 작업 내역 높이를 조절합니다.',
			onPointerDown: handleHistoryResizePointerDown,
			onPointerMove: handleHistoryResizePointerMove,
			onPointerUp: finishHistoryResize,
			onPointerCancel: finishHistoryResize,
			onKeyDown: handleHistoryResizeKeyDown
		}, react.createElement('span', { style: s.historyResizeGrip, 'aria-hidden': true })),
		react.createElement('div', { style: s.historyHeader },
			react.createElement('div', { style: s.historyTitleRow },
				react.createElement('h3', { style: { ...s.historyTitle, margin: 0 } }, I18n.t('syncCreator.historyTitle') || '작업 내역'),
				react.createElement('span', { style: s.historyCount }, sessionHistory.length),
				react.createElement('button', {
					type: 'button',
					className: 'sync-creator-autosave-toggle',
					style: s.historyAutosaveToggle,
					role: 'switch',
					'aria-checked': isSessionAutosaveEnabled,
					onClick: toggleSessionAutosave,
					title: I18n.t('syncCreator.historyAutosaveDescription') || '현재 작업을 30초마다 자동 저장합니다.'
				},
					react.createElement('span', { style: s.historyAutosaveLabel }, I18n.t('syncCreator.historyAutosaveToggle') || '자동 저장'),
					react.createElement('span', {
						style: {
							...s.historyAutosaveTrack,
							...(isSessionAutosaveEnabled ? s.historyAutosaveTrackActive : null)
						},
						'aria-hidden': true
					}, react.createElement('span', {
						style: {
							...s.historyAutosaveThumb,
							transform: isSessionAutosaveEnabled ? 'translateX(12px)' : 'translateX(0)'
						}
					}))
				),
				react.createElement('div', { style: s.historyActions },
					react.createElement('button', {
						type: 'button',
						style: s.historyIconButton,
						onClick: () => moveHistoryCursor(-1),
						disabled: historyCursorIndex <= 0 || isRestoringCheckpoint,
						title: I18n.t('syncCreator.historyPrevious') || '이전 상태',
						'aria-label': I18n.t('syncCreator.historyPrevious') || '이전 상태'
					}, react.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
						react.createElement('path', { d: 'M9 14 4 9l5-5' }),
						react.createElement('path', { d: 'M4 9h9a6 6 0 0 1 6 6v1' })
					)),
					react.createElement('button', {
						type: 'button',
						style: s.historyIconButton,
						onClick: () => moveHistoryCursor(1),
						disabled: historyCursorIndex < 0 || historyCursorIndex >= sessionHistory.length - 1 || isRestoringCheckpoint,
						title: I18n.t('syncCreator.historyNext') || '다음 상태',
						'aria-label': I18n.t('syncCreator.historyNext') || '다음 상태'
					}, react.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
						react.createElement('path', { d: 'm15 14 5-5-5-5' }),
						react.createElement('path', { d: 'M20 9h-9a6 6 0 0 0-6 6v1' })
					)),
					react.createElement('button', {
						type: 'button',
						style: s.historyIconButton,
						onClick: addManualCheckpoint,
						disabled: !activeSessionDraftKey || isRestoringCheckpoint || mode === 'record' || isDragging,
						title: I18n.t('syncCreator.historyAddCheckpoint') || '현재 상태 저장',
						'aria-label': I18n.t('syncCreator.historyAddCheckpoint') || '현재 상태 저장'
					}, react.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
						react.createElement('path', { d: 'M12 5v14M5 12h14' })
					))
				)
			),
			react.createElement('div', { style: s.historyMeta },
				react.createElement('span', { style: s.historySource, title: historySourceLabel }, historySourceLabel || (I18n.t('syncCreator.historyNoSource') || '가사 원본 없음')),
				react.createElement('span', {
					style: s.historySaveState,
					title: lastSessionSavedAt ? formatHistoryTime(lastSessionSavedAt) : ''
				},
					react.createElement('span', { style: { ...s.historySaveDot, background: historySaveDotColor } }),
					historySaveLabel
				)
			)
		),
		sessionHistory.length > 0
			? react.createElement('ol', { ref: historyListRef, style: s.historyList },
				sessionHistory.map((entry, index) => {
					const isCurrent = entry.id === sessionHistoryCursorId;
					const historyTimeLabel = formatHistoryTime(entry.createdAt);
					return react.createElement('li', { key: entry.id, style: s.historyItem },
						react.createElement('button', {
							type: 'button',
							className: `sync-creator-history-row${isCurrent ? ' is-current' : ''}`,
							style: { ...s.historyButton, ...(isCurrent ? s.historyButtonActive : null) },
							onClick: isCurrent ? undefined : () => restoreHistoryCheckpoint(entry.id),
							disabled: isCurrent || isRestoringCheckpoint,
							'aria-current': isCurrent ? 'step' : undefined,
							'data-history-id': entry.id,
							title: entry.lineText || getHistoryEntryLabel(entry)
						},
							react.createElement('span', { style: s.historyTimeline, 'aria-hidden': true },
								sessionHistory.length > 1 && react.createElement('span', {
									style: {
										...s.historyLine,
										top: index === 0 ? '50%' : '-7px',
										bottom: index === sessionHistory.length - 1 ? '50%' : '-7px'
									}
								}),
								react.createElement('span', { style: { ...s.historyDot, ...(isCurrent ? s.historyDotActive : null) } })
							),
							react.createElement('span', { style: s.historyContent },
								react.createElement('span', { style: s.historyLabel }, getHistoryEntryLabel(entry)),
								entry.lineText && react.createElement('span', { style: { ...s.historyText, display: 'block' } }, entry.lineText)
							),
							historyTimeLabel && react.createElement('time', {
								style: s.historyTime,
								dateTime: formatHistoryDateTime(entry.createdAt)
							}, historyTimeLabel)
						)
					);
				})
			)
			: react.createElement('div', { style: s.historyEmpty },
				I18n.t('syncCreator.historyEmpty') || '30초 자동 저장 또는 수동 저장 시 작업 상태가 여기에 기록됩니다.'
			),
		react.createElement('div', {
			style: s.historyLive,
			role: 'status',
			'aria-live': 'polite',
			'aria-atomic': 'true'
		}, historyAnnouncement)
	);

	const renderRightRail = () => react.createElement('aside', { className: 'sync-creator-inspector-rail', style: s.rightRail },
		react.createElement('div', { className: 'sync-creator-inspector-scroll', style: s.inspectorScroll },
			renderCurrentLineTools(),
			lyricsText && lyricsLines.length > 0 && (activeParallelPart || !hasCurrentParallelParts) && renderLineInspector()
		),
		renderHistoryPanel()
	);

	const renderBulkCustomSpeakerDialog = () => showBulkCustomSpeakerDialog && react.createElement('div', {
		style: s.lrcLibModal,
		role: 'dialog',
		'aria-modal': true,
		onClick: (event) => {
			if (event.target === event.currentTarget) setShowBulkCustomSpeakerDialog(false);
		},
		onKeyDown: (event) => {
			if (event.key === 'Escape') setShowBulkCustomSpeakerDialog(false);
		}
	},
		react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '440px' } },
			react.createElement('h3', { style: s.lrcLibTitle },
				`${I18n.t('syncCreator.bulkVocalLabel') || 'All vocals'} · CUSTOM`
			),
			react.createElement('div', {
				style: {
					...s.customSpeakerColorEditor,
					marginTop: 0,
					padding: 0,
					border: 'none',
					background: 'transparent'
				}
			},
				react.createElement('input', {
					type: 'color',
					style: s.customSpeakerColorPicker,
					value: sanitizeSyncCreatorSpeakerColor(
						'CUSTOM',
						bulkCustomSpeakerColor,
						true,
						bulkCustomSpeakerFallback
					),
					onChange: (event) => setBulkCustomSpeakerColor(event.target.value),
					'aria-label': I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'
				}),
				react.createElement('div', { style: s.customSpeakerColorFields },
					react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'),
					react.createElement('input', {
						type: 'text',
						style: s.customSpeakerColorText,
						value: bulkCustomSpeakerColor,
						placeholder: '#00ff00',
						maxLength: 7,
						autoFocus: true,
						onFocus: (event) => event.currentTarget.select(),
						onChange: (event) => setBulkCustomSpeakerColor(event.target.value),
						onKeyDown: (event) => {
							if (event.key !== 'Enter') return;
							event.preventDefault();
							applyBulkCustomSpeaker();
						}
					}),
					react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomFallback') || 'Fallback color group'),
					react.createElement('select', {
						style: { ...s.select, width: '100%' },
						value: bulkCustomSpeakerFallback,
						onChange: (event) => setBulkCustomSpeakerFallback(event.target.value)
					}, SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS.map(value => react.createElement('option', {
						key: value,
						value
					}, value.replace(' 1', ''))))
				)
			),
			react.createElement('div', { style: s.lrcLibBtnRow },
				react.createElement('button', {
					type: 'button',
					style: s.lrcLibBtnCancel,
					onClick: () => setShowBulkCustomSpeakerDialog(false)
				}, I18n.t('cancel') || 'Cancel'),
				react.createElement('button', {
					type: 'button',
					style: s.lrcLibBtn,
					onClick: applyBulkCustomSpeaker
				}, I18n.t('buttons.apply') || 'Apply')
			)
		)
	);

	const renderModals = () => {
		const renderParentheticalLayoutChoice = (modeValue, title, description, previewLines, primary = false) => react.createElement('button', {
			type: 'button',
			style: {
				...s.parentheticalLayoutOption,
				...(primary ? s.parentheticalLayoutOptionPrimary : null)
			},
			onClick: () => resolveParentheticalLayoutDecision(modeValue)
		},
			react.createElement('div', { style: s.parentheticalLayoutOptionTitle }, title),
			react.createElement('div', { style: s.parentheticalLayoutOptionDesc }, description),
			react.createElement('div', { style: s.parentheticalLayoutPreview },
				(Array.isArray(previewLines) ? previewLines : []).map((line, index) =>
					react.createElement('div', { key: `${modeValue}-${index}` }, line)
				)
			)
		);

		return react.createElement(react.Fragment, null,
		pendingMultiVocalDecision && react.createElement('div', { style: s.lrcLibModal },
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '560px' } },
				react.createElement('h3', { style: s.lrcLibTitle }, I18n.t('syncCreator.multiVocalDetectedTitle') || 'Multiple vocals detected'),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.multiVocalDetectedBody') || 'This lyric contains lines with parentheses or separators, so it can be synced as separate vocal parts. Choose how to work on this song.'
				),
				pendingMultiVocalDecision.preview && react.createElement('div', {
					style: s.multiVocalDecisionPreview,
					title: pendingMultiVocalDecision.preview
				}, pendingMultiVocalDecision.preview),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => resolveMultiVocalDecision(false)
					}, I18n.t('syncCreator.multiVocalDecisionNormal') || 'Continue in normal mode'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => resolveMultiVocalDecision(true)
					}, I18n.t('syncCreator.multiVocalDecisionMulti') || 'Continue in multiple vocal mode')
				)
			)
		),
		pendingParentheticalLayoutDecision && react.createElement('div', { style: s.lrcLibModal },
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '680px' } },
				react.createElement('h3', { style: s.lrcLibTitle }, I18n.t('syncCreator.parentheticalLayoutTitle') || 'Choose parenthetical vocal layout'),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.parentheticalLayoutBody') || 'This line has multiple parenthetical vocal parts. Choose how it should be shown and synced.'
				),
				react.createElement('div', { style: s.parentheticalLayoutOriginal },
					`${I18n.t('syncCreator.parentheticalLayoutOriginal') || 'Original'}: ${pendingParentheticalLayoutDecision.original || ''}`
				),
				react.createElement('div', { style: s.parentheticalLayoutGrid },
					renderParentheticalLayoutChoice(
						'separate',
						I18n.t('syncCreator.parentheticalLayoutSeparateLabel') || 'Separate each part',
						I18n.t('syncCreator.parentheticalLayoutSeparateDesc') || 'Sync each parenthetical vocal as its own vocal line.',
						pendingParentheticalLayoutDecision.separatePreview,
						false
					),
					renderParentheticalLayoutChoice(
						'grouped',
						I18n.t('syncCreator.parentheticalLayoutGroupedLabel') || 'Group on one line',
						I18n.t('syncCreator.parentheticalLayoutGroupedDesc') || 'Sync adjacent parenthetical vocals together as one vocal line.',
						pendingParentheticalLayoutDecision.groupedPreview,
						true
					)
				)
			)
		),
		renderBulkCustomSpeakerDialog(),
		showCharacterPronunciationConsent && react.createElement('div', {
			style: s.lrcLibModal,
			onClick: (e) => {
				if (e.target !== e.currentTarget) return;
				characterPronunciationConsentForceRef.current = false;
				setShowCharacterPronunciationConsent(false);
			}
		},
			react.createElement('div', { style: s.lrcLibContent },
				react.createElement('h3', { style: s.lrcLibTitle },
					I18n.t('syncCreator.characterPronunciationTokenWarningTitle') || 'AI character pronunciation token usage'
				),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.characterPronunciationTokenWarningBody') || 'This feature generates pronunciation aligned to each character for karaoke sync, so it uses more AI tokens than ordinary pronunciation generation.'
				),
				react.createElement('div', {
					style: {
						fontSize: '12px',
						color: '#ffb74d',
						lineHeight: 1.55,
						padding: '12px 14px',
						background: 'rgba(255, 152, 0, 0.08)',
						borderRadius: '10px',
						border: '1px solid rgba(255, 152, 0, 0.28)'
					}
				}, I18n.t('syncCreator.characterPronunciationTokenWarningUsage') || 'Expected usage: about 3-6x more tokens than a normal line-by-line pronunciation request. Actual usage varies by lyrics length, language, and provider retries.'),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => {
							characterPronunciationConsentForceRef.current = false;
							setShowCharacterPronunciationConsent(false);
						}
					}, I18n.t('syncCreator.characterPronunciationTokenWarningCancel') || I18n.t('cancel') || 'Cancel'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => {
							const forceRegenerate = characterPronunciationConsentForceRef.current;
							characterPronunciationConsentForceRef.current = false;
							setShowCharacterPronunciationConsent(false);
							handleCharacterPronunciationToggle({ skipConsent: true, forceRegenerate });
						}
					}, I18n.t('syncCreator.characterPronunciationTokenWarningConfirm') || 'I understand and generate')
				)
			)
		),
		);
	};

	const showRightRail = Boolean(lyricsText && lyricsLines.length > 0);
	const workspaceStyle = showRightRail
		? s.workspace
		: { ...s.workspace, gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)' };

	return react.createElement('div', { className: 'ivlyrics-sync-creator-shell', style: s.overlay, ref: containerRef },
		renderHeader(),
		react.createElement('div', { className: `sync-creator-workspace${showRightRail ? ' has-inspector' : ''}`, style: workspaceStyle },
			react.createElement('aside', { className: 'sync-creator-source-rail', style: s.sideRail },
				renderSourcePanel(),
				renderProgressPanel(),
				renderShortcutGuide()
			),
			react.createElement('main', { className: 'sync-creator-editor-column', style: s.centerRail },
				renderPlaybackPanel(),
				renderLrclibCandidatesPanel(),
				renderStagePanel()
			),
			showRightRail && renderRightRail()
		),
		renderModals()
	);

	return react.createElement('div', { className: 'ivlyrics-sync-creator-shell', style: s.overlay, ref: containerRef },
		// Header - 유저 요청대로 가운데 정렬 (윈도우 컨트롤과 겹치지 않게)
		react.createElement('div', { style: s.header },
			react.createElement('button', {
				style: s.backBtn, onClick: () => {
					preventNextTrackRef.current = false;
					if (onClose) onClose();
				}
			},
				react.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' },
					react.createElement('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
				),
				I18n.t('syncCreator.back') || '닫기'
			),
			react.createElement('h2', { style: s.title }, I18n.t('syncCreator.title')),
			react.createElement('span', { style: { ...s.modeBadge, ...getModeStyle() } }, getModeLabel()),

			react.createElement('button', {
				style: { ...s.submitBtn, opacity: isSubmitting || !syncData ? 0.5 : 1, cursor: isSubmitting || !syncData ? 'not-allowed' : 'pointer' },
				onClick: handleSubmit,
				disabled: isSubmitting || !syncData
			}, isSubmitting ? I18n.t('syncCreator.submitting') : I18n.t('syncCreator.submit'))
		),

		// Track + Provider
		react.createElement('div', { style: s.trackRow },
			albumArt && react.createElement('img', { src: albumArt, style: s.albumArt, alt: trackName }),
			react.createElement('div', { style: s.trackMeta },
				react.createElement('div', { style: s.trackName }, trackName),
				react.createElement('div', { style: s.artistName }, artistName)
			),
			react.createElement('div', { style: s.providerRow },
				react.createElement('span', { style: { fontSize: '12px', color: 'var(--spice-subtext)' } }, 'Provider:'),
				react.createElement('span', { style: s.virtualKaraokeBadge }, 'LRCLIB'),
				react.createElement('button', { style: { ...s.loadBtn, opacity: isLoading ? 0.5 : 1 }, onClick: loadLyrics, disabled: isLoading },
					isLoading ? I18n.t('syncCreator.loading') : I18n.t('syncCreator.reload') || '다시 로드'
				),
				lyricsLines.length > 0 && renderCharacterPronunciationTargetControl({ compact: true }),
				lyricsLines.length > 0 && react.createElement('button', {
					style: {
						...s.secondaryBtn,
						opacity: isGeneratingCharacterPronunciations ? 0.6 : 1,
						background: showCharacterPronunciations ? 'rgba(49, 130, 246, 0.22)' : s.secondaryBtn.background
					},
					onClick: handleCharacterPronunciationToggle,
					disabled: isGeneratingCharacterPronunciations,
					title: I18n.t('syncCreator.characterPronunciationDesc') || 'Generate character-aligned pronunciation with AI and show it below the current line.'
				}, isGeneratingCharacterPronunciations
					? (characterPronunciationProgressInfo?.buttonLabel || I18n.t('syncCreator.characterPronunciationGenerating') || 'AI 발음 생성 중...')
					: characterPronunciations
						? (showCharacterPronunciations
							? (I18n.t('syncCreator.characterPronunciationHide') || '발음 숨기기')
							: (I18n.t('syncCreator.characterPronunciationShow') || '발음 표시'))
						: (I18n.t('syncCreator.characterPronunciationGenerate') || 'AI 글자 발음')
				),
				characterPronunciations && react.createElement('button', {
					style: s.secondaryBtn,
					onClick: () => handleCharacterPronunciationToggle({ forceRegenerate: true }),
					disabled: isGeneratingCharacterPronunciations,
					title: I18n.t('syncCreator.characterPronunciationRegenerateDesc') || 'Ignore the saved result and generate pronunciation again.'
				}, I18n.t('syncCreator.characterPronunciationRegenerate') || 'Regenerate Pronunciation'),
				isGeneratingCharacterPronunciations && characterPronunciationProgressInfo && react.createElement('div', {
					style: s.characterPronunciationProgress,
					title: characterPronunciationProgressInfo.label
				},
					react.createElement('div', { style: s.characterPronunciationProgressText }, characterPronunciationProgressInfo.label),
					react.createElement('div', { style: s.characterPronunciationProgressTrack },
						react.createElement('div', {
							style: {
								...s.characterPronunciationProgressFill,
								width: `${Math.max(0, Math.min(100, characterPronunciationProgressInfo.percent || 0))}%`
							}
						})
					)
				),
				characterPronunciations && showCharacterPronunciations && react.createElement('button', {
					style: {
						...s.secondaryBtn,
						background: isCharacterPronunciationPrimary ? 'rgba(49, 130, 246, 0.22)' : s.secondaryBtn.background
					},
					onClick: () => setIsCharacterPronunciationPrimary(value => !value),
					title: I18n.t('syncCreator.characterPronunciationPrimaryDesc') || '생성된 발음을 크게, 원어 가사를 작게 표시합니다.'
				}, I18n.t('syncCreator.characterPronunciationPrimary') || '발음 크게'),
				renderBulkSpeakerControl({ compact: true }),
				isVirtualKaraokeSource && react.createElement('span', { style: s.virtualKaraokeBadge },
					I18n.t('syncCreator.virtualKaraoke') || '가상 노래방 데이터'
				)
			)
		),

		addonId === SYNC_CREATOR_SOURCE_ADDON_ID && react.createElement('div', { style: s.candidatePanel },
			react.createElement('div', { style: s.candidatePanelHeader },
				react.createElement('div', { style: s.candidatePanelTitle },
					`${I18n.t('syncCreator.lrclibSearchResults') || 'LRCLIB Search Results'} ${(lrclibSearchMeta?.totalResults || lrclibCandidates.length || 0) > 0 ? `(${lrclibSearchMeta?.totalResults || lrclibCandidates.length})` : ''}`
				),
				react.createElement('button', {
					type: 'button',
					style: s.secondaryBtn,
					onClick: () => setShowLrclibCandidates(prev => !prev)
				}, showLrclibCandidates
					? (I18n.t('syncCreator.hideLrclibSearchResults') || 'Hide Search Results')
					: (I18n.t('syncCreator.showLrclibSearchResults') || 'Show Search Results'))
			),
			showLrclibCandidates && react.createElement('div', { style: s.candidateList },
				isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty },
					I18n.t('syncCreator.loadingLyrics') || 'Loading lyrics...'
				),
				!isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty },
					lrclibSearchMeta?.error || (I18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')
				),
				lrclibCandidates.map((candidate, index) => {
					const isPreviewing = previewLrclibCandidate?.candidateKey === candidate.candidateKey;
					const isApplied = selectedLrclibCandidateKey === candidate.candidateKey;
					const candidateId = getLrclibCandidateId(candidate);
					let itemStyle = { ...s.candidateItem };
					if (isPreviewing) itemStyle = { ...itemStyle, ...s.candidateItemActive };
					if (isApplied) itemStyle = { ...itemStyle, ...s.candidateItemApplied };

					return react.createElement('button', {
						key: candidate.candidateKey,
						type: 'button',
						style: itemStyle,
						onClick: () => setPreviewLrclibCandidateKey(candidate.candidateKey)
					},
						react.createElement('div', { style: s.candidateTitleRow },
							react.createElement('span', { style: s.candidateTitle }, `${index + 1}. ${candidate.trackName || candidate.name || trackName}`),
							candidateId && react.createElement('span', {
								style: s.candidateIdBadge,
								title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${candidateId}`,
								onClick: (event) => copyLrclibCandidateId(candidateId, event)
							}, `ID ${candidateId}`)
						),
						react.createElement('div', { style: s.candidateSubtitle },
							`${candidate.artistName || artistName} · ${formatSeconds(Number(candidate.duration || 0))}`
						),
						react.createElement('div', { style: s.candidateMetaRow },
							candidate.syncLineExactMatch && react.createElement('span', { style: { ...s.candidateBadge, color: '#8fc1ff' } }, I18n.t('syncCreator.lrclibBadgeExact') || 'Exact'),
							candidate.hasSyncedLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
							candidate.hasPlainLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain'),
							candidate.searchSource === 'primary' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePrimary') || 'Primary'),
							candidate.searchSource === 'english' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeEnglish') || 'English'),
							isApplied && react.createElement('span', { style: { ...s.candidateBadge, color: '#8fc1ff' } }, I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
						)
					);
				})
			),
			showLrclibCandidates && react.createElement('div', { style: s.candidatePreview },
				previewLrclibCandidate
					? react.createElement(react.Fragment, null,
						react.createElement('div', { style: s.candidatePreviewHeader },
							react.createElement('div', null,
								react.createElement('div', { style: s.candidatePreviewTitle }, previewLrclibCandidate.trackName || previewLrclibCandidate.name || trackName),
								react.createElement('div', { style: s.candidatePreviewSubtitle },
									`${previewLrclibCandidate.artistName || artistName} · ${previewLrclibCandidate.albumName || ''}`.replace(/\s·\s$/, '')
								)
							),
							react.createElement('div', { style: s.candidatePreviewActions },
								getLrclibCandidateId(previewLrclibCandidate) && react.createElement('button', {
									type: 'button',
									style: s.candidateIdButton,
									title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${getLrclibCandidateId(previewLrclibCandidate)}`,
									onClick: (event) => copyLrclibCandidateId(previewLrclibCandidate, event)
								}, `ID ${getLrclibCandidateId(previewLrclibCandidate)}`),
								react.createElement('button', {
									type: 'button',
									style: { ...s.secondaryBtn, opacity: selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey ? 0.7 : 1 },
									onClick: () => applySelectedLrclibCandidate(previewLrclibCandidate.candidateKey),
									disabled: isLoading
								}, selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey
									? (I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
									: (I18n.t('syncCreator.lrclibApplyCandidate') || 'Load This Lyrics'))
							)
						),
						react.createElement('div', { style: s.candidateMetaRow },
							react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricArtist') || 'artist'} ${Number(previewLrclibCandidate.artistScore || 0).toFixed(3)}`),
							react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricTitle') || 'title'} ${Number(previewLrclibCandidate.titleScore || 0).toFixed(3)}`),
							react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricDiff') || 'diff'} ${formatSeconds(Number(previewLrclibCandidate.durationDiff || 0))}`),
							previewLrclibCandidate.preferredLyricsSource === 'synced' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
							previewLrclibCandidate.preferredLyricsSource === 'plain' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain')
						),
						react.createElement('pre', { style: s.candidatePreviewText }, previewLrclibCandidate.previewText || '')
					)
					: react.createElement('div', { style: s.candidateEmpty },
						I18n.t('syncCreator.lrclibSelectCandidate') || 'Select a candidate'
					)
			)
		),

		// Playback
		lyricsText && react.createElement('div', { style: s.playbackRow },
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-3000) }, '-3s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-1000) }, '-1s'),
			react.createElement('span', { style: s.playbackTime }, formatTime(position)),
			(() => {
				const playbackPercent = (position / (Spicetify.Player?.data?.item?.duration?.milliseconds || 1)) * 100;
				return react.createElement('div', {
					style: { ...s.playbackBar, '--iv-progress': `${playbackPercent}%` },
					'data-iv-progress-bar': 'true',
					onClick: handleSeek
				},
					react.createElement('div', { style: { ...s.playbackFill, width: `${playbackPercent}%` } })
				);
			})(),
			react.createElement('span', { style: s.playbackTime }, formatTime(Spicetify.Player?.data?.item?.duration?.milliseconds || 0)),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(1000) }, '+1s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(3000) }, '+3s')
		),

		// Offset
		lyricsText && syncData && react.createElement('div', { style: s.offsetRow },
			react.createElement('span', { style: s.offsetLabel }, I18n.t('syncCreator.globalOffset')),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-100) }, '-100ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-10) }, '-10ms'),
			react.createElement('span', { style: s.offsetValue }, `${globalOffset >= 0 ? '+' : ''}${globalOffset}ms`),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(10) }, '+10ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(100) }, '+100ms')
		),

		// Lyrics Area
		react.createElement('div', { style: s.lyricsArea },
			isLoading && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadingLyrics')),
			error && react.createElement('div', { style: { ...s.error, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
				react.createElement('div', null, error)
			),
			!isLoading && !error && !lyricsText && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadLyrics')),

			lyricsText && lyricsLines.length > 0 && react.createElement(react.Fragment, null,
				// Line Navigation (이전/다음 버튼)
				react.createElement('div', { style: s.lineNav },
					react.createElement('button', { style: { ...s.navBtn, opacity: previousNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToPrevLine, disabled: previousNavigableLineIndex < 0 }, '◀'),
					react.createElement('div', { style: s.lineInfo },
						react.createElement('div', { style: s.lineCount }, `${currentLineIndex + 1} / ${lyricsLines.length}`),
						react.createElement('div', { style: s.lineStatus }, isCurrentLineSynced ? '✓ ' + I18n.t('syncCreator.synced') : I18n.t('syncCreator.notSynced'))
					),
					react.createElement('button', { style: { ...s.navBtn, opacity: nextNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToNextLine, disabled: nextNavigableLineIndex < 0 }, '▶')
				),

				((!multiVocalMode && currentFullLineChars.length > 1) || canMergeCurrentLineWithNext) && react.createElement('div', { style: s.multiVocalSwitchRow },
					!multiVocalMode && currentFullLineChars.length > 1 && react.createElement('button', {
						type: 'button',
						style: s.multiVocalSwitchBtn,
						onClick: enableManualMultiVocalMode
					}, I18n.t('syncCreator.enableMultiVocalMode') || 'Enable multiple vocal mode'),
					canMergeCurrentLineWithNext && react.createElement('button', {
						type: 'button',
						style: s.multiVocalSwitchBtn,
						onClick: mergeCurrentLineWithNext
					}, I18n.t('syncCreator.mergeWithNextLine') || 'Merge next line')
				),

				multiVocalMode && react.createElement('div', { style: s.multiVocalBanner },
					hasCurrentParallelParts
						? (I18n.t('syncCreator.multiVocalBannerParts') || 'Multiple vocal mode: sync each vocal part separately.')
						: (I18n.t('syncCreator.multiVocalBannerLine') || 'Multiple vocal mode: choose SPEAKER and text effect for this line.')
				),

				multiVocalMode && currentFullLineChars.length > 1 && react.createElement('div', { style: s.parallelSplitEditor },
					react.createElement('div', { style: s.parallelSplitHeader },
						react.createElement('span', { style: s.parallelSplitTitle }, I18n.t('syncCreator.manualSplit') || 'Manual split'),
						hasManualParallelSplit && react.createElement('span', { style: s.parallelSplitBadge }, `${currentManualSplitPoints.length + 1} parts`),
						hasManualDraftSplit && react.createElement('button', {
							type: 'button',
							style: s.parallelSplitResetBtn,
							onClick: resetCurrentLineManualSplit
						}, I18n.t('syncCreator.useAutoSplit') || 'Use auto'),
						react.createElement('button', {
							type: 'button',
							style: s.parallelSplitToggleBtn,
							onClick: () => setIsParallelSplitCollapsed(prev => !prev)
						}, isParallelSplitCollapsed
							? (I18n.t('update.expand') || 'Expand')
							: (I18n.t('update.collapse') || 'Collapse'))
					),
					!isParallelSplitCollapsed && react.createElement('div', { style: s.parallelSplitBody },
						react.createElement('div', { style: s.parallelSplitTape },
						currentFullLineChars.map((char, index) => react.createElement(react.Fragment, { key: `manual-split-${currentLineStart}-${index}` },
							index > 0 && react.createElement('button', {
								type: 'button',
								style: {
									...s.parallelSplitBoundary,
									...(currentManualSplitPointSet.has(index) ? s.parallelSplitBoundaryActive : null)
								},
								title: I18n.t('syncCreator.splitHere') || 'Split here',
								onClick: (e) => {
									e.preventDefault();
									e.stopPropagation();
									toggleManualParallelSplitPoint(index);
								}
							}, currentManualSplitPointSet.has(index) ? '|' : '·'),
							react.createElement('span', { style: s.parallelSplitChar }, char === ' ' ? '\u00A0' : char)
						))
					)
					)
				),

				false && hasCurrentParallelParts && react.createElement('div', { style: s.parallelPartRow },
					currentParallelParts.map((part, index) => {
						const speakerLabel = part.speaker || `VOCAL ${index + 1}`;
						const kindLabel = getSyncCreatorKindLabel(part.kind) || I18n.t('syncCreator.unselectedType') || 'Text effect not selected';
						return react.createElement('button', {
							key: part.id,
							type: 'button',
							style: {
								...s.parallelPartBtn,
								...(activeParallelPartId === part.id ? s.parallelPartBtnActive : null)
							},
							onClick: () => {
								setActiveParallelPartId(part.id);
								setRecordingProgressIndex(-1);
								clearRecordingLock();
								charTimesRef.current = [];
								if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
							}
						}, `${speakerLabel} · ${kindLabel} · ${countRangeChars(part.ranges)}`);
					})
				),

				(activeParallelPart || !hasCurrentParallelParts) && renderLineInspector(),

				false && hasCurrentParallelParts && react.createElement('div', { style: s.parallelPartRow },
					[
							{ id: 'full', label: I18n.t('syncCreator.allLine') || 'Full line', count: currentFullLineChars.length },
							...currentParallelParts.map(part => ({
								id: part.id,
								label: `${part.speaker || (part.role === 'background' ? 'B' : 'A')} ${getSyncCreatorKindLabel(part.kind) || (I18n.t('syncCreator.kindVocal') || 'No effect')}`,
								count: countRangeChars(part.ranges)
							}))
					].map(part => react.createElement('button', {
						key: part.id,
						type: 'button',
						style: {
							...s.parallelPartBtn,
							...(activeParallelPartId === part.id ? s.parallelPartBtnActive : null)
						},
						onClick: () => {
							setActiveParallelPartId(part.id);
							setRecordingProgressIndex(-1);
							clearRecordingLock();
							charTimesRef.current = [];
							if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
							}
						}, `${part.label} · ${part.count}`))
					),

					false && activeParallelPart && react.createElement('div', { style: s.parallelMetaRow },
						react.createElement('span', { style: s.parallelMetaLabel }, 'Speaker'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: activeParallelPart.speaker || 'A',
							onChange: (e) => updateParallelPartMeta(activeParallelPart.id, 'speaker', e.target.value)
						}, ['A', 'B', 'C', 'D', 'SFX'].map(value =>
							react.createElement('option', { key: value, value }, value)
						)),
						react.createElement('span', { style: s.parallelMetaLabel }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: activeParallelPart.kind || 'vocal',
							onChange: (e) => updateParallelPartMeta(activeParallelPart.id, 'kind', e.target.value)
						}, SYNC_CREATOR_KIND_OPTIONS.map(([value, labelKey]) =>
							react.createElement('option', { key: value, value }, I18n.t(labelKey) || value)
						))
					),

					false && !activeParallelPart && react.createElement('div', { style: s.parallelMetaRow },
						react.createElement('span', { style: s.parallelMetaLabel }, 'Speaker'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: currentLineMeta.speaker || 'A',
							onChange: (e) => updateCurrentLineMeta('speaker', e.target.value)
						}, ['A', 'B', 'C', 'D', 'SFX'].map(value =>
							react.createElement('option', { key: value, value }, value)
						)),
						react.createElement('span', { style: s.parallelMetaLabel }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: currentLineMeta.kind || 'vocal',
							onChange: (e) => updateCurrentLineMeta('kind', e.target.value)
						}, SYNC_CREATOR_KIND_OPTIONS.map(([value, labelKey]) =>
							react.createElement('option', { key: value, value }, I18n.t(labelKey) || value)
						))
					),

				// Lyrics Box
				react.createElement('div', {
					style: hasCurrentParallelParts
						? { ...s.lyricsBox, ...s.lyricsBoxParallelScrollable }
						: s.lyricsBox,
					onMouseDown: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
					onTouchStart: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
					ref: lyricsScrollRef
				},
					hasCurrentParallelParts
						? react.createElement('div', { style: s.parallelStack },
							currentParallelParts.map((part, index) => renderParallelPartLine(part, index))
						)
						: react.createElement('div', { style: useCurrentLineTextRun ? { ...s.rtlLyricsLine, direction: currentLineDirection } : s.lyricsLine },
							renderCurrentLineCharacters()
						)
				),

				// Next Line
				nextNavigableLineIndex >= 0 && react.createElement('div', { style: s.nextLineBox },
					react.createElement('div', { style: s.nextLineLabel }, I18n.t('syncCreator.nextLine')),
					react.createElement('div', {
						style: {
							...s.nextLineText,
							direction: getSyncCreatorTextDirection(lyricsLines[nextNavigableLineIndex]),
							unicodeBidi: 'plaintext'
						}
					}, getSyncCreatorFuriganaReact(lyricsLines[nextNavigableLineIndex]))
				),

				mode === 'record' && react.createElement('div', { style: s.hint }, syncGranularityRecordingHint),

				// 키보드 단축키 가이드 (record 모드일 때만 표시)
				mode === 'record' && react.createElement('div', { style: s.shortcutsContainer },
					// 한 글자
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('charForward')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.charForward') || '한 글자')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('charBack')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.charBack') || '한 글자 취소')
					),
					// 한 단어
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('wordForward')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.wordForward') || '한 단어')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('wordBack')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.wordBack') || '한 단어 취소')
					),
					// 음절
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('syllable')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.syllable') || '음절')
					),
					// 드래그
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('drag')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.drag') || '누르고 있으면 드래그')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, I18n.t('syncCreator.shortcuts.rightClick') || '우클릭'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.lockToCharacter') || '해당 글자까지 잠금')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '↑ / ↓'),
						react.createElement('span', { style: s.shortcutDesc }, `${I18n.t('syncCreator.prevLine') || '이전 줄'} / ${I18n.t('syncCreator.nextLineBtn') || '다음 줄'}`)
					),
					// 완료/취소
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Enter'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.finish') || '라인 완료')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '⌫'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.cancel') || '취소')
					),
					// 재생 컨트롤
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Space'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.playPause') || '재생/일시정지')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Z'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.seekBack') || '-3초')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'X'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.seekForward') || '+3초')
					)
				)
			)
		),

		// Progress
		lyricsText && react.createElement('div', { style: s.progressRow },
			`${completedLines} / ${lyricsLines.length} ${I18n.t('syncCreator.linesCompleted')}`,
			react.createElement('span', { style: { opacity: 0.5 } }, '|'),
			`${syncedChars} / ${totalChars} ${I18n.t('syncCreator.chars')}`
		),

		// Controls
		lyricsText && react.createElement('div', { style: s.controls },
			react.createElement('button', { style: s.ctrlBtn, onClick: goToFirstLine, disabled: currentLineIndex <= 0 }, I18n.t('syncCreator.firstLine')),

			// 기록 모드
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'record'
						? 'linear-gradient(135deg, #ff6b6b, #f04452)'
						: TOSS_BLUE,
					color: '#fff',
					boxShadow: mode === 'record'
						? '0 8px 22px rgba(240, 68, 82, 0.24)'
						: `0 8px 22px ${TOSS_BLUE_RING}`
				},
				onClick: () => toggleMode('record')
			}, mode === 'record' ? I18n.t('syncCreator.stopRecord') : I18n.t('syncCreator.recordMode')),

			// 미리보기 모드
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'preview'
						? `linear-gradient(135deg, ${TOSS_BLUE}, ${TOSS_BLUE_DEEP})`
						: 'rgba(255,255,255,0.05)',
					color: mode === 'preview' ? '#fff' : 'var(--spice-text)',
					border: mode === 'preview' ? '1px solid transparent' : `1px solid ${TOSS_BORDER}`,
					boxShadow: mode === 'preview' ? `0 8px 22px ${TOSS_BLUE_RING}` : 'none'
				},
				onClick: () => toggleMode('preview'),
				disabled: !syncData || syncData.lines.length === 0
			}, mode === 'preview' ? I18n.t('syncCreator.stopPreview') : I18n.t('syncCreator.previewMode')),

			// 가사 복사 버튼
			react.createElement('button', { style: s.ctrlBtn, onClick: copyAllLyrics, disabled: !lyricsText },
				I18n.t('syncCreator.copyLyrics') || '가사 복사'
			),

			// 싱크 데이터 내보내기
			react.createElement('button', { style: s.ctrlBtn, onClick: exportSyncData, disabled: !syncData || !syncData.lines || syncData.lines.length === 0 },
				I18n.t('syncCreator.export') || '내보내기'
			),

			// 싱크 데이터 불러오기
			react.createElement('button', { style: s.ctrlBtn, onClick: importSyncData },
				I18n.t('syncCreator.import') || '불러오기'
			),

			// 현재 줄 삭제
			isCurrentLineSynced && react.createElement('button', { style: s.deleteBtn, onClick: deleteCurrentLineSync },
				I18n.t('syncCreator.deleteLine')
			),

			// 초기화
			react.createElement('button', {
				style: s.deleteBtn,
				onClick: resetFromStart,
				title: I18n.t('syncCreator.resetConfirm') || '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.'
			},
				I18n.t('syncCreator.reset')
			)
		),

		pendingMultiVocalDecision && react.createElement('div', { style: s.lrcLibModal },
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '560px' } },
				react.createElement('h3', { style: s.lrcLibTitle }, I18n.t('syncCreator.multiVocalDetectedTitle') || 'Multiple vocals detected'),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.multiVocalDetectedBody') || 'This lyric contains lines with parentheses or separators, so it can be synced as separate vocal parts. Choose how to work on this song.'
				),
				pendingMultiVocalDecision.preview && react.createElement('div', {
					style: s.multiVocalDecisionPreview,
					title: pendingMultiVocalDecision.preview
				}, pendingMultiVocalDecision.preview),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => resolveMultiVocalDecision(false)
					}, I18n.t('syncCreator.multiVocalDecisionNormal') || 'Continue in normal mode'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => resolveMultiVocalDecision(true)
					}, I18n.t('syncCreator.multiVocalDecisionMulti') || 'Continue in multiple vocal mode')
				)
			)
		),

		renderBulkCustomSpeakerDialog(),

		// AI character pronunciation token usage modal
	showCharacterPronunciationConsent && react.createElement('div', {
		style: s.lrcLibModal,
		onClick: (e) => {
			if (e.target !== e.currentTarget) return;
			characterPronunciationConsentForceRef.current = false;
			setShowCharacterPronunciationConsent(false);
		}
		},
			react.createElement('div', { style: s.lrcLibContent },
				react.createElement('h3', { style: s.lrcLibTitle },
					I18n.t('syncCreator.characterPronunciationTokenWarningTitle') || 'AI character pronunciation token usage'
				),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.characterPronunciationTokenWarningBody') || 'This feature generates pronunciation aligned to each character for karaoke sync, so it uses more AI tokens than ordinary pronunciation generation.'
				),
				react.createElement('div', {
					style: {
						fontSize: '12px',
						color: '#ffb74d',
						lineHeight: 1.55,
						padding: '12px 14px',
						background: 'rgba(255, 152, 0, 0.08)',
						borderRadius: '10px',
						border: '1px solid rgba(255, 152, 0, 0.28)'
					}
				}, I18n.t('syncCreator.characterPronunciationTokenWarningUsage') || 'Expected usage: about 3-6x more tokens than a normal line-by-line pronunciation request. Actual usage varies by lyrics length, language, and provider retries.'),
				react.createElement('div', { style: s.lrcLibBtnRow },
				react.createElement('button', {
					style: s.lrcLibBtnCancel,
					onClick: () => {
						characterPronunciationConsentForceRef.current = false;
						setShowCharacterPronunciationConsent(false);
					}
					}, I18n.t('syncCreator.characterPronunciationTokenWarningCancel') || I18n.t('cancel') || 'Cancel'),
					react.createElement('button', {
					style: s.lrcLibBtn,
					onClick: () => {
						const forceRegenerate = characterPronunciationConsentForceRef.current;
						characterPronunciationConsentForceRef.current = false;
						setShowCharacterPronunciationConsent(false);
						handleCharacterPronunciationToggle({ skipConsent: true, forceRegenerate });
					}
					}, I18n.t('syncCreator.characterPronunciationTokenWarningConfirm') || 'I understand and generate')
				)
			)
		),

		// LRCLIB 발행 모달
	);
};

window.SyncDataCreator = SyncDataCreator;
