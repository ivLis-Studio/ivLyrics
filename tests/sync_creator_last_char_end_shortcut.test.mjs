import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createLockedEditor } from './sync_creator_lock_harness.mjs';

const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const start = source.indexOf('\tconst getCurrentLastCharEndInfo =');
const end = source.indexOf('\tconst renderLastCharEndControls =', start);
assert.ok(start >= 0 && end > start);

// Exercise both the shipping document listener and its real state updater.
function createEditor(t, mode) {
    const h = createLockedEditor();
    t.after(() => h.dispose());
    let claims = 0;
    Object.assign(h.context, { mode, claimSessionForLocalEditing() { claims++; } });
    vm.runInContext(source.slice(start, end), h.context);
    h.refreshKeyboard();
    return { h, claims: () => claims };
}

const controls = [
    ['input', { tagName: 'INPUT' }],
    ['textarea', { tagName: 'TEXTAREA' }],
    ['select', { tagName: 'SELECT' }],
    ['editable text', { isContentEditable: true }],
    ['menu item', { closest: () => ({}) }],
];

for (const mode of ['idle', 'record']) {
    for (const [name, target] of controls) {
        test(`End now leaves ${name} input and sync data untouched in ${mode} mode`, t => {
            const { h, claims } = createEditor(t, mode);
            let consumed = 0;
            const consume = () => { consumed++; };
            h.press('`', 16, { target, preventDefault: consume, stopPropagation: consume, stopImmediatePropagation: consume });
            assert.equal(consumed, 0);
            assert.equal(h.line().lastCharEnd, undefined);
            assert.equal(claims(), 0);
        });
    }

    test(`End now still stores playback time from the stage in ${mode} mode`, t => {
        const { h, claims } = createEditor(t, mode);
        let prevented = 0;
        h.press('`', 16, { preventDefault() { prevented++; } });
        assert.equal(prevented, 1);
        assert.equal(h.line().lastCharEnd, 16);
        assert.equal(claims(), 1);
    });
}

test('End now ignores IME composition', t => {
    const { h, claims } = createEditor(t, 'idle');
    let prevented = 0;
    h.press('`', 16, { isComposing: true, preventDefault() { prevented++; } });
    assert.equal(prevented, 0);
    assert.equal(h.line().lastCharEnd, undefined);
    assert.equal(claims(), 0);
});

test('a custom End now binding respects input focus and still works on the stage', t => {
    const { h } = createEditor(t, 'idle');
    h.context.localStorage.getItem = key => key === 'ivLyrics:visual:sync-creator-last-char-end-key' ? 'q' : null;
    h.press('q', 16, { target: { tagName: 'INPUT' } });
    assert.equal(h.line().lastCharEnd, undefined);
    h.press('q', 17);
    assert.equal(h.line().lastCharEnd, 17);
});
