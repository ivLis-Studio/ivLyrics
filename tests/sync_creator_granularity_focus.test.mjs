import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const start = source.indexOf('\tconst renderGranularitySelector =');
const end = source.indexOf('\n\tconst renderHeader =', start);
assert.ok(start >= 0 && end > start, 'production granularity selector must exist');
const styleStart = source.indexOf('\t\tgranularityControl: {');
const styleEnd = source.indexOf('\t\twordInputSeparator: {', styleStart);
assert.ok(styleStart >= 0 && styleEnd > styleStart, 'production granularity styles must exist');
const styles = vm.runInNewContext(`({${source.slice(styleStart, styleEnd)}})`, {
	TOSS_BORDER: 'rgba(255,255,255,0.08)',
	TOSS_BLUE_SOFT: 'rgba(30,215,96,0.13)',
	TOSS_BLUE_BORDER: 'rgba(30,215,96,0.36)',
	TOSS_BLUE: 'rgb(30,215,96)',
});

const rule = selector => {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
	assert.ok(match, `missing production rule: ${selector}`);
	return match[1];
};

test('granularity controls retain native focus and exclusive pressed state when switching modes', () => {
	let selected = 'character';
	const context = vm.createContext({
		react: { createElement: (type, props, ...children) => ({ type, props, children: children.flat() }) },
		I18n: { t: () => '' },
		s: styles,
		handleSyncGranularityChange: value => { selected = value; },
	});
	vm.runInContext(`${source.slice(start, end)}\nglobalThis.renderSelector = renderGranularitySelector;`, context);
	const render = () => {
		context.syncGranularity = selected;
		return context.renderSelector();
	};
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
