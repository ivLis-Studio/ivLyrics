import { clamp } from "./motionMath.mjs";

const normalizePreset = (value, presets, fallback) => (
	typeof value === "string" && Object.hasOwn(presets, value) ? value : fallback
);

const MOODS = Object.freeze({
	calm: { shake: 0.55, punch: 0.6 },
	dreamy: { shake: 0.5, punch: 0.5 },
	melancholic: { shake: 0.5, punch: 0.55 },
	warm: { shake: 0.8, punch: 0.9 },
	playful: { shake: 1, punch: 1 },
	energetic: { shake: 1.15, punch: 1.25 },
	intense: { shake: 1.35, punch: 1.45 },
	dark: { shake: 0.9, punch: 1.1 },
});
// How the song's tempo scales the camera: drift while a line is held, handheld shake, motif spin.
export const TEMPO_FEEL = Object.freeze({
	slow: { drift: 1.7, shake: 0.55, sway: 1.6, spin: 0.5, swing: 0.55 },
	mid: { drift: 1, shake: 1, sway: 1, spin: 1, swing: 1 },
	fast: { drift: 0.8, shake: 1.2, sway: 0.7, spin: 1.3, swing: 1.15 },
	rap: { drift: 0.7, shake: 1.35, sway: 0.6, spin: 1.4, swing: 1.2 },
});
export const normalizeMotionMood = (value) => normalizePreset(value, MOODS, "warm");
export const normalizeMotionTempo = (value) => normalizePreset(value, TEMPO_FEEL, "mid");
export const cameraMoodOf = (plan) => MOODS[normalizeMotionMood(plan?.mood)];
export const cameraFeelOf = (plan) => plan?.feel || TEMPO_FEEL[normalizeMotionTempo(plan?.tempo)];

// intensity: calm, normal or wild (how far the camera swings, drifts and shakes);
// rotation: full, gentle (no quarter turns, flips or barrel rolls) or off (the screen
// and the picture never turn); safe: nothing that flashes or flickers (photosensitivity).
const INTENSITY = Object.freeze({
	calm: { swing: 0.55, drift: 0.7, shake: 0.45, sway: 0.7, spin: 0.7, dutch: 0.5 },
	normal: { swing: 1, drift: 1, shake: 1, sway: 1, spin: 1, dutch: 1 },
	wild: { swing: 1.3, drift: 1.25, shake: 1.35, sway: 1.2, spin: 1.3, dutch: 1.4 },
});
export const TURNS = Object.freeze({ full: 1, gentle: 0.4, off: 0 });
/** The viewer's comfort settings, checked. */
export const comfortOf = (value) => ({
	intensity: normalizePreset(value?.intensity, INTENSITY, "normal"),
	rotation: normalizePreset(value?.rotation, TURNS, "full"),
	safe: value?.safe === true,
});
// Compositions that turn lines (and the screen) a quarter or more, and what stands in for them (holding as many lines).
const TURNING_LAYOUTS = Object.freeze({ zigzag: "stairs", spiral: "column", radial: "column", chain: "stairs", arch: "lockup", margin: "column", pillar: "column", collage: "stairs" });
// Entrances that turn the screen, and the moves that stand in for them.
const TURNING_ENTERS = Object.freeze({ roll: "pan", twist: "drift", flip: "drop", spin: "whip", corkscrew: "push", tumble: "drop" });
// Without any turning the camera does not swing round either, and lines do not rock.
const SWINGING_ENTERS = Object.freeze({ orbit: "push", swoop: "drift" });
const ROCKING_HOLDS = Object.freeze({ lean: "drift", wobble: "float", swivel: "grow" });
// What flashes or flickers, and its calm stand-in.
const FLASHING_FX = Object.freeze({ glitch: "wipe", flicker: "lift" });
const FLASHING_EXITS = Object.freeze({ glitch: "fade", scramble: "dissolve" });
const FLASHING_ENTERS = Object.freeze({ panel: "fade" });
// Words that smash in, kept for songs with drive unless the viewer wants it calm.
const SMASHING_FX = Object.freeze({ slam: "lift", zoom: "blur" });

/** The direction as the viewer's comfort allows it (shots and line effects). */
export const comfortDirection = (direction, comfort) => {
	if (!direction || (comfort.intensity === "normal" && comfort.rotation === "full" && !comfort.safe)) return direction;
	const scale = INTENSITY[comfort.intensity];
	const fx = (name) => (comfort.safe && FLASHING_FX[name]) || (comfort.intensity === "calm" && SMASHING_FX[name]) || name;
	const shots = (Array.isArray(direction.shots) ? direction.shots : []).map((shot) => {
		const next = { ...shot, fx: fx(shot.fx) };
		let dutch = (Number(shot.dutch) || 0) * scale.dutch;
		if (comfort.rotation !== "full") {
			next.layout = TURNING_LAYOUTS[next.layout] || (comfort.rotation === "off" && next.layout === "wave" ? "column" : next.layout);
			next.enter = TURNING_ENTERS[next.enter] || (comfort.rotation === "off" && SWINGING_ENTERS[next.enter]) || next.enter;
			if (comfort.rotation === "off") next.hold = ROCKING_HOLDS[next.hold] || next.hold;
			dutch = comfort.rotation === "off" ? 0 : clamp(dutch, -4, 4);
		}
		next.dutch = Math.round(clamp(dutch, -14, 14));
		if (comfort.safe) {
			next.exit = FLASHING_EXITS[next.exit] || next.exit;
			next.enter = FLASHING_ENTERS[next.enter] || next.enter;
		}
		return next;
	});
	const lines = {};
	for (const [key, entry] of Object.entries(direction.lines || {})) lines[key] = entry?.fx ? { ...entry, fx: fx(entry.fx) } : entry;
	return { ...direction, shots, lines };
};
/** How the tempo and the viewer's intensity scale the camera (TEMPO_FEEL), and how far it may turn. */
export const feelFor = (tempo, comfort) => {
	const base = TEMPO_FEEL[normalizeMotionTempo(tempo)];
	const { intensity, rotation } = comfortOf(comfort);
	const scale = INTENSITY[intensity];
	return {
		drift: base.drift * scale.drift,
		shake: base.shake * scale.shake,
		sway: base.sway * scale.sway,
		spin: base.spin * scale.spin,
		swing: base.swing * scale.swing,
		turn: TURNS[rotation],
	};
};
