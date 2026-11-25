import { getSyncCreatorLrclibTextShape } from "./lrclibSyncSource.mjs";
import { attachSyncCreatorLrclibSource, getSyncCreatorLrclibCandidateVariants } from "./syncCreatorLrclibLyrics.mjs";
export function getSyncCreatorLrclibCandidateId(candidate) {
	const id = candidate?.id ?? candidate?.lrclibId;
	if (id === undefined || id === null) return '';
	return String(id).trim();
}

export async function copySyncCreatorLrclibCandidateId(candidateOrId, event, { writeClipboardText, i18n, toast }) {
	event?.preventDefault?.();
	event?.stopPropagation?.();

	const id = typeof candidateOrId === 'object'
		? getSyncCreatorLrclibCandidateId(candidateOrId)
		: String(candidateOrId || '').trim();
	if (!id) return;

	try {
		await writeClipboardText(id);
		toast.success(i18n.t('syncCreator.lrclibIdCopied') || 'Copied LRCLIB ID');
	} catch (err) {
		console.error('[SyncDataCreator] LRCLIB ID copy error:', err);
		toast.error((i18n.t('syncCreator.copyError') || 'Copy failed') + ': ' + err.message);
	}
}

export function pickSyncCreatorLrclibPreview(lrclibCandidates, previewLrclibCandidateKey, selectedLrclibCandidateKey) {
	if (!lrclibCandidates.length) return null;
	return lrclibCandidates.find(candidate => candidate.candidateKey === previewLrclibCandidateKey)
		|| lrclibCandidates.find(candidate => candidate.candidateKey === selectedLrclibCandidateKey)
		|| lrclibCandidates[0]
		|| null;
}

export function useSyncCreatorLrclibQuery({
	react: { useCallback, useEffect, useRef },
	track: { trackId, trackUri, trackIsrc, trackName, artistName },
	isLoading, isSearchingLrclib, lrclibCandidates, lrclibSearchQuery, lyricsText, syncData, setLrclibSearchQuery,
}) {
	const lrclibSearchAutoPrefillRef = useRef({ trackKey: '', appliedQuery: '' });
	const lrclibSearchUserTouchedRef = useRef('');
	const lrclibSearchLastTrackKeyRef = useRef('');
	const trackKey = trackId || trackUri || trackIsrc || `${trackName}::${artistName}`;
	// Prefill the manual LRCLIB search box with "title artist" (Format A) only
	// when the track has no sync to work with. Never triggers a search; the
	// initial loadLyrics() result is always used first. The text is just an
	// editable backup for Spotify/LRCLIB title mismatches.
	useEffect(() => {
		if (isLoading || isSearchingLrclib) return;
		if (!trackKey) return;
		// Track switched: never leak the previous track's query. Clear stale
		// text (auto-prefilled or user-typed) when the new track is untouched.
		if (lrclibSearchLastTrackKeyRef.current && lrclibSearchLastTrackKeyRef.current !== trackKey) {
			lrclibSearchAutoPrefillRef.current = { trackKey: '', appliedQuery: '' };
			if (lrclibSearchUserTouchedRef.current !== trackKey && String(lrclibSearchQuery || '').trim()) {
				setLrclibSearchQuery('');
				lrclibSearchLastTrackKeyRef.current = trackKey;
				return;
			}
		}
		lrclibSearchLastTrackKeyRef.current = trackKey;
		if (lrclibSearchUserTouchedRef.current === trackKey) return;
		const hasResults = (Array.isArray(syncData?.lines) && syncData.lines.length > 0)
			|| String(lyricsText || '').trim().length > 0
			|| (Array.isArray(lrclibCandidates) && lrclibCandidates.length > 0);
		if (lrclibSearchAutoPrefillRef.current.trackKey === trackKey) {
			// If our prefill is showing but sync/lyrics have since arrived,
			// withdraw it so tracks with sync keep an empty box.
			if (hasResults
				&& String(lrclibSearchQuery || '') === String(lrclibSearchAutoPrefillRef.current.appliedQuery || '')) {
				lrclibSearchAutoPrefillRef.current = { trackKey, appliedQuery: '' };
				setLrclibSearchQuery('');
			}
			return;
		}
		if (String(lrclibSearchQuery || '').trim()) return;
		if (hasResults) return;
		const fallbackQuery = `${trackName} ${artistName}`.trim();
		if (!fallbackQuery) return;
		lrclibSearchAutoPrefillRef.current = { trackKey, appliedQuery: fallbackQuery };
		setLrclibSearchQuery(fallbackQuery);
	}, [artistName, isLoading, isSearchingLrclib, lrclibCandidates, lrclibSearchQuery, lyricsText, syncData, trackName, trackKey, setLrclibSearchQuery]);

	return useCallback((query) => {
		lrclibSearchUserTouchedRef.current = trackKey;
		setLrclibSearchQuery(query);
	}, [setLrclibSearchQuery, trackKey]);
}

export function useSyncCreatorLrclibAutoCollapse({ react: { useEffect, useRef }, syncData, setShowLrclibCandidates }) {
	// Minimize the LRCLIB selector once sync data exists. Collapses a single
	// time per empty -> synced transition so a manual re-expand is respected
	// until the sync is cleared (reset, source change) and rebuilt.
	const lrclibAutoCollapseRef = useRef(false);
	useEffect(() => {
		const syncedLineCount = Array.isArray(syncData?.lines) ? syncData.lines.length : 0;
		if (syncedLineCount === 0) {
			lrclibAutoCollapseRef.current = false;
			return;
		}
		if (!lrclibAutoCollapseRef.current) {
			lrclibAutoCollapseRef.current = true;
			setShowLrclibCandidates(false);
		}
	}, [syncData, setShowLrclibCandidates]);
}

export function useSyncCreatorLrclibSnapshotSource({
	react: { useMemo, useCallback },
	lyricsText, lyrics, lyricsFullTextChars, lrclibCandidates, selectedLrclibCandidateKey,
	providerRef, selectedLrclibSourceRef, sanitizeSyncCreatorSyncData,
}) {
	// Shape of the shown lyrics and the versions of each loaded LRCLIB entry
	// that match them, computed once per text rather than on every snapshot.
	const lyricsTextLrclibShape = useMemo(() => getSyncCreatorLrclibTextShape(lyricsText), [lyricsText]);
	const lrclibCandidateVariantsForLyrics = useMemo(
		() => getSyncCreatorLrclibCandidateVariants(lrclibCandidates, lyricsTextLrclibShape),
		[lrclibCandidates, lyricsTextLrclibShape],
	);
	const attachSelectedLrclibSource = useCallback((data) => {
		const sanitized = sanitizeSyncCreatorSyncData(data, lyricsFullTextChars);
		if (!sanitized) return sanitized;
		return attachSyncCreatorLrclibSource(sanitized, {
			provider: providerRef.current,
			currentLrclibSource: selectedLrclibSourceRef.current,
			loadedLrclibSource: lyrics?.lrclibSource,
			loadedId: lyrics?.lrclibId,
			lrclibCandidates, lrclibCandidateVariantsForLyrics, lyricsTextLrclibShape, selectedLrclibCandidateKey,
		});
	}, [lrclibCandidates, lrclibCandidateVariantsForLyrics, lyrics, lyricsFullTextChars, lyricsTextLrclibShape, selectedLrclibCandidateKey]);
	return { lyricsTextLrclibShape, attachSelectedLrclibSource };
}
