// Spicetify previously loaded each extension in a separate script. A failure
// in one initializer should still leave the rest of the extensions running.
export function runExtension(name, initialize) {
    try {
        initialize.call(globalThis);
    } catch (error) {
        console.error("[ivLyrics] Failed to initialize " + name, error);
        globalThis.reportError?.(error);
    }
}
