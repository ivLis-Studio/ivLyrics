import { wrapText, hexToRgba } from "./shareImageCanvas.mjs";

// 단어별(word-level) 내보내기: 각 단어를 [원어/읽기/글로스] 미니 스택 컬럼으로 배치.
// 라인 모드와 달리 줄바꿈 단위가 단어가 되며, 데이터가 없으면 라인 렌더링으로 폴백한다.
function getWordEntries(line, cfg) {
  if (cfg.lyricsDetail !== 'word') return null;
  if (!line || !Array.isArray(line.words) || line.words.length === 0) return null;
  const entries = line.words.map((entry) => ({
    text: String(entry?.w ?? entry?.text ?? '').trim(),
    reading: cfg.showPronunciation ? String(entry?.reading ?? '').trim() : '',
    gloss: cfg.showTranslation ? String(entry?.gloss ?? '').trim() : '',
  })).filter((entry) => entry.text);
  return entries.length > 0 ? entries : null;
}

function layoutWordRows(ctx, entries, cfg, fonts, originalFontSize, maxTextWidth) {
  // 단어 주석 크기는 각 슬라이더를 따름 (절대 px)
  const readingFontSize = Math.max(8, Math.floor(cfg.wordReadingSize ?? 21));
  const glossFontSize = Math.max(8, Math.floor(cfg.wordGlossSize ?? 21));
  const wordGap = Math.floor(originalFontSize * 0.6);
  const innerWordGap = Math.max(2, Math.floor(cfg.innerGap / 2));
  const origLH = originalFontSize * cfg.lineHeight;
  const readingLH = readingFontSize * 1.3;
  const glossLH = glossFontSize * 1.3;

  const columns = entries.map((entry) => {
    ctx.font = `${cfg.origWeight} ${originalFontSize}px ${fonts.original}`;
    const origW = ctx.measureText(entry.text).width;
    let readingW = 0;
    if (entry.reading) {
      ctx.font = `${cfg.wordReadingWeight || '400'} ${readingFontSize}px ${fonts.phonetic}`;
      readingW = ctx.measureText(entry.reading).width;
    }
    let glossW = 0;
    if (entry.gloss) {
      ctx.font = `${cfg.wordGlossWeight || '500'} ${glossFontSize}px ${fonts.translation}`;
      glossW = ctx.measureText(entry.gloss).width;
    }
    return { entry, width: Math.max(origW, readingW, glossW) };
  });

  const rows = [];
  let current = [];
  let currentWidth = 0;
  for (const column of columns) {
    const needed = current.length === 0 ? column.width : currentWidth + wordGap + column.width;
    if (current.length > 0 && needed > maxTextWidth) {
      rows.push(current);
      current = [column];
      currentWidth = column.width;
    } else {
      current.push(column);
      currentWidth = needed;
    }
  }
  if (current.length > 0) rows.push(current);

  const rowHeight = (row) => {
    const hasReading = row.some((column) => column.entry.reading);
    const hasGloss = row.some((column) => column.entry.gloss);
    return origLH
      + (hasReading ? innerWordGap + readingLH : 0)
      + (hasGloss ? innerWordGap + glossLH : 0);
  };
  const blockHeight = rows.reduce((sum, row) => sum + rowHeight(row), 0)
    + (rows.length > 1 ? (rows.length - 1) * Math.floor(cfg.innerGap * 2) : 0);

  return { rows, blockHeight, readingFontSize, glossFontSize, wordGap, innerWordGap, rowHeight };
}

// 각 가사 블록을 줄바꿈 처리하고 높이를 계산 (렌더링 순서와 무관한 순수 측정 단계)
export function measureLyricsBlocks(ctx, lyrics, cfg, fonts, originalFontSize, pronFontSize, transFontSize, maxTextWidth) {
  let totalLyricsHeight = 0;
  const processedLyrics = lyrics.map((line, idx) => {
    const wordEntries = getWordEntries(line, cfg);
    if (wordEntries) {
      const layout = layoutWordRows(ctx, wordEntries, cfg, fonts, originalFontSize, maxTextWidth);
      ctx.font = `${cfg.transWeight || '500'} ${transFontSize}px ${fonts.translation}`;
      const trans = cfg.showTranslation ? (line.transText || null) : null;
      const wrappedTrans = trans ? wrapText(ctx, trans, maxTextWidth) : [];
      const transHeight = wrappedTrans.length > 0 ? wrappedTrans.length * (transFontSize * 1.4) + cfg.innerGap : 0;
      const blockHeight = layout.blockHeight + transHeight;
      totalLyricsHeight += blockHeight + (idx < lyrics.length - 1 ? cfg.blockGap : 0);
      return { isWordMode: true, wordLayout: layout, wrappedOrig: [], wrappedPron: [], wrappedTrans, blockHeight };
    }

    const orig = line.originalText || line.displayText || '';
    const pron = cfg.showPronunciation ? (line.pronText || null) : null;
    const trans = cfg.showTranslation ? (line.transText || null) : null;

    ctx.font = `${cfg.origWeight} ${originalFontSize}px ${fonts.original}`;
    const wrappedOrig = wrapText(ctx, orig, maxTextWidth);

    ctx.font = `${cfg.pronWeight || '400'} ${pronFontSize}px ${fonts.phonetic}`;
    const wrappedPron = pron ? wrapText(ctx, pron, maxTextWidth) : [];

    ctx.font = `${cfg.transWeight || '500'} ${transFontSize}px ${fonts.translation}`;
    const wrappedTrans = trans ? wrapText(ctx, trans, maxTextWidth) : [];

    // 블록 높이 계산 (원어 + 발음 + 번역 + 내부 간격)
    const origHeight = wrappedOrig.length * (originalFontSize * cfg.lineHeight);
    const pronHeight = wrappedPron.length > 0 ? wrappedPron.length * (pronFontSize * 1.4) + cfg.innerGap : 0;
    const transHeight = wrappedTrans.length > 0 ? wrappedTrans.length * (transFontSize * 1.4) + cfg.innerGap : 0;
    const blockHeight = origHeight + pronHeight + transHeight;

    totalLyricsHeight += blockHeight + (idx < lyrics.length - 1 ? cfg.blockGap : 0);

    return { wrappedOrig, wrappedPron, wrappedTrans, blockHeight };
  });
  return { totalLyricsHeight, processedLyrics };
}

// 측정된 가사 블록을 순서대로 캔버스에 그림 (원어 -> 발음 -> 번역)
// 단어 모드에서는 단어 컬럼 행을 먼저 그린 뒤 전체 줄 번역을 보조로 덧붙인다.
export function drawLyricsBlocks(ctx, cfg, processedLyrics, fonts, originalFontSize, pronFontSize, transFontSize, textX, startY) {
  // 캔버스는 exportScale 배율로 커지지만 좌표계는 기본 크기 기준이므로 나눔
  const canvasWidth = (ctx.canvas?.width || 0) / (cfg.exportScale || 1);
  let currentY = startY;
  for (let i = 0; i < processedLyrics.length; i++) {
    const block = processedLyrics[i];

    if (block.isWordMode && block.wordLayout) {
      const layout = block.wordLayout;
      const centered = cfg.lyricsAlign === 'center';
      const rightAligned = cfg.lyricsAlign === 'right';
      const align = centered ? 'center' : rightAligned ? 'right' : 'left';
      for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex++) {
        const row = layout.rows[rowIndex];
        const rowWidth = row.reduce((sum, column) => sum + column.width, 0) + layout.wordGap * (row.length - 1);
        const rowStart = centered ? (canvasWidth / 2 - rowWidth / 2) : rightAligned ? textX - rowWidth : textX;
        let cursorX = rowStart;
        const hasReading = row.some((column) => column.entry.reading);
        const hasGloss = row.some((column) => column.entry.gloss);

        ctx.font = `${cfg.origWeight} ${originalFontSize}px ${fonts.original}`;
        ctx.fillStyle = cfg.origColor || '#ffffff';
        ctx.textAlign = align;
        for (const column of row) {
          const drawX = centered ? cursorX + column.width / 2 : rightAligned ? cursorX + column.width : cursorX;
          ctx.fillText(column.entry.text, drawX, currentY, column.width + 1);
          cursorX += column.width + layout.wordGap;
        }
        currentY += originalFontSize * cfg.lineHeight;

        if (hasReading) {
          currentY += layout.innerWordGap;
          ctx.fillStyle = hexToRgba(cfg.wordReadingColor, cfg.pronOpacity);
          ctx.font = `${cfg.wordReadingWeight || '400'} ${layout.readingFontSize}px ${fonts.phonetic}`;
          cursorX = rowStart;
          for (const column of row) {
            if (!column.entry.reading) {
              cursorX += column.width + layout.wordGap;
              continue;
            }
            const drawX = centered ? cursorX + column.width / 2 : rightAligned ? cursorX + column.width : cursorX;
            ctx.fillText(column.entry.reading, drawX, currentY, column.width + 1);
            cursorX += column.width + layout.wordGap;
          }
          currentY += layout.readingFontSize * 1.3;
        }

        if (hasGloss) {
          currentY += layout.innerWordGap;
          ctx.fillStyle = cfg.wordGlossColor || cfg.transColor;
          ctx.font = `${cfg.wordGlossWeight || '500'} ${layout.glossFontSize}px ${fonts.translation}`;
          cursorX = rowStart;
          for (const column of row) {
            if (!column.entry.gloss) {
              cursorX += column.width + layout.wordGap;
              continue;
            }
            const drawX = centered ? cursorX + column.width / 2 : rightAligned ? cursorX + column.width : cursorX;
            ctx.fillText(column.entry.gloss, drawX, currentY, column.width + 1);
            cursorX += column.width + layout.wordGap;
          }
          currentY += layout.glossFontSize * 1.3;
        }

        if (rowIndex < layout.rows.length - 1) {
          currentY += Math.floor(cfg.innerGap * 2);
        }
      }

      if (block.wrappedTrans.length > 0) {
        currentY += cfg.innerGap;
        ctx.fillStyle = cfg.transColor;
        ctx.font = `${cfg.transWeight || '500'} ${transFontSize}px ${fonts.translation}`;
        ctx.textAlign = align;
        const transX = centered ? canvasWidth / 2 : textX;
        for (const line of block.wrappedTrans) {
          ctx.fillText(line, transX, currentY);
          currentY += transFontSize * 1.4;
        }
      }

      if (i < processedLyrics.length - 1) {
        currentY += cfg.blockGap;
      }
      continue;
    }

    // 원어 텍스트
    ctx.textAlign = cfg.lyricsAlign;
    ctx.fillStyle = cfg.origColor || '#ffffff';
    ctx.font = `${cfg.origWeight} ${originalFontSize}px ${fonts.original}`;
    for (const line of block.wrappedOrig) {
      ctx.fillText(line, textX, currentY);
      currentY += originalFontSize * cfg.lineHeight;
    }

    // 발음 텍스트
    if (block.wrappedPron.length > 0) {
      currentY += cfg.innerGap;
      ctx.fillStyle = hexToRgba(cfg.pronColor, cfg.pronOpacity);
      ctx.font = `${cfg.pronWeight || '400'} ${pronFontSize}px ${fonts.phonetic}`;
      for (const line of block.wrappedPron) {
        ctx.fillText(line, textX, currentY);
        currentY += pronFontSize * 1.4;
      }
    }

    // 번역 텍스트
    if (block.wrappedTrans.length > 0) {
      currentY += cfg.innerGap;
      ctx.fillStyle = cfg.transColor;
      ctx.font = `${cfg.transWeight || '500'} ${transFontSize}px ${fonts.translation}`;
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
  return currentY;
}
