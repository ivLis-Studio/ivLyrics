import { isKaraokeRenderMode } from "./lyricsRenderModes.mjs";
import { isPronunciationDisplayMode } from "./translationPresentation.mjs";
import {
  PRONUNCIATION_TIMING_DELAY_MS, getPronunciationTimingContextKey, isEstimatedPronunciationTiming,
} from "./pronunciationTimingSource.mjs";
import { createPronunciationTimingClient } from "./createPronunciationTimingClient.mjs";

export function createPagePronunciationPresentation({
  readApi, readDisplayMode, readState, isMounted, isPronunciationPending = () => false,
  getTargetLanguage = () => "", getSourceLanguage = () => "auto", getNotation = () => "",
  scheduleTimer, cancelTimer,
}) {
  let displayMemo = null;
  let timingRequest = null;
  let timingTimer = null;
  const timing = createPronunciationTimingClient(readApi, "page");
  const getContext = lyrics => ({
    sourceLang: getSourceLanguage(lyrics) || "auto", targetLang: getTargetLanguage(), notation: getNotation(),
  });

  function render({ lyricsState, mode, displayMode1, displayMode2, syncCreatorLyrics }) {
    const api = readApi();
    // Child rows consult the shared playback clock during the same render.
    api?.setDisplayed?.(false);
    if (syncCreatorLyrics?.length > 0) {
      return { lyrics: syncCreatorLyrics, needsTiming: false };
    }
    const { currentLyrics: lyrics, uri } = lyricsState;
    if (!api?.needsTiming?.() || !Array.isArray(lyrics) || lyrics.length === 0 ||
      (!isPronunciationDisplayMode(displayMode1) && !isPronunciationDisplayMode(displayMode2))) {
      return { lyrics, needsTiming: false };
    }
    const karaoke = isKaraokeRenderMode(mode);
    const fill = api.isFillEnabled();
    const lineLevel = readDisplayMode() !== "replace";
    if (!karaoke && (fill || !lineLevel)) return { lyrics, needsTiming: false };
    if (!fill) api.setDisplayed?.(true);

    const timed = karaoke ? timing.read(uri, lyrics, getContext(lyrics)) : null;
    if (!displayMemo || displayMemo.lyrics !== lyrics || displayMemo.timed !== timed ||
      displayMemo.karaoke !== karaoke || displayMemo.lineLevel !== lineLevel || displayMemo.fill !== fill) {
      const renderedLyrics = fill
        ? api.applyFillToLines(lyrics, { timed })
        : api.applyToLines(lyrics, { karaoke, lineLevel, timed });
      displayMemo = { lyrics, timed, karaoke, lineLevel, fill, renderedLyrics };
    }
    return { lyrics: displayMemo.renderedLyrics, needsTiming: karaoke };
  }

  // Wait for the pronunciation stream to settle before timing the committed lyrics.
  function scheduleTiming({ uri, currentLyrics: lyrics, karaokeSource, isLoading, isPhoneticLoading }) {
    if (!uri || isEstimatedPronunciationTiming(karaokeSource) || isLoading || isPhoneticLoading || isPronunciationPending()) {
      stopTiming();
      return;
    }
    const context = getContext(lyrics);
    const contextKey = getPronunciationTimingContextKey(context);
    timing.releaseUnless(uri, contextKey);
    if (timingRequest?.uri === uri && timingRequest.lyrics === lyrics
        && timingRequest.karaokeSource === karaokeSource && timingRequest.contextKey === contextKey) return;
    cancelTimer(timingTimer);
    const request = { uri, lyrics, karaokeSource, contextKey };
    timingRequest = request;
    timingTimer = scheduleTimer(() => {
      timingTimer = null;
      const state = readState();
      if (!isMounted() || state.uri !== uri || state.currentLyrics !== lyrics
          || state.karaokeSource !== karaokeSource || state.isLoading || state.isPhoneticLoading || isPronunciationPending()) {
        if (timingRequest === request) timingRequest = null;
        return;
      }
      if (getPronunciationTimingContextKey(getContext(lyrics)) !== contextKey) {
        scheduleTiming(state);
        return;
      }
      timing.ensure({ trackUri: uri, lines: lyrics, karaokeSource, ...context });
    }, PRONUNCIATION_TIMING_DELAY_MS);
  }

  function invalidateTiming() {
    cancelTimer(timingTimer);
    timingTimer = null;
    timingRequest = null;
  }

  function stopTiming() {
    invalidateTiming();
    timing.release();
  }

  function dispose() {
    stopTiming();
    displayMemo = null;
    readApi()?.setDisplayed?.(false);
  }

  return { render, scheduleTiming, invalidateTiming, stopTiming, dispose };
}
