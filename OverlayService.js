// ============================================
// ivLyrics Overlay Service Extension
// 현재 페이지와 관계없이 재생 중인 곡을 오버레이/헬퍼에 전달
// ============================================

(function OverlayServiceExtension() {
    "use strict";

    const MODULE_KEY = "__ivLyricsOverlayServiceModule";
    const moduleState = window[MODULE_KEY] || (window[MODULE_KEY] = {
        initialized: false,
        waitTimer: null
    });

    const dependenciesReady = () => (
        !!window.Spicetify?.Player
        && !!window.LyricsService?.getFullLyrics
        && !!window.OverlaySender
        && !!window.lyricsHelperSender
    );

    if (!dependenciesReady()) {
        if (!moduleState.waitTimer) {
            moduleState.waitTimer = setTimeout(() => {
                moduleState.waitTimer = null;
                OverlayServiceExtension();
            }, 300);
        }
        return;
    }

    moduleState.waitTimer = null;
    if (moduleState.initialized) return;
    moduleState.initialized = true;

    const METADATA_WAIT_MS = 4000;
    const PAGE_DELIVERY_GRACE_MS = 8000;
    const RETRY_DELAY_MS = 150;
    const PRESENTATION_RETRY_MS = 500;

    let scheduledTimer = null;
    let scheduledChain = null;
    const fallbackRequests = new Map();
    let nextChainId = 0;
    let pageGraceUri = null;
    let pageGraceUntil = 0;
    let lastObservedUri = Spicetify.Player.data?.item?.uri || null;

    const finishChain = (chain) => {
        if (scheduledChain?.id === chain.id) {
            scheduledChain = null;
        }
    };

    const getCurrentTrack = () => {
        const snapshot = window.Utils?.getPlayerPlaybackSnapshot?.() || null;
        const item = window.Utils?.resolveStablePlaybackTrack?.(null, snapshot) || null;
        if (snapshot?.djNarration === true && snapshot.uri) {
            return {
                uri: snapshot.uri,
                title: item?.metadata?.title || item?.name || "Spotify DJ",
                artist: item?.metadata?.artist_name || "",
                duration: snapshot.duration || 0,
                playbackId: snapshot.playbackId || null,
                isDjNarration: true
            };
        }

        const uri = item?.uri;
        const title = item?.metadata?.title || item?.name || "";
        const artist = item?.metadata?.artist_name
            || item?.artists?.map(artistItem => artistItem.name).filter(Boolean).join(", ")
            || "";

        if (!uri || !title) return null;
        return {
            uri,
            title,
            artist,
            duration: snapshot?.duration || Spicetify.Player.getDuration?.() || 0,
            playbackId: snapshot?.playbackId || null,
            isDjNarration: false
        };
    };

    const sendEmptyLyricsForDjNarration = async (trackInfo) => {
        const deliveries = [];
        if (window.OverlaySender?.enabled) {
            deliveries.push(window.OverlaySender.sendLyrics(
                trackInfo,
                [],
                true,
                "dj-narration"
            ));
        }
        if (window.lyricsHelperSender?.enabled) {
            deliveries.push(window.lyricsHelperSender.sendLyrics(
                trackInfo,
                [],
                true,
                "dj-narration"
            ));
        }
        await Promise.allSettled(deliveries);
    };

    const hasCurrentDelivery = (trackUri) => {
        const overlaySender = window.OverlaySender;
        const helperSender = window.lyricsHelperSender;
        const overlayEnabled = !!overlaySender?.enabled;
        const helperEnabled = !!helperSender?.enabled;
        const overlayConnected = overlayEnabled && !!overlaySender?.isConnected;
        const helperConnected = helperEnabled && !!helperSender?.isConnected;

        return {
            anyEnabled: overlayEnabled || helperEnabled,
            anyConnected: overlayConnected || helperConnected,
            complete: (!overlayConnected || overlaySender.lastDeliveredUri === trackUri)
                && (!helperConnected || helperSender.lastDeliveredUri === trackUri)
        };
    };

    const getSharedPresentation = (trackUri) => {
        const snapshot = window.LyricsService?.getLyricsSnapshot?.(trackUri);
        if (snapshot?.trackUri !== trackUri
            || !Array.isArray(snapshot.displayLyrics)
            || snapshot.displayLyrics.length === 0) {
            return null;
        }
        return snapshot;
    };

    const sendSharedPresentation = async (trackInfo, snapshot, sendReason = 'shared-snapshot') => {
        if (!snapshot || typeof window.LyricsService?.sendLyricsSnapshotToConsumers !== 'function') {
            return false;
        }
        return window.LyricsService.sendLyricsSnapshotToConsumers(trackInfo, snapshot, {
            sendToOverlay: true,
            sendReason
        });
    };

    const hasActivePresentationOwner = () => {
        const pathname = Spicetify.Platform?.History?.location?.pathname || "";
        return pathname.includes("/ivLyrics")
            || document.body?.classList?.contains("ivlyrics-panel-lyrics-active");
    };

    // 이전 곡 AI 요청이 느리더라도 다음 곡 동기화를 막지 않는다. 각 URI의
    // fallback은 한 번만 시작하고, sender의 stale-track guard가 늦은 결과를 버린다.
    const startFallbackRequest = (trackInfo, { skipTranslation = false } = {}) => {
        const requestKey = `${trackInfo.uri}:${skipTranslation ? 'original' : 'translated'}`;
        if (fallbackRequests.has(requestKey)) {
            return fallbackRequests.get(requestKey);
        }

        const request = Promise.resolve(window.LyricsService.getFullLyrics(
            trackInfo,
            { sendToOverlay: true, skipTranslation }
        )).catch((error) => {
            console.error("[OverlayService] 현재 곡 가사 동기화 실패:", error);
        }).finally(() => {
            if (fallbackRequests.get(requestKey) === request) {
                fallbackRequests.delete(requestKey);
            }
        });

        fallbackRequests.set(requestKey, request);
        return request;
    };

    const schedule = (delay = 1200, previousUri = null, existingChain = null) => {
        let chain = existingChain;
        if (chain) {
            if (chain.id !== scheduledChain?.id) {
                return;
            }
        } else if (
            scheduledTimer
            && scheduledChain
            && (!previousUri || !scheduledChain.previousUri
                || previousUri === scheduledChain.previousUri)
        ) {
            chain = scheduledChain;
            if (!chain.previousUri && previousUri) {
                chain.previousUri = previousUri;
            }
        } else {
            chain = {
                id: ++nextChainId,
                previousUri: previousUri || null,
                metadataDeadline: Date.now() + METADATA_WAIT_MS
            };
        }

        if (scheduledTimer) {
            clearTimeout(scheduledTimer.handle);
        }

        const timerHandle = setTimeout(async () => {
            if (scheduledTimer?.handle === timerHandle) {
                scheduledTimer = null;
            }
            if (scheduledChain?.id !== chain.id) return;

            const trackInfo = getCurrentTrack();
            if (!trackInfo) {
                if (Date.now() < chain.metadataDeadline) {
                    schedule(RETRY_DELAY_MS, null, chain);
                } else {
                    finishChain(chain);
                }
                return;
            }

            if (
                chain.previousUri
                && trackInfo.uri === chain.previousUri
                && Date.now() < chain.metadataDeadline
            ) {
                schedule(RETRY_DELAY_MS, null, chain);
                return;
            }
            lastObservedUri = trackInfo.uri;

            const delivery = hasCurrentDelivery(trackInfo.uri);
            if (!delivery.anyEnabled || delivery.complete) {
                finishChain(chain);
                return;
            }

            if (trackInfo.isDjNarration) {
                try {
                    await sendEmptyLyricsForDjNarration(trackInfo);
                } finally {
                    finishChain(chain);
                }
                return;
            }

            const sharedPresentation = getSharedPresentation(trackInfo.uri);
            if (sharedPresentation) {
                await sendSharedPresentation(trackInfo, sharedPresentation);
                finishChain(chain);
                return;
            }

            // 활성화 설정만 켜져 있고 실제 앱/헬퍼가 연결되지 않은 경우에는
            // 표시할 대상이 없으므로 별도의 AI 번역을 만들지 않는다. 연결 복구 시
            // sender가 schedule()을 다시 호출한다.
            if (!delivery.anyConnected) {
                finishChain(chain);
                return;
            }

            // ivLyrics 페이지나 우측 패널이 이미 동일 곡의 표시 결과를 만들고 있으면
            // 그 공유 스냅샷을 기다린다. 제한 시간이 지나도 AI를 다시 호출하지 않고
            // 원문만 보충하여 두 경로의 번역 표현이 달라지는 일을 막는다.
            const presentationOwnerActive = hasActivePresentationOwner();
            if (presentationOwnerActive) {
                if (pageGraceUri !== trackInfo.uri) {
                    pageGraceUri = trackInfo.uri;
                    pageGraceUntil = Date.now() + PAGE_DELIVERY_GRACE_MS;
                }
                if (Date.now() < pageGraceUntil) {
                    schedule(PRESENTATION_RETRY_MS, null, chain);
                    return;
                }
            }

            startFallbackRequest(trackInfo, {
                skipTranslation: presentationOwnerActive
            });
            finishChain(chain);
        }, Math.max(0, Number(delay) || 0));

        scheduledChain = chain;
        scheduledTimer = { handle: timerHandle, chainId: chain.id };
    };

    const songChangeListener = () => {
        const previousUri = lastObservedUri;
        schedule(RETRY_DELAY_MS, previousUri);
    };

    const sharedLyricsListener = (event) => {
        const snapshot = event.detail || {};
        const trackInfo = getCurrentTrack();
        // ivLyrics 페이지와 LyricsService 자체 결과는 기존 lyrics-ready/direct
        // 전송 경로가 담당한다. 별도 이벤트 발행이 없는 패널 결과만 이어 준다.
        if (snapshot.source !== 'now-playing-panel'
            || !trackInfo || snapshot.trackUri !== trackInfo.uri
            || !Array.isArray(snapshot.displayLyrics)
            || snapshot.displayLyrics.length === 0) {
            return;
        }

        void sendSharedPresentation(trackInfo, snapshot, 'shared-snapshot-update');
    };

    const destroy = () => {
        if (scheduledTimer) {
            clearTimeout(scheduledTimer.handle);
            scheduledTimer = null;
        }
        Spicetify.Player.removeEventListener("songchange", songChangeListener);
        window.removeEventListener("ivLyrics:shared-lyrics-updated", sharedLyricsListener);
        scheduledChain = null;
        fallbackRequests.clear();
        moduleState.initialized = false;
    };

    const api = {
        schedule,
        syncNow() {
            schedule(0);
        },
        destroy,
        getState() {
            return {
                initialized: moduleState.initialized,
                lastObservedUri,
                scheduledUri: scheduledChain?.previousUri || null,
                inFlight: fallbackRequests.size > 0,
                inFlightUris: [...fallbackRequests.keys()]
            };
        }
    };

    window.ivLyricsOverlayService = api;
    Spicetify.Player.addEventListener("songchange", songChangeListener);
    window.addEventListener("ivLyrics:shared-lyrics-updated", sharedLyricsListener);

    // Extension이 늦게 로드되어 songchange를 놓친 경우에도 현재 곡을 보충한다.
    schedule(1200);
})();
