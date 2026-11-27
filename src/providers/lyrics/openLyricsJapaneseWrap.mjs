import { measureLyricsDisplayWidth } from "./lyricsDisplayWidth.mjs";
import { getTimedLineSplitPlan, LINE_SPLIT_TRIGGER_WIDTH, LINE_SPLIT_HARD_WIDTH } from "./lyricsLineSplitPlan.mjs";

export { measureLyricsDisplayWidth };

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

function getJapaneseBoundary(left, right) {
    const hasWhitespace = /[\s　]$/u.test(String(left?.text || ''))
        || /^[\s　]/u.test(String(right?.text || ''));
    const leftEndTime = Number(left?.endTime);
    const rightStartTime = Number(right?.startTime);
    if (!hasWhitespace
        || !Number.isFinite(leftEndTime)
        || !Number.isFinite(rightStartTime)
        || leftEndTime > rightStartTime) {
        return null;
    }
    const gapMs = rightStartTime - leftEndTime;
    return Number.isFinite(gapMs) ? { penalty: 0, gapMs } : null;
}

export function getJapaneseLineSplitPlan(syllables, totalWidth) {
    return getTimedLineSplitPlan(syllables, totalWidth, getJapaneseBoundary);
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
        || totalWidth <= LINE_SPLIT_TRIGGER_WIDTH
        || syllables.some(syllable => (
            measureLyricsDisplayWidth(syllable.text) > LINE_SPLIT_HARD_WIDTH
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
