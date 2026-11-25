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

const getStableVocalAnchorPosition = (stateRef, key, currentTime, nextAnchorPosition) => {
    if (!stateRef?.current) {
        return nextAnchorPosition;
    }

    const state = stateRef.current;
    const positionWentBack = Number.isFinite(state.lastPlaybackPosition)
        && Number.isFinite(currentTime)
        && currentTime < state.lastPlaybackPosition - 250;

    if (state.key !== key || positionWentBack) {
        state.key = key;
        state.anchorPosition = nextAnchorPosition;
        state.lastPlaybackPosition = currentTime;
        return nextAnchorPosition;
    }

    state.lastPlaybackPosition = currentTime;
    if (!Number.isFinite(nextAnchorPosition) || nextAnchorPosition < 0) {
        return Number.isFinite(state.anchorPosition) ? state.anchorPosition : -1;
    }

    state.anchorPosition = Math.max(
        Number.isFinite(state.anchorPosition) ? state.anchorPosition : nextAnchorPosition,
        nextAnchorPosition
    );
    return state.anchorPosition;
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

const splitLineByParallelShape = (text, rowCount) => {
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value || rowCount <= 1) return [];

    const separatorParts = value.split(/\s*[/|／｜]\s*/).filter(Boolean);
    if (separatorParts.length === rowCount) {
        return separatorParts;
    }

    const chars = Array.from(value);
    const lead = [];
    const background = [];
    let depth = 0;
    let firstLeadIndex = Number.POSITIVE_INFINITY;
    let firstBackgroundIndex = Number.POSITIVE_INFINITY;
    chars.forEach((char, index) => {
        if (char === '(' || char === '（') {
            depth++;
            return;
        }
        if (char === ')' || char === '）') {
            depth = Math.max(0, depth - 1);
            return;
        }
        if (depth > 0) {
            firstBackgroundIndex = Math.min(firstBackgroundIndex, index);
            background.push(char);
        } else {
            if (!/\s/u.test(char)) {
                firstLeadIndex = Math.min(firstLeadIndex, index);
            }
            lead.push(char);
        }
    });

    if (rowCount === 2 && background.join('').trim()) {
        const leadText = lead.join('').trim();
        const backgroundText = background.join('').trim();
        return firstBackgroundIndex < firstLeadIndex
            ? [backgroundText, leadText]
            : [leadText, backgroundText];
    }

    return [];
};

const isKaraokeParenthesisOpen = (char) => char === '(' || char === '（';
const isKaraokeParenthesisClose = (char) => char === ')' || char === '）';

const isStandaloneParentheticalText = (text) => {
    const chars = Array.from(String(text || '').trim());
    if (chars.length < 2 || !isKaraokeParenthesisOpen(chars[0])) return false;

    let depth = 0;
    for (let index = 0; index < chars.length; index++) {
        const char = chars[index];
        if (isKaraokeParenthesisOpen(char)) {
            depth++;
            continue;
        }
        if (isKaraokeParenthesisClose(char)) {
            depth--;
            if (depth === 0 && index !== chars.length - 1) return false;
            if (depth < 0) return false;
        }
    }

    return depth === 0 && isKaraokeParenthesisClose(chars[chars.length - 1]);
};

const stripStandaloneParentheticalText = (text) => {
    let value = String(text || '').trim();
    while (isStandaloneParentheticalText(value)) {
        value = Array.from(value).slice(1, -1).join('').trim();
    }
    return value;
};

export const splitLineByVocalRowShape = (text, rows) => {
    const value = typeof text === 'string' ? text.trim() : '';
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    if (!value || rowCount <= 1) return [];

    const simpleParts = splitLineByParallelShape(value, rowCount);
    if (simpleParts.length === rowCount) return simpleParts;

    const segments = [];
    let buffer = [];
    let depth = 0;
    let parenthetical = false;
    const flush = () => {
        const segmentText = buffer.join('').trim();
        if (segmentText) {
            segments.push({
                parenthetical,
                text: parenthetical ? stripStandaloneParentheticalText(segmentText) : segmentText
            });
        }
        buffer = [];
        parenthetical = depth > 0;
    };

    Array.from(value).forEach((char) => {
        if (isKaraokeParenthesisOpen(char)) {
            if (depth === 0) {
                flush();
                parenthetical = true;
            }
            depth++;
            buffer.push(char);
            return;
        }

        if (isKaraokeParenthesisClose(char)) {
            buffer.push(char);
            if (depth > 0) depth--;
            if (depth === 0 && parenthetical) flush();
            return;
        }

        buffer.push(char);
    });
    flush();

    if (segments.length === rowCount) {
        return segments.map(segment => segment.text);
    }

    const remaining = [...segments];
    const rowShapeParts = rows.map((row) => {
        const rowIsParenthetical = isStandaloneParentheticalText(row?.text);
        const segmentIndex = remaining.findIndex(segment => segment.parenthetical === rowIsParenthetical);
        if (segmentIndex < 0) return '';
        const [segment] = remaining.splice(segmentIndex, 1);
        return segment.text;
    });

    return rowShapeParts.every(Boolean) && remaining.length === 0 ? rowShapeParts : [];
};
