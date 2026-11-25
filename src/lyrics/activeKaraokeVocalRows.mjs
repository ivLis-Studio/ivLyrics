const LIST_SELECTOR = ":scope > .lyrics-lyricsContainer-SyncedLyrics";
const ANCHOR_ATTRIBUTE = "data-active-karaoke-vocal-row-index";
const STACK_SELECTOR = `.lyrics-karaoke-stack[${ANCHOR_ATTRIBUTE}]`;
const LIST_ATTRIBUTE = "data-active-vocal-row";

export function observeActiveKaraokeVocalRows(page, Observer = globalThis.MutationObserver) {
	if (!page || typeof Observer !== "function") return undefined;

	let list = null;
	const anchoredStacks = new Set();

	const updateStack = (stack) => {
		if (list.contains(stack) && stack.matches(STACK_SELECTOR) && Number(stack.getAttribute(ANCHOR_ATTRIBUTE)) >= 0) {
			anchoredStacks.add(stack);
		} else {
			anchoredStacks.delete(stack);
		}
	};
	const updateMarker = () => {
		const anchored = anchoredStacks.size > 0;
		if (anchored !== list.hasAttribute(LIST_ATTRIBUTE)) list.toggleAttribute(LIST_ATTRIBUTE, anchored);
	};
	const refreshList = () => {
		const next = page.querySelector(LIST_SELECTOR);
		if (next === list) return false;
		list?.removeAttribute(LIST_ATTRIBUTE);
		list = next;
		anchoredStacks.clear();
		if (list) {
			list.querySelectorAll(STACK_SELECTOR).forEach(updateStack);
			updateMarker();
		}
		return true;
	};

	// React keeps the stack's class stable. Attribute changes only need to
	// check their target. Scan new branches when rows or the whole list mount.
	const observer = new Observer(records => {
		if (records.some(record => record.type === "childList" && record.target === page) && refreshList()) return;
		if (!list) return;

		let mayHaveRemovals = false;
		for (const record of records) {
			if (record.type === "attributes") {
				updateStack(record.target);
			} else if (list.contains(record.target)) {
				mayHaveRemovals ||= record.removedNodes.length > 0;
				for (const node of record.addedNodes) {
					if (node.nodeType !== 1 || !list.contains(node)) continue;
					if (node.matches(STACK_SELECTOR)) updateStack(node);
					if (node.firstElementChild) node.querySelectorAll(STACK_SELECTOR).forEach(updateStack);
				}
			}
		}
		if (mayHaveRemovals) {
			for (const stack of anchoredStacks) {
				if (!list.contains(stack)) anchoredStacks.delete(stack);
			}
		}
		updateMarker();
	});
	observer.observe(page, { subtree: true, childList: true, attributes: true, attributeFilter: [ANCHOR_ATTRIBUTE] });
	refreshList();

	return () => {
		observer.disconnect();
		list?.removeAttribute(LIST_ATTRIBUTE);
	};
}
