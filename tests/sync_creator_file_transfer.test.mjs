import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncCreatorImportPicker } from '#ivlyrics/features/sync/syncCreatorFileTransfer.mjs';
import { createSyncCreatorEditorLifetime } from '#ivlyrics/features/sync/syncCreatorEditorLifetime.mjs';
import { buildLrclibSyncSource } from '#ivlyrics/features/sync/syncCreatorLrclibLyrics.mjs';

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
