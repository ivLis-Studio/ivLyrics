import { PROMPT_VERSION, STUDY_DIFFICULTIES, buildCacheKey, getTrackId, hashNumber, normalizeStudyDifficulty } from "./studyIdentity.mjs";
import { getLineEndTime, getLineStartTime } from "./studyLyrics.mjs";

const MAX_EXPRESSION_EXPANSIONS = 5;
const MAX_QUIZ_ITEMS = 12;
const MAX_QUIZ_CANDIDATES = 36;

export const normalizeQuizType = (value) => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "");
    if (normalized === "blank" || normalized === "fillblank" || normalized === "fillintheblank" || normalized === "cloze") return "blank";
    if (normalized === "usage" || normalized === "context" || normalized === "situation" || normalized === "transfer") return "usage";
    if (normalized === "rewrite" || normalized === "rephrase" || normalized === "paraphrase") return "rewrite";
    if (normalized === "grammar" || normalized === "form" || normalized === "structure") return "grammar";
    return "meaning";
};

const QUIZ_BLANK_MARKER_PATTERN = /(__+|\[blank\]|\{blank\}|<blank>)/i;
export const shouldShowQuizSource = (quiz) => {
    if (!quiz?.sourceText) return false;
    if (normalizeQuizType(quiz.type) === "blank") return false;
    return !QUIZ_BLANK_MARKER_PATTERN.test(String(quiz.question || ""));
};

const asArray = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
};

const asIndexArray = (value) => {
    const list = Array.isArray(value) ? value : [value];
    return list
        .map((item) => Number(item))
        .filter(Number.isFinite);
};

const normalizeTextList = (value) => {
    const list = Array.isArray(value)
        ? value
        : typeof value === "string" && value.trim()
            ? value.split(/[,/·]|;|\n/g)
            : value
                ? [value]
                : [];
    return list
        .map((item) => {
            if (typeof item === "string" || typeof item === "number") return String(item).trim();
            return String(item?.term || item?.word || item?.expression || item?.form || item?.label || item?.text || "").trim();
        })
        .filter(Boolean)
        .slice(0, 6);
};

const shuffleQuizChoices = (choices, answerIndex, seed = 0) => {
    const safeChoices = choices.slice(0, 4);
    const safeAnswerIndex = Math.max(0, Math.min(safeChoices.length - 1, Number(answerIndex) || 0));
    const indexed = safeChoices.map((choice, index) => ({ choice, originalIndex: index }));
    indexed.sort((a, b) => (
        hashNumber(`${seed}:${a.choice}:${a.originalIndex}`) - hashNumber(`${seed}:${b.choice}:${b.originalIndex}`)
    ));
    if (indexed[0]?.originalIndex === safeAnswerIndex && indexed.length > 1) {
        const swapIndex = (hashNumber(`${seed}:answer-offset`) % (indexed.length - 1)) + 1;
        [indexed[0], indexed[swapIndex]] = [indexed[swapIndex], indexed[0]];
    }
    return {
        choices: indexed.map((item) => item.choice),
        answerIndex: indexed.findIndex((item) => item.originalIndex === safeAnswerIndex)
    };
};

const normalizeQuizComparableText = (value) => String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/["'`“”‘’「」『』,.;:!?！？。、，、·・()[\]{}<>/\\|~～_+=-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractQuotedQuizText = (value) => {
    const text = String(value || "");
    const match = text.match(/["“”'‘’「『](.*?)["“”'‘’」』]/);
    return match?.[1] || "";
};

const dedupeQuizItems = (items, maxItems = MAX_QUIZ_ITEMS) => {
    const seenSources = new Set();
    const seenQuestions = new Set();
    const result = [];

    for (const item of asArray(items)) {
        const sourceKey = normalizeQuizComparableText(item.sourceText || extractQuotedQuizText(item.question));
        const questionKey = normalizeQuizComparableText(item.question);

        if (sourceKey && seenSources.has(sourceKey)) continue;
        if (!sourceKey && questionKey && seenQuestions.has(questionKey)) continue;

        result.push(item);
        if (sourceKey) seenSources.add(sourceKey);
        if (questionKey) seenQuestions.add(questionKey);
        if (result.length >= maxItems) break;
    }

    return result;
};

export const normalizeGrammarItem = (item) => {
    if (!item) return null;
    if (typeof item === "string") {
        const text = item.trim();
        return text ? { pattern: text, explanation: "", note: "" } : null;
    }

    const pattern = String(
        item.pattern
        || item.structure
        || item.form
        || item.expression
        || item.title
        || item.grammar
        || ""
    ).trim();
    const explanation = String(item.explanation || item.meaning || item.description || "").trim();
    const note = String(item.note || item.nuance || item.usage || item.example || "").trim();
    const fallback = String(item.text || item.value || "").trim();
    const title = pattern || fallback || explanation;
    if (!title) return null;

    return {
        pattern: title,
        explanation: pattern ? explanation : "",
        note
    };
};

export const normalizeGrammarList = (items) => {
    const list = Array.isArray(items)
        ? items
        : typeof items === "string" && items.trim()
            ? [items.trim()]
            : items
                ? [items]
                : [];
    return list.map(normalizeGrammarItem).filter(Boolean);
};

const LOCAL_SCRIPT_PRONUNCIATION_PATTERN = /[ㄱ-ㅎㅏ-ㅣ가-힣ぁ-ゟ゠-ヿ一-龯々〇]/u;
const IPA_SYMBOL_PATTERN = /[ɑɐɒæɓʙβɔɕçɗɖðəɚɛɜɝɞɟɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɯɰŋɳɲɴøɵɸœɶɹɻɾɽʀʁɺʂʃʈθʊʉʌʋⱱʍχʎʏʑʐʒʔʕʡʢʰʲʷˈˌːˑ̩̯̃]/u;
const PHONETIC_MARK_PATTERN = /[/[\]ˈˌːˑ̩̯̃]/u;
// deno-lint-ignore no-control-regex
const ASCII_ONLY_PATTERN = /^[\x00-\x7F]+$/;
export const normalizePronunciation = (value) => {
    const text = String(value || "").normalize("NFC").trim();
    if (!text) return "";
    if (LOCAL_SCRIPT_PRONUNCIATION_PATTERN.test(text)) return "";
    const hasIpaSignal = IPA_SYMBOL_PATTERN.test(text) || PHONETIC_MARK_PATTERN.test(text);
    if (!hasIpaSignal && ASCII_ONLY_PATTERN.test(text)) return "";
    return text;
};

const normalizeVocabulary = (items) => asArray(items).map((item) => {
    if (typeof item === "string") {
        return { term: item, meaning: "", note: "", pronunciation: "", reading: "" };
    }
    return {
        term: String(item.term || item.word || item.expression || "").trim(),
        meaning: String(item.meaning || item.translation || "").trim(),
        note: String(item.note || item.example || "").trim(),
        pronunciation: normalizePronunciation(item.pronunciation || item.phonetic || item.romanization || item.romaji),
        reading: String(item.reading || item.hiragana || item.furigana || item.kana || "").trim()
    };
}).filter((item) => item.term);

const getPronunciation = (item) =>
    normalizePronunciation(item?.pronunciation || item?.phonetic || item?.romanization || item?.romaji);

const getReading = (item) =>
    String(item?.reading || item?.hiragana || item?.furigana || item?.kana || "").trim();

export const normalizeStudyPack = ({ raw, sourceLines = [], trackId, trackUri, title, artist, provider, targetLang, difficulty = "normal", lyricsHash, cacheKey, omittedCount }) => {
    const sourceByIndex = new Map(
        asArray(sourceLines)
            .map((line) => [Number(line?.index), String(line?.text || "").trim()])
            .filter(([index, text]) => Number.isFinite(index) && text)
    );
    const startTimeByIndex = new Map(
        asArray(sourceLines)
            .map((line) => [Number(line?.index), getLineStartTime(line)])
            .filter(([index, startTime]) => Number.isFinite(index) && Number.isFinite(startTime))
    );
    const endTimeByIndex = new Map(
        asArray(sourceLines)
            .map((line) => [Number(line?.index), getLineEndTime(line)])
            .filter(([index, endTime]) => Number.isFinite(index) && Number.isFinite(endTime))
    );
    const rawLineMetaByIndex = new Map(
        asArray(raw?.lines)
            .map((line) => {
                const index = Number(line?.index ?? line?.lineIndex);
                return [index, {
                    pronunciation: getPronunciation(line),
                    reading: getReading(line)
                }];
            })
            .filter(([index]) => Number.isFinite(index))
    );
    const getSourceText = (index) => {
        if (index === null || index === undefined) return "";
        const numericIndex = Number(index);
        return Number.isFinite(numericIndex) ? sourceByIndex.get(numericIndex) || "" : "";
    };
    const getLineMeta = (index) => {
        if (index === null || index === undefined) return {};
        const numericIndex = Number(index);
        return Number.isFinite(numericIndex) ? rawLineMetaByIndex.get(numericIndex) || {} : {};
    };
    const getStartTime = (index) => {
        if (index === null || index === undefined) return null;
        const numericIndex = Number(index);
        return Number.isFinite(numericIndex) ? startTimeByIndex.get(numericIndex) ?? null : null;
    };
    const getEndTime = (index) => {
        if (index === null || index === undefined) return null;
        const numericIndex = Number(index);
        return Number.isFinite(numericIndex) ? endTimeByIndex.get(numericIndex) ?? null : null;
    };

    const lineItems = asArray(raw?.lines).map((line) => {
        const index = Number(line?.index ?? line?.lineIndex);
        return {
            index,
            sourceText: String(line?.sourceText || getSourceText(index)).trim(),
            startTime: getStartTime(index),
            endTime: getEndTime(index),
            pronunciation: getPronunciation(line),
            reading: getReading(line),
            translation: String(line?.translation || "").trim(),
            explanation: String(line?.explanation || line?.note || "").trim(),
            grammar: normalizeGrammarList(line?.grammar),
            vocabulary: normalizeVocabulary(line?.vocabulary)
        };
    }).filter((line) => Number.isFinite(line.index));

    const keyExpressions = asArray(raw?.keyExpressions).map((item) => {
        if (typeof item === "string") {
            return { expression: item, meaning: "", note: "", lineIndexes: [] };
        }
        const lineIndexes = asIndexArray(item.lineIndexes);
        return {
            expression: String(item.expression || item.term || "").trim(),
            meaning: String(item.meaning || item.translation || "").trim(),
            note: String(item.note || item.explanation || "").trim(),
            pronunciation: getPronunciation(item),
            reading: getReading(item),
            alternatives: normalizeTextList(item.alternatives || item.substitutes || item.synonyms || item.similarWords),
            forms: normalizeTextList(item.forms || item.inflections || item.variants || item.conjugations),
            relatedWords: normalizeTextList(item.relatedWords || item.related || item.wordFamily),
            lineIndexes,
            sourceText: lineIndexes.map(getSourceText).find(Boolean) || "",
            trackUri,
            startTime: lineIndexes.map(getStartTime).find((value) => Number.isFinite(value)) ?? null,
            endTime: lineIndexes.map(getEndTime).find((value) => Number.isFinite(value)) ?? null
        };
    }).filter((item) => item.expression);

    const quiz = dedupeQuizItems(asArray(raw?.quiz).map((item, index) => {
        const choices = asArray(item?.choices).map((choice) => String(choice).trim()).filter(Boolean).slice(0, 4);
        const answerIndex = Number(item?.answerIndex);
        const lineIndex = Number.isFinite(Number(item?.lineIndex)) ? Number(item.lineIndex) : null;
        const lineMeta = getLineMeta(lineIndex);
        const shuffled = shuffleQuizChoices(choices, answerIndex, `${cacheKey}:${index}:${item?.question || ""}`);
        return {
            id: String(item?.id || `quiz-${index}`),
            type: normalizeQuizType(item?.type),
            question: String(item?.question || "").trim(),
            choices: shuffled.choices,
            answerIndex: shuffled.answerIndex >= 0 ? shuffled.answerIndex : 0,
            explanation: String(item?.explanation || "").trim(),
            lineIndex,
            sourceText: String(item?.sourceText || getSourceText(lineIndex)).trim(),
            startTime: getStartTime(lineIndex),
            endTime: getEndTime(lineIndex),
            pronunciation: getPronunciation(item) || lineMeta.pronunciation || "",
            reading: getReading(item) || lineMeta.reading || ""
        };
    }).filter((item) => item.question && item.choices.length >= 2));

    return {
        cacheKey,
        trackId,
        trackUri,
        title,
        artist,
        provider: provider || "",
        targetLang,
        difficulty: normalizeStudyDifficulty(difficulty),
        quizDifficulty: normalizeStudyDifficulty(raw?.quizDifficulty || difficulty),
        lyricsHash,
        promptVersion: PROMPT_VERSION,
        summary: String(raw?.summary || "").trim(),
        keyExpressions,
        lines: lineItems,
        quiz,
        omittedCount,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
};

export const prepareStudyPackForDisplay = (pack) => {
    if (!pack || pack.quizRevision || !Array.isArray(pack.quiz) || pack.quiz.length === 0) return pack;
    const shouldShuffle = pack.quiz.length > 1
        && pack.quiz.every((item) => Number(item?.answerIndex) === 0);
    if (!shouldShuffle) return pack;
    return {
        ...pack,
        quiz: pack.quiz.map((item, index) => {
            const choices = asArray(item?.choices).map((choice) => String(choice).trim()).filter(Boolean);
            if (choices.length < 2) return item;
            const shuffled = shuffleQuizChoices(choices, item.answerIndex, `${pack.cacheKey || ""}:${item.id || index}:${item.question || ""}`);
            return {
                ...item,
                choices: shuffled.choices,
                answerIndex: shuffled.answerIndex >= 0 ? shuffled.answerIndex : 0
            };
        })
    };
};

function historyStudyDifficulty(pack) {
    // Older quiz replacements copied their difficulty onto the lesson while
    // keeping the lesson's original cache key.
    const trackUri = pack.trackUri || pack.trackId;
    return STUDY_DIFFICULTIES.find(difficulty => buildCacheKey({
        trackUri, lyricsHash: pack.lyricsHash, targetLang: pack.targetLang, difficulty,
    }) === pack.cacheKey) || normalizeStudyDifficulty(pack.difficulty);
}

export const normalizeStudyHistory = (packs) => {
    const seen = new Set();
    return asArray(packs)
        .filter((pack) => pack?.cacheKey && (pack.trackUri || pack.trackId))
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        .filter((pack) => {
            if (seen.has(pack.cacheKey)) return false;
            seen.add(pack.cacheKey);
            return true;
        })
        .map((pack) => ({
            cacheKey: pack.cacheKey,
            trackId: pack.trackId || getTrackId(pack.trackUri),
            trackUri: pack.trackUri || (pack.trackId ? `spotify:track:${pack.trackId}` : ""),
            title: String(pack.title || "").trim(),
            artist: String(pack.artist || "").trim(),
            targetLang: pack.targetLang || "",
            difficulty: historyStudyDifficulty(pack),
            quizCount: Array.isArray(pack.quiz) ? pack.quiz.length : pack.quizCount || 0,
            lineCount: Array.isArray(pack.lines) ? pack.lines.length : pack.lineCount || 0,
            updatedAt: pack.updatedAt || pack.createdAt || 0
        }));
};

export const mergeStudyResponses = (responses) => {
    const merged = {
        summary: "",
        keyExpressions: [],
        lines: [],
        quiz: []
    };
    const expressionKeys = new Set();
    const lineIndexes = new Set();

    for (const response of responses.filter(Boolean)) {
        if (response.summary) {
            merged.summary = [merged.summary, String(response.summary).trim()]
                .filter(Boolean)
                .join("\n\n");
        }

        for (const item of asArray(response.keyExpressions)) {
            const key = `${String(item?.expression || "").trim().toLowerCase()}|${String(item?.meaning || "").trim().toLowerCase()}`;
            if (!key.trim() || expressionKeys.has(key)) continue;
            expressionKeys.add(key);
            merged.keyExpressions.push(item);
        }

        for (const line of asArray(response.lines)) {
            const index = Number(line?.index ?? line?.lineIndex);
            if (!Number.isFinite(index) || lineIndexes.has(index)) continue;
            lineIndexes.add(index);
            merged.lines.push({ ...line, index });
        }

        for (const item of asArray(response.quiz)) {
            merged.quiz.push(item);
        }
    }

    merged.lines.sort((a, b) => a.index - b.index);
    merged.keyExpressions = merged.keyExpressions.slice(0, MAX_EXPRESSION_EXPANSIONS);
    merged.quiz = merged.quiz.slice(0, MAX_QUIZ_CANDIDATES);
    return merged;
};
