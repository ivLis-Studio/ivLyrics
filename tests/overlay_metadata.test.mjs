import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const fullscreenSource = readFileSync(new URL('../FullscreenOverlay.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const section = (text, from, to) => {
	const start = text.indexOf(from), end = text.indexOf(to, start + from.length);
	assert.ok(start >= 0 && end > start, `missing production section: ${from}`);
	return text.slice(start, end);
};
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
	if (value && typeof value === 'object') {
		Object.values(value).forEach(freeze);
		Object.freeze(value);
	}
	return value;
};
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => {
	let resolve;
	const promise = new Promise(done => { resolve = done; });
	return { promise, resolve };
};
const trimKey = 'ivLyrics:overlay-trim-metadata';
const uri = 'spotify:track:current';
const track = () => ({ uri, title: 'Song (feat. Guest) [Live] - 2020 Remaster', artist: 'Artist (Band) [Guest] - Live' });
const lyrics = () => [{ startTime: 1000, endTime: 2000, text: 'Original lyric', phoneticText: 'Pronunciation', text2: 'Translation',
	syllables: [{ startTime: 1000, endTime: 2000, text: 'Original lyric' }] }];
const presentation = freeze({ provider: 'fixture', displayMode1: 'romaji', displayMode2: 'translated' });

// Use the shipping sender, queue, mapping and worker callback. Only browser
// surfaces, timers and HTTP responses are controlled, as in lifecycle tests.
function load({ persisted = false, initialValues = [] } = {}) {
	const values = new Map(initialValues), timers = new Map(), workers = [], requests = [];
	let nextId = 0;
	let transport = () => ({ ok: true, text: async () => '' });
	const surface = () => {
		const listeners = new Map();
		return {
			addEventListener(type, fn) { const set = listeners.get(type) || new Set(); set.add(fn); listeners.set(type, set); },
			removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
			dispatchEvent(event) { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); },
		};
	};
	const window = surface(), document = surface(), player = surface();
	document.visibilityState = 'visible';
	document.getElementById = () => null;
	window.CONFIG = { visual: { delay: 0, 'fullscreen-hide-overlay': false, 'fullscreen-trim-title': false } };
	const metadata = freeze({ title: track().title, artist_name: track().artist, album_title: 'Album (Original)', image_url: 'spotify:image:cover' });
	player.data = { item: { uri, name: track().title, metadata } };
	player.getDuration = () => 180000;
	player.isPlaying = () => false;
	const queueMetadata = freeze({ title: 'Next (Live) - Bonus', artist_name: 'Next Artist [Guest]', image_url: 'spotify:image:next' });
	const queue = { nextTracks: [{ contextTrack: { metadata: queueMetadata } }] };
	if (persisted) window.ivLyricsStoragePersistence = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
	const schedule = (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id; };
	const context = vm.createContext({
		window, document, Blob, URL: { createObjectURL: () => 'blob:worker', revokeObjectURL() {} },
		Worker: class { constructor() { workers.push(this); } postMessage() {} terminate() { this.terminated = true; } },
		Spicetify: { Player: player, Queue: queue, LocalStorage: { get: key => values.get(key), set: (key, value) => values.set(key, value) } },
		CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
		setTimeout: schedule, setInterval: schedule, clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
		Utils: {
			getPlayerPlaybackSnapshot: () => ({ uri: player.data.item.uri, position: 1250, duration: 180000 }),
			resolveStablePlaybackTrack: () => player.data.item,
		},
		helperDebug: () => {},
		console: { error() {}, warn() {}, log() {} },
		getOverlayProgressIsPlaying: () => player.isPlaying(),
		AbortSignal: { timeout: ms => ({ timeout: ms }) },
		fetch: (url, options) => {
			const request = { url, endpoint: new URL(url).pathname, port: new URL(url).port, payload: JSON.parse(options.body) };
			requests.push(request);
			return Promise.resolve(transport(request));
		},
	});
	vm.runInContext([
		section(source, '    const getLyricsTextCacheHash =', '    const isCachedTranslationStructurallyValid ='),
		section(source, '    const cleanupWorker =', '    serviceDebug("[LyricsService] Initializing'),
		section(source, '    const resolveSpotifyImageUrl =', '    // 전역 요청 상태 관리'),
		section(source, '    const scheduleSenderBootstrap =', '    window.LyricsService = LyricsService;'),
		'globalThis.senders = [OverlaySender, lyricsHelperSender];',
		section(fullscreenSource, '    const trimTitle =', '    const isUnknownTrackMetadata ='),
		'globalThis.fullscreenTrim = trimTitle;',
	].join('\n'), context);
	const [overlay, helper] = context.senders;
	window.OverlaySender = overlay;
	window.lyricsHelperSender = helper;
	overlay.init();
	helper.init();
	return {
		overlay, helper, context, window, player, values, workers, requests, timers, metadata, queueMetadata,
		setTransport: fn => { transport = fn; },
		packets: (endpoint = '/lyrics') => requests.filter(request => request.endpoint === endpoint),
		runTimer: ms => {
			const entry = [...timers].find(([, timer]) => timer.ms === ms);
			assert.ok(entry, `expected a ${ms}ms timer`);
			timers.delete(entry[0]);
			entry[1].fn();
		},
		dispose: () => { overlay.destroy(); helper.destroy(); },
	};
}

test('overlay metadata simplification is off by default and independent of fullscreen preferences', async () => {
	for (const fullscreen of [false, true]) {
		const h = load({ initialValues: [['ivLyrics:visual:fullscreen-trim-title', String(fullscreen)]] });
		h.window.CONFIG.visual['fullscreen-trim-title'] = fullscreen;
		assert.equal(h.overlay.trimMetadata, false);
		await h.overlay.sendLyrics(track(), lyrics());
		assert.equal(h.packets()[0].payload.track.title, track().title);
		assert.equal(h.packets()[0].payload.track.artist, track().artist);
		assert.equal(h.values.has(trimKey), false);
		h.dispose();
	}
});

test('persisted setting uses its own key through both storage adapters and survives sender reload', async () => {
	for (const persisted of [false, true]) {
		const h = load({ persisted });
		h.overlay.trimMetadata = true;
		assert.equal(h.values.get(trimKey), 'true');
		assert.equal(h.values.has('ivLyrics:visual:fullscreen-trim-title'), false);
		const reopened = load({ persisted, initialValues: [...h.values] });
		assert.equal(reopened.overlay.trimMetadata, true);
		await reopened.overlay.sendLyrics(track(), lyrics());
		assert.equal(reopened.packets()[0].payload.track.title, 'Song');
		reopened.overlay.trimMetadata = false;
		await flush();
		assert.equal(reopened.values.get(trimKey), 'false');
		assert.equal(reopened.packets().at(-1).payload.track.title, track().title);
		h.dispose(); reopened.dispose();
	}
});

test('formatter produces exactly the existing fullscreen result including empty-result fallback', () => {
	const h = load({ initialValues: [[trimKey, 'true']] });
	for (const text of [
		'Song (Live) [Remaster] - Bonus', '(Entire Title)', '[Entire Artist]', ' AC/DC ',
		'A-B', 'A - B - C', 'A (B) C (D)', 'Song (Unclosed', '가수 (밴드)', 'أغنية [Live]',
		'曲（ライブ）', 'Title () []', '  ', '',
	]) assert.equal(h.overlay.formatMetadataText(text), h.context.fullscreenTrim(text), text);
	assert.equal(h.window.CONFIG.visual['fullscreen-trim-title'], false);
	h.dispose();
});

test('toggle immediately resends current lyrics and toggling off restores frozen source metadata', async () => {
	const h = load(), originalTrack = freeze(track()), originalLyrics = freeze(lyrics());
	const before = clone({ originalTrack, originalLyrics });
	h.overlay._offsetCache = { [uri]: 125 };
	const offsetCache = h.overlay._offsetCache;
	await h.overlay.sendLyrics(originalTrack, originalLyrics, false, 'normal', presentation);
	h.overlay.trimMetadata = true;
	await flush();
	assert.equal(h.packets().at(-1).payload.track.title, 'Song');
	assert.equal(h.packets().at(-1).payload.track.artist, 'Artist');
	h.overlay.trimMetadata = false;
	await flush();
	assert.deepEqual(h.packets().map(request => request.payload.track.title), [track().title, 'Song', track().title]);
	assert.ok(h.packets().every(request => request.payload.track.album === 'Album (Original)'));
	assert.deepEqual(h.packets().map(request => request.payload.lyrics), Array(3).fill(h.packets()[0].payload.lyrics));
	assert.equal(h.overlay._lastTrackInfo, originalTrack);
	assert.equal(h.overlay._lastPresentationContext, presentation);
	assert.equal(h.overlay._offsetCache, offsetCache);
	assert.deepEqual(clone({ originalTrack, originalLyrics }), before);
	h.dispose();
});

test('translated display metadata is trimmed without mutating a shared source, helper or translation cache', async () => {
	const h = load(), originalLyrics = freeze(lyrics());
	const translated = freeze({ translated: { title: '번역 제목 (Live) - Bonus', artist: '번역 가수 [Band]' }, romanized: { title: 'Romanized (Live)' } });
	const originalTrack = freeze({ ...track(), translatedMetadata: translated });
	const before = clone(originalTrack);
	await Promise.all([h.overlay.sendLyrics(originalTrack, originalLyrics), h.helper.sendLyrics(originalTrack, originalLyrics)]);
	h.overlay.trimMetadata = true;
	await flush();
	assert.equal(h.packets().at(-1).payload.track.title, '번역 제목');
	assert.equal(h.packets().at(-1).payload.track.artist, '번역 가수');
	h.overlay.trimMetadata = false;
	await flush();
	assert.equal(h.packets().at(-1).payload.track.title, translated.translated.title);
	assert.equal(h.packets().at(-1).payload.track.artist, translated.translated.artist);
	assert.deepEqual(clone(originalTrack), before);
	assert.equal(h.helper._lastTrackInfo, originalTrack);
	assert.equal(h.helper._lastTrackInfo.translatedMetadata, translated);
	assert.equal(h.overlay._lastTrackInfo.translatedMetadata, translated);
	await h.helper.resendWithNewOffset();
	assert.ok(h.packets('/lyrics/sender').every(request => request.payload.track.title === originalTrack.title));
	h.dispose();
});

test('later translated-metadata updates also use the current option and preserve the translation value', async () => {
	const h = load({ initialValues: [[trimKey, 'true']] });
	const originalTrack = track();
	const translated = freeze({ translated: { title: '번역 (Live)', artist: '가수 [Guest]' } });
	await h.overlay.sendLyrics(originalTrack, lyrics());
	await h.overlay.sendTranslatedMetadata(translated);
	assert.equal(h.packets().at(-1).payload.track.title, '번역');
	assert.equal(h.packets().at(-1).payload.track.artist, '가수');
	assert.equal(h.overlay._lastTrackInfo.translatedMetadata, translated);
	h.overlay.trimMetadata = false;
	await flush();
	assert.equal(h.packets().at(-1).payload.track.title, translated.translated.title);
	h.dispose();
});

test('effective title and artist changes bypass lyric dedupe while identical metadata remains deduplicated', async () => {
	const h = load(), original = track(), lines = lyrics();
	await h.overlay.sendLyrics(original, lines);
	await h.overlay.sendLyrics({ ...original }, lines);
	assert.equal(h.packets().length, 1);
	await h.overlay.sendLyrics({ ...original, title: 'Changed title' }, lines);
	await h.overlay.sendLyrics({ ...original, title: 'Changed title', artist: 'Changed artist' }, lines);
	assert.equal(h.packets().length, 3);
	assert.equal(h.packets().at(-1).payload.track.artist, 'Changed artist');
	h.values.set(trimKey, 'true');
	await h.overlay.sendLyrics(original, lines);
	assert.equal(h.packets().at(-1).payload.track.title, 'Song');
	await h.overlay.sendLyrics({ ...original, title: 'Song (Different suffix)' }, lines);
	assert.equal(h.packets().length, 4, 'equivalent displayed metadata must retain dedupe');
	h.dispose();
});

test('next-track progress applies only the overlay option and updates paused progress after each toggle', async () => {
	const h = load();
	await Promise.all([h.overlay.sendLyrics(track(), lyrics()), h.helper.sendLyrics(track(), lyrics())]);
	await h.overlay._worker.onmessage();
	await h.helper._worker.onmessage();
	const originalProgress = h.packets('/progress').at(-1).payload;
	assert.equal(originalProgress.nextTrack.title, h.queueMetadata.title);
	h.overlay.trimMetadata = true;
	await flush();
	await h.overlay._worker.onmessage();
	await h.helper._worker.onmessage();
	const trimmedProgress = h.packets('/progress').at(-1).payload;
	assert.equal(trimmedProgress.currentTrack.title, 'Song');
	assert.equal(trimmedProgress.currentTrack.artist, 'Artist');
	assert.equal(trimmedProgress.nextTrack.title, 'Next');
	assert.equal(trimmedProgress.nextTrack.artist, 'Next Artist');
	assert.equal(h.packets('/lyrics/progress').at(-1).payload.nextTrack.title, h.queueMetadata.title);
	h.overlay.trimMetadata = false;
	await flush();
	await h.overlay._worker.onmessage();
	assert.equal(h.packets('/progress').at(-1).payload.nextTrack.title, h.queueMetadata.title);
	assert.equal(h.metadata.title, track().title);
	assert.equal(h.queueMetadata.title, 'Next (Live) - Bonus');
	h.dispose();
});

test('in-flight delivery keeps only the latest toggle payload and does not change helper delivery state', async () => {
	const h = load(), first = deferred();
	h.setTransport(request => request.endpoint === '/lyrics' && h.packets().length === 1
		? first.promise : { ok: true });
	const initialSend = h.overlay.sendLyrics(track(), lyrics(), false, 'normal', presentation);
	await flush();
	assert.equal(h.packets().length, 1);
	const helperGeneration = h.helper._deliveryGeneration;
	h.overlay.trimMetadata = true;
	await flush();
	h.overlay.trimMetadata = false;
	await flush();
	h.overlay.trimMetadata = true;
	await flush();
	assert.equal(h.packets().length, 1, 'HTTP serialization holds while the old request is active');
	assert.equal(h.overlay._pendingLyricsSend.payload.track.title, 'Song');
	first.resolve({ ok: true });
	await initialSend;
	await flush();
	assert.deepEqual(h.packets().map(request => request.payload.track.title), [track().title, 'Song']);
	assert.equal(h.overlay.lastDeliveredUri, uri);
	assert.equal(h.helper._deliveryGeneration, helperGeneration);
	assert.equal(h.helper._pendingLyricsSend, null);
	h.dispose();
});

test('a preference change during async offset loading supersedes the old request without losing metadata', async () => {
	const h = load(), firstOffset = deferred();
	let reads = 0;
	h.window.TrackSyncDB = { getOffset: () => ++reads === 1 ? firstOffset.promise : Promise.resolve(0) };
	const originalTrack = freeze(track());
	const initialSend = h.overlay.sendLyrics(originalTrack, freeze(lyrics()), false, 'normal', presentation);
	h.overlay.trimMetadata = true;
	await flush();
	assert.equal(h.packets().length, 1);
	assert.equal(h.packets()[0].payload.track.title, 'Song');
	firstOffset.resolve(0);
	await initialSend;
	assert.equal(h.packets().length, 1, 'late offset resolution cannot queue an obsolete request');
	assert.equal(h.overlay._lastTrackInfo, originalTrack);
	assert.equal(h.overlay._lastPresentationContext, presentation);
	h.dispose();
});

test('cross-window setting changes refresh only the overlay and invalidate its progress dedupe', async () => {
	const h = load();
	await Promise.all([h.overlay.sendLyrics(track(), lyrics()), h.helper.sendLyrics(track(), lyrics())]);
	await h.overlay._worker.onmessage();
	const helperPackets = h.packets('/lyrics/sender').length;
	h.values.set(trimKey, 'true');
	h.window.dispatchEvent({ type: 'storage', key: trimKey, newValue: 'true' });
	await flush();
	assert.equal(h.packets().at(-1).payload.track.title, 'Song');
	assert.equal(h.overlay._lastProgressUri, null);
	assert.equal(h.overlay._lastProgressPayloadKey, null);
	await h.overlay._worker.onmessage();
	assert.equal(h.packets('/progress').at(-1).payload.nextTrack.title, 'Next');
	assert.equal(h.packets('/lyrics/sender').length, helperPackets);
	h.dispose();
});

test('reconnect rebuilds display metadata from raw cached inputs with the latest preference', async () => {
	const h = load(), originalTrack = freeze(track());
	await h.overlay.sendLyrics(originalTrack, freeze(lyrics()), false, 'normal', presentation);
	h.overlay.trimMetadata = true;
	await flush();
	h.overlay.isConnected = false;
	h.values.set(trimKey, 'false');
	h.overlay.isConnected = true;
	h.runTimer(100);
	await flush();
	assert.equal(h.packets().at(-1).payload.track.title, originalTrack.title);
	assert.equal(h.overlay._lastTrackInfo, originalTrack);
	assert.equal(h.overlay._lastPresentationContext, presentation);
	assert.equal(h.overlay.lastDeliveredUri, uri);
	h.dispose();
});

test('changing the option while disabled persists it without starting workers or sending data', async () => {
	const h = load();
	h.overlay.enabled = false;
	const count = h.requests.length, generation = h.helper._runtimeGeneration;
	h.overlay.trimMetadata = true;
	await flush();
	assert.equal(h.overlay.trimMetadata, true);
	assert.equal(h.requests.length, count);
	assert.equal(h.overlay._worker, null);
	assert.equal(h.helper._runtimeGeneration, generation);
	h.overlay.enabled = true;
	await h.overlay.sendLyrics(track(), lyrics());
	assert.equal(h.packets().at(-1).payload.track.title, 'Song');
	h.dispose();
});
