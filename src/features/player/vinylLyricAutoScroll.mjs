// Match the mobile LP lyric surface: hold, traverse once, then hold.
const SCROLL_START_HOLD_PROGRESS = 0.3;
const SCROLL_MOVE_PROGRESS = 0.4;
const SCROLL_OVERFLOW_THRESHOLD_PX = 1;

const getLineScrollProgress = (positionValue, startTimeValue, endTimeValue) => {
    const position = Number(positionValue);
    const startTime = Number(startTimeValue);
    const endTime = Number(endTimeValue);
    if (!Number.isFinite(position)
        || !Number.isFinite(startTime)
        || !Number.isFinite(endTime)
        || endTime <= startTime) {
        return 0;
    }

    const lineProgress = Math.min(1, Math.max(0, (position - startTime) / (endTime - startTime)));
    if (lineProgress <= SCROLL_START_HOLD_PROGRESS) return 0;
    if (lineProgress >= SCROLL_START_HOLD_PROGRESS + SCROLL_MOVE_PROGRESS) return 1;
    return (lineProgress - SCROLL_START_HOLD_PROGRESS) / SCROLL_MOVE_PROGRESS;
};

const getScrollTransform = (travelValue, direction, progressValue) => {
    const travel = Math.max(0, Number(travelValue) || 0);
    const progress = Math.min(1, Math.max(0, Number(progressValue) || 0));
    const offset = (direction === "rtl" ? travel : -travel) * progress;
    return `translate3d(${offset.toFixed(3)}px, 0, 0)`;
};

function measureOverflowRows(root, canMove, browser) {
    const viewports = root.querySelectorAll(".ivlyrics-vinyl-lyric-scroll-viewport");
    const rows = [];

    // Batch writes and reads across original/phonetic/translated rows.
    // Alternating them per row forces a fresh layout for every measurement.
    viewports.forEach((viewport) => {
        const content = viewport.querySelector(":scope > .ivlyrics-vinyl-lyric-scroll-content");
        viewport.classList.remove("is-vinyl-lyric-overflowing");
        if (!content || !canMove) return;

        // Wrapping is the safe default. Only clip a row after measuring
        // it unwrapped and confirming that playback can reveal its end.
        viewport.classList.add("is-vinyl-lyric-measuring");
        rows.push({ viewport, content });
    });

    rows.forEach((row) => {
        const { viewport, content } = row;
        row.viewportWidth = viewport.clientWidth;
        const naturalContentWidth = Math.max(
            content.scrollWidth,
            content.getBoundingClientRect().width
        );
        row.overflows = row.viewportWidth > 0
            && naturalContentWidth - row.viewportWidth > SCROLL_OVERFLOW_THRESHOLD_PX;
        row.direction = browser.getComputedStyle(viewport).direction === "rtl" ? "rtl" : "ltr";
    });

    rows.forEach(({ viewport, overflows }) => {
        viewport.classList.remove("is-vinyl-lyric-measuring");
        if (overflows) viewport.classList.add("is-vinyl-lyric-overflowing");
    });

    rows.forEach((row) => {
        if (!row.overflows) return;
        const { content, viewportWidth } = row;
        const paddedContentWidth = Math.max(
            content.scrollWidth,
            content.getBoundingClientRect().width
        );
        row.travel = Math.max(0, Math.ceil(paddedContentWidth - viewportWidth));
    });
    return rows;
}

export function createVinylLyricAutoScroll({ react, browser, getFonts }) {
    const { useLayoutEffect, useRef } = react;

    return function useOverflowAutoScroll(
        rootRef,
        resetKey,
        motionEnabled,
        position,
        lineStartTime,
        lineEndTime,
        liveClock = null
    ) {
        // Lazily created; this hook renders with every playback position update.
        const scrollEntriesRef = useRef(null);
        scrollEntriesRef.current ??= new Map();
        const scrollTimingRef = useRef(null);
        const appliedProgressRef = useRef(null);
        const wakeLiveScrollRef = useRef(null);
        const hasScrollTiming = Number.isFinite(lineStartTime)
            && Number.isFinite(lineEndTime)
            && lineEndTime > lineStartTime;
        const timing = scrollTimingRef.current ??= {};
        timing.position = position;
        timing.lineStartTime = lineStartTime;
        timing.lineEndTime = lineEndTime;
        timing.liveClock = liveClock;

        const getCurrentScrollProgress = (frameTime) => {
            // Measurement can run between playback commits or outlive a timing
            // correction. Sample the same current clock and bounds as live frames.
            const timing = scrollTimingRef.current;
            return getLineScrollProgress(
                timing.liveClock ? timing.liveClock.getPosition(frameTime) : timing.position,
                timing.lineStartTime,
                timing.lineEndTime
            );
        };

        const applyScrollProgress = (progress) => {
            if (appliedProgressRef.current === progress) return;
            appliedProgressRef.current = progress;
            scrollEntriesRef.current.forEach(({ travel, direction }, content) => {
                content.style.transform = getScrollTransform(travel, direction, progress);
            });
        };

        useLayoutEffect(() => {
            const root = rootRef.current;
            if (!root) return undefined;
            // A newly active lyric must start at the top of the wrapped scroll area.
            if (root.parentElement) root.parentElement.scrollTop = 0;

            const fonts = getFonts();
            const motionPreference = typeof browser.matchMedia === "function"
                ? browser.matchMedia("(prefers-reduced-motion: reduce)")
                : null;
            let resizeObserver = null;
            let mutationObserver = null;
            let measureFrame = null;
            let disposed = false;

            const clearScrollEntries = () => {
                scrollEntriesRef.current.forEach((_, content) => {
                    content.style.transform = "";
                    content.parentElement?.classList.remove("is-vinyl-lyric-overflowing");
                });
                scrollEntriesRef.current.clear();
            };

            const measure = (frameTime) => {
                measureFrame = null;
                if (disposed || !root.isConnected) return;

                clearScrollEntries();
                const canMove = motionEnabled && hasScrollTiming && motionPreference?.matches !== true;
                const rows = measureOverflowRows(root, canMove, browser);

                const progress = getCurrentScrollProgress(frameTime);
                rows.forEach(({ viewport, content, overflows, travel, direction }) => {
                    if (!overflows) return;
                    if (travel <= SCROLL_OVERFLOW_THRESHOLD_PX) {
                        viewport.classList.remove("is-vinyl-lyric-overflowing");
                        return;
                    }

                    scrollEntriesRef.current.set(content, { travel, direction });
                    content.style.transform = getScrollTransform(
                        travel,
                        direction,
                        progress
                    );
                });
                appliedProgressRef.current = progress;
                wakeLiveScrollRef.current?.();
            };

            const scheduleMeasure = () => {
                if (disposed || measureFrame !== null) return;
                measureFrame = browser.requestAnimationFrame(measure);
            };

            scheduleMeasure();

            if (typeof browser.ResizeObserver === "function") {
                resizeObserver = new browser.ResizeObserver(scheduleMeasure);
                resizeObserver.observe(root);
            } else {
                browser.addEventListener("resize", scheduleMeasure);
            }

            if (typeof browser.MutationObserver === "function") {
                mutationObserver = new browser.MutationObserver(scheduleMeasure);
                mutationObserver.observe(root, { childList: true, characterData: true, subtree: true });
            }

            motionPreference?.addEventListener?.("change", scheduleMeasure);
            fonts?.ready?.then(scheduleMeasure).catch(() => undefined);
            fonts?.addEventListener?.("loadingdone", scheduleMeasure);

            return () => {
                disposed = true;
                if (measureFrame !== null) browser.cancelAnimationFrame(measureFrame);
                clearScrollEntries();
                resizeObserver?.disconnect();
                mutationObserver?.disconnect();
                if (!resizeObserver) browser.removeEventListener("resize", scheduleMeasure);
                motionPreference?.removeEventListener?.("change", scheduleMeasure);
                fonts?.removeEventListener?.("loadingdone", scheduleMeasure);
            };
        }, [rootRef, resetKey, motionEnabled, hasScrollTiming]);

        // The traverse is a continuous slide, so it follows the playback clock
        // on every display frame instead of the state cadence. The loop rests
        // during both holds and while paused; the next commit wakes it.
        useLayoutEffect(() => {
            if (!liveClock || !motionEnabled || !hasScrollTiming) {
                wakeLiveScrollRef.current = null;
                return undefined;
            }
            let frameId = null;
            let quietFrames = 0;
            let disposed = false;
            const tick = (frameTime) => {
                frameId = null;
                if (disposed) return;
                const progress = getCurrentScrollProgress(frameTime);
                if (scrollEntriesRef.current.size > 0 && appliedProgressRef.current !== progress) {
                    applyScrollProgress(progress);
                    quietFrames = 0;
                } else {
                    quietFrames++;
                }
                if (quietFrames < 30) frameId = browser.requestAnimationFrame(tick);
            };
            const wake = () => {
                quietFrames = 0;
                // Rows that fit have nothing to slide; measurement wakes the
                // loop again once a row overflows.
                if (!disposed && frameId === null && scrollEntriesRef.current.size > 0) {
                    frameId = browser.requestAnimationFrame(tick);
                }
            };
            wakeLiveScrollRef.current = wake;
            wake();
            return () => {
                disposed = true;
                if (wakeLiveScrollRef.current === wake) wakeLiveScrollRef.current = null;
                if (frameId !== null) browser.cancelAnimationFrame(frameId);
            };
        }, [liveClock, motionEnabled, hasScrollTiming, lineStartTime, lineEndTime, resetKey]);

        useLayoutEffect(() => {
            if (wakeLiveScrollRef.current) {
                wakeLiveScrollRef.current();
                return;
            }
            // The start/end holds occupy most of a line's lifetime. Geometry
            // measurements apply their own current transform after a resize.
            applyScrollProgress(getCurrentScrollProgress());
        }, [position, lineStartTime, lineEndTime, motionEnabled]);
    }
}
