import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const codec = createRequire(import.meta.url)('../SyncDataCodec.js');
const document = lines => ({ version: 5, trackDurationMs: 120000, lines });
const line = (granularity, timing) => ({ start: 0, end: 10, granularity, ...timing });
const normalized = value => JSON.parse(JSON.stringify(value));

test('line, word and character timing round trip without inventing precision', () => {
  for (const target of [line('line', { timing: 12.34 }),
    line('word', { timing: [[5, 12.34], [10, 12.8]] }),
    line('character', { chars: Array.from({ length: 11 }, (_, index) => (12340 + index * 80) / 1000) }),
    { start: 0, end: 2, chars: [0, 0, 0.001] }]) {
    const old = document([target]);
    const before = normalized(old);
    const encoded = codec.encode(old);
    assert.equal(encoded.version, 6);
    assert.equal(encoded.timeUnit, 'ms');
    assert.equal(encoded.indexUnit, 'nfc-codepoint');
    assert.deepEqual(codec.decode(encoded), old);
    assert.deepEqual(codec.encode(codec.decode(encoded)), encoded);
    assert.deepEqual(old, before);
  }
});

test('one refined word produces mixed runs while other words retain word timing', () => {
  const original = document([line('word', { chars: [1,1,1,1,1,1,2,2.1,2.2,2.3,2.4] })]);
  const encoded = codec.encode(original, { chars: Array.from('Hello world'), wordRanges: () => [{ start: 0, end: 5 }, { start: 6, end: 10 }] });
  const timing = encoded.lines[0].timing;
  assert.equal(timing.unit, 'mixed');
  assert.deepEqual(codec.unitRuns(timing, 11), [{ unit: 'word', length: 6 }, { unit: 'character', length: 5 }]);
  assert.deepEqual(codec.decode(encoded).lines[0].chars, original.lines[0].chars);
  assert.deepEqual(codec.encode(codec.decode(encoded)), encoded, 'legacy view retains its original mixed units');
});

test('parallel, held notes, styles, hidden text and source remain attached to their local ranges', () => {
  const old = { ...document([{
    start: 10, end: 15, granularity: 'character', chars: [1,1,1.2,1.5,1.5,1.5], lastCharEnd: 2,
    speaker: 'CUSTOM', 'speaker-color': '#abcdef', 'speaker-fallback': 'FEMALE 1', kind: 'wave',
    styleRanges: [{ start: 10, end: 11, kind: 'glow' }], hiddenRanges: [{ start: 12, end: 12 }],
    mergedLineContinuationStarts: [13], parallel: { layout: 'stack', hiddenRanges: [{ start: 12, end: 12 }],
      parts: [{ id: 'a', role: 'lead', ranges: [{ start: 10, end: 11 }], join: [], granularity: 'word', timing: [[1,1]] },
        { id: 'b', role: 'background', ranges: [{ start: 13, end: 15 }], join: [], granularity: 'line', timing: 1.5, lastCharEnd: 2 }]
    }
  }]), source: { provider: 'lrclib', lrclibId: 123, lyricsFingerprint: 'fixture' } };
  const encoded = codec.encode(old);
  assert.deepEqual(encoded.lines[0].parallel.parts[1].ranges, [[3,6]]);
  assert.deepEqual(encoded.lines[0].styles[0].range, [0,2]);
  assert.equal(encoded.lines[0].timing.endMs, 2000);
  assert.deepEqual(codec.decode(encoded), old);
});

test('rejects version spoofing, lossy time conversion, unsafe allocations and malformed mixed data', () => {
  assert.throws(() => codec.validate({ version: 6, lines: [{ start: 0, end: 2, chars: [1,2,3] }] }), /encoding/);
  assert.throws(() => codec.encode(document([line('line', { timing: 0.0001 })])), /precision loss/);
  const valid = codec.encode(document([line('line', { timing: 1 })]));
  for (const mutate of [d => d.lines[0].length = 1e9, d => d.lines[0].offset = -1,
    d => d.lines[0].timing.startMs = 0.5, d => d.lines[0].timing.startMs = -1,
    d => d.lines[0].timing.deltaMs = [1], d => d.lines[0].timing.endMs = 999,
    d => d.timeUnit = 'seconds', d => d.lines[0].id = 'different',
    d => d.lines.push(d.lines[0]), d => d.lines[0].timing.unrecognized = true,
    d => d.lines[0].timing = { unit: 'word', startMs: 0, lengths: [11], deltaMs: [5] },
    d => d.lines[0].timing = { unit: 'mixed', runs: [{ length: 10, timing: { unit: 'line', startMs: 0 } }] }]) {
    const data = normalized(valid); mutate(data); assert.throws(() => codec.validate(data), /Invalid sync v6/);
  }
});

test('patches carry only changed lines, round trip insert/remove and reject inconsistent identities', () => {
  const before = codec.encode(document(Array.from({ length: 100 }, (_, index) => ({ start: index * 2, end: index * 2 + 1, granularity: 'line', timing: index + 1 }))));
  const after = normalized(before); after.lines[40].timing.startMs += 50;
  const patch = codec.diff(before, after);
  assert.equal(patch.put.length, 1);
  assert.deepEqual(codec.applyPatch(before, patch), after);
  assert.ok(JSON.stringify(patch).length < JSON.stringify(after).length / 20);
  assert.deepEqual(codec.diff(after, after), { put: [], remove: [] });
  const removed = normalized(after); removed.lines.splice(40,1);
  assert.deepEqual(codec.applyPatch(after, codec.diff(after,removed)),removed);
  assert.deepEqual(codec.applyPatch(removed,codec.diff(removed,after)),after);
  assert.throws(() => codec.applyPatch(before,{put:[],remove:['missing']}),/remove id/);
  assert.throws(() => codec.applyPatch(before,{put:[after.lines[0],after.lines[0]],remove:[]}),/put id/);
  assert.throws(() => codec.applyPatch(before,{document:after,put:[]}),/ambiguous/);
});

test('canonical identity ignores legacy field order and source search hints', () => {
  const a = document([{ start: 0, end: 1, granularity: 'character', chars: [1,1.1] }]);
  a.source = { provider: 'lrclib', lrclibId: 123, searchSource: 'cache' };
  const b = { source: { lrclibId: 123, provider: 'lrclib', searchSource: 'network' }, lines: a.lines, trackDurationMs:120000,version:5 };
  assert.equal(codec.canonical(a),codec.canonical(codec.encode(b)));
  assert.equal(codec.fingerprint(a),codec.fingerprint(codec.encode(b)));
});

test('randomized millisecond timelines preserve every timestamp and held end through both formats', () => {
  let seed = 8127;
  const random = n => (seed = Math.imul(seed,1664525)+1013904223>>>0) % n;
  for (let iteration=0; iteration<300; iteration++) {
    const length=1+random(200), chars=[];let t=random(100000);
    for(let i=0;i<length;i++){t+=random(500);chars.push(t/1000);}
    const old=document([{start:0,end:length-1,granularity:'character',chars,lastCharEnd:(t+random(2000))/1000}]);
    assert.deepEqual(codec.decode(codec.encode(old)),old);
  }
});

test('published golden vectors retain canonical identities and old-client views', async () => {
  const { readFile } = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/sync-v6-golden.json', import.meta.url)));
  for (const vector of fixture.vectors) {
    assert.deepEqual(codec.decode(vector.v6), vector.legacy, vector.name);
    assert.equal(codec.canonical(vector.v6), vector.canonical, vector.name);
    assert.deepEqual(codec.encode(JSON.parse(JSON.stringify(vector.legacy))), vector.v6, vector.name);
  }
});

test('patches ignore server-canonical key order when a saved song is reopened',()=>{
  const before=codec.encode(document([line('character',{chars:Array(11).fill(1)})]));
  const sorted=JSON.parse(codec.canonical(before));
  assert.deepEqual(codec.diff(sorted,before),{put:[],remove:[]});
});

test('shared malformed v6 vectors are rejected by the canonical codec', async()=>{
  const {readFile}=await import('node:fs/promises');
  const fixture=JSON.parse(await readFile(new URL('./fixtures/sync-v6-golden.json',import.meta.url)));
  for(const vector of fixture.invalid)assert.throws(()=>codec.validate(vector.v6),/Invalid sync v6/,vector.name);
});
