import assert from "node:assert/strict";
import test from "node:test";
import { assertNoInternals, createHarness, firstLineOf, song } from "./local_model_harness.mjs";

// 24 lines make three blocks of eight: A0, A8 and A16.
const order = (h) => h.prompts.map(firstLineOf);
const isSuperseded = (error) => {
	assert.equal(error.name, "AbortError");
	assert.equal(error.superseded, true, "the manager can tell a stopped song from a failure");
	assertNoInternals(error.message);
	return true;
};

test("after a song change the previous song stops at once: queued blocks are dropped and its running block is aborted", async () => {
	const h = createHarness({ hold: true });
	const linesA = [];
	const a = h.addon.translateLyrics({ trackId: "songA", text: song("A"), lang: "ko", onLine: (index) => linesA.push(index) });
	await h.until(() => h.running.length === 1, "song A's first block on the engine");

	const b = h.addon.translateLyrics({ trackId: "songB", text: song("B"), lang: "ko", onLine() {} });
	await assert.rejects(a, isSuperseded);
	assert.equal(h.calls[0].signal.aborted, true, "the block already on the engine is aborted");

	h.releaseAll();
	const result = await b;
	assert.equal(result.translation.length, 24);
	assert.deepEqual(order(h), ["A0", "B0", "B8", "B16"], "no block of song A runs after song B arrives, not even line by line");
	assert.deepEqual(linesA, [], "song A emits nothing once it is stopped");
});

test("the song that is playing is never stopped, and runs before lyrics of another song", async () => {
	const h = createHarness({ hold: true, playing: "songP" });
	const playing = h.addon.translateLyrics({ trackId: "songP", text: song("P"), lang: "ko", onLine() {} });
	await h.until(() => h.running.length === 1, "the playing song's first block");
	const other = h.addon.translateLyrics({ trackId: "songX", text: song("X"), lang: "ko", onLine() {} });
	h.releaseAll();
	await Promise.all([playing, other]);
	assert.equal(h.calls[0].signal.aborted, false);
	assert.deepEqual(order(h), ["P0", "P8", "P16", "X0", "X8", "X16"]);
});

test("prefetching never cancels or delays the playing song, and a newer prefetch replaces a stale one", async () => {
	const h = createHarness({ hold: true, playing: "songP" });
	const onScreen = h.addon.translateLyrics({ trackId: "songP", text: song("P"), lang: "ko", onLine() {} });
	await h.until(() => h.running.length === 1, "the playing song's first block");
	// Prefetching for upcoming songs passes no line callback.
	const stalePrefetch = h.addon.translateLyrics({ trackId: "songN1", text: song("N"), lang: "ko" });
	const prefetch = h.addon.translateLyrics({ trackId: "songN2", text: song("M"), lang: "ko" });
	await assert.rejects(stalePrefetch, isSuperseded);
	h.releaseAll();
	const [current, next] = await Promise.all([onScreen, prefetch]);
	assert.equal(current.translation.length, 24);
	assert.equal(next.translation.length, 24);
	assert.deepEqual(order(h), ["P0", "P8", "P16", "M0", "M8", "M16"]);
});

test("the playing song wins over a prefetch even when its request has no line callback", async () => {
	// e.g. the Now Playing panel, or the app joining a prefetch that became the playing song.
	const h = createHarness({ hold: true, playing: "songP" });
	const prefetch = h.addon.translateLyrics({ trackId: "songN", text: song("N"), lang: "ko" });
	await h.until(() => h.running.length === 1, "the prefetch's first block");
	const panel = h.addon.translateLyrics({ trackId: "songP", text: song("P"), lang: "ko" });
	h.releaseAll();
	await Promise.all([prefetch, panel]);
	assert.deepEqual(order(h), ["N0", "P0", "P8", "P16", "N8", "N16"], "the running prefetch block finishes; then the playing song goes first");
});

test("while the playing song is unknown, requests without a line callback never stop each other", async () => {
	const h = createHarness({ hold: true });
	const first = h.addon.translateLyrics({ trackId: "songN1", text: song("N"), lang: "ko" });
	await h.until(() => h.running.length === 1, "the first request's first block");
	const second = h.addon.translateLyrics({ trackId: "songN2", text: song("M"), lang: "ko" });
	h.releaseAll();
	const results = await Promise.all([first, second]);
	assert.deepEqual(results.map((result) => result.translation.length), [24, 24]);
});

test("the settings test translation is never stopped by songs and does not wait for a whole song", async () => {
	const h = createHarness({ hold: true });
	const a = h.addon.translateLyrics({ trackId: "songA", text: song("A"), lang: "ko", onLine() {} });
	await h.until(() => h.running.length === 1, "song A's first block");
	const check = h.addon.testConnection();
	const b = h.addon.translateLyrics({ trackId: "songB", text: song("B"), lang: "ko", onLine() {} });
	await assert.rejects(a, isSuperseded);
	h.releaseAll();
	assert.equal(await check, true);
	await b;
	assert.equal(firstLineOf(h.prompts[1]), "今夜はまだ始まったばかり", "the test runs before song B's blocks");
});

test("an unsupported language fails at once without stopping the song being translated", async () => {
	const h = createHarness({ hold: true });
	const a = h.addon.translateLyrics({ trackId: "songA", text: song("A"), lang: "ko", onLine() {} });
	await h.until(() => h.running.length === 1, "song A's first block");
	await assert.rejects(h.addon.translateLyrics({ trackId: "songB", text: "Hej", lang: "sv", onLine() {} }), /cannot translate into Swedish/);
	h.releaseAll();
	assert.equal((await a).translation.length, 24);
});

test("the shared playback clock supersedes a track whose public player item lags behind", async () => {
	const h = createHarness({ hold: true, playing: "songA" });
	let uri = "spotify:track:songA";
	h.window.ivLyricsPlaybackPosition = { getPlayerPlaybackSnapshot: () => ({ uri }) };
	const old = h.addon.translateLyrics({ trackId: "songA", text: song("A"), lang: "ko", onLine() {} });
	await h.until(() => h.running.length === 1);
	uri = "spotify:track:songB";
	const latest = h.addon.translateLyrics({ trackId: "songB", text: song("B"), lang: "ko", onLine() {} });
	await assert.rejects(old, isSuperseded);
	h.releaseAll();
	await latest;
	assert.deepEqual(order(h), ["A0", "B0", "B8", "B16"]);
});

test("the translation budget aborts a running block and lets subsequent work use the same engine", async () => {
	const h = createHarness({ hold: true });
	const expired = h.addon.translateLyrics({ trackId: "songA", text: song("A"), lang: "ko" });
	await h.until(() => h.running.length === 1);
	const [id, timer] = [...h.timers].find(([, entry]) => entry.ms === 90_000);
	h.timers.delete(id);
	h.advance(timer.ms);
	timer.callback();
	await assert.rejects(expired, { name: "TimeoutError" });
	assert.equal(h.calls[0].signal.aborted, true);
	h.releaseAll();
	assert.equal((await h.addon.translateLyrics({ trackId: "songB", text: "new", lang: "ko" })).translation[0], "KO:new");
	assert.deepEqual(order(h), ["A0", "new"]);
	assert.equal(h.loads.length, 1);
	assert.deepEqual([...h.timers.values()].map(entry => entry.ms), [10 * 60_000]);
});

test("a new translation waits for idle retirement to finish before loading a worker", async () => {
	const release = Promise.withResolvers();
	const h = createHarness({ exit: () => release.promise });
	await h.addon.translateLyrics({ text: "before", lang: "ko" });
	const [id, timer] = [...h.timers].find(([, entry]) => entry.ms === 10 * 60_000);
	h.timers.delete(id);
	timer.callback();
	await h.until(() => h.exits === 1);
	const next = h.addon.translateLyrics({ text: "after", lang: "ko" });
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(h.loads.length, 1);
	assert.deepEqual(order(h), ["before"]);
	release.resolve();
	assert.equal((await next).translation[0], "KO:after");
	assert.equal(h.loads.length, 2);
});
