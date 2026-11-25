const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);

export const PRONUNCIATION_TIMING_DELAY_MS = 700;

export const isEstimatedPronunciationTiming = source => PSEUDO_KARAOKE_SOURCES.has(source);
