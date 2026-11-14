import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const managerSource = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

const loadManager = async () => {
	const window = {};
	vm.runInNewContext(managerSource, {
		window,
		Spicetify: { LocalStorage: { get: () => null, set: () => {} } },
		console: { log: () => {}, warn: () => {}, error: () => {} },
		setTimeout, clearTimeout,
	});
	await window.AIAddonManager._initPromise;
	return window.AIAddonManager;
};

const waitFor = async (condition) => {
	for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await tick();
	assert.ok(condition(), "condition was not reached");
};

const rateLimited = () => new Error("[ChatGPT] Primary failed: HTTP 429 — rate limited");

const slotAddon = (answer) => ({
	id: "fake",
	generateCharacterPronunciation: async () => { throw new Error("not used"); },
	translateLyrics: answer,
});

test("unit pronunciation goes out as two-line requests, twelve at a time, the opening line alone", async () => {
	const manager = await loadManager();
	let active = 0;
	let peak = 0;
	const sizes = [];
	const addon = slotAddon(async (params) => {
		active += 1;
		peak = Math.max(peak, active);
		const rows = params.text.split("\n");
		sizes.push(rows.length);
		await tick();
		active -= 1;
		return { phonetic: rows.map((row) => row.toUpperCase()) };
	});
	manager.getEnabledProvidersFor = (capability) => (capability === "pronunciation" ? [addon] : []);
	const lines = Array.from({ length: 40 }, (_, i) => ({ i, u: ["a", "b", "c"] }));
	const result = await manager.generatePronunciationSlots({ lines, lang: "en" });
	assert.equal(result.size, 40);
	assert.deepEqual(sizes, [1, ...Array(19).fill(2), 1]);
	assert.equal(peak, 12);
});

test("a request's misses are asked again before slower requests finish", async () => {
	const manager = await loadManager();
	const log = [];
	let releaseSlow;
	const slow = new Promise((resolve) => { releaseSlow = resolve; });
	const addon = slotAddon(async (params) => {
		const repair = /earlier answer/.test(params.phoneticPrompt.userPrompt);
		const rows = params.text.split("\n");
		log.push((repair ? "repair:" : "first:") + rows.join(","));
		if (!repair && rows[0] === "d") await slow;
		return { phonetic: rows.map((row) => (!repair && row === "b" ? "X|Y" : row.toUpperCase())) };
	});
	manager.getEnabledProvidersFor = (capability) => (capability === "pronunciation" ? [addon] : []);
	const lines = ["a", "b", "c", "d", "e", "f"].map((unit, i) => ({ i, u: [unit] }));
	const pending = manager.generatePronunciationSlots({ lines, lang: "en" });
	await waitFor(() => log.includes("repair:b"));
	releaseSlow();
	const result = await pending;
	assert.equal(result.size, 6);
	assert.deepEqual(log, ["first:a", "first:b,c", "first:d,e", "first:f", "repair:b"]);
});

test("a provider that answers nothing is not asked again line by line", async () => {
	const manager = await loadManager();
	let requests = 0;
	const addon = slotAddon(async (params) => {
		requests += 1;
		return { phonetic: params.text.split("\n").map(() => "X|Y") };
	});
	manager.getEnabledProvidersFor = (capability) => (capability === "pronunciation" ? [addon] : []);
	const lines = Array.from({ length: 6 }, (_, i) => ({ i, u: ["a"] }));
	await assert.rejects(manager.generatePronunciationSlots({ lines, lang: "en" }));
	assert.equal(requests, 4, "no repair round when no line worked");
});

test("rate-limited requests halve the requests in flight and are sent again", async () => {
	const manager = await loadManager();
	const attempts = new Map();
	const waits = [];
	let running = 0;
	let limited = false;
	let peakAfterLimit = 0;
	const done = new Set();
	const errors = await manager._runParallelBatches(
		Array.from({ length: 12 }, (_, index) => index),
		async (batch) => {
			running += 1;
			if (limited) peakAfterLimit = Math.max(peakAfterLimit, running);
			const attempt = (attempts.get(batch) || 0) + 1;
			attempts.set(batch, attempt);
			await tick();
			running -= 1;
			if (batch < 4 && attempt === 1) {
				limited = true;
				throw rateLimited();
			}
			done.add(batch);
		},
		{ wait: (ms) => { waits.push(ms); return Promise.resolve(); } },
	);
	assert.deepEqual(plain(errors), []);
	assert.equal(done.size, 12, "every batch went out in the end");
	assert.ok(peakAfterLimit <= 4, `at most half the requests after a 429 (saw ${peakAfterLimit})`);
	assert.deepEqual(waits, [1500, 1500, 1500, 1500]);
});

test("a request that stays rate limited fails after its retries", async () => {
	const manager = await loadManager();
	const waits = [];
	let calls = 0;
	const errors = await manager._runParallelBatches([0], async () => {
		calls += 1;
		throw rateLimited();
	}, { wait: (ms) => { waits.push(ms); return Promise.resolve(); } });
	assert.equal(calls, 4);
	assert.deepEqual(waits, [1500, 3000, 6000]);
	assert.match(errors[0].message, /429/);
});

test("a superseded request stops the remaining batches", async () => {
	const manager = await loadManager();
	const started = [];
	const errors = await manager._runParallelBatches(Array.from({ length: 10 }, (_, index) => index), async (batch) => {
		started.push(batch);
		await tick();
		if (batch === 0) {
			const error = new Error("superseded");
			error.name = "AbortError";
			error.superseded = true;
			throw error;
		}
	}, { limit: 2 });
	assert.deepEqual(started, [0, 1]);
	assert.equal(errors.length, 1);
	assert.equal(errors[0].superseded, true);
});

test("pronunciation timing goes out as small requests side by side and repairs at once", async () => {
	const manager = await loadManager();
	let active = 0;
	let peak = 0;
	const log = [];
	const asked = new Set();
	const addon = {
		id: "fake",
		generateCharacterPronunciation: async (params) => {
			active += 1;
			peak = Math.max(peak, active);
			const items = [...params.characterPronunciationPrompt.matchAll(/"i":(\d+),"n":(\d+),"r":"([^"]*)"/g)]
				.map((match) => ({ i: Number(match[1]), r: match[3] }));
			const wrong = items.some((item) => item.i === 1) && !asked.has(1);
			items.forEach((item) => asked.add(item.i));
			log.push({ items: items.map((item) => item.i) });
			await tick();
			active -= 1;
			return { l: items.map((item) => ({ i: item.i, p: wrong && item.i === 1 ? ["wrong", ""] : [item.r.slice(0, 1), item.r.slice(1)] })) };
		},
	};
	manager.getEnabledProvidersFor = (capability) => (capability === "characterPronunciation" ? [addon] : []);
	const items = Array.from({ length: 30 }, (_, i) => ({ i, r: "ab", u: [["a", 0, 1], ["b", 1, 2]] }));
	const aligned = await manager.generateTimedPronunciation({ items, lyricsText: "a\nb", sourceLang: "en" });
	assert.equal(aligned.size, 30);
	assert.deepEqual(log[0].items, [0], "the opening line goes out alone");
	assert.ok(log.every((entry) => entry.items.length <= 2), "two lines per request");
	assert.equal(peak, 12);
	assert.equal(log.filter((entry) => entry.items.join() === "1").length, 1, "the miss is asked again on its own");
});
