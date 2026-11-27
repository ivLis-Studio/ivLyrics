import { clampSeekPositionToLiveDuration, formatTime } from "../fullscreen/fullscreenPlaybackTiming.mjs";

const normalizeRotationSpeed = (value) => {
    const speed = Number(value ?? 100);
    return Number.isFinite(speed) ? Math.min(200, Math.max(25, speed)) : 100;
};

const clampVinylProgress = (value) => Math.min(Math.max(value, 0), 1);
// The record keeps the same end-of-track seek guard as the fullscreen bar.
const clampVinylSeekPosition = clampSeekPositionToLiveDuration;

export { formatTime, normalizeRotationSpeed, clampVinylProgress, clampVinylSeekPosition };

export function createVinylMotionHooks({ react, host: window }) {
    const { useState, useEffect, useRef } = react;

    const useReducedMotion = () => {
        const [reducedMotion, setReducedMotion] = useState(() =>
            !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        );
        useEffect(() => {
            const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
            if (!media) return undefined;
            const update = () => setReducedMotion(media.matches);
            update();
            media.addEventListener?.("change", update);
            return () => media.removeEventListener?.("change", update);
        }, []);
        return reducedMotion;
    };

    const useRotationSpeed = (rotationSpeed, animationName = "ivlyrics-vinyl-spin-clock") => {
        const clockRef = useRef(null);
        const rate = normalizeRotationSpeed(rotationSpeed) / 100;
        (react.useLayoutEffect || useEffect)(() => {
            // Keep the CSS clock and its current time. Changing animation-duration
            // would reinterpret elapsed time and visibly jump the record's angle.
            for (const animation of clockRef.current?.getAnimations?.() || []) {
                if (animation.animationName === animationName) {
                    animation.updatePlaybackRate(rate);
                }
            }
        }, [rate, animationName]);
        return clockRef;
    };

    return { useReducedMotion, useRotationSpeed };
}
