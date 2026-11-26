import { createSyncCreatorImportPicker } from './syncCreatorFileTransfer.mjs';

export function createSyncCreatorSourceRequests({ lifetime, isCurrentRevision }) {
	let active = null;

	return {
		begin(startDraftChange) {
			if (!lifetime.canStartOperation()) return null;
			const previous = active;
			const ownsEditor = lifetime.captureOperation(() => true);
			const id = startDraftChange();
			if (id === null) return null;
			active = { id, ownsEditor, controller: new AbortController() };
			previous?.controller.abort();
			return id;
		},
		isCurrent(id) {
			return active !== null && active.id === id && active.ownsEditor() && isCurrentRevision(id);
		},
		getSignal(id) {
			return active !== null && active.id === id ? active.controller.signal : undefined;
		},
		cancel() {
			const previous = active;
			active = null;
			previous?.controller.abort();
			return previous !== null;
		},
	};
}

export function useSyncCreatorSourceOperations({
	react: { useMemo, useCallback, useLayoutEffect }, lifetime, captureEditorDraftOwnership,
	beginDraftSourceChange, isCurrentRevision, claimDraftForLocalEditing, setIsLoading, setIsLoadingLrclibId,
}) {
	const imports = useMemo(() => createSyncCreatorImportPicker({
		isEditorOpen: lifetime.canStartOperation, captureDraftOwnership: captureEditorDraftOwnership,
	}), [lifetime, captureEditorDraftOwnership]);
	const sources = useMemo(() => createSyncCreatorSourceRequests({
		lifetime, isCurrentRevision,
	}), [lifetime, isCurrentRevision]);

	const beginSourceChange = useCallback(() => sources.begin(() => {
		const id = beginDraftSourceChange();
		imports.cancel();
		return id;
	}), [beginDraftSourceChange, imports, sources]);

	const claimSessionForLocalEditing = useCallback(() => {
		claimDraftForLocalEditing();
		imports.cancel();
	}, [claimDraftForLocalEditing, imports]);

	const cancelSourceLoading = useCallback(() => {
		if (sources.cancel()) {
			setIsLoading(false);
			setIsLoadingLrclibId(false);
		}
	}, [sources, setIsLoading, setIsLoadingLrclibId]);

	useLayoutEffect(() => () => {
		imports.cancel();
		sources.cancel();
	}, [imports, sources]);

	return {
		openImportPicker: imports.open,
		cancelImport: imports.cancel,
		claimSessionForLocalEditing,
		beginSourceChange,
		isCurrentSourceChange: sources.isCurrent,
		getSourceSignal: sources.getSignal,
		cancelSourceLoading,
	};
}
