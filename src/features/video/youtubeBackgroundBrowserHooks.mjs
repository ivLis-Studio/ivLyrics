import { replaceBrowserProperty, wrapBrowserMethod } from "./browserPropertyPatch.mjs";

const blockedPatterns = [
    /doubleclick\.net/i,
    /googlesyndication\.com/i,
    /googleads\.g\.doubleclick\.net/i,
    /pagead(?!.*youtube\.com\/iframe)/i,
    /pagead2\.googlesyndication\.com/i,
    /tpc\.googlesyndication\.com/i,
    /pubads\.g\.doubleclick\.net/i,
    /securepubads\.g\.doubleclick\.net/i,
    /gvt\d+\.com\/ads/i,
    /manifest\.googlevideo\.com\/api\/manifest\/ads/i,
    /googlevideo\.com\/videoplayback.*[&?](ctier|oad|adformat)=/i,
    /googlevideo\.com\/initplayback.*[&?](ctier|oad|adformat)=/i,
    /youtube\.com\/pagead/i,
    /youtube\.com\/ptracking/i,
    /youtube\.com\/api\/stats\/(ads|qoe|watchtime|playback)/i,
    /youtubei\/v1\/log_event/i,
    /youtubei\/v1\/player.*adformat/i,
    /youtube\.com\/get_video_info.*adformat/i,
    /youtube\.com\/yva_/i,
    /yt\d?\.ggpht\.com\/ad/i,
    /ytimg\.com\/.*ad/i,
    /yt3\.ggpht\.com\/ytc\/.*ad/i,
    /s0\.2mdn\.net/i,
    /gstaticadssl\.googleapis\.com/i
];
const blockedUrlPattern = new RegExp(blockedPatterns.map((pattern) => pattern.source).join("|"), "i");

const normalizeUrlString = (candidate) => {
    if (!candidate) return "";
    if (typeof candidate === "string") return candidate;
    if (candidate?.url) return candidate.url;
    if (candidate?.href) return candidate.href;
    return String(candidate);
};

const matchesAdUrl = (candidate) => {
    if (!candidate) return false;
    try {
        const ref = normalizeUrlString(candidate);
        if (!ref) return false;
        if (typeof ref === "string") return blockedUrlPattern.test(ref);
        return blockedPatterns.some((pattern) => pattern.test(ref));
    } catch (err) {
        return false;
    }
};

export function installYouTubeBackgroundBrowserHooks({
    host, registerRestore, isActive, sanitizeIframe, sanitizeYoutubeSrc,
}) {
    const {
        Document, Event, Response, DOMException, navigator, XMLHttpRequest,
        HTMLScriptElement, HTMLLinkElement, HTMLImageElement, HTMLIFrameElement,
    } = host;
    const schedule = (callback) => host.setTimeout(callback, 0);
    const blockRequest = (label, url) => console.info(`[ivLyrics VBD] blocked ${label}: ${url}`);
    const wrap = (target, name, intercept) => wrapBrowserMethod(target, name, registerRestore, original =>
        function (...args) {
            return isActive() ? intercept.call(this, original, args) : original.apply(this, args);
        });

    wrap(host, "fetch", function (original, args) {
        const [resource] = args;
        const target = typeof resource === "string" ? resource : resource?.url;
        if (!matchesAdUrl(target)) return original.apply(this, args);
        blockRequest("fetch", target);
        return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
    });

    const xhrUrls = new WeakMap();
    wrap(XMLHttpRequest?.prototype, "open", function (original, args) {
        const result = original.apply(this, args);
        xhrUrls.set(this, args[1]);
        return result;
    });
    wrap(XMLHttpRequest?.prototype, "send", function (original, args) {
        const url = xhrUrls.get(this);
        if (!matchesAdUrl(url)) return original.apply(this, args);
        blockRequest("xhr", url);
        schedule(() => this.dispatchEvent(new Event("error")));
        return undefined;
    });

    wrap(navigator, "sendBeacon", function (original, args) {
        if (!matchesAdUrl(args[0])) return original.apply(navigator, args);
        blockRequest("beacon", args[0]);
        return true;
    });
    const serviceWorker = navigator?.serviceWorker;
    wrap(serviceWorker, "register", function (original, args) {
        if (!matchesAdUrl(args[0])) return original.apply(serviceWorker, args);
        blockRequest("serviceworker", args[0]);
        return Promise.reject(new DOMException("Blocked ad service worker", "SecurityError"));
    });
    wrap(host, "open", function (original, args) {
        if (!matchesAdUrl(args[0])) return original.apply(this, args);
        blockRequest("window.open", args[0]);
        return null;
    });

    const patchElement = (prototype, property, { label, blockedValue, attributes, transform }) => {
        replaceBrowserProperty(prototype, property, registerRestore, descriptor => {
            if (!descriptor?.set || !descriptor.configurable) return null;
            return {
                ...descriptor,
                set(value) {
                    if (isActive()) {
                        const sanitized = transform?.(value);
                        if (sanitized && sanitized !== value) return descriptor.set.call(this, sanitized);
                        if (matchesAdUrl(value)) {
                            blockRequest(label, value);
                            return descriptor.set.call(this, blockedValue);
                        }
                    }
                    return descriptor.set.call(this, value);
                },
            };
        });
        if (!attributes) return;
        wrap(prototype, "setAttribute", function (original, args) {
            const [name, value] = args;
            if (typeof name === "string" && attributes.includes(name.toLowerCase()) && matchesAdUrl(value)) {
                blockRequest(label, value);
                return undefined;
            }
            return original.apply(this, args);
        });
    };
    patchElement(HTMLScriptElement?.prototype, "src", { label: "script", blockedValue: "", attributes: ["src"] });
    patchElement(HTMLLinkElement?.prototype, "href", { label: "link", blockedValue: "about:blank", attributes: ["href", "data-href"] });
    patchElement(HTMLImageElement?.prototype, "src", { label: "image", blockedValue: "", attributes: ["src"] });
    patchElement(HTMLIFrameElement?.prototype, "src", { label: "iframe", blockedValue: "about:blank", transform: sanitizeYoutubeSrc });

    const pendingIframes = new Set();
    wrap(Document?.prototype, "createElement", function (original, args) {
        const element = original.apply(this, args);
        if (typeof args[0] === "string" && args[0].toUpperCase() === "IFRAME") {
            const timer = schedule(() => {
                pendingIframes.delete(timer);
                if (isActive()) sanitizeIframe(element);
            });
            pendingIframes.add(timer);
        }
        return element;
    });
    registerRestore(pendingIframes, () => {
        for (const timer of pendingIframes) host.clearTimeout(timer);
        pendingIframes.clear();
    });

    const wrapConstructor = (name, label, blocked) => wrapBrowserMethod(host, name, registerRestore, Original => {
        function Patched(...args) {
            const [url] = args;
            if (!isActive() || !matchesAdUrl(url)) return Reflect.construct(Original, args, new.target || Original);
            blockRequest(label, url);
            return blocked(Original, ...args);
        }
        Patched.prototype = Original.prototype;
        Object.setPrototypeOf(Patched, Original);
        return Patched;
    });

    wrapConstructor("WebSocket", "websocket", (Original, url) => {
        const listeners = new Map();
        const socket = {
            readyState: Original.CLOSED,
            bufferedAmount: 0,
            extensions: "",
            protocol: "",
            url: normalizeUrlString(url),
            binaryType: "blob",
            addEventListener(type, handler) {
                if (!handler) return;
                if (!listeners.has(type)) listeners.set(type, new Set());
                listeners.get(type).add(handler);
            },
            removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
            dispatchEvent(event) {
                for (const listener of listeners.get(event.type) || []) {
                    try { listener.call(this, event); } catch (error) { console.error(error); }
                }
                const handler = this[`on${event.type}`];
                if (typeof handler === "function") handler.call(this, event);
                return true;
            },
            close() {},
            send() {},
        };
        schedule(() => socket.dispatchEvent(new Event("error")));
        return socket;
    });

    wrapConstructor("EventSource", "eventsource", (Original, url, config) => {
        const dummy = {
            readyState: Original.CLOSED,
            url: normalizeUrlString(url),
            withCredentials: Boolean(config?.withCredentials),
            close() {},
            addEventListener() {},
            removeEventListener() {},
        };
        schedule(() => dummy.onerror?.(new Event("error")));
        return dummy;
    });

    const rejectBlockedWorker = () => {
        throw new DOMException("Blocked ad worker", "SecurityError");
    };
    wrapConstructor("Worker", "worker", rejectBlockedWorker);
    wrapConstructor("SharedWorker", "sharedworker", rejectBlockedWorker);
}
