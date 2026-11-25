import { isCompleteSyncCreatorLrclibSource } from './lrclibSyncSource.mjs';
import { createSyncCreatorScoreTracker } from './syncCreatorScoreTracker.mjs';
import { requestSyncCreatorWork } from './syncCreatorSubmissionTransport.mjs';
import { SYNC_CREATOR_DEFAULT_KIND } from './syncCreatorVocalStyles.mjs';

export function useSyncCreatorScoreState({
	react: { useCallback, useRef, useState }, containerRef, readSyncCreatorCodec, syncCreatorDraftStore,
	utils: Utils, i18n: I18n, spicetify: Spicetify, document, fetch, schedule: setTimeout, cancel: clearTimeout,
}) {
	const scoreTrackerRef = useRef(null);
	const scoreContextRef = useRef(null);
	const scorePendingEventsRef = useRef([]);
	const scorePendingEffectsRef = useRef(new Map());
	const scoreInputContextRef = useRef(null);
	const scoreInputRef = useRef(null);
	const [scoreResolvedIsrc, setScoreResolvedIsrc] = useState('');
	const ensureScoreTracker = useCallback(() => {
		const context = scoreContextRef.current;
		if (!context?.ready || !context.accountId || !context.isrc || !context.initialSyncData?.source) return null;
		if (!isCompleteSyncCreatorLrclibSource(context.initialSyncData.source)) return null;
		const ownsEvent = event => event.trackUri === context.trackUri
			&& (event.accountId === context.accountId || (!event.accountId && event.action === 'import'));
		const scope = `${context.accountId}:${context.isrc}:lrclib`;
		if (scoreTrackerRef.current?.scope !== scope) {
			scoreTrackerRef.current?.stop();
			const pendingBaseline = scorePendingEventsRef.current.find(ownsEvent)?.baseline;
			scoreTrackerRef.current = createSyncCreatorScoreTracker({
				codec: readSyncCreatorCodec(),
				accountId: context.accountId,
				isrc: context.isrc,
				initialSyncData: pendingBaseline ? { ...pendingBaseline, source: pendingBaseline.source || context.initialSyncData.source } : context.initialSyncData,
				storage: syncCreatorDraftStore,
				repairSnapshot: data => scoreContextRef.current?.repairSnapshot?.(data),
				isAuthorized: () => Boolean(Utils.getAuthToken?.()) && Utils.getUserHash?.() === context.accountId,
				isActive: () => document.visibilityState === 'visible'
					&& document.hasFocus()
					&& Boolean(containerRef.current?.isConnected)
					&& ['record', 'preview', 'idle'].includes(scoreContextRef.current?.mode)
					&& Spicetify.Player?.data?.item?.uri === context.trackUri,
				request: payload => requestSyncCreatorWork(payload, {
					fetch,
					getHeaders: headers => Utils.getApiHeaders(headers),
					translate: (key, params) => I18n.t(key, params),
					schedule: setTimeout,
					cancel: clearTimeout,
				}),
			});
		}
		const tracker = scoreTrackerRef.current;
		for (const event of scorePendingEventsRef.current.filter(ownsEvent)) {
			if (ownsEvent(event)) {
				tracker.enqueue(event.action, { ...event.syncData, source: event.syncData.source || context.initialSyncData.source }, event.target);
			}
		}
		scorePendingEventsRef.current = scorePendingEventsRef.current.filter(event => !ownsEvent(event));
		return tracker;
	}, []);
	const captureScoreWork = useCallback((action, data, target, prepared) => {
		const context = scoreContextRef.current;
		if (!context) return;
		const snapshot = prepared ? prepared.snapshot : context.buildSnapshot(data);
		if (!snapshot) return;
		const baseline = prepared ? prepared.baseline : context.initialSyncData;
		if (!context.accountId || context.accountId !== Utils.getUserHash?.() || !Utils.getAuthToken?.()) {
			// Import provenance can be retained before login. It can only grant
			// the external-work tier; anonymous timing/time claims are discarded.
			if (action === 'import') scorePendingEventsRef.current.push({
				action: 'import', syncData: snapshot, baseline,
				accountId: '', trackUri: context.trackUri
			});
			return;
		}
		// The preview can still be rendering the previous lyric version after an import.
		const tracker = prepared ? null : ensureScoreTracker();
		if (tracker) tracker.enqueue(action, snapshot, target);
		else scorePendingEventsRef.current.push({ action, syncData: snapshot, target, baseline, accountId: context.accountId, trackUri: context.trackUri });
	}, [ensureScoreTracker]);
	const markScoreTimingInput = useCallback((start, end, granularity) => {
		const context = scoreInputContextRef.current;
		if (!context || end < start) return;
		if (scoreInputRef.current?.key !== context.key) {
			scoreInputRef.current = { key: context.key, indexes: new Set(), anchors: new Set(), granularity, inputCount: 0 };
		}
		const input = scoreInputRef.current;
		const levels = ['line', 'word', 'character'];
		input.granularity = levels[Math.min(levels.indexOf(input.granularity), levels.indexOf(granularity))] || 'line';
		const anchor = context.refs[Math.max(0, start)]?.absoluteIndex;
		if (Number.isInteger(anchor)) input.anchors.add(anchor);
		for (let index = Math.max(0, start); index <= end && index < context.refs.length; index++) {
			input.indexes.add(context.refs[index].absoluteIndex);
		}
		input.inputCount++;
		ensureScoreTracker()?.interact();
	}, [ensureScoreTracker]);

	return {
		scoreTrackerRef, scoreContextRef, scorePendingEventsRef, scorePendingEffectsRef, scoreInputContextRef, scoreInputRef,
		scoreResolvedIsrc, setScoreResolvedIsrc, ensureScoreTracker, captureScoreWork, markScoreTimingInput,
	};
}

export function useSyncCreatorScoreObservation({
	react: { useEffect, useMemo }, host: window, document, containerRef, utils: Utils, buildScoreSnapshot, repairScoreSnapshot,
	readSyncCreatorSyncService,
	score: {
		scoreTrackerRef, scoreContextRef, scorePendingEffectsRef, scoreInputRef,
		scoreResolvedIsrc, setScoreResolvedIsrc, ensureScoreTracker, captureScoreWork,
	},
	source: { trackInfo, trackId, trackIsrc, trackUri, selectedLrclibSource },
	editor: { mode, syncData, isLoading, sessionHydrationComplete, activeSessionDraftKey, sessionReadyDraftKey },
}) {
	const scoreCurrentSnapshot = useMemo(() => buildScoreSnapshot(syncData), [buildScoreSnapshot, syncData]);
	scoreContextRef.current = {
		ready: !isLoading && sessionHydrationComplete && Boolean(activeSessionDraftKey)
			&& sessionReadyDraftKey === activeSessionDraftKey,
		accountId: Utils.getAuthToken?.() ? Utils.getUserHash?.() : '',
		isrc: trackIsrc || scoreResolvedIsrc,
		trackUri, mode,
		initialSyncData: scoreCurrentSnapshot,
		buildSnapshot: buildScoreSnapshot,
		repairSnapshot: repairScoreSnapshot
	};
	useEffect(() => {
		let canceled = false;
		setScoreResolvedIsrc('');
		if (!trackIsrc && trackId) {
			Promise.resolve(readSyncCreatorSyncService()?.resolveTrackIsrc?.(trackId, trackInfo))
				.then(value => { if (!canceled) setScoreResolvedIsrc(value || ''); })
				.catch(() => undefined);
		}
		return () => { canceled = true; };
	}, [trackId, trackIsrc]);
	useEffect(() => {
		const tracker = ensureScoreTracker();
		const snapshot = scoreContextRef.current?.initialSyncData;
		if (!snapshot) return;
		// State changes without a timing input (undo, source load, offsets, draft
		// restore) are snapshots only and never promote manual timing provenance.
		tracker?.observe(snapshot);
		const effectTargets = [];
		for (const [key, pending] of scorePendingEffectsRef.current) {
			if (!pending.expectedKind || pending.expectedKind === SYNC_CREATOR_DEFAULT_KIND) {
				scorePendingEffectsRef.current.delete(key);
				continue;
			}
			const line = syncData?.lines?.find(item => item.start === pending.start);
			if (!line) continue;
			const item = pending.partId ? line.parallel?.parts?.find(part => part.id === pending.partId) : line;
			const matches = pending.style
				? line.styleRanges?.some(range => range.kind === pending.expectedKind && pending.ranges.some(target => range.start <= target.end && range.end >= target.start))
				: item?.kind === pending.expectedKind;
			if (!matches) continue;
			const { expectedKind, style, ...target } = pending;
			effectTargets.push({ ...target, end: line.end });
			scorePendingEffectsRef.current.delete(key);
		}
		if (effectTargets.length) captureScoreWork('effect', syncData,
			effectTargets.length === 1 ? effectTargets[0] : { targets: effectTargets });
	}, [syncData, selectedLrclibSource, trackIsrc, scoreResolvedIsrc, ensureScoreTracker, captureScoreWork,
		isLoading, sessionHydrationComplete, activeSessionDraftKey, sessionReadyDraftKey]);
	useEffect(() => {
		const onInteraction = event => {
			if (event.isTrusted && containerRef.current?.contains(event.target)) ensureScoreTracker()?.interact();
		};
		const onBlur = () => scoreTrackerRef.current?.suspend();
		const onVisibility = () => { if (document.visibilityState !== 'visible') onBlur(); };
		document.addEventListener('pointerdown', onInteraction, true);
		document.addEventListener('keydown', onInteraction, true);
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('blur', onBlur);
		return () => {
			document.removeEventListener('pointerdown', onInteraction, true);
			document.removeEventListener('keydown', onInteraction, true);
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('blur', onBlur);
			scoreTrackerRef.current?.stop();
			scoreTrackerRef.current = null;
			scoreInputRef.current = null;
			scorePendingEffectsRef.current?.clear();
		};
	}, [trackUri, ensureScoreTracker]);
}
