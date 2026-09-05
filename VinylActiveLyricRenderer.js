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
        lineEndTime
    ) => {
        const scrollEntriesRef = useRef(new Map());
        const progressRef = useRef(0);
        progressRef.current = getLineScrollProgress(position, lineStartTime, lineEndTime);

        useLayoutEffect(() => {
            const root = rootRef.current;
            if (!root) return undefined;

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
                });
                scrollEntriesRef.current.clear();
            };

            const measure = () => {
                measureFrame = null;
                if (disposed || !root.isConnected) return;

                clearScrollEntries();
                const canMove = motionEnabled && motionPreference?.matches !== true;
                const viewports = root.querySelectorAll(".ivlyrics-vinyl-lyric-scroll-viewport");

                viewports.forEach((viewport) => {
                    const content = viewport.querySelector(":scope > .ivlyrics-vinyl-lyric-scroll-content");
                    viewport.classList.remove("is-vinyl-lyric-overflowing");
                    if (!content) return;

                    const viewportWidth = viewport.clientWidth;
                    const naturalContentWidth = Math.max(
                        content.scrollWidth,
                        content.getBoundingClientRect().width
                    );
                    const naturalTravel = naturalContentWidth - viewportWidth;

                    if (viewportWidth <= 0 || naturalTravel <= SCROLL_OVERFLOW_THRESHOLD_PX) {
                        return;
                    }

                    viewport.classList.add("is-vinyl-lyric-overflowing");
                    const paddedContentWidth = Math.max(
                        content.scrollWidth,
                        content.getBoundingClientRect().width
                    );
                    const travel = Math.max(0, Math.ceil(paddedContentWidth - viewportWidth));

                    if (travel <= SCROLL_OVERFLOW_THRESHOLD_PX) {
                        return;
                    }

                    const direction = window.getComputedStyle(viewport).direction === "rtl" ? "rtl" : "ltr";
                    scrollEntriesRef.current.set(content, { travel, direction, canMove });
                    content.style.transform = getScrollTransform(
                        travel,
                        direction,
                        canMove ? progressRef.current : 0
                    );
                });
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
        }, [rootRef, resetKey, motionEnabled]);

        useLayoutEffect(() => {
            scrollEntriesRef.current.forEach(({ travel, direction, canMove }, content) => {
                content.style.transform = getScrollTransform(
                    travel,
                    direction,
                    canMove ? progressRef.current : 0
                );
            });
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
        const position = positionOverride !== null
            && positionOverride !== undefined
            && Number.isFinite(numericPositionOverride)
            ? numericPositionOverride
            : playbackPosition;
        const renderPosition = isKara
            ? position + getPseudoKaraokeRenderAdvance(karaokeSource)
            : position;
        const safeLineIndex = Math.min(
            Math.max(Number(activeLineIndex) || 0, 0),
            Math.max(lyrics.length - 1, 0)
        );
        const sourceLine = Array.isArray(lyrics) ? lyrics[safeLineIndex] : null;
        const scrollResetKey = `${safeLineIndex}:${sourceLine?.startTime || 0}:${isKara ? 1 : 0}:${settingsRevision}`;
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
            motionEnabled,
            position,
            lineStartTime,
            lineEndTime
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
                })
            );
        }

        if (!sourceLine) return null;

        const sourceInterludeInfo = getInterludeInfo(
            sourceLine,
            lyrics[safeLineIndex + 1],
            safeLineIndex,
            lyrics.length
        );
        const preparedSourceLine = sourceInterludeInfo.isInterlude
            ? { ...sourceLine, interludeInfo: sourceInterludeInfo }
            : sourceLine;
        const trailingInterludeLine = isKara
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
        const { text, originalText, text2 } = getEmbeddedAuxiliaryDisplayValues(displayLine);
        const { mainText, subText, subText2, hasSubLine } = buildLyricDisplayState(
            isKara,
            displayLine,
            text,
            originalText,
            text2
        );
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
                className: lineClassName,
                style: getKaraokeSpeakerStyle(
                    displayLine?.speaker,
                    displayLine?.["speaker-color"],
                    displayLine?.["speaker-fallback"]
                ),
                dir: "auto",
                mainText,
                subText,
                subText2,
                originalText,
                isKara,
                line: displayLine,
                position: trailingInterludeLine || !isKara ? 0 : renderPosition,
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
