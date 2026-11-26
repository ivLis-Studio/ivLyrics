import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncCreatorImportPicker, exportSyncCreatorFile } from '#ivlyrics/features/sync/syncCreatorFileTransfer.mjs';
import { createSyncCreatorEditorLifetime } from '#ivlyrics/features/sync/syncCreatorEditorLifetime.mjs';
import { buildLrclibSyncSource } from '#ivlyrics/features/sync/syncCreatorLrclibLyrics.mjs';

function exportFixture({ requestTarget, writeFile, saveWork, isDraftCurrent } = {}) {
	const calls = [];
	const data = { version: 6, lines: [{ start: 0, end: 0, time: 2 }], source: { lrclibId: '22' } };
	const run = () => exportSyncCreatorFile({
		syncData: data, track: { title: 'A', artist: 'B', id: 'track-id' }, lyrics: { chars: ['A'], language: 'en' },
		timing: { materialize: value => value, attachSource: value => value, validate() {}, compact: value => value },
		files: {
			sanitizeFileName: name => name,
			async requestSaveFileTarget(name) {
				calls.push(['picker', name]);
				return requestTarget ? requestTarget() : { canceled: false };
			},
			async saveBlobAs(blob, name) {
				calls.push(['file', name, JSON.parse(await blob.text())]);
				await writeFile?.();
			},
		},
		saveWork(value) {
			calls.push(['work', structuredClone(value)]);
			return saveWork?.();
		},
		isDraftCurrent,
		toast: { success: message => calls.push(['success', message]), error: message => calls.push(['error', message]) },
		translate: key => key,
	});
	return { data, run, calls };
}

test('cancelling export or failing the file write does not checkpoint work', async t => {
	t.mock.method(console, 'error', () => {});
	const cancelled = exportFixture({ requestTarget: () => ({ canceled: true }) });
	await cancelled.run();
	assert.deepEqual(cancelled.calls, [['picker', 'A-B.json']]);

	const failed = exportFixture({ writeFile: () => { throw new Error('disk full'); } });
	await failed.run();
	assert.deepEqual(failed.calls.map(([step]) => step), ['picker', 'file', 'error']);
	assert.deepEqual(failed.calls.at(-1), ['error', 'disk full']);
});

test('the file follows the snapshot at click time, and a retired draft gets no checkpoint', async () => {
	const picker = Promise.withResolvers();
	let current = true;
	const h = exportFixture({ requestTarget: () => picker.promise, isDraftCurrent: () => current });
	const captured = structuredClone(h.data);
	const saving = h.run();
	h.data.lines[0].time = 4;
	h.data.source.lrclibId = '33';
	current = false;
	picker.resolve({ canceled: false });
	await saving;
	assert.deepEqual(h.calls, [
		['picker', 'A-B.json'], ['file', 'A-B.json', captured], ['success', 'syncCreator.exportSuccess'],
	]);
});

test('a saved export checkpoints the same snapshot, and checkpoint failure still reports success', async t => {
	t.mock.method(console, 'warn', () => {});
	const saved = Promise.withResolvers();
	const h = exportFixture({
		writeFile: () => saved.promise,
		saveWork: () => { throw new Error('work queue unavailable'); },
	});
	const captured = structuredClone(h.data);
	const exporting = h.run();
	h.data.lines[0].time = 9;
	saved.resolve();
	await exporting;
	assert.deepEqual(h.calls, [
		['picker', 'A-B.json'], ['file', 'A-B.json', captured], ['work', captured], ['success', 'syncCreator.exportSuccess'],
	]);
});

function fixture({ lifetime } = {}) {
	let open = true;
	let revision = 0;
	const inputs = [];
	const applied = [];
	const errors = [];
	const picker = createSyncCreatorImportPicker({
		isEditorOpen: () => open && (!lifetime || lifetime.canStartOperation()),
		captureDraftOwnership() {
			const captured = revision;
			const ownsDraft = () => revision === captured;
			return lifetime ? lifetime.captureOperation(ownsDraft) : ownsDraft;
		},
	});
	return {
		applied, errors,
		switchSource() { revision++; picker.cancel(); },
		close() { open = false; picker.cancel(); },
		choose(options = {}) {
			picker.open({
				createInput() {
					const input = { click() {} };
					inputs.push(input);
					return input;
				},
				lyricsText: 'old', currentSource: { lyricsChars: Array.from('old') },
				timing: { sanitize: data => data, validate() {} },
				applyImport(data, target) { target.activate?.(); applied.push(data); },
				toast: { success() {}, error: message => errors.push(message) },
				translate: key => key,
				...options,
			});
			const input = inputs.at(-1);
			const change = input.onchange;
			return text => change({ target: { files: [{ text }] } });
		},
	};
}

test('a newer file choice wins even when the previous file finishes reading last', async () => {
	const h = fixture();
	const read = Promise.withResolvers();
	const previous = h.choose()(() => read.promise);
	await h.choose()(async () => '{"lines":[],"name":"new"}');
	read.resolve('{"lines":[],"name":"old"}');
	await previous;
	assert.deepEqual(h.applied.map(data => data.name), ['new']);
	assert.deepEqual(h.errors, []);
});

test('an import started before closing cannot replace the draft after a failed close save', async () => {
	const lifetime = createSyncCreatorEditorLifetime(() => true);
	const h = fixture({ lifetime });
	const contents = Promise.withResolvers();
	const previous = h.choose()(() => contents.promise);
	await lifetime.requestClose({
		stopRecording() {}, saveDraft: async () => false,
		onSaveError() {}, onClosed: () => assert.fail('the unsaved draft must stay open'),
	});
	contents.resolve('{"lines":[],"name":"old"}');
	await previous;
	assert.deepEqual(h.applied, []);
	await h.choose()(async () => '{"lines":[],"name":"new"}');
	assert.deepEqual(h.applied.map(value => value.name), ['new']);
	assert.deepEqual(h.errors, []);
});

const file = JSON.stringify({
	lines: [],
	source: buildLrclibSyncSource({ id: 22, plainLyrics: 'new text', preferredLyricsSource: 'plain' }),
});

test('a draft change or closing the editor invalidates pending lyric preparation', async () => {
	for (const change of ['switchSource', 'close']) {
		const h = fixture();
		const started = Promise.withResolvers();
		const wait = Promise.withResolvers();
		let activated = false;
		const importing = h.choose({
			prepareLrclibSource(_source, isCurrent, signal) {
				started.resolve({ isCurrent, signal });
				return wait.promise;
			},
		})(async () => file);
		const { isCurrent, signal } = await started.promise;
		assert.equal(isCurrent(), true);
		h[change]();
		assert.equal(isCurrent(), false);
		assert.equal(signal.aborted, true);
		wait.resolve({ activate() { activated = true; } });
		await importing;
		assert.equal(activated, false);
		assert.deepEqual(h.applied, []);
		assert.deepEqual(h.errors, []);
	}
});

test('a file validated against its target lyrics can fail before changing the source', async context => {
	context.mock.method(console, 'error', () => {});
	const h = fixture();
	let activated = false;
	await h.choose({
		timing: {
			sanitize: (data, chars) => ({ ...data, chars }),
			validate(data) { if (data.chars) throw new Error('invalid for its target'); },
		},
		prepareLrclibSource: async () => ({
			lyricsChars: Array.from('new text'), activate() { activated = true; },
		}),
	})(async () => file);
	assert.equal(activated, false);
	assert.deepEqual(h.applied, []);
	assert.deepEqual(h.errors, ['syncCreator.importError: invalid for its target']);
});

test('other row lengths load and validate the file’s exact LRCLIB version before activation', async () => {
	const h = fixture();
	const source = buildLrclibSyncSource({ id: 22, plainLyrics: 'new text', preferredLyricsSource: 'plain' });
	const order = [];
	const chars = Array.from('new text');
	await h.choose({
		prepareLrclibSource: async (requested, isCurrent) => {
			assert.deepEqual(requested, source);
			assert.equal(isCurrent(), true);
			order.push('prepare');
			return { lyricsChars: chars, activate() { order.push('activate'); } };
		},
		timing: {
			sanitize: (data, targetChars) => ({ ...data, targetChars }),
			validate(data) { if (data.targetChars === chars) order.push('validate target'); },
		},
	})(async () => JSON.stringify({ version: 6, lines: [], source }));
	assert.deepEqual(order, ['prepare', 'validate target', 'activate']);
	assert.deepEqual(h.applied[0].targetChars, chars);
});

test('the same normalized lyrics import without reloading LRCLIB', async () => {
	const h = fixture();
	const source = buildLrclibSyncSource({ id: 22, plainLyrics: 'Café\n😀', preferredLyricsSource: 'plain' });
	await h.choose({
		lyricsText: ' Cafe\u0301 \n\n😀',
		prepareLrclibSource() { assert.fail('the current lyrics match the file'); },
	})(async () => JSON.stringify({ version: 6, lines: [], source }));
	assert.equal(h.applied.length, 1);
	assert.deepEqual(h.errors, []);
});

test('a replacement file import aborts the previous file’s LRCLIB lookup', async () => {
	const h = fixture();
	const started = Promise.withResolvers();
	const lookup = Promise.withResolvers();
	const previous = h.choose({
		prepareLrclibSource(_source, _isCurrent, signal) {
			started.resolve(signal);
			return lookup.promise;
		},
	})(async () => file);
	const signal = await started.promise;
	await h.choose()(async () => '{"lines":[],"name":"replacement"}');
	lookup.resolve({ lyricsChars: Array.from('new text') });
	await previous;

	assert.equal(signal?.aborted, true);
	assert.deepEqual(h.applied.map(value => value.name), ['replacement']);
	assert.deepEqual(h.errors, []);
});
