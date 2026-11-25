const getPanelStackTranslateY = (wrapper) => {
    const stack = wrapper?.querySelector('.ivlyrics-panel-lines-stack');
    const currentCell = wrapper?.querySelector('.ivlyrics-panel-line-cell.visual-anchor')
        || wrapper?.querySelector('.ivlyrics-panel-line-cell.current');
    if (!stack || !currentCell) return null;

    const wrapperCenter = wrapper.clientHeight / 2;
    const anchorStack = currentCell.querySelector('[data-panel-vocal-anchor-position]');
    const anchorPosition = Number(anchorStack?.getAttribute('data-panel-vocal-anchor-position'));
    const anchorRowCount = Number(anchorStack?.getAttribute('data-panel-vocal-row-count'));
    let currentCenter = currentCell.offsetTop + (currentCell.offsetHeight / 2);

    if (anchorStack && Number.isFinite(anchorPosition) && Number.isFinite(anchorRowCount) && anchorRowCount > 0) {
        const rows = Array.from(anchorStack.querySelectorAll('[data-panel-vocal-row-index]'));
        const rowByIndex = new Map(rows.map((row) => [
            Number(row.getAttribute('data-panel-vocal-row-index')),
            row
        ]));
        const lowerIndex = Math.max(0, Math.min(anchorRowCount - 1, Math.floor(anchorPosition)));
        const upperIndex = Math.max(0, Math.min(anchorRowCount - 1, Math.ceil(anchorPosition)));
        const lowerRow = rowByIndex.get(lowerIndex);
        const upperRow = rowByIndex.get(upperIndex) || lowerRow;

        if (lowerRow && upperRow) {
            const cellRect = currentCell.getBoundingClientRect();
            const rowCenter = (row) => {
                const rect = row.getBoundingClientRect();
                return rect.top - cellRect.top + rect.height / 2;
            };
            const lowerCenter = rowCenter(lowerRow);
            const upperCenter = rowCenter(upperRow);
            const progress = Math.max(0, Math.min(1, anchorPosition - lowerIndex));
            currentCenter = currentCell.offsetTop + lowerCenter + (upperCenter - lowerCenter) * progress;
        }
    } else {
        const currentAnchor = currentCell.querySelector('.ivlyrics-panel-current-anchor');
        if (currentAnchor) {
            currentCenter = currentCell.offsetTop + currentAnchor.offsetTop + (currentAnchor.offsetHeight / 2);
        }
    }

    return Math.round(wrapperCenter - currentCenter);
};

const updatePanelStackPosition = (wrapper) => {
    const stack = wrapper?.querySelector('.ivlyrics-panel-lines-stack');
    const translateY = getPanelStackTranslateY(wrapper);
    if (!stack || translateY === null) return null;
    stack.style.setProperty('--ivlyrics-panel-stack-y', `${translateY}px`);
    return translateY;
};

export function createPanelStackLayout({ react, host, document }) {
    const { useEffect, useLayoutEffect, useRef } = react;

    return function usePanelStackLayout({
        initialLyrics, scrollRef, lyrics, panelLines, currentIndex, visualIndex,
        activeTrailingInterludeKey, fontScale, panelLineSlotHeight, instrumentalBreakRevision,
        textEffectRevision, reducePanelMotion,
    }) {
        const previousLyricsLayoutRef = useRef(initialLyrics);
        const suppressLayoutShiftRef = useRef(false);
        const layoutShiftFramesRef = useRef({ first: null, second: null });
        const hasPositionedStackRef = useRef(false);

        // Match the main lyrics page: advancing playback only changes the one
        // stack offset. Height corrections caused by streamed presentation data
        // are applied synchronously for two frames, so they cannot look like a
        // second lyric transition.
        useLayoutEffect(() => {
            const wrapper = scrollRef.current;
            const stack = wrapper?.querySelector('.ivlyrics-panel-lines-stack');
            if (!wrapper || !stack) return undefined;

            const lyricsLayoutChanged = previousLyricsLayoutRef.current !== lyrics;
            previousLyricsLayoutRef.current = lyrics;
            const frames = layoutShiftFramesRef.current;
            if (frames.first !== null) cancelAnimationFrame(frames.first);
            if (frames.second !== null) cancelAnimationFrame(frames.second);
            frames.first = null;
            frames.second = null;

            const suppressTransition = reducePanelMotion || lyricsLayoutChanged ||
                suppressLayoutShiftRef.current || !hasPositionedStackRef.current;
            suppressLayoutShiftRef.current = suppressTransition;
            if (suppressTransition) {
                stack.style.setProperty('transition', 'none', 'important');
            }

            updatePanelStackPosition(wrapper);
            hasPositionedStackRef.current = true;

            if (!suppressTransition) return undefined;

            frames.first = requestAnimationFrame(() => {
                frames.first = null;
                frames.second = requestAnimationFrame(() => {
                    frames.second = null;
                    suppressLayoutShiftRef.current = false;
                    stack.style.removeProperty('transition');
                });
            });

            return () => {
                if (frames.first !== null) cancelAnimationFrame(frames.first);
                if (frames.second !== null) cancelAnimationFrame(frames.second);
                frames.first = null;
                frames.second = null;
                stack.style.removeProperty('transition');
            };
        }, [
            panelLines,
            lyrics,
            currentIndex,
            visualIndex,
            activeTrailingInterludeKey,
            fontScale,
            panelLineSlotHeight,
            instrumentalBreakRevision,
            textEffectRevision,
            reducePanelMotion
        ]);

        useEffect(() => {
            const wrapper = scrollRef.current;
            if (!wrapper) return undefined;

            let frameId = null;
            let lastAnchorLayoutKey = null;
            const updateStackPosition = () => {
                frameId = null;
                const stack = wrapper.querySelector('.ivlyrics-panel-lines-stack');
                if (stack && suppressLayoutShiftRef.current) {
                    stack.style.setProperty('transition', 'none', 'important');
                }
                updatePanelStackPosition(wrapper);
            };
            const scheduleUpdate = () => {
                if (frameId !== null) {
                    cancelAnimationFrame(frameId);
                }
                frameId = requestAnimationFrame(updateStackPosition);
            };
            const scheduleAnchorUpdate = () => {
                const currentCell = wrapper.querySelector('.ivlyrics-panel-line-cell.visual-anchor')
                    || wrapper.querySelector('.ivlyrics-panel-line-cell.current');
                const anchorStack = currentCell?.querySelector('[data-panel-vocal-anchor-position]');
                const anchorPosition = anchorStack?.getAttribute('data-panel-vocal-anchor-position') || '';
                const anchorRowCount = anchorStack?.getAttribute('data-panel-vocal-row-count') || '';
                const currentAnchorIndex = currentCell
                    ?.querySelector('.ivlyrics-panel-current-anchor')
                    ?.getAttribute('data-panel-vocal-row-index') || '';
                const anchorLayoutKey = `${anchorPosition}:${anchorRowCount}:${currentAnchorIndex}`;
                if (anchorLayoutKey === lastAnchorLayoutKey) return;
                lastAnchorLayoutKey = anchorLayoutKey;
                scheduleUpdate();
            };

            scheduleUpdate();
            let observer = null;
            if (typeof host.ResizeObserver !== 'undefined') {
                observer = new host.ResizeObserver(scheduleUpdate);
                observer.observe(wrapper);
                const stack = wrapper.querySelector('.ivlyrics-panel-lines-stack');
                const currentCell = wrapper.querySelector('.ivlyrics-panel-line-cell.visual-anchor')
                    || wrapper.querySelector('.ivlyrics-panel-line-cell.current');
                const currentAnchor = currentCell?.querySelector?.('.ivlyrics-panel-current-anchor');
                if (stack) observer.observe(stack);
                if (currentCell) observer.observe(currentCell);
                if (currentAnchor) observer.observe(currentAnchor);
            }
            if (document.fonts?.ready) {
                document.fonts.ready.then(scheduleUpdate).catch(() => {});
            }
            host.addEventListener('resize', scheduleUpdate);
            host.addEventListener('ivlyrics-panel-anchor-update', scheduleAnchorUpdate);

            return () => {
                if (frameId !== null) {
                    cancelAnimationFrame(frameId);
                }
                observer?.disconnect?.();
                host.removeEventListener('resize', scheduleUpdate);
                host.removeEventListener('ivlyrics-panel-anchor-update', scheduleAnchorUpdate);
            };
        }, [panelLines, currentIndex, visualIndex, activeTrailingInterludeKey, fontScale, panelLineSlotHeight, instrumentalBreakRevision, textEffectRevision]);
    };
}
