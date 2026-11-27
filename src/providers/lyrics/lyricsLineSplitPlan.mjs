import { getLyricsDisplayCharacterWidth, measureLyricsDisplayWidth } from "./lyricsDisplayWidth.mjs";

export const LINE_SPLIT_TRIGGER_WIDTH = 22;
export const LINE_SPLIT_HARD_WIDTH = 26;
const MIN_WIDTH = 6;
const MIN_DURATION_MS = 500;
const MAX_SEGMENTS = 4;
const UNPAIRED_SURROGATE = /[\uD800-\uDFFF]/u;

export function getTimedLineSplitPlan(syllables, totalWidth, getBoundary) {
    const length = syllables.length;
    const boundaries = [];
    for (let index = 1; index < length; index++) {
        const boundary = getBoundary(syllables[index - 1], syllables[index]);
        if (boundary) boundaries.push({ end: index, ...boundary });
    }

    const minimumCount = Math.max(2, Math.ceil(totalWidth / LINE_SPLIT_HARD_WIDTH));
    const maximumCount = Math.min(MAX_SEGMENTS, boundaries.length + 1, length);
    if (minimumCount > maximumCount || boundaries.length === 0) return null;

    const texts = Array.from(syllables, syllable => String(syllable?.text || ''));
    // Joined spans can pair surrogates across a token boundary. Only reuse
    // per-token character widths when each token already has complete pairs.
    const tokenWidths = texts.some(text => UNPAIRED_SURROGATE.test(text))
        ? null
        : texts.map(text => Array.from(text, getLyricsDisplayCharacterWidth));
    const rangesByStart = [];
    const finalBoundary = { end: length };
    const allBoundaries = [...boundaries, finalBoundary];

    function getRanges(start) {
        if (rangesByStart[start]) return rangesByStart[start];
        const ranges = [];
        let width = 0;
        let previousEnd = start;
        for (const boundary of allBoundaries) {
            const { end } = boundary;
            if (end <= start) continue;
            if (tokenWidths) {
                // Sum in character order from zero for every start. Prefix
                // subtraction would change floating-point ties and wrapping.
                for (let index = previousEnd; index < end && width <= LINE_SPLIT_HARD_WIDTH; index++) {
                    for (const characterWidth of tokenWidths[index]) width += characterWidth;
                }
                if (width > LINE_SPLIT_HARD_WIDTH) break;
                previousEnd = end;
            } else {
                width = measureLyricsDisplayWidth(texts.slice(start, end).join(''));
                if (width > LINE_SPLIT_HARD_WIDTH) continue;
            }

            if (width < MIN_WIDTH) continue;
            const duration = Number(syllables[end - 1]?.endTime) - Number(syllables[start]?.startTime);
            if (end === length ? duration >= MIN_DURATION_MS : !(duration < MIN_DURATION_MS)) {
                ranges.push({ ...boundary, width });
            }
        }
        rangesByStart[start] = ranges;
        return ranges;
    }

    for (let segmentCount = minimumCount; segmentCount <= maximumCount; segmentCount++) {
        const targetWidth = totalWidth / segmentCount;
        const memo = Array.from({ length: segmentCount + 1 }, () => []);
        function search(start, remainingSegments) {
            const states = memo[remainingSegments];
            if (states[start] !== undefined) return states[start];

            const ranges = getRanges(start);
            let best = null;
            if (remainingSegments === 1) {
                const tail = ranges.at(-1);
                if (tail?.end === length) {
                    best = { cost: Math.pow(tail.width - targetWidth, 2), boundaries: [] };
                }
            } else {
                const maximumEnd = length - (remainingSegments - 1);
                for (const { end, width, penalty, gapMs } of ranges) {
                    if (end > maximumEnd) break;
                    const remaining = search(end, remainingSegments - 1);
                    if (!remaining) continue;
                    const cost = Math.pow(width - targetWidth, 2) + (penalty * 4)
                        - Math.min(gapMs / 200, 1) + remaining.cost;
                    if (!best || cost < best.cost) {
                        best = { cost, boundaries: [end, ...remaining.boundaries] };
                    }
                }
            }

            states[start] = best;
            return best;
        }

        const plan = search(0, segmentCount);
        if (plan) return [0, ...plan.boundaries, length];
    }
    return null;
}
