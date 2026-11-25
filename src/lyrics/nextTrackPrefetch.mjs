import { hasLyricsRows } from "./selectPlaybackLyrics.mjs";

export function createNextTrackPrefetch({
  cache, maxAgeMs, readVisual, wordMode, lyrics, loadVideo, scheduleTimer, cancelTimer,
  debug, warn = console.warn,
}) {
  function createSession(readCurrentMode) {
    let readMode = readCurrentMode;
    let selection = null;
    let playingUri = null;
    let promoted = null;
    let active = true;

    function cancelSelection() {
      const old = selection;
      selection = null;
      if (!old) return;
      if (old.timer != null) cancelTimer(old.timer);
      old.controller.abort();
    }

    function updatePlayingTrack(uri) {
      playingUri = uri;
      if (promoted && promoted.trackInfo.uri !== playingUri) {
        const old = promoted;
        promoted = null;
        old.controller.abort();
      }
      if (!selection || selection.trackInfo.uri !== playingUri) return;
      if (selection.timer != null) {
        cancelSelection();
        return;
      }
      // Keep the running request available to playback while the next song warms up.
      promoted = selection;
      selection = null;
    }

    async function prefetch(request) {
      if (selection !== request) return;
      request.timer = null;
      const { trackInfo } = request;
      const { signal } = request.controller;
      const wanted = () => selection === request;
      const wantedForPlayback = () => wanted() || promoted === request;

      async function prefetchVideo() {
        try {
          await loadVideo(trackInfo.uri, trackInfo, { wanted: wantedForPlayback, signal });
        } catch (error) {
          if (!signal.aborted) warn("[Prefetcher] Video prefetch failed:", error);
        }
      }

      const jobs = [];
      try {
        debug(`[Prefetcher] Starting prefetch for: ${trackInfo.title}`);
        const visual = readVisual();
        if (visual["video-background"] && visual["prefetch-video-enabled"] !== false
            && visual["community-video-random"] !== true) {
          jobs.push(prefetchVideo());
        }

        const rows = await lyrics.loadLyrics(trackInfo, { wanted: wantedForPlayback, signal });
        if (wanted() && hasLyricsRows(rows)) {
          const currentSettings = readVisual();
          if (currentSettings["prefetch-enabled"] !== false) {
            jobs.push(lyrics.loadTranslations(trackInfo, rows, { wanted }));
            const mode = request.mode >= 0 ? request.mode : readMode?.();
            if (currentSettings["prefetch-word-details-enabled"] !== false && mode === wordMode) {
              jobs.push(lyrics.loadWordSupplements(trackInfo, rows, { wanted }));
            }
          }
        }
      } catch (error) {
        warn("[Prefetcher] Prefetch failed:", error);
      } finally {
        for (const result of await Promise.allSettled(jobs)) {
          if (result.status === "rejected") warn("[Prefetcher] Prefetch failed:", result.reason);
        }
        if (wanted()) debug(`[Prefetcher] Completed prefetch for: ${trackInfo.title}`);
      }
    }

    return {
      schedule(trackInfo, mode = -1) {
        if (!active) return;
        if (trackInfo?.uri && selection?.trackInfo.uri === trackInfo.uri) {
          selection.trackInfo = trackInfo;
          selection.mode = mode;
          return;
        }

        cancelSelection();
        if (!trackInfo?.uri || trackInfo.uri === playingUri) return;
        const request = { trackInfo, mode, timer: null, controller: new AbortController() };
        selection = request;
        request.timer = scheduleTimer(() => prefetch(request), 1500);
      },
      updatePlayingTrack,
      dispose() {
        active = false;
        readMode = null;
        cancelSelection();
        const old = promoted;
        promoted = null;
        old?.controller.abort();
      },
    };
  }

  function cleanupOldEntries() {
    const now = Date.now();
    for (const [key, { timestamp }] of cache) {
      if (now - timestamp > maxAgeMs) cache.delete(key);
    }
  }

  return { createSession, cleanupOldEntries };
}
