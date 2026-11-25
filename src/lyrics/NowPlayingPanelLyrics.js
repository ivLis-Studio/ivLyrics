import { readSettingsPersistence } from "../core/settingsRuntime.mjs";
import { createCoalescedCallback } from "../core/coalescedCallback.mjs";
import { createLocalLyricsStore } from "./localLyricsStore.mjs";
import { getInstrumentalBreakPresentation } from "./lyricInterludePresentation.mjs";
// ============================================
// NowPlayingPanelLyrics.js
// 우측 패널 (Now Playing View)에 가사를 표시하는 모듈
// ============================================

import { createLyricInterludeTiming, getLyricTrackDurationMs } from "./lyricInterludeTiming.mjs";
import { getLastTimedSyllableEndTime, preparePanelLinePlaybackTimeline } from "./lyricPlaybackTimeline.mjs";
import { trackIdentity as panelTrackIdentity } from "../core/trackIdentity.mjs";
import { createSpotifyArtworkColors as createPanelArtworkColors } from "../core/spotifyArtworkColors.mjs";
import { createPanelAlbumPalette } from "./panelLyricsBackground.mjs";
import { createPanelLyricsStyles } from "./panelLyricsStyles.mjs";
import { getRuntimeService } from "../spicetify/runtimeServices.mjs";
import { createNowPlayingPanelPlacement } from "./nowPlayingPanelPlacement.mjs";
import { createNowPlayingPanelMount } from "./nowPlayingPanelMount.mjs";
import { createPanelRuntimeSettings } from "./panelRuntimeSettings.mjs";
import { getPlaybackPositionService, getPlayableLyricsUri } from "../core/playbackPositionService.mjs";
import { createGlobalSyncOffsetReader } from "../core/globalSyncOffset.mjs";
import { getTrackSyncOffsetStore } from "../core/trackSyncOffsetRuntime.mjs";
import { getSyllablesFromLine, splitRenderableSyllables } from "./panelKaraokeText.mjs";
import { createPanelLyricLines } from "./panelLyricLines.mjs";
import { createPanelLyricLineStyles } from "./panelLyricLineStyles.mjs";
import { createPanelLyricPresentation } from "./panelLyricPresentation.mjs";
import { isLyricPresentationSetting } from "./lyricPresentationIdentity.mjs";
import { isLyricsProviderSelectionSetting } from "./lyricsProviderRequests.mjs";

import { createPanelRouteObserver } from "./panelRouteObserver.mjs";
import { createNowPlayingLyricsView } from "./createNowPlayingLyricsView.mjs";
import { clearPanelTrackState } from "./panelTrackEffects.mjs";

const getPanelLyricsService = () => getRuntimeService("LyricsService", window);

export default function NowPlayingPanelLyricsModule() {

    const MODULE_KEY = "__ivLyricsNowPlayingPanelModule";
    const moduleState = window[MODULE_KEY] || (window[MODULE_KEY] = {
        initialized: false,
        runtimeStarted: false,
        waitTimer: null,
        runtimeRetryTimer: null,
        lyricsListener: null,
        settingsListener: null
    });

    if (moduleState.initialized) {
        return;
    }

    // React 객체가 먼저 노출되어도 Player와 렌더링 API는 아직 준비되지 않을 수 있다.
    const isRuntimeReady = () => !!document.body
        && typeof window.Spicetify?.React?.createElement === 'function'
        && typeof window.Spicetify?.React?.Component === 'function'
        && typeof window.Spicetify?.React?.memo === 'function'
        && typeof window.Spicetify?.Player?.addEventListener === 'function'
        && (typeof window.Spicetify?.ReactDOM?.createRoot === 'function'
            || typeof window.Spicetify?.ReactDOM?.render === 'function');

    // Spicetify가 준비될 때까지 대기
    if (!isRuntimeReady()) {
        if (!moduleState.waitTimer) {
            moduleState.waitTimer = setTimeout(() => {
                moduleState.waitTimer = null;
                NowPlayingPanelLyricsModule();
            }, 300);
        }
        return;
    }

    if (moduleState.waitTimer) {
        clearTimeout(moduleState.waitTimer);
        moduleState.waitTimer = null;
    }
    moduleState.initialized = true;

    const PANEL_DEBUG = false;
    const panelDebug = (...args) => {
        if (PANEL_DEBUG) {
            console.log(...args);
        }
    };

    const react = Spicetify.React;

    // 설정 키
    const STORAGE_KEY = "ivLyrics:visual:panel-lyrics-enabled";
    const FONT_SCALE_KEY = "ivLyrics:visual:panel-font-scale";
    // 기본 설정값
    const DEFAULT_ENABLED = true;
    const DEFAULT_FONT_SCALE = 100; // 폰트 크기 배율 (50% ~ 200%)
    const PANEL_LINE_TRANSITION_DURATION_MS = 280;
    const playback = { position: 0, pronunciationLead: 0 };

    const getPanelTrackId = panelTrackIdentity.extractTrackId;

    const localLyrics = createLocalLyricsStore({
        readStorage: () => localStorage,
        onReadError: (error) => console.warn("[PanelLyrics] Failed to read local lyrics:", error),
    });
    const getSavedPanelLocalLyrics = (uri) => {
        const savedLyrics = localLyrics.get(uri);
        return savedLyrics ? { ...savedLyrics, provider: "local", uri } : null;
    };
    // 패널 가사 컨테이너 CSS 클래스
    const PANEL_CONTAINER_CLASS = "ivlyrics-panel-lyrics-container";
    const PANEL_SECTION_CLASS = "ivlyrics-panel-lyrics-section";
    const PANEL_ACTIVE_BODY_CLASS = "ivlyrics-panel-lyrics-active";
    // Starry Night 테마용 Now Playing Bar 컨테이너
    const NOWPLAYING_BAR_CONTAINER_CLASS = "ivlyrics-nowplaying-bar-lyrics";

    // Observer 참조
    let lyricsListener = moduleState.lyricsListener;
    let settingsListener = moduleState.settingsListener;

    const { injectStyles, updateStyles, updateCSSVariables } = createPanelLyricsStyles({
        document,
        readSetting: (key, fallback) => getStorageValue(key, fallback),
        activeBodyClass: PANEL_ACTIVE_BODY_CLASS,
        transitionDurationMs: PANEL_LINE_TRANSITION_DURATION_MS,
        supportsLinearEasing: typeof CSS !== "undefined" && CSS.supports?.("animation-timing-function", "linear(0, 1)"),
        applySpeakerColors: () => getRuntimeService("ivLyricsSpeakerColors", window)?.applyCssVariables?.(),
        debug: panelDebug,
    });

    // 현재 가사 상태
    const currentLyricsState = {
        lyrics: [],
        currentIndex: 0,
        isPlaying: false,
        trackUri: null,
        provider: null,
        karaokeSource: null
    };

    const readPlaybackPosition = () => getPlaybackPositionService(window);
    const readCurrentTrackUri = () => getPlayableLyricsUri(
        readPlaybackPosition()?.getPlayerPlaybackSnapshot?.(), Spicetify.Player.data?.item?.uri
    );

    const getSharedLyricsSnapshot = (trackUri = readCurrentTrackUri()) => {
        if (!trackUri) return null;
        const snapshot = getPanelLyricsService()?.getLyricsSnapshot?.(trackUri);
        return snapshot?.trackUri === trackUri ? snapshot : null;
    };

    const publishPanelLyricsSnapshot = (update = {}) => {
        const currentUri = readCurrentTrackUri();
        const trackUri = update.trackUri || currentUri;
        if (!currentUri || trackUri !== currentUri) return null;
        return getPanelLyricsService()?.publishLyricsSnapshot?.({
            ...update,
            trackUri,
            source: update.source || 'now-playing-panel'
        }) || null;
    };

    const setPanelActiveState = (isActive) => {
        document.body?.classList.toggle(PANEL_ACTIVE_BODY_CLASS, isActive);
    };

    const getPlaybackPaused = () => {
        const paused = Spicetify.Player?.data?.isPaused;
        if (typeof paused === "boolean") {
            return paused;
        }
        return !(Spicetify.Player?.isPlaying?.() ?? false);
    };

    const readVisualSettings = () => getRuntimeService("CONFIG", window)?.visual;
    const getI18n = () => getRuntimeService("I18n", window);
    const {
        getStorageValue, setStorageValue, getVisualSetting, isPanelMotionReduced, translatePanelText,
        getPanelFallbackText, getPseudoKaraokeRenderAdvance, isAutoInstrumentalBreakEnabled,
    } = createPanelRuntimeSettings({
        getPersistence: () => readSettingsPersistence(window),
        getSpicetify: () => Spicetify, getI18n, readStorage: () => localStorage, readVisualSettings,
        prefersReducedMotion: () => typeof window.matchMedia === "function"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        readNavigatorLanguage: () => navigator.language,
        reportError: (...args) => console.error(...args),
    });

    const panelLineStyles = createPanelLyricLineStyles({
        react,
        getVisualSetting,
        isPanelMotionReduced,
        getSpeakerColors: () => getRuntimeService("ivLyricsSpeakerColors", window),
    });
    const presentation = createPanelLyricPresentation({
        getDisplayComparison: () => getRuntimeService("ivLyricsTextComparison", window),
        getPhoneticHyphenMode: () => getVisualSetting('phonetic-hyphen-replace', 'keep'),
        getPanelSpeakerPresentation: panelLineStyles.getPanelSpeakerPresentation,
        getPanelSpeakerStyle: panelLineStyles.getPanelSpeakerStyle,
        splitRenderableSyllables,
    });

    const getInstrumentalBreakSettings = () => getInstrumentalBreakPresentation({
        readSetting: getVisualSetting,
        fallbackFont: () => getVisualSetting("panel-lyrics-original-font", "") ||
            getVisualSetting("original-font-family", "") ||
            "var(--ivlyrics-panel-original-font, var(--font-family))",
        defaultSize: 12,
    });

    const getCurrentTrackDurationMs = () => getLyricTrackDurationMs(
        typeof Spicetify === "undefined" ? null : Spicetify.Player?.data?.item
    );

    const getLastSyllableEndTime = (line) => getLastTimedSyllableEndTime(getSyllablesFromLine(line), line?.endTime);
    const buildPanelLinePlaybackTimeline = (lyrics) => preparePanelLinePlaybackTimeline(lyrics, getLastSyllableEndTime);

    const { getInterludeInfo, getTrailingKaraokeInterludeInfo } = createLyricInterludeTiming({
        readTrackDuration: getCurrentTrackDurationMs,
        readLineFillEndTime: getLastSyllableEndTime,
        readAutoBreakEnabled: isAutoInstrumentalBreakEnabled,
    });

    const createTrailingKaraokeInterludeResolver = (lyrics, timeline = buildPanelLinePlaybackTimeline(lyrics)) => {
        const lastLineIndex = lyrics.length - 1;
        let hasCachedLine = false;
        let cachedLineIndex = -1;
        let cachedInfo = null;
        let cachedAutoInstrumentalBreakEnabled = null;
        let cachedTrackDuration = null;

        return (lineIndex) => {
            const autoInstrumentalBreakEnabled = isAutoInstrumentalBreakEnabled();
            // The final track duration can arrive late. Check that scalar on
            // every tick, but only rescan syllables when its value changes.
            const trackDuration = lineIndex === lastLineIndex ? getCurrentTrackDurationMs() : null;

            if (!hasCachedLine ||
                lineIndex !== cachedLineIndex ||
                trackDuration !== cachedTrackDuration ||
                autoInstrumentalBreakEnabled !== cachedAutoInstrumentalBreakEnabled) {
                const info = getTrailingKaraokeInterludeInfo(
                    lyrics[lineIndex],
                    lyrics[lineIndex + 1],
                    lineIndex,
                    lyrics.length,
                    timeline[lineIndex]?.prefixEndTime,
                    autoInstrumentalBreakEnabled
                );
                cachedLineIndex = lineIndex;
                cachedInfo = info;
                cachedAutoInstrumentalBreakEnabled = autoInstrumentalBreakEnabled;
                cachedTrackDuration = trackDuration;
                hasCachedLine = true;
            }

            return cachedInfo;
        };
    };

    // ============================================
    // 노래방 단어 및 일반 가사 렌더링
    // ============================================
    const LyricLine = createPanelLyricLines({
        react, host: window, lineStyles: panelLineStyles,
        readPlaybackPosition: () => playback.position,
        buildSharedWordSegments: (syllables) => getPanelLyricsService()?.buildKaraokeWordSegments?.(syllables),
        getVocalRowsFromLine: presentation.getVocalRowsFromLine,
        getInstrumentalBreakSettings, getInterludeInfo, translatePanelText,
    });

    const readPanelArtworkUrl = () => {
        const item = Spicetify.Player.data?.item;
        return getPanelLyricsService()?.getTrackArtwork?.(item)
            ?? panelTrackIdentity.getTrackArtwork(item)
            ?? "";
    };

    const loadAlbumPalette = createPanelAlbumPalette({
        artworkColors: createPanelArtworkColors({
            readGraphQL: () => Spicetify.GraphQL,
            readCosmos: () => Spicetify.CosmosAsync,
        }),
        readArtworkUrl: readPanelArtworkUrl,
    });

    // ============================================
    // 패널 가사 메인 컴포넌트
    // ============================================
    const PanelLyrics = createNowPlayingLyricsView({
        react, host: window, document, getSpicetify: () => Spicetify,
        readPlaybackPosition, readCurrentTrackUri,
        readGlobalSyncOffset: createGlobalSyncOffsetReader(window, { readLocalStorage: () => localStorage }),
        readTrackSyncStore: () => getTrackSyncOffsetStore(window),
        readPseudoKaraoke: () => getRuntimeService("PseudoKaraokeService", window),
        getTranslator: () => getRuntimeService("Translator", window),
        getInterfaceLanguage: () => getI18n()?.getCurrentLanguage?.(),
        readVisualSettings,
        panelDebug, currentLyricsState, getSharedLyricsSnapshot, publishPanelLyricsSnapshot, getPanelLyricsService,
        getPanelTrackId, getSavedPanelLocalLyrics, getPlaybackPaused, playback, presentation,
        settings: {
            STORAGE_KEY, FONT_SCALE_KEY, DEFAULT_ENABLED, DEFAULT_FONT_SCALE,
            getStorageValue, getVisualSetting, getPseudoKaraokeRenderAdvance, isAutoInstrumentalBreakEnabled,
            isPanelMotionReduced, translatePanelText, getPanelFallbackText,
        },
        sectionClass: PANEL_SECTION_CLASS, transitionDurationMs: PANEL_LINE_TRANSITION_DURATION_MS,
        buildPanelLinePlaybackTimeline, getInterludeInfo, getTrailingKaraokeInterludeInfo, createTrailingKaraokeInterludeResolver,
        LyricLine, injectStyles, loadAlbumPalette,
    });

    // ============================================
    // 렌더 오류 격리
    // ============================================
    // 패널 렌더 중 예외가 나면 루트가 비고, verifyPanelContainerRendered와
    // MutationObserver가 빈 컨테이너를 보고 곧바로 다시 삽입한다. 그래서 오류 하나가
    // 곡 전환·일시정지 때마다 끝없이 반복되며 클라이언트를 멈추게 했다.
    // 오류는 이 경계에서 멈추고(숨긴 섹션을 남겨 재삽입 루프를 끊음), 다음 곡에서만 다시 그린다.
    class PanelLyricsErrorBoundary extends react.Component {
        constructor(props) {
            super(props);
            this.state = { failed: false };
            this.handleSongChange = () => {
                if (this.state.failed) {
                    this.setState({ failed: false });
                }
            };
        }

        static getDerivedStateFromError() {
            return { failed: true };
        }

        componentDidCatch(error) {
            console.error("[NowPlayingPanelLyrics] Panel render failed:", error);
        }

        componentDidMount() {
            Spicetify.Player?.addEventListener?.("songchange", this.handleSongChange);
        }

        componentWillUnmount() {
            Spicetify.Player?.removeEventListener?.("songchange", this.handleSongChange);
        }

        render() {
            if (this.state.failed) {
                return react.createElement("div", {
                    className: `${PANEL_SECTION_CLASS} ivlyrics-panel-render-failed`,
                    style: { display: "none" },
                    "aria-hidden": "true"
                });
            }
            return this.props.children;
        }
    }

    const createPanelLyricsElement = () => react.createElement(
        PanelLyricsErrorBoundary,
        null,
        react.createElement(PanelLyrics)
    );

    const {
        insertPanelLyrics, removePanelLyrics, scheduleInsertPanelLyrics, clearInsertTimer, setupObserver, teardownObserver,
        retryFailedMountOnTrackChange,
    } = createNowPlayingPanelMount({
        document, placement: createNowPlayingPanelPlacement({ document, debug: panelDebug }),
        Observer: MutationObserver, getReactDOM: () => Spicetify.ReactDOM,
        createPanelLyricsElement, injectStyles, isIvLyricsPageActive: () => isIvLyricsPageActive(),
        schedule: (callback, delay) => setTimeout(callback, delay), cancel: (timer) => clearTimeout(timer),
        now: () => Date.now(), debug: panelDebug, reportError: (...args) => console.error(...args),
        containerClass: PANEL_CONTAINER_CLASS, sectionClass: PANEL_SECTION_CLASS, barContainerClass: NOWPLAYING_BAR_CONTAINER_CLASS,
    });

    // ============================================
    // 가사 데이터 수신 및 전달
    // ============================================
    const setupLyricsListener = () => {
        if (lyricsListener) {
            return;
        }

        // 트랙 변경 감지
        lyricsListener = () => {
            if (currentLyricsState.trackUri !== readCurrentTrackUri()) clearPanelTrackState(currentLyricsState);
            retryFailedMountOnTrackChange();
        };

        Spicetify.Player.addEventListener('songchange', lyricsListener);
        moduleState.lyricsListener = lyricsListener;
    };

    const teardownLyricsListener = () => {
        if (lyricsListener && typeof Spicetify.Player?.removeEventListener === 'function') {
            try {
                Spicetify.Player.removeEventListener('songchange', lyricsListener);
            } catch (e) {
                // Ignore remove errors
            }
        }

        lyricsListener = null;
        moduleState.lyricsListener = null;
    };

    // ============================================
    // ivLyrics 페이지 감지 및 body 클래스 관리
    // ============================================
    const { isIvLyricsPageActive, setupPageDetection, teardownPageDetection } =
        createPanelRouteObserver({
            host: window, document, getHistory: () => Spicetify.Platform?.History,
            Observer: MutationObserver,
            schedule: (callback, delay) => setTimeout(callback, delay),
            cancel: (timer) => clearTimeout(timer),
            removePanelLyrics: () => {
                clearInsertTimer();
                removePanelLyrics();
            },
            scheduleInsertPanelLyrics,
        });

    const startRuntime = () => {
        if (moduleState.runtimeStarted) {
            return;
        }

        if (moduleState.runtimeRetryTimer) {
            clearTimeout(moduleState.runtimeRetryTimer);
            moduleState.runtimeRetryTimer = null;
        }

        const retry = () => {
            moduleState.runtimeRetryTimer = setTimeout(() => {
                moduleState.runtimeRetryTimer = null;
                startRuntime();
            }, 1000);
        };

        if (!isRuntimeReady()) {
            retry();
            return;
        }

        try {
            // Native preview suppression also applies when startup restores
            // ivLyrics, where insertPanelLyrics intentionally never mounts.
            injectStyles();
            setPanelActiveState(true);
            setupPageDetection();
            setupObserver();
            setupLyricsListener();
            updateCSSVariables();
            insertPanelLyrics();
            scheduleInsertPanelLyrics(1000);
            moduleState.runtimeStarted = true;
        } catch (error) {
            console.error('[NowPlayingPanelLyrics] Failed to start, retrying:', error);
            stopRuntime();
            retry();
        }
    };

    const stopRuntime = () => {
        moduleState.runtimeStarted = false;
        if (moduleState.runtimeRetryTimer) {
            clearTimeout(moduleState.runtimeRetryTimer);
            moduleState.runtimeRetryTimer = null;
        }
        clearInsertTimer();
        teardownObserver();
        teardownLyricsListener();
        teardownPageDetection();
        removePanelLyrics();
        setPanelActiveState(false);
        document.body?.classList.remove('ivlyrics-starrynight-theme');
    };

    const queueStyleUpdate = createCoalescedCallback(() => {
        if (moduleState.initialized) updateCSSVariables();
    });
    const handleSettingsEvent = (event) => {
        const settingName = event.detail?.name || '';
        if (isLyricsProviderSelectionSetting(settingName)) {
            const service = getPanelLyricsService();
            if (!service?.refreshLyricsProviderSelection) service?.clearLyricsSnapshot?.();
        } else if (isLyricPresentationSetting(settingName)) {
            getPanelLyricsService()?.clearLyricsPresentationSnapshot?.();
        }

        if (event.detail?.name === 'panel-lyrics-enabled') {
            if (event.detail.value) {
                startRuntime();
            } else {
                stopRuntime();
            }
        }

        if (event.detail?.name === 'panel-lyrics-width' ||
            event.detail?.name === 'panel-lyrics-font-family' ||
            event.detail?.name?.startsWith?.('panel-lyrics-original-') ||
            event.detail?.name?.startsWith?.('panel-lyrics-phonetic-') ||
            event.detail?.name?.startsWith?.('panel-lyrics-translation-') ||
            event.detail?.name?.startsWith?.('multi-vocal-speaker-color-')) {
            queueStyleUpdate();
        }
    };

    // ============================================
    // 초기화
    // ============================================
    const init = () => {
        panelDebug("[NowPlayingPanelLyrics] Initializing...");

        if (!settingsListener) {
            settingsListener = handleSettingsEvent;
            moduleState.settingsListener = settingsListener;
            window.addEventListener('ivLyrics', settingsListener);
        }

        if (getStorageValue(STORAGE_KEY, DEFAULT_ENABLED)) {
            startRuntime();
        } else {
            panelDebug("[NowPlayingPanelLyrics] Disabled by settings");
        }

        panelDebug("[NowPlayingPanelLyrics] Initialized successfully");
    };

    // 초기화 실행
    init();

    // 전역 접근용 (디버깅/설정)
    window.NowPlayingPanelLyrics = {
        insert: insertPanelLyrics,
        remove: removePanelLyrics,
        isEnabled: () => getStorageValue(STORAGE_KEY, DEFAULT_ENABLED),
        setEnabled: (enabled) => {
            setStorageValue(STORAGE_KEY, enabled);
            if (enabled) {
                startRuntime();
            } else {
                stopRuntime();
            }
        },
        updateLyrics: (lyrics, index) => {
            const trackUri = readCurrentTrackUri();
            if (!trackUri) return;
            currentLyricsState.lyrics = lyrics || [];
            currentLyricsState.currentIndex = index || 0;
            currentLyricsState.trackUri = trackUri;
            publishPanelLyricsSnapshot({
                trackUri,
                displayLyrics: currentLyricsState.lyrics,
                source: 'external-update'
            });
        },
        getLyricsSnapshot: (trackUri) => getSharedLyricsSnapshot(trackUri),
        updateStyles,
        updateCSSVariables,
        destroy: () => {
            if (settingsListener) {
                window.removeEventListener('ivLyrics', settingsListener);
                settingsListener = null;
                moduleState.settingsListener = null;
            }

            stopRuntime();
            moduleState.initialized = false;
            delete window[MODULE_KEY];
        }
    };

}
