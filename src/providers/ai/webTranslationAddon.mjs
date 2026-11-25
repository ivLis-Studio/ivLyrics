import { throwIfAiRequestAborted } from "./aiRequestCancellation.mjs";

const PROTECTED_LYRIC_LINE = /^\s*(?:♪+|\[[^\]\r\n]+\]|\([^()\r\n]+\))\s*$/u;
const VOCAL_SEPARATOR = " / ";
const MAX_CHUNK_LINES = 40;

function splitResponseLines(text, count) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    if (lines.length === count) return lines;
    if (lines.length === count + 1 && lines.at(-1) === "") return lines.slice(0, -1);
    return null;
}

function* chunkLyrics(rows, maxCharacters) {
    let chunk = [];
    let characters = 0;
    for (const row of rows) {
        if (chunk.length && (chunk.length >= MAX_CHUNK_LINES || characters + row.text.length + 1 > maxCharacters)) {
            yield chunk;
            chunk = [];
            characters = 0;
        }
        characters += row.text.length + Number(chunk.length > 0);
        chunk.push(row);
    }
    if (chunk.length) yield chunk;
}

export function normalizeWebTranslationLanguage(language, aliases) {
    const normalized = String(language || "en").trim().replace(/_/g, "-").toLowerCase();
    return Object.hasOwn(aliases, normalized) ? aliases[normalized] : normalized.split("-")[0] || "en";
}

export function createWebTranslationAddon({ info, requestTranslation, normalizeLanguage, maxCharacters, debug }) {
    const { id, name, version } = info;
    const error = message => new Error(`[${name}] ${message}`);
    const lineAlignmentError = () => error("Could not preserve lyric line alignment");

    async function translateLine(text, language, signal) {
        const translated = [];
        let remaining = text;
        while (remaining) {
            let boundary = Math.min(remaining.length, maxCharacters);
            if (boundary < remaining.length) {
                // Keep a UTF-16 surrogate pair together when splitting a long line.
                const highSurrogate = remaining.charCodeAt(boundary - 1);
                if (highSurrogate >= 0xd800 && highSurrogate <= 0xdbff) boundary--;
                const space = Math.max(remaining.lastIndexOf(" ", boundary - 1), remaining.lastIndexOf("\t", boundary - 1));
                if (space >= boundary / 2) boundary = space + 1;
            }
            const piece = remaining.slice(0, boundary);
            remaining = remaining.slice(boundary);
            if (!piece.trim()) continue;
            const response = await requestTranslation(piece, language, signal);
            const lines = splitResponseLines(response, 1);
            if (!lines?.[0].trim()) throw lineAlignmentError();
            translated.push(lines[0]);
        }
        return translated.join(" ");
    }

    async function translateAligned(lines, language, signal) {
        if (lines.length === 1) return [await translateLine(lines[0], language, signal)];

        const text = await requestTranslation(lines.join("\n"), language, signal);
        const translated = splitResponseLines(text, lines.length);
        if (translated?.every(line => line.trim())) return translated;

        // A provider can merge paragraphs even when every input line has text.
        // Bisect the group instead of assigning a shifted result to any line.
        const middle = Math.ceil(lines.length / 2);
        const first = await translateAligned(lines.slice(0, middle), language, signal);
        const second = await translateAligned(lines.slice(middle), language, signal);
        return [...first, ...second];
    }

    async function repairVocalParts(source, translated, language, signal) {
        const parts = source.split(VOCAL_SEPARATOR);
        if (parts.length === 1 || parts.length === translated.split(VOCAL_SEPARATOR).length) return translated;

        const repaired = [];
        for (const part of parts) repaired.push(await translateLine(part, language, signal));
        return repaired.join(VOCAL_SEPARATOR);
    }

    async function translateLyrics({ text, lang, wantSmartPhonetic, onLine, signal }) {
        if (wantSmartPhonetic) throw error("Pronunciation generation is not supported");
        if (!text?.trim()) throw error("No text provided");

        const language = normalizeLanguage(lang);
        const rows = [];
        const translation = text.replace(/\r\n?/g, "\n").split("\n").map((line, index) => {
            if (!line.trim()) return "";
            if (PROTECTED_LYRIC_LINE.test(line)) return line;
            rows.push({ index, text: line });
            return null;
        });
        let published = 0;
        function publishAvailableLines() {
            throwIfAiRequestAborted(signal);
            if (typeof onLine !== "function") return;
            while (published < translation.length && translation[published] !== null) {
                onLine(published, translation[published], { provider: id, final: true });
                published++;
            }
        }
        publishAvailableLines();

        for (const chunk of chunkLyrics(rows, maxCharacters)) {
            const aligned = await translateAligned(chunk.map(row => row.text), language, signal);
            for (let offset = 0; offset < chunk.length; offset++) {
                const { index, text: source } = chunk[offset];
                translation[index] = await repairVocalParts(source, aligned[offset], language, signal);
                publishAvailableLines();
            }
        }
        return { translation };
    }

    async function translateMetadata({ title, artist, lang, signal }) {
        if (!title?.trim() || !artist?.trim()) throw error("Title and artist are required");
        const originals = [title.trim(), artist.trim()];
        const language = normalizeLanguage(lang);
        const source = originals.join("\n");
        const combined = source.length <= maxCharacters
            ? splitResponseLines(await requestTranslation(source, language, signal), originals.length)
            : null;
        const fields = combined || await Promise.all(originals.map(field => field.length <= maxCharacters
            ? requestTranslation(field, language, signal)
            : translateLine(field, language, signal)));
        return {
            translated: { title: fields[0]?.trim() || originals[0], artist: fields[1]?.trim() || originals[1] },
            romanized: { title: originals[0], artist: originals[1] },
        };
    }

    return {
        ...info,
        supports: {
            translate: true, pronunciation: false, metadata: true, tmi: false, lyricsStudy: false,
            characterPronunciation: false, culturalAnnotations: false,
        },
        async init() {
            debug(`[${name} Addon] Initialized (v${version})`);
        },
        getSettingsUI: () => null,
        async testConnection() {
            if (!(await requestTranslation("こんにちは", "en")).trim()) {
                throw error("Connection test returned no text");
            }
            return true;
        },
        translateLyrics,
        translateMetadata,
    };
}
