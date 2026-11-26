import { readOverlaySendersFixture } from "./fixtures/legacy-page-source.mjs";
import { getTranslationSourceCacheHash } from "#ivlyrics/lyrics/translationPresentation.mjs";
import { getMountedLyricsPage } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { getRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { getTrackSyncOffsetStore } from "#ivlyrics/core/trackSyncOffsetRuntime.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createOverlayOffsetResolver } from '../src/features/overlay/overlayOffsets.mjs';
import { resolveSpotifyImageUrl } from '../src/features/overlay/overlayPresentationHost.mjs';
import { trimFullscreenTitle } from '../src/features/fullscreen/fullscreenTrackMetadata.mjs';

const source = readFileSync(new URL('../src/lyrics/LyricsService.js', import.meta.url), 'utf8');
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
	let djNarration = false;
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
	window.TrackSyncDB = { getOffset: async () => 0 };
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
        getMountedLyricsPage, getRuntimeService, getTrackSyncOffsetStore, getTranslationSourceCacheHash,
    createOverlayOffsetResolver,
		window, document, Blob, URL: { createObjectURL: () => 'blob:worker', revokeObjectURL() {} },
		Worker: class { constructor() { workers.push(this); } postMessage() {} terminate() { this.terminated = true; } },
		Spicetify: { Player: player, Queue: queue, LocalStorage: { get: key => values.get(key), set: (key, value) => values.set(key, value) } },
		CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
		setTimeout: schedule, setInterval: schedule, clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
		Utils: {
			getPlayerPlaybackSnapshot: () => ({ uri: player.data.item.uri, position: 1250, duration: 180000, djNarration }),
			resolveStablePlaybackTrack: () => player.data.item,
		},
		helperDebug: () => {},
		console: { error() {}, warn() {}, log() {} },
		getOverlayProgressIsPlaying: () => player.isPlaying(), resolveSpotifyImageUrl,
		fullscreenTrim: trimFullscreenTitle,
		AbortSignal: { timeout: ms => ({ timeout: ms }) },
		fetch: (url, options) => {
			const request = { url, endpoint: new URL(url).pathname, port: new URL(url).port, method: options.method,
				payload: options.body ? JSON.parse(options.body) : null };
			requests.push(request);
			return Promise.resolve(transport(request));
		},
	});
	vm.runInContext([
		section(source, '    const getOverlaySyncOffset =', '    const { OverlaySender, lyricsHelperSender }'),
		'globalThis.getOverlaySyncOffset = getOverlaySyncOffset;',
		readOverlaySendersFixture(),
	].join('\n'), context);
	const [overlay, helper] = context.senders;
	window.OverlaySender = overlay;
	window.lyricsHelperSender = helper;
	overlay.init();
	helper.init();
	// Both receivers answer their startup probe; senders deliver only then.
	overlay.isConnected = true;
	helper.isConnected = true;
	// Finish the connection recovery they schedule; nothing is cached yet.
	for (const [id, timer] of [...timers]) {
		timers.delete(id);
		timer.fn();
	}
	return {
		overlay, helper, context, window, player, values, workers, requests, timers, metadata, queueMetadata,
		setTransport: fn => { transport = fn; },
		setNarration: value => { djNarration = value; },
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

test('an HTTP response from the lyric packet cannot acknowledge narration on the same URI', async () => {
	const h = load(), first = deferred();
	h.setTransport(request => request.endpoint === '/lyrics' && h.packets().length === 1
		? first.promise
		: { ok: true, text: async () => '' });
	const sendingSong = h.overlay.sendLyrics(track(), lyrics(), false, 'normal', presentation);
	await flush();
	assert.equal(h.packets().length, 1);
	h.setNarration(true);
	await h.overlay.sendLyrics({ uri, title: 'Spotify DJ', duration: 2500, isDjNarration: true }, [], true, 'dj-narration');
	assert.equal(h.packets().length, 1);
	await h.overlay.sendLyrics(track(), lyrics(), true, 'late-song');
	first.resolve({ ok: true, text: async () => '' });
	await sendingSong;
	assert.equal(h.packets().length, 2);
	assert.equal(h.packets().at(-1).payload.track.title, 'Spotify DJ');
	assert.equal(h.packets().at(-1).payload.track.duration, 2500);
	assert.deepEqual(h.packets().at(-1).payload.lyrics, []);
	assert.equal(h.overlay.lastDeliveredIsDjNarration, true);

	h.setNarration(false);
	await h.overlay.sendLyrics(track(), lyrics());
	assert.equal(h.packets().length, 3);
	assert.equal(h.packets().at(-1).payload.lyrics.length, 1);
	assert.equal(h.overlay.lastDeliveredIsDjNarration, false);
	h.dispose();
});

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
	const originalTrack = freeze(track());
	const translated = freeze({ translated: { title: '번역 (Live)', artist: '가수 [Guest]' } });
	await Promise.all([h.overlay.sendLyrics(originalTrack, lyrics()), h.helper.sendLyrics(originalTrack, lyrics())]);
	await h.overlay.sendTranslatedMetadata(translated);
	assert.equal(h.packets().at(-1).payload.track.title, '번역');
	assert.equal(h.packets().at(-1).payload.track.artist, '가수');
	assert.equal(h.overlay._lastTrackInfo.translatedMetadata, translated);
	assert.equal(h.helper._lastTrackInfo, originalTrack);
	assert.equal(originalTrack.translatedMetadata, undefined);
	h.overlay.trimMetadata = false;
	await flush();
	assert.equal(h.packets().at(-1).payload.track.title, translated.translated.title);
	h.dispose();
});

test('a translated title for the next track cannot alter the cached metadata of the outgoing track', async () => {
	const h = load(), previous = track();
	await h.overlay.sendLyrics(previous, lyrics());
	const nextUri = 'spotify:track:next';
	h.player.data.item = { ...h.player.data.item, uri: nextUri };
	const translated = { translated: { title: 'Next title' } };
	await h.overlay.sendTranslatedMetadata(translated, nextUri);
	assert.equal(previous.translatedMetadata, undefined);
	assert.equal(h.overlay._lastTrackInfo, previous);
	assert.equal(h.packets().length, 1);
	await h.overlay.sendLyrics({ ...previous, uri: nextUri, translatedMetadata: translated }, lyrics());
	assert.equal(h.packets().at(-1).payload.track.title, 'Next title');
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

test('late album, artwork and duration updates send only changed packets to both receivers', async () => {
	const h = load(), original = track(), lines = lyrics();
	const send = () => Promise.all([h.overlay.sendLyrics(original, lines), h.helper.sendLyrics(original, lines)]);
	await send();
	h.player.data.item.metadata = { ...h.metadata, album_title: 'Album (Updated)' };
	await send();
	await send();
	h.player.data.item.metadata = { ...h.player.data.item.metadata, image_url: 'spotify:image:updated' };
	await send();
	h.player.getDuration = () => 182000;
	await send();
	await send();
	for (const endpoint of ['/lyrics', '/lyrics/sender']) {
		const packets = h.packets(endpoint);
		assert.deepEqual(packets.map(({ payload }) => payload.track), [
			{ title: original.title, artist: original.artist, album: 'Album (Original)', albumArt: 'https://i.scdn.co/image/cover', duration: 180000 },
			{ title: original.title, artist: original.artist, album: 'Album (Updated)', albumArt: 'https://i.scdn.co/image/cover', duration: 180000 },
			{ title: original.title, artist: original.artist, album: 'Album (Updated)', albumArt: 'https://i.scdn.co/image/updated', duration: 180000 },
			{ title: original.title, artist: original.artist, album: 'Album (Updated)', albumArt: 'https://i.scdn.co/image/updated', duration: 182000 },
		]);
	}
	h.dispose();
});

test('overlay packets name ivLyrics as their source while helper packets keep the helper format', async () => {
	const h = load();
	await Promise.all([h.overlay.sendLyrics(track(), lyrics()), h.helper.sendLyrics(track(), lyrics())]);
	await h.overlay._worker.onmessage();
	await h.helper._worker.onmessage();
	assert.equal(h.packets().at(-1).payload.source, 'ivlyrics');
	assert.equal(h.packets('/progress').at(-1).payload.source, 'ivlyrics');
	assert.equal('source' in h.packets('/lyrics/sender').at(-1).payload, false);
	assert.equal('source' in h.packets('/lyrics/progress').at(-1).payload, false);
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

test('a preference change shares the pending offset read and sends only the latest metadata', async () => {
	const h = load(), firstOffset = deferred();
	let reads = 0;
	h.window.TrackSyncDB = { getOffset: () => { reads++; return firstOffset.promise; } };
	const originalTrack = freeze(track());
	const initialSend = h.overlay.sendLyrics(originalTrack, freeze(lyrics()), false, 'normal', presentation);
	h.overlay.trimMetadata = true;
	await flush();
	assert.equal(h.packets().length, 0);
	assert.equal(reads, 1);
	firstOffset.resolve(0);
	await initialSend;
	await flush();
	assert.equal(h.packets().length, 1, 'late offset resolution cannot queue an obsolete request');
	assert.equal(h.packets()[0].payload.track.title, 'Song');
	assert.equal(h.overlay._lastTrackInfo, originalTrack);
	assert.equal(h.overlay._lastPresentationContext, presentation);
	h.dispose();
});

test('a newer lyric request wins while both sends wait for the same offset', async () => {
	const h = load(), offset = deferred();
	let reads = 0;
	h.window.TrackSyncDB = { getOffset: () => { reads++; return offset.promise; } };
	const old = h.overlay.sendLyrics(track(), [{ text: 'old' }]);
	const latest = h.overlay.sendLyrics(track(), [{ text: 'latest' }]);
	await flush();
	assert.deepEqual(h.packets(), []);
	assert.equal(reads, 1);
	offset.resolve(0);
	await Promise.all([old, latest]);
	assert.deepEqual(h.packets().map(packet => packet.payload.lyrics[0].text), ['latest']);
	h.dispose();
});

test('a fresh lyric payload supersedes a retry without waiting for the old backoff', async () => {
	const h = load();
	let attempts = 0;
	h.setTransport(request => request.endpoint === '/lyrics' && ++attempts === 1
		? { ok: false, status: 503, text: async () => 'try again' }
		: { ok: true });
	const first = h.overlay.sendLyrics(track(), [{ text: 'old' }]);
	await flush();
	assert.ok([...h.timers.values()].some(timer => timer.ms === 250));
	await h.overlay.sendLyrics(track(), [{ text: 'latest' }]);
	await first;
	assert.deepEqual(h.packets().map(packet => packet.payload.lyrics[0].text), ['old', 'latest']);
	assert.ok(![...h.timers.values()].some(timer => timer.ms === 250));
	h.dispose();
});

test('backoff cannot retry lyrics from a retired translation preference', async () => {
	const h = load();
	let target = 'ko';
	h.window.ivLyricsOverlayService = {
		isPresentationCurrent: context => !context?.translationTargetLanguage || context.translationTargetLanguage === target,
	};
	h.setTransport(request => request.endpoint === '/lyrics' && h.packets().length === 1
		? { ok: false, status: 503, text: async () => 'try again' }
		: { ok: true });
	const old = h.overlay.sendLyrics(track(), lyrics(), false, 'normal', { ...presentation, translationTargetLanguage: 'ko' });
	await flush();
	assert.equal(h.packets().length, 1);
	target = 'fr';
	h.runTimer(250);
	await old;
	assert.equal(h.packets().length, 1, 'the old translation must not leave the retry queue');

	await h.overlay.sendLyrics(track(), [], true, 'clear-lyrics');
	assert.deepEqual(h.packets().at(-1).payload.lyrics, []);
	await h.overlay.sendLyrics(track(), lyrics(), false, 'normal', { ...presentation, translationTargetLanguage: 'fr' });
	assert.equal(h.packets().length, 3);
	assert.equal(h.overlay.lastDeliveredUri, uri);
	h.dispose();
});

test('an obsolete HTTP response cannot acknowledge the current presentation', async () => {
	const h = load(), response = deferred();
	let target = 'ko';
	h.window.ivLyricsOverlayService = {
		isPresentationCurrent: context => context.translationTargetLanguage === target,
	};
	h.setTransport(request => request.endpoint === '/lyrics' && h.packets().length === 1 ? response.promise : { ok: true });
	const sending = h.overlay.sendLyrics(track(), lyrics(), false, 'normal', { ...presentation, translationTargetLanguage: 'ko' });
	await flush();
	assert.equal(h.packets().length, 1);
	target = 'fr';
	response.resolve({ ok: true });
	await sending;
	assert.equal(h.overlay.lastDeliveredUri, null);

	await h.overlay.sendLyrics(track(), lyrics(), false, 'normal', { ...presentation, translationTargetLanguage: 'fr' });
	assert.equal(h.packets().length, 2);
	assert.equal(h.overlay.lastDeliveredUri, uri);
	h.dispose();
});

test('progress retries track metadata after rejection and waits for the new title to be ready', async () => {
	const h = load();
	let rejected = false;
	h.setTransport(request => {
		if (request.endpoint === '/progress' && request.payload.currentTrack && !rejected) {
			rejected = true;
			return { ok: false, status: 503, text: async () => 'try again' };
		}
		return { ok: true };
	});
	await h.overlay._worker.onmessage();
	assert.equal(h.overlay._lastProgressUri, null);
	await h.overlay._worker.onmessage();
	assert.equal(h.overlay._lastProgressUri, uri);
	assert.deepEqual(h.packets('/progress').map(request => request.payload.currentTrack?.title), [track().title, track().title]);

	const next = 'spotify:track:missing-metadata';
	h.player.data.item = { uri: next };
	h.player.dispatchEvent({ type: 'songchange' });
	await h.overlay._worker.onmessage();
	assert.equal(h.packets('/progress').at(-1).payload.trackUri, next);
	assert.equal(h.packets('/progress').at(-1).payload.currentTrack, null);
	h.player.data.item = { uri: next, name: 'Ready title' };
	await h.overlay._worker.onmessage();
	assert.equal(h.packets('/progress').at(-1).payload.currentTrack.title, 'Ready title');
	assert.equal(h.overlay._lastProgressUri, next);
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
	assert.equal(h.overlay._lastProgress, null);
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

test('a disconnected overlay keeps lyrics without requests and receives them once it answers', async () => {
	const h = load();
	h.overlay.isConnected = false;
	const before = h.requests.length;
	await h.overlay.sendLyrics(track(), lyrics(), false, 'normal', presentation);
	h.window.dispatchEvent({ type: 'focus' });
	await flush();
	assert.equal(h.requests.length, before, 'nothing is posted while the overlay is not running');
	h.overlay.isConnected = true;
	h.runTimer(100);
	await flush();
	assert.equal(h.requests.length, before + 1);
	assert.equal(h.packets().at(-1).payload.track.title, track().title);
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
	h.overlay.isConnected = true;
	await h.overlay.sendLyrics(track(), lyrics());
	assert.equal(h.packets().at(-1).payload.track.title, 'Song');
	h.dispose();
});
