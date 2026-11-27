import { GOOGLE_FONTS, lyricsFontStylesheet } from "../core/lyricsFontCatalog.mjs";
import { getLyricsLineMotionCurve } from "./lyricsLineMotion.mjs";
import { PANEL_LYRICS_PAGE_CLASS } from "./panelRouteObserver.mjs";
import { createOutsideTextOutlineShadow } from "./lyricsTextOutline.mjs";

const PANEL_VISUAL_PREFIX = "ivLyrics:visual:";
const PANEL_STYLE_ID = "ivlyrics-panel-lyrics-styles";
const DEFAULT_FONT_FAMILY = "Pretendard Variable";
export const DEFAULT_PANEL_ORIGINAL_SIZE = 26;

export function readPanelOriginalFontSize(readSetting) {
    return readSetting(PANEL_VISUAL_PREFIX + "panel-lyrics-original-size", DEFAULT_PANEL_ORIGINAL_SIZE);
}

export function getPanelLineSlotHeight(originalSize, fontScale) {
    const size = Number(originalSize) || DEFAULT_PANEL_ORIGINAL_SIZE;
    const scale = Number(fontScale) > 0 ? Number(fontScale) / 100 : 1;
    return Math.round(Math.max(52, Math.min(72, size * scale * 2.9)));
}

function readTypography(readSetting) {
    const get = (name, fallback) => readSetting(PANEL_VISUAL_PREFIX + "panel-lyrics-" + name, fallback);
    return {
        fontFamily: get("font-family", DEFAULT_FONT_FAMILY) || DEFAULT_FONT_FAMILY,
        originalFont: get("original-font", "") || "",
        phoneticFont: get("phonetic-font", "") || "",
        translationFont: get("translation-font", "") || "",
        panelWidth: get("width", 280),
        originalSize: readPanelOriginalFontSize(readSetting),
        phoneticSize: get("phonetic-size", 13),
        translationSize: get("translation-size", 13),
        originalOutlineWidth: get("original-outline-width", 0),
        originalOutlineColor: get("original-outline-color", "#000000") || "#000000",
        phoneticOutlineWidth: get("phonetic-outline-width", 0),
        phoneticOutlineColor: get("phonetic-outline-color", "#000000") || "#000000",
        translationOutlineWidth: get("translation-outline-width", 0),
        translationOutlineColor: get("translation-outline-color", "#000000") || "#000000",
    };
}

function getPanelTypographyVariables(typography) {
    const {
        fontFamily, originalFont, phoneticFont, translationFont, panelWidth, originalSize, phoneticSize, translationSize,
        originalOutlineWidth, originalOutlineColor, phoneticOutlineWidth, phoneticOutlineColor,
        translationOutlineWidth, translationOutlineColor,
    } = typography;
    const base = `'${fontFamily}', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
    const withDefault = (font) => font ? `${font}, ${base}` : base;
    return {
        "--ivlyrics-panel-width": `${panelWidth}px`,
        "--ivlyrics-panel-font-family": base,
        "--ivlyrics-panel-original-font": withDefault(originalFont),
        "--ivlyrics-panel-phonetic-font": withDefault(phoneticFont),
        "--ivlyrics-panel-translation-font": withDefault(translationFont),
        "--ivlyrics-panel-original-size": `${originalSize}px`,
        "--ivlyrics-panel-phonetic-size": `${phoneticSize}px`,
        "--ivlyrics-panel-translation-size": `${translationSize}px`,
        "--ivlyrics-panel-original-outline-shadow": createOutsideTextOutlineShadow(originalOutlineWidth, originalOutlineColor),
        "--ivlyrics-panel-phonetic-outline-shadow": createOutsideTextOutlineShadow(phoneticOutlineWidth, phoneticOutlineColor),
        "--ivlyrics-panel-translation-outline-shadow": createOutsideTextOutlineShadow(translationOutlineWidth, translationOutlineColor),
    };
}

function renderPanelLyricsStyles(typography, { activeBodyClass, transitionDurationMs, transitionEasing }) {
    const values = getPanelTypographyVariables(typography);
    return `
/* Pretendard 폰트 import */
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css');

/* NowPlaying 패널 가사 CSS 변수 */
:root {
  --ivlyrics-panel-width: ${values["--ivlyrics-panel-width"]};
  --ivlyrics-panel-font-family: ${values["--ivlyrics-panel-font-family"]};
  --ivlyrics-panel-original-font: ${values["--ivlyrics-panel-original-font"]};
  --ivlyrics-panel-phonetic-font: ${values["--ivlyrics-panel-phonetic-font"]};
  --ivlyrics-panel-translation-font: ${values["--ivlyrics-panel-translation-font"]};
  --ivlyrics-panel-original-size: ${values["--ivlyrics-panel-original-size"]};
  --ivlyrics-panel-phonetic-size: ${values["--ivlyrics-panel-phonetic-size"]};
  --ivlyrics-panel-translation-size: ${values["--ivlyrics-panel-translation-size"]};
  --ivlyrics-panel-original-outline-shadow: ${values["--ivlyrics-panel-original-outline-shadow"]};
  --ivlyrics-panel-phonetic-outline-shadow: ${values["--ivlyrics-panel-phonetic-outline-shadow"]};
  --ivlyrics-panel-translation-outline-shadow: ${values["--ivlyrics-panel-translation-outline-shadow"]};
  --ivlyrics-panel-line-transition-duration: ${transitionDurationMs}ms;
  --ivlyrics-panel-line-transition-easing: ${transitionEasing};
}

/* ivLyrics 페이지에서는 패널 가사 숨기기 (중복 방지) */
/* JavaScript에서 body에 클래스를 추가하는 방식으로 동작 */
body:is(.ivlyrics-page-active, .${PANEL_LYRICS_PAGE_CLASS}) .ivlyrics-panel-lyrics-container,
body:is(.ivlyrics-page-active, .${PANEL_LYRICS_PAGE_CLASS}) .ivlyrics-panel-lyrics-section {
  display: none !important;
}

/* Now Playing Panel 가사가 켜져 있으면 Spotify 기본 미리보기 가사 숨기기 */
body.${activeBodyClass} [data-testid="lyrics-npv-section"] {
  display: none !important;
}


/* Now Playing Panel Lyrics - 카드 스타일 */
.ivlyrics-panel-lyrics-container {
  width: 100% !important;
  font-family: var(--ivlyrics-panel-font-family) !important;
  order: 2 !important; /* 곡 정보 다음, 크레딧 전에 고정 위치 */
  --ivlyrics-font-scale: 1; /* 기본 스케일 (CSS 변수로 동적 조절) */
  cursor: pointer !important;
}

.ivlyrics-panel-lyrics-container:empty,
.ivlyrics-nowplaying-bar-lyrics:empty {
  display: none !important;
}

/* 카드 박스 - 앨범 색상 배경 (CSS 변수로 동적 색상 적용) */
.ivlyrics-panel-lyrics-section {
  position: relative !important;
  overflow: hidden !important;
  isolation: isolate !important;
  box-sizing: border-box !important;
  aspect-ratio: 1 / 1 !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 14px 16px 18px !important;
  border-radius: 12px !important;
  background: var(--ivlyrics-panel-bg, rgba(80, 80, 80, 0.6)) !important;
  border: var(--ivlyrics-panel-border, none) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
}

.ivlyrics-panel-lyrics-section::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  z-index: 1 !important;
  pointer-events: none !important;
  background: rgba(0, 0, 0, 0.38) !important;
}

.ivlyrics-panel-lyrics-section.transparent-bg {
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.ivlyrics-panel-lyrics-section.transparent-bg::before {
  background: transparent !important;
}

.ivlyrics-panel-bg-gradient {
  display: none;
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background-color: rgba(var(--ivlyrics-panel-c1, 30, 30, 40), var(--ivlyrics-panel-gradient-opacity, 0.78));
  filter: brightness(0.92) saturate(2.35);
  transition: background-color 1.5s ease, opacity 0.35s ease, filter 0.5s ease;
  contain: paint;
}

.ivlyrics-panel-lyrics-section.blur-gradient-bg .ivlyrics-panel-bg-gradient {
  display: block;
}

.ivlyrics-panel-bg-gradient::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.46)),
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.18), transparent 42%);
  z-index: 2;
}

/* The blobs move with transform only: animating top/left re-ran layout for
   the panel on every frame, wherever the Now Playing view was open. Each blob
   starts at the container origin and its size is a fixed fraction of the
   container, so translate = the former top/left / size. The blur sits on an
   unanimated ::before, which is rasterized once with the blob's layer instead
   of being re-blurred on the compositor every frame. Same pixels and path. */
.ivlyrics-panel-bg-blob {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 50%;
  opacity: 0.82;
  mix-blend-mode: screen;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  will-change: transform;
}

.ivlyrics-panel-bg-blob::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--ivlyrics-panel-blob-fill);
  filter: blur(var(--ivlyrics-panel-blob-blur, 34px));
}

.ivlyrics-panel-bg-blob.blob-1 { width: 92%; height: 92%; --ivlyrics-panel-blob-fill: rgba(var(--ivlyrics-panel-c2, 60, 40, 70), 1); animation: ivlyrics-panel-blob-1 18s ease-in-out infinite; }
.ivlyrics-panel-bg-blob.blob-2 { width: 82%; height: 82%; --ivlyrics-panel-blob-fill: rgba(var(--ivlyrics-panel-c3, 20, 50, 60), 0.95); animation: ivlyrics-panel-blob-2 22s ease-in-out infinite; }
.ivlyrics-panel-bg-blob.blob-3 { width: 62%; height: 62%; --ivlyrics-panel-blob-fill: rgba(var(--ivlyrics-panel-c2, 60, 40, 70), 0.82); --ivlyrics-panel-blob-blur: 28px; animation: ivlyrics-panel-blob-3 15s ease-in-out infinite; }
.ivlyrics-panel-bg-blob.blob-4 { width: 84%; height: 84%; --ivlyrics-panel-blob-fill: rgba(var(--ivlyrics-panel-c3, 20, 50, 60), 0.72); --ivlyrics-panel-blob-blur: 30px; animation: ivlyrics-panel-blob-4 25s ease-in-out infinite; }
.ivlyrics-panel-bg-blob.blob-5 { width: 58%; height: 58%; --ivlyrics-panel-blob-fill: rgba(var(--ivlyrics-panel-c2, 60, 40, 70), 0.68); --ivlyrics-panel-blob-blur: 26px; animation: ivlyrics-panel-blob-5 16s ease-in-out infinite; }
.ivlyrics-panel-bg-blob.blob-6 { width: 100%; height: 100%; --ivlyrics-panel-blob-fill: rgba(var(--ivlyrics-panel-c3, 20, 50, 60), 0.52); --ivlyrics-panel-blob-blur: 38px; animation: ivlyrics-panel-blob-6 20s ease-in-out infinite; }

@keyframes ivlyrics-panel-blob-1 {
  0%, 100% { transform: translate(-30.4348%, -30.4348%) scale(1); }
  20% { transform: translate(50%, 4.3478%) scale(1.12); }
  40% { transform: translate(26.087%, 47.8261%) scale(0.9); }
  60% { transform: translate(-10.8696%, 21.7391%) scale(1.14); }
  80% { transform: translate(19.5652%, -13.0435%) scale(0.96); }
}

@keyframes ivlyrics-panel-blob-2 {
  0%, 100% { transform: translate(68.2927%, 56.0976%) scale(1); }
  25% { transform: translate(-21.9512%, 19.5122%) scale(1.2); }
  50% { transform: translate(43.9024%, -21.9512%) scale(0.86); }
  75% { transform: translate(82.9268%, 48.7805%) scale(1.1); }
}

@keyframes ivlyrics-panel-blob-3 {
  0%, 100% { transform: translate(-19.3548%, 93.5484%) scale(1); }
  33% { transform: translate(93.5484%, -38.7097%) scale(1.28); }
  66% { transform: translate(61.2903%, 58.0645%) scale(0.82); }
}

@keyframes ivlyrics-panel-blob-4 {
  0%, 100% { transform: translate(78.5714%, -40.4762%) scale(1); }
  20% { transform: translate(57.1429%, 69.0476%) scale(0.9); }
  40% { transform: translate(-26.1905%, 42.8571%) scale(1.18); }
  60% { transform: translate(33.3333%, -14.2857%) scale(1.05); }
  80% { transform: translate(92.8571%, 21.4286%) scale(0.86); }
}

@keyframes ivlyrics-panel-blob-5 {
  0%, 100% { transform: translate(82.7586%, 117.2414%) scale(1); }
  25% { transform: translate(134.4828%, 48.2759%) scale(1.24); }
  50% { transform: translate(31.0345%, -20.6897%) scale(0.9); }
  75% { transform: translate(-27.5862%, 82.7586%) scale(1.1); }
}

@keyframes ivlyrics-panel-blob-6 {
  0%, 100% { transform: translate(24%, 24%) scale(1); }
  33% { transform: translate(-22%, -24%) scale(1.15); }
  66% { transform: translate(58%, 58%) scale(0.92); }
}

.ivlyrics-panel-header,
.ivlyrics-panel-lyrics-wrapper,
.ivlyrics-panel-empty {
  position: relative !important;
  z-index: 2 !important;
}

/* Lyrics 라벨 */
.ivlyrics-panel-header {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  position: absolute !important;
  top: 14px !important;
  left: 16px !important;
  right: 16px !important;
  margin-bottom: 0 !important;
  padding: 0 !important;
  pointer-events: none !important;
}

.ivlyrics-panel-header h2 {
  font-size: 11px !important;
  font-weight: 700 !important;
  color: rgba(255, 255, 255, 0.85) !important;
  margin: 0 !important;
  letter-spacing: 0.02em !important;
  font-family: var(--ivlyrics-panel-font-family) !important;
}

/*
 * Keep the Now Playing renderer self-contained: Pages.js is a route subfile,
 * while this module is loaded as a global extension. The layout below mirrors
 * the main synced-lyrics flow with one persistent line stack and one centering
 * transform. Lines never swap between clamped and expanded display modes.
 */
.ivlyrics-panel-lyrics-wrapper {
  display: block !important;
  flex: 1 1 auto !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  position: relative !important;
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.45) 6%,
    #000 14%,
    #000 86%,
    rgba(0, 0, 0, 0.45) 94%,
    transparent 100%
  ) !important;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.45) 6%,
    #000 14%,
    #000 86%,
    rgba(0, 0, 0, 0.45) 94%,
    transparent 100%
  ) !important;
}

.ivlyrics-panel-lines-stack {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: var(--ivlyrics-panel-line-stack-gap, 10px) !important;
  transform: translateY(var(--ivlyrics-panel-stack-y, 0px)) !important;
  transition:
    transform var(--ivlyrics-panel-line-transition-duration, 280ms)
      var(--ivlyrics-panel-line-transition-easing, cubic-bezier(0.20, 0.70, 0.42, 0.96)) !important;
  will-change: transform !important;
}

.ivlyrics-panel-line-cell {
  flex: 0 0 auto !important;
  width: 100% !important;
  min-height: 0 !important;
  overflow: visible !important;
}

.ivlyrics-panel-line-cell.layout-hidden {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.ivlyrics-panel-lyrics-section.motion-reduced .ivlyrics-panel-lines-stack {
  transition-duration: 1ms !important;
}

@media (prefers-reduced-motion: reduce) {
  .ivlyrics-panel-lines-stack {
    transition-duration: 1ms !important;
  }
}

.ivlyrics-panel-line-cell .ivlyrics-panel-line {
  flex: 0 0 auto !important;
  width: 100% !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: visible !important;
  animation: none !important;
}

.ivlyrics-panel-line-cell .ivlyrics-panel-line-text,
.ivlyrics-panel-line-cell .ivlyrics-panel-line-phonetic,
.ivlyrics-panel-line-cell .ivlyrics-panel-line-translation {
  display: block !important;
  -webkit-line-clamp: unset !important;
  -webkit-box-orient: initial !important;
  overflow: visible !important;
}

.ivlyrics-panel-line-cell .ivlyrics-panel-line-karaoke,
.ivlyrics-panel-line-cell .ivlyrics-panel-line-karaoke-stack,
.ivlyrics-panel-line-cell .ivlyrics-panel-line-karaoke-row,
.ivlyrics-panel-line-cell .ivlyrics-panel-line-karaoke-part {
  max-height: none !important;
  overflow: visible !important;
}

.ivlyrics-panel-line-cell .ivlyrics-panel-line.effect,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.adlib,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.pulse,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.wave,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.sparkle,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.echo,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.whisper,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.bounce,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.sway,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.glow,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.glitch,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.flicker,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.float,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.blur,
.ivlyrics-panel-line-cell .ivlyrics-panel-line.pop {
  margin-block: 0 !important;
}

.ivlyrics-panel-line-cell .ivlyrics-panel-line.vocal-stack {
  flex-basis: auto !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: visible !important;
}

.ivlyrics-panel-context-lines {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

.ivlyrics-panel-context-lines.before {
  justify-content: flex-end !important;
  padding-top: 20px !important;
  box-sizing: border-box !important;
}

.ivlyrics-panel-context-lines.after {
  justify-content: flex-start !important;
}

.ivlyrics-panel-current-line {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  min-height: 0 !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 3 !important;
}

/* 슬라이드 업 애니메이션 */
@keyframes ivlyrics-slide-up {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes ivlyrics-fade-out {
  from {
    opacity: 0.5;
  }
  to {
    opacity: 0.3;
  }
}

/* 노래방 글자 바운스 애니메이션 - 자연스럽고 미세한 효과 */
@keyframes ivlyrics-bounce {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

/* 가사 라인 */
@keyframes lyricsBreakBarPulse { 0%, 100% { transform: scaleY(0.32); opacity: 0.42; } 50% { transform: scaleY(1); opacity: 1; } }
@keyframes lyricsBreakDotWave { 0%, 100% { transform: translateY(0.15em) scale(0.7); opacity: 0.38; } 50% { transform: translateY(-0.15em) scale(1); opacity: 1; } }
@keyframes lyricsBreakRingBreathe { 0% { transform: scale(0.35); opacity: 0; } 45% { opacity: 0.9; } 100% { transform: scale(1.3); opacity: 0; } }
@keyframes lyricsBreakOrbitOne { from { transform: rotate(0deg) translateX(0.42em); } to { transform: rotate(360deg) translateX(0.42em); } }
@keyframes lyricsBreakOrbitTwo { from { transform: rotate(120deg) translateX(0.42em); } to { transform: rotate(480deg) translateX(0.42em); } }
@keyframes lyricsBreakOrbitThree { from { transform: rotate(240deg) translateX(0.42em); } to { transform: rotate(600deg) translateX(0.42em); } }
@keyframes lyricsBreakDiamondStep { 0%, 100% { opacity: 0.35; transform: rotate(45deg) scale(0.72); } 50% { opacity: 1; transform: rotate(45deg) scale(1.05); } }
@keyframes lyricsBreakScanMove { from { transform: translateX(0); } to { transform: translateX(2em); } }
@keyframes lyricsBreakArcSpin { to { transform: rotate(360deg); } }
@keyframes lyricsBreakSignalFlow { 0% { opacity: 0.48; stroke-dashoffset: 0; } 45% { opacity: 1; } 100% { opacity: 0.48; stroke-dashoffset: -48; } }
@keyframes lyricsBreakDotPulse { 0% { transform: scale(0.25); opacity: 0.8; } 100% { transform: scale(1.75); opacity: 0; } }
@keyframes lyricsBreakStackShift { 0%, 100% { opacity: 0.38; transform: scaleX(0.6); } 50% { opacity: 1; transform: scaleX(1); } }
@keyframes lyricsBreakSparkRotate { to { transform: rotate(360deg); } }
@keyframes lyricsBreakSplitBar { 0%, 100% { transform: scaleY(0.24); opacity: 0.36; } 50% { transform: scaleY(1); opacity: 1; } }
@keyframes lyricsBreakMetronome { from { transform: rotate(-24deg); } to { transform: rotate(24deg); } }
@keyframes lyricsBreakSpin { to { transform: rotate(360deg); } }
@keyframes lyricsBreakBeatHit { 0% { transform: scale(0.5); opacity: 0.5; } 9% { transform: scale(1.28); opacity: 1; } 45% { transform: scale(0.82); opacity: 0.7; } 100% { transform: scale(0.5); opacity: 0.5; } }
@keyframes lyricsBreakTrianglePulse { 0%, 100% { transform: scale(0.7); opacity: 0.45; } 50% { transform: scale(1.1); opacity: 1; } }
@keyframes lyricsBreakMorphShape { 0%, 100% { border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; transform: rotate(0deg); } 25% { border-radius: 70% 30% 50% 50% / 30% 70% 30% 70%; transform: rotate(90deg); } 50% { border-radius: 50% 50% 30% 70% / 70% 30% 70% 30%; transform: rotate(180deg); } 75% { border-radius: 30% 70% 70% 30% / 50% 50% 50% 50%; transform: rotate(270deg); } }
@keyframes lyricsBreakStringPluck { 0% { transform: translateY(0); opacity: 0.4; } 4% { transform: translateY(-0.08em); opacity: 1; } 9% { transform: translateY(0.06em); } 14% { transform: translateY(-0.04em); } 19% { transform: translateY(0.03em); opacity: 0.75; } 28%, 100% { transform: translateY(0); opacity: 0.4; } }
@keyframes lyricsBreakKeyPress { 0%, 35%, 100% { transform: translateY(0); opacity: 0.55; } 5% { transform: translateY(0.12em); opacity: 1; } 20% { transform: translateY(0); opacity: 0.85; } }
@keyframes lyricsBreakBloomPulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@keyframes lyricsBreakSpeakerRing { 0%, 100% { transform: scale(0.9); opacity: 0.4; } 18% { transform: scale(1.05); opacity: 1; } }
@keyframes lyricsBreakSpeakerCenter { 0%, 100% { transform: scale(0.68); } 18% { transform: scale(1.2); } }
@keyframes lyricsBreakCrossfadeBreathe { 0%, 100% { transform: scale(0.55); } 50% { transform: scale(1); } }

.ivlyrics-panel-line {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  gap: 2px !important;
  flex: 0 0 var(--ivlyrics-panel-line-slot-height, 68px) !important;
  min-height: var(--ivlyrics-panel-line-slot-height, 68px) !important;
  height: var(--ivlyrics-panel-line-slot-height, 68px) !important;
  padding: 3px 0 !important;
  border-radius: 0 !important;
  transition:
    color 0.3s var(--iv-motion-ease-standard, ease),
    opacity 0.4s var(--iv-motion-ease-standard, ease) !important;
  background: transparent !important;
  text-align: left !important;
  font-family: var(--ivlyrics-panel-font-family) !important;
  overflow: hidden !important;
  animation: none !important;
}

.ivlyrics-panel-line.effect:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.adlib:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.pulse:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.wave:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.sparkle:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.echo:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.whisper:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.bounce:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.sway:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.glow:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.glitch:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.flicker:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.float:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.blur:not(.active):not(.vocal-stack),
.ivlyrics-panel-line.pop:not(.active):not(.vocal-stack) {
  margin-block: -2px !important;
}

.ivlyrics-panel-context-lines .ivlyrics-panel-line {
  flex: 0 0 auto !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: visible !important;
  animation: none !important;
}

.ivlyrics-panel-context-lines .ivlyrics-panel-line-text,
.ivlyrics-panel-context-lines .ivlyrics-panel-line-phonetic,
.ivlyrics-panel-context-lines .ivlyrics-panel-line-translation {
  min-height: 0 !important;
}

.ivlyrics-panel-context-lines .ivlyrics-panel-line-karaoke,
.ivlyrics-panel-context-lines .ivlyrics-panel-line-karaoke-stack,
.ivlyrics-panel-context-lines .ivlyrics-panel-line-karaoke-row,
.ivlyrics-panel-context-lines .ivlyrics-panel-line-karaoke-part {
  max-height: none !important;
  overflow: visible !important;
}

.ivlyrics-panel-current-line .ivlyrics-panel-line {
  flex: 0 0 auto !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: visible !important;
  animation: none !important;
}

.ivlyrics-panel-line.vocal-stack {
  flex-basis: var(--ivlyrics-panel-vocal-stack-line-height, 168px) !important;
  min-height: var(--ivlyrics-panel-vocal-stack-line-height, 168px) !important;
  height: var(--ivlyrics-panel-vocal-stack-line-height, 168px) !important;
  overflow: visible !important;
  z-index: 2 !important;
}

.ivlyrics-panel-line.vocal-stack.active {
  z-index: 3 !important;
}

.ivlyrics-panel-current-line .ivlyrics-panel-line.vocal-stack {
  flex-basis: auto !important;
  min-height: 0 !important;
  height: auto !important;
}

/* 활성 라인 */
.ivlyrics-panel-line.active {
  background: transparent !important;
  opacity: 1 !important;
  overflow: visible !important;
}

/* 지나간 라인 */
.ivlyrics-panel-line.past {
  opacity: 0.4 !important;
}

/* 다음 라인 */
.ivlyrics-panel-line.future {
  opacity: 0.6 !important;
}

/* 1. 발음 (Phonetic) - 아래에 작게 */
.ivlyrics-panel-line-interlude {
  display: inline-flex !important;
  align-items: center !important;
  max-width: 100% !important;
  color: rgba(255, 255, 255, 0.7) !important;
  font-family: var(--ivlyrics-panel-original-font) !important;
  line-height: 1.35 !important;
  white-space: nowrap !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-interlude {
  color: #ffffff !important;
}

.lyrics-break-indicator { display: inline-flex; align-items: center; gap: 0.3em; max-width: 100%; color: currentColor; vertical-align: middle; white-space: nowrap; }
.lyrics-break-icon { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 1.16em; height: 1.16em; min-width: 18px; min-height: 18px; flex: 0 0 auto; overflow: visible; color: currentColor; }
.lyrics-break-icon span, .lyrics-break-icon svg { flex: 0 0 auto; }
.lyrics-break-label { font-family: var(--break-label-font-family, var(--ivlyrics-panel-original-font, inherit)); font-size: var(--break-label-font-size, 12px); font-weight: var(--break-label-font-weight, 200); line-height: 1; letter-spacing: 0; opacity: var(--break-label-opacity, 0.65); text-shadow: var(--break-label-outline-shadow, 0 0 0 transparent); }
.lyrics-break-icon-equalizer, .lyrics-break-icon-dotWave, .lyrics-break-icon-diamonds, .lyrics-break-icon-splitBars, .lyrics-break-icon-reels, .lyrics-break-icon-piano { display: inline-flex; }
.lyrics-break-icon-equalizer, .lyrics-break-icon-splitBars { align-items: center; gap: 0.09em; }
.lyrics-break-icon-equalizer span, .lyrics-break-icon-splitBars span { display: block; width: 0.11em; min-width: 2px; height: 0.76em; border-radius: 999px; background: currentColor; transform: scaleY(0.4); transform-origin: center; }
.lyrics-break-icon-equalizer span { animation: lyricsBreakBarPulse var(--break-duration, 1100ms) ease-in-out infinite; }
.lyrics-break-icon-equalizer span:nth-child(2) { animation-delay: calc(var(--break-duration, 1100ms) * -0.18); }
.lyrics-break-icon-equalizer span:nth-child(3) { animation-delay: calc(var(--break-duration, 1100ms) * -0.36); }
.lyrics-break-icon-equalizer span:nth-child(4) { animation-delay: calc(var(--break-duration, 1100ms) * -0.54); }
.lyrics-break-icon-dotWave { align-items: center; gap: 0.1em; }
.lyrics-break-icon-dotWave span { width: 0.14em; height: 0.14em; border-radius: 50%; background: currentColor; animation: lyricsBreakDotWave var(--break-duration-fast, 790ms) ease-in-out infinite; }
.lyrics-break-icon-dotWave span:nth-child(2) { animation-delay: calc(var(--break-duration-fast, 790ms) * 0.1); }
.lyrics-break-icon-dotWave span:nth-child(3) { animation-delay: calc(var(--break-duration-fast, 790ms) * 0.2); }
.lyrics-break-icon-dotWave span:nth-child(4) { animation-delay: calc(var(--break-duration-fast, 790ms) * 0.3); }
.lyrics-break-icon-dotWave span:nth-child(5) { animation-delay: calc(var(--break-duration-fast, 790ms) * 0.4); }
.lyrics-break-icon-ripples::before, .lyrics-break-icon-ripples::after, .lyrics-break-icon-ripples span { content: ""; position: absolute; inset: 0.28em; border: 0.055em solid currentColor; border-radius: 50%; animation: lyricsBreakRingBreathe var(--break-duration-slow, 1815ms) ease-in-out infinite; }
.lyrics-break-icon-ripples::after { animation-delay: calc(var(--break-duration-slow, 1815ms) * -0.33); }
.lyrics-break-icon-ripples span { animation-delay: calc(var(--break-duration-slow, 1815ms) * -0.66); }
.lyrics-break-icon-orbit::before, .lyrics-break-icon-orbit::after, .lyrics-break-icon-orbit span { content: ""; position: absolute; top: 50%; left: 50%; width: 0.14em; height: 0.14em; margin: -0.07em; border-radius: 50%; background: currentColor; transform-origin: center; }
.lyrics-break-icon-orbit::before { animation: lyricsBreakOrbitOne var(--break-duration-slow, 1815ms) linear infinite; }
.lyrics-break-icon-orbit::after { animation: lyricsBreakOrbitTwo var(--break-duration-slow, 1815ms) linear infinite; }
.lyrics-break-icon-orbit span { animation: lyricsBreakOrbitThree var(--break-duration-slow, 1815ms) linear infinite; }
.lyrics-break-icon-diamonds { align-items: center; gap: 0.17em; }
.lyrics-break-icon-diamonds span { width: 0.2em; height: 0.2em; background: currentColor; transform: rotate(45deg) scale(0.72); animation: lyricsBreakDiamondStep var(--break-duration, 1100ms) ease-in-out infinite; }
.lyrics-break-icon-diamonds span:nth-child(2) { animation-delay: calc(var(--break-duration, 1100ms) * 0.13); }
.lyrics-break-icon-diamonds span:nth-child(3) { animation-delay: calc(var(--break-duration, 1100ms) * 0.25); }
.lyrics-break-icon-scan { width: 1.22em; height: 0.5em; border-left: 0.06em solid currentColor; border-right: 0.06em solid currentColor; overflow: hidden; }
.lyrics-break-icon-scan::before { content: ""; position: absolute; top: calc(50% - 0.05em); left: -0.76em; width: 0.72em; height: 0.1em; border-radius: 999px; background: currentColor; box-shadow: 0.32em 0 0 currentColor, 0.64em 0 0 currentColor; animation: lyricsBreakScanMove var(--break-duration, 1100ms) ease-in-out infinite; }
.lyrics-break-icon-arcs::before, .lyrics-break-icon-arcs::after { content: ""; position: absolute; inset: 0.16em; border: 0.07em solid transparent; border-top-color: currentColor; border-right-color: currentColor; border-radius: 50%; animation: lyricsBreakArcSpin var(--break-duration-slow, 1815ms) linear infinite; }
.lyrics-break-icon-arcs::after { inset: 0.34em; border-width: 0.055em; border-top-color: transparent; border-right-color: currentColor; border-bottom-color: currentColor; animation-direction: reverse; animation-duration: var(--break-duration, 1100ms); }
.lyrics-break-icon-signal { width: 1.32em; height: 0.52em; overflow: visible; }
.lyrics-break-icon-signal svg { display: block; width: 1.32em; height: 0.52em; fill: none; stroke: currentColor; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
.lyrics-break-icon-signal path { stroke-dasharray: 18 14; animation: lyricsBreakSignalFlow var(--break-duration-slow, 1815ms) linear infinite; }
.lyrics-break-icon-pulseDot::before, .lyrics-break-icon-pulseDot::after { content: ""; position: absolute; inset: 0.4em; border-radius: 50%; background: currentColor; }
.lyrics-break-icon-pulseDot::after { inset: 0.26em; background: transparent; border: 0.04em solid currentColor; animation: lyricsBreakDotPulse var(--break-duration, 1100ms) ease-out infinite; }
.lyrics-break-icon-stack { display: grid; place-items: center; gap: 0.08em; }
.lyrics-break-icon-stack span { display: block; width: 0.78em; height: 0.09em; border-radius: 999px; background: currentColor; animation: lyricsBreakStackShift var(--break-duration, 1100ms) ease-in-out infinite; }
.lyrics-break-icon-stack span:nth-child(2) { width: 0.52em; animation-delay: calc(var(--break-duration, 1100ms) * -0.17); }
.lyrics-break-icon-stack span:nth-child(3) { width: 0.92em; animation-delay: calc(var(--break-duration, 1100ms) * -0.34); }
.lyrics-break-icon-spark { animation: lyricsBreakSparkRotate var(--break-duration-xslow, 4180ms) linear infinite; }
.lyrics-break-icon-spark span { position: absolute; top: 50%; left: 50%; width: 0.1em; height: 0.1em; margin: -0.05em; border-radius: 50%; background: currentColor; transform: rotate(calc(var(--i) * 45deg)) translateX(0.42em) scale(calc(0.45 + var(--i) * 0.06)); opacity: calc(0.22 + var(--i) * 0.08); }
.lyrics-break-icon-splitBars span { animation: lyricsBreakSplitBar var(--break-duration, 1100ms) ease-in-out infinite; }
.lyrics-break-icon-splitBars span:nth-child(1), .lyrics-break-icon-splitBars span:nth-child(4) { animation-delay: calc(var(--break-duration, 1100ms) * -0.22); }
.lyrics-break-icon-splitBars span:nth-child(2), .lyrics-break-icon-splitBars span:nth-child(3) { animation-delay: calc(var(--break-duration, 1100ms) * -0.06); }
.lyrics-break-icon-metronome::before { content: ""; position: absolute; left: calc(50% - 0.05em); bottom: 0.2em; width: 0.1em; height: 0.76em; border-radius: 999px; background: currentColor; transform-origin: bottom center; animation: lyricsBreakMetronome var(--break-duration-fast, 790ms) ease-in-out infinite alternate; }
.lyrics-break-icon-metronome::after { content: ""; position: absolute; left: calc(50% - 0.25em); bottom: 0.14em; width: 0.5em; height: 0.07em; border-radius: 999px; background: currentColor; opacity: 0.55; }
.lyrics-break-icon-vinyl { border: 0.04em solid currentColor; border-radius: 50%; animation: lyricsBreakSpin var(--break-duration-xslow, 4180ms) linear infinite; }
.lyrics-break-icon-vinyl::before { content: ""; position: absolute; inset: 0.22em; border: 0.025em solid currentColor; border-radius: 50%; opacity: 0.45; }
.lyrics-break-icon-vinyl::after { content: ""; position: absolute; inset: 0.47em; border-radius: 50%; background: currentColor; }
.lyrics-break-icon-vinyl > span { position: absolute; top: 0.08em; left: 50%; width: 0.08em; height: 0.08em; margin-left: -0.04em; border-radius: 50%; background: currentColor; }
.lyrics-break-icon-beat { width: 0.68em; height: 0.68em; border-radius: 50%; background: currentColor; animation: lyricsBreakBeatHit var(--break-duration-fast, 790ms) cubic-bezier(0.18, 0.9, 0.36, 1) infinite; }
.lyrics-break-icon-reels { align-items: center; gap: 0.2em; }
.lyrics-break-icon-reels span { position: relative; width: 0.42em; height: 0.42em; border: 0.04em solid currentColor; border-radius: 50%; animation: lyricsBreakSpin var(--break-duration-slow, 1815ms) linear infinite; }
.lyrics-break-icon-reels span:nth-child(2) { animation-direction: reverse; }
.lyrics-break-icon-reels span::before, .lyrics-break-icon-reels span::after { content: ""; position: absolute; top: 50%; left: 50%; background: currentColor; }
.lyrics-break-icon-reels span::before { width: 0.3em; height: 0.035em; margin: -0.0175em 0 0 -0.15em; }
.lyrics-break-icon-reels span::after { width: 0.035em; height: 0.3em; margin: -0.15em 0 0 -0.0175em; }
.lyrics-break-icon-triangle::before { content: ""; width: 0; height: 0; border-left: 0.56em solid currentColor; border-top: 0.34em solid transparent; border-bottom: 0.34em solid transparent; animation: lyricsBreakTrianglePulse var(--break-duration, 1100ms) ease-in-out infinite; }
.lyrics-break-icon-morph { width: 0.88em; height: 0.88em; background: currentColor; border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; animation: lyricsBreakMorphShape var(--break-duration-xslow, 4180ms) ease-in-out infinite; }
.lyrics-break-icon-strings { display: flex; flex-direction: column; gap: 0.13em; }
.lyrics-break-icon-strings span { display: block; width: 1em; height: 0.035em; border-radius: 999px; background: currentColor; animation: lyricsBreakStringPluck var(--break-duration-slow, 1815ms) ease-out infinite; }
.lyrics-break-icon-strings span:nth-child(2) { animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.05); }
.lyrics-break-icon-strings span:nth-child(3) { animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.1); }
.lyrics-break-icon-strings span:nth-child(4) { animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.15); }
.lyrics-break-icon-piano { align-items: center; gap: 0.08em; }
.lyrics-break-icon-piano span { display: block; width: 0.12em; height: 0.76em; border-radius: 0 0 0.04em 0.04em; background: currentColor; animation: lyricsBreakKeyPress var(--break-duration-slow, 1815ms) ease-in-out infinite; }
.lyrics-break-icon-piano span:nth-child(2) { animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.45); }
.lyrics-break-icon-piano span:nth-child(3) { animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.14); }
.lyrics-break-icon-piano span:nth-child(4) { animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.68); }
.lyrics-break-icon-piano span:nth-child(5) { animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.28); }
.lyrics-break-icon-bloom span { position: absolute; top: 50%; left: 50%; width: 0.2em; height: 0.2em; margin: -0.1em; border-radius: 50%; background: currentColor; animation: lyricsBreakBloomPulse var(--break-duration-slow, 1815ms) ease-in-out infinite; }
.lyrics-break-icon-bloom span:nth-child(1) { transform: translateX(-0.32em); }
.lyrics-break-icon-bloom span:nth-child(2) { transform: translateX(0.32em); animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.25); }
.lyrics-break-icon-bloom span:nth-child(3) { transform: translateY(-0.32em); animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.13); }
.lyrics-break-icon-bloom span:nth-child(4) { transform: translateY(0.32em); animation-delay: calc(var(--break-duration-slow, 1815ms) * 0.38); }
.lyrics-break-icon-speaker { border: 0.04em solid currentColor; border-radius: 50%; }
.lyrics-break-icon-speaker::before { content: ""; position: absolute; inset: 0.22em; border: 0.04em solid currentColor; border-radius: 50%; animation: lyricsBreakSpeakerRing var(--break-duration-fast, 790ms) cubic-bezier(0.2, 0.85, 0.4, 1) infinite; }
.lyrics-break-icon-speaker::after { content: ""; position: absolute; inset: 0.44em; border-radius: 50%; background: currentColor; animation: lyricsBreakSpeakerCenter var(--break-duration-fast, 790ms) cubic-bezier(0.2, 0.85, 0.4, 1) infinite; }
.lyrics-break-icon-crossfade::before, .lyrics-break-icon-crossfade::after { content: ""; position: absolute; top: 50%; width: 0.5em; height: 0.5em; margin-top: -0.25em; border-radius: 50%; background: currentColor; opacity: 0.55; animation: lyricsBreakCrossfadeBreathe var(--break-duration-slow, 1815ms) ease-in-out infinite; }
.lyrics-break-icon-crossfade::before { left: 0.24em; }
.lyrics-break-icon-crossfade::after { right: 0.24em; animation-delay: calc(var(--break-duration-slow, 1815ms) * -0.5); }
.ivlyrics-panel-line:not(.active) .lyrics-break-icon, .ivlyrics-panel-line:not(.active) .lyrics-break-icon *, .ivlyrics-panel-line:not(.active) .lyrics-break-icon::before, .ivlyrics-panel-line:not(.active) .lyrics-break-icon::after, .ivlyrics-panel-line:not(.active) .lyrics-break-icon *::before, .ivlyrics-panel-line:not(.active) .lyrics-break-icon *::after { animation-play-state: paused !important; }
.ivlyrics-panel-lyrics-section.playback-paused .lyrics-break-icon, .ivlyrics-panel-lyrics-section.playback-paused .lyrics-break-icon *, .ivlyrics-panel-lyrics-section.playback-paused .lyrics-break-icon::before, .ivlyrics-panel-lyrics-section.playback-paused .lyrics-break-icon::after, .ivlyrics-panel-lyrics-section.playback-paused .lyrics-break-icon *::before, .ivlyrics-panel-lyrics-section.playback-paused .lyrics-break-icon *::after { animation-play-state: paused !important; }

.ivlyrics-panel-line-phonetic {
  display: -webkit-box !important;
  -webkit-line-clamp: 1 !important;
  -webkit-box-orient: vertical !important;
  font-size: calc(var(--ivlyrics-panel-phonetic-size, 13px) * var(--ivlyrics-font-scale, 1)) !important;
  font-weight: 400 !important;
  color: rgba(255, 255, 255, 0.55) !important;
  line-height: 1.35 !important;
  letter-spacing: 0.01em !important;
  overflow: hidden !important;
  font-family: var(--ivlyrics-panel-phonetic-font) !important;
  text-shadow: var(--ivlyrics-panel-phonetic-outline-shadow, 0 0 0 transparent) !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-phonetic {
  color: rgba(255, 255, 255, 0.75) !important;
}

/* 2. 원어 (Original Text) - 크고 볼드 */
.ivlyrics-panel-line-text {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  font-size: calc(var(--ivlyrics-panel-original-size, 26px) * var(--ivlyrics-font-scale, 1)) !important;
  font-weight: 700 !important;
  color: rgba(255, 255, 255, 0.7) !important;
  line-height: 1.4 !important;
  letter-spacing: -0.01em !important;
  word-break: keep-all !important;
  overflow-wrap: break-word !important;
  white-space: pre-line !important;
  overflow: hidden !important;
  font-family: var(--ivlyrics-panel-original-font) !important;
  text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent) !important;
}

p.ivlyrics-panel-line-text {
  margin: 0 !important;
  padding: 0 !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-text {
  color: #ffffff !important;
  font-weight: 700 !important;
}

.ivlyrics-panel-current-line .ivlyrics-panel-line-text,
.ivlyrics-panel-line.active .ivlyrics-panel-line-text,
.ivlyrics-panel-current-line .ivlyrics-panel-line-phonetic,
.ivlyrics-panel-line.active .ivlyrics-panel-line-phonetic,
.ivlyrics-panel-current-line .ivlyrics-panel-line-translation,
.ivlyrics-panel-line.active .ivlyrics-panel-line-translation {
  display: block !important;
  -webkit-line-clamp: unset !important;
  -webkit-box-orient: initial !important;
  overflow: visible !important;
}

/* 3. 번역 (Translation) - 아래에 작게 */
.ivlyrics-panel-line-translation {
  display: -webkit-box !important;
  -webkit-line-clamp: 1 !important;
  -webkit-box-orient: vertical !important;
  font-size: calc(var(--ivlyrics-panel-translation-size, 13px) * var(--ivlyrics-font-scale, 1)) !important;
  font-weight: 500 !important;
  color: rgba(255, 255, 255, 0.5) !important;
  line-height: 1.35 !important;
  margin-top: 1px !important;
  overflow: hidden !important;
  font-family: var(--ivlyrics-panel-translation-font) !important;
  text-shadow: var(--ivlyrics-panel-translation-outline-shadow, 0 0 0 transparent) !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-translation {
  color: rgba(255, 255, 255, 0.8) !important;
}

/* ========================================
   노래방 (Karaoke) 가사 스타일
   ======================================== */
.ivlyrics-panel-line-karaoke {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 0px !important;
  width: 100% !important;
  min-width: 0 !important;
  font-size: calc(var(--ivlyrics-panel-original-size, 26px) * var(--ivlyrics-font-scale, 1)) !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
  font-family: var(--ivlyrics-panel-original-font) !important;
  text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent) !important;
  max-height: calc(var(--ivlyrics-panel-original-size, 26px) * var(--ivlyrics-font-scale, 1) * 2.85) !important;
  overflow: hidden !important;
}

.ivlyrics-panel-line.vocal-stack .ivlyrics-panel-line-karaoke,
.ivlyrics-panel-line.vocal-stack .ivlyrics-panel-line-karaoke-stack,
.ivlyrics-panel-line.vocal-stack .ivlyrics-panel-line-karaoke-row,
.ivlyrics-panel-line.vocal-stack .ivlyrics-panel-line-karaoke-part {
  max-height: none !important;
  overflow: visible !important;
}

.ivlyrics-panel-current-line .ivlyrics-panel-line-karaoke,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke,
.ivlyrics-panel-current-line .ivlyrics-panel-line-karaoke-stack,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-stack,
.ivlyrics-panel-current-line .ivlyrics-panel-line-karaoke-row,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row,
.ivlyrics-panel-current-line .ivlyrics-panel-line-karaoke-part,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-part {
  max-height: none !important;
  overflow: visible !important;
}

.ivlyrics-panel-line-karaoke.is-text-run,
.ivlyrics-panel-line-karaoke-row.is-text-run {
  display: block !important;
  flex-wrap: nowrap !important;
  width: 100% !important;
  min-width: 0 !important;
  letter-spacing: 0 !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  unicode-bidi: plaintext !important;
}

.ivlyrics-panel-line-karaoke.has-word-wrap,
.ivlyrics-panel-line-karaoke-row.has-word-wrap {
  word-break: normal !important;
  overflow-wrap: normal !important;
}

.ivlyrics-panel-line-karaoke.is-text-run.is-rtl,
.ivlyrics-panel-line-karaoke-row.is-text-run.is-rtl {
  direction: ltr !important;
}
.ivlyrics-panel-line-karaoke-stack {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: stretch !important;
  gap: 0.24em !important;
  width: 100% !important;
  min-width: 0 !important;
  max-height: 100% !important;
  flex-wrap: nowrap !important;
  overflow: hidden !important;
  padding-block: 0.08em !important;
}

.ivlyrics-panel-line-karaoke-row {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

.ivlyrics-panel-line-karaoke-part {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
  padding-block: 0.03em !important;
}

.ivlyrics-panel-line-karaoke-stack-subline {
  width: 100% !important;
  margin-top: 0.12em !important;
}

.ivlyrics-panel-line-karaoke-part.speaker-a { --ivlyrics-panel-vocal-color: #ffffff; }
.ivlyrics-panel-line-karaoke-part.speaker-b { --ivlyrics-panel-vocal-color: #9fd8ff; }
.ivlyrics-panel-line-karaoke-part.speaker-c { --ivlyrics-panel-vocal-color: #ffd166; }
.ivlyrics-panel-line-karaoke-part.speaker-d { --ivlyrics-panel-vocal-color: #c4a7ff; }
.ivlyrics-panel-line-karaoke-part.speaker-sfx { --ivlyrics-panel-vocal-color: #f4a6c8; }
.ivlyrics-panel-line-karaoke-part.speaker-male-1 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-male-1, #a8ccff); }
.ivlyrics-panel-line-karaoke-part.speaker-male-2 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-male-2, #9ae8d4); }
.ivlyrics-panel-line-karaoke-part.speaker-male-3 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-male-3, #bfe8ff); }
.ivlyrics-panel-line-karaoke-part.speaker-male-4 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-male-4, #7fb5e6); }
.ivlyrics-panel-line-karaoke-part.speaker-male-5 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-male-5, #6cb8b8); }
.ivlyrics-panel-line-karaoke-part.speaker-female-1 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-female-1, #ffb8c7); }
.ivlyrics-panel-line-karaoke-part.speaker-female-2 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-female-2, #ffd6b3); }
.ivlyrics-panel-line-karaoke-part.speaker-female-3 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-female-3, #f6c8ff); }
.ivlyrics-panel-line-karaoke-part.speaker-female-4 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-female-4, #e6b4d4); }
.ivlyrics-panel-line-karaoke-part.speaker-female-5 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-female-5, #f6e5a5); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-1 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-duet-1, #e4d8ff); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-2 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-duet-2, #d6e4ff); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-3 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-duet-3, #ffddf2); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-4 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-duet-4, #bfaeff); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-5 { --ivlyrics-panel-vocal-color: var(--ivlyrics-multi-vocal-speaker-color-duet-5, #9d8cf2); }

.ivlyrics-panel-line-karaoke-part.speaker-a, .ivlyrics-panel-line.speaker-a { --ivlyrics-panel-karaoke-color: #ffffff; }
.ivlyrics-panel-line-karaoke-part.speaker-b, .ivlyrics-panel-line.speaker-b { --ivlyrics-panel-karaoke-color: #9fd8ff; }
.ivlyrics-panel-line-karaoke-part.speaker-c, .ivlyrics-panel-line.speaker-c { --ivlyrics-panel-karaoke-color: #ffd18a; }
.ivlyrics-panel-line-karaoke-part.speaker-d, .ivlyrics-panel-line.speaker-d { --ivlyrics-panel-karaoke-color: #d7b8ff; }
.ivlyrics-panel-line-karaoke-part.speaker-sfx, .ivlyrics-panel-line.speaker-sfx,
.ivlyrics-panel-line-karaoke-part.effect, .ivlyrics-panel-line.effect { --ivlyrics-panel-karaoke-color: #9ff2c5; }
.ivlyrics-panel-line-karaoke-part.speaker-male-1, .ivlyrics-panel-line.speaker-male-1 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-1, #a8ccff); }
.ivlyrics-panel-line-karaoke-part.speaker-male-2, .ivlyrics-panel-line.speaker-male-2 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-2, #9ae8d4); }
.ivlyrics-panel-line-karaoke-part.speaker-male-3, .ivlyrics-panel-line.speaker-male-3 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-3, #bfe8ff); }
.ivlyrics-panel-line-karaoke-part.speaker-male-4, .ivlyrics-panel-line.speaker-male-4 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-4, #7fb5e6); }
.ivlyrics-panel-line-karaoke-part.speaker-male-5, .ivlyrics-panel-line.speaker-male-5 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-5, #6cb8b8); }
.ivlyrics-panel-line-karaoke-part.speaker-female-1, .ivlyrics-panel-line.speaker-female-1 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-1, #ffb8c7); }
.ivlyrics-panel-line-karaoke-part.speaker-female-2, .ivlyrics-panel-line.speaker-female-2 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-2, #ffd6b3); }
.ivlyrics-panel-line-karaoke-part.speaker-female-3, .ivlyrics-panel-line.speaker-female-3 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-3, #f6c8ff); }
.ivlyrics-panel-line-karaoke-part.speaker-female-4, .ivlyrics-panel-line.speaker-female-4 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-4, #e6b4d4); }
.ivlyrics-panel-line-karaoke-part.speaker-female-5, .ivlyrics-panel-line.speaker-female-5 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-5, #f6e5a5); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-1, .ivlyrics-panel-line.speaker-duet-1 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-1, #e4d8ff); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-2, .ivlyrics-panel-line.speaker-duet-2 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-2, #d6e4ff); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-3, .ivlyrics-panel-line.speaker-duet-3 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-3, #ffddf2); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-4, .ivlyrics-panel-line.speaker-duet-4 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-4, #bfaeff); }
.ivlyrics-panel-line-karaoke-part.speaker-duet-5, .ivlyrics-panel-line.speaker-duet-5 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-5, #9d8cf2); }

.ivlyrics-panel-line-karaoke-part .ivlyrics-panel-line-phonetic {
  color: var(--ivlyrics-panel-vocal-color, rgba(255, 255, 255, 0.75)) !important;
  opacity: 0.72 !important;
}

.ivlyrics-panel-line-karaoke-part .ivlyrics-panel-line-translation {
  color: var(--ivlyrics-panel-vocal-color, rgba(255, 255, 255, 0.75)) !important;
  opacity: 0.68 !important;
}

.ivlyrics-panel-current-line .ivlyrics-panel-line-karaoke-part .ivlyrics-panel-line-phonetic,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-part .ivlyrics-panel-line-phonetic {
  opacity: 0.84 !important;
}

.ivlyrics-panel-current-line .ivlyrics-panel-line-karaoke-part .ivlyrics-panel-line-translation,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-part .ivlyrics-panel-line-translation {
  opacity: 0.8 !important;
}

.ivlyrics-panel-line-karaoke-part.background {
  font-size: 0.92em !important;
  opacity: 0.9 !important;
}

.ivlyrics-panel-line-karaoke-part.effect,
.ivlyrics-panel-line-karaoke-part.speaker-sfx,
.ivlyrics-panel-line-karaoke-row.effect {
  font-style: italic !important;
}

.ivlyrics-panel-karaoke-line-break {
  display: block !important;
  flex-basis: 100% !important;
  width: 100% !important;
  height: 0 !important;
}

.ivlyrics-panel-line-karaoke-row.speaker-a .ivlyrics-panel-karaoke-word.sung {
  color: #ffffff !important;
}

.ivlyrics-panel-line-karaoke-row.speaker-b .ivlyrics-panel-karaoke-word.sung {
  color: #9fd8ff !important;
}

.ivlyrics-panel-line.speaker-b .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-b.active .ivlyrics-panel-line-text {
  color: #9fd8ff !important;
}

.ivlyrics-panel-line-karaoke-row.speaker-c .ivlyrics-panel-karaoke-word.sung {
  color: #ffd18a !important;
}

.ivlyrics-panel-line.speaker-c .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-c.active .ivlyrics-panel-line-text {
  color: #ffd18a !important;
}

.ivlyrics-panel-line-karaoke-row.speaker-d .ivlyrics-panel-karaoke-word.sung {
  color: #d7b8ff !important;
}

.ivlyrics-panel-line.speaker-d .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-d.active .ivlyrics-panel-line-text {
  color: #d7b8ff !important;
}

.ivlyrics-panel-line-karaoke-row.speaker-sfx .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line-karaoke-row.effect .ivlyrics-panel-karaoke-word.sung {
  color: #9ff2c5 !important;
}

.ivlyrics-panel-line.speaker-sfx .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.effect .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-sfx.active .ivlyrics-panel-line-text,
.ivlyrics-panel-line.effect.active .ivlyrics-panel-line-text {
  color: #9ff2c5 !important;
}

.ivlyrics-panel-line-karaoke-row.speaker-male-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-1.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-1, #a8ccff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-2.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-2, #9ae8d4) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-3.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-3, #bfe8ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-4.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-4, #7fb5e6) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-5.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-5, #6cb8b8) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-1.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-1, #ffb8c7) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-2.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-2, #ffd6b3) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-3.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-3, #f6c8ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-4.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-4, #e6b4d4) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-5.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-5, #f6e5a5) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-1.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-1, #e4d8ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-2.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-2, #d6e4ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-3.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-3, #ffddf2) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-4.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-4, #bfaeff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-5.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-5, #9d8cf2) !important; }

@keyframes ivlyrics-panel-effect-tremble {
  0%, 100% { translate: 0 0; }
  25% { translate: -0.5px 0.25px; }
  50% { translate: 0.45px -0.25px; }
  75% { translate: -0.25px -0.35px; }
}

@keyframes ivlyrics-panel-adlib-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -1.5px; }
}

@keyframes ivlyrics-panel-pulse {
  0%, 100% { scale: 1; filter: brightness(1); }
  45% { scale: 1.025; filter: brightness(1.12); }
}

@keyframes ivlyrics-panel-wave {
  0%, 100% { translate: 0 0; }
  35% { translate: 0 -0.11em; }
  70% { translate: 0 0.03em; }
}

@keyframes ivlyrics-panel-sparkle {
  0%, 100% { filter: brightness(1); text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0 rgba(255, 255, 255, 0); }
  42% { filter: brightness(1.22); text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0.18em rgba(255, 255, 255, 0.34), 0 0 0.42em currentColor; }
  58% { filter: brightness(0.96); text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0.08em rgba(255, 255, 255, 0.16); }
}

@keyframes ivlyrics-panel-echo {
  0%, 100% { text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0 rgba(255, 255, 255, 0); }
  50% { text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0.07em 0.04em 0 rgba(255, 255, 255, 0.18), 0.14em 0.08em 0.22em rgba(248, 251, 255, 0.28); }
}

@keyframes ivlyrics-panel-whisper {
  0%, 100% { opacity: 0.86; filter: blur(0); translate: 0 0; }
  45% { opacity: 0.72; filter: blur(0.55px); translate: 0.04em -0.02em; }
}

@keyframes ivlyrics-panel-bounce {
  0%, 100% { translate: 0 0; }
  32% { translate: 0 -0.16em; }
  58% { translate: 0 0.035em; }
  76% { translate: 0 -0.045em; }
}

@keyframes ivlyrics-panel-sway {
  0%, 100% { translate: 0 0; rotate: 0deg; }
  30% { translate: -0.035em 0; rotate: -1.2deg; }
  70% { translate: 0.035em 0; rotate: 1.2deg; }
}

@keyframes ivlyrics-panel-glow {
  0%, 100% { filter: brightness(1.16); text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0.14em rgba(255, 255, 255, 0.34), 0 0 0.54em rgba(248, 251, 255, 0.3); }
  50% { filter: brightness(1.1); text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0.1em rgba(255, 255, 255, 0.28), 0 0 0.44em rgba(248, 251, 255, 0.24); }
}

@keyframes ivlyrics-panel-glitch {
  0%, 100% { translate: 0 0; text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0 transparent; }
  16% { translate: -0.035em 0.01em; text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0.045em 0 rgba(111, 211, 255, 0.34), -0.045em 0 rgba(255, 116, 172, 0.3); }
  18% { translate: 0.03em -0.01em; text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), -0.04em 0 rgba(111, 211, 255, 0.26), 0.04em 0 rgba(255, 116, 172, 0.28); }
  20%, 64% { translate: 0 0; text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0 transparent; }
  66% { translate: 0.025em 0; text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0.035em 0 rgba(111, 211, 255, 0.24), -0.035em 0 rgba(255, 116, 172, 0.24); }
  68% { translate: 0 0; text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 0 transparent; }
}

@keyframes ivlyrics-panel-flicker {
  0%, 100% { opacity: 1; filter: brightness(1); }
  12% { opacity: 0.76; filter: brightness(0.92); }
  15%, 48% { opacity: 1; filter: brightness(1.08); }
  52% { opacity: 0.82; filter: brightness(0.96); }
  56% { opacity: 1; filter: brightness(1.06); }
}

@keyframes ivlyrics-panel-float {
  0%, 100% { translate: 0 0; rotate: 0deg; }
  50% { translate: 0 -0.09em; rotate: 0.45deg; }
}

@keyframes ivlyrics-panel-blur {
  0%, 100% { filter: blur(0) brightness(1); opacity: 0.98; }
  50% { filter: blur(0.65px) brightness(1.08); opacity: 0.9; }
}

@keyframes ivlyrics-panel-pop {
  0%, 100% { scale: 1; filter: brightness(1); }
  18% { scale: 1.055; filter: brightness(1.12); }
  34% { scale: 0.992; filter: brightness(1); }
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.effect,
.ivlyrics-panel-line.effect.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-effect-tremble 180ms steps(2, end) infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.adlib,
.ivlyrics-panel-line.adlib.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-adlib-float 1.05s ease-in-out infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.pulse,
.ivlyrics-panel-line.pulse.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-pulse 940ms ease-in-out infinite !important;
  transform-origin: center !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.wave .ivlyrics-panel-karaoke-word,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.wave .ivlyrics-panel-karaoke-text-run-segment,
.ivlyrics-panel-line.wave.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-wave 920ms ease-in-out infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.wave .ivlyrics-panel-karaoke-word:nth-child(2n),
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.wave .ivlyrics-panel-karaoke-text-run-segment:nth-child(2n) {
  animation-delay: -120ms !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.wave .ivlyrics-panel-karaoke-word:nth-child(3n),
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.wave .ivlyrics-panel-karaoke-text-run-segment:nth-child(3n) {
  animation-delay: -240ms !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.sparkle .ivlyrics-panel-karaoke-word,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.sparkle .ivlyrics-panel-karaoke-text-run-segment,
.ivlyrics-panel-line.sparkle.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-sparkle 1.18s ease-in-out infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.echo .ivlyrics-panel-karaoke-word,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.echo .ivlyrics-panel-karaoke-text-run-segment,
.ivlyrics-panel-line.echo.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-echo 1.28s ease-in-out infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.whisper,
.ivlyrics-panel-line.whisper.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-whisper 1.45s ease-in-out infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.bounce,
.ivlyrics-panel-line.bounce.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-bounce 780ms cubic-bezier(0.2, 0.85, 0.24, 1) infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.sway,
.ivlyrics-panel-line.sway.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-sway 1.35s ease-in-out infinite !important;
  transform-origin: center bottom !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.glow .ivlyrics-panel-karaoke-word,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.glow .ivlyrics-panel-karaoke-text-run-segment,
.ivlyrics-panel-line.glow.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-glow 1.35s ease-in-out infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.glitch,
.ivlyrics-panel-line.glitch.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-glitch 1.12s steps(1, end) infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.flicker,
.ivlyrics-panel-line.flicker.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-flicker 1.22s steps(1, end) infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.float,
.ivlyrics-panel-line.float.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-float 1.65s ease-in-out infinite !important;
  transform-origin: center !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.blur,
.ivlyrics-panel-line.blur.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-blur 1.5s ease-in-out infinite !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.pop .ivlyrics-panel-karaoke-word,
.ivlyrics-panel-line.active .ivlyrics-panel-line-karaoke-row.pop .ivlyrics-panel-karaoke-text-run-segment,
.ivlyrics-panel-line.pop.active .ivlyrics-panel-line-text {
  animation: ivlyrics-panel-pop 1.08s cubic-bezier(0.18, 0.9, 0.36, 1) infinite !important;
  transform-origin: center !important;
}

.ivlyrics-panel-line .ivlyrics-panel-range-style {
  display: inline-block !important;
  max-width: 100% !important;
  vertical-align: baseline !important;
  color: var(--ivlyrics-range-color, inherit) !important;
  transform-origin: center bottom !important;
  --ivlyrics-range-color: var(--ivlyrics-panel-karaoke-color, #ffffff);
}

.ivlyrics-panel-range-style.speaker-male-1 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-1, #a8ccff); }
.ivlyrics-panel-range-style.speaker-male-2 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-2, #9ae8d4); }
.ivlyrics-panel-range-style.speaker-male-3 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-3, #bfe8ff); }
.ivlyrics-panel-range-style.speaker-male-4 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-4, #7fb5e6); }
.ivlyrics-panel-range-style.speaker-male-5 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-male-5, #6cb8b8); }
.ivlyrics-panel-range-style.speaker-female-1 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-1, #ffb8c7); }
.ivlyrics-panel-range-style.speaker-female-2 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-2, #ffd6b3); }
.ivlyrics-panel-range-style.speaker-female-3 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-3, #f6c8ff); }
.ivlyrics-panel-range-style.speaker-female-4 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-4, #e6b4d4); }
.ivlyrics-panel-range-style.speaker-female-5 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-female-5, #f6e5a5); }
.ivlyrics-panel-range-style.speaker-duet-1 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-1, #e4d8ff); }
.ivlyrics-panel-range-style.speaker-duet-2 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-2, #d6e4ff); }
.ivlyrics-panel-range-style.speaker-duet-3 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-3, #ffddf2); }
.ivlyrics-panel-range-style.speaker-duet-4 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-4, #bfaeff); }
.ivlyrics-panel-range-style.speaker-duet-5 { --ivlyrics-panel-karaoke-color: var(--ivlyrics-multi-vocal-speaker-color-duet-5, #9d8cf2); }

.ivlyrics-panel-line .ivlyrics-panel-range-style .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line .ivlyrics-panel-range-style .ivlyrics-panel-karaoke-text-run-segment.sung {
  color: var(--ivlyrics-panel-karaoke-color, #ffffff) !important;
}

.ivlyrics-panel-line .ivlyrics-panel-range-style.sung {
  color: var(--ivlyrics-range-color, var(--ivlyrics-panel-karaoke-color, #ffffff)) !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-range-style.effect { animation: ivlyrics-panel-effect-tremble 180ms steps(2, end) infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.adlib { animation: ivlyrics-panel-adlib-float 1.05s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.pulse { animation: ivlyrics-panel-pulse 940ms ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.wave { animation: ivlyrics-panel-wave 920ms ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.sparkle { animation: ivlyrics-panel-sparkle 1.18s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.echo { animation: ivlyrics-panel-echo 1.28s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.whisper { animation: ivlyrics-panel-whisper 1.45s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.bounce { animation: ivlyrics-panel-bounce 780ms cubic-bezier(0.2, 0.85, 0.24, 1) infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.sway { animation: ivlyrics-panel-sway 1.35s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.glow { animation: ivlyrics-panel-glow 1.35s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.glitch { animation: ivlyrics-panel-glitch 1.12s steps(1, end) infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.flicker { animation: ivlyrics-panel-flicker 1.22s steps(1, end) infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.float { animation: ivlyrics-panel-float 1.65s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.blur { animation: ivlyrics-panel-blur 1.5s ease-in-out infinite !important; }
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.pop { animation: ivlyrics-panel-pop 1.08s cubic-bezier(0.18, 0.9, 0.36, 1) infinite !important; }

.ivlyrics-panel-line.active .ivlyrics-panel-range-style.wave,
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.sparkle,
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.echo,
.ivlyrics-panel-line.active .ivlyrics-panel-range-style.pop {
  animation-delay: calc(var(--ivlyrics-range-index, 0) * -70ms) !important;
}

.ivlyrics-panel-line.text-effects-disabled,
.ivlyrics-panel-line.text-effects-disabled *,
.ivlyrics-panel-line-karaoke-part.text-effects-disabled,
.ivlyrics-panel-line-karaoke-part.text-effects-disabled *,
.ivlyrics-panel-line-karaoke-row.text-effects-disabled,
.ivlyrics-panel-line-karaoke-row.text-effects-disabled *,
.ivlyrics-panel-range-style.text-effects-disabled,
.ivlyrics-panel-range-style.text-effects-disabled * {
  animation: none !important;
}

.ivlyrics-panel-karaoke-space {
  margin-right: 5px !important;
}

.ivlyrics-panel-karaoke-word-group {
  display: inline-block !important;
  white-space: normal !important;
  max-width: 100% !important;
  overflow-wrap: anywhere !important;
}

/* 노래방 단어 */
.ivlyrics-panel-karaoke-word {
  position: relative !important;
  display: inline-block !important;
  color: rgba(255, 255, 255, 0.5) !important;
  transition: color 0.15s ease !important;
  transform-origin: center bottom !important;
  max-width: 100% !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
}

.ivlyrics-panel-karaoke-text-run-segment {
  position: relative !important;
  display: inline-block !important;
  max-width: 100% !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  color: rgba(255, 255, 255, 0.5) !important;
  transition: color 0.15s ease !important;
  transform-origin: center bottom !important;
  vertical-align: baseline !important;
  unicode-bidi: isolate !important;
  -webkit-box-decoration-break: clone !important;
  box-decoration-break: clone !important;
}

.ivlyrics-panel-karaoke-text-run-space {
  white-space: pre-wrap !important;
}

/* 노래방 단어 - 활성 (하이라이트 + 미세 바운스) */
.ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-karaoke-text-run-segment.sung {
  color: var(--ivlyrics-panel-karaoke-color, #ffffff) !important;
  animation: none !important;
  transform: none !important;
}

/* 노래방 라인 활성 시 단어 기본 색상 더 밝게 */
.ivlyrics-panel-line.active .ivlyrics-panel-karaoke-word,
.ivlyrics-panel-line.active .ivlyrics-panel-karaoke-text-run-segment {
  color: rgba(255, 255, 255, 0.6) !important;
}

.ivlyrics-panel-line.active .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.active .ivlyrics-panel-karaoke-text-run-segment.sung {
  color: var(--ivlyrics-panel-karaoke-color, #ffffff) !important;
  text-shadow: var(--ivlyrics-panel-original-outline-shadow, 0 0 0 transparent), 0 0 10px rgba(255, 255, 255, 0.5) !important;
}

.ivlyrics-panel-line-karaoke-row.speaker-male-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-1.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-1, #a8ccff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-2.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-2, #9ae8d4) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-3.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-3, #bfe8ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-4.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-4, #7fb5e6) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-male-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-male-5.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-male-5, #6cb8b8) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-1.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-1, #ffb8c7) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-2.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-2, #ffd6b3) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-3.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-3, #f6c8ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-4.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-4, #e6b4d4) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-female-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-female-5.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-female-5, #f6e5a5) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-1 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-1.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-1, #e4d8ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-2 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-2.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-2, #d6e4ff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-3 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-3.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-3, #ffddf2) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-4 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-4.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-4, #bfaeff) !important; }
.ivlyrics-panel-line-karaoke-row.speaker-duet-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-5 .ivlyrics-panel-karaoke-word.sung,
.ivlyrics-panel-line.speaker-duet-5.active .ivlyrics-panel-line-text { color: var(--ivlyrics-multi-vocal-speaker-color-duet-5, #9d8cf2) !important; }

.ivlyrics-panel-line.active .ivlyrics-panel-karaoke-text-run-segment.active {
  color: transparent !important;
  background-image: linear-gradient(var(--ivlyrics-panel-karaoke-gradient-direction, to right),
      var(--ivlyrics-panel-karaoke-color, #ffffff) 0,
      var(--ivlyrics-panel-karaoke-color, #ffffff) var(--ivlyrics-panel-karaoke-fill-soft-start, var(--ivlyrics-panel-karaoke-fill, 0%)),
      rgba(255, 255, 255, 0.6) var(--ivlyrics-panel-karaoke-fill-soft-end, var(--ivlyrics-panel-karaoke-fill, 0%)),
      rgba(255, 255, 255, 0.6) 100%) !important;
  background-repeat: no-repeat !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}

/* 가사 없음 상태 */
.ivlyrics-panel-empty {
  display: flex !important;
  flex: 1 1 auto !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 0 !important;
  height: 100% !important;
  text-align: center !important;
  color: rgba(255, 255, 255, 0.6) !important;
  font-size: 13px !important;
  padding: 0 16px !important;
  font-family: 'Pretendard Variable', Pretendard, sans-serif !important;
}

/* Placeholder 라인 (빈 줄 - 높이 유지용) */
.ivlyrics-panel-line.placeholder {
  opacity: 0 !important;
  pointer-events: none !important;
  min-height: var(--ivlyrics-panel-line-slot-height, 68px) !important;
}

/* Furigana (Ruby) 스타일 */
.ivlyrics-panel-line ruby {
  ruby-align: center !important;
}

.ivlyrics-panel-line ruby rt {
  font-size: 0.55em !important;
  color: rgba(255, 255, 255, 0.55) !important;
  font-weight: 400 !important;
}

.ivlyrics-panel-line.active ruby rt {
  color: rgba(255, 255, 255, 0.75) !important;
}

/* 스크롤바 숨기기 */
.ivlyrics-panel-lyrics-wrapper::-webkit-scrollbar {
  display: none !important;
}

.ivlyrics-panel-lyrics-wrapper {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}

/* ==========================================
   Starry Night 테마용 - Now Playing Bar 가사
   Root__now-playing-bar 하단에 표시
   ========================================== */
.ivlyrics-nowplaying-bar-lyrics {
  width: 100%;
  z-index: 10;
  pointer-events: auto;
  padding: 8px 16px;
  margin-top: 10px;
}

.ivlyrics-nowplaying-bar-lyrics .ivlyrics-panel-lyrics-section {
  background: var(--ivlyrics-panel-bg, rgba(0, 0, 0, 0.4)) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  aspect-ratio: auto !important;
  display: block !important;
  border-radius: 8px !important;
  padding: 8px 12px 10px !important;
  max-width: 800px;
  margin: 0 auto;
}

.ivlyrics-nowplaying-bar-lyrics .ivlyrics-panel-header {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  margin-bottom: 4px !important;
}

.ivlyrics-nowplaying-bar-lyrics .ivlyrics-panel-lyrics-wrapper {
  gap: 2px !important;
  height: var(--ivlyrics-panel-bar-fixed-height, 246px) !important;
  max-height: var(--ivlyrics-panel-bar-fixed-height, 246px) !important;
}

.ivlyrics-nowplaying-bar-lyrics .ivlyrics-panel-line {
  padding: 2px 0 !important;
}

/* Starry Night 테마에서 Now Playing Bar에 flex-direction: column 적용 */
/* JavaScript에서 body에 클래스를 추가하는 방식으로 동작 */
body.ivlyrics-starrynight-theme .Root__now-playing-bar {
  display: flex !important;
  flex-direction: column !important;
}
`;
}

function loadGoogleFont(document, fontFamily, debug) {
    if (!fontFamily) return;

    // 콤마로 구분된 여러 폰트 처리
    const fonts = fontFamily.split(",").map(f => f.trim().replace(/['"]/g, ""));

    fonts.forEach(font => {
        if (font && GOOGLE_FONTS.includes(font)) {
            const fontId = font.replace(/ /g, "-").toLowerCase();
            const linkId = `ivlyrics-panel-font-${fontId}`;

            let link = document.getElementById(linkId);
            if (!link) {
                link = document.createElement("link");
                link.id = linkId;
                link.rel = "stylesheet";
                document.head.appendChild(link);

                link.href = lyricsFontStylesheet(font);
                debug(`[NowPlayingPanelLyrics] Loaded font: ${font}`);
            }
        }
    });
}

export function createPanelLyricsStyles({
    document, readSetting, activeBodyClass, transitionDurationMs, supportsLinearEasing, applySpeakerColors, debug,
}) {
    const transitionEasing = supportsLinearEasing
        ? getLyricsLineMotionCurve(0).easing
        : "cubic-bezier(0.20, 0.70, 0.42, 0.96)";

    function refreshStyles(reportUpdate) {
        const typography = readTypography(readSetting);
        for (const font of [typography.originalFont, typography.phoneticFont, typography.translationFont]) {
            loadGoogleFont(document, font, debug);
        }
        const css = renderPanelLyricsStyles(typography, { activeBodyClass, transitionDurationMs, transitionEasing });
        const existingStyle = document.getElementById(PANEL_STYLE_ID);
        if (existingStyle) {
            if (existingStyle.textContent !== css) existingStyle.textContent = css;
            if (reportUpdate) debug("[NowPlayingPanelLyrics] Styles updated");
            return;
        }
        const style = document.createElement("style");
        style.id = PANEL_STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
        debug("[NowPlayingPanelLyrics] Styles injected");
    }

    function updateCSSVariables() {
        const variables = getPanelTypographyVariables(readTypography(readSetting));
        for (const [key, value] of Object.entries(variables)) {
            // Per-role fonts are read from the stylesheet. Keep inline updates
            // limited to the existing sizing and outline contract.
            if (key === "--ivlyrics-panel-original-font" || key === "--ivlyrics-panel-phonetic-font"
                || key === "--ivlyrics-panel-translation-font") continue;
            document.documentElement.style.setProperty(key, value);
        }
        applySpeakerColors();
    }

    return {
        injectStyles: () => refreshStyles(false),
        updateStyles: () => refreshStyles(true),
        updateCSSVariables,
    };
}
