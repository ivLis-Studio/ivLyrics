import {
    buildSyncedPlaybackBoundaries, getSyncedPlaybackBoundaryIndex, prepareSyncedLineStartIndex,
    getActiveTimedLineIndex, getPrecenteredTimedLineIndex, getSyncedLeadingEmptyLineCount, getSyncedLinePlaybackState,
} from "./lyricPlaybackTimeline.mjs";
import { createCompactLyricsLineController } from "./lyricsCompactLineController.mjs";
import { createCompactLyricsDisplay } from "./compactLyricsDisplay.mjs";
import { createSyncedLyricRowStyleReader } from "./syncedLyricRowStyles.mjs";
import { getLyricsLineMotionPlan, getLyricsLineMotionStyle, LYRICS_CENTERING_LEAD_MS } from "./lyricsLineMotion.mjs";

const SPEAKER_CLASS_CONTRACT = Symbol.for("ivLyrics.speakerColors.classNameContract");

export function createSyncedLyricsEngine({
    react, getVisualSettings, getPlayer, getSpeakerColors, getCurrentTrackDurationMs,
    supportsLineAnimation, isElement, readTransform, readTimelineTime, scheduleUpdate,
    useScrollActivity, usePreparedSyncedLyrics, useLyricIndexNotification, useSyncedLyricsViewport,
    syncedManualScrollReturns, compactLyricsLineMotion, prefersReducedLyricsMotion,
    buildPaddedSyncedLyrics,
    buildSyncedLinePlaybackWindows,
    isAutoInstrumentalBreakEnabled, buildKaraokeCumulativeEndTimes,
    getTrailingKaraokeInterludeInfo, createActiveTrailingKaraokeInterludeLine, getInterludeHandoffState,
    getKaraokeSpeakerStyle, getKaraokeLineMetaClass, getLyricsLineDetailClass,
    shouldHideSyncedLine, prepareLiveSyncedRenderItems, advanceLiveSyncedRenderItems,
}) {
    const { useEffect, useMemo, useRef } = react;
    const useSyncedLayoutEffect = react.useLayoutEffect || useEffect;

    return function useSyncedLyricsEngine({
        lyrics,
        position,
        compact = false,
        isKara = false,
        containerRef,
        container,
        activeLineRef,
        lyricsId,
        settingsRevision = 0,
        anchorRevision = 0,
    }) {
        const leadingEmptyLines = getSyncedLeadingEmptyLineCount(compact);
        const { isScrolling, handleContainerClick } = useScrollActivity({
            container, lyricsId, preserveLayout: compact,
            settingsRevision: compact ? settingsRevision : undefined,
        });

        // Freeze only the layout clock while browsing; glyph fill keeps using position.
        const layoutPositionRef = useRef(position);
        const manualReturn = containerRef.current && syncedManualScrollReturns.get(containerRef.current);
        const returningToSelection = Number.isFinite(manualReturn?.seekTime)
            && Date.now() < manualReturn.expiresAt && Math.abs(position - manualReturn.seekTime) > 1000;
        if (!compact || !isScrolling) layoutPositionRef.current = returningToSelection ? manualReturn.seekTime : position;
        const layoutPosition = layoutPositionRef.current;
        const preparedLyrics = usePreparedSyncedLyrics(lyrics, isKara, lyricsId);

        const trackDuration = getCurrentTrackDurationMs();
        // Presentation metadata belongs to the lyric/settings revision, not the
        // playback clock. Keep scroll styles stable so an unchanged row can retain
        // its memoized text and karaoke children while another row is singing.
        const speakerColors = getSpeakerColors();
        const creatorSpeakerColorsEnabled = speakerColors?.isCreatorColorEnabled?.()
            ?? (getVisualSettings()["sync-data-custom-speaker-colors-enabled"] !== false);
        const configuredCreatorSpeakerColorsEnabled = getVisualSettings()["sync-data-custom-speaker-colors-enabled"] !== false;
        const textEffectsEnabled = getVisualSettings()["karaoke-text-effects"] !== false;
        const reducedMotion = prefersReducedLyricsMotion();
        const getLinePresentation = useMemo(() => {
            const cache = new WeakMap();
            return (line) => {
                let presentation = cache.get(line);
                if (!presentation) {
                    const speakerStyle = getKaraokeSpeakerStyle(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']);
                    presentation = {
                        metaClass: getKaraokeLineMetaClass(line),
                        speakerStyle,
                    };
                    cache.set(line, presentation);
                }
                return presentation;
            };
        }, [
            settingsRevision, speakerColors,
            speakerColors?.getPresentation, speakerColors?.isCreatorColorEnabled,
            speakerColors?.[SPEAKER_CLASS_CONTRACT],
            speakerColors?.[SPEAKER_CLASS_CONTRACT]?.getClassName,
            creatorSpeakerColorsEnabled, configuredCreatorSpeakerColorsEnabled, textEffectsEnabled, reducedMotion,
        ]);

        const paddedLineCache = useMemo(() => new WeakMap(), [lyricsId, leadingEmptyLines]);
        const paddedLyrics = useMemo(
            () => buildPaddedSyncedLyrics(preparedLyrics, leadingEmptyLines, paddedLineCache),
            [preparedLyrics, leadingEmptyLines, paddedLineCache]
        );
        const compactDisplayLineCache = useMemo(() => new WeakMap(), [lyricsId]);
        const readCompactDisplay = useMemo(
            () => compact ? createCompactLyricsDisplay(paddedLyrics, compactDisplayLineCache) : null,
            [compact, paddedLyrics, compactDisplayLineCache],
        );
        const playbackWindows = useMemo(
            () => buildSyncedLinePlaybackWindows(paddedLyrics, isKara),
            [paddedLyrics, isKara]
        );
        const playbackBoundaries = useMemo(() => isKara ? buildSyncedPlaybackBoundaries(playbackWindows) : [],
            [playbackWindows, isKara]);
        const lineStartIndex = useMemo(() => prepareSyncedLineStartIndex(paddedLyrics), [paddedLyrics]);

        const layoutActiveLineIndex = useMemo(
            () => getActiveTimedLineIndex(paddedLyrics, layoutPosition, lineStartIndex),
            [paddedLyrics, layoutPosition, lineStartIndex]
        );
        const activeLineIndex = useMemo(
            () => getActiveTimedLineIndex(paddedLyrics, position, lineStartIndex),
            [paddedLyrics, position, lineStartIndex]
        );
        const shouldPrecenterKaraokeTransitions = isKara
            && (compact || !isScrolling)
            && getVisualSettings()["karaoke-line-transition"]
            && !prefersReducedLyricsMotion();
        const usesScriptedCompactLineShift = compact && !isScrolling
            && (!isKara || getVisualSettings()["karaoke-line-transition"])
            && !prefersReducedLyricsMotion()
            && supportsLineAnimation();
        const visualLineIndex = useMemo(() => {
            return shouldPrecenterKaraokeTransitions
                ? getPrecenteredTimedLineIndex(
                    paddedLyrics,
                    layoutPosition,
                    layoutActiveLineIndex,
                    LYRICS_CENTERING_LEAD_MS,
                    lineStartIndex
                )
                : layoutActiveLineIndex;
        }, [paddedLyrics, layoutPosition, layoutActiveLineIndex, shouldPrecenterKaraokeTransitions, settingsRevision, lineStartIndex]);

        const display = readCompactDisplay?.(layoutActiveLineIndex, visualLineIndex);
        // Keep rows mounted for the pre-center hand-off. Only the set of visible
        // instrumental rows changes the numbering used by the compact layout.
        const linesToRender = display?.rows ?? paddedLyrics;
        const lastDisplayIndex = Math.max(0, linesToRender.length - 1);
        const activeDisplayLineIndex = display
            ? display.indexByLineNumber.get(layoutActiveLineIndex) ?? Math.min(layoutActiveLineIndex, lastDisplayIndex)
            : layoutActiveLineIndex;
        const visualDisplayLineIndex = display
            ? display.indexByLineNumber.get(visualLineIndex) ?? Math.min(visualLineIndex, lastDisplayIndex)
            : visualLineIndex;

        const linesBefore = getVisualSettings()["lines-before"];
        const compactWindowStartIndex = useMemo(() => {
            if (!compact) {
                return 0;
            }

            return Math.max(visualDisplayLineIndex - linesBefore, 0);
        }, [compact, visualDisplayLineIndex, linesBefore]);

        const visualAnchorLineNumber = visualLineIndex;

        const cumulativeVocalEndTimes = useMemo(
            () => isKara ? buildKaraokeCumulativeEndTimes(preparedLyrics) : [],
            [preparedLyrics, isKara]
        );
        const activeSourceLineIndex = layoutActiveLineIndex - leadingEmptyLines;
        const autoDetectInterludes = isKara && isAutoInstrumentalBreakEnabled();
        const trailingInterludeInfo = useMemo(() => {
            if (!isKara || activeSourceLineIndex < 0
                || preparedLyrics[activeSourceLineIndex]?.interludeInfo?.isInterlude) {
                return null;
            }
            return getTrailingKaraokeInterludeInfo(
                preparedLyrics[activeSourceLineIndex],
                preparedLyrics[activeSourceLineIndex + 1],
                activeSourceLineIndex,
                preparedLyrics.length,
                cumulativeVocalEndTimes[activeSourceLineIndex]
            );
        }, [activeSourceLineIndex, preparedLyrics, isKara, cumulativeVocalEndTimes, autoDetectInterludes, trackDuration, settingsRevision]);
        // Only the preview/active boundary changes this virtual line's contents.
        // Reusing it through the silence lets the memoized indicator ignore the clock.
        const trailingInterludePhase = trailingInterludeInfo?.isInterlude
            && layoutPosition >= trailingInterludeInfo.startTime - (shouldPrecenterKaraokeTransitions ? LYRICS_CENTERING_LEAD_MS : 0)
            && (trailingInterludeInfo.kind === "postlude" || layoutPosition < trailingInterludeInfo.endTime)
            ? (layoutPosition < trailingInterludeInfo.startTime ? "preview" : "active")
            : null;
        const trailingInterludeLine = useMemo(() => (
            trailingInterludePhase && activeSourceLineIndex >= 0
                ? createActiveTrailingKaraokeInterludeLine({
                    line: preparedLyrics[activeSourceLineIndex],
                    nextLine: preparedLyrics[activeSourceLineIndex + 1],
                    lineIndex: activeSourceLineIndex,
                    lineCount: preparedLyrics.length,
                    precedingFillEndTime: cumulativeVocalEndTimes[activeSourceLineIndex],
                    preparedInterludeInfo: trailingInterludeInfo,
                    position: trailingInterludeInfo.startTime - (trailingInterludePhase === "preview" ? LYRICS_CENTERING_LEAD_MS : 0),
                    isActiveLine: true,
                    isKara,
                    activationAdvanceMs: shouldPrecenterKaraokeTransitions
                        ? LYRICS_CENTERING_LEAD_MS
                        : 0,
                })
                : null
        ), [activeSourceLineIndex, preparedLyrics, trailingInterludePhase, isKara, shouldPrecenterKaraokeTransitions, cumulativeVocalEndTimes, trailingInterludeInfo]);
        const isTrailingInterludeActive = !!trailingInterludeLine
            && trailingInterludeLine.isPrecentered !== true;
        const trailingInterludeKey = trailingInterludeLine
            ? `${trailingInterludeLine.startTime}:${trailingInterludeLine.endTime}:${isTrailingInterludeActive ? "active" : "preview"}`
            : "";
        const visualAnchorUsesTrailingInterlude = !!trailingInterludeLine
            && visualLineIndex === layoutActiveLineIndex;

        useLyricIndexNotification(activeLineIndex, leadingEmptyLines, lyrics.length, lyricsId);
        const { compactOffset, suppressLayoutShiftAnimation } = useSyncedLyricsViewport({
            compact, isScrolling, preparedLyrics, visualLineIndex, trailingInterludeKey,
            containerRef, container, activeLineRef, lyricsId, settingsRevision, anchorRevision,
        });
        const lyricMotionDetailsEnabled = (compact || !isScrolling) && (!suppressLayoutShiftAnimation || usesScriptedCompactLineShift)
            && (!isKara || getVisualSettings()["karaoke-line-transition"])
            && !prefersReducedLyricsMotion();
        const activeInterlude = trailingInterludeLine
            || (paddedLyrics[layoutActiveLineIndex]?.interludeInfo?.isInterlude ? paddedLyrics[layoutActiveLineIndex] : null);
        const interludeNextStart = activeInterlude ? paddedLyrics[layoutActiveLineIndex + 1]?.startTime : null;
        const interludeHandoffLead = activeInterlude && Number.isFinite(interludeNextStart)
            ? Math.min(LYRICS_CENTERING_LEAD_MS, Math.max(0, interludeNextStart - activeInterlude.startTime) / 2)
            : 0;
        // Normal sync stays cached between boundaries. Only this boolean changes
        // near an instrumental hand-off; the continuous clock is not a dependency.
        const isInterludeHandoff = lyricMotionDetailsEnabled && interludeHandoffLead > 0
            && layoutPosition >= interludeNextStart - interludeHandoffLead && layoutPosition < interludeNextStart;
        // Freeze the duration on entry; continuous playback must not recreate static
        // row props or restart CSS transitions on every clock update.
        const interludeFadeDurationMs = useMemo(() => getInterludeHandoffState({
            position: layoutPosition, startTime: activeInterlude?.startTime,
            nextStartTime: interludeNextStart, enabled: isInterludeHandoff,
        }).fadeDurationMs, [isInterludeHandoff, activeInterlude?.startTime, interludeNextStart]);
        const trailingInterludeStyle = useMemo(() => {
            if (!trailingInterludeLine) return null;
            const animationIndex = visualAnchorUsesTrailingInterlude ? 0 : -1;
            return {
                cursor: "default",
                "--position-index": animationIndex,
                "--animation-index": Math.abs(animationIndex) + 1,
                "--line-shift-duration": isScrolling || suppressLayoutShiftAnimation || usesScriptedCompactLineShift
                    ? "0s"
                    : "var(--iv-lyrics-centering-duration, 300ms)",
                "--line-shift-delay": "0s",
                "--blur-index": 0,
                "--offset": `${compactOffset}px`,
                ...(isInterludeHandoff ? { "--lyrics-interlude-fade-duration": `${interludeFadeDurationMs}ms` } : {}),
            };
        }, [trailingInterludeLine, visualAnchorUsesTrailingInterlude, isScrolling, suppressLayoutShiftAnimation, usesScriptedCompactLineShift, isInterludeHandoff, interludeFadeDurationMs, compactOffset]);
        const compactLineControllerRef = useRef(null);
        const compactLineController = compactLineControllerRef.current ??= createCompactLyricsLineController({
            motion: compactLyricsLineMotion,
            manualReturns: syncedManualScrollReturns,
            isElement, readTransform, readTimelineTime, scheduleUpdate,
        });
        const compactLinePlaybackPositionRef = useRef(position);
        compactLinePlaybackPositionRef.current = position;
        // Rows receive their travel timing in the commit that changes their class
        // and blur index; the scheduled WAAPI shift reads it back from each row.
        // Color, opacity and blur keep their own CSS transitions.
        // Keyed by the transition, not the clock: the window is measured once, when
        // the line changes, so row styles stay stable between boundaries.
        const lineMotionPlan = useMemo(() => usesScriptedCompactLineShift ? getLyricsLineMotionPlan({
            previousContext: compactLineController.readContext(),
            visualLineIndex,
            settingsRevision,
            nextLineStart: paddedLyrics[visualLineIndex + 1]?.startTime,
            leadMs: shouldPrecenterKaraokeTransitions ? LYRICS_CENTERING_LEAD_MS : 0,
            position,
            manualReturn: syncedManualScrollReturns.get(containerRef.current),
        }) : null, [usesScriptedCompactLineShift, visualLineIndex, settingsRevision, lyricsId]);
        const trailingInterludeLineStyle = useMemo(() => trailingInterludeStyle && lineMotionPlan
            ? { ...trailingInterludeStyle, ...getLyricsLineMotionStyle(trailingInterludeStyle["--position-index"], lineMotionPlan) }
            : trailingInterludeStyle, [trailingInterludeStyle, lineMotionPlan]);

        useEffect(() => {
            const player = getPlayer();
            const resetLineMotion = () => compactLineController.resetAfterSeek(containerRef.current);
            player?.addEventListener?.("onseek", resetLineMotion);
            return () => player?.removeEventListener?.("onseek", resetLineMotion);
        }, [lyricsId]);

        // Position-index and anchor-offset commit together. Measure row travel
        // after React has committed the new layout.
        useSyncedLayoutEffect(() => compactLineController.update({
            compact, isScrolling, usesScriptedCompactLineShift, suppressLayoutShiftAnimation,
            visualLineIndex, settingsRevision, lyricsId, trailingInterludeKey, compactOffset,
            readContainer: () => containerRef.current,
            readActiveLine: () => activeLineRef.current,
            nextLineStart: paddedLyrics[visualLineIndex + 1]?.startTime,
            leadMs: shouldPrecenterKaraokeTransitions ? LYRICS_CENTERING_LEAD_MS : 0,
            readPlaybackPosition: () => compactLinePlaybackPositionRef.current,
        }), [
            usesScriptedCompactLineShift, suppressLayoutShiftAnimation, visualLineIndex, isScrolling,
            compactOffset, trailingInterludeKey, container, lyricsId, settingsRevision,
        ]);

        useEffect(() => compactLineController.cancelAnimations, [lyricsId]);
        // Plain line sync changes at line boundaries. Its rows do not consume the
        // continuous playhead; all boundary, display and settings inputs stay live.
        const itemPlaybackInterval = isKara ? getSyncedPlaybackBoundaryIndex(playbackBoundaries, position) : 0;
        const bounceEnabled = getVisualSettings()["karaoke-bounce"] === true;
        const linesAfter = getVisualSettings()["lines-after"];
        const keepPreviousDuringInterlude = getVisualSettings()["instrumental-break-keep-previous"] === true;
        const firstLyricStartTime = lyrics[0]?.startTime || 1;
        const isBeforeFirstLyric = layoutPosition < firstLyricStartTime;
        const isPreludeHandoff = lyricMotionDetailsEnabled && isBeforeFirstLyric
            && layoutPosition >= firstLyricStartTime - Math.min(LYRICS_CENTERING_LEAD_MS, firstLyricStartTime / 2);
        const preludeFadeDurationMs = useMemo(() => getInterludeHandoffState({
            position: layoutPosition, nextStartTime: firstLyricStartTime, enabled: isPreludeHandoff,
        }).fadeDurationMs, [isPreludeHandoff, firstLyricStartTime]);
        const parkedStyles = useMemo(() => new WeakMap(), [lyricsId]);
        const shiftDuration = isScrolling || suppressLayoutShiftAnimation || usesScriptedCompactLineShift
            ? "0s" : "var(--iv-lyrics-centering-duration, 300ms)";
        const trailingInterludeAfter = trailingInterludeLine ? layoutActiveLineIndex : -Infinity;
        // Resolve the style only once the row's visibility is known. Parked rows
        // can keep their cached style without ever computing a live style first.
        const getRowStyle = useMemo(() => createSyncedLyricRowStyleReader({
            compact, isScrolling, visualDisplayLineIndex, visualLineIndex, compactWindowStartIndex,
            linesBefore, linesAfter, trailingInterludeAfter, shiftDuration, offset: `${compactOffset}px`, lineMotionPlan,
            getLinePresentation, parkedStyles,
        }), [
            compact, isScrolling, visualDisplayLineIndex, visualLineIndex, compactWindowStartIndex,
            linesBefore, linesAfter, trailingInterludeAfter, shiftDuration, compactOffset, lineMotionPlan,
            getLinePresentation, parkedStyles,
        ]);
        const preparedRenderItems = useMemo(() => {
            return linesToRender.flatMap((line, visibleIndex) => {
                const {
                    lineNumber = visibleIndex,
                    displayLineNumber = lineNumber,
                    startTime,
                    originalText,
                    mainText,
                    subText,
                    subText2,
                } = line;

                if (compact && lineNumber === 1 && layoutActiveLineIndex <= leadingEmptyLines) {
                    if (isBeforeFirstLyric) {
                        return {
                            type: "indicator",
                            key: `compact-idling-${lineNumber}`,
                            delay: firstLyricStartTime / 3,
                            durationMs: firstLyricStartTime,
                            isActive: true,
                            trackLineRef: lineNumber === visualAnchorLineNumber,
                            detailClassName: getLyricsLineDetailClass(lyricMotionDetailsEnabled, true, false, isPreludeHandoff),
                            ...(isPreludeHandoff ? { fadeDurationMs: preludeFadeDurationMs } : {}),
                            offsetPx: compactOffset,
                        };
                    }
                }

                if (!compact && lineNumber === 0) {
                    const nextStartTime = paddedLyrics[1]?.startTime || 1;
                    return {
                        type: "indicator",
                        key: `expanded-idling-${lineNumber}`,
                        delay: nextStartTime / 3,
                        durationMs: nextStartTime,
                        isActive: layoutActiveLineIndex === 0,
                        trackLineRef: lineNumber === visualAnchorLineNumber,
                        detailClassName: getLyricsLineDetailClass(lyricMotionDetailsEnabled && layoutActiveLineIndex === 0, true, false, isPreludeHandoff),
                        ...(isPreludeHandoff ? { fadeDurationMs: preludeFadeDurationMs } : {}),
                        offsetPx: compactOffset,
                    };
                }

                const isAnchorLine = lineNumber === layoutActiveLineIndex;
                const playbackState = getSyncedLinePlaybackState(playbackWindows[lineNumber], position, bounceEnabled);
                const isHighlightedLine = isKara ? playbackState.isHighlighted : lineNumber === activeLineIndex;
                const isAnimatingLine = isKara ? playbackState.isAnimating : isAnchorLine;
                let visibilityAnimationIndex = compact
                    ? displayLineNumber - activeDisplayLineIndex
                    : lineNumber - layoutActiveLineIndex;
                // An auto-detected gap inserts a virtual marker after the last sung
                // row. Count that row as the first previous lyric, just as a real
                // instrumental row would, including the zero-previous-lines case.
                if (keepPreviousDuringInterlude && isTrailingInterludeActive && lineNumber <= layoutActiveLineIndex) {
                    visibilityAnimationIndex -= 1;
                }
                let className = `lyrics-lyricsContainer-LyricsLine ${getLinePresentation(line).metaClass}`;
                const isCurrentRenderedLine = isHighlightedLine
                    && !(isAnchorLine && isTrailingInterludeActive);
                if (isCurrentRenderedLine) {
                    className += " lyrics-lyricsContainer-LyricsLine-active";
                }
                // Past karaoke rows are styled from this class. A :has(.is-complete)
                // rule on the row restyled every element of the page each time a
                // line finished (about 100 ms on a fast PC, far more on a slow one).
                // Rows fading out into the padding keep it, as the old rule matched them.
                if (isKara && Number.isFinite(position) && playbackWindows[lineNumber]
                    && position >= playbackWindows[lineNumber].contentEndTime) {
                    className += " lyrics-lyricsContainer-LyricsLine-complete";
                }
                const isOutsideVisibleRange = (!isHighlightedLine
                    && lineNumber !== visualAnchorLineNumber
                    && (shouldHideSyncedLine({
                        compact,
                        isScrolling,
                        animationIndex: visibilityAnimationIndex,
                    }) || (
                        visibilityAnimationIndex < 0
                        && !keepPreviousDuringInterlude
                        && !(compact && isScrolling)
                        && (
                            !!paddedLyrics[layoutActiveLineIndex]?.interludeInfo?.isInterlude
                            // The visual anchor can sit on the dots while layout still holds the lyric.
                            || !!paddedLyrics[visualAnchorLineNumber]?.interludeInfo?.isInterlude
                            || isTrailingInterludeActive
                        )
                    ))
                    // Manual browsing in compact mode keeps every row, as shouldHideSyncedLine does.
                    || (isTrailingInterludeActive && isAnchorLine && !(compact && isScrolling)
                        && (!keepPreviousDuringInterlude || linesBefore <= 0)));
                if (isOutsideVisibleRange) {
                    className += " lyrics-lyricsContainer-LyricsLine-paddingLine";
                    className += visibilityAnimationIndex < 0
                        ? " lyrics-lyricsContainer-LyricsLine-paddingBefore"
                        : " lyrics-lyricsContainer-LyricsLine-paddingAfter";
                }
                className += getLyricsLineDetailClass(
                    lyricMotionDetailsEnabled && !isOutsideVisibleRange,
                    isCurrentRenderedLine || (!visualAnchorUsesTrailingInterlude && lineNumber === visualAnchorLineNumber)
                        || (isInterludeHandoff && lineNumber === layoutActiveLineIndex + 1)
                        || (isPreludeHandoff && lineNumber === leadingEmptyLines),
                    lineNumber < visualLineIndex,
                    isInterludeHandoff && isAnchorLine && line.interludeInfo?.isInterlude
                );

                const rowStyle = getRowStyle(line, visibleIndex, isOutsideVisibleRange);

                const item = {
                    type: "line",
                    key: lineNumber,
                    className,
                    style: isInterludeHandoff && isAnchorLine && line.interludeInfo?.isInterlude
                        ? { ...rowStyle, "--lyrics-interlude-fade-duration": `${interludeFadeDurationMs}ms` }
                        : rowStyle,
                    line,
                    startTime,
                    originalText,
                    mainText,
                    subText,
                    subText2,
                    isActiveLine: isCurrentRenderedLine,
                    trackLineRef: !visualAnchorUsesTrailingInterlude && lineNumber === visualAnchorLineNumber,
                    canSeek: lineNumber >= leadingEmptyLines && Number.isFinite(startTime),
                    karaokeActive: isAnimatingLine,
                    effectFocused: !visualAnchorUsesTrailingInterlude
                        && lineNumber === visualAnchorLineNumber,
                    // Keep both sides of a pre-centered hand-off alive. The outgoing
                    // line can then reach zero effect strength before its animation is
                    // detached when layoutActiveLineIndex advances.
                    effectLive: !visualAnchorUsesTrailingInterlude
                        && (
                            isAnimatingLine
                            || lineNumber === layoutActiveLineIndex
                            || lineNumber === visualAnchorLineNumber
                        ),
                    karaokePosition: isKara ? playbackState.renderPosition : 0,
                    hiddenFromAccessibility: isOutsideVisibleRange,
                };

                if (!trailingInterludeLine || lineNumber !== layoutActiveLineIndex) {
                    return [item];
                }

                return [
                    item,
                    {
                        type: "line",
                        key: `trailing-interlude-${lineNumber}-${trailingInterludeLine.startTime}`,
                        className: `lyrics-lyricsContainer-LyricsLine${isTrailingInterludeActive ? " lyrics-lyricsContainer-LyricsLine-active" : ""}`
                            + getLyricsLineDetailClass(lyricMotionDetailsEnabled, isTrailingInterludeActive, false, isInterludeHandoff),
                        style: trailingInterludeLineStyle,
                        line: trailingInterludeLine,
                        startTime: trailingInterludeLine.startTime,
                        originalText: "",
                        mainText: "",
                        subText: null,
                        subText2: null,
                        isActiveLine: isTrailingInterludeActive,
                        trackLineRef: visualAnchorUsesTrailingInterlude,
                        canSeek: false,
                        karaokeActive: false,
                        effectFocused: false,
                        effectLive: false,
                    }
                ];
            });
        }, [
            linesToRender,
            compact,
            layoutActiveLineIndex,
            activeLineIndex,
            leadingEmptyLines,
            lyrics,
            preparedLyrics,
            paddedLyrics,
            playbackWindows,
            cumulativeVocalEndTimes,
            itemPlaybackInterval,
            bounceEnabled,
            firstLyricStartTime,
            isBeforeFirstLyric,
            trailingInterludeInfo,
            isScrolling,
            isKara,
            activeDisplayLineIndex,
            visualLineIndex,
            visualDisplayLineIndex,
            compactWindowStartIndex,
            visualAnchorLineNumber,
            visualAnchorUsesTrailingInterlude,
            trailingInterludeKey,
            trailingInterludeLineStyle,
            isTrailingInterludeActive,
            getRowStyle,
            getLinePresentation,
            linesBefore,
            linesAfter,
            keepPreviousDuringInterlude,
            suppressLayoutShiftAnimation,
            usesScriptedCompactLineShift,
            settingsRevision,
            lyricMotionDetailsEnabled,
            isInterludeHandoff,
            isPreludeHandoff,
            interludeFadeDurationMs,
            preludeFadeDurationMs,
            compactOffset,
        ]);
        // The full row structure changes at playback boundaries or settings/data
        // changes. Between them, preserve every static item and update live rows only.
        const liveRenderFrame = useMemo(() => prepareLiveSyncedRenderItems(preparedRenderItems, position),
            [preparedRenderItems]);
        const renderItems = useMemo(() => advanceLiveSyncedRenderItems(liveRenderFrame, position),
            [liveRenderFrame, isKara ? position : 0]);

        return {
            isScrolling,
            handleContainerClick,
            renderItems,
            compactOffset,
            activeLineIndex,
            activeLyricIndex: Math.max(0, activeLineIndex - leadingEmptyLines),
        };
    }
}
