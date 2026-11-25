import { runWithAbortSignal } from "../../core/abortableOperation.mjs";

// Spicetify's library calls do not accept a signal. Retiring a read releases
// its menus immediately and prevents the rest of the lookup from starting.
export function createSpotifyPlaylistReadPool() {
	const pending = new Map();

	return async function readShared(key, signal, read) {
		if (signal?.aborted) return null;
		let job = pending.get(key);
		if (!job) {
			job = { controller: new AbortController(), readers: 0 };
			const finish = () => { if (pending.get(key) === job) pending.delete(key); };
			job.promise = runWithAbortSignal(job.controller.signal, () => read(job.controller.signal))
				.catch(error => {
					if (job.controller.signal.aborted) return null;
					throw error;
				}).finally(finish);
			pending.set(key, job);
		}

		job.readers++;
		let subscribed = true;
		const detach = () => {
			if (!subscribed) return;
			subscribed = false;
			job.readers--;
			if (job.readers || pending.get(key) !== job) return;
			pending.delete(key);
			job.controller.abort();
		};
		signal?.addEventListener("abort", detach, { once: true });
		try {
			return await runWithAbortSignal(signal, () => job.promise);
		} catch (error) {
			if (signal?.aborted) return null;
			throw error;
		} finally {
			signal?.removeEventListener("abort", detach);
			detach();
		}
	};
}
