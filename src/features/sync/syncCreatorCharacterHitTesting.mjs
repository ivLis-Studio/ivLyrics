import { getSyncCreatorCharIndexFromCodeUnitOffset } from './syncCreatorLyricText.mjs';

const TEXT_NODE = 3;
const SHOW_TEXT = 4;

function getTextOffset(document, element, node, offset) {
	if (node?.nodeType !== TEXT_NODE || !element.contains(node)) return null;
	const walker = document.createTreeWalker(element, SHOW_TEXT);
	let totalOffset = 0;
	for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
		if (textNode === node) return totalOffset + offset;
		totalOffset += textNode.nodeValue?.length || 0;
	}
	return null;
}

function getTextRunIndex(document, element, charCount, codeUnitOffsets, isRtl, clientX, clientY) {
	const caret = typeof document.caretPositionFromPoint === 'function'
		? document.caretPositionFromPoint(clientX, clientY)
		: null;
	let offset = getTextOffset(document, element, caret?.offsetNode, caret?.offset || 0);
	if (offset === null && typeof document.caretRangeFromPoint === 'function') {
		const range = document.caretRangeFromPoint(clientX, clientY);
		offset = getTextOffset(document, element, range?.startContainer, range?.startOffset || 0);
	}
	if (offset !== null) return getSyncCreatorCharIndexFromCodeUnitOffset(codeUnitOffsets, offset);

	const rect = element.getBoundingClientRect();
	if (!(rect.width > 0)) return null;
	const position = isRtl ? rect.right - clientX : clientX - rect.left;
	const ratio = Math.max(0, Math.min(1, position / rect.width));
	return Math.max(0, Math.min(charCount - 1, Math.floor(ratio * charCount)));
}

function containsPoint(rect, x, y) {
	return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getCachedHitIndex(boxes, x, y) {
	let firstIndex = -1;
	let lastIndex = -1;
	let closestIndex = 0;
	let closestDistance = Infinity;
	for (let i = 0; i < boxes.length; i++) {
		const box = boxes[i];
		if (!box) continue;
		if (containsPoint(box, x, y)) return i;
		if (firstIndex === -1) firstIndex = i;
		lastIndex = i;
		const distance = Math.abs(x - box.centerX);
		if (distance < closestDistance) {
			closestDistance = distance;
			closestIndex = i;
		}
	}
	if (firstIndex === -1) return null;
	if (x < boxes[firstIndex].left) return firstIndex;
	if (x > boxes[lastIndex].right) return lastIndex;
	return closestIndex;
}

function getRenderedHitIndex(elements, x, y) {
	const lastIndex = elements.length - 1;
	let firstRect;
	let lastRect;
	let closestIndex = 0;
	let closestDistance = Infinity;
	for (let i = 0; i < elements.length; i++) {
		const rect = elements[i]?.getBoundingClientRect();
		if (!rect) continue;
		if (containsPoint(rect, x, y)) return i;
		if (i === 0) firstRect = rect;
		if (i === lastIndex) lastRect = rect;
		const distance = Math.abs(x - (rect.left + rect.width / 2));
		if (distance < closestDistance) {
			closestDistance = distance;
			closestIndex = i;
		}
	}
	if (!firstRect || !lastRect || x < firstRect.left) return 0;
	if (x > lastRect.right) return lastIndex;
	return closestIndex;
}

export function createSyncCreatorCharacterHitTesting({
	document, useCurrentLineTextRun, isCurrentLineRtl, charCount, codeUnitOffsets,
	refs: { rtlTextRunRef, charElementsRef, charHitBoxesRef, charScrollMetricsRef },
}) {
	const cacheCharHitBoxes = () => {
		const boxes = [];
		const scrollMetrics = [];
		if (!useCurrentLineTextRun) {
			for (const element of charElementsRef.current) {
				if (!element) {
					boxes.push(null);
					scrollMetrics.push(null);
					continue;
				}
				const rect = element.getBoundingClientRect();
				boxes.push({
					left: rect.left,
					right: rect.right,
					top: rect.top,
					bottom: rect.bottom,
					centerX: rect.left + rect.width / 2,
				});
				const width = element.offsetWidth || rect.width || 0;
				scrollMetrics.push({ center: (element.offsetLeft || 0) + width / 2 });
			}
		}
		charHitBoxesRef.current = boxes;
		charScrollMetricsRef.current = scrollMetrics;
	};

	const getCharIndexFromPoint = (x, y) => {
		if (useCurrentLineTextRun && rtlTextRunRef.current && charCount > 0) {
			const index = getTextRunIndex(document, rtlTextRunRef.current, charCount, codeUnitOffsets, isCurrentLineRtl, x, y);
			if (index !== null) return index;
		}
		return getCachedHitIndex(charHitBoxesRef.current, x, y)
			?? getRenderedHitIndex(charElementsRef.current, x, y);
	};

	return { cacheCharHitBoxes, getCharIndexFromPoint };
}
