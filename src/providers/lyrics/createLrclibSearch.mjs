import {
    getCandidateSyncLineMatch, getCandidateLyricsText, analyzeLyricsLanguageMix,
    getCandidateSourceMatch, hasOriginalLyricsScript,
} from "./lrclibSourceMatching.mjs";

export const LRCLIB_API_BASE = 'https://lrclib.net/api';
export const LRCLIB_DURATION_TOLERANCE_SEC = 15;
export const LRCLIB_ARTIST_MATCH_THRESHOLD = 0.9;
export const LRCLIB_FALLBACK_TITLE_MATCH_THRESHOLD = 0.98;
export const LRCLIB_ENGLISH_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

const LRCLIB_ENABLE_INEXACT_SEARCH = true;

export function createLrclibSearch({ matcher, request: readRequest, getTrackMetadataForAcceptLanguage }) {
    const { splitArtists, getTitleScore, getBestArtistScore, hasExactDurationMatch, hasSameSongTitleEvidence } = matcher;

    // 검색 실행/후보 랭킹/검색 흐름 로직은 searchCandidates()와 getLyrics()에서
    // 동일하게 사용되므로, 호출별 컨텍스트를 받아 runSearchFlow를 돌려주는
    // 팩토리로 공유한다. 기본값은 공식 API이며 재생에서만 호스트/전송을 지정한다.
    function createLrclibSearchFlowRunner({ headers, searchSettings, trackDurationSec, syncDataLineCharCounts, syncDataSource,
        baseUrl = LRCLIB_API_BASE, request = readRequest, tryWithoutAlbum = false, candidateFilter = () => true, signal }) {
        const runSearch = async (params, label) => {
            const query = new URLSearchParams();
            if (params.track_name) query.set('track_name', params.track_name);
            if (params.artist_name) query.set('artist_name', params.artist_name);
            if (params.album_name && params.album_name !== 'undefined') query.set('album_name', params.album_name);
            if (params.q) query.set('q', params.q);

            const searchUrl = `${baseUrl}/search?${query.toString()}`;
            const response = await request(searchUrl, { headers }, 35000);

            if (!response) {
                return {
                    fatal: true,
                    error: 'Network request failed',
                    searchLabel: label,
                    totalResults: 0,
                    candidates: []
                };
            }

            if (!response.ok) {
                if (response.status === 429) {
                    return {
                        fatal: true,
                        error: 'Rate limit exceeded (429)',
                        searchLabel: label,
                        totalResults: 0,
                        candidates: []
                    };
                }
                if (response.status === 404) {
                    return {
                        fatal: false,
                        error: 'No lyrics found',
                        searchLabel: label,
                        totalResults: 0,
                        candidates: []
                    };
                }
                return {
                    fatal: true,
                    error: `API error: ${response.status}`,
                    searchLabel: label,
                    totalResults: 0,
                    candidates: []
                };
            }

            const data = await response.json();
            signal?.throwIfAborted();
            if (!Array.isArray(data)) {
                return {
                    fatal: true,
                    error: 'Invalid LRCLIB response',
                    searchLabel: label,
                    totalResults: 0,
                    candidates: []
                };
            }

            return {
                fatal: false,
                error: data.length === 0 ? 'No lyrics found' : null,
                searchLabel: label,
                totalResults: data.length,
                candidates: data
            };
        };

        const rankCandidates = (candidates, metadata, { allowTitleDrivenMatch = false } = {}) => {
            const metadataTitle = metadata?.title || '';
            const metadataArtists = metadata?.expectedArtists || [];

            return candidates
                .map(item => {
                    const candidateArtists = splitArtists(item?.artistName || '');
                    const candidateTitle = item?.trackName || item?.name || '';
                    const syncLineMatch = getCandidateSyncLineMatch(item, syncDataLineCharCounts);
                    const lyricsText = getCandidateLyricsText(item, syncLineMatch.preferredLyricsSource);
                    const lyricsMix = analyzeLyricsLanguageMix(lyricsText);
                    const titleScore = getTitleScore(metadataTitle, candidateTitle);
                    const artistScore = getBestArtistScore(metadataArtists, candidateArtists);
                    const durationDiff = Math.abs(Number(item?.duration || 0) - trackDurationSec);
                    const exactDurationMatch = hasExactDurationMatch(trackDurationSec, Number(item?.duration || 0));
                    const artistMatched = artistScore > LRCLIB_ARTIST_MATCH_THRESHOLD;
                    const titleDrivenMatch = allowTitleDrivenMatch
                        && titleScore >= LRCLIB_FALLBACK_TITLE_MATCH_THRESHOLD
                        && exactDurationMatch;
                    const rankedItem = {
                        ...item,
                        artistScore,
                        titleScore,
                        durationDiff,
                        exactDurationMatch,
                        artistMatched,
                        titleDrivenMatch,
                        syncLineExactMatch: syncLineMatch.syncLineExactMatch,
                        exactSyncedLineMatch: syncLineMatch.exactSyncedLineMatch,
                        exactPlainLineMatch: syncLineMatch.exactPlainLineMatch,
                        preferredLyricsSource: syncLineMatch.preferredLyricsSource,
                        lyricsMix,
                        hasInterleavedTranslations: lyricsMix.hasInterleavedTranslations,
                        matchReason: artistMatched ? 'artist' : (titleDrivenMatch ? 'title' : 'rejected')
                    };
                    const sourceMatch = getCandidateSourceMatch(rankedItem, syncDataSource);

                    return {
                        ...rankedItem,
                        ...sourceMatch
                    };
                })
                .filter(item => {
                    if (!item?.syncedLyrics && !item?.plainLyrics && !item?.instrumental) return false;
                    if (!candidateFilter(item, metadata)) return false;
                    if (item.artistMatched) return hasSameSongTitleEvidence(item, metadataTitle);
                    if (allowTitleDrivenMatch && item.titleDrivenMatch) return true;
                    return false;
                })
                .sort((a, b) => {
                    if (a.syncSourceMatchScore !== b.syncSourceMatchScore) {
                        return Number(b.syncSourceMatchScore || 0) - Number(a.syncSourceMatchScore || 0);
                    }
                    if (a.syncLineExactMatch !== b.syncLineExactMatch) {
                        return Number(b.syncLineExactMatch) - Number(a.syncLineExactMatch);
                    }
                    if (a.exactSyncedLineMatch !== b.exactSyncedLineMatch) {
                        return Number(b.exactSyncedLineMatch) - Number(a.exactSyncedLineMatch);
                    }
                    if (a.artistMatched !== b.artistMatched) {
                        return Number(b.artistMatched) - Number(a.artistMatched);
                    }
                    if (a.hasInterleavedTranslations !== b.hasInterleavedTranslations) {
                        return Number(a.hasInterleavedTranslations) - Number(b.hasInterleavedTranslations);
                    }
                    if (b.titleScore !== a.titleScore) {
                        return b.titleScore - a.titleScore;
                    }
                    if (a.durationDiff !== b.durationDiff) {
                        return a.durationDiff - b.durationDiff;
                    }
                    return b.artistScore - a.artistScore;
                });
        };

        const runSearchFlow = async (metadata, { includeAlbum = true } = {}) => {
            const structuredSearch = await runSearch({
                track_name: metadata.title,
                artist_name: metadata.artist,
                album_name: includeAlbum ? metadata.album : ''
            }, includeAlbum ? 'structured' : 'structured:no-album');

            if (structuredSearch.fatal) {
                return {
                    fatal: true,
                    error: structuredSearch.error,
                    resolvedSearch: structuredSearch,
                    rankedCandidates: [],
                    usedFallbackQuery: false,
                    bestSyncedCandidate: null,
                    bestPlainCandidate: null
                };
            }

            let resolvedSearch = structuredSearch;
            let rankedCandidates = rankCandidates(structuredSearch.candidates, metadata);
            let usedFallbackQuery = false;

            if (rankedCandidates.length === 0 && tryWithoutAlbum && includeAlbum && metadata.album) {
                const withoutAlbum = await runSearch({ track_name: metadata.title, artist_name: metadata.artist }, 'structured:no-album');
                resolvedSearch = withoutAlbum;
                if (withoutAlbum.fatal) {
                    return { fatal: true, error: withoutAlbum.error, resolvedSearch, rankedCandidates: [], usedFallbackQuery: false };
                }
                rankedCandidates = rankCandidates(withoutAlbum.candidates, metadata);
            }

            if (rankedCandidates.length === 0 && LRCLIB_ENABLE_INEXACT_SEARCH) {
                const fallbackAttempts = [];
                if (searchSettings.enableFallbackTitleArtist && metadata.title && metadata.artist) {
                    fallbackAttempts.push({ params: { q: `${metadata.title} ${metadata.artist}` }, label: 'q:title+artist' });
                }
                if (searchSettings.enableFallbackTitleOnly && metadata.title) {
                    fallbackAttempts.push({ params: { q: metadata.title }, label: 'q:title' });
                }

                for (const attempt of fallbackAttempts) {
                    const fallbackSearch = await runSearch(attempt.params, attempt.label);
                    usedFallbackQuery = true;

                    if (fallbackSearch.fatal) {
                        return {
                            fatal: true,
                            error: fallbackSearch.error,
                            resolvedSearch: fallbackSearch,
                            rankedCandidates: [],
                            usedFallbackQuery,
                            bestSyncedCandidate: null,
                            bestPlainCandidate: null
                        };
                    }

                    resolvedSearch = fallbackSearch;
                    rankedCandidates = rankCandidates(fallbackSearch.candidates, metadata, { allowTitleDrivenMatch: true });

                    if (rankedCandidates.length > 0) {
                        break;
                    }
                }
            }

            const withinTolerance = item => item?.durationDiff <= LRCLIB_DURATION_TOLERANCE_SEC;
            // Every "best candidate" slot below prefers an in-tolerance
            // match and otherwise falls back to any match, else null. Share
            // that fixed two-pass lookup so the twelve slots stay identical.
            const pickWithTolerance = (list, matches) => list.find(item => withinTolerance(item) && matches(item))
                || list.find(matches)
                || null;
            const isSynced = item => item.syncedLyrics;
            const isPlain = item => item.plainLyrics;
            const isInstrumental = item => item.instrumental;
            const isPreferredSynced = item => item.preferredLyricsSource === 'synced';
            const isPreferredPlain = item => item.preferredLyricsSource === 'plain';
            const sourceMatchedCandidates = rankedCandidates.filter(item => Number(item?.syncSourceMatchScore || 0) > 0);
            const exactMatchCandidates = rankedCandidates.filter(item => item.syncLineExactMatch);
            const nativeScriptCandidates = rankedCandidates.filter(item => hasOriginalLyricsScript(getCandidateLyricsText(item, item.preferredLyricsSource)));
            const fallbackScriptCandidates = rankedCandidates.filter(item => !hasOriginalLyricsScript(getCandidateLyricsText(item, item.preferredLyricsSource)));
            const exactNativeScriptCandidates = nativeScriptCandidates.filter(item => item.syncLineExactMatch);
            const exactFallbackScriptCandidates = fallbackScriptCandidates.filter(item => item.syncLineExactMatch);
            const preferredNativeScriptCandidates = nativeScriptCandidates.filter(item => !item.hasInterleavedTranslations);
            const interleavedNativeScriptCandidates = nativeScriptCandidates.filter(item => item.hasInterleavedTranslations);
            const orderedNativeScriptCandidates = preferredNativeScriptCandidates.concat(interleavedNativeScriptCandidates);

            return {
                fatal: false,
                error: null,
                resolvedSearch,
                rankedCandidates,
                hasExactSyncLineMatch: exactMatchCandidates.length > 0,
                usedFallbackQuery,
                bestSourceSyncedCandidate: pickWithTolerance(sourceMatchedCandidates, isSynced),
                bestSourcePlainCandidate: pickWithTolerance(sourceMatchedCandidates, isPlain),
                bestSourceInstrumentalCandidate: pickWithTolerance(sourceMatchedCandidates, isInstrumental),
                bestExactNativeSyncedCandidate: pickWithTolerance(exactNativeScriptCandidates, isPreferredSynced),
                bestExactNativePlainCandidate: pickWithTolerance(exactNativeScriptCandidates, isPreferredPlain),
                bestExactFallbackSyncedCandidate: pickWithTolerance(exactFallbackScriptCandidates, isPreferredSynced),
                bestExactFallbackPlainCandidate: pickWithTolerance(exactFallbackScriptCandidates, isPreferredPlain),
                bestNativeSyncedCandidate: pickWithTolerance(orderedNativeScriptCandidates, isSynced),
                bestNativePlainCandidate: pickWithTolerance(orderedNativeScriptCandidates, isPlain),
                bestFallbackSyncedCandidate: pickWithTolerance(fallbackScriptCandidates, isSynced),
                bestFallbackPlainCandidate: pickWithTolerance(fallbackScriptCandidates, isPlain),
                bestInstrumentalCandidate: pickWithTolerance(rankedCandidates, isInstrumental)
            };
        };

        return runSearchFlow;
    }

    // body/selectedFlow/selectedSource 후보 선택 사다리는 searchCandidates()와
    // getLyrics()에서 완전히 동일하게 사용된다. 호출별 컨텍스트를 받아 선택 결과와
    // 영어 재검색 상태를 그대로 돌려주는 헬퍼로 공유한다.
    async function selectLrclibCandidate({ primarySearchFlow, runSearchFlow, syncDataLineCharCounts, syncDataSource, info,
        getEnglishMetadata = () => getTrackMetadataForAcceptLanguage(info?.uri, LRCLIB_ENGLISH_ACCEPT_LANGUAGE) }) {
        let body = null;
        let selectedFlow = primarySearchFlow;
        let selectedSource = 'primary-none';
        let englishSearchFlow = null;
        let englishMetadata = null;
        let englishSearchError = null;
        let englishSearchAttempted = false;
        const shouldPreferExactSyncLineMatch = Array.isArray(syncDataLineCharCounts) && syncDataLineCharCounts.length > 0;

        const ensureEnglishSearchFlow = async () => {
            if (englishSearchAttempted) return englishSearchFlow;
            englishSearchAttempted = true;
            englishMetadata = await getEnglishMetadata();

            if (englishMetadata?.title && englishMetadata?.artist) {
                englishMetadata = {
                    title: englishMetadata.title.trim(),
                    artist: englishMetadata.artist.trim(),
                    album: '',
                    expectedArtists: splitArtists(englishMetadata.artist)
                };

                englishSearchFlow = await runSearchFlow(englishMetadata, { includeAlbum: false });

                if (englishSearchFlow.fatal) {
                    englishSearchError = englishSearchFlow.error;
                    englishSearchFlow = null;
                }
            }

            return englishSearchFlow;
        };

        // A single ladder rung: adopt `flow[candidateProp]` as the chosen
        // body if nothing has been selected yet. `flow` is `primarySearchFlow`
        // (always present) or the lazily-built `englishSearchFlow` (may be
        // null). Behaviour matches the original `if (!body && flow?.prop)`
        // rungs, including the `else if` chain (each later rung already ran
        // only while `body` was still null).
        const selectFromFlow = (flow, candidateProp, source) => {
            if (body || !flow || !flow[candidateProp]) return;
            body = flow[candidateProp];
            selectedFlow = flow;
            selectedSource = source;
        };
        // English rungs need the flow resolved first. `ensure` mirrors the
        // original rungs that awaited `ensureEnglishSearchFlow()` before the
        // check; later english rungs reused the already-resolved flow.
        const selectFromEnglish = async (candidateProp, source, ensure) => {
            if (body) return;
            if (ensure) await ensureEnglishSearchFlow();
            selectFromFlow(englishSearchFlow, candidateProp, source);
        };

        if (syncDataSource) {
            selectFromFlow(primarySearchFlow, 'bestSourceSyncedCandidate', 'primary-source-synced');
            await selectFromEnglish('bestSourceSyncedCandidate', 'english-source-synced', true);
            selectFromFlow(primarySearchFlow, 'bestSourcePlainCandidate', 'primary-source-plain');
            await selectFromEnglish('bestSourcePlainCandidate', 'english-source-plain', false);
            selectFromFlow(primarySearchFlow, 'bestSourceInstrumentalCandidate', 'primary-source-instrumental');
            await selectFromEnglish('bestSourceInstrumentalCandidate', 'english-source-instrumental', false);
        }

        if (shouldPreferExactSyncLineMatch) {
            selectFromFlow(primarySearchFlow, 'bestExactNativeSyncedCandidate', 'primary-exact-native-synced');
            await selectFromEnglish('bestExactNativeSyncedCandidate', 'english-exact-native-synced', true);
            selectFromFlow(primarySearchFlow, 'bestExactNativePlainCandidate', 'primary-exact-native-plain');
            await selectFromEnglish('bestExactNativePlainCandidate', 'english-exact-native-plain', false);
            selectFromFlow(primarySearchFlow, 'bestExactFallbackSyncedCandidate', 'primary-exact-fallback-synced');
            await selectFromEnglish('bestExactFallbackSyncedCandidate', 'english-exact-fallback-synced', false);
            selectFromFlow(primarySearchFlow, 'bestExactFallbackPlainCandidate', 'primary-exact-fallback-plain');
            await selectFromEnglish('bestExactFallbackPlainCandidate', 'english-exact-fallback-plain', false);
        }

        selectFromFlow(primarySearchFlow, 'bestNativeSyncedCandidate', 'primary-native-synced');
        await selectFromEnglish('bestNativeSyncedCandidate', 'english-native-synced', true);

        selectFromFlow(primarySearchFlow, 'bestNativePlainCandidate', 'primary-native-plain');
        await selectFromEnglish('bestNativePlainCandidate', 'english-native-plain', false);
        selectFromFlow(primarySearchFlow, 'bestFallbackSyncedCandidate', 'primary-fallback-synced');
        await selectFromEnglish('bestFallbackSyncedCandidate', 'english-fallback-synced', false);
        selectFromFlow(primarySearchFlow, 'bestFallbackPlainCandidate', 'primary-fallback-plain');
        await selectFromEnglish('bestFallbackPlainCandidate', 'english-fallback-plain', false);
        selectFromFlow(primarySearchFlow, 'bestInstrumentalCandidate', 'primary-instrumental');
        await selectFromEnglish('bestInstrumentalCandidate', 'english-instrumental', false);

        return { body, selectedFlow, selectedSource, englishSearchFlow, englishMetadata, englishSearchError };
    }

    return { createLrclibSearchFlowRunner, selectLrclibCandidate };
}
