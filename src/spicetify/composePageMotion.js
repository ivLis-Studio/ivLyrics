import { getRuntimeService, publishRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { createCdVisualizerApi } from "#ivlyrics/features/player/CdVisualizer.js";
import { startMotionLyrics } from "#ivlyrics/features/motion/motionApi.mjs";
import { createRuntimeTrackIdentity } from "#ivlyrics/core/trackIdentity.mjs";
import { getPlaybackPositionService, isPlaybackLyricsTargetCurrent } from "#ivlyrics/core/playbackPositionService.mjs";

export function startPageMotion(host, lyricRendererPrimitives) {
  const CdVisualizer = createCdVisualizerApi(host);
  publishRuntimeService("ivLyricsCdVisualizer", CdVisualizer, host);
  const readService = name => getRuntimeService(name, host);
  const trackIdentity = createRuntimeTrackIdentity(host);
  const readLegacyUtils = () => readService("Utils");
  startMotionLyrics({
    host,
    react: host.Spicetify?.React,
    directionServices: {
      readLyricsCache: () => readService("LyricsCache"),
      readAiManager: () => readService("AIAddonManager"),
      getTrackCacheId: uri => trackIdentity.getTranslationCacheId(uri)
        || readLegacyUtils()?.getTranslationCacheId?.(uri) || readLegacyUtils()?.extractTrackId?.(uri),
    },
    playback: {
      readAnalysisLoader: () => CdVisualizer.loadAnalysis,
      readFrameAlignedPosition: frameTime => lyricRendererPrimitives?.getFrameAlignedLyricsPlaybackPosition?.(frameTime),
      readPosition: () => host.Spicetify?.Player?.getProgress?.(),
      isTrackCurrent: (trackUri) => {
        const snapshot = getPlaybackPositionService(host)?.getPlayerPlaybackSnapshot?.();
        return snapshot?.uri !== "" && isPlaybackLyricsTargetCurrent(
          snapshot, host.Spicetify?.Player?.data?.item?.uri, trackUri,
        );
      },
    },
    translate: key => readService("I18n")?.t?.(key),
    detectLanguage: lyrics => readService("LyricsService")?.detectLanguage?.(lyrics) || readLegacyUtils()?.detectLanguage?.(lyrics),
    shapedOutlines: host.ivLyricsMotionConfig?.shapedOutlines,
  });
  return CdVisualizer;
}
