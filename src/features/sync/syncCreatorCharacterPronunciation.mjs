import {
	hasSyncCreatorCharacterPronunciation, isSyncCreatorCharacterPronunciationCompatible,
} from './syncCreatorPronunciationReadings.mjs';

const SYNC_CREATOR_PRONUNCIATION_TARGET_STORAGE_KEY = 'ivLyrics:syncCreator:pronunciation-target-mode';
const SYNC_CREATOR_PRONUNCIATION_TARGET_MODES = new Set(['latin', 'translation']);
export const SYNC_CREATOR_CHARACTER_PRONUNCIATION_CONSENT_KEY = 'ivLyrics:syncCreator:character-pronunciation-token-consent:v1';

const normalizeSyncCreatorPronunciationTargetMode = (value) => {
	const normalized = String(value || '').trim().toLowerCase();
	return SYNC_CREATOR_PRONUNCIATION_TARGET_MODES.has(normalized) ? normalized : 'latin';
};

export function createSyncCreatorPronunciationConsent({ getPersistence, getSpotifyStorage, getLocalStorage }) {
	let acceptedThisSession = false;
	const hasConsent = () => {
		if (acceptedThisSession) return true;
		const readers = [
			() => getPersistence()?.getItem?.(SYNC_CREATOR_CHARACTER_PRONUNCIATION_CONSENT_KEY),
			() => getSpotifyStorage()?.get?.(SYNC_CREATOR_CHARACTER_PRONUNCIATION_CONSENT_KEY),
			() => getLocalStorage()?.getItem?.(SYNC_CREATOR_CHARACTER_PRONUNCIATION_CONSENT_KEY)
		];
		for (const read of readers) {
			try {
				const value = read();
				if (value === 'true' || value === '1') {
					acceptedThisSession = true;
					return true;
				}
			} catch (_) {
				// A blocked storage backend must not prevent the other backends from reading.
			}
		}
		return false;
	};
	const rememberConsent = () => {
		// Called only by the explicit confirmation action, never by cancel or dismiss.
		// Keep the choice for this session even if persistent storage is unavailable.
		acceptedThisSession = true;
		const backends = [getPersistence(), getSpotifyStorage()];
		try { backends.push(getLocalStorage()); } catch (_) { /* Storage can be blocked. */ }
		for (const backend of backends) {
			try {
				const write = backend?.setItem || backend?.set;
				if (typeof write !== 'function') continue;
				write.call(backend, SYNC_CREATOR_CHARACTER_PRONUNCIATION_CONSENT_KEY, 'true');
				return;
			} catch (_) {
				// Try the next backend; the current session still remembers the choice.
			}
		}
	};
	return { hasConsent, rememberConsent };
}

const getSyncCreatorCharacterPronunciationProgressInfo = (progress, i18n) => {
	if (!progress) return null;

	const total = Math.max(0, Number(progress.total) || 0);
	const completed = Math.max(0, Math.min(total, Number(progress.completed) || 0));
	const current = total > 0
		? Math.max(1, Math.min(total, Number(progress.current) || completed || 1))
		: 0;
	const remaining = total > 0
		? Math.max(0, Number.isFinite(Number(progress.remaining)) ? Number(progress.remaining) : total - completed)
		: 0;
	const percent = total > 0
		? Math.max(0, Math.min(100, Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : Math.round((completed / total) * 100)))
		: 0;

	if (progress.phase === 'retry-split') {
		const detail = Number.isInteger(progress.lineIndex) && Number.isInteger(progress.got) && Number.isInteger(progress.expected)
			? ` (line ${progress.lineIndex}: got ${progress.got}, need ${progress.expected})`
			: '';
		return {
			percent,
			buttonLabel: total > 0 ? `${current}/${total} (${percent}%)` : (i18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...'),
			label: progress.reason === 'format'
				? (i18n.t('syncCreator.characterPronunciationProgressRetryFormat') || 'Invalid AI alignment. Retrying with smaller chunks...') + detail
				: (i18n.t('syncCreator.characterPronunciationProgressRetry') || 'Response was truncated. Splitting this chunk smaller...') + detail
		};
	}

	if (progress.phase === 'chunk-error' || progress.phase === 'provider-error') {
		return {
			percent,
			buttonLabel: total > 0 ? `${current}/${total} (${percent}%)` : (i18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...'),
			label: progress.error || i18n.t('syncCreator.characterPronunciationProgressError') || 'AI pronunciation generation failed. Trying fallback...'
		};
	}

	if (total > 0) {
		return {
			percent,
			buttonLabel: `${current}/${total} (${percent}%)`,
			label: i18n.t('syncCreator.characterPronunciationProgress', {
				current,
				total,
				percent,
				remaining
			}) || `${current}/${total} chunks - ${percent}% - ${remaining} left`
		};
	}

	return {
		percent,
		buttonLabel: i18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...',
		label: i18n.t('syncCreator.characterPronunciationProgressPreparing') || 'Preparing pronunciation generation...'
	};
};

export function useSyncCreatorCharacterPronunciation({
	react, i18n, toast, getStorage, getAiManager, getTranslationTargetLanguage, consentStore, draftStore,
	track: { id: trackId, title: trackName, artist: artistName, key: sessionTrackKey },
	lyricsLines, lyricsLanguage, lyricsFingerprint: sessionLyricsFingerprint,
}) {
	const { useState, useRef, useMemo, useEffect, useCallback } = react;
	const [characterPronunciations, setCharacterPronunciations] = useState(null);
	const [showCharacterPronunciations, setShowCharacterPronunciations] = useState(false);
	const [isCharacterPronunciationPrimary, setIsCharacterPronunciationPrimary] = useState(false);
	const [characterPronunciationTargetMode, setCharacterPronunciationTargetMode] = useState(() => (
		normalizeSyncCreatorPronunciationTargetMode(
			getStorage().getItem(SYNC_CREATOR_PRONUNCIATION_TARGET_STORAGE_KEY)
		)
	));
	const [isGeneratingCharacterPronunciations, setIsGeneratingCharacterPronunciations] = useState(false);
	const [characterPronunciationProgress, setCharacterPronunciationProgress] = useState(null);
	const [showCharacterPronunciationConsent, setShowCharacterPronunciationConsent] = useState(false);
	const characterPronunciationCacheRequestRef = useRef(0);
	const characterPronunciationGenerationRequestRef = useRef(0);
	const characterPronunciationProgressOwnerRef = useRef(0);
	const characterPronunciationConsentForceRef = useRef(false);

	const characterPronunciationTargetLanguage = characterPronunciationTargetMode === 'translation'
		? getTranslationTargetLanguage() : 'en';
	const handleCharacterPronunciationTargetModeChange = useCallback((nextMode) => {
		const normalizedMode = normalizeSyncCreatorPronunciationTargetMode(nextMode);
		getStorage().setItem(SYNC_CREATOR_PRONUNCIATION_TARGET_STORAGE_KEY, normalizedMode);
		setCharacterPronunciationTargetMode(normalizedMode);
	}, [getStorage]);
	const characterPronunciationCacheOptions = useMemo(() => ({
		trackKey: sessionTrackKey,
		lyricsFingerprint: sessionLyricsFingerprint,
		sourceLang: lyricsLanguage || 'auto',
		targetLang: characterPronunciationTargetLanguage
	}), [
		characterPronunciationTargetLanguage,
		lyricsLanguage,
		sessionLyricsFingerprint,
		sessionTrackKey
	]);
	const readCachedCharacterPronunciation = useCallback(async () => {
		if (
			!lyricsLines.length
			|| typeof draftStore?.getCharacterPronunciationCache !== 'function'
		) return null;

		try {
			const cached = await draftStore.getCharacterPronunciationCache(
				characterPronunciationCacheOptions
			);
			return isSyncCreatorCharacterPronunciationCompatible(cached, lyricsLines)
				? cached
				: null;
		} catch (error) {
			console.warn('[SyncDataCreator] Failed to load cached character pronunciation:', error);
			return null;
		}
	}, [characterPronunciationCacheOptions, lyricsLines, draftStore]);

	useEffect(() => {
		const cacheRequestId = ++characterPronunciationCacheRequestRef.current;
		const previousGenerationRequestId = characterPronunciationGenerationRequestRef.current;
		characterPronunciationGenerationRequestRef.current = previousGenerationRequestId + 1;
		if (
			previousGenerationRequestId > 0
			&& characterPronunciationProgressOwnerRef.current === previousGenerationRequestId
		) {
			characterPronunciationProgressOwnerRef.current = 0;
			toast.dismissProgress?.();
		}
		setCharacterPronunciations(null);
		setShowCharacterPronunciations(false);
		setIsGeneratingCharacterPronunciations(false);
		setCharacterPronunciationProgress(null);

		let cancelled = false;
		readCachedCharacterPronunciation().then((cached) => {
			if (
				cancelled
				|| cacheRequestId !== characterPronunciationCacheRequestRef.current
				|| !cached
			) return;
			setCharacterPronunciations(cached);
			setShowCharacterPronunciations(true);
		});

		return () => {
			cancelled = true;
			if (characterPronunciationCacheRequestRef.current === cacheRequestId) {
				characterPronunciationCacheRequestRef.current += 1;
			}
		};
	}, [readCachedCharacterPronunciation, toast]);

	const handleCharacterPronunciationToggle = useCallback(async (options = {}) => {
		const forceRegenerate = options?.forceRegenerate === true;
		if (
			!forceRegenerate
			&& characterPronunciations
			&& isSyncCreatorCharacterPronunciationCompatible(characterPronunciations, lyricsLines)
		) {
			setShowCharacterPronunciations(value => !value);
			return;
		}

		if (!lyricsLines.length) {
			return;
		}

		if (!forceRegenerate) {
			const cachedPronunciation = await readCachedCharacterPronunciation();
			if (cachedPronunciation) {
				setCharacterPronunciations(cachedPronunciation);
				setShowCharacterPronunciations(true);
				return;
			}
		}

		const manager = getAiManager();
		if (typeof manager?.generateCharacterPronunciation !== 'function') {
			toast.error(i18n.t('syncCreator.characterPronunciationNoProvider') || 'No AI provider supports character-level pronunciation.');
			return;
		}

		if (options?.skipConsent !== true && !consentStore.hasConsent()) {
			characterPronunciationConsentForceRef.current = forceRegenerate;
			setShowCharacterPronunciationConsent(true);
			return;
		}
		characterPronunciationConsentForceRef.current = false;

		const generationRequestId = ++characterPronunciationGenerationRequestRef.current;
		characterPronunciationProgressOwnerRef.current = generationRequestId;
		setIsGeneratingCharacterPronunciations(true);
		setCharacterPronunciationProgress({
			phase: 'prepared',
			total: 0,
			current: 0,
			completed: 0,
			remaining: 0,
			percent: 0
		});
		toast.progress?.(
			i18n.t('syncCreator.characterPronunciationProgressPreparing') || 'Preparing pronunciation generation...',
			0
		);

		try {
			const handleProgress = (progress) => {
				if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;
				const nextProgress = progress || null;
				setCharacterPronunciationProgress(nextProgress);
				const progressInfo = getSyncCreatorCharacterPronunciationProgressInfo(nextProgress, i18n);
				if (progressInfo) {
					toast.progress?.(progressInfo.label, progressInfo.percent);
				}
			};
			const result = await manager.generateCharacterPronunciation({
				trackId,
				title: trackName,
				artist: artistName,
				lines: lyricsLines,
				sourceLang: characterPronunciationCacheOptions.sourceLang,
				lang: characterPronunciationCacheOptions.targetLang,
				onProgress: handleProgress
			});
			if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;
			if (!isSyncCreatorCharacterPronunciationCompatible(result, lyricsLines)) {
				throw new Error('Generated character pronunciation does not match the current lyrics.');
			}
			const hasAnyPronunciation = hasSyncCreatorCharacterPronunciation(result);

			setCharacterPronunciations(result);
			setShowCharacterPronunciations(true);
			if (typeof draftStore?.setCharacterPronunciationCache === 'function') {
				try {
					await draftStore.setCharacterPronunciationCache(
						characterPronunciationCacheOptions,
						result
					);
				} catch (cacheError) {
					console.warn('[SyncDataCreator] Failed to cache character pronunciation:', cacheError);
				}
			}
			if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;

			if (hasAnyPronunciation) {
				toast.success(i18n.t('syncCreator.characterPronunciationGenerated') || 'Generated AI character pronunciation.');
			} else {
				toast.warning(i18n.t('syncCreator.characterPronunciationEmpty') || 'Generated character pronunciation is empty.');
			}
		} catch (e) {
			if (generationRequestId !== characterPronunciationGenerationRequestRef.current) return;
			console.error('[SyncDataCreator] Character pronunciation generation failed:', e);
			toast.error((i18n.t('syncCreator.characterPronunciationError') || 'Failed to generate character pronunciation') + ': ' + (e?.message || e));
		} finally {
			if (generationRequestId === characterPronunciationGenerationRequestRef.current) {
				characterPronunciationProgressOwnerRef.current = 0;
				setIsGeneratingCharacterPronunciations(false);
				setCharacterPronunciationProgress(null);
				toast.dismissProgress?.();
			}
		}
	}, [
		artistName,
		characterPronunciationCacheOptions,
		characterPronunciations,
		consentStore,
		getAiManager,
		i18n,
		lyricsLines,
		readCachedCharacterPronunciation,
		draftStore,
		toast,
		trackId,
		trackName
	]);

	const characterPronunciationProgressInfo = useMemo(
		() => getSyncCreatorCharacterPronunciationProgressInfo(characterPronunciationProgress, i18n),
		[characterPronunciationProgress, i18n]
	);

	const cancelCharacterPronunciationConsent = useCallback(() => {
		characterPronunciationConsentForceRef.current = false;
		setShowCharacterPronunciationConsent(false);
	}, []);
	const confirmCharacterPronunciationConsent = useCallback(() => {
		const forceRegenerate = characterPronunciationConsentForceRef.current;
		consentStore.rememberConsent();
		cancelCharacterPronunciationConsent();
		handleCharacterPronunciationToggle({ skipConsent: true, forceRegenerate });
	}, [consentStore, cancelCharacterPronunciationConsent, handleCharacterPronunciationToggle]);

	return {
		characterPronunciations, showCharacterPronunciations, isCharacterPronunciationPrimary,
		setIsCharacterPronunciationPrimary, characterPronunciationTargetMode, handleCharacterPronunciationTargetModeChange,
		isGeneratingCharacterPronunciations, characterPronunciationProgressInfo, handleCharacterPronunciationToggle,
		showCharacterPronunciationConsent, cancelCharacterPronunciationConsent, confirmCharacterPronunciationConsent,
	};
}
