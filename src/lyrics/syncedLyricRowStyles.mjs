import { getLyricsLineMotionStyle } from "./lyricsLineMotion.mjs";

const PARKED_ROW_MARGIN = 3;

export function createSyncedLyricRowStyleReader({
	compact, isScrolling, visualDisplayLineIndex, visualLineIndex, compactWindowStartIndex,
	linesBefore, linesAfter, trailingInterludeAfter, shiftDuration, offset, lineMotionPlan,
	getLinePresentation, parkedStyles,
}) {
	const activeStyles = new WeakMap();
	const activeIndex = compact ? visualDisplayLineIndex : visualLineIndex;
	const indexOrigin = activeIndex <= linesBefore ? activeIndex : linesBefore;
	const parkRows = compact && !isScrolling;
	const parkBefore = -(linesBefore + PARKED_ROW_MARGIN);
	const parkAfter = linesAfter + PARKED_ROW_MARGIN;

	const makeStyle = (index, presentation, motion) => ({
		cursor: "pointer",
		...presentation.speakerStyle,
		"--position-index": index,
		"--animation-index": Math.abs(index) + 1,
		"--line-shift-duration": shiftDuration,
		"--line-shift-delay": "0s",
		"--blur-index": Math.min(Math.abs(index), 3),
		"--offset": offset,
		...(motion ? getLyricsLineMotionStyle(index, motion) : null),
	});

	return function readStyle(line, visibleIndex, outsideVisibleRange) {
		const { lineNumber = visibleIndex, displayLineNumber = lineNumber } = line;
		const sourceIndex = compact ? displayLineNumber - compactWindowStartIndex : lineNumber;
		const index = sourceIndex - indexOrigin - (lineNumber <= trailingInterludeAfter ? 1 : 0);
		if (parkRows && outsideVisibleRange && (index < parkBefore || index > parkAfter)) {
			const parkedIndex = index < parkBefore ? parkBefore : parkAfter;
			const presentation = getLinePresentation(line);
			const previous = parkedStyles.get(line);
			// The anchor offset can stay frozen while a row is outside the travel window.
			if (previous?.index === parkedIndex && previous.shiftDuration === shiftDuration
				&& previous.presentation === presentation) return previous.style;
			const style = makeStyle(parkedIndex, presentation, null);
			parkedStyles.set(line, { index: parkedIndex, shiftDuration, presentation, style });
			return style;
		}
		let style = activeStyles.get(line);
		if (!style) {
			style = makeStyle(index, getLinePresentation(line), lineMotionPlan);
			activeStyles.set(line, style);
		}
		return style;
	};
}
