import { watchVideoReadinessDeadline } from "./videoReadinessDeadline.mjs";

const API_URL = "https://www.youtube.com/iframe_api";
const SCRIPT_ID = "ivlyrics-youtube-iframe-api";
const POLL_INTERVAL_MS = 100;
const pendingLoads = new WeakMap();
const ownedScripts = new WeakSet();
const failedScripts = new WeakSet();

function readApi(host) {
    return typeof host.YT?.Player === "function" ? host.YT : null;
}

function retireScript(script) {
    if (failedScripts.has(script)) return;
    failedScripts.add(script);
    if (ownedScripts.has(script)) script.remove();
}

export function preloadYouTubeIframeApi(host, document) {
    if (readApi(host)) return null;
    const existing = Array.from(document.querySelectorAll(`script#${SCRIPT_ID}, script[src="${API_URL}"]`))
        .find(script => !failedScripts.has(script));
    if (existing) return existing;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = API_URL;
    script.addEventListener("error", () => retireScript(script), { once: true });
    ownedScripts.add(script);
    (document.head || document.body || document.documentElement).appendChild(script);
    return script;
}

export function watchYouTubeIframeApi({
    host, document, onReady, onError, schedule = setTimeout, cancel = clearTimeout,
}) {
    const subscriber = {
        finish(api, error) {
            if (error) onError?.(error);
            else {
                try { onReady(api); }
                catch (cause) { onError?.(cause); }
            }
        },
    };
    const readyApi = readApi(host);
    if (readyApi) {
        subscriber.finish(readyApi);
        return () => {};
    }

    let load = pendingLoads.get(host);
    if (!load) {
        const script = preloadYouTubeIframeApi(host, document);
        const subscribers = new Set([subscriber]);
        let poll = null;
        const stopPolling = () => {
            if (poll !== null) cancel(poll);
            poll = null;
        };
        const close = () => {
            if (pendingLoads.get(host) !== load) return;
            pendingLoads.delete(host);
            stopPolling();
            stopReadinessDeadline();
            document.removeEventListener?.("visibilitychange", handleVisibility);
            script?.removeEventListener("error", onScriptError);
        };
        const finish = (api, error) => {
            if (pendingLoads.get(host) !== load) return;
            close();
            for (const current of subscribers) {
                subscribers.delete(current);
                current.finish(api, error);
            }
        };
        const onScriptError = () => {
            retireScript(script);
            finish(null, new Error("Could not load the YouTube iframe API."));
        };
        const inspect = () => {
            if (pendingLoads.get(host) !== load || document.hidden) return;
            const api = readApi(host);
            if (api) {
                finish(api);
                return;
            }
            const timerId = schedule(() => {
                if (poll !== timerId) return;
                poll = null;
                inspect();
            }, POLL_INTERVAL_MS);
            poll = timerId;
        };
        const handleVisibility = () => {
            if (document.hidden) stopPolling();
            else if (poll === null) inspect();
        };

        load = { subscribers, close };
        pendingLoads.set(host, load);
        script?.addEventListener("error", onScriptError);
        const stopReadinessDeadline = watchVideoReadinessDeadline({
            document, schedule, cancel,
            onTimeout() {
                const api = readApi(host);
                if (api) {
                    finish(api);
                    return;
                }
                if (script && ownedScripts.has(script)) retireScript(script);
                finish(null, new Error("YouTube iframe API readiness timed out."));
            },
        });
        document.addEventListener?.("visibilitychange", handleVisibility);
        inspect();
    } else {
        load.subscribers.add(subscriber);
    }
    return () => {
        load.subscribers.delete(subscriber);
        if (!load.subscribers.size) load.close();
    };
}
