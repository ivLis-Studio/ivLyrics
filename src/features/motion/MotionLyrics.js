// Mobile WebView entry for the shared motion engine.
import { TinySegmenter } from "#ivlyrics/vendor/TinySegmenter.js";
import { lyricsWordSegmenter } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";
import { motionHost } from "#ivlyrics/features/motion/motionHost.mjs";
import { startMotionLyrics } from "#ivlyrics/features/motion/motionApi.mjs";

motionHost.TinySegmenter = TinySegmenter;
motionHost.LyricsWordSegmenter = lyricsWordSegmenter;
startMotionLyrics({
  host: motionHost,
  react: motionHost.Spicetify?.React,
  directionServices: {
    readLyricsCache: () => motionHost.LyricsCache,
    readAiManager: () => motionHost.AIAddonManager,
    getTrackCacheId: uri => motionHost.Utils?.extractTrackId?.(uri),
  },
  playback: {
    readAnalysisLoader: () => motionHost.ivLyricsCdVisualizer?.loadAnalysis,
    readFrameAlignedPosition: frameTime => motionHost.ivLyricsLyricRendererPrimitives?.getFrameAlignedLyricsPlaybackPosition?.(frameTime),
    readPosition: () => motionHost.Spicetify?.Player?.getProgress?.(),
    readTrackUri: () => motionHost.Utils?.getPlayerPlaybackSnapshot?.()?.uri || motionHost.Spicetify?.Player?.data?.item?.uri || "",
  },
  translate: key => motionHost.I18n?.t?.(key),
  detectLanguage: lyrics => motionHost.LyricsService?.detectLanguage?.(lyrics) || motionHost.Utils?.detectLanguage?.(lyrics),
  shapedOutlines: motionHost.ivLyricsMotionConfig?.shapedOutlines,
});
