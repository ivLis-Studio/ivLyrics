import { readSettingsPersistence } from "../../core/settingsRuntime.mjs";
import { trimTrackMetadataLabel } from "../../core/spotifyTrackMetadata.mjs";
import { createOverlayLyricsDelivery } from "./overlayLyricsDelivery.mjs";
import { createOverlayProgress } from "./overlayProgress.mjs";
import { createOverlayTransport } from "./overlayTransport.mjs";
import { createOverlaySenderRuntime, MAX_OVERLAY_PROBE_STEPS } from "./overlaySenderRuntime.mjs";

export function createOverlaySenders({
    host, getSpicetify, getSyncOffset, playback, getOverlayProgressIsPlaying,
    resolveSpotifyImageUrl, scheduleSenderBootstrap, debug, lyricPresentation, mapLyricsForSender,
}) {
    const readPersistence = () => readSettingsPersistence(host);

    // The overlay can receive lyrics from several programs at once. Naming this
    // sender lets it keep another program's lyrics while Spotify is paused.
    const OVERLAY_SOURCE_ID = 'ivlyrics';
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

        ...createOverlayTransport({ maxProbeFailures: MAX_OVERLAY_PROBE_STEPS }),
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

        ...createOverlaySenderRuntime({
            host, getSpicetify, scheduleSenderBootstrap, debug, resetLyricsDelivery, clearSettingsPolling,
        }),
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
