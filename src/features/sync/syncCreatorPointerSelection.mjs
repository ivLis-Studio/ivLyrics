import { sameSyncCreatorRecordingTarget } from './syncCreatorRecordingTiming.mjs';

function findTouch(touches, identifier) {
	for (const touch of touches ?? []) {
		if (touch.identifier === identifier) return touch;
	}
	return null;
}

export function createSyncCreatorPointerGestures({ document, gestureRef, suppressContextMenuRef, getContext }) {
	function start(event) {
		const context = getContext();
		if (gestureRef.current || !context?.hasLine || !context.isEditorOpen()) return;
		const touch = event.changedTouches?.[0] ?? event.touches?.[0];
		if (!touch && event.button !== 0 && event.button !== 2) return;
		const selection = !touch && event.button === 2;
		if (!selection && context.mode !== 'record') return;
		if (!context.isCurrentSyncTargetMetaComplete) {
			context.showMissingMetaToast();
			return;
		}
		const { clientX, clientY } = touch ?? event;
		const index = context.getCharIndexFromPoint(clientX, clientY);
		if (index == null || index < 0) return;

		if (selection) {
			suppressContextMenuRef.current = false;
			gestureRef.current = { kind: context.mode === 'record' ? 'lock' : 'offset', index, button: 2 };
			event.preventDefault();
			event.stopPropagation();
		} else if (context.handleDragStart(index, event)) {
			gestureRef.current = touch
				? { kind: 'record', touchId: touch.identifier }
				: { kind: 'record', button: 0 };
		}
	}

	function cancel(restoreKeyboard = true) {
		const gesture = gestureRef.current;
		gestureRef.current = null;
		suppressContextMenuRef.current = false;
		if (gesture?.kind === 'record') getContext()?.handleDragCancel({ restoreKeyboard });
	}

	function move(event) {
		const gesture = gestureRef.current;
		if (!gesture) return;
		const isTouch = gesture.button === undefined;
		if (isTouch !== (event.type === 'touchmove')) return;
		if (!isTouch && typeof event.buttons === 'number' && !(event.buttons & (gesture.button === 0 ? 1 : 2))) {
			cancel();
			return;
		}
		const point = isTouch ? findTouch(event.changedTouches ?? event.touches, gesture.touchId) : event;
		if (!point) return;
		const context = getContext();
		if (!context?.isEditorOpen()) return cancel(false);
		const index = context.getCharIndexFromPoint(point.clientX, point.clientY);
		if (index == null) return;
		if (gesture.kind === 'record') context.handleDragMove(index, event);
		else if (index >= 0 && index !== gesture.index) suppressContextMenuRef.current = true;
	}

	function end(event) {
		const gesture = gestureRef.current;
		if (!gesture) return;
		const point = gesture.button === undefined
			? event.type === 'touchend' && findTouch(event.changedTouches, gesture.touchId)
			: event.type === 'mouseup' && event.button === gesture.button && event;
		if (!point) return;

		const context = getContext();
		if (!context?.isEditorOpen()) return cancel(false);
		gestureRef.current = null;
		const index = context.getCharIndexFromPoint(point.clientX, point.clientY);
		if (gesture.kind === 'record') {
			// A release can include a newer position than the last move event.
			if (index != null && index >= 0) context.handleDragMove(index, event);
			context.handleDragEnd(event);
			return;
		}
		if (index == null || index < 0 || index === gesture.index) return;
		suppressContextMenuRef.current = true;
		if (gesture.kind === 'lock') context.applyRecordingLockRange(gesture.index, index);
		else context.applyOffsetSelectionRange(gesture.index, index);
	}

	function bind() {
		const host = document.defaultView;
		const onBlur = () => cancel();
		const onVisibility = () => { if (document.visibilityState === 'hidden') cancel(); };
		const onTouchCancel = (event) => {
			const gesture = gestureRef.current;
			if (gesture && gesture.button === undefined && findTouch(event.changedTouches, gesture.touchId)) cancel();
		};
		const listeners = [
			['mousemove', move], ['mouseup', end], ['touchmove', move, { passive: false }],
			['touchend', end], ['touchcancel', onTouchCancel], ['visibilitychange', onVisibility],
		];
		for (const [name, handler, options] of listeners) document.addEventListener(name, handler, options);
		host?.addEventListener('blur', onBlur);
		return () => {
			for (const [name, handler] of listeners) document.removeEventListener(name, handler);
			host?.removeEventListener('blur', onBlur);
			gestureRef.current = null;
			suppressContextMenuRef.current = false;
		};
	}

	return { start, cancel, bind };
}

export function useSyncCreatorPointerSelection({
	react: { useEffect, useLayoutEffect, useMemo, useRef }, document,
	target, context, gestureRef, suppressContextMenuRef,
}) {
	const committed = useRef(null);
	const gestures = useMemo(() => createSyncCreatorPointerGestures({
		document, gestureRef, suppressContextMenuRef,
		getContext: () => committed.current?.context,
	}), [document, gestureRef, suppressContextMenuRef]);
	useLayoutEffect(() => {
		const previous = committed.current;
		if (previous && (!sameSyncCreatorRecordingTarget(previous.target, target) || !context.isCurrentSyncTargetMetaComplete)) {
			gestures.cancel(false);
		}
		committed.current = { target, context };
	});
	useEffect(() => gestures.bind(), [gestures]);
	return gestures.start;
}
