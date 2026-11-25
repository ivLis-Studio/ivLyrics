export const KARAOKE_VOCAL_STACK_CENTER_THRESHOLD = 4;

export const getElementOffsetTopWithin = (element, container) => {
	if (!element || !container) {
		return 0;
	}

	let top = 0;
	let node = element;
	while (node && node !== container) {
		top += Number(node.offsetTop) || 0;
		node = node.offsetParent;
	}

	if (node === container) {
		return top;
	}

	const elementRect = element.getBoundingClientRect();
	const containerRect = container.getBoundingClientRect();
	return (elementRect.top - containerRect.top) + (container.scrollTop || 0);
};

export const getKaraokeVocalAnchorCenterWithinLine = (activeLine) => {
	if (!activeLine || typeof activeLine.querySelector !== "function") {
		return null;
	}

	const stack = activeLine.querySelector(".lyrics-karaoke-stack[data-karaoke-vocal-row-count]");
	const rowCount = Number(stack?.getAttribute("data-karaoke-vocal-row-count"));
	const rawAnchorPosition = stack?.getAttribute("data-karaoke-vocal-anchor-position");
	// Before the first vocal row starts, the playback anchor is intentionally absent.
	// Still center the first row so a multi-vocal block does not get centered as a
	// whole and then jump upward as soon as that first row becomes active.
	const anchorPosition = rawAnchorPosition === null ? 0 : Number(rawAnchorPosition);
	if (
		!stack
		|| !Number.isFinite(anchorPosition)
		|| !Number.isFinite(rowCount)
		|| rowCount < KARAOKE_VOCAL_STACK_CENTER_THRESHOLD
	) {
		return null;
	}

	const rows = Array.from(stack.querySelectorAll("[data-karaoke-vocal-row-index]"));
	if (rows.length === 0) {
		return null;
	}

	const rowByIndex = new Map(rows.map((row) => [
		Number(row.getAttribute("data-karaoke-vocal-row-index")),
		row,
	]));
	const lowerIndex = Math.max(0, Math.min(rowCount - 1, Math.floor(anchorPosition)));
	const upperIndex = Math.max(0, Math.min(rowCount - 1, Math.ceil(anchorPosition)));
	const lowerRow = rowByIndex.get(lowerIndex);
	const upperRow = rowByIndex.get(upperIndex) || lowerRow;
	if (!lowerRow || !upperRow) {
		return null;
	}

	const lineRect = activeLine.getBoundingClientRect();
	const rowCenter = (row) => {
		const rect = row.getBoundingClientRect();
		return rect.top - lineRect.top + rect.height / 2;
	};
	const lowerCenter = rowCenter(lowerRow);
	const upperCenter = rowCenter(upperRow);
	const progress = Math.max(0, Math.min(1, anchorPosition - lowerIndex));
	return lowerCenter + (upperCenter - lowerCenter) * progress;
};

export const getActiveLineAnchorCenter = (activeLine) => {
	const vocalAnchorCenter = getKaraokeVocalAnchorCenterWithinLine(activeLine);
	if (vocalAnchorCenter !== null) {
		return vocalAnchorCenter;
	}

	const lineHeight = activeLine?.clientHeight || activeLine?.getBoundingClientRect?.().height || 0;
	return lineHeight / 2;
};

export function createLyricsScrollGeometry(readComputedStyle) {
	const getLyricsAnchorRatio = (container) => {
		if (!container) {
			return 0.5;
		}

		const rawAnchorRatio = readComputedStyle(container).getPropertyValue("--ivfs-lyrics-anchor-ratio").trim();
		const parsedAnchorRatio = Number.parseFloat(rawAnchorRatio);

		return Number.isFinite(parsedAnchorRatio)
			? Math.min(0.95, Math.max(0.05, parsedAnchorRatio))
			: 0.5;
	};

	const getCompactSyncedOffset = (container, activeLine, isScrolling) => {
		if (!container || !activeLine || isScrolling) {
			return 0;
		}

		const anchorRatio = getLyricsAnchorRatio(container);
		const anchorOffset = container.clientHeight * anchorRatio;
		const activeLineTop = getElementOffsetTopWithin(activeLine, container);
		return anchorOffset - (activeLineTop + getActiveLineAnchorCenter(activeLine));
	};

	const getExpandedScrollTarget = (container, activeLine) => {
		const anchorRatio = getLyricsAnchorRatio(container);
		const containerHeight = container.clientHeight || 0;
		const lineAnchorCenter = getActiveLineAnchorCenter(activeLine);
		const activeLineTop = getElementOffsetTopWithin(activeLine, container);
		const targetTop = activeLineTop - (containerHeight * anchorRatio - lineAnchorCenter);
		const maxScrollTop = Math.max(0, container.scrollHeight - containerHeight);
		return Math.max(0, Math.min(targetTop, maxScrollTop));
	};

	return { getLyricsAnchorRatio, getCompactSyncedOffset, getExpandedScrollTarget };
}
