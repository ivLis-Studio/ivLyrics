export class LrclibPlaybackUnavailableError extends Error {}

export function createLrclibPlaybackTransport() {
    // Playback may try a pinned ID, metadata and several search variants. A
    // busy/unreachable host cannot answer any of them: stop that host's stage,
    // and share its short backoff across subsequent tracks/metadata matches.
    // The editor and submission transport above intentionally stay independent.
    const playbackHostBackoff = new Map();
    return function createPlaybackApiRequest(baseUrl, transport, isCustom, shareBackoff = true) {
        let failure = null;
        return async (...args) => {
            if (failure) throw failure;
            const backoff = shareBackoff && playbackHostBackoff.get(baseUrl);
            if (backoff && backoff.until > Date.now()) {
                failure = new LrclibPlaybackUnavailableError(backoff.message);
                throw failure;
            }
            if (shareBackoff) playbackHostBackoff.delete(baseUrl);

            let response;
            try {
                response = await transport(...args);
            } catch (error) {
                if (error?.name === 'AbortError' && args[1]?.signal?.aborted) throw error;
                response = null;
            }
            const status = Number(response?.status || 0);
            // Custom endpoints can implement only part of the API. Keep their
            // existing bounded lookup/search fallback on unsupported reads.
            if (!response && isCustom) return response;
            if (response && status !== 408 && status !== 429 && status < 500) return response;

            const message = status ? `LRCLIB temporarily unavailable (${status})` : 'LRCLIB network request failed';
            const retryAfter = response?.headers?.get?.('Retry-After')?.trim();
            let delay = 5000;
            if (retryAfter) {
                const seconds = Number(retryAfter);
                const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
                if (Number.isFinite(milliseconds)) delay = Math.min(300000, Math.max(1000, milliseconds));
            }
            if (shareBackoff) playbackHostBackoff.set(baseUrl, { until: Date.now() + delay, message });
            // No caller will consume an overload response's body.
            try { response?.body?.cancel?.()?.catch?.(() => {}); } catch { /* Already consumed. */ }
            failure = new LrclibPlaybackUnavailableError(message);
            throw failure;
        };
    };
}
