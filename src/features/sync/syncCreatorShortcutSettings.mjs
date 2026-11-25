import { formatKeyboardShortcut, getKeyboardShortcutChord, getPrimaryKeyboardModifier, parseKeyboardShortcut } from '../../core/keyboardShortcut.mjs';

function defineShortcut(id, primary, secondary = '') {
	const prefix = `sync-creator-${id}`;
	return {
		id,
		options: [
			{ key: `${prefix}-key`, defaultValue: primary },
			{ key: `${prefix}-alt-key`, defaultValue: secondary },
		],
	};
}

const shortcutsByAction = {
	charForward: defineShortcut('char-forward', 'right'),
	charBack: defineShortcut('char-back', 'left'),
	wordForward: defineShortcut('word-forward', '.'),
	wordBack: defineShortcut('word-back', ','),
	syllable: defineShortcut('syllable', ';'),
	drag: defineShortcut('drag', '/', 'numpaddivide'),
	lastCharEnd: defineShortcut('last-char-end', "`"),
};
const shortcutEntries = Object.entries(shortcutsByAction);

export const SYNC_CREATOR_SHORTCUT_DEFAULTS = Object.freeze(Object.fromEntries(
	Object.values(shortcutsByAction).flatMap(({ options }) => options).map(({ key, defaultValue }) => [key, defaultValue]),
));
export const SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY = 'sync-creator-auto-boundary-chars';
export const SYNC_CREATOR_AUTO_BOUNDARY_CHARS_DEFAULT = true;

export function getSyncCreatorShortcutRow(action, visualSettings) {
	const { id, options } = shortcutsByAction[action];
	return {
		id,
		items: options.map(({ key, defaultValue }) => ({
			key,
			defaultValue: visualSettings[key] ?? defaultValue,
		})),
	};
}

const KEY_LABELS = new Map(Object.entries({
	backspace: '⌫', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta', '/': 'Slash',
}));

export const getNormalizedHotkeyFromEvent = getKeyboardShortcutChord;
export const isSyncCreatorDragHotkeyEvent = (event, normalizedHotkey = getNormalizedHotkeyFromEvent(event)) => {
	if (normalizedHotkey === '/' || normalizedHotkey === 'numpaddivide') return true;
	if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
	return event.code === 'Slash' || event.code === 'NumpadDivide';
};

export function createSyncCreatorShortcutSettings({ readStoredSetting, readVisualSetting }) {
	const primaryModifier = getPrimaryKeyboardModifier(globalThis.navigator?.platform);
	const readShortcut = ({ key, defaultValue }) => {
		try {
			return readStoredSetting(key) ?? defaultValue;
		} catch {
			return defaultValue;
		}
	};

	const matches = (options, key) => !!key && options.some(option => {
		const sequence = parseKeyboardShortcut(readShortcut(option), primaryModifier);
		return sequence.length === 1 && sequence[0] === key;
	});
	return {
		findAction(key) {
			return shortcutEntries.find(([, shortcut]) => matches(shortcut.options, key))?.[0] ?? null;
		},
		matchesDrag(key) {
			return matches(shortcutsByAction.drag.options, key);
		},
		getDisplay(action) {
			return (shortcutsByAction[action]?.options ?? []).map(readShortcut).filter(Boolean)
				.map(binding => formatKeyboardShortcut(binding, KEY_LABELS).join('+')).join(' / ');
		},
		readAutoAdvanceBoundaries() {
			const setting = SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY;
			const fallback = SYNC_CREATOR_AUTO_BOUNDARY_CHARS_DEFAULT;
			try {
				const stored = readStoredSetting(setting) ?? readVisualSetting(setting);
				if (typeof stored === 'boolean') return stored;
				const normalized = String(stored ?? '').trim().toLowerCase();
				return normalized ? !['false', '0', 'off', 'no'].includes(normalized) : fallback;
			} catch {
				return fallback;
			}
		},
	};
}
