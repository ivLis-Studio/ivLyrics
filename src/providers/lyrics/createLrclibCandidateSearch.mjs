import { LRCLIB_API_BASE } from "./createLrclibSearch.mjs";
import { createLrclibCandidateIdentifiers, getCandidateLyricsText, getComparableLyricsLines, getSyncDataLrclibId } from "./lrclibSourceMatching.mjs";

export function createLrclibCandidateSearch({
    matcher, search, parseLrclibTrackMetadata, resolveLrclibTrackContext, getHeaders,
    fetchWithTimeout, fetchLrclibCandidateById, decorateDirectCandidate, debug,
}) {
    const { createLrclibSearchFlowRunner, selectLrclibCandidate } = search;
    const { splitArtists, getTitleScore, getBestArtistScore } = matcher;
    const { buildLrclibCandidateSignature, buildLrclibCandidateKey } = createLrclibCandidateIdentifiers(matcher.normalize);

    function buildDirectPreviewCandidate(candidate) {
        if (!candidate) return null;
        const previewText = getCandidateLyricsText(candidate, candidate.preferredLyricsSource);
        const previewLines = getComparableLyricsLines(previewText);
        return {
            ...candidate,
            candidateKey: buildLrclibCandidateKey(candidate, 'source', 0),
            searchSource: 'source',
            previewText,
            previewLineCount: previewLines.length,
            hasSyncedLyrics: !!candidate?.syncedLyrics,
            hasPlainLyrics: !!candidate?.plainLyrics,
            isSelectedByDefault: true
        };
    }

    function buildPreviewCandidateList(primarySearchFlow, englishSearchFlow, selectedCandidate) {
        const selectedSignature = selectedCandidate ? buildLrclibCandidateSignature(selectedCandidate) : null;
        const seen = new Set();
        const output = [];
        let selectedCandidateKey = null;

        const pushCandidates = (candidates, sourceLabel) => {
            if (!Array.isArray(candidates)) return;

            candidates.forEach((candidate, index) => {
                const signature = buildLrclibCandidateSignature(candidate);
                if (seen.has(signature)) return;
                seen.add(signature);

                const previewText = getCandidateLyricsText(candidate, candidate?.preferredLyricsSource);
                const previewLines = getComparableLyricsLines(previewText);
                const candidateKey = buildLrclibCandidateKey(candidate, sourceLabel, index);
                const previewCandidate = {
                    ...candidate,
                    candidateKey,
                    searchSource: sourceLabel,
                    previewText,
                    previewLineCount: previewLines.length,
                    hasSyncedLyrics: !!candidate?.syncedLyrics,
                    hasPlainLyrics: !!candidate?.plainLyrics,
                    isSelectedByDefault: selectedSignature !== null && signature === selectedSignature
                };

                if (previewCandidate.isSelectedByDefault && !selectedCandidateKey) {
                    selectedCandidateKey = candidateKey;
                }

                output.push(previewCandidate);
            });
        };

        if (selectedSignature) {
            const selectedFirst = (primarySearchFlow?.rankedCandidates || []).concat(englishSearchFlow?.rankedCandidates || []);
            const selectedMatch = selectedFirst.find(candidate => buildLrclibCandidateSignature(candidate) === selectedSignature);
            if (selectedMatch) {
                pushCandidates([selectedMatch], 'selected');
            }
        }

        pushCandidates(primarySearchFlow?.rankedCandidates || [], 'primary');
        pushCandidates(englishSearchFlow?.rankedCandidates || [], 'english');

        if (!selectedCandidateKey && output.length > 0) {
            output[0].isSelectedByDefault = true;
            selectedCandidateKey = output[0].candidateKey;
        }

        return {
            candidates: output,
            selectedCandidateKey
        };
    }

    async function searchCandidates(info) {
        try {
            const { title, artist, album, searchSettings, trackDurationSec, expectedArtists } = parseLrclibTrackMetadata(info);

            if (!title || !artist || !trackDurationSec) {
                return {
                    success: false,
                    error: 'Missing track metadata',
                    candidates: [],
                    selectedCandidateKey: null
                };
            }

            const { headers, syncDataLineCharCounts, syncDataSource } = await resolveLrclibTrackContext(info);

            let sourceDirectLookupAttempted = false;
            let cachedSourceDirectPreviewCandidate = null;
            const getSourceDirectPreviewCandidate = async () => {
                if (sourceDirectLookupAttempted) return cachedSourceDirectPreviewCandidate;
                sourceDirectLookupAttempted = true;

                if (!getSyncDataLrclibId(syncDataSource)) return null;

                try {
                    const directCandidate = decorateDirectCandidate(
                        await fetchLrclibCandidateById(syncDataSource, headers),
                        syncDataSource,
                        trackDurationSec
                    );
                    cachedSourceDirectPreviewCandidate = buildDirectPreviewCandidate(directCandidate);
                } catch (e) {
                    debug('[LR-DEBUG] Failed to restore LRCLIB sync-data source:', e?.message || e);
                    cachedSourceDirectPreviewCandidate = null;
                }
                return cachedSourceDirectPreviewCandidate;
            };

            const buildSourceDirectSearchResult = (directPreviewCandidate) => ({
                success: true,
                error: null,
                candidates: [directPreviewCandidate],
                selectedCandidateKey: directPreviewCandidate.candidateKey,
                selectedSource: 'source-direct',
                searchMode: 'source-direct',
                totalResults: 1,
                usedFallbackQuery: false,
                syncDataLineCount: syncDataLineCharCounts?.length || 0,
                directLrclibId: getSyncDataLrclibId(syncDataSource),
                englishTitle: null,
                englishArtist: null
            });

            const sourceDirectPreviewCandidate = await getSourceDirectPreviewCandidate();
            if (sourceDirectPreviewCandidate) {
                return buildSourceDirectSearchResult(sourceDirectPreviewCandidate);
            }
            const runSearchFlow = createLrclibSearchFlowRunner({ headers, searchSettings, trackDurationSec, syncDataLineCharCounts, syncDataSource });

            const primaryMetadata = {
                title,
                artist,
                album,
                expectedArtists
            };

            const primarySearchFlow = await runSearchFlow(primaryMetadata, { includeAlbum: true });
            if (primarySearchFlow.fatal) {
                return {
                    success: false,
                    error: primarySearchFlow.error,
                    candidates: [],
                    selectedCandidateKey: null
                };
            }

            const { body, selectedFlow, selectedSource, englishSearchFlow, englishMetadata, englishSearchError } = await selectLrclibCandidate({ primarySearchFlow, runSearchFlow, syncDataLineCharCounts, syncDataSource, info });

            if (!body && getSyncDataLrclibId(syncDataSource)) {
                const directPreviewCandidate = await getSourceDirectPreviewCandidate();

                if (directPreviewCandidate) {
                    return {
                        ...buildSourceDirectSearchResult(directPreviewCandidate),
                        usedFallbackQuery: !!(englishSearchFlow || primarySearchFlow)?.usedFallbackQuery,
                        englishTitle: englishMetadata?.title || null,
                        englishArtist: englishMetadata?.artist || null
                    };
                }
            }

            if (!body) {
                const finalFlow = englishSearchFlow || primarySearchFlow;
                return {
                    success: false,
                    error: englishSearchError || (finalFlow.resolvedSearch.totalResults > 0
                        ? 'Low confidence metadata match'
                        : (finalFlow.resolvedSearch.error || 'No lyrics found')),
                    candidates: [],
                    selectedCandidateKey: null,
                    searchMode: finalFlow.resolvedSearch?.searchLabel,
                    totalResults: finalFlow.resolvedSearch?.totalResults || 0,
                    usedFallbackQuery: finalFlow.usedFallbackQuery || false
                };
            }

            const previewList = buildPreviewCandidateList(primarySearchFlow, englishSearchFlow, body);
            return {
                success: true,
                error: null,
                candidates: previewList.candidates,
                selectedCandidateKey: previewList.selectedCandidateKey,
                selectedSource,
                searchMode: selectedFlow.resolvedSearch?.searchLabel || 'structured',
                totalResults: previewList.candidates.length,
                usedFallbackQuery: !!selectedFlow.usedFallbackQuery,
                syncDataLineCount: syncDataLineCharCounts?.length || 0,
                englishTitle: englishMetadata?.title || null,
                englishArtist: englishMetadata?.artist || null
            };
        } catch (e) {
            return {
                success: false,
                error: e?.message || 'LRCLIB candidate search failed',
                candidates: [],
                selectedCandidateKey: null
            };
        }
    }

    async function searchCandidatesByQuery(queryText, info = {}, { signal } = {}) {
        try {
            signal?.throwIfAborted();
            const queryValue = String(queryText || '').trim();
            if (!queryValue) {
                return {
                    success: false,
                    error: 'Missing search query',
                    candidates: [],
                    selectedCandidateKey: null
                };
            }

            const headers = getHeaders();
            const query = new URLSearchParams({ q: queryValue });
            const response = await fetchWithTimeout(`${LRCLIB_API_BASE}/search?${query.toString()}`, { headers, signal }, 35000);
            signal?.throwIfAborted();

            // 수동 검색 실패 응답은 error 메시지만 다르고 나머지 형태가 동일하다.
            const manualSearchFailure = (errorMessage) => ({
                success: false,
                error: errorMessage,
                candidates: [],
                selectedCandidateKey: null,
                searchMode: 'manual',
                totalResults: 0
            });

            if (!response) {
                return manualSearchFailure('Network request failed');
            }

            if (!response.ok) {
                return manualSearchFailure(response.status === 404 ? 'No lyrics found' : `API error: ${response.status}`);
            }

            const data = await response.json();
            signal?.throwIfAborted();
            if (!Array.isArray(data)) {
                return manualSearchFailure('Invalid LRCLIB response');
            }

            const trackDuration = Number(info?.duration || 0);
            const trackDurationSec = trackDuration > 0 ? trackDuration / 1000 : 0;
            const candidates = data
                .filter(candidate => candidate?.syncedLyrics || candidate?.plainLyrics || candidate?.instrumental)
                .map((candidate, index) => {
                    const preferredLyricsSource = candidate?.syncedLyrics ? 'synced' : (candidate?.plainLyrics ? 'plain' : 'instrumental');
                    const previewText = getCandidateLyricsText(candidate, preferredLyricsSource);
                    const previewLines = getComparableLyricsLines(previewText);
                    return {
                        ...candidate,
                        candidateKey: buildLrclibCandidateKey(candidate, 'manual', index),
                        searchSource: 'manual',
                        preferredLyricsSource,
                        previewText,
                        previewLineCount: previewLines.length,
                        hasSyncedLyrics: !!candidate?.syncedLyrics,
                        hasPlainLyrics: !!candidate?.plainLyrics,
                        artistScore: info?.artist ? getBestArtistScore(splitArtists(info.artist), splitArtists(candidate?.artistName || '')) : 0,
                        titleScore: info?.title ? getTitleScore(info.title, candidate?.trackName || candidate?.name || '') : 0,
                        durationDiff: trackDurationSec > 0 ? Math.abs(Number(candidate?.duration || 0) - trackDurationSec) : 0,
                        isSelectedByDefault: index === 0
                    };
                });

            return {
                success: candidates.length > 0,
                error: candidates.length > 0 ? null : 'No lyrics found',
                candidates,
                selectedCandidateKey: candidates[0]?.candidateKey || null,
                selectedSource: 'manual',
                searchMode: 'manual',
                totalResults: candidates.length,
                usedFallbackQuery: false
            };
        } catch (e) {
            return {
                success: false,
                error: e?.message || 'LRCLIB candidate search failed',
                candidates: [],
                selectedCandidateKey: null
            };
        }
    }

    return { searchCandidates, searchCandidatesByQuery };
}
