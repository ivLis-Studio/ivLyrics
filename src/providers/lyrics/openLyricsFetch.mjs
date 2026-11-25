import { normalizeDurationMilliseconds, selectBestCandidate } from "./openLyricsTrackMatch.mjs";
import { parseOpenResponse, selectBestLyricsPayloadCandidate } from "./openLyricsRemoteResponse.mjs";

export function parseJinaReaderBody(text) {
    const raw = String(text || '');
    const marker = 'Markdown Content:';
    const markerIndex = raw.indexOf(marker);
    let content = markerIndex >= 0
        ? raw.slice(markerIndex + marker.length).trim()
        : raw.trim();
    content = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    try {
        return JSON.parse(content);
    } catch (_error) {
        return null;
    }
}

export function createOpenLyricsFetch({ endpoints, request, timeoutMs, parsePayload, readSyncDataService }) {
    const catalogSearchHost = new URL(endpoints.catalogSearch).hostname;

    async function fetchJson(url, parentSignal = null) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const abortFromParent = () => controller?.abort();
        if (parentSignal?.aborted) abortFromParent();
        else parentSignal?.addEventListener?.('abort', abortFromParent, { once: true });
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            try {
                const response = await request(url.toString(), {
                    headers: { Accept: 'application/json' },
                    credentials: 'omit',
                    signal: controller?.signal
                });
                const body = await response.json().catch(() => null);
                return { response, body, transport: 'direct' };
            } catch (error) {
                if (controller?.signal?.aborted || url.hostname !== catalogSearchHost) throw error;
                const response = await request(`${endpoints.readerPrefix}${url.toString()}`, {
                    headers: { Accept: 'text/plain' },
                    credentials: 'omit',
                    signal: controller?.signal
                });
                const body = parseJinaReaderBody(await response.text());
                return { response, body, transport: 'jina-reader' };
            }
        } finally {
            if (timer) clearTimeout(timer);
            parentSignal?.removeEventListener?.('abort', abortFromParent);
        }
    }

    function buildSearchTerm(info) {
        return [info?.title, info?.artist].map(value => String(value || '').trim()).filter(Boolean).join(' ');
    }

    async function fetchStructuredCandidate(info, signal = null) {
        const searchUrl = new URL(endpoints.providerSearch);
        searchUrl.searchParams.set('q', buildSearchTerm(info));
        const search = await fetchJson(searchUrl, signal);
        if (!search.response.ok || !Array.isArray(search.body)) return null;

        const candidates = search.body.map(item => ({
            id: String(item?.hash || ''),
            title: item?.title || '',
            artist: item?.artist || '',
            album: item?.album || '',
            durationSeconds: Number(item?.duration || 0),
            raw: item
        }));
        const match = selectBestCandidate(candidates, info);
        if (!match) return null;

        // The non-word response still includes normalized syllable timings and the original
        // source text. That reference is needed to restore omitted zero-duration whitespace.
        for (const wordTiming of [false, true]) {
            const lyricsUrl = new URL(endpoints.providerLyrics);
            lyricsUrl.searchParams.set('id', match.candidate.id);
            lyricsUrl.searchParams.set('word', String(wordTiming));
            lyricsUrl.searchParams.set('v', '2');
            const lyrics = await fetchJson(lyricsUrl, signal);
            if (lyrics.response.ok && Array.isArray(lyrics.body?.lyrics) && lyrics.body.lyrics.length > 0) {
                return {
                    source: 'structured_api',
                    payload: lyrics.body,
                    match
                };
            }
        }
        return null;
    }

    async function fetchCatalogCandidate(info, signal = null) {
        const searchUrl = new URL(endpoints.catalogSearch);
        searchUrl.searchParams.set('term', buildSearchTerm(info));
        searchUrl.searchParams.set('entity', 'song');
        searchUrl.searchParams.set('limit', '25');
        const search = await fetchJson(searchUrl, signal);
        if (!search.response.ok || !Array.isArray(search.body?.results)) return null;

        const candidates = search.body.results.map(item => ({
            id: String(item?.trackId || ''),
            title: item?.trackName || '',
            artist: item?.artistName || '',
            album: item?.collectionName || '',
            durationSeconds: Number(item?.trackTimeMillis || 0) / 1000,
            raw: item
        }));
        const match = selectBestCandidate(candidates, info);
        if (!match) return null;

        const lyricsUrl = new URL(endpoints.catalogLyrics);
        lyricsUrl.searchParams.set('id', match.candidate.id);
        lyricsUrl.searchParams.set('v', '2');
        const lyrics = await fetchJson(lyricsUrl, signal);
        if (!lyrics.response.ok || !Array.isArray(lyrics.body?.lyrics) || lyrics.body.lyrics.length === 0) {
            return null;
        }
        return {
            source: 'catalog_api',
            payload: lyrics.body,
            match
        };
    }

    async function fetchPrimaryLyrics(info, signal = null) {
        const durationMs = normalizeDurationMilliseconds(info);
        const attempts = await Promise.allSettled([
            fetchCatalogCandidate(info, signal),
            fetchStructuredCandidate(info, signal)
        ]);
        const candidates = attempts
            .filter(attempt => attempt.status === 'fulfilled' && attempt.value)
            .map(attempt => {
                const candidate = attempt.value;
                return { ...candidate, parsed: parsePayload(candidate.payload, durationMs, info) };
            });
        const best = selectBestLyricsPayloadCandidate(candidates);
        if (!best) {
            const timeout = attempts.find(attempt => (
                attempt.status === 'rejected'
                && (attempt.reason?.name === 'AbortError' || attempt.reason?.name === 'TimeoutError')
            ));
            if (timeout && attempts.every(attempt => attempt.status === 'rejected')) throw timeout.reason;
        }
        return best;
    }

    function normalizeIsrc(value) {
        const isrc = String(value || '').replace(/[\s-]/g, '').toUpperCase();
        return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) ? isrc : '';
    }

    async function resolveIsrc(info) {
        const service = readSyncDataService();
        const trackId = String(info?.uri || '').match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
        const known = normalizeIsrc(info?.isrc || info?.external_ids?.isrc || info?.externalIds?.isrc
            || service?.getTrackIsrc?.(trackId, info));
        return known || normalizeIsrc(await service?.resolveTrackIsrc?.(trackId, info));
    }

    async function fetchRemoteLyrics(source, isrcPromise, info, signal) {
        const isrc = await isrcPromise;
        if (!isrc || signal?.aborted) return null;
        const url = new URL(source === 'server-a' ? endpoints.aggregateOne : endpoints.aggregateTwo);
        url.searchParams.set('isrc', isrc);
        const { response, body } = await fetchJson(url, signal);
        if (!response.ok) return null;
        const returnedIsrc = normalizeIsrc(body?.metadata?.isrc || body?.track?.isrc);
        if (returnedIsrc && returnedIsrc !== isrc) return null;
        return parseOpenResponse(body, source, normalizeDurationMilliseconds(info));
    }

    async function fetchBestLyrics(info, parentSignal = null) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (parentSignal?.aborted) abort();
        else parentSignal?.addEventListener('abort', abort, { once: true });
        const isrc = resolveIsrc(info).catch(() => '');
        try {
            return await new Promise(resolve => {
                let remaining = 3, settled = false;
                const finish = candidate => {
                    remaining--;
                    if (settled) return;
                    if (candidate || remaining === 0 || controller.signal.aborted) {
                        settled = true;
                        resolve(candidate || null);
                        controller.abort();
                    }
                };
                // Resolve even when an ISRC lookup or a transport ignores cancellation.
                controller.signal.addEventListener('abort', () => finish(null), { once: true });
                const tasks = [
                    fetchPrimaryLyrics(info, controller.signal),
                    fetchRemoteLyrics('server-a', isrc, info, controller.signal),
                    fetchRemoteLyrics('server-b', isrc, info, controller.signal)
                ];
                tasks.forEach(task => task.then(finish, () => finish(null)));
                if (controller.signal.aborted) finish(null);
            });
        } finally {
            controller.abort();
            parentSignal?.removeEventListener('abort', abort);
        }
    }

    return { fetchBestLyrics };
}
