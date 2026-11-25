export function initializeRuntimeDebug(host, output = console) {
    if (typeof host.__IVLYRICS_DEBUG__ !== "boolean") host.__IVLYRICS_DEBUG__ = false;
    if (typeof host.__ivLyricsDebugLog !== "function") {
        host.__ivLyricsDebugLog = (...args) => {
            if (host.__IVLYRICS_DEBUG__) output.log(...args);
        };
    }
}

export function writeRuntimeDebug(host, ...args) {
    const logger = host.__ivLyricsDebugLog;
    if (typeof logger !== "function") return false;
    try {
        Reflect.apply(logger, host, args);
    } catch {
        // A diagnostics hook must not interrupt playback or a provider request.
    }
    return true;
}

export function createRuntimeDebugLogger(host) {
    return writeRuntimeDebug.bind(null, host);
}
