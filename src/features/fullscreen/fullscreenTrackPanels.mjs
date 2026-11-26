export function getFullscreenTrackPanelLayout({ settings, isPortraitViewport, isTwoColumn }) {
    const { tvModeEnabled, showAlbum, showInfo, showControls, controlsPosition } = settings;
    const portrait = isPortraitViewport && !tvModeEnabled;
    return {
        portrait,
        landscape: !portrait && !tvModeEnabled && isTwoColumn && (showAlbum || showInfo || controlsPosition === "left-panel"),
        leftControls: controlsPosition === "left-panel" && showControls,
        bottomControls: controlsPosition === "bottom" && showControls,
    };
}

export function createFullscreenTrackPanels({
    react, PlayerControls, ProgressBar, buildOverlayMetadataLines, renderPortraitMetadataLines, trimTitle,
}) {
    const element = react.createElement;

    function renderAlbum({ settings, album, portrait }) {
        if (!settings.showAlbum) return null;
        const { albumRadius, albumSize, albumShadow } = settings;
        const containerClass = portrait ? "portrait-album-container" : "lyrics-fullscreen-album-container";
        const coverClass = portrait ? "portrait-album-art" : "lyrics-fullscreen-album-art";
        const borderRadius = `${albumRadius}px`;
        const size = `${albumSize}px`;
        const containerStyle = portrait ? {} : {
            width: size, height: size, maxWidth: size, position: "relative", cursor: "pointer",
        };
        const coverStyle = portrait ? {} : { width: "100%", height: "100%" };
        return element("div", {
            ...album.interactionProps,
            className: `${containerClass} clickable-album-container`,
            style: { ...album.cdSlotStyle, ...containerStyle, borderRadius },
        }, album.renderVisual({
            coverClassName: `${coverClass} ivlyrics-fullscreen-shared-album ${albumShadow ? "with-shadow" : ""}`,
            coverStyle: { ...coverStyle, borderRadius },
        }), album.renderHint());
    }

    function renderTrackInfo({ settings, track, createNavigationProps, portrait, metadataMode }) {
        if (!settings.showInfo) return null;
        const { currentTrackUri, currentArtistUri, currentAlbumUri, displayMetadata } = track;
        const { normalShowAlbumName, titleSize, artistSize, trimTitleEnabled } = settings;
        const applyTrim = trimTitleEnabled ? trimTitle : value => value;

        function renderMetadata(type, uri, mainSize, translatedScale, romanizedScale) {
            const original = displayMetadata[type];
            const translated = displayMetadata.translated?.translated?.[type];
            const romanized = displayMetadata.translated?.romanized?.[type];
            if (portrait) {
                return renderPortraitMetadataLines({ type, original, translated, romanized, uri, trimTitleEnabled, createNavigationProps });
            }
            const className = `lyrics-fullscreen-${type}`;
            return element("div", createNavigationProps(uri, `${className}-container`), buildOverlayMetadataLines({
                mode: metadataMode, original, translated, romanized, applyTrim, keyPrefix: type,
                mainClass: className, translatedClass: `${className}-translated`, romanizedClass: `${className}-romanized`,
                mainSize, translatedSize: Math.round(mainSize * translatedScale), romanizedSize: Math.round(mainSize * romanizedScale),
                includeRomanizedInAll: type === "title",
            }));
        }

        const albumClass = portrait ? "portrait-track-album-name" : "lyrics-fullscreen-album-name";
        return element("div", { className: portrait ? "portrait-track-info" : "lyrics-fullscreen-track-info" },
            renderMetadata("title", currentTrackUri, titleSize, 0.6, 0.5),
            renderMetadata("artist", currentArtistUri, artistSize, 0.8, 0.8),
            normalShowAlbumName && element("div", {
                ...createNavigationProps(currentAlbumUri, albumClass),
                style: portrait ? undefined : { fontSize: `${Math.round(artistSize * 0.85)}px` },
            }, displayMetadata.albumName)
        );
    }

    function getPlaybackControlProps(settings) {
        return {
            show: true, showVolume: settings.showVolume, buttonSize: settings.controlButtonSize,
            showBackground: settings.controlsBackground,
        };
    }

    function renderPortraitOverlays({ settings, album, track, uiVisible, createNavigationProps }) {
        const { showAlbum, showInfo, showControls, showProgress, isLayoutReversed } = settings;
        const classes = `${!uiVisible ? "hidden" : ""} ${isLayoutReversed ? "layout-reversed" : ""}`;
        return element(react.Fragment, null,
            (showAlbum || showInfo) && element("div", { className: `portrait-overlay-top ${classes}` },
                renderAlbum({ settings, album, portrait: true }),
                renderTrackInfo({ settings, track, createNavigationProps, portrait: true })
            ),
            (showControls || showProgress) && element("div", { className: `portrait-overlay-bottom ${classes}` },
                showProgress && element(ProgressBar, { show: true }),
                showControls && element(PlayerControls, getPlaybackControlProps(settings))
            )
        );
    }

    function renderLandscapePanel({
        settings, album, track, uiVisible, createNavigationProps, metadataMode, showLeftControls,
        revealEnabled, reveal, renderResearchView, albumPanelRef, controlsRef,
    }) {
        const { showAlbum, showControls, showProgress, albumSize, infoGap } = settings;
        // Pointer-capable devices which auto-hide controls reveal them from the
        // album column. Other presentations use the overlay's idle timer.
        const hoverGate = revealEnabled && reveal.pointerCanHover;
        const hidden = hoverGate ? !reveal.leftControlsRevealed : !uiVisible;
        const controlClassName = `fullscreen-left-controls${hidden ? " hidden" : ""}`;
        const setHoverSource = reveal.setControlsHoverSource;
        return element("div", {
            className: `lyrics-fullscreen-left-panel ${hidden && showLeftControls ? "controls-hidden" : ""} ${renderResearchView ? "tmi-mode" : ""}`,
            ref: albumPanelRef,
        },
            hoverGate && element("div", {
                className: "lyrics-fullscreen-hover-zone",
                style: { width: `${Math.round(albumSize * 1.15)}px` },
                onMouseEnter: () => setHoverSource("zone", true),
                onMouseLeave: () => setHoverSource("zone", false),
            }),
            renderResearchView ? renderResearchView(true) : element("div", {
                className: "lyrics-fullscreen-left-content",
                onMouseEnter: () => setHoverSource("content", true),
                onMouseLeave: () => setHoverSource("content", false),
                style: {
                    gap: `${infoGap}px`,
                    "--iv-fullscreen-controller-max-width": showAlbum ? `${albumSize * (album.cdActive ? album.cdScale : 1)}px` : undefined,
                },
            },
                renderAlbum({ settings, album, portrait: false }),
                renderTrackInfo({ settings, track, metadataMode, createNavigationProps, portrait: false }),
                showLeftControls && element("div", {
                    className: `${controlClassName} left-controls-player`,
                    ref: controlsRef,
                    onMouseEnter: () => setHoverSource("controls", true),
                    onMouseLeave: () => setHoverSource("controls", false),
                    onFocus: event => reveal.setControlsFocusHold(event?.target, true),
                    onBlur: event => {
                        if (event?.relatedTarget && event.currentTarget?.contains?.(event.relatedTarget)) return;
                        reveal.setControlsFocusHold(null, false);
                    },
                    onMouseDown: reveal.beginControlsDragHold,
                }, element(PlayerControls, { ...getPlaybackControlProps(settings), showProgress })),
                !showControls && showProgress && element("div", { className: `${controlClassName} left-controls-progress-only` },
                    element(ProgressBar, { show: true })
                )
            )
        );
    }

    return { renderLandscapePanel, renderPortraitOverlays };
}
