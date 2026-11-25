import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncScoreBadge } from '../src/lyrics/creator-profile/profileTracks.mjs';

const renderBadge = createSyncScoreBadge({
	getPointsLabel: () => 'points',
	react: { createElement: (type, props, ...children) => ({ type, props, children }) }
});

test('score badges display only zero or fractional points to at most two decimal places', () => {
	for (const points of [0, 0.05, 0.1, 1 / 30, 1234.567]) {
		const badge = renderBadge({ type: 'line', points });
		const formatted = points.toLocaleString(undefined, { maximumFractionDigits: 2 });
		assert.equal(badge.props.title, `${formatted} points`);
		assert.equal(badge.children[0], `${formatted} points`);
	}
});

test('missing or invalid points do not produce a classification badge', () => {
	for (const type of ['line', 'word', 'character', 'mixed', 'unknown']) {
		for (const points of [null, undefined, Number.NaN, -1]) {
			assert.equal(renderBadge({ type, points }), null);
		}
		const badge = renderBadge({ type, points: 0.05 });
		assert.equal(badge.props.className, 'lyrics-sync-score-badge');
		assert.equal(badge.props['aria-label'], '0.05 points');
		assert.deepEqual(Array.from(badge.children), ['0.05 points']);
	}
});
