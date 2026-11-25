export function getSettingsSurfaceTokenCss(selector) {
  return `
/* ivLyrics settings window.
   Neutral surfaces, one blue used only for state (selection, focus, switches),
   hairline borders and 4-12px radii; no gradients or glows. Light and dark
   themes share every rule below and differ only in the tokens. */

${selector} {
  color-scheme: dark;
  --font: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", "Noto Sans KR", system-ui, sans-serif;
  --mono: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  --ease: cubic-bezier(.2, 0, 0, 1);
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --t-fast: 120ms;
  --t: 180ms;
  --t-slow: 280ms;
  --r-xs: 4px;
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 10px;
  --r-xl: 12px;
  --bg: #0b0b0c;
  --bg-2: #0f0f11;
  --surface: #141416;
  --surface-2: #19191c;
  --surface-3: #212125;
  --surface-4: #2c2c31;
  --raise: #2a2a2f;
  --line: rgba(255, 255, 255, .065);
  --line-2: rgba(255, 255, 255, .1);
  --line-3: rgba(255, 255, 255, .17);
  --text: #ededef;
  --text-2: #a9a9b1;
  --text-3: #8b8b94;
  --text-4: #58585f;
  --ink: #ededef;
  --ink-text: #0b0b0c;
  --accent: #2563eb;
  --accent-hover: #3b74f0;
  --accent-ink: #ffffff;
  --accent-text: #7aadff;
  --accent-soft: rgba(59, 130, 246, .14);
  --accent-line: rgba(59, 130, 246, .55);
  --ok: #3fb950; --ok-soft: rgba(63, 185, 80, .12);
  --warn: #d6a33a; --warn-soft: rgba(214, 163, 58, .12);
  --danger: #f2554e; --danger-soft: rgba(242, 85, 78, .12);
  --info: #7aadff; --info-soft: rgba(59, 130, 246, .1);
  --shadow-1: 0 1px 1px rgba(0, 0, 0, .3);
  --shadow-2: 0 8px 24px rgba(0, 0, 0, .42), 0 0 0 1px rgba(255, 255, 255, .06);
  --shadow-3: 0 18px 52px rgba(0, 0, 0, .56), 0 0 0 1px rgba(255, 255, 255, .07);
  --focus: 0 0 0 2px var(--bg), 0 0 0 4px rgba(59, 130, 246, .75);
  --switch-off: #3c3c43;
  --layer-original: #d4d4d8;
  --layer-phonetic: #e9a23b;
  --layer-translation: #3fbf8a;
  --layer-furigana: #e0698e;
  --layer-base: #8a8a93;
}

${selector}[data-ui-theme="light"] {
  color-scheme: light;
  --bg: #f6f6f7;
  --bg-2: #f1f1f3;
  --surface: #ffffff;
  --surface-2: #f6f6f7;
  --surface-3: #eeeef0;
  --surface-4: #e1e1e5;
  --raise: #ffffff;
  --line: rgba(0, 0, 0, .07);
  --line-2: rgba(0, 0, 0, .11);
  --line-3: rgba(0, 0, 0, .18);
  --text: #18181b;
  --text-2: #52525b;
  --text-3: #64646d;
  --text-4: #a1a1aa;
  --ink: #18181b;
  --ink-text: #ffffff;
  --accent-hover: #1d4ed8;
  --accent-text: #1d4ed8;
  --accent-soft: rgba(37, 99, 235, .08);
  --accent-line: rgba(37, 99, 235, .45);
  --ok: #1a7f37; --ok-soft: rgba(26, 127, 55, .09);
  --warn: #9a6700; --warn-soft: rgba(154, 103, 0, .1);
  --danger: #cf222e; --danger-soft: rgba(207, 34, 46, .08);
  --info: #1d4ed8; --info-soft: rgba(37, 99, 235, .07);
  --shadow-1: 0 1px 2px rgba(0, 0, 0, .06);
  --shadow-2: 0 8px 24px rgba(0, 0, 0, .08), 0 0 0 1px rgba(0, 0, 0, .06);
  --shadow-3: 0 18px 52px rgba(0, 0, 0, .14), 0 0 0 1px rgba(0, 0, 0, .07);
  --focus: 0 0 0 2px var(--bg), 0 0 0 4px rgba(37, 99, 235, .55);
  --switch-off: #d4d4d9;
  --layer-original: #3f3f46;
  --layer-phonetic: #c27612;
  --layer-translation: #15845a;
  --layer-furigana: #c43e6a;
  --layer-base: #71717a;
}

`;
}
