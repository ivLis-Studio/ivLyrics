// ============================================
// ivLyrics presentation publisher
// PC rendering paths publish this event; overlay and snapshot consumers receive it.
// Keep its payload construction in one place so every presentation path agrees.
// ============================================

(function initLyricsPresentationPublisher(root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ivLyricsPresentationPublisher = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function createLyricsPresentationPublisher(root) {
  "use strict";

  const hasOwn = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);

  const buildLyricsReadyDetail = (options = {}) => {
    const track = options.trackInfo || {};
    const detail = {
      trackInfo: {
        ...track,
        uri: track.uri ?? options.trackUri ?? null,
        title: track.title ?? "",
        artist: track.artist ?? "",
      },
      lyrics: Array.isArray(options.lyrics) ? options.lyrics : [],
      provider: options.provider ?? null,
      karaokeSource: options.karaokeSource ?? null,
      lyricsType: options.lyricsType ?? null,
      displayMode1: options.displayMode1 ?? null,
      displayMode2: options.displayMode2 ?? null,
      detectedLanguage: options.detectedLanguage ?? null,
      translationTargetLanguage: options.translationTargetLanguage ?? null,
      pronunciationNotation: options.pronunciationNotation ?? null,
      presentationComplete: options.presentationComplete !== false,
    };

    if (hasOwn(options, "translationSourceText")) {
      detail.translationSourceText = String(options.translationSourceText ?? "");
    }

    return detail;
  };

  const publishLyricsReady = (options = {}, eventTarget = root) => {
    if (!eventTarget?.dispatchEvent || typeof eventTarget.CustomEvent !== "function") {
      throw new Error("ivLyrics presentation event target is unavailable");
    }

    const detail = buildLyricsReadyDetail(options);
    eventTarget.dispatchEvent(new eventTarget.CustomEvent("ivLyrics:lyrics-ready", { detail }));
    return detail;
  };

  return Object.freeze({
    buildLyricsReadyDetail,
    publishLyricsReady,
  });
});
