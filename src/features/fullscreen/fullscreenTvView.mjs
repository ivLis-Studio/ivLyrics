import { formatTime, getFullscreenSeekPosition } from "./fullscreenPlaybackTiming.mjs";

export function createFullscreenTvView({ react, getPlayer, getPlaybackPosition, renderTvMetadataLines, LyricsProgress }) {
    function useTvPlayhead(tvPlayhead) {
        if (typeof react.useSyncExternalStore === "function") {
            return react.useSyncExternalStore(tvPlayhead.subscribe, tvPlayhead.get);
        }
        const [playhead, setPlayhead] = react.useState(tvPlayhead.get);
        react.useEffect(() => {
            setPlayhead(tvPlayhead.get());
            return tvPlayhead.subscribe(setPlayhead);
        }, [tvPlayhead]);
        return playhead;
    }

    function TvProgress({ tvPlayhead }) {
        const { position, duration } = useTvPlayhead(tvPlayhead);
        return react.createElement("div", { className: "fullscreen-tv-progress" },
            react.createElement("span", { className: "fullscreen-tv-time current" }, formatTime(position)),
            react.createElement("div", {
                className: "fullscreen-tv-progress-bar",
                onClick(event) {
                    const seekPosition = getFullscreenSeekPosition(event.currentTarget, event.clientX, duration);
                    if (seekPosition === null) return;
                    getPlaybackPosition()?.clearSafePlayerProgressCorrection?.();
                    getPlayer().seek(seekPosition);
                },
            },
                react.createElement("div", {
                    className: "fullscreen-tv-progress-fill",
                    style: { width: `${duration > 0 ? (position / duration) * 100 : 0}%` },
                })
            ),
            react.createElement("span", { className: "fullscreen-tv-time total" }, formatTime(duration))
        );
    }

    return function renderFullscreenTv({
        albumInteractionProps, albumRadius, tvAlbumSize, renderAlbumVisual, setTvMetadataRef,
        createNavigationProps, currentTrackUri, currentArtistUri, currentAlbumUri,
        displayMetadata, trimTitleEnabled, tvShowAlbumName,
        showLyricsProgress, tvShowControls, tvShowProgress, uiVisible, currentLyricIndex, totalLyrics,
        isPlaying, tvPlayhead,
    }) {
        const { title, artist, albumName, releaseYear, translated: translatedMetadata } = displayMetadata;
        return react.createElement(react.Fragment, null,
                react.createElement("div", {
                    className: "fullscreen-tv-song-info",
                    style: { "--fullscreen-tv-album-size": `${tvAlbumSize}px` }
                },
                    // TV mode keeps the plain album artwork. Context click or hold opens TMI.
                    react.createElement("div", {
                        ...albumInteractionProps,
                        className: "fullscreen-tv-album-wrapper clickable-album-container",
                        style: {
                            width: `${tvAlbumSize}px`,
                            height: `${tvAlbumSize}px`,
                            position: 'relative',
                            cursor: 'pointer',
                            borderRadius: `${albumRadius}px`,
                            flexShrink: 0
                        }
                    },
                        renderAlbumVisual({
                            coverClassName: "fullscreen-tv-album ivlyrics-fullscreen-shared-album",
                            coverStyle: {
                                width: '100%',
                                height: '100%',
                                borderRadius: `${albumRadius}px`
                            }
                        })
                    ),
                    // Track info (Title, Artist, Album)
                    react.createElement("div", { className: "fullscreen-tv-track-info", ref: setTvMetadataRef },
                      react.createElement("div", { className: "fullscreen-tv-metadata-stack" },
                        // Title (honors the same metadata display mode as normal fullscreen)
                        react.createElement("div", {
                            ...createNavigationProps(currentTrackUri, "fullscreen-tv-title-container")
                        },
                            renderTvMetadataLines({
                                trimTitleEnabled,
                                type: "title",
                                original: title,
                                translated: translatedMetadata?.translated?.title,
                                romanized: translatedMetadata?.romanized?.title,
                                fontSize: Math.round(tvAlbumSize * 0.26)
                            })
                        ),
                        // Artist (honors the same metadata display mode as normal fullscreen)
                        react.createElement("div", {
                            ...createNavigationProps(currentArtistUri, "fullscreen-tv-artist-container")
                        },
                            renderTvMetadataLines({
                                trimTitleEnabled,
                                type: "artist",
                                original: artist,
                                translated: translatedMetadata?.translated?.artist,
                                romanized: translatedMetadata?.romanized?.artist,
                                fontSize: Math.round(tvAlbumSize * 0.16)
                            })
                        ),
                        // Album name (from context)
                        tvShowAlbumName && react.createElement("div", createNavigationProps(currentAlbumUri, "fullscreen-tv-album-name"),
                            albumName ? `${albumName}${releaseYear ? ` • ${releaseYear}` : ""}` : ""
                        )
                      )
                    )
                ),
                // TV Mode Controls & Progress (right side)
                (showLyricsProgress || tvShowControls || tvShowProgress) && react.createElement("div", {
                    className: `fullscreen-tv-controls-wrapper ${!uiVisible ? 'hidden' : ''}`
                },
                    // Keep lyric progress in the same stack so it cannot overlap TV controls.
                    showLyricsProgress && react.createElement(LyricsProgress, {
                        show: true,
                        currentLine: currentLyricIndex,
                        totalLines: totalLyrics
                    }),
                    // TV Mode Controls
                    tvShowControls && react.createElement("div", {
                        className: "fullscreen-tv-controls"
                    },
                        // Previous button
                        react.createElement("button", {
                            className: "fullscreen-tv-control-btn",
                            onClick: () => getPlayer().back(),
                            title: "Previous"
                        },
                            react.createElement("svg", {
                                width: "24", height: "24", viewBox: "0 0 16 16", fill: "currentColor"
                            },
                                react.createElement("path", { d: "M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z" })
                            )
                        ),
                        // Play/Pause button
                        react.createElement("button", {
                            className: "fullscreen-tv-control-btn play-pause",
                            onClick: () => getPlayer().togglePlay()
                        },
                            isPlaying
                                ? react.createElement("svg", {
                                    width: "32", height: "32", viewBox: "0 0 16 16", fill: "currentColor"
                                },
                                    react.createElement("path", { d: "M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z" })
                                )
                                : react.createElement("svg", {
                                    width: "32", height: "32", viewBox: "0 0 16 16", fill: "currentColor"
                                },
                                    react.createElement("path", { d: "M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z" })
                                )
                        ),
                        // Next button
                        react.createElement("button", {
                            className: "fullscreen-tv-control-btn",
                            onClick: () => getPlayer().next(),
                            title: "Next"
                        },
                            react.createElement("svg", {
                                width: "24", height: "24", viewBox: "0 0 16 16", fill: "currentColor"
                            },
                                react.createElement("path", { d: "M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z" })
                            )
                        )
                    ),
                    tvShowProgress && react.createElement(TvProgress, { tvPlayhead })
                )
        );
    };
}
