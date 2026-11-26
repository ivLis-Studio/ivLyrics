import { normalizeSyncDataIsrc } from "../../lyrics/syncDataIdentity.mjs";
import { isCompleteSyncCreatorLrclibSource } from './lrclibSyncSource.mjs';
import { hasPublishedSyncLines, prepareSyncCreatorPublishedSync, requestSyncCreatorPublishedSync } from './syncCreatorLoadedSource.mjs';
import { createSyncCreatorSubmissionData, inspectSyncCreatorSubmission } from './syncCreatorSubmission.mjs';
import { getSyncCreatorSubmitErrorMessage, sendSyncCreatorSubmission } from './syncCreatorSubmissionTransport.mjs';
import { sanitizeSyncCreatorLastCharEnds } from './timingValidation.mjs';
import { finishSyncCreatorPublication, restoreSyncCreatorPublishedSession } from './syncCreatorSessionReplacement.mjs';

export function createSyncCreatorPublicationRunner({ isEditorOpen, captureDraftOwnership }) {
	let pending = false;
	return async function runPublication(operation, canContinue = () => true) {
		if (pending || !isEditorOpen()) return;
		pending = true;
		try {
			const ownsDraft = captureDraftOwnership();
			return await operation(() => isEditorOpen() && ownsDraft() && canContinue());
		} finally {
			pending = false;
		}
	};
}

export function createSyncCreatorPublicationActions({
	runPublication, track, canEdit, isRecording, hasHeldInput, lyrics, syncData, hasUnsubmittedSync,
	timing, vocals, draft, published, layout, editor, isEditorOpen, dialog, transport, clearPublishedCaches,
}) {
	const { text, ...submissionLyrics } = lyrics;
	const isProviderCurrent = () => track.getProvider() === track.provider;
	const canStillSubmit = () => isProviderCurrent() && !hasHeldInput();
	return {
		revert: () => runPublication(isDraftCurrent => revertSyncCreatorEdits({
			track, canEdit, recording: isRecording, lyricsText: text,
			hasLocalWork: hasUnsubmittedSync || Boolean(syncData?.lines?.length),
			readBaseline: published.readBaseline,
			getSyncService: transport.getSyncService, timing: { getCodec: timing.getCodec, sanitize: timing.sanitize },
			dialog: { ...dialog, setBusy: dialog.setReverting },
			isDraftCurrent,
			onReverted: data => restoreSyncCreatorPublishedSession(data, {
				isEditorOpen, isDraftCurrent, draft, layout, editor, updatePublishedBaseline: published.updateBaseline,
			}),
		})),
		submit: () => runPublication(isDraftCurrent => {
			const ownsSource = draft.captureSourceOwnership();
			return submitSyncCreatorEdits({
				track, canEdit, syncData, lyrics: submissionLyrics, timing, vocals, transport,
				dialog: { ...dialog, setBusy: dialog.setSubmitting },
				isDraftCurrent,
				onPublished: (isrc, data, provider) => finishSyncCreatorPublication(isrc, data, {
					clearPublishedCaches: resolvedIsrc => clearPublishedCaches(resolvedIsrc, provider),
					isDraftCurrent, isEditorOpen, draft, editor,
					isSourceCurrent: () => ownsSource() && isProviderCurrent(),
					updatePublishedBaseline: published.updateBaseline,
				}),
			});
		}, canStillSubmit),
	};
}

export async function submitSyncCreatorEdits({
	track, canEdit, syncData, lyrics, vocals, timing, transport, dialog, isDraftCurrent, onPublished,
}) {
	const { toast, translate, confirm, setBusy } = dialog;
	if (!canEdit || !isDraftCurrent()) return;
	if (!syncData?.lines || syncData.lines.length === 0) {
		toast.error(translate('syncCreator.noSyncData'));
		return;
	}
	let busy = false;
	try {
		const { materialize, attachSource, validate, compact } = timing;
		const materialized = sanitizeSyncCreatorLastCharEnds(materialize(syncData));
		const { multiVocalMode, coverage, metadata } = vocals;
		const result = inspectSyncCreatorSubmission({
			...coverage, syncData: materialized, lyricsLines: lyrics.lines,
			lineCharOffsets: lyrics.offsets, multiVocalMode,
		});
		if (result.issue) {
			const { key, lineNumber, fallback } = result.issue;
			toast.error(translate(key, { line: lineNumber }) || fallback);
			return;
		}
		if (result.incomplete && !confirm(translate('syncCreator.incompleteConfirm'))) return;

		const { id, title, artist, album, info, durationMs } = track;
		const provider = track.provider || track.getProvider?.();
		const expanded = attachSource(createSyncCreatorSubmissionData(materialized, {
			...metadata, multiVocalMode, trackDurationMs: durationMs,
		}));
		if (provider === 'lrclib' && !isCompleteSyncCreatorLrclibSource(expanded?.source)) {
			toast.error(translate('syncCreator.lrclibIdInvalid') || 'Enter a valid LRCLIB ID.');
			return;
		}
		validate(expanded);
		const encoded = compact(expanded, lyrics.chars, lyrics.language || undefined);
		busy = true;
		setBusy(true);
		const isrc = track.isrc
			|| await transport.getSyncService()?.resolveTrackIsrc?.(id, { ...info, title, artist, album })
			|| '';
		if (!isDraftCurrent()) return;
		if (!isrc) {
			toast.error('이 곡의 ISRC를 확인할 수 없어 sync-data를 등록할 수 없습니다.');
			return;
		}

		const submission = await sendSyncCreatorSubmission({
			...transport,
			isDraftCurrent,
			saveWork: data => transport.saveWork(data, isrc),
			syncData: encoded, trackId: id, provider, isrc, title, artist, album, durationMs, translate,
		});
		if (submission.cancelled) return;
		if (!submission.submitted) {
			if (isDraftCurrent()) toast.error(submission.message);
			return;
		}
		try {
			if (isDraftCurrent()) toast.success(translate('syncCreator.submitSuccess'));
			await onPublished(isrc, expanded, provider);
		} catch (error) {
			console.warn('[SyncDataCreator] Failed to refresh local state after publishing:', error);
		}
	} catch (error) {
		console.error('[SyncDataCreator] Submit error:', error);
		if (isDraftCurrent()) toast.error(getSyncCreatorSubmitErrorMessage(error, translate));
	} finally {
		if (busy) setBusy(false);
	}
}

export async function revertSyncCreatorEdits({
	track, canEdit, recording, lyricsText, hasLocalWork, readBaseline, getSyncService, timing, dialog,
	isDraftCurrent, onReverted,
}) {
	const { toast, translate, confirm, setBusy } = dialog;
	if (!canEdit || !isDraftCurrent()) return;
	if (recording()) {
		toast.error(translate('syncCreator.historyStopRecording') || '기록을 멈춘 뒤 작업 내역을 복원하세요.');
		return;
	}
	if (!lyricsText || !lyricsText.trim()) {
		toast.error(translate('syncCreator.noLyrics') || 'No lyrics loaded');
		return;
	}
	if (hasLocalWork && !confirm(translate('syncCreator.revertConfirm') || 'Discard local sync edits and reload the published sync?')) return;

	setBusy(true);
	try {
		const { id, isrc, title, artist, album } = track;
		const provider = track.provider || track.getProvider?.() || null;
		let publishedBody = null;
		const service = getSyncService();
		if (service && id) {
			try {
				const existing = await requestSyncCreatorPublishedSync(service, id, provider, { isrc, title, artist, album });
				if (existing?.syncData?.lines) publishedBody = existing.syncData;
			} catch (error) {
				console.warn('[SyncDataCreator] Failed to reload the published sync data:', error);
			}
		}

		if (!isDraftCurrent()) return;
		publishedBody ||= readBaseline();
		if (!hasPublishedSyncLines(publishedBody)) {
			toast.error(translate('syncCreator.noPublishedSync') || 'No published sync found for this song.');
			return;
		}
		const restored = prepareSyncCreatorPublishedSync(publishedBody, lyricsText, timing);
		if (!restored) throw new Error('Published sync does not match the current lyrics.');
		if (await onReverted(restored)) {
			toast.success(translate('syncCreator.reverted') || 'Reloaded the published sync.');
		}
	} catch (error) {
		console.error('[SyncDataCreator] Failed to revert to the published sync:', error);
		if (isDraftCurrent()) toast.error(error?.message || translate('syncCreator.submitError'));
	} finally {
		setBusy(false);
	}
}

export async function clearSyncCreatorPublishedCaches(resolvedIsrc, {
	trackId, trackUri = trackId ? `spotify:track:${trackId}` : null, trackIsrc, provider,
	readSyncCreatorSyncService, getLyricsService, invalidatePageCache, dispatchSyncDataUpdated, warn = console.warn,
}) {
	const cacheIsrc = normalizeSyncDataIsrc(resolvedIsrc) || trackIsrc;
	try {
		if (cacheIsrc || trackId) {
			readSyncCreatorSyncService()?.clearCache?.(cacheIsrc || trackId, cacheIsrc ? { isrc: cacheIsrc } : {});
		}
	} catch (error) {
		warn('[SyncDataCreator] Failed to clear the published sync cache:', error);
	}
	const detail = {
		isrc: cacheIsrc || null,
		trackId,
		trackUri,
		provider,
	};
	try {
		const service = getLyricsService();
		if (trackUri) service?.clearLyricsSnapshot?.(trackUri);
		if (trackId) await service?.clearTrackCache?.(trackId);
	} catch (error) {
		warn('[SyncDataCreator] Failed to clear lyrics cache after sync-data submit:', error);
	} finally {
		if (trackUri) invalidatePageCache?.(trackUri);
		dispatchSyncDataUpdated(detail);
	}
}
