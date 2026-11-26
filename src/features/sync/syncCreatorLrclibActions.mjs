import {
	buildLrclibIdCandidate as buildLrclibIdCandidateFromRecord,
	buildLrclibSearchCandidate as buildLrclibSearchCandidateFromRecord,
	buildLrclibSyncSource, buildSyntheticLrclibResult, extractLyricsText, getLrclibCandidateText,
	getLrclibRecordVariantForSource,
} from './syncCreatorLrclibLyrics.mjs';
import {
	normalizeSyncCreatorLrclibId, SYNC_CREATOR_SOURCE_ADDON_ID, getSyncCreatorLyricsFingerprintFromText,
} from './lrclibSyncSource.mjs';
import { getSyncCreatorFlatLyricsCharsFromText } from './syncCreatorLyricText.mjs';

export function useSyncCreatorLrclibActions({
	react: { useCallback }, i18n, toast, searchRequests,
	track: { trackUri, trackIsrc, trackName, artistName, primaryArtist, albumName, trackDurationMs },
	state: { lyrics, lrclibCandidates, lrclibIdInput, lrclibSearchQuery, lrclibIdInputEditedRef, lrclibIdInputRevisionRef, selectedLrclibSourceRef },
	services: {
		debug, logger = console, getLegacyProviders, getLyricsAddonManager, syncCreatorDraftStore,
	},
	client: { getLrclibRecord, searchLrclibRecords, getLoadedLrclibId: resolveSyncCreatorLoadedLyricsLrclibId },
	sourceChange: {
		applyLoadedLyricsResult, beginSyncCreatorSourceChange, isCurrentSyncCreatorSourceChange, readPublishedSync, getSourceSignal,
		resetSyncCreatorLyricsLoadingState, clearLrclibCandidateState, prepareImportedLyricsSource, captureOfflineDraftRecovery,
	},
	ui: {
		setError, setIsLoading, setIsLoadingLrclibId, setLrclibCandidates, setLrclibIdInput,
		setLrclibSearchMeta, setPreviewLrclibCandidateKey, setSelectedLrclibCandidateKey,
		setSelectedLrclibSourceValue, setShowLrclibCandidates,
	},
}) {
	const applySelectedLrclibCandidate = useCallback(async (candidateKey) => {
		const candidate = lrclibCandidates.find(item => item.candidateKey === candidateKey);
		if (!candidate) return;

		const sourceChangeRequestId = beginSyncCreatorSourceChange();
		if (sourceChangeRequestId === null) return;
		const ownsCandidates = searchRequests.captureCandidates();
		resetSyncCreatorLyricsLoadingState();

		try {
			const syntheticResult = buildSyntheticLrclibResult(candidate);
			const applied = await applyLoadedLyricsResult(syntheticResult, SYNC_CREATOR_SOURCE_ADDON_ID, sourceChangeRequestId);
			if (!applied || !isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			if (ownsCandidates()) {
				setSelectedLrclibCandidateKey(candidate.candidateKey);
				setPreviewLrclibCandidateKey(candidate.candidateKey);
			}
			setSelectedLrclibSourceValue(syntheticResult.lrclibSource || buildLrclibSyncSource(candidate));
		} catch (e) {
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			logger.error('[SyncDataCreator] Failed to apply LRCLIB candidate:', e);
			setError(i18n.t('syncCreator.loadError'));
		} finally {
			if (isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) setIsLoading(false);
		}
	}, [
		applyLoadedLyricsResult,
		beginSyncCreatorSourceChange,
		isCurrentSyncCreatorSourceChange,
		lrclibCandidates, i18n, logger, resetSyncCreatorLyricsLoadingState, searchRequests,
		setError, setIsLoading, setPreviewLrclibCandidateKey, setSelectedLrclibCandidateKey, setSelectedLrclibSourceValue
	]);

	const getLrclibCandidateTrack = useCallback(() => ({
		trackName, artistName, durationMs: trackDurationMs,
	}), [trackName, artistName, trackDurationMs]);
	const buildLrclibIdCandidate = useCallback((candidate, requestedId, variant = '') =>
		buildLrclibIdCandidateFromRecord(candidate, requestedId, variant, getLrclibCandidateTrack()),
	[getLrclibCandidateTrack]);
	const buildLrclibSearchCandidate = useCallback((candidate, index, sourceLabel = 'manual') =>
		buildLrclibSearchCandidateFromRecord(candidate, index, sourceLabel, getLrclibCandidateTrack()),
	[getLrclibCandidateTrack]);

	const selectLrclibCandidate = useCallback((candidate, lrclibId) => {
		setLrclibCandidates([candidate]);
		setSelectedLrclibCandidateKey(candidate.candidateKey);
		setPreviewLrclibCandidateKey(candidate.candidateKey);
		setLrclibSearchMeta({
			success: true,
			totalResults: 1,
			selectedCandidateKey: candidate.candidateKey,
			selectedSource: 'id',
			searchMode: 'id',
			directLrclibId: lrclibId,
		});
		setShowLrclibCandidates(true);
	}, [setLrclibCandidates, setSelectedLrclibCandidateKey, setPreviewLrclibCandidateKey, setLrclibSearchMeta, setShowLrclibCandidates]);
	const mirrorLoadedLrclibId = useCallback((lrclibId, inputRevision) => {
		if (lrclibIdInputRevisionRef.current !== inputRevision) return;
		lrclibIdInputEditedRef.current = false;
		setLrclibIdInput(lrclibId);
	}, [lrclibIdInputEditedRef, lrclibIdInputRevisionRef, setLrclibIdInput]);

	// Shows one LRCLIB entry in the editor, in the given version when it has
	// one. Returns the loaded lyrics result, or null when a newer source load
	// replaced it.
	const applyLrclibRecord = useCallback(async (record, lrclibId, variant, {
		sourceChangeRequestId, publishedSync, inputRevision, ownsCandidates,
	}) => {
		const decoratedCandidate = buildLrclibIdCandidate(record, lrclibId, variant);
		if (!decoratedCandidate || !getLrclibCandidateText(decoratedCandidate).trim()) {
			throw new Error('No lyrics found');
		}

		const syntheticResult = buildSyntheticLrclibResult(decoratedCandidate);
		const applied = await applyLoadedLyricsResult(syntheticResult, SYNC_CREATOR_SOURCE_ADDON_ID, sourceChangeRequestId, { publishedSync });
		if (!applied || !isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return null;
		if (ownsCandidates()) selectLrclibCandidate(decoratedCandidate, lrclibId);
		mirrorLoadedLrclibId(lrclibId, inputRevision);
		setSelectedLrclibSourceValue(syntheticResult.lrclibSource || buildLrclibSyncSource(decoratedCandidate));
		return syntheticResult;
	}, [
		applyLoadedLyricsResult,
		buildLrclibIdCandidate,
		isCurrentSyncCreatorSourceChange,
		mirrorLoadedLrclibId, selectLrclibCandidate, setSelectedLrclibSourceValue,
	]);

	// Always loads the id in the LRCLIB ID box; event arguments are ignored.
	const loadLrclibById = useCallback(async () => {
		const lrclibId = String(lrclibIdInput || '').trim();
		if (!/^\d+$/.test(lrclibId)) {
			toast.error(i18n.t('syncCreator.lrclibIdInvalid') || 'Enter a valid LRCLIB ID.');
			return;
		}

		// Read before the reset below clears the selected source.
		const knownLrclibSources = [selectedLrclibSourceRef.current, lyrics?.lrclibSource];
		const inputRevision = lrclibIdInputRevisionRef.current;
		const sourceChangeRequestId = beginSyncCreatorSourceChange();
		if (sourceChangeRequestId === null) return;
		const ownsCandidates = searchRequests.captureCandidates();
		setIsLoadingLrclibId(true);
		resetSyncCreatorLyricsLoadingState();
		clearLrclibCandidateState();

		try {
			const candidate = await getLrclibRecord(lrclibId, getSourceSignal(sourceChangeRequestId));
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			if (!candidate || (!candidate.syncedLyrics && !candidate.plainLyrics)) {
				throw new Error('No lyrics found');
			}

			// The timed and plain texts of one entry can differ. Show the one an
			// existing sync was made on, so its timings load onto it.
			const publishedSync = await readPublishedSync(SYNC_CREATOR_SOURCE_ADDON_ID);
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			const variant = [...knownLrclibSources, publishedSync?.source]
				.map(source => getLrclibRecordVariantForSource(candidate, source)).find(Boolean) || '';
			const loaded = await applyLrclibRecord(candidate, lrclibId, variant, {
				sourceChangeRequestId, publishedSync, inputRevision, ownsCandidates,
			});
			if (!loaded) return;
			toast.success(i18n.t('syncCreator.lrclibIdLoadSuccess') || 'Loaded lyrics from LRCLIB ID.');
		} catch (e) {
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			logger.error('[SyncDataCreator] Failed to load LRCLIB ID:', e);
			setError(i18n.t('syncCreator.lrclibIdLoadError') || 'Failed to load lyrics from LRCLIB ID.');
			toast.error((i18n.t('syncCreator.lrclibIdLoadError') || 'Failed to load lyrics from LRCLIB ID.') + ': ' + e.message);
		} finally {
			if (isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) {
				setIsLoading(false);
				setIsLoadingLrclibId(false);
			}
		}
	}, [
		applyLrclibRecord,
		beginSyncCreatorSourceChange,
		clearLrclibCandidateState,
		isCurrentSyncCreatorSourceChange,
		lrclibIdInput,
		lyrics, getLrclibRecord, getSourceSignal, i18n, toast, logger, lrclibIdInputRevisionRef, selectedLrclibSourceRef, resetSyncCreatorLyricsLoadingState,
		setError, setIsLoading, setIsLoadingLrclibId, readPublishedSync, searchRequests,
	]);

	// Fetch the file's exact lyric version without changing the current editor.
	const prepareLrclibSourceForImport = useCallback(async (source, isCurrent) => {
		const lrclibId = normalizeSyncCreatorLrclibId(source?.lrclibId);
		const inputRevision = lrclibIdInputRevisionRef.current;
		let record = null;
		try {
			record = await getLrclibRecord(lrclibId);
		} catch (error) {
			throw new Error(`${i18n.t('syncCreator.lrclibIdLoadError') || 'Failed to load lyrics from LRCLIB ID'} (${lrclibId}): ${error?.message || error}`);
		}
		if (!isCurrent()) return null;
		const variant = getLrclibRecordVariantForSource(record, source);
		if (!variant) {
			throw new Error(i18n.t('syncCreator.importLyricsMismatch', { id: lrclibId })
				|| `This file does not match the current lyrics or the lyrics of LRCLIB ${lrclibId}.`);
		}

		const candidate = buildLrclibIdCandidate(record, lrclibId, variant);
		const result = buildSyntheticLrclibResult(candidate);
		const text = extractLyricsText(result.synced || result.unsynced);
		const prepared = await prepareImportedLyricsSource(result, text, isCurrent);
		if (!prepared || !isCurrent()) return null;
		return {
			lyricsChars: getSyncCreatorFlatLyricsCharsFromText(text),
			lyricsFingerprint: syncCreatorDraftStore?.createLyricsFingerprint?.(text)
				|| getSyncCreatorLyricsFingerprintFromText(text),
			lrclibSource: result.lrclibSource,
			publishedBaseline: prepared.publishedBaseline,
			activate() {
				prepared.activate();
				selectLrclibCandidate(candidate, lrclibId);
				mirrorLoadedLrclibId(lrclibId, inputRevision);
			},
		};
	}, [
		buildLrclibIdCandidate, getLrclibRecord, i18n, lrclibIdInputRevisionRef, mirrorLoadedLrclibId,
		prepareImportedLyricsSource, selectLrclibCandidate, syncCreatorDraftStore,
	]);

	const searchLrclibByQuery = useCallback(async () => {
		const query = String(lrclibSearchQuery || '').trim();
		if (!query) {
			toast.error(i18n.t('syncCreator.lrclibSearchQueryRequired') || 'Enter a LRCLIB search query.');
			return;
		}

		const request = searchRequests.begin();
		if (!request) return;
		setError(null);
		try {
			const body = await searchLrclibRecords(query, request.signal);
			if (!request.isCurrent()) return;
			const candidates = (Array.isArray(body) ? body : [])
				.map((candidate, index) => buildLrclibSearchCandidate(candidate, index, 'manual'))
				.filter(candidate => candidate && getLrclibCandidateText(candidate).trim().length > 0);
			setLrclibCandidates(candidates);
			setPreviewLrclibCandidateKey(candidates[0]?.candidateKey || '');
			setSelectedLrclibCandidateKey(prev => (
				candidates.some(candidate => candidate.candidateKey === prev) ? prev : ''
			));
			setLrclibSearchMeta({
				success: candidates.length > 0,
				totalResults: candidates.length,
				selectedCandidateKey: candidates[0]?.candidateKey || null,
				selectedSource: 'manual',
				searchMode: 'manual',
				manualQuery: query,
				error: candidates.length > 0 ? null : (i18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')
			});
			setShowLrclibCandidates(true);
		} catch (e) {
			if (!request.isCurrent()) return;
			logger.error('[SyncDataCreator] Failed to search LRCLIB:', e);
			setLrclibCandidates([]);
			setPreviewLrclibCandidateKey('');
			setLrclibSearchMeta({
				success: false,
				totalResults: 0,
				selectedCandidateKey: null,
				selectedSource: 'manual',
				searchMode: 'manual',
				manualQuery: query,
				error: (i18n.t('syncCreator.lrclibSearchError') || 'Failed to search LRCLIB') + ': ' + e.message
			});
			setShowLrclibCandidates(true);
		} finally {
			request.finish();
		}
	}, [
		buildLrclibSearchCandidate, lrclibSearchQuery, searchLrclibRecords, searchRequests, i18n, toast, logger,
		setError, setLrclibCandidates, setLrclibSearchMeta, setPreviewLrclibCandidateKey,
		setSelectedLrclibCandidateKey, setShowLrclibCandidates,
	]);

	// Authoring uses the official LRCLIB entry so submitted timings have a stable source.
	const loadLyrics = useCallback(async () => {
		const sourceChangeRequestId = beginSyncCreatorSourceChange();
		if (sourceChangeRequestId === null) return;
		const ownsCandidates = searchRequests.captureCandidates();
		const recoverDraft = captureOfflineDraftRecovery?.(sourceChangeRequestId);
		resetSyncCreatorLyricsLoadingState({ resetProvider: true });
		clearLrclibCandidateState();

		let loadError = null;
		let rankedCandidates = null;
		try {
			let result = null;
			const info = {
				uri: trackUri,
				title: trackName,
				name: trackName,
				artist: primaryArtist,
				album: albumName,
				duration: trackDurationMs,
				lrclibOfficialOnly: true,
				// The addon restores a published sync's stored LRCLIB id before it
				// searches metadata. Give it the ISRC the editor already resolved,
				// so it looks up the same published sync as the editor itself.
				isrc: trackIsrc || undefined
			};
			const lyricsAddonManager = getLyricsAddonManager();
			const lrclibAddon = lyricsAddonManager?.getAddon?.(SYNC_CREATOR_SOURCE_ADDON_ID);
			debug?.('[SyncDataCreator] Trying fixed provider:', SYNC_CREATOR_SOURCE_ADDON_ID);

			if (typeof lrclibAddon?.searchCandidates === 'function') {
				const searchResult = await lrclibAddon.searchCandidates(info, { signal: getSourceSignal(sourceChangeRequestId) });
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
				if (!searchResult?.success) {
					throw new Error(searchResult?.error || 'No lyrics found');
				}

				const candidates = Array.isArray(searchResult.candidates) ? searchResult.candidates : [];
				const selectedCandidate = candidates.find(candidate => candidate.candidateKey === searchResult.selectedCandidateKey)
					|| candidates[0]
					|| null;
				if (!selectedCandidate) throw new Error('No ranked LRCLIB candidates');

				rankedCandidates = { candidates, selectedCandidate, searchResult };
				result = buildSyntheticLrclibResult(selectedCandidate);
			} else if (lyricsAddonManager?.getLyricsFrom) {
				result = await lyricsAddonManager.getLyricsFrom(SYNC_CREATOR_SOURCE_ADDON_ID, info);
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			} else {
				const legacyProviders = getLegacyProviders();
				if (!legacyProviders?.[SYNC_CREATOR_SOURCE_ADDON_ID]) throw new Error('LRCLIB provider is unavailable');
				result = await legacyProviders[SYNC_CREATOR_SOURCE_ADDON_ID](info);
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			}

			if (result?.error) throw new Error(result.error);

			if (result?.synced?.length || result?.unsynced?.length) {
				const applied = await applyLoadedLyricsResult(result, SYNC_CREATOR_SOURCE_ADDON_ID, sourceChangeRequestId);
				if (applied && rankedCandidates && ownsCandidates() && isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) {
					const { candidates, selectedCandidate, searchResult } = rankedCandidates;
					setLrclibCandidates(candidates);
					setSelectedLrclibCandidateKey(selectedCandidate.candidateKey);
					setPreviewLrclibCandidateKey(selectedCandidate.candidateKey);
					setLrclibSearchMeta(searchResult);
					setShowLrclibCandidates(true);
				}
			} else {
				if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
				loadError = i18n.t('syncCreator.noLyrics');
			}
		} catch (e) {
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			logger.error('[SyncDataCreator] Load lyrics error:', e);
			loadError = i18n.t('syncCreator.loadError');
		}

		if (loadError) {
			const restored = await recoverDraft?.();
			if (!isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) return;
			if (restored) return;
			setError(loadError);
		}

		if (isCurrentSyncCreatorSourceChange(sourceChangeRequestId)) {
			// The LRCLIB ID box suggests the id of the lyrics the app is currently
			// showing (official LRCLIB only), so one "Load by ID" switches to them.
			// The metadata search above is unaffected and a typed id is kept.
			const prefillLrclibId = resolveSyncCreatorLoadedLyricsLrclibId(trackUri);
			if (prefillLrclibId && !lrclibIdInputEditedRef.current) setLrclibIdInput(prefillLrclibId);
			setIsLoading(false);
		}
	}, [
		applyLoadedLyricsResult,
		albumName,
		beginSyncCreatorSourceChange,
		captureOfflineDraftRecovery,
		clearLrclibCandidateState,
		isCurrentSyncCreatorSourceChange, debug, getLegacyProviders, getLyricsAddonManager, getSourceSignal, i18n, logger, primaryArtist,
		resolveSyncCreatorLoadedLyricsLrclibId, resetSyncCreatorLyricsLoadingState, lrclibIdInputEditedRef,
		searchRequests,
		setError, setIsLoading, setLrclibIdInput, setLrclibCandidates, setPreviewLrclibCandidateKey,
		setSelectedLrclibCandidateKey, setLrclibSearchMeta, setShowLrclibCandidates,
		trackDurationMs,
		trackIsrc,
		trackName,
		trackUri
	]);

	return { loadLyrics, applySelectedLrclibCandidate, loadLrclibById, prepareLrclibSourceForImport, searchLrclibByQuery };
}
