// NoticeSystem.js - ivLyrics 공지사항 시스템
// 서버에서 공지사항을 가져와 사용자에게 표시합니다

// React 및 hooks를 lazy하게 가져오기 (Spicetify가 준비된 후에만 접근)
const getNoticeReact = () => Spicetify.React;
const getNoticeUseState = () => Spicetify.React?.useState;

const NOTICE_STORAGE_KEY = "ivLyrics:recent-notice";
const NOTICE_URL = "https://ivlis.kr/ivLyrics/notice/";

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
 *       "expiresAt": "2026-01-10" // 선택사항: 만료일
 *     }
 *   ]
 * }
 */

const NoticeSystem = (() => {
    let cachedNotices = null;
    let isFetching = false;

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
        if (isFetching) return cachedNotices;

        isFetching = true;
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
            cachedNotices = data;
            return data;
        } catch (error) {
            console.error("[NoticeSystem] Failed to fetch notices:", error);
            return null;
        } finally {
            isFetching = false;
        }
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

// 전역 접근 가능하게 등록
window.NoticeSystem = NoticeSystem;

// NoticeModal 컴포넌트
const NoticeModal = ({ notices, onClose }) => {
    const [currentIndex, setCurrentIndex] = getNoticeUseState()(0);
    const currentNotice = notices[currentIndex];

    if (!currentNotice) return null;

    // 아이콘 SVG 매핑
    const iconSVGs = {
        info: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
        update: '<path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3v7.12zM12.5 8v4.25l3.5 2.08-.72 1.21L11 13V8h1.5z"/>',
        warning: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
        celebration: '<path d="M2 22l14-5-9-9-5 14zm10.1-10.1l-.7-.7 7.07-7.07.71.71-7.08 7.06z"/><circle cx="17" cy="8" r="2"/><circle cx="8" cy="17" r="2"/>',
    };

    // 우선순위별 색상
    const priorityColors = {
        urgent: { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", accent: "#ef4444" },
        high: { bg: "rgba(251, 191, 36, 0.15)", border: "rgba(251, 191, 36, 0.4)", accent: "#fbbf24" },
        normal: { bg: "rgba(29, 185, 84, 0.15)", border: "rgba(29, 185, 84, 0.4)", accent: "#1db954" },
    };

    const colors = priorityColors[currentNotice.priority] || priorityColors.normal;

    const handleClose = () => {
        // 현재 공지 날짜로 저장
        NoticeSystem.dismissNotice(currentNotice.date);

        if (currentIndex < notices.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            onClose();
        }
    };

    const handleDismissAll = () => {
        NoticeSystem.dismissAllNotices();
        onClose();
    };

    return getNoticeReact().createElement(
        "div",
        {
            className: "notice-modal-overlay",
            style: {
                position: "fixed",
                inset: 0,
                background: "rgba(0, 0, 0, 0.7)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 99999,
                animation: "fadeIn 0.3s ease",
            },
            onClick: (e) => {
                if (e.target === e.currentTarget && currentNotice.dismissible !== false) {
                    handleClose();
                }
            },
        },
        getNoticeReact().createElement(
            "div",
            {
                className: "notice-modal",
                style: {
                    background: "rgba(24, 24, 24, 0.95)",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "16px",
                    padding: "28px",
                    maxWidth: "480px",
                    width: "90%",
                    boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${colors.accent}22`,
                    animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                    position: "relative",
                    overflow: "hidden",
                },
            },
            // 배경 글로우 효과
            getNoticeReact().createElement("div", {
                style: {
                    position: "absolute",
                    top: "-50%",
                    right: "-30%",
                    width: "200px",
                    height: "200px",
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${colors.accent}20 0%, transparent 70%)`,
                    pointerEvents: "none",
                },
            }),
            // 공지 카운터 (여러 개일 때)
            notices.length > 1 &&
            getNoticeReact().createElement(
                "div",
                {
                    style: {
                        position: "absolute",
                        top: "16px",
                        right: "16px",
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.5)",
                        fontWeight: "500",
                    },
                },
                `${currentIndex + 1} / ${notices.length}`
            ),
            // 아이콘
            getNoticeReact().createElement(
                "div",
                {
                    style: {
                        width: "52px",
                        height: "52px",
                        borderRadius: "14px",
                        background: colors.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "20px",
                    },
                },
                getNoticeReact().createElement("svg", {
                    width: 28,
                    height: 28,
                    viewBox: "0 0 24 24",
                    fill: colors.accent,
                    dangerouslySetInnerHTML: { __html: iconSVGs[currentNotice.icon] || iconSVGs.info },
                })
            ),
            // 제목
            getNoticeReact().createElement(
                "h2",
                {
                    style: {
                        fontSize: "20px",
                        fontWeight: "700",
                        color: "#ffffff",
                        marginBottom: "12px",
                        lineHeight: "1.3",
                    },
                },
                currentNotice.title
            ),
            // 날짜
            getNoticeReact().createElement(
                "div",
                {
                    style: {
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.4)",
                        marginBottom: "16px",
                    },
                },
                currentNotice.date
            ),
            // 내용
            getNoticeReact().createElement(
                "div",
                {
                    style: {
                        fontSize: "14px",
                        color: "rgba(255, 255, 255, 0.8)",
                        lineHeight: "1.7",
                        marginBottom: "24px",
                        whiteSpace: "pre-wrap",
                    },
                },
                currentNotice.content
            ),
            // 버튼 영역
            getNoticeReact().createElement(
                "div",
                {
                    style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                    },
                },
                // URL 버튼들
                currentNotice.buttons &&
                currentNotice.buttons.length > 0 &&
                getNoticeReact().createElement(
                    "div",
                    {
                        style: {
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap",
                        },
                    },
                    currentNotice.buttons.map((btn, idx) =>
                        getNoticeReact().createElement(
                            "a",
                            {
                                key: idx,
                                href: btn.url,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                style: {
                                    flex: 1,
                                    minWidth: "120px",
                                    padding: "12px 20px",
                                    background: idx === 0 ? colors.accent : "rgba(255, 255, 255, 0.08)",
                                    color: idx === 0 ? "#000" : "rgba(255, 255, 255, 0.9)",
                                    border: idx === 0 ? "none" : "1px solid rgba(255, 255, 255, 0.15)",
                                    borderRadius: "10px",
                                    fontSize: "14px",
                                    fontWeight: "600",
                                    textAlign: "center",
                                    textDecoration: "none",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                },
                            },
                            btn.label
                        )
                    )
                ),
                // 닫기 버튼
                getNoticeReact().createElement(
                    "div",
                    {
                        style: {
                            display: "flex",
                            gap: "10px",
                            marginTop: notices.length > 1 ? "6px" : "0",
                        },
                    },
                    // 모두 닫기 (여러 개일 때)
                    notices.length > 1 &&
                    getNoticeReact().createElement(
                        "button",
                        {
                            onClick: handleDismissAll,
                            style: {
                                flex: 1,
                                padding: "12px 20px",
                                background: "transparent",
                                color: "rgba(255, 255, 255, 0.5)",
                                border: "none",
                                borderRadius: "10px",
                                fontSize: "13px",
                                fontWeight: "500",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                            },
                        },
                        (window.I18n?.t("notice.dismissAll") || "Dismiss All")
                    ),
                    // 확인/다음
                    getNoticeReact().createElement(
                        "button",
                        {
                            onClick: handleClose,
                            disabled: currentNotice.dismissible === false,
                            style: {
                                flex: 1,
                                padding: "12px 20px",
                                background:
                                    currentNotice.buttons && currentNotice.buttons.length > 0
                                        ? "rgba(255, 255, 255, 0.08)"
                                        : colors.accent,
                                color:
                                    currentNotice.buttons && currentNotice.buttons.length > 0
                                        ? "rgba(255, 255, 255, 0.9)"
                                        : "#000",
                                border:
                                    currentNotice.buttons && currentNotice.buttons.length > 0
                                        ? "1px solid rgba(255, 255, 255, 0.15)"
                                        : "none",
                                borderRadius: "10px",
                                fontSize: "14px",
                                fontWeight: "600",
                                cursor: currentNotice.dismissible === false ? "not-allowed" : "pointer",
                                opacity: currentNotice.dismissible === false ? 0.5 : 1,
                                transition: "all 0.2s ease",
                            },
                        },
                        currentIndex < notices.length - 1
                            ? (window.I18n?.t("notice.next") || "Next")
                            : (window.I18n?.t("notice.confirm") || "OK")
                    )
                )
            )
        )
    );
};

// 공지사항 표시 함수 (앱 시작 시 호출)
const showNoticeIfNeeded = async () => {
    try {
        const notices = await NoticeSystem.getUnseenNotices();

        if (notices.length === 0) {
            console.log("[NoticeSystem] No new notices to display");
            return;
        }

        console.log(`[NoticeSystem] Found ${notices.length} new notice(s)`);

        // 모달 컨테이너 생성
        let container = document.getElementById("ivLyrics-notice-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "ivLyrics-notice-container";
            document.body.appendChild(container);
        }

        const closeModal = () => {
            if (container && container.parentNode) {
                const dom = Spicetify.ReactDOM || window.ReactDOM;
                if (dom && dom.unmountComponentAtNode) {
                    dom.unmountComponentAtNode(container);
                }
            }
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
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.notice-modal a:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.notice-modal button:hover:not(:disabled) {
  filter: brightness(1.1);
}
`;
if (!document.getElementById("ivLyrics-notice-styles")) {
    document.head.appendChild(noticeStyles);
}

// 전역으로 showNoticeIfNeeded 함수 노출
window.showNoticeIfNeeded = showNoticeIfNeeded;
window.NoticeSystem = NoticeSystem;

console.log("[NoticeSystem] Module loaded successfully. showNoticeIfNeeded is now available.");
