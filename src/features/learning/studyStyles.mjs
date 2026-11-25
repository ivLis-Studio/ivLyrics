const STUDY_STYLES_ID = "ivlyrics-learning-mode-styles";
const styles = `
.ivlyrics-study-button.active {
  color: var(--spice-button-active, #1ed760);
}

.ivlyrics-study-panel {
  position: absolute;
  top: 72px;
  right: 24px;
  width: min(430px, calc(100vw - 32px));
  max-height: calc(100% - 104px);
  z-index: var(--iv-layer-panel, 1000);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #f8fafc;
  background: rgba(12, 12, 12, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(18px);
  border-radius: 8px;
}

.ivlyrics-study-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-study-title-wrap {
  min-width: 0;
}

.ivlyrics-study-eyebrow {
  margin-bottom: 6px;
  color: rgba(34, 197, 94, 0.92);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.ivlyrics-study-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0;
}

.ivlyrics-study-track {
  margin: 6px 0 0;
  color: rgba(248, 250, 252, 0.62);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ivlyrics-study-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.ivlyrics-study-theme-toggle,
.ivlyrics-study-close {
  width: 32px;
  height: 32px;
  border: 0;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: rgba(248, 250, 252, 0.72);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
}

.ivlyrics-study-theme-toggle {
  font-size: 15px;
  font-weight: 900;
}

.ivlyrics-study-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ivlyrics-study-tab,
.ivlyrics-study-primary,
.ivlyrics-study-secondary,
.ivlyrics-study-mini,
.ivlyrics-study-lyric-play,
.ivlyrics-study-choice,
.ivlyrics-study-word-chip {
  font: inherit;
}

.ivlyrics-study-tab {
  min-height: 34px;
  border: 1px solid transparent;
  color: rgba(248, 250, 252, 0.62);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
}

.ivlyrics-study-tab.active {
  color: #f8fafc;
  background: rgba(34, 197, 94, 0.16);
  border-color: rgba(34, 197, 94, 0.35);
}

.ivlyrics-study-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.ivlyrics-study-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ivlyrics-study-card,
.ivlyrics-study-empty,
.ivlyrics-study-error,
.ivlyrics-study-note {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.ivlyrics-study-card {
  padding: 14px;
}

.ivlyrics-study-card h3 {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.35;
  font-weight: 800;
  letter-spacing: 0;
}

.ivlyrics-study-card p {
  margin: 0;
  color: rgba(248, 250, 252, 0.76);
  font-size: 13px;
  line-height: 1.6;
}

.ivlyrics-study-current {
  border-color: rgba(34, 197, 94, 0.32);
}

.ivlyrics-study-translation {
  color: #f8fafc !important;
  font-weight: 700;
  margin-bottom: 8px !important;
}

.ivlyrics-study-empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  gap: 12px;
  padding: 22px;
  text-align: center;
  color: rgba(248, 250, 252, 0.68);
}

.ivlyrics-study-empty p {
  margin: 0;
}

.ivlyrics-study-primary,
.ivlyrics-study-secondary,
.ivlyrics-study-mini {
  border: 0;
  color: #04130a;
  background: #22c55e;
  font-weight: 800;
  cursor: pointer;
  border-radius: 6px;
}

.ivlyrics-study-primary {
  min-height: 40px;
  padding: 0 18px;
}

.ivlyrics-study-secondary {
  min-height: 34px;
  padding: 0 12px;
  color: #f8fafc;
  background: rgba(34, 197, 94, 0.18);
  border: 1px solid rgba(34, 197, 94, 0.34);
}

.ivlyrics-study-actions {
  display: flex;
  justify-content: flex-end;
}

.ivlyrics-study-mini {
  min-height: 28px;
  padding: 0 10px;
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.09);
}

.ivlyrics-study-mini.danger {
  color: #fecaca;
}

.ivlyrics-study-lyric-play {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 0 11px;
  border: 1px solid #60a5fa;
  color: #0b3b72;
  background: #e7f3ff;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: inset 0 -2px 0 rgba(29, 78, 216, 0.12);
}

.ivlyrics-study-lyric-play:hover {
  color: #062d59;
  background: #d7ebff;
  border-color: #3b82f6;
}

.ivlyrics-study-lyric-play:disabled {
  opacity: 0.45;
  cursor: default;
}

.ivlyrics-study-lyric-play span {
  display: inline !important;
  margin-bottom: 0 !important;
  color: inherit !important;
  font-size: inherit !important;
  text-align: left !important;
}

.ivlyrics-study-lyric-play span:first-child {
  font-size: 10px;
  line-height: 1;
}

.ivlyrics-study-list {
  margin: 10px 0 0;
  padding-left: 18px;
  color: rgba(248, 250, 252, 0.72);
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-vocab-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ivlyrics-study-word-chip {
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(248, 250, 252, 0.84);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}

.ivlyrics-study-expression,
.ivlyrics-study-word {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ivlyrics-study-expression > div,
.ivlyrics-study-word > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.ivlyrics-study-expression strong,
.ivlyrics-study-word strong {
  color: #f8fafc;
}

.ivlyrics-study-expression span,
.ivlyrics-study-word span {
  color: rgba(248, 250, 252, 0.68);
  font-size: 12px;
  text-align: right;
}

.ivlyrics-study-expression-actions {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  flex-wrap: wrap;
}

.ivlyrics-study-grammar-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.ivlyrics-study-grammar-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ivlyrics-study-grammar-note strong {
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.4;
}

.ivlyrics-study-grammar-note p {
  margin: 0;
  color: rgba(248, 250, 252, 0.76);
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-grammar-note small {
  color: rgba(248, 250, 252, 0.56);
  font-size: 12px;
  line-height: 1.45;
}

.ivlyrics-study-score,
.ivlyrics-study-note {
  padding: 10px 12px;
  color: rgba(248, 250, 252, 0.72);
  font-size: 12px;
}

.ivlyrics-study-quiz {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ivlyrics-study-choice {
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(248, 250, 252, 0.82);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
}

.ivlyrics-study-choice.selected {
  border-color: rgba(59, 130, 246, 0.62);
}

.ivlyrics-study-choice.correct {
  border-color: rgba(34, 197, 94, 0.62);
  background: rgba(34, 197, 94, 0.12);
}

.ivlyrics-study-choice.wrong {
  border-color: rgba(248, 113, 113, 0.62);
  background: rgba(248, 113, 113, 0.12);
}

.ivlyrics-study-quiz-explanation {
  margin-top: 6px !important;
  color: rgba(248, 250, 252, 0.68) !important;
}

.ivlyrics-study-error {
  margin-bottom: 12px;
  padding: 10px 12px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.32);
}

.ivlyrics-study-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.16);
  border-top-color: #22c55e;
  border-radius: 50%;
  animation: ivlyricsStudySpin 0.8s linear infinite;
}

@keyframes ivlyricsStudySpin {
  to { transform: rotate(360deg); }
}

@media (max-width: 720px) {
  .ivlyrics-study-panel {
    top: 64px;
    right: 12px;
    left: 12px;
    width: auto;
    max-height: calc(100% - 84px);
  }
}

.ivlyrics-study-panel {
  --lm-bg: #f4f6f8;
  --lm-surface: #ffffff;
  --lm-surface-2: #f2f4f6;
  --lm-border: #eaecf0;
  --lm-text-1: #191f28;
  --lm-text-2: #4e5968;
  --lm-text-3: #8b95a1;
  --lm-accent: #1c8cff;
  --lm-accent-soft: #e7f3ff;
  --lm-good: #2fb36d;
  --lm-good-soft: #e7f8ee;
  --lm-bad: #e34b3f;
  --lm-bad-soft: #fff0ed;
  --lm-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03);
  --lm-shadow-md: 0 8px 24px rgba(15, 23, 42, 0.06), 0 2px 6px rgba(15, 23, 42, 0.04);
  position: fixed;
  inset: 0;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: auto;
  max-height: none;
  z-index: 2147483000;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: var(--lm-text-1);
  background: var(--lm-bg);
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.ivlyrics-study-panel.theme-dark {
  --lm-bg: #101418;
  --lm-surface: #171d23;
  --lm-surface-2: #202832;
  --lm-border: #2e3844;
  --lm-text-1: #f4f7fb;
  --lm-text-2: #c5ced8;
  --lm-text-3: #8d98a6;
  --lm-accent: #74b9ff;
  --lm-accent-soft: #163a5c;
  --lm-good: #58cc02;
  --lm-good-soft: #173b1f;
  --lm-bad: #ff6b5f;
  --lm-bad-soft: #3f1d1d;
  --lm-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 1px rgba(0, 0, 0, 0.24);
  --lm-shadow-md: 0 18px 48px rgba(0, 0, 0, 0.34), 0 2px 8px rgba(0, 0, 0, 0.2);
}

.ivlyrics-study-panel button,
.ivlyrics-study-panel input {
  font: inherit;
}

.ivlyrics-study-panel button {
  transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.ivlyrics-study-panel button:not(:disabled):active {
  transform: translateY(1px);
}

.ivlyrics-study-panel button:focus-visible,
.ivlyrics-study-panel input:focus-visible {
  outline: 2px solid var(--lm-accent);
  outline-offset: 2px;
}

.ivlyrics-study-header {
  align-items: center;
  gap: 18px;
  padding: 18px clamp(18px, 4vw, 48px);
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-bottom: 1px solid var(--lm-border);
}

.ivlyrics-study-eyebrow {
  color: var(--lm-accent);
  font-size: 12px;
  letter-spacing: 0;
}

.ivlyrics-study-title {
  color: var(--lm-text-1);
  font-size: clamp(22px, 3vw, 34px);
}

.ivlyrics-study-track {
  color: var(--lm-text-2);
  font-size: 13px;
}

.ivlyrics-study-theme-toggle,
.ivlyrics-study-close {
  width: 42px;
  height: 42px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 8px;
}

.ivlyrics-study-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: clamp(18px, 3vw, 36px);
  overflow: hidden;
  padding: clamp(18px, 3vw, 36px);
}

.ivlyrics-study-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ivlyrics-study-tabs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  border: 0;
}

.ivlyrics-study-tab {
  min-height: 54px;
  padding: 0 16px;
  border: 2px solid #d9e2d6;
  color: #374238;
  background: #ffffff;
  border-radius: 8px;
  font-weight: 800;
  text-align: left;
}

.ivlyrics-study-tab.active {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #58cc02;
  box-shadow: inset 0 -3px 0 rgba(88, 167, 0, 0.26);
}

.ivlyrics-study-rail-card,
.ivlyrics-study-card,
.ivlyrics-study-empty,
.ivlyrics-study-error,
.ivlyrics-study-note {
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
}

.ivlyrics-study-rail-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.ivlyrics-study-rail-card span {
  color: #667369;
  font-size: 12px;
  font-weight: 800;
}

.ivlyrics-study-rail-card strong {
  color: #58a700;
  font-size: 34px;
  line-height: 1;
}

.ivlyrics-study-rail-card p {
  margin: 0;
  color: #4d5a52;
  font-size: 13px;
  line-height: 1.45;
}

.ivlyrics-study-rail-progress {
  height: 7px;
  overflow: hidden;
  background: var(--lm-surface-2);
  border-radius: 999px;
}

.ivlyrics-study-rail-progress > div {
  height: 100%;
  background: var(--lm-accent);
  border-radius: inherit;
  transition: width 0.24s ease;
}

.ivlyrics-study-rail-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.ivlyrics-study-rail-stats > div {
  min-width: 0;
  padding: 8px;
  background: var(--lm-surface-2);
  border-radius: 8px;
}

.ivlyrics-study-rail-stats span,
.ivlyrics-study-rail-stats strong {
  display: block;
}

.ivlyrics-study-rail-stats span {
  color: var(--lm-text-3);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.ivlyrics-study-rail-stats strong {
  margin-top: 3px;
  color: var(--lm-text-1);
  font-size: 17px;
  line-height: 1;
}

.ivlyrics-study-difficulty {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.ivlyrics-study-difficulty-head {
  display: grid;
  gap: 3px;
}

.ivlyrics-study-difficulty-head span {
  color: var(--lm-text-1);
  font-size: 13px;
  font-weight: 900;
}

.ivlyrics-study-difficulty-head small {
  color: var(--lm-text-3);
  font-size: 12px;
  line-height: 1.4;
}

.ivlyrics-study-difficulty-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ivlyrics-study-difficulty-options button {
  min-height: 38px;
  padding: 0 10px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.ivlyrics-study-difficulty-options button.active {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #58cc02;
  box-shadow: inset 0 -2px 0 rgba(88, 167, 0, 0.22);
}

.ivlyrics-study-difficulty-options button:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.ivlyrics-study-difficulty-options.compact {
  display: flex;
  flex-wrap: wrap;
}

.ivlyrics-study-difficulty-options.compact button {
  min-height: 34px;
  padding: 0 12px;
}

.ivlyrics-study-quiz-tools {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 14px;
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 12px;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-quiz-difficulty {
  display: grid;
  gap: 8px;
  min-width: min(460px, 100%);
}

.ivlyrics-study-quiz-difficulty > span {
  color: var(--lm-text-2);
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-quiz-tools > .ivlyrics-study-secondary {
  width: auto;
  min-width: 150px;
}

.ivlyrics-study-stage {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 10px 14px 32px;
  scrollbar-gutter: stable;
}

.ivlyrics-study-section {
  width: min(920px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ivlyrics-study-card {
  padding: clamp(18px, 3vw, 28px);
}

.ivlyrics-study-current {
  border: 2px solid #58cc02;
  box-shadow: 0 12px 32px rgba(88, 204, 2, 0.14);
}

.ivlyrics-study-card h3 {
  margin: 0 0 14px;
  color: #172018;
  font-size: clamp(18px, 2.2vw, 26px);
  line-height: 1.25;
}

.ivlyrics-study-card p {
  color: #3f4b43;
  font-size: 15px;
  line-height: 1.65;
}

.ivlyrics-study-source-card {
  margin-bottom: 16px;
  padding: 16px;
  color: #172018;
  background: #f0f8ff;
  border: 1px solid #c8def4;
  border-radius: 8px;
}

.ivlyrics-study-source-card.compact {
  margin-bottom: 10px;
  padding: 12px;
}

.ivlyrics-study-source-card span {
  display: block;
  margin-bottom: 8px;
  color: #2870a8;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-source-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.ivlyrics-study-source-head span {
  margin-bottom: 0;
}

.ivlyrics-study-source-head .ivlyrics-study-lyric-play {
  flex: 0 0 auto;
}

.ivlyrics-study-source-card blockquote {
  margin: 0;
  color: #172018;
  font-size: clamp(18px, 2.5vw, 28px);
  line-height: 1.35;
  font-weight: 850;
  overflow-wrap: anywhere;
}

.ivlyrics-study-source-card.compact blockquote {
  font-size: 18px;
}

.ivlyrics-study-source-inline {
  padding: 10px 12px;
  color: #315f87 !important;
  background: #eef7ff;
  border-radius: 8px;
  overflow-wrap: anywhere;
}

.ivlyrics-study-reading-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ivlyrics-study-reading-row {
  min-width: min(240px, 100%);
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  color: #172018;
  background: #fff7df;
  border: 1px solid #f2d276;
  border-radius: 8px;
}

.ivlyrics-study-reading-row span {
  display: inline;
  flex: 0 0 auto;
  margin-bottom: 0;
  color: #8a6400;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-reading-row strong {
  min-width: 0;
  color: #172018;
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ivlyrics-study-translation {
  color: #172018 !important;
  font-size: 17px !important;
  font-weight: 850;
}

.ivlyrics-study-list {
  color: #4d5a52;
  font-size: 14px;
}

.ivlyrics-study-empty {
  width: min(720px, 100%);
  min-height: min(560px, 100%);
  margin: 0 auto;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  padding: clamp(28px, 5vw, 56px);
  color: #4d5a52;
}

.ivlyrics-study-empty p {
  max-width: 460px;
  color: #4d5a52;
  font-size: 16px;
  line-height: 1.55;
}

.ivlyrics-study-primary,
.ivlyrics-study-secondary,
.ivlyrics-study-mini {
  min-height: 44px;
  border: 0;
  color: #ffffff;
  background: #58cc02;
  border-radius: 8px;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.18);
}

.ivlyrics-study-secondary {
  width: 100%;
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
}

.ivlyrics-study-secondary:disabled,
.ivlyrics-study-primary:disabled {
  color: #7a857d;
  background: #e5ebef;
  border-color: #d5dde2;
  box-shadow: none;
  cursor: not-allowed;
}

.ivlyrics-study-mini {
  width: fit-content;
  min-height: 34px;
  padding: 0 14px;
  background: #1cb0f6;
}

.ivlyrics-study-mini.danger {
  color: #ffffff;
  background: #ff4b4b;
}

.ivlyrics-study-vocab-list {
  gap: 10px;
}

.ivlyrics-study-word-chip {
  border: 1px solid #c6d3c1;
  color: #1c4700;
  background: #eef8e8;
  border-radius: 8px;
}

.ivlyrics-study-word-chip.saved,
.ivlyrics-study-mini.saved {
  color: #0b7a35;
  background: var(--lm-good-soft);
  border-color: #b9ebc8;
}

.ivlyrics-study-word-chip.feedback,
.ivlyrics-study-mini.feedback {
  animation: ivlyricsStudySavedPulse 0.42s ease;
}

.ivlyrics-study-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ivlyrics-study-section-head h3 {
  margin-bottom: 4px;
}

.ivlyrics-study-section-head p {
  margin: 0;
  color: #667369;
  font-size: 13px;
  line-height: 1.5;
}

.ivlyrics-study-section-head > span {
  min-width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
}

.ivlyrics-study-expression,
.ivlyrics-study-word {
  padding: 14px 0;
  border-top: 1px solid #e4ece1;
}

.ivlyrics-study-expression:first-of-type,
.ivlyrics-study-word:first-of-type {
  border-top: 0;
}

.ivlyrics-study-expression strong,
.ivlyrics-study-word strong {
  color: #172018;
  font-size: 16px;
}

.ivlyrics-study-expression span,
.ivlyrics-study-word span {
  color: #54615a;
  font-size: 13px;
}

.ivlyrics-study-expansion-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ivlyrics-study-expression-main {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start !important;
  gap: 12px !important;
}

.ivlyrics-study-expression-main > div {
  min-width: 0;
}

.ivlyrics-study-expression-main strong {
  display: block;
  overflow-wrap: anywhere;
}

.ivlyrics-study-expression-main span {
  display: block;
  margin-top: 4px;
  text-align: left;
}

.ivlyrics-study-expression-groups {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px !important;
}

.ivlyrics-study-expression-groups > div {
  min-width: 0;
  padding: 10px;
  background: #f6f9f4;
  border: 1px solid #e1ebdc;
  border-radius: 8px;
}

.ivlyrics-study-expression-groups span {
  display: block;
  margin-bottom: 7px;
  color: #58a700;
  font-size: 11px;
  font-weight: 900;
  text-align: left;
}

.ivlyrics-study-expression-groups div div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ivlyrics-study-expression-groups em {
  min-width: 0;
  padding: 4px 7px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.ivlyrics-study-score,
.ivlyrics-study-note {
  padding: 12px 14px;
  color: #4d5a52;
  font-size: 13px;
}

.ivlyrics-study-score {
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  font-weight: 900;
}

.ivlyrics-study-quiz {
  gap: 12px;
}

.ivlyrics-study-choice {
  min-height: 56px;
  padding: 13px 16px;
  border: 2px solid #d9e2d6;
  color: #172018;
  background: #ffffff;
  border-radius: 8px;
  font-weight: 800;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.08);
}

.ivlyrics-study-choice.selected {
  border-color: #1cb0f6;
  background: #ddf4ff;
}

.ivlyrics-study-choice.correct {
  border-color: #58cc02;
  background: #d7ffb8;
}

.ivlyrics-study-choice.wrong {
  border-color: #ff4b4b;
  background: #ffe7e7;
}

.ivlyrics-study-quiz-explanation {
  color: #4d5a52 !important;
  background: #f4f7f2;
  padding: 12px;
  border-radius: 8px;
}

.ivlyrics-study-error {
  width: min(920px, 100%);
  margin: 0 auto 16px;
  padding: 12px 14px;
  color: #8b1e1e;
  background: #ffe7e7;
  border-color: #ffc0c0;
}

.ivlyrics-study-loading-banner {
  width: min(920px, 100%);
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  border-radius: 8px;
  font-weight: 800;
}

.ivlyrics-study-loading-banner p {
  margin: 0;
  color: #1c4700;
  font-size: 13px;
  line-height: 1.4;
}

.ivlyrics-study-spinner {
  border-color: #d9e2d6;
  border-top-color: #58cc02;
}

.ivlyrics-study-quiz-stage {
  width: min(1120px, 100%);
}

.ivlyrics-study-quiz-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  color: #7b8790;
  font-size: 14px;
  font-weight: 800;
}

.ivlyrics-study-quiz-topline > div:first-child {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ivlyrics-study-quiz-badge {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 18px;
  color: #0875c9;
  background: #e3f2ff;
  border-radius: 999px;
  font-weight: 900;
}

.ivlyrics-study-quiz.quiz-type-blank {
  background: #fffdf7;
}

.ivlyrics-study-quiz.quiz-type-usage,
.ivlyrics-study-quiz.quiz-type-rewrite {
  background: #f7fbff;
}

.ivlyrics-study-quiz.quiz-type-grammar {
  background: #fffaf0;
}

.ivlyrics-study-quiz-score-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.ivlyrics-study-quiz-score-row span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-quiz-score-row .correct {
  color: #0b7a35;
  background: var(--lm-good-soft);
}

.ivlyrics-study-quiz-score-row .wrong {
  color: #8a120d;
  background: var(--lm-bad-soft);
}

.ivlyrics-study-quiz-progress {
  flex: 0 0 100%;
  height: 7px;
  overflow: hidden;
  background: var(--lm-surface-2);
  border-radius: 999px;
}

.ivlyrics-study-quiz-progress > div {
  height: 100%;
  background: var(--lm-accent);
  border-radius: inherit;
  transition: width 0.24s ease;
}

.ivlyrics-study-quiz {
  gap: 20px;
  padding: clamp(22px, 4vw, 40px);
  border: 0;
  box-shadow: 0 20px 60px rgba(31, 42, 55, 0.08);
}

.ivlyrics-study-quiz-prompt {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ivlyrics-study-quiz-prompt > p {
  margin: 0;
  color: #8a94a3;
  font-size: 18px;
  font-weight: 900;
}

.ivlyrics-study-blank-question {
  margin: 0;
  color: #18202c;
  font-size: clamp(28px, 4vw, 50px);
  line-height: 1.18;
  font-weight: 950;
  overflow-wrap: anywhere;
}

.ivlyrics-study-blank-question .blank {
  display: inline-flex;
  align-items: center;
  min-width: 3.2em;
  justify-content: center;
  margin: 0 0.12em;
  color: #0875c9;
  background: #e3f2ff;
  border-bottom: 5px solid #1cb0f6;
  border-radius: 8px 8px 4px 4px;
  line-height: 1.05;
}

.ivlyrics-study-quiz-prompt .ivlyrics-study-source-card {
  margin: 0;
  background: #f1f4f7;
  border-color: #e3e8ee;
}

.ivlyrics-study-quiz-prompt .ivlyrics-study-source-card blockquote {
  color: #18202c;
  font-size: clamp(28px, 4.5vw, 56px);
  line-height: 1.12;
}

.ivlyrics-study-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 18px;
}

.ivlyrics-study-choice {
  position: relative;
  min-height: 76px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  border: 2px solid #e1e6ed;
  color: #18202c;
  background: #ffffff;
  border-radius: 14px;
  font-weight: 900;
  box-shadow: none;
}

.ivlyrics-study-choice:disabled {
  cursor: default;
}

.ivlyrics-study-choice strong {
  min-width: 0;
  color: inherit;
  font-size: clamp(16px, 1.8vw, 22px);
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.ivlyrics-study-choice-letter {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: #8a94a3;
  background: #f0f3f6;
  border-radius: 10px;
  font-weight: 900;
}

.ivlyrics-study-choice-mark {
  color: currentColor;
  font-size: 34px;
  line-height: 1;
}

.ivlyrics-study-choice.selected {
  border-color: #1cb0f6;
  background: #e6f5ff;
}

.ivlyrics-study-choice.correct {
  color: #0a5428;
  border-color: #2fb36d;
  background: #dbfbe7;
}

.ivlyrics-study-choice.correct .ivlyrics-study-choice-letter {
  color: #ffffff;
  background: #2fb36d;
}

.ivlyrics-study-choice.wrong {
  color: #8a120d;
  border-color: #e34b3f;
  background: #fff0ed;
}

.ivlyrics-study-choice.wrong .ivlyrics-study-choice-letter {
  color: #ffffff;
  background: #e34b3f;
}

.ivlyrics-study-quiz-explanation {
  margin: 0 !important;
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px solid #cfe4f7;
  background: #e9f5ff;
}

.ivlyrics-study-quiz-explanation.correct {
  border-color: #b9ebc8;
  background: #e8faed;
}

.ivlyrics-study-quiz-explanation.wrong {
  border-color: #cfe4f7;
  background: #e9f5ff;
}

.ivlyrics-study-quiz-explanation strong {
  display: block;
  margin-bottom: 8px;
  color: #0875c9;
  font-size: 15px;
  font-weight: 900;
}

.ivlyrics-study-quiz-explanation.correct strong {
  color: #0b7a35;
}

.ivlyrics-study-quiz-explanation p {
  margin: 0;
  color: #18202c !important;
  font-size: 16px;
  line-height: 1.65;
}

.ivlyrics-study-quiz-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid #e4e9ef;
}

.ivlyrics-study-wrong-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border-radius: 12px;
}

.ivlyrics-study-wrong-strip > span {
  color: var(--lm-text-3);
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-wrong-strip button {
  max-width: 240px;
  padding: 7px 10px;
  color: #8a120d;
  background: #ffffff;
  border: 1px solid #f0d0ce;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ivlyrics-study-quiz-result {
  gap: 22px;
  padding: clamp(24px, 4vw, 42px);
}

.ivlyrics-study-result-hero {
  display: grid;
  gap: 8px;
  padding: clamp(18px, 3vw, 28px);
  color: #18310b;
  background: linear-gradient(180deg, #e8ffd7 0%, #f7fff1 100%);
  border: 1px solid #c8f2ad;
  border-radius: 18px;
}

.ivlyrics-study-result-kicker {
  color: #3f8f00;
  font-size: 13px;
  font-weight: 900;
}

.ivlyrics-study-result-hero strong {
  color: #18202c;
  font-size: clamp(54px, 9vw, 96px);
  line-height: 0.95;
  letter-spacing: 0;
}

.ivlyrics-study-result-hero p {
  max-width: 720px;
  margin: 0;
  color: #315315;
  font-size: clamp(16px, 2vw, 22px);
  font-weight: 900;
  line-height: 1.4;
}

.ivlyrics-study-result-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ivlyrics-study-result-stats > div {
  min-height: 86px;
  display: grid;
  align-content: center;
  gap: 5px;
  padding: 16px;
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 14px;
}

.ivlyrics-study-result-stats span {
  color: var(--lm-text-3);
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-result-stats strong {
  color: var(--lm-text-1);
  font-size: 26px;
  font-weight: 900;
}

.ivlyrics-study-review-list {
  display: grid;
  gap: 14px;
}

.ivlyrics-study-review-head {
  display: grid;
  gap: 4px;
}

.ivlyrics-study-review-head h3,
.ivlyrics-study-review-head p {
  margin: 0;
}

.ivlyrics-study-review-head p {
  color: var(--lm-text-2);
  font-size: 14px;
  font-weight: 700;
}

.ivlyrics-study-review-item {
  display: grid;
  gap: 12px;
  padding: 18px;
  background: #fff8f7;
  border: 1px solid #f3d2ce;
  border-radius: 16px;
}

.ivlyrics-study-review-source {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid #f0d0ce;
  border-radius: 12px;
}

.ivlyrics-study-review-source blockquote {
  margin: 0;
  color: #18202c;
  font-size: 18px;
  font-weight: 900;
  line-height: 1.35;
}

.ivlyrics-study-review-question {
  margin: 0;
  color: var(--lm-text-1);
  font-size: 16px;
  font-weight: 900;
  line-height: 1.45;
}

.ivlyrics-study-review-answers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ivlyrics-study-review-answers span {
  min-width: 0;
  padding: 11px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ivlyrics-study-review-answers .wrong {
  color: #8a120d;
  background: #ffe9e6;
  border: 1px solid #f3c3bd;
}

.ivlyrics-study-review-answers .correct {
  color: #0a5428;
  background: #e8faed;
  border: 1px solid #b9ebc8;
}

.ivlyrics-study-review-explanation {
  margin: 0;
  color: var(--lm-text-2);
  font-size: 15px;
  line-height: 1.6;
}

.ivlyrics-study-no-wrong {
  padding: 18px;
  color: #0a5428;
  background: #e8faed;
  border: 1px solid #b9ebc8;
  border-radius: 16px;
  font-weight: 900;
}

.ivlyrics-study-result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 18px;
  border-top: 1px solid var(--lm-border);
}

.ivlyrics-study-primary.dark {
  min-width: 160px;
  color: #ffffff;
  background: #18202c;
}

.ivlyrics-study-secondary.subtle {
  width: auto;
  min-width: 130px;
  color: #65717e;
  background: #f0f3f6;
  border-color: #f0f3f6;
  box-shadow: none;
}

.ivlyrics-study-wordbook {
  width: min(1040px, 100%);
}

.ivlyrics-study-history {
  width: min(1040px, 100%);
}

.ivlyrics-study-wordbook-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 22px 24px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
}

.ivlyrics-study-wordbook-hero span {
  color: #58a700;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-wordbook-hero h3 {
  margin: 4px 0 0;
  color: #172018;
  font-size: 24px;
  line-height: 1.2;
}

.ivlyrics-study-wordbook-hero strong {
  color: #1c4700;
  background: #d7ffb8;
  border: 1px solid #9de16b;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 15px;
}

.ivlyrics-study-history-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.ivlyrics-study-history-card {
  min-width: 0;
}

.ivlyrics-study-history-card button {
  width: 100%;
  min-height: 128px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-history-card.active button {
  border-color: #58cc02;
  box-shadow: 0 0 0 3px rgba(88, 204, 2, 0.16), var(--lm-shadow-sm);
}

.ivlyrics-study-history-card strong {
  display: block;
  color: #172018;
  font-size: 18px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.ivlyrics-study-history-card span {
  display: block;
  margin-top: 6px;
  color: #4d5a52;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.ivlyrics-study-history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ivlyrics-study-history-meta em {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border: 1px solid var(--lm-border);
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.ivlyrics-study-history-meta em.current {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #9de16b;
}

.ivlyrics-study-word-tools {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.ivlyrics-study-word-search {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  color: var(--lm-text-3);
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 12px;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-word-search span {
  font-size: 18px;
  line-height: 1;
}

.ivlyrics-study-word-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--lm-text-1);
  background: transparent;
}

.ivlyrics-study-word-search input::placeholder {
  color: var(--lm-text-3);
}

.ivlyrics-study-word-stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ivlyrics-study-word-stat-row span {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  color: var(--lm-text-2);
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-word-scope {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ivlyrics-study-word-scope button {
  min-height: 34px;
  padding: 0 12px;
  color: var(--lm-text-2);
  background: var(--lm-surface);
  border: 1px solid var(--lm-border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.ivlyrics-study-word-scope button.active {
  color: #1c4700;
  background: #d7ffb8;
  border-color: #58cc02;
}

.ivlyrics-study-word-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.ivlyrics-study-word-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #dce6d8;
  border-radius: 8px;
  box-shadow: var(--lm-shadow-sm);
}

.ivlyrics-study-word-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
}

.ivlyrics-study-word-head strong {
  display: block;
  color: #172018;
  font-size: 22px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.ivlyrics-study-word-head span {
  display: block;
  margin-top: 6px;
  color: #4d5a52;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ivlyrics-study-word-head em {
  display: block;
  margin-top: 8px;
  color: var(--lm-accent);
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.ivlyrics-study-word-remove {
  width: 34px;
  height: 34px;
  border: 0;
  display: grid;
  place-items: center;
  color: #9aa4ad;
  background: #f0f3f6;
  border-radius: 8px;
  font: inherit;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.ivlyrics-study-word-remove:hover {
  color: #8a120d;
  background: #fff0ed;
}

.ivlyrics-study-word-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ivlyrics-study-word-actions button {
  min-height: 32px;
  padding: 0 10px;
  color: var(--lm-accent);
  background: var(--lm-accent-soft);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.ivlyrics-study-word-actions .ivlyrics-study-lyric-play {
  color: #0b3b72;
  background: #e7f3ff;
  border: 1px solid #60a5fa;
  border-radius: 6px;
}

.ivlyrics-study-word-source,
.ivlyrics-study-word-note {
  margin: 0;
  color: #4d5a52;
  font-size: 14px;
  line-height: 1.6;
}

.ivlyrics-study-word-source {
  padding: 12px;
  color: #315f87;
  background: #eef7ff;
  border-radius: 8px;
}

.ivlyrics-study-word-grammar {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  color: #6b4e00;
  background: #fff7df;
  border: 1px solid #f2d276;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-word-grammar .ivlyrics-study-grammar-note strong {
  color: #6b4e00;
}

.ivlyrics-study-word-grammar .ivlyrics-study-grammar-note p,
.ivlyrics-study-word-grammar .ivlyrics-study-grammar-note small {
  color: #6b5a24;
}

.ivlyrics-study-panel .ivlyrics-study-grammar-note strong {
  color: #172018;
}

.ivlyrics-study-panel .ivlyrics-study-grammar-note p {
  color: #4d5a52;
}

.ivlyrics-study-panel .ivlyrics-study-grammar-note small {
  color: #667369;
}

.ivlyrics-study-grammar-card {
  background: #fffdf7;
  border-color: #f2d276;
}

.ivlyrics-study-grammar-lessons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ivlyrics-study-grammar-lesson {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
  color: #172018;
  background: #ffffff;
  border: 1px solid #efe3bd;
  border-radius: 8px;
}

.ivlyrics-study-grammar-index {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #6b4e00;
  background: #fff2bf;
  border: 1px solid #f2d276;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 950;
}

.ivlyrics-study-grammar-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ivlyrics-study-grammar-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note strong {
  color: #6b4e00;
  font-size: 14px;
}

.ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note p,
.ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note small {
  color: #4d5a52;
}

.ivlyrics-study-grammar-lesson blockquote {
  margin: 0;
  padding: 10px 12px;
  color: #315f87;
  background: #eaf4ff;
  border-left: 3px solid #7fb4ff;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.55;
}

.ivlyrics-study-grammar-translation {
  color: #172018 !important;
  font-weight: 800;
}

.ivlyrics-study-grammar-context {
  color: #4d5a52 !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-header,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-card,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-card,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-empty,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-error,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-note,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-card {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-body {
  background: var(--lm-bg);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-card h3,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-head strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero h3,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-note strong {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-card p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-head span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-section-head p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-source,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-note,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-note p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-note small {
  color: var(--lm-text-2);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-tab {
  color: var(--lm-text-2);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-tab.active {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
  box-shadow: inset 0 -3px 0 rgba(88, 204, 2, 0.28);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-secondary,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-theme-toggle,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-close,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-loading-banner,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-remove {
  color: var(--lm-text-1);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-loading-banner p {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-wordbook-hero strong {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-difficulty-options button {
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-difficulty-options button.active {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card button {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card.active button {
  border-color: #58cc02;
  box-shadow: 0 0 0 3px rgba(88, 204, 2, 0.16), var(--lm-shadow-sm);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card strong {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-card span {
  color: var(--lm-text-2);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-meta em {
  color: var(--lm-text-2);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-history-meta em.current {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-card,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-inline,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-source,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz-prompt .ivlyrics-study-source-card {
  color: var(--lm-text-1) !important;
  background: #162536;
  border-color: #274362;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-source {
  color: #dbeafe !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-card span {
  color: #93c5fd;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-source-card blockquote,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz-prompt .ivlyrics-study-source-card blockquote {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-reading-row,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar {
  color: #fde68a;
  background: #30270d;
  border-color: #5f4b15;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-reading-row span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar .ivlyrics-study-grammar-note strong {
  color: #fde68a;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-reading-row strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar .ivlyrics-study-grammar-note p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-grammar .ivlyrics-study-grammar-note small {
  color: #fff3c4;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-blank,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-grammar {
  background: #1f1c13;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-usage,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-quiz.quiz-type-rewrite {
  background: #162536;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-blank-question {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-blank-question .blank {
  color: #dbeafe;
  background: #164b7f;
  border-bottom-color: #60a5fa;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice.correct {
  color: #dfffe8;
  background: #173b1f;
  border-color: #2fb36d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-choice.wrong {
  color: #ffe4e0;
  background: #3f1d1d;
  border-color: #ff6b5f;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-hero {
  color: var(--lm-text-1);
  background: #173b1f;
  border-color: #2f6b24;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-hero strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-hero p {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-kicker {
  color: #d9f99d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-stats > div,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-source {
  color: var(--lm-text-1);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-stats span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-head p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-explanation {
  color: var(--lm-text-2);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-result-stats strong,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-source blockquote,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-question {
  color: var(--lm-text-1);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-item {
  color: var(--lm-text-1);
  background: #231718;
  border-color: #5b2b2b;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-answers .wrong {
  color: #fecaca;
  background: #3f1d1d;
  border-color: #7f312d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-review-answers .correct,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-no-wrong {
  color: #dfffe8;
  background: #173b1f;
  border-color: #2fb36d;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-search,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-stat-row span,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-scope button,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-rail-stats > div {
  color: var(--lm-text-1);
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-scope button.active {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-section-head > span {
  color: #d9f99d;
  background: #173b1f;
  border-color: #58cc02;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression {
  border-top-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression-groups > div {
  background: var(--lm-surface-2);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression-groups span {
  color: #a3e635;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-expression-groups em {
  color: var(--lm-text-1);
  background: var(--lm-surface);
  border-color: var(--lm-border);
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-card {
  background: #1f1c13;
  border-color: #4f4116;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson {
  color: var(--lm-text-1);
  background: #171d23;
  border-color: #4f4116;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-index {
  color: #fde68a;
  background: #30270d;
  border-color: #5f4b15;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note strong {
  color: #fde68a;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note p,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson .ivlyrics-study-grammar-note small {
  color: #e8dcc4;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-lesson blockquote {
  color: #dbeafe;
  background: #162536;
  border-left-color: #60a5fa;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-translation {
  color: var(--lm-text-1) !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-grammar-context {
  color: var(--lm-text-2) !important;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-lyric-play,
.ivlyrics-study-panel.theme-dark .ivlyrics-study-word-actions .ivlyrics-study-lyric-play {
  color: #dbeafe;
  background: #164b7f;
  border-color: #3b82f6;
}

.ivlyrics-study-panel.theme-dark .ivlyrics-study-lyric-play:hover {
  color: #ffffff;
  background: #1d5f9f;
}

@keyframes ivlyricsStudySavedPulse {
  0% { transform: scale(1); }
  45% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

@media (max-width: 860px) {
  .ivlyrics-study-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .ivlyrics-study-rail {
    gap: 10px;
  }

  .ivlyrics-study-tabs {
    flex-direction: row;
    overflow-x: auto;
  }

  .ivlyrics-study-tab {
    min-width: 128px;
  }

  .ivlyrics-study-rail-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
  }

  .ivlyrics-study-rail-card strong {
    font-size: 24px;
  }

  .ivlyrics-study-rail-card .ivlyrics-study-secondary {
    width: auto;
  }

  .ivlyrics-study-rail-card .ivlyrics-study-difficulty,
  .ivlyrics-study-rail-card .ivlyrics-study-rail-stats {
    grid-column: 1 / -1;
  }

  .ivlyrics-study-choice-grid,
  .ivlyrics-study-result-stats,
  .ivlyrics-study-review-answers,
  .ivlyrics-study-word-grid,
  .ivlyrics-study-history-grid {
    grid-template-columns: 1fr;
  }

  .ivlyrics-study-word-tools {
    grid-template-columns: 1fr;
  }

  .ivlyrics-study-word-stat-row {
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .ivlyrics-study-header {
    padding: 14px 16px;
  }

  .ivlyrics-study-body {
    padding: 14px;
  }

  .ivlyrics-study-rail-card {
    grid-template-columns: 1fr;
  }

  .ivlyrics-study-result-actions {
    justify-content: stretch;
  }

  .ivlyrics-study-result-actions button {
    width: 100%;
  }
}
`;

export function injectLearningModeStyles(document) {
    if (document.getElementById(STUDY_STYLES_ID)) return;
    const style = document.createElement("style");
    style.id = STUDY_STYLES_ID;
    style.textContent = styles;
    document.head.appendChild(style);
}
