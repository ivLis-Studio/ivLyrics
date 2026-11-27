export function syncCompactLyricsViewport({
	compact, isScrolling, containerRef, activeLineRef, layoutObserverRef, setCompactOffset, getCompactSyncedOffset,
}) {
	if (!compact) {
		setCompactOffset(0);
		return;
	}

	if (isScrolling || containerRef.current?.classList?.contains("scrolling-active")) return;

	// This synchronous pass consumes any already queued layout notification.
	// Keep offset and position-index in the same commit as before.
	layoutObserverRef.current?.cancelPending();
	// Auto-follow positions rows with transforms. Native scroll left by
	// focus/scroll anchoring must not add a second, invisible displacement.
	const container = containerRef.current;
	const height = container?.clientHeight;
	if (height === 0) return;
	if (container?.scrollTop) container.scrollTop = 0;
	const nextOffset = getCompactSyncedOffset(container, activeLineRef.current, isScrolling, height);
	setCompactOffset((prevOffset) => (
		Math.abs(prevOffset - nextOffset) < 0.5 ? prevOffset : nextOffset
	));
}

export function createSyncedLyricsViewportHook({
	react, getCompactSyncedOffset, scrollSyncedContainerToActiveLine, isLineVisible, canObserveLayout, createObserver,
	requestFrame, cancelFrame,
}) {
	const { useState, useEffect, useRef, useCallback } = react;
	const useSyncedLayoutEffect = react.useLayoutEffect || useEffect;

	return function useSyncedLyricsViewport({
		compact, isScrolling, preparedLyrics, visualLineIndex, trailingInterludeKey,
		containerRef, container, activeLineRef, lyricsId, settingsRevision, anchorRevision,
	}) {
		const [compactOffset, setCompactOffset] = useState(0);
		const [suppressLayoutShiftAnimation, setSuppressLayoutShiftAnimation] = useState(false);
		const previousPreparedLyricsRef = useRef(preparedLyrics);
		const layoutShiftAnimationFramesRef = useRef({ first: null, second: null });
		const [contentLayoutRevision, setContentLayoutRevision] = useState(0);
		const previousContentLayoutRevisionRef = useRef(contentLayoutRevision);
		const layoutObserverRef = useRef(null);
		const syncCompactOffset = useCallback(() => syncCompactLyricsViewport({
			compact, isScrolling, containerRef, activeLineRef, layoutObserverRef, setCompactOffset, getCompactSyncedOffset,
		}), [compact, containerRef, activeLineRef, isScrolling]);

		// Streaming translation/pronunciation changes lyric row heights without
		// changing playback position. Re-centering is still necessary, but animating
		// that corrective offset makes the active lyric fall and spring back for every
		// streamed line. Mark corrective layout work for two frames: scripted rows
		// rebase their existing travel, and the CSS fallback suppresses its correction.
		useSyncedLayoutEffect(() => {
			const previousPreparedLyrics = previousPreparedLyricsRef.current;
			previousPreparedLyricsRef.current = preparedLyrics;
			const contentChanged = previousContentLayoutRevisionRef.current !== contentLayoutRevision;
			previousContentLayoutRevisionRef.current = contentLayoutRevision;

			const frames = layoutShiftAnimationFramesRef.current;
			const cancelPendingFrames = () => {
				if (frames.first !== null) cancelFrame(frames.first);
				if (frames.second !== null) cancelFrame(frames.second);
				frames.first = null;
				frames.second = null;
			};
			cancelPendingFrames();

			if (!compact || isScrolling || (previousPreparedLyrics === preparedLyrics && !contentChanged)) {
				setSuppressLayoutShiftAnimation(false);
				return undefined;
			}

			setSuppressLayoutShiftAnimation(true);
			frames.first = requestFrame(() => {
				frames.first = null;
				frames.second = requestFrame(() => {
					frames.second = null;
					setSuppressLayoutShiftAnimation(false);
				});
			});

			return cancelPendingFrames;
		}, [compact, isScrolling, preparedLyrics, contentLayoutRevision]);

		useSyncedLayoutEffect(() => {
			syncCompactOffset();
		}, [syncCompactOffset, visualLineIndex, trailingInterludeKey, container, lyricsId, preparedLyrics, settingsRevision, anchorRevision]);

		useSyncedLayoutEffect(() => {
			const container = containerRef.current;
			const activeLine = activeLineRef.current;
			if (isScrolling || !container || !activeLine || !canObserveLayout()) {
				layoutObserverRef.current?.disconnect();
				layoutObserverRef.current = null;
				return undefined;
			}
			const observer = layoutObserverRef.current ??= createObserver();
			observer.update(container, activeLine, (contentChanged) => {
				if (compact) {
					if (contentChanged) setContentLayoutRevision(revision => revision + 1);
					syncCompactOffset();
				} else {
					scrollSyncedContainerToActiveLine(containerRef.current, activeLineRef.current, "sync");
				}
			});
			// Earlier rows can grow without resizing either observed target. The
			// expanded view still needs the correction previously supplied by a new
			// observer's initial notification, even when its anchor moved offscreen.
			if (!compact) observer.scheduleSync();
		}, [compact, isScrolling, visualLineIndex, trailingInterludeKey, container, lyricsId, preparedLyrics, settingsRevision, anchorRevision, syncCompactOffset]);

		useSyncedLayoutEffect(() => () => {
			layoutObserverRef.current?.disconnect();
			layoutObserverRef.current = null;
		}, []);

		const hasAutoScrolledRef = useRef(false);
		const wasBrowsingRef = useRef(false);
		useEffect(() => {
			hasAutoScrolledRef.current = false;
			wasBrowsingRef.current = false;
		}, [container, lyricsId]);

		useEffect(() => {
			if (compact || !container) {
				return undefined;
			}

			if (isScrolling) {
				wasBrowsingRef.current = true;
				return;
			}
			const activeLine = activeLineRef.current;
			if (!activeLine) return;

			// Manual browsing owns scrollTop until the user clicks or the idle
			// timer expires. The playing line may then be entirely off-screen.
			if (!hasAutoScrolledRef.current || wasBrowsingRef.current || isLineVisible(activeLine)) {
				layoutObserverRef.current?.cancelPending();
				scrollSyncedContainerToActiveLine(container, activeLine, hasAutoScrolledRef.current ? "smooth" : "auto");
				hasAutoScrolledRef.current = true;
			}
			wasBrowsingRef.current = false;
		}, [compact, visualLineIndex, isScrolling, container, activeLineRef, lyricsId, trailingInterludeKey, preparedLyrics]);

		return { compactOffset, suppressLayoutShiftAnimation };
	};
}
