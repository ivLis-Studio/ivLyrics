function getDisplayLine(source, displayLineNumber, rowCache) {
	const cached = rowCache.get(source);
	if (cached?.displayLineNumber === displayLineNumber) return cached;
	const row = { ...source, displayLineNumber };
	rowCache.set(source, row);
	return row;
}

export function createCompactLyricsDisplay(paddedLyrics, rowCache) {
	const interludes = new Set();
	for (const line of paddedLyrics) {
		if (line?.interludeInfo?.isInterlude) interludes.add(line.lineNumber);
	}
	let current = null;
	let currentActive = null;
	let currentVisual = null;

	return function readDisplay(activeLineIndex, visualLineIndex = activeLineIndex) {
		const active = interludes.has(activeLineIndex) ? activeLineIndex : null;
		const visual = visualLineIndex !== active && interludes.has(visualLineIndex) ? visualLineIndex : null;
		if (current && ((active === currentActive && visual === currentVisual)
			|| (active === currentVisual && visual === currentActive))) return current;

		const rows = [];
		const indexByLineNumber = new Map();
		for (const line of paddedLyrics) {
			if (!line) continue;
			const { lineNumber } = line;
			if (line.interludeInfo?.isInterlude && lineNumber !== active && lineNumber !== visual) continue;
			if (!indexByLineNumber.has(lineNumber)) indexByLineNumber.set(lineNumber, rows.length);
			rows.push(getDisplayLine(line, rows.length, rowCache));
		}
		currentActive = active;
		currentVisual = visual;
		current = { rows, indexByLineNumber };
		return current;
	};
}
