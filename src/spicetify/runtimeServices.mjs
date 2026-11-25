// The route bundle and startup extension run in the same Spotify window.
// Share their service instances while preserving the API exposed to add-ons.
const serviceKey = Symbol.for("ivLyrics.runtimeServices");

export function getRuntimeService(name, host = globalThis) {
    return host[serviceKey]?.get(name) ?? host[name];
}

export function publishRuntimeService(name, service, host = globalThis) {
    const services = host[serviceKey] ??= new Map();
    services.set(name, service);
    host[name] = service;
    return service;
}

export function releaseRuntimeService(name, service, host = globalThis) {
    const services = host[serviceKey];
    if ((services?.get(name) ?? host[name]) !== service) return false;
    services?.delete(name);
    if (host[name] === service) delete host[name];
    return true;
}
