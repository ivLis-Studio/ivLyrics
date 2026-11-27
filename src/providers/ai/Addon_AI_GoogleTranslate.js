/**
 * Google Translate Addon for ivLyrics
 * Uses the public web translation endpoint as an experimental, keyless
 * translation-only provider.
 *
 * @author default
 * @version 1.0.0
 */

import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import { createWebTranslationAddon, normalizeWebTranslationLanguage } from "./webTranslationAddon.mjs";
import { createWebTranslationTransport, unpackRuntimeString } from "./webTranslationTransport.mjs";

export default function initializeGoogleTranslateAddon(services = createBuiltinAiProviderServices(window)) {
    const { host, debug, registerAiAddon } = services;

    const ADDON_INFO = {
        id: 'google-translate',
        name: 'Google Translate',
        author: 'default',
        description: {
            ko: 'Google 번역 웹 엔드포인트를 사용하는 실험적 번역 전용 제공자 (API 키 불필요)',
            en: 'Experimental translation-only provider using the Google Translate web endpoint (no API key required)',
            ja: 'Google 翻訳のウェブエンドポイントを使用する試験的な翻訳専用プロバイダー（API キー不要）',
            'zh-CN': '使用 Google 翻译网页端点的实验性纯翻译提供商（无需 API 密钥）',
            'zh-TW': '使用 Google 翻譯網頁端點的實驗性純翻譯供應商（不需要 API 金鑰）',
            hi: 'Google Translate वेब एंडपॉइंट का उपयोग करने वाला प्रयोगात्मक, केवल-अनुवाद प्रदाता (API कुंजी आवश्यक नहीं)',
            es: 'Proveedor experimental solo para traducción que usa el endpoint web de Google Translate (no requiere clave de API)',
            fr: 'Fournisseur expérimental dédié à la traduction utilisant le point d’accès web Google Translate (aucune clé API requise)',
            ar: 'موفّر تجريبي مخصّص للترجمة يستخدم نقطة نهاية Google Translate على الويب (لا يتطلب مفتاح API)',
            fa: 'ارائه‌دهنده آزمایشی مخصوص ترجمه با استفاده از نقطه پایانی وب Google Translate (بدون نیاز به کلید API)',
            de: 'Experimenteller Anbieter nur für Übersetzungen über den Google-Translate-Webendpunkt (kein API-Schlüssel erforderlich)',
            ru: 'Экспериментальный провайдер только для перевода через веб-эндпоинт Google Translate (API-ключ не требуется)',
            sv: 'Experimentell leverantör endast för översättning via Google Translates webbslutpunkt (ingen API-nyckel krävs)',
            pt: 'Provedor experimental exclusivo para tradução usando o endpoint web do Google Translate (não requer chave de API)',
            bn: 'Google Translate ওয়েব এন্ডপয়েন্ট ব্যবহারকারী পরীক্ষামূলক, শুধু-অনুবাদ প্রদানকারী (API কী প্রয়োজন নেই)',
            cs: 'Experimentální poskytovatel pouze pro překlad využívající webový endpoint Google Translate (bez klíče API)',
            it: 'Provider sperimentale dedicato alla traduzione che usa l’endpoint web di Google Translate (non richiede una chiave API)',
            th: 'ผู้ให้บริการแปลอย่างเดียวแบบทดลองที่ใช้เว็บเอนด์พอยต์ของ Google Translate (ไม่ต้องใช้คีย์ API)',
            vi: 'Nhà cung cấp thử nghiệm chỉ dành cho dịch thuật, sử dụng điểm cuối web Google Translate (không cần khóa API)',
            id: 'Penyedia eksperimental khusus terjemahan yang menggunakan endpoint web Google Translate (tanpa kunci API)',
            ms: 'Penyedia percubaan khusus untuk terjemahan yang menggunakan titik akhir web Google Translate (tidak memerlukan kunci API)',
            tr: 'Google Translate web uç noktasını kullanan deneysel, yalnızca çeviri sağlayıcısı (API anahtarı gerekmez)'
        },
        version: '1.0.0'
    };

    // Keep service routes out of plain-text bundles. This is intentionally a
    // tiny runtime unpacker rather than Base64; network destinations are still
    // observable in DevTools once a request is made.
    const ENDPOINT = unpackRuntimeString(0x47, 51, [
        0x728b, 0x2045, 0xed59, 0xef8e, 0x6685, 0xcd63, 0x9527,
        0x49fd, 0x2fc1, 0xe34a, 0xa1f4, 0x5cb4, 0x0377, 0xd52e,
        0xd8f8, 0x57b4, 0xd52b, 0xc674, 0x10b0, 0x4ce0, 0x8632,
        0xd38c, 0x69d8, 0x6107, 0x8d63, 0xc100
    ]);
    const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
    const TARGET_LANGUAGE_MAP = Object.freeze({
        'zh-cn': 'zh-CN',
        'zh-tw': 'zh-TW'
    });

    const transport = createWebTranslationTransport({
        name: ADDON_INFO.name,
        fetch: (...args) => host.fetch(...args)
    });

    function normalizeTargetLanguage(lang) {
        return normalizeWebTranslationLanguage(lang, TARGET_LANGUAGE_MAP);
    }

    function createHttpError(response) {
        const error = new Error(`[Google Translate] Request failed (${response.status})`);
        error.status = response.status;
        error.retryable = RETRYABLE_STATUS_CODES.has(response.status);
        return error;
    }

    function parseTranslatedText(payload) {
        if (!Array.isArray(payload?.[0])) {
            throw new Error('[Google Translate] Invalid response format');
        }

        const translatedText = payload[0]
            .map(segment => Array.isArray(segment) ? String(segment[0] ?? '') : '')
            .join('')
            .replace(/\r\n?/g, '\n');

        if (!translatedText && payload[0].length > 0) {
            throw new Error('[Google Translate] Empty translation response');
        }
        return translatedText;
    }

    function requestTranslation(text, targetLanguage, signal) {
        const body = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: targetLanguage, dt: 't', q: text });
        return transport.retry(() => transport.read(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: body.toString()
        }, async (response) => {
            if (!response.ok) throw createHttpError(response);
            return parseTranslatedText(await response.json());
        }, signal), signal);
    }

    registerAiAddon(createWebTranslationAddon({
        info: ADDON_INFO, requestTranslation, normalizeLanguage: normalizeTargetLanguage,
        maxCharacters: 3500, debug
    }));
}
