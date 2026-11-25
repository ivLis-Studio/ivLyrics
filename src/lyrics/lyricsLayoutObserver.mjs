export function createLyricsLayoutObserver({ ResizeObserver, MutationObserver, scheduleFrame, cancelFrame }) {
	let frameId = null;
	let container = null;
	let activeLine = null;
	let syncLayout = null;
	let disposed = false;
	let contentChanged = false;
	const cancelPending = () => {
		if (frameId !== null) cancelFrame(frameId);
		frameId = null;
		contentChanged = false;
	};
	const scheduleSync = (changed = false) => {
		if (disposed) return;
		contentChanged ||= changed;
		if (frameId !== null) return;
		frameId = scheduleFrame(() => {
			frameId = null;
			const changed = contentChanged;
			contentChanged = false;
			if (!disposed) syncLayout?.(changed);
		});
	};
	const resizeObserver = new ResizeObserver(() => scheduleSync());
	const mutationObserver = typeof MutationObserver === "function"
		? new MutationObserver((records = []) => scheduleSync(records.some(
			record => record.type === "childList" || record.type === "characterData"
		))) : null;
	return {
		cancelPending,
		scheduleSync,
		update(nextContainer, nextActiveLine, callback) {
			if (disposed) return;
			syncLayout = callback;
			const targetsChanged = nextContainer !== container || nextActiveLine !== activeLine;
			// Retain each observation until its DOM target changes. Re-observing
			// unchanged rows delivers an extra initial resize notification.
			if (nextContainer !== container) {
				if (container) resizeObserver.unobserve(container);
				container = nextContainer;
				if (container) resizeObserver.observe(container);
			}
			if (nextActiveLine !== activeLine) {
				if (activeLine) resizeObserver.unobserve(activeLine);
				activeLine = nextActiveLine;
				if (activeLine) resizeObserver.observe(activeLine);
			}
			if (targetsChanged) {
				mutationObserver?.disconnect();
				// One subtree observation also catches a predecessor's asynchronous
				// word stack. Glyph fill/style/class writes are deliberately excluded.
				if (container) mutationObserver?.observe(container, {
					childList: true, characterData: true, subtree: true,
				});
				if (activeLine) {
					mutationObserver?.observe(activeLine, {
						attributes: true,
						attributeFilter: ["data-karaoke-vocal-anchor-position", "data-karaoke-vocal-anchor-window-ms"],
						subtree: true,
					});
				}
			}
		},
		disconnect() {
			disposed = true;
			cancelPending();
			resizeObserver.disconnect();
			mutationObserver?.disconnect();
			container = activeLine = syncLayout = null;
		},
	};
}
