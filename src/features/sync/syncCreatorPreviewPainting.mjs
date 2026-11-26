import { getSyncCreatorParallelPreviewChars, hasOrderedSyncCreatorTimes } from "./parallelTiming.mjs";
import { resolveSyncCreatorPaintCharColor } from "./selectionTiming.mjs";
import {
    getSyncCreatorCompletedPreviewMarks, getSyncCreatorCompletedPreviewPercent,
    getSyncCreatorPreviewProgressIndex, readSyncCreatorPreviewTime,
} from "./syncCreatorPlayback.mjs";

import { rangesToCharRefs } from './syncCreatorVocalLayout.mjs';
import { getSyncCreatorTextLayout } from './syncCreatorLyricText.mjs';

export function createSyncCreatorParallelPreviewTargets({
	currentParallelData, currentExistingLineData, currentFullLineChars, currentLineStart,
	getSyncCreatorSpeakerTextColor, elementsRef,
}) {
	const targets = new Map();
	for (const part of currentParallelData?.parts || []) {
		const savedPart = currentExistingLineData?.parallel?.parts?.find(item => item.id === part.id);
		const chars = getSyncCreatorParallelPreviewChars(part, savedPart);
		const text = rangesToCharRefs(part.ranges, currentFullLineChars, currentLineStart).map(ref => ref.char).join('');
		const color = getSyncCreatorSpeakerTextColor(part.speaker, part['speaker-color'], part['speaker-fallback']);
		const preview = {
			chars, ordered: hasOrderedSyncCreatorTimes(chars), color, mutedColor: `color-mix(in srgb, ${color} 54%, transparent)`,
			...getSyncCreatorTextLayout(text),
		};
		preview.ref = (element) => {
			if (!element) {
				elementsRef.current.delete(part.id);
				return;
			}
			elementsRef.current.set(part.id, {
				...preview,
				elements: Array.from(element.querySelectorAll('[data-iv-sync-creator-preview-index]')),
				textRun: element.querySelector('[data-iv-sync-creator-preview-text-run]'),
				lastIndex: -2, lastPosition: NaN
			});
		};
		targets.set(part.id, preview);
	}
	return targets;
}

function createSyncCreatorPreviewPainting({ progressBackground, syncedBackground, getProgressGradient }) {
    function paintGlyphBackground(element, isSynced, isCompleted) {
        element.style.background = isSynced
            ? (isCompleted ? progressBackground : syncedBackground)
            : '';
    }

    function paintParallelPreviews(previews, position) {
        for (const preview of previews) {
            if (preview.lastPosition === position) continue;
            preview.lastPosition = position;
            const { chars, ordered, elements, textRun, direction, color, mutedColor } = preview;
            if (!ordered) {
                // Overlapping vocals can have independent marks in the rejoined text.
                const completed = getSyncCreatorCompletedPreviewMarks(chars, position);
                if (textRun) {
                    textRun.style.backgroundImage = getProgressGradient(direction, getSyncCreatorCompletedPreviewPercent(completed), color, mutedColor);
                } else {
                    elements.forEach((element, index) => paintGlyphBackground(element, readSyncCreatorPreviewTime(chars[index]) !== null, completed[index]));
                }
                continue;
            }

            const nextIndex = Math.floor(getSyncCreatorPreviewProgressIndex(chars, position, true));
            const previousIndex = preview.lastIndex;
            if (previousIndex === nextIndex) continue;
            preview.lastIndex = nextIndex;
            if (textRun) {
                const percent = chars.length > 0 ? ((nextIndex + 1) / chars.length) * 100 : 0;
                textRun.style.backgroundImage = getProgressGradient(direction, percent, color, mutedColor);
                continue;
            }

            const first = previousIndex < -1 ? 0 : Math.max(0, Math.min(previousIndex, nextIndex));
            const last = previousIndex < -1 ? elements.length - 1 : Math.max(previousIndex, nextIndex);
            for (let index = first; index <= last && index < elements.length; index++) {
                paintGlyphBackground(elements[index], index < chars.length, index <= nextIndex);
            }
        }
    }

    function paintActivePreview({
        nextIndex, position, times, independent, paintedIndex, textRun,
        elements, glyphCount, direction, color, mutedColor,
    }) {
        function paintTextRun(percent) {
            textRun.style.backgroundImage = getProgressGradient(direction, percent, color, mutedColor);
        }
        function paintGlyph(element, completed) {
            if (!element) return;
            const { ivSyncCreatorRangeColor, ivSyncCreatorBaseColor, ivSyncCreatorSynced } = element.dataset;
            element.style.color = resolveSyncCreatorPaintCharColor(ivSyncCreatorRangeColor, ivSyncCreatorBaseColor, color);
            paintGlyphBackground(element, ivSyncCreatorSynced === '1', completed);
        }

        if (independent && Number.isFinite(position)) {
            paintedIndex.current = -1;
            const completed = getSyncCreatorCompletedPreviewMarks(times, position);
            if (textRun) paintTextRun(getSyncCreatorCompletedPreviewPercent(completed));
            else elements.forEach((element, index) => paintGlyph(element, completed[index]));
            return;
        }

        const numericIndex = Number(nextIndex);
        const normalizedIndex = Number.isFinite(numericIndex) ? Math.max(-1, Math.floor(numericIndex)) : -1;
        const previousIndex = paintedIndex.current;
        if (previousIndex === normalizedIndex) return;
        paintedIndex.current = normalizedIndex;
        if (textRun) {
            const percent = glyphCount > 0 && normalizedIndex >= 0
                ? Math.max(0, Math.min(100, ((normalizedIndex + 1) / glyphCount) * 100))
                : 0;
            paintTextRun(percent);
            return;
        }

        const repaintAll = previousIndex < -1.5 || normalizedIndex < 0;
        const first = repaintAll ? 0 : Math.max(0, Math.min(previousIndex, normalizedIndex));
        const last = repaintAll
            ? glyphCount - 1
            : Math.min(glyphCount - 1, Math.max(previousIndex, normalizedIndex));
        for (let index = first; index <= last; index++) {
            paintGlyph(elements[index], normalizedIndex >= 0 && index <= normalizedIndex);
        }
    }

    return { paintActivePreview, paintParallelPreviews };
}

function startSyncCreatorPreviewPainting({
    mode,
    getProgress,
    paintedIndex,
    getProgressIndex,
    getLockedProgressIndex,
    getRecordingIndex,
    onParallelProgress,
    onPlaybackProgress,
    onRecordingProgress,
    scheduleFrame,
    cancelFrame,
}) {
    let frameId = 0;
    let disposed = false;
    let lastPreviewPosition = NaN;
    paintedIndex.current = -2;

    function paintPosition(position) {
        const seconds = position / 1000;
        onParallelProgress(seconds);
        // Poll for seeks and resume while skipping duplicate work on paused frames.
        const alreadyPainted = mode !== 'record'
            && Number.isFinite(position)
            && position === lastPreviewPosition
            && paintedIndex.current >= -1;
        if (!alreadyPainted) {
            lastPreviewPosition = position;
            const progressIndex = Number.isFinite(position) ? getProgressIndex(seconds) : -1;
            const lockedIndex = mode === 'record' ? getLockedProgressIndex(progressIndex) : null;
            if (lockedIndex !== null) {
                onRecordingProgress(lockedIndex);
            } else if (!(mode === 'record' && getRecordingIndex() >= 0)) {
                onPlaybackProgress(progressIndex, seconds);
            }
        }
    }

    function paint() {
        if (disposed) return;
        const sample = getProgress();
        // The editor may retain its track across a short Spotify handoff.
        // A missing sample is not a seek to the start of the song.
        if (sample != null) paintPosition(Number(sample || 0));
        if (!disposed) frameId = scheduleFrame(paint);
    }

    frameId = scheduleFrame(paint);
    return () => {
        disposed = true;
        if (frameId) cancelFrame(frameId);
    };
}

export { createSyncCreatorPreviewPainting, startSyncCreatorPreviewPainting };
