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
import { createFullscreenTrackPanels, getFullscreenTrackPanelLayout } from "./fullscreenTrackPanels.mjs";

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
    const { renderPortraitOverlays, renderLandscapePanel } = createFullscreenTrackPanels({
        react, PlayerControls, ProgressBar, buildOverlayMetadataLines, renderPortraitMetadataLines, trimTitle,
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


        const settings = getFullscreenOverlaySettings(CONFIG?.visual, window, cdAlbumActive);
        const {
            albumSize, albumRadius, vinylAnimationsEnabled, albumClickOpensMode, showClock, clockShowSeconds,
            clockSize, showContext, showContextImage, showNextTrack, nextTrackSeconds, showControls, showVolume,
            showProgress, showLyricsProgress, showQueue, autoHideUI, autoHideDelay, tmiScale, controlButtonSize,
            controlsBackground, controlsPosition, tvModeEnabled, tvAlbumSize, trimTitleEnabled, tvShowAlbumName,
            tvShowControls, tvShowProgress,
        } = settings;
        const panelLayout = getFullscreenTrackPanelLayout({
            settings, isPortraitViewport, isTwoColumn: CONFIG?.visual?.["fullscreen-two-column"] !== false,
        });
        const VinylMode = getVinylMode();
        const focusedLyricsActive = !!(isFullscreen && !tvModeEnabled && focusModeActive && !tmiMode && VinylMode);
        const revealEnabled = isFullscreen && panelLayout.landscape && panelLayout.leftControls
            && autoHideUI && !tmiMode && !focusedLyricsActive;
        const reveal = useFullscreenControlReveal({ react, host: window, enabled: revealEnabled });

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

        const track = readTrackPresentation({
            trackUri, coverUrl, title, artist, translatedMetadata: pageTranslatedMetadata, trimTitleEnabled, trackAccentUri, trackAccent,
        });
        const { currentTrackUri, currentArtistUri, currentAlbumUri, currentCoverUrl, liveVinylTrack, displayMetadata } = track;
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

        const trackPanel = {
            settings, track, uiVisible, createNavigationProps,
            album: {
                interactionProps: albumInteractionProps, cdSlotStyle, cdActive: cdAlbumActive, cdScale,
                renderVisual: renderAlbumVisual, renderHint: renderAlbumModeHint,
            },
        };
        const metadataMode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";

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
                    trackName: resolveTmiMetadataName(metadataMode, displayMetadata.title,
                        translatedMetadata?.translated?.title, translatedMetadata?.romanized?.title, includeCompositeModes),
                    artistName: resolveTmiMetadataName(metadataMode, displayMetadata.artist,
                        translatedMetadata?.translated?.artist, translatedMetadata?.romanized?.artist, includeCompositeModes),
                    coverUrl: displayMetadata.coverUrl,
                    onRegenerate: handleRegenerate
                })
        );

        const PresentationSwitcher = VinylMode?.PresentationSwitcher;

        const renderTopRightOverlay = () =>
            react.createElement("div", {
                className: `fullscreen-top-right ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement("div", {
                    className: "fullscreen-clock-wrapper"
                },
                    react.createElement(Clock, {
                        show: showClock,
                        showSeconds: clockShowSeconds,
                        size: clockSize
                    })
                ),
                react.createElement(NextTrackPreview, {
                    show: showNextTrack,
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
            (tvModeEnabled || panelLayout.portrait) && tmiMode && react.createElement("div", {
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
                react.createElement(ContextInfo, { show: showContext, showImage: showContextImage })
            ),
            // Top-right: Clock & Next track
            renderTopRightOverlay(),
            // Portrait mode overlays (세로모드 전용 오버레이)
            panelLayout.portrait && renderPortraitOverlays(trackPanel),
            // Left panel (Album, Info & Controls) OR TMI View - Hidden in TV Mode & Portrait Mode
            panelLayout.landscape && renderLandscapePanel({
                ...trackPanel, metadataMode, showLeftControls: panelLayout.leftControls,
                revealEnabled, reveal, renderResearchView: tmiMode ? renderTmiModeView : null,
                albumPanelRef: setAlbumLyricsPanelRef, controlsRef: setControllerHeightRef,
            }),
            // Bottom: Player controls (alternative position) - landscape only
            !panelLayout.portrait && panelLayout.bottomControls && react.createElement("div", {
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
            !panelLayout.portrait && !showControls && showProgress && controlsPosition === "bottom" && react.createElement("div", {
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
                show: showQueue,
                isFullscreen
            })
        );
    };

    return Overlay;
}
