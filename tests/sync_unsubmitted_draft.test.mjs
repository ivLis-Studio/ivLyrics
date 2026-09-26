import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const helpersSource = source.slice(0, source.indexOf('const SyncDataCreator ='));

const loadHelpers = () => {
	const context = vm.createContext({ console, structuredClone });
	vm.runInContext(`${helpersSource}\nglobalThis.compare = areSyncCreatorSyncBodiesEqual;`, context);
	return context.compare;
};

const line = (start, chars, extra = {}) => ({ start, end: start + chars.length - 1, chars, ...extra });

test('identical sync bodies compare equal while timing changes do not', () => {
	const compare = loadHelpers();
	const left = { lines: [line(0, [1, 1.5, 2]), line(3, [3, 3.25])] };
	const right = structuredClone(left);
	assert.equal(compare(left, right), true);
	right.lines[0].chars[1] = 1.6;
	assert.equal(compare(left, right), false);
});

test('missing kind/speaker match their defaults and line count matters', () => {
	const compare = loadHelpers();
	const plain = { lines: [line(0, [1, 2])] };
	const explicit = { lines: [line(0, [1, 2], { kind: 'vocal', speaker: 'NORMAL' })] };
	assert.equal(compare(plain, explicit), true);
	assert.equal(compare(plain, { lines: [line(0, [1, 2]), line(2, [3])] }), false);
	assert.equal(compare({ lines: [] }, { lines: [] }), true);
	assert.equal(compare(null, { lines: [line(0, [1])] }), false);
});

test('sub-millisecond rounding is ignored but parallel timing is compared', () => {
	const compare = loadHelpers();
	assert.equal(
		compare({ lines: [line(0, [1.0004])] }, { lines: [line(0, [1.00049])] }),
		true
	);
	const left = { lines: [line(0, [1, 2], { parallel: { parts: [{ id: 'a', ranges: [{ start: 0, end: 1 }], chars: [1, 2] }] } })] };
	const right = structuredClone(left);
	right.lines[0].parallel.parts[0].chars[1] = 2.5;
	assert.equal(compare(left, right), false);
});

test('loading prefers the unsubmitted draft and remembers the server baseline', () => {
	const loader = source.slice(
		source.indexOf('const text = extractLyricsText(result.synced || result.unsynced);'),
		source.indexOf('const resolveMultiVocalDecision =')
	);
	assert.ok(loader.includes('tryRestoreUnsubmittedSyncDraft'));
	assert.ok(loader.indexOf('tryRestoreUnsubmittedSyncDraft') < loader.indexOf('setSyncData(loadedSyncBody)'));
	assert.ok(loader.includes('serverBaselineSyncDataRef.current = loadedSyncBody'));
	assert.ok(loader.includes('restoredUnsubmittedDraft?.draft?.syncData || loadedSyncBody'));
});

test('submit clears the unsubmitted flag and refreshes the baseline', () => {
	const submit = source.slice(source.indexOf('const handleSubmit ='), source.indexOf('// 싱크 데이터 내보내기'));
	assert.equal((submit.match(/setHasUnsubmittedSync\(false\)/g) || []).length, 2);
	assert.ok(submit.includes('serverBaselineSyncDataRef.current = syncCreatorDraftStore?.cloneValue?.(syncDataToSubmit)'));
});

test('submit button turns red while sync changes are unsubmitted', () => {
	const header = source.slice(source.indexOf('const renderHeader ='), source.indexOf('const renderCharacterPronunciationTargetControl ='));
	assert.ok(header.includes('hasUnsubmittedSync && !isSubmitting && !isReverting && syncData ? TOSS_RED : s.submitBtn.background'));
	assert.ok(header.includes("I18n.t('syncCreator.unsubmittedChanges')"));
});

test('autosave runs promptly so closing the editor keeps the draft', () => {
	const match = source.match(/const SYNC_CREATOR_AUTOSAVE_INTERVAL_MS = ([\d_]+);/);
	assert.ok(match);
	assert.ok(Number(match[1].replace(/_/g, '')) <= 5000);
	assert.ok(source.includes('await syncCreatorDraftStore.saveDraft(record);'));
});

test('revert reloads the published sync and discards the local draft', () => {
	const start = source.indexOf('const handleRevertToPublished =');
	assert.ok(start >= 0);
	const revert = source.slice(start, source.indexOf('const handleSubmit =', start));
	assert.ok(revert.includes('window.SyncDataService.getSyncData(trackId, revertProvider'));
	assert.ok(revert.includes('if (!publishedBody) publishedBody = serverBaselineSyncDataRef.current;'));
	assert.ok(revert.includes("deleteActiveSyncCreatorDraft({ resumeAutosave: true })"));
	for (const reset of [
		'setParallelPartMetaDrafts({})',
		'setManualParallelSplitDrafts({})',
		'setParentheticalLayoutDrafts({})',
		'setMergedLineDrafts({})',
		'setLineMetaDrafts({})',
		'setLineStyleDrafts({})'
	]) {
		assert.ok(revert.includes(reset), `missing ${reset}`);
	}
	assert.ok(revert.includes('serverBaselineSyncDataRef.current = syncCreatorDraftStore?.cloneValue?.(restored) || restored;'));
	assert.ok(revert.includes('setHasUnsubmittedSync(false);'));
	assert.ok(revert.includes("I18n.t('syncCreator.revertConfirm')"));
	assert.ok(revert.includes("I18n.t('syncCreator.noPublishedSync')"));
	assert.ok(revert.includes("I18n.t('syncCreator.historyStopRecording')"));
});

test('header offers revert next to submit and both lock while reverting', () => {
	const header = source.slice(source.indexOf('const renderHeader ='), source.indexOf('const renderCharacterPronunciationTargetControl ='));
	assert.ok(header.includes("(hasUnsubmittedSync || hasPublishedSync) && react.createElement('button', {"));
	assert.ok(header.includes("className: 'sync-creator-revert'"));
	assert.ok(header.includes('onClick: handleRevertToPublished'));
	assert.ok(header.includes('disabled: isSubmitting || isReverting || !lyricsText'));
	assert.ok(header.includes('disabled: isSubmitting || isReverting || !syncData'));
	assert.ok(header.includes("I18n.t('syncCreator.revertDesc')"));
});

test('published-sync presence is tracked wherever the baseline changes', () => {
	assert.ok(source.includes('const [hasPublishedSync, setHasPublishedSync] = useState(false);'));
	assert.ok(source.includes('setHasPublishedSync(!!loadedSyncBody && Array.isArray(loadedSyncBody.lines) && loadedSyncBody.lines.length > 0);'));
	const submit = source.slice(source.indexOf('const handleSubmit ='), source.indexOf('// 싱크 데이터 내보내기'));
	assert.equal((submit.match(/setHasPublishedSync\(true\)/g) || []).length, 2);
	const revert = source.slice(source.indexOf('const handleRevertToPublished ='), source.indexOf('const handleSubmit ='));
	assert.ok(revert.includes('setHasPublishedSync(true);'));
});
