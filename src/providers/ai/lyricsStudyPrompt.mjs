import { getProviderPromptLanguageInfo } from './promptLanguages.mjs';

    function buildLyricsStudyPrompt({ title, artist, targetLang, sourceLang = 'auto', lines = [], category = 'lines', difficulty = 'normal', chunkIndex = 1, chunkTotal = 1 } = {}) {
        const langInfo = getProviderPromptLanguageInfo(targetLang || 'ko');
        const normalizedDifficulty = ['easy', 'normal', 'hard', 'native'].includes(String(difficulty || '').toLowerCase()) ? String(difficulty || '').toLowerCase() : 'normal';
        const difficultyMap = {
            easy: {
                label: 'Easy',
                guidance: 'Assume a beginner or lower-intermediate learner. Use short explanations, define common words, avoid jargon, and make quiz distractors clearly distinguishable.'
            },
            normal: {
                label: 'Normal',
                guidance: 'Assume an intermediate learner. Balance natural meaning, useful grammar, vocabulary nuance, and practical examples.'
            },
            hard: {
                label: 'Hard',
                guidance: 'Assume an advanced learner. Include finer nuance, grammar contrasts, register, collocation, and more challenging quiz distractors.'
            },
            native: {
                label: 'Native-level',
                guidance: 'Assume a near-native learner. Explain subtle tone, implication, idiom, literary compression, rhythm, and natural alternatives without simplifying too much.'
            }
        };
        const difficultyInfo = difficultyMap[normalizedDifficulty] || difficultyMap.normal;
        const pronunciationGuide = [
            `Use one pronunciation style across every chunk: IPA-style phonetic transcription in Latin/IPA symbols.`,
            `Wrap it in /.../ for phonemic pronunciation or [...] for close phonetic detail.`,
            `Do not write pronunciation in the target language script, and do not use ad-hoc syllable romanization.`,
            `For example, write "like ships in the night" as "/laɪk ʃɪps ɪn ðə naɪt/", not "라이크 쉽스 인 나이트" and not "lie-ku ships in nightu".`,
            `For Japanese lyrics, keep kana/furigana only in "reading"; use IPA-style Latin/IPA symbols in "pronunciation".`
        ].join(" ");
        const payload = lines.map((line) => ({
            index: Number(line.index),
            text: String(line.text || '')
        })).filter((line) => Number.isFinite(line.index) && line.text.trim());
        const normalizedCategory = ['summary', 'lines', 'expressions', 'quiz'].includes(category) ? category : 'lines';
        const categoryRules = {
            summary: `Create only a compact learning-focused song summary. Explain the emotional situation, speaker attitude, and 2-3 language-learning takeaways. Do not create line notes, expressions, or quiz items.`,
            lines: `Create line-level learning cards for every provided lyric line. Keep each explanation short but specific. Include reading and pronunciation when useful. Include 1-2 grammar/pattern notes for each line that has a reusable structure; each note must explain how the pattern works in this lyric.`,
            expressions: `Create only 1-2 vocabulary expansion cards from words or short phrases that actually appear in the provided lyrics. Prefer practical items where learners benefit from alternatives, related words, or forms such as tense, base form, past participle, polite/casual form, particles, or collocations. Do not list many key phrases.`,
            quiz: `Create only 2-4 choice-based quiz items from the provided lyrics. Mix formats using the type field: meaning, blank, usage, rewrite, and grammar. Include fill-in-the-blank items where the question contains ____ and the choices are candidate words or short phrases. Include practical transfer items that ask how a lyric expression would be used or rephrased in everyday conversation, work email, meeting, or other non-lyric context. Do not make every question a literal lyric translation. Distractors must be plausible. Each question must include a lineIndex and should show the actual lyric phrase instead of referring to a line number. Include reading and pronunciation if the question quotes a lyric.`
        };
        const outputShapes = {
            summary: `{
  "summary": "2-3 sentence learning-focused summary in ${langInfo.native}"
}`,
            lines: `{
  "lines": [
    {
      "index": 0,
      "reading": "hiragana/kana reading if the lyric is Japanese; otherwise optional reading aid",
      "pronunciation": "IPA-style pronunciation if useful, e.g. /laɪk ʃɪps/; no local-script or ad-hoc romanization",
      "translation": "natural meaning in ${langInfo.native}",
      "explanation": "line-level explanation in ${langInfo.native}",
      "grammar": [{ "pattern": "reusable structure or grammar point", "explanation": "how it works in this lyric in ${langInfo.native}", "note": "short nuance or usage note in ${langInfo.native}" }],
      "vocabulary": [{ "term": "word", "reading": "hiragana/kana reading if Japanese", "pronunciation": "IPA-style pronunciation if useful", "meaning": "meaning in ${langInfo.native}", "note": "optional note in ${langInfo.native}" }]
    }
  ]
}`,
            expressions: `{
  "keyExpressions": [
    { "expression": "word or short phrase from the lyric", "reading": "hiragana/kana reading if Japanese", "pronunciation": "IPA-style pronunciation if useful", "meaning": "meaning in ${langInfo.native}", "note": "practical learner note in ${langInfo.native}", "alternatives": ["substitutable expression"], "forms": ["base/past/past participle or other useful forms"], "relatedWords": ["similar or related word"], "lineIndexes": [0] }
  ]
}`,
            quiz: `{
  "quiz": [
    { "type": "meaning|blank|usage|rewrite|grammar", "question": "question in ${langInfo.native}; for blank type include ____ where the missing word/phrase goes", "choices": ["A", "B", "C", "D"], "answerIndex": 0, "explanation": "why in ${langInfo.native}", "lineIndex": 0, "reading": "optional", "pronunciation": "optional" }
  ]
}`
        };

        return `You are a language learning tutor inside a lyrics app. Build one category of a compact study pack from the provided song lyrics.

Target explanation language: ${langInfo.name} (${langInfo.native})
Detected/source language: ${sourceLang}
Song: ${title || ''}
Artist: ${artist || ''}
Category: ${normalizedCategory}
Difficulty: ${difficultyInfo.label}
Difficulty guidance: ${difficultyInfo.guidance}
Chunk: ${chunkIndex}/${chunkTotal}

Rules:
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
- Write every human-readable explanation, meaning, question, and quiz explanation in ${langInfo.native}.
- Match the selected difficulty. Easy should be simpler and more scaffolded; hard/native-level should include deeper nuance and more demanding quiz distractors.
- Keep original lyric fragments short. Do not quote long lyric passages.
- Preserve original line indexes exactly.
- Do not refer to "line 3", "3rd line", "N번째 줄", or similar labels. Show the actual lyric phrase when a specific lyric matters.
- ${pronunciationGuide}
- Add "pronunciation" only when it helps; when present, it must follow the pronunciation style above.
- If the source lyric is Japanese or contains kanji, add "reading" as hiragana/kana reading. Do not put an explanation in "reading"; only the reading text.
- Explain useful vocabulary, grammar, idioms, tone, and natural meaning.
- Use the "grammar" array for reusable patterns, particles, verb forms, sentence endings, tense/aspect, omitted subjects, or word order. Do not leave grammar as only a label; include a concrete explanation tied to the lyric.
- Avoid generic filler such as "this is poetic" unless you explain the exact language cue. Prefer one practical learner insight over broad textbook summaries.
- When a word or phrase has nuance, explain the contrast with the literal meaning or a more common alternative.
- For the expressions category, output expansion cards, not a long list of key phrases. Base each item on a lyric word or short phrase and include alternatives/forms/relatedWords only when useful.
- For quiz items, vary answerIndex. Do not place every correct answer at choices[0].
- For quiz items, vary the type field. Do not make all items meaning questions; use blank, usage, rewrite, and grammar when the lyric supports them.
- For blank type, put ____ directly in the question and make choices short words or phrases that fit the blank.
- For blank type, include enough context in the question itself because the full original lyric line may be hidden while the learner answers.
- For quiz items, include some practical transfer questions when possible: how to say the idea naturally in everyday speech, how to soften it, or how to adapt it for workplace/formal writing.
- Repeated lyric phrases should produce at most one quiz item across the whole pack. If the same sentence or chorus line appears again, skip it and choose a different lyric phrase.
- If a line is too simple, keep its explanation short.
- Generate only the requested category. Omit unrelated top-level keys.

Task:
${categoryRules[normalizedCategory]}

Output JSON shape:
${outputShapes[normalizedCategory]}

Input lines:
${JSON.stringify(payload)}`;
    }

    /**
     * Motion lyrics direction prompt. MotionLyricsDirector.mjs writes it, next to
     * the vocabulary it checks the answer against.
     */

export {
    buildLyricsStudyPrompt,
};
