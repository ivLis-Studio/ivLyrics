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

export function getLyricsDisplayCharacterWidth(character) {
    if (DISPLAY_MARK_PATTERN.test(character)) return 0;
    if (DISPLAY_WHITESPACE_PATTERN.test(character)) return 0.33;
    if (DISPLAY_FULL_WIDTH_PATTERN.test(character)) return 1;
    if (DISPLAY_UPPERCASE_PATTERN.test(character)) return 0.72;
    if (DISPLAY_LOWERCASE_PATTERN.test(character)) return 0.58;
    if (DISPLAY_NUMBER_PATTERN.test(character)) return 0.62;
    if (DISPLAY_PUNCTUATION_PATTERN.test(character)) return 0.38;
    return 0.8;
}

export function measureLyricsDisplayWidth(value) {
    let width = 0;
    for (const character of String(value || '')) {
        width += getLyricsDisplayCharacterWidth(character);
    }
    return width;
}
