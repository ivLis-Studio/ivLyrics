import { readSettingsPersistence } from "../core/settingsRuntime.mjs";

// The provider managers start before the app's settings store is installed;
// until then they read and write Spicetify's storage directly.
export function createAddonSettingsStorage(host) {
    return {
        getStoredValue: (key) => {
            const persistence = readSettingsPersistence(host);
            return persistence ? persistence.getItem(key) : Spicetify.LocalStorage.get(key);
        },
        setStoredValue: (key, value) => {
            const persistence = readSettingsPersistence(host);
            return persistence ? persistence.setItem(key, value) : Spicetify.LocalStorage.set(key, value);
        },
    };
}

// Strings are stored as written and other values as JSON, so a stored value
// that does not parse is returned as the stored string.
export function readStoredAddonSetting(getStoredValue, storageKey, defaultValue = null) {
    const value = getStoredValue(storageKey);

    if (value === null || value === undefined) {
        return defaultValue;
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}
