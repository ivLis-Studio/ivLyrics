// NoticeSystem.js - ivLyrics 공지사항 시스템
// 서버에서 공지사항을 가져와 사용자에게 표시합니다
(function NoticeSystemInit() {
const MODULE_KEY = "__ivLyricsNoticeSystemModule";
const moduleState = window[MODULE_KEY] || (window[MODULE_KEY] = {
    initialized: false,
    activeContainer: null,
    api: null,
    showNoticeIfNeeded: null
});

if (moduleState.initialized) {
    if (moduleState.api) {
        window.NoticeSystem = moduleState.api;
    }
    if (moduleState.showNoticeIfNeeded) {
        window.showNoticeIfNeeded = moduleState.showNoticeIfNeeded;
    }
    return;
}

moduleState.initialized = true;

// React 및 hooks를 lazy하게 가져오기 (Spicetify가 준비된 후에만 접근)
const getNoticeReact = () => Spicetify.React;
const getNoticeUseState = () => Spicetify.React?.useState;
const getNoticeUseEffect = () => Spicetify.React?.useEffect;
const getNoticeUseRef = () => Spicetify.React?.useRef;

const NOTICE_STORAGE_KEY = "ivLyrics:recent-notice";
const NOTICE_URL = "https://ivlis.kr/ivLyrics/notice/";

const sanitizeNoticeUrl = (url) => {
    if (typeof url !== "string") return null;

    try {
        const parsed = new URL(url, window.location.origin);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
};

const getNoticeUiTheme = () => {
    try {
        const storedTheme =
            window.ivLyricsStoragePersistence?.getItem?.("ivLyrics:settings-ui-theme") ??
            localStorage.getItem("ivLyrics:settings-ui-theme");
        return storedTheme === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
};

const NOTICE_ICON_SHAPES = {
    info: [
        ["circle", { cx: 12, cy: 12, r: 9 }],
        ["path", { d: "M12 11v5" }],
        ["path", { d: "M12 8h.01" }],
    ],
    update: [
        ["path", { d: "M20 6v5h-5" }],
        ["path", { d: "M4 18v-5h5" }],
        ["path", { d: "M6.1 9a7 7 0 0 1 11.7-2.6L20 11" }],
        ["path", { d: "M4 13l2.2 4.6A7 7 0 0 0 17.9 15" }],
    ],
    warning: [
        ["path", { d: "M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z" }],
        ["path", { d: "M12 9v4" }],
        ["path", { d: "M12 17h.01" }],
    ],
    celebration: [
        ["path", { d: "m3 21 3.8-10.5 6.7 6.7L3 21Z" }],
        ["path", { d: "m8 14 5-5" }],
        ["path", { d: "M14 4h.01" }],
        ["path", { d: "M18 8h.01" }],
        ["path", { d: "M18 3l.4 1.5L20 5l-1.6.5L18 7l-.4-1.5L16 5l1.6-.5L18 3Z" }],
        ["path", { d: "M15 13l.4 1.5 1.6.5-1.6.5L15 17l-.4-1.5L13 15l1.6-.5L15 13Z" }],
    ],
    close: [
        ["path", { d: "m18 6-12 12" }],
        ["path", { d: "m6 6 12 12" }],
    ],
    external: [
        ["path", { d: "M15 3h6v6" }],
        ["path", { d: "m10 14 11-11" }],
        ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
    ],
    dismissAll: [
        ["circle", { cx: 12, cy: 12, r: 9 }],
        ["path", { d: "m15 9-6 6" }],
        ["path", { d: "m9 9 6 6" }],
    ],
    next: [
        ["path", { d: "m9 18 6-6-6-6" }],
    ],
    confirm: [
        ["path", { d: "m5 12 4 4L19 6" }],
    ],
    lock: [
        ["rect", { x: 5, y: 10, width: 14, height: 10, rx: 2 }],
        ["path", { d: "M8 10V7a4 4 0 0 1 8 0v3" }],
    ],
};

const createNoticeIcon = (name, size = 20) => {
    const react = getNoticeReact();
    const shapes = NOTICE_ICON_SHAPES[name] || NOTICE_ICON_SHAPES.info;

    return react.createElement(
        "svg",
        {
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
            focusable: "false",
        },
        shapes.map(([element, props], index) =>
            react.createElement(element, { ...props, key: `${name}-${index}` })
        )
    );
};

/**
 * 공지사항 데이터 구조:
 * {
 *   "version": 1,
 *   "notices": [
 *     {
 *       "id": "notice-2026-01-04",
 *       "date": "2026-01-04",
 *       "priority": "normal" | "high" | "urgent",
 *       "title": "공지 제목",
 *       "content": "공지 내용입니다. 여러 줄도 지원합니다.",
 *       "buttons": [
 *         { "label": "자세히 보기", "url": "https://example.com" }
 *       ],
 *       "icon": "info" | "update" | "warning" | "celebration",
 *       "dismissible": true,
 *       "min_version": "3.4.0", // 선택사항: 이 버전 미만에서만 dismissible:false 적용
 *       "expiresAt": "2026-01-10" // 선택사항: 만료일
 *     }
 *   ]
 * }
 * 
 * dismissible 동작 규칙:
 * - dismissible: true → 항상 닫기 가능
 * - dismissible: false + min_version 없음 → 항상 닫기 불가
 * - dismissible: false + min_version 설정 → 클라이언트 버전 >= min_version 이면 닫기 가능
 *   (기존 클라이언트 호환성: min_version을 모르는 클라이언트는 dismissible:false로 동작)
 */

/**
 * 버전 문자열 비교 (Utils 로드 전에도 사용 가능)
 * @param {string} a - 첫 번째 버전 (예: "1.1.0")
 * @param {string} b - 두 번째 버전 (예: "1.0.9")
 * @returns {number} - a > b면 1, a < b면 -1, 같으면 0
 */
const compareVersions = (a, b) => {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;

        if (aPart > bPart) return 1;
        if (aPart < bPart) return -1;
    }

    return 0;
};

const getCurrentVersion = () => {
    return (
        window.Utils?.getCurrentVersion?.() ||
        window.CONFIG?.version ||
        window.ivLyricsVersion ||
        "6.6.11"
    );
};

/**
 * 공지사항의 실제 dismissible 상태를 계산합니다.
 * @param {Object} notice - 공지사항 객체
 * @returns {boolean} - 닫기 가능 여부
 */
const calculateDismissible = (notice) => {
    // dismissible이 true이면 항상 닫기 가능
    if (notice.dismissible !== false) {
        return true;
    }

    // dismissible이 false인 경우
    // min_version이 없으면 닫기 불가
    if (!notice.min_version) {
        return false;
    }

    // min_version이 설정된 경우, 현재 버전과 비교
    try {
        const currentVersion = getCurrentVersion();
        const minVersion = notice.min_version;

        // 현재 버전 >= min_version 이면 닫기 가능
        const comparison = compareVersions(currentVersion, minVersion);
        return comparison >= 0;
    } catch (e) {
        console.error("[NoticeSystem] Failed to compare versions:", e);
        // 버전 비교 실패 시 안전하게 닫기 불가로 처리
        return false;
    }
};

const NoticeSystem = (() => {
    let isFetching = false;
    let fetchPromise = null;

    // 저장된 마지막 확인 공지 날짜 가져오기
    const getLastSeenDate = () => {
        try {
            return localStorage.getItem(NOTICE_STORAGE_KEY) || null;
        } catch (e) {
            console.error("[NoticeSystem] Failed to get last seen date:", e);
            return null;
        }
    };

    // 마지막 확인 공지 날짜 저장
    const setLastSeenDate = (date) => {
        try {
            localStorage.setItem(NOTICE_STORAGE_KEY, date);
        } catch (e) {
            console.error("[NoticeSystem] Failed to save last seen date:", e);
        }
    };

    // 공지사항 가져오기
    const fetchNotices = async () => {
        if (isFetching) return fetchPromise;

        isFetching = true;
        fetchPromise = (async () => {
            try {
                const response = await fetch(NOTICE_URL, {
                    cache: "no-store",
                    headers: {
                        "Cache-Control": "no-cache"
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                return data;
        } catch (error) {
            console.error("[NoticeSystem] Failed to fetch notices:", error);
            return null;
        } finally {
            isFetching = false;
            fetchPromise = null;
            }
        })();

        return fetchPromise;
    };

    // 표시할 공지사항 가져오기 (새로운 것만)
    const getUnseenNotices = async () => {
        const data = await fetchNotices();
        if (!data || !data.notices || data.notices.length === 0) {
            return [];
        }

        const lastSeenDate = getLastSeenDate();
        const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

        // 새로운 공지사항 필터링
        return data.notices.filter((notice) => {
            // 만료된 공지 제외
            if (notice.expiresAt && notice.expiresAt < now) {
                return false;
            }

            // 마지막 확인 날짜보다 새로운 공지만 표시
            if (lastSeenDate && notice.date <= lastSeenDate) {
                return false;
            }

            return true;
        }).sort((a, b) => {
            // 우선순위 정렬 (urgent > high > normal)
            const priorityOrder = { urgent: 3, high: 2, normal: 1 };
            const priorityDiff = (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
            if (priorityDiff !== 0) return priorityDiff;

            // 날짜 내림차순 정렬
            return b.date.localeCompare(a.date);
        });
    };

    // 공지 확인 처리 (닫기)
    const dismissNotice = (noticeDate) => {
        const lastSeenDate = getLastSeenDate();
        if (!lastSeenDate || noticeDate > lastSeenDate) {
            setLastSeenDate(noticeDate);
        }
    };

    // 모든 공지 닫기 (가장 최신 날짜로 저장)
    const dismissAllNotices = async () => {
        const data = await fetchNotices();
        if (!data || !data.notices || data.notices.length === 0) return;

        // 가장 최신 날짜 찾기
        const latestDate = data.notices.reduce((max, notice) => {
            return notice.date > max ? notice.date : max;
        }, "");

        if (latestDate) {
            setLastSeenDate(latestDate);
        }
    };

    return {
        fetchNotices,
        getUnseenNotices,
        dismissNotice,
        dismissAllNotices,
        getLastSeenDate,
        setLastSeenDate
    };
})();

// NoticeModal 컴포넌트
const NoticeModal = ({ notices, onClose }) => {
    const [currentIndex, setCurrentIndex] = getNoticeUseState()(0);
    const modalRef = getNoticeUseRef()(null);
    const previouslyFocusedRef = getNoticeUseRef()(document.activeElement);
    const currentNotice = notices[currentIndex];
    const safeButtons = Array.isArray(currentNotice?.buttons)
        ? currentNotice.buttons
            .map((button) => ({
                ...button,
                href: sanitizeNoticeUrl(button?.url),
            }))
            .filter((button) => button.href)
        : [];

    if (!currentNotice) return null;

    // 실제 닫기 가능 여부 계산 (min_version 고려)
    const isDismissible = calculateDismissible(currentNotice);
    const priority = ["urgent", "high", "normal"].includes(currentNotice.priority)
        ? currentNotice.priority
        : "normal";
    const canDismissAll =
        notices.length > 1 && notices.every((notice) => calculateDismissible(notice));

    const handleClose = () => {
        // 현재 공지 날짜로 저장
        NoticeSystem.dismissNotice(currentNotice.date);

        if (currentIndex < notices.length - 1) {
            setCurrentIndex((index) => index + 1);
        } else {
            onClose();
        }
    };

    const handleDismissAll = () => {
        NoticeSystem.dismissAllNotices();
        onClose();
    };

    getNoticeUseEffect()(() => {
        const modal = modalRef.current;
        if (!modal) return undefined;

        const getFocusableElements = () => Array.from(modal.querySelectorAll(
            'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

        const handleKeydown = (event) => {
            if (event.key === "Escape" && isDismissible) {
                event.preventDefault();
                handleClose();
                return;
            }

            if (event.key !== "Tab") return;

            const focusable = getFocusableElements();
            if (!focusable.length) {
                event.preventDefault();
                modal.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === modal) {
                event.preventDefault();
                first.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeydown);
        window.requestAnimationFrame(() => {
            modal.focus();
        });

        return () => document.removeEventListener("keydown", handleKeydown);
    }, [currentIndex, isDismissible]);

    getNoticeUseEffect()(() => () => {
        const previouslyFocused = previouslyFocusedRef.current;
        if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
            previouslyFocused.focus();
        }
    }, []);

    const react = getNoticeReact();
    const closeLabel = window.I18n?.t("settingsUi.close") || "Close";

    return getNoticeReact().createElement(
        "div",
        {
            className: "notice-modal-overlay",
            "data-ui-theme": getNoticeUiTheme(),
            onClick: (e) => {
                if (e.target === e.currentTarget && isDismissible) {
                    handleClose();
                }
            },
        },
        getNoticeReact().createElement(
            "div",
            {
                className: "notice-modal",
                ref: modalRef,
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "ivlyrics-notice-title",
                "aria-describedby": "ivlyrics-notice-content",
                "data-priority": priority,
                tabIndex: -1,
            },
            react.createElement(
                "div",
                { className: "notice-modal__header" },
                react.createElement(
                    "div",
                    { className: "notice-modal__icon" },
                    createNoticeIcon(currentNotice.icon, 22)
                ),
                react.createElement(
                    "div",
                    { className: "notice-modal__heading" },
                    react.createElement(
                        "h2",
                        { id: "ivlyrics-notice-title" },
                        currentNotice.title
                    ),
                    react.createElement(
                        "div",
                        { className: "notice-modal__meta" },
                        react.createElement("time", { dateTime: currentNotice.date }, currentNotice.date),
                        notices.length > 1 &&
                        react.createElement(
                            "span",
                            { className: "notice-modal__counter" },
                            `${currentIndex + 1} / ${notices.length}`
                        )
                    )
                ),
                isDismissible &&
                react.createElement(
                    "button",
                    {
                        type: "button",
                        className: "notice-modal__close",
                        onClick: handleClose,
                        title: closeLabel,
                        "aria-label": closeLabel,
                    },
                    createNoticeIcon("close", 18)
                )
            ),
            react.createElement(
                "div",
                { className: "notice-modal__body" },
                react.createElement(
                    "div",
                    {
                        id: "ivlyrics-notice-content",
                        className: "notice-modal__content",
                    },
                    currentNotice.content
                ),
                safeButtons.length > 0 &&
                react.createElement(
                    "div",
                    {
                        className: "notice-modal__links",
                        "aria-label": currentNotice.title,
                    },
                    safeButtons.map((button, index) =>
                        react.createElement(
                            "a",
                            {
                                key: `${button.href}-${index}`,
                                href: button.href,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: `notice-modal__link${index === 0 ? " is-primary" : ""}`,
                            },
                            react.createElement("span", null, button.label),
                            createNoticeIcon("external", 15)
                        )
                    )
                )
            ),
            react.createElement(
                "div",
                { className: "notice-modal__footer" },
                canDismissAll &&
                react.createElement(
                    "button",
                    {
                        type: "button",
                        className: "notice-modal__button notice-modal__button--secondary",
                        onClick: handleDismissAll,
                    },
                    createNoticeIcon("dismissAll", 16),
                    react.createElement(
                        "span",
                        null,
                        window.I18n?.t("notice.dismissAll") || "Dismiss All"
                    )
                ),
                react.createElement("span", { className: "notice-modal__footer-spacer" }),
                react.createElement(
                    "button",
                    {
                        type: "button",
                        className: "notice-modal__button notice-modal__button--primary",
                        onClick: handleClose,
                        disabled: !isDismissible,
                        "data-notice-primary": "true",
                    },
                    react.createElement(
                        "span",
                        null,
                        currentIndex < notices.length - 1
                            ? (window.I18n?.t("notice.next") || "Next")
                            : (window.I18n?.t("notice.confirm") || "OK")
                    ),
                    createNoticeIcon(
                        !isDismissible
                            ? "lock"
                            : currentIndex < notices.length - 1
                                ? "next"
                                : "confirm",
                        16
                    )
                )
            )
        )
    );
};

const waitForStartupUpdateDialog = async () => {
    if (window.__ivLyricsUpdateCheckPending) {
        await new Promise((resolve) => {
            const handleComplete = () => {
                window.removeEventListener("ivLyrics:update-check-complete", handleComplete);
                resolve();
            };
            window.addEventListener("ivLyrics:update-check-complete", handleComplete);
            if (!window.__ivLyricsUpdateCheckPending) {
                handleComplete();
            }
        });
    }

    if (!window.ivLyrics_updateInfo?.available) return;

    await new Promise((resolve) => {
        const handleDialogState = (event) => {
            if (event?.detail?.open !== false) return;
            window.removeEventListener("ivLyrics:update-dialog-state", handleDialogState);
            resolve();
        };
        window.addEventListener("ivLyrics:update-dialog-state", handleDialogState);
        if (!window.ivLyrics_updateInfo?.available) {
            window.removeEventListener("ivLyrics:update-dialog-state", handleDialogState);
            resolve();
        }
    });
};

// 공지사항 표시 함수 (앱 시작 시 호출)
const showNoticeIfNeeded = async () => {
    try {
        await waitForStartupUpdateDialog();
        const notices = await NoticeSystem.getUnseenNotices();

        if (notices.length === 0) {
            return;
        }

        if (moduleState.activeContainer?.isConnected) {
            return;
        }

        // 모달 컨테이너 생성
        let container = document.getElementById("ivLyrics-notice-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "ivLyrics-notice-container";
            document.body.appendChild(container);
        }
        moduleState.activeContainer = container;

        const closeModal = () => {
            if (container && container.parentNode) {
                const dom = Spicetify.ReactDOM || window.ReactDOM;
                if (dom && dom.unmountComponentAtNode) {
                    dom.unmountComponentAtNode(container);
                }
                container.remove();
                container = null;
            }
            moduleState.activeContainer = null;
        };

        // 모달 렌더링
        const dom = Spicetify.ReactDOM || window.ReactDOM;
        if (dom && dom.render) {
            dom.render(
                getNoticeReact().createElement(NoticeModal, { notices, onClose: closeModal }),
                container
            );
        }
    } catch (error) {
        console.error("[NoticeSystem] Error showing notice:", error);
    }
};

// CSS 스타일 추가
const noticeStyles = document.createElement("style");
noticeStyles.id = "ivLyrics-notice-styles";
noticeStyles.textContent = `
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
if (!document.getElementById("ivLyrics-notice-styles")) {
    document.head.appendChild(noticeStyles);
}

// 전역으로 showNoticeIfNeeded 함수 노출
moduleState.api = NoticeSystem;
moduleState.showNoticeIfNeeded = showNoticeIfNeeded;
window.showNoticeIfNeeded = showNoticeIfNeeded;
window.NoticeSystem = NoticeSystem;
})();
