const toUnsignedMilliseconds = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric));
};

export const normalizeProgressTiming = (position, duration) => {
    const normalizedPosition = toUnsignedMilliseconds(position);
    const normalizedDuration = toUnsignedMilliseconds(duration);

    return {
        position: normalizedPosition,
        duration: normalizedDuration,
        remaining: (normalizedDuration - normalizedPosition) / 1000
    };
};

export default function initializeOverlayProtocol() {
    window.ivLyricsOverlayProtocol = { toUnsignedMilliseconds, normalizeProgressTiming };
}
