export function normalizeRequestBodyMergeJson(rawValue) {
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

export function mergeRequestBody(base, patch) {
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

export function inspectRequestBodyMergeJson(rawValue) {
    const raw = normalizeRequestBodyMergeJson(rawValue).trim();
    if (!raw) return { patch: null };
    try {
        const patch = JSON.parse(raw);
        return isPlainObject(patch) ? { patch } : { error: 'notObject' };
    } catch (cause) {
        return { error: 'invalidJson', cause };
    }
}

export function createOpenAiRequestBody({ readRequestDefaults, getSetting }) {
    function getDefaultRequestBodyMergePatch() {
        const requestDefaults = readRequestDefaults();
        return requestDefaults ? { ...requestDefaults } : {
            max_completion_tokens: 16000,
            temperature: 0.3
        };
    }

    function getDefaultRequestBodyMergeJson() {
        return JSON.stringify(getDefaultRequestBodyMergePatch(), null, 2);
    }

    function getRequestBodyMergePatch() {
        const result = inspectRequestBodyMergeJson(getSetting('adv-requestBodyMergeJson', ''));
        if (result.error === 'notObject') {
            throw new Error('[ChatGPT] Invalid Request Body Merge JSON: Request Body Merge JSON must be a JSON object.');
        }
        if (result.error === 'invalidJson') {
            throw new Error(`[ChatGPT] Invalid Request Body Merge JSON: ${result.cause.message || 'Invalid JSON.'}`);
        }
        return result.patch ?? getDefaultRequestBodyMergePatch();
    }

    return { getRequestBodyMergePatch, getDefaultRequestBodyMergeJson };
}
