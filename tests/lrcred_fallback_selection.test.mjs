import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../LyricsAddonManager.js', import.meta.url), 'utf8');
const info = { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'Fixture', artist: 'Artist' };
const lines = [{ text: 'Fixture lyric', startTime: 1000, endTime: 3000 }];

function setup({ native = false, found = true, enabled = true, preferTypes = true, wordEnabled = true, plainOnly = false } = {}) {
    const calls = [], generations = [], stored = new Map();
    stored.set('ivLyrics:visual:prefer-lyrics-type-over-provider-order', String(preferTypes));
    stored.set('ivLyrics:lyrics:enabled:lrcred', String(enabled));
    stored.set('ivLyrics:lyrics:addon:lrcred:enable_word', JSON.stringify(wordEnabled));
    const window = {
        LyricsService: { extractTrackId: () => 'AAAAAAAAAAAAAAAAAAAAAA' },
    };
    const context = vm.createContext({
        window, console: { info() {}, log() {}, warn() {}, error() {} },
        Spicetify: { LocalStorage: { get: key => stored.get(key) ?? null, set: (key, value) => stored.set(key, value) } },
        setTimeout, clearTimeout,
    });
    vm.runInContext(source, context);
    const manager = window.LyricsAddonManager;
    const provider = (id, result) => ({
        id, name: id, author: 'fixture', description: 'Synthetic provider', version: '1.0.0', defaultEnabled: true,
        supports: { karaoke: true, karaokeCharacter: true, karaokeWord: true, synced: true, unsynced: true },
        getLyrics: async () => { calls.push(id); return { uri: info.uri, provider: id, ...result }; },
    });
    manager.register(provider('open-lyrics', { synced: lines, unsynced: lines }));
    manager.register(provider('lyricsplus', native ? {
        karaokeGranularity: native === 'character' ? 'character' : 'word', karaokeSource: 'lyricsplus',
        karaoke: [{ ...lines[0], syllables: [
            { text: 'Fixture ', startTime: 1000, endTime: 2000 }, { text: 'lyric', startTime: 2000, endTime: 3000 },
        ] }], synced: lines, unsynced: lines,
    } : { synced: lines, unsynced: lines }));
    manager.register({
        ...provider('lrcred', found ? { synced: plainOnly ? null : lines, unsynced: lines } : { error: 'No lyrics' }),
        requestWordSync: (track, result) => generations.push({ track, result, calls: [...calls] }),
    });
    return { manager, calls, generations };
}

for (const preferTypes of [true, false]) {
    test(`native karaoke wins and prevents AI generation (type preference ${preferTypes})`, async () => {
        const h = setup({ native: true, preferTypes });
        const result = await h.manager.getLyrics(info);
        assert.equal(result.provider, 'lyricsplus');
        assert.ok(result.karaoke?.length);
        assert.equal(h.generations.length, 0);
    });
}

test('only after every karaoke provider fails, prefer lrc.red text and start generation', async () => {
    const h = setup();
    const result = await h.manager.getLyrics(info);
    assert.equal(result.provider, 'lrcred');
    assert.equal(result.synced[0].text, 'Fixture lyric');
    assert.equal(h.generations.length, 1);
    assert.deepEqual(new Set(h.generations[0].calls), new Set(['open-lyrics', 'lyricsplus', 'lrcred']));
    assert.equal(h.generations[0].result.karaoke, null);
    assert.equal(h.calls.length, 3, 'each provider is fetched only once across timing phases');
});

for (const [name, options] of [
    ['missing lrc.red lyrics', { found: false }],
    ['disabled lrc.red', { enabled: false }],
    ['disabled word timing', { wordEnabled: false }],
]) {
    test(`${name} retains normal fallback without generating`, async () => {
        const h = setup(options);
        const result = await h.manager.getLyrics(info);
        assert.equal(result.provider, 'open-lyrics');
        assert.equal(h.generations.length, 0);
    });
}

test('an explicit source override does not claim that every other source was searched', async () => {
    const h = setup();
    const result = await h.manager.getLyrics(info, 'lrcred');
    assert.equal(result.provider, 'lrcred');
    assert.deepEqual(h.calls, ['lrcred']);
    assert.equal(h.generations.length, 0);
});

test('plain lrc.red lyrics also take precedence while word sync is being generated', async () => {
    const h = setup({ plainOnly: true });
    const result = await h.manager.getLyrics(info);
    assert.equal(result.provider, 'lrcred');
    assert.equal(result.synced, null);
    assert.equal(result.unsynced[0].text, 'Fixture lyric');
    assert.equal(h.generations.length, 1);
});

test('existing character timing also wins without requesting AI word timing', async () => {
    const h = setup({ native: 'character' });
    const result = await h.manager.getLyrics(info);
    assert.equal(result.provider, 'lyricsplus');
    assert.equal(result.karaokeGranularity, 'character');
    assert.equal(h.generations.length, 0);
});
