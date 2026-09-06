import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const publisherSource = readFileSync(new URL('../LyricsPresentationPublisher.js', import.meta.url), 'utf8');
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

// Exercise the actual sender, preservation and mapper. Capture the complete
// payload at the transport queue boundary; transport retry policy has its own tests.
const load = () => {
	const packets = [];
	const surface = () => {
		const listeners = new Map();
		return {
			addEventListener(type, fn) { const set = listeners.get(type) || new Set(); set.add(fn); listeners.set(type, set); },
			removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
			dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
		};
	};
	const window = surface(), document = surface(), player = surface();
	const CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
	window.CustomEvent = CustomEvent;
	player.data = { item: { uri } };
	player.getDuration = () => 180000;
	const context = vm.createContext({
		window, document, CustomEvent,
		Spicetify: { Player: player, LocalStorage: { get: () => null, set() {} } },
		Utils: { getPlayerPlaybackSnapshot: () => ({ uri: player.data.item.uri }) },
		helperDebug() {}, resolveSpotifyImageUrl: () => null,
		setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
	});
	vm.runInContext([
		section('    const getLyricsTextCacheHash =', '    const isCachedTranslationStructurallyValid ='),
		section('    const cleanupWorker =', '    serviceDebug("[LyricsService] Initializing'),
		section('    const scheduleSenderBootstrap =', '    window.LyricsService = LyricsService;'),
		'globalThis.senders = [OverlaySender, lyricsHelperSender];',
		'globalThis.getKey = getOverlayPresentationKey;',
	].join('\n'), context);
	const [overlay, helper] = context.senders;
	window.OverlaySender = overlay;
	window.lyricsHelperSender = helper;
	vm.runInContext([
		section('    const lyricsPresentationSnapshots =', '    const openTrackOverrideDatabase ='),
		section('    const sendLyricsToConsumers =', '    const LyricsService ='),
		`const LyricsService = { ${section('        publishLyricsSnapshot(update = {})', '        clearLyricsPresentationSnapshot(trackUri)')} };`,
		'window.LyricsService = LyricsService;',
		section('    if (window.__ivLyricsSnapshotReadyListener)', '    // OverlayService extension이 초기화 중 sender를 즉시 찾을 수 있도록'),
		publisherSource,
	].join('\n'), context);
	for (const [name, sender] of [['overlay', overlay], ['helper', helper]]) {
		Object.defineProperty(sender, 'queueLyricsSend', { value: async (endpoint, trackUri, payload) => {
			packets.push({ name, endpoint, trackUri, payload: clone(payload) });
		} });
		sender.setupOffsetListener();
	}
	return {
		overlay, helper, packets, window, player, getKey: context.getKey,
		publisher: window.ivLyricsPresentationPublisher, service: window.LyricsService,
		send: (sender, lines, presentationContext, reason = 'normal', trackUri = uri) => sender.sendLyrics(
			{ uri: trackUri, title: 'Title', artist: 'Artist' }, lines, true, reason, presentationContext),
		last: name => packets.filter(packet => packet.name === name).at(-1).payload.lyrics,
	};
};
const assertSupplements = (lines, pronunciation = ['herro', 'warudo'], translation = ['안녕', '세상']) => {
	assert.deepEqual(lines.map(line => line.pronText), pronunciation);
	assert.deepEqual(lines.map(line => line.transText), translation);
};

test('same presentation preserves completed translation through a subsequent raw pending update', async () => {
	for (const name of ['overlay', 'helper']) {
		const h = load(), input = richLyrics(), context = richContext(), before = clone(input);
		await h.send(h[name], input, context, 'translation-complete');
		await h.send(h[name], rawLyrics(), { ...context, presentationComplete: false }, 'translation-pending');
		assertSupplements(h.last(name));
		assert.deepEqual(input, before, 'retention must not mutate the completed producer snapshot');
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
