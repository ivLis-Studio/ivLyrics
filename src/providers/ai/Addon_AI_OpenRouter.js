/**
 * OpenRouter AI Addon for ivLyrics
 * OpenRouter를 통한 다양한 AI 모델 사용 (번역, 발음, Research 생성)
 *
 * @author default
 * @version 1.0.1
 */

import { createResearchStreamCallbacks } from "./researchStreamCallbacks.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import { normalizePromptRequest, readProviderApiKeys } from "./aiProviderInputs.mjs";
import { createChatCompletionsClient } from "./chatCompletionsClient.mjs";
import { extractJSON, parseTextLines } from "./aiResponseParsing.mjs";

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
            motionDirection: true
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

    function aiText(key, fallback, params) {
        const path = `settings.aiProviders.${key}`;
        const value = getI18n()?.t?.(path, params);
        if (value && value !== path) return value;
        return params ? String(fallback).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match) : fallback;
    }

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
        const params = {};
        const useMaxTokens = getSetting('adv-maxTokens-enabled', true);
        if (useMaxTokens) {
            params.max_tokens = parseInt(getSetting('adv-maxTokens-value', 16000)) || 16000;
        }
        const useTemperature = getSetting('adv-temperature-enabled', true);
        if (useTemperature) {
            params.temperature = parseFloat(getSetting('adv-temperature-value', 0.3)) || 0.3;
        }
        return params;
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
                const renderTestRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('button', { type: 'button', onClick: handleTest, className: 'ai-addon-btn ai-addon-btn-primary' }, aiText('testConnection', 'Test Connection')),
                        testStatus && React.createElement('span', {
                            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                        }, testStatus)
                    );

                return React.createElement('div', { className: 'ai-addon-settings openrouter-settings' },
                    renderApiKeyRow(),
                    renderModelRow(),
                    (!isModelInList || customModel) &&
                    renderCustomModelRow(),
                    React.createElement(AdvancedParamsSection),
                    renderTestRow()
                );
            };

            function AdvancedParamsSection() {
                const [expanded, setExpanded] = useState(getSetting('adv-expanded', false));
                const [maxTokensEnabled, setMaxTokensEnabled] = useState(getSetting('adv-maxTokens-enabled', true));
                const [maxTokensValue, setMaxTokensValue] = useState(getSetting('adv-maxTokens-value', 16000));
                const [temperatureEnabled, setTemperatureEnabled] = useState(getSetting('adv-temperature-enabled', true));
                const [temperatureValue, setTemperatureValue] = useState(getSetting('adv-temperature-value', 0.3));

                const toggleExpanded = useCallback(() => {
                    const next = !expanded;
                    setExpanded(next);
                    setSetting('adv-expanded', next);
                }, [expanded]);

                return React.createElement('div', { className: 'ai-addon-setting ai-addon-advanced-params' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'ai-addon-advanced-toggle',
                        'aria-expanded': expanded,
                        onClick: toggleExpanded
                    },
                        React.createElement('span', { className: 'ai-addon-advanced-chevron', 'aria-hidden': 'true' }, '▶'),
                        aiText('advancedParams', 'Advanced API Parameters')
                    ),
                    expanded && React.createElement('div', { className: 'ai-addon-advanced-body' },
                        React.createElement('div', { className: 'ai-addon-advanced-row' },
                            React.createElement('label', { className: 'ai-addon-advanced-check' },
                                React.createElement('input', { type: 'checkbox', checked: maxTokensEnabled, onChange: (e) => { setMaxTokensEnabled(e.target.checked); setSetting('adv-maxTokens-enabled', e.target.checked); } }),
                                React.createElement('span', null, aiText('maxTokens', 'Max Tokens'))
                            ),
                            React.createElement('input', { type: 'number', value: maxTokensValue, disabled: !maxTokensEnabled, 'aria-label': aiText('maxTokens', 'Max Tokens'), onChange: (e) => { const v = parseInt(e.target.value) || 16000; setMaxTokensValue(v); setSetting('adv-maxTokens-value', v); } })
                        ),
                        React.createElement('div', { className: 'ai-addon-advanced-row' },
                            React.createElement('label', { className: 'ai-addon-advanced-check' },
                                React.createElement('input', { type: 'checkbox', checked: temperatureEnabled, onChange: (e) => { setTemperatureEnabled(e.target.checked); setSetting('adv-temperature-enabled', e.target.checked); } }),
                                React.createElement('span', null, aiText('temperature', 'Temperature'))
                            ),
                            React.createElement('input', { type: 'number', value: temperatureValue, disabled: !temperatureEnabled, 'aria-label': aiText('temperature', 'Temperature'), step: '0.1', min: '0', max: '2', onChange: (e) => { const v = parseFloat(e.target.value) || 0.3; setTemperatureValue(v); setSetting('adv-temperature-value', v); } })
                        ),
                        React.createElement('small', null, aiText('advancedParamsDesc', 'Uncheck to exclude parameter from API request.'))
                    )
                );
            }
        },

        async translateLyrics({ text, lang, wantSmartPhonetic, translationPrompt, phoneticPrompt, onLine, onStreamReset, signal }) {
            if (!text?.trim()) {
                throw new Error('No text provided');
            }

            const sourceLines = String(text).replace(/\r\n?/g, '\n').split('\n');
            const prompt = wantSmartPhonetic ? phoneticPrompt : translationPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central lyrics prompt is unavailable.');
            }
            const parseLines = rawResponse => parseTextLines(rawResponse, sourceLines, 'OpenRouter');

            const lines = onLine
                ? await callOpenRouterAPIStream(prompt, onLine, onStreamReset, undefined, parseLines, undefined, undefined, undefined, signal)
                : await callOpenRouterAPIRaw(prompt, undefined, parseLines, signal);

            return wantSmartPhonetic ? { phonetic: lines } : { translation: lines };
        },

        async generateCharacterPronunciation({ lines, characterPronunciationPrompt, signal }) {
            if (!Array.isArray(lines) || lines.length === 0) {
                throw new Error('No lines provided');
            }

            const prompt = characterPronunciationPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central character pronunciation prompt is unavailable.');
            }
            const result = await callOpenRouterAPI(prompt, undefined, signal);
            if (!result || !(Array.isArray(result.l) || Array.isArray(result.lines))) {
                throw new Error('Invalid character pronunciation response');
            }
            return result;
        },

        async translateMetadata({ title, artist, metadataPrompt, signal }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = metadataPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central metadata translation prompt is unavailable.');
            }
            const result = await callOpenRouterAPI(prompt, undefined, signal);

            return {
                translated: {
                    title: result?.translatedTitle || result?.title || title,
                    artist: result?.translatedArtist || result?.artist || artist
                },
                romanized: {
                    title: result?.romanizedTitle || title,
                    artist: result?.romanizedArtist || artist
                }
            };
        },

        async generateTMI({ title, artist, tmiPrompt, requestTimeoutMs, onResearchProgress, webSearch = true, signal }) {
            signal?.throwIfAborted();
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = tmiPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central TMI prompt is unavailable.');
            }
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

        async generateMotionDirection(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }
            const prompt = params.motionDirectionPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central motion direction prompt is unavailable.');
            }
            return await callOpenRouterAPI(prompt);
        },

        async generateLyricsStudy(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }

            const prompt = params.lyricsStudyPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central lyrics study prompt is unavailable.');
            }
            return await callOpenRouterAPI(prompt);
        },

        async generateCulturalAnnotations(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }
            const prompt = params.culturalAnnotationsPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central cultural annotations prompt is unavailable.');
            }
            return await callOpenRouterAPI(prompt, undefined, params.signal);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => registerAiAddon(OpenRouterAddon);

    registerAddon();

    debug('[OpenRouter Addon] Module loaded');
}
