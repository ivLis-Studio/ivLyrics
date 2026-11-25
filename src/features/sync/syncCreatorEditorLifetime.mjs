export function createSyncCreatorEditorLifetime(isAttached) {
	let closing = false;
	let closed = false;
	let closeRevision = 0;

	const isOpen = () => !closed && isAttached();
	const canStartOperation = () => !closing && isOpen();

	function captureOperation(ownsDraft) {
		const revision = closeRevision;
		return () => revision === closeRevision && canStartOperation() && ownsDraft();
	}

	async function requestClose({ stopRecording, saveDraft, onSaveError, onClosed }) {
		if (!canStartOperation()) return;
		closing = true;
		closeRevision++;
		try {
			stopRecording();
			const saved = await saveDraft();
			if (!isOpen()) return;
			if (!saved) {
				onSaveError();
				return;
			}
			closed = true;
			onClosed();
		} finally {
			closing = false;
		}
	}

	return { isOpen, canStartOperation, captureOperation, requestClose };
}
