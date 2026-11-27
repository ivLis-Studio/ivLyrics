/**
 * Bing Translate Addon for ivLyrics
 * Uses Bing Translator's website flow as an experimental, keyless,
 * translation-only provider.
 *
 * Protocol flow adapted from plainheart/bing-translate-api (MIT):
 * https://github.com/plainheart/bing-translate-api
 *
 * @author default
 * @version 1.0.0
 */

import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import { createWebTranslationAddon, normalizeWebTranslationLanguage } from "./webTranslationAddon.mjs";
import { createWebTranslationTransport, unpackRuntimeString } from "./webTranslationTransport.mjs";

export default function initializeBingTranslateAddon(services = createBuiltinAiProviderServices(window)) {
    const { host, debug, registerAiAddon } = services;

    const ADDON_INFO = {
        id: 'bing-translate',
        name: 'Bing Translate',
        author: 'default',
        description: {
            ko: 'Bing 번역 웹 서비스를 사용하는 실험적 번역 전용 제공자 (API 키 불필요)',
            en: 'Experimental translation-only provider using the Bing Translator web service (no API key required)',
            ja: 'Bing 翻訳のウェブサービスを使用する試験的な翻訳専用プロバイダー（API キー不要）',
            'zh-CN': '使用必应翻译网页服务的实验性纯翻译提供商（无需 API 密钥）',
            'zh-TW': '使用 Bing 翻譯網頁服務的實驗性純翻譯供應商（不需要 API 金鑰）',
            hi: 'Bing Translator वेब सेवा का उपयोग करने वाला प्रयोगात्मक, केवल-अनुवाद प्रदाता (API कुंजी आवश्यक नहीं)',
            es: 'Proveedor experimental solo para traducción que usa el servicio web de Bing Translator (no requiere clave de API)',
            fr: 'Fournisseur expérimental dédié à la traduction utilisant le service web Bing Translator (aucune clé API requise)',
            ar: 'موفّر تجريبي مخصّص للترجمة يستخدم خدمة Bing Translator على الويب (لا يتطلب مفتاح API)',
            fa: 'ارائه‌دهنده آزمایشی مخصوص ترجمه با استفاده از سرویس وب Bing Translator (بدون نیاز به کلید API)',
            de: 'Experimenteller Anbieter nur für Übersetzungen über den Bing-Translator-Webdienst (kein API-Schlüssel erforderlich)',
            ru: 'Экспериментальный провайдер только для перевода через веб-службу Bing Translator (API-ключ не требуется)',
            sv: 'Experimentell leverantör endast för översättning via webbtjänsten Bing Translator (ingen API-nyckel krävs)',
            pt: 'Provedor experimental exclusivo para tradução usando o serviço web Bing Translator (não requer chave de API)',
            bn: 'Bing Translator ওয়েব পরিষেবা ব্যবহারকারী পরীক্ষামূলক, শুধু-অনুবাদ প্রদানকারী (API কী প্রয়োজন নেই)',
            cs: 'Experimentální poskytovatel pouze pro překlad využívající webovou službu Bing Translator (bez klíče API)',
            it: 'Provider sperimentale dedicato alla traduzione che usa il servizio web Bing Translator (non richiede una chiave API)',
            th: 'ผู้ให้บริการแปลอย่างเดียวแบบทดลองที่ใช้บริการเว็บ Bing Translator (ไม่ต้องใช้คีย์ API)',
            vi: 'Nhà cung cấp thử nghiệm chỉ dành cho dịch thuật, sử dụng dịch vụ web Bing Translator (không cần khóa API)',
            id: 'Penyedia eksperimental khusus terjemahan yang menggunakan layanan web Bing Translator (tanpa kunci API)',
            ms: 'Penyedia percubaan khusus untuk terjemahan yang menggunakan perkhidmatan web Bing Translator (tidak memerlukan kunci API)',
            tr: 'Bing Translator web hizmetini kullanan deneysel, yalnızca çeviri sağlayıcısı (API anahtarı gerekmez)'
        },
        version: '1.0.0'
    };

    // Keep service and proxy routes out of plain-text bundles. This is a small
    // salt-rotated, 16-bit packed representation instead of Base64. The routes
    // remain observable in DevTools while requests are running.
    const BING_ORIGIN = unpackRuntimeString(0x6d, 20, [
        0x58a1, 0x0a6f, 0xc773, 0xc5a4, 0x4faa,
        0xf109, 0xae08, 0x6cc4, 0x4ea6, 0xc162
    ]);
    const TRANSLATOR_PATH = unpackRuntimeString(0x31, 11, [
        0x43fd, 0x5022, 0x8666, 0xdab6, 0x10ee, 0xa800
    ]);
    const TRANSLATE_PATH = unpackRuntimeString(0x52, 27, [
        0x209e, 0x3552, 0xea18, 0xa6d8, 0x6696, 0xdc6e, 0xc061,
        0x54ef, 0x099f, 0xe344, 0xb2e5, 0x44a8, 0x4a23, 0x8f00
    ]);
    const DEFAULT_CORS_PROXY_TEMPLATE = unpackRuntimeString(0x7b, 38, [
        0x4eb7, 0x1c79, 0xd165, 0xd3b2, 0x4da4, 0xe242, 0xf707,
        0x66da, 0x0eaa, 0x966a, 0x82c6, 0x6f88, 0x2a52, 0xe618,
        0xe4c6, 0x7495, 0xe918, 0xfd5b, 0x2e82
    ]);
    const PROXY_TEMPLATE_STORAGE_KEY = 'spicetify:corsProxyTemplate';
    const PROXY_CLIENT_ADDRESS_STORAGE_KEY = 'ivLyrics:ai:bing-translate:proxy-client-address';
    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/151.0.4129.59';
    const RETRYABLE_STATUS_CODES = new Set([408, 500, 502, 503, 504]);
    const SUPPORTED_TARGET_LANGUAGES = new Set([
        'ar', 'bn', 'cs', 'de', 'en', 'es', 'fa', 'fr', 'hi', 'id', 'it',
        'ja', 'ko', 'ms', 'pt', 'pt-PT', 'ru', 'sv', 'th', 'tr', 'vi',
        'zh-Hans', 'zh-Hant'
    ]);
    const TARGET_LANGUAGE_MAP = Object.freeze({
        'pt-pt': 'pt-PT',
        'zh-cn': 'zh-Hans',
        'zh-hans': 'zh-Hans',
        'zh-tw': 'zh-Hant',
        'zh-hant': 'zh-Hant'
    });

    let globalConfig = null;
    let globalConfigPromise = null;
    let fallbackProxyClientAddress = null;

    const transport = createWebTranslationTransport({
        name: ADDON_INFO.name,
        fetch: (...args) => host.fetch(...args)
    });

    function normalizeTargetLanguage(lang) {
        const targetLanguage = normalizeWebTranslationLanguage(lang, TARGET_LANGUAGE_MAP);
        if (!SUPPORTED_TARGET_LANGUAGES.has(targetLanguage)) {
            throw new Error(`[Bing Translate] Unsupported target language: ${lang}`);
        }
        return targetLanguage;
    }

    function createProxyClientAddress() {
        const words = new Uint16Array(6);
        if (globalThis.crypto?.getRandomValues) {
            globalThis.crypto.getRandomValues(words);
        } else {
            for (let index = 0; index < words.length; index++) {
                words[index] = Math.floor(Math.random() * 0x10000);
            }
        }
        return `2001:db8:${Array.from(words, word => word.toString(16)).join(':')}`;
    }

    function getProxyClientAddress() {
        const validAddress = /^2001:db8(?::[0-9a-f]{1,4}){6}$/i;
        try {
            const storedAddress = host.localStorage?.getItem(PROXY_CLIENT_ADDRESS_STORAGE_KEY);
            if (validAddress.test(storedAddress || '')) {
                return storedAddress;
            }

            const newAddress = createProxyClientAddress();
            host.localStorage?.setItem(PROXY_CLIENT_ADDRESS_STORAGE_KEY, newAddress);
            return newAddress;
        } catch {
            fallbackProxyClientAddress ||= createProxyClientAddress();
            return fallbackProxyClientAddress;
        }
    }

    function getProxiedUrl(targetUrl) {
        let template = DEFAULT_CORS_PROXY_TEMPLATE;
        try {
            template = host.localStorage?.getItem(PROXY_TEMPLATE_STORAGE_KEY) || template;
        } catch {
            // Use Spicetify's default proxy when local storage is unavailable.
        }
        if (!template.includes('{url}')) {
            throw new Error('[Bing Translate] Invalid Spicetify CORS proxy template');
        }
        return template.replace('{url}', targetUrl);
    }

    function buildProxyHeaders(extraHeaders = {}) {
        return {
            'X-User-Agent': USER_AGENT,
            'X-X-Real-Ip': getProxyClientAddress(),
            'X-Origin': BING_ORIGIN,
            ...extraHeaders
        };
    }

    function extractCookieHeader(setCookieHeader) {
        return String(setCookieHeader || '')
            .split(/,(?=\s*[^;,\s]+=)/)
            .map(cookie => cookie.trim().split(';', 1)[0])
            .filter(Boolean)
            .join('; ');
    }

    function getFinalBingOrigin(response) {
        const finalDestination = response.headers.get('x-final-destination');
        if (!finalDestination) return BING_ORIGIN;

        try {
            const parsed = new URL(finalDestination);
            const canonicalHost = new URL(BING_ORIGIN).hostname;
            const isCanonicalHost = parsed.hostname === canonicalHost
                || parsed.hostname.endsWith(`.${canonicalHost}`);
            if (parsed.protocol === 'https:' && isCanonicalHost) {
                return parsed.origin;
            }
        } catch {
            // Fall back to the canonical Bing origin.
        }
        return BING_ORIGIN;
    }

    function parseGlobalConfig(html, origin, cookieHeader) {
        const IG = html.match(/IG:"([^"]+)"/)?.[1];
        const IID = html.match(/data-iid="([^"]+)"/)?.[1];
        const tokenTuple = html.match(/params_AbusePreventionHelper\s*=\s*(\[[^\]]+\])/)?.[1];
        if (!IG || !IID || !tokenTuple) {
            throw new Error('[Bing Translate] Failed to read translator configuration');
        }

        let parsedTuple;
        try {
            parsedTuple = JSON.parse(tokenTuple);
        } catch {
            throw new Error('[Bing Translate] Invalid translator token configuration');
        }

        const [key, token, tokenExpiryInterval] = parsedTuple;
        if (!Number.isFinite(Number(key)) || !token || !Number.isFinite(Number(tokenExpiryInterval))) {
            throw new Error('[Bing Translate] Incomplete translator token configuration');
        }

        return {
            IG,
            IID,
            key: Number(key),
            token: String(token),
            tokenTs: Number(key),
            tokenExpiryInterval: Number(tokenExpiryInterval),
            cookieHeader,
            origin,
            count: 0
        };
    }

    function fetchGlobalConfig() {
        return transport.read(getProxiedUrl(`${BING_ORIGIN}${TRANSLATOR_PATH}`), {
            method: 'GET',
            headers: buildProxyHeaders({
                Accept: 'text/html,application/xhtml+xml'
            }),
            cache: 'no-store'
        }, async (response) => {
            if (!response.ok) {
                throw Object.assign(new Error(`[Bing Translate] Failed to load translator (${response.status})`), {
                    status: response.status,
                    retryable: RETRYABLE_STATUS_CODES.has(response.status)
                });
            }
            const origin = getFinalBingOrigin(response);
            const cookieHeader = extractCookieHeader(response.headers.get('x-set-cookie'));
            return parseGlobalConfig(await response.text(), origin, cookieHeader);
        });
    }

    const isTokenExpired = config => Date.now() - config.tokenTs > config.tokenExpiryInterval;

    function ensureGlobalConfig() {
        if (globalConfig && !isTokenExpired(globalConfig)) return globalConfig;

        if (!globalConfigPromise) {
            globalConfigPromise = fetchGlobalConfig()
                .then(config => {
                    if (isTokenExpired(config)) {
                        throw Object.assign(new Error('[Bing Translate] Translator token already expired'), { retryable: true });
                    }
                    globalConfig = config;
                    return config;
                })
                .finally(() => {
                    globalConfigPromise = null;
                });
        }
        return globalConfigPromise;
    }

    function makeRequestUrl(config) {
        config.count += 1;
        return `${config.origin}${TRANSLATE_PATH}`
            + `&IG=${encodeURIComponent(config.IG)}`
            + `&IID=${encodeURIComponent(config.IID)}`
            + `&SFX=${config.count}`
            + '&ref=TThis&edgepdftranslator=1';
    }

    function createResponseError(response, payload) {
        let message = `[Bing Translate] Request failed (${response.status})`;
        let retryable = RETRYABLE_STATUS_CODES.has(response.status);
        let refreshConfig = false;

        if (payload?.ShowCaptcha) {
            message = '[Bing Translate] Bing requested a captcha. Please try again later.';
            retryable = false;
        } else if (response.status === 429) {
            message = '[Bing Translate] Translation limit exceeded. Please try again later.';
            retryable = false;
        } else if (response.status === 401 || payload?.StatusCode === 401) {
            message = '[Bing Translate] Translator token was rejected';
            retryable = true;
            refreshConfig = true;
        }

        const error = new Error(message);
        error.status = response.status;
        error.retryable = retryable;
        error.refreshConfig = refreshConfig;
        return error;
    }

    function postTranslation(config, text, targetLanguage, signal) {
        const requestUrl = makeRequestUrl(config);
        const body = new URLSearchParams({
            fromLang: 'auto-detect',
            text,
            token: config.token,
            key: String(config.key),
            to: targetLanguage,
            tryFetchingGenderDebiasedTranslations: 'false'
        });
        const headers = buildProxyHeaders({
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Referer': `${config.origin}${TRANSLATOR_PATH}`
        });
        if (config.cookieHeader) {
            headers['X-Cookie'] = config.cookieHeader;
        }

        return transport.read(getProxiedUrl(requestUrl), {
            method: 'POST',
            headers,
            body: body.toString()
        }, async (response) => {
            const responseText = await response.text();
            let payload = null;
            try {
                payload = JSON.parse(responseText);
            } catch {
                if (response.ok) {
                    throw Object.assign(new Error('[Bing Translate] Invalid translation response'), { retryable: true });
                }
            }

            if (!response.ok || payload?.ShowCaptcha || payload?.StatusCode === 401) {
                throw createResponseError(response, payload);
            }

            const translatedText = payload?.[0]?.translations?.[0]?.text;
            if (typeof translatedText !== 'string') {
                throw new Error('[Bing Translate] Invalid translation response format');
            }
            return translatedText.replace(/\r\n?/g, '\n');
        }, signal);
    }

    function requestTranslation(text, targetLanguage, signal) {
        return transport.retry(async () => {
            const config = await ensureGlobalConfig();
            try {
                return await postTranslation(config, text, targetLanguage, signal);
            } catch (error) {
                // A late rejection from the previous session must not discard the replacement.
                if (error?.refreshConfig && globalConfig === config) globalConfig = null;
                throw error;
            }
        }, signal);
    }

    registerAiAddon(createWebTranslationAddon({
        info: ADDON_INFO, requestTranslation, normalizeLanguage: normalizeTargetLanguage,
        maxCharacters: 2800, debug
    }));
}
