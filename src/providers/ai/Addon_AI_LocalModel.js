/**
 * Local AI addon for ivLyrics
 * Runs a dedicated translation model (Tencent Hy-MT2 1.8B GGUF) on this device
 * through wllama (llama.cpp WebAssembly with WebGPU). The model only translates,
 * so this provider never generates pronunciation. The UI shows quality tiers
 * instead of model or file names.
 *
 * @author default
 * @version 1.0.0
 */

import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { getPlaybackPositionService, getPlayableLyricsUri } from "#ivlyrics/core/playbackPositionService.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import { createLocalModelEngine } from "./localModelEngine.mjs";
import { createLocalModelScheduler } from "./localModelScheduler.mjs";
import { createLocalModelSettings } from "./localModelSettings.mjs";

export default function initializeLocalModelAddon(services = createBuiltinAiProviderServices(window)) {
    const { host: window, getManager, getI18n, getConfig, getSpicetify, getTrackIdentity, debug, registerAiAddon } = services;

    const ADDON_ID = 'local-ai';
    const MODEL_BASE_URL = 'https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/main/';
    // Quality tiers, lightest first; each maps to one quantization of the same model.
    const QUALITY_TIERS = Object.freeze([
        Object.freeze({ id: 'light', labelKey: 'tierLight', fallback: 'Local Light', file: 'Hy-MT2-1.8B-Q4_K_M.gguf', size: 1133080448 }),
        Object.freeze({ id: 'medium', labelKey: 'tierMedium', fallback: 'Local Medium', file: 'Hy-MT2-1.8B-Q6_K.gguf', size: 1474785120 }),
        Object.freeze({ id: 'high', labelKey: 'tierHigh', fallback: 'Local High', file: 'Hy-MT2-1.8B-Q8_0.gguf', size: 1908528192 }),
    ]);
    const DEFAULT_QUALITY = 'high';
    const IDLE_UNLOAD_OPTIONS = Object.freeze([10, 30, 60, 0]);
    const DEFAULT_IDLE_UNLOAD_MINUTES = 10;
    // Lines translated together keep their lyric context; small blocks keep the
    // first result quick and stay far below the 4096-token context.
    const BLOCK_MAX_LINES = 8;
    const BLOCK_MAX_CHARACTERS = 480;
    // The manager abandons a provider call after 95 s; stop starting new work
    // before that so an abandoned request never keeps the engine busy.
    const JOB_BUDGET_MS = 90_000;
    // Sampling recommended for Hy-MT2 1.8B by the model card.
    const SAMPLING = Object.freeze({ temperature: 0.7, top_p: 0.6, top_k: 20, penalty_repeat: 1.05 });
    const PROTECTED_PART_PATTERN = /^\s*\[.*\]\s*$/;
    // Hy-MT2 prompts use full English language names.
    const TARGET_LANGUAGE_NAMES = Object.freeze({
        ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese', 'zh-cn': 'Chinese', 'zh-hans': 'Chinese', 'zh-sg': 'Chinese',
        'zh-tw': 'Traditional Chinese', 'zh-hk': 'Traditional Chinese', 'zh-hant': 'Traditional Chinese',
        es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ru: 'Russian', pt: 'Portuguese',
        hi: 'Hindi', ar: 'Arabic', fa: 'Persian', bn: 'Bengali', cs: 'Czech', th: 'Thai', tr: 'Turkish',
        vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', pl: 'Polish', nl: 'Dutch', uk: 'Ukrainian',
        he: 'Hebrew', tl: 'Filipino', fil: 'Filipino', km: 'Khmer', my: 'Burmese', gu: 'Gujarati',
        ur: 'Urdu', te: 'Telugu', mr: 'Marathi', ta: 'Tamil', bo: 'Tibetan', kk: 'Kazakh',
        mn: 'Mongolian', ug: 'Uyghur', yue: 'Cantonese',
    });

    const ADDON_INFO = {
        id: ADDON_ID,
        name: 'Local AI',
        author: 'default',
        description: {
            ko: '이 기기에서 직접 실행되는 번역 전용 로컬 AI입니다. API 키가 필요 없고 가사가 외부로 전송되지 않습니다.',
            en: 'Translation-only AI that runs locally on this device. No API key needed, and lyrics never leave your device.',
            ja: 'このデバイス上で動作する翻訳専用のローカルAIです。APIキーは不要で、歌詞がお使いのデバイスの外に送信されることはありません。',
            'zh-CN': '在此设备上运行的翻译专用本地 AI。无需 API 密钥，歌词绝不会离开您的设备。',
            'zh-TW': '在此裝置上執行的翻譯專用本機 AI。不需要 API 金鑰，歌詞絕不會離開您的裝置。',
            es: 'IA local solo para traducción que se ejecuta en este dispositivo. No necesita clave de API y las letras nunca salen de tu dispositivo.',
            fr: 'IA locale dédiée à la traduction, exécutée sur cet appareil. Aucune clé API requise, et les paroles ne quittent jamais votre appareil.',
            de: 'Lokale KI nur für Übersetzungen, die direkt auf diesem Gerät läuft. Kein API-Schlüssel nötig, und Songtexte verlassen nie Ihr Gerät.',
            it: 'AI locale solo per la traduzione, eseguita su questo dispositivo. Non serve alcuna chiave API e i testi non lasciano mai il tuo dispositivo.',
            ru: 'Локальный ИИ только для перевода, работающий прямо на этом устройстве. Ключ API не нужен, а тексты песен никогда не покидают ваше устройство.',
            sv: 'Lokal AI enbart för översättning som körs på den här enheten. Ingen API-nyckel behövs, och låttexterna lämnar aldrig din enhet.',
            pt: 'IA local só para tradução, executada neste dispositivo. Não precisa de chave de API, e as letras nunca saem do seu dispositivo.',
            hi: 'केवल अनुवाद के लिए बना स्थानीय AI, जो इसी डिवाइस पर चलता है। किसी API कुंजी की ज़रूरत नहीं, और लिरिक्स कभी आपके डिवाइस से बाहर नहीं जाते।',
            ar: 'ذكاء اصطناعي محلي للترجمة فقط يعمل على هذا الجهاز. لا يحتاج إلى مفتاح API، ولا تغادر كلمات الأغاني جهازك أبدًا.',
            fa: 'هوش مصنوعی محلی ویژهٔ ترجمه که روی همین دستگاه اجرا می‌شود. به کلید API نیازی نیست و متن ترانه‌ها هرگز از دستگاه شما خارج نمی‌شود.',
            bn: 'এই ডিভাইসে চলা, শুধু অনুবাদের জন্য তৈরি স্থানীয় এআই। কোনো API কী লাগে না, এবং লিরিক্স কখনও আপনার ডিভাইসের বাইরে যায় না।',
            cs: 'Místní AI pouze pro překlad, která běží přímo v tomto zařízení. Nepotřebuje klíč API a texty písní nikdy neopustí vaše zařízení.',
            th: 'AI ในเครื่องสำหรับการแปลโดยเฉพาะ ซึ่งทำงานบนอุปกรณ์นี้ ไม่ต้องใช้คีย์ API และเนื้อเพลงจะไม่ถูกส่งออกไปนอกอุปกรณ์ของคุณ',
            tr: 'Bu cihazda çalışan, yalnızca çeviri için yerel yapay zeka. API anahtarı gerekmez ve şarkı sözleri cihazınızdan asla çıkmaz.',
            vi: 'AI cục bộ chỉ dùng để dịch, chạy ngay trên thiết bị này. Không cần khóa API và lời bài hát không bao giờ rời khỏi thiết bị của bạn.',
            id: 'AI lokal khusus terjemahan yang berjalan di perangkat ini. Tanpa kunci API, dan lirik tidak pernah keluar dari perangkat Anda.',
            ms: 'AI setempat khusus untuk terjemahan yang berjalan pada peranti ini. Tiada kunci API diperlukan, dan lirik tidak pernah keluar dari peranti anda.'
        },
        version: '1.0.0',
        supports: {
            translate: true,
            pronunciation: false,
            metadata: false,
            tmi: false,
            lyricsStudy: false,
            characterPronunciation: false,
            culturalAnnotations: false,
            wordSupplements: false
        }
    };

    // ============================================
    // Helpers
    // ============================================

    const formatText = (value, params) => (params
        ? String(value).replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match))
        : String(value));

    function t(key, fallback, params) {
        let value = '';
        try {
            value = getI18n()?.t?.(`settings.aiProviders.localModel.${key}`, params) || '';
        } catch {
            value = '';
        }
        return formatText(value || fallback, params);
    }

    const getSetting = (key, fallback) => {
        try {
            const value = getManager()?.getAddonSetting?.(ADDON_ID, key, fallback);
            return value === undefined || value === null ? fallback : value;
        } catch {
            return fallback;
        }
    };
    const setSetting = (key, value) => getManager()?.setAddonSetting?.(ADDON_ID, key, value);

    const getQualityTier = () => QUALITY_TIERS.find((tier) => tier.id === getSetting('quality', DEFAULT_QUALITY))
        || QUALITY_TIERS.find((tier) => tier.id === DEFAULT_QUALITY);
    const getModelUrl = (tier = getQualityTier()) => MODEL_BASE_URL + tier.file;
    const getDevicePreference = () => (getSetting('device', 'auto') === 'cpu' ? 'cpu' : 'auto');
    const getIdleUnloadMinutes = () => {
        const minutes = Number(getSetting('idle-unload-minutes', DEFAULT_IDLE_UNLOAD_MINUTES));
        return IDLE_UNLOAD_OPTIONS.includes(minutes) ? minutes : DEFAULT_IDLE_UNLOAD_MINUTES;
    };
    // Raw error text (URLs, file names) only feeds the debug log and error classification.
    const rawText = (error) => String(error?.message || error || '');

    function languageLabel(lang) {
        try {
            return new Intl.DisplayNames([getI18n()?.getCurrentLanguage?.() || 'en'], { type: 'language' }).of(lang) || lang;
        } catch {
            return lang;
        }
    }

    function targetLanguageName(lang) {
        const code = String(lang || 'en').trim().replace(/_/g, '-').toLowerCase();
        return TARGET_LANGUAGE_NAMES[code] || TARGET_LANGUAGE_NAMES[code.split('-')[0]] || null;
    }

    const unsupportedLanguageText = (lang) => t('unsupportedLanguage', 'The local model cannot translate into {language}.', { language: languageLabel(lang) });

    function resolveTargetLanguage(lang) {
        const name = targetLanguageName(lang);
        if (!name) throw localError('unsupportedLanguage', unsupportedLanguageText(lang));
        return name;
    }

    // The language lyrics are translated into, resolved the way the app resolves it.
    function getCurrentTargetLanguage() {
        let configured = getConfig()?.visual?.['translate:target-language'];
        if (!configured) {
            try {
                configured = window.localStorage?.getItem?.('ivLyrics:visual:translate:target-language') || null;
            } catch {
                configured = null;
            }
        }
        return configured && configured !== 'auto' ? configured : (getI18n()?.getCurrentLanguage?.() || 'en');
    }

    // ============================================
    // Errors: people read a short localized explanation; engine and network
    // details (URLs, file names) only go to the debug log.
    // ============================================

    function localError(kind, message, extra) {
        const error = new Error(message);
        error.localModelKind = kind;
        if (extra) Object.assign(error, extra);
        return error;
    }

    function logDetail(context, error) {
        try {
            if (!writeRuntimeDebug(window, `[Local AI] ${context}:`, error)) {
                console.warn(`[Local AI] ${context}:`, rawText(error));
            }
        } catch {
            // Logging must never break the provider.
        }
    }

    function classifyFailure(error, stage) {
        if (error?.localModelKind) return { kind: error.localModelKind, status: error.httpStatus };
        const name = String(error?.name || '');
        const text = rawText(error);
        if (name === 'AbortError') return { kind: 'cancelled' };
        if (name === 'TimeoutError') return { kind: 'timeout' };
        // wllama reports a refused download as "Failed to fetch <url>: HTTP <status>".
        const http = text.match(/\bHTTP\s*(\d{3})\b/i);
        if (http) return { kind: 'http', status: Number(http[1]) };
        if (name === 'QuotaExceededError' || /quota|no space|not enough (?:disk |storage )?space|disk (?:is )?full/i.test(text)) {
            return { kind: 'storage' };
        }
        if (/out of memory|\boom\b|could not allocate|allocation failed|cannot enlarge memory/i.test(text)) return { kind: 'memory' };
        if (/webgpu|\bgpu\b|device (?:was )?lost/i.test(text)) return { kind: 'webgpu' };
        const network = /failed to fetch|network ?error|load failed/i.test(text);
        // The model itself is local, so a failed fetch while loading means the engine files.
        if (stage === 'engine' || (stage === 'load' && network) || /dynamically imported module|webassembly|\bwasm\b/i.test(text)) {
            return { kind: 'engine' };
        }
        if (network || (stage === 'download' && name === 'TypeError')) return { kind: 'network' };
        return { kind: stage === 'load' ? 'load' : 'unknown' };
    }

    function failureMessage(kind, status) {
        switch (kind) {
            case 'network':
                return t('errorNetwork', "Couldn't connect to the download server. Check your internet connection and try again.");
            case 'http':
                if (status === 429 || status === 503) {
                    return t('errorHttpBusy', 'The download server is busy right now (HTTP {status}). Wait a few minutes, then try again.', { status });
                }
                if (status === 401 || status === 403) {
                    return t('errorHttpBlocked', 'The download server refused the request (HTTP {status}). Try again later, or turn off any VPN or proxy you use.', { status });
                }
                return t('errorHttp', 'The download server returned an error (HTTP {status}). Try again later.', { status });
            case 'storage':
                return t('errorStorage', "There isn't enough storage space for the model. Free up disk space or choose a lighter quality, then try again.");
            case 'engine':
                return t('errorEngine', "The translation engine couldn't be loaded. Check your internet connection and try again.");
            case 'load':
                return t('errorLoad', "The model couldn't be loaded. Delete it and download it again.");
            case 'memory':
                return t('errorMemory', "There isn't enough memory to run the model. Close other apps or choose a lighter quality, then try again.");
            case 'webgpu':
                return t('errorWebGpu', 'The graphics processor (WebGPU) stopped responding. Try again, or set Processor to CPU only.');
            case 'timeout':
                return t('errorTimeout', 'Translation took too long on this device and was stopped. A lighter quality translates faster.');
            default:
                return t('errorUnknown', 'Something went wrong with the local model. Try again.');
        }
    }

    // Turns any failure into an error whose message is safe to show.
    function friendlyError(error, stage) {
        if (error?.localModelKind) return error;
        const { kind, status } = classifyFailure(error, stage);
        logDetail(`${stage} failed`, error);
        const extra = status ? { httpStatus: status } : {};
        if (kind === 'timeout') extra.name = 'TimeoutError';
        if (kind === 'cancelled') extra.name = 'AbortError';
        return localError(kind, failureMessage(kind, status), extra);
    }

    const timeoutError = () => localError('timeout', failureMessage('timeout'), { name: 'TimeoutError' });
    const cancelledError = () => localError('cancelled', failureMessage('cancelled'), { name: 'AbortError' });
    // Lets the manager tell a stopped request from a failure: nobody waits for that song any more.
    const supersededError = () => localError('superseded',
        t('errorSuperseded', 'This translation was stopped because a newer song needs the local model.'),
        { name: 'AbortError', superseded: true });

    // ============================================
    // Status shared by the settings card and the engine
    // ============================================

    const {
        ensureLoaded, unloadModel, downloadModel, cancelDownload, removeModel, isModelLoaded,
        getSnapshot, refreshStatus, subscribe, setState,
    } = createLocalModelEngine({
        host: window, getQualityTier, getModelUrl, qualityTiers: QUALITY_TIERS, getDevicePreference,
        t, localError, friendlyError, cancelledError, rawText, logDetail,
        onUnload: () => clearIdleTimer(),
    });

    // ============================================
    // Scheduler: one model, so requests share it, one block at a time. Settings
    // actions run first, then the song that is playing, then lyrics on screen,
    // then prefetching for upcoming songs. A newer song stops older work for
    // songs nobody is looking at any more.
    // ============================================

    // Requests carry their song's translation cache id; compare it with the song playing now.
    function getPlayingTrackId() {
        try {
            const snapshot = getPlaybackPositionService(window)?.getPlayerPlaybackSnapshot?.();
            const uri = getPlayableLyricsUri(snapshot, getSpicetify()?.Player?.data?.item?.uri);
            if (!uri) return null;
            const identity = getTrackIdentity();
            return identity?.getTranslationCacheId(uri) || null;
        } catch {
            return null;
        }
    }

    const {
        startJob, finishJob, runTask, dropQueuedBlocks, clearIdleTimer, rescheduleIdleUnload,
    } = createLocalModelScheduler({
        getPlayingTrackId, supersededError, timeoutError, jobBudgetMs: JOB_BUDGET_MS, getIdleUnloadMinutes,
        isModelLoaded,
        unloadModel,
    });

    // ============================================
    // Translation
    // ============================================

    const buildLinePrompt = (text, language) => `Translate the following text into ${language}. Note that you should only output the translated result without any additional explanation:\n\n${text}`;
    const buildBlockPrompt = (lines, language) => `Please accurately translate the following text into ${language}.\nYou must retain the exact same number of delimiters in the translation. Strictly do not omit, escape, or translate these symbols, and pay close attention to their placement.\n\n${lines.join('\n')}`;
    const outputBudget = (text) => Math.min(1536, 48 + Math.ceil(String(text).length * 3));

    // wllama 3.8.1 forwards llama.cpp's final streaming timings. predicted_ms
    // measures generation separately from prompt_ms; neither loading nor queueing is included.
    function completionPerformance(timings) {
        const tokens = timings?.predicted_n;
        const milliseconds = timings?.predicted_ms;
        if (!Number.isSafeInteger(tokens) || tokens <= 0 || !Number.isFinite(milliseconds) || milliseconds <= 0) return null;
        const seconds = milliseconds / 1000;
        const tokensPerSecond = tokens / seconds;
        return Number.isFinite(tokensPerSecond) ? { tokens, seconds, tokensPerSecond } : null;
    }

    async function complete(instance, prompt, maxTokens, signal) {
        if (signal?.aborted) throw cancelledError();
        let text = '';
        let finishReason = null;
        let performance = null;
        await instance.createChatCompletion({
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            ...SAMPLING,
            stream: true,
            stream_options: { include_usage: true },
            // Lets a song nobody waits for any more give the engine back mid-block.
            abortSignal: signal,
            onData(chunk) {
                const choice = chunk?.choices?.[0];
                if (typeof choice?.delta?.content === 'string') text += choice.delta.content;
                if (choice?.finish_reason) finishReason = choice.finish_reason;
                // The usage/timings-only final chunk can have an empty choices array.
                if (chunk?.timings) performance = completionPerformance(chunk.timings);
            }
        });
        if (signal?.aborted) throw cancelledError();
        return { text, finishReason, performance };
    }

    async function translateBlock(instance, parts, language, signal, onPerformance) {
        if (parts.length > 1) {
            const { text, finishReason } = await complete(instance, buildBlockPrompt(parts, language), outputBudget(parts.join('\n')), signal);
            const lines = text.replace(/\r\n?/g, '\n').trim().split('\n').map((line) => line.trim());
            if (finishReason !== 'length' && lines.length === parts.length && lines.every(Boolean)) return lines;
        }
        // The block lost or merged a line: translate each line on its own instead.
        const translated = [];
        for (const part of parts) {
            const { text, performance } = await complete(instance, buildLinePrompt(part, language), outputBudget(part), signal);
            const line = text.replace(/\s*\n+\s*/g, ' ').trim();
            if (!line) throw new Error('[Local AI] The model returned an empty line.');
            onPerformance?.(performance);
            translated.push(line);
        }
        return translated;
    }

    function buildBlocks(parts) {
        const blocks = [];
        let block = [];
        let characters = 0;
        for (const part of parts) {
            if (block.length && (block.length >= BLOCK_MAX_LINES || characters + part.length > BLOCK_MAX_CHARACTERS)) {
                blocks.push(block);
                block = [];
                characters = 0;
            }
            block.push(part);
            characters += part.length + 1;
        }
        if (block.length) blocks.push(block);
        return blocks;
    }

    // wllama names its runtime errors 'RuntimeError', like WebAssembly traps.
    const needsFreshEngine = (error) => error?.name === 'RuntimeError' || error?.name === 'WllamaRuntimeError'
        || /out of memory|memory access|device (?:was )?lost/i.test(rawText(error));

    async function translateLyricsLines(text, language, onLine, job) {
        job.assertActive();
        // Simultaneous vocal parts share a line as "a / b" and are translated separately.
        const translations = new Map();
        const rowsByPart = new Map();
        const streaming = typeof onLine === 'function';
        const rows = String(text).replace(/\r\n?/g, '\n').split('\n').map((line, row) =>
            line.split(' / ').map((part) => {
                const trimmed = part.trim();
                if (!trimmed || PROTECTED_PART_PATTERN.test(part)) return { literal: trimmed ? part : '' };
                if (!translations.has(trimmed)) translations.set(trimmed, null);
                if (streaming) {
                    if (!rowsByPart.has(trimmed)) rowsByPart.set(trimmed, new Set());
                    rowsByPart.get(trimmed).add(row);
                }
                return { key: trimmed };
            })
        );
        const rowText = (parts) => parts.map(({ literal, key }) => key ? translations.get(key) : literal).join(' / ');
        const emitted = new Array(rows.length).fill(false);
        const emitRowWhenReady = (row) => {
            job.assertActive();
            const parts = rows[row];
            if (emitted[row] || parts.some(({ key }) => key && !translations.get(key))) return;
            emitted[row] = true;
            try {
                onLine(row, rowText(parts), { provider: ADDON_ID, final: true });
            } catch (error) {
                console.warn('[Local AI] Line callback failed:', rawText(error));
            }
        };
        if (streaming) rows.forEach((_, row) => emitRowWhenReady(row));
        // Every block is queued at once so the scheduler sees the whole song: the
        // playing song then runs all of its blocks before lower priority work.
        const blocks = buildBlocks(translations.keys());
        const results = blocks.map((block) => runTask(async () => {
            job.assertActive();
            if (job.failure) throw job.failure;
            try {
                const instance = await ensureLoaded();
                job.assertActive();
                return await translateBlock(instance, block, language, job.signal,
                    job.kind === 'test' ? (performance) => { job.performance = performance; } : null);
            } catch (error) {
                // Cancellation keeps the engine unless a runtime failure also occurred.
                if (needsFreshEngine(error)) await unloadModel();
                job.assertActive();
                job.failure ||= error;
                throw error;
            }
        }, job));
        // Failures surface in block order below; the rest are only dropped work.
        results.forEach((result) => result.catch(() => {}));
        try {
            for (const [index, block] of blocks.entries()) {
                const translated = await results[index];
                job.assertActive();
                block.forEach((part, offset) => translations.set(part, translated[offset]));
                if (streaming) {
                    const readyCandidates = new Set();
                    for (const part of block) {
                        for (const row of rowsByPart.get(part)) readyCandidates.add(row);
                    }
                    // Preserve the callback order of the previous per-block scan.
                    [...readyCandidates].sort((a, b) => a - b).forEach(emitRowWhenReady);
                }
            }
        } catch (error) {
            dropQueuedBlocks(job, error);
            throw error;
        }
        return rows.map(rowText);
    }

    async function runTestTranslation(onJob) {
        const lang = getCurrentTargetLanguage();
        const language = resolveTargetLanguage(lang);
        const sample = String(lang).toLowerCase().startsWith('ja') ? 'The night is still young.' : '今夜はまだ始まったばかり';
        const started = Date.now();
        const job = startJob({ kind: 'test' });
        try {
            onJob?.(job);
            const [line] = await Promise.race([translateLyricsLines(sample, language, null, job), job.whenStopped]);
            if (job.stopped) throw job.stopReason;
            return { sample, line, seconds: (Date.now() - started) / 1000, performance: job.performance || null };
        } finally {
            finishJob(job);
        }
    }

    // ============================================
    // Addon
    // ============================================

    const addon = {
        ...ADDON_INFO,

        async init() {
            debug(`[Local AI] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            return createLocalModelSettings({
                React: getSpicetify().React, t,
                getSnapshot, subscribe, refreshStatus, getQualityTier, getDevicePreference,
                getIdleUnloadMinutes, getCurrentTargetLanguage, targetLanguageName, unsupportedLanguageText,
                setSetting, runTask, unloadModel, removeModel, downloadModel, cancelDownload,
                rescheduleIdleUnload, runTestTranslation, cancelledError, friendlyError,
                reportRemovalError: (error) => setState({ phase: 'error', error: friendlyError(error, 'cache').message }),
                qualityTiers: QUALITY_TIERS, idleUnloadOptions: IDLE_UNLOAD_OPTIONS,
            });
        },

        async testConnection() {
            let result;
            try {
                result = await runTestTranslation();
            } catch (error) {
                throw friendlyError(error, 'translate');
            }
            if (!result.line) throw localError('unknown', failureMessage('unknown'));
            return true;
        },

        // The manager passes the song's trackId; only lyrics on screen pass onLine.
        async translateLyrics({ text, lang, wantSmartPhonetic, onLine, trackId, signal }) {
            if (wantSmartPhonetic) {
                throw new Error('[Local AI] Pronunciation generation is not supported');
            }
            if (!text?.trim()) {
                throw new Error('[Local AI] No text provided');
            }
            // An unsupported language fails before it can stop another song's work.
            const language = resolveTargetLanguage(lang);
            if (signal?.aborted) throw signal.reason;
            const job = startJob({ kind: 'lyrics', trackId, text, onScreen: typeof onLine === 'function' });
            const cancel = () => job.stop(signal.reason || supersededError());
            signal?.addEventListener('abort', cancel, { once: true });
            if (signal?.aborted) cancel();
            const work = translateLyricsLines(text, language, onLine, job);
            work.catch(() => {});
            try {
                // A newer song ends this request at once, even while its block still runs.
                return { translation: await Promise.race([work, job.whenStopped]) };
            } catch (error) {
                if (signal?.aborted) throw signal.reason || error;
                throw friendlyError(error, 'translate');
            } finally {
                signal?.removeEventListener('abort', cancel);
                finishJob(job);
            }
        }
    };

    registerAiAddon(addon);
}
