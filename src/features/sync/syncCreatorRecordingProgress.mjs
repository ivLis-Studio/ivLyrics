import { resolveSyncCreatorPaintCharColor } from './selectionTiming.mjs';
import { SYNC_CREATOR_RECORDING_BACKGROUND } from './syncCreatorStyles.mjs';

export function useSyncCreatorRecordingProgress({
	react, mode, line, refs, setRecordingCharIndex, getSyncCreatorProgressGradient, scheduleFrame, cancelFrame,
}) {
	const { useCallback, useEffect, useRef } = react;
	const {
		charCount, currentLineIndex, activeParallelTargetId, lyricsText, isCurrentLineRtl, useCurrentLineTextRun,
		currentLineDirection, currentSpeakerTextColor, currentSpeakerMutedColor,
	} = line;
	const {
		lyricsScrollRef, charElementsRef, charScrollMetricsRef, rtlTextRunRef, recordingCharIndexRef,
		lastPaintedPlaybackIndexRef, scoreInputRef, scoreInputContextRef,
	} = refs;
	const lastPaintedRecordingIndexRef = useRef(-1);
	const recordingVisualIndexRef = useRef(-1);
	const recordingVisualTargetIndexRef = useRef(-1);
	const recordingVisualFrameRef = useRef(null);
	const recordingVisualFrameTimeRef = useRef(0);

	const invalidateRecordingPaint = useCallback(() => {
		lastPaintedRecordingIndexRef.current = -2;
	}, []);

	const autoScroll = useCallback((charIndex) => {
		if (!lyricsScrollRef.current || charIndex < 0) return;
		const scrollContainer = lyricsScrollRef.current;
		const numericIndex = Number(charIndex);
		if (!Number.isFinite(numericIndex)) return;
		const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
		if (maxScrollLeft <= 0) return;

		if (useCurrentLineTextRun && charCount > 0) {
			const progress = Math.max(0, Math.min(1, numericIndex / Math.max(1, charCount - 1)));
			scrollContainer.scrollLeft = isCurrentLineRtl ? -maxScrollLeft * progress : maxScrollLeft * progress;
			return;
		}

		let metrics = charScrollMetricsRef.current;
		if (!Array.isArray(metrics) || metrics.length !== charElementsRef.current.length || metrics.length === 0) {
			metrics = charElementsRef.current.map((el) => {
				if (!el) return null;
				const width = el.offsetWidth || 0;
				return {
					center: (el.offsetLeft || 0) + (width / 2)
				};
			});
			charScrollMetricsRef.current = metrics;
		}

		const lowerIndex = Math.max(0, Math.min(metrics.length - 1, Math.floor(numericIndex)));
		const upperIndex = Math.max(0, Math.min(metrics.length - 1, Math.ceil(numericIndex)));
		const lower = metrics[lowerIndex];
		const upper = metrics[upperIndex] || lower;
		if (!lower) return;

		const ratio = Math.max(0, Math.min(1, numericIndex - lowerIndex));
		const center = lower.center + (((upper?.center ?? lower.center) - lower.center) * ratio);
		const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, center - (scrollContainer.clientWidth / 2)));

		if (Math.abs(scrollContainer.scrollLeft - targetScrollLeft) > 1) {
			scrollContainer.scrollLeft = targetScrollLeft;
		}
	}, [charCount, isCurrentLineRtl, useCurrentLineTextRun]);

	const applyRecordingProgressVisual = useCallback((nextIndex) => {
		const numericIndex = Number(nextIndex);
		const normalizedIndex = Number.isFinite(numericIndex) ? Math.max(-1, Math.floor(numericIndex)) : -1;
		const previousIndex = lastPaintedRecordingIndexRef.current;
		if (previousIndex === normalizedIndex) return;
		lastPaintedRecordingIndexRef.current = normalizedIndex;

		if (useCurrentLineTextRun && rtlTextRunRef.current) {
			const percent = charCount > 0 && normalizedIndex >= 0
				? Math.max(0, Math.min(100, ((normalizedIndex + 1) / charCount) * 100))
				: 0;
			rtlTextRunRef.current.style.backgroundImage = getSyncCreatorProgressGradient(
				currentLineDirection,
				percent,
				currentSpeakerTextColor,
				currentSpeakerMutedColor
			);
			autoScroll(normalizedIndex);
			return;
		}

		const completedIndex = normalizedIndex;

		const paintChar = (index) => {
			const el = charElementsRef.current[index];
			if (!el) return;
			const baseBackground = el.dataset.ivSyncCreatorBaseBackground || '';
			if (normalizedIndex >= 0 && index <= completedIndex) {
				el.style.background = SYNC_CREATOR_RECORDING_BACKGROUND;
				el.style.color = resolveSyncCreatorPaintCharColor(el.dataset.ivSyncCreatorRangeColor, '', currentSpeakerTextColor);
			} else {
				el.style.background = baseBackground;
				el.style.color = resolveSyncCreatorPaintCharColor(el.dataset.ivSyncCreatorRangeColor, el.dataset.ivSyncCreatorBaseColor, currentSpeakerTextColor);
			}
		};

		if (previousIndex < -1.5 || normalizedIndex < 0) {
			for (let index = 0; index < charCount; index++) {
				paintChar(index);
			}
			autoScroll(normalizedIndex);
			return;
		}

		const previousCompletedIndex = previousIndex;
		const minChangedIndex = Math.max(0, Math.min(
			completedIndex,
			previousCompletedIndex
		));
		const maxChangedIndex = Math.min(charCount - 1, Math.max(
			completedIndex,
			previousCompletedIndex
		));

		for (let index = minChangedIndex; index <= maxChangedIndex; index++) {
			paintChar(index);
		}

		autoScroll(normalizedIndex);
	}, [
		autoScroll,
		charCount,
		currentLineDirection,
		currentSpeakerMutedColor,
		currentSpeakerTextColor,
		useCurrentLineTextRun,
		getSyncCreatorProgressGradient,
	]);

	const cancelRecordingProgressAnimation = useCallback(() => {
		if (recordingVisualFrameRef.current === null) return;
		cancelFrame(recordingVisualFrameRef.current);
		recordingVisualFrameRef.current = null;
		recordingVisualFrameTimeRef.current = 0;
	}, [cancelFrame]);

	const scheduleRecordingProgressAnimation = useCallback(() => {
		if (recordingVisualFrameRef.current !== null) return;

		const paint = (timestamp) => {
			recordingVisualFrameRef.current = null;

			const targetIndex = recordingVisualTargetIndexRef.current;
			let visualIndex = Number(recordingVisualIndexRef.current);
			if (!Number.isFinite(visualIndex)) {
				visualIndex = targetIndex >= 0 ? Math.max(-1, targetIndex - 1) : -1;
			}

			if (targetIndex < 0 || mode !== 'record') {
				visualIndex = targetIndex;
			} else {
				const previousTimestamp = recordingVisualFrameTimeRef.current || timestamp;
				const deltaMs = Math.min(50, Math.max(8, timestamp - previousTimestamp));
				const distance = targetIndex - visualIndex;
				const maxStep = Math.max(0.18, deltaMs / 22);

				if (Math.abs(distance) <= maxStep) {
					visualIndex = targetIndex;
				} else {
					visualIndex += Math.sign(distance) * maxStep;
				}
				recordingVisualFrameTimeRef.current = timestamp;
			}

			recordingVisualIndexRef.current = visualIndex;
			applyRecordingProgressVisual(visualIndex);

			if (mode === 'record' && Math.abs(recordingVisualTargetIndexRef.current - visualIndex) > 0.01) {
				recordingVisualFrameRef.current = scheduleFrame(paint);
			} else {
				recordingVisualFrameTimeRef.current = 0;
			}
		};

		recordingVisualFrameRef.current = scheduleFrame(paint);
	}, [applyRecordingProgressVisual, mode, scheduleFrame]);

	const setRecordingProgressIndex = useCallback((nextIndex, options = {}) => {
		const normalizedIndex = Number.isInteger(nextIndex) ? nextIndex : -1;
		if (normalizedIndex < recordingCharIndexRef.current && scoreInputRef.current) {
			const retained = new Set((scoreInputContextRef.current?.refs || []).slice(0, normalizedIndex + 1).map(ref => ref.absoluteIndex));
			scoreInputRef.current.indexes = new Set([...scoreInputRef.current.indexes].filter(index => retained.has(index)));
			scoreInputRef.current.anchors = new Set([...scoreInputRef.current.anchors].filter(index => retained.has(index)));
		}
		recordingCharIndexRef.current = normalizedIndex;
		recordingVisualTargetIndexRef.current = normalizedIndex;
		if (mode === 'record') {
			lastPaintedPlaybackIndexRef.current = -2;
		}

		const shouldAnimate = mode === 'record'
			&& normalizedIndex >= 0
			&& options.animate !== false
			&& normalizedIndex >= recordingVisualIndexRef.current;

		if (shouldAnimate) {
			if (recordingVisualIndexRef.current < -0.5) {
				recordingVisualIndexRef.current = Math.max(-1, normalizedIndex - 1);
			}
			scheduleRecordingProgressAnimation();
		} else {
			cancelRecordingProgressAnimation();
			recordingVisualIndexRef.current = normalizedIndex;
			applyRecordingProgressVisual(normalizedIndex);
		}

		if (options.commitState !== false) {
			setRecordingCharIndex(normalizedIndex);
		}
	}, [applyRecordingProgressVisual, cancelRecordingProgressAnimation, mode, scheduleRecordingProgressAnimation]);

	useEffect(() => {
		cancelRecordingProgressAnimation();
		const nextVisualIndex = mode === 'record' ? recordingCharIndexRef.current : -1;
		recordingVisualTargetIndexRef.current = nextVisualIndex;
		recordingVisualIndexRef.current = nextVisualIndex;
		invalidateRecordingPaint();
		applyRecordingProgressVisual(nextVisualIndex);
	}, [mode, currentLineIndex, activeParallelTargetId, lyricsText, applyRecordingProgressVisual, cancelRecordingProgressAnimation, invalidateRecordingPaint]);

	useEffect(() => () => {
		cancelRecordingProgressAnimation();
	}, [cancelRecordingProgressAnimation]);

	return { setRecordingProgressIndex, applyRecordingProgressVisual, invalidateRecordingPaint };
}
