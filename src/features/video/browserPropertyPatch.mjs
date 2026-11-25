export function replaceBrowserProperty(target, name, registerRestore, makeDescriptor) {
    if (!target) return false;
    const previous = Object.getOwnPropertyDescriptor(target, name);
    const replacement = makeDescriptor(previous);
    if (!replacement || !Reflect.defineProperty(target, name, replacement)) return false;

    registerRestore(replacement, () => {
        const current = Object.getOwnPropertyDescriptor(target, name);
        // Restore the original own descriptor, including whether it existed.
        // A later owner may have replaced the value, setter, or its flags.
        if (!current || !Object.entries(replacement).every(([key, value]) => current[key] === value)) return;
        if (previous) Reflect.defineProperty(target, name, previous);
        else Reflect.deleteProperty(target, name);
    });
    return true;
}

export function wrapBrowserMethod(target, name, registerRestore, makeWrapper) {
    return replaceBrowserProperty(target, name, registerRestore, previous => {
        if (previous && !Object.hasOwn(previous, "value")) return null;
        const original = previous ? previous.value : target[name];
        if (typeof original !== "function") return null;
        return {
            ...(previous || { configurable: true, writable: true, enumerable: true }),
            value: makeWrapper(original),
        };
    });
}
