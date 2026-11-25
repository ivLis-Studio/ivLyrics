import { bundleFixtureImports } from "./legacy-page-source.mjs";
import { readFileSync } from "node:fs";

export function openEventResponse(text) {
    const cancelled = Promise.withResolvers();
    const response = new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode(text)); },
        cancel() { cancelled.resolve(); },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    return { response, cancelled: cancelled.promise };
}

// The VM provider tests replace selected callbacks to inspect payloads and
// settings. Give those callbacks the same ports the startup bundle supplies.
export function readAiProviderFixture(file) {
    const source = readFileSync(new URL("../../src/providers/ai/" + file, import.meta.url), "utf8");
    const initializer = source.match(/^export default function (initialize\w+Addon)\(/m)?.[1];
    if (!initializer) throw new Error("Missing provider initializer in " + file);
    const importPattern = /^import\s*\{[^}]+\}\s*from\s*["'][^"']+["'];\n/gm;
    const body = source.replace(importPattern, "")
        .replace(/^export (?:default )?function /gm, "function ");
    const openAiFactory = file === "Addon_AI_NvidiaNim.js"
        ? "const createOpenAICompatibleAddon = (config) => window.createOpenAICompatibleAddon(config);"
        : "";
    const moduleImports = (source.match(importPattern) || [])
        .filter(statement => !statement.includes("builtinAiProviderServices.mjs"))
        .filter(statement => !openAiFactory || !statement.includes("Addon_AI_ChatGPT.js"))
        .join("").replaceAll('from "./', 'from "#ivlyrics/providers/ai/');
    return bundleFixtureImports(moduleImports + `(() => {
    const createBuiltinAiProviderServices = (host) => ({
        host,
        getManager: () => host.AIAddonManager,
        getAiRequest: () => host.ivLyricsFetch,
        getI18n: () => host.I18n,
        getConfig: () => host.CONFIG,
        getSpicetify: () => typeof Spicetify === "undefined" ? host.Spicetify : Spicetify,
        getTrackIdentity: () => [host.ivLyricsTrackIdentity, host.LyricsService, host.Utils]
            .find(candidate => typeof candidate?.getTranslationCacheId === "function"),
        debug: (...args) => host.__ivLyricsDebugLog?.(...args),
        registerAiAddon(addon, prepare) {
            prepare?.();
            host.AIAddonManager.register(addon);
        },
    });
    ${openAiFactory}
    ${body}
    ${initializer}(createBuiltinAiProviderServices(window));
})();
`, "fixtureAiProviderModules");
}
