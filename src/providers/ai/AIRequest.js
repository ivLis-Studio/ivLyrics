/**
 * Shared bounded fetch for AI providers.
 * The timeout signal intentionally remains attached to the response body so a
 * stalled streaming reader is aborted as well as a stalled connection.
 *
 * Hosted NVIDIA NIM rejects browser CORS requests. Network failures for that
 * host retry through Spicetify's configured CORS proxy, preserving the native
 * Response and SSE stream. Other hosts retain the Cosmos fallback, which
 * returns a buffered response because Cosmos cannot stream incrementally.
 */
import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { installAiRequest } from "./builtinAiProviderServices.mjs";
import { runWithAiRequestSignal, throwIfAiRequestAborted } from "./aiRequestCancellation.mjs";

export function createAIRequest({ host: window, getSpicetify }) {

    const DEFAULT_TIMEOUT_MS = 90_000;

    function timeoutSignal(timeoutMs) {
        const boundedTimeout = Number.isFinite(Number(timeoutMs))
            ? Math.max(1_000, Number(timeoutMs))
            : DEFAULT_TIMEOUT_MS;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            return AbortSignal.timeout(boundedTimeout);
        }
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('AI request timed out', 'TimeoutError')), boundedTimeout);
        return controller.signal;
    }

    function combineSignals(first, second) {
        if (!first || !second) return first || second;
        const signals = [first, second];
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
            return AbortSignal.any(signals);
        }
        const controller = new AbortController();
        const aborted = signals.find(signal => signal.aborted);
        if (aborted) {
            controller.abort(aborted.reason);
            return controller.signal;
        }
        const abort = event => {
            for (const signal of signals) signal.removeEventListener('abort', abort);
            controller.abort(event?.target?.reason);
        };
        for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
        return controller.signal;
    }

    function isNetworkTypeError(error) {
        if (!error) return false;
        if (error instanceof TypeError) return true;
        const message = String(error?.message || '');
        return error?.name === 'TypeError'
            || /failed to fetch|networkerror|network request failed|load failed/i.test(message);
    }

    function parseJsonBody(body) {
        if (body === null || body === undefined) return undefined;
        if (typeof body === 'string') {
            try {
                return JSON.parse(body);
            } catch {
                return body;
            }
        }
        return body;
    }

    function isHostedNimUrl(input) {
        try {
            const url = new URL(typeof input === 'string' ? input : input?.url);
            return url.protocol === 'https:' && url.hostname === 'integrate.api.nvidia.com';
        } catch { return false; }
    }

    function getSpicetifyProxyUrl(input) {
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        let template = 'https://cors-proxy.spicetify.app/{url}';
        try { template = window.localStorage?.getItem('spicetify:corsProxyTemplate') || template; }
        catch { /* Use Spicetify's default when local storage is unavailable. */ }
        if (!template.includes('{url}')) throw new Error('Invalid Spicetify CORS proxy template');
        const proxyUrl = template.replace('{url}', url);
        if (!/^https?:$/.test(new URL(proxyUrl).protocol)) {
            throw new Error('Spicetify CORS proxy must use HTTP or HTTPS');
        }
        return proxyUrl;
    }

    async function withTimeout(run, timeoutMs, signal) {
        const boundedTimeout = Number.isFinite(Number(timeoutMs))
            ? Math.max(1_000, Number(timeoutMs))
            : DEFAULT_TIMEOUT_MS;
        let timer = null;
        try {
            return await runWithAiRequestSignal(signal, () => Promise.race([
                run(),
                new Promise((_, reject) => {
                    timer = setTimeout(
                        () => reject(new DOMException('AI request timed out', 'TimeoutError')),
                        boundedTimeout
                    );
                }),
            ]));
        } finally {
            if (timer !== null) clearTimeout(timer);
        }
    }

    async function cosmosFallback(input, init, timeoutMs) {
        const spicetify = getSpicetify();
        const cosmos = spicetify?.CosmosAsync;
        if (!cosmos || typeof cosmos.request !== 'function') {
            throw new Error('[ivLyricsFetch] No CosmosAsync available for CORS fallback');
        }
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        let origin;
        try {
            const target = new URL(url);
            if (target.protocol === 'https:' || target.protocol === 'http:') origin = target.origin;
        } catch { /* The fallback needs an absolute HTTP destination. */ }
        if (!origin) {
            throw new Error('[ivLyricsFetch] Cosmos fallback only supports http(s) URLs');
        }
        const method = String(init?.method || 'GET').toUpperCase();
        const headers = { ...(init?.headers || {}) };
        const parsedBody = parseJsonBody(init?.body);
        // Cosmos resolves once with the full body, so streaming responses are
        // downgraded to buffered JSON; providers already handle that shape.
        const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody) && parsedBody.stream === true
            ? { ...parsedBody, stream: false }
            : parsedBody;
        writeRuntimeDebug(window, '[ivLyricsFetch] Native fetch blocked (CORS/network), retrying via CosmosAsync:', origin);
        const result = await withTimeout(() => cosmos.request(method, url, body, headers), timeoutMs, init?.signal);
        const status = Number(result?.status);
        const safeStatus = Number.isFinite(status) && status >= 100 && status < 600 ? status : 200;
        const payload = typeof result?.body === 'string'
            ? result.body
            : JSON.stringify(result?.body ?? null);
        // Some APIs select streaming by the URL instead of a body flag.
        // Cosmos buffers those events, so keep their framing recognizable.
        const contentType = /^\s*(?:(?:data|event|id|retry):|:)/.test(payload)
            ? 'text/event-stream'
            : 'application/json';
        return new Response(payload, {
            status: safeStatus,
            headers: { 'Content-Type': contentType }
        });
    }

    const request = async (input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
        throwIfAiRequestAborted(init?.signal);
        const signal = combineSignals(init?.signal, timeoutSignal(timeoutMs));
        try {
            return await window.fetch(input, { ...init, signal });
        } catch (error) {
            throwIfAiRequestAborted(init?.signal);
            // HTTP error statuses resolve (not reject), so a rejection here is
            // a network-level failure: CORS block, DNS, offline, etc. Aborts
            // and timeouts surface as AbortError/DOMException, not TypeError.
            if (!isNetworkTypeError(error) || signal?.aborted) throw error;
            if (isHostedNimUrl(input)) {
                try {
                    // Fetch the relay directly: CosmosAsync.request bypasses
                    // Spicetify's proxy wrapper, and its shorthand methods do
                    // not preserve the provider's Authorization header.
                    return await window.fetch(getSpicetifyProxyUrl(input), {
                        ...init, signal, credentials: 'omit'
                    });
                } catch (proxyError) {
                    if (signal?.aborted) throw proxyError;
                    const combined = new Error(
                        `${error?.message || error} [Spicetify CORS proxy failed: ${proxyError?.message || proxyError}]`
                    );
                    combined.cause = proxyError;
                    throw combined;
                }
            }
            try {
                return await cosmosFallback(input, init, timeoutMs);
            } catch (fallbackError) {
                throwIfAiRequestAborted(init?.signal);
                const fallbackDetail = String(fallbackError?.message || fallbackError || 'unknown error');
                writeRuntimeDebug(window, '[ivLyricsFetch] Cosmos fallback failed:', fallbackDetail);
                // Keep the original message recognizable, but record that the
                // fallback ran and why it failed — otherwise a failed fallback
                // is indistinguishable from "fallback never attempted".
                const combined = new Error(
                    `${error?.message || error} [direct request blocked; Cosmos fallback failed: ${fallbackDetail}]`
                );
                combined.cause = error;
                try {
                    combined.name = error?.name || combined.name;
                    combined.stack = error?.stack || combined.stack;
                } catch {
                    // Non-critical metadata; the message above carries the facts.
                }
                throw combined;
            }
        }
    };
    request.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
    return request;
}

export default function initializeAIRequest() {
    const request = createAIRequest({ host: window, getSpicetify: () => window.Spicetify });
    installAiRequest(window, request);
    window.ivLyricsFetch = request;
}
