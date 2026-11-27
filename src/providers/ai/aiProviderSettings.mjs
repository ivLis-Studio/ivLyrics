// Settings shared by several AI providers. Each provider passes its own
// setting accessors and text, so keys stay per provider.

// Request parameters from the "Advanced API Parameters" section below.
export function readAiAdvancedRequestParams(getSetting) {
    const params = {};
    const useMaxTokens = getSetting('adv-maxTokens-enabled', true);
    if (useMaxTokens) {
        params.max_tokens = parseInt(getSetting('adv-maxTokens-value', 16000)) || 16000;
    }
    const useTemperature = getSetting('adv-temperature-enabled', true);
    if (useTemperature) {
        params.temperature = parseFloat(getSetting('adv-temperature-value', 0.3)) || 0.3;
    }
    return params;
}

// Max tokens and temperature, each of which can be left out of the request.
export function createAiAdvancedParamsSection({ React, getSetting, setSetting, aiText }) {
    const { useState, useCallback } = React;
    return function AdvancedParamsSection() {
        const [expanded, setExpanded] = useState(getSetting('adv-expanded', false));
        const [maxTokensEnabled, setMaxTokensEnabled] = useState(getSetting('adv-maxTokens-enabled', true));
        const [maxTokensValue, setMaxTokensValue] = useState(getSetting('adv-maxTokens-value', 16000));
        const [temperatureEnabled, setTemperatureEnabled] = useState(getSetting('adv-temperature-enabled', true));
        const [temperatureValue, setTemperatureValue] = useState(getSetting('adv-temperature-value', 0.3));

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
                React.createElement('div', { className: 'ai-addon-advanced-row' },
                    React.createElement('label', { className: 'ai-addon-advanced-check' },
                        React.createElement('input', { type: 'checkbox', checked: maxTokensEnabled, onChange: (e) => { setMaxTokensEnabled(e.target.checked); setSetting('adv-maxTokens-enabled', e.target.checked); } }),
                        React.createElement('span', null, aiText('maxTokens', 'Max Tokens'))
                    ),
                    React.createElement('input', { type: 'number', value: maxTokensValue, disabled: !maxTokensEnabled, 'aria-label': aiText('maxTokens', 'Max Tokens'), onChange: (e) => { const v = parseInt(e.target.value) || 16000; setMaxTokensValue(v); setSetting('adv-maxTokens-value', v); } })
                ),
                React.createElement('div', { className: 'ai-addon-advanced-row' },
                    React.createElement('label', { className: 'ai-addon-advanced-check' },
                        React.createElement('input', { type: 'checkbox', checked: temperatureEnabled, onChange: (e) => { setTemperatureEnabled(e.target.checked); setSetting('adv-temperature-enabled', e.target.checked); } }),
                        React.createElement('span', null, aiText('temperature', 'Temperature'))
                    ),
                    React.createElement('input', { type: 'number', value: temperatureValue, disabled: !temperatureEnabled, 'aria-label': aiText('temperature', 'Temperature'), step: '0.1', min: '0', max: '2', onChange: (e) => { const v = parseFloat(e.target.value) || 0.3; setTemperatureValue(v); setSetting('adv-temperature-value', v); } })
                ),
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
