import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../PlaylistPicker.js', import.meta.url), 'utf8');
const start = source.indexOf('const PLAYLIST_POPOVER_GAP');
const end = source.indexOf('const PlaylistPicker = (() => {');
const context = vm.createContext({});
vm.runInContext(
	`${source.slice(start, end)}\nglobalThis.resolvePlaylistPopoverPlacement = resolvePlaylistPopoverPlacement;`,
	context
);
const resolvePlaylistPopoverPlacement = context.resolvePlaylistPopoverPlacement;

const anchor = (overrides = {}) => ({
	top: 400,
	bottom: 436,
	left: 100,
	right: 136,
	...overrides
});
const viewport = (overrides = {}) => ({ width: 1200, height: 900, ...overrides });
const POPOVER = { width: 280, height: 320 };
const place = (options) => resolvePlaylistPopoverPlacement({ popover: POPOVER, viewport: viewport(), ...options });

test('opens above the trigger when the space above fits', () => {
	const placement = place({ anchor: anchor() });

	assert.equal(placement.placement, 'above');
	assert.equal(placement.top, 68);
});

test('flips below the trigger when the space above is too small', () => {
	const placement = place({ anchor: anchor({ top: 60, bottom: 96 }) });

	assert.equal(placement.placement, 'below');
	assert.equal(placement.top, 108);
});

test('hangs to the left of the trigger so it never covers the button', () => {
	const placement = place({ anchor: anchor({ left: 400, right: 436 }) });

	assert.equal(placement.left, 120, "the menu's right edge meets the trigger's left edge");
	assert.equal(placement.left + POPOVER.width, 400);
});

test('flips to the right of the trigger when there is no room on the left', () => {
	const placement = place({ anchor: anchor() });

	assert.equal(placement.left, 136, "clear of the trigger, extending rightward");
});

test('stays inside the profile modal instead of escaping it', () => {
	const boundary = { left: 80, right: 560, top: 60, bottom: 860 };
	const placement = place({ anchor: anchor({ left: 500, right: 534 }), boundary });

	assert.equal(placement.left + POPOVER.width, 500);
	assert.ok(placement.left >= 88, 'respects the modal padding');
	assert.ok(placement.left + POPOVER.width <= 552, 'never spills past the modal edge');
});

test('a trigger at the modal edge still keeps the menu inside the modal', () => {
	const boundary = { left: 80, right: 560, top: 60, bottom: 860 };
	const placement = place({ anchor: anchor({ left: 120, right: 154 }), boundary });

	assert.ok(placement.left >= 88);
	assert.ok(placement.left + POPOVER.width <= 552);
});

test('falls back to the viewport when no boundary is given', () => {
	const placement = place({ anchor: anchor({ left: 1150, right: 1180 }) });

	assert.equal(placement.left, 870, 'fully on screen and clear of the trigger');
	assert.equal(placement.left + POPOVER.width, 1150);
});

test('keeps the menu on screen when neither side fits and prefers the roomier side', () => {
	const cramped = place({
		anchor: anchor({ top: 90, bottom: 110, left: 10, right: 40 }),
		viewport: viewport({ width: 320, height: 200 })
	});

	assert.equal(cramped.placement, 'above');
	assert.equal(cramped.top, 8);

	const belowRoomier = place({
		anchor: anchor({ top: 20, bottom: 40, left: 10, right: 40 }),
		viewport: viewport({ width: 320, height: 400 })
	});

	assert.equal(belowRoomier.placement, 'below');
	assert.equal(belowRoomier.top, 52);
});

test('missing measurements degrade to a padded origin', () => {
	const placement = resolvePlaylistPopoverPlacement();

	assert.equal(placement.placement, 'above');
	assert.equal(placement.top, 8);
	assert.equal(placement.left, 8);
});
