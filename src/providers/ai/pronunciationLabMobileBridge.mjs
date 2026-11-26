// Pronunciation Lab on mobile: the iOS, Android and LSPatch apps load this
// page in a hidden WebView and ask it for line pronunciation, so the apps
// write a lyric the same way the Spicetify provider does
// (Addon_AI_PronunciationLab.js). The page holds only the ivLyrics engine;
// the engine imports the newest pronunciation-lab release from jsDelivr when
// the first request arrives (pronunciationLabEngine.mjs explains why).
//
// The page is built by .github/scripts/build_pronunciation_lab_mobile.mjs.
//
// App to page:
//   ivLyricsPronunciationLab.convert(id, request)  request: { lines: string[],
//       sourceLang?: string, lang: string, notation?: "translation"|"latin"|"ipa",
//       stream?: boolean } as an object or a JSON string. A new request with
//       the id of a running one replaces it.
//   ivLyricsPronunciationLab.cancel(id)
//   ivLyricsPronunciationLab.supports(lang, notation) → boolean (no network)
//   ivLyricsPronunciationLab.version() → release in use, or null before loading
// Page to app (iOS: webkit.messageHandlers.ivLyricsPronunciationLab, objects;
// Android: ivLyricsPronunciationLabNative.postMessage, JSON strings):
//   { type: "ready" }
//   { type: "line", id, index, text }          only when request.stream
//   { type: "result", id, lines, version }     lines has the request's count
//   { type: "error", id, code, message }       code: PRONUNCIATION_LAB_*
import { createPronunciationLabEngine, PRONUNCIATION_LAB_ERRORS } from "./pronunciationLabEngine.mjs";

export const PRONUNCIATION_LAB_BRIDGE_ERRORS = Object.freeze({
    ...PRONUNCIATION_LAB_ERRORS,
    BAD_REQUEST: "PRONUNCIATION_LAB_BAD_REQUEST",
    FAILED: "PRONUNCIATION_LAB_FAILED",
});

const codedError = (code, message) => Object.assign(new Error("[Pronunciation Lab] " + message), { code });

/**
 * Installs window.ivLyricsPronunciationLab. Tests pass their own root,
 * engine and messenger; the page uses the defaults.
 */
export function installPronunciationLabBridge({
    root = globalThis,
    engine = createPronunciationLabEngine({ loadLibrary: (url) => import(url) }),
    post = (message) => {
        const ios = root.webkit?.messageHandlers?.ivLyricsPronunciationLab;
        if (ios) ios.postMessage(message);
        else root.ivLyricsPronunciationLabNative?.postMessage?.(JSON.stringify(message));
    },
} = {}) {
    if (root.ivLyricsPronunciationLab) return root.ivLyricsPronunciationLab;
    const send = (message) => {
        try {
            post(message);
        } catch { /* the app released the WebView */ }
    };
    const running = new Map();

    const readRequest = (request) => {
        let value = request;
        if (typeof value === "string") {
            try {
                value = JSON.parse(value);
            } catch {
                value = null;
            }
        }
        if (!value || !Array.isArray(value.lines)) {
            throw codedError(PRONUNCIATION_LAB_BRIDGE_ERRORS.BAD_REQUEST, "A request needs a lines array");
        }
        return value;
    };

    async function convert(id, request) {
        const key = String(id ?? "");
        running.get(key)?.abort(codedError(PRONUNCIATION_LAB_ERRORS.ABORTED, "Replaced by a newer request"));
        const controller = new AbortController();
        running.set(key, controller);
        const current = () => running.get(key) === controller;
        try {
            const { lines, sourceLang, lang, notation, stream } = readRequest(request);
            const result = await engine.convertLines({
                lines, sourceLang, lang, notation,
                signal: controller.signal,
                onLine: stream ? (index, text) => {
                    if (current()) send({ type: "line", id: key, index, text });
                } : undefined,
            });
            if (current()) send({ type: "result", id: key, lines: result, version: engine.version() });
        } catch (error) {
            if (!current()) return;
            const code = controller.signal.aborted
                ? PRONUNCIATION_LAB_ERRORS.ABORTED
                : (typeof error?.code === "string" && error.code.startsWith("PRONUNCIATION_LAB_")
                    ? error.code
                    : PRONUNCIATION_LAB_BRIDGE_ERRORS.FAILED);
            send({ type: "error", id: key, code, message: String(error?.message || error) });
        } finally {
            if (current()) running.delete(key);
        }
    }

    function cancel(id) {
        running.get(String(id ?? ""))?.abort(codedError(PRONUNCIATION_LAB_ERRORS.ABORTED, "Request cancelled"));
    }

    const bridge = Object.freeze({
        convert,
        cancel,
        supports: (lang, notation) => engine.supports(lang, notation),
        version: () => engine.version(),
    });
    root.ivLyricsPronunciationLab = bridge;
    send({ type: "ready" });
    return bridge;
}
