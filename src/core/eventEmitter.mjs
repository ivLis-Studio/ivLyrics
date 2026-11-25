export class EventEmitter {
    #listeners = new Map();
    #onceListeners = new Map();
    #onError;

    constructor(onError) {
        this.#onError = onError;
    }

    #subscribe(listeners, event, listener) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(listener);
    }

    on(event, listener) {
        this.#subscribe(this.#listeners, event, listener);
        return () => this.off(event, listener);
    }

    once(event, listener) {
        this.#subscribe(this.#onceListeners, event, listener);
    }

    off(event, listener) {
        this.#listeners.get(event)?.delete(listener);
        this.#onceListeners.get(event)?.delete(listener);
    }

    #notify(listeners, event, once, args) {
        if (!listeners) return;
        for (const listener of listeners) {
            try {
                listener(...args);
            } catch (error) {
                this.#onError(event, once, error);
            }
        }
    }

    emit(event, ...args) {
        this.#notify(this.#listeners.get(event), event, false, args);
        const once = this.#onceListeners.get(event);
        this.#onceListeners.delete(event);
        this.#notify(once, event, true, args);
    }
}
