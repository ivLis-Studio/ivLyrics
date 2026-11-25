// Selection bounds, display state, and edits to the selected character timings.

const normalizeSyncCreatorLockRange = (startIndex, endIndex, charCount) => {
	const count = Number(charCount);
	if (!Number.isFinite(count) || count <= 1) return null;
	const start = Number(startIndex);
	const end = Number(endIndex);
	if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
	if (start === end) {
		const prefixEnd = Math.min(Math.max(start, 0), count - 1);
		if (prefixEnd >= count - 1) return null;
		if (prefixEnd < 0) return null;
		return { start: 0, end: prefixEnd };
	}
	const min = Math.min(start, end);
	const max = Math.max(start, end);
	if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
	const safeStart = Math.max(0, min);
	const safeEnd = Math.min(count - 1, max);
	if (safeStart > safeEnd) return null;
	if (safeStart <= 0 && safeEnd >= count - 1) return null;
	if (min < 0 || max >= count) return null;
	return { start: safeStart, end: safeEnd };
};
const resolveSyncCreatorLockDragRange = (downIndex, upIndex, charCount) => (
	normalizeSyncCreatorLockRange(downIndex, upIndex, charCount)
);
const resolveSyncCreatorOffsetSelectionRange = (downIndex, upIndex, charCount, allowFullLine = false) => {
	const count = Number(charCount);
	if (!Number.isFinite(count) || count <= 0) return null;
	if (!Number.isInteger(downIndex) || !Number.isInteger(upIndex) || downIndex === upIndex) return null;
	const start = Math.max(0, Math.min(downIndex, upIndex));
	const end = Math.min(count - 1, Math.max(downIndex, upIndex));
	if (start > end) return null;
	if (!allowFullLine && start <= 0 && end >= count - 1) return null;
	return { start, end };
};
const getSyncCreatorStyleSelectionRanges = (range, charRefs, lineStart, lineEnd) => {
	if (!range || !Array.isArray(charRefs) || !Number.isInteger(range.start) || !Number.isInteger(range.end)
		|| range.start < 0 || range.end < range.start || range.end >= charRefs.length) return [];
	const indexes = charRefs.slice(range.start, range.end + 1).map(ref => ref?.absoluteIndex);
	if (indexes.some(index => !Number.isInteger(index) || index < lineStart || index > lineEnd)) return [];
	const ranges = [];
	for (const index of [...new Set(indexes)].sort((left, right) => left - right)) {
		const previous = ranges[ranges.length - 1];
		if (previous && index === previous.end + 1) previous.end = index;
		else ranges.push({ start: index, end: index });
	}
	return ranges;
};
const shouldUseSyncCreatorSelectionEffect = ({ mode, offsetSelectionRange } = {}) => {
	if (mode === 'record') return false;
	// A selection is relative to the displayed vocal, including split/grouped
	// parts. The style updater maps its character refs back to source ranges.
	if (!offsetSelectionRange || !Number.isInteger(offsetSelectionRange.start) || !Number.isInteger(offsetSelectionRange.end)) return false;
	if (offsetSelectionRange.start < 0 || offsetSelectionRange.end < offsetSelectionRange.start) return false;
	return true;
};
const resolveSyncCreatorSelectionEffectKind = ({ styleRanges, charRefs, range } = {}) => {
	if (!range || !Array.isArray(charRefs) || !Array.isArray(styleRanges)) return '';
	if (!Number.isInteger(range.start) || !Number.isInteger(range.end)
		|| range.start < 0 || range.end < range.start || range.end >= charRefs.length) return '';
	const kinds = new Set();
	for (let index = range.start; index <= range.end; index++) {
		const absoluteIndex = charRefs[index]?.absoluteIndex;
		if (!Number.isInteger(absoluteIndex)) return '';
		const hit = styleRanges.find(candidate => candidate.start <= absoluteIndex && candidate.end >= absoluteIndex);
		kinds.add(hit ? (hit.kind || '') : '');
	}
	if (kinds.size !== 1) return '';
	return [...kinds][0] || '';
};
const resolveSyncCreatorSelectionSpeaker = ({ styleRanges, charRefs, range } = {}) => {
	if (!range || !Array.isArray(charRefs) || !Array.isArray(styleRanges)) return null;
	if (!Number.isInteger(range.start) || !Number.isInteger(range.end)
		|| range.start < 0 || range.end < range.start || range.end >= charRefs.length) return null;
	const metas = new Set();
	const descs = [];
	for (let index = range.start; index <= range.end; index++) {
		const absoluteIndex = charRefs[index]?.absoluteIndex;
		if (!Number.isInteger(absoluteIndex)) return null;
		const hit = styleRanges.find(candidate => candidate.start <= absoluteIndex && candidate.end >= absoluteIndex);
		const speaker = hit?.speaker || '';
		const key = [speaker, hit?.['speaker-color'] || '', hit?.['speaker-fallback'] || ''].join('|');
		metas.add(key);
		descs.push({ speaker, color: hit?.['speaker-color'] || '', fallback: hit?.['speaker-fallback'] || '' });
	}
	if (metas.size !== 1) return null;
	const first = descs[0];
	if (!first.speaker) return null;
	return { speaker: first.speaker, 'speaker-color': first.color, 'speaker-fallback': first.fallback };
};
const formatSyncCreatorSelectedSubtitle = ({ selectedText, startLabel, endLabel, selectedLabel, maxLength = 24 } = {}) => {
	if (!selectedText) return '';
	const label = selectedLabel || 'Selected';
	const max = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 24;
	let text = String(selectedText);
	if (Array.from(text).length > max) text = `${Array.from(text).slice(0, max).join('')}…`;
	const start = Number(startLabel);
	const end = Number(endLabel);
	const range = Number.isFinite(start) && Number.isFinite(end) ? ` (${start}–${end})` : '';
	return `${label}: “${text}”${range}`;
};
const resolveSyncCreatorPaintCharColor = (rangeColor = '', baseColor = '', lineColor = '') => (
	String(rangeColor || '').trim() || String(baseColor || '').trim() || String(lineColor || '').trim()
);
const isSyncCreatorIndexLocked = (index, range) => {
	if (!range || !Number.isInteger(Number(index))) return false;
	const numericIndex = Number(index);
	return numericIndex >= range.start && numericIndex <= range.end;
};
const buildSyncCreatorLockedCharTimesForRange = (savedChars, range) => {
	const saved = Array.isArray(savedChars) ? savedChars : [];
	const next = new Array(saved.length).fill(null);
	if (!range) return next;
	for (let i = Math.max(0, range.start); i <= Math.min(range.end, saved.length - 1); i++) {
		next[i] = saved[i];
	}
	return next;
};
const getSyncCreatorNextEditableIndex = (index, range, charCount, direction = 1) => {
	const numericIndex = Number(index);
	if (!Number.isInteger(numericIndex)) return -1;
	if (!range) return numericIndex;
	if (numericIndex < range.start || numericIndex > range.end) return numericIndex;
	if (direction >= 0) return range.end + 1;
	return range.start - 1;
};
const clampSyncCreatorTimesToLockRange = (draftTimes, savedChars, range, step) => {
	const normalizedStep = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 0.001;
	const draft = Array.isArray(draftTimes) ? [...draftTimes] : [];
	const saved = Array.isArray(savedChars) ? savedChars : [];
	if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return draft;
	const start = Math.max(0, range.start);
	const end = Math.min(draft.length - 1, range.end);
	if (start > end) return draft;
	// Locked span is restored exactly from saved timing — it never moves.
	for (let i = start; i <= end; i++) {
		if (i < saved.length) draft[i] = saved[i];
	}
	const lockStartTime = Number(draft[start]);
	const lockEndTime = Number(draft[end]);
	// Prefix recordings stop at the locked boundary instead of overlapping it.
	if (Number.isFinite(lockStartTime)) {
		let nextTime = lockStartTime;
		for (let i = start - 1; i >= 0; i--) {
			const value = draft[i];
			if (typeof value !== 'number' || !Number.isFinite(value)) continue;
			const cap = Math.max(0, Math.min(nextTime - normalizedStep, lockStartTime - (start - i) * normalizedStep));
			draft[i] = Math.round(Math.max(0, Math.min(value, cap)) * 1000) / 1000;
			nextTime = draft[i];
		}
	}
	// Suffix recordings continue after the locked boundary.
	if (Number.isFinite(lockEndTime)) {
		let previousTime = lockEndTime;
		for (let i = end + 1; i < draft.length; i++) {
			const value = draft[i];
			if (typeof value !== 'number' || !Number.isFinite(value)) continue;
			const floor = Math.max(previousTime + normalizedStep, lockEndTime + (i - end) * normalizedStep);
			draft[i] = Math.round(Math.max(value, floor) * 1000) / 1000;
			previousTime = draft[i];
		}
	}
	return draft;
};
const shiftSyncCreatorSelectionTimes = (savedChars, selStart, selEnd, deltaSec, step) => {
	const normalizedStep = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 0.001;
	const saved = Array.isArray(savedChars) ? savedChars : [];
	const start = Number(selStart);
	const end = Number(selEnd);
	const delta = Number(deltaSec);
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= saved.length || start > end) {
		return { ok: false, reason: 'range' };
	}
	if (!Number.isFinite(delta)) return { ok: false, reason: 'delta' };
	for (let i = start; i <= end; i++) {
		if (typeof saved[i] !== 'number' || !Number.isFinite(saved[i])) {
			return { ok: false, reason: 'untimed' };
		}
	}
	const selectedMin = Math.min(...saved.slice(start, end + 1));
	// The selection moves as one rigid block: bound the delta once against
	// the track start and both unselected neighbors, then apply it uniformly
	// so internal relative timing never changes.
	let lower = -selectedMin;
	for (let i = start - 1; i >= 0; i--) {
		if (typeof saved[i] === 'number' && Number.isFinite(saved[i])) {
			lower = Math.max(lower, saved[i] + normalizedStep - saved[start]);
			break;
		}
	}
	let upper = Number.POSITIVE_INFINITY;
	for (let i = end + 1; i < saved.length; i++) {
		if (typeof saved[i] === 'number' && Number.isFinite(saved[i])) {
			upper = saved[i] - normalizedStep - saved[end];
			break;
		}
	}
	let boundedDelta;
	if (delta > 0) {
		boundedDelta = Math.min(delta, upper);
		if (boundedDelta < 0) boundedDelta = 0;
	} else {
		boundedDelta = Math.max(delta, lower);
		if (boundedDelta > 0) boundedDelta = 0;
	}
	if (!Number.isFinite(boundedDelta) || Math.abs(boundedDelta) < 0.0005) {
		return { ok: false, reason: 'noop' };
	}
	const appliedDelta = Math.round(boundedDelta * 1000) / 1000;
	const times = [...saved];
	for (let i = start; i <= end; i++) {
		times[i] = Math.round(Math.max(0, saved[i] + appliedDelta) * 1000) / 1000;
	}
	return { ok: true, times };
};
// Moves a held end (lastCharEnd) by however much its last character moved.
const followSyncCreatorLastCharShift = (target, before, after) => {
	const value = target?.lastCharEnd;
	if (typeof value !== 'number' || !Number.isFinite(value) || !Array.isArray(before) || !Array.isArray(after)) return {};
	const delta = after[after.length - 1] - before[before.length - 1];
	return Number.isFinite(delta) && delta !== 0
		? { lastCharEnd: Math.round((value + delta) * 1000) / 1000 }
		: {};
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

export {
	getSyncCreatorLockedPlaybackProgressIndex,
    normalizeSyncCreatorLockRange,
    resolveSyncCreatorLockDragRange,
    resolveSyncCreatorOffsetSelectionRange,
    getSyncCreatorStyleSelectionRanges,
    shouldUseSyncCreatorSelectionEffect,
    resolveSyncCreatorSelectionEffectKind,
    resolveSyncCreatorSelectionSpeaker,
    formatSyncCreatorSelectedSubtitle,
    resolveSyncCreatorPaintCharColor,
    isSyncCreatorIndexLocked,
    buildSyncCreatorLockedCharTimesForRange,
    getSyncCreatorNextEditableIndex,
    clampSyncCreatorTimesToLockRange,
    shiftSyncCreatorSelectionTimes,
    followSyncCreatorLastCharShift,
};
