// LyricsShareImage.js - 가사 이미지 공유 기능
const LyricsShareImage = (() => {
  // 기본 설정값
  const DEFAULT_SETTINGS = {
    // 배경
    backgroundType: 'coverBlur', // 'coverBlur', 'gradient', 'solid', 'transparent'
    backgroundColor: '#121212',
    backgroundOpacity: 0.6,
    backgroundBlur: 30, // 배경 블러 강도 (px)
    
    // 앨범 커버
    showCover: true,
    coverSize: 120,
    coverPosition: 'left', // 'left', 'center', 'hidden'
    coverRadius: 16,
    coverBlur: 0, // 앨범 커버 블러 강도 (px)
    
    // 곡 정보
    showTrackInfo: true,
    
    // 가사
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 1.6,
    lyricsAlign: 'left', // 'left', 'center'
    showPronunciation: true,
    showTranslation: true,
    pronOpacity: 0.5,
    transColor: '#1DB954',
    blockGap: 32, // 가사 블록 간 간격
    innerGap: 4, // 원어/발음/번역 간 간격
    
    // 레이아웃
    imageWidth: 1080, // 이미지 너비
    padding: 60,
    aspectRatio: null, // null = auto, 1 = square, 16/9 = landscape
    
    // 기타
    showWatermark: true,
  };

  // 프리셋 (템플릿)
  const PRESETS = {
    cover: {
      name: 'Cover Blur',
      settings: {
        backgroundType: 'coverBlur',
        backgroundOpacity: 0.55,
        backgroundBlur: 30,
        showCover: true,
        coverSize: 130,
        coverPosition: 'left',
        coverRadius: 16,
        coverBlur: 0,
        fontSize: 34,
        fontWeight: '600',
        lyricsAlign: 'left',
        blockGap: 36,
        innerGap: 3,
        padding: 60,
        aspectRatio: null,
        showPronunciation: true,
        showTranslation: true,
        showTrackInfo: true,
        showWatermark: true,
      }
    },
    gradient: {
      name: 'Gradient',
      settings: {
        backgroundType: 'gradient',
        backgroundOpacity: 0.6,
        backgroundBlur: 0,
        showCover: true,
        coverSize: 100,
        coverPosition: 'left',
        coverRadius: 12,
        coverBlur: 0,
        fontSize: 32,
        fontWeight: '500',
        lyricsAlign: 'left',
        blockGap: 32,
        innerGap: 4,
        padding: 65,
        aspectRatio: null,
        showPronunciation: true,
        showTranslation: true,
        showTrackInfo: true,
        showWatermark: true,
      }
    },
    minimal: {
      name: 'Minimal',
      settings: {
        backgroundType: 'solid',
        backgroundColor: '#0a0a0a',
        backgroundOpacity: 0.6,
        backgroundBlur: 0,
        showCover: false,
        coverSize: 120,
        coverPosition: 'left',
        coverRadius: 16,
        coverBlur: 0,
        showTrackInfo: true,
        fontSize: 36,
        fontWeight: '500',
        lyricsAlign: 'center',
        blockGap: 40,
        innerGap: 5,
        padding: 80,
        aspectRatio: null,
        showPronunciation: true,
        showTranslation: true,
        showWatermark: true,
      }
    },
    glass: {
      name: 'Glass',
      settings: {
        backgroundType: 'coverBlur',
        backgroundOpacity: 0.7,
        backgroundBlur: 50,
        showCover: true,
        coverSize: 110,
        coverPosition: 'left',
        coverRadius: 20,
        coverBlur: 0,
        fontSize: 30,
        fontWeight: '500',
        lyricsAlign: 'left',
        blockGap: 30,
        innerGap: 3,
        padding: 55,
        aspectRatio: null,
        showPronunciation: true,
        showTranslation: true,
        showTrackInfo: true,
        showWatermark: true,
      }
    },
  };

  // TEMPLATES를 PRESETS로 export (하위 호환성)
  const TEMPLATES = Object.fromEntries(
    Object.entries(PRESETS).map(([key, preset]) => [key, { name: preset.name, ...preset.settings }])
  );

  // Spotify 이미지 URL 변환
  function convertImageUrl(url) {
    if (!url) return null;
    
    // spotify:image: 형식 처리
    if (url.startsWith('spotify:image:')) {
      const imageId = url.split(':')[2];
      return `https://i.scdn.co/image/${imageId}`;
    }
    
    // 이미 https URL이면 그대로
    if (url.startsWith('https://')) {
      return url;
    }
    
    // localfile 등은 사용 불가
    if (url.includes('localfile')) {
      return null;
    }
    
    return url;
  }

  // 앨범 커버에서 주요 색상 추출
  async function extractColors(imageUrl) {
    const convertedUrl = convertImageUrl(imageUrl);
    
    return new Promise((resolve) => {
      if (!convertedUrl) {
        resolve({
          primary: '#1a1a1a',
          darker: '#000000',
          lighter: '#333333',
          isDark: true,
          textColor: '#ffffff',
          subTextColor: 'rgba(255,255,255,0.7)',
        });
        return;
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 50;
          canvas.height = 50;
          ctx.drawImage(img, 0, 0, 50, 50);

          const imageData = ctx.getImageData(0, 0, 50, 50).data;
          let r = 0, g = 0, b = 0, count = 0;

        // 샘플링하여 평균 색상 계산
        for (let i = 0; i < imageData.length; i += 16) {
          r += imageData[i];
          g += imageData[i + 1];
          b += imageData[i + 2];
          count++;
        }

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        // 밝기 계산
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        const isDark = brightness < 128;

        resolve({
          primary: `rgb(${r}, ${g}, ${b})`,
          darker: `rgb(${Math.floor(r * 0.3)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)})`,
          lighter: `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`,
          isDark,
          textColor: isDark ? '#ffffff' : '#000000',
          subTextColor: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
        });
        } catch (e) {
          console.warn('[LyricsShareImage] Color extraction failed:', e);
          resolve({
            primary: '#1a1a1a',
            darker: '#000000',
            lighter: '#333333',
            isDark: true,
            textColor: '#ffffff',
            subTextColor: 'rgba(255,255,255,0.7)',
          });
        }
      };
      img.onerror = () => {
        console.warn('[LyricsShareImage] Image load failed for color extraction');
        resolve({
          primary: '#1a1a1a',
          darker: '#000000',
          lighter: '#333333',
          isDark: true,
          textColor: '#ffffff',
          subTextColor: 'rgba(255,255,255,0.7)',
        });
      };
      img.src = convertedUrl;
    });
  }

  // 이미지 로드 헬퍼
  function loadImage(url) {
    const convertedUrl = convertImageUrl(url);
    
    return new Promise((resolve, reject) => {
      if (!convertedUrl) {
        reject(new Error('Invalid image URL'));
        return;
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => {
        console.warn('[LyricsShareImage] Image load failed:', convertedUrl);
        reject(e);
      };
      img.src = convertedUrl;
    });
  }

  // 텍스트 줄바꿈 처리
  function wrapText(ctx, text, maxWidth) {
    const tokens = String(text || '').match(/\S+|\s+/gu) || [];
    const lines = [];
    let currentLine = '';

    const pushOversizedToken = (token) => {
      for (const char of Array.from(token)) {
        const testLine = currentLine + char;
        if (currentLine && ctx.measureText(testLine).width > maxWidth) {
          lines.push(currentLine.trimEnd());
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
    };

    for (const token of tokens) {
      if (!currentLine && /^\s+$/u.test(token)) continue;
      const testLine = currentLine + token;
      if (!currentLine || ctx.measureText(testLine).width <= maxWidth) {
        if (ctx.measureText(token).width > maxWidth) pushOversizedToken(token);
        else currentLine = testLine;
        continue;
      }

      if (currentLine.trim()) lines.push(currentLine.trimEnd());
      currentLine = '';
      if (/^\s+$/u.test(token)) continue;
      if (ctx.measureText(token).width > maxWidth) pushOversizedToken(token);
      else currentLine = token;
    }
    if (currentLine.trim()) lines.push(currentLine.trimEnd());
    return lines;
  }

  // 둥근 사각형 그리기
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * 가사 이미지 생성
   * @param {Object} options - 옵션
   * @param {Array<{originalText: string, pronText?: string, transText?: string}>} options.lyrics - 가사 라인 배열
   * @param {string} options.trackName - 곡 제목
   * @param {string} options.artistName - 아티스트 이름
   * @param {string} options.albumCover - 앨범 커버 URL
   * @param {string} options.template - 프리셋 이름 (cover, gradient, minimal, glass)
   * @param {Object} options.customSettings - 커스텀 설정 (템플릿 설정 덮어쓰기)
   * @param {number} options.width - 이미지 너비 (기본: 1080)
   * @param {'both'|'dataUrl'|'blob'} options.output - Encode only the requested output (default: both)
   * @returns {Promise<{canvas: HTMLCanvasElement, dataUrl: string|null, blob: Blob|null}>}
   */
  async function generateImage(options) {
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
    
    // 이미지 너비: optionWidth > customSettings.imageWidth > cfg.imageWidth
    const width = optionWidth || cfg.imageWidth || 1080;
    
    const colors = await extractColors(albumCover);

    // 캔버스 생성
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 폰트 설정
    const fontFamily = '"Pretendard Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    // 폰트 크기
    const originalFontSize = cfg.fontSize;
    const pronFontSize = Math.floor(cfg.fontSize * 0.62);
    const transFontSize = Math.floor(cfg.fontSize * 0.68);
    const maxTextWidth = width - cfg.padding * 2;
    
    // 각 가사 블록의 높이 계산
    let totalLyricsHeight = 0;
    const processedLyrics = lyrics.map((line, idx) => {
      const orig = line.originalText || line.displayText || '';
      const pron = cfg.showPronunciation ? (line.pronText || null) : null;
      const trans = cfg.showTranslation ? (line.transText || null) : null;
      
      ctx.font = `${cfg.fontWeight} ${originalFontSize}px ${fontFamily}`;
      const wrappedOrig = wrapText(ctx, orig, maxTextWidth);
      
      ctx.font = `400 ${pronFontSize}px ${fontFamily}`;
      const wrappedPron = pron ? wrapText(ctx, pron, maxTextWidth) : [];
      
      ctx.font = `500 ${transFontSize}px ${fontFamily}`;
      const wrappedTrans = trans ? wrapText(ctx, trans, maxTextWidth) : [];
      
      // 블록 높이 계산 (원어 + 발음 + 번역 + 내부 간격)
      const origHeight = wrappedOrig.length * (originalFontSize * cfg.lineHeight);
      const pronHeight = wrappedPron.length > 0 ? wrappedPron.length * (pronFontSize * 1.4) + cfg.innerGap : 0;
      const transHeight = wrappedTrans.length > 0 ? wrappedTrans.length * (transFontSize * 1.4) + cfg.innerGap : 0;
      const blockHeight = origHeight + pronHeight + transHeight;
      
      totalLyricsHeight += blockHeight + (idx < lyrics.length - 1 ? cfg.blockGap : 0);
      
      return { wrappedOrig, wrappedPron, wrappedTrans, blockHeight };
    });

    // 헤더 높이 계산
    let headerHeight = 20;
    if (cfg.showCover && cfg.coverPosition !== 'hidden') {
      headerHeight = cfg.coverSize + 50;
    } else if (cfg.showTrackInfo) {
      headerHeight = 85;
    }
    
    const footerHeight = cfg.showWatermark ? 60 : 30;

    let calculatedHeight = cfg.padding + headerHeight + totalLyricsHeight + footerHeight + cfg.padding;

    // 스토리 비율인 경우
    if (cfg.aspectRatio) {
      calculatedHeight = Math.max(calculatedHeight, width / cfg.aspectRatio);
    }

    canvas.width = width;
    canvas.height = calculatedHeight;

    // ========== 배경 렌더링 ==========
    await drawBackground(ctx, cfg, albumCover, colors, width, calculatedHeight);

    let currentY = cfg.padding;

    // ========== 헤더 (앨범 커버 + 곡 정보) ==========
    currentY = await drawHeader(ctx, cfg, albumCover, trackName, artistName, width, currentY, fontFamily);

    // ========== 가사 렌더링 ==========
    const textX = cfg.lyricsAlign === 'center' ? width / 2 : cfg.padding;
    ctx.textAlign = cfg.lyricsAlign === 'center' ? 'center' : 'left';
    ctx.textBaseline = 'top';
    
    for (let i = 0; i < processedLyrics.length; i++) {
      const block = processedLyrics[i];
      
      // 원어 텍스트
      ctx.fillStyle = '#ffffff';
      ctx.font = `${cfg.fontWeight} ${originalFontSize}px ${fontFamily}`;
      for (const line of block.wrappedOrig) {
        ctx.fillText(line, textX, currentY);
        currentY += originalFontSize * cfg.lineHeight;
      }
      
      // 발음 텍스트
      if (block.wrappedPron.length > 0) {
        currentY += cfg.innerGap;
        ctx.fillStyle = `rgba(255, 255, 255, ${cfg.pronOpacity})`;
        ctx.font = `400 ${pronFontSize}px ${fontFamily}`;
        for (const line of block.wrappedPron) {
          ctx.fillText(line, textX, currentY);
          currentY += pronFontSize * 1.4;
        }
      }
      
      // 번역 텍스트
      if (block.wrappedTrans.length > 0) {
        currentY += cfg.innerGap;
        ctx.fillStyle = cfg.transColor;
        ctx.font = `500 ${transFontSize}px ${fontFamily}`;
        for (const line of block.wrappedTrans) {
          ctx.fillText(line, textX, currentY);
          currentY += transFontSize * 1.4;
        }
      }
      
      // 블록 간 간격
      if (i < processedLyrics.length - 1) {
        currentY += cfg.blockGap;
      }
    }

    // ========== 워터마크 ==========
    if (cfg.showWatermark) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.font = `500 13px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Spotify', width / 2, calculatedHeight - cfg.padding + 10);
    }

    // Blob 생성
    const dataUrl = output === 'blob' ? null : canvas.toDataURL('image/png');
    const blob = output === 'dataUrl'
      ? null
      : await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

    return { canvas, dataUrl, blob };
  }

  // 블러 이미지 생성 (OffscreenCanvas 사용)
  async function createBlurredImage(img, blurAmount, targetWidth, targetHeight) {
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
  async function drawBackground(ctx, cfg, albumCover, colors, width, height) {
    const bgType = cfg.backgroundType;
    const blurAmount = cfg.backgroundBlur || 30;
    
    if (bgType === 'coverBlur' && albumCover) {
      try {
        const coverImg = await loadImage(albumCover);
        
        // 블러가 적용된 배경 생성
        if (blurAmount > 0) {
          const blurredBg = await createBlurredImage(coverImg, blurAmount, width, height);
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
      const grad = ctx.createLinearGradient(0, 0, width * 0.3, height);
      grad.addColorStop(0, colors.darker);
      grad.addColorStop(0.5, colors.primary);
      grad.addColorStop(1, colors.darker);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = `rgba(0, 0, 0, ${cfg.backgroundOpacity * 0.5})`;
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'solid') {
      ctx.fillStyle = cfg.backgroundColor || '#121212';
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'transparent') {
      // 투명 배경 (아무것도 그리지 않음)
    } else {
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, width, height);
    }
  }

  // 헤더 그리기
  async function drawHeader(ctx, cfg, albumCover, trackName, artistName, width, startY, fontFamily) {
    let currentY = startY;
    
    if (cfg.showCover && cfg.coverPosition !== 'hidden' && albumCover) {
      try {
        const coverImg = await loadImage(albumCover);
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
        roundRect(ctx, coverX, currentY, cfg.coverSize, cfg.coverSize, cfg.coverRadius);
        ctx.clip();
        
        // 커버 블러 적용
        if (cfg.coverBlur && cfg.coverBlur > 0) {
          const blurredCover = await createBlurredImage(coverImg, cfg.coverBlur, cfg.coverSize, cfg.coverSize);
          const padding = cfg.coverBlur * 2;
          ctx.drawImage(blurredCover, padding, padding, cfg.coverSize, cfg.coverSize, coverX, currentY, cfg.coverSize, cfg.coverSize);
        } else {
          ctx.drawImage(coverImg, coverX, currentY, cfg.coverSize, cfg.coverSize);
        }
        ctx.restore();

        // 그림자 초기화
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // 곡 정보
        if (cfg.showTrackInfo) {
          if (cfg.coverPosition === 'center') {
            // 커버 아래에 중앙 정렬
            ctx.fillStyle = '#ffffff';
            ctx.font = `700 ${Math.floor(cfg.fontSize * 0.75)}px ${fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(trackName, width / 2, currentY + cfg.coverSize + 16, width - cfg.padding * 2);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.font = `500 ${Math.floor(cfg.fontSize * 0.55)}px ${fontFamily}`;
            ctx.fillText(artistName, width / 2, currentY + cfg.coverSize + 16 + Math.floor(cfg.fontSize * 0.85), width - cfg.padding * 2);
            
            currentY += cfg.coverSize + 50 + Math.floor(cfg.fontSize * 0.5);
          } else {
            // 커버 오른쪽에
            const infoX = coverX + cfg.coverSize + 24;
            const infoY = currentY + cfg.coverSize / 2;

            ctx.fillStyle = '#ffffff';
            ctx.font = `700 ${Math.floor(cfg.fontSize * 0.8)}px ${fontFamily}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(trackName, infoX, infoY - 4, width - infoX - cfg.padding);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.font = `500 ${Math.floor(cfg.fontSize * 0.55)}px ${fontFamily}`;
            ctx.textBaseline = 'top';
            ctx.fillText(artistName, infoX, infoY + 4, width - infoX - cfg.padding);

            currentY += cfg.coverSize + 40;
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
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.floor(cfg.fontSize * 0.75)}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(trackName, width / 2, startY);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `500 ${Math.floor(cfg.fontSize * 0.52)}px ${fontFamily}`;
    ctx.fillText(artistName, width / 2, startY + Math.floor(cfg.fontSize * 0.85));
    
    return startY + 75;
  }

  /**
   * 클립보드에 이미지 복사
   */
  async function copyToClipboard(blob) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      return true;
    } catch (e) {
      console.error('[LyricsShareImage] Clipboard copy failed:', e);
      return false;
    }
  }

  /**
   * 이미지 다운로드
   */
  function download(dataUrl, filename = 'lyrics.png') {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Web Share API로 공유
   */
  async function share(blob, trackName, artistName) {
    const file = new File([blob], `${trackName} - ${artistName}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${trackName} - ${artistName}`,
          text: `🎵 ${trackName} by ${artistName}\n#ivLyrics #Spotify`,
        });
        return true;
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('[LyricsShareImage] Share failed:', e);
        }
        return false;
      }
    }
    return false;
  }

  // Public API
  return {
    TEMPLATES,
    PRESETS,
    DEFAULT_SETTINGS,
    generateImage,
    copyToClipboard,
    download,
    share,
    extractColors,
  };
})();

// 전역 등록
window.LyricsShareImage = LyricsShareImage;
