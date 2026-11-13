import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../PronunciationFirst.js", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

const load = ({ enabled = true, manager = null, cache = new Map() } = {}) => {
	const events = [];
	const storage = new Map();
	const window = {
		CONFIG: { visual: { "pronunciation-first": enabled } },
		dispatchEvent: (event) => events.push(event),
		AIAddonManager: manager,
		LyricsService: {
			extractTrackId: (uri) => String(uri).split(":").pop(),
			getWordSupplements: async (...args) => cache.get(args.join("|")) ?? null,
			cacheWordSupplements: async (...args) => { cache.set(args.slice(0, 5).join("|"), args[5]); return true; },
		},
	};
	const context = vm.createContext({
		window,
		CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
		localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
		console: { warn: () => {}, log: () => {} },
		setTimeout,
	});
	vm.runInContext(source, context);
	return { api: window.ivLyricsPronunciationFirst, window, events, storage };
};

const syllable = (text, startTime, endTime) => ({ text, startTime, endTime });

test("non-karaoke lines swap the original and pronunciation values only", () => {
	const { api } = load();
	const lines = [
		{ startTime: 1000, originalText: "今日は", phoneticText: "쿄우와", text: "쿄우와", text2: "오늘은", translationText: "오늘은" },
		{ startTime: 2000, originalText: "Hello", phoneticText: null, text: null, text2: "안녕" },
	];
	const swapped = api.applyToLines(lines, { karaoke: false });
	assert.equal(swapped[0].originalText, "쿄우와");
	assert.equal(swapped[0].phoneticText, "今日は");
	assert.equal(swapped[0].text, "今日は");
	assert.equal(swapped[0].text2, "오늘은");
	assert.equal(swapped[0].startTime, 1000);
	assert.equal(swapped[0].pronunciationFirst, true);
	assert.equal(swapped[1], lines[1], "lines without a pronunciation keep their identity");
	assert.equal(lines[0].originalText, "今日は", "the stored lines are not mutated");
	assert.equal(api.applyToLines(lines, { karaoke: false }), swapped, "unchanged input returns the same display array");
});

test("replacement display keeps non-karaoke lines as they are", () => {
	const { api } = load();
	const lines = [{ originalText: "今日は", phoneticText: "쿄우와", text: "쿄우와" }];
	assert.equal(api.applyToLines(lines, { karaoke: false, lineLevel: false }), lines);
});

test("karaoke syllables keep their timing and carry the pronunciation", () => {
	const { api } = load();
	const line = {
		startTime: 1000,
		originalText: "忘れて",
		phoneticText: "와스레테",
		text: "와스레테",
		syllables: [syllable("忘", 1000, 1400), syllable("れ", 1400, 1600), syllable("て", 1600, 2000)],
	};
	const timed = new Map([["0:line", ["와스", "레", "테"]]]);
	const [swapped] = api.applyToLines([line], { karaoke: true, timed });
	assert.deepEqual(plain(swapped.syllables), [syllable("와스", 1000, 1400), syllable("레", 1400, 1600), syllable("테", 1600, 2000)]);
	assert.equal(swapped.originalText, "와스레테");
	assert.equal(swapped.phoneticText, "忘れて");
	const [approximate] = api.applyToLines([line], { karaoke: true, timed: null });
	assert.equal(approximate.syllables.map((item) => item.text).join(""), "와스레테");
	assert.deepEqual(approximate.syllables.map((item) => item.startTime), [1000, 1400, 1600]);
});

test("a malformed AI result falls back to the proportional split", () => {
	const { api } = load();
	const line = { originalText: "ab", phoneticText: "XY", syllables: [syllable("a", 0, 1), syllable("b", 1, 2)] };
	const [swapped] = api.applyToLines([line], { karaoke: true, timed: new Map([["0:line", ["XY"]]]) });
	assert.deepEqual(swapped.syllables.map((item) => item.text), ["X", "Y"]);
});

test("distribution follows unit length and keeps spaces with the preceding part", () => {
	const { api } = load();
	assert.deepEqual(plain(api.distribute(["忘", "れ", "て", " ", "し"], "wasure te shi")), ["was", "ure ", "te ", "", "shi"]);
	assert.deepEqual(plain(api.distribute(["...", "!"], "abc")), ["abc", ""]);
	assert.deepEqual(plain(api.normalizeParts(["a ", " b", "", "c "], 4)), ["a ", "b", "", "c"]);
});

test("parallel vocal parts swap per part and do not repeat the line original", () => {
	const { api } = load();
	const line = {
		originalText: "lead echo",
		phoneticText: "리드 에코",
		vocals: {
			lead: { text: "lead", phonetic: "리드", syllables: [syllable("lead", 0, 500)] },
			background: [{ text: "echo", phonetic: "에코", syllables: [syllable("echo", 100, 900)] }],
		},
	};
	const [swapped] = api.applyToLines([line], { karaoke: true });
	assert.equal(swapped.vocals.lead.text, "리드");
	assert.equal(swapped.vocals.lead.phonetic, "lead");
	assert.equal(swapped.vocals.lead.syllables[0].text, "리드");
	assert.equal(swapped.vocals.background[0].phonetic, "echo");
	assert.equal(swapped.vocals.background[0].syllables[0].startTime, 100);
	assert.equal(swapped.phoneticText, undefined);
	assert.equal(line.vocals.lead.text, "lead");
});

test("the mode is persisted and announced", () => {
	const { api, window, events } = load({ enabled: false });
	assert.equal(api.isEnabled(), false);
	assert.equal(api.toggle(), true);
	assert.equal(window.CONFIG.visual["pronunciation-first"], true);
	assert.ok(events.some((event) => event.type === api.CHANGED_EVENT && event.detail.enabled === true));
});

test("AI timing is requested once per pronunciation revision and cached", async () => {
	const requests = [];
	const manager = {
		generateTimedPronunciation: async (params) => {
			requests.push(params);
			return new Map([[0, ["와스", "레", "테"]]]);
		},
	};
	const cache = new Map();
	const lines = [{ originalText: "忘れて", phoneticText: "와스레테", syllables: [syllable("忘", 0, 1), syllable("れ", 1, 2), syllable("て", 2, 3)] }];
	const { api, events } = load({ manager, cache });
	const options = { trackUri: "spotify:track:abc", lines, targetLang: "ko", sourceLang: "ja" };
	api.ensureTimed(options);
	api.ensureTimed(options);
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(requests.length, 1);
	assert.deepEqual(plain(requests[0].items[0].u), [["忘", 0, 1], ["れ", 1, 2], ["て", 2, 3]]);
	assert.equal(requests[0].items[0].r, "와스레테");
	assert.deepEqual(plain(api.getTimed("spotify:track:abc").get("0:line")), ["와스", "레", "테"]);
	assert.deepEqual(events.filter((event) => event.type === api.STATUS_EVENT).map((event) => event.detail.phase), ["generating", "complete"]);

	const second = load({ manager, cache });
	second.api.ensureTimed(options);
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(requests.length, 1, "the persistent cache answers a later session");
	assert.deepEqual(plain(second.api.getTimed("spotify:track:abc").get("0:line")), ["와스", "레", "테"]);
});

test("pseudo karaoke and a disabled mode do not ask AI", () => {
	const manager = { generateTimedPronunciation: () => { throw new Error("must not run"); } };
	const lines = [{ originalText: "a", phoneticText: "b", syllables: [syllable("a", 0, 1)] }];
	const { api } = load({ manager });
	assert.equal(api.ensureTimed({ trackUri: "t", lines, karaokeSource: "line-timing-pseudo" }), null);
	assert.equal(load({ enabled: false, manager }).api.ensureTimed({ trackUri: "t", lines }), null);
});

test("AIAddonManager parses only slot-exact unit pronunciations", () => {
	const start = managerSource.indexOf("        _parseTimedPronunciationResult(result, chunk) {");
	const end = managerSource.indexOf("        /**", start);
	assert.ok(start > 0 && end > start);
	const context = vm.createContext({});
	vm.runInContext("globalThis.manager = { " + managerSource.slice(start, end) + " };", context);
	const chunk = [{ i: 0, r: "x", u: [["a", 0, 1], ["b", 1, 2]] }, { i: 1, r: "y z", u: [["c", 0, 1]] },
		{ i: 2, r: "사난 테", u: [["さ", 0, 1], ["な", 1, 2]] }, { i: 3, r: "지분 라시", u: [["自分", 0, 1], ["らし", 1, 2]] }];
	const parsed = context.manager._parseTimedPronunciationResult({ l: [
		{ i: 0, p: ["x", null] },
		{ i: 1, p: ["y", "z"] },
		{ i: 7, p: ["w"] },
		{ i: 2, p: ["사나", "은테"] },
		{ i: 3, p: ["지분", "라시"] },
	] }, chunk);
	assert.deepEqual(plain([...parsed]), [[0, ["x", ""]], [3, ["지분", "라시"]]],
		"a split that changes letters is dropped (and repaired); a dropped space is accepted");
});

test("the timing prompt carries the full lyrics, units and pronunciation", () => {
	const start = managerSource.indexOf("    function buildTimedPronunciationPrompt(");
	const end = managerSource.indexOf("    function buildCharacterPronunciationPrompt(", start);
	const context = vm.createContext({});
	vm.runInContext(managerSource.slice(start, end) + "\nglobalThis.build = buildTimedPronunciationPrompt;", context);
	const prompt = context.build({ items: [{ i: 3, r: "와스레테", u: [["忘", 0, 400]] }], lyricsText: "忘れて\n次の行", sourceLang: "ja" });
	assert.match(prompt, /忘れて\n次の行/);
	assert.match(prompt, /"i":3,"n":1,"r":"와스레테","u":\[\["忘",0,400\]\]/);
	assert.match(prompt, /p must contain exactly n strings/);
});
