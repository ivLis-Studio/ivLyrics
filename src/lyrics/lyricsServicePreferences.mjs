import { getLyricLanguageMode, readLyricDisplayModes, readLyricPlaybackPreferences } from "./lyricPresentationIdentity.mjs";
import { normalizeIvLyricsPronunciationNotation } from "./translationPreferences.mjs";

export function createLyricsServicePreferences({
    readNotation, getVisualSettings, getI18n, getSettingsStorage, getStoragePersistence,
    readSpotifySetting, readLocalSetting, getSpotifyLocale,
}) {
    function getServicePronunciationNotation() {
        try {
            const sharedValue = readNotation()?.getCurrent?.();
            if (sharedValue) return normalizeIvLyricsPronunciationNotation(sharedValue);
        } catch {}
        return normalizeIvLyricsPronunciationNotation(
            getVisualSettings()?.['translate:pronunciation-notation'] ||
            getStorageItem('ivLyrics:visual:translate:pronunciation-notation')
        );
    }

    function getTranslatorErrorMessage(key, fallback) {
        const i18n = getI18n();
        return i18n?.t?.(key) || fallback;
    }

    // StorageManager가 없을 경우 대체
    function getStorageItem(key) {
        const settings = getSettingsStorage();
        if (typeof settings?.getItem === 'function') return settings.getItem(key);

        const persistence = getStoragePersistence();
        if (typeof persistence?.getItem === 'function') {
            const persistedValue = persistence.getItem(key);
            if (persistedValue !== null && persistedValue !== undefined) {
                return persistedValue;
            }
        }
        const spicetifyValue = readSpotifySetting(key);
        if (spicetifyValue !== null && spicetifyValue !== undefined) {
            return spicetifyValue;
        }
        return readLocalSetting(key);
    }

    function getCurrentLanguage() {
        const i18n = getI18n();
        if (typeof i18n?.getCurrentLanguage === 'function') return i18n.getCurrentLanguage();
        const configuredLanguage = getStorageItem("ivLyrics:visual:language");
        if (configuredLanguage) {
            return configuredLanguage;
        }
        return getSpotifyLocale()?.split('-')[0] || 'en';
    }

    // get the target language for translation (if auto, use the interface language)
    function getTranslationTargetLanguage() {
        const targetLang = getVisualSettings()?.["translate:target-language"] ||
            getStorageItem("ivLyrics:visual:translate:target-language");
        if (targetLang && targetLang !== "auto") {
            return targetLang;
        }
        return getCurrentLanguage();
    }

    return { getServicePronunciationNotation, getTranslatorErrorMessage, getStorageItem, getTranslationTargetLanguage };
}

export function createLyricsPresentationPreferences({ readVisual, getTranslationTargetLanguage, getPronunciationNotation }) {
    return (language) => {
        const [displayMode1, displayMode2] = readLyricDisplayModes(getLyricLanguageMode(language), readVisual);
        return {
            displayMode1: displayMode1 || "none",
            displayMode2: displayMode2 || "none",
            translationTargetLanguage: getTranslationTargetLanguage(),
            pronunciationNotation: getPronunciationNotation(),
            ...readLyricPlaybackPreferences(readVisual),
        };
    };
}
