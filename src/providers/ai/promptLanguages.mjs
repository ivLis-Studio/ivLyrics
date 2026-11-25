    const PROMPT_LANGUAGE_DATA = {
        ko: { name: 'Korean', native: '한국어', phoneticDesc: 'Korean Hangul pronunciation (e.g., こんにちは → 콘니치와)' },
        en: { name: 'English', native: 'English', phoneticDesc: 'English romanization (e.g., こんにちは → konnichiwa)' },
        'zh-cn': { name: 'Simplified Chinese', native: '简体中文', phoneticDesc: 'Chinese characters for pronunciation' },
        'zh-tw': { name: 'Traditional Chinese', native: '繁體中文', phoneticDesc: 'Chinese characters for pronunciation' },
        ja: { name: 'Japanese', native: '日本語', phoneticDesc: 'Japanese Katakana pronunciation' },
        hi: { name: 'Hindi', native: 'हिन्दी', phoneticDesc: 'Hindi Devanagari pronunciation' },
        es: { name: 'Spanish', native: 'Español', phoneticDesc: 'Spanish phonetic spelling' },
        fr: { name: 'French', native: 'Français', phoneticDesc: 'French phonetic spelling' },
        ar: { name: 'Arabic', native: 'العربية', phoneticDesc: 'Arabic script pronunciation' },
        fa: { name: 'Persian', native: 'فارسی', phoneticDesc: 'Persian script pronunciation' },
        de: { name: 'German', native: 'Deutsch', phoneticDesc: 'German phonetic spelling' },
        ru: { name: 'Russian', native: 'Русский', phoneticDesc: 'Russian Cyrillic pronunciation' },
        sv: { name: 'Swedish', native: 'Svenska', phoneticDesc: 'Swedish phonetic spelling' },
        pt: { name: 'Portuguese', native: 'Português', phoneticDesc: 'Portuguese phonetic spelling' },
        bn: { name: 'Bengali', native: 'বাংলা', phoneticDesc: 'Bengali script pronunciation' },
        cs: { name: 'Czech', native: 'Čeština', phoneticDesc: 'Czech phonetic spelling' },
        it: { name: 'Italian', native: 'Italiano', phoneticDesc: 'Italian phonetic spelling' },
        th: { name: 'Thai', native: 'ไทย', phoneticDesc: 'Thai script pronunciation' },
        tr: { name: 'Turkish', native: 'Türkçe', phoneticDesc: 'Turkish phonetic spelling' },
        vi: { name: 'Vietnamese', native: 'Tiếng Việt', phoneticDesc: 'Vietnamese phonetic spelling' },
        id: { name: 'Indonesian', native: 'Bahasa Indonesia', phoneticDesc: 'Indonesian phonetic spelling' },
        ms: { name: 'Malay', native: 'Bahasa Melayu', phoneticDesc: 'Malay phonetic spelling' }
    };

    const getTranslationLanguageInfo = (lang) => {
        const normalized = String(lang || 'en').trim().replace(/_/g, '-').toLowerCase();
        const shortLang = normalized.split('-')[0];
        return PROMPT_LANGUAGE_DATA[normalized]
            || PROMPT_LANGUAGE_DATA[shortLang]
            || { name: String(lang || 'English'), native: String(lang || 'English') };
    };

    const getProviderPromptLanguageInfo = (lang) => {
        const normalized = String(lang || 'en').trim().replace(/_/g, '-').toLowerCase();
        const shortLang = normalized.split('-')[0];
        return PROMPT_LANGUAGE_DATA[normalized]
            || PROMPT_LANGUAGE_DATA[shortLang]
            || PROMPT_LANGUAGE_DATA.en;
    };

    const PROVIDERS_WITHOUT_PHONETIC_DESCRIPTION = new Set([
        'claude',
        'groq',
        'openrouter',
        'paxsenix',
        'perplexity'
    ]);
export { getTranslationLanguageInfo, getProviderPromptLanguageInfo, PROVIDERS_WITHOUT_PHONETIC_DESCRIPTION };
