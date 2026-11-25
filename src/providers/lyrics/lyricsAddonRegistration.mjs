import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { runExtension } from "../../spicetify/run-extension.mjs";

const managersByHost = new WeakMap();
const pendingByHost = new WeakMap();

export function readLyricsAddonManager(host) {
    return managersByHost.get(host) ?? getRuntimeService("LyricsAddonManager", host);
}

export function registerLyricsAddon(addon, host) {
    const manager = readLyricsAddonManager(host);
    if (manager) {
        manager.register(addon);
        return;
    }
    if (!pendingByHost.has(host)) pendingByHost.set(host, []);
    pendingByHost.get(host).push(addon);
}

export function installLyricsAddonManager(host, manager, schedule) {
    managersByHost.set(host, manager);
    const pending = pendingByHost.get(host);
    if (!pending) return;
    pendingByHost.delete(host);

    // Built-in providers previously registered on their first 100 ms retry.
    schedule(() => {
        for (const addon of pending) {
            runExtension(addon.id, () => readLyricsAddonManager(host).register(addon));
        }
    }, 100);
}
