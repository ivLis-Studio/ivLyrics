import { createFullscreenProgressBar } from "./fullscreenProgressBar.mjs";
import { createFullscreenTrackLibrary } from "./fullscreenTrackLibrary.mjs";

export function createFullscreenPlaybackControls({ react, spotify, translate, getPlaybackPosition, getPlaylistPicker, getDocument, timers = globalThis }) {
    const { useState, useEffect, useMemo, useRef } = react;
    const readTrackUri = () => spotify.Player?.data?.item?.uri || "";
    const readLibrary = () => spotify.Platform?.LibraryAPI;
    const pendingLibraryWrites = new Map();

    const ProgressBar = createFullscreenProgressBar({
        react, getPlayer: () => spotify.Player, getPlaybackPosition, getDocument, timers,
    });

    // Player Controls Component (개선된 UI/UX)
    const PlayerControls = ({ show, showVolume = true, buttonSize = 36, showBackground = false,
        showProgress = false, progressOnly = false }) => {
        const [isPlaying, setIsPlaying] = useState(false);
        const [isShuffle, setIsShuffle] = useState(false);
        const [repeatMode, setRepeatMode] = useState(0);
        const [volume, setVolume] = useState(spotify.Player.getVolume?.() ?? 1);
        const [isMuted, setIsMuted] = useState(false);
        const [isVolumeHovered, setIsVolumeHovered] = useState(false);
        const [isVolumeChanging, setIsVolumeChanging] = useState(false);
        const [libraryTrack, setLibraryTrack] = useState(() => ({ uri: readTrackUri(), liked: null }));
        const trackLibraryRef = useRef(null);
        const volumeChangeTimeoutRef = useRef(null);

        // 재생 상태를 spotify.Player.data.isPaused에서 직접 가져옴
        useEffect(() => {
            if (!show || progressOnly) return;
            const player = spotify.Player;
            const trackLibrary = createFullscreenTrackLibrary({
                readTrackUri, readLibrary, publish: setLibraryTrack, pendingWrites: pendingLibraryWrites,
                reportError: error => console.error("Toggle like error:", error),
            });
            trackLibraryRef.current = trackLibrary;

            const updatePlayState = () => {
                // spotify.Player.data.isPaused가 가장 신뢰할 수 있는 소스
                const isPaused = spotify.Player.data?.isPaused ?? true;
                setIsPlaying(!isPaused);
            };
            const updateShuffle = () => setIsShuffle(spotify.Player.getShuffle?.() || false);
            const updateRepeat = () => setRepeatMode(spotify.Player.getRepeat?.() || 0);

            const updateTrack = () => trackLibrary.syncTrack({ refresh: true });

            // 볼륨 변경 감지 (Spotify 단축키로 변경 시에도 반영)
            let lastVolume = -1;
            const updateVolume = () => {
                const currentVolume = spotify.Player.getVolume?.() ?? 1;
                if (currentVolume !== lastVolume) {
                    lastVolume = currentVolume;
                    setVolume(currentVolume);
                    setIsMuted(currentVolume === 0);
                }
            };

            // 초기 상태 설정
            updatePlayState();
            updateShuffle();
            updateRepeat();
            trackLibrary.syncTrack();
            updateVolume();
            setIsVolumeChanging(false);

            // Spotify can change repeat outside this component (including the
            // temporary Research playback guard), so keep both controls in sync.
            const controlStateCheckInterval = 500;
            const controlStateIntervalId = timers.setInterval(() => {
                updateVolume();
                updateRepeat();
                trackLibrary.syncTrack();
            }, controlStateCheckInterval);

            player.addEventListener("onplaypause", updatePlayState);
            player.addEventListener("songchange", updateTrack);

            return () => {
                timers.clearInterval(controlStateIntervalId);
                if (volumeChangeTimeoutRef.current !== null) {
                    timers.clearTimeout(volumeChangeTimeoutRef.current);
                    volumeChangeTimeoutRef.current = null;
                }
                trackLibrary.dispose();
                trackLibraryRef.current = null;
                player.removeEventListener("onplaypause", updatePlayState);
                player.removeEventListener("songchange", updateTrack);
            };
        }, [show, progressOnly]);

        const playlistTrackUri = readTrackUri();
        const isLiked = libraryTrack.uri === playlistTrackUri && libraryTrack.liked === true;

        const cycleRepeat = () => {
            const nextMode = (repeatMode + 1) % 3;
            spotify.Player.setRepeat(nextMode);
            setRepeatMode(nextMode);
        };

        const buttonStyle = useMemo(() => ({
            width: `${buttonSize}px`,
            height: `${buttonSize}px`
        }), [buttonSize]);
        const mainButtonStyle = useMemo(() => ({
            width: `${buttonSize + 12}px`,
            height: `${buttonSize + 12}px`
        }), [buttonSize]);
        const smallButtonStyle = useMemo(() => ({
            width: `${buttonSize - 4}px`,
            height: `${buttonSize - 4}px`
        }), [buttonSize]);

        if (!show) return null;

        const applyVolumeChange = (newVolume) => {
            setVolume(newVolume);
            spotify.Player.setVolume(newVolume);
            setIsMuted(newVolume === 0);

            setIsVolumeChanging(true);
            if (volumeChangeTimeoutRef.current !== null) timers.clearTimeout(volumeChangeTimeoutRef.current);
            volumeChangeTimeoutRef.current = timers.setTimeout(() => {
                volumeChangeTimeoutRef.current = null;
                setIsVolumeChanging(false);
            }, 1000);
        };

        const handleVolumeChange = (e) => {
            const newVolume = parseFloat(e.target.value);
            applyVolumeChange(newVolume);
        };

        const handleVolumeWheel = (e) => {
            if (!isVolumeHovered) return;
            e.preventDefault();
            const step = 0.05;
            const delta = e.deltaY > 0 ? -step : step;
            const newVolume = Math.min(1, Math.max(0, volume + delta));

            applyVolumeChange(newVolume);
        };

        const toggleMute = () => {
            if (isMuted || volume === 0) {
                const newVol = 0.5;
                spotify.Player.setVolume(newVol);
                setVolume(newVol);
                setIsMuted(false);
            } else {
                spotify.Player.setVolume(0);
                setVolume(0);
                setIsMuted(true);
            }
        };

        const renderMainControlRow = () =>
            react.createElement("div", { className: "fullscreen-control-row fullscreen-control-main-row" },
                // Like button (left side)
                react.createElement("button", {
                    className: `fullscreen-control-btn fullscreen-like-btn ${isLiked ? 'liked' : ''}`,
                    style: smallButtonStyle,
                    onClick: () => trackLibraryRef.current?.toggle(playlistTrackUri),
                    title: isLiked ? translate("fullscreen.controls.unlike") : translate("fullscreen.controls.like")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: isLiked ? "currentColor" : "none",
                        stroke: "currentColor",
                        strokeWidth: isLiked ? "0" : "1.5",
                        dangerouslySetInnerHTML: { __html: spotify.SVGIcons.heart }
                    })
                ),
                // Shuffle
                react.createElement("button", {
                    className: `fullscreen-control-btn ${isShuffle ? 'active' : ''}`,
                    style: smallButtonStyle,
                    onClick: () => {
                        spotify.Player.setShuffle(!isShuffle);
                        setIsShuffle(!isShuffle);
                    },
                    title: translate("fullscreen.controls.shuffle")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: spotify.SVGIcons.shuffle }
                    })
                ),
                // Previous
                react.createElement("button", {
                    className: "fullscreen-control-btn",
                    style: buttonStyle,
                    onClick: () => spotify.Player.back(),
                    title: translate("fullscreen.controls.previous")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: spotify.SVGIcons["skip-back"] }
                    })
                ),
                // Play/Pause (main button)
                react.createElement("button", {
                    className: "fullscreen-control-btn fullscreen-control-play",
                    style: mainButtonStyle,
                    onClick: () => spotify.Player.togglePlay(),
                    title: isPlaying ? translate("fullscreen.controls.pause") : translate("fullscreen.controls.play")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: isPlaying ? spotify.SVGIcons.pause : spotify.SVGIcons.play }
                    })
                ),
                // Next
                react.createElement("button", {
                    className: "fullscreen-control-btn",
                    style: buttonStyle,
                    onClick: () => spotify.Player.next(),
                    title: translate("fullscreen.controls.next")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: spotify.SVGIcons["skip-forward"] }
                    })
                ),
                // Repeat
                react.createElement("button", {
                    className: `fullscreen-control-btn ${repeatMode > 0 ? 'active' : ''}`,
                    style: smallButtonStyle,
                    onClick: cycleRepeat,
                    title: repeatMode === 0 ? translate("fullscreen.controls.repeatOff") : repeatMode === 1 ? translate("fullscreen.controls.repeatAll") : translate("fullscreen.controls.repeatOne")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: repeatMode === 2 ? (spotify.SVGIcons["repeat-once"] || spotify.SVGIcons.repeat) : spotify.SVGIcons.repeat }
                    })
                ),
                // Add to playlist (same menu as the Sync Creator profile rows)
                react.createElement(getPlaylistPicker().PlaylistPickerButton, {
                    trackUri: playlistTrackUri,
                    buttonClassName: "fullscreen-control-btn",
                    buttonStyle: smallButtonStyle,
                    iconSize: buttonSize - 4
                })
            )
        ;

        const renderVolumeRow = () =>
            react.createElement("div", { className: "fullscreen-control-row fullscreen-control-volume-row" },
                react.createElement("div", {
                    className: "fullscreen-volume-wrapper",
                    onMouseEnter: () => setIsVolumeHovered(true),
                    onMouseLeave: () => setIsVolumeHovered(false),
                    onWheel: handleVolumeWheel
                },
                    react.createElement("button", {
                        className: "fullscreen-control-btn",
                        style: smallButtonStyle,
                        onClick: toggleMute,
                        title: isMuted ? translate("fullscreen.controls.unmute") : translate("fullscreen.controls.mute")
                    },
                        react.createElement("svg", {
                            viewBox: "0 0 16 16",
                            fill: "currentColor",
                            dangerouslySetInnerHTML: {
                                __html: (isMuted || volume === 0)
                                    ? spotify.SVGIcons["volume-off"]
                                    : volume < 0.5
                                        ? spotify.SVGIcons["volume-one-wave"]
                                        : spotify.SVGIcons["volume-two-wave"]
                            }
                        })
                    ),
                    react.createElement("input", {
                        type: "range",
                        className: "fullscreen-volume-slider",
                        min: 0,
                        max: 1,
                        step: 0.01,
                        value: volume,
                        onChange: handleVolumeChange
                    }),
                    (isVolumeChanging || isVolumeHovered) && react.createElement("span", {
                        className: "fullscreen-volume-percent",
                        style: {
                            marginLeft: "8px",
                            minWidth: "35px",
                            textAlign: "left",
                            fontSize: "12px",
                            opacity: 0.8
                        }
                    }, `${Math.round(volume * 100)}%`)
                )
            )
        ;

        return react.createElement("div", {
            className: `fullscreen-player-controls ${showBackground ? 'with-background' : ''}`
        },
            // Timeline row, grouped inside the surface that owns the background
            showProgress && react.createElement(ProgressBar, { show: true }),
            // Main control row: like, shuffle, prev, play, next, repeat, add-to-playlist
            !progressOnly && renderMainControlRow(),
            // Volume row
            showVolume && !progressOnly && renderVolumeRow()
        );
    };

    return { ProgressBar, PlayerControls };
}
