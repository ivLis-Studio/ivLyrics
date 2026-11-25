const PRONUNCIATION_MODES = new Set([
    "gemini_romaji",
    "romaji",
    "romaja",
    "pinyin",
    "hiragana",
    "katakana",
    "furigana"
]);

const normalizeMode = (mode) => String(mode ?? "").trim().toLowerCase();

const isActiveMode = (mode) => {
    const normalized = normalizeMode(mode);
    return normalized !== "" && normalized !== "none";
};

export const isPronunciationMode = (mode) =>
    PRONUNCIATION_MODES.has(normalizeMode(mode));

const getTargetField = (mode) =>
    isPronunciationMode(mode) ? "phonetic" : "translation";

export const isAiMode = (mode) => normalizeMode(mode).startsWith("gemini");

const normalizeLanguage = (language) => {
    const normalized = String(language ?? "").trim().toLowerCase().replace(/_/g, "-");
    if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
    if (normalized === "ko" || normalized.startsWith("ko-")) return "ko";
    if (
        normalized === "zh" ||
        normalized === "zh-cn" ||
        normalized === "zh-hans" ||
        normalized.startsWith("zh-hans-") ||
        normalized === "zh-sg" ||
        normalized === "zh-my"
    ) return "zh-hans";
    if (
        normalized === "zh-tw" ||
        normalized === "zh-hant" ||
        normalized.startsWith("zh-hant-") ||
        normalized === "zh-hk" ||
        normalized === "zh-mo"
    ) return "zh-hant";
    return normalized;
};

const needsTraditionalConverter = (language, mode) => {
    const sourceLanguage = normalizeLanguage(language);
    const targetMode = normalizeMode(mode);
    if (sourceLanguage === "ja") {
        return ["romaji", "furigana", "hiragana", "katakana"].includes(targetMode);
    }
    if (sourceLanguage === "ko") {
        return targetMode === "romaja";
    }
    if (sourceLanguage === "zh-hans" || sourceLanguage === "zh-hant") {
        return ["pinyin", "cn", "tw", "hk"].includes(targetMode)
            && !(sourceLanguage === "zh-hans" && targetMode === "cn");
    }
    return false;
};

export function createLyricTranslationModes({ getTranslator, checkSectionHeader }) {
    const isSectionHeader = (text) => {
        const value = String(text ?? "").trim();
        if (!value) return true;
        try {
            const section = checkSectionHeader(value);
            if (typeof section === "boolean") return section;
        } catch {
            // Fall back to standard section labels if the host check is unavailable.
        }
        // Keep common section labels untouched when Utils is not available.
        return /^\s*\[\s*(?:verse|chorus|bridge|intro|outro|pre-?chorus|hook|refrain|절|후렴|브릿지|인트로|아웃트로)\b[^\]]*\]\s*$/iu.test(value);
    };

    const convertText = async (translator, language, mode, text) => {
        const value = String(text ?? "");
        if (!value.trim() || isSectionHeader(value)) return value;

        const sourceLanguage = normalizeLanguage(language);
        const targetMode = normalizeMode(mode);

        if (sourceLanguage === "ja") {
            const map = {
                romaji: { target: "romaji", mode: "spaced" },
                // The overlay consumes supplements as plain text. The page's
                // own converter still requests ruby markup for its renderer;
                // fallback/extension delivery uses the readable hiragana form.
                furigana: { target: "hiragana", mode: "normal" },
                hiragana: { target: "hiragana", mode: "normal" },
                katakana: { target: "katakana", mode: "normal" }
            };
            const target = map[targetMode];
            if (!target) return value;
            if (typeof translator?.romajifyText !== "function") {
                throw new Error("Japanese converter not initialized");
            }
            return await translator.romajifyText(value, target.target, target.mode);
        }

        if (sourceLanguage === "ko") {
            if (targetMode !== "romaja") return value;
            if (typeof translator?.convertToRomaja !== "function") {
                throw new Error("Korean converter not initialized");
            }
            return await translator.convertToRomaja(value, targetMode);
        }

        if (sourceLanguage === "zh-hans" || sourceLanguage === "zh-hant") {
            if (targetMode === "pinyin") {
                if (typeof translator?.convertToPinyin !== "function") {
                    throw new Error("Chinese pinyin converter not initialized");
                }
                return await translator.convertToPinyin(value, {
                    toneType: "mark",
                    type: "string"
                });
            }

            const map = sourceLanguage === "zh-hans"
                ? {
                    cn: { from: "cn", target: "cn" },
                    tw: { from: "cn", target: "tw" },
                    hk: { from: "cn", target: "hk" }
                }
                : {
                    cn: { from: "t", target: "cn" },
                    tw: { from: "t", target: "tw" },
                    hk: { from: "t", target: "hk" }
                };
            const target = map[targetMode];
            if (!target) return value;
            // A same-script request is a valid no-op. OpenCC still handles it
            // consistently when available, but avoiding the call also keeps a
            // missing CDN from turning a harmless no-op into a failure.
            if (sourceLanguage === "zh-hans" && targetMode === "cn") return value;
            if (typeof translator?.convertChinese !== "function") {
                throw new Error("Chinese converter not initialized");
            }
            return await translator.convertChinese(value, target.from, target.target);
        }

        // Modes that do not apply to the detected language retain the original
        // line, matching the page's traditional-conversion behavior.
        return value;
    };

    const convertTraditional = async ({ language, mode, texts, translator }) => {
        if (!Array.isArray(texts)) {
            throw new Error("Invalid lyric text list for conversion");
        }
        if (!isActiveMode(mode) || isAiMode(mode)) return texts.map((text) => String(text ?? ""));
        if (!needsTraditionalConverter(language, mode)) {
            return texts.map((text) => String(text ?? ""));
        }

        let converter = translator;
        if (!converter) {
            const Translator = getTranslator();
            if (typeof Translator === "function") {
                converter = new Translator(language);
            } else {
                converter = Translator;
            }
        }
        if (!converter) throw new Error("Translator is not available");
        if (typeof converter.awaitFinished === "function") {
            await converter.awaitFinished(language);
        }

        return Promise.all(texts.map((text) => convertText(converter, language, mode, text)));
    };

    return Object.freeze({
        pronunciationModes: Object.freeze([...PRONUNCIATION_MODES]),
        normalizeMode,
        normalizeLanguage,
        isActiveMode,
        isPronunciationMode,
        getTargetField,
        isAiMode,
        needsTraditionalConverter,
        convertTraditional
    });
}
