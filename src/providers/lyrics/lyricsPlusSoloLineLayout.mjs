import { joinSyllableText, normalizeDisplayText, normalizeInlineText } from "./lyricsPlusInput.mjs";

const SOLO_LINE_SPLIT_TRIGGER_WIDTH = 22;
const SOLO_LINE_SPLIT_HARD_WIDTH = 26;
const SOLO_LINE_SPLIT_MIN_WIDTH = 6;
const SOLO_LINE_SPLIT_MIN_DURATION_MS = 500;
const SOLO_LINE_SPLIT_MAX_SEGMENTS = 4;
const DISPLAY_MARK_PATTERN = /\p{Mark}/u;
const DISPLAY_WHITESPACE_PATTERN = /\s/u;
const DISPLAY_FULL_WIDTH_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;
const DISPLAY_UPPERCASE_PATTERN = /[A-Z]/u;
const DISPLAY_LOWERCASE_PATTERN = /[a-z]/u;
const DISPLAY_NUMBER_PATTERN = /\p{Number}/u;
const DISPLAY_PUNCTUATION_PATTERN = /[.,'’!?;:()-]/u;

export function measureLyricsDisplayWidth(value) {
    let width = 0;
    for (const character of String(value || '')) {
        if (DISPLAY_MARK_PATTERN.test(character)) continue;
        if (DISPLAY_WHITESPACE_PATTERN.test(character)) {
            width += 0.33;
        } else if (DISPLAY_FULL_WIDTH_PATTERN.test(character)) {
            width += 1;
        } else if (DISPLAY_UPPERCASE_PATTERN.test(character)) {
            width += 0.72;
        } else if (DISPLAY_LOWERCASE_PATTERN.test(character)) {
            width += 0.58;
        } else if (DISPLAY_NUMBER_PATTERN.test(character)) {
            width += 0.62;
        } else if (DISPLAY_PUNCTUATION_PATTERN.test(character)) {
            width += 0.38;
        } else {
            width += 0.8;
        }
    }
    return width;
}

function getBoundaryCharacter(value, fromEnd = false) {
    const characters = Array.from(String(value || ''))
        .filter(character => !/[\s\p{Mark}]/u.test(character));
    return (fromEnd ? characters[characters.length - 1] : characters[0]) || '';
}

function isLatinOrNumber(character) {
    return /[\p{Script=Latin}\p{Number}]/u.test(character || '');
}

function isCjkCharacter(character) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character || '');
}

function isNoSpaceLineBreakCharacter(character) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character || '');
}

function getSafeSoloLineBoundary(leftSyllable, rightSyllable) {
    const leftText = String(leftSyllable?.text || '');
    const rightText = String(rightSyllable?.text || '');
    const leftCharacter = getBoundaryCharacter(leftText, true);
    const rightCharacter = getBoundaryCharacter(rightText, false);
    if (!leftCharacter || !rightCharacter) return null;
    if (/[([{（「『【〈《]/u.test(leftCharacter)) return null;
    if (/[)\]}）」』】〉》、。，．！？?!]/u.test(rightCharacter)) return null;
    if (/[ゃゅょっぁぃぅぇぉゎャュョッァィゥェォヮー々]/u.test(rightCharacter)) return null;

    const leftEndTime = Number(leftSyllable?.endTime);
    const rightStartTime = Number(rightSyllable?.startTime);
    if (!Number.isFinite(leftEndTime)
        || !Number.isFinite(rightStartTime)
        || leftEndTime > rightStartTime) {
        return null;
    }

    const hasWhitespace = /\s$/u.test(leftText) || /^\s/u.test(rightText);
    const followsPunctuation = /[。！？?!…；;：:、，,.]/u.test(leftCharacter);
    const changesBetweenCjkAndLatin = (
        isCjkCharacter(leftCharacter) && isLatinOrNumber(rightCharacter)
    ) || (
        isLatinOrNumber(leftCharacter) && isCjkCharacter(rightCharacter)
    );
    const isNoSpaceScriptBoundary = isNoSpaceLineBreakCharacter(leftCharacter)
        && isNoSpaceLineBreakCharacter(rightCharacter);

    // Some TTML sources split one English word into multiple timed spans
    // (for example, "Wond" + "er"). Never treat that as a line boundary.
    if (isLatinOrNumber(leftCharacter)
        && isLatinOrNumber(rightCharacter)
        && !hasWhitespace
        && !followsPunctuation) {
        return null;
    }
    if (!hasWhitespace
        && !followsPunctuation
        && !changesBetweenCjkAndLatin
        && !isNoSpaceScriptBoundary) {
        return null;
    }

    return {
        penalty: hasWhitespace
            ? 0
            : (followsPunctuation ? 0.25 : (isNoSpaceScriptBoundary ? 1 : 2.5)),
        gapMs: Math.max(0, rightStartTime - leftEndTime)
    };
}

function getSoloLineSplitPlan(syllables, totalWidth) {
    const candidateBoundaries = new Map();
    for (let index = 1; index < syllables.length; index++) {
        const boundary = getSafeSoloLineBoundary(syllables[index - 1], syllables[index]);
        if (boundary) candidateBoundaries.set(index, boundary);
    }
    if (candidateBoundaries.size === 0) return null;

    const rawTexts = syllables.map(syllable => String(syllable.text || ''));
    const maximumSegmentCount = Math.min(
        SOLO_LINE_SPLIT_MAX_SEGMENTS,
        candidateBoundaries.size + 1,
        syllables.length
    );
    const minimumSegmentCount = Math.max(
        2,
        Math.ceil(totalWidth / SOLO_LINE_SPLIT_HARD_WIDTH)
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
                const last = syllables[syllables.length - 1];
                const duration = last.endTime - first.startTime;
                const result = width >= SOLO_LINE_SPLIT_MIN_WIDTH
                    && width <= SOLO_LINE_SPLIT_HARD_WIDTH
                    && duration >= SOLO_LINE_SPLIT_MIN_DURATION_MS
                    ? { cost: Math.pow(width - targetWidth, 2), boundaries: [] }
                    : null;
                memo.set(memoKey, result);
                return result;
            }

            let best = null;
            const maximumEndIndex = syllables.length - (remainingSegments - 1);
            for (let endIndex = startIndex + 1; endIndex <= maximumEndIndex; endIndex++) {
                const boundary = candidateBoundaries.get(endIndex);
                if (!boundary) continue;

                const width = measureLyricsDisplayWidth(rawTexts.slice(startIndex, endIndex).join(''));
                const first = syllables[startIndex];
                const last = syllables[endIndex - 1];
                const duration = last.endTime - first.startTime;
                if (width < SOLO_LINE_SPLIT_MIN_WIDTH
                    || width > SOLO_LINE_SPLIT_HARD_WIDTH
                    || duration < SOLO_LINE_SPLIT_MIN_DURATION_MS) {
                    continue;
                }

                const remaining = search(endIndex, remainingSegments - 1);
                if (!remaining) continue;
                const timingGapBonus = Math.min(boundary.gapMs / 200, 1);
                const cost = Math.pow(width - targetWidth, 2)
                    + (boundary.penalty * 4)
                    - timingGapBonus
                    + remaining.cost;
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

export function splitLongSoloVocalLine(line, previousLine = null, nextLine = null) {
    const syllables = Array.isArray(line?.syllables) ? line.syllables : [];
    if (syllables.length < 2
        || line?.vocals
        || line?.lyricsPlusParallelVocal
        || line?.lyricsPlusFragment
        || line?.lyricsPlusSoloSegment
        || line?.lyricsPlusPromotedBackgroundFragment
        || line?.lyricsPlusSegmentCount) {
        return [line];
    }

    for (let index = 0; index < syllables.length; index++) {
        const syllable = syllables[index];
        const previous = syllables[index - 1];
        if (!normalizeInlineText(syllable?.text)
            || !Number.isFinite(syllable?.startTime)
            || !Number.isFinite(syllable?.endTime)
            || syllable.endTime < syllable.startTime
            || syllable.lyricsPlusSeparator
            || (previous && (
                syllable.startTime <= previous.startTime
                || syllable.startTime < previous.endTime
            ))) {
            return [line];
        }
    }

    const firstSyllable = syllables[0];
    const lastSyllable = syllables[syllables.length - 1];
    if ((Number.isFinite(previousLine?.endTime) && previousLine.endTime > firstSyllable.startTime)
        || (Number.isFinite(nextLine?.startTime) && nextLine.startTime < lastSyllable.endTime)) {
        return [line];
    }

    const lineText = normalizeDisplayText(line?.originalText || line?.text);
    const syllableText = joinSyllableText(syllables);
    if (!lineText || lineText !== syllableText) return [line];

    const totalWidth = measureLyricsDisplayWidth(lineText);
    if (totalWidth <= SOLO_LINE_SPLIT_TRIGGER_WIDTH
        || syllables.some(syllable => (
            measureLyricsDisplayWidth(syllable.text) > SOLO_LINE_SPLIT_HARD_WIDTH
        ))) {
        return [line];
    }

    const plan = getSoloLineSplitPlan(syllables, totalWidth);
    if (!plan || plan.length < 3) return [line];

    const sourceLineKey = String(
        line.lyricsPlusSourceLineKey || line.lyricsPlusLineKey || `line-${line.sourceIndex ?? 0}`
    );
    const fragmentCount = plan.length - 1;
    const buildSoloLineFragment = (startIndex, fragmentIndex) => {
        const endIndex = plan[fragmentIndex + 1];
        const fragmentSyllables = syllables.slice(startIndex, endIndex);
        const first = fragmentSyllables[0];
        const last = fragmentSyllables[fragmentSyllables.length - 1];
        const text = joinSyllableText(fragmentSyllables);
        const fragmentKey = `${sourceLineKey}-solo-segment-${fragmentIndex + 1}`;
        return {
            ...line,
            startTime: fragmentIndex === 0
                ? Math.min(line.startTime, first.startTime)
                : first.startTime,
            endTime: fragmentIndex === fragmentCount - 1
                ? Math.max(line.endTime, last.endTime)
                : last.endTime,
            text,
            originalText: text,
            syllables: fragmentSyllables,
            lyricsPlusLineKey: fragmentKey,
            lyricsPlusSourceLineKey: sourceLineKey,
            lyricsPlusSourceLineKeys: Array.from(new Set([
                ...(Array.isArray(line.lyricsPlusSourceLineKeys)
                    ? line.lyricsPlusSourceLineKeys
                    : []),
                sourceLineKey
            ])),
            lyricsPlusSoloSegment: true,
            lyricsPlusFragmentIndex: fragmentIndex,
            lyricsPlusFragmentCount: fragmentCount
        };
    };
    const fragments = plan.slice(0, -1).map(buildSoloLineFragment);

    const isSoloLineSplitSafe = () => {
    const flattenedSyllables = fragments.flatMap(fragment => fragment.syllables);
    const preservesSyllables = flattenedSyllables.length === syllables.length
        && flattenedSyllables.every((syllable, index) => syllable === syllables[index]);
    const preservesText = normalizeDisplayText(
        fragments.flatMap(fragment => fragment.syllables).map(syllable => syllable.text).join('')
    ) === lineText;
    const hasSafeFragmentTiming = fragments.every((fragment, index) => (
        index === 0
        || (
            fragment.startTime > fragments[index - 1].startTime
            && fragments[index - 1].syllables.at(-1).endTime
                <= fragment.syllables[0].startTime
        )
    ));
    return preservesSyllables && preservesText && hasSafeFragmentTiming;
    };
    return isSoloLineSplitSafe()
        ? fragments
        : [line];
}

export function splitLongSoloVocalLines(lines) {
    return (lines || []).flatMap((line, index, allLines) => (
        splitLongSoloVocalLine(line, allLines[index - 1], allLines[index + 1])
    ));
}
