import { getPlayableLyricsUri } from "../core/playbackPositionService.mjs";
import {
    prepareSyncedLineStartIndex, getActiveTimedLineIndex, getPrecenteredTimedLineIndex, getPanelSingingLineIndices,
} from "./lyricPlaybackTimeline.mjs";

const PAUSED_POLL_INTERVAL_MS = 30;

export function getTrailingKaraokeInterludeKey(lineIndex, interludeInfo) {
    if (!interludeInfo?.isInterlude) return null;
    return `${lineIndex}:${interludeInfo.startTime}:${interludeInfo.endTime}`;
}

function getPanelTrailingInterludeState(lineIndex, interludeInfo, position, advanceMs) {
    const key = getTrailingKaraokeInterludeKey(lineIndex, interludeInfo);
    if (!key || position >= interludeInfo.endTime) {
        return { activeKey: null, visualKey: null };
    }
    return {
        activeKey: position >= interludeInfo.startTime ? key : null,
        visualKey: position >= interludeInfo.startTime - Math.max(0, advanceMs) ? key : null,
    };
}

function readFrameAlignedPosition(frameTime, snapshot, readFallback) {
    const position = Number(snapshot?.position);
    if (!Number.isFinite(position)) return readFallback();

    const isPlaying = snapshot.isPlaying === true;
    const sampledAt = Number(snapshot.sampledAt);
    // Playback advances in display-frame time. The host may sample the
    // player after that frame has already begun.
    return {
        position: isPlaying && Number.isFinite(frameTime) && Number.isFinite(sampledAt)
            ? position - Math.max(0, sampledAt - frameTime)
            : position,
        isPlaying,
    };
}

export function startPanelPlaybackSubscription({
    lyrics, timeline, enabled, hasKaraokeTiming, reduceMotion,
    startIndex, startVisualIndex, offsetMs, transitionMs, resolveTrailingInterlude,
    read: { snapshot, fallbackPlayback, trackUri, storedTrackDelay, pronunciationLead },
    on: { position: writePosition, positionChanged, activeLineChanged, visualLineChanged, singingLinesChanged,
        activeInterludeChanged, visualInterludeChanged },
    scheduler: { requestFrame, cancelFrame, scheduleTimer, cancelTimer, visibilityTarget, isHidden },
}) {
    const lineStarts = enabled ? prepareSyncedLineStartIndex(lyrics) : null;
    let lastIndex = startIndex;
    let lastVisualIndex = startVisualIndex;
    let lastTrailingKey = null;
    let lastVisualTrailingKey = null;
    let lastSingingKey = null;
    let lastTrackUri = null;
    let cachedDelay = 0;
    let lastNotifiedPosition = null;
    let lastNotifiedTrackUri = null;
    let pending = null;
    let disposed = false;

    function updatePosition(frameTime) {
        const sampledPlayback = snapshot();
        const { position, isPlaying } = readFrameAlignedPosition(frameTime, sampledPlayback, fallbackPlayback);
        const uri = getPlayableLyricsUri(sampledPlayback, sampledPlayback?.uri ? null : trackUri());
        if (uri !== lastTrackUri) {
            lastTrackUri = uri;
            cachedDelay = 0;
            if (uri) {
                try {
                    const stored = storedTrackDelay(uri);
                    cachedDelay = stored ? parseInt(stored, 10) || 0 : 0;
                } catch {
                    cachedDelay = 0;
                }
            }
        }
        const adjustedPosition = position + cachedDelay + offsetMs.track + offsetMs.global + offsetMs.pseudo
            + (pronunciationLead() || 0);
        writePosition(adjustedPosition);

        const index = getActiveTimedLineIndex(lyrics, adjustedPosition, lineStarts);
        const singingLines = hasKaraokeTiming ? getPanelSingingLineIndices(timeline, adjustedPosition, index) : [];
        const singingKey = singingLines.join(",");
        if (singingKey !== lastSingingKey) {
            lastSingingKey = singingKey;
            singingLinesChanged(singingLines);
        }

        const precenter = hasKaraokeTiming && !reduceMotion;
        const visualIndex = precenter
            ? getPrecenteredTimedLineIndex(lyrics, adjustedPosition, index, transitionMs, lineStarts)
            : index;
        const interlude = getPanelTrailingInterludeState(
            index, resolveTrailingInterlude(index), adjustedPosition, precenter ? transitionMs : 0,
        );

        if (index !== lastIndex) {
            lastIndex = index;
            activeLineChanged(index);
        }
        if (visualIndex !== lastVisualIndex) {
            lastVisualIndex = visualIndex;
            visualLineChanged(visualIndex);
        }
        if (interlude.activeKey !== lastTrailingKey) {
            lastTrailingKey = interlude.activeKey;
            activeInterludeChanged(interlude.activeKey);
        }
        if (interlude.visualKey !== lastVisualTrailingKey) {
            lastVisualTrailingKey = interlude.visualKey;
            visualInterludeChanged(interlude.visualKey);
        }
        if (adjustedPosition !== lastNotifiedPosition || uri !== lastNotifiedTrackUri) {
            lastNotifiedPosition = adjustedPosition;
            lastNotifiedTrackUri = uri;
            positionChanged();
        }
        return isPlaying;
    }

    function cancelScheduledUpdate() {
        const scheduled = pending;
        pending = null;
        if (scheduled) scheduled.cancel(scheduled.id);
    }

    function scheduleNextUpdate(isPlaying) {
        if (disposed || pending) return;
        const animate = isPlaying && !reduceMotion && !isHidden() && typeof requestFrame === "function";
        const scheduled = { id: null, cancel: animate ? cancelFrame : cancelTimer };
        pending = scheduled;
        const update = (frameTime) => {
            if (pending !== scheduled) return;
            pending = null;
            scheduleNextUpdate(updatePosition(frameTime));
        };
        scheduled.id = animate
            ? requestFrame(update)
            : scheduleTimer(update, PAUSED_POLL_INTERVAL_MS);
    }

    function visibilityChanged() {
        if (disposed) return;
        cancelScheduledUpdate();
        scheduleNextUpdate(updatePosition());
    }

    if (enabled && lyrics.length > 0) {
        visibilityTarget.addEventListener("visibilitychange", visibilityChanged);
        scheduleNextUpdate(updatePosition());
    }

    return () => {
        disposed = true;
        cancelScheduledUpdate();
        visibilityTarget.removeEventListener("visibilitychange", visibilityChanged);
        writePosition(0);
    };
}
