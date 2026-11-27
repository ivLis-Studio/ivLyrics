import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncCreatorVocalLayout } from '../src/features/sync/syncCreatorVocalLayout.mjs';

// Loading a sync whose background vocal still includes its parentheses moves
// those characters into the line's hidden ranges. The step runs the editor's
// own parallel sanitizer, which once fell out of scope when the helper moved.
test('loading a sync trims parenthetical background vocals into hidden ranges', () => {
    const editor = createSyncCreatorVocalLayout({
        normalizeSyncCreatorSpeaker: () => '',
        normalizeSyncCreatorKind: () => '',
        sanitizeSyncCreatorSpeakerFallback: () => '',
        sanitizeSyncCreatorSpeakerColor: () => '',
        normalizeSyncCreatorStyleRanges: () => [],
    });
    const fullTextChars = Array.from('a ( 歌 ) Z');
    const data = {
        version: 5,
        lines: [{
            start: 0, end: 8, chars: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            parallel: {
                parts: [
                    { id: 'a', role: 'lead', ranges: [{ start: 0, end: 0 }], chars: [0] },
                    { id: 'b', role: 'background', ranges: [{ start: 2, end: 6 }], chars: [2, 3, 4, 5, 6] },
                ],
            },
        }],
    };
    const sanitized = editor.sanitizeSyncCreatorSyncData(data, fullTextChars);
    const { parallel } = sanitized.lines[0];
    assert.deepEqual(parallel.parts[1].ranges, [{ start: 4, end: 4 }]);
    assert.deepEqual(parallel.parts[1].chars, [4]);
    assert.deepEqual(parallel.hiddenRanges, [{ start: 2, end: 3 }, { start: 5, end: 6 }]);
    assert.deepEqual(data.lines[0].parallel.parts[1].ranges, [{ start: 2, end: 6 }], 'the input is not mutated');
});
