import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Addon_Lyrics_LrcRed.js', import.meta.url), 'utf8');
const ISRC_A = 'JPAAA2600001', ISRC_B = 'JPAAA2600002';
const URI_A = 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', URI_B = 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB';
const track = { uri: URI_B, title: 'Requested Song', artist: 'Fixture Artist', durationMs: 200000 };
const hit = (isrc = ISRC_B, overrides = {}) => ({ isrc, title: track.title, artist: track.artist, duration: 200, ...overrides });

function createProvider({ playerItem, resolveIsrc, tracks = {}, hits = [], search, lrcOnly = false } = {}) {
    let addon;
    const requests = [], resolutions = [], parsedLrc = [];
    const parsed = { karaoke: [], synced: [{ startTime: 1000, text: 'Fixture lyric' }] };
    const window = {
        LyricsAddonManager: { register(value) { addon = value; } },
        LyricsService: { extractTrackId: uri => /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri || '')?.[1] || '' },
        SyncDataService: resolveIsrc ? { resolveTrackIsrc: async (id, info) => {
            resolutions.push({ id, info });
            return resolveIsrc(id, info);
        } } : {},
        ivLyricsLyricsParser: {
            parseTtmlLyrics: () => parsed,
            parseLrcLyrics: lrc => { parsedLrc.push(lrc); return parsed; },
        },
    };
    const fetch = async input => {
        const url = new URL(input);
        requests.push(url);
        if (url.pathname === '/search.json') return Response.json({ hits: search ? search(url.searchParams.get('q')) : hits });
        if (url.pathname.endsWith('.json')) {
            const record = tracks[url.pathname.slice(3, -5)];
            return record ? Response.json(record) : new Response('', { status: 404 });
        }
        if (url.pathname.endsWith('.ttml')) return new Response(lrcOnly ? '' : '<fixture/>', { status: lrcOnly ? 404 : 200 });
        if (url.pathname.endsWith('.lrc')) return new Response('[00:01.00]<00:01.00>Fixture <00:01.50>lyric');
        throw new Error(`Unexpected request: ${url}`);
    };
    const context = vm.createContext({
        window, fetch, Response, AbortController, setTimeout, clearTimeout,
        Spicetify: { Player: { data: { item: playerItem } } },
        console: { warn() {} },
    });
    vm.runInContext(source, context, { filename: 'Addon_Lyrics_LrcRed.js' });
    assert.equal(addon.id, 'lrcred');
    return { addon, requests, resolutions, parsedLrc };
}

test('prefetch resolves the requested track instead of inheriting the playing track ISRC', async () => {
    const h = createProvider({
        playerItem: { uri: URI_A, external_ids: { isrc: ISRC_A } },
        resolveIsrc: () => ISRC_B,
        tracks: { [ISRC_A]: hit(ISRC_A, { title: 'Playing Song' }), [ISRC_B]: hit() },
    });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.uri, URI_B);
    assert.equal(result.lrcred?.isrc, ISRC_B);
    assert.equal(h.resolutions[0]?.id, 'BBBBBBBBBBBBBBBBBBBBBB');
    assert.ok(!h.requests.some(url => url.pathname.includes(ISRC_A)));
});

test('explicit requested-track ISRC takes precedence over player state and lookup', async () => {
    const h = createProvider({
        playerItem: { uri: URI_A, metadata: { isrc: ISRC_A } },
        resolveIsrc: () => ISRC_A, tracks: { [ISRC_B]: hit() },
    });
    const result = await h.addon.getLyrics({ ...track, external_ids: { isrc: ISRC_B } });
    assert.equal(result.lrcred?.isrc, ISRC_B);
    assert.equal(h.resolutions.length, 0);
});

for (const [name, uri] of [['local track', 'spotify:local:artist:album:title:200'], ['missing resolver', URI_B]]) {
    test(`${name} searches its metadata without using the playing track ISRC`, async () => {
        const h = createProvider({ playerItem: { uri: URI_A, isrc: ISRC_A }, tracks: { [ISRC_A]: hit(ISRC_A) }, hits: [hit()] });
        const result = await h.addon.getLyrics({ ...track, uri });
        assert.equal(result.lrcred?.isrc, ISRC_B);
        assert.ok(!h.requests.some(url => url.pathname.includes(ISRC_A)));
    });
}

for (const [title, other, artist] of [
    ['群青', '夜に駆ける', 'YOASOBI'],
    ['좋은 날', '너랑 나', '아이유'],
    ['晴天', '稻香', '周杰倫'],
]) {
    test(`search preserves ${title} and chooses it over another song by ${artist}`, async () => {
        const h = createProvider({ hits: [hit(ISRC_A, { title: other, artist }), hit(ISRC_B, { title, artist, duration: 203 })] });
        const result = await h.addon.getLyrics({ ...track, title, artist });
        assert.equal(result.lrcred?.isrc, ISRC_B);
    });
}

for (const [name, unwanted] of [
    ['another song by the same artist', { title: 'Other Song' }],
    ['an anagram title', { title: 'Song Requested' }],
    ['a cover of the same length', { artist: 'Unrelated Performer' }],
    ['a tribute act containing the artist name', { artist: 'Fixture Artist Tribute Band' }],
    ['missing artist metadata', { artist: '' }],
]) {
    test(`search rejects ${name} instead of fetching its lyrics`, async () => {
        const h = createProvider({ hits: [hit(ISRC_A, unwanted)] });
        const result = await h.addon.getLyrics(track);
        assert.equal(result.lrcred, undefined);
        assert.ok(result.error);
        assert.ok(h.requests.every(url => url.pathname === '/search.json'));
    });
}

test('fallback queries continue after nonempty but unrelated search results', async () => {
    const h = createProvider({ search: query => query === track.title ? [hit()] : [hit(ISRC_A, { title: 'Other Song' })] });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.lrcred?.isrc, ISRC_B);
    assert.ok(h.requests.some(url => url.searchParams.get('q') === track.title));
});

for (const [wanted, actual] of [
    ['Señorita', 'Senorita'], ['F.E.E.L.', 'FEEL'], ['がく', 'か\u3099く'],
    ["Don't Stop", 'Dont Stop'], ['Song (Special Edition)', 'Song'],
]) {
    test(`search keeps harmless title variants: ${wanted} / ${actual}`, async () => {
        const h = createProvider({ hits: [hit(ISRC_B, { title: actual })] });
        const result = await h.addon.getLyrics({ ...track, title: wanted });
        assert.equal(result.lrcred?.isrc, ISRC_B);
    });
}

test('Japanese voicing still distinguishes unrelated titles', async () => {
    const h = createProvider({ hits: [hit(ISRC_A, { title: 'かく' })] });
    const result = await h.addon.getLyrics({ ...track, title: 'がく' });
    assert.equal(result.lrcred, undefined);
});

for (const [wanted, actual] of [['Song (Part I)', 'Song (Part II)'], ['Song - Another Story', 'Song']]) {
    test(`matching preserves meaningful subtitles: ${wanted} / ${actual}`, async () => {
        const h = createProvider({ hits: [hit(ISRC_A, { title: actual })] });
        const result = await h.addon.getLyrics({ ...track, title: wanted });
        assert.equal(result.lrcred, undefined);
    });
}

test('featured-artist spelling differences still match the same lead artist', async () => {
    const h = createProvider({ hits: [hit(ISRC_B, { artist: 'Fixture Artist feat. Guest' })] });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.lrcred?.isrc, ISRC_B);
});

test('LRC-only matches still produce line lyrics without leaking enhanced timing tags', async () => {
    const h = createProvider({ hits: [hit()], lrcOnly: true });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.lrcred?.syncType, 'line');
    assert.equal(result.synced?.[0].text, 'Fixture lyric');
    assert.equal(h.parsedLrc[0], '[00:01.00]Fixture lyric');
});
