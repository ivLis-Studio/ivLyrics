// Format time helper (ms to mm:ss)
export const formatTime = (ms) => {
    if (!ms || ms < 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Format current time helper
export const formatClock = (date, showSeconds = false) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    if (showSeconds) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

const PLAYER_SEEK_END_GUARD_MIN_MS = 250;
const PLAYER_SEEK_END_GUARD_MAX_MS = 500;

export function getFullscreenSeekPosition(bar, clientX, duration) {
    const { left, width } = bar.getBoundingClientRect();
    const durationMs = Number(duration);
    if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(width) || width <= 0) return null;
    const fraction = (clientX - left) / width;
    if (!Number.isFinite(fraction)) return null;
    // Spicetify interprets non-integer values between zero and one as fractions.
    return Math.floor(durationMs * Math.max(0, Math.min(1, fraction)));
}

export const clampSeekPositionToLiveDuration = (value, duration) => {
    const safeDuration = Math.max(Number(duration) || 0, 0);
    const safeValue = Math.max(Number(value) || 0, 0);
    if (safeDuration <= 0) return safeValue;

    const endGuard = Math.min(
        safeDuration,
        Math.max(
            PLAYER_SEEK_END_GUARD_MIN_MS,
            Math.min(PLAYER_SEEK_END_GUARD_MAX_MS, safeDuration * 0.02)
        )
    );
    return Math.min(safeValue, Math.max(safeDuration - endGuard, 0));
};
