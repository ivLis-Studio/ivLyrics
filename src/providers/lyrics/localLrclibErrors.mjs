const CODES = new Set([
    'unsupported', 'invalidFile', 'invalidDatabase', 'noSpace',
    'canceled', 'permission', 'unavailable'
]);

export const error = code => Object.assign(new Error(code), { code });
export function normalizeError(value, fallback = 'unavailable') {
    if (CODES.has(value?.code)) return error(value.code);
    if (value?.name === 'AbortError') return error('canceled');
    if (value?.name === 'QuotaExceededError') return error('noSpace');
    if (value?.name === 'NotAllowedError' || value?.name === 'SecurityError') return error('permission');
    if (value?.name === 'NotSupportedError') return error('unsupported');
    return error(fallback);
}

export function checkAbort(signal) {
    if (signal?.aborted) throw error('canceled');
}
