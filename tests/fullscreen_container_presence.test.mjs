import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const watcher = source.slice(source.indexOf('const FULLSCREEN_CONTAINER_BODY_CLASS ='), source.indexOf('class LyricsContainer extends'));

test('fullscreen tooltip stacking follows container presence, including an orphaned container', () => {
    let container = {};
    const classes = new Set();
    const observations = [];
    const body = { classList: { toggle: (name, present) => present ? classes.add(name) : classes.delete(name) } };
    const context = vm.createContext({
        document: { body, getElementById: id => { assert.equal(id, 'lyrics-fullscreen-container'); return container; } },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; }
            observe(target, options) { observations.push({ target, options }); }
        },
    });
    const watch = vm.runInContext(`${watcher}\nwatchFullscreenContainerBodyClass;`, context);
    watch();
    const className = 'ivlyrics-fullscreen-container-mounted';
    assert.equal(classes.has(className), true, 'a preexisting fullscreen container is detected');
    assert.equal(observations[0].target, body);
    assert.deepEqual(JSON.parse(JSON.stringify(observations[0].options)), { childList: true }, 'no lyric subtree observation');
    watch();
    assert.equal(observations.length, 1, 'multiple lyric roots share the observer');
    container = null;
    body.ivlyricsFullscreenContainerObserver.callback();
    assert.equal(classes.has(className), false, 'normal close or orphan cleanup removes the stacking override');
    container = {};
    body.ivlyricsFullscreenContainerObserver.callback();
    assert.equal(classes.has(className), true, 'reopening restores tooltip stacking');
});

test('the watcher tolerates a host without a document body or observer', () => {
    for (const globals of [{}, { document: { body: null } }, { document: { body: {} } }]) {
        assert.doesNotThrow(() => vm.runInNewContext(`${watcher}\nwatchFullscreenContainerBodyClass();`, globals));
    }
});

test('fullscreen presence selectors do not invalidate the Spotify or lyrics ancestor', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(rules, /body:has\(/);
    assert.doesNotMatch(rules, /\.lyrics-lyricsContainer-LyricsContainer:has\(> \.fullscreen-vinyl-overlay\)/);
    assert.match(rules, /body\.ivlyrics-fullscreen-container-mounted \[data-tippy-root\]/);
    assert.match(rules, /\.fullscreen-vinyl-overlay ~ :is\(/, 'overlay before lyric siblings');
    assert.match(rules, /\):has\(~ \.fullscreen-vinyl-overlay\)/, 'overlay after lyric siblings');
    assert.match(source, /constructor\(\)\s*{\s*super\(\);\s*watchFullscreenContainerBodyClass\(\);/);
});

test('videos covered by the fullscreen layer stop pinning the frame rate', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Spotify's Now Playing Canvas lives under #main; ivLyrics' own videos
    // render inside #lyrics-fullscreen-container, which is not under #main.
    const rule = rules.match(/body\.ivlyrics-fullscreen-container-mounted #main video\s*{([^}]*)}/);
    assert.ok(rule, 'covered Spotify videos are taken out of rendering');
    assert.match(rule[1], /visibility:\s*hidden\s*!important/);
    assert.match(source, /document\.body\.append\(this\.fullscreenContainer\)/, 'the fullscreen container is a body child, outside #main');
});
