import { parsePlainLyrics as parsePlainLyricLines } from "./plainLyrics.mjs";
import { LYRICS_SPEAKER_PALETTE } from "./lyricsSpeakerPalette.mjs";
const OPEN_LYRICS_SPEAKER_PALETTE = LYRICS_SPEAKER_PALETTE.slice(0, 6);

export function toMilliseconds(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

export function getStructuredLineStart(line) {
    return toMilliseconds(line?.timestamp)
        ?? toMilliseconds(line?.text?.[0]?.timestamp)
        ?? 0;
}

const XML_TEXT_ENTITIES = Object.freeze({
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"'
});

/**
 * Decode one layer of XML character references in provider lyric text.
 * This intentionally does not use a DOM/HTML parser: unknown or malformed
 * references and literal ampersands remain untouched, and encoded entity
 * text such as `&amp;apos;` is not decoded twice.
 */
export function decodeLyricTextEntities(value) {
    const text = String(value ?? '');
    if (!text.includes('&')) return text;

    return text.replace(
        /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|([a-z]+));/g,
        (match, decimal, hexadecimal, named) => {
            if (named) {
                return Object.prototype.hasOwnProperty.call(XML_TEXT_ENTITIES, named)
                    ? XML_TEXT_ENTITIES[named]
                    : match;
            }

            const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
            const isUnicodeScalar = Number.isInteger(codePoint)
                && codePoint > 0
                && codePoint <= 0x10FFFF
                && !(codePoint >= 0xD800 && codePoint <= 0xDFFF);
            return isUnicodeScalar ? String.fromCodePoint(codePoint) : match;
        }
    );
}

function shouldAppendBoundary(item, nextItem, text) {
    if (!nextItem || item?.part !== false || /\s$/.test(text)) return false;
    const nextText = decodeLyricTextEntities(nextItem?.text);
    if (!nextText || /^\s|^['’,.;:!?%)\]}]/u.test(nextText)) return false;
    if (/[-‐‑‒–—'’]$/.test(text)) return false;
    return true;
}

export function parseStructuredReferenceLines(payload) {
    const rawText = payload?.metadata?.rawData?.lyrics_text
        || payload?.rawData?.lyrics_text
        || '';
    const references = new Map();
    String(rawText).split(/\r?\n/).forEach(rawLine => {
        const match = rawLine.match(/^\[(\d+),(\d+)\](.*)$/);
        if (!match) return;
        const timestamp = Number(match[1]);
        const text = match[3].replace(/<\d+,\d+,\d+>/g, '');
        if (Number.isFinite(timestamp)) references.set(timestamp, text);
    });
    return references;
}

function normalizeDecodedReferenceSpacingCharacters(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[“”„‟]/g, '"')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/\s/gu, '');
}

export function normalizeReferenceSpacingCharacters(value) {
    return normalizeDecodedReferenceSpacingCharacters(decodeLyricTextEntities(value));
}

export function getReferenceWhitespaceBoundaries(items, referenceText) {
    if (!Array.isArray(items) || !items.length || typeof referenceText !== 'string') return null;
    const compactTokens = items.map(item => normalizeReferenceSpacingCharacters(item?.text));
    if (compactTokens.some(text => !text)) return null;

    const decodedReference = decodeLyricTextEntities(referenceText);
    const compactReference = normalizeDecodedReferenceSpacingCharacters(decodedReference);
    if (compactTokens.join('') !== compactReference) return null;

    const boundaries = new Set();
    let characterCount = 0;
    decodedReference.split(/(\s+)/u).forEach(segment => {
        if (/^\s+$/u.test(segment)) {
            if (characterCount > 0) boundaries.add(characterCount);
        } else {
            characterCount += Array.from(normalizeDecodedReferenceSpacingCharacters(segment)).length;
        }
    });
    return boundaries;
}

export function parseTimedTokens(items, fallbackStart, fallbackEnd, referenceText = null) {
    if (!Array.isArray(items)) return [];
    const referenceBoundaries = getReferenceWhitespaceBoundaries(items, referenceText);
    let consumedCharacters = 0;
    return items.map((item, index) => {
        let text = decodeLyricTextEntities(item?.text);
        if (!text) return null;
        if (referenceBoundaries) {
            text = text.trim();
            consumedCharacters += Array.from(normalizeDecodedReferenceSpacingCharacters(text)).length;
            if (items[index + 1] && referenceBoundaries.has(consumedCharacters)) text += ' ';
        } else if (shouldAppendBoundary(item, items[index + 1], text)) {
            text += ' ';
        }
        const startTime = toMilliseconds(item?.timestamp) ?? fallbackStart;
        const nextStart = toMilliseconds(items[index + 1]?.timestamp);
        const endTime = toMilliseconds(item?.endtime)
            ?? (Number.isFinite(nextStart) ? nextStart : fallbackEnd);
        return {
            text,
            startTime,
            endTime: Math.max(startTime + 1, endTime)
        };
    }).filter(Boolean);
}

export function getSpeakerPresentation(line, agentOrder) {
    const agent = String(line?.agent || '').trim();
    let index = agent ? agentOrder.get(agent) : null;
    if (!Number.isFinite(index)) index = line?.oppositeTurn ? 1 : 0;
    if (index <= 0) {
        return { speaker: 'NORMAL', openLyricsAgent: agent || null };
    }
    const palette = OPEN_LYRICS_SPEAKER_PALETTE[(index - 1) % OPEN_LYRICS_SPEAKER_PALETTE.length];
    return {
        speaker: 'CUSTOM',
        'speaker-color': palette.color,
        'speaker-fallback': palette.fallback,
        openLyricsAgent: agent || null
    };
}

export function createVocalPart(id, role, syllables, presentation) {
    if (!Array.isArray(syllables) || syllables.length === 0) return null;
    const text = syllables.map(item => item.text).join('').trim();
    if (!text) return null;
    return {
        id,
        role,
        ...presentation,
        kind: 'vocal',
        text,
        syllables,
        startTime: Math.min(...syllables.map(item => item.startTime)),
        endTime: Math.max(...syllables.map(item => item.endTime))
    };
}

export function parsePlainLyrics(value) {
    return parsePlainLyricLines(value, decodeLyricTextEntities);
}
