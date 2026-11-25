const PANEL_VISUAL_PREFIX = "ivLyrics:visual:";
const DEFAULT_ALBUM_PALETTE = {
    c1: { r: 30, g: 30, b: 40 },
    c2: { r: 60, g: 40, b: 70 },
    c3: { r: 20, g: 18, b: 60 },
};
const STYLE_SETTING_PREFIXES = [
    "panel-bg", "panel-border", "panel-lyrics-font",
    "panel-lyrics-original", "panel-lyrics-phonetic", "panel-lyrics-translation",
];

const hexToRgb = (hex) => {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return match
        ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
        : { r: 80, g: 80, b: 80 };
};

const intToRgb = (color) => ({ r: (color >> 16) & 255, g: (color >> 8) & 255, b: color & 255 });

const rgbaToRgb = (color) => color && ({
    r: Math.round((color.red ?? 0) * 255),
    g: Math.round((color.green ?? 0) * 255),
    b: Math.round((color.blue ?? 0) * 255),
});

const scaleChannel = (channel, scale) => Math.max(0, Math.min(255, Math.round(channel * scale)));
const scaleRgb = (rgb, scale) => ({
    r: scaleChannel(rgb.r, scale), g: scaleChannel(rgb.g, scale), b: scaleChannel(rgb.b, scale),
});

const mixRgb = (a, b, ratio) => ({
    r: Math.round(a.r * (1 - ratio) + b.r * ratio),
    g: Math.round(a.g * (1 - ratio) + b.g * ratio),
    b: Math.round(a.b * (1 - ratio) + b.b * ratio),
});

const rgbString = (color) => `${color.r}, ${color.g}, ${color.b}`;
const rgbaString = (color, opacity) => `rgba(${rgbString(color)}, ${opacity})`;

export const readPanelBackgroundMode = (readSetting) => readSetting(PANEL_VISUAL_PREFIX + "panel-bg-type", "album");

export function createPanelAlbumPalette({ artworkColors, readArtworkUrl, warn = console.warn }) {
    async function readAlbumColor(trackUri) {
        if (!trackUri) return null;
        try {
            return hexToRgb(await artworkColors.readTrackColorHex(trackUri));
        } catch {
            try {
                const swatch = await artworkColors.readTrackColorSwatch(trackUri);
                return swatch ? intToRgb(swatch) : null;
            } catch {
                return null;
            }
        }
    }

    return async function loadAlbumPalette(trackUri) {
        try {
            const colors = await artworkColors.readDynamicColors(readArtworkUrl());
            const c1 = rgbaToRgb(colors?.minContrast?.backgroundBase);
            const c2 = rgbaToRgb(colors?.highContrast?.backgroundBase);
            const c3 = rgbaToRgb(colors?.higherContrast?.backgroundBase);
            if (c1 || c2 || c3) {
                const fallback = c1 || c2 || c3;
                return {
                    c1: c1 || fallback,
                    c2: c2 || scaleRgb(fallback, 0.72),
                    c3: c3 || scaleRgb(fallback, 0.48),
                };
            }
        } catch (error) {
            warn("[NowPlayingPanelLyrics] Failed to get dynamic album colors:", error);
        }

        const album = await readAlbumColor(trackUri);
        if (!album) return DEFAULT_ALBUM_PALETTE;
        return {
            c1: scaleRgb(album, 0.78),
            c2: mixRgb(scaleRgb(album, 1.12), { r: 70, g: 36, b: 120 }, 0.28),
            c3: mixRgb(scaleRgb(album, 0.55), { r: 18, g: 74, b: 96 }, 0.32),
        };
    };
}

function readPanelBackgroundStyleSettings(readSetting) {
    const get = (name, fallback) => readSetting(PANEL_VISUAL_PREFIX + name, fallback);
    return {
        mode: readPanelBackgroundMode(readSetting),
        color: get("panel-bg-color", "#6366f1"),
        opacity: get("panel-bg-opacity", 30) / 100,
        borderEnabled: get("panel-border-enabled", false),
        borderColor: get("panel-border-color", "#ffffff"),
        borderOpacity: get("panel-border-opacity", 10) / 100,
    };
}

function readCustomGradientPalette(readSetting) {
    const c1 = hexToRgb(readSetting(PANEL_VISUAL_PREFIX + "panel-bg-gradient-1", "#6366f1"));
    const c2 = hexToRgb(readSetting(PANEL_VISUAL_PREFIX + "panel-bg-gradient-2", "#a855f7"));
    return { c1: scaleRgb(c1, 0.76), c2, c3: mixRgb(c1, c2, 0.55) };
}

function applyPanelBackground(sections, { mode, color, opacity, borderEnabled, borderColor, borderOpacity }, palette) {
    const background = palette ? rgbaString(palette.c1, opacity)
        : mode === "custom" ? rgbaString(hexToRgb(color), opacity) : "transparent";
    const border = borderEnabled ? `1px solid ${rgbaString(hexToRgb(borderColor), borderOpacity)}` : "none";
    const transparent = mode === "transparent";
    const showGradient = Boolean(palette) && opacity > 0 && !transparent;
    const gradientOpacity = showGradient ? Math.max(opacity, 0.72) : opacity;
    const filter = transparent || opacity === 0 ? "none" : "blur(20px) saturate(180%)";

    for (const section of sections) {
        if (section.isConnected === false) continue;
        section.classList.toggle("blur-gradient-bg", showGradient);
        section.classList.toggle("transparent-bg", transparent);
        const { style } = section;
        style.setProperty("--ivlyrics-panel-bg", background);
        style.setProperty("--ivlyrics-panel-border", border);
        style.setProperty("--ivlyrics-panel-gradient-opacity", String(gradientOpacity));
        if (palette) {
            style.setProperty("--ivlyrics-panel-c1", rgbString(palette.c1));
            style.setProperty("--ivlyrics-panel-c2", rgbString(palette.c2));
            style.setProperty("--ivlyrics-panel-c3", rgbString(palette.c3));
        }
        style.setProperty("background", background, "important");
        style.setProperty("border", border, "important");
        style.setProperty("backdrop-filter", filter, "important");
        style.setProperty("-webkit-backdrop-filter", filter, "important");
    }
}

export function startPanelBackground({
    playerEvents, settingsEvents, readTrackUri, readSections, readSetting, loadAlbumPalette, reinjectStyles,
}) {
    let revision = 0;
    let disposed = false;

    async function updateStyles() {
        if (disposed) return;
        const request = ++revision;
        const trackUri = readTrackUri();
        const sections = readSections();
        if (!sections.length) return;

        const settings = readPanelBackgroundStyleSettings(readSetting);
        let palette = null;
        if (settings.mode === "album") palette = await loadAlbumPalette(trackUri);
        else if (settings.mode === "gradient") palette = readCustomGradientPalette(readSetting);
        if (disposed || request !== revision || (trackUri && trackUri !== readTrackUri())) return;

        applyPanelBackground(sections, settings, palette);
    }

    function settingsChanged(event) {
        const { name } = event.detail || {};
        if (!name || !STYLE_SETTING_PREFIXES.some((prefix) => name.startsWith(prefix))) return;
        updateStyles();
        if (name.includes("font")) reinjectStyles();
    }

    updateStyles();
    playerEvents.addEventListener("songchange", updateStyles);
    settingsEvents.addEventListener("ivLyrics", settingsChanged);
    return () => {
        disposed = true;
        playerEvents.removeEventListener("songchange", updateStyles);
        settingsEvents.removeEventListener("ivLyrics", settingsChanged);
    };
}
