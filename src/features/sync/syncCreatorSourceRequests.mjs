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
