import { createOutsideTextOutlineShadow as createVinylTextOutline } from "#ivlyrics/lyrics/lyricsTextOutline.mjs";
import { motionLyrics as MotionLyrics } from "#ivlyrics/features/motion/motionApi.mjs";
import { normalizeFullscreenPresentation } from "../fullscreen/fullscreenPresentation.mjs";
import { createVinylMotionHooks, normalizeRotationSpeed } from "./vinylPlayback.mjs";
import { createVinylRecordPlayer } from "./vinylRecordPlayer.mjs";
import { createVinylStageControls } from "./vinylStageControls.mjs";
import { createVinylCompactDisc } from "./vinylCompactDisc.mjs";
import { useVinylTrackTransition } from "./vinylTrackTransition.mjs";

const NO_LYRICS = Object.freeze([]);

const readVinylTypography = vinylSettings => ({
    "--iv-vinyl-original-font-family": `'${String(vinylSettings.originalFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
    "--iv-vinyl-original-font-size": `${Number(vinylSettings.originalFontSize) || 31}px`,
    "--iv-vinyl-original-font-weight": Number(vinylSettings.originalFontWeight) || 600,
    "--iv-vinyl-original-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.originalOpacity) || 95) / 100)),
    "--iv-vinyl-original-letter-spacing": `${Number(vinylSettings.originalLetterSpacing) || 0}px`,
    "--iv-vinyl-phonetic-font-family": `'${String(vinylSettings.phoneticFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
    "--iv-vinyl-phonetic-font-size": `${Number(vinylSettings.phoneticFontSize) || 11}px`,
    "--iv-vinyl-phonetic-font-weight": Number(vinylSettings.phoneticFontWeight) || 100,
    "--iv-vinyl-phonetic-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.phoneticOpacity) || 70) / 100)),
    "--iv-vinyl-phonetic-spacing": `${Number.isFinite(Number(vinylSettings.phoneticSpacing)) ? Number(vinylSettings.phoneticSpacing) : -1}px`,
    "--iv-vinyl-phonetic-letter-spacing": `${Number(vinylSettings.phoneticLetterSpacing) || 0}px`,
    "--iv-vinyl-translation-font-family": `'${String(vinylSettings.translationFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
    "--iv-vinyl-translation-font-size": `${Number(vinylSettings.translationFontSize) || 15}px`,
    "--iv-vinyl-translation-font-weight": Number(vinylSettings.translationFontWeight) || 300,
    "--iv-vinyl-translation-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.translationOpacity) || 85) / 100)),
    "--iv-vinyl-translation-spacing": `${Number(vinylSettings.translationSpacing) || 0}px`,
    "--iv-vinyl-translation-letter-spacing": `${Number(vinylSettings.translationLetterSpacing) || 0}px`,
    "--iv-vinyl-cultural-note-font-family": `'${String(vinylSettings.culturalFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
    "--iv-vinyl-cultural-note-font-size": `${Number(vinylSettings.culturalFontSize) || 12}px`,
    "--iv-vinyl-cultural-note-font-weight": Number(vinylSettings.culturalFontWeight) || 300,
    "--iv-vinyl-cultural-note-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.culturalOpacity) || 60) / 100)),
});

// Focused fullscreen LP player mode.
//
// FullscreenOverlay owns only the entry gesture and supplies playback data.
// This module owns the vinyl scene, tonearm interaction, lyric surface, and
// track-to-track transition so the regular fullscreen layout stays isolated.
export function createVinylPlayerMode({
    react, host: window, document, i18n: I18n, spicetify: Spicetify, getActiveLyricRenderer, getCdVisualizer,
}) {
    const { useState, useCallback, useRef } = react;
    const { useReducedMotion, useRotationSpeed } = createVinylMotionHooks({ react, host: window });
    const VinylPlayer = createVinylRecordPlayer({ react, host: window, document, i18n: I18n, useRotationSpeed });
    const { PresentationSwitcher, StagePlaybackControls } = createVinylStageControls({
        react, spicetify: Spicetify, i18n: I18n,
    });
    const CompactDisc = createVinylCompactDisc({
        react, host: window, i18n: I18n, getCdVisualizer, useReducedMotion, useRotationSpeed,
    });

    const VINYL_FALLBACK_ACCENT = "var(--spice-button-active, #ff809d)";
    // Motion lyrics report their AI direction to the lyrics page, which shows it with its other AI tasks (index.js).
    const MOTION_DIRECTION_STATUS_EVENT = "ivLyrics:motion-direction:status";
    const reportMotionDirectionStatus = (detail) => {
        window.dispatchEvent(new CustomEvent(MOTION_DIRECTION_STATUS_EVENT, { detail }));
    };
    const CompactVinyl = react.memo(({
        track = {},
        isPlaying,
        cdSettings = {},
        reducedMotion = false,
        interactionProps = {}
    }) => {
        const label = I18n.t("vinyl.closeHint") || "Return to standard view";
        return react.createElement("button", {
            ...interactionProps,
            type: "button",
            className: "ivlyrics-compact-vinyl-stage",
            style: { "--iv-vinyl-accent": track.accent },
            "aria-label": label,
            title: label
        }, react.createElement(CompactDisc, { track, isPlaying, reducedMotion, cdSettings }));
    });

    const Mode = react.memo(({
        track = {},
        albumRadius = 0,
        isClosing = false,
        isPortraitLayout = false,
        presentationMode = "vinyl",
        isPlaying = false,
        position = 0,
        duration = 0,
        interactionProps = {},
        activeLyric = "",
        activeLyrics = NO_LYRICS,
        lyricsTrackUri = null,
        activeLineIndex = 0,
        activeLyricsKaraoke = false,
        karaokeSource = null,
        karaokeRenderGranularity = null,
        lyricsSettingsRevision = 0,
        vinylSettings = {},
        showStageControls = true,
        showStageProgress = true,
        onPresentationModeChange,
        onPrevious,
        onSeek,
        onStopPlayback,
        onTogglePlayback,
        onNext
    }) => {
        const normalizedPresentationMode = normalizeFullscreenPresentation(presentationMode, "vinyl");
        const isFullVinylPresentation =
            normalizedPresentationMode === "vinyl";
        const isCompactVinylPresentation =
            normalizedPresentationMode === "compact-vinyl";
        const isVideoPresentation =
            normalizedPresentationMode === "video";
        const isMotionPresentation =
            normalizedPresentationMode === "motion";
        const animationsEnabled = vinylSettings.animations !== false;
        const trackChangeEnabled = vinylSettings.trackChangeAnimation !== false;
        const rotationSpeed = normalizeRotationSpeed(vinylSettings.rotationSpeed);
        const systemReducedMotion = useReducedMotion();
        const reducedMotion = vinylSettings.reducedMotion === true || systemReducedMotion;
        const centerRotationEnabled = vinylSettings.centerRotation !== false;
        const lyricsEnabled = vinylSettings.lyricsEnabled !== false;
        const albumScale = Math.min(1.4, Math.max(0.7, (Number(vinylSettings.albumSize) || 100) / 100));
        const recordScale = Math.min(1.4, Math.max(0.7, (Number(vinylSettings.recordSize) || 100) / 100));
        const backgroundBlur = Math.min(100, Math.max(0, Number(vinylSettings.backgroundBlur) || 0));
        const safeScaleFactor = 1 / Math.max(1, albumScale, recordScale);
        const liveTrack = {
            uri: track.uri || `${track.title || "LP"}\u0000${track.artist || ""}`,
            coverUrl: track.coverUrl || "",
            title: track.title || "LP",
            artist: track.artist || "",
            album: track.album || track.title || "ivLyrics",
            accent: String(track.accent || "").trim() || VINYL_FALLBACK_ACCENT
        };
        const liveTrackRef = useRef(liveTrack);
        liveTrackRef.current = liveTrack;

        const normalizedLyricsTrackUri = String(lyricsTrackUri || "").trim();
        const lyricsMatchTrack = !normalizedLyricsTrackUri || normalizedLyricsTrackUri === liveTrack.uri;
        const trackLyrics = lyricsMatchTrack && Array.isArray(activeLyrics) ? activeLyrics : NO_LYRICS;
        const hasRows = trackLyrics.length > 0;
        const plainLyric = lyricsMatchTrack ? String(activeLyric || "").replace(/\s+/g, " ").trim() : "";
        // Motion and the focused row use the same track-owned lyrics. Check
        // eligibility only when the inputs change, including late timed lyrics.
        const motionTimingAvailable = react.useMemo(() => isMotionPresentation && hasRows
            && !!MotionLyrics?.Stage && MotionLyrics.hasRealTiming(trackLyrics, activeLyricsKaraoke, karaokeSource),
        [isMotionPresentation, hasRows, trackLyrics, activeLyricsKaraoke, karaokeSource, MotionLyrics]);
        const motionPlayable = motionTimingAvailable && animationsEnabled && !reducedMotion;
        const isVideoStageLayout = isVideoPresentation || (isMotionPresentation && !motionPlayable);
        // Motion lyrics: the viewer's comfort, and "direct again" counted per song.
        const motionIntensity = vinylSettings.motion?.intensity || "normal";
        const motionRotation = vinylSettings.motion?.rotation || "full";
        const motionSafe = vinylSettings.motion?.safe === true;
        const motionComfort = react.useMemo(
            () => ({ intensity: motionIntensity, rotation: motionRotation, safe: motionSafe }),
            [motionIntensity, motionRotation, motionSafe]
        );
        const [motionRetake, setMotionRetake] = useState({ uri: "", take: 0 });
        const motionTake = motionRetake.uri === liveTrack.uri ? motionRetake.take : 0;
        const redirectMotion = useCallback(() => {
            const uri = liveTrackRef.current.uri;
            setMotionRetake((current) => ({ uri, take: current.uri === uri ? current.take + 1 : 1 }));
        }, []);
        const { displayedTrack, incomingTrack, trackTransition } = useVinylTrackTransition({
            react, host: window, liveTrack, liveTrackRef,
            isFullVinylPresentation, animationsEnabled, trackChangeEnabled, reducedMotion,
        });

        const ActiveLyricRenderer = getActiveLyricRenderer();
        const transitionClass = trackTransition !== "idle" ? `is-track-${trackTransition}` : "";
        const hasActiveLyric = !!plainLyric || (!!ActiveLyricRenderer && hasRows);
        const hasVisibleLyric = lyricsEnabled && hasActiveLyric;
        const displayedSourceLine = hasActiveLyric ? trackLyrics[activeLineIndex] : null;
        const hasVisibleCulturalAnnotation =
            Array.isArray(displayedSourceLine?.culturalNote)
                ? displayedSourceLine.culturalNote.length > 0
                : !!displayedSourceLine?.culturalNote;

        const renderLyricLayer = () => {
            if (!hasVisibleLyric) return null;
            const renderableLyrics = hasRows ? trackLyrics : [{ text: plainLyric, startTime: 0 }];
            const isKara = hasRows && activeLyricsKaraoke;

            return react.createElement("div", {
                // Keep the layer mounted between lines. Remounting it for every
                // active index restarted the entrance animation and made the LP
                // lyric surface visibly blink between otherwise continuous rows.
                key: `vinyl-active-lyric-current-${liveTrack.uri}`,
                className: "fullscreen-vinyl-active-lyric is-current",
                dir: "auto"
            }, ActiveLyricRenderer
                ? react.createElement(ActiveLyricRenderer, {
                    lyrics: renderableLyrics,
                    trackUri: normalizedLyricsTrackUri || liveTrack.uri,
                    activeLineIndex: hasRows ? activeLineIndex : 0,
                    isKara,
                    karaokeSource,
                    karaokeRenderGranularity: isKara ? karaokeRenderGranularity : null,
                    settingsRevision: lyricsSettingsRevision,
                    positionOverride: null,
                    motionEnabled: animationsEnabled && !reducedMotion,
                    durationMs: duration,
                    singleLineScroll: !isVideoStageLayout && hasRows
                })
                : plainLyric);
        };

        const typography = readVinylTypography(vinylSettings);
        const vinylOverlayStyle = {
                ...typography,
                "--iv-vinyl-original-outline-shadow": createVinylTextOutline(
                    vinylSettings.originalOutlineWidth,
                    vinylSettings.originalOutlineColor
                ),
                "--iv-vinyl-original-outline-stroke-width": `${(Number(vinylSettings.originalOutlineWidth) || 0) * 2}px`,
                "--iv-vinyl-original-outline-stroke-color": vinylSettings.originalOutlineColor || "#000000",
                "--iv-vinyl-phonetic-outline-shadow": createVinylTextOutline(
                    vinylSettings.phoneticOutlineWidth,
                    vinylSettings.phoneticOutlineColor
                ),
                "--iv-vinyl-translation-outline-shadow": createVinylTextOutline(
                    vinylSettings.translationOutlineWidth,
                    vinylSettings.translationOutlineColor
                ),
                "--iv-vinyl-cultural-note-outline-shadow": createVinylTextOutline(
                    vinylSettings.culturalOutlineWidth,
                    vinylSettings.culturalOutlineColor
                ),
                "--iv-video-stage-original-font-family": `'${String(vinylSettings.videoStageOriginalFontFamily || vinylSettings.originalFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-video-stage-phonetic-font-family": `'${String(vinylSettings.videoStagePhoneticFontFamily || vinylSettings.phoneticFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-video-stage-translation-font-family": `'${String(vinylSettings.videoStageTranslationFontFamily || vinylSettings.translationFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-video-stage-cultural-font-family": `'${String(vinylSettings.videoStageCulturalFontFamily || vinylSettings.culturalFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-video-stage-lyric-background-color": String(vinylSettings.videoStageLyricBackgroundColor || "#000000"),
                "--iv-video-stage-lyric-background-opacity": `${Math.min(100, Math.max(0, Number(vinylSettings.videoStageLyricBackgroundOpacity) || 0))}%`,
                "--iv-vinyl-background-blur": `${backgroundBlur}px`
        };
        const renderModeOverlay = () => react.createElement("div", {
            className: [
                "fullscreen-vinyl-overlay",
                isClosing ? "is-closing" : "is-open",
                isPortraitLayout ? "is-portrait-layout" : "is-landscape-layout",
                `is-presentation-${normalizedPresentationMode}`,
                isFullVinylPresentation ? "has-full-vinyl-stage" : "",
                isCompactVinylPresentation ? "has-compact-vinyl-stage" : "",
                isVideoStageLayout ? "has-video-stage" : "",
                // Without motion the motion presentation uses the video stage layout.
                isMotionPresentation && !motionPlayable ? "is-presentation-video" : "",
                motionPlayable ? "has-motion-stage" : "",
                animationsEnabled && !reducedMotion ? "" : "is-motion-disabled",
                transitionClass,
                lyricsEnabled ? "has-lyric-slot" : "",
                hasVisibleLyric ? "has-active-lyric" : "",
                hasVisibleCulturalAnnotation ? "has-cultural-annotation" : ""
            ].filter(Boolean).join(" "),
            role: "dialog",
            "aria-modal": "true",
            "aria-label": I18n.t(
                normalizedPresentationMode === "compact-vinyl"
                    ? "vinyl.presentation.compactLabel"
                    : normalizedPresentationMode === "video"
                        ? "vinyl.presentation.videoLabel"
                        : normalizedPresentationMode === "motion"
                            ? "vinyl.presentation.motionLabel"
                            : "vinyl.presentation.vinylLabel"
            ) || I18n.t("vinyl.mode") || "LP",
            style: vinylOverlayStyle
        },
            motionPlayable ? react.createElement(MotionLyrics.Stage, {
                lyrics: trackLyrics,
                trackUri: normalizedLyricsTrackUri || liveTrack.uri,
                accent: displayedTrack.accent,
                isPlaying,
                title: liveTrack.title,
                artist: liveTrack.artist,
                onStatus: reportMotionDirectionStatus,
                motion: motionComfort,
                retake: motionTake,
                cover: liveTrack.coverUrl
            }) : null,
            isMotionPresentation && !motionPlayable && hasRows
                ? react.createElement("div", {
                    key: `motion-notice-${liveTrack.uri}:${motionTimingAvailable ? "motion" : "timing"}`,
                    className: "fullscreen-motion-notice",
                    role: "status"
                }, motionTimingAvailable
                    ? (I18n.t("vinyl.presentation.motionReducedMotion")
                        || "Motion lyrics are off while motion is reduced. Showing the video stage lyric instead.")
                    : (I18n.t("vinyl.presentation.motionUnavailable")
                        || "Motion lyrics play songs with word or character timing. Showing the video stage lyric instead."))
                : null,
            isFullVinylPresentation ? react.createElement(VinylPlayer, {
                className: [
                    "ivlyrics-vinyl-player--immersive",
                    isPortraitLayout ? "ivlyrics-vinyl-player--portrait-layout" : "",
                    centerRotationEnabled ? "is-center-rotation-enabled" : "",
                    transitionClass
                ].filter(Boolean).join(" "),
                style: {
                    "--iv-vinyl-album-radius": `${albumRadius}px`,
                    "--iv-vinyl-album-scale": albumScale,
                    "--iv-vinyl-record-scale": recordScale,
                    "--iv-vinyl-safe-scale-factor": safeScaleFactor,
                    ...typography,
                    "--iv-vinyl-accent": displayedTrack.accent
                },
                coverUrl: displayedTrack.coverUrl,
                title: displayedTrack.title,
                artist: displayedTrack.artist,
                album: displayedTrack.album,
                incomingTrack,
                trackUri: liveTrack.uri,
                isPlaying,
                position,
                duration,
                animationsEnabled,
                reducedMotion,
                rotationSpeed,
                tonearmStyle: vinylSettings.tonearmStyle,
                tonearmFinish: vinylSettings.tonearmFinish,
                tonearmSize: vinylSettings.tonearmSize,
                interactionProps,
                onSeek,
                onStopPlayback,
                onTogglePlayback
            }) : null,
            isCompactVinylPresentation ? react.createElement(CompactVinyl, {
                track: liveTrack,
                isPlaying,
                cdSettings: vinylSettings.cdSettings,
                reducedMotion,
                interactionProps
            }) : null,
            react.createElement(PresentationSwitcher, {
                activeMode: normalizedPresentationMode,
                visible: true,
                onChange: onPresentationModeChange,
                onRedirect: motionPlayable ? redirectMotion : null
            }),
            (isFullVinylPresentation || isVideoPresentation || isMotionPresentation) && react.createElement(StagePlaybackControls, {
                isPlaying,
                position,
                duration,
                showControls: showStageControls,
                showProgress: showStageProgress,
                onPrevious,
                onTogglePlayback,
                onNext,
                onSeek
            }),
            lyricsEnabled && !motionPlayable ? react.createElement("div", {
                className: `fullscreen-vinyl-lyric-stage${hasVisibleLyric ? "" : " is-empty"}`,
                "aria-live": "polite",
                "aria-atomic": "true",
                "aria-busy": trackTransition !== "idle" && !hasActiveLyric ? "true" : undefined
            },
                renderLyricLayer()
            ) : null
        );

        return renderModeOverlay();
    });

    Mode.PresentationSwitcher = PresentationSwitcher;
    Mode.CompactAlbumVinyl = CompactDisc;
    Mode.CompactDisc = CompactDisc;
    return Mode;
}
