import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncCreatorCharacterHitTesting } from '#ivlyrics/features/sync/syncCreatorCharacterHitTesting.mjs';

test('uncached glyph hit testing samples each rectangle once and retains edge and tie behavior', () => {
	const reads = [];
	const glyph = (index, left, top) => ({
		getBoundingClientRect() {
			reads.push(index);
			return { left, right: left + 10, width: 10, top, bottom: top + 10 };
		},
	});
	const elements = [glyph(0, 20, 0), glyph(1, 40, 0), glyph(2, 20, 20), glyph(3, 40, 20)];
	const { getCharIndexFromPoint } = createSyncCreatorCharacterHitTesting({
		refs: { charElementsRef: { current: elements }, charHitBoxesRef: { current: [] } },
	});
	assert.equal(getCharIndexFromPoint(25, 25), 2, 'a direct hit wins over a glyph on the previous row');
	assert.deepEqual(reads.splice(0), [0, 1, 2]);

	for (const [x, expected] of [[35, 0], [44, 1], [10, 0], [60, 3]]) {
		assert.equal(getCharIndexFromPoint(x, 15), expected);
		assert.deepEqual(reads.splice(0), [0, 1, 2, 3]);
	}

	elements[0] = null;
	assert.equal(getCharIndexFromPoint(44, 15), 0, 'missing endpoint retains the uncached fallback');
	assert.deepEqual(reads, [1, 2, 3]);
});
