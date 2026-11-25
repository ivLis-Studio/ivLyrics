import { readSettingsPersistence } from "../../core/settingsRuntime.mjs";
import { trimTrackMetadataLabel } from "../../core/spotifyTrackMetadata.mjs";
import { isLyricsReadySnapshotHandled } from "../../lyrics/lyricsReadyPublisher.mjs";
import { createOverlayLyricsDelivery } from "./overlayLyricsDelivery.mjs";
import { createOverlayProgress } from "./overlayProgress.mjs";
import { createOverlayTransport } from "./overlayTransport.mjs";

export function createOverlaySenders({
    host, getSpicetify, getSyncOffset, playback, getOverlayProgressIsPlaying,
    resolveSpotifyImageUrl, scheduleSenderBootstrap, debug, lyricPresentation, mapLyricsForSender,
}) {
    const readPersistence = () => readSettingsPersistence(host);

    // The overlay can receive lyrics from several programs at once. Naming this
    // sender lets it keep another program's lyrics while Spotify is paused.
    const OVERLAY_SOURCE_ID = 'ivlyrics';
    // While nothing answers, probes back off from five seconds to a minute.
    // Focus, track changes and the settings page probe sooner.
    const SENDER_PROBE_DELAYS = [5000, 10000, 20000, 40000, 60000];
    const SENDER_FOREGROUND_PROBE_GAP_MS = 10000;
    // Receivers without receipts cannot report lost lyrics (after a restart),
    // so returning to Spotify refreshes them at most this often.
    const LEGACY_RESEND_GAP_MS = 30000;
    const RECEIPT_RESEND_GAP_MS = 5000;

    const resetLyricsDelivery = sender => {
        sender.lastSentUri = null;
        sender.lastSentLyrics = null;
        sender.lastSentOffset = null;
        sender._lastSentDedupeToken = null;
        sender.lastDeliveredUri = null;
        sender.lastDeliveredIsDjNarration = false;
        sender._deliveryKey = null;
        sender._terminalDeliveryFailure = null;
        sender._lastReceiptResendAt = 0;
        sender._pendingLyricsSend = null;
        sender._finishLyricsRetryWait?.();
    };

    const clearSettingsPolling = (target) => {
        if (!target) return;
        if (target._settingsTimer) {
            clearInterval(target._settingsTimer);
            target._settingsTimer = null;
        }
        target._isSettingsOpen = false;
    };

    // Mutable state that each sender owns. The helper inherits the overlay's
    // methods but must never read or write the overlay's state.
    const createSenderState = () => ({
        lastSentUri: null,
        lastSentLyrics: null,
        lastSentOffset: null,
        _lastSentDedupeToken: null,
        lastDeliveredUri: null,
        lastDeliveredIsDjNarration: false,
        _deliveryGeneration: 0,
        _deliveryKey: null,
        _terminalDeliveryFailure: null,
        _lastTrackInfo: null,
        _lastLyrics: null,
        _lastPresentationContext: null,
        _lastPresentationKey: null,
        lastConfigDelay: undefined,
        _offsetCache: {},
        _isConnected: false,
        _receiverProtocol: 1,
        _receiverReplies: 0,
        _activeProbe: null,
        _probeFailures: 0,
        _lastProbeAt: 0,
        _connectionCheckTimer: null,
        _isSettingsOpen: false,
        _settingsTimer: null,
        _worker: null,
        _removeProgressSeekListener: null,
        _isSendingProgress: false,
        _lastProgressUri: null,
        _lastProgress: null,
        _progressGeneration: 0,
        _lastLegacyResendAt: 0,
        _lastReceiptResendAt: 0,
        _reqId: 0,
        _pendingLyricsSend: null,
        _finishLyricsRetryWait: null,
        _activeLyricsSend: null,
        _runtimeGeneration: 0,
        _connectionRecoveryTimer: null,
        _connectionRecoveryBootstrapTimer: null,
        _initialized: false,
        _offsetListenerSetup: false,
        _runtimeListenerSetup: false,
        _runtimeEnabledState: undefined,
        _storageListener: null,
        _delayChangedListener: null,
        _offsetChangedListener: null,
        _lyricsReadyListener: null,
        _visibilityChangeListener: null,
        _focusListener: null,
        _songChangeListener: null,
        _runtimeStorageListener: null,
        _runtimeEventListener: null
    });

    const OverlaySender = {
        ...createSenderState(),
        DEFAULT_PORT: 15000,
        LOG_TAG: '[OverlaySender]',
        CONNECTION_EVENT: 'ivLyrics:overlay-connection',
        LYRICS_ENDPOINT: '/lyrics',
        PROGRESS_ENDPOINT: '/progress',
        // GET on the progress path answers the status on overlay 1.3.0 and
        // later, and 405 on older overlays. Either response means it runs.
        PROBE_ENDPOINT: '/progress',
        // Named payloads carry trackUri and get receipts from new overlays.
        SOURCE_ID: OVERLAY_SOURCE_ID,
        // The trim option and translated titles apply only to the overlay.
        USES_DISPLAY_METADATA: true,
        // Receivers that read the raw position need an anchor every tick.
        CONTINUOUS_PROGRESS: false,

        // 포트 설정 (localStorage에 저장)
        get port() {
            const savedPort = readPersistence()
                ? readPersistence().getItem('ivLyrics:overlay-port')
                : getSpicetify().LocalStorage.get('ivLyrics:overlay-port');
            return savedPort ? parseInt(savedPort, 10) : this.DEFAULT_PORT;
        },
        set port(value) {
            const portNum = parseInt(value, 10);
            if (portNum >= 1024 && portNum <= 65535) {
                const previousPort = this.port;
                if (readPersistence()) {
                    readPersistence().setItem('ivLyrics:overlay-port', portNum.toString());
                } else {
                    getSpicetify().LocalStorage.set('ivLyrics:overlay-port', portNum.toString());
                }
                if (portNum === previousPort) return;
                ++this._runtimeGeneration;
                ++this._deliveryGeneration;
                resetLyricsDelivery(this);
                this._activeProbe = null;
                this._receiverProtocol = 1;
                this._probeFailures = 0;
                this.isConnected = false;
                this.checkConnection();
            }
        },

        // 설정 (localStorage에 저장)
        get enabled() {
            const stored = readPersistence()
                ? readPersistence().getItem('ivLyrics:overlay-enabled')
                : getSpicetify().LocalStorage.get('ivLyrics:overlay-enabled');
            return stored !== 'false';
        },
        set enabled(value) {
            if (readPersistence()) {
                readPersistence().setItem('ivLyrics:overlay-enabled', value ? 'true' : 'false');
            } else {
                getSpicetify().LocalStorage.set('ivLyrics:overlay-enabled', value ? 'true' : 'false');
            }
            this.syncRuntimeState();
        },

        get trimMetadata() {
            const stored = readPersistence()
                ? readPersistence().getItem('ivLyrics:overlay-trim-metadata')
                : getSpicetify().LocalStorage.get('ivLyrics:overlay-trim-metadata');
            return stored === 'true';
        },
        set trimMetadata(value) {
            const nextValue = !!value;
            if (nextValue === this.trimMetadata) return;
            if (readPersistence()) {
                readPersistence().setItem('ivLyrics:overlay-trim-metadata', String(nextValue));
            } else {
                getSpicetify().LocalStorage.set('ivLyrics:overlay-trim-metadata', String(nextValue));
            }
            this.refreshMetadata();
        },

        formatMetadataText(text) {
            return this.USES_DISPLAY_METADATA && this.trimMetadata ? trimTrackMetadataLabel(text) : text;
        },

        async refreshMetadata() {
            this.invalidateProgress();
            if (!this.enabled || !this._lastTrackInfo || !this._lastLyrics) return;
            // Retain the original cache so turning the option off restores it.
            await this.sendLyrics(
                this._lastTrackInfo,
                this._lastLyrics,
                true,
                'metadata-option',
                this._lastPresentationContext
            );
        },

        setSettingsOpen(isOpen) {
            clearSettingsPolling(this);
            this._isSettingsOpen = Boolean(isOpen);

            if (this._isSettingsOpen) {
                debug(this.LOG_TAG, '설정창 열림 - 연결 확인 폴링 시작');
                this.checkConnection();
                this._settingsTimer = setInterval(() => {
                    if (!this.isConnected) {
                        this.checkConnection();
                    }
                }, 5000);
            } else {
                debug(this.LOG_TAG, '설정창 닫힘 - 연결 확인 폴링 종료');
            }
        },

        get isConnected() {
            return this._isConnected;
        },
        set isConnected(value) {
            const wasConnected = this._isConnected;
            this._isConnected = value;
            this.syncProgressConnection();
            // Repeated failed probes keep the state; announce only changes.
            if (value === wasConnected) return;

            host.dispatchEvent(new CustomEvent(this.CONNECTION_EVENT, {
                detail: { connected: value }
            }));

            if (value) {
                debug(this.LOG_TAG, '연결됨 ✓');
                this.handleConnectionRecovery();
            } else {
                debug(this.LOG_TAG, '연결 끊김');
            }
        },

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

        openOverlayApp() {
            try {
                host.open('ivLyrics://overlay', '_blank');
                setTimeout(() => this.checkConnection(), 2000);
            } catch (e) {
                console.error('[OverlaySender] 앱 열기 실패:', e);
            }
        },

        getDownloadUrl() {
            return 'https://ivlis.kr/ivLyrics/extensions/#overlay';
        },

        getSyncOffset,

        ...createOverlayTransport({ maxProbeFailures: SENDER_PROBE_DELAYS.length }),
        ...createOverlayLyricsDelivery({
            playback, getSpicetify, resolveSpotifyImageUrl, debug, lyricPresentation, mapLyricsForSender,
        }),
        ...createOverlayProgress({
            host, playback, getSpicetify, getOverlayProgressIsPlaying, resolveSpotifyImageUrl
        }),

        invalidateLyricsPresentation() {
            this._deliveryGeneration += 1;
            this._reqId += 1;
            resetLyricsDelivery(this);
            this._lastTrackInfo = null;
            this._lastLyrics = null;
            this._lastPresentationContext = null;
            this._lastPresentationKey = null;
        },

        // A protocol 2 overlay reports the lyrics it holds for this sender. If
        // they differ from what was delivered for the playing track, it has
        // restarted or missed them: send them again.
        handleReceipt(receipt, trackUri) {
            if (!trackUri || (receipt.hasLyrics && receipt.lyricsTrackUri === trackUri)) return;
            if (this.lastDeliveredUri !== trackUri || this._lastTrackInfo?.uri !== trackUri) return;
            if (this.hasCurrentLyricsSend()) return;
            const now = Date.now();
            if (now - this._lastReceiptResendAt < RECEIPT_RESEND_GAP_MS) return;
            this._lastReceiptResendAt = now;
            this.lastDeliveredUri = null;
            this.lastDeliveredIsDjNarration = false;
            this.resendWithNewOffset('receiver-missing-lyrics');
        },

        setupOffsetListener() {
            // 중복 호출 방지
            if (this._offsetListenerSetup) return;
            this._offsetListenerSetup = true;

            // localStorage 변경 감지
            this._storageListener = (e) => {
                if (e.key && e.key.startsWith('lyrics-delay:')) {
                    this.resendWithNewOffset('lyrics-delay');
                } else if (e.key === 'ivLyrics:overlay-trim-metadata' && this.USES_DISPLAY_METADATA) {
                    this.refreshMetadata();
                }
            };

            // 커스텀 이벤트 리스너
            this._delayChangedListener = () => {
                this.resendWithNewOffset('lyrics-delay');
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
                        displayMode1: detail.displayMode1,
                        displayMode2: detail.displayMode2,
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
                if (document.visibilityState === 'visible') this.handleForeground();
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

            host.addEventListener('storage', this._storageListener);
            host.addEventListener('ivLyrics:delay-changed', this._delayChangedListener);
            host.addEventListener('ivLyrics:offset-changed', this._offsetChangedListener);
            host.addEventListener('ivLyrics:global-offset-changed', this._offsetChangedListener);
            host.addEventListener('ivLyrics:lyrics-ready', this._lyricsReadyListener);
            document.addEventListener('visibilitychange', this._visibilityChangeListener);
            host.addEventListener('focus', this._focusListener);
            getSpicetify().Player.addEventListener('songchange', this._songChangeListener);
        },

        teardownOffsetListener() {
            if (!this._offsetListenerSetup) return;
            this._offsetListenerSetup = false;

            if (this._storageListener) {
                host.removeEventListener('storage', this._storageListener);
                this._storageListener = null;
            }
            if (this._delayChangedListener) {
                host.removeEventListener('ivLyrics:delay-changed', this._delayChangedListener);
                this._delayChangedListener = null;
            }
            if (this._offsetChangedListener) {
                host.removeEventListener('ivLyrics:offset-changed', this._offsetChangedListener);
                host.removeEventListener('ivLyrics:global-offset-changed', this._offsetChangedListener);
                this._offsetChangedListener = null;
            }
            if (this._lyricsReadyListener) {
                host.removeEventListener('ivLyrics:lyrics-ready', this._lyricsReadyListener);
                this._lyricsReadyListener = null;
            }
            if (this._visibilityChangeListener) {
                document.removeEventListener('visibilitychange', this._visibilityChangeListener);
                this._visibilityChangeListener = null;
            }
            if (this._focusListener) {
                host.removeEventListener('focus', this._focusListener);
                this._focusListener = null;
            }
            if (this._songChangeListener && typeof getSpicetify().Player?.removeEventListener === 'function') {
                try {
                    getSpicetify().Player.removeEventListener('songchange', this._songChangeListener);
                } catch (e) { }
                this._songChangeListener = null;
            }
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

            this._runtimeStorageListener = () => {
                this.syncRuntimeState();
            };
            this._runtimeEventListener = () => {
                this.syncRuntimeState();
            };

            host.addEventListener('storage', this._runtimeStorageListener);
            host.addEventListener('ivLyrics', this._runtimeEventListener);
        },

        teardownRuntimeListener() {
            if (!this._runtimeListenerSetup) return;
            this._runtimeListenerSetup = false;

            if (this._runtimeStorageListener) {
                host.removeEventListener('storage', this._runtimeStorageListener);
                this._runtimeStorageListener = null;
            }
            if (this._runtimeEventListener) {
                host.removeEventListener('ivLyrics', this._runtimeEventListener);
                this._runtimeEventListener = null;
            }
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

    // The helper app (port 15123) shares the current lyrics with other local
    // programs. It reuses the overlay sender with its own endpoints and state.
    const ownSenderState = () => Object.fromEntries(
        Object.entries(createSenderState()).map(([key, value]) => [key, { value, writable: true }])
    );
    const lyricsHelperSender = Object.create(OverlaySender, {
        ...ownSenderState(),
        DEFAULT_PORT: { value: 15123 },
        LOG_TAG: { value: '[lyricsHelperSender]' },
        CONNECTION_EVENT: { value: 'ivLyrics:lyrics-helper-connection' },
        LYRICS_ENDPOINT: { value: '/lyrics/sender' },
        PROGRESS_ENDPOINT: { value: '/lyrics/progress' },
        PROBE_ENDPOINT: { value: '/lyrics/health' },
        SOURCE_ID: { value: null },
        USES_DISPLAY_METADATA: { value: false },
        // Helper clients read the raw position, so every 250 ms anchor counts.
        CONTINUOUS_PROGRESS: { value: true },
        port: {
            get() {
                return this.DEFAULT_PORT;
            }
        },
        enabled: {
            get() {
                const stored = readPersistence()
                    ? readPersistence().getItem('ivLyrics:visual:lyrics-helper-enabled')
                    : getSpicetify().LocalStorage.get('ivLyrics:visual:lyrics-helper-enabled');
                return stored !== 'false';
            },
            set(value) {
                if (readPersistence()) {
                    readPersistence().setItem('ivLyrics:visual:lyrics-helper-enabled', value ? 'true' : 'false');
                } else {
                    getSpicetify().LocalStorage.set('ivLyrics:visual:lyrics-helper-enabled', value ? 'true' : 'false');
                }
                this.syncRuntimeState();
            }
        },
        // Lifecycle methods stay own, fixed properties so neither sender can
        // replace the other's teardown.
        teardownOffsetListener: { value: OverlaySender.teardownOffsetListener },
        stopProgressSync: { value: OverlaySender.stopProgressSync },
        scheduleConnectionCheck: { value: OverlaySender.scheduleConnectionCheck },
        syncRuntimeState: { value: OverlaySender.syncRuntimeState },
        setupRuntimeListener: { value: OverlaySender.setupRuntimeListener },
        teardownRuntimeListener: { value: OverlaySender.teardownRuntimeListener },
        destroy: { value: OverlaySender.destroy }
    });

    return { OverlaySender, lyricsHelperSender };
}
