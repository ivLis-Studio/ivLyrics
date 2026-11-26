import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { runWithAbortSignal } from "../../core/abortableOperation.mjs";
import { DEFAULT_SETTINGS, PRESETS } from "./shareImagePresets.mjs";
import { readShareArtwork, measureHeaderBlock, drawBackground, drawHeader } from "./shareImageArtwork.mjs";
import { measureLyricsBlocks, drawLyricsBlocks } from "./shareImageLyricsLayout.mjs";

const DEFAULT_FONT_STACK = '"Pretendard Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const FIT_KEYS = ['fontSize', 'coverSize', 'coverRadius', 'padding', 'blockGap', 'innerGap',
  'pronSize', 'transSize', 'wordReadingSize', 'wordGlossSize', 'trackTitleSize', 'trackArtistSize'];

function stackFor(name) {
  const value = String(name || '').trim().replace(/"/g, '');
  if (!value) return DEFAULT_FONT_STACK;
  if (value.includes(',')) return value;
  return `"${value}", ${DEFAULT_FONT_STACK}`;
}

// 글꼴 출처에 따라 타입별 글꼴 결정: 'settings'면 앱 설정(원어/발음/번역 글꼴),
// 'custom'이면서 입력값이 있으면 직접 입력한 글꼴을 전부 적용
function resolveExportFonts(cfg) {
  if (cfg.fontSource === 'custom' && String(cfg.customFontFamily || '').trim()) {
    const stack = stackFor(cfg.customFontFamily);
    return { original: stack, phonetic: stack, translation: stack };
  }
  if (cfg.fontSource !== 'settings') {
    return { original: DEFAULT_FONT_STACK, phonetic: DEFAULT_FONT_STACK, translation: DEFAULT_FONT_STACK };
  }
  let visual = {};
  try {
    visual = getRuntimeService("CONFIG", window)?.visual || {};
  } catch { visual = {}; }
  return {
    original: stackFor(visual['original-font-family']),
    phonetic: stackFor(visual['phonetic-font-family']),
    translation: stackFor(visual['translation-font-family']),
  };
}

function measureImageContent(ctx, lyrics, cfg, fonts, width) {
  const originalFontSize = cfg.fontSize;
  const pronFontSize = Math.max(8, cfg.pronSize ?? 20);
  const transFontSize = Math.max(8, cfg.transSize ?? 22);
  const measured = measureLyricsBlocks(
    ctx, lyrics, cfg, fonts, originalFontSize, pronFontSize, transFontSize, width - cfg.padding * 2
  );
  const headerHeight = measureHeaderBlock(cfg);
  const footerHeight = cfg.showWatermark ? 60 : 30;
  const height = headerHeight + measured.totalLyricsHeight + footerHeight + cfg.padding * 2;
  return { ...measured, originalFontSize, pronFontSize, transFontSize, headerHeight, footerHeight, height };
}

function fitImageContent(ctx, lyrics, cfg, fonts, width) {
  const ratio = Number(cfg.aspectRatio);
  const fixedHeight = Number.isFinite(ratio) && ratio > 0 ? width / ratio : null;
  let layout = measureImageContent(ctx, lyrics, cfg, fonts, width);
  const height = fixedHeight ?? layout.height;
  if (layout.height > height && layout.totalLyricsHeight > 0) {
    const chrome = layout.headerHeight + layout.footerHeight + cfg.padding * 2;
    const fit = (height - chrome) / layout.totalLyricsHeight;
    if (fit > 0 && fit < 1) {
      cfg = { ...cfg };
      for (const key of FIT_KEYS) cfg[key] = (cfg[key] ?? 0) * fit;
      layout = measureImageContent(ctx, lyrics, cfg, fonts, width);
    }
  }
  // Wrapped annotations and their minimum sizes can still exceed the frame.
  // Fit the measured content as a unit while the background fills the image.
  const scale = Math.min(1, height / layout.height);
  return { cfg, layout, height, scale };
}

/**
 * 가사 이미지 생성
 * @param {Object} options - 옵션
 * @param {Array} options.lyrics - 가사 라인 배열 (line.words 지원: [{w, reading, gloss}])
 * @param {string} options.trackName - 곡 제목
 * @param {string} options.artistName - 아티스트 이름
 * @param {string} options.albumCover - 앨범 커버 URL
 * @param {string} options.template - 프리셋 이름 (cover, gradient, minimal, glass)
 * @param {Object} options.customSettings - 커스텀 설정 (템플릿 설정 덮어쓰기)
 * @param {number} options.width - 이미지 너비 (기본: 1080)
 * @param {'both'|'dataUrl'|'blob'} options.output - Encode only the requested output (default: both)
 * @returns {Promise<{canvas: HTMLCanvasElement, dataUrl: string|null, blob: Blob|null}>}
 */
export async function generateImage(options, { signal } = {}) {
  const {
    lyrics = [],
    trackName = '',
    artistName = '',
    albumCover = '',
    template = 'cover',
    customSettings = {},
    width: optionWidth,
    output = 'both',
  } = options;

  // 프리셋 + 커스텀 설정 병합
  const preset = PRESETS[template]?.settings || PRESETS.cover.settings;
  const cfg = { ...DEFAULT_SETTINGS, ...preset, ...customSettings };
  // Preserve callers using the previous original-lyric weight setting.
  cfg.origWeight = customSettings.origWeight ?? customSettings.fontWeight
    ?? preset.origWeight ?? preset.fontWeight ?? DEFAULT_SETTINGS.origWeight;

  // 이미지 너비: optionWidth > customSettings.imageWidth > cfg.imageWidth
  // exportScale 배율은 측정(기본 좌표) → 캔버스 확대 + setTransform 순서로 적용해
  // 벡터 텍스트가 깨지지 않는 진짜 고해상도 렌더링을 만든다.
  const exportScale = cfg.exportScale || 1;
  const width = optionWidth || cfg.imageWidth || 1080;

  const wantsCover = cfg.showCover && cfg.coverPosition !== 'hidden';
  const wantsArtwork = wantsCover || cfg.backgroundType === 'gradient' || cfg.backgroundType === 'coverBlur';
  const fonts = resolveExportFonts(cfg);
  // Artwork is cached across renders. Stop this wait without interrupting other consumers.
  const artwork = await runWithAbortSignal(signal, () => readShareArtwork(wantsArtwork ? albumCover : ''));
  await runWithAbortSignal(signal, async () => {
    try {
      await document.fonts?.ready;
    } catch { /* 웹폰트 미로딩 시 기본 스택으로 폴백 */ }
  });
  signal?.throwIfAborted();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const sourceCfg = artwork.image ? cfg : { ...cfg, showCover: false };
  const { cfg: eff, layout, height, scale } = fitImageContent(ctx, lyrics, sourceCfg, fonts, width);
  const { processedLyrics, originalFontSize, pronFontSize, transFontSize } = layout;

  canvas.width = Math.round(width * exportScale);
  canvas.height = Math.round(height * exportScale);
  if (exportScale !== 1 && typeof ctx.setTransform === 'function') {
    ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0);
  }

  // ========== 배경 렌더링 ==========
  drawBackground(ctx, eff, artwork, width, height);
  if (scale < 1) {
    const contentScale = exportScale * scale;
    ctx.setTransform(contentScale, 0, 0, contentScale, (canvas.width - width * contentScale) / 2, 0);
  }

  let currentY = eff.padding;

  // ========== 헤더 (앨범 커버 + 곡 정보) ==========
  currentY = drawHeader(ctx, eff, artwork.image, trackName, artistName, width, currentY, fonts.original);

  // ========== 가사 렌더링 ==========
  const textX = eff.lyricsAlign === 'center' ? width / 2 : eff.lyricsAlign === 'right' ? width - eff.padding : eff.padding;
  ctx.textAlign = eff.lyricsAlign;
  ctx.textBaseline = 'top';

  drawLyricsBlocks(ctx, eff, processedLyrics, fonts, originalFontSize, pronFontSize, transFontSize, textX, currentY);

  // ========== 워터마크 ==========
  const drawWatermark = () => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.font = `500 13px ${fonts.original}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Spotify', width / 2, height / scale - Math.max(1, eff.padding - 10));
  };
  if (cfg.showWatermark) {
    drawWatermark();
  }

  // Blob 생성
  const dataUrl = output === 'blob' ? null : canvas.toDataURL('image/png');
  const blob = output === 'dataUrl'
    ? null
    : await runWithAbortSignal(signal, () => new Promise(resolve => canvas.toBlob(resolve, 'image/png')));

  return { canvas, dataUrl, blob };
}
