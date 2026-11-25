import { getRuntimeService as getAppService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { createGlobalSyncOffsetReader } from "#ivlyrics/core/globalSyncOffset.mjs";
import { createVideoHelperService } from "#ivlyrics/features/video/VideoHelperService.js";
import { createCommunityVideoSelector } from "#ivlyrics/features/video/CommunityVideoSelector.js";
import { createVideoBackground } from "#ivlyrics/features/video/VideoBackground.js";
import { isYouTubeBackgroundAdPlaying } from "#ivlyrics/features/video/youTubeBackgroundRuntime.mjs";
import { publishRuntimeService as publishVideoCompatibility } from "#ivlyrics/spicetify/runtimeServices.mjs";

export function startPageVideo({
  host: window, react, spicetify: Spicetify, config: CONFIG, i18n: I18n, storage: StorageManager,
  utils: Utils, toast: Toast, videoMatch: VideoMatch,
  routeVideoMatchSession, makeVideoLookupRequest, readRoutePrefetchedVideo, fetchVideoLookup,
}) {
  const VideoHelperService = createVideoHelperService({
    host: window, request: (...args) => fetch(...args),
  });
  const { CommunityVideoSelector } = createCommunityVideoSelector({
    host: window, react, config: CONFIG, i18n: I18n, storage: StorageManager,
    spicetify: Spicetify, utils: Utils, toast: Toast, videoHelper: VideoHelperService,
  });
  const { VideoBackground } = createVideoBackground({
    host: window, react, config: CONFIG, i18n: I18n, spicetify: Spicetify, utils: Utils, toast: Toast,
    readLyricsCache: () => getAppService("LyricsCache", window),
    videoHelper: VideoHelperService, matchSession: routeVideoMatchSession,
    makeVideoLookupRequest, readRoutePrefetchedVideo, fetchVideoLookup,
    readSpotifyData: (uri) => getAppService("SpotifyDataHelper", window)?.extractSpotifyData?.(uri),
    readSyncDataService: () => getAppService("SyncDataService", window),
    readApiTracker: () => getAppService("ApiTracker", window),
    readGlobalSyncOffset: createGlobalSyncOffsetReader(window, { readVisualSettings: () => CONFIG.visual }),
    isYouTubeAdPlaying: (player) => isYouTubeBackgroundAdPlaying(window, player),
  });

  for (const [name, service] of Object.entries({
    VideoHelperService, CommunityVideoSelector, VideoBackground, ivLyricsVideoMatch: VideoMatch,
  })) {
    publishVideoCompatibility(name, service, window);
  }
  return { VideoHelperService, CommunityVideoSelector, VideoBackground };
}
