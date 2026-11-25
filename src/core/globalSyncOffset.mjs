import { readSettingsPersistence, readSettingsStorage } from "./settingsRuntime.mjs";
import { getRuntimeService } from "../spicetify/runtimeServices.mjs";

export const GLOBAL_SYNC_OFFSET_SETTING = "global-sync-offset";
export const GLOBAL_SYNC_OFFSET_STORAGE_KEY = `ivLyrics:visual:${GLOBAL_SYNC_OFFSET_SETTING}`;

export function clampSyncOffset(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(-10000, Math.min(10000, Math.round(numeric))) : 0;
}

export function normalizeGlobalSyncOffset(value) {
    return typeof value === "number" || typeof value === "string" ? clampSyncOffset(value) : 0;
}

export function resolveGlobalSyncOffset(configuredOffset, readStoredSetting) {
    return normalizeGlobalSyncOffset(configuredOffset ?? readStoredSetting(GLOBAL_SYNC_OFFSET_STORAGE_KEY));
}

export function createGlobalSyncOffsetReader(host, {
    readVisualSettings = () => getRuntimeService("CONFIG", host)?.visual,
    readLocalStorage = () => host.localStorage,
} = {}) {
    const readers = [
        (key) => readSettingsStorage(host)?.getItem?.(key),
        (key) => readSettingsPersistence(host)?.getItem?.(key),
        (key) => host.Spicetify?.LocalStorage?.get?.(key),
        (key) => readLocalStorage()?.getItem?.(key),
    ];
    const readStoredSetting = (key) => {
        for (const read of readers) {
            try {
                const value = read(key);
                if (value != null) return value;
            } catch {
                // Startup and a denied storage backend can leave a reader unavailable.
            }
        }
        return null;
    };
    return () => resolveGlobalSyncOffset(readVisualSettings()?.[GLOBAL_SYNC_OFFSET_SETTING], readStoredSetting);
}
