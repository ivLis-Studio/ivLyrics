import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const uri = 'spotify:track:offset-fixture';
const section = (text, startMarker, endMarker) => {
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
    return text.slice(start, end);
};
const method = section(
    source,
    '        async getSyncOffset(uri) {',
    '\n        // 현재 재생 중인 곡과 다른(이전) 곡의 가사 전송인지 확인'
).trim().replace(/,\s*$/, '');
const storageReader = section(
    source,
    '    function getStorageItem(key) {',
    '\n    function shouldHideOverlayForIvLyricsFullscreen()'
);
const trackOverrideReader = section(
    source,
    '    const trackOverrideDatabases = new Map();',
    '    const sendLyricsToConsumers = ({'
);

const createHarness = ({
    persisted = {},
    legacy = {},
    database = {},
    page = null,
    activePageUri,
    pageMounted = true,
    globalFromUtils,
    trackFromPage,
} = {}) => {
    const persistedValues = new Map(Object.entries(persisted));
    const legacyValues = new Map(Object.entries(legacy));
    const databaseValues = new Map(Object.entries(database));
    let databaseOpens = 0;
    let databaseReads = 0;

    const get = (values, key) => values.has(key) ? values.get(key) : null;
    const localStorage = {
        getItem: (key) => get(persistedValues, key),
        setItem: (key, value) => persistedValues.set(key, String(value)),
        removeItem: (key) => persistedValues.delete(key),
    };
    const indexedDB = {
        open(name, version) {
            assert.equal(name, 'ivLyrics-db');
            assert.equal(version, 1);
            databaseOpens += 1;
            const request = {};
            queueMicrotask(() => {
                const db = {
                    objectStoreNames: { contains: (storeName) => storeName === 'track-sync-offsets' },
                    createObjectStore() {},
                    transaction(storeNames, mode) {
                        assert.equal(storeNames.length, 1);
                        assert.equal(storeNames[0], 'track-sync-offsets');
                        assert.equal(mode, 'readonly');
                        return {
                            objectStore(storeName) {
                                assert.equal(storeName, 'track-sync-offsets');
                                return {
                                    get(key) {
                                        databaseReads += 1;
                                        const readRequest = {};
                                        queueMicrotask(() => {
                                            readRequest.result = databaseValues.get(key);
                                            readRequest.onsuccess?.();
                                        });
                                        return readRequest;
                                    },
                                };
                            },
                        };
                    },
                };
                request.result = db;
                request.onupgradeneeded?.({ target: request });
                request.onsuccess?.();
            });
            return request;
        },
    };

    const window = {};
    if (page) {
        window.CONFIG = { visual: { ...page } };
    }
    if (page && activePageUri !== null) {
        window.lyricContainer = {
            currentTrackUri: activePageUri ?? uri,
            _isComponentMounted: pageMounted,
        };
    }
    if (globalFromUtils !== undefined) {
        window.Utils = { getGlobalSyncOffset: () => globalFromUtils };
    }
    if (trackFromPage !== undefined) {
        window.TrackSyncDB = { getOffset: async () => trackFromPage };
    }
    if (Object.keys(persisted).length > 0) {
        window.ivLyricsStoragePersistence = {
            getItem: (key) => get(persistedValues, key),
        };
    }

    const context = vm.createContext({
        window,
        localStorage,
        indexedDB,
        Spicetify: { LocalStorage: { get: (key) => get(legacyValues, key) } },
        console: { warn() {}, error() {} },
    });
    vm.runInContext([
        trackOverrideReader,
        storageReader,
        `globalThis.sender = { _offsetCache: {}, ${method} };`,
    ].join('\n'), context);

    return {
        sender: context.sender,
        persistedValues,
        get databaseOpens() { return databaseOpens; },
        get databaseReads() { return databaseReads; },
    };
};

test('cold overlay startup matches a loaded ivLyrics page for persisted global, delay and DB offsets', async () => {
    const persisted = {
        'ivLyrics:visual:global-sync-offset': '250',
        [`lyrics-delay:${uri}`]: '120',
    };
    const cold = createHarness({ persisted, database: { [uri]: -75 } });
    const loaded = createHarness({
        persisted,
        database: { [uri]: 999 },
        page: { delay: 120, 'global-sync-offset': 250 },
        globalFromUtils: 250,
        trackFromPage: -75,
    });

    assert.equal(await cold.sender.getSyncOffset(uri), -295);
    assert.equal(await loaded.sender.getSyncOffset(uri), -295);
    assert.equal(cold.sender._offsetCache[uri], -75);
    assert.equal(loaded.sender._offsetCache[uri], -75);
    assert.equal(cold.databaseReads, 1);
    assert.equal(loaded.databaseReads, 0);
});

test('page APIs override stale persisted values while the legacy local delay remains a fallback', async () => {
    const page = createHarness({
        persisted: {
            'ivLyrics:visual:global-sync-offset': '900',
            [`lyrics-delay:${uri}`]: '900',
        },
        legacy: { [`lyrics-delay:${uri}`]: '33' },
        database: { [uri]: 999 },
        page: { delay: 8, 'global-sync-offset': 700 },
        globalFromUtils: 5,
        trackFromPage: 3,
    });
    assert.equal(await page.sender.getSyncOffset(uri), -16);

    const legacy = createHarness({ legacy: { [`lyrics-delay:${uri}`]: '33' } });
    assert.equal(await legacy.sender.getSyncOffset(uri), -33);
});

test('zero and invalid persisted values normalize to zero and zero rows are cached', async () => {
    const zero = createHarness({
        persisted: {
            'ivLyrics:visual:global-sync-offset': '0',
            [`lyrics-delay:${uri}`]: '0',
        },
        database: { [uri]: 0 },
    });
    assert.equal(await zero.sender.getSyncOffset(uri), 0);
    assert.equal(Object.is(await zero.sender.getSyncOffset(uri), 0), true);
    assert.equal(zero.sender._offsetCache[uri], 0);
    assert.equal(zero.databaseReads, 1);

    const invalid = createHarness({
        persisted: {
            'ivLyrics:visual:global-sync-offset': 'not-a-number',
            [`lyrics-delay:${uri}`]: 'NaN',
        },
        database: { [uri]: 'invalid' },
    });
    assert.equal(await invalid.sender.getSyncOffset(uri), 0);
    assert.equal(invalid.sender._offsetCache[uri], 0);
});

test('global and delay storage changes are observed on the next offset calculation', async () => {
    const harness = createHarness({
        persisted: {
            'ivLyrics:visual:global-sync-offset': '10',
            [`lyrics-delay:${uri}`]: '20',
        },
        database: { [uri]: 30 },
    });
    assert.equal(await harness.sender.getSyncOffset(uri), -60);
    harness.persistedValues.set('ivLyrics:visual:global-sync-offset', '-40');
    harness.persistedValues.set(`lyrics-delay:${uri}`, '-50');
    assert.equal(await harness.sender.getSyncOffset(uri), 60);
    assert.equal(harness.databaseReads, 1, 'only the per-track DB value is cached');
});

test('a live zero delay applies only to the mounted page track', async () => {
    const liveZero = createHarness({
        persisted: {
            [`lyrics-delay:${uri}`]: '47',
        },
        page: { delay: 0 },
        database: { [uri]: 0 },
    });
    assert.equal(await liveZero.sender.getSyncOffset(uri), 0);

    const stalePage = createHarness({
        persisted: {
            [`lyrics-delay:${uri}`]: '12',
        },
        page: { delay: 88 },
        activePageUri: 'spotify:track:previous',
        database: { [uri]: 0 },
    });
    assert.equal(await stalePage.sender.getSyncOffset(uri), -12);

    const unmountedPage = createHarness({
        persisted: {
            [`lyrics-delay:${uri}`]: '12',
        },
        page: { delay: 88 },
        activePageUri: null,
        database: { [uri]: 0 },
    });
    assert.equal(await unmountedPage.sender.getSyncOffset(uri), -12);
});
