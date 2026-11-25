import { formatTime } from "./fullscreenPlaybackTiming.mjs";
import { createFullscreenSeekGesture } from "./fullscreenSeekGesture.mjs";

export function createFullscreenProgressBar({ react, getPlayer, getPlaybackPosition, getDocument, timers }) {
    const { useState, useEffect } = react;
    return function ProgressBar({ show }) {
        const [progress, setProgress] = useState(0);
        const [duration, setDuration] = useState(0);
        const [preview, setPreview] = useState(null);
        const [gesture] = useState(() => createFullscreenSeekGesture({
            getPlayer, getPlaybackPosition, setPreview, setProgress,
        }));

        useEffect(() => {
            if (!show) return;
            const player = getPlayer();
            const host = getDocument()?.defaultView;
            const updateProgress = () => {
                const currentPlayer = getPlayer();
                if (!gesture.isDragging()) {
                    setProgress(getPlaybackPosition()?.getSafePlayerProgress?.() ?? (currentPlayer?.getProgress?.() || 0));
                }
                setDuration(currentPlayer?.getDuration?.() || 0);
            };
            const onTrackChange = () => {
                gesture.cancel();
                updateProgress();
            };
            updateProgress();
            const interval = timers.setInterval(updateProgress, 200);
            player?.addEventListener?.("songchange", onTrackChange);
            host?.addEventListener("blur", gesture.cancel);
            return () => {
                timers.clearInterval(interval);
                player?.removeEventListener?.("songchange", onTrackChange);
                host?.removeEventListener("blur", gesture.cancel);
                gesture.cancel();
            };
        }, [show, gesture]);

        if (!show) return null;

        const displayedProgress = preview ?? progress;
        const progressPercent = duration > 0 ? (displayedProgress / duration) * 100 : 0;
        const fillPercent = Math.max(0, Math.min(100, progressPercent));
        return react.createElement("div", { className: "fullscreen-progress-standalone" },
            react.createElement("span", { className: "fullscreen-time" }, formatTime(displayedProgress)),
            react.createElement("div", {
                className: "fullscreen-progress-bar",
                ...gesture.handlers,
            },
                // The rounded clip lets the fill animate with a transform alone.
                react.createElement("div", { className: "fullscreen-progress-clip" },
                    react.createElement("div", {
                        className: "fullscreen-progress-fill",
                        style: { transform: `translateX(${fillPercent - 100}%)` }
                    })
                ),
                react.createElement("div", {
                    className: "fullscreen-progress-handle",
                    style: { left: `${progressPercent}%` }
                })
            ),
            react.createElement("span", { className: "fullscreen-time" }, formatTime(duration))
        );
    };
}
