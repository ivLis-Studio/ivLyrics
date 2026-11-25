import { isUnknownTrackMetadata } from "./fullscreenTracks.mjs";
import { formatClock } from "./fullscreenPlaybackTiming.mjs";
import { createFullscreenPlaybackContext } from "./fullscreenPlaybackContext.mjs";

function createTvPlayheadStore() {
    let snapshot = { position: 0, duration: 0 };
    const listeners = new Set();
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        publish(position, duration) {
            if (Object.is(snapshot.position, position) && Object.is(snapshot.duration, duration)) return;
            snapshot = { position, duration };
            for (const listener of listeners) listener(snapshot);
        },
    };
}

export function useFullscreenPlayback({
    react: { useState, useEffect, useRef }, spotify, readMetadata, positionTarget, timers = globalThis,
}) {
    const [playback, setPlayback] = useState(() => ({ isPlaying: false, position: 0, duration: 0 }));
    const playbackRef = useRef(playback);
    const [tvPlayhead] = useState(createTvPlayheadStore);
    const metadataSnapshotRef = useRef(null);

    useEffect(() => {
        const subscribedPlayer = spotify.Player;
        function updatePlaybackState() {
            const player = spotify.Player;
            const isPlaying = !(player?.data?.isPaused ?? true);
            const nextMetadata = readMetadata();
            const previousMetadata = metadataSnapshotRef.current;
            metadataSnapshotRef.current = nextMetadata;
            const metadataChanged = previousMetadata
                && nextMetadata.some((value, index) => !Object.is(value, previousMetadata[index]));

            const previous = playbackRef.current;
            let { position, duration } = previous;
            if (positionTarget) {
                const currentPosition = player?.getProgress?.() || 0;
                const currentDuration = player?.data?.item?.metadata?.duration_ms || player?.getDuration?.() || 0;
                if (positionTarget === "tv") tvPlayhead.publish(currentPosition, currentDuration);
                else {
                    position = currentPosition;
                    duration = currentDuration;
                }
            }
            if (metadataChanged || isPlaying !== previous.isPlaying
                || !Object.is(position, previous.position) || !Object.is(duration, previous.duration)) {
                const next = { isPlaying, position, duration };
                playbackRef.current = next;
                setPlayback(next);
            }
        }

        updatePlaybackState();
        const interval = timers.setInterval(updatePlaybackState, 500);
        subscribedPlayer?.addEventListener?.("songchange", updatePlaybackState);
        subscribedPlayer?.addEventListener?.("onplaypause", updatePlaybackState);
        return () => {
            timers.clearInterval(interval);
            subscribedPlayer?.removeEventListener?.("songchange", updatePlaybackState);
            subscribedPlayer?.removeEventListener?.("onplaypause", updatePlaybackState);
        };
    }, [spotify, readMetadata, positionTarget, timers, tvPlayhead]);

    return { ...playback, tvPlayhead };
}

export function createFullscreenPlaybackStatus({
    react, spotify, translate, getPlaybackPosition, fetchPlaylistMetadata,
    timers = globalThis,
}) {
    const { useState, useEffect } = react;

    // Clock Component
    const Clock = ({ show, showSeconds = false, size = 48 }) => {
        const [time, setTime] = useState(new Date());

        useEffect(() => {
            if (!show) return;

            if (showSeconds) {
                const timer = timers.setInterval(() => setTime(new Date()), 1000);
                return () => timers.clearInterval(timer);
            }

            let intervalId = null;
            const syncToMinute = () => {
                setTime(new Date());
                intervalId = timers.setInterval(() => setTime(new Date()), 60000);
            };
            const now = new Date();
            const msUntilNextMinute =
                (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
            const timeoutId = timers.setTimeout(syncToMinute, Math.max(msUntilNextMinute, 0));

            return () => {
                timers.clearTimeout(timeoutId);
                if (intervalId) {
                    timers.clearInterval(intervalId);
                }
            };
        }, [show, showSeconds]);

        if (!show) return null;

        return react.createElement("div", {
            className: "fullscreen-clock",
            style: { fontSize: `${size}px` }
        },
            formatClock(time, showSeconds)
        );
    };

    const ContextInfo = ({ show, showImage = true }) => {
        const [context, setContext] = useState(null);
        const player = spotify.Player;

        useEffect(() => {
            if (!show) return;
            const playbackContext = createFullscreenPlaybackContext({
                readContext: () => player?.data?.context,
                fetchPlaylistMetadata, publish: setContext, showImage,
                onError: error => console.debug("Failed to fetch context image:", error),
            });
            playbackContext.update();
            player?.addEventListener?.("songchange", playbackContext.update);
            return () => {
                playbackContext.dispose();
                player?.removeEventListener?.("songchange", playbackContext.update);
            };
        }, [player, show, showImage]);

        if (!show || !context?.name) return null;

        return react.createElement("div", { className: "fullscreen-context-info" },
            showImage && context.image && react.createElement("img", {
                src: context.image,
                className: "fullscreen-context-image"
            }),
            react.createElement("div", { className: "fullscreen-context-text" },
                context.type && react.createElement("span", { className: "fullscreen-context-type" },
                    translate(`fullscreen.contextType.${context.type}`)),
                react.createElement("span", { className: "fullscreen-context-name" }, context.name)
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
                    const repeatMode = spotify.Player.getRepeat?.() || 0;

                    // 한 곡 반복 모드일 때는 다음 곡 미리보기를 표시하지 않음
                    if (repeatMode === 2) {
                        setVisible(false);
                        return;
                    }

                    const duration = spotify.Player.getDuration();
                    const position = getPlaybackPosition()?.getSafePlayerProgress?.()
                        ?? (spotify.Player.getProgress?.() || 0);
                    const remaining = (duration - position) / 1000;

                    // Show when less than secondsBeforeEnd remaining
                    if (remaining <= secondsBeforeEnd && remaining > 0) {
                        // Get next track from queue
                        const queue = spotify.Queue;
                        if (queue?.nextTracks?.length > 0) {
                            // Unknown 트랙이 아닌 첫 번째 유효한 트랙 찾기
                            const validNext = queue.nextTracks.find((track) => {
                                const meta = track?.contextTrack?.metadata;
                                return !isUnknownTrackMetadata(meta);
                            });

                            if (validNext?.contextTrack?.metadata) {
                                const nextTrackData = {
                                    title: validNext.contextTrack.metadata.title,
                                    artist: validNext.contextTrack.metadata.artist_name,
                                    image: validNext.contextTrack.metadata.image_url
                                };
                                setNextTrack((prev) => (
                                    prev &&
                                        prev.title === nextTrackData.title &&
                                        prev.artist === nextTrackData.artist &&
                                        prev.image === nextTrackData.image
                                ) ? prev : nextTrackData);
                                setVisible(true);
                                return;
                            }
                        }
                    }
                    setVisible(false);
                } catch {
                    setVisible(false);
                }
            };

            const interval = timers.setInterval(checkNextTrack, 500);
            return () => timers.clearInterval(interval);
        }, [show, secondsBeforeEnd]);

        if (!show || !visible || !nextTrack) return null;

        return react.createElement("div", { className: "fullscreen-next-track" },
            react.createElement("div", { className: "fullscreen-next-track-label" }, translate("fullscreen.controls.nextTrackLabel")),
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

    return { Clock, ContextInfo, NextTrackPreview };
}
