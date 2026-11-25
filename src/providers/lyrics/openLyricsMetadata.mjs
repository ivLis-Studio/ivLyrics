import { normalizeTitleCore } from "./openLyricsTrackMatch.mjs";
import { decodeLyricTextEntities, toMilliseconds } from "./openLyricsTokens.mjs";

export function getStructuredLineText(line, referenceText = null) {
    if (typeof referenceText === 'string' && referenceText.trim()) {
        return decodeLyricTextEntities(referenceText).trim();
    }
    if (Array.isArray(line?.text)) {
        return line.text.map(item => decodeLyricTextEntities(item?.text)).join('').trim();
    }
    return decodeLyricTextEntities(line?.text).trim();
}

function normalizeMetadataIdentity(value) {
    return normalizeTitleCore(value).replace(/\s+/gu, '');
}

export function isTitleArtistMetadataHeader(text, info) {
    const expectedTitle = normalizeMetadataIdentity(info?.title);
    if (!expectedTitle) return false;
    const expectedArtist = normalizeMetadataIdentity(info?.artist);

    for (const separator of String(text || '').matchAll(/[-‐‑‒–—]/gu)) {
        const titlePart = String(text).slice(0, separator.index).trim();
        const artistPart = String(text).slice(separator.index + separator[0].length).trim();
        const normalizedLeft = normalizeMetadataIdentity(titlePart);
        const normalizedRight = normalizeMetadataIdentity(artistPart);
        if (!normalizedLeft || !normalizedRight) continue;
        if (normalizedLeft === expectedTitle) return true;

        const isExpectedArtist = !expectedArtist
            || normalizedLeft === expectedArtist
            || normalizedLeft.includes(expectedArtist)
            || expectedArtist.includes(normalizedLeft);
        if (normalizedRight === expectedTitle && isExpectedArtist) return true;
    }
    return false;
}

const STRUCTURED_CREDIT_LABELS = new Set([
    '词', '詞', '作词', '作詞', '填词', '填詞', '词曲', '詞曲',
    '曲', '作曲', '编曲', '編曲', '弦编曲', '弦編曲', '弦乐编曲', '弦樂編曲',
    'lyrics', 'lyric', 'lyricsby', 'lyricby', 'lyricist',
    'composedby', 'composer', 'musicby',
    'arrangedby', 'arranger', 'stringsarrangedby',
    'producedby', 'producer', '制作', '製作', '制作人', '製作人',
    '翻译', '翻譯', 'translatedby',
    '歌手', '演唱', '原唱', '原曲', '录音', '錄音', '混音', '和声', '和聲',
    'vocal', 'vocals', 'vocalby', 'vocalsby',
    'mixby', 'mixedby', 'mixingby', 'masteredby', 'masteringby'
]);

function getCreditMetadataParts(text) {
    const normalized = String(text || '').normalize('NFKC').trim();
    const separatorIndex = normalized.search(/[:：]/u);
    if (separatorIndex <= 0 || !normalized.slice(separatorIndex + 1).trim()) return null;

    const label = normalized
        .slice(0, separatorIndex)
        .toLocaleLowerCase()
        .replace(/[\s._-]+/gu, '');
    if (!STRUCTURED_CREDIT_LABELS.has(label)) return null;
    return { label, value: normalized.slice(separatorIndex + 1).trim() };
}

export function isCreditMetadataText(text) {
    return getCreditMetadataParts(text) !== null;
}

const CREDIT_NAME_CONNECTORS = new Set([
    'and', 'de', 'del', 'der', 'di', 'du', 'la', 'le', 'of', 'the', 'van', 'von', 'y'
]);

function isContributorNameSegment(name, requireEveryWord = false) {
    const normalized = String(name || '').normalize('NFKC').trim();
    if (!normalized || normalized.length > 64 || !/[\p{L}\p{N}]/u.test(normalized)) return false;
    if (/[^\p{L}\p{M}\p{N}\s.'’‘`´,&+()\-·・]/u.test(normalized)) return false;
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized)) {
        return true;
    }

    const words = normalized.match(/[\p{L}\p{M}\p{N}]+(?:[.'’‘`´-][\p{L}\p{M}\p{N}]+)*/gu) || [];
    if (!words.length || words.length > 6) return false;

    const significantWords = words.filter(word => !CREDIT_NAME_CONNECTORS.has(word.toLocaleLowerCase()));
    if (!significantWords.length) return false;
    const isNameWord = word => {
        const firstLetter = word.match(/\p{L}/u)?.[0];
        if (!firstLetter) return /^\d+$/u.test(word);
        const startsWithUppercase = firstLetter === firstLetter.toLocaleUpperCase()
            && firstLetter !== firstLetter.toLocaleLowerCase();
        const isMixedCaseAlias = /\p{Ll}/u.test(word) && /\p{Lu}/u.test(word);
        return startsWithUppercase || isMixedCaseAlias;
    };
    return requireEveryWord
        ? significantWords.every(isNameWord)
        : significantWords.some(isNameWord);
}

function isContributorNameList(text, requireEveryWord = false) {
    const names = String(text || '').normalize('NFKC').split(/[/／⁄,，、]/u).map(value => value.trim());
    return names.length > 0 && names.every(name => isContributorNameSegment(name, requireEveryWord));
}

export function isStrongCreditMetadataText(text) {
    const parts = getCreditMetadataParts(text);
    return Boolean(parts && isContributorNameList(parts.value));
}

export function isCreditMetadataContinuationText(text) {
    const normalized = String(text || '').normalize('NFKC').trim();
    if (!normalized || normalized.length > 240 || /[:：]/u.test(normalized)) return false;
    if (!/[\p{L}\p{N}][/／⁄][\p{L}\p{N}]/u.test(normalized)) return false;
    return isContributorNameList(normalized);
}

function getEarlyCreditAnchorIndex(allLines, _info, referenceLines) {
    const lookahead = Math.min(allLines.length, 10);
    for (let index = 0; index < lookahead; index += 1) {
        const line = allLines[index];
        const startTime = toMilliseconds(line?.timestamp)
            ?? toMilliseconds(line?.text?.[0]?.timestamp)
            ?? 0;
        const text = getStructuredLineText(line, referenceLines.get(startTime));
        if (isCreditMetadataText(text)) return index;
    }
    return -1;
}

export function isCopyrightMetadataText(text) {
    return /^(?:©|℗|ⓒ|\(c\)|\(p\)|copyright\b)/iu.test(
        String(text || '').normalize('NFKC').trim()
    );
}

const NO_LYRICS_PLACEHOLDERS = new Set([
    '纯音乐请欣赏',
    '纯音乐请您欣赏',
    '纯音乐敬请欣赏',
    '純音樂請欣賞',
    '純音樂請您欣賞',
    '此歌曲为没有填词的纯音乐请您欣赏',
    '此歌曲為沒有填詞的純音樂請您欣賞',
    '该歌曲为纯音乐请您欣赏',
    '該歌曲為純音樂請您欣賞',
    '暂无歌词',
    '暫無歌詞',
    '没有歌词',
    '沒有歌詞'
]);

export function isNoLyricsPlaceholderText(text) {
    const normalized = String(text || '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\p{P}\p{S}\s]+/gu, '');
    return NO_LYRICS_PLACEHOLDERS.has(normalized);
}

export function createOpenLyricsMetadataFilter(structuredProviderId) {
    function isTargetStructuredPayload(payload) {
        if (String(payload?.provider || '').toLowerCase() === structuredProviderId) return true;
        const rawFormat = payload?.metadata?.rawData?.format
            || payload?.rawData?.format
            || payload?.metadata?.format;
        return String(rawFormat || '').toLowerCase() === 'krc';
    }

    function getLeadingMetadataLineIndexes(payload, info, referenceLines = new Map()) {
        const allLines = Array.isArray(payload?.lyrics) ? payload.lyrics : [];
        const metadataIndexes = new Set();
        if (!isTargetStructuredPayload(payload) || !allLines.length) return metadataIndexes;

        const limit = allLines.length;
        const earlyCreditAnchorIndex = getEarlyCreditAnchorIndex(allLines, info, referenceLines);
        let hasStrongMetadataAnchor = false;
        let acceptsCreditContinuation = false;
        for (let index = 0; index < limit; index += 1) {
            const line = allLines[index];
            const startTime = toMilliseconds(line?.timestamp)
                ?? toMilliseconds(line?.text?.[0]?.timestamp)
                ?? 0;
            const text = getStructuredLineText(line, referenceLines.get(startTime));
            const isTitleHeader = index === 0 && isTitleArtistMetadataHeader(text, info);
            const isEarlyHeaderContinuation = earlyCreditAnchorIndex > 0
                && index < earlyCreditAnchorIndex;
            const isCredit = isCreditMetadataText(text);
            const isCreditContinuation = acceptsCreditContinuation
                && isCreditMetadataContinuationText(text);
            const isCopyright = hasStrongMetadataAnchor && isCopyrightMetadataText(text);
            if (!isTitleHeader && !isEarlyHeaderContinuation && !isCredit && !isCreditContinuation && !isCopyright) break;

            if (isTitleHeader || isEarlyHeaderContinuation || isCredit) hasStrongMetadataAnchor = true;
            acceptsCreditContinuation = isCredit || isCreditContinuation;
            metadataIndexes.add(index);
        }
        return metadataIndexes;
    }

    function isLikelyMetadataCreditLine(line, index, allLines, info, payload = null) {
        const candidatePayload = payload || { provider: structuredProviderId, lyrics: allLines };
        return getLeadingMetadataLineIndexes(candidatePayload, info).has(index);
    }

    return { isTargetStructuredPayload, getLeadingMetadataLineIndexes, isLikelyMetadataCreditLine };
}
