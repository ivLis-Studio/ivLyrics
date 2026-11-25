import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { createKaraokeHarnessFactory } from "./fixtures/karaoke-page-modules.mjs";
import { observeActiveKaraokeVocalRows } from "#ivlyrics/lyrics/activeKaraokeVocalRows.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

// Regression: two :has() rules made Spotify's Chromium restyle every element of
// the page (about 9,800) whenever a karaoke line finished or the anchored vocal
// row changed: about 100 ms on a fast PC, far more on a slow one, so lyrics
// stuttered at every line. The renderer now marks the row and the list itself.

const css = readPcStylesheet();
const presentation = readFileSync(new URL('../src/lyrics/karaokeLinePresentation.mjs', import.meta.url), 'utf8');

// Classes karaoke changes while a song plays.
const LIVE_KARAOKE_CLASSES = [
    'is-complete', 'active-vocal-row', 'is-active', 'is-bouncing', 'is-expressive-pending', 'is-effect-live',
    'is-effect-focused', 'lyrics-karaoke-char--active', 'lyrics-karaoke-char--done', 'lyrics-karaoke-char--pending',
    'lyrics-lyricsContainer-LyricsLine-active',
];

test('no :has() rule depends on a class karaoke toggles during playback', () => {
    const offenders = [];
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of rules.matchAll(/:has\(((?:[^()]|\([^()]*\))*)\)/g)) {
        const classes = match[1].match(/\.[A-Za-z_][\w-]*/g) || [];
        const live = classes.map(name => name.slice(1)).filter(name => LIVE_KARAOKE_CLASSES.includes(name));
        if (live.length) offenders.push(`:has(${match[1]}) watches ${live.join(', ')}`);
    }
    assert.deepEqual(offenders, []);
});

test('strength fades cover every text effect but do not animate plain lyric rows', () => {
    const transition = css.match(/--ivlyrics-effect-strength var\(--ivlyrics-effect-transition-duration, ([^)]+)\)/);
    assert.equal(transition?.[1], '0s', 'plain rows do not animate an unused inherited value');
    const effectKinds = [...presentation.matchAll(/const KARAOKE_TEXT_EFFECT_KIND_CLASSES = new Set\(\[([\s\S]*?)\]\)/g)][0][1]
        .match(/"([a-z]+)"/g).map(kind => kind.slice(1, -1)).sort();
    const rule = css.match(/(:is\(\.lyrics-lyricsContainer-LyricsLine, \.lyrics-karaoke-part\)[^{]+)\{\s*--ivlyrics-effect-transition-duration: ([^;]+);/);
    assert.ok(rule, 'whole-line and vocal-part effect rule exists');
    assert.equal(rule[2], 'var(--iv-lyrics-centering-duration, 300ms)', 'effect fade keeps the configured duration');
    const lists = [...rule[1].matchAll(/:is\((\.effect[^)]+)\)/g)];
    assert.equal(lists.length, 2, 'whole-line and inline-range effects both retain their fade');
    for (const [, kinds] of lists) {
        assert.deepEqual(kinds.split(', ').map(kind => kind.slice(1)).sort(), effectKinds);
    }
    assert.match(rule[1], /\.lyrics-karaoke-line:has\(\.ivlyrics-karaoke-range-style/);
    assert.equal((rule[1].match(/:not\(\.text-effects-disabled\)/g) || []).length, 2);
});

test('past karaoke rows and anchored vocal rows are styled from marks the app sets', () => {
    assert.equal(css.match(/\.lyrics-lyricsContainer-LyricsLine\.lyrics-lyricsContainer-LyricsLine-complete:not\(\.lyrics-lyricsContainer-LyricsLine-active\)/g)?.length, 3,
        'the past-line opacity, colour and highlight-mode rules use the row class');
    assert.match(css, /\.lyrics-lyricsContainer-SyncedLyrics\[data-active-vocal-row\]\s*>\s*\.lyrics-lyricsContainer-LyricsLine/);
});

test('vocal anchors update from mutation targets and mounted rows without enumerating the whole list', () => {
    const indexAttr = 'data-active-karaoke-vocal-row-index';
    const listAttr = 'data-active-vocal-row';
    const makeElement = (...children) => {
        const attrs = new Map();
        const node = {
            nodeType: 1, children, searches: 0,
            get firstElementChild() { return this.children[0]; },
            matches: () => attrs.has(indexAttr),
            getAttribute: name => attrs.get(name) ?? null,
            hasAttribute: name => attrs.has(name),
            setAttribute: (name, value) => attrs.set(name, value),
            removeAttribute: name => attrs.delete(name),
            toggleAttribute: (name, force) => force ? attrs.set(name, '') : attrs.delete(name),
            contains: other => node === other || node.children.some(child => child.contains(other)),
            querySelector: () => node.children[0] ?? null,
            querySelectorAll() {
                this.searches++;
                const find = parent => parent.children.flatMap(child => [...(child.matches() ? [child] : []), ...find(child)]);
                return find(this);
            },
        };
        return node;
    };
    const lead = makeElement(), backing = makeElement(), row = makeElement(lead, backing);
    const list = makeElement(row), page = makeElement(list);
    lead.setAttribute(indexAttr, '-1');
    backing.setAttribute(indexAttr, '1');
    let notify, stopped = false;
    const stop = observeActiveKaraokeVocalRows(page, class {
        constructor(callback) { notify = (...records) => callback(records); }
        observe(target, options) {
            assert.equal(target, page);
            assert.deepEqual(options.attributeFilter, [indexAttr]);
        }
        disconnect() { stopped = true; }
    });
    const attribute = target => ({ type: 'attributes', target });
    const children = (target, addedNodes = [], removedNodes = []) => ({ type: 'childList', target, addedNodes, removedNodes });
    assert.equal(list.hasAttribute(listAttr), true);

    lead.setAttribute(indexAttr, '0');
    backing.removeAttribute(indexAttr);
    notify(attribute(lead), attribute(backing));
    assert.equal(list.hasAttribute(listAttr), true, 'switching between stacks cannot clear the mark');
    lead.setAttribute(indexAttr, '-1');
    notify(attribute(lead));
    assert.equal(list.hasAttribute(listAttr), false);

    backing.setAttribute(indexAttr, '2');
    list.children = [];
    notify(children(list, [], [row]), attribute(backing));
    assert.equal(list.hasAttribute(listAttr), false, 'a detached mutation target cannot become active');
    list.children.push(row);
    notify(children(list, [row]));
    assert.equal(list.hasAttribute(listAttr), true, 'initial anchor values in mounted rows count');
    list.children = [];
    notify(children(list, [], [row]));
    assert.equal(list.hasAttribute(listAttr), false);
    assert.equal(list.searches, 1, 'only initial binding scans the whole list');

    const replacement = makeElement(row);
    page.children = [replacement];
    notify(children(page, [replacement], [list]));
    assert.equal(replacement.hasAttribute(listAttr), true);
    stop();
    assert.equal(replacement.hasAttribute(listAttr), false);
    assert.equal(stopped, true);
});

// Reuse the real synced engine harness.
const helperUrl = new URL('./renderer_settings_equivalence.test.mjs', import.meta.url);
const helper = readFileSync(helperUrl, 'utf8');
const harness = helper.slice(helper.indexOf('const repoRoot'), helper.indexOf('test("renderer output'))
    .replaceAll('import.meta.url', JSON.stringify(helperUrl.href));
const { createEngine, currentSource, makeLyrics } = createKaraokeHarnessFactory(
    'assert', 'execFileSync', 'readFileSync', 'fileURLToPath', 'vm',
    `${harness}\nreturn { createEngine, currentSource, makeLyrics };`
)(assert, execFileSync, readFileSync, fileURLToPath, vm);

test('the renderer marks a karaoke row complete once its content has finished', () => {
    const engine = createEngine(currentSource);
    const lyrics = makeLyrics();
    const rowClass = (position, text) => engine.render(lyrics, position, { compact: false, isKara: true }, true)
        .elements.find(element => element.props?.line?.text === text)?.props.className || '';
    assert.doesNotMatch(rowClass(2000, 'First vocal'), /LyricsLine-complete/, 'still singing');
    assert.match(rowClass(4000, 'First vocal'), /LyricsLine-complete/, 'finished');
    assert.match(rowClass(9000, 'First vocal'), /LyricsLine-paddingLine/, 'scrolled out into the padding');
    assert.match(rowClass(9000, 'First vocal'), /LyricsLine-complete/, 'a row fading into the padding keeps the mark');
    assert.doesNotMatch(rowClass(9000, 'Final vocal'), /LyricsLine-complete/, 'not reached yet');
    const plain = engine.render(lyrics, 9000, { compact: false, isKara: false }, true)
        .elements.find(element => element.props?.line?.text === 'First vocal')?.props.className || '';
    assert.doesNotMatch(plain, /LyricsLine-complete/, 'line-synced pages have no karaoke rows');
});
