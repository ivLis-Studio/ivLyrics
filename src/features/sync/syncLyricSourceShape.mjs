const hasExactSyncDataLineShape = (expectedCounts, actualCounts) => (
    Array.isArray(expectedCounts)
    && Array.isArray(actualCounts)
    && expectedCounts.length > 0
    && expectedCounts.length === actualCounts.length
    && expectedCounts.every((count, index) => Number(count) === Number(actualCounts[index]))
);

const findSyncDataLineShapePrefix = (expectedCounts, actualCounts) => {
    if (hasExactSyncDataLineShape(expectedCounts, actualCounts)) return 0;
    if (!Array.isArray(expectedCounts) || !Array.isArray(actualCounts)) return -1;
    if (actualCounts.length === 0 || expectedCounts.length <= actualCounts.length) return -1;

    const maxPrefix = expectedCounts.length - actualCounts.length;
    for (let prefix = 1; prefix <= maxPrefix; prefix++) {
        const matches = actualCounts.every((count, index) => (
            Number(count) === Number(expectedCounts[prefix + index])
        ));
        if (matches) return prefix;
    }

    return -1;
};

const getSyncDataLeadingCharOffset = (lineCounts, prefixLength) => (
    (Array.isArray(lineCounts) ? lineCounts.slice(0, prefixLength) : [])
        .reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0)
);

const shiftSyncDataRange = (range, charOffset) => {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end < charOffset) return null;
    return {
        ...range,
        start: Math.max(0, start - charOffset),
        end: Math.max(0, end - charOffset)
    };
};

const shiftSyncDataRanges = (ranges, charOffset) => (
    (Array.isArray(ranges) ? ranges : [])
        .map(range => shiftSyncDataRange(range, charOffset))
        .filter(Boolean)
);

const shiftSyncDataLineIndexes = (lines, charOffset) => {
    if (!charOffset) return lines;

    return (Array.isArray(lines) ? lines : [])
        .filter(line => Number(line?.end) >= charOffset)
        .map(line => {
            const shifted = {
                ...line,
                start: Math.max(0, Number(line.start) - charOffset),
                end: Math.max(0, Number(line.end) - charOffset)
            };

            if (Array.isArray(line.styleRanges)) {
                shifted.styleRanges = shiftSyncDataRanges(line.styleRanges, charOffset);
            }

            if (line?.parallel) {
                shifted.parallel = {
                    ...line.parallel,
                    hiddenRanges: shiftSyncDataRanges(line.parallel.hiddenRanges, charOffset),
                    parts: (Array.isArray(line.parallel.parts) ? line.parallel.parts : [])
                        .map(part => ({
                            ...part,
                            ranges: shiftSyncDataRanges(part.ranges, charOffset)
                        }))
                        .filter(part => part.ranges.length > 0)
                };
            }

            return shifted;
        });
};

function fingerprintSyncDataLyricsText(text) {
    let hash = 2166136261;
    let length = 0;
    for (const char of text) {
        hash ^= char.codePointAt(0) || 0;
        hash = Math.imul(hash, 16777619);
        length++;
    }
    return `lrclib-${(hash >>> 0).toString(36)}-${length.toString(36)}`;
}

export {
    hasExactSyncDataLineShape,
    findSyncDataLineShapePrefix,
    getSyncDataLeadingCharOffset,
    shiftSyncDataLineIndexes,
    fingerprintSyncDataLyricsText,
};
