import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncCreatorPreviewPainting } from '#ivlyrics/features/sync/syncCreatorPreviewPainting.mjs';

test('independent parallel glyphs update only when their timing state crosses a mark', () => {
	const painting = createSyncCreatorPreviewPainting({
		progressBackground: 'played',
		syncedBackground: 'saved',
	});
	const writes = [];
	const backgrounds = [];
	const chars = [2, 0, , 2, null, 1, -1];
	const row = {
		chars, ordered: false, lastIndex: -2, lastPosition: NaN,
		elements: Array.from(chars, (_, index) => ({ style: {
			set background(value) {
				backgrounds[index] = value;
				writes.push(index);
			},
		} })),
	};
	const rows = new Map([['background', row]]);
	const frames = [
		[0, [0, 1, 2, 3, 4, 5, 6]],
		[0.5, []],
		[1, [5]],
		[2, [0, 3]],
		[Infinity, []],
		[NaN, [0, 1, 3, 5]],
		[NaN, []],
		[1.5, [1, 5]],
		[0, [5]],
	];
	for (const [position, changed] of frames) {
		writes.length = 0;
		painting.paintParallelPreviews(rows, position);
		assert.deepEqual(writes, changed, `style writes at ${position}`);
		assert.deepEqual(backgrounds, Array.from(chars, mark => {
			if (!Number.isFinite(mark) || mark < 0) return '';
			return mark <= position ? 'played' : 'saved';
		}), `backgrounds at ${position}`);
	}
});
