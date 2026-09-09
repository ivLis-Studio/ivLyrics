import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
const badgeSource = source.slice(source.indexOf('const SyncScoreBadge ='), source.indexOf('function getSupportBadgeLabel('));
const context = vm.createContext({
	getCreatorProfileCopy: () => ({ pointsShort: 'points' }),
	react: { createElement: (type, props, ...children) => ({ type, props, children }) }
});
vm.runInContext(`${badgeSource}\nglobalThis.renderBadge = SyncScoreBadge;`, context);

test('score badges display only zero or fractional points to at most two decimal places', () => {
	for (const points of [0, 0.05, 0.1, 1 / 30, 1234.567]) {
		const badge = context.renderBadge({ type: 'line', points });
		const formatted = points.toLocaleString(undefined, { maximumFractionDigits: 2 });
		assert.equal(badge.props.title, `${formatted} points`);
		assert.equal(badge.children[0], `${formatted} points`);
	}
});

test('missing or invalid points do not produce a classification badge', () => {
	for (const type of ['line', 'word', 'character', 'mixed', 'unknown']) {
		for (const points of [null, undefined, Number.NaN, -1]) {
			assert.equal(context.renderBadge({ type, points }), null);
		}
		const badge = context.renderBadge({ type, points: 0.05 });
		assert.equal(badge.props.className, 'lyrics-sync-score-badge');
		assert.equal(badge.props['aria-label'], '0.05 points');
		assert.deepEqual(Array.from(badge.children), ['0.05 points']);
	}
});
