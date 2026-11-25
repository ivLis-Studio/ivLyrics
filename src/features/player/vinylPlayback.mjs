const formatTime = (ms) => {
    if (!ms || ms < 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const normalizeRotationSpeed = (value) => {
    const speed = Number(value ?? 100);
    return Number.isFinite(speed) ? Math.min(200, Math.max(25, speed)) : 100;
};

const VINYL_SEEK_END_GUARD_MIN_MS = 250;
const VINYL_SEEK_END_GUARD_MAX_MS = 500;

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
