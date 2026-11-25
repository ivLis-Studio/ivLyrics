import { createRandom } from "./motionMath.mjs";
import { MAX_ECHO_LENGTH, MAX_LINES, VERSION } from "./motionDirectionVocabulary.mjs";
import { graphemeCount, groupShots, heldWordIndex, localMood, singsInto, tempoOf } from "./motionSongAnalysis.mjs";
import {
	EXIT_WEIGHTS, HOLD_WEIGHTS, TILT, UPPER_CHANCE, getTempoAccentWeights, localAccent,
	localEnter, localFx, localLayout, localMotion, localSplit, shotType,
} from "./motionDirectionChoices.mjs";
import { serifBudget } from "./motionDirectionTypography.mjs";
import { refineShots } from "./motionDirectionRefinement.mjs";

// Concrete images from the words first, then decoration for the mood.
const MOTIF_HINTS = Object.freeze([
	["moon", /月|달빛|달님|달이|달을|달에|\bmoon|\bluna\b|\blune\b/i],
	["sun", /太陽|日差し|陽射し|햇살|햇빛|태양|\bsun(?:shine|light|rise|set)?\b|\bsoleil\b/i],
	["star", /星|별빛|별이|별을|별처럼|\bstars?\b|\bétoiles?\b/i],
	["heart", /心|恋|愛|好き|사랑|마음|\blove|\bheart/i],
	["flower", /花|桜|꽃|\bflowers?\b|\bbloom|\broses?\b/i],
	["drop", /涙|泣|雨|눈물|빗물|비가|\btears?\b|\brain|\bcry/i],
	["flame", /火|炎|燃|불꽃|불타|\bfire|\bburn|\bflames?\b/i],
	["snow", /雪|冬|겨울|눈송이|\bsnow|\bwinter/i],
	["bolt", /雷|稲妻|電気|번개|\bthunder|\blightning|\belectric/i],
	["eye", /目|瞳|눈빛|눈동자|\beyes?\b/i],
	["crown", /王|女王|왕관|\bkings?\b|\bqueens?\b|\bcrown/i],
	["note", /歌|音楽|メロディ|노래|멜로디|\bsing|\bsongs?\b|\bmusic|\bmelody/i],
	["leaf", /葉|春|잎|봄|\bleaf|\bleaves|\bspring\b/i],
	["cloud", /雲|空|하늘|구름|\bsky|\bclouds?\b/i],
	["wave", /海|波|바다|파도|\bsea\b|\bocean|\bwaves?\b/i],
	["arrow", /走|行け|달려|\brun\b|\bgo\b|\baway\b/i],
	["spiral", /夢|꿈|\bdreams?\b|\bdizzy/i],
]);
const MOOD_MOTIFS = Object.freeze({
	calm: ["ring", "arc", "dot", "scribble"],
	dreamy: ["sparkle", "halo", "dots", "ring"],
	melancholic: ["arc", "halo", "dot", "scribble"],
	warm: ["sun", "ring", "sparkle", "scribble"],
	playful: ["sparkle", "star", "zigzag", "dots", "heart"],
	energetic: ["burst", "cross", "sparkle", "zigzag", "plus"],
	intense: ["cross", "burst", "frame", "bars", "bolt"],
	dark: ["cross", "frame", "bars", "halo"],
});

const motifsFor = (text, mood, random, count) => {
	const names = [];
	for (const [name, pattern] of MOTIF_HINTS) {
		if (names.length >= 2) break;
		if (pattern.test(text)) names.push(name);
	}
	const pool = [...(MOOD_MOTIFS[mood] || MOOD_MOTIFS.warm)];
	while (names.length < count && pool.length) {
		const name = pool.splice(Math.floor(random() * pool.length), 1)[0];
		if (!names.includes(name)) names.push(name);
	}
	return names;
};

const echoFor = (lines) => {
	let best = null;
	for (const line of lines) {
		for (const word of line.words) {
			const length = graphemeCount(word.text);
			if (length < 1 || length > MAX_ECHO_LENGTH || !/[\p{L}\p{N}]/u.test(word.text)) continue;
			const held = word.end - word.start;
			if (!best || held > best.held) best = { text: word.text, held };
		}
	}
	return best?.text || null;
};

/** A complete direction made without AI, deterministic for the same song. */
export const localDirection = (model, options = {}) => {
	const lines = Array.isArray(model) ? model : [];
	const random = createRandom((Number(options.seed) >>> 0) ^ 0xA5A5A5A5);
	const energy = Array.isArray(options.energy) && options.energy.length === lines.length
		? options.energy
		: lines.map(() => 0.5);
	const tempo = options.tempo?.tempo ? options.tempo : tempoOf(lines, options.pulses);
	const mood = localMood(lines, tempo);
	const accents = getTempoAccentWeights(tempo);
	// Every return of a section gets the look it had the first time.
	const styleByKey = new Map();
	const shots = [];
	const layoutHistory = [];
	const accentHistory = [];
	const groups = groupShots(lines);
	// Its own stream, so the rest of the edit is chosen as before.
	const splitRandom = createRandom((Number(options.seed) >>> 0) ^ 0x2545F491);
	const budget = serifBudget(groups.length, lines.length);
	let serifShots = 0;
	let serifLines = 0;
	groups.forEach((shot, index) => {
		const members = lines.slice(shot.from, shot.to + 1);
		const shotEnergy = members.reduce((sum, _, offset) => sum + energy[shot.from + offset], 0) / members.length;
		const previous = shots[shots.length - 1] || null;
		const gap = index ? members[0].start - lines[shot.from - 1].end : Infinity;
		const enter = localEnter({ ...shot, index }, gap, shotEnergy, previous?.enter, tempo, random);
		const seen = shot.repeated ? styleByKey.get(shot.key) : null;
		if (seen && members.length <= MAX_LINES[seen.layout]) {
			// A returning serif section right after another serif shot keeps only its serif words.
			const back = seen.type === "serif" && previous?.type === "serif" ? { type: "impact", serif: true } : {};
			if ((back.type || seen.type) === "serif") {
				serifShots += 1;
				serifLines += members.length;
			}
			layoutHistory.push(seen.layout);
			accentHistory.push(seen.accent);
			shots.push({ ...seen, ...back, from: shot.from, to: shot.to, enter });
			return;
		}
		const traits = {
			...shot,
			split: localSplit(members, tempo, shotEnergy, splitRandom),
			build: groups[index + 1]?.chorus === true && !shot.chorus,
			voices: members.some((line, offset) => (line.backing || []).some((voice) => voice.role === "duet")
				|| (offset > 0 && singsInto(members[offset - 1], line))),
		};
		const layout = localLayout(members, shotEnergy, traits, layoutHistory, tempo, random);
		const serifRoom = previous?.type !== "serif" && serifShots < budget.shots && serifLines + members.length <= budget.lines;
		const { type, serif } = shotType(mood, tempo, layout, random, serifRoom);
		if (type === "serif") {
			serifShots += 1;
			serifLines += members.length;
		}
		const tilt = TILT[tempo.tempo] * (0.5 + shotEnergy);
		const quiet = tempo.tempo === "slow" || mood === "dreamy" || mood === "melancholic";
		const motifCount = quiet ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 3);
		const style = {
			from: shot.from,
			to: shot.to,
			layout,
			enter,
			fx: localFx(members, shotEnergy, tempo, random),
			accent: localAccent(accents, accentHistory, random),
			exit: localMotion(EXIT_WEIGHTS, tempo, previous?.exit, random, "fade"),
			hold: localMotion(HOLD_WEIGHTS, tempo, previous?.hold, random, "grow"),
			split: traits.split,
			type,
			serif,
			upper: (type === "impact" || type === "flex") && random() < UPPER_CHANCE[tempo.tempo],
			bars: ["hero", "wall", "crawl", "swell", "pillar"].includes(layout) && random() < (quiet ? 0.45 : 0.2),
			rule: (quiet || serif) && ["column", "hero", "tower", "stairs"].includes(layout) && random() < 0.5,
			dutch: Math.round((random() * 2 - 1) * tilt),
			motifs: motifsFor(members.map((line) => line.text + " " + (line.translation || "")).join(" "), mood, random, motifCount),
			echo: ["wall", "hero", "column", "tunnel", "tower", "stairs", "split", "swell", "carousel", "slot", "poster", "spread", "pillar"].includes(layout) && random() < 0.65 ? echoFor(members) : null,
			source: "local",
		};
		layoutHistory.push(layout);
		accentHistory.push(style.accent);
		styleByKey.set(shot.key, styleByKey.get(shot.key) || style);
		shots.push(style);
	});
	const lineDirections = {};
	lines.forEach((line, index) => {
		const held = heldWordIndex(line);
		if (held >= 0) lineDirections[index] = { emph: [held] };
	});
	// Every shot shows its accent: one without a held word emphasises its longest-sung word.
	for (const shot of shots) {
		let best = null;
		let marked = false;
		for (let index = shot.from; index <= shot.to && !marked; index += 1) {
			marked = !!lineDirections[index];
			lines[index].words.forEach((word, position) => {
				if (graphemeCount(word.text) < 2 || !/[\p{L}\p{N}]/u.test(word.text)) return;
				const sung = word.end - word.start;
				if (!best || sung > best.sung) best = { index, position, sung };
			});
		}
		if (!marked && best) lineDirections[best.index] = { emph: [best.position] };
	}
	const refined = refineShots(shots, lineDirections, lines, { ...options, tempo, energy, mood });
	return { version: VERSION, source: "local", coverage: 0, mood, tempo, palette: null, shots: refined.shots, lines: refined.lines, shapes: {} };
};
