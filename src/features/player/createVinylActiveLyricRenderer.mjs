import { createVinylLyricAutoScroll } from "./vinylLyricAutoScroll.mjs";

export function createVinylActiveLyricRenderer({
    react, primitives, browser, getFonts, getVisualSettings, isFuriganaReady, getLyricsLocale,
    getFramePosition = primitives?.getFrameAlignedLyricsPlaybackPosition,
}) {
    if (!primitives) {
        console.warn("[VinylActiveLyricRenderer] Lyrics renderer primitives are unavailable.");
        return null;
    }

    const useOverflowAutoScroll = createVinylLyricAutoScroll({ react, browser, getFonts });
    const { useMemo, useRef } = react;
    const {
        LyricsLineBlock,
        IdlingIndicator,
        useLyricsPlaybackPosition,
        useKaraokeLiveClock = () => null,
        getPseudoKaraokeRenderAdvance,
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
        trackUri,
        activeLineIndex = 0,
        isKara = false,
        karaokeSource = null,
        karaokeRenderGranularity = null,
        settingsRevision = 0,
        positionOverride = null,
        motionEnabled = true,
        durationMs = 0,
        singleLineScroll = true,
    }) => {
        const rootRef = useRef(null);
        const playbackPosition = useLyricsPlaybackPosition(trackUri || undefined);
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
            getPosition: (frameTime) => getFramePosition?.(frameTime)
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
        const visualSettings = getVisualSettings();
        const lyricsDisplayMode = visualSettings?.["translate:display-mode"];
        const furiganaEnabled = !!visualSettings?.["furigana-enabled"];
        const furiganaReady = isFuriganaReady();
        const lyricsLocale = getLyricsLocale();
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

        const rootProps = {
            className: `ivlyrics-active-lyric-renderer${isKara ? " is-karaoke" : ""}`,
            ref: rootRef,
        };
        if (isLeadingPrelude) {
            return react.createElement(
                "div",
                rootProps,
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
            rootProps,
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
                karaokeRenderGranularity,
                line: displayLine,
                position: trailingInterludeLine || !isKara ? 0 : renderPosition,
                ...(liveClock && !trailingInterludeLine ? { liveClock } : {}),
                isActive: isKara && !trailingInterludeLine,
                isCurrentLine: true,
                settingsRevision,
                singleLineScroll,
            })
        );
    });
}
