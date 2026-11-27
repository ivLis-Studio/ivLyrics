export function createI18n({
    languages,
    languageNames,
    readLanguage,
    writeLanguage,
    onLanguageChanged,
    debug,
}) {
    const DEFAULT_LANGUAGE = "ko";
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

    let currentLanguage = null;
    let languageData = {};
    let fallbackData = {};
    // Resolved strings of the current language (with the default language as
    // fallback), by key path. Interface text is looked up on every render, and
    // the dictionaries do not change while a language is active.
    const resolvedStrings = new Map();

    const getLanguageData = (langCode) => languages.get(langCode) || null;

    // The catalog is fixed when the bundle is built, so the language list is
    // computed once. The default language is always offered.
    const AVAILABLE_LANGUAGES = [];
    for (const code of languages.keys()) {
        if (languages.hasData?.(code) ?? Boolean(getLanguageData(code))) AVAILABLE_LANGUAGES.push(code);
    }
    if (!AVAILABLE_LANGUAGES.includes(DEFAULT_LANGUAGE)) AVAILABLE_LANGUAGES.unshift(DEFAULT_LANGUAGE);

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

    function useLanguage(langCode, data) {
        languageData = data;
        currentLanguage = langCode;
        resolvedStrings.clear();
    }

    // A leaf value at the key path, or null for a missing key or a section.
    function getNestedValue(obj, keys) {
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

    function resolveString(keyPath) {
        if (resolvedStrings.has(keyPath)) return resolvedStrings.get(keyPath);
        const keys = keyPath.split(".");
        let value = getNestedValue(languageData, keys);
        if (value === null && fallbackData) value = getNestedValue(fallbackData, keys);
        resolvedStrings.set(keyPath, value);
        return value;
    }

    /**
     * Translation for a key path, with {name} placeholders replaced from params.
     * Returns an empty string for unknown keys so callers can use their fallback.
     */
    function getString(keyPath, params) {
        if (!keyPath) return "";
        keyPath = RESEARCH_KEY_ALIASES[keyPath] || keyPath;
        if (currentLanguage === null) initSync();

        const value = resolveString(keyPath);
        if (value === null) return "";

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

        fallbackData = getLanguageData(DEFAULT_LANGUAGE) || {};
        const data = getLanguageData(savedLang);
        if (data) useLanguage(savedLang, data);
        else useLanguage(DEFAULT_LANGUAGE, fallbackData);

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

        useLanguage(langCode, newData);
        onLanguageChanged(currentLanguage);

        if (options?.persist !== false) saveLanguage(langCode);

        debug("[I18n] Language changed to: " + langCode);
        return Promise.resolve(true);
    }

    /**
     * Get list of available languages
     */
    function getAvailableLanguages() {
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
     * Every distinct translation of a key path across the available languages,
     * so settings search matches names typed in any language.
     */
    function getAllTranslations(keyPath) {
        if (!keyPath) return [];
        keyPath = RESEARCH_KEY_ALIASES[keyPath] || keyPath;
        const keys = keyPath.split(".");
        const translations = [];
        for (let i = 0; i < AVAILABLE_LANGUAGES.length; i++) {
            const langData = getLanguageData(AVAILABLE_LANGUAGES[i]);
            if (langData) {
                const value = getNestedValue(langData, keys);
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
