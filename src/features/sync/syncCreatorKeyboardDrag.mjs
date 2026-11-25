const INITIAL_STEPS = 3;
const REPEAT_INTERVAL_MS = 27;

export function stopSyncCreatorKeyboardDrag(activeDragRef, cancelInterval) {
	const drag = activeDragRef.current;
	activeDragRef.current = null;
	if (drag?.timer != null) cancelInterval(drag.timer);
}

export function startSyncCreatorKeyboardDrag(activeDragRef, { advance, scheduleInterval, cancelInterval }) {
	if (activeDragRef.current) return;
	const drag = { timer: null };
	activeDragRef.current = drag;

	const step = () => {
		if (activeDragRef.current !== drag) return false;
		const completed = advance() === -1;
		if (activeDragRef.current !== drag) return false;
		if (completed) stopSyncCreatorKeyboardDrag(activeDragRef, cancelInterval);
		return !completed;
	};

	for (let index = 0; index < INITIAL_STEPS; index++) {
		if (!step()) return;
	}
	drag.timer = scheduleInterval(step, REPEAT_INTERVAL_MS);
}
