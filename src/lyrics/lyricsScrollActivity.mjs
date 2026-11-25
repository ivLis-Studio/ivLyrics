const SYNCED_ROOT_SELECTOR = ".lyrics-lyricsContainer-SyncedLyrics";
const LYRIC_ROW_CLASS = "lyrics-lyricsContainer-LyricsLine";
const INTERACTIVE_TARGET = 'button, a[href], input, select, textarea, [role="button"], [contenteditable="true"]';
const ROW_ACTIVATION_KEYS = new Set(["Enter", " ", "Spacebar"]);
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"]);
const MANUAL_BLUR_LIMIT = 3;
const MANUAL_SCROLL_IDLE_MS = 3000;

// Manual scrolling moves the existing transformed lyric surface. A translated
// origin plus a spacer gives native scrolling room above and below the playhead
// without changing row widths, wrapping, gaps, or the fullscreen layout.
export function createSyncedLyricsScroller({
	container, onActiveChange, returnPositions, getAnchorRatio,
	hostEvents, player, createSpacer, scheduleFrame, cancelFrame, scheduleTimer, cancelTimer, now,
}) {
	let session = null;
	let idleTimer = null;
	let paintFrame = null;
	let touchY = null;
	let disposed = false;
	const clearIdle = () => {
		if (idleTimer !== null) cancelTimer(idleTimer);
		idleTimer = null;
	};
	const finish = (animate = true, seekTime = null) => {
		clearIdle();
		if (!animate) returnPositions.delete(container);
		if (!session) return;
		const { root, spacer, rows } = session;
		if (animate) {
			// Save screen coordinates before releasing native scrolling. The normal
			// row animator consumes these after the new anchor/offset commit.
			returnPositions.set(container, {
				positions: new Map(rows.map(({ element }) => [element, element.getBoundingClientRect().top])),
				seekTime, expiresAt: now() + 800, pending: true,
			});
		}
		session = null;
		if (paintFrame !== null) cancelFrame(paintFrame);
		paintFrame = null;
		root.style.removeProperty("translate");
		spacer.remove();
		container.classList.remove("scrolling-active");
		container.scrollTop = 0;
		rows.forEach(({ element }) => element.style.removeProperty("--manual-blur-index"));
		if (!disposed) onActiveChange(false);
	};
	const extend = () => {
		clearIdle();
		if (touchY === null) idleTimer = scheduleTimer(() => finish(), MANUAL_SCROLL_IDLE_MS);
	};
	const paint = () => {
		paintFrame = null;
		if (!session) return;
		const { rows, origin, anchor, lastPaintedRow } = session;
		const displacement = origin - container.scrollTop;
		let closest = 0;
		let distance = Math.abs(rows[0].center + displacement - anchor);
		for (let index = 1; index < rows.length; index++) {
			const candidate = Math.abs(rows[index].center + displacement - anchor);
			if (candidate < distance) {
				distance = candidate;
				closest = index;
			}
		}
		if (closest === lastPaintedRow) return;

		const writeBlur = (index) => {
			const nextBlur = Math.min(Math.abs(index - closest), MANUAL_BLUR_LIMIT);
			if (lastPaintedRow === null || nextBlur !== Math.min(Math.abs(index - lastPaintedRow), MANUAL_BLUR_LIMIT)) {
				rows[index].element.style.setProperty("--manual-blur-index", nextBlur);
			}
		};
		if (lastPaintedRow === null) {
			for (let index = 0; index < rows.length; index++) writeBlur(index);
		} else {
			// Only rows within the previous or current focus band's range can
			// change. The rest keep the same capped blur.
			const radius = MANUAL_BLUR_LIMIT - 1;
			const oldStart = Math.max(0, lastPaintedRow - radius);
			const oldEnd = Math.min(rows.length - 1, lastPaintedRow + radius);
			const newStart = Math.max(0, closest - radius);
			const newEnd = Math.min(rows.length - 1, closest + radius);
			for (let index = oldStart; index <= oldEnd; index++) writeBlur(index);
			for (let index = newStart; index <= newEnd; index++) {
				if (index < oldStart || index > oldEnd) writeBlur(index);
			}
		}
		session.lastPaintedRow = closest;
	};
	const begin = () => {
		if (session) return true;
		const root = container.querySelector(SYNCED_ROOT_SELECTOR);
		if (!root || container.clientHeight === 0) return false;
		returnPositions.delete(container);
		// Freeze in-flight row motion before measuring; browsing starts exactly
		// where the user caught the surface, even during a line handoff.
		Array.from(root.children).forEach(element => element.getAnimations?.().forEach(animation => animation.pause()));
		const bounds = container.getBoundingClientRect();
		const rows = Array.from(root.children)
			.filter(element => element.classList.contains(LYRIC_ROW_CLASS) && element.textContent.trim())
			.map(element => {
				const rect = element.getBoundingClientRect();
				return { element, center: rect.top - bounds.top + rect.height / 2 };
			});
		if (!rows.length) return false;
		const anchor = container.clientHeight * getAnchorRatio(container);
		const origin = Math.max(0, anchor - rows[0].center);
		const maxScroll = origin + Math.max(0, rows.at(-1).center - anchor);
		const spacer = createSpacer();
		spacer.className = "lyrics-native-scroll-spacer";
		spacer.setAttribute("aria-hidden", "true");
		spacer.style.height = `${container.clientHeight + maxScroll}px`;
		root.style.translate = `0 ${origin}px`;
		container.appendChild(spacer);
		container.classList.add("scrolling-active");
		session = { root, spacer, origin, maxScroll, rows, anchor, lastPaintedRow: null };
		container.scrollTop = origin;
		onActiveChange(true);
		return true;
	};
	const move = (delta) => {
		container.scrollTop = Math.max(0, Math.min(session.maxScroll, container.scrollTop + delta));
		extend();
	};
	const wheel = (event) => {
		if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		if (!begin()) return;
		event.preventDefault();
		const unit = event.deltaMode === 2 ? container.clientHeight : event.deltaMode === 1 ? 40 : 1;
		move(event.deltaY * unit);
	};
	const scroll = () => {
		if (!session) return;
		const clamped = Math.max(0, Math.min(session.maxScroll, container.scrollTop));
		if (container.scrollTop !== clamped) container.scrollTop = clamped;
		if (paintFrame === null) paintFrame = scheduleFrame(paint);
		extend();
	};
	const keydown = (event) => {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === "Escape" && session) {
			event.preventDefault();
			event.stopPropagation();
			finish();
			return;
		}
		const interactive = event.target?.closest?.(INTERACTIVE_TARGET);
		const lyric = event.target?.closest?.("[data-lyrics-seek-time]");
		if (interactive && interactive !== lyric) return;
		// Focused lyric rows remain browsable; Enter/Space still activate the row.
		if (lyric && ROW_ACTIVATION_KEYS.has(event.key)) return;
		const page = container.clientHeight * 0.8;
		const delta = { ArrowUp: -80, ArrowDown: 80, PageUp: -page, PageDown: page,
			Home: -Infinity, End: Infinity, " ": event.shiftKey ? -page : page, Spacebar: event.shiftKey ? -page : page }[event.key];
		if (delta === undefined || !begin()) return;
		event.preventDefault();
		move(delta);
	};
	const touchstart = (event) => {
		if (event.touches.length !== 1) return;
		touchY = event.touches[0].clientY;
		clearIdle();
	};
	const touchmove = (event) => {
		if (touchY === null || event.touches.length !== 1) return;
		const nextY = event.touches[0].clientY;
		if (begin()) {
			event.preventDefault();
			move(touchY - nextY);
		}
		touchY = nextY;
	};
	const touchend = () => { touchY = null; if (session) extend(); };
	const reset = () => { touchY = null; finish(false); };
	const seek = () => finish();
	const selectLine = (event) => {
		if (event.type === "keydown" && !ROW_ACTIVATION_KEYS.has(event.key)) return;
		const row = event.target?.closest?.("[data-lyrics-seek-time]");
		if (row && container.contains(row)) finish(true, Number(row.dataset.lyricsSeekTime));
	};
	container.addEventListener("click", selectLine, true);
	container.addEventListener("keydown", selectLine, true);
	const listeners = { wheel, scroll, keydown, touchstart, touchmove, touchend, touchcancel: touchend };
	for (const [type, listener] of Object.entries(listeners)) {
		container.addEventListener(type, listener, { passive: type !== "wheel" && type !== "touchmove" && type !== "keydown" });
	}
	hostEvents.addEventListener("resize", reset);
	player?.addEventListener?.("onseek", seek);
	player?.addEventListener?.("songchange", reset);
	return {
		finish,
		destroy() {
			disposed = true;
			finish(false);
			container.removeEventListener("click", selectLine, true);
			container.removeEventListener("keydown", selectLine, true);
			for (const [type, listener] of Object.entries(listeners)) container.removeEventListener(type, listener);
			hostEvents.removeEventListener("resize", reset);
			player?.removeEventListener?.("onseek", seek);
			player?.removeEventListener?.("songchange", reset);
		},
	};
}

// Expanded lyrics use native document geometry. Only direct navigation, a
// scrollbar drag, or its ensuing scroll events can suspend auto-follow.
function trackExpandedLyricsScrolling({
	container, hostEvents, onActiveChange, cancelAutoScroll, scheduleTimer, cancelTimer, now,
}) {
	let scrollbarPointerId = null;
	let idleTimer = null;
	let intentUntil = 0;
	const clearTimer = () => {
		if (idleTimer !== null) cancelTimer(idleTimer);
		idleTimer = null;
	};
	const finish = () => {
		clearTimer();
		intentUntil = 0;
		onActiveChange(false);
	};
	const activate = () => {
		cancelAutoScroll(container);
		onActiveChange(true);
		clearTimer();
		idleTimer = scheduleTimer(finish, MANUAL_SCROLL_IDLE_MS);
	};
	const markIntent = () => { intentUntil = now() + 500; };
	const navigate = () => {
		markIntent();
		activate();
	};
	const scroll = () => {
		if (scrollbarPointerId !== null || now() < intentUntil) activate();
	};
	const pointerdown = (event) => {
		if (event.target !== container) return;
		const rect = container.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const verticalGutter = Math.max(0, container.offsetWidth - container.clientWidth);
		const horizontalGutter = Math.max(0, container.offsetHeight - container.clientHeight);
		const inVerticalScrollbar = verticalGutter > 0 && (x < verticalGutter || x >= container.clientWidth);
		const inHorizontalScrollbar = horizontalGutter > 0 && y >= container.clientHeight;
		if (inVerticalScrollbar || inHorizontalScrollbar) {
			scrollbarPointerId = event.pointerId;
			markIntent();
		}
	};
	const releasePointer = (event) => {
		if (scrollbarPointerId === null || event.pointerId !== scrollbarPointerId) return;
		scrollbarPointerId = null;
		intentUntil = 0;
		activate();
	};
	const keydown = (event) => {
		if (!SCROLL_KEYS.has(event.key) || event.defaultPrevented) return;
		const target = event.target?.closest?.(INTERACTIVE_TARGET);
		if (target && target !== container) return;
		navigate();
	};

	const listeners = [
		[container, "wheel", navigate],
		[container, "touchmove", navigate],
		[container, "scroll", scroll],
		[container, "pointerdown", pointerdown],
		[container, "keydown", keydown],
		[hostEvents, "pointerup", releasePointer],
		[hostEvents, "pointercancel", releasePointer],
	];
	for (const [target, event, callback] of listeners) {
		target.addEventListener(event, callback, event === "keydown" ? undefined : { passive: true });
	}
	return {
		finish,
		destroy() {
			for (const [target, event, callback] of listeners) target.removeEventListener(event, callback);
			cancelAutoScroll(container);
			clearTimer();
		},
	};
}

export function createLyricsScrollActivityHook({ react, getPlayer, getReturnPositions, ...environment }) {
	const { useCallback, useEffect, useRef, useState } = react;
	const useLayoutEffect = react.useLayoutEffect || useEffect;
	return function useScrollActivity({ container, lyricsId, preserveLayout, settingsRevision }) {
		const controllerRef = useRef(null);
		const [isScrolling, setIsScrolling] = useState(false);

		useLayoutEffect(() => {
			setIsScrolling(false);
			if (!container) return;
			const shared = { ...environment, container, onActiveChange: setIsScrolling };
			const controller = preserveLayout
				? createSyncedLyricsScroller({ ...shared, player: getPlayer(), returnPositions: getReturnPositions() })
				: trackExpandedLyricsScrolling(shared);
			controllerRef.current = controller;
			return () => {
				controller.destroy();
				if (controllerRef.current === controller) controllerRef.current = null;
			};
		}, [container, lyricsId, preserveLayout, settingsRevision]);

		const handleContainerClick = useCallback(() => {
			if (!preserveLayout && !isScrolling) return;
			if (controllerRef.current) controllerRef.current.finish();
			else if (isScrolling) setIsScrolling(false);
		}, [isScrolling, preserveLayout]);
		return { isScrolling, handleContainerClick };
	};
}
