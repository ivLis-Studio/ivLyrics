const KARAOKE_FILL_CORRECTION_DEFAULT_POINTS = [
	{ x: 0, y: 0 },
	{ x: 0.25, y: 0.25 },
	{ x: 0.5, y: 0.5 },
	{ x: 0.75, y: 0.75 },
	{ x: 1, y: 1 },
];

const clampKaraokeFillCurveValue = (value, fallback = 0) => {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue)) {
		return fallback;
	}
	return Math.max(0, Math.min(1, numberValue));
};

const normalizeKaraokeFillCorrectionPoints = (value) => {
	let parsed = value;
	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch {
			parsed = null;
		}
	}

	const points = KARAOKE_FILL_CORRECTION_DEFAULT_POINTS.map((defaultPoint, index) => {
		const source = Array.isArray(parsed) ? parsed[index] : null;
		const sourceY = Array.isArray(source) ? source[1] : source?.y;
		return {
			x: defaultPoint.x,
			y: clampKaraokeFillCurveValue(sourceY, defaultPoint.y),
		};
	});

	points[0].y = 0;
	points[points.length - 1].y = 1;
	for (let index = 1; index < points.length - 1; index += 1) {
		points[index].y = Math.max(points[index - 1].y, points[index].y);
	}
	for (let index = points.length - 2; index > 0; index -= 1) {
		points[index].y = Math.min(points[index + 1].y, points[index].y);
	}

	return points;
};

const evaluateKaraokeFillCurve = (points, normalizedValue) => {
	if (normalizedValue <= 0) return 0;
	if (normalizedValue >= 1) return 1;

	let segmentIndex = 0;
	for (let index = 0; index < points.length - 1; index += 1) {
		if (normalizedValue >= points[index].x && normalizedValue <= points[index + 1].x) {
			segmentIndex = index;
			break;
		}
	}

	const p0 = points[Math.max(0, segmentIndex - 1)];
	const p1 = points[segmentIndex];
	const p2 = points[segmentIndex + 1];
	const p3 = points[Math.min(points.length - 1, segmentIndex + 2)];
	const localProgress = (normalizedValue - p1.x) / Math.max(0.0001, p2.x - p1.x);
	const rawControlY = (p1.y + p2.y) / 2 + (p2.y - p0.y + p3.y - p1.y) / 8;
	// Keep every quadratic segment monotonic. Without this clamp, equal adjacent
	// values can produce an overshooting control point (for example 0.5 ->
	// 0.59375 -> 0.5), making the karaoke fill advance and then visibly retreat.
	const controlY = Math.max(p1.y, Math.min(p2.y, rawControlY));
	const oneMinusProgress = 1 - localProgress;
	const correctedValue =
		oneMinusProgress * oneMinusProgress * p1.y +
		2 * oneMinusProgress * localProgress * controlY +
		localProgress * localProgress * p2.y;

	return clampKaraokeFillCurveValue(correctedValue);
};

const KARAOKE_FILL_STEPS = 25;
const KARAOKE_LONG_FILL_STEPS = 50;
const KARAOKE_LONG_FILL_DURATION_MS = 700;
const getKaraokeFillSteps = (startTime, endTime) => (
	endTime - startTime >= KARAOKE_LONG_FILL_DURATION_MS ? KARAOKE_LONG_FILL_STEPS : KARAOKE_FILL_STEPS
);
const getKaraokeFillSoftEdge = (fillValue, maximumEdge) => {
	const progress = Math.max(0, Math.min(1, fillValue / 100));
	// Keep the timing edge centered while reducing the painted tail at either
	// boundary, so a nearly complete gradient joins the solid completed glyph.
	return maximumEdge * 4 * progress * (1 - progress);
};

export function createKaraokeFill(getVisualSettings) {
	let karaokeFillCorrectionCurveCacheKey = null;
	let karaokeFillCorrectionCurveCachePoints = KARAOKE_FILL_CORRECTION_DEFAULT_POINTS;

	const getKaraokeFillCorrectionPoints = () => {
		const configuredValue = getVisualSettings()?.["karaoke-fill-correction-curve"] ||
			"[[0,0],[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]]";
		if (configuredValue === karaokeFillCorrectionCurveCacheKey) {
			return karaokeFillCorrectionCurveCachePoints;
		}

		karaokeFillCorrectionCurveCacheKey = configuredValue;
		karaokeFillCorrectionCurveCachePoints = normalizeKaraokeFillCorrectionPoints(configuredValue);
		return karaokeFillCorrectionCurveCachePoints;
	};

	const applyKaraokeFillCorrectionCurve = (value) => {
		const normalizedValue = clampKaraokeFillCurveValue(value);
		if (normalizedValue <= 0) return 0;
		if (normalizedValue >= 1) return 1;

		const points = getKaraokeFillCorrectionPoints();
		if (points.every((point) => Math.abs(point.y - point.x) < 0.000001)) {
			return normalizedValue;
		}
		return evaluateKaraokeFillCurve(points, normalizedValue);
	};

	const getKaraokeCharFill = (position, _isActive, startTime, endTime, isComplete = false) => {
		if (isComplete) {
			return 1;
		}
		if (position <= startTime) {
			return 0;
		}
		if (position >= endTime) {
			return 1;
		}
		const raw = Math.max(0, Math.min(1, (position - startTime) / Math.max(1, endTime - startTime)));
		const corrected = applyKaraokeFillCorrectionCurve(raw);
		// Only long fills need finer steps; short syllables already change at the
		// playback frame cadence. Pending/completed glyphs keep their stable values.
		const steps = getKaraokeFillSteps(startTime, endTime);
		return Math.round(corrected * steps) / steps;
	};

	const getKaraokeLiveFill = (position, startTime, endTime) => {
		if (!Number.isFinite(position) || !(position > startTime) || !(position < endTime)) return null;
		return applyKaraokeFillCorrectionCurve((position - startTime) / Math.max(1, endTime - startTime)) * 100;
	};

	return { applyKaraokeFillCorrectionCurve, getKaraokeCharFill, getKaraokeLiveFill };
}

export {
	getKaraokeFillSteps, getKaraokeFillSoftEdge, evaluateKaraokeFillCurve, normalizeKaraokeFillCorrectionPoints,
	KARAOKE_FILL_CORRECTION_DEFAULT_POINTS, clampKaraokeFillCurveValue,
};
