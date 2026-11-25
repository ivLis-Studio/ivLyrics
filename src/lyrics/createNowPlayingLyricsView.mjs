import { readPronunciationFirst, readPronunciationNotation } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { INTERFACE_LANGUAGE_CHANGED } from "../i18n/interfaceLanguage.mjs";
import { getRuntimeService } from "../spicetify/runtimeServices.mjs";
import { resolveLyricSourceLanguage } from "./lyricPresentationIdentity.mjs";
import { createTranslationPreferences, normalizeIvLyricsPronunciationNotation } from "./translationPreferences.mjs";
import { readPanelBackgroundMode, startPanelBackground } from "./panelLyricsBackground.mjs";
import { getPanelLineSlotHeight, readPanelOriginalFontSize } from "./panelLyricsStyles.mjs";
import { startPanelPlaybackSubscription } from "./panelPlaybackSubscription.mjs";
import { readInitialPanelLyrics } from "./panelLyricPresentation.mjs";
import { createPanelTrackEffects } from "./panelTrackEffects.mjs";
import { buildPanelDisplayRows, preparePanelDisplayRows } from "./panelDisplayRows.mjs";
import { createPanelStackLayout } from "./panelStackLayout.mjs";
import { PRONUNCIATION_TIMING_DELAY_MS, isEstimatedPronunciationTiming } from "./pronunciationTimingSource.mjs";
import { createPronunciationTimingClient } from "./createPronunciationTimingClient.mjs";

const PSEUDO_KARAOKE_SOURCES = new Set(['audio-analysis-pseudo', 'spotify-audio-analysis', 'line-timing-pseudo']);
const DEFAULT_LINES = 9; // Four context lines either side of the active line.

export function createNowPlayingLyricsView({
    react, host, document, getSpicetify, panelDebug,
    readPlaybackPosition, readCurrentTrackUri, readGlobalSyncOffset, readTrackSyncStore, readPseudoKaraoke,
    getTranslator, getInterfaceLanguage, readVisualSettings,
    currentLyricsState, getSharedLyricsSnapshot, publishPanelLyricsSnapshot, getPanelLyricsService,
    getPanelTrackId, getSavedPanelLocalLyrics,
    getPlaybackPaused, playback, settings, presentation, sectionClass, transitionDurationMs,
    buildPanelLinePlaybackTimeline, getInterludeInfo, getTrailingKaraokeInterludeInfo,
    createTrailingKaraokeInterludeResolver, LyricLine, injectStyles, loadAlbumPalette,
}) {
    const { useState, useEffect, useRef, useCallback, useMemo } = react;
    const { getStorageValue, getVisualSetting, getPseudoKaraokeRenderAdvance, isAutoInstrumentalBreakEnabled, isPanelMotionReduced,
        translatePanelText, getPanelFallbackText, STORAGE_KEY, FONT_SCALE_KEY, DEFAULT_ENABLED, DEFAULT_FONT_SCALE } = settings;
    const { sanitizePanelLyricsSupplements, getDistinctPanelSupplement } = presentation;
    const readPlaybackSnapshot = () => readPlaybackPosition()?.getPlayerPlaybackSnapshot?.();
    const getAIManager = () => getRuntimeService("AIAddonManager", host);
    const preferences = createTranslationPreferences({
        getVisualSetting,
        readLocalSetting: getStorageValue,
        getAppLanguage: () => getInterfaceLanguage() || getStorageValue("ivLyrics:visual:language", null),
        getSpotifyLocale: () => getSpicetify().Locale?.getLocale?.(),
        getProviderStyle: () => getAIManager()?.getTranslationStyle?.(),
    });
    const translationPreferences = {
        getTranslationTargetLanguage: preferences.getCurrentTranslationTargetLanguage,
        getTranslationStyle: preferences.getTranslationStyle,
        getPronunciationNotation: () => normalizeIvLyricsPronunciationNotation(
            readPronunciationNotation(host)?.getCurrent?.() || preferences.getCurrentLyricsPronunciationNotation()
        ),
    };
    const usePanelTrackEffects = createPanelTrackEffects({
        react, host, getSpicetify, currentLyricsState, panelDebug,
        readPlaybackPosition, readPlaybackSnapshot, readCurrentTrackUri,
        readTrackSyncStore, readPseudoKaraoke, getTranslator, getAIManager, translationPreferences,
        getPanelLyricsService, publishPanelLyricsSnapshot, getPanelTrackId, getSavedPanelLocalLyrics,
        settings, presentation,
    });
    const usePanelStackLayout = createPanelStackLayout({ react, host, document });

    return function PanelLyrics() {
        const [initial] = useState(() => {
            const uri = readCurrentTrackUri();
            return readInitialPanelLyrics(
                uri, getSharedLyricsSnapshot(uri), currentLyricsState, getVisualSetting,
                translationPreferences, sanitizePanelLyricsSupplements
            );
        });
        const [lyrics, setLyrics] = useState(initial.lyrics);
        const [karaokeSource, setKaraokeSource] = useState(initial.karaokeSource);
        // 조회가 끝났는데 가사가 없으면 "불러오는 중" 대신 "가사를 찾을 수 없음"을 보여준다.
        const [lyricsNotFound, setLyricsNotFound] = useState(initial.lyricsNotFound);
        const [currentIndex, setCurrentIndex] = useState(0);
        const [visualIndex, setVisualIndex] = useState(0);
        const [singingLineIndices, setSingingLineIndices] = useState([]);
        const [activeTrailingInterludeKey, setActiveTrailingInterludeKey] = useState(null);
        const [visualTrailingInterludeKey, setVisualTrailingInterludeKey] = useState(null);
        // Word painting reads the playback position without rendering the panel again.
        const [trackOffset, setTrackOffset] = useState(0); // 곡별 싱크 오프셋
        const [globalOffset, setGlobalOffset] = useState(() => readGlobalSyncOffset() || 0);
        const [pseudoKaraokeAdvanceMs, setPseudoKaraokeAdvanceMs] = useState(getPseudoKaraokeRenderAdvance());
        const [autoInstrumentalBreakEnabled, setAutoInstrumentalBreakEnabled] = useState(isAutoInstrumentalBreakEnabled());
        const [isEnabled, setIsEnabled] = useState(getStorageValue(STORAGE_KEY, DEFAULT_ENABLED));
        const [fontScale, setFontScale] = useState(parseInt(getStorageValue(FONT_SCALE_KEY, DEFAULT_FONT_SCALE), 10));
        const [instrumentalBreakRevision, setInstrumentalBreakRevision] = useState(0);
        useEffect(() => {
            const refreshLabels = () => setInstrumentalBreakRevision(revision => revision + 1);
            host.addEventListener(INTERFACE_LANGUAGE_CHANGED, refreshLabels);
            return () => host.removeEventListener(INTERFACE_LANGUAGE_CHANGED, refreshLabels);
        }, []);
        const [textEffectRevision, setTextEffectRevision] = useState(0);
        const [, setMotionRevision] = useState(0);
        const [isPlaybackPaused, setIsPlaybackPaused] = useState(getPlaybackPaused);
        const reducePanelMotion = isPanelMotionReduced();
        const hasKaraokeTiming = useMemo(() => lyrics.some((line) => (
            (Array.isArray(line?.syllables) && line.syllables.length > 0)
            || (Array.isArray(line?.vocals?.lead?.syllables) && line.vocals.lead.syllables.length > 0)
        )), [lyrics]);
        const panelPlaybackTimeline = useMemo(() => buildPanelLinePlaybackTimeline(lyrics), [lyrics]);
        // Pronunciation-first mode swaps only the displayed values; timing,
        // indices and every lookup keep using the original lines.
        const [pronunciationFirstRevision, setPronunciationFirstRevision] = useState(0);
        useEffect(() => {
            const api = readPronunciationFirst(host);
            if (!api) return undefined;
            const refresh = () => setPronunciationFirstRevision((revision) => revision + 1);
            host.addEventListener(api.CHANGED_EVENT, refresh);
            host.addEventListener(api.UPDATED_EVENT, refresh);
            return () => {
                host.removeEventListener(api.CHANGED_EVENT, refresh);
                host.removeEventListener(api.UPDATED_EVENT, refresh);
            };
        }, []);
        const trackUri = readCurrentTrackUri();
        const [pronunciationTiming] = useState(() => createPronunciationTimingClient(() => readPronunciationFirst(host), "panel"));
        useEffect(() => pronunciationTiming.release, [pronunciationTiming]);
        useEffect(() => {
            const api = readPronunciationFirst(host);
            if (!isEnabled || !trackUri || !api?.isEnabled?.() || !hasKaraokeTiming
                || isEstimatedPronunciationTiming(karaokeSource)) {
                pronunciationTiming.release();
                return;
            }
            pronunciationTiming.releaseUnless(trackUri);
            const timer = setTimeout(() => {
                const ownsLyrics = (currentLyricsState.trackUri === trackUri && currentLyricsState.lyrics === lyrics)
                    || (initial.loadedUri === trackUri && initial.lyrics === lyrics);
                if (!api.isEnabled() || readCurrentTrackUri() !== trackUri || !ownsLyrics) return;
                const snapshot = getSharedLyricsSnapshot(trackUri);
                const sourceLang = resolveLyricSourceLanguage(
                    snapshot?.trackInfo?.languageOverride,
                    getVisualSetting("translate:detect-language-override"),
                    () => snapshot?.detectedLanguage || getPanelLyricsService()?.detectLanguage?.(lyrics),
                ) || "auto";
                pronunciationTiming.ensure({
                    trackUri, lines: lyrics, karaokeSource, sourceLang,
                    targetLang: translationPreferences.getTranslationTargetLanguage(),
                    notation: translationPreferences.getPronunciationNotation(),
                });
            }, PRONUNCIATION_TIMING_DELAY_MS);
            return () => clearTimeout(timer);
        }, [isEnabled, trackUri, lyrics, hasKaraokeTiming, karaokeSource, pronunciationFirstRevision, pronunciationTiming]);
        const displayLyrics = useMemo(() => {
            const api = readPronunciationFirst(host);
            if (!api?.isEnabled?.() || !Array.isArray(lyrics) || lyrics.length === 0) return lyrics;
            const lineLevel = readVisualSettings()?.["translate:display-mode"] !== "replace";
            if (!hasKaraokeTiming && !lineLevel) return lyrics;
            return api.applyToLines(lyrics, {
                karaoke: hasKaraokeTiming,
                lineLevel,
                timed: hasKaraokeTiming && trackUri ? api.getTimed(trackUri, lyrics, "panel") : null,
            });
        }, [lyrics, trackUri, hasKaraokeTiming, pronunciationFirstRevision]);
        // While rows show pronunciation first, the panel clock reads ahead like the page.
        playback.pronunciationLead = displayLyrics !== lyrics
            ? (readPronunciationFirst(host)?.LEAD_MS || 0)
            : 0;
        const containerRef = useRef(null);
        const scrollRef = useRef(null);

        usePanelTrackEffects(
            initial,
            { setLyrics, setLyricsNotFound, setKaraokeSource },
            {
                setTrackOffset, setGlobalOffset, setCurrentIndex, setVisualIndex,
                setActiveTrailingInterludeKey, setVisualTrailingInterludeKey, setIsPlaybackPaused, getPlaybackPaused,
            },
            {
                setIsEnabled, setFontScale, setPseudoKaraokeAdvanceMs, setAutoInstrumentalBreakEnabled,
                setInstrumentalBreakRevision, setTextEffectRevision, setMotionRevision,
            },
        );

        useEffect(() => startPanelBackground({
            playerEvents: getSpicetify().Player,
            settingsEvents: host,
            readTrackUri: () => getSpicetify().Player.data?.item?.uri,
            readSections: () => document.querySelectorAll(`.${sectionClass}`),
            readSetting: getStorageValue,
            loadAlbumPalette,
            reinjectStyles: injectStyles,
        }), []);

        // Sample display frames during playback and poll when the host is hidden or paused.
        useEffect(() => startPanelPlaybackSubscription({
            lyrics, timeline: panelPlaybackTimeline, enabled: isEnabled, hasKaraokeTiming,
            reduceMotion: reducePanelMotion, startIndex: currentIndex, startVisualIndex: visualIndex,
            offsetMs: {
                track: trackOffset, global: globalOffset,
                pseudo: PSEUDO_KARAOKE_SOURCES.has(karaokeSource) ? pseudoKaraokeAdvanceMs : 0,
            },
            transitionMs: transitionDurationMs,
            resolveTrailingInterlude: createTrailingKaraokeInterludeResolver(lyrics, panelPlaybackTimeline),
            read: {
                snapshot: readPlaybackSnapshot,
                fallbackPlayback: () => ({
                    position: readPlaybackPosition()?.getSafePlayerProgress?.()
                        ?? (getSpicetify().Player.getProgress?.() || 0),
                    isPlaying: getSpicetify().Player.isPlaying?.() === true,
                }),
                trackUri: () => getSpicetify().Player.data?.item?.uri,
                storedTrackDelay: (uri) => getSpicetify().LocalStorage.get(`lyrics-delay:${uri}`),
                pronunciationLead: () => playback.pronunciationLead,
            },
            on: {
                position: (value) => {
                    playback.position = value;
                    // Keep the position available to integrations that observe the panel time event.
                    host._ivLyricsPanelCurrentTime = value;
                },
                positionChanged: () => host.dispatchEvent(new Event("ivlyrics-panel-time-update")),
                activeLineChanged: setCurrentIndex,
                visualLineChanged: setVisualIndex,
                singingLinesChanged: setSingingLineIndices,
                activeInterludeChanged: setActiveTrailingInterludeKey,
                visualInterludeChanged: setVisualTrailingInterludeKey,
            },
            scheduler: {
                requestFrame: typeof requestAnimationFrame === "function" ? (callback) => requestAnimationFrame(callback) : null,
                cancelFrame: (id) => cancelAnimationFrame(id),
                scheduleTimer: (callback, delay) => setTimeout(callback, delay),
                cancelTimer: (id) => clearTimeout(id),
                visibilityTarget: document,
                isHidden: () => document.hidden,
            },
        }), [lyrics, isEnabled, trackOffset, globalOffset, karaokeSource, pseudoKaraokeAdvanceMs, autoInstrumentalBreakEnabled, hasKaraokeTiming, reducePanelMotion, panelPlaybackTimeline]);

        // 스크롤 애니메이션 비활성화 - Now Playing 탭 스크롤 문제 방지

        const visibleLineCount = DEFAULT_LINES;

        const preparedRows = useMemo(() => preparePanelDisplayRows(
            lyrics, displayLyrics, getInterludeInfo, getDistinctPanelSupplement,
        ), [lyrics, displayLyrics]);
        const panelLines = useMemo(() => buildPanelDisplayRows({
            lyrics, preparedRows, currentIndex, visualIndex, visibleLineCount,
            activeTrailingInterludeKey, visualTrailingInterludeKey, autoInstrumentalBreakEnabled,
            singingLineIndices, panelPlaybackTimeline, getInterludeInfo, getTrailingKaraokeInterludeInfo,
        }), [lyrics, preparedRows, currentIndex, visualIndex, visibleLineCount, activeTrailingInterludeKey,
            visualTrailingInterludeKey, autoInstrumentalBreakEnabled, singingLineIndices, panelPlaybackTimeline]);

        // ivLyrics 페이지로 이동
        const handleContainerClick = useCallback(() => {
            getSpicetify().Platform.History.push('/ivLyrics');
        }, []);

        const panelLineSlotHeight = useMemo(
            () => getPanelLineSlotHeight(readPanelOriginalFontSize(getStorageValue), fontScale),
            [fontScale, instrumentalBreakRevision],
        );

        // 폰트 스케일 스타일
        const containerStyle = useMemo(() => ({
            '--ivlyrics-font-scale': fontScale / 100,
            '--ivlyrics-panel-visible-lines': visibleLineCount,
            '--ivlyrics-panel-line-stack-gap': '10px',
            '--ivlyrics-panel-line-slot-height': `${panelLineSlotHeight}px`,
            '--ivlyrics-panel-effect-line-slot-height': `${Math.round(panelLineSlotHeight * 0.78)}px`,
            '--ivlyrics-panel-vocal-stack-line-height': `${Math.round(panelLineSlotHeight * 2.3)}px`,
            '--ivlyrics-panel-bar-fixed-height': `${Math.round(visibleLineCount * panelLineSlotHeight * 0.72)}px`
        }), [fontScale, panelLineSlotHeight, visibleLineCount]);
        const panelBgType = readPanelBackgroundMode(getStorageValue);
        const usesBlurGradientPanelBg = panelBgType === 'album' || panelBgType === 'gradient';
        const usesTransparentPanelBg = panelBgType === 'transparent';
        const sectionClassName = `${sectionClass}${isPlaybackPaused ? " playback-paused" : ""}${usesBlurGradientPanelBg ? " blur-gradient-bg" : ""}${usesTransparentPanelBg ? " transparent-bg" : ""}${reducePanelMotion ? " motion-reduced" : ""}`;
        const panelBackgroundLayer = usesBlurGradientPanelBg
            ? react.createElement("div", {
                className: "ivlyrics-panel-bg-gradient",
                "aria-hidden": "true"
            }, [1, 2, 3, 4, 5, 6].map((blobIndex) =>
                react.createElement("div", {
                    key: `panel-bg-blob-${blobIndex}`,
                    className: `ivlyrics-panel-bg-blob blob-${blobIndex}`
                })
            ))
            : null;
        usePanelStackLayout({
            initialLyrics: initial.lyrics, scrollRef, lyrics, panelLines, currentIndex, visualIndex,
            activeTrailingInterludeKey, fontScale, panelLineSlotHeight, instrumentalBreakRevision,
            textEffectRevision, reducePanelMotion,
        });

        const renderPanelLine = (panelLine, keyPrefix) => react.createElement(LyricLine, {
            key: `${keyPrefix}-${panelLine.index}`,
            line: panelLine.line,
            lineIndex: panelLine.lineIndex,
            lineCount: panelLine.lineCount,
            isActive: panelLine.isActive,
            isPast: panelLine.isPast,
            isFuture: panelLine.isFuture,
            translation: panelLine.translation,
            phonetic: panelLine.phonetic,
            isPlaceholder: panelLine.isPlaceholder,
            instrumentalBreakRevision,
            textEffectRevision
        });

        const renderPanelEmptyState = () => react.createElement("div", {
                className: sectionClassName,
                ref: containerRef,
                onClick: handleContainerClick,
                style: containerStyle
            },
                panelBackgroundLayer,
                react.createElement("div", { className: "ivlyrics-panel-header" },
                    react.createElement("h2", null, "ivLyrics")
                ),
                react.createElement("div", { className: "ivlyrics-panel-empty" },
                    lyricsNotFound
                        ? translatePanelText("syncCreator.noLyrics", getPanelFallbackText("가사를 찾을 수 없습니다", "Lyrics not found"))
                        : translatePanelText("syncCreator.loadingLyrics", getPanelFallbackText("가사 불러오는 중", "Loading lyrics..."))
                )
            );

        const renderPanelLyricsTree = () => react.createElement("div", {
            className: sectionClassName,
            ref: containerRef,
            onClick: handleContainerClick,
            style: containerStyle
        },
            panelBackgroundLayer,
            // 헤더
            react.createElement("div", { className: "ivlyrics-panel-header" },
                react.createElement("h2", null, "ivLyrics")
            ),
            // 가사 컨테이너
            react.createElement("div", {
                className: "ivlyrics-panel-lyrics-wrapper",
                ref: scrollRef
            },
                react.createElement("div", { className: "ivlyrics-panel-lines-stack" },
                    panelLines.map((panelLine) =>
                        react.createElement("div", {
                            key: `cell-${panelLine.index}`,
                            className: `ivlyrics-panel-line-cell${panelLine.isActive ? " current ivlyrics-panel-current-line" : ""}${panelLine.isVisualAnchor ? " visual-anchor" : ""}${panelLine.isLayoutHidden ? " layout-hidden" : ""}`,
                            "data-panel-line-key": String(panelLine.index)
                        },
                            renderPanelLine(panelLine, "stack")
                        )
                    )
                )
            )
        );

        // 비활성화 또는 가사 없음
        if (!isEnabled) return null;
        if (!lyrics || lyrics.length === 0) {
            return renderPanelEmptyState();
        }

        return renderPanelLyricsTree();
    };
}
