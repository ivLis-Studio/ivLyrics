import {
    createLrclibPlaybackTransport, LrclibPlaybackUnavailableError,
} from "./createLrclibPlaybackTransport.mjs";
import {
    LRCLIB_API_BASE, LRCLIB_DURATION_TOLERANCE_SEC, LRCLIB_ENGLISH_ACCEPT_LANGUAGE,
} from "./createLrclibSearch.mjs";
import { LRCLIB_PROVIDER_ID, getSyncDataLrclibId } from "./lrclibSourceMatching.mjs";

const LRCLIB_CUSTOM_API_TIMEOUT_MS = 5000;
const LRCLIB_CUSTOM_API_BUDGET_MS = 20000;

export function createLrclibPlayback({
    search,
    results,
    fetchWithTimeout,
    rawRequest,
    readLocalDatabase,
    getCustomApiEndpoint,
    resolveLrclibTrackContext,
    parseLrclibTrackMetadata,
    getTrackMetadataForAcceptLanguage,
    fetchLrclibCandidateById,
    decorateDirectCandidate,
    debug,
}) {
    const createPlaybackApiRequest = createLrclibPlaybackTransport();
    const { createLrclibSearchFlowRunner, selectLrclibCandidate } = search;
    const { applyCandidateLyricsToResult, buildPlaybackOnlyResult } = results;

    async function getLocalDatabaseLyrics(info, cacheVersion, signal) {
        const local = readLocalDatabase();
        if (info?.lrclibOfficialOnly || !local) return null;
        const state = local.getState?.();
        if (!(state?.available ?? (state?.phase === 'ready'))) return null;
        try {
            const candidate = await local.lookup({ uri: info.uri, title: info.title, artist: info.artist,
                album: info.album, duration: info.duration }, signal && { signal });
            if (signal?.aborted) return null;
            return buildPlaybackOnlyResult(candidate, info, cacheVersion, 'local');
        } catch {
            if (signal?.aborted) return null;
            debug('[LR-DEBUG] Local database unavailable; continuing online fallback');
            return null;
        }
    }

    // Private requests never use the exported official-only transport or a
    // third-party CORS proxy. Each URL is read once per host stage, including
    // its JSON body, with a five-second deadline and no caller credentials.
    function createCustomApiRequest(endpoint) {
        const requests = new Map(), cancellations = new Set();
        const deadline = Date.now() + LRCLIB_CUSTOM_API_BUDGET_MS;
        let closed = false;
        const request = (url) => {
            if (closed || !String(url).startsWith(`${endpoint}/`)) return Promise.resolve(null);
            const remaining = deadline - Date.now();
            if (remaining <= 0) return Promise.resolve(null);
            const suffix = String(url).slice(endpoint.length);
            if (!/^\/(?:get(?:\/[1-9]\d*)?|search)(?:\?|$)/.test(suffix)) return Promise.resolve(null);
            if (requests.has(url)) return requests.get(url);
            const controller = new AbortController();
            let timeoutId, cancel;
            const timeout = new Promise(resolve => {
                cancel = () => { clearTimeout(timeoutId); controller.abort(); resolve(null); };
                timeoutId = setTimeout(cancel, Math.min(LRCLIB_CUSTOM_API_TIMEOUT_MS, remaining));
            });
            cancellations.add(cancel);
            const load = async () => {
                const response = await rawRequest(url, {
                    method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit',
                    referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal
                });
                if (!response || closed || controller.signal.aborted) return null;
                if (!response.ok) return { ok: false, status: response.status, headers: response.headers };
                const data = await response.json();
                return closed || controller.signal.aborted ? null : { ok: true, status: response.status, json: async () => data };
            };
            const pending = Promise.race([load(), timeout]).catch(() => null).finally(() => {
                clearTimeout(timeoutId); cancellations.delete(cancel);
            });
            requests.set(url, pending);
            return pending;
        };
        return { request, close() { closed = true; for (const cancel of cancellations) cancel(); cancellations.clear(); } };
    }

    async function getCustomApiLyrics(info, cacheVersion, context, endpoint, signal) {
        const transport = createCustomApiRequest(endpoint);
        let timeoutId, onAbort;
        try {
            return await Promise.race([
                getPlaybackFromApi(info, { cacheVersion, context, baseUrl: endpoint,
                    request: transport.request, isCustom: true, fullLookup: true, signal }),
                new Promise(resolve => {
                    onAbort = () => resolve(null);
                    if (signal?.aborted) onAbort();
                    else signal?.addEventListener('abort', onAbort, { once: true });
                    timeoutId = setTimeout(onAbort, LRCLIB_CUSTOM_API_BUDGET_MS);
                })
            ]);
        } finally {
            signal?.removeEventListener('abort', onAbort);
            clearTimeout(timeoutId);
            transport.close();
        }
    }

    async function getLyricsForPlayback(info, cacheVersion, signal) {
        signal?.throwIfAborted();
        const localResult = await getLocalDatabaseLyrics(info, cacheVersion, signal);
        signal?.throwIfAborted();
        if (localResult) return localResult;
        // Resolve the pinned source BEFORE either network stage, and reuse
        // it for both. Never interleave official lyrics with mirror search.
        const context = await resolveLrclibTrackContext(info);
        signal?.throwIfAborted();
        const endpoint = info?.lrclibOfficialOnly ? '' : getCustomApiEndpoint();
        if (endpoint) {
            const customResult = await getCustomApiLyrics(info, cacheVersion, context, endpoint, signal);
            signal?.throwIfAborted();
            if (customResult && !customResult.error) return customResult;
            debug('[LR-DEBUG] Custom lookup/search exhausted; starting official LRCLIB stage');
        }
        return getPlaybackFromApi(info, { cacheVersion, context, fullLookup: !!endpoint, signal });
    }

    async function getPlaybackFromApi(info, { cacheVersion, context, baseUrl = LRCLIB_API_BASE,
        request = fetchWithTimeout, isCustom = false, fullLookup = false, signal }) {
        request = createPlaybackApiRequest(baseUrl, request, isCustom, !info?.lrclibOfficialOnly, signal);
        const startTotal = performance.now();
        const result = {
            uri: info.uri,
            provider: LRCLIB_PROVIDER_ID,
            cacheVersion,
            karaoke: null,
            synced: null,
            unsynced: null,
            copyright: null,
            error: null
        };

        const logDebug = (status, extra = {}) => {
            const endTotal = performance.now();
            debug(`[LR-DEBUG] ========================================`);
            debug(`[LR-DEBUG] Track: ${info.title} - ${info.artist}`);
            debug(`[LR-DEBUG] Status: ${status}`);
            Object.entries(extra).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    debug(`[LR-DEBUG] ${key}: ${value}`);
                }
            });
            debug(`[LR-DEBUG] Time - Total: ${(endTotal - startTotal).toFixed(2)}ms`);
            debug(`[LR-DEBUG] ========================================`);
        };

        try {
            signal?.throwIfAborted();
            const { title, artist, album, searchSettings, trackDurationSec, expectedArtists } = parseLrclibTrackMetadata(info);

            if (!title || !artist || !trackDurationSec) {
                result.error = 'Missing track metadata';
                logDebug('Failed', { error: result.error });
                return result;
            }

            const { headers, syncDataLineCharCounts, syncDataSource } = context;
            const mirrorResults = new Map();
            const mirrorResult = (candidate, metadata) => {
                if (mirrorResults.has(candidate)) return mirrorResults.get(candidate);
                const lookupInfo = metadata ? { ...info, title: metadata.title, artist: metadata.artist } : info;
                const found = buildPlaybackOnlyResult(candidate, lookupInfo, cacheVersion, 'custom', {
                    syncDataSource, syncDataLineCharCounts
                });
                if (found) mirrorResults.set(candidate, found);
                return found;
            };

            if (getSyncDataLrclibId(syncDataSource)) {
                let directCandidate = null;
                try {
                    directCandidate = decorateDirectCandidate(
                        await fetchLrclibCandidateById(syncDataSource, headers, { baseUrl, request, signal }),
                        syncDataSource, trackDurationSec
                    );
                } catch (error) {
                    if (error instanceof LrclibPlaybackUnavailableError) throw error;
                    signal?.throwIfAborted();
                    // An unsupported/malformed direct lookup can still be found by search.
                }

                const directMirrorResult = isCustom && mirrorResult(directCandidate);
                if (directMirrorResult) return directMirrorResult;
                if (!isCustom && directCandidate && applyCandidateLyricsToResult(result, directCandidate)) {
                    logDebug('Success', {
                        directLrclibId: getSyncDataLrclibId(syncDataSource),
                        hasSynced: !!result.synced,
                        hasUnsynced: !!result.unsynced,
                        durationDiff: directCandidate.durationDiff.toFixed(2),
                        exactDurationMatch: directCandidate.exactDurationMatch,
                        syncDataLineCount: syncDataLineCharCounts?.length || 0,
                        syncSourceMatchScore: directCandidate.syncSourceMatchScore,
                        preferredLyricsSource: directCandidate.preferredLyricsSource,
                        selectedSource: 'source-direct'
                    });
                    return result;
                }
            }

            if (fullLookup) {
                const query = new URLSearchParams({ track_name: title, artist_name: artist, duration: String(trackDurationSec) });
                if (album && album !== 'undefined') query.set('album_name', album);
                try {
                    const response = await request(`${baseUrl}/get?${query}`, { headers }, 35000);
                    if (response?.ok) {
                        const candidate = await response.json();
                        signal?.throwIfAborted();
                        if (isCustom) {
                            const found = mirrorResult(candidate);
                            if (found) return found;
                        } else {
                            // Metadata lookup is not a pinned-source shortcut.
                            // Validate it before trusting its official source ID.
                            const valid = buildPlaybackOnlyResult(candidate, info, cacheVersion, 'official', {
                                syncDataSource, syncDataLineCharCounts
                            });
                            if (valid && applyCandidateLyricsToResult(result, candidate)) return result;
                        }
                    }
                } catch (error) {
                    if (error instanceof LrclibPlaybackUnavailableError) throw error;
                    signal?.throwIfAborted();
                    // Continue the same host's search ladder for unsupported/malformed lookups.
                }
            }

            const runSearchFlow = createLrclibSearchFlowRunner({ headers, searchSettings, trackDurationSec, syncDataLineCharCounts,
                syncDataSource, baseUrl, request, tryWithoutAlbum: fullLookup, signal,
                candidateFilter: isCustom ? (candidate, metadata) => !!mirrorResult(candidate, metadata) : () => true });

            const primaryMetadata = {
                title,
                artist,
                album,
                expectedArtists
            };

            const primarySearchFlow = await runSearchFlow(primaryMetadata, { includeAlbum: true });

            signal?.throwIfAborted();
            if (primarySearchFlow.fatal) {
                result.error = primarySearchFlow.error;
                logDebug('Failed', {
                    error: result.error,
                    searchMode: primarySearchFlow.resolvedSearch?.searchLabel
                });
                return result;
            }

            let { body, selectedFlow, selectedSource, englishSearchFlow, englishMetadata, englishSearchError } = await selectLrclibCandidate({
                primarySearchFlow, runSearchFlow, syncDataLineCharCounts, syncDataSource, info,
                // The second host reuses this load's Spotify metadata read.
                getEnglishMetadata: () => {
                    signal?.throwIfAborted();
                    return context.englishMetadataPromise
                        || (context.englishMetadataPromise = getTrackMetadataForAcceptLanguage(info?.uri, LRCLIB_ENGLISH_ACCEPT_LANGUAGE));
                }
            });

            signal?.throwIfAborted();
            if (!body) {
                if (englishSearchError) {
                    result.error = englishSearchError;
                }
                else {
                    const finalFlow = englishSearchFlow || primarySearchFlow;
                    result.error = finalFlow.resolvedSearch.totalResults > 0
                        ? 'Low confidence metadata match'
                        : (finalFlow.resolvedSearch.error || 'No lyrics found');
                }
                logDebug('Failed', {
                    error: result.error,
                    searchMode: (englishSearchFlow || primarySearchFlow).resolvedSearch?.searchLabel,
                    totalResults: (englishSearchFlow || primarySearchFlow).resolvedSearch?.totalResults,
                    usedFallbackQuery: (englishSearchFlow || primarySearchFlow).usedFallbackQuery,
                    selectedSource,
                    englishTitle: englishMetadata?.title,
                    englishArtist: englishMetadata?.artist
                });
                return result;
            }

            if (body.durationDiff > LRCLIB_DURATION_TOLERANCE_SEC && !body.syncLineExactMatch) {
                result.error = `No LRCLIB results within ±${LRCLIB_DURATION_TOLERANCE_SEC}s`;
                logDebug('Failed', {
                    error: result.error,
                    durationDiff: body.durationDiff.toFixed(2),
                    searchMode: selectedFlow.resolvedSearch.searchLabel,
                    usedFallbackQuery: selectedFlow.usedFallbackQuery,
                    selectedSource
                });
                return result;
            }

            if (isCustom) {
                const found = mirrorResult(body);
                if (found) return found;
                result.error = 'No compatible lyrics from custom LRCLIB';
                return result;
            }

            const hasLyrics = applyCandidateLyricsToResult(result, body);

            if (body.instrumental) {
                logDebug('Success', {
                    instrumental: true,
                    matchedCandidates: selectedFlow.rankedCandidates.length,
                    durationDiff: body.durationDiff.toFixed(2),
                    exactDurationMatch: body.exactDurationMatch,
                    artistScore: body.artistScore.toFixed(3),
                    titleScore: body.titleScore.toFixed(3),
                    matchReason: body.matchReason,
                    syncLineExactMatch: !!body.syncLineExactMatch,
                    preferredLyricsSource: body.preferredLyricsSource,
                    searchMode: selectedFlow.resolvedSearch.searchLabel,
                    usedFallbackQuery: selectedFlow.usedFallbackQuery,
                    selectedSource,
                    englishTitle: englishMetadata?.title,
                    englishArtist: englishMetadata?.artist
                });
                return result;
            }

            if (!hasLyrics) {
                result.error = 'No lyrics';
                logDebug('Failed', {
                    error: result.error,
                    matchedCandidates: selectedFlow.rankedCandidates.length,
                    searchMode: selectedFlow.resolvedSearch.searchLabel,
                    usedFallbackQuery: selectedFlow.usedFallbackQuery,
                    selectedSource
                });
                return result;
            }

            logDebug('Success', {
                totalResults: selectedFlow.resolvedSearch.totalResults,
                matchedCandidates: selectedFlow.rankedCandidates.length,
                artistScore: body.artistScore.toFixed(3),
                titleScore: body.titleScore.toFixed(3),
                durationDiff: body.durationDiff.toFixed(2),
                exactDurationMatch: body.exactDurationMatch,
                hasKaraoke: !!result.karaoke,
                hasSynced: !!result.synced,
                hasUnsynced: !!result.unsynced,
                hasInterleavedTranslations: !!body.hasInterleavedTranslations,
                matchReason: body.matchReason,
                syncDataLineCount: syncDataLineCharCounts?.length || 0,
                syncLineExactMatch: !!body.syncLineExactMatch,
                preferredLyricsSource: body.preferredLyricsSource,
                searchMode: selectedFlow.resolvedSearch.searchLabel,
                usedFallbackQuery: selectedFlow.usedFallbackQuery,
                selectedSource,
                englishTitle: englishMetadata?.title,
                englishArtist: englishMetadata?.artist
            });
            return result;

        } catch (e) {
            signal?.throwIfAborted();
            result.error = e.message;
            logDebug('Fatal Error', { error: e.message });
            return result;
        }

    }

    return { getLyricsForPlayback, getPlaybackFromApi };
}
