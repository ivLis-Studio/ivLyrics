/**
 * Pronunciation Lab Addon for ivLyrics
 * Rule- and dictionary-based line pronunciation: not AI and keyless, listed
 * with the AI providers like the Google and Bing translation addons.
 * pronunciationLabEngine.mjs does the work and is shared with the mobile
 * apps; it imports the newest pronunciation-lab release from jsDelivr when
 * the first pronunciation is requested, so the library is never bundled.
 *
 * @author default
 * @version 1.0.0
 */

import { throwIfAiRequestAborted } from "./aiRequestCancellation.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import {
    PRONUNCIATION_LAB_ERRORS,
    createPronunciationLabEngine,
    resolvePronunciationLabModuleUrl,
} from "./pronunciationLabEngine.mjs";

export default function initializePronunciationLabAddon(services = createBuiltinAiProviderServices(window)) {
    const { host, debug, registerAiAddon, getI18n } = services;

    const ADDON_INFO = {
        id: 'pronunciation-lab',
        name: 'Pronunciation Lab',
        author: 'default',
        description: {
            ko: '규칙·사전 기반 발음 전용 제공자 (AI 아님, API 키 불필요). pronunciation-lab 최신 버전을 CDN에서 불러옵니다',
            en: 'Rule- and dictionary-based pronunciation-only provider (not AI, no API key required). Loads the latest pronunciation-lab release from a CDN',
            ja: 'ルールと辞書に基づく発音専用プロバイダー（AI ではなく、API キー不要）。pronunciation-lab の最新版を CDN から読み込みます',
            'zh-CN': '基于规则和词典的纯发音提供商（非 AI，无需 API 密钥）。从 CDN 加载最新版 pronunciation-lab',
            'zh-TW': '以規則和詞典為基礎的純發音供應商（非 AI，不需要 API 金鑰）。從 CDN 載入最新版 pronunciation-lab',
            hi: 'नियम और शब्दकोश पर आधारित, केवल-उच्चारण प्रदाता (AI नहीं, API कुंजी आवश्यक नहीं)। CDN से pronunciation-lab का नवीनतम संस्करण लोड करता है',
            es: 'Proveedor solo de pronunciación basado en reglas y diccionarios (no es IA, no requiere clave de API). Carga la última versión de pronunciation-lab desde una CDN',
            fr: 'Fournisseur dédié à la prononciation, fondé sur des règles et des dictionnaires (pas d’IA, aucune clé API requise). Charge la dernière version de pronunciation-lab depuis un CDN',
            ar: 'موفّر مخصّص للنطق قائم على القواعد والقواميس (ليس ذكاءً اصطناعيًا، لا يتطلب مفتاح API). يحمّل أحدث إصدار من pronunciation-lab من شبكة CDN',
            fa: 'ارائه‌دهنده مخصوص تلفظ بر پایه قواعد و واژه‌نامه (هوش مصنوعی نیست، بدون نیاز به کلید API). آخرین نسخه pronunciation-lab را از CDN بارگیری می‌کند',
            de: 'Regel- und wörterbuchbasierter Anbieter nur für Aussprache (keine KI, kein API-Schlüssel erforderlich). Lädt die neueste Version von pronunciation-lab über ein CDN',
            ru: 'Провайдер только для произношения на основе правил и словарей (не ИИ, API-ключ не требуется). Загружает последнюю версию pronunciation-lab из CDN',
            sv: 'Regel- och ordboksbaserad leverantör endast för uttal (inte AI, ingen API-nyckel krävs). Läser in den senaste versionen av pronunciation-lab från ett CDN',
            pt: 'Provedor exclusivo de pronúncia baseado em regras e dicionários (não é IA, não requer chave de API). Carrega a versão mais recente do pronunciation-lab a partir de uma CDN',
            bn: 'নিয়ম ও অভিধানভিত্তিক, শুধু-উচ্চারণ প্রদানকারী (AI নয়, API কী প্রয়োজন নেই)। CDN থেকে pronunciation-lab-এর সর্বশেষ সংস্করণ লোড করে',
            cs: 'Poskytovatel pouze pro výslovnost založený na pravidlech a slovnících (nejde o AI, bez klíče API). Načítá nejnovější verzi pronunciation-lab z CDN',
            it: 'Provider dedicato alla pronuncia basato su regole e dizionari (non è IA, non richiede una chiave API). Carica l’ultima versione di pronunciation-lab da una CDN',
            th: 'ผู้ให้บริการเฉพาะการออกเสียงที่ใช้กฎและพจนานุกรม (ไม่ใช่ AI ไม่ต้องใช้คีย์ API) โหลด pronunciation-lab เวอร์ชันล่าสุดจาก CDN',
            vi: 'Nhà cung cấp chỉ dành cho phát âm, dựa trên quy tắc và từ điển (không phải AI, không cần khóa API). Tải phiên bản pronunciation-lab mới nhất từ CDN',
            id: 'Penyedia khusus pelafalan berbasis aturan dan kamus (bukan AI, tanpa kunci API). Memuat versi terbaru pronunciation-lab dari CDN',
            ms: 'Penyedia khusus sebutan berasaskan peraturan dan kamus (bukan AI, tidak memerlukan kunci API). Memuatkan versi terkini pronunciation-lab daripada CDN',
            tr: 'Kurallara ve sözlüklere dayalı, yalnızca telaffuz sağlayıcısı (yapay zekâ değil, API anahtarı gerekmez). pronunciation-lab’in en son sürümünü bir CDN’den yükler'
        },
        version: '1.0.0'
    };

    // import(url) of a release module. Tests and diagnostics can provide
    // their own importer, as the Local AI engine allows.
    const importModule = (url) => (typeof host.__ivLyricsPronunciationLabImport === 'function'
        ? host.__ivLyricsPronunciationLabImport(url)
        : import(url));

    const engine = createPronunciationLabEngine({
        loadLibrary: importModule,
        resolveModuleUrl: () => resolvePronunciationLabModuleUrl({ fetch: (...args) => host.fetch(...args) }),
        checkAbort: throwIfAiRequestAborted,
    });

    const error = (message) => new Error(`[${ADDON_INFO.name}] ${message}`);

    // Failures the listener can act on are shown in the app language: when
    // every provider fails, the last provider's message reaches the screen.
    // The keys are literal so the language-file tests can find them.
    const ERROR_TEXT = {
        [PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_SOURCE]: ['settings.aiProviders.pronunciationLab.errors.unsupportedSource',
            "Pronunciation Lab can't read lyrics in this language."],
        [PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_TARGET]: ['settings.aiProviders.pronunciationLab.errors.unsupportedTarget',
            "Pronunciation Lab can't write pronunciation in this language."],
        [PRONUNCIATION_LAB_ERRORS.LOAD_FAILED]: ['settings.aiProviders.pronunciationLab.errors.loadFailed',
            "Couldn't download Pronunciation Lab data. Check your connection and try again."],
    };

    // Cancellations pass through untouched; the engine's English detail stays
    // on the cause for the console.
    function userFacingError(cause) {
        const entry = ERROR_TEXT[cause?.code];
        if (!entry) return cause;
        let message = '';
        try {
            message = getI18n?.()?.t?.(entry[0]) || '';
        } catch {
            message = '';
        }
        if (!message || message === entry[0]) message = entry[1];
        return Object.assign(new Error(message, { cause }), { code: cause.code });
    }

    async function convert(request) {
        try {
            return await engine.convertLines(request);
        } catch (cause) {
            throw userFacingError(cause);
        }
    }

    async function translateLyrics({ text, lang, wantSmartPhonetic, pronunciationNotation, sourceLang, onLine, signal }) {
        if (!wantSmartPhonetic) throw error('Translation is not supported');
        if (!text?.trim()) throw error('No text provided');

        const phonetic = await convert({
            lines: text.replace(/\r\n?/g, '\n').split('\n'),
            sourceLang,
            lang,
            notation: pronunciationNotation,
            signal,
            onLine: typeof onLine === 'function'
                ? (index, line) => onLine(index, line, { provider: ADDON_INFO.id, final: true })
                : undefined,
        });
        debug(`[${ADDON_INFO.name} Addon] Generated ${phonetic.length} lines with pronunciation-lab ${engine.version()}`);
        return { phonetic };
    }

    registerAiAddon({
        ...ADDON_INFO,
        supports: {
            translate: false, pronunciation: true, metadata: false, tmi: false, lyricsStudy: false,
            characterPronunciation: false, culturalAnnotations: false, wordSupplements: false,
            motionDirection: false, settingsAssistant: false,
        },
        async init() {
            debug(`[${ADDON_INFO.name} Addon] Initialized (v${ADDON_INFO.version})`);
        },
        getSettingsUI: () => null,
        async testConnection() {
            const [reading] = await convert({ lines: ['猫'], sourceLang: 'ja', lang: 'ko', notation: 'translation' });
            if (!reading?.trim() || reading === '猫') throw error('Connection test returned no pronunciation');
            return true;
        },
        translateLyrics,
    });
}
