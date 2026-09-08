// Focused fullscreen LP player mode.
//
// FullscreenOverlay owns only the entry gesture and supplies playback data.
// This module owns the vinyl scene, tonearm interaction, lyric surface, and
// track-to-track transition so the regular fullscreen layout stays isolated.
const VinylPlayerMode = (() => {
    const react = Spicetify.React;
    const { useState, useEffect, useCallback, useRef } = react;

    const formatTime = (ms) => {
        if (!ms || ms < 0) return "0:00";
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const VINYL_PLAY_PHASES = [
        ["unsleeving", 0],
        ["cover-turning", 460],
        ["lifting", 780],
        ["settling", 1000],
        ["dropping", 1560],
        ["playing", 2280]
    ];

    const VINYL_PAUSE_PHASES = [
        ["pausing", 0],
        ["clearing", 720],
        ["sleeving", 1180],
        ["sleeved", 1250],
        ["paused", 2030]
    ];

    const TRACK_RECORD_CLEAR_MS = 180;
    const TRACK_RECORD_SLEEVE_MS = 680;
    const TRACK_ALBUM_DEPART_MS = 480;
    const TRACK_ALBUM_ARRIVE_MS = 700;
    const TRACK_RECORD_EMERGE_MS = 720;
    const TRACK_RECORD_RAISE_MS = 360;
    const TRACK_HANDOFF_MS = 96;
    const TRACK_COVER_PRELOAD_MAX_MS = 320;
    const VINYL_FALLBACK_ACCENT = "var(--spice-button-active, #ff809d)";
    const VINYL_SEEK_END_GUARD_MIN_MS = 250;
    const VINYL_SEEK_END_GUARD_MAX_MS = 500;
    const PRESENTATION_MODES = Object.freeze([
        "standard",
        "vinyl",
        "compact-vinyl",
        "video"
    ]);
    const normalizePresentationMode = (value) => {
        const normalized = String(value || "").trim();
        return PRESENTATION_MODES.includes(normalized) ? normalized : "vinyl";
    };

    const clampVinylProgress = (value) => Math.min(Math.max(value, 0), 1);
    const clampVinylSeekPosition = (value, duration) => {
        const safeDuration = Math.max(Number(duration) || 0, 0);
        const safeValue = Math.max(Number(value) || 0, 0);
        if (safeDuration <= 0) return safeValue;

        const endGuard = Math.min(
            safeDuration,
            Math.max(
                VINYL_SEEK_END_GUARD_MIN_MS,
                Math.min(VINYL_SEEK_END_GUARD_MAX_MS, safeDuration * 0.02)
            )
        );
        return Math.min(safeValue, Math.max(safeDuration - endGuard, 0));
    };
    const VINYL_TONEARM_MIN_ANGLE = -5.4;
    const VINYL_TONEARM_MAX_ANGLE = 18;
    const VINYL_TONEARM_EJECT_ANGLE = -8.2;
    const VINYL_TONEARM_REST_ANGLE = -14;
    const VINYL_TONEARM_CUE_PLAY_ANGLE = -7.2;
    const VINYL_TONEARM_LINEAR_REST_PROGRESS = -0.44;
    const VINYL_TONEARM_LINEAR_EJECT_PROGRESS = -0.2;
    const VINYL_TONEARM_LINEAR_CUE_PLAY_PROGRESS = -0.08;
    const VINYL_TONEARM_LINEAR_TRAVEL = 95;
    const VINYL_POINTER_RELEASE_GRACE_MS = 90;
    const VINYL_TONEARM_STYLES = new Set(["s", "straight", "j", "linear"]);
    const VINYL_TONEARM_FINISHES = new Set(["white", "silver", "black"]);
    const normalizeTonearmStyle = (value) => VINYL_TONEARM_STYLES.has(value) ? value : "s";
    const normalizeTonearmFinish = (value) => VINYL_TONEARM_FINISHES.has(value) ? value : "white";
    const VINYL_TONEARM_PATHS = Object.freeze({
        s: {
            tube: "M 189 75 C 184 172 151 330 78 474 L 58 513",
            highlight: "M 184 79 C 178 179 145 330 74 469"
        },
        straight: {
            tube: "M 189 75 L 58 513",
            highlight: "M 184 79 L 53 508"
        },
        j: {
            tube: "M 189 75 L 181 372 C 179 432 139 481 58 513",
            highlight: "M 184 79 L 175 369 C 173 424 135 474 55 507"
        }
    });
    const VINYL_TONEARM_APPEARANCES = Object.freeze({
        white: {
            base: ["#fff", "#fbfbfb", "#eee"],
            tube: ["#aaa", "#fafafa", "#fff", "#bbb"],
            housing: "rgba(252, 252, 252, .97)",
            housingEdge: "rgba(230, 230, 230, .8)",
            highlight: "rgba(255, 255, 255, .95)",
            needle: "#eee"
        },
        silver: {
            base: ["#f4f4f5", "#bfc1c5", "#777a80"],
            tube: ["#55585d", "#dadce0", "#f7f7f8", "#73767b"],
            housing: "rgba(184, 187, 192, .98)",
            housingEdge: "rgba(98, 101, 107, .88)",
            highlight: "rgba(255, 255, 255, .76)",
            needle: "#b9bcc1"
        },
        black: {
            base: ["#55565a", "#242529", "#08090b"],
            tube: ["#050506", "#55565a", "#1d1e21", "#020203"],
            housing: "rgba(24, 25, 28, .98)",
            housingEdge: "rgba(91, 93, 99, .9)",
            highlight: "rgba(255, 255, 255, .34)",
            needle: "#a9abb0"
        }
    });

    const VinylDisc = react.memo(({
        title,
        artist,
        album,
        idPrefix
    }) => {
        const albumCopySource = String(album || "ivLyrics").trim();
        const albumCopy = albumCopySource.length > 42
            ? `${albumCopySource.slice(0, 39)}…`
            : albumCopySource;
        const topArcId = `${idPrefix}-arc-top`;
        const bottomArcId = `${idPrefix}-arc-bottom`;

        return react.createElement("span", { className: "ivlyrics-vinyl-record" },
            react.createElement("span", { className: "ivlyrics-vinyl-motion" }),
            react.createElement("span", { className: "ivlyrics-vinyl-label" },
                react.createElement("span", { className: "ivlyrics-vinyl-label-ring" }),
                react.createElement("svg", {
                    className: "ivlyrics-vinyl-label-copy",
                    viewBox: "0 0 320 320",
                    "aria-hidden": "true"
                },
                    react.createElement("defs", null,
                        react.createElement("path", {
                            id: topArcId,
                            d: "M 45 154 A 116 116 0 0 1 275 154"
                        }),
                        react.createElement("path", {
                            id: bottomArcId,
                            d: "M 45 178 A 116 116 0 0 0 275 178"
                        })
                    ),
                    react.createElement("text", { className: "ivlyrics-vinyl-label-arc-text" },
                        react.createElement("textPath", {
                            href: `#${topArcId}`,
                            startOffset: "50%",
                            textAnchor: "middle"
                        }, albumCopy)
                    ),
                    react.createElement("text", { className: "ivlyrics-vinyl-label-arc-text" },
                        react.createElement("textPath", {
                            href: `#${bottomArcId}`,
                            startOffset: "50%",
                            textAnchor: "middle"
                        }, albumCopy)
                    )
                ),
                react.createElement("span", { className: "ivlyrics-vinyl-label-title" }, title || "LP"),
                react.createElement("span", { className: "ivlyrics-vinyl-label-artist" }, artist || ""),
                react.createElement("span", { className: "ivlyrics-vinyl-label-spindle" })
            )
        );
    });

    const PRESENTATION_OPTIONS = Object.freeze([
        {
            id: "standard",
            labelKey: "vinyl.presentation.standardLabel",
            fallback: "Standard",
            icon: "standard"
        },
        {
            id: "compact-vinyl",
            labelKey: "vinyl.presentation.compactLabel",
            fallback: "Compact vinyl",
            icon: "compact"
        },
        {
            id: "vinyl",
            labelKey: "vinyl.presentation.vinylLabel",
            fallback: "Full vinyl",
            icon: "vinyl"
        },
        {
            id: "video",
            labelKey: "vinyl.presentation.videoLabel",
            fallback: "Video stage",
            icon: "video"
        }
    ]);

    const PresentationIcon = ({ name }) => {
        if (name === "standard") {
            return react.createElement("svg", {
                viewBox: "0 0 24 24",
                "aria-hidden": "true"
            },
                react.createElement("rect", {
                    x: 3,
                    y: 5,
                    width: 18,
                    height: 14,
                    rx: 3
                }),
                react.createElement("path", { d: "M10 5v14" })
            );
        }
        if (name === "vinyl") {
            return react.createElement("svg", {
                viewBox: "0 0 24 24",
                "aria-hidden": "true"
            },
                react.createElement("rect", {
                    x: 3,
                    y: 5,
                    width: 9,
                    height: 14,
                    rx: 2
                }),
                react.createElement("circle", { cx: 15, cy: 12, r: 6 }),
                react.createElement("circle", { cx: 15, cy: 12, r: 1.5 })
            );
        }
        if (name === "compact") {
            return react.createElement("svg", {
                viewBox: "0 0 24 24",
                "aria-hidden": "true"
            },
                react.createElement("circle", { cx: 12, cy: 12, r: 8 }),
                react.createElement("circle", { cx: 12, cy: 12, r: 2 })
            );
        }
        return react.createElement("svg", {
            viewBox: "0 0 24 24",
            "aria-hidden": "true"
        },
            react.createElement("rect", {
                x: 3,
                y: 5,
                width: 18,
                height: 14,
                rx: 3
            }),
            react.createElement("path", { d: "m10 9 5 3-5 3z" })
        );
    };

    const PresentationSwitcher = react.memo(({
        activeMode,
        visible = true,
        onChange
    }) => {
        const groupLabel = I18n.t("vinyl.presentation.switcherLabel")
            || "Fullscreen presentation";

        return react.createElement("div", {
            className: `fullscreen-presentation-dock${visible ? "" : " is-hidden"}`
        },
            react.createElement("div", {
                className: "fullscreen-presentation-hotspot",
                "aria-hidden": "true"
            }),
            react.createElement("div", {
                className: "fullscreen-presentation-switcher",
                role: "group",
                "aria-label": groupLabel
            },
                PRESENTATION_OPTIONS.map((option) => {
                    const label = I18n.t(option.labelKey) || option.fallback;
                    const active = activeMode === option.id;
                    return react.createElement("button", {
                        key: option.id,
                        type: "button",
                        className: `fullscreen-presentation-option${active ? " active" : ""}`,
                        "aria-pressed": active,
                        "aria-label": label,
                        title: label,
                        onClick: (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onChange?.(option.id);
                        }
                    },
                        react.createElement(PresentationIcon, { name: option.icon }),
                        react.createElement("span", null, label)
                    );
                })
            )
        );
    });

    const StagePlaybackControls = react.memo(({
        isPlaying = false,
        position = 0,
        duration = 0,
        showControls = true,
        showProgress = true,
        onPrevious,
        onTogglePlayback,
        onNext,
        onSeek
    }) => {
        const [seekPreview, setSeekPreview] = useState(null);
        const safeDuration = Math.max(Number(duration) || 0, 0);
        const safePosition = Math.min(
            safeDuration || Number.MAX_SAFE_INTEGER,
            Math.max(Number(position) || 0, 0)
        );
        const displayedPosition = seekPreview === null
            ? safePosition
            : seekPreview;
        const groupLabel = I18n.t("settingsAdvanced.fullscreenUI.showControls.desc")
            || "Player controls";
        const progressLabel = I18n.t("settingsAdvanced.fullscreenUI.showProgressBar.desc")
            || "Playback position";

        const previewSeek = useCallback((event) => {
            setSeekPreview(Number(event.currentTarget.value) || 0);
        }, []);

        const commitSeek = useCallback((event) => {
            const nextPosition = Math.max(Number(event.currentTarget.value) || 0, 0);
            setSeekPreview(null);
            onSeek?.(nextPosition);
        }, [onSeek]);

        if (!showControls && !showProgress) return null;

        const renderIconButton = ({
            key,
            className = "",
            label,
            icon,
            onClick
        }) => react.createElement("button", {
            key,
            type: "button",
            className: `fullscreen-stage-control-button ${className}`.trim(),
            onClick,
            "aria-label": label,
            title: label
        },
            react.createElement("svg", {
                viewBox: "0 0 16 16",
                fill: "currentColor",
                "aria-hidden": "true",
                dangerouslySetInnerHTML: { __html: icon || "" }
            })
        );

        return react.createElement("div", {
            className: "fullscreen-stage-controls-dock",
            role: "group",
            tabIndex: 0,
            "aria-label": groupLabel
        },
            react.createElement("div", {
                className: "fullscreen-stage-controls-surface"
            },
                showProgress && react.createElement("div", {
                    className: "fullscreen-stage-controls-progress"
                },
                    react.createElement("span", {
                        className: "fullscreen-stage-controls-time"
                    }, formatTime(displayedPosition)),
                    react.createElement("input", {
                        className: "fullscreen-stage-controls-range",
                        type: "range",
                        min: 0,
                        max: Math.max(safeDuration, 1),
                        step: 250,
                        value: Math.min(displayedPosition, Math.max(safeDuration, 1)),
                        disabled: safeDuration <= 0,
                        "aria-label": progressLabel,
                        onPointerDown: (event) => {
                            event.currentTarget.setPointerCapture?.(event.pointerId);
                        },
                        onInput: previewSeek,
                        onChange: previewSeek,
                        onPointerUp: commitSeek,
                        onPointerCancel: () => setSeekPreview(null),
                        onKeyUp: commitSeek,
                        onBlur: seekPreview === null ? undefined : commitSeek
                    }),
                    react.createElement("span", {
                        className: "fullscreen-stage-controls-time"
                    }, formatTime(safeDuration))
                ),
                showControls && react.createElement("div", {
                    className: "fullscreen-stage-controls-buttons"
                }, [
                    renderIconButton({
                        key: "previous",
                        label: I18n.t("fullscreen.controls.previous") || "Previous",
                        icon: Spicetify.SVGIcons["skip-back"],
                        onClick: onPrevious
                    }),
                    renderIconButton({
                        key: "play-pause",
                        className: "is-primary",
                        label: isPlaying
                            ? (I18n.t("fullscreen.controls.pause") || "Pause")
                            : (I18n.t("fullscreen.controls.play") || "Play"),
                        icon: isPlaying
                            ? Spicetify.SVGIcons.pause
                            : Spicetify.SVGIcons.play,
                        onClick: onTogglePlayback
                    }),
                    renderIconButton({
                        key: "next",
                        label: I18n.t("fullscreen.controls.next") || "Next",
                        icon: Spicetify.SVGIcons["skip-forward"],
                        onClick: onNext
                    })
                ])
            )
        );
    });

    const CompactVinyl = react.memo(({
        track,
        isPlaying,
        centerRotationEnabled,
        recordScale = 1,
        interactionProps = {}
    }) => {
        const label = I18n.t("vinyl.closeHint") || "Return to standard view";
        return react.createElement("button", {
            ...interactionProps,
            type: "button",
            className: [
                "ivlyrics-compact-vinyl-stage",
                isPlaying ? "is-playing" : "is-paused",
                centerRotationEnabled ? "is-center-rotation-enabled" : ""
            ].filter(Boolean).join(" "),
            style: {
                "--iv-vinyl-accent": track.accent,
                "--iv-vinyl-compact-scale": recordScale
            },
            "aria-label": label,
            title: label
        },
            react.createElement(VinylDisc, {
                title: track.title,
                artist: track.artist,
                album: track.album,
                idPrefix: "ivlyrics-vinyl-compact"
            })
        );
    });

    const CompactAlbumVinyl = react.memo(({
        track,
        isPlaying,
        animationsEnabled = true,
        centerRotationEnabled = true,
        albumRadius = 12,
        coverClassName = "",
        coverStyle = {}
    }) => {
        return react.createElement("div", {
            className: [
                "ivlyrics-compact-album-vinyl",
                isPlaying ? "is-playing" : "is-paused",
                animationsEnabled ? "" : "is-motion-disabled",
                centerRotationEnabled ? "is-center-rotation-enabled" : ""
            ].filter(Boolean).join(" "),
            style: {
                "--iv-vinyl-accent": track.accent,
                "--iv-compact-album-radius": `${albumRadius}px`
            },
            "aria-hidden": "true"
        },
            react.createElement("span", {
                className: "ivlyrics-compact-album-record"
            },
                react.createElement(VinylDisc, {
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    idPrefix: "ivlyrics-compact-album"
                })
            ),
            react.createElement("img", {
                src: track.coverUrl,
                className: [
                    "ivlyrics-compact-album-cover",
                    coverClassName
                ].filter(Boolean).join(" "),
                style: {
                    ...coverStyle,
                    borderRadius: `${albumRadius}px`
                },
                draggable: false
            })
        );
    });

    const VinylPlayer = react.memo(({
        coverUrl,
        title,
        artist,
        album,
        incomingTrack = null,
        isPlaying,
        position,
        duration,
        onSeek,
        onStopPlayback,
        onTogglePlayback,
        animationsEnabled = true,
        tonearmStyle: tonearmStyleValue = "s",
        tonearmFinish: tonearmFinishValue = "white",
        tonearmSize = 100,
        interactionProps = {},
        className = "",
        style = {}
    }) => {
        const [phase, setPhase] = useState("paused");
        const [scrubPosition, setScrubPosition] = useState(null);
        const [dragTonearmAngle, setDragTonearmAngle] = useState(null);
        const [dragTonearmProgress, setDragTonearmProgress] = useState(null);
        const [cueReady, setCueReady] = useState(false);
        const [optimisticPosition, setOptimisticPosition] = useState(null);
        const phaseRef = useRef("paused");
        const tonearmRef = useRef(null);
        const activePointerRef = useRef(null);
        const interactionModeRef = useRef(null);
        const scrubPositionRef = useRef(null);
        const dragStateRef = useRef(null);
        const dragAngleOffsetRef = useRef(0);
        const dragLinearOffsetRef = useRef(0);
        const pointerReleaseTimerRef = useRef(null);
        const optimisticSeekTimerRef = useRef(null);
        const cancelTonearmInteractionRef = useRef(null);
        const finishTonearmInteractionRef = useRef(null);
        const moveTonearmRef = useRef(null);
        const tonearmStyle = normalizeTonearmStyle(tonearmStyleValue);
        const tonearmFinish = normalizeTonearmFinish(tonearmFinishValue);
        const tonearmAppearance = VINYL_TONEARM_APPEARANCES[tonearmFinish];
        const safeTonearmScale = Math.min(1.2, Math.max(0.8, (Number(tonearmSize) || 100) / 100));

        const setVisualPhase = useCallback((nextPhase) => {
            phaseRef.current = nextPhase;
            setPhase(nextPhase);
        }, []);

        const clearPointerReleaseTimer = useCallback(() => {
            if (!pointerReleaseTimerRef.current) return;
            window.clearTimeout(pointerReleaseTimerRef.current);
            pointerReleaseTimerRef.current = null;
        }, []);

        const setTonearmPreview = useCallback((dragState, interactionMode = interactionModeRef.current) => {
            dragStateRef.current = dragState;
            setDragTonearmAngle(dragState.angle);
            setDragTonearmProgress(dragState.progress);
            if (interactionMode === "seek") {
                scrubPositionRef.current = dragState.position;
                setScrubPosition(dragState.position);
            } else {
                setCueReady(!!dragState.shouldPlay);
            }
        }, []);

        const clearTonearmPreview = useCallback(() => {
            scrubPositionRef.current = null;
            dragStateRef.current = null;
            setScrubPosition(null);
            setDragTonearmAngle(null);
            setDragTonearmProgress(null);
            setCueReady(false);
        }, []);

        const releaseTonearmPointer = useCallback((pointerId) => {
            clearPointerReleaseTimer();
            activePointerRef.current = null;
            interactionModeRef.current = null;
            if (pointerId === null || pointerId === undefined) return;

            try {
                if (tonearmRef.current?.hasPointerCapture?.(pointerId)) {
                    tonearmRef.current.releasePointerCapture(pointerId);
                }
            } catch (_) {
                // Pointer capture may already have been released by the browser.
            }
        }, [clearPointerReleaseTimer]);

        const cancelTonearmInteraction = useCallback((pointerId = activePointerRef.current) => {
            if (activePointerRef.current === null) return;
            releaseTonearmPointer(pointerId);
            clearTonearmPreview();
        }, [clearTonearmPreview, releaseTonearmPointer]);
        cancelTonearmInteractionRef.current = cancelTonearmInteraction;

        useEffect(() => {
            const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            const finalPhase = isPlaying ? "playing" : "paused";

            if (!animationsEnabled || reducedMotion) {
                setVisualPhase(finalPhase);
                return undefined;
            }

            if (phaseRef.current === finalPhase) return undefined;
            if (!isPlaying && phaseRef.current === "paused") return undefined;

            const phaseSequence = isPlaying ? VINYL_PLAY_PHASES : VINYL_PAUSE_PHASES;
            const timers = [];
            const frameId = window.requestAnimationFrame(() => {
                phaseSequence.forEach(([nextPhase, delay]) => {
                    if (delay === 0) {
                        setVisualPhase(nextPhase);
                        return;
                    }
                    timers.push(window.setTimeout(() => setVisualPhase(nextPhase), delay));
                });
            });

            return () => {
                window.cancelAnimationFrame(frameId);
                timers.forEach((timer) => window.clearTimeout(timer));
            };
        }, [animationsEnabled, isPlaying, setVisualPhase]);

        useEffect(() => {
            if (!isPlaying) {
                cancelTonearmInteraction();
                clearTonearmPreview();
                setOptimisticPosition(null);
                if (optimisticSeekTimerRef.current) {
                    window.clearTimeout(optimisticSeekTimerRef.current);
                    optimisticSeekTimerRef.current = null;
                }
            }
        }, [cancelTonearmInteraction, clearTonearmPreview, isPlaying]);

        useEffect(() => {
            if (optimisticPosition === null) return;
            const externalPosition = Math.max(Number(position) || 0, 0);
            if (Math.abs(externalPosition - optimisticPosition) <= 1500) {
                if (optimisticSeekTimerRef.current) {
                    window.clearTimeout(optimisticSeekTimerRef.current);
                    optimisticSeekTimerRef.current = null;
                }
                setOptimisticPosition(null);
            }
        }, [optimisticPosition, position]);

        useEffect(() => () => {
            clearPointerReleaseTimer();
            if (optimisticSeekTimerRef.current) {
                window.clearTimeout(optimisticSeekTimerRef.current);
            }
        }, [clearPointerReleaseTimer]);

        const safeDuration = Math.max(Number(duration) || 0, 0);
        const safePosition = Math.min(
            Math.max(Number(scrubPosition ?? optimisticPosition ?? position) || 0, 0),
            safeDuration || Infinity
        );
        const playbackProgress = safeDuration > 0 ? clampVinylProgress(safePosition / safeDuration) : 0;
        const tonearmRange = VINYL_TONEARM_MAX_ANGLE - VINYL_TONEARM_MIN_ANGLE;
        const playbackTonearmAngle = VINYL_TONEARM_MIN_ANGLE + playbackProgress * tonearmRange;
        const tonearmAngle = dragTonearmAngle ?? playbackTonearmAngle;
        const tonearmProgress = dragTonearmProgress ?? playbackProgress;
        const canScrub = isPlaying && phase === "playing" && safeDuration > 0;
        const canCuePlay = !isPlaying && (phase === "paused" || phase === "sleeved");
        const canControlTonearm = canScrub || canCuePlay;

        const getPointerAngle = useCallback((event) => {
            const bounds = tonearmRef.current?.getBoundingClientRect();
            if (!bounds) return 0;
            const pivotX = bounds.left + (183 / 260) * bounds.width;
            const pivotY = bounds.top + (64 / 620) * bounds.height;
            return Math.atan2(event.clientY - pivotY, event.clientX - pivotX) * 180 / Math.PI;
        }, []);

        const getPointerLinearProgress = useCallback((event) => {
            const bounds = tonearmRef.current?.getBoundingClientRect();
            if (!bounds || bounds.width <= 0) return 0;
            const svgX = ((event.clientX - bounds.left) / bounds.width) * 260;
            return (170 - svgX) / VINYL_TONEARM_LINEAR_TRAVEL;
        }, []);

        const getTonearmDragState = useCallback((event, interactionMode = interactionModeRef.current) => {
            if (tonearmStyle === "linear") {
                const rawProgress = getPointerLinearProgress(event) + dragLinearOffsetRef.current;
                if (interactionMode === "cue-play") {
                    const cueProgress = Math.min(
                        Math.max(rawProgress, VINYL_TONEARM_LINEAR_REST_PROGRESS),
                        0
                    );
                    return {
                        angle: VINYL_TONEARM_REST_ANGLE,
                        progress: cueProgress,
                        isOutside: false,
                        shouldPlay: cueProgress >= VINYL_TONEARM_LINEAR_CUE_PLAY_PROGRESS,
                        position: null
                    };
                }

                const seekProgress = clampVinylProgress(rawProgress);
                return {
                    angle: VINYL_TONEARM_MIN_ANGLE + seekProgress * tonearmRange,
                    progress: Math.min(Math.max(rawProgress, VINYL_TONEARM_LINEAR_REST_PROGRESS), 1),
                    isOutside: rawProgress <= VINYL_TONEARM_LINEAR_EJECT_PROGRESS,
                    shouldPlay: false,
                    position: seekProgress * safeDuration
                };
            }

            const rawAngle = getPointerAngle(event) + dragAngleOffsetRef.current;
            if (interactionMode === "cue-play") {
                const cueAngle = Math.min(
                    Math.max(rawAngle, VINYL_TONEARM_REST_ANGLE),
                    VINYL_TONEARM_MIN_ANGLE
                );
                return {
                    angle: cueAngle,
                    progress: (cueAngle - VINYL_TONEARM_MIN_ANGLE) / tonearmRange,
                    isOutside: false,
                    shouldPlay: cueAngle >= VINYL_TONEARM_CUE_PLAY_ANGLE,
                    position: null
                };
            }

            const seekAngle = Math.min(
                Math.max(rawAngle, VINYL_TONEARM_MIN_ANGLE),
                VINYL_TONEARM_MAX_ANGLE
            );
            const displayAngle = Math.min(
                Math.max(rawAngle, VINYL_TONEARM_REST_ANGLE),
                VINYL_TONEARM_MAX_ANGLE
            );
            const nextProgress = (seekAngle - VINYL_TONEARM_MIN_ANGLE) / tonearmRange;
            return {
                angle: displayAngle,
                progress: (displayAngle - VINYL_TONEARM_MIN_ANGLE) / tonearmRange,
                isOutside: rawAngle <= VINYL_TONEARM_EJECT_ANGLE,
                shouldPlay: false,
                position: clampVinylProgress(nextProgress) * safeDuration
            };
        }, [getPointerAngle, getPointerLinearProgress, safeDuration, tonearmRange, tonearmStyle]);

        const commitSeek = useCallback((nextPosition) => {
            const clampedPosition = clampVinylSeekPosition(nextPosition, safeDuration);
            clearTonearmPreview();
            setOptimisticPosition(clampedPosition);
            onSeek?.(clampedPosition);

            if (optimisticSeekTimerRef.current) {
                window.clearTimeout(optimisticSeekTimerRef.current);
            }
            optimisticSeekTimerRef.current = window.setTimeout(() => {
                optimisticSeekTimerRef.current = null;
                setOptimisticPosition(null);
            }, 1600);
        }, [clearTonearmPreview, onSeek, safeDuration]);

        const stopFromTonearm = useCallback((pointerId) => {
            releaseTonearmPointer(pointerId);
            clearTonearmPreview();
            setOptimisticPosition(null);
            setVisualPhase("pausing");
            onStopPlayback?.();
        }, [clearTonearmPreview, onStopPlayback, releaseTonearmPointer, setVisualPhase]);

        const beginTonearmInteraction = useCallback((event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!canControlTonearm || event.isPrimary === false || (event.button ?? 0) !== 0) return;

            if (optimisticSeekTimerRef.current) {
                window.clearTimeout(optimisticSeekTimerRef.current);
                optimisticSeekTimerRef.current = null;
            }
            clearPointerReleaseTimer();
            setOptimisticPosition(null);
            const interactionMode = canScrub ? "seek" : "cue-play";
            activePointerRef.current = event.pointerId;
            interactionModeRef.current = interactionMode;
            const initialAngle = interactionMode === "seek"
                ? playbackTonearmAngle
                : VINYL_TONEARM_REST_ANGLE;
            const initialProgress = interactionMode === "seek"
                ? playbackProgress
                : VINYL_TONEARM_LINEAR_REST_PROGRESS;
            if (tonearmStyle === "linear") {
                dragLinearOffsetRef.current = initialProgress - getPointerLinearProgress(event);
            } else {
                dragAngleOffsetRef.current = initialAngle - getPointerAngle(event);
            }
            try {
                tonearmRef.current?.setPointerCapture?.(event.pointerId);
            } catch (_) {
                // Window-level pointer listeners continue the gesture if capture is unavailable.
            }
            setTonearmPreview(
                getTonearmDragState(event, interactionMode),
                interactionMode
            );
        }, [
            canControlTonearm,
            canScrub,
            clearPointerReleaseTimer,
            getPointerAngle,
            getPointerLinearProgress,
            getTonearmDragState,
            playbackTonearmAngle,
            playbackProgress,
            setTonearmPreview,
            tonearmStyle
        ]);

        const finishTonearmInteraction = useCallback((event, shouldCommit = true, useLastPreview = false) => {
            if (activePointerRef.current !== event.pointerId) return;
            clearPointerReleaseTimer();
            event.preventDefault?.();
            event.stopPropagation?.();
            const interactionMode = interactionModeRef.current;

            if (!shouldCommit) {
                releaseTonearmPointer(event.pointerId);
                clearTonearmPreview();
                return;
            }

            const dragState = useLastPreview
                ? dragStateRef.current
                : getTonearmDragState(event, interactionMode);
            if (!dragState) {
                releaseTonearmPointer(event.pointerId);
                clearTonearmPreview();
                return;
            }

            if (interactionMode === "cue-play") {
                const shouldStartPlayback = !!dragState.shouldPlay;
                releaseTonearmPointer(event.pointerId);
                clearTonearmPreview();
                if (shouldStartPlayback) onTogglePlayback?.();
                return;
            }

            if (dragState.isOutside) {
                stopFromTonearm(event.pointerId);
                return;
            }

            releaseTonearmPointer(event.pointerId);
            commitSeek(dragState.position);
        }, [
            clearPointerReleaseTimer,
            clearTonearmPreview,
            commitSeek,
            getTonearmDragState,
            onTogglePlayback,
            releaseTonearmPointer,
            stopFromTonearm
        ]);
        finishTonearmInteractionRef.current = finishTonearmInteraction;

        const schedulePointerReleaseFallback = useCallback((pointerId) => {
            if (pointerReleaseTimerRef.current) return;
            pointerReleaseTimerRef.current = window.setTimeout(() => {
                pointerReleaseTimerRef.current = null;
                if (activePointerRef.current !== pointerId) return;
                finishTonearmInteraction({
                    pointerId,
                    preventDefault: () => undefined,
                    stopPropagation: () => undefined
                }, true, true);
            }, VINYL_POINTER_RELEASE_GRACE_MS);
        }, [finishTonearmInteraction]);

        const moveTonearm = useCallback((event) => {
            if (activePointerRef.current !== event.pointerId) return;

            const isTransientMouseReleaseFrame = event.pointerType === "mouse"
                && (Number(event.buttons) & 1) !== 1;
            if (isTransientMouseReleaseFrame) {
                schedulePointerReleaseFallback(event.pointerId);
                return;
            }

            clearPointerReleaseTimer();
            event.preventDefault();
            event.stopPropagation();
            const interactionMode = interactionModeRef.current;
            setTonearmPreview(
                getTonearmDragState(event, interactionMode),
                interactionMode
            );
        }, [
            clearPointerReleaseTimer,
            getTonearmDragState,
            schedulePointerReleaseFallback,
            setTonearmPreview
        ]);
        moveTonearmRef.current = moveTonearm;

        const handleLostPointerCapture = useCallback((event) => {
            if (activePointerRef.current !== event.pointerId) return;
            // Do not end the interaction here. Electron can transiently lose
            // capture during a drag; window pointermove/up listeners take over.
        }, []);

        useEffect(() => {
            const handleWindowPointerMove = (event) => moveTonearmRef.current?.(event);
            const handleWindowPointerUp = (event) => finishTonearmInteractionRef.current?.(event, true);
            const handleWindowPointerCancel = (event) => finishTonearmInteractionRef.current?.(event, false);
            const handleInteractionInterrupted = () => cancelTonearmInteractionRef.current?.();
            const pointerMoveOptions = { capture: true, passive: false };
            const handleVisibilityChange = () => {
                if (document.visibilityState === "hidden") cancelTonearmInteractionRef.current?.();
            };

            // Capture-phase listeners keep ownership even when another Spotify
            // surface stops propagation after pointer capture is lost.
            window.addEventListener("pointermove", handleWindowPointerMove, pointerMoveOptions);
            window.addEventListener("pointerup", handleWindowPointerUp, true);
            window.addEventListener("pointercancel", handleWindowPointerCancel, true);
            window.addEventListener("blur", handleInteractionInterrupted);
            document.addEventListener("visibilitychange", handleVisibilityChange);

            return () => {
                window.removeEventListener("pointermove", handleWindowPointerMove, pointerMoveOptions);
                window.removeEventListener("pointerup", handleWindowPointerUp, true);
                window.removeEventListener("pointercancel", handleWindowPointerCancel, true);
                window.removeEventListener("blur", handleInteractionInterrupted);
                document.removeEventListener("visibilitychange", handleVisibilityChange);
                const pointerId = activePointerRef.current;
                activePointerRef.current = null;
                interactionModeRef.current = null;
                scrubPositionRef.current = null;
                dragStateRef.current = null;
                clearPointerReleaseTimer();
                if (pointerId !== null && tonearmRef.current?.hasPointerCapture?.(pointerId)) {
                    try {
                        tonearmRef.current.releasePointerCapture(pointerId);
                    } catch (_) { }
                }
            };
        }, [clearPointerReleaseTimer]);

        const handleTonearmKeyDown = useCallback((event) => {
            if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onTogglePlayback?.();
                return;
            }
            if (!canScrub) return;

            let nextPosition = null;
            if (event.key === "ArrowLeft") nextPosition = safePosition - 5000;
            if (event.key === "ArrowRight") nextPosition = safePosition + 5000;
            if (event.key === "Home") nextPosition = 0;
            if (event.key === "End") nextPosition = safeDuration;
            if (nextPosition === null) return;

            event.preventDefault();
            commitSeek(nextPosition);
        }, [canScrub, commitSeek, onTogglePlayback, safeDuration, safePosition]);

        const playLabel = I18n.t(isPlaying ? "fullscreen.controls.pause" : "fullscreen.controls.play");
        const vinylModeLabel = I18n.t("vinyl.mode") || "LP";
        const albumLabel = I18n.t("vinyl.closeHint")
            || I18n.t("fullscreen.backgroundOptions.albumArt");
        const tonearmLabel = I18n.t("vinyl.tonearmHint") || vinylModeLabel;
        const isDraggingTonearm = dragTonearmAngle !== null || dragTonearmProgress !== null;
        const isCueingTonearm = isDraggingTonearm
            && interactionModeRef.current === "cue-play";
        const isEjectingTonearm = isDraggingTonearm
            && interactionModeRef.current === "seek"
            && !!dragStateRef.current?.isOutside;
        const rootClassName = [
            "ivlyrics-vinyl-player",
            `is-${phase}`,
            scrubPosition !== null ? "is-scrubbing" : "",
            isCueingTonearm ? "is-cueing" : "",
            cueReady ? "is-cue-ready" : "",
            isEjectingTonearm ? "is-ejecting" : "",
            `tonearm-style-${tonearmStyle}`,
            `tonearm-finish-${tonearmFinish}`,
            className
        ].filter(Boolean).join(" ");

        return react.createElement("div", {
            className: rootClassName,
            style: {
                ...style,
                "--iv-vinyl-tonearm-angle": `${tonearmAngle.toFixed(3)}deg`,
                "--iv-vinyl-tonearm-linear-x": `${(-VINYL_TONEARM_LINEAR_TRAVEL * tonearmProgress).toFixed(3)}px`,
                "--iv-vinyl-tonearm-linear-rest-x": `${(-VINYL_TONEARM_LINEAR_TRAVEL * VINYL_TONEARM_LINEAR_REST_PROGRESS).toFixed(3)}px`,
                "--iv-vinyl-tonearm-scale": (Number(style["--iv-vinyl-record-scale"]) || 1) * safeTonearmScale,
                "--iv-vinyl-tonearm-housing-fill": tonearmAppearance.housing,
                "--iv-vinyl-tonearm-housing-edge": tonearmAppearance.housingEdge,
                "--iv-vinyl-tonearm-highlight-color": tonearmAppearance.highlight,
                "--iv-vinyl-tonearm-needle-color": tonearmAppearance.needle
            },
            role: "group",
            "aria-label": vinylModeLabel
        },
            react.createElement("div", { className: "ivlyrics-vinyl-visual-group" },
                react.createElement("div", { className: "ivlyrics-vinyl-outgoing-pair" },
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-vinyl-record-shell",
                        "aria-label": playLabel,
                        onPointerDown: (event) => event.stopPropagation(),
                        onClick: (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onTogglePlayback?.();
                        }
                    },
                        react.createElement(VinylDisc, {
                            title,
                            artist,
                            album,
                            idPrefix: "ivlyrics-vinyl-current"
                        })
                    ),
                    react.createElement("button", {
                        ...interactionProps,
                        type: "button",
                        className: "ivlyrics-vinyl-sleeve ivlyrics-fullscreen-shared-album",
                        "aria-label": albumLabel
                    },
                        react.createElement("img", {
                            src: coverUrl,
                            alt: "",
                            draggable: false
                        })
                    )
                ),
                incomingTrack && react.createElement("span", {
                    className: "ivlyrics-vinyl-incoming-sleeve",
                    "aria-hidden": "true",
                    style: { "--iv-vinyl-flight-radius": `${style["--iv-vinyl-album-radius"] || "2.4%"}` }
                },
                    react.createElement("img", {
                        src: incomingTrack.coverUrl,
                        alt: "",
                        draggable: false
                    }),
                    react.createElement("span", { className: "ivlyrics-vinyl-track-flight-shine" })
                ),
                incomingTrack && react.createElement("span", {
                    className: "ivlyrics-vinyl-incoming-record-shell",
                    "aria-hidden": "true",
                    style: { "--iv-vinyl-accent": incomingTrack.accent }
                },
                    react.createElement(VinylDisc, {
                        title: incomingTrack.title,
                        artist: incomingTrack.artist,
                        album: incomingTrack.album,
                        idPrefix: "ivlyrics-vinyl-incoming"
                    })
                )
            ),
            react.createElement("svg", {
                ref: tonearmRef,
                className: "ivlyrics-vinyl-tonearm",
                viewBox: "0 0 260 620",
                role: "slider",
                tabIndex: 0,
                "aria-label": tonearmLabel,
                "aria-valuemin": 0,
                "aria-valuemax": Math.round(safeDuration),
                "aria-valuenow": Math.round(safePosition),
                "aria-valuetext": cueReady
                    ? playLabel
                    : `${formatTime(safePosition)} / ${formatTime(safeDuration)}`,
                "aria-disabled": !canControlTonearm,
                onPointerDown: beginTonearmInteraction,
                onPointerMove: moveTonearm,
                onPointerUp: (event) => finishTonearmInteraction(event, true),
                onPointerCancel: (event) => finishTonearmInteraction(event, false),
                onLostPointerCapture: handleLostPointerCapture,
                onClick: (event) => event.stopPropagation(),
                onKeyDown: handleTonearmKeyDown
            },
                react.createElement("title", null, "Tonearm"),
                react.createElement("defs", null,
                    react.createElement("radialGradient", { id: "ivlyrics-vinyl-tonearm-base", cx: "42%", cy: "34%", r: "72%" },
                        react.createElement("stop", { offset: "0", stopColor: tonearmAppearance.base[0], stopOpacity: ".88" }),
                        react.createElement("stop", { offset: ".58", stopColor: tonearmAppearance.base[1], stopOpacity: ".72" }),
                        react.createElement("stop", { offset: "1", stopColor: tonearmAppearance.base[2], stopOpacity: ".58" })
                    ),
                    react.createElement("linearGradient", { id: "ivlyrics-vinyl-tonearm-tube", x1: "0", x2: "1" },
                        react.createElement("stop", { offset: "0", stopColor: tonearmAppearance.tube[0] }),
                        react.createElement("stop", { offset: ".24", stopColor: tonearmAppearance.tube[1] }),
                        react.createElement("stop", { offset: ".55", stopColor: tonearmAppearance.tube[2] }),
                        react.createElement("stop", { offset: "1", stopColor: tonearmAppearance.tube[3] })
                    )
                ),
                tonearmStyle === "linear"
                    ? react.createElement(react.Fragment, null,
                        react.createElement("g", { className: "ivlyrics-vinyl-linear-rail" },
                            react.createElement("path", { className: "ivlyrics-vinyl-linear-rail-shadow", d: "M 30 66 H 230" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-linear-rail-tube", d: "M 30 62 H 230" }),
                            react.createElement("circle", { className: "ivlyrics-vinyl-linear-rail-cap", cx: "30", cy: "62", r: "18" }),
                            react.createElement("circle", { className: "ivlyrics-vinyl-linear-rail-cap", cx: "230", cy: "62", r: "18" })
                        ),
                        react.createElement("g", { className: "ivlyrics-vinyl-tonearm-moving" },
                            react.createElement("path", { className: "ivlyrics-vinyl-tonearm-shadow", d: "M 170 87 L 170 476 L 160 510" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-tonearm-tube", d: "M 170 87 L 170 476 L 160 510" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-tonearm-highlight", d: "M 165 91 L 165 472" }),
                            react.createElement("rect", { className: "ivlyrics-vinyl-pivot-housing", x: "144", y: "38", width: "52", height: "66", rx: "13" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-pivot-highlight", d: "M 153 48 H 187 V 86" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-headshell", d: "M 139 487 L 182 487 L 184 529 L 146 542 L 132 523 Z" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-headshell-highlight", d: "M 146 496 H 174 L 175 521" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-needle", d: "M 149 537 L 148 555 M 164 533 L 168 552" })
                        )
                    )
                    : react.createElement(react.Fragment, null,
                        react.createElement("circle", { className: "ivlyrics-vinyl-tonearm-base", cx: "183", cy: "64", r: "66" }),
                        react.createElement("circle", { className: "ivlyrics-vinyl-tonearm-base-edge", cx: "183", cy: "64", r: "66" }),
                        react.createElement("g", { className: "ivlyrics-vinyl-tonearm-moving" },
                            react.createElement("path", { className: "ivlyrics-vinyl-tonearm-shadow", d: VINYL_TONEARM_PATHS[tonearmStyle].tube }),
                            react.createElement("path", { className: "ivlyrics-vinyl-tonearm-tube", d: VINYL_TONEARM_PATHS[tonearmStyle].tube }),
                            react.createElement("path", { className: "ivlyrics-vinyl-tonearm-highlight", d: VINYL_TONEARM_PATHS[tonearmStyle].highlight }),
                            react.createElement("path", { className: "ivlyrics-vinyl-pivot-housing", d: "M 151 35 L 200 39 L 215 66 L 207 109 L 170 111 L 151 91 L 144 61 Z" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-pivot-highlight", d: "M 158 42 L 194 45 L 207 65 L 202 91" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-headshell", d: "M 47 490 L 75 508 L 54 546 L 30 540 L 17 522 L 24 506 Z" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-headshell-highlight", d: "M 28 509 L 66 517 L 49 539" }),
                            react.createElement("path", { className: "ivlyrics-vinyl-needle", d: "M 35 539 L 33 555 M 48 542 L 53 557" })
                        )
                    )
            )
        );
    });

    const areSameTrackVisuals = (left, right) => left?.coverUrl === right?.coverUrl
        && left?.title === right?.title
        && left?.artist === right?.artist
        && left?.album === right?.album;

    const getTrackVisualKey = (track) => [
        track?.uri,
        track?.coverUrl,
        track?.title,
        track?.artist,
        track?.album
    ].map((value) => String(value || "")).join("\u0001");

    const Mode = react.memo(({
        track = {},
        albumRadius = 0,
        isClosing = false,
        isPortraitLayout = false,
        presentationMode = "vinyl",
        controlsVisible = true,
        isPlaying = false,
        position = 0,
        duration = 0,
        interactionProps = {},
        activeLyric = "",
        activeLyrics = [],
        lyricsTrackUri = null,
        activeLineIndex = 0,
        activeLyricsKaraoke = false,
        karaokeSource = null,
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
        const normalizedPresentationMode =
            normalizePresentationMode(presentationMode);
        const isFullVinylPresentation =
            normalizedPresentationMode === "vinyl";
        const isCompactVinylPresentation =
            normalizedPresentationMode === "compact-vinyl";
        const isVideoPresentation =
            normalizedPresentationMode === "video";
        const animationsEnabled = vinylSettings.animations !== false;
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
        const [displayedTrack, setDisplayedTrack] = useState(() => liveTrack);
        const displayedTrackRef = useRef(liveTrack);
        const [incomingTrack, setIncomingTrack] = useState(null);
        const incomingTrackRef = useRef(null);
        const [trackTransition, setTrackTransition] = useState("idle");
        const requestedTrackKeyRef = useRef("");
        const trackTransitionRevisionRef = useRef(0);
        const trackPreloadTimerRef = useRef(null);
        const trackSleeveTimerRef = useRef(null);
        const trackDepartureTimerRef = useRef(null);
        const trackAlbumTimerRef = useRef(null);
        const trackRecordTimerRef = useRef(null);
        const trackRaiseTimerRef = useRef(null);
        const trackHandoffTimerRef = useRef(null);

        const clearTrackTimers = useCallback(() => {
            if (trackPreloadTimerRef.current) {
                window.clearTimeout(trackPreloadTimerRef.current);
                trackPreloadTimerRef.current = null;
            }
            if (trackSleeveTimerRef.current) {
                window.clearTimeout(trackSleeveTimerRef.current);
                trackSleeveTimerRef.current = null;
            }
            if (trackDepartureTimerRef.current) {
                window.clearTimeout(trackDepartureTimerRef.current);
                trackDepartureTimerRef.current = null;
            }
            if (trackAlbumTimerRef.current) {
                window.clearTimeout(trackAlbumTimerRef.current);
                trackAlbumTimerRef.current = null;
            }
            if (trackRecordTimerRef.current) {
                window.clearTimeout(trackRecordTimerRef.current);
                trackRecordTimerRef.current = null;
            }
            if (trackRaiseTimerRef.current) {
                window.clearTimeout(trackRaiseTimerRef.current);
                trackRaiseTimerRef.current = null;
            }
            if (trackHandoffTimerRef.current) {
                window.clearTimeout(trackHandoffTimerRef.current);
                trackHandoffTimerRef.current = null;
            }
        }, []);

        useEffect(() => {
            const shownTrack = displayedTrackRef.current;
            if (!isFullVinylPresentation) {
                trackTransitionRevisionRef.current += 1;
                requestedTrackKeyRef.current = "";
                clearTrackTimers();
                if (!areSameTrackVisuals(shownTrack, liveTrack)) {
                    displayedTrackRef.current = liveTrack;
                    setDisplayedTrack(liveTrack);
                }
                incomingTrackRef.current = null;
                setIncomingTrack(null);
                setTrackTransition("idle");
                return;
            }

            if (areSameTrackVisuals(shownTrack, liveTrack)) {
                return;
            }

            const nextTrackKey = getTrackVisualKey(liveTrack);
            if (requestedTrackKeyRef.current === nextTrackKey) return;

            const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            const revision = trackTransitionRevisionRef.current + 1;
            trackTransitionRevisionRef.current = revision;
            requestedTrackKeyRef.current = nextTrackKey;
            clearTrackTimers();

            if (!shownTrack?.uri || !animationsEnabled || reducedMotion) {
                displayedTrackRef.current = liveTrack;
                setDisplayedTrack(liveTrack);
                incomingTrackRef.current = null;
                setIncomingTrack(null);
                setTrackTransition("idle");
                return;
            }

            incomingTrackRef.current = liveTrack;
            setIncomingTrack(liveTrack);
            setTrackTransition("record-clearing");

            let preloadImage = null;
            let coverReady = false;
            let departureFinished = false;
            let flightStarted = false;
            const beginFlight = () => {
                if (
                    flightStarted
                    || !coverReady
                    || !departureFinished
                    || trackTransitionRevisionRef.current !== revision
                ) return;
                flightStarted = true;
                setTrackTransition("album-arriving");
                trackAlbumTimerRef.current = window.setTimeout(() => {
                    if (trackTransitionRevisionRef.current !== revision) return;
                    trackAlbumTimerRef.current = null;
                    setTrackTransition("record-emerging");
                    trackRecordTimerRef.current = window.setTimeout(() => {
                        if (trackTransitionRevisionRef.current !== revision) return;
                        trackRecordTimerRef.current = null;
                        setTrackTransition("record-raised");
                        trackRaiseTimerRef.current = window.setTimeout(() => {
                            if (trackTransitionRevisionRef.current !== revision) return;
                            trackRaiseTimerRef.current = null;
                            const latestTrack = liveTrackRef.current?.uri === liveTrack.uri
                                ? liveTrackRef.current
                                : liveTrack;
                            const transitionSnapshot = incomingTrackRef.current?.uri === liveTrack.uri
                                ? incomingTrackRef.current
                                : liveTrack;
                            const committedTrack = {
                                ...latestTrack,
                                accent: transitionSnapshot.accent
                            };
                            displayedTrackRef.current = committedTrack;
                            setDisplayedTrack(committedTrack);
                            setTrackTransition("handoff");
                            trackHandoffTimerRef.current = window.setTimeout(() => {
                                if (trackTransitionRevisionRef.current !== revision) return;
                                trackHandoffTimerRef.current = null;
                                incomingTrackRef.current = null;
                                setIncomingTrack(null);
                                setTrackTransition("idle");
                            }, TRACK_HANDOFF_MS);
                        }, TRACK_RECORD_RAISE_MS);
                    }, TRACK_RECORD_EMERGE_MS);
                }, TRACK_ALBUM_ARRIVE_MS);
            };

            const markCoverReady = () => {
                if (coverReady || trackTransitionRevisionRef.current !== revision) return;
                coverReady = true;
                if (trackPreloadTimerRef.current) {
                    window.clearTimeout(trackPreloadTimerRef.current);
                    trackPreloadTimerRef.current = null;
                }
                beginFlight();
            };

            trackSleeveTimerRef.current = window.setTimeout(() => {
                if (trackTransitionRevisionRef.current !== revision) return;
                trackSleeveTimerRef.current = null;
                setTrackTransition("record-sleeving");
                trackSleeveTimerRef.current = window.setTimeout(() => {
                    if (trackTransitionRevisionRef.current !== revision) return;
                    trackSleeveTimerRef.current = null;
                    setTrackTransition("album-departing");
                    trackDepartureTimerRef.current = window.setTimeout(() => {
                        if (trackTransitionRevisionRef.current !== revision) return;
                        trackDepartureTimerRef.current = null;
                        departureFinished = true;
                        beginFlight();
                    }, TRACK_ALBUM_DEPART_MS);
                }, TRACK_RECORD_SLEEVE_MS);
            }, TRACK_RECORD_CLEAR_MS);

            trackPreloadTimerRef.current = window.setTimeout(
                markCoverReady,
                TRACK_COVER_PRELOAD_MAX_MS
            );

            if (liveTrack.coverUrl && typeof window.Image === "function") {
                preloadImage = new window.Image();
                preloadImage.decoding = "async";
                preloadImage.onload = markCoverReady;
                preloadImage.onerror = markCoverReady;
                preloadImage.src = liveTrack.coverUrl;
                if (preloadImage.complete) markCoverReady();
            } else {
                markCoverReady();
            }

            return () => {
                if (preloadImage) {
                    preloadImage.onload = null;
                    preloadImage.onerror = null;
                }
            };
        }, [
            liveTrack.uri,
            liveTrack.coverUrl,
            liveTrack.title,
            liveTrack.artist,
            liveTrack.album,
            animationsEnabled,
            clearTrackTimers,
            isFullVinylPresentation
        ]);

        useEffect(() => () => {
            trackTransitionRevisionRef.current += 1;
            clearTrackTimers();
        }, [clearTrackTimers]);

        // Keep the visible incoming LP's label stable. A color that arrives after
        // the record starts emerging is applied only after handoff has settled.
        useEffect(() => {
            if (!isFullVinylPresentation) return;
            if (!liveTrack.accent) return;

            setIncomingTrack((current) => {
                if (!current || current.uri !== liveTrack.uri || current.accent === liveTrack.accent) {
                    return current;
                }
                if (![
                    "record-clearing",
                    "record-sleeving",
                    "album-departing",
                    "album-arriving"
                ].includes(trackTransition)) {
                    return current;
                }
                const updatedTrack = { ...current, accent: liveTrack.accent };
                incomingTrackRef.current = updatedTrack;
                return updatedTrack;
            });

            if (trackTransition !== "idle") return;
            const shownTrack = displayedTrackRef.current;
            if (shownTrack?.uri === liveTrack.uri && shownTrack.accent !== liveTrack.accent) {
                const updatedTrack = { ...shownTrack, accent: liveTrack.accent };
                displayedTrackRef.current = updatedTrack;
                setDisplayedTrack(updatedTrack);
            }
        }, [
            isFullVinylPresentation,
            liveTrack.uri,
            liveTrack.accent,
            trackTransition
        ]);

        const activeVinylLyric = String(activeLyric || "")
            .replace(/\s+/g, " ")
            .trim();
        const ActiveLyricRenderer = window.ivLyricsActiveLyricLineRenderer;
        const canRenderRichActiveLyric = !!ActiveLyricRenderer
            && Array.isArray(activeLyrics)
            && activeLyrics.length > 0;
        const normalizedLyricsTrackUri = String(lyricsTrackUri || "").trim();
        const liveLyricsMatchTrack = !normalizedLyricsTrackUri
            || normalizedLyricsTrackUri === liveTrack.uri;
        const hasActiveLyric = liveLyricsMatchTrack
            && (canRenderRichActiveLyric || !!activeVinylLyric);
        const liveLyricSnapshot = hasActiveLyric
            ? {
                trackUri: liveTrack.uri,
                plainText: activeVinylLyric,
                lyrics: activeLyrics,
                activeLineIndex,
                isKara: activeLyricsKaraoke,
                karaokeSource,
                settingsRevision: lyricsSettingsRevision
            }
            : null;

        const transitionClass = trackTransition !== "idle" ? `is-track-${trackTransition}` : "";
        // Lyrics follow the live Spotify track immediately. Only the sleeve and
        // record stay on displayedTrack until their replacement animation ends.
        const displayedLyric = liveLyricSnapshot;
        const hasVisibleLyric = lyricsEnabled && !!displayedLyric;
        const displayedSourceLine = displayedLyric?.lyrics?.[displayedLyric.activeLineIndex];
        const hasVisibleCulturalAnnotation =
            Array.isArray(displayedSourceLine?.culturalNote)
                ? displayedSourceLine.culturalNote.length > 0
                : !!displayedSourceLine?.culturalNote;

        const renderLyricLayer = (snapshot) => {
            if (!snapshot) return null;
            const renderableLyrics = Array.isArray(snapshot.lyrics) && snapshot.lyrics.length > 0
                ? snapshot.lyrics
                : snapshot.plainText
                    ? [{ text: snapshot.plainText, startTime: 0 }]
                    : [];
            const canRenderSnapshotRichly = !!ActiveLyricRenderer && renderableLyrics.length > 0;

            return react.createElement("div", {
                // Keep the layer mounted between lines. Remounting it for every
                // active index restarted the entrance animation and made the LP
                // lyric surface visibly blink between otherwise continuous rows.
                key: `vinyl-active-lyric-current-${snapshot.trackUri}`,
                className: "fullscreen-vinyl-active-lyric is-current",
                dir: "auto"
            }, canRenderSnapshotRichly
                ? react.createElement(ActiveLyricRenderer, {
                    lyrics: renderableLyrics,
                    activeLineIndex: renderableLyrics === snapshot.lyrics ? snapshot.activeLineIndex : 0,
                    isKara: renderableLyrics === snapshot.lyrics && snapshot.isKara,
                    karaokeSource: snapshot.karaokeSource,
                    settingsRevision: snapshot.settingsRevision,
                    positionOverride: null,
                    motionEnabled: animationsEnabled,
                    durationMs: duration,
                    singleLineScroll: !isVideoPresentation && renderableLyrics === snapshot.lyrics
                })
                : snapshot.plainText);
        };

        return react.createElement("div", {
            className: [
                "fullscreen-vinyl-overlay",
                isClosing ? "is-closing" : "is-open",
                isPortraitLayout ? "is-portrait-layout" : "is-landscape-layout",
                `is-presentation-${normalizedPresentationMode}`,
                isFullVinylPresentation ? "has-full-vinyl-stage" : "",
                isCompactVinylPresentation ? "has-compact-vinyl-stage" : "",
                isVideoPresentation ? "has-video-stage" : "",
                animationsEnabled ? "" : "is-motion-disabled",
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
                        : "vinyl.presentation.vinylLabel"
            ) || I18n.t("vinyl.mode") || "LP",
            style: {
                "--iv-vinyl-original-font-family": `'${String(vinylSettings.originalFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-vinyl-original-font-size": `${Number(vinylSettings.originalFontSize) || 31}px`,
                "--iv-vinyl-original-font-weight": Number(vinylSettings.originalFontWeight) || 600,
                "--iv-vinyl-original-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.originalOpacity) || 95) / 100)),
                "--iv-vinyl-original-letter-spacing": `${Number(vinylSettings.originalLetterSpacing) || 0}px`,
                "--iv-vinyl-original-outline-shadow": createOutsideTextOutlineShadow(
                    vinylSettings.originalOutlineWidth,
                    vinylSettings.originalOutlineColor
                ),
                "--iv-vinyl-original-outline-stroke-width": `${(Number(vinylSettings.originalOutlineWidth) || 0) * 2}px`,
                "--iv-vinyl-original-outline-stroke-color": vinylSettings.originalOutlineColor || "#000000",
                "--iv-vinyl-phonetic-font-family": `'${String(vinylSettings.phoneticFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-vinyl-phonetic-font-size": `${Number(vinylSettings.phoneticFontSize) || 11}px`,
                "--iv-vinyl-phonetic-font-weight": Number(vinylSettings.phoneticFontWeight) || 100,
                "--iv-vinyl-phonetic-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.phoneticOpacity) || 70) / 100)),
                "--iv-vinyl-phonetic-spacing": `${Number.isFinite(Number(vinylSettings.phoneticSpacing)) ? Number(vinylSettings.phoneticSpacing) : -1}px`,
                "--iv-vinyl-phonetic-letter-spacing": `${Number(vinylSettings.phoneticLetterSpacing) || 0}px`,
                "--iv-vinyl-phonetic-outline-shadow": createOutsideTextOutlineShadow(
                    vinylSettings.phoneticOutlineWidth,
                    vinylSettings.phoneticOutlineColor
                ),
                "--iv-vinyl-translation-font-family": `'${String(vinylSettings.translationFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-vinyl-translation-font-size": `${Number(vinylSettings.translationFontSize) || 15}px`,
                "--iv-vinyl-translation-font-weight": Number(vinylSettings.translationFontWeight) || 300,
                "--iv-vinyl-translation-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.translationOpacity) || 85) / 100)),
                "--iv-vinyl-translation-spacing": `${Number(vinylSettings.translationSpacing) || 0}px`,
                "--iv-vinyl-translation-letter-spacing": `${Number(vinylSettings.translationLetterSpacing) || 0}px`,
                "--iv-vinyl-translation-outline-shadow": createOutsideTextOutlineShadow(
                    vinylSettings.translationOutlineWidth,
                    vinylSettings.translationOutlineColor
                ),
                "--iv-vinyl-cultural-note-font-family": `'${String(vinylSettings.culturalFontFamily || "Pretendard Variable").replace(/'/g, "\\'")}'`,
                "--iv-vinyl-cultural-note-font-size": `${Number(vinylSettings.culturalFontSize) || 12}px`,
                "--iv-vinyl-cultural-note-font-weight": Number(vinylSettings.culturalFontWeight) || 300,
                "--iv-vinyl-cultural-note-opacity": Math.min(1, Math.max(0, (Number(vinylSettings.culturalOpacity) || 60) / 100)),
                "--iv-vinyl-cultural-note-outline-shadow": createOutsideTextOutlineShadow(
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
            }
        },
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
                    "--iv-vinyl-accent": displayedTrack.accent
                },
                coverUrl: displayedTrack.coverUrl,
                title: displayedTrack.title,
                artist: displayedTrack.artist,
                album: displayedTrack.album,
                incomingTrack,
                isPlaying,
                position,
                duration,
                animationsEnabled,
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
                centerRotationEnabled,
                recordScale,
                interactionProps
            }) : null,
            react.createElement(PresentationSwitcher, {
                activeMode: normalizedPresentationMode,
                visible: true,
                onChange: onPresentationModeChange
            }),
            (isFullVinylPresentation || isVideoPresentation) && react.createElement(StagePlaybackControls, {
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
            lyricsEnabled ? react.createElement("div", {
                className: `fullscreen-vinyl-lyric-stage${hasVisibleLyric ? "" : " is-empty"}`,
                "aria-live": "polite",
                "aria-atomic": "true",
                "aria-busy": trackTransition !== "idle" && !displayedLyric ? "true" : undefined
            },
                renderLyricLayer(displayedLyric)
            ) : null
        );
    });

    Mode.PresentationSwitcher = PresentationSwitcher;
    Mode.CompactAlbumVinyl = CompactAlbumVinyl;
    return Mode;
})();

window.ivLyricsVinylPlayerMode = VinylPlayerMode;
