import { getPageLyricsSnapshotDisplay } from "./pageLyricsDataLoader.mjs";
import { emptyLyricsState } from "./pageLyricsLoadState.mjs";
import { retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";

const { currentLyrics: _display, ...emptyRawLyrics } = emptyLyricsState;

function hasInstrumentalMarker(lyrics) {
  return Array.isArray(lyrics) && lyrics.length <= 3 && lyrics.some(line => {
    const text = typeof line?.text === "string" ? line.text.toLowerCase() : "";
    return text.includes("no lyrics") || text.includes("instrumental");
  });
}

export function createPageLyricsLoadPresentation({
  getVisualSettings, getModeKey, detectLanguage, getTargetLanguage,
  getPronunciationNotation, getTranslationStyle, getSourceText,
}) {
  return function prepare(page, {
    info, mode, refresh, requestSeq, trackLyricsProviderOverride, trackLanguageOverride,
    sharedSnapshot, resolved, latestSnapshot,
  }) {
    const { result, isCached, reusesSharedSnapshot } = resolved;
    const { currentLyrics: _display, ...source } = retainLrcRedWordTiming(result, latestSnapshot?.rawResult);
    const rawResult = {
      ...emptyRawLyrics,
      provider: "",
      contributors: null,
      ...source,
      trackLyricsProviderOverride,
      trackBackgroundOverride: page.trackBackgroundOverride,
      lyricsRequestSeq: requestSeq,
      isLoading: false,
      isCached,
    };
    const instrumental = [rawResult.karaoke, rawResult.synced, rawResult.unsynced].some(hasInstrumentalMarker);
    if (instrumental) {
      Object.assign(rawResult, emptyRawLyrics, { error: "Instrumental" });
    }

    const { lockedMode, explicitMode } = page.state;
    let selectedMode = mode;
    if (mode === -1) {
      if (page.isModeAvailable(lockedMode, rawResult)) selectedMode = lockedMode;
      else if (page.isModeAvailable(explicitMode, rawResult)) selectedMode = explicitMode;
      else selectedMode = page.getAutomaticMode(rawResult);
    }
    const lyrics = page.resolveLyricsForMode(rawResult, selectedMode);
    const hasLyrics = Array.isArray(lyrics) && lyrics.length > 0;
    const display = reusesSharedSnapshot && hasLyrics && getPageLyricsSnapshotDisplay({
      snapshot: sharedSnapshot,
      displayLyrics: sharedSnapshot?.displayLyrics,
      lyrics, modeKey: getModeKey(selectedMode), visual: getVisualSettings(), trackLanguageOverride,
      detectLanguage, getTargetLanguage, getPronunciationNotation, getTranslationStyle, getSourceText,
    });
    let languagePatch = {};
    if (rawResult.uri !== page.state.uri || refresh) {
      const timedOrPlainLyrics = rawResult.synced || rawResult.unsynced;
      languagePatch = { language: timedOrPlainLyrics ? detectLanguage(timedOrPlainLyrics) : null };
    }

    return {
      rawResult,
      hasLyrics,
      languagePatch,
      reusedDisplay: !!display,
      patch: {
        currentLyrics: display || lyrics || [],
        lyricsStatus: hasLyrics ? "ready" : "empty",
        lyricsDisplayUri: info.uri,
      },
    };
  };
}
