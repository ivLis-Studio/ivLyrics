/**
 * Claude AI Addon for ivLyrics
 * Anthropic Claude를 사용한 번역, 발음, Research 생성
 *
 * @author default
 * @version 1.0.1
 */

import { createPromptedAiCapabilities, requireResearchPrompt } from "./promptedAiCapabilities.mjs";
import { throwIfAiRequestAborted } from "./aiRequestCancellation.mjs";
import { requestWithAiKeys } from "./aiKeyRotation.mjs";
import { createResearchStreamCallbacks } from "./researchStreamCallbacks.mjs";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";
import {
    createAiAddonSettingAccess,
    createAiAdvancedParamsSection,
    readAiAdvancedRequestParams,
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
import { consumeSseFrames, hasBufferedJsonBody } from "./aiEventStream.mjs";
import { extractJSON } from "./aiResponseParsing.mjs";

export default function initializeClaudeAddon(services = createBuiltinAiProviderServices(window)) {
    const { host: window, getManager, getAiRequest, getI18n, getSpicetify, debug, registerAiAddon } = services;

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'claude',
        name: 'Anthropic Claude',
        author: 'default',
        description: {
            ko: 'Anthropic Claude를 사용한 번역, 발음, 음악 리서치',
            en: 'Translation, pronunciation, and music research using Anthropic Claude',
            ja: 'Anthropic Claudeを使用した翻訳、発音、音楽リサーチ',
            'zh-CN': '使用 Anthropic Claude 进行翻译、发音和音乐深度研究',
            'zh-TW': '使用 Anthropic Claude 進行翻譯、發音和音樂研究',
            hi: 'Anthropic Claude का उपयोग करके अनुवाद, उच्चारण और संगीत अनुसंधान',
            es: 'Traducción, pronunciación e investigación musical con Anthropic Claude',
            fr: 'Traduction, prononciation et recherche musicale avec Anthropic Claude',
            ar: 'الترجمة والنطق والبحث الموسيقي باستخدام Anthropic Claude',
            fa: 'ترجمه، تلفظ و پژوهش موسیقی با استفاده از Anthropic Claude',
            de: 'Übersetzung, Aussprache und Musikforschung mit Anthropic Claude',
            ru: 'Перевод, произношение и музыкальные исследования с помощью Anthropic Claude',
            sv: 'Översättning, uttal och musikforskning med Anthropic Claude',
            pt: 'Tradução, pronúncia e pesquisa musical com o Anthropic Claude',
            bn: 'Anthropic Claude ব্যবহার করে অনুবাদ, উচ্চারণ ও সঙ্গীত গবেষণা',
            cs: 'Překlad, výslovnost a hudební výzkum pomocí Anthropic Claude',
            it: 'Traduzione, pronuncia e ricerca musicale con Anthropic Claude',
            th: 'การแปล คำอ่าน และการวิจัยด้านดนตรีโดยใช้ Anthropic Claude',
            vi: 'Dịch thuật, phát âm và nghiên cứu âm nhạc bằng Anthropic Claude',
            id: 'Terjemahan, pelafalan, dan penelitian musik menggunakan Anthropic Claude',
            ms: 'Terjemahan, sebutan dan penyelidikan muzik menggunakan Anthropic Claude',
            tr: 'Anthropic Claude ile çeviri, telaffuz ve müzik araştırması',
        },
        version: '1.0.1',
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
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

    const BASE_URL = 'https://api.anthropic.com/v1';
    const DEFAULT_RESEARCH_MAX_TOKENS = 16_000;
    const claudeModelCapabilities = new Map();

    const asPositiveInteger = (value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    /**
     * Fetch available models from Claude API
     */
    async function fetchAvailableModels(apiKey) {
        if (!apiKey) return [];

        try {
            const response = await getAiRequest()(`${BASE_URL}/models`, {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                }
            });

            if (!response.ok) {
                debug('[Claude Addon] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            const models = (data.data || [])
                .filter(m => m.type === 'model') // Filter only models
                .map(m => ({
                    id: m.id,
                    name: m.display_name || m.id,
                    created_at: m.created_at,
                    max_input_tokens: asPositiveInteger(m.max_input_tokens),
                    max_tokens: asPositiveInteger(m.max_tokens)
                }))
                // Sort to put newest models first (approximate by ID versioning or just specific priority)
                .sort((a, b) => {
                    // specific priority
                    const priority = ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus', 'claude-3-haiku'];
                    const aIdx = priority.findIndex(p => a.id.includes(p));
                    const bIdx = priority.findIndex(p => b.id.includes(p));

                    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                    if (aIdx !== -1) return -1;
                    if (bIdx !== -1) return 1;

                    return b.created_at?.localeCompare(a.created_at || '') || 0;
                });

            if (models.length > 0) {
                models[0].default = true;
            }
            for (const model of models) {
                claudeModelCapabilities.set(model.id, model);
            }

            return models;
        } catch (e) {
            debug('[Claude Addon] Error fetching models:', e.message);
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
        return getSetting('model', 'claude-sonnet-4-20250514');
    }

    // The settings assistant marks its long system prompt (rules, settings
    // catalog, guide index), which only changes with the interface language,
    // for Anthropic's prompt cache: messages within five minutes of each other
    // read it at a tenth of the input price. Other requests send plain text.
    function toClaudeSystem(systemPrompt, cache) {
        if (!systemPrompt || !cache) return systemPrompt;
        return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
    }

    function logClaudeCacheUsage(usage) {
        if (!usage) return;
        debug(`[Claude Addon] Prompt cache: ${usage.cache_read_input_tokens || 0} tokens read, ${usage.cache_creation_input_tokens || 0} written, ${usage.input_tokens || 0} uncached`);
    }

    function getAdvancedRequestParams() {
        return readAiAdvancedRequestParams(getSetting, { temperature: null });
    }

    async function getResearchMaxTokens() {
        const selectedModel = getSelectedModel();
        let capabilities = claudeModelCapabilities.get(selectedModel);
        if (!capabilities) {
            const models = await fetchAvailableModels(getApiKeys()[0]);
            capabilities = models.find(model => model.id === selectedModel);
        }

        return asPositiveInteger(capabilities?.max_tokens)
            || asPositiveInteger(getAdvancedRequestParams().max_tokens)
            || DEFAULT_RESEARCH_MAX_TOKENS;
    }

    function resolveClaudeRequestPreamble(prompt) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            throw new Error('[Claude] API key is required. Please configure your API key in settings.');
        }

        const model = getSelectedModel();
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        const system = toClaudeSystem(systemPrompt, prompt?.cacheSystemPrompt === true);
        return { apiKeys, model, system, userPrompt };
    }

    function getClaudeWebSearchTool(model) {
        const normalizedModel = String(model || '').toLowerCase();
        const supportsLatestSearch = /(?:claude-)?(?:opus-(?:4[-.]?[678]|5)|sonnet-(?:4[-.]?6|5)|fable-5|mythos(?:-preview|-5))/.test(normalizedModel);

        if (supportsLatestSearch) {
            return {
                type: 'web_search_20260318',
                name: 'web_search',
                max_uses: 5,
                allowed_callers: ['direct']
            };
        }

        return { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };
    }

    // ============================================
    // API Call Functions
    // ============================================

    const normalizeClaudeStopReason = (value) => String(value ?? '').trim().toLowerCase();

    function createClaudeResponseError(reason, message = '') {
        const normalizedReason = normalizeClaudeStopReason(reason) || 'unknown';
        const detail = String(message || '').trim();
        const error = new Error(`[Claude] Response rejected (${normalizedReason})${detail ? `: ${detail}` : ''}`);
        error.code = 'CLAUDE_RESPONSE_REJECTED';
        error.reason = normalizedReason;
        return error;
    }

    function validateClaudeStopReason(reason, allowUnspecified = false) {
        const normalizedReason = normalizeClaudeStopReason(reason);
        if (!normalizedReason) {
            if (allowUnspecified) return '';
            throw createClaudeResponseError('missing_stop_reason');
        }
        if (normalizedReason !== 'end_turn' && normalizedReason !== 'stop_sequence') {
            throw createClaudeResponseError(normalizedReason);
        }
        return normalizedReason;
    }

    function readClaudeResponseText(data) {
        if (data?.type === 'error' || data?.error) {
            throw new Error(`[Claude] ${data?.error?.message || data?.error?.type || data?.message || 'API response error'}`);
        }

        validateClaudeStopReason(data?.stop_reason);

        return (Array.isArray(data?.content) ? data.content : [])
            .filter(block => block?.type === 'text' && typeof block?.text === 'string')
            .map(block => block.text)
            .join('');
    }

    // Shared 401 / non-OK handling for both the raw and streaming request loops.
    // On 401 it throws the permission message; otherwise it reports the HTTP status.
    // Either branch reads the JSON body at most once, matching the inline versions.
    async function throwClaudeApiResponseError(response) {
        if (response.status === 401) {
            let errorMessage = 'Invalid API key or permission denied.';
            try {
                const errorData = await response.json();
                if (errorData.error?.message) errorMessage = errorData.error.message;
            } catch (parseError) { }
            throw new Error(`[Claude] ${errorMessage}`);
        }

        let errorMessage = `HTTP ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData.error?.message) errorMessage = errorData.error.message;
        } catch (parseError) { }
        throw new Error(`[Claude] ${errorMessage}`);
    }

    async function consumeClaudeSse(body, output) {
        let finalStopReason = '';

        const processSseEvent = (event) => {
            const lines = String(event || '').split(/\r?\n/);
            let eventType = '';
            const dataLines = [];

            for (const line of lines) {
                if (line.startsWith('event:')) {
                    eventType = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }

            const payload = dataLines.join('\n').trim();
            if (!payload || payload === '[DONE]') return;

            const parsed = JSON.parse(payload);
            const parsedType = eventType || parsed?.type || '';
            if (parsedType === 'error' || parsed?.error) {
                throw new Error(`[Claude] ${parsed?.error?.message || parsed?.error?.type || 'Streaming API error'}`);
            }

            if (parsedType === 'message_start') {
                validateClaudeStopReason(parsed?.message?.stop_reason, true);
                return;
            }

            if (parsedType === 'content_block_start') {
                const block = parsed?.content_block;
                const toolError = block?.type === 'web_search_tool_result'
                    && block?.content?.type === 'web_search_tool_result_error'
                    ? block.content
                    : null;
                if (toolError) {
                    throw new Error(`[Claude] Web search failed: ${toolError.error_code || 'unknown_error'}`);
                }
                return;
            }

            if (parsedType === 'content_block_delta') {
                const text = parsed?.delta?.type === 'text_delta' && typeof parsed?.delta?.text === 'string'
                    ? parsed.delta.text
                    : '';
                output.append(text);
                return;
            }

            if (parsedType === 'message_delta') {
                const stopReason = validateClaudeStopReason(parsed?.delta?.stop_reason, true);
                if (stopReason) finalStopReason = stopReason;
            }
            if (parsedType === 'message_stop') return false;
        };

        await consumeSseFrames(body, {
            frameSeparator: /\r?\n\r?\n/,
            onFrame: processSseEvent,
            onChunk: output.emit,
        });

        return finalStopReason;
    }

    async function readClaudeStream(response, output, transformResult) {
        if (hasBufferedJsonBody(response)) {
            output.append(readClaudeResponseText(await response.json()));
            output.emit(true);
        } else {
            const finalStopReason = await consumeClaudeSse(response.body, output);
            output.emit(true);
            validateClaudeStopReason(finalStopReason);
        }
        if (!output.text.trim()) {
            throw new Error('[Claude] Empty response from streaming API');
        }
        return output.finish(output.text, transformResult);
    }

    async function requestClaude(prompt, { attempts, transformResult, signal, stream, timeoutMs, overrides }) {
        const { apiKeys, model, system, userPrompt } = resolveClaudeRequestPreamble(prompt);
        const messages = [{ role: 'user', content: userPrompt }];
        return requestWithAiKeys({
            apiKeys, attempts, signal,
            exhaustedMessage: '[Claude] All API keys and retries exhausted',
            createOutput: stream && (() => createStreamingOutput({
                ...stream,
                onResetError: error => debug('[Claude Addon] Failed to reset provisional stream:', error?.message),
            })),
            async run({ key, keyNumber, output, nextKey }) {
                throwIfAiRequestAborted(signal);
                const request = getAiRequest();
                const options = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    ...(signal ? { signal } : {}),
                    body: JSON.stringify({
                        model,
                        ...getAdvancedRequestParams(),
                        ...overrides,
                        ...(system ? { system } : {}),
                        ...(stream ? { stream: true } : {}),
                        messages,
                    }),
                };
                const endpoint = `${BASE_URL}/messages`;
                const response = stream ? await request(endpoint, options, timeoutMs) : await request(endpoint, options);
                if (response.status === 429 || response.status === 403) {
                    debug(`[Claude Addon] ${stream ? 'Stream: ' : ''}API key ${keyNumber} failed (${response.status}), trying next...`);
                    return nextKey();
                }
                if (response.status === 401 || !response.ok) await throwClaudeApiResponseError(response);
                if (output) return await readClaudeStream(response, output, transformResult);

                const data = await response.json();
                if (Array.isArray(system)) logClaudeCacheUsage(data?.usage);
                const text = readClaudeResponseText(data);
                if (!text.trim()) throw new Error('[Claude] Empty response from API');
                return typeof transformResult === 'function' ? transformResult(text) : text;
            },
            onError(error, { attemptNumber, output, willRetry, hasNextKey }) {
                debug(`[Claude Addon] ${output ? 'Stream attempt' : 'Attempt'} ${attemptNumber} failed:`, error.message);
                output?.reset(willRetry || hasNextKey ? 'retry' : 'failed', error);
                if (error.message.includes('Invalid API key') || error.message.includes('permission denied')) return 'stop';
            },
        });
    }

    async function callClaudeAPIRaw(prompt, attempts = getManager()?.getProviderRequestAttempts?.() ?? 3, transformResult = null, signal) {
        return requestClaude(prompt, { attempts, transformResult, signal });
    }

    async function callClaudeAPIStream(
        prompt,
        onLine,
        onStreamReset,
        attempts = getManager()?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        timeoutMs = getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        overrides = {},
        signal,
    ) {
        return requestClaude(prompt, {
            attempts, transformResult, signal, timeoutMs, overrides, stream: { onLine, onStreamReset, onRawChunk },
        });
    }

    async function callClaudeAPI(prompt, maxRetries = getManager()?.getProviderRequestAttempts?.() ?? 3, signal) {
        const rawText = await callClaudeAPIRaw(prompt, maxRetries, null, signal);
        return extractJSON(rawText);
    }

    // ============================================
    // Main Addon Object
    // ============================================

    const {
        generateMotionDirection: requestMotionDirection, ...promptedCapabilities
    } = createPromptedAiCapabilities({
        provider: 'Anthropic Claude',
        lineParserName: 'Claude',
        allowNullMetadata: true,
        requestLyrics: ({ prompt, onLine, onStreamReset, parseLines, signal }) => onLine
            ? callClaudeAPIStream(prompt, onLine, onStreamReset, undefined, parseLines, undefined, undefined, undefined, signal)
            : callClaudeAPIRaw(prompt, undefined, parseLines, signal),
        requestJson: (prompt, signal) => callClaudeAPI(prompt, undefined, signal),
    });

    const ClaudeAddon = {
        ...ADDON_INFO,

        getSettingsUI() {
            const React = getSpicetify().React;
            const { useState } = React;
            const AdvancedParamsSection = createAiAdvancedParamsSection({ React, getSetting, setSetting, aiText, temperature: null });

            return function ClaudeSettings() {
                const [apiKeys, setApiKeys] = useAiApiKeyValue(React, getSetting);
                const [selectedModel, setSelectedModel] = useState(() => getSetting('model', 'claude-sonnet-4-20250514'));
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

                const handleTest = () => testAiConnection(callClaudeAPIRaw, setTestStatus, aiText);

                const { availableModels, modelsLoading, loadModels } = useAiModelPicker(React, {
                    apiKeys, getApiKeys, fetchModels: fetchAvailableModels, logName: 'Claude',
                    onLoaded(models) {
                        if (models.length === 0) return;
                        ADDON_INFO.models = models;
                    }
                });

                const hasApiKey = getApiKeys().length > 0;

                const renderApiKeyRow = () => renderAiApiKeyRow(React, {
                    aiText, value: apiKeys, onChange: handleApiKeyChange, placeholder: 'sk-ant-...',
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
                    refreshDisabled: modelsLoading || !hasApiKey
                });
                const renderTestRow = () => renderAiConnectionTestRow(React, { onTest: handleTest, testStatus, aiText });

                return React.createElement('div', { className: 'ai-addon-settings claude-settings' },
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
            const prompt = requireResearchPrompt('Anthropic Claude', title, artist, tmiPrompt, signal);
            const { onRawChunk, resetProgress } = createResearchStreamCallbacks(getManager, onResearchProgress, signal);
            const requestOverrides = {
                max_tokens: await getResearchMaxTokens(),
                ...(webSearch === false ? {} : {
                    tools: [getClaudeWebSearchTool(getSelectedModel())]
                })
            };
            return await callClaudeAPIStream(
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

    registerAiAddon(ClaudeAddon);

    debug('[Claude Addon] Module loaded');
}
