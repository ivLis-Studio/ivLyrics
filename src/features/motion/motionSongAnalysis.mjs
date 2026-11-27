import { MAX_SHOT_MS, PACE, REST_GAP_MS } from "./motionDirectionVocabulary.mjs";

/** How long lines from..to keep their composition on screen (interludes do not count). */
export const screenSpan = (lines, from, to) => {
	let span = lines[to].end - lines[from].start;
	for (let index = from + 1; index <= to; index += 1) {
		const gap = lines[index].start - lines[index - 1].end;
		if (gap >= REST_GAP_MS) span -= gap;
	}
	return span;
};

// One segmenter serves every count: creating one costs several times more
// than segmenting a word, and directing a song counts its words many times.
let graphemeSegmenter = null;
export const graphemeCount = (text) => {
	const source = String(text ?? "");
	if (typeof Intl?.Segmenter === "function") {
		graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
		let count = 0;
		for (const _ of graphemeSegmenter.segment(source)) count += 1;
		return count;
	}
	return Array.from(source).length;
};
export const squash = (text) => String(text ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");


export const wordsPerSecond = (line) => line.words.length / Math.max(0.4, (line.end - line.start) / 1000);

// Another voice of a line (an echo, an answer, a duet partner) still sung
// this close to the next line's start would be cut off when the camera
// moves on for it.
const VOICE_CROSS_MS = 360;
/**
 * Whether a line is still being sung when the next one comes in: the two
 * overlap (a duet), or another voice in it sings on into the next line.
 * Such lines share a composition that shows several lines at once.
 */
export const singsInto = (line, next) => !!line && !!next && (next.start < line.end - 150
	|| (Array.isArray(line.backing) ? line.backing : []).some((voice) => voice.end > next.start - VOICE_CROSS_MS));
const SYLLABIC_RE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const VOWELS_RE = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœăâđêôơưаеёиоуыэюяαεηιουωάέήίόύώ]+/giu;

/** Roughly how many syllables are sung in a text, in any script. */
export const syllablesOf = (text) => {
	const source = String(text ?? "");
	const syllabic = (source.match(SYLLABIC_RE) || []).length;
	const thai = (source.match(/\p{Script=Thai}/gu) || []).length / 2.2;
	const joined = (source.match(/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}]/gu) || []).length / 2.4;
	const rest = source.replace(SYLLABIC_RE, " ").replace(/[\p{Script=Thai}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}]/gu, " ");
	let vowelGroups = 0;
	for (const word of rest.split(/[^\p{L}]+/u)) {
		if (word) vowelGroups += Math.max(1, (word.match(VOWELS_RE) || []).length);
	}
	return syllabic + thai + joined + vowelGroups;
};

const median = (values) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Beats per minute from the beat times (ms), folded into 70-180. */
const bpmOf = (pulses) => {
	const times = pulses?.times;
	if (!times || times.length < 8) return null;
	const gaps = [];
	for (let index = 1; index < times.length; index += 1) {
		const gap = times[index] - times[index - 1];
		if (gap > 200 && gap < 2000) gaps.push(gap);
	}
	if (gaps.length < 6) return null;
	let bpm = 60000 / median(gaps);
	while (bpm < 70) bpm *= 2;
	while (bpm >= 180) bpm /= 2;
	return Math.round(bpm);
};

/**
 * How fast the song is sung: slow (ballads), mid, fast or rap, from the
 * median syllables per second and, when known, the beat.
 */
export const tempoOf = (model, pulses = null) => {
	const rates = (Array.isArray(model) ? model : [])
		.map((line) => ({ syllables: syllablesOf(line.text), seconds: Math.max(0.4, (line.end - line.start) / 1000) }))
		.filter((entry) => entry.syllables >= 2)
		.map((entry) => entry.syllables / entry.seconds);
	const sps = median(rates);
	const bpm = bpmOf(pulses);
	let tempo = "mid";
	if (sps >= 6.4) tempo = "rap";
	else if (sps >= 4.8 || (bpm && bpm >= 140 && sps >= 3.6)) tempo = "fast";
	else if (sps > 0 && (sps < 3 || (bpm && bpm < 82 && sps < 3.8))) tempo = "slow";
	return { tempo, sps: Math.round(sps * 10) / 10, bpm, pace: PACE[tempo] };
};

/** The song's mood from its tempo and pauses (the AI reads the words instead). */
export const localMood = (model, tempo) => {
	if (!model.length) return "warm";
	const gaps = model.slice(1).map((line, index) => line.start - model[index].end);
	const pausy = gaps.filter((gap) => gap > 2500).length / Math.max(1, gaps.length);
	if (tempo.tempo === "rap") return "intense";
	if (tempo.tempo === "fast") return "energetic";
	if (tempo.tempo === "slow") return pausy > 0.2 ? "dreamy" : "melancholic";
	return pausy > 0.3 ? "calm" : "warm";
};


export const heldWordIndex = (line) => {
	if (line.words.length < 2) return -1;
	const durations = line.words.map((word) => word.end - word.start);
	const sorted = [...durations].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];
	let best = 0;
	durations.forEach((duration, index) => {
		if (duration > durations[best]) best = index;
	});
	return durations[best] >= Math.max(700, median * 1.7) ? best : -1;
};

// Chorus boundaries and line repetitions feed both the edit and its AI prompt.
export const analyzeRepeatStructure = (model) => {
	const firstSeen = new Map();
	const counts = new Map();
	const original = model.map((line, index) => {
		const key = squash(line.text);
		if (!firstSeen.has(key)) firstSeen.set(key, index);
		counts.set(key, (counts.get(key) || 0) + 1);
		return firstSeen.get(key);
	});
	const recurs = model.map((line) => counts.get(squash(line.text)) > 1);
	const section = recurs.map((value, index) => value && (recurs[index - 1] === true || recurs[index + 1] === true));
	return { original, section };
};

/**
 * Shots of consecutive lines (two to four, usually): long pauses and the
 * edges of repeated sections always break; a shorter pause breaks once a
 * shot already holds two lines.
 */
export const groupShots = (model) => {
	const { original, section } = analyzeRepeatStructure(model);
	const repeated = original.map((first, index) => first < index);
	const shots = [];
	const starts = new Set([0]);
	let from = 0;
	let weight = 0;
	model.forEach((line, index) => {
		const lineWeight = line.chars > 26 || line.words.length >= 8 ? 1.6 : 1;
		if (index > from) {
			const gap = line.start - model[index - 1].end;
			let sectionBreak = gap >= 3500 || section[index] !== section[index - 1]
				|| (repeated[index] !== repeated[index - 1] && (section[index] || section[index - 1]));
			// A chorus may hold one more line, so it stays one composition.
			let full = weight + lineWeight > (section[index] ? 4.6 : 3.6) || (index - from >= 2 && gap >= 1800)
				|| screenSpan(model, from, index) > MAX_SHOT_MS;
			if (repeated[index] && repeated[index - 1]) {
				// A returning section is cut where it was cut the first time.
				sectionBreak = original[index] !== original[index - 1] + 1;
				full = starts.has(original[index]);
			}
			// Lines sung over each other (a duet, a call and response, an echo running on) stay in one composition.
			if (singsInto(model[index - 1], line) && weight + lineWeight <= 6) {
				sectionBreak = false;
				full = false;
			}
			if (sectionBreak || full) {
				shots.push({ from, to: index - 1, sectionBreak });
				from = index;
				starts.add(index);
				weight = 0;
			}
		}
		weight += lineWeight;
	});
	if (model.length) shots.push({ from, to: model.length - 1 });
	// Mark which shots start a section (used for bigger camera entrances).
	return shots.map((shot, index) => ({
		...shot,
		sectionStart: index === 0 || shots[index - 1].sectionBreak === true,
		repeated: model.slice(shot.from, shot.to + 1).every((_, offset) => repeated[shot.from + offset]),
		chorus: model.slice(shot.from, shot.to + 1).every((_, offset) => section[shot.from + offset]),
		key: squash(model[shot.from].text),
	}));
};
