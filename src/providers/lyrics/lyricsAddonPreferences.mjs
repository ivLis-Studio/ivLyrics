import { readStoredProviderOrder } from "../storedProviderOrder.mjs";
import { readStoredAddonSetting } from "../addonSettingsStorage.mjs";

const STORAGE_PREFIX = 'ivLyrics:lyrics:';
const PREFER_SYNC_DATA_PROVIDER_SETTING = 'prefer-sync-data-provider';
const PREFER_SYNC_DATA_PROVIDER_STORAGE_KEY = `ivLyrics:visual:${PREFER_SYNC_DATA_PROVIDER_SETTING}`;
const PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING = 'prefer-lyrics-type-over-provider-order';
const PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_STORAGE_KEY = `ivLyrics:visual:${PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING}`;
const DEFAULT_PROVIDER_ORDER = [
    'open-lyrics',
    'lrcred',
    'lyricsplus',
    'spotify',
    'lrclib',
    'unison'
];

export function createLyricsAddonPreferences({ getStoredValue, setStoredValue, readVisualSettings, readAppStorage }) {
    const readPrioritySetting = (setting, storageKey) => {
        const value = readVisualSettings()?.[setting] ?? getStoredValue(storageKey);
        return value !== false && value !== 'false';
    };

    const writePrioritySetting = (setting, storageKey, enabled) => {
        const nextValue = enabled !== false;
        const visual = readVisualSettings();
        if (visual) visual[setting] = nextValue;
        const storage = readAppStorage();
        if (storage?.saveConfig) storage.saveConfig(setting, nextValue);
        else setStoredValue(storageKey, nextValue ? 'true' : 'false');
        return nextValue;
    };

    function getProviderOrder(readAddonIds) {
        const order = readStoredProviderOrder(STORAGE_PREFIX + 'provider-order', getStoredValue, setStoredValue);

        const allAddonIds = readAddonIds();

        // If we have a stored order, we need to make sure it contains all current addons
        if (order.length > 0) {
            const registeredIds = new Set(allAddonIds);
            const filteredOrder = order.filter(id => registeredIds.has(id));
            const orderedIds = new Set(filteredOrder);
            return [...filteredOrder, ...allAddonIds.filter(id => !orderedIds.has(id))];
        }

        // 기본 제공자는 품질과 안정성을 고려한 고정 순서를 사용하고,
        // 마켓플레이스 등에서 추가된 제공자는 등록 순서대로 뒤에 붙인다.
        const defaultIds = DEFAULT_PROVIDER_ORDER.filter(id => allAddonIds.includes(id));
        const defaultIdSet = new Set(defaultIds);
        return [
            ...defaultIds,
            ...allAddonIds.filter(id => !defaultIdSet.has(id))
        ];
    }

    function getAddonSetting(addonId, key, defaultValue = null) {
        return readStoredAddonSetting(getStoredValue, `${STORAGE_PREFIX}addon:${addonId}:${key}`, defaultValue);
    }

    return {
        getProviderOrder,
        getAddonSetting,
        writeProviderOrder: order => setStoredValue(STORAGE_PREFIX + 'provider-order', JSON.stringify(order)),
        writeProviderEnabled: (addonId, enabled) => setStoredValue(STORAGE_PREFIX + `enabled:${addonId}`, enabled ? 'true' : 'false'),
        readProviderEnabled(addonId, readAddon) {
            const stored = getStoredValue(STORAGE_PREFIX + `enabled:${addonId}`);
            if (stored === 'true') return true;
            if (stored === 'false') return false;
            return readAddon(addonId)?.defaultEnabled !== false;
        },
        isPreferSyncDataProviderEnabled: () => readPrioritySetting(
            PREFER_SYNC_DATA_PROVIDER_SETTING, PREFER_SYNC_DATA_PROVIDER_STORAGE_KEY
        ),
        writePreferSyncDataProvider: enabled => writePrioritySetting(
            PREFER_SYNC_DATA_PROVIDER_SETTING, PREFER_SYNC_DATA_PROVIDER_STORAGE_KEY, enabled
        ),
        isPreferLyricsTypeEnabled: () => readPrioritySetting(
            PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING, PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_STORAGE_KEY
        ),
        writePreferLyricsType: enabled => writePrioritySetting(
            PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING, PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_STORAGE_KEY, enabled
        ),
        writeAddonSetting(addonId, key, value) {
            const storageKey = `${STORAGE_PREFIX}addon:${addonId}:${key}`;
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            setStoredValue(storageKey, serialized);
        },
    };
}
