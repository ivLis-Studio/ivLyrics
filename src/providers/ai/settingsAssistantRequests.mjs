/**
 * Settings assistant capability: sends a prebuilt {systemPrompt, userPrompt}
 * to the enabled AI providers and expects one JSON object back. The prompt is
 * built by the settings assistant in src/features/settings; this module only
 * routes it through provider fallback and validates the reply shape.
 */
import { throwIfAiRequestSuperseded } from "./aiRequestCancellation.mjs";

const FENCED_JSON = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function parseSettingsAssistantResult(result, providerId) {
    let value = result;
    if (typeof value === 'string') {
        const text = value.replace(FENCED_JSON, '$1').trim();
        try {
            value = JSON.parse(text);
        } catch {
            throw new Error('[AIAddonManager] Provider ' + providerId + ' returned invalid settings assistant JSON');
        }
    }
    if (!isPlainObject(value)) {
        throw new Error('[AIAddonManager] Provider ' + providerId + ' returned a settings assistant reply that is not a JSON object');
    }
    return value;
}

export async function requestSettingsAssistant(manager, params, { debug }) {
    const signal = params?.signal;
    throwIfAiRequestSuperseded(signal);
    const prompt = params?.prompt;
    if (!prompt || typeof prompt !== 'object') {
        throw new Error('No settings assistant prompt provided');
    }
    if (typeof prompt.userPrompt !== 'string' || !prompt.userPrompt.trim()) {
        throw new Error('Settings assistant prompt is missing userPrompt');
    }
    const providers = manager.getEnabledProvidersFor('settingsAssistant');
    if (providers.length === 0) {
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }
    // Only the size is logged; the prompt carries the user's settings and question.
    manager.emit('ai:request:start', {
        type: 'settingsAssistant',
        providers: providers.map((provider) => provider.id),
        params: { promptLength: String(prompt.systemPrompt || '').length + prompt.userPrompt.length }
    });
    throwIfAiRequestSuperseded(signal);
    return manager._runProviderFallback(providers, 'generateSettingsAssistant', 'settingsAssistant', async (addon) => {
        debug('[AIAddonManager] Trying settings assistant provider: ' + addon.id);
        const result = await manager._callProvider(addon, 'generateSettingsAssistant', { ...params, settingsAssistantPrompt: prompt });
        throwIfAiRequestSuperseded(signal);
        const reply = parseSettingsAssistantResult(result, addon.id);
        manager.emit('ai:request:success', { type: 'settingsAssistant', provider: addon.id });
        return reply;
    }, null, signal);
}
