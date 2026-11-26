import { buildSyncCreatorPlaybackTimeline, getSyncCreatorPlaybackLineIndex } from "./syncCreatorPlaybackTimeline.mjs";
import { readSyncCreatorDuration, readSyncCreatorPosition } from "./syncCreatorSeek.mjs";
import { isFiniteSyncCreatorTime } from "./timingGranularity.mjs";

const SYNC_CREATOR_PREVIEW_POSITION_UPDATE_INTERVAL_MS = 100;
const SYNC_CREATOR_RECORD_POSITION_UPDATE_INTERVAL_MS = 50;
const SYNC_CREATOR_IDLE_POSITION_UPDATE_INTERVAL_MS = 500;
const SYNC_CREATOR_POSITION_COMMIT_THRESHOLD_MS = 80;
const SYNC_CREATOR_RECORD_POSITION_COMMIT_THRESHOLD_MS = 35;

// A missing mark is distinct from a valid timestamp at zero.
export const readSyncCreatorPreviewTime = time => isFiniteSyncCreatorTime(time) && time >= 0 ? time : null;

export function getSyncCreatorCompletedPreviewMarks(chars, position) {
    return Array.from(chars, time => {
        const mark = readSyncCreatorPreviewTime(time);
        return mark !== null && mark <= position;
    });
}

export function getSyncCreatorCompletedPreviewPercent(marks) {
    if (!marks.length) return 0;
    return marks.reduce((count, played) => count + Number(played), 0) / marks.length * 100;
}

const getSyncCreatorPreviewProgressIndex = (chars, currentTimeSec, ordered = false) => {
	if (!Array.isArray(chars) || chars.length === 0 || !Number.isFinite(currentTimeSec)) return -1;
	let index;
	if (ordered) {
		let low = 0;
		let high = chars.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (chars[middle] <= currentTimeSec) low = middle + 1;
			else high = middle;
		}
		index = low - 1;
	} else {
		index = chars.findLastIndex(time => {
			const mark = readSyncCreatorPreviewTime(time);
			return mark !== null && mark <= currentTimeSec;
		});
	}
	if (index < 0) return -1;
	const currentCharTime = chars[index];
	const nextCharTime = readSyncCreatorPreviewTime(chars[index + 1]);
	if (nextCharTime === null || nextCharTime <= currentCharTime) return index;
	return index + Math.max(0, Math.min(1, (currentTimeSec - currentCharTime) / (nextCharTime - currentCharTime)));
};
const createSyncCreatorPositionStore = (initialPosition = 0) => {
	let value = initialPosition;
	const listeners = new Set();
	return {
		get: () => value,
		set: (next) => {
			const resolved = typeof next === 'function' ? next(value) : next;
			if (Object.is(resolved, value)) return;
			value = resolved;
			for (const listener of [...listeners]) listener(value);
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
	};
};

function createSyncCreatorPlaybackViews({
    getReact,
    getPlayer,
    now,
    hasAnimationFrame,
    prefersReducedMotion,
    requestFrame,
    cancelFrame,
    scheduleTimer,
    cancelTimer,
}) {
	// The live preview follows playback on its own clock. Only this subtree
	// re-renders for glyph states (about every 16 ms while playing), and the
	// shared KaraokeLivePainter paints fill and bounce on every display frame.
	// The editor keeps its coarser position updates; the preview no longer waits
	// for them (100 ms polling with an 80 ms commit threshold). Both read the raw
	// player progress that recording uses, with no lyric offsets.
	const SYNC_CREATOR_PREVIEW_STATE_INTERVAL_MS = 15;
	const SYNC_CREATOR_PREVIEW_PAUSED_POLL_MS = 120;
	// Raw player progress at the start of the display frame `frameTime` (a
	// requestAnimationFrame timestamp), so each painted frame advances by exactly
	// its own interval.
	const getSyncCreatorFrameAlignedProgress = (frameTime = NaN) => {
		const player = getPlayer();
		const progress = readSyncCreatorPosition(player?.getProgress?.());
		if (progress === null) return NaN;
		if (!Number.isFinite(frameTime) || player?.isPlaying?.() !== true) return progress;
		return Math.max(0, progress - Math.max(0, now() - frameTime));
	};
	const syncCreatorPreviewLiveClock = { getPosition: getSyncCreatorFrameAlignedProgress };
	const syncCreatorPreviewUsesLiveClock = () => hasAnimationFrame()
		&& !prefersReducedMotion();
	// Reduced motion keeps the editor's coarse position. The editor publishes it
	// through positionStore, so only this preview re-renders on each commit.
	const SyncCreatorLivePreviewClock = ({ fallbackPosition, positionStore = null, render }) => {
		const react = getReact();
		const live = syncCreatorPreviewUsesLiveClock();
		const [position, setPosition] = react.useState(() => Number(fallbackPosition) || 0);
		react.useEffect(() => {
			if (!live) {
				if (!positionStore) return undefined;
				const sync = () => {
					const next = Number(positionStore.get());
					if (Number.isFinite(next)) setPosition((previous) => (previous === next ? previous : next));
				};
				sync();
				return positionStore.subscribe(sync);
			}
			let frameId = null;
			let timerId = null;
			let lastCommit = -Infinity;
			let disposed = false;
			const commit = (frameTime) => {
				const next = Math.round(getSyncCreatorFrameAlignedProgress(frameTime));
				if (Number.isFinite(next)) setPosition((previous) => (previous === next ? previous : next));
			};
			const schedule = () => {
				if (disposed) return;
				// Paused playback only needs to notice seeks.
				const player = getPlayer();
				if (!player || player.isPlaying?.() === false) {
					timerId = scheduleTimer(() => {
						timerId = null;
						commit(NaN);
						schedule();
					}, SYNC_CREATOR_PREVIEW_PAUSED_POLL_MS);
					return;
				}
				frameId = requestFrame((frameTime) => {
					frameId = null;
					if (disposed) return;
					if (frameTime - lastCommit >= SYNC_CREATOR_PREVIEW_STATE_INTERVAL_MS) {
						lastCommit = frameTime;
						commit(frameTime);
					}
					schedule();
				});
			};
			commit(NaN);
			schedule();
			return () => {
				disposed = true;
				if (frameId !== null) cancelFrame(frameId);
				if (timerId !== null) cancelTimer(timerId);
			};
		}, [live, positionStore]);
		return render(live || positionStore ? position : fallbackPosition);
	};
	const useSyncCreatorPosition = (positionStore) => {
		const react = getReact();
		if (typeof react.useSyncExternalStore === 'function') {
			return react.useSyncExternalStore(positionStore.subscribe, positionStore.get);
		}
		const [position, setPosition] = react.useState(() => positionStore.get());
		react.useEffect(() => {
			setPosition(positionStore.get());
			return positionStore.subscribe(setPosition);
		}, [positionStore]);
		return position;
	};

	const SyncCreatorPlaybackTime = ({ positionStore, style, formatTime }) => (
		getReact().createElement('span', { style }, formatTime(useSyncCreatorPosition(positionStore)))
	);
	const SyncCreatorPlaybackBar = ({ positionStore, durationMs, barStyle, fillStyle, onClick }) => {
		const position = useSyncCreatorPosition(positionStore);
		const duration = readSyncCreatorPosition(durationMs) || readSyncCreatorDuration(getPlayer());
		const playbackPercent = duration === null ? 0 : Math.max(0, Math.min(100, (position / duration) * 100));
		return getReact().createElement('div', {
			style: { ...barStyle, '--iv-progress': `${playbackPercent}%` },
			'data-iv-progress-bar': 'true',
			onClick
		}, getReact().createElement('div', { style: { ...fillStyle, width: `${playbackPercent}%` } }));
	};
	return {
		SyncCreatorLivePreviewClock,
		SyncCreatorPlaybackTime,
		SyncCreatorPlaybackBar,
		syncCreatorPreviewLiveClock,
		syncCreatorPreviewUsesLiveClock,
	};
}

function startSyncCreatorPositionPolling({
    mode,
    getProgress,
    setPosition,
    onSample,
    scheduleInterval,
    cancelInterval,
}) {
    let lastCommittedPosition = -1;
    let disposed = false;
    const commitThreshold = mode === 'record'
        ? SYNC_CREATOR_RECORD_POSITION_COMMIT_THRESHOLD_MS
        : SYNC_CREATOR_POSITION_COMMIT_THRESHOLD_MS;

    function updatePosition() {
        if (disposed) return;
        const position = readSyncCreatorPosition(getProgress());
        if (position === null) return;
        if (lastCommittedPosition < 0 || Math.abs(position - lastCommittedPosition) >= commitThreshold || position === 0) {
            lastCommittedPosition = position;
            setPosition(position);
        }
        if (!disposed) onSample(position);
    }

    updatePosition();
    const intervalMs = mode === 'preview'
        ? SYNC_CREATOR_PREVIEW_POSITION_UPDATE_INTERVAL_MS
        : mode === 'record'
            ? SYNC_CREATOR_RECORD_POSITION_UPDATE_INTERVAL_MS
            : SYNC_CREATOR_IDLE_POSITION_UPDATE_INTERVAL_MS;
    const interval = scheduleInterval(updatePosition, intervalMs);
    return () => {
        disposed = true;
        cancelInterval(interval);
    };
}

export function useSyncCreatorPlayback({
    react, lyricsLines, lyricsText, syncData, sourceLines, lineIndexByStart, findMergedOwnerLineIndex,
    mode, currentLineIndex, isLoading, pendingMultiVocalDecision, pendingPlaybackNavigationRef, manualPreviewExitRef,
    getProgress, setPosition, setCurrentLineIndex, lyricsScrollRef, scheduleInterval, cancelInterval, canStartOperation,
}) {
    const timeline = react.useMemo(() => (
        buildSyncCreatorPlaybackTimeline(lyricsLines, syncData, sourceLines, lineIndexByStart, findMergedOwnerLineIndex)
    ), [lyricsLines, syncData, sourceLines, lineIndexByStart, findMergedOwnerLineIndex]);

    const navigation = react.useRef(null);
    react.useLayoutEffect(() => {
        function selectPlaybackLine(position, { preview } = {}) {
            if (!canStartOperation()) return;
            const initializing = pendingPlaybackNavigationRef.current;
            const following = preview && mode === "preview" && !manualPreviewExitRef.current;
            if (isLoading || !lyricsText || pendingMultiVocalDecision || (!initializing && !following) || position === null) return;
            const lineIndex = getSyncCreatorPlaybackLineIndex(timeline, position);
            if (lineIndex < 0) return;
            pendingPlaybackNavigationRef.current = false;
            if (lineIndex !== selectedLineIndex) {
                selectedLineIndex = lineIndex;
                setCurrentLineIndex(lineIndex);
            } else if (!initializing) return;
            if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
        }

        let selectedLineIndex = currentLineIndex;
        navigation.current = selectPlaybackLine;
        // A new source can become ready between player samples.
        if (pendingPlaybackNavigationRef.current && !isLoading && lyricsText && !pendingMultiVocalDecision && timeline.length) {
            selectPlaybackLine(readSyncCreatorPosition(getProgress()));
        }
    }, [mode, timeline, currentLineIndex, isLoading, lyricsText, pendingMultiVocalDecision,
        pendingPlaybackNavigationRef, manualPreviewExitRef, getProgress, setCurrentLineIndex, lyricsScrollRef, canStartOperation]);

    react.useLayoutEffect(() => startSyncCreatorPositionPolling({
        mode, getProgress, setPosition, scheduleInterval, cancelInterval,
        onSample: position => navigation.current?.(position, { preview: true }),
    }), [mode, getProgress, setPosition, scheduleInterval, cancelInterval]);
    return timeline;
}

export {
    createSyncCreatorPlaybackViews,
    createSyncCreatorPositionStore,
    getSyncCreatorPreviewProgressIndex,
    startSyncCreatorPositionPolling,
};
