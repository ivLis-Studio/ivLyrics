import { readProviderApiKeys } from "./aiProviderInputs.mjs";

const AUTH_BASE_URL = 'https://enter.pollinations.ai';

// Publishable Pollinations App Key (pk_...) for BYOP.
// Keep this empty for marketplace/user-added builds; it can be configured in the addon settings.
const DEFAULT_CLIENT_ID = 'pk_r7hWynUBrOgSV9SJ';
const DEFAULT_AUTH_SCOPE = 'generate';
const DEFAULT_AUTH_BUDGET = 999;
const DEFAULT_AUTH_EXPIRY_DAYS = 365;

export function createPollinationsConnection({ baseUrl, getSetting, setSetting, getAiRequest }) {
    const getApiKeys = () => readProviderApiKeys(getSetting, { splitDelimiters: true });

    function getPrimaryApiKey() {
        return getApiKeys()[0] || '';
    }

    function buildAuthHeaders(apiKey = getPrimaryApiKey()) {
        return apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
    }

    function maskKey(key) {
        if (!key) return '';
        if (key.length <= 12) return 'configured';
        return `${key.slice(0, 5)}...${key.slice(-4)}`;
    }

    function validateClientId() {
        const clientId = DEFAULT_CLIENT_ID;
        if (clientId && !clientId.startsWith('pk_')) {
            throw new Error('[Pollinations.ai] App Key must be a publishable pk_ key. Never use sk_ as client_id.');
        }
        return clientId;
    }

    async function requestDeviceCode() {
        const body = {
            client_id: validateClientId()
        };

        const response = await getAiRequest()(`${AUTH_BASE_URL}/api/device/code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(`[Pollinations.ai] ${data.error_description || data.error || data.message || `HTTP ${response.status}`}`);
        }

        if (!data.device_code || !data.user_code) {
            throw new Error('[Pollinations.ai] Device authorization response is missing a code.');
        }

        const verificationUrl = buildDeviceAuthorizeUrl(data.user_code);

        return { ...data, verificationUrl };
    }

    function buildDeviceAuthorizeUrl(userCode) {
        const appKey = validateClientId();
        const params = new URLSearchParams({
            user_code: userCode,
            app_key: appKey,
            scope: DEFAULT_AUTH_SCOPE,
            budget: String(DEFAULT_AUTH_BUDGET),
            expiry: String(DEFAULT_AUTH_EXPIRY_DAYS)
        });
        return `${AUTH_BASE_URL}/authorize?${params.toString()}`;
    }

    async function pollDeviceToken(deviceCode) {
        const response = await getAiRequest()(`${AUTH_BASE_URL}/api/device/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: deviceCode })
        });

        const data = await response.json().catch(() => ({}));

        if (data.error === 'authorization_pending' || data.error === 'slow_down') {
            return { pending: true, slowDown: data.error === 'slow_down' };
        }

        if (!response.ok || data.error) {
            throw new Error(`[Pollinations.ai] ${data.error_description || data.error || data.message || `HTTP ${response.status}`}`);
        }

        if (!data.access_token) {
            throw new Error('[Pollinations.ai] Device authorization completed without an access token.');
        }

        return data;
    }

    function storePollinationsAccessToken(accessToken) {
        setSetting('api-keys', accessToken);
        setSetting('api-key', '');
        setSetting('auth-status', 'Connected through Pollinations device login.');
    }

    function disconnectPollinationsAuth() {
        setSetting('api-keys', '');
        setSetting('api-key', '');
        setSetting('auth-status', 'Disconnected.');
    }

    async function fetchApiKeyInfo(apiKey = getPrimaryApiKey()) {
        if (!apiKey) return null;

        const response = await getAiRequest()(`${baseUrl}/account/key`, {
            headers: buildAuthHeaders(apiKey)
        });

        if (!response.ok) {
            let message = `HTTP ${response.status}`;
            try {
                const data = await response.json();
                message = data.error?.message || data.message || message;
            } catch (e) { }
            throw new Error(`[Pollinations.ai] ${message}`);
        }

        return await response.json();
    }

    return {
        getApiKeys, getPrimaryApiKey, buildAuthHeaders, maskKey, requestDeviceCode,
        pollDeviceToken, storePollinationsAccessToken, disconnectPollinationsAuth, fetchApiKeyInfo,
    };
}
