import { getTranslationLanguageInfo, getProviderPromptLanguageInfo } from "./promptLanguages.mjs";

export const TRANSLATION_STYLES = Object.freeze({
    NATURAL: 'natural',
    LITERAL: 'literal',
    ADAPTIVE: 'adaptive'
});
const DEFAULT_TRANSLATION_STYLE = TRANSLATION_STYLES.NATURAL;
const VALID_TRANSLATION_STYLES = new Set(Object.values(TRANSLATION_STYLES));
export const normalizeTranslationStyle = (style) => {
    const normalized = String(style || '').trim().toLowerCase();
    return VALID_TRANSLATION_STYLES.has(normalized)
        ? normalized
        : DEFAULT_TRANSLATION_STYLE;
};

const getTranslationStyleInstruction = (style) => {
    switch (normalizeTranslationStyle(style)) {
        case TRANSLATION_STYLES.LITERAL:
            return 'Stay close to the original wording, word order, imagery, metaphors, and ambiguity. Change only what is necessary for grammatical, understandable target-language text.';
        case TRANSLATION_STYLES.ADAPTIVE:
            return 'Use nearby lines as context so the lyrics read as one smooth, connected passage. You may lightly reshape idioms and phrasing for fluency, but do not add, omit, or move meaning between lines.';
        case TRANSLATION_STYLES.NATURAL:
        default:
            return 'Use natural, idiomatic phrasing while preserving each line\'s meaning, tone, imagery, and level of formality. Do not add, omit, or move meaning between lines.';
    }
};

export function buildLyricsTranslationPrompt({ text, lang, translationStyle } = {}, readTranslationStyle) {
    const normalizedText = String(text ?? '').replace(/\r\n?/g, '\n');
    const lineCount = normalizedText.split('\n').length;
    const style = normalizeTranslationStyle(translationStyle || readTranslationStyle());
    const langInfo = getTranslationLanguageInfo(lang);
    const styleInstruction = getTranslationStyleInstruction(style);

    const systemPrompt = `You are the lyrics translation system for ivLyrics.

Translate song lyrics into ${langInfo.name} (${langInfo.native}).

TRANSLATION STYLE:
${styleInstruction}

CRITICAL OUTPUT CONTRACT:
- This is a translation task. Translate the meaning of every non-empty lyric line.
- Write the translated lyrics in ${langInfo.name} (${langInfo.native}) only.
- Never return the original lyrics unchanged, romanization, or pronunciation instead of a translation.
- Return exactly ${lineCount} lines, with one output line for each input line in the same order.
- Never merge multiple input lines or split one input line into multiple output lines.
- You may use surrounding lines only to understand context; output line N must still represent input line N.
- Preserve " / " between simultaneous vocal parts and translate each part separately.
- Preserve empty lines as empty lines.
- Preserve music symbols and structural markers such as ♪, [Chorus], and (Yeah).
- Do not add line numbers, prefixes, explanations, JSON, Markdown, or code fences.
- Return only the translated lyric lines.`;

    const userPrompt = `Translate the following ${lineCount} lyric lines. Return exactly ${lineCount} lines and nothing else.

<lyrics>
${normalizedText}
</lyrics>`;

    return { systemPrompt, userPrompt, style, lineCount };
}

export function buildMetadataTranslationPrompt({ title, artist, lang, providerId } = {}) {
    const langInfo = getProviderPromptLanguageInfo(lang);
    const personalStudyPrefix = providerId === 'perplexity'
        ? 'This request is only for personal study. '
        : '';

    if (providerId === 'gemini') {
        return `You are a translation API. Translate the song title and artist name to ${langInfo.name} (${langInfo.native}).

**Input**:
- Title: ${title}
- Artist: ${artist}

**Output MUST be valid JSON**:
{
  "translatedTitle": "translated title in ${langInfo.native}",
  "translatedArtist": "translated artist name in ${langInfo.native}",
  "romanizedTitle": "romanized title (Latin alphabet)",
  "romanizedArtist": "romanized artist name (Latin alphabet)"
}

**Rules**:
1. If the title/artist is already in ${langInfo.name}, keep it as-is
2. romanized fields should use Latin alphabet only
3. Do NOT use markdown code blocks`;
    }

    return `${personalStudyPrefix}Translate the song title and artist name to ${langInfo.name} (${langInfo.native}).

**Input**:
- Title: ${title}
- Artist: ${artist}

**Output valid JSON**:
{
  "translatedTitle": "translated title",
  "translatedArtist": "translated artist",
  "romanizedTitle": "romanized in Latin alphabet",
  "romanizedArtist": "romanized in Latin alphabet"
}`;
}
