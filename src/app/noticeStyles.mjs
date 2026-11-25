export const NOTICE_STYLES = `
@keyframes ivlyrics-notice-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes ivlyrics-notice-dialog-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.notice-modal-overlay {
  --notice-accent-rgb: var(--spice-rgb-accent, 30, 215, 96);
  --notice-shell: rgba(15, 18, 21, 0.94);
  --notice-surface: rgba(var(--spice-rgb-text, 255, 255, 255), 0.035);
  --notice-surface-hover: rgba(var(--spice-rgb-text, 255, 255, 255), 0.075);
  --notice-border: rgba(var(--spice-rgb-text, 255, 255, 255), 0.11);
  --notice-border-strong: rgba(var(--spice-rgb-text, 255, 255, 255), 0.17);
  --notice-divider: rgba(var(--spice-rgb-text, 255, 255, 255), 0.1);
  --notice-text: #fff;
  --notice-text-secondary: rgba(255, 255, 255, 0.7);
  --notice-text-muted: rgba(255, 255, 255, 0.46);
  position: fixed;
  inset: 0;
  z-index: var(--iv-layer-modal, 2147483647);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.46);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: ivlyrics-notice-overlay-in 180ms ease both;
}

.notice-modal-overlay[data-ui-theme="light"] {
  --notice-shell: rgba(248, 250, 252, 0.95);
  --notice-surface: rgba(15, 23, 42, 0.035);
  --notice-surface-hover: rgba(15, 23, 42, 0.07);
  --notice-border: rgba(15, 23, 42, 0.1);
  --notice-border-strong: rgba(15, 23, 42, 0.16);
  --notice-divider: rgba(15, 23, 42, 0.09);
  --notice-text: #111827;
  --notice-text-secondary: rgba(17, 24, 39, 0.72);
  --notice-text-muted: rgba(17, 24, 39, 0.5);
}

.notice-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 48px));
  max-height: min(760px, calc(100dvh - 48px));
  overflow: hidden;
  color: var(--notice-text);
  background: var(--notice-shell);
  border: 1px solid var(--notice-border);
  border-radius: 24px;
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  outline: none;
  animation: ivlyrics-notice-dialog-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.notice-modal[data-priority="high"] {
  --notice-accent-rgb: 245, 158, 11;
}

.notice-modal[data-priority="urgent"] {
  --notice-accent-rgb: 239, 68, 68;
}

.notice-modal::before {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 24px;
  left: 24px;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: rgb(var(--notice-accent-rgb));
  content: "";
}

.notice-modal__header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 36px;
  gap: 14px;
  align-items: start;
  padding: 24px;
  border-bottom: 1px solid var(--notice-divider);
}

.notice-modal__icon {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  color: rgb(var(--notice-accent-rgb));
  background: rgba(var(--notice-accent-rgb), 0.12);
  border: 1px solid rgba(var(--notice-accent-rgb), 0.2);
  border-radius: 10px;
}

.notice-modal__heading {
  min-width: 0;
}

.notice-modal__heading h2 {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--notice-text);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0;
}

.notice-modal__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  min-height: 22px;
  margin-top: 7px;
  color: var(--notice-text-muted);
  font-size: 12px;
  font-weight: 550;
  line-height: 1.4;
  letter-spacing: 0;
}

.notice-modal__counter {
  padding: 2px 7px;
  color: var(--notice-text-secondary);
  background: var(--notice-surface);
  border: 1px solid var(--notice-border);
  border-radius: 999px;
}

.notice-modal__close {
  display: inline-flex;
  width: 36px;
  height: 36px;
  padding: 0;
  align-items: center;
  justify-content: center;
  color: var(--notice-text-secondary);
  background: var(--notice-surface);
  border: 1px solid var(--notice-border);
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 160ms ease,
    background 160ms ease,
    border-color 160ms ease;
}

.notice-modal__close:hover {
  color: var(--notice-text);
  background: var(--notice-surface-hover);
  border-color: var(--notice-border-strong);
}

.notice-modal__body {
  min-height: 0;
  padding: 22px 24px 24px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: var(--notice-border-strong) transparent;
  scrollbar-width: thin;
}

.notice-modal__body::-webkit-scrollbar {
  width: 8px;
}

.notice-modal__body::-webkit-scrollbar-track {
  background: transparent;
}

.notice-modal__body::-webkit-scrollbar-thumb {
  background: var(--notice-border-strong);
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.notice-modal__content {
  overflow-wrap: anywhere;
  color: var(--notice-text-secondary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.7;
  letter-spacing: 0;
  white-space: pre-wrap;
}

.notice-modal__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}

.notice-modal .notice-modal__link {
  display: inline-flex;
  min-width: 0;
  min-height: 38px;
  padding: 0 14px;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: var(--notice-text-secondary);
  background: var(--notice-surface);
  border: 1px solid var(--notice-border);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
  letter-spacing: 0;
  text-align: center;
  text-decoration: none;
  transition:
    color 160ms ease,
    background 160ms ease,
    border-color 160ms ease;
}

.notice-modal .notice-modal__link.is-primary {
  color: rgb(var(--notice-accent-rgb));
  background: rgba(var(--notice-accent-rgb), 0.11);
  border-color: rgba(var(--notice-accent-rgb), 0.24);
}

.notice-modal .notice-modal__link:hover {
  color: var(--notice-text);
  background: var(--notice-surface-hover);
  border-color: var(--notice-border-strong);
}

.notice-modal .notice-modal__link.is-primary:hover {
  color: rgb(var(--notice-accent-rgb));
  background: rgba(var(--notice-accent-rgb), 0.16);
  border-color: rgba(var(--notice-accent-rgb), 0.34);
}

.notice-modal__footer {
  display: flex;
  min-height: 68px;
  padding: 14px 18px;
  gap: 10px;
  align-items: center;
  background: var(--notice-surface);
  border-top: 1px solid var(--notice-divider);
}

.notice-modal__footer-spacer {
  flex: 1 1 auto;
}

.notice-modal__button {
  display: inline-flex;
  min-height: 40px;
  padding: 0 16px;
  gap: 8px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  cursor: pointer;
  transition:
    color 160ms ease,
    background 160ms ease,
    border-color 160ms ease,
    opacity 160ms ease;
}

.notice-modal__button--secondary {
  color: var(--notice-text-secondary);
  background: transparent;
  border: 1px solid transparent;
}

.notice-modal__button--secondary:hover {
  color: var(--notice-text);
  background: var(--notice-surface-hover);
  border-color: var(--notice-border);
}

.notice-modal__button--primary {
  min-width: 108px;
  color: #07130b;
  background: rgb(var(--notice-accent-rgb));
  border: 1px solid rgb(var(--notice-accent-rgb));
}

.notice-modal__button--primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.notice-modal__button:disabled {
  color: var(--notice-text-muted);
  background: var(--notice-surface);
  border-color: var(--notice-border);
  cursor: not-allowed;
  opacity: 0.72;
}

.notice-modal :is(a, button):focus-visible {
  outline: 2px solid rgb(var(--notice-accent-rgb));
  outline-offset: 2px;
}

@media (max-width: 650px) {
  .notice-modal-overlay {
    padding: 8px;
  }

  .notice-modal {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    border-radius: 18px;
  }

  .notice-modal::before {
    right: 18px;
    left: 18px;
  }

  .notice-modal__header {
    grid-template-columns: 38px minmax(0, 1fr) 34px;
    gap: 11px;
    padding: 20px 18px;
  }

  .notice-modal__icon {
    width: 38px;
    height: 38px;
  }

  .notice-modal__heading h2 {
    font-size: 18px;
  }

  .notice-modal__close {
    width: 34px;
    height: 34px;
  }

  .notice-modal__body {
    padding: 18px;
  }

  .notice-modal__link {
    flex: 1 1 120px;
  }

  .notice-modal__footer {
    min-height: 64px;
    padding: 12px;
  }

  .notice-modal__button {
    min-height: 40px;
    padding: 0 14px;
  }
}

@media (max-width: 420px) {
  .notice-modal__footer {
    flex-wrap: wrap;
  }

  .notice-modal__footer-spacer {
    display: none;
  }

  .notice-modal__button {
    flex: 1 1 140px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice-modal-overlay,
  .notice-modal {
    animation: none;
  }

  .notice-modal :is(a, button) {
    transition: none;
  }
}
`;
