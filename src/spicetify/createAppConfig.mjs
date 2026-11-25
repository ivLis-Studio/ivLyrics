import {
  LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY,
  normalizeIvLyricsPronunciationNotation,
} from "../lyrics/translationPreferences.mjs";
import { normalizeFullscreenFocusPresentation } from "../features/fullscreen/fullscreenPresentation.mjs";
import { resolveFullscreenShortcut } from "../features/player/fullscreenShortcutSettings.mjs";
import { IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS } from "../lyrics/speakerColors.mjs";

const visualKey = (key) => "ivLyrics:visual:" + key;
const VINYL_TYPOGRAPHY_DEFAULT_SCALE = 0.7;
const TRANSLATION_LOCALES = [
  "english", "japanese", "korean", "chinese", "russian", "vietnamese", "german",
  "swedish", "spanish", "french", "italian", "portuguese", "dutch", "polish",
  "turkish", "arabic", "hindi", "thai", "indonesian", "malay", "gemini",
];

export function createAppConfig({ storage, readI18n = () => undefined }) {
  const readItem = (key) => storage.getItem(visualKey(key));
  const readFlag = (key, ...fallback) => storage.get(visualKey(key), ...fallback);
  const readValue = (key, fallback) => readItem(key) || fallback;
  const readNumber = (key, fallback) => Number(readItem(key)) || fallback;
  const readInteger = (key, fallback) => Number.parseInt(readValue(key, fallback));
  const seedValue = (key, value) => {
    if (storage.seedItem) storage.seedItem(visualKey(key), value);
    else storage.setItem(visualKey(key), value);
  };
  const readTranslationModes = (prefix) => Object.fromEntries(TRANSLATION_LOCALES.map((locale) => {
    const key = prefix + ":" + locale;
    return [key, readValue(key, "none")];
  }));

  const readFiniteNumber = (key, fallback, min, max, { legacyBoolean = false } = {}) => {
    const stored = readItem(key);
    if (stored == null || (typeof stored === "string" && !stored.trim())) return fallback;
    if (legacyBoolean && (stored === "true" || stored === "false")) return Number(stored === "true");
    const number = Number(stored);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };

  const getOrSeedVinylTypographySetting = (name, fallback, scale = 1) => {
    const vinylKey = "fullscreen-vinyl-" + name;
    const numeric = typeof fallback === "number";
    const normalize = (value) => {
      if (value == null || value === "") return null;
      if (!numeric) return String(value).trim() || null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    const stored = normalize(readItem(vinylKey));
    if (stored !== null) return stored;

    const base = normalize(readItem(name));
    const inherited = base !== null ? base : normalize(fallback);
    const seeded = numeric && scale !== 1 ? Math.round(inherited * scale) : inherited;
    seedValue(vinylKey, seeded);
    return seeded;
  };

  const getOrSeedVideoStageTypographySetting = (settingName, fallback = "Pretendard Variable") => {
    const stageKey = "fullscreen-video-stage-" + settingName;
    const stored = String(readItem(stageKey) || "").trim();
    if (stored) return stored;

    const inherited = String(readItem("fullscreen-vinyl-" + settingName) || fallback).trim() || fallback;
    seedValue(stageKey, inherited);
    return inherited;
  };

  const visual = {
    language: readI18n()?.getCurrentLanguage?.() || readItem("language"),
    "playbar-button": readFlag("playbar-button", false),
    "fullscreen-button": readFlag("fullscreen-button", false),
    "panel-lyrics-enabled": readFlag("panel-lyrics-enabled", true),
    "panel-font-scale": readValue("panel-font-scale", "100"),
    "panel-lyrics-font-family": readValue("panel-lyrics-font-family", "Pretendard Variable"),
    "panel-lyrics-original-font": readValue("panel-lyrics-original-font", ""),
    "panel-lyrics-phonetic-font": readValue("panel-lyrics-phonetic-font", ""),
    "panel-lyrics-translation-font": readValue("panel-lyrics-translation-font", ""),
    "panel-lyrics-original-size": readValue("panel-lyrics-original-size", "26"),
    "panel-lyrics-phonetic-size": readValue("panel-lyrics-phonetic-size", "13"),
    "panel-lyrics-translation-size": readValue("panel-lyrics-translation-size", "13"),
    "panel-lyrics-original-outline-width": readValue("panel-lyrics-original-outline-width", "0"),
    "panel-lyrics-original-outline-color": readValue("panel-lyrics-original-outline-color", "#000000"),
    "panel-lyrics-phonetic-outline-width": readValue("panel-lyrics-phonetic-outline-width", "0"),
    "panel-lyrics-phonetic-outline-color": readValue("panel-lyrics-phonetic-outline-color", "#000000"),
    "panel-lyrics-translation-outline-width": readValue("panel-lyrics-translation-outline-width", "0"),
    "panel-lyrics-translation-outline-color": readValue("panel-lyrics-translation-outline-color", "#000000"),
    "panel-bg-type": readValue("panel-bg-type", "album"),
    "panel-bg-color": readValue("panel-bg-color", "#6366f1"),
    "panel-bg-gradient-1": readValue("panel-bg-gradient-1", "#6366f1"),
    "panel-bg-gradient-2": readValue("panel-bg-gradient-2", "#a855f7"),
    "panel-bg-opacity": readValue("panel-bg-opacity", "30"),
    "panel-border-enabled": readFlag("panel-border-enabled", false),
    "panel-border-color": readValue("panel-border-color", "#ffffff"),
    "panel-border-opacity": readValue("panel-border-opacity", "10"),
    ...Object.fromEntries(Object.entries(IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS)
      .map(([key, color]) => [key, readValue(key, color)])),
    "sync-data-custom-speaker-colors-enabled": readFlag("sync-data-custom-speaker-colors-enabled", true),
    colorful: readFlag("colorful", false),
    "gradient-background": readFlag("gradient-background"),
    "album-bg-blur": readValue("album-bg-blur", "20"),
    "reduce-motion": readFlag("reduce-motion", false),
    "performance-frame-rate": readNumber("performance-frame-rate", 60),
    "instrumental-break-icon": readValue("instrumental-break-icon", "equalizer"),
    "instrumental-break-show-label": readFlag("instrumental-break-show-label", false),
    "instrumental-break-auto-detect": readFlag("instrumental-break-auto-detect", true),
    "instrumental-break-keep-previous": readFlag("instrumental-break-keep-previous", false),
    "instrumental-break-label-font-family": readValue("instrumental-break-label-font-family", ""),
    "instrumental-break-label-font-size": readValue("instrumental-break-label-font-size", ""),
    "instrumental-break-label-font-weight": readValue("instrumental-break-label-font-weight", ""),
    "instrumental-break-label-opacity": readValue("instrumental-break-label-opacity", ""),
    "instrumental-break-label-outline-width": readValue("instrumental-break-label-outline-width", "0"),
    "instrumental-break-label-outline-color": readValue("instrumental-break-label-outline-color", "#000000"),
    "instrumental-break-animation-speed": readNumber("instrumental-break-animation-speed", 100),

    "blur-gradient-background": readFlag("blur-gradient-background", false),
    "background-brightness": readInteger("background-brightness", "30"),
    "solid-background": readFlag("solid-background", false),
    "video-background": readFlag("video-background", false),
    "community-video-random": readFlag("community-video-random", false),
    "community-video-hide-disliked": readFlag("community-video-hide-disliked", true),
    "video-helper-enabled": readFlag("video-helper-enabled", false),
    "lyrics-helper-enabled": readFlag("lyrics-helper-enabled", false),
    "video-blur": readValue("video-blur", "5"),
    "video-cover": readFlag("video-cover", false),
    "video-scale": readInteger("video-scale", "105") || 105,
    "video-fallback-background": readValue("video-fallback-background", "album-cover"),
    "solid-background-color": readValue("solid-background-color", "#1e3a8a"),
    noise: readFlag("noise"),
    "background-color": readValue("background-color", "var(--spice-main)"),
    "active-color": readValue("active-color", "var(--spice-text)"),
    "inactive-color": readValue("inactive-color", "rgba(var(--spice-rgb-subtext),0.5)"),
    "highlight-color": readValue("highlight-color", "var(--spice-button)"),
    alignment: readValue("alignment", "center"),
    "lines-before": readInteger("lines-before", "0"),
    "lines-after": readInteger("lines-after", "2"),
    "lyrics-anchor-position": readValue("lyrics-anchor-position", "50"),
    "lyrics-side-margin": readValue("lyrics-side-margin", "0"),
    "lyrics-backdrop-blur": readValue("lyrics-backdrop-blur", "0"),
    "font-size": readInteger("font-size", "32"),
    "font-family": readValue("font-family", "Pretendard Variable"),
    "original-font-family": readValue("original-font-family", "Pretendard Variable"),
    "phonetic-font-family": readValue("phonetic-font-family", "Pretendard Variable"),
    "translation-font-family": readValue("translation-font-family", "Pretendard Variable"),
    "cultural-annotations-font-family": readValue("cultural-annotations-font-family", "Pretendard Variable"),
    "cultural-annotations-vinyl-font-family": readValue("cultural-annotations-vinyl-font-family", "Pretendard Variable"),
    "original-outline-width": readValue("original-outline-width", "0"),
    "original-outline-color": readValue("original-outline-color", "#000000"),
    "phonetic-outline-width": readValue("phonetic-outline-width", "0"),
    "phonetic-outline-color": readValue("phonetic-outline-color", "#000000"),
    "translation-outline-width": readValue("translation-outline-width", "0"),
    "translation-outline-color": readValue("translation-outline-color", "#000000"),
    "furigana-outline-width": readValue("furigana-outline-width", "0"),
    "furigana-outline-color": readValue("furigana-outline-color", "#000000"),
    "cultural-annotations-outline-width": readValue("cultural-annotations-outline-width", "0"),
    "cultural-annotations-outline-color": readValue("cultural-annotations-outline-color", "#000000"),
    "cultural-annotations-vinyl-outline-width": readValue("cultural-annotations-vinyl-outline-width", "0"),
    "cultural-annotations-vinyl-outline-color": readValue("cultural-annotations-vinyl-outline-color", "#000000"),
    "original-font-weight": readInteger("original-font-weight", "600"),
    "original-font-size": readInteger("original-font-size", "44"),
    "translation-font-weight": readInteger("translation-font-weight", "300"),
    "translation-font-size": readInteger("translation-font-size", "22"),
    "cultural-annotations-font-weight": readInteger("cultural-annotations-font-weight", "300"),
    "cultural-annotations-font-size": readInteger("cultural-annotations-font-size", "14"),
    "cultural-annotations-vinyl-font-weight": readInteger("cultural-annotations-vinyl-font-weight", "300"),
    "cultural-annotations-vinyl-font-size": readInteger("cultural-annotations-vinyl-font-size", "12"),
    "translation-spacing": readValue("translation-spacing", "0"),
    "phonetic-font-weight": readValue("phonetic-font-weight", "100"),
    "phonetic-font-size": readValue("phonetic-font-size", "16"),
    "phonetic-opacity": readValue("phonetic-opacity", "70"),
    "phonetic-spacing": readValue("phonetic-spacing", "-1"),
    "phonetic-hyphen-replace": readValue("phonetic-hyphen-replace", "keep"),
    "original-letter-spacing": readValue("original-letter-spacing", "0"),
    "phonetic-letter-spacing": readValue("phonetic-letter-spacing", "0"),
    "translation-letter-spacing": readValue("translation-letter-spacing", "0"),
    "furigana-font-weight": readValue("furigana-font-weight", "300"),
    "furigana-font-size": readValue("furigana-font-size", "14"),
    "furigana-opacity": readValue("furigana-opacity", "80"),
    "furigana-spacing": readValue("furigana-spacing", "2"),
    "text-shadow-enabled": readFlag("text-shadow-enabled", true),
    "text-shadow-color": readValue("text-shadow-color", "#000000"),
    "text-shadow-opacity": readInteger("text-shadow-opacity", "50"),
    "text-shadow-blur": readInteger("text-shadow-blur", "2"),
    "original-opacity": readInteger("original-opacity", "95"),
    "translation-opacity": readInteger("translation-opacity", "85"),
    "cultural-annotations-opacity": readInteger("cultural-annotations-opacity", "60"),
    "cultural-annotations-vinyl-opacity": readInteger("cultural-annotations-vinyl-opacity", "60"),
    "translate:translated-lyrics-source": readValue("translate:translated-lyrics-source", "auto"),
    "translate:display-mode": readValue("translate:display-mode", "below"),
    "translate:target-language": readValue("translate:target-language", "auto"),
    "translate:pronunciation-notation": normalizeIvLyricsPronunciationNotation(
      storage.getItem(LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY)
    ),
    "cultural-annotations-enabled": readFlag("cultural-annotations-enabled", false),
    "translate:detect-language-override": readValue("translate:detect-language-override", "off"),
    ...readTranslationModes("translation-mode"),
    ...readTranslationModes("translation-mode-2"),
    "gemini-api-key": storage.getPersisted(visualKey("gemini-api-key")) || "",
    "gemini-api-key-romaji": storage.getPersisted(visualKey("gemini-api-key-romaji")) ||
      "",
    translate: readFlag("translate", false),
    "furigana-enabled": readFlag("furigana-enabled", false),
    "ja-detect-threshold": readInteger("ja-detect-threshold", "40"),
    "hans-detect-threshold": readInteger("hans-detect-threshold", "40"),
    "fade-blur": readFlag("fade-blur"),
    "highlight-mode": readFlag("highlight-mode", false),
    "highlight-intensity": readInteger("highlight-intensity", "70"),
    "karaoke-bounce": readFlag("karaoke-bounce", true),
    // "classic" (default) or "expressive" spring-driven word motion.
    "karaoke-motion-style": readItem("karaoke-motion-style") === "expressive"
        ? "expressive"
        : "classic",
    // Clicking a line lands slightly before it so Spotify's seek fade-in does
    // not swallow the first syllable.
    "seek-fade-compensation": readFlag("seek-fade-compensation", false),
    "karaoke-line-transition": readFlag("karaoke-line-transition", true),
    "karaoke-text-effects": readFlag("karaoke-text-effects", true),
    "karaoke-mode-enabled": readFlag("karaoke-mode-enabled", true),
    "sync-creator-auto-boundary-chars": readFlag("sync-creator-auto-boundary-chars", true),
    "karaoke-fill-correction-curve": readValue("karaoke-fill-correction-curve", "[[0,0],[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]]"),
    "spotify-fake-karaoke-enabled": readFlag("spotify-fake-karaoke-enabled", false),
    "pseudo-karaoke-render-advance": readFiniteNumber("pseudo-karaoke-render-advance", 250, 0, 500),
    "prefer-sync-data-provider": readFlag("prefer-sync-data-provider", true),
    "prefer-lyrics-type-over-provider-order": readFlag("prefer-lyrics-type-over-provider-order", true),
    // Prefetch settings
    "prefetch-enabled": readFlag("prefetch-enabled", true),
    "prefetch-video-enabled": readFlag("prefetch-video-enabled", true),
    "prefetch-word-details-enabled": readFlag("prefetch-word-details-enabled", true),
    // Pronunciation-first mode: pronunciation and original swap rows.
    "pronunciation-first": readFlag("pronunciation-first", false),
    // Synced pronunciation: karaoke pronunciation is requested by sung unit,
    // and pronunciation-first and the fill become available. Off: plain text.
    "synced-pronunciation": readFlag("synced-pronunciation", false),
    // Karaoke rows fill their pronunciation row along the sung units.
    "pronunciation-karaoke-fill": readFlag("pronunciation-karaoke-fill", false),
    "global-sync-offset": readNumber("global-sync-offset", 0),
    "quick-sync-controls-enabled": readFlag("quick-sync-controls-enabled", true),
    "fullscreen-key": resolveFullscreenShortcut("fullscreen-key", readItem("fullscreen-key")),
    "toggle-tv-mode-key": resolveFullscreenShortcut("toggle-tv-mode-key", readItem("toggle-tv-mode-key")),
    "synced-compact": readFlag("synced-compact"),
    // 메타데이터 번역 (제목/아티스트)
    "translate-metadata": readFlag("translate-metadata", false),
    "translate-metadata-mode": readValue("translate-metadata-mode", "translated"),
    // Fullscreen settings
    "fullscreen-two-column": readFlag("fullscreen-two-column", true),
    "fullscreen-layout-reverse": readFlag("fullscreen-layout-reverse", false),
    "fullscreen-show-album": readFlag("fullscreen-show-album", true),
    "fullscreen-show-info": readFlag("fullscreen-show-info", true),
    "fullscreen-center-when-no-lyrics": readFlag("fullscreen-center-when-no-lyrics", true),
    "fullscreen-album-size": readValue("fullscreen-album-size", "400"),
    "fullscreen-album-radius": readValue("fullscreen-album-radius", "12"),
    // Fullscreen vinyl mode
    "fullscreen-album-open-lp": readFlag("fullscreen-album-open-lp", true),
    "fullscreen-vinyl-album-size": readNumber("fullscreen-vinyl-album-size", 100),
    "fullscreen-vinyl-record-size": readNumber("fullscreen-vinyl-record-size", 100),
    "fullscreen-vinyl-background-blur": readNumber("fullscreen-vinyl-background-blur", 0),
    "fullscreen-vinyl-animations": readFlag("fullscreen-vinyl-animations", true),
    "fullscreen-vinyl-track-change-animation": readFlag("fullscreen-vinyl-track-change-animation", true),
    "fullscreen-vinyl-rotation-speed": (() => {
      const stored = readItem("fullscreen-vinyl-rotation-speed");
      const speed = Number(stored ?? 100);
      return Number.isFinite(speed) ? Math.min(200, Math.max(25, speed)) : 100;
    })(),
    "fullscreen-vinyl-center-rotation": readFlag("fullscreen-vinyl-center-rotation", true),
    "fullscreen-vinyl-lyrics-enabled": readFlag("fullscreen-vinyl-lyrics-enabled", true),
    // Motion lyrics fly over the song's video, or over the track background used elsewhere.
    "fullscreen-motion-background": readItem("fullscreen-motion-background") === "track" ? "track" : "video",
    // Motion lyrics comfort: how much the camera moves, how far it turns the screen, and no flashing.
    "fullscreen-motion-intensity": (() => {
      const stored = readItem("fullscreen-motion-intensity");
      return stored === "calm" || stored === "wild" ? stored : "normal";
    })(),
    "fullscreen-motion-rotation": (() => {
      const stored = readItem("fullscreen-motion-rotation");
      return stored === "gentle" || stored === "off" ? stored : "full";
    })(),
    "fullscreen-motion-safe": readFlag("fullscreen-motion-safe", false),
    "fullscreen-cd-disc-size": Number(readItem("fullscreen-cd-disc-size") ?? 100),
    "fullscreen-cd-rotation-enabled": readFlag("fullscreen-cd-rotation-enabled", true),
    "fullscreen-cd-rotation-speed": Number(readItem("fullscreen-cd-rotation-speed") ?? 100),
    "fullscreen-cd-visualizer-enabled": readFlag("fullscreen-cd-visualizer-enabled", true),
    "fullscreen-cd-visualizer-style": readValue("fullscreen-cd-visualizer-style", "bars"),
    "fullscreen-cd-visualizer-color-mode": readValue("fullscreen-cd-visualizer-color-mode", "album"),
    "fullscreen-cd-visualizer-album-gradient": readFlag("fullscreen-cd-visualizer-album-gradient", true),
    "fullscreen-cd-visualizer-color": readValue("fullscreen-cd-visualizer-color", "#ffffff"),
    "fullscreen-cd-visualizer-sensitivity": Number(readItem("fullscreen-cd-visualizer-sensitivity") ?? 100),
    "fullscreen-cd-visualizer-density": Number(readItem("fullscreen-cd-visualizer-density") ?? 64),
    "fullscreen-cd-visualizer-thickness": Number(readItem("fullscreen-cd-visualizer-thickness") ?? 2),
    "fullscreen-cd-visualizer-mirror": readFlag("fullscreen-cd-visualizer-mirror", false),
    "fullscreen-focus-presentation": normalizeFullscreenFocusPresentation(
        readItem("fullscreen-focus-presentation")
      ),
    "fullscreen-vinyl-tonearm-style": readValue("fullscreen-vinyl-tonearm-style", "s"),
    "fullscreen-vinyl-tonearm-finish": readValue("fullscreen-vinyl-tonearm-finish", "white"),
    "fullscreen-vinyl-tonearm-size": readNumber("fullscreen-vinyl-tonearm-size", 100),
    "fullscreen-vinyl-original-font-family": getOrSeedVinylTypographySetting("original-font-family", "Pretendard Variable"),
    "fullscreen-vinyl-original-font-size": getOrSeedVinylTypographySetting("original-font-size", 44, VINYL_TYPOGRAPHY_DEFAULT_SCALE),
    "fullscreen-vinyl-original-font-weight": getOrSeedVinylTypographySetting("original-font-weight", 600),
    "fullscreen-vinyl-original-opacity": getOrSeedVinylTypographySetting("original-opacity", 95),
    "fullscreen-vinyl-original-letter-spacing": getOrSeedVinylTypographySetting("original-letter-spacing", 0),
    "fullscreen-vinyl-original-outline-width": readValue("fullscreen-vinyl-original-outline-width", "0"),
    "fullscreen-vinyl-original-outline-color": readValue("fullscreen-vinyl-original-outline-color", "#000000"),
    "fullscreen-vinyl-phonetic-font-family": getOrSeedVinylTypographySetting("phonetic-font-family", "Pretendard Variable"),
    "fullscreen-vinyl-phonetic-font-size": getOrSeedVinylTypographySetting("phonetic-font-size", 16, VINYL_TYPOGRAPHY_DEFAULT_SCALE),
    "fullscreen-vinyl-phonetic-font-weight": getOrSeedVinylTypographySetting("phonetic-font-weight", 100),
    "fullscreen-vinyl-phonetic-opacity": getOrSeedVinylTypographySetting("phonetic-opacity", 70),
    "fullscreen-vinyl-phonetic-spacing": getOrSeedVinylTypographySetting("phonetic-spacing", -1),
    "fullscreen-vinyl-phonetic-letter-spacing": getOrSeedVinylTypographySetting("phonetic-letter-spacing", 0),
    "fullscreen-vinyl-phonetic-outline-width": readValue("fullscreen-vinyl-phonetic-outline-width", "0"),
    "fullscreen-vinyl-phonetic-outline-color": readValue("fullscreen-vinyl-phonetic-outline-color", "#000000"),
    "fullscreen-vinyl-translation-font-family": getOrSeedVinylTypographySetting("translation-font-family", "Pretendard Variable"),
    "fullscreen-vinyl-translation-font-size": getOrSeedVinylTypographySetting("translation-font-size", 22, VINYL_TYPOGRAPHY_DEFAULT_SCALE),
    "fullscreen-vinyl-translation-font-weight": getOrSeedVinylTypographySetting("translation-font-weight", 300),
    "fullscreen-vinyl-translation-opacity": getOrSeedVinylTypographySetting("translation-opacity", 85),
    "fullscreen-vinyl-translation-spacing": getOrSeedVinylTypographySetting("translation-spacing", 0),
    "fullscreen-vinyl-translation-letter-spacing": getOrSeedVinylTypographySetting("translation-letter-spacing", 0),
    "fullscreen-vinyl-translation-outline-width": readValue("fullscreen-vinyl-translation-outline-width", "0"),
    "fullscreen-vinyl-translation-outline-color": readValue("fullscreen-vinyl-translation-outline-color", "#000000"),
    "fullscreen-video-stage-original-font-family": getOrSeedVideoStageTypographySetting("original-font-family"),
    "fullscreen-video-stage-phonetic-font-family": getOrSeedVideoStageTypographySetting("phonetic-font-family"),
    "fullscreen-video-stage-translation-font-family": getOrSeedVideoStageTypographySetting("translation-font-family"),
    "fullscreen-video-stage-cultural-font-family": getOrSeedVideoStageTypographySetting(
        "cultural-font-family",
        readItem("cultural-annotations-vinyl-font-family") ||
          "Pretendard Variable"
      ),
    "fullscreen-video-stage-lyric-background-color": readValue("fullscreen-video-stage-lyric-background-color", "#000000"),
    "fullscreen-video-stage-lyric-background-opacity": readFiniteNumber(
      "fullscreen-video-stage-lyric-background-opacity", 46, 0, 100, { legacyBoolean: true },
    ),
    "fullscreen-title-size": readValue("fullscreen-title-size", "48"),
    "fullscreen-title-outline-width": readValue("fullscreen-title-outline-width", "0"),
    "fullscreen-title-outline-color": readValue("fullscreen-title-outline-color", "#000000"),
    "fullscreen-artist-size": readValue("fullscreen-artist-size", "24"),
    "fullscreen-artist-outline-width": readValue("fullscreen-artist-outline-width", "0"),
    "fullscreen-artist-outline-color": readValue("fullscreen-artist-outline-color", "#000000"),
    // Fullscreen UI elements
    "fullscreen-show-clock": readFlag("fullscreen-show-clock", true),
    "fullscreen-clock-size": readNumber("fullscreen-clock-size", 48),
    "fullscreen-clock-outline-width": readValue("fullscreen-clock-outline-width", "0"),
    "fullscreen-clock-outline-color": readValue("fullscreen-clock-outline-color", "#000000"),
    "fullscreen-show-context": readFlag("fullscreen-show-context", true),
    "fullscreen-show-next-track": readFlag("fullscreen-show-next-track", true),
    "fullscreen-next-track-seconds": readNumber("fullscreen-next-track-seconds", 15),
    "fullscreen-show-controls": readFlag("fullscreen-show-controls", true),
    "fullscreen-show-volume": readFlag("fullscreen-show-volume", true),
    "fullscreen-show-progress": readFlag("fullscreen-show-progress", true),
    "fullscreen-show-lyrics-progress": readFlag("fullscreen-show-lyrics-progress", false),
    // Fullscreen control styles
    "fullscreen-control-button-size": readNumber("fullscreen-control-button-size", 36),
    "fullscreen-controls-background": readFlag("fullscreen-controls-background", false),
    // Fullscreen auto-hide
    "fullscreen-auto-hide-ui": readFlag("fullscreen-auto-hide-ui", true),
    "fullscreen-auto-hide-delay": readNumber("fullscreen-auto-hide-delay", 3),
    // Browser fullscreen (monitor fill)
    "fullscreen-browser-fullscreen": readFlag("fullscreen-browser-fullscreen", false),
    "fullscreen-page-ui-only": readFlag("fullscreen-page-ui-only", false),
    // Show a second toolbar button for the other fullscreen presentation.
    "fullscreen-separate-buttons": readFlag("fullscreen-separate-buttons", false),
    "fullscreen-hide-overlay": readFlag("fullscreen-hide-overlay", true),
    // TMI font size
    "fullscreen-tmi-font-size": readNumber("fullscreen-tmi-font-size", 100),
    "fullscreen-tmi-outline-width": readValue("fullscreen-tmi-outline-width", "0"),
    "fullscreen-tmi-outline-color": readValue("fullscreen-tmi-outline-color", "#000000"),
    // TV Mode settings
    "fullscreen-tv-mode": readFlag("fullscreen-tv-mode", false),
    "fullscreen-tv-album-size": readNumber("fullscreen-tv-album-size", 140),
    "fullscreen-tv-show-album-name": readFlag("fullscreen-tv-show-album-name", true),
    "fullscreen-tv-show-controls": readFlag("fullscreen-tv-show-controls", false),
    "fullscreen-tv-show-progress": readFlag("fullscreen-tv-show-progress", false),
    // Normal mode album name display
    "fullscreen-show-album-name": readFlag("fullscreen-show-album-name", false),
    // Title trim setting
    "fullscreen-trim-title": readFlag("fullscreen-trim-title", false),
    // Context image setting
    "fullscreen-show-context-image": readFlag("fullscreen-show-context-image", true),
    // Info gap setting
    "fullscreen-info-gap": readNumber("fullscreen-info-gap", 24),
    // Queue panel setting
    "fullscreen-show-queue": readFlag("fullscreen-show-queue", true),

    delay: 0,
  };

  return {
    visual,
    get modes() {
      const i18n = readI18n();
      return i18n
        ? [i18n.t("modes.karaoke"), i18n.t("modes.synced"), i18n.t("modes.unsynced")]
        : ["Karaoke", "Synced", "Unsynced"];
    },
  };
}

export function createDefaultVisualSettings() {
  return createAppConfig({
    storage: {
      get: (_key, fallback = true) => fallback,
      getItem: () => null,
      getPersisted: () => null,
      setItem() {},
    },
  }).visual;
}
