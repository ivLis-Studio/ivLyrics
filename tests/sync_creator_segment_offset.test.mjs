import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const draftStore = createRequire(import.meta.url)('../SyncCreatorDraftStore.js');
const plain = value => JSON.parse(JSON.stringify(value?.version === 6 ? createRequire(import.meta.url)('../SyncDataCodec.js').decode(value) : value));
const slice = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing production section: ${startMarker}`);
    return source.slice(start, end);
};
const callbacks = [
    slice('\tconst stripLrclibTimestamp =', '\tconst clearLrclibCandidateState ='),
    slice('\tconst getSyncCreatorLineTimes =', '\tconst SYNC_CREATOR_SHORTCUTS ='),
    slice('\tconst countRangeChars =', '\t// 상태 관리'),
    slice('\tconst getLineEndAtIndex =', '\tconst currentMergedLineIndexes ='),
    slice('\tconst getAutoMergeSplitPointsForLine =', '\tconst currentAutoMergeSplitPoints ='),
    slice('\tconst getParallelTemplateForLine =', '\tconst currentParallelTemplate ='),
    slice('\tconst normalizeCommittedLineChars =', '\tconst handleDragEnd ='),
    slice('\tconst resetCurrentLineManualSplit =', '\tconst resolveParentheticalLayoutDecision ='),
    slice('\tconst adjustGlobalOffset =', '\t// Suspend autosave'),
    slice('\tconst adjustCurrentLineOffset =', '\tconst resetFromStart ='),
    slice('\tconst materializeSyncCreatorParallelDrafts =', '\tconst handleRevertToPublished ='),
    slice('\tconst buildSyncCreatorSessionRecord =', '\tconst syncSessionUiFromRecord ='),
    slice('\tconst buildScoreSnapshot =', '\tconst scoreCurrentSnapshot ='),
    slice('\tconst applySyncCreatorSessionRecord =', '\tconst saveSessionCheckpoint ='),
    slice('\tconst handleSubmit =', '\t// 싱크 데이터 내보내기'),
    slice('\tconst exportSyncData =', '\t// 싱크 데이터 불러오기'),
    slice('\tconst importSyncData =', '\t// 가사 전체 복사'),
].join('\n');

// Run production callbacks with only host services replaced. No Spotify process,
// account, filesystem save, network request or playback control is used.
function createEditor({ rows = ['PRE', 'ABCD', 'TAIL'], data = null } = {}) {
    let start = 0;
    const lineCharOffsets = rows.map(row => {
        const offset = start;
        start += Array.from(row).length;
        return offset;
    });
    const fixture = data || { version: 5, lines: rows.map((row, index) => ({
        start: lineCharOffsets[index], end: lineCharOffsets[index] + Array.from(row).length - 1,
        chars: Array.from(row, (_, char) => index * 10 + char / 4 + 1),
        granularity: 'character', speaker: 'NORMAL', kind: 'vocal',
    })) };
    let savedFile;
    let submittedFile;
    let input;
    let revision = 100;
    const context = vm.createContext({
        console, structuredClone, Blob, window: { SyncDataCodec: createRequire(import.meta.url)('../SyncDataCodec.js') }, clearTimeout() {}, setTimeout() {},
        useCallback: fn => fn, useMemo: fn => fn(),
        syncCreatorDraftStore: draftStore,
        syncData: structuredClone(fixture), lyricsLines: rows, lyricsText: rows.join('\n'),
        lineCharOffsets, lineIndexByStart: new Map(lineCharOffsets.map((offset, index) => [offset, index])),
        currentLineIndex: 1, activeParallelPart: null, activeParallelPartId: 'full',
        currentLineStart: lineCharOffsets[1], currentFullLineChars: Array.from(rows[1]),
        currentMergedLineIndexes: [1], currentLineMergedWithNext: false,
        currentAutoMergeSplitPoints: [], currentAutoMergeSplitPointSet: new Set(),
        currentParallelTemplate: null, currentExistingLineData: fixture.lines[1],
        currentParallelData: null, currentParallelParts: [], currentLineChars: Array.from(rows[1]),
        currentLineCharRefs: [], currentLineMeta: { speaker: 'NORMAL', kind: 'vocal' },
        currentLineStyleRanges: [], activeParallelTargetId: 'full', hasCurrentParallelParts: false,
        currentNextMergeLineIndex: 2, canMergeCurrentLineWithNext: true, isCurrentSyncTargetMetaComplete: true,
        isLineCoveredByMergedPrevious: (index, linesByStart) => context.api.findMergedOwnerLineIndex(index, linesByStart) >= 0,
        showMissingMetaToast() { throw new Error('fixture unexpectedly required vocal metadata'); },
        currentLineDirection: 'ltr', currentSpeakerTextColor: '#fff', currentSpeakerMutedColor: '#777',
        useCurrentLineTextRun: false, lastPaintedPlaybackIndexRef: { current: -2 },
        charElementsRef: { current: [] }, rtlTextRunRef: { current: null },
        parallelPreviewElementsRef: { current: new Map() },
        manualParallelSplitDrafts: {}, parentheticalLayoutDrafts: {}, mergedLineDrafts: {},
        parallelPartMetaDrafts: {}, lineMetaDrafts: {}, lineStyleDrafts: {}, multiVocalMode: true,
        mode: 'idle', globalOffset: 0, syncGranularity: 'character', lyricsLanguage: 'en',
        trackId: 'fixture', trackUri: 'spotify:track:fixture', trackIsrc: '',
        trackName: 'Fixture', artistName: 'Fixture', albumName: '', trackDurationMs: 120000,
        provider: 'lrclib', addonId: 'lrclib', sessionTrackKey: 'fixture', lyrics: {},
        trackInfo: {}, onClose: null, ensureScoreTracker: () => null,
        clearLyricsCachesAfterSyncSubmit() {}, deleteActiveSyncCreatorDraft() {},
        confirm() { throw new Error('fixture unexpectedly required incomplete submission confirmation'); },
        loadLrclibSourceForImport() { throw new Error('fixture unexpectedly replaced the lyrics for an import'); },
        SyncDataService: { submitSyncData: async (_trackId, _provider, data) => {
            submittedFile = plain(data);
            return true;
        } },
        selectedLrclibCandidateKey: '', selectedLrclibSource: null, activeSessionDraftKey: '',
        claimSessionForLocalEditing() {}, resetCurrentSyncInput() {}, clearRecordingLock() {},
        getActiveRecordingLockRange: () => null, getCurrentSyncTargetSavedChars: () => [],
        setRecordingProgressIndex() {}, syncSessionUiFromRecord() {}, announceHistoryStatus() {},
        setProviderValue(value) { context.provider = value; },
        setSelectedLrclibSourceValue(value) { context.selectedLrclibSource = value; },
        nextSessionClientRevision: () => ++revision,
        captureScoreWork() {},
        Toast: { success() {}, error(message) { throw new Error(message); } },
        I18n: { t: key => key },
        Spicetify: { Player: new Proxy({}, { get() { throw new Error('fixture must not control playback'); } }) },
        Utils: {
            sanitizeFileName: value => value,
            requestSaveFileTarget: async () => ({ canceled: false }),
            saveBlobAs: async blob => { savedFile = await blob.text(); },
        },
        document: { createElement: type => {
            assert.equal(type, 'input');
            input = { click() {} };
            return input;
        } },
    });
    for (const [, name] of callbacks.matchAll(/\b(\w+Ref)\.current/g)) context[name] ??= { current: null };
    Object.assign(context, {
        scorePendingEventsRef: { current: [] }, scorePendingEffectsRef: { current: new Map() },
        sessionAutoRecoveryBlockedRef: { current: false }, sessionAutosaveEnabledRef: { current: true },
        sessionClientRevisionRef: { current: 100 }, lyricsScrollRef: { current: { scrollLeft: 50 } },
        sessionRecoveryRequestRef: { current: 0 }, sessionCheckpointRestoreRequestRef: { current: 0 },
        sessionWriteGenerationRef: { current: 0 }, sessionAppliedDraftKeyRef: { current: '' },
    });
    for (const [, setter] of callbacks.matchAll(/\b(set[A-Z]\w*)\b/g)) {
        if (context[setter]) continue;
        const property = setter.slice(3, 4).toLowerCase() + setter.slice(4);
        context[setter] = update => {
            context[property] = typeof update === 'function' ? update(context[property]) : update;
        };
    }
    context.sessionLyricsFingerprint = draftStore.createLyricsFingerprint(context.lyricsText);
    context.activeSessionDraftKey = draftStore.createDraftKey({
        trackKey: 'fixture', provider: 'lrclib', addonId: 'lrclib',
        lyricsFingerprint: context.sessionLyricsFingerprint,
    });
    vm.runInContext(source.slice(0, source.indexOf('const SyncDataCreator =')), context);
    context.roundSyncTime = vm.runInContext('roundSyncCreatorTime', context);
    context.lyricsFullTextChars = vm.runInContext('getSyncCreatorFlatLyricsCharsFromLines(lyricsLines)', context);
    context.attachSelectedLrclibSource = value => value;
    vm.runInContext(`${callbacks}
        globalThis.api = {
            buildManualParallelTemplate, buildParentheticalParallelTemplate, mergeSyncCreatorParallelTemplate,
            getParallelTemplateForLineData, getMergedLineIndexesForStart, findMergedOwnerLineIndex, getAutoMergeSplitPointsForLine,
            adjustCurrentLineOffset, adjustGlobalOffset, resetCurrentLineManualSplit,
            toggleManualParallelSplitPoint, unmergeCurrentLine, materializeSyncCreatorParallelDrafts,
            mergeCurrentLineWithNext, commitCurrentLineSync,
            sanitizeSyncCreatorSyncData, compactSyncCreatorSyncData, assertValidSyncCreatorSyncData,
            getSyncCreatorRejoinedLineChars, inheritSyncCreatorParallelPartChars,
            getSyncCreatorParallelPreviewChars, buildSyncCreatorSessionRecord, applySyncCreatorSessionRecord,
            exportSyncData, importSyncData, handleSubmit, buildScoreSnapshot, repairScoreSnapshot,
        };`, context);
    const render = (selected = context.activeParallelPartId) => {
        context.currentLineStart = lineCharOffsets[context.currentLineIndex];
        context.currentExistingLineData = context.syncData?.lines.find(line => line.start === context.currentLineStart);
        context.currentMergedLineIndexes = context.api.getMergedLineIndexesForStart(context.currentLineIndex);
        context.currentLineMergedWithNext = context.currentMergedLineIndexes.length > 1;
        context.currentFullLineChars = context.currentMergedLineIndexes.flatMap(index => Array.from(rows[index]));
        context.currentAutoMergeSplitPoints = context.api.getAutoMergeSplitPointsForLine(context.currentLineStart);
        context.currentAutoMergeSplitPointSet = new Set(context.currentAutoMergeSplitPoints);
        context.currentParallelTemplate = context.api.getParallelTemplateForLineData(
            context.currentExistingLineData, context.currentFullLineChars, context.currentLineStart, context.currentLineMergedWithNext
        );
        context.currentParallelData = context.api.mergeSyncCreatorParallelTemplate(context.currentParallelTemplate, context.currentExistingLineData);
        context.activeParallelPart = context.currentParallelData?.parts.find(part => part.id === selected)
            || context.currentParallelData?.parts[0] || null;
        context.activeParallelPartId = context.activeParallelPart?.id || 'full';
        context.currentParallelParts = context.currentParallelData?.parts || [];
        context.hasCurrentParallelParts = context.currentParallelParts.length > 1;
        context.activeParallelTargetId = context.activeParallelPartId;
        context.currentLineChars = context.activeParallelPart
            ? context.activeParallelPart.ranges.flatMap(range => context.lyricsFullTextChars.slice(range.start, range.end + 1))
            : context.currentFullLineChars;
        context.currentLineCharRefs = context.activeParallelPart
            ? context.activeParallelPart.ranges.flatMap(range => Array.from({ length: range.end - range.start + 1 }, (_, index) => ({
                absoluteIndex: range.start + index, localIndex: range.start + index - context.currentLineStart,
                char: context.lyricsFullTextChars[range.start + index],
            })))
            : context.currentFullLineChars.map((char, index) => ({ absoluteIndex: context.currentLineStart + index, localIndex: index, char }));
        context.currentNextMergeLineIndex = context.currentMergedLineIndexes.at(-1) + 1;
        context.canMergeCurrentLineWithNext = context.currentNextMergeLineIndex < rows.length;
        context.syncLinesByStart = new Map(context.syncData?.lines.map(line => [line.start, line]));
        vm.runInContext(`globalThis.preview = (() => {
            ${slice('\tconst getPreviewCharsForLine =', '\tconst getPreviewProgressIndex =')}
            return { getPreviewCharsForLine, getCharSyncTime };
        })();`, context);
        context.getPreviewCharsForLine = context.preview.getPreviewCharsForLine;
        context.charElementsRef.current = context.currentLineChars.map((_, index) => ({
            style: {}, dataset: { ivSyncCreatorSynced: context.preview.getCharSyncTime(context.currentLineIndex, index) === null ? '0' : '1' },
        }));
        context.lastPaintedPlaybackIndexRef.current = -2;
        vm.runInContext(`globalThis.painter = (() => {
            ${slice('\tconst applyParallelPlaybackProgressVisual =', '\tuseEffect(() => {\n\t\tcharElementsRef.current = [];')}
            return { applyPlaybackProgressVisual, applyParallelPlaybackProgressVisual };
        })();`, context);
        return context.currentParallelData;
    };
    render();
    const materialize = () => context.api.materializeSyncCreatorParallelDrafts(context.syncData);
    return {
        context, api: context.api, render, materialize,
        line: () => context.syncData.lines.find(line => line.start === context.currentLineStart),
        times: () => plain(context.preview.getPreviewCharsForLine(context.currentLineIndex)),
        shift: delta => { context.api.adjustCurrentLineOffset(delta); render(); },
        split: point => { context.api.toggleManualParallelSplitPoint(point); render(); },
        record: () => plain(context.api.buildSyncCreatorSessionRecord()),
        recover: record => { context.api.applySyncCreatorSessionRecord(record, { announce: false }); render(); },
        export: async () => { await context.api.exportSyncData(); const wire = JSON.parse(savedFile); assert.equal(wire.version, 6); return context.window.SyncDataCodec.decode(wire); },
        submit: async () => {
            context.trackIsrc = 'USFIX1234567';
            submittedFile = null;
            await context.api.handleSubmit();
            assert.ok(submittedFile, 'the production submit callback must reach the intercepted transport');
            return context.window.SyncDataCodec.decode(submittedFile);
        },
        import: async file => {
            context.api.importSyncData();
            await input.onchange({ target: { files: [{ text: async () => JSON.stringify(file) }] } });
            render();
        },
        paintAt: time => {
            context.painter.applyPlaybackProgressVisual(-1, time);
            const played = vm.runInContext('SYNC_CREATOR_PROGRESS_BACKGROUND', context);
            return plain(context.charElementsRef.current.map(element => element.style.background === played));
        },
        livePreview: () => {
            context.showLivePreview = true;
            context.livePreviewSyncBody = context.api.materializeSyncCreatorParallelDrafts(context.syncData, { preview: true });
            return plain(vm.runInContext(`(() => {
                ${slice('\tconst livePreviewKaraokeLines =', '\tuseEffect(() => {\n\t\tif (!showLivePreview)')}
                return livePreviewKaraokeLines;
            })()`, context));
        },
    };
}

test('manual split offset targets the selected part of the original source row, even before parts are saved', () => {
    const editor = createEditor();
    const before = plain(editor.context.syncData);
    editor.split(2);
    editor.render('a');
    editor.shift(100);
    assert.deepEqual(editor.times(), [11.1, 11.35]);
    editor.render('b');
    assert.deepEqual(editor.times(), [11.5, 11.75]);
    assert.deepEqual(plain(editor.context.syncData.lines[0]), before.lines[0]);
    assert.deepEqual(plain(editor.context.syncData.lines[2]), before.lines[2]);
    assert.equal(editor.context.currentLineIndex, 1, 'both segments keep source lineIndex 1');
    assert.deepEqual(before.lines[1].chars, [11, 11.25, 11.5, 11.75]);
});

test('a word selected inside a stacked part offsets only that word, never the whole line', () => {
    const editor = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    editor.split(2);
    editor.render('b');
    const parts = plain(editor.context.currentParallelData.parts);
    assert.deepEqual(parts[1].chars, [11.5, 11.75, 12, 12.25]);
    editor.context.offsetSelectionRangeRef = { current: { start: 1, end: 2 } };
    editor.api.adjustCurrentLineOffset(100);
    const after = plain(editor.line().parallel.parts);
    assert.deepEqual(after[1].chars, [11.5, 11.85, 12.1, 12.25], 'only the selected word moves');
    assert.deepEqual(after[0].chars, parts[0].chars, 'the sibling part never moves');
    editor.render('b');
    assert.deepEqual(editor.times(), [11.5, 11.85, 12.1, 12.25]);
});

test('a selection inside a stacked part without reusable marks is refused and moves nothing', () => {
    const editor = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    editor.split(2);
    editor.render('b');
    const [lead, background] = plain(editor.context.currentParallelData.parts);
    const line = editor.line();
    // The saved run no longer matches the part's four glyphs.
    line.parallel = { layout: 'stack', parts: [lead, { ...background, chars: [11.5, 11.75, 12] }] };
    line.chars = [11, 11.25, 11.5, 11.75, 12];
    editor.render('b');
    const before = plain(editor.line());
    editor.context.offsetSelectionRangeRef = { current: { start: 1, end: 2 } };
    assert.throws(() => editor.api.adjustCurrentLineOffset(100), /selectionOffsetRequiresTiming/);
    assert.deepEqual(plain(editor.line()), before, 'neither the part nor the merged row moves');
});

for (const row of ['AB / CD', 'AB (CD) EF', 'AB | CD | EF']) {
    test(`automatic vocal offset is independent for ${JSON.stringify(row)}`, () => {
        const editor = createEditor({ rows: ['PRE', row, 'TAIL'] });
        const parts = plain(editor.context.currentParallelData.parts);
        editor.render(parts[0].id);
        editor.shift(100);
        const after = plain(editor.line().parallel.parts);
        assert.deepEqual(after[0].chars, parts[0].chars.map(time => time + 0.1));
        assert.deepEqual(after.slice(1), parts.slice(1));
        assert.equal(editor.context.manualParallelSplitDrafts[3], undefined);
    });
}

test('rapid repeated offsets read current data, and the selected target alone bounds negative edits at zero', () => {
    const editor = createEditor();
    editor.split(2);
    editor.render('b');
    editor.api.adjustCurrentLineOffset(100);
    editor.api.adjustCurrentLineOffset(100); // intentionally no render between clicks
    editor.render('b');
    assert.deepEqual(editor.times(), [11.7, 11.95]);
    editor.shift(-200);
    assert.deepEqual(editor.times(), [11.5, 11.75]);
    editor.shift(-100000);
    assert.deepEqual(editor.times(), [0, 0.25]);
    editor.render('a');
    assert.deepEqual(editor.times(), [11, 11.25], 'neither the source row nor its sibling bounds the selected shift');
    editor.api.assertValidSyncCreatorSyncData(editor.materialize());
});

test('removing, saving, importing and re-splitting a manual split retains exact characters and per-part offsets', async () => {
    const editor = createEditor();
    editor.split(2);
    editor.render('a'); editor.shift(100);
    editor.render('b'); editor.shift(-10);
    const expected = [11.1, 11.35, 11.49, 11.74];
    editor.split(2);
    assert.equal(editor.context.activeParallelPart, null);
    assert.deepEqual(editor.times(), expected);
    const output = await editor.export();
    assert.deepEqual(output.lines[1].chars, expected);
    assert.equal(output.lines[1].parallel, undefined);
    editor.split(1); // stale drafts must not override the file about to be imported
    editor.context.globalOffset = 500;
    await editor.import(output);
    assert.deepEqual(editor.times(), expected);
    assert.deepEqual(plain(editor.context.manualParallelSplitDrafts), {});
    assert.equal(editor.context.globalOffset, 0);
    editor.context.multiVocalMode = true;
    editor.split(2);
    editor.render('a'); assert.deepEqual(editor.times(), expected.slice(0, 2));
    editor.render('b'); assert.deepEqual(editor.times(), expected.slice(2));
});

test('Use auto suppresses persisted manual boundaries without discarding recorded timings', async () => {
    const editor = createEditor();
    editor.split(2); editor.shift(100);
    const output = await editor.export();
    await editor.import(output);
    assert.equal(editor.context.currentParallelData.parts.length, 2);
    editor.api.resetCurrentLineManualSplit(); editor.render();
    assert.equal(editor.context.activeParallelPart, null);
    assert.deepEqual(editor.times(), [11.1, 11.35, 11.5, 11.75]);
    assert.deepEqual(plain(editor.context.manualParallelSplitDrafts[3]), []);
});

// The reported song's visible marks are ordered. Only the invisible split
// separator retains a later parent mark than the following vocal's first mark.
for (const { row, chars, ranges, hidden } of [
    { row: 'AB CD' + 'E'.repeat(13),
      chars: [134.316, 135.496, 136.719, 136.667, 136.735, 138.024, 138.097, 139.241, 139.796, 139.897, 140.179, 140.458, 140.563, 141.024, 141.111, 141.438, 141.686, 141.873],
      ranges: [[0, 1], [3, 4], [5, 17]], hidden: [2] },
    { row: 'A'.repeat(18) + ' ' + 'B'.repeat(8) + ' ' + 'C'.repeat(6),
      chars: [195.683, 195.783, 195.846, 195.847, 195.959, 196.013, 196.099, 196.48, 196.509, 196.967, 197.002, 197.037, 197.231, 197.232, 197.256, 197.35, 197.399, 197.581, 198.363, 198.299, 198.329, 198.364, 198.378, 198.397, 198.419, 198.471, 198.506, 199.657, 199.738, 199.805, 199.879, 199.916, 199.999, 200.093],
      ranges: [[0, 17], [19, 26], [28, 33]], hidden: [18, 27] },
]) {
    test(`reported ${row.length}-character row saves and reopens as one row after removing every split`, async () => {
        const editor = createEditor({ rows: ['PRE', row, 'TAIL'] });
        const line = editor.line();
        const expected = chars.slice();
        for (const index of hidden) expected[index] = Math.min(expected[index], expected[index + 1]);
        line.chars = chars.map((time, index) => Math.max(time, ...chars.slice(0, index)));
        line.parallel = { layout: 'stack',
            hiddenRanges: hidden.map(index => ({ start: line.start + index, end: line.start + index })),
            parts: ranges.map(([start, end], index) => ({
                id: String.fromCharCode(97 + index), role: index ? 'background' : 'lead',
                speaker: 'NORMAL', kind: 'vocal', granularity: 'character', join: [],
                ranges: [{ start: line.start + start, end: line.start + end }], chars: chars.slice(start, end + 1),
            })),
        };
        editor.render();
        for (const [start] of ranges.slice(1)) editor.split(start);
        assert.equal(editor.context.activeParallelPart, null);
        const file = await editor.export();
        assert.equal(file.lines[1].parallel, undefined, 'hidden separator timing must not resurrect saved splits');
        assert.deepEqual(file.lines[1].chars, expected, 'visible character times are untouched');
        editor.recover(editor.record());
        await editor.import(file);
        assert.equal(editor.context.activeParallelPart, null);
        assert.deepEqual(editor.times(), expected);
    });
}

test('recording a sibling after partially rejoining overlapping vocals saves valid independent timing runs', () => {
    const editor = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    editor.split(2); editor.split(4);
    editor.render('b'); editor.shift(-1000);
    editor.split(2);
    editor.render('b');
    editor.api.commitCurrentLineSync([30, 31]); editor.render();
    editor.api.assertValidSyncCreatorSyncData(editor.context.syncData);
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), [11, 11.25, 10.5, 10.75, 30, 31]);
    const reopened = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    reopened.recover(editor.record());
    reopened.api.assertValidSyncCreatorSyncData(reopened.context.syncData);
});

test('work snapshots preserve old overlapping part marks as ordered runs without changing the source or input', () => {
    const editor = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    const line = editor.line();
    line.parallel = { layout: 'stack', parts: [
        { id: 'a', role: 'lead', ranges: [{ start: 3, end: 6 }], chars: [11, 11.25, 10.5, 10.75], granularity: 'character' },
        { id: 'b', role: 'background', ranges: [{ start: 7, end: 8 }], chars: [12, 12.25], granularity: 'character' },
    ] };
    const input = plain(editor.context.syncData);
    const repaired = editor.api.sanitizeSyncCreatorSyncData(editor.api.buildScoreSnapshot(editor.context.syncData));
    editor.api.assertValidSyncCreatorSyncData(repaired);
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(repaired.lines[1])), [11, 11.25, 10.5, 10.75, 12, 12.25]);
    assert.deepEqual(plain(editor.context.syncData), input);
});

test('historical repairs retain compact line and word marks without using the current lyric text', () => {
    const editor = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    const data = plain(editor.context.syncData);
    delete data.lines[0].chars;
    Object.assign(data.lines[0], { granularity: 'line', timing: 1 });
    delete data.lines[2].chars;
    Object.assign(data.lines[2], { granularity: 'word', timing: [[1, 21], [3, 21]] });
    data.lines[1].granularity = 'line';
    delete data.lines[1].chars;
    data.lines[1].timing = 11;
    data.lines[1].parallel = { layout: 'stack', parts: [
        { id: 'a', role: 'lead', ranges: [{ start: 3, end: 6 }], join: [], chars: [11, 11.25, 10.5, 10.75], granularity: 'character' },
        { id: 'b', role: 'background', ranges: [{ start: 7, end: 8 }], join: [], chars: [12, 12.25], granularity: 'character' },
    ] };
    const before = plain(data);
    editor.context.lyricsFullTextChars = [];
    const repaired = plain(editor.api.repairScoreSnapshot(data));
    assert.deepEqual(repaired.lines[0], before.lines[0]);
    assert.deepEqual(repaired.lines[2], before.lines[2], 'even equal word marks keep their original boundaries');
    assert.equal(repaired.lines[1].granularity, 'character');
    assert.equal(repaired.lines[1].timing, undefined);
    editor.api.assertValidSyncCreatorSyncData(editor.api.sanitizeSyncCreatorSyncData(repaired));
    assert.deepEqual(data, before);
});

test('historical repairs refuse excess vocal timing runs and keep generated IDs within the wire limit', () => {
    const editor = createEditor({ rows: ['PRE', 'A'.repeat(32), 'TAIL'] });
    const data = plain(editor.context.syncData);
    const line = data.lines[1];
    line.parallel = { layout: 'stack', parts: Array.from({ length: 16 }, (_, index) => ({
        id: String.fromCharCode(97 + index), role: index ? 'background' : 'lead', granularity: 'character',
        ranges: [{ start: 3 + index * 2, end: 4 + index * 2 }], join: [], chars: [20 + index, 20.5 + index],
    })) };
    line.parallel.parts[0].chars = [20, 19];
    assert.equal(editor.api.repairScoreSnapshot(data), null, 'cannot persist a 17-part replacement');
    line.parallel.parts = line.parallel.parts.slice(0, 2);
    line.parallel.parts[0].id = 'a'.repeat(32);
    const repaired = editor.api.repairScoreSnapshot(data);
    assert.equal(repaired.lines[1].parallel.parts.length, 3);
    assert.equal(repaired.lines[1].parallel.parts[0].id, 'a'.repeat(32));
    assert.equal(repaired.lines[1].parallel.parts[1].id.length, 32);
    assert.equal(new Set(repaired.lines[1].parallel.parts.map(part => part.id)).size, 3);
    editor.api.assertValidSyncCreatorSyncData(editor.api.sanitizeSyncCreatorSyncData(repaired));
});

test('overlapping vocals retain exact timing through remove/re-split, compact save/import and live preview', async () => {
    const editor = createEditor();
    editor.split(2);
    editor.render('b'); editor.shift(-1000);
    const expected = [11, 11.25, 10.5, 10.75];
    editor.split(2);
    assert.deepEqual(editor.times(), expected);
    const joinedPreview = editor.livePreview()[1];
    assert.equal(joinedPreview.vocals, undefined, 'preview keeps the rejoined row geometry');
    assert.equal(joinedPreview.startTime, 10500);
    assert.deepEqual(joinedPreview.syllables.map(char => char.startTime), [11000, 11250, 10500, 10750]);
    const wire = await editor.export();
    editor.api.assertValidSyncCreatorSyncData(editor.api.sanitizeSyncCreatorSyncData(wire));
    assert.deepEqual(wire.lines[1].parallel.parts.map(part => part.chars), [expected.slice(0, 2), expected.slice(2)]);
    editor.split(2);
    editor.render('b'); assert.deepEqual(editor.times(), expected.slice(2));
    await editor.import(wire);
    assert.equal(editor.context.activeParallelPart, null, 'saved timing runs do not restore a removed manual boundary');
    assert.deepEqual(editor.times(), expected);
    editor.split(2);
    editor.render('b'); assert.deepEqual(editor.times(), expected.slice(2));
    const vocals = editor.livePreview()[1].vocals;
    assert.deepEqual(vocals.lead.syllables.map(char => char.startTime), [11000, 11250]);
    assert.deepEqual(vocals.background[0].syllables.map(char => char.startTime), [10500, 10750]);
});

test('partial removal joins overlapping recorded parts without flattening them and still saves valid timing runs', async () => {
    const editor = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    editor.split(2); editor.split(4);
    editor.render('b'); editor.shift(-1000);
    const expected = [11, 11.25, 10.5, 10.75, 12, 12.25];
    editor.split(2);
    editor.render('a');
    assert.deepEqual(editor.times(), expected.slice(0, 4));
    editor.shift(100);
    const shifted = [11.1, 11.35, 10.6, 10.85, 12, 12.25];
    assert.deepEqual(editor.times(), shifted.slice(0, 4));
    const wire = await editor.export();
    const expanded = editor.api.sanitizeSyncCreatorSyncData(wire);
    editor.api.assertValidSyncCreatorSyncData(expanded);
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(expanded.lines[1])), shifted);
    editor.split(2);
    editor.render('a'); assert.deepEqual(editor.times(), shifted.slice(0, 2));
    editor.render('b'); assert.deepEqual(editor.times(), shifted.slice(2, 4));
    editor.render('c'); assert.deepEqual(editor.times(), shifted.slice(4));
});

test('source timing, full-line offsets, selected offsets and global offsets are each applied once in any order', async () => {
    const editor = createEditor();
    editor.shift(100); // unsplit source row
    editor.api.adjustGlobalOffset(100); editor.render();
    editor.split(2);
    editor.render('b'); editor.shift(100);
    editor.api.adjustGlobalOffset(100); editor.render('b');
    const expected = [11.3, 11.55, 11.9, 12.15];
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), expected);
    editor.render('a'); assert.deepEqual(editor.times(), expected.slice(0, 2));
    const draft = editor.record();
    editor.recover(draft);
    assert.equal(editor.context.globalOffset, 200, 'recovery restores the display accumulator without applying it again');
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), expected);
    const wire = await editor.export();
    await editor.import(wire);
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), expected);
    assert.deepEqual(plain(editor.context.syncData.lines[0].chars), [1.2, 1.45, 1.7]);
});

test('actual draft/checkpoint recovery preserves independent offsets, removed split overrides and history undo/redo', () => {
    const editor = createEditor();
    editor.split(2);
    const baseline = editor.record();
    editor.render('b'); editor.shift(-1000);
    editor.split(2);
    const edited = editor.record();
    const autosaved = draftStore.__test.mergeAutosaveRecord(null, edited);
    const autosaveRecovery = createEditor();
    autosaveRecovery.recover(plain(draftStore.__test.decodeStoredRecord(autosaved)));
    assert.deepEqual(autosaveRecovery.times(), [11, 11.25, 10.5, 10.75]);
    const saved = draftStore.__test.mergeCheckpointRecord(null, edited, {
        id: 'offset', kind: 'manual', baselineSnapshot: baseline.draft, snapshot: edited.draft,
    });
    const reopened = createEditor();
    reopened.recover(plain(draftStore.__test.decodeStoredRecord(saved)));
    assert.deepEqual(reopened.times(), [11, 11.25, 10.5, 10.75]);
    assert.equal(reopened.context.activeParallelPart, null);
    const sourceCheckpoint = saved.history[0];
    const undone = draftStore.__test.mergeRestoredRecord(saved, sourceCheckpoint.id, sourceCheckpoint.snapshot, 1000);
    reopened.recover(plain(undone));
    reopened.render('b'); assert.deepEqual(reopened.times(), [11.5, 11.75]);
    const redone = draftStore.__test.mergeRestoredRecord(undone, 'offset', edited.draft, 1001);
    reopened.recover(plain(redone));
    assert.deepEqual(reopened.times(), [11, 11.25, 10.5, 10.75]);
    reopened.split(2); reopened.render('b'); assert.deepEqual(reopened.times(), [10.5, 10.75]);
});

test('untimed selected vocals stay disabled rather than shifting a sibling or inventing timing', () => {
    const editor = createEditor();
    editor.split(2);
    editor.line().parallel = { layout: 'stack', parts: [
        { id: 'a', role: 'lead', ranges: [{ start: 3, end: 4 }], chars: [11, 11.25] },
        { id: 'b', role: 'background', ranges: [{ start: 5, end: 6 }] },
    ] };
    editor.line().chars = [];
    editor.render('b');
    const before = plain(editor.context.syncData);
    editor.shift(100);
    assert.deepEqual(plain(editor.context.syncData), before);
    assert.deepEqual(editor.times(), []);
});

test('merging and unmerging original rows preserves previously split, offset and overlapping character timings', async () => {
    const editor = createEditor();
    editor.split(2);
    editor.render('b'); editor.shift(-1000);
    const expected = [11, 11.25, 10.5, 10.75];
    const nextTimes = plain(editor.context.syncData.lines[2].chars);
    editor.api.mergeCurrentLineWithNext(); editor.render();
    editor.api.assertValidSyncCreatorSyncData(editor.materialize());
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), [...expected, ...nextTimes]);
    await editor.export();
    editor.api.unmergeCurrentLine(); editor.render();
    editor.api.assertValidSyncCreatorSyncData(editor.materialize());
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), expected);
    assert.deepEqual(plain(editor.context.syncData.lines[2].chars), nextTimes);
    editor.render('b'); assert.deepEqual(editor.times(), expected.slice(2));
    editor.api.mergeCurrentLineWithNext(); editor.render();
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), [...expected, ...nextTimes]);
});

test('recording a rejoined row replaces archived parts instead of resurrecting their older offset timings', () => {
    const editor = createEditor();
    editor.split(2);
    editor.render('b'); editor.shift(-1000);
    editor.split(2);
    editor.api.commitCurrentLineSync([30, 31, 32, 33]); editor.render();
    assert.deepEqual(editor.times(), [30, 31, 32, 33]);
    assert.equal(editor.line().parallel, undefined);
    editor.split(2);
    editor.render('a'); assert.deepEqual(editor.times(), [30, 31]);
    editor.render('b'); assert.deepEqual(editor.times(), [32, 33]);
});

test('rejoined overlapping glyphs paint from exact per-character marks, including seeks before the first written character', () => {
    const editor = createEditor();
    editor.split(2);
    editor.render('b'); editor.shift(-1000);
    editor.split(2);
    assert.deepEqual(editor.paintAt(10.4), [false, false, false, false]);
    assert.deepEqual(editor.paintAt(10.5), [false, false, true, false]);
    assert.deepEqual(editor.paintAt(10.8), [false, false, true, true]);
    assert.deepEqual(editor.paintAt(11.1), [true, false, true, true]);
    assert.deepEqual(editor.paintAt(11.3), [true, true, true, true]);
    assert.deepEqual(editor.paintAt(10.5), [false, false, true, false], 'backward seek repaints independent marks');
});

test('grouped automatic background ranges shift once each and leave hidden punctuation, lead timing and other metadata intact', async () => {
    const editor = createEditor({ rows: ['PRE', 'AB (CD) EF (GH)', 'TAIL'] });
    editor.context.parentheticalLayoutDrafts[3] = 'grouped';
    editor.render();
    const before = plain(editor.context.currentParallelData);
    const target = before.parts.find(part => part.role === 'background');
    assert.equal(target.ranges.length, 2);
    editor.render(target.id); editor.shift(100);
    const after = plain(editor.line().parallel);
    assert.deepEqual(after.hiddenRanges, before.hiddenRanges);
    assert.deepEqual(after.parts.find(part => part.role === 'lead'), before.parts.find(part => part.role === 'lead'));
    assert.deepEqual(after.parts.find(part => part.id === target.id).chars, target.chars.map(time => Math.round((time + 0.1) * 1000) / 1000));
    assert.deepEqual(after.parts.find(part => part.id === target.id).join, [2]);
    await editor.import(await editor.export());
    editor.render(target.id);
    assert.deepEqual(editor.times(), after.parts.find(part => part.id === target.id).chars);
});

test('line and word timing modes keep exact marks through split offsets, removing splits and compact recovery', async () => {
    for (const [granularity, chars] of [['line', [11, 11, 11, 11]], ['word', [11, 11, 12, 12]]]) {
        const editor = createEditor();
        Object.assign(editor.line(), { granularity, chars });
        editor.render(); editor.split(2);
        editor.render('b'); editor.shift(100);
        const expected = [...chars.slice(0, 2), ...chars.slice(2).map(time => time + 0.1)];
        editor.split(2);
        assert.deepEqual(editor.times(), expected);
        const file = await editor.export();
        assert.equal(file.lines[1].granularity, 'character', 'nonuniform joined timing cannot be compacted as one line/word');
        await editor.import(file);
        assert.deepEqual(editor.times(), expected);
        editor.recover(editor.record());
        assert.deepEqual(editor.times(), expected);
    }
});

test('the source character mapping counts Unicode code points and never aliases a part ID on another row', () => {
    const editor = createEditor({ rows: ['😀한', '😀A한B', 'EFGH'] });
    editor.split(2); editor.render('b'); editor.shift(100);
    assert.equal(editor.line().start, 2);
    assert.deepEqual(editor.times(), [11.6, 11.85]);
    assert.deepEqual(plain(editor.line().parallel.parts[1].ranges), [{ start: 4, end: 5 }]);
    editor.context.currentLineIndex = 2; editor.render(); editor.split(2); editor.render('b');
    assert.deepEqual(editor.times(), [21.5, 21.75]);
    editor.shift(-10);
    editor.context.currentLineIndex = 1; editor.render('b');
    assert.deepEqual(editor.times(), [11.6, 11.85]);
});

test('offsetting an existing part preserves custom speaker styling and inline effects across merged-row undo', () => {
    const editor = createEditor();
    editor.split(2); editor.shift(100);
    const line = editor.line();
    line.styleRanges = [{ start: 4, end: 4, kind: 'whisper' }];
    Object.assign(line.parallel.parts[1], { speaker: 'CUSTOM', 'speaker-color': '#00ff00', 'speaker-fallback': 'DUET 1', kind: 'echo' });
    editor.render('b'); editor.shift(-1000);
    assert.deepEqual(plain(editor.line().styleRanges), [{ start: 4, end: 4, kind: 'whisper' }]);
    const metadata = plain(editor.line().parallel.parts[1]);
    editor.api.mergeCurrentLineWithNext(); editor.render();
    editor.api.unmergeCurrentLine(); editor.render('b');
    assert.deepEqual(plain(editor.line().styleRanges), [{ start: 4, end: 4, kind: 'whisper' }]);
    assert.deepEqual(plain(editor.line().parallel.parts[1]), metadata);
    editor.api.assertValidSyncCreatorSyncData(editor.materialize());
});

for (const [row, points] of [['ABC', [1, 2]], ['ABCDEF', [2, 4]], ['ONE TWO END', [4, 8]]]) {
    for (const edit of ['offset', 'record']) {
        test(`three-part ${JSON.stringify(row)} ${edit}: a merged middle part stays joined through save/reload and sequential merges`, async () => {
            const rows = ['PRE', row, 'TAIL'];
            const editor = createEditor({ rows });
            for (const point of points) editor.split(point);
            editor.render('b');
            if (edit === 'offset') editor.shift(-1000);
            else {
                editor.api.commitCurrentLineSync(editor.times().map(time => time - 1));
                editor.render('b');
            }
            const expected = plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line()));
            const tail = plain(editor.context.syncData.lines[2]);
            editor.split(points[0]);
            editor.render('a');
            assert.equal(editor.context.currentParallelParts.length, 2);
            assert.deepEqual(editor.times(), expected.slice(0, row.slice(0, points[1]).trimEnd().length),
                'the selected joined target retains its exact visible marks');
            const file = await editor.export();
            assert.deepEqual((await editor.submit()).lines, file.lines, 'publish serializes the same exact groups and timings as export');
            const reopened = createEditor({ rows });
            await reopened.import(file);
            assert.equal(reopened.context.currentParallelParts.length, 2, 'timing runs are not editor split boundaries');
            assert.deepEqual(plain(reopened.api.getSyncCreatorRejoinedLineChars(reopened.line())), expected);
            reopened.split(points[1]);
            assert.equal(reopened.context.activeParallelPart, null);
            const joined = await reopened.export();
            await reopened.import(joined);
            assert.equal(reopened.context.activeParallelPart, null, 'removing the next boundary must not restore the previous one');
            assert.deepEqual(reopened.times(), expected);
            assert.deepEqual(plain(reopened.context.syncData.lines[2]), tail, 'an unrelated source row is untouched');
            const recovered = createEditor({ rows });
            recovered.recover(reopened.record());
            assert.equal(recovered.context.activeParallelPart, null);
            assert.deepEqual(recovered.times(), expected);
        });
    }
}

test('merging another source row does not restore a previously removed split boundary', async () => {
    const rows = ['PRE', 'ABCDEF', 'TAIL'];
    const editor = createEditor({ rows });
    editor.split(2); editor.split(4);
    editor.render('b'); editor.shift(-1000);
    const expected = plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line()));
    editor.split(2);
    editor.api.mergeCurrentLineWithNext(); editor.render();
    assert.equal(editor.context.currentParallelParts.length, 3, 'two edited groups plus the next source row');
    const reopened = createEditor({ rows });
    await reopened.import(await editor.export());
    assert.equal(reopened.context.currentParallelParts.length, 3);
    assert.deepEqual(plain(reopened.api.getSyncCreatorRejoinedLineChars(reopened.line())).slice(0, 6), expected);
    editor.api.unmergeCurrentLine(); editor.render();
    assert.equal(editor.context.currentParallelParts.length, 2, 'unmerging source rows keeps the earlier manual join');
    assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())), expected);
});

test('an independent concurrent vocal using the same character range keeps its own recorded times', async () => {
    const editor = createEditor();
    editor.line().parallel = { layout: 'stack', parts: [
        { id: 'lead', role: 'lead', ranges: [{ start: 3, end: 6 }], chars: [11, 11.25, 11.5, 11.75] },
        { id: 'echo', role: 'background', ranges: [{ start: 3, end: 6 }], chars: [11.1, 11.35, 11.6, 11.85] },
    ] };
    const before = plain(editor.line().parallel.parts);
    editor.render();
    assert.deepEqual(plain(editor.context.currentParallelParts.map(part => part.chars)), before.map(part => part.chars));
    await editor.import(await editor.export());
    assert.deepEqual(plain(editor.line().parallel.parts.map(part => part.chars)), before.map(part => part.chars));
});

test('persisted manual boundaries are validated and mark grouping changes as unsubmitted', () => {
    const editor = createEditor({ rows: ['PRE', 'ABCDEF', 'TAIL'] });
    editor.split(2); editor.split(4);
    editor.render('b'); editor.shift(-1000);
    const saved = plain(editor.materialize());
    editor.api.assertValidSyncCreatorSyncData(saved);
    for (const points of ['2', [-1], [0], [6], [2, 2], [4, 2], [1.5], Array(16).fill(1)]) {
        const invalid = structuredClone(saved);
        invalid.lines[1].parallel.manualSplitPoints = points;
        assert.throws(() => editor.api.assertValidSyncCreatorSyncData(invalid), /manualSplitPoints/);
    }
    editor.context.originalBody = saved;
    editor.context.joinedBody = structuredClone(saved);
    editor.context.joinedBody.lines[1].parallel.manualSplitPoints = [];
    assert.equal(vm.runInContext('areSyncCreatorSyncBodiesEqual(originalBody, joinedBody)', editor.context), false);
});

test('joining an edited row with a concurrent source row preserves the other vocal and its original ranges', async () => {
    const rows = ['PRE', 'ABCDEF', 'TAIL'];
    const editor = createEditor({ rows });
    editor.context.syncData.lines[2].parallel = { layout: 'stack', parts: [
        { id: 'lead', role: 'lead', ranges: [{ start: 9, end: 12 }], join: [], chars: [21, 21.25, 21.5, 21.75] },
        { id: 'echo', role: 'background', ranges: [{ start: 9, end: 12 }], join: [], chars: [21.1, 21.35, 21.6, 21.85] },
    ] };
    editor.split(2); editor.split(4);
    editor.render('b'); editor.shift(-1000);
    editor.split(2);
    editor.api.mergeCurrentLineWithNext(); editor.render();
    const file = await editor.export();
    const voices = file.lines[1].parallel.parts.filter(part => part.ranges.length === 1
        && part.ranges[0].start === 9 && part.ranges[0].end === 12);
    assert.deepEqual(voices.map(part => part.chars), [[21, 21.25, 21.5, 21.75], [21.1, 21.35, 21.6, 21.85]],
        'manual grouping cannot replace an independent concurrent vocal with the lead timing');
    await editor.import(file);
    assert.deepEqual(plain(editor.line().parallel.parts.filter(part => part.ranges[0].start === 9).map(part => part.chars)),
        voices.map(part => part.chars));
});

test('manual joins survive the backend validator, storage normalizer, public GET and editor reload', {
    skip: !process.env.SYNC_CREATOR_BACKEND_ROOT,
}, async () => {
    const backendUrl = pathToFileURL(`${process.env.SYNC_CREATOR_BACKEND_ROOT}/src/routes/sync_data.js`).href;
    const { normalizeSyncDataForStorage, validateSyncData, handleSyncData } = await import(backendUrl);
    const rows = ['PRE', 'ABCDEF', 'TAIL'];
    const editor = createEditor({ rows });
    const source = {
        provider: 'lrclib', lrclibId: '123', preferredLyricsSource: 'plain', duration: 120,
        lyricsFingerprint: vm.runInContext('getSyncCreatorLyricsFingerprintFromText(lyricsText)', editor.context),
        lineCharCounts: rows.map(row => Array.from(row).length), lineCount: rows.length,
        textCharCount: rows.reduce((count, row) => count + Array.from(row).length, 0),
    };
    editor.context.attachSelectedLrclibSource = data => ({ ...data, source });
    editor.context.providerRef.current = 'lrclib';
    editor.split(2); editor.split(4);
    editor.render('b'); editor.shift(-1000);
    editor.split(2);
    for (const boundaries of [[4], []]) {
        if (!boundaries.length) editor.split(4);
        const submitted = await editor.submit();
        assert.deepEqual(submitted.lines[1].parallel.manualSplitPoints, boundaries);
        const normalized = normalizeSyncDataForStorage(submitted);
        assert.deepEqual(validateSyncData(normalized, 'lrclib'), { valid: true }, 'the actual server schema must accept the field');
        const storedJson = JSON.stringify(normalized);
        const env = { DB: { prepare(sql) { return { bind() { return {
            async first() {
                assert.match(sql, /FROM sync_data/);
                return { isrc: 'USFIX1234567', provider: 'lrclib', sync_data: storedJson };
            },
            async all() {
                assert.match(sql, /FROM sync_contributors/);
                return { results: [] };
            },
        }; } }; } } };
        const response = await handleSyncData(new Request('https://fixture.invalid/lyrics/sync-data?isrc=USFIX1234567&provider=lrclib'), env, {});
        assert.equal(response.status, 200);
        const publicData = (await response.json()).data.syncData;
        assert.deepEqual(publicData.lines[1].parallel.manualSplitPoints, boundaries);
        assert.deepEqual(publicData.lines[1].parallel.parts, submitted.lines[1].parallel.parts,
            'storage and public decode preserve every independent timing target and its ranges');
        const reopened = createEditor({ rows });
        await reopened.import(publicData);
        assert.equal(reopened.context.currentParallelParts.length, boundaries.length ? 2 : 0);
        assert.deepEqual(plain(reopened.api.getSyncCreatorRejoinedLineChars(reopened.line())),
            plain(editor.api.getSyncCreatorRejoinedLineChars(editor.line())));
    }
});

test('published merged groups render once with exact edited timing marks in the real lyric decoder', async () => {
    const { KaraokeWordTiming, SyncDataSourceCompatibility } = createRequire(import.meta.url)('../LyricsService.js');
    const playbackSource = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
    const playback = vm.createContext({ window: { SyncDataCodec: createRequire(import.meta.url)('../SyncDataCodec.js') }, Spicetify: {}, console, KaraokeWordTiming, SyncDataSourceCompatibility });
    const addonSource = readFileSync(new URL('../Addon_Lyrics_Lrclib.js', import.meta.url), 'utf8');
    vm.runInContext(addonSource.slice(addonSource.indexOf('    function buildLrclibSyncDataParallelParts('),
        addonSource.indexOf('    function stripLrcTimestamps(', addonSource.indexOf('    function buildLrclibSyncDataParallelParts('))), playback);
    vm.runInContext(playbackSource.slice(playbackSource.indexOf('const SyncDataService = (() => {'),
        playbackSource.indexOf('window.SyncDataService = SyncDataService;'))
        + '\nglobalThis.apply = SyncDataService.applySyncDataToLyrics;', playback);
    const rows = ['PRE', 'ABCDEF', 'TAIL'];
    const editor = createEditor({ rows });
    editor.split(2); editor.split(4);
    editor.render('b'); editor.shift(-1000);
    editor.split(2);
    for (const expectedText of [['ABCD', 'EF'], ['ABCDEF']]) {
        if (expectedText.length === 1) editor.split(4);
        const published = await editor.submit();
        const wire = playback.window.SyncDataCodec.encode(published);
        const played = playback.apply(rows.map(text => ({ text })), { provider: 'lrclib', syncData: wire });
        assert.deepEqual(plain(played), plain(playback.apply(rows.map(text => ({ text })), { provider: 'lrclib', syncData: published })), 'v6 and legacy playback are identical');
        const result = plain(played)[1];
        const vocals = result.vocals ? [result.vocals.lead, ...result.vocals.background] : [result];
        assert.deepEqual(vocals.map(part => part.text), expectedText,
            'ordered wire timing targets must not become separate visible vocal rows');
        assert.deepEqual(vocals.flatMap(part => part.syllables.map(char => char.startTime)),
            [11000, 11250, 10500, 10750, 12000, 12250], 'render grouping preserves every manual mark');
    }
    const decode = (sourceRows, data) => plain(playback.apply(sourceRows.map(text => ({ text })), { provider: 'lrclib', syncData: data }))[1];
    const vocalsOf = line => line.vocals ? [line.vocals.lead, ...line.vocals.background] : [line];
    const published = await editor.submit();
    const legacy = structuredClone(published);
    delete legacy.lines[1].parallel.manualSplitPoints;
    for (const invalid of [null, '4', [6], [4, 2], [2, 2], [-1], [1.5]]) {
        const data = structuredClone(published);
        data.lines[1].parallel.manualSplitPoints = invalid;
        assert.deepEqual(decode(rows, data), decode(rows, legacy), 'invalid grouping metadata retains legacy rendering');
    }
    published.lines[1].parallel.parts.splice(1, 0, {
        id: 'echo', role: 'background', granularity: 'character', speaker: 'CUSTOM',
        'speaker-color': '#dd00ee', 'speaker-fallback': 'FEMALE 1', kind: 'whisper',
        ranges: [{ start: 3, end: 8 }], join: [], chars: [9, 9.1, 9.2, 9.3, 9.4, 9.5],
    });
    const concurrent = vocalsOf(decode(rows, published));
    assert.deepEqual(concurrent.map(part => part.text), ['ABCDEF', 'ABCDEF']);
    assert.deepEqual(concurrent[0].syllables.map(char => char.startTime), [11000, 11250, 10500, 10750, 12000, 12250]);
    assert.deepEqual(concurrent[1].syllables.map(char => char.startTime), [9000, 9100, 9200, 9300, 9400, 9500]);
    assert.equal(concurrent[1]['speaker-color'], '#dd00ee');
    assert.equal(concurrent[1]['speaker-fallback'], 'FEMALE 1');
    assert.equal(concurrent[1].kind, 'whisper');
    Object.assign(published.lines[1].parallel.parts[2], {
        speaker: 'CUSTOM', 'speaker-color': '#00ff00', 'speaker-fallback': 'DUET 1', kind: 'echo',
    });
    published.lines[1].styleRanges = [{ start: 6, end: 6, kind: 'glow', speaker: 'FEMALE 1' }];
    const before = JSON.stringify(published);
    const styled = vocalsOf(decode(rows, published))[0].syllables;
    assert.equal(styled[2].styleSpeaker, 'CUSTOM');
    assert.equal(styled[2].styleSpeakerColor, '#00ff00');
    assert.equal(styled[2].styleSpeakerFallback, 'DUET 1');
    assert.equal(styled[2].styleKind, 'echo');
    assert.equal(styled[3].styleSpeaker, 'FEMALE 1');
    assert.equal(styled[3].styleKind, 'glow');
    assert.equal(styled[3].styleSpeakerColor, undefined, 'explicit inline speaker overrides do not inherit another speaker color');
    assert.equal(JSON.stringify(published), before, 'the public decoder preserves wire ranges, hidden data and marks');

    const gapRows = ['PRE', 'AB CD EF', 'TAIL'];
    const gapEditor = createEditor({ rows: gapRows });
    gapEditor.split(3); gapEditor.split(6);
    gapEditor.render('b'); gapEditor.shift(-1000);
    gapEditor.split(3);
    for (const expectedText of [['AB CD', 'EF'], ['AB CD EF']]) {
        if (expectedText.length === 1) gapEditor.split(6);
        const data = await gapEditor.submit();
        const original = JSON.stringify(data);
        const groups = vocalsOf(decode(gapRows, data));
        assert.deepEqual(groups.map(part => part.text), expectedText);
        assert.deepEqual(groups.flatMap(part => part.syllables.filter(char => char.text.trim()).map(char => char.startTime)),
            [11000, 11250, 10750, 11000, 12500, 12750], 'hidden split whitespace never moves a sung mark');
        assert.equal(JSON.stringify(data), original);
    }
});

// Opt-in local evidence: the downloaded attachment stays outside the repository.
// Only its character counts, ranges and timing structure enter the editor; text
// and track identity are replaced before running any production callbacks.
test('reported full attachment preserves every vocal and merged group after local export/import', {
    skip: !process.env.SYNC_CREATOR_REGRESSION_JSON,
}, async () => {
    const input = JSON.parse(readFileSync(process.env.SYNC_CREATOR_REGRESSION_JSON, 'utf8'));
    const counts = input.source.lineCharCounts;
    const flat = Array(counts.reduce((total, count) => total + count, 0)).fill('X');
    for (const line of input.lines) {
        for (const range of [...(line.hiddenRanges || []), ...(line.parallel?.hiddenRanges || [])]) {
            for (let index = range.start; index <= range.end; index++) flat[index] = ' ';
        }
    }
    let cursor = 0;
    const rows = counts.map(count => {
        const row = flat.slice(cursor, cursor + count).join('');
        cursor += count;
        return row;
    });
    const data = { version: input.version, lines: input.lines };
    const editor = createEditor({ rows, data });
    const before = plain(data);
    const wire = await editor.export();
    await editor.import(wire);
    for (const [index, line] of before.lines.entries()) {
        assert.deepEqual(plain(editor.api.getSyncCreatorRejoinedLineChars(editor.context.syncData.lines[index])),
            plain(editor.api.getSyncCreatorRejoinedLineChars(line)), `all timing marks survive row ${index + 1}`);
        assert.deepEqual(plain(editor.context.syncData.lines[index].parallel?.parts.map(part => part.chars) || null),
            line.parallel?.parts.map(part => part.chars) || null, `independent vocals survive row ${index + 1}`);
    }
    for (const index of [26, 30, 39, 41, 50, 51, 57, 62, 63, 66, 74]) {
        editor.context.currentLineIndex = index - 1;
        editor.render();
        const parts = editor.context.currentParallelParts;
        if (parts.length < 2 || parts.some(part => part.ranges.length !== 1)) continue;
        const boundaries = parts.slice(1).map(part => part.ranges[0].start - editor.context.currentLineStart);
        for (const boundary of boundaries) editor.split(boundary);
        const expected = plain(editor.times());
        assert.equal(editor.context.activeParallelPart, null, `reported row ${index} is joined before saving`);
        await editor.import(await editor.export());
        assert.equal(editor.context.activeParallelPart, null, `reported row ${index} stays joined when reopened`);
        assert.deepEqual(editor.times(), expected, `reported row ${index} keeps exact edited times`);
    }
});

const lrclibSourceFor = (context, rows) => {
    const lineCharCounts = rows.map(row => Array.from(row).length);
    return {
        provider: 'lrclib', lrclibId: '424242', preferredLyricsSource: 'plain', duration: 120,
        lyricsFingerprint: vm.runInContext(`getSyncCreatorLyricsFingerprintFromText(${JSON.stringify(rows.join('\n'))})`, context),
        lineCharCounts, lineCount: rows.length,
        textCharCount: lineCharCounts.reduce((sum, count) => sum + count, 0),
    };
};
// Imports without the fixture re-render, for files that replace the shown rows.
const importFile = async (editor, file) => {
    let input;
    editor.context.document = { createElement: () => (input = { click() {} }) };
    editor.api.importSyncData();
    await input.onchange({ target: { files: [{ text: async () => JSON.stringify(file) }] } });
};
// The reported entry's shape: its plain text breaks two lines differently from
// the timed text the editor was showing (synthetic rows).
const FILE_ROWS = ['Morning light', 'Hold me close, (oh)', 'Never, never let go'];
const SHOWN_ROWS = ['Morning light', 'Hold me close', 'Never let go'];

test('a file made on other lyrics loads them before its timings are placed', async () => {
    const maker = createEditor({ rows: FILE_ROWS });
    const file = { ...(await maker.export()), source: lrclibSourceFor(maker.context, FILE_ROWS) };
    const reference = createEditor({ rows: FILE_ROWS });
    await reference.import(file);
    const editor = createEditor({ rows: SHOWN_ROWS });
    const requested = [];
    const loadedSource = { ...file.source, searchSource: 'id' };
    editor.context.loadLrclibSourceForImport = async source => {
        requested.push(plain(source));
        return { lyricsChars: FILE_ROWS.flatMap(row => Array.from(row)), lyricsFingerprint: 'file-text', lrclibSource: loadedSource };
    };
    await importFile(editor, file);
    assert.deepEqual(requested, [plain(file.source)]);
    assert.deepEqual(plain(editor.context.syncData), plain(reference.context.syncData),
        'the timings apply exactly as they do on the lyrics they were made on');
    assert.deepEqual(plain(editor.context.selectedLrclibSource), loadedSource);
});

test('files for the shown lyrics, or with the same line lengths, import without loading other lyrics', async () => {
    const rows = ['PRE', 'ABCD', 'TAIL'];
    const exported = await createEditor({ rows }).export();
    const shown = createEditor({ rows });
    for (const source of [lrclibSourceFor(shown.context, rows), lrclibSourceFor(shown.context, ['PRX', 'ABCE', 'TAIX'])]) {
        const editor = createEditor({ rows, data: { version: 5, lines: [] } });
        await editor.import({ ...exported, source });
        assert.equal(editor.context.syncData.lines.length, rows.length);
        assert.deepEqual(plain(editor.context.selectedLrclibSource), source);
    }
});

test('a file that fits no available lyrics fails instead of reporting success', async () => {
    const maker = createEditor({ rows: FILE_ROWS });
    const file = { ...(await maker.export()), source: lrclibSourceFor(maker.context, FILE_ROWS) };
    const editor = createEditor({ rows: SHOWN_ROWS });
    const before = plain(editor.context.syncData);
    editor.context.loadLrclibSourceForImport = async () => { throw new Error('syncCreator.importLyricsMismatch'); };
    await assert.rejects(importFile(editor, file), { message: 'syncCreator.importError: syncCreator.importLyricsMismatch' });
    assert.deepEqual(plain(editor.context.syncData), before);

    let loads = 0;
    editor.context.loadLrclibSourceForImport = async () => { loads += 1; return null; };
    await assert.rejects(importFile(editor, { ...file, lines: [{ start: 4, end: 1, chars: [1] }] }), /Invalid sync data/);
    assert.equal(loads, 0, 'an unusable file is refused before the shown lyrics are replaced');

    await importFile(editor, file);
    assert.equal(loads, 1);
    assert.deepEqual(plain(editor.context.syncData), before, 'a newer lyrics load replaces a pending import');
});


test('offsetting a part after merging with an untimed lyric never saves a part outside its row', () => {
    // Reported as "Invalid work snapshot: Line N, parallel part 2: range 1 is
    // outside the parent line": the displayed row covers ABCD+EFG, the saved row
    // only ABCD, and the untimed EFG part used to be written into the saved row.
    const rows = ['PRE', 'ABCD', 'EFG', 'TAIL'];
    let start = 0;
    const offsets = rows.map(row => { const offset = start; start += row.length; return offset; });
    const data = { version: 5, lines: [0, 1, 3].map(index => ({
        start: offsets[index], end: offsets[index] + rows[index].length - 1,
        chars: Array.from(rows[index], (_, char) => index * 10 + char / 4 + 1),
        granularity: 'character', speaker: 'NORMAL', kind: 'vocal',
    })) };
    const editor = createEditor({ rows, data });
    editor.api.mergeCurrentLineWithNext();
    editor.render('a');
    assert.deepEqual(plain(editor.context.currentParallelData.parts.map(part => part.ranges)),
        [[{ start: 3, end: 6 }], [{ start: 7, end: 9 }]], 'the displayed row still offers both vocals');
    editor.shift(100);
    const saved = plain(editor.line());
    assert.equal(saved.end, 6);
    assert.deepEqual(saved.parallel.parts.map(part => part.ranges), [[{ start: 3, end: 6 }]]);
    assert.deepEqual(saved.parallel.parts[0].chars, [11.1, 11.35, 11.6, 11.85]);
    assert.doesNotThrow(() => editor.api.assertValidSyncCreatorSyncData(editor.context.syncData));
    assert.deepEqual(plain(editor.context.currentParallelData.parts.map(part => part.id)), ['a', 'b'],
        'the untimed vocal can still be recorded on the merged row');
});

test('work snapshots and queued-snapshot repair keep every part inside its saved row', () => {
    const editor = createEditor();
    const outside = plain(editor.context.syncData);
    outside.lines[1].parallel = { layout: 'stack', manualSplitPoints: [2, 6], parts: [
        { id: 'a', role: 'lead', ranges: [{ start: 3, end: 6 }], join: [], granularity: 'character', chars: [11, 11.25, 11.5, 11.75] },
        { id: 'b', role: 'background', ranges: [{ start: 5, end: 9 }], join: [], granularity: 'character', chars: [11.5, 11.75, 20, 20.5, 21] },
        { id: 'c', role: 'background', ranges: [{ start: 7, end: 9 }], join: [], granularity: 'character' },
    ] };
    outside.lines[1].mergedLineContinuationStarts = [7];
    assert.throws(() => editor.api.assertValidSyncCreatorSyncData(outside), /parent line/);
    const expected = [[{ start: 3, end: 6 }], [{ start: 5, end: 6 }]];
    for (const result of [editor.api.buildScoreSnapshot(outside), editor.api.repairScoreSnapshot(outside)]) {
        const row = plain(result).lines[1];
        assert.deepEqual(row.parallel.parts.map(part => part.ranges), expected);
        assert.deepEqual(row.parallel.parts[1].chars, [11.5, 11.75]);
        assert.deepEqual(row.parallel.manualSplitPoints, [2]);
        assert.equal(row.mergedLineContinuationStarts, undefined);
    }
    const valid = plain(editor.context.syncData);
    assert.deepEqual(plain(editor.api.buildScoreSnapshot(valid)).lines, plain(editor.api.compactSyncCreatorSyncData(valid, editor.context.lyricsFullTextChars, 'en')).lines,
        'rows already inside their bounds are unchanged');
});

test('held last-character ends move with their own vocal and survive edits to a sibling vocal', () => {
    const rows = ['PRE', 'ABCDEF', 'TAIL'];
    const data = { version: 5, lines: [
        { start: 0, end: 2, chars: [1, 1.25, 1.5], granularity: 'character', speaker: 'NORMAL', kind: 'vocal' },
        { start: 3, end: 8, chars: [11, 11.25, 11.5, 11.75, 12, 12.25], granularity: 'line', speaker: 'NORMAL', kind: 'vocal',
            parallel: { layout: 'stack', manualSplitPoints: [2], parts: [
                { id: 'a', role: 'lead', speaker: 'NORMAL', kind: 'vocal', granularity: 'character', ranges: [{ start: 3, end: 4 }], join: [], chars: [11, 11.25] },
                { id: 'b', role: 'background', speaker: 'NORMAL', kind: 'vocal', granularity: 'character', ranges: [{ start: 5, end: 8 }], join: [], chars: [11.5, 11.75, 12, 12.25], lastCharEnd: 15 },
            ] } },
        { start: 9, end: 12, chars: [21, 21.25, 21.5, 21.75], granularity: 'character', speaker: 'NORMAL', kind: 'vocal' },
    ] };
    const editor = createEditor({ rows, data });
    editor.render('b');
    editor.shift(100);
    let parts = plain(editor.line().parallel.parts);
    assert.deepEqual(parts.find(part => part.id === 'b').chars, [11.6, 11.85, 12.1, 12.35]);
    assert.equal(parts.find(part => part.id === 'b').lastCharEnd, 15.1);
    editor.render('a');
    editor.shift(-100);
    parts = plain(editor.line().parallel.parts);
    assert.deepEqual(parts.find(part => part.id === 'a').chars, [10.9, 11.15]);
    assert.equal(parts.find(part => part.id === 'b').lastCharEnd, 15.1, 'the sibling keeps its held end');
    assert.doesNotThrow(() => editor.api.assertValidSyncCreatorSyncData(editor.context.syncData));
});
