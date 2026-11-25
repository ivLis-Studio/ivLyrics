export function readStoredProviderOrder(storageKey, getStoredValue, setStoredValue) {
    let stored = null;
    try {
        stored = getStoredValue(storageKey);
    } catch {
        return [];
    }
    if (!stored) return [];

    let parsed = null;
    try {
        parsed = JSON.parse(stored);
    } catch {
        // Invalid persisted data is repaired below.
    }

    if (!Array.isArray(parsed)) {
        try {
            setStoredValue(storageKey, '[]');
        } catch {
            // A safe default can still be returned when storage is read-only.
        }
        return [];
    }

    const normalized = Array.from(
        new Set(parsed.filter(id => typeof id === 'string' && id.length > 0))
    );
    if (normalized.length !== parsed.length) {
        try {
            setStoredValue(storageKey, JSON.stringify(normalized));
        } catch {
            // Keep the in-memory normalized value when storage is read-only.
        }
    }
    return normalized;
}
