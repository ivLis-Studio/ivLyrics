import { EventEmitter } from "../core/eventEmitter.mjs";

export class AddonRegistry extends EventEmitter {
    #addons = new Map();
    #marketplaceAddons = new Set();
    #pendingInitialization = null;
    #name;
    #type;
    #debug;
    #readAddonDebug;

    constructor({ name, type, debug, readAddonDebug }) {
        super((event, once, error) => {
            const kind = once ? "once listener" : "listener";
            console.error(`[${name}] Error in ${kind} for "${event}":`, error);
        });
        this.#name = name;
        this.#type = type;
        this.#debug = debug;
        this.#readAddonDebug = readAddonDebug;
        this._initPromise = null;
    }

    emit(event, ...args) {
        const logger = this.#readAddonDebug();
        if (logger?.isEnabled()) logger.log("events", `${this.#name}.emit: ${event}`, args[0]);
        super.emit(event, ...args);
    }

    async #initializeAddon(id, addon, late = false) {
        try {
            if (typeof addon.init === "function") await addon.init();
            if (!late) this.#debug(`[${this.#name}] Addon "${id}" initialized`);
        } catch (error) {
            const operation = late ? "late-init" : "initialize";
            console.error(`[${this.#name}] Failed to ${operation} addon "${id}":`, error);
        }
    }

    async init() {
        if (this._initPromise) return this._initPromise;
        const pending = new Map(this.#addons);
        this.#pendingInitialization = pending;
        this._initPromise = Promise.resolve().then(async () => {
            this.#debug(`[${this.#name}] Initializing...`);
            // A registration can replace an already-visited ID while init awaits.
            // Queue the current object for each ID independently of registry order.
            while (pending.size) {
                const [id, addon] = pending.entries().next().value;
                pending.delete(id);
                await this.#initializeAddon(id, addon);
            }
            this.#pendingInitialization = null;
            this.#debug(`[${this.#name}] Initialization complete`);
        });
        return this._initPromise;
    }

    _registerAddon(addon, supportsDescription) {
        const { id, name } = addon;
        const previous = this.#addons.get(id);
        this.#addons.set(id, addon);
        this.#debug(`[${this.#name}] Registered addon: ${id} (${name})`);
        this.#debug(`[${this.#name}] Supports: ${supportsDescription}`);

        if (this.#pendingInitialization) {
            if (previous !== addon) this.#pendingInitialization.set(id, addon);
        } else if (this._initPromise && typeof addon.init === "function") {
            void this.#initializeAddon(id, addon, true);
        }

        if (this.#addons.get(id) !== addon) return false;
        this.emit("addon:registered", { id, name, type: this.#type });
        return true;
    }

    unregister(id) {
        const addon = this.#addons.get(id);
        if (!addon) return false;
        this.#addons.delete(id);
        this.#pendingInitialization?.delete(id);
        this.#marketplaceAddons.delete(id);
        this.#debug(`[${this.#name}] Unregistered addon: ${id}`);
        this.emit("addon:unregistered", { id, name: addon.name });
        return true;
    }

    markAsMarketplaceAddon(id) {
        this.#marketplaceAddons.add(id);
    }

    isMarketplaceAddon(id) {
        return this.#marketplaceAddons.has(id);
    }

    getAddon(id) {
        return this.#addons.get(id) || null;
    }

    getAddons() {
        return [...this.#addons.values()];
    }

    getAddonIds() {
        return [...this.#addons.keys()];
    }

    getEnabledProviders() {
        const order = this.getProviderOrder();
        return order.filter(id => this.isProviderEnabled(id) && this.#addons.has(id))
            .map(id => this.#addons.get(id));
    }
}
