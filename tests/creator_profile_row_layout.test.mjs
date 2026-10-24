import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const normalize = value => value.trim().replace(/\s+/g, ' ');
// Media blocks close at column 0 here; strip them so a narrow override can never
// be mistaken for the rule a desktop selector resolves to.
const mediaBlocks = styles.match(/@media[^{]*\{[\s\S]*?\n\}/g) || [];
const base = styles.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '');
const rules = [...base.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
	.map(([, selectors, body]) => ({
		selectors: selectors.split(',').map(normalize),
		declarations: [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)]
			.map(([, key, value]) => [key, normalize(value)]),
	}));
const declarations = selector => Object.fromEntries(rules
	.filter(rule => rule.selectors.includes(selector)).flatMap(rule => rule.declarations));
// The parser records shorthands verbatim, so expand `padding` to its vertical half.
const verticalPadding = (selector) => {
	const value = String(declarations(selector).padding ?? '').split(/\s+/).map(Number.parseFloat);
	if (value.length < 1) return 0;
	if (value.length === 1) return value[0];
	return value[0]; // one value, or the vertical pair
};

const row = '.lyrics-creator-profile-track';
const open = '.lyrics-creator-profile-track-open';
const main = '.lyrics-creator-profile-track-main';
const sub = '.lyrics-creator-profile-track-subline';
const side = '.lyrics-creator-profile-track-side';
const actions = '.lyrics-creator-profile-track-actions';
const trigger = '.lyrics-creator-profile-track-playlist';
const popover = '.fullscreen-playlist-popover';

test('the contribution row lays out its two controls side by side', () => {
	assert.equal(declarations(row)['grid-template-columns'], 'minmax(0, 1fr) auto');
	assert.equal(declarations(row).display, 'grid');
	assert.equal(declarations(row).cursor, 'default');
});

test('the row is shorter now that the date moved out of the actions column', () => {
	assert.equal(declarations(row)['min-height'], '76px');
	assert.equal(declarations(row).padding, '13px 16px');
});

test('the track button keeps the cover and the text it used to hold', () => {
	assert.equal(declarations(open).display, 'grid');
	assert.equal(declarations(open)['grid-template-columns'], '56px minmax(0, 1fr)');
	assert.equal(declarations(open).cursor, 'pointer');
	assert.equal(declarations(open).background, 'none');
	assert.equal(declarations(open).border, '0');
	assert.equal(declarations(open).padding, '0');
	assert.equal(declarations(main)['min-width'], '0');
});

test('artist and date share one truncated line instead of stacking', () => {
	const subline = declarations(sub);
	assert.equal(subline.display, 'flex');
	assert.equal(subline['flex-direction'], 'row');
	assert.equal(subline['align-items'], 'baseline');
	assert.equal(subline['white-space'], 'nowrap');
	assert.equal(subline.overflow, 'hidden');
	assert.ok(Number.parseFloat(subline.gap) >= 4, 'the meta parts are spaced, not butted together');
	// A leftover bar rule here once forced space-between + wrap, which threw the
	// date to the far edge and onto its own line. Assert the merged value, not
	// just this block, so that leak cannot come back.
	assert.notEqual(subline['justify-content'], 'space-between');
	assert.notEqual(subline['flex-wrap'], 'wrap');
	assert.equal(declarations('.lyrics-creator-profile-track-artist')['margin-top'], undefined, 'the row owns the spacing now');
});

test('the subline class is not shared with any other rule', () => {
	const selectors = rules.flatMap((rule) => rule.selectors).filter((value) => value.includes(sub));

	for (const selector of selectors) {
		const owned = declarations(selector);
		assert.notEqual(owned['justify-content'], 'space-between', `${selector} must not inherit a bar layout`);
		assert.notEqual(owned['flex-wrap'], 'wrap', `${selector} must not wrap`);
	}
});

test('the date is set off from the artist with a separator', () => {
	const separator = /lyrics-creator-profile-track-updated::before\s*\{([^}]*)\}/.exec(styles);

	assert.ok(separator, 'the date carries its own separator');
	assert.match(separator[1], /content:\s*"·"/);
	assert.equal(declarations('.lyrics-creator-profile-track-updated')['margin-top'], undefined);
});

test('the score and provider stack in one column beside the picker', () => {
	assert.equal(declarations(side).display, 'flex');
	assert.equal(declarations(side)['flex-direction'], 'column');
	assert.equal(declarations(side)['align-items'], 'flex-end');
	assert.equal(declarations(actions)['align-items'], 'center');
});

test('the update keeps the room and the artist gives way', () => {
	const artist = declarations('.lyrics-creator-profile-track-artist');
	const updated = declarations('.lyrics-creator-profile-track-updated');

	// The date is the priority: it keeps its width and the artist truncates.
	assert.equal(updated.flex, '0 0 auto', 'the date does not give up its width');
	assert.ok(Number.parseFloat(updated['max-width']) <= 85, 'and it is capped so the row cannot collapse');
	assert.equal(artist.flex, '0 1 auto', 'the artist truncates instead');
	assert.equal(artist['min-width'], '0');
	assert.equal(artist.overflow, 'hidden');
	assert.equal(artist['text-overflow'], 'ellipsis');
});

test('the actions cluster keeps the metadata and the picker on one line', () => {
	assert.equal(declarations(actions).display, 'flex');
	assert.equal(declarations(actions)['align-items'], 'center');
	assert.equal(declarations(actions).flex, '0 0 auto');
});

test('the picker trigger is a real button target with visible affordances', () => {
	assert.equal(declarations(trigger).width, '32px');
	assert.equal(declarations(trigger).height, '32px');
	assert.equal(declarations(trigger).cursor, 'pointer');
	assert.equal(declarations(trigger)['border-radius'], '10px');
	assert.ok(declarations(trigger).background, 'the trigger needs a surface of its own');
});

test('the menu ships a themed scrollbar rather than the browser default', () => {
	assert.equal(declarations(popover)['scrollbar-width'], 'thin');
	assert.equal(declarations(popover)['scrollbar-color'], 'rgba(255, 255, 255, 0.24) transparent');
	assert.ok(declarations(`${popover}::-webkit-scrollbar`).width, 'the webkit thumb has a width');
	assert.ok(declarations(`${popover}::-webkit-scrollbar-thumb`).background, 'and a colour');
});

test('the menu title and rows keep a tight, even rhythm', () => {
	assert.equal(declarations('.fullscreen-playlist-item').gap, '10px');
	assert.equal(declarations('.fullscreen-playlist-item').border, '0');
	assert.ok(Number.parseFloat(declarations('.fullscreen-playlist-popover-title')['margin-bottom']) > 0,
		'the title is separated from the first row');
});

test('status pills pad their label instead of clipping it against the border', () => {
	// Both get a border and a 22px radius from the shared panel rule but neither
	// carried any padding, so the line box met the border edge.
	for (const selector of ['.lyrics-creator-profile-load-more', '.lyrics-creator-profile-list-status']) {
		const pill = declarations(selector);
		const padding = verticalPadding(selector);

		assert.ok(padding >= 4, `${selector} vertical padding is ${pill.padding}`);
		assert.equal(pill.display, 'inline-flex', `${selector} centres its label`);
		assert.notEqual(pill.overflow, 'hidden', `${selector} must not clip`);
	}

	assert.equal(declarations('.lyrics-creator-profile-load-more')['min-height'], undefined,
		'no fixed floor that the line box can outgrow');
});

test('a long provider name cannot starve the track column or clip the date', () => {
	const provider = declarations('.lyrics-creator-profile-track-provider');
	const updated = declarations('.lyrics-creator-profile-track-updated');

	assert.ok(Number.parseFloat(provider['max-width']) <= 150, 'provider is capped so it cannot starve the track');
	assert.equal(provider.overflow, 'hidden');
	assert.equal(provider['text-overflow'], 'ellipsis');
	assert.equal(updated.flex, '0 0 auto', 'the date keeps the room it needs');
	assert.equal(updated['min-width'], '0');
	assert.equal(updated.overflow, 'hidden');
	assert.equal(declarations('.lyrics-creator-profile-track-actions')['max-width'], '240px', 'the cluster cannot starve the track');
});

test('narrow layouts stack the actions under the track instead of overflowing', () => {
	const narrowRowColumns = mediaBlocks
		.flatMap(block => [...block.matchAll(/lyrics-creator-profile-track\s*,[\s\S]{0,200}?\{([^}]*)\}/g)])
		.map(([, body]) => (body.match(/grid-template-columns:\s*([^;]+);/) || [])[1])
		.filter(Boolean);

	assert.ok(narrowRowColumns.length > 0, 'the row has a narrow override');
	for (const value of narrowRowColumns) {
		assert.equal(normalize(value), 'minmax(0, 1fr)', 'narrow rows stack their two controls');
	}
	assert.doesNotMatch(styles, /lyrics-creator-profile-track-side[^}]*?grid-column/, 'the side cluster is no longer a grid child');
});

test('the portalled menu repaints itself for both profile themes', () => {
	for (const theme of ['light', 'dark']) {
		const themed = `${popover}[data-ui-theme="${theme}"]`;
		assert.ok(declarations(themed).background, `${theme} popover surface`);
		assert.ok(declarations(`${themed} .fullscreen-playlist-item-name`).color, `${theme} item name`);
		assert.ok(declarations(`${themed} .fullscreen-playlist-item-status.contains`).color, `${theme} already-in pill`);
		assert.ok(declarations(`${themed} .fullscreen-playlist-state.error`).color, `${theme} error text`);
	}
});
