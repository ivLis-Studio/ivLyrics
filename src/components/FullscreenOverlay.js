// Fullscreen Overlay Component - Enhanced UI/UX
const FullscreenOverlay = (() => {
    const react = Spicetify.React;
    const { useState, useEffect, useCallback, useRef } = react;

    // Format time helper (ms to mm:ss)
    const formatTime = (ms) => {
        if (!ms || ms < 0) return "0:00";
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Format current time helper
    const formatClock = (date, showSeconds = false) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        if (showSeconds) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    // Trim title helper - removes (Remaster), [feat. xxx], - Live Version, etc.
    const trimTitle = (title) => {
        if (!title) return title;
        const trimmed = title
            .replace(/\(.+?\)/g, "")  // Remove (...)
            .replace(/\[.+?\]/g, "")  // Remove [...]
            .replace(/\s-\s.+?$/g, "") // Remove - suffix
            .trim();
        return trimmed || title;
    };

    // Clock Component
    const Clock = ({ show, showSeconds = false, size = 48 }) => {
        const [time, setTime] = useState(new Date());

        useEffect(() => {
            if (!show) return;
            const interval = showSeconds ? 1000 : 1000;
            const timer = setInterval(() => setTime(new Date()), interval);
            return () => clearInterval(timer);
        }, [show, showSeconds]);

        if (!show) return null;

        return react.createElement("div", {
            className: "fullscreen-clock",
            style: { fontSize: `${size}px` }
        },
            formatClock(time, showSeconds)
        );
    };

    // Context Info Component (Playlist/Album name)
    const ContextInfo = ({ show, showImage = true }) => {
        const [contextName, setContextName] = useState("");
        const [contextType, setContextType] = useState("");
        const [contextImage, setContextImage] = useState("");

        useEffect(() => {
            if (!show) return;

            const updateContext = async () => {
                try {
                    const context = Spicetify.Player.data?.context;
                    if (context?.metadata) {
                        setContextName(context.metadata.context_description || "");

                        // Get image URL - try multiple sources
                        let imageUrl = context.metadata.image_url || "";

                        // Helper function to convert image ID to full URL
                        const toFullImageUrl = (url) => {
                            if (!url) return "";
                            // Already a full URL
                            if (url.startsWith("http://") || url.startsWith("https://")) {
                                return url;
                            }
                            // spotify:image: format
                            if (url.startsWith("spotify:image:")) {
                                const imageId = url.replace("spotify:image:", "");
                                return `https://i.scdn.co/image/${imageId}`;
                            }
                            // Just an image ID (hex string like ab67706c...)
                            if (/^[a-f0-9]+$/i.test(url)) {
                                return `https://i.scdn.co/image/${url}`;
                            }
                            // Unknown format, return as-is
                            return url;
                        };

                        imageUrl = toFullImageUrl(imageUrl);

                        // If still no valid image, try to fetch from context URI
                        if (!imageUrl && context.uri) {
                            try {
                                const uri = context.uri;
                                if (uri.includes("playlist:")) {
                                    const playlistId = uri.split(":").pop();
                                    const playlistData = await Spicetify.CosmosAsync.get(
                                        `https://api.spotify.com/v1/playlists/${playlistId}?fields=images`
                                    );
                                    if (playlistData?.images?.[0]?.url) {
                                        imageUrl = playlistData.images[0].url;
                                    }
                                } else if (uri.includes("album:")) {
                                    const albumId = uri.split(":").pop();
                                    const albumData = await Spicetify.CosmosAsync.get(
                                        `https://api.spotify.com/v1/albums/${albumId}?fields=images`
                                    );
                                    if (albumData?.images?.[0]?.url) {
                                        imageUrl = albumData.images[0].url;
                                    }
                                }
                            } catch (fetchErr) {
                                console.debug("Failed to fetch context image:", fetchErr);
                            }
                        }

                        setContextImage(imageUrl);

                        // Determine context type
                        const uri = context.uri || "";
                        if (uri.includes("playlist")) setContextType(I18n.t("fullscreen.contextType.playlist"));
                        else if (uri.includes("album")) setContextType(I18n.t("fullscreen.contextType.album"));
                        else if (uri.includes("artist")) setContextType(I18n.t("fullscreen.contextType.artist"));
                        else if (uri.includes("collection")) setContextType(I18n.t("fullscreen.contextType.collection"));
                        else if (uri.includes("station")) setContextType(I18n.t("fullscreen.contextType.station"));
                        else setContextType("");
                    }
                } catch (e) {
                    console.error("Context update error:", e);
                }
            };

            updateContext();
            Spicetify.Player.addEventListener("songchange", updateContext);
            return () => Spicetify.Player.removeEventListener("songchange", updateContext);
        }, [show]);

        if (!show || !contextName) return null;

        return react.createElement("div", { className: "fullscreen-context-info" },
            showImage && contextImage && react.createElement("img", {
                src: contextImage,
                className: "fullscreen-context-image"
            }),
            react.createElement("div", { className: "fullscreen-context-text" },
                contextType && react.createElement("span", { className: "fullscreen-context-type" }, contextType),
                react.createElement("span", { className: "fullscreen-context-name" }, contextName)
            )
        );
    };

    // Next Track Preview Component
    const NextTrackPreview = ({ show, secondsBeforeEnd = 15 }) => {
        const [visible, setVisible] = useState(false);
        const [nextTrack, setNextTrack] = useState(null);

        useEffect(() => {
            if (!show) return;

            const checkNextTrack = () => {
                try {
                    // 반복 모드 확인: 0=off, 1=context(전체반복), 2=track(한곡반복)
                    const repeatMode = Spicetify.Player.getRepeat?.() || 0;

                    // 한 곡 반복 모드일 때는 다음 곡 미리보기를 표시하지 않음
                    if (repeatMode === 2) {
                        setVisible(false);
                        return;
                    }

                    const duration = Spicetify.Player.getDuration();
                    const position = Spicetify.Player.getProgress();
                    const remaining = (duration - position) / 1000;

                    // Show when less than secondsBeforeEnd remaining
                    if (remaining <= secondsBeforeEnd && remaining > 0) {
                        // Get next track from queue
                        const queue = Spicetify.Queue;
                        if (queue?.nextTracks?.length > 0) {
                            // Unknown 트랙이 아닌 첫 번째 유효한 트랙 찾기
                            const validNext = queue.nextTracks.find(track => {
                                const meta = track?.contextTrack?.metadata;
                                // Unknown 트랙 필터링 (제목과 아티스트 모두 Unknown이거나 비어있는 경우)
                                if (!meta) return false;
                                const title = meta.title || '';
                                const artist = meta.artist_name || '';
                                const isUnknown = (title.toLowerCase() === 'unknown' && artist.toLowerCase() === 'unknown') ||
                                    (!title && !artist) ||
                                    (title === '' && artist === '');
                                return !isUnknown;
                            });

                            if (validNext?.contextTrack?.metadata) {
                                setNextTrack({
                                    title: validNext.contextTrack.metadata.title,
                                    artist: validNext.contextTrack.metadata.artist_name,
                                    image: validNext.contextTrack.metadata.image_url
                                });
                                setVisible(true);
                                return;
                            }
                        }
                    }
                    setVisible(false);
                } catch (e) {
                    setVisible(false);
                }
            };

            const interval = setInterval(checkNextTrack, 500);
            return () => clearInterval(interval);
        }, [show, secondsBeforeEnd]);

        if (!show || !visible || !nextTrack) return null;

        return react.createElement("div", { className: "fullscreen-next-track" },
            react.createElement("div", { className: "fullscreen-next-track-label" }, I18n.t("fullscreen.controls.nextTrackLabel")),
            react.createElement("div", { className: "fullscreen-next-track-content" },
                nextTrack.image && react.createElement("img", {
                    src: nextTrack.image,
                    className: "fullscreen-next-track-image"
                }),
                react.createElement("div", { className: "fullscreen-next-track-info" },
                    react.createElement("div", { className: "fullscreen-next-track-title" }, nextTrack.title),
                    react.createElement("div", { className: "fullscreen-next-track-artist" }, nextTrack.artist)
                )
            )
        );
    };

    // Progress Bar Component (독립형 - 컨트롤과 별개로 표시 가능)
    const ProgressBar = ({ show }) => {
        const [progress, setProgress] = useState(0);
        const [duration, setDuration] = useState(0);
        const progressRef = useRef(null);
        const isDragging = useRef(false);

        useEffect(() => {
            if (!show) return;

            const updateProgress = () => {
                if (!isDragging.current) {
                    setProgress(Spicetify.Player.getProgress() || 0);
                }
                setDuration(Spicetify.Player.getDuration() || 0);
            };

            updateProgress();
            const progressInterval = setInterval(updateProgress, 200);

            return () => clearInterval(progressInterval);
        }, [show]);

        const handleProgressClick = useCallback((e) => {
            if (!progressRef.current) return;
            const rect = progressRef.current.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const newProgress = percent * duration;
            Spicetify.Player.seek(newProgress);
            setProgress(newProgress);
        }, [duration]);

        const handleProgressDrag = useCallback((e) => {
            if (!isDragging.current || !progressRef.current) return;
            const rect = progressRef.current.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setProgress(percent * duration);
        }, [duration]);

        const handleMouseUp = useCallback((e) => {
            if (isDragging.current && progressRef.current) {
                const rect = progressRef.current.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                Spicetify.Player.seek(percent * duration);
            }
            isDragging.current = false;
            document.removeEventListener('mousemove', handleProgressDrag);
            document.removeEventListener('mouseup', handleMouseUp);
        }, [duration, handleProgressDrag]);

        const handleMouseDown = useCallback(() => {
            isDragging.current = true;
            document.addEventListener('mousemove', handleProgressDrag);
            document.addEventListener('mouseup', handleMouseUp);
        }, [handleProgressDrag, handleMouseUp]);

        if (!show) return null;

        const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

        return react.createElement("div", { className: "fullscreen-progress-standalone" },
            react.createElement("span", { className: "fullscreen-time" }, formatTime(progress)),
            react.createElement("div", {
                className: "fullscreen-progress-bar",
                ref: progressRef,
                onClick: handleProgressClick,
                onMouseDown: handleMouseDown
            },
                react.createElement("div", {
                    className: "fullscreen-progress-fill",
                    style: { width: `${progressPercent}%` }
                }),
                react.createElement("div", {
                    className: "fullscreen-progress-handle",
                    style: { left: `${progressPercent}%` }
                })
            ),
            react.createElement("span", { className: "fullscreen-time" }, formatTime(duration))
        );
    };

    // Player Controls Component (개선된 UI/UX)
    const PlayerControls = ({ show, showVolume = true, buttonSize = 36, showBackground = false }) => {
        const [isPlaying, setIsPlaying] = useState(false);
        const [isShuffle, setIsShuffle] = useState(false);
        const [repeatMode, setRepeatMode] = useState(0);
        const [isLiked, setIsLiked] = useState(false);
        const [volume, setVolume] = useState(Spicetify.Player.getVolume?.() ?? 1);
        const [isMuted, setIsMuted] = useState(false);
        const [isVolumeHovered, setIsVolumeHovered] = useState(false);
        const [isVolumeChanging, setIsVolumeChanging] = useState(false);
        const volumeChangeTimeoutRef = useRef(null);

        // 재생 상태를 Spicetify.Player.data.isPaused에서 직접 가져옴
        useEffect(() => {
            if (!show) return;

            const updatePlayState = () => {
                // Spicetify.Player.data.isPaused가 가장 신뢰할 수 있는 소스
                const isPaused = Spicetify.Player.data?.isPaused ?? true;
                setIsPlaying(!isPaused);
            };
            const updateShuffle = () => setIsShuffle(Spicetify.Player.getShuffle?.() || false);
            const updateRepeat = () => setRepeatMode(Spicetify.Player.getRepeat?.() || 0);

            const checkLiked = async () => {
                try {
                    const uri = Spicetify.Player.data?.item?.uri;
                    if (uri && Spicetify.Platform?.LibraryAPI) {
                        const result = await Spicetify.Platform.LibraryAPI.contains(uri);
                        setIsLiked(Array.isArray(result) ? result[0] : result);
                    }
                } catch (e) { }
            };

            // 볼륨 변경 감지 (Spotify 단축키로 변경 시에도 반영)
            const updateVolume = () => {
                const currentVolume = Spicetify.Player.getVolume?.() ?? 1;
                setVolume(currentVolume);
                setIsMuted(currentVolume === 0);
            };

            // 초기 상태 설정
            updatePlayState();
            updateShuffle();
            updateRepeat();
            checkLiked();
            updateVolume();

            // 볼륨 변경 감지를 위한 interval (200ms 간격으로 체크)
            const volumeInterval = setInterval(updateVolume, 200);

            Spicetify.Player.addEventListener("onplaypause", updatePlayState);
            Spicetify.Player.addEventListener("songchange", checkLiked);

            return () => {
                clearInterval(volumeInterval);
                Spicetify.Player.removeEventListener("onplaypause", updatePlayState);
                Spicetify.Player.removeEventListener("songchange", checkLiked);
            };
        }, [show]);

        const toggleLike = async () => {
            try {
                const uri = Spicetify.Player.data?.item?.uri;
                if (uri && Spicetify.Platform?.LibraryAPI) {
                    if (isLiked) {
                        await Spicetify.Platform.LibraryAPI.remove({ uris: [uri] });
                    } else {
                        await Spicetify.Platform.LibraryAPI.add({ uris: [uri] });
                    }
                    setIsLiked(!isLiked);
                }
            } catch (e) {
                console.error("Toggle like error:", e);
            }
        };

        const cycleRepeat = () => {
            const nextMode = (repeatMode + 1) % 3;
            Spicetify.Player.setRepeat(nextMode);
            setRepeatMode(nextMode);
        };

        if (!show) return null;

        const buttonStyle = {
            width: `${buttonSize}px`,
            height: `${buttonSize}px`
        };
        const mainButtonStyle = {
            width: `${buttonSize + 12}px`,
            height: `${buttonSize + 12}px`
        };
        const smallButtonStyle = {
            width: `${buttonSize - 4}px`,
            height: `${buttonSize - 4}px`
        };

        const handleVolumeChange = (e) => {
            const newVolume = parseFloat(e.target.value);
            setVolume(newVolume);
            Spicetify.Player.setVolume(newVolume);
            setIsMuted(newVolume === 0);

            setIsVolumeChanging(true);
            if (volumeChangeTimeoutRef.current) clearTimeout(volumeChangeTimeoutRef.current);
            volumeChangeTimeoutRef.current = setTimeout(() => setIsVolumeChanging(false), 1000);
        };

        const handleVolumeWheel = (e) => {
            if (!isVolumeHovered) return;
            e.preventDefault();
            const step = 0.05;
            const delta = e.deltaY > 0 ? -step : step;
            const newVolume = Math.min(1, Math.max(0, volume + delta));

            setVolume(newVolume);
            Spicetify.Player.setVolume(newVolume);
            setIsMuted(newVolume === 0);

            setIsVolumeChanging(true);
            if (volumeChangeTimeoutRef.current) clearTimeout(volumeChangeTimeoutRef.current);
            volumeChangeTimeoutRef.current = setTimeout(() => setIsVolumeChanging(false), 1000);
        };

        const toggleMute = () => {
            if (isMuted || volume === 0) {
                const newVol = 0.5;
                Spicetify.Player.setVolume(newVol);
                setVolume(newVol);
                setIsMuted(false);
            } else {
                Spicetify.Player.setVolume(0);
                setVolume(0);
                setIsMuted(true);
            }
        };

        return react.createElement("div", {
            className: `fullscreen-player-controls ${showBackground ? 'with-background' : ''}`
        },
            // Main control row: like, shuffle, prev, play, next, repeat, add-to-playlist
            react.createElement("div", { className: "fullscreen-control-row fullscreen-control-main-row" },
                // Like button (left side)
                react.createElement("button", {
                    className: `fullscreen-control-btn fullscreen-like-btn ${isLiked ? 'liked' : ''}`,
                    style: smallButtonStyle,
                    onClick: toggleLike,
                    title: isLiked ? I18n.t("fullscreen.controls.unlike") : I18n.t("fullscreen.controls.like")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: isLiked ? "currentColor" : "none",
                        stroke: "currentColor",
                        strokeWidth: isLiked ? "0" : "1.5",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons["heart"] }
                    })
                ),
                // Shuffle
                react.createElement("button", {
                    className: `fullscreen-control-btn ${isShuffle ? 'active' : ''}`,
                    style: smallButtonStyle,
                    onClick: () => {
                        Spicetify.Player.setShuffle(!isShuffle);
                        setIsShuffle(!isShuffle);
                    },
                    title: I18n.t("fullscreen.controls.shuffle")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons.shuffle }
                    })
                ),
                // Previous
                react.createElement("button", {
                    className: "fullscreen-control-btn",
                    style: buttonStyle,
                    onClick: () => Spicetify.Player.back(),
                    title: I18n.t("fullscreen.controls.previous")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons["skip-back"] }
                    })
                ),
                // Play/Pause (main button)
                react.createElement("button", {
                    className: "fullscreen-control-btn fullscreen-control-play",
                    style: mainButtonStyle,
                    onClick: () => Spicetify.Player.togglePlay(),
                    title: isPlaying ? I18n.t("fullscreen.controls.pause") : I18n.t("fullscreen.controls.play")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: isPlaying ? Spicetify.SVGIcons.pause : Spicetify.SVGIcons.play }
                    })
                ),
                // Next
                react.createElement("button", {
                    className: "fullscreen-control-btn",
                    style: buttonStyle,
                    onClick: () => Spicetify.Player.next(),
                    title: I18n.t("fullscreen.controls.next")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons["skip-forward"] }
                    })
                ),
                // Repeat
                react.createElement("button", {
                    className: `fullscreen-control-btn ${repeatMode > 0 ? 'active' : ''}`,
                    style: smallButtonStyle,
                    onClick: cycleRepeat,
                    title: repeatMode === 0 ? I18n.t("fullscreen.controls.repeatOff") : repeatMode === 1 ? I18n.t("fullscreen.controls.repeatAll") : I18n.t("fullscreen.controls.repeatOne")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: repeatMode === 2 ? (Spicetify.SVGIcons["repeat-once"] || Spicetify.SVGIcons.repeat) : Spicetify.SVGIcons.repeat }
                    })
                ),
                // Share link button (right side, for symmetry)
                react.createElement("button", {
                    className: "fullscreen-control-btn",
                    style: smallButtonStyle,
                    onClick: async () => {
                        const trackId = Spicetify.Player.data?.item?.uri?.split(':')[2];
                        if (trackId) {
                            const shareUrl = `https://open.spotify.com/track/${trackId}`;
                            try {
                                await navigator.clipboard.writeText(shareUrl);
                                Toast.success(I18n.t("fullscreen.controls.shareCopied"));
                            } catch (e) {
                                // Fallback
                                if (Spicetify.Platform?.ClipboardAPI) {
                                    Spicetify.Platform.ClipboardAPI.copy(shareUrl);
                                    Toast.success(I18n.t("fullscreen.controls.shareCopied"));
                                }
                            }
                        }
                    },
                    title: I18n.t("fullscreen.controls.share")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons["share"] || '<path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>' }
                    })
                )
            ),
            // Volume row
            showVolume && react.createElement("div", { className: "fullscreen-control-row fullscreen-control-volume-row" },
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
                        title: isMuted ? I18n.t("fullscreen.controls.unmute") : I18n.t("fullscreen.controls.mute")
                    },
                        react.createElement("svg", {
                            viewBox: "0 0 16 16",
                            fill: "currentColor",
                            dangerouslySetInnerHTML: {
                                __html: (isMuted || volume === 0)
                                    ? Spicetify.SVGIcons["volume-off"]
                                    : volume < 0.5
                                        ? Spicetify.SVGIcons["volume-one-wave"]
                                        : Spicetify.SVGIcons["volume-two-wave"]
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
        );
    };

    // Lyrics Progress Indicator
    const LyricsProgress = ({ show, currentLine, totalLines }) => {
        if (!show || totalLines <= 0) return null;

        const percent = Math.round(((currentLine + 1) / totalLines) * 100);

        return react.createElement("div", { className: "fullscreen-lyrics-progress" },
            react.createElement("div", { className: "fullscreen-lyrics-progress-bar" },
                react.createElement("div", {
                    className: "fullscreen-lyrics-progress-fill",
                    style: { width: `${percent}%` }
                })
            ),
            react.createElement("span", { className: "fullscreen-lyrics-progress-text" },
                `${currentLine + 1} / ${totalLines}`
            )
        );
    };

    // Queue Panel Component - 오른쪽 hover 시 재생 대기열 표시
    const QueuePanel = ({ show, isFullscreen }) => {
        const [isHovered, setIsHovered] = useState(false);
        const [currentTrack, setCurrentTrack] = useState(null);
        const [nextTracks, setNextTracks] = useState([]);
        const [recentTracks, setRecentTracks] = useState([]);
        const [activeTab, setActiveTab] = useState('queue'); // 'queue' or 'recent'

        // 재생 대기열 업데이트
        useEffect(() => {
            if (!show || !isFullscreen) return;

            const updateQueue = () => {
                try {
                    const queue = Spicetify.Queue;
                    const playerData = Spicetify.Player.data;

                    // 현재 재생 중인 곡
                    if (playerData?.item) {
                        const meta = playerData.item.metadata;
                        setCurrentTrack({
                            title: meta?.title || "Unknown",
                            artist: meta?.artist_name || "Unknown",
                            image: meta?.image_url || "",
                            uri: playerData.item.uri
                        });
                    }

                    // 다음 곡들 (최대 15곡) - Unknown 트랙 이후 필터링
                    if (queue?.nextTracks?.length > 0) {
                        // Unknown 트랙의 인덱스 찾기 (컨텍스트 끝 마커)
                        const unknownIndex = queue.nextTracks.findIndex(track => {
                            const meta = track?.contextTrack?.metadata || {};
                            const title = meta.title || '';
                            const artist = meta.artist_name || '';
                            // Unknown 트랙 감지: 제목과 아티스트 모두 Unknown이거나 비어있는 경우
                            return (title.toLowerCase() === 'unknown' && artist.toLowerCase() === 'unknown') ||
                                (!title && !artist) ||
                                (title === '' && artist === '');
                        });

                        // Unknown 트랙이 있으면 그 이전까지만, 없으면 전체
                        const tracksToShow = unknownIndex >= 0
                            ? queue.nextTracks.slice(0, unknownIndex)
                            : queue.nextTracks;

                        const next = tracksToShow.slice(0, 15).map((track, index) => {
                            const meta = track.contextTrack?.metadata || {};
                            return {
                                title: meta.title || "Unknown",
                                artist: meta.artist_name || "Unknown",
                                image: meta.image_url || "",
                                uri: track.contextTrack?.uri || "",
                                index: index + 1
                            };
                        });
                        setNextTracks(next);
                    } else {
                        setNextTracks([]);
                    }

                    // 최근 재생 곡들 (이전 곡 기록)
                    if (queue?.prevTracks?.length > 0) {
                        const prev = queue.prevTracks.slice(-10).reverse().map((track, index) => {
                            const meta = track.contextTrack?.metadata || {};
                            return {
                                title: meta.title || "Unknown",
                                artist: meta.artist_name || "Unknown",
                                image: meta.image_url || "",
                                uri: track.contextTrack?.uri || "",
                                index: index + 1
                            };
                        });
                        setRecentTracks(prev);
                    } else {
                        setRecentTracks([]);
                    }
                } catch (e) {
                    console.warn('[FullscreenOverlay] Queue update failed:', e);
                }
            };

            updateQueue();
            const interval = setInterval(updateQueue, 1000);

            // 곡 변경 이벤트 리스너
            const songChangeHandler = () => updateQueue();
            Spicetify.Player.addEventListener("songchange", songChangeHandler);

            return () => {
                clearInterval(interval);
                Spicetify.Player.removeEventListener("songchange", songChangeHandler);
            };
        }, [show, isFullscreen]);

        // 곡 클릭 시 재생
        const handleTrackClick = useCallback((uri) => {
            if (!uri) return;
            try {
                // URI로 직접 재생 (불필요한 스킵 요청 방지)
                Spicetify.Player.playUri(uri);
            } catch (e) {
                console.warn('[FullscreenOverlay] Failed to play track:', e);
            }
        }, []);

        if (!show || !isFullscreen) return null;

        return react.createElement("div", {
            className: "fullscreen-queue-wrapper",
            onMouseLeave: () => setIsHovered(false)
        },
            // Hover trigger area (투명한 오른쪽 영역)
            react.createElement("div", {
                className: "fullscreen-queue-trigger-area",
                onMouseEnter: () => setIsHovered(true)
            }),

            // Queue panel (항상 렌더링, visible 클래스로 애니메이션 제어)
            react.createElement("div", {
                className: `fullscreen-queue-panel ${isHovered ? 'visible' : ''}`,
                onMouseEnter: () => setIsHovered(true)
            },
                // Content
                react.createElement("div", { className: "fullscreen-queue-content" },
                    activeTab === 'queue' ? react.createElement(react.Fragment, null,
                        // 현재 재생 중
                        currentTrack && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                I18n.t("fullscreen.queue.nowPlaying")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-item current" },
                                currentTrack.image && react.createElement("img", {
                                    src: currentTrack.image,
                                    className: "fullscreen-queue-item-image"
                                }),
                                react.createElement("div", { className: "fullscreen-queue-item-info" },
                                    react.createElement("div", { className: "fullscreen-queue-item-title" }, currentTrack.title),
                                    react.createElement("div", { className: "fullscreen-queue-item-artist" }, currentTrack.artist)
                                ),
                                react.createElement("div", { className: "fullscreen-queue-item-playing" },
                                    react.createElement("span", { className: "fullscreen-queue-playing-icon" }, "♪")
                                )
                            )
                        ),

                        // 다음 재생 곡들
                        nextTracks.length > 0 && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                I18n.t("fullscreen.queue.upNext")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-list" },
                                nextTracks.map((track, idx) =>
                                    react.createElement("div", {
                                        key: `next-${idx}`,
                                        className: "fullscreen-queue-item",
                                        onClick: () => handleTrackClick(track.uri)
                                    },
                                        track.image && react.createElement("img", {
                                            src: track.image,
                                            className: "fullscreen-queue-item-image"
                                        }),
                                        react.createElement("div", { className: "fullscreen-queue-item-info" },
                                            react.createElement("div", { className: "fullscreen-queue-item-title" }, track.title),
                                            react.createElement("div", { className: "fullscreen-queue-item-artist" }, track.artist)
                                        )
                                    )
                                )
                            )
                        ),

                        // 대기열이 비어있는 경우
                        nextTracks.length === 0 && react.createElement("div", { className: "fullscreen-queue-empty" },
                            I18n.t("fullscreen.queue.empty")
                        )
                    ) : react.createElement(react.Fragment, null,
                        // 최근 재생 곡들
                        recentTracks.length > 0 ? react.createElement("div", { className: "fullscreen-queue-list" },
                            recentTracks.map((track, idx) =>
                                react.createElement("div", {
                                    key: `recent-${idx}`,
                                    className: "fullscreen-queue-item",
                                    onClick: () => handleTrackClick(track.uri)
                                },
                                    track.image && react.createElement("img", {
                                        src: track.image,
                                        className: "fullscreen-queue-item-image"
                                    }),
                                    react.createElement("div", { className: "fullscreen-queue-item-info" },
                                        react.createElement("div", { className: "fullscreen-queue-item-title" }, track.title),
                                        react.createElement("div", { className: "fullscreen-queue-item-artist" }, track.artist)
                                    )
                                )
                            )
                        ) : react.createElement("div", { className: "fullscreen-queue-empty" },
                            I18n.t("fullscreen.queue.noRecent")
                        )
                    )
                ),

                // Footer with tabs (하단에 탭 버튼)
                react.createElement("div", { className: "fullscreen-queue-footer" },
                    react.createElement("button", {
                        className: `fullscreen-queue-tab ${activeTab === 'queue' ? 'active' : ''}`,
                        onClick: () => setActiveTab('queue')
                    }, I18n.t("fullscreen.queue.title")),
                    react.createElement("button", {
                        className: `fullscreen-queue-tab ${activeTab === 'recent' ? 'active' : ''}`,
                        onClick: () => setActiveTab('recent')
                    }, I18n.t("fullscreen.queue.recentlyPlayed"))
                )
            )
        );
    };

    // Main Overlay Component
    const Overlay = ({
        coverUrl,
        title,
        artist,
        isFullscreen,
        currentLyricIndex = 0,
        totalLyrics = 0,
        translatedMetadata = null,
        trackUri = null
    }) => {
        const [uiVisible, setUiVisible] = useState(true);
        const [tmiMode, setTmiMode] = useState(false);
        const [tmiData, setTmiData] = useState(null);
        const [tmiLoading, setTmiLoading] = useState(false);
        const [isPlaying, setIsPlaying] = useState(false);
        const [position, setPosition] = useState(0);
        const [duration, setDuration] = useState(0);
        const hideTimerRef = useRef(null);

        // Track playback state for TV mode controls
        useEffect(() => {
            const updatePlaybackState = () => {
                const isPaused = Spicetify.Player?.data?.isPaused ?? true;
                setIsPlaying(!isPaused);
                setPosition(Spicetify.Player?.getProgress?.() || 0);
                setDuration(Spicetify.Player?.data?.item?.metadata?.duration_ms || Spicetify.Player?.getDuration?.() || 0);
            };

            updatePlaybackState();

            const interval = setInterval(updatePlaybackState, 500);
            Spicetify.Player?.addEventListener?.("songchange", updatePlaybackState);
            Spicetify.Player?.addEventListener?.("onplaypause", updatePlaybackState);

            return () => {
                clearInterval(interval);
                Spicetify.Player?.removeEventListener?.("songchange", updatePlaybackState);
                Spicetify.Player?.removeEventListener?.("onplaypause", updatePlaybackState);
            };
        }, []);

        // Get settings from CONFIG
        const showAlbum = CONFIG?.visual?.["fullscreen-show-album"] !== false;
        const showInfo = CONFIG?.visual?.["fullscreen-show-info"] !== false;
        const albumSize = Number(CONFIG?.visual?.["fullscreen-album-size"]) || 400;
        const albumRadiusValue = Number(CONFIG?.visual?.["fullscreen-album-radius"]);
        const albumRadius = isNaN(albumRadiusValue) ? 12 : albumRadiusValue;
        const titleSize = Number(CONFIG?.visual?.["fullscreen-title-size"]) || 48;
        const artistSize = Number(CONFIG?.visual?.["fullscreen-artist-size"]) || 24;

        // UI element settings
        const showClock = CONFIG?.visual?.["fullscreen-show-clock"] !== false;
        const clockShowSeconds = CONFIG?.visual?.["fullscreen-clock-show-seconds"] === true;
        const clockSize = Number(CONFIG?.visual?.["fullscreen-clock-size"]) || 48;
        const showContext = CONFIG?.visual?.["fullscreen-show-context"] !== false;
        const showContextImage = CONFIG?.visual?.["fullscreen-show-context-image"] !== false;
        const showNextTrack = CONFIG?.visual?.["fullscreen-show-next-track"] !== false;
        const nextTrackSeconds = Number(CONFIG?.visual?.["fullscreen-next-track-seconds"]) || 15;
        const showControls = CONFIG?.visual?.["fullscreen-show-controls"] !== false;
        const showVolume = CONFIG?.visual?.["fullscreen-show-volume"] !== false;
        const showProgress = CONFIG?.visual?.["fullscreen-show-progress"] !== false;
        const showLyricsProgress = CONFIG?.visual?.["fullscreen-show-lyrics-progress"] === true;
        const showQueue = CONFIG?.visual?.["fullscreen-show-queue"] !== false;
        const autoHideUI = CONFIG?.visual?.["fullscreen-auto-hide-ui"] !== false;
        const autoHideDelay = (Number(CONFIG?.visual?.["fullscreen-auto-hide-delay"]) || 3) * 1000;

        // TMI Font size settings
        const tmiScale = (Number(CONFIG?.visual?.["fullscreen-tmi-font-size"]) || 100) / 100;

        // Control style settings
        const controlButtonSize = Number(CONFIG?.visual?.["fullscreen-control-button-size"]) || 36;
        const controlsBackground = CONFIG?.visual?.["fullscreen-controls-background"] === true;
        const controlsCompact = CONFIG?.visual?.["fullscreen-controls-compact"] === true;

        // Layout settings
        const controlsPosition = CONFIG?.visual?.["fullscreen-controls-position"] || "left-panel";
        const albumShadow = CONFIG?.visual?.["fullscreen-album-shadow"] !== false;
        const infoGapVal = CONFIG?.visual?.["fullscreen-info-gap"];
        const infoGap = (infoGapVal !== undefined && infoGapVal !== null) ? Number(infoGapVal) : 24;

        // TV Mode settings
        const tvModeEnabled = CONFIG?.visual?.["fullscreen-tv-mode"] === true;
        const tvAlbumSize = Number(CONFIG?.visual?.["fullscreen-tv-album-size"]) || 140;
        const trimTitleEnabled = CONFIG?.visual?.["fullscreen-trim-title"] === true;
        
        // Normal mode settings
        const normalShowAlbumName = CONFIG?.visual?.["fullscreen-show-album-name"] !== false;
        
        // TV Mode specific settings
        const tvShowAlbumName = CONFIG?.visual?.["fullscreen-tv-show-album-name"] !== false;
        const tvShowControls = CONFIG?.visual?.["fullscreen-tv-show-controls"] !== false;
        const tvShowProgress = CONFIG?.visual?.["fullscreen-tv-show-progress"] !== false;

        // Auto-hide UI on mouse inactivity
        useEffect(() => {
            if (!isFullscreen || !autoHideUI) {
                setUiVisible(true);
                return;
            }

            const handleMouseMove = () => {
                setUiVisible(true);
                if (hideTimerRef.current) {
                    clearTimeout(hideTimerRef.current);
                }
                hideTimerRef.current = setTimeout(() => {
                    setUiVisible(false);
                }, autoHideDelay);
            };

            hideTimerRef.current = setTimeout(() => {
                setUiVisible(false);
            }, autoHideDelay);

            document.addEventListener('mousemove', handleMouseMove);

            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                if (hideTimerRef.current) {
                    clearTimeout(hideTimerRef.current);
                }
            };
        }, [isFullscreen, autoHideUI, autoHideDelay]);

        // Handle album art click - toggle TMI mode
        const handleAlbumClick = useCallback(async () => {
            if (tmiMode) {
                setTmiMode(false);
                return;
            }

            const apiKey = CONFIG.visual?.["gemini-api-key"];
            if (!apiKey || (apiKey.startsWith('[') && apiKey.includes('""') && apiKey.length < 10)) { // Simple validation
                // If apiKey is empty list or empty string
            }
            // Actually original check was simple !apiKey
            // If I change to ConfigKeyList, apiKey might be '[""]' string.
            // !'[""]' is false. So it passes.
            // I should improve check.
            let hasKey = !!apiKey;
            if (apiKey && apiKey.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(apiKey);
                    hasKey = parsed.some(k => k && k.trim().length > 0);
                } catch (e) { hasKey = false; }
            }

            if (!hasKey) {
                Toast.error(I18n.t("tmi.requireKey"));
                return;
            }

            const trackId = trackUri?.split(":")[2];
            if (!trackId) return;

            setTmiMode(true);
            setTmiLoading(true);

            try {
                const data = await window.SongInfoTMI?.fetchSongInfo(trackId);
                setTmiData(data);
            } catch (e) {
                console.error('[TMI] Fetch error:', e);
                setTmiData(null);
            } finally {
                setTmiLoading(false);
            }
        }, [tmiMode, trackUri]);

        // Handle Regenerate
        const handleRegenerate = useCallback(async () => {
            const trackId = trackUri?.split(":")[2];
            if (!trackId) return;

            setTmiLoading(true);
            try {
                // Pass true for regenerate
                const data = await window.SongInfoTMI?.fetchSongInfo(trackId, true);
                setTmiData(data);
            } catch (e) {
                console.error('[TMI] Regenerate error:', e);
            } finally {
                setTmiLoading(false);
            }
        }, [trackUri]);

        // Close TMI mode
        const closeTmiMode = useCallback(() => {
            setTmiMode(false);
        }, []);

        // Reset TMI mode when track changes
        useEffect(() => {
            if (tmiMode) {
                const trackId = trackUri?.split(":")[2];
                if (trackId) {
                    setTmiLoading(true);
                    setTmiData(null);
                    window.SongInfoTMI?.fetchSongInfo(trackId).then(data => {
                        setTmiData(data);
                        setTmiLoading(false);
                    }).catch(() => setTmiLoading(false));
                }
            } else {
                setTmiData(null);
            }
        }, [trackUri]);

        if (!isFullscreen) return null;

        const isTwoColumn = CONFIG?.visual?.["fullscreen-two-column"] !== false;
        const hideLeftPanel = !showAlbum && !showInfo && controlsPosition !== "left-panel";
        const showControlsInLeftPanel = controlsPosition === "left-panel" && showControls;
        const showControlsInBottom = controlsPosition === "bottom" && showControls;

        // In TV mode, hide the left panel (album/info shown at bottom-left instead)
        const hideLeftPanelForTvMode = tvModeEnabled;

        return react.createElement(react.Fragment, null,
            // Bottom-left: TV Mode Song Info OR Context info
            tvModeEnabled ? react.createElement("div", {
                className: "fullscreen-tv-song-info"
            },
                // Album art
                react.createElement("img", {
                    src: coverUrl || Spicetify.Player.data?.item?.metadata?.image_url,
                    className: "fullscreen-tv-album",
                    style: {
                        width: `${tvAlbumSize}px`,
                        height: `${tvAlbumSize}px`,
                        borderRadius: `${albumRadius}px`
                    }
                }),
                // Track info (Title, Artist, Album)
                react.createElement("div", { className: "fullscreen-tv-track-info" },
                    // Title (based on display mode - TV mode shows single line with best available)
                    react.createElement("div", {
                        className: "fullscreen-tv-title",
                        style: { fontSize: `${Math.round(tvAlbumSize * 0.26)}px` }
                    },
                        (() => {
                            const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                            const originalTitle = title || Spicetify.Player.data?.item?.metadata?.title;
                            const translatedTitle = translatedMetadata?.translated?.title;
                            const romanizedTitle = translatedMetadata?.romanized?.title;
                            const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                            let result;
                            switch (mode) {
                                case "translated":
                                case "original-translated":
                                case "all":
                                    // 번역이 있으면 번역, 없으면 원어
                                    result = translatedTitle || originalTitle;
                                    break;
                                case "romanized":
                                case "original-romanized":
                                    // 발음이 있으면 발음, 없으면 원어
                                    result = romanizedTitle || originalTitle;
                                    break;
                                default:
                                    result = originalTitle;
                            }
                            return applyTrim(result);
                        })()
                    ),
                    // Artist (based on display mode - TV mode shows single line with best available)
                    react.createElement("div", {
                        className: "fullscreen-tv-artist",
                        style: { fontSize: `${Math.round(tvAlbumSize * 0.16)}px` }
                    },
                        (() => {
                            const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                            const originalArtist = artist || Spicetify.Player.data?.item?.metadata?.artist_name;
                            const translatedArtist = translatedMetadata?.translated?.artist;
                            const romanizedArtist = translatedMetadata?.romanized?.artist;
                            const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                            let result;
                            switch (mode) {
                                case "translated":
                                case "original-translated":
                                case "all":
                                    // 번역이 있으면 번역, 없으면 원어
                                    result = translatedArtist || originalArtist;
                                    break;
                                case "romanized":
                                case "original-romanized":
                                    // 발음이 있으면 발음, 없으면 원어
                                    result = romanizedArtist || originalArtist;
                                    break;
                                default:
                                    result = originalArtist;
                            }
                            return applyTrim(result);
                        })()
                    ),
                    // Album name (from context)
                    tvShowAlbumName && react.createElement("div", { className: "fullscreen-tv-album-name" },
                        (() => {
                            try {
                                const albumName = Spicetify.Player.data?.item?.metadata?.album_title;
                                const releaseYear = Spicetify.Player.data?.item?.metadata?.album_disc_number
                                    ? ""
                                    : (Spicetify.Player.data?.item?.metadata?.year || "");
                                return albumName ? `${albumName}${releaseYear ? ` • ${releaseYear}` : ''}` : '';
                            } catch (e) { return ''; }
                        })()
                    )
                ),
                // TV Mode Controls & Progress (right side)
                (tvShowControls || tvShowProgress) && react.createElement("div", { 
                    className: "fullscreen-tv-controls-wrapper"
                },
                    // TV Mode Controls
                    tvShowControls && react.createElement("div", { 
                        className: "fullscreen-tv-controls"
                    },
                        // Previous button
                        react.createElement("button", {
                            className: "fullscreen-tv-control-btn",
                            onClick: () => Spicetify.Player.back(),
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
                            onClick: () => Spicetify.Player.togglePlay()
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
                            onClick: () => Spicetify.Player.next(),
                            title: "Next"
                        },
                            react.createElement("svg", {
                                width: "24", height: "24", viewBox: "0 0 16 16", fill: "currentColor"
                            },
                                react.createElement("path", { d: "M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z" })
                            )
                        )
                    ),
                    // TV Mode Progress bar
                    tvShowProgress && react.createElement("div", { 
                        className: "fullscreen-tv-progress"
                    },
                        react.createElement("span", { className: "fullscreen-tv-time current" }, formatTime(position)),
                        react.createElement("div", { 
                            className: "fullscreen-tv-progress-bar",
                            onClick: (e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const percentage = clickX / rect.width;
                                const seekPosition = Math.floor(duration * percentage);
                                Spicetify.Player.seek(seekPosition);
                            }
                        },
                            react.createElement("div", {
                                className: "fullscreen-tv-progress-fill",
                                style: { width: `${duration > 0 ? (position / duration) * 100 : 0}%` }
                            })
                        ),
                        react.createElement("span", { className: "fullscreen-tv-time total" }, formatTime(duration))
                    )
                )
            ) : react.createElement("div", {
                className: `fullscreen-bottom-left ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(ContextInfo, { show: showContext, showImage: showContextImage })
            ),
            // Top-right: Clock & Next track
            react.createElement("div", {
                className: "fullscreen-top-right"
            },
                react.createElement("div", {
                    className: `fullscreen-clock-wrapper ${!uiVisible ? 'hidden' : ''}`
                },
                    react.createElement(Clock, {
                        show: showClock,
                        showSeconds: clockShowSeconds,
                        size: clockSize
                    })
                ),
                // NextTrackPreview는 UI 숨김과 관계없이 항상 표시
                react.createElement(NextTrackPreview, {
                    show: showNextTrack,
                    secondsBeforeEnd: nextTrackSeconds
                })
            ),
            // Left panel (Album, Info & Controls) OR TMI View - Hidden in TV Mode
            isTwoColumn && !hideLeftPanel && !hideLeftPanelForTvMode && react.createElement("div", {
                className: `lyrics-fullscreen-left-panel ${!uiVisible && showControlsInLeftPanel ? 'controls-hidden' : ''} ${tmiMode ? 'tmi-mode' : ''}`
            },
                // TMI Mode View
                tmiMode ? (
                    tmiLoading ?
                        react.createElement(window.SongInfoTMI?.TMILoadingView || 'div', {
                            onClose: closeTmiMode,
                            tmiScale: tmiScale
                        }) :
                        react.createElement(window.SongInfoTMI?.TMIFullView || 'div', {
                            info: tmiData,
                            onClose: closeTmiMode,
                            tmiScale: tmiScale,
                            trackName: (() => {
                                const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                const original = title || Spicetify.Player.data?.item?.metadata?.title;
                                const trans = translatedMetadata?.translated?.title;
                                const rom = translatedMetadata?.romanized?.title;

                                if (mode === "translated") return trans || original;
                                if (mode === "romanized") return rom || original;
                                if (mode === "original-translated") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                if (mode === "original-romanized") return (rom && rom !== original) ? `${original} (${rom})` : original;
                                if (mode === "all") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                return original;
                            })(),
                            artistName: (() => {
                                const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                const original = artist || Spicetify.Player.data?.item?.metadata?.artist_name;
                                const trans = translatedMetadata?.translated?.artist;
                                const rom = translatedMetadata?.romanized?.artist;

                                if (mode === "translated") return trans || original;
                                if (mode === "romanized") return rom || original;
                                if (mode === "original-translated") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                if (mode === "original-romanized") return (rom && rom !== original) ? `${original} (${rom})` : original;
                                if (mode === "all") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                return original;
                            })(),
                            coverUrl: coverUrl || Spicetify.Player.data?.item?.metadata?.image_url,
                            onRegenerate: handleRegenerate
                        })
                ) :
                    // Normal Mode
                    react.createElement("div", {
                        className: "lyrics-fullscreen-left-content",
                        style: { gap: `${infoGap}px` }
                    },
                        // Album art container (clickable for TMI)
                        showAlbum && react.createElement("div", {
                            className: `lyrics-fullscreen-album-container clickable-album-container`,
                            style: {
                                width: `${albumSize}px`,
                                height: `${albumSize}px`,
                                maxWidth: `${albumSize}px`,
                                position: 'relative',
                                cursor: 'pointer',
                                borderRadius: `${albumRadius}px`
                            },
                            onClick: handleAlbumClick
                        },
                            react.createElement("img", {
                                src: coverUrl || Spicetify.Player.data?.item?.metadata?.image_url,
                                className: `lyrics-fullscreen-album-art ${albumShadow ? 'with-shadow' : ''}`,
                                style: {
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: `${albumRadius}px`
                                }
                            }),
                            // TMI Hint Overlay
                            react.createElement("div", {
                                className: "album-tmi-hint",
                                style: { borderRadius: `${albumRadius}px` }
                            },
                                react.createElement("div", { className: "album-tmi-hint-content" },
                                    react.createElement("span", { className: "album-tmi-text" },
                                        CONFIG.visual?.["gemini-api-key"]
                                            ? I18n.t("tmi.viewInfo")
                                            : I18n.t("tmi.requireKey")
                                    ),
                                    CONFIG.visual?.["gemini-api-key"] && react.createElement("span", { 
                                        className: "album-tmi-disclaimer" 
                                    }, I18n.t("tmi.disclaimer"))
                                )
                            )
                        ),
                        // Track info with translated metadata support
                        showInfo && react.createElement("div", { className: "lyrics-fullscreen-track-info" },
                            // Title (based on display mode)
                            react.createElement("div", { className: "lyrics-fullscreen-title-container" },
                                (() => {
                                    const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                    const originalTitle = title || Spicetify.Player.data?.item?.metadata?.title;
                                    const translatedTitle = translatedMetadata?.translated?.title;
                                    const romanizedTitle = translatedMetadata?.romanized?.title;
                                    const elements = [];

                                    // Apply trimTitle if enabled
                                    const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                                    switch (mode) {
                                        case "translated":
                                            // 번역만 표시 (없으면 원어)
                                            elements.push(react.createElement("div", {
                                                key: "title-main",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(translatedTitle || originalTitle)));
                                            break;

                                        case "romanized":
                                            // 발음만 표시 (없으면 원어)
                                            elements.push(react.createElement("div", {
                                                key: "title-main",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(romanizedTitle || originalTitle)));
                                            break;

                                        case "original-translated":
                                            // 원어 + 번역
                                            elements.push(react.createElement("div", {
                                                key: "title-original",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(originalTitle)));
                                            if (translatedTitle && translatedTitle !== originalTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-translated",
                                                    className: "lyrics-fullscreen-title-translated",
                                                    style: { fontSize: `${Math.round(titleSize * 0.6)}px` }
                                                }, applyTrim(translatedTitle)));
                                            }
                                            break;

                                        case "original-romanized":
                                            // 원어 + 발음
                                            elements.push(react.createElement("div", {
                                                key: "title-original",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(originalTitle)));
                                            if (romanizedTitle && romanizedTitle !== originalTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-romanized",
                                                    className: "lyrics-fullscreen-title-romanized",
                                                    style: { fontSize: `${Math.round(titleSize * 0.5)}px` }
                                                }, applyTrim(romanizedTitle)));
                                            }
                                            break;

                                        case "all":
                                        default:
                                            // 모두 표시 (원어 + 번역 + 발음)
                                            elements.push(react.createElement("div", {
                                                key: "title-original",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(originalTitle)));
                                            if (translatedTitle && translatedTitle !== originalTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-translated",
                                                    className: "lyrics-fullscreen-title-translated",
                                                    style: { fontSize: `${Math.round(titleSize * 0.6)}px` }
                                                }, applyTrim(translatedTitle)));
                                            }
                                            if (romanizedTitle && romanizedTitle !== originalTitle && romanizedTitle !== translatedTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-romanized",
                                                    className: "lyrics-fullscreen-title-romanized",
                                                    style: { fontSize: `${Math.round(titleSize * 0.5)}px` }
                                                }, applyTrim(romanizedTitle)));
                                            }
                                            break;
                                    }

                                    return elements;
                                })()
                            ),
                            // Artist (based on display mode)
                            react.createElement("div", { className: "lyrics-fullscreen-artist-container" },
                                (() => {
                                    const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                    const originalArtist = artist || Spicetify.Player.data?.item?.metadata?.artist_name;
                                    const translatedArtist = translatedMetadata?.translated?.artist;
                                    const romanizedArtist = translatedMetadata?.romanized?.artist;
                                    const elements = [];

                                    // Apply trimTitle if enabled
                                    const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                                    switch (mode) {
                                        case "translated":
                                            elements.push(react.createElement("div", {
                                                key: "artist-main",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(translatedArtist || originalArtist)));
                                            break;

                                        case "romanized":
                                            elements.push(react.createElement("div", {
                                                key: "artist-main",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(romanizedArtist || originalArtist)));
                                            break;

                                        case "original-translated":
                                            elements.push(react.createElement("div", {
                                                key: "artist-original",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(originalArtist)));
                                            if (translatedArtist && translatedArtist !== originalArtist) {
                                                elements.push(react.createElement("div", {
                                                    key: "artist-translated",
                                                    className: "lyrics-fullscreen-artist-translated",
                                                    style: { fontSize: `${Math.round(artistSize * 0.8)}px` }
                                                }, applyTrim(translatedArtist)));
                                            }
                                            break;

                                        case "original-romanized":
                                            elements.push(react.createElement("div", {
                                                key: "artist-original",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(originalArtist)));
                                            if (romanizedArtist && romanizedArtist !== originalArtist) {
                                                elements.push(react.createElement("div", {
                                                    key: "artist-romanized",
                                                    className: "lyrics-fullscreen-artist-romanized",
                                                    style: { fontSize: `${Math.round(artistSize * 0.8)}px` }
                                                }, applyTrim(romanizedArtist)));
                                            }
                                            break;

                                        case "all":
                                        default:
                                            elements.push(react.createElement("div", {
                                                key: "artist-original",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(originalArtist)));
                                            if (translatedArtist && translatedArtist !== originalArtist) {
                                                elements.push(react.createElement("div", {
                                                    key: "artist-translated",
                                                    className: "lyrics-fullscreen-artist-translated",
                                                    style: { fontSize: `${Math.round(artistSize * 0.8)}px` }
                                                }, applyTrim(translatedArtist)));
                                            }
                                            break;
                                    }

                                    return elements;
                                })()
                            ),
                            // Album name (optional)
                            normalShowAlbumName && react.createElement("div", {
                                className: "lyrics-fullscreen-album-name",
                                style: { fontSize: `${Math.round(artistSize * 0.85)}px` }
                            },
                                (() => {
                                    try {
                                        const albumName = Spicetify.Player.data?.item?.metadata?.album_title;
                                        return albumName || '';
                                    } catch (e) { return ''; }
                                })()
                            )
                        ),
                        // Controls in left panel (under album)
                        showControlsInLeftPanel && react.createElement("div", {
                            className: `fullscreen-left-controls ${!uiVisible ? 'hidden' : ''}`
                        },
                            // Progress bar (독립적으로 표시)
                            showProgress && react.createElement(ProgressBar, { show: true }),
                            // Player controls
                            react.createElement(PlayerControls, {
                                show: true,
                                showVolume: showVolume,
                                buttonSize: controlButtonSize,
                                showBackground: controlsBackground
                            })
                        ),
                        // Progress bar only (컨트롤 없이 진행바만 표시)
                        !showControls && showProgress && react.createElement("div", {
                            className: `fullscreen-left-controls ${!uiVisible ? 'hidden' : ''}`
                        },
                            react.createElement(ProgressBar, { show: true })
                        )
                    )
            ),
            // Bottom: Player controls (alternative position)
            showControlsInBottom && react.createElement("div", {
                className: `fullscreen-bottom ${!uiVisible ? 'hidden' : ''}`
            },
                showProgress && react.createElement(ProgressBar, { show: true }),
                react.createElement(PlayerControls, {
                    show: true,
                    showVolume: showVolume,
                    buttonSize: controlButtonSize,
                    showBackground: controlsBackground
                })
            ),
            // Progress bar only at bottom (컨트롤 없이 진행바만 표시, bottom 위치)
            !showControls && showProgress && controlsPosition === "bottom" && react.createElement("div", {
                className: `fullscreen-bottom ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(ProgressBar, { show: true })
            ),
            // Lyrics progress (always at bottom right if enabled)
            showLyricsProgress && react.createElement("div", {
                className: `fullscreen-lyrics-progress-container ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(LyricsProgress, {
                    show: true,
                    currentLine: currentLyricIndex,
                    totalLines: totalLyrics
                })
            ),
            // Queue panel (right side hover)
            react.createElement(QueuePanel, {
                show: showQueue,
                isFullscreen: isFullscreen
            })
        );
    };

    return Overlay;
})();

window.FullscreenOverlay = FullscreenOverlay;
