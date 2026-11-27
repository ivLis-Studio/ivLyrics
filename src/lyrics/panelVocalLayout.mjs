import { getStableVocalAnchorPosition } from "./karaokeVocalTiming.mjs";
import { toFiniteTime } from "./lyricInterludeTiming.mjs";

export const VOCAL_STACK_CENTER_THRESHOLD = 4;

const getVocalRowTimeBounds = (row) => {
    const syllables = Array.isArray(row?.syllables) ? row.syllables : [];
    let startTime = Infinity;
    let endTime = -Infinity;

    syllables.forEach((syllable) => {
        const syllableStart = toFiniteTime(syllable?.startTime);
        const syllableEnd = toFiniteTime(syllable?.endTime) ?? syllableStart;
        if (syllableStart !== null) {
            startTime = Math.min(startTime, syllableStart);
            endTime = Math.max(endTime, syllableEnd ?? syllableStart);
        }
    });

    if (!Number.isFinite(startTime)) startTime = 0;
    if (!Number.isFinite(endTime)) endTime = startTime;
    return { startTime, endTime };
};

const buildVocalAnchorTimeline = (vocalRows) => {
    if (!Array.isArray(vocalRows)) return null;

    const bounds = new Array(vocalRows.length);
    const keyParts = new Array(vocalRows.length);
    for (let rowIndex = 0; rowIndex < vocalRows.length; rowIndex++) {
        const row = vocalRows[rowIndex];
        const rowBounds = getVocalRowTimeBounds(row);
        bounds[rowIndex] = rowBounds;
        if (rowIndex in vocalRows) {
            keyParts[rowIndex] = `${rowBounds.startTime}:${rowBounds.endTime}:${row?.text || ""}`;
        }
    }

    return { bounds, key: keyParts.join("|") };
};

const getVocalAnchorPosition = (timeline, currentTime) => {
    if (!timeline) return -1;

    const canResolvePosition = Number.isFinite(currentTime);
    let firstActiveRowIndex = -1;
    let lastActiveRowIndex = -1;
    for (let rowIndex = 0; rowIndex < timeline.bounds.length; rowIndex++) {
        const { startTime, endTime } = timeline.bounds[rowIndex];
        if (canResolvePosition && currentTime >= startTime && currentTime <= endTime) {
            if (firstActiveRowIndex < 0) {
                firstActiveRowIndex = rowIndex;
            }
            lastActiveRowIndex = rowIndex;
        }
    }

    return firstActiveRowIndex >= 0 && lastActiveRowIndex >= 0
        ? Math.ceil((firstActiveRowIndex + lastActiveRowIndex) / 2)
        : -1;
};

export function observePanelVocalAnchor({
    stackElement, host, readPlaybackPosition, vocalAnchorStateRef, vocalRows, shouldUseVocalRowAnchor,
}) {
    if (!stackElement) return undefined;

    let lastAppliedAnchorPosition = null;
    // vocalRows는 line 변경 시 새 배열로 생성되므로 effect 수명 동안 정적 timing을 재사용한다.
    const vocalAnchorTimeline = shouldUseVocalRowAnchor
        ? buildVocalAnchorTimeline(vocalRows)
        : null;

    const updateAnchorRow = () => {
        const currentTime = readPlaybackPosition() || 0;
        const nextAnchorPosition = shouldUseVocalRowAnchor
            ? getVocalAnchorPosition(vocalAnchorTimeline, currentTime)
            : -1;
        const activeAnchorPosition = shouldUseVocalRowAnchor
            ? getStableVocalAnchorPosition(
                vocalAnchorStateRef,
                vocalAnchorTimeline?.key || "",
                currentTime,
                nextAnchorPosition
            )
            : -1;
        const activeRowIndex = Number.isFinite(activeAnchorPosition) && activeAnchorPosition >= 0
            ? Math.round(activeAnchorPosition)
            : -1;
        if (activeAnchorPosition !== lastAppliedAnchorPosition) {
            lastAppliedAnchorPosition = activeAnchorPosition;
            if (activeAnchorPosition >= 0) {
                stackElement.setAttribute('data-panel-vocal-anchor-position', String(activeAnchorPosition));
            } else {
                stackElement.removeAttribute('data-panel-vocal-anchor-position');
            }
            stackElement.querySelectorAll('[data-panel-vocal-row-index]').forEach((rowElement) => {
                rowElement.classList.toggle(
                    'ivlyrics-panel-current-anchor',
                    Number(rowElement.getAttribute('data-panel-vocal-row-index')) === activeRowIndex
                );
            });
            host.dispatchEvent(new host.Event('ivlyrics-panel-anchor-update'));
        }
    };

    updateAnchorRow();

    const clearAnchor = () => {
        stackElement.removeAttribute('data-panel-vocal-anchor-position');
        stackElement.querySelectorAll('.ivlyrics-panel-current-anchor').forEach((rowElement) => {
            rowElement.classList.remove('ivlyrics-panel-current-anchor');
        });
    };
    if (!shouldUseVocalRowAnchor) return clearAnchor;
    host.addEventListener('ivlyrics-panel-time-update', updateAnchorRow);
    return () => {
        host.removeEventListener('ivlyrics-panel-time-update', updateAnchorRow);
        clearAnchor();
    };
}
