export function createLrclibSearchRequests({ isOpen, setPending }) {
	let active = null;
	let candidateRevision = 0;

	function dispose() {
		candidateRevision++;
		const previous = active;
		active = null;
		previous?.abort();
		return previous !== null;
	}

	return {
		begin() {
			if (!isOpen()) return null;
			dispose();
			const request = new AbortController();
			active = request;
			setPending(true);
			const isCurrent = () => request === active && isOpen();
			return {
				signal: request.signal,
				isCurrent,
				finish() {
					if (!isCurrent()) return;
					active = null;
					setPending(false);
				},
			};
		},
		cancel() {
			if (dispose() && isOpen()) setPending(false);
		},
		captureCandidates() {
			const revision = candidateRevision;
			return () => revision === candidateRevision && isOpen();
		},
		dispose,
	};
}
