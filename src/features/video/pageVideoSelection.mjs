import { readSavedVideoSelection, suppressedCommunityVideo } from "./savedVideoSelection.mjs";

export function createPageVideoSelection({
  store, readTrackUri, isTrackCurrent, readVisualSettings, resolveHiddenCommunityVideo, setVideoInfo,
  debug, logError,
}) {
  let selectionRevision = 0;
  let savedVideoLookup = null;

  function cancelSavedVideoLookup() {
    selectionRevision++;
    savedVideoLookup?.abort();
    savedVideoLookup = null;
  }

  async function selectCommunityVideoForCurrentTrack(newVideoInfo, trackUri = readTrackUri()) {
    if (!trackUri || !isTrackCurrent(trackUri)) return null;
    cancelSavedVideoLookup();
    const revision = selectionRevision;
    const isCurrent = () => selectionRevision === revision && isTrackCurrent(trackUri);
    const hasVideo = Boolean(newVideoInfo?.youtubeVideoId);
    let saved;
    try {
      saved = hasVideo
        ? await store.saveSelectedVideo(trackUri, newVideoInfo)
        : await store.removeSelectedVideo(trackUri);
    } catch (error) {
      if (!isCurrent()) return null;
      logError("[ivLyrics] Could not save the video selection:", error);
      return false;
    }
    if (!isCurrent()) return null;
    if (saved === false) return false;
    setVideoInfo(hasVideo ? newVideoInfo : suppressedCommunityVideo(), isCurrent);
    return true;
  }

  async function loadSavedVideoForTrack(trackUri) {
    if (!trackUri || !isTrackCurrent(trackUri)) return;
    cancelSavedVideoLookup();
    const revision = selectionRevision;
    const lookup = new AbortController();
    savedVideoLookup = lookup;
    const { signal } = lookup;
    const isCurrent = () => !signal.aborted && selectionRevision === revision && isTrackCurrent(trackUri) &&
      readVisualSettings()["community-video-random"] !== true;
    const shouldHideDisliked = () => readVisualSettings()["community-video-hide-disliked"] !== false;

    try {
      const selection = await readSavedVideoSelection({
        store, trackUri, signal, isCurrent, shouldHideDisliked, resolveHiddenCommunityVideo, reportError: logError,
      });
      if (!selection || !isCurrent()) return;
      if (selection.youtubeVideoId) debug(`[ivLyrics] Loading saved video for track: ${selection.youtubeVideoId}`);
      setVideoInfo(selection, isCurrent);
    } catch (error) {
      if (isCurrent()) logError('[ivLyrics] Failed to load saved video:', error);
    } finally {
      if (savedVideoLookup === lookup) savedVideoLookup = null;
    }
  }

  return { selectCommunityVideoForCurrentTrack, loadSavedVideoForTrack, cancelSavedVideoLookup };
}
