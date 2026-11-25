// 텍스트 줄바꿈 처리
export function wrapText(ctx, text, maxWidth) {
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
export function roundRect(ctx, x, y, width, height, radius) {
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

// 기본 내보내기 글꼴 스택 (fontSource 'default')
// 16진수 색상 + 투명도를 canvas rgba() 문자열로 변환
export function hexToRgba(hex, opacity) {
  const match = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return `rgba(255, 255, 255, ${opacity})`;
  const int = parseInt(match[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${opacity})`;
}
