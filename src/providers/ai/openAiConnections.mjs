export function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

export function createEndpointId() {
    return `ep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Capabilities that can be toggled per endpoint. These mirror the
 * AIAddonManager capabilities for this addon plus its researchWebSearch
 * support flag: endpoints without web search serve Research through
 * plain chat completions instead of the Responses API.
 */
export const ENDPOINT_CAPABILITIES = ['pronunciation', 'translate', 'metadata', 'tmi', 'researchWebSearch', 'lyricsStudy', 'characterPronunciation', 'culturalAnnotations', 'wordSupplements', 'motionDirection', 'settingsAssistant'];
export const ENDPOINT_CAPABILITY_FALLBACKS = {
    pronunciation: 'Pronunciation',
    translate: 'Translation',
    metadata: 'Metadata',
    tmi: 'TMI',
    researchWebSearch: 'Research web search',
    lyricsStudy: 'Learning',
    characterPronunciation: 'Character pronunciation',
    culturalAnnotations: 'Cultural context',
    wordSupplements: 'Word details',
    motionDirection: 'Motion direction',
    settingsAssistant: 'Settings assistant'
};

export function isEndpointCapabilityEnabled(capabilities, capability) {
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return true;
    const value = capabilities[capability];
    if (value === undefined || value === null) {
        // Endpoints saved before pronunciation had its own chip keep
        // following their translation choice until it is set separately.
        return capability === 'pronunciation' ? isEndpointCapabilityEnabled(capabilities, 'translate') : true;
    }
    return value === true || value === 'true';
}

export function toggleEndpointCapability(capabilities, capability) {
    const current = capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities) ? capabilities : {};
    const next = { ...current };
    if (capability === 'translate' && (next.pronunciation === undefined || next.pronunciation === null)) {
        // Pin the inherited value so turning translation off leaves pronunciation as it was.
        next.pronunciation = isEndpointCapabilityEnabled(current, 'pronunciation');
    }
    next[capability] = !isEndpointCapabilityEnabled(current, capability);
    return next;
}

export function ensureRequestTargets(targets, capability = null) {
    if (!targets.length) {
        if (capability) {
            throw new Error(`[ChatGPT] No endpoint has the '${capability}' capability enabled. Enable it for at least one endpoint in settings.`);
        }
        throw new Error('[ChatGPT] API key is required. Please configure your API key in settings.');
    }
    if (targets.every(target => !target.model)) {
        throw new Error('[ChatGPT] Model is not selected. Please select a model in settings.');
    }
    return targets;
}


export function parseConnectionKeys(raw) {
    if (Array.isArray(raw)) return raw.filter(key => typeof key === 'string').map(key => key.trim()).filter(Boolean);
    if (typeof raw !== 'string') return [];
    try { if (raw.trim().startsWith('[')) return parseConnectionKeys(JSON.parse(raw)); } catch { }
    return raw.split(/[\n,]/).map(key => key.trim()).filter(Boolean);
}

function parseProviderList(raw) {
    let value = raw;
    if (typeof value === 'string') {
        if (!value.trim()) return [];
        try { value = JSON.parse(value); } catch { return null; }
    }
    if (!Array.isArray(value)) return null;
    return value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
}

export function createOpenAiConnections({ addonId, defaultBaseUrl, getManager, getSetting, setSetting }) {
    function getApiKeys(connection = null) {
        if (connection) return parseConnectionKeys(connection.apiKeys);
        return parseConnectionKeys(getSetting('api-keys', '') || getSetting('api-key', ''));
    }

    function setPrimaryApiKeys(value) {
        setSetting('api-keys', value);
        if (!String(value || '').trim() && getSetting('api-key', '')) {
            setSetting('api-key', '');
        }
    }

    function getBaseUrl(connection = null) {
        if (connection) return normalizeBaseUrl(connection.baseUrl) || defaultBaseUrl;
        return getSetting('base-url', defaultBaseUrl) || defaultBaseUrl;
    }

    function getSelectedModel(connection = null) {
        if (connection) return String(connection.model || '').trim();
        return getSetting('model', null);
    }

    // The provider-level switch is the ceiling: an endpoint can only serve a
    // capability while the master switch allows it, but its own choice stays
    // saved so re-enabling the master restores it.
    function isEffectiveCapability(masterEnabled, endpointCapabilities, capability) {
        return masterEnabled === true && isEndpointCapabilityEnabled(endpointCapabilities, capability);
    }

    function isMasterCapabilityEnabled(capability) {
        try {
            return getManager()?.isCapabilityEnabled?.(addonId, capability) ?? true;
        } catch {
            return true;
        }
    }

    // Before the provider row became the master switch, the manager ignored
    // this provider's provider-level flags, and the row could not be clicked.
    // A flag could therefore stay off while an endpoint had turned the
    // capability back on. Lift such stale flags once, so the update keeps
    // every capability that was working; later choices are left alone.
    const MASTER_SWITCH_MIGRATION_KEY = 'master-switch-migrated';

    function migrateStaleMasterSwitches() {
        const manager = getManager();
        if (typeof manager?.isCapabilityEnabled !== 'function'
            || typeof manager?.setCapabilityEnabled !== 'function') return;
        const done = getSetting(MASTER_SWITCH_MIGRATION_KEY, false);
        if (done === true || done === 'true') return;
        const savedCapabilities = [
            getPrimaryCapabilities(),
            ...getFallbackProviders().map(connection => connection.capabilities)
        ];
        for (const capability of ENDPOINT_CAPABILITIES) {
            const master = manager.isCapabilityEnabled(addonId, capability);
            if (master === true || master === 'true') continue;
            if (savedCapabilities.some(capabilities => isEndpointCapabilityEnabled(capabilities, capability))) {
                manager.setCapabilityEnabled(addonId, capability, true);
            }
        }
        setSetting(MASTER_SWITCH_MIGRATION_KEY, true);
    }

    function getPrimaryCapabilities() {
        const raw = getSetting('primary-capabilities', null);
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
        // One-time migration: capability choices made under the old
        // provider-level keys (addon:chatgpt:capability:*) must carry over
        // to endpoint-level gating, otherwise a previously disabled
        // capability (e.g. metadata) silently re-enables on upgrade.
        // Missing keys default to enabled; persist the seed so later edits
        // happen through this addon's endpoint UI.
        const seeded = {};
        for (const capability of ENDPOINT_CAPABILITIES) {
            let enabled = true;
            try {
                enabled = getManager()?.isCapabilityEnabled?.(addonId, capability) ?? true;
            } catch {
                enabled = true;
            }
            seeded[capability] = enabled === true || enabled === 'true';
        }
        setPrimaryCapabilities(seeded);
        return seeded;
    }

    function setPrimaryCapabilities(capabilities) {
        setSetting('primary-capabilities', capabilities && typeof capabilities === 'object' ? capabilities : {});
    }

    /**
     * Flatten the primary and unified provider list into ordered request targets.
     * Each target: { label, baseUrl, apiKey, model, researchWebSearch }.
     * When a capability is given, only endpoints with that capability enabled
     * are included (missing capabilities entry means all enabled).
     */
    function getRequestTargets(capability = null) {
        const targets = [];
        const seen = new Set();
        for (const connection of getProviderConnections()) {
            if (capability && !isEffectiveCapability(isMasterCapabilityEnabled(capability), connection.capabilities, capability)) continue;
            const baseUrl = normalizeBaseUrl(connection.baseUrl) || defaultBaseUrl;
            const researchWebSearch = isEndpointCapabilityEnabled(connection.capabilities, 'researchWebSearch');
            for (const apiKey of parseConnectionKeys(connection.apiKeys)) {
                const key = JSON.stringify([baseUrl, apiKey, connection.model, capability === 'tmi' && researchWebSearch]);
                if (seen.has(key)) continue;
                seen.add(key);
                targets.push({
                    label: connection.name,
                    baseUrl,
                    apiKey,
                    model: connection.model,
                    researchWebSearch
                });
            }
        }
        return targets;
    }

    function normalizeProviderConnection(item, index, fromEndpoint = false) {
        const { label, apiKey, api_key, customModel, custom_model, ...saved } = item;
        const keys = parseConnectionKeys(item.apiKeys ?? apiKey ?? api_key);
        const model = String(item.model || customModel || custom_model || '').trim();
        return {
            ...saved,
            id: String(item.id || `${fromEndpoint ? 'endpoint' : 'connection'}-${index}`),
            name: String(item.name || label || `API ${index + 1}`).trim(),
            baseUrl: normalizeBaseUrl(item.baseUrl) || defaultBaseUrl,
            apiKeys: keys.length > 1 ? JSON.stringify(keys) : keys[0] || '',
            model,
            inheritPrimaryModel: item.inheritPrimaryModel === true || (fromEndpoint && !model),
            enabled: item.enabled !== false && item.enabled !== 'false',
            capabilities: item.capabilities && typeof item.capabilities === 'object' && !Array.isArray(item.capabilities)
                ? { ...item.capabilities } : {}
        };
    }

    function getFallbackProviders() {
        const existing = parseProviderList(getSetting('fallback-providers', []));
        const imported = parseProviderList(getSetting('extra-endpoints', []));
        const connections = (existing || []).map((item, index) => normalizeProviderConnection(item, index));
        if (!imported?.length) return connections;

        // Keep the released list and its order. Fold PR-era endpoints into it
        // once, preserving incomplete drafts as well as saved credentials.
        const identity = connection => {
            const keys = parseConnectionKeys(connection.apiKeys);
            return keys.length ? JSON.stringify([
                connection.baseUrl, keys,
                connection.model || (connection.inheritPrimaryModel ? getSelectedModel() : '')
            ]) : null;
        };
        for (const [index, item] of imported.entries()) {
            const connection = normalizeProviderConnection(item, index, true);
            const key = identity(connection);
            const duplicate = key && connections.find(saved => identity(saved) === key);
            if (duplicate) {
                duplicate.capabilities = { ...connection.capabilities, ...duplicate.capabilities };
                duplicate.enabled = duplicate.enabled && connection.enabled;
                continue;
            }
            while (connections.some(saved => saved.id === connection.id)) connection.id += '-imported';
            connections.push(connection);
        }
        if (existing && typeof getManager()?.setAddonSetting === 'function') {
            try {
                setSetting('fallback-providers', connections);
                // Retire the second store only after the canonical write can
                // be read back. Interrupted/failed migration remains retryable.
                if (JSON.stringify(parseProviderList(getSetting('fallback-providers', []))) === JSON.stringify(connections)) {
                    setSetting('extra-endpoints', []);
                }
            } catch { /* retain the source list if persistence is unavailable */ }
        }
        return connections;
    }

    function getProviderConnections() {
        return [
            { id: 'primary', name: 'Primary', apiKeys: getApiKeys(), baseUrl: getBaseUrl(),
                model: getSelectedModel(), capabilities: getPrimaryCapabilities() },
            ...getFallbackProviders().filter(connection => connection.enabled).map(connection => ({
                ...connection,
                model: connection.model || (connection.inheritPrimaryModel ? getSelectedModel() : '')
            }))
        ];
    }


    function promoteNextConnection(keepDemoted, getDefaultName) {
        const connections = getFallbackProviders();
        const promoted = connections[0];
        if (!promoted) return;
        const promotedKeys = parseConnectionKeys(promoted.apiKeys);
        const promotedKeysValue = promotedKeys.length > 1 ? JSON.stringify(promotedKeys) : promotedKeys[0] || '';
        const promotedBaseUrl = normalizeBaseUrl(promoted.baseUrl) || defaultBaseUrl;
        const promotedModel = String(promoted.model || '').trim()
            || (promoted.inheritPrimaryModel ? getSelectedModel() || '' : '');
        const promotedCapabilities = promoted.capabilities && typeof promoted.capabilities === 'object'
            ? { ...promoted.capabilities }
            : {};
        const demoted = keepDemoted
            ? normalizeProviderConnection({
                name: getDefaultName(),
                baseUrl: getBaseUrl(),
                apiKeys: getApiKeys(),
                model: getSelectedModel() || '',
                capabilities: getPrimaryCapabilities(),
                enabled: true
            }, 0)
            : null;
        if (demoted) demoted.id = createEndpointId();
        setSetting('fallback-providers', demoted ? [demoted, ...connections.slice(1)] : connections.slice(1));
        setPrimaryApiKeys(promotedKeysValue);
        setSetting('base-url', promotedBaseUrl);
        setSetting('model', promotedModel);
        setSetting('custom-model', '');
        setPrimaryCapabilities(promotedCapabilities);
        return {
            apiKeys: promotedKeysValue,
            baseUrl: promotedBaseUrl,
            model: promotedModel,
            capabilities: promotedCapabilities,
        };
    }

    return {
        getApiKeys, setPrimaryApiKeys, getBaseUrl, getSelectedModel, getPrimaryCapabilities, setPrimaryCapabilities,
        getFallbackProviders, getProviderConnections, getRequestTargets, isMasterCapabilityEnabled,
        migrateStaleMasterSwitches, promoteNextConnection,
    };
}
