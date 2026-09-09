import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
const badgeSource = source.slice(source.indexOf('function normalizePublicSyncType('), source.indexOf('function getSupportBadgeLabel('));
const context = vm.createContext({
	getCreatorProfileCopy: () => ({ typeLine: 'Line', pointsShort: 'points' }),
	react: { createElement: (type, props, ...children) => ({ type, props, children }) }
});
vm.runInContext(`${badgeSource}\nglobalThis.renderBadge = SyncTypeBadge;`, context);

test('existing sync badges display zero and fractional points to at most two decimal places', () => {
	for (const points of [0, 0.05, 0.1, 1 / 30, 1234.567]) {
		const badge = context.renderBadge({ type: 'line', points });
		const formatted = points.toLocaleString(undefined, { maximumFractionDigits: 2 });
		assert.equal(badge.props.title, `Line · ${formatted} points`);
		assert.equal(badge.children[1].children[0], `+${formatted}`);
	}
});

test('missing or invalid points stay absent and compact badges keep their existing layout', () => {
	for (const points of [null, undefined, Number.NaN, -1]) {
		const badge = context.renderBadge({ type: 'line', points });
		assert.equal(badge.props.title, 'Line');
		assert.equal(badge.children[1], null);
	}
	const compact = context.renderBadge({ type: 'line', points: 0.05, compact: true });
	assert.equal(compact.children[1], null);
	assert.equal(compact.props.title, 'Line · 0.05 points');
});
