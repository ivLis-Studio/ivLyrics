import { fitFullscreenAlbumSize } from "./fullscreenLayout.mjs";
import { getResearchFontSize } from "../../app/researchReaderSettings.mjs";

export function getFullscreenOverlaySettings(visual, viewport, cdAlbumActive) {
    // Get settings from CONFIG
    const showAlbum = visual?.["fullscreen-show-album"] !== false;
    const showInfo = visual?.["fullscreen-show-info"] !== false;
    const configuredAlbumSize = Number(visual?.["fullscreen-album-size"]) || 400;
    // The printed CD occupies 76% of its spectrum frame. Give that
    // frame more room without changing the saved CD scale or LP art.
    const preferredCdSlotSize = configuredAlbumSize * 1.25;
    const requestedDiscSize = Number(visual?.["fullscreen-cd-disc-size"] ?? 100);
    const cdExtent = (Number.isFinite(requestedDiscSize) ? Math.min(140, Math.max(70, requestedDiscSize)) : 100) / 100 * 0.96;
    const viewportHeight = Number(viewport.innerHeight);
    const viewportWidth = Number(viewport.innerWidth);
    // CD size remains a preference, not permission to cover metadata or
    // lyrics on short/narrow windows. Reserve the complete spectrum and
    // the existing title/artist/progress area before fitting the slot.
    const cdHeightLimit = Number.isFinite(viewportHeight) && viewportHeight > 0
        ? Math.max(100, viewportHeight - 280) / Math.max(1, cdExtent) : preferredCdSlotSize;
    const cdWidthLimit = Number.isFinite(viewportWidth) && viewportWidth > 0
        ? Math.max(100, viewportWidth / (visual?.["fullscreen-two-column"] !== false ? 2 : 1) - 112) / Math.max(1, cdExtent) : preferredCdSlotSize;
    const albumSize = cdAlbumActive
        ? Math.min(preferredCdSlotSize, cdHeightLimit, cdWidthLimit)
        : fitFullscreenAlbumSize(configuredAlbumSize, viewportWidth, viewportHeight,
            visual?.["fullscreen-two-column"] !== false);
    const albumRadiusValue = Number(visual?.["fullscreen-album-radius"]);
    const albumRadius = isNaN(albumRadiusValue) ? 12 : albumRadiusValue;
    const vinylAnimationsEnabled = visual?.["fullscreen-vinyl-animations"] !== false;
    const albumClickOpensMode = visual?.["fullscreen-album-open-lp"] !== false;
    const titleSize = Number(visual?.["fullscreen-title-size"]) || 48;
    const artistSize = Number(visual?.["fullscreen-artist-size"]) || 24;

    // UI element settings
    const showClock = visual?.["fullscreen-show-clock"] !== false;
    const clockShowSeconds = visual?.["fullscreen-clock-show-seconds"] === true;
    const clockSize = Number(visual?.["fullscreen-clock-size"]) || 48;
    const showContext = visual?.["fullscreen-show-context"] !== false;
    const showContextImage = visual?.["fullscreen-show-context-image"] !== false;
    const showNextTrack = visual?.["fullscreen-show-next-track"] !== false;
    const nextTrackSeconds = Number(visual?.["fullscreen-next-track-seconds"]) || 15;
    const showControls = visual?.["fullscreen-show-controls"] !== false;
    const showVolume = visual?.["fullscreen-show-volume"] !== false;
    const showProgress = visual?.["fullscreen-show-progress"] !== false;
    const showLyricsProgress = visual?.["fullscreen-show-lyrics-progress"] === true;
    const showQueue = visual?.["fullscreen-show-queue"] !== false;
    const autoHideUI = visual?.["fullscreen-auto-hide-ui"] !== false;
    const autoHideDelay = (Number(visual?.["fullscreen-auto-hide-delay"]) || 3) * 1000;

    // TMI Font size settings
    const tmiScale = getResearchFontSize(visual) / 100;

    // Control style settings
    const controlButtonSize = Number(visual?.["fullscreen-control-button-size"]) || 36;
    const controlsBackground = visual?.["fullscreen-controls-background"] === true;

    // Layout settings
    const controlsPosition = visual?.["fullscreen-controls-position"] || "left-panel";
    const albumShadow = visual?.["fullscreen-album-shadow"] !== false;
    const infoGapVal = visual?.["fullscreen-info-gap"];
    const infoGap = (infoGapVal !== undefined && infoGapVal !== null) ? Number(infoGapVal) : 24;

    // TV Mode settings
    const tvModeEnabled = visual?.["fullscreen-tv-mode"] === true;
    const tvAlbumSize = Number(visual?.["fullscreen-tv-album-size"]) || 140;
    const trimTitleEnabled = visual?.["fullscreen-trim-title"] === true;

    // Normal mode settings
    const normalShowAlbumName = visual?.["fullscreen-show-album-name"] !== false;

    // TV Mode specific settings
    const tvShowAlbumName = visual?.["fullscreen-tv-show-album-name"] !== false;
    const tvShowControls = visual?.["fullscreen-tv-show-controls"] !== false;
    const tvShowProgress = visual?.["fullscreen-tv-show-progress"] !== false;
    const isLayoutReversed = visual?.["fullscreen-layout-reverse"] === true;

    return {
        showAlbum, showInfo, albumSize, albumRadius,
        vinylAnimationsEnabled, albumClickOpensMode, titleSize, artistSize,
        showClock, clockShowSeconds, clockSize, showContext, showContextImage,
        showNextTrack, nextTrackSeconds, showControls, showVolume, showProgress,
        showLyricsProgress, showQueue, autoHideUI, autoHideDelay,
        tmiScale, controlButtonSize, controlsBackground,
        controlsPosition, albumShadow, infoGap,
        tvModeEnabled, tvAlbumSize, trimTitleEnabled, normalShowAlbumName,
        tvShowAlbumName, tvShowControls, tvShowProgress, isLayoutReversed
    };
}

export function getFullscreenVinylSettings(visual) {
    return {
        cdSettings: {
            discSize: visual?.["fullscreen-cd-disc-size"] ?? 100,
            rotationEnabled: visual?.["fullscreen-cd-rotation-enabled"] !== false,
            rotationSpeed: visual?.["fullscreen-cd-rotation-speed"] ?? 100,
            enabled: visual?.["fullscreen-cd-visualizer-enabled"] !== false,
            style: visual?.["fullscreen-cd-visualizer-style"] || "bars",
            colorMode: visual?.["fullscreen-cd-visualizer-color-mode"] || "album",
            albumGradient: visual?.["fullscreen-cd-visualizer-album-gradient"] !== false,
            customColor: visual?.["fullscreen-cd-visualizer-color"] || "#ffffff",
            sensitivity: visual?.["fullscreen-cd-visualizer-sensitivity"] ?? 100,
            density: visual?.["fullscreen-cd-visualizer-density"] ?? 64,
            thickness: visual?.["fullscreen-cd-visualizer-thickness"] ?? 2,
            mirror: visual?.["fullscreen-cd-visualizer-mirror"] === true,
        },
        albumSize: visual?.["fullscreen-vinyl-album-size"] ?? 100,
        recordSize: visual?.["fullscreen-vinyl-record-size"] ?? 100,
        backgroundBlur: visual?.["fullscreen-vinyl-background-blur"] ?? 0,
        animations: visual?.["fullscreen-vinyl-animations"] !== false,
        reducedMotion: visual?.["reduce-motion"] === true,
        trackChangeAnimation: visual?.["fullscreen-vinyl-track-change-animation"] !== false,
        rotationSpeed: visual?.["fullscreen-vinyl-rotation-speed"] ?? 100,
        centerRotation: visual?.["fullscreen-vinyl-center-rotation"] !== false,
        lyricsEnabled: visual?.["fullscreen-vinyl-lyrics-enabled"] !== false,
        // Motion lyrics comfort (MotionLyrics.comfortOf checks the values).
        motion: {
            intensity: visual?.["fullscreen-motion-intensity"] || "normal",
            rotation: visual?.["fullscreen-motion-rotation"] || "full",
            safe: visual?.["fullscreen-motion-safe"] === true,
        },
        tonearmStyle: visual?.["fullscreen-vinyl-tonearm-style"] || "s",
        tonearmFinish: visual?.["fullscreen-vinyl-tonearm-finish"] || "white",
        tonearmSize: visual?.["fullscreen-vinyl-tonearm-size"] ?? 100,
        originalFontFamily: visual?.["fullscreen-vinyl-original-font-family"] || "Pretendard Variable",
        originalFontSize: visual?.["fullscreen-vinyl-original-font-size"] ?? 31,
        originalFontWeight: visual?.["fullscreen-vinyl-original-font-weight"] ?? 600,
        originalOpacity: visual?.["fullscreen-vinyl-original-opacity"] ?? 95,
        originalLetterSpacing: visual?.["fullscreen-vinyl-original-letter-spacing"] ?? 0,
        originalOutlineWidth: visual?.["fullscreen-vinyl-original-outline-width"] ?? 0,
        originalOutlineColor: visual?.["fullscreen-vinyl-original-outline-color"] || "#000000",
        phoneticFontFamily: visual?.["fullscreen-vinyl-phonetic-font-family"] || "Pretendard Variable",
        phoneticFontSize: visual?.["fullscreen-vinyl-phonetic-font-size"] ?? 11,
        phoneticFontWeight: visual?.["fullscreen-vinyl-phonetic-font-weight"] ?? 100,
        phoneticOpacity: visual?.["fullscreen-vinyl-phonetic-opacity"] ?? 70,
        phoneticSpacing: visual?.["fullscreen-vinyl-phonetic-spacing"] ?? -1,
        phoneticLetterSpacing: visual?.["fullscreen-vinyl-phonetic-letter-spacing"] ?? 0,
        phoneticOutlineWidth: visual?.["fullscreen-vinyl-phonetic-outline-width"] ?? 0,
        phoneticOutlineColor: visual?.["fullscreen-vinyl-phonetic-outline-color"] || "#000000",
        translationFontFamily: visual?.["fullscreen-vinyl-translation-font-family"] || "Pretendard Variable",
        translationFontSize: visual?.["fullscreen-vinyl-translation-font-size"] ?? 15,
        translationFontWeight: visual?.["fullscreen-vinyl-translation-font-weight"] ?? 300,
        translationOpacity: visual?.["fullscreen-vinyl-translation-opacity"] ?? 85,
        translationSpacing: visual?.["fullscreen-vinyl-translation-spacing"] ?? 0,
        translationLetterSpacing: visual?.["fullscreen-vinyl-translation-letter-spacing"] ?? 0,
        translationOutlineWidth: visual?.["fullscreen-vinyl-translation-outline-width"] ?? 0,
        translationOutlineColor: visual?.["fullscreen-vinyl-translation-outline-color"] || "#000000",
        culturalFontFamily: visual?.["cultural-annotations-vinyl-font-family"] || "Pretendard Variable",
        culturalFontSize: visual?.["cultural-annotations-vinyl-font-size"] ?? 12,
        culturalFontWeight: visual?.["cultural-annotations-vinyl-font-weight"] ?? 300,
        culturalOpacity: visual?.["cultural-annotations-vinyl-opacity"] ?? 60,
        culturalOutlineWidth: visual?.["cultural-annotations-vinyl-outline-width"] ?? 0,
        culturalOutlineColor: visual?.["cultural-annotations-vinyl-outline-color"] || "#000000",
        videoStageOriginalFontFamily: visual?.["fullscreen-video-stage-original-font-family"] || visual?.["fullscreen-vinyl-original-font-family"] || "Pretendard Variable",
        videoStagePhoneticFontFamily: visual?.["fullscreen-video-stage-phonetic-font-family"] || visual?.["fullscreen-vinyl-phonetic-font-family"] || "Pretendard Variable",
        videoStageTranslationFontFamily: visual?.["fullscreen-video-stage-translation-font-family"] || visual?.["fullscreen-vinyl-translation-font-family"] || "Pretendard Variable",
        videoStageCulturalFontFamily: visual?.["fullscreen-video-stage-cultural-font-family"] || visual?.["cultural-annotations-vinyl-font-family"] || "Pretendard Variable",
        videoStageLyricBackgroundColor: visual?.["fullscreen-video-stage-lyric-background-color"] || "#000000",
        videoStageLyricBackgroundOpacity: visual?.["fullscreen-video-stage-lyric-background-opacity"] ?? 46
    };
}
