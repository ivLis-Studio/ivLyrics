export const FLUENT_MODAL_CSS = `
.ivlyrics-fluent-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  z-index: var(--iv-layer-modal, 2147483647);
}

.ivlyrics-fluent-overlay[data-ui-theme="light"] {
  background: rgba(248, 250, 252, 0.82);
}

.ivlyrics-fluent-shell {
  --iv-popup-bg: rgba(20, 20, 22, 0.78);
  --iv-popup-bg-strong: rgba(28, 28, 31, 0.9);
  --iv-popup-fill: rgba(255, 255, 255, 0.055);
  --iv-popup-fill-hover: rgba(255, 255, 255, 0.095);
  --iv-popup-border: rgba(255, 255, 255, 0.12);
  --iv-popup-divider: rgba(255, 255, 255, 0.085);
  width: min(92vw, 720px);
  max-height: min(88vh, 920px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(12, 12, 12, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.48);
  border-radius: 0 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] {
  --iv-popup-bg: rgba(252, 252, 253, 0.82);
  --iv-popup-bg-strong: rgba(255, 255, 255, 0.94);
  --iv-popup-fill: rgba(15, 23, 42, 0.045);
  --iv-popup-fill-hover: rgba(15, 23, 42, 0.075);
  --iv-popup-border: rgba(15, 23, 42, 0.12);
  --iv-popup-divider: rgba(15, 23, 42, 0.085);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] {
  background: rgba(255, 255, 255, 0.96);
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.16);
}

.ivlyrics-fluent-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-header {
  border-bottom-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-fluent-title-wrap {
  min-width: 0;
}

.ivlyrics-fluent-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.03em;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-title {
  color: #0f172a;
}

.ivlyrics-fluent-subtitle {
  margin: 8px 0 0;
  color: rgba(248, 250, 252, 0.62);
  font-size: 13px;
  line-height: 1.5;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-subtitle {
  color: rgba(15, 23, 42, 0.62);
}

.ivlyrics-fluent-close {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #f8fafc;
  cursor: pointer;
  border-radius: 0 !important;
  flex: 0 0 auto;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-close {
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.04);
  color: #0f172a;
}

.ivlyrics-fluent-close:hover {
  background: rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-close:hover {
  background: rgba(15, 23, 42, 0.08);
}

.ivlyrics-fluent-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px 24px;
}

.ivlyrics-fluent-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-footer {
  border-top-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-fluent-btn {
  min-height: 38px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 0 !important;
}

.ivlyrics-fluent-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-btn {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.04);
  color: #0f172a;
}

.ivlyrics-fluent-btn.primary {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-fluent-btn.primary {
  color: #0f172a;
  background: rgba(15, 23, 42, 0.08);
  border-color: rgba(15, 23, 42, 0.18);
}

.ivlyrics-first-language-overlay {
  align-items: flex-end;
  justify-content: flex-end;
  padding: 20px 24px 108px;
  background: transparent !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
}

.ivlyrics-first-language-header { padding: 18px 18px 12px; text-align: start; position: relative; }
.ivlyrics-first-language-title { margin: 0 38px 0 0; color: var(--text); font-size: 16px; font-weight: 600; letter-spacing: -.015em; line-height: 1.4; }
.ivlyrics-first-language-description { margin: 6px 0 0; color: var(--text-2); font-size: 13px; line-height: 1.55; }
.ivlyrics-first-language-close { position: absolute; top: 7px; right: 8px; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; color: var(--text-3); background: transparent; cursor: pointer; }
.ivlyrics-first-language-close:hover { color: var(--text); background: var(--surface-3); }
.ivlyrics-first-language-body { padding: 0 18px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.ivlyrics-first-language-toggle-row { width: 100%; min-height: 48px; padding: 10px 0; display: flex; align-items: center; gap: 10px; background: transparent; border: 0; border-bottom: 1px solid var(--line); color: var(--text); cursor: pointer; text-align: start; }
.ivlyrics-first-language-toggle-row:last-of-type { border-bottom: 0; }
.ivlyrics-first-language-toggle-row:hover { color: var(--accent-text); }
.ivlyrics-first-language-row-icon { display: flex; color: var(--text-3); flex-shrink: 0; }
.ivlyrics-first-language-row-label { flex: 1; font-size: 14px; font-weight: 500; line-height: 1.5; }
.ivlyrics-first-language-switch { display: flex; width: 40px; height: 24px; padding: 2px; border: 1px solid var(--line-2); border-radius: 999px; background: var(--switch-off); flex-shrink: 0; }
.ivlyrics-first-language-switch-knob { width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 160ms ease-out; }
.ivlyrics-first-language-switch.is-on { background: var(--accent); border-color: var(--accent); }
.ivlyrics-first-language-switch.is-on .ivlyrics-first-language-switch-knob { transform: translateX(14px); }
.ivlyrics-first-language-provider-hint { margin: 8px 0 0; padding: 10px; border: 1px solid var(--line-2); border-radius: 6px; color: var(--text-2); background: var(--surface-2); font-size: 12px; line-height: 1.55; }
.ivlyrics-first-language-provider-hint[hidden] { display: none; }
.ivlyrics-first-language-action { width: calc(100% - 36px); min-height: 40px; margin: 12px 18px 18px; padding: 10px 14px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--surface-2); color: var(--text-2); font-size: 13px; font-weight: 600; line-height: 1.4; cursor: pointer; flex-shrink: 0; }
.ivlyrics-first-language-action.has-selection { color: var(--ink-text); background: var(--ink); border-color: transparent; }
.ivlyrics-first-language-action:hover { opacity: .85; }
.ivlyrics-first-language-toggle-row:focus-visible, .ivlyrics-first-language-action:focus-visible, .ivlyrics-first-language-close:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }

.ivlyrics-adjust-btn {
  min-width: 52px;
  padding-inline: 10px;
}

.ivlyrics-options-root {
  width: 100%;
  color: #f8fafc;
  font-family: "Segoe UI Variable Text", "Segoe UI", "Pretendard Variable", Pretendard, sans-serif;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root {
  color: #0f172a;
}

.ivlyrics-options-root .ivlyrics-popup-section-title {
  margin: 20px 0 0;
  padding: 0 0 10px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-title {
  border-bottom-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-options-root .ivlyrics-popup-section-title:first-child {
  margin-top: 0;
}

.ivlyrics-options-root .ivlyrics-popup-section-title h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
  color: inherit;
}

.ivlyrics-options-root .ivlyrics-popup-section-title p {
  margin: 0;
  font-size: 12px;
  color: rgba(248, 250, 252, 0.58);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-title p {
  color: rgba(15, 23, 42, 0.58);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row {
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-top: none;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-setting-row {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
  gap: 16px;
  align-items: center;
  padding: 12px 0;
}

.ivlyrics-options-root .ivlyrics-popup-setting-row.no-control .ivlyrics-popup-setting-row-content {
  grid-template-columns: minmax(0, 1fr);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row.no-control {
  background: rgba(255, 255, 255, 0.02);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-setting-row.no-control {
  background: rgba(15, 23, 42, 0.025);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-right:empty {
  display: none;
}

.ivlyrics-options-modal-shell {
  width: min(92vw, 860px);
}

.ivlyrics-options-modal-body {
  padding-top: 18px;
}

.ivlyrics-options-root {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ivlyrics-options-root .ivlyrics-popup-section-list {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-list {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.02);
}

.ivlyrics-options-root .ivlyrics-popup-setting-name,
.ivlyrics-options-root .ivlyrics-popup-row-with-icon {
  color: inherit;
  font-size: 14px;
  font-weight: 600;
}

.ivlyrics-options-root .ivlyrics-popup-row-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ivlyrics-options-root .ivlyrics-popup-row-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(248, 250, 252, 0.72);
  flex: 0 0 auto;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-row-icon {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(15, 23, 42, 0.04);
  color: rgba(15, 23, 42, 0.72);
}

.ivlyrics-options-root .ivlyrics-popup-row-icon svg {
  width: 13px;
  height: 13px;
}

.ivlyrics-options-root .ivlyrics-popup-row-with-icon span {
  min-width: 0;
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-left,
.ivlyrics-options-root .ivlyrics-popup-setting-row-right {
  min-width: 0;
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.ivlyrics-options-root .ivlyrics-popup-setting-description {
  color: rgba(248, 250, 252, 0.56);
  font-size: 12px;
  line-height: 1.45;
  margin-top: 4px;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-setting-description,
.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-row-with-icon svg {
  color: rgba(15, 23, 42, 0.58);
}

.ivlyrics-popup-switch {
  width: 44px;
  min-width: 44px;
  height: 24px;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  border-radius: 0;
}

.ivlyrics-popup-switch.active {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.12);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-popup-switch {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.04);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-popup-switch.active {
  border-color: rgba(15, 23, 42, 0.18);
  background: rgba(15, 23, 42, 0.08);
}

.ivlyrics-popup-switch-knob {
  width: 18px;
  height: 18px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.14);
  transform: translateX(0);
  transition: transform 0.18s ease;
  border-radius: 0;
}

.ivlyrics-popup-switch.active .ivlyrics-popup-switch-knob {
  transform: translateX(18px);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-popup-switch-knob {
  background: #ffffff;
}

.ivlyrics-options-root .optionsMenu-dropBox,
.optionsMenu-dropdown-list {
  border-radius: 0 !important;
}

.ivlyrics-options-root .optionsMenu-dropBox {
  min-width: 120px;
  min-height: 36px;
  width: 100%;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font-size: 13px;
  justify-content: space-between;
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row {
  border-left: none;
  border-right: none;
  border-bottom: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row {
  border-top-color: rgba(15, 23, 42, 0.08);
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row:first-child {
  border-top: none;
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row-content {
  padding-inline: 14px;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .ivlyrics-options-root .optionsMenu-dropBox {
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.05);
}

.optionsMenu-dropdown-list {
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  z-index: var(--iv-layer-modal, 2147483647) !important;
}

.optionsMenu-dropdown-list[data-ui-theme="light"] {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16);
}

.optionsMenu-item {
  color: #f8fafc;
}

.optionsMenu-dropdown-list[data-ui-theme="light"] .optionsMenu-item {
  color: #0f172a;
}

.optionsMenu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.optionsMenu-dropdown-list[data-ui-theme="light"] .optionsMenu-item:hover {
  background: rgba(15, 23, 42, 0.06);
}

.optionsMenu-item.selected {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.optionsMenu-dropdown-list[data-ui-theme="light"] .optionsMenu-item.selected {
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
}

.lyrics-sync-adjust-modal-shell {
  width: min(92vw, 480px);
  max-height: min(78vh, 760px);
}

.lyrics-sync-adjust-floating {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: var(--iv-layer-modal, 2147483647);
  pointer-events: none;
}

.lyrics-sync-adjust-floating > * {
  pointer-events: auto;
}

.lyrics-sync-adjust-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lyrics-sync-adjust-info {
  color: rgba(248, 250, 252, 0.62);
  font-size: 13px;
  line-height: 1.5;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-info {
  color: rgba(15, 23, 42, 0.6);
}

.lyrics-sync-adjust-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.lyrics-sync-adjust-side {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: space-between;
  gap: 8px;
}

.lyrics-sync-adjust-fine {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lyrics-sync-adjust-quick {
  display: flex;
  gap: 6px;
}

.lyrics-sync-adjust-modal .lyrics-sync-adjust-slider-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lyrics-sync-adjust-modal .sync-slider {
  width: 100%;
  height: 28px;
  background: transparent;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-runnable-track {
  height: 2px;
  background: linear-gradient(to right, rgba(255,255,255,0.76) var(--progress-percent, 50%), rgba(255,255,255,0.18) var(--progress-percent, 50%));
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -6px;
  background: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.38);
  box-shadow: none;
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-track {
  height: 2px;
  background: rgba(255,255,255,0.18);
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-progress {
  height: 2px;
  background: rgba(255, 255, 255, 0.76);
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  background: #ffffff;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-webkit-slider-runnable-track {
  background: linear-gradient(to right, rgba(15,23,42,0.72) var(--progress-percent, 50%), rgba(15,23,42,0.18) var(--progress-percent, 50%));
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-webkit-slider-thumb {
  background: #ffffff;
  border-color: rgba(15, 23, 42, 0.28);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-moz-range-track {
  background: rgba(15,23,42,0.18);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-moz-range-progress {
  background: rgba(15,23,42,0.72);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-modal .sync-slider::-moz-range-thumb {
  border-color: rgba(15, 23, 42, 0.28);
}

.lyrics-sync-adjust-slider-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  color: rgba(248, 250, 252, 0.52);
  font-size: 11px;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-slider-summary {
  color: rgba(15, 23, 42, 0.56);
}

.lyrics-sync-adjust-current {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 700;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-current {
  color: #0f172a;
}

.lyrics-sync-adjust-reset {
  flex: 0 0 auto;
}

.lyrics-sync-adjust-track {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.lyrics-sync-adjust-track-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-pill {
  position: static;
  left: auto;
  bottom: auto;
  z-index: auto;
  align-self: stretch;
  justify-content: center;
  width: 100%;
  max-width: none;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-controls {
  justify-content: center;
  width: 100%;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-step {
  flex: 1 1 0;
  padding-inline: 4px;
}

.lyrics-sync-adjust-track-section .lyrics-track-sync-value {
  flex: 1.25 1 0;
  min-width: 54px;
  padding-inline: 5px;
}

.lyrics-sync-adjust-global-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-global-section {
  border-top-color: rgba(15, 23, 42, 0.08);
}

.lyrics-sync-adjust-section-title {
  color: #f8fafc;
  font-size: 13px;
  font-weight: 700;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-section-title {
  color: #0f172a;
}

.lyrics-sync-adjust-section-desc {
  margin: -4px 0 0;
  color: rgba(248, 250, 252, 0.58);
  font-size: 12px;
  line-height: 1.45;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .lyrics-sync-adjust-section-desc {
  color: rgba(15, 23, 42, 0.58);
}

.share-image-modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 84vh;
  color: #f8fafc;
  font-family: "Segoe UI Variable Text", "Segoe UI", "Pretendard Variable", Pretendard, sans-serif;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal {
  color: #0f172a;
}

.share-image-modal-header {
  padding-bottom: 18px;
}

.share-image-modal-content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 0.46fr) minmax(0, 0.54fr);
  overflow: hidden;
}

.share-image-modal-selection-pane {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  min-width: 0;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-selection-pane {
  border-right-color: rgba(15, 23, 42, 0.08);
}

.share-image-modal-selection-label {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(248, 250, 252, 0.58);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-selection-label {
  border-bottom-color: rgba(15, 23, 42, 0.08);
  color: rgba(15, 23, 42, 0.58);
}

.share-image-modal-selection-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-image-modal-lyric-line {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  border-radius: 0 !important;
}

.share-image-modal-lyric-line[data-selected="true"] {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line[data-selected="true"] {
  border-color: rgba(15, 23, 42, 0.18);
  background: rgba(15, 23, 42, 0.08);
}

.share-image-modal-lyric-line > div:first-child {
  font-size: 14px !important;
  font-weight: 600 !important;
  color: inherit !important;
}

.share-image-modal-lyric-line > div:nth-child(2) {
  color: rgba(248, 250, 252, 0.52) !important;
}

.share-image-modal-lyric-line > div:nth-child(3) {
  color: rgba(248, 250, 252, 0.72) !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line > div:nth-child(2) {
  color: rgba(15, 23, 42, 0.52) !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-lyric-line > div:nth-child(3) {
  color: rgba(15, 23, 42, 0.72) !important;
}

.share-image-modal-config-pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
}

.share-image-control-group > label,
.share-image-advanced-panel label {
  color: rgba(248, 250, 252, 0.62) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-control-group > label,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel label {
  color: rgba(15, 23, 42, 0.62) !important;
}

.share-image-segment-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.share-image-chip,
.share-image-segment-btn,
.share-image-advanced-toggle,
.share-image-modal button:not(.ivlyrics-fluent-close):not(.ivlyrics-fluent-btn) {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  color: inherit !important;
  border-radius: 0 !important;
  cursor: pointer;
}

.share-image-chip[data-active="true"],
.share-image-segment-btn[data-active="true"] {
  border-color: #1db954 !important;
  background: rgba(29, 185, 84, 0.18) !important;
  color: #f8fafc !important;
  box-shadow: 0 0 0 1px #1db954, 0 0 12px rgba(29, 185, 84, 0.35) !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-chip,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-segment-btn,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-toggle,
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal button:not(.ivlyrics-fluent-close):not(.ivlyrics-fluent-btn) {
  border-color: rgba(15, 23, 42, 0.12) !important;
  background: rgba(15, 23, 42, 0.04) !important;
  color: #0f172a !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-chip[data-active="true"],
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-segment-btn[data-active="true"] {
  border-color: #1db954 !important;
  background: rgba(29, 185, 84, 0.14) !important;
  color: #0f172a !important;
  box-shadow: 0 0 0 1px #1db954, 0 0 12px rgba(29, 185, 84, 0.25) !important;
}

.share-image-advanced-toggle {
  justify-content: flex-start;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
}

.share-image-advanced-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.03) !important;
  border-radius: 0 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel {
  border-color: rgba(15, 23, 42, 0.08) !important;
  background: rgba(15, 23, 42, 0.03) !important;
}

.share-image-panel-section {
  grid-column: span 2;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: rgba(248, 250, 252, 0.72) !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-panel-section {
  border-bottom-color: rgba(15, 23, 42, 0.08) !important;
  color: rgba(15, 23, 42, 0.72) !important;
}

.share-image-advanced-panel input[type="range"],
.share-image-modal input[type="range"] {
  width: 100%;
  accent-color: #e5e7eb;
}

.share-image-advanced-panel input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #e5e7eb;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel input[type="range"],
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal input[type="range"],
.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-advanced-panel input[type="checkbox"] {
  accent-color: #334155;
}

.share-image-check {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share-image-preview-panel {
  flex: 1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
  border-radius: 0 !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-preview-panel {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
}

.share-image-preview-panel img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 0 !important;
}

.share-image-placeholder {
  color: rgba(248, 250, 252, 0.52);
  font-size: 13px;
  text-align: center;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-placeholder {
  color: rgba(15, 23, 42, 0.52);
}

.share-image-modal-footer {
  justify-content: space-between;
}

.share-image-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.share-image-modal-footer .ivlyrics-fluent-btn {
  border-radius: 0 !important;
}

.share-image-modal-footer .ivlyrics-fluent-btn:not(.primary) {
  border-color: rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  color: #f8fafc !important;
}

.share-image-modal-footer .ivlyrics-fluent-btn.primary {
  border-color: rgba(255, 255, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.12) !important;
  color: #f8fafc !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-footer .ivlyrics-fluent-btn:not(.primary) {
  border-color: rgba(15, 23, 42, 0.12) !important;
  background: rgba(15, 23, 42, 0.04) !important;
  color: #0f172a !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-footer .ivlyrics-fluent-btn.primary {
  border-color: rgba(15, 23, 42, 0.18) !important;
  background: rgba(15, 23, 42, 0.08) !important;
  color: #0f172a !important;
}

.share-image-copyright-shell {
  width: min(92vw, 460px);
  background: rgba(12, 12, 12, 0.96) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.42) !important;
}

.share-image-copyright-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.share-image-copyright-icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.share-image-copyright-points {
  margin: 0;
  padding-left: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding-top: 12px;
  padding-bottom: 12px;
  padding-right: 12px;
  line-height: 1.7;
  color: rgba(248, 250, 252, 0.68);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-copyright-points {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(15, 23, 42, 0.03);
  color: rgba(15, 23, 42, 0.68);
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-copyright-shell {
  background: rgba(255, 255, 255, 0.96) !important;
  border-color: rgba(15, 23, 42, 0.12) !important;
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.16) !important;
}

.share-image-copyright-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.share-image-copyright-actions .ivlyrics-fluent-btn {
  flex: 1 1 0;
}

.share-image-copyright-confirm {
  border-color: rgba(255, 255, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.12) !important;
  color: #f8fafc !important;
}

.ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-copyright-confirm {
  border-color: rgba(15, 23, 42, 0.18) !important;
  background: rgba(15, 23, 42, 0.08) !important;
  color: #0f172a !important;
}

@media (max-width: 960px) {
  .share-image-modal-content {
    grid-template-columns: 1fr;
  }

  .share-image-modal-selection-pane {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    max-height: 240px;
  }

  .ivlyrics-fluent-shell[data-ui-theme="light"] .share-image-modal-selection-pane {
    border-bottom-color: rgba(15, 23, 42, 0.08);
  }
}

@media (max-width: 840px) {
  .ivlyrics-options-root .ivlyrics-popup-setting-row-content {
    grid-template-columns: 1fr;
  }

  .ivlyrics-options-root .ivlyrics-popup-setting-row-right {
    justify-content: flex-start;
  }

  .lyrics-sync-adjust-floating {
    right: 16px;
    left: 16px;
    bottom: 16px;
  }

  .lyrics-sync-adjust-modal-shell {
    width: auto;
    max-height: min(72vh, 760px);
  }

  .lyrics-sync-adjust-layout {
    grid-template-columns: 1fr;
  }

  .lyrics-sync-adjust-side,
  .lyrics-sync-adjust-track {
    width: 100%;
  }

  .lyrics-sync-adjust-track {
    flex-direction: column;
    align-items: stretch;
  }

  .lyrics-sync-adjust-quick {
    flex-wrap: wrap;
  }

  .ivlyrics-first-language-overlay {
    padding: 12px 12px 96px;
  }

  .ivlyrics-first-language-shell {
    width: min(420px, calc(100vw - 24px));
  }
}

/* Compact glass surface shared by toolbar popups and editors */
.ivlyrics-fluent-overlay {
  --iv-popup-bg: rgba(20, 20, 22, 0.78);
  --iv-popup-bg-strong: rgba(28, 28, 31, 0.9);
  --iv-popup-fill: rgba(255, 255, 255, 0.055);
  --iv-popup-fill-hover: rgba(255, 255, 255, 0.095);
  --iv-popup-border: rgba(255, 255, 255, 0.12);
  --iv-popup-divider: rgba(255, 255, 255, 0.085);
  padding: 18px;
  background: rgba(0, 0, 0, 0.42);
  opacity: 0;
  transition: opacity 180ms var(--iv-motion-ease-standard, ease);
}

.ivlyrics-fluent-overlay[data-ui-theme="light"] {
  --iv-popup-bg: rgba(252, 252, 253, 0.82);
  --iv-popup-bg-strong: rgba(255, 255, 255, 0.94);
  --iv-popup-fill: rgba(15, 23, 42, 0.045);
  --iv-popup-fill-hover: rgba(15, 23, 42, 0.075);
  --iv-popup-border: rgba(15, 23, 42, 0.12);
  --iv-popup-divider: rgba(15, 23, 42, 0.085);
  background: rgba(236, 239, 244, 0.55);
}

.ivlyrics-fluent-overlay.is-open {
  opacity: 1;
}

.ivlyrics-fluent-overlay.is-closing {
  pointer-events: none;
}

.ivlyrics-fluent-shell {
  width: min(92vw, 720px);
  background: var(--iv-popup-bg) !important;
  border: 1px solid var(--iv-popup-border) !important;
  border-radius: 24px !important;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.36) !important;
  backdrop-filter: blur(24px) saturate(142%);
  -webkit-backdrop-filter: blur(24px) saturate(142%);
  transform: translateY(12px) scale(0.975);
  opacity: 0;
  transition:
    transform 180ms var(--iv-motion-ease-emphasis, ease),
    opacity 140ms var(--iv-motion-ease-standard, ease);
}

.ivlyrics-fluent-overlay.is-open .ivlyrics-fluent-shell {
  transform: translateY(0) scale(1);
  opacity: 1;
}

.ivlyrics-fluent-overlay.is-closing .ivlyrics-fluent-shell {
  transform: translateY(6px) scale(0.985);
  opacity: 0;
}

.ivlyrics-fluent-header {
  align-items: center;
  min-height: 64px;
  padding: 14px 16px 12px 20px;
  border-bottom-color: var(--iv-popup-divider);
}

.ivlyrics-fluent-title {
  font-size: 18px;
  letter-spacing: -0.025em;
}

.ivlyrics-fluent-subtitle {
  margin-top: 5px;
  line-height: 1.4;
}

.ivlyrics-fluent-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--iv-popup-border);
  border-radius: 999px !important;
  background: var(--iv-popup-fill);
  transition:
    background 140ms ease,
    transform 140ms ease;
}

.ivlyrics-fluent-close:hover {
  background: var(--iv-popup-fill-hover);
  transform: scale(1.04);
}

.ivlyrics-fluent-body {
  padding: 16px 20px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.ivlyrics-fluent-body::-webkit-scrollbar,
.share-image-modal-selection-list::-webkit-scrollbar,
.share-image-modal-config-pane::-webkit-scrollbar {
  width: 5px;
}

.ivlyrics-fluent-body::-webkit-scrollbar-thumb,
.share-image-modal-selection-list::-webkit-scrollbar-thumb,
.share-image-modal-config-pane::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.ivlyrics-fluent-footer {
  padding: 12px 16px 16px;
  border-top-color: var(--iv-popup-divider);
}

.ivlyrics-fluent-btn,
.share-image-modal-footer .ivlyrics-fluent-btn,
.share-image-copyright-actions .ivlyrics-fluent-btn {
  min-height: 34px;
  border-radius: 999px !important;
  border-color: var(--iv-popup-border) !important;
  background: var(--iv-popup-fill) !important;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    transform 140ms ease;
}

.ivlyrics-fluent-btn:hover:not(:disabled) {
  background: var(--iv-popup-fill-hover) !important;
  transform: translateY(-1px);
}

.ivlyrics-fluent-btn.primary,
.share-image-modal-footer .ivlyrics-fluent-btn.primary,
.share-image-copyright-confirm {
  color: var(--spice-text, #fff) !important;
  border-color: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.34) !important;
  background: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.16) !important;
}

.ivlyrics-fluent-close:focus-visible,
.ivlyrics-fluent-btn:focus-visible,
.ivlyrics-popup-switch:focus-visible,
.ivlyrics-options-root .optionsMenu-dropBox:focus-visible,
.share-image-modal button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--spice-rgb-accent, 30, 215, 96), 0.24) !important;
}

.ivlyrics-options-modal-shell {
  width: min(92vw, 700px);
}

.ivlyrics-options-root {
  gap: 14px;
}

.ivlyrics-options-root .ivlyrics-popup-section-title {
  margin-top: 16px;
  padding: 0 4px 8px;
  border: 0;
}

.ivlyrics-options-root .ivlyrics-popup-section-title h3 {
  font-size: 13px;
}

.ivlyrics-options-root .ivlyrics-popup-section-list {
  overflow: hidden;
  border: 1px solid var(--iv-popup-divider);
  border-radius: 16px;
  background: var(--iv-popup-fill);
}

.ivlyrics-options-root .ivlyrics-popup-section-list .ivlyrics-popup-setting-row {
  border-color: var(--iv-popup-divider);
}

.ivlyrics-options-root .ivlyrics-popup-setting-row-content {
  min-height: 54px;
  padding: 10px 14px;
}

.ivlyrics-options-root .ivlyrics-popup-row-icon {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: var(--iv-popup-fill-hover);
}

.ivlyrics-popup-switch {
  border-radius: 999px;
}

.ivlyrics-popup-switch.active {
  border-color: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.36);
  background: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.2);
}

.ivlyrics-popup-switch-knob {
  border-radius: 999px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.24);
}

.ivlyrics-options-root .optionsMenu-dropBox {
  min-height: 34px;
  border-radius: 11px !important;
  border-color: var(--iv-popup-border);
  background: var(--iv-popup-fill);
}

.optionsMenu-dropdown-list {
  max-height: min(320px, 48vh);
  overflow-y: auto;
  border-radius: 14px !important;
  background: var(--iv-popup-bg-strong, rgba(20, 20, 22, 0.96));
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
}

.optionsMenu-item:first-child {
  border-radius: 10px 10px 0 0;
}

.optionsMenu-item:last-child {
  border-radius: 0 0 10px 10px;
}

.lyrics-sync-adjust-floating {
  right: 70px;
  bottom: 16px;
}

.lyrics-sync-adjust-floating .ivlyrics-fluent-shell {
  opacity: 1;
  transform: none;
}

.lyrics-sync-adjust-modal-shell {
  width: min(92vw, 410px);
  border-radius: 22px !important;
  background: rgba(20, 20, 22, 0.8) !important;
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-runnable-track,
.lyrics-sync-adjust-modal .sync-slider::-moz-range-track,
.lyrics-sync-adjust-modal .sync-slider::-moz-range-progress {
  border-radius: 999px;
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-thumb,
.lyrics-sync-adjust-modal .sync-slider::-moz-range-thumb {
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}

.share-image-modal-lyric-line,
.share-image-advanced-panel,
.share-image-preview-panel,
.share-image-preview-panel img,
.share-image-copyright-points {
  border-radius: 14px !important;
}

.share-image-chip,
.share-image-segment-btn,
.share-image-advanced-toggle,
.share-image-modal button:not(.ivlyrics-fluent-close):not(.ivlyrics-fluent-btn) {
  border-radius: 999px !important;
}

.share-image-copyright-shell {
  border-radius: 22px !important;
  background: var(--iv-popup-bg) !important;
}

.share-image-copyright-icon {
  border-radius: 999px;
  background: rgba(var(--spice-rgb-accent, 30, 215, 96), 0.14);
  color: var(--spice-accent, #1ed760);
}

/* The first-language card is non-modal and contained by the current ivLyrics page. */
.ivlyrics-fluent-overlay.ivlyrics-first-language-overlay {
  position: absolute;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 20px 24px 24px;
  background: transparent !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
}

.ivlyrics-fluent-shell.ivlyrics-first-language-shell {
  box-sizing: border-box;
  width: min(340px, 100%);
  max-height: min(560px, 100%);
  background: var(--surface) !important;
  border-color: var(--line-2) !important;
  border-radius: 10px !important;
  box-shadow: var(--shadow-2) !important;
  color: var(--text);
  font-family: var(--font);
  pointer-events: auto;
}

.ivlyrics-fluent-shell.ivlyrics-first-language-shell[data-ui-theme="light"] {
  background: var(--surface) !important;
  border-color: var(--line-2) !important;
  box-shadow: var(--shadow-2) !important;
  color: var(--text);
}

@media (max-width: 840px) {
  .ivlyrics-fluent-overlay {
    padding: 10px;
  }

  .ivlyrics-fluent-shell {
    max-height: calc(100dvh - 20px);
    border-radius: 20px !important;
  }

  .ivlyrics-options-root .ivlyrics-popup-setting-row-content {
    gap: 8px;
  }

  .lyrics-sync-adjust-floating {
    right: 12px;
    left: 12px;
    bottom: 12px;
  }

  .ivlyrics-fluent-overlay.ivlyrics-first-language-overlay {
    padding: 12px;
  }

  .ivlyrics-fluent-shell.ivlyrics-first-language-shell {
    width: min(340px, 100%);
    max-height: calc(100% - 24px);
    border-radius: 10px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ivlyrics-fluent-overlay,
  .ivlyrics-fluent-shell {
    transition-duration: 1ms !important;
  }
}
`;
