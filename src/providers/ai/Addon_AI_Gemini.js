/**
 * Gemini AI Addon for ivLyrics
 * Google Gemini AI를 사용한 번역, 발음, Research 생성
 *
 * @author default
 * @version 1.0.1
 */

import { createPromptedAiCapabilities, requireResearchPrompt } from "./promptedAiCapabilities.mjs";
import { createResearchStreamCallbacks } from "./researchStreamCallbacks.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import {
    renderAiAdvancedParams,
    renderAiConnectionTestRow,
    useAiApiKeyValue,
    renderAiModelRow,
    renderAiApiKeyRow,
} from "./aiProviderSettings.mjs";
import { createProviderText } from "../providerText.mjs";
import { readProviderApiKeys } from "./aiProviderInputs.mjs";
import { extractJSON } from "./aiResponseParsing.mjs";
import {
    DEFAULT_GEMINI_OUTPUT_TOKENS, GEMINI_BASE_URL, createGeminiModelCatalog, getGeminiGenerationConfig,
} from "./geminiModelCatalog.mjs";
import { createGeminiTransport } from "./geminiTransport.mjs";

export default function initializeGeminiAddon(services = createBuiltinAiProviderServices(window)) {
    const { host: window, getManager, getAiRequest, getI18n, getSpicetify, debug, registerAiAddon } = services;

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'gemini',
        name: 'Google Gemini',
        author: 'default',
        description: {
            ko: 'Google Gemini AI를 사용한 번역, 발음, 음악 리서치',
            en: 'Translation, pronunciation, and music research using Google Gemini AI',
            ja: 'Google Gemini AIを使用した翻訳、発音、音楽リサーチ',
            'zh-CN': '使用 Google Gemini AI 进行翻译、发音和音乐深度研究',
            'zh-TW': '使用 Google Gemini AI 進行翻譯、發音和音樂研究',
            hi: 'Google Gemini AI का उपयोग करके अनुवाद, उच्चारण और संगीत अनुसंधान',
            es: 'Traducción, pronunciación e investigación musical con Google Gemini AI',
            fr: 'Traduction, prononciation et recherche musicale avec Google Gemini AI',
            ar: 'الترجمة والنطق والبحث الموسيقي باستخدام Google Gemini AI',
            fa: 'ترجمه، تلفظ و پژوهش موسیقی با استفاده از Google Gemini AI',
            de: 'Übersetzung, Aussprache und Musikforschung mit Google Gemini AI',
            ru: 'Перевод, произношение и музыкальные исследования с помощью Google Gemini AI',
            sv: 'Översättning, uttal och musikforskning med Google Gemini AI',
            pt: 'Tradução, pronúncia e pesquisa musical com o Google Gemini AI',
            bn: 'Google Gemini AI ব্যবহার করে অনুবাদ, উচ্চারণ ও সঙ্গীত গবেষণা',
            cs: 'Překlad, výslovnost a hudební výzkum pomocí Google Gemini AI',
            it: 'Traduzione, pronuncia e ricerca musicale con Google Gemini AI',
            th: 'การแปล คำอ่าน และการวิจัยด้านดนตรีโดยใช้ Google Gemini AI',
            vi: 'Dịch thuật, phát âm và nghiên cứu âm nhạc bằng Google Gemini AI',
            id: 'Terjemahan, pelafalan, dan penelitian musik menggunakan Google Gemini AI',
            ms: 'Terjemahan, sebutan dan penyelidikan muzik menggunakan Google Gemini AI',
            tr: 'Google Gemini AI ile çeviri, telaffuz ve müzik araştırması',
        },
        version: '1.0.1',
        apiKeyUrl: 'https://aistudio.google.com/apikey',
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
        // 하드코딩된 모델 목록 (fallback용)
        // models: [
        //     { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', default: true },
        //     { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
        //     { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
        //     { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        //     { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
        // ]
        models: [] // API에서 동적으로 로드
    };

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
        return getSetting('model', null);
    }

    function getBaseUrl() {
        return getSetting('base-url', GEMINI_BASE_URL) || GEMINI_BASE_URL;
    }


    const getGenerationConfig = () => getGeminiGenerationConfig(getSetting, getSelectedModel);
    const { getModels, getResearchGenerationConfig } = createGeminiModelCatalog({
        getAiRequest, getSetting, getApiKeys, getBaseUrl, getSelectedModel, getGenerationConfig, debug,
    });
    const { callGeminiAPIRaw, callGeminiAPIStream, callGeminiAPI } = createGeminiTransport({
        getAiRequest, getApiKeys, getBaseUrl, getSelectedModel, getGenerationConfig, debug,
        readRequestAttempts: () => getManager()?.getProviderRequestAttempts?.() ?? 3,
    });

    function markGeminiWebSearchFailure(error) {
        if (!error || error.reason === 'MAX_TOKENS') return error;
        if (/\b(?:google_search|web[\s_-]*search)\b|\btools?\b[^\n]*(?:unsupported|not supported|unavailable|invalid|unknown)/i.test(String(error.message || ''))) {
            error.researchWebSearchFailed = true;
        }
        return error;
    }

    // ============================================
    // Addon Implementation
    // ============================================

    const {
        generateMotionDirection: requestMotionDirection, ...promptedCapabilities
    } = createPromptedAiCapabilities({
        provider: 'Google Gemini',
        lineParserName: 'Gemini',
        requestLyrics: ({ prompt, onLine, onStreamReset, parseLines, signal }) => onLine
            ? callGeminiAPIStream(prompt, onLine, onStreamReset, undefined, parseLines, undefined, undefined, undefined, signal)
            : callGeminiAPIRaw(prompt, undefined, parseLines, signal),
        requestJson: (prompt, signal) => callGeminiAPI(prompt, undefined, signal),
    });

    const GeminiAddon = {
        ...ADDON_INFO,

        async init() {
            debug(`[Gemini Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 연결 테스트 (SettingsUIBuilder/AddonUI에서 사용)
         */
        async testConnection() {
            await callGeminiAPIRaw('Reply with just "OK" if you receive this.');
        },

        getSettingsUI() {
            const React = getSpicetify().React;
            const { useState, useCallback, useEffect } = React;

            return function GeminiSettings() {
                const [apiKeys, setApiKeys] = useAiApiKeyValue(React, getSetting);
                const [baseUrl, setBaseUrl] = useState(() => getSetting('base-url', GEMINI_BASE_URL));
                const [model, setModel] = useState(() => getSelectedModel());
                const [testStatus, setTestStatus] = useState('');
                const [availableModels, setAvailableModels] = useState([]);
                const [modelsLoading, setModelsLoading] = useState(false);

                // 모델 목록 로드
                const loadModels = useCallback(async () => {
                    const keys = getApiKeys();
                    if (keys.length === 0) {
                        setAvailableModels([]);
                        return;
                    }
                    setModelsLoading(true);
                    try {
                        const models = await getModels();
                        setAvailableModels(models);
                        // ADDON_INFO.models 업데이트 (다른 곳에서 사용할 수 있도록)
                        ADDON_INFO.models = models;
                    } catch (e) {
                        debug('[Gemini Addon] Failed to load models:', e);
                        setAvailableModels([]);
                    } finally {
                        setModelsLoading(false);
                    }
                }, [apiKeys, baseUrl]);

                // API 키가 변경되면 모델 목록 다시 로드
                useEffect(() => {
                    const keys = getApiKeys();
                    if (keys.length > 0) {
                        loadModels();
                    } else {
                        setAvailableModels([]);
                    }
                }, [apiKeys, baseUrl]);

                const handleApiKeyChange = useCallback((e) => {
                    const value = e.target.value;
                    setApiKeys(value);
                    setSetting('api-keys', value);
                }, []);

                const handleBaseUrlChange = useCallback((e) => {
                    const value = e.target.value;
                    setBaseUrl(value);
                    setSetting('base-url', value);
                }, []);

                const handleModelChange = useCallback((e) => {
                    const value = e.target.value;
                    setModel(value);
                    setSetting('model', value);
                }, []);

                const handleRefreshModels = useCallback(() => {
                    loadModels();
                }, [loadModels]);

                const handleTest = useCallback(async () => {
                    setTestStatus(aiText('testingConnection', 'Testing...'));
                    try {
                        await callGeminiAPIRaw('Reply with just "OK" if you receive this.');
                        setTestStatus('✓ ' + aiText('connectionSuccess', 'Connection successful!'));
                    } catch (e) {
                        setTestStatus(`✗ ${e.message}`);
                    }
                }, []);

                const hasApiKey = getApiKeys().length > 0;

                const renderApiKeyRow = () => renderAiApiKeyRow(React, {
                    aiText, value: apiKeys, onChange: handleApiKeyChange, placeholder: 'AIza...',
                    onOpen: () => window.open(ADDON_INFO.apiKeyUrl, '_blank')
                });
                const renderBaseUrlRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('baseUrl', 'Base URL')),
                        React.createElement('input', {
                            type: 'text',
                            value: baseUrl,
                            onChange: handleBaseUrlChange,
                            placeholder: GEMINI_BASE_URL
                        }),
                        React.createElement('small', null, aiText('geminiBaseUrlDesc', 'Change this to use Gemini-compatible APIs'))
                    );
                const renderModelRow = () => renderAiModelRow(React, {
                    aiText,
                    select: React.createElement('select', {
                        value: model || '',
                        onChange: handleModelChange,
                        disabled: modelsLoading
                    },
                        modelsLoading
                            ? React.createElement('option', { value: '' }, aiText('loadingModels', 'Loading models...'))
                            : availableModels.length > 0
                                ? [
                                    !model && React.createElement('option', { key: '__placeholder__', value: '' }, aiText('selectModel', '-- Select a model --')),
                                    ...availableModels.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name))
                                ].filter(Boolean)
                                : React.createElement('option', { value: '' }, hasApiKey ? aiText('noModels', 'No models found') : aiText('enterApiKeyFirst', 'Enter API key first'))
                    ),
                    onRefresh: handleRefreshModels,
                    loading: modelsLoading,
                    refreshDisabled: modelsLoading || !hasApiKey,
                    below: [
                        availableModels.length > 0 && React.createElement('small', null, aiText('modelsAvailable', '{count} models available', { count: availableModels.length }))
                    ]
                });
                const renderTestRow = () => renderAiConnectionTestRow(React, { onTest: handleTest, testStatus, aiText });

                return React.createElement('div', { className: 'ai-addon-settings gemini-settings' },
                    renderApiKeyRow(),
                    renderBaseUrlRow(),
                    renderModelRow(),
                    // Advanced API Parameters
                    React.createElement(AdvancedParamsSection)
                    ,
                    renderTestRow()
                );
            };

            function AdvancedParamsSection() {
                const [expanded, setExpanded] = useState(() => getSetting('adv-expanded', false));
                const [maxTokensEnabled, setMaxTokensEnabled] = useState(() => getSetting('adv-maxOutputTokens-enabled', true));
                const [maxTokensValue, setMaxTokensValue] = useState(() => getSetting('adv-maxOutputTokens-value', DEFAULT_GEMINI_OUTPUT_TOKENS));
                const [thinkingEnabled, setThinkingEnabled] = useState(() => getSetting('adv-thinking-enabled', false));
                const [thinkingBudget, setThinkingBudget] = useState(() => getSetting('adv-thinking-budget', 1024));

                const toggleExpanded = useCallback(() => {
                    const next = !expanded;
                    setExpanded(next);
                    setSetting('adv-expanded', next);
                }, [expanded]);

                return renderAiAdvancedParams(React, { aiText, expanded, toggleExpanded },
                    expanded && React.createElement('div', { className: 'ai-addon-advanced-body' },
                        // Max Output Tokens
                        React.createElement('div', { className: 'ai-addon-advanced-row' },
                            React.createElement('label', { className: 'ai-addon-advanced-check' },
                                React.createElement('input', {
                                    type: 'checkbox', checked: maxTokensEnabled,
                                    onChange: (e) => { setMaxTokensEnabled(e.target.checked); setSetting('adv-maxOutputTokens-enabled', e.target.checked); }
                                }),
                                React.createElement('span', null, aiText('maxOutputTokens', 'Max Output Tokens'))
                            ),
                            React.createElement('input', {
                                type: 'number', value: maxTokensValue, disabled: !maxTokensEnabled,
                                'aria-label': aiText('maxOutputTokens', 'Max Output Tokens'),
                                onChange: (e) => { const v = parseInt(e.target.value) || DEFAULT_GEMINI_OUTPUT_TOKENS; setMaxTokensValue(v); setSetting('adv-maxOutputTokens-value', v); }
                            })
                        ),
                        // Thinking
                        React.createElement('div', { className: 'ai-addon-advanced-row' },
                            React.createElement('label', { className: 'ai-addon-advanced-check' },
                                React.createElement('input', {
                                    type: 'checkbox', checked: thinkingEnabled,
                                    onChange: (e) => { setThinkingEnabled(e.target.checked); setSetting('adv-thinking-enabled', e.target.checked); }
                                }),
                                React.createElement('span', null, aiText('thinking', 'Thinking'))
                            ),
                            React.createElement('input', {
                                type: 'number', value: thinkingBudget, disabled: !thinkingEnabled,
                                placeholder: aiText('thinkingBudget', 'Budget'),
                                'aria-label': aiText('thinkingBudget', 'Budget'),
                                onChange: (e) => { const v = parseInt(e.target.value) || 1024; setThinkingBudget(v); setSetting('adv-thinking-budget', v); }
                            })
                        ),
                        React.createElement('small', null, aiText('advancedParamsDesc', 'Uncheck to exclude parameter from API request.')),
                        React.createElement('small', null, aiText('thinkingStreamingHint', 'Thinking OFF enables real-time streaming.'))
                    )
                );
            }
        },

        ...promptedCapabilities,

        async generateMotionDirection(params) {
            return requestMotionDirection(params, () => params.motionDirectionPrompt);
        },

        async generateTMI({ title, artist, tmiPrompt, requestTimeoutMs, onResearchProgress, webSearch = true, signal }) {
            const prompt = requireResearchPrompt('Google Gemini', title, artist, tmiPrompt, signal);
            const { onRawChunk, resetProgress } = createResearchStreamCallbacks(getManager, onResearchProgress, signal);
            const requestOverrides = {
                generationConfig: await getResearchGenerationConfig(),
                // The SDK uses `googleSearch`, while the raw generateContent
                // REST request used here requires `google_search`.
                ...(webSearch === false ? {} : { tools: [{ google_search: {} }] })
            };
            try {
                return await callGeminiAPIStream(
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
            } catch (error) {
                throw webSearch === false ? error : markGeminiWebSearchFailure(error);
            }
        },
    };

    // ============================================
    // Registration
    // ============================================

    registerAiAddon(GeminiAddon);

    debug('[Gemini Addon] Module loaded');
}
