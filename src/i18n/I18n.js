// I18n.js - Internationalization System for ivLyrics
// This module provides language support for the extension
// IMPORTANT: This file must be loaded AFTER LangKo.js and LangEn.js

// Define I18n on window object immediately using IIFE
(function () {
    // Cached language data
    var currentLanguage = null;
    var languageData = {};
    var fallbackData = {};
    var STORAGE_KEY = "ivLyrics:visual:language";
    var DEFAULT_LANGUAGE = "ko";
    var AVAILABLE_LANGUAGES = ["ko", "en", "zh-CN", "zh-TW", "ja", "es", "fr", "de", "it", "ru", "pt", "hi", "ar", "fa", "bn", "ur", "th", "vi", "id"];

    // Language display names
    var LANGUAGE_NAMES = {
        ko: "한국어",
        en: "English",
        "zh-CN": "简体中文",
        "zh-TW": "繁體中文",
        ja: "日本語",
        es: "Español",
        fr: "Français",
        de: "Deutsch",
        it: "Italiano",
        ru: "Русский",
        pt: "Português",
        hi: "हिन्दी",
        ar: "العربية",
        fa: "فارسی",
        bn: "বাংলা",
        ur: "اردو",
        th: "ภาษาไทย",
        vi: "Tiếng Việt",
        id: "Bahasa Indonesia"
    };

    /**
     * Get language data from external JS files (LangKo.js, LangEn.js, etc.)
     */
    function getLanguageData(langCode) {
        if (langCode === 'ko' && typeof window.LANG_KO !== 'undefined' && window.LANG_KO) {
            return window.LANG_KO;
        }
        if (langCode === 'en' && typeof window.LANG_EN !== 'undefined' && window.LANG_EN) {
            return window.LANG_EN;
        }
        if (langCode === 'zh-CN' && typeof window.LANG_ZH_CN !== 'undefined' && window.LANG_ZH_CN) {
            return window.LANG_ZH_CN;
        }
        if (langCode === 'zh-TW' && typeof window.LANG_ZH_TW !== 'undefined' && window.LANG_ZH_TW) {
            return window.LANG_ZH_TW;
        }
        if (langCode === 'ja' && typeof window.LANG_JA !== 'undefined' && window.LANG_JA) {
            return window.LANG_JA;
        }
        if (langCode === 'es' && typeof window.LANG_ES !== 'undefined' && window.LANG_ES) {
            return window.LANG_ES;
        }
        if (langCode === 'fr' && typeof window.LANG_FR !== 'undefined' && window.LANG_FR) {
            return window.LANG_FR;
        }
        if (langCode === 'de' && typeof window.LANG_DE !== 'undefined' && window.LANG_DE) {
            return window.LANG_DE;
        }
        if (langCode === 'it' && typeof window.LANG_IT !== 'undefined' && window.LANG_IT) {
            return window.LANG_IT;
        }
        if (langCode === 'ru' && typeof window.LANG_RU !== 'undefined' && window.LANG_RU) {
            return window.LANG_RU;
        }
        if (langCode === 'pt' && typeof window.LANG_PT !== 'undefined' && window.LANG_PT) {
            return window.LANG_PT;
        }
        if (langCode === 'hi' && typeof window.LANG_HI !== 'undefined' && window.LANG_HI) {
            return window.LANG_HI;
        }
        if (langCode === 'ar' && typeof window.LANG_AR !== 'undefined' && window.LANG_AR) {
            return window.LANG_AR;
        }
        if (langCode === 'fa' && typeof window.LANG_FA !== 'undefined' && window.LANG_FA) {
            return window.LANG_FA;
        }
        if (langCode === 'bn' && typeof window.LANG_BN !== 'undefined' && window.LANG_BN) {
            return window.LANG_BN;
        }
        if (langCode === 'ur' && typeof window.LANG_UR !== 'undefined' && window.LANG_UR) {
            return window.LANG_UR;
        }
        if (langCode === 'th' && typeof window.LANG_TH !== 'undefined' && window.LANG_TH) {
            return window.LANG_TH;
        }
        if (langCode === 'vi' && typeof window.LANG_VI !== 'undefined' && window.LANG_VI) {
            return window.LANG_VI;
        }
        if (langCode === 'id' && typeof window.LANG_ID !== 'undefined' && window.LANG_ID) {
            return window.LANG_ID;
        }
        return null;
    }

    /**
     * Get nested value from object by key path
     */
    function getNestedValue(obj, keyPath) {
        if (!obj || !keyPath) return null;
        var keys = keyPath.split(".");
        var value = obj;
        for (var i = 0; i < keys.length; i++) {
            if (value && typeof value === "object" && keys[i] in value) {
                value = value[keys[i]];
            } else {
                return null;
            }
        }
        return (typeof value === "object") ? null : value;
    }

    /**
     * Get translation string - safe version that always returns something
     */
    function getString(keyPath, params) {
        if (!keyPath) return "";

        // Try to initialize if not done yet
        if (currentLanguage === null) {
            initSync();
        }

        // Try current language
        var value = getNestedValue(languageData, keyPath);

        // Try fallback language
        if (value === null && fallbackData) {
            value = getNestedValue(fallbackData, keyPath);
        }

        // Return key if no translation found
        if (value === null) {
            return keyPath;
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

        // Get saved language
        var savedLang = null;
        try {
            if (typeof Spicetify !== 'undefined' && Spicetify.LocalStorage) {
                savedLang = Spicetify.LocalStorage.get(STORAGE_KEY);
            }
        } catch (e) { }

        if (!savedLang || AVAILABLE_LANGUAGES.indexOf(savedLang) === -1) {
            try {
                savedLang = localStorage.getItem(STORAGE_KEY);
            } catch (e) { }
        }

        if (!savedLang || AVAILABLE_LANGUAGES.indexOf(savedLang) === -1) {
            savedLang = DEFAULT_LANGUAGE;
        }

        // Load fallback data first
        fallbackData = getLanguageData(DEFAULT_LANGUAGE) || {};

        // Load selected language
        var data = getLanguageData(savedLang);
        if (data) {
            languageData = data;
            currentLanguage = savedLang;
        } else {
            languageData = fallbackData;
            currentLanguage = DEFAULT_LANGUAGE;
        }

        console.log("[I18n] Initialized: " + currentLanguage);
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
     * Set language and save to storage
     */
    function setLanguage(langCode) {
        if (AVAILABLE_LANGUAGES.indexOf(langCode) === -1) {
            console.error("[I18n] Invalid language: " + langCode);
            return Promise.resolve(false);
        }

        if (langCode === currentLanguage) {
            return Promise.resolve(true);
        }

        var newData = getLanguageData(langCode);
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

        // Save to storage
        try {
            if (typeof Spicetify !== 'undefined' && Spicetify.LocalStorage) {
                Spicetify.LocalStorage.set(STORAGE_KEY, langCode);
            }
        } catch (e) { }
        try {
            localStorage.setItem(STORAGE_KEY, langCode);
        } catch (e) { }

        console.log("[I18n] Language changed to: " + langCode);
        return Promise.resolve(true);
    }

    /**
     * Get list of available languages
     */
    function getAvailableLanguages() {
        return AVAILABLE_LANGUAGES.map(function (code) {
            return { code: code, name: LANGUAGE_NAMES[code] || code };
        });
    }

    /**
     * Get display name for language code
     */
    function getLanguageName(langCode) {
        return LANGUAGE_NAMES[langCode] || langCode;
    }

    /**
     * Check if initialized
     */
    function isInitialized() {
        return currentLanguage !== null;
    }

    // Create the I18n object
    var I18n = {
        init: init,
        initSync: initSync,
        getString: getString,
        t: getString,
        getCurrentLanguage: getCurrentLanguage,
        setLanguage: setLanguage,
        getAvailableLanguages: getAvailableLanguages,
        getLanguageName: getLanguageName,
        isInitialized: isInitialized,
        AVAILABLE_LANGUAGES: AVAILABLE_LANGUAGES,
        DEFAULT_LANGUAGE: DEFAULT_LANGUAGE
    };

    // Export to window
    window.I18n = I18n;

    // Create global helper function
    window.t = function (key, params) {
        return I18n.t(key, params);
    };

    // Initialize immediately
    try {
        initSync();
    } catch (e) {
        console.error("[I18n] Init error:", e);
    }
})();
