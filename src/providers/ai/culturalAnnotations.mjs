import { getProviderPromptLanguageInfo } from './promptLanguages.mjs';

    function buildCulturalAnnotationsPrompt({ sourceLang = 'auto', targetLang = 'ko', lines = [] } = {}) {
        const targetLangInfo = getProviderPromptLanguageInfo(targetLang || 'ko');
        const payload = (Array.isArray(lines) ? lines : [])
            .map((line, fallbackIndex) => ({
                lineIndex: Number.isInteger(Number(line?.lineIndex ?? line?.index))
                    ? Number(line?.lineIndex ?? line?.index)
                    : fallbackIndex,
                text: String(line?.text ?? '')
            }));

        return `You analyze song lyrics for cultural context that ordinary translation cannot fully convey.

Input source language code: ${sourceLang || 'auto'}
Explanation language: ${targetLangInfo.name} (${targetLangInfo.native})

GOAL:
Identify only expressions whose meaning depends on cultural background that a reader from another culture is likely to miss. This is not a translation, vocabulary, grammar, slang, or general lyric explanation task.

REQUIRED ELIGIBILITY GATE - ALL THREE ANSWERS MUST BE YES:
1. Does understanding the line require a concrete fact outside the lyrics, such as a named custom, institution, practice, event, belief, game, or identifiable work?
2. Is that fact specific to a particular culture, region, community, or historical setting rather than broadly understandable human experience?
3. Would a competent natural translation still fail to carry that fact?
If any answer is no, do not annotate.

ANNOTATE ONLY WHEN SEPARATE CULTURAL KNOWLEDGE IS REQUIRED:
- country- or region-specific school life and education systems
- traditional or widely known local children's games
- local customs involving broadcasting, transport, housing, festivals, or daily life
- historical, religious, or social institutions and their cultural implications
- clear quotations or parodies from films, television, animation, comics, games, literature, advertising, or songs
- expressions with a special established meaning in a particular culture
- cases where translation conveys the surface meaning but loses an important cultural implication

DO NOT ANNOTATE:
- ordinary words or sentences
- onomatopoeia or mimetic words that translate naturally
- ordinary metaphors, exaggeration, slang, or colloquial speech
- poetic imagery, symbolism, atmosphere, emotion, or a possible literary interpretation
- punctuation, quotation marks, typography, rhyme, repetition, or other writing devices
- broadly shared images such as heaven, hell, an abyss, darkness, light, moonlight, shadows, seasons, dreams, tears, or broken/scattered things
- an idiom's etymology, religious origin, or dictionary history when its natural translation already conveys the lyric
- expressions understandable from context
- anything adequately conveyed by literal or natural translation
- grammar or word formation unless it is directly necessary for the cultural explanation

STRICT JUDGMENT RULES:
- Apply a strict foreign-reader test: after a competent natural translation, would an ordinary reader still miss a concrete culture-specific referent or implication? If not, omit it.
- The note must state a verifiable external cultural fact. If it merely interprets what the image "means," "symbolizes," "suggests," or "emphasizes," omit it.
- Require high confidence and specific evidence. When uncertain, omit the annotation. Zero annotations is preferable to a weak one.
- Do not treat code-switching, the use of English in J-pop or K-pop, common weekday phrases, ordinary pop-song conventions, familiar emotional clichés, or universal wordplay as cultural knowledge.
- Expressions such as "Monday", "bad days", and "Not today" are ordinary language and MUST NOT be annotated without an unmistakable reference to a specific work, custom, institution, or historical event.
- A phrase merely being common in songs, anime, television, or everyday speech is not enough. There must be a specific cultural fact that translation alone cannot carry.
- Quotation marks alone never prove a quotation or allusion. Mention a quotation or parody only when you can identify the exact source or work from unmistakable textual evidence; otherwise omit it.
- Do not infer a country or culture from the source language alone. Use internal textual evidence. If the culture is unclear, omit it.
- Explain a repeated cultural expression in detail only at its first occurrence.
- Most songs should produce zero or only a few annotations across the entire lyrics. Never annotate lines merely to provide coverage.
- Do not translate the full lyrics.
- Every note must be written naturally in ${targetLangInfo.native}.
- Return expression as the shortest exact substring copied from the input line that should receive the footnote marker.
- Do not repeat or quote expression in note. Give only the missing cultural fact, including a natural ${targetLangInfo.native} meaning when it is needed.
- Keep note to one short sentence and no more than 72 characters. Remove scene-setting, hedging, and conclusions.

MANDATORY NEGATIVE EXAMPLES:
- Quoted text such as "目を閉じて、また起きて、" is not a cultural reference merely because it uses quotation marks.
- "奈落の底" is an ordinary abyss/hell metaphor when the translation already conveys "the bottom of the abyss"; do not explain it.
- "バラバラの月光" is ordinary poetic imagery; do not invent a cultural meaning or symbolism for it.
- Notes like "the quotation marks imply a cited line," "this symbolizes despair," or "the moonlight represents fragmentation" are literary interpretation, not cultural context, and must never be returned.

POSITIVE CONTRAST:
- "缶蹴り" or "ケイドロ" may need a note because they name locally familiar children's games whose rules are not carried by translation.
- "夕焼け小焼け" may need a note when the line relies on the specific song's use in local evening return-home broadcasts.

OUTPUT CONTRACT:
- Return ONLY valid JSON, without Markdown or code fences.
- Return sparse annotations only. An empty annotations array is a correct result when no cultural explanation is needed.
- Use only lineIndex values present in the input.
- A line may have multiple annotations only when it contains multiple distinct cultural expressions that each independently require explanation.
- Return one annotation per distinct expression. Do not return duplicate or overlapping annotations for the same cultural fact.
- expression must be an exact, contiguous substring of that input line.
- Do not add footnote numbers. The app numbers annotations from 1 within each lyric line.
- Put the short display-ready explanation in note without repeating expression.

Output shape:
{
  "annotations": [
    {
      "lineIndex": 0,
      "expression": "exact source substring",
      "note": "One short cultural fact in ${targetLangInfo.native}."
    }
  ]
}

Input lines:
${JSON.stringify(payload)}`;
    }

    function normalizeCulturalAnnotationsResult(result, lines, providerId) {
        const lineTextByIndex = new Map(
            (Array.isArray(lines) ? lines : [])
                .map((line, fallbackIndex) => [
                    Number(line?.lineIndex ?? line?.index ?? fallbackIndex),
                    String(line?.text ?? '')
                ])
                .filter(([lineIndex]) => Number.isInteger(lineIndex))
        );
        if (!result || !Array.isArray(result.annotations)) {
            throw new Error(`[AIAddonManager] Provider ${providerId || 'unknown'} returned an invalid cultural annotations result`);
        }

        const compactNote = (value) => {
            const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
            if (!normalized) return '';

            const firstSentence = normalized.match(/^.*?[.!?。！？](?=\s|$)/u)?.[0] || normalized;
            const characters = Array.from(firstSentence);
            if (characters.length <= 72) return firstSentence;

            const clipped = characters.slice(0, 71).join('');
            const lastSpace = clipped.lastIndexOf(' ');
            const safeClip = lastSpace >= 36 ? clipped.slice(0, lastSpace) : clipped;
            return `${safeClip.replace(/[,:;，：；\s]+$/u, '')}…`;
        };

        const seenExpressions = new Set();
        const annotations = [];
        for (const item of result.annotations) {
            const lineIndex = Number(item?.lineIndex);
            const expression = String(item?.expression ?? '').trim();
            const note = compactNote(item?.note);
            const lineText = lineTextByIndex.get(lineIndex);
            const expressionKey = `${lineIndex}\u0000${expression}`;
            if (
                !Number.isInteger(lineIndex) ||
                !lineText ||
                !expression ||
                !lineText.includes(expression) ||
                !note ||
                seenExpressions.has(expressionKey)
            ) {
                continue;
            }
            seenExpressions.add(expressionKey);
            annotations.push({ lineIndex, expression, note });
        }

        annotations.sort((a, b) => {
            if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
            const lineText = lineTextByIndex.get(a.lineIndex) || '';
            const expressionOffset = lineText.indexOf(a.expression) - lineText.indexOf(b.expression);
            return expressionOffset || a.expression.localeCompare(b.expression);
        });
        return { annotations, provider: providerId || result.provider || null };
    }


export {
    buildCulturalAnnotationsPrompt,
    normalizeCulturalAnnotationsResult,
};
