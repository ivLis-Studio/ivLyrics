import { getTrackSyncOffsetStore } from "#ivlyrics/core/trackSyncOffsetRuntime.mjs";
import { getMountedLyricsPage } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { getRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createOverlayOffsetResolver } from '../src/features/overlay/overlayOffsets.mjs';
import { createLyricsServicePreferences } from '../src/lyrics/lyricsServicePreferences.mjs';

const source = readFileSync(new URL('../src/lyrics/LyricsService.js', import.meta.url), 'utf8');
const uri = 'spotify:track:offset-fixture';
const section = (text, startMarker, endMarker) => {
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
    return text.slice(start, end);
};
const offsetResolver = section(
    source,
    '    const getOverlaySyncOffset =',
    '    const { OverlaySender, lyricsHelperSender }',
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

    const window = { indexedDB, localStorage };
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

    const { getStorageItem } = createLyricsServicePreferences({
        getSettingsStorage: () => getRuntimeService("StorageManager", window),
        getStoragePersistence: () => getRuntimeService("ivLyricsStoragePersistence", window),
        readSpotifySetting: (key) => get(legacyValues, key),
        readLocalSetting: (key) => localStorage.getItem(key),
    });
    const context = vm.createContext({
        getMountedLyricsPage, getRuntimeService, getTrackSyncOffsetStore,
        getStorageItem,
        window,
        createOverlayOffsetResolver,
        localStorage,
        Spicetify: { LocalStorage: { get: (key) => get(legacyValues, key) } },
        console: { warn() {}, error() {} },
    });
    vm.runInContext([
        offsetResolver,
        'globalThis.sender = { _offsetCache: {}, getSyncOffset: getOverlaySyncOffset };',
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

test('concurrent sends share a disk read and follow an offset edited while that read was pending', async () => {
    const disk = Promise.withResolvers();
    let reads = 0;
    const visual = { delay: 25, 'global-sync-offset': 10 };
    const sender = {
        _offsetCache: {},
        getSyncOffset: createOverlayOffsetResolver({
            readSettingSources: [], getVisualSettings: () => visual,
            getMountedLyricsPage: () => ({ currentTrackUri: uri }),
            getPageGlobalOffset: () => undefined,
            readTrackOffset: () => { reads++; return disk.promise; },
        }),
    };
    const retired = sender._offsetCache;
    const oldSends = [sender.getSyncOffset(uri), sender.getSyncOffset(uri)];
    await Promise.resolve();
    assert.equal(reads, 1);

    sender._offsetCache = { [uri]: 60 };
    visual.delay = 5;
    visual['global-sync-offset'] = 15;
    assert.equal(await sender.getSyncOffset(uri), -80);
    disk.resolve(180);
    assert.deepEqual(await Promise.all(oldSends), [-80, -80]);
    assert.deepEqual(retired, {});
    assert.equal(sender._offsetCache[uri], 60);
    assert.equal(reads, 1);
});

test('an invalidated track offset can read the replacement without reusing a retired promise', async () => {
    const old = Promise.withResolvers();
    const reads = [old.promise, Promise.resolve(5)];
    const send = createOverlayOffsetResolver({
        readSettingSources: [], getVisualSettings: () => ({}),
        getMountedLyricsPage: () => null, getPageGlobalOffset: () => undefined,
        readTrackOffset: () => reads.shift(),
    });
    const sender = { _offsetCache: {}, getSyncOffset: send };
    const pending = sender.getSyncOffset(uri);
    await Promise.resolve();
    sender._offsetCache = {};
    assert.equal(await sender.getSyncOffset(uri), -5);
    old.resolve(200);
    assert.equal(await pending, -5);
    assert.equal(sender._offsetCache[uri], 5);
});
