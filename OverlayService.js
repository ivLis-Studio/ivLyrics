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
        typeof window.Spicetify?.Player?.addEventListener === 'function'
        && typeof window.LyricsService?.getFullLyrics === 'function'
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
    let disposed = false;
    let pageOwnerReleased = false;
    let historyUnsubscribe = null;

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
        // 같은 경로에서 페이지 인스턴스가 교체되면 이전 인스턴스의 release가
        // 먼저 도착할 수 있다. 새로 마운트된 인스턴스가 있으면 소유권을 유지한다.
        const mountedPage = window.lyricContainer?._isComponentMounted === true;
        return mountedPage || (!pageOwnerReleased && pathname.includes("/ivLyrics"))
            || document.body?.classList?.contains("ivlyrics-panel-lyrics-active");
    };

    // 이전 곡 AI 요청이 느리더라도 다음 곡 동기화를 막지 않는다. 각 URI의
    // fallback은 한 번만 시작하고, sender의 stale-track guard가 늦은 결과를 버린다.
    const startFallbackRequest = (trackInfo, { skipTranslation = false } = {}) => {
        const requestKey = `${trackInfo.uri}:${skipTranslation ? 'original' : 'translated'}`;
        if (fallbackRequests.has(requestKey)) {
            return fallbackRequests.get(requestKey);
        }

        const originalRequest = !skipTranslation
            ? fallbackRequests.get(`${trackInfo.uri}:original`)
            : null;
        const request = Promise.resolve(originalRequest).then(() => {
            if (disposed || getCurrentTrack()?.uri !== trackInfo.uri
                || !hasCurrentDelivery(trackInfo.uri).anyConnected) return;
            // 원문 보충이 늦게 끝나 번역 스냅샷을 무효화하지 않도록 같은 곡의
            // 원문 요청 뒤에 이어 실행한다. 다른 곡의 요청은 기다리지 않는다.
            if (originalRequest) {
                if (hasActivePresentationOwner()) {
                    schedule(0);
                    return;
                }
                if (getSharedPresentation(trackInfo.uri)?.presentationComplete !== false
                    && hasCurrentDelivery(trackInfo.uri).complete) return;
            }
            return window.LyricsService.getFullLyrics(trackInfo, {
                sendToOverlay: true, skipTranslation
            });
        }).catch((error) => {
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
        if (disposed) return;
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
            if (disposed || scheduledChain?.id !== chain.id) return;

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
            // 연결된 소비자가 없으면 번역을 시작하지 않는다. 재연결 시 sender가
            // schedule()을 호출해 현재 표시 결과를 다시 확인한다.
            if (!delivery.anyEnabled || !delivery.anyConnected) {
                finishChain(chain);
                return;
            }

            if (trackInfo.isDjNarration) {
                try {
                    if (!delivery.complete) await sendEmptyLyricsForDjNarration(trackInfo);
                } finally {
                    finishChain(chain);
                }
                return;
            }

            const sharedPresentation = getSharedPresentation(trackInfo.uri);
            const presentationIncomplete = sharedPresentation?.presentationComplete === false;
            // 원문 전송 성공은 번역/발음 생성 완료를 의미하지 않는다.
            if (delivery.complete && !presentationIncomplete) {
                finishChain(chain);
                return;
            }
            if (sharedPresentation && !delivery.complete) {
                await sendSharedPresentation(trackInfo, sharedPresentation);
                if (disposed || scheduledChain?.id !== chain.id) return;
                if (getCurrentTrack()?.uri !== trackInfo.uri) {
                    schedule(0, null, chain);
                    return;
                }
                if (getSharedPresentation(trackInfo.uri) !== sharedPresentation) {
                    schedule(0, null, chain);
                    return;
                }
            }
            if (sharedPresentation && !presentationIncomplete) {
                finishChain(chain);
                return;
            }

            // ivLyrics 페이지나 우측 패널이 이미 동일 곡의 표시 결과를 만들고 있으면
            // 중복 번역 없이 기다린다. 원문을 보충한 뒤에도 미완성 결과를 관찰해
            // 페이지/패널이 닫히면 전역 서비스가 번역을 이어받는다.
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
                if (!sharedPresentation && chain.originalFallbackUri !== trackInfo.uri) {
                    chain.originalFallbackUri = trackInfo.uri;
                    startFallbackRequest(trackInfo, { skipTranslation: true });
                }
                schedule(PRESENTATION_RETRY_MS, null, chain);
                return;
            }

            pageGraceUri = null;
            startFallbackRequest(trackInfo, { skipTranslation: false });
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
        if (!['ivlyrics-page', 'now-playing-panel'].includes(snapshot.source)
            || !trackInfo || snapshot.trackUri !== trackInfo.uri
            || !Array.isArray(snapshot.displayLyrics)
            || snapshot.displayLyrics.length === 0) {
            return;
        }

        // 페이지는 lyrics-ready가 직접 전송한다. 패널의 표시 결과만 중계한다.
        if (snapshot.source === 'now-playing-panel') {
            void sendSharedPresentation(trackInfo, snapshot, 'shared-snapshot-update');
        } else if (document.body?.classList?.contains('ivlyrics-page-active')) {
            pageOwnerReleased = false;
        }
        schedule(0);
    };

    const presentationOwnerReleasedListener = () => {
        pageOwnerReleased = true;
        schedule(0);
    };

    const historyListener = () => {
        if (Spicetify.Platform?.History?.location?.pathname?.includes('/ivLyrics')) {
            pageOwnerReleased = false;
            pageGraceUri = null;
        }
        schedule(0);
    };

    const destroy = () => {
        disposed = true;
        if (scheduledTimer) {
            clearTimeout(scheduledTimer.handle);
            scheduledTimer = null;
        }
        Spicetify.Player.removeEventListener?.("songchange", songChangeListener);
        window.removeEventListener("ivLyrics:shared-lyrics-updated", sharedLyricsListener);
        window.removeEventListener("ivLyrics:presentation-owner-released", presentationOwnerReleasedListener);
        historyUnsubscribe?.();
        historyUnsubscribe = null;
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
    window.addEventListener("ivLyrics:presentation-owner-released", presentationOwnerReleasedListener);
    if (typeof Spicetify.Platform?.History?.listen === 'function') {
        const unsubscribe = Spicetify.Platform.History.listen(historyListener);
        if (typeof unsubscribe === 'function') historyUnsubscribe = unsubscribe;
    }

    // Extension이 늦게 로드되어 songchange를 놓친 경우에도 현재 곡을 보충한다.
    schedule(1200);
})();
