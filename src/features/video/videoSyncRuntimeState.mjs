const lyricStarts = new WeakMap();
export const VIDEO_LYRIC_START_CHANGED = "ivLyrics:video-lyric-start-changed";

// The player, selectors and sync controls run in the same window. Keep these
// published fields available while callers use a shared module to access them.
export function readActiveCommunityVideo(host) {
  return host.ivLyricsActiveCommunityVideoInfo;
}

export function writeActiveCommunityVideo(host, video) {
  host.ivLyricsActiveCommunityVideoInfo = video;
}

export function readFirstLyricTime(host, trackUri) {
  const start = lyricStarts.get(host);
  if (!start || trackUri === undefined) return host.ivLyrics_firstLyricTime;
  return start.trackUri === trackUri ? start.time : null;
}

export function readActiveCommunityVideoOwner(host) {
  return host.ivLyricsActiveCommunityVideoOwner;
}

export function writeActiveCommunityVideoOwner(host, owner) {
  host.ivLyricsActiveCommunityVideoOwner = owner;
}

export function writeFirstLyricTime(host, startTime, trackUri, owner) {
  const previous = lyricStarts.get(host);
  const time = trackUri && Number.isFinite(startTime) && startTime >= 0 ? startTime : null;
  lyricStarts.set(host, { trackUri, time, owner });
  host.ivLyrics_firstLyricTime = time;
  if (previous?.trackUri !== trackUri || previous?.time !== time) {
    host.dispatchEvent?.(new CustomEvent(VIDEO_LYRIC_START_CHANGED));
  }
}

export function clearFirstLyricTime(host, owner) {
  if (lyricStarts.get(host)?.owner === owner) writeFirstLyricTime(host, null, null, null);
}
