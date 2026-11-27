// Settings shared by several AI providers. Each provider passes its own
// setting accessors and text, so keys stay per provider.

// One provider's own stored settings. The manager is looked up on every call
// because built-in providers are created before it is installed.
export function createAiAddonSettingAccess(getManager, addonId) {
    return {
        getSetting: (key, defaultValue = null) => getManager()?.getAddonSetting(addonId, key, defaultValue) ?? defaultValue,
        setSetting: (key, value) => { getManager()?.setAddonSetting?.(addonId, key, value); },
    };
}

// Request parameters from the "Advanced API Parameters" section below.
export function readAiAdvancedRequestParams(getSetting, { maxTokens = 16000, temperature = true } = {}) {
    const params = {};
    const useMaxTokens = getSetting('adv-maxTokens-enabled', true);
    if (useMaxTokens) {
        params.max_tokens = parseInt(getSetting('adv-maxTokens-value', maxTokens)) || maxTokens;
    }
    const useTemperature = temperature !== null && getSetting('adv-temperature-enabled', temperature);
    if (useTemperature) {
        params.temperature = parseFloat(getSetting('adv-temperature-value', 0.3)) || 0.3;
    }
    return params;
}

// Max tokens and temperature, each of which can be left out of the request.
// A provider that never sends a temperature passes temperature: null and
// shows no temperature row.
export function createAiAdvancedParamsSection({ React, getSetting, setSetting, aiText, maxTokens = 16000, temperature = true }) {
    const { useState, useCallback } = React;
    const showTemperature = temperature !== null;
    return function AdvancedParamsSection() {
        const [expanded, setExpanded] = useState(() => getSetting('adv-expanded', false));
        const [maxTokensEnabled, setMaxTokensEnabled] = useState(() => getSetting('adv-maxTokens-enabled', true));
        const [maxTokensValue, setMaxTokensValue] = useState(() => getSetting('adv-maxTokens-value', maxTokens));
        const [temperatureEnabled, setTemperatureEnabled] = useState(() => showTemperature && getSetting('adv-temperature-enabled', temperature));
        const [temperatureValue, setTemperatureValue] = useState(() => (showTemperature ? getSetting('adv-temperature-value', 0.3) : 0.3));

        const toggleExpanded = useCallback(() => {
            const next = !expanded;
            setExpanded(next);
            setSetting('adv-expanded', next);
        }, [expanded]);

        return renderAiAdvancedParams(React, { aiText, expanded, toggleExpanded },
            expanded && React.createElement('div', { className: 'ai-addon-advanced-body' },
                React.createElement('div', { className: 'ai-addon-advanced-row' },
                    React.createElement('label', { className: 'ai-addon-advanced-check' },
                        React.createElement('input', { type: 'checkbox', checked: maxTokensEnabled, onChange: (e) => { setMaxTokensEnabled(e.target.checked); setSetting('adv-maxTokens-enabled', e.target.checked); } }),
                        React.createElement('span', null, aiText('maxTokens', 'Max Tokens'))
                    ),
                    React.createElement('input', { type: 'number', value: maxTokensValue, disabled: !maxTokensEnabled, 'aria-label': aiText('maxTokens', 'Max Tokens'), onChange: (e) => { const v = parseInt(e.target.value) || maxTokens; setMaxTokensValue(v); setSetting('adv-maxTokens-value', v); } })
                ),
                ...(showTemperature ? [React.createElement('div', { className: 'ai-addon-advanced-row' },
                    React.createElement('label', { className: 'ai-addon-advanced-check' },
                        React.createElement('input', { type: 'checkbox', checked: temperatureEnabled, onChange: (e) => { setTemperatureEnabled(e.target.checked); setSetting('adv-temperature-enabled', e.target.checked); } }),
                        React.createElement('span', null, aiText('temperature', 'Temperature'))
                    ),
                    React.createElement('input', { type: 'number', value: temperatureValue, disabled: !temperatureEnabled, 'aria-label': aiText('temperature', 'Temperature'), step: '0.1', min: '0', max: '2', onChange: (e) => { const v = parseFloat(e.target.value) || 0.3; setTemperatureValue(v); setSetting('adv-temperature-value', v); } })
                )] : []),
                React.createElement('small', null, aiText('advancedParamsDesc', 'Uncheck to exclude parameter from API request.'))
            )
        );
    };
}

// The "Test Connection" row and its result.
export function renderAiConnectionTestRow(React, { onTest, testStatus, aiText }) {
    return React.createElement('div', { className: 'ai-addon-setting' },
        React.createElement('button', { type: 'button', onClick: onTest, className: 'ai-addon-btn ai-addon-btn-primary' }, aiText('testConnection', 'Test Connection')),
        testStatus && React.createElement('span', {
            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
        }, testStatus)
    );
}

export function useAiApiKeyValue(React, getSetting) {
    return React.useState(() => {
        const keys = getSetting('api-keys', '') || getSetting('api-key', '');
        return Array.isArray(keys) ? JSON.stringify(keys) : keys;
    });
}

export function renderAiApiKeyRow(React, { aiText, value, onChange, placeholder, onOpen, linkText }) {
    return React.createElement('div', { className: 'ai-addon-setting' },
        React.createElement('label', null, aiText('apiKey', 'API Key(s)')),
        React.createElement('div', { className: 'ai-addon-input-group' },
            React.createElement('input', { type: 'text', value, onChange, placeholder }),
            React.createElement('button', {
                type: 'button',
                onClick: onOpen,
                className: 'ai-addon-btn ai-addon-btn-secondary'
            }, linkText ?? aiText('getApiKey', 'Get API Key'))
        ),
        React.createElement('small', null, aiText('apiKeyRotationDesc', 'Enter a single key or JSON array for rotation'))
    );
}

export function renderAiModelRow(React, { aiText, select, onRefresh, loading, refreshDisabled, below = [] }) {
    return React.createElement('div', { className: 'ai-addon-setting' },
        React.createElement('label', null, aiText('model', 'Model')),
        React.createElement('div', { className: 'ai-addon-input-group' },
            select,
            React.createElement('button', {
                type: 'button',
                onClick: onRefresh,
                className: 'ai-addon-btn ai-addon-btn-secondary ai-addon-connection-icon',
                disabled: refreshDisabled,
                'aria-label': aiText('refreshModels', 'Refresh model list'),
                title: aiText('refreshModels', 'Refresh model list')
            }, loading ? '...' : '↻')
        ),
        ...below
    );
}

export function renderAiDefaultModelOptions(React, { aiText, loading, models, selectedModel, hasApiKey }) {
    if (loading) return React.createElement('option', { value: '' }, aiText('loadingModels', 'Loading models...'));
    if (models.length > 0) return models.map(model => React.createElement('option', { key: model.id, value: model.id }, model.name));
    const placeholder = selectedModel || (hasApiKey ? aiText('noModels', 'No models found') : aiText('enterApiKeyFirst', 'Enter API key first'));
    return React.createElement('option', { value: selectedModel }, placeholder);
}

export function useAiModelPicker(React, { apiKeys, getApiKeys, fetchModels, onLoaded, logName }) {
    const [availableModels, setAvailableModels] = React.useState([]);
    const [modelsLoading, setModelsLoading] = React.useState(false);

    const loadModels = React.useCallback(async () => {
        const [key] = getApiKeys();
        if (!key) {
            setAvailableModels([]);
            return;
        }
        setModelsLoading(true);
        try {
            const models = await fetchModels(key);
            setAvailableModels(models);
            onLoaded?.(models);
        } catch (error) {
            console.error(`[${logName} Addon] Failed to load models:`, error);
        } finally {
            setModelsLoading(false);
        }
    }, [apiKeys]);

    React.useEffect(() => { void loadModels(); }, [loadModels]);
    return { availableModels, modelsLoading, loadModels };
}

export async function testAiConnection(request, setStatus, aiText) {
    setStatus(aiText('testingConnection', 'Testing...'));
    try {
        const result = await request('Say "Hello" in one word.');
        setStatus(result
            ? '✓ ' + aiText('connectionSuccess', 'Connection successful')
            : '✗ ' + aiText('emptyResponse', 'Empty response'));
    } catch (error) {
        setStatus(`✗ ${error.message}`);
    }
}

export function renderAiAdvancedParams(React, { aiText, expanded, toggleExpanded }, body) {
    return React.createElement('div', { className: 'ai-addon-setting ai-addon-advanced-params' },
        React.createElement('button', {
            type: 'button',
            className: 'ai-addon-advanced-toggle',
            'aria-expanded': expanded,
            onClick: toggleExpanded
        },
            React.createElement('span', { className: 'ai-addon-advanced-chevron', 'aria-hidden': 'true' }, '▶'),
            aiText('advancedParams', 'Advanced API Parameters')
        ),
        body
    );
}
