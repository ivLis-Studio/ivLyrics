import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncCreatorVocalLayout } from '../src/features/sync/syncCreatorVocalLayout.mjs';
import { countSyncCreatorRangeChars } from '../src/features/sync/timingGranularity.mjs';
import {
    countSyncDataRangeChars, getNextSyncDataPartId, splitSyncDataHiddenDelimitedParallelParts,
    trimSyncDataPartParentheticals,
} from '../src/lyrics/syncRenderVocalRanges.mjs';
import { buildSyncDataVocalLine } from '../src/lyrics/syncRenderVocalLine.mjs';

test('shared range lengths and part allocation preserve editor ordering and boundaries', () => {
    const cases = [
        undefined, [], [null, { start: 2, end: 0 }, { start: 2.4, end: 9 }],
        [{ start: '3', end: '6' }, { start: -2, end: -1 }, { start: 6, end: 6 }],
        [{ start: 4, end: 5 }, , { start: 4, end: 8 }],
    ];
    for (const ranges of cases) assert.equal(countSyncDataRangeChars(ranges), countSyncCreatorRangeChars(ranges));

    const used = new Set(['b', 'p1']);
    const allocated = Array.from({ length: 40 }, () => getNextSyncDataPartId(used));
    assert.deepEqual(allocated, [
        'a', ...'cdefghijklmnopqrstuvwxyz', ...Array.from({ length: 15 }, (_, i) => `p${i + 2}`),
    ]);
    assert.equal(getNextSyncDataPartId(used), null);
});

test('split hidden vocal gaps in renderer timing and editor drafts', () => {
    const editor = createSyncCreatorVocalLayout({
        normalizeSyncCreatorSpeaker: () => '',
        sanitizeSyncCreatorSpeakerFallback: () => '',
        sanitizeSyncCreatorSpeakerColor: () => '',
    });
    const part = { id: 'b', role: 'background', ranges: [{ start: 1, end: 2 }, { start: 6, end: 6 }], join: [1] };
    const lead = { id: 'a', role: 'lead' };
    const timing = [1.1, 1.2, 3.1];
    const hiddenRanges = [{ start: 3, end: 5 }];
    const draft = { parts: [lead, part], hiddenRanges };
    const recorded = { parts: [lead, { ...part, chars: timing }], hiddenRanges };
    const cases = [
        draft, recorded,
        { parts: [lead, { ...part, chars: [1] }], hiddenRanges },
        { parts: [lead, { ...part, chars: timing, join: [2] }], hiddenRanges },
        { parts: [lead, part], hiddenRanges: [{ start: 3, end: 4 }] },
        { parts: [...Array.from({ length: 15 }, (_, i) => ({ id: `lead-${i}`, role: 'lead' })), part], hiddenRanges },
    ];
    for (const parallel of cases) {
        assert.deepEqual(splitSyncDataHiddenDelimitedParallelParts(parallel, { allowUntimedParts: true }),
            editor.sanitizeSyncCreatorParallel(parallel));
    }

    assert.equal(splitSyncDataHiddenDelimitedParallelParts(draft), draft);
    const split = splitSyncDataHiddenDelimitedParallelParts(recorded);
    assert.deepEqual(split.parts.map(({ id, chars }) => [id, chars]), [['a', undefined], ['b', [1.1, 1.2]], ['c', [3.1]]]);
    assert.equal(split.parts[0], lead);
});

test('trim parenthetical part ranges and report absolute hidden source positions', () => {
    const chars = Array.from('a ( 歌 ) Z');
    const part = { ranges: [{ start: 2, end: 6 }], chars: [2, 3, 4, 5, 6] };
    const hidden = [];
    assert.deepEqual(trimSyncDataPartParentheticals(part, chars, index => hidden.push(index)), {
        ranges: [{ start: 4, end: 4 }], chars: [4],
    });
    assert.deepEqual(hidden, [2, 3, 5, 6]);
    const invalid = { ...part, chars: [] };
    assert.equal(trimSyncDataPartParentheticals(invalid, chars), invalid);
});

test('vocal lines retain the chosen lead, other source voices and caller fallbacks', () => {
    const early = {
        id: 'a', role: 'background', text: 'response', speaker: 'B', kind: 'echo',
        syllables: [{ text: 'response', startTime: 910, endTime: 2300 }], startTime: 910, endTime: 2300,
    };
    const lead = {
        id: 'b', role: 'lead', text: 'call', speaker: '', kind: '',
        'speaker-color': '#123456', 'speaker-fallback': 'FEMALE 1',
        syllables: [{ text: 'call', startTime: 1000, endTime: 1400 }], startTime: 1000, endTime: 1400,
    };
    const line = { text: 'call response', startTime: 1000, endTime: 2000, speaker: 'A', 'speaker-color': '#fedcba' };
    const output = buildSyncDataVocalLine(line, [early, lead], { speaker: 'NORMAL', kind: 'whisper' });
    assert.deepEqual(output, {
        ...line, startTime: 910, endTime: 2300, 'speaker-fallback': 'FEMALE 1', kind: 'whisper',
        vocals: {
            lead: {
                id: 'b', role: 'lead', speaker: '', text: 'call', kind: '',
                'speaker-color': '#123456', 'speaker-fallback': 'FEMALE 1', syllables: lead.syllables,
            },
            background: [{
                id: 'a', role: 'background', speaker: 'B', text: 'response', kind: 'echo',
                'speaker-color': '', 'speaker-fallback': '', syllables: early.syllables,
            }],
        },
    });
    assert.equal(output.vocals.lead.syllables, lead.syllables);
    const preview = buildSyncDataVocalLine({ ...line, speaker: '' }, [{ ...lead, role: '' }], { speaker: 'NORMAL' });
    assert.equal(preview.speaker, 'NORMAL');
    assert.equal(preview.kind, 'vocal');
    assert.equal(preview.vocals.lead.id, 'b');
    assert.deepEqual(preview.vocals.background, []);
});
