export function createI18n({
    languages,
    languageNames,
    readLanguage,
    writeLanguage,
    onLanguageChanged,
    debug,
}) {
    // Cached language data
    let currentLanguage = null;
    let languageData = {};
    let fallbackData = {};
    const DEFAULT_LANGUAGE = "ko";
    const AVAILABLE_LANGUAGES = [];
    const KEY_PATH_CACHE_LIMIT = 2048;
    const RESEARCH_KEY_ALIASES = {
        "tmi.title": "research.title",
        "tmi.requireKey": "research.requireProvider",
        "tmi.disclaimer": "research.disclaimer",
        "tmi.loading": "research.loading",
        "tmi.close": "research.close",
        "tmi.cancel": "research.cancel",
        "tmi.regenerate": "research.regenerate",
        "tmi.errorFetch": "research.errorFetch",
        "tmi.errorQuota": "research.errorQuota",
        "tmi.errorQuotaHint": "research.errorQuotaHint",
        "tmi.viewInfo": "research.gestureHint",
        "tmi.clickForTMI": "research.title",
        "vinyl.tmiHint": "research.gestureHint",
        "vinyl.tmiGesture": "research.gesture",
        "settings.aiProviders.providerSelectionDesc": "research.providerDescription",
        "settings.aiProviders.tmiProvider": "research.title",
        "settings.aiProviders.supports.tmi": "research.title",
        "settingsAdvanced.tmiStyle.title": "research.styleTitle",
        "settingsAdvanced.tmiStyle.subtitle": "research.styleSubtitle",
        "settingsAdvanced.tmiStyle.fontSize.desc": "research.fontSizeDesc",
        "settingsAdvanced.tmiStyle.fontSize.info": "research.fontSizeInfo"
    };
    const keyPathCache = new Map();
    let keyPathSplit = null;
    let lastKeyPath = null;
    let lastKeyPathSegments = null;
    let canCacheKeyPaths = false;
    try {
        keyPathSplit = String.prototype.split;
        canCacheKeyPaths = /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(keyPathSplit));
    } catch (e) { }

    function getSavedLanguage() {
        try {
            return readLanguage();
        } catch {
            return null;
        }
    }

    function saveLanguage(langCode) {
        try {
            writeLanguage(langCode);
        } catch {
            // The session can still switch languages with read-only storage.
        }
    }

    const getLanguageData = (langCode) => languages.get(langCode) || null;

    /**
     * Keep the public language list aligned with language files actually loaded.
     */
    function refreshAvailableLanguages() {
        let hasDefaultLanguage = false;
        AVAILABLE_LANGUAGES.length = 0;

        for (const code of languages.keys()) {
            if (languages.hasData?.(code) ?? Boolean(getLanguageData(code))) {
                AVAILABLE_LANGUAGES.push(code);
                if (code === DEFAULT_LANGUAGE) {
                    hasDefaultLanguage = true;
                }
            }
        }

        if (!hasDefaultLanguage) {
            AVAILABLE_LANGUAGES.unshift(DEFAULT_LANGUAGE);
        }

        return AVAILABLE_LANGUAGES;
    }

    /**
     * Get nested value from object by key path
     */
    function getKeyPathSegments(keyPath) {
        if (
            typeof keyPath !== "string"
            || keyPath.length > 256
            || !canCacheKeyPaths
            || String.prototype.split !== keyPathSplit
        ) {
            return keyPath.split(".");
        }

        if (keyPath === lastKeyPath) return lastKeyPathSegments;

        const cached = keyPathCache.get(keyPath);
        if (cached) {
            lastKeyPath = keyPath;
            lastKeyPathSegments = cached;
            return cached;
        }

        const keys = keyPath.split(".");
        lastKeyPath = keyPath;
        lastKeyPathSegments = keys;
        if (keyPathCache.size < KEY_PATH_CACHE_LIMIT) {
            keyPathCache.set(keyPath, keys);
        }
        return keys;
    }

    function getNestedValue(obj, keyPath) {
        if (!obj || !keyPath) return null;
        const keys = getKeyPathSegments(keyPath);
        let value = obj;
        for (let i = 0; i < keys.length; i++) {
            if (value && typeof value === "object" && keys[i] in value) {
                value = value[keys[i]];
            } else {
                return null;
            }
        }
        return (typeof value === "object") ? null : value;
    }

    /**
     * Get translation string.
     */
    function getString(keyPath, params) {
        if (!keyPath) return "";
        keyPath = RESEARCH_KEY_ALIASES[keyPath] || keyPath;

        // Try to initialize if not done yet
        if (currentLanguage === null) {
            initSync();
        }

        // Try current language
        let value = getNestedValue(languageData, keyPath);

        // Try fallback language
        if (value === null && fallbackData) {
            value = getNestedValue(fallbackData, keyPath);
        }

        // Return an empty string if no translation found so caller fallbacks can run.
        if (value === null) {
            return "";
        }

        // Replace parameters
        if (typeof value === "string" && params && typeof params === "object") {
            return value.replace(/\{(\w+)\}/g, function (match, paramKey) {
                return params[paramKey] !== undefined ? params[paramKey] : match;
            });
        }

        return value;
    }

    /**
     * Initialize the i18n system synchronously
     */
    function initSync() {
        if (currentLanguage !== null) return;
        refreshAvailableLanguages();

        // Get saved language
        let savedLang = getSavedLanguage();

        if (!savedLang || AVAILABLE_LANGUAGES.indexOf(savedLang) === -1) {
            const invalidSavedLang = savedLang;
            savedLang = DEFAULT_LANGUAGE;

            // Old index-based backups can map an unrelated value (for example
            // "true" or "3") onto the language key. Repair the persisted value
            // as well as the in-memory fallback so it is not exported again.
            if (invalidSavedLang) {
                saveLanguage(savedLang);
                debug(
                    "[I18n] Replaced an unsupported stored language with the default."
                );
            }
        }

        // Load fallback data first
        fallbackData = getLanguageData(DEFAULT_LANGUAGE) || {};

        // Load selected language
        const data = getLanguageData(savedLang);
        if (data) {
            languageData = data;
            currentLanguage = savedLang;
        } else {
            languageData = fallbackData;
            currentLanguage = DEFAULT_LANGUAGE;
        }

        // The custom-app entrypoint can run before this subfile. Keep the
        // already-created runtime config aligned with the validated language.
        onLanguageChanged(currentLanguage);

        debug("[I18n] Initialized: " + currentLanguage);
    }

    /**
     * Async init (just calls sync version)
     */
    function init() {
        initSync();
        return Promise.resolve();
    }

    /**
     * Get current language code
     */
    function getCurrentLanguage() {
        if (currentLanguage === null) initSync();
        return currentLanguage || DEFAULT_LANGUAGE;
    }

    /**
     * Set the interface language, persisting it unless this is a preview.
     */
    function setLanguage(langCode, options) {
        refreshAvailableLanguages();

        if (AVAILABLE_LANGUAGES.indexOf(langCode) === -1) {
            console.error("[I18n] Invalid language: " + langCode);
            return Promise.resolve(false);
        }

        if (langCode === currentLanguage) {
            if (options?.persist !== false && getSavedLanguage() !== langCode) saveLanguage(langCode);
            return Promise.resolve(true);
        }

        const newData = getLanguageData(langCode);
        if (!newData) {
            console.error("[I18n] Language data not found: " + langCode);
            return Promise.resolve(false);
        }

        // Update fallback if switching away from default
        if (langCode !== DEFAULT_LANGUAGE) {
            fallbackData = getLanguageData(DEFAULT_LANGUAGE) || {};
        }

        languageData = newData;
        currentLanguage = langCode;
        onLanguageChanged(currentLanguage);

        if (options?.persist !== false) saveLanguage(langCode);

        debug("[I18n] Language changed to: " + langCode);
        return Promise.resolve(true);
    }

    /**
     * Get list of available languages
     */
    function getAvailableLanguages() {
        refreshAvailableLanguages();

        return AVAILABLE_LANGUAGES.map(function (code) {
            return { code, name: languageNames[code] || code };
        });
    }

    /**
     * Get display name for language code
     */
    function getLanguageName(langCode) {
        return languageNames[langCode] || langCode;
    }

    /**
     * 주어진 i18n 키의 번역 문자열을 로드된 모든 언어에서 수집하여 반환
     * 검색 시 모든 언어의 번역을 검색 대상에 포함시키기 위해 사용
     * @param {string} keyPath - i18n 키 경로 (예: "settings.language.label")
     * @returns {string[]} - 중복 제거된 번역 문자열 배열
     */
    function getAllTranslations(keyPath) {
        if (!keyPath) return [];
        keyPath = RESEARCH_KEY_ALIASES[keyPath] || keyPath;
        const translations = [];
        const availableLanguages = refreshAvailableLanguages();
        for (let i = 0; i < availableLanguages.length; i++) {
            const langData = getLanguageData(availableLanguages[i]);
            if (langData) {
                const value = getNestedValue(langData, keyPath);
                if (value && translations.indexOf(value) === -1) {
                    translations.push(value);
                }
            }
        }
        return translations;
    }

    /**
     * Check if initialized
     */
    function isInitialized() {
        return currentLanguage !== null;
    }

    refreshAvailableLanguages();

    return {
        init,
        initSync,
        getString,
        t: getString,
        getAllTranslations,
        getCurrentLanguage,
        setLanguage,
        getAvailableLanguages,
        getLanguageName,
        isInitialized,
        AVAILABLE_LANGUAGES,
        DEFAULT_LANGUAGE
    };
}
