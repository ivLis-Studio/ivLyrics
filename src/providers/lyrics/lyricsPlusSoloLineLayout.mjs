import { joinSyllableText, normalizeDisplayText, normalizeInlineText } from "./lyricsPlusInput.mjs";
import { measureLyricsDisplayWidth } from "./lyricsDisplayWidth.mjs";
import { getTimedLineSplitPlan, LINE_SPLIT_TRIGGER_WIDTH, LINE_SPLIT_HARD_WIDTH } from "./lyricsLineSplitPlan.mjs";

export { measureLyricsDisplayWidth };

const BOUNDARY_IGNORED_CHARACTER = /[\s\p{Mark}]/u;

function getBoundaryCharacter(value, fromEnd = false) {
    let last = '';
    for (const character of value) {
        if (BOUNDARY_IGNORED_CHARACTER.test(character)) continue;
        if (!fromEnd) return character;
        last = character;
    }
    return last;
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
    if (totalWidth <= LINE_SPLIT_TRIGGER_WIDTH
        || syllables.some(syllable => (
            measureLyricsDisplayWidth(syllable.text) > LINE_SPLIT_HARD_WIDTH
        ))) {
        return [line];
    }

    const plan = getTimedLineSplitPlan(syllables, totalWidth, getSafeSoloLineBoundary);
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

    const flattenedSyllables = fragments.flatMap(fragment => fragment.syllables);
    const preservesSyllables = flattenedSyllables.length === syllables.length
        && flattenedSyllables.every((syllable, index) => syllable === syllables[index]);
    const preservesText = normalizeDisplayText(
        flattenedSyllables.map(syllable => syllable.text).join('')
    ) === lineText;
    const hasSafeFragmentTiming = fragments.every((fragment, index) => (
        index === 0
        || (
            fragment.startTime > fragments[index - 1].startTime
            && fragments[index - 1].syllables.at(-1).endTime
                <= fragment.syllables[0].startTime
        )
    ));
    return preservesSyllables && preservesText && hasSafeFragmentTiming
        ? fragments
        : [line];
}

export function splitLongSoloVocalLines(lines) {
    return (lines || []).flatMap((line, index, allLines) => (
        splitLongSoloVocalLine(line, allLines[index - 1], allLines[index + 1])
    ));
}
