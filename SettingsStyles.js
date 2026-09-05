// Settings modal styles, kept separate from its controls and state.
// Injected by ConfigModal in the same position to preserve the CSS cascade.
const SETTINGS_MODAL_CSS = `
/* ========================================
   Glassmorphism UI - Modern Design System
   ======================================== */

/* CSS Variables */
#${APP_NAME}-config-container {
    --glass-bg: rgba(255, 255, 255, 0.045);
    --glass-bg-hover: rgba(255, 255, 255, 0.075);
    --glass-bg-active: rgba(255, 255, 255, 0.11);
    --glass-border: rgba(255, 255, 255, 0.085);
    --glass-border-light: rgba(255, 255, 255, 0.16);
    --glass-blur: blur(24px);
    --accent-primary: #6cb8ff;
    --accent-primary-light: rgba(108, 184, 255, 0.18);
    --accent-gradient: linear-gradient(180deg, rgba(108, 184, 255, 0.24) 0%, rgba(108, 184, 255, 0.08) 100%);
    --accent-glow: rgba(108, 184, 255, 0.18);
    --text-primary: #f6f8fb;
    --text-secondary: rgba(246, 248, 251, 0.72);
    --text-tertiary: rgba(246, 248, 251, 0.48);
    --success: #5fd38d;
    --warning: #f7c86b;
    --radius-sm: 10px;
    --radius-md: 14px;
    --radius-lg: 18px;
    --radius-xl: 24px;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.14);
    --shadow-md: 0 10px 26px rgba(0, 0, 0, 0.18);
    --shadow-lg: 0 28px 60px rgba(0, 0, 0, 0.28);
    --shadow-glow: 0 0 0 4px var(--accent-primary-light);
    --transition-fast: var(--iv-motion-duration-fast, 160ms) var(--iv-motion-ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
    --transition-normal: var(--iv-motion-duration-medium, 240ms) var(--iv-motion-ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
    --transition-slow: var(--iv-motion-duration-slow, 360ms) var(--iv-motion-ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
}

#${APP_NAME}-config-container[data-ui-theme="light"] {
    --glass-bg: rgba(255, 255, 255, 0.72);
    --glass-bg-hover: rgba(255, 255, 255, 0.92);
    --glass-bg-active: rgba(244, 247, 251, 0.98);
    --glass-border: rgba(15, 23, 42, 0.085);
    --glass-border-light: rgba(15, 23, 42, 0.14);
    --accent-primary: #0f6cbd;
    --accent-primary-light: rgba(15, 108, 189, 0.12);
    --accent-gradient: linear-gradient(180deg, rgba(15, 108, 189, 0.12) 0%, rgba(15, 108, 189, 0.04) 100%);
    --accent-glow: rgba(15, 108, 189, 0.12);
    --text-primary: #0f172a;
    --text-secondary: rgba(15, 23, 42, 0.68);
    --text-tertiary: rgba(15, 23, 42, 0.46);
    --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
    --shadow-md: 0 14px 30px rgba(15, 23, 42, 0.08);
    --shadow-lg: 0 28px 64px rgba(15, 23, 42, 0.12);
}

/* 전체 컨테이너 */
#${APP_NAME}-config-container {
    padding: 0;
    height: 80vh;
    display: grid;
    grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    background:
        radial-gradient(circle at top left, rgba(108, 184, 255, 0.12), transparent 26%),
        linear-gradient(180deg, #0f1318 0%, #0b0f14 100%);
    font-family: "Segoe UI Variable Text", "Segoe UI", "Pretendard Variable", Pretendard, sans-serif;
}

#${APP_NAME}-config-container[data-ui-theme="light"] {
    background:
        radial-gradient(circle at top left, rgba(15, 108, 189, 0.08), transparent 28%),
        linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%);
}

/* 헤더 영역 */
#${APP_NAME}-config-container .settings-header {
    background: transparent;
    border-bottom: 1px solid var(--glass-border);
    padding: 24px 32px 18px;
    position: relative;
    grid-column: 1 / -1;
}

#${APP_NAME}-config-container .settings-sidebar {
    grid-column: 1;
    grid-row: 2 / 4;
    padding: 20px 16px 24px 24px;
    overflow-y: auto;
    min-height: 0;
    border-right: 1px solid var(--glass-border);
    background: linear-gradient(180deg, color-mix(in srgb, var(--glass-bg-hover) 78%, transparent) 0%, transparent 100%);
}

#${APP_NAME}-config-container .settings-main-panel {
    grid-column: 2;
    grid-row: 3;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin: 0 24px 24px 0;
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    background: var(--glass-bg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
}

#${APP_NAME}-config-container .settings-header::before {
    content: "";
    position: absolute;
    left: 32px;
    right: 32px;
    bottom: -1px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-border-light), transparent);
}

#${APP_NAME}-config-container .settings-header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

#${APP_NAME}-config-container .settings-title-section {
    display: flex;
    align-items: center;
    gap: 12px;
}

#${APP_NAME}-config-container .settings-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

#${APP_NAME}-config-container .settings-theme-btn,
#${APP_NAME}-config-container .settings-github-btn,
#${APP_NAME}-config-container .settings-discord-btn,
#${APP_NAME}-config-container .settings-coffee-btn,
#${APP_NAME}-config-container .settings-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    color: var(--text-primary);
    cursor: pointer;
    transition: transform var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-normal);
    font-size: 13px;
    font-weight: 600;
    box-shadow: var(--shadow-sm);
}

#${APP_NAME}-config-container .settings-theme-btn:hover,
#${APP_NAME}-config-container .settings-github-btn:hover,
#${APP_NAME}-config-container .settings-discord-btn:hover,
#${APP_NAME}-config-container .settings-coffee-btn:hover,
#${APP_NAME}-config-container .settings-close-btn:hover {
    background: var(--glass-bg-hover);
    border-color: var(--glass-border-light);
    box-shadow: var(--shadow-md);
}

#${APP_NAME}-config-container .settings-close-btn {
    width: 40px;
    padding: 0;
    font-size: 22px;
    line-height: 1;
}

#${APP_NAME}-config-container .settings-theme-btn:active,
#${APP_NAME}-config-container .settings-github-btn:active,
#${APP_NAME}-config-container .settings-discord-btn:active,
#${APP_NAME}-config-container .settings-coffee-btn:active,
#${APP_NAME}-config-container .settings-close-btn:active {
    transform: scale(0.98);
}

#${APP_NAME}-config-container .settings-title-section h1 {
    font-size: 30px;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
    letter-spacing: -0.035em;
}

#${APP_NAME}-config-container .settings-version {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 600;
    padding: 5px 10px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 999px;
}

#${APP_NAME}-config-container .settings-sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 8px;
}

#${APP_NAME}-config-container .settings-nav-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 48px;
    padding: 0 16px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 14px;
    color: var(--text-primary);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-normal);
}

#${APP_NAME}-config-container .settings-nav-card:hover {
    background: var(--glass-bg);
    border-color: var(--glass-border);
}

#${APP_NAME}-config-container .settings-nav-card.active {
    background: var(--glass-bg-active);
    border-color: color-mix(in srgb, var(--accent-primary) 55%, transparent);
    box-shadow: inset 3px 0 0 var(--accent-primary), var(--shadow-sm);
}

#${APP_NAME}-config-container .settings-nav-card-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 34px;
    height: 24px;
    padding: 0 8px;
    border-radius: 10px;
    background: var(--glass-bg);
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

#${APP_NAME}-config-container .settings-nav-card-title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

#${APP_NAME}-config-container .settings-panel-hero {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 0 0 20px;
    margin: 0 0 8px;
    border-bottom: 1px solid var(--glass-border);
    background: transparent;
}

#${APP_NAME}-config-container .settings-panel-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--accent-primary-light);
    color: var(--accent-primary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

#${APP_NAME}-config-container .settings-panel-copy h2 {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-panel-copy p {
    margin: 0;
    max-width: 640px;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.65;
}

/* 탭 영역 래퍼 (스크롤 화살표 포함) */
#${APP_NAME}-config-container .settings-tabs-wrapper {
    display: flex;
    align-items: center;
    background: var(--glass-bg);
    border-bottom: 1px solid var(--glass-border);
    flex-shrink: 0;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    position: relative;
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 40px;
    background: linear-gradient(90deg, var(--spice-player), transparent);
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
    z-index: 10;
    opacity: 0;
    pointer-events: none;
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn.right {
    background: linear-gradient(-90deg, var(--spice-player), transparent);
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn.visible {
    opacity: 1;
    pointer-events: auto;
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn:hover {
    color: var(--text-primary);
    background: linear-gradient(90deg, var(--glass-bg-hover), transparent);
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn.right:hover {
    background: linear-gradient(-90deg, var(--glass-bg-hover), transparent);
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
}

/* 탭 영역 */
#${APP_NAME}-config-container .settings-tabs {
    display: flex;
    gap: 6px;
    padding: 16px 16px;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-wrap: nowrap;
    flex: 1;
}

#${APP_NAME}-config-container .settings-tabs::-webkit-scrollbar {
    display: none;
}

#${APP_NAME}-config-container .settings-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 18px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-normal);
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
    min-width: fit-content;
    flex-shrink: 0;
    position: relative;
}

#${APP_NAME}-config-container .settings-tab-btn:hover {
    background: var(--glass-bg-hover);
    color: var(--text-primary);
    border-color: var(--glass-border);
}

#${APP_NAME}-config-container .settings-tab-btn.active {
    background: var(--accent-primary-light);
    color: var(--text-primary);
    border-color: var(--accent-primary);
    box-shadow: 0 0 20px rgba(124, 58, 237, 0.2);
}

#${APP_NAME}-config-container .settings-tab-btn.active::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: var(--radius-md);
    padding: 1px;
    background: var(--accent-gradient);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.5;
}

#${APP_NAME}-config-container .tab-icon {
    font-size: 14px;
}

/* 검색 영역 */
#${APP_NAME}-config-container .settings-search-container {
    grid-column: 2;
    grid-row: 2;
    padding: 18px 24px 14px 0;
    background: transparent;
}

#${APP_NAME}-config-container .settings-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input {
    width: 100% !important;
    height: 46px !important;
    padding: 0 48px 0 46px !important;
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    color: var(--text-primary) !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    outline: none !important;
    transition: all var(--transition-normal) !important;
    box-sizing: border-box !important;
    box-shadow: var(--shadow-sm) !important;
}

#${APP_NAME}-config-container .settings-search-input:focus {
    background: var(--glass-bg-active) !important;
    border-color: var(--accent-primary) !important;
    box-shadow: var(--shadow-glow), var(--shadow-md) !important;
}

#${APP_NAME}-config-container .settings-search-input::placeholder {
    color: var(--text-tertiary) !important;
}

#${APP_NAME}-config-container .settings-search-icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: var(--text-tertiary);
    pointer-events: none;
    transition: color var(--transition-fast);
}

#${APP_NAME}-config-container .settings-search-wrapper:focus-within .settings-search-icon {
    color: var(--accent-primary);
}

#${APP_NAME}-config-container .settings-search-clear {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--glass-bg-active);
    border: 1px solid var(--glass-border);
    border-radius: 50%;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all var(--transition-fast);
    font-size: 0;
}

#${APP_NAME}-config-container .settings-search-wrapper.has-query .settings-search-clear {
    opacity: 1;
}

#${APP_NAME}-config-container .settings-search-clear:hover {
    background: var(--accent-primary-light);
    border-color: var(--accent-primary);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-search-clear::before {
    content: "\\00d7";
    font-size: 18px;
    line-height: 1;
}

/* 검색 결과 영역 */
#${APP_NAME}-config-container .search-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding: 14px 18px;
    background: var(--glass-bg);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(20px);
}

#${APP_NAME}-config-container .search-results-count {
    font-size: 13px;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .search-results-highlight {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 600;
}

#${APP_NAME}-config-container .search-no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
}

#${APP_NAME}-config-container .search-no-results-icon {
    width: 56px;
    height: 56px;
    margin-bottom: 20px;
    color: var(--text-tertiary);
    opacity: 0.5;
}

#${APP_NAME}-config-container .search-no-results-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px;
}

#${APP_NAME}-config-container .search-no-results-desc {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0;
}

/* 검색 결과 아이템 */
#${APP_NAME}-config-container .search-result-item {
    margin-bottom: 0;
}

#${APP_NAME}-config-container .search-result-group {
    margin-bottom: 24px;
}

#${APP_NAME}-config-container .search-result-group .option-list-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0;
}

#${APP_NAME}-config-container .search-result-section-label {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-primary);
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 5px 10px;
    background: var(--accent-primary-light);
    border: 1px solid color-mix(in srgb, var(--accent-primary) 24%, transparent);
    border-radius: var(--radius-sm);
    margin-bottom: 10px;
}

/* 검색 결과 하이라이트 */
#${APP_NAME}-config-container .search-highlight,
#${APP_NAME}-config-container mark.search-highlight {
    background: var(--accent-primary-light);
    color: var(--text-primary);
    border-radius: 4px;
    padding: 2px 4px;
    border: 1px solid color-mix(in srgb, var(--accent-primary) 32%, transparent);
}

/* 설정 항목 빛나는 효과 애니메이션 */
@keyframes settingFlash {
    0% {
        background-color: var(--accent-primary-light);
        box-shadow: var(--shadow-glow);
    }
    50% {
        background-color: color-mix(in srgb, var(--accent-primary) 12%, transparent);
        box-shadow: 0 0 10px color-mix(in srgb, var(--accent-primary) 20%, transparent);
    }
    100% {
        background-color: transparent;
        box-shadow: none;
    }
}

#${APP_NAME}-config-container .setting-row.setting-highlight-flash {
    animation: settingFlash 2s ease-out;
    border-radius: var(--radius-md);
}

/* 콘텐츠 영역 */
#${APP_NAME}-config-container .settings-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px 28px 40px;
    background: transparent;
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar {
    width: 8px;
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar-track {
    background: transparent;
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar-thumb {
    background: var(--glass-border);
    border-radius: 4px;
    transition: background var(--transition-fast);
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar-thumb:hover {
    background: var(--glass-border-light);
}

#${APP_NAME}-config-container .tab-content {
    display: none;
}

#${APP_NAME}-config-container .tab-content.active {
    display: block;
    animation: slideUp var(--iv-motion-duration-medium, 280ms) var(--iv-motion-ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
}

#${APP_NAME}-config-container .settings-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
}

#${APP_NAME}-config-container .fullscreen-presentation-picker {
    margin-bottom: 8px;
}

#${APP_NAME}-config-container .fullscreen-presentation-picker-heading {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 0 0 12px;
}

#${APP_NAME}-config-container .fullscreen-presentation-picker-heading strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
}

#${APP_NAME}-config-container .fullscreen-presentation-picker-heading span {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
}

#${APP_NAME}-config-container .fullscreen-presentation-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

#${APP_NAME}-config-container .settings-choice-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    width: 100%;
    padding: 18px 18px 16px;
    text-align: left;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 16px;
    color: var(--text-primary);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-normal);
}

#${APP_NAME}-config-container .settings-choice-card:hover {
    border-color: var(--glass-border-light);
    background: var(--glass-bg-hover);
    box-shadow: var(--shadow-md);
}

#${APP_NAME}-config-container .settings-choice-card.active {
    border-color: var(--accent-primary);
    background: var(--accent-gradient);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05), var(--shadow-md);
}

#${APP_NAME}-config-container .settings-choice-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg-active);
    color: var(--text-primary);
    flex-shrink: 0;
}

#${APP_NAME}-config-container .settings-choice-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

#${APP_NAME}-config-container .settings-choice-content strong {
    font-size: 15px;
    line-height: 1.35;
}

#${APP_NAME}-config-container .settings-choice-content span {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
}

#${APP_NAME}-config-container .settings-subsection-label {
    margin: 8px 0 12px;
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(var(--iv-motion-distance-md, 16px));
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* 섹션 타이틀 - Glassmorphism 카드 */
#${APP_NAME}-config-container .section-title {
    margin: 28px 0 0;
    padding: 18px 20px 14px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-top-left-radius: var(--radius-lg);
    border-top-right-radius: var(--radius-lg);
    border: 1px solid var(--glass-border);
    border-bottom: none;
    position: relative;
    overflow: hidden;
}

#${APP_NAME}-config-container .section-title::before {
    content: "";
    position: absolute;
    top: 0;
    left: 18px;
    right: 18px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-border), transparent);
}

#${APP_NAME}-config-container .section-title:first-child {
    margin-top: 0;
}

#${APP_NAME}-config-container .section-title-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

#${APP_NAME}-config-container .section-icon {
    display: none;
}

#${APP_NAME}-config-container .section-text h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.02em;
}

#${APP_NAME}-config-container .section-text p {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
}

/* 설정 행 - Glassmorphism */
#${APP_NAME}-config-container .setting-row {
    padding: 0;
    margin: 0;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-left: 1px solid var(--glass-border);
    border-right: 1px solid var(--glass-border);
    border-radius: 0;
    border-bottom: 1px solid var(--glass-border);
    transition: background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
    position: relative;
}

/* Wrapper를 통한 그룹화 */
#${APP_NAME}-config-container .option-list-wrapper,
#${APP_NAME}-config-container .service-list-wrapper {
    display: contents;
}

/* 섹션 타이틀 바로 다음의 wrapper의 첫 번째 항목 */
#${APP_NAME}-config-container .section-title + .option-list-wrapper > .setting-row:first-child,
#${APP_NAME}-config-container .section-title + .service-list-wrapper > .setting-row:first-child {
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
}

/* wrapper 내의 마지막 항목 */
#${APP_NAME}-config-container .option-list-wrapper > .setting-row:last-child,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row:last-child {
    border-bottom-left-radius: var(--radius-lg);
    border-bottom-right-radius: var(--radius-lg);
    border-bottom: 1px solid var(--glass-border);
}

/* service-token-input-wrapper가 있는 경우 */
#${APP_NAME}-config-container .service-list-wrapper > .setting-row.has-token-input {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
}

#${APP_NAME}-config-container .service-list-wrapper > .service-token-input-wrapper:last-child {
    border-bottom-left-radius: var(--radius-lg);
    border-bottom-right-radius: var(--radius-lg);
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .service-list-wrapper > .service-token-input-wrapper + .setting-row {
    border-top: none;
}

/* wrapper 내에 항목이 하나만 있을 때 */
#${APP_NAME}-config-container .option-list-wrapper > .setting-row:only-child,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row:only-child {
    border-top: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    border-bottom: 1px solid var(--glass-border);
}

/* update-result-container가 있을 때 */
#${APP_NAME}-config-container .setting-row.has-update-result {
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    border-bottom: 1px solid var(--glass-border) !important;
}

/* font-preview-container */
#${APP_NAME}-config-container .font-preview-container {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    padding: 0;
    margin-bottom: 28px;
}

#${APP_NAME}-config-container .setting-row:hover {
    background: var(--glass-bg-hover);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}

#${APP_NAME}-config-container .setting-row:active {
    background: var(--glass-bg-active);
}

#${APP_NAME}-config-container .setting-row-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
    align-items: center;
    gap: 20px;
    padding: 14px 18px;
    min-height: 56px;
}

#${APP_NAME}-config-container .setting-row-left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-right: 4px;
}

#${APP_NAME}-config-container .setting-name {
    font-weight: 500;
    font-size: 14px;
    color: var(--text-primary);
    line-height: 1.4;
    letter-spacing: -0.015em;
}

#${APP_NAME}-config-container .setting-description {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
}

#${APP_NAME}-config-container .setting-row-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    min-width: 0;
    width: 100%;
    max-width: none;
}

#${APP_NAME}-config-container .setting-row-right > * {
    min-width: 0;
    max-width: 100%;
}

#${APP_NAME}-config-container .instrumental-break-picker-row .setting-row-content {
    grid-template-columns: minmax(180px, 280px) minmax(0, 1fr);
    align-items: start;
}

#${APP_NAME}-config-container .instrumental-break-picker-control {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
}

#${APP_NAME}-config-container .instrumental-break-selected-preview {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 58px;
    padding: 10px 12px;
    border: 1px solid var(--glass-border-light);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.055);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .instrumental-break-selected-stage,
#${APP_NAME}-config-container .instrumental-break-option-stage {
    display: grid;
    place-items: center;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .instrumental-break-selected-stage {
    width: 40px;
    height: 40px;
    font-size: 28px;
}

#${APP_NAME}-config-container .instrumental-break-selected-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .instrumental-break-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 8px;
    width: 100%;
}

#${APP_NAME}-config-container .instrumental-break-preview-option {
    min-width: 0;
    min-height: 76px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--glass-bg-hover);
    color: var(--text-secondary);
    display: grid;
    grid-template-rows: 34px auto;
    align-items: center;
    justify-items: center;
    gap: 6px;
    padding: 8px 6px;
    cursor: pointer;
    transition:
        background var(--transition-fast),
        border-color var(--transition-fast),
        color var(--transition-fast),
        transform var(--transition-fast),
        box-shadow var(--transition-fast);
}

#${APP_NAME}-config-container .instrumental-break-preview-option:hover {
    background: var(--glass-bg-active);
    border-color: var(--glass-border-light);
    color: var(--text-primary);
    transform: translateY(-1px);
}

#${APP_NAME}-config-container .instrumental-break-preview-option.active {
    background: var(--accent-primary-light);
    border-color: var(--accent-primary);
    color: var(--text-primary);
    box-shadow: 0 0 0 1px var(--accent-primary-light), var(--shadow-glow);
}

#${APP_NAME}-config-container .instrumental-break-option-stage {
    width: 34px;
    height: 34px;
    font-size: 24px;
}

#${APP_NAME}-config-container .instrumental-break-option-label {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
    color: currentColor;
}

#${APP_NAME}-config-container .karaoke-fill-curve-row .setting-row-content {
    grid-template-columns: minmax(180px, 280px) minmax(0, 1fr);
    align-items: start;
}

#${APP_NAME}-config-container .karaoke-fill-curve-control {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) auto;
    align-items: center;
    gap: 12px;
}

#${APP_NAME}-config-container .karaoke-fill-curve-graph {
    width: 100%;
    min-height: 150px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--karaoke-curve-surface);
    touch-action: none;
    user-select: none;
}

#${APP_NAME}-config-container .karaoke-fill-curve-grid-line {
    stroke: var(--karaoke-curve-grid);
    stroke-width: 1;
}

#${APP_NAME}-config-container .karaoke-fill-curve-default-path {
    fill: none;
    stroke: var(--karaoke-curve-reference);
    stroke-width: 2;
    stroke-dasharray: 6 6;
}

#${APP_NAME}-config-container .karaoke-fill-curve-path {
    fill: none;
    stroke: var(--accent-primary);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 1px 4px var(--karaoke-curve-shadow));
}

#${APP_NAME}-config-container .karaoke-fill-curve-point {
    cursor: ns-resize;
}

#${APP_NAME}-config-container .karaoke-fill-curve-point.is-fixed {
    cursor: default;
    opacity: 0.72;
}

#${APP_NAME}-config-container .karaoke-fill-curve-point circle {
    fill: var(--accent-primary);
    stroke: var(--karaoke-curve-point-ring);
    stroke-width: 2;
}

#${APP_NAME}-config-container .karaoke-fill-curve-point text {
    fill: var(--text-primary);
    font-size: 10px;
    font-weight: 700;
    text-anchor: middle;
    paint-order: stroke;
    stroke: var(--karaoke-curve-label-outline);
    stroke-width: 3px;
    pointer-events: none;
}

#${APP_NAME}-config-container .karaoke-fill-curve-reset {
    min-width: 72px;
    white-space: nowrap;
}

/* 슬라이더 컨트롤 */
#${APP_NAME}-config-container .slider-container {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-width: 220px;
    max-width: 360px;
    position: relative;
}

#${APP_NAME}-config-container .config-slider {
    flex: 1;
    height: 28px;
    background: transparent;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    margin: 0;
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 4px;
    background: color-mix(in srgb, var(--glass-border-light) 70%, transparent);
    border-radius: 999px;
    transition: background var(--transition-fast);
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--accent-primary);
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid rgba(255,255,255,0.9);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
    margin-top: -7px;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .config-slider:hover::-webkit-slider-thumb {
    transform: scale(1.08);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

#${APP_NAME}-config-container .config-slider:active::-webkit-slider-thumb {
    transform: scale(1.05);
}

/* Firefox Styles */
#${APP_NAME}-config-container .config-slider::-moz-range-track {
    width: 100%;
    height: 4px;
    background: color-mix(in srgb, var(--glass-border-light) 70%, transparent);
    border-radius: 999px;
    border: none;
}

#${APP_NAME}-config-container .config-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--accent-primary);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
}

#${APP_NAME}-config-container .slider-value {
    min-width: 56px;
    text-align: center;
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: var(--glass-bg-active);
    border: 1px solid var(--glass-border);
    padding: 7px 10px;
    border-radius: 10px;
}

/* 조정 버튼 (+ -) */
#${APP_NAME}-config-container .adjust-container {
    display: flex;
    align-items: center;
    gap: 8px;
}

#${APP_NAME}-config-container .adjust-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    color: var(--accent-primary);
    font-size: 18px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    user-select: none;
}

#${APP_NAME}-config-container .adjust-button:hover {
    background: var(--glass-bg-hover);
    border-color: var(--glass-border-light);
}

#${APP_NAME}-config-container .adjust-button:active {
    transform: scale(0.95);
}

#${APP_NAME}-config-container .adjust-value {
    min-width: 56px;
    text-align: center;
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

/* 스왑 버튼 */
#${APP_NAME}-config-container .swap-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    cursor: pointer;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .swap-button:hover {
    background: var(--glass-bg-hover);
    border-color: var(--glass-border-light);
}

#${APP_NAME}-config-container .swap-button:active {
    transform: scale(0.95);
}

#${APP_NAME}-config-container .swap-button svg {
    width: 14px;
    height: 14px;
    fill: var(--text-primary);
}

/* 컬러피커 */
#${APP_NAME}-config-container .color-picker-container {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 100%;
    flex-wrap: wrap;
}

#${APP_NAME}-config-container .font-selector-container,
#${APP_NAME}-config-container .config-font-selector {
    width: 100%;
    min-width: 0;
}

#${APP_NAME}-config-container .font-selector-container {
    justify-content: flex-end;
}

#${APP_NAME}-config-container .config-font-selector > input,
#${APP_NAME}-config-container .config-font-selector > select {
    flex: 1 1 auto;
}

#${APP_NAME}-config-container .config-color-picker {
    width: 44px;
    height: 36px;
    padding: 3px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    cursor: pointer;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .config-color-picker:hover {
    border-color: var(--glass-border-light);
    transform: scale(1.05);
}

#${APP_NAME}-config-container .config-color-picker:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-primary-light);
    outline: none;
}

#${APP_NAME}-config-container .config-color-input {
    width: 100px !important;
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 10px !important;
    padding: 8px 12px !important;
    font-size: 12px !important;
    color: var(--text-primary) !important;
    font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
    text-transform: uppercase !important;
}

/* 입력 필드 - Glassmorphism */
#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input),
#${APP_NAME}-config-container textarea {
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    padding: 10px 14px !important;
    width: min(280px, 100%) !important;
    outline: none !important;
    color: var(--text-primary) !important;
    transition: all var(--transition-normal) !important;
    font-size: 14px !important;
    font-family: inherit !important;
    min-height: 40px !important;
    box-sizing: border-box !important;
    font-weight: 400 !important;
    box-shadow: var(--shadow-sm) !important;
}

#${APP_NAME}-config-container select,
#${APP_NAME}-config-container .config-select {
    background: var(--glass-bg-hover) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: var(--radius-md) !important;
    padding: 10px 36px 10px 14px !important;
    width: min(100%, 260px) !important;
    max-width: 100% !important;
    outline: none !important;
    color: var(--text-primary) !important;
    transition: all var(--transition-normal) !important;
    font-size: 14px !important;
    font-family: inherit !important;
    min-height: 40px !important;
    height: auto !important;
    box-sizing: border-box !important;
    appearance: none !important;
    background-image: url('data:image/svg+xml;utf8,<svg fill="%237c3aed" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M3 6l5 5.794L13 6z"/></svg>') !important;
    background-repeat: no-repeat !important;
    background-position: right 12px center !important;
    cursor: pointer !important;
    font-weight: 500 !important;
    backdrop-filter: blur(10px) !important;
}

#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container select:hover,
#${APP_NAME}-config-container textarea:hover {
    background: var(--glass-bg-active) !important;
    border-color: var(--glass-border-light) !important;
}

#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container select:focus,
#${APP_NAME}-config-container textarea:focus {
    background: var(--glass-bg-active) !important;
    border-color: var(--accent-primary) !important;
    box-shadow: 0 0 0 3px var(--accent-primary-light), var(--shadow-glow) !important;
}

#${APP_NAME}-config-container input::placeholder,
#${APP_NAME}-config-container textarea::placeholder {
    color: var(--text-tertiary) !important;
    opacity: 1 !important;
}

#${APP_NAME}-config-container select option {
    background-color: #1a1a1f;
    color: var(--text-primary);
    padding: 10px 14px;
}

/* 버튼 스타일 - Glassmorphism */
#${APP_NAME}-config-container .switch,
#${APP_NAME}-config-container .btn {
    height: 40px;
    min-width: 80px;
    border-radius: var(--radius-md);
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    cursor: pointer;
    transition: all var(--transition-normal);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    font-size: 13px;
    padding: 0 18px;
    backdrop-filter: blur(10px);
}

/* 토글 스위치 - Glassmorphism */
#${APP_NAME}-config-container .switch-checkbox {
    width: 52px;
    height: 28px;
    border-radius: 14px;
    background: var(--glass-bg-active);
    border: 1px solid var(--glass-border);
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    transition: all var(--transition-normal);
    -webkit-tap-highlight-color: transparent;
    outline: none;
    overflow: hidden;
}

#${APP_NAME}-config-container .switch-checkbox::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--text-primary);
    box-shadow: var(--shadow-sm);
    transition: all var(--transition-normal);
    will-change: transform;
    transform: translateX(0);
}

#${APP_NAME}-config-container .switch-checkbox:hover {
    border-color: var(--glass-border-light);
}

#${APP_NAME}-config-container .switch-checkbox.active {
    background: var(--accent-gradient);
    border-color: transparent;
    box-shadow: 0 0 16px rgba(124, 58, 237, 0.4);
}

#${APP_NAME}-config-container .switch-checkbox.active::after {
    transform: translateX(24px);
}

#${APP_NAME}-config-container .switch-checkbox svg {
    display: none !important;
    visibility: hidden !important;
    position: absolute;
    pointer-events: none;
}

#${APP_NAME}-config-container .switch {
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .switch:hover {
    background: var(--glass-bg-active);
    border-color: var(--glass-border-light);
}

#${APP_NAME}-config-container .switch.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

#${APP_NAME}-config-container .btn {
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    font-weight: 500;
    padding: 0 18px;
    position: relative;
    overflow: hidden;
}

#${APP_NAME}-config-container .btn::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--accent-gradient);
    opacity: 0;
    transition: opacity var(--transition-fast);
}

#${APP_NAME}-config-container .btn:hover:not(:disabled) {
    background: var(--glass-bg-active);
    border-color: var(--accent-primary);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
}

#${APP_NAME}-config-container .btn:hover:not(:disabled)::before {
    opacity: 0.1;
}

#${APP_NAME}-config-container .btn:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
}

#${APP_NAME}-config-container .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* AI Addon Settings Styles */
#${APP_NAME}-config-container .ai-addon-container {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 20px;
    margin-bottom: 16px;
}

#${APP_NAME}-config-container .ai-addon-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

#${APP_NAME}-config-container .ai-addon-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .ai-addon-version {
    font-size: 12px;
    color: var(--text-tertiary);
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
}

#${APP_NAME}-config-container .ai-addon-description {
    color: var(--text-secondary);
    font-size: 13px;
    margin-bottom: 16px;
    line-height: 1.5;
}

#${APP_NAME}-config-container .ai-addon-setting {
    margin-bottom: 16px;
}

#${APP_NAME}-config-container .ai-addon-setting label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 6px;
}

#${APP_NAME}-config-container .ai-addon-setting input,
#${APP_NAME}-config-container .ai-addon-setting select {
    width: 100%;
    padding: 10px 12px;
    background: var(--input-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 13px;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .ai-addon-setting input:focus,
#${APP_NAME}-config-container .ai-addon-setting select:focus {
    border-color: var(--accent-primary);
    outline: none;
}

#${APP_NAME}-config-container .ai-addon-setting small {
    display: block;
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 4px;
}

#${APP_NAME}-config-container .ai-addon-toggle-setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

#${APP_NAME}-config-container .ai-addon-toggle-copy {
    min-width: 0;
}

#${APP_NAME}-config-container .ai-addon-toggle-label {
    display: block;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
}

#${APP_NAME}-config-container .ai-addon-switch {
    position: relative;
    flex: 0 0 auto;
    width: 36px;
    height: 20px;
    padding: 0;
    border: 0.5px solid var(--glass-border);
    border-radius: 999px;
    background: var(--input-bg);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast);
}

#${APP_NAME}-config-container .ai-addon-switch > span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--text-tertiary);
    transition: transform var(--transition-fast), background var(--transition-fast);
}

#${APP_NAME}-config-container .ai-addon-switch.active {
    border-color: color-mix(in srgb, var(--accent-primary) 58%, transparent);
    background: color-mix(in srgb, var(--accent-primary) 42%, transparent);
}

#${APP_NAME}-config-container .ai-addon-switch.active > span {
    background: var(--accent-primary);
    transform: translateX(16px);
}

#${APP_NAME}-config-container .ai-addon-switch:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
}

#${APP_NAME}-config-container .ai-addon-input-group {
    display: flex;
    gap: 8px;
}

#${APP_NAME}-config-container .ai-addon-input-group input {
    flex: 1;
}

#${APP_NAME}-config-container .ai-addon-btn-primary,
#${APP_NAME}-config-container .ai-addon-btn-secondary {
    padding: 10px 16px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    border: none;
    white-space: nowrap;
}

#${APP_NAME}-config-container .ai-addon-btn-primary {
    background: var(--accent-gradient);
    color: white;
}

#${APP_NAME}-config-container .ai-addon-btn-primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
}

#${APP_NAME}-config-container .ai-addon-btn-secondary {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .ai-addon-btn-secondary:hover {
    background: var(--glass-bg-active);
    border-color: var(--accent-primary);
}

#${APP_NAME}-config-container .ai-addon-test-status {
    display: inline-block;
    margin-left: 12px;
    font-size: 13px;
}

#${APP_NAME}-config-container .ai-addon-test-status.success {
    color: #22c55e;
}

#${APP_NAME}-config-container .ai-addon-test-status.error {
    color: #ef4444;
}

/* Addon 리스트 래퍼 */
#${APP_NAME}-config-container .addon-list-wrapper {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* Addon 설정 컨테이너 - 섹션처럼 표시 */
#${APP_NAME}-config-container .addon-settings-container {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: var(--glass-bg-hover);
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-version {
    font-size: 11px;
    color: var(--text-tertiary);
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-description {
    color: var(--text-secondary);
    font-size: 12px;
    padding: 12px 20px;
    margin: 0;
    line-height: 1.5;
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting {
    padding: 14px 20px;
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting:last-child {
    border-bottom: none;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting input,
#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting select {
    width: 100%;
    padding: 10px 12px;
    background: var(--input-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 13px;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting input:focus,
#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting select:focus {
    border-color: var(--accent-primary);
    outline: none;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-setting small {
    display: block;
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 6px;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-input-group {
    display: flex;
    gap: 8px;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-input-group input {
    flex: 1;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-btn-primary,
#${APP_NAME}-config-container .addon-settings-container .ai-addon-btn-secondary {
    padding: 10px 16px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    border: none;
    white-space: nowrap;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-btn-primary {
    background: var(--accent-gradient);
    color: white;
}

#${APP_NAME}-config-container .addon-settings-container .ai-addon-btn-secondary {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
}

/* ============================================
   NEW: Addon Cards Container (Accordion Style)
   ============================================ */

#${APP_NAME}-config-container .addon-cards-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* Addon Card Base */
#${APP_NAME}-config-container .addon-card {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all var(--transition-normal);
}

#${APP_NAME}-config-container .addon-card:hover {
    border-color: rgba(124, 58, 237, 0.3);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

#${APP_NAME}-config-container .addon-card.expanded {
    border-color: var(--accent-primary);
    box-shadow: 0 8px 32px rgba(124, 58, 237, 0.2);
}

/* Addon Card Header */
#${APP_NAME}-config-container .addon-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    cursor: pointer;
    background: var(--glass-bg);
    transition: background var(--transition-fast);
}

#${APP_NAME}-config-container .addon-card-header:hover {
    background: var(--glass-bg-hover);
}

#${APP_NAME}-config-container .addon-card.expanded .addon-card-header {
    background: var(--glass-bg-hover);
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .addon-card-header-left {
    display: flex;
    align-items: center;
    gap: 14px;
}

#${APP_NAME}-config-container .addon-card-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(139, 92, 246, 0.1));
    border-radius: var(--radius-md);
    color: var(--accent-primary);
    flex-shrink: 0;
}

#${APP_NAME}-config-container .addon-card-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

#${APP_NAME}-config-container .addon-card-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .addon-card-version {
    font-size: 11px;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .addon-card-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

#${APP_NAME}-config-container .addon-status-badge {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
}

#${APP_NAME}-config-container .addon-status-badge.success {
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
}

#${APP_NAME}-config-container .addon-status-badge.error {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
}

#${APP_NAME}-config-container .addon-expand-icon {
    color: var(--text-tertiary);
    transition: transform var(--transition-fast);
}

#${APP_NAME}-config-container .addon-expand-icon.expanded {
    transform: rotate(180deg);
}

/* Addon Card Description */
#${APP_NAME}-config-container .addon-card-description {
    padding: 12px 20px;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
    background: rgba(0, 0, 0, 0.1);
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .addon-card:not(.expanded) .addon-card-description {
    border-bottom: none;
}

/* Addon Card Body (Settings) */
#${APP_NAME}-config-container .addon-card-body {
    padding: 0;
    animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Addon Settings inside Card Body */
#${APP_NAME}-config-container .addon-card-body .ai-addon-settings {
    padding: 0;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-header,
#${APP_NAME}-config-container .addon-card-body .ai-addon-description {
    display: none;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-setting {
    padding: 16px 20px;
    border-bottom: 1px solid var(--glass-border);
    margin: 0;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-setting:last-child {
    border-bottom: none;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-setting label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-setting input,
#${APP_NAME}-config-container .addon-card-body .ai-addon-setting select {
    width: 100%;
    padding: 10px 12px;
    background: var(--input-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 13px;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-setting input:focus,
#${APP_NAME}-config-container .addon-card-body .ai-addon-setting select:focus {
    border-color: var(--accent-primary);
    outline: none;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-setting small {
    display: block;
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 6px;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-input-group {
    display: flex;
    gap: 8px;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-input-group input {
    flex: 1;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-btn-primary,
#${APP_NAME}-config-container .addon-card-body .ai-addon-btn-secondary {
    padding: 10px 16px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    border: none;
    white-space: nowrap;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-btn-primary {
    background: var(--accent-gradient);
    color: white;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-btn-primary:hover {
    opacity: 0.9;
    transform: translateY(-1px);
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-btn-secondary {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-btn-secondary:hover {
    background: var(--glass-bg-active);
    border-color: var(--accent-primary);
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-test-status {
    display: inline-flex;
    align-items: center;
    margin-left: 12px;
    font-size: 13px;
    gap: 6px;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-test-status.success {
    color: #22c55e;
}

#${APP_NAME}-config-container .addon-card-body .ai-addon-test-status.error {
    color: #ef4444;
}

/* ============================================
   Lyrics Provider Cards
   ============================================ */

#${APP_NAME}-config-container .lyrics-providers-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

#${APP_NAME}-config-container .lyrics-provider-item {
    display: flex;
    gap: 8px;
    align-items: flex-start;
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 16px;
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons .order-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons .order-btn:hover:not(:disabled) {
    background: var(--glass-bg-hover);
    color: var(--text-primary);
    border-color: var(--accent-primary);
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons .order-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

#${APP_NAME}-config-container .lyrics-provider-card {
    flex: 1;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all var(--transition-normal);
}

#${APP_NAME}-config-container .lyrics-provider-card:hover {
    border-color: rgba(124, 58, 237, 0.3);
}

#${APP_NAME}-config-container .lyrics-provider-card.expanded {
    border-color: var(--accent-primary);
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.15);
}

#${APP_NAME}-config-container .lyrics-provider-card.disabled {
    opacity: 0.6;
}

#${APP_NAME}-config-container .lyrics-provider-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    cursor: pointer;
    background: var(--glass-bg);
    transition: background var(--transition-fast);
}

#${APP_NAME}-config-container .lyrics-provider-card-header:hover {
    background: var(--glass-bg-hover);
}

#${APP_NAME}-config-container .lyrics-provider-card-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1 1 auto;
    min-width: 0;
}

/* Toggle Switch */
#${APP_NAME}-config-container .lyrics-provider-toggle {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    min-width: 36px;
    flex: 0 0 36px;
    align-self: flex-start;
}

#${APP_NAME}-config-container .lyrics-provider-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--glass-bg-active);
    transition: all var(--transition-fast);
    border-radius: 20px;
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: all var(--transition-fast);
    border-radius: 50%;
}

#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider {
    background: var(--accent-gradient);
}

#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider:before {
    transform: translateX(16px);
}

#${APP_NAME}-config-container .lyrics-provider-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
}

#${APP_NAME}-config-container .lyrics-provider-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    min-width: 0;
    overflow-wrap: anywhere;
}

#${APP_NAME}-config-container .lyrics-provider-version {
    font-size: 11px;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .lyrics-provider-card-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    min-width: fit-content;
}

#${APP_NAME}-config-container .support-badges {
    display: flex;
    gap: 6px;
}

#${APP_NAME}-config-container .support-badge {
    font-size: 10px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 10px;
    background: var(--glass-bg);
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .support-badge.karaoke {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
}

#${APP_NAME}-config-container .support-badge.synced {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
}

#${APP_NAME}-config-container .support-badge.unsynced {
    background: rgba(156, 163, 175, 0.15);
    color: #9ca3af;
}

#${APP_NAME}-config-container .lyrics-provider-expand-icon {
    color: var(--text-tertiary);
    transition: transform var(--transition-fast);
}

#${APP_NAME}-config-container .lyrics-provider-expand-icon.expanded {
    transform: rotate(180deg);
}

#${APP_NAME}-config-container .lyrics-provider-card-description {
    padding: 10px 16px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    background: rgba(0, 0, 0, 0.08);
    border-top: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .lyrics-provider-card:not(.expanded) .lyrics-provider-card-description {
    border-bottom: none;
}

#${APP_NAME}-config-container .lyrics-provider-card.expanded .lyrics-provider-card-description {
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .lyrics-provider-card-body {
    padding: 16px;
    animation: slideDown 0.2s ease-out;
}

#${APP_NAME}-config-container .lyrics-provider-card-body .lyrics-addon-info p {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .lyrics-provider-card-body .lyrics-addon-note {
    font-size: 12px;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .lyrics-provider-card-body .lyrics-addon-note a {
    color: var(--accent-primary);
    text-decoration: none;
}

#${APP_NAME}-config-container .lyrics-provider-card-body .lyrics-addon-note a:hover {
    text-decoration: underline;
}

#${APP_NAME}-config-container .no-providers-message {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary);
}

/* 프라이머리 버튼 */
#${APP_NAME}-config-container .btn-primary {
    background: var(--accent-gradient) !important;
    border: none !important;
    color: white !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.3);
}

#${APP_NAME}-config-container .btn-primary:hover:not(:disabled) {
    box-shadow: 0 6px 24px rgba(124, 58, 237, 0.4);
    transform: translateY(-2px);
}

/* 글꼴 미리보기 */
#${APP_NAME}-config-container .font-preview {
    background: transparent;
    border: none;
    padding: 24px;
}

#${APP_NAME}-config-container #lyrics-preview,
#${APP_NAME}-config-container #translation-preview {
    transition: all var(--transition-fast);
}

/* 정보 박스 */
#${APP_NAME}-config-container .info-box {
    padding: 20px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    margin-bottom: 24px;
    backdrop-filter: var(--glass-blur);
}

#${APP_NAME}-config-container .info-box h3 {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .info-box p {
    margin: 0 0 8px;
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: 13px;
}

#${APP_NAME}-config-container .info-box p:last-child {
    margin-bottom: 0;
}

/* 추가 애니메이션 */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

/* 호버 시 빛나는 효과 */
#${APP_NAME}-config-container .setting-row::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.03), transparent);
    opacity: 0;
    transition: opacity var(--transition-normal);
    pointer-events: none;
}

#${APP_NAME}-config-container .setting-row:hover::after {
    opacity: 1;
}

/* ========================================
   Fluent Flat Overrides
   ======================================== */
#${APP_NAME}-config-container {
    --radius-sm: 0px;
    --radius-md: 0px;
    --radius-lg: 0px;
    --radius-xl: 0px;
    --glass-bg: rgba(255, 255, 255, 0.03);
    --glass-bg-hover: rgba(255, 255, 255, 0.05);
    --glass-bg-active: rgba(255, 255, 255, 0.08);
    --glass-border: rgba(255, 255, 255, 0.09);
    --glass-border-light: rgba(255, 255, 255, 0.16);
    --accent-primary: #76b9ff;
    --accent-primary-light: rgba(118, 185, 255, 0.14);
    --accent-gradient: none;
    --shadow-sm: none;
    --shadow-md: none;
    --shadow-lg: none;
    --shadow-glow: none;
    height: 84vh;
    grid-template-columns: 248px minmax(0, 1fr);
    background: #0f1113;
    border-top: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container[data-ui-theme="light"] {
    --glass-bg: rgba(255, 255, 255, 0.82);
    --glass-bg-hover: rgba(249, 250, 251, 0.96);
    --glass-bg-active: rgba(243, 244, 246, 1);
    --glass-border: rgba(15, 23, 42, 0.1);
    --glass-border-light: rgba(15, 23, 42, 0.16);
    --accent-primary: #0f6cbd;
    --accent-primary-light: rgba(15, 108, 189, 0.12);
    --text-primary: #111827;
    --text-secondary: rgba(17, 24, 39, 0.72);
    --text-tertiary: rgba(17, 24, 39, 0.5);
    background: #f3f4f6;
}

#${APP_NAME}-config-container [style*="border-radius"] {
    border-radius: 0 !important;
}

#${APP_NAME}-config-container [style*="backdrop-filter"] {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container .settings-header {
    padding: 20px 28px 16px;
}

#${APP_NAME}-config-container .settings-theme-btn,
#${APP_NAME}-config-container .settings-github-btn,
#${APP_NAME}-config-container .settings-discord-btn,
#${APP_NAME}-config-container .settings-coffee-btn,
#${APP_NAME}-config-container .settings-close-btn,
#${APP_NAME}-config-container .settings-version,
#${APP_NAME}-config-container .settings-nav-card,
#${APP_NAME}-config-container .settings-nav-card-badge,
#${APP_NAME}-config-container .settings-panel-badge,
#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input,
#${APP_NAME}-config-container .settings-main-panel,
#${APP_NAME}-config-container .section-title,
#${APP_NAME}-config-container .setting-row,
#${APP_NAME}-config-container .settings-choice-card,
#${APP_NAME}-config-container .font-preview-container,
#${APP_NAME}-config-container .info-card,
#${APP_NAME}-config-container .lyrics-providers-container,
#${APP_NAME}-config-container .lyrics-provider-item,
#${APP_NAME}-config-container .slider-value,
#${APP_NAME}-config-container .config-color-picker,
#${APP_NAME}-config-container .config-color-input,
#${APP_NAME}-config-container .btn,
#${APP_NAME}-config-container .btn-primary,
#${APP_NAME}-config-container .switch-checkbox,
#${APP_NAME}-config-container .search-result-item,
#${APP_NAME}-config-container .order-btn,
#${APP_NAME}-config-container input,
#${APP_NAME}-config-container select,
#${APP_NAME}-config-container textarea,
#${APP_NAME}-config-container button {
    border-radius: 0 !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-buttons button,
#${APP_NAME}-config-container .btn,
#${APP_NAME}-config-container .order-btn,
#${APP_NAME}-config-container .switch-checkbox,
#${APP_NAME}-config-container .settings-choice-card,
#${APP_NAME}-config-container .setting-row,
#${APP_NAME}-config-container .search-result-item {
    transform: none !important;
}

#${APP_NAME}-config-container .settings-theme-btn:hover,
#${APP_NAME}-config-container .settings-github-btn:hover,
#${APP_NAME}-config-container .settings-discord-btn:hover,
#${APP_NAME}-config-container .settings-coffee-btn:hover,
#${APP_NAME}-config-container .settings-close-btn:hover,
#${APP_NAME}-config-container .btn:hover:not(:disabled),
#${APP_NAME}-config-container .settings-choice-card:hover,
#${APP_NAME}-config-container .setting-row:hover,
#${APP_NAME}-config-container .order-btn:hover:not(:disabled) {
    transform: none !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-title-section h1 {
    font-size: 28px;
    letter-spacing: -0.04em;
}

#${APP_NAME}-config-container .settings-sidebar {
    padding: 16px 0 20px 20px;
    background: transparent;
}

#${APP_NAME}-config-container .settings-sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 0;
}

#${APP_NAME}-config-container .settings-nav-group {
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .settings-nav-group-toggle {
    width: 100%;
    min-height: 40px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

#${APP_NAME}-config-container .settings-nav-group-toggle:hover,
#${APP_NAME}-config-container .settings-nav-group-toggle.expanded {
    background: var(--glass-bg);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-nav-group-title {
    font: inherit;
}

#${APP_NAME}-config-container .settings-nav-group-indicator {
    color: var(--text-tertiary);
    font-size: 16px;
    line-height: 1;
}

#${APP_NAME}-config-container .settings-nav-group-items {
    display: flex;
    flex-direction: column;
    padding-bottom: 6px;
}

#${APP_NAME}-config-container .settings-nav-subitem {
    min-height: 42px;
    padding: 0 14px 0 24px;
    display: flex;
    align-items: center;
    width: 100%;
    border: none;
    border-left: 2px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    text-align: left;
    font-size: 13px;
    font-weight: 600;
}

#${APP_NAME}-config-container .settings-nav-subitem:hover {
    background: var(--glass-bg);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-nav-subitem.active {
    border-left-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-nav-subitem-label {
    display: block;
    white-space: normal;
    line-height: 1.3;
}

#${APP_NAME}-config-container .settings-nav-card {
    min-height: 46px;
    padding: 0 14px;
    border: none;
    border-left: 2px solid transparent;
    border-bottom: 1px solid var(--glass-border);
    background: transparent;
}

#${APP_NAME}-config-container .settings-nav-card.active {
    border-color: transparent;
    border-left-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
}

#${APP_NAME}-config-container .settings-nav-card-badge,
#${APP_NAME}-config-container .settings-panel-badge,
#${APP_NAME}-config-container .settings-version {
    min-width: 32px;
    height: 22px;
    padding: 0 8px;
    background: transparent;
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .settings-search-container {
    padding: 16px 28px 12px 0;
}

#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input {
    height: 40px !important;
    background: rgba(255, 255, 255, 0.02) !important;
    border: 1px solid var(--glass-border) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .settings-search-wrapper .settings-search-input {
    background: rgba(255, 255, 255, 0.84) !important;
}

#${APP_NAME}-config-container .settings-main-panel {
    margin: 0 28px 28px 0;
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .settings-main-panel {
    background: rgba(255, 255, 255, 0.62);
}

#${APP_NAME}-config-container .settings-panel-hero {
    padding: 0 0 16px;
    margin: 0 0 8px;
    background: transparent;
}

#${APP_NAME}-config-container .settings-panel-copy h2 {
    font-size: 34px;
    line-height: 1;
    letter-spacing: -0.05em;
}

#${APP_NAME}-config-container .section-title {
    margin: 24px 0 0;
    padding: 12px 0 10px 14px;
    background: transparent;
    border: none;
    border-left: 2px solid var(--accent-primary);
    scroll-margin-top: 24px;
}

#${APP_NAME}-config-container .section-title::before {
    display: none;
}

#${APP_NAME}-config-container .section-title-content {
    gap: 2px;
}

#${APP_NAME}-config-container .section-text h3 {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
}

#${APP_NAME}-config-container .section-text p {
    font-size: 12px;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .setting-row,
#${APP_NAME}-config-container .search-result-item {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    margin-top: -1px;
}

#${APP_NAME}-config-container .setting-row:hover,
#${APP_NAME}-config-container .search-result-item:hover {
    background: var(--glass-bg-hover);
}

#${APP_NAME}-config-container .setting-row::after {
    display: none;
}

#${APP_NAME}-config-container .setting-row-content {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
    gap: 18px;
    padding: 12px 16px;
    min-height: 52px;
}

#${APP_NAME}-config-container .setting-name {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.02em;
}

#${APP_NAME}-config-container .setting-description {
    font-size: 12px;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .settings-card-grid {
    gap: 0;
    border-top: 1px solid var(--glass-border);
    border-left: 1px solid var(--glass-border);
    margin-bottom: 20px;
}

#${APP_NAME}-config-container .settings-choice-card {
    padding: 16px;
    background: var(--glass-bg);
    border: none;
    border-right: 1px solid var(--glass-border);
    border-bottom: 1px solid var(--glass-border);
    position: relative;
}

#${APP_NAME}-config-container .settings-choice-card.active {
    background: color-mix(in srgb, var(--accent-primary) 12%, var(--glass-bg));
    border-left: 2px solid var(--accent-primary);
    z-index: 1;
}

#${APP_NAME}-config-container .settings-choice-card.active::before {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--accent-primary);
    pointer-events: none;
}

#${APP_NAME}-config-container .font-preview-container,
#${APP_NAME}-config-container .info-card,
#${APP_NAME}-config-container .lyrics-providers-container {
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
}

#${APP_NAME}-config-container .font-preview {
    padding: 18px 20px;
}

#${APP_NAME}-config-container .lyrics-providers-list {
    gap: 0;
}

#${APP_NAME}-config-container .lyrics-provider-item {
    padding: 14px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    margin-top: -1px;
}

#${APP_NAME}-config-container .lyrics-provider-card,
#${APP_NAME}-config-container .lyrics-provider-card-header,
#${APP_NAME}-config-container .lyrics-provider-card-description,
#${APP_NAME}-config-container .lyrics-provider-card-body,
#${APP_NAME}-config-container .ai-addon-settings-group,
#${APP_NAME}-config-container .lyrics-type-toggles-container,
#${APP_NAME}-config-container .ai-addon-cap-chip,
#${APP_NAME}-config-container .lyrics-type-toggle-chip,
#${APP_NAME}-config-container .support-badge,
#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider,
#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider:before {
    border-radius: 0 !important;
}

#${APP_NAME}-config-container .lyrics-provider-card {
    border: 1px solid var(--glass-border);
    background: transparent;
}

#${APP_NAME}-config-container .lyrics-provider-card.disabled {
    opacity: 0.66;
}

#${APP_NAME}-config-container .lyrics-provider-card-header {
    min-height: 64px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .lyrics-provider-card-description {
    padding: 12px 14px;
    background: transparent;
    border-top: none;
    border-bottom: 1px solid var(--glass-border);
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .lyrics-provider-card:not(.expanded) .lyrics-provider-card-description {
    border-bottom: none;
}

#${APP_NAME}-config-container .lyrics-provider-card-body {
    padding: 14px;
    background: rgba(255, 255, 255, 0.01);
}

#${APP_NAME}-config-container .lyrics-provider-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

#${APP_NAME}-config-container .lyrics-provider-title-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.3;
}

#${APP_NAME}-config-container .lyrics-provider-title-meta-divider {
    opacity: 0.65;
}

#${APP_NAME}-config-container .lyrics-provider-toggle {
    width: 40px;
    height: 22px;
    min-width: 40px;
    flex-basis: 40px;
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider:before {
    width: 12px;
    height: 12px;
    left: 4px;
    bottom: 4px;
    background: var(--text-secondary);
    box-shadow: none;
}

#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider {
    background: color-mix(in srgb, var(--accent-primary) 18%, transparent);
    border-color: var(--accent-primary);
}

#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider:before {
    background: var(--accent-primary);
    transform: translateX(18px);
}

#${APP_NAME}-config-container .support-badges {
    flex-wrap: wrap;
    justify-content: flex-end;
}

#${APP_NAME}-config-container .support-badge {
    padding: 3px 6px;
    border: 1px solid currentColor;
    background: transparent;
    font-size: 10px;
    font-weight: 600;
}

#${APP_NAME}-config-container .support-badge.karaoke,
#${APP_NAME}-config-container .support-badge.synced,
#${APP_NAME}-config-container .support-badge.unsynced,
#${APP_NAME}-config-container .support-badge.ivsync {
    background: transparent;
}

#${APP_NAME}-config-container .support-badge.ivsync {
    color: var(--accent-primary);
}

#${APP_NAME}-config-container .lyrics-type-toggles-container,
#${APP_NAME}-config-container .ai-addon-settings-group {
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .lyrics-type-toggles-title,
#${APP_NAME}-config-container .ai-addon-capabilities-title {
    margin-bottom: 10px;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

#${APP_NAME}-config-container .lyrics-type-toggles,
#${APP_NAME}-config-container .ai-addon-caps-container {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

#${APP_NAME}-config-container .lyrics-type-toggle-chip,
#${APP_NAME}-config-container .ai-addon-cap-chip {
    min-height: 34px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--glass-border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
}

#${APP_NAME}-config-container .lyrics-type-toggle-chip.active,
#${APP_NAME}-config-container .ai-addon-cap-chip.active {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .lyrics-type-toggle-chip.type-word.active,
#${APP_NAME}-config-container .ai-addon-cap-chip.cap-metadata.active {
    color: #b45309;
    border-color: rgba(180, 83, 9, 0.45);
    background: rgba(180, 83, 9, 0.08);
}

#${APP_NAME}-config-container .lyrics-type-toggle-chip.type-synced.active,
#${APP_NAME}-config-container .lyrics-type-toggle-chip.type-character.active,
#${APP_NAME}-config-container .ai-addon-cap-chip.cap-translate.active,
#${APP_NAME}-config-container .ai-addon-cap-chip.cap-lyricsStudy.active {
    color: var(--accent-primary);
}

#${APP_NAME}-config-container .lyrics-type-toggle-chip.type-unsynced.active,
#${APP_NAME}-config-container .ai-addon-cap-chip.cap-tmi.active {
    color: var(--text-primary);
}

#${APP_NAME}-config-container .ai-addon-capabilities-desc {
    margin-top: 8px;
    color: var(--text-tertiary);
    font-size: 11px;
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons .order-btn {
    width: 26px;
    height: 26px;
}

#${APP_NAME}-config-container .btn,
#${APP_NAME}-config-container .btn-primary {
    min-height: 36px;
    padding: 0 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .btn,
#${APP_NAME}-config-container[data-ui-theme="light"] .btn-primary {
    background: rgba(255, 255, 255, 0.9);
}

#${APP_NAME}-config-container .btn::before {
    display: none;
}

#${APP_NAME}-config-container .btn-primary {
    background: color-mix(in srgb, var(--accent-primary) 16%, transparent) !important;
    border-color: var(--accent-primary) !important;
    color: var(--text-primary) !important;
}

#${APP_NAME}-config-container .switch-checkbox {
    width: 46px;
    height: 24px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .switch-checkbox::after {
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    background: var(--text-secondary);
    border-radius: 0;
}

#${APP_NAME}-config-container .switch-checkbox.active {
    background: color-mix(in srgb, var(--accent-primary) 18%, transparent);
    border-color: var(--accent-primary);
}

#${APP_NAME}-config-container .switch-checkbox.active::after {
    background: var(--accent-primary);
    transform: translateX(22px);
}

#${APP_NAME}-config-container .slider-container {
    max-width: 420px;
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-runnable-track,
#${APP_NAME}-config-container .config-slider::-moz-range-track,
#${APP_NAME}-config-container .config-slider::-moz-range-progress {
    height: 2px;
    border-radius: 0;
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-thumb {
    width: 14px;
    height: 14px;
    margin-top: -6px;
    border: 1px solid var(--accent-primary);
    background: #ffffff;
    border-radius: 0;
    transform: none !important;
}

#${APP_NAME}-config-container .config-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 1px solid var(--accent-primary);
    background: #ffffff;
    border-radius: 0;
}

#${APP_NAME}-config-container .slider-value {
    min-width: 48px;
    padding: 6px 8px;
    background: transparent;
    border: 1px solid var(--glass-border);
    border-left: 2px solid var(--accent-primary);
}

#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input),
#${APP_NAME}-config-container textarea,
#${APP_NAME}-config-container select,
#${APP_NAME}-config-container .config-select,
#${APP_NAME}-config-container .config-color-input,
#${APP_NAME}-config-container .config-color-picker {
    background: rgba(255, 255, 255, 0.02) !important;
    border: 1px solid var(--glass-border) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] input[type="text"]:not(.settings-search-input),
#${APP_NAME}-config-container[data-ui-theme="light"] input[type="password"]:not(.settings-search-input),
#${APP_NAME}-config-container[data-ui-theme="light"] input[type="number"]:not(.settings-search-input),
#${APP_NAME}-config-container[data-ui-theme="light"] input[type="url"]:not(.settings-search-input),
#${APP_NAME}-config-container[data-ui-theme="light"] textarea,
#${APP_NAME}-config-container[data-ui-theme="light"] select,
#${APP_NAME}-config-container[data-ui-theme="light"] .config-select,
#${APP_NAME}-config-container[data-ui-theme="light"] .config-color-input,
#${APP_NAME}-config-container[data-ui-theme="light"] .config-color-picker {
    background: rgba(255, 255, 255, 0.88) !important;
}

#${APP_NAME}-config-container .settings-subsection-label {
    margin: 18px 0 8px;
    padding: 0;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .font-preview {
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-header,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-description,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-body,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-item,
#${APP_NAME}-config-container[data-ui-theme="light"] .ai-addon-settings-group,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-type-toggles-container,
#${APP_NAME}-config-container[data-ui-theme="light"] .info-card,
#${APP_NAME}-config-container[data-ui-theme="light"] .font-preview-container {
    color: var(--text-primary) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-body .setting-name,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-name,
#${APP_NAME}-config-container[data-ui-theme="light"] .ai-addon-cap-chip.active,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-type-toggle-chip.active {
    color: var(--text-primary) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-body,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-body :where(div, span, p, label, strong):not(.support-badge):not(.lyrics-type-toggle-chip):not(.ai-addon-cap-chip) {
    color: inherit;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-description,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-title-meta,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-body .setting-description,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-body .lyrics-addon-info p,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-card-body .lyrics-addon-note,
#${APP_NAME}-config-container[data-ui-theme="light"] .ai-addon-capabilities-desc {
    color: var(--text-secondary) !important;
}

#${APP_NAME}-config-container .about-info-card {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .about-info-title {
    color: var(--text-primary);
}

#${APP_NAME}-config-container .about-info-description,
#${APP_NAME}-config-container .about-info-note,
#${APP_NAME}-config-container .about-info-description-compact {
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .about-info-meta {
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .about-info-line {
    color: var(--text-primary);
}

#${APP_NAME}-config-container .about-info-divider {
    background: var(--glass-border);
}

#${APP_NAME}-config-container .about-client-id-box {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255,255,255,0.9);
}

#${APP_NAME}-config-container .about-client-id-row {
    gap: 12px;
}

#${APP_NAME}-config-container .about-client-copy-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
}

#${APP_NAME}-config-container .about-client-copy-btn:hover {
    background: rgba(255, 255, 255, 0.12);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .about-client-id-box {
    background: rgba(15, 23, 42, 0.06);
    border-color: rgba(15, 23, 42, 0.1);
    color: var(--text-primary);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .about-info-card {
    background: rgba(255, 255, 255, 0.64) !important;
    border-color: rgba(15, 23, 42, 0.08) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container {
    background: rgba(255, 255, 255, 0.64) !important;
    border-color: rgba(15, 23, 42, 0.08) !important;
    color: var(--text-secondary) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container :where(div, p, li, ul, ol, strong, em, code, pre, blockquote, h2, h3, h4, h5, a) {
    color: var(--text-secondary) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container :where(h2, h3, h4, h5, strong, a) {
    color: var(--text-primary) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container pre,
#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container code {
    background: rgba(15, 23, 42, 0.06) !important;
    border-color: rgba(15, 23, 42, 0.1) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container code {
    color: #0f6cbd !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container blockquote,
#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container hr,
#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container > div > div:first-child {
    border-color: rgba(15, 23, 42, 0.1) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] #patch-notes-container a[href] {
    background: rgba(15, 23, 42, 0.06) !important;
    border: 1px solid rgba(15, 23, 42, 0.12) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .about-client-copy-btn {
    background: rgba(15, 23, 42, 0.06);
    border-color: rgba(15, 23, 42, 0.12);
    color: var(--text-primary);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .about-client-copy-btn:hover {
    background: rgba(15, 23, 42, 0.1);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .support-badge.unsynced,
#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-type-toggle-chip.type-unsynced.active,
#${APP_NAME}-config-container[data-ui-theme="light"] .ai-addon-cap-chip.cap-tmi.active {
    color: #334155 !important;
}

#${APP_NAME}-config-container .config-color-picker:hover,
#${APP_NAME}-config-container .config-slider:hover::-webkit-slider-thumb {
    transform: none !important;
}

#${APP_NAME}-config-container .search-result-group .section-title {
    margin-top: 0;
}

#${APP_NAME}-config-container .section-title {
    margin: 24px 0 0;
    padding: 12px 14px;
    background: transparent;
    border: 1px solid var(--glass-border);
    border-left: 2px solid var(--accent-primary);
}

#${APP_NAME}-config-container .section-title + .option-list-wrapper > .setting-row:first-child,
#${APP_NAME}-config-container .section-title + .service-list-wrapper > .setting-row:first-child {
    margin-top: 0;
    border-top: none;
}

#${APP_NAME}-config-container .config-font-selector {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    min-width: 0;
}

#${APP_NAME}-config-container .config-font-selector-control {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 320px;
    width: 100%;
}

#${APP_NAME}-config-container .config-font-selector-action {
    flex: 0 0 auto;
}

#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input),
#${APP_NAME}-config-container textarea,
#${APP_NAME}-config-container select,
#${APP_NAME}-config-container .config-select,
#${APP_NAME}-config-container .config-text-input,
#${APP_NAME}-config-container .config-font-selector-control,
#${APP_NAME}-config-container .config-color-input,
#${APP_NAME}-config-container .config-color-picker {
    color: var(--text-primary) !important;
    caret-color: var(--text-primary) !important;
    border-radius: 0 !important;
}

#${APP_NAME}-config-container input::placeholder,
#${APP_NAME}-config-container textarea::placeholder {
    color: var(--text-tertiary) !important;
}

#${APP_NAME}-config-container select option,
#${APP_NAME}-config-container .config-select option,
#${APP_NAME}-config-container .config-font-selector-control option {
    color: #f8fafc;
    background: #111827;
}

#${APP_NAME}-config-container[data-ui-theme="light"] select option,
#${APP_NAME}-config-container[data-ui-theme="light"] .config-select option,
#${APP_NAME}-config-container[data-ui-theme="light"] .config-font-selector-control option {
    color: #0f172a;
    background: #ffffff;
}

#${APP_NAME}-config-container .color-preset-selector {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(300px, 100%);
}

#${APP_NAME}-config-container .color-preset-summary,
#${APP_NAME}-config-container .color-preset-grid {
    border: 1px solid var(--glass-border);
    background: rgba(255, 255, 255, 0.02);
    border-radius: 0 !important;
}

#${APP_NAME}-config-container .color-preset-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
}

#${APP_NAME}-config-container .color-preset-swatch {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
    border-radius: 0 !important;
}

#${APP_NAME}-config-container .color-preset-meta {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
}

#${APP_NAME}-config-container .color-preset-name {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

#${APP_NAME}-config-container .color-preset-code {
    color: var(--text-secondary);
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: nowrap;
}

#${APP_NAME}-config-container .color-preset-toggle-btn {
    flex: 0 0 auto;
    white-space: nowrap;
}

#${APP_NAME}-config-container .color-preset-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    padding: 12px;
}

#${APP_NAME}-config-container .color-preset-grid-item {
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
    outline: none;
    border-radius: 0 !important;
}

#${APP_NAME}-config-container .color-preset-grid-item:hover {
    transform: translateY(-1px);
}

#${APP_NAME}-config-container .color-preset-grid-item[data-selected="true"] {
    border: 2px solid var(--accent-primary);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
}

#${APP_NAME}-config-container .lyrics-provider-card-description {
    display: none;
}

#${APP_NAME}-config-container .lyrics-provider-card-header {
    align-items: flex-start;
}

#${APP_NAME}-config-container .lyrics-provider-summary {
    margin-top: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.45;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-summary {
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .debug-info-panel {
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 0 !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container .debug-info-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .debug-info-title {
    margin: 0 0 4px;
    font-size: 16px;
    color: var(--text-primary);
    font-weight: 700;
}

#${APP_NAME}-config-container .debug-info-timestamp,
#${APP_NAME}-config-container .debug-info-inline-meta,
#${APP_NAME}-config-container .debug-info-empty {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .debug-info-section {
    margin-bottom: 16px;
}

#${APP_NAME}-config-container .debug-info-section-label {
    margin-bottom: 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .debug-info-section-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

#${APP_NAME}-config-container .debug-info-block,
#${APP_NAME}-config-container .debug-api-list {
    background: rgba(255, 255, 255, 0.02) !important;
    border: 1px solid var(--glass-border);
    border-radius: 0 !important;
    padding: 12px;
    font-size: 13px;
    line-height: 1.6;
}

#${APP_NAME}-config-container .debug-info-key {
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .debug-info-value {
    color: var(--text-primary);
}

#${APP_NAME}-config-container .debug-info-code {
    color: #fbbf24;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
}

#${APP_NAME}-config-container .debug-info-tag {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border: 1px solid rgba(74, 222, 128, 0.28);
    font-weight: 600;
    border-radius: 0 !important;
}

#${APP_NAME}-config-container .debug-api-list {
    max-height: 320px;
    overflow-y: auto;
    padding: 8px;
}

#${APP_NAME}-config-container .debug-api-empty {
    padding: 20px 12px;
    text-align: center;
}

#${APP_NAME}-config-container .debug-api-item {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--glass-border);
    border-radius: 0 !important;
    padding: 10px 12px;
}

#${APP_NAME}-config-container .debug-api-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    cursor: pointer;
}

#${APP_NAME}-config-container .debug-api-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

#${APP_NAME}-config-container .debug-api-category,
#${APP_NAME}-config-container .debug-api-status {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-radius: 0 !important;
}

#${APP_NAME}-config-container .debug-api-status {
    padding: 0;
}

#${APP_NAME}-config-container .debug-api-duration,
#${APP_NAME}-config-container .debug-api-timestamp {
    font-size: 11px;
    color: var(--text-tertiary);
    white-space: nowrap;
}

#${APP_NAME}-config-container .debug-api-endpoint {
    margin-top: 6px;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

#${APP_NAME}-config-container .debug-api-details {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .debug-api-detail-group {
    margin-bottom: 8px;
}

#${APP_NAME}-config-container .debug-json-label {
    margin-bottom: 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .debug-json-block {
    margin: 0;
    max-height: 120px;
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--glass-border);
    border-radius: 0 !important;
    background: rgba(0, 0, 0, 0.18);
    color: var(--text-primary);
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

#${APP_NAME}-config-container .debug-json-block.error {
    color: #ef4444;
}

#${APP_NAME}-config-container .debug-info-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}

#${APP_NAME}-config-container .debug-action-btn {
    flex: 1 1 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
}

#${APP_NAME}-config-container .config-info-row {
    background: color-mix(in srgb, var(--accent-primary) 8%, var(--glass-bg));
    border-left: 2px solid var(--accent-primary);
}

#${APP_NAME}-config-container .config-info-message {
    color: var(--text-primary) !important;
    white-space: pre-line;
    line-height: 1.55;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .config-info-row {
    background: color-mix(in srgb, var(--accent-primary) 6%, #ffffff);
    border-color: var(--accent-primary);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .config-info-message {
    color: var(--text-primary) !important;
}

@media (max-width: 1100px) {
    #${APP_NAME}-config-container {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto minmax(0, 1fr);
    }

    #${APP_NAME}-config-container .settings-header,
    #${APP_NAME}-config-container .settings-sidebar,
    #${APP_NAME}-config-container .settings-search-container,
    #${APP_NAME}-config-container .settings-main-panel {
        grid-column: 1;
    }

    #${APP_NAME}-config-container .settings-header {
        grid-row: 1;
    }

    #${APP_NAME}-config-container .settings-sidebar {
        grid-row: 2;
        padding: 14px 20px 6px;
        border-right: none;
        border-bottom: 1px solid var(--glass-border);
        max-height: min(26vh, 220px);
        scrollbar-gutter: stable;
    }

    #${APP_NAME}-config-container .settings-search-container {
        grid-row: 3;
        padding: 12px 20px;
    }

    #${APP_NAME}-config-container .settings-main-panel {
        grid-row: 4;
        margin: 0 20px 20px;
    }

    #${APP_NAME}-config-container .setting-row-content {
        align-items: flex-start;
        grid-template-columns: 1fr;
        gap: 14px;
    }

    #${APP_NAME}-config-container .instrumental-break-picker-row .setting-row-content {
        grid-template-columns: 1fr;
    }

    #${APP_NAME}-config-container .karaoke-fill-curve-row .setting-row-content {
        grid-template-columns: 1fr;
    }

    #${APP_NAME}-config-container .karaoke-fill-curve-control {
        grid-template-columns: 1fr;
        align-items: stretch;
    }

    #${APP_NAME}-config-container .setting-row-right {
        width: 100%;
        max-width: none;
        justify-content: flex-start;
    }

    #${APP_NAME}-config-container .slider-container {
        width: 100%;
        max-width: none;
    }

    #${APP_NAME}-config-container .settings-nav-group-toggle {
        min-height: 36px;
        padding: 0 12px;
        font-size: 11px;
    }

    #${APP_NAME}-config-container .settings-nav-card {
        min-height: 40px;
        padding: 0 12px;
        gap: 8px;
    }

    #${APP_NAME}-config-container .settings-nav-subitem {
        min-height: 36px;
        padding: 0 12px 0 20px;
        font-size: 12px;
    }

    #${APP_NAME}-config-container .settings-nav-subitem-label,
    #${APP_NAME}-config-container .settings-nav-card-title {
        line-height: 1.25;
    }
}

@media (max-width: 800px) {
    #${APP_NAME}-config-container .settings-header {
        padding: 20px 20px 14px;
    }

    #${APP_NAME}-config-container .settings-header-content {
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
    }

    #${APP_NAME}-config-container .settings-title-section {
        flex-wrap: wrap;
        row-gap: 6px;
    }

    #${APP_NAME}-config-container .settings-buttons {
        width: 100%;
        justify-content: flex-start;
        gap: 6px;
    }

    #${APP_NAME}-config-container .settings-sidebar {
        padding: 12px 16px 6px;
    }

    #${APP_NAME}-config-container .settings-nav-card,
    #${APP_NAME}-config-container .settings-nav-subitem,
    #${APP_NAME}-config-container .settings-nav-group-toggle {
        min-height: 34px;
    }

    #${APP_NAME}-config-container .settings-nav-card {
        padding: 0 10px;
        gap: 6px;
    }

    #${APP_NAME}-config-container .settings-nav-card-title {
        font-size: 12px;
    }

    #${APP_NAME}-config-container .settings-nav-subitem {
        padding: 0 10px 0 18px;
        font-size: 12px;
    }

    #${APP_NAME}-config-container .settings-search-container {
        padding: 12px 16px 10px;
    }

    #${APP_NAME}-config-container .settings-main-panel {
        margin: 0 16px 16px;
    }

    #${APP_NAME}-config-container .settings-content {
        padding: 20px 20px 32px;
    }

    #${APP_NAME}-config-container .settings-panel-hero {
        gap: 10px;
        padding: 0 0 16px;
    }

    #${APP_NAME}-config-container .settings-panel-copy h2 {
        font-size: 24px;
        line-height: 1.05;
    }

    #${APP_NAME}-config-container .settings-panel-copy p {
        font-size: 12px;
    }
}

@media (max-width: 650px) {
    #${APP_NAME}-config-container .settings-header {
        padding: 16px 16px 12px;
    }

    #${APP_NAME}-config-container .settings-title-section h1 {
        font-size: 22px;
    }

    #${APP_NAME}-config-container .settings-sidebar {
        padding: 12px 12px 8px;
        max-height: min(24vh, 180px);
    }

    #${APP_NAME}-config-container .settings-search-container {
        padding: 12px 12px 8px;
    }

    #${APP_NAME}-config-container .settings-main-panel {
        margin: 0 12px 12px;
        border-radius: 16px;
    }

    #${APP_NAME}-config-container .settings-content {
        padding: 16px 16px 28px;
    }

    #${APP_NAME}-config-container .settings-panel-hero {
        flex-direction: column;
        gap: 8px;
        padding: 0 0 14px;
    }

    #${APP_NAME}-config-container .settings-panel-copy h2 {
        font-size: 18px;
    }

    #${APP_NAME}-config-container .settings-panel-copy p {
        font-size: 12px;
        line-height: 1.5;
    }

    #${APP_NAME}-config-container .settings-card-grid,
    #${APP_NAME}-config-container .settings-card-grid.fullscreen-presentation-grid {
        grid-template-columns: 1fr;
    }

    #${APP_NAME}-config-container .settings-theme-btn,
    #${APP_NAME}-config-container .settings-github-btn,
    #${APP_NAME}-config-container .settings-discord-btn,
    #${APP_NAME}-config-container .settings-coffee-btn,
    #${APP_NAME}-config-container .settings-close-btn {
        min-height: 34px;
        padding: 0 10px;
        font-size: 12px;
        border-radius: 8px;
    }

    #${APP_NAME}-config-container .settings-close-btn {
        width: 34px;
        padding: 0;
    }
}

/* ========================================
   Compact Glass Overrides
   Shared with the compact toolbar/status-pill visual language.
   ======================================== */
#${APP_NAME}-config-container {
    --settings-accent-rgb: var(--spice-rgb-accent, 30, 215, 96);
    --accent-primary: rgb(var(--settings-accent-rgb));
    --accent-primary-light: rgba(var(--settings-accent-rgb), 0.14);
    --settings-glass: rgba(var(--spice-rgb-card, 32, 32, 32), 0.5);
    --settings-glass-strong: rgba(var(--spice-rgb-card, 32, 32, 32), 0.66);
    --settings-glass-soft: rgba(var(--spice-rgb-text, 255, 255, 255), 0.035);
    --settings-glass-hover: rgba(var(--spice-rgb-text, 255, 255, 255), 0.075);
    --settings-glass-active: rgba(var(--settings-accent-rgb), 0.14);
    --settings-border: rgba(var(--spice-rgb-text, 255, 255, 255), 0.11);
    --settings-border-strong: rgba(var(--spice-rgb-text, 255, 255, 255), 0.17);
    --settings-divider: rgba(var(--spice-rgb-text, 255, 255, 255), 0.1);
    --settings-section-surface: rgba(var(--spice-rgb-text, 255, 255, 255), 0.026);
    --settings-section-surface-hover: rgba(var(--spice-rgb-text, 255, 255, 255), 0.048);
    --settings-section-outline: rgba(var(--spice-rgb-text, 255, 255, 255), 0.075);
    --settings-row-divider: rgba(var(--spice-rgb-text, 255, 255, 255), 0.07);
    --settings-section-radius: 12px;
    --settings-field-radius: 10px;
    --settings-row-min-height: 64px;
    --settings-row-padding-x: 18px;
    --settings-shell-radius: 22px;
    --settings-panel-radius: 18px;
    --settings-card-radius: 15px;
    --settings-control-radius: 999px;
    --settings-control-height: 36px;
    --settings-glass-blur: blur(18px) saturate(135%);
    --radius-sm: 10px;
    --radius-md: 12px;
    --radius-lg: 15px;
    --radius-xl: 22px;
    --glass-bg: var(--settings-glass-soft);
    --glass-bg-hover: var(--settings-glass-hover);
    --glass-bg-active: var(--settings-glass-active);
    --glass-border: var(--settings-border);
    --glass-border-light: var(--settings-border-strong);
    --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.12);
    --shadow-md: 0 10px 28px rgba(0, 0, 0, 0.18);
    --shadow-lg: 0 20px 54px rgba(0, 0, 0, 0.28);
    grid-template-columns: 236px minmax(0, 1fr);
    border-radius: var(--settings-shell-radius);
    background: #0f1215;
}

#${APP_NAME}-config-container[data-ui-theme="light"] {
    --settings-glass: rgba(255, 255, 255, 0.68);
    --settings-glass-strong: rgba(255, 255, 255, 0.86);
    --settings-glass-soft: rgba(255, 255, 255, 0.48);
    --settings-glass-hover: rgba(255, 255, 255, 0.78);
    --settings-glass-active: rgba(var(--settings-accent-rgb), 0.11);
    --settings-border: rgba(15, 23, 42, 0.1);
    --settings-border-strong: rgba(15, 23, 42, 0.16);
    --settings-divider: rgba(15, 23, 42, 0.09);
    --settings-section-surface: rgba(255, 255, 255, 0.58);
    --settings-section-surface-hover: rgba(255, 255, 255, 0.82);
    --settings-section-outline: rgba(15, 23, 42, 0.08);
    --settings-row-divider: rgba(15, 23, 42, 0.07);
    background: #f1f3f6;
}

#${APP_NAME}-config-container .settings-header::before {
    display: none;
}

.ivlyrics-settings-modal-shell {
    border-radius: 24px !important;
    background: rgba(var(--spice-rgb-card, 24, 24, 24), 0.98) !important;
    border: 1px solid rgba(var(--spice-rgb-text, 255, 255, 255), 0.12) !important;
    box-shadow: 0 28px 72px rgba(0, 0, 0, 0.42) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

.ivlyrics-settings-modal-shell:has(#${APP_NAME}-config-container[data-ui-theme="light"]) {
    background: rgba(248, 250, 252, 0.98) !important;
    border-color: rgba(15, 23, 42, 0.12) !important;
    box-shadow: 0 28px 72px rgba(15, 23, 42, 0.2) !important;
}

/* One compact capsule for all header actions. */
#${APP_NAME}-config-container .settings-buttons {
    display: flex;
    align-items: stretch;
    flex-wrap: nowrap;
    gap: 0;
    max-width: 100%;
    padding: 3px;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid var(--settings-border);
    border-radius: var(--settings-control-radius) !important;
    background: var(--settings-glass);
    box-shadow: var(--shadow-sm) !important;
    backdrop-filter: var(--settings-glass-blur) !important;
    -webkit-backdrop-filter: var(--settings-glass-blur) !important;
    scrollbar-width: none;
}

#${APP_NAME}-config-container .settings-buttons::-webkit-scrollbar {
    display: none;
}

#${APP_NAME}-config-container .settings-theme-btn,
#${APP_NAME}-config-container .settings-github-btn,
#${APP_NAME}-config-container .settings-discord-btn,
#${APP_NAME}-config-container .settings-coffee-btn,
#${APP_NAME}-config-container .settings-close-btn {
    flex: 0 0 auto;
    min-height: 34px;
    height: 34px;
    padding: 0 12px;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: var(--text-secondary);
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-buttons > button + button {
    border-left: 1px solid var(--settings-divider) !important;
}

#${APP_NAME}-config-container .settings-theme-btn:hover,
#${APP_NAME}-config-container .settings-github-btn:hover,
#${APP_NAME}-config-container .settings-discord-btn:hover,
#${APP_NAME}-config-container .settings-coffee-btn:hover,
#${APP_NAME}-config-container .settings-close-btn:hover {
    background: var(--settings-glass-hover) !important;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-close-btn {
    width: 36px;
    padding: 0;
    border-radius: 0 var(--settings-control-radius) var(--settings-control-radius) 0 !important;
}

#${APP_NAME}-config-container .settings-version,
#${APP_NAME}-config-container .settings-panel-badge,
#${APP_NAME}-config-container .settings-nav-card-badge,
#${APP_NAME}-config-container .support-badge,
#${APP_NAME}-config-container .setting-name > span[style*="border-radius"] {
    border-radius: var(--settings-control-radius) !important;
}

/* Compact tree navigation without capsule-shaped group buttons. */
#${APP_NAME}-config-container .settings-sidebar {
    padding: 14px 10px 18px 14px;
    background: rgba(var(--spice-rgb-text, 255, 255, 255), 0.012);
    border-right-color: var(--settings-divider);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

#${APP_NAME}-config-container .settings-sidebar-nav {
    gap: 0;
    padding-right: 4px;
}

#${APP_NAME}-config-container .settings-nav-group {
    margin: 0 0 6px;
    padding: 0;
    border-bottom: 0;
}

#${APP_NAME}-config-container .settings-nav-group-toggle,
#${APP_NAME}-config-container .settings-nav-card,
#${APP_NAME}-config-container .settings-nav-subitem {
    border-radius: 6px !important;
}

#${APP_NAME}-config-container .settings-nav-group-toggle {
    min-height: 32px;
    padding: 0 7px;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-transform: none;
}

#${APP_NAME}-config-container .settings-nav-group-toggle:hover,
#${APP_NAME}-config-container .settings-nav-group-toggle.expanded,
#${APP_NAME}-config-container .settings-nav-group-toggle.active {
    border: 0;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-nav-group-toggle:hover {
    background: var(--settings-glass-soft);
}

#${APP_NAME}-config-container .settings-nav-group-toggle.expanded {
    background: transparent;
}

#${APP_NAME}-config-container .settings-nav-group-items {
    position: relative;
    margin: 1px 0 7px 10px;
    padding: 1px 0 1px 10px;
    border-left: 1px solid var(--settings-divider);
}

#${APP_NAME}-config-container .settings-nav-tree-node {
    position: relative;
    width: 100%;
}

#${APP_NAME}-config-container .settings-nav-tree-children {
    position: relative;
    margin-left: 10px;
    padding-left: 10px;
}

#${APP_NAME}-config-container .settings-nav-tree-children::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 1px;
    background: var(--settings-divider);
    transition: background-color 120ms ease;
}

#${APP_NAME}-config-container .settings-nav-tree-node.has-active-path > .settings-nav-tree-children::before {
    background: rgba(var(--settings-accent-rgb), 0.34);
}

#${APP_NAME}-config-container .settings-nav-card,
#${APP_NAME}-config-container .settings-nav-subitem {
    position: relative;
    width: 100%;
    min-height: 30px;
    margin: 0;
    padding: 0 8px;
    border: 0 !important;
    background: transparent;
    font-size: 12.5px;
    font-weight: 550;
}

#${APP_NAME}-config-container .settings-nav-subitem::before {
    content: "";
    position: absolute;
    top: 50%;
    left: -11px;
    width: 8px;
    height: 1px;
    background: var(--settings-divider);
}

#${APP_NAME}-config-container .settings-nav-card:hover,
#${APP_NAME}-config-container .settings-nav-subitem:hover {
    background: var(--settings-glass-soft);
}

#${APP_NAME}-config-container .settings-nav-card.active,
#${APP_NAME}-config-container .settings-nav-subitem.active {
    border: 0 !important;
    background: transparent;
    color: rgb(var(--settings-accent-rgb));
    font-weight: 700;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-nav-subitem.active::before {
    background: rgba(var(--settings-accent-rgb), 0.72);
}

#${APP_NAME}-config-container .settings-nav-subitem.has-children {
    font-weight: 650;
}

#${APP_NAME}-config-container .settings-nav-subitem.in-active-path {
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-nav-subitem.in-active-path::before {
    background: rgba(var(--settings-accent-rgb), 0.42);
}

#${APP_NAME}-config-container .settings-nav-tree-node[data-nav-depth="1"] > .settings-nav-subitem {
    font-size: 12px;
    color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
}

#${APP_NAME}-config-container .settings-nav-tree-node[data-nav-depth="2"] > .settings-nav-subitem {
    font-size: 11.5px;
    color: color-mix(in srgb, var(--text-secondary) 76%, transparent);
}

#${APP_NAME}-config-container .settings-nav-tree-node[data-nav-depth="1"] > .settings-nav-subitem.active,
#${APP_NAME}-config-container .settings-nav-tree-node[data-nav-depth="2"] > .settings-nav-subitem.active {
    color: rgb(var(--settings-accent-rgb));
}

#${APP_NAME}-config-container .settings-nav-subitem.active::after {
    content: "";
    position: absolute;
    top: 7px;
    bottom: 7px;
    left: -11px;
    width: 2px;
    border-radius: 2px;
    background: rgb(var(--settings-accent-rgb));
}

#${APP_NAME}-config-container .settings-nav-card.active {
    box-shadow: inset 2px 0 0 rgb(var(--settings-accent-rgb)) !important;
}

#${APP_NAME}-config-container .settings-nav-group-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 0 !important;
    background: transparent;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .settings-nav-group-indicator svg {
    width: 12px;
    height: 12px;
}

#${APP_NAME}-config-container .settings-nav-subitem-label {
    min-width: 0;
    flex: 1 1 auto;
}

/* Search and main content use the same translucent shells. */
#${APP_NAME}-config-container .settings-search-wrapper {
    border-radius: var(--settings-control-radius) !important;
}

#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input {
    height: 40px !important;
    border: 1px solid var(--settings-border) !important;
    border-radius: var(--settings-control-radius) !important;
    background: var(--settings-glass) !important;
    box-shadow: var(--shadow-sm) !important;
    backdrop-filter: var(--settings-glass-blur) !important;
    -webkit-backdrop-filter: var(--settings-glass-blur) !important;
}

#${APP_NAME}-config-container .settings-search-input:hover,
#${APP_NAME}-config-container .settings-search-input:focus {
    border-color: var(--settings-border-strong) !important;
    background: var(--settings-glass-strong) !important;
}

#${APP_NAME}-config-container .settings-search-clear {
    width: 28px;
    height: 28px;
    border-radius: 50% !important;
    background: var(--settings-glass-soft);
}

#${APP_NAME}-config-container .settings-main-panel {
    border: 0;
    border-radius: 0 !important;
    background: transparent;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .settings-main-panel {
    background: transparent;
}

#${APP_NAME}-config-container .settings-content {
    padding: 26px 30px 44px;
}

#${APP_NAME}-config-container .settings-panel-hero {
    margin-bottom: 0;
    padding-bottom: 20px;
    border-bottom: 0;
}

#${APP_NAME}-config-container .settings-panel-badge {
    border: 1px solid rgba(var(--settings-accent-rgb), 0.25);
    background: var(--settings-glass-active);
}

/* Section labels are separate from the rows so the content can breathe. */
#${APP_NAME}-config-container .section-title {
    margin: 30px 2px 10px;
    padding: 0;
    border: 0;
    border-radius: 0 !important;
    background: transparent;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container .tab-content > .section-title:first-child,
#${APP_NAME}-config-container .search-result-group:first-child .section-title {
    margin-top: 20px;
}

#${APP_NAME}-config-container .section-title:has(+ .option-list-wrapper),
#${APP_NAME}-config-container .section-title:has(+ .service-list-wrapper) {
    margin-bottom: 10px;
    border: 0;
    border-radius: 0 !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .option-list-wrapper,
#${APP_NAME}-config-container .service-list-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    margin: 0 0 30px;
    border: 1px solid var(--settings-section-outline);
    border-radius: var(--settings-section-radius) !important;
    background: var(--settings-section-surface);
    box-shadow: none !important;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

#${APP_NAME}-config-container .section-title + .option-list-wrapper,
#${APP_NAME}-config-container .section-title + .service-list-wrapper {
    margin-top: 0;
}

#${APP_NAME}-config-container .option-list-wrapper:has(+ .option-list-wrapper:not(:empty)),
#${APP_NAME}-config-container .option-list-wrapper:has(+ .service-list-wrapper:not(:empty)),
#${APP_NAME}-config-container .service-list-wrapper:has(+ .option-list-wrapper:not(:empty)),
#${APP_NAME}-config-container .service-list-wrapper:has(+ .service-list-wrapper:not(:empty)) {
    margin-bottom: 0;
    border-bottom: 0;
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
}

#${APP_NAME}-config-container .option-list-wrapper + .option-list-wrapper:not(:empty),
#${APP_NAME}-config-container .option-list-wrapper + .service-list-wrapper:not(:empty),
#${APP_NAME}-config-container .service-list-wrapper + .option-list-wrapper:not(:empty),
#${APP_NAME}-config-container .service-list-wrapper + .service-list-wrapper:not(:empty) {
    margin-top: 0;
    border-top: 0;
    border-top-left-radius: 0 !important;
    border-top-right-radius: 0 !important;
}

#${APP_NAME}-config-container .option-list-wrapper:empty,
#${APP_NAME}-config-container .service-list-wrapper:empty {
    display: none;
}

#${APP_NAME}-config-container .option-list-wrapper[style*="margin-bottom"],
#${APP_NAME}-config-container .service-list-wrapper[style*="margin-bottom"] {
    margin-bottom: 30px !important;
}

#${APP_NAME}-config-container .setting-row,
#${APP_NAME}-config-container .search-result-item {
    margin: 0;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .option-list-wrapper > .setting-row,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row {
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .option-list-wrapper > .setting-row:last-child,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row:last-child {
    border-bottom: 0 !important;
}

#${APP_NAME}-config-container .setting-row:hover,
#${APP_NAME}-config-container .search-result-item:hover {
    background: var(--settings-section-surface-hover);
}

#${APP_NAME}-config-container .option-list-wrapper > .setting-row:hover,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row:hover {
    background: var(--settings-section-surface-hover);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .setting-row:hover,
#${APP_NAME}-config-container[data-ui-theme="light"] .search-result-item:hover,
#${APP_NAME}-config-container[data-ui-theme="light"] .option-list-wrapper > .setting-row:hover,
#${APP_NAME}-config-container[data-ui-theme="light"] .service-list-wrapper > .setting-row:hover {
    background: var(--settings-section-surface-hover);
}

#${APP_NAME}-config-container .option-list-wrapper > .setting-row + .setting-row::before,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row + .setting-row::before,
#${APP_NAME}-config-container .option-list-wrapper + .option-list-wrapper:not(:empty) > .setting-row:first-child::before,
#${APP_NAME}-config-container .option-list-wrapper + .service-list-wrapper:not(:empty) > .setting-row:first-child::before,
#${APP_NAME}-config-container .service-list-wrapper + .option-list-wrapper:not(:empty) > .setting-row:first-child::before,
#${APP_NAME}-config-container .service-list-wrapper + .service-list-wrapper:not(:empty) > .setting-row:first-child::before {
    content: "";
    position: absolute;
    z-index: 1;
    top: 0;
    left: var(--settings-row-padding-x);
    right: var(--settings-row-padding-x);
    height: 1px;
    background: var(--settings-row-divider);
    pointer-events: none;
}

/* A hand-built first row and a following option list still form one section. */
#${APP_NAME}-config-container .tab-content > .section-title + .setting-row {
    overflow: hidden;
    border: 1px solid var(--settings-section-outline) !important;
    border-radius: var(--settings-section-radius) !important;
    background: var(--settings-section-surface);
}

#${APP_NAME}-config-container .tab-content > .section-title + .setting-row:has(+ .option-list-wrapper),
#${APP_NAME}-config-container .tab-content > .section-title + .setting-row:has(+ .service-list-wrapper),
#${APP_NAME}-config-container .tab-content > .setting-row:has(+ .setting-row) {
    border-bottom: 0 !important;
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
}

#${APP_NAME}-config-container .tab-content > .setting-row + .option-list-wrapper,
#${APP_NAME}-config-container .tab-content > .setting-row + .service-list-wrapper,
#${APP_NAME}-config-container .tab-content > .setting-row + .setting-row {
    margin-top: 0;
    border-top: 0 !important;
    border-top-left-radius: 0 !important;
    border-top-right-radius: 0 !important;
}

#${APP_NAME}-config-container .tab-content > .setting-row + .option-list-wrapper > .setting-row:first-child::before,
#${APP_NAME}-config-container .tab-content > .setting-row + .service-list-wrapper > .setting-row:first-child::before,
#${APP_NAME}-config-container .tab-content > .setting-row + .setting-row::before {
    content: "";
    position: absolute;
    z-index: 1;
    top: 0;
    left: var(--settings-row-padding-x);
    right: var(--settings-row-padding-x);
    height: 1px;
    background: var(--settings-row-divider);
    pointer-events: none;
}

#${APP_NAME}-config-container .setting-row-content {
    min-height: var(--settings-row-min-height);
    padding: 13px var(--settings-row-padding-x);
    gap: 24px;
    grid-template-columns: minmax(220px, 1fr) minmax(260px, 360px);
}

#${APP_NAME}-config-container .setting-row-content[style*="flex-direction: column"] {
    display: flex;
    flex-direction: column;
    align-items: stretch;
}

#${APP_NAME}-config-container .setting-row-left {
    gap: 4px;
    padding-right: 8px;
}

#${APP_NAME}-config-container .setting-row-right {
    gap: 12px;
    padding-right: 0;
}

#${APP_NAME}-config-container .settings-subsection-label {
    margin: 28px 2px 10px;
}

#${APP_NAME}-config-container .search-result-group .option-list-wrapper {
    gap: 0;
}

#${APP_NAME}-config-container .section-title + .setting-row {
    margin-top: 0;
}

#${APP_NAME}-config-container .tab-content > .setting-row + .setting-row {
    margin-top: 0;
}

#${APP_NAME}-config-container .settings-card-grid {
    gap: 10px;
    overflow: visible;
    border: 0;
    border-radius: 0 !important;
    background: transparent;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-choice-card {
    border: 0 !important;
    border-radius: 12px !important;
    background: var(--settings-section-surface) !important;
}

#${APP_NAME}-config-container .settings-choice-card:hover {
    background: var(--settings-section-surface-hover) !important;
}

#${APP_NAME}-config-container .settings-choice-card.active {
    border: 0 !important;
    background: var(--settings-glass-active) !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-choice-card.active::before {
    display: none;
}

#${APP_NAME}-config-container .settings-choice-icon {
    border-radius: 12px !important;
    background: var(--settings-glass-hover);
}

#${APP_NAME}-config-container .font-preview-container,
#${APP_NAME}-config-container .info-card,
#${APP_NAME}-config-container .about-info-card,
#${APP_NAME}-config-container .lyrics-providers-container,
#${APP_NAME}-config-container .debug-info-panel {
    border: 1px solid var(--settings-section-outline) !important;
    border-radius: var(--settings-section-radius) !important;
    background: var(--settings-section-surface) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container .font-preview {
    border-radius: 12px !important;
}

/* Provider cards keep their hierarchy but join the rounded glass system. */
#${APP_NAME}-config-container .lyrics-provider-card {
    overflow: hidden;
    border: 1px solid var(--settings-section-outline);
    border-radius: var(--settings-section-radius) !important;
    background: var(--settings-section-surface);
    box-shadow: none !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-header,
#${APP_NAME}-config-container .lyrics-provider-card-description,
#${APP_NAME}-config-container .lyrics-provider-card-body {
    border-radius: 0 !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-header:hover {
    background: var(--settings-glass-hover);
}

#${APP_NAME}-config-container .lyrics-provider-card-body {
    background: transparent;
}

#${APP_NAME}-config-container .lyrics-providers-list {
    gap: 10px;
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider,
#${APP_NAME}-config-container .ios-toggle-slider {
    border-radius: var(--settings-control-radius) !important;
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider::before,
#${APP_NAME}-config-container .ios-toggle-slider::before {
    border-radius: 50% !important;
}

#${APP_NAME}-config-container .lyrics-type-toggle-chip,
#${APP_NAME}-config-container .ai-addon-cap-chip,
#${APP_NAME}-config-container .color-preset-chip {
    border-radius: var(--settings-control-radius) !important;
}

/* Compact pill actions and switches. */
#${APP_NAME}-config-container .btn,
#${APP_NAME}-config-container .btn-primary,
#${APP_NAME}-config-container .order-btn,
#${APP_NAME}-config-container .swap-button,
#${APP_NAME}-config-container .ai-addon-btn,
#${APP_NAME}-config-container .about-client-copy-btn,
#${APP_NAME}-config-container .karaoke-fill-curve-reset {
    min-width: 0;
    min-height: 34px;
    height: 34px;
    padding: 0 13px;
    border: 1px solid var(--settings-border) !important;
    border-radius: var(--settings-control-radius) !important;
    background: var(--settings-glass-soft);
    color: var(--text-primary);
    box-shadow: none !important;
}

#${APP_NAME}-config-container .btn:hover:not(:disabled),
#${APP_NAME}-config-container .btn-primary:hover:not(:disabled),
#${APP_NAME}-config-container .order-btn:hover:not(:disabled),
#${APP_NAME}-config-container .swap-button:hover:not(:disabled),
#${APP_NAME}-config-container .ai-addon-btn:hover:not(:disabled),
#${APP_NAME}-config-container .about-client-copy-btn:hover:not(:disabled),
#${APP_NAME}-config-container .karaoke-fill-curve-reset:hover:not(:disabled) {
    border-color: var(--settings-border-strong) !important;
    background: var(--settings-glass-hover);
}

#${APP_NAME}-config-container .order-btn,
#${APP_NAME}-config-container .swap-button {
    width: 30px;
    min-width: 30px;
    height: 30px;
    min-height: 30px;
    padding: 0;
    border-radius: 50% !important;
}

#${APP_NAME}-config-container .instrumental-break-selected-preview,
#${APP_NAME}-config-container .instrumental-break-preview-option {
    border: 1px solid var(--settings-border) !important;
    border-radius: 12px !important;
    background: var(--settings-glass-soft);
    box-shadow: none !important;
}

#${APP_NAME}-config-container .instrumental-break-preview-option:hover,
#${APP_NAME}-config-container .instrumental-break-preview-option.active {
    border-color: rgba(var(--settings-accent-rgb), 0.4) !important;
    background: var(--settings-glass-active);
}

/* Rendering every instrumental-break sample at once is extremely expensive
   in Chromium. Keep the grid still and animate only the sample the user is
   actively inspecting; the dedicated selected preview remains animated. */
#${APP_NAME}-config-container .instrumental-break-picker-row .lyrics-break-icon,
#${APP_NAME}-config-container .instrumental-break-picker-row .lyrics-break-icon *,
#${APP_NAME}-config-container .instrumental-break-picker-row .lyrics-break-icon::before,
#${APP_NAME}-config-container .instrumental-break-picker-row .lyrics-break-icon::after,
#${APP_NAME}-config-container .instrumental-break-picker-row .lyrics-break-icon *::before,
#${APP_NAME}-config-container .instrumental-break-picker-row .lyrics-break-icon *::after {
    animation-play-state: paused !important;
}

#${APP_NAME}-config-container .instrumental-break-selected-preview:hover .lyrics-break-icon,
#${APP_NAME}-config-container .instrumental-break-selected-preview:hover .lyrics-break-icon *,
#${APP_NAME}-config-container .instrumental-break-selected-preview:hover .lyrics-break-icon::before,
#${APP_NAME}-config-container .instrumental-break-selected-preview:hover .lyrics-break-icon::after,
#${APP_NAME}-config-container .instrumental-break-selected-preview:hover .lyrics-break-icon *::before,
#${APP_NAME}-config-container .instrumental-break-selected-preview:hover .lyrics-break-icon *::after,
#${APP_NAME}-config-container .instrumental-break-preview-option:hover .lyrics-break-icon,
#${APP_NAME}-config-container .instrumental-break-preview-option:hover .lyrics-break-icon *,
#${APP_NAME}-config-container .instrumental-break-preview-option:hover .lyrics-break-icon::before,
#${APP_NAME}-config-container .instrumental-break-preview-option:hover .lyrics-break-icon::after,
#${APP_NAME}-config-container .instrumental-break-preview-option:hover .lyrics-break-icon *::before,
#${APP_NAME}-config-container .instrumental-break-preview-option:hover .lyrics-break-icon *::after,
#${APP_NAME}-config-container .instrumental-break-preview-option:focus-visible .lyrics-break-icon,
#${APP_NAME}-config-container .instrumental-break-preview-option:focus-visible .lyrics-break-icon *,
#${APP_NAME}-config-container .instrumental-break-preview-option:focus-visible .lyrics-break-icon::before,
#${APP_NAME}-config-container .instrumental-break-preview-option:focus-visible .lyrics-break-icon::after,
#${APP_NAME}-config-container .instrumental-break-preview-option:focus-visible .lyrics-break-icon *::before,
#${APP_NAME}-config-container .instrumental-break-preview-option:focus-visible .lyrics-break-icon *::after {
    animation-play-state: running !important;
}

#${APP_NAME}-config-container .btn-primary {
    border-color: rgba(var(--settings-accent-rgb), 0.4) !important;
    background: var(--settings-glass-active) !important;
}

#${APP_NAME}-config-container .switch-checkbox {
    width: 46px;
    height: 24px;
    border: 1px solid var(--settings-border) !important;
    border-radius: var(--settings-control-radius) !important;
    background: var(--settings-glass-soft);
}

#${APP_NAME}-config-container .switch-checkbox::after {
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50% !important;
    background: var(--text-secondary);
}

#${APP_NAME}-config-container .switch-checkbox.active {
    border-color: rgba(var(--settings-accent-rgb), 0.48) !important;
    background: rgba(var(--settings-accent-rgb), 0.2);
}

#${APP_NAME}-config-container .switch-checkbox.active::after {
    background: rgb(var(--settings-accent-rgb));
    transform: translateX(22px);
}

/* Long fields stay compact and rounded without becoming oversized pills. */
#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="password"],
#${APP_NAME}-config-container input[type="number"],
#${APP_NAME}-config-container input[type="url"],
#${APP_NAME}-config-container textarea,
#${APP_NAME}-config-container select,
#${APP_NAME}-config-container .config-select,
#${APP_NAME}-config-container .config-text-input,
#${APP_NAME}-config-container .config-font-selector-control,
#${APP_NAME}-config-container .config-color-input {
    min-height: var(--settings-control-height);
    border: 1px solid var(--settings-border) !important;
    border-radius: var(--settings-field-radius) !important;
    background: var(--settings-glass-soft) !important;
    color: var(--text-primary) !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input[type="password"]:hover,
#${APP_NAME}-config-container input[type="number"]:hover,
#${APP_NAME}-config-container input[type="url"]:hover,
#${APP_NAME}-config-container textarea:hover,
#${APP_NAME}-config-container select:hover {
    border-color: var(--settings-border-strong) !important;
    background: var(--settings-glass-hover) !important;
}

#${APP_NAME}-config-container .config-color-picker,
#${APP_NAME}-config-container .color-preset-summary,
#${APP_NAME}-config-container .color-preset-grid,
#${APP_NAME}-config-container .color-preset-swatch,
#${APP_NAME}-config-container .color-preset-grid-item {
    border-radius: var(--settings-field-radius) !important;
}

#${APP_NAME}-config-container #patch-notes-container {
    border: 1px solid var(--settings-section-outline) !important;
    border-radius: var(--settings-section-radius) !important;
    background: var(--settings-section-surface) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container .slider-value {
    border: 1px solid var(--settings-border);
    border-radius: var(--settings-control-radius) !important;
    background: var(--settings-glass-soft);
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-runnable-track,
#${APP_NAME}-config-container .config-slider::-moz-range-track,
#${APP_NAME}-config-container .config-slider::-moz-range-progress {
    border-radius: var(--settings-control-radius);
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-thumb,
#${APP_NAME}-config-container .config-slider::-moz-range-thumb {
    border-radius: 50% !important;
}

#${APP_NAME}-config-container .setting-row-content > [style*="grid-template-columns"],
#${APP_NAME}-config-container .setting-row-content [style*="grid-template-columns"][style*="border"] {
    border-radius: 12px !important;
}

/* Keyboard focus remains visible on every interactive control. */
#${APP_NAME}-config-container button:not([disabled]):focus-visible,
#${APP_NAME}-config-container input[type]:not([disabled]):focus-visible,
#${APP_NAME}-config-container select:not([disabled]):focus-visible,
#${APP_NAME}-config-container textarea:not([disabled]):focus-visible,
#${APP_NAME}-config-container [tabindex]:not([tabindex="-1"]):focus-visible {
    outline: 2px solid rgba(var(--settings-accent-rgb), 0.82) !important;
    outline-offset: 2px !important;
    border-color: rgba(var(--settings-accent-rgb), 0.56) !important;
    box-shadow: 0 0 0 4px rgba(var(--settings-accent-rgb), 0.12) !important;
}

#${APP_NAME}-config-container .settings-buttons > button:focus-visible,
#${APP_NAME}-config-container .settings-choice-card:focus-visible {
    outline-offset: -2px !important;
    box-shadow: inset 0 0 0 2px rgba(var(--settings-accent-rgb), 0.8) !important;
}

#${APP_NAME}-config-container.motion-reduced *,
#${APP_NAME}-config-container.motion-reduced *::before,
#${APP_NAME}-config-container.motion-reduced *::after {
    scroll-behavior: auto !important;
}

@media (max-width: 1100px) {
    #${APP_NAME}-config-container {
        grid-template-columns: 1fr;
    }

    #${APP_NAME}-config-container .settings-sidebar {
        background: rgba(var(--spice-rgb-text, 255, 255, 255), 0.012);
        border-right: 0;
        border-bottom: 1px solid var(--settings-divider);
    }

    #${APP_NAME}-config-container .settings-main-panel {
        border-radius: 0 !important;
    }

    #${APP_NAME}-config-container .setting-row-content {
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        gap: 12px;
    }

    #${APP_NAME}-config-container .setting-row-right {
        width: 100%;
        max-width: none;
        justify-content: flex-start;
    }
}

@media (max-width: 800px) {
    .ivlyrics-settings-modal-shell {
        border-radius: 20px !important;
    }

    #${APP_NAME}-config-container {
        border-radius: 20px;
    }

    #${APP_NAME}-config-container .settings-buttons {
        width: 100%;
    }

    #${APP_NAME}-config-container .setting-row-content {
        padding: 13px 14px;
    }

    #${APP_NAME}-config-container .settings-content {
        padding: 22px 20px 36px;
    }
}

@media (max-width: 650px) {
    .ivlyrics-settings-modal-shell {
        border-radius: 0 !important;
        border-left: 0 !important;
        border-right: 0 !important;
    }

    #${APP_NAME}-config-container {
        border-radius: 0;
    }

    #${APP_NAME}-config-container .settings-theme-btn span,
    #${APP_NAME}-config-container .settings-github-btn span,
    #${APP_NAME}-config-container .settings-discord-btn span,
    #${APP_NAME}-config-container .settings-coffee-btn span {
        display: none;
    }

    #${APP_NAME}-config-container .settings-theme-btn,
    #${APP_NAME}-config-container .settings-github-btn,
    #${APP_NAME}-config-container .settings-discord-btn,
    #${APP_NAME}-config-container .settings-coffee-btn,
    #${APP_NAME}-config-container .settings-close-btn {
        width: 36px;
        min-width: 36px;
        padding: 0;
        border-radius: 0 !important;
    }

    #${APP_NAME}-config-container .settings-close-btn {
        border-radius: 0 var(--settings-control-radius) var(--settings-control-radius) 0 !important;
    }

    #${APP_NAME}-config-container .section-title,
    #${APP_NAME}-config-container .option-list-wrapper,
    #${APP_NAME}-config-container .service-list-wrapper,
    #${APP_NAME}-config-container .setting-row,
    #${APP_NAME}-config-container .settings-card-grid {
        --settings-card-radius: 13px;
    }
}

/* ========================================
   Unified Settings Controls
   Compact, explicit controls shared across every settings section.
   ======================================== */
#${APP_NAME}-config-container {
    grid-template-rows: auto minmax(0, 1fr);
}

#${APP_NAME}-config-container .settings-sidebar {
    grid-column: 1;
    grid-row: 2;
}

#${APP_NAME}-config-container .settings-main-panel {
    grid-column: 2;
    grid-row: 2;
}

/* Category changes should not re-composite translucent children. */
#${APP_NAME}-config-container .tab-content.active {
    animation: none !important;
}

#${APP_NAME}-config-container .setting-row,
#${APP_NAME}-config-container .search-result-item,
#${APP_NAME}-config-container .option-list-wrapper > .setting-row,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    transition: background-color 120ms ease !important;
}

/* Search belongs to the navigation tree instead of floating over the content. */
#${APP_NAME}-config-container .settings-search-container {
    position: relative;
    z-index: 2;
    display: block;
    grid-column: auto;
    grid-row: auto;
    width: 100%;
    padding: 0 4px 12px 0;
    background: transparent;
}

#${APP_NAME}-config-container .settings-search-wrapper {
    width: 100%;
    border-radius: 9px !important;
}

#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input {
    width: 100% !important;
    height: 34px !important;
    min-height: 34px !important;
    padding: 0 32px 0 32px !important;
    border-radius: 9px !important;
    background: var(--settings-glass-soft) !important;
    font-size: 12.5px !important;
    font-weight: 550 !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    appearance: none;
    -webkit-appearance: none;
}

#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input::-webkit-search-cancel-button {
    display: none;
}

#${APP_NAME}-config-container .settings-search-icon {
    left: 10px;
    width: 14px;
    height: 14px;
}

#${APP_NAME}-config-container .settings-search-clear {
    right: 6px;
    width: 22px;
    height: 22px;
    border: 0;
    background: transparent;
}

#${APP_NAME}-config-container .settings-search-clear::before {
    font-size: 16px;
}

/* Long text fields share one restrained surface. */
#${APP_NAME}-config-container input.config-text-input,
#${APP_NAME}-config-container input.config-font-selector-control,
#${APP_NAME}-config-container select.config-font-selector-control {
    width: 100% !important;
    max-width: none !important;
    height: var(--settings-control-height) !important;
    min-height: var(--settings-control-height) !important;
    padding: 0 12px !important;
    border: 1px solid var(--settings-border) !important;
    border-radius: var(--settings-field-radius) !important;
    background-color: var(--settings-glass-soft) !important;
    color: var(--text-primary) !important;
    font-size: 13px !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container input.config-text-input:focus,
#${APP_NAME}-config-container input.config-font-selector-control:focus,
#${APP_NAME}-config-container select.config-font-selector-control:focus {
    border-color: rgba(var(--settings-accent-rgb), 0.58) !important;
    background-color: var(--settings-glass-hover) !important;
    box-shadow: 0 0 0 3px rgba(var(--settings-accent-rgb), 0.11) !important;
}

/* Range slider: filled pill track, circular thumb and compact value. */
#${APP_NAME}-config-container .slider-container {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: min(390px, 100%);
    min-width: 220px;
    max-width: 390px;
}

#${APP_NAME}-config-container input.config-slider {
    width: 100% !important;
    min-width: 0 !important;
    height: 28px !important;
    min-height: 28px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    outline: none !important;
    appearance: none !important;
    -webkit-appearance: none !important;
}

#${APP_NAME}-config-container input.config-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 6px;
    border: 0;
    border-radius: 999px !important;
    background: linear-gradient(
        90deg,
        rgb(var(--settings-accent-rgb)) 0,
        rgb(var(--settings-accent-rgb)) var(--progress-percent),
        var(--settings-border) var(--progress-percent),
        var(--settings-border) 100%
    );
    box-shadow: inset 0 0 0 1px rgba(var(--spice-rgb-text, 255, 255, 255), 0.035);
}

#${APP_NAME}-config-container input.config-slider::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
    margin-top: -5px;
    border: 3px solid var(--text-primary) !important;
    border-radius: 50% !important;
    background: rgb(var(--settings-accent-rgb)) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28) !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    transition: transform 120ms ease, box-shadow 120ms ease !important;
}

#${APP_NAME}-config-container input.config-slider:hover::-webkit-slider-thumb,
#${APP_NAME}-config-container input.config-slider:focus-visible::-webkit-slider-thumb {
    transform: scale(1.08) !important;
    box-shadow: 0 0 0 4px rgba(var(--settings-accent-rgb), 0.13), 0 2px 8px rgba(0, 0, 0, 0.28) !important;
}

#${APP_NAME}-config-container input.config-slider::-moz-range-track {
    height: 6px;
    border: 0;
    border-radius: 999px !important;
    background: var(--settings-border);
}

#${APP_NAME}-config-container input.config-slider::-moz-range-progress {
    height: 6px;
    border-radius: 999px !important;
    background: rgb(var(--settings-accent-rgb));
}

#${APP_NAME}-config-container input.config-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 3px solid var(--text-primary) !important;
    border-radius: 50% !important;
    background: rgb(var(--settings-accent-rgb)) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28) !important;
}

#${APP_NAME}-config-container .slider-value {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 52px;
    height: 30px;
    padding: 0 9px;
    border: 1px solid var(--settings-border) !important;
    border-radius: 999px !important;
    background: var(--settings-glass-soft) !important;
    color: var(--text-primary);
    font-size: 11.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
}

#${APP_NAME}-config-container .slider-container.disabled {
    opacity: 0.45;
}

/* Color swatch and HEX value are one compact control. */
#${APP_NAME}-config-container .color-picker-container {
    display: block;
    width: min(180px, 100%);
    max-width: 100%;
}

#${APP_NAME}-config-container .config-color-control {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    height: var(--settings-control-height);
    overflow: hidden;
    border: 1px solid var(--settings-border);
    border-radius: var(--settings-field-radius);
    background: var(--settings-glass-soft);
    box-shadow: none;
    transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
}

#${APP_NAME}-config-container .config-color-control:hover {
    border-color: var(--settings-border-strong);
    background: var(--settings-glass-hover);
}

#${APP_NAME}-config-container .config-color-control:focus-within {
    border-color: rgba(var(--settings-accent-rgb), 0.58);
    box-shadow: 0 0 0 3px rgba(var(--settings-accent-rgb), 0.11);
}

#${APP_NAME}-config-container .config-color-control.invalid:not(:focus-within) {
    border-color: rgba(248, 113, 113, 0.58);
}

#${APP_NAME}-config-container input.config-color-picker {
    width: 30px !important;
    min-width: 30px !important;
    height: 30px !important;
    min-height: 30px !important;
    margin: 0 0 0 2px !important;
    padding: 4px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: transparent !important;
    box-shadow: none !important;
    cursor: pointer;
    appearance: none !important;
    -webkit-appearance: none !important;
    transform: none !important;
}

#${APP_NAME}-config-container input.config-color-picker::-webkit-color-swatch-wrapper {
    padding: 0;
}

#${APP_NAME}-config-container input.config-color-picker::-webkit-color-swatch {
    border: 1px solid rgba(var(--spice-rgb-text, 255, 255, 255), 0.2);
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

#${APP_NAME}-config-container input.config-color-picker::-moz-color-swatch {
    border: 1px solid rgba(var(--spice-rgb-text, 255, 255, 255), 0.2);
    border-radius: 6px;
}

#${APP_NAME}-config-container .config-color-control input.config-color-input {
    width: 100% !important;
    min-width: 0 !important;
    height: 34px !important;
    min-height: 34px !important;
    margin: 0 !important;
    padding: 0 9px !important;
    border: 0 !important;
    border-left: 1px solid var(--settings-divider) !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: var(--text-primary) !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
    font-size: 11.5px !important;
    font-weight: 650 !important;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    box-shadow: none !important;
    outline: none !important;
}

#${APP_NAME}-config-container .config-color-control input.config-color-input:focus-visible,
#${APP_NAME}-config-container input.config-color-picker:focus-visible {
    outline: none !important;
    box-shadow: none !important;
}

/* Multi-vocal colors use aligned columns and only lightweight separators. */
#${APP_NAME}-config-container .multi-vocal-color-setting-row .multi-vocal-color-content {
    display: flex !important;
    flex-direction: column;
    align-items: stretch;
    min-height: 0;
    padding: 17px var(--settings-row-padding-x) 18px;
    gap: 16px;
}

#${APP_NAME}-config-container .multi-vocal-color-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

#${APP_NAME}-config-container .multi-vocal-color-copy {
    min-width: 0;
}

#${APP_NAME}-config-container .multi-vocal-color-groups {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    padding-top: 14px;
    border-top: 1px solid var(--settings-row-divider);
}

#${APP_NAME}-config-container .multi-vocal-color-group {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 0 15px;
}

#${APP_NAME}-config-container .multi-vocal-color-group:first-child {
    padding-left: 0;
}

#${APP_NAME}-config-container .multi-vocal-color-group:last-child {
    padding-right: 0;
}

#${APP_NAME}-config-container .multi-vocal-color-group + .multi-vocal-color-group {
    border-left: 1px solid var(--settings-row-divider);
}

#${APP_NAME}-config-container .multi-vocal-color-group-title {
    margin: 0 0 6px;
    color: var(--text-tertiary);
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

#${APP_NAME}-config-container .multi-vocal-color-row {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 39px;
}

#${APP_NAME}-config-container .multi-vocal-color-row + .multi-vocal-color-row {
    border-top: 1px solid var(--settings-row-divider);
}

#${APP_NAME}-config-container .multi-vocal-color-speaker {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 750;
    white-space: nowrap;
}

#${APP_NAME}-config-container .multi-vocal-color-row .config-color-control {
    height: 32px;
}

#${APP_NAME}-config-container .multi-vocal-color-row input.config-color-picker {
    height: 28px !important;
    min-height: 28px !important;
}

#${APP_NAME}-config-container .multi-vocal-color-row .config-color-input {
    height: 30px !important;
    min-height: 30px !important;
}

/* Font source is an explicit choice instead of an unlabeled edit toggle. */
#${APP_NAME}-config-container .config-font-selector {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 7px;
    width: min(380px, 100%);
    max-width: 380px;
}

#${APP_NAME}-config-container .config-font-mode {
    display: inline-flex;
    align-self: flex-start;
    gap: 2px;
    padding: 2px;
    overflow: hidden;
    border: 1px solid var(--settings-border);
    border-radius: 999px !important;
    background: var(--settings-glass-soft);
}

#${APP_NAME}-config-container .config-font-mode-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    min-height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px !important;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 11.5px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition: color 120ms ease, background-color 120ms ease;
}

#${APP_NAME}-config-container .config-font-mode-button:hover {
    color: var(--text-primary);
}

#${APP_NAME}-config-container .config-font-mode-button.active {
    background: var(--settings-glass-active);
    color: rgb(var(--settings-accent-rgb));
}

#${APP_NAME}-config-container .config-font-field {
    position: relative;
    width: 100%;
}

#${APP_NAME}-config-container .config-font-field:has(select)::after {
    content: "⌄";
    position: absolute;
    top: 50%;
    right: 11px;
    color: var(--text-tertiary);
    font-size: 14px;
    line-height: 1;
    transform: translateY(-58%);
    pointer-events: none;
}

#${APP_NAME}-config-container select.config-font-selector-control {
    padding-right: 32px !important;
    background-image: none !important;
    appearance: none !important;
    -webkit-appearance: none !important;
}

/* Hotkeys are recorded as keycaps, never presented as editable text. */
#${APP_NAME}-config-container .config-hotkey-control {
    display: flex;
    align-items: center;
    gap: 7px;
    width: min(360px, 100%);
}

#${APP_NAME}-config-container .config-hotkey-recorder {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-width: 210px;
    height: var(--settings-control-height);
    padding: 4px 8px 4px 6px;
    border: 1px solid var(--settings-border);
    border-radius: var(--settings-field-radius);
    background: var(--settings-glass-soft);
    color: var(--text-primary);
    cursor: pointer;
    box-shadow: none;
    transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
}

#${APP_NAME}-config-container .config-hotkey-recorder:hover {
    border-color: var(--settings-border-strong);
    background: var(--settings-glass-hover);
}

#${APP_NAME}-config-container .config-hotkey-recorder.recording {
    border-color: rgba(var(--settings-accent-rgb), 0.58);
    background: var(--settings-glass-active);
    box-shadow: 0 0 0 3px rgba(var(--settings-accent-rgb), 0.11);
}

#${APP_NAME}-config-container .config-hotkey-keycaps {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

#${APP_NAME}-config-container .config-hotkey-keycap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 7px;
    border: 1px solid var(--settings-border-strong);
    border-bottom-width: 2px;
    border-radius: 6px;
    background: var(--settings-glass-strong);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 11px;
    font-weight: 750;
    line-height: 1;
    white-space: nowrap;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
}

#${APP_NAME}-config-container .config-hotkey-edit-label,
#${APP_NAME}-config-container .config-hotkey-empty {
    color: var(--text-tertiary);
    font-size: 10.5px;
    font-weight: 650;
    white-space: nowrap;
}

#${APP_NAME}-config-container .config-hotkey-recording-state {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-primary);
    font-size: 11.5px;
    font-weight: 700;
}

#${APP_NAME}-config-container .config-hotkey-recording-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgb(var(--settings-accent-rgb));
    box-shadow: 0 0 0 4px rgba(var(--settings-accent-rgb), 0.12);
    animation: hotkeyRecordingPulse 900ms ease-in-out infinite alternate;
}

#${APP_NAME}-config-container .config-hotkey-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--settings-border);
    border-radius: 50%;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 16px;
    cursor: pointer;
}

#${APP_NAME}-config-container .config-hotkey-clear:hover {
    border-color: var(--settings-border-strong);
    background: var(--settings-glass-hover);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-visually-hidden {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
}

/* Header baseline, nine-step weight controls and cache status share the same compact rhythm. */
#${APP_NAME}-config-container .settings-title-section {
    align-items: center;
    gap: 10px;
}

#${APP_NAME}-config-container .settings-title-section h1 {
    line-height: 1;
}

#${APP_NAME}-config-container .settings-version {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    box-sizing: border-box;
    height: 22px;
    padding: 0 8px;
    line-height: 1;
    position: relative;
    top: 1px;
}

#${APP_NAME}-config-container .font-weight-slider .slider-step-markers {
    grid-column: 1;
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    align-items: center;
    margin: -8px 7px 0;
    pointer-events: none;
}

#${APP_NAME}-config-container .font-weight-slider .slider-step-marker {
    justify-self: center;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--settings-border-strong);
    transition: width 120ms ease, height 120ms ease, background-color 120ms ease;
}

#${APP_NAME}-config-container .font-weight-slider .slider-step-marker.active {
    width: 6px;
    height: 6px;
    background: rgb(var(--settings-accent-rgb));
    box-shadow: 0 0 0 3px rgba(var(--settings-accent-rgb), 0.1);
}

#${APP_NAME}-config-container .cache-action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

#${APP_NAME}-config-container .cache-management-list .setting-row-content {
    grid-template-columns: minmax(0, 1fr) auto;
}

#${APP_NAME}-config-container .cache-management-list .setting-row-right {
    width: auto;
    max-width: none;
}

#${APP_NAME}-config-container .opendb-cache-row .setting-row-content {
    align-items: center;
}

#${APP_NAME}-config-container .opendb-cache-status {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    margin-top: 8px;
}

#${APP_NAME}-config-container .opendb-cache-status-primary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

#${APP_NAME}-config-container .opendb-cache-chip {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border: 1px solid var(--settings-border);
    border-radius: 999px !important;
    background: var(--settings-glass-soft);
    color: var(--text-tertiary);
    font-size: 10.5px;
    font-weight: 650;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

#${APP_NAME}-config-container .opendb-cache-chip.current {
    border-color: rgba(var(--settings-accent-rgb), 0.26);
    background: rgba(var(--settings-accent-rgb), 0.11);
    color: rgb(var(--settings-accent-rgb));
}

#${APP_NAME}-config-container .opendb-cache-chip.warning {
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.11);
    color: #fbbf24;
}

#${APP_NAME}-config-container .opendb-cache-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    color: var(--text-tertiary);
    font-size: 10.5px;
    font-weight: 550;
    line-height: 1.45;
    font-variant-numeric: tabular-nums;
}

#${APP_NAME}-config-container .opendb-cache-meta > span + span::before {
    content: "·";
    margin: 0 7px;
    color: var(--settings-border-strong);
}

#${APP_NAME}-config-container .opendb-cache-error {
    margin-top: 7px;
    color: #fca5a5;
}

#${APP_NAME}-config-container .opendb-cache-refresh-btn {
    min-width: 168px;
}

/* The preview mirrors the real lyric line metrics and stays visible while typography is tuned. */
#${APP_NAME}-config-container .settings-live-preview-spacer {
    height: 30px;
    pointer-events: none;
}

#${APP_NAME}-config-container .settings-live-preview-sticky {
    position: sticky;
    top: calc(-1 * var(--settings-content-top-padding, 46px));
    z-index: 18;
    margin: 0 -12px;
    padding: 10px 12px 12px;
    border-bottom: 0.5px solid var(--settings-border);
    background: var(--settings-page);
    isolation: isolate;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .settings-live-preview-sticky {
    background: var(--settings-page);
}

#${APP_NAME}-config-container .settings-live-preview-sticky > .section-title {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-height: 52px;
    margin: 0 !important;
    padding: 11px 14px 9px !important;
    border: 0.5px solid var(--settings-section-outline) !important;
    border-bottom: 0 !important;
    border-radius: 9px 9px 0 0 !important;
    background: var(--settings-surface-1) !important;
}

#${APP_NAME}-config-container .settings-live-preview-sticky > .section-title::before {
    content: "";
    position: static;
    display: block !important;
    flex: 0 0 7px;
    width: 7px;
    height: 7px;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--accent-primary);
}

#${APP_NAME}-config-container .settings-live-preview-sticky > .section-title .section-title-content {
    min-width: 0;
    flex: 1 1 auto;
}

#${APP_NAME}-config-container .settings-live-preview-sticky .font-preview-container {
    margin: 0;
    overflow: hidden;
    border: 0.5px solid var(--settings-section-outline) !important;
    border-top: 0.5px solid var(--settings-divider) !important;
    border-radius: 0 0 9px 9px !important;
    background: var(--settings-muted-surface) !important;
}

#${APP_NAME}-config-container .settings-live-preview-sticky .font-preview {
    --lyrics-color-active: #f5f7fa;
    --lyrics-color-inactive: rgba(245, 247, 250, 0.44);
    min-height: 142px;
    padding: 22px 20px 18px !important;
    border-radius: 0 0 8px 8px !important;
    background: #101214 !important;
    color: #f5f7fa;
    overflow: visible;
}

#${APP_NAME}-config-container .settings-live-preview-lyrics.lyrics-lyricsContainer-LyricsContainer {
    position: relative;
    top: auto;
    display: block;
    width: auto;
    height: auto;
    contain: none;
    overflow: visible;
}

#${APP_NAME}-config-container .settings-live-preview-stage {
    position: relative;
    display: block;
    overflow: visible;
    text-align: var(--lyrics-align-text, center);
}

#${APP_NAME}-config-container .settings-live-preview-line.lyrics-lyricsContainer-SyncedLyrics {
    display: block;
    grid-area: auto;
    height: auto;
    min-width: 0;
    color: var(--text-primary);
    text-align: inherit;
}

#${APP_NAME}-config-container .settings-live-preview-line > .lyrics-lyricsContainer-LyricsLine {
    margin: 0 !important;
    color: var(--lyrics-color-active, var(--spice-text));
    opacity: 1;
    transform: none !important;
    transition: none !important;
    will-change: auto;
    pointer-events: none;
    text-align: inherit;
}

#${APP_NAME}-config-container .settings-live-preview-line > .lyrics-lyricsContainer-LyricsLine > p {
    margin: 0;
}

#${APP_NAME}-config-container .settings-live-preview-line .lyrics-lyricsContainer-LyricsLine > p,
#${APP_NAME}-config-container .settings-live-preview-line .lyrics-lyricsContainer-LyricsLine-phonetic,
#${APP_NAME}-config-container .settings-live-preview-line .lyrics-lyricsContainer-LyricsLine-translation,
#${APP_NAME}-config-container .settings-live-preview-line .lyrics-karaoke-line {
    transition: none !important;
}

#${APP_NAME}-config-container .settings-live-preview-lyrics[data-furigana-enabled="false"] .lyrics-karaoke-ruby rt {
    display: none;
}

#${APP_NAME}-config-container .settings-live-preview-lyrics[data-furigana-enabled="false"] .lyrics-karaoke-ruby {
    display: inline;
    padding-inline: 0;
    margin-inline: 0;
}

@media (max-width: 800px) {
    #${APP_NAME}-config-container .settings-live-preview-spacer {
        height: 24px;
    }

    #${APP_NAME}-config-container .settings-live-preview-sticky {
        margin-inline: -8px;
        padding: 8px 8px 10px;
    }

    #${APP_NAME}-config-container .opendb-cache-refresh-btn {
        width: 100%;
    }
}

@keyframes hotkeyRecordingPulse {
    from { opacity: 0.45; transform: scale(0.86); }
    to { opacity: 1; transform: scale(1); }
}

#${APP_NAME}-config-container.motion-reduced .config-hotkey-recording-dot {
    animation: none;
}

/* Provider pages share the same single-surface row hierarchy as other settings. */
#${APP_NAME}-config-container .lyrics-providers-section {
    margin-top: 20px;
}

#${APP_NAME}-config-container .lyrics-providers-container {
    padding: 0;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .lyrics-providers-container > .option-list-wrapper {
    margin-bottom: 16px;
}

#${APP_NAME}-config-container .ai-translation-style-panel {
    overflow: hidden;
    margin: 0 0 16px;
    border: 1px solid var(--settings-section-outline);
    border-radius: var(--settings-section-radius);
    background: var(--settings-section-surface);
}

#${APP_NAME}-config-container .ai-translation-style-header {
    padding: 15px 16px 13px;
    border-bottom: 1px solid var(--settings-row-divider);
}

#${APP_NAME}-config-container .ai-translation-style-title {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
}

#${APP_NAME}-config-container .ai-translation-style-description {
    margin: 5px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
}

#${APP_NAME}-config-container .ai-translation-style-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

#${APP_NAME}-config-container .ai-translation-style-option {
    min-width: 0;
    padding: 13px 14px 14px;
    border: 0;
    border-right: 1px solid var(--settings-row-divider);
    border-radius: 0;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
}

#${APP_NAME}-config-container .ai-translation-style-option:last-child {
    border-right: 0;
}

#${APP_NAME}-config-container .ai-translation-style-option:hover {
    background: var(--settings-section-surface-hover);
}

#${APP_NAME}-config-container .ai-translation-style-option:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
}

#${APP_NAME}-config-container .ai-translation-style-option.active {
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
}

#${APP_NAME}-config-container .ai-translation-style-option-heading {
    display: flex;
    align-items: center;
    gap: 8px;
}

#${APP_NAME}-config-container .ai-translation-style-indicator {
    box-sizing: border-box;
    width: 13px;
    height: 13px;
    flex: 0 0 13px;
    border: 1.5px solid var(--text-tertiary);
    border-radius: 50%;
}

#${APP_NAME}-config-container .ai-translation-style-option.active .ai-translation-style-indicator {
    border: 4px solid var(--accent-primary);
}

#${APP_NAME}-config-container .ai-translation-style-option-label {
    font-size: 13px;
    font-weight: 650;
    line-height: 1.35;
}

#${APP_NAME}-config-container .ai-translation-style-option-description {
    display: block;
    margin: 7px 0 0 21px;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.45;
}

#${APP_NAME}-config-container .lyrics-providers-list {
    gap: 0;
    overflow: hidden;
    margin: 0;
    border: 1px solid var(--settings-section-outline);
    border-radius: var(--settings-section-radius) !important;
    background: var(--settings-section-surface);
}

#${APP_NAME}-config-container .lyrics-provider-item {
    position: relative;
    align-items: stretch;
    gap: 0;
    margin: 0;
    padding: 0;
    border: 0 !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .lyrics-provider-item + .lyrics-provider-item::before {
    content: "";
    position: absolute;
    z-index: 2;
    top: 0;
    left: 14px;
    right: 14px;
    height: 1px;
    background: var(--settings-row-divider);
    pointer-events: none;
}

#${APP_NAME}-config-container .provider-drag-handle {
    align-self: stretch;
    flex: 0 0 40px;
    width: 40px;
    min-width: 40px;
    margin: 8px 0;
    padding: 0;
    border: 0 !important;
    border-radius: 8px !important;
    background: transparent;
    color: var(--text-tertiary);
    cursor: grab;
    touch-action: none;
}

#${APP_NAME}-config-container .provider-drag-handle:hover {
    border: 0 !important;
    background: var(--settings-section-surface-hover);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .provider-drag-handle:active {
    cursor: grabbing;
}

#${APP_NAME}-config-container .provider-drag-handle:focus-visible,
#${APP_NAME}-config-container .cultural-details-toggle:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
}

#${APP_NAME}-config-container .lyrics-provider-item.dragging {
    opacity: 0.48;
}

#${APP_NAME}-config-container .lyrics-provider-item.drag-over-before::after,
#${APP_NAME}-config-container .lyrics-provider-item.drag-over-after::after {
    content: "";
    position: absolute;
    z-index: 5;
    left: 8px;
    right: 8px;
    height: 2px;
    border-radius: 2px;
    background: var(--accent-primary);
    pointer-events: none;
}

#${APP_NAME}-config-container .lyrics-provider-item.drag-over-before::after {
    top: 0;
}

#${APP_NAME}-config-container .lyrics-provider-item.drag-over-after::after {
    bottom: 0;
}

#${APP_NAME}-config-container .cultural-details-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    margin: -8px 0 0;
    padding: 10px 14px;
    border: 1px solid var(--settings-section-outline) !important;
    border-radius: 10px !important;
    background: var(--settings-section-surface);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 650;
    text-align: left;
}

#${APP_NAME}-config-container .cultural-details-toggle:hover {
    border-color: var(--settings-section-outline) !important;
    background: var(--settings-section-surface-hover);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .cultural-details-toggle svg {
    transition: transform 160ms ease;
}

#${APP_NAME}-config-container .cultural-details-toggle.expanded svg {
    transform: rotate(180deg);
}

#${APP_NAME}-config-container .cultural-annotation-details {
    min-width: 0;
}

@media (prefers-reduced-motion: reduce) {
    #${APP_NAME}-config-container .cultural-details-toggle svg {
        transition: none;
    }
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons {
    flex: 0 0 40px;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 12px 8px;
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons .order-btn {
    width: 24px;
    min-width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0;
    border: 0 !important;
    border-radius: 7px !important;
    background: transparent;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .lyrics-provider-order-buttons .order-btn:hover:not(:disabled) {
    border: 0 !important;
    background: var(--settings-section-surface-hover);
    color: var(--text-primary);
}

#${APP_NAME}-config-container .lyrics-provider-card,
#${APP_NAME}-config-container .lyrics-provider-card:hover,
#${APP_NAME}-config-container .lyrics-provider-card.expanded {
    overflow: hidden;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-header {
    min-height: 68px;
    padding: 13px 16px 13px 10px;
    border: 0 !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-header:hover {
    background: var(--settings-section-surface-hover) !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-body {
    margin: 0 16px 14px 10px;
    padding: 14px 0 0;
    border-top: 1px solid var(--settings-row-divider);
    background: transparent !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-body .ai-addon-settings {
    display: flex;
    flex-direction: column;
    gap: 0;
}

#${APP_NAME}-config-container .lyrics-provider-card-body .ai-addon-setting {
    margin: 0;
    padding: 12px 0;
    border-bottom: 1px solid var(--settings-row-divider);
    background: transparent !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-body .ai-addon-setting:first-child {
    padding-top: 0;
}

#${APP_NAME}-config-container .lyrics-provider-card-body .ai-addon-setting:last-child {
    padding-bottom: 0;
    border-bottom: 0;
}

@media (max-width: 1100px) {
    #${APP_NAME}-config-container {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto minmax(0, 1fr);
    }

    #${APP_NAME}-config-container .settings-header {
        grid-column: 1;
        grid-row: 1;
    }

    #${APP_NAME}-config-container .settings-sidebar {
        grid-column: 1;
        grid-row: 2;
    }

    #${APP_NAME}-config-container .settings-main-panel {
        grid-column: 1;
        grid-row: 3;
    }

    #${APP_NAME}-config-container .settings-search-container {
        padding: 0 4px 10px 0;
    }

    #${APP_NAME}-config-container .cache-management-list .setting-row-content {
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
    }

    #${APP_NAME}-config-container .cache-management-list .setting-row-right {
        width: 100%;
        justify-content: flex-start;
    }
}

@media (max-width: 800px) {
    #${APP_NAME}-config-container .ai-translation-style-options {
        grid-template-columns: 1fr;
    }

    #${APP_NAME}-config-container .ai-translation-style-option {
        border-right: 0;
        border-bottom: 1px solid var(--settings-row-divider);
    }

    #${APP_NAME}-config-container .ai-translation-style-option:last-child {
        border-bottom: 0;
    }

    #${APP_NAME}-config-container .multi-vocal-color-groups {
        grid-template-columns: 1fr;
    }

    #${APP_NAME}-config-container .multi-vocal-color-group,
    #${APP_NAME}-config-container .multi-vocal-color-group:first-child,
    #${APP_NAME}-config-container .multi-vocal-color-group:last-child {
        padding: 12px 0;
    }

    #${APP_NAME}-config-container .multi-vocal-color-group:first-child {
        padding-top: 0;
    }

    #${APP_NAME}-config-container .multi-vocal-color-group + .multi-vocal-color-group {
        border-top: 1px solid var(--settings-row-divider);
        border-left: 0;
    }

    #${APP_NAME}-config-container .config-hotkey-control,
    #${APP_NAME}-config-container .config-font-selector,
    #${APP_NAME}-config-container .slider-container {
        width: 100%;
        max-width: none;
    }
}

/* ========================================
   Restrained flat settings workspace
   ======================================== */
.ivlyrics-settings-modal-shell:has(#${APP_NAME}-config-container) {
    width: min(calc(100vw - 32px), 1480px) !important;
    max-width: calc(100vw - 32px) !important;
    max-height: calc(100vh - 32px) !important;
    border: 0.5px solid #2a2b2d !important;
    border-radius: 22px !important;
    background: #090a0b !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container {
    --settings-page: #0a0b0c;
    --settings-sidebar-surface: #0d0e0f;
    --settings-surface-1: #111315;
    --settings-surface-2: #16181a;
    --settings-muted-surface: #0e1011;
    --settings-border: #27292c;
    --settings-border-strong: #34373a;
    --settings-divider: #232528;
    --settings-section-outline: #24272a;
    --settings-row-divider: #222427;
    --settings-section-surface: var(--settings-surface-1);
    --settings-section-surface-hover: var(--settings-surface-2);
    --settings-accent-rgb: 95, 216, 143;
    --accent-primary: #5fd88f;
    --accent-primary-light: rgba(95, 216, 143, 0.12);
    --settings-glass-active: rgba(95, 216, 143, 0.12);
    --settings-glass-hover: var(--settings-surface-2);
    --settings-glass-soft: var(--settings-surface-1);
    --settings-glass: var(--settings-surface-1);
    --settings-glass-strong: var(--settings-surface-2);
    --text-primary: #eeeeee;
    --text-secondary: #92969b;
    --text-tertiary: #5f6469;
    --settings-section-radius: 9px;
    --settings-field-radius: 7px;
    --settings-row-min-height: 58px;
    --settings-row-padding-x: 14px;
    --settings-control-height: 34px;
    --karaoke-curve-surface: #0d0f10;
    --karaoke-curve-grid: rgba(238, 238, 238, 0.12);
    --karaoke-curve-reference: rgba(238, 238, 238, 0.38);
    --karaoke-curve-point-ring: rgba(238, 238, 238, 0.92);
    --karaoke-curve-label-outline: rgba(10, 11, 12, 0.9);
    --karaoke-curve-shadow: rgba(95, 216, 143, 0.3);
    width: 100%;
    height: min(92vh, 1080px);
    min-height: min(620px, calc(100vh - 32px));
    grid-template-columns: 292px minmax(0, 1fr) !important;
    grid-template-rows: 80px minmax(0, 1fr) !important;
    border: 0 !important;
    border-radius: 22px !important;
    background: var(--settings-page) !important;
    color: var(--text-primary);
    box-shadow: none !important;
    font-family: "Pretendard Variable", Pretendard, "Segoe UI Variable Text", "Segoe UI", sans-serif;
}

#${APP_NAME}-config-container[data-ui-theme="light"] {
    --settings-page: #f5f6f7;
    --settings-sidebar-surface: #eff1f3;
    --settings-surface-1: #ffffff;
    --settings-surface-2: #f5f7f8;
    --settings-muted-surface: #eef0f2;
    --settings-border: #dfe2e5;
    --settings-border-strong: #cfd3d7;
    --settings-divider: #e0e3e6;
    --settings-section-outline: #dfe2e5;
    --settings-row-divider: #e5e7e9;
    --settings-accent-rgb: 47, 143, 91;
    --accent-primary: #2f8f5b;
    --accent-primary-light: rgba(47, 143, 91, 0.11);
    --text-primary: #17191b;
    --text-secondary: #63686d;
    --text-tertiary: #94999e;
    --karaoke-curve-surface: #f8faf9;
    --karaoke-curve-grid: rgba(23, 25, 27, 0.16);
    --karaoke-curve-reference: rgba(23, 25, 27, 0.46);
    --karaoke-curve-point-ring: #ffffff;
    --karaoke-curve-label-outline: rgba(255, 255, 255, 0.94);
    --karaoke-curve-shadow: rgba(47, 143, 91, 0.28);
    background: var(--settings-page) !important;
}

.ivlyrics-settings-modal-shell:has(#${APP_NAME}-config-container[data-ui-theme="light"]) {
    border-color: #d8dadd !important;
    background: #f5f6f7 !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-header {
    grid-column: 1 / -1 !important;
    grid-row: 1 !important;
    min-width: 0;
    padding: 0 26px 0 30px !important;
    border-bottom: 0.5px solid var(--settings-border) !important;
    background: var(--settings-page) !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-header-content {
    height: 100%;
    gap: 20px;
}

#${APP_NAME}-config-container .settings-title-section {
    gap: 14px;
}

#${APP_NAME}-config-container .settings-title-section h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: 25px !important;
    font-weight: 500 !important;
    letter-spacing: -0.035em;
}

#${APP_NAME}-config-container .settings-version {
    height: 26px;
    min-width: 0;
    padding: 0 10px;
    border: 0.5px solid var(--settings-border-strong) !important;
    border-radius: 999px !important;
    background: transparent !important;
    color: var(--text-secondary);
    font-size: 10.5px;
    font-weight: 400;
}

#${APP_NAME}-config-container .settings-buttons {
    gap: 6px !important;
    padding: 0 !important;
    overflow: visible;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container .settings-theme-control {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    height: 36px;
    padding: 2px;
    border: 0.5px solid var(--settings-border) !important;
    border-radius: 8px !important;
    background: var(--settings-surface-1) !important;
}

#${APP_NAME}-config-container .settings-theme-option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 62px;
    height: 30px;
    padding: 0 9px;
    border: 0 !important;
    border-radius: 6px !important;
    background: transparent !important;
    color: var(--text-tertiary);
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1;
}

#${APP_NAME}-config-container .settings-theme-option:hover {
    background: var(--settings-surface-2) !important;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-theme-option.active {
    background: var(--accent-primary-light) !important;
    color: var(--accent-primary);
}

#${APP_NAME}-config-container .settings-theme-option svg {
    flex: 0 0 auto;
}

#${APP_NAME}-config-container .settings-theme-btn,
#${APP_NAME}-config-container .settings-github-btn,
#${APP_NAME}-config-container .settings-discord-btn,
#${APP_NAME}-config-container .settings-close-btn {
    width: 36px;
    min-width: 36px;
    height: 36px;
    min-height: 36px;
    padding: 0 !important;
    border: 0.5px solid transparent !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .settings-theme-btn span,
#${APP_NAME}-config-container .settings-github-btn span,
#${APP_NAME}-config-container .settings-discord-btn span {
    display: none !important;
}

#${APP_NAME}-config-container .settings-coffee-btn {
    min-width: 88px;
    height: 36px;
    min-height: 36px;
    padding: 0 15px !important;
    border: 0.5px solid rgba(95, 216, 143, 0.28) !important;
    border-radius: 8px !important;
    background: #143b29 !important;
    color: #6ce39d !important;
    font-size: 12px;
    font-weight: 500;
}

#${APP_NAME}-config-container .settings-buttons > button + button {
    border-left: 0.5px solid transparent !important;
}

#${APP_NAME}-config-container .settings-theme-btn:hover,
#${APP_NAME}-config-container .settings-github-btn:hover,
#${APP_NAME}-config-container .settings-discord-btn:hover,
#${APP_NAME}-config-container .settings-close-btn:hover {
    border-color: var(--settings-border) !important;
    background: var(--settings-surface-1) !important;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-coffee-btn:hover {
    border-color: rgba(95, 216, 143, 0.42) !important;
    background: #18452f !important;
}

#${APP_NAME}-config-container .settings-sidebar {
    grid-column: 1 !important;
    grid-row: 2 !important;
    padding: 24px 18px 28px 20px !important;
    border-right: 0.5px solid var(--settings-border) !important;
    border-bottom: 0 !important;
    background: var(--settings-sidebar-surface) !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-search-container {
    width: 100%;
    padding: 0 0 20px !important;
}

#${APP_NAME}-config-container .settings-search-wrapper {
    border-radius: 8px !important;
}

#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input {
    height: 42px !important;
    padding-left: 38px !important;
    border: 0.5px solid var(--settings-border) !important;
    border-radius: 8px !important;
    background: var(--settings-surface-1) !important;
    color: var(--text-primary) !important;
    box-shadow: none !important;
    font-size: 12.5px;
    font-weight: 400;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

#${APP_NAME}-config-container .settings-search-input::placeholder {
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .settings-sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 20px !important;
    padding: 0 4px 0 0 !important;
}

#${APP_NAME}-config-container .settings-nav-category {
    min-width: 0;
}

#${APP_NAME}-config-container .settings-nav-category-label {
    margin: 0 10px 7px;
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: 0.035em;
}

#${APP_NAME}-config-container .settings-nav-category-items {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

#${APP_NAME}-config-container .settings-nav-group {
    margin: 0 !important;
}

#${APP_NAME}-config-container .settings-nav-card,
#${APP_NAME}-config-container .settings-nav-group-toggle {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    min-height: 40px !important;
    padding: 0 10px !important;
    gap: 10px;
    border: 0 !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--text-secondary);
    box-shadow: none !important;
    text-align: left;
    text-transform: none;
}

#${APP_NAME}-config-container .settings-nav-card:hover,
#${APP_NAME}-config-container .settings-nav-group-toggle:hover {
    background: var(--settings-surface-1) !important;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-nav-card.active,
#${APP_NAME}-config-container .settings-nav-group-toggle.active {
    background: #143b29 !important;
    color: #6ce39d !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .settings-nav-card.active,
#${APP_NAME}-config-container[data-ui-theme="light"] .settings-nav-group-toggle.active {
    background: #dff3e7 !important;
    color: #16653a !important;
}

#${APP_NAME}-config-container .settings-nav-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: currentColor;
}

#${APP_NAME}-config-container .settings-nav-card-title,
#${APP_NAME}-config-container .settings-nav-group-title {
    min-width: 0;
    flex: 1 1 auto;
    color: inherit;
    font-size: 13px;
    font-weight: 500 !important;
    line-height: 1.2;
}

#${APP_NAME}-config-container .settings-nav-card-badge {
    display: none !important;
}

#${APP_NAME}-config-container .settings-nav-group-indicator {
    width: 16px;
    height: 16px;
    margin-left: auto;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .settings-nav-group-items {
    margin: 3px 0 4px 17px !important;
    padding: 2px 0 2px 10px !important;
    border-left: 0.5px solid var(--settings-border) !important;
}

#${APP_NAME}-config-container .settings-nav-subitem {
    min-height: 32px !important;
    padding: 0 9px !important;
    border: 0 !important;
    border-radius: 6px !important;
    color: var(--text-secondary);
    font-size: 11.5px !important;
    font-weight: 400 !important;
}

#${APP_NAME}-config-container .settings-nav-subitem:hover {
    background: var(--settings-surface-1) !important;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .settings-nav-subitem.active {
    background: transparent !important;
    color: var(--accent-primary) !important;
    font-weight: 500 !important;
}

#${APP_NAME}-config-container .settings-main-panel {
    grid-column: 2 !important;
    grid-row: 2 !important;
    min-width: 0;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: var(--settings-page) !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .settings-content {
    --settings-content-top-padding: 46px;
    width: 100%;
    max-width: 1120px;
    margin: 0;
    padding: 46px 54px 64px !important;
}

#${APP_NAME}-config-container .settings-panel-hero {
    gap: 9px;
    margin: 0 0 28px !important;
    padding: 0 !important;
    border: 0 !important;
}

#${APP_NAME}-config-container .settings-panel-badge {
    align-self: flex-start;
    height: 26px;
    padding: 0 10px;
    border: 0 !important;
    border-radius: 7px !important;
    background: #143b29 !important;
    color: #6ce39d !important;
    font-size: 10.5px;
    font-weight: 500;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .settings-panel-badge {
    background: #dff3e7 !important;
    color: #16653a !important;
}

#${APP_NAME}-config-container .settings-panel-copy h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 28px !important;
    font-weight: 500 !important;
    line-height: 1.15 !important;
    letter-spacing: -0.035em !important;
}

#${APP_NAME}-config-container .settings-panel-copy p {
    max-width: 720px;
    margin: 8px 0 0;
    color: var(--text-secondary);
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.55;
}

#${APP_NAME}-config-container .section-title {
    margin: 26px 2px 8px !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .section-text h3 {
    color: var(--text-primary);
    font-size: 14px !important;
    font-weight: 500 !important;
    line-height: 1.35;
}

#${APP_NAME}-config-container .section-text p,
#${APP_NAME}-config-container .setting-description {
    color: var(--text-secondary);
    font-size: 11.5px !important;
    font-weight: 400;
    line-height: 1.5;
}

#${APP_NAME}-config-container .option-list-wrapper,
#${APP_NAME}-config-container .service-list-wrapper,
#${APP_NAME}-config-container .ai-translation-style-panel {
    margin-bottom: 22px;
    border: 0.5px solid var(--settings-section-outline) !important;
    border-radius: 9px !important;
    background: var(--settings-surface-1) !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .setting-row,
#${APP_NAME}-config-container .search-result-item {
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
}

#${APP_NAME}-config-container .setting-row.config-font-setting-row {
    background: var(--settings-surface-1) !important;
}

#${APP_NAME}-config-container .setting-row.config-font-setting-row:hover {
    background: var(--settings-surface-2) !important;
}

#${APP_NAME}-config-container .setting-row::after {
    display: none !important;
}

#${APP_NAME}-config-container .setting-row-content {
    min-height: 58px !important;
    padding: 11px 14px !important;
    gap: 18px !important;
    grid-template-columns: minmax(220px, 1fr) minmax(220px, 340px) !important;
}

#${APP_NAME}-config-container .setting-name {
    color: var(--text-primary);
    font-size: 13px !important;
    font-weight: 500 !important;
}

#${APP_NAME}-config-container .btn,
#${APP_NAME}-config-container .btn-primary,
#${APP_NAME}-config-container .order-btn,
#${APP_NAME}-config-container .swap-button,
#${APP_NAME}-config-container .ai-addon-btn,
#${APP_NAME}-config-container .about-client-copy-btn,
#${APP_NAME}-config-container .karaoke-fill-curve-reset {
    border: 0.5px solid var(--settings-border) !important;
    border-radius: 7px !important;
    background: transparent !important;
    font-size: 11.5px;
    font-weight: 500;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .switch-checkbox {
    width: 38px !important;
    min-width: 38px;
    height: 22px !important;
    padding: 0 !important;
    border: 0.5px solid var(--settings-border-strong) !important;
    border-radius: 999px !important;
    background: #1a1c1e !important;
    box-sizing: border-box;
}

#${APP_NAME}-config-container .switch-checkbox::after {
    top: 50% !important;
    left: 2.5px !important;
    width: 16px !important;
    height: 16px !important;
    border-radius: 50% !important;
    background: #666b70 !important;
    transform: translateY(-50%) !important;
}

#${APP_NAME}-config-container .switch-checkbox.active {
    border-color: #2f8f5b !important;
    background: #2f8f5b !important;
}

#${APP_NAME}-config-container .switch-checkbox.active::after {
    background: #0a0b0c !important;
    transform: translate(16px, -50%) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .switch-checkbox:not(.active) {
    background: #e1e4e6 !important;
}

#${APP_NAME}-config-container .lyrics-providers-section {
    margin-top: 0 !important;
}

#${APP_NAME}-config-container .lyrics-providers-container,
#${APP_NAME}-config-container .lyrics-providers-container:hover {
    border: 0 !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .lyrics-providers-list {
    display: flex;
    flex-direction: column;
    gap: 8px !important;
    overflow: visible;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .lyrics-provider-item {
    position: relative;
    display: flex;
    align-items: stretch !important;
    gap: 0 !important;
    min-width: 0;
    margin: 0 !important;
    padding: 0 !important;
    border: 0.5px solid var(--settings-section-outline) !important;
    border-radius: 9px !important;
    background: var(--settings-surface-1) !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .lyrics-provider-item + .lyrics-provider-item::before {
    display: none !important;
}

#${APP_NAME}-config-container .provider-order-index {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 28px;
    min-width: 28px;
    padding-left: 8px;
    color: var(--text-tertiary);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
}

#${APP_NAME}-config-container .provider-drag-handle {
    align-self: stretch;
    width: 30px !important;
    min-width: 30px !important;
    flex: 0 0 30px !important;
    margin: 8px 2px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 6px !important;
    background: transparent !important;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .provider-drag-handle:hover {
    background: var(--settings-surface-2) !important;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .lyrics-provider-card,
#${APP_NAME}-config-container .lyrics-provider-card:hover,
#${APP_NAME}-config-container .lyrics-provider-card.expanded {
    min-width: 0;
    border: 0 !important;
    border-radius: 9px !important;
    background: transparent !important;
    box-shadow: none !important;
}

#${APP_NAME}-config-container .lyrics-provider-card.disabled {
    opacity: 0.54 !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-header {
    align-items: center !important;
    min-height: 76px !important;
    padding: 11px 13px 11px 4px !important;
    border: 0 !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-header:hover {
    background: var(--settings-surface-2) !important;
}

#${APP_NAME}-config-container .lyrics-provider-card-header-left {
    gap: 12px !important;
}

#${APP_NAME}-config-container .lyrics-provider-toggle {
    width: 38px !important;
    min-width: 38px !important;
    height: 22px !important;
    flex: 0 0 38px !important;
    align-self: center !important;
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider {
    border: 0.5px solid var(--settings-border-strong) !important;
    border-radius: 999px !important;
    background: #1a1c1e !important;
    box-sizing: border-box;
}

#${APP_NAME}-config-container .lyrics-provider-toggle .toggle-slider::before {
    width: 16px !important;
    height: 16px !important;
    left: 2.5px !important;
    top: 50% !important;
    bottom: auto !important;
    border-radius: 50% !important;
    background: #666b70 !important;
    transform: translateY(-50%) !important;
}

#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider {
    border-color: #2f8f5b !important;
    background: #2f8f5b !important;
}

#${APP_NAME}-config-container .lyrics-provider-toggle input:checked + .toggle-slider::before {
    background: #0a0b0c !important;
    transform: translate(16px, -50%) !important;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .lyrics-provider-toggle input:not(:checked) + .toggle-slider {
    background: #e1e4e6 !important;
}

#${APP_NAME}-config-container .lyrics-provider-title-group {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    column-gap: 7px;
    row-gap: 2px;
}

#${APP_NAME}-config-container .lyrics-provider-name {
    color: var(--text-primary);
    font-size: 13.5px !important;
    font-weight: 500 !important;
    line-height: 1.3;
}

#${APP_NAME}-config-container .lyrics-provider-title-meta {
    min-width: 0;
    color: var(--text-tertiary);
    font-size: 10px !important;
    font-weight: 400;
}

#${APP_NAME}-config-container .lyrics-provider-summary {
    grid-column: 1 / -1;
    margin-top: 1px !important;
    color: var(--text-secondary);
    font-size: 11.5px !important;
    font-weight: 400;
    line-height: 1.45;
}

#${APP_NAME}-config-container .lyrics-provider-card-header-right {
    gap: 10px !important;
    padding-left: 12px;
}

#${APP_NAME}-config-container .support-badges {
    display: flex;
    flex-wrap: nowrap !important;
    justify-content: flex-end;
    gap: 5px !important;
}

#${APP_NAME}-config-container .support-icon-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    min-width: 24px;
    height: 24px;
    border: 0.5px solid #1c4a32;
    border-radius: 6px;
    background: #132a20;
    color: #5fd88f;
}

#${APP_NAME}-config-container .support-icon-chip.support-icon-word {
    border-color: #4b3a16;
    background: #2c2412;
    color: #d8a92f;
}

#${APP_NAME}-config-container .support-icon-chip.support-icon-unsynced {
    border-color: var(--settings-border);
    background: var(--settings-muted-surface);
    color: var(--text-secondary);
}

#${APP_NAME}-config-container[data-ui-theme="light"] .support-icon-chip {
    border-color: #cce8d7;
    background: #e6f5ec;
    color: #237447;
}

#${APP_NAME}-config-container[data-ui-theme="light"] .support-icon-chip.support-icon-word {
    border-color: #eadcba;
    background: #fbf4df;
    color: #956f10;
}

#${APP_NAME}-config-container .lyrics-provider-expand-icon {
    width: 14px;
    height: 14px;
    color: var(--text-tertiary);
}

#${APP_NAME}-config-container .lyrics-provider-card-body {
    margin: 0 13px 13px 4px !important;
    padding: 13px 0 0 !important;
    border-top: 0.5px solid var(--settings-divider) !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .ai-translation-style-title,
#${APP_NAME}-config-container .ai-translation-style-option-label,
#${APP_NAME}-config-container .lyrics-type-toggles-title,
#${APP_NAME}-config-container .ai-addon-capabilities-title {
    font-weight: 500 !important;
}

#${APP_NAME}-config-container .cultural-annotation-group {
    overflow: hidden;
    margin: 0 0 22px;
    border: 0.5px solid var(--settings-section-outline);
    border-radius: 9px;
    background: var(--settings-surface-1);
}

#${APP_NAME}-config-container .cultural-annotation-group > .option-list-wrapper {
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
}

#${APP_NAME}-config-container .cultural-annotation-group > .cultural-details-toggle {
    min-height: 40px;
    margin: 0 !important;
    padding: 9px 14px !important;
    border: 0 !important;
    border-top: 0.5px solid var(--settings-row-divider) !important;
    border-radius: 0 !important;
    background: var(--settings-muted-surface) !important;
    color: var(--text-secondary);
    font-size: 11.5px;
    font-weight: 500;
}

#${APP_NAME}-config-container .cultural-annotation-group > .cultural-details-toggle:hover {
    border-color: var(--settings-row-divider) !important;
    background: var(--settings-surface-2) !important;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .cultural-annotation-group > .cultural-annotation-details {
    padding: 0 12px 12px;
    border-top: 0.5px solid var(--settings-row-divider);
    background: var(--settings-muted-surface);
}

#${APP_NAME}-config-container .cultural-annotation-group > .cultural-annotation-details > .option-list-wrapper {
    margin: 12px 0 0 !important;
    border: 0.5px solid var(--settings-section-outline) !important;
    border-radius: 8px !important;
    background: var(--settings-surface-1) !important;
}

#${APP_NAME}-config-container button:not([disabled]):focus-visible,
#${APP_NAME}-config-container input[type]:not([disabled]):focus-visible,
#${APP_NAME}-config-container select:not([disabled]):focus-visible,
#${APP_NAME}-config-container textarea:not([disabled]):focus-visible,
#${APP_NAME}-config-container [tabindex]:not([tabindex="-1"]):focus-visible {
    outline: 2px solid rgba(95, 216, 143, 0.86) !important;
    outline-offset: 2px !important;
    border-color: rgba(95, 216, 143, 0.58) !important;
    box-shadow: none !important;
}

@media (max-width: 900px) {
    .ivlyrics-settings-modal-shell:has(#${APP_NAME}-config-container) {
        width: min(calc(100vw - 20px), 820px) !important;
        max-width: calc(100vw - 20px) !important;
        max-height: calc(100vh - 20px) !important;
    }

    #${APP_NAME}-config-container {
        height: calc(100vh - 20px);
        min-height: 0;
        grid-template-columns: 1fr !important;
        grid-template-rows: 72px auto minmax(0, 1fr) !important;
    }

    #${APP_NAME}-config-container .settings-header {
        grid-column: 1 !important;
        grid-row: 1 !important;
        padding: 0 18px !important;
    }

    #${APP_NAME}-config-container .settings-sidebar {
        grid-column: 1 !important;
        grid-row: 2 !important;
        max-height: min(30vh, 230px);
        padding: 14px 16px 16px !important;
        border-right: 0 !important;
        border-bottom: 0.5px solid var(--settings-border) !important;
    }

    #${APP_NAME}-config-container .settings-sidebar-nav {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px 18px !important;
    }

    #${APP_NAME}-config-container .settings-main-panel {
        grid-column: 1 !important;
        grid-row: 3 !important;
    }

    #${APP_NAME}-config-container .settings-content {
        --settings-content-top-padding: 30px;
        max-width: none;
        padding: 30px 28px 48px !important;
    }

    #${APP_NAME}-config-container .setting-row-content {
        grid-template-columns: 1fr !important;
        align-items: start;
        gap: 10px !important;
    }

    #${APP_NAME}-config-container .setting-row-right {
        width: 100%;
        max-width: none;
        justify-content: flex-start;
    }
}

@media (max-width: 650px) {
    .ivlyrics-settings-modal-shell:has(#${APP_NAME}-config-container) {
        width: 100vw !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        border: 0 !important;
        border-radius: 0 !important;
    }

    #${APP_NAME}-config-container {
        height: 100vh;
        border-radius: 0 !important;
    }

    #${APP_NAME}-config-container .settings-theme-option {
        width: 32px;
        min-width: 32px;
        padding: 0;
    }

    #${APP_NAME}-config-container .settings-theme-option span {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
    }

    #${APP_NAME}-config-container .settings-coffee-btn span {
        display: inline !important;
    }

    #${APP_NAME}-config-container .settings-sidebar-nav {
        grid-template-columns: 1fr;
    }

    #${APP_NAME}-config-container .settings-content {
        --settings-content-top-padding: 26px;
        padding: 26px 18px 40px !important;
    }

    #${APP_NAME}-config-container .lyrics-provider-card-header {
        align-items: flex-start;
    }

    #${APP_NAME}-config-container .lyrics-provider-card-header-right {
        padding-left: 8px;
    }

    #${APP_NAME}-config-container .support-badges {
        max-width: 58px;
        flex-wrap: wrap !important;
    }
}
`;
