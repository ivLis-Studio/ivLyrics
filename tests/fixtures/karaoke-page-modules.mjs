import { lyricsWordSegmenter } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";
import { readPronunciationFirst as readPagePronunciationFirst } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { readKaraokeRendererDeclarations } from "./karaoke-renderer-declarations.mjs";
import { readLyricRenderingLocale, isLyricFuriganaReady, readRouteDetectedLyricLanguage } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";
import { createKaraokeWordIndexer } from "#ivlyrics/lyrics/karaokeWordIndexes.mjs";
import { splitLineByVocalRowShape } from "#ivlyrics/lyrics/vocalRowText.mjs";
import { createSyncedLyricsEngine } from "#ivlyrics/lyrics/createSyncedLyricsEngine.mjs";
import { createSyncedLyricRows } from "#ivlyrics/lyrics/createSyncedLyricRows.mjs";
import { createKaraokeWordSupplementHook } from "#ivlyrics/lyrics/karaokeWordSupplementHook.mjs";
import { getKaraokeCulturalMarkers } from "#ivlyrics/lyrics/lyricCulturalAnnotations.mjs";
import { createWordSupplementPrefetcher } from "#ivlyrics/lyrics/createWordSupplementPrefetcher.mjs";
import { readFileSync } from "node:fs";
import {
    getLastTimedSyllableEndTime, prepareSyncedLineStartIndex,
    buildSyncedPlaybackBoundaries, getSyncedPlaybackBoundaryIndex,
    getActiveTimedLineIndex, getPrecenteredTimedLineIndex,
    prepareSyncedLinePlaybackWindows, getSyncedLinePlaybackState, KARAOKE_COMPLETION_POSITION_OFFSET_MS,
} from "#ivlyrics/lyrics/lyricPlaybackTimeline.mjs";
import {
    createLyricInterludeTiming, getLyricTrackDurationMs, toFiniteTime,
    isAutomaticInstrumentalBreakEnabled, INTERLUDE_MIN_DURATION_MS,
} from "#ivlyrics/lyrics/lyricInterludeTiming.mjs";
import {
    createLyricDisplayResolver, safeRenderText, getEmbeddedAuxiliaryDisplayValues, normalizeUnsyncedLyrics, getCopyableText,
} from "#ivlyrics/lyrics/lyricDisplayText.mjs";
import { createLyricsScrollGeometry, KARAOKE_VOCAL_STACK_CENTER_THRESHOLD } from "#ivlyrics/lyrics/lyricsScrollGeometry.mjs";
import { createLyricsExpandedScroll } from "#ivlyrics/lyrics/lyricsExpandedScroll.mjs";
import { createLyricsLineMotion, LYRICS_CENTERING_LEAD_MS, getLyricsLineMotionPlan, getLyricsLineMotionStyle } from "#ivlyrics/lyrics/lyricsLineMotion.mjs";
import { createSyncedLyricsViewportHook } from "#ivlyrics/lyrics/syncedLyricsViewport.mjs";
import { createCompactLyricsLineController } from "#ivlyrics/lyrics/lyricsCompactLineController.mjs";
import { createKaraokeGraphemes } from "#ivlyrics/lyrics/karaokeGraphemes.mjs";
import { getRuntimeService as getPageRuntimeService, publishRuntimeService as publishPageRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import {
    createKaraokeCharacterTimelineBuilder, queryGlobalCharTimeline, EMPTY_GLOBAL_CHAR_STATE,
} from "#ivlyrics/lyrics/karaokeCharacterTimeline.mjs";

export const karaokePageModules = {
    createSyncedLyricsEngine, createSyncedLyricRows, createKaraokeWordIndexer, splitLineByVocalRowShape,
    getKaraokeCulturalMarkers, readLyricRenderingLocale, isLyricFuriganaReady, readRouteDetectedLyricLanguage,
    createKaraokeWordSupplementHook, createWordSupplementPrefetcher,
    getPageWordSupplementService: () => null,
    registerWordSupplementPrefetcher() {},
    getLastTimedSyllableEndTime, prepareSyncedLineStartIndex,
    buildSyncedPlaybackBoundaries, getSyncedPlaybackBoundaryIndex,
    getActiveTimedLineIndex, getPrecenteredTimedLineIndex,
    prepareSyncedLinePlaybackWindows, getSyncedLinePlaybackState, KARAOKE_COMPLETION_POSITION_OFFSET_MS,
    createLyricInterludeTiming, getLyricTrackDurationMs, toFiniteTime,
    isAutomaticInstrumentalBreakEnabled, INTERLUDE_MIN_DURATION_MS,
    createLyricDisplayResolver, safeRenderText, getEmbeddedAuxiliaryDisplayValues, normalizeUnsyncedLyrics, getCopyableText,
    createKaraokeGraphemes, getPageRuntimeService, publishPageRuntimeService, readPagePronunciationFirst,
    createLyricsScrollGeometry, createLyricsExpandedScroll, createSyncedLyricsViewportHook,
    createLyricsLineMotion, createCompactLyricsLineController, LYRICS_CENTERING_LEAD_MS,
    getLyricsLineMotionPlan, getLyricsLineMotionStyle, KARAOKE_VOCAL_STACK_CENTER_THRESHOLD,
    createKaraokeCharacterTimelineBuilder, queryGlobalCharTimeline, EMPTY_GLOBAL_CHAR_STATE,
};


// The equivalence harnesses run current and historical Pages.js declarations
// in the same instrumented VM. Replay the production module bodies at their
// original boundaries so both revisions use the harness's fake clock/React.
export function readKaraokePageHarnessSource() {
    const read = name => readFileSync(new URL(`../../src/lyrics/${name}`, import.meta.url), "utf8");
    const section = (source, start, end) => {
        const from = source.indexOf(start);
        const to = source.indexOf(end, from + start.length);
        if (from < 0 || to <= from) throw new Error(`Missing karaoke harness section ${start}`);
        return source.slice(from, to);
    };
    const flattenFactory = (source, opening, closing) =>
        section(source, opening, closing).split("\n").slice(1)
            .map(line => line.replace(/^\t/, "")).join("\n");
    const useHarnessSettings = source => source.replaceAll("getVisualSettings()?.", "CONFIG?.visual?.")
        .replaceAll("getVisualSettings()", "CONFIG.visual");

    const fill = read("karaokeFill.mjs");
    const curveDefaults = section(fill, "const KARAOKE_FILL_CORRECTION_DEFAULT_POINTS", "const clampKaraokeFillCurveValue");
    const curve = section(fill, "const clampKaraokeFillCurveValue", "const KARAOKE_FILL_STEPS");
    const fillMath = section(fill, "const KARAOKE_FILL_STEPS", "export function createKaraokeFill");
    const fillSession = useHarnessSettings(flattenFactory(fill, "export function createKaraokeFill", "\n\treturn { applyKaraokeFillCorrectionCurve"));
    const motion = read("karaokeMotion.mjs");
    const motionMath = section(motion, "const KARAOKE_BOUNCE_IDLE", "export function createKaraokeMotion");
    const motionSession = useHarnessSettings(flattenFactory(motion, "export function createKaraokeMotion", "\n\treturn {\n\t\tgetKaraokeBounceValues"));
    const glyphUpdates = section(read("karaokeGlyphUpdates.mjs"), "const prepareKaraokeGlyphUpdates", "export {");
    const paint = read("karaokeLivePainter.mjs");
    const paintHeader = section(paint, "// Live karaoke painting.", "export function createKaraokeLivePainter");
    const paintSession = useHarnessSettings(flattenFactory(paint, "\n\tconst { clearKaraokeExpressiveMotion", "\n\treturn { KaraokeLivePainter"))
        .replace(/^const \{ clearKaraokeExpressiveMotion[^\n]*\n/m, "")
        .replace("clearKaraokeExpressiveMotion(unit)", "karaokeExpressiveMotionStates.delete(unit)")
        .replace("const settingsOpen = isSettingsOpen();",
            'const settingsOpen = document.documentElement.classList.contains("ivlyrics-settings-open") || document.body?.classList.contains("ivlyrics-settings-open");')
        .replace("requestFrame(this.boundTick)", '(typeof requestAnimationFrame === "function" ? requestAnimationFrame(this.boundTick) : null)')
        .replace("useLayoutEffect(() => {", "(react.useLayoutEffect || useEffect)(() => {")
        .replace("paintKaraokeLiveEntry(entry, now());", "paintKaraokeLiveEntry(entry, performance.now());");

    let page = readKaraokeRendererDeclarations();
    const curveCache = section(fillSession, "let karaokeFillCorrectionCurveCacheKey", "const getKaraokeCharFill");
    const charFill = section(fillSession, "const getKaraokeCharFill", "const getKaraokeLiveFill");
    const liveFill = fillSession.slice(fillSession.indexOf("const getKaraokeLiveFill"));
    const beforeMotion = [fillMath, charFill, motionMath, motionSession, glyphUpdates].join("\n");
    page = page.replace(section(page, "const getKaraokeVisualSettings =", "const getPageWordSupplementLanguage ="), beforeMotion + "\n");
    return page
        .replace("const PSEUDO_KARAOKE_SOURCES", curveDefaults + "const PSEUDO_KARAOKE_SOURCES")
        .replace("const KARAOKE_CHAR_STATE_CLASS_NAMES", curve + curveCache + "\nconst KARAOKE_CHAR_STATE_CLASS_NAMES")
        .replace("// Pronunciation fill (Settings > Karaoke mode).", paintHeader + liveFill + "\n" + paintSession + "\n// Pronunciation fill (Settings > Karaoke mode).");
}

export function createKaraokeHarnessFactory(...paramsAndBody) {
    // Some equivalence tests reuse source-extracted fixtures with historical
    // Pages.js. Give those same fixtures the real modules for current pages.
    return new Function("karaokePageModules", "readKaraokePageHarnessSource", "lyricsWordSegmenter", ...paramsAndBody)
        .bind(null, karaokePageModules, readKaraokePageHarnessSource, lyricsWordSegmenter);
}

export function expandHistoricalCulturalGlyphFragments(children) {
    return children.flatMap(child =>
        child?.tag === "fragment" && /^karaoke-cultural-marker-\d+$/.test(child.props?.key)
            ? child.children.flat(Infinity)
            : [child]);
}
