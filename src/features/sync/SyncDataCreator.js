import { useSyncCreatorRecordingLockControls, useSyncCreatorRecordingLockTiming } from '#ivlyrics/features/sync/syncCreatorRecordingLock.mjs';
import { useSyncCreatorCharacterSelection, useSyncCreatorSelectionReset } from '#ivlyrics/features/sync/syncCreatorCharacterSelection.mjs';
import { useSyncCreatorPointerSelection } from '#ivlyrics/features/sync/syncCreatorPointerSelection.mjs';
import { resolveSyncCreatorTrack } from '#ivlyrics/features/sync/syncCreatorTrack.mjs';
import { getSyncCreatorPlayerForTrack, readSyncCreatorPosition } from '#ivlyrics/features/sync/syncCreatorSeek.mjs';
import { buildSyncCreatorImportedScoreWork, buildSyncCreatorScoreSnapshot, repairSyncCreatorScoreSnapshot } from '#ivlyrics/features/sync/syncCreatorScoreSnapshots.mjs';
import { useSyncCreatorSessionEditor } from '#ivlyrics/features/sync/syncCreatorSessionEditor.mjs';
import { isSyncCreatorDraftTimingCleared } from '#ivlyrics/features/sync/syncCreatorSessionRecord.mjs';
import { useSyncCreatorNavigation } from '#ivlyrics/features/sync/syncCreatorNavigation.mjs';
import { useSyncCreatorVocalEditor } from '#ivlyrics/features/sync/syncCreatorVocalEditor.mjs';
import { useSyncCreatorScoreState, useSyncCreatorScoreObservation } from '#ivlyrics/features/sync/syncCreatorScoreState.mjs';
import { useSyncCreatorLineActions } from '#ivlyrics/features/sync/syncCreatorLineActions.mjs';
import { collectSyncCreatorLineTimes } from '#ivlyrics/features/sync/syncCreatorOffsetTiming.mjs';
import { useSyncCreatorOffsetActions } from '#ivlyrics/features/sync/syncCreatorOffsetActions.mjs';
import { pageLyricsMemoryCache } from '#ivlyrics/lyrics/pageMemoryCache.mjs';
import { createSyncCreatorScoreTracker, GRACE_MS, HEARTBEAT_MS } from '#ivlyrics/features/sync/syncCreatorScoreTracker.mjs';
import { renderSyncCreatorLineGlyphs, useSyncCreatorGlyphLayout } from '#ivlyrics/features/sync/syncCreatorLineGlyphView.mjs';
import { renderSyncCreatorStagePanel } from '#ivlyrics/features/sync/syncCreatorStageView.mjs';
import { renderSyncCreatorParallelPart } from '#ivlyrics/features/sync/syncCreatorParallelPartView.mjs';
import { renderSyncCreatorLineInspector } from '#ivlyrics/features/sync/syncCreatorStyleControls.mjs';
import { renderSyncCreatorCurrentLineTools } from '#ivlyrics/features/sync/syncCreatorCurrentLineTools.mjs';
import { renderSyncCreatorPlaybackPanel, renderSyncCreatorManualSplitEditor } from '#ivlyrics/features/sync/syncCreatorRecordingPanels.mjs';
import { renderSyncCreatorHeader } from '#ivlyrics/features/sync/syncCreatorHeader.mjs';
import {
    getSyncCreatorRecordingHint, renderSyncCreatorProgressPanel, renderSyncCreatorShortcutGuide,
} from '#ivlyrics/features/sync/syncCreatorProgressPanels.mjs';
import { renderSyncCreatorSourcePanel, renderSyncCreatorLrclibCandidates } from '#ivlyrics/features/sync/syncCreatorSourcePanels.mjs';
import {
    copySyncCreatorLrclibCandidateId, useSyncCreatorLrclibQuery, useSyncCreatorLrclibAutoCollapse, useSyncCreatorLrclibSnapshotSource,
} from '#ivlyrics/features/sync/syncCreatorLrclibControls.mjs';
import { useSyncCreatorSessionCheckpoints, useSyncCreatorHistoryNavigation } from '#ivlyrics/features/sync/syncCreatorSessionCheckpoints.mjs';
import { useSyncCreatorSessionPersistence } from '#ivlyrics/features/sync/syncCreatorSessionPersistence.mjs';
import { useSyncCreatorSessionLifecycle } from '#ivlyrics/features/sync/syncCreatorSessionLifecycle.mjs';
import { useSyncCreatorSourceChange } from '#ivlyrics/features/sync/syncCreatorSourceChange.mjs';
import { useSyncCreatorLrclibActions } from '#ivlyrics/features/sync/syncCreatorLrclibActions.mjs';
import { createLrclibSearchRequests } from '#ivlyrics/providers/lyrics/lrclibSearchRequests.mjs';
import { createSyncCreatorLrclibClient } from '#ivlyrics/features/sync/syncCreatorLrclibClient.mjs';
import { useSyncCreatorFurigana } from '#ivlyrics/features/sync/syncCreatorFurigana.mjs';
import { renderSyncCreatorDialogs } from '#ivlyrics/features/sync/syncCreatorDialogs.mjs';
import {
    createSyncCreatorPronunciationConsent, useSyncCreatorCharacterPronunciation,
} from '#ivlyrics/features/sync/syncCreatorCharacterPronunciation.mjs';
import { useSyncCreatorPronunciationReadings } from '#ivlyrics/features/sync/syncCreatorPronunciationReadings.mjs';
import {
    createSyncCreatorVocalLayout, materializeSyncCreatorVocalDrafts,
} from '#ivlyrics/features/sync/syncCreatorVocalLayout.mjs';
import { useSyncCreatorRecordingCommit } from '#ivlyrics/features/sync/syncCreatorRecordingCommit.mjs';
import { createSyncCreatorLastCharEnd } from '#ivlyrics/features/sync/syncCreatorLastCharEnd.mjs';
import {
    SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK, SYNC_CREATOR_DEFAULT_SPEAKER, SYNC_CREATOR_DEFAULT_KIND,
    createSyncCreatorVocalStyles,
} from '#ivlyrics/features/sync/syncCreatorVocalStyles.mjs';
import {
    SYNC_CREATOR_PROGRESS_COLOR, SYNC_CREATOR_PROGRESS_BACKGROUND, SYNC_CREATOR_SYNCED_BACKGROUND,
    TOSS_BORDER, getSyncCreatorStyles,
} from '#ivlyrics/features/sync/syncCreatorStyles.mjs';
import {
    getSyncCreatorLockedPlaybackProgressIndex,
    shouldUseSyncCreatorSelectionEffect,
} from '#ivlyrics/features/sync/selectionTiming.mjs';
import {
    SYNC_CREATOR_DEFAULT_GRANULARITY,
    createSyncCreatorGranularityTools,
    projectTimedUnits,
} from '#ivlyrics/features/sync/timingGranularity.mjs';
import { createSyncCreatorValidation } from '#ivlyrics/features/sync/timingValidation.mjs';
import { createSyncCreatorParallelEditing } from '#ivlyrics/features/sync/parallelTiming.mjs';
import { createSyncCreatorSnapshotTools } from '#ivlyrics/features/sync/syncSnapshot.mjs';
import {
    SYNC_CREATOR_SOURCE_ADDON_ID,
    getSyncCreatorLyricsFingerprintFromText,
} from '#ivlyrics/features/sync/lrclibSyncSource.mjs';

import { createSyncCreatorLyricDocument } from '#ivlyrics/features/sync/syncCreatorLyricText.mjs';
import { useSyncCreatorLineInput } from '#ivlyrics/features/sync/syncCreatorLineInput.mjs';
import { useSyncCreatorLineWorkspace } from '#ivlyrics/features/sync/syncCreatorLineWorkspace.mjs';

import {
    createSyncCreatorPlaybackViews,
    getSyncCreatorCompletedPreviewPercent,
    createSyncCreatorPositionStore,
    useSyncCreatorPlayback,
} from '#ivlyrics/features/sync/syncCreatorPlayback.mjs';

import { createSyncCreatorParallelPreviewTargets, createSyncCreatorPreviewPainting } from '#ivlyrics/features/sync/syncCreatorPreviewPainting.mjs';

import { useSyncCreatorEditorPreview, useSyncCreatorPreviewTiming } from '#ivlyrics/features/sync/syncCreatorEditorPreview.mjs';

import { editorDraftStore } from '#ivlyrics/features/sync/syncCreatorDraftStoreRuntime.mjs';
import { renderSyncCreatorHistoryPanel, useSyncCreatorHistoryResize } from '#ivlyrics/features/sync/syncCreatorHistoryPanel.mjs';

import {
	clearSyncCreatorPublishedCaches, createSyncCreatorPublicationActions, createSyncCreatorPublicationRunner,
} from '#ivlyrics/features/sync/syncCreatorPublication.mjs';
import { createSyncCreatorEditorLifetime } from '#ivlyrics/features/sync/syncCreatorEditorLifetime.mjs';
import { createSyncCreatorEditorCommands } from '#ivlyrics/features/sync/syncCreatorEditorCommands.mjs';
import { createSyncCreatorImportPicker, exportSyncCreatorFile } from '#ivlyrics/features/sync/syncCreatorFileTransfer.mjs';
import { applySyncCreatorImportedSession } from '#ivlyrics/features/sync/syncCreatorSessionReplacement.mjs';
import { useSyncCreatorVisibility } from '#ivlyrics/features/sync/syncCreatorVisibility.mjs';
import { useSyncCreatorLivePreview } from '#ivlyrics/features/sync/syncCreatorLivePreview.mjs';
import { createSyncCreatorCharacterHitTesting } from '#ivlyrics/features/sync/syncCreatorCharacterHitTesting.mjs';
import { createSyncCreatorPointerRecorder } from '#ivlyrics/features/sync/syncCreatorPointerRecorder.mjs';
import { createSyncCreatorKeyboardRecorder } from '#ivlyrics/features/sync/syncCreatorKeyboardRecorder.mjs';
import { stopSyncCreatorKeyboardDrag } from '#ivlyrics/features/sync/syncCreatorKeyboardDrag.mjs';
import { useSyncCreatorRecordingProgress } from '#ivlyrics/features/sync/syncCreatorRecordingProgress.mjs';
import { bindSyncCreatorRecordingShortcuts } from '#ivlyrics/features/sync/syncCreatorRecordingShortcuts.mjs';
import { createSyncCreatorShortcutSettings } from '#ivlyrics/features/sync/syncCreatorShortcutSettings.mjs';

export function createSyncDataCreator({
	react, host: window, spicetify: Spicetify, i18n: I18n, utils: Utils, toast: Toast,
	speakerColors, readVisualSettings, readLyricRenderer, services, getLegacyProviders: getSyncCreatorLegacyProviders,
}) {
	/**
	 * SyncDataCreator - 노래방 싱크 데이터 생성 UI
	 */

	const {
		readSyncCreatorCodec, readSyncCreatorSyncService, getLyricsService, getLrclibTransport,
		getSyncCreatorLyricsAddonManager, getStoragePersistence, getSyncCreatorFuriganaConverter,
		getSyncCreatorPronunciationAiManager, getWordSegmenter, getSpotifyTrackData, debugSyncCreatorSource,
	} = services;

	const syncCreatorVocalStyles = createSyncCreatorVocalStyles({
		getSpeakerColors: () => speakerColors,
		getActiveColor: () => readVisualSettings()?.['active-color'],
		translate: key => I18n.t(key),
	});
	const {
		normalizeSyncCreatorSpeaker,
		normalizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerFallback,
		normalizeSyncCreatorSpeakerColor, getSyncCreatorCustomSpeakerDefaultColor,
		sanitizeSyncCreatorSpeakerColor, resolveSyncCreatorDraftSpeakerMeta,
		isSyncCreatorSpeakerMetaComplete, getSyncCreatorSpeakerTextColor,
		normalizeSyncCreatorKind,
		getSyncCreatorStyleRangeSpeakerMeta,
		normalizeSyncCreatorStyleRanges,
	} = syncCreatorVocalStyles;

	const syncCreatorShortcutSettings = createSyncCreatorShortcutSettings({
		readStoredSetting: settingKey => {
			const key = `ivLyrics:visual:${settingKey}`;
			return localStorage.getItem(key) ?? Spicetify.LocalStorage?.get(key);
		},
		readVisualSetting: settingKey => readVisualSettings()?.[settingKey],
	});

	const syncCreatorLrclibClient = createSyncCreatorLrclibClient({
		getTransport: getLrclibTransport,
		getLyricsSnapshot: uri => getLyricsService()?.getLyricsSnapshot?.(uri),
	});

	const showNoEditableSyncCreatorChars = () => Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
	const getSyncCreatorPlayer = () => Spicetify.Player;
	const getSyncCreatorPlayerItem = () => getSyncCreatorPlayer()?.data?.item;
	const scheduleSyncCreatorPositionPoll = (callback, delay) => setInterval(callback, delay);
	const cancelSyncCreatorPositionPoll = (timer) => clearInterval(timer);

	// Internal editing compatibility view. Persistent/network writers use SyncDataCodec v6.
	const SYNC_CREATOR_SYNC_DATA_VERSION = 5;
	const getSyncCreatorStorage = () => window.localStorage;
	const syncCreatorPronunciationConsent = createSyncCreatorPronunciationConsent({
		getPersistence: getStoragePersistence,
		getSpotifyStorage: () => Spicetify?.LocalStorage,
		getLocalStorage: getSyncCreatorStorage,
	});
	const parseSyncCreatorFuriganaMapping = ruby => Utils?.parseFuriganaMapping?.(ruby);
	const renderSyncCreatorRuby = ruby => Utils?.rubyTextToReact?.(ruby);
	const scheduleSyncCreatorRecordingFrame = callback => typeof requestAnimationFrame === 'function'
		? requestAnimationFrame(callback)
		: setTimeout(() => callback(Date.now()), 16);
	const cancelSyncCreatorRecordingFrame = id => typeof cancelAnimationFrame === 'function'
		? cancelAnimationFrame(id)
		: clearTimeout(id);
	const scheduleSyncCreatorHistoryFrame = (callback) => window.requestAnimationFrame(callback);
	const getSyncCreatorUiLanguage = () => (
		I18n.getCurrentLanguage?.()
		|| readVisualSettings()?.language
		|| Spicetify.Locale?.getLocale?.()?.split('-')[0]
		|| navigator.language?.split('-')[0]
		|| 'en'
	);
	const getSyncCreatorTranslationTargetLanguage = () => {
		const configuredLanguage = readVisualSettings()?.['translate:target-language']
			|| localStorage.getItem('ivLyrics:visual:translate:target-language');
		if (configuredLanguage && configuredLanguage !== 'auto') {
			return configuredLanguage;
		}
		return getSyncCreatorUiLanguage();
	};
	const {
		getSyncCreatorWordRanges,
		getSyncCreatorGranularityRanges,
		collapseSyncCreatorTimesByGranularity,
	} = createSyncCreatorGranularityTools(getWordSegmenter);

	const projectSyncCreatorUnitLayout = (source, target) => projectTimedUnits(source, target, readSyncCreatorCodec);

	const { getSyncCreatorSyncDataValidationError, assertValidSyncCreatorSyncData } = createSyncCreatorValidation({
		prepareSyncCreatorWorkSnapshot: (data) => prepareSyncCreatorWorkSnapshot(data),
		getSyncCreatorStyleRangeSpeakerMeta: (range) => getSyncCreatorStyleRangeSpeakerMeta(range),
		normalizeSyncCreatorKind: (kind) => normalizeSyncCreatorKind(kind),
	});

	const {
		rejoinSyncCreatorParallelLine,
		getSyncCreatorRejoinedLineChars,
		inheritSyncCreatorParallelPartChars,
		refreshSyncCreatorLineCharsFromParallel,
		resolveSyncCreatorParallelTemplateParts,
		sliceSyncCreatorLineTiming,
		clipSyncCreatorLineToBounds,
		clipSyncCreatorSyncDataToLineBounds,
	} = createSyncCreatorParallelEditing({
		getSyncCreatorSyncDataValidationError,
		projectSyncCreatorUnitLayout,
	});

	const { prepareSyncCreatorWorkSnapshot, hasSyncCreatorUnsubmittedChanges } = createSyncCreatorSnapshotTools({
		refreshSyncCreatorLineCharsFromParallel,
		getCodec: readSyncCreatorCodec,
		defaultKind: SYNC_CREATOR_DEFAULT_KIND,
		defaultSpeaker: SYNC_CREATOR_DEFAULT_SPEAKER,
		normalizeSyncCreatorKind: (kind) => normalizeSyncCreatorKind(kind),
		normalizeSyncCreatorSpeaker: (speaker) => normalizeSyncCreatorSpeaker(speaker),
		normalizeSyncCreatorSpeakerColor: (color) => normalizeSyncCreatorSpeakerColor(color),
		normalizeSyncCreatorSpeakerFallback: (fallback) => normalizeSyncCreatorSpeakerFallback(fallback),
	});

	const getSyncCreatorProgressGradient = (
		direction,
		percent,
		color = SYNC_CREATOR_PROGRESS_COLOR,
		inactiveColor = 'var(--spice-subtext)'
	) => (
		`linear-gradient(${direction === 'rtl' ? 'to left' : 'to right'}, ${color} 0%, ${color} ${percent}%, ${inactiveColor} ${percent}%, ${inactiveColor} 100%)`
	);
	const syncCreatorPreviewPainting = createSyncCreatorPreviewPainting({
	    progressBackground: SYNC_CREATOR_PROGRESS_BACKGROUND,
	    syncedBackground: SYNC_CREATOR_SYNCED_BACKGROUND,
	    getProgressGradient: getSyncCreatorProgressGradient,
	});

	const syncCreatorVocalLayout = createSyncCreatorVocalLayout({
		getCodec: readSyncCreatorCodec, getSyncCreatorWordRanges, editingVersion: SYNC_CREATOR_SYNC_DATA_VERSION,
		normalizeSyncCreatorSpeaker, normalizeSyncCreatorKind, sanitizeSyncCreatorSpeakerColor,
		sanitizeSyncCreatorSpeakerFallback, normalizeSyncCreatorStyleRanges,
		resolveSyncCreatorParallelTemplateParts, projectSyncCreatorUnitLayout,
	});

	const {
		normalizeSyncCreatorHiddenRanges,
		sanitizeSyncCreatorParallel,
		sanitizeSyncCreatorSyncData,
		compactSyncCreatorSyncData,
		mergeSyncCreatorParallelTemplate,
	} = syncCreatorVocalLayout;

	const SyncDataCreator = ({ trackInfo, initialData, onClose, registerCloseRequest }) => {
		const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } = react;
		const syncCreatorDraftStore = editorDraftStore;

		const getSyncCreatorLineTimes = collectSyncCreatorLineTimes;

		// 상태 관리
		const [provider, setProvider] = useState('');   // 상세 provider (sync-data 매칭용, 예: spotify-MusixMatch)
		const [addonId, setAddonId] = useState(SYNC_CREATOR_SOURCE_ADDON_ID);
		const [lyrics, setLyrics] = useState(null);
		const [lyricsText, setLyricsText] = useState('');
		const [isLoading, setIsLoading] = useState(false);
		const [error, setError] = useState(null);
		const [currentLineIndex, setCurrentLineIndex] = useState(0);
		const [activeParallelPartId, setActiveParallelPartId] = useState('full');
		const pendingParallelNavigationRef = useRef(null);
		const [parallelPartMetaDrafts, setParallelPartMetaDrafts] = useState({});
		const [manualParallelSplitDrafts, setManualParallelSplitDrafts] = useState({});
		const [parentheticalLayoutDrafts, setParentheticalLayoutDrafts] = useState({});
		const [pendingParentheticalLayoutDecision, setPendingParentheticalLayoutDecision] = useState(null);
		const [mergedLineDrafts, setMergedLineDrafts] = useState({});
		const [isParallelSplitCollapsed, setIsParallelSplitCollapsed] = useState(false);
		const [lineMetaDrafts, setLineMetaDrafts] = useState({});
		const [lineStyleDrafts, setLineStyleDrafts] = useState({});
		const [multiVocalMode, setMultiVocalMode] = useState(false);
		const [pendingMultiVocalDecision, setPendingMultiVocalDecision] = useState(null);
		const [syncData, setSyncData] = useState(null);
		const [mode, setMode] = useState('idle');
		// Set synchronously by manual line navigation so the preview polling loop
		// cannot snap the line back before React runs its effect cleanup.
		const manualPreviewExitRef = useRef(false);
		const [syncGranularity, setSyncGranularity] = useState(SYNC_CREATOR_DEFAULT_GRANULARITY);
		const [positionStore] = useState(() => createSyncCreatorPositionStore(0));
		const setPosition = positionStore.set;
		const [isSubmitting, setIsSubmitting] = useState(false);
		const [hasUnsubmittedSync, setHasUnsubmittedSync] = useState(false);
		const [hasPublishedSync, setHasPublishedSync] = useState(false);
		const [isReverting, setIsReverting] = useState(false);
		const [, setRecordingCharIndex] = useState(-1);
		const [recordingLockIndex, setRecordingLockIndex] = useState(-1);
		const [recordingLockRange, setRecordingLockRange] = useState(null);
		const [isDragging, setIsDragging] = useState(false);
		const pointerRecordingRef = useRef(null);
		const pointerGestureRef = useRef(null);
		const suppressNextLockContextMenuRef = useRef(false);
		const clearPointerRecording = useCallback(() => {
			pointerRecordingRef.current = null;
			pointerGestureRef.current = null;
			setIsDragging(false);
		}, []);
		const [globalOffset, setGlobalOffset] = useState(0);
		const [lrclibCandidates, setLrclibCandidates] = useState([]);
		const [selectedLrclibCandidateKey, setSelectedLrclibCandidateKey] = useState('');
		const [selectedLrclibSource, setSelectedLrclibSource] = useState(null);
		const [previewLrclibCandidateKey, setPreviewLrclibCandidateKey] = useState('');
		const [lrclibSearchMeta, setLrclibSearchMeta] = useState(null);
		const [showLrclibCandidates, setShowLrclibCandidates] = useState(true);
		const [lrclibIdInput, setLrclibIdInput] = useState('');
		// True while the LRCLIB ID box holds an id the user typed and has not loaded
		// yet. Neither the prefill nor the loaded-entry mirror overwrites it.
		const lrclibIdInputEditedRef = useRef(false);
		const lrclibIdInputRevisionRef = useRef(0);
		const [isLoadingLrclibId, setIsLoadingLrclibId] = useState(false);
		const [lrclibSearchQuery, setLrclibSearchQuery] = useState('');
		const [isSearchingLrclib, setIsSearchingLrclib] = useState(false);
		const [showBulkCustomSpeakerDialog, setShowBulkCustomSpeakerDialog] = useState(false);
		const [bulkCustomSpeakerFallback, setBulkCustomSpeakerFallback] = useState(SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK);
		const [bulkCustomSpeakerColor, setBulkCustomSpeakerColor] = useState(() => (
			getSyncCreatorCustomSpeakerDefaultColor('CUSTOM', SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK)
		));

		// Refs
		const containerRef = useRef(null);
		const lyricsScrollRef = useRef(null);
		const charTimesRef = useRef([]);
		const charElementsRef = useRef([]);
		const parallelPreviewElementsRef = useRef(new Map());
		const charHitBoxesRef = useRef([]);
		const charScrollMetricsRef = useRef([]);
		const rtlTextRunRef = useRef(null);
		const recordingCharIndexRef = useRef(-1);
		const recordingLockIndexRef = useRef(-1);
		const recordingLockRangeRef = useRef(null);
		const lastPaintedPlaybackIndexRef = useRef(-1);
		const preventNextTrackRef = useRef(false);
		const hasAutoLoadedLyricsRef = useRef(false);
		const pendingPlaybackNavigationRef = useRef(true);
		const providerRef = useRef(provider);
		const selectedLrclibSourceRef = useRef(selectedLrclibSource);
		const customSpeakerMetaMemoryRef = useRef(new Map());
		const serverBaselineSyncDataRef = useRef(null);
		const historyListRef = useRef(null);
		const score = useSyncCreatorScoreState({
			react, containerRef, readSyncCreatorCodec, syncCreatorDraftStore, utils: Utils, i18n: I18n, spicetify: Spicetify,
			document, fetch: (...args) => fetch(...args), schedule: setTimeout, cancel: clearTimeout,
		});
		const {
			scoreTrackerRef, scoreContextRef, scorePendingEffectsRef,
			scoreInputContextRef, scoreInputRef, ensureScoreTracker, captureScoreWork, markScoreTimingInput,
		} = score;

		const {
			state: {
				sessionHistory, sessionHistoryCursorId, sessionHydrationComplete, sessionReadyDraftKey,
				sessionSaveState, lastSessionSavedAt, historyAnnouncement, isRestoringCheckpoint,
				isSessionAutosaveEnabled,
			},
			refs: sessionRefs,
			ui: sessionUi,
			actions: {
				nextSessionClientRevision, claimSessionForLocalEditing, toggleSessionAutosave,
				isCurrentSyncCreatorSourceChange, beginDraftSourceChange,
				syncSessionUiFromRecord, announceHistoryStatus, announceRecoveredSession,
				captureDraftOwnership, deleteActiveSyncCreatorDraft, beginDraftImport, adoptImportedDraftKey, markDraftDirty, flushDraftBeforeClose,
				readSourceDraft, readTrackDrafts,
			},
		} = useSyncCreatorSessionLifecycle({
			react, syncCreatorDraftStore, pendingPlaybackNavigationRef,
			getStorage: getSyncCreatorStorage, cancelTimer: clearTimeout,
			scheduleFrame: scheduleSyncCreatorHistoryFrame, i18n: I18n, toast: Toast,
		});
		const { activeSessionDraftKeyRef, latestSessionRecordRef, sessionWriteGenerationRef, sessionEditorRevisionRef } = sessionRefs;
		const lifetimeRef = useRef(null);
		const lifetime = lifetimeRef.current ??= createSyncCreatorEditorLifetime(() => Boolean(containerRef.current?.isConnected));
		const { isOpen: isEditorOpen, canStartOperation: isRecordingInputOpen } = lifetime;
		const captureEditorDraftOwnership = useCallback(
			() => lifetime.captureOperation(captureDraftOwnership()), [lifetime, captureDraftOwnership],
		);
		const lrclibSearchRequests = useMemo(() => createLrclibSearchRequests({
			isOpen: isEditorOpen, canStart: lifetime.canStartOperation, setPending: setIsSearchingLrclib,
		}), [isEditorOpen, lifetime]);
		useLayoutEffect(() => () => { lrclibSearchRequests.dispose(); }, [lrclibSearchRequests]);
		const runPublication = useMemo(() => createSyncCreatorPublicationRunner({
			isEditorOpen: lifetime.canStartOperation, captureDraftOwnership: captureEditorDraftOwnership,
		}), [lifetime, captureEditorDraftOwnership]);
		const openImportPicker = useMemo(() => createSyncCreatorImportPicker({
			isEditorOpen: lifetime.canStartOperation, captureDraftOwnership: captureEditorDraftOwnership,
		}), [lifetime, captureEditorDraftOwnership]);
		const isCurrentEditorSourceChange = useCallback(id => (
			isEditorOpen() && isCurrentSyncCreatorSourceChange(id)
		), [isCurrentSyncCreatorSourceChange, isEditorOpen]);

		const historyResize = useSyncCreatorHistoryResize({
			react,
			getStorage: getSyncCreatorStorage,
			getResizeObserver: () => globalThis.ResizeObserver,
		});

		const setProviderValue = useCallback((nextProvider = '') => {
			const normalizedProvider = nextProvider || '';
			providerRef.current = normalizedProvider;
			setProvider(normalizedProvider);
		}, []);

		const setSelectedLrclibSourceValue = useCallback((nextSource = null) => {
			const normalizedSource = nextSource || null;
			selectedLrclibSourceRef.current = normalizedSource;
			setSelectedLrclibSource(normalizedSource);
		}, []);

		const { setRecordingLockIndexValue, setRecordingLockRangeValue, clearRecordingLock } = useSyncCreatorRecordingLockControls({
			react, recordingLockIndexRef, recordingLockRangeRef, setRecordingLockIndex, setRecordingLockRange,
		});

		// 트랙 정보
		const {
			trackUri, trackId, trackIsrc, trackName, artistName, primaryArtist, albumName, trackDurationMs, albumArt, sessionTrackKey,
		} = resolveSyncCreatorTrack(trackInfo, {
			getPlayerItem: getSyncCreatorPlayerItem,
			getPlayerDuration: () => getSyncCreatorPlayer()?.getDuration?.(),
			extractTrackId: uri => Utils.extractTrackId(uri),
			getSpotifyTrackData,
			getSyncService: readSyncCreatorSyncService,
		});
		const getEditorPlayer = useCallback(() => getSyncCreatorPlayerForTrack(getSyncCreatorPlayer(), trackUri), [trackUri]);
		const getEditorProgress = useCallback(() => getEditorPlayer()?.getProgress?.(), [getEditorPlayer]);
		const getEditorProgressSeconds = useCallback(() => (readSyncCreatorPosition(getEditorProgress()) ?? NaN) / 1000, [getEditorProgress]);
		const {
			SyncCreatorLivePreviewClock, SyncCreatorPlaybackTime, SyncCreatorPlaybackBar,
			syncCreatorPreviewLiveClock, syncCreatorPreviewUsesLiveClock,
		} = useMemo(() => createSyncCreatorPlaybackViews({
			getReact: () => react, getPlayer: getEditorPlayer, now: () => performance.now(),
			hasAnimationFrame: () => typeof requestAnimationFrame === 'function',
			prefersReducedMotion: () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,
			requestFrame: callback => requestAnimationFrame(callback), cancelFrame: frame => cancelAnimationFrame(frame),
			scheduleTimer: (callback, delay) => setTimeout(callback, delay), cancelTimer: timer => clearTimeout(timer),
		}), [getEditorPlayer]);
		const isVirtualKaraokeSource =
			lyrics?.karaokeSource === 'spotify-audio-analysis' ||
			lyrics?.karaokeSource === 'audio-analysis-pseudo' ||
			lyrics?.karaokeSource === 'line-timing-pseudo';

		const {
			clearLrclibCandidateState, beginSyncCreatorSourceChange, applyLoadedLyricsResult, captureOfflineDraftRecovery,
			resolveMultiVocalDecision, previewLrclibCandidate, resetSyncCreatorLyricsLoadingState, prepareImportedLyricsSource, readPublishedSync,
		} = useSyncCreatorSourceChange({
			react, i18n: I18n, toast: Toast, canStartOperation: lifetime.canStartOperation,
			track: { trackId, trackIsrc, trackName, artistName, albumName, sessionTrackKey },
			lrclib: {
				lrclibCandidates, previewLrclibCandidateKey, selectedLrclibCandidateKey, lrclibIdInputEditedRef,
				setLrclibCandidates, setSelectedLrclibCandidateKey, setSelectedLrclibSourceValue, setPreviewLrclibCandidateKey,
				setLrclibSearchMeta, setIsLoadingLrclibId, setLrclibIdInput, searchRequests: lrclibSearchRequests,
			},
			editor: {
				pendingMultiVocalDecision, serverBaselineSyncDataRef,
				setManualParallelSplitDrafts, setParentheticalLayoutDrafts, setPendingParentheticalLayoutDecision, setMergedLineDrafts,
				setLyrics, setLyricsText, setSyncData, setProviderValue, setAddonId, setHasPublishedSync,
				setPendingMultiVocalDecision, setMultiVocalMode, setActiveParallelPartId, setError, setIsLoading, setCurrentLineIndex, setMode,
			},
			session: {
				scoreInputRef, scorePendingEffectsRef, beginDraftSourceChange,
				isCurrentSyncCreatorSourceChange: isCurrentEditorSourceChange,
				syncCreatorDraftStore, announceRecoveredSession, sessionEditorRevisionRef, readSourceDraft, readTrackDrafts,
				applySyncCreatorSessionRecord: (...args) => applySyncCreatorSessionRecord(...args),
			},
			services: { readSyncCreatorSyncService, readSyncCreatorCodec, sanitizeSyncCreatorSyncData, debugSyncCreatorSource },
		});

		const { loadLyrics, applySelectedLrclibCandidate, loadLrclibById, prepareLrclibSourceForImport, searchLrclibByQuery } =
			useSyncCreatorLrclibActions({
				react, i18n: I18n, toast: Toast, searchRequests: lrclibSearchRequests,
				track: { trackUri, trackIsrc, trackName, artistName, primaryArtist, albumName, trackDurationMs },
				state: { lyrics, lrclibCandidates, lrclibIdInput, lrclibSearchQuery, lrclibIdInputEditedRef, lrclibIdInputRevisionRef, selectedLrclibSourceRef },
				services: {
					debug: debugSyncCreatorSource,
					getLegacyProviders: getSyncCreatorLegacyProviders, getLyricsAddonManager: getSyncCreatorLyricsAddonManager,
					syncCreatorDraftStore,
				},
				client: syncCreatorLrclibClient,
				sourceChange: {
					applyLoadedLyricsResult, beginSyncCreatorSourceChange, isCurrentSyncCreatorSourceChange: isCurrentEditorSourceChange, readPublishedSync,
					resetSyncCreatorLyricsLoadingState, clearLrclibCandidateState, prepareImportedLyricsSource, captureOfflineDraftRecovery,
				},
				ui: {
					setError, setIsLoading, setIsLoadingLrclibId, setLrclibCandidates, setLrclibIdInput,
					setLrclibSearchMeta, setPreviewLrclibCandidateKey, setSelectedLrclibCandidateKey,
					setSelectedLrclibSourceValue, setShowLrclibCandidates,
				},
			});

		const lyricDocument = useMemo(() => createSyncCreatorLyricDocument(lyricsText), [lyricsText]);
		const { lyricsLines, lyricsFullTextChars, totalChars, lineCharOffsets, lineIndexByStart } = lyricDocument;
		const syncedChars = useMemo(() => {
			if (!syncData || !syncData.lines) return 0;
			return syncData.lines.reduce((sum, line) => sum + (line.chars?.length || 0), 0);
		}, [syncData]);

		const sessionLyricsFingerprint = useMemo(() => (
			syncCreatorDraftStore?.createLyricsFingerprint?.(lyricsText)
				|| getSyncCreatorLyricsFingerprintFromText(lyricsText)
		), [lyricsText, syncCreatorDraftStore]);
		const activeSessionDraftKey = useMemo(() => {
			if (!syncCreatorDraftStore || !sessionTrackKey || !lyricsText || (!provider && !addonId)) return '';
			return syncCreatorDraftStore.createDraftKey({
				trackKey: sessionTrackKey,
				provider,
				addonId,
				lyricsFingerprint: sessionLyricsFingerprint,
				lrclibId: selectedLrclibSource?.lrclibId ?? ''
			});
		}, [
			addonId,
			lyricsText,
			provider,
			selectedLrclibSource?.lrclibId,
			sessionLyricsFingerprint,
			sessionTrackKey,
			syncCreatorDraftStore
		]);
		useLayoutEffect(() => {
			activeSessionDraftKeyRef.current = activeSessionDraftKey;
		}, [activeSessionDraftKey, activeSessionDraftKeyRef]);

		const {
			currentLineStart, currentExistingLineData, getMergedLineIndexesForStart, findMergedOwnerLineIndex,
			isLineCoveredByMergedPrevious, findNavigableLineIndex, currentMergedLineIndexes,
			currentLineMergedWithNext, currentLineCoveredByPrevious, previousNavigableLineIndex, nextNavigableLineIndex,
			currentFullLineChars, currentAutoMergeSplitPoints, currentAutoMergeSplitPointSet, currentNextMergeLineIndex,
			canMergeCurrentLineWithNext, currentLineMeta, currentLineStyleRanges, getParallelTemplateForLineData,
			currentParallelTemplate, currentParallelData, currentParallelParts, hasCurrentParallelParts, activeParallelPart,
			activeParallelTargetId, currentSpeakerTextColor, currentSpeakerMutedColor, currentTextEffectKind,
			textEffectsDisabled, getIncompleteParallelPartId, isCurrentSyncTargetMetaComplete, currentLineCharRefs,
			currentLineChars, completedLines, isCurrentLineSynced,
		} = useSyncCreatorLineWorkspace({
			react, lyricDocument, lyricsText, syncData, currentLineIndex,
			drafts: {
				mergedLineDrafts, lineMetaDrafts, lineStyleDrafts, parallelPartMetaDrafts,
				manualParallelSplitDrafts, parentheticalLayoutDrafts,
			},
			vocalSelection: {
				multiVocalMode, activeParallelPartId, setActiveParallelPartId, pendingParallelNavigationRef,
				pendingMultiVocalDecision, pendingParentheticalLayoutDecision, setPendingParentheticalLayoutDecision,
			},
			readVisualSettings, vocalLayout: syncCreatorVocalLayout, vocalStyles: syncCreatorVocalStyles,
		});
		const currentParallelPreviewTargets = useMemo(() => createSyncCreatorParallelPreviewTargets({
			currentParallelData, currentExistingLineData, currentFullLineChars, currentLineStart,
			getSyncCreatorSpeakerTextColor, elementsRef: parallelPreviewElementsRef,
		}), [currentParallelData, currentExistingLineData, currentFullLineChars, currentLineStart]);
		const showMissingMetaToast = useCallback(() => {
			Toast.error(I18n.t('syncCreator.multiVocalMetaRequired') || 'Select SPEAKER and text effect for the current vocal first.');
		}, []);
		const advanceAfterCompletedTarget = useCallback((lineData) => {
			const nextPartId = getIncompleteParallelPartId(lineData);
			if (nextPartId) {
				setActiveParallelPartId(nextPartId);
				recordingCharIndexRef.current = -1;
				setRecordingCharIndex(-1);
				clearRecordingLock();
				charTimesRef.current = [];
				if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
				return;
			}

			const nextIndex = findNavigableLineIndex(currentLineIndex, 1);
			if (nextIndex >= 0) {
				clearRecordingLock();
				setCurrentLineIndex(nextIndex);
				if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
			}
		}, [getIncompleteParallelPartId, currentLineIndex, findNavigableLineIndex, clearRecordingLock]);
		scoreInputContextRef.current = { key: `${currentLineStart}:${activeParallelTargetId}`, refs: currentLineCharRefs };
		const {
			getCurrentSyncTargetSavedChars, getActiveRecordingLockRange, getActiveRecordingLockIndex,
			buildLockedCharTimes, createRecordingTimeClamp,
		} = useSyncCreatorRecordingLockTiming({
			react, currentLineChars, currentExistingLineData, activeParallelPart, activeParallelTargetId,
			recordingLockRangeRef, recordingLockIndexRef, getSyncCreatorRejoinedLineChars,
		});
		const {
			currentLineText, currentLineDirection, useCurrentLineTextRun, currentLineCodeUnitOffsets, currentLineSyllableSegments,
			lyricsLanguage, currentGranularityRanges, currentWordBoundaryStartIndexes, getGranularityRangeForIndex, getGranularityEndIndex,
		} = useSyncCreatorLineInput({
			react, currentLineChars, lyricsLines, trackName, artistName, utils: Utils, getLyricsService,
			syncGranularity, getSyncCreatorGranularityRanges,
		});
		const isCurrentLineRtl = currentLineDirection === 'rtl';
		const {
			characterPronunciations, showCharacterPronunciations, isCharacterPronunciationPrimary,
			setIsCharacterPronunciationPrimary, characterPronunciationTargetMode, handleCharacterPronunciationTargetModeChange,
			isGeneratingCharacterPronunciations, characterPronunciationProgressInfo, handleCharacterPronunciationToggle,
			showCharacterPronunciationConsent, cancelCharacterPronunciationConsent, confirmCharacterPronunciationConsent,
		} = useSyncCreatorCharacterPronunciation({
			react, i18n: I18n, toast: Toast, getStorage: getSyncCreatorStorage,
			getAiManager: getSyncCreatorPronunciationAiManager, getTranslationTargetLanguage: getSyncCreatorTranslationTargetLanguage,
			consentStore: syncCreatorPronunciationConsent, draftStore: syncCreatorDraftStore,
			track: { id: trackId, title: trackName, artist: artistName, key: sessionTrackKey },
			lyricsLines, lyricsLanguage, lyricsFingerprint: sessionLyricsFingerprint,
		});
		const { getSyncCreatorFuriganaMap, getSyncCreatorFuriganaReact, furiganaRevision } = useSyncCreatorFurigana({
			react, browser: window, lyricsLanguage, lyricsLines,
			getConverter: getSyncCreatorFuriganaConverter, parseMapping: parseSyncCreatorFuriganaMapping, renderRuby: renderSyncCreatorRuby,
		});
		const currentLineFuriganaMap = useMemo(
			() => getSyncCreatorFuriganaMap(currentLineText),
			[getSyncCreatorFuriganaMap, currentLineText]
		);
		const hasCurrentLineFurigana = currentLineFuriganaMap.size > 0;
		const {
			currentLineEffectiveSyllableSegments,
			currentLineCharacterPronunciationMap,
			hasCurrentLineCharacterPronunciation,
			usePrimaryCharacterPronunciation,
			currentLineRenderedPronunciationUnits,
			currentLineRenderedPronunciationUnitByStart,
			currentLineRenderedPronunciationCoveredIndexes,
			currentParallelPartReadingMaps,
			useFixedPrimaryCharacterCells,
		} = useSyncCreatorPronunciationReadings({
			react, lyricsLines, characterPronunciations, showCharacterPronunciations, isCharacterPronunciationPrimary,
			line: {
				index: currentLineIndex, start: currentLineStart, mergedIndexes: currentMergedLineIndexes,
				fullChars: currentFullLineChars, chars: currentLineChars, charRefs: currentLineCharRefs,
				text: currentLineText, syllableSegments: currentLineSyllableSegments,
			},
			vocals: { activePart: activeParallelPart, hasParts: hasCurrentParallelParts, parts: currentParallelParts },
			getFuriganaMap: getSyncCreatorFuriganaMap,
		});
		useSyncCreatorVisibility({ react, containerRef, preventNextTrackRef, trackUri, getPlayer: getSyncCreatorPlayer });

		// 제작기에 진입하면 '다시 로드' 버튼과 같은 LRCLIB 로드 흐름을 한 번 실행한다.
		// ref 가드는 callback 의존성이 갱신되더라도 같은 화면에서 중복 요청하지 않도록 한다.
		useEffect(() => {
			if (hasAutoLoadedLyricsRef.current) return;
			hasAutoLoadedLyricsRef.current = true;
			void loadLyrics();
		}, [loadLyrics]);

		const onLrclibSearchQueryChange = useSyncCreatorLrclibQuery({
			react, track: { trackId, trackUri, trackIsrc, trackName, artistName },
			isLoading, isSearchingLrclib, lrclibCandidates, lrclibSearchQuery, lyricsText, syncData, setLrclibSearchQuery,
		});

		const playbackTimeline = useSyncCreatorPlayback({
			react, lyricsLines, lyricsText, syncData, sourceLines: lyrics?.synced,
			canStartOperation: lifetime.canStartOperation,
			lineIndexByStart, findMergedOwnerLineIndex, mode, currentLineIndex, isLoading, pendingMultiVocalDecision,
			pendingPlaybackNavigationRef, manualPreviewExitRef, getProgress: getEditorProgress,
			setPosition, setCurrentLineIndex, lyricsScrollRef,
			scheduleInterval: scheduleSyncCreatorPositionPoll, cancelInterval: cancelSyncCreatorPositionPoll,
		});

		const { setRecordingProgressIndex, applyRecordingProgressVisual, invalidateRecordingPaint } =
			useSyncCreatorRecordingProgress({
				react, mode,
				line: {
					charCount: currentLineChars.length, currentLineIndex, activeParallelTargetId, lyricsText,
					isCurrentLineRtl, useCurrentLineTextRun, currentLineDirection, currentSpeakerTextColor, currentSpeakerMutedColor,
				},
				refs: {
					lyricsScrollRef, charElementsRef, charScrollMetricsRef, rtlTextRunRef, recordingCharIndexRef,
					lastPaintedPlaybackIndexRef, scoreInputRef, scoreInputContextRef,
				},
				setRecordingCharIndex, getSyncCreatorProgressGradient,
				scheduleFrame: scheduleSyncCreatorRecordingFrame, cancelFrame: cancelSyncCreatorRecordingFrame,
			});

		const { cacheCharHitBoxes, getCharIndexFromPoint } = useMemo(() => createSyncCreatorCharacterHitTesting({
			document, useCurrentLineTextRun, isCurrentLineRtl, charCount: currentLineChars.length,
			codeUnitOffsets: currentLineCodeUnitOffsets,
			refs: { rtlTextRunRef, charElementsRef, charHitBoxesRef, charScrollMetricsRef },
		}), [useCurrentLineTextRun, isCurrentLineRtl, currentLineChars.length, currentLineCodeUnitOffsets]);

		const {
			mergeCurrentLineWithNext, deleteCurrentLineSync,
			currentManualSplitPoints, currentManualSplitPointSet, hasManualParallelSplit, hasManualDraftSplit, resetCurrentLineManualSplit,
			toggleManualParallelSplitPoint, resolveParentheticalLayoutDecision, enableManualMultiVocalMode,
		} = useSyncCreatorLineActions({
			react, toast: Toast, i18n: I18n, editingVersion: SYNC_CREATOR_SYNC_DATA_VERSION,
			canStartOperation: lifetime.canStartOperation,
			song: { lyricDocument, syncData, lineCharOffsets, lyricsLines },
			line: {
				currentLineIndex, currentLineStart, currentFullLineChars, currentExistingLineData, currentMergedLineIndexes,
				currentNextMergeLineIndex, currentLineMergedWithNext, currentAutoMergeSplitPoints, currentAutoMergeSplitPointSet,
				canMergeCurrentLineWithNext,
			},
			vocal: {
				multiVocalMode, pendingParentheticalLayoutDecision, manualParallelSplitDrafts,
				setMultiVocalMode, setActiveParallelPartId, setMergedLineDrafts, setManualParallelSplitDrafts,
				setParentheticalLayoutDrafts, setPendingParentheticalLayoutDecision,
			},
			timing: {
				inheritSyncCreatorParallelPartChars, sliceSyncCreatorLineTiming, normalizeSyncCreatorSpeaker,
				sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorKind,
				normalizeSyncCreatorHiddenRanges, normalizeSyncCreatorStyleRanges, sanitizeSyncCreatorParallel,
			},
			editor: { claimSessionForLocalEditing, setSyncData, setMode },
			recording: { setRecordingProgressIndex, clearRecordingLock, charTimesRef, lyricsScrollRef },
		});

		const commitCurrentLineSync = useSyncCreatorRecordingCommit({
			react, toast: Toast, i18n: I18n, editingVersion: SYNC_CREATOR_SYNC_DATA_VERSION,
			syncData, syncGranularity, lyricsLanguage,
			line: {
				currentLineStart, fullLineCharCount: currentFullLineChars.length, currentLineChars, currentLineCharRefs,
				currentLineMeta, currentLineMetaDraft: lineMetaDrafts[currentLineStart],
				currentLineStyleRanges, currentLineMergedWithNext,
			},
			vocal: {
				activeParallelPart, hasCurrentParallelParts, currentParallelData, currentParallelParts, multiVocalMode,
				activeParallelTargetId, isCurrentSyncTargetMetaComplete, showMissingMetaToast, setActiveParallelPartId,
			},
			recordingLock: { getActiveRecordingLockRange, getCurrentSyncTargetSavedChars },
			score: { scoreInputRef, scorePendingEffectsRef, captureScoreWork },
			timing: {
				collapseSyncCreatorTimesByGranularity, sanitizeSyncCreatorParallel, readSyncCreatorCodec,
				getSyncCreatorWordRanges, projectSyncCreatorUnitLayout, clipSyncCreatorLineToBounds,
			},
			styles: syncCreatorVocalStyles,
			claimSessionForLocalEditing, setSyncData,
		});

		// 키보드 싱크 상태 ref (isDragging과 별개로 키보드용)
		const isKeyboardSyncingRef = useRef(false);
		const keyboardCharIndexRef = useRef(-1);

		const keyboardDragRef = useRef(null);
		const prevKeyboardTargetRef = useRef(null);

		// 동적 보간 모드를 위한 ref
		// pendingWordSync: 이전 단어의 시작 시간과 인덱스 범위를 저장
		// 다음 단어가 탭되면 이전 단어의 글자들에 보간된 시간 적용
		const pendingWordSyncRef = useRef(null);
		const pendingSyllableSyncRef = useRef(null);
		// 단어 내 보간 활성화 여부
		const interpolationEnabledRef = useRef(true);

		const { start: handleDragStart, move: handleDragMove, finish: handleDragEnd, cancel: handleDragCancel } = useMemo(() => createSyncCreatorPointerRecorder({
			target: {
				mode, syncGranularity, canRecordLine: currentLineIndex < lyricsLines.length,
				charCount: currentLineChars.length, getGranularityEndIndex,
			},
			cacheCharHitBoxes,
			refs: {
				charTimesRef, recordingCharIndexRef, charHitBoxesRef, charScrollMetricsRef,
				isKeyboardSyncingRef, keyboardCharIndexRef, keyboardDragRef,
				interpolationEnabledRef, pendingWordSyncRef, pendingSyllableSyncRef, pointerRecordingRef, scoreInputRef,
			},
			lock: {
				getActiveRecordingLockRange, getActiveRecordingLockIndex, buildLockedCharTimes,
				createRecordingTimeClamp, getCurrentSyncTargetSavedChars, clearRecordingLock,
			},
			output: {
				clearPointerRecording, setIsDragging, setRecordingProgressIndex, markScoreTimingInput,
				commitCurrentLineSync, advanceAfterCompletedTarget, showNoEditableChars: showNoEditableSyncCreatorChars,
			},
			getProgressSeconds: getEditorProgressSeconds,
			cancelInterval: clearInterval,
		}), [
			mode, syncGranularity, currentLineIndex, lyricsLines.length, currentLineChars.length, getGranularityEndIndex,
			clearPointerRecording, cacheCharHitBoxes, getActiveRecordingLockRange, getActiveRecordingLockIndex,
			buildLockedCharTimes, createRecordingTimeClamp, getCurrentSyncTargetSavedChars, clearRecordingLock,
			setRecordingProgressIndex, markScoreTimingInput, commitCurrentLineSync, advanceAfterCompletedTarget, getEditorProgressSeconds,
		]);

		const closeEditor = useCallback(() => lifetime.requestClose({
			stopRecording: () => {
				stopSyncCreatorKeyboardDrag(keyboardDragRef, clearInterval);
				if (pointerRecordingRef.current) handleDragCancel();
				else clearPointerRecording();
			},
			saveDraft: flushDraftBeforeClose,
			onSaveError: () => Toast.error(I18n.t('syncCreator.historySaveError')),
			onClosed: () => {
				lrclibSearchRequests.dispose();
				preventNextTrackRef.current = false;
				onClose?.();
			},
		}), [lifetime, clearPointerRecording, flushDraftBeforeClose, handleDragCancel, lrclibSearchRequests, onClose]);
		useLayoutEffect(() => registerCloseRequest?.(closeEditor), [registerCloseRequest, closeEditor]);

		const resetCurrentSyncInput = useCallback(() => {
			stopSyncCreatorKeyboardDrag(keyboardDragRef, clearInterval);
			scoreInputRef.current = null;
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			suppressNextLockContextMenuRef.current = false;
			clearRecordingLock();
			clearPointerRecording();
			setRecordingProgressIndex(-1);
			charHitBoxesRef.current = [];
			charScrollMetricsRef.current = [];
		}, [setRecordingProgressIndex, clearRecordingLock, clearPointerRecording]);

		const {
			offsetSelectionRange, offsetSelectionRangeRef, offsetSelectionTargetRef,
			clearOffsetSelection, clearLyricTextSelection, applyOffsetSelectionRange,
			handleCharacterContextMenu, applyRecordingLockRange,
		} = useSyncCreatorCharacterSelection({
			react, host: window, i18n: I18n, toast: Toast, cancelInterval: clearInterval,
			target: { mode, syncGranularity, currentLineIndex, lyricsLines, currentLineChars, currentLineStart,
				activeParallelTargetId, currentLineText, currentLineCharRefs, isCurrentSyncTargetMetaComplete },
			refs: { suppressNextLockContextMenuRef, isKeyboardSyncingRef, keyboardCharIndexRef, charTimesRef,
				pendingWordSyncRef, pendingSyllableSyncRef, keyboardDragRef },
			actions: { showMissingMetaToast, getGranularityRangeForIndex, clearRecordingLock,
				getCurrentSyncTargetSavedChars, getActiveRecordingLockRange, setRecordingLockRangeValue,
				setRecordingLockIndexValue, buildLockedCharTimes, setRecordingProgressIndex, clearPointerRecording },
		});

		const selectParallelPart = useCallback((partId) => {
			if (!partId) return;
			if (activeParallelTargetId !== partId) {
				claimSessionForLocalEditing();
				resetCurrentSyncInput();
			}
			setActiveParallelPartId(partId);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}, [activeParallelTargetId, claimSessionForLocalEditing, resetCurrentSyncInput]);

		const lastCharEndShortcutRef = useRef(null);
		const keyboardShortcutContextRef = useRef(null);
		// Refresh the recording target before a key or a running interval can use it.
		const recordingLayoutKey = useMemo(() => (
			currentLineCharRefs.map(ref => ref.absoluteIndex).join(',')
		), [currentLineCharRefs]);
		const recordingTarget = useMemo(() => ({
			trackKey: sessionTrackKey, draftKey: activeSessionDraftKey, lyricDocument,
			currentLineIndex, activeParallelTargetId, recordingLayoutKey, mode, syncGranularity,
		}), [sessionTrackKey, activeSessionDraftKey, lyricDocument, currentLineIndex, activeParallelTargetId, recordingLayoutKey, mode, syncGranularity]);
		useLayoutEffect(() => {
			const recorder = createSyncCreatorKeyboardRecorder({
				target: {
					identity: recordingTarget, currentLineChars, currentLineEffectiveSyllableSegments, currentGranularityRanges,
					getWordRanges: () => getSyncCreatorWordRanges(currentLineChars, lyricsLanguage || undefined),
				},
				refs: {
					prevKeyboardTargetRef, scoreInputRef, recordingLockIndexRef,
					isKeyboardSyncingRef, keyboardDragRef, keyboardCharIndexRef, charTimesRef,
					pendingWordSyncRef, pendingSyllableSyncRef, interpolationEnabledRef,
				},
				lock: {
					clearRecordingLock, getActiveRecordingLockRange, getCurrentSyncTargetSavedChars,
					buildLockedCharTimes, createRecordingTimeClamp, getActiveRecordingLockIndex,
				},
				output: {
					setRecordingProgressIndex, commitCurrentLineSync,
					advanceAfterCompletedTarget, markScoreTimingInput,
					showNoEditableChars: showNoEditableSyncCreatorChars,
				},
				getProgressSeconds: getEditorProgressSeconds,
				cancelInterval: clearInterval,
				debug: debugSyncCreatorSource,
			});
			recorder.reconcileTarget();
			keyboardShortcutContextRef.current = {
				recorder, mode, currentLineIndex,
				canRecordCurrentLine: currentLineIndex < lyricsLines.length && currentLineChars.length > 0,
				isCurrentSyncTargetMetaComplete, showMissingMetaToast,
			};
		}, [recordingTarget, mode, currentLineIndex, lyricsLines.length, currentLineChars, currentLineEffectiveSyllableSegments, currentGranularityRanges, commitCurrentLineSync, advanceAfterCompletedTarget, isCurrentSyncTargetMetaComplete, showMissingMetaToast, setRecordingProgressIndex, getActiveRecordingLockIndex, getActiveRecordingLockRange, getCurrentSyncTargetSavedChars, createRecordingTimeClamp, buildLockedCharTimes, clearRecordingLock, lyricsLanguage, getEditorProgressSeconds]);

		useEffect(() => bindSyncCreatorRecordingShortcuts({
			eventTarget: document,
			getRecordingContext: () => isRecordingInputOpen() ? keyboardShortcutContextRef.current : null,
			isPointerRecording: () => !!pointerRecordingRef.current,
			getPlayer: getEditorPlayer,
			settings: syncCreatorShortcutSettings,
			keyboardDragRef,
			scheduleInterval: setInterval,
			cancelInterval: clearInterval,
			editLastCharacterEnd: () => lastCharEndShortcutRef.current?.(),
			debug: debugSyncCreatorSource,
		}), [getEditorPlayer, isRecordingInputOpen]);

		const handleContainerMouseDown = useSyncCreatorPointerSelection({
			react, document, target: recordingTarget, gestureRef: pointerGestureRef, suppressContextMenuRef: suppressNextLockContextMenuRef,
			context: {
				mode, hasLine: currentLineIndex < lyricsLines.length, isEditorOpen: isRecordingInputOpen,
				isCurrentSyncTargetMetaComplete, showMissingMetaToast, getCharIndexFromPoint,
				handleDragStart, handleDragMove, handleDragEnd, handleDragCancel, applyRecordingLockRange, applyOffsetSelectionRange,
			},
		});

		const {
			updateParallelPartMeta, updateCurrentLineMeta, updateCurrentLineStyleRanges, requestSongVocalSpeaker, applyBulkCustomSpeaker,
		} = useSyncCreatorVocalEditor({
			react, styles: syncCreatorVocalStyles, toast: Toast, i18n: I18n,
			syncDataVersion: SYNC_CREATOR_SYNC_DATA_VERSION,
			target: {
				mode, multiVocalMode, currentLineIndex, currentLineStart, currentLineText, currentFullLineChars,
				activeParallelTargetId, currentLineCharRefs, currentLineStyleRanges,
			},
			song: { trackId, lyricsLines, lineCharOffsets, syncData, lineMetaDrafts, parallelPartMetaDrafts },
			bulkSpeaker: {
				bulkCustomSpeakerColor, bulkCustomSpeakerFallback,
				setBulkCustomSpeakerColor, setBulkCustomSpeakerFallback, setShowBulkCustomSpeakerDialog,
			},
			refs: { offsetSelectionRangeRef, offsetSelectionTargetRef, scorePendingEffectsRef, customSpeakerMetaMemoryRef },
			edit: { claimSessionForLocalEditing, setParallelPartMetaDrafts, setLineMetaDrafts, setLineStyleDrafts, setSyncData },
			layout: { isLineCoveredByMergedPrevious, getMergedLineIndexesForStart, getParallelTemplateForLineData },
		});

		const { adjustGlobalOffset, adjustCurrentLineOffset } = useSyncCreatorOffsetActions({
			react, toast: Toast, i18n: I18n, mode, syncData, canStartOperation: lifetime.canStartOperation,
			target: {
				currentLineStart, currentLineCharCount: currentLineChars.length,
				currentParallelTemplate, activeParallelPart, activeParallelTargetId,
			},
			refs: { offsetSelectionRangeRef, offsetSelectionTargetRef },
			timing: { mergeSyncCreatorParallelTemplate, refreshSyncCreatorLineCharsFromParallel, clipSyncCreatorLineToBounds },
			editor: { claimSessionForLocalEditing, resetCurrentSyncInput, setSyncData, setGlobalOffset },
		});

		const { goToPrevLine, goToNextLine, goToFirstLine, handleSeek, handleSeekOffset } = useSyncCreatorNavigation({
			react, host: window, getPlayer: getEditorPlayer, canStartOperation: lifetime.canStartOperation,
			editor: {
				mode, lyricsText, lyricsLines, previousNavigableLineIndex, nextNavigableLineIndex, activeParallelTargetId, currentParallelParts,
			},
			refs: { manualPreviewExitRef, lyricsScrollRef, pendingParallelNavigationRef },
			actions: {
				setMode, setCurrentLineIndex, claimSessionForLocalEditing, resetCurrentSyncInput, setActiveParallelPartId, selectParallelPart,
			},
		});

		const { lyricsTextLrclibShape, attachSelectedLrclibSource } = useSyncCreatorLrclibSnapshotSource({
			react, lyricsText, lyrics, lyricsFullTextChars, lrclibCandidates, selectedLrclibCandidateKey,
			providerRef, selectedLrclibSourceRef, sanitizeSyncCreatorSyncData,
		});

		// Capture the baseline before edits. ISRC resolution can finish later; queued
		// edits retain their original snapshots instead of turning into imported work.
		const buildScoreSnapshot = useCallback(data => buildSyncCreatorScoreSnapshot(data, {
			editingVersion: SYNC_CREATOR_SYNC_DATA_VERSION,
			trackDurationMs, lyricsFullTextChars, lyricsLanguage, lyricsTextLrclibShape,
			prepareSyncCreatorWorkSnapshot, clipSyncCreatorSyncDataToLineBounds,
			attachSelectedLrclibSource, compactSyncCreatorSyncData,
		}), [attachSelectedLrclibSource, lyricsFullTextChars, lyricsLanguage, lyricsTextLrclibShape, trackDurationMs]);
		const repairScoreSnapshot = useCallback(data => repairSyncCreatorScoreSnapshot(data, {
			prepareSyncCreatorWorkSnapshot, clipSyncCreatorSyncDataToLineBounds, assertValidSyncCreatorSyncData, readSyncCreatorCodec,
		}), []);
		useSyncCreatorScoreObservation({
			react, host: window, document, containerRef, utils: Utils, score, buildScoreSnapshot, repairScoreSnapshot,
			readSyncCreatorSyncService,
			source: { trackInfo, trackId, trackIsrc, trackUri, selectedLrclibSource },
			editor: { mode, syncData, isLoading, sessionHydrationComplete, activeSessionDraftKey, sessionReadyDraftKey },
		});

		const { buildSyncCreatorSessionRecord, applySyncCreatorSessionRecord } = useSyncCreatorSessionEditor({
			react, i18n: I18n, syncCreatorDraftStore,
			track: { trackId, trackUri, trackIsrc, trackName, artistName, albumName, trackDurationMs },
			source: { lyrics, lyricsLines, lyricsText, lyricsFullTextChars, lyricsLanguage, provider, addonId, selectedLrclibSource, selectedLrclibCandidateKey },
			editor: { syncData, currentLineIndex, activeParallelPartId, multiVocalMode, syncGranularity, globalOffset },
			drafts: { parallelPartMetaDrafts, manualParallelSplitDrafts, parentheticalLayoutDrafts, mergedLineDrafts, lineMetaDrafts, lineStyleDrafts },
			timing: { attachSelectedLrclibSource, assertValidSyncCreatorSyncData, compactSyncCreatorSyncData, sanitizeSyncCreatorSyncData },
			score,
			session: {
				activeSessionDraftKey, sessionTrackKey, sessionLyricsFingerprint, nextSessionClientRevision,
				syncSessionUiFromRecord, announceHistoryStatus,
			},
			refs: { ...sessionRefs, serverBaselineSyncDataRef },
			recording: { pendingPlaybackNavigationRef, resetCurrentSyncInput },
			update: {
				setProviderValue, setAddonId, setLyrics, setLyricsText, setSyncData, setSelectedLrclibSourceValue,
				setLrclibIdInput, setSelectedLrclibCandidateKey, setCurrentLineIndex, setActiveParallelPartId, setMultiVocalMode,
				setSyncGranularity, setGlobalOffset, setParallelPartMetaDrafts, setManualParallelSplitDrafts, setParentheticalLayoutDrafts,
				setMergedLineDrafts, setLineMetaDrafts, setLineStyleDrafts, setPendingMultiVocalDecision,
				setPendingParentheticalLayoutDecision, setError, setIsLoading, setMode,
			},
		});

		const { addManualCheckpoint, restoreHistoryCheckpoint, historyCursorIndex, moveHistoryCursor } =
			useSyncCreatorSessionCheckpoints({
				react, syncCreatorDraftStore,
				source: { activeSessionDraftKey, lyricsLines, lyricsText },
				editor: { activeParallelTargetId, currentLineIndex, isDragging, isKeyboardSyncingRef, mode, syncData },
				state: { sessionHistory, sessionHistoryCursorId },
				refs: sessionRefs, ui: sessionUi, cancelTimer: clearTimeout, i18n: I18n, toast: Toast,
				buildSyncCreatorSessionRecord, applySyncCreatorSessionRecord, syncSessionUiFromRecord,
				claimSessionForLocalEditing, announceHistoryStatus, nextSessionClientRevision, lifetime,
			});
		useSyncCreatorSessionPersistence({
			react, syncCreatorDraftStore,
			source: { sessionTrackKey, activeSessionDraftKey, lyricsText },
			state: { sessionHydrationComplete, sessionReadyDraftKey, isSessionAutosaveEnabled },
			refs: sessionRefs, ui: sessionUi,
			host: { windowEvents: window, documentEvents: document, scheduleTimer: setTimeout, cancelTimer: clearTimeout },
			buildSyncCreatorSessionRecord, applySyncCreatorSessionRecord, syncSessionUiFromRecord, announceRecoveredSession,
		});

		useSyncCreatorHistoryNavigation({
			react, host: window, historyListRef, historyLength: sessionHistory.length, sessionHistoryCursorId, moveHistoryCursor,
		});

		const clearLyricsCachesAfterSyncSubmit = useCallback((resolvedIsrc, publishedProvider) => clearSyncCreatorPublishedCaches(resolvedIsrc, {
			trackId, trackUri, trackIsrc, provider: publishedProvider, readSyncCreatorSyncService, getLyricsService,
			invalidatePageCache: uri => { delete pageLyricsMemoryCache[uri]; },
			dispatchSyncDataUpdated: detail => window.dispatchEvent(new CustomEvent('ivLyrics:sync-data-updated', { detail })),
		}), [trackId, trackUri, trackIsrc]);

		const materializeSyncCreatorParallelDrafts = useCallback((sourceData, options = {}) => materializeSyncCreatorVocalDrafts(sourceData, options, {
			editingVersion: SYNC_CREATOR_SYNC_DATA_VERSION,
			lyricDocument, getMergedLineIndexesForStart, getParallelTemplateForLineData,
			manualParallelSplitDrafts, mergeSyncCreatorParallelTemplate, rejoinSyncCreatorParallelLine,
			getSyncCreatorRejoinedLineChars, refreshSyncCreatorLineCharsFromParallel,
		}), [getMergedLineIndexesForStart, getParallelTemplateForLineData, lyricDocument, manualParallelSplitDrafts]);

		useEffect(() => {
			const previous = latestSessionRecordRef.current;
			setHasUnsubmittedSync(hasSyncCreatorUnsubmittedChanges({
				syncData,
				baseline: serverBaselineSyncDataRef.current,
				timingCleared: previous?.draftKey === activeSessionDraftKey && isSyncCreatorDraftTimingCleared(previous),
				materialize: materializeSyncCreatorParallelDrafts,
				layoutDrafts: [manualParallelSplitDrafts, parentheticalLayoutDrafts, mergedLineDrafts],
			}));
		}, [
			syncData, activeSessionDraftKey, hasPublishedSync, materializeSyncCreatorParallelDrafts,
			manualParallelSplitDrafts, parentheticalLayoutDrafts, mergedLineDrafts,
		]);

		const isSourceLoading = isLoading || isLoadingLrclibId;
		const sessionReplacementLayout = {
			setParallelPartMetaDrafts, setManualParallelSplitDrafts, setParentheticalLayoutDrafts,
			setMergedLineDrafts, setLineMetaDrafts, setLineStyleDrafts, setPendingParentheticalLayoutDecision,
			setPendingMultiVocalDecision, setMultiVocalMode, setActiveParallelPartId, setGlobalOffset,
		};
		const { revert: handleRevertToPublished, submit: handleSubmit } = createSyncCreatorPublicationActions({
			runPublication, syncData, hasUnsubmittedSync, isEditorOpen,
			canEdit: !isSourceLoading,
			isRecording: () => mode === 'record' || isDragging || isKeyboardSyncingRef.current,
			hasHeldInput: () => Boolean(pointerRecordingRef.current || isKeyboardSyncingRef.current || keyboardDragRef.current),
			track: {
				id: trackId, isrc: trackIsrc, title: trackName, artist: artistName, album: albumName,
				provider, getProvider: () => providerRef.current, info: trackInfo, durationMs: trackDurationMs,
			},
			lyrics: { text: lyricsText, lines: lyricsLines, offsets: lineCharOffsets, chars: lyricsFullTextChars, language: lyricsLanguage },
			draft: { deleteActiveSyncCreatorDraft, syncCreatorDraftStore, serverBaselineSyncDataRef },
			layout: sessionReplacementLayout,
			editor: {
				setCurrentLineIndex, setSyncData, setMode, resetCurrentSyncInput, setHasUnsubmittedSync, setHasPublishedSync,
				onClose: closeEditor,
			},
			timing: {
				materialize: materializeSyncCreatorParallelDrafts, attachSource: attachSelectedLrclibSource,
				validate: assertValidSyncCreatorSyncData, compact: compactSyncCreatorSyncData,
				getCodec: readSyncCreatorCodec, sanitize: sanitizeSyncCreatorSyncData,
			},
			vocals: {
				multiVocalMode,
				coverage: {
					isLineCovered: isLineCoveredByMergedPrevious,
					getMergedLineIndexes: getMergedLineIndexesForStart,
					getParallelTemplate: getParallelTemplateForLineData,
					mergeParallelTemplate: mergeSyncCreatorParallelTemplate,
					getLineSpeaker: line => ({
						speaker: normalizeSyncCreatorSpeaker(line.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER,
						'speaker-fallback': sanitizeSyncCreatorSpeakerFallback(line.speaker, line['speaker-fallback']),
						'speaker-color': line['speaker-color'],
					}),
					isSpeakerComplete: isSyncCreatorSpeakerMetaComplete,
				},
				metadata: {
					defaultSpeaker: SYNC_CREATOR_DEFAULT_SPEAKER,
					defaultKind: SYNC_CREATOR_DEFAULT_KIND,
					resolveSpeakerMeta: source => resolveSyncCreatorDraftSpeakerMeta({ source }),
					normalizeKind: normalizeSyncCreatorKind,
					sanitizeParallel: sanitizeSyncCreatorParallel,
				},
			},
			dialog: {
				confirm: message => window.confirm(message), toast: Toast, translate: (key, params) => I18n.t(key, params),
				setSubmitting: setIsSubmitting, setReverting: setIsReverting,
			},
			transport: {
				account: Utils,
				requireAuth: operation => Utils.requireDiscordAuth?.(I18n.t('syncCreator.loginRequired'), { operation }),
				saveWork: (data, isrc) => {
					if (!Utils.getAuthToken?.()) return {};
					scoreContextRef.current.isrc = isrc;
					scoreContextRef.current.accountId = Utils.getUserHash?.();
					const tracker = ensureScoreTracker();
					if (!tracker) throw new Error('Sync work could not be saved. Please try submitting again.');
					return tracker.submission(data);
				},
				getSyncService: readSyncCreatorSyncService,
				fetch: (...args) => fetch(...args),
				getHeaders: headers => Utils.getApiHeaders(headers),
			},
			clearPublishedCaches: clearLyricsCachesAfterSyncSubmit,
		});

		// 싱크 데이터 내보내기 (JSON 파일로 저장)
		const exportSyncData = useCallback(() => exportSyncCreatorFile({
			syncData,
			track: { title: trackName, artist: artistName, id: trackId },
			lyrics: { chars: lyricsFullTextChars, language: lyricsLanguage },
			timing: {
				materialize: materializeSyncCreatorParallelDrafts, attachSource: attachSelectedLrclibSource,
				validate: assertValidSyncCreatorSyncData, compact: compactSyncCreatorSyncData,
			},
			saveWork: expandedData => {
				captureScoreWork('checkpoint', expandedData);
				// Saving a file remains usable offline; the durable work queue retries.
				scoreTrackerRef.current?.flush().catch(() => undefined);
			},
			files: Utils,
			toast: Toast,
			translate: key => I18n.t(key),
		}), [artistName, attachSelectedLrclibSource, lyricsFullTextChars, lyricsLanguage, materializeSyncCreatorParallelDrafts, syncData, trackId, trackName, captureScoreWork]);

		// 싱크 데이터 불러오기 (JSON 파일에서)
		const importSyncData = useCallback(() => openImportPicker({
			createInput: () => document.createElement('input'),
			lyricsText,
			currentSource: { lyricsChars: lyricsFullTextChars, lyricsFingerprint: sessionLyricsFingerprint, provider, addonId, lrclibSource: null },
			timing: { sanitize: sanitizeSyncCreatorSyncData, validate: assertValidSyncCreatorSyncData },
			prepareLrclibSource: prepareLrclibSourceForImport,
			applyImport: (sanitizedData, target) => {
				// Import is an immutable queue boundary, including small/repeated
				// imports and files previously exported from this editor.
				const work = target.activate && buildSyncCreatorImportedScoreWork(sanitizedData, target, {
					editingVersion: SYNC_CREATOR_SYNC_DATA_VERSION, trackDurationMs, compactSyncCreatorSyncData,
				});
				scoreInputRef.current = null;
				scorePendingEffectsRef.current?.clear();
				captureScoreWork('import', sanitizedData, undefined, work);
				target.activate?.();
				applySyncCreatorImportedSession(sanitizedData, target, {
					draft: {
						beginDraftImport, syncCreatorDraftStore, sessionTrackKey,
						activeSessionDraftKey, adoptImportedDraftKey, markDraftDirty,
					},
					layout: sessionReplacementLayout,
					editor: { resetCurrentSyncInput, setSyncData, setSelectedLrclibSourceValue },
				});
			},
			toast: Toast,
			translate: key => I18n.t(key),
		}), [
			activeSessionDraftKey, adoptImportedDraftKey, beginDraftImport, markDraftDirty, addonId,
			openImportPicker, prepareLrclibSourceForImport, lyricsFullTextChars, lyricsText, provider, sessionLyricsFingerprint,
			sessionTrackKey, setSelectedLrclibSourceValue, resetCurrentSyncInput, syncCreatorDraftStore, captureScoreWork, trackDurationMs,
		]);

		// 가사 전체 복사
		const copyAllLyrics = useCallback(async () => {
			if (!lyricsText) {
				Toast.error(I18n.t('syncCreator.noLyrics') || 'No lyrics to copy');
				return;
			}

			try {
				await navigator.clipboard.writeText(lyricsText);
				Toast.success(I18n.t('syncCreator.lyricsCopied') || 'Copied lyrics to clipboard');
			} catch (err) {
				console.error('[SyncDataCreator] Copy error:', err);
				Toast.error((I18n.t('syncCreator.copyError') || 'Copy failed') + ': ' + err.message);
			}
		}, [lyricsText]);

		const copyLrclibCandidateId = useCallback((candidateOrId, event) =>
			copySyncCreatorLrclibCandidateId(candidateOrId, event, {
				writeClipboardText: id => navigator.clipboard.writeText(id), i18n: I18n, toast: Toast,
			}),
		[]);
		const formatTime = useCallback((ms) => {
			const totalSeconds = Math.floor(ms / 1000);
			return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
		}, []);

		const formatSeconds = useCallback((seconds) => `${seconds.toFixed(1)}s`, []);
		const previewTiming = useSyncCreatorPreviewTiming({
			react, syncData, lineCharOffsets, activeParallelPart, positionStore,
			getRejoinedLineChars: getSyncCreatorRejoinedLineChars,
		});
		const { syncLinesByStart, isCharSynced, getCharSyncTime, getPreviewProgressIndex, getPlayedCharacters } = previewTiming;

		const characterRefs = useSyncCreatorGlyphLayout({
			react,
			line: {
				index: currentLineIndex, partId: activeParallelPartId, text: currentLineText,
				charCount: currentLineChars.length, useTextRun: useCurrentLineTextRun, granularity: syncGranularity,
				speakerColor: currentSpeakerTextColor, styleRanges: currentLineStyleRanges, furigana: currentLineFuriganaMap,
				readings: currentLineCharacterPronunciationMap, readingUnits: currentLineRenderedPronunciationUnits,
			},
			refs: { charElementsRef, charHitBoxesRef, charScrollMetricsRef, lastPaintedPlaybackIndexRef },
			invalidateRecordingPaint,
		});

		useEffect(() => {
			if (mode !== 'record') return undefined;
			lastPaintedPlaybackIndexRef.current = -2;
			return positionStore.subscribe(() => {
				lastPaintedPlaybackIndexRef.current = -2;
			});
		}, [mode, positionStore, currentLineIndex, activeParallelPartId]);

		useSyncCreatorSelectionReset({
			react, target: recordingTarget, clearLyricTextSelection, clearOffsetSelection,
		});

		useSyncCreatorEditorPreview({
			react, mode, timing: previewTiming, lyricsText, lineCount: lyricsLines.length,
			line: {
				index: currentLineIndex, partId: activeParallelPartId, charCount: currentLineChars.length,
				direction: currentLineDirection, color: currentSpeakerTextColor, mutedColor: currentSpeakerMutedColor,
				useTextRun: useCurrentLineTextRun,
			},
			refs: { lastPaintedPlaybackIndexRef, parallelPreviewElementsRef, recordingCharIndexRef, charElementsRef, rtlTextRunRef },
			painting: syncCreatorPreviewPainting, getProgress: getEditorProgress,
			getActiveRecordingLockIndex, applyRecordingProgressVisual,
			scheduleFrame: scheduleSyncCreatorRecordingFrame, cancelFrame: cancelSyncCreatorRecordingFrame,
		});

		const {
			'furigana-font-size': furiganaFontSize,
			'furigana-font-weight': furiganaFontWeight,
			'furigana-opacity': furiganaOpacity,
		} = readVisualSettings() || {};
		const hasGroupedPronunciation = currentLineRenderedPronunciationUnits.length > 0;
		const hasSelectedParallelPart = Boolean(activeParallelPart);
		const isRecording = mode === 'record';
		const s = useMemo(() => getSyncCreatorStyles({
			usePrimaryCharacterPronunciation,
			hasCurrentLineFurigana,
			hasCurrentLineCharacterPronunciation,
			hasGroupedPronunciation,
			hasSelectedParallelPart,
			isRecording,
			currentSpeakerTextColor,
			currentSpeakerMutedColor,
			furiganaFontSize,
			furiganaFontWeight,
			furiganaOpacity,
		}), [
			usePrimaryCharacterPronunciation,
			hasCurrentLineFurigana,
			hasCurrentLineCharacterPronunciation,
			hasGroupedPronunciation,
			hasSelectedParallelPart,
			isRecording,
			currentSpeakerTextColor,
			currentSpeakerMutedColor,
			furiganaFontSize,
			furiganaFontWeight,
			furiganaOpacity,
		]);

		const currentLineData = syncLinesByStart?.get(lineCharOffsets[currentLineIndex]);
		const currentLineTimes = getSyncCreatorLineTimes(activeParallelPart || { chars: getSyncCreatorRejoinedLineChars(currentLineData) });
		const hasCurrentLineTiming = currentLineTimes.length > 0;
		const currentLineTimingLabel = hasCurrentLineTiming
			? `${formatSeconds(Math.min(...currentLineTimes))} - ${formatSeconds(Math.max(...currentLineTimes))}`
			: (I18n.t('syncCreator.lineOffsetUnavailable') || '싱크 후 조정 가능');
		const currentLinePreviewIndex = currentLineText
			? getPreviewProgressIndex(currentLineIndex)
			: -1;
		const currentLinePlayedMarks = getPlayedCharacters(currentLineIndex, positionStore.get() / 1000);
		const currentRecordingCharIndex = recordingCharIndexRef.current;
		const isRecordingLockArmed = mode === 'record' && recordingLockIndex >= 0;
		const currentLockedPlaybackIndex = mode === 'record'
			? getSyncCreatorLockedPlaybackProgressIndex(
				currentLinePreviewIndex,
				recordingLockIndex,
				currentRecordingCharIndex
			)
			: null;
		const currentLineProgressIndex = mode === 'record' && currentRecordingCharIndex >= 0
			? currentRecordingCharIndex
			: (currentLockedPlaybackIndex ?? currentLinePreviewIndex);
		const usesIndependentPlaybackPaint = currentLinePlayedMarks && currentLockedPlaybackIndex === null
			&& (mode !== 'record' || currentRecordingCharIndex < 0);
		const currentLineProgressPercent = usesIndependentPlaybackPaint
			? getSyncCreatorCompletedPreviewPercent(currentLinePlayedMarks)
			: currentLineChars.length > 0 && currentLineProgressIndex >= 0
				? Math.max(0, Math.min(100, ((currentLineProgressIndex + 1) / currentLineChars.length) * 100))
				: 0;
		const rtlTextRunStyle = {
			...s.rtlTextRun,
			direction: currentLineDirection,
			backgroundImage: getSyncCreatorProgressGradient(
				currentLineDirection,
				currentLineProgressPercent,
				currentSpeakerTextColor,
				currentSpeakerMutedColor
			),
		};
		const renderCurrentLineCharacters = () => renderSyncCreatorLineGlyphs({
			react, i18n: I18n, styles: s,
			line: {
				currentLineIndex, currentLineStart, currentLineCharRefs, currentLineStyleRanges, activeParallelPart,
				currentFullLineChars, currentLineChars, currentLineText, currentLineDirection, useCurrentLineTextRun,
			},
			reading: {
				currentLineFuriganaMap, currentLineCharacterPronunciationMap,
				usePrimaryCharacterPronunciation, useFixedPrimaryCharacterCells,
				currentLineRenderedPronunciationUnits, currentLineRenderedPronunciationUnitByStart,
				currentLineRenderedPronunciationCoveredIndexes,
			},
			timing: {
				mode, syncGranularity, currentRecordingCharIndex, currentLinePreviewIndex, currentLinePlayedMarks, currentLockedPlaybackIndex,
				isRecordingLockArmed, recordingLockRange, recordingLockIndex, offsetSelectionRange,
				currentGranularityRanges, currentWordBoundaryStartIndexes, isCharSynced, getCharSyncTime, formatSeconds,
			},
			visuals: { currentSpeakerTextColor, rtlTextRunStyle, textEffectsDisabled },
			vocalStyles: syncCreatorVocalStyles,
			refs: { characterRefs, rtlTextRunRef },
			input: { getCharIndexFromPoint, handleCharacterContextMenu },
		});

		const renderParallelPartLine = (part, index) => renderSyncCreatorParallelPart({
			react, styles: s, part, index, textEffectsDisabled, getSyncCreatorProgressGradient,
			preview: currentParallelPreviewTargets.get(part.id),
			previewReadings: currentParallelPartReadingMaps.get(part.id),
			line: {
				activeParallelTargetId, currentFullLineChars, currentLineStart, currentLineDirection,
				useCurrentLineTextRun, hasCurrentLineCharacterPronunciation, usePrimaryCharacterPronunciation,
			},
			vocalStyles: syncCreatorVocalStyles,
			actions: { handleContainerMouseDown, selectParallelPart, renderCurrentLineCharacters },
		});

		const updateCurrentTextEffect = useCallback((value) => {
			if (shouldUseSyncCreatorSelectionEffect({ mode, activeParallelPart, offsetSelectionRange })) {
				updateCurrentLineStyleRanges({ kind: value });
				return;
			}
			if (activeParallelPart) updateParallelPartMeta(activeParallelPart.id, 'kind', value);
			else updateCurrentLineMeta('kind', value);
		}, [mode, activeParallelPart, offsetSelectionRange, updateCurrentLineMeta, updateParallelPartMeta, updateCurrentLineStyleRanges]);

		const renderLineInspector = () => renderSyncCreatorLineInspector({
			react, i18n: I18n, toast: Toast, styles: s, vocalStyles: syncCreatorVocalStyles,
			line: { trackId, currentLineStart, activeParallelPart, currentLineMeta, lyricsLines },
			selection: { mode, offsetSelectionRange, currentLineStyleRanges, currentLineCharRefs, currentLineChars },
			customSpeaker: { customSpeakerMetaMemoryRef, bulkCustomSpeakerColor, bulkCustomSpeakerFallback, setBulkCustomSpeakerColor, setBulkCustomSpeakerFallback },
			actions: { updateCurrentLineStyleRanges, updateParallelPartMeta, updateCurrentLineMeta, requestSongVocalSpeaker },
		});

		const syncGranularityRecordingHint = getSyncCreatorRecordingHint(syncGranularity, I18n);

		useSyncCreatorLrclibAutoCollapse({ react, syncData, setShowLrclibCandidates });

		const renderManualSplitEditor = () => renderSyncCreatorManualSplitEditor({
			react, i18n: I18n, styles: s, mode, multiVocalMode, currentFullLineChars, currentLineStart,
			hasManualParallelSplit, hasManualDraftSplit, currentManualSplitPoints, currentManualSplitPointSet,
			isParallelSplitCollapsed, setIsParallelSplitCollapsed, resetCurrentLineManualSplit, toggleManualParallelSplitPoint,
		});

		const renderStagePanel = () => renderSyncCreatorStagePanel({
			react, i18n: I18n, styles: s,
			line: {
				lyricsText, lyricsLines, currentLineIndex, isCurrentLineSynced, currentLineDirection,
				useCurrentLineTextRun, currentParallelParts, hasCurrentParallelParts, currentTextEffectKind,
			},
			status: { isLoading, error, mode, multiVocalMode, showLivePreview, syncGranularityRecordingHint },
			selection: { activeParallelPart, offsetSelectionRange, currentLineStyleRanges, currentLineCharRefs },
			visuals: { currentSpeakerTextColor, currentSpeakerMutedColor, textEffectsDisabled },
			navigation: { previousNavigableLineIndex, nextNavigableLineIndex, goToPrevLine, goToNextLine },
			lyricsScrollRef,
			actions: {
				handleContainerMouseDown, updateCurrentTextEffect, getSyncCreatorFuriganaReact,
				renderManualSplitEditor, renderLivePreviewOverlay, renderParallelPartLine, renderCurrentLineCharacters,
			},
		});

		const { getCurrentLastCharEndInfo, setCurrentLastCharEnd } = createSyncCreatorLastCharEnd({
			currentExistingLineData, currentLineStart, activeParallelPart, getSyncCreatorRejoinedLineChars,
			canStartOperation: lifetime.canStartOperation,
			claimSessionForLocalEditing, setSyncData, toast: Toast, i18n: I18n,
		});
		// The stable shortcut listener reads the latest "End now" action.
		lastCharEndShortcutRef.current = () => setCurrentLastCharEnd(getEditorProgressSeconds());
		const renderCurrentLineTools = () => renderSyncCreatorCurrentLineTools({
			react, i18n: I18n, styles: s, hasLyrics: lyricsText && lyricsLines.length > 0,
			lineOffset: { hasCurrentLineTiming, currentLineTimingLabel, adjustCurrentLineOffset },
			lastCharEnd: {
				info: lyricsText && lyricsLines.length > 0 ? getCurrentLastCharEndInfo() : null,
				setCurrentLastCharEnd, getPlaybackTime: getEditorProgressSeconds,
			},
			lineLayout: {
				canSplitIntoMultipleVocals: !multiVocalMode && currentFullLineChars.length > 1,
				enableManualMultiVocalMode, canMergeCurrentLineWithNext, mergeCurrentLineWithNext,
			},
		});

		const renderRightRail = () => react.createElement('aside', { className: 'sync-creator-inspector-rail', style: s.rightRail },
			react.createElement('div', { className: 'sync-creator-inspector-scroll', style: s.inspectorScroll },
				renderCurrentLineTools(),
				lyricsText && lyricsLines.length > 0 && (activeParallelPart || !hasCurrentParallelParts) && renderLineInspector()
			),
			renderSyncCreatorHistoryPanel({
				react, translate: (...args) => I18n.t(...args), styles: s,
				history: { entries: sessionHistory, cursorId: sessionHistoryCursorId, cursorIndex: historyCursorIndex, listRef: historyListRef },
				source: { provider, addonId, lrclibSource: selectedLrclibSource },
				status: {
					isRestoring: isRestoringCheckpoint, saveState: sessionSaveState, lastSavedAt: lastSessionSavedAt,
					announcement: historyAnnouncement, autosaveEnabled: isSessionAutosaveEnabled,
					canUndoPendingEdit: sessionReadyDraftKey === activeSessionDraftKey && !!activeSessionDraftKey
						&& ['dirty', 'saving', 'disabled'].includes(sessionSaveState),
					canAddCheckpoint: !!activeSessionDraftKey && !isRestoringCheckpoint && mode !== 'record' && !isDragging,
				},
				resize: historyResize,
				actions: { toggleSessionAutosave, moveHistoryCursor, addManualCheckpoint, restoreHistoryCheckpoint },
			})
		);

		const { showLivePreview, renderLivePreviewOverlay } = useSyncCreatorLivePreview({
			react,
			mode,
			setMode,
			syncData,
			lyricsLines,
			lineCharOffsets,
			getMergedLineIndexesForStart,
			materializeSyncCreatorParallelDrafts,
			lineMetadata: {
				normalizeSpeaker: normalizeSyncCreatorSpeaker,
				normalizeKind: normalizeSyncCreatorKind,
				normalizeStyleRanges: normalizeSyncCreatorStyleRanges,
				defaultSpeaker: SYNC_CREATOR_DEFAULT_SPEAKER,
				defaultKind: SYNC_CREATOR_DEFAULT_KIND,
			},
			playbackTimeline,
			currentLineIndex,
			positionStore,
			SyncCreatorLivePreviewClock,
			getLiveClock: () => syncCreatorPreviewUsesLiveClock() ? syncCreatorPreviewLiveClock : null,
			currentLineChars,
			currentParallelPartReadingMaps,
			currentLineCharacterPronunciationMap,
			currentLineRenderedPronunciationUnits,
			showCharacterPronunciations,
			getSyncCreatorFuriganaMap,
			furiganaRevision,
			getRenderer: readLyricRenderer,
			getVisualSettings: () => readVisualSettings() || {},
			isFuriganaReady: () => getSyncCreatorFuriganaConverter()?.isAvailable?.() === true,
			getDocument: () => document,
			readComputedStyle: node => window.getComputedStyle(node),
			translate: (...args) => I18n.t(...args),
			glyphFontSize: s.charSpan?.fontSize,
			borderColor: TOSS_BORDER,
		});

		const { changeGranularity: handleSyncGranularityChange, toggleMode, resetFromStart } = createSyncCreatorEditorCommands({
			lifetime, mode, syncGranularity, isCurrentSyncTargetMetaComplete, getPlayer: getEditorPlayer,
			refs: { manualPreviewExitRef, pendingPlaybackNavigationRef, lyricsScrollRef },
			draft: { claimSessionForLocalEditing, captureEditorDraftOwnership, deleteActiveSyncCreatorDraft },
			editor: {
				clearLyricTextSelection, clearOffsetSelection, resetCurrentSyncInput,
				setMode, setSyncGranularity, setCurrentLineIndex, setSyncData,
			},
			layout: sessionReplacementLayout,
			dialog: { showMissingMetaToast, confirm: message => window.confirm(message), translate: key => I18n.t(key) },
		});

		const showRightRail = Boolean(lyricsText && lyricsLines.length > 0);
		const workspaceStyle = showRightRail
			? s.workspace
			: { ...s.workspace, gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)' };

		return react.createElement('div', { className: 'ivlyrics-sync-creator-shell', style: s.overlay, ref: containerRef },
			renderSyncCreatorHeader({
				react, i18n: I18n, styles: s, syncGranularity, handleSyncGranularityChange,
				onClose: closeEditor,
				hasUnsubmittedSync, hasPublishedSync, isSubmitting, isReverting, isSourceLoading, lyricsText, syncData,
				handleRevertToPublished, handleSubmit,
			}),
			react.createElement('div', { className: `sync-creator-workspace${showRightRail ? ' has-inspector' : ''}`, style: workspaceStyle },
				react.createElement('aside', { className: 'sync-creator-source-rail', style: s.sideRail },
					renderSyncCreatorSourcePanel({
						react, i18n: I18n, styles: s,
						track: { albumArt, trackName, artistName, isVirtualKaraokeSource },
						source: {
							addonId, isLoading, loadLyrics, lrclibIdInput, isLoadingLrclibId, loadLrclibById,
							onLrclibIdChange: value => {
								const nextId = value.replace(/[^\d]/g, '');
								lrclibIdInputEditedRef.current = nextId !== '';
								lrclibIdInputRevisionRef.current++;
								setLrclibIdInput(nextId);
							},
						},
						hasLyrics: lyricsLines.length > 0,
						pronunciation: {
							characterPronunciations, characterPronunciationProgressInfo, characterPronunciationTargetMode,
							isGeneratingCharacterPronunciations, isCharacterPronunciationPrimary, showCharacterPronunciations,
							handleCharacterPronunciationTargetModeChange, handleCharacterPronunciationToggle, setIsCharacterPronunciationPrimary,
						},
					}),
					renderSyncCreatorProgressPanel({
						react, i18n: I18n, styles: s, lyricsText, lineCount: lyricsLines.length, completedLines, syncedChars, totalChars,
						mode, currentLineIndex, syncData, isCurrentLineSynced,
						actions: { goToFirstLine, toggleMode, copyAllLyrics, exportSyncData, importSyncData, deleteCurrentLineSync, resetFromStart },
					}),
					renderSyncCreatorShortcutGuide({
						react, i18n: I18n, styles: s, lyricsText, syncGranularityRecordingHint, syncCreatorShortcutSettings,
					})
				),
				react.createElement('main', { className: 'sync-creator-editor-column', style: s.centerRail },
					renderSyncCreatorPlaybackPanel({
						react, i18n: I18n, styles: s, lyricsText, syncData, globalOffset,
						durationMs: lyricsText ? trackDurationMs : 0,
						SyncCreatorPlaybackTime, SyncCreatorPlaybackBar, positionStore, formatTime,
						handleSeek, handleSeekOffset, adjustGlobalOffset,
					}),
					renderSyncCreatorLrclibCandidates({
						react, i18n: I18n, styles: s, formatSeconds, trackName, artistName,
						source: { addonId, isLoading },
						search: { lrclibSearchQuery, onLrclibSearchQueryChange, isSearchingLrclib, searchLrclibByQuery },
						candidates: {
							lrclibSearchMeta, lrclibCandidates, showLrclibCandidates, selectedLrclibCandidateKey, previewLrclibCandidate,
							setShowLrclibCandidates, setPreviewLrclibCandidateKey, applySelectedLrclibCandidate, copyLrclibCandidateId,
						},
					}),
					renderStagePanel()
				),
				showRightRail && renderRightRail()
			),
			renderSyncCreatorDialogs({
			react, i18n: I18n, styles: s, pendingMultiVocalDecision, resolveMultiVocalDecision,
			pendingParentheticalLayoutDecision, resolveParentheticalLayoutDecision,
			bulkSpeaker: {
				open: showBulkCustomSpeakerDialog, color: bulkCustomSpeakerColor, fallback: bulkCustomSpeakerFallback,
				getPickerColor: () => sanitizeSyncCreatorSpeakerColor('CUSTOM', bulkCustomSpeakerColor, true, bulkCustomSpeakerFallback),
				onColorChange: setBulkCustomSpeakerColor, onFallbackChange: setBulkCustomSpeakerFallback,
				onClose: () => setShowBulkCustomSpeakerDialog(false), onApply: applyBulkCustomSpeaker,
			},
			pronunciationConsent: {
				open: showCharacterPronunciationConsent,
				onCancel: cancelCharacterPronunciationConsent, onConfirm: confirmCharacterPronunciationConsent,
			},
		})
		);

	};

	return {
		SyncDataCreator,
		SyncCreatorScoreTracker: {
			create: options => createSyncCreatorScoreTracker({ ...options, codec: options.codec || readSyncCreatorCodec() }),
			GRACE_MS,
			HEARTBEAT_MS,
		},
	};
}
