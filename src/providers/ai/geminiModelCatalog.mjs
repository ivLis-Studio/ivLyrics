export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_OUTPUT_TOKENS = 32_768;

export function getGeminiGenerationConfig(getSetting, getSelectedModel) {
    const config = {};

    // maxOutputTokens
    const useMaxTokens = getSetting('adv-maxOutputTokens-enabled', true);
    if (useMaxTokens) {
        config.maxOutputTokens = parseInt(getSetting('adv-maxOutputTokens-value', DEFAULT_GEMINI_OUTPUT_TOKENS)) || DEFAULT_GEMINI_OUTPUT_TOKENS;
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

export function createGeminiModelCatalog({
    getAiRequest, getSetting, getApiKeys, getBaseUrl, getSelectedModel, getGenerationConfig, debug,
}) {
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
            const endpoint = `${(baseUrl || GEMINI_BASE_URL).replace(/\/$/, '')}/models?key=${encodeURIComponent(apiKey)}`;
            const response = await getAiRequest()(endpoint);

            if (!response.ok) {
                debug('[Gemini Addon] Failed to fetch models:', response.status);
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
            debug('[Gemini Addon] Error fetching models:', e.message);
            return [];
        }
    }

    /**
     * 모델 목록 가져오기 (매번 API에서 로드)
     */
    async function getModels() {
        const apiKeys = getApiKeys();
        const baseUrl = getSetting('base-url', GEMINI_BASE_URL);
        if (apiKeys.length === 0) return [];
        return await fetchAvailableModels(apiKeys[0], baseUrl);
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
        const configuredLimit = asPositiveInteger(config.maxOutputTokens) || DEFAULT_GEMINI_OUTPUT_TOKENS;
        // Research is a long structured document. Use the model's advertised
        // output capacity so an older persisted 4k/20k setting cannot truncate it.
        config.maxOutputTokens = advertisedLimit || Math.max(configuredLimit, DEFAULT_GEMINI_OUTPUT_TOKENS);
        return config;
    }

    return { getModels, getResearchGenerationConfig };
}
