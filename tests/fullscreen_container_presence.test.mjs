import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { watchFullscreenContainerBodyClass as watch } from '../src/features/fullscreen/fullscreenContainerPresence.mjs';

const source = readFileSync(new URL('../src/spicetify/index.js', import.meta.url), 'utf8');
const css = readPcStylesheet();

test('fullscreen tooltip stacking follows container presence, including an orphaned container', () => {
    let container = {};
    const classes = new Set();
    const observations = [];
    const body = { classList: { toggle: (name, present) => present ? classes.add(name) : classes.delete(name) } };
    const document = { body, getElementById: id => { assert.equal(id, 'lyrics-fullscreen-container'); return container; } };
    class Observer {
        constructor(callback) { this.callback = callback; }
        observe(target, options) { observations.push({ target, options }); }
    }
    watch(document, Observer);
    const className = 'ivlyrics-fullscreen-container-mounted';
    assert.equal(classes.has(className), true, 'a preexisting fullscreen container is detected');
    assert.equal(observations[0].target, body);
    assert.deepEqual(JSON.parse(JSON.stringify(observations[0].options)), { childList: true }, 'no lyric subtree observation');
    watch(document, Observer);
    assert.equal(observations.length, 1, 'multiple lyric roots share the observer');
    container = null;
    body.ivlyricsFullscreenContainerObserver.callback();
    assert.equal(classes.has(className), false, 'normal close or orphan cleanup removes the stacking override');
    container = {};
    body.ivlyricsFullscreenContainerObserver.callback();
    assert.equal(classes.has(className), true, 'reopening restores tooltip stacking');
});

test('the watcher tolerates a host without a document body or observer', () => {
    for (const document of [undefined, { body: null }, { body: {} }]) {
        assert.doesNotThrow(() => watch(document));
    }
});

test('fullscreen presence selectors do not invalidate the Spotify or lyrics ancestor', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(rules, /body:has\(/);
    assert.doesNotMatch(rules, /\.lyrics-lyricsContainer-LyricsContainer:has\(> \.fullscreen-vinyl-overlay\)/);
    assert.match(rules, /body\.ivlyrics-fullscreen-container-mounted \[data-tippy-root\]/);
    assert.match(rules, /\.fullscreen-vinyl-overlay ~ :is\(/, 'overlay before lyric siblings');
    assert.match(rules, /\):has\(~ \.fullscreen-vinyl-overlay\)/, 'overlay after lyric siblings');
    assert.match(source, /constructor\(\)\s*{\s*super\(\);\s*watchFullscreenContainerBodyClass\(document, window\.MutationObserver\);/);
});

test('videos covered by the fullscreen layer stop pinning the frame rate', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Spotify's Now Playing Canvas lives under #main; ivLyrics' own videos
    // render inside #lyrics-fullscreen-container, which is not under #main.
    const rule = rules.match(/body\.ivlyrics-fullscreen-container-mounted #main video\s*{([^}]*)}/);
    assert.ok(rule, 'covered Spotify videos are taken out of rendering');
    assert.match(rule[1], /visibility:\s*hidden\s*!important/);
    const controller = readFileSync(new URL("../src/features/fullscreen/lyricsFullscreenController.mjs", import.meta.url), "utf8");
    assert.match(controller, /document\.body\.append\(portal\)/, 'the fullscreen container is a body child, outside #main');
});
