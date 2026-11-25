import { getProviderPromptLanguageInfo, PROVIDERS_WITHOUT_PHONETIC_DESCRIPTION } from './promptLanguages.mjs';
import { isSupersededAbort, supersededAiRequest, waitForAiRetry } from './aiRequestCancellation.mjs';

    const NON_LATIN_PHONETIC_SCRIPT_RULES = Object.freeze({
        ko: {
            name: 'Korean Hangul',
            instruction: 'Write every pronounceable lyric sound in Hangul. Do not use Hiragana, Katakana, Kanji/Hanzi, Thai, Cyrillic, Arabic, or Latin letters for lyric sounds. Latin letters may remain only inside an exact structural marker such as [Chorus].'
        },
        ja: {
            name: 'Japanese Katakana',
            instruction: 'Write every pronounceable lyric sound in Katakana. Do not use Hiragana, Kanji/Hanzi, Hangul, Thai, or another language script for lyric sounds.'
        },
        'zh-cn': {
            name: 'Simplified Chinese characters',
            instruction: 'Write every pronounceable lyric sound with natural Simplified Chinese phonetic approximations. Do not copy Japanese Kana, Korean Hangul, Thai, or another source-language script.'
        },
        'zh-tw': {
            name: 'Traditional Chinese characters',
            instruction: 'Write every pronounceable lyric sound with natural Traditional Chinese phonetic approximations. Do not copy Japanese Kana, Korean Hangul, Thai, or another source-language script.'
        },
        hi: {
            name: 'Hindi Devanagari',
            instruction: 'Write every pronounceable lyric sound in Devanagari. Do not use Japanese Kana, Han characters, Hangul, Thai, or another source-language script.'
        },
        ar: {
            name: 'Arabic script',
            instruction: 'Write every pronounceable lyric sound in Arabic script using natural Arabic phonetic spelling. Do not use Japanese Kana, Han characters, Hangul, Thai, or another source-language script.'
        },
        fa: {
            name: 'Persian script',
            instruction: 'Write every pronounceable lyric sound in Persian script using natural Persian phonetic spelling. Do not use Japanese Kana, Han characters, Hangul, Thai, or another source-language script.'
        },
        ru: {
            name: 'Russian Cyrillic',
            instruction: 'Write every pronounceable lyric sound in Cyrillic using natural Russian phonetic spelling. Do not use Japanese Kana, Han characters, Hangul, Thai, or another source-language script.'
        },
        bn: {
            name: 'Bengali script',
            instruction: 'Write every pronounceable lyric sound in Bengali script. Do not use Japanese Kana, Han characters, Hangul, Thai, or another source-language script.'
        },
        th: {
            name: 'Thai script',
            instruction: 'Write every pronounceable lyric sound in Thai script using natural Thai phonetic spelling. Do not use Japanese Kana, Han characters, Hangul, or another source-language script.'
        }
    });
    const LATIN_PHONETIC_SCRIPT_RULE = Object.freeze({
        id: 'latin',
        name: 'standard Latin alphabet',
        instruction: 'Use only Latin letters (including language-appropriate Latin diacritics), spaces, apostrophes, and hyphens for pronounceable lyric sounds. Never use Hiragana, Katakana, Kanji/Hanzi, Hangul, Thai, Cyrillic, Arabic, Devanagari, Bengali, or any other non-Latin script for lyric sounds.'
    });
    const IPA_PHONETIC_SCRIPT_RULE = Object.freeze({
        id: 'ipa',
        name: 'International Phonetic Alphabet (IPA)',
        instruction: 'Write the sung pronunciation in Unicode IPA using broad, readable phonemic transcription. Use IPA stress, length, tone, and combining marks only when they materially affect pronunciation. Do not use ordinary romanization or the source orthography, and do not wrap output lines in slashes or square brackets.'
    });
    const CHARACTER_PRONUNCIATION_CJK_LANG_RE = /^(ja|jp|ko|kr|zh|zh-cn|zh-tw|cn|tw|yue|cmn)$/i;
    const CHARACTER_PRONUNCIATION_CJK_SCRIPT_RE = /[\u3040-\u30ff\uff66-\uff9f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/u;
    const CHARACTER_PRONUNCIATION_WORD_TEXT_RE = /[\p{L}\p{N}]/u;
    const CHARACTER_PRONUNCIATION_LETTER_RE = /\p{L}/u;
    const CHARACTER_PRONUNCIATION_LATIN_LETTER_RE = /\p{Script=Latin}/u;

    const CHINESE_SOURCE_LANG_RE = /^(zh|cmn|yue|cn|tw|hk)(?:-|$)/i;
    const HAN_SCRIPT_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
    const NON_CHINESE_CJK_SCRIPT_RE = /[\u3040-\u30ff\uff66-\uff9f\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/u;

    // Tone/intonation marks belong to Chinese pronunciation tasks only.
    // A detected language code decides first; when the hint is "auto", Han
    // characters with no kana/hangul identify Chinese lyrics, so Japanese and
    // Korean songs never match.
    const isChinesePronunciationTask = (sourceLang, text) => {
        const lang = String(sourceLang || '').trim().toLowerCase().replace(/_/g, '-');
        if (lang && lang !== 'auto') return CHINESE_SOURCE_LANG_RE.test(lang);
        const sample = String(text || '');
        return HAN_SCRIPT_RE.test(sample) && !NON_CHINESE_CJK_SCRIPT_RE.test(sample);
    };

    // Chinese-only tone rule, phrased for the target writing system. Returns
    // an empty string for output scripts that cannot carry tone marks (tones
    // are inherent in hanzi) and for every non-Chinese task, so those prompts
    // stay byte-identical to what they were before.
    const buildChineseTonePolicyRule = (scriptRule) => {
        if (scriptRule?.id === 'latin') {
            return '- The lyrics are Chinese: write every pronounceable syllable in Hanyu Pinyin with tone marks (nǐ hǎo, máma, xièxie). Leave the neutral tone unmarked, but every toned syllable must carry its tone mark. Never drop tone marks and never replace them with tone numbers.';
        }
        if (scriptRule?.id === 'ipa') {
            return '- The lyrics are Chinese. Mandarin is tonal: mark the tone of every syllable in the IPA transcription.';
        }
        return '';
    };

    const getPronunciationScriptRule = (lang) => {
        const normalizedLang = String(lang || 'en').trim().replace(/_/g, '-').toLowerCase();
        const shortLang = normalizedLang.split('-')[0];
        const nonLatinRule = NON_LATIN_PHONETIC_SCRIPT_RULES[normalizedLang]
            || NON_LATIN_PHONETIC_SCRIPT_RULES[shortLang];
        return nonLatinRule
            ? { id: normalizedLang, ...nonLatinRule }
            : LATIN_PHONETIC_SCRIPT_RULE;
    };

    const normalizeLyricsPronunciationNotation = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized === 'latin' || normalized === 'ipa'
            ? normalized
            : 'translation';
    };

    const getLyricsPronunciationScriptRule = (lang, notation) => {
        const normalizedNotation = normalizeLyricsPronunciationNotation(notation);
        if (normalizedNotation === 'latin') return LATIN_PHONETIC_SCRIPT_RULE;
        if (normalizedNotation === 'ipa') return IPA_PHONETIC_SCRIPT_RULE;
        return getPronunciationScriptRule(lang);
    };

    const buildCharacterPronunciationTargetExamples = (scriptRule, targetLang, isWordMode) => {
        if (scriptRule.id === 'latin') {
            return `Latin-target examples:
${isWordMode ? '- In word mode, return each spoken word as one u item, never as a character-level p array.' : ''}
- Japanese 高く (takaku): 高=taka, く=ku.
- Japanese 耐え難い (taegatai): p=["ta","e","gata","i"], not ["tae","e","gata","i"].
- Japanese のって should be close to "notte", not "no tsu te": の=no, っ=t, て=te.
- Japanese 爺ちゃん should be close to "jiichan": 爺=jii, ち=cha, ゃ="", ん=n.
- English "night" must be a spoken reading, not letter names. Keep helper/silent slots empty where necessary.`;
        }

        if (/^(ko|kr)(-|$)/i.test(String(targetLang || ''))) {
            return `Korean-target examples:
${isWordMode ? '- In word mode, return each spoken word as one u item, never as a character-level p array.' : ''}
- Japanese 高く => 高=타카, く=쿠; 急ぎ => 急=이소, ぎ=기; 懐かしい => 懐=나츠, か=카, し=시, い=이.
- Japanese 耐え難い: p=["타","에","가타","이"], not ["타에","에","가타","이"].
- English "night" should sound like "나이트", not "엔 아이 지 에이치 티".
- Japanese のって should be close to "노ㅅ데" or "노옷데", not "노 츠 테".
- Japanese 爺ちゃん should be close to "지이챠안": 爺=지이, ち=챠, ゃ="", ん=안.`;
        }

        return `Target-script alignment examples:
${isWordMode ? '- In word mode, return each spoken word as one u item, never as a character-level p array.' : ''}
- For 高く, keep the reading of 高 in the first slot and the sound of く in the second slot.
- For 耐え難い, keep four aligned readings. Do not merge the sound of え into 耐 or the sound of い into 難.
- For のって, represent small っ as a consonant stop or gemination in ${scriptRule.name}; never pronounce it as full-size つ.
- For 爺ちゃん, combine small ゃ with the preceding ち reading and leave the ゃ slot empty when the target writing system does not need a separate mark.`;
    };

    // Word-list prefix stripping for `word: value` responses (Image-3 shape).
    // Keeps the line count intact for provider parsers while removing the
    // echoed word before display. Lines without a matching prefix pass through.
    // Strip surrounding punctuation (quotes, brackets) for word-echo
    // comparison. Quoted lyric words (e.g. a "\u65e5\u3005" unit) are
    // often echoed back with normalized or dropped punctuation.
    const stripWordListEdgePunctuation = (value) => String(value ?? '')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .replace(/[^\p{L}\p{N}]+$/u, '');
    const stripWordListPrefix = (line, word) => {
        const text = String(line ?? '').trim();
        const surface = String(word ?? '').trim();
        if (!surface) return text;
        const core = stripWordListEdgePunctuation(surface);
        const candidates = core && core !== surface ? [surface, core] : [surface];
        for (const candidate of candidates) {
            for (const separator of [':', '：']) {
                if (text.startsWith(candidate + separator)
                    || text.toLowerCase().startsWith(candidate.toLowerCase() + separator)) {
                    return text.slice(candidate.length + 1).trim();
                }
            }
        }
        // The model sometimes echoes the word with normalized or dropped
        // surrounding punctuation (straight vs curly quotes, brackets).
        // Compare punctuation-stripped cores around the first colon instead.
        const match = text.match(/^\s*([\s\S]+?)\s*[：:]\s*([\s\S]*?)\s*$/);
        if (match) {
            const echoedCore = stripWordListEdgePunctuation(match[1]).toLowerCase();
            if (echoedCore && candidates.some((candidate) =>
                stripWordListEdgePunctuation(candidate).toLowerCase() === echoedCore)) {
                return match[2].trim();
            }
        }
        return text;
    };

    const validateLyricsTranslationResult = (result, params, providerId) => {
        const field = params?.wantSmartPhonetic ? 'phonetic' : 'translation';
        const value = field === 'translation'
            ? (result?.translation ?? result?.vi)
            : result?.phonetic;
        const lines = Array.isArray(value)
            ? value.map(line => String(line ?? ''))
            : (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').split('\n') : null);
        const sourceLines = String(params?.text ?? '').replace(/\r\n?/g, '\n').split('\n');
        const providerLabel = String(providerId || 'unknown');

        if (!lines) {
            throw new Error(`[AIAddonManager] Provider ${providerLabel} returned an invalid ${field} result`);
        }
        if (lines.length !== sourceLines.length) {
            throw new Error(`[AIAddonManager] Provider ${providerLabel} returned ${lines.length} lines; expected ${sourceLines.length}`);
        }
        if (lines.every(line => !line.trim())) {
            throw new Error(`[AIAddonManager] Provider ${providerLabel} returned an empty ${field} result`);
        }

        const missingLineIndex = lines.findIndex((line, index) => sourceLines[index].trim() && !line.trim());
        if (missingLineIndex >= 0) {
            throw new Error(`[AIAddonManager] Provider ${providerLabel} returned an empty line at index ${missingLineIndex + 1}`);
        }

        return result;
    };

    const IPA_DISALLOWED_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Thai}]/u;

    // Latin and IPA notations fix the output writing system; the
    // target-language notation is not checked here.
    const isPronunciationInNotationScript = (text, notation) => {
        const normalizedNotation = normalizeLyricsPronunciationNotation(notation);
        if (normalizedNotation === 'translation') return true;
        return !Array.from(String(text || '')).some((character) => {
            if (normalizedNotation === 'ipa') return IPA_DISALLOWED_SCRIPT_RE.test(character);
            return CHARACTER_PRONUNCIATION_LETTER_RE.test(character)
                && !CHARACTER_PRONUNCIATION_LATIN_LETTER_RE.test(character);
        });
    };

    const validateLyricsPhoneticWritingSystem = (result, params, providerId) => {
        if (!params?.wantSmartPhonetic) return result;

        const notation = normalizeLyricsPronunciationNotation(params.pronunciationNotation);
        if (notation === 'translation') return result;

        const lines = Array.isArray(result?.phonetic)
            ? result.phonetic
            : (typeof result?.phonetic === 'string'
                ? result.phonetic.replace(/\r\n?/g, '\n').split('\n')
                : []);
        const invalidLine = lines.find((line) => !isPronunciationInNotationScript(line, notation));

        if (invalidLine !== undefined) {
            throw new Error(
                `[AIAddonManager] Provider ${String(providerId || 'unknown')} returned pronunciation in the wrong writing system for ${notation}: ${String(invalidLine).slice(0, 48)}`
            );
        }
        return result;
    };

    // ============================================
    // Shared Prompt Builders
    // ============================================

    // Script policy shared by the line and the slot pronunciation prompts.
    function buildLyricsPronunciationPolicy({
        text,
        lang,
        providerId,
        pronunciationNotation = 'translation',
        sourceLang = 'auto'
    } = {}) {
        const normalizedText = String(text ?? '').replace(/\r\n?/g, '\n');
        const langInfo = getProviderPromptLanguageInfo(lang);
        const normalizedNotation = normalizeLyricsPronunciationNotation(pronunciationNotation);
        const scriptRule = getLyricsPronunciationScriptRule(lang, normalizedNotation);
        const isIpa = normalizedNotation === 'ipa';
        const sourceLanguageHint = String(sourceLang || 'auto').trim() || 'auto';
        const personalStudyPrefix = providerId === 'perplexity'
            ? 'This request is only for personal study. '
            : '';
        const phoneticDescription = isIpa || PROVIDERS_WITHOUT_PHONETIC_DESCRIPTION.has(providerId)
            ? ''
            : langInfo.phoneticDesc || '';
        const chineseToneRule = isChinesePronunciationTask(sourceLanguageHint, normalizedText)
            ? buildChineseTonePolicyRule(scriptRule)
            : '';
        const chineseToneUserHint = chineseToneRule
            ? (isIpa
                ? ' Mandarin is tonal: mark the tone of every syllable.'
                : ' Write Chinese syllables as Hanyu Pinyin with tone marks.')
            : '';
        const audienceLine = isIpa
            ? `Transcribe the original sung lyric sounds into ${scriptRule.name}. The source-language hint is ${sourceLanguageHint}; infer the language from the lyrics when the hint is auto or uncertain.`
            : `Convert lyric sounds for ${langInfo.name} (${langInfo.native}) speakers. The required output writing system is ${scriptRule.name}.`;
        const notationPolicy = isIpa
            ? `- The user's pronunciation notation is IPA. The translation target language does not change the IPA symbols.
- Use the source-language hint (${sourceLanguageHint}) and the full lyric context to infer the actual sung pronunciation.
- ${scriptRule.instruction}
- Prefer a broad standard-language transcription. Preserve a clearly written dialectal or contracted pronunciation only when the lyric spelling makes it explicit.
- Fully transcribe every pronounceable lyric token. Never copy source orthography merely because it resembles IPA.${chineseToneRule ? `\n${chineseToneRule}` : ''}`
            : `- The target language selected by the user determines the output script. The source lyric language NEVER determines the output script.
- ${scriptRule.instruction}
- ${phoneticDescription
    ? `Follow the target convention: ${phoneticDescription}.`
    : `Use natural phonetic spelling that a ${langInfo.name} speaker can read aloud.`}
- Fully transliterate every pronounceable lyric token into ${scriptRule.name}. Do not leave Japanese, Korean, Thai, or any other source-script text mixed into the pronunciation.
- Before answering, inspect every output line character by character. If a pronounceable token uses the source script or any script other than ${scriptRule.name}, rewrite that token in ${scriptRule.name}.${chineseToneRule ? `\n${chineseToneRule}` : ''}`;
        const scriptExamples = isIpa
            ? `- English: night → naɪt
- Japanese: 夢 → jɯme
- Korean: 사랑해 → saɾaŋɦɛ
- Do not return ordinary romanization such as yume or saranghae when IPA is requested.`
            : `- Target Indonesian or English (Latin): 夢ならばどれほどよかったでしょう → yume naraba dorehodo yokatta deshou
  Wrong for a Latin target: ユメナラバ ドレホド ヨカッタ デショウ or ゆめならば どれほど よかった でしょう
- Target Indonesian or English (Latin): 사랑해 → saranghae
  Wrong for a Latin target: 사랑해, サランヘ, or Thai-script output
- Target Korean (Hangul): 夢ならばどれほどよかったでしょう → 유메나라바 도레호도 요캇타 데쇼오
  Wrong for Korean: ユメナラバ ドレホド ヨカッタ デショウ or yume naraba dorehodo yokatta deshou`;

        return {
            langInfo,
            scriptRule,
            isIpa,
            sourceLanguageHint,
            personalStudyPrefix,
            chineseToneUserHint,
            audienceLine,
            notationPolicy,
            scriptExamples
        };
    }

    function buildLyricsPhoneticPrompt({
        text,
        lang,
        providerId,
        pronunciationNotation = 'translation',
        sourceLang = 'auto'
    } = {}) {
        const normalizedText = String(text ?? '').replace(/\r\n?/g, '\n');
        const lineCount = normalizedText.split('\n').length;
        const {
            langInfo,
            scriptRule,
            isIpa,
            sourceLanguageHint,
            personalStudyPrefix,
            chineseToneUserHint,
            audienceLine,
            notationPolicy,
            scriptExamples
        } = buildLyricsPronunciationPolicy({ text: normalizedText, lang, providerId, pronunciationNotation, sourceLang });

        const systemPrompt = `You are the pronunciation conversion system for ivLyrics.

${audienceLine}

MANDATORY SCRIPT POLICY:
${notationPolicy}

TASK RULES:
- This is a PRONUNCIATION task, not a translation task. Preserve the sound; do not translate the meaning.
- Return exactly ${lineCount} lines, with one pronunciation for each input line in the same order.
- Never merge multiple input lines or split one input line into multiple output lines.
- If an input line contains " / " between simultaneous vocal parts, preserve " / " and convert each part separately.
- Keep empty lines empty. Keep music symbols and structural markers such as ♪, [Chorus], and (Yeah).
- Do not add line numbers, prefixes, explanations, JSON, Markdown, or code fences.
- Return only the pronunciation lines.

SCRIPT EXAMPLES:
${scriptExamples}`;

        const userPrompt = `${personalStudyPrefix}${isIpa
    ? `Transcribe the following ${lineCount} lyric lines into broad Unicode IPA. Source-language hint: ${sourceLanguageHint}.`
    : `Convert the following ${lineCount} lyric lines into pronunciation for ${langInfo.name} speakers.`}
Use ${scriptRule.name} for every pronounceable lyric sound. Do not answer in the source lyric's writing system.${chineseToneUserHint}

<lyrics>
${normalizedText}
</lyrics>

Return exactly ${lineCount} pronunciation lines in ${scriptRule.name}, and nothing else.`;

        return { systemPrompt, userPrompt, lineCount };
    }

    // Pronunciation-first karaoke: split each line's existing pronunciation
    // across the line's timed units. Android and iOS send the same request.
    function buildTimedPronunciationPrompt({ items, lyricsText = '', sourceLang = 'auto' } = {}) {
        const payload = (Array.isArray(items) ? items : []).map(item => ({
            i: item.i,
            n: Array.isArray(item.u) ? item.u.length : 0,
            r: String(item.r ?? ''),
            u: Array.isArray(item.u) ? item.u : []
        }));
        const context = String(lyricsText ?? '').slice(0, 6000);
        return `You align lyric pronunciation to karaoke timing for ivLyrics.

Each item is one sung lyric line. u lists its timed karaoke units in order; each unit is [source text, start ms, end ms]. n is the number of units. r is the pronunciation of that line, already written in the reader's writing system.

Task: split r across the units so that p[k] is exactly the part of r that is sung during unit k.

Rules:
- Return ONLY valid JSON, no markdown or explanations: {"l":[{"i":0,"p":["..."]}]}
- Return one entry per input item with the same i.
- p must contain exactly n strings, one per unit, in unit order. Never merge, drop, add, or reorder slots.
- Use only the text of r, in its original order. Joining every p of an item must give back r; spaces may only move to unit boundaries. Do not translate, re-romanize, correct, or add anything to r.
- Put each sound on the unit whose source text produces it: kanji/hanzi readings on their characters, okurigana and particles on their own kana, a word's syllables across that word's units, a whole word on a word unit.
- If a reading cannot be divided between the units of one word, keep it on the first of those units and use "" for the rest of that word.
- Units that are only spaces or punctuation get "" unless r has a space there, in which case use " ".
- Keep the word spaces of r: end a unit's string with a space where r has a space after it.
- Use the timing only to understand how the line is sung (long notes, held vowels); never change r because of it.

Song lyrics for context only (do not output them):
${context}

Input source language: ${sourceLang}
Items:
${JSON.stringify(payload)}`;
    }

    const buildPronunciationSlotExamples = (scriptRule, lang) => {
        if (scriptRule?.id === 'ipa') {
            return `夢|な|ら|ば → jɯme |na|ɾa|ba
今|日|も → kʲoː||mo
hold|me|tight → hoʊld|mi|taɪt`;
        }
        if (scriptRule?.id === 'latin') {
            return `夢|な|ら|ば|ど|れ|ほ|ど → yume |na|ra|ba |do|re|ho|do   (reads "yume naraba dorehodo")
今|日|も → kyou||mo
走|っ|て → hashi|t|te
君|を|見|て|る → kimi |o |mi|te|ru   (never ki|mi|o|mi|teru)
사|랑|해|너|를 → sa|rang|hae|neo|reul   (reads "saranghae neoreul")`;
        }
        if (/^(ko|kr)(-|$)/i.test(String(lang || ''))) {
            return `夢|な|ら|ば|ど|れ|ほ|ど → 유메|나|라|바 |도|레|호|도   (reads "유메나라바 도레호도")
今|日|も → 쿄오||모
走|っ|て → 하싯||테
が|ら|ん|ど|う → 가|란||도|오   (never a lone letter such as ㄴ)
君|を|見|て|る → 키미|오 |미|테|루   (never 키|미|오|미|테루)
hold|me|tight → 홀드|미|타잇`;
        }
        return `夢|な|ら|ば → four fields: the reading of 夢, then of な, ら and ば, all in ${scriptRule?.name || 'the required script'}
今|日|も → the whole reading of 今日 in the first field, an empty second field, then the reading of も
hold|me|tight → one pronunciation per word`;
    };

    // Pronunciation for karaoke songs: each line comes split into its sung
    // units (separated by |) and the answer gives the pronunciation of every
    // unit in the same | fields, one line per line, so it streams like the
    // line pronunciation. The line pronunciation and the timing of each unit
    // come from this one request. Android and iOS send the same rules.
    function buildPronunciationSlotPrompt({
        lines,
        lang,
        providerId,
        pronunciationNotation = 'translation',
        sourceLang = 'auto',
        repair = false
    } = {}) {
        const rows = (Array.isArray(lines) ? lines : [])
            .map(units => (Array.isArray(units) ? units : []).map(unit => String(unit ?? '').replace(/[|｜\r\n]/g, ' ')).join('|'));
        const lineCount = rows.length;
        const policy = buildLyricsPronunciationPolicy({
            text: rows.map(row => row.replace(/\|/g, '')).join('\n'),
            lang,
            providerId,
            pronunciationNotation,
            sourceLang
        });

        const systemPrompt = `You are the pronunciation conversion system for ivLyrics karaoke.

${policy.audienceLine}

MANDATORY SCRIPT POLICY:
${policy.notationPolicy}

TASK:
Each input line is one lyric line already split into its sung units, separated by |. Japanese, Chinese and Korean text is split into single characters, space-separated text into whole words, and punctuation stays attached to a neighbouring unit.
Read the whole line first and decide its natural sung pronunciation in context. Then write that pronunciation split the same way: one output line per input line, with exactly as many |-separated fields as the input line has units. Field k is the part of the pronunciation sung on unit k.

RULES:
- This is a PRONUNCIATION task, not a translation task. Never translate the meaning.
- Return exactly ${lineCount} lines in the same order. Never merge, split, skip, or add lines.
- Each output line has exactly the same number of | separators as its input line. Never merge, drop, add, or reorder fields; an empty field is nothing between two | separators.
- Put no spaces around | except the one word-break space described below.
- Put each sound in the field of the unit that produces it: a kanji/hanzi reading on that character, okurigana and particles on their own kana, a whole word's pronunciation on a word unit.
- Never move part of one character's reading into a neighbouring field to fill fields: each reading stays on the character that produces it, even when that leaves an empty field.
- Small kana such as ゃ ゅ ょ ぁ ぃ ぅ ぇ ぉ join the previous kana's sound: leave their field empty. Put the sound of っ, ー and ん in their own field when the output script can write it there; otherwise leave it empty.
- When a reading cannot be divided between characters (for example 今日 or 大人), put the whole reading in the first character's field and leave the rest of that word empty.
- Never write a lone Hangul letter (jamo such as ㄴ, ㅅ, ㅇ). A sound that is only a final consonant (ん, っ) joins the previous syllable block as its final consonant, and its own field stays empty.
- Particles は, へ, を use their particle pronunciation when used as particles. Units without sound (punctuation, symbols) get an empty field.
- Spaces of the original line are restored automatically between units. Inside unspaced text (Japanese, Chinese) mark every word break yourself: end the last field of each word or particle phrase with one space (usually after particles such as は, が, を, に, で, と, も, and between separate words), exactly where a natural pronunciation line would have a space. A long line must not come out as one unbroken run.
- Do not add line numbers, labels, explanations, JSON, Markdown, or code fences.

SCRIPT EXAMPLES:
${policy.scriptExamples}

FIELD EXAMPLES (input line → output line):
${buildPronunciationSlotExamples(policy.scriptRule, lang)}`;

        const userPrompt = `${policy.personalStudyPrefix}Convert the following ${lineCount} lyric lines into pronunciation split by unit. Source-language hint: ${policy.sourceLanguageHint}.${policy.chineseToneUserHint}${repair ? '\nAn earlier answer for these lines had the wrong number of | fields or the wrong writing system. Count the units of every line again.' : ''}

<lyrics>
${rows.join('\n')}
</lyrics>

Return exactly ${lineCount} lines, each with the same number of | fields as its input line, and nothing else.`;

        return { systemPrompt, userPrompt, lineCount };
    }

    // Lone Hangul letters are never a readable pronunciation (ん written as ㄴ).
    const PRONUNCIATION_SLOT_LONE_JAMO_RE = /[\u1100-\u11FF\u3131-\u318E\uA960-\uA97F\uD7B0-\uD7FF]/u;
    // Reasoning models think longer than linearly with the lines of a request
    // (gpt-6-luna: one line 6 s, two 14 s, three up to 29 s, seven up to 60 s),
    // so a song's unit pronunciation goes out as small requests side by side,
    // and the opening line goes out alone to show within seconds.
    const PRONUNCIATION_PARALLEL_REQUESTS = 12;
    const PRONUNCIATION_BATCH_LINES = 2;
    const PRONUNCIATION_BATCH_UNITS = 60;
    // A rate-limited request is sent again this many times, after a pause.
    const PRONUNCIATION_RATE_LIMIT_RETRIES = 3;
    const PRONUNCIATION_RATE_LIMIT_PAUSE_MS = 1500;

    const isRateLimitError = (error) => {
        if (!error) return false;
        if (Number(error.status) === 429 || Number(error.statusCode) === 429) return true;
        return /\b429\b|rate.?limit|too many requests|resource.?exhausted/i.test(String(error.message || ''));
    };

    /**
     * Runs batches side by side, in order. `run(batch)` may return follow-up
     * batches (repairs), which go out next. A rate-limited batch halves the
     * requests in flight and is sent again after a pause, so a provider that
     * refuses parallel requests still gets the song one request at a time.
     * A superseded request stops the remaining batches.
     * @returns {Promise<Error[]>} Errors of the batches that failed for good.
     */
    const runParallelBatches = (batches, run, {
        limit = PRONUNCIATION_PARALLEL_REQUESTS,
        retries = PRONUNCIATION_RATE_LIMIT_RETRIES,
        pauseMs = PRONUNCIATION_RATE_LIMIT_PAUSE_MS,
        wait = waitForAiRetry,
        signal,
    } = {}) => new Promise((resolve) => {
        const queue = batches.map(batch => ({ batch, attempt: 0 }));
        const errors = [];
        let allowed = Math.max(1, limit);
        let active = 0;
        let stopped = false;
        const settle = async (job) => {
            try {
                const followUps = await run(job.batch);
                if (!stopped && Array.isArray(followUps) && followUps.length > 0) {
                    queue.unshift(...followUps.map(batch => ({ batch, attempt: 0 })));
                }
            } catch (error) {
                if (isSupersededAbort(error)) {
                    stopped = true;
                    errors.push(error);
                } else if (!stopped && isRateLimitError(error) && job.attempt < retries) {
                    allowed = Math.min(allowed, Math.max(1, Math.floor(active / 2)));
                    // The slot stays taken while waiting, which keeps the pressure down.
                    try {
                        await wait(pauseMs * (2 ** job.attempt), signal);
                        if (!stopped) queue.unshift({ batch: job.batch, attempt: job.attempt + 1 });
                    } catch (error) {
                        errors.push(signal?.aborted ? supersededAiRequest(signal.reason) : error);
                        if (signal?.aborted || isSupersededAbort(error)) stopped = true;
                    }
                } else {
                    errors.push(error);
                }
            } finally {
                active -= 1;
                pump();
            }
        };
        const pump = () => {
            if (!stopped && signal?.aborted) {
                stopped = true;
                errors.push(supersededAiRequest(signal.reason));
            }
            while (!stopped && active < allowed && queue.length > 0) {
                active += 1;
                settle(queue.shift());
            }
            if (active === 0 && (stopped || queue.length === 0)) resolve(errors);
        };
        pump();
    });

    /**
     * Unit pronunciations of one answered line: exactly the expected number
     * of | fields, some sound, no lone Hangul letter, the notation's script.
     * Null otherwise.
     */
    const parsePronunciationSlotRow = (value, expected, notation = 'translation') => {
        let fields = String(value ?? '').replace(/[\r\n]+/g, '').split(/[|｜]/);
        // A row wrapped in outer pipes ("|a|b|").
        if (fields.length === expected + 2 && !fields[0].trim() && !fields[fields.length - 1].trim()) {
            fields = fields.slice(1, -1);
        }
        if (fields.length !== expected) return null;
        // Rows written as "a | b | c" carry no word breaks.
        const padded = fields.length > 1
            && fields.slice(0, -1).every(field => field.endsWith(' '))
            && fields.slice(1).every(field => field.startsWith(' '));
        const parts = fields.map((field, index) => {
            let part = field;
            if (padded) {
                if (index > 0) part = part.replace(/^ /, '');
                if (index < fields.length - 1) part = part.replace(/ $/, '');
            }
            return part.replace(/^\s+/, '').replace(/\s+/g, ' ');
        });
        if (!parts.some(part => part.trim())) return null;
        if (parts.some(part => PRONUNCIATION_SLOT_LONE_JAMO_RE.test(part))) return null;
        if (!isPronunciationInNotationScript(parts.join(''), notation)) return null;
        return parts;
    };

    function buildCharacterPronunciationPrompt({ lines, lang = 'ko', sourceLang = 'auto', unitMode = 'char' } = {}) {
        const safeLines = (Array.isArray(lines) ? lines : []).map(line => String(line ?? ''));
        const langInfo = getProviderPromptLanguageInfo(lang);
        const scriptRule = getPronunciationScriptRule(lang);
        const isWordMode = unitMode === 'word';
        const payload = safeLines.map((text, index) => {
            const chars = Array.from(text);
            return isWordMode
                ? { i: index, t: text, n: chars.length }
                : { i: index, a: chars, n: chars.length };
        });
        const outputRules = isWordMode
            ? `- Output compact JSON only: top key l; each line has i and u; each pronunciation item has s=start character index, e=end character index, and p=whole word pronunciation.
- Split each line by whitespace into word/token ranges. Do not split alphabetic words into letters.
- Omit whitespace and punctuation-only tokens from u to save tokens.
- p must be one natural spoken pronunciation for the whole word/token, written in ${scriptRule.name}.`
            : `- Output compact JSON only: top key l; each line has i and p.
- p must be an array of exactly n strings, one per input character a[index]. Count every entry of a, including spaces and punctuation; each gets its own p slot (use "" where it has no sound).
- If n is 12, p must contain exactly 12 strings. An array with 11 or 13 strings is invalid even if the pronunciation sounds correct.
- Use an empty string for characters with no separate pronunciation. Never omit array slots to shorten the array.
- Each p[index] must be short and written in ${scriptRule.name}.
- Self-check before responding: for every line, verify p.length === n. If not, recount a positions and fix the array before responding.`;
        const alignmentRules = isWordMode
            ? `- For alphabetic and whitespace-separated languages, convert each whole word to spoken pronunciation once. Do not assign syllables to individual letters.
- Example: English "hello" should be one unit like {"s":0,"e":4,"p":"??"}, not h=?/e=?/l=?.
- For contractions, liaison, vowel reduction, doubled consonants, and connected-speech effects, prefer natural sung pronunciation over literal spelling.`
            : `- For alphabetic languages, do not spell letters one by one. Convert words to spoken pronunciation first, then place that sound into the matching source character slots.
- For digraphs or combined letters (sh, ch, th, ph, qu, ll, etc.), put the combined sound in one source character slot and leave helper slots empty if needed.
- For silent letters, use an empty string in that source character slot.
- For contractions, liaison, vowel reduction, doubled consonants, and other connected-speech effects, prefer natural sung pronunciation over literal spelling.`;
        const outputShape = isWordMode
            ? '{"l":[{"i":0,"u":[{"s":0,"e":4,"p":"??"}]}]}'
            : '{"l":[{"i":0,"p":["?"]}]}';
        const targetExamples = buildCharacterPronunciationTargetExamples(scriptRule, lang, isWordMode);
        const chineseToneRule = isChinesePronunciationTask(sourceLang, safeLines.join('\n'))
            ? buildChineseTonePolicyRule(scriptRule)
            : '';

        return `You are a multilingual lyrics pronunciation aligner for karaoke sync editing.

Task:
- Read each full lyric line first, infer the natural pronunciation in context for the input source language (${sourceLang}), then align that sound back onto the original lyric text for karaoke timing.
- Return ${isWordMode ? 'word-level' : 'character-level'} pronunciation hints for ${langInfo.name} (${langInfo.native}) speakers, written only in ${scriptRule.name}; this is not a meaning translation.
- Do NOT pronounce each character in isolation. The output must sound natural when the character hints are read in sequence.

Rules:
- Return ONLY valid JSON. No markdown, no code fences, no explanations.
- The first response character must be { and the last response character must be }. Never wrap JSON in markdown fences.
- Preserve every line index.
- Input uses compact keys: i=line index and n=character count. In character mode, a is the exact source character array and output p must align to a by array position. In word mode, t is the line text.
- In character mode, never output c or index-numbered pronunciation items. Output p as exactly n strings. p[k] is the pronunciation for source character a[k], and may contain multiple target syllables or be empty.
${outputRules}
${alignmentRules}
- The target language determines the output writing system. The source lyric language never determines it.
- ${scriptRule.instruction}${chineseToneRule ? `\n${chineseToneRule}` : ''}
- Before answering, inspect every pronunciation value. Rewrite any pronounceable token that is not written in ${scriptRule.name}.
- For syllabic scripts, align by natural syllable sound while keeping exactly one p array slot per source character.
- For logographic scripts such as hanzi/kanji/hanja, infer the common reading from the word and put each source character's reading in that character's p slot. If a character has no separate sound, use an empty string.
- For mixed writing systems, keep pronounced suffix/helper characters aligned to their own source characters. Do not hide a following character's sound inside the previous base character.
- For Japanese specifically, handle kanji, okurigana, small kana, and sound changes naturally:
  - Never shift readings after small kana or ん. Each p array slot is tied to the exact original source character at the same array position.
  - In character mode, keep timing alignment per source character. Do not merge ordinary kana/okurigana into the previous kanji.
  - For okurigana, put its spoken sound on that kana's own slot.
  - Do not compress several source characters into one p slot.
  - small っ should be a geminated consonant or brief stop, not full-size つ.
  - small ゃ/ゅ/ょ should combine with the previous kana; keep the small kana slot as an empty string "" (never omit the slot) unless the target writing system truly needs a separate mark.
  - ん should use the context-sensitive nasal sound at the ん character itself. Do not put the next character's pronunciation on ん.
  - long vowels and vowel sequences such as ー, おう, えい, ああ should preserve length naturally.
  - particles は, へ, を should use the particle pronunciation when clearly used as particles.
${targetExamples}

Return this compact JSON shape:
${outputShape}

Input source language: ${sourceLang}
Pronunciation unit mode: ${unitMode}
Input lines:
${JSON.stringify(payload)}`;
    }


export {
    CHARACTER_PRONUNCIATION_CJK_LANG_RE,
    CHARACTER_PRONUNCIATION_CJK_SCRIPT_RE,
    CHARACTER_PRONUNCIATION_WORD_TEXT_RE,
    CHARACTER_PRONUNCIATION_LETTER_RE,
    CHARACTER_PRONUNCIATION_LATIN_LETTER_RE,
    isChinesePronunciationTask,
    getPronunciationScriptRule,
    normalizeLyricsPronunciationNotation,
    stripWordListPrefix,
    validateLyricsTranslationResult,
    validateLyricsPhoneticWritingSystem,
    buildLyricsPhoneticPrompt,
    buildTimedPronunciationPrompt,
    buildPronunciationSlotPrompt,
    PRONUNCIATION_BATCH_LINES,
    PRONUNCIATION_BATCH_UNITS,
    isSupersededAbort,
    runParallelBatches,
    parsePronunciationSlotRow,
    buildCharacterPronunciationPrompt,
};
