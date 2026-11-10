import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
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
    vm.runInContext(read('LyricsAddonManager.js'), context);
    const manager = window.LyricsAddonManager;
    for (const id of BUILT_IN) {
        manager.register({
            id, name: id, author: 'fixture', description: 'Synthetic provider', version: '1.0.0',
            defaultEnabled: id !== 'unison', supports: { synced: true }, getLyrics: async () => ({}),
        });
    }
    vm.runInContext(read('Addon_Lyrics_LrcRed.js'), context, { filename: 'Addon_Lyrics_LrcRed.js' });
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
