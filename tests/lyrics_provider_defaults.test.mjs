import inputs from "../src/spicetify/inputs.json" with { type: "json" };
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import { sourceUrl } from "./fixtures/source-paths.mjs";
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const lrcRedSource = bundleInitializer(sourceUrl('Addon_Lyrics_LrcRed.js'));
const managerSource = bundleInitializer(sourceUrl('LyricsAddonManager.js'));
// The manager runs in its own realm; copy its arrays before strict comparison.
const ids = values => [...values];
const BUILT_IN = ['unison', 'lrclib', 'spotify', 'lyricsplus', 'open-lyrics'];

// Registers the bundled providers in an arbitrary order, with the real lrc.red
// addon, so the result depends only on the manager's defaults.
function setup(stored = {}) {
    const values = new Map(Object.entries(stored));
    const window = {};
    const context = vm.createContext({
        window, console: { info() {}, log() {}, warn() {}, error() {} },
        Spicetify: { LocalStorage: { get: key => values.get(key) ?? null, set: (key, value) => values.set(key, value) } },
        setTimeout, clearTimeout,
    });
    vm.runInContext(managerSource, context);
    const manager = window.LyricsAddonManager;
    for (const id of BUILT_IN) {
        manager.register({
            id, name: id, author: 'fixture', description: 'Synthetic provider', version: '1.0.0',
            defaultEnabled: id !== 'unison', supports: { synced: true }, getLyrics: async () => ({}),
        });
    }
    vm.runInContext(lrcRedSource, context, { filename: 'Addon_Lyrics_LrcRed.js' });
    return manager;
}

test('a new install searches lrc.red second, right after Open Lyrics, and enables it', () => {
    const manager = setup();
    assert.deepEqual(ids(manager.getProviderOrder()), ['open-lyrics', 'lrcred', 'lyricsplus', 'spotify', 'lrclib', 'unison']);
    assert.equal(manager.isProviderEnabled('lrcred'), true);
    assert.deepEqual(ids(manager.getEnabledProviders().map(provider => provider.id)),
        ['open-lyrics', 'lrcred', 'lyricsplus', 'spotify', 'lrclib']);
    assert.equal(manager.isAutomaticWordSyncFallbackEnabled(), true);
});

test("a user's saved order and an explicit lrc.red opt-out are kept", () => {
    const order = ['lyricsplus', 'open-lyrics', 'spotify', 'lrclib', 'unison', 'lrcred'];
    const manager = setup({
        'ivLyrics:lyrics:provider-order': JSON.stringify(order),
        'ivLyrics:lyrics:enabled:lrcred': 'false',
    });
    assert.deepEqual(ids(manager.getProviderOrder()), order);
    assert.equal(manager.isProviderEnabled('lrcred'), false);
    assert.equal(manager.isAutomaticWordSyncFallbackEnabled(), false);
});

test("the startup provider manager initializes once when Spotify storage arrives late", async () => {
    const window = {};
    const timers = [];
    const initialized = [];
    const context = vm.createContext({
        window, console: { info() {}, log() {}, warn() {}, error() {} },
        setTimeout: (callback, delay) => timers.push({ callback, delay }),
    });
    vm.runInContext(managerSource, context);
    const manager = window.LyricsAddonManager;
    const register = id => manager.register({
        id, name: id, author: 'fixture', version: '1.0.0',
        description: 'Synthetic provider', supports: { synced: true },
        getLyrics: async () => ({}), init: async () => { initialized.push(id); },
    });
    assert.equal(register('early'), true);
    assert.deepEqual(initialized, []);
    assert.deepEqual(timers.map(({ delay }) => delay), [100]);

    context.Spicetify = { LocalStorage: { get: () => null, set() {} } };
    timers.shift().callback();
    await manager.init();
    await manager.init();
    assert.equal(register('late'), true);
    assert.deepEqual(initialized, ['early', 'late']);
    assert.deepEqual(ids(manager.getEnabledProviders().map(({ id }) => id)), ['early', 'late']);
    assert.equal(timers.length, 0);
});

test('built-in startup initializers register once in manifest order with or without a ready manager', () => {
    const addonPaths = inputs.startup.filter(path => path.startsWith("src/providers/lyrics/Addon_Lyrics_"));
    const bundles = [true, false].map(managerReady => {
        const managerPath = "src/providers/lyrics/LyricsAddonManager.js";
        const paths = managerReady ? [managerPath, ...addonPaths] : [...addonPaths, managerPath];
        // The packaged startup extension shares a module instance between
        // all built-ins and the manager. Exercise that composition here too.
        return buildSync({
            stdin: {
                resolveDir: fileURLToPath(new URL('../', import.meta.url)),
                contents: paths.map((path, index) =>
                    `import start${index} from ${JSON.stringify('./' + path)}; start${index}();`).join('\n'),
            },
            bundle: true,
            format: 'iife',
            platform: 'browser',
            write: false,
        }).outputFiles[0].text;
    });
    const expected = ['lrclib', 'lrcred', 'lyricsplus', 'unison', 'open-lyrics', 'spotify'];

    for (const [index, source] of bundles.entries()) {
        const managerReady = index === 0;
        const pending = [];
        const window = {};
        const context = vm.createContext({
            window, atob, console: { info() {}, log() {}, warn() {}, error() {} }, URL,
            Spicetify: { LocalStorage: { get: () => null, set() {} } },
            setTimeout(callback, delay) {
                assert.equal(delay, 100);
                pending.push(callback);
            },
        });
        vm.runInContext(source, context);
        const manager = window.LyricsAddonManager;
        assert.deepEqual(ids(manager.getAddonIds()), managerReady ? expected : []);
        assert.equal(pending.length, managerReady ? 0 : 1);

        while (pending.length) pending.shift()();
        assert.deepEqual(ids(manager.getAddonIds()), expected);
        assert.equal(typeof window.ivLyricsLyricsParser.parseTtmlLyrics, 'function');
        assert.equal(typeof window.IvLyricsLrclibTransport.fetch, 'function');
    }
});
