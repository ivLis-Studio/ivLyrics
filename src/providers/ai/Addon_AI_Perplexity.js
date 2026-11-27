/**
 * Perplexity AI Addon for ivLyrics
 * Perplexity AI를 사용한 번역, 발음, Research 생성
 *
 * @author default
 * @version 2.0.0
 */

import { createPromptedAiCapabilities, requireResearchPrompt } from "./promptedAiCapabilities.mjs";
import { throwIfAiRequestAborted } from "./aiRequestCancellation.mjs";
import { requestWithAiKeys } from "./aiKeyRotation.mjs";
import { createResearchStreamCallbacks } from "./researchStreamCallbacks.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import {
    createAiAddonSettingAccess,
    createAiAdvancedParamsSection,
    renderAiConnectionTestRow,
    useAiApiKeyValue,
    renderAiModelRow,
    renderAiApiKeyRow,
    renderAiDefaultModelOptions,
    useAiModelPicker,
    testAiConnection,
} from "./aiProviderSettings.mjs";
import { createProviderText } from "../providerText.mjs";
import { normalizePromptRequest, readProviderApiKeys } from "./aiProviderInputs.mjs";
import { createStreamingOutput } from "./aiStreamingOutput.mjs";
import { consumeJsonSse, hasBufferedJsonBody } from "./aiEventStream.mjs";
import { extractJSON } from "./aiResponseParsing.mjs";

export default function initializePerplexityAddon(services = createBuiltinAiProviderServices(window)) {
    const { host: window, getManager, getAiRequest, getI18n, getSpicetify, debug, registerAiAddon } = services;

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'perplexity',
        name: 'Perplexity',
        author: 'default',
        description: {
            ko: 'Perplexity AI를 사용한 번역, 발음, 음악 리서치 (실시간 웹 검색 지원)',
            en: 'Translation, pronunciation, and music research using Perplexity AI (with real-time web search)',
            ja: 'Perplexity AIを使用した翻訳、発音、音楽リサーチ（リアルタイムウェブ検索対応）',
            'zh-CN': '使用 Perplexity AI 进行翻译、发音和音乐深度研究（支持实时网络搜索）',
            'zh-TW': '使用 Perplexity AI 進行翻譯、發音和音樂研究（支援即時網路搜尋）',
            hi: 'Perplexity AI का उपयोग करके अनुवाद, उच्चारण और संगीत अनुसंधान (रीयल-टाइम वेब खोज के साथ)',
            es: 'Traducción, pronunciación e investigación musical con Perplexity AI (incluye búsqueda web en tiempo real)',
            fr: 'Traduction, prononciation et recherche musicale avec Perplexity AI (recherche web en temps réel incluse)',
            ar: 'الترجمة والنطق والبحث الموسيقي باستخدام Perplexity AI (مع البحث على الويب في الوقت الفعلي)',
            fa: 'ترجمه، تلفظ و پژوهش موسیقی با استفاده از Perplexity AI (همراه با جستجوی وب بلادرنگ)',
            de: 'Übersetzung, Aussprache und Musikforschung mit Perplexity AI (inklusive Echtzeit-Websuche)',
            ru: 'Перевод, произношение и музыкальные исследования с помощью Perplexity AI (с веб-поиском в реальном времени)',
            sv: 'Översättning, uttal och musikforskning med Perplexity AI (inklusive webbsökning i realtid)',
            pt: 'Tradução, pronúncia e pesquisa musical com o Perplexity AI (inclui busca na web em tempo real)',
            bn: 'Perplexity AI ব্যবহার করে অনুবাদ, উচ্চারণ ও সঙ্গীত গবেষণা (রিয়েল-টাইম ওয়েব অনুসন্ধানসহ)',
            cs: 'Překlad, výslovnost a hudební výzkum pomocí Perplexity AI (včetně vyhledávání na webu v reálném čase)',
            it: 'Traduzione, pronuncia e ricerca musicale con Perplexity AI (inclusa la ricerca web in tempo reale)',
            th: 'การแปล คำอ่าน และการวิจัยด้านดนตรีโดยใช้ Perplexity AI (พร้อมการค้นหาเว็บแบบเรียลไทม์)',
            vi: 'Dịch thuật, phát âm và nghiên cứu âm nhạc bằng Perplexity AI (hỗ trợ tìm kiếm web theo thời gian thực)',
            id: 'Terjemahan, pelafalan, dan penelitian musik menggunakan Perplexity AI (dengan pencarian web real-time)',
            ms: 'Terjemahan, sebutan dan penyelidikan muzik menggunakan Perplexity AI (dengan carian web masa nyata)',
            tr: 'Perplexity AI ile çeviri, telaffuz ve müzik araştırması (gerçek zamanlı web araması desteğiyle)',
        },
        version: '2.0.0',
        apiKeyUrl: 'https://www.perplexity.ai/settings/api',
        supports: {
            translate: true,
            pronunciation: true,
            metadata: true,
            tmi: true,
            researchWebSearch: true,
            lyricsStudy: true,
            characterPronunciation: true,
            culturalAnnotations: true,
            motionDirection: true,
            settingsAssistant: true
        },
        models: [] // Dynamic from API
    };

    const BASE_URL = 'https://api.perplexity.ai';
    // Sonar Chat Completions support ended on September 27, 2026. Requests go to the Agent
    // API, whose model ids carry a provider prefix (perplexity/sonar, openai/...) and which
    // has no sonar-pro. GET /models is a 404; the model list is GET /v1/models.
    // https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview
    const AGENT_URL = BASE_URL + '/v1/agent';
    const MODELS_URL = BASE_URL + '/v1/models';
    // The migration guide's successor for sonar and sonar-pro when the contract is a model id.
    const DEFAULT_MODEL = 'perplexity/sonar';
    // Grounded answers cite as [web:1][web:2]; nothing in ivLyrics resolves those markers.
    const WEB_CITATION_MARKER = /\[web:\d+\]/g;

    /**
     * Bare Sonar names (sonar, sonar-pro, sonar-reasoning-pro, ...) do not exist on the Agent
     * API, so a saved id without a provider prefix falls back to the default model.
     */
    function normalizeModelId(model) {
        const id = String(model ?? '').trim();
        return id.includes('/') ? id : DEFAULT_MODEL;
    }

    function compareModels(a, b) {
        if (a.id === DEFAULT_MODEL || b.id === DEFAULT_MODEL) {
            return a.id === DEFAULT_MODEL ? (b.id === DEFAULT_MODEL ? 0 : -1) : 1;
        }
        const aPerplexity = a.id.startsWith('perplexity/');
        const bPerplexity = b.id.startsWith('perplexity/');
        if (aPerplexity !== bPerplexity) return aPerplexity ? -1 : 1;
        return a.id.localeCompare(b.id);
    }

    /**
     * Fetch the models the Agent API serves for this key.
     */
    async function fetchAvailableModels(apiKey) {
        if (!apiKey) return [];

        try {
            const response = await getAiRequest()(MODELS_URL, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                debug('[Perplexity Addon] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            const seen = new Set();
            const models = [];
            for (const row of Array.isArray(data?.data) ? data.data : []) {
                const id = String(row?.id ?? '').trim();
                if (!id.includes('/') || seen.has(id)) continue;
                seen.add(id);
                const name = String(row?.display_name || row?.name || '').trim();
                models.push({ id, name: name || id, context_window: row?.context_window });
            }
            models.sort(compareModels);

            if (models.length > 0) {
                models[0].default = true;
            }

            return models;
        } catch (e) {
            debug('[Perplexity Addon] Error fetching models:', e.message);
            return [];
        }
    }

    // ============================================
    // Helper Functions
    // ============================================

    const aiText = createProviderText(getI18n, 'settings.aiProviders.');
    const { getSetting, setSetting } = createAiAddonSettingAccess(getManager, ADDON_INFO.id);

    const getApiKeys = () => readProviderApiKeys(getSetting);

    function getSelectedModel() {
        return normalizeModelId(getSetting('model', DEFAULT_MODEL));
    }

    /** Rewrites a saved Sonar model id once, so the settings screen shows what is sent. */
    function migrateLegacyModelSetting() {
        const saved = getSetting('model', '');
        if (saved && normalizeModelId(saved) !== saved) {
            setSetting('model', normalizeModelId(saved));
        }
    }


    function getAdvancedRequestParams() {
        const params = {};
        const useMaxTokens = getSetting('adv-maxTokens-enabled', true);
        if (useMaxTokens) {
            params.max_output_tokens = parseInt(getSetting('adv-maxTokens-value', 16000)) || 16000;
        }
        const useTemperature = getSetting('adv-temperature-enabled', true);
        if (useTemperature) {
            params.temperature = parseFloat(getSetting('adv-temperature-value', 0.3)) || 0.3;
        }
        return params;
    }

    /**
     * The Agent API rejects any field it does not know with a 400, so the body carries only
     * mapped fields. It searches only when offered a tool, which lyrics tasks never need.
     */
    function buildAgentRequestBody(prompt, { stream = false, webSearch = false } = {}) {
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        const body = {
            model: getSelectedModel(),
            input: userPrompt,
            ...getAdvancedRequestParams(),
            store: false
        };
        if (systemPrompt) body.instructions = systemPrompt;
        if (webSearch) body.tools = [{ type: 'web_search' }];
        if (stream) body.stream = true;
        return body;
    }

    // ============================================
    // API Call Functions
    // ============================================

    function createPerplexityResponseError(reason, message = '') {
        const normalizedReason = String(reason ?? '').trim().toLowerCase() || 'unknown';
        const detail = String(message || '').trim();
        const error = new Error(`[Perplexity] Response rejected (${normalizedReason})${detail ? `: ${detail}` : ''}`);
        error.code = 'PERPLEXITY_RESPONSE_REJECTED';
        error.reason = normalizedReason;
        return error;
    }

    function agentErrorMessage(error, fallback) {
        if (!error) return fallback;
        if (typeof error === 'string') return error.trim() || fallback;
        return String(error.message || error.type || error.code || fallback);
    }

    /**
     * Reads a Response object. Failed and cancelled runs arrive as HTTP 200, so the status
     * decides; incomplete_details.reason replaces Sonar's finish_reason.
     */
    function readAgentResponseText(data) {
        const status = String(data?.status ?? '').trim().toLowerCase();
        if (!status && data?.error) {
            throw new Error('[Perplexity] ' + agentErrorMessage(data.error, 'API response error'));
        }
        if (status === 'failed' || status === 'cancelled') {
            throw new Error('[Perplexity] ' + agentErrorMessage(data?.error, 'Response ' + status));
        }
        if (status === 'incomplete') {
            throw createPerplexityResponseError(data?.incomplete_details?.reason || 'incomplete');
        }
        if (status !== 'completed') {
            throw createPerplexityResponseError(status || 'missing_status');
        }

        let text = '';
        for (const item of Array.isArray(data?.output) ? data.output : []) {
            if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
            for (const part of item.content) {
                if (part?.type === 'refusal') {
                    throw createPerplexityResponseError('refusal', part.refusal || 'Request refused');
                }
                if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text;
            }
        }
        if (!text && typeof data?.output_text === 'string') text = data.output_text;
        return text;
    }

    /**
     * Streams typed events. Exactly one terminal arrives (completed, failed, incomplete,
     * cancelled), or a bare error event; there is no [DONE] sentinel.
     */
    function createAgentStreamState() {
        const state = { receivedDelta: false, completed: false };
        state.consume = (event) => {
            const type = String(event?.type || '');
            if (type === 'response.output_text.delta') {
                const delta = typeof event.delta === 'string' ? event.delta : '';
                if (delta) state.receivedDelta = true;
                return delta;
            }
            if (type === 'response.output_text.done') {
                if (state.receivedDelta || typeof event.text !== 'string' || !event.text) return '';
                state.receivedDelta = true;
                return event.text;
            }
            if (type === 'response.refusal.done') {
                throw createPerplexityResponseError('refusal', event.refusal || 'Request refused');
            }
            if (type === 'response.completed') {
                state.completed = true;
                return state.receivedDelta || !event.response ? '' : readAgentResponseText(event.response);
            }
            if (type === 'response.failed' || type === 'response.incomplete' || type === 'response.cancelled') {
                const status = type.slice('response.'.length);
                readAgentResponseText(event.response?.status ? event.response : { ...event.response, status });
                throw createPerplexityResponseError(status);
            }
            if (type === 'error') {
                throw new Error('[Perplexity] ' + agentErrorMessage(event.error || event.message, 'Stream error'));
            }
            return '';
        };
        return state;
    }

    // 401 and request errors (400, 404, 413) will not change on retry; 403 and 429 belong to
    // the key, so the next key gets a try. Each error keeps the server's message.
    const PERMANENT_HTTP_STATUSES = new Set([400, 401, 404, 413]);
    const KEY_LIMIT_HTTP_STATUSES = new Set([403, 429]);

    async function createPerplexityHttpError(response) {
        let message = '';
        try {
            const data = await response.json();
            message = String(data?.error?.message || data?.message || '').trim();
        } catch (parseError) { }
        if (!message && response.status === 401) message = 'Invalid API key or permission denied.';
        const error = new Error('[Perplexity] ' + (message ? message + ' (HTTP ' + response.status + ')' : 'HTTP ' + response.status));
        error.status = response.status;
        return error;
    }

    /**
     * Some served models reject sampling parameters; their 400 names temperature, and the
     * request is sent once more without it.
     */
    async function postAgentRequest(apiKey, body, timeoutMs, signal) {
        const send = requestBody => {
            throwIfAiRequestAborted(signal);
            return getAiRequest()(AGENT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                },
                ...(signal ? { signal } : {}),
                body: JSON.stringify(requestBody)
            }, timeoutMs);
        };

        let response = await send(body);
        if (response.status === 400 && 'temperature' in body) {
            const error = await createPerplexityHttpError(response);
            if (!/temperature/i.test(error.message)) throw error;
            const { temperature, ...withoutTemperature } = body;
            response = await send(withoutTemperature);
        }
        if (!response.ok) throw await createPerplexityHttpError(response);
        return response;
    }

    async function readPerplexityStream(response, output, transformResult, webSearch) {
        const streamState = createAgentStreamState();

        if (hasBufferedJsonBody(response)) {
            // ivLyricsFetch's CORS fallback buffers a stream into one Response object.
            output.append(readAgentResponseText(await response.json()));
            streamState.completed = true;
        } else {
            await consumeJsonSse(response.body, {
                onEvent(event) {
                    output.append(streamState.consume(event));
                    if (streamState.completed) return false;
                },
                onChunk: output.emit,
            });
        }
        if (!streamState.completed) throw createPerplexityResponseError('missing_completion');

        output.emit(true);

        const finalText = webSearch ? output.text.replace(WEB_CITATION_MARKER, '') : output.text;
        if (!finalText.trim()) throw new Error('[Perplexity] Empty response from streaming API');
        return output.finish(finalText, transformResult);
    }

    async function requestPerplexity(prompt, { attempts, transformResult, signal, stream, timeoutMs, webSearch = false }) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            throw new Error(stream
                ? '[Perplexity] API key is required.'
                : '[Perplexity] API key is required. Please configure your API key in settings.');
        }

        return requestWithAiKeys({
            apiKeys, attempts, signal,
            exhaustedMessage: '[Perplexity] All API keys and retries exhausted',
            createOutput: stream && (() => createStreamingOutput({
                ...stream,
                onResetError: error => debug('[Perplexity Addon] Failed to reset provisional stream:', error?.message),
            })),
            async run({ key, output }) {
                const body = buildAgentRequestBody(prompt, { stream: !!stream, webSearch });
                const response = await postAgentRequest(key, body, timeoutMs, signal);
                if (output) return await readPerplexityStream(response, output, transformResult, webSearch);
                const text = readAgentResponseText(await response.json());
                if (!text.trim()) throw new Error('[Perplexity] Empty response from API');
                return typeof transformResult === 'function' ? transformResult(text) : text;
            },
            onError(error, { keyNumber, attemptNumber, output, willRetry }) {
                const permanent = PERMANENT_HTTP_STATUSES.has(error.status);
                if (output) output.reset(permanent || !willRetry ? 'failed' : 'retry', error);
                else debug(`[Perplexity Addon] Key ${keyNumber}, attempt ${attemptNumber} failed:`, error.message);
                if (permanent) return 'stop';
                if (KEY_LIMIT_HTTP_STATUSES.has(error.status)) return 'rotate';
            },
        });
    }

    async function callPerplexityAPIRaw(prompt, attempts = getManager()?.getProviderRequestAttempts?.() ?? 3, transformResult = null, signal) {
        return requestPerplexity(prompt, { attempts, transformResult, signal });
    }

    async function callPerplexityAPIStream(
        prompt,
        onLine,
        onStreamReset,
        attempts = getManager()?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        timeoutMs = getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        { webSearch = false, signal } = {}
    ) {
        return requestPerplexity(prompt, {
            attempts, transformResult, signal, timeoutMs, webSearch, stream: { onLine, onStreamReset, onRawChunk },
        });
    }

    async function callPerplexityAPI(prompt, maxRetries = getManager()?.getProviderRequestAttempts?.() ?? 3, signal) {
        const rawText = await callPerplexityAPIRaw(prompt, maxRetries, null, signal);
        return extractJSON(rawText);
    }

    // ============================================
    // Main Addon Object
    // ============================================

    const {
        generateMotionDirection: requestMotionDirection, ...promptedCapabilities
    } = createPromptedAiCapabilities({
        provider: 'Perplexity',
        allowNullMetadata: true,
        requestLyrics: ({ prompt, onLine, onStreamReset, parseLines, signal }) => onLine
            ? callPerplexityAPIStream(prompt, onLine, onStreamReset, undefined, parseLines, undefined, undefined, { signal })
            : callPerplexityAPIRaw(prompt, undefined, parseLines, signal),
        requestJson: (prompt, signal) => callPerplexityAPI(prompt, undefined, signal),
    });

    const PerplexityAddon = {
        ...ADDON_INFO,

        getSettingsUI() {
            const React = getSpicetify().React;
            const { useState } = React;
            const AdvancedParamsSection = createAiAdvancedParamsSection({ React, getSetting, setSetting, aiText });

            return function PerplexitySettings() {
                const [apiKeys, setApiKeys] = useAiApiKeyValue(React, getSetting);
                const [selectedModel, setSelectedModel] = useState(() => getSelectedModel());
                const [testStatus, setTestStatus] = useState('');

                const handleApiKeyChange = (e) => {
                    const val = e.target.value;
                    setApiKeys(val);
                    setSetting('api-keys', val);
                };

                const handleModelChange = (e) => {
                    const val = e.target.value;
                    setSelectedModel(val);
                    setSetting('model', val);
                };

                const handleTest = () => testAiConnection(callPerplexityAPIRaw, setTestStatus, aiText);

                const { availableModels, modelsLoading, loadModels } = useAiModelPicker(React, {
                    apiKeys, getApiKeys, fetchModels: fetchAvailableModels, logName: 'Perplexity',
                    onLoaded(models) {
                        if (models.length === 0) return;
                        ADDON_INFO.models = models;
                        // A retired or unknown saved id would otherwise stay selected unseen.
                        const current = getSelectedModel();
                        if (!models.some(model => model.id === current)) {
                            const next = (models.find(model => model.id === DEFAULT_MODEL) || models[0]).id;
                            setSelectedModel(next);
                            setSetting('model', next);
                        }
                    }
                });

                const hasApiKey = getApiKeys().length > 0;

                const renderApiKeyRow = () => renderAiApiKeyRow(React, {
                    aiText, value: apiKeys, onChange: handleApiKeyChange, placeholder: 'pplx-...',
                    onOpen: () => window.open(ADDON_INFO.apiKeyUrl, '_blank')
                });
                const renderModelRow = () => renderAiModelRow(React, {
                    aiText,
                    select: React.createElement('select', {
                        value: selectedModel,
                        onChange: handleModelChange,
                        disabled: modelsLoading
                    },
                        renderAiDefaultModelOptions(React, {
                            aiText, loading: modelsLoading, models: availableModels, selectedModel, hasApiKey
                        })
                    ),
                    onRefresh: loadModels,
                    loading: modelsLoading,
                    refreshDisabled: modelsLoading || !hasApiKey,
                    below: [
                        React.createElement('small', null, aiText('perplexityAgentModels', 'Models load automatically from the Perplexity Agent API with your key. Music research also searches the web.'))
                    ]
                });
                const renderTestRow = () => renderAiConnectionTestRow(React, { onTest: handleTest, testStatus, aiText });

                return React.createElement('div', { className: 'ai-addon-settings perplexity-settings' },
                    renderApiKeyRow(),
                    renderModelRow(),
                    React.createElement(AdvancedParamsSection),
                    renderTestRow()
                );
            };
        },

        ...promptedCapabilities,

        async generateMotionDirection(params) {
            return requestMotionDirection(params, () => params.motionDirectionPrompt);
        },

        async generateTMI({ title, artist, tmiPrompt, requestTimeoutMs, onResearchProgress, webSearch = true, signal }) {
            const prompt = requireResearchPrompt('Perplexity', title, artist, tmiPrompt, signal);
            const { onRawChunk, resetProgress } = createResearchStreamCallbacks(getManager, onResearchProgress, signal);
            return await callPerplexityAPIStream(
                prompt,
                null,
                resetProgress,
                1,
                extractJSON,
                requestTimeoutMs,
                onRawChunk,
                { webSearch: webSearch !== false, signal }
            );
        },
    };

    // ============================================
    // Registration
    // ============================================

    registerAiAddon(PerplexityAddon, migrateLegacyModelSetting);

    debug('[Perplexity Addon] Module loaded');
}
