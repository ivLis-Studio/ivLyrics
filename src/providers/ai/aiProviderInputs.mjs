export function normalizePromptRequest(prompt) {
    if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
        return {
            systemPrompt: String(prompt.systemPrompt || '').trim(),
            userPrompt: String(prompt.userPrompt ?? prompt.prompt ?? '')
        };
    }
    return { systemPrompt: '', userPrompt: String(prompt ?? '') };
}

export function readProviderApiKeys(getSetting) {
    const raw = getSetting('api-keys', '') || getSetting('api-key', '');
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
