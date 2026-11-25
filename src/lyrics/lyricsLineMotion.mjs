export const LYRICS_CENTERING_LEAD_MS = 300;
// Compact rows travel on a critically damped spring; its stiffness is
// omega * duration. Less than 1% of the travel remains after 470ms.
export const LYRICS_LINE_MOTION_DURATION_MS = 560;
export const LYRICS_LINE_MOTION_STIFFNESS = 7.5;
export const LYRICS_LINE_MOTION_MAX_SLOPE = LYRICS_LINE_MOTION_STIFFNESS
	/ (1 - Math.exp(-LYRICS_LINE_MOTION_STIFFNESS));
export const LYRICS_LINE_MOTION_SEGMENTS = 40;
const LYRICS_CENTERING_STAGGER_MS = 50;
const LYRICS_CENTERING_STAGGER_DECAY = 1 / 1.05;
const LYRICS_CENTERING_MAX_STAGGER_MS = 260;
const LYRICS_CENTERING_SETTLE_RESERVE_MS = 24;
export const LYRICS_CENTERING_MIN_TOTAL_MS = 80;

export const getMedian = (values) => {
	if (!Array.isArray(values) || values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
};

export const getAdaptiveLyricsCenteringTiming = (transitionWindowMs) => {
	const defaultTotalMs = LYRICS_LINE_MOTION_DURATION_MS + LYRICS_CENTERING_MAX_STAGGER_MS;
	if (!Number.isFinite(transitionWindowMs) || transitionWindowMs <= 0) {
		return {
			durationMs: LYRICS_LINE_MOTION_DURATION_MS,
			staggerMs: LYRICS_CENTERING_STAGGER_MS,
			maxStaggerMs: LYRICS_CENTERING_MAX_STAGGER_MS,
		};
	}

	// A rapid vocal stack can advance again before the previous movement
	// (plus its stagger) has settled. Scale the whole motion budget together so
	// every visible row reaches its destination just before the next row starts.
	const availableMs = Math.max(
		LYRICS_CENTERING_MIN_TOTAL_MS,
		transitionWindowMs - LYRICS_CENTERING_SETTLE_RESERVE_MS
	);
	const timingScale = Math.min(1, availableMs / defaultTotalMs);
	const durationMs = Math.max(1, Math.round(LYRICS_LINE_MOTION_DURATION_MS * timingScale));
	return {
		durationMs,
		staggerMs: LYRICS_CENTERING_STAGGER_MS * timingScale,
		// Rounding the travel must not push the last row past the window.
		maxStaggerMs: Math.max(0, Math.min(
			LYRICS_CENTERING_MAX_STAGGER_MS * timingScale,
			Math.floor(availableMs) - durationMs
		)),
	};
};

// Rows at or above the anchor start together. Each row below trails the one
// above it by a slightly shorter step, capped so deep rows still settle
// inside the window.
export const getLyricsLineStaggerDelay = (animationIndex, timing) => {
	if (!(animationIndex > 0) || !(timing.staggerMs > 0)) return 0;
	const decay = LYRICS_CENTERING_STAGGER_DECAY;
	return Math.min(timing.maxStaggerMs,
		timing.staggerMs * (1 - decay ** animationIndex) / (1 - decay));
};

// Planned once per line transition. Its timing reaches the CSS presentation in
// the commit that changes each row's class and blur index; the WAAPI shift
// reads the same values back from the row. Only a one-line advance from the
// previous scripted line cascades. Seeks, jumps, settings changes and manual
// scroll returns start every row together, as their travel does.
export const getLyricsLineMotionPlan = ({
	previousContext = null,
	visualLineIndex,
	settingsRevision,
	nextLineStart,
	leadMs = 0,
	position,
	manualReturn = null,
	now = Date.now(),
}) => ({
	...getAdaptiveLyricsCenteringTiming(Number.isFinite(nextLineStart) ? nextLineStart - leadMs - position : null),
	cascade: !(manualReturn && now < manualReturn.expiresAt)
		&& !!previousContext
		&& previousContext.settingsRevision === settingsRevision
		&& previousContext.visualLineIndex === visualLineIndex - 1,
});

export const getLyricsLineMotionStyle = (animationIndex, plan) => ({
	"--line-motion-delay": `${plan.cascade ? getLyricsLineStaggerDelay(animationIndex, plan) : 0}ms`,
	"--line-motion-duration": `${plan.durationMs}ms`,
});

// A shorter vocal window compresses the rendered delay and duration together
// so the travel still settles in time. It never lengthens either value.
export const getLyricsLineRenderedMotionTiming = (element, timing) => {
	const style = element?.style;
	const durationMs = Number.parseFloat(style?.getPropertyValue?.("--line-motion-duration"));
	if (!(durationMs > 0)) return { durationMs: timing.durationMs, delayMs: 0 };
	const delayMs = Number.parseFloat(style.getPropertyValue("--line-motion-delay"));
	const scale = Math.min(1, timing.durationMs / durationMs);
	return { durationMs: durationMs * scale, delayMs: delayMs > 0 ? delayMs * scale : 0 };
};

// Critically damped spring, normalized to land exactly at u = 1:
// p(u) = (1 - (1 + (k - s)u)e^(-ku)) / (1 - (1 + k - s)e^(-k)).
// s is solved from the requested dp/du at u = 0 so a retargeted row keeps its
// velocity; clamping it to [0, k] keeps the curve monotonic without overshoot.
export const getLyricsLineMotionProgress = (progress, initialSlope = 0) => {
	const t = Math.max(0, Math.min(1, progress));
	const k = LYRICS_LINE_MOTION_STIFFNESS;
	const tail = Math.exp(-k);
	const slope = Math.max(0, Number(initialSlope) || 0);
	const s = Math.min(k, slope * (1 - (1 + k) * tail) / Math.max(Number.EPSILON, 1 - slope * tail));
	const settle = k - s;
	return (1 - (1 + settle * t) * Math.exp(-k * t)) / (1 - (1 + settle) * tail);
};

// Quadratic spacing keeps eight stops inside the first 24th of the travel, so
// the sampled path leaves rest as softly as the spring instead of on a chord.
const LYRICS_LINE_MOTION_STOP_PERCENTS = Array.from(
	{ length: LYRICS_LINE_MOTION_SEGMENTS + 1 },
	(_, index) => index * index * 100 / LYRICS_LINE_MOTION_SEGMENTS ** 2
);
const lyricsLineMotionCurves = new Map();
export const getLyricsLineMotionCurve = (initialSlope) => {
	let curve = lyricsLineMotionCurves.get(initialSlope);
	if (!curve) {
		// Bound the cache because interrupted rows have varying slopes.
		if (lyricsLineMotionCurves.size >= 32) lyricsLineMotionCurves.clear();
		const stops = LYRICS_LINE_MOTION_STOP_PERCENTS.map((percent) => [
			percent / 100,
			Math.round(getLyricsLineMotionProgress(percent / 100, initialSlope) * 1e6) / 1e6,
		]);
		curve = {
			stops,
			easing: `linear(${stops.map(([, value], index) => `${value} ${LYRICS_LINE_MOTION_STOP_PERCENTS[index]}%`).join(", ")})`,
		};
		lyricsLineMotionCurves.set(initialSlope, curve);
	}
	return curve;
};

const getLyricsLineMotionSegment = (stops, progress) => {
	let low = 0;
	let high = stops.length - 2;
	while (low < high) {
		const middle = (low + high + 1) >>> 1;
		if (stops[middle][0] <= progress) low = middle;
		else high = middle - 1;
	}
	return low;
};

export const getLyricsLineShiftOffset = (motion, currentTime) => {
	const progress = Math.max(0, Math.min(1, (currentTime - (motion.delay || 0)) / motion.durationMs));
	const stops = motion.stops || getLyricsLineMotionCurve(motion.initialSlope).stops;
	const segment = getLyricsLineMotionSegment(stops, progress);
	const [fromTime, from] = stops[segment];
	const [toTime, to] = stops[segment + 1];
	const eased = from + (to - from) * (progress - fromTime) / (toTime - fromTime);
	return motion.deltaY * (1 - eased);
};

export const getLyricsLineShiftVelocity = (motion, currentTime, delay = 0) => {
	const progress = (currentTime - delay) / motion.durationMs;
	if (progress < 0 || progress >= 1) return 0;
	// Read the segment the browser is interpolating when retargeting, rather
	// than restarting from a resting curve.
	const stops = motion.stops || getLyricsLineMotionCurve(motion.initialSlope).stops;
	const segment = getLyricsLineMotionSegment(stops, progress);
	const [fromTime, from] = stops[segment];
	const [toTime, to] = stops[segment + 1];
	return -motion.deltaY * (to - from) / ((toTime - fromTime) * motion.durationMs);
};

export function createLyricsLineMotion({
	readMatrix = () => null, readOnlyMatrix = () => null, supportsLinearEasing = () => false,
} = {}) {
	const getTransformTranslateY = (transform) => {
		if (!transform || transform === "none") return 0;

		try {
			const Matrix = readOnlyMatrix();
			if (typeof Matrix === "function") {
				return new Matrix(transform).m42;
			}
		} catch (_) {
			// Fall through to the matrix parser below.
		}

		const matrixMatch = String(transform).match(/^matrix\(([^)]+)\)$/);
		if (!matrixMatch) return null;
		const values = matrixMatch[1].split(",").map(Number);
		return Number.isFinite(values[5]) ? values[5] : null;
	};

	const offsetTransformVertically = (transform, offsetY) => {
		if (!Number.isFinite(offsetY) || Math.abs(offsetY) < 0.01) {
			return transform;
		}

		try {
			const Matrix = readMatrix();
			if (typeof Matrix === "function") {
				const matrix = new Matrix(transform && transform !== "none" ? transform : undefined);
				matrix.m42 += offsetY;
				return matrix.toString();
			}
		} catch (_) {
			// A translate prefix is safe here because lyric rows only use vertical transforms.
		}

		return `translateY(${offsetY}px)${transform && transform !== "none" ? ` ${transform}` : ""}`;
	};

	const buildLineShiftKeyframes = (targetTransform, deltaY, stops, easing) => easing !== "linear" ? [
		{ offset: 0, transform: offsetTransformVertically(targetTransform, deltaY) },
		{ offset: 1, transform: targetTransform },
	] : stops.map(([offset, value]) => ({
		offset,
		transform: offsetTransformVertically(targetTransform, deltaY * (1 - value)),
	}));

	const getLyricsLineMotionEasing = (initialSlope) => {
		if (!supportsLinearEasing()) {
			return null;
		}
		// Keep the same sampled curve while handing only two transforms to the compositor.
		return getLyricsLineMotionCurve(initialSlope).easing;
	};

	const createLyricsLineShiftMotion = (targetTransform, deltaY, durationMs, velocityY = null) => {
		if (Number.isFinite(velocityY) && velocityY * deltaY < 0) {
			// A small anchor correction needs less time, not an abrupt loss of
			// velocity caused by forcing another full-duration monotonic curve.
			durationMs = Math.min(durationMs, Math.abs(deltaY / velocityY) * LYRICS_LINE_MOTION_STIFFNESS);
		}
		durationMs = Math.max(1, durationMs);
		// Rows at rest leave with zero velocity; moving rows hand theirs over.
		const initialSlope = Number.isFinite(velocityY) && Math.abs(deltaY) > 0.01
			? Math.max(0, Math.min(LYRICS_LINE_MOTION_MAX_SLOPE, -velocityY * durationMs / deltaY))
			: 0;
		const { stops } = getLyricsLineMotionCurve(initialSlope);
		const easing = getLyricsLineMotionEasing(initialSlope);
		const keyframes = buildLineShiftKeyframes(targetTransform, deltaY, stops, easing || "linear");
		return { targetTransform, deltaY, durationMs, initialSlope, stops, keyframes, easing: easing || "linear" };
	};

	return { getTransformTranslateY, offsetTransformVertically, buildLineShiftKeyframes,
		createLyricsLineShiftMotion, getLyricsLineMotionEasing };
}
