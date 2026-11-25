export const FULLSCREEN_SHORTCUT = "fullscreen-key";
export const TV_SHORTCUT = "toggle-tv-mode-key";

export const FULLSCREEN_SHORTCUT_DEFAULTS = Object.freeze({
    [FULLSCREEN_SHORTCUT]: "f12",
    [TV_SHORTCUT]: "t",
});

export function resolveFullscreenShortcut(name, value) {
    return typeof value === "string" ? value.trim().toLowerCase() : FULLSCREEN_SHORTCUT_DEFAULTS[name];
}

export function createFullscreenShortcutPreferences({ getStorage, readSetting, configure }) {
    const names = Object.keys(FULLSCREEN_SHORTCUT_DEFAULTS);
    const shortcuts = Object.fromEntries(names.map(name => [name, ""]));
    let observed = {};

    function sync(storage = getStorage()) {
        const recovery = storage?.ready;
        if (storage !== observed.storage || recovery !== observed.recovery) {
            // A failed read can preserve a binding from the same source only.
            for (const name of names) shortcuts[name] = "";
            const source = { storage, recovery, pending: typeof recovery?.then === "function" };
            observed = source;
            if (source.pending) {
                const settle = () => {
                    if (observed !== source || getStorage() !== storage || storage.ready !== recovery) return;
                    source.pending = false;
                    sync(storage);
                };
                recovery.then(settle, settle);
            }
        }

        if (storage) {
            for (const name of names) {
                try {
                    const value = readSetting(name);
                    // A missing value may become an explicit binding or an
                    // empty string when settings recovery finishes.
                    shortcuts[name] = observed.pending && value == null ? "" : resolveFullscreenShortcut(name, value);
                } catch {
                    // Keep the last successful read, including a cleared binding.
                }
            }
        }
        configure(shortcuts);
    }

    return {
        sync,
        refreshIfChanged() {
            const storage = getStorage();
            if (storage !== observed.storage || storage?.ready !== observed.recovery) sync(storage);
        },
    };
}
