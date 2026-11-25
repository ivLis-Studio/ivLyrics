import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { readTrackIdentityService, trackIdentity } from "../../core/trackIdentity.mjs";
import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { runExtension } from "../../spicetify/run-extension.mjs";

const servicesByHost = new WeakMap();

function servicesFor(host) {
    if (!servicesByHost.has(host)) {
        servicesByHost.set(host, { manager: null, request: null, pending: [] });
    }
    return servicesByHost.get(host);
}

export function installAiRequest(host, request) {
    servicesFor(host).request = request;
}

export function installAiAddonManager(host, manager, schedule) {
    const services = servicesFor(host);
    services.manager = manager;
    if (!services.pending.length) return;

    // Built-in scripts historically retried registration after the manager and
    // its storage had a chance to initialize. Keep that delay and startup order.
    const pending = services.pending.splice(0);
    schedule(() => {
        for (const { addon, prepare } of pending) {
            runExtension(addon.id, () => {
                prepare?.();
                services.manager.register(addon);
            });
        }
    }, 100);
}

export function createBuiltinAiProviderServices(host) {
    const services = servicesFor(host);
    return {
        host,
        getManager: () => services.manager,
        getAiRequest: () => services.request,
        getI18n: () => getRuntimeService("I18n", host),
        getConfig: () => getRuntimeService("CONFIG", host),
        getSpicetify: () => host.Spicetify,
        getTrackIdentity: () => [
            readTrackIdentityService(host),
            getRuntimeService("LyricsService", host),
            getRuntimeService("Utils", host),
            trackIdentity,
        ].find(candidate => typeof candidate?.getTranslationCacheId === "function"),
        debug: createRuntimeDebugLogger(host),
        registerAiAddon(addon, prepare) {
            if (!services.manager) {
                services.pending.push({ addon, prepare });
                return;
            }
            prepare?.();
            services.manager.register(addon);
        },
    };
}
