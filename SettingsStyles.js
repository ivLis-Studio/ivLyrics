// Settings window styles, kept separate from its controls and state.
// Injected by ConfigModal inside #ivLyrics-config-container; scoped to it.
// First-run setup and lightweight prompts use the same theme tokens without the settings layout rules.
function getSettingsSurfaceTokenCss(selector) {
  return SETTINGS_MODAL_CSS.slice(0, SETTINGS_MODAL_CSS.indexOf("/* Names used by inline styles"))
    .replaceAll(`#${APP_NAME}-config-container`, selector);
}
const SETTINGS_MODAL_CSS = `
/* ivLyrics settings window.
   Neutral surfaces, one blue used only for state (selection, focus, switches),
   hairline borders and 4-12px radii; no gradients or glows. Light and dark
   themes share every rule below and differ only in the tokens. */

#${APP_NAME}-config-container {
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

#${APP_NAME}-config-container[data-ui-theme="light"] {
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

/* Names used by inline styles, release notes and the add-on settings UIs. */
#${APP_NAME}-config-container {
  --settings-bg: var(--bg);
  --settings-surface: var(--surface);
  --settings-surface-2: var(--surface-2);
  --settings-surface-3: var(--surface-3);
  --settings-text: var(--text);
  --settings-text-2: var(--text-2);
  --settings-text-3: var(--text-3);
  --settings-line: var(--line);
  --settings-line-2: var(--line-2);
  --settings-line-3: var(--line-3);
  --settings-mono: var(--mono);
  --settings-ink: var(--ink);
  --settings-ink-text: var(--ink-text);
  --settings-accent: var(--accent);
  --settings-accent-text: var(--accent-text);
  --settings-accent-line: var(--accent-line);
  --settings-layer-original: var(--layer-original);
  --settings-layer-phonetic: var(--layer-phonetic);
  --settings-layer-translation: var(--layer-translation);
  --settings-layer-furigana: var(--layer-furigana);
  --settings-layer-base: var(--layer-base);
  --text-primary: var(--text);
  --text-secondary: var(--text-2);
  --text-tertiary: var(--text-3);
  --accent-primary: var(--accent);
  --accent-primary-light: var(--accent-soft);
  --glass-bg: var(--surface-2);
  --glass-bg-hover: var(--surface-3);
  --glass-border: var(--line-2);
  --glass-border-light: var(--line-3);
  --spice-text: var(--text);
}

/* ---------------------------------------------------------------- window */
.ivlyrics-settings-modal-shell:has(> #${APP_NAME}-config-container) {
  display: flex;
  width: min(96vw, 1440px);
  height: min(88vh, 900px);
  max-width: 96vw;
  max-height: 92vh;
  border: 0;
  border-radius: var(--r-xl, 12px);
  background: #0b0b0c;
  box-shadow: 0 18px 52px rgba(0, 0, 0, .56), 0 0 0 1px rgba(255, 255, 255, .08);
}
.ivlyrics-settings-modal-shell:has(> #${APP_NAME}-config-container[data-ui-theme="light"]) {
  background: #f6f6f7;
  box-shadow: 0 18px 52px rgba(0, 0, 0, .22), 0 0 0 1px rgba(0, 0, 0, .1);
}
@media (max-width: 650px) {
  .ivlyrics-settings-modal-shell:has(> #${APP_NAME}-config-container) { width: 100vw; max-width: 100vw; height: 96vh; max-height: 96vh; }
}

#${APP_NAME}-config-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
#${APP_NAME}-config-container *, #${APP_NAME}-config-container *::before, #${APP_NAME}-config-container *::after { box-sizing: border-box; }
#${APP_NAME}-config-container button, #${APP_NAME}-config-container input, #${APP_NAME}-config-container select, #${APP_NAME}-config-container textarea { font: inherit; color: inherit; letter-spacing: normal; }
#${APP_NAME}-config-container button { cursor: pointer; }
#${APP_NAME}-config-container button:disabled { cursor: not-allowed; }
#${APP_NAME}-config-container [hidden] { display: none !important; }
#${APP_NAME}-config-container :focus { outline: none; }
#${APP_NAME}-config-container :focus-visible { outline: none; box-shadow: var(--focus); }
#${APP_NAME}-config-container a { color: var(--accent-text); }
#${APP_NAME}-config-container ::selection { background: var(--accent-soft); }
#${APP_NAME}-config-container * { scrollbar-width: thin; scrollbar-color: var(--line-3) transparent; }
#${APP_NAME}-config-container ::-webkit-scrollbar { width: 10px; height: 10px; }
#${APP_NAME}-config-container ::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }
#${APP_NAME}-config-container ::-webkit-scrollbar-thumb:hover { background-color: var(--line-3); }
#${APP_NAME}-config-container ::-webkit-scrollbar-track { background: transparent; }

/* style.css lifts every button, field and row on hover/focus; settings controls stay put. */
#${APP_NAME}-config-container button:hover:not(:disabled), #${APP_NAME}-config-container .btn:hover:not(:disabled),
#${APP_NAME}-config-container button:active:not(:disabled), #${APP_NAME}-config-container .btn:active:not(:disabled),
#${APP_NAME}-config-container input:focus, #${APP_NAME}-config-container select:focus, #${APP_NAME}-config-container textarea:focus,
#${APP_NAME}-config-container .setting-row:hover { transform: none; }

.settings-visually-hidden, #${APP_NAME}-config-container .settings-visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* ---------------------------------------------------------------- top bar */
#${APP_NAME}-config-container .settings-topbar { position: relative; z-index: 20; flex: 0 0 auto; display: grid; grid-template-columns: minmax(180px, 1fr) minmax(260px, 480px) minmax(180px, 1fr); align-items: center; gap: 14px; height: 52px; padding: 0 12px 0 18px; border-bottom: 1px solid var(--line); background: var(--bg-2); }
#${APP_NAME}-config-container .settings-topbar-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
#${APP_NAME}-config-container .settings-topbar-title h1 { margin: 0; font-size: 14px; font-weight: 600; line-height: 1; white-space: nowrap; color: var(--text); }
#${APP_NAME}-config-container .settings-topbar-title .settings-wordmark { display: inline-flex; align-items: baseline; gap: 0; flex: 0 0 auto; font-size: 18px; letter-spacing: -.025em; direction: ltr; unicode-bidi: isolate; font-synthesis: none; }
#${APP_NAME}-config-container .settings-wordmark-iv { font-weight: 800; }
#${APP_NAME}-config-container .settings-wordmark-lyrics { font-weight: 250; }
#${APP_NAME}-config-container .settings-crumbs { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 12.5px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-crumbs span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${APP_NAME}-config-container .settings-crumbs svg { width: 12px; height: 12px; flex: 0 0 auto; opacity: .6; }
#${APP_NAME}-config-container .settings-topbar-tools { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }

#${APP_NAME}-config-container .settings-search { position: relative; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px 0 10px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--line-2); transition: border-color var(--t-fast), box-shadow var(--t-fast), background var(--t-fast); }
#${APP_NAME}-config-container .settings-search:focus-within { border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); background: var(--surface); }
#${APP_NAME}-config-container .settings-search-icon { width: 16px; height: 16px; color: var(--text-3); flex: 0 0 auto; }
#${APP_NAME}-config-container .settings-search-input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 13.5px; color: var(--text); outline: none; }
#${APP_NAME}-config-container .settings-search-input:focus-visible { box-shadow: none; }
#${APP_NAME}-config-container .settings-search-input::placeholder { color: var(--text-4); }
#${APP_NAME}-config-container .settings-search-input::-webkit-search-cancel-button { display: none; }
#${APP_NAME}-config-container .settings-search-clear { display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 auto; padding: 0; border: 0; border-radius: var(--r-xs); background: transparent; color: var(--text-3); }
#${APP_NAME}-config-container .settings-search-clear:hover { background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-search-clear svg { width: 14px; height: 14px; }
#${APP_NAME}-config-container .settings-kbd, #${APP_NAME}-config-container kbd.settings-kbd { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-width: 20px; height: 20px; padding: 0 5px; border-radius: var(--r-xs); border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text-3); font: 500 11px/1 var(--font); white-space: nowrap; }
#${APP_NAME}-config-container .settings-search.has-query .settings-kbd { display: none; }

#${APP_NAME}-config-container .settings-search-panel { position: absolute; z-index: 40; top: calc(100% + 8px); left: 50%; width: min(620px, calc(100vw - 48px)); max-height: min(540px, 70vh); display: flex; flex-direction: column; transform: translateX(-50%); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-3); overflow: hidden; animation: settings-pop var(--t) var(--ease-out); }
@keyframes settings-pop { from { opacity: 0; transform: translate(-50%, -4px); } to { opacity: 1; transform: translate(-50%, 0); } }
#${APP_NAME}-config-container .settings-search-meta { display: flex; justify-content: space-between; gap: 12px; padding: 8px 14px; font-size: 11.5px; color: var(--text-3); border-bottom: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-search-list { overflow-y: auto; padding: 4px; }
#${APP_NAME}-config-container .search-result-group + .search-result-group { margin-top: 2px; }
#${APP_NAME}-config-container .settings-search-group-label { padding: 10px 10px 4px; font-size: 11.5px; font-weight: 500; color: var(--text-4); }
#${APP_NAME}-config-container .settings-search-result { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: var(--r-sm); background: transparent; text-align: left; color: var(--text); }
#${APP_NAME}-config-container .settings-search-result:hover, #${APP_NAME}-config-container .settings-search-result.is-active { background: var(--surface-3); }
#${APP_NAME}-config-container .settings-search-result-icon { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 auto; border-radius: var(--r-sm); background: var(--surface-2); border: 1px solid var(--line); color: var(--text-3); }
#${APP_NAME}-config-container .settings-search-result.is-active .settings-search-result-icon { color: var(--text); border-color: var(--line-3); }
#${APP_NAME}-config-container .settings-search-result-icon svg { width: 15px; height: 15px; }
#${APP_NAME}-config-container .settings-search-result-main { flex: 1; min-width: 0; }
#${APP_NAME}-config-container .settings-search-result-main b { display: block; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${APP_NAME}-config-container .settings-search-result-main small { display: block; font-size: 11.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${APP_NAME}-config-container .search-highlight, #${APP_NAME}-config-container .settings-search-result mark { padding: 0; background: transparent; color: var(--accent-text); font-weight: 600; }
#${APP_NAME}-config-container .search-no-results { display: grid; justify-items: center; gap: 4px; padding: 30px 16px; text-align: center; color: var(--text-3); font-size: 13px; }
#${APP_NAME}-config-container .search-no-results-icon { display: grid; place-items: center; width: 36px; height: 36px; margin-bottom: 4px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--line); color: var(--text-3); }
#${APP_NAME}-config-container .search-no-results-icon svg { width: 18px; height: 18px; }
#${APP_NAME}-config-container .search-no-results-title { margin: 0; color: var(--text); font-size: 13.5px; font-weight: 500; }
#${APP_NAME}-config-container .search-no-results-desc { margin: 0; font-size: 12.5px; }

#${APP_NAME}-config-container .settings-changed-chip { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 10px; border-radius: var(--r-md); border: 1px solid var(--line-2); background: transparent; color: var(--text-2); font-size: 12.5px; font-weight: 500; white-space: nowrap; transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast); }
#${APP_NAME}-config-container .settings-changed-chip svg { width: 15px; height: 15px; }
#${APP_NAME}-config-container .settings-changed-chip:hover { color: var(--text); background: var(--surface-2); }
#${APP_NAME}-config-container .settings-changed-chip[aria-pressed="true"] { background: var(--surface-3); color: var(--text); border-color: var(--line-3); }
#${APP_NAME}-config-container .settings-changed-chip b { display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--r-xs); background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container .settings-changed-chip.is-zero b { background: var(--surface-3); color: var(--text-3); }
#${APP_NAME}-config-container .settings-theme-control { width: 160px; flex: 0 0 auto; }
#${APP_NAME}-config-container .settings-close-btn, #${APP_NAME}-config-container .settings-icon-btn { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 auto; padding: 0; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-3); transition: background var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-close-btn:hover, #${APP_NAME}-config-container .settings-icon-btn:hover { background: var(--surface-3); color: var(--text); }

/* ---------------------------------------------------------------- body */
#${APP_NAME}-config-container .settings-body { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 216px minmax(0, 1fr) auto; }

#${APP_NAME}-config-container .settings-rail { min-height: 0; overflow-y: auto; padding: 10px 8px 16px; border-right: 1px solid var(--line); background: var(--bg-2); }
#${APP_NAME}-config-container .settings-rail-group { margin-bottom: 10px; }
#${APP_NAME}-config-container .settings-rail-group-label { padding: 8px 10px 4px; font-size: 11.5px; font-weight: 500; color: var(--text-3); }
#${APP_NAME}-config-container .settings-rail-item { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; margin: 0; padding: 0 8px 0 10px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-2); font-size: 13.5px; font-weight: 500; text-align: left; transition: background var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-rail-item:hover { background: var(--surface-2); color: var(--text); }
#${APP_NAME}-config-container .settings-rail-item.is-active, #${APP_NAME}-config-container .settings-rail-item[aria-current="page"] { background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-rail-icon { width: 16px; height: 16px; flex: 0 0 auto; color: var(--text-3); }
#${APP_NAME}-config-container .settings-rail-item.is-active .settings-rail-icon { color: var(--text); }
#${APP_NAME}-config-container .settings-rail-item.is-modified .settings-rail-label, #${APP_NAME}-config-container .settings-rail-item.is-modified .settings-rail-icon { color: var(--accent-text); }
#${APP_NAME}-config-container .settings-rail-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${APP_NAME}-config-container .settings-rail-count { display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--r-xs); background: var(--accent-soft); color: var(--accent-text); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container .settings-rail-foot { display: grid; gap: 2px; margin-top: 8px; padding: 12px 10px 0; border-top: 1px solid var(--line); font-size: 11.5px; line-height: 1.6; color: var(--text-4); }
#${APP_NAME}-config-container .settings-rail-foot b { color: var(--text-3); font-weight: 500; }

#${APP_NAME}-config-container .settings-content { position: relative; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; container-type: inline-size; container-name: settings-content; }
#${APP_NAME}-config-container .settings-content:focus-visible { box-shadow: none; }
#${APP_NAME}-config-container .settings-page { max-width: 980px; margin: 0 auto; padding: 0 28px 96px; }
#${APP_NAME}-config-container .settings-page-head { position: sticky; top: 0; z-index: 8; margin: 0 -28px; padding: 20px 28px 10px; background: var(--bg); }
#${APP_NAME}-config-container .settings-page-title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
#${APP_NAME}-config-container .settings-page-title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 600; letter-spacing: -.4px; color: var(--text); }
#${APP_NAME}-config-container .settings-page-desc { margin: 4px 0 0; font-size: 13px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-view-switch { margin-top: 14px; max-width: 480px; }
#${APP_NAME}-config-container .settings-toc { display: flex; flex-wrap: nowrap; gap: 4px; margin: 12px -28px 0; padding: 0 28px 2px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: none; scroll-padding: 0 28px; }
#${APP_NAME}-config-container .settings-toc::-webkit-scrollbar { display: none; }
#${APP_NAME}-config-container .settings-toc.is-overflow { -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 44px), transparent); mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 44px), transparent); }
#${APP_NAME}-config-container .settings-toc.is-overflow.at-start { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 44px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 44px), transparent); }
#${APP_NAME}-config-container .settings-toc.is-overflow.at-end { -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 28px); mask-image: linear-gradient(90deg, transparent 0, #000 28px); }
#${APP_NAME}-config-container .settings-toc-item { display: inline-flex; align-items: center; flex: 0 0 auto; height: 26px; padding: 0 9px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-3); font-size: 12.5px; font-weight: 500; white-space: nowrap; transition: background var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-toc-item:hover { color: var(--text); background: var(--surface-2); }
#${APP_NAME}-config-container .settings-toc-item.is-active { color: var(--text); background: var(--surface-3); }


/* ---------------------------------------------------------------- sections */
#${APP_NAME}-config-container .tab-content { display: block; }
#${APP_NAME}-config-container .settings-section { padding-top: 36px; scroll-margin-top: 140px; }
#${APP_NAME}-config-container .settings-section > .section-title { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 0 0 12px; padding: 0; border: 0; background: none; }
#${APP_NAME}-config-container .settings-section .section-title-content { min-width: 0; }
#${APP_NAME}-config-container .settings-section .section-text h3 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -.2px; line-height: 1.4; color: var(--text); }
#${APP_NAME}-config-container .settings-section .section-text p { margin: 3px 0 0; max-width: 660px; font-size: 12.5px; line-height: 1.55; color: var(--text-3); }
#${APP_NAME}-config-container .settings-section-body { display: block; }
#${APP_NAME}-config-container .settings-section-body > * + * { margin-top: 10px; }
/* Sections and groups whose rows are all hidden (by build or conditions) disappear. */
#${APP_NAME}-config-container .option-list-wrapper:empty { display: none; }
#${APP_NAME}-config-container .settings-group:not(:has(> :not(.settings-group-title, .option-list-wrapper:empty))) { display: none; }
#${APP_NAME}-config-container .settings-section:not(:has(> .settings-section-body > :not(:empty))) { display: none; }
#${APP_NAME}-config-container .settings-footnote { display: flex; align-items: center; gap: 8px; margin: 20px 2px 0; font-size: 12px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-footnote svg { width: 15px; height: 15px; flex: 0 0 auto; }

/* group card: a plain option list, a titled group, or rows placed straight in a section */
#${APP_NAME}-config-container .settings-section-body > .option-list-wrapper,
#${APP_NAME}-config-container .settings-group,
#${APP_NAME}-config-container .settings-section-body > .setting-row { border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-section-body > .option-list-wrapper, #${APP_NAME}-config-container .settings-group { overflow: hidden; }
#${APP_NAME}-config-container .settings-section-body > .setting-row:has(+ .setting-row) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
#${APP_NAME}-config-container .settings-section-body > .setting-row + .setting-row { border-top-color: var(--line); border-top-left-radius: 0; border-top-right-radius: 0; margin-top: -1px; }
#${APP_NAME}-config-container .settings-group .option-list-wrapper { border: 0; border-radius: 0; background: transparent; }
#${APP_NAME}-config-container .settings-group-title { padding: 12px 16px 2px; font-size: 12px; font-weight: 500; color: var(--text-3); }
#${APP_NAME}-config-container .settings-group > .option-list-wrapper + .option-list-wrapper > .setting-row:first-child,
#${APP_NAME}-config-container .settings-group > * + .option-list-wrapper > .setting-row:first-child { border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-group-title + .option-list-wrapper > .setting-row:first-child { border-top: 0; }
#${APP_NAME}-config-container .settings-group-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 12px 16px; border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-group-foot p { margin: 0; font-size: 12.5px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-group-foot-actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* ---------------------------------------------------------------- rows */
#${APP_NAME}-config-container .setting-row { position: relative; display: block; margin: 0; padding: 12px 16px; min-height: 54px; border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; box-shadow: none; transition: background var(--t-fast); }
#${APP_NAME}-config-container .option-list-wrapper > .setting-row:first-child, #${APP_NAME}-config-container .option-list-wrapper > :first-child > .setting-row:first-child { border-top: 0; }
#${APP_NAME}-config-container .settings-section-body > .setting-row { border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .setting-row-content { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 24px; min-height: 30px; }
#${APP_NAME}-config-container .setting-row.is-stack > .setting-row-content { grid-template-columns: minmax(0, 1fr); }
#${APP_NAME}-config-container .setting-row-content[style*="flex-direction: column"] { grid-template-columns: minmax(0, 1fr); }
/* Reset sits before a control, so ranges and switches share the same right edge. */
#${APP_NAME}-config-container .setting-row.is-inline > .setting-row-content > .setting-row-right > .settings-reset-btn { order: -1; }
#${APP_NAME}-config-container .setting-row.is-stack > .setting-row-content > .setting-row-left { padding-right: 32px; }
#${APP_NAME}-config-container .setting-row.is-stack > .setting-row-content > .setting-row-right { justify-content: flex-start; }
#${APP_NAME}-config-container .setting-row.is-stack > .setting-row-content > .setting-row-right > .settings-reset-btn { position: absolute; top: 12px; right: 12px; }
#${APP_NAME}-config-container .setting-row-left { min-width: 0; }
#${APP_NAME}-config-container .setting-row-right { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; flex-wrap: wrap; }
#${APP_NAME}-config-container .setting-name-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
#${APP_NAME}-config-container .setting-name { min-width: 0; font-size: 13.5px; font-weight: 500; line-height: 1.4; color: var(--text); overflow-wrap: anywhere; }
#${APP_NAME}-config-container .setting-description { margin-top: 2px; max-width: 640px; font-size: 12.5px; line-height: 1.55; color: var(--text-3); overflow-wrap: anywhere; }
#${APP_NAME}-config-container .setting-description a { color: var(--accent-text); }
#${APP_NAME}-config-container .setting-description code { padding: 1px 4px; border-radius: var(--r-xs); background: var(--surface-3); font: 12px var(--mono); }
#${APP_NAME}-config-container .setting-row.is-toggle-row > .setting-row-content > .setting-row-left { cursor: pointer; user-select: none; }
#${APP_NAME}-config-container .option-list-wrapper > .setting-row.is-inline:hover, #${APP_NAME}-config-container .settings-section-body > .setting-row:hover { background: color-mix(in srgb, var(--text) 2.5%, transparent); }
#${APP_NAME}-config-container .setting-row.is-disabled { opacity: .45; }
#${APP_NAME}-config-container .setting-row.is-disabled .setting-row-right { pointer-events: none; }
#${APP_NAME}-config-container .setting-row.is-changed .setting-name, #${APP_NAME}-config-container .settings-linewin-control.is-changed .setting-name { color: var(--accent-text); }
#${APP_NAME}-config-container .settings-reset-btn { display: inline-grid; place-items: center; width: 26px; height: 26px; flex: 0 0 auto; padding: 0; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-3); opacity: 0; pointer-events: none; transition: opacity var(--t-fast), background var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .is-changed .settings-reset-btn, #${APP_NAME}-config-container .is-changed > .settings-reset-btn { opacity: .6; pointer-events: auto; }
#${APP_NAME}-config-container .setting-row:hover .is-changed .settings-reset-btn, #${APP_NAME}-config-container .setting-row.is-changed:hover .settings-reset-btn, #${APP_NAME}-config-container .settings-reset-btn:focus-visible { opacity: 1; }
#${APP_NAME}-config-container .settings-reset-btn:hover { background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-cost-tag { display: inline-flex; align-items: center; flex: 0 0 auto; height: 18px; padding: 0 6px; border-radius: var(--r-xs); background: var(--warn-soft); color: var(--warn); font-size: 11px; font-weight: 600; letter-spacing: .2px; white-space: nowrap; }
#${APP_NAME}-config-container .settings-jump-row { padding: 0 16px 10px; }
#${APP_NAME}-config-container .settings-jump-link { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 0; border: 0; background: none; color: var(--accent-text); font-size: 12px; font-weight: 500; }
#${APP_NAME}-config-container .settings-jump-link:hover { text-decoration: underline; }
#${APP_NAME}-config-container .settings-jump-link svg { width: 13px; height: 13px; }
#${APP_NAME}-config-container [id$="-result-container"] { margin: 0 16px 12px; }
#${APP_NAME}-config-container [id$="-result-container"]:empty { display: none; }

/* notes */
#${APP_NAME}-config-container .settings-note { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface-2); color: var(--text-2); font-size: 12.5px; line-height: 1.6; }
#${APP_NAME}-config-container .settings-note > svg { width: 16px; height: 16px; flex: 0 0 auto; margin-top: 2px; }
#${APP_NAME}-config-container .settings-note.is-info { background: var(--info-soft); border-color: color-mix(in srgb, var(--info) 18%, transparent); color: var(--text); }
#${APP_NAME}-config-container .settings-note.is-info > svg { color: var(--info); }
#${APP_NAME}-config-container .settings-note.is-warn { background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 22%, transparent); color: var(--text); }
#${APP_NAME}-config-container .settings-note.is-warn > svg { color: var(--warn); }
#${APP_NAME}-config-container .settings-note-body { flex: 1; min-width: 0; }
#${APP_NAME}-config-container .settings-note-actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
#${APP_NAME}-config-container .setting-row.settings-note-row { min-height: 0; padding: 10px 14px; }
#${APP_NAME}-config-container .setting-row.settings-note-row .setting-row-content { display: block; }
#${APP_NAME}-config-container .settings-status-box { margin-top: 0; padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface-2); color: var(--text-2); max-width: none; }
#${APP_NAME}-config-container .settings-status-box.is-success { background: var(--ok-soft); border-color: color-mix(in srgb, var(--ok) 26%, transparent); color: var(--text); }
#${APP_NAME}-config-container .settings-status-box.is-warning { background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 30%, transparent); color: var(--text); font-weight: 500; }
#${APP_NAME}-config-container .settings-status-box.is-error { background: var(--danger-soft); border-color: color-mix(in srgb, var(--danger) 30%, transparent); color: var(--text); font-weight: 500; }
#${APP_NAME}-config-container .settings-pill { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; height: 20px; padding: 0 7px; border-radius: var(--r-xs); font-size: 11.5px; font-weight: 500; white-space: nowrap; background: var(--surface-3); color: var(--text-2); }
#${APP_NAME}-config-container .settings-pill.is-ok { background: var(--ok-soft); color: var(--ok); }
#${APP_NAME}-config-container .settings-pill.is-error { background: var(--danger-soft); color: var(--danger); }
#${APP_NAME}-config-container .settings-pill.is-pending { background: var(--surface-3); color: var(--text-3); }
#${APP_NAME}-config-container .settings-pill.is-accent { background: var(--accent-soft); color: var(--accent-text); }

/* ---------------------------------------------------------------- buttons */
#${APP_NAME}-config-container .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; height: auto; padding: 0 12px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text); font-size: 13px; font-weight: 500; line-height: 1.2; text-decoration: none; white-space: nowrap; box-shadow: none; transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .btn:hover:not(:disabled) { background: var(--surface-3); border-color: var(--line-3); }
#${APP_NAME}-config-container .btn:active:not(:disabled) { background: var(--surface-4); }
#${APP_NAME}-config-container .btn:disabled { opacity: .45; }
#${APP_NAME}-config-container .btn svg { width: 15px; height: 15px; flex: 0 0 auto; }
#${APP_NAME}-config-container .btn-primary, #${APP_NAME}-config-container .btn.btn-primary { background: var(--ink); border-color: transparent; color: var(--ink-text); }
#${APP_NAME}-config-container .btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 86%, var(--bg)); border-color: transparent; }
#${APP_NAME}-config-container .btn-sm, #${APP_NAME}-config-container .btn.is-small, #${APP_NAME}-config-container .settings-btn.is-small { min-height: 28px; padding: 0 10px; font-size: 12.5px; }
#${APP_NAME}-config-container .btn.is-copied { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, transparent); background: var(--ok-soft); }

/* ---------------------------------------------------------------- fields */
#${APP_NAME}-config-container input:not([type]), #${APP_NAME}-config-container input[type="text"], #${APP_NAME}-config-container input[type="password"], #${APP_NAME}-config-container input[type="number"], #${APP_NAME}-config-container input[type="url"], #${APP_NAME}-config-container input[type="email"], #${APP_NAME}-config-container input[type="search"]:not(.settings-search-input), #${APP_NAME}-config-container textarea, #${APP_NAME}-config-container .config-text-input {
  height: 32px; padding: 0 10px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text); font-size: 13px; outline: none; box-shadow: none; min-width: 0;
  transition: border-color var(--t-fast), box-shadow var(--t-fast), background var(--t-fast);
}
#${APP_NAME}-config-container textarea { height: auto; min-height: 88px; padding: 8px 10px; font-family: var(--mono); font-size: 12.5px; line-height: 1.55; resize: vertical; }
#${APP_NAME}-config-container input[type="text"]:focus, #${APP_NAME}-config-container input[type="password"]:focus, #${APP_NAME}-config-container input[type="number"]:focus, #${APP_NAME}-config-container input[type="url"]:focus, #${APP_NAME}-config-container input[type="email"]:focus, #${APP_NAME}-config-container textarea:focus, #${APP_NAME}-config-container .config-text-input:focus {
  border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); background: var(--surface);
}
#${APP_NAME}-config-container input::placeholder, #${APP_NAME}-config-container textarea::placeholder { color: var(--text-4); }
#${APP_NAME}-config-container .settings-search .settings-search-input, #${APP_NAME}-config-container .settings-search .settings-search-input:focus { height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
#${APP_NAME}-config-container .config-text-input { width: 280px; max-width: 100%; }
#${APP_NAME}-config-container .settings-port-input { width: 96px; text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container input[type="checkbox"]:not([role="switch"]) { width: 16px; height: 16px; accent-color: var(--accent); }

/* select */
#${APP_NAME}-config-container .settings-select { position: relative; display: inline-flex; align-items: center; min-width: 180px; max-width: 280px; }
#${APP_NAME}-config-container .settings-select.is-compact { min-width: 0; width: 100%; max-width: none; }
#${APP_NAME}-config-container .settings-select select, #${APP_NAME}-config-container select.config-select, #${APP_NAME}-config-container .ai-addon-setting select, #${APP_NAME}-config-container .ai-addon-input-group select { width: 100%; height: 32px; padding: 0 30px 0 10px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text); font-size: 13px; font-weight: 500; -webkit-appearance: none; appearance: none; cursor: pointer; text-overflow: ellipsis; transition: border-color var(--t-fast), background var(--t-fast); }
#${APP_NAME}-config-container .settings-select.is-compact select { height: 30px; font-size: 12.5px; padding-left: 8px; padding-right: 26px; }
#${APP_NAME}-config-container .settings-select select:hover { border-color: var(--line-3); background: var(--surface-3); }
#${APP_NAME}-config-container .settings-select select:focus-visible { border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); }
#${APP_NAME}-config-container .settings-select select option, #${APP_NAME}-config-container select option { background: var(--surface); color: var(--text); }
#${APP_NAME}-config-container .settings-select-chevron { position: absolute; right: 9px; top: 50%; width: 14px; height: 14px; margin-top: -7px; color: var(--text-3); pointer-events: none; }
#${APP_NAME}-config-container .ai-addon-setting select, #${APP_NAME}-config-container .ai-addon-input-group select { background-image: linear-gradient(45deg, transparent 50%, var(--text-3) 50%), linear-gradient(135deg, var(--text-3) 50%, transparent 50%); background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
#${APP_NAME}-config-container .settings-select.is-disabled { opacity: .45; pointer-events: none; }

/* ---------------------------------------------------------------- switch */
#${APP_NAME}-config-container .switch-checkbox { position: relative; display: inline-flex; flex: 0 0 auto; width: 36px; height: 20px; min-width: 36px; margin: 0; padding: 0; border: 0; border-radius: 999px; background: var(--switch-off); color: transparent; box-shadow: none; overflow: visible; transition: background var(--t) var(--ease); }
#${APP_NAME}-config-container .switch-checkbox svg { display: none; }
#${APP_NAME}-config-container .switch-checkbox::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .3); transition: transform var(--t) var(--ease-out); }
#${APP_NAME}-config-container .switch-checkbox::before { content: ""; position: absolute; inset: -8px; }
#${APP_NAME}-config-container .switch-checkbox.active, #${APP_NAME}-config-container .switch-checkbox[aria-checked="true"] { background: var(--accent); }
#${APP_NAME}-config-container .switch-checkbox.active::after, #${APP_NAME}-config-container .switch-checkbox[aria-checked="true"]::after { transform: translateX(16px); }
#${APP_NAME}-config-container .switch-checkbox:hover:not(:disabled) { background: color-mix(in srgb, var(--switch-off) 85%, var(--text)); }
#${APP_NAME}-config-container .switch-checkbox.active:hover:not(:disabled), #${APP_NAME}-config-container .switch-checkbox[aria-checked="true"]:hover:not(:disabled) { background: var(--accent-hover); }
#${APP_NAME}-config-container .switch-checkbox:disabled { opacity: .45; }
#${APP_NAME}-config-container .switch-checkbox:focus-visible { box-shadow: var(--focus); }

/* provider switches: a real checkbox inside a label */
#${APP_NAME}-config-container .lyrics-provider-toggle { position: relative; display: inline-flex; flex: 0 0 auto; width: 30px; height: 18px; margin: 0; }
#${APP_NAME}-config-container .lyrics-provider-toggle input { position: absolute; inset: -6px; z-index: 2; width: calc(100% + 12px); height: calc(100% + 12px); margin: 0; opacity: 0; cursor: pointer; }
#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider { position: absolute; inset: 0; border-radius: 999px; background: var(--switch-off); transition: background var(--t) var(--ease); }
#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider::before { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .3); transition: transform var(--t) var(--ease-out); }
#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider { background: var(--accent); }
#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider::before { transform: translateX(12px); }
#${APP_NAME}-config-container .lyrics-provider-toggle input:focus-visible + .toggle-slider { box-shadow: var(--focus); }

/* ---------------------------------------------------------------- segmented */
#${APP_NAME}-config-container .settings-seg { --count: 2; --index: 0; position: relative; display: grid; grid-template-columns: repeat(var(--count), minmax(0, 1fr)); min-width: 0; padding: 2px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--line-2); isolation: isolate; }
#${APP_NAME}-config-container .setting-row-right > .settings-seg { width: calc(var(--count) * 92px); max-width: 380px; }
#${APP_NAME}-config-container .settings-seg-thumb { position: absolute; z-index: 0; top: 2px; bottom: 2px; left: 2px; width: calc((100% - 4px) / var(--count)); transform: translateX(calc(100% * var(--index))); border-radius: var(--r-sm); background: var(--raise); box-shadow: var(--shadow-1), 0 0 0 1px var(--line-2); transition: transform var(--t) var(--ease-out); pointer-events: none; }
#${APP_NAME}-config-container .settings-seg-thumb.is-empty { opacity: 0; }
#${APP_NAME}-config-container .settings-seg-option { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; min-height: 28px; margin: 0; padding: 3px 10px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-3); font-size: 12.5px; font-weight: 500; line-height: 1.25; text-align: center; user-select: none; transition: color var(--t-fast); }
#${APP_NAME}-config-container .settings-seg-option:hover:not(:disabled) { color: var(--text-2); background: transparent; }
#${APP_NAME}-config-container .settings-seg-option.is-on, #${APP_NAME}-config-container .settings-seg-option[aria-checked="true"] { color: var(--text); }
#${APP_NAME}-config-container .settings-seg-option svg { width: 15px; height: 15px; flex: 0 0 auto; }
#${APP_NAME}-config-container .settings-seg-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${APP_NAME}-config-container .settings-seg-swatch { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 2px; background: var(--swatch); }
#${APP_NAME}-config-container .settings-seg.is-compact .settings-seg-option { min-height: 24px; padding: 2px 8px; font-size: 12px; }
#${APP_NAME}-config-container .settings-seg[aria-disabled="true"] { opacity: .45; }

/* ---------------------------------------------------------------- radio cards */
#${APP_NAME}-config-container .settings-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); gap: 10px; width: 100%; }
#${APP_NAME}-config-container .settings-card-opt { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; margin: 0; padding: 12px; border-radius: var(--r-md); border: 1px solid var(--line-2); background: var(--surface); color: var(--text); text-align: left; user-select: none; transition: border-color var(--t-fast), background var(--t-fast), box-shadow var(--t-fast); }
#${APP_NAME}-config-container .settings-card-opt:hover:not(:disabled) { border-color: var(--line-3); background: var(--surface-2); }
#${APP_NAME}-config-container .settings-card-opt.is-on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--surface); }
#${APP_NAME}-config-container .settings-card-opt.is-on:focus-visible { box-shadow: inset 0 0 0 1px var(--accent), var(--focus); }
#${APP_NAME}-config-container .settings-card-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 500; }
#${APP_NAME}-config-container .settings-card-label { min-width: 0; }
#${APP_NAME}-config-container .settings-card-check { display: grid; place-items: center; width: 16px; height: 16px; flex: 0 0 auto; border-radius: 50%; border: 1px solid var(--line-3); color: var(--accent-ink); transition: background var(--t-fast), border-color var(--t-fast); }
#${APP_NAME}-config-container .settings-card-check svg { width: 10px; height: 10px; opacity: 0; stroke-width: 2.4; }
#${APP_NAME}-config-container .settings-card-opt.is-on .settings-card-check { background: var(--accent); border-color: var(--accent); }
#${APP_NAME}-config-container .settings-card-opt.is-on .settings-card-check svg { opacity: 1; }
#${APP_NAME}-config-container .settings-card-desc { font-size: 12px; line-height: 1.55; color: var(--text-3); }
#${APP_NAME}-config-container .settings-card-opt.is-plain { justify-content: center; }

/* CD visualizer shape tiles: nine schematics laid out as 3x3, 5+4 or one row,
   so a single tile never dangles on its own line. */
#${APP_NAME}-config-container .setting-row-right:has(> .settings-cd-style-cards),
#${APP_NAME}-config-container .setting-row-right:has(> .settings-cd-color-cards) { container-type: inline-size; }
#${APP_NAME}-config-container .settings-cards.settings-cd-style-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@container (min-width: 480px) { #${APP_NAME}-config-container .settings-cards.settings-cd-style-cards { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@container (min-width: 900px) { #${APP_NAME}-config-container .settings-cards.settings-cd-style-cards { grid-template-columns: repeat(9, minmax(0, 1fr)); } }
#${APP_NAME}-config-container .settings-cd-style-cards .settings-card-opt { align-items: center; gap: 6px; padding: 10px 6px 9px; }
#${APP_NAME}-config-container .settings-cd-style-cards .settings-card-title { justify-content: center; min-width: 0; max-width: 100%; text-align: center; font-size: 12.5px; }
#${APP_NAME}-config-container .settings-cd-style-cards .settings-card-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${APP_NAME}-config-container .settings-cd-style-cards .settings-card-check { position: absolute; top: 6px; right: 6px; width: 14px; height: 14px; }
#${APP_NAME}-config-container .settings-cd-style-thumb { flex: 0 0 auto; width: 48px; height: 48px; color: var(--text-3); transition: color var(--t-fast); }
#${APP_NAME}-config-container .settings-cd-style-cards .settings-card-opt:hover:not(:disabled) .settings-cd-style-thumb { color: var(--text-2); }
#${APP_NAME}-config-container .settings-cd-style-cards .settings-card-opt.is-on .settings-cd-style-thumb { color: var(--accent); }
#${APP_NAME}-config-container .settings-cards.settings-cd-color-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@container (min-width: 540px) { #${APP_NAME}-config-container .settings-cards.settings-cd-color-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
#${APP_NAME}-config-container .settings-cd-color-swatch { display: block; height: 6px; border-radius: 3px; box-shadow: inset 0 0 0 1px var(--line-2); }

/* background modes */
#${APP_NAME}-config-container .settings-mode-grid, #${APP_NAME}-config-container .settings-mode-grid.settings-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
#${APP_NAME}-config-container .settings-section-body > .settings-mode-grid { padding: 10px; border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--surface); }
#${APP_NAME}-config-container .settings-mode-visual { position: relative; display: block; height: 64px; margin-bottom: 4px; overflow: hidden; border-radius: var(--r-sm); background: var(--surface-3); }
#${APP_NAME}-config-container .settings-mode-visual.vis-none::after { content: ""; position: absolute; left: 12px; right: 32%; top: 22px; height: 6px; border-radius: 3px; background: var(--text-4); box-shadow: 0 12px 0 -1px var(--line-3); }
#${APP_NAME}-config-container .settings-mode-visual.vis-colorful { background: radial-gradient(circle at 22% 30%, #c8925a, transparent 48%), radial-gradient(circle at 80% 24%, #4f8a86, transparent 48%), radial-gradient(circle at 60% 94%, #5d7396, transparent 54%), #1c2328; }
#${APP_NAME}-config-container .settings-mode-visual.vis-gradient-background { background: linear-gradient(140deg, #c8925a 0%, #8c8160 34%, #4d7472 64%, #1e2a31 100%); }
#${APP_NAME}-config-container .settings-mode-visual.vis-blur-gradient-background { background: radial-gradient(circle at 30% 40%, rgba(200, 146, 90, .8), transparent 60%), radial-gradient(circle at 75% 65%, rgba(77, 132, 128, .85), transparent 60%), #182026; }
#${APP_NAME}-config-container .settings-mode-visual.vis-solid-background { background: var(--solid, #1e3a8a); }
#${APP_NAME}-config-container .settings-mode-visual.vis-video-background { background: repeating-linear-gradient(90deg, #17181c 0 12px, #1d1f25 12px 24px); }
#${APP_NAME}-config-container .settings-mode-visual.vis-video-background::after { content: ""; position: absolute; left: 50%; top: 50%; width: 0; height: 0; margin: -8px 0 0 -5px; border-left: 13px solid rgba(255, 255, 255, .85); border-top: 8px solid transparent; border-bottom: 8px solid transparent; }

/* ---------------------------------------------------------------- range */
#${APP_NAME}-config-container .settings-range { display: flex; align-items: center; gap: 12px; width: 320px; max-width: 100%; }
#${APP_NAME}-config-container .settings-range.disabled { opacity: .45; pointer-events: none; }
#${APP_NAME}-config-container .settings-range-track { position: relative; flex: 1; min-width: 80px; height: 24px; display: flex; align-items: center; }
#${APP_NAME}-config-container .config-slider { position: relative; z-index: 2; width: 100%; height: 24px; margin: 0; padding: 0; border: 0; background: transparent; -webkit-appearance: none; appearance: none; cursor: pointer; --progress-percent: 0%; }
#${APP_NAME}-config-container .config-slider:focus-visible { box-shadow: none; }
#${APP_NAME}-config-container .config-slider::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(90deg, var(--accent) 0 var(--progress-percent), var(--surface-4) var(--progress-percent) 100%); }
#${APP_NAME}-config-container .config-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; border: 0; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, .14), 0 1px 3px rgba(0, 0, 0, .3); transition: transform var(--t-fast); }
#${APP_NAME}-config-container .config-slider:active::-webkit-slider-thumb { transform: scale(1.1); }
#${APP_NAME}-config-container .config-slider:focus-visible::-webkit-slider-thumb { box-shadow: var(--focus); }
#${APP_NAME}-config-container .config-slider:disabled { cursor: not-allowed; opacity: .5; }
#${APP_NAME}-config-container .settings-range-default { position: absolute; z-index: 1; top: 50%; left: calc(8px + (100% - 16px) * var(--default-percent, 0) / 100); width: 2px; height: 10px; margin: -5px 0 0 -1px; border-radius: 1px; background: var(--text-4); pointer-events: none; }
#${APP_NAME}-config-container .slider-container:not(.settings-range) { display: flex; align-items: center; gap: 12px; width: min(390px, 100%); }
#${APP_NAME}-config-container .settings-value-chip { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto; height: 30px; margin: 0; padding: 0 8px 0 4px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); font-variant-numeric: tabular-nums; cursor: text; transition: border-color var(--t-fast), box-shadow var(--t-fast); }
#${APP_NAME}-config-container .settings-value-chip:focus-within { border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); background: var(--surface); }
#${APP_NAME}-config-container .settings-value-chip.is-disabled { opacity: .45; pointer-events: none; }
#${APP_NAME}-config-container .settings-value-chip .settings-value-input, #${APP_NAME}-config-container input.settings-value-input { width: 48px; height: 26px; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; text-align: right; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; outline: none; }
#${APP_NAME}-config-container .settings-value-chip .settings-value-input:focus { box-shadow: none; background: transparent; }
#${APP_NAME}-config-container .settings-unit { font-size: 11.5px; color: var(--text-3); white-space: nowrap; }
#${APP_NAME}-config-container .settings-weight { gap: 12px; }
#${APP_NAME}-config-container .settings-weight-sample { width: 28px; flex: 0 0 auto; text-align: center; font-size: 19px; line-height: 1; color: var(--text); }
#${APP_NAME}-config-container .settings-weight-name { width: 86px; flex: 0 0 auto; font-size: 12px; color: var(--text-3); white-space: nowrap; text-align: right; }
#${APP_NAME}-config-container .settings-presets { display: flex; flex-wrap: wrap; gap: 6px; }
#${APP_NAME}-config-container .settings-preset-btn { min-width: 40px; height: 28px; padding: 0 10px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: transparent; color: var(--text-2); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast); }
#${APP_NAME}-config-container .settings-preset-btn:hover:not(:disabled) { color: var(--text); background: var(--surface-2); }
#${APP_NAME}-config-container .settings-preset-btn.is-on { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent-text); }
#${APP_NAME}-config-container .settings-fps { display: grid; gap: 10px; width: 100%; }
#${APP_NAME}-config-container .settings-fps-top { display: flex; align-items: center; gap: 14px; }
#${APP_NAME}-config-container .settings-fps-top > .settings-range { flex: 1; width: auto; }
#${APP_NAME}-config-container .settings-fps-value { min-width: 92px; font-size: 24px; font-weight: 600; letter-spacing: -.6px; font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container .settings-fps-value small { margin-left: 4px; font-size: 12px; font-weight: 500; letter-spacing: 0; color: var(--text-3); }

/* stepper */
#${APP_NAME}-config-container .settings-stepper { display: inline-flex; align-items: center; flex: 0 0 auto; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); overflow: hidden; }
#${APP_NAME}-config-container .settings-stepper-btn { display: grid; place-items: center; width: 32px; height: 30px; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--text-2); transition: background var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-stepper-btn:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-stepper-btn:disabled { opacity: .35; }
#${APP_NAME}-config-container .settings-stepper-btn svg { width: 15px; height: 15px; }
#${APP_NAME}-config-container .settings-stepper-value { display: grid; place-items: center; min-width: 52px; height: 30px; padding: 0 8px; border-left: 1px solid var(--line); border-right: 1px solid var(--line); font-weight: 500; font-variant-numeric: tabular-nums; }

/* compact draggable number (lyric-layer table) */
#${APP_NAME}-config-container .settings-scrub { position: relative; display: flex; align-items: center; width: 100%; height: 30px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); overflow: hidden; cursor: ew-resize; touch-action: none; transition: border-color var(--t-fast), box-shadow var(--t-fast); }
#${APP_NAME}-config-container .settings-scrub:hover { border-color: var(--line-3); }
#${APP_NAME}-config-container .settings-scrub:focus-within, #${APP_NAME}-config-container .settings-scrub.is-dragging { border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); }
#${APP_NAME}-config-container .settings-scrub.is-disabled { opacity: .45; pointer-events: none; }
#${APP_NAME}-config-container .settings-scrub-bar { position: absolute; left: 0; top: 0; bottom: 0; width: var(--scrub-percent, 0%); background: color-mix(in srgb, var(--text) 7%, transparent); pointer-events: none; transition: width 60ms linear, background var(--t-fast); }
#${APP_NAME}-config-container .settings-scrub.is-dragging .settings-scrub-bar, #${APP_NAME}-config-container .settings-scrub:focus-within .settings-scrub-bar { background: color-mix(in srgb, var(--accent) 18%, transparent); }
#${APP_NAME}-config-container .settings-scrub .settings-scrub-input { position: relative; z-index: 1; width: 100%; height: 100%; padding: 0 30px 0 9px; border: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 12.5px; font-weight: 500; font-variant-numeric: tabular-nums; outline: none; cursor: ew-resize; }
#${APP_NAME}-config-container .settings-scrub .settings-scrub-input:focus { cursor: text; background: transparent; box-shadow: none; }
#${APP_NAME}-config-container .settings-scrub-tail { position: absolute; z-index: 1; right: 8px; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--text-3); pointer-events: none; }
#${APP_NAME}-config-container .settings-scrub.is-weight .settings-scrub-input { padding-right: 9px; }
#${APP_NAME}-config-container .settings-scrub.is-weight .settings-scrub-tail { display: none; }
@container (min-width: 140px) { #${APP_NAME}-config-container .settings-scrub.is-weight .settings-scrub-tail { display: block; } #${APP_NAME}-config-container .settings-scrub.is-weight .settings-scrub-input { padding-right: 64px; } }


/* ---------------------------------------------------------------- font */
#${APP_NAME}-config-container .config-font-selector { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
#${APP_NAME}-config-container .config-font-mode { display: inline-grid; grid-auto-flow: column; padding: 2px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--line-2); }
#${APP_NAME}-config-container .config-font-mode-button { min-height: 26px; padding: 0 10px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-3); font-size: 12px; font-weight: 500; white-space: nowrap; }
#${APP_NAME}-config-container .config-font-mode-button:hover:not(:disabled) { color: var(--text-2); }
#${APP_NAME}-config-container .config-font-mode-button.active { background: var(--raise); color: var(--text); box-shadow: var(--shadow-1), 0 0 0 1px var(--line-2); }
#${APP_NAME}-config-container .config-font-field { position: relative; display: inline-flex; align-items: center; min-width: 200px; max-width: 280px; }
#${APP_NAME}-config-container .config-font-selector-control { width: 100%; }
#${APP_NAME}-config-container select.config-font-selector-control { padding-right: 30px; }
#${APP_NAME}-config-container .config-font-field .settings-select-chevron { right: 9px; }
#${APP_NAME}-config-container .settings-font-input { width: 100%; height: 30px; font-size: 12.5px; }
#${APP_NAME}-config-container .font-preview { color: var(--text); }

/* ---------------------------------------------------------------- color */
#${APP_NAME}-config-container .config-color-control { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 4px 0 5px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); transition: border-color var(--t-fast), box-shadow var(--t-fast); }
#${APP_NAME}-config-container .config-color-control:hover { border-color: var(--line-3); }
#${APP_NAME}-config-container .config-color-control:focus-within { border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); }
#${APP_NAME}-config-container .config-color-control.invalid { border-color: color-mix(in srgb, var(--danger) 60%, transparent); }
#${APP_NAME}-config-container .config-color-swatch { position: relative; display: block; flex: 0 0 auto; width: 20px; height: 20px; border-radius: var(--r-xs); background: var(--swatch-color, transparent); box-shadow: inset 0 0 0 1px rgba(128, 128, 128, .35); overflow: hidden; }
#${APP_NAME}-config-container .config-color-swatch .config-color-picker { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); margin: 0; padding: 0; border: 0; opacity: 0; cursor: pointer; }
#${APP_NAME}-config-container .config-color-control .config-color-input, #${APP_NAME}-config-container .config-color-control .config-color-input:focus { width: 76px; height: 26px; padding: 0 4px; border: 0; border-radius: 0; background: transparent; box-shadow: none; font-family: var(--mono); font-size: 12px; color: var(--text-2); text-transform: lowercase; }
#${APP_NAME}-config-container .color-picker-container { display: inline-flex; align-items: center; }
#${APP_NAME}-config-container .settings-matrix-cell .config-color-control { width: 100%; height: 30px; }
#${APP_NAME}-config-container .settings-matrix-cell .config-color-control .config-color-input { width: 100%; min-width: 0; font-size: 11px; }

#${APP_NAME}-config-container .color-preset-selector { display: grid; gap: 10px; width: 100%; }
#${APP_NAME}-config-container .color-preset-summary { display: flex; align-items: center; gap: 10px; min-width: 0; }
#${APP_NAME}-config-container .color-preset-meta { display: grid; min-width: 0; }
#${APP_NAME}-config-container .color-preset-name { font-size: 13px; font-weight: 500; }
#${APP_NAME}-config-container .color-preset-code { font: 11.5px var(--mono); color: var(--text-3); }
#${APP_NAME}-config-container .color-preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 6px; max-width: 520px; }
#${APP_NAME}-config-container .color-preset-grid-item { position: relative; aspect-ratio: 1; min-height: 30px; padding: 0; border: 0; border-radius: var(--r-xs); background: var(--c, transparent); box-shadow: inset 0 0 0 1px rgba(128, 128, 128, .3); }
#${APP_NAME}-config-container .color-preset-grid-item.active, #${APP_NAME}-config-container .color-preset-grid-item[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--accent); }
#${APP_NAME}-config-container .color-preset-swatch { display: inline-block; width: 22px; height: 22px; flex: 0 0 auto; border-radius: var(--r-xs); box-shadow: inset 0 0 0 1px rgba(128, 128, 128, .3); }
#${APP_NAME}-config-container .color-preset-toggle-btn { margin-left: auto; }

/* multi-vocal (speaker) colours */
#${APP_NAME}-config-container .multi-vocal-color-settings { width: 100%; }
#${APP_NAME}-config-container .multi-vocal-color-setting-row .setting-row-content, #${APP_NAME}-config-container .multi-vocal-color-content { display: block; }
#${APP_NAME}-config-container .multi-vocal-color-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
#${APP_NAME}-config-container .multi-vocal-color-copy { min-width: 0; }
#${APP_NAME}-config-container .multi-vocal-color-groups { display: grid; gap: 12px; margin-top: 14px; }
#${APP_NAME}-config-container .multi-vocal-color-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); align-items: center; gap: 6px 10px; }
#${APP_NAME}-config-container .multi-vocal-color-group-title { grid-column: 1 / -1; font-size: 12.5px; font-weight: 500; color: var(--text-2); }
#${APP_NAME}-config-container .multi-vocal-color-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; min-height: 40px; padding: 4px 6px 4px 10px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface-2); }
#${APP_NAME}-config-container .multi-vocal-color-speaker { min-width: 0; font-size: 12px; color: var(--text-2); overflow-wrap: anywhere; }
#${APP_NAME}-config-container .multi-vocal-color-row .config-color-control { flex: 0 0 auto; height: 30px; background: var(--surface); }
#${APP_NAME}-config-container .multi-vocal-color-row .config-color-input { width: 68px; font-size: 11.5px; }

/* ---------------------------------------------------------------- hotkeys */
#${APP_NAME}-config-container .config-hotkey-control { display: inline-flex; align-items: center; gap: 6px; }
#${APP_NAME}-config-container .config-hotkey-recorder { display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 150px; height: 32px; padding: 0 8px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text); font-size: 12.5px; font-weight: 500; transition: border-color var(--t-fast), box-shadow var(--t-fast); }
#${APP_NAME}-config-container .config-hotkey-recorder:hover { border-color: var(--line-3); }
#${APP_NAME}-config-container .config-hotkey-recorder.recording { border-color: var(--accent-line); box-shadow: 0 0 0 3px var(--accent-soft); color: var(--accent-text); }
#${APP_NAME}-config-container .config-hotkey-keycaps { display: inline-flex; align-items: center; gap: 4px; }
#${APP_NAME}-config-container .config-hotkey-keycap { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 20px; padding: 0 5px; border-radius: var(--r-xs); border: 1px solid var(--line-2); background: var(--surface); color: var(--text); font: 500 11.5px/1 var(--font); }
#${APP_NAME}-config-container .config-hotkey-empty { color: var(--text-3); font-weight: 400; }
#${APP_NAME}-config-container .config-hotkey-edit-label { color: var(--text-3); font-size: 11.5px; font-weight: 400; }
#${APP_NAME}-config-container .config-hotkey-recording-state { display: inline-flex; align-items: center; gap: 6px; }
#${APP_NAME}-config-container .config-hotkey-recording-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: settings-blink 1s steps(2, start) infinite; }
@keyframes settings-blink { to { visibility: hidden; } }
#${APP_NAME}-config-container .config-hotkey-clear { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-3); }
#${APP_NAME}-config-container .config-hotkey-clear:hover { background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-hotkey-table { display: grid; grid-template-columns: minmax(0, 1fr) 190px 190px; }
#${APP_NAME}-config-container .settings-hotkey-table > div { display: flex; align-items: center; min-width: 0; padding: 8px 16px; border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-hotkey-head { border-top: 0 !important; padding-top: 10px !important; padding-bottom: 6px !important; font-size: 12px; font-weight: 500; color: var(--text-3); }
#${APP_NAME}-config-container .settings-hotkey-label { font-size: 13px; font-weight: 500; }
#${APP_NAME}-config-container .settings-hotkey-cell .setting-row { display: contents; }
#${APP_NAME}-config-container .settings-hotkey-cell .setting-row-content { display: block; width: 100%; min-height: 0; }
#${APP_NAME}-config-container .settings-hotkey-cell.is-changed .config-hotkey-recorder { color: var(--accent-text); border-color: var(--accent-line); }
#${APP_NAME}-config-container .settings-hotkey-cell .setting-row-left { display: none; }
#${APP_NAME}-config-container .settings-hotkey-cell .setting-row-right, #${APP_NAME}-config-container .settings-hotkey-cell .config-hotkey-control { width: 100%; }
#${APP_NAME}-config-container .settings-hotkey-cell .config-hotkey-recorder { flex: 1; min-width: 0; }
#${APP_NAME}-config-container .settings-hotkey-cell.is-changed .config-hotkey-recorder { border-color: var(--line-3); }

/* ---------------------------------------------------------------- karaoke fill curve */
#${APP_NAME}-config-container .karaoke-fill-curve-row .setting-row-content { grid-template-columns: minmax(0, 1fr); }
#${APP_NAME}-config-container .karaoke-fill-curve-control { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; justify-content: flex-start; }
#${APP_NAME}-config-container .karaoke-fill-curve-graph { width: 260px; max-width: 100%; height: auto; min-height: 150px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface-2); touch-action: none; user-select: none; }
#${APP_NAME}-config-container .karaoke-fill-curve-grid-line { stroke: var(--line-2); stroke-width: 1; }
#${APP_NAME}-config-container .karaoke-fill-curve-default-path { fill: none; stroke: var(--line-3); stroke-width: 1.5; stroke-dasharray: 4 4; }
#${APP_NAME}-config-container .karaoke-fill-curve-path { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
#${APP_NAME}-config-container .karaoke-fill-curve-point { cursor: ns-resize; }
#${APP_NAME}-config-container .karaoke-fill-curve-point.is-fixed { cursor: default; }
#${APP_NAME}-config-container .karaoke-fill-curve-point circle { fill: var(--surface); stroke: var(--accent); stroke-width: 2; }
#${APP_NAME}-config-container .karaoke-fill-curve-point.is-fixed circle { fill: var(--text-4); stroke: none; }
#${APP_NAME}-config-container .karaoke-fill-curve-point:focus-visible circle { stroke-width: 3.5; }
#${APP_NAME}-config-container .karaoke-fill-curve-point text { fill: var(--text-2); font-size: 10px; font-weight: 600; text-anchor: middle; paint-order: stroke; stroke: var(--surface-2); stroke-width: 3px; pointer-events: none; }

/* ---------------------------------------------------------------- interlude icon gallery (app markup + style.css) */
#${APP_NAME}-config-container .instrumental-break-picker-row .setting-row-content { grid-template-columns: minmax(0, 1fr); }
#${APP_NAME}-config-container .instrumental-break-picker-control { display: block; width: 100%; }
#${APP_NAME}-config-container .instrumental-break-selected-preview { display: none; }
#${APP_NAME}-config-container .instrumental-break-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; width: 100%; }
#${APP_NAME}-config-container .instrumental-break-preview-option { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; margin: 0; padding: 12px 6px 9px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface-2); color: var(--text-2); user-select: none; transition: border-color var(--t-fast), background var(--t-fast); }
#${APP_NAME}-config-container .instrumental-break-preview-option:hover:not(:disabled) { border-color: var(--line-3); background: var(--surface-2); }
#${APP_NAME}-config-container .instrumental-break-preview-option.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--surface); color: var(--text); }
#${APP_NAME}-config-container .instrumental-break-preview-option.active:focus-visible { box-shadow: inset 0 0 0 1px var(--accent), var(--focus); }
#${APP_NAME}-config-container .instrumental-break-option-stage { display: grid; place-items: center; width: 34px; height: 34px; font-size: 24px; line-height: 1; color: inherit; pointer-events: none; }
#${APP_NAME}-config-container .instrumental-break-option-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 1.3; text-align: center; }
/* the grid stands still; the chosen design and the one being inspected move */
#${APP_NAME}-config-container .instrumental-break-preview-grid .lyrics-break-icon, #${APP_NAME}-config-container .instrumental-break-preview-grid .lyrics-break-icon *, #${APP_NAME}-config-container .instrumental-break-preview-grid .lyrics-break-icon::before, #${APP_NAME}-config-container .instrumental-break-preview-grid .lyrics-break-icon::after, #${APP_NAME}-config-container .instrumental-break-preview-grid .lyrics-break-icon *::before, #${APP_NAME}-config-container .instrumental-break-preview-grid .lyrics-break-icon *::after { animation-play-state: paused; }
#${APP_NAME}-config-container .instrumental-break-preview-option:is(.active, :hover, :focus-visible) .lyrics-break-icon, #${APP_NAME}-config-container .instrumental-break-preview-option:is(.active, :hover, :focus-visible) .lyrics-break-icon *, #${APP_NAME}-config-container .instrumental-break-preview-option:is(.active, :hover, :focus-visible) .lyrics-break-icon::before, #${APP_NAME}-config-container .instrumental-break-preview-option:is(.active, :hover, :focus-visible) .lyrics-break-icon::after, #${APP_NAME}-config-container .instrumental-break-preview-option:is(.active, :hover, :focus-visible) .lyrics-break-icon *::before, #${APP_NAME}-config-container .instrumental-break-preview-option:is(.active, :hover, :focus-visible) .lyrics-break-icon *::after { animation-play-state: running; }

/* ---------------------------------------------------------------- fullscreen presentation */
#${APP_NAME}-config-container .fullscreen-presentation-picker { display: grid; gap: 10px; width: 100%; }
#${APP_NAME}-config-container .fullscreen-presentation-picker-heading { display: grid; gap: 2px; font-size: 12.5px; line-height: 1.55; color: var(--text-3); }
#${APP_NAME}-config-container .fullscreen-presentation-picker-heading strong { font-size: 13.5px; font-weight: 500; line-height: 1.4; color: var(--text); }
#${APP_NAME}-config-container .fullscreen-presentation-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
#${APP_NAME}-config-container .fullscreen-presentation-grid .settings-choice-card { display: flex; flex-direction: column; align-items: stretch; gap: 10px; min-width: 0; margin: 0; padding: 14px; border: 1px solid var(--line-2); border-radius: var(--r-md); background: var(--surface); color: var(--text); text-align: left; transition: background var(--t-fast), border-color var(--t-fast); }
#${APP_NAME}-config-container .fullscreen-presentation-grid .settings-choice-card:hover { background: var(--surface-2); border-color: var(--line-3); }
#${APP_NAME}-config-container .fullscreen-presentation-grid .settings-choice-card.active { border-color: var(--accent-line); background: var(--accent-soft); }
#${APP_NAME}-config-container .fullscreen-presentation-grid .settings-choice-icon { display: flex; color: var(--text-2); }
#${APP_NAME}-config-container .fullscreen-presentation-grid .active .settings-choice-icon { color: var(--accent-text); }
#${APP_NAME}-config-container .fullscreen-presentation-grid .settings-choice-content { display: grid; gap: 4px; }
#${APP_NAME}-config-container .fullscreen-presentation-grid .settings-choice-content strong { font-size: 13px; line-height: 1.4; font-weight: 500; }
#${APP_NAME}-config-container .fullscreen-presentation-grid .settings-choice-content span { font-size: 12px; line-height: 1.55; color: var(--text-3); overflow-wrap: anywhere; }

/* ---------------------------------------------------------------- line window */
#${APP_NAME}-config-container .settings-linewin { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: center; padding: 14px 16px; }
#${APP_NAME}-config-container .settings-linewin-visual { display: flex; flex-direction: column; justify-content: center; gap: 5px; min-height: 140px; padding: 12px 14px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-linewin-line { width: var(--w, 70%); height: 6px; border-radius: 3px; background: var(--line-3); opacity: var(--o, .5); transition: height var(--t) var(--ease-out), opacity var(--t), margin var(--t); }
#${APP_NAME}-config-container .settings-linewin-line.is-active { height: 10px; background: var(--text); opacity: 1; }
#${APP_NAME}-config-container .settings-linewin-line.is-hidden { height: 0; margin: -2.5px 0; opacity: 0; }
#${APP_NAME}-config-container .settings-linewin-controls { display: grid; gap: 12px; }
#${APP_NAME}-config-container .settings-linewin-control { display: flex; align-items: center; justify-content: space-between; gap: 14px; font-size: 12.5px; font-weight: 500; color: var(--text-2); white-space: nowrap; }
#${APP_NAME}-config-container .settings-linewin-control .setting-name { font-size: 12.5px; color: var(--text-2); }

/* ---------------------------------------------------------------- tiles */
#${APP_NAME}-config-container .settings-tiles-stack { display: grid; gap: 10px; }
#${APP_NAME}-config-container .settings-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
#${APP_NAME}-config-container .settings-tile { position: relative; display: flex; flex-direction: column; gap: 10px; min-height: 84px; margin: 0; padding: 12px; border-radius: var(--r-md); border: 1px solid var(--line-2); background: var(--surface); color: var(--text); text-align: left; transition: border-color var(--t-fast), background var(--t-fast); }
#${APP_NAME}-config-container .settings-tile:hover:not(:disabled) { border-color: var(--line-3); background: var(--surface); }
#${APP_NAME}-config-container .settings-tile.is-on { border-color: var(--accent-line); box-shadow: inset 0 0 0 1px var(--accent-line); }
#${APP_NAME}-config-container .settings-tile.is-on:focus-visible { box-shadow: inset 0 0 0 1px var(--accent-line), var(--focus); }
#${APP_NAME}-config-container .settings-tile-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#${APP_NAME}-config-container .settings-tile-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--r-sm); background: var(--surface-3); color: var(--text-3); transition: background var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-tile.is-on .settings-tile-icon { background: var(--accent); color: var(--accent-ink); }
#${APP_NAME}-config-container .settings-tile-icon svg { width: 16px; height: 16px; }
#${APP_NAME}-config-container .settings-tile-state { font-size: 11.5px; font-weight: 500; color: var(--text-3); }
#${APP_NAME}-config-container .settings-tile.is-on .settings-tile-state { color: var(--accent-text); }
#${APP_NAME}-config-container .settings-tile-label, #${APP_NAME}-config-container .settings-tile .setting-name { font-size: 13px; font-weight: 500; line-height: 1.35; }
#${APP_NAME}-config-container .settings-tile.is-changed .settings-tile-label { color: var(--accent-text); }

/* ---------------------------------------------------------------- load meter */
#${APP_NAME}-config-container .settings-load-group { overflow: hidden; }
#${APP_NAME}-config-container .settings-load-meter { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
#${APP_NAME}-config-container .settings-load-bars { display: flex; gap: 3px; }
#${APP_NAME}-config-container .settings-load-bars i { width: 12px; height: 20px; border-radius: 2px; background: var(--surface-4); transition: background var(--t); }
#${APP_NAME}-config-container .settings-load-bars i.is-on { background: var(--warn); }
#${APP_NAME}-config-container .settings-load-bars.is-low i.is-on { background: var(--ok); }
#${APP_NAME}-config-container .settings-load-bars.is-high i.is-on { background: var(--danger); }
#${APP_NAME}-config-container .settings-load-text b { display: block; font-size: 13.5px; font-weight: 500; }
#${APP_NAME}-config-container .settings-load-text small { font-size: 12px; color: var(--text-3); }

/* ---------------------------------------------------------------- lyric-layer matrix */
#${APP_NAME}-config-container .settings-matrix-group { overflow: visible; }
#${APP_NAME}-config-container .settings-matrix { --columns: 3; display: grid; grid-template-columns: 116px repeat(var(--columns), minmax(0, 1fr)); }
#${APP_NAME}-config-container .settings-matrix.is-muted > .settings-matrix-cell, #${APP_NAME}-config-container .settings-matrix.is-muted > .settings-matrix-head:not(.is-corner) { opacity: .45; }
#${APP_NAME}-config-container .settings-matrix.is-muted.is-tabs > .option-list-wrapper { opacity: .45; }
#${APP_NAME}-config-container .settings-matrix-head { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 12px 8px 10px; border-bottom: 1px solid var(--line-2); }
#${APP_NAME}-config-container .settings-matrix-head.is-corner { justify-content: flex-end; padding-left: 16px; font-size: 12px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-matrix-layer { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; }
#${APP_NAME}-config-container .settings-matrix-layer-name { display: inline-flex; align-items: center; gap: 7px; min-width: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${APP_NAME}-config-container .settings-matrix-layer-name i { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 2px; background: var(--layer-color); }
#${APP_NAME}-config-container .settings-matrix-layer .switch-checkbox { transform: scale(.85); transform-origin: right center; }
#${APP_NAME}-config-container .settings-matrix-layer-sub { font-size: 11.5px; line-height: 1.4; color: var(--text-3); }
#${APP_NAME}-config-container .settings-matrix-label { display: flex; align-items: center; min-width: 0; padding: 8px 8px 8px 16px; border-top: 1px solid var(--line); font-size: 12.5px; font-weight: 500; color: var(--text-2); }
#${APP_NAME}-config-container .settings-matrix-cell { position: relative; display: flex; align-items: center; gap: 4px; min-width: 0; padding: 8px 30px 8px 8px; border-top: 1px solid var(--line); container-type: inline-size; }
#${APP_NAME}-config-container .settings-matrix-cell > :not(.settings-reset-btn):not(.settings-visually-hidden) { flex: 1; min-width: 0; }
#${APP_NAME}-config-container .settings-matrix-cell.is-empty::after { content: "\\2014"; padding-left: 8px; font-size: 13px; color: var(--text-4); }
#${APP_NAME}-config-container .settings-matrix-cell.is-off { opacity: .35; }
#${APP_NAME}-config-container .settings-matrix-head.is-last { padding-right: 12px; }
#${APP_NAME}-config-container .settings-matrix-cell .settings-reset-btn.is-cell { position: absolute; z-index: 2; right: 5px; top: calc(50% - 10px); width: 20px; height: 20px; flex: 0 0 auto; background: var(--surface-3); }
#${APP_NAME}-config-container .settings-matrix-cell .settings-reset-btn.is-cell svg { width: 12px; height: 12px; }
#${APP_NAME}-config-container .settings-matrix-cell:not(:hover):not(:focus-within) .settings-reset-btn.is-cell:not(:focus-visible) { opacity: 0; pointer-events: none; }
#${APP_NAME}-config-container .settings-matrix-cell.is-changed :is(select, .settings-scrub-input, .config-color-input) { color: var(--accent-text); }
#${APP_NAME}-config-container .settings-matrix-cell.is-changed :is(select, .settings-scrub, .config-color-control) { border-color: var(--accent-line); }
#${APP_NAME}-config-container .settings-matrix.is-stacked { grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); }
#${APP_NAME}-config-container .settings-matrix.is-stacked > .settings-matrix-head.is-corner { display: none; }
#${APP_NAME}-config-container .settings-matrix.is-stacked > .settings-matrix-head { padding: 12px 10px 10px; }
#${APP_NAME}-config-container .settings-matrix.is-stacked > .settings-matrix-label { grid-column: 1 / -1; padding: 10px 12px 0; border-top: 1px solid var(--line); font-size: 12px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-matrix.is-stacked > .settings-matrix-cell { border-top: 0; padding: 4px 30px 10px 8px; }
#${APP_NAME}-config-container .settings-matrix.is-tabs { display: block; }
#${APP_NAME}-config-container .settings-matrix-switcher { padding: 12px 14px 6px; }
#${APP_NAME}-config-container .settings-matrix-switcher .settings-seg { width: 100%; }
#${APP_NAME}-config-container .settings-matrix.is-tabs > .option-list-wrapper > .setting-row:first-child { border-top: 0; }


/* ---------------------------------------------------------------- providers */
#${APP_NAME}-config-container .settings-provider-table { --provider-caps: 4; --prov-cols: minmax(150px, 1.6fr) 48px repeat(var(--provider-caps), minmax(40px, 1fr)) 34px; overflow: hidden; container-type: inline-size; container-name: providers; }
#${APP_NAME}-config-container .settings-provider-caption { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; padding: 12px 16px 0; font-size: 12px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-provider-caption b { color: var(--text-2); font-weight: 500; }
#${APP_NAME}-config-container .settings-provider-head, #${APP_NAME}-config-container .lyrics-provider-item { display: grid; grid-template-columns: 26px 22px minmax(0, 1fr); align-items: center; column-gap: 6px; padding: 0 10px 0 8px; }
#${APP_NAME}-config-container .settings-provider-head { padding-top: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--line-2); }
#${APP_NAME}-config-container .settings-provider-head-spacer { grid-column: span 2; }
#${APP_NAME}-config-container .settings-provider-head-cells, #${APP_NAME}-config-container .settings-provider-row { display: grid; grid-template-columns: var(--prov-cols); align-items: center; min-width: 0; }
#${APP_NAME}-config-container .settings-provider-head-label { padding-left: 2px; font-size: 12px; font-weight: 500; color: var(--text-3); }
#${APP_NAME}-config-container .settings-provider-head-cap { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; padding: 0 2px; font-size: 11px; font-weight: 500; line-height: 1.25; text-align: center; color: var(--text-3); }
#${APP_NAME}-config-container .settings-provider-head-cap .settings-provider-glyph { width: 15px; height: 15px; color: var(--text-2); }
#${APP_NAME}-config-container .settings-provider-head-text { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${APP_NAME}-config-container .settings-provider-owner { display: block; max-width: 100%; margin-top: 2px; padding: 0 5px; border-radius: var(--r-xs); border: 1px solid transparent; background: var(--surface-3); color: var(--text-2); font-size: 11px; font-weight: 500; line-height: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${APP_NAME}-config-container .settings-provider-owner.is-none { background: transparent; border-color: var(--line-2); border-style: dashed; color: var(--text-3); }
#${APP_NAME}-config-container .lyrics-providers-list { display: block; }
#${APP_NAME}-config-container .lyrics-provider-item { position: relative; min-height: 52px; border-top: 1px solid var(--line); background: var(--surface); transition: background var(--t-fast), box-shadow var(--t-fast); }
#${APP_NAME}-config-container .lyrics-provider-item:first-child { border-top: 0; }
#${APP_NAME}-config-container .lyrics-provider-item:hover { background: color-mix(in srgb, var(--surface-2) 70%, var(--surface)); }
#${APP_NAME}-config-container .lyrics-provider-item.dragging { opacity: .55; }
#${APP_NAME}-config-container .lyrics-provider-item.drag-over-before { box-shadow: inset 0 2px 0 var(--accent); }
#${APP_NAME}-config-container .lyrics-provider-item.drag-over-after { box-shadow: inset 0 -2px 0 var(--accent); }
#${APP_NAME}-config-container .provider-drag-handle { display: grid; place-items: center; width: 26px; height: 32px; padding: 0; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-4); cursor: grab; touch-action: none; }
#${APP_NAME}-config-container .provider-drag-handle:hover { color: var(--text-2); background: var(--surface-3); }
#${APP_NAME}-config-container .provider-drag-handle:active { cursor: grabbing; }
#${APP_NAME}-config-container .provider-drag-handle svg { width: 13px; height: 16px; }
#${APP_NAME}-config-container .lyrics-provider-item > .provider-drag-handle { align-self: start; margin-top: 10px; }
#${APP_NAME}-config-container .lyrics-provider-item > .provider-order-index { align-self: start; margin-top: 16px; }
#${APP_NAME}-config-container .provider-order-index { display: grid; place-items: center; width: 20px; height: 20px; border-radius: var(--r-xs); background: var(--surface-3); color: var(--text-3); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container .lyrics-provider-item:not(.is-off) .provider-order-index { background: var(--surface-4); color: var(--text); }
#${APP_NAME}-config-container .settings-provider-row { padding: 8px 0; }
#${APP_NAME}-config-container .settings-provider-name { display: grid; min-width: 0; padding-right: 10px; }
#${APP_NAME}-config-container .lyrics-provider-name { display: block; font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${APP_NAME}-config-container .lyrics-provider-summary { display: block; font-size: 11.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${APP_NAME}-config-container .settings-provider-row.disabled .settings-provider-name, #${APP_NAME}-config-container .settings-provider-row.disabled .settings-cap-toggle, #${APP_NAME}-config-container .settings-provider-row.disabled .settings-cap-chip { opacity: .5; }
#${APP_NAME}-config-container .settings-provider-switch, #${APP_NAME}-config-container .settings-cap-cell { display: grid; place-items: center; min-width: 0; }
#${APP_NAME}-config-container .settings-cap-toggle { position: relative; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border-radius: var(--r-xs); border: 1px solid var(--line-2); background: transparent; color: transparent; transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-cap-toggle::before { content: ""; position: absolute; inset: -6px; }
#${APP_NAME}-config-container .settings-cap-toggle:hover:not(:disabled):not(.is-static) { border-color: var(--line-3); }
#${APP_NAME}-config-container .settings-cap-toggle svg { width: 13px; height: 13px; stroke-width: 2.2; }
#${APP_NAME}-config-container .settings-cap-toggle.is-on { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent-text); }
#${APP_NAME}-config-container .settings-cap-toggle.is-owner { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
#${APP_NAME}-config-container .settings-cap-toggle.is-static { cursor: default; }
#${APP_NAME}-config-container .settings-cap-none { width: 4px; height: 4px; border-radius: 50%; background: var(--line-3); }
#${APP_NAME}-config-container .settings-provider-more { display: grid; place-items: center; width: 28px; height: 28px; justify-self: end; padding: 0; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text-3); transition: background var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-provider-more:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-provider-more:disabled { opacity: .25; }
#${APP_NAME}-config-container .settings-provider-more svg { width: 16px; height: 16px; transition: transform var(--t) var(--ease-out); }
#${APP_NAME}-config-container .settings-provider-more[aria-expanded="true"] svg { transform: rotate(180deg); }
#${APP_NAME}-config-container .settings-provider-chips { display: none; }
#${APP_NAME}-config-container .settings-cap-chip { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: transparent; color: var(--text-3); font-size: 12px; font-weight: 500; white-space: nowrap; transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .settings-cap-chip.is-on { border-color: var(--line-3); background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-cap-chip.is-owner { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
#${APP_NAME}-config-container .settings-cap-chip.is-static { cursor: default; }
#${APP_NAME}-config-container .lyrics-provider-card-body { grid-column: 1 / -1; margin: 6px 0 4px; padding: 2px 0 0 14px; border-left: 1px solid var(--line-2); }
#${APP_NAME}-config-container .settings-provider-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 10px 16px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-provider-legend span { display: inline-flex; align-items: center; gap: 6px; }
#${APP_NAME}-config-container .settings-provider-legend i { width: 14px; height: 14px; border-radius: var(--r-xs); border: 1px solid var(--line-2); }
#${APP_NAME}-config-container .settings-provider-legend i.is-on { background: var(--accent-soft); border-color: var(--accent-line); }
#${APP_NAME}-config-container .settings-provider-legend i.is-owner { background: var(--accent); border-color: var(--accent); }
#${APP_NAME}-config-container .no-providers-message { padding: 20px 16px; border-radius: var(--r-lg); border: 1px dashed var(--line-3); color: var(--text-3); font-size: 13px; text-align: center; }
#${APP_NAME}-config-container .no-providers-message p { margin: 0; }
@container providers (max-width: 700px) {
  #${APP_NAME}-config-container .settings-provider-table.is-ai .settings-provider-head { display: none; }
  #${APP_NAME}-config-container .settings-provider-table.is-ai .settings-provider-row { grid-template-columns: minmax(0, 1fr) auto 34px; row-gap: 8px; }
  #${APP_NAME}-config-container .settings-provider-table.is-ai .settings-cap-cell { display: none; }
  #${APP_NAME}-config-container .settings-provider-table.is-ai .settings-provider-chips { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
}
@container providers (max-width: 480px) {
  #${APP_NAME}-config-container .settings-provider-table .settings-provider-head { display: none; }
  #${APP_NAME}-config-container .settings-provider-table .settings-provider-row { grid-template-columns: minmax(0, 1fr) auto 34px; row-gap: 8px; }
  #${APP_NAME}-config-container .settings-provider-table .settings-cap-cell { display: none; }
  #${APP_NAME}-config-container .settings-provider-table .settings-provider-chips { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
}

/* lookup order chain */
#${APP_NAME}-config-container .settings-lookup-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 12px 16px; border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-lookup-step { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); font-size: 12.5px; font-weight: 500; white-space: nowrap; }
#${APP_NAME}-config-container .settings-lookup-step.is-accent { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent-text); }
#${APP_NAME}-config-container .settings-lookup-arrow { display: inline-flex; color: var(--text-4); }
#${APP_NAME}-config-container .settings-lookup-arrow svg { width: 13px; height: 13px; }

/* AI connections */
#${APP_NAME}-config-container .settings-section.is-bare > .settings-section-body > .settings-connections { display: grid; gap: 8px; }
#${APP_NAME}-config-container .settings-connection-card { border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--surface); overflow: hidden; transition: border-color var(--t-fast); }
#${APP_NAME}-config-container .settings-connection-card.is-open { border-color: var(--line-2); }
#${APP_NAME}-config-container .settings-connection-card.is-flash { animation: settings-flash 1.2s var(--ease); }
@keyframes settings-flash { 0% { box-shadow: 0 0 0 0 var(--accent-line); } 30% { box-shadow: 0 0 0 3px var(--accent-soft); } 100% { box-shadow: 0 0 0 0 transparent; } }
#${APP_NAME}-config-container .settings-connection-head { display: flex; align-items: center; gap: 12px; width: 100%; margin: 0; padding: 10px 14px; border: 0; border-radius: 0; background: transparent; color: var(--text); text-align: left; }
#${APP_NAME}-config-container .settings-connection-head:hover:not(:disabled) { background: var(--surface-2); }
#${APP_NAME}-config-container .settings-connection-head:disabled { cursor: default; opacity: .7; }
#${APP_NAME}-config-container .settings-connection-head:focus-visible { box-shadow: inset 0 0 0 2px var(--accent-line); }
#${APP_NAME}-config-container .settings-connection-avatar { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 auto; border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--surface-3); color: var(--text-2); font-size: 11.5px; font-weight: 600; letter-spacing: .2px; }
#${APP_NAME}-config-container .settings-connection-name { display: grid; flex: 1; min-width: 0; }
#${APP_NAME}-config-container .settings-connection-name b { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 13.5px; font-weight: 500; }
#${APP_NAME}-config-container .settings-connection-meta { font-size: 11.5px; font-weight: 400; color: var(--text-4); white-space: nowrap; }
#${APP_NAME}-config-container .settings-connection-name small { display: block; font-size: 12px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${APP_NAME}-config-container .settings-connection-chevron { width: 16px; height: 16px; flex: 0 0 auto; color: var(--text-3); transition: transform var(--t) var(--ease-out); }
#${APP_NAME}-config-container .settings-connection-card.is-open .settings-connection-chevron { transform: rotate(180deg); }
#${APP_NAME}-config-container .settings-connection-body { border-top: 1px solid var(--line); }

/* add-on settings UIs (connection bodies and provider details) */
#${APP_NAME}-config-container .settings-connection-body .ai-addon-settings, #${APP_NAME}-config-container .lyrics-provider-card-body .ai-addon-settings, #${APP_NAME}-config-container .lyrics-provider-card-body .lyrics-addon-settings { display: block; margin: 0; padding: 0; border: 0; background: transparent; }
#${APP_NAME}-config-container .ai-addon-setting { margin: 0; padding: 12px 16px; border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .ai-addon-settings > .ai-addon-setting:first-child, #${APP_NAME}-config-container .ai-addon-settings > :first-child { border-top: 0; }
#${APP_NAME}-config-container .lyrics-provider-card-body .ai-addon-setting { padding: 10px 0; }
#${APP_NAME}-config-container .ai-addon-setting > label, #${APP_NAME}-config-container .ai-addon-input-group > label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 500; color: var(--text); }
#${APP_NAME}-config-container .ai-addon-setting > input:not([type]), #${APP_NAME}-config-container .ai-addon-setting > input[type="text"], #${APP_NAME}-config-container .ai-addon-setting > input[type="password"], #${APP_NAME}-config-container .ai-addon-setting > input[type="number"], #${APP_NAME}-config-container .ai-addon-setting > select, #${APP_NAME}-config-container .ai-addon-setting > textarea, #${APP_NAME}-config-container .ai-addon-disclosure-body > input { width: 100%; max-width: 520px; }
#${APP_NAME}-config-container .ai-addon-setting small, #${APP_NAME}-config-container .ai-addon-setting .ai-addon-description { display: block; margin-top: 6px; max-width: 640px; font-size: 12px; line-height: 1.55; color: var(--text-3); }
#${APP_NAME}-config-container .ai-addon-input-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: 640px; margin: 0; }
#${APP_NAME}-config-container .ai-addon-input-group > input, #${APP_NAME}-config-container .ai-addon-input-group > select { flex: 1 1 220px; min-width: 0; }
/* style.css styles these with !important; settings use the shared field look */
#${APP_NAME}-config-container .ai-addon-input-group input[type="text"], #${APP_NAME}-config-container .ai-addon-input-group input[type="password"], #${APP_NAME}-config-container .ai-addon-input-group select { height: 32px; padding: 0 10px; border-radius: var(--r-sm) !important; background-color: var(--surface-2) !important; border: 1px solid var(--line-2) !important; color: var(--text) !important; }
#${APP_NAME}-config-container .ai-addon-input-group select { padding-right: 30px; }
#${APP_NAME}-config-container .ai-addon-input-group input:focus, #${APP_NAME}-config-container .ai-addon-input-group select:focus { background-color: var(--surface) !important; border-color: var(--accent-line) !important; box-shadow: 0 0 0 3px var(--accent-soft); }
/* third-party add-ons may use only the -primary / -secondary class */
#${APP_NAME}-config-container :is(.ai-addon-btn, .ai-addon-btn-primary, .ai-addon-btn-secondary) { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 0 12px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text); font-size: 13px; font-weight: 500; white-space: nowrap; box-shadow: none; cursor: pointer; transition: background var(--t-fast), border-color var(--t-fast); }
#${APP_NAME}-config-container :is(.ai-addon-btn, .ai-addon-btn-primary, .ai-addon-btn-secondary):hover:not(:disabled) { background: var(--surface-3); border-color: var(--line-3); }
#${APP_NAME}-config-container :is(.ai-addon-btn, .ai-addon-btn-primary, .ai-addon-btn-secondary):disabled { opacity: .45; cursor: default; }
#${APP_NAME}-config-container :is(.ai-addon-btn, .ai-addon-btn-primary, .ai-addon-btn-secondary):focus-visible { outline: none; box-shadow: var(--focus); }
#${APP_NAME}-config-container .ai-addon-btn-primary { background: var(--ink); border-color: transparent; color: var(--ink-text); }
#${APP_NAME}-config-container .ai-addon-btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 86%, var(--bg)); border-color: transparent; }
#${APP_NAME}-config-container .ai-addon-test-status { display: inline-flex; align-items: center; gap: 6px; margin-left: 0; font-size: 12.5px; line-height: 1.5; color: var(--text-2); }
#${APP_NAME}-config-container .ai-addon-test-status.success { color: var(--ok); }
#${APP_NAME}-config-container .ai-addon-test-status.error { color: var(--danger); }
#${APP_NAME}-config-container .ai-addon-setting > :is(.ai-addon-btn, .ai-addon-btn-primary, .ai-addon-btn-secondary) + .ai-addon-test-status { margin-left: 10px; }
#${APP_NAME}-config-container .ai-addon-setting > .ai-addon-input-group + .ai-addon-test-status { margin-top: 8px; }
#${APP_NAME}-config-container .ai-addon-checkbox { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); cursor: pointer; }
#${APP_NAME}-config-container .ai-addon-info-box { margin: 0; padding: 10px 12px; border-radius: var(--r-md); border: 1px solid color-mix(in srgb, var(--info) 18%, transparent); background: var(--info-soft); color: var(--text); font-size: 12.5px; line-height: 1.6; }
#${APP_NAME}-config-container .ai-addon-info-box p { margin: 0 0 4px; }
#${APP_NAME}-config-container .ai-addon-info-box p:last-child { margin-bottom: 0; }
#${APP_NAME}-config-container .ai-addon-advanced-params label { color: var(--text-2); }
/* collapsible "advanced API parameters" block and the Pollinations key disclosure */
#${APP_NAME}-config-container :is(.ai-addon-advanced-toggle, .ai-addon-disclosure) { display: inline-flex; align-items: center; gap: 8px; margin: 0; padding: 2px 6px 2px 0; border: 0; border-radius: var(--r-xs); background: transparent; color: var(--text-2); font-size: 12.5px; font-weight: 500; cursor: pointer; user-select: none; }
#${APP_NAME}-config-container :is(.ai-addon-advanced-toggle, .ai-addon-disclosure):hover { color: var(--text); }
#${APP_NAME}-config-container :is(.ai-addon-advanced-toggle, .ai-addon-disclosure):focus-visible { outline: none; box-shadow: var(--focus); }
#${APP_NAME}-config-container .ai-addon-disclosure > label { margin: 0; font-size: 13px; font-weight: 500; color: var(--text); cursor: pointer; }
#${APP_NAME}-config-container .ai-addon-advanced-chevron { display: inline-block; font-size: 8px; line-height: 1; color: var(--text-3); transition: transform var(--t-fast); }
#${APP_NAME}-config-container [aria-expanded="true"] > .ai-addon-advanced-chevron { transform: rotate(90deg); }
#${APP_NAME}-config-container .ai-addon-advanced-body { display: grid; gap: 10px; margin-top: 10px; padding-left: 12px; border-left: 2px solid var(--line-2); }
#${APP_NAME}-config-container .ai-addon-advanced-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
#${APP_NAME}-config-container .ai-addon-advanced-check { display: inline-flex; align-items: center; gap: 8px; min-width: 180px; margin: 0; font-size: 12.5px; cursor: pointer; }
#${APP_NAME}-config-container .ai-addon-advanced-row input[type="number"] { width: 110px; font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container .ai-addon-advanced-field { display: grid; gap: 6px; max-width: 640px; margin: 0; font-size: 12.5px; }
#${APP_NAME}-config-container .ai-addon-advanced-body small { margin-top: 0; }
#${APP_NAME}-config-container .ai-addon-advanced-body small + small { margin-top: -6px; }
#${APP_NAME}-config-container .ai-addon-setting small.ai-addon-field-error { color: var(--danger); }
#${APP_NAME}-config-container .ai-addon-disclosure-body { margin-top: 8px; }
#${APP_NAME}-config-container .ai-addon-device-code { padding: 5px 10px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text); font: 600 13px/1.4 var(--mono); letter-spacing: .06em; }
#${APP_NAME}-config-container .ai-addon-caps-container { display: flex; flex-wrap: wrap; gap: 6px; }
#${APP_NAME}-config-container .ai-addon-cap-chip { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: transparent; color: var(--text-3); font-size: 12.5px; font-weight: 500; cursor: pointer; user-select: none; transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast); }
#${APP_NAME}-config-container .ai-addon-cap-chip:hover { color: var(--text-2); border-color: var(--line-3); }
#${APP_NAME}-config-container .ai-addon-cap-chip.active, #${APP_NAME}-config-container .ai-addon-cap-chip.active[class*="cap-"] { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent-text); }
/* Blocked by the provider master switch: keeps the blue active look, hatched. */
#${APP_NAME}-config-container .ai-addon-cap-chip.is-blocked { position: relative; background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent-text); }
#${APP_NAME}-config-container .ai-addon-cap-chip.is-blocked::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: repeating-linear-gradient(-18deg, transparent 0 4px, rgba(150, 150, 150, .75) 4px 6px); pointer-events: none; }
#${APP_NAME}-config-container .ai-addon-cap-chip svg { width: 12px; height: 12px; }
#${APP_NAME}-config-container .ai-addon-capabilities-title { margin-bottom: 6px; font-size: 12.5px; font-weight: 500; color: var(--text-2); }
#${APP_NAME}-config-container .ai-addon-capabilities-desc { margin-top: 6px; font-size: 12px; color: var(--text-3); }
#${APP_NAME}-config-container .ai-addon-connections { margin-top: 4px; }
#${APP_NAME}-config-container .ai-addon-connection-card { margin: 10px 0; padding: 12px 14px; border-radius: var(--r-md); border: 1px dashed var(--line-3); background: transparent; min-width: 0; }
#${APP_NAME}-config-container .ai-addon-connection-header { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
#${APP_NAME}-config-container .ai-addon-connection-enabled { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; margin: 0; font-size: 13px; font-weight: 500; }
#${APP_NAME}-config-container .ai-addon-connection-enabled span { overflow-wrap: anywhere; }
#${APP_NAME}-config-container .ai-addon-connection-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
#${APP_NAME}-config-container .ai-addon-connection-icon { display: inline-grid; place-items: center; width: 30px; min-width: 30px; height: 30px; padding: 0; font-size: 15px; line-height: 1; }
#${APP_NAME}-config-container .ai-addon-connection-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); align-items: start; gap: 12px 14px; }
#${APP_NAME}-config-container .ai-addon-connection-field { min-width: 0; }
#${APP_NAME}-config-container .ai-addon-connection-field > label { display: block; margin: 0 0 6px; font-size: 12.5px; font-weight: 500; color: var(--text-2); }
#${APP_NAME}-config-container .ai-addon-connection-field input, #${APP_NAME}-config-container .ai-addon-connection-field select { width: 100%; }
#${APP_NAME}-config-container .ai-addon-connection-card .ai-addon-connection-capabilities { min-width: 0; margin: 12px 0 0; padding: 0; border: 0; }
#${APP_NAME}-config-container .ai-addon-connection-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 12px; }
#${APP_NAME}-config-container .ai-addon-connection-footer small { margin: 0; overflow-wrap: anywhere; }

/* Local AI (markup owned by Addon_AI_LocalModel.js; styled through its classes) */
#${APP_NAME}-config-container .local-model-quality .slider-container { width: min(390px, 100%); }
#${APP_NAME}-config-container .local-model-tiers { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; width: min(390px, 100%); margin-top: 4px; }
#${APP_NAME}-config-container .local-model-tier { display: grid; gap: 1px; align-content: start; min-width: 0; padding: 3px 2px; border-radius: var(--r-xs); color: var(--text-3); text-align: center; cursor: pointer; transition: color var(--t-fast), opacity var(--t-fast); }
#${APP_NAME}-config-container .local-model-tier:first-child { text-align: left; }
#${APP_NAME}-config-container .local-model-tier:last-child { text-align: right; }
#${APP_NAME}-config-container .local-model-tier:hover { color: var(--text-2); }
#${APP_NAME}-config-container .local-model-tier:focus-visible { outline: none; box-shadow: var(--focus); }
#${APP_NAME}-config-container .local-model-tier.is-selected { color: var(--text); }
#${APP_NAME}-config-container .local-model-tier-name { font-size: 12.5px; font-weight: 500; line-height: 1.4; overflow-wrap: anywhere; }
#${APP_NAME}-config-container .local-model-tier.is-selected .local-model-tier-name { font-weight: 600; }
#${APP_NAME}-config-container .local-model-tier-size { font-size: 11px; line-height: 1.4; color: var(--text-3); font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container .local-model-tiers.is-busy .local-model-tier { cursor: default; }
#${APP_NAME}-config-container .local-model-tiers.is-busy .local-model-tier:not(.is-selected) { color: var(--text-3); opacity: .5; }
#${APP_NAME}-config-container .local-model-quality .local-model-hint { margin-top: 8px; }
#${APP_NAME}-config-container .local-model-progress { height: 4px; max-width: 520px; margin-top: 10px; border-radius: 2px; background: var(--surface-4); overflow: hidden; }
#${APP_NAME}-config-container .local-model-progress-bar { height: 100%; background: var(--accent); transition: width .2s linear; }
#${APP_NAME}-config-container .local-model-settings .ai-addon-input-group { margin-top: 10px; }
#${APP_NAME}-config-container .local-model-privacy { display: block; margin: 0; padding: 10px 16px 14px; border-top: 1px solid var(--line); font-size: 12px; line-height: 1.55; color: var(--text-3); }

/* AI translation style */
#${APP_NAME}-config-container .ai-translation-style-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
#${APP_NAME}-config-container .ai-translation-style-option { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; margin: 0; padding: 12px; border-radius: var(--r-md); border: 1px solid var(--line-2); background: var(--surface); color: var(--text); text-align: left; transition: border-color var(--t-fast), background var(--t-fast), box-shadow var(--t-fast); }
#${APP_NAME}-config-container .ai-translation-style-option:hover:not(:disabled) { border-color: var(--line-3); background: var(--surface-2); }
#${APP_NAME}-config-container .ai-translation-style-option.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--surface); }
#${APP_NAME}-config-container .ai-translation-style-option.active:focus-visible { box-shadow: inset 0 0 0 1px var(--accent), var(--focus); }
#${APP_NAME}-config-container .ai-translation-style-option-heading { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; }
#${APP_NAME}-config-container .ai-translation-style-indicator { position: relative; width: 16px; height: 16px; flex: 0 0 auto; border-radius: 50%; border: 1px solid var(--line-3); transition: border-color var(--t-fast), background var(--t-fast); }
#${APP_NAME}-config-container .ai-translation-style-option.active .ai-translation-style-indicator { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 4px var(--surface); }
#${APP_NAME}-config-container .ai-translation-style-option-description { font-size: 12px; line-height: 1.55; color: var(--text-3); }


/* ---------------------------------------------------------------- cards in Advanced / Debug / About */
#${APP_NAME}-config-container .info-card { position: relative; border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--surface); color: var(--text); }
#${APP_NAME}-config-container .settings-account-card, #${APP_NAME}-config-container .debug-info-panel { padding: 16px; }
#${APP_NAME}-config-container .settings-account-login { width: 100%; min-height: 36px; }
#${APP_NAME}-config-container .debug-info-panel-loading { padding: 20px 16px; text-align: center; color: var(--text-3); }
#${APP_NAME}-config-container .debug-info-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
#${APP_NAME}-config-container .debug-info-title { margin: 0; font-size: 14px; font-weight: 600; }
#${APP_NAME}-config-container .debug-info-timestamp { margin: 2px 0 0; font: 11.5px var(--mono); color: var(--text-3); }
#${APP_NAME}-config-container .debug-info-section { margin-top: 14px; }
#${APP_NAME}-config-container .debug-info-section-label, #${APP_NAME}-config-container .debug-json-label { margin-bottom: 6px; font-size: 12px; font-weight: 500; color: var(--text-3); }
#${APP_NAME}-config-container .debug-info-section-label-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; }
#${APP_NAME}-config-container .debug-info-block, #${APP_NAME}-config-container .debug-json-block { padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--bg); font-size: 12.5px; line-height: 1.75; color: var(--text-2); overflow-wrap: anywhere; }
#${APP_NAME}-config-container .debug-json-block { max-height: 260px; overflow: auto; white-space: pre; font: 12px/1.6 var(--mono); }
#${APP_NAME}-config-container .debug-info-key { margin-right: 6px; color: var(--text-3); }
#${APP_NAME}-config-container .debug-info-value { color: var(--text); }
#${APP_NAME}-config-container .debug-info-code { padding: 1px 5px; border-radius: var(--r-xs); background: var(--surface-3); font: 12px var(--mono); color: var(--text); }
#${APP_NAME}-config-container .debug-info-empty, #${APP_NAME}-config-container .debug-api-empty { font-size: 12.5px; color: var(--text-3); }
#${APP_NAME}-config-container .debug-info-tag { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: var(--r-xs); background: var(--surface-3); color: var(--text-2); font-size: 11px; font-weight: 500; }
#${APP_NAME}-config-container .debug-info-inline-meta { display: inline-flex; gap: 8px; color: var(--text-3); font-size: 11.5px; }
#${APP_NAME}-config-container .debug-info-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
#${APP_NAME}-config-container .debug-api-list { display: grid; gap: 6px; }
#${APP_NAME}-config-container .debug-api-item { border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface-2); overflow: hidden; }
#${APP_NAME}-config-container .debug-api-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; width: 100%; padding: 8px 10px; border: 0; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
#${APP_NAME}-config-container .debug-api-header-left { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
#${APP_NAME}-config-container .debug-api-category { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: var(--r-xs); background: var(--surface-3); color: var(--text-2); font-size: 11px; font-weight: 600; }
#${APP_NAME}-config-container .debug-api-endpoint { min-width: 0; padding: 0 10px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px/1.5 var(--mono); color: var(--text); }
#${APP_NAME}-config-container .debug-api-status { font: 600 11.5px var(--mono); }
#${APP_NAME}-config-container .debug-api-duration, #${APP_NAME}-config-container .debug-api-timestamp { font: 11px var(--mono); color: var(--text-3); white-space: nowrap; }
#${APP_NAME}-config-container .debug-api-details { padding: 8px 10px 10px; border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .debug-api-detail-group + .debug-api-detail-group { margin-top: 8px; }

#${APP_NAME}-config-container .cache-action-buttons { gap: 8px; }
#${APP_NAME}-config-container .opendb-cache-status { display: grid; gap: 6px; margin-top: 8px; }
#${APP_NAME}-config-container .opendb-cache-status-primary { display: flex; flex-wrap: wrap; gap: 6px; }
#${APP_NAME}-config-container .opendb-cache-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: var(--r-xs); background: var(--surface-3); color: var(--text-2); font-size: 11.5px; font-weight: 500; }
#${APP_NAME}-config-container .opendb-cache-chip.current { background: var(--ok-soft); color: var(--ok); }
#${APP_NAME}-config-container .opendb-cache-chip.stale { background: var(--warn-soft); color: var(--warn); }
#${APP_NAME}-config-container .opendb-cache-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11.5px; color: var(--text-3); }
#${APP_NAME}-config-container .opendb-cache-error { font-size: 12px; color: var(--danger); }

#${APP_NAME}-config-container .about-info-card { overflow: hidden; }
#${APP_NAME}-config-container .settings-app-card { display: flex; align-items: center; gap: 14px; padding: 16px; }
#${APP_NAME}-config-container .settings-app-logo { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 auto; border-radius: var(--r-lg); background: var(--ink); color: var(--ink-text); font-size: 16px; font-weight: 700; letter-spacing: -.3px; }
#${APP_NAME}-config-container .settings-app-card-main { min-width: 0; }
#${APP_NAME}-config-container .about-info-title { margin: 0; font-size: 15px; font-weight: 600; }
#${APP_NAME}-config-container .about-info-description { margin: 2px 0 0; font-size: 12.5px; color: var(--text-3); line-height: 1.55; }
#${APP_NAME}-config-container .settings-kv { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 6px 16px; margin: 0; padding: 12px 16px; border-top: 1px solid var(--line); font-size: 13px; }
#${APP_NAME}-config-container .settings-kv dt { color: var(--text-3); }
#${APP_NAME}-config-container .settings-kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
#${APP_NAME}-config-container .about-client-card { padding: 14px 16px; }
#${APP_NAME}-config-container .about-info-description-compact { margin: 0 0 10px; }
#${APP_NAME}-config-container .about-client-id-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#${APP_NAME}-config-container .about-client-id-box { flex: 1 1 260px; min-width: 0; padding: 7px 10px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface-2); font: 12px var(--mono); color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${APP_NAME}-config-container .settings-patch-notes { padding: 0; }
#${APP_NAME}-config-container .settings-patch-notes.is-loading { padding: 20px 16px; color: var(--text-3); font-size: 12.5px; }
#${APP_NAME}-config-container .settings-release + .settings-release { border-top: 1px solid var(--line); }
#${APP_NAME}-config-container .settings-release-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 0; }
#${APP_NAME}-config-container .settings-release-head h3 { margin: 0; font-size: 14px; font-weight: 600; }
#${APP_NAME}-config-container .settings-release-head p { margin: 2px 0 0; font-size: 12px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-release-body { padding: 4px 16px 16px; font-size: 13px; line-height: 1.7; color: var(--text-2); overflow-wrap: anywhere; }
#${APP_NAME}-config-container .settings-release-body a { color: var(--accent-text); }

/* ---------------------------------------------------------------- changed view */
#${APP_NAME}-config-container .settings-changed-view { padding-top: 20px; }
#${APP_NAME}-config-container .settings-changed-tools { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
#${APP_NAME}-config-container .settings-changed-menu { margin-top: 20px; }
#${APP_NAME}-config-container .settings-changed-menu > .option-list-wrapper { overflow: hidden; border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--surface); }
#${APP_NAME}-config-container .settings-changed-menu-title { display: flex; align-items: center; gap: 8px; margin: 0 2px 8px; font-size: 13px; font-weight: 500; color: var(--text-2); }
#${APP_NAME}-config-container .settings-changed-menu-title svg { width: 15px; height: 15px; }
#${APP_NAME}-config-container .settings-empty-state { display: grid; justify-items: center; gap: 8px; padding: 64px 20px; text-align: center; color: var(--text-3); font-size: 13px; }
#${APP_NAME}-config-container .settings-empty-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--surface-2); color: var(--text-3); }
#${APP_NAME}-config-container .settings-empty-icon svg { width: 22px; height: 22px; }
#${APP_NAME}-config-container .settings-empty-state b { font-size: 14px; font-weight: 500; color: var(--text); }

/* ---------------------------------------------------------------- live preview dock */
#${APP_NAME}-config-container .settings-dock { display: flex; flex-direction: column; width: 320px; min-height: 0; overflow: hidden; border-left: 1px solid var(--line); background: var(--bg-2); transition: width var(--t-slow) var(--ease-out); }
#${APP_NAME}-config-container .settings-dock.is-collapsed { width: 44px; }
#${APP_NAME}-config-container .settings-dock-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 12px 8px 8px 16px; }
#${APP_NAME}-config-container .settings-dock.is-collapsed .settings-dock-head { justify-content: center; padding: 12px 6px; }
#${APP_NAME}-config-container .settings-dock-copy { min-width: 0; }
#${APP_NAME}-config-container .settings-dock-copy h2 { margin: 0; font-size: 13px; font-weight: 600; white-space: nowrap; }
#${APP_NAME}-config-container .settings-dock-copy p { margin: 2px 0 0; font-size: 11.5px; color: var(--text-3); }
#${APP_NAME}-config-container .settings-dock-toggle[aria-expanded="true"] { color: var(--text); }
#${APP_NAME}-config-container .settings-dock-body { display: flex; flex: 1; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; padding: 0 14px 16px; }
#${APP_NAME}-config-container .settings-dock-foot { margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--text-3); }
#${APP_NAME}-config-container .settings-dock-body > .option-list-wrapper { overflow: hidden; border-radius: var(--r-lg); border: 0; background: transparent; }
#${APP_NAME}-config-container .settings-preview-layers { display: grid; gap: 6px; min-width: 0; }
#${APP_NAME}-config-container .settings-preview-layer-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; font-size: 11.5px; font-weight: 500; color: var(--text-2); }
#${APP_NAME}-config-container .settings-preview-layer-heading > span { min-width: 0; overflow-wrap: anywhere; }
#${APP_NAME}-config-container .settings-preview-edit-link { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 0 1 auto; min-width: 0; min-height: 32px; max-width: 60%; margin: 0; padding: 6px 8px; border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--surface-2); color: var(--text-2); font: 500 11.5px/1.4 var(--font); text-align: start; cursor: pointer; }
#${APP_NAME}-config-container .settings-preview-edit-link:hover { border-color: var(--line-2); background: var(--surface-3); color: var(--text); }
#${APP_NAME}-config-container .settings-preview-edit-link:focus-visible { outline: 2px solid var(--accent-text); outline-offset: -2px; }
#${APP_NAME}-config-container .settings-preview-edit-link > span { min-width: 0; overflow-wrap: anywhere; }
#${APP_NAME}-config-container .settings-preview-edit-link > svg { flex: 0 0 auto; color: var(--text-3); }
#${APP_NAME}-config-container .settings-preview-legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; list-style: none; margin: 0; padding: 0; }
#${APP_NAME}-config-container .settings-preview-layer-label { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 0; padding: 4px 0; color: var(--text-2); font: 400 11.5px/1.4 var(--font); }
#${APP_NAME}-config-container .settings-preview-layer-label > span { min-width: 0; overflow-wrap: anywhere; }
#${APP_NAME}-config-container .settings-preview-layer-label > i { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 2px; background: var(--layer-color); }

#${APP_NAME}-config-container .settings-preview-stage { position: relative; isolation: isolate; overflow: hidden; border-radius: var(--r-lg); background: #111; color: #fff; }
#${APP_NAME}-config-container .settings-preview-bg, #${APP_NAME}-config-container .settings-preview-dim, #${APP_NAME}-config-container .settings-preview-noise { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
#${APP_NAME}-config-container .settings-preview-stage.bg-none .settings-preview-bg { background: #121214; }
#${APP_NAME}-config-container .settings-preview-stage.bg-colorful .settings-preview-bg { background: radial-gradient(circle at 15% 20%, #a87a4c, transparent 54%), radial-gradient(circle at 85% 25%, #3f7671, transparent 54%), radial-gradient(circle at 55% 96%, #4f6488, transparent 58%), #182025; }
#${APP_NAME}-config-container .settings-preview-stage.bg-gradient-background .settings-preview-bg { background: linear-gradient(140deg, #a87b50 0%, #6f6a52 34%, #3d5d5c 64%, #1a242a 100%); }
#${APP_NAME}-config-container .settings-preview-stage.bg-blur-gradient-background .settings-preview-bg { background: radial-gradient(circle at 25% 35%, rgba(184, 132, 80, .85), transparent 60%), radial-gradient(circle at 78% 70%, rgba(66, 118, 115, .9), transparent 60%), #152026; }
#${APP_NAME}-config-container .settings-preview-stage.bg-solid-background .settings-preview-bg { background: var(--preview-solid, #1e3a8a); }
#${APP_NAME}-config-container .settings-preview-stage.bg-video-background .settings-preview-bg { background: linear-gradient(115deg, #22303a, #3a3a33 40%, #1f3536 70%, #262c35); }
#${APP_NAME}-config-container .settings-preview-dim { background: #000; opacity: var(--preview-dim, 0); transition: opacity var(--t); }
#${APP_NAME}-config-container .settings-preview-noise { opacity: 0; mix-blend-mode: overlay; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.6'/></svg>"); }
#${APP_NAME}-config-container .settings-preview-stage.has-noise .settings-preview-noise { opacity: .45; }
#${APP_NAME}-config-container .settings-preview-tag { position: absolute; left: 10px; top: 10px; z-index: 2; display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: var(--r-xs); background: rgba(0, 0, 0, .45); color: rgba(255, 255, 255, .85); font-size: 10.5px; font-weight: 500; }
/* the real lyric markup at its real metrics, scaled down to the dock */
#${APP_NAME}-config-container .settings-live-preview-lyrics.lyrics-lyricsContainer-LyricsContainer { --lyrics-color-active: #f5f7fa; --lyrics-color-inactive: rgba(245, 247, 250, .44); position: relative; top: auto; display: flex; flex-direction: column; justify-content: center; width: auto; height: auto; min-height: 480px; padding: 72px 40px 48px; contain: none; overflow: visible; zoom: .5; color: #f5f7fa; background: transparent; }
#${APP_NAME}-config-container .settings-live-preview-stage { position: relative; display: block; overflow: visible; text-align: var(--lyrics-align-text, inherit); }
#${APP_NAME}-config-container .settings-live-preview-line.lyrics-lyricsContainer-SyncedLyrics { display: grid; gap: 36px; grid-area: auto; height: auto; min-width: 0; text-align: inherit; }
#${APP_NAME}-config-container .settings-live-preview-line > .lyrics-lyricsContainer-LyricsLine { margin: 0 !important; color: var(--lyrics-color-inactive); opacity: 1; transform: none !important; transition: none !important; will-change: auto; pointer-events: none; text-align: inherit; }
#${APP_NAME}-config-container .settings-live-preview-line > .lyrics-lyricsContainer-LyricsLine-active { color: var(--lyrics-color-active, #fff); }
#${APP_NAME}-config-container .settings-live-preview-line > .lyrics-lyricsContainer-LyricsLine > p:first-child { margin: 0; }
#${APP_NAME}-config-container .settings-live-preview-line .lyrics-karaoke-line { transition: none !important; }
#${APP_NAME}-config-container .settings-live-preview-lyrics[data-furigana-enabled="false"] .lyrics-karaoke-ruby rt { display: none; }
#${APP_NAME}-config-container .settings-live-preview-lyrics[data-furigana-enabled="false"] .lyrics-karaoke-ruby { display: inline; padding-inline: 0; margin-inline: 0; }
#${APP_NAME}-config-container .settings-fs-stage { aspect-ratio: 16 / 10; padding: 0; }
#${APP_NAME}-config-container .settings-preview-bg.is-fullscreen { background: linear-gradient(140deg, #a87b50 0%, #6f6a52 34%, #3d5d5c 64%, #1a242a 100%); }
#${APP_NAME}-config-container .settings-preview-bg.is-fullscreen::after { content: ""; position: absolute; inset: 0; background: rgba(0, 0, 0, .35); }
#${APP_NAME}-config-container .settings-fs-el { position: absolute; transition: all var(--t-slow) var(--ease-out); }
#${APP_NAME}-config-container .settings-fs-top-right { right: 1.875%; top: 3%; display: grid; justify-items: end; gap: 5px; }
#${APP_NAME}-config-container .settings-fs-clock { font-weight: 700; font-size: calc(var(--clock, 48) * .18px); line-height: 1.2; letter-spacing: -.5px; }
#${APP_NAME}-config-container .settings-fs-context { left: 1.875%; bottom: 3%; display: flex; align-items: center; gap: 5px; }
#${APP_NAME}-config-container .settings-fs-context i { width: 14px; height: 14px; border-radius: 3px; background: rgba(255, 255, 255, .35); }
#${APP_NAME}-config-container .settings-fs-context b { width: 34px; height: 5px; border-radius: 3px; background: rgba(255, 255, 255, .6); }
#${APP_NAME}-config-container .settings-fs-col { top: 12%; bottom: 14%; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: var(--info-gap, 4px); }
#${APP_NAME}-config-container .settings-fs-col-art { left: 8%; width: 38%; }
#${APP_NAME}-config-container .settings-fs-col-lyrics { right: 8%; width: 40%; }
#${APP_NAME}-config-container .settings-fs-col-art.is-right { left: auto; right: 8%; }
#${APP_NAME}-config-container .settings-fs-col-lyrics.is-left { right: auto; left: 8%; }
#${APP_NAME}-config-container .settings-fs-col.is-single { left: 15%; right: 15%; width: auto; align-items: center; }
#${APP_NAME}-config-container .settings-fs-album { display: block; flex: 0 0 auto; width: min(100%, calc(var(--album, 400) * .17px)); aspect-ratio: 1; border-radius: calc(var(--radius, 12) * .25px); background: linear-gradient(140deg, #c8925a 0%, #8c8160 34%, #4d7472 64%, #1e2a31 100%); }
#${APP_NAME}-config-container .settings-fs-album.has-shadow { box-shadow: 0 6px 20px rgba(0, 0, 0, .4); }
#${APP_NAME}-config-container .settings-fs-cd { flex: 0 0 auto; width: min(100%, calc(var(--album, 400) * .2125px)); aspect-ratio: 1; }
#${APP_NAME}-config-container .settings-fs-cd > svg { transform: scale(var(--cd-size, 1)); }
#${APP_NAME}-config-container .settings-cd-artwork.is-spinning { transform-origin: 100px 100px; animation: settings-cd-spin var(--cd-rotation-period, 24s) linear infinite; }
@keyframes settings-cd-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  #${APP_NAME}-config-container .settings-cd-artwork.is-spinning { animation: none; }
  #${APP_NAME}-config-container .settings-fs-record.is-spin { animation: none; }
}
#${APP_NAME}-config-container .settings-fs-info { display: grid; flex: 0 0 auto; width: 100%; justify-items: center; gap: 4px; }
#${APP_NAME}-config-container .settings-fs-info b { display: block; width: 70%; height: calc(var(--title, 48) * .13px); border-radius: 3px; background: rgba(255, 255, 255, .9); }
#${APP_NAME}-config-container .settings-fs-info small { display: block; width: 46%; height: calc(var(--artist, 24) * .2px); border-radius: 3px; background: rgba(255, 255, 255, .55); }
#${APP_NAME}-config-container .settings-fs-info em { display: block; width: 34%; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, .35); }
#${APP_NAME}-config-container .settings-fs-lyrics { display: grid; gap: 6px; width: 100%; }
#${APP_NAME}-config-container .settings-fs-lyrics i { display: block; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, .32); }
#${APP_NAME}-config-container .settings-fs-lyrics i.is-on { height: 9px; background: #fff; }
#${APP_NAME}-config-container .settings-fs-player { display: flex; flex: 0 0 auto; flex-direction: column; align-items: center; gap: 4px; width: 100%; min-width: 0; }
#${APP_NAME}-config-container .settings-fs-player:is(.is-bottom, .is-stage) { position: absolute; left: 50%; bottom: 4%; width: 40%; transform: translateX(-50%); }
#${APP_NAME}-config-container .settings-fs-tv-stack { right: 8%; bottom: 6%; display: grid; justify-items: center; gap: 3px; width: 30%; }
#${APP_NAME}-config-container .settings-fs-player.is-tv { width: 100%; }
#${APP_NAME}-config-container .settings-fs-player.is-stage { left: 4%; width: 30%; padding: 4px; border: 1px solid rgba(255, 255, 255, .16); border-radius: var(--r-sm); background: rgba(13, 13, 17, .72); transform: none; }
#${APP_NAME}-config-container .settings-fs-control-surface { display: grid; justify-items: center; gap: 4px; max-width: 100%; padding: 3px 4px; border-radius: var(--r-sm); }
#${APP_NAME}-config-container .settings-fs-control-surface.has-bg { background: rgba(0, 0, 0, .35); }
#${APP_NAME}-config-container .settings-fs-controls { display: flex; align-items: center; justify-content: center; gap: 4px; max-width: 100%; }
#${APP_NAME}-config-container .settings-fs-controls i { flex: 0 1 auto; width: calc(var(--btn, 36) * .18px); height: calc(var(--btn, 36) * .18px); border-radius: 50%; background: rgba(255, 255, 255, .8); }
#${APP_NAME}-config-container .settings-fs-controls i.is-play { flex-shrink: 0; width: calc(var(--btn, 36) * .28px); height: calc(var(--btn, 36) * .28px); background: #fff; }
#${APP_NAME}-config-container .settings-fs-progress-row { display: flex; align-items: center; gap: 3px; width: 100%; }
#${APP_NAME}-config-container .settings-fs-progress-row small { flex: 0 0 auto; color: rgba(255, 255, 255, .7); font-size: 5px; line-height: 1; }
#${APP_NAME}-config-container .settings-fs-progress { position: relative; flex: 1; min-width: 0; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, .25); }
#${APP_NAME}-config-container .settings-fs-progress::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 38%; border-radius: 2px; background: #fff; }
#${APP_NAME}-config-container .settings-fs-volume { display: block; width: 34px; max-width: 70%; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, .45); }
#${APP_NAME}-config-container .settings-fs-next { display: flex; align-items: center; gap: 5px; padding: 4px 6px; border-radius: var(--r-sm); background: rgba(0, 0, 0, .35); }
#${APP_NAME}-config-container .settings-fs-next i { width: 13px; height: 13px; border-radius: 2px; background: linear-gradient(135deg, #9aa3ad, #46505c); }
#${APP_NAME}-config-container .settings-fs-next b { width: 26px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, .6); }
#${APP_NAME}-config-container .settings-fs-queue { right: 2px; top: 45%; bottom: 45%; width: 3px; border-radius: 2px; background: rgba(255, 255, 255, .3); }
#${APP_NAME}-config-container .settings-fs-queue i { display: none; }
#${APP_NAME}-config-container .settings-fs-lprog { right: 7.5%; bottom: 3%; display: flex; align-items: center; gap: 4px; width: 27%; padding: 3px 5px; border-radius: 20px; background: rgba(0, 0, 0, .3); }
#${APP_NAME}-config-container .settings-fs-lprog i { position: relative; flex: 1; min-width: 0; height: 2px; border-radius: 2px; background: rgba(255, 255, 255, .2); }
#${APP_NAME}-config-container .settings-fs-lprog i::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 33%; background: #fff; }
#${APP_NAME}-config-container .settings-fs-lprog small { flex: 0 0 auto; font-size: 5px; line-height: 1; color: rgba(255, 255, 255, .75); }
#${APP_NAME}-config-container .settings-fs-lprog.is-tv { position: relative; right: auto; bottom: auto; width: 80%; }
#${APP_NAME}-config-container .settings-fs-menu { right: 1.25%; bottom: 3%; display: grid; place-items: center; width: 5.3125%; aspect-ratio: 1; border-radius: 4px; background: rgba(0, 0, 0, .65); color: rgba(255, 255, 255, .75); font-size: 10px; line-height: 1; }
#${APP_NAME}-config-container .settings-fs-tv-lyrics { left: 7%; right: 30%; top: 18%; }
#${APP_NAME}-config-container .settings-fs-tv-info { left: 4%; bottom: 6%; display: flex; align-items: center; gap: 5px; width: 48%; }
#${APP_NAME}-config-container .settings-fs-tv-info .settings-fs-album { width: calc(var(--album, 196) * .16px); flex: 0 0 auto; }
#${APP_NAME}-config-container .settings-fs-tv-info .settings-fs-info { flex: 1; }
#${APP_NAME}-config-container .settings-fs-record { --iv-vinyl-spin-angle: 0turn; position: absolute; left: 50%; top: 42%; width: calc(var(--record, 100) * .42%); aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, #111 0 13%, transparent 13.5%), repeating-radial-gradient(circle, #151515 0 2px, #1c1c1c 2px 4px); box-shadow: 0 10px 30px rgba(0, 0, 0, .5); }
#${APP_NAME}-config-container .settings-fs-record.is-spin { animation: ivlyrics-vinyl-spin-clock calc(6s * 100 / var(--rpm, 100)) linear infinite; }
#${APP_NAME}-config-container .settings-fs-record.is-compact { left: 32%; }
#${APP_NAME}-config-container .settings-fs-record-label { position: absolute; left: 50%; top: 50%; width: calc(var(--label, 100) * .36%); aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: linear-gradient(140deg, #c8925a 0%, #8c8160 34%, #4d7472 64%, #1e2a31 100%); }
#${APP_NAME}-config-container .settings-fs-record-label.is-spin { transform: translate(-50%, -50%) rotate(var(--iv-vinyl-spin-angle)); }
#${APP_NAME}-config-container .settings-fs-arm { position: absolute; right: 22%; top: 12%; width: 4px; height: calc(var(--arm, 100) * .5%); border-radius: 2px; background: var(--arm-color, #f2f2f2); transform: rotate(18deg); transform-origin: top center; box-shadow: 0 2px 6px rgba(0, 0, 0, .4); }
#${APP_NAME}-config-container .settings-fs-arm.is-j { border-bottom-left-radius: 10px; }
#${APP_NAME}-config-container .settings-fs-vinyl-lyrics { left: 12%; right: 12%; bottom: 13%; }

/* ---------------------------------------------------------------- narrow windows */
#${APP_NAME}-config-container { container-type: inline-size; container-name: settings-window; }
@container settings-window (max-width: 1320px) {
  #${APP_NAME}-config-container .settings-theme-control { width: 84px; }
  #${APP_NAME}-config-container .settings-theme-control .settings-seg-text { display: none; }
}
@container settings-window (max-width: 980px) {
  #${APP_NAME}-config-container .settings-topbar { grid-template-columns: auto minmax(0, 1fr) auto; }
  #${APP_NAME}-config-container .settings-crumbs { display: none; }
  #${APP_NAME}-config-container .settings-body { grid-template-columns: 196px minmax(0, 1fr); }
  #${APP_NAME}-config-container .settings-dock { display: none; }
  #${APP_NAME}-config-container .settings-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container settings-window (max-width: 720px) {
  #${APP_NAME}-config-container .settings-changed-chip span { display: none; }
  #${APP_NAME}-config-container .settings-kbd { display: none; }
  #${APP_NAME}-config-container .settings-body { grid-template-columns: 172px minmax(0, 1fr); }
}
/* Very narrow desktop windows keep a labelled, keyboard-accessible icon rail
   rather than spending almost half their width on the sidebar. */
@container settings-window (max-width: 560px) {
  #${APP_NAME}-config-container .settings-topbar { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 0 8px; }
  #${APP_NAME}-config-container .settings-topbar-title { display: none; }
  #${APP_NAME}-config-container .settings-body { grid-template-columns: 52px minmax(0, 1fr); }
  #${APP_NAME}-config-container .settings-rail { padding: 6px 4px; }
  #${APP_NAME}-config-container .settings-rail-group { margin-bottom: 6px; }
  #${APP_NAME}-config-container .settings-rail-item { min-height: 44px; justify-content: center; padding: 0; }
  #${APP_NAME}-config-container .settings-rail-label, #${APP_NAME}-config-container .settings-rail-group-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  #${APP_NAME}-config-container .settings-rail-count, #${APP_NAME}-config-container .settings-rail-foot { display: none; }
}
/* narrow content: wide controls drop under their label instead of squeezing it */
@container settings-content (max-width: 700px) {
  #${APP_NAME}-config-container .setting-row.is-inline:not([data-control="toggle"]):not([data-control="color"]):not([data-control="stepper"]) > .setting-row-content { grid-template-columns: minmax(0, 1fr); }
  #${APP_NAME}-config-container .setting-row.is-inline:not([data-control="toggle"]):not([data-control="color"]):not([data-control="stepper"]) > .setting-row-content > .setting-row-right { justify-content: flex-start; }
  #${APP_NAME}-config-container .setting-row.is-inline > .setting-row-content > .setting-row-right > .settings-range, #${APP_NAME}-config-container .setting-row.is-inline > .setting-row-content > .setting-row-right > .settings-seg { width: 100%; max-width: none; }
  #${APP_NAME}-config-container .setting-row.is-inline > .setting-row-content > .setting-row-right::after { display: none; }
  #${APP_NAME}-config-container .setting-row.is-inline:not([data-control="toggle"]):not([data-control="color"]):not([data-control="stepper"]) > .setting-row-content > .setting-row-left { padding-right: 32px; }
  #${APP_NAME}-config-container .setting-row.is-inline:not([data-control="toggle"]):not([data-control="color"]):not([data-control="stepper"]) > .setting-row-content > .setting-row-right > .settings-reset-btn { position: absolute; top: 12px; right: 12px; }
  #${APP_NAME}-config-container .config-font-setting-row > .setting-row-content { grid-template-columns: minmax(0, 1fr); }
  #${APP_NAME}-config-container .config-font-setting-row > .setting-row-content > .setting-row-right { justify-content: flex-start; }
  #${APP_NAME}-config-container .config-font-setting-row .config-font-selector { justify-content: flex-start; }
  #${APP_NAME}-config-container .settings-page { padding: 0 20px 80px; }
  #${APP_NAME}-config-container .settings-page-head { margin: 0 -20px; padding: 16px 20px 10px; }
  #${APP_NAME}-config-container .settings-toc { margin: 12px -20px 0; padding: 0 20px 2px; }
  #${APP_NAME}-config-container .settings-mode-grid, #${APP_NAME}-config-container .settings-mode-grid.settings-cards, #${APP_NAME}-config-container .ai-translation-style-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  #${APP_NAME}-config-container .settings-hotkey-table { grid-template-columns: minmax(0, 1fr) 150px 150px; }
  #${APP_NAME}-config-container .settings-linewin { grid-template-columns: minmax(0, 1fr); }
  #${APP_NAME}-config-container .settings-kv { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  #${APP_NAME}-config-container .settings-kv dd + dt { margin-top: 6px; }
}
@container settings-content (max-width: 480px) {
  #${APP_NAME}-config-container .settings-mode-grid, #${APP_NAME}-config-container .settings-mode-grid.settings-cards, #${APP_NAME}-config-container .ai-translation-style-options, #${APP_NAME}-config-container .settings-tiles { grid-template-columns: minmax(0, 1fr); }
  #${APP_NAME}-config-container .settings-hotkey-table { grid-template-columns: minmax(0, 1fr); }
  #${APP_NAME}-config-container .settings-hotkey-table > .settings-hotkey-head { display: none; }
  #${APP_NAME}-config-container .debug-info-header { flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
  #${APP_NAME}-config-container *, #${APP_NAME}-config-container *::before, #${APP_NAME}-config-container *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important; }
}
#${APP_NAME}-config-container.motion-reduced *, #${APP_NAME}-config-container.motion-reduced *::before, #${APP_NAME}-config-container.motion-reduced *::after { transition-duration: 1ms !important; }
#${APP_NAME}-config-container.motion-reduced .settings-fs-record.is-spin, #${APP_NAME}-config-container.motion-reduced .settings-search-panel { animation: none !important; }
`;
