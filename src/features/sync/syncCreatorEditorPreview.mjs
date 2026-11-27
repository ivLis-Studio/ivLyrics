import { getSyncCreatorParallelPreviewChars, hasOrderedSyncCreatorTimes } from "./parallelTiming.mjs";
import { getSyncCreatorLockedPlaybackProgressIndex } from "./selectionTiming.mjs";
import {
    getSyncCreatorCompletedPreviewMarks, getSyncCreatorPreviewProgressIndex, readSyncCreatorPreviewTime,
} from "./syncCreatorPlayback.mjs";
import { startSyncCreatorPreviewPainting } from "./syncCreatorPreviewPainting.mjs";

export function useSyncCreatorPreviewTiming({
    react, syncData, lineCharOffsets, activeParallelPart, getRejoinedLineChars, positionStore,
}) {
    const syncLinesByStart = react.useMemo(() => {
        if (!Array.isArray(syncData?.lines) || syncData.lines.length === 0) return null;
        return new Map(syncData.lines.map(line => [line.start, line]));
    }, [syncData]);

    return react.useMemo(() => {
        const cache = new Map();
        function getPreviewTimingForLine(lineIndex) {
            if (cache.has(lineIndex)) return cache.get(lineIndex);
            const line = syncLinesByStart?.get(lineCharOffsets[lineIndex]);
            const savedPart = activeParallelPart
                ? line?.parallel?.parts?.find(part => part.id === activeParallelPart.id)
                : null;
            const chars = activeParallelPart
                ? getSyncCreatorParallelPreviewChars(activeParallelPart, savedPart)
                : getRejoinedLineChars(line);
            // Glyphs, timestamps and animation share one validated timeline.
            const timeline = { chars, independent: Array.isArray(chars) && !hasOrderedSyncCreatorTimes(chars) };
            cache.set(lineIndex, timeline);
            return timeline;
        }
        const getPreviewCharsForLine = index => getPreviewTimingForLine(index).chars;
        const getCharSyncTime = (lineIndex, index) => readSyncCreatorPreviewTime(getPreviewCharsForLine(lineIndex)?.[index]);
        function getPreviewProgressIndexAtTime(lineIndex, seconds) {
            const { chars, independent } = getPreviewTimingForLine(lineIndex);
            return getSyncCreatorPreviewProgressIndex(chars, seconds, !independent);
        }
        return {
            syncLinesByStart,
            getPreviewCharsForLine,
            isCharSynced: (lineIndex, index) => getCharSyncTime(lineIndex, index) !== null,
            getCharSyncTime,
            getPlayedCharacters(lineIndex, seconds) {
                const { chars, independent } = getPreviewTimingForLine(lineIndex);
                return independent ? getSyncCreatorCompletedPreviewMarks(chars, seconds) : null;
            },
            getPreviewProgressIndexAtTime,
            getPreviewProgressIndex(lineIndex) {
                const index = getPreviewProgressIndexAtTime(lineIndex, positionStore.get() / 1000);
                return Number.isFinite(index) ? Math.floor(index) : -1;
            },
        };
    }, [syncLinesByStart, lineCharOffsets, activeParallelPart, getRejoinedLineChars, positionStore]);
}

export function createSyncCreatorActiveLinePainter({
    painting, times, line, refs,
}) {
    const input = {
        times,
        independent: Array.isArray(times) && !hasOrderedSyncCreatorTimes(times),
        paintedIndex: refs.lastPaintedPlaybackIndexRef,
        glyphCount: line.charCount,
        direction: line.direction,
        color: line.color,
        mutedColor: line.mutedColor,
    };
    return (nextIndex, position) => {
        input.nextIndex = nextIndex;
        input.position = position;
        input.elements = refs.charElementsRef.current;
        input.textRun = line.useTextRun ? refs.rtlTextRunRef.current : null;
        painting.paintActivePreview(input);
    };
}

export function useSyncCreatorEditorPreview({
    react, mode, timing, line, lyricsText, lineCount, refs, painting, getProgress,
    getActiveRecordingLockIndex, applyRecordingProgressVisual, scheduleFrame, cancelFrame,
}) {
    const { index, partId, charCount, direction, color, mutedColor, useTextRun } = line;
    const { syncLinesByStart, getPreviewCharsForLine, getPreviewProgressIndexAtTime } = timing;
    const { lastPaintedPlaybackIndexRef, parallelPreviewElementsRef, recordingCharIndexRef,
        charElementsRef, rtlTextRunRef } = refs;

    react.useEffect(() => {
        const onPlaybackProgress = createSyncCreatorActiveLinePainter({
            painting, times: getPreviewCharsForLine(index),
            line: { charCount, direction, color, mutedColor, useTextRun },
            refs: { lastPaintedPlaybackIndexRef, charElementsRef, rtlTextRunRef },
        });
        if (!syncLinesByStart || index >= lineCount) {
            onPlaybackProgress(-1);
            return;
        }
        return startSyncCreatorPreviewPainting({
            mode, getProgress, paintedIndex: lastPaintedPlaybackIndexRef,
            getProgressIndex: position => getPreviewProgressIndexAtTime(index, position),
            getLockedProgressIndex: nextIndex => getSyncCreatorLockedPlaybackProgressIndex(
                nextIndex, getActiveRecordingLockIndex(), recordingCharIndexRef.current,
            ),
            getRecordingIndex: () => recordingCharIndexRef.current,
            onParallelProgress: position => painting.paintParallelPreviews(parallelPreviewElementsRef.current, position),
            onPlaybackProgress,
            onRecordingProgress: applyRecordingProgressVisual,
            scheduleFrame, cancelFrame,
        });
    }, [
        mode, syncLinesByStart, index, lyricsText, partId, lineCount,
        getPreviewCharsForLine, getPreviewProgressIndexAtTime,
        charCount, direction, color, mutedColor, useTextRun, painting, getProgress,
        lastPaintedPlaybackIndexRef, parallelPreviewElementsRef, recordingCharIndexRef, charElementsRef, rtlTextRunRef,
        getActiveRecordingLockIndex, applyRecordingProgressVisual, scheduleFrame, cancelFrame,
    ]);
}
