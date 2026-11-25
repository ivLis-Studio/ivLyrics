import { setUpSyncCreatorLrclibActions } from "./fixtures/sync-creator-lrclib.mjs";
import {
    buildLrclibSyncSource, buildLrclibIdCandidate, getLrclibRecordVariantForSource,
} from '#ivlyrics/features/sync/syncCreatorLrclibLyrics.mjs';
import { readSyncCreatorFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readSyncCreatorFixture();
const slice = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing production section: ${startMarker}`);
    return source.slice(start, end);
};
const callbacks = [
    slice('\tconst { lyricsTextLrclibShape, attachSelectedLrclibSource } =', '\t// Capture the baseline before edits.'),
].join('\n');
const plain = value => JSON.parse(JSON.stringify(value));

// One LRCLIB row whose timed and plain texts differ in line lengths, the shape
// of the reported entry (synthetic text).
const RECORD = Object.freeze({
    id: 424242, trackName: 'Fixture Song', artistName: 'Fixture Artist', albumName: 'Fixture Album', duration: 200,
    syncedLyrics: '[00:01.00]Morning light\n[00:05.00]Hold me close\n[00:09.00]Never let go',
    plainLyrics: 'Morning light\nHold me close, (oh)\nNever, never let go',
});
const SYNCED_TEXT = 'Morning light\nHold me close\nNever let go';
const PLAIN_TEXT = 'Morning light\nHold me close, (oh)\nNever, never let go';

// Runs the shipping LRCLIB load, import and attach callbacks. LRCLIB, the
// published sync lookup and React state are replaced; nothing leaves the process.
// Memoized values are computed once, from the lyrics and candidates given here.
function harness({ fetchRecord = RECORD, fetchStatus = 200, lyricsText = '', lrclibCandidates = [] } = {}) {
    const calls = { fetch: [], loaded: [], toasts: [], sourceChanges: 0 };
    const context = vm.createContext({
        console: { error() {}, warn() {}, log() {} }, structuredClone, URLSearchParams,
        window: {
            IvLyricsLrclibTransport: { fetch: async url => {
                calls.fetch.push(url);
                return fetchStatus === 200
                    ? Response.json(structuredClone(fetchRecord))
                    : new Response('Unavailable', { status: fetchStatus });
            } },
            SyncDataService: { getSyncData: async () => null },
        },
        localStorage: { getItem: () => null }, navigator: {},
        Spicetify: { Player: { data: null } },
        useCallback: fn => fn, useMemo: fn => fn(),
        I18n: { t: (key, params) => params ? `${key} ${JSON.stringify(params)}` : key },
        Toast: { success: value => calls.toasts.push(['success', value]), error: value => calls.toasts.push(['error', value]) },
        trackId: 'fixture', trackIsrc: '', trackName: 'Fixture Song', artistName: 'Fixture Artist', albumName: '', trackInfo: {},
        lrclibIdInput: String(RECORD.id), lrclibIdInputEditedRef: { current: false },
        selectedLrclibSourceRef: { current: null }, providerRef: { current: 'lrclib' },
        lyrics: null, lyricsText, lyricsFullTextChars: [], lrclibCandidates, selectedLrclibCandidateKey: '',
        syncCreatorDraftStore: null,
        beginSyncCreatorSourceChange: () => ++calls.sourceChanges,
        isCurrentSyncCreatorSourceChange: () => true,
        resetSyncCreatorLyricsLoadingState() {}, clearLrclibCandidateState() {},
        applyLoadedLyricsResult: async result => { calls.loaded.push(plain(result)); return true; },
        prepareImportedLyricsSource: async (result, text) => ({
            publishedBaseline: null,
            activate() {
                context.beginSyncCreatorSourceChange();
                calls.loaded.push(plain(result));
                context.lyricsText = text;
                context.selectedLrclibSourceRef.current = result.lrclibSource;
            },
        }),
        sanitizeSyncCreatorSyncData: data => structuredClone(data),
    });
    for (const [, setter] of callbacks.matchAll(/\b(set[A-Z]\w*)\b/g)) {
        const property = setter.slice(3, 4).toLowerCase() + setter.slice(4);
        context[setter] ??= value => { context[property] = value; };
    }
    context.react = { useMemo: context.useMemo, useCallback: context.useCallback };
    context.setSelectedLrclibSourceValue = value => { context.selectedLrclibSourceRef.current = value || null; };
    context.setProviderValue = value => { context.providerRef.current = value || ''; };
    vm.runInContext(source.slice(0, source.indexOf('const SyncDataCreator =')), context);
    vm.runInContext(`globalThis.api = {
        attachSelectedLrclibSource(data) {
            ${callbacks}
            return attachSelectedLrclibSource(data);
        }
    };`, context);
    Object.assign(context.api, setUpSyncCreatorLrclibActions(context, (name, value) => {
        const property = name.slice(3, 4).toLowerCase() + name.slice(4);
        context[property] = value;
    }), {
        buildLrclibSyncSource, getLrclibRecordVariantForSource,
        buildLrclibIdCandidate: (candidate, id) => buildLrclibIdCandidate(candidate, id, '', context),
    });
    const sourceFor = variant => plain(context.api.buildLrclibSyncSource({ ...RECORD, preferredLyricsSource: variant }));
    const publish = syncSource => {
        context.window.SyncDataService.getSyncData = async () => ({ syncData: { version: 5, lines: [], source: syncSource } });
    };
    return { context, calls, api: context.api, sourceFor, publish };
}

const loadedText = result => (result.synced || result.unsynced).map(line => line.text).join('\n');

test('a saved source names the LRCLIB version its timings were made on', () => {
    const h = harness();
    const plainSource = h.sourceFor('plain');
    const syncedSource = h.sourceFor('synced');
    assert.notEqual(plainSource.lyricsFingerprint, syncedSource.lyricsFingerprint);
    assert.notDeepEqual(plainSource.lineCharCounts, syncedSource.lineCharCounts);
    assert.equal(h.api.getLrclibRecordVariantForSource(RECORD, plainSource), 'plain');
    assert.equal(h.api.getLrclibRecordVariantForSource(RECORD, syncedSource), 'synced');
    // The reported published source carried the plain text under a "synced" label.
    assert.equal(h.api.getLrclibRecordVariantForSource(RECORD, { ...plainSource, preferredLyricsSource: 'synced' }), 'plain');
    assert.equal(h.api.getLrclibRecordVariantForSource({ ...RECORD, id: 7 }, plainSource), '', 'another entry never matches');
    assert.equal(h.api.getLrclibRecordVariantForSource({ ...RECORD, plainLyrics: 'Morning light\nedited' }, plainSource), '');
    assert.equal(h.api.getLrclibRecordVariantForSource(RECORD, { ...plainSource, lineCount: 0 }), '', 'incomplete sources never match');
});

test('Load by ID shows the version the published sync was made on, and the timed text otherwise', async () => {
    const reference = harness();
    const plainSource = reference.sourceFor('plain');
    for (const [label, published, expected] of [
        ['nothing published', null, 'synced'],
        ['published on the plain text', plainSource, 'plain'],
        ['published plain text under a synced label', { ...plainSource, preferredLyricsSource: 'synced' }, 'plain'],
        ['published on the timed text', reference.sourceFor('synced'), 'synced'],
    ]) {
        const h = harness();
        if (published) h.publish(published);
        await h.api.loadLrclibById();
        assert.equal(h.calls.loaded.length, 1, label);
        assert.equal(loadedText(h.calls.loaded[0]), expected === 'plain' ? PLAIN_TEXT : SYNCED_TEXT, label);
        assert.deepEqual(plain(h.context.selectedLrclibSourceRef.current), reference.sourceFor(expected) && {
            ...reference.sourceFor(expected), searchSource: 'id'
        }, label);
        assert.deepEqual(h.calls.toasts, [['success', 'syncCreator.lrclibIdLoadSuccess']], label);
    }
});

test('Load by ID keeps the version of the source the editor already uses', async () => {
    const h = harness();
    h.context.selectedLrclibSourceRef.current = h.sourceFor('plain');
    await h.api.loadLrclibById();
    assert.equal(loadedText(h.calls.loaded[0]), PLAIN_TEXT);
    assert.equal(h.context.selectedLrclibSourceRef.current.preferredLyricsSource, 'plain');
});

test('an imported file loads the LRCLIB version it was made on', async () => {
    const h = harness({ lyricsText: SYNCED_TEXT });
    const fileSource = { ...h.sourceFor('plain'), preferredLyricsSource: 'synced' };
    const loaded = await h.api.prepareLrclibSourceForImport(fileSource, () => true);
    assert.deepEqual(h.calls.fetch, ['https://lrclib.net/api/get/424242']);
    assert.equal(h.calls.sourceChanges, 0);
    assert.equal(h.calls.loaded.length, 0);
    assert.equal(h.context.lyricsText, SYNCED_TEXT);
    loaded.activate();
    assert.equal(h.calls.sourceChanges, 1);
    assert.equal(h.calls.loaded.length, 1);
    assert.equal(h.context.lyricsText, PLAIN_TEXT);
    assert.equal(h.context.lrclibIdInput, '424242');
    assert.deepEqual(plain(loaded.lyricsChars), Array.from(PLAIN_TEXT.replaceAll('\n', '')));
    assert.equal(loaded.lyricsFingerprint, fileSource.lyricsFingerprint);
    assert.equal(loaded.lrclibSource.preferredLyricsSource, 'plain');
    assert.equal(loaded.lrclibSource.lyricsFingerprint, fileSource.lyricsFingerprint);
    assert.deepEqual(plain(h.context.selectedLrclibSourceRef.current), plain(loaded.lrclibSource));
});

test('an import whose lyrics cannot be found fails clearly without replacing the lyrics', async () => {
    const edited = harness({ fetchRecord: { ...RECORD, plainLyrics: 'Morning light\nchanged since the export' } });
    await assert.rejects(edited.api.prepareLrclibSourceForImport(edited.sourceFor('plain'), () => true),
        { message: 'syncCreator.importLyricsMismatch {"id":"424242"}' });
    const offline = harness({ fetchStatus: 503 });
    await assert.rejects(offline.api.prepareLrclibSourceForImport(offline.sourceFor('plain'), () => true),
        { message: 'syncCreator.lrclibIdLoadError (424242): LRCLIB 503' });
    for (const h of [edited, offline]) {
        assert.equal(h.calls.sourceChanges, 0);
        assert.equal(h.calls.loaded.length, 0);
    }
});

test('activating imported lyrics keeps the LRCLIB ID typed during preparation', async () => {
    const h = harness({ lyricsText: SYNCED_TEXT });
    const pending = h.api.prepareLrclibSourceForImport(h.sourceFor('plain'), () => true);
    h.context.lrclibIdInput = '858585';
    h.context.lrclibIdInputEditedRef.current = true;
    h.context.lrclibIdInputRevisionRef.current++;
    const prepared = await pending;
    prepared.activate();
    assert.equal(h.context.lrclibIdInput, '858585');
    assert.equal(h.context.lrclibIdInputEditedRef.current, true);
    assert.equal(loadedText(h.calls.loaded[0]), PLAIN_TEXT);
    assert.equal(h.context.selectedLrclibSourceRef.current.lrclibId, '424242');
});

test('exports and submissions attach the source of the lyrics the timings are on', () => {
    const reference = harness();
    const plainSource = reference.sourceFor('plain');
    const syncedSource = reference.sourceFor('synced');
    const attach = (h, { selected = null, persisted = null, loaded = null } = {}) => {
        h.context.selectedLrclibSourceRef.current = selected;
        h.context.lyrics = loaded ? { lrclibSource: loaded } : null;
        const data = { version: 5, lines: [], ...(persisted ? { source: persisted } : {}) };
        return plain(h.api.attachSelectedLrclibSource(data).source);
    };

    const withRow = harness({ lyricsText: PLAIN_TEXT, lrclibCandidates: [plain(reference.api.buildLrclibIdCandidate(RECORD, '424242'))] });
    const rebuilt = attach(withRow, { selected: syncedSource, persisted: syncedSource });
    assert.equal(rebuilt.preferredLyricsSource, 'plain', 'a source naming the other text is rebuilt');
    assert.equal(rebuilt.lyricsFingerprint, plainSource.lyricsFingerprint);
    assert.deepEqual(rebuilt.lineCharCounts, plainSource.lineCharCounts);
    assert.deepEqual(attach(withRow, { selected: { ...plainSource, preferredLyricsSource: 'synced' } }), plainSource,
        'the reported mislabeled source keeps its content and gets the right label');
    assert.deepEqual(attach(withRow, { selected: plainSource }), plainSource);

    const withoutRow = harness({ lyricsText: PLAIN_TEXT });
    assert.deepEqual(attach(withoutRow, { selected: syncedSource, loaded: plainSource }), plainSource,
        'without the LRCLIB row, a known source that describes the text still wins');
    assert.deepEqual(attach(withoutRow, { selected: syncedSource }), syncedSource,
        'lyrics that no known source describes keep the earlier fallback');
});

