import { countSyncCreatorRangeChars, normalizeSyncCreatorGranularity } from "./timingGranularity.mjs";
import { buildSyncDataVocalLine } from "../../lyrics/syncRenderVocalLine.mjs";

function toPreviewMs(value) {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' && value.trim() === '') return null;
	const numeric = Number(value);
	return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 1000) : null;
}

function getNextFiniteTimes(times) {
	const result = new Array(times.length);
	let nextTime;
	for (let index = times.length - 1; index >= 0; index--) {
		result[index] = nextTime;
		if (Number.isFinite(times[index])) nextTime = times[index];
	}
	return result;
}

function getFollowingPreviewLineStarts(timing) {
	const result = new Array(timing.length).fill(null);
	const laterStarts = [];
	// The editor permits unordered timings. Keep the first later row that
	// begins strictly after this one, rather than sorting the source lyrics.
	for (let index = timing.length - 1; index >= 0; index--) {
		const first = timing[index]?.firstMs;
		if (!Number.isFinite(first)) continue;
		while (laterStarts.length > 0 && laterStarts[laterStarts.length - 1] <= first) {
			laterStarts.pop();
		}
		if (laterStarts.length > 0) result[index] = laterStarts[laterStarts.length - 1];
		laterStarts.push(first);
	}
	return result;
}

export function buildSyncCreatorPreviewLines({
	lyricsLines,
	lineCharOffsets,
	syncBody,
	getMergedLineIndexesForStart,
	normalizeSpeaker,
	normalizeKind,
	normalizeStyleRanges,
	defaultSpeaker,
	defaultKind,
}) {
	if (!Array.isArray(lyricsLines) || lyricsLines.length === 0) return [];
	const linesByStart = new Map();
	try {
		for (const line of Array.isArray(syncBody?.lines) ? syncBody.lines : []) {
			const start = Number(line?.start);
			if (Number.isInteger(start)) linesByStart.set(start, line);
		}
	} catch (error) {
		return [];
	}
	const timing = lyricsLines.map((_, index) => {
		const absoluteStart = lineCharOffsets[index];
		const line = Number.isInteger(absoluteStart) ? linesByStart.get(absoluteStart) : null;
		const charTimesMs = Array.isArray(line?.chars) ? line.chars.map(toPreviewMs) : [];
		let firstMs = Infinity;
		let lastStartMs = -Infinity;
		for (const time of charTimesMs) {
			if (!Number.isFinite(time)) continue;
			firstMs = Math.min(firstMs, time);
			lastStartMs = Math.max(lastStartMs, time);
		}
		return { line, charTimesMs, firstMs, lastStartMs };
	});
	const followingStarts = getFollowingPreviewLineStarts(timing);
	const applyInlineStyleToSyllable = (syllable, absoluteIndex, normalizedRanges) => {
		if (!Array.isArray(normalizedRanges) || normalizedRanges.length === 0) return syllable;
		const covering = normalizedRanges.find(range => range.start <= absoluteIndex && range.end >= absoluteIndex);
		if (!covering) return syllable;
		const next = { ...syllable, inlineStyle: true };
		if (covering.kind) next.styleKind = covering.kind;
		if (covering.speaker) next.styleSpeaker = covering.speaker;
		if (covering['speaker-color']) next.styleSpeakerColor = covering['speaker-color'];
		if (covering['speaker-fallback']) next.styleSpeakerFallback = covering['speaker-fallback'];
		return next;
	};
	return lyricsLines.map((lineText, index) => {
		const absoluteStart = lineCharOffsets[index];
		let text = String(lineText || '');
		// Merged lines ("merge with next") are one sync unit outside too:
		// preview the full merged text so every vocal row shows.
		try {
			const mergedIndexes = typeof getMergedLineIndexesForStart === 'function'
				? getMergedLineIndexesForStart(index, linesByStart)
				: [index];
			if (Array.isArray(mergedIndexes) && mergedIndexes.length > 1) {
				text = mergedIndexes.map(mergedIndex => String(lyricsLines[mergedIndex] || '')).join('');
			}
		} catch (error) {
			text = String(lineText || '');
		}
		const { line: syncLine, charTimesMs, firstMs, lastStartMs } = timing[index];
		const speaker = normalizeSpeaker(syncLine?.speaker) || defaultSpeaker;
		const kind = normalizeKind(syncLine?.kind) || defaultKind;
		const untimedLine = () => ({ text, startTime: Infinity, endTime: Infinity, speaker, kind, syllables: [] });
		if (!Number.isFinite(firstMs)) return untimedLine();
		const chars = Array.from(text);
		const nextStartMs = followingStarts[index];
		const tentativeEndMs = Number.isFinite(nextStartMs) && nextStartMs > lastStartMs
			? nextStartMs
			: lastStartMs + 2000;
		// Same natural line ending as the outside converter: the last glyph
		// holds for a bounded duration instead of stretching into the next
		// line, so real gaps stay visible to the interlude system.
		const avgCharDurationMs = Math.max(200, Math.max(0, tentativeEndMs - firstMs) / Math.max(1, charTimesMs.length));
		const lastCharMaxDurationMs = Math.max(500, Math.min(1500, avgCharDurationMs * 2.5));
		const stretchesFullLine = normalizeSyncCreatorGranularity(syncLine?.granularity) === 'line';
		const lineEndMs = stretchesFullLine
			? tentativeEndMs
			: Math.min(tentativeEndMs, lastStartMs + Math.round(lastCharMaxDurationMs));
		const normalizedRanges = normalizeStyleRanges(
			syncLine?.styleRanges,
			Number.isInteger(absoluteStart) ? absoluteStart : 0,
			(Number.isInteger(absoluteStart) ? absoluteStart : 0) + Math.max(0, chars.length - 1)
		);
		const buildCharSyllables = (targetChars, targetTimesMs, targetAbsoluteStart) => {
			const nextTimesMs = getNextFiniteTimes(targetTimesMs);
			const syllables = [];
			for (let charIndex = 0; charIndex < targetChars.length; charIndex++) {
				const charStart = targetTimesMs[charIndex];
				if (!Number.isFinite(charStart)) continue;
				const nextStart = nextTimesMs[charIndex];
				const charEnd = Number.isFinite(nextStart) && nextStart >= charStart
					? nextStart
					: Math.max(charStart, lineEndMs);
				syllables.push(applyInlineStyleToSyllable({
					text: targetChars[charIndex],
					startTime: charStart,
					endTime: charEnd
				}, targetAbsoluteStart + charIndex, normalizedRanges));
			}
			return syllables;
		};
		const parallelParts = Array.isArray(syncLine?.parallel?.parts) ? syncLine.parallel.parts : [];
		if (parallelParts.length > 1) {
			const builtParts = [];
			for (const part of parallelParts) {
				if (!part || !Array.isArray(part.ranges) || !Array.isArray(part.chars)) continue;
				const expectedLength = countSyncCreatorRangeChars(part.ranges);
				if (expectedLength <= 0 || part.chars.length !== expectedLength) continue;
				const partTimesMs = part.chars.map(toPreviewMs);
				const nextPartTimesMs = getNextFiniteTimes(partTimesMs);
				const partStretchesFullLine = normalizeSyncCreatorGranularity(part.granularity || syncLine?.granularity) === 'line';
				const partSyllables = [];
				let partCharPointer = 0;
				let partText = '';
				let validPart = true;
				part.ranges.forEach((range, rangeIndex) => {
					if (!validPart) return;
					if (rangeIndex > 0) {
						const joinMode = Array.isArray(part.join) ? Number(part.join[rangeIndex - 1]) : 1;
						if (joinMode === 1 || joinMode === 2) {
							const gapStart = partSyllables.length > 0
								? partSyllables[partSyllables.length - 1].endTime
								: firstMs;
							const gapEnd = Number.isFinite(partTimesMs[partCharPointer])
								? Math.max(gapStart, partTimesMs[partCharPointer])
								: gapStart;
							partSyllables.push({ text: ' ', startTime: gapStart, endTime: gapEnd });
							partText += ' ';
						}
					}
					const rangeStart = Number(range?.start);
					const rangeEnd = Number(range?.end);
					if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeEnd < rangeStart) {
						validPart = false;
						return;
					}
					for (let absoluteIndex = rangeStart; absoluteIndex <= rangeEnd; absoluteIndex++) {
						const localIndex = absoluteIndex - absoluteStart;
						const char = chars[localIndex] || '';
						const charStart = partTimesMs[partCharPointer];
						if (!Number.isFinite(charStart)) {
							validPart = false;
							return;
						}
						const nextStart = nextPartTimesMs[partCharPointer];
						const naturalPartEnd = partStretchesFullLine
							? lineEndMs
							: Math.min(lineEndMs, charStart + Math.round(lastCharMaxDurationMs));
						const charEnd = Number.isFinite(nextStart) && nextStart >= charStart
							? nextStart
							: Math.max(charStart, naturalPartEnd);
						partText += char;
						partSyllables.push(applyInlineStyleToSyllable({
							text: char,
							startTime: charStart,
							endTime: charEnd
						}, absoluteIndex, normalizedRanges));
						partCharPointer++;
					}
				});
				if (!validPart || partSyllables.length === 0) continue;
				builtParts.push({
					id: part.id || '',
					role: part.role || '',
					speaker: normalizeSpeaker(part.speaker) || speaker,
					'speaker-color': part['speaker-color'] || '',
					'speaker-fallback': part['speaker-fallback'] || '',
					kind: normalizeKind(part.kind) || kind,
					text: partText,
					syllables: partSyllables,
					startTime: Math.min(...partSyllables.map(syllable => syllable.startTime)),
					endTime: Math.max(...partSyllables.map(syllable => syllable.endTime))
				});
			}
			if (builtParts.length > 0) {
				// The preview line is timed by the editor; the vocal fields
				// follow the renderer's rules.
				return buildSyncDataVocalLine({
					text, startTime: firstMs, endTime: lineEndMs,
					speaker: syncLine.speaker, 'speaker-color': syncLine['speaker-color'],
					'speaker-fallback': syncLine['speaker-fallback'], kind: syncLine.kind,
				}, builtParts, { speaker, kind });
			}
			return untimedLine();
		}
		const syllables = buildCharSyllables(chars, charTimesMs, absoluteStart);
		if (syllables.length === 0) return untimedLine();
		return {
			text,
			startTime: firstMs,
			endTime: lineEndMs,
			speaker,
			'speaker-color': syncLine['speaker-color'] || '',
			'speaker-fallback': syncLine['speaker-fallback'] || '',
			kind,
			syllables
		};
	});
}
