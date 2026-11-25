import assert from 'node:assert/strict';
import test from 'node:test';
import {
	SYNC_CREATOR_CHARACTER_PRONUNCIATION_CONSENT_KEY as consentKey,
	createSyncCreatorPronunciationConsent,
	useSyncCreatorCharacterPronunciation,
} from '#ivlyrics/features/sync/syncCreatorCharacterPronunciation.mjs';
import { useSyncCreatorFurigana } from '#ivlyrics/features/sync/syncCreatorFurigana.mjs';
import { renderSyncCreatorDialogs } from '#ivlyrics/features/sync/syncCreatorDialogs.mjs';

const notationKey = 'ivLyrics:syncCreator:pronunciation-target-mode';
const pronunciation = (text, reading = 'reading') => ({
	lines: [{ index: 0, chars: Array.from(text, (char, i) => ({ i, char, pronunciation: reading })) }],
});
const flushPromises = () => new Promise(setImmediate);
const deferred = () => {
	let resolve;
	const promise = new Promise(done => { resolve = done; });
	return { promise, resolve };
};

function createHookHost() {
	const slots = [];
	let cursor = 0;
	let effects = [];
	const slot = () => slots[cursor++] ??= {};
	const changed = (previous, next) => !previous || next.some((value, index) => !Object.is(value, previous[index]));
	const useMemo = (init, deps) => {
		const current = slot();
		if (changed(current.deps, deps)) {
			current.value = init();
			current.deps = deps;
		}
		return current.value;
	};
	const react = {
		Fragment: Symbol('Fragment'),
		createElement: (tag, props, ...children) => ({ tag, props, children }),
		useMemo,
		useCallback: (callback, deps) => useMemo(() => callback, deps),
		useRef: value => slot().ref ??= { current: value },
		useState(initial) {
			const current = slot();
			if (!current.set) {
				current.value = typeof initial === 'function' ? initial() : initial;
				current.set = next => {
					current.value = typeof next === 'function' ? next(current.value) : next;
				};
			}
			return [current.value, current.set];
		},
		useEffect(effect, deps) {
			const current = slot();
			if (!changed(current.deps, deps)) return;
			current.deps = deps;
			effects.push(() => {
				current.cleanup?.();
				current.cleanup = effect();
			});
		},
	};
	return {
		react,
		render(callback) {
			cursor = 0;
			effects = [];
			const state = callback();
			for (const effect of effects) effect();
			return state;
		},
		dispose() { for (const current of slots) current.cleanup?.(); },
	};
}

function createEditor({
	storage = new Map(), persistence, spicetifyStorage, localStorage, provider = true,
	readCache = async () => null, generate, writes = [],
} = {}) {
	const host = createHookHost();
	const requests = [], errors = [], successes = [], progress = [];
	const settingsStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
	const consentStore = createSyncCreatorPronunciationConsent({
		getPersistence: () => persistence,
		getSpotifyStorage: () => spicetifyStorage,
		getLocalStorage: () => localStorage ?? settingsStorage,
	});
	const manager = provider ? {
		async generateCharacterPronunciation(options) {
			requests.push(options);
			return generate ? generate(options) : pronunciation(options.lines[0]);
		},
	} : null;
	const args = {
		react: host.react,
		i18n: { t: key => key },
		toast: {
			error: value => errors.push(value),
			success: value => successes.push(value),
			warning() {},
			progress: (label, percent) => progress.push([label, percent]),
			dismissProgress: () => progress.push('dismiss'),
		},
		getAiManager: () => manager,
		getStorage: () => settingsStorage,
		getTranslationTargetLanguage: () => 'ko',
		consentStore,
		draftStore: {
			getCharacterPronunciationCache: readCache,
			setCharacterPronunciationCache: async (key, value) => writes.push({ key, value }),
		},
		track: { id: 'fixture-a', title: 'Fixture', artist: 'Artist', key: 'fixture-a' },
		lyricsLines: ['A'], lyricsLanguage: 'ja', lyricsFingerprint: 'A',
	};
	const render = () => host.render(() => useSyncCreatorCharacterPronunciation(args));
	const settle = async () => { await flushPromises(); return render(); };
	const dialog = () => {
		const state = render();
		return renderSyncCreatorDialogs({
			react: host.react, i18n: args.i18n, styles: {},
			bulkSpeaker: { open: false },
			pronunciationConsent: {
				open: state.showCharacterPronunciationConsent,
				onCancel: state.cancelCharacterPronunciationConsent,
				onConfirm: state.confirmCharacterPronunciationConsent,
			},
		}).children.at(-1);
	};
	const dialogButtons = () => dialog().children[0].children.at(-1).children;
	const api = {
		consentStore, requests, errors, successes, progress, storage, args, render, settle, dialog,
		get state() { return render(); },
		async toggle(options) {
			await render().handleCharacterPronunciationToggle(options);
			await settle();
		},
		cancel() { dialogButtons()[0].props.onClick(); },
		async confirm() { dialogButtons()[1].props.onClick(); await settle(); },
	};
	render();
	return api;
}

test('fresh generation asks before any AI request and cancel or backdrop does not accept', async () => {
	const h = createEditor();
	await h.toggle();
	assert.equal(h.state.showCharacterPronunciationConsent, true);
	assert.equal(h.requests.length, 0);
	h.cancel();
	assert.equal(h.consentStore.hasConsent(), false);
	assert.equal(h.storage.size, 0);
	await h.toggle();
	const dialog = h.dialog();
	dialog.props.onClick({ target: 1, currentTarget: 2 });
	assert.equal(h.state.showCharacterPronunciationConsent, true, 'dialog content keeps the warning open');
	dialog.props.onClick({ target: 1, currentTarget: 1 });
	assert.equal(h.state.showCharacterPronunciationConsent, false);
	assert.equal(h.consentStore.hasConsent(), false);
	await h.toggle();
	assert.equal(h.state.showCharacterPronunciationConsent, true);
	assert.equal(h.requests.length, 0);
});

test('confirmation persists across songs, remounts and forced regeneration', async () => {
	const h = createEditor();
	await h.toggle();
	await h.confirm();
	assert.equal(h.storage.get(consentKey), 'true');
	assert.equal(h.requests.length, 1);
	assert.equal(h.state.showCharacterPronunciationConsent, false);
	await h.toggle({ forceRegenerate: true });
	assert.equal(h.requests.length, 2);
	const reopened = createEditor({ storage: h.storage });
	reopened.args.track = { ...reopened.args.track, id: 'fixture-b', key: 'fixture-b' };
	await reopened.toggle();
	assert.equal(reopened.requests[0].trackId, 'fixture-b');
	assert.equal(reopened.state.showCharacterPronunciationConsent, false);
});

test('a forced request confirmed in the dialog bypasses cached pronunciation', async () => {
	let reads = 0;
	const h = createEditor({ readCache: async () => { reads++; return pronunciation('A', 'cached'); } });
	await h.settle();
	await h.toggle({ forceRegenerate: true });
	assert.equal(h.state.showCharacterPronunciationConsent, true);
	const beforeConfirm = reads;
	await h.confirm();
	assert.equal(h.requests.length, 1);
	assert.equal(reads, beforeConfirm);
	assert.equal(h.state.characterPronunciations.lines[0].chars[0].pronunciation, 'reading');
});

test('cached or previously displayed pronunciation toggles without warning or generating', async () => {
	const h = createEditor({ readCache: async () => pronunciation('A', 'cached') });
	await h.settle();
	assert.equal(h.state.showCharacterPronunciations, true);
	await h.toggle();
	assert.equal(h.state.showCharacterPronunciations, false);
	await h.toggle();
	assert.equal(h.state.showCharacterPronunciations, true);
	assert.equal(h.state.showCharacterPronunciationConsent, false);
	assert.equal(h.consentStore.hasConsent(), false);
	assert.equal(h.requests.length, 0);
});

test('empty lyrics or missing provider never opens consent or generates', async () => {
	const h = createEditor({ provider: false });
	await h.toggle();
	assert.equal(h.errors.length, 1);
	assert.equal(h.state.showCharacterPronunciationConsent, false);
	h.args.lyricsLines = [];
	await h.toggle();
	assert.equal(h.errors.length, 1);
});

test('consent from Research does not accept character-level generation costs', async () => {
	const h = createEditor({ storage: new Map([['ivLyrics:research-token-consent:v1', 'true']]) });
	await h.toggle();
	assert.equal(h.state.showCharacterPronunciationConsent, true);
	assert.equal(h.requests.length, 0);
});

test('blocked preferred storage falls back and remembers consent after remount', async () => {
	const map = new Map();
	const persistence = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
	const spicetifyStorage = { get: key => map.get(key), set: (key, value) => map.set(key, value) };
	const h = createEditor({ persistence, spicetifyStorage });
	await h.toggle();
	await h.confirm();
	assert.equal(map.get(consentKey), 'true');
	const reopened = createEditor({ persistence, spicetifyStorage });
	await reopened.toggle();
	assert.equal(reopened.requests.length, 1);
	assert.equal(reopened.state.showCharacterPronunciationConsent, false);
});

test('unavailable persistent storage still remembers the explicit choice for the session', async () => {
	const h = createEditor({ localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
	await h.toggle();
	await h.confirm();
	await h.toggle({ forceRegenerate: true });
	assert.equal(h.requests.length, 2);
	assert.equal(h.state.showCharacterPronunciationConsent, false);
});

test('late automatic cache results and generation progress cannot replace the new source', async () => {
	const cachedA = deferred();
	const generatedA = deferred();
	const writes = [];
	const h = createEditor({
		storage: new Map([[consentKey, 'true']]), writes,
		readCache: ({ trackKey }) => trackKey === 'fixture-a' ? cachedA.promise : Promise.resolve(pronunciation('B', 'cached B')),
		generate: () => generatedA.promise,
	});
	const running = h.state.handleCharacterPronunciationToggle({ forceRegenerate: true });
	assert.equal(h.state.isGeneratingCharacterPronunciations, true);
	h.requests[0].onProgress({ current: 2, total: 3, percent: 66 });
	assert.equal(h.state.characterPronunciationProgressInfo.percent, 66);
	h.args.track = { ...h.args.track, id: 'fixture-b', key: 'fixture-b' };
	h.args.lyricsLines = ['B'];
	h.args.lyricsFingerprint = 'B';
	h.render();
	await h.settle();
	const beforeLateProgress = h.progress.slice();
	h.requests[0].onProgress({ current: 3, total: 3, percent: 100 });
	cachedA.resolve(pronunciation('A', 'cached A'));
	generatedA.resolve(pronunciation('A', 'generated A'));
	await running;
	await h.settle();
	assert.equal(h.state.characterPronunciations.lines[0].chars[0].pronunciation, 'cached B');
	assert.equal(h.state.isGeneratingCharacterPronunciations, false);
	assert.deepEqual(h.progress, beforeLateProgress);
	assert.equal(h.progress.at(-1), 'dismiss');
	assert.deepEqual(writes, []);
});

test('changing notation restores the matching cache and sends the selected language when regenerating', async () => {
	const writes = [];
	const h = createEditor({
		storage: new Map([[consentKey, '1']]), writes,
		readCache: async ({ targetLang }) => pronunciation('A', targetLang),
	});
	await h.settle();
	assert.equal(h.state.characterPronunciations.lines[0].chars[0].pronunciation, 'en');
	h.state.handleCharacterPronunciationTargetModeChange('translation');
	h.render();
	await h.settle();
	assert.equal(h.storage.get(notationKey), 'translation');
	assert.equal(h.state.characterPronunciations.lines[0].chars[0].pronunciation, 'ko');
	await h.toggle({ forceRegenerate: true });
	assert.equal(h.requests[0].lang, 'ko');
	assert.equal(h.requests[0].sourceLang, 'ja');
	assert.deepEqual(writes[0].key, {
		trackKey: 'fixture-a', lyricsFingerprint: 'A', sourceLang: 'ja', targetLang: 'ko',
	});
});

test('furigana readiness refreshes both reading paths and cleans up the host listener', async () => {
	const browser = new EventTarget();
	const host = createHookHost();
	const dictionary = deferred();
	let loads = 0;
	let ready = false;
	const args = {
		browser, react: host.react, lyricsLanguage: 'ja', lyricsLines: ['漢字'],
		getConverter: () => converter,
		parseMapping: () => new Map([[0, 'かん'], [1, 'じ']]),
		renderRuby: ruby => ({ ruby }),
	};
	const markup = '<ruby>漢字<rt>かんじ</rt></ruby>';
	const converter = {
		init() { loads++; return dictionary.promise.then(() => { ready = true; }); },
		isAvailable: () => ready,
		convertToFurigana: text => ready ? markup : text,
	};
	const render = () => host.render(() => useSyncCreatorFurigana(args));
	const before = render();
	assert.equal(loads, 1);
	assert.equal(before.getSyncCreatorFuriganaMap('漢字').size, 0);
	assert.equal(before.getSyncCreatorFuriganaReact('漢字'), '漢字');
	dictionary.resolve();
	await flushPromises();
	const after = render();
	assert.equal(after.furiganaRevision, 1);
	assert.notEqual(after.getSyncCreatorFuriganaMap, before.getSyncCreatorFuriganaMap);
	assert.deepEqual([...after.getSyncCreatorFuriganaMap('漢字')], [[0, 'かん'], [1, 'じ']]);
	assert.deepEqual(after.getSyncCreatorFuriganaReact('漢字'), { ruby: markup });
	assert.equal(after.getSyncCreatorFuriganaReact('かな'), 'かな');
	browser.dispatchEvent(new Event('furigana-ready'));
	assert.equal(render().furiganaRevision, 2);
	host.dispose();
	browser.dispatchEvent(new Event('furigana-ready'));
	assert.equal(render().furiganaRevision, 2);
	assert.equal(loads, 1);
});
