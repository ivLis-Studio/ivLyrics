import { createRandom } from "./motionMath.mjs";
import { ACCENTS, ENTERS, EXITS, FX, HARD_ENTERS, HARD_FX, HOLDS, LAYOUTS, PUNCHY_FX } from "./motionDirectionVocabulary.mjs";
import { singsInto, squash, tempoOf } from "./motionSongAnalysis.mjs";
import {
	EXIT_WEIGHTS, HOLD_WEIGHTS, getTempoAccentWeights, localAccent, localEnter,
	localFx, localLayout, localMotion, weightedPick,
} from "./motionDirectionChoices.mjs";

// The largest share of a song's shots one composition, entrance, word effect or accent may take.
const SHARE_LIMIT = Object.freeze({ layout: 0.16, enter: 0.22, fx: 0.2, accent: 0.2 });
// An AI edit built on a kit of its own (a few compositions it keeps coming back to) may lean on each a little more.
const KIT_SHARE_LIMIT = Object.freeze({ layout: 0.22, enter: 0.28, fx: 0.26, accent: 0.3 });
const QUIET_MOODS = new Set(["calm", "dreamy", "melancholic"]);

/**
 * The edit's restraint and range, whoever directed it. Words that smash
 * in (slam, zoom) come only on the loudest shots of songs with drive, a
 * few times a song and never two shots running; snappy entrances and
 * flash cuts are rationed the same way; no composition, entrance, word
 * effect or accent follows itself or takes over the song. Whatever is
 * replaced is picked from the song's own tempo palette, so the mood
 * holds, and a returning section keeps the look it had the first time.
 * Line effects (direction.lines) are held to the same budget.
 */
export const refineShots = (shots, lineDirections, model, options = {}) => {
	const lines = Array.isArray(model) ? model : [];
	const count = shots.length;
	if (!count) return { shots, lines: lineDirections };
	const random = createRandom((Number(options.seed) >>> 0) ^ 0x3C6EF372);
	const tempo = options.tempo?.tempo ? options.tempo : tempoOf(lines, options.pulses);
	const energy = Array.isArray(options.energy) && options.energy.length === lines.length ? options.energy : lines.map(() => 0.5);
	const quiet = tempo.tempo === "slow" || QUIET_MOODS.has(options.mood);
	const accents = getTempoAccentWeights(tempo);
	// The AI's kit (what it said it would use and what it used): replacements come from it first, so the edit keeps its look.
	const kit = options.kit || null;
	// (A kit of one or two choices is no kit: the usual limits hold.)
	const cap = (kind) => Math.max(2, Math.ceil(count * ((kit?.[kind]?.size || 0) >= 3 ? KIT_SHARE_LIMIT : SHARE_LIMIT)[kind]));
	const fromKit = (kind, names, avoid, pick) => {
		const own = kit?.[kind];
		const blocked = avoid || new Set();
		if (own && own.size >= 2) {
			const narrowed = new Set([...blocked, ...names.filter((name) => !own.has(name))]);
			if (names.some((name) => !narrowed.has(name))) {
				const choice = pick(narrowed);
				if (own.has(choice) && !blocked.has(choice)) return choice;
			}
		}
		return pick(blocked);
	};
	const motionFromKit = (kind, weights, previous, fallback) => {
		const own = [...(kit?.[kind] || [])].filter((name) => name !== previous);
		if (own.length) {
			const table = weights[tempo.tempo] || weights.mid || {};
			return weightedPick(random, Object.fromEntries(own.map((name) => [name, table[name] || 0.3]))) || own[0];
		}
		return localMotion(weights, tempo, previous, random, fallback);
	};
	const budget = {
		hard: quiet ? 0 : Math.max(1, Math.floor(count / (tempo.tempo === "mid" ? 12 : 8))),
		punchy: Math.max(1, Math.ceil(count * (quiet ? 0.08 : 0.15))),
		cuts: Math.max(1, Math.floor(count / (quiet ? 10 : 6))),
		stamps: Math.max(1, Math.floor(count / 6)),
	};
	const used = { hard: 0, punchy: 0, cuts: 0, stamps: 0 };
	const counts = { layout: new Map(), enter: new Map(), fx: new Map(), accent: new Map() };
	const tally = (kind, value) => counts[kind].set(value, (counts[kind].get(value) || 0) + 1);
	const full = (kind) => [...counts[kind]].filter(([, times]) => times >= cap(kind)).map(([name]) => name);
	const history = { layout: [], accent: [] };
	const returns = new Map();
	const result = [];
	shots.forEach((original, index) => {
		const { continued, ...shot } = original;
		const previous = result[index - 1] || null;
		const members = lines.slice(shot.from, shot.to + 1);
		const shotEnergy = members.reduce((sum, _, offset) => sum + (energy[shot.from + offset] ?? 0.5), 0) / Math.max(1, members.length);
		if (continued === true && previous) {
			// The rest of a shot too long for its composition carries on as it began, but a hit is not repeated.
			const hit = HARD_FX.includes(previous.fx) || PUNCHY_FX.includes(previous.fx);
			shot.layout = previous.layout;
			shot.fx = hit ? fromKit("fx", FX, new Set([...HARD_FX, ...PUNCHY_FX, ...full("fx")]), (avoid) => localFx(members, shotEnergy, tempo, random, avoid)) : previous.fx;
			shot.accent = previous.accent === "stamp" && used.stamps >= budget.stamps
				? fromKit("accent", ACCENTS, new Set(["stamp", ...full("accent")]), (avoid) => localAccent(accents, history.accent, random, avoid))
				: previous.accent;
			if (shot.accent === "stamp") used.stamps += 1;
			for (const kind of Object.keys(counts)) tally(kind, shot[kind]);
			history.layout.push(shot.layout);
			history.accent.push(shot.accent);
			result.push(shot);
			return;
		}
		const loud = shotEnergy >= 0.62;
		const gap = index && lines[shot.from - 1] ? members[0].start - lines[shot.from - 1].end : Infinity;
		const key = squash(members[0]?.text) + ":" + members.length;
		const first = returns.get(key);
		// A returning section is cut the same way: what the AI repeated is repeated as it was refined.
		const repeats = (kind) => !!first && original[kind] === first.raw[kind];

		if (repeats("layout")) shot.layout = first.final.layout;
		else if ((previous && shot.layout === previous.layout) || (counts.layout.get(shot.layout) || 0) >= cap("layout")) {
			const traits = { chorus: false, repeated: false, build: false, split: shot.split, voices: members.some((line, offset) => (line.backing || []).some((voice) => voice.role === "duet") || (offset > 0 && singsInto(members[offset - 1], line))) };
			const avoid = new Set([...full("layout"), previous?.layout].filter(Boolean));
			shot.layout = fromKit("layout", LAYOUTS, avoid, (blocked) => localLayout(members, shotEnergy, traits, history.layout, tempo, random, blocked));
		}

		const hardFx = HARD_FX.includes(shot.fx);
		const punchyFx = PUNCHY_FX.includes(shot.fx);
		const afterHit = previous && (HARD_FX.includes(previous.fx) || PUNCHY_FX.includes(previous.fx));
		if (repeats("fx") && !(hardFx && (quiet || used.hard >= budget.hard))) shot.fx = first.final.fx;
		else if ((hardFx && (quiet || !loud || used.hard >= budget.hard || afterHit))
			|| (punchyFx && (used.punchy >= budget.punchy || afterHit))
			|| (previous && shot.fx === previous.fx)
			|| (counts.fx.get(shot.fx) || 0) >= cap("fx")) {
			const avoid = new Set([...full("fx"), previous?.fx].filter(Boolean));
			if (quiet || !loud || used.hard >= budget.hard || afterHit) HARD_FX.forEach((name) => avoid.add(name));
			if (used.punchy >= budget.punchy || afterHit) PUNCHY_FX.forEach((name) => avoid.add(name));
			shot.fx = fromKit("fx", FX, avoid, (blocked) => localFx(members, shotEnergy, tempo, random, blocked));
		}
		if (HARD_FX.includes(shot.fx)) used.hard += 1;
		if (PUNCHY_FX.includes(shot.fx)) used.punchy += 1;

		if (index && !repeats("enter")) {
			const cut = HARD_ENTERS.includes(shot.enter);
			const sectionLike = gap >= 1200;
			if ((cut && (!sectionLike || used.cuts >= budget.cuts || HARD_ENTERS.includes(previous?.enter)))
				|| (previous && shot.enter === previous.enter && shot.enter !== "pan")
				|| (counts.enter.get(shot.enter) || 0) >= cap("enter")) {
				const avoid = new Set([...full("enter"), previous?.enter].filter(Boolean));
				if (!sectionLike || used.cuts >= budget.cuts) HARD_ENTERS.forEach((name) => avoid.add(name));
				shot.enter = fromKit("enter", ENTERS, avoid, (blocked) => localEnter({ index, sectionStart: sectionLike }, gap, shotEnergy, previous?.enter, tempo, random, blocked));
			}
		} else if (index) shot.enter = first.final.enter;
		if (index && HARD_ENTERS.includes(shot.enter)) used.cuts += 1;

		if (repeats("accent")) shot.accent = first.final.accent;
		else if ((previous && shot.accent === previous.accent)
			|| (counts.accent.get(shot.accent) || 0) >= cap("accent")
			|| (shot.accent === "stamp" && used.stamps >= budget.stamps)) {
			const avoid = new Set([...full("accent"), previous?.accent].filter(Boolean));
			if (used.stamps >= budget.stamps) avoid.add("stamp");
			shot.accent = fromKit("accent", ACCENTS, avoid, (blocked) => localAccent(accents, history.accent, random, blocked));
		}
		if (shot.accent === "stamp") used.stamps += 1;

		// Exits and holds keep changing too: never the same as the shot before (a returning section aside).
		for (const [kind, weights, names, fallback] of [["exit", EXIT_WEIGHTS, EXITS, "fade"], ["hold", HOLD_WEIGHTS, HOLDS, "grow"]]) {
			if (repeats(kind)) shot[kind] = first.final[kind];
			else if (!names.includes(shot[kind]) || (previous && shot[kind] === previous[kind])) {
				shot[kind] = motionFromKit(kind, weights, previous?.[kind], fallback);
			}
		}

		tally("layout", shot.layout);
		tally("enter", shot.enter);
		tally("fx", shot.fx);
		tally("accent", shot.accent);
		history.layout.push(shot.layout);
		history.accent.push(shot.accent);
		if (!first) returns.set(key, { raw: original, final: shot });
		result.push(shot);
	});

	// Line effects: a line may hit harder than its shot only on a loud line, a few times a song.
	const refinedLines = {};
	const lineBudget = { hard: quiet ? 0 : Math.max(1, Math.floor(lines.length / 16)), punchy: Math.max(1, Math.ceil(lines.length / 10)) };
	const lineUsed = { hard: 0, punchy: 0 };
	for (const [key, entry] of Object.entries(lineDirections || {})) {
		const value = { ...entry };
		const index = Number(key);
		const shot = result.find((item) => item.from <= index && index <= item.to);
		if (HARD_FX.includes(value.fx)) {
			if (lineUsed.hard < lineBudget.hard && (energy[index] ?? 0.5) >= 0.62 && !HARD_FX.includes(shot?.fx)) lineUsed.hard += 1;
			else delete value.fx;
		} else if (PUNCHY_FX.includes(value.fx)) {
			if (lineUsed.punchy < lineBudget.punchy) lineUsed.punchy += 1;
			else delete value.fx;
		}
		if (Object.keys(value).length) refinedLines[key] = value;
	}
	return { shots: result, lines: refinedLines };
};
