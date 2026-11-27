import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { instrumentalMarkers } from '../src/lyrics/InstrumentalBreaks.js';

test('instrumental marker fast paths preserve the original decode order and classification', async () => {
    const baselineSource = execFileSync('git', ['show', '3d6c0026:src/lyrics/InstrumentalBreaks.js'], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
    });
    const { instrumentalMarkers: baseline } = await import(
        'data:text/javascript;base64,' + Buffer.from(baselineSource).toString('base64')
    );
    const tokens = [
        '♪', '♭', '𝗀歌', 'Only lyrics', '<♪>', '&amp;', '&#38;lt;', '<B>♪</B>',
        '&amp;lt;i&amp;gt;&amp;sung;&amp;lt;/i&amp;gt;', '&LT;I&gt;&#9834; &lt;/I&gt;',
        '&sung;', '&#x1D11E;', '&#9834', '&#x110000;', '&#0;', '&#xD800',
        '&nbsp;&flat; &sharp; &natur;', '&bogus;', '<a unclosed', '＜[♪]＞',
        '[[[♪]]]', '[[[[♪]]]]', '<i>text</i>', '> no start',
    ];
    const inputs = [
        null, undefined, 0, false, '', ' ', { toString: () => '<b>&amp;sung;</b>' },
        ...tokens, ...tokens.flatMap(left => tokens.map(right => left + right)),
    ];
    for (const input of inputs) {
        assert.equal(instrumentalMarkers.decodeEntities(input), baseline.decodeEntities(input), String(input));
        assert.equal(instrumentalMarkers.getMarker(input), baseline.getMarker(input), String(input));
        assert.equal(instrumentalMarkers.isMarkerText(input), baseline.isMarkerText(input), String(input));
    }
});
