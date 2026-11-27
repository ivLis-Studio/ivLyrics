export function normalizePromptRequest(prompt) {
    if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
        return {
            systemPrompt: String(prompt.systemPrompt || '').trim(),
            userPrompt: String(prompt.userPrompt ?? prompt.prompt ?? '')
        };
    }
    return { systemPrompt: '', userPrompt: String(prompt ?? '') };
}

const normalizeKeys = keys => keys.map(key => typeof key === 'string' ? key.trim() : '').filter(Boolean);

export function readProviderApiKeys(getSetting, { splitDelimiters = false } = {}) {
    const raw = getSetting('api-keys', '') || getSetting('api-key', '');
    if (Array.isArray(raw)) return normalizeKeys(raw);
    if (!raw || typeof raw !== 'string') return [];

    if ((splitDelimiters ? raw.trimStart() : raw).startsWith('[')) {
        try {
            return normalizeKeys(JSON.parse(raw));
        } catch {
            // Treat invalid JSON as the provider's ordinary text input.
        }
    }
    return normalizeKeys(splitDelimiters ? raw.split(/[\n,]/) : [raw]);
}
