// Pronunciation Lab: rule- and dictionary-based pronunciation, no AI.
//
// https://github.com/ivLis-Studio/pronunciation-lab reads a lyric as IPA and
// writes those sounds with another language's spelling (猫 → 네코 for Korean
// readers). The library is GPL-3.0 and carries about 85 MB of dictionaries
// and engines, so ivLyrics never bundles or copies it. Each client asks
// jsDelivr for the newest pronunciation-lab release when it first needs the
// library, then imports that release's module from the CDN; the module
// downloads a language's dictionaries the first time a lyric needs them.
// Importing the exact release keeps the module and its data files from the
// same version (jsDelivr caches release files permanently, but caches the
// "@latest" alias for up to a week in the browser). A new release reaches
// users the next time the app or Spotify starts.
//
// This engine is shared by every platform. The Spicetify provider
// (Addon_AI_PronunciationLab.js) runs it directly; the iOS, Android and
// LSPatch apps run the same code in a hidden WebView through the page built
// by .github/scripts/build_pronunciation_lab_mobile.mjs. A lyric therefore
// gets the same pronunciation everywhere. Keep it free of DOM, Spicetify and
// app services: the host passes in how to import the library.

export const PRONUNCIATION_LAB_REPOSITORY = "ivLis-Studio/pronunciation-lab";
// Newest release tag, as jsDelivr resolves "latest" (cached for five minutes).
export const PRONUNCIATION_LAB_LATEST_RELEASE_URL = "https://data.jsdelivr.com/v1/packages/gh/"
    + PRONUNCIATION_LAB_REPOSITORY + "/resolved?specifier=latest";
export const pronunciationLabModuleUrl = (version) => "https://cdn.jsdelivr.net/gh/"
    + PRONUNCIATION_LAB_REPOSITORY + "@" + version + "/dist/pronunciation.mjs";
// Used when the release lookup fails; jsDelivr then resolves the alias itself.
export const PRONUNCIATION_LAB_FALLBACK_MODULE_URL = pronunciationLabModuleUrl("latest");

export const PRONUNCIATION_LAB_ERRORS = Object.freeze({
    UNSUPPORTED_TARGET: "PRONUNCIATION_LAB_UNSUPPORTED_TARGET",
    UNSUPPORTED_SOURCE: "PRONUNCIATION_LAB_UNSUPPORTED_SOURCE",
    LOAD_FAILED: "PRONUNCIATION_LAB_LOAD_FAILED",
    ABORTED: "PRONUNCIATION_LAB_ABORTED",
});

const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const RELEASE_LOOKUP_TIMEOUT_MS = 8000;

/**
 * Module URL of the newest pronunciation-lab release. Falls back to
 * jsDelivr's "@latest" alias when the lookup fails, so an unreachable
 * metadata API never blocks pronunciation.
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{url: string, version: string}>}
 */
export async function resolvePronunciationLabModuleUrl({
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = RELEASE_LOOKUP_TIMEOUT_MS,
} = {}) {
    const fallback = { url: PRONUNCIATION_LAB_FALLBACK_MODULE_URL, version: "latest" };
    if (typeof fetchImpl !== "function") return fallback;
    // AbortController rather than AbortSignal.timeout: older Android
    // WebViews run this page too.
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetchImpl(PRONUNCIATION_LAB_LATEST_RELEASE_URL,
            controller ? { signal: controller.signal } : undefined);
        if (!response?.ok) return fallback;
        const version = String((await response.json())?.version ?? "").trim();
        return RELEASE_VERSION.test(version) ? { url: pronunciationLabModuleUrl(version), version } : fallback;
    } catch {
        return fallback;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

// ivLyrics source language codes (detector output or the user's override)
// → the library's source IDs. Variants pick the library's reading table.
const SOURCE_LANGUAGES = Object.freeze({
    ja: "japanese", jp: "japanese",
    ko: "korean", kr: "korean",
    zh: "mandarin", cmn: "mandarin", cn: "mandarin", tw: "mandarin",
    yue: "cantonese",
    en: "english", es: "spanish", fr: "french", de: "german", it: "italian",
    pt: "portuguese", nl: "dutch", sv: "swedish", no: "norwegian", nb: "norwegian",
    nn: "norwegian", fi: "finnish", is: "icelandic", ro: "romanian", ar: "arabic",
    fa: "persian", km: "khmer", or: "odia", vi: "vietnamese", ms: "malay",
    // Indonesian spelling reads like Malay; the library has no separate profile.
    id: "malay", sw: "swahili", eo: "esperanto", jam: "jamaican",
});
const CANTONESE_CODES = new Set(["yue", "zh-hk", "zh-mo", "zh-yue"]);
const TRADITIONAL_CHINESE_CODES = new Set(["tw", "zh-tw", "zh-hant", "zh-hk", "zh-mo"]);
// A bare "zh" does not say which characters a song uses; the engine then
// tries both tables (see transcribeLine).
const SIMPLIFIED_CHINESE_CODES = new Set(["cn", "zh-cn", "zh-hans", "zh-sg"]);

// Sources already written in Latin letters. Their Latin notation is the
// lyric itself.
const LATIN_SCRIPT_SOURCES = new Set([
    "english", "spanish", "french", "german", "italian", "portuguese", "dutch",
    "swedish", "norwegian", "finnish", "icelandic", "romanian", "malay",
    "vietnamese", "swahili", "esperanto", "jamaican",
]);

// The writing system follows ivLyrics' AI pronunciation rules
// (getPronunciationScriptRule in pronunciationPolicy.mjs), so switching
// between this provider and an AI provider never changes how a reader sees
// pronunciation. tests/pronunciation_lab_provider.test.mjs keeps the two in step.
//
// Pronunciation language → the library's target spelling: Korean, Japanese,
// Arabic and Persian readers get their own script; readers of the languages
// below get that language's phonetic spelling in Latin letters ("Spanish
// phonetic spelling" in the AI rules).
const SCRIPT_TARGETS = Object.freeze({
    ko: "korean", ja: "japanese", ar: "arabic", fa: "persian",
    es: "spanish", fr: "french", de: "german", it: "italian", pt: "portuguese",
    sv: "swedish", nl: "dutch", no: "norwegian", nb: "norwegian", nn: "norwegian",
    fi: "finnish", is: "icelandic", ro: "romanian", vi: "vietnamese",
    ms: "malay", id: "malay", sw: "swahili", eo: "esperanto",
});

// Pronunciation languages the AI rules write in a non-Latin script the
// library cannot write: Chinese characters, Devanagari, Cyrillic, Bengali and
// Thai. Matched like the AI rules: the full code (zh-cn), then its language
// (ru-RU → ru). Every other language, English included ("こんにちは →
// konnichiwa"), reads the plain Latin notation.
const UNWRITABLE_TARGETS = new Set(["zh-cn", "zh-tw", "hi", "ru", "bn", "th"]);

// The library's target closest to a plain romanization: one letter per sound,
// gemination kept (つよく なれる → tsuyoku nareru, 知った → shitta).
const LATIN_TARGET = "jamaican";

const normalizeCode = (value) => String(value ?? "").trim().toLowerCase().replace(/_/gu, "-");
const baseCode = (code) => code.split("-")[0];

const normalizeNotation = (value) => {
    const notation = String(value ?? "").trim().toLowerCase();
    return notation === "latin" || notation === "ipa" ? notation : "translation";
};

/**
 * How a pronunciation language and notation are written, or null when the
 * library cannot write them.
 * @returns {{kind: "script", target: string}|{kind: "latin"}|{kind: "ipa"}|null}
 */
export function resolvePronunciationLabOutput(lang, notation) {
    const normalizedNotation = normalizeNotation(notation);
    if (normalizedNotation === "ipa") return { kind: "ipa" };
    if (normalizedNotation === "latin") return { kind: "latin" };
    const code = normalizeCode(lang) || "en";
    const target = SCRIPT_TARGETS[code] || SCRIPT_TARGETS[baseCode(code)];
    if (target) return { kind: "script", target };
    if (UNWRITABLE_TARGETS.has(code) || UNWRITABLE_TARGETS.has(baseCode(code))) return null;
    return { kind: "latin" };
}

/**
 * The song's source language as the library reads it, or null for "auto"
 * and languages it does not read. variant is "" when the code does not pick
 * one; Mandarin then tries both character tables.
 * @returns {{source: string, variant: string}|null}
 */
export function resolvePronunciationLabSource(sourceLang) {
    const code = normalizeCode(sourceLang);
    if (!code || code === "auto" || code === "off") return null;
    if (CANTONESE_CODES.has(code)) return { source: "cantonese", variant: "" };
    const source = SOURCE_LANGUAGES[code] || SOURCE_LANGUAGES[baseCode(code)];
    if (!source) return null;
    if (source === "mandarin") {
        if (TRADITIONAL_CHINESE_CODES.has(code)) return { source, variant: "hant" };
        if (SIMPLIFIED_CHINESE_CODES.has(code)) return { source, variant: "hans" };
        return { source, variant: "" };
    }
    if (source === "english" && /^en-(gb|uk|ie)$/u.test(code)) return { source, variant: "UK" };
    if (source === "spanish" && /^es-(?!es$)/u.test(code)) return { source, variant: "MX" };
    if (source === "french" && code === "fr-ca") return { source, variant: "QC" };
    return { source, variant: "" };
}

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;
const HAN = /\p{Script=Han}/u;
const ARABIC = /\p{Script=Arabic}/u;
const KHMER = /\p{Script=Khmer}/u;
const ORIYA = /\p{Script=Oriya}/u;
const LATIN = /\p{Script=Latin}/u;
const LETTER = /\p{L}/u;
const SOUND = /[\p{L}\p{N}]/u;
const WHITESPACE = /^\s+$/u;
const UNRESOLVED = "\u25A1";
// [Chorus], [Verse 1]: structure labels, not sung text.
const SECTION_LABEL = /^\s*\[[\p{Script=Latin}\p{N}\s'’&.:#\-]+\]\s*$/u;
// Phrases written in Latin letters: words joined by spaces and light
// punctuation ("Hold me tight", "Ooh, ah"). Digits alone are not a phrase.
const LATIN_PHRASE = /[\p{Script=Latin}\p{M}\p{N}'’]+(?:[ \t,.!?&\-]+[\p{Script=Latin}\p{M}\p{N}'’]+)*/gu;

/** A line split into Latin-letter phrases and the text between them. */
function latinRuns(line) {
    const runs = [];
    let last = 0;
    for (const match of line.matchAll(LATIN_PHRASE)) {
        if (!LATIN.test(match[0])) continue;
        if (match.index > last) runs.push({ text: line.slice(last, match.index), latin: false });
        runs.push({ text: match[0], latin: true });
        last = match.index + match[0].length;
    }
    if (last < line.length) runs.push({ text: line.slice(last), latin: false });
    return runs;
}

/**
 * Source of one lyric line. The script decides first (kana is Japanese,
 * Hangul Korean), so a Japanese line inside a Korean song still reads as
 * Japanese; letters several languages share follow the song's language.
 * Null for scripts the library does not read.
 */
export function resolvePronunciationLabLineSource(line, song) {
    const text = String(line ?? "");
    if (KANA.test(text)) return { source: "japanese", variant: "" };
    if (HANGUL.test(text)) return { source: "korean", variant: "" };
    if (HAN.test(text)) {
        return ["japanese", "mandarin", "cantonese"].includes(song?.source)
            ? song
            : { source: "mandarin", variant: "" };
    }
    if (ARABIC.test(text)) {
        return ["arabic", "persian"].includes(song?.source) ? song : { source: "arabic", variant: "" };
    }
    if (KHMER.test(text)) return { source: "khmer", variant: "" };
    if (ORIYA.test(text)) return { source: "odia", variant: "" };
    const letters = Array.from(text).filter((character) => LETTER.test(character));
    if (letters.some((character) => !LATIN.test(character))) return null;
    if (letters.length === 0) return song || { source: "english", variant: "" };
    return LATIN_SCRIPT_SOURCES.has(song?.source) ? song : { source: "english", variant: "" };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const createError = (code, message, cause) => {
    const error = new Error("[Pronunciation Lab] " + message, cause ? { cause } : undefined);
    error.code = code;
    return error;
};

const defaultCheckAbort = (signal) => {
    if (!signal?.aborted) return;
    throw signal.reason instanceof Error
        ? signal.reason
        : createError(PRONUNCIATION_LAB_ERRORS.ABORTED, "Request cancelled");
};

const MAX_REMEMBERED_LINES = 4000;
const YIELD_EVERY_MS = 12;

/**
 * @param {Object} options
 * @param {(url: string) => Promise<Object>} options.loadLibrary Imports the
 *   module URL (import(url) in a browser; tests pass a fake).
 * @param {() => Promise<{url: string, version: string}>} [options.resolveModuleUrl]
 *   Picks the release to import; the newest one from jsDelivr by default.
 * @param {() => Promise<void>} [options.yieldToHost] Lets the page paint
 *   between lines; the first dictionary parse of a song can take a moment.
 * @param {(signal: AbortSignal) => void} [options.checkAbort]
 * @param {() => number} [options.now]
 */
export function createPronunciationLabEngine({
    loadLibrary,
    resolveModuleUrl = () => resolvePronunciationLabModuleUrl(),
    yieldToHost = () => new Promise((resolve) => setTimeout(resolve, 0)),
    checkAbort = defaultCheckAbort,
    now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()),
} = {}) {
    let libraryPromise = null;
    let loadedVersion = null;
    // Converted lines, newest last. Choruses and regenerated songs reuse them.
    const remembered = new Map();

    // Resolved once per engine, so one app session keeps one release: a
    // module cannot be unloaded, and swapping releases mid-session would keep
    // the old release's dictionaries in memory.
    const library = () => {
        libraryPromise ??= Promise.resolve()
            .then(() => resolveModuleUrl())
            .then(async (release) => {
                const module = await loadLibrary(release?.url || PRONUNCIATION_LAB_FALLBACK_MODULE_URL);
                const api = module?.transliterate ? module : module?.default;
                if (typeof api?.transliterate !== "function" || typeof api?.transcribe !== "function") {
                    throw new Error("the module has no transliterate/transcribe API");
                }
                loadedVersion = String(release?.version || "latest");
                return api;
            })
            .catch((error) => {
                // A later request tries again (offline, or a blocked CDN).
                libraryPromise = null;
                throw createError(PRONUNCIATION_LAB_ERRORS.LOAD_FAILED,
                    "Could not load the pronunciation engine: " + (error?.message || error), error);
            });
        return libraryPromise;
    };

    const remember = (key, value) => {
        remembered.delete(key);
        remembered.set(key, value);
        if (remembered.size > MAX_REMEMBERED_LINES) remembered.delete(remembered.keys().next().value);
        return value;
    };

    const options = ({ source, variant }, extra = {}) => (variant ? { source, variant, ...extra } : { source, ...extra });

    // A line mixing languages reads each part with its own data. When one of
    // those downloads fails, the library writes that part as □ instead of
    // failing; fail the request so the gap is not cached as the reading.
    const checkReadable = (parsed) => {
        const unavailable = Array.isArray(parsed?.unavailableSources) ? parsed.unavailableSources : [];
        if (unavailable.length) {
            throw createError(PRONUNCIATION_LAB_ERRORS.LOAD_FAILED,
                "Could not load the reading data for " + unavailable.join(", "));
        }
        return parsed;
    };

    // Parses a line; Mandarin without a known character table keeps the
    // table that reads more of it.
    async function transcribeLine(api, line, source) {
        if (source.source !== "mandarin" || source.variant) {
            return { source, parsed: checkReadable(await api.transcribe(line, options(source))) };
        }
        let best = null;
        for (const variant of ["hans", "hant"]) {
            const candidate = { source: "mandarin", variant };
            const parsed = checkReadable(await api.transcribe(line, options(candidate)));
            if (!best || parsed.unresolved.length < best.parsed.unresolved.length) best = { source: candidate, parsed };
            if (parsed.unresolved.length === 0) break;
        }
        return best;
    }

    // Unresolved parts print as □. Latin words the source dictionary lacks
    // ("Chorus", "Ooh" in a Japanese song) read as English instead; any other
    // part keeps its original text in a target spelling and is left out of
    // Latin and IPA notations, which must stay in their own writing system.
    async function fallbackFor(api, segment, output) {
        const original = String(segment?.original ?? "");
        if (!LATIN.test(original)) return output.kind === "script" ? original : "";
        if (output.kind === "latin") return original;
        try {
            if (output.kind === "ipa") {
                const parsed = await api.transcribe(original, { source: "english" });
                return parsed.ipa.includes(UNRESOLVED) ? "" : parsed.ipa;
            }
            const spelled = await api.transliterate(original, { source: "english", target: output.target });
            return spelled.includes(UNRESOLVED) ? original : spelled;
        } catch {
            return output.kind === "script" ? original : "";
        }
    }

    async function patchUnresolved(api, text, segments, output, line) {
        if (!text.includes(UNRESOLVED)) return text;
        const pieces = text.split(UNRESOLVED);
        const pending = segments.filter((segment) => segment.unresolved);
        // A lyric that itself contains □, or a count the parse does not
        // explain, cannot be matched part by part.
        if (line.includes(UNRESOLVED) || pending.length !== pieces.length - 1) {
            return line.includes(UNRESOLVED) ? text : pieces.join("");
        }
        let patched = pieces[0];
        for (let index = 1; index < pieces.length; index++) {
            patched += await fallbackFor(api, pending[index - 1], output) + pieces[index];
        }
        return patched;
    }

    // Korean in Latin notation: the library's romanization follows spelling
    // (같이 → gati). Romanizing the IPA follows the sound (gachi). The parts
    // of one word stay one group, Latin words and marks are kept as written,
    // and anything else returns null so the line uses the Latin spelling.
    async function romanizeKorean(api, segments) {
        let output = "";
        let run = [];
        const flushRun = async () => {
            if (!run.length) return true;
            const ipa = "/" + run.map((segment) => segment.ipa).join("") + "/";
            run = [];
            const parsed = await api.transcribe(ipa, { source: "korean", mode: "ipa" });
            if (!parsed?.romanization) return false;
            output += parsed.romanization.toLowerCase();
            return true;
        };
        for (const segment of segments) {
            const original = String(segment?.original ?? "");
            if (segment?.ipa && !segment.unresolved && segment.source === "korean" && !WHITESPACE.test(original)) {
                run.push(segment);
                continue;
            }
            if (!(await flushRun())) return null;
            if (LETTER.test(original) && !LATIN.test(original)) return null;
            output += original;
        }
        return (await flushRun()) ? output : null;
    }

    async function spellInLatin(api, text, source, output) {
        const { source: resolved, parsed } = await transcribeLine(api, text, source);
        if (resolved.source === "korean") {
            const romanized = await romanizeKorean(api, parsed.segments);
            if (romanized?.trim()) return romanized;
        }
        const spelled = await api.transliterate(text, options(resolved, { target: LATIN_TARGET }));
        return patchUnresolved(api, spelled, parsed.segments, output, text);
    }

    // Latin notation of a line that mixes scripts: words already written in
    // Latin letters ("Hold me tight 君を離さない") stay as written, as Korean
    // romanization keeps them, and only the other parts are spelled out.
    async function spellLineInLatin(api, line, source, output) {
        const runs = source.source === "korean" ? [] : latinRuns(line);
        if (!runs.some((run) => run.latin)) return spellInLatin(api, line, source, output);
        let spelled = "";
        for (const run of runs) {
            if (run.latin || !SOUND.test(run.text)) {
                spelled += run.text;
                continue;
            }
            // Marks and spaces around the part stay as written; the reading of
            // the words themselves must not depend on a bracket before them.
            const [, lead, core, trail] = run.text.match(/^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u);
            spelled += lead + await spellInLatin(api, core, source, output) + trail;
        }
        return spelled;
    }

    async function convertLine(api, line, source, output) {
        if (output.kind === "script") {
            if (source.source === output.target) return line;
            const { source: resolved, parsed } = await transcribeLine(api, line, source);
            const spelled = await api.transliterate(line, options(resolved, { target: output.target }));
            return patchUnresolved(api, spelled, parsed.segments, output, line);
        }
        if (output.kind === "latin") {
            return LATIN_SCRIPT_SOURCES.has(source.source) ? line : spellLineInLatin(api, line, source, output);
        }
        const { parsed } = await transcribeLine(api, line, source);
        return patchUnresolved(api, parsed.ipa, parsed.segments, output, line);
    }

    const tidy = (value) => String(value ?? "").replace(/[ \t]+/gu, " ").trim();

    /**
     * Whether the library can write this pronunciation language/notation.
     * Needs no network: unsupported requests fail before the library loads.
     */
    function supports(lang, notation) {
        return resolvePronunciationLabOutput(lang, notation) !== null;
    }

    /**
     * Pronunciation of every lyric line, in order and with the same count.
     * Empty lines stay empty; lines without letters or digits (♪) and section
     * labels ([Chorus]) keep their text, as AI pronunciation does.
     * @param {Object} request
     * @param {string[]} request.lines
     * @param {string} [request.sourceLang] Song language code, or "auto".
     * @param {string} request.lang Pronunciation language code.
     * @param {"translation"|"latin"|"ipa"} [request.notation]
     * @param {AbortSignal} [request.signal]
     * @param {(index: number, text: string) => void} [request.onLine]
     * @returns {Promise<string[]>}
     */
    async function convertLines({ lines, sourceLang = "auto", lang, notation, signal, onLine } = {}) {
        const sourceLines = (Array.isArray(lines) ? lines : []).map((line) => String(line ?? ""));
        const output = resolvePronunciationLabOutput(lang, notation);
        if (!output) {
            throw createError(PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_TARGET,
                "Cannot write pronunciation for language " + (String(lang || "") || "(none)"));
        }
        const song = resolvePronunciationLabSource(sourceLang);
        const plan = sourceLines.map((raw) => {
            const line = raw.replace(/\r/gu, "").normalize("NFC");
            if (!line.trim()) return { value: "" };
            if (!SOUND.test(line) || SECTION_LABEL.test(line)) return { value: tidy(line) };
            const source = resolvePronunciationLabLineSource(line, song);
            return source ? { line: line.trim(), source } : { value: tidy(line), unsupported: true };
        });
        // A line in a script the library cannot read (Cyrillic, Thai...)
        // keeps its text in a target spelling, as a song's other lines still
        // get their reading. Latin and IPA notations cannot show that text,
        // and a song with no readable line has nothing to convert.
        const unreadable = plan.find((entry) => entry.unsupported);
        if (unreadable && !plan.some((entry) => entry.source)) {
            throw createError(PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_SOURCE,
                "Cannot read lyrics in language " + (String(sourceLang || "") || "auto"));
        }
        if (unreadable && output.kind !== "script") {
            throw createError(PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_SOURCE,
                "Cannot read the lyric line \"" + Array.from(unreadable.value).slice(0, 40).join("") + "\"");
        }

        const results = new Array(sourceLines.length).fill("");
        const publish = (index, value) => {
            results[index] = value;
            try {
                onLine?.(index, value);
            } catch { /* streaming display is best effort */ }
        };
        let api = null;
        let lastYield = now();
        for (let index = 0; index < plan.length; index++) {
            checkAbort(signal);
            const entry = plan[index];
            if (!entry.source) {
                publish(index, entry.value);
                continue;
            }
            const key = [output.kind, output.target || "", entry.source.source, entry.source.variant, entry.line].join("\u0000");
            let value = remembered.get(key);
            if (value === undefined) {
                api ??= await library();
                checkAbort(signal);
                value = remember(key, tidy(await convertLine(api, entry.line, entry.source, output)) || entry.line);
            } else {
                remember(key, value);
            }
            publish(index, value);
            if (now() - lastYield >= YIELD_EVERY_MS) {
                await yieldToHost();
                lastYield = now();
            }
        }
        checkAbort(signal);
        return results;
    }

    return {
        convertLines,
        supports,
        loadLibrary: library,
        /** Release in use ("1.0.2", or "latest" after a failed lookup); null before loading. */
        version: () => loadedVersion,
    };
}
