import { waitForPageUpdateCheck } from "#ivlyrics/features/updates/pageUpdateCheck.mjs";
import { waitForAppUpdateDialogClose } from "#ivlyrics/features/updates/updateDialogState.mjs";

// NoticeSystem.js - ivLyrics 공지사항 시스템
// 서버에서 공지사항을 가져와 사용자에게 표시합니다
import { createNoticeRepository } from "./noticeRepository.mjs";
import { NOTICE_STYLES } from "./noticeStyles.mjs";
import { compareDottedVersions } from "../core/compareDottedVersions.mjs";
import { cycleDialogTabFocus, getNotificationFocusableElements } from "./modal/dialogTabFocus.mjs";
import { createNotificationIcon, getNotificationTheme, NOTIFICATION_ICON_SHAPES } from "./notificationPresentation.mjs";

export function createNoticeSystem({
    host: window, document, spicetify: Spicetify, i18n: I18n,
    readVersion, getPersistence, getStorage, getReactDOM, request,
}) {
    const MODULE_KEY = "__ivLyricsNoticeSystemModule";
    const moduleState = window[MODULE_KEY] || (window[MODULE_KEY] = {
        initialized: false,
        activeContainer: null,
        api: null,
        showNoticeIfNeeded: null
    });

    if (moduleState.initialized) return moduleState;

    moduleState.initialized = true;

    // React 및 hooks를 lazy하게 가져오기 (Spicetify가 준비된 후에만 접근)
    const getNoticeReact = () => Spicetify.React;
    const getNoticeUseState = () => Spicetify.React?.useState;
    const getNoticeUseEffect = () => Spicetify.React?.useEffect;
    const getNoticeUseRef = () => Spicetify.React?.useRef;

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

    const getNoticeUiTheme = () => getNotificationTheme((key) =>
        getPersistence()?.getItem?.(key) ?? getStorage().getItem(key));

    const NOTICE_ICON_SHAPES = {
        ...NOTIFICATION_ICON_SHAPES,
        info: [
            ["circle", { cx: 12, cy: 12, r: 9 }],
            ["path", { d: "M12 11v5" }],
            ["path", { d: "M12 8h.01" }],
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

    const createNoticeIcon = (name, size = 20) => createNotificationIcon(
        getNoticeReact(), name, size, NOTICE_ICON_SHAPES[name] || NOTICE_ICON_SHAPES.info
    );

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
            const currentVersion = readVersion();
            const minVersion = notice.min_version;

            // 현재 버전 >= min_version 이면 닫기 가능
            const comparison = compareDottedVersions(currentVersion, minVersion);
            return comparison >= 0;
        } catch (e) {
            console.error("[NoticeSystem] Failed to compare versions:", e);
            // 버전 비교 실패 시 안전하게 닫기 불가로 처리
            return false;
        }
    };

    const NoticeSystem = createNoticeRepository({ request, getStorage });

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

            const handleKeydown = (event) => {
                if (event.key === "Escape" && isDismissible) {
                    event.preventDefault();
                    handleClose();
                    return;
                }

                if (event.key !== "Tab") return;

                cycleDialogTabFocus(event, document.activeElement, getNotificationFocusableElements(modal), {
                    fallback: modal,
                    containerEdge: modal,
                });
            };

            document.addEventListener("keydown", handleKeydown);
            window.requestAnimationFrame(() => {
                modal.focus();
            });

            return () => document.removeEventListener("keydown", handleKeydown);
        }, [currentIndex, isDismissible]);

        getNoticeUseEffect()(() => () => {
            const previouslyFocused = previouslyFocusedRef.current;
            if (previouslyFocused instanceof window.HTMLElement && document.contains(previouslyFocused)) {
                previouslyFocused.focus();
            }
        }, []);

        const react = getNoticeReact();
        const closeLabel = I18n?.t("buttons.close") || "Close";

        const renderNoticeHeader = () => react.createElement(
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
        );

        const renderNoticeBody = () => react.createElement(
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
        );

        const renderNoticeFooter = () => react.createElement(
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
                    I18n?.t("notice.dismissAll") || "Dismiss All"
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
                        ? (I18n?.t("notice.next") || "Next")
                        : (I18n?.t("notice.confirm") || "OK")
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
        );

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
                renderNoticeHeader(),
                renderNoticeBody(),
                renderNoticeFooter()
            )
        );
    };

    // 공지사항 표시 함수 (앱 시작 시 호출)
    const showNoticeIfNeeded = async () => {
        try {
            await waitForPageUpdateCheck(window);
            await waitForAppUpdateDialogClose(window);
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
                    const dom = getReactDOM();
                    if (dom && dom.unmountComponentAtNode) {
                        dom.unmountComponentAtNode(container);
                    }
                    container.remove();
                    container = null;
                }
                moduleState.activeContainer = null;
            };

            // 모달 렌더링
            const dom = getReactDOM();
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
    noticeStyles.textContent = NOTICE_STYLES;
    if (!document.getElementById("ivLyrics-notice-styles")) {
        document.head.appendChild(noticeStyles);
    }

    moduleState.api = NoticeSystem;
    moduleState.showNoticeIfNeeded = showNoticeIfNeeded;
    return moduleState;
}
