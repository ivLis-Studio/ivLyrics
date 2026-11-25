import { getTrailingKaraokeInterludeKey } from "./panelPlaybackSubscription.mjs";

export function preparePanelDisplayRows(lyrics, displayLyrics, getInterludeInfo, getDistinctPanelSupplement) {
    return lyrics.map((sourceLine, index) => {
        const line = displayLyrics?.[index] ?? sourceLine;
        const originalText = line?.originalText || line?.text || '';
        return {
            row: {
                index, line, lineIndex: index, lineCount: lyrics.length, originalText,
                phonetic: getDistinctPanelSupplement(line?.phoneticText, originalText, true),
                translation: getDistinctPanelSupplement(line?.text2, originalText, true),
                isPlaceholder: false,
            },
            // Final markers can depend on track duration, which may arrive late.
            interludeInfo: index < lyrics.length - 1
                ? getInterludeInfo(sourceLine, lyrics[index + 1], index, lyrics.length)
                : null,
        };
    });
}

// Keep the lyric list mounted as playback advances. Hidden rows retain their
// height so the anchored stack can move without recomputing its base layout.
export function buildPanelDisplayRows({
    lyrics, preparedRows, currentIndex, visualIndex, visibleLineCount,
    activeTrailingInterludeKey, visualTrailingInterludeKey, autoInstrumentalBreakEnabled,
    singingLineIndices, panelPlaybackTimeline, getInterludeInfo, getTrailingKaraokeInterludeInfo,
}) {
    const halfLines = Math.floor(visibleLineCount / 2);
    const usesTrailingAnchor = !!visualTrailingInterludeKey && visualIndex === currentIndex;
    const activeTrailingInterlude = !!activeTrailingInterludeKey && activeTrailingInterludeKey === visualTrailingInterludeKey;
    const displayableRows = [];
    let visualDisplayIndex = 0;
    let activeIsInterlude = activeTrailingInterlude;
    for (const entry of preparedRows) {
        const { row } = entry;
        const { index } = row;
        const isCurrent = index === currentIndex;
        const isVisual = index === visualIndex;
        const isInterlude = (entry.interludeInfo
            ?? getInterludeInfo(lyrics[index], null, index, lyrics.length)).isInterlude;
        if (isInterlude) {
            if (!isCurrent && !isVisual) continue;
            activeIsInterlude = true;
        }
        if (isVisual && !usesTrailingAnchor) visualDisplayIndex = displayableRows.length;
        displayableRows.push(row);

        if (!isCurrent || !visualTrailingInterludeKey) continue;
        const trailing = getTrailingKaraokeInterludeInfo(
            row.line, lyrics[index + 1], index, lyrics.length,
            panelPlaybackTimeline[index]?.prefixEndTime, autoInstrumentalBreakEnabled,
        );
        if (getTrailingKaraokeInterludeKey(index, trailing) !== visualTrailingInterludeKey) continue;
        if (usesTrailingAnchor) visualDisplayIndex = displayableRows.length;
        displayableRows.push({
            index: `trailing-interlude-${index}-${trailing.startTime}`,
            line: {
                startTime: trailing.startTime, endTime: trailing.endTime,
                text: '', originalText: '', text2: '',
                interludeInfo: trailing, isVirtualTrailingInterlude: true,
            },
            lineIndex: index, lineCount: lyrics.length,
            originalText: '', phonetic: '', translation: '', isPlaceholder: false,
        });
    }

    const singingIndices = new Set(singingLineIndices);
    return displayableRows.map((row, displayIndex) => {
        const i = row.lineIndex;
        const isVirtualTrailingInterlude = row.index !== i;
        const relativeIndex = displayIndex - visualDisplayIndex;
        const isSinging = !isVirtualTrailingInterlude && singingIndices.has(i);
        return {
            ...row,
            isActive: isSinging || (isVirtualTrailingInterlude && activeTrailingInterlude)
                || (i === currentIndex && !activeTrailingInterludeKey),
            isVisualAnchor: usesTrailingAnchor
                ? isVirtualTrailingInterlude
                : !isVirtualTrailingInterlude && i === visualIndex,
            isPast: !isSinging && !isVirtualTrailingInterlude && (i < currentIndex || (i === currentIndex && !!activeTrailingInterludeKey)),
            isFuture: i > currentIndex,
            isLayoutHidden: !isSinging && (Math.abs(relativeIndex) > halfLines
                || (activeIsInterlude && relativeIndex < 0 && !isVirtualTrailingInterlude))
        };
    });
}
