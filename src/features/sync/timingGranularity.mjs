const countSyncCreatorRangeChars = (ranges) => (Array.isArray(ranges) ? ranges : []).reduce((sum, range) => {
	const start = Number(range?.start);
	const end = Number(range?.end);
	return Number.isInteger(start) && Number.isInteger(end) && end >= start ? sum + end - start + 1 : sum;
}, 0);
const isFiniteSyncCreatorTime = (value) => typeof value === 'number' && Number.isFinite(value);
const roundSyncCreatorTime = (value) => Math.round(value * 1000) / 1000;
const SYNC_CREATOR_GRANULARITIES = new Set(['line', 'word', 'character']);
const SYNC_CREATOR_DEFAULT_GRANULARITY = 'character';
const SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC = 0.001;
const normalizeSyncCreatorGranularity = (value) => (
	SYNC_CREATOR_GRANULARITIES.has(String(value || '').trim().toLowerCase())
		? String(value).trim().toLowerCase()
		: SYNC_CREATOR_DEFAULT_GRANULARITY
);

function createSyncCreatorGranularityTools(getSegmenter) {
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
			const segmenter = getSegmenter();
			if (segmenter?.segmentRanges) {
				wordStarts = segmenter.segmentRanges(text, locale || 'auto')
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

	return { getSyncCreatorWordRanges, getSyncCreatorGranularityRanges, collapseSyncCreatorTimesByGranularity };
}

const decodeSyncCreatorCompactTiming = (target, expectedLength) => {
	if (!target || typeof target !== 'object') return target;
	const granularity = normalizeSyncCreatorGranularity(target.granularity);
	const decoded = { ...target, granularity };
	if (Array.isArray(target.chars)) return decoded;
	const length = Math.max(0, Number(expectedLength) || 0);
	if (length === 0) return decoded;
	let chars = null;
	if (granularity === 'line' && isFiniteSyncCreatorTime(target.timing)) {
		chars = new Array(length).fill(roundSyncCreatorTime(target.timing));
	} else if (granularity === 'word' && Array.isArray(target.timing)) {
		chars = new Array(length).fill(null);
		let start = 0;
		for (const mark of target.timing) {
			if (!Array.isArray(mark) || mark.length !== 2) return decoded;
			const end = Number(mark[0]);
			const time = Number(mark[1]);
			if (!Number.isInteger(end) || end < start || end >= length || !isFiniteSyncCreatorTime(time)) return decoded;
			for (let index = start; index <= end; index++) chars[index] = roundSyncCreatorTime(time);
			start = end + 1;
		}
		if (start !== length) return decoded;
	}
	if (!chars) return decoded;
	decoded.chars = chars;
	delete decoded.timing;
	return decoded;
};

const projectTimedUnits = (source, target, getCodec) => {
	if (!source?.unitLayout) return target;
	const codec = getCodec();
	if (!codec || !Array.isArray(target?.chars)) return target;

	const ranges = value => Array.isArray(value?.ranges) ? value.ranges : [{ start: value?.start, end: value?.end }];
	const flatten = value => ranges(value).flatMap(({ start, end }) => Number.isInteger(start) && Number.isInteger(end)
		? Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index) : []);
	const positions = new Map(flatten(source).map((index, local) => [index, local]));
	return codec.projectUnits(source, target, flatten(target).map(index => positions.get(index)));
};

const normalizeSyncCreatorTimeSequence = (rawChars, granularity = 'character') => {
	const sourceChars = Array.isArray(rawChars) ? rawChars : [];
	const normalizedChars = [];
	const preserveEqualTimestamps = normalizeSyncCreatorGranularity(granularity) !== 'character';
	// Vocal lines may overlap; only enforce ordering inside this timing target.
	let minimumAllowedTime = 0;

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

export {
	SYNC_CREATOR_DEFAULT_GRANULARITY,
	SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC,
	countSyncCreatorRangeChars,
	createSyncCreatorGranularityTools,
	decodeSyncCreatorCompactTiming,
	isFiniteSyncCreatorTime,
	normalizeSyncCreatorGranularity,
	normalizeSyncCreatorTimeSequence,
	projectTimedUnits,
	roundSyncCreatorTime,
};
