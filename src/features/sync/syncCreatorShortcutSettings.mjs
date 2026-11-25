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
export function getSyncCreatorDragKeyByCode(event) {
	if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return '';
	if (event.code === 'Slash') return '/';
	return event.code === 'NumpadDivide' ? 'numpaddivide' : '';
}

export function createSyncCreatorShortcutSettings({ readStoredSetting, readVisualSetting }) {
	const primaryModifier = getPrimaryKeyboardModifier(globalThis.navigator?.platform);
	const parsedShortcuts = new Map();
	const readShortcut = ({ key, defaultValue }) => {
		try {
			return readStoredSetting(key) ?? defaultValue;
		} catch {
			return defaultValue;
		}
	};

	const readChord = option => {
		const value = readShortcut(option);
		const cached = parsedShortcuts.get(option.key);
		if (cached && cached.value === value) return cached.chord;
		const sequence = parseKeyboardShortcut(value, primaryModifier);
		const chord = sequence.length === 1 ? sequence[0] : '';
		parsedShortcuts.set(option.key, { value, chord });
		return chord;
	};

	return {
		findAction(key, dragKeyByCode = '') {
			if (!key && !dragKeyByCode) return null;
			// A physical layout alias can start an assigned hold, but an
			// explicit binding for the reported key takes priority.
			let physicalDragMatches = false;
			for (const [action, { options }] of shortcutEntries) {
				for (const option of options) {
					const chord = readChord(option);
					if (!chord) continue;
					if (key === chord) return action;
					if (action === 'drag' && dragKeyByCode === chord) physicalDragMatches = true;
				}
			}
			return physicalDragMatches ? 'drag' : null;
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
