/**
 * Gemini AI Addon for ivLyrics
 * Google Gemini AI를 사용한 번역, 발음, Research 생성
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
            motionDirection: true
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

    const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;
    const geminiModelCapabilities = new Map();

    const asPositiveInteger = (value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    /**
     * Gemini API에서 사용 가능한 모델 목록을 가져옴 (텍스트 생성용 모델만)
     */
    async function fetchAvailableModels(apiKey, baseUrl) {
        if (!apiKey) return [];

        try {
            const endpoint = `${(baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models?key=${encodeURIComponent(apiKey)}`;
            const response = await window.ivLyricsFetch(endpoint);

            if (!response.ok) {
                window.__ivLyricsDebugLog?.('[Gemini Addon] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            const models = (data.models || [])
                // 텍스트 생성 지원 모델만 필터링
                .filter(m => {
                    if (!m.name) return false;
                    // generateContent 지원 필수
                    if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
                    // gemini 모델만
                    const id = m.name.replace('models/', '');
                    if (!id.startsWith('gemini')) return false;
                    // 이미지/비전 전용 모델 제외
                    if (id.includes('vision') && !id.includes('pro')) return false;
                    // embedding 모델 제외
                    if (id.includes('embedding')) return false;
                    // imagen 모델 제외
                    if (id.includes('imagen')) return false;
                    if (id.includes('image')) return false;
                    // AQA 모델 제외 (질문응답 전용)
                    if (id.includes('aqa')) return false;
                    // robotics 모델 제외
                    if (id.includes('robotics')) return false;
                    // tts 모델 제외
                    if (id.includes('tts')) return false;
                    // exp 모델 제외
                    if (id.includes('exp')) return false;
                    // computer 모델 제외
                    if (id.includes('computer')) return false;
                    return true;
                })
                .map(m => {
                    const id = m.name.replace('models/', '');
                    return {
                        id,
                        name: m.displayName || id,
                        description: m.description || '',
                        input_token_limit: asPositiveInteger(m.inputTokenLimit),
                        max_output_tokens: asPositiveInteger(m.outputTokenLimit)
                    };
                })
                .sort((a, b) => {
                    // 최신 버전 우선 정렬
                    const aNum = parseFloat(a.id.match(/[\d.]+/)?.[0] || '0');
                    const bNum = parseFloat(b.id.match(/[\d.]+/)?.[0] || '0');
                    if (bNum !== aNum) return bNum - aNum;
                    // flash가 pro보다 먼저
                    if (a.id.includes('flash') && !b.id.includes('flash')) return -1;
                    if (!a.id.includes('flash') && b.id.includes('flash')) return 1;
                    return a.id.localeCompare(b.id);
                });

            // 첫 번째 모델을 기본값으로 설정
            if (models.length > 0) {
                models[0].default = true;
            }
            for (const model of models) {
                geminiModelCapabilities.set(model.id, model);
            }

            return models;
        } catch (e) {
            window.__ivLyricsDebugLog?.('[Gemini Addon] Error fetching models:', e.message);
            return [];
        }
    }

    /**
     * 모델 목록 가져오기 (매번 API에서 로드)
     */
    async function getModels() {
        const apiKeys = getApiKeys();
        const baseUrl = getSetting('base-url', 'https://generativelanguage.googleapis.com/v1beta');
        if (apiKeys.length === 0) return [];
        return await fetchAvailableModels(apiKeys[0], baseUrl);
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
            raw = getSetting('api-key', ''); // 기존 설정 호환
        }
        if (!raw) return [];

        // 이미 배열인 경우 (getAddonSetting이 JSON 파싱함)
        if (Array.isArray(raw)) {
            return raw
                .map(k => typeof k === 'string' ? k.trim() : '')
                .filter(k => k);
        }

        // 문자열이 아닌 경우
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
        return getSetting('model', null);
    }

    function getBaseUrl() {
        return getSetting('base-url', 'https://generativelanguage.googleapis.com/v1beta') || 'https://generativelanguage.googleapis.com/v1beta';
    }


    /**
     * Build generationConfig from advanced parameter settings
     */
    function getGenerationConfig() {
        const config = {};

        // maxOutputTokens
        const useMaxTokens = getSetting('adv-maxOutputTokens-enabled', true);
        if (useMaxTokens) {
            config.maxOutputTokens = parseInt(getSetting('adv-maxOutputTokens-value', DEFAULT_MAX_OUTPUT_TOKENS)) || DEFAULT_MAX_OUTPUT_TOKENS;
        }

        // Gemini 3 uses levels; zero token budgets are not supported by every
        // model. Older/non-thinking models must not receive thinking fields.
        const useThinking = getSetting('adv-thinking-enabled', false);
        const model = String(getSelectedModel() || '').replace(/^models\//, '').toLowerCase();
        if (/^gemini-3(?:[.-])/.test(model)) {
            const supportsMinimal = /^gemini-3\.(?:1|5)-flash-lite(?:-|$)/.test(model);
            config.thinkingConfig = { thinkingLevel: useThinking ? 'high' : supportsMinimal ? 'minimal' : 'low' };
        } else if (/^gemini-2\.5-(?:flash|pro)(?:-|$)/.test(model)) {
            const isPro = model.startsWith('gemini-2.5-pro');
            if (useThinking) {
                const budget = parseInt(getSetting('adv-thinking-budget', 1024)) || 1024;
                const minimum = isPro ? 128 : model.startsWith('gemini-2.5-flash-lite') ? 512 : 0;
                const maximum = isPro ? 32768 : 24576;
                config.thinkingConfig = { thinkingBudget: Math.max(minimum, Math.min(maximum, budget)) };
            } else if (!isPro) {
                config.thinkingConfig = { thinkingBudget: 0 };
            }
        }

        return config;
    }

    async function getResearchGenerationConfig() {
        const config = getGenerationConfig();
        const selectedModel = getSelectedModel();
        let capabilities = geminiModelCapabilities.get(selectedModel);

        if (!capabilities) {
            const models = await fetchAvailableModels(getApiKeys()[0], getBaseUrl());
            capabilities = models.find(model => model.id === selectedModel);
        }

        const advertisedLimit = asPositiveInteger(capabilities?.max_output_tokens);
        const configuredLimit = asPositiveInteger(config.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS;
        // Research is a long structured document. Use the model's advertised
        // output capacity so an older persisted 4k/20k setting cannot truncate it.
        config.maxOutputTokens = advertisedLimit || Math.max(configuredLimit, DEFAULT_MAX_OUTPUT_TOKENS);
        return config;
    }

    function markGeminiWebSearchFailure(error) {
        if (!error || error.reason === 'MAX_TOKENS') return error;
        if (/\b(?:google_search|web[\s_-]*search)\b|\btools?\b[^\n]*(?:unsupported|not supported|unavailable|invalid|unknown)/i.test(String(error.message || ''))) {
            error.researchWebSearchFailed = true;
        }
        return error;
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

    // ============================================
    // API Call Functions
    // ============================================

    const normalizeGeminiReason = (value) => String(value ?? '').trim().toUpperCase();

    function createGeminiResponseError(reason, message = '') {
        const normalizedReason = normalizeGeminiReason(reason) || 'UNKNOWN';
        const detail = String(message || '').trim();
        const error = new Error(`[Gemini] Response rejected (${normalizedReason})${detail ? `: ${detail}` : ''}`);
        error.code = 'GEMINI_RESPONSE_REJECTED';
        error.reason = normalizedReason;
        return error;
    }

    function validateGeminiFinishReason(reason, allowUnspecified = false) {
        const normalizedReason = normalizeGeminiReason(reason);
        const isUnspecified = !normalizedReason ||
            normalizedReason === 'FINISH_REASON_UNSPECIFIED' ||
            normalizedReason === 'UNSPECIFIED' ||
            normalizedReason === '0';
        if (isUnspecified) {
            if (allowUnspecified) return '';
            throw createGeminiResponseError('MISSING_FINISH_REASON');
        }
        if (normalizedReason !== 'STOP') {
            throw createGeminiResponseError(normalizedReason);
        }
        return normalizedReason;
    }

    function readGeminiResponseText(data, allowUnspecifiedFinishReason = false) {
        if (data?.error) {
            throw new Error(`[Gemini] ${data.error.message || data.error.status || 'API response error'}`);
        }

        const blockReason = normalizeGeminiReason(data?.promptFeedback?.blockReason);
        if (blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED' && blockReason !== 'UNSPECIFIED' && blockReason !== '0') {
            throw createGeminiResponseError(blockReason, data?.promptFeedback?.blockReasonMessage);
        }

        const candidate = data?.candidates?.[0];
        validateGeminiFinishReason(candidate?.finishReason, allowUnspecifiedFinishReason);

        return (candidate?.content?.parts || [])
            .filter(part => part?.thought !== true && typeof part?.text === 'string')
            .map(part => part.text)
            .join('');
    }

    /**
     * Call Gemini API and return raw text response
     */
    async function callGeminiAPIRaw(prompt, maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3, transformResult = null) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            throw new Error('[Gemini] API key is required. Please configure your Gemini API key in settings.');
        }

        const model = getSelectedModel();
        if (!model) {
            throw new Error('[Gemini] Model is not selected. Please select a model in settings.');
        }
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        let lastError = null;

        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex];

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const baseUrl = getBaseUrl();
                    const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

                    const response = await window.ivLyricsFetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            ...(systemPrompt ? {
                                systemInstruction: { parts: [{ text: systemPrompt }] }
                            } : {}),
                            contents: [{
                                role: 'user',
                                parts: [{ text: userPrompt }]
                            }],
                            generationConfig: getGenerationConfig()
                        })
                    });

                    if (response.status === 429 || response.status === 403) {
                        window.__ivLyricsDebugLog?.(`[Gemini Addon] API key ${keyIndex + 1} failed (${response.status}), trying next...`);
                        break; // Try next key
                    }

                    if (!response.ok) {
                        // Try to parse error response for better error messages
                        let errorMessage = `HTTP ${response.status}`;
                        try {
                            const errorData = await response.json();
                            if (errorData.error?.message) {
                                errorMessage = errorData.error.message;
                            }
                        } catch (parseError) {
                            // Use default error message if parsing fails
                        }
                        throw new Error(`[Gemini] ${errorMessage}`);
                    }

                    const data = await response.json();
                    const rawText = readGeminiResponseText(data);

                    if (!rawText.trim()) {
                        throw new Error('[Gemini] Empty response from API');
                    }

                    return typeof transformResult === 'function'
                        ? transformResult(rawText)
                        : rawText;

                } catch (e) {
                    lastError = e;
                    window.__ivLyricsDebugLog?.(`[Gemini Addon] Attempt ${attempt + 1} failed:`, e.message);

                    if (attempt < maxRetries - 1) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    }
                }
            }
        }

        throw lastError || new Error('[Gemini] All API keys and retries exhausted');
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

    async function callGeminiAPIStream(
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
        if (apiKeys.length === 0) throw new Error('[Gemini] API key is required.');
        const model = getSelectedModel();
        if (!model) throw new Error('[Gemini] Model is not selected.');
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
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
                        window.__ivLyricsDebugLog?.('[Gemini Addon] Failed to reset provisional stream:', resetError?.message);
                    }

                    emittedProvisionalOutput = false;
                    emittedLineCount = 0;
                    receivedStreamText = false;
                };

                try {
                    const baseUrl = getBaseUrl();
                    const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

                    const response = await window.ivLyricsFetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...(systemPrompt ? {
                                systemInstruction: { parts: [{ text: systemPrompt }] }
                            } : {}),
                            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                            generationConfig: getGenerationConfig(),
                            ...requestOverrides
                        })
                    }, requestTimeoutMs);

                    if (response.status === 429 || response.status === 403) { break; }
                    if (!response.ok) {
                        let msg = `HTTP ${response.status}`;
                        try { const d = await response.json(); if (d.error?.message) msg = d.error.message; } catch (e) { }
                        throw new Error(`[Gemini] ${msg}`);
                    }

                    const consumeGeminiStream = async () => {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let sseBuffer = '';
                    let accumulated = '';
                    let finalFinishReason = '';
                    const lineState = { index: 0, offset: 0 };

                    const processSseLine = (line) => {
                        const trimmedLine = String(line || '').trim();
                        if (!trimmedLine.startsWith('data:')) return;

                        const payload = trimmedLine.slice(5).trimStart();
                        if (!payload || payload === '[DONE]') return;

                        const parsed = JSON.parse(payload);
                        const finishReason = validateGeminiFinishReason(
                            parsed?.candidates?.[0]?.finishReason,
                            true
                        );
                        const text = readGeminiResponseText(parsed, true);
                        if (text) {
                            accumulated += text;
                            receivedStreamText = true;
                            if (typeof onRawChunk === 'function') onRawChunk(text);
                        }
                        if (finishReason) finalFinishReason = finishReason;
                    };

                    const drainSseBuffer = (flush = false) => {
                        const parts = sseBuffer.split(/\r?\n/);
                        if (flush) {
                            sseBuffer = '';
                        } else {
                            sseBuffer = parts.pop() || '';
                        }
                        for (const line of parts) processSseLine(line);
                        if (flush && sseBuffer) processSseLine(sseBuffer);
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

                    validateGeminiFinishReason(finalFinishReason);
                    if (!accumulated.trim()) throw new Error('[Gemini] Empty response from streaming API');

                    const transformed = typeof transformResult === 'function'
                        ? transformResult(accumulated)
                        : accumulated;

                    if (Array.isArray(transformed) && typeof onLine === 'function') {
                        const provisionalLines = accumulated.split('\n');
                        transformed.forEach((line, index) => {
                            if (index >= emittedLineCount || provisionalLines[index] !== line) onLine(index, line);
                        });
                        for (let index = transformed.length; index < emittedLineCount; index++) {
                            onLine(index, '');
                        }
                    }

                    return transformed;
                    };

                    return await consumeGeminiStream();

                } catch (e) {
                    lastError = e;
                    resetProvisionalOutput(attempt < maxRetries - 1 ? 'retry' : 'failed', e);
                    if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        throw lastError || new Error('[Gemini] All API keys and retries exhausted');
    }

    /**
     * Call Gemini API and parse JSON response (for metadata, TMI, etc.)
     */
    async function callGeminiAPI(prompt, maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3) {
        const rawText = await callGeminiAPIRaw(prompt, maxRetries);
        return extractJSON(rawText);
    }

    /**
     * Parse plain text lines from API response
     */
    function parseTextLines(text, expectedSourceLines) {
        if (text === null || text === undefined) {
            throw new Error('[Gemini] Empty response from API');
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
            throw new Error(`[Gemini] Invalid response line count: expected ${expectedLineCount}, got ${lines.length}`);
        }
        if (validLines.every(line => !String(line).trim())) {
            throw new Error('[Gemini] Empty response from API');
        }
        if (sourceLines) {
            const missingLineIndex = validLines.findIndex((line, index) => sourceLines[index].trim() && !String(line).trim());
            if (missingLineIndex >= 0) {
                throw new Error(`[Gemini] Empty response line at index ${missingLineIndex + 1}`);
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
    // Addon Implementation
    // ============================================

    const GeminiAddon = {
        ...ADDON_INFO,

        async init() {
            window.__ivLyricsDebugLog?.(`[Gemini Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 연결 테스트 (SettingsUIBuilder/AddonUI에서 사용)
         */
        async testConnection() {
            await callGeminiAPIRaw('Reply with just "OK" if you receive this.');
        },

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState, useCallback, useEffect } = React;

            return function GeminiSettings() {
                const initialApiKeys = getSetting('api-keys', '') || getSetting('api-key', '');
                const [apiKeys, setApiKeys] = useState(
                    Array.isArray(initialApiKeys) ? JSON.stringify(initialApiKeys) : initialApiKeys
                );
                const [baseUrl, setBaseUrl] = useState(getSetting('base-url', 'https://generativelanguage.googleapis.com/v1beta'));
                const [model, setModel] = useState(getSelectedModel());
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
                        window.__ivLyricsDebugLog?.('[Gemini Addon] Failed to load models:', e);
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

                const renderApiKeyRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('apiKey', 'API Key(s)')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('input', {
                                type: 'text',
                                value: apiKeys,
                                onChange: handleApiKeyChange,
                                placeholder: 'AIza...'
                            }),
                            React.createElement('button', {
                                type: 'button',
                                onClick: () => window.open(ADDON_INFO.apiKeyUrl, '_blank'),
                                className: 'ai-addon-btn ai-addon-btn-secondary'
                            }, aiText('getApiKey', 'Get API Key'))
                        ),
                        React.createElement('small', null, aiText('apiKeyRotationDesc', 'Enter a single key or JSON array for rotation'))
                    );
                const renderBaseUrlRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('baseUrl', 'Base URL')),
                        React.createElement('input', {
                            type: 'text',
                            value: baseUrl,
                            onChange: handleBaseUrlChange,
                            placeholder: 'https://generativelanguage.googleapis.com/v1beta'
                        }),
                        React.createElement('small', null, aiText('geminiBaseUrlDesc', 'Change this to use Gemini-compatible APIs'))
                    );
                const renderModelRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('model', 'Model')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('select', {
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
                            React.createElement('button', {
                                type: 'button',
                                onClick: handleRefreshModels,
                                className: 'ai-addon-btn ai-addon-btn-secondary ai-addon-connection-icon',
                                disabled: modelsLoading || !hasApiKey,
                                'aria-label': aiText('refreshModels', 'Refresh model list'),
                                title: aiText('refreshModels', 'Refresh model list')
                            }, modelsLoading ? '...' : '↻')
                        ),
                        availableModels.length > 0 && React.createElement('small', null, aiText('modelsAvailable', '{count} models available', { count: availableModels.length }))
                    );
                const renderTestRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('button', { type: 'button', onClick: handleTest, className: 'ai-addon-btn ai-addon-btn-primary' }, aiText('testConnection', 'Test Connection')),
                        testStatus && React.createElement('span', {
                            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                        }, testStatus)
                    );

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
                const [expanded, setExpanded] = useState(getSetting('adv-expanded', false));
                const [maxTokensEnabled, setMaxTokensEnabled] = useState(getSetting('adv-maxOutputTokens-enabled', true));
                const [maxTokensValue, setMaxTokensValue] = useState(getSetting('adv-maxOutputTokens-value', DEFAULT_MAX_OUTPUT_TOKENS));
                const [thinkingEnabled, setThinkingEnabled] = useState(getSetting('adv-thinking-enabled', false));
                const [thinkingBudget, setThinkingBudget] = useState(getSetting('adv-thinking-budget', 1024));

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
                                onChange: (e) => { const v = parseInt(e.target.value) || DEFAULT_MAX_OUTPUT_TOKENS; setMaxTokensValue(v); setSetting('adv-maxOutputTokens-value', v); }
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

        async translateLyrics({ text, lang, wantSmartPhonetic, translationPrompt, phoneticPrompt, onLine, onStreamReset }) {
            if (!text?.trim()) {
                throw new Error('No text provided');
            }

            const sourceLines = String(text).replace(/\r\n?/g, '\n').split('\n');
            const prompt = wantSmartPhonetic ? phoneticPrompt : translationPrompt;
            if (!prompt) {
                throw new Error('[Google Gemini] Central lyrics prompt is unavailable.');
            }
            const parseLines = rawResponse => parseTextLines(rawResponse, sourceLines);

            // Validate inside the provider retry loop so partial/blocked output can retry safely.
            const lines = onLine
                ? await callGeminiAPIStream(prompt, onLine, onStreamReset, undefined, parseLines)
                : await callGeminiAPIRaw(prompt, undefined, parseLines);

            // Return in the format expected by LyricsService
            return wantSmartPhonetic ? { phonetic: lines } : { translation: lines };
        },

        async generateCharacterPronunciation({ lines, characterPronunciationPrompt }) {
            if (!Array.isArray(lines) || lines.length === 0) {
                throw new Error('No lines provided');
            }

            const prompt = characterPronunciationPrompt;
            if (!prompt) {
                throw new Error('[Google Gemini] Central character pronunciation prompt is unavailable.');
            }
            const result = await callGeminiAPI(prompt);
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
                throw new Error('[Google Gemini] Central metadata translation prompt is unavailable.');
            }
            const result = await callGeminiAPI(prompt);

            // Normalize result to match expected format in FullscreenOverlay.js
            return {
                translated: {
                    title: result.translatedTitle || result.title || title,
                    artist: result.translatedArtist || result.artist || artist
                },
                romanized: {
                    title: result.romanizedTitle || title,
                    artist: result.romanizedArtist || artist
                }
            };
        },

        async generateTMI({ title, artist, tmiPrompt, requestTimeoutMs, onResearchProgress, webSearch = true }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = tmiPrompt;
            if (!prompt) {
                throw new Error('[Google Gemini] Central TMI prompt is unavailable.');
            }
            let progressParser = window.AIAddonManager?.createResearchStreamProgressParser?.(onResearchProgress) || null;
            const resetProgress = progressParser
                ? (details) => {
                    progressParser = window.AIAddonManager.createResearchStreamProgressParser(onResearchProgress);
                    onResearchProgress(null, { ...details, reset: true });
                }
                : null;
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
                    progressParser ? chunk => progressParser.push(chunk) : null,
                    requestOverrides
                );
            } catch (error) {
                throw webSearch === false ? error : markGeminiWebSearchFailure(error);
            }
        },

        async generateMotionDirection(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }
            const prompt = params.motionDirectionPrompt;
            if (!prompt) {
                throw new Error('[Gemini] Central motion direction prompt is unavailable.');
            }
            return await callGeminiAPI(prompt);
        },

        async generateLyricsStudy(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }

            const prompt = params.lyricsStudyPrompt;
            if (!prompt) {
                throw new Error('[Google Gemini] Central lyrics study prompt is unavailable.');
            }
            return await callGeminiAPI(prompt);
        },

        async generateCulturalAnnotations(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }
            const prompt = params.culturalAnnotationsPrompt;
            if (!prompt) {
                throw new Error('[Google Gemini] Central cultural annotations prompt is unavailable.');
            }
            return await callGeminiAPI(prompt);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            window.AIAddonManager.register(GeminiAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    window.__ivLyricsDebugLog?.('[Gemini Addon] Module loaded');
})();
