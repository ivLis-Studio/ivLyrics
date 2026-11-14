// LP mode active lyric surface.
//
// Kept separate from Pages.js so fullscreen vinyl presentation can evolve
// independently while still using the regular renderer's proven primitives.
const VinylActiveLyricRenderer = (() => {
    const react = Spicetify.React;
    const { useLayoutEffect, useMemo, useRef } = react;
    const primitives = window.ivLyricsLyricRendererPrimitives;

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

    const useOverflowAutoScroll = (
        rootRef,
        resetKey,
        motionEnabled,
        position,
        lineStartTime,
        lineEndTime,
        liveClock = null
    ) => {
        // Lazily created; this hook renders with every playback position update.
        const scrollEntriesRef = useRef(null);
        scrollEntriesRef.current ??= new Map();
        const scrollTimingRef = useRef(null);
        const appliedProgressRef = useRef(null);
        const wakeLiveScrollRef = useRef(null);
        const hasScrollTiming = Number.isFinite(lineStartTime)
            && Number.isFinite(lineEndTime)
            && lineEndTime > lineStartTime;
        scrollTimingRef.current = { position, lineStartTime, lineEndTime, liveClock };

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

            const motionPreference = typeof window.matchMedia === "function"
                ? window.matchMedia("(prefers-reduced-motion: reduce)")
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
                    row.direction = window.getComputedStyle(viewport).direction === "rtl" ? "rtl" : "ltr";
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
                measureFrame = window.requestAnimationFrame(measure);
            };

            scheduleMeasure();

            if (typeof window.ResizeObserver === "function") {
                resizeObserver = new window.ResizeObserver(scheduleMeasure);
                resizeObserver.observe(root);
            } else {
                window.addEventListener("resize", scheduleMeasure);
            }

            if (typeof window.MutationObserver === "function") {
                mutationObserver = new window.MutationObserver(scheduleMeasure);
                mutationObserver.observe(root, { childList: true, characterData: true, subtree: true });
            }

            motionPreference?.addEventListener?.("change", scheduleMeasure);
            document.fonts?.ready?.then(scheduleMeasure).catch(() => undefined);
            document.fonts?.addEventListener?.("loadingdone", scheduleMeasure);

            return () => {
                disposed = true;
                if (measureFrame !== null) window.cancelAnimationFrame(measureFrame);
                clearScrollEntries();
                resizeObserver?.disconnect();
                mutationObserver?.disconnect();
                if (!resizeObserver) window.removeEventListener("resize", scheduleMeasure);
                motionPreference?.removeEventListener?.("change", scheduleMeasure);
                document.fonts?.removeEventListener?.("loadingdone", scheduleMeasure);
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
                if (quietFrames < 30) frameId = window.requestAnimationFrame(tick);
            };
            const wake = () => {
                quietFrames = 0;
                // Rows that fit have nothing to slide; measurement wakes the
                // loop again once a row overflows.
                if (!disposed && frameId === null && scrollEntriesRef.current.size > 0) {
                    frameId = window.requestAnimationFrame(tick);
                }
            };
            wakeLiveScrollRef.current = wake;
            wake();
            return () => {
                disposed = true;
                if (wakeLiveScrollRef.current === wake) wakeLiveScrollRef.current = null;
                if (frameId !== null) window.cancelAnimationFrame(frameId);
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
    };

    if (!primitives) {
        console.warn("[VinylActiveLyricRenderer] Lyrics renderer primitives are unavailable.");
        return null;
    }

    const {
        LyricsLineBlock,
        IdlingIndicator,
        useLyricsPlaybackPosition,
        useKaraokeLiveClock = () => null,
        getPseudoKaraokeRenderAdvance,
        prepareGlobalCharTimeline,
        queryGlobalCharTimeline,
        EMPTY_GLOBAL_CHAR_STATE,
        getInterludeInfo,
        createActiveTrailingKaraokeInterludeLine,
        getEmbeddedAuxiliaryDisplayValues,
        buildLyricDisplayState,
        getKaraokeLineMetaClass,
        getKaraokeSpeakerStyle,
        getInterludeHandoffState = () => ({ isDeparting: false, fadeDurationMs: null }),
        isInterludeMotionEnabled = () => true,
    } = primitives;

    return react.memo(({
        lyrics = [],
        activeLineIndex = 0,
        isKara = false,
        karaokeSource = null,
        settingsRevision = 0,
        positionOverride = null,
        motionEnabled = true,
        durationMs = 0,
        singleLineScroll = true,
    }) => {
        const rootRef = useRef(null);
        const playbackPosition = useLyricsPlaybackPosition();
        const numericPositionOverride = Number(positionOverride);
        const hasPositionOverride = positionOverride !== null
            && positionOverride !== undefined
            && Number.isFinite(numericPositionOverride);
        const position = hasPositionOverride ? numericPositionOverride : playbackPosition;
        const renderAdvance = isKara ? getPseudoKaraokeRenderAdvance(karaokeSource) : 0;
        const renderPosition = position + renderAdvance;
        // Glyph fill and bounce follow the playback clock on every display
        // frame, exactly as on the lyrics page. A fixed position override
        // renders statically.
        const liveClock = useKaraokeLiveClock(isKara && !hasPositionOverride, renderAdvance);
        const playbackPositionRef = useRef(playbackPosition);
        playbackPositionRef.current = playbackPosition;
        // The overflow slide uses the line's own clock (no render advance).
        const scrollClock = useMemo(() => hasPositionOverride ? null : {
            getPosition: (frameTime) => window.ivLyricsLyricRendererPrimitives?.getFrameAlignedLyricsPlaybackPosition?.(frameTime)
                ?? playbackPositionRef.current,
        }, [hasPositionOverride]);
        const safeLineIndex = Math.min(
            Math.max(Number(activeLineIndex) || 0, 0),
            Math.max(lyrics.length - 1, 0)
        );
        const sourceLine = Array.isArray(lyrics) ? lyrics[safeLineIndex] : null;
        const scrollResetKey = `${safeLineIndex}:${sourceLine?.startTime || 0}:${!!sourceLine}:${isKara ? 1 : 0}:${settingsRevision}`;
        const lineStartTime = Number(sourceLine?.startTime) || 0;
        const directLineEndTime = Number(sourceLine?.endTime);
        const nextLineStartTime = Number(lyrics[safeLineIndex + 1]?.startTime);
        const trackDuration = Number(durationMs);
        const lineEndTime = Number.isFinite(directLineEndTime) && directLineEndTime > lineStartTime
            ? directLineEndTime
            : (Number.isFinite(nextLineStartTime) && nextLineStartTime > lineStartTime
                ? nextLineStartTime
                : (Number.isFinite(trackDuration) && trackDuration > lineStartTime
                    ? trackDuration
                    : lineStartTime));
        useOverflowAutoScroll(
            rootRef,
            scrollResetKey,
            motionEnabled && singleLineScroll,
            position,
            lineStartTime,
            lineEndTime,
            scrollClock
        );
        const globalCharTimeline = useMemo(
            () => isKara && Array.isArray(lyrics) ? prepareGlobalCharTimeline(lyrics) : null,
            [lyrics, isKara]
        );
        const { globalCharOffsets, activeGlobalCharIndex } = useMemo(
            () => globalCharTimeline
                ? queryGlobalCharTimeline(globalCharTimeline, renderPosition)
                : EMPTY_GLOBAL_CHAR_STATE,
            [globalCharTimeline, renderPosition]
        );

        const firstLyricStartTime = Number(lyrics?.[0]?.startTime) || 1;
        const isLeadingPrelude = renderPosition < firstLyricStartTime;
        const sourceInterludeInfo = useMemo(() => sourceLine ? getInterludeInfo(
            sourceLine,
            lyrics[safeLineIndex + 1],
            safeLineIndex,
            lyrics.length
        ) : { isInterlude: false }, [sourceLine, lyrics, safeLineIndex, settingsRevision, durationMs]);
        const preparedSourceLine = useMemo(() => sourceInterludeInfo.isInterlude
            ? { ...sourceLine, interludeInfo: sourceInterludeInfo }
            : sourceLine, [sourceLine, sourceInterludeInfo]);
        const trailingInterludeLine = isKara && sourceLine && !isLeadingPrelude
            ? createActiveTrailingKaraokeInterludeLine({
                line: preparedSourceLine,
                nextLine: lyrics[safeLineIndex + 1],
                lineIndex: safeLineIndex,
                lineCount: lyrics.length,
                position: renderPosition,
                isActiveLine: true,
                isKara,
            })
            : null;
        const displayLine = trailingInterludeLine || preparedSourceLine;
        const isInstrumental = isLeadingPrelude || !!displayLine?.interludeInfo?.isInterlude;
        const handoffNextStart = isLeadingPrelude ? firstLyricStartTime
            : (isInstrumental && displayLine?.interludeInfo?.kind !== "postlude" ? nextLineStartTime : null);
        const handoffStart = isLeadingPrelude ? 0 : displayLine?.startTime;
        const handoff = getInterludeHandoffState({
            position: renderPosition, startTime: handoffStart,
            nextStartTime: handoffNextStart,
            enabled: isInstrumental && motionEnabled && isInterludeMotionEnabled(isKara),
        });
        const fadeDurationMs = useMemo(() => handoff.fadeDurationMs,
            [handoff.isDeparting, handoffStart, handoffNextStart, settingsRevision]);
        const handoffClass = handoff.isDeparting ? " lyrics-interlude-departing" : "";
        const visualSettings = typeof CONFIG !== "undefined" ? CONFIG?.visual : window.CONFIG?.visual;
        const lyricsDisplayMode = visualSettings?.["translate:display-mode"];
        const furiganaEnabled = !!visualSettings?.["furigana-enabled"];
        const furiganaReady = window.FuriganaConverter?.isAvailable?.() === true;
        const lyricsLocale = String(window.Utils?.getDetectedLanguage?.() || "auto");
        // Text/supplement preparation is stable between playback ticks. Keep
        // the same invalidation inputs as the shared page renderer, including
        // late furigana readiness and language detection results.
        const displayState = useMemo(() => {
            if (!displayLine) return null;
            const { text, originalText, text2 } = getEmbeddedAuxiliaryDisplayValues(displayLine);
            return {
                ...buildLyricDisplayState(isKara, displayLine, text, originalText, text2),
                originalText,
            };
        }, [displayLine, isKara, settingsRevision, lyricsDisplayMode, furiganaEnabled, furiganaReady, lyricsLocale]);

        if (isLeadingPrelude) {
            return react.createElement(
                "div",
                {
                    className: `ivlyrics-active-lyric-renderer${isKara ? " is-karaoke" : ""}`,
                    ref: rootRef,
                },
                react.createElement(IdlingIndicator, {
                    isActive: true,
                    delay: firstLyricStartTime / 3,
                    durationMs: firstLyricStartTime,
                    settingsRevision,
                    detailClassName: handoffClass,
                    fadeDurationMs,
                })
            );
        }

        if (!sourceLine) return null;
        const { mainText, subText, subText2, hasSubLine, originalText } = displayState;
        const lineClassName = [
            "lyrics-lyricsContainer-LyricsLine",
            "lyrics-lyricsContainer-LyricsLine-active",
            getKaraokeLineMetaClass(displayLine),
            hasSubLine ? "lyrics-lyricsContainer-LyricsLine-hasSubLine" : "",
        ].filter(Boolean).join(" ");

        return react.createElement(
            "div",
            {
                className: `ivlyrics-active-lyric-renderer${isKara ? " is-karaoke" : ""}`,
                ref: rootRef,
            },
            react.createElement(LyricsLineBlock, {
                key: `active-lyric-${safeLineIndex}-${displayLine?.startTime || 0}`,
                className: lineClassName + handoffClass,
                style: { ...getKaraokeSpeakerStyle(
                    displayLine?.speaker,
                    displayLine?.["speaker-color"],
                    displayLine?.["speaker-fallback"]
                ), ...(handoff.isDeparting ? { "--lyrics-interlude-fade-duration": `${fadeDurationMs}ms` } : {}) },
                dir: "auto",
                mainText,
                subText,
                subText2,
                originalText,
                isKara,
                line: displayLine,
                position: trailingInterludeLine || !isKara ? 0 : renderPosition,
                ...(liveClock && !trailingInterludeLine ? { liveClock } : {}),
                isActive: isKara && !trailingInterludeLine,
                isCurrentLine: true,
                settingsRevision,
                globalCharOffset: globalCharOffsets[safeLineIndex] || 0,
                activeGlobalCharIndex: isKara && !trailingInterludeLine
                    ? activeGlobalCharIndex
                    : -1,
                singleLineScroll,
            })
        );
    });
})();

if (VinylActiveLyricRenderer) {
    window.ivLyricsActiveLyricLineRenderer = VinylActiveLyricRenderer;
}
