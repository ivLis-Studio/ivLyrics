import {
	countSyncCreatorRangeChars,
	decodeSyncCreatorCompactTiming,
	isFiniteSyncCreatorTime,
	normalizeSyncCreatorGranularity,
	roundSyncCreatorTime,
} from './timingGranularity.mjs';
import {
	hasOrderedSyncCreatorTimes,
	hasReusableSyncCreatorParallelChars,
	preserveSyncCreatorParallelTimingRuns,
} from './parallelTiming.mjs';

const encodeSyncCreatorWorkSnapshot = (expanded, original) => {
	const encodeTarget = (target, previous) => {
		if (!Array.isArray(target?.chars) || target.granularity === 'character') return target;
		const decodedPrevious = decodeSyncCreatorCompactTiming(previous, target.chars.length);
		const unchanged = previous?.chars === undefined && previous?.timing !== undefined
			&& previous.granularity === target.granularity
			&& Array.isArray(decodedPrevious?.chars)
			&& decodedPrevious.chars.length === target.chars.length
			&& target.chars.every((time, index) => time === decodedPrevious.chars[index]);
		const encoded = { ...target };
		delete encoded.chars;
		if (unchanged) {
			encoded.timing = previous.timing;
		} else if (target.granularity === 'line' && target.chars.every(time => time === target.chars[0])) {
			encoded.timing = target.chars[0];
		} else if (target.granularity === 'word') {
			// Recover exact time runs without guessing word boundaries from the
			// current lyrics. Historical compact marks above remain unchanged.
			encoded.timing = target.chars.flatMap((time, index, chars) => (
				index === chars.length - 1 || time !== chars[index + 1] ? [[index, time]] : []
			));
		} else {
			encoded.granularity = 'character';
			encoded.chars = target.chars;
			delete encoded.timing;
		}
		return encoded;
	};
	return { ...expanded, lines: expanded.lines.map((line, index) => {
		const previous = original.lines[index];
		const encoded = encodeTarget(line, previous);
		if (!Array.isArray(line?.parallel?.parts)) return encoded;
		return { ...encoded, parallel: { ...line.parallel, parts: line.parallel.parts.map(part => encodeTarget(
			part, previous?.parallel?.parts?.find(saved => saved.id === part.id)
		)) } };
	}) };
};

function createSyncCreatorSnapshotTools({
	getCodec, defaultKind, defaultSpeaker,
	refreshSyncCreatorLineCharsFromParallel,
	normalizeSyncCreatorKind, normalizeSyncCreatorSpeaker,
	normalizeSyncCreatorSpeakerColor, normalizeSyncCreatorSpeakerFallback,
}) {
	const prepareSyncCreatorWorkSnapshot = (data) => {
		if (data?.version === 6) data = getCodec().decode(data);
		if (!Array.isArray(data?.lines)) return data;
		return { ...data, lines: data.lines.map(line => {
			const expanded = decodeSyncCreatorCompactTiming(line, Number(line.end) - Number(line.start) + 1);
			if (!Array.isArray(line?.parallel?.parts)) return expanded;
			const parallel = {
				...line.parallel,
				parts: line.parallel.parts.map(part => decodeSyncCreatorCompactTiming(part, countSyncCreatorRangeChars(part?.ranges)))
			};
			// A partially rejoined target can contain several valid timing runs.
			// Store them independently rather than moving any sung character time.
			if (!parallel.parts.some(part => hasReusableSyncCreatorParallelChars(part, part)
				&& part.chars.every(time => isFiniteSyncCreatorTime(time) && time >= 0)
				&& !hasOrderedSyncCreatorTimes(part.chars))) {
				return { ...expanded, parallel };
			}
			return refreshSyncCreatorLineCharsFromParallel({
				...expanded, parallel: preserveSyncCreatorParallelTimingRuns(parallel)
			});
		}) };
	};

	const canonicalSyncCreatorSyncLineForUnsubmittedCompare = (line) => {
		const finiteTime = (value) => {
			const numeric = Number(value);
			return Number.isFinite(numeric) ? roundSyncCreatorTime(numeric) : null;
		};
		const canonicalTimes = (target, expectedLength) => {
			const expanded = target?.timing === undefined || Array.isArray(target.chars)
				? target : decodeSyncCreatorCompactTiming(target, expectedLength);
			if (Array.isArray(expanded?.chars)) return expanded.chars.map(finiteTime);
			return expanded?.timing === undefined ? [] : { invalidTiming: expanded.timing };
		};
		const canonicalRanges = (ranges) => (Array.isArray(ranges) ? ranges : []).map(range => [
			Number(range?.start),
			Number(range?.end)
		]);
		return {
			start: Number(line?.start),
			end: Number(line?.end),
			chars: canonicalTimes(line, Number(line?.end) - Number(line?.start) + 1),
			kind: normalizeSyncCreatorKind(line?.kind) || defaultKind,
			speaker: normalizeSyncCreatorSpeaker(line?.speaker) || defaultSpeaker,
			granularity: normalizeSyncCreatorGranularity(line?.granularity),
			unitLayout: line?.unitLayout || null,
			lastCharEnd: line?.lastCharEnd === undefined ? null : finiteTime(line.lastCharEnd),
			speakerColor: normalizeSyncCreatorSpeakerColor(line?.['speaker-color']),
			speakerFallback: normalizeSyncCreatorSpeakerFallback(line?.['speaker-fallback']),
			hiddenRanges: canonicalRanges(line?.hiddenRanges),
			parallelHiddenRanges: canonicalRanges(line?.parallel?.hiddenRanges),
			manualSplitPoints: Array.isArray(line?.parallel?.manualSplitPoints) ? line.parallel.manualSplitPoints : null,
			styleRanges: (Array.isArray(line?.styleRanges) ? line.styleRanges : []).map(range => ([
				Number(range?.start),
				Number(range?.end),
				normalizeSyncCreatorKind(range?.kind) || '',
				normalizeSyncCreatorSpeaker(range?.speaker) || '',
				normalizeSyncCreatorSpeakerColor(range?.['speaker-color']),
				normalizeSyncCreatorSpeakerFallback(range?.['speaker-fallback'])
			])),
			parts: (Array.isArray(line?.parallel?.parts) ? line.parallel.parts : []).map(part => ({
				id: String(part?.id || ''),
				role: String(part?.role || ''),
				ranges: canonicalRanges(part?.ranges),
				join: (Array.isArray(part?.ranges) ? part.ranges.slice(1) : [])
					.map((_, index) => Number(part?.join?.[index] ?? 1)),
				chars: canonicalTimes(part, countSyncCreatorRangeChars(part?.ranges)),
				kind: normalizeSyncCreatorKind(part?.kind) || defaultKind,
				speaker: normalizeSyncCreatorSpeaker(part?.speaker) || defaultSpeaker,
				granularity: normalizeSyncCreatorGranularity(part?.granularity || line?.granularity),
				unitLayout: part?.unitLayout || null,
				lastCharEnd: part?.lastCharEnd === undefined ? null : finiteTime(part.lastCharEnd),
				speakerColor: normalizeSyncCreatorSpeakerColor(part?.['speaker-color']),
				speakerFallback: normalizeSyncCreatorSpeakerFallback(part?.['speaker-fallback'])
			}))
		};
	};
	const areSyncCreatorSyncBodiesEqual = (left, right) => {
		if (left === right) return true;
		if (left?.version === 6 || right?.version === 6) {
			try {
				left = prepareSyncCreatorWorkSnapshot(getCodec().encode(left));
				right = prepareSyncCreatorWorkSnapshot(getCodec().encode(right));
			} catch (_) { return false; }
		}
		const leftLines = Array.isArray(left?.lines) ? left.lines : [];
		const rightLines = Array.isArray(right?.lines) ? right.lines : [];
		if (leftLines.length !== rightLines.length) return false;
		try {
			return leftLines.every((line, index) => line === rightLines[index]
				|| JSON.stringify(canonicalSyncCreatorSyncLineForUnsubmittedCompare(line))
					=== JSON.stringify(canonicalSyncCreatorSyncLineForUnsubmittedCompare(rightLines[index])));
		} catch (error) {
			return false;
		}
	};

	const hasSyncCreatorUnsubmittedChanges = ({ syncData, baseline, timingCleared, materialize, layoutDrafts }) => {
		if (!baseline?.lines?.length) return Boolean(syncData?.lines?.length || timingCleared);
		const lineStarts = new Set();
		for (const draft of layoutDrafts) {
			for (const start of Object.keys(draft)) lineStarts.add(Number(start));
		}
		// Apply explicit layout edits without projecting untouched rows that have
		// automatic vocal suggestions. Submission and export still project the entire song.
		try {
			const effective = lineStarts.size ? materialize(syncData, { lineStarts }) : syncData;
			return !areSyncCreatorSyncBodiesEqual(effective, baseline);
		} catch {
			// The editor can still offer submission validation or a revert.
			return true;
		}
	};

	return { prepareSyncCreatorWorkSnapshot, areSyncCreatorSyncBodiesEqual, hasSyncCreatorUnsubmittedChanges };
}

export {
	createSyncCreatorSnapshotTools,
	encodeSyncCreatorWorkSnapshot,
};
