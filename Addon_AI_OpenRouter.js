/**
 * OpenRouter AI Addon for ivLyrics
 * OpenRouter를 통한 다양한 AI 모델 사용 (번역, 발음, Research 생성)
 *
 * @author default
 * @version 1.0.1
 */

(() => {
    'use strict';

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
            const response = await window.ivLyricsFetch(`${BASE_URL}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                window.__ivLyricsDebugLog?.('[OpenRouter Addon] Failed to fetch models:', response.status);
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
            window.__ivLyricsDebugLog?.('[OpenRouter Addon] Error fetching models:', e.message);
            return [];
        }
    }

    // ============================================
    // Helper Functions
    // ============================================

    function aiText(key, fallback, params) {
        const path = `settings.aiProviders.${key}`;
        const value = window.I18n?.t?.(path, params);
        if (value && value !== path) return value;
        return params ? String(fallback).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match) : fallback;
    }

    function getSetting(key, defaultValue = null) {
        return window.AIAddonManager?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    function setSetting(key, value) {
        window.AIAddonManager?.setAddonSetting(ADDON_INFO.id, key, value);
    }

    function getApiKeys() {
        // 새 키 먼저 확인, 없으면 기존 키 fallback
        let raw = getSetting('api-keys', '');
        if (!raw) {
            raw = getSetting('api-key', '');
        }
        if (!raw) return [];

        if (Array.isArray(raw)) {
            return raw
                .map(k => typeof k === 'string' ? k.trim() : '')
                .filter(k => k);
        }

        if (typeof raw !== 'string') return [];

        try {
            if (raw.startsWith('[')) {
                return JSON.parse(raw)
                    .map(k => typeof k === 'string' ? k.trim() : '')
                    .filter(k => k);
            }
            return [raw.trim()].filter(k => k);
        } catch {
            return [raw.trim()].filter(k => k);
        }
    }

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

    function normalizePromptRequest(prompt) {
        if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
            return {
                systemPrompt: String(prompt.systemPrompt || '').trim(),
                userPrompt: String(prompt.userPrompt ?? prompt.prompt ?? '')
            };
        }
        return { systemPrompt: '', userPrompt: String(prompt ?? '') };
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

    function normalizeFinishReason(reason) {
        return reason === null || reason === undefined
            ? ''
            : String(reason).trim().toLowerCase();
    }

    function createOpenRouterResponseError(reason, detail = '') {
        const normalizedReason = normalizeFinishReason(reason) || 'missing_finish_reason';
        const message = String(detail || '').trim();
        const error = new Error(`[OpenRouter] Response rejected (${normalizedReason})${message ? `: ${message}` : ''}`);
        error.code = 'OPENROUTER_RESPONSE_REJECTED';
        error.reason = normalizedReason;
        return error;
    }

    function readOpenRouterResponseText(data) {
        if (data?.error) {
            throw new Error(`[OpenRouter] ${data.error.message || data.error.code || 'API response error'}`);
        }

        const choice = data?.choices?.[0];
        if (!choice) {
            throw createOpenRouterResponseError('missing_choice');
        }
        if (choice.error) {
            const detail = typeof choice.error === 'string'
                ? choice.error
                : choice.error.message || choice.error.code || 'Choice response error';
            throw new Error(`[OpenRouter] ${detail}`);
        }

        const refusal = choice.message?.refusal;
        if ((typeof refusal === 'string' && refusal.trim()) || (refusal && typeof refusal !== 'string')) {
            throw createOpenRouterResponseError('refusal', typeof refusal === 'string' ? refusal : 'Request refused');
        }

        const finishReason = normalizeFinishReason(choice.finish_reason);
        if (finishReason !== 'stop') {
            throw createOpenRouterResponseError(finishReason, choice.finish_details?.message);
        }

        const content = choice.message?.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map(part => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : ''))
                .join('');
        }
        return '';
    }

    function readOpenRouterStreamChunk(data) {
        if (data?.error) {
            throw new Error(`[OpenRouter] ${data.error.message || data.error.code || 'API response error'}`);
        }

        const choice = data?.choices?.[0];
        if (!choice) return { text: '', finishReason: '' };
        if (choice.error) {
            const detail = typeof choice.error === 'string'
                ? choice.error
                : choice.error.message || choice.error.code || 'Choice response error';
            throw new Error(`[OpenRouter] ${detail}`);
        }

        const refusal = choice.delta?.refusal;
        if ((typeof refusal === 'string' && refusal.trim()) || (refusal && typeof refusal !== 'string')) {
            throw createOpenRouterResponseError('refusal', typeof refusal === 'string' ? refusal : 'Request refused');
        }

        const finishReason = normalizeFinishReason(choice.finish_reason);
        if (finishReason && finishReason !== 'stop') {
            throw createOpenRouterResponseError(finishReason, choice.finish_details?.message);
        }

        const content = choice.delta?.content;
        const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
                ? content.map(part => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : '')).join('')
                : '';
        return { text, finishReason };
    }

    // Shared 401 / non-OK handling for the request loop. On 401 it throws the
    // permission message; otherwise it reports the HTTP status. Either branch
    // reads the JSON body at most once, matching the inline versions.
    async function throwOpenRouterApiResponseError(response) {
        if (response.status === 401) {
            let errorMessage = 'Invalid API key or permission denied.';
            try {
                const errorData = await response.json();
                if (errorData.error?.message) errorMessage = errorData.error.message;
            } catch (parseError) { }
            throw new Error(`[OpenRouter] ${errorMessage}`);
        }

        let errorMessage = `HTTP ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData.error?.message) errorMessage = errorData.error.message;
        } catch (parseError) { }
        throw new Error(`[OpenRouter] ${errorMessage}`);
    }

    async function callOpenRouterAPIRaw(prompt, maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3, transformResult = null) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            throw new Error('[OpenRouter] API key is required. Please configure your API key in settings.');
        }

        const model = getSelectedModel();
        let lastError = null;

        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex];

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const response = await window.ivLyricsFetch(`${BASE_URL}/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`,
                            'HTTP-Referer': 'https://github.com/ivLis-STUDIO/ivLyrics',
                            'X-Title': 'ivLyrics'
                        },
                        body: JSON.stringify({
                            model,
                            messages: buildPromptMessages(prompt),
                            ...getAdvancedRequestParams()
                        })
                    });

                    if (response.status === 429 || response.status === 403) {
                        window.__ivLyricsDebugLog?.(`[OpenRouter Addon] API key ${keyIndex + 1} failed (${response.status}), trying next...`);
                        break; // Try next key
                    }

                    if (response.status === 401 || !response.ok) {
                        await throwOpenRouterApiResponseError(response);
                    }

                    const data = await response.json();
                    const rawText = readOpenRouterResponseText(data);

                    if (!rawText.trim()) {
                        throw new Error('[OpenRouter] Empty response from API');
                    }

                    return typeof transformResult === 'function'
                        ? transformResult(rawText)
                        : rawText;

                } catch (e) {
                    lastError = e;
                    window.__ivLyricsDebugLog?.(`[OpenRouter Addon] Attempt ${attempt + 1} failed:`, e.message);

                    if (e.message.includes('Invalid API key') || e.message.includes('permission denied')) {
                        throw e;
                    }

                    if (attempt < maxRetries - 1) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    }
                }
            }
        }

        throw lastError || new Error('[OpenRouter] All API keys and retries exhausted');
    }

    function emitStreamingLines(accumulated, onLine, state, flush = false) {
        if (!onLine) return;

        if (flush) {
            if (state.offset >= accumulated.length) return;
            const finalLine = accumulated.slice(state.offset);
            onLine(state.index, finalLine);
            state.index += 1;
            state.offset = accumulated.length;
            return;
        }

        let newlineIndex = accumulated.indexOf('\n', state.offset);
        if (newlineIndex === -1) return;

        const completedLines = [];
        let lineStart = state.offset;
        while (newlineIndex !== -1) {
            completedLines.push(accumulated.slice(lineStart, newlineIndex));
            lineStart = newlineIndex + 1;
            newlineIndex = accumulated.indexOf('\n', lineStart);
        }

        for (const line of completedLines) {
            onLine(state.index, line);
            state.index += 1;
            state.offset += line.length + 1;
        }
    }

    async function callOpenRouterAPIStream(
        prompt,
        onLine,
        onStreamReset,
        maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        requestTimeoutMs = window.ivLyricsFetch?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        requestOverrides = {}
    ) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) throw new Error('[OpenRouter] API key is required.');
        const model = getSelectedModel();
        let lastError = null;

        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex];
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                let emittedLineCount = 0;
                let emittedProvisionalOutput = false;
                let receivedStreamText = false;
                const resetProvisionalOutput = (reason, error = null) => {
                    if (!emittedProvisionalOutput && !receivedStreamText) return;

                    try {
                        if (typeof onStreamReset === 'function') {
                            onStreamReset({ reason, error: error?.message || null });
                        } else if (typeof onLine === 'function') {
                            for (let index = 0; index < emittedLineCount; index++) {
                                onLine(index, '');
                            }
                        }
                    } catch (resetError) {
                        window.__ivLyricsDebugLog?.('[OpenRouter Addon] Failed to reset provisional stream:', resetError?.message);
                    }

                    emittedProvisionalOutput = false;
                    emittedLineCount = 0;
                    receivedStreamText = false;
                };

                try {
                    const response = await window.ivLyricsFetch(`${BASE_URL}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://github.com/ivLis-STUDIO/ivLyrics', 'X-Title': 'ivLyrics' },
                        body: JSON.stringify({ model, messages: buildPromptMessages(prompt), ...getAdvancedRequestParams(), ...requestOverrides, stream: true })
                    }, requestTimeoutMs);
                    if (response.status === 429 || response.status === 403) { break; }
                    if (!response.ok) {
                        let msg = `HTTP ${response.status}`;
                        try { const d = await response.json(); if (d.error?.message) msg = d.error.message; } catch (e) { }
                        throw new Error(`[OpenRouter] ${msg}`);
                    }
                    const consumeOpenRouterStream = async () => {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let sseBuffer = '', accumulated = '';
                    let finalFinishReason = '';
                    const lineState = { index: 0, offset: 0 };

                    const processSseLine = (line) => {
                        const trimmedLine = String(line || '').trim();
                        if (!trimmedLine.startsWith('data:')) return;

                        const payload = trimmedLine.slice(5).trimStart();
                        if (!payload || payload === '[DONE]') return;

                        const parsed = JSON.parse(payload);
                        const chunk = readOpenRouterStreamChunk(parsed);
                        if (chunk.text) {
                            accumulated += chunk.text;
                            receivedStreamText = true;
                            if (typeof onRawChunk === 'function') onRawChunk(chunk.text);
                        }
                        if (chunk.finishReason) finalFinishReason = chunk.finishReason;
                    };

                    const drainSseBuffer = (flush = false) => {
                        const parts = sseBuffer.split(/\r?\n/);
                        if (flush) {
                            sseBuffer = '';
                        } else {
                            sseBuffer = parts.pop() || '';
                        }
                        for (const line of parts) processSseLine(line);
                    };

                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        sseBuffer += decoder.decode(value, { stream: true });
                        drainSseBuffer();

                        const beforeEmitCount = lineState.index;
                        emitStreamingLines(accumulated, onLine, lineState);
                        if (lineState.index > beforeEmitCount) {
                            emittedProvisionalOutput = true;
                            emittedLineCount = Math.max(emittedLineCount, lineState.index);
                        }
                    }

                    sseBuffer += decoder.decode();
                    drainSseBuffer(true);

                    const beforeFlushCount = lineState.index;
                    emitStreamingLines(accumulated, onLine, lineState, true);
                    if (lineState.index > beforeFlushCount) {
                        emittedProvisionalOutput = true;
                        emittedLineCount = Math.max(emittedLineCount, lineState.index);
                    }

                    if (finalFinishReason !== 'stop') {
                        throw createOpenRouterResponseError(finalFinishReason);
                    }
                    if (!accumulated.trim()) throw new Error('[OpenRouter] Empty response from streaming API');

                    const transformed = typeof transformResult === 'function'
                        ? transformResult(accumulated)
                        : accumulated;

                    if (Array.isArray(transformed) && typeof onLine === 'function') {
                        const provisionalLines = accumulated.split('\n');
                        transformed.forEach((line, index) => {
                            if (index >= emittedLineCount || provisionalLines[index] !== line) {
                                onLine(index, line);
                            }
                        });
                        for (let index = transformed.length; index < emittedLineCount; index++) {
                            if (provisionalLines[index] !== '') onLine(index, '');
                        }
                    }

                    return transformed;
                    };

                    return await consumeOpenRouterStream();
                } catch (e) {
                    lastError = e;
                    resetProvisionalOutput(attempt < maxRetries - 1 ? 'retry' : 'failed', e);
                    if (e.message.includes('Invalid API key') || e.message.includes('permission denied')) throw e;
                    if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        throw lastError || new Error('[OpenRouter] All API keys and retries exhausted');
    }

    async function callOpenRouterAPI(prompt, maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3) {
        return await callOpenRouterAPIRaw(prompt, maxRetries, extractJSON);
    }

    function parseTextLines(text, expectedSourceLines) {
        if (text === null || text === undefined) {
            throw new Error('[OpenRouter] Empty response from API');
        }

        const sourceLines = Array.isArray(expectedSourceLines)
            ? expectedSourceLines.map(line => String(line ?? ''))
            : null;
        const expectedLineCount = sourceLines
            ? sourceLines.length
            : Number(expectedSourceLines);
        let lines = String(text).replace(/\r\n?/g, '\n').split('\n');

        let firstNonBlank = 0;
        let lastNonBlank = lines.length - 1;
        while (firstNonBlank <= lastNonBlank && !lines[firstNonBlank].trim()) firstNonBlank += 1;
        while (lastNonBlank >= firstNonBlank && !lines[lastNonBlank].trim()) lastNonBlank -= 1;

        const openingFence = lines[firstNonBlank]?.trim() || '';
        const closingFence = lines[lastNonBlank]?.trim() || '';
        if (/^```[a-z0-9_-]*$/i.test(openingFence) && closingFence === '```') {
            lines = lines.slice(firstNonBlank + 1, lastNonBlank);
        }

        const candidates = [lines];
        if (lines[0]?.trim() === '') candidates.push(lines.slice(1));
        if (lines[lines.length - 1]?.trim() === '') candidates.push(lines.slice(0, -1));
        if (lines[0]?.trim() === '' && lines[lines.length - 1]?.trim() === '') {
            candidates.push(lines.slice(1, -1));
        }

        const validLines = candidates.find(candidate => candidate.length === expectedLineCount);
        if (!validLines) {
            throw new Error(`[OpenRouter] Invalid response line count: expected ${expectedLineCount}, got ${lines.length}`);
        }
        if (validLines.every(line => !String(line).trim())) {
            throw new Error('[OpenRouter] Empty response from API');
        }
        if (sourceLines) {
            const missingLineIndex = validLines.findIndex((line, index) => sourceLines[index].trim() && !String(line).trim());
            if (missingLineIndex >= 0) {
                throw new Error(`[OpenRouter] Empty response line at index ${missingLineIndex + 1}`);
            }
        }

        return validLines;
    }

    function extractJSON(text) {
        const truncatedMessage = 'AI JSON response was truncated. The provider or model likely hit its output token limit. Try a higher max output token setting, a different provider, or shorter lyrics.';
        const isProbablyTruncatedJSON = (value, error) => {
            const trimmed = String(value || '').trim();
            if (/Unexpected end|unterminated/i.test(error?.message || '')) return true;
            if (!trimmed.includes('{')) return false;
            return !trimmed.endsWith('}') || trimmed.lastIndexOf('}') < trimmed.lastIndexOf('{');
        };
        const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch (directError) {
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (matchError) {
                    if (isProbablyTruncatedJSON(cleaned, matchError)) throw new Error(truncatedMessage);
                    throw new Error('Failed to parse JSON response');
                }
            }
            if (isProbablyTruncatedJSON(cleaned, directError)) throw new Error(truncatedMessage);
            throw new Error('No valid JSON found in response');
        }
    }

    // ============================================
    // Main Addon Object
    // ============================================

    const OpenRouterAddon = {
        ...ADDON_INFO,

        getSettingsUI() {
            const React = Spicetify.React;
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

        async translateLyrics({ text, lang, wantSmartPhonetic, translationPrompt, phoneticPrompt, onLine, onStreamReset }) {
            if (!text?.trim()) {
                throw new Error('No text provided');
            }

            const sourceLines = String(text).replace(/\r\n?/g, '\n').split('\n');
            const prompt = wantSmartPhonetic ? phoneticPrompt : translationPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central lyrics prompt is unavailable.');
            }
            const parseLines = rawResponse => parseTextLines(rawResponse, sourceLines);

            const lines = onLine
                ? await callOpenRouterAPIStream(prompt, onLine, onStreamReset, undefined, parseLines)
                : await callOpenRouterAPIRaw(prompt, undefined, parseLines);

            return wantSmartPhonetic ? { phonetic: lines } : { translation: lines };
        },

        async generateCharacterPronunciation({ lines, characterPronunciationPrompt }) {
            if (!Array.isArray(lines) || lines.length === 0) {
                throw new Error('No lines provided');
            }

            const prompt = characterPronunciationPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central character pronunciation prompt is unavailable.');
            }
            const result = await callOpenRouterAPI(prompt);
            if (!result || !(Array.isArray(result.l) || Array.isArray(result.lines))) {
                throw new Error('Invalid character pronunciation response');
            }
            return result;
        },

        async translateMetadata({ title, artist, metadataPrompt }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = metadataPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central metadata translation prompt is unavailable.');
            }
            const result = await callOpenRouterAPI(prompt);

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

        async generateTMI({ title, artist, tmiPrompt, requestTimeoutMs, onResearchProgress, webSearch = true }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = tmiPrompt;
            if (!prompt) {
                throw new Error('[OpenRouter] Central TMI prompt is unavailable.');
            }
            let progressParser = window.AIAddonManager?.createResearchStreamProgressParser?.(onResearchProgress) || null;
            const resetProgress = progressParser
                ? (details) => {
                    progressParser = window.AIAddonManager.createResearchStreamProgressParser(onResearchProgress);
                    onResearchProgress(null, { ...details, reset: true });
                }
                : null;
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
                progressParser ? chunk => progressParser.push(chunk) : null,
                requestOverrides
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
            return await callOpenRouterAPI(prompt);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            window.AIAddonManager.register(OpenRouterAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    window.__ivLyricsDebugLog?.('[OpenRouter Addon] Module loaded');
})();
