import { buildSyncCreatorImportedScoreWork } from "./syncCreatorScoreSnapshots.mjs";

// A replacement already includes its source's layout and timing edits.
export function clearSyncCreatorLayoutDrafts(layout) {
	layout.setParallelPartMetaDrafts({});
	layout.setManualParallelSplitDrafts({});
	layout.setParentheticalLayoutDrafts({});
	layout.setMergedLineDrafts({});
	layout.setLineMetaDrafts({});
	layout.setLineStyleDrafts({});
}

function setReplacementVocalMode(data, layout) {
	layout.setPendingParentheticalLayoutDecision(null);
	layout.setPendingMultiVocalDecision(null);
	const hasParallel = data.lines.some(line => Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1);
	layout.setMultiVocalMode(hasParallel);
	layout.setActiveParallelPartId(hasParallel ? '' : 'full');
}

function rememberPublishedSync(data, draft, editor) {
	draft.serverBaselineSyncDataRef.current = draft.syncCreatorDraftStore?.cloneValue?.(data) || data;
	editor.setHasUnsubmittedSync(false);
	editor.setHasPublishedSync(true);
}

export function applySyncCreatorImportedSession(data, target, { draft, layout, editor }) {
	const lrclibSource = target.lrclibSource || (data.source?.provider === 'lrclib' ? data.source : null);
	const draftKey = draft.syncCreatorDraftStore?.createDraftKey?.({
		trackKey: draft.sessionTrackKey,
		provider: target.provider,
		addonId: target.addonId,
		lyricsFingerprint: target.lyricsFingerprint,
		lrclibId: lrclibSource?.lrclibId ?? '',
	}) || draft.activeSessionDraftKey;
	draft.beginDraftImport(draftKey);
	draft.adoptImportedDraftKey(draftKey);
	clearSyncCreatorLayoutDrafts(layout);
	layout.setGlobalOffset(0);
	setReplacementVocalMode(data, layout);
	editor.resetCurrentSyncInput();
	editor.setSyncData(data);
	editor.setSelectedLrclibSourceValue(lrclibSource);
	draft.markDraftDirty();
}

export function commitSyncCreatorFileImport(data, target, { draft, layout, editor, score, cancelSourceLoading }) {
	// A file's timing and its target baseline must enter the work queue before
	// replacing the editor state, even when importing the same file repeatedly.
	const work = target.activate && buildSyncCreatorImportedScoreWork(data, target, score.encoding);
	score.inputRef.current = null;
	score.pendingEffectsRef.current?.clear();
	score.captureWork('import', data, undefined, work);
	cancelSourceLoading();
	target.activate?.();
	applySyncCreatorImportedSession(data, target, { draft, layout, editor });
}

export async function restoreSyncCreatorPublishedSession(data, { draft, layout, editor, isEditorOpen, isDraftCurrent }) {
	const ownsDraft = await draft.deleteActiveSyncCreatorDraft({ resumeAutosave: true, isDraftCurrent });
	if (!ownsDraft || !isEditorOpen()) return false;
	editor.resetCurrentSyncInput();
	clearSyncCreatorLayoutDrafts(layout);
	setReplacementVocalMode(data, layout);
	layout.setGlobalOffset(0);
	editor.setCurrentLineIndex(0);
	editor.setSyncData(data);
	editor.setMode('idle');
	rememberPublishedSync(data, draft, editor);
	return true;
}

export async function finishSyncCreatorPublication(isrc, data, {
	clearPublishedCaches, draft, editor, isDraftCurrent, isEditorOpen,
}) {
	// A successful request still changes the published song after the editor moves on.
	await clearPublishedCaches(isrc);
	if (!isDraftCurrent()) return;
	const ownsDraft = await draft.deleteActiveSyncCreatorDraft({ isDraftCurrent });
	if (!ownsDraft || !isEditorOpen()) return;
	rememberPublishedSync(data, draft, editor);
	await editor.onClose?.();
}
