import { fixtureFullLyricsRequest } from "./fixtures/full-lyrics-request.mjs";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import { readOverlaySendersFixture } from "./fixtures/legacy-page-source.mjs";
import { installLyricsPresentationPublisher, publishLyricsReady } from "#ivlyrics/lyrics/lyricsReadyPublisher.mjs";
import { getTranslationSourceCacheHash } from "#ivlyrics/lyrics/translationPresentation.mjs";
import { getMountedLyricsPage } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { getRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { getTrackSyncOffsetStore } from "#ivlyrics/core/trackSyncOffsetRuntime.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createLyricsPresentationStore } from "#ivlyrics/lyrics/lyricsPresentationStore.mjs";
import { createLyricSupplementPresentation } from "#ivlyrics/lyrics/lyricSupplementPresentation.mjs";
import { installLyricsReadySnapshotListener } from "#ivlyrics/lyrics/installLyricsReadySnapshotListener.mjs";
import { createLyricsProviderRequests } from "#ivlyrics/lyrics/lyricsProviderRequests.mjs";
import { createLrcRedTimingDelivery } from "#ivlyrics/providers/lyrics/lrcRedTimingDelivery.mjs";
import { createOverlayOffsetResolver } from '../src/features/overlay/overlayOffsets.mjs';

const source = readFileSync(new URL('../src/lyrics/LyricsService.js', import.meta.url), 'utf8');
const section = (from, to) => {
	const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
	assert.ok(start >= 0 && end > start, `missing production section: ${from}`);
	return source.slice(start, end);
};
const clone = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const uri = 'spotify:track:current';
const richContext = () => ({ provider: 'lrclib', lyricsType: 'synced', displayMode1: 'romaji', displayMode2: 'korean',
	pronunciationNotation: 'latin', translationTargetLanguage: 'ko', translationSourceText: 'Hello\nWorld', presentationComplete: true });
const rawLyrics = () => [{ text: 'Hello', startTime: 1000, endTime: 2000 }, { text: 'World', startTime: 2000, endTime: 3000 }];
const richLyrics = () => rawLyrics().map((line, index) => ({ ...line, phoneticText: ['herro', 'warudo'][index], text2: ['안녕', '세상'][index] }));

test('an older shared raw response cannot discard compatible word timing and completed display rows', () => {
	const store = createLyricsPresentationStore({ onPublish() {} });
	const base = { provider: 'lrcred', uri, cacheVersion: 'fixture', synced: rawLyrics(), lrcred: { isrc: 'JPAAA2600001' } };
	const timing = rawLyrics().map(line => ({ ...line, syllables: [{ text: line.text, startTime: line.startTime }] }));
	const display = richLyrics().map((line, index) => ({ ...line, syllables: timing[index].syllables }));
	store.publish({ trackUri: uri, rawResult: { ...base, karaoke: timing, karaokeSource: 'lrcred' },
		displayLyrics: display, lyricsType: 'karaoke', karaokeSource: 'lrcred', presentationComplete: true });
	const stale = store.publish({ trackUri: uri, rawResult: { ...base, attribution: 'Keep latest metadata' }, karaokeSource: null });
	assert.strictEqual(stale.rawResult.karaoke, timing);
	assert.equal(stale.rawResult.attribution, 'Keep latest metadata');
	assert.strictEqual(stale.displayLyrics, display);
	assert.equal(stale.presentationComplete, true);
	assert.equal(stale.karaokeSource, 'lrcred');
	const different = store.publish({ trackUri: uri, rawResult: { ...base, lrcred: { isrc: 'JPAAA2600002' } } });
	assert.equal(different.rawResult.karaoke, undefined);
	assert.equal(different.displayLyrics, undefined);
});

test('republishing the same raw lyric rows does not traverse their timing data again', () => {
    let timingReads = 0, presentationKeyReads = 0;
    const store = createLyricsPresentationStore({
        onPublish() {},
        getPresentationKey() { presentationKeyReads++; return 'fixture'; },
        preserveAuxiliaryLyrics: (_previous, lyrics) => ({ lyrics }),
    });
    const rows = rawLyrics().map(line => ({
        ...line,
        get syllables() {
            timingReads++;
            return [{ text: line.text, startTime: line.startTime }];
        },
    }));
    const raw = { provider: 'spotify', uri, karaoke: rows };
    const display = richLyrics();
    store.publish({ trackUri: uri, rawResult: raw, displayLyrics: display, presentationComplete: true });

    const updated = store.publish({ trackUri: uri, rawResult: { ...raw, karaoke: [...rows], attribution: 'Updated' },
        displayLyrics: display });
    assert.strictEqual(updated.displayLyrics, display);
    assert.equal(updated.rawResult.attribution, 'Updated');
    assert.equal(updated.presentationComplete, true);
    assert.equal(timingReads, 0);
    assert.equal(presentationKeyReads, 0);
});

test('a copied raw source preserves the display until a backing vocal timing changes', () => {
    const store = createLyricsPresentationStore({ onPublish() {} });
    const vocals = {
        lead: { id: 'lead', text: 'Hello', syllables: [{ text: 'Hello', startTime: 1000, endTime: 1500 }] },
        background: [{ id: 'reply', text: 'World', syllables: [{ text: 'World', startTime: 1500, endTime: 2000 }] }],
    };
    const karaoke = [{ ...rawLyrics()[0], vocals }];
    const raw = { provider: 'fixture', uri, karaoke };
    const display = richLyrics();
    store.publish({ trackUri: uri, rawResult: raw, displayLyrics: display, presentationComplete: true });
    const copy = clone(raw);
    assert.strictEqual(store.publish({ trackUri: uri, rawResult: copy }).displayLyrics, display);

    const retimed = clone(copy);
    retimed.karaoke[0].vocals.background[0].syllables[0].startTime = 1550;
    const updated = store.publish({ trackUri: uri, rawResult: retimed });
    assert.equal(updated.displayLyrics, undefined);
    assert.equal(updated.presentationComplete, undefined);
});

test('preserving supplements reuses an unchanged presentation and only copies the affected vocal', () => {
    const { preserveAuxiliaryLyrics } = createLyricSupplementPresentation({ getDisplayComparison: () => null });
    const lead = { id: 'lead', text: 'Hello', translation: '안녕' };
    const background = [{ id: 'reply', text: 'World', translation: '세상' }];
    const next = [{ ...richLyrics()[0], vocals: { lead, background } }];
    const unchanged = preserveAuxiliaryLyrics(next, next);
    assert.strictEqual(unchanged.lyrics, next);

    const previous = [{ ...next[0], vocals: { lead: { ...lead, phonetic: 'herro' }, background } }];
    const updated = preserveAuxiliaryLyrics(previous, next);
    assert.equal(updated.preservedPronunciationCount, 1);
    assert.equal(updated.lyrics[0].vocals.lead.phonetic, 'herro');
    assert.strictEqual(updated.lyrics[0].vocals.background, background);
    assert.equal(next[0].vocals.lead.phonetic, undefined);
});

// Exercise the actual sender, preservation and mapper. Capture the complete
// payload at the transport queue boundary; transport retry policy has its own tests.
const load = ({ globalFallback = false, holdTranslation = null } = {}) => {
	const packets = [];
	const timers = new Map(), values = new Map();
	let timerId = 0, translationCalls = 0;
	let translationStyle = 'natural';
	const styleListeners = new Set();
	const surface = () => {
		const listeners = new Map();
		return {
			addEventListener(type, fn) { const set = listeners.get(type) || new Set(); set.add(fn); listeners.set(type, set); },
			removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
			dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
		};
	};
	const window = surface(), document = surface(), player = surface();
	window.AIAddonManager = {
		getTranslationStyle: () => translationStyle,
		on(name, listener) {
			assert.equal(name, 'translation:style:changed');
			styleListeners.add(listener);
			return () => styleListeners.delete(listener);
		},
	};
	window.TrackSyncDB = { getOffset: async () => 0 };
	const CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
	window.CustomEvent = CustomEvent;
	player.data = { item: { uri, name: 'Title', metadata: { artist_name: 'Artist' } } };
	player.getDuration = () => 180000;
	const history = { location: { pathname: '/ivLyrics' } };
	document.body = { classList: { contains: () => false } };
	const context = vm.createContext({
        getMountedLyricsPage, getRuntimeService, getTrackSyncOffsetStore, getTranslationSourceCacheHash, installLyricsPresentationPublisher, installLyricsReadySnapshotListener,
    createOverlayOffsetResolver,
		window, document, CustomEvent, createLyricsPresentationStore,
		providerRequests: createLyricsProviderRequests(() => window.LyricsAddonManager),
		Spicetify: { Player: player, Platform: { History: history }, LocalStorage: { get: key => values.get(key), set() {} } },
		Utils: { getPlayerPlaybackSnapshot: () => ({ uri: player.data.item.uri }),
			resolveStablePlaybackTrack: () => player.data.item, detectLanguage: () => 'en',
			extractTrackId: value => value.split(':').at(-1),
			getTranslationCacheId: value => value.startsWith('spotify:local:') ? `local-uri:${value}` : value.split(':').at(-1),
			isSectionHeader: () => false },
		getTranslationTargetLanguage: () => 'ko', getServicePronunciationNotation: () => 'latin',
		serviceDebug() {},
		helperDebug() {}, resolveSpotifyImageUrl: () => null,
		setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
		clearTimeout: id => timers.delete(id), setInterval: () => 1, clearInterval() {},
	});
	vm.runInContext([
		section('    const getOverlaySyncOffset =', '    const { OverlaySender, lyricsHelperSender }'),
		'globalThis.getOverlaySyncOffset = getOverlaySyncOffset;',
		'globalThis.scheduleSenderBootstrap = (delay = 1200, previousUri = null) => getRuntimeService("ivLyricsOverlayService", window)?.schedule(delay, previousUri);',
		readOverlaySendersFixture(),
	].join('\n'), context);
	const [overlay, helper] = context.senders;
	window.OverlaySender = overlay;
	window.lyricsHelperSender = helper;
	vm.runInContext([
		section('    const lyricsPresentations =', '    const providerRequests ='),
		section('    const sendLyricsToConsumers =', '    const LyricsService ='),
		`const LyricsService = { ${section('        publishLyricsSnapshot:', '        clearLyricsPresentationSnapshot:')} };`,
		'window.LyricsService = LyricsService;',
		'installLyricsReadySnapshotListener(window, snapshot => LyricsService.publishLyricsSnapshot(snapshot));',
		'installLyricsPresentationPublisher(window);',
	].join('\n'), context);
	for (const [name, sender] of [['overlay', overlay], ['helper', helper]]) {
		Object.defineProperty(sender, 'queueLyricsSend', { value: async (endpoint, trackUri, payload) => {
			packets.push({ name, endpoint, trackUri, payload: clone(payload) });
			if (globalFallback) sender.lastDeliveredUri = trackUri;
		} });
		sender.setupRuntimeListener();
		sender.setupOffsetListener();
	}
	// Both receivers are running; their sends are captured above.
	overlay._isConnected = helper._isConnected = true;
	if (globalFallback) {
		values.set('ivLyrics:visual:translation-mode:english', 'gemini_ko');
		values.set('ivLyrics:visual:translation-mode-2:english', 'gemini_romaji');
		Object.assign(window, { Spicetify: context.Spicetify, Utils: context.Utils,
			LyricsAddonManager: { getLyrics: async () => ({ uri, provider: 'lrclib', synced: rawLyrics() }) },
			Translator: { callGemini: async ({ wantSmartPhonetic }) => {
				translationCalls++;
				if (wantSmartPhonetic) return { phonetic: 'herro\nwarudo' };
				if (translationStyle === 'natural') {
					if (holdTranslation) await holdTranslation;
					return { translation: '안녕\n세상' };
				}
				return { translation: '안녕하세요\n세계' };
			} },
		});
		window.LyricsService.getFullLyrics = fixtureFullLyricsRequest({
			...context,
			sendLyricsToConsumers: vm.runInContext('sendLyricsToConsumers', context),
		});
		vm.runInContext([
			`Object.assign(LyricsService, {
				${section('        async getLyricsFromProviders(', '\n        /**\n         * 싱크 데이터 서비스 접근')}
				emit() {}
			});`,
			bundleInitializer(new URL('../src/features/overlay/OverlayService.js', import.meta.url)),
		].join('\n'), context);
		overlay._isConnected = helper._isConnected = true;
	}
	return {
		overlay, helper, packets, window, player,
		publisher: window.ivLyricsPresentationPublisher, service: window.LyricsService,
		send: (sender, lines, presentationContext, reason = 'normal', trackUri = uri) => sender.sendLyrics(
			{ uri: trackUri, title: 'Title', artist: 'Artist' }, lines, true, reason, presentationContext),
		last: name => packets.filter(packet => packet.name === name).at(-1).payload.lyrics,
		translationCalls: () => translationCalls,
		setStyle(style) {
			translationStyle = style;
			for (const listener of styleListeners) listener({ style });
		},
		runScheduled: async () => {
			const entry = [...timers].sort((a, b) => a[1].delay - b[1].delay)[0];
			assert.ok(entry, 'expected scheduled overlay work');
			timers.delete(entry[0]);
			await entry[1].fn(); await flush();
		},
	};
};
const assertSupplements = (lines, pronunciation = ['herro', 'warudo'], translation = ['안녕', '세상']) => {
	assert.deepEqual(lines.map(line => line.pronText), pronunciation);
	assert.deepEqual(lines.map(line => line.transText), translation);
};

test('page departure finishes translation and reversed pronunciation slots through the production service and both senders', async () => {
	const h = load({ globalFallback: true });
	h.publisher.publishLyricsReady({ trackInfo: { uri, title: 'Title', artist: 'Artist' },
		lyrics: rawLyrics(), ...richContext(), displayMode1: 'gemini_ko', displayMode2: 'gemini_romaji',
		presentationComplete: false });
	await flush();
	for (const name of ['overlay', 'helper']) {
		assert.equal(h[name].lastDeliveredUri, uri);
		assertSupplements(h.last(name), [null, null], [null, null]);
	}
	await h.runScheduled();
	assert.equal(h.translationCalls(), 0, 'the mounted page owns pending translation');
	h.window.dispatchEvent({ type: 'ivLyrics:presentation-owner-released', detail: { source: 'ivlyrics-page', trackUri: uri } });
	await h.runScheduled();
	assert.equal(h.translationCalls(), 2);
	for (const name of ['overlay', 'helper']) assertSupplements(h.last(name));
	assert.equal(h.service.getLyricsSnapshot(uri).presentationComplete, true);
	assert.equal(h.service.getLyricsSnapshot(uri).source, 'lyrics-service-presentation');
	const packetCount = h.packets.length;
	h.window.ivLyricsOverlayService.syncNow(); await h.runScheduled();
	assert.equal(h.translationCalls(), 2);
	assert.equal(h.packets.length, packetCount, 'the completed presentation is not retransmitted');
	h.window.ivLyricsOverlayService.destroy();
});

test('ownerless overlay delivery clears manually emptied supplements even if the source already has text', async () => {
	const h = load({ globalFallback: true });
	h.window.LyricsAddonManager.getLyrics = async () => ({ uri, provider: 'lrclib', synced: richLyrics() });
	h.window.Translator.callGemini = async ({ wantSmartPhonetic }) => wantSmartPhonetic
		? { phonetic: ['', 'edited'], userEdited: true }
		: { translation: ['', ''], userEdited: true };
	const result = await h.service.getFullLyrics({ uri, title: 'Title', artist: 'Artist' });
	assert.equal(result.lyrics.length, 2);
	assert.equal(result.lyrics[0].originalText, 'Hello');
	for (const name of ['overlay', 'helper']) assertSupplements(h.last(name), [null, 'edited'], [null, null]);
	assert.equal(h.service.getLyricsSnapshot(uri).presentationComplete, true);
	h.window.ivLyricsOverlayService.destroy();
});

test('same presentation preserves completed translation through a subsequent raw pending update', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load(), input = richLyrics(), context = richContext(), before = clone(input);
		await h.send(h[name], input, context, 'translation-complete');
		await h.send(h[name], rawLyrics(), { ...context, presentationComplete: false }, 'translation-pending');
		assertSupplements(h.last(name));
		assert.deepEqual(input, before, 'retention must not mutate the completed producer snapshot');
	}
});

test('shared late word timing reaches both senders with the completed supplements', async () => {
	const h = load({ globalFallback: true });
	const trackInfo = { uri, title: 'Title', artist: 'Artist' };
	h.publisher.publishLyricsReady({ ...richContext(), trackInfo, lyrics: richLyrics(), provider: 'lrcred' });
	await flush();
	const previous = h.service.getLyricsSnapshot(uri);
	const karaoke = rawLyrics().map(line => ({ ...line, syllables: [
		{ text: line.text.slice(0, 2), startTime: line.startTime, endTime: line.startTime + 400 },
		{ text: line.text.slice(2), startTime: line.startTime + 400, endTime: line.endTime },
	] }));
	const timing = { ...previous, source: 'lrcred-word-sync', timingUpgradeFromRevision: previous.revision,
		rawResult: { provider: 'lrcred', karaoke, karaokeSource: 'lrcred' } };
	const packetCount = h.packets.length;
	h.service.publishLyricsSnapshot({ ...timing, timingUpgradeApplied: false });
	await flush();
	assert.equal(h.packets.length, packetCount, 'a cache-only update never sends a presentation');
	const applied = h.service.publishLyricsSnapshot({ ...timing, lyricsType: 'karaoke', karaokeSource: 'lrcred', timingUpgradeApplied: true,
		displayLyrics: richLyrics().map((line, index) => ({ ...line, syllables: karaoke[index].syllables })) });
	let pageEvent;
	h.window.addEventListener('ivLyrics:lyrics-ready', event => { pageEvent = event.detail; });
	publishLyricsReady({ ...richContext(), trackInfo, provider: 'lrcred', lyricsType: 'karaoke',
		lyrics: karaoke.map(line => ({ ...line, text2: 'Older page translation' })) }, h.window, { sharedSnapshotHandled: true });
	await flush();
	assert.equal(pageEvent.lyrics[0].text2, 'Older page translation');
	assert.strictEqual(h.service.getLyricsSnapshot(uri), applied);
	assert.equal(h.packets.length - packetCount, 2, 'each receiver gets the timed snapshot once');
	for (const name of ['overlay', 'helper']) {
		assertSupplements(h.last(name));
		assert.deepEqual(h.last(name).map(line => line.syllables?.length), [2, 2]);
	}
	assert.equal(h.translationCalls(), 0);
	h.window.ivLyricsOverlayService.destroy();
});

test('ownerless overlay and helper receive word timing before their pending translation completes', async () => {
	const translation = Promise.withResolvers();
	const h = load({ globalFallback: true, holdTranslation: translation.promise });
	const base = { uri, provider: 'lrcred', synced: rawLyrics(), cacheVersion: 'fixture', lrcred: { isrc: 'JPAAA2600001' } };
	const karaoke = base.synced.map(line => ({ ...line, startTime: line.startTime + 10, syllables: [
		{ text: line.text.slice(0, 2), startTime: line.startTime + 10, endTime: line.startTime + 400 },
		{ text: line.text.slice(2), startTime: line.startTime + 400, endTime: line.endTime },
	] }));
	h.window.LyricsAddonManager.getLyrics = async () => base;
	h.window.dispatchEvent({ type: 'ivLyrics:presentation-owner-released' });
	try {
		await h.runScheduled();
		assert.equal(h.translationCalls(), 1);
		for (const name of ['overlay', 'helper']) assertSupplements(h.last(name), [null, null], [null, null]);

		const deliver = createLrcRedTimingDelivery({
			isEnabled: () => true, isKaraokeEnabled: () => true, isCurrentPlayback: value => value === uri,
			getPage: () => null, getService: () => h.service, getPageCache: () => null,
			isPseudoSource: () => false, getCacheId: () => null,
		});
		assert.equal(await deliver({ uri }, { ...base, karaoke, karaokeSource: 'lrcred' }, () => true), true);
		await flush();
		const timed = h.service.getLyricsSnapshot(uri);
		assert.equal(timed.presentationComplete, false);
		assert.strictEqual(timed.rawResult.karaoke, karaoke);
		for (const name of ['overlay', 'helper']) {
			assert.deepEqual(h.last(name).map(line => line.syllables?.length), [2, 2]);
			assertSupplements(h.last(name), [null, null], [null, null]);
		}

		await h.runScheduled();
		assert.equal(h.translationCalls(), 1, 'timing delivery must not start a duplicate fallback');
		translation.resolve();
		await flush();
		assert.equal(h.translationCalls(), 2, 'one request for each configured slot');
		assert.equal(h.service.getLyricsSnapshot(uri).presentationComplete, true);
		for (const name of ['overlay', 'helper']) {
			assert.deepEqual(h.last(name).map(line => line.syllables?.length), [2, 2]);
			assertSupplements(h.last(name));
		}
	} finally {
		translation.resolve();
		h.window.ivLyricsOverlayService.destroy();
	}
});

test('contextless raw re-emission for the same source does not erase completed supplements', async () => {
	for (const name of ['overlay', 'helper']) {
		for (const reason of ['normal', 'lyrics-ready', 'shared-snapshot']) {
			const h = load();
			await h.send(h[name], richLyrics(), richContext(), 'translation-complete');
			await h.send(h[name], rawLyrics(), null, reason);
			assertSupplements(h.last(name));
		}
	}
});

test('partially omitted context fields inherit the established same-source presentation', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load();
		await h.send(h[name], richLyrics(), richContext(), 'translation-complete');
		await h.send(h[name], rawLyrics(), {
			provider: 'lrclib', displayMode1: undefined, displayMode2: undefined,
			translationSourceText: undefined, pronunciationNotation: undefined, presentationComplete: false,
		}, 'lyrics-ready');
		assertSupplements(h.last(name));
	}
});

test('lyrics-ready listeners retain the producer pronunciation notation and matching translation', async () => {
	const h = load();
	await Promise.all([h.send(h.overlay, richLyrics(), richContext()), h.send(h.helper, richLyrics(), richContext())]);
	h.window.dispatchEvent({ type: 'ivLyrics:lyrics-ready', detail: {
		trackInfo: { uri, title: 'Title', artist: 'Artist' }, lyrics: rawLyrics(), ...richContext(), presentationComplete: false,
	} });
	await flush();
	for (const name of ['overlay', 'helper']) {
		assert.equal(h[name]._lastPresentationContext.pronunciationNotation, 'latin');
		assert.equal(h[name]._lastPresentationContext.translationTargetLanguage, 'ko');
		assertSupplements(h.last(name));
	}
});

test('legacy lyrics-ready events without mode fields display their supplied supplements', async () => {
	const h = load();
	h.window.dispatchEvent({ type: 'ivLyrics:lyrics-ready', detail: {
		trackInfo: { uri, title: 'Title' }, lyrics: richLyrics(),
	} });
	await flush();
	for (const name of ['overlay', 'helper']) assertSupplements(h.last(name));
});

test('a display-only provider change leaves late word timing in the old provider cache', async () => {
	const h = load();
	const trackInfo = { uri, title: 'Title', artist: 'Artist' };
	const base = { uri, provider: 'lrcred', synced: rawLyrics(), lrcred: { isrc: 'JPAAA2600001' } };
	h.service.publishLyricsSnapshot({
		trackInfo, rawResult: base, displayLyrics: rawLyrics(), trackLyricsProviderOverride: 'lrcred',
		lyricsType: 'synced',
	});
	h.window.dispatchEvent({ type: 'ivLyrics:lyrics-ready', detail: { trackInfo, lyrics: rawLyrics() } });
	assert.strictEqual(h.service.getLyricsSnapshot(uri).rawResult, base);

	const nextDisplay = richLyrics();
	h.window.dispatchEvent({ type: 'ivLyrics:lyrics-ready', detail: {
		...richContext(), trackInfo, lyrics: nextDisplay, provider: 'spotify',
	} });
	const next = h.service.getLyricsSnapshot(uri);
	const karaoke = base.synced.map(line => ({ ...line, syllables: [
		{ text: line.text, startTime: line.startTime, endTime: line.endTime },
	] }));
	let cached = base;
	const deliver = createLrcRedTimingDelivery({
		isEnabled: () => true, isKaraokeEnabled: () => true, isCurrentPlayback: value => value === uri,
		getPage: () => null, getPageCache: () => null, getCacheId: () => 'current',
		getService: () => ({
			...h.service,
			async updateCachedLyrics(_id, provider, update) {
				assert.equal(provider, 'lrcred');
				cached = update(cached);
			},
		}),
		isPseudoSource: () => false,
	});
	assert.equal(await deliver({ uri }, { ...base, karaoke, karaokeSource: 'lrcred' }, () => true), false);
	assert.strictEqual(cached.karaoke, karaoke);
	assert.strictEqual(h.service.getLyricsSnapshot(uri), next);
	assert.equal(next.provider, 'spotify');
	assert.equal(next.rawResult, undefined);
	assert.equal(next.trackLyricsProviderOverride, undefined);
	assert.strictEqual(next.displayLyrics, nextDisplay);
});

test('the production publisher preserves notation and target language through events, snapshots and bootstrap replay', async () => {
	const h = load();
	const trackInfo = { uri, title: 'Title', artist: 'Artist' };
	const options = { ...richContext(), trackInfo, lyrics: richLyrics() };
	const detail = h.publisher.buildLyricsReadyDetail(options);
	assert.equal(detail.pronunciationNotation, 'latin');
	assert.equal(detail.translationTargetLanguage, 'ko');
	h.publisher.publishLyricsReady(options);
	await flush();
	const firstSnapshot = h.service.getLyricsSnapshot(uri);
	assert.equal(firstSnapshot.pronunciationNotation, 'latin');
	assert.equal(firstSnapshot.translationTargetLanguage, 'ko');
	const keys = [h.overlay._lastPresentationKey, h.helper._lastPresentationKey];
	h.publisher.publishLyricsReady({ ...options, lyrics: rawLyrics(), presentationComplete: false });
	await flush();
	const retainedSnapshot = h.service.getLyricsSnapshot(uri);
	assert.deepEqual(clone(retainedSnapshot.displayLyrics).map(line => line.text2), ['안녕', '세상']);
	assert.equal(await h.service.sendLyricsSnapshotToConsumers(trackInfo, retainedSnapshot, { forceResend: true }), true);
	for (const [index, name] of ['overlay', 'helper'].entries()) {
		assert.equal(h[name]._lastPresentationKey, keys[index]);
		assert.equal(h[name]._lastPresentationContext.pronunciationNotation, 'latin');
		assert.equal(h[name]._lastPresentationContext.translationTargetLanguage, 'ko');
		assertSupplements(h.last(name));
	}
	h.publisher.publishLyricsReady({ ...options, lyrics: rawLyrics(), translationTargetLanguage: 'en', presentationComplete: false });
	await flush();
	const changedSnapshot = h.service.getLyricsSnapshot(uri);
	assert.equal(changedSnapshot.translationTargetLanguage, 'en');
	assert.ok(changedSnapshot.displayLyrics.every(line => !line.text2));
	await h.service.sendLyricsSnapshotToConsumers(trackInfo, changedSnapshot, { forceResend: true });
	for (const name of ['overlay', 'helper']) assertSupplements(h.last(name), [null, null], [null, null]);
});

test('explicitly disabling translation clears it and later incomplete updates do not resurrect it', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load();
		await h.send(h[name], richLyrics(), richContext());
		await h.send(h[name], rawLyrics(), { ...richContext(), displayMode1: 'none', displayMode2: 'none' }, 'translation-complete');
		assertSupplements(h.last(name), [null, null], [null, null]);
		await h.send(h[name], rawLyrics(), null, 'normal');
		assertSupplements(h.last(name), [null, null], [null, null]);
	}
});

test('a new style never retains the previous translation through events, snapshots or replay', async () => {
	const h = load();
	const trackInfo = { uri, title: 'Title', artist: 'Artist' };
	const context = { ...richContext(), trackInfo, displayMode2: 'gemini_ko' };
	h.publisher.publishLyricsReady({ ...context, lyrics: richLyrics(), translationStyle: 'natural' });
	await flush();
	h.publisher.publishLyricsReady({
		...context, lyrics: rawLyrics(), translationStyle: 'literal', presentationComplete: false,
	});
	await flush();
	const snapshot = h.service.getLyricsSnapshot(uri);
	assert.equal(snapshot.translationStyle, 'literal');
	assert.ok(snapshot.displayLyrics.every(line => line.phoneticText && !line.text2));
	for (const name of ['overlay', 'helper']) assertSupplements(h.last(name), ['herro', 'warudo'], [null, null]);
	await h.service.sendLyricsSnapshotToConsumers(trackInfo, snapshot, { forceResend: true });
	for (const name of ['overlay', 'helper']) {
		assert.equal(h[name]._lastPresentationContext.translationStyle, 'literal');
		assertSupplements(h.last(name), ['herro', 'warudo'], [null, null]);
	}
});

test('ownerless overlay refreshes a delivered translation when the style changes', async () => {
	const h = load({ globalFallback: true });
	const trackInfo = { uri, title: 'Title', artist: 'Artist' };
	h.publisher.publishLyricsReady({
		...richContext(), trackInfo, lyrics: richLyrics(), displayMode1: 'gemini_ko',
		displayMode2: 'gemini_romaji', translationStyle: 'natural',
	});
	await flush();
	h.window.dispatchEvent({ type: 'ivLyrics:presentation-owner-released', detail: { source: 'ivlyrics-page', trackUri: uri } });
	await h.runScheduled();
	assert.equal(h.translationCalls(), 0);
	h.setStyle('literal');
	await h.runScheduled();
	assert.equal(h.translationCalls(), 2);
	assert.equal(h.service.getLyricsSnapshot(uri).translationStyle, 'literal');
	for (const name of ['overlay', 'helper']) assertSupplements(h.last(name), ['herro', 'warudo'], ['안녕하세요', '세계']);
	h.window.ivLyricsOverlayService.destroy();
});

test('a pending fallback for the previous style cannot block or overwrite current delivery', async () => {
	let finishPrevious;
	const holdTranslation = new Promise(resolve => { finishPrevious = resolve; });
	const h = load({ globalFallback: true, holdTranslation });
	h.window.dispatchEvent({ type: 'ivLyrics:presentation-owner-released', detail: { source: 'ivlyrics-page', trackUri: uri } });
	await h.runScheduled();
	assert.equal(h.translationCalls(), 1);
	h.setStyle('literal');
	await h.runScheduled();
	const current = h.service.getLyricsSnapshot(uri);
	assert.equal(current.translationStyle, 'literal');
	assert.equal(h.translationCalls(), 3);
	finishPrevious();
	await flush();
	assert.equal(h.service.getLyricsSnapshot(uri), current);
	for (const name of ['overlay', 'helper']) assertSupplements(h.last(name), ['herro', 'warudo'], ['안녕하세요', '세계']);
	h.window.ivLyricsOverlayService.destroy();
});

test('explicit provider, source, language or pronunciation changes do not retain stale supplements', async () => {
	for (const name of ['overlay', 'helper']) {
		for (const changed of [
			{ provider: 'spotify' }, { translationSourceText: 'Different source' },
			{ displayMode2: 'english' }, { pronunciationNotation: 'ipa' }, { translationTargetLanguage: 'en' },
		]) {
			const h = load();
			await h.send(h[name], richLyrics(), richContext());
			await h.send(h[name], rawLyrics(), { ...richContext(), ...changed }, 'translation-pending');
			assertSupplements(h.last(name), [null, null], [null, null]);
		}
	}
});

test('identical raw lyric arrays still resend when translation visibility is disabled and re-enabled', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load(), sender = h[name], lines = richLyrics(), track = { uri, title: 'Title', artist: 'Artist' };
		await sender.sendLyrics(track, lines, false, 'translation-complete', richContext());
		assertSupplements(h.last(name));
		const count = h.packets.length;
		await sender.sendLyrics(track, lines, false, 'lyrics-ready', { ...richContext(), displayMode2: 'none' });
		assert.equal(h.packets.length, count + 1, 'changed visibility must not be deduplicated by raw array contents');
		assertSupplements(h.last(name), ['herro', 'warudo'], [null, null]);
		await sender.sendLyrics(track, lines, false, 'lyrics-ready', richContext());
		assert.equal(h.packets.length, count + 2);
		assertSupplements(h.last(name));
		await sender.sendLyrics(track, lines, false, 'lyrics-ready', richContext());
		assert.equal(h.packets.length, count + 2, 'an unchanged visible payload is still deduplicated');
	}
});

test('synced status changes resend even when zero-timestamp normalization produces identical mapped lyrics', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load(), sender = h[name], track = { uri, title: 'Title' };
		const context = { provider: 'fixture', displayMode1: 'none', displayMode2: 'none' };
		for (const lines of [[{ text: 'Hello' }], [{ text: 'Hello', startTime: 0 }], [{ text: 'Hello' }]]) {
			await sender.sendLyrics(track, lines, false, 'normal', context);
		}
		const packets = h.packets.filter(packet => packet.name === name);
		assert.deepEqual(packets.map(packet => packet.payload.isSynced), [false, true, false]);
		assert.deepEqual(packets[0].payload.lyrics, packets[1].payload.lyrics);
		assert.deepEqual(packets[1].payload.lyrics, packets[2].payload.lyrics);
		await sender.sendLyrics(track, [{ text: 'Hello' }], false, 'normal', context);
		assert.equal(h.packets.length, packets.length, 'unchanged status and lyrics still deduplicate');
	}
});

const vocalLyrics = (withSupplements = false) => [{
	text: 'Hello World', startTime: 1000, endTime: 3000,
	vocals: {
		lead: { id: 'lead', role: 'lead', text: 'Hello',
			syllables: [{ text: 'Hello', startTime: 1000, endTime: 2000 }],
			...(withSupplements ? { phonetic: 'herro', translation: '안녕' } : {}),
		},
		background: [{ id: 'background', role: 'background', text: 'World',
			syllables: [{ text: 'World', startTime: 1500, endTime: 3000 }],
			...(withSupplements ? { phonetic: 'warudo', translation: '세상' } : {}),
		}],
	},
}];
const assertVocals = (line, leadTranslation = '안녕', backgroundTranslation = '세상') => {
	assert.equal(line.vocals.lead.phonetic, 'herro');
	assert.equal(line.vocals.lead.translation, leadTranslation);
	assert.equal(line.vocals.background[0].phonetic, 'warudo');
	assert.equal(line.vocals.background[0].translation, backgroundTranslation);
};

test('same-presentation raw vocal updates retain lead and background translations independently', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load(), complete = vocalLyrics(true), before = clone(complete);
		const context = { ...richContext(), translationSourceText: 'Hello\nWorld' };
		await h.send(h[name], complete, context, 'translation-complete');
		assertVocals(h.last(name)[0]);
		await h.send(h[name], vocalLyrics(false), { ...context, presentationComplete: false }, 'translation-pending');
		assertVocals(h.last(name)[0]);
		assert.deepEqual(complete, before);
	}
});

test('partial vocal translations replace new values while preserving the other completed vocal', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load();
		await h.send(h[name], vocalLyrics(true), richContext());
		const next = vocalLyrics();
		next[0].vocals.lead.translation = '새 번역';
		await h.send(h[name], next, richContext(), 'translation-pending');
		assertVocals(h.last(name)[0], '새 번역');
	}
});

test('vocal text derived from syllables retains supplements only when its timing still matches', async () => {
	for (const name of ['overlay', 'helper']) {
		for (const timeDelta of [0, 1000]) {
			const h = load(), complete = vocalLyrics(true), next = vocalLyrics(false);
			for (const lines of [complete, next]) {
				delete lines[0].vocals.lead.text;
				delete lines[0].vocals.background[0].text;
			}
			next[0].vocals.lead.syllables[0].startTime += timeDelta;
			next[0].vocals.background[0].syllables[0].startTime += timeDelta;
			await h.send(h[name], complete, richContext());
			assertVocals(h.last(name)[0]);
			await h.send(h[name], next, richContext(), 'translation-pending');
			const line = h.last(name)[0];
			assert.equal(line.vocals.lead.text, 'Hello');
			assert.equal(line.vocals.background[0].text, 'World');
			if (timeDelta === 0) assertVocals(line);
			else {
				assert.equal(line.vocals.lead.phonetic, '');
				assert.equal(line.vocals.lead.translation, '');
				assert.equal(line.vocals.background[0].phonetic, '');
				assert.equal(line.vocals.background[0].translation, '');
			}
		}
	}
});

test('changed vocal text or timing does not inherit another vocal translation', async () => {
	for (const changed of ['text', 'timing']) {
		const h = load();
		await h.send(h.overlay, vocalLyrics(true), richContext());
		const next = vocalLyrics();
		if (changed === 'text') next[0].vocals.background[0].text = 'Different';
		else next[0].vocals.background[0].syllables[0].startTime += 1000;
		await h.send(h.overlay, next, richContext());
		assert.equal(h.last('overlay')[0].vocals.background[0].translation, '');
		assert.equal(h.last('overlay')[0].vocals.background[0].phonetic, '');
	}
});

test('an explicit mode change hides every vocal supplement without mutating their original data', async () => {
	const h = load(), lines = vocalLyrics(true), before = clone(lines);
	await h.send(h.overlay, lines, richContext());
	await h.send(h.overlay, lines, { ...richContext(), displayMode1: 'none', displayMode2: 'none' });
	const vocals = h.last('overlay')[0].vocals;
	assert.equal(vocals.lead.translation, '');
	assert.equal(vocals.lead.phonetic, '');
	assert.equal(vocals.background[0].translation, '');
	assert.equal(vocals.background[0].phonetic, '');
	assert.deepEqual(lines, before);
});

test('changed lyric text, count and timing do not borrow unrelated completed translations', async () => {
	for (const name of ['overlay', 'helper']) {
		for (const next of [
			[{ text: 'Different', startTime: 1000 }, { text: 'New', startTime: 2000 }],
			[{ text: 'Hello', startTime: 1000 }],
			rawLyrics().map(line => ({ ...line, startTime: line.startTime + 1000 })),
		]) {
			const h = load();
			await h.send(h[name], richLyrics(), richContext());
			await h.send(h[name], next, richContext());
			assert.ok(h.last(name).every(line => line.transText === null && line.pronText === null));
		}
	}
});

test('a new track cannot inherit translation even if its text and timing are identical', async () => {
	const h = load();
	await h.send(h.overlay, richLyrics(), richContext());
	h.player.data.item.uri = 'spotify:track:next';
	await h.send(h.overlay, rawLyrics(), null, 'normal', h.player.data.item.uri);
	assertSupplements(h.last('overlay'), [null, null], [null, null]);
});

test('new partial translation replaces only completed new values and retains remaining old values', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load();
		await h.send(h[name], richLyrics(), richContext());
		const next = rawLyrics();
		next[0].text2 = '새 번역';
		await h.send(h[name], next, richContext(), 'translation-pending');
		assertSupplements(h.last(name), ['herro', 'warudo'], ['새 번역', '세상']);
	}
});
