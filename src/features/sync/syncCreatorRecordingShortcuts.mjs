import { isKeyboardShortcutComposition } from '../../core/keyboardShortcut.mjs';
import { getNormalizedHotkeyFromEvent, getSyncCreatorDragKeyByCode } from './syncCreatorShortcutSettings.mjs';
import { startSyncCreatorKeyboardDrag, stopSyncCreatorKeyboardDrag } from './syncCreatorKeyboardDrag.mjs';
import { seekSyncCreatorByOffset } from './syncCreatorSeek.mjs';

const STATIC_RECORDING_KEYS = new Set(['enter', 'backspace', 'space']);
const EDITING_CONTROLS = '[role="textbox"], [role="listbox"], [role="menu"], [role="menuitem"], [aria-haspopup]';
const MODIFIER_FLAGS = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'];

function isEditingControl(target) {
	return target?.isContentEditable
		|| ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
		|| target?.closest?.(EDITING_CONTROLS);
}

function consume(event) {
	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();
}

function togglePlayback(player) {
	if (typeof player?.togglePlay === 'function') player.togglePlay();
	else if (player?.isPlaying?.()) player.pause?.();
	else player?.play?.();
}

const keyCode = event => event.code === 'Unidentified' ? '' : event.code;
const keyName = event => event.key?.toLowerCase();

function matchesHeldKey(hold, event) {
	const code = keyCode(event);
	return hold.code && code ? hold.code === code : hold.key === keyName(event);
}

export function bindSyncCreatorRecordingShortcuts({
	eventTarget,
	getRecordingContext,
	isPointerRecording,
	getPlayer,
	settings,
	keyboardDragRef,
	scheduleInterval,
	cancelInterval,
	editLastCharacterEnd,
	debug = () => {},
}) {
	let heldKey = null;
	const stopDrag = () => stopSyncCreatorKeyboardDrag(keyboardDragRef, cancelInterval);
	const releaseHold = () => {
		heldKey = null;
		stopDrag();
	};

	function startHold(event, autoAdvanceBoundaries) {
		if (heldKey || event.repeat) return;
		heldKey = { code: keyCode(event), key: keyName(event), modifiers: MODIFIER_FLAGS.filter(flag => event[flag]) };
		startSyncCreatorKeyboardDrag(keyboardDragRef, {
			scheduleInterval, cancelInterval,
			advance: () => {
				const context = getRecordingContext();
				if (context?.mode !== 'record' || !context.canRecordCurrentLine || !context.isCurrentSyncTargetMetaComplete) return -1;
				return context.recorder.advance('character', autoAdvanceBoundaries);
			},
		});
	}

	function handleKey(event, holdFallbackOnly = false) {
		if (event.defaultPrevented || isKeyboardShortcutComposition(event)
			|| isEditingControl(event.composedPath?.()[0] ?? event.target)) return;
		if (heldKey && matchesHeldKey(heldKey, event)) {
			consume(event);
			return;
		}
		const context = getRecordingContext();
		if (!context) return;
		const { recorder, mode, currentLineIndex, canRecordCurrentLine, isCurrentSyncTargetMetaComplete, showMissingMetaToast } = context;
		const key = getNormalizedHotkeyFromEvent(event);
		if (key === 'z' || key === 'x') {
			if (!holdFallbackOnly) {
				consume(event);
				seekSyncCreatorByOffset(getPlayer(), key === 'z' ? -3000 : 3000);
			}
			return;
		}
		if (isPointerRecording()) return;

		const action = settings.findAction(key, getSyncCreatorDragKeyByCode(event));
		if (holdFallbackOnly && action !== 'drag') return;
		if (!action && !STATIC_RECORDING_KEYS.has(key)) return;

		if (action === 'lastCharEnd') {
			consume(event);
			editLastCharacterEnd();
			return;
		}

		if (mode !== 'record') return;
		if (!isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return;
		}
		debug('[SyncDataCreator] KeyDown:', event.key, 'normalized:', key, 'mode:', mode, 'lineIndex:', currentLineIndex);
		if (!canRecordCurrentLine) return;
		const autoAdvanceBoundaries = settings.readAutoAdvanceBoundaries();
		switch (action) {
			case 'charForward':
			case 'wordForward':
			case 'syllable':
				consume(event);
				recorder.advance(action === 'charForward' ? 'character' : action === 'wordForward' ? 'word' : 'syllable', autoAdvanceBoundaries);
				return;
			case 'charBack':
				consume(event);
				recorder.revertCharacter();
				return;
			case 'wordBack':
				consume(event);
				recorder.revertWord();
				return;
		}
		if (action === 'drag') {
			consume(event);
			startHold(event, autoAdvanceBoundaries);
		} else if (key === 'enter') {
			if (recorder.canFinish()) {
				consume(event);
				recorder.finish();
			}
		} else if (key === 'backspace') {
			consume(event);
			recorder.cancelRecording();
		} else if (key === 'space') {
			consume(event);
			togglePlayback(getPlayer());
		}
	}

	const onKeyUp = event => {
		if (!heldKey) return;
		if (matchesHeldKey(heldKey, event)) {
			consume(event);
			releaseHold();
		} else if (heldKey.modifiers.some(flag => event[flag] === false)) {
			stopDrag();
		}
	};
	const onFocusIn = event => {
		if (heldKey && isEditingControl(event.composedPath?.()[0] ?? event.target)) releaseHold();
	};
	const onVisibilityChange = () => {
		if (eventTarget.visibilityState === 'hidden') releaseHold();
	};
	const listeners = [
		['keydown', event => handleKey(event)],
		// Some WebViews deliver the held key here first.
		['keypress', event => handleKey(event, true)],
		['keyup', onKeyUp],
		['focusin', onFocusIn],
		['visibilitychange', onVisibilityChange],
	];
	const host = eventTarget.defaultView;
	for (const [event, listener] of listeners) eventTarget.addEventListener(event, listener, true);
	host?.addEventListener('blur', releaseHold);
	return () => {
		for (const [event, listener] of listeners) eventTarget.removeEventListener(event, listener, true);
		host?.removeEventListener('blur', releaseHold);
		releaseHold();
	};
}
