// Localized text for a provider's settings and messages. Keys are relative
// to the provider namespace (settings.aiProviders. or settings.lyricsProviders.);
// {name} placeholders of the English fallback are filled from params.
export function createProviderText(readI18n, prefix) {
    return function providerText(key, fallback, params) {
        const path = `${prefix}${key}`;
        const value = readI18n()?.t?.(path, params);
        if (value && value !== path) return value;
        return params ? String(fallback).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match) : fallback;
    };
}
