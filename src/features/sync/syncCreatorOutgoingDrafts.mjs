import { captureSyncCreatorDraftWriteOptions } from './syncCreatorDraftAutosave.mjs';

export function createSyncCreatorOutgoingDrafts({ store, resetRevisions, onWriteError }) {
	const writes = new Map();

	function remove(write) {
		if (writes.get(write.record.draftKey) === write) writes.delete(write.record.draftKey);
	}

	function save(write) {
		if (write.pending) return write.pending;
		if (!write.options.isCurrent()) {
			remove(write);
			return;
		}
		const pending = (async () => store.saveDraft(write.record, write.options))();
		write.pending = pending;
		pending.then(() => remove(write), () => { write.pending = null; });
		return pending;
	}

	function enqueue(record, saveIf, baselineSnapshot) {
		const write = {
			record,
			options: {
				...captureSyncCreatorDraftWriteOptions(resetRevisions, record.draftKey, saveIf),
				baselineSnapshot,
			},
			pending: null,
		};
		writes.set(record.draftKey, write);
		// Queue before the next source can query the store for drafts.
		save(write)?.catch(onWriteError);
	}

	async function flush() {
		while (writes.size > 0) {
			await Promise.all([...writes.values()].map(save));
		}
	}

	async function readPending(draftKey) {
		const write = writes.get(draftKey);
		if (!write) return null;
		const { saveIf, isCurrent } = write.options;
		if (saveIf && !(await saveIf)) return null;
		return writes.get(draftKey) === write && isCurrent() ? write.record : null;
	}

	function newestRecord(stored, pending) {
		if (!pending || (stored && stored.clientRevision >= pending.clientRevision)) return stored;
		// A stalled autosave carries the new editor state but no checkpoint list.
		return { ...stored, ...pending };
	}

	async function readDraft(draftKey) {
		try {
			const stored = await store.getDraft(draftKey);
			return newestRecord(stored, await readPending(draftKey));
		} catch (error) {
			const pending = await readPending(draftKey);
			if (pending) return pending;
			throw error;
		}
	}

	async function readTrackDrafts(trackKey) {
		let stored;
		let readError;
		try {
			stored = await store.getDraftsForTrack(trackKey);
		} catch (error) {
			readError = error;
		}
		const keys = [...writes.values()].filter(({ record }) => record.trackKey === trackKey)
			.map(({ record }) => record.draftKey);
		const pending = (await Promise.all(keys.map(readPending))).filter(Boolean);
		if (pending.length === 0) {
			if (readError) throw readError;
			return stored;
		}
		const drafts = new Map((stored || []).map(record => [record.draftKey, record]));
		for (const record of pending) {
			drafts.set(record.draftKey, newestRecord(drafts.get(record.draftKey), record));
		}
		return [...drafts.values()].sort((left, right) => right.updatedAt - left.updatedAt);
	}

	return { enqueue, flush, readDraft, readTrackDrafts, get hasPending() { return writes.size > 0; } };
}
