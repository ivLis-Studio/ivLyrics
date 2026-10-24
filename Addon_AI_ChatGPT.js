/**
 * ChatGPT AI Addon for ivLyrics
 * OpenAI ChatGPT를 사용한 번역, 발음, Research 생성
 *
 * @author default
 * @version 1.0.2
 */

(() => {
    'use strict';

    function createOpenAICompatibleAddon(config = {}) {
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
            culturalAnnotations: true
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

    /**
     * OpenAI API에서 사용 가능한 모델 목록을 가져옴 (채팅/텍스트 생성용 모델만)
     */
    async function fetchAvailableModels(apiKey, baseUrl) {
        if (!apiKey) return [];

        const normalizedBaseUrl = (baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
        const isOpenAIBaseUrl = normalizedBaseUrl === 'https://api.openai.com/v1';

        // 제외할 모델 패턴 (이미지 생성, 음성, 임베딩 등)
        const excludePatterns = [
            'dall-e',        // 이미지 생성
            'whisper',       // 음성 인식
            'tts',           // 텍스트 음성 변환
            'embedding',     // 임베딩
            'text-embedding',// 임베딩
            'davinci',       // 레거시 completion 모델
            'curie',         // 레거시
            'babbage',       // 레거시
            'ada',           // 레거시 (ada만, 단독으로)
            'audio',         // 오디오 관련
            'moderation',    // 콘텐츠 모더레이션
            'search',        // 검색
            'similarity',    // 유사도
            'code-',         // 레거시 코드 모델
            'text-davinci',  // 레거시
            'gpt-3.5-turbo-instruct', // instruct 모델
            'image',         // 이미지 관련
        ];

        try {
            const endpoint = `${normalizedBaseUrl}/models`;
            const response = await window.ivLyricsFetch(endpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                window.__ivLyricsDebugLog?.('[ChatGPT Addon] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            let models = (data.data || [])
                .filter(m => m.id)
                .map(m => ({
                    id: m.id,
                    name: m.id,
                    owned_by: m.owned_by || ''
                }));

            // OpenAI 기본 API에서는 기존처럼 채팅용 모델만 추려서 노출한다.
            // 사용자가 Base URL을 바꾼 OpenAI 호환 서버는 임의 모델명을 쓸 수 있으므로 이름 검사를 건너뛴다.
            if (isOpenAIBaseUrl) {
                models = models
                    .filter(m => {
                        const id = m.id.toLowerCase();
                        // GPT 또는 chat 모델만 포함
                        if (!id.startsWith('gpt') && !id.includes('chat') && !id.includes('o1') && !id.includes('o3')) return false;
                        // 제외 패턴 체크
                        for (const pattern of excludePatterns) {
                            if (id.includes(pattern.toLowerCase())) return false;
                        }
                        // realtime 모델 제외
                        if (id.includes('realtime')) return false;
                        return true;
                    })
                    // 정렬: gpt-5 > gpt-4 > o3 > o1 순서
                    .sort((a, b) => {
                        // GPT 모델과 o-시리즈 구분
                        const aIsGpt = a.id.startsWith('gpt-');
                        const bIsGpt = b.id.startsWith('gpt-');
                        const aIsO = a.id.match(/^o(\d)/);
                        const bIsO = b.id.match(/^o(\d)/);

                        // GPT 모델이 o-시리즈보다 먼저
                        if (aIsGpt && !bIsGpt) return -1;
                        if (!aIsGpt && bIsGpt) return 1;

                        // 둘 다 GPT 모델인 경우: gpt-5 > gpt-4 > gpt-3.5
                        if (aIsGpt && bIsGpt) {
                            const aMatch = a.id.match(/gpt-(\d+(?:\.\d+)?)/);
                            const bMatch = b.id.match(/gpt-(\d+(?:\.\d+)?)/);
                            const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
                            const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
                            if (bNum !== aNum) return bNum - aNum;

                            // 같은 버전이면 turbo, mini 순서
                            if (a.id.includes('turbo') && !b.id.includes('turbo')) return -1;
                            if (!a.id.includes('turbo') && b.id.includes('turbo')) return 1;
                        }

                        // 둘 다 o-시리즈인 경우: o3 > o1
                        if (aIsO && bIsO) {
                            return parseInt(bIsO[1]) - parseInt(aIsO[1]);
                        }

                        return a.id.localeCompare(b.id);
                    });
            } else {
                models.sort((a, b) => a.id.localeCompare(b.id));
            }

            // 첫 번째 모델을 기본값으로 설정
            if (models.length > 0) {
                models[0].default = true;
            }

            return models;
        } catch (e) {
            window.__ivLyricsDebugLog?.('[ChatGPT Addon] Error fetching models:', e.message);
            return [];
        }
    }

    /**
     * 모델 목록 가져오기 (매번 API에서 로드)
     */
    async function getModels() {
        const apiKeys = getApiKeys();
        const baseUrl = getSetting('base-url', DEFAULT_OPENAI_BASE_URL);
        if (apiKeys.length === 0) return [];
        return await fetchAvailableModels(apiKeys[0], baseUrl);
    }

    // ============================================
    // Helper Functions
    // ============================================

    function getSetting(key, defaultValue = null) {
        return window.AIAddonManager?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    function setSetting(key, value) {
        if (typeof window.AIAddonManager?.setAddonSetting === 'function') {
            window.AIAddonManager.setAddonSetting(ADDON_INFO.id, key, value);
        }
    }

    function t(key, fallback, params) {
        const value = window.I18n?.t?.(key, params);
        if (value && value !== key) return value;
        return params ? String(fallback).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match) : fallback;
    }

    const aiText = (key, fallback, params) => t(`settings.aiProviders.${key}`, fallback, params);

    function getApiKeys(connection = null) {
        if (connection) return parseConnectionKeys(connection.apiKeys);
        return parseConnectionKeys(getSetting('api-keys', '') || getSetting('api-key', ''));
    }

    function normalizeBaseUrl(value) {
        return String(value || '').trim().replace(/\/+$/, '');
    }

    function getBaseUrl(connection = null) {
        if (connection) return normalizeBaseUrl(connection.baseUrl) || DEFAULT_OPENAI_BASE_URL;
        return getSetting('base-url', DEFAULT_OPENAI_BASE_URL) || DEFAULT_OPENAI_BASE_URL;
    }

    function getSelectedModel(connection = null) {
        if (connection) return String(connection.model || '').trim();
        return getSetting('model', null);
    }

    function resolveApiCredentials(connection) {
        const apiKeys = getApiKeys(connection);
        if (apiKeys.length === 0) {
            throw new Error('[ChatGPT] API key is required. Please configure your API key in settings.');
        }

        const baseUrl = getBaseUrl(connection);
        const model = getSelectedModel(connection);
        if (!model) {
            throw new Error('[ChatGPT] Model is not selected. Please select a model in settings.');
        }
        return { apiKeys, baseUrl, model };
    }

    function createEndpointId() {
        return `ep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Capabilities that can be toggled per endpoint. These mirror the
     * AIAddonManager capabilities for this addon plus its researchWebSearch
     * support flag: endpoints without web search serve Research through
     * plain chat completions instead of the Responses API.
     */
    const ENDPOINT_CAPABILITIES = ['pronunciation', 'translate', 'metadata', 'tmi', 'researchWebSearch', 'lyricsStudy', 'characterPronunciation', 'culturalAnnotations', 'wordSupplements'];
    const ENDPOINT_CAPABILITY_FALLBACKS = {
        pronunciation: 'Pronunciation',
        translate: 'Translation',
        metadata: 'Metadata',
        tmi: 'TMI',
        researchWebSearch: 'Research web search',
        lyricsStudy: 'Learning',
        characterPronunciation: 'Character pronunciation',
        culturalAnnotations: 'Cultural context',
        wordSupplements: 'Word details'
    };

    function isEndpointCapabilityEnabled(capabilities, capability) {
        if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return true;
        const value = capabilities[capability];
        if (value === undefined || value === null) {
            // Endpoints saved before pronunciation had its own chip keep
            // following their translation choice until it is set separately.
            return capability === 'pronunciation' ? isEndpointCapabilityEnabled(capabilities, 'translate') : true;
        }
        return value === true || value === 'true';
    }

    function toggleEndpointCapability(capabilities, capability) {
        const current = capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities) ? capabilities : {};
        const next = { ...current };
        if (capability === 'translate' && (next.pronunciation === undefined || next.pronunciation === null)) {
            // Pin the inherited value so turning translation off leaves pronunciation as it was.
            next.pronunciation = isEndpointCapabilityEnabled(current, 'pronunciation');
        }
        next[capability] = !isEndpointCapabilityEnabled(current, capability);
        return next;
    }

    // The provider-level switch is the ceiling: an endpoint can only serve a
    // capability while the master switch allows it, but its own choice stays
    // saved so re-enabling the master restores it.
    function isEffectiveCapability(masterEnabled, endpointCapabilities, capability) {
        return masterEnabled === true && isEndpointCapabilityEnabled(endpointCapabilities, capability);
    }

    function isMasterCapabilityEnabled(capability) {
        try {
            return window.AIAddonManager?.isCapabilityEnabled?.(ADDON_INFO.id, capability) ?? true;
        } catch {
            return true;
        }
    }

    function getPrimaryCapabilities() {
        const raw = getSetting('primary-capabilities', null);
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
        // One-time migration: capability choices made under the old
        // provider-level keys (addon:chatgpt:capability:*) must carry over
        // to endpoint-level gating, otherwise a previously disabled
        // capability (e.g. metadata) silently re-enables on upgrade.
        // Missing keys default to enabled; persist the seed so later edits
        // happen through this addon's endpoint UI.
        const seeded = {};
        for (const capability of ENDPOINT_CAPABILITIES) {
            let enabled = true;
            try {
                enabled = window.AIAddonManager?.isCapabilityEnabled?.(ADDON_INFO.id, capability) ?? true;
            } catch {
                enabled = true;
            }
            seeded[capability] = enabled === true || enabled === 'true';
        }
        setPrimaryCapabilities(seeded);
        return seeded;
    }

    function setPrimaryCapabilities(capabilities) {
        setSetting('primary-capabilities', capabilities && typeof capabilities === 'object' ? capabilities : {});
    }

    /**
     * Flatten the primary and unified provider list into ordered request targets.
     * Each target: { label, baseUrl, apiKey, model, researchWebSearch }.
     * When a capability is given, only endpoints with that capability enabled
     * are included (missing capabilities entry means all enabled).
     */
    function getRequestTargets(capability = null) {
        const targets = [];
        const seen = new Set();
        for (const connection of getProviderConnections()) {
            if (capability && !isEffectiveCapability(isMasterCapabilityEnabled(capability), connection.capabilities, capability)) continue;
            const baseUrl = normalizeBaseUrl(connection.baseUrl) || DEFAULT_OPENAI_BASE_URL;
            const researchWebSearch = isEndpointCapabilityEnabled(connection.capabilities, 'researchWebSearch');
            for (const apiKey of parseConnectionKeys(connection.apiKeys)) {
                const key = JSON.stringify([baseUrl, apiKey, connection.model, capability === 'tmi' && researchWebSearch]);
                if (seen.has(key)) continue;
                seen.add(key);
                targets.push({
                    label: connection.name,
                    baseUrl,
                    apiKey,
                    model: connection.model,
                    researchWebSearch
                });
            }
        }
        return targets;
    }

    function ensureRequestTargets(targets, capability = null) {
        if (!targets.length) {
            if (capability) {
                throw new Error(`[ChatGPT] No endpoint has the '${capability}' capability enabled. Enable it for at least one endpoint in settings.`);
            }
            throw new Error('[ChatGPT] API key is required. Please configure your API key in settings.');
        }
        if (targets.every(target => !target.model)) {
            throw new Error('[ChatGPT] Model is not selected. Please select a model in settings.');
        }
        return targets;
    }


    function parseConnectionKeys(raw) {
        if (Array.isArray(raw)) return raw.filter(key => typeof key === 'string').map(key => key.trim()).filter(Boolean);
        if (typeof raw !== 'string') return [];
        try { if (raw.trim().startsWith('[')) return parseConnectionKeys(JSON.parse(raw)); } catch { }
        return raw.split(/[\n,]/).map(key => key.trim()).filter(Boolean);
    }

    function parseProviderList(raw) {
        let value = raw;
        if (typeof value === 'string') {
            if (!value.trim()) return [];
            try { value = JSON.parse(value); } catch { return null; }
        }
        if (!Array.isArray(value)) return null;
        return value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
    }

    function normalizeProviderConnection(item, index, fromEndpoint = false) {
        const { label, apiKey, api_key, customModel, custom_model, ...saved } = item;
        const keys = parseConnectionKeys(item.apiKeys ?? apiKey ?? api_key);
        const model = String(item.model || customModel || custom_model || '').trim();
        return {
            ...saved,
            id: String(item.id || `${fromEndpoint ? 'endpoint' : 'connection'}-${index}`),
            name: String(item.name || label || `API ${index + 1}`).trim(),
            baseUrl: normalizeBaseUrl(item.baseUrl) || DEFAULT_OPENAI_BASE_URL,
            apiKeys: keys.length > 1 ? JSON.stringify(keys) : keys[0] || '',
            model,
            inheritPrimaryModel: item.inheritPrimaryModel === true || (fromEndpoint && !model),
            enabled: item.enabled !== false && item.enabled !== 'false',
            capabilities: item.capabilities && typeof item.capabilities === 'object' && !Array.isArray(item.capabilities)
                ? { ...item.capabilities } : {}
        };
    }

    function getFallbackProviders() {
        const existing = parseProviderList(getSetting('fallback-providers', []));
        const imported = parseProviderList(getSetting('extra-endpoints', []));
        const connections = (existing || []).map((item, index) => normalizeProviderConnection(item, index));
        if (!imported?.length) return connections;

        // Keep the released list and its order. Fold PR-era endpoints into it
        // once, preserving incomplete drafts as well as saved credentials.
        const identity = connection => {
            const keys = parseConnectionKeys(connection.apiKeys);
            return keys.length ? JSON.stringify([
                connection.baseUrl, keys,
                connection.model || (connection.inheritPrimaryModel ? getSelectedModel() : '')
            ]) : null;
        };
        for (const [index, item] of imported.entries()) {
            const connection = normalizeProviderConnection(item, index, true);
            const key = identity(connection);
            const duplicate = key && connections.find(saved => identity(saved) === key);
            if (duplicate) {
                duplicate.capabilities = { ...connection.capabilities, ...duplicate.capabilities };
                duplicate.enabled = duplicate.enabled && connection.enabled;
                continue;
            }
            while (connections.some(saved => saved.id === connection.id)) connection.id += '-imported';
            connections.push(connection);
        }
        if (existing && typeof window.AIAddonManager?.setAddonSetting === 'function') {
            try {
                setSetting('fallback-providers', connections);
                // Retire the second store only after the canonical write can
                // be read back. Interrupted/failed migration remains retryable.
                if (JSON.stringify(parseProviderList(getSetting('fallback-providers', []))) === JSON.stringify(connections)) {
                    setSetting('extra-endpoints', []);
                }
            } catch { /* retain the source list if persistence is unavailable */ }
        }
        return connections;
    }

    function getProviderConnections() {
        return [
            { id: 'primary', name: 'Primary', apiKeys: getApiKeys(), baseUrl: getBaseUrl(),
                model: getSelectedModel(), capabilities: getPrimaryCapabilities() },
            ...getFallbackProviders().filter(connection => connection.enabled).map(connection => ({
                ...connection,
                model: connection.model || (connection.inheritPrimaryModel ? getSelectedModel() : '')
            }))
        ];
    }

    function getDefaultRequestBodyMergePatch() {
        return config.requestDefaults ? { ...config.requestDefaults } : {
            max_completion_tokens: 16000,
            temperature: 0.3
        };
    }

    function getDefaultRequestBodyMergeJson() {
        return JSON.stringify(getDefaultRequestBodyMergePatch(), null, 2);
    }

    function normalizeRequestBodyMergeJson(rawValue) {
        if (rawValue === null || rawValue === undefined || rawValue === '') {
            return '';
        }

        if (typeof rawValue === 'string') {
            return rawValue;
        }

        if (isPlainObject(rawValue) || Array.isArray(rawValue)) {
            return JSON.stringify(rawValue, null, 2);
        }

        return String(rawValue);
    }

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function mergeRequestBody(base, patch) {
        const result = { ...base };

        for (const [key, value] of Object.entries(patch)) {
            if (value === null) {
                delete result[key];
                continue;
            }

            if (isPlainObject(value) && isPlainObject(result[key])) {
                result[key] = mergeRequestBody(result[key], value);
                continue;
            }

            result[key] = value;
        }

        return result;
    }

    function getRequestBodyMergeValidationError(rawValue) {
        const raw = normalizeRequestBodyMergeJson(rawValue).trim();
        if (!raw) return '';

        try {
            const parsed = JSON.parse(raw);
            if (!isPlainObject(parsed)) {
                return 'Request Body Merge JSON must be a JSON object.';
            }
            return '';
        } catch (e) {
            return e.message || 'Invalid JSON.';
        }
    }

    function getRequestBodyMergePatch() {
        const raw = normalizeRequestBodyMergeJson(getSetting('adv-requestBodyMergeJson', '')).trim();
        if (!raw) return getDefaultRequestBodyMergePatch();

        const validationError = getRequestBodyMergeValidationError(raw);
        if (validationError) {
            throw new Error(`[ChatGPT] Invalid Request Body Merge JSON: ${validationError}`);
        }

        return JSON.parse(raw);
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

    function buildChatGPTRequestBody(model, prompt, { stream = false } = {}) {
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        const requestBody = {
            model,
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: userPrompt }
            ]
        };

        const mergedBody = mergeRequestBody(requestBody, getRequestBodyMergePatch());

        // Streaming callers rely on receiving an early response byte so long
        // generations are not dropped by an upstream proxy while it waits for
        // the complete JSON document. Do not let an advanced merge patch turn
        // streaming back off for those calls.
        if (stream) mergedBody.stream = true;

        return mergedBody;
    }

    function buildResponsesRequestBody(model, prompt) {
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        const patch = { ...getRequestBodyMergePatch() };

        if (patch.max_output_tokens === undefined) {
            patch.max_output_tokens = patch.max_completion_tokens ?? patch.max_tokens ?? 16000;
        }
        delete patch.max_completion_tokens;
        delete patch.max_tokens;
        delete patch.messages;
        delete patch.input;
        delete patch.instructions;
        delete patch.model;
        delete patch.stream;
        delete patch.tools;

        return mergeRequestBody({
            model,
            ...(systemPrompt ? { instructions: systemPrompt } : {}),
            input: userPrompt,
            tools: [{ type: 'web_search' }],
            // Research explicitly starts with a live search attempt. If the
            // selected model cannot call the tool, the manager retries without it.
            tool_choice: 'required',
            stream: true,
            store: false
        }, patch);
    }

    // ============================================
    // API Call Functions
    // ============================================

    /**
     * Call ChatGPT API and return raw text response
     */
    function getHttpStatusHint(status) {
        if (status === 401) return ' — invalid API key or permission denied';
        if (status === 403) return ' — check the API key and account credits/quota';
        if (status === 404) return ' — check the endpoint Base URL and Model ID (refresh the model list with ↻)';
        if (status === 410) return ' — the model appears retired; pick a current model from the refreshed list';
        if (status === 429) return ' — rate limited';
        return '';
    }

    async function buildHttpErrorDetail(response) {
        const status = response?.status;
        const hint = getHttpStatusHint(status);
        let detail = '';
        try {
            const rawText = typeof response?.clone === 'function'
                ? await response.clone().text()
                : '';
            const trimmed = String(rawText || '').trim();
            if (trimmed) {
                let parsedMessage = '';
                try {
                    const parsed = JSON.parse(trimmed);
                    parsedMessage = parsed?.error?.message || parsed?.error?.code || parsed?.message || '';
                } catch {
                    // Plain-text error body (e.g. "404 page not found").
                }
                detail = parsedMessage || trimmed.slice(0, 200);
            }
        } catch {
            // Unreadable body; fall through to the generic status below.
        }
        if (!detail) return `HTTP ${status}${hint}`;
        // A terse server body (e.g. NIM's bare "404 page not found") still
        // needs the actionable hint; descriptive messages stay untouched
        // except for statuses where the next step is always the same.
        if (status === 403 || status === 404 || status === 410) return `${detail}${hint}`;
        return detail;
    }

    function recordSkipError(target, status) {
        return new Error(`[ChatGPT] ${target?.label || 'Endpoint'} failed: HTTP ${status}${getHttpStatusHint(status)}`);
    }

    function isResponsesApiUnsupported(error) {
        if (!error) return false;
        if (error.responsesApiUnsupported === true) return true;
        const message = String(error.message || '');
        return /HTTP (404|405)\b/.test(message) || /404 page not found/.test(message);
    }
    function normalizeFinishReason(reason) {
        return reason === null || reason === undefined
            ? ''
            : String(reason).trim().toLowerCase();
    }

    function createChatGPTResponseError(reason, detail = '') {
        const normalizedReason = normalizeFinishReason(reason) || 'missing_finish_reason';
        const message = String(detail || '').trim();
        const error = new Error(`[ChatGPT] Response rejected (${normalizedReason})${message ? `: ${message}` : ''}`);
        error.code = 'CHATGPT_RESPONSE_REJECTED';
        error.reason = normalizedReason;
        return error;
    }

    function readChatGPTResponseText(data) {
        if (data?.error) {
            throw new Error(`[ChatGPT] ${data.error.message || data.error.code || 'API response error'}`);
        }

        const choice = data?.choices?.[0];
        if (!choice) {
            throw createChatGPTResponseError('missing_choice');
        }
        if (choice.error) {
            const detail = typeof choice.error === 'string'
                ? choice.error
                : choice.error.message || choice.error.code || 'Choice response error';
            throw new Error(`[ChatGPT] ${detail}`);
        }

        const refusal = choice.message?.refusal;
        if ((typeof refusal === 'string' && refusal.trim()) || (refusal && typeof refusal !== 'string')) {
            throw createChatGPTResponseError('refusal', typeof refusal === 'string' ? refusal : 'Request refused');
        }

        const finishReason = normalizeFinishReason(choice.finish_reason);
        if (finishReason !== 'stop') {
            throw createChatGPTResponseError(finishReason, choice.finish_details?.message);
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

    function readChatGPTStreamChunk(data) {
        if (data?.error) {
            throw new Error(`[ChatGPT] ${data.error.message || data.error.code || 'API response error'}`);
        }

        const choice = data?.choices?.[0];
        if (!choice) return { text: '', finishReason: '' };
        if (choice.error) {
            const detail = typeof choice.error === 'string'
                ? choice.error
                : choice.error.message || choice.error.code || 'Choice response error';
            throw new Error(`[ChatGPT] ${detail}`);
        }

        const refusal = choice.delta?.refusal;
        if ((typeof refusal === 'string' && refusal.trim()) || (refusal && typeof refusal !== 'string')) {
            throw createChatGPTResponseError('refusal', typeof refusal === 'string' ? refusal : 'Request refused');
        }

        const finishReason = normalizeFinishReason(choice.finish_reason);
        if (finishReason && finishReason !== 'stop') {
            throw createChatGPTResponseError(finishReason, choice.finish_details?.message);
        }

        const content = choice.delta?.content;
        const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
                ? content.map(part => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : '')).join('')
                : '';
        return { text, finishReason };
    }

    // Shared 401 / non-OK handling for the chat/completions request loops.
    // On 401 it throws the permission message; otherwise it reports the HTTP status.
    // Either branch reads the JSON body at most once, matching the inline versions.
    async function throwChatGPTApiResponseError(response) {
        if (response.status === 401) {
            let errorMessage = 'Invalid API key or permission denied.';
            try {
                const errorData = await response.json();
                if (errorData.error?.message) errorMessage = errorData.error.message;
            } catch (parseError) { }
            throw new Error(`[ChatGPT] ${errorMessage}`);
        }

        let errorMessage = `HTTP ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData.error?.message) errorMessage = errorData.error.message;
        } catch (parseError) { }
        throw new Error(`[ChatGPT] ${errorMessage}`);
    }

    async function callChatGPTAPIRaw(
        prompt,
        maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        requestTimeoutMs = window.ivLyricsFetch?.DEFAULT_TIMEOUT_MS || 90_000,
        capability = null
    ) {
        const targets = ensureRequestTargets(getRequestTargets(capability), capability);
        let lastError = null;

        for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
            const target = targets[targetIndex];
            const apiKey = target.apiKey;
            const baseUrl = target.baseUrl;
            const model = target.model;
            if (!model) {
                window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Skipping ${target.label}: no model configured.`);
                continue;
            }

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

                    const response = await window.ivLyricsFetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(buildChatGPTRequestBody(model, prompt))
                    }, requestTimeoutMs);

                    if (response.status === 429 || response.status === 403) {
                        window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Target ${target.label} failed (${response.status}), trying next...`);
                        // Remember the failure so a run with no usable target
                        // reports the real HTTP error instead of a generic one.
                        lastError = recordSkipError(target, response.status);
                        break; // Try next target
                    }

                    if (response.status === 401) {
                        // An invalid key on one target must not abort the
                        // remaining targets: record it and fail over, matching
                        // the released withProviderConnections behavior. When
                        // no target succeeds, lastError still surfaces it.
                        lastError = new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
                        break; // Try next target
                    }

                    if (!response.ok) {
                        throw new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
                    }

                    const data = await response.json();
                    const rawText = readChatGPTResponseText(data);

                    if (!rawText.trim()) {
                        throw new Error('[ChatGPT] Empty response from API');
                    }

                    return typeof transformResult === 'function'
                        ? transformResult(rawText)
                        : rawText;

                } catch (e) {
                    lastError = e;
                    window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Attempt ${attempt + 1} failed:`, e.message);

                    // Credential errors skip retries on this target and fail
                    // over to the next one instead of aborting the chain.
                    if (e.message.includes('Invalid API key') || e.message.includes('permission denied')) {
                        break; // Try next target
                    }

                    if (attempt < maxRetries - 1) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    }
                }
            }
        }

        throw lastError || new Error('[ChatGPT] All API keys and retries exhausted');
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

    function drainSseLines(buffer, flush, processSseLine) {
        const lines = buffer.split(/\r?\n/);
        const remaining = flush ? '' : (lines.pop() || '');
        for (const line of lines) processSseLine(line);
        return remaining;
    }

    function createResponsesAPIError(data, fallback = 'Responses API request failed') {
        const response = data?.response || data;
        const error = response?.error || data?.error;
        const reason = response?.incomplete_details?.reason || response?.status || data?.type || '';
        const message = error?.message || error?.code || reason || fallback;
        return new Error(`[ChatGPT Web Search] ${message}`);
    }

    function readResponsesOutputText(data) {
        if (data?.error || data?.status === 'failed' || data?.status === 'incomplete') {
            throw createResponsesAPIError(data);
        }
        return (Array.isArray(data?.output) ? data.output : [])
            .flatMap(item => Array.isArray(item?.content) ? item.content : [])
            .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
            .map(part => part.text)
            .join('');
    }

    async function callResponsesAPIStream(
        prompt,
        onLine,
        onStreamReset,
        maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        requestTimeoutMs = window.ivLyricsFetch?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        capability = null,
        targetsOverride = null
    ) {
        const targets = ensureRequestTargets(targetsOverride || getRequestTargets(capability), capability);
        let lastError = null;

        for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
            const target = targets[targetIndex];
            const apiKey = target.apiKey;
            const baseUrl = target.baseUrl;
            const model = target.model;
            if (!model) {
                window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Skipping ${target.label}: no model configured.`);
                continue;
            }

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
                            for (let index = 0; index < emittedLineCount; index++) onLine(index, '');
                        }
                    } catch (resetError) {
                        window.__ivLyricsDebugLog?.('[ChatGPT Addon] Failed to reset Responses API stream:', resetError?.message);
                    }
                    emittedLineCount = 0;
                    emittedProvisionalOutput = false;
                    receivedStreamText = false;
                };

                try {
                    const endpoint = `${normalizeBaseUrl(baseUrl)}/responses`;
                    const response = await window.ivLyricsFetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(buildResponsesRequestBody(model, prompt))
                    }, requestTimeoutMs);

                    if (response.status === 429 || response.status === 403) {
                        lastError = new Error(`[ChatGPT Web Search] ${target.label} failed: HTTP ${response.status}${getHttpStatusHint(response.status)}`);
                        break;
                    }
                    if (!response.ok) {
                        let errorData = null;
                        try { errorData = await response.json(); } catch { }
                        const unsupported = response.status === 404 || response.status === 405;
                        const error = createResponsesAPIError(
                            errorData,
                            `HTTP ${response.status}${unsupported ? ' — this endpoint does not support the Responses API' : getHttpStatusHint(response.status)}`
                        );
                        if (unsupported) error.responsesApiUnsupported = true;
                        throw error;
                    }

                    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
                    if (!response.body || !contentType.includes('text/event-stream')) {
                        const data = await response.json();
                        const rawText = readResponsesOutputText(data);
                        if (!rawText.trim()) throw new Error('[ChatGPT Web Search] Empty response from API');
                        if (typeof onRawChunk === 'function') {
                            receivedStreamText = true;
                            onRawChunk(rawText);
                        }
                        const transformed = typeof transformResult === 'function'
                            ? transformResult(rawText)
                            : rawText;
                        if (Array.isArray(transformed) && typeof onLine === 'function') {
                            transformed.forEach((line, index) => onLine(index, line));
                        }
                        return transformed;
                    }

                    const consumeResponsesStream = async () => {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let sseBuffer = '';
                    let accumulated = '';
                    let completed = false;
                    const lineState = { index: 0, offset: 0 };

                    const appendText = (text) => {
                        if (!text) return;
                        accumulated += text;
                        receivedStreamText = true;
                        if (typeof onRawChunk === 'function') onRawChunk(text);
                    };

                    const processSseLine = (line) => {
                        const trimmedLine = String(line || '').trim();
                        if (!trimmedLine.startsWith('data:')) return;
                        const payload = trimmedLine.slice(5).trimStart();
                        if (!payload || payload === '[DONE]') return;

                        const event = JSON.parse(payload);
                        if (event.type === 'response.output_text.delta') {
                            appendText(typeof event.delta === 'string' ? event.delta : '');
                            return;
                        }
                        if (event.type === 'response.output_text.done') {
                            if (!accumulated && typeof event.text === 'string') appendText(event.text);
                            return;
                        }
                        if (event.type === 'response.refusal.done' || event.type === 'response.refusal.delta') {
                            throw new Error(`[ChatGPT Web Search] ${event.refusal || event.delta || 'Request refused'}`);
                        }
                        if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
                            throw createResponsesAPIError(event);
                        }
                        if (event.type === 'response.completed') {
                            completed = true;
                            if (!accumulated) appendText(readResponsesOutputText(event.response));
                        }
                    };

                    const drainSseBuffer = (flush = false) => {
                        sseBuffer = drainSseLines(sseBuffer, flush, processSseLine);
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

                    if (!completed) throw new Error('[ChatGPT Web Search] Responses API stream ended before completion');
                    if (!accumulated.trim()) throw new Error('[ChatGPT Web Search] Empty response from streaming API');

                    const transformed = typeof transformResult === 'function'
                        ? transformResult(accumulated)
                        : accumulated;
                    if (Array.isArray(transformed) && typeof onLine === 'function') {
                        transformed.forEach((line, index) => onLine(index, line));
                    }
                    return transformed;
                    };

                    return await consumeResponsesStream();
                } catch (error) {
                    lastError = error;
                    window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Responses API attempt ${attempt + 1} failed:`, error.message);
                    resetProvisionalOutput(attempt < maxRetries - 1 ? 'retry' : 'failed', error);
                    // Credential errors skip retries on this target and fail
                    // over to the next one instead of aborting the chain.
                    if (/invalid api key|permission denied/i.test(error.message)) break; // Try next target
                    if (attempt < maxRetries - 1) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error('[ChatGPT Web Search] All API keys and retries exhausted');
    }

    async function callChatGPTAPIStream(
        prompt,
        onLine,
        onStreamReset,
        maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3,
        transformResult = null,
        requestTimeoutMs = window.ivLyricsFetch?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        capability = null,
        targetsOverride = null
    ) {
        const targets = ensureRequestTargets(targetsOverride || getRequestTargets(capability), capability);
        let lastError = null;

        for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
            const target = targets[targetIndex];
            const apiKey = target.apiKey;
            const baseUrl = target.baseUrl;
            const model = target.model;
            if (!model) {
                window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Skipping ${target.label}: no model configured.`);
                continue;
            }

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
                        window.__ivLyricsDebugLog?.('[ChatGPT Addon] Failed to reset provisional stream:', resetError?.message);
                    }

                    emittedProvisionalOutput = false;
                    emittedLineCount = 0;
                    receivedStreamText = false;
                };

                try {
                    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

                    const response = await window.ivLyricsFetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(buildChatGPTRequestBody(model, prompt, { stream: true }))
                    }, requestTimeoutMs);

                    if (response.status === 429 || response.status === 403) {
                        window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Stream: target ${target.label} failed (${response.status}), trying next...`);
                        // Remember the failure so a run with no usable target
                        // reports the real HTTP error instead of a generic one.
                        lastError = recordSkipError(target, response.status);
                        break;
                    }

                    if (response.status === 401) {
                        // An invalid key on one target must not abort the
                        // remaining targets: record it and fail over, matching
                        // the released withProviderConnections behavior. When
                        // no target succeeds, lastError still surfaces it.
                        lastError = new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
                        break; // Try next target
                    }

                    if (!response.ok) {
                        throw new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
                    }

                    // Some compatible APIs accept `stream: true` but still
                    // return a regular JSON completion. Preserve compatibility
                    // with those servers while preferring SSE for long requests.
                    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
                    if (!response.body || !contentType.includes('text/event-stream')) {
                        const data = await response.json();
                        const rawText = readChatGPTResponseText(data);
                        if (!rawText.trim()) throw new Error('[ChatGPT] Empty response from API');
                        if (typeof onRawChunk === 'function') {
                            receivedStreamText = true;
                            onRawChunk(rawText);
                        }

                        const transformed = typeof transformResult === 'function'
                            ? transformResult(rawText)
                            : rawText;
                        if (Array.isArray(transformed) && typeof onLine === 'function') {
                            transformed.forEach((line, index) => onLine(index, line));
                        }
                        return transformed;
                    }

                    const consumeChatGPTStream = async () => {
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
                        const chunk = readChatGPTStreamChunk(parsed);
                        if (chunk.text) {
                            accumulated += chunk.text;
                            receivedStreamText = true;
                            if (typeof onRawChunk === 'function') onRawChunk(chunk.text);
                        }
                        if (chunk.finishReason) finalFinishReason = chunk.finishReason;
                    };

                    const drainSseBuffer = (flush = false) => {
                        sseBuffer = drainSseLines(sseBuffer, flush, processSseLine);
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
                        throw createChatGPTResponseError(finalFinishReason);
                    }
                    if (!accumulated.trim()) throw new Error('[ChatGPT] Empty response from streaming API');

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

                    return await consumeChatGPTStream();

                } catch (e) {
                    lastError = e;
                    window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Stream attempt ${attempt + 1} failed:`, e.message);
                    resetProvisionalOutput(attempt < maxRetries - 1 ? 'retry' : 'failed', e);
                    // Credential errors skip retries on this target and fail
                    // over to the next one instead of aborting the chain.
                    if (e.message.includes('Invalid API key') || e.message.includes('permission denied')) break; // Try next target
                    if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error('[ChatGPT] All API keys and retries exhausted');
    }

    /**
     * Call ChatGPT API and parse JSON response (for metadata, TMI, etc.)
     */
    async function callChatGPTAPI(
        prompt,
        maxRetries = window.AIAddonManager?.getProviderRequestAttempts?.() ?? 3,
        requestTimeoutMs = window.ivLyricsFetch?.DEFAULT_TIMEOUT_MS || 90_000,
        capability = null
    ) {
        return await callChatGPTAPIRaw(prompt, maxRetries, extractJSON, requestTimeoutMs, capability);
    }

    /**
     * Test one endpoint target directly (used by per-endpoint Test buttons).
     */
    async function testSingleTarget(target) {
        const baseUrl = normalizeBaseUrl(target.baseUrl) || DEFAULT_OPENAI_BASE_URL;
        const apiKey = String(target.apiKey || '').trim();
        const model = String(target.model || '').trim();
        if (!apiKey) throw new Error('[ChatGPT] API key is required.');
        if (!model) throw new Error('[ChatGPT] Model is required.');
        const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        let patch = null;
        try {
            patch = getRequestBodyMergePatch();
        } catch {
            patch = null;
        }
        const body = patch && typeof patch === 'object'
            ? mergeRequestBody({ model, messages: [{ role: 'user', content: 'Reply with just "OK" if you receive this.' }] }, patch)
            : { model, messages: [{ role: 'user', content: 'Reply with just "OK" if you receive this.' }] };
        const response = await window.ivLyricsFetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
        }
        const data = await response.json();
        const rawText = readChatGPTResponseText(data);
        if (!rawText.trim()) throw new Error('[ChatGPT] Empty response from API');
        return rawText;
    }

    /**
     * Parse plain text lines from API response
     */
    function parseTextLines(text, expectedSourceLines) {
        if (text === null || text === undefined) {
            throw new Error('[ChatGPT] Empty response from API');
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
            throw new Error(`[ChatGPT] Invalid response line count: expected ${expectedLineCount}, got ${lines.length}`);
        }
        if (validLines.every(line => !String(line).trim())) {
            throw new Error('[ChatGPT] Empty response from API');
        }
        if (sourceLines) {
            const missingLineIndex = validLines.findIndex((line, index) => sourceLines[index].trim() && !String(line).trim());
            if (missingLineIndex >= 0) {
                throw new Error(`[ChatGPT] Empty response line at index ${missingLineIndex + 1}`);
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

    const ChatGPTAddon = {
        ...ADDON_INFO,

        async init() {
            window.__ivLyricsDebugLog?.(`[ChatGPT Addon] Initialized (v${ADDON_INFO.version})`);
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

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState, useCallback, useEffect } = React;

            return function ChatGPTSettings() {
                const initialApiKeys = getSetting('api-keys', '') || getSetting('api-key', '');
                const [apiKeys, setApiKeys] = useState(
                    Array.isArray(initialApiKeys) ? JSON.stringify(initialApiKeys) : initialApiKeys
                );
                const [baseUrl, setBaseUrl] = useState(getSetting('base-url', DEFAULT_OPENAI_BASE_URL));
                const [model, setModel] = useState(getSelectedModel());
                const [customModel, setCustomModel] = useState(getSetting('custom-model', ''));
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
                        ADDON_INFO.models = models;
                    } catch (e) {
                        window.__ivLyricsDebugLog?.('[ChatGPT Addon] Failed to load models:', e);
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
                    setApiKeys(e.target.value);
                    setSetting('api-keys', e.target.value);
                }, []);

                const handleBaseUrlChange = useCallback((e) => {
                    const value = e.target.value;
                    setBaseUrl(value);
                    setSetting('base-url', value);
                }, []);

                const handleModelChange = useCallback((e) => {
                    setModel(e.target.value);
                    setSetting('model', e.target.value);
                }, []);

                const handleCustomModelChange = useCallback((e) => {
                    const value = e.target.value;
                    setCustomModel(value);
                    setSetting('custom-model', value);
                    if (value) {
                        setSetting('model', value);
                        setModel(value);
                    }
                }, []);

                const handleRefreshModels = useCallback(() => {
                    loadModels();
                }, [loadModels]);

                const handleTest = useCallback(async () => {
                    setTestStatus(aiText('testingConnection', 'Testing...'));
                    try {
                        await callChatGPTAPIRaw('Reply with just "OK" if you receive this.');
                        setTestStatus('✓ ' + aiText('connectionSuccess', 'Connection successful.'));
                    } catch (e) {
                        setTestStatus(`✗ ${e.message}`);
                    }
                }, []);

                const isModelInList = availableModels.find(m => m.id === model);
                const hasApiKey = getApiKeys().length > 0;

                const [primaryCapabilities, setPrimaryCapabilitiesState] = useState(() => getPrimaryCapabilities());

                const togglePrimaryCapability = useCallback((cap) => {
                    setPrimaryCapabilitiesState((prev) => {
                        const next = toggleEndpointCapability(prev, cap);
                        setPrimaryCapabilities(next);
                        return next;
                    });
                }, []);

                const renderApiKeyRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                        React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-apiKeys` }, aiText('apiKey', 'API Key(s)')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('input', { id: `${ADDON_INFO.id}-primary-apiKeys`, type: 'password', autoComplete: 'off', value: apiKeys, onChange: handleApiKeyChange, placeholder: 'sk-...' }),
                            React.createElement('button', { type: 'button', onClick: () => window.open(ADDON_INFO.apiKeyUrl, '_blank'), className: 'ai-addon-btn ai-addon-btn-secondary' }, aiText('getApiKey', 'Get API Key'))
                        ),
                        React.createElement('small', null, aiText('apiKeyDesc', 'Enter an API key or JSON array.'))
                    );
                const renderBaseUrlRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                        React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-baseUrl` }, aiText('baseUrl', 'Base URL')),
                        React.createElement('input', { id: `${ADDON_INFO.id}-primary-baseUrl`, type: 'text', value: baseUrl, onChange: handleBaseUrlChange, placeholder: DEFAULT_OPENAI_BASE_URL }),
                        React.createElement('small', null, aiText('baseUrlDesc', 'Use a custom OpenAI-compatible API URL.'))
                    );
                const renderModelRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                        React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-models` }, aiText('model', 'Model')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('select', {
                                id: `${ADDON_INFO.id}-primary-models`,
                                value: isModelInList ? model : '',
                                onChange: handleModelChange,
                                disabled: modelsLoading
                            },
                                modelsLoading
                                    ? React.createElement('option', { value: '' }, aiText('loadingModels', 'Loading models...'))
                                    : availableModels.length > 0
                                        ? [
                                            !model && React.createElement('option', { key: '__placeholder__', value: '' }, aiText('selectModel', 'Select a model')),
                                            ...availableModels.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name)),
                                            React.createElement('option', { key: 'custom', value: '' }, aiText('modelId', 'Model ID'))
                                        ].filter(Boolean)
                                        : [
                                            React.createElement('option', { key: 'empty', value: '' }, hasApiKey ? aiText('noModels', 'No models found') : aiText('enterApiKeyFirst', 'Enter API key first')),
                                            React.createElement('option', { key: 'custom', value: '' }, aiText('modelId', 'Model ID'))
                                        ]
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
                const renderCustomModelRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                        React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-customModel` }, aiText('modelId', 'Custom Model ID')),
                        React.createElement('input', { id: `${ADDON_INFO.id}-primary-customModel`, type: 'text', value: customModel, onChange: handleCustomModelChange, placeholder: 'gpt-4-turbo', 'aria-label': aiText('modelId', 'Custom Model ID') })
                    );

                return React.createElement('div', { className: 'ai-addon-settings chatgpt-settings' },
                    React.createElement('div', { className: 'ai-addon-setting' },
                        renderConnectionCard({
                            heading: React.createElement('div', { className: 'ai-addon-connection-enabled' },
                                React.createElement('span', null, `1. ${t('misc.default', 'Default')}`)
                            ),
                            fields: [
                                renderApiKeyRow(),
                                renderBaseUrlRow(),
                                renderModelRow(),
                                (!isModelInList || customModel) && renderCustomModelRow()
                            ],
                            capabilities: primaryCapabilities,
                            onToggle: togglePrimaryCapability,
                            blockedByMaster: capability => !isMasterCapabilityEnabled(capability),
                            testButton: React.createElement('button', {
                                type: 'button', onClick: handleTest, className: 'ai-addon-btn ai-addon-btn-secondary'
                            }, aiText('testConnection', 'Test Connection')),
                            status: testStatus && React.createElement('small', {
                                role: 'status', 'aria-live': 'polite',
                                className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                            }, testStatus)
                        })
                    ),
                    React.createElement(FallbackProvidersSection),
                    // Advanced API Parameters
                    React.createElement(AdvancedParamsSection)
                );
            };

            // Share presentation only: the primary keeps its original settings and handlers.
            function renderConnectionCard({ heading, actions, fields, capabilities, onToggle, blockedByMaster, testButton, status }) {
                return React.createElement('div', { className: 'ai-addon-connection-card' },
                    React.createElement('div', { className: 'ai-addon-connection-header' }, heading, actions),
                    React.createElement('div', { className: 'ai-addon-connection-fields' }, ...fields),
                    React.createElement(CapabilityControls, { capabilities, onToggle, blockedByMaster }),
                    React.createElement('div', { className: 'ai-addon-connection-footer' }, testButton, status)
                );
            }

            // A chip blocked by the provider master switch stays clickable so the
            // endpoint choice is kept for when the master switch is re-enabled.
            function CapabilityControls({ capabilities, onToggle, blockedByMaster }) {
                return React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-capabilities' },
                    React.createElement('label', null, aiText('enabledCapabilities', 'Enabled Capabilities')),
                    React.createElement('div', { className: 'ai-addon-caps-container' },
                        ENDPOINT_CAPABILITIES.map(capability => {
                            const enabled = isEndpointCapabilityEnabled(capabilities, capability);
                            // Blocked-but-saved: the endpoint still wants the
                            // capability but the provider master switch is off.
                            const blocked = enabled && blockedByMaster?.(capability) === true;
                            return React.createElement('button', {
                                key: capability, type: 'button',
                                className: `ai-addon-cap-chip ${enabled ? 'active' : ''} ${blocked ? 'is-blocked ' : ''}cap-${capability}`,
                                'aria-pressed': enabled, onClick: () => onToggle(capability),
                                title: blocked ? aiText('capabilityBlockedByProvider', 'Blocked by provider master') : undefined
                            }, aiText(`supports.${capability}`, ENDPOINT_CAPABILITY_FALLBACKS[capability]));
                        })
                    )
                );
            }

            function FallbackProvidersSection() {
                const [connections, setConnections] = useState(getFallbackProviders);
                const save = update => setConnections(previous => {
                    const next = typeof update === 'function' ? update(previous) : update;
                    setSetting('fallback-providers', next);
                    return next;
                });
                const move = (id, delta) => save(previous => {
                    const index = previous.findIndex(connection => connection.id === id);
                    const target = index + delta;
                    if (index < 0 || target < 0 || target >= previous.length) return previous;
                    const next = [...previous];
                    [next[index], next[target]] = [next[target], next[index]];
                    return next;
                });
                return React.createElement('div', { className: 'ai-addon-setting ai-addon-connections' },
                    React.createElement('label', null, aiText('openaiConnections', 'Additional OpenAI-compatible providers')),
                    React.createElement('small', null, aiText('openaiConnectionsDesc', 'Try enabled providers in order when the primary fails.')),
                    connections.map((connection, index) => React.createElement(ConnectionEditor, {
                        key: connection.id,
                        connection, index, count: connections.length,
                        onChange: patch => save(previous => previous.map(item => item.id === connection.id ? { ...item, ...patch } : item)),
                        onRemove: () => save(previous => previous.filter(item => item.id !== connection.id)),
                        onMove: delta => move(connection.id, delta)
                    })),
                    React.createElement('button', {
                        type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary',
                        onClick: () => save(previous => [...previous, {
                            id: createEndpointId(), name: `API ${previous.length + 1}`,
                            baseUrl: DEFAULT_OPENAI_BASE_URL, apiKeys: '', model: '', enabled: true, capabilities: {}
                        }])
                    }, aiText('addOpenaiConnection', 'Add provider'))
                );
            }

            function ConnectionEditor({ connection, index, count, onChange, onRemove, onMove }) {
                const [models, setModels] = useState([]);
                const [loading, setLoading] = useState(false);
                const [revision, setRevision] = useState(0);
                const [status, setStatus] = useState('');
                const [testing, setTesting] = useState(false);
                const keys = parseConnectionKeys(connection.apiKeys);
                const selectedModel = connection.model || (connection.inheritPrimaryModel ? getSelectedModel() : '');
                const customModel = !models.some(model => model.id === selectedModel);
                useEffect(() => {
                    let active = true;
                    setModels([]);
                    if (!keys.length) { setLoading(false); return; }
                    setLoading(true);
                    const timer = setTimeout(() => {
                        fetchAvailableModels(keys[0], connection.baseUrl).then(values => {
                            if (active) setModels(values);
                        }).finally(() => { if (active) setLoading(false); });
                    }, 350);
                    return () => { active = false; clearTimeout(timer); };
                }, [connection.apiKeys, connection.baseUrl, revision]);
                const field = (label, key, type = 'text') => {
                    const id = `${ADDON_INFO.id}-${encodeURIComponent(connection.id)}-${key}`;
                    return React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                        React.createElement('label', { htmlFor: id }, label),
                        React.createElement('input', {
                            id, type, value: connection[key] || '', autoComplete: 'off',
                            placeholder: key === 'model' ? selectedModel : undefined,
                            onChange: event => onChange({ [key]: event.target.value,
                                ...(key === 'model' ? { inheritPrimaryModel: false } : {}) })
                        })
                    );
                };
                const iconButton = (label, glyph, onClick, disabled = false) => React.createElement('button', {
                    type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary ai-addon-connection-icon',
                    onClick, disabled, 'aria-label': label, title: label
                }, glyph);
                return renderConnectionCard({
                    heading: React.createElement('label', { className: 'ai-addon-connection-enabled' },
                        React.createElement('input', {
                            type: 'checkbox', checked: connection.enabled !== false,
                            onChange: event => onChange({ enabled: event.target.checked })
                        }),
                        React.createElement('span', null, `${index + 2}. ${connection.name || 'API'}`)
                    ),
                    actions: React.createElement('div', { className: 'ai-addon-connection-actions' },
                        iconButton(aiText('moveUp', 'Move up'), '↑', () => onMove(-1), index === 0),
                        iconButton(aiText('moveDown', 'Move down'), '↓', () => onMove(1), index === count - 1),
                        iconButton(aiText('removeConnection', 'Remove provider'), '×', onRemove)
                    ),
                    fields: [
                        field(aiText('connectionName', 'Name'), 'name'),
                        field(aiText('baseUrl', 'Base URL'), 'baseUrl'),
                        field(aiText('apiKey', 'API Key(s)'), 'apiKeys', 'password'),
                        React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                            React.createElement('label', { htmlFor: `${ADDON_INFO.id}-${encodeURIComponent(connection.id)}-models` }, aiText('model', 'Model')),
                            React.createElement('div', { className: 'ai-addon-input-group' },
                                React.createElement('select', {
                                    id: `${ADDON_INFO.id}-${encodeURIComponent(connection.id)}-models`,
                                    value: customModel ? '' : selectedModel, disabled: loading || !models.length,
                                    onChange: event => onChange({ model: event.target.value, inheritPrimaryModel: false })
                                },
                                    React.createElement('option', { value: '' }, aiText('modelId', 'Custom Model ID')),
                                    models.map(model => React.createElement('option', { key: model.id, value: model.id }, model.name))
                                ),
                                iconButton(aiText('refreshModels', 'Refresh model list'), loading ? '…' : '↻',
                                    () => setRevision(value => value + 1), loading || !keys.length)
                            )
                        ),
                        customModel && field(aiText('modelId', 'Model ID'), 'model')
                    ],
                    capabilities: connection.capabilities,
                    onToggle: capability => onChange({
                        capabilities: toggleEndpointCapability(connection.capabilities, capability)
                    }),
                    blockedByMaster: capability => !isMasterCapabilityEnabled(capability),
                    testButton: React.createElement('button', {
                        type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary',
                        disabled: testing || loading || !keys.length || !selectedModel,
                        onClick: async () => {
                            setTesting(true);
                            setStatus(aiText('testingConnection', 'Testing...'));
                            try {
                                await testSingleTarget({ baseUrl: connection.baseUrl, apiKey: keys[0], model: selectedModel });
                                setStatus('✓ ' + aiText('connectionSuccess', 'Connection successful.'));
                            } catch (error) { setStatus(`✗ ${error.message}`); }
                            finally { setTesting(false); }
                        }
                    }, aiText('testThisConnection', 'Test this provider')),
                    status: status && React.createElement('small', { role: 'status', 'aria-live': 'polite' }, status)
                });
            }

            // Settings wording for getRequestBodyMergeValidationError; requests keep its raw message.
            function describeRequestBodyMergeError(rawValue) {
                const raw = normalizeRequestBodyMergeJson(rawValue).trim();
                if (!raw) return '';
                try {
                    return isPlainObject(JSON.parse(raw)) ? '' : aiText('requestBodyMergeNotObject', 'Request Body Merge JSON must be a JSON object.');
                } catch (e) {
                    return `${aiText('invalidJson', 'Invalid JSON')}: ${e.message}`;
                }
            }

            function AdvancedParamsSection() {
                const [expanded, setExpanded] = useState(getSetting('adv-expanded', false));
                const [requestBodyMergeJson, setRequestBodyMergeJson] = useState(() => {
                    const savedValue = normalizeRequestBodyMergeJson(getSetting('adv-requestBodyMergeJson', ''));
                    return savedValue || getDefaultRequestBodyMergeJson();
                });
                const requestBodyMergeError = describeRequestBodyMergeError(requestBodyMergeJson);

                useEffect(() => {
                    if (!normalizeRequestBodyMergeJson(getSetting('adv-requestBodyMergeJson', ''))) {
                        setSetting('adv-requestBodyMergeJson', getDefaultRequestBodyMergeJson());
                    }
                }, []);

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
                        React.createElement('label', { className: 'ai-addon-advanced-field' },
                            React.createElement('span', null, aiText('requestBodyMerge', 'Request Body Merge JSON')),
                            React.createElement('textarea', {
                                value: requestBodyMergeJson,
                                rows: 7,
                                spellCheck: false,
                                placeholder: '{\n  "max_completion_tokens": 16000,\n  "max_tokens": null\n}',
                                'aria-invalid': requestBodyMergeError ? true : undefined,
                                onChange: (e) => {
                                    const value = e.target.value;
                                    setRequestBodyMergeJson(value);
                                    setSetting('adv-requestBodyMergeJson', value);
                                }
                            })
                        ),
                        requestBodyMergeError
                            ? React.createElement('small', { className: 'ai-addon-field-error' }, requestBodyMergeError)
                            : React.createElement('small', null, aiText('requestBodyMergeDesc', 'Merged into the default request body. max_completion_tokens and temperature are filled in by default. Set a key to null to remove it.'))
                    )
                );
            }
        },

        async translateLyrics({ text, lang, wantSmartPhonetic, translationPrompt, phoneticPrompt, onLine, onStreamReset, endpointCapability }) {
            if (!text?.trim()) {
                throw new Error('No text provided');
            }

            const sourceLines = String(text).replace(/\r\n?/g, '\n').split('\n');
            const prompt = wantSmartPhonetic ? phoneticPrompt : translationPrompt;
            if (!prompt) {
                throw new Error('[OpenAI ChatGPT] Central lyrics prompt is unavailable.');
            }
            const parseLines = rawResponse => parseTextLines(rawResponse, sourceLines);
            // Word-level gloss/pronunciation reuse this entry point with an
            // endpointCapability override so per-endpoint chips can gate them;
            // line pronunciation and translation each follow their own chip.
            const targetCapability = endpointCapability || (wantSmartPhonetic ? 'pronunciation' : 'translate');

            // Validate inside the provider retry loop so partial/blocked output can retry safely.
            const lines = onLine
                ? await callChatGPTAPIStream(prompt, onLine, onStreamReset, undefined, parseLines, undefined, undefined, targetCapability)
                : await callChatGPTAPIRaw(prompt, undefined, parseLines, undefined, targetCapability);

            // Return in the format expected by LyricsService
            return wantSmartPhonetic ? { phonetic: lines } : { translation: lines };
        },

        async generateCharacterPronunciation({ lines, characterPronunciationPrompt }) {
            if (!Array.isArray(lines) || lines.length === 0) {
                throw new Error('No lines provided');
            }

            const prompt = characterPronunciationPrompt;
            if (!prompt) {
                throw new Error('[OpenAI ChatGPT] Central character pronunciation prompt is unavailable.');
            }
            const result = await callChatGPTAPI(prompt, undefined, undefined, 'characterPronunciation');
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
                throw new Error('[OpenAI ChatGPT] Central metadata translation prompt is unavailable.');
            }
            const result = await callChatGPTAPI(prompt, undefined, undefined, 'metadata');

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
                throw new Error('[OpenAI ChatGPT] Central TMI prompt is unavailable.');
            }
            // Research uses SSE so an upstream proxy receives response bytes
            // while the long document is generated instead of closing an idle
            // non-streaming request before the client-side timeout expires.
            let progressParser = window.AIAddonManager?.createResearchStreamProgressParser?.(onResearchProgress);
            progressParser = progressParser || null;
            const resetProgress = progressParser
                ? (details) => {
                    progressParser = window.AIAddonManager.createResearchStreamProgressParser(onResearchProgress);
                    onResearchProgress(null, { ...details, reset: true });
                }
                : null;
            const request = ADDON_INFO.supports.researchWebSearch && webSearch !== false
                ? callResponsesAPIStream
                : callChatGPTAPIStream;
            const onRawChunk = progressParser ? chunk => progressParser.push(chunk) : null;
            if (webSearch === false) {
                return await request(
                    prompt,
                    null,
                    resetProgress,
                    1,
                    extractJSON,
                    requestTimeoutMs,
                    onRawChunk,
                    'tmi'
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
                        searchTargets
                    );
                } catch (searchError) {
                    // Hosts without a Responses API (e.g. NVIDIA NIM answers
                    // /responses with 404) fall back to plain chat instead of
                    // failing the whole request. Other errors still throw.
                    if (!isResponsesApiUnsupported(searchError)) throw searchError;
                    window.__ivLyricsDebugLog?.('[ChatGPT Addon] Responses API unsupported, falling back to plain chat:', searchError?.message);
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
                        searchTargets
                    );
                } catch (searchError) {
                    window.__ivLyricsDebugLog?.('[ChatGPT Addon] Web search targets failed, falling back to plain targets:', searchError?.message);
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
                plainTargets.length > 0 ? plainTargets : tmiTargets
            );
        },

        async generateLyricsStudy(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }

            const prompt = params.lyricsStudyPrompt;
            if (!prompt) {
                throw new Error('[OpenAI ChatGPT] Central lyrics study prompt is unavailable.');
            }
            return await callChatGPTAPI(prompt, undefined, undefined, 'lyricsStudy');
        },

        async generateCulturalAnnotations(params) {
            if (!Array.isArray(params?.lines) || params.lines.length === 0) {
                throw new Error('No lyrics lines provided');
            }
            const prompt = params.culturalAnnotationsPrompt;
            if (!prompt) {
                throw new Error('[OpenAI ChatGPT] Central cultural annotations prompt is unavailable.');
            }
            return await callChatGPTAPI(prompt, undefined, undefined, 'culturalAnnotations');
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            window.AIAddonManager.register(ChatGPTAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    return ChatGPTAddon;
    }

    // Share request validation, streaming and settings without sharing credentials.
    window.createOpenAICompatibleAddon = createOpenAICompatibleAddon;
    createOpenAICompatibleAddon();
})();
