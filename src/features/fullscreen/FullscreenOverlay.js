import { getPlaybackPositionService as readFullscreenPlaybackPosition, isPlaybackLyricsTargetCurrent } from "#ivlyrics/core/playbackPositionService.mjs";
import { createRuntimeTrackIdentity as createOverlayTrackIdentity } from "#ivlyrics/core/trackIdentity.mjs";
import { createFullscreenPlaybackControls } from "#ivlyrics/features/fullscreen/fullscreenPlaybackControls.mjs";
import { createFullscreenPlaybackStatus, useFullscreenPlayback } from "#ivlyrics/features/fullscreen/fullscreenPlaybackStatus.mjs";
import { clampSeekPositionToLiveDuration } from "#ivlyrics/features/fullscreen/fullscreenPlaybackTiming.mjs";
import {
    observeFullscreenAlbumLyricsRegion, observeFullscreenControllerHeight, observeTvMetadataFit,
} from "#ivlyrics/features/fullscreen/fullscreenLayout.mjs";
import { createFullscreenQueuePanel } from "#ivlyrics/features/fullscreen/fullscreenQueuePanel.mjs";
import { fetchPlaylistMetadata as fetchFullscreenPlaylistMetadata } from "#ivlyrics/features/player/spotifyPlaylistMetadata.mjs";
import { useFullscreenAutoHide, useFullscreenControlReveal } from "./fullscreenControlReveal.mjs";
import { getFullscreenOverlaySettings, getFullscreenVinylSettings } from "./fullscreenOverlaySettings.mjs";
import { createFullscreenResearch } from "./fullscreenResearch.mjs";
import { createFullscreenMetadataViews } from "./fullscreenMetadataViews.mjs";
import { isFocusedLyricsPresentation, normalizeFullscreenPresentation } from "./fullscreenPresentation.mjs";
import { createFullscreenTrackMetadata, trimFullscreenTitle as trimTitle } from "./fullscreenTrackMetadata.mjs";
import { useFullscreenAlbumInteractions } from "./fullscreenAlbumInteractions.mjs";
import { createFullscreenTvView } from "./fullscreenTvView.mjs";

// Fullscreen Overlay Component - Enhanced UI/UX
export function createFullscreenOverlay({
    react, host: window, document, spicetify: Spicetify, config: CONFIG, i18n: I18n, toast: Toast,
    getPlaylistPicker, getPersistence, getSongResearch, getAiManager, getVinylMode, getReactDOM,
}) {
    const { useState, useEffect, useCallback, useRef } = react;
    const overlayTrackIdentity = createOverlayTrackIdentity(window);
    const { getOverlayMetadataSnapshot, readTrackPresentation } = createFullscreenTrackMetadata({
        readCurrentItem: () => Spicetify.Player.data?.item,
        getTrackArtwork: item => overlayTrackIdentity.getTrackArtwork(item),
        readVisualSettings: () => CONFIG?.visual,
    });

    const playbackHost = {
        react,
        spotify: Spicetify,
        translate: (...args) => I18n.t(...args),
        getPlaybackPosition: () => readFullscreenPlaybackPosition(window),
    };
    const QueuePanel = createFullscreenQueuePanel(playbackHost);
    const { ProgressBar, PlayerControls } = createFullscreenPlaybackControls({
        ...playbackHost,
        getDocument: () => document,
        getPlaylistPicker,
    });
    const { Clock, ContextInfo, NextTrackPreview } = createFullscreenPlaybackStatus({
        ...playbackHost,
        fetchPlaylistMetadata: (uri) => fetchFullscreenPlaylistMetadata(Spicetify, uri),
    });

    const { resolveTmiMetadataName, buildOverlayMetadataLines, renderPortraitMetadataLines, renderTvMetadataLines } = createFullscreenMetadataViews({
        react, trimTitle, readMetadataMode: () => CONFIG?.visual?.["translate-metadata-mode"] || "translated",
    });
    const spotifyUriToPath = (uri) => {
        const match = String(uri || "").match(/^spotify:(track|artist|album):([A-Za-z0-9]+)$/);
        return match ? `/${match[1]}/${match[2]}` : "";
    };

    // Lyrics Progress Indicator
    const LyricsProgress = ({ show, currentLine, totalLines }) => {
        if (!show || totalLines <= 0) return null;

        const percent = Math.round(((currentLine + 1) / totalLines) * 100);

        return react.createElement("div", { className: "fullscreen-lyrics-progress" },
            react.createElement("div", { className: "fullscreen-lyrics-progress-bar" },
                react.createElement("div", {
                    className: "fullscreen-lyrics-progress-fill",
                    style: { transform: `scaleX(${Math.max(0, Math.min(1, percent / 100))})` }
                })
            ),
            react.createElement("span", { className: "fullscreen-lyrics-progress-text" },
                `${currentLine + 1} / ${totalLines}`
            )
        );
    };

    const renderFullscreenTv = createFullscreenTvView({
        react, getPlayer: () => Spicetify.Player, getPlaybackPosition: playbackHost.getPlaybackPosition,
        renderTvMetadataLines, LyricsProgress,
    });

    const { ResearchTokenConsentDialog, useFullscreenResearch } = createFullscreenResearch({
        react, host: window, document, spicetify: Spicetify, i18n: I18n, toast: Toast,
        getPersistence, getSongResearch, getAiManager,
        isPlaybackCurrent: uri => isPlaybackLyricsTargetCurrent(
            playbackHost.getPlaybackPosition()?.getPlayerPlaybackSnapshot?.(), Spicetify.Player.data?.item?.uri, uri,
        ),
    });

    const Overlay = ({
        coverUrl,
        title,
        artist,
        isFullscreen,
        currentLyricIndex = 0,
        totalLyrics = 0,
        activeLyric = "",
        activeLyrics = [],
        activeLyricsKaraoke = false,
        karaokeRenderGranularity = null,
        karaokeSource = null,
        lyricsSettingsRevision = 0,
        translatedMetadata: pageTranslatedMetadata = null,
        trackUri = null,
        trackAccent = "",
        trackAccentUri = "",
        presentationMode = "standard",
        onPresentationModeChange = null,
        onFocusedLyricsChange = null,
        onExitFullscreen = null
    }) => {
        const {
            tmiMode, tmiData, tmiLoading, tmiWebSearchFallback, showResearchConsent,
            openTmiMode, closeResearchConsent, acceptResearchConsent, handleRegenerate, closeTmiMode,
        } = useFullscreenResearch(trackUri || Spicetify.Player.data?.item?.uri, isFullscreen);

        const tvMetadataCleanupRef = useRef(null);
        const setTvMetadataRef = useCallback((container) => {
            tvMetadataCleanupRef.current?.();
            tvMetadataCleanupRef.current = container ? observeTvMetadataFit(container, window) : null;
        }, []);
        const albumLyricsRegionCleanupRef = useRef(null);
        const setAlbumLyricsPanelRef = useCallback((panel) => {
            albumLyricsRegionCleanupRef.current?.();
            albumLyricsRegionCleanupRef.current = panel
                ? observeFullscreenAlbumLyricsRegion(panel, () => CONFIG?.visual?.alignment, window)
                : null;
        }, []);
        const [isPortraitViewport, setIsPortraitViewport] = useState(() => {
            if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
                return false;
            }
            return window.matchMedia("(orientation: portrait)").matches;
        });
        const controllerHeightCleanupRef = useRef(null);
        const setControllerHeightRef = useCallback((container) => {
            controllerHeightCleanupRef.current?.();
            controllerHeightCleanupRef.current = container
                ? observeFullscreenControllerHeight(container, window)
                : null;
        }, []);
        const {
            leftControlsRevealed, pointerCanHover, setControlsHoverSource, beginControlsDragHold, setControlsFocusHold,
        } = useFullscreenControlReveal({
            react, host: window, schedule: (...args) => setTimeout(...args), cancel: (timer) => clearTimeout(timer),
        });

        const normalizedPresentationMode = normalizeFullscreenPresentation(
            presentationMode
        );
        const presentationModeActive =
            normalizedPresentationMode !== "standard";
        const focusModeActive = isFocusedLyricsPresentation(normalizedPresentationMode);
        const compactPresentationActive =
            normalizedPresentationMode === "compact-vinyl";
        const cdAlbumActive = compactPresentationActive && CONFIG?.visual?.["fullscreen-tv-mode"] !== true;

        const navigateSpotifyUri = useCallback((uri) => {
            const path = spotifyUriToPath(uri);
            if (!path) return;

            onExitFullscreen?.();
            setTimeout(() => {
                Spicetify.Platform?.History?.push?.(path);
            }, 0);
        }, [onExitFullscreen]);

        const createNavigationProps = useCallback((uri, className) => {
            const path = spotifyUriToPath(uri);
            if (!path) {
                return { className };
            }

            const handleNavigate = (event) => {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                navigateSpotifyUri(uri);
            };

            return {
                className: `${className} fullscreen-navigation-link`,
                role: "link",
                tabIndex: 0,
                onClick: handleNavigate,
                onKeyDown: (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        handleNavigate(event);
                    }
                }
            };
        }, [navigateSpotifyUri]);


        const {
            showAlbum, showInfo, albumSize, albumRadius,
            vinylAnimationsEnabled, albumClickOpensMode, titleSize, artistSize,
            showClock, clockShowSeconds, clockSize, showContext, showContextImage,
            showNextTrack, nextTrackSeconds, showControls, showVolume, showProgress,
            showLyricsProgress, showQueue, autoHideUI, autoHideDelay,
            tmiScale, controlButtonSize, controlsBackground,
            controlsPosition, albumShadow, infoGap,
            tvModeEnabled, tvAlbumSize, trimTitleEnabled, normalShowAlbumName,
            tvShowAlbumName, tvShowControls, tvShowProgress, isLayoutReversed
        } = getFullscreenOverlaySettings(CONFIG?.visual, window, cdAlbumActive);

        // Only the focused presentation consumes the clock in the overlay itself.
        // TV progress subscribes separately to the same playback polling.
        const positionTarget = !isFullscreen ? null : tvModeEnabled
            ? (tvShowProgress ? "tv" : null)
            : (focusModeActive && !tmiMode ? "stage" : null);
        const { isPlaying, position, duration, tvPlayhead } = useFullscreenPlayback({
            react, spotify: Spicetify, readMetadata: getOverlayMetadataSnapshot, positionTarget,
        });

        useEffect(() => {
            if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

            const media = window.matchMedia("(orientation: portrait)");
            const handleChange = (event) => setIsPortraitViewport(!!event.matches);

            setIsPortraitViewport(media.matches);

            if (typeof media.addEventListener === "function") {
                media.addEventListener("change", handleChange);
                return () => media.removeEventListener("change", handleChange);
            }

            if (typeof media.addListener === "function") {
                media.addListener(handleChange);
                return () => media.removeListener(handleChange);
            }
        }, []);

        const uiVisible = useFullscreenAutoHide({
            react, document, enabled: isFullscreen && autoHideUI && !showResearchConsent, delay: autoHideDelay,
        });

        const {
            lpModeClosing, handlePresentationModeChange, handleAlbumModeClick,
            handleAlbumContextMenu, handleAlbumPointerDown, handleAlbumPointerMove, handleAlbumPointerEnd, handleAlbumKeyDown,
        } = useFullscreenAlbumInteractions({
            react, host: window, document, readVisualSettings: () => CONFIG?.visual, getReactDOM,
            openTmiMode, onPresentationModeChange, normalizedPresentationMode, presentationModeActive,
            tvModeEnabled, vinylAnimationsEnabled, albumClickOpensMode,
        });

        const { currentTrackUri, currentArtistUri, currentAlbumUri, currentCoverUrl, liveVinylTrack, displayMetadata } =
            readTrackPresentation({
                trackUri, coverUrl, title, artist, translatedMetadata: pageTranslatedMetadata, trimTitleEnabled, trackAccentUri, trackAccent,
            });
        const translatedMetadata = displayMetadata.translated;

        const albumActionCopy = {
            click: I18n.t("vinyl.click"),
            lpTitle: I18n.t(
                (compactPresentationActive || (!presentationModeActive && CONFIG?.visual?.["fullscreen-focus-presentation"] === "compact-vinyl"))
                    ? "vinyl.cd.mode"
                    : "vinyl.mode"
            ),
            lpHint: presentationModeActive
                ? I18n.t("vinyl.closeHint")
                : I18n.t("vinyl.openHint"),
            tmiGesture: I18n.t("vinyl.tmiGesture")
        };
        const tmiTitle = I18n.t("tmi.title");
        const vinylTmiHint = I18n.t("vinyl.tmiHint");
        const tmiDisclaimer = I18n.t("tmi.disclaimer");
        const albumCanToggleMode = !tvModeEnabled && (presentationModeActive || albumClickOpensMode);
        const albumInteractionLabel = [
            albumCanToggleMode ? albumActionCopy.lpHint : null,
            vinylTmiHint,
            tmiDisclaimer
        ]
            .filter(Boolean)
            .join(". ");

        const albumInteractionProps = {
            onClick: handleAlbumModeClick,
            onContextMenu: handleAlbumContextMenu,
            onPointerDown: handleAlbumPointerDown,
            onPointerMove: handleAlbumPointerMove,
            onPointerUp: handleAlbumPointerEnd,
            onPointerCancel: handleAlbumPointerEnd,
            onPointerLeave: handleAlbumPointerEnd,
            onDragStart: (event) => event.preventDefault(),
            onKeyDown: handleAlbumKeyDown,
            role: albumCanToggleMode ? "button" : "img",
            tabIndex: 0,
            "aria-label": albumInteractionLabel,
            "aria-keyshortcuts": albumCanToggleMode ? "Enter Space Shift+F10" : "Shift+F10",
            title: cdAlbumActive ? undefined : albumInteractionLabel
        };

        const renderAlbumModeHint = () => cdAlbumActive ? null : react.createElement("div", {
            className: "album-mode-hint",
            style: { borderRadius: `${albumRadius}px` },
            "aria-hidden": "true"
        },
            react.createElement("div", { className: "album-mode-hint-layout" },
                react.createElement("div", { className: "album-mode-actions" },
                    albumCanToggleMode && react.createElement("div", { className: "album-mode-action is-primary" },
                        react.createElement("div", { className: "album-mode-action-header" },
                            react.createElement("span", { className: "album-mode-action-title" }, albumActionCopy.lpTitle),
                            react.createElement("span", { className: "album-mode-action-gesture" }, albumActionCopy.click)
                        ),
                        react.createElement("span", { className: "album-mode-action-description" }, albumActionCopy.lpHint)
                    ),
                    react.createElement("div", { className: "album-mode-action is-secondary" },
                        react.createElement("div", { className: "album-mode-action-header" },
                            react.createElement("span", { className: "album-mode-action-title" }, tmiTitle),
                            react.createElement("span", { className: "album-mode-action-gesture" }, albumActionCopy.tmiGesture)
                        ),
                        react.createElement("span", {
                            className: "album-mode-action-description album-mode-tmi-disclaimer"
                        }, tmiDisclaimer)
                    )
                )
            )
        );

        const renderResearchConsentDialog = () => showResearchConsent && react.createElement(ResearchTokenConsentDialog, {
            onAgree: acceptResearchConsent,
            onCancel: closeResearchConsent
        });

        const VinylMode = getVinylMode();
        const focusedLyricsActive = !!(isFullscreen && !tvModeEnabled && focusModeActive && !tmiMode && VinylMode);
        // The regular page is visible again in TV/research mode, even when the
        // remembered presentation is vinyl. Report the surface actually rendered.
        (react.useLayoutEffect || useEffect)(() => {
            onFocusedLyricsChange?.(focusedLyricsActive);
        }, [focusedLyricsActive, onFocusedLyricsChange]);

        if (!isFullscreen) return null;

        const renderFocusedLyricsView = () => react.createElement(react.Fragment, null,
                react.createElement(VinylMode, {
                track: liveVinylTrack,
                albumRadius,
                isClosing: lpModeClosing,
                isPortraitLayout: isPortraitViewport,
                presentationMode: normalizedPresentationMode,
                controlsVisible: uiVisible,
                onPresentationModeChange: handlePresentationModeChange,
                isPlaying,
                position,
                duration,
                interactionProps: albumInteractionProps,
                activeLyric,
                activeLyrics,
                lyricsTrackUri: trackUri,
                activeLineIndex: currentLyricIndex,
                activeLyricsKaraoke,
                karaokeRenderGranularity,
                karaokeSource,
                lyricsSettingsRevision,
                showStageControls: showControls,
                showStageProgress: showProgress,
                vinylSettings: getFullscreenVinylSettings(CONFIG?.visual),
                onPrevious: () => Spicetify.Player.back(),
                onSeek: (nextPosition) => {
                    playbackHost.getPlaybackPosition()?.clearSafePlayerProgressCorrection?.();
                    const liveDuration = Spicetify.Player.getDuration?.() || duration;
                    const safePosition = clampSeekPositionToLiveDuration(nextPosition, liveDuration);
                    Spicetify.Player.seek(Math.floor(safePosition));
                },
                onStopPlayback: () => {
                    if (Spicetify.Player?.data?.isPaused === true) return;
                    if (typeof Spicetify.Player?.pause === "function") Spicetify.Player.pause();
                    else Spicetify.Player?.togglePlay?.();
                },
                onTogglePlayback: () => Spicetify.Player.togglePlay(),
                    onNext: () => Spicetify.Player.next()
                }),
                renderResearchConsentDialog()
        );

        if (focusedLyricsActive) {
            return renderFocusedLyricsView();
        }

        const CompactAlbumVinyl = VinylMode?.CompactAlbumVinyl;
        const requestedCdSize = Number(CONFIG?.visual?.["fullscreen-cd-disc-size"] ?? 100);
        const cdScale = Number.isFinite(requestedCdSize) ? Math.min(140, Math.max(70, requestedCdSize)) / 100 : 1;
        const cdSlotStyle = cdAlbumActive ? {
            "--iv-cd-overflow": Math.max(0, cdScale * 0.48 - 0.5),
            "--iv-cd-slot-size": `${albumSize}px`
        } : {};
        const renderAlbumVisual = ({
            coverClassName,
            coverStyle
        }) => {
            if (cdAlbumActive && CompactAlbumVinyl) {
                return react.createElement(CompactAlbumVinyl, {
                    track: liveVinylTrack,
                    isPlaying,
                    animationsEnabled: true,
                    reducedMotion: CONFIG?.visual?.["reduce-motion"] === true,
                    cdSettings: getFullscreenVinylSettings(CONFIG?.visual).cdSettings,
                    albumRadius,
                    coverClassName,
                    coverStyle
                });
            }

            return react.createElement("img", {
                src: currentCoverUrl,
                className: coverClassName,
                style: coverStyle,
                draggable: false
            });
        };

        const isPortraitFullscreen = isFullscreen && isPortraitViewport && !tvModeEnabled;
        const isTwoColumn = CONFIG?.visual?.["fullscreen-two-column"] !== false;
        const hideLeftPanel = !showAlbum && !showInfo && controlsPosition !== "left-panel";
        const showControlsInLeftPanel = controlsPosition === "left-panel" && showControls;
        const showControlsInBottom = controlsPosition === "bottom" && showControls;
        // Left-panel controls ignore the global idle timer and follow hover over the
        // album column instead. With auto-hide UI switched off - or on a device with
        // no hover-capable pointer - they stay pinned visible, exactly as they were
        // before hover gating existed. TMI mode renders no `.fullscreen-left-controls`,
        // so it keeps the idle-timer behaviour.
        const hoverGateControls = showControlsInLeftPanel && autoHideUI && !tmiMode && pointerCanHover;
        const leftControlsHidden = hoverGateControls ? !leftControlsRevealed : !uiVisible;
        const showContextInOverlay = showContext;
        const showNextTrackInOverlay = showNextTrack;
        const showQueueInOverlay = showQueue;
        const showInfoInOverlay = showInfo;
        const normalShowAlbumNameInOverlay = normalShowAlbumName;
        const showClockInOverlay = showClock;
        const clockSizeInOverlay = clockSize;
        const leftPanelShowVolume = showVolume;
        const leftPanelControlsBackground = controlsBackground;
        const leftPanelControlButtonSize = controlButtonSize;
        const leftControlsClass = [
            "fullscreen-left-controls",
            leftControlsHidden ? "hidden" : ""
        ].filter(Boolean).join(" ");
        const leftPlayerControlsClass = `${leftControlsClass} left-controls-player`;
        const leftProgressOnlyClass = `${leftControlsClass} left-controls-progress-only`;

        // TMI 로딩/전체 뷰 선택은 축소 오버레이와 전체 좌측 패널 두 곳에서 동일하다.
        // 유일한 차이인 메타데이터 표시 모드 폭(includeCompositeModes)만 인자로 받는다.
        // 컴포넌트가 아니라 createElement 서브트리를 반환하는 순수 렌더 헬퍼이므로
        // 두 호출부에서 같은 위치에 그대로 끼워 넣어 요소 정체성을 바꾸지 않는다.
        const renderTmiModeView = (includeCompositeModes) => (
            tmiLoading && !tmiData ?
                react.createElement(getSongResearch()?.TMILoadingView || 'div', {
                    onClose: closeTmiMode,
                    tmiScale,
                    webSearchFallback: tmiWebSearchFallback
                }) :
                react.createElement(getSongResearch()?.TMIFullView || 'div', {
                    info: tmiData,
                    isGenerating: tmiLoading,
                    webSearchFallback: tmiWebSearchFallback,
                    onClose: closeTmiMode,
                    tmiScale,
                    trackName: (() => {
                        const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                        const original = displayMetadata.title;
                        const trans = translatedMetadata?.translated?.title;
                        const rom = translatedMetadata?.romanized?.title;
                        return resolveTmiMetadataName(mode, original, trans, rom, includeCompositeModes);
                    })(),
                    artistName: (() => {
                        const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                        const original = displayMetadata.artist;
                        const trans = translatedMetadata?.translated?.artist;
                        const rom = translatedMetadata?.romanized?.artist;
                        return resolveTmiMetadataName(mode, original, trans, rom, includeCompositeModes);
                    })(),
                    coverUrl: displayMetadata.coverUrl,
                    onRegenerate: handleRegenerate
                })
        );

        // In TV mode, hide the left panel (album/info shown at bottom-left instead)
        const hideLeftPanelForTvMode = tvModeEnabled;
        const PresentationSwitcher = VinylMode?.PresentationSwitcher;

        const renderPortraitOverlays = () => react.createElement(react.Fragment, null,
                // [상단 오버레이] 앨범아트 + 곡정보
                (showAlbum || showInfo) && react.createElement("div", {
                    className: `portrait-overlay-top ${!uiVisible ? 'hidden' : ''} ${isLayoutReversed ? 'layout-reversed' : ''}`
                },
                    // 앨범 클릭은 LP 모드, 우클릭/롱프레스는 TMI
                    showAlbum && react.createElement("div", {
                        ...albumInteractionProps,
                        className: "portrait-album-container clickable-album-container",
                        style: { ...cdSlotStyle, borderRadius: `${albumRadius}px` }
                    },
                        renderAlbumVisual({
                            coverClassName: `portrait-album-art ivlyrics-fullscreen-shared-album ${albumShadow ? 'with-shadow' : ''}`,
                            coverStyle: { borderRadius: `${albumRadius}px` }
                        }),
                        renderAlbumModeHint()
                    ),
                    // 곡정보 (메타데이터 번역 지원)
                    showInfo && react.createElement("div", { className: "portrait-track-info" },
                        renderPortraitMetadataLines({
                            type: "title",
                            original: displayMetadata.title,
                            translated: translatedMetadata?.translated?.title,
                            romanized: translatedMetadata?.romanized?.title,
                            uri: currentTrackUri, trimTitleEnabled, createNavigationProps,
                        }),
                        renderPortraitMetadataLines({
                            type: "artist",
                            original: displayMetadata.artist,
                            translated: translatedMetadata?.translated?.artist,
                            romanized: translatedMetadata?.romanized?.artist,
                            uri: currentArtistUri, trimTitleEnabled, createNavigationProps,
                        }),
                        // 앨범명 (옵션)
                        normalShowAlbumName && react.createElement("div", {
                            ...createNavigationProps(currentAlbumUri, "portrait-track-album-name")
                        }, displayMetadata.albumName)
                    )
                ),
                // [하단 오버레이] 컨트롤 + 프로그레스바
                (showControls || showProgress) && react.createElement("div", {
                    className: `portrait-overlay-bottom ${!uiVisible ? 'hidden' : ''} ${isLayoutReversed ? 'layout-reversed' : ''}`
                },
                    showProgress && react.createElement(ProgressBar, { show: true }),
                    showControls && react.createElement(PlayerControls, {
                        show: true,
                        showVolume,
                        buttonSize: controlButtonSize,
                        showBackground: controlsBackground
                    })
                )
        );

        const renderLeftPanel = () =>
            react.createElement("div", {
                className: `lyrics-fullscreen-left-panel ${leftControlsHidden && showControlsInLeftPanel ? 'controls-hidden' : ''} ${tmiMode ? 'tmi-mode' : ''}`,
                ref: setAlbumLyricsPanelRef
            },
                // Invisible hover strip spanning the full column height. It sits behind
                // the panel content so it only claims the empty margins around the album,
                // and stays a fixed width even when `.fullscreen-no-lyrics` stretches
                // the panel across the whole grid.
                hoverGateControls && react.createElement("div", {
                    className: "lyrics-fullscreen-hover-zone",
                    style: { width: `${Math.round(albumSize * 1.15)}px` },
                    onMouseEnter: () => setControlsHoverSource("zone", true),
                    onMouseLeave: () => setControlsHoverSource("zone", false)
                }),
                // TMI Mode View
                tmiMode ? (
                    renderTmiModeView(true)
                ) :
                    // Normal Mode
                    react.createElement("div", {
                        className: "lyrics-fullscreen-left-content",
                        // The hover strip sits behind this stack, so crossing onto the
                        // album art fires the strip's leave. Re-arm on the content.
                        onMouseEnter: () => setControlsHoverSource("content", true),
                        onMouseLeave: () => setControlsHoverSource("content", false),
                        style: {
                            gap: `${infoGap}px`,
                            // Lyrics start at the visible album edge, which can
                            // be inside the grid column for a small cover/CD.
                            "--iv-fullscreen-controller-max-width": showAlbum
                                ? `${albumSize * (cdAlbumActive ? cdScale : 1)}px`
                                : undefined
                        }
                    },
                        // Album click toggles LP mode. Context click or hold opens TMI.
                        showAlbum && react.createElement("div", {
                            ...albumInteractionProps,
                            className: `lyrics-fullscreen-album-container clickable-album-container`,
                            style: {
                                ...cdSlotStyle,
                                width: `${albumSize}px`,
                                height: `${albumSize}px`,
                                maxWidth: `${albumSize}px`,
                                position: 'relative',
                                cursor: 'pointer',
                                borderRadius: `${albumRadius}px`
                            }
                        },
                            renderAlbumVisual({
                                coverClassName: `lyrics-fullscreen-album-art ivlyrics-fullscreen-shared-album ${albumShadow ? 'with-shadow' : ''}`,
                                coverStyle: {
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: `${albumRadius}px`
                                }
                            }),
                            renderAlbumModeHint()
                        ),
                        // Track info with translated metadata support
                        showInfoInOverlay && react.createElement("div", { className: "lyrics-fullscreen-track-info" },
                            // Title (based on display mode)
                            react.createElement("div", createNavigationProps(currentTrackUri, "lyrics-fullscreen-title-container"),
                                (() => {
                                    const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                    const originalTitle = displayMetadata.title;
                                    const translatedTitle = translatedMetadata?.translated?.title;
                                    const romanizedTitle = translatedMetadata?.romanized?.title;

                                    // Apply trimTitle if enabled
                                    const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                                    return buildOverlayMetadataLines({
                                        mode,
                                        original: originalTitle,
                                        translated: translatedTitle,
                                        romanized: romanizedTitle,
                                        applyTrim,
                                        keyPrefix: "title",
                                        mainClass: "lyrics-fullscreen-title",
                                        translatedClass: "lyrics-fullscreen-title-translated",
                                        romanizedClass: "lyrics-fullscreen-title-romanized",
                                        mainSize: titleSize,
                                        translatedSize: Math.round(titleSize * 0.6),
                                        romanizedSize: Math.round(titleSize * 0.5),
                                        includeRomanizedInAll: true,
                                    });
                                })()
                            ),
                            // Artist (based on display mode)
                            react.createElement("div", createNavigationProps(currentArtistUri, "lyrics-fullscreen-artist-container"),
                                (() => {
                                    const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                    const originalArtist = displayMetadata.artist;
                                    const translatedArtist = translatedMetadata?.translated?.artist;
                                    const romanizedArtist = translatedMetadata?.romanized?.artist;

                                    // Apply trimTitle if enabled
                                    const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                                    return buildOverlayMetadataLines({
                                        mode,
                                        original: originalArtist,
                                        translated: translatedArtist,
                                        romanized: romanizedArtist,
                                        applyTrim,
                                        keyPrefix: "artist",
                                        mainClass: "lyrics-fullscreen-artist",
                                        translatedClass: "lyrics-fullscreen-artist-translated",
                                        romanizedClass: "lyrics-fullscreen-artist-romanized",
                                        mainSize: artistSize,
                                        translatedSize: Math.round(artistSize * 0.8),
                                        romanizedSize: Math.round(artistSize * 0.8),
                                        includeRomanizedInAll: false,
                                    });
                                })()
                            ),
                            // Album name (optional)
                            normalShowAlbumNameInOverlay && react.createElement("div", {
                                ...createNavigationProps(currentAlbumUri, "lyrics-fullscreen-album-name"),
                                style: { fontSize: `${Math.round(artistSize * 0.85)}px` }
                            }, displayMetadata.albumName)
                        ),
                        // Controls in left panel (under album)
                        showControlsInLeftPanel && react.createElement("div", {
                            className: leftPlayerControlsClass,
                            ref: setControllerHeightRef,
                            onMouseEnter: () => setControlsHoverSource("controls", true),
                            onMouseLeave: () => setControlsHoverSource("controls", false),
                            onFocus: event => setControlsFocusHold(event?.target, true),
                            onBlur: event => {
                                // Focus moving between two controls keeps the hold.
                                if (event?.relatedTarget && event.currentTarget?.contains?.(event.relatedTarget)) return;
                                setControlsFocusHold(null, false);
                            },
                            onMouseDown: beginControlsDragHold
                        },
                            // Player controls, with the timeline inside their surface
                            react.createElement(PlayerControls, {
                                show: true,
                                showVolume: leftPanelShowVolume,
                                buttonSize: leftPanelControlButtonSize,
                                showBackground: leftPanelControlsBackground,
                                showProgress
                            })
                        ),
                        // Progress bar only (컨트롤 없이 진행바만 표시)
                        !showControls && showProgress && react.createElement("div", {
                            className: leftProgressOnlyClass
                        },
                            react.createElement(ProgressBar, { show: true })
                        )
                    )
            )
        ;

        const renderTopRightOverlay = () =>
            react.createElement("div", {
                className: `fullscreen-top-right ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement("div", {
                    className: "fullscreen-clock-wrapper"
                },
                    react.createElement(Clock, {
                        show: showClockInOverlay,
                        showSeconds: clockShowSeconds,
                        size: clockSizeInOverlay
                    })
                ),
                react.createElement(NextTrackPreview, {
                    show: showNextTrackInOverlay,
                    secondsBeforeEnd: nextTrackSeconds
                })
            )
        ;

        return react.createElement(react.Fragment, null,
            renderResearchConsentDialog(),
            !tvModeEnabled && !tmiMode && PresentationSwitcher && react.createElement(PresentationSwitcher, {
                activeMode: normalizedPresentationMode,
                visible: true,
                onChange: handlePresentationModeChange
            }),
            // TMI Overlay for TV Mode & Portrait Mode (rendered above everything when active)
            (tvModeEnabled || isPortraitFullscreen) && tmiMode && react.createElement("div", {
                className: "fullscreen-tv-tmi-overlay"
            },
                renderTmiModeView(false)
            ),
            // Bottom-left: TV Mode Song Info OR Context info
            tvModeEnabled ? renderFullscreenTv({
                albumInteractionProps, albumRadius, tvAlbumSize, renderAlbumVisual, setTvMetadataRef,
                createNavigationProps, currentTrackUri, currentArtistUri, currentAlbumUri,
                displayMetadata, trimTitleEnabled, tvShowAlbumName,
                showLyricsProgress, tvShowControls, tvShowProgress, uiVisible, currentLyricIndex, totalLyrics,
                isPlaying, tvPlayhead,
            })
            : react.createElement("div", {
                className: `fullscreen-bottom-left ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(ContextInfo, { show: showContextInOverlay, showImage: showContextImage })
            ),
            // Top-right: Clock & Next track
            renderTopRightOverlay(),
            // Portrait mode overlays (세로모드 전용 오버레이)
            isPortraitFullscreen && renderPortraitOverlays(),
            // Left panel (Album, Info & Controls) OR TMI View - Hidden in TV Mode & Portrait Mode
            !isPortraitFullscreen && isTwoColumn && !hideLeftPanel && !hideLeftPanelForTvMode && renderLeftPanel(),
            // Bottom: Player controls (alternative position) - landscape only
            !isPortraitFullscreen && showControlsInBottom && react.createElement("div", {
                className: `fullscreen-bottom ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(PlayerControls, {
                    show: true,
                    showVolume,
                    buttonSize: controlButtonSize,
                    showBackground: controlsBackground,
                    showProgress
                })
            ),
            // Progress bar only at bottom (landscape only) - same surface as the controls
            !isPortraitFullscreen && !showControls && showProgress && controlsPosition === "bottom" && react.createElement("div", {
                className: `fullscreen-bottom ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(PlayerControls, {
                    show: true,
                    showVolume: false,
                    showBackground: controlsBackground,
                    showProgress: true,
                    progressOnly: true
                })
            ),
            // Lyrics progress (always at bottom right if enabled)
            !tvModeEnabled && showLyricsProgress && react.createElement("div", {
                className: `fullscreen-lyrics-progress-container ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(LyricsProgress, {
                    show: true,
                    currentLine: currentLyricIndex,
                    totalLines: totalLyrics
                })
            ),
            // Queue panel (right side hover)
            react.createElement(QueuePanel, {
                show: showQueueInOverlay,
                isFullscreen
            })
        );
    };

    return Overlay;
}
