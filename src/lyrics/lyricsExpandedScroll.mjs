const LYRICS_CENTERING_DURATION_MS = 420;
const LYRICS_CENTERING_BEZIER = [0.22, 1, 0.36, 1];

const cubicBezierCoordinate = (t, first, second) => {
	const inverse = 1 - t;
	return (3 * inverse * inverse * t * first)
		+ (3 * inverse * t * t * second)
		+ (t * t * t);
};

const cubicBezierDerivative = (t, first, second) => {
	const inverse = 1 - t;
	return (3 * inverse * inverse * first)
		+ (6 * inverse * t * (second - first))
		+ (3 * t * t * (1 - second));
};

export const getLyricsCenteringProgress = (progress) => {
	const clamped = Math.max(0, Math.min(1, progress));
	const [x1, y1, x2, y2] = LYRICS_CENTERING_BEZIER;
	let parameter = clamped;

	for (let iteration = 0; iteration < 5; iteration++) {
		const difference = cubicBezierCoordinate(parameter, x1, x2) - clamped;
		const derivative = cubicBezierDerivative(parameter, x1, x2);
		if (Math.abs(difference) < 0.0001 || Math.abs(derivative) < 0.0001) break;
		parameter = Math.max(0, Math.min(1, parameter - difference / derivative));
	}

	return cubicBezierCoordinate(parameter, y1, y2);
};

export function createLyricsExpandedScroll({
	getExpandedScrollTarget, prefersReducedLyricsMotion, now, requestFrame, cancelFrame,
}) {
	const syncedLyricsScrollAnimations = new WeakMap();

	const cancelSyncedLyricsScrollAnimation = (container) => {
		const animation = container ? syncedLyricsScrollAnimations.get(container) : null;
		if (!animation) return;

		cancelFrame(animation.frameId);
		syncedLyricsScrollAnimations.delete(container);
	};

	const animateSyncedLyricsScroll = (container, targetTop) => {
		cancelSyncedLyricsScrollAnimation(container);

		const startTop = Number(container.scrollTop) || 0;
		if (Math.abs(targetTop - startTop) < 0.5 || prefersReducedLyricsMotion()) {
			container.scrollTop = targetTop;
			return;
		}

		const animation = {
			frameId: null,
			startTop,
			targetTop,
			startTime: now(),
		};

		const frame = (timestamp) => {
			if (syncedLyricsScrollAnimations.get(container) !== animation) return;

			const elapsed = Math.max(0, timestamp - animation.startTime);
			const progress = Math.min(1, elapsed / LYRICS_CENTERING_DURATION_MS);
			const eased = getLyricsCenteringProgress(progress);
			container.scrollTop = animation.startTop
				+ ((animation.targetTop - animation.startTop) * eased);

			if (progress < 1) {
				animation.frameId = requestFrame(frame);
				return;
			}

			container.scrollTop = animation.targetTop;
			syncedLyricsScrollAnimations.delete(container);
		};

		syncedLyricsScrollAnimations.set(container, animation);
		animation.frameId = requestFrame(frame);
	};

	const scrollSyncedContainerToActiveLine = (container, activeLine, behavior = "smooth") => {
		if (!container || !activeLine) return;

		const nextTop = getExpandedScrollTarget(container, activeLine);

		if (behavior === "smooth") {
			animateSyncedLyricsScroll(container, nextTop);
			return;
		}

		if (behavior === "sync" && syncedLyricsScrollAnimations.has(container)) {
			syncedLyricsScrollAnimations.get(container).targetTop = nextTop;
			return;
		}

		cancelSyncedLyricsScrollAnimation(container);
		container.scrollTop = nextTop;
	};

	return { scrollSyncedContainerToActiveLine, cancelSyncedLyricsScrollAnimation };
}
