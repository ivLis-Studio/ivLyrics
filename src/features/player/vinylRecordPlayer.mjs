import { formatTime } from "./vinylPlayback.mjs";
import {
    useVinylTonearm, VINYL_TONEARM_LINEAR_TRAVEL, VINYL_TONEARM_LINEAR_REST_PROGRESS,
} from "./vinylTonearmControls.mjs";

export function createVinylRecordPlayer({ react, host, document, i18n: I18n, useRotationSpeed }) {
    const { useState, useEffect, useCallback, useRef } = react;

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
                react.createElement("span", {
                    id: `${idPrefix}-title`,
                    className: "ivlyrics-vinyl-label-title",
                    title: title || "LP",
                    dir: "auto"
                }, title || "LP"),
                react.createElement("span", {
                    id: `${idPrefix}-artist`,
                    className: "ivlyrics-vinyl-label-artist",
                    title: artist || "",
                    dir: "auto"
                }, artist || ""),
                react.createElement("span", { className: "ivlyrics-vinyl-label-spindle" })
            )
        );
    });

    const VinylPlayer = react.memo(({
        coverUrl,
        title,
        artist,
        album,
        incomingTrack = null,
        trackUri,
        isPlaying,
        position,
        duration,
        onSeek,
        onStopPlayback,
        onTogglePlayback,
        animationsEnabled = true,
        reducedMotion = false,
        rotationSpeed = 100,
        tonearmStyle: tonearmStyleValue = "s",
        tonearmFinish: tonearmFinishValue = "white",
        tonearmSize = 100,
        interactionProps = {},
        className = "",
        style = {}
    }) => {
        const clockRef = useRotationSpeed(rotationSpeed);
        const [phase, setPhase] = useState("paused");
        const phaseRef = useRef("paused");
        const tonearmStyle = normalizeTonearmStyle(tonearmStyleValue);
        const tonearmFinish = normalizeTonearmFinish(tonearmFinishValue);
        const tonearmAppearance = VINYL_TONEARM_APPEARANCES[tonearmFinish];
        const safeTonearmScale = Math.min(1.2, Math.max(0.8, (Number(tonearmSize) || 100) / 100));

        const setVisualPhase = useCallback((nextPhase) => {
            phaseRef.current = nextPhase;
            setPhase(nextPhase);
        }, []);

        useEffect(() => {
            const finalPhase = isPlaying ? "playing" : "paused";

            if (!animationsEnabled || reducedMotion) {
                setVisualPhase(finalPhase);
                return undefined;
            }

            if (phaseRef.current === finalPhase) return undefined;
            if (!isPlaying && phaseRef.current === "paused") return undefined;

            const phaseSequence = isPlaying ? VINYL_PLAY_PHASES : VINYL_PAUSE_PHASES;
            const timers = [];
            const frameId = host.requestAnimationFrame(() => {
                phaseSequence.forEach(([nextPhase, delay]) => {
                    if (delay === 0) {
                        setVisualPhase(nextPhase);
                        return;
                    }
                    timers.push(host.setTimeout(() => setVisualPhase(nextPhase), delay));
                });
            });

            return () => {
                host.cancelAnimationFrame(frameId);
                timers.forEach((timer) => host.clearTimeout(timer));
            };
        }, [animationsEnabled, reducedMotion, isPlaying, setVisualPhase]);

        const {
            tonearmRef, safePosition, safeDuration, tonearmAngle, tonearmProgress,
            canControlTonearm, cueReady, isScrubbing, isCueing, isEjecting, events,
        } = useVinylTonearm({
            react, host, document, trackUri, phase, isPlaying, position, duration, tonearmStyle,
            onSeek, onStopPlayback, onTogglePlayback, setVisualPhase,
        });

        const playLabel = I18n.t(isPlaying ? "fullscreen.controls.pause" : "fullscreen.controls.play");
        const vinylModeLabel = I18n.t("vinyl.mode") || "LP";
        const albumLabel = I18n.t("vinyl.closeHint")
            || I18n.t("fullscreen.backgroundOptions.albumArt");
        const tonearmLabel = I18n.t("vinyl.tonearmHint") || vinylModeLabel;
        const rootClassName = [
            "ivlyrics-vinyl-player",
            `is-${phase}`,
            isScrubbing ? "is-scrubbing" : "",
            isCueing ? "is-cueing" : "",
            cueReady ? "is-cue-ready" : "",
            isEjecting ? "is-ejecting" : "",
            `tonearm-style-${tonearmStyle}`,
            `tonearm-finish-${tonearmFinish}`,
            className
        ].filter(Boolean).join(" ");

        const renderVinylVisualGroup = () => (
            react.createElement("div", { ref: clockRef, className: "ivlyrics-vinyl-visual-group" },
                react.createElement("div", { className: "ivlyrics-vinyl-outgoing-pair" },
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-vinyl-record-shell",
                        "aria-label": playLabel,
                        "aria-describedby": "ivlyrics-vinyl-current-title ivlyrics-vinyl-current-artist",
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
                            decoding: "async",
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
                        decoding: "async",
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
            )
        );
        const renderVinylTonearm = () => (
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
                ...events
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
            renderVinylVisualGroup(),
            renderVinylTonearm()
        );
    });

    return VinylPlayer;
}
