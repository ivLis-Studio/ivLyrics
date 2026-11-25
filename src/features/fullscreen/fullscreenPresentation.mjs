const PRESENTATIONS = Object.freeze(["standard", "vinyl", "compact-vinyl", "video", "motion"]);

export const FULLSCREEN_PRESENTATION_STORAGE_KEY = "ivLyrics:visual:fullscreen-presentation";

export function normalizeFullscreenPresentation(value, fallback = "standard") {
  const normalized = String(value || "").trim();
  return PRESENTATIONS.includes(normalized) ? normalized : fallback;
}

export function normalizeFullscreenFocusPresentation(value) {
  const normalized = normalizeFullscreenPresentation(value, "vinyl");
  return normalized === "standard" ? "vinyl" : normalized;
}

export function isFocusedLyricsPresentation(mode) {
  return mode === "vinyl" || mode === "video" || mode === "motion";
}
