// Keep the outgoing artwork briefly while a new track's background is being
// resolved.  This avoids a black flash when YouTube or the helper takes a
// moment to produce its first frame.
export const FALLBACK_CROSSFADE_MS = 420;

const normalizeVideoFallbackBackground = (value) =>
    ["album-cover", "blur-gradient", "solid"].includes(value) ? value : "album-cover";

// A single overlay dims both the fallback and video. Dimming artwork here too
// would square the slider value (50% became 25%).
const getVideoFallbackStyle = ({ mode, albumArtUrl, blurAmount = 0, solidColor, gradientStyle = {} }) => {
    const selected = normalizeVideoFallbackBackground(mode);
    const base = {
        position: "absolute", inset: 0, width: "100%", height: "100%",
        backgroundColor: "var(--spice-main, #121212)", zIndex: 0, pointerEvents: "none",
    };
    if (selected === "solid") {
        return { ...base, backgroundColor: solidColor || "var(--spice-main, #121212)" };
    }
    if (selected === "blur-gradient") {
        return {
            ...base, ...gradientStyle,
            backgroundColor: "rgb(var(--ivLyrics-c1, 30, 30, 40))",
            filter: "saturate(2.5)",
        };
    }
    const blur = Math.min(Math.max(Number(blurAmount) || 0, 0), 80);
    return {
        ...base,
        backgroundImage: albumArtUrl ? `url(${albumArtUrl})` : "none",
        backgroundSize: "cover", backgroundPosition: "center",
        filter: blur ? `blur(${blur}px)` : "none",
        transform: "translateZ(0) scale(1.1)",
    };
};

const computeVideoBackgroundTransform = ({ brightness, blurAmount, coverMode, videoScale }) => {
    const brightnessValue = Math.min(Math.max(Number(brightness) || 0, 0), 100);
    const brightnessRatio = brightnessValue / 100;
    const blurValue = Math.min(Math.max(Number(blurAmount) || 0, 0), 80);
    const useCoverMode = coverMode === true;
    const videoScaleValue = Math.min(Math.max(Number(videoScale) || 105, 50), 200);
    const videoScaleRatio = videoScaleValue / 100;
    const videoScaleTransform = videoScaleRatio !== 1 ? ` scale(${videoScaleRatio})` : "";
    const blurCompositeStyle = blurValue ? {
        willChange: "filter, transform, opacity",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        contain: "paint",
    } : {};
    const videoTransform = useCoverMode
        ? `translate3d(-50%, -50%, 0)${videoScaleTransform}`
        : (blurValue || videoScaleTransform ? `translateZ(0)${videoScaleTransform}` : undefined);
    return {
        brightnessRatio, blurValue, useCoverMode, blurCompositeStyle, videoTransform,
    };
};

export function renderVideoBackground({
    react, brightness, blurAmount, coverMode, videoScale, fallbackBackground, fallbackSolidColor, fallbackGradientStyle,
    albumArtUrl, previousFallbackUrl, isPlayerReady, isPlaying, videoRef, containerRef, useHelper, showStats, stats,
}) {
    const { brightnessRatio, blurValue, useCoverMode, blurCompositeStyle, videoTransform } =
        computeVideoBackgroundTransform({ brightness, blurAmount, coverMode, videoScale });

    // Keep the outgoing artwork visible while the next video is loading.
    const fallbackMode = normalizeVideoFallbackBackground(fallbackBackground);
    const fallbackStyle = getVideoFallbackStyle({
        mode: fallbackMode, albumArtUrl, blurAmount: blurValue,
        solidColor: fallbackSolidColor, gradientStyle: fallbackGradientStyle,
    });
    const hasOutgoingArtwork = fallbackMode === "album-cover" && previousFallbackUrl && previousFallbackUrl !== albumArtUrl;
    const renderFallback = () => react.createElement(
        react.Fragment,
        null,
        hasOutgoingArtwork && react.createElement("div", {
            className: "ivlyrics-video-background-fallback ivlyrics-video-background-fallback-outgoing",
            style: {
                ...fallbackStyle,
                backgroundImage: `url(${previousFallbackUrl})`,
                zIndex: 0,
            },
        }),
        react.createElement("div", {
            className: `ivlyrics-video-background-fallback${hasOutgoingArtwork ? " ivlyrics-video-background-fallback-incoming" : ""}${fallbackMode === "blur-gradient" ? " color-gradient-bg" : ""}`,
            "data-fallback-background": fallbackMode,
            style: {
                ...fallbackStyle,
                zIndex: 0,
            },
        }, fallbackMode === "blur-gradient" && [1, 2, 3, 4, 5, 6].map((index) =>
            react.createElement("div", { key: index, className: `gradient-blob blob-${index}` })))
    );

    // 헬퍼 모드용 video 태그 스타일
    const helperVideoStyle = {
        position: "absolute",
        top: useCoverMode ? "50%" : 0,
        left: useCoverMode ? "50%" : 0,
        width: useCoverMode ? "177.78vh" : "100%",
        height: useCoverMode ? "56.25vw" : "100%",
        minWidth: useCoverMode ? "100%" : undefined,
        minHeight: useCoverMode ? "100%" : undefined,
        transform: videoTransform,
        opacity: isPlayerReady && isPlaying ? 1 : 0,
        transition: "opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
        zIndex: 1,
        pointerEvents: "none",
        filter: blurValue ? `blur(${blurValue}px)` : "none",
        objectFit: useCoverMode ? "cover" : "contain",
        ...blurCompositeStyle,
    };

    const renderStatsPanel = () =>
        react.createElement("div", {
            style: {
                position: "absolute",
                top: "20px",
                right: "20px",
                zIndex: 100,
                background: "rgba(0, 0, 0, 0.85)",
                backdropFilter: "blur(10px)",
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                fontFamily: "monospace",
                fontSize: "12px",
                color: "#fff",
                minWidth: "200px",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
            }
        },
            react.createElement("div", {
                style: { marginBottom: "8px", fontWeight: "bold", fontSize: "13px" }
            }, "  Video Stats"),
            react.createElement("div", {
                style: { display: "flex", justifyContent: "space-between", marginBottom: "4px" }
            },
                react.createElement("span", {}, "Quality:"),
                react.createElement("span", { style: { color: "#1DB954" } }, stats.quality)
            ),
            react.createElement("div", {
                style: { display: "flex", justifyContent: "space-between", marginBottom: "4px" }
            },
                react.createElement("span", {}, "Resolution:"),
                react.createElement("span", { style: { color: "#1DB954" } }, stats.resolution)
            ),
            react.createElement("div", {
                style: { display: "flex", justifyContent: "space-between", marginBottom: "4px" }
            },
                react.createElement("span", {}, "Buffered:"),
                react.createElement("span", { style: { color: "#1DB954" } }, stats.buffered)
            ),
            react.createElement("div", {
                style: { display: "flex", justifyContent: "space-between", marginBottom: "4px" }
            },
            react.createElement("span", {}, "Source:"),
            react.createElement("span", {
                style: {
                    color: stats.videoHelper?.includes("Helper") ? "#ff9800" : "#1DB954",
                    fontWeight: "bold"
                }
            }, stats.videoHelper)
            ),

            react.createElement("div", {
                style: { display: "flex", justifyContent: "space-between", marginBottom: "4px" }
            },
                react.createElement("span", {}, "Helper Status:"),
                react.createElement("span", {
                style: {
                    color:
                        stats.helperStatus === "ready" ? "#1DB954" :
                        stats.helperStatus === "downloading" ? "#ff9800" :
                        stats.helperStatus === "not-connected" ? "#ff5252" :
                        "#888",
                    fontWeight: "bold"
                    }
            }, stats.helperStatus)
            ),


            react.createElement("div", {
                style: {
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "8px",
                    paddingTop: "8px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.1)"
                }
            },
                react.createElement("span", {}, "Video ID:"),
                react.createElement("span", {
                    style: {
                        color: "#888",
                        fontSize: "10px",
                        maxWidth: "100px",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                    }
                }, stats.videoId)
            ),
            react.createElement("div", {
                style: {
                    marginTop: "8px",
                    paddingTop: "8px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    fontSize: "10px",
                    color: "#888",
                    textAlign: "center"
                }
            }, "Press Shift+S to toggle")
         );

    const renderHelperVideo = () =>
        react.createElement("video", {
            ref: videoRef,
            className: "ivlyrics-video-background-media",
            style: helperVideoStyle,
            muted: true,
            playsInline: true,
            loop: false,
        });

    const renderYouTubeContainer = () =>
        react.createElement("div", {
            ref: containerRef,
            className: "ivlyrics-video-background-media",
            style: {
                position: "absolute",
                top: useCoverMode ? "50%" : 0,
                left: useCoverMode ? "50%" : 0,
                width: useCoverMode ? "177.78vh" : "100%", // 16:9 aspect ratio: 100vh * 16/9
                height: useCoverMode ? "56.25vw" : "100%", // 16:9 aspect ratio: 100vw * 9/16
                minWidth: useCoverMode ? "100%" : undefined,
                minHeight: useCoverMode ? "100%" : undefined,
                transform: videoTransform,
                opacity: isPlayerReady && isPlaying ? 1 : 0, // Hide when paused or not ready
                transition: "opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
                zIndex: 1,
                pointerEvents: "none",
                filter: blurValue ? `blur(${blurValue}px)` : "none",
                ...blurCompositeStyle,
            }
        });

    const renderBrightnessOverlay = () =>
        react.createElement("div", {
            style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "black",
                opacity: 1 - brightnessRatio,
                zIndex: 2,
                pointerEvents: "none"
            }
        });

    return react.createElement("div", {
        style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            zIndex: 0,
            isolation: "isolate",
        }
    },
        // Everything that fills the frame sits in one layer that motion lyrics
        // turns and zooms with its camera (it stays put everywhere else).
        react.createElement("div", { className: "ivlyrics-video-background-camera" },
            renderFallback(),
            // 헬퍼 모드: HTML5 video 태그
            useHelper && renderHelperVideo(),
            // 일반 모드: YouTube IFrame 컨테이너
            !useHelper && renderYouTubeContainer(),
            renderBrightnessOverlay()
        ),
        showStats && renderStatsPanel()
    );
}
