/** DeepL translation-only provider, using Spicetify's configured CORS proxy. */

import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import { throwIfAiRequestAborted } from "./aiRequestCancellation.mjs";

export default function initializeDeepLAddon(services = createBuiltinAiProviderServices(window)) {
    const { host: window, getManager, getAiRequest, getI18n, getSpicetify, registerAiAddon } = services;

    const ID = 'deepl';
    const DEFAULT_CORS_PROXY_TEMPLATE = 'https://cors-proxy.spicetify.app/{url}';
    const PROXY_TEMPLATE_STORAGE_KEY = 'spicetify:corsProxyTemplate';
    const getKey = () => String(getManager()?.getAddonSetting(ID, 'api-key', '') || '').trim();
    const t = (key, fallback) => {
        const value = getI18n()?.t?.(key);
        return value && value !== key ? value : fallback;
    };
    function targetLanguage(lang) {
        const code = String(lang || 'en').trim().replace(/_/g, '-').toUpperCase();
        return ({ 'ZH-CN': 'ZH-HANS', 'ZH-TW': 'ZH-HANT', EN: 'EN-US', PT: 'PT-PT' })[code] || code;
    }
    function getProxiedUrl(key) {
        const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
        let template = DEFAULT_CORS_PROXY_TEMPLATE;
        try {
            template = window.localStorage?.getItem(PROXY_TEMPLATE_STORAGE_KEY) || template;
        } catch {
            // Match the existing Bing provider when local storage is unavailable.
        }
        if (!template.includes('{url}')) throw new Error('[DeepL] Invalid Spicetify CORS proxy template');
        return template.replace('{url}', `https://${host}/v2/translate`);
    }
    async function translate(text, lang, signal) {
        const key = getKey();
        if (!key) throw new Error('[DeepL] API key is required');
        const endpoint = getProxiedUrl(key);
        const target = targetLanguage(lang);
        const output = [];
        // Both the API's text-count limit and its UTF-8 request-size limit apply.
        const encoder = new TextEncoder();
        let next;
        let nextBytes = 0;
        for (let start = 0; start < text.length;) {
            throwIfAiRequestAborted(signal);
            const batch = [];
            let size = 0;
            while (start < text.length && batch.length < 50) {
                if (!nextBytes) {
                    next = String(text[start]);
                    nextBytes = encoder.encode(JSON.stringify(next)).length;
                }
                if (nextBytes > 120000) throw new Error('[DeepL] A lyric line is too large');
                if (size + nextBytes > 120000 && batch.length) break;
                batch.push(next);
                start++;
                size += nextBytes + 1;
                nextBytes = 0;
            }
            const response = await getAiRequest()(endpoint, {
                method: 'POST', credentials: 'omit',
                ...(signal ? { signal } : {}),
                headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: batch, target_lang: target, preserve_formatting: true })
            }, 35_000);
            if (!response.ok) throw new Error(`[DeepL] Translation request failed (${response.status})`);
            const data = await response.json();
            if (!Array.isArray(data.translations) || data.translations.length !== batch.length
                    || data.translations.some(item => typeof item?.text !== 'string' || !item.text.trim())) {
                throw new Error('[DeepL] Invalid translation response');
            }
            output.push(...data.translations.map(item => item.text.replace(/\r?\n/g, ' ').trim()));
        }
        return output;
    }
    const addon = {
        id: ID, name: 'DeepL', author: 'default', version: '1.0.0',
        apiKeyUrl: 'https://www.deepl.com/your-account/keys',
        description: {
            ko: 'DeepL API Free/Pro를 사용하는 번역 전용 제공자입니다.',
            en: 'Translation-only provider using DeepL API Free/Pro.',
            ja: 'DeepL API Free/Proを使用する翻訳専用プロバイダーです。',
            'zh-CN': '使用 DeepL API Free/Pro 的纯翻译提供商。',
            'zh-TW': '使用 DeepL API Free/Pro 的純翻譯供應商。',
            hi: 'DeepL API Free/Pro का उपयोग करने वाला केवल-अनुवाद प्रदाता।',
            es: 'Proveedor solo para traducción que usa DeepL API Free/Pro.',
            fr: 'Fournisseur dédié à la traduction utilisant DeepL API Free/Pro.',
            ar: 'موفّر مخصّص للترجمة فقط يستخدم DeepL API Free/Pro.',
            fa: 'ارائه‌دهنده مخصوص ترجمه با استفاده از DeepL API Free/Pro.',
            de: 'Anbieter nur für Übersetzungen über DeepL API Free/Pro.',
            ru: 'Провайдер только для перевода на базе DeepL API Free/Pro.',
            sv: 'Leverantör endast för översättning via DeepL API Free/Pro.',
            pt: 'Provedor exclusivo para tradução usando DeepL API Free/Pro.',
            bn: 'DeepL API Free/Pro ব্যবহারকারী শুধু-অনুবাদ প্রদানকারী।',
            cs: 'Poskytovatel pouze pro překlad využívající DeepL API Free/Pro.',
            it: 'Provider dedicato alla traduzione che usa DeepL API Free/Pro.',
            th: 'ผู้ให้บริการแปลอย่างเดียวที่ใช้ DeepL API Free/Pro',
            vi: 'Nhà cung cấp chỉ dành cho dịch thuật, sử dụng DeepL API Free/Pro.',
            id: 'Penyedia khusus terjemahan yang menggunakan DeepL API Free/Pro.',
            ms: 'Penyedia khusus untuk terjemahan yang menggunakan DeepL API Free/Pro.',
            tr: 'DeepL API Free/Pro kullanan, yalnızca çeviri yapan sağlayıcı.'
        },
        supports: {
            translate: true, pronunciation: false, metadata: true, tmi: false,
            researchWebSearch: false, lyricsStudy: false, characterPronunciation: false,
            culturalAnnotations: false
        },
        getSettingsUI() {
            const React = getSpicetify().React;
            return function DeepLSettings() {
                const [key, setKey] = React.useState(() => getKey());
                return React.createElement('div', { className: 'ai-addon-settings' },
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', { htmlFor: 'ivlyrics-deepl-api-key' }, t('settings.aiProviders.apiKey', 'API Key')),
                        React.createElement('input', { id: 'ivlyrics-deepl-api-key', type: 'password', autoComplete: 'off', value: key,
                            'aria-describedby': 'ivlyrics-deepl-api-key-help', spellCheck: false,
                            onChange: event => {
                                setKey(event.target.value);
                                getManager().setAddonSetting(ID, 'api-key', event.target.value.trim());
                            } }),
                        React.createElement('small', { id: 'ivlyrics-deepl-api-key-help' }, 'DeepL API Free / Pro')
                    )
                );
            };
        },
        async testConnection() { await translate(['Hello'], 'KO'); return true; },
        async translateLyrics({ text, lang, wantSmartPhonetic, onLine, signal }) {
            if (wantSmartPhonetic) throw new Error('[DeepL] Pronunciation is not supported');
            if (!text?.trim()) throw new Error('[DeepL] No text provided');
            const lines = text.replace(/\r\n?/g, '\n').split('\n');
            const parts = lines.map(line => line.split(' / '));
            const pending = [];
            const positions = [];
            parts.forEach((line, row) => line.forEach((part, column) => {
                if (part.trim() && !/^\s*\[.*\]\s*$/.test(part)) {
                    positions.push([row, column]); pending.push(part);
                }
            }));
            const translated = await translate(pending, lang, signal);
            throwIfAiRequestAborted(signal);
            positions.forEach(([row, column], index) => { parts[row][column] = translated[index]; });
            const translation = parts.map(line => line.join(' / '));
            translation.forEach((line, index) => onLine?.(index, line, { provider: ID, final: true }));
            return { translation };
        },
        async translateMetadata({ title, artist, lang, signal }) {
            if (!title?.trim() || !artist?.trim()) throw new Error('[DeepL] Title and artist are required');
            const [translatedTitle, translatedArtist] = await translate([title, artist], lang, signal);
            return { translated: { title: translatedTitle, artist: translatedArtist }, romanized: { title, artist } };
        }
    };
    const register = () => registerAiAddon(addon);
    register();
}
