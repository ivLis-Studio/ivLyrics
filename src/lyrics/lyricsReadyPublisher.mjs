const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

// The page and startup extension are separate bundles in the same window.
const SHARED_SNAPSHOT_HANDLED = Symbol.for("ivLyrics.lyrics-ready.shared-snapshot-handled");
export const isLyricsReadySnapshotHandled = event => event[SHARED_SNAPSHOT_HANDLED] === true;

export const buildLyricsReadyDetail = (options = {}) => {
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
  if (typeof options.translationStyle === "string") detail.translationStyle = options.translationStyle;

  return detail;
};

export const publishLyricsReady = (options = {}, eventTarget = globalThis, { sharedSnapshotHandled = false } = {}) => {
  if (!eventTarget?.dispatchEvent || typeof eventTarget.CustomEvent !== "function") {
    throw new Error("ivLyrics presentation event target is unavailable");
  }

  const detail = buildLyricsReadyDetail(options);
  const event = new eventTarget.CustomEvent("ivLyrics:lyrics-ready", { detail });
  if (sharedSnapshotHandled) event[SHARED_SNAPSHOT_HANDLED] = true;
  eventTarget.dispatchEvent(event);
  return detail;
};

export function installLyricsPresentationPublisher(host) {
  const api = Object.freeze({
    buildLyricsReadyDetail,
    publishLyricsReady: (options, target = host) => publishLyricsReady(options, target),
  });
  host.ivLyricsPresentationPublisher = api;
  return api;
}
