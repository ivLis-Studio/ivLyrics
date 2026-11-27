const KARAOKE_BOUNCE_IDLE = { offsetY: 0, scale: 1, glow: 0, active: false };
// Motion uses the source timing units; character fill and scrolling keep their
// own clocks. Cache preparation by the memoized grapheme array, never per frame.
const karaokeMotionProfileCache = new WeakMap();
const smoothKaraokeMotion = (value) => {
	const x = Math.max(0, Math.min(1, value));
	return x * x * (3 - 2 * x);
};
const smoothKaraokeRelease = (value, smoothing) => {
	const x = Math.max(0, Math.min(1, value));
	const cubic = x * x * (3 - 2 * x);
	const quintic = x * x * x * (10 + x * (6 * x - 15));
	return cubic + (quintic - cubic) * smoothing;
};

const createKaraokeMotionProfile = (startTime, endTime, cadence, gap = 0, holdEndTime = endTime) => {
	const calm = smoothKaraokeMotion((cadence - 90) / 230);
	const sustained = smoothKaraokeMotion((holdEndTime - startTime - 700) / 900);
	return {
		startTime,
		endTime: holdEndTime,
		riseDuration: Math.max(1, Math.min(holdEndTime - startTime, 220, 45 + cadence * 0.45)),
		// Stay within the parent's existing 820 ms outgoing-row lifetime.
		releaseDuration: Math.min(700, 110 + 220 * calm + 100 * sustained + Math.min(800, Math.max(0, gap)) * 0.25 * calm),
		amplitude: 1.1 + 3.9 * calm + sustained * 0.6,
		scaleAmount: 0.006 + 0.024 * calm,
		glow: 0.035 + 0.105 * calm + 0.025 * sustained,
		motionSmoothing: smoothKaraokeMotion((Math.min(cadence, holdEndTime - startTime) - 120) / 180),
	};
};

const getKaraokeMotionProfile = (timedChars, startIndex, charCount = 1) => {
	if (!Array.isArray(timedChars) || !timedChars[startIndex]) return null;
	let cached = karaokeMotionProfileCache.get(timedChars);
	if (!cached) {
		const units = [];
		const byChar = new Array(timedChars.length);
		const sourceBounds = new Map();
		timedChars.forEach((charInfo, index) => {
			if (!Number.isFinite(charInfo?.startTime) || !Number.isFinite(charInfo?.endTime)) return;
			const key = charInfo.karaokeUnitIndex ?? index;
			const bounds = sourceBounds.get(key) || { start: Infinity, end: -Infinity, groups: 0 };
			bounds.start = Math.min(bounds.start, charInfo.startTime);
			bounds.end = Math.max(bounds.end, charInfo.endTime);
			sourceBounds.set(key, bounds);
		});
		let current = null;
		timedChars.forEach((charInfo, index) => {
			if (!charInfo || !/\S/u.test(charInfo.char || "")) {
				current = null;
				return;
			}
			const start = charInfo.startTime;
			const end = charInfo.endTime;
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
			const unitKey = charInfo.karaokeUnitIndex ?? index;
			if (!current || current.key !== unitKey) {
				current = { key: unitKey, start, end, count: 0 };
				units.push(current);
				sourceBounds.get(unitKey).groups++;
			}
			current.start = Math.min(current.start, start);
			current.end = Math.max(current.end, end);
			current.count++;
			byChar[index] = current;
		});
		units.forEach((unit) => {
			const source = sourceBounds.get(unit.key);
			// A trailing space belongs to its source syllable's duration. Do not
			// extend separate words when a provider times a whole phrase as one unit.
			if (source.groups === 1) {
				unit.start = source.start;
				unit.end = source.end;
			}
			// Normalize long words without treating every Latin letter as a beat.
			unit.cadence = (unit.end - unit.start) / Math.sqrt(unit.count);
		});
		units.forEach((unit, index) => {
			let sum = 0;
			let count = 0;
			let lastStart = NaN;
			for (let i = Math.max(0, index - 2); i <= Math.min(units.length - 1, index + 2); i++) {
				const neighbor = units[i];
				// Some sources repeat one onset across several text fragments.
				if (neighbor.start === lastStart) continue;
				lastStart = neighbor.start;
				sum += Math.min(600, neighbor.cadence);
				count++;
			}
			unit.localCadence = unit.cadence * 0.75 + (sum / Math.max(1, count)) * 0.25;
			unit.gap = Math.max(0, (units[index + 1]?.start ?? unit.end) - unit.end);
		});
		cached = { byChar, profiles: new Map() };
		karaokeMotionProfileCache.set(timedChars, cached);
	}
	const key = `${startIndex}:${charCount}`;
	if (cached.profiles.has(key)) return cached.profiles.get(key);
	const first = timedChars[startIndex];
	const unit = cached.byChar[startIndex];
	if (!unit) return null;
	const lastIndex = Math.min(timedChars.length - 1, startIndex + Math.max(1, charCount) - 1);
	const start = Number.isFinite(first.karaokeFillStartTime) ? first.karaokeFillStartTime : first.startTime;
	let end = start;
	let cadence = 0;
	let count = 0;
	for (let index = startIndex; index <= lastIndex; index++) {
		const charInfo = timedChars[index];
		if (!charInfo) continue;
		const charEnd = Number.isFinite(charInfo.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo.endTime;
		if (Number.isFinite(charEnd)) end = Math.max(end, charEnd);
		if (cached.byChar[index]) {
			cadence += cached.byChar[index].localCadence;
			count++;
		}
	}
	// Only compact source units sustain their characters together. A provider's
	// whole-line timing must not leave dozens of previously sung glyphs floating.
	const sustain = charCount === 1 && unit.count <= 24
		? smoothKaraokeMotion((unit.end - unit.start - 750) / 650)
			* smoothKaraokeMotion((unit.cadence - 170) / 200)
		: 0;
	const lastUnit = cached.byChar[lastIndex] || unit;
	const wholeUnit = unit === lastUnit && charCount >= unit.count;
	const holdEnd = wholeUnit ? Math.max(end, unit.end) : end + Math.max(0, unit.end - end) * sustain;
	const gap = holdEnd >= lastUnit.end ? lastUnit.gap : 0;
	const profile = createKaraokeMotionProfile(start, end, cadence / Math.max(1, count), gap, holdEnd);
	cached.profiles.set(key, profile);
	return profile;
};

// Shared by the rounded React values and the per-frame live painter.
const getKaraokeBounceStrengths = (position, profile) => {
	// A completed syllable can still settle after the next row takes the scroll
	// anchor. Its own playback window, not global character distance, owns motion.
	let strength;
	let scaleStrength;
	let glowStrength;
	const smoothing = profile.motionSmoothing || 0;
	if (smoothing <= 0) {
		strength = position < profile.endTime
			? smoothKaraokeMotion((position - profile.startTime) / profile.riseDuration)
			: 1 - smoothKaraokeMotion((position - profile.endTime) / profile.releaseDuration);
		scaleStrength = glowStrength = strength;
	} else if (position < profile.endTime) {
		const phase = Math.max(0, Math.min(1, (position - profile.startTime) / profile.riseDuration));
		const phaseSpread = smoothing * phase * (1 - phase);
		strength = smoothKaraokeMotion(phase + phaseSpread * 0.18);
		scaleStrength = smoothKaraokeMotion(phase + phaseSpread * 0.28);
		glowStrength = smoothKaraokeMotion(phase + phaseSpread * 0.08);
	} else {
		const phase = Math.max(0, Math.min(1, (position - profile.endTime) / profile.releaseDuration));
		const phaseSpread = smoothing * phase * (1 - phase) * 0.16;
		strength = 1 - smoothKaraokeRelease(phase, smoothing);
		scaleStrength = 1 - smoothKaraokeRelease(phase + phaseSpread, smoothing);
		glowStrength = 1 - smoothKaraokeRelease(phase - phaseSpread, smoothing);
	}
	return [strength, scaleStrength, glowStrength];
};

// Expressive motion (opt-in "karaoke-motion-style": "expressive"). Each timing
// unit follows keyframe targets through damped springs, so sung words swell,
// lift and glow with a small overshoot. Pending units rest slightly smaller
// (see the is-motion-expressive CSS) and sung units settle at full size.
// Spring state lives outside React, keyed by the line's stable objects (glyph
// info, text-run segment or word data), and only exists while
// a unit is inside its motion window.
const KARAOKE_EXPRESSIVE_MOTION_STYLE = "expressive";
const KARAOKE_EXPRESSIVE_SETTLE_MS = 820;
const KARAOKE_EXPRESSIVE_EMPHASIS_MIN_MS = 1000;
const KARAOKE_EXPRESSIVE_PENDING_SCALE = 0.95;
const KARAOKE_EXPRESSIVE_PENDING_OFFSET_EM = 0.012;
const KARAOKE_EXPRESSIVE_MAX_STEP_SECONDS = 0.25;
// [progress, value] keyframes, eased with smoothstep between points.
const KARAOKE_EXPRESSIVE_CURVES = Object.freeze({
	word: Object.freeze({
		scale: [[0, KARAOKE_EXPRESSIVE_PENDING_SCALE], [0.7, 1.05], [1, 1]],
		offsetY: [[0, KARAOKE_EXPRESSIVE_PENDING_OFFSET_EM], [0.9, -0.03], [1, 0]],
		glow: [[0, 0], [0.15, 0.5], [0.6, 0.5], [1, 0]],
	}),
	// Long held notes swell letter by letter.
	emphasis: Object.freeze({
		scale: [[0, KARAOKE_EXPRESSIVE_PENDING_SCALE], [0.7, 1.14], [1, 1]],
		offsetY: [[0, KARAOKE_EXPRESSIVE_PENDING_OFFSET_EM], [0.9, -0.05], [1, 0]],
		glow: [[0, 0], [0.15, 0.8], [0.6, 0.8], [1, 0]],
	}),
});
// [frequency in Hz, damping ratio]: underdamped for a visible overshoot, yet
// settled well inside KARAOKE_EXPRESSIVE_SETTLE_MS.
const KARAOKE_EXPRESSIVE_SPRINGS = Object.freeze({
	scale: [1.05, 0.62],
	offsetY: [1.5, 0.45],
	glow: [1.2, 0.6],
});
const KARAOKE_EXPRESSIVE_REST_PENDING = Object.freeze({ offsetY: 0, scale: 1, glow: 0, active: false, rest: "pending" });
// A live row's unit inside its motion window: React marks it as moving and
// KaraokeLivePainter writes the spring values.
const KARAOKE_EXPRESSIVE_LIVE_MOVING = Object.freeze({ offsetY: 0, scale: 1, glow: 0, active: true });

const sampleKaraokeExpressiveCurve = (points, progress) => {
	if (progress <= points[0][0]) return points[0][1];
	for (let index = 1; index < points.length; index++) {
		const [endProgress, endValue] = points[index];
		if (progress <= endProgress) {
			const [startProgress, startValue] = points[index - 1];
			const t = (progress - startProgress) / Math.max(1e-6, endProgress - startProgress);
			return startValue + (endValue - startValue) * t * t * (3 - 2 * t);
		}
	}
	return points[points.length - 1][1];
};

// Closed-form step of an underdamped spring, exact for any time step.
const stepKaraokeExpressiveSpring = (spring, goal, seconds, [frequency, damping]) => {
	const omega = 2 * Math.PI * frequency;
	const offset = spring.position - goal;
	const velocity = spring.velocity;
	const decay = Math.exp(-damping * omega * seconds);
	const dampedOmega = omega * Math.sqrt(1 - damping * damping);
	const cosine = Math.cos(dampedOmega * seconds);
	const sine = Math.sin(dampedOmega * seconds);
	spring.position = goal + decay * (offset * cosine + ((velocity + damping * omega * offset) / dampedOmega) * sine);
	spring.velocity = decay * (velocity * cosine - ((damping * omega * velocity + omega * omega * offset) / dampedOmega) * sine);
	return spring.position;
};

const getKaraokeExpressiveNow = () => (
	typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
);

const isKaraokeExpressiveEmphasisUnit = (startTime, endTime) => (
	Number.isFinite(startTime) && Number.isFinite(endTime)
	&& endTime - startTime >= KARAOKE_EXPRESSIVE_EMPHASIS_MIN_MS
);

// Decides what moves for each glyph of a character-timed line. Syllabic
// scripts move per glyph ("char"); a space-delimited word moves as one unit
// ("word", via its word wrapper) unless it is held, or a longer word has enough
// time to move letter by letter ("emphasis"). Hyphens and ASCII periods end a
// motion unit without consuming or changing any glyph. Apostrophes and prolonged
// sound marks stay joined.
const KARAOKE_EXPRESSIVE_GLYPH_SCRIPT_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const KARAOKE_EXPRESSIVE_SEPARATOR_REGEX = /^[.\-\u2010\u2011]+$/u;
const KARAOKE_EXPRESSIVE_EMPHASIS_MAX_LETTERS = 24;
const KARAOKE_EXPRESSIVE_LONG_WORD_MIN_LETTERS = 7;
const KARAOKE_EXPRESSIVE_LONG_WORD_MIN_MS = 600;
const KARAOKE_EXPRESSIVE_MIN_MS_PER_GLYPH = 45;
const KARAOKE_EXPRESSIVE_WORD_LETTER_REGEX = /[\p{L}\p{N}]/u;
const getKaraokeExpressiveUnitRanges = (timedChars, startIndex = 0, charCount = timedChars.length) => {
	const ranges = [];
	let start = startIndex;
	let hasText = false;
	let afterSeparator = false;
	const end = Math.min(timedChars.length, startIndex + charCount);
	const flush = (index) => {
		if (index > start) ranges.push({ startIndex: start, charCount: index - start });
		start = index;
		hasText = false;
		afterSeparator = false;
	};
	for (let index = startIndex; index < end; index++) {
		const char = String(timedChars[index]?.char ?? "");
		if (!char || /^\s+$/u.test(char)) {
			flush(index);
			start = index + 1;
			continue;
		}
		const separator = KARAOKE_EXPRESSIVE_SEPARATOR_REGEX.test(char);
		// Keep repeated/trailing separators with the preceding piece, and a
		// leading separator run with the first piece. Never create empty units.
		if (afterSeparator && !separator && hasText) flush(index);
		if (!separator) hasText = true;
		afterSeparator = separator;
	}
	flush(end);
	return ranges;
};
const getKaraokeExpressiveGlyphWindow = (charInfo) => {
	const startTime = Number.isFinite(charInfo?.karaokeFillStartTime) ? charInfo.karaokeFillStartTime : charInfo?.startTime;
	const endTime = Number.isFinite(charInfo?.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo?.endTime;
	return Number.isFinite(startTime) && Number.isFinite(endTime) ? { startTime, endTime } : null;
};
const getKaraokeExpressiveWordWindow = (timedChars, startIndex, charCount, wordTimed = false) => {
	let start = startIndex;
	let end = Math.min(timedChars.length, startIndex + charCount);
	const wordIndex = timedChars[startIndex]?.karaokeWordIndex;
	if (wordTimed && Number.isInteger(wordIndex)) {
		const sameWord = (charInfo) => charInfo?.karaokeWordIndex === wordIndex
			&& /\S/u.test(String(charInfo?.char ?? ""));
		// Splitting a word-timed source changes motion geometry only. All
		// pieces retain the original word's shared onset/end, even though the
		// glyph pipeline has interpolated character windows for rendering.
		while (start > 0 && sameWord(timedChars[start - 1])) start--;
		while (end < timedChars.length && sameWord(timedChars[end])) end++;
	}
	let startTime = Infinity;
	let endTime = -Infinity;
	for (let index = start; index < end; index++) {
		const glyphWindow = getKaraokeExpressiveGlyphWindow(timedChars[index]);
		if (!glyphWindow) continue;
		startTime = Math.min(startTime, glyphWindow.startTime);
		endTime = Math.max(endTime, glyphWindow.endTime);
	}
	return { startTime, endTime };
};
const classifyKaraokeExpressiveUnits = (timedChars, allowWordMotion = true) => {
	const charModes = new Array(timedChars.length).fill(null);
	const wordStarts = new Set();
	const wordRanges = new Map();
	for (const range of getKaraokeExpressiveUnitRanges(timedChars)) {
		const { startIndex: index, charCount: letterCount } = range;
		const end = index + letterCount;
		const text = timedChars.slice(index, end).map((charInfo) => charInfo.char).join("");
		const { startTime, endTime } = getKaraokeExpressiveWordWindow(timedChars, index, letterCount);
		const duration = Number.isFinite(startTime) && Number.isFinite(endTime) ? endTime - startTime : 0;
		// Punctuation is drawn but is not an extra sung letter. In particular,
		// attaching a separator must not turn a six-letter piece into a long word.
		let sungLetters = 0;
		for (let charIndex = index; charIndex < end; charIndex++) {
			if (KARAOKE_EXPRESSIVE_WORD_LETTER_REGEX.test(String(timedChars[charIndex]?.char ?? ""))) sungLetters++;
		}
		const hasLetterWindow = duration >= letterCount * KARAOKE_EXPRESSIVE_MIN_MS_PER_GLYPH;
		const longerWord = sungLetters >= KARAOKE_EXPRESSIVE_LONG_WORD_MIN_LETTERS
			&& duration >= KARAOKE_EXPRESSIVE_LONG_WORD_MIN_MS;
		const mode = KARAOKE_EXPRESSIVE_GLYPH_SCRIPT_REGEX.test(text)
			? "char"
			: letterCount > 1 && letterCount <= KARAOKE_EXPRESSIVE_EMPHASIS_MAX_LETTERS
				&& hasLetterWindow && (longerWord || isKaraokeExpressiveEmphasisUnit(startTime, endTime))
				? "emphasis"
				: allowWordMotion ? "word" : "char";
		for (let charIndex = index; charIndex < end; charIndex++) charModes[charIndex] = mode;
		if (mode === "word") {
			wordStarts.add(index);
			wordRanges.set(index, range);
		}
	}
	return { charModes, wordStarts, wordRanges };
};

export function createKaraokeMotion({ getVisualSettings, prefersReducedLyricsMotion }) {
	const getKaraokeBounceValues = (position, isActive, startTime, endTime, attenuation = 1, motionProfile = null) => {
		if (!getVisualSettings()["karaoke-bounce"] || !Number.isFinite(position)) return KARAOKE_BOUNCE_IDLE;
		const profile = motionProfile || createKaraokeMotionProfile(startTime, endTime, endTime - startTime);
		if (!Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime)
			|| position < profile.startTime || position >= profile.endTime + profile.releaseDuration
			|| prefersReducedLyricsMotion()) return KARAOKE_BOUNCE_IDLE;
		const [strength, scaleStrength, glowStrength] = getKaraokeBounceStrengths(position, profile);
		const offsetY = Math.round(-profile.amplitude * strength * 4) / 4;
		const scale = Math.round((1 + profile.scaleAmount * scaleStrength) * 500) / 500;
		const glow = getVisualSettings()["karaoke-text-effects"] === false ? 0
			: Math.round(profile.glow * glowStrength * 50) / 50;
		if (offsetY === 0 && scale === 1 && glow === 0) return KARAOKE_BOUNCE_IDLE;
		return { offsetY, scale, glow, active: true };
	};

	const getKaraokeWordBounceValues = (position, isActive, startTime, endTime, attenuation = 1, motionProfile = null) => (
		getKaraokeBounceValues(position, isActive, startTime, endTime, attenuation, motionProfile)
	);

	const getKaraokeLiveBounce = (position, profile) => {
		if (!profile || !getVisualSettings()["karaoke-bounce"] || !Number.isFinite(position)
			|| !Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime)
			|| position < profile.startTime || position >= profile.endTime + profile.releaseDuration
			|| prefersReducedLyricsMotion()) return null;
		const [strength, scaleStrength, glowStrength] = getKaraokeBounceStrengths(position, profile);
		return {
			offsetY: -profile.amplitude * strength,
			scale: 1 + profile.scaleAmount * scaleStrength,
			glow: getVisualSettings()["karaoke-text-effects"] === false ? 0 : profile.glow * glowStrength,
		};
	};

	const karaokeExpressiveMotionStates = new WeakMap();

	const isKaraokeExpressiveMotionEnabled = () => (
		getVisualSettings()?.["karaoke-motion-style"] === KARAOKE_EXPRESSIVE_MOTION_STYLE
		&& getVisualSettings()?.["karaoke-bounce"] !== false
		&& !prefersReducedLyricsMotion()
	);

	const getKaraokeExpressiveMotion = (stateKey, position, startTime, endTime, emphasis = false, now = getKaraokeExpressiveNow()) => {
		if (!isKaraokeExpressiveMotionEnabled() || !stateKey
			|| !Number.isFinite(position) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) {
			if (stateKey) karaokeExpressiveMotionStates.delete(stateKey);
			return KARAOKE_BOUNCE_IDLE;
		}
		if (position < startTime) {
			karaokeExpressiveMotionStates.delete(stateKey);
			return KARAOKE_EXPRESSIVE_REST_PENDING;
		}
		if (position >= Math.max(startTime, endTime) + KARAOKE_EXPRESSIVE_SETTLE_MS) {
			karaokeExpressiveMotionStates.delete(stateKey);
			return KARAOKE_BOUNCE_IDLE;
		}
		const curves = emphasis ? KARAOKE_EXPRESSIVE_CURVES.emphasis : KARAOKE_EXPRESSIVE_CURVES.word;
		const progress = endTime > startTime ? Math.min(1, (position - startTime) / (endTime - startTime)) : 1;
		const goals = {
			scale: sampleKaraokeExpressiveCurve(curves.scale, progress),
			offsetY: sampleKaraokeExpressiveCurve(curves.offsetY, progress),
			glow: sampleKaraokeExpressiveCurve(curves.glow, progress),
		};
		let state = karaokeExpressiveMotionStates.get(stateKey);
		if (!state || state.emphasis !== emphasis || position < state.position
			|| state.startTime !== startTime || state.endTime !== endTime) {
			// Every unit starts from its pending rest pose, also after a seek.
			state = {
				emphasis,
				time: now,
				position, startTime, endTime,
				scale: { position: KARAOKE_EXPRESSIVE_PENDING_SCALE, velocity: 0 },
				offsetY: { position: KARAOKE_EXPRESSIVE_PENDING_OFFSET_EM, velocity: 0 },
				glow: { position: 0, velocity: 0 },
			};
			karaokeExpressiveMotionStates.set(stateKey, state);
		}
		// Unrelated commits while paused must not advance motion. A forward seek
		// or stalled renderer lands on the current target rather than replaying it.
		const seconds = position === state.position ? 0
			: Math.max(0, (now - state.time) / 1000, (position - state.position) / 1000);
		state.time = now;
		state.position = position;
		for (const property of ["scale", "offsetY", "glow"]) {
			if (seconds > KARAOKE_EXPRESSIVE_MAX_STEP_SECONDS) {
				// After a stall (hidden window, paused rendering) land on the
				// current pose instead of replaying motion that is already past.
				state[property].position = goals[property];
				state[property].velocity = 0;
			} else {
				stepKaraokeExpressiveSpring(state[property], goals[property], seconds, KARAOKE_EXPRESSIVE_SPRINGS[property]);
			}
		}
		return {
			offsetY: Math.round(state.offsetY.position * 2000) / 2000,
			scale: Math.round(state.scale.position * 1000) / 1000,
			glow: getVisualSettings()?.["karaoke-text-effects"] === false
				? 0 : Math.max(0, Math.round(state.glow.position * 100) / 100),
			active: true,
			unit: "em",
		};
	};

	// The discrete part of expressive motion, without touching any spring state.
	const getKaraokeExpressivePhase = (position, startTime, endTime) => {
		if (!isKaraokeExpressiveMotionEnabled() || !Number.isFinite(position)
			|| !Number.isFinite(startTime) || !Number.isFinite(endTime)) return KARAOKE_BOUNCE_IDLE;
		if (position < startTime) return KARAOKE_EXPRESSIVE_REST_PENDING;
		return position >= Math.max(startTime, endTime) + KARAOKE_EXPRESSIVE_SETTLE_MS
			? KARAOKE_BOUNCE_IDLE
			: KARAOKE_EXPRESSIVE_LIVE_MOVING;
	};

	return {
		getKaraokeBounceValues, getKaraokeWordBounceValues, getKaraokeLiveBounce,
		isKaraokeExpressiveMotionEnabled, getKaraokeExpressiveMotion, getKaraokeExpressivePhase,
		clearKaraokeExpressiveMotion: key => karaokeExpressiveMotionStates.delete(key),
	};
}

export {
	KARAOKE_BOUNCE_IDLE, KARAOKE_EXPRESSIVE_MOTION_STYLE, KARAOKE_EXPRESSIVE_SETTLE_MS,
	createKaraokeMotionProfile, getKaraokeMotionProfile,
	classifyKaraokeExpressiveUnits, getKaraokeExpressiveUnitRanges, getKaraokeExpressiveGlyphWindow,
	getKaraokeExpressiveWordWindow, isKaraokeExpressiveEmphasisUnit,
};
