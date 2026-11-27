import { measureLyricsDisplayWidth } from "./lyricsDisplayWidth.mjs";

export { measureLyricsDisplayWidth };

const JAPANESE_LINE_SPLIT_TRIGGER_WIDTH = 22;
const JAPANESE_LINE_SPLIT_HARD_WIDTH = 26;
const JAPANESE_LINE_SPLIT_MIN_WIDTH = 6;
const JAPANESE_LINE_SPLIT_MIN_DURATION_MS = 500;
const JAPANESE_LINE_SPLIT_MAX_SEGMENTS = 4;

export function isJapaneseLyricsPayload(payload) {
    const languageValues = [
        payload?.metadata?.language,
        payload?.metadata?.languageTag,
        payload?.language,
        payload?.languageTag
    ];
    return languageValues.some(value => /^ja(?:[-_]|$)/iu.test(String(value || '').trim()));
}

function normalizeSplitComparisonText(value) {
    return String(value || '').replace(/[\s\u3000]+/gu, ' ').trim();
}

export function getJapaneseLineSplitPlan(syllables, totalWidth) {
    const candidateBoundaries = new Map();
    for (let index = 1; index < syllables.length; index++) {
        const left = syllables[index - 1];
        const right = syllables[index];
        const hasWhitespace = /[\s\u3000]$/u.test(String(left?.text || ''))
            || /^[\s\u3000]/u.test(String(right?.text || ''));
        const leftEndTime = Number(left?.endTime);
        const rightStartTime = Number(right?.startTime);
        if (!hasWhitespace
            || !Number.isFinite(leftEndTime)
            || !Number.isFinite(rightStartTime)
            || leftEndTime > rightStartTime) {
            continue;
        }
        candidateBoundaries.set(index, Math.max(0, rightStartTime - leftEndTime));
    }
    if (candidateBoundaries.size === 0) return null;

    const rawTexts = syllables.map(syllable => String(syllable?.text || ''));
    const maximumSegmentCount = Math.min(
        JAPANESE_LINE_SPLIT_MAX_SEGMENTS,
        candidateBoundaries.size + 1,
        syllables.length
    );
    const minimumSegmentCount = Math.max(
        2,
        Math.ceil(totalWidth / JAPANESE_LINE_SPLIT_HARD_WIDTH)
    );

    const findPlanForCount = segmentCount => {
        const targetWidth = totalWidth / segmentCount;
        const memo = new Map();

        const search = (startIndex, remainingSegments) => {
            const memoKey = `${startIndex}:${remainingSegments}`;
            if (memo.has(memoKey)) return memo.get(memoKey);

            if (remainingSegments === 1) {
                const width = measureLyricsDisplayWidth(rawTexts.slice(startIndex).join(''));
                const first = syllables[startIndex];
                const last = syllables.at(-1);
                const duration = Number(last?.endTime) - Number(first?.startTime);
                const result = width >= JAPANESE_LINE_SPLIT_MIN_WIDTH
                    && width <= JAPANESE_LINE_SPLIT_HARD_WIDTH
                    && duration >= JAPANESE_LINE_SPLIT_MIN_DURATION_MS
                    ? { cost: Math.pow(width - targetWidth, 2), boundaries: [] }
                    : null;
                memo.set(memoKey, result);
                return result;
            }

            let best = null;
            const maximumEndIndex = syllables.length - (remainingSegments - 1);
            for (let endIndex = startIndex + 1; endIndex <= maximumEndIndex; endIndex++) {
                const gapMs = candidateBoundaries.get(endIndex);
                if (!Number.isFinite(gapMs)) continue;

                const width = measureLyricsDisplayWidth(rawTexts.slice(startIndex, endIndex).join(''));
                const first = syllables[startIndex];
                const last = syllables[endIndex - 1];
                const duration = Number(last?.endTime) - Number(first?.startTime);
                if (width < JAPANESE_LINE_SPLIT_MIN_WIDTH
                    || width > JAPANESE_LINE_SPLIT_HARD_WIDTH
                    || duration < JAPANESE_LINE_SPLIT_MIN_DURATION_MS) {
                    continue;
                }

                const remaining = search(endIndex, remainingSegments - 1);
                if (!remaining) continue;
                const timingGapBonus = Math.min(gapMs / 200, 1);
                const cost = Math.pow(width - targetWidth, 2) - timingGapBonus + remaining.cost;
                if (!best || cost < best.cost) {
                    best = {
                        cost,
                        boundaries: [endIndex, ...remaining.boundaries]
                    };
                }
            }

            memo.set(memoKey, best);
            return best;
        };

        return search(0, segmentCount);
    };

    for (let segmentCount = minimumSegmentCount;
        segmentCount <= maximumSegmentCount;
        segmentCount++) {
        const plan = findPlanForCount(segmentCount);
        if (plan) return [0, ...plan.boundaries, syllables.length];
    }
    return null;
}

export function splitLongJapaneseLine(line, previousLine = null, nextLine = null) {
    const syllables = Array.isArray(line?.syllables) ? line.syllables : [];
    if (syllables.length < 2 || line?.vocals || line?.openLyricsSegmentCount) return [line];

    for (let index = 0; index < syllables.length; index++) {
        const syllable = syllables[index];
        const previous = syllables[index - 1];
        if (!String(syllable?.text || '').trim()
            || !Number.isFinite(syllable?.startTime)
            || !Number.isFinite(syllable?.endTime)
            || syllable.endTime < syllable.startTime
            || (previous && (
                syllable.startTime <= previous.startTime
                || syllable.startTime < previous.endTime
            ))) {
            return [line];
        }
    }

    const firstSyllable = syllables[0];
    const lastSyllable = syllables.at(-1);
    if ((Number.isFinite(previousLine?.endTime) && previousLine.endTime > firstSyllable.startTime)
        || (Number.isFinite(nextLine?.startTime) && nextLine.startTime < lastSyllable.endTime)) {
        return [line];
    }

    const lineText = normalizeSplitComparisonText(line?.text);
    const syllableText = normalizeSplitComparisonText(syllables.map(syllable => syllable.text).join(''));
    const totalWidth = measureLyricsDisplayWidth(lineText);
    if (!lineText
        || lineText !== syllableText
        || totalWidth <= JAPANESE_LINE_SPLIT_TRIGGER_WIDTH
        || syllables.some(syllable => (
            measureLyricsDisplayWidth(syllable.text) > JAPANESE_LINE_SPLIT_HARD_WIDTH
        ))) {
        return [line];
    }

    const plan = getJapaneseLineSplitPlan(syllables, totalWidth);
    if (!plan || plan.length < 3) return [line];

    const sourceLineKey = String(line.openLyricsSourceLineKey || line.openLyricsLineKey || 'line');
    const fragmentCount = plan.length - 1;
    const buildJapaneseLineFragment = (startIndex, fragmentIndex) => {
        const endIndex = plan[fragmentIndex + 1];
        const fragmentSyllables = syllables.slice(startIndex, endIndex);
        const first = fragmentSyllables[0];
        const last = fragmentSyllables.at(-1);
        return {
            ...line,
            startTime: fragmentIndex === 0 ? Math.min(line.startTime, first.startTime) : first.startTime,
            endTime: fragmentIndex === fragmentCount - 1
                ? Math.max(line.endTime, last.endTime)
                : last.endTime,
            text: fragmentSyllables.map(syllable => syllable.text).join('').trim(),
            syllables: fragmentSyllables,
            openLyricsLineKey: `${sourceLineKey}-ja-segment-${fragmentIndex + 1}`,
            openLyricsSourceLineKey: sourceLineKey,
            openLyricsSegmentIndex: fragmentIndex,
            openLyricsSegmentCount: fragmentCount
        };
    };
    const fragments = plan.slice(0, -1).map(buildJapaneseLineFragment);

    const flattenedSyllables = fragments.flatMap(fragment => fragment.syllables);
    const preservesSyllables = flattenedSyllables.length === syllables.length
        && flattenedSyllables.every((syllable, index) => syllable === syllables[index]);
    const preservesText = normalizeSplitComparisonText(
        fragments.map(fragment => fragment.text).join(' ')
    ) === lineText;
    const hasSafeFragmentTiming = fragments.every((fragment, index) => (
        index === 0
        || (
            fragment.startTime > fragments[index - 1].startTime
            && fragments[index - 1].endTime <= fragment.startTime
        )
    ));
    return preservesSyllables && preservesText && hasSafeFragmentTiming
        ? fragments
        : [line];
}

export function splitLongJapaneseLines(lines) {
    return (lines || []).flatMap((line, index, allLines) => (
        splitLongJapaneseLine(line, allLines[index - 1], allLines[index + 1])
    ));
}
