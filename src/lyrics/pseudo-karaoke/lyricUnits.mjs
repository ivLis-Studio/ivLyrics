import { clamp, clamp01 } from "./timingMath.mjs";

const AGGRESSIVE_SCRIPT_REGEX = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const HANGUL_BASE_CODE = 0xac00;
const HANGUL_END_CODE = 0xd7a3;
const HANGUL_JUNGSEONG_COUNT = 21;
const HANGUL_JONGSEONG_COUNT = 28;
const HANGUL_COMPLEX_VOWELS = new Set([9, 10, 11, 14, 15, 16, 19]);
const HANGUL_SUSTAIN_FINALS = new Set([4, 8, 16, 21, 27]);
const KOREAN_SHORT_PARTICLES = new Set(['은', '는', '이', '가', '을', '를', '도', '만', '에', '엔', '로', '으로', '와', '과', '랑', '이랑', '한테', '께', '의', '야']);
const JAPANESE_SMALL_KANA_REGEX = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮヵヶ]/;
const JAPANESE_PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'と', 'も', 'で', 'の', 'ね', 'よ', 'か', 'な', 'さ']);
const HAN_PARTICLES = new Set(['的', '了', '吗', '呢', '啊', '呀', '吧', '啦', '嘛', '着', '过']);
const LATIN_CONNECTOR_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but']);
const UNIT_PUNCTUATION_REGEX = /[.,!?;:'"()[\]{}-]/;

function isAggressiveChar(char) {
    return AGGRESSIVE_SCRIPT_REGEX.test(char);
}

function isHangulSyllable(char) {
    if (!char) return false;
    const code = char.codePointAt(0);
    return code >= HANGUL_BASE_CODE && code <= HANGUL_END_CODE;
}

function isJapaneseChar(char) {
    if (!char) return false;
    return /[\u3040-\u30ff\u31f0-\u31ffー]/.test(char);
}

function isHanChar(char) {
    if (!char) return false;
    return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char);
}

function getHangulSyllableMeta(char) {
    if (!isHangulSyllable(char)) return null;
    const offset = char.codePointAt(0) - HANGUL_BASE_CODE;
    const jongseongIndex = offset % HANGUL_JONGSEONG_COUNT;
    const jungseongIndex = Math.floor(offset / HANGUL_JONGSEONG_COUNT) % HANGUL_JUNGSEONG_COUNT;
    return { jungseongIndex, jongseongIndex };
}

function getHangulUnitWeight(text, repeatedCount) {
    const chars = Array.from(text);
    let total = 0;

    for (const char of chars) {
        const meta = getHangulSyllableMeta(char);
        if (!meta) {
            total += 0.8;
            continue;
        }

        let syllableWeight = 0.96;
        if (HANGUL_COMPLEX_VOWELS.has(meta.jungseongIndex)) syllableWeight += 0.18;
        if (meta.jongseongIndex === 0) {
            syllableWeight += 0.12;
        } else if (HANGUL_SUSTAIN_FINALS.has(meta.jongseongIndex)) {
            syllableWeight += 0.03;
        } else {
            syllableWeight -= 0.04;
        }
        total += syllableWeight;
    }

    const particlePenalty = KOREAN_SHORT_PARTICLES.has(text) ? 0.76 : 1;
    return clamp((total + (repeatedCount * 0.14)) * particlePenalty, 0.78, 7.2);
}

function getJapaneseUnitWeight(text, repeatedCount) {
    const chars = Array.from(text);
    let moraWeight = 0;

    for (const char of chars) {
        if (JAPANESE_SMALL_KANA_REGEX.test(char)) {
            moraWeight += 0.1;
            continue;
        }
        if (char === 'ー') {
            moraWeight += 0.58;
            continue;
        }
        if (char === 'っ' || char === 'ッ' || char === 'ん' || char === 'ン') {
            moraWeight += 0.7;
            continue;
        }
        moraWeight += 0.98;
    }

    const particlePenalty = JAPANESE_PARTICLES.has(text) ? 0.74 : 1;
    return clamp((moraWeight + (repeatedCount * 0.16)) * particlePenalty, 0.72, 7);
}

function getHanUnitWeight(text, repeatedCount) {
    const chars = Array.from(text);
    const base = chars.length * 0.97;
    const particlePenalty = chars.length <= 2 && HAN_PARTICLES.has(text) ? 0.8 : 1;
    return clamp((base + (repeatedCount * 0.12)) * particlePenalty, 0.8, 6.8);
}

function estimateAggressiveChunkSize(charCount, lineConfidence, lineDurationMs) {
    if (charCount <= 1) return 1;

    const msPerChar = lineDurationMs / Math.max(1, charCount);
    if (lineConfidence >= 0.62 || msPerChar >= 170) return 1;
    if (lineConfidence >= 0.42 || msPerChar >= 110) return 2;
    return charCount >= 8 ? 3 : 2;
}

function tokenizeLine(text, options = {}) {
    if (!text) return [];

    const lineConfidence = clamp01(options.lineConfidence ?? 0.5);
    const lineDurationMs = Math.max(1, options.lineDurationMs ?? 2000);
    const coarseTokens = text.match(/\S+\s*|\s+/g) || [text];
    const units = [];

    for (const token of coarseTokens) {
        if (!token) continue;

        const trimmed = token.trim();
        if (!trimmed) {
            units.push(token);
            continue;
        }

        const trimmedChars = Array.from(trimmed);
        const shouldSplitAggressively = trimmedChars.some(isAggressiveChar);
        if (!shouldSplitAggressively) {
            units.push(token);
            continue;
        }

        const trailingWhitespaceMatch = token.match(/\s+$/);
        const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : '';
        const coreToken = trailingWhitespace ? token.slice(0, -trailingWhitespace.length) : token;
        const chars = coreToken === trimmed ? trimmedChars : Array.from(coreToken);
        const chunkSize = estimateAggressiveChunkSize(chars.length, lineConfidence, lineDurationMs);

        if (!chars.length) {
            units.push(token);
            continue;
        }

        for (let index = 0; index < chars.length; index += chunkSize) {
            const chunk = chars.slice(index, index + chunkSize).join('');
            units.push(index + chunkSize >= chars.length && trailingWhitespace ? chunk + trailingWhitespace : chunk);
        }
    }

    return units;
}

function getUnitWeight(unitText) {
    const trimmed = unitText.trim();
    if (!trimmed) return Math.max(0.2, unitText.length * 0.15);

    const chars = Array.from(trimmed);
    let alphaNumericCount = 0;
    let aggressiveCount = 0;
    let hangulCount = 0;
    let japaneseCount = 0;
    let hanCount = 0;
    let punctuationCount = 0;
    let repeatedCount = 0;
    let letterCount = 0;
    let digitCount = 0;

    for (let index = 0; index < chars.length; index++) {
        const char = chars[index];
        const code = char.charCodeAt(0);
        const isLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
        const isDigit = code >= 48 && code <= 57;

        if (isLetter) letterCount += 1;
        if (isDigit) digitCount += 1;
        if (isLetter || isDigit) alphaNumericCount += 1;
        if (isAggressiveChar(char)) aggressiveCount += 1;
        if (isHangulSyllable(char)) hangulCount += 1;
        if (isJapaneseChar(char)) japaneseCount += 1;
        if (isHanChar(char)) hanCount += 1;
        if (UNIT_PUNCTUATION_REGEX.test(char)) punctuationCount += 1;
        if (index > 0 && char === chars[index - 1]) repeatedCount += 1;
    }

    if (punctuationCount === chars.length) {
        return Math.max(0.22, chars.length * 0.18);
    }

    if (hangulCount === chars.length) {
        return getHangulUnitWeight(trimmed, repeatedCount);
    }

    if (japaneseCount === chars.length) {
        return getJapaneseUnitWeight(trimmed, repeatedCount);
    }

    if (hanCount === chars.length) {
        return getHanUnitWeight(trimmed, repeatedCount);
    }

    if (aggressiveCount === chars.length) {
        return Math.max(0.9, aggressiveCount + (repeatedCount * 0.28));
    }

    if (alphaNumericCount > 0) {
        const normalized = trimmed.toLowerCase();
        const vowelGroups = normalized.match(/[aeiouy]+/g)?.length || 0;
        const pronunciationUnits = Math.max(
            vowelGroups,
            Math.ceil(letterCount / 3.4),
            digitCount > 0 ? digitCount : 0
        );
        const connectorPenalty = LATIN_CONNECTOR_WORDS.has(normalized) ? 0.72 : 1;
        const longEndingBoost = /(ing|ed|er|est|oo|ee|ah|oh)$/i.test(trimmed) ? 0.42 : 0;
        return clamp(
            ((pronunciationUnits * 0.95) + longEndingBoost + (repeatedCount * 0.15)) * connectorPenalty,
            0.75,
            6.8
        );
    }

    return Math.max(0.45, chars.length * 0.4);
}

function mergeUnitsConservatively(units, confidence, sectionVocality) {
    if (!Array.isArray(units) || units.length <= 1) return units;
    if (confidence < 0.18 || sectionVocality < 0.16) {
        return [units.join('')];
    }

    const lexicalUnits = units.filter((unit) => !!unit.trim()).length;
    if (lexicalUnits <= 2) return units;

    const targetWeight = confidence < 0.28 || sectionVocality < 0.24 ? 2.6 : 2;
    const merged = [];
    let buffer = '';
    let bufferWeight = 0;

    for (const unit of units) {
        buffer += unit;
        bufferWeight += getUnitWeight(unit);
        const trimmed = unit.trim();
        const shouldBreak =
            /\s+$/.test(unit) ||
            /[.!?;:)]["']?$/.test(trimmed) ||
            bufferWeight >= targetWeight;

        if (shouldBreak) {
            merged.push(buffer);
            buffer = '';
            bufferWeight = 0;
        }
    }

    if (buffer) {
        merged.push(buffer);
    }

    return merged.filter((unit) => unit.length > 0);
}

export {
    isAggressiveChar,
    tokenizeLine,
    getUnitWeight,
    mergeUnitsConservatively,
};
