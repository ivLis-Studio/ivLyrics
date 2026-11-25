const MOUNT_PADDING_MS = 60;

export function createBoardWindowIndex(boards) {
	const windows = [];
	let latestEnd = -Infinity;
	for (let index = 0; index < boards.length; index += 1) {
		const start = boards[index].appear - MOUNT_PADDING_MS;
		const end = boards[index].fadeEnd + MOUNT_PADDING_MS;
		if (!(start <= end)) continue;
		latestEnd = Math.max(latestEnd, end);
		windows.push({ index, start, end, latestEnd, earliestStart: start });
	}
	let earliestStart = Infinity;
	for (let index = windows.length - 1; index >= 0; index -= 1) {
		const window = windows[index];
		earliestStart = Math.min(earliestStart, window.start);
		window.earliestStart = earliestStart;
	}
	return windows;
}

export function collectVisibleBoards(windows, time, visible) {
	visible.clear();
	// A prefix maximum and suffix minimum let us skip whole stretches in either seek direction,
	// while keeping overlapping boards in their original order, even on out-of-order entrances.
	let low = 0;
	let high = windows.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (windows[middle].latestEnd < time) low = middle + 1;
		else high = middle;
	}
	for (let index = low; index < windows.length; index += 1) {
		const window = windows[index];
		if (!(window.earliestStart <= time)) break;
		if (window.start <= time && time <= window.end) visible.add(window.index);
	}
}
