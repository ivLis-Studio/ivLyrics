import { readFileSync } from "node:fs";

const current = (name) => readFileSync(new URL("../../src/lyrics/" + name, import.meta.url), "utf8");
const section = (source, start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    if (from < 0 || to <= from) throw new Error("Missing lyric renderer declaration " + start);
    return source.slice(from, to);
};
const unindent = (source) => source.replace(/^\t/gm, "");
const withFixtureHost = (source) => source
    .replaceAll("getSpeakerColors()", 'getPageRuntimeService("ivLyricsSpeakerColors", window)')
    .replaceAll("getVisualSettings()?.", "CONFIG?.visual?.")
    .replaceAll("getVisualSettings()[", "CONFIG.visual[")
    .replaceAll("getLocale()", "readLyricRenderingLocale(window)");

export function readLyricsRendererDeclarations() {
    const module = current("Pages.js");
    const imports = module.slice(0, module.indexOf("export function createLyricsRenderer"));
    const end = module.lastIndexOf("\n\treturn {");
    const body = unindent(module.slice(module.indexOf("\tconst CREATOR_PROFILE_THEME_KEY"), end));
    const getters = {
        getPlaylistPicker: "PlaylistPicker", getStoragePersistence: "ivLyricsStoragePersistence",
        getRuntimeI18n: "I18n", getRuntimeStorage: "StorageManager", getSpeakerColors: "ivLyricsSpeakerColors",
        getWordSegmenter: "LyricsWordSegmenter", getLyricsService: "LyricsService",
    };
    const declarations = body
        .replace(/\b(get\w+)\(\)/g, (match, getter) => Object.hasOwn(getters, getter)
            ? `getPageRuntimeService("${getters[getter]}", window)` : match)
        .replaceAll("getUtils().", "Utils.")
        .replaceAll("getToast().", "Toast.")
        .replace("readPlayerTrackUri()", 'getPageRuntimeService("Spicetify", window)?.Player?.data?.item?.uri')
        .replace("getReactDOM,", "getReactDOM: () => window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null,")
        .replace("translateSeekTitle,", "translateSeekTitle: (key, values) => globalThis.I18n?.t?.(key, values),")
        .replace("reportDebug: reportWordStackDebug,", "reportDebug: detail => { window.__ivLyricsLastWordStack = detail; },")
        .replace("readCompactMode, getMarketplacePage, CreditFooter", 'readCompactMode, getMarketplacePage: () => typeof MarketplacePage === "undefined" ? null : MarketplacePage, CreditFooter')
        .replace(/publishCompatibility\(([^;]*)\);/g, "publishPageRuntimeService($1, window);");
    return 'import { getRuntimeService as getPageRuntimeService, publishRuntimeService as publishPageRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";\n'
        + imports + declarations + `\nwindow.ivLyricsNoLyricsAnimation = NoLyricsAnimation;
window.LyricsPageRenderer = RouteLyricsPageRenderer;
publishPageRuntimeService("ivLyricsLyricRendererPrimitives", lyricRendererPrimitives, window);
`;
}

// Instrumented comparisons still run against released classic scripts. Keep
// their declaration anchors while compiling the same code used by the modules.
export function readKaraokeRendererDeclarations() {
    const presentation = current("karaokeLinePresentation.mjs");
    const timing = current("karaokeLineTiming.mjs");
    const vocal = current("karaokeVocalTiming.mjs");
    const component = current("createKaraokeLine.mjs");
    const phonetic = current("karaokePhoneticFill.mjs");
    const textRenderer = current("karaokeTextRenderer.mjs");

    let source = readLyricsRendererDeclarations();
    source = source.replace(/^import \{[^}]+\} from "#ivlyrics\/lyrics\/(?:createKaraokeLine|karaokePhoneticFill)\.mjs";\n/gm, "");
    source = source.replace(/^import \{[^}]+\} from "#ivlyrics\/lyrics\/karaoke(?:LinePresentation|LineTiming|VocalTiming)\.mjs";\n/gm, "");
    source = source.replace('import { createKaraokeTextRenderer } from "#ivlyrics/lyrics/karaokeTextRenderer.mjs";\n', "");
    source = source.replace('import { createKaraokeFill }', 'import { createKaraokeFill, getKaraokeFillSteps, getKaraokeFillSoftEdge }');
    source = source.replace('import { createKaraokeMotion }',
        'import { createKaraokeMotion, getKaraokeExpressiveUnitRanges, getKaraokeExpressiveWordWindow, getKaraokeMotionProfile }');
    const wordIndexerStart = "const assignKaraokeWordIndexes =";
    const followingSection = "const getPseudoKaraokeRenderAdvance =";
    const wordIndexer = section(source, wordIndexerStart, followingSection);
    const textDeclarations = unindent(section(textRenderer, "\tconst KARAOKE_RTL_STRONG_CHAR_REGEX", "\n\treturn {\n\t\tgetKaraokeTextDirection"))
        .replace("const getKaraokeInlineStylePresentation", wordIndexer + "const getKaraokeInlineStylePresentation")
        .replace("buildSharedWordSegments(timedChars, {",
            'getPageRuntimeService("LyricsService", window)?.buildKaraokeWordSegments?.(timedChars, {');
    source = source.replace(wordIndexer, () => textDeclarations + "\n");
    source = source.replace(section(source, "const karaokeTextRenderer =", "const { KaraokeLivePainter,"),
        "const { getKaraokeBounceValues, getKaraokeWordBounceValues, isKaraokeExpressiveMotionEnabled, getKaraokeExpressiveMotion, getKaraokeExpressivePhase } = karaokeMotion;\n");
    source = `import { getLastTimedSyllableEndTime, KARAOKE_COMPLETION_POSITION_OFFSET_MS } from "#ivlyrics/lyrics/lyricPlaybackTimeline.mjs";
import { toFiniteTime } from "#ivlyrics/lyrics/lyricInterludeTiming.mjs";
import { getCopyableText } from "#ivlyrics/lyrics/lyricDisplayText.mjs";
import { KARAOKE_VOCAL_STACK_CENTER_THRESHOLD } from "#ivlyrics/lyrics/lyricsScrollGeometry.mjs";
import { classifyKaraokeExpressiveUnits, getKaraokeExpressiveGlyphWindow, isKaraokeExpressiveEmphasisUnit,
    KARAOKE_BOUNCE_IDLE, KARAOKE_EXPRESSIVE_MOTION_STYLE, KARAOKE_EXPRESSIVE_SETTLE_MS } from "#ivlyrics/lyrics/karaokeMotion.mjs";
import { prepareKaraokeGlyphUpdates, getKaraokeGlyphUpdates } from "#ivlyrics/lyrics/karaokeGlyphUpdates.mjs";
import { KARAOKE_LIVE_ATTRIBUTE } from "#ivlyrics/lyrics/karaokeLivePainter.mjs";
import { getKaraokeCulturalMarkers } from "#ivlyrics/lyrics/lyricCulturalAnnotations.mjs";
import { splitLineByVocalRowShape } from "#ivlyrics/lyrics/vocalRowText.mjs";
` + source;

    const lineCache = unindent(section(timing, "\tconst getLastSyllableEndTime", "\n\treturn { buildKaraokeFuriganaMap"));
    const adapters = section(source, "const {\n\tgetKaraokeInlineSpeakerClass", "const { getInterludeInfo");
    const declarations = [
        section(timing, "const getTimedSyllablesFromLine", "const getKaraokeLineBounds"),
        withFixtureHost(unindent(section(presentation, "\tconst getKaraokeSpeakerPresentation", "\tconst normalizeKaraokeSpeakerClass"))),
        section(presentation, "const PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT", "const KARAOKE_TEXT_EFFECT_KIND_CLASSES"),
        withFixtureHost(unindent(section(presentation, "\tconst normalizeKaraokeSpeakerClass", "\tconst areKaraokeTextEffectsEnabled"))),
        section(presentation, "const KARAOKE_TEXT_EFFECT_KIND_CLASSES", "const splitRenderableKaraokeSyllables"),
        withFixtureHost(unindent(section(presentation, "\tconst areKaraokeTextEffectsEnabled", "\tconst getKaraokeVocalRows"))),
        section(presentation, "const splitRenderableKaraokeSyllables", "const hasKaraokeVocalRows"),
        section(adapters, "const { splitKaraokeGraphemes", "const { buildKaraokeFuriganaMap"),
        unindent(section(presentation, "\tconst getKaraokeVocalRows", "\treturn {\n\t\tgetKaraokeInlineSpeakerClass")),
        section(presentation, "const hasKaraokeVocalRows", "export function createKaraokeLinePresentation"),
        withFixtureHost(lineCache),
    ];

    const timedDeclarations = [
        section(timing, "const getKaraokeLineBounds", "const applyKaraokeWhitespaceCompensation"),
        withFixtureHost(unindent(section(timing, "\tconst buildKaraokeFuriganaMap", "\tconst getLastSyllableEndTime"))),
        section(timing, "const applyKaraokeWhitespaceCompensation", "export function createKaraokeLineTiming"),
        section(vocal, "const KARAOKE_VOCAL_QUICK_STEP_MAX_MS", "const getKaraokeVocalRowRenderPosition"),
        unindent(section(vocal, "\treturn function buildKaraokeVocalRowRenderData", "\n}\n\nexport {"))
            .replace("return function buildKaraokeVocalRowRenderData(line, row, includeBounds) {",
                "const buildKaraokeVocalRowRenderData = (line, row, includeBounds) => {"),
        section(vocal, "const getKaraokeVocalRowRenderPosition", "export function createKaraokeVocalRowRenderDataBuilder"),
    ];

    const componentBindings = section(source, "const { PhoneticFillText,", "const useLyricsTrackReveal =");
    const lineComponent = withFixtureHost(unindent(section(component, "\tconst KaraokeLine = react.memo", "\n\treturn KaraokeLine;")))
        .replaceAll("getSegmenter()", 'getPageRuntimeService("LyricsWordSegmenter", window)')
        .replaceAll("getWordSegmentBuilder()", 'getPageRuntimeService("LyricsService", window)?.buildKaraokeWordSegments')
        .replaceAll("isFuriganaReady()", "isLyricFuriganaReady(window)")
        .replaceAll("applyFurigana(", "Utils.applyFuriganaIfEnabled(");
    const phoneticFill = [
        section(phonetic, "// Pronunciation fill", "export function createKaraokePhoneticFill")
            .replace("export const getPhoneticFillUnits", "const getPhoneticFillUnits"),
        unindent(section(phonetic, "\tconst getPhoneticFillUnitColor", "\treturn { PhoneticFillText"))
            .replaceAll("getInactiveColor()", 'CONFIG.visual["inactive-color"]')
            .replaceAll("now()", "performance.now()"),
    ].join("\n");

    return source.replace(adapters, declarations.join("\n") + "\n")
        .replace(componentBindings, lineComponent + "\n\n" + phoneticFill + "\n")
        .replace("const KARAOKE_TEXT_RUN_STATE_CLASS_NAMES", section(component, "const KARAOKE_CHAR_STATE_CLASS_NAMES", "export const KARAOKE_JOINING_SCRIPT_REGEX") + "const KARAOKE_TEXT_RUN_STATE_CLASS_NAMES")
        .replace("const KARAOKE_COMPLEX_GRAPHEME_REGEX", section(component, "const KARAOKE_JOINING_SCRIPT_REGEX", "export function createKaraokeLine") + "const KARAOKE_COMPLEX_GRAPHEME_REGEX")
        .replace("const PSEUDO_KARAOKE_SOURCES", section(timing, "const KARAOKE_PRE_SPACE_MIN_DURATION_MS", "const getTimedSyllablesFromLine") + "const PSEUDO_KARAOKE_SOURCES")
        .replace("const getKaraokeVisualSettings =", timedDeclarations.join("\n") + "\nconst getKaraokeVisualSettings =");
}
