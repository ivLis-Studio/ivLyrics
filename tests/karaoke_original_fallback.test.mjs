import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const url = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const source = readFileSync(url, 'utf8');
const harness = source.slice(source.indexOf('const currentSource ='), source.indexOf("test('vocal presence"))
    .replaceAll('import.meta.url', JSON.stringify(url.href))
    .replace('getKaraokeVocalRows };', 'getKaraokeVocalRows, buildKaraokeTimedChars };');
const { createHarness } = new Function('assert', 'execFileSync', 'readFileSync', 'vm',
    harness + '\nreturn { createHarness };')(assert, execFileSync, readFileSync, vm);
const original = '明日も歩こう';
const pronunciation = '아시타모 아루코오';
const fallback = { startTime: 3000, endTime: 6000, originalText: original, text: pronunciation, phoneticText: pronunciation };
const textOf = (h, line) => Array.from(h.context.api.buildKaraokeTimedChars(line), x => x.char).join('');

test('mixed karaoke keeps the original on a line without native word timing after pronunciation arrives', () => {
    const h = createHarness();
    const native = { startTime: 1000, endTime: 2500, text: '先に歌おう',
        syllables: [{ text: '先に歌おう', startTime: 1000, endTime: 2500 }] };
    assert.equal(textOf(h, native), '先に歌おう');
    assert.equal(textOf(h, { ...fallback, text: null, phoneticText: null }), original, 'original-only presentation');
    assert.equal(textOf(h, fallback), original, 'pronunciation must not become the original glyphs');
    assert.equal(fallback.text, pronunciation, 'rendering does not alter the supplement');
});

test('KaraokeLine shaping and furigana also receive the original fallback text', () => {
    const h = createHarness(undefined, { locale: 'ja' });
    const inputs = [];
    h.context.Utils.applyFuriganaIfEnabled = text => { inputs.push(text); return text; };
    h.render(fallback, 4000);
    assert.ok(inputs.includes(original));
    assert.equal(inputs.includes(pronunciation), false);
});

test('native syllables remain authoritative and raw provider lines without originalText still render', () => {
    const h = createHarness();
    const line = { ...fallback, syllables: [{ text: original, startTime: 3000, endTime: 6000 }] };
    assert.equal(textOf(h, line), original);
    assert.equal(textOf(h, { text: original, startTime: 3000, endTime: 6000 }), original);
});
