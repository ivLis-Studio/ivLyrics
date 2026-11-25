const NOTICE_STORAGE_KEY = "ivLyrics:recent-notice";
const NOTICE_URL = "https://ivlis.kr/ivLyrics/notice/";

export function createNoticeRepository({ request, getStorage }) {
    let isFetching = false;
    let fetchPromise = null;

    // 저장된 마지막 확인 공지 날짜 가져오기
    const getLastSeenDate = () => {
        try {
            return getStorage().getItem(NOTICE_STORAGE_KEY) || null;
        } catch (e) {
            console.error("[NoticeSystem] Failed to get last seen date:", e);
            return null;
        }
    };

    // 마지막 확인 공지 날짜 저장
    const setLastSeenDate = (date) => {
        try {
            getStorage().setItem(NOTICE_STORAGE_KEY, date);
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
                const response = await request(NOTICE_URL, {
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
        const isNoticeUnseen = (notice) => {
            // 만료된 공지 제외
            if (notice.expiresAt && notice.expiresAt < now) {
                return false;
            }

            // 마지막 확인 날짜보다 새로운 공지만 표시
            if (lastSeenDate && notice.date <= lastSeenDate) {
                return false;
            }

            return true;
        };

        const compareNoticesByPriorityThenDate = (a, b) => {
            // 우선순위 정렬 (urgent > high > normal)
            const priorityOrder = { urgent: 3, high: 2, normal: 1 };
            const priorityDiff = (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
            if (priorityDiff !== 0) return priorityDiff;

            // 날짜 내림차순 정렬
            return b.date.localeCompare(a.date);
        };

        return data.notices.filter(isNoticeUnseen).sort(compareNoticesByPriorityThenDate);
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
}
