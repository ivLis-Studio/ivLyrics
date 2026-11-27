import { readStoredProviderOrder } from "../storedProviderOrder.mjs";
import { readStoredAddonSetting } from "../addonSettingsStorage.mjs";
import { normalizeTranslationStyle } from "./aiTranslationPrompts.mjs";

const STORAGE_PREFIX = 'ivLyrics:ai:';
const TRANSLATION_STYLE_STORAGE_KEY = `${STORAGE_PREFIX}translation-style`;
const PROVIDER_ORDER_STORAGE_KEY = `${STORAGE_PREFIX}provider-order`;
const DEFAULT_PROVIDER_RETRY_COUNT = 2;
const MAX_PROVIDER_RETRY_COUNT = 5;
const PROVIDER_RETRY_COUNT_STORAGE_KEY = `${STORAGE_PREFIX}provider-retry-count`;
export const normalizeProviderRetryCount = (value) => {
    if (value === null || value === undefined || value === '') {
        return DEFAULT_PROVIDER_RETRY_COUNT;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_PROVIDER_RETRY_COUNT;
    }
    return Math.min(MAX_PROVIDER_RETRY_COUNT, Math.max(0, Math.round(parsed)));
};

// 키가 필요 없는 Addon(번역 전용 Bing·Google, 발음 전용 Pronunciation Lab)은
// 첫 실행부터 활성화한다. Pronunciation Lab은 등록 순서상 맨 뒤라, 사용자가
// 켠 AI 제공자가 먼저 발음을 만들고 실패할 때만 이어받는다.
const DEFAULT_ENABLED_ADDONS = ["bing-translate", "google-translate", "pronunciation-lab"];
export function createAiAddonPreferences({ getStoredValue, setStoredValue, getOwnStorage }) {
    function writeTranslationStyle(style) {
        setStoredValue(TRANSLATION_STYLE_STORAGE_KEY, style);
    }

    function getTranslationStyle() {
        return normalizeTranslationStyle(getStoredValue(TRANSLATION_STYLE_STORAGE_KEY));
    }

    function writeProviderRetryCount(retryCount) {
        setStoredValue(PROVIDER_RETRY_COUNT_STORAGE_KEY, String(retryCount));
    }

    function getProviderRetryCount() {
        return normalizeProviderRetryCount(getStoredValue(PROVIDER_RETRY_COUNT_STORAGE_KEY));
    }

    function writeProviderOrder(order) {
        setStoredValue(PROVIDER_ORDER_STORAGE_KEY, JSON.stringify(order));
    }

    function writeProviderEnabled(addonId, enabled) {
        setStoredValue(STORAGE_PREFIX + `enabled:${addonId}`, enabled ? 'true' : 'false');
    }

    function getProviderOrder(readAddonIds) {
        const order = readStoredProviderOrder(PROVIDER_ORDER_STORAGE_KEY, getStoredValue, setStoredValue);

        const allIds = readAddonIds();

        // 저장된 순서가 없으면 기본 순서 반환
        if (order.length === 0) {
            return allIds;
        }

        // 1. 저장된 순서 중 현재 존재하는 Addon만 유지 (삭제된 Addon 제거)
        // 2. 저장된 순서에 없는 새로운 Addon을 뒤에 추가
        const registeredIds = new Set(allIds);
        const filteredOrder = order.filter(id => registeredIds.has(id));
        const orderedIds = new Set(order);
        const newIds = allIds.filter(id => !orderedIds.has(id));

        return [...filteredOrder, ...newIds];
    }

    function isProviderEnabled(addonId) {
        const stored = getStoredValue(STORAGE_PREFIX + `enabled:${addonId}`);
        if (stored === null || stored === undefined) {
            return DEFAULT_ENABLED_ADDONS.includes(addonId);
        }
        return stored === 'true';
    }

    function setAddonSetting(addonId, key, value) {
        const storageKey = `${STORAGE_PREFIX}addon:${addonId}:${key}`;
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        setStoredValue(storageKey, serialized);
    }

    /**
     * Addon 설정 가져오기
     * @param {string} addonId - Addon ID
     * @param {string} key - 설정 키
     * @param {*} defaultValue - 기본값
     * @returns {*}
     */
    function getAddonSetting(addonId, key, defaultValue = null) {
        return readStoredAddonSetting(getStoredValue, `${STORAGE_PREFIX}addon:${addonId}:${key}`, defaultValue);
    }

    /**
     * Addon의 모든 설정 가져오기
     * @param {string} addonId - Addon ID
     * @returns {Object}
     */
    function getAddonSettings(addonId, readSetting) {
        const prefix = `${STORAGE_PREFIX}addon:${addonId}:`;
        const settings = {};

        const localStorage = getOwnStorage();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const settingKey = key.substring(prefix.length);
                settings[settingKey] = readSetting(addonId, settingKey);
            }
        }

        return settings;
    }

    return {
        writeTranslationStyle, getTranslationStyle, writeProviderRetryCount, getProviderRetryCount,
        writeProviderOrder, getProviderOrder, writeProviderEnabled, isProviderEnabled,
        setAddonSetting, getAddonSetting, getAddonSettings,
    };
}
