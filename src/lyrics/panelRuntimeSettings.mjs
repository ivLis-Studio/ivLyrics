import { isAutomaticInstrumentalBreakEnabled } from "./lyricInterludeTiming.mjs";

export function createPanelRuntimeSettings({
    getPersistence, getSpicetify, getI18n, readStorage, readVisualSettings,
    prefersReducedMotion, readNavigatorLanguage, reportError,
}) {
    const getStorageValue = (key, defaultValue) => {
        try {
            const value = getPersistence()?.getItem?.(key)
                ?? getSpicetify().LocalStorage?.get?.(key)
                ?? readStorage().getItem(key);
            if (value === null) return defaultValue;
            if (value === "true") return true;
            if (value === "false") return false;
            const num = parseInt(value, 10);
            if (!isNaN(num)) return num;
            return value;
        } catch {
            return defaultValue;
        }
    };

    const getVisualSetting = (name, defaultValue) => {
        const configValue = readVisualSettings()?.[name];
        if (configValue !== undefined && configValue !== null && configValue !== "") {
            return configValue;
        }
        return getStorageValue(`ivLyrics:visual:${name}`, defaultValue);
    };

    const isPanelMotionReduced = () => (
        getVisualSetting("reduce-motion", false) === true ||
        prefersReducedMotion()
    );

    const translatePanelText = (key, fallback) => {
        try {
            return getI18n()?.t?.(key) || fallback;
        } catch {
            return fallback;
        }
    };

    // 확장 컨텍스트에서는 앱의 I18n이 아직 없을 수 있어 Spotify 언어로 기본 문구를 고른다.
    const getPanelFallbackText = (koreanText, englishText) => {
        const locale = String(getSpicetify()?.Locale?.getLocale?.() || readNavigatorLanguage() || "").toLowerCase();
        return locale.startsWith("ko") ? koreanText : englishText;
    };

    const getPseudoKaraokeRenderAdvance = () => {
        const configuredAdvance = Number(getVisualSetting("pseudo-karaoke-render-advance", 0));
        return Number.isFinite(configuredAdvance) ? configuredAdvance : 0;
    };

    const isAutoInstrumentalBreakEnabled = () => isAutomaticInstrumentalBreakEnabled(
        getVisualSetting("instrumental-break-auto-detect", true)
    );

    const setStorageValue = (key, value) => {
        try {
            readStorage().setItem(key, String(value));
        } catch (e) {
            reportError("[NowPlayingPanelLyrics] Storage error:", e);
        }
    };

    return {
        getStorageValue, setStorageValue, getVisualSetting, isPanelMotionReduced, translatePanelText,
        getPanelFallbackText, getPseudoKaraokeRenderAdvance, isAutoInstrumentalBreakEnabled,
    };
}
