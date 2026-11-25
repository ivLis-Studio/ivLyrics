import { formatTime } from "./vinylPlayback.mjs";

export function createVinylStageControls({ react, i18n: I18n, spicetify: Spicetify }) {
    const { useState, useCallback } = react;

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
            fallback: "CD",
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
        },
        {
            id: "motion",
            labelKey: "vinyl.presentation.motionLabel",
            fallback: "Motion",
            icon: "motion"
        }
    ]);

    const PresentationIcon = ({ name }) => {
        const renderFramedPresentationIcon = (pathD) => react.createElement("svg", {
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
            react.createElement("path", { d: pathD })
        );
        if (name === "standard") {
            return renderFramedPresentationIcon("M10 5v14");
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
        if (name === "motion") {
            return renderFramedPresentationIcon("M7 15.5 10 9l2.5 4.5L17 8.5M14.5 8.5H17v2.5");
        }
        if (name === "redirect") {
            // Arrows going round: shoot the edit again.
            return react.createElement("svg", {
                viewBox: "0 0 24 24",
                "aria-hidden": "true"
            },
                react.createElement("path", { d: "M19 12a7 7 0 0 1-12.2 4.7M5 12a7 7 0 0 1 12.2-4.7" }),
                react.createElement("path", { d: "M17.5 3.8v3.6h-3.6M6.5 20.2v-3.6h3.6" })
            );
        }
        return renderFramedPresentationIcon("m10 9 5 3-5 3z");
    };

    const PresentationSwitcher = react.memo(({
        activeMode,
        visible = true,
        onChange,
        onRedirect = null
    }) => {
        const groupLabel = I18n.t("vinyl.presentation.switcherLabel")
            || "Fullscreen presentation";
        const redirectLabel = I18n.t("vinyl.presentation.motionRedirect") || "Direct again";

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
                }),
                // Motion lyrics: a new edit of the song (a new AI take, or another built-in one).
                activeMode === "motion" && typeof onRedirect === "function"
                    ? react.createElement(react.Fragment, null,
                        react.createElement("span", { className: "fullscreen-presentation-divider", "aria-hidden": "true" }),
                        react.createElement("button", {
                            type: "button",
                            className: "fullscreen-presentation-option fullscreen-presentation-redirect",
                            "aria-label": redirectLabel,
                            title: redirectLabel,
                            onClick: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onRedirect();
                            }
                        },
                            react.createElement(PresentationIcon, { name: "redirect" }),
                            react.createElement("span", null, redirectLabel)
                        ))
                    : null
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

    return { PresentationSwitcher, StagePlaybackControls };
}
