import { roundRect, hexToRgba } from "./shareImageCanvas.mjs";
import { LRUCache } from "../../core/LRUCache.mjs";

const ARTWORK_TIMEOUT_MS = 6000;
const FAILED_ARTWORK_RETRY_MS = 1500;
const artworkCache = new LRUCache(4);
const fallbackArtwork = Object.freeze({
  image: null,
  colors: Object.freeze({
    primary: '#1a1a1a', darker: '#000000', lighter: '#333333', isDark: true,
    textColor: '#ffffff', subTextColor: 'rgba(255,255,255,0.7)',
  }),
});

function convertImageUrl(value) {
  const url = String(value || '');
  if (!url || url.includes('localfile')) return null;
  if (url.startsWith('spotify:image:')) return `https://i.scdn.co/image/${url.split(':')[2]}`;
  return url;
}

function readArtworkColors(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, 50, 50);
    const pixels = ctx.getImageData(0, 0, 50, 50).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      count++;
    }
    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);
    const isDark = (r * 299 + g * 587 + b * 114) / 1000 < 128;
    return {
      primary: `rgb(${r}, ${g}, ${b})`,
      darker: `rgb(${Math.floor(r * 0.3)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)})`,
      lighter: `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`,
      isDark,
      textColor: isDark ? '#ffffff' : '#000000',
      subTextColor: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
    };
  } catch (error) {
    console.warn('[LyricsShareImage] Color extraction failed:', error);
    return fallbackArtwork.colors;
  }
}

function loadImage(url) {
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const finish = result => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish(null);
      image.removeAttribute('src');
    }, ARTWORK_TIMEOUT_MS);
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    try {
      image.src = url;
    } catch {
      finish(null);
    }
  });
}

export async function readShareArtwork(imageUrl) {
  const url = convertImageUrl(imageUrl);
  if (!url) return fallbackArtwork;
  const cached = artworkCache.get(url);
  if (cached && (cached.retryAfter == null || cached.retryAfter > Date.now())) return cached.result;
  const entry = {};
  entry.result = loadImage(url).catch(() => null).then(image => {
    if (image) {
      let colors;
      return {
        image,
        get colors() { return colors ??= readArtworkColors(image); },
      };
    }
    // Avoid restarting a slow or failed load on each preview slider change.
    entry.retryAfter = Date.now() + FAILED_ARTWORK_RETRY_MS;
    return fallbackArtwork;
  });
  artworkCache.set(url, entry);
  return entry.result;
}

export async function extractColors(imageUrl) {
  return { ...(await readShareArtwork(imageUrl)).colors };
}

// Draw the blur into a scratch canvas so drawing the cover does not change the render context.
function createBlurredImage(img, blurAmount, targetWidth, targetHeight) {
  if (blurAmount <= 0) return img;

  // 블러용 임시 캔버스 생성
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // 블러를 위해 약간 더 크게 만들어서 가장자리 문제 방지
  const padding = blurAmount * 2;
  tempCanvas.width = targetWidth + padding * 2;
  tempCanvas.height = targetHeight + padding * 2;

  // 이미지를 확대해서 그림
  const scale = Math.max(tempCanvas.width / img.width, tempCanvas.height / img.height) * 1.1;
  const imgW = img.width * scale;
  const imgH = img.height * scale;
  tempCtx.drawImage(img, (tempCanvas.width - imgW) / 2, (tempCanvas.height - imgH) / 2, imgW, imgH);

  // CSS 블러 필터 적용
  tempCtx.filter = `blur(${blurAmount}px)`;
  tempCtx.drawImage(tempCanvas, 0, 0);
  tempCtx.filter = 'none';

  return tempCanvas;
}

// 배경 그리기
export function drawBackground(ctx, cfg, artwork, width, height) {
  const bgType = cfg.backgroundType;
  const blurAmount = cfg.backgroundBlur ?? 30;
  const coverImg = artwork.image;

  if (bgType === 'coverBlur' && coverImg) {
    try {
      // 블러가 적용된 배경 생성
      if (blurAmount > 0) {
        const blurredBg = createBlurredImage(coverImg, blurAmount, width, height);
        // 블러된 이미지 중앙 부분만 사용
        const padding = blurAmount * 2;
        ctx.drawImage(blurredBg, padding, padding, width, height, 0, 0, width, height);
      } else {
        // 블러 없이 커버 이미지 배경
        const scale = Math.max(width / coverImg.width, height / coverImg.height) * 1.2;
        const imgW = coverImg.width * scale;
        const imgH = coverImg.height * scale;
        ctx.drawImage(coverImg, (width - imgW) / 2, (height - imgH) / 2, imgW, imgH);
      }

      ctx.fillStyle = `rgba(0, 0, 0, ${cfg.backgroundOpacity})`;
      ctx.fillRect(0, 0, width, height);
    } catch (e) {
      // 폴백
      ctx.fillStyle = cfg.backgroundColor || '#121212';
      ctx.fillRect(0, 0, width, height);
    }
  } else if (bgType === 'gradient') {
    const { colors } = artwork;
    const grad = ctx.createLinearGradient(0, 0, width * 0.3, height);
    grad.addColorStop(0, colors.darker);
    grad.addColorStop(0.5, colors.primary);
    grad.addColorStop(1, colors.darker);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = `rgba(0, 0, 0, ${cfg.backgroundOpacity * 0.5})`;
    ctx.fillRect(0, 0, width, height);
  } else if (bgType === 'solid' || bgType === 'coverBlur') {
    ctx.fillStyle = cfg.backgroundColor || '#121212';
    ctx.fillRect(0, 0, width, height);
  } else if (bgType === 'transparent') {
    // 투명 배경 (아무것도 그리지 않음)
  } else {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);
  }
}

// 트랙 제목/아티스트 실제 렌더링 크기와 헤더 블록 높이 (중앙 커버 겹침 방지)
function trackTextSizes(cfg) {
  return {
    titleSize: Math.max(8, cfg.trackTitleSize ?? 26),
    artistSize: Math.max(8, cfg.trackArtistSize ?? 18),
  };
}

export function measureHeaderBlock(cfg) {
  const { titleSize, artistSize } = trackTextSizes(cfg);
  if (cfg.showCover && cfg.coverPosition !== 'hidden') {
    if (!cfg.showTrackInfo) return cfg.coverSize + 30;
    if (cfg.coverPosition === 'center') {
      return cfg.coverSize + 16 + titleSize + 8 + artistSize + 24;
    }
    const infoCenter = cfg.coverSize / 2;
    return Math.max(cfg.coverSize + 40, infoCenter + 4 + artistSize + 28);
  }
  if (cfg.showTrackInfo) return titleSize + 8 + artistSize + 24;
  return 20;
}

// 헤더 그리기
export function drawHeader(ctx, cfg, coverImg, trackName, artistName, width, startY, fontFamily) {
  let currentY = startY;

  if (cfg.showCover && cfg.coverPosition !== 'hidden' && coverImg) {
    try {
      let coverX;

      if (cfg.coverPosition === 'center') {
        coverX = (width - cfg.coverSize) / 2;
      } else {
        coverX = cfg.padding;
      }

      // 그림자
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 12;

      // 둥근 커버
      ctx.save();
      try {
        roundRect(ctx, coverX, currentY, cfg.coverSize, cfg.coverSize, cfg.coverRadius);
        ctx.clip();
        if (cfg.coverBlur && cfg.coverBlur > 0) {
          const blurredCover = createBlurredImage(coverImg, cfg.coverBlur, cfg.coverSize, cfg.coverSize);
          const padding = cfg.coverBlur * 2;
          ctx.drawImage(blurredCover, padding, padding, cfg.coverSize, cfg.coverSize, coverX, currentY, cfg.coverSize, cfg.coverSize);
        } else {
          ctx.drawImage(coverImg, coverX, currentY, cfg.coverSize, cfg.coverSize);
        }
      } finally {
        ctx.restore();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }

      // 곡 정보
      if (cfg.showTrackInfo) {
        const { titleSize, artistSize } = trackTextSizes(cfg);
        const titleFont = `${cfg.trackTitleWeight || '700'} ${titleSize}px ${fontFamily}`;
        const artistFont = `${cfg.trackArtistWeight || '500'} ${artistSize}px ${fontFamily}`;
        if (cfg.coverPosition === 'center') {
          // 커버 아래에 중앙 정렬 (제목/아티스트 실제 높이를 반영해 겹침 방지)
          const titleY = currentY + cfg.coverSize + 16;
          const artistY = titleY + titleSize + 8;
          ctx.fillStyle = cfg.trackTitleColor || '#ffffff';
          ctx.font = titleFont;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(trackName, width / 2, titleY, width - cfg.padding * 2);

          ctx.fillStyle = hexToRgba(cfg.trackArtistColor, cfg.trackArtistOpacity ?? 0.65);
          ctx.font = artistFont;
          ctx.fillText(artistName, width / 2, artistY, width - cfg.padding * 2);

          currentY += measureHeaderBlock(cfg);
        } else {
          // 커버 오른쪽에
          const infoX = coverX + cfg.coverSize + 24;
          const infoY = currentY + cfg.coverSize / 2;

          ctx.fillStyle = cfg.trackTitleColor || '#ffffff';
          ctx.font = titleFont;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(trackName, infoX, infoY - 4, width - infoX - cfg.padding);

          ctx.fillStyle = hexToRgba(cfg.trackArtistColor, cfg.trackArtistOpacity ?? 0.65);
          ctx.font = artistFont;
          ctx.textBaseline = 'top';
          ctx.fillText(artistName, infoX, infoY + 4, width - infoX - cfg.padding);

          currentY += measureHeaderBlock(cfg);
        }
      } else {
        currentY += cfg.coverSize + 30;
      }
    } catch (e) {
      // 커버 로드 실패 시 텍스트만
      if (cfg.showTrackInfo) {
        currentY = drawTrackInfoOnly(ctx, cfg, trackName, artistName, width, currentY, fontFamily);
      }
    }
  } else if (cfg.showTrackInfo) {
    currentY = drawTrackInfoOnly(ctx, cfg, trackName, artistName, width, currentY, fontFamily);
  }

  return currentY;
}

// 곡 정보만 그리기 (커버 없이)
function drawTrackInfoOnly(ctx, cfg, trackName, artistName, width, startY, fontFamily) {
  const { titleSize, artistSize } = trackTextSizes(cfg);
  ctx.fillStyle = cfg.trackTitleColor || '#ffffff';
  ctx.font = `${cfg.trackTitleWeight || '700'} ${titleSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(trackName, width / 2, startY);

  ctx.fillStyle = hexToRgba(cfg.trackArtistColor, cfg.trackArtistOpacity ?? 0.65);
  ctx.font = `${cfg.trackArtistWeight || '500'} ${artistSize}px ${fontFamily}`;
  ctx.fillText(artistName, width / 2, startY + titleSize + 8);

  return startY + titleSize + 8 + artistSize + 24;
}
