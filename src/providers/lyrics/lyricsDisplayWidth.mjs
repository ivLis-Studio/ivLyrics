// Approximate rendered width of lyric text in full-width character units.
// Long-line wrapping (LyricsPlus solo lines, Open Lyrics Japanese lines)
// measures with it.
const DISPLAY_MARK_PATTERN = /\p{Mark}/u;
// \s includes U+3000 (ideographic space).
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
