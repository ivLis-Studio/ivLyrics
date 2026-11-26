import { getPlaybackPositionService } from "../../core/playbackPositionService.mjs";
import { createRuntimeEffects } from "../../core/runtimeEffects.mjs";
import { getMountedLyricsPage } from "../../spicetify/lyricsPageEffects.mjs";
import { isIvLyricsRoute } from "../../spicetify/lyricsRoute.mjs";
import { getRuntimeService, publishRuntimeService, releaseRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { getLyricLanguageMode, hasStyleDependentLyricTranslation, matchesLyricTranslationStyle } from "../../lyrics/lyricPresentationIdentity.mjs";
import { LRC_RED_WORD_SYNC_SOURCE } from "../../lyrics/lyricsTimingMerge.mjs";
import { LYRICS_PROVIDER_SELECTION_CHANGED } from "../../lyrics/lyricsProviderRequests.mjs";
import { LOCAL_LYRICS_UPDATED_EVENT } from "../../lyrics/localLyricsStore.mjs";
import { INTERFACE_LANGUAGE_CHANGED } from "../../i18n/interfaceLanguage.mjs";

const overlayStartupKey = Symbol.for("ivLyrics.overlayServiceStartup");
const overlayServiceName = "ivLyricsOverlayService";
const INITIAL_RETRY_MS = 300;
const GLOBAL_PRESENTATION_SETTINGS = new Set([
    "translate:target-language", "translate:pronunciation-notation",
    "translate:detect-language-override", "karaoke-mode-enabled",
]);

export default function OverlayServiceExtension() {
    const host = window;
    const startup = host[overlayStartupKey] ??= { mount: null, retry: null, delay: INITIAL_RETRY_MS };
    if (startup.mount) return;

    const getService = name => getRuntimeService(name, host);
    const readLyricsService = () => getService("LyricsService");
    const readOverlaySender = () => getService("OverlaySender");
    const readHelperSender = () => getService("lyricsHelperSender");
    const getHistory = () => host.Spicetify?.Platform?.History;

    function retryStartup() {
        if (startup.retry) return;
        const pending = { handle: null };
        startup.retry = pending;
        pending.handle = setTimeout(() => {
            if (startup.retry !== pending) return;
            startup.retry = null;
            OverlayServiceExtension();
        }, startup.delay);
        startup.delay = Math.min(startup.delay * 2, 2000);
    }

    const player = host.Spicetify?.Player;
    if (typeof player?.addEventListener !== "function" || typeof readLyricsService()?.getFullLyrics !== "function"
        || !readOverlaySender() || !readHelperSender()) {
        retryStartup();
        return;
    }

    if (startup.retry) {
        clearTimeout(startup.retry.handle);
        startup.retry = null;
    }
    const mount = {};
    startup.mount = mount;
    const releaseMount = () => {
        if (startup.mount === mount) startup.mount = null;
    };
    try {
        mountOverlayService({
            host, document, player, getHistory, readLyricsService, readOverlaySender, readHelperSender,
            getAIManager: () => getService("AIAddonManager"), releaseMount,
        });
        startup.delay = INITIAL_RETRY_MS;
    } catch (error) {
        releaseMount();
        console.warn("[ivLyrics] Overlay service startup failed:", error);
        retryStartup();
    }
}

function mountOverlayService({
    host, document, player, getHistory, readLyricsService, readOverlaySender, readHelperSender, getAIManager, releaseMount,
}) {
    const effects = createRuntimeEffects({
        scheduleTimer: setTimeout,
        cancelTimer: clearTimeout,
        onCleanupError: error => console.warn("[ivLyrics] Overlay service cleanup failed:", error),
    });

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
    let lastObservedUri = player.data?.item?.uri || null;
    let lastObservedNarration = false;
    let disposed = false;
    let pageOwnerReleased = false;
    let presentationRevision = 0;
    const getTranslationStyle = () => getAIManager()?.getTranslationStyle?.() || "natural";
    const getLyricsRequestRevision = uri => readLyricsService()?.getLyricsRequestRevision?.(uri);
    const isPresentationCurrent = (context) => {
        if (!context) return true;
        if (hasStyleDependentLyricTranslation(context)
            && !matchesLyricTranslationStyle(context, getTranslationStyle())) return false;

        const preferences = readLyricsService()?.getLyricsPresentationPreferences?.(context.detectedLanguage);
        if (!preferences) return true;
        const matches = (key, source = context) => source[key] == null || source[key] === preferences[key];
        const playback = context.playbackPreferences ?? {};
        return matches("translationTargetLanguage") && matches("pronunciationNotation")
            && (context.detectedLanguage === undefined || (matches("displayMode1") && matches("displayMode2")))
            && matches("karaokeEnabled", playback) && matches("configuredSourceLanguage", playback);
    };

    const finishChain = (chain) => {
        if (scheduledChain?.id === chain.id) {
            scheduledChain = null;
        }
    };

    const getCurrentTrack = () => {
        const playback = getPlaybackPositionService(host);
        const snapshot = playback?.getPlayerPlaybackSnapshot?.() || null;
        if (snapshot?.uri === "") return null;
        const item = playback?.resolveStablePlaybackTrack?.(null, snapshot) || null;
        if (snapshot?.djNarration === true && snapshot.uri) {
            const narration = item?.uri === snapshot.uri ? item : null;
            return {
                uri: snapshot.uri,
                title: narration?.metadata?.title || narration?.name || "Spotify DJ",
                artist: narration?.metadata?.artist_name || "",
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
            duration: snapshot?.duration || host.Spicetify?.Player?.getDuration?.() || 0,
            playbackId: snapshot?.playbackId || null,
            isDjNarration: false
        };
    };

    const connectedSenders = () =>
        [readOverlaySender(), readHelperSender()].filter(sender => sender?.enabled && sender.isConnected);
    const matchesDelivery = (sender, trackInfo) => sender.lastDeliveredUri === trackInfo.uri
        && (sender.lastDeliveredIsDjNarration === true) === trackInfo.isDjNarration
        && (trackInfo.isDjNarration || isPresentationCurrent(sender._lastPresentationContext));

    const sendEmptyLyricsForDjNarration = (trackInfo, senders) => Promise.allSettled(
        senders.filter(sender => !matchesDelivery(sender, trackInfo))
            .map(sender => sender.sendLyrics(trackInfo, [], true, "dj-narration"))
    );

    const getSharedPresentation = (trackUri) => {
        const snapshot = readLyricsService()?.getLyricsSnapshot?.(trackUri);
        if (snapshot?.trackUri !== trackUri
            || !Array.isArray(snapshot.displayLyrics)
            || snapshot.displayLyrics.length === 0) {
            return null;
        }
        return snapshot;
    };

    const sendSharedPresentation = async (trackInfo, snapshot, sendReason = 'shared-snapshot') => {
        if (!snapshot || typeof readLyricsService()?.sendLyricsSnapshotToConsumers !== 'function') {
            return false;
        }
        return readLyricsService().sendLyricsSnapshotToConsumers(trackInfo, snapshot, {
            sendToOverlay: true,
            sendReason
        });
    };

    const hasActivePresentationOwner = () => {
        const pathname = getHistory()?.location?.pathname;
        // 같은 경로에서 페이지 인스턴스가 교체되면 이전 인스턴스의 release가
        // 먼저 도착할 수 있다. 새로 마운트된 인스턴스가 있으면 소유권을 유지한다.
        const mountedPage = getMountedLyricsPage(host)?._isComponentMounted === true;
        return mountedPage || (!pageOwnerReleased && isIvLyricsRoute(pathname))
            || document.body?.classList?.contains("ivlyrics-panel-lyrics-active");
    };

    // 이전 곡 AI 요청이 느리더라도 다음 곡 동기화를 막지 않는다. 각 URI의
    // fallback은 한 번만 시작하고, sender의 stale-track guard가 늦은 결과를 버린다.
    const startFallbackRequest = (trackInfo, { skipTranslation = false } = {}) => {
        const requestKey = `${trackInfo.uri}:${skipTranslation ? 'original' : 'translated'}`;
        const style = getTranslationStyle();
        const revision = getLyricsRequestRevision(trackInfo.uri);
        const settingsRevision = presentationRevision;
        const isSameRequest = entry => entry?.settingsRevision === settingsRevision
            && entry.style === style && entry.revision === revision;
        const isRequestCurrent = () => !disposed && presentationRevision === settingsRevision;
        const existing = fallbackRequests.get(requestKey);
        if (isSameRequest(existing)) return existing.request;

        const original = !skipTranslation
            ? fallbackRequests.get(`${trackInfo.uri}:original`)
            : null;
        const originalRequest = isSameRequest(original) ? original.request : null;
        const request = Promise.resolve(originalRequest).then(() => {
            const currentTrack = getCurrentTrack();
            if (!isRequestCurrent() || currentTrack?.uri !== trackInfo.uri
                || currentTrack.isDjNarration || connectedSenders().length === 0
                || getTranslationStyle() !== style || getLyricsRequestRevision(trackInfo.uri) !== revision) return;
            // 원문 보충이 늦게 끝나 번역 스냅샷을 무효화하지 않도록 같은 곡의
            // 원문 요청 뒤에 이어 실행한다. 다른 곡의 요청은 기다리지 않는다.
            if (originalRequest) {
                if (hasActivePresentationOwner()) {
                    schedule(0);
                    return;
                }
                const snapshot = getSharedPresentation(trackInfo.uri);
                if (isPresentationCurrent(snapshot) && snapshot?.presentationComplete !== false
                    && connectedSenders().every(sender => matchesDelivery(sender, trackInfo))) return;
            }
            return readLyricsService().getFullLyrics(trackInfo, {
                sendToOverlay: true, skipTranslation, isRequestCurrent
            });
        }).catch((error) => {
            console.error("[OverlayService] 현재 곡 가사 동기화 실패:", error);
        }).finally(() => {
            if (fallbackRequests.get(requestKey)?.request === request) {
                fallbackRequests.delete(requestKey);
            }
        });

        fallbackRequests.set(requestKey, { style, revision, settingsRevision, request });
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
                chain.previousNarration = lastObservedUri === previousUri && lastObservedNarration;
            }
        } else {
            chain = {
                id: ++nextChainId,
                previousUri: previousUri || null,
                previousNarration: lastObservedUri === previousUri && lastObservedNarration,
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
                !chain.observedTarget
                && chain.previousUri
                && trackInfo.uri === chain.previousUri
                && trackInfo.isDjNarration === chain.previousNarration
                && Date.now() < chain.metadataDeadline
            ) {
                schedule(RETRY_DELAY_MS, null, chain);
                return;
            }
            chain.observedTarget = true;
            lastObservedUri = trackInfo.uri;
            lastObservedNarration = trackInfo.isDjNarration;

            const senders = connectedSenders();
            // 연결된 소비자가 없으면 번역을 시작하지 않는다. 재연결 시 sender가
            // schedule()을 호출해 현재 표시 결과를 다시 확인한다.
            if (senders.length === 0) {
                finishChain(chain);
                return;
            }

            if (trackInfo.isDjNarration) {
                if (chain.narrationSentUri !== trackInfo.uri) {
                    chain.narrationSentUri = trackInfo.uri;
                    await sendEmptyLyricsForDjNarration(trackInfo, senders);
                }
                if (Date.now() < chain.metadataDeadline) schedule(RETRY_DELAY_MS, null, chain);
                else finishChain(chain);
                return;
            }

            const snapshot = getSharedPresentation(trackInfo.uri);
            const delivered = senders.every(sender => matchesDelivery(sender, trackInfo));
            const presentationCurrent = isPresentationCurrent(snapshot);
            const sharedPresentation = presentationCurrent ? snapshot : null;
            const presentationIncomplete = !presentationCurrent || sharedPresentation?.presentationComplete === false;
            // 원문 전송 성공은 번역/발음 생성 완료를 의미하지 않는다.
            if (delivered && !presentationIncomplete) {
                finishChain(chain);
                return;
            }
            if (sharedPresentation && !delivered) {
                await sendSharedPresentation(trackInfo, sharedPresentation);
                if (disposed || scheduledChain?.id !== chain.id) return;
                const currentTrack = getCurrentTrack();
                if (currentTrack?.uri !== trackInfo.uri || currentTrack.isDjNarration) {
                    schedule(0, null, chain);
                    return;
                }
                if (getSharedPresentation(trackInfo.uri) !== sharedPresentation
                    || !isPresentationCurrent(sharedPresentation)) {
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
        const timingUpgrade = snapshot.source === LRC_RED_WORD_SYNC_SOURCE && snapshot.timingUpgradeApplied;
        if ((!timingUpgrade && !['ivlyrics-page', 'now-playing-panel'].includes(snapshot.source))
            || !trackInfo || trackInfo.isDjNarration || snapshot.trackUri !== trackInfo.uri
            || !isPresentationCurrent(snapshot) || !Array.isArray(snapshot.displayLyrics)
            || snapshot.displayLyrics.length === 0) {
            return;
        }

        // The page publishes lyrics-ready directly. Relay panel and shared timing updates here.
        if (timingUpgrade || snapshot.source === 'now-playing-panel') {
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

    const refreshCurrentPresentation = () => {
        readOverlaySender()?.invalidateLyricsPresentation?.();
        readHelperSender()?.invalidateLyricsPresentation?.();
        // Restart the current-track grace period for a fresh display owner.
        pageGraceUri = null;
        scheduledChain = null;
        schedule(0);
    };

    const schedulePresentationRefresh = () => {
        presentationRevision++;
        if (scheduledChain) scheduledChain.originalFallbackUri = null;
        schedule(0);
    };

    const presentationSettingsChanged = ({ detail }) => {
        const name = detail?.name;
        if (GLOBAL_PRESENTATION_SETTINGS.has(name)) {
            schedulePresentationRefresh();
        } else if (typeof name === "string" && /^translation-mode(?:-2)?:/.test(name)) {
            const trackInfo = getCurrentTrack();
            const snapshot = trackInfo && getSharedPresentation(trackInfo.uri);
            const language = snapshot?.detectedLanguage;
            if (language === undefined || name.endsWith(`:${getLyricLanguageMode(language)}`)) {
                schedulePresentationRefresh();
            }
        }
    };

    const localLyricsUpdated = ({ detail }) => {
        if (!detail?.deleted) return;
        const trackInfo = getCurrentTrack();
        if (trackInfo && !trackInfo.isDjNarration && detail.trackUri === trackInfo.uri) refreshCurrentPresentation();
    };

    const historyListener = () => {
        if (isIvLyricsRoute(getHistory()?.location?.pathname)) {
            pageOwnerReleased = false;
            pageGraceUri = null;
        }
        schedule(0);
    };
    const destroy = () => {
        if (disposed) return;
        disposed = true;
        effects.dispose();
        scheduledChain = null;
        fallbackRequests.clear();
        releaseRuntimeService(overlayServiceName, api, host);
        releaseMount();
    };

    const api = {
        schedule,
        isPresentationCurrent,
        syncNow() {
            schedule(0);
        },
        destroy,
        getState() {
            return {
                initialized: !disposed,
                lastObservedUri,
                scheduledUri: scheduledChain?.previousUri || null,
                inFlight: fallbackRequests.size > 0,
                inFlightUris: [...fallbackRequests.keys()]
            };
        }
    };

    effects.add(() => {
        if (scheduledTimer) clearTimeout(scheduledTimer.handle);
        scheduledTimer = null;
    });
    try {
        effects.listen(player, "songchange", songChangeListener);
        effects.listen(host, "ivLyrics:shared-lyrics-updated", sharedLyricsListener);
        effects.listen(host, "ivLyrics:presentation-owner-released", presentationOwnerReleasedListener);
        effects.listen(host, LYRICS_PROVIDER_SELECTION_CHANGED, refreshCurrentPresentation);
        effects.listen(host, LOCAL_LYRICS_UPDATED_EVENT, localLyricsUpdated);
        effects.listen(host, "ivLyrics", presentationSettingsChanged);
        effects.listen(host, INTERFACE_LANGUAGE_CHANGED, schedulePresentationRefresh);
        const history = getHistory();
        effects.subscribe(handler => history?.listen?.(handler), historyListener);
        effects.subscribe(handler => getAIManager()?.on?.("translation:style:changed", handler), schedulePresentationRefresh);

        // Populate the current track when startup misses its songchange event.
        schedule(1200);
        publishRuntimeService(overlayServiceName, api, host);
    } catch (error) {
        destroy();
        throw error;
    }
}
