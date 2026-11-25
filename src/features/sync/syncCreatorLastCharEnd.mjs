import { areSyncCreatorParallelRangesEqual } from './parallelTiming.mjs';
import {
	countSyncCreatorRangeChars, decodeSyncCreatorCompactTiming, isFiniteSyncCreatorTime, roundSyncCreatorTime,
} from './timingGranularity.mjs';
import { SYNC_CREATOR_MAX_LAST_CHAR_HOLD_SEC } from './timingValidation.mjs';

const matchesPart = (candidate, part) =>
	candidate.id === part.id && areSyncCreatorParallelRangesEqual(candidate.ranges, part.ranges);

export function createSyncCreatorLastCharEnd({
	currentExistingLineData, currentLineStart, activeParallelPart, getSyncCreatorRejoinedLineChars,
	claimSessionForLocalEditing, setSyncData, toast: Toast, i18n: I18n,
}) {
	// Held end of the current target's last character (lastCharEnd): a final note
	// that lasts longer than the natural last-character duration.
	const getCurrentLastCharEndInfo = () => {
		const line = currentExistingLineData;
		if (!line) return null;
		const target = activeParallelPart
			? line.parallel?.parts?.find(part => matchesPart(part, activeParallelPart))
			: line;
		if (!target) return null;
		const times = activeParallelPart
			? decodeSyncCreatorCompactTiming(target, countSyncCreatorRangeChars(target.ranges))?.chars
			: getSyncCreatorRejoinedLineChars(decodeSyncCreatorCompactTiming(line, Number(line.end) - Number(line.start) + 1));
		const lastTime = Array.isArray(times) ? times[times.length - 1] : null;
		if (!isFiniteSyncCreatorTime(lastTime)) return null;
		return { lastTime, value: isFiniteSyncCreatorTime(target.lastCharEnd) ? target.lastCharEnd : null };
	};
	const setCurrentLastCharEnd = (nextValue) => {
		const info = getCurrentLastCharEndInfo();
		if (!info) return;
		if (nextValue !== null && (!isFiniteSyncCreatorTime(nextValue) || nextValue <= info.lastTime
			|| nextValue > info.lastTime + SYNC_CREATOR_MAX_LAST_CHAR_HOLD_SEC)) {
			Toast.error(I18n.t('syncCreator.lastCharEnd.invalid'));
			return;
		}
		claimSessionForLocalEditing();
		const lineStart = currentLineStart;
		const part = activeParallelPart;
		const apply = (target) => {
			const next = { ...target };
			if (nextValue === null) delete next.lastCharEnd;
			else next.lastCharEnd = roundSyncCreatorTime(nextValue);
			return next;
		};
		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => {
					if (line.start !== lineStart) return line;
					if (!part) return apply(line);
					if (!Array.isArray(line.parallel?.parts)) return line;
					return {
						...line,
						parallel: {
							...line.parallel,
							parts: line.parallel.parts.map(item => (
								matchesPart(item, part) ? apply(item) : item
							))
						}
					};
				})
			};
		});
	};
	return { getCurrentLastCharEndInfo, setCurrentLastCharEnd };
}
