import {
	getMedian, getAdaptiveLyricsCenteringTiming, getLyricsLineRenderedMotionTiming,
	getLyricsLineShiftOffset, getLyricsLineShiftVelocity, LYRICS_CENTERING_MIN_TOTAL_MS,
} from "./lyricsLineMotion.mjs";

export function createCompactLyricsLineController({
	motion: { getTransformTranslateY, offsetTransformVertically, buildLineShiftKeyframes, createLyricsLineShiftMotion },
	manualReturns, isElement, readTransform, readTimelineTime, scheduleUpdate, now = Date.now,
}) {
	const animations = new Map();
	const motionData = new WeakMap();
	let snapshots = new WeakMap();
	let context = null;

	function cancelAnimations() {
		animations.forEach((animation) => animation.cancel());
		animations.clear();
	}

	function reset() {
		cancelAnimations();
		snapshots = new WeakMap();
		context = null;
	}

	function resetAfterSeek(container) {
		if (container?.classList?.contains("scrolling-active")
			|| now() < (manualReturns.get(container)?.expiresAt || 0)) return;
		reset();
	}

	function update({
		compact, isScrolling, usesScriptedCompactLineShift, suppressLayoutShiftAnimation,
		visualLineIndex, settingsRevision, lyricsId, trailingInterludeKey, compactOffset,
		readContainer, readActiveLine, nextLineStart, leadMs, readPlaybackPosition,
	}) {
		if (isScrolling && compact) {
			animations.forEach((animation) => animation.pause());
			return undefined;
		}
		if (!usesScriptedCompactLineShift) {
			reset();
			return undefined;
		}

		// Collapse ref/offset commits before reading geometry. No per-frame DOM
		// measurements or React updates are introduced by the row animations.
		let cancelled = false;
		const runScheduledLineShift = () => {
			if (cancelled) return;
			const container = readContainer();
			const lineRoot = container?.querySelector?.(
				".lyrics-lyricsContainer-SyncedLyrics"
			);
			if (!lineRoot) return;
			const manualReturn = manualReturns.get(container);
			const returningFromScroll = manualReturn && now() < manualReturn.expiresAt;
			const hasManualOrigin = returningFromScroll && manualReturn.pending;
			if (manualReturn && !returningFromScroll) manualReturns.delete(container);

			const allLines = Array.from(lineRoot.children).filter((element) => (
				isElement(element)
				&& element.classList.contains("lyrics-lyricsContainer-LyricsLine")
			));
			const paddingBefore = allLines.filter((element) => element.classList.contains("lyrics-lyricsContainer-LyricsLine-paddingBefore"));
			const paddingAfter = allLines.filter((element) => element.classList.contains("lyrics-lyricsContainer-LyricsLine-paddingAfter"));
			const boundaryPadding = new Set([paddingBefore.at(-1), paddingAfter[0]].filter(Boolean));
			const lines = allLines.filter((element) => (
				!element.classList.contains("lyrics-lyricsContainer-LyricsLine-paddingLine") || boundaryPadding.has(element)
			));
			const visibleLines = new Set(lines);
			animations.forEach((animation, element) => {
				if (!visibleLines.has(element)) {
					animation.cancel();
					animations.delete(element);
				}
			});

			const previousContext = context;
			const sourceChanged = previousContext?.visualLineIndex !== visualLineIndex;
			const samePresentation = previousContext && !sourceChanged
				&& previousContext.settingsRevision === settingsRevision
				&& previousContext.lyricsId === lyricsId
				&& previousContext.trailingInterludeKey === trailingInterludeKey;
			const layoutCorrection = samePresentation && suppressLayoutShiftAnimation;
			const jump = previousContext && (visualLineIndex < previousContext.visualLineIndex
				|| visualLineIndex - previousContext.visualLineIndex > 1
				|| settingsRevision !== previousContext.settingsRevision);
			context = {
				visualLineIndex, settingsRevision, lyricsId, trailingInterludeKey, compactOffset, layoutCorrection,
			};
			if (layoutCorrection || (samePresentation && previousContext.layoutCorrection
				&& compactOffset === previousContext.compactOffset)) {
				// Content growth changes the centered destination, not the row's
				// remaining travel. Rebase the same compositor effect; never cancel
				// or restart its curve, stagger, velocity, or elapsed time.
				const offsetDelta = compactOffset - previousContext.compactOffset;
				if (Math.abs(offsetDelta) < 0.01) return;
				for (const element of lines) {
					const animation = animations.get(element);
					const motion = animation && motionData.get(animation);
					const target = motion?.targetTransform || snapshots.get(element);
					if (!target) continue;
					const targetTransform = offsetTransformVertically(target, offsetDelta);
					snapshots.set(element, targetTransform);
					if (!motion) continue;
					motion.targetTransform = targetTransform;
					motion.keyframes = buildLineShiftKeyframes(targetTransform, motion.deltaY, motion.stops, motion.easing);
					animation.effect.setKeyframes(motion.keyframes);
				}
				return;
			}
			const previousStates = new Map();
			for (const element of lines) {
				const animation = animations.get(element);
				const motion = animation ? motionData.get(animation) : null;
				const currentTime = animation?.currentTime ?? 0;
				previousStates.set(element, {
					animation,
					motion,
					currentTime,
					startTime: animation?.startTime,
					// Read our sampled curve, not the animated DOM. This avoids a
					// forced style pass before cancellation and target measurement.
					transform: motion ? motion.targetTransform : snapshots.get(element),
				});
			}
			cancelAnimations();

			const lineStates = lines.map((element) => {
				const targetTransform = readTransform(element);
				const previous = previousStates.get(element);
				snapshots.set(element, targetTransform);
				const targetY = getTransformTranslateY(targetTransform);
				const previousTargetY = getTransformTranslateY(previous.transform);
				const previousY = Number.isFinite(previousTargetY) && previous.motion
					? previousTargetY + getLyricsLineShiftOffset(previous.motion, previous.currentTime)
					: previousTargetY;
				return {
					element, previous, targetTransform, targetY,
					deltaY: hasManualOrigin && manualReturn.positions.has(element)
						? manualReturn.positions.get(element) - element.getBoundingClientRect().top
						: previous.transform && Number.isFinite(previousY) && Number.isFinite(targetY)
							? previousY - targetY : null,
				};
			});
			if (manualReturn) manualReturn.pending = false;
			if (!returningFromScroll && (jump || !previousContext)) return;
			const sharedDelta = getMedian(lineStates.flatMap(({ deltaY }) => Number.isFinite(deltaY) ? [deltaY] : []));
			if (!Number.isFinite(sharedDelta)) return;
			const activeVocalStack = readActiveLine()?.querySelector?.(".lyrics-karaoke-stack[data-karaoke-vocal-anchor-window-ms]");
			const vocalWindow = Number(activeVocalStack?.getAttribute("data-karaoke-vocal-anchor-window-ms"));
			const nextTransitionIn = Number.isFinite(nextLineStart)
				? nextLineStart - leadMs - readPlaybackPosition()
				: null;
			const windows = [vocalWindow, nextTransitionIn].filter((value) => Number.isFinite(value) && value > 0);
			const transitionWindow = windows.length ? Math.min(...windows) : null;
			const skipNewMotion = !returningFromScroll && transitionWindow !== null && transitionWindow < LYRICS_CENTERING_MIN_TOTAL_MS;
			const timing = getAdaptiveLyricsCenteringTiming(transitionWindow);
			const sharedStartTime = readTimelineTime();
			for (const { element, previous, targetTransform, deltaY } of lineStates) {
				// Anchor notifications can arrive during an existing stagger. Keep
				// unchanged targets on their original timeline, including the delay.
				if (!hasManualOrigin && previous.animation && previous.motion?.targetTransform === targetTransform) {
					previous.animation.play();
					if (Number.isFinite(previous.startTime)) previous.animation.startTime = previous.startTime;
					else previous.animation.currentTime = previous.currentTime;
					animations.set(element, previous.animation);
					continue;
				}
				if (skipNewMotion) continue;
				const distance = Number.isFinite(deltaY) ? deltaY : sharedDelta;
				if (Math.abs(distance) < 0.25) continue;
				// The row's commit fixed this delay and duration; the travel reads
				// them back from its style.
				const rendered = getLyricsLineRenderedMotionTiming(element, timing);
				const wasMoving = previous.motion && previous.currentTime >= previous.motion.delay
					&& previous.currentTime < previous.motion.delay + previous.motion.durationMs;
				const velocity = wasMoving ? getLyricsLineShiftVelocity(previous.motion, previous.currentTime, previous.motion.delay) : null;
				// A row already in motion must not freeze for a second stagger.
				const delay = wasMoving || returningFromScroll ? 0 : !sourceChanged && previous.motion
					? Math.max(0, previous.motion.delay - previous.currentTime)
					: rendered.delayMs;
				const duration = wasMoving
					? Math.min(rendered.durationMs, Math.max(1, previous.motion.durationMs - previous.currentTime + previous.motion.delay))
					: rendered.durationMs;
				const motion = createLyricsLineShiftMotion(targetTransform, distance, duration, velocity);
				motion.delay = delay;
				const animation = element.animate(motion.keyframes, {
					duration: motion.durationMs, delay, easing: motion.easing, fill: "backwards",
				});
				if (Number.isFinite(sharedStartTime)) animation.startTime = sharedStartTime;
				motionData.set(animation, motion);
				animations.set(element, animation);
				animation.addEventListener("finish", () => {
					if (animations.get(element) === animation) animations.delete(element);
				}, { once: true });
			}
		};
		scheduleUpdate(runScheduledLineShift);
		return () => { cancelled = true; };
	}

	return { update, readContext: () => context, resetAfterSeek, cancelAnimations };
}
