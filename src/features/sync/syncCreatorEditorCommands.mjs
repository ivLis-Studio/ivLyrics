import { normalizeSyncCreatorGranularity } from './timingGranularity.mjs';
import { clearSyncCreatorLayoutDrafts } from './syncCreatorSessionReplacement.mjs';

export function createSyncCreatorEditorCommands({
	lifetime, mode, syncGranularity, isCurrentSyncTargetMetaComplete, getPlayer,
	refs: { manualPreviewExitRef, pendingPlaybackNavigationRef, lyricsScrollRef },
	draft: { claimSessionForLocalEditing, captureEditorDraftOwnership, deleteActiveSyncCreatorDraft },
	editor: {
		clearLyricTextSelection, clearOffsetSelection, resetCurrentSyncInput,
		setMode, setSyncGranularity, setCurrentLineIndex, setSyncData,
	},
	layout,
	dialog: { showMissingMetaToast, confirm, translate },
}) {
	function changeGranularity(value) {
		if (!lifetime.canStartOperation()) return;
		const next = normalizeSyncCreatorGranularity(value);
		if (next === syncGranularity) return;
		claimSessionForLocalEditing();
		resetCurrentSyncInput();
		setSyncGranularity(next);
	}

	function toggleMode(requestedMode) {
		if (!lifetime.canStartOperation()) return;
		const nextMode = requestedMode === mode ? 'idle' : requestedMode;
		if (nextMode === 'record' && !isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return;
		}
		claimSessionForLocalEditing();
		clearLyricTextSelection();
		clearOffsetSelection();
		// A preview interval may run before React unmounts its old effect.
		manualPreviewExitRef.current = mode === 'preview';
		setMode(nextMode);
		if (nextMode !== 'idle') {
			const player = getPlayer();
			if (player && !player.isPlaying()) player.play();
		}
	}

	async function resetFromStart() {
		if (!lifetime.canStartOperation()) return;
		const isDraftCurrent = captureEditorDraftOwnership();
		if (!confirm(translate('syncCreator.resetConfirm')
			|| '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.\n정말 처음부터 다시 시작할까요?') || !isDraftCurrent()) return;
		const cleared = await deleteActiveSyncCreatorDraft({ resumeAutosave: true, isDraftCurrent });
		// Close waits for a deletion which storage has already accepted.
		if (!cleared || !lifetime.isOpen()) return;
		resetCurrentSyncInput();
		pendingPlaybackNavigationRef.current = false;
		manualPreviewExitRef.current = mode === 'preview';
		setCurrentLineIndex(0);
		setSyncData(null);
		clearSyncCreatorLayoutDrafts(layout);
		layout.setPendingParentheticalLayoutDecision(null);
		layout.setGlobalOffset(0);
		setMode('idle');
		getPlayer()?.seek(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}

	return { changeGranularity, toggleMode, resetFromStart };
}
