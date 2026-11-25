export const IVLYRICS_BACKGROUND_MODE_IDS = [
  "none", "colorful", "gradient-background", "blur-gradient-background", "solid-background", "video-background",
];
export const IVLYRICS_BACKGROUND_FLAG_IDS = IVLYRICS_BACKGROUND_MODE_IDS.filter((mode) => mode !== "none");

export function resolveGlobalBackgroundMode(visual) {
  if (visual["video-background"]) return "video-background";
  if (visual["solid-background"]) return "solid-background";
  if (visual["blur-gradient-background"]) return "blur-gradient-background";
  if (visual["gradient-background"]) return "gradient-background";
  if (visual.colorful) return "colorful";
  return "none";
}

export function normalizeIvLyricsTrackBackgroundOverride(value) {
  if (!value) return null;
  const mode = typeof value === "string" ? value : value.mode;
  return IVLYRICS_BACKGROUND_MODE_IDS.includes(mode) ? { mode } : null;
}

export function shouldFetchTrackBackgroundColors(mode) {
  return mode === "colorful" || mode === "gradient-background" || mode === "blur-gradient-background";
}
