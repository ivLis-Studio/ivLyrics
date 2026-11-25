export const DEFAULTS = Object.freeze({
    style: "bars", colorMode: "album", customColor: "#ffffff",
    sensitivity: 100, density: 64, thickness: 2, mirror: false, albumGradient: true
});
export const STYLES = Object.freeze(["bars", "line", "dots", "wave", "blocks", "spikes", "aura", "pulse", "particles"]);
export const COLOR_MODES = Object.freeze(["album", "white", "custom", "rainbow"]);
export const TWO_PI = Math.PI * 2;

export const finite = (value, fallback) => (
    typeof value === "number" && Number.isFinite(value) ? value : fallback
);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const settingNumber = (value, fallback, min, max) => {
    const number = typeof value === "string" && value.trim() ? Number(value) : value;
    return clamp(finite(number, fallback), min, max);
};
export const smoothstep = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
};
export const lerp = (from, to, amount) => from + (to - from) * amount;
export function normalizeColor(value, fallback = "#ffffff") {
    if (typeof value !== "string" || value.length > 96) return fallback;
    const color = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
        return `#${[...color.slice(1)].map(digit => digit + digit).join("")}`.toLowerCase();
    }
    const rgb = /^rgba?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)(?:\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/i.exec(color);
    return rgb ? `rgb(${rgb.slice(1, 4).map(channel => clamp(Math.round(Number(channel)), 0, 255)).join(", ")})` : fallback;
}

export function normalizeSettings(settings = {}) {
    const value = settings && typeof settings === "object" ? settings : {};
    return {
        style: STYLES.includes(value.style) ? value.style : DEFAULTS.style,
        colorMode: COLOR_MODES.includes(value.colorMode) ? value.colorMode : DEFAULTS.colorMode,
        customColor: normalizeColor(value.customColor, DEFAULTS.customColor),
        sensitivity: settingNumber(value.sensitivity, DEFAULTS.sensitivity, 25, 200),
        density: Math.round(settingNumber(value.density, DEFAULTS.density, 24, 128)),
        thickness: settingNumber(value.thickness, DEFAULTS.thickness, 1, 6),
        mirror: value.mirror === true || value.mirror === "true",
        albumGradient: value.albumGradient !== false && value.albumGradient !== "false"
    };
}

export function resolveColor(settings, accent) {
    if (settings.colorMode === "white") return "#ffffff";
    if (settings.colorMode === "custom") return normalizeColor(settings.customColor);
    // Rainbow is a canvas gradient; the album colour is its solid fallback.
    return normalizeColor(accent);
}
