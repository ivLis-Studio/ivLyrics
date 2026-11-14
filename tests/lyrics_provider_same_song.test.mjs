import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Regression: searches by title and artist also return the artist's other
// songs. OpenLyrics accepted "The Color Violet" for "Lady Of Namek" (same artist
// and album, no title in common) and LRCLIB accepted any artist match, so a
// song missing from a catalog showed the lyrics of another song by its artist.

const track = {
    uri: 'spotify:track:6ieWL5CLN9WdC875guWtMe', title: 'Lady Of Namek', artist: 'Tory Lanez',
    album: 'Alone At Prom', duration: 193993
};

const openLyricsSource = readFileSync(new URL('../Addon_Lyrics_OpenLyrics.js', import.meta.url), 'utf8');
const lrclibSource = readFileSync(new URL('../Addon_Lyrics_Lrclib.js', import.meta.url), 'utf8');

const functionSource = (source, name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing function ${name}`);
    let depth = 0;
    for (let index = source.indexOf('{', start); index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unbalanced function ${name}`);
};

const openLyrics = new Function(`${[
    'normalizeDurationMilliseconds', 'normalizeComparable', 'normalizeTitleCore', 'tokenOverlap', 'scoreText',
    'scoreCandidate', 'getLatinShare', 'tokenSimilarity', 'titleContains', 'hasSameSongTitle', 'selectBestCandidate'
].map(name => functionSource(openLyricsSource, name)).join('\n')}
return { selectBestCandidate };`)();

const candidate = (id, title, artist, album, durationSeconds) => ({ id, title, artist, album, durationSeconds });

test('OpenLyrics never takes another song by the same artist for a missing one', () => {
    // What Apple Music's catalog search returns for "Lady Of Namek Tory Lanez".
    const results = [
        candidate(1, 'Lady of Namek (Instrumental)', 'Smooth Jazz All Stars',
            'Smooth Jazz All Stars Cover Tory Lanez (Instrumental)', 192.264),
        candidate(1599010268, 'The Color Violet', 'Tory Lanez', 'Alone At Prom', 226.467),
    ];
    assert.equal(openLyrics.selectBestCandidate(results, track), null);
    // Even a sibling track of the same length is not the song.
    assert.equal(openLyrics.selectBestCandidate([candidate(2, 'Hurts Me', 'Tory Lanez', 'Alone At Prom', 194)], track), null);
    assert.equal(openLyrics.selectBestCandidate([candidate(3, 'One Day', 'Drake', 'Views', 174)],
        { title: 'One Dance', artist: 'Drake', album: 'Views', duration: 173987 }), null, 'one shared word is not enough');
    // A title that merely starts like another is another song, and a one-word
    // title is not found inside a longer one ("i" in "Pursuit").
    const rejects = (title, wanted, artist = 'Tory Lanez') => openLyrics.selectBestCandidate(
        [candidate(6, title, artist, 'Album', 200)], { title: wanted, artist, album: 'Album', duration: 200000 }) === null;
    assert.ok(rejects('Love Me Like You Do', 'Love Me Harder'));
    assert.ok(rejects('I', 'Pursuit Of Happiness'));
    assert.ok(rejects('U', 'Lose Yourself'));
});

test('OpenLyrics still matches the same song under other spellings and versions', () => {
    const pick = (title, info = track) => openLyrics.selectBestCandidate(
        [candidate(4, title, 'Tory Lanez', 'Alone At Prom', 194)], info)?.candidate.title ?? null;
    assert.equal(pick('Lady of Namek'), 'Lady of Namek');
    assert.equal(pick('LADY OF NAMEK (feat. Someone)'), 'LADY OF NAMEK (feat. Someone)');
    assert.equal(pick('Lady Of Namek - Remastered 2024'), 'Lady Of Namek - Remastered 2024');
    // Punctuation spellings, and a version suffix that survives the title core.
    const accepts = (title, wanted) => openLyrics.selectBestCandidate(
        [candidate(7, title, 'Tory Lanez', 'Alone At Prom', 200)], { title: wanted, artist: 'Tory Lanez', album: 'Alone At Prom', duration: 200000 }) !== null;
    assert.ok(accepts('FEEL', 'F.E.E.L.'));
    assert.ok(accepts('Dont Stop The Music', "Don't Stop The Music"));
    assert.ok(accepts('Shape of You - Acoustic', 'Shape of You'));
    assert.ok(accepts('Lady Of Namek Pt. 2 Deluxe', 'Lady Of Namek'));
    // Titles in different scripts cannot be compared, so the length decides.
    const korean = { title: '좋은 날', artist: 'IU', album: 'Real', duration: 233000 };
    const romanized = (durationSeconds) => openLyrics.selectBestCandidate(
        [candidate(5, 'Good Day', 'IU', 'Real', durationSeconds)], korean)?.candidate.title ?? null;
    assert.equal(romanized(233.4), 'Good Day');
    assert.equal(romanized(250), null);
});

test('OpenLyrics keeps Latin accent variants without conflating non-Latin letters', () => {
    const select = (title, wanted, artist = 'Fixture Artist', album = 'Fixture Album') =>
        openLyrics.selectBestCandidate([
            candidate(8, title, artist, album, 200)
        ], { title: wanted, artist: 'Fixture Artist', album: 'Fixture Album', duration: 200000 });

    for (const [wanted, title] of [
        ['Señorita', 'Senorita'], ['Senorita', 'Señorita'],
        ['Déjà Vu', 'Deja Vu'], ['DEJA VU', 'De\u0301ja\u0300 Vu'],
    ]) {
        assert.equal(select(title, wanted)?.candidate.title, title, `${wanted} / ${title}`);
    }
    assert.ok(select('か\u3099く', 'がく'), 'canonical Japanese spellings still match');
    assert.equal(select('かく', 'がく'), null, 'Japanese voicing marks distinguish different titles');
    assert.equal(select('はは', 'ぱぱ'), null, 'Latin accent folding must not remove kana voicing');
    assert.equal(select('Senorita', 'Señorita', 'Unrelated Performer', 'Unrelated Record'), null,
        'accent variants do not bypass artist/album cover safeguards');
});

// Run the production LRCLIB addon with only storage and network synthetic.
async function lrclibLyrics(searchResults) {
    const requests = [];
    const fetch = async (url) => {
        requests.push(String(url));
        const path = new URL(String(url).replace('https://cors-proxy.spicetify.app/', '')).pathname;
        return path.endsWith('/search') ? Response.json(searchResults) : new Response('Not found', { status: 404 });
    };
    let addon = null;
    const window = {
        fetch,
        LyricsAddonManager: { register: registered => { addon = registered; } },
        LyricsService: { extractTrackId: () => 'fixture', getCachedLyrics: async () => null, cacheLyrics: () => { } },
        SyncDataService: { getSyncData: async () => null }
    };
    const stored = new Map();
    const context = vm.createContext({
        window, fetch, URL, URLSearchParams, Headers, AbortController, Response, setTimeout, clearTimeout,
        performance: { now: () => Date.now() },
        console: { log() { }, info() { }, warn() { }, error() { } },
        Spicetify: {
            Config: { version: 'synthetic-test' },
            LocalStorage: { get: key => stored.get(key) ?? null, set: (key, value) => stored.set(key, value) }
        }
    });
    vm.runInContext(lrclibSource, context, { filename: 'Addon_Lyrics_Lrclib.js' });
    assert.equal(addon?.id, 'lrclib');
    const result = await addon.getLyrics(track);
    return { result, requests };
}

const lrclibRecord = (id, trackName, plainLyrics, duration = 194) => ({
    id, trackName, artistName: 'Tory Lanez', albumName: 'Alone At Prom', duration, instrumental: false,
    syncedLyrics: plainLyrics.split('\n').map((line, index) => `[00:0${index + 1}.00]${line}`).join('\n'),
    plainLyrics
});

const lyricTexts = result => Array.from(result?.synced || result?.unsynced || [], line => line.text);

test('LRCLIB rejects an artist match whose title is another song', async () => {
    // A sibling track within LRCLIB's 15 s length tolerance used to pass on
    // the artist alone.
    const { result, requests } = await lrclibLyrics([lrclibRecord(1, 'Hurts Me', 'Another song\nby the same artist', 196)]);
    assert.ok(requests.some(url => url.includes('/search')), 'the search ran');
    assert.deepEqual(lyricTexts(result), []);
    assert.ok(result?.error, 'no lyrics rather than the wrong song');
});

test('LRCLIB keeps the same song spelled differently', async () => {
    const { result } = await lrclibLyrics([
        lrclibRecord(2, 'The Color Violet', 'Another song\nby the same artist', 194),
        lrclibRecord(3, 'Lady of Namek', 'First line of this song\nSecond line of this song'),
    ]);
    assert.deepEqual(lyricTexts(result), ['First line of this song', 'Second line of this song']);
});
