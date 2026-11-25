import {
    ENDPOINT_CAPABILITIES, ENDPOINT_CAPABILITY_FALLBACKS, createEndpointId, isEndpointCapabilityEnabled,
    parseConnectionKeys, toggleEndpointCapability,
} from "./openAiConnections.mjs";
import { inspectRequestBodyMergeJson, normalizeRequestBodyMergeJson } from "./openAiRequestBody.mjs";

export function createOpenAiSettings({
    info: ADDON_INFO, defaultBaseUrl: DEFAULT_OPENAI_BASE_URL, getSpicetify, getSetting, setSetting,
    t, connections, fetchAvailableModels, getDefaultRequestBodyMergeJson, openApiKeyPage,
    testSingleTarget, debug,
}) {
    const aiText = (key, fallback, params) => t(`settings.aiProviders.${key}`, fallback, params);
    const {
        getApiKeys, setPrimaryApiKeys, getBaseUrl, getSelectedModel, getPrimaryCapabilities, setPrimaryCapabilities,
        getFallbackProviders, isMasterCapabilityEnabled, promoteNextConnection,
    } = connections;

    return function getSettingsUI() {
        const React = getSpicetify().React;
        const { useState, useCallback, useEffect } = React;

        function useConnectionModels({ apiKey, baseUrl, delay = 0, onLoaded }) {
            const [models, setModels] = useState([]);
            const [loading, setLoading] = useState(false);
            const [revision, setRevision] = useState(0);
            useEffect(() => {
                setModels([]);
                setLoading(!!apiKey);
                if (!apiKey) return;

                let active = true;
                const load = async () => {
                    try {
                        const available = await fetchAvailableModels(apiKey, baseUrl);
                        if (!active) return;
                        setModels(available);
                        onLoaded?.(available);
                    } catch (error) {
                        if (active) debug('[ChatGPT Addon] Failed to load models:', error);
                    } finally {
                        if (active) setLoading(false);
                    }
                };
                const timer = delay ? setTimeout(load, delay) : null;
                if (timer === null) void load();
                return () => {
                    active = false;
                    if (timer !== null) clearTimeout(timer);
                };
            }, [apiKey, baseUrl, revision]);
            return { models, loading, refresh: () => setRevision(value => value + 1) };
        }

        return function ChatGPTSettings() {
            const initialApiKeys = getSetting('api-keys', '') || getSetting('api-key', '');
            const [apiKeys, setApiKeys] = useState(
                Array.isArray(initialApiKeys) ? JSON.stringify(initialApiKeys) : initialApiKeys
            );
            const [baseUrl, setBaseUrl] = useState(getSetting('base-url', DEFAULT_OPENAI_BASE_URL));
            const [model, setModel] = useState(getSelectedModel());
            const [customModel, setCustomModel] = useState(getSetting('custom-model', ''));
            const [testStatus, setTestStatus] = useState('');
            // Remount token for the additional-provider list after a chain
            // swap, plus a re-render nudge so this card's move control
            // follows provider list edits made inside that list.
            const [providersToken, setProvidersToken] = useState(0);
            const [, refreshChainState] = useState(0);
            const { models: availableModels, loading: modelsLoading, refresh: handleRefreshModels } = useConnectionModels({
                apiKey: getApiKeys()[0], baseUrl,
                onLoaded: models => { ADDON_INFO.models = models; },
            });

            const handleApiKeyChange = useCallback((e) => {
                setApiKeys(e.target.value);
                setPrimaryApiKeys(e.target.value);
            }, []);

            const handleBaseUrlChange = useCallback((e) => {
                const value = e.target.value;
                setBaseUrl(value);
                setSetting('base-url', value);
            }, []);

            const handleModelChange = useCallback((e) => {
                setModel(e.target.value);
                setSetting('model', e.target.value);
            }, []);

            const handleCustomModelChange = useCallback((e) => {
                const value = e.target.value;
                setCustomModel(value);
                setSetting('custom-model', value);
                if (value) {
                    setSetting('model', value);
                    setModel(value);
                }
            }, []);

            // Endpoint-scoped: this card tests only its own endpoint. Real
            // requests still fall back through the chain, but the test must
            // never report a passing primary when a backup answered.
            const handleTest = useCallback(async () => {
                const keys = getApiKeys();
                setTestStatus(aiText('testingConnection', 'Testing...'));
                try {
                    await testSingleTarget({ baseUrl: getBaseUrl(), apiKey: keys[0], model: getSelectedModel() });
                    setTestStatus('✓ ' + aiText('connectionSuccess', 'Connection successful.'));
                } catch (e) {
                    setTestStatus(`✗ ${e.message}`);
                }
            }, []);

            const isModelInList = availableModels.find(m => m.id === model);
            const hasApiKey = getApiKeys().length > 0;
            const primaryModel = getSelectedModel() || '';
            const hasFallbacks = getFallbackProviders().length > 0;

            const [primaryCapabilities, setPrimaryCapabilitiesState] = useState(() => getPrimaryCapabilities());

            const togglePrimaryCapability = useCallback((cap) => {
                setPrimaryCapabilitiesState((prev) => {
                    const next = toggleEndpointCapability(prev, cap);
                    setPrimaryCapabilities(next);
                    return next;
                });
            }, []);

            // The primary keeps its own settings keys, so reordering works by
            // swapping values with the provider below: the chain order changes
            // and pressing this again swaps back. Removing the primary promotes
            // that provider into its place and drops the old entry, so the chain
            // never drops below one provider.
            const replacePrimaryWithNext = useCallback(keepDemoted => {
                const promoted = promoteNextConnection(keepDemoted, () => t('misc.default', 'Default'));
                if (!promoted) return;
                const {
                    apiKeys: promotedKeysValue, baseUrl: promotedBaseUrl, model: promotedModel,
                    capabilities: promotedCapabilities,
                } = promoted;
                setApiKeys(promotedKeysValue);
                setBaseUrl(promotedBaseUrl);
                setModel(promotedModel);
                setCustomModel('');
                setPrimaryCapabilitiesState(promotedCapabilities);
                setTestStatus('');
                setProvidersToken(value => value + 1);
                refreshChainState(value => value + 1);
            }, []);

            const movePrimaryDown = useCallback(() => replacePrimaryWithNext(true), [replacePrimaryWithNext]);
            const removePrimary = useCallback(() => replacePrimaryWithNext(false), [replacePrimaryWithNext]);

            const renderApiKeyRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                    React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-apiKeys` }, aiText('apiKey', 'API Key(s)')),
                    React.createElement('div', { className: 'ai-addon-input-group' },
                        React.createElement('input', { id: `${ADDON_INFO.id}-primary-apiKeys`, type: 'password', autoComplete: 'off', value: apiKeys, onChange: handleApiKeyChange, placeholder: 'sk-...' }),
                        React.createElement('button', { type: 'button', onClick: openApiKeyPage, className: 'ai-addon-btn ai-addon-btn-secondary' }, aiText('getApiKey', 'Get API Key'))
                    ),
                    React.createElement('small', null, aiText('apiKeyDesc', 'Enter an API key or JSON array.'))
                );
            const renderBaseUrlRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                    React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-baseUrl` }, aiText('baseUrl', 'Base URL')),
                    React.createElement('input', { id: `${ADDON_INFO.id}-primary-baseUrl`, type: 'text', value: baseUrl, onChange: handleBaseUrlChange, placeholder: DEFAULT_OPENAI_BASE_URL }),
                    React.createElement('small', null, aiText('baseUrlDesc', 'Use a custom OpenAI-compatible API URL.'))
                );
            const renderModelRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                    React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-models` }, aiText('model', 'Model')),
                    React.createElement('div', { className: 'ai-addon-input-group' },
                        React.createElement('select', {
                            id: `${ADDON_INFO.id}-primary-models`,
                            value: isModelInList ? model : '',
                            onChange: handleModelChange,
                            disabled: modelsLoading
                        },
                            modelsLoading
                                ? React.createElement('option', { value: '' }, aiText('loadingModels', 'Loading models...'))
                                : availableModels.length > 0
                                    ? [
                                        !model && React.createElement('option', { key: '__placeholder__', value: '' }, aiText('selectModel', 'Select a model')),
                                        ...availableModels.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name)),
                                        React.createElement('option', { key: 'custom', value: '' }, aiText('modelId', 'Model ID'))
                                    ].filter(Boolean)
                                    : [
                                        React.createElement('option', { key: 'empty', value: '' }, hasApiKey ? aiText('noModels', 'No models found') : aiText('enterApiKeyFirst', 'Enter API key first')),
                                        React.createElement('option', { key: 'custom', value: '' }, aiText('modelId', 'Model ID'))
                                    ]
                        ),
                        React.createElement('button', {
                            type: 'button',
                            onClick: handleRefreshModels,
                            className: 'ai-addon-btn ai-addon-btn-secondary ai-addon-connection-icon',
                            disabled: modelsLoading || !hasApiKey,
                            'aria-label': aiText('refreshModels', 'Refresh model list'),
                            title: aiText('refreshModels', 'Refresh model list')
                        }, modelsLoading ? '...' : '↻')
                    ),
                    availableModels.length > 0 && React.createElement('small', null, aiText('modelsAvailable', '{count} models available', { count: availableModels.length }))
                );
            const renderCustomModelRow = () => React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                    React.createElement('label', { htmlFor: `${ADDON_INFO.id}-primary-customModel` }, aiText('modelId', 'Custom Model ID')),
                    React.createElement('input', { id: `${ADDON_INFO.id}-primary-customModel`, type: 'text', value: customModel, onChange: handleCustomModelChange, placeholder: 'gpt-4-turbo', 'aria-label': aiText('modelId', 'Custom Model ID') })
                );

            return React.createElement('div', { className: 'ai-addon-settings chatgpt-settings' },
                React.createElement('div', { className: 'ai-addon-setting' },
                    renderConnectionCard({
                        heading: React.createElement('div', { className: 'ai-addon-connection-enabled' },
                            React.createElement('span', null, `1. ${t('misc.default', 'Default')}`)
                        ),
                        actions: React.createElement('div', { className: 'ai-addon-connection-actions' },
                            iconButton(aiText('moveUp', 'Move up'), '↑', () => {}, true),
                            iconButton(aiText('moveDown', 'Move down'), '↓', movePrimaryDown, !hasFallbacks),
                            iconButton(aiText('removeConnection', 'Remove provider'), '×', removePrimary, !hasFallbacks)
                        ),
                        fields: [
                            renderApiKeyRow(),
                            renderBaseUrlRow(),
                            renderModelRow(),
                            (!isModelInList || customModel) && renderCustomModelRow()
                        ],
                        capabilities: primaryCapabilities,
                        onToggle: togglePrimaryCapability,
                        blockedByMaster: capability => !isMasterCapabilityEnabled(capability),
                        testButton: React.createElement('button', {
                            type: 'button', onClick: handleTest, className: 'ai-addon-btn ai-addon-btn-secondary',
                            disabled: !hasApiKey || !primaryModel
                        }, aiText('testConnection', 'Test Connection')),
                        status: testStatus && React.createElement('small', {
                            role: 'status', 'aria-live': 'polite',
                            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                        }, testStatus)
                    })
                ),
                React.createElement(FallbackProvidersSection, {
                    key: providersToken,
                    onSaved: () => refreshChainState(value => value + 1),
                    onPromote: movePrimaryDown
                }),
                // Advanced API Parameters
                React.createElement(AdvancedParamsSection)
            );
        };

        function iconButton(label, glyph, onClick, disabled = false) {
            return React.createElement('button', {
                type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary ai-addon-connection-icon',
                onClick, disabled, 'aria-label': label, title: label
            }, glyph);
        }

        // Share presentation only: the primary keeps its original settings and handlers.
        function renderConnectionCard({ heading, actions, fields, capabilities, onToggle, blockedByMaster, testButton, status }) {
            return React.createElement('div', { className: 'ai-addon-connection-card' },
                React.createElement('div', { className: 'ai-addon-connection-header' }, heading, actions),
                React.createElement('div', { className: 'ai-addon-connection-fields' }, ...fields),
                React.createElement(CapabilityControls, { capabilities, onToggle, blockedByMaster }),
                React.createElement('div', { className: 'ai-addon-connection-footer' }, testButton, status)
            );
        }

        // A chip blocked by the provider master switch stays clickable so the
        // endpoint choice is kept for when the master switch is re-enabled.
        function CapabilityControls({ capabilities, onToggle, blockedByMaster }) {
            return React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-capabilities' },
                React.createElement('label', null, aiText('enabledCapabilities', 'Enabled Capabilities')),
                React.createElement('div', { className: 'ai-addon-caps-container' },
                    ENDPOINT_CAPABILITIES.map(capability => {
                        const enabled = isEndpointCapabilityEnabled(capabilities, capability);
                        // Blocked-but-saved: the endpoint still wants the
                        // capability but the provider master switch is off.
                        const blocked = enabled && blockedByMaster?.(capability) === true;
                        return React.createElement('button', {
                            key: capability, type: 'button',
                            className: `ai-addon-cap-chip ${enabled ? 'active' : ''} ${blocked ? 'is-blocked ' : ''}cap-${capability}`,
                            'aria-pressed': enabled, onClick: () => onToggle(capability),
                            title: blocked ? aiText('capabilityBlockedByProvider', 'Blocked by provider master') : undefined
                        }, aiText(`supports.${capability}`, ENDPOINT_CAPABILITY_FALLBACKS[capability]));
                    })
                )
            );
        }

        function FallbackProvidersSection({ onSaved, onPromote }) {
            const [connections, setConnections] = useState(getFallbackProviders);
            const save = update => {
                setConnections(previous => {
                    const next = typeof update === 'function' ? update(previous) : update;
                    setSetting('fallback-providers', next);
                    return next;
                });
                onSaved();
            };
            const move = (id, delta) => save(previous => {
                const index = previous.findIndex(connection => connection.id === id);
                const target = index + delta;
                if (index < 0 || target < 0 || target >= previous.length) return previous;
                const next = [...previous];
                [next[index], next[target]] = [next[target], next[index]];
                return next;
            });
            return React.createElement('div', { className: 'ai-addon-setting ai-addon-connections' },
                React.createElement('label', null, aiText('openaiConnections', 'Additional OpenAI-compatible providers')),
                React.createElement('small', null, aiText('openaiConnectionsDesc', 'Try enabled providers in order when the primary fails.')),
                connections.map((connection, index) => React.createElement(ConnectionEditor, {
                    key: connection.id,
                    connection, index, count: connections.length,
                    onChange: patch => save(previous => previous.map(item => item.id === connection.id ? { ...item, ...patch } : item)),
                    onRemove: () => save(previous => previous.filter(item => item.id !== connection.id)),
                    onMove: delta => move(connection.id, delta),
                    onPromote
                })),
                React.createElement('button', {
                    type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary',
                    onClick: () => save(previous => [...previous, {
                        id: createEndpointId(), name: `API ${previous.length + 1}`,
                        baseUrl: DEFAULT_OPENAI_BASE_URL, apiKeys: '', model: '', enabled: true, capabilities: {}
                    }])
                }, aiText('addOpenaiConnection', 'Add provider'))
            );
        }

        function ConnectionEditor({ connection, index, count, onChange, onRemove, onMove, onPromote }) {
            const [status, setStatus] = useState('');
            const [testing, setTesting] = useState(false);
            const keys = parseConnectionKeys(connection.apiKeys);
            const { models, loading, refresh } = useConnectionModels({ apiKey: keys[0], baseUrl: connection.baseUrl, delay: 350 });
            const selectedModel = connection.model || (connection.inheritPrimaryModel ? getSelectedModel() : '');
            const customModel = !models.some(model => model.id === selectedModel);
            const field = (label, key, type = 'text') => {
                const id = `${ADDON_INFO.id}-${encodeURIComponent(connection.id)}-${key}`;
                return React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                    React.createElement('label', { htmlFor: id }, label),
                    React.createElement('input', {
                        id, type, value: connection[key] || '', autoComplete: 'off',
                        placeholder: key === 'model' ? selectedModel : undefined,
                        onChange: event => onChange({ [key]: event.target.value,
                            ...(key === 'model' ? { inheritPrimaryModel: false } : {}) })
                    })
                );
            };
            return renderConnectionCard({
                heading: React.createElement('label', { className: 'ai-addon-connection-enabled' },
                    React.createElement('input', {
                        type: 'checkbox', checked: connection.enabled !== false,
                        onChange: event => onChange({ enabled: event.target.checked })
                    }),
                    React.createElement('span', null, `${index + 2}. ${connection.name || 'API'}`)
                ),
                actions: React.createElement('div', { className: 'ai-addon-connection-actions' },
                    // The first provider sits right below the primary, so its move-up
                    // promotes it into the primary slot, mirroring the primary's move-down.
                    iconButton(aiText('moveUp', 'Move up'), '↑', index === 0 ? onPromote : () => onMove(-1)),
                    iconButton(aiText('moveDown', 'Move down'), '↓', () => onMove(1), index === count - 1),
                    iconButton(aiText('removeConnection', 'Remove provider'), '×', onRemove)
                ),
                fields: [
                    field(aiText('connectionName', 'Name'), 'name'),
                    field(aiText('baseUrl', 'Base URL'), 'baseUrl'),
                    field(aiText('apiKey', 'API Key(s)'), 'apiKeys', 'password'),
                    React.createElement('div', { className: 'ai-addon-setting ai-addon-connection-field' },
                        React.createElement('label', { htmlFor: `${ADDON_INFO.id}-${encodeURIComponent(connection.id)}-models` }, aiText('model', 'Model')),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('select', {
                                id: `${ADDON_INFO.id}-${encodeURIComponent(connection.id)}-models`,
                                value: customModel ? '' : selectedModel, disabled: loading || !models.length,
                                onChange: event => onChange({ model: event.target.value, inheritPrimaryModel: false })
                            },
                                React.createElement('option', { value: '' }, aiText('modelId', 'Custom Model ID')),
                                models.map(model => React.createElement('option', { key: model.id, value: model.id }, model.name))
                            ),
                            iconButton(aiText('refreshModels', 'Refresh model list'), loading ? '…' : '↻',
                                refresh, loading || !keys.length)
                        )
                    ),
                    customModel && field(aiText('modelId', 'Model ID'), 'model')
                ],
                capabilities: connection.capabilities,
                onToggle: capability => onChange({
                    capabilities: toggleEndpointCapability(connection.capabilities, capability)
                }),
                blockedByMaster: capability => !isMasterCapabilityEnabled(capability),
                testButton: React.createElement('button', {
                    type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary',
                    disabled: testing || loading || !keys.length || !selectedModel,
                    onClick: async () => {
                        setTesting(true);
                        setStatus(aiText('testingConnection', 'Testing...'));
                        try {
                            await testSingleTarget({ baseUrl: connection.baseUrl, apiKey: keys[0], model: selectedModel });
                            setStatus('✓ ' + aiText('connectionSuccess', 'Connection successful.'));
                        } catch (error) { setStatus(`✗ ${error.message}`); }
                        finally { setTesting(false); }
                    }
                }, aiText('testThisConnection', 'Test this provider')),
                status: status && React.createElement('small', { role: 'status', 'aria-live': 'polite' }, status)
            });
        }

        function describeRequestBodyMergeError(rawValue) {
            const result = inspectRequestBodyMergeJson(rawValue);
            if (result.error === 'notObject') {
                return aiText('requestBodyMergeNotObject', 'Request Body Merge JSON must be a JSON object.');
            }
            if (result.error === 'invalidJson') {
                return `${aiText('invalidJson', 'Invalid JSON')}: ${result.cause.message}`;
            }
            return '';
        }

        function AdvancedParamsSection() {
            const [expanded, setExpanded] = useState(getSetting('adv-expanded', false));
            const [requestBodyMergeJson, setRequestBodyMergeJson] = useState(() => {
                const savedValue = normalizeRequestBodyMergeJson(getSetting('adv-requestBodyMergeJson', ''));
                return savedValue || getDefaultRequestBodyMergeJson();
            });
            const requestBodyMergeError = describeRequestBodyMergeError(requestBodyMergeJson);

            useEffect(() => {
                if (!normalizeRequestBodyMergeJson(getSetting('adv-requestBodyMergeJson', ''))) {
                    setSetting('adv-requestBodyMergeJson', getDefaultRequestBodyMergeJson());
                }
            }, []);

            const toggleExpanded = useCallback(() => {
                const next = !expanded;
                setExpanded(next);
                setSetting('adv-expanded', next);
            }, [expanded]);

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
                expanded && React.createElement('div', { className: 'ai-addon-advanced-body' },
                    React.createElement('label', { className: 'ai-addon-advanced-field' },
                        React.createElement('span', null, aiText('requestBodyMerge', 'Request Body Merge JSON')),
                        React.createElement('textarea', {
                            value: requestBodyMergeJson,
                            rows: 7,
                            spellCheck: false,
                            placeholder: '{\n  "max_completion_tokens": 16000,\n  "max_tokens": null\n}',
                            'aria-invalid': requestBodyMergeError ? true : undefined,
                            onChange: (e) => {
                                const value = e.target.value;
                                setRequestBodyMergeJson(value);
                                setSetting('adv-requestBodyMergeJson', value);
                            }
                        })
                    ),
                    requestBodyMergeError
                        ? React.createElement('small', { className: 'ai-addon-field-error' }, requestBodyMergeError)
                        : React.createElement('small', null, aiText('requestBodyMergeDesc', 'Merged into the default request body. max_completion_tokens and temperature are filled in by default. Set a key to null to remove it.'))
                )
            );
        }
    };
}
