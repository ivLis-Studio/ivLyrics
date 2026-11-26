import { createSettingsServices } from "#ivlyrics/spicetify/settingsServices.mjs";
import { createPageLocalLyrics } from "#ivlyrics/lyrics/pageLocalLyrics.mjs";
import { createLocalLyricsStore, LOCAL_LYRICS_STORAGE_KEY, LOCAL_LYRICS_UPDATED_EVENT } from "#ivlyrics/lyrics/localLyricsStore.mjs";
import { createToolbarLyricsProvider } from "#ivlyrics/app/toolbar/toolbarLyricsProvider.mjs";
import assert from "node:assert/strict";
import { createLyricsPageToolbar } from "#ivlyrics/lyrics/lyricsPageToolbar.mjs";
import test from "node:test";
import { createLocalCacheSettingsPanel } from "../src/features/settings/localCacheSettingsPanel.mjs";
import { createSettingsCacheActions } from "../src/features/settings/settingsCacheActions.mjs";
import { createSettingsCacheOperations } from "../src/features/settings/settingsCacheOperations.mjs";
import { pageLyricsMemoryCache, pageTranslationMemoryCache } from "../src/lyrics/pageMemoryCache.mjs";
import { trackIdentity } from "../src/core/trackIdentity.mjs";
import { parseLocalLyrics } from "../src/lyrics/lyricFileFormats.mjs";
import { createPageLyricsDataLoader } from "../src/lyrics/pageLyricsDataLoader.mjs";

const LOCAL_URI = "spotify:local:Artist:Album:Song:215";
const OTHER_URI = "spotify:local:Other:Album:Song:180";

const createStorage = (initial = {}) => {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key) => (values.has(key) ? values.get(key) : null),
		setItem: (key, value) => values.set(key, String(value)),
		read: (key) => JSON.parse(values.get(key) || "{}"),
	};
};

const createLyricsPage = ({
	confirmResult = true, savedUris = [LOCAL_URI, OTHER_URI], pseudoKaraoke = null,
	parseLocalLyrics, createFileInput, createFileReader,
} = {}) => {
	const entries = Object.fromEntries(savedUris.map((uri) => [uri, { synced: [{ text: "line", startTime: 0 }] }]));
	const storage = createStorage({ [LOCAL_LYRICS_STORAGE_KEY]: JSON.stringify(entries) });
	const events = [];
	const toasts = [];
	const reloads = [];
	const confirms = [];
	const snapshots = [];
	const lyricsCache = {};
	let playerItem = { uri: LOCAL_URI, duration: { milliseconds: 215000 } };
	let requestSeq = 0;
	const page = {
		state: { uri: null },
		currentTrackUri: LOCAL_URI,
		_isComponentMounted: true,
		setState(update, done) { Object.assign(this.state, typeof update === "function" ? update(this.state) : update); done?.(); },
		beginLyricsLoadRequest() { return ++requestSeq; },
		isCurrentLyricsState(state) { return state.uri === this.currentTrackUri && state.lyricsRequestSeq === requestSeq; },
		clearPendingLyricsUpdates() {},
		getText(_key, fallback) { return fallback; },
		async reloadLyrics(...args) { reloads.push(args); },
		getTranslationStates() { return {}; },
		applyTranslationStates() { return {}; },
		getCurrentMode() { return 1; },
		lyricsSource() {},
	};

	Object.assign(page, createPageLocalLyrics({
		page,
		store: createLocalLyricsStore({ readStorage: () => storage }),
		lyricsCache,
		translationCache: { clearByUri() {} },
		readPlayerItem: () => playerItem,
		isTrackCurrent: (uri) => page._isComponentMounted && uri === page.currentTrackUri && uri === playerItem.uri,
		readLyricsService: () => ({ clearLyricsSnapshot() {}, publishLyricsSnapshot: snapshot => snapshots.push(snapshot) }),
		readPseudoKaraoke: () => pseudoKaraoke,
		readAddonManager: () => null,
		parseLocalLyrics, createFileInput, createFileReader,
		toast: {
			success: (message) => toasts.push(["success", message]),
			error: (message) => toasts.push(["error", message]),
		},
		confirmAction: (message) => {
			confirms.push(message);
			return confirmResult;
		},
		onLocalLyricsUpdated: (detail) => events.push({ type: LOCAL_LYRICS_UPDATED_EVENT, detail }),
	}));
	const play = (uri, title) => {
		playerItem = { uri, duration: { milliseconds: 180000 } };
		page.currentTrackUri = uri;
		page.state = { ...page.state, uri, title };
		page.beginLyricsLoadRequest();
	};
	return { page, storage, events, toasts, reloads, confirms, snapshots, lyricsCache, play };
};

test("deleting local lyrics removes only the current track's saved lyrics and reloads", async () => {
	const { page, storage, events, toasts, reloads, confirms } = createLyricsPage();
	assert.equal(page.hasLocalLyricsForCurrentTrack(), true);

	assert.equal(await page.removeLocalLyricsForCurrentTrack(), true);

	const remaining = storage.read("ivLyrics:local-lyrics");
	assert.equal(remaining[LOCAL_URI], undefined, "current track lyrics must be deleted");
	assert.ok(remaining[OTHER_URI], "other tracks must keep their local lyrics");
	assert.equal(page.hasLocalLyricsForCurrentTrack(), false);
	assert.equal(confirms.length, 1, "deletion asks for confirmation");
	assert.deepEqual(reloads, [[true, LOCAL_URI]], "only the deleted track's cache is reloaded");
	assert.equal(events.length, 1);
	assert.equal(events[0].type, "ivLyrics:local-lyrics-updated");
	assert.deepEqual({ ...events[0].detail }, { trackUri: LOCAL_URI, deleted: true });
	assert.equal(toasts.at(-1)[0], "success");
});

test("cancelling the confirmation keeps the local lyrics", async () => {
	const { page, storage, reloads, events } = createLyricsPage({ confirmResult: false });
	assert.equal(await page.removeLocalLyricsForCurrentTrack(), false);
	assert.ok(storage.read("ivLyrics:local-lyrics")[LOCAL_URI]);
	assert.deepEqual(reloads, []);
	assert.deepEqual(events, []);
});

test("deleting saved lyrics invalidates a pending attempt to rebuild their timing", async () => {
	const { page, lyricsCache } = createLyricsPage();
	const timing = Promise.withResolvers();
	page.pageLyricsDataLoader = createPageLyricsDataLoader({
		cache: lyricsCache,
		getLyricsService: () => null,
		getPseudoKaraoke: () => ({ applyToResult: () => timing.promise }),
		isCacheCurrent: () => true,
	});
	const read = page.pageLyricsDataLoader.begin(LOCAL_URI).read({
		info: { uri: LOCAL_URI }, mode: -1, hasSpotifyTrackId: false,
		lyricsSaved: page.lyricsSaved, getSavedLocalLyrics: page.getSavedLocalLyrics,
		isCurrent: () => true, onTrackPrepared() {}, onProviderLoad() {},
	});
	page.deleteLocalLyrics(LOCAL_URI);
	timing.resolve();
	assert.equal(await read, null);
	assert.equal(lyricsCache[LOCAL_URI], undefined);
});

test("deleting reports when the track has no saved local lyrics", async () => {
	const { page, toasts, confirms } = createLyricsPage({ savedUris: [OTHER_URI] });
	assert.equal(await page.removeLocalLyricsForCurrentTrack(), false);
	assert.equal(confirms.length, 0);
	assert.equal(toasts.at(-1)[0], "error");
});

test("applying imported lyrics saves them with the source and announces the update", async () => {
	const { page, storage, events, toasts } = createLyricsPage({ savedUris: [OTHER_URI] });
	const synced = [{ text: "Imported line", startTime: 1250 }];
	assert.equal(await page.applyLocalLyrics({ synced }, { sourceLabel: "file" }), true);
	const saved = storage.read(LOCAL_LYRICS_STORAGE_KEY);
	assert.deepEqual(saved[LOCAL_URI].synced, synced);
	assert.equal(saved[LOCAL_URI].localLyricsSource, "file");
	assert.ok(saved[OTHER_URI]);
	assert.equal(page.state.lyricsStatus, "ready");
	assert.deepEqual(events, [{ type: LOCAL_LYRICS_UPDATED_EVENT, detail: { trackUri: LOCAL_URI } }]);
	assert.deepEqual(toasts, [["success", "Lyrics loaded: Synced"]]);
});

test("file picker preserves the chosen track through file reading and timing generation", async () => {
	const pendingTiming = Promise.withResolvers();
	let timingTrack;
	const input = { click() {} };
	const reader = { readAsText() {} };
	const fixture = createLyricsPage({
		createFileInput: () => input,
		createFileReader: () => reader,
		parseLocalLyrics: (text, duration) => parseLocalLyrics(text, () => duration),
		pseudoKaraoke: { applyToResult(_lyrics, track) { timingTrack = track; return pendingTiming.promise; } },
	});
	const { page, storage, snapshots, play } = fixture;
	page.state.title = "Original";
	page.importLocalLyricsFile();
	play(OTHER_URI, "Next");
	input.onchange({ target: { files: [{ size: 100 }] } });
	const imported = reader.onload({ target: { result: "[00:01.00]Imported<00:02.00> lyric" } });
	await Promise.resolve();
	assert.deepEqual(timingTrack, { uri: LOCAL_URI, duration: 215000 });
	pendingTiming.resolve();
	await imported;
	assert.equal(page.state.uri, OTHER_URI);
	assert.equal(page.state.title, "Next");
	assert.equal(page.state.lyricsStatus, undefined);
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI].synced[0].text, "Imported lyric");
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI].karaoke[0].text.at(-1).time, 213000);
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[OTHER_URI].synced[0].text, "line");
	assert.equal(snapshots[0].trackInfo.title, "Original");
});

test("an import completed after the page closes cannot write a saved lyric or publish a snapshot", async () => {
	const timing = Promise.withResolvers();
	const { page, storage, events, snapshots } = createLyricsPage({
		savedUris: [],
		pseudoKaraoke: { applyToResult: () => timing.promise },
	});
	const importing = page.applyLocalLyrics({ synced: [{ text: "Deferred" }] });
	page._isComponentMounted = false;
	timing.resolve();
	assert.equal(await importing, false);
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI], undefined);
	assert.deepEqual(events, []);
	assert.deepEqual(snapshots, []);
});

test("a later import for the same track wins even if timing for the first import finishes last", async () => {
	const timings = [];
	const { page, storage, snapshots, lyricsCache } = createLyricsPage({
		pseudoKaraoke: { applyToResult() {
			const timing = Promise.withResolvers();
			timings.push(timing);
			return timing.promise;
		} },
	});
	const active = page.applyLocalLyrics({ synced: [{ text: "Earlier" }] });
	await Promise.resolve();
	const latest = page.applyLocalLyrics({ synced: [{ text: "Latest" }] });
	await Promise.resolve();
	timings[1].resolve();
	assert.equal(await latest, true);
	timings[0].resolve();
	assert.equal(await active, false);
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI].synced[0].text, "Latest");
	assert.equal(lyricsCache[LOCAL_URI].synced[0].text, "Latest");
	assert.equal(snapshots.length, 1);
});

test("an LRCLIB result remains tied to the track used to open its search", async () => {
	const { page, storage, play } = createLyricsPage({
		parseLocalLyrics: text => ({ synced: [{ text }] }),
	});
	const searchTrack = { uri: LOCAL_URI, title: "Original", duration: 215000 };
	play(OTHER_URI, "Next");
	await page.applyLocalLyricsFromLrclibCandidate({ plainLyrics: "LRCLIB lyric" }, {
		source: "lrclib-local-search",
		track: searchTrack,
	});
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI].synced[0].text, "LRCLIB lyric");
	assert.equal(page.state.uri, OTHER_URI);
	assert.equal(page.state.title, "Next");
});

test("a slow file read cannot overwrite a file chosen later", async () => {
	const readers = [];
	const lateHandlers = [];
	let aborted = 0;
	const { page, storage, snapshots } = createLyricsPage({
		parseLocalLyrics: text => ({ synced: [{ text }] }),
		createFileReader() {
			const reader = { readAsText() { this.readyState = 1; }, abort() { aborted++; this.readyState = 2; } };
			readers.push(reader);
			return reader;
		},
	});
	for (let count = 0; count < 2; count++) {
		page.processLyricsFromFile({ target: { files: [{ size: 100 }] } });
		lateHandlers.push(readers[count].onload);
	}
	assert.equal(aborted, 1);
	await lateHandlers[1]({ target: { result: "Second file" } });
	await lateHandlers[0]({ target: { result: "First file" } });
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI].synced[0].text, "Second file");
	assert.equal(snapshots.length, 1);
});

test("deleting saved lyrics also retires an open file picker for that track", async () => {
	const input = { click() {} };
	const reader = { readAsText() {} };
	const { page, storage, snapshots } = createLyricsPage({
		createFileInput: () => input, createFileReader: () => reader,
		parseLocalLyrics: text => ({ synced: [{ text }] }),
	});
	page.importLocalLyricsFile(LOCAL_URI);
	const choose = input.onchange;
	await page.removeLocalLyricsForCurrentTrack({ trackUri: LOCAL_URI, confirm: false });
	choose({ target: { files: [{ size: 50 }] } });
	await reader.onload?.({ target: { result: "Would restore removed lyrics" } });
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI], undefined);
	assert.deepEqual(snapshots, []);
});

test("a later LRCLIB import retires an older still-open file picker", async () => {
	const input = { click() {} };
	const reader = { readAsText() {} };
	const { page, storage, snapshots } = createLyricsPage({
		createFileInput: () => input, createFileReader: () => reader,
		parseLocalLyrics: text => ({ synced: [{ text }] }),
	});
	page.importLocalLyricsFile(LOCAL_URI);
	const choose = input.onchange;
	await page.applyLocalLyricsFromLrclibCandidate({ plainLyrics: "Latest import" });
	choose({ target: { files: [{ size: 50 }] } });
	await reader.onload?.({ target: { result: "Older file picker" } });
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI].synced[0].text, "Latest import");
	assert.equal(snapshots.length, 1);
});

test("a retired local lyrics menu cannot launch a picker or delete the next song's lyrics", async () => {
	let pickers = 0;
	const { page, storage, confirms, play } = createLyricsPage({
		createFileInput: () => ({ click() { pickers++; } }),
	});
	play(OTHER_URI, "Next");
	page.importLocalLyricsFile(LOCAL_URI);
	assert.equal(await page.removeLocalLyricsForCurrentTrack({ trackUri: LOCAL_URI }), false);
	assert.equal(pickers, 0);
	assert.equal(confirms.length, 0);
	assert.ok(storage.read(LOCAL_LYRICS_STORAGE_KEY)[OTHER_URI]);
});

test("closing a local search retires timing work before it can save the candidate", async () => {
	const timing = Promise.withResolvers();
	const controller = new AbortController();
	const { page, storage, snapshots } = createLyricsPage({
		parseLocalLyrics: text => ({ synced: [{ text }] }),
		pseudoKaraoke: { applyToResult: () => timing.promise },
	});
	const pending = page.applyLocalLyricsFromLrclibCandidate({ plainLyrics: "Retired search result" }, {
		track: { uri: LOCAL_URI }, signal: controller.signal,
	});
	await Promise.resolve();
	controller.abort();
	timing.resolve();
	assert.equal(await pending, false);
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI].synced[0].text, "line");
	assert.deepEqual(snapshots, []);
});

test("a remount rejects a previous picker selection, file read and timing result", async () => {
	const timing = Promise.withResolvers();
	const input = { click() {} };
	const readers = [];
	const { page, storage, snapshots, toasts, play } = createLyricsPage({
		savedUris: [],
		createFileInput: () => input,
		createFileReader() {
			const reader = { readAsText() {} };
			readers.push(reader);
			return reader;
		},
		parseLocalLyrics: text => ({ synced: [{ text }] }),
		pseudoKaraoke: { applyToResult: () => timing.promise },
	});
	const importing = page.applyLocalLyrics({ synced: [{ text: "Deferred timing" }] });
	play(OTHER_URI, "Next");
	const fileEvent = () => ({ target: { files: [{ size: 100 }] } });
	page.processLyricsFromFile(fileEvent(), { uri: LOCAL_URI });
	const lateFileRead = readers[0].onload;
	page.importLocalLyricsFile();
	const latePicker = input.onchange;

	page._isComponentMounted = false;
	page.cancelPendingLocalLyricsImports();
	page._isComponentMounted = true;
	latePicker(fileEvent());
	assert.equal(readers.length, 1);
	await lateFileRead({ target: { result: "Deferred file" } });
	timing.resolve();
	assert.equal(await importing, false);
	assert.deepEqual(storage.read(LOCAL_LYRICS_STORAGE_KEY), {});
	assert.deepEqual(snapshots, []);
	assert.deepEqual(toasts, []);

	page.importLocalLyricsFile();
	input.onchange(fileEvent());
	await readers[1].onload({ target: { result: "New selection" } });
	assert.equal(storage.read(LOCAL_LYRICS_STORAGE_KEY)[OTHER_URI].synced[0].text, "New selection");
});

test("local lyrics menu offers deletion only when the track has saved lyrics", () => {
	const { buildLyricsProviderView } = createToolbarLyricsProvider({
		react: { memo: component => component },
		readProviders: () => [],
		getOptionsText: (_key, fallback) => fallback,
		translate: key => key,
	});
	const calls = [];
	const view = hasLocalLyrics => buildLyricsProviderView({
		isLocalTrack: true,
		getHasLocalLyrics: () => hasLocalLyrics,
		closeModal: () => calls.push("close"),
		onDeleteLocalLyrics: () => calls.push("delete"),
	});
	const deleteRow = model => model.groups.flat().find(row => row.key === "local-lyrics-delete");
	assert.equal(deleteRow(view(false)), undefined);
	assert.equal(deleteRow(view(true)).danger, true);
	deleteRow(view(true)).onClick();
	assert.deepEqual(calls, ["close", "delete"]);
	const page = {
		hasLocalLyricsForCurrentTrack: () => true,
		removeLocalLyricsForCurrentTrack: () => calls.push("remove from track"),
	};
	const { actions } = createLyricsPageToolbar({ page, modes: {} });
	assert.equal(actions.getHasLocalLyrics, page.hasLocalLyricsForCurrentTrack);
	assert.equal(actions.onDeleteLocalLyrics, page.removeLocalLyricsForCurrentTrack);
});

test("settings clear the local-uri cache and delete saved lyrics only after a successful clear and confirmation", async context => {
	context.mock.method(console, "error", () => {});
	const storage = createStorage({
		"ivLyrics:local-lyrics": JSON.stringify({ [LOCAL_URI]: { synced: [] }, [OTHER_URI]: { synced: [] } }),
	});
	const calls = [];
	let confirmed = false;
	let failClear = false;
	let pendingTrackClear;
	const host = {
		LyricsCache: {
			getStats: async () => ({ lyrics: 1 }),
			async clearTrack(id) {
				calls.push(["clear", id]);
				if (pendingTrackClear) await pendingTrackClear.promise;
				return !failClear;
			},
			async clearAll() {
				calls.push(["clearAll"]);
				return !failClear;
			},
		},
		LyricsService: {
			clearLyricsSnapshot: (uri) => calls.push(["snapshot", uri]),
		},
		SyncDataService: {
			clearCache: (id, options) => calls.push(["sync", id, options]),
		},
	};
	const cache = createSettingsCacheActions({
		storage,
		services: createSettingsServices(host),
		getLyricsPage: () => null,
		onLocalLyricsDeleted: (uri) => calls.push(["deleted", uri]),
	});
	const Panel = createLocalCacheSettingsPanel({
		react: {
			useState: (initial) => [{ ...initial(), stats: { sync: 1, tmi: 1 } }, () => {}],
			useEffect() {},
			createElement: (type, props, ...children) => ({ type, props, children }),
		},
		cache,
		readLanguage: () => "en",
		readTrackUri: () => LOCAL_URI,
		extractTrackId: trackIdentity.extractTrackId,
		getTranslationCacheId: trackIdentity.getTranslationCacheId,
		getSettingsText: (key) => key,
		translate: (key) => key,
		confirm: (message) => {
			calls.push(["confirm", message]);
			return confirmed;
		},
		reloadLyrics: (...args) => calls.push(["reload", ...args]),
		notifySuccess: (message) => calls.push(["success", message]),
		notifyError: (message) => calls.push(["error", message]),
	});
	function* walk(node) {
		if (!node || typeof node !== "object") return;
		yield node;
		for (const child of node.children || []) yield* walk(child);
	}
	const elements = [...walk(Panel())];
	const button = elements.find((node) => node.type === "button"
		&& node.children.includes("settingsAdvanced.cacheManagement.localCache.clearCurrent"));
	assert.ok(button);

	for (const uri of [LOCAL_URI, OTHER_URI]) {
		pageLyricsMemoryCache[uri] = { provider: "local" };
		pageTranslationMemoryCache.set(`${uri}:translation`, ["translated"]);
	}
	const cacheId = `local-uri:${LOCAL_URI}`;
	await button.props.onClick();
	assert.deepEqual(calls, [
		["confirm", "menu.localLyricsDeleteConfirm"], ["snapshot", LOCAL_URI], ["sync", cacheId, { preserveOpenDb: true }],
		["clear", cacheId], ["reload", false, LOCAL_URI], ["success", "notifications.localCacheTrackCleared"],
	]);
	assert.equal(cache.hasSavedLocalLyrics(LOCAL_URI), true);
	assert.equal(pageLyricsMemoryCache[LOCAL_URI], undefined);
	assert.equal(pageTranslationMemoryCache.get(`${LOCAL_URI}:translation`), null);
	assert.ok(pageLyricsMemoryCache[OTHER_URI]);
	assert.ok(pageTranslationMemoryCache.get(`${OTHER_URI}:translation`));

	confirmed = true;
	calls.length = 0;
	failClear = true;
	await button.props.onClick();
	assert.deepEqual(calls, [
		["confirm", "menu.localLyricsDeleteConfirm"], ["snapshot", LOCAL_URI],
		["sync", cacheId, { preserveOpenDb: true }], ["clear", cacheId], ["error", "messages.error"],
	]);
	assert.equal(cache.hasSavedLocalLyrics(LOCAL_URI), true);

	const allButton = elements.find((node) => node.type === "button"
		&& node.children.includes("settingsAdvanced.cacheManagement.localCache.clearAll"));
	assert.equal(allButton.props.disabled, false);
	calls.length = 0;
	await allButton.props.onClick();
	assert.deepEqual(calls, [
		["snapshot", undefined], ["sync", undefined, { preserveOpenDb: true }], ["clearAll"], ["error", "messages.error"],
	]);

	failClear = false;
	calls.length = 0;
	pendingTrackClear = Promise.withResolvers();
	const previousClear = button.props.onClick();
	const newLyrics = { synced: [{ text: "Imported during the cache clear" }] };
	storage.setItem(LOCAL_LYRICS_STORAGE_KEY, JSON.stringify({
		...storage.read(LOCAL_LYRICS_STORAGE_KEY),
		[LOCAL_URI]: newLyrics,
	}));
	pendingTrackClear.resolve();
	await previousClear;
	assert.deepEqual(storage.read(LOCAL_LYRICS_STORAGE_KEY)[LOCAL_URI], newLyrics);
	assert.deepEqual(calls.slice(-2), [["reload", false, LOCAL_URI], ["success", "notifications.localCacheTrackCleared"]]);
	assert.ok(!calls.some(([name]) => name === "deleted"));
	pendingTrackClear = null;

	calls.length = 0;
	await button.props.onClick();
	assert.deepEqual(calls, [
		["confirm", "menu.localLyricsDeleteConfirm"], ["snapshot", LOCAL_URI],
		["sync", cacheId, { preserveOpenDb: true }], ["clear", cacheId], ["snapshot", LOCAL_URI],
		["deleted", LOCAL_URI], ["reload", false, LOCAL_URI],
		["success", "notifications.localLyricsDeleted"],
	]);
	assert.equal(cache.hasSavedLocalLyrics(LOCAL_URI), false);
	assert.equal(cache.hasSavedLocalLyrics(OTHER_URI), true);
	await cache.clearAll();
	assert.equal(cache.hasSavedLocalLyrics(OTHER_URI), true);
	assert.equal(pageLyricsMemoryCache[OTHER_URI], undefined);
	assert.equal(pageTranslationMemoryCache.get(`${OTHER_URI}:translation`), null);
});

test("settings deletion invalidates lyrics warmed during the disk clear after the page closes", async context => {
	const uri = "spotify:local:Artist:Album:Pending delete:188";
	const diskClear = Promise.withResolvers();
	const saved = { provider: "local", synced: [{ text: "Previously imported" }] };
	const storage = createStorage({ [LOCAL_LYRICS_STORAGE_KEY]: JSON.stringify({ [uri]: saved }) });
	const snapshots = new Map([[uri, saved]]);
	const cache = createSettingsCacheActions({
		storage,
		services: {
			getLyricsService: () => ({ clearLyricsSnapshot: key => snapshots.delete(key) }),
			getLyricsCache: () => ({ clearTrack: () => diskClear.promise }),
			getSyncDataService: () => null,
			getTranslator: () => null,
		},
		getLyricsPage: () => null,
		onLocalLyricsDeleted: () => {},
	});
	context.after(() => {
		delete pageLyricsMemoryCache[uri];
		pageTranslationMemoryCache.clearByUri(uri);
	});
	const clearing = cache.clearTrack(uri, `local-uri:${uri}`, true);
	assert.equal(snapshots.has(uri), false);
	pageLyricsMemoryCache[uri] = saved;
	pageTranslationMemoryCache.set(`${uri}:translation`, ["Previously translated"]);
	snapshots.set(uri, saved);
	diskClear.resolve(true);
	assert.equal(await clearing, true);
	assert.equal(cache.hasSavedLocalLyrics(uri), false);
	assert.equal(pageLyricsMemoryCache[uri], undefined);
	assert.equal(pageTranslationMemoryCache.get(`${uri}:translation`), null);
	assert.equal(snapshots.has(uri), false);
});

test("settings cache ignores stale counts and overlapping clears across tab remounts", async () => {
	const firstRead = Promise.withResolvers();
	const diskClear = Promise.withResolvers();
	let effect;
	let snapshot;
	let trackUri = LOCAL_URI;
	let countReads = 0;
	const calls = [];
	const Panel = createLocalCacheSettingsPanel({
		react: {
			useState: (initial) => [snapshot ??= typeof initial === "function" ? initial() : initial,
				(value) => { snapshot = value; }],
			useEffect: (setup) => { effect = setup; },
			createElement: (type, props, ...children) => ({ type, props, children }),
		},
		cache: {
			getStats: () => ++countReads === 1 ? firstRead.promise : { lyrics: 0 },
			getOpenDbInfo: () => null,
			hasSavedLocalLyrics: () => true,
			clearTrack(uri, id) {
				calls.push(["clearTrack", uri, id]);
				return diskClear.promise;
			},
			clearAll: () => calls.push(["clearAll"]),
		},
		readLanguage: () => "en",
		readTrackUri: () => trackUri,
		extractTrackId: trackIdentity.extractTrackId,
		getTranslationCacheId: trackIdentity.getTranslationCacheId,
		getSettingsText: (key) => key,
		translate: (key) => key.endsWith(".stats") ? "Lyrics: {lyrics}" : key,
		confirm: () => (calls.push(["confirm"]), false),
		reloadLyrics: (...args) => calls.push(["reload", ...args]),
		notifySuccess: () => calls.push(["success"]),
	});
	const getLocalCacheRow = () => Panel().children[0].children[0];
	const getButtons = () => getLocalCacheRow().children[1].children;
	const [clearTrack, clearAll] = getButtons();
	const unmount = effect();
	const clearing = clearTrack.props.onClick();
	trackUri = OTHER_URI;
	const duplicateClear = clearTrack.props.onClick();
	const conflictingClear = clearAll.props.onClick();
	assert.deepEqual(calls, [["confirm"], ["clearTrack", LOCAL_URI, `local-uri:${LOCAL_URI}`]]);
	unmount();
	snapshot = undefined;
	getLocalCacheRow();
	const unmountSecond = effect();
	assert.deepEqual(getButtons().map(button => button.props.disabled), [true, true]);
	diskClear.resolve(false);
	await Promise.all([clearing, duplicateClear, conflictingClear]);
	firstRead.resolve({ lyrics: 99 });
	await firstRead.promise;
	assert.equal(getLocalCacheRow().children[0].children[2].children[0], "Lyrics: 0");
	assert.deepEqual(calls.slice(-2), [["reload", false, LOCAL_URI], ["success"]]);
	unmountSecond();
});

test("settings cache invalidates the mounted lyric loader before the disk clear", async () => {
	const calls = [];
	const page = {
		pageLyricsDataLoader: {
			cancelForUri: (uri) => calls.push(["cancel", uri]),
			cancelPending: () => calls.push(["cancelAll"]),
		},
	};
	const cache = createSettingsCacheActions({
		storage: createStorage(),
		services: {
			getLyricsService: () => null,
			getLyricsCache: () => ({
				clearTrack: (id) => calls.push(["disk", id]),
				clearAll: () => calls.push(["diskAll"]),
			}),
			getSyncDataService: () => null,
			getTranslator: () => null,
		},
		getLyricsPage: () => page,
	});
	await cache.clearTrack(LOCAL_URI, `local-uri:${LOCAL_URI}`, false);
	await cache.clearAll();
	assert.deepEqual(calls, [["cancel", LOCAL_URI], ["disk", `local-uri:${LOCAL_URI}`], ["cancelAll"], ["diskAll"]]);
});

test("OpenDB status stays current when an older local cache count finishes", async () => {
	const read = Promise.withResolvers();
	const refresh = Promise.withResolvers();
	const previousInfo = { available: true, dataVersionAt: "2026-11-24" };
	const refreshedInfo = { available: true, dataVersionAt: "2026-11-25" };
	const calls = [];
	const operations = createSettingsCacheOperations({
		cache: {
			getStats: () => read.promise,
			getOpenDbInfo: () => previousInfo,
			getOpenDbRefresh: () => () => {
				calls.push("refresh");
				return refresh.promise;
			},
		},
		getSettingsText: (key) => key,
		notifySuccess: () => calls.push("success"),
	});
	const reading = operations.loadStats();
	const updating = operations.refreshOpenDb();
	await operations.refreshOpenDb();
	assert.equal(operations.getSnapshot().openDbUpdating, true);
	refresh.resolve(refreshedInfo);
	await updating;
	read.resolve({ lyrics: 1 });
	await reading;
	assert.equal(operations.getSnapshot().openDbInfo, refreshedInfo);
	assert.deepEqual(operations.getSnapshot().stats, { lyrics: 1 });
	assert.deepEqual(calls, ["refresh", "success"]);
});
