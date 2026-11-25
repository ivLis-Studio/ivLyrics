export function createVinylCompactDisc({ react, host: window, i18n: I18n, getCdVisualizer, useReducedMotion, useRotationSpeed }) {
    const { useState, useEffect, useCallback } = react;

    // Keep the former compact-vinyl presentation id and public component alias
    // so saved preferences and FullscreenOverlay's album interactions survive.
    // The CD face rotates on its own compositor layer, never the spectrum or
    // the lyric tree. Hydrating artwork/AI metadata does not reset its clock.
    const CompactDisc = react.memo(({
        track = {},
        isPlaying = false,
        animationsEnabled = true,
        reducedMotion: appReducedMotion = false,
        cdSettings = {},
        coverClassName = ""
    }) => {
        const systemReducedMotion = useReducedMotion();
        const reducedMotion = appReducedMotion || systemReducedMotion;
        const rotationEnabled = cdSettings.rotationEnabled !== false;
        const clockRef = useRotationSpeed(cdSettings.rotationSpeed, "ivlyrics-cd-spin");
        const enabled = cdSettings.enabled !== false;
        const [analysisState, setAnalysisState] = useState({ uri: track.uri, status: "loading" });
        const [noticeVisible, setNoticeVisible] = useState(true);
        const setAnalysisStatus = useCallback(next => setAnalysisState(current => (
            current.uri === track.uri && current.status === next
                ? current : { uri: track.uri, status: next }
        )), [track.uri]);
        const discSize = Number(cdSettings.discSize ?? 100);
        const scale = Number.isFinite(discSize) ? Math.min(140, Math.max(70, discSize)) / 100 : 1;
        const Visualizer = getCdVisualizer()?.Visualizer;
        const status = !enabled ? "disabled" : !Visualizer ? "unavailable"
            : analysisState.uri === track.uri ? analysisState.status : "loading";
        useEffect(() => {
            setNoticeVisible(true);
            if (status !== "unavailable") return;
            const timer = window.setTimeout(() => setNoticeVisible(false), 3200);
            return () => window.clearTimeout(timer);
        }, [track.uri, status]);
        const statusKey = status === "loading" ? "vinyl.cd.loading" : "vinyl.cd.unavailable";
        return react.createElement("div", {
            className: [
                "ivlyrics-compact-album-vinyl",
                "ivlyrics-cd-stage",
                isPlaying ? "is-playing" : "is-paused",
                animationsEnabled && rotationEnabled && !reducedMotion ? "" : "is-motion-disabled"
            ].filter(Boolean).join(" "),
            style: {
                "--iv-cd-accent": track.accent || "#e5e7eb",
                "--iv-cd-scale": scale
            },
            "data-visualizer-status": status,
            "aria-hidden": "true"
        },
            react.createElement("div", {
                className: "ivlyrics-cd-size"
            },
                Visualizer && react.createElement(Visualizer, {
                    trackUri: track.uri,
                    artworkUrl: track.coverUrl,
                    accent: track.accent,
                    enabled,
                    playing: isPlaying,
                    reducedMotion: reducedMotion || !animationsEnabled,
                    settings: cdSettings,
                    className: "ivlyrics-cd-visualizer",
                    onStatusChange: setAnalysisStatus
                }),
                react.createElement("div", {
                    // Carry only the shared-transition marker. Square-cover
                    // geometry/shadow classes must not leak into the CD face.
                    className: `ivlyrics-cd-disc${String(coverClassName || "").split(/\s+/).includes("ivlyrics-fullscreen-shared-album") ? " ivlyrics-fullscreen-shared-album" : ""}`
                },
                    react.createElement("div", {
                        ref: clockRef,
                        className: "ivlyrics-cd-print-rotor"
                    },
                        react.createElement("div", { className: "ivlyrics-cd-print" },
                            track.coverUrl && react.createElement("img", {
                                key: track.coverUrl,
                                src: track.coverUrl,
                                alt: "",
                                className: "ivlyrics-cd-artwork",
                                draggable: false,
                                onError: event => { event.currentTarget.style.visibility = "hidden"; }
                            })
                        )
                    ),
                    react.createElement("span", { className: "ivlyrics-cd-rim" }),
                    react.createElement("span", { className: "ivlyrics-cd-hub" }),
                    react.createElement("span", { className: "ivlyrics-cd-reflection" })
                )
            ),
            enabled && (status === "loading" || status === "unavailable") &&
                react.createElement("span", {
                    key: `${track.uri}:${status}`,
                    className: `ivlyrics-cd-status${noticeVisible ? "" : " is-dismissed"}`,
                    title: I18n.t(statusKey)
                }, I18n.t(statusKey))
        );
    });

    return CompactDisc;
}
