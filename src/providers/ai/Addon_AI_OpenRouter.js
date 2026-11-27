/**
 * OpenRouter AI Addon for ivLyrics
 * OpenRouter를 통한 다양한 AI 모델 사용 (번역, 발음, Research 생성)
 *
 * @author default
 * @version 1.0.1
 */

import { createPromptedAiCapabilities, requireResearchPrompt } from "./promptedAiCapabilities.mjs";
import { createResearchStreamCallbacks } from "./researchStreamCallbacks.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import { createAiAdvancedParamsSection, readAiAdvancedRequestParams, renderAiConnectionTestRow } from "./aiProviderSettings.mjs";
import { createProviderText } from "../providerText.mjs";
import { normalizePromptRequest, readProviderApiKeys } from "./aiProviderInputs.mjs";
import { createChatCompletionsClient } from "./chatCompletionsClient.mjs";
import { extractJSON } from "./aiResponseParsing.mjs";

export default function initializeOpenRouterAddon(services = createBuiltinAiProviderServices(window)) {
    const { host: window, getManager, getAiRequest, getI18n, getSpicetify, debug, registerAiAddon } = services;

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'openrouter',
        name: 'OpenRouter',
        author: 'default',
        description: {
            ko: 'OpenRouter를 통해 다양한 AI 모델 사용 (Claude, GPT, Gemini, Llama 등)',
            en: 'Access multiple AI models via OpenRouter (Claude, GPT, Gemini, Llama, etc.)',
            ja: 'OpenRouterを通じて様々なAIモデルを使用（Claude、GPT、Gemini、Llamaなど）',
            'zh-CN': '通过 OpenRouter 使用多种 AI 模型（Claude、GPT、Gemini、Llama 等）',
            'zh-TW': '透過 OpenRouter 使用多種 AI 模型（Claude、GPT、Gemini、Llama 等）',
            hi: 'OpenRouter के ज़रिए कई AI मॉडल इस्तेमाल करें (Claude, GPT, Gemini, Llama आदि)',
            es: 'Accede a múltiples modelos de IA a través de OpenRouter (Claude, GPT, Gemini, Llama, etc.)',
            fr: 'Accédez à de nombreux modèles d’IA via OpenRouter (Claude, GPT, Gemini, Llama, etc.)',
            ar: 'الوصول إلى نماذج ذكاء اصطناعي متعددة عبر OpenRouter (Claude وGPT وGemini وLlama وغيرها)',
            fa: 'دسترسی به مدل‌های متنوع هوش مصنوعی از طریق OpenRouter (Claude، GPT، Gemini، Llama و غیره)',
            de: 'Zugriff auf zahlreiche KI-Modelle über OpenRouter (Claude, GPT, Gemini, Llama usw.)',
            ru: 'Доступ к множеству моделей ИИ через OpenRouter (Claude, GPT, Gemini, Llama и др.)',
            sv: 'Få tillgång till många AI-modeller via OpenRouter (Claude, GPT, Gemini, Llama m.fl.)',
            pt: 'Acesse vários modelos de IA pelo OpenRouter (Claude, GPT, Gemini, Llama e outros)',
            bn: 'OpenRouter-এর মাধ্যমে একাধিক AI মডেল ব্যবহার করুন (Claude, GPT, Gemini, Llama ইত্যাদি)',
            cs: 'Přístup k řadě modelů AI přes OpenRouter (Claude, GPT, Gemini, Llama atd.)',
            it: 'Accedi a diversi modelli AI tramite OpenRouter (Claude, GPT, Gemini, Llama, ecc.)',
            th: 'เข้าถึงโมเดล AI หลากหลายผ่าน OpenRouter (Claude, GPT, Gemini, Llama ฯลฯ)',
            vi: 'Truy cập nhiều mô hình AI qua OpenRouter (Claude, GPT, Gemini, Llama, v.v.)',
            id: 'Akses berbagai model AI melalui OpenRouter (Claude, GPT, Gemini, Llama, dll.)',
            ms: 'Akses pelbagai model AI melalui OpenRouter (Claude, GPT, Gemini, Llama, dsb.)',
            tr: 'OpenRouter üzerinden birçok yapay zeka modeline erişin (Claude, GPT, Gemini, Llama vb.)',
        },
        version: '1.0.1',
        apiKeyUrl: 'https://openrouter.ai/keys',
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
        models: []
    };

    const BASE_URL = 'https://openrouter.ai/api/v1';
    const DEFAULT_RESEARCH_MAX_TOKENS = 16_000;
    const openRouterModelCapabilities = new Map();

    const asPositiveInteger = (value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    /**
     * OpenRouter API에서 사용 가능한 모델 목록을 가져옴
     */
    async function fetchAvailableModels(apiKey) {
        if (!apiKey) return [];

        try {
            const response = await getAiRequest()(`${BASE_URL}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                debug('[OpenRouter Addon] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            const models = (data.data || [])
                .filter(m => m.id && !m.id.includes('vision') && !m.id.includes('image'))
                .map(m => ({
                    id: m.id,
                    name: m.name || m.id,
                    context_length: asPositiveInteger(m.context_length),
                    max_completion_tokens: asPositiveInteger(
                        m.top_provider?.max_completion_tokens ?? m.max_completion_tokens
                    )
                }))
                .sort((a, b) => {
                    // 인기 모델 우선
                    const priority = ['anthropic/claude', 'openai/gpt-4', 'openai/gpt-3.5', 'google/gemini', 'meta-llama', 'mistralai'];
                    const aIdx = priority.findIndex(p => a.id.includes(p));
                    const bIdx = priority.findIndex(p => b.id.includes(p));
                    const aPri = aIdx === -1 ? 999 : aIdx;
                    const bPri = bIdx === -1 ? 999 : bIdx;
                    if (aPri !== bPri) return aPri - bPri;
                    return a.id.localeCompare(b.id);
                });

            if (models.length > 0) {
                models[0].default = true;
            }
            for (const model of models) {
                openRouterModelCapabilities.set(model.id, model);
            }

            return models;
        } catch (e) {
            debug('[OpenRouter Addon] Error fetching models:', e.message);
            return [];
        }
    }

    // ============================================
    // Helper Functions
    // ============================================

    const aiText = createProviderText(getI18n, 'settings.aiProviders.');

    function getSetting(key, defaultValue = null) {
        return getManager()?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    function setSetting(key, value) {
        getManager()?.setAddonSetting(ADDON_INFO.id, key, value);
    }

    const getApiKeys = () => readProviderApiKeys(getSetting);

    function getSelectedModel() {
        return getSetting('model', 'anthropic/claude-3.5-sonnet');
    }


    function getAdvancedRequestParams() {
        return readAiAdvancedRequestParams(getSetting);
    }

    async function getResearchMaxTokens() {
        const selectedModel = getSelectedModel();
        let capabilities = openRouterModelCapabilities.get(selectedModel);
        if (!capabilities) {
            const models = await fetchAvailableModels(getApiKeys()[0]);
            capabilities = models.find(model => model.id === selectedModel);
        }

        return asPositiveInteger(capabilities?.max_completion_tokens)
            || asPositiveInteger(getAdvancedRequestParams().max_tokens)
            || DEFAULT_RESEARCH_MAX_TOKENS;
    }

    function buildPromptMessages(prompt) {
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        return [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: userPrompt }
        ];
    }

    // ============================================
    // API Call Functions
    // ============================================

    const chatCompletions = createChatCompletionsClient({
        provider: 'OpenRouter', rejectionCode: 'OPENROUTER_RESPONSE_REJECTED',
        endpoint: `${BASE_URL}/chat/completions`, getAiRequest, debug,
        extraHeaders: { 'HTTP-Referer': 'https://github.com/ivLis-STUDIO/ivLyrics', 'X-Title': 'ivLyrics' },
    });

    function callOpenRouterAPIRaw(prompt, maxRetries = getManager()?.getProviderRequestAttempts?.() ?? 3, transformResult = null, signal) {
        const apiKeys = getApiKeys();
        const model = apiKeys.length ? getSelectedModel() : null;
        return chatCompletions.request({
            apiKeys, attempts: maxRetries, transformResult, signal,
            buildBody: () => ({ model, messages: buildPromptMessages(prompt), ...getAdvancedRequestParams() }),
        });
    }

    function callOpenRouterAPIStream(
        prompt,
        onLine,
        onStreamReset,
        maxRetries = getManager()?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        requestTimeoutMs = getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        requestOverrides = {},
        signal,
    ) {
        const apiKeys = getApiKeys();
        const model = apiKeys.length ? (getSelectedModel()) : null;
        return chatCompletions.request({
            apiKeys, attempts: maxRetries, transformResult, signal,
            timeoutMs: requestTimeoutMs,
            stream: { onLine, onStreamReset, onRawChunk },
            buildBody: () => ({
                model, messages: buildPromptMessages(prompt), ...getAdvancedRequestParams(), ...requestOverrides, stream: true,
            }),
        });
    }

    async function callOpenRouterAPI(prompt, maxRetries = getManager()?.getProviderRequestAttempts?.() ?? 3, signal) {
        return await callOpenRouterAPIRaw(prompt, maxRetries, extractJSON, signal);
    }

    // ============================================
    // Main Addon Object
    // ============================================

    const OpenRouterAddon = {
        ...ADDON_INFO,

        getSettingsUI() {
            const React = getSpicetify().React;
            const { useState, useEffect, useCallback } = React;
            const AdvancedParamsSection = createAiAdvancedParamsSection({ React, getSetting, setSetting, aiText });

            return function OpenRouterSettings() {
                const initialApiKeys = getSetting('api-keys', '') || getSetting('api-key', '');
                const [apiKeys, setApiKeys] = useState(
                    Array.isArray(initialApiKeys) ? JSON.stringify(initialApiKeys) : initialApiKeys
                );
                const [selectedModel, setSelectedModel] = useState(getSetting('model', 'anthropic/claude-3.5-sonnet'));
                const [customModel, setCustomModel] = useState(getSetting('custom-model', ''));
                const [availableModels, setAvailableModels] = useState([]);
                const [modelsLoading, setModelsLoading] = useState(false);
                const [testStatus, setTestStatus] = useState('');

                const loadModels = useCallback(async () => {
                    const keys = getApiKeys();
                    if (keys.length === 0) {
                        setAvailableModels([]);
                        return;
                    }
                    setModelsLoading(true);
                    try {
                        const models = await fetchAvailableModels(keys[0]);
                        setAvailableModels(models);
                    } catch (e) {
                        console.error('[OpenRouter Addon] Failed to load models:', e);
                    }
                    setModelsLoading(false);
                }, [apiKeys]);

                useEffect(() => {
                    const keys = getApiKeys();
                    if (keys.length > 0) {
                        loadModels();
                    } else {
                        setAvailableModels([]);
                    }
                }, [apiKeys]);

                const handleApiKeyChange = (e) => {
                    const val = e.target.value;
                    setApiKeys(val);
                    setSetting('api-keys', val);
                };

                const handleModelChange = (e) => {
                    const val = e.target.value;
                    setSelectedModel(val);
                    setSetting('model', val);
                    if (val !== '__custom__') {
                        setCustomModel('');
                        setSetting('custom-model', '');
                    }
                };

                const handleCustomModelChange = (e) => {
                    const val = e.target.value;
                    setCustomModel(val);
                    setSetting('custom-model', val);
                    if (val) {
                        setSetting('model', val);
                    }
                };

                const handleTest = async () => {
                    setTestStatus(aiText('testingConnection', 'Testing...'));
                    try {
                        const result = await callOpenRouterAPIRaw('Say "Hello" in one word.');
                        setTestStatus(result
                            ? '✓ ' + aiText('connectionSuccess', 'Connection successful')
                            : '✗ ' + aiText('emptyResponse', 'Empty response'));
                    } catch (e) {
                        setTestStatus(`✗ ${e.message}`);
                    }
                };



                const isModelInList = availableModels.some(m => m.id === selectedModel);
                const hasApiKey = getApiKeys().length > 0;

                const renderApiKeyRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('apiKey', 'API Key(s)')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('input', {
                                type: 'text',
                                value: apiKeys,
                                onChange: handleApiKeyChange,
                                placeholder: 'sk-or-...'
                            }),
                            React.createElement('button', {
                                type: 'button',
                                onClick: () => window.open(ADDON_INFO.apiKeyUrl, '_blank'),
                                className: 'ai-addon-btn ai-addon-btn-secondary'
                            }, aiText('getApiKey', 'Get API Key'))
                        ),
                        React.createElement('small', null, aiText('apiKeyRotationDesc', 'Enter a single key or JSON array for rotation'))
                    );
                const renderModelRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('model', 'Model')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('select', {
                                value: isModelInList ? selectedModel : '__custom__',
                                onChange: handleModelChange,
                                disabled: modelsLoading || availableModels.length === 0
                            },
                                modelsLoading && React.createElement('option', { value: '' }, aiText('loadingModels', 'Loading models...')),
                                !modelsLoading && availableModels.length === 0 && React.createElement('option', { value: '' }, hasApiKey ? aiText('noModels', 'No models found') : aiText('enterApiKeyFirst', 'Enter API key first')),
                                availableModels.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name)),
                                !isModelInList && React.createElement('option', { value: '__custom__' }, aiText('customModel', 'Custom Model'))
                            ),
                            React.createElement('button', {
                                type: 'button',
                                onClick: loadModels,
                                className: 'ai-addon-btn ai-addon-btn-secondary ai-addon-connection-icon',
                                disabled: modelsLoading || !hasApiKey,
                                'aria-label': aiText('refreshModels', 'Refresh model list'),
                                title: aiText('refreshModels', 'Refresh model list')
                            }, modelsLoading ? '...' : '↻')
                        ),
                        availableModels.length > 0 && React.createElement('small', null, aiText('modelsAvailable', '{count} models available', { count: availableModels.length }))
                    );
                const renderCustomModelRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('modelId', 'Custom Model ID')),
                        React.createElement('input', { type: 'text', value: customModel, onChange: handleCustomModelChange, placeholder: 'anthropic/claude-3-opus', 'aria-label': aiText('modelId', 'Custom Model ID') })
                    );
                const renderTestRow = () => renderAiConnectionTestRow(React, { onTest: handleTest, testStatus, aiText });

                return React.createElement('div', { className: 'ai-addon-settings openrouter-settings' },
                    renderApiKeyRow(),
                    renderModelRow(),
                    (!isModelInList || customModel) &&
                    renderCustomModelRow(),
                    React.createElement(AdvancedParamsSection),
                    renderTestRow()
                );
            };
        },

        ...createPromptedAiCapabilities({
            provider: 'OpenRouter',
            allowNullMetadata: true,
            requestLyrics: ({ prompt, onLine, onStreamReset, parseLines, signal }) => onLine
                ? callOpenRouterAPIStream(prompt, onLine, onStreamReset, undefined, parseLines, undefined, undefined, undefined, signal)
                : callOpenRouterAPIRaw(prompt, undefined, parseLines, signal),
            requestJson: (prompt, signal) => callOpenRouterAPI(prompt, undefined, signal),
        }),



        async generateTMI({ title, artist, tmiPrompt, requestTimeoutMs, onResearchProgress, webSearch = true, signal }) {
            const prompt = requireResearchPrompt('OpenRouter', title, artist, tmiPrompt, signal);
            const { onRawChunk, resetProgress } = createResearchStreamCallbacks(getManager, onResearchProgress, signal);
            const requestOverrides = {
                max_tokens: await getResearchMaxTokens(),
                ...(webSearch === false
                    ? { tools: [], plugins: [{ id: 'web', enabled: false }] }
                    : {
                        tools: [{
                            type: 'openrouter:web_search',
                            parameters: {
                                max_results: 8,
                                max_total_results: 16,
                                search_context_size: 'medium'
                            }
                        }],
                        tool_choice: 'required'
                    })
            };
            return await callOpenRouterAPIStream(
                prompt,
                null,
                resetProgress,
                1,
                extractJSON,
                requestTimeoutMs,
                onRawChunk,
                requestOverrides,
                signal
            );
        },
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => registerAiAddon(OpenRouterAddon);

    registerAddon();

    debug('[OpenRouter Addon] Module loaded');
}
