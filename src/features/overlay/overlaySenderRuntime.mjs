import { createRuntimeEffects } from "../../core/runtimeEffects.mjs";
import { isLyricsReadySnapshotHandled } from "../../lyrics/lyricsReadyPublisher.mjs";

// While nothing answers, probes back off from five seconds to a minute.
// Focus, track changes and the settings page probe sooner.
const SENDER_PROBE_DELAYS = [5000, 10000, 20000, 40000, 60000];
const SENDER_FOREGROUND_PROBE_GAP_MS = 10000;
// Receivers without receipts cannot report lost lyrics (after a restart),
// so returning to Spotify refreshes them at most this often.
const LEGACY_RESEND_GAP_MS = 30000;
export const MAX_OVERLAY_PROBE_STEPS = SENDER_PROBE_DELAYS.length;

export function createOverlaySenderRuntime({
    host, getSpicetify, scheduleSenderBootstrap, debug, resetLyricsDelivery, clearSettingsPolling,
}) {
    const offsetListeners = new WeakMap();
    const runtimeListeners = new WeakMap();
    const createListeners = () => createRuntimeEffects({
        // The old player can already be detached when Spotify replaces it.
        onCleanupError() {},
    });

    return {
        handleConnectionRecovery() {
            const runtimeGeneration = this._runtimeGeneration;
            if (!this.isRuntimeRequestCurrent(runtimeGeneration) || !this.isConnected) return;
            this.clearConnectionRecovery();
            // 가사 요청 자체가 연결을 복구한 경우 현재 큐가 성공 상태를 기록하므로
            // 여기서 같은 payload를 다시 예약하지 않는다.
            if (this.hasCurrentLyricsSend()) return;

            const failure = this._terminalDeliveryFailure;
            if (failure
                && failure.generation === this._deliveryGeneration
                && failure.key === this._deliveryKey) {
                if (failure.reconnectUsed) return;
                failure.reconnectUsed = true;
                const { generation, key } = failure;
                this._connectionRecoveryTimer = setTimeout(() => {
                    if (!this.isRuntimeRequestCurrent(runtimeGeneration) || !this.isConnected) return;
                    this._connectionRecoveryTimer = null;
                    const currentFailure = this._terminalDeliveryFailure;
                    if (this.hasCurrentLyricsSend() || !currentFailure
                        || currentFailure.generation !== generation
                        || currentFailure.key !== key
                        || this._deliveryGeneration !== generation
                        || this._deliveryKey !== key) {
                        return;
                    }
                    this.resendWithNewOffset('reconnect');
                }, 100);
                return;
            }

            this._connectionRecoveryTimer = setTimeout(() => {
                if (!this.isRuntimeRequestCurrent(runtimeGeneration) || !this.isConnected) return;
                this._connectionRecoveryTimer = null;
                if (!this.hasCurrentLyricsSend()) this.resendWithNewOffset('reconnect');
            }, 100);
            this._connectionRecoveryBootstrapTimer = setTimeout(() => {
                if (!this.isRuntimeRequestCurrent(runtimeGeneration) || !this.isConnected) return;
                this._connectionRecoveryBootstrapTimer = null;
                scheduleSenderBootstrap(0);
            }, 150);
        },

        isRuntimeRequestCurrent(generation, port = this.port) {
            return this._runtimeListenerSetup && this.enabled
                && this._runtimeGeneration === generation && this.port === port;
        },

        clearConnectionRecovery() {
            if (this._connectionRecoveryTimer !== null) clearTimeout(this._connectionRecoveryTimer);
            if (this._connectionRecoveryBootstrapTimer !== null) clearTimeout(this._connectionRecoveryBootstrapTimer);
            this._connectionRecoveryTimer = null;
            this._connectionRecoveryBootstrapTimer = null;
        },

        getProbeDelay() {
            const step = Math.max(0, this._probeFailures - 1);
            return SENDER_PROBE_DELAYS[Math.min(step, SENDER_PROBE_DELAYS.length - 1)];
        },

        // Probe soon when the user is likely to have just started the receiver.
        requestProbe() {
            if (!this.enabled || this.isConnected || !this._runtimeListenerSetup) return;
            if (Date.now() - this._lastProbeAt < SENDER_FOREGROUND_PROBE_GAP_MS) return;
            this.scheduleConnectionCheck(0);
        },

        handleForeground() {
            if (!this.enabled) return;
            if (!this.isConnected) {
                this.requestProbe();
                return;
            }
            if (this._receiverProtocol >= 2 || !this._lastTrackInfo) return;
            const now = Date.now();
            if (now - this._lastLegacyResendAt < LEGACY_RESEND_GAP_MS) return;
            this._lastLegacyResendAt = now;
            debug(this.LOG_TAG, '창 활성화 - 가사 재전송');
            this.resendWithNewOffset('foreground');
        },

        setupOffsetListener() {
            if (this._offsetListenerSetup) return;
            this._offsetListenerSetup = true;
            const document = host.document ?? globalThis.document;
            const player = getSpicetify().Player;
            const effects = createListeners();
            offsetListeners.set(this, { effects, player });

            this._storageListener = ({ key }) => {
                if (key?.startsWith('lyrics-delay:')) {
                    this.resendWithNewOffset('lyrics-delay', { trackUri: key.slice('lyrics-delay:'.length) });
                } else if (key === 'ivLyrics:overlay-trim-metadata' && this.USES_DISPLAY_METADATA) {
                    this.refreshMetadata();
                }
            };

            this._delayChangedListener = ({ detail }) => {
                this.resendWithNewOffset('lyrics-delay', detail?.trackUri ? { trackUri: detail.trackUri } : null);
            };

            this._offsetChangedListener = (event) => {
                const reason = event.type === 'ivLyrics:global-offset-changed' ? 'global-offset' : 'offset-event';
                this.resendWithNewOffset(reason, event.detail || null);
            };

            // ivLyrics 페이지에서 가사가 준비되면 오버레이로 전송
            this._lyricsReadyListener = (e) => {
                if (!this.enabled || isLyricsReadySnapshotHandled(e)) return;
                const detail = e.detail || {};
                const { trackInfo, lyrics } = detail;
                if (trackInfo) {
                    debug(this.LOG_TAG, '가사 준비 이벤트 수신:', {
                        uri: trackInfo.uri,
                        title: trackInfo.title,
                        lines: lyrics?.length || 0
                    });
                    this.sendLyrics(trackInfo, lyrics || [], false, 'lyrics-ready', {
                        provider: detail.provider,
                        lyricsType: detail.lyricsType,
                        playbackPreferences: detail.playbackPreferences,
                        displayMode1: detail.displayMode1,
                        displayMode2: detail.displayMode2,
                        detectedLanguage: detail.detectedLanguage,
                        pronunciationNotation: detail.pronunciationNotation,
                        translationTargetLanguage: detail.translationTargetLanguage,
                        translationStyle: detail.translationStyle,
                        translationSourceText: detail.translationSourceText,
                        presentationComplete: detail.presentationComplete
                    });
                }
            };

            // Returning to Spotify reconnects a receiver started meanwhile, and
            // refreshes lyrics on receivers that cannot report losing them.
            this._visibilityChangeListener = () => {
                if (document?.visibilityState === 'visible') this.handleForeground();
            };
            this._focusListener = () => {
                this.handleForeground();
            };

            // 트랙 변경 감지
            this._songChangeListener = () => {
                const previousUri = this._lastTrackInfo?.uri || this.lastSentUri || null;
                this.invalidateLyricsPresentation();
                this._offsetCache = {};
                this.invalidateProgress();

                // 오버레이 활성화 상태가 아니면 스킵
                if (!this.enabled) return;
                // 현재 곡 조회는 별도 OverlayService의 단일 songchange 리스너가 담당한다.
                debug(this.LOG_TAG, '곡 변경 - 전송 상태 초기화:', previousUri);
                this.requestProbe();
            };

            try {
                effects.listen(host, 'storage', this._storageListener);
                effects.listen(host, 'ivLyrics:delay-changed', this._delayChangedListener);
                effects.listen(host, 'ivLyrics:offset-changed', this._offsetChangedListener);
                effects.listen(host, 'ivLyrics:global-offset-changed', this._offsetChangedListener);
                effects.listen(host, 'ivLyrics:lyrics-ready', this._lyricsReadyListener);
                effects.listen(document, 'visibilitychange', this._visibilityChangeListener);
                effects.listen(host, 'focus', this._focusListener);
                effects.listen(player, 'songchange', this._songChangeListener);
            } catch (error) {
                this.teardownOffsetListener();
                throw error;
            }
        },

        teardownOffsetListener() {
            if (!this._offsetListenerSetup) return;
            this._offsetListenerSetup = false;
            const owner = offsetListeners.get(this);
            offsetListeners.delete(this);
            owner?.effects.dispose();
            this._storageListener = null;
            this._delayChangedListener = null;
            this._offsetChangedListener = null;
            this._lyricsReadyListener = null;
            this._visibilityChangeListener = null;
            this._focusListener = null;
            if (typeof owner?.player?.removeEventListener === 'function') this._songChangeListener = null;
        },

        scheduleConnectionCheck(delay = 1000) {
            if (this._connectionCheckTimer) {
                clearTimeout(this._connectionCheckTimer);
            }

            const runtimeGeneration = this._runtimeGeneration;
            if (!this.isRuntimeRequestCurrent(runtimeGeneration)) {
                this._connectionCheckTimer = null;
                return;
            }

            this._connectionCheckTimer = setTimeout(() => {
                if (!this.isRuntimeRequestCurrent(runtimeGeneration)) return;
                this._connectionCheckTimer = null;
                this.checkConnection();
            }, delay);
        },

        syncRuntimeState() {
            const enabled = !!this.enabled;
            if (this._runtimeEnabledState === enabled) {
                return;
            }

            this._runtimeEnabledState = enabled;
            this._runtimeGeneration += 1;
            this._activeProbe = null;
            this.clearConnectionRecovery();
            if (enabled) {
                this._probeFailures = 0;
                this.startProgressSync();
                this.setupOffsetListener();
                this.scheduleConnectionCheck();
                scheduleSenderBootstrap();
            } else {
                this.stopProgressSync();
                this.teardownOffsetListener();
                clearSettingsPolling(this);
                this._deliveryGeneration += 1;
                resetLyricsDelivery(this);
                this._lastTrackInfo = null;
                this._lastLyrics = null;
                this._offsetCache = {};
                this.isConnected = false;
            }
        },

        setupRuntimeListener() {
            if (this._runtimeListenerSetup) return;
            this._runtimeGeneration += 1;
            this._runtimeListenerSetup = true;
            const effects = createListeners();
            runtimeListeners.set(this, effects);

            this._runtimeStorageListener = () => {
                this.syncRuntimeState();
            };
            this._runtimeEventListener = () => {
                this.syncRuntimeState();
            };

            try {
                effects.listen(host, 'storage', this._runtimeStorageListener);
                effects.listen(host, 'ivLyrics', this._runtimeEventListener);
            } catch (error) {
                this.teardownRuntimeListener();
                throw error;
            }
        },

        teardownRuntimeListener() {
            if (!this._runtimeListenerSetup) return;
            this._runtimeListenerSetup = false;
            const effects = runtimeListeners.get(this);
            runtimeListeners.delete(this);
            effects?.dispose();
            this._runtimeStorageListener = null;
            this._runtimeEventListener = null;
            if (this._connectionCheckTimer) {
                clearTimeout(this._connectionCheckTimer);
                this._connectionCheckTimer = null;
            }
        },

        init() {
            if (this._initialized) return;
            this._initialized = true;
            this.setupRuntimeListener();
            this.syncRuntimeState();
            debug(this.LOG_TAG, 'Initialized in Extension');
        },

        destroy() {
            if (this._runtimeListenerSetup || this._initialized) {
                this._runtimeGeneration += 1;
                this._deliveryGeneration += 1;
            }
            resetLyricsDelivery(this);
            this._activeProbe = null;
            this.clearConnectionRecovery();
            this.stopProgressSync();
            this.teardownOffsetListener();
            this.teardownRuntimeListener();
            clearSettingsPolling(this);
            this._isConnected = false;
            this._initialized = false;
            this._runtimeEnabledState = undefined;
        }
    };
}
