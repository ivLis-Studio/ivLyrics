import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { renderSyncCreatorHeader } from '#ivlyrics/features/sync/syncCreatorHeader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getSyncCreatorStyles } from '#ivlyrics/features/sync/syncCreatorStyles.mjs';
import { useSyncCreatorLineInput } from '#ivlyrics/features/sync/syncCreatorLineInput.mjs';
import { resolveSyncCreatorLyricsLanguage } from '#ivlyrics/features/sync/syncCreatorLyricText.mjs';
import { createSyncCreatorGranularityTools } from '#ivlyrics/features/sync/timingGranularity.mjs';

const css = readPcStylesheet();
const styles = getSyncCreatorStyles({});

const rule = selector => {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
	assert.ok(match, `missing production rule: ${selector}`);
	return match[1];
};

test('granularity controls retain native focus and exclusive pressed state when switching modes', () => {
	let selected = 'character';
	const react = { createElement: (type, props, ...children) => ({ type, props, children: children.flat() }) };
	const render = () => renderSyncCreatorHeader({
		react, i18n: { t: () => '' }, styles, syncGranularity: selected,
		handleSyncGranularityChange: value => { selected = value; },
	}).children.find(child => child?.props.className === 'sync-creator-granularity');
	for (const mode of ['line', 'character', 'word', 'character']) {
		const selector = render();
		assert.equal(selector.props.className, 'sync-creator-granularity');
		assert.equal(selector.props.role, 'group');
		const button = selector.children.find(child => child.props.key === mode);
		assert.equal(button.type, 'button');
		assert.equal(button.props.type, 'button');
		button.props.onClick();
		assert.deepEqual(Array.from(render().children, child => child.props['aria-pressed']),
			['line', 'word', 'character'].map(value => value === mode));
		for (const child of render().children) {
			assert.equal(child.props.style.borderColor,
				child.props.key === mode ? styles.granularityButtonActive.borderColor : 'transparent',
				'deselected buttons must explicitly restore their transparent border color');
		}
		assert.equal(button.props.onMouseDown, undefined, 'pointer input must not prevent native focus');
		assert.equal(button.props.onFocus, undefined, 'keyboard focus must not be blurred');
		assert.equal(button.props.tabIndex, undefined, 'buttons remain in the native Tab order');
	}
});

test('granularity border styles avoid mixing shorthand and longhand during React updates', () => {
	assert.equal(styles.granularityButton.border, undefined);
	assert.equal(styles.granularityButton.borderWidth, '1px');
	assert.equal(styles.granularityButton.borderStyle, 'solid');
	assert.equal(styles.granularityButton.borderColor, 'transparent');
});

test('pointer focus reset is scoped to granularity buttons and excludes focus-visible', () => {
	const declarations = rule('.ivlyrics-sync-creator-shell .sync-creator-granularity button:focus:not(:focus-visible)');
	assert.match(declarations, /outline:\s*none\s*!important\s*;/);
	assert.match(declarations, /box-shadow:\s*none\s*!important\s*;/);
	assert.doesNotMatch(declarations, /(?:^|;)\s*(?:border|border-color|background|color)\s*:/,
		'pointer focus must not alter the active/inactive mode styling');
});

test('keyboard focus keeps the existing accent ring', () => {
	const declarations = rule('.ivlyrics-sync-creator-shell button:focus-visible');
	assert.match(declarations, /box-shadow:\s*0 0 0 3px rgba\(var\(--iv-sync-accent-rgb,/);
});

test('every header control excludes the native Spotify window drag region', () => {
	// A DOM hit test and React onClick alone cannot detect this failure: the
	// native window consumes the mouse before it reaches the web document.
	const declarations = rule('.ivlyrics-sync-creator-shell .sync-creator-header button');
	assert.match(declarations, /-webkit-app-region:\s*no-drag\s*;/);
	assert.match(css, /\.ivlyrics-sync-creator-shell \.sync-creator-header,\s*\.ivlyrics-sync-creator-shell \.sync-creator-header button\s*\{/);
});

test('word boundaries stay in lyric character indexes across UTF-16 and mixed writing directions', () => {
	const text = '🎸abcd ب';
	const { getSyncCreatorGranularityRanges } = createSyncCreatorGranularityTools(() => ({
		segmentRanges: () => [{ start: 2 }, { start: 7 }],
	}));
	const react = { useMemo: compute => compute(), useCallback: callback => callback };
	const input = {
		react, currentLineChars: Array.from(text), lyricsLines: [text], getLyricsService: () => null,
		utils: { getDetectedLanguage: () => ' ar ' }, getSyncCreatorGranularityRanges,
	};
	for (const syncGranularity of ['word', 'line', 'character']) {
		const line = useSyncCreatorLineInput({ ...input, syncGranularity });
		assert.equal(line.lyricsLanguage, 'ar');
		assert.equal(line.currentLineDirection, 'ltr');
		assert.equal(line.useCurrentLineTextRun, true);
		assert.deepEqual(line.currentLineCodeUnitOffsets, [0, 2, 3, 4, 5, 6, 7, 8]);
		if (syncGranularity === 'word') {
			assert.deepEqual(line.currentGranularityRanges, [{ start: 0, end: 5 }, { start: 6, end: 6 }]);
			assert.deepEqual([...line.currentWordBoundaryStartIndexes], [6]);
		} else {
			assert.equal(line.currentWordBoundaryStartIndexes.size, 0);
		}
		for (const index of [-1, 0, 0.5, 1, 2, 3, 4, 5, 5.5, 6, 7, NaN]) {
			const expected = line.currentGranularityRanges.find(range => index >= range.start && index <= range.end) || null;
			assert.equal(line.getGranularityRangeForIndex(index), expected);
			assert.equal(line.getGranularityEndIndex(index), expected?.end ?? index);
		}
	}
});

test('editor locale honors the active choice, then lyric detectors and kana evidence', () => {
	const makeInput = (current, lyricLanguage, legacyLanguage) => ({
		lyricsLines: ['text'], trackName: '歌', artistName: 'ｶﾅ',
		utils: { getDetectedLanguage: () => current, detectLanguage: () => legacyLanguage },
		getLyricsService: () => ({ detectLanguage: rows => {
			assert.deepEqual(rows, [{ text: 'text' }]);
			return lyricLanguage;
		} }),
	});
	assert.equal(resolveSyncCreatorLyricsLanguage(makeInput(' ko ', 'zh', 'en')), 'ko');
	assert.equal(resolveSyncCreatorLyricsLanguage(makeInput('auto', 'zh', 'en')), 'zh');
	assert.equal(resolveSyncCreatorLyricsLanguage(makeInput('auto', '', 'en')), 'en');
	assert.equal(resolveSyncCreatorLyricsLanguage(makeInput('auto', '', null)), 'ja');
	assert.equal(resolveSyncCreatorLyricsLanguage({ ...makeInput('', '', ''), artistName: '' }), null);
	assert.equal(resolveSyncCreatorLyricsLanguage({ lyricsLines: [] }), null);
});
