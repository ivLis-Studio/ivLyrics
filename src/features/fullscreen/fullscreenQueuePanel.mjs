import {
    areTrackInfoEqual, areTrackListsEqual, getNextQueueTracks, getRecentQueueTracks, isRecommendedQueueTrack,
} from "./fullscreenTracks.mjs";

const QUEUE_EMPTY_GRACE_MS = 1500;

export function createFullscreenQueuePanel({ react, spotify, translate, timers = globalThis }) {
    const { useState, useEffect, useCallback, useMemo, useRef } = react;

    const renderQueueItem = (track, key, onTrackClick) => react.createElement("div", {
        key,
        className: "fullscreen-queue-item",
        onClick: () => onTrackClick(track)
    },
        track.image && react.createElement("img", {
            src: track.image,
            className: "fullscreen-queue-item-image"
        }),
        react.createElement("div", { className: "fullscreen-queue-item-info" },
            react.createElement("div", { className: "fullscreen-queue-item-title" }, track.title),
            react.createElement("div", { className: "fullscreen-queue-item-artist" }, track.artist)
        )
    );

    // Queue Panel Component - 오른쪽 hover 시 재생 대기열 표시
    const QueuePanel = ({ show, isFullscreen }) => {
        const [isHovered, setIsHovered] = useState(false);
        const [currentTrack, setCurrentTrack] = useState(null);
        const [nextTracks, setNextTracks] = useState([]);
        const [recentTracks, setRecentTracks] = useState([]);
        const [activeTab, setActiveTab] = useState('queue'); // 'queue' or 'recent'
        const nextTracksRef = useRef([]);
        const emptyQueueTimerRef = useRef(null);
        const fallbackPlayTimerRef = useRef(null);
        const player = spotify.Player;
        const queueEvents = player.origin?._events;

        const cancelFallbackPlay = useCallback(() => {
            if (fallbackPlayTimerRef.current === null) return;
            timers.clearTimeout(fallbackPlayTimerRef.current);
            fallbackPlayTimerRef.current = null;
        }, []);

        const commitNextTracks = useCallback((tracks, { deferEmpty = false } = {}) => {
            const next = Array.isArray(tracks) ? tracks : [];
            if (deferEmpty && next.length === 0 && nextTracksRef.current.length > 0) {
                if (emptyQueueTimerRef.current) {
                    timers.clearTimeout(emptyQueueTimerRef.current);
                }
                emptyQueueTimerRef.current = timers.setTimeout(() => {
                    emptyQueueTimerRef.current = null;
                    nextTracksRef.current = [];
                    setNextTracks((prev) => prev.length === 0 ? prev : []);
                }, QUEUE_EMPTY_GRACE_MS);
                return;
            }

            if (emptyQueueTimerRef.current) {
                timers.clearTimeout(emptyQueueTimerRef.current);
                emptyQueueTimerRef.current = null;
            }
            nextTracksRef.current = next;
            setNextTracks((prev) => areTrackListsEqual(prev, next) ? prev : next);
        }, []);

        // 재생 대기열 업데이트
        useEffect(() => {
            if (!show || !isFullscreen) return;
            let active = true;

            const updateQueue = (queueData = null) => {
                if (!active || spotify.Player !== player) return;
                try {
                    const playerData = player.data;
                    const queueState = queueData?.data || spotify.Queue || {};
                    const prevSource = queueState.prevTracks || spotify.Queue?.prevTracks || [];

                    // 현재 재생 중인 곡
                    if (playerData?.item) {
                        const meta = playerData.item.metadata;
                        const currentTrackData = {
                            title: meta?.title || "Unknown",
                            artist: meta?.artist_name || "Unknown",
                            image: meta?.image_url || "",
                            uri: playerData.item.uri
                        };
                        setCurrentTrack((prev) => areTrackInfoEqual(prev, currentTrackData) ? prev : currentTrackData);
                    }

                    commitNextTracks(getNextQueueTracks(queueState), { deferEmpty: true });
                    const recent = getRecentQueueTracks(prevSource);
                    setRecentTracks((current) => areTrackListsEqual(current, recent) ? current : recent);
                } catch (e) {
                    console.warn('[FullscreenOverlay] Queue update failed:', e);
                }
            };

            updateQueue();
            // 백업용 interval (이벤트 기반 업데이트가 주, interval은 보조)
            const interval = timers.setInterval(updateQueue, 5000);

            // 곡 변경 이벤트 리스너 (주요 업데이트 트리거)
            const songChangeHandler = () => updateQueue();
            player.addEventListener("songchange", songChangeHandler);
            const queueUpdateHandler = (payload) => updateQueue(payload);
            queueEvents?.addListener?.("queue_update", queueUpdateHandler);

            return () => {
                active = false;
                cancelFallbackPlay();
                timers.clearInterval(interval);
                if (emptyQueueTimerRef.current) {
                    timers.clearTimeout(emptyQueueTimerRef.current);
                    emptyQueueTimerRef.current = null;
                }
                player.removeEventListener("songchange", songChangeHandler);
                queueEvents?.removeListener?.("queue_update", queueUpdateHandler);
            };
        }, [show, isFullscreen, player, queueEvents, commitNextTracks, cancelFallbackPlay]);

        // 곡 클릭 시 재생
        const handleTrackClick = useCallback((track) => {
            if (!track?.uri || player !== spotify.Player) return;
            cancelFallbackPlay();
            try {
                const tracks = nextTracksRef.current;
                let selectedIndex = tracks.findIndex((entry) => entry.key === track.key);
                if (selectedIndex < 0 && track.uid) {
                    selectedIndex = tracks.findIndex((entry) => entry.uid === track.uid);
                }
                if (selectedIndex < 0) {
                    selectedIndex = tracks.findIndex((entry) => entry.uri === track.uri);
                }
                if (selectedIndex >= 0) {
                    const selected = tracks[selectedIndex];
                    const selectedTrackData = {
                        title: selected.title || "Unknown",
                        artist: selected.artist || "Unknown",
                        image: selected.image || "",
                        uri: selected.uri
                    };
                    setCurrentTrack((prev) => areTrackInfoEqual(prev, selectedTrackData) ? prev : selectedTrackData);
                    commitNextTracks(tracks.slice(selectedIndex + 1));
                }
                const contextUri = track.canPlayInContext ? track.contextUri : "";
                if (contextUri) {
                    const options = { skipTo: { uri: track.uri } };
                    if (track.uid) {
                        options.skipTo.uid = track.uid;
                    }
                    player.playUri(contextUri, {}, options);
                    const fallback = timers.setTimeout(() => {
                        if (fallbackPlayTimerRef.current !== fallback) return;
                        fallbackPlayTimerRef.current = null;
                        if (spotify.Player !== player) return;
                        const activeUri = player.data?.item?.uri || "";
                        if (activeUri !== track.uri) {
                            player.playUri(track.uri);
                        }
                    }, 900);
                    fallbackPlayTimerRef.current = fallback;
                    return;
                }

                player.playUri(track.uri);
            } catch (e) {
                console.warn('[FullscreenOverlay] Failed to play track:', e);
            }
        }, [player, commitNextTracks, cancelFallbackPlay]);

        const upNextTracks = useMemo(
            () => nextTracks.filter((track) => !isRecommendedQueueTrack(track)),
            [nextTracks]
        );
        const recommendedTracks = useMemo(
            () => nextTracks.filter(isRecommendedQueueTrack),
            [nextTracks]
        );

        if (!show || !isFullscreen) return null;

        const renderQueueTabContent = () => react.createElement(react.Fragment, null,
                        // 현재 재생 중
                        currentTrack && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                translate("fullscreen.queue.nowPlaying")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-list" },
                                react.createElement("div", { className: "fullscreen-queue-item current" },
                                    currentTrack.image && react.createElement("img", {
                                        src: currentTrack.image,
                                        className: "fullscreen-queue-item-image"
                                    }),
                                    react.createElement("div", { className: "fullscreen-queue-item-info" },
                                        react.createElement("div", { className: "fullscreen-queue-item-title" }, currentTrack.title),
                                        react.createElement("div", { className: "fullscreen-queue-item-artist" }, currentTrack.artist)
                                    ),
                                    react.createElement("div", { className: "fullscreen-queue-item-playing" },
                                        react.createElement("span", { className: "fullscreen-queue-playing-icon" }, "♪")
                                    )
                                )
                            )
                        ),

                        // 다음 재생 곡들
                        upNextTracks.length > 0 && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                translate("fullscreen.queue.upNext")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-list" },
                                upNextTracks.map((track, idx) =>
                                    renderQueueItem(track, track.key || `next-${track.uid || track.uri || idx}`, handleTrackClick)
                                )
                            )
                        ),

                        // 추천곡
                        recommendedTracks.length > 0 && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                translate("fullscreen.queue.recommended")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-list" },
                                recommendedTracks.map((track, idx) =>
                                    renderQueueItem(track, track.key || `recommended-${track.uid || track.uri || idx}`, handleTrackClick)
                                )
                            )
                        ),

                        // 대기열이 비어있는 경우
                        nextTracks.length === 0 && react.createElement("div", { className: "fullscreen-queue-empty" },
                            translate("fullscreen.queue.empty")
                        )
        );

        const renderRecentTabContent = () => react.createElement(react.Fragment, null,
                        // 최근 재생 곡들
                        recentTracks.length > 0 ? react.createElement("div", { className: "fullscreen-queue-list" },
                            recentTracks.map((track, idx) =>
                                renderQueueItem(track, `recent-${idx}`, handleTrackClick)
                            )
                        ) : react.createElement("div", { className: "fullscreen-queue-empty" },
                            translate("fullscreen.queue.noRecent")
                        )
        );

        return react.createElement("div", {
            className: "fullscreen-queue-wrapper",
            onMouseLeave: () => setIsHovered(false)
        },
            // Hover trigger area (투명한 오른쪽 영역)
            react.createElement("div", {
                className: "fullscreen-queue-trigger-area",
                onMouseEnter: () => setIsHovered(true)
            }),

            // Queue panel (항상 렌더링, visible 클래스로 애니메이션 제어)
            react.createElement("div", {
                className: `fullscreen-queue-panel ${isHovered ? 'visible' : ''}`,
                onMouseEnter: () => setIsHovered(true)
            },
                // Content
                react.createElement("div", { className: "fullscreen-queue-content" },
                    activeTab === 'queue' ? renderQueueTabContent() : renderRecentTabContent()
                ),

                // Footer with tabs (하단에 탭 버튼)
                react.createElement("div", { className: "fullscreen-queue-footer" },
                    react.createElement("button", {
                        className: `fullscreen-queue-tab ${activeTab === 'queue' ? 'active' : ''}`,
                        type: "button",
                        "aria-pressed": activeTab === 'queue',
                        onClick: () => setActiveTab('queue')
                    }, translate("fullscreen.queue.title")),
                    react.createElement("button", {
                        className: `fullscreen-queue-tab ${activeTab === 'recent' ? 'active' : ''}`,
                        type: "button",
                        "aria-pressed": activeTab === 'recent',
                        onClick: () => setActiveTab('recent')
                    }, translate("fullscreen.queue.recentlyPlayed"))
                )
            )
        );
    };

    return QueuePanel;
}
