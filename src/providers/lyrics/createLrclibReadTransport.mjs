export function createLrclibReadTransport({ request, readProxyTemplate, readClientVersion, debug }) {
    function getLrclibReadUrl(input) {
        const target = new URL(input);
        const isSearch = target.pathname === '/api/search';
        const isSignatureLookup = target.pathname === '/api/get';
        // Validate before either request: this export only supports public reads.
        if (target.origin !== 'https://lrclib.net' || target.username || target.password
            || target.hash || (!isSearch && !isSignatureLookup && !/^\/api\/get\/\d+$/.test(target.pathname))) {
            throw new Error('Invalid public LRCLIB URL');
        }
        const allowedParameters = isSearch
            ? ['q', 'track_name', 'artist_name', 'album_name']
            : (isSignatureLookup ? ['track_name', 'artist_name', 'album_name', 'duration'] : []);
        if (Array.from(target.searchParams.keys()).some(key => !allowedParameters.includes(key))) {
            throw new Error('Invalid public LRCLIB query parameter');
        }
        return target;
    }

    function getLrclibCorsUrl(target) {
        let template = 'https://cors-proxy.spicetify.app/{url}';
        try {
            template = readProxyTemplate() || template;
        } catch {
            // Match the other providers when Spicetify's storage is unavailable.
        }
        if (typeof template !== 'string' || template.split('{url}').length !== 2) {
            throw new Error('Invalid Spicetify CORS proxy template');
        }
        const proxyUrl = new URL(template.replace('{url}', target.href));
        if (!/^https?:$/.test(proxyUrl.protocol) || proxyUrl.username || proxyUrl.password
            || proxyUrl.origin === target.origin) {
            throw new Error('Invalid Spicetify CORS proxy URL');
        }
        return proxyUrl.href;
    }

    /**
     * Public LRCLIB GET with one shared timeout and at most one CORS-proxy retry.
     * Only GET without a body is supported; invalid inputs/failures resolve null.
     * Callers keep HTTP status/JSON handling. Timeout is capped at 35 seconds.
     */
    async function fetchWithTimeout(url, options = {}, timeoutMs = 35000) {
        let target;
        try {
            target = getLrclibReadUrl(url);
            if ((options.method !== undefined && (typeof options.method !== 'string'
                || options.method.toUpperCase() !== 'GET')) || options.body != null) {
                throw new Error('LRCLIB transport only supports GET without a body');
            }
        } catch (error) {
            debug(`[LR-DEBUG] Invalid LRCLIB request: ${error?.message || error}`);
            return null;
        }
        const callerSignal = options.signal;
        if (callerSignal?.aborted) return null;

        const controller = new AbortController();
        const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
        const boundedTimeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, 35000)) : 35000;
        const id = setTimeout(() => controller.abort(), boundedTimeout);
        // LRCLIB requires client identification. X-User-Agent triggers preflight,
        // so keep that public header and relay network/CORS failures below.
        // Never forward Authorization, cookies, or other caller headers.
        const requestOptions = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'x-user-agent': `spicetify v${readClientVersion() || 'unknown'}`
            },
            signal,
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        };

        try {
            try {
                return await request(target.href, requestOptions);
            } catch (error) {
                const isNetworkError = error?.name === 'TypeError' || error?.name === 'NetworkError'
                    || /failed to fetch|network request failed|load failed/i.test(error?.message || '');
                if (signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError'
                    || !isNetworkError) {
                    return null;
                }
            }

            const proxyUrl = getLrclibCorsUrl(target);
            if (signal.aborted) return null;
            debug('[LR-DEBUG] Direct network/CORS failure, retrying through Spicetify CORS proxy');
            return await request(proxyUrl, requestOptions);
        } catch (error) {
            debug(`[LR-DEBUG] LRCLIB CORS retry failed: ${error?.message || error}`);
            return null;
        } finally {
            clearTimeout(id);
        }
    }

    return Object.freeze({ fetch: fetchWithTimeout });
}
