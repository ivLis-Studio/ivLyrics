/**
 * Perplexity AI Addon for ivLyrics
 * Perplexity AI를 사용한 번역, 발음, Research 생성
 *
 * @author default
 * @version 2.0.0
 */

(() => {
    'use strict';

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
            culturalAnnotations: true
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
            const response = await window.ivLyricsFetch(MODELS_URL, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                window.__ivLyricsDebugLog?.('[Perplexity Addon] Failed to fetch models:', response.status);
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
            window.__ivLyricsDebugLog?.('[Perplexity Addon] Error fetching models:', e.message);
            return [];
        }
    }

    async function getModels() {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) return [];
        return await fetchAvailableModels(apiKeys[0]);
    }

    // ============================================
    // Helper Functions
    // ============================================

    function aiText(key, fallback) {
        const path = `settings.aiProviders.${key}`;
        const value = window.I18n?.t?.(path);
        return value && value !== path ? value : fallback;
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

    function normalizePromptRequest(prompt) {
        if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
            return {
                systemPrompt: String(prompt.systemPrompt || '').trim(),
                userPrompt: String(prompt.userPrompt ?? prompt.prompt ?? '')
            };
        }
        return { systemPrompt: '', userPrompt: String(prompt ?? '') };
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
    async function postAgentRequest(apiKey, body, timeoutMs) {
        const send = requestBody => window.ivLyricsFetch(AGENT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(requestBody)
        }, timeoutMs);

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

    async function callPerplexityAPIRaw(prompt, maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3, transformResult = null) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            throw new Error('[Perplexity] API key is required. Please configure your API key in settings.');
        }

        let lastError = null;

        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex];

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const response = await postAgentRequest(apiKey, buildAgentRequestBody(prompt));
                    const rawText = readAgentResponseText(await response.json());

                    if (!rawText.trim()) {
                        throw new Error('[Perplexity] Empty response from API');
                    }

                    return typeof transformResult === 'function'
                        ? transformResult(rawText)
                        : rawText;

                } catch (e) {
                    lastError = e;
                    window.__ivLyricsDebugLog?.(`[Perplexity Addon] Key ${keyIndex + 1}, attempt ${attempt + 1} failed:`, e.message);

                    if (PERMANENT_HTTP_STATUSES.has(e.status)) throw e;
                    if (KEY_LIMIT_HTTP_STATUSES.has(e.status)) break; // Try next key

                    if (attempt < maxRetries - 1) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    }
                }
            }
        }

        throw lastError || new Error('[Perplexity] All API keys and retries exhausted');
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

    async function callPerplexityAPIStream(
        prompt,
        onLine,
        onStreamReset,
        maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        requestTimeoutMs = window.ivLyricsFetch?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        { webSearch = false } = {}
    ) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) throw new Error('[Perplexity] API key is required.');
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
                        window.__ivLyricsDebugLog?.('[Perplexity Addon] Failed to reset provisional stream:', resetError?.message);
                    }

                    emittedProvisionalOutput = false;
                    emittedLineCount = 0;
                    receivedStreamText = false;
                };

                try {
                    const response = await postAgentRequest(
                        apiKey,
                        buildAgentRequestBody(prompt, { stream: true, webSearch }),
                        requestTimeoutMs
                    );
                    const consumePerplexityStream = async () => {
                    let accumulated = '';
                    const streamState = createAgentStreamState();
                    const lineState = { index: 0, offset: 0 };
                    const appendText = (chunk) => {
                        if (!chunk) return;
                        accumulated += chunk;
                        receivedStreamText = true;
                        if (typeof onRawChunk === 'function') onRawChunk(chunk);
                    };
                    const emitCompletedLines = (flush) => {
                        const beforeEmitCount = lineState.index;
                        emitStreamingLines(accumulated, onLine, lineState, flush);
                        if (lineState.index > beforeEmitCount) {
                            emittedProvisionalOutput = true;
                            emittedLineCount = Math.max(emittedLineCount, lineState.index);
                        }
                    };

                    const contentType = String(response.headers?.get?.('content-type') || '');
                    if (/json/i.test(contentType) && !/event-stream/i.test(contentType)) {
                        // ivLyricsFetch's CORS fallback buffers a stream into one Response object.
                        appendText(readAgentResponseText(await response.json()));
                        streamState.completed = true;
                    } else {
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        let sseBuffer = '';
                        const consumeSSELine = (rawLine) => {
                            const line = String(rawLine || '').trim();
                            if (!line.startsWith('data:')) return;
                            const payload = line.slice(5).trimStart();
                            if (!payload || payload === '[DONE]') return;
                            appendText(streamState.consume(JSON.parse(payload)));
                        };

                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            sseBuffer += decoder.decode(value, { stream: true });
                            const parts = sseBuffer.split(/\r?\n/);
                            sseBuffer = parts.pop() || '';
                            for (const line of parts) consumeSSELine(line);
                            emitCompletedLines(false);
                        }

                        sseBuffer += decoder.decode();
                        if (sseBuffer.trim()) consumeSSELine(sseBuffer);
                    }
                    if (!streamState.completed) throw createPerplexityResponseError('missing_completion');

                    emitCompletedLines(true);

                    const finalText = webSearch ? accumulated.replace(WEB_CITATION_MARKER, '') : accumulated;
                    if (!finalText.trim()) throw new Error('[Perplexity] Empty response from streaming API');

                    const transformed = typeof transformResult === 'function'
                        ? transformResult(finalText)
                        : finalText;

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

                    return await consumePerplexityStream();
                } catch (e) {
                    lastError = e;
                    const isPermanentError = PERMANENT_HTTP_STATUSES.has(e.status);
                    resetProvisionalOutput(isPermanentError || attempt >= maxRetries - 1 ? 'failed' : 'retry', e);
                    if (isPermanentError) throw e;
                    if (KEY_LIMIT_HTTP_STATUSES.has(e.status)) break; // Try next key
                    if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        throw lastError || new Error('[Perplexity] All API keys and retries exhausted');
    }

    async function callPerplexityAPI(prompt, maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3) {
        const rawText = await callPerplexityAPIRaw(prompt, maxRetries);
        return extractJSON(rawText);
    }

    function parseTextLines(text, expectedSourceLines) {
        if (text === null || text === undefined) {
            throw new Error('[Perplexity] Empty response from API');
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
            throw new Error(`[Perplexity] Invalid response line count: expected ${expectedLineCount}, got ${lines.length}`);
        }
        if (validLines.every(line => !String(line).trim())) {
            throw new Error('[Perplexity] Empty response from API');
        }
        if (sourceLines) {
            const missingLineIndex = validLines.findIndex((line, index) => sourceLines[index].trim() && !String(line).trim());
            if (missingLineIndex >= 0) {
                throw new Error(`[Perplexity] Empty response line at index ${missingLineIndex + 1}`);
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

    const PerplexityAddon = {
        ...ADDON_INFO,

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState, useCallback } = React;

            return function PerplexitySettings() {
                const initialApiKeys = getSetting('api-keys', '') || getSetting('api-key', '');
                const [apiKeys, setApiKeys] = useState(
                    Array.isArray(initialApiKeys) ? JSON.stringify(initialApiKeys) : initialApiKeys
                );
                const [selectedModel, setSelectedModel] = useState(getSelectedModel());
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

                const handleTest = async () => {
                    setTestStatus(aiText('testingConnection', 'Testing...'));
                    try {
                        const result = await callPerplexityAPIRaw('Say "Hello" in one word.');
                        setTestStatus(result
                            ? '✓ ' + aiText('connectionSuccess', 'Connection successful')
                            : '✗ ' + aiText('emptyResponse', 'Empty response'));
                    } catch (e) {
                        setTestStatus(`✗ ${e.message}`);
                    }
                };

                const [availableModels, setAvailableModels] = useState([]);
                const [modelsLoading, setModelsLoading] = useState(false);

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
                        if (models.length > 0) {
                            ADDON_INFO.models = models;
                            // A retired or unknown saved id would otherwise stay selected unseen.
                            const current = getSelectedModel();
                            if (!models.some(model => model.id === current)) {
                                const next = (models.find(model => model.id === DEFAULT_MODEL) || models[0]).id;
                                setSelectedModel(next);
                                setSetting('model', next);
                            }
                        }
                    } catch (e) {
                        console.error('[Perplexity Addon] Failed to load models:', e);
                    }
                    setModelsLoading(false);
                }, [apiKeys]);

                React.useEffect(() => {
                    const keys = getApiKeys();
                    if (keys.length > 0) {
                        loadModels();
                    } else {
                        setAvailableModels([]);
                    }
                }, [apiKeys]);




                const hasApiKey = getApiKeys().length > 0;

                const renderApiKeyRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, aiText('apiKey', 'API Key(s)')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('input', {
                                type: 'text',
                                value: apiKeys,
                                onChange: handleApiKeyChange,
                                placeholder: 'pplx-...'
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
                                value: selectedModel,
                                onChange: handleModelChange,
                                disabled: modelsLoading
                            },
                                modelsLoading
                                    ? React.createElement('option', { value: '' }, aiText('loadingModels', 'Loading models...'))
                                    : availableModels.length > 0
                                        ? availableModels.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name))
                                        : React.createElement('option', { value: selectedModel }, selectedModel || (hasApiKey ? aiText('noModels', 'No models found') : aiText('enterApiKeyFirst', 'Enter API key first')))
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
                        React.createElement('small', null, aiText('perplexityAgentModels', 'Models load automatically from the Perplexity Agent API with your key. Music research also searches the web.'))
                    );
                const renderTestRow = () => React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('button', { type: 'button', onClick: handleTest, className: 'ai-addon-btn ai-addon-btn-primary' }, aiText('testConnection', 'Test Connection')),
                        testStatus && React.createElement('span', {
                            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                        }, testStatus)
                    );

                return React.createElement('div', { className: 'ai-addon-settings perplexity-settings' },
                    renderApiKeyRow(),
                    renderModelRow(),
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
                throw new Error('[Perplexity] Central lyrics prompt is unavailable.');
            }
            const parseLines = rawResponse => parseTextLines(rawResponse, sourceLines);

            const lines = onLine
                ? await callPerplexityAPIStream(prompt, onLine, onStreamReset, undefined, parseLines)
                : await callPerplexityAPIRaw(prompt, undefined, parseLines);

            return wantSmartPhonetic ? { phonetic: lines } : { translation: lines };
        },

        async generateCharacterPronunciation({ lines, characterPronunciationPrompt }) {
            if (!Array.isArray(lines) || lines.length === 0) {
                throw new Error('No lines provided');
            }

            const prompt = characterPronunciationPrompt;
            if (!prompt) {
                throw new Error('[Perplexity] Central character pronunciation prompt is unavailable.');
            }
            const result = await callPerplexityAPI(prompt);
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
                throw new Error('[Perplexity] Central metadata translation prompt is unavailable.');
            }
            const result = await callPerplexityAPI(prompt);

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
                throw new Error('[Perplexity] Central TMI prompt is unavailable.');
            }
            let progressParser = window.AIAddonManager?.createResearchStreamProgressParser?.(onResearchProgress) || null;
            const resetProgress = progressParser
                ? (details) => {
                    progressParser = window.AIAddonManager.createResearchStreamProgressParser(onResearchProgress);
                    onResearchProgress(null, { ...details, reset: true });
                }
                : null;
            return await callPerplexityAPIStream(
                prompt,
                null,
                resetProgress,
                1,
                extractJSON,
                requestTimeoutMs,
                progressParser ? chunk => progressParser.push(chunk) : null,
                { webSearch: webSearch !== false }
            );
        },

        async generateLyricsStudy(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }

            const prompt = params.lyricsStudyPrompt;
            if (!prompt) {
                throw new Error('[Perplexity] Central lyrics study prompt is unavailable.');
            }
            return await callPerplexityAPI(prompt);
        },

        async generateCulturalAnnotations(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }
            const prompt = params.culturalAnnotationsPrompt;
            if (!prompt) {
                throw new Error('[Perplexity] Central cultural annotations prompt is unavailable.');
            }
            return await callPerplexityAPI(prompt);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            migrateLegacyModelSetting();
            window.AIAddonManager.register(PerplexityAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    window.__ivLyricsDebugLog?.('[Perplexity Addon] Module loaded');
})();
