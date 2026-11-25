const getSyncDataFiniteNumber = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim().length === 0) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const getSyncDataMilliseconds = (value) => {
    const seconds = getSyncDataFiniteNumber(value);
    return seconds === null ? null : Math.round(seconds * 1000);
};

const normalizeSyncDataGranularity = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'line' || normalized === 'word' ? normalized : 'character';
};

const expandSyncDataCompactTiming = (target, expectedLength) => {
    if (!target || typeof target !== 'object') return target;
    const granularity = normalizeSyncDataGranularity(target.granularity);
    if (Array.isArray(target.chars)) return { ...target, granularity };
    const length = Math.max(0, Number(expectedLength) || 0);
    let chars = null;
    if (granularity === 'line' && Number.isFinite(Number(target.timing))) {
        chars = new Array(length).fill(Number(target.timing));
    } else if (granularity === 'word' && Array.isArray(target.timing)) {
        chars = new Array(length).fill(null);
        let start = 0;
        for (const mark of target.timing) {
            const end = Number(mark?.[0]);
            const time = Number(mark?.[1]);
            if (!Array.isArray(mark) || mark.length !== 2 || !Number.isInteger(end)
                || end < start || end >= length || !Number.isFinite(time)) {
                chars = null;
                break;
            }
            for (let index = start; index <= end; index++) chars[index] = time;
            start = end + 1;
        }
        if (chars && start !== length) chars = null;
    }
    return { ...target, granularity, chars: chars || [] };
};

const expandSyncDataCompactLines = (lines) => (
    (Array.isArray(lines) ? lines : []).map((line) => {
        const expectedLength = Number(line?.end) - Number(line?.start) + 1;
        const expandedLine = expandSyncDataCompactTiming(line, expectedLength);
        if (!Array.isArray(expandedLine?.parallel?.parts)) return expandedLine;
        return {
            ...expandedLine,
            parallel: {
                ...expandedLine.parallel,
                parts: expandedLine.parallel.parts.map(part => expandSyncDataCompactTiming(
                    part,
                    (Array.isArray(part?.ranges) ? part.ranges : []).reduce((sum, range) => (
                        sum + Math.max(0, Number(range?.end) - Number(range?.start) + 1)
                    ), 0)
                ))
            }
        };
    })
);

const getSyncDataBaseLyricsTimingRows = (lyrics) => (
    (Array.isArray(lyrics) ? lyrics : [])
        .filter(line => String(line?.text || '').trim().length > 0)
        .map(line => ({
            startTime: getSyncDataFiniteNumber(line?.startTime),
            endTime: getSyncDataFiniteNumber(line?.endTime)
        }))
);

/**
 * Repairs only non-increasing timestamp clusters. Positive, intentionally short
 * intervals are preserved exactly. Severely collapsed lines can use the original
 * provider line timing as a conservative fallback.
 */
function normalizeSyncDataTimestampSequence(timestampMs, options = {}) {
    if (!Array.isArray(timestampMs) || timestampMs.length === 0) {
        return {
            times: Array.isArray(timestampMs) ? timestampMs : [],
            changed: false,
            usedLineFallback: false,
            duplicateCount: 0,
            unresolvedDuplicateCount: 0,
            longestCluster: 0
        };
    }

    const fallbackStartOption = getSyncDataFiniteNumber(options.fallbackStartMs);
    const numericTimestamps = timestampMs.map(getSyncDataFiniteNumber);
    const hasMissingTimestamp = numericTimestamps.some(value => value === null);
    const firstFiniteTimestamp = numericTimestamps.find(Number.isFinite);
    const initialTimestamp = fallbackStartOption
        ?? firstFiniteTimestamp
        ?? 0;
    const original = [];
    for (let index = 0; index < numericTimestamps.length; index++) {
        const numeric = numericTimestamps[index];
        original.push(Number.isFinite(numeric)
            ? numeric
            : (index > 0 ? original[index - 1] : initialTimestamp));
    }
    const epsilon = 0.0001;
    let duplicateCount = 0;
    let longestCluster = 1;
    let currentCluster = 1;
    let hasDecreasingTimestamp = false;

    for (let index = 1; index < original.length; index++) {
        if (original[index] < original[index - 1] - epsilon) {
            hasDecreasingTimestamp = true;
        }
        if (original[index] <= original[index - 1] + epsilon) {
            duplicateCount++;
        }
        if (Math.abs(original[index] - original[index - 1]) <= epsilon) {
            currentCluster++;
            longestCluster = Math.max(longestCluster, currentCluster);
        } else {
            currentCluster = 1;
        }
    }

    if (duplicateCount === 0) {
        return {
            times: hasMissingTimestamp ? original : timestampMs,
            changed: hasMissingTimestamp,
            usedLineFallback: false,
            duplicateCount: 0,
            unresolvedDuplicateCount: 0,
            longestCluster: 1
        };
    }

    const fallbackStart = fallbackStartOption;
    const fallbackEnd = getSyncDataFiniteNumber(options.fallbackEndMs);
    const endBound = getSyncDataFiniteNumber(options.endBoundMs);
    const hasFallbackBounds = options.fallbackStartMs !== null
        && options.fallbackStartMs !== undefined
        && options.fallbackEndMs !== null
        && options.fallbackEndMs !== undefined
        && Number.isFinite(fallbackStart)
        && Number.isFinite(fallbackEnd)
        && fallbackEnd > fallbackStart;
    const hasEndBound = options.endBoundMs !== null
        && options.endBoundMs !== undefined
        && Number.isFinite(endBound);
    const shouldUseLineFallback = options.forceLineFallback === true && hasFallbackBounds;

    if (shouldUseLineFallback) {
        const step = (fallbackEnd - fallbackStart) / original.length;
        const times = original.map((_, index) => fallbackStart + (step * index));
        return {
            times,
            changed: true,
            usedLineFallback: true,
            duplicateCount,
            unresolvedDuplicateCount: 0,
            longestCluster
        };
    }

    // Preserve the cluster's recorded start and spread only toward the next
    // distinct anchor. Reversed samples are first clamped forward, so a repair
    // never pulls a syllable earlier than its source time.
    const times = [...original];
    let changed = hasMissingTimestamp;
    if (hasDecreasingTimestamp) {
        for (let index = 1; index < times.length; index++) {
            if (times[index] < times[index - 1]) {
                times[index] = times[index - 1];
                changed = true;
            }
        }
    }
    let clusterStart = 0;

    while (clusterStart < times.length) {
        let clusterEnd = clusterStart;
        while (clusterEnd + 1 < times.length
            && Math.abs(times[clusterEnd + 1] - times[clusterStart]) <= epsilon) {
            clusterEnd++;
        }

        if (clusterEnd > clusterStart) {
            const clusterLength = clusterEnd - clusterStart + 1;
            const rightIndex = clusterEnd + 1;
            const rightBoundary = rightIndex < times.length
                ? times[rightIndex]
                : (hasEndBound && endBound > times[clusterEnd] ? endBound : null);

            if (Number.isFinite(rightBoundary) && rightBoundary > times[clusterStart] + epsilon) {
                const step = (rightBoundary - times[clusterStart]) / clusterLength;
                for (let offset = 0; offset < clusterLength; offset++) {
                    times[clusterStart + offset] = times[clusterStart] + (step * offset);
                }
                changed = true;
            }
        }

        clusterStart = clusterEnd + 1;
    }

    let unresolvedDuplicateCount = 0;
    for (let index = 1; index < times.length; index++) {
        if (times[index] <= times[index - 1] + epsilon) {
            unresolvedDuplicateCount++;
        }
    }

    return {
        times,
        changed,
        usedLineFallback: false,
        duplicateCount,
        unresolvedDuplicateCount,
        longestCluster
    };
}

function normalizeSyncDataDurationMs(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0 && numeric <= 86400 * 1000) {
            return Math.round(numeric);
        }
    }
    return 0;
}

const SYNC_DATA_DURATION_FRONT_OFFSET_RATIO = 0.3;
const SYNC_DATA_DURATION_OFFSET_MIN_DIFF_MS = 500;

function getCurrentSyncDataTrackDurationMs(options, player) {
    return normalizeSyncDataDurationMs(
        options?.durationMs,
        options?.trackDurationMs,
        options?.duration_ms,
        options?.trackInfo?.durationMs,
        options?.trackInfo?.duration_ms,
        options?.trackInfo?.duration?.milliseconds,
        options?.result?.durationMs,
        options?.result?.duration_ms,
        options?.result?.duration?.milliseconds,
        player?.data?.item?.duration?.milliseconds,
        player?.getDuration?.()
    );
}

function getRegisteredSyncDataTrackDurationMs(syncData, syncBody) {
    return normalizeSyncDataDurationMs(
        syncBody?.trackDurationMs,
        syncData?.trackDurationMs,
        syncData?.durationMs
    );
}

function getSyncDataDurationOffsetMs(syncData, syncBody, options, player) {
    const registeredDurationMs = getRegisteredSyncDataTrackDurationMs(syncData, syncBody);
    const currentDurationMs = getCurrentSyncDataTrackDurationMs(options, player);
    if (!registeredDurationMs || !currentDurationMs) {
        return { offsetMs: 0, registeredDurationMs, currentDurationMs, diffMs: 0 };
    }

    const diffMs = currentDurationMs - registeredDurationMs;
    if (Math.abs(diffMs) < SYNC_DATA_DURATION_OFFSET_MIN_DIFF_MS) {
        return { offsetMs: 0, registeredDurationMs, currentDurationMs, diffMs };
    }

    return {
        offsetMs: Math.round(diffMs * SYNC_DATA_DURATION_FRONT_OFFSET_RATIO),
        registeredDurationMs,
        currentDurationMs,
        diffMs
    };
}

function shiftSyncDataTimeSeconds(value, offsetSeconds) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    return Math.max(0, Number((numeric + offsetSeconds).toFixed(3)));
}

function shiftSyncDataTimingLine(line, offsetSeconds) {
    if (!line || typeof line !== 'object') return line;
    const shifted = {
        ...line,
        chars: Array.isArray(line.chars)
            ? line.chars.map(value => shiftSyncDataTimeSeconds(value, offsetSeconds))
            : line.chars
    };
    if (line.lastCharEnd !== undefined) {
        shifted.lastCharEnd = shiftSyncDataTimeSeconds(line.lastCharEnd, offsetSeconds);
    }

    if (line.parallel && typeof line.parallel === 'object') {
        shifted.parallel = {
            ...line.parallel,
            parts: Array.isArray(line.parallel.parts)
                ? line.parallel.parts.map(part => ({
                    ...part,
                    chars: Array.isArray(part?.chars)
                        ? part.chars.map(value => shiftSyncDataTimeSeconds(value, offsetSeconds))
                        : part?.chars,
                    ...(part?.lastCharEnd !== undefined
                        ? { lastCharEnd: shiftSyncDataTimeSeconds(part.lastCharEnd, offsetSeconds) }
                        : {})
                }))
                : line.parallel.parts
        };
    }

    return shifted;
}

function applySyncDataDurationOffsetToLines(lines, offsetMs) {
    if (!Array.isArray(lines) || !offsetMs) return lines;
    const offsetSeconds = offsetMs / 1000;
    return lines.map(line => shiftSyncDataTimingLine(line, offsetSeconds));
}

export {
    getSyncDataMilliseconds,
    normalizeSyncDataGranularity,
    expandSyncDataCompactLines,
    getSyncDataBaseLyricsTimingRows,
    normalizeSyncDataTimestampSequence,
    normalizeSyncDataDurationMs,
    SYNC_DATA_DURATION_FRONT_OFFSET_RATIO,
    getSyncDataDurationOffsetMs,
    applySyncDataDurationOffsetToLines,
};
