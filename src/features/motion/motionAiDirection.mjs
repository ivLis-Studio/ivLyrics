import { clamp } from "./motionMath.mjs";
import { motionShapes } from "./MotionLyricsShapes.mjs";
import { hexColor } from "./motionPalette.mjs";
import {
	ACCENTS, ENTERS, EXITS, FX, HOLDS, INTERLUDES, LAYOUTS, MAX_ECHO_LENGTH, MAX_LINES,
	MAX_SHOT_MOTIFS, MAX_SHOT_MS, MOODS, REST_GAP_MS, SPLITS, TYPES, VERSION,
} from "./motionDirectionVocabulary.mjs";
import { graphemeCount, screenSpan, singsInto, squash } from "./motionSongAnalysis.mjs";
import { localDirection } from "./motionLocalDirection.mjs";
import { limitSerif } from "./motionDirectionTypography.mjs";
import { refineShots } from "./motionDirectionRefinement.mjs";

const toIndex = (value) => {
	const number = Number(value);
	return Number.isInteger(number) ? number : NaN;
};

/**
 * Moves cuts off lines sung into each other (shots in order, covering
 * every line): the next lines join the shot while it has room, otherwise
 * its last lines go over to the next shot (which is split again later, at
 * a cut between lines that are not sung into each other). A shot left
 * empty goes.
 */
const keepVoicesTogether = (shots, lines) => {
	const result = shots.map((shot) => ({ ...shot }));
	const room = (shot) => (MAX_LINES[shot.layout] || 6) - (shot.to - shot.from + 1);
	for (let index = 0; index + 1 < result.length; index += 1) {
		const before = result[index];
		let after = result[index + 1];
		while (after && room(before) > 0 && singsInto(lines[before.to], lines[after.from])) {
			before.to += 1;
			after.from += 1;
			if (after.from > after.to) {
				result.splice(index + 1, 1);
				after = result[index + 1];
			}
		}
		while (after && before.to > before.from && singsInto(lines[before.to], lines[after.from])) {
			before.to -= 1;
			after.from -= 1;
		}
	}
	return result;
};
/**
 * The kit an AI answer built its edit on: the choices it named in "kit"
 * and the ones its shots used, each checked against the vocabulary.
 */
const kitOf = (raw) => {
	const named = raw?.kit && typeof raw.kit === "object" ? raw.kit : {};
	const kit = {};
	for (const [kind, key, names] of [["layout", "layouts", LAYOUTS], ["enter", "enters", ENTERS], ["fx", "fx", FX], ["accent", "accents", ACCENTS], ["exit", "exits", EXITS], ["hold", "holds", HOLDS]]) {
		const set = new Set();
		for (const name of Array.isArray(named[key]) ? named[key] : []) if (names.includes(name)) set.add(name);
		for (const shot of Array.isArray(raw?.shots) ? raw.shots : []) if (names.includes(shot?.[kind])) set.add(shot[kind]);
		kit[kind] = set;
	}
	return kit;
};

/**
 * A complete direction from an AI answer. Shots must be in order and may
 * not overlap; lines no AI shot covers get the local director's shots.
 */
export const normalizeDirection = (raw, model, options = {}) => {
	const lines = Array.isArray(model) ? model : [];
	const local = localDirection(lines, options);
	if (!raw || typeof raw !== "object" || Array.isArray(raw) || !lines.length) return local;
	const count = lines.length;
	const custom = motionShapes?.sanitizeShapes?.(raw.shapes) || {};
	const knownMotif = (name) => !!custom[name] || motionShapes?.NAMES?.includes(name);
	const localShotAt = (index) => local.shots.find((shot) => shot.from <= index && index <= shot.to);

	const aiShots = [];
	let lastTo = -1;
	for (const item of (Array.isArray(raw.shots) ? raw.shots : []).slice(0, 120)) {
		if (!item || typeof item !== "object") continue;
		let from = toIndex(item.from ?? item.lines?.[0]);
		let to = toIndex(item.to ?? item.lines?.[1] ?? item.from);
		if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
		from = Math.max(from, lastTo + 1);
		to = Math.min(to, count - 1);
		if (from > to || from >= count) continue;
		const fallback = localShotAt(from);
		const layout = LAYOUTS.includes(item.layout) ? item.layout : fallback.layout;
		const motifs = (Array.isArray(item.motifs) ? item.motifs : [])
			.map((name) => String(name ?? "").trim().toLowerCase())
			.filter((name, index, list) => knownMotif(name) && list.indexOf(name) === index)
			.slice(0, MAX_SHOT_MOTIFS);
		const shotText = squash(lines.slice(from, to + 1).map((line) => line.text).join(""));
		const echoText = typeof item.echo === "string" ? item.echo.trim() : "";
		const echo = echoText && graphemeCount(echoText) <= MAX_ECHO_LENGTH && shotText.includes(squash(echoText)) ? echoText : null;
		const dutch = Number(item.dutch);
		const flag = (value, fallbackValue) => (typeof value === "boolean" ? value : fallbackValue);
		// Thin type no longer exists (it read badly over video): older answers asking for it get the heavy face.
		const type = TYPES.includes(item.type) ? item.type : item.type === "thin" ? "impact" : fallback.type;
		aiShots.push({
			from,
			to,
			layout,
			enter: ENTERS.includes(item.enter) ? item.enter : fallback.enter,
			fx: FX.includes(item.fx) ? item.fx : fallback.fx,
			accent: ACCENTS.includes(item.accent) ? item.accent : fallback.accent,
			exit: EXITS.includes(item.exit) ? item.exit : fallback.exit,
			hold: HOLDS.includes(item.hold) ? item.hold : fallback.hold,
			split: SPLITS.includes(item.split) ? item.split : fallback.split,
			interlude: INTERLUDES.includes(item.interlude) ? item.interlude : null,
			type,
			serif: flag(item.serif, item.type === "serif"),
			upper: flag(item.upper, false),
			bars: flag(item.bars, false),
			rule: flag(item.rule, false),
			dutch: Number.isFinite(dutch) ? Math.round(clamp(dutch, -12, 12)) : fallback.dutch,
			motifs: Array.isArray(item.motifs) ? motifs : fallback.motifs,
			echo,
			source: "ai",
			// The look the AI gave the shot itself (not what was filled in for it): shots in a row with one look run on.
			look: [item.layout, item.fx, item.accent, item.exit].every((value) => typeof value === "string" && value)
				? [layout, item.fx, item.accent, item.exit, item.type || ""].join("|") : "",
		});
		lastTo = to;
	}
	// Shots in a row that the AI gave one look (a chorus set line by line, the same composition, effect, accent
	// and exit) are one composition running on: they are merged as far as it holds lines and keeps them on screen
	// (not across an interlude), so the look is not broken up by the rule that no composition follows itself.
	const runs = [];
	for (const shot of aiShots) {
		const before = runs[runs.length - 1];
		const alike = !!before && before.to + 1 === shot.from && !!shot.look && shot.look === before.look;
		if (alike && shot.to - before.from + 1 <= (MAX_LINES[before.layout] || 6)
			&& lines[shot.from].start - lines[before.to].end < REST_GAP_MS && screenSpan(lines, before.from, shot.to) <= MAX_SHOT_MS) {
			before.to = shot.to;
			before.motifs = [...new Set([...before.motifs, ...shot.motifs])].slice(0, MAX_SHOT_MOTIFS);
			before.echo = before.echo || shot.echo;
			before.interlude = shot.interlude || before.interlude;
			continue;
		}
		runs.push(shot);
	}
	aiShots.splice(0, aiShots.length, ...runs);
	// Ones that cannot be merged (their lines would stay on screen too long) run on as the same composition.
	aiShots.forEach((shot, index) => {
		const before = aiShots[index - 1];
		if (!before || before.to + 1 !== shot.from || !shot.look || shot.look !== before.look) return;
		shot.continued = true;
		shot.type = before.type;
		shot.split = before.split;
	});

	// Fill what the AI left out with the local shots, clipped to the gaps.
	const filled = [];
	let cursor = 0;
	const pushLocal = (from, to) => {
		for (const shot of local.shots) {
			const start = Math.max(from, shot.from);
			const end = Math.min(to, shot.to);
			if (start <= end) filled.push({ ...shot, from: start, to: end, layout: end - start + 1 > MAX_LINES[shot.layout] ? "column" : shot.layout });
		}
	};
	for (const shot of aiShots) {
		if (shot.from > cursor) pushLocal(cursor, shot.from - 1);
		filled.push(shot);
		cursor = shot.to + 1;
	}
	if (cursor < count) pushLocal(cursor, count - 1);

	// A cut between lines sung into each other would hide the voice still
	// singing: the line moves to the shot that has room for it.
	const joined = keepVoicesTogether(filled, lines);

	// Long shots are split into compositions the layout can hold and that leave the screen within
	// MAX_SHOT_MS, away from voices sung into the next line.
	const split = [];
	for (const shot of joined) {
		const limit = MAX_LINES[shot.layout] || 6;
		for (let from = shot.from; from <= shot.to;) {
			let to = Math.min(shot.to, from + limit - 1);
			while (to > from && screenSpan(lines, from, to) > MAX_SHOT_MS) to -= 1;
			for (let end = to; to < shot.to && end > from; end -= 1) {
				if (!singsInto(lines[end], lines[end + 1])) {
					to = end;
					break;
				}
			}
			split.push({ ...shot, from, to, enter: from === shot.from ? shot.enter : "pan", continued: from !== shot.from || shot.continued === true });
			from = to + 1;
		}
	}
	// However the AI asked, serif shots stay rare.
	const shots = limitSerif(split);
	if (shots.length && shots[0].enter === "cut") shots[0].enter = "push";

	const covered = new Set();
	for (const shot of shots) {
		if (shot.source !== "ai") continue;
		for (let index = shot.from; index <= shot.to; index += 1) covered.add(index);
	}
	const lineDirections = {};
	for (const [key, value] of Object.entries(local.lines)) {
		if (!covered.has(Number(key))) lineDirections[key] = value;
	}
	for (const item of (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 400)) {
		const index = toIndex(item?.n ?? item?.line ?? item?.index);
		if (!Number.isInteger(index) || index < 0 || index >= count) continue;
		const words = lines[index].words.length;
		const emph = (Array.isArray(item.emph) ? item.emph : [])
			.map(toIndex)
			.filter((value, position, list) => Number.isInteger(value) && value >= 0 && value < words && list.indexOf(value) === position)
			.slice(0, 2);
		const entry = {};
		if (emph.length) entry.emph = emph;
		if (FX.includes(item.fx)) entry.fx = item.fx;
		if (Object.keys(entry).length) lineDirections[index] = entry;
	}

	const palette = (Array.isArray(raw.palette) ? raw.palette : []).map(hexColor).filter(Boolean).slice(0, 3);
	const mood = MOODS.includes(raw.mood) ? raw.mood : local.mood;
	// However the AI chose, hits stay rare and the choices keep moving, within the kit the AI built the edit on.
	const refined = refineShots(shots, lineDirections, lines, { ...options, tempo: local.tempo, mood, kit: covered.size ? kitOf(raw) : null });
	return {
		version: VERSION,
		source: covered.size ? "ai" : "local",
		coverage: covered.size / count,
		mood,
		concept: typeof raw.concept === "string" ? raw.concept.slice(0, 200) : "",
		// Tempo is measured, never taken from the AI.
		tempo: local.tempo,
		palette: palette.length ? palette : null,
		shots: refined.shots,
		lines: refined.lines,
		shapes: custom,
	};
};
