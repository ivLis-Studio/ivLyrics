/**
 * ChatGPT AI Addon for ivLyrics
 * OpenAI ChatGPT를 사용한 번역, 발음, Research 생성
 *
 * @author default
 * @version 1.0.2
 */

import { createPromptedAiCapabilities, requireResearchPrompt } from "./promptedAiCapabilities.mjs";
import { createResearchStreamCallbacks } from "./researchStreamCallbacks.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import { createOpenAiTransport } from "./openAiTransport.mjs";
import { createOpenAiConnections, ensureRequestTargets, normalizeBaseUrl } from "./openAiConnections.mjs";
import { createOpenAiModelCatalog } from "./openAiModelCatalog.mjs";
import { createOpenAiRequestBody, mergeRequestBody } from "./openAiRequestBody.mjs";
import { extractJSON } from "./aiResponseParsing.mjs";
import { createOpenAiSettings } from "./openAiSettings.mjs";

export function createOpenAICompatibleAddon(config = {}, services = createBuiltinAiProviderServices(window)) {
    const { getManager, getAiRequest, getI18n, getSpicetify, debug, registerAiAddon } = services;

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'chatgpt',
        name: 'OpenAI ChatGPT',
        author: 'default',
        description: {
            ko: 'OpenAI ChatGPT를 사용한 번역, 발음, 음악 리서치 (OpenAI 호환 API 지원)',
            en: 'Translation, pronunciation, and music research using OpenAI ChatGPT (supports OpenAI-compatible APIs)',
            ja: 'OpenAI ChatGPTを使用した翻訳、発音、音楽リサーチ（OpenAI互換API対応）',
            'zh-CN': '使用 OpenAI ChatGPT 进行翻译、发音和音乐深度研究（支持 OpenAI 兼容 API）',
            'zh-TW': '使用 OpenAI ChatGPT 進行翻譯、發音和音樂研究（支援 OpenAI 相容 API）',
            hi: 'OpenAI ChatGPT का उपयोग करके अनुवाद, उच्चारण और संगीत अनुसंधान (OpenAI-संगत API समर्थित)',
            es: 'Traducción, pronunciación e investigación musical con OpenAI ChatGPT (admite API compatibles con OpenAI)',
            fr: 'Traduction, prononciation et recherche musicale avec OpenAI ChatGPT (prend en charge les API compatibles OpenAI)',
            ar: 'الترجمة والنطق والبحث الموسيقي باستخدام OpenAI ChatGPT (يدعم واجهات API المتوافقة مع OpenAI)',
            fa: 'ترجمه، تلفظ و پژوهش موسیقی با استفاده از OpenAI ChatGPT (پشتیبانی از APIهای سازگار با OpenAI)',
            de: 'Übersetzung, Aussprache und Musikforschung mit OpenAI ChatGPT (unterstützt OpenAI-kompatible APIs)',
            ru: 'Перевод, произношение и музыкальные исследования с помощью OpenAI ChatGPT (поддерживаются API, совместимые с OpenAI)',
            sv: 'Översättning, uttal och musikforskning med OpenAI ChatGPT (stöder OpenAI-kompatibla API:er)',
            pt: 'Tradução, pronúncia e pesquisa musical com o OpenAI ChatGPT (suporta APIs compatíveis com a OpenAI)',
            bn: 'OpenAI ChatGPT ব্যবহার করে অনুবাদ, উচ্চারণ ও সঙ্গীত গবেষণা (OpenAI-সামঞ্জস্যপূর্ণ API সমর্থিত)',
            cs: 'Překlad, výslovnost a hudební výzkum pomocí OpenAI ChatGPT (podporuje API kompatibilní s OpenAI)',
            it: 'Traduzione, pronuncia e ricerca musicale con OpenAI ChatGPT (supporta API compatibili con OpenAI)',
            th: 'การแปล คำอ่าน และการวิจัยด้านดนตรีโดยใช้ OpenAI ChatGPT (รองรับ API ที่เข้ากันได้กับ OpenAI)',
            vi: 'Dịch thuật, phát âm và nghiên cứu âm nhạc bằng OpenAI ChatGPT (hỗ trợ API tương thích OpenAI)',
            id: 'Terjemahan, pelafalan, dan penelitian musik menggunakan OpenAI ChatGPT (mendukung API yang kompatibel dengan OpenAI)',
            ms: 'Terjemahan, sebutan dan penyelidikan muzik menggunakan OpenAI ChatGPT (menyokong API yang serasi dengan OpenAI)',
            tr: 'OpenAI ChatGPT ile çeviri, telaffuz ve müzik araştırması (OpenAI uyumlu API desteği)',
        },
        version: '1.0.1',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        // 지원 기능
        supports: {
            translate: true,    // 가사 번역
            pronunciation: true, // 가사 발음
            metadata: true,     // 메타데이터 번역
            tmi: true,          // TMI 생성
            researchWebSearch: true,
            lyricsStudy: true,  // 학습 모드 생성
            characterPronunciation: true,
            culturalAnnotations: true,
            motionDirection: true,
            settingsAssistant: true
        },
        // Capabilities are toggled per endpoint inside this addon's settings UI;
        // the provider-level toggle in the Settings row stays clickable and acts
        // as the master switch (ceiling) over those endpoint choices.
        perEndpointCapabilities: true,
        // 하드코딩된 모델 목록 (fallback용)
        // models: [
        //     { id: 'gpt-5.2-2025-12-11', name: 'GPT-5.2', default: true },
        //     { id: 'gpt-5-mini-2025-08-07', name: 'GPT-5 Mini' },
        //     { id: 'gpt-5-nano-2025-08-07', name: 'GPT-5 Nano' }
        // ]
        models: [] // API에서 동적으로 로드
    };

    Object.assign(ADDON_INFO, config.info || {});
    const DEFAULT_OPENAI_BASE_URL = config.baseUrl || 'https://api.openai.com/v1';

    // ============================================
    // Helper Functions
    // ============================================

    function getSetting(key, defaultValue = null) {
        return getManager()?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    function setSetting(key, value) {
        if (typeof getManager()?.setAddonSetting === 'function') {
            getManager().setAddonSetting(ADDON_INFO.id, key, value);
        }
    }

    function t(key, fallback, params) {
        const value = getI18n()?.t?.(key, params);
        if (value && value !== key) return value;
        return params ? String(fallback).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match) : fallback;
    }

    const connections = createOpenAiConnections({
        addonId: ADDON_INFO.id, defaultBaseUrl: DEFAULT_OPENAI_BASE_URL, getManager, getSetting, setSetting,
    });
    const { getRequestTargets, migrateStaleMasterSwitches } = connections;
    const { fetchAvailableModels, getModels } = createOpenAiModelCatalog({
        defaultBaseUrl: DEFAULT_OPENAI_BASE_URL, getAiRequest, getApiKeys: connections.getApiKeys, getSetting, debug,
    });
    const { getRequestBodyMergePatch, getDefaultRequestBodyMergeJson } = createOpenAiRequestBody({
        readRequestDefaults: () => config.requestDefaults, getSetting,
    });

    const {
        isResponsesApiUnsupported, requestFromTargets, callChatGPTAPIRaw, callResponsesAPIStream, callChatGPTAPIStream, callChatGPTAPI, testSingleTarget,
    } = createOpenAiTransport({
        getAiRequest, readRequestAttempts: () => getManager()?.getProviderRequestAttempts?.() ?? 3, debug,
        normalizeBaseUrl, defaultBaseUrl: DEFAULT_OPENAI_BASE_URL, extractJSON,
        getRequestTargets, ensureRequestTargets, getRequestBodyMergePatch, mergeRequestBody,
    });

    // ============================================
    // Addon Implementation
    // ============================================

    const ChatGPTAddon = {
        ...ADDON_INFO,

        async init() {
            try {
                migrateStaleMasterSwitches();
            } catch (error) {
                debug(`[ChatGPT Addon] Master switch migration skipped: ${error?.message || error}`);
            }
            debug(`[ChatGPT Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 연결 테스트 (기본 + 추가 엔드포인트 전체)
         */
        async testConnection() {
            const targets = ensureRequestTargets(getRequestTargets());
            let lastError = null;
            for (const target of targets) {
                if (!target.model) continue;
                try {
                    await testSingleTarget(target);
                    return;
                } catch (e) {
                    // Fail over to the next saved connection like the
                    // released withProviderConnections path did; the final
                    // error keeps the failing target's label for diagnosis.
                    lastError = new Error(`[${target.label}] ${e.message}`);
                }
            }
            if (lastError) throw lastError;
        },

        getSettingsUI: createOpenAiSettings({
            info: ADDON_INFO, defaultBaseUrl: DEFAULT_OPENAI_BASE_URL, getSpicetify, getSetting, setSetting,
            t, connections, fetchAvailableModels, getDefaultRequestBodyMergeJson, testSingleTarget, debug,
            openApiKeyPage: () => services.host.open(ADDON_INFO.apiKeyUrl, '_blank'),
        }),

        ...createPromptedAiCapabilities({
            provider: 'OpenAI ChatGPT',
            lineParserName: 'ChatGPT',
            requestLyrics: ({ prompt, onLine, onStreamReset, parseLines, capability, signal }) => onLine
                ? requestFromTargets({
                    prompt, transformResult: parseLines, capability, signal, callbacks: { onLine, onStreamReset },
                })
                : callChatGPTAPIRaw(prompt, undefined, parseLines, undefined, capability, signal),
            forwardLineGenerationSignal: true,
            requestJson: (prompt, signal, capability) =>
                callChatGPTAPI(prompt, undefined, undefined, capability, signal),
        }),



        async generateTMI({ title, artist, tmiPrompt, requestTimeoutMs, onResearchProgress, webSearch = true, signal }) {
            const prompt = requireResearchPrompt('OpenAI ChatGPT', title, artist, tmiPrompt, signal);
            // Research uses SSE so an upstream proxy receives response bytes
            // while the long document is generated instead of closing an idle
            // non-streaming request before the client-side timeout expires.
            const { onRawChunk, resetProgress } = createResearchStreamCallbacks(getManager, onResearchProgress, signal);
            const request = ADDON_INFO.supports.researchWebSearch && webSearch !== false
                ? callResponsesAPIStream
                : callChatGPTAPIStream;
            if (webSearch === false) {
                return await request(
                    prompt,
                    null,
                    resetProgress,
                    1,
                    extractJSON,
                    requestTimeoutMs,
                    onRawChunk,
                    'tmi',
                    null,
                    signal
                );
            }
            // Split TMI targets by web search support: Responses API targets
            // first, then plain chat completion targets. Endpoints without
            // researchWebSearch (e.g. local OpenAI-compatible servers) cannot
            // serve /responses, so they are served without live search instead
            // of failing the whole request.
            const tmiTargets = ensureRequestTargets(getRequestTargets('tmi'), 'tmi');
            const searchTargets = tmiTargets.filter(target => target.researchWebSearch !== false);
            const plainTargets = tmiTargets.filter(target => target.researchWebSearch === false);
            let responsesAttempted = false;
            if (searchTargets.length > 0 && plainTargets.length === 0) {
                try {
                    responsesAttempted = true;
                    return await callResponsesAPIStream(
                        prompt,
                        null,
                        resetProgress,
                        1,
                        extractJSON,
                        requestTimeoutMs,
                        onRawChunk,
                        'tmi',
                        searchTargets,
                        signal
                    );
                } catch (searchError) {
                    signal?.throwIfAborted();
                    // Hosts without a Responses API (e.g. NVIDIA NIM answers
                    // /responses with 404) fall back to plain chat instead of
                    // failing the whole request. Other errors still throw.
                    if (!isResponsesApiUnsupported(searchError)) throw searchError;
                    debug('[ChatGPT Addon] Responses API unsupported, falling back to plain chat:', searchError?.message);
                }
            }
            if (!responsesAttempted && searchTargets.length > 0) {
                try {
                    return await callResponsesAPIStream(
                        prompt,
                        null,
                        resetProgress,
                        1,
                        extractJSON,
                        requestTimeoutMs,
                        onRawChunk,
                        'tmi',
                        searchTargets,
                        signal
                    );
                } catch (searchError) {
                    signal?.throwIfAborted();
                    debug('[ChatGPT Addon] Web search targets failed, falling back to plain targets:', searchError?.message);
                }
            }
            return await callChatGPTAPIStream(
                prompt,
                null,
                resetProgress,
                1,
                extractJSON,
                requestTimeoutMs,
                onRawChunk,
                'tmi',
                plainTargets.length > 0 ? plainTargets : tmiTargets,
                signal
            );
        },
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => registerAiAddon(ChatGPTAddon);

    registerAddon();

    return ChatGPTAddon;
}

export default function initializeChatGPTAddon(services = createBuiltinAiProviderServices(window)) {
    const createAddon = (config) => createOpenAICompatibleAddon(config, services);
    // Existing extensions can still create an OpenAI-compatible provider.
    services.host.createOpenAICompatibleAddon = createAddon;
    return createAddon();
}
