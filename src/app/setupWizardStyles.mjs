import { getSettingsSurfaceTokenCss as getSetupWizardTokenCss } from "../features/settings/settingsSurfaceTokens.mjs";

export function ensureSetupWizardStyles(document) {
  if (document.getElementById("ivLyrics-setup-styles")) return;
  const style = document.createElement("style");
  style.id = "ivLyrics-setup-styles";
  style.textContent = getSetupWizardTokenCss(".ivlyrics-setup-shell") + `
#ivLyrics-setup-wizard-overlay { padding: 24px; }
.ivlyrics-fluent-shell.ivlyrics-setup-shell {
  display: flex; flex-direction: column; width: min(760px, 100%); max-width: 100%;
  max-height: min(820px, calc(100dvh - 48px)); min-height: 0;
  color: var(--text); background: var(--bg); border: 1px solid var(--line-2);
  border-radius: 12px !important; box-shadow: var(--shadow-3); font-family: var(--font);
}
.ivlyrics-setup-shell * { box-sizing: border-box; }
.ivlyrics-setup-shell button, .ivlyrics-setup-shell select { font: inherit; }
.ivlyrics-setup-shell button { cursor: pointer; }
.ivlyrics-setup-shell button:disabled { cursor: default; opacity: .5; }
.ivlyrics-setup-shell :is(button, select):focus-visible { outline: 2px solid var(--accent-text); outline-offset: 3px; }
.setup-wizard-container { display: flex; flex-direction: column; min-height: 0; width: 100%; }
.wizard-topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px 0; gap: 12px; }
.wizard-brand { display: flex; align-items: center; gap: 9px; color: var(--text-2); font-size: 14px; font-weight: 600; }
.wizard-top-actions { display: flex; align-items: center; gap: 12px; }
.wizard-theme { display: flex; padding: 2px; gap: 2px; background: var(--surface-3); border: 1px solid var(--line-2); border-radius: 8px; }
.wizard-icon-button { display: grid; place-items: center; width: 40px; height: 40px; background: transparent; color: var(--text-3); border: 0; border-radius: 6px; flex-shrink: 0; }
.wizard-icon-button[aria-pressed="true"] { color: var(--text); background: var(--surface); box-shadow: var(--shadow-1); }
.wizard-icon-button:hover { color: var(--text); background: var(--surface-3); }
.wizard-intro { padding: 20px 28px 0; }
.wizard-intro h1 { margin: 0; font-size: 25px; font-weight: 650; line-height: 1.35; letter-spacing: -.025em; }
.wizard-intro p { margin: 8px 0 0; font-size: 14px; color: var(--text-2); line-height: 1.65; max-width: 60ch; }
.wizard-intro h1.wizard-welcome-copy { font-size: clamp(28px, 3.3vw, 38px); line-height: 1.3; }
.wizard-welcome-copy { display: grid; }
.wizard-welcome-copy > span { grid-area: 1 / 1; opacity: 0; pointer-events: none; transition: opacity 180ms ease-out; }
.wizard-welcome-copy > span.is-current { opacity: 1; }
.wizard-progress { display: flex; list-style: none; gap: 8px; padding: 0 28px; margin: 24px 0 0; }
.wizard-progress li { flex: 1; min-width: 0; }
.wizard-progress button { border: 0; border-top: 2px solid var(--line-2); background: transparent; padding: 12px 0; min-height: 44px; width: 100%; text-align: start; color: var(--text-3); font-size: 13px; display: flex; gap: 8px; align-items: center; }
.wizard-progress button[aria-current="step"] { border-color: var(--accent); color: var(--text); font-weight: 600; }
.wizard-progress li.is-done button { border-color: var(--accent-line); color: var(--text-2); }
.wizard-step-number { color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.wizard-pages { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 28px 28px; }
.wizard-page { display: flex; flex-direction: column; gap: 20px; animation: wizard-page-in 160ms ease-out; }
.wizard-page h2 { font-size: 16px; line-height: 1.5; margin: 0; font-weight: 600; outline: none; }
.wizard-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; min-width: 0; }
.wizard-field { display: flex; flex-direction: column; gap: 9px; padding: 16px; min-width: 0; }
.wizard-field + .wizard-field { border-top: 1px solid var(--line); }
.wizard-field > span, .wizard-label { font-size: 13px; font-weight: 550; color: var(--text-2); }
.wizard-field select { width: 100%; min-height: 44px; padding: 10px 12px; color: var(--text); background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 6px; }
.wizard-note { margin: 0; font-size: 13px; line-height: 1.65; color: var(--text-2); }
.wizard-preview { display: flex; flex-direction: column; gap: 6px; padding: 18px 20px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); }
.wizard-preview strong { font-size: 18px; font-weight: 600; }
.wizard-preview span { font-size: 14px; color: var(--text-3); }
.wizard-display-layout { display: grid; grid-template-columns: 1fr 1.35fr; gap: 20px; align-items: stretch; }
.wizard-scene { padding: 22px; min-height: 230px; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; background: #263431; color: #fff; overflow: hidden; }
.wizard-scene[data-mode="colorful"] { background: linear-gradient(145deg, #535d70, #263c40); }
.wizard-scene[data-mode="gradient"] { background: linear-gradient(145deg, #67533f, #294346); }
.wizard-scene[data-mode="blurGradient"] { background: radial-gradient(at 10% 20%, #796246, transparent 90%), #223c3b; }
.wizard-scene[data-mode="solid"] { background: #161619; }
.wizard-scene[data-mode="none"] { background: var(--bg); color: var(--text); border: 1px solid var(--line-2); }
.wizard-scene[data-mode="none"] p { color: var(--text-3); }
.wizard-scene[data-mode="video"] { background: linear-gradient(155deg, #23363c, #24302c); }
.wizard-scene p { color: rgba(255,255,255,.68); font-size: 15px; margin: 0 0 10px; }
.wizard-scene strong { font-size: 24px; line-height: 1.5; }
.wizard-display-controls { display: flex; flex-direction: column; gap: 10px; }
.wizard-options { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; }
.wizard-option { min-width: 0; min-height: 44px; padding: 10px 8px; display: flex; justify-content: center; align-items: center; gap: 7px; background: var(--surface); border: 1px solid var(--line-2); border-radius: 6px; color: var(--text-2); font-size: 12px !important; text-align: center; }
.wizard-option[aria-checked="true"] { border-color: var(--accent-line); background: var(--accent-soft); color: var(--accent-text); }
.wizard-option:hover { border-color: var(--line-3); color: var(--text); }
.wizard-backgrounds { grid-template-columns: repeat(2,minmax(0,1fr)); }
.wizard-backgrounds .wizard-option { flex-direction: column; gap: 8px; }
.wizard-swatch { width: 100%; height: 26px; border-radius: 3px; flex-shrink: 0; }
.wizard-toggle { display: flex; align-items: center; gap: 14px; border: 0; padding: 14px 16px; width: 100%; background: transparent; color: var(--text); text-align: start; min-height: 66px; }
.wizard-toggle + .wizard-toggle { border-top: 1px solid var(--line); }
.wizard-toggle:hover { background: var(--surface-2); }
.wizard-toggle-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.wizard-toggle-copy strong { font-size: 14px; font-weight: 550; }
.wizard-toggle-copy span { font-size: 12px; color: var(--text-3); line-height: 1.5; }
.wizard-toggle > svg { color: var(--text-3); flex-shrink: 0; }
.wizard-switch { display: inline-flex; width: 40px; height: 24px; border: 1px solid var(--line-2); border-radius: 999px; background: var(--switch-off); padding: 2px; flex-shrink: 0; }
.wizard-switch > span { width: 18px; height: 18px; border-radius: 50%; background: white; transition: transform 160ms ease-out; }
.wizard-switch.is-on { background: var(--accent); border-color: var(--accent); }
.wizard-switch.is-on > span { transform: translateX(14px); }
.wizard-diagnostic { border: 1px solid var(--line-2); border-radius: 8px; background: var(--surface); min-width: 0; }
.wizard-diagnostic-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.wizard-diagnostic .wizard-button { padding-inline: 12px !important; min-width: 0; }
.wizard-footer { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 16px 28px; border-top: 1px solid var(--line); background: var(--bg); flex-wrap: wrap; }
.wizard-footer-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.wizard-button { min-height: 44px; padding: 10px 18px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 550; line-height: 1.4; transition: background 120ms ease-out; }
.wizard-button:hover { background: var(--surface-3); }
.wizard-button-primary { color: var(--ink-text); background: var(--ink); border-color: transparent; }
.wizard-button-primary:hover { background: var(--ink); opacity: .85; }
.wizard-button-ghost { background: transparent; color: var(--text-2); border-color: transparent; }
@keyframes wizard-page-in { from { opacity: .4; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (max-width: 600px) {
  #ivLyrics-setup-wizard-overlay { padding: 12px; }
  .ivlyrics-fluent-shell.ivlyrics-setup-shell { max-height: calc(100dvh - 24px); }
  .wizard-topbar { padding: 12px 16px 0; }
  .wizard-intro { padding: 16px 20px 0; }
  .wizard-intro h1 { font-size: 22px; }
  .wizard-progress { padding-inline: 20px; margin-top: 18px; }
  .wizard-progress button { font-size: 12px; }
  .wizard-pages { padding: 8px 20px 20px; }
  .wizard-footer { padding: 12px 20px; }
  .wizard-display-layout { grid-template-columns: 1fr; }
  .wizard-scene { min-height: 130px; }
  .wizard-backgrounds { grid-template-columns: repeat(3,minmax(0,1fr)); }
}
@media (max-height: 590px) {
  .wizard-intro { padding-top: 12px; }
  .wizard-intro p { display: none; }
  .wizard-progress { margin-top: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .ivlyrics-setup-shell *, .ivlyrics-setup-shell *::before, .ivlyrics-setup-shell *::after { animation: none !important; transition: none !important; }
}
`;
  document.head.appendChild(style);
}
