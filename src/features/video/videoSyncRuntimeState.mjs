// The player, selectors and sync controls run in the same window. Keep these
// published fields available while callers use a shared module to access them.
export function readActiveCommunityVideo(host) {
  return host.ivLyricsActiveCommunityVideoInfo;
}

export function writeActiveCommunityVideo(host, video) {
  host.ivLyricsActiveCommunityVideoInfo = video;
}

export function readFirstLyricTime(host) {
  return host.ivLyrics_firstLyricTime;
}

export function readActiveCommunityVideoOwner(host) {
  return host.ivLyricsActiveCommunityVideoOwner;
}

export function writeActiveCommunityVideoOwner(host, owner) {
  host.ivLyricsActiveCommunityVideoOwner = owner;
}

export function writeFirstLyricTime(host, startTime) {
  host.ivLyrics_firstLyricTime = startTime;
}
