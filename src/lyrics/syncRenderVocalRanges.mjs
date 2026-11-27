import { stripStandaloneParentheticalCharRange } from "../features/sync/syncParentheticalText.mjs";

const countSyncDataRangeChars = (ranges) => (Array.isArray(ranges) ? ranges : []).reduce((sum, range) => {
    const start = Number(range?.start);
    const end = Number(range?.end);
    return Number.isInteger(start) && Number.isInteger(end) && end >= start ? sum + end - start + 1 : sum;
}, 0);

const normalizeSyncDataHiddenRanges = (ranges) => (
    (Array.isArray(ranges) ? ranges : [])
        .map((range) => {
            const start = Number(range?.start);
            const end = Number(range?.end);
            return Number.isInteger(start) && Number.isInteger(end) && end >= start
                ? { start, end }
                : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start || a.end - b.end)
);

const isSyncDataRangeGapFullyHidden = (hiddenRanges, gapStart, gapEnd) => {
    if (gapStart > gapEnd || !Array.isArray(hiddenRanges) || hiddenRanges.length === 0) return false;

    let cursor = gapStart;
    for (const hiddenRange of hiddenRanges) {
        if (hiddenRange.end < cursor) continue;
        if (hiddenRange.start > cursor) return false;
        cursor = Math.max(cursor, hiddenRange.end + 1);
        if (cursor > gapEnd) return true;
    }

    return false;
};

const getNextSyncDataPartId = (usedIds) => {
    for (const label of 'abcdefghijklmnopqrstuvwxyz') {
        if (!usedIds.has(label)) {
            usedIds.add(label);
            return label;
        }
    }

    let index = 1;
    while (index <= 16) {
        const id = `p${index}`;
        if (!usedIds.has(id)) {
            usedIds.add(id);
            return id;
        }
        index++;
    }

    return null;
};

const splitSyncDataHiddenDelimitedParallelPart = (part, hiddenRanges, usedIds, allowUntimedParts) => {
    if (
        !part
        || typeof part !== 'object'
        || part.role !== 'background'
        || typeof part.id !== 'string'
        || !Array.isArray(part.ranges)
        || part.ranges.length < 2
        || !Array.isArray(part.join)
        || part.join.length !== part.ranges.length - 1
        || !part.join.every(joinMode => Number.isInteger(joinMode) && joinMode >= 0 && joinMode <= 2)
    ) {
        return null;
    }
    const hasSyncedChars = Array.isArray(part.chars);
    if (hasSyncedChars ? part.chars.length !== countSyncDataRangeChars(part.ranges) : !allowUntimedParts) {
        return null;
    }
    if (part.join.some(joinMode => joinMode === 2)) {
        return null;
    }

    for (let index = 0; index < part.ranges.length; index++) {
        const range = part.ranges[index];
        const start = Number(range?.start);
        const end = Number(range?.end);
        if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
        if (index > 0) {
            const previousRange = part.ranges[index - 1];
            const previousEnd = Number(previousRange?.end);
            if (!Number.isInteger(previousEnd) || start <= previousEnd) return null;
            if (!isSyncDataRangeGapFullyHidden(hiddenRanges, previousEnd + 1, start - 1)) {
                return null;
            }
        }
    }

    const splitParts = [];
    let charOffset = 0;
    for (let index = 0; index < part.ranges.length; index++) {
        const range = part.ranges[index];
        const charCount = range.end - range.start + 1;
        const id = index === 0 ? part.id : getNextSyncDataPartId(usedIds);
        if (!id) return null;

        const splitPart = { ...part, id, ranges: [{ ...range }], join: [] };
        if (hasSyncedChars) {
            splitPart.chars = part.chars.slice(charOffset, charOffset + charCount);
        } else {
            delete splitPart.chars;
        }
        splitParts.push(splitPart);
        charOffset += charCount;
    }

    return splitParts;
};

// The renderer needs character timing. The editor can also split a draft
// before the user has recorded its timing.
const splitSyncDataHiddenDelimitedParallelParts = (parallel, { allowUntimedParts = false } = {}) => {
    if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts)) return parallel;
    const hiddenRanges = normalizeSyncDataHiddenRanges(parallel.hiddenRanges);
    if (hiddenRanges.length === 0) return parallel;

    const usedIds = new Set(parallel.parts
        .map(part => (typeof part?.id === 'string' ? part.id : null))
        .filter(Boolean));
    const parts = [];
    let changed = false;

    parallel.parts.forEach((part) => {
        const splitParts = splitSyncDataHiddenDelimitedParallelPart(part, hiddenRanges, usedIds, allowUntimedParts);
        if (splitParts) {
            changed = true;
            parts.push(...splitParts);
        } else {
            parts.push(part);
        }
    });

    return changed && parts.length <= 16 ? { ...parallel, parts } : parallel;
};

const trimSyncDataPartParentheticals = (part, sourceChars, onHiddenIndex) => {
    if (!part || !Array.isArray(part.ranges) || part.ranges.length !== 1 || !Array.isArray(part.chars)) {
        return part;
    }

    const range = part.ranges[0];
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (
        !Number.isInteger(start)
        || !Number.isInteger(end)
        || start < 0
        || end < start
        || end >= sourceChars.length
        || part.chars.length !== end - start + 1
    ) {
        return part;
    }

    const localChars = sourceChars.slice(start, end + 1);
    const hiddenIndexes = onHiddenIndex ? [] : null;
    const stripped = stripStandaloneParentheticalCharRange(
        localChars, 0, localChars.length - 1,
        hiddenIndexes ? index => hiddenIndexes.push(start + index) : undefined
    );
    if (!stripped.changed || stripped.start > stripped.end) return part;

    const nextChars = part.chars.slice(stripped.start, stripped.end + 1);
    if (nextChars.length !== stripped.end - stripped.start + 1) return part;

    if (hiddenIndexes) hiddenIndexes.forEach(index => onHiddenIndex(index));
    return {
        ...part,
        ranges: [{ ...range, start: start + stripped.start, end: start + stripped.end }],
        chars: nextChars
    };
};

const normalizeSyncDataParallelParentheticalRanges = (lines, fullTextChars) => {
    const sourceChars = Array.isArray(fullTextChars) ? fullTextChars : [];
    if (!Array.isArray(lines) || sourceChars.length === 0) return lines;

    let changed = false;
    const normalizedLines = lines.map((line) => {
        if (!Array.isArray(line?.parallel?.parts)) return line;

        let lineChanged = false;
        const parts = line.parallel.parts.map((part) => {
            const trimmed = trimSyncDataPartParentheticals(part, sourceChars);
            if (trimmed !== part) {
                changed = true;
                lineChanged = true;
            }
            return trimmed;
        });

        const normalizedLine = lineChanged ? {
            ...line,
            parallel: {
                ...line.parallel,
                parts
            }
        } : line;
        const splitParallel = splitSyncDataHiddenDelimitedParallelParts(normalizedLine.parallel);
        if (splitParallel !== normalizedLine.parallel) {
            changed = true;
            return {
                ...normalizedLine,
                parallel: splitParallel
            };
        }

        return normalizedLine;
    });

    return changed ? normalizedLines : lines;
};

export {
    countSyncDataRangeChars, getNextSyncDataPartId, normalizeSyncDataHiddenRanges,
    splitSyncDataHiddenDelimitedParallelParts, trimSyncDataPartParentheticals, normalizeSyncDataParallelParentheticalRanges,
};
