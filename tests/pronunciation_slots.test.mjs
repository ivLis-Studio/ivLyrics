import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const slotsSource = readFileSync(new URL("../PronunciationSlots.js", import.meta.url), "utf8");
const firstSource = readFileSync(new URL("../PronunciationFirst.js", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

const load = ({ manager = null, enabled = true } = {}) => {
	const events = [];
	const window = {
		CONFIG: { visual: { "pronunciation-first": enabled } },
		dispatchEvent: (event) => events.push(event),
		AIAddonManager: manager,
		LyricsService: {
			getTranslationCacheId: (uri) => String(uri).split(":").pop(),
			extractTrackId: (uri) => String(uri).split(":").pop(),
			getWordSupplements: async () => null,
			cacheWordSupplements: async () => true,
		},
	};
	const context = vm.createContext({
		window,
		Intl,
		CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
		localStorage: { getItem: () => null, setItem: () => {} },
		console: { warn: () => {}, log: () => {} },
		setTimeout,
	});
	vm.runInContext(slotsSource, context);
	vm.runInContext(firstSource, context);
	return { slots: window.ivLyricsPronunciationSlots, first: window.ivLyricsPronunciationFirst, window, events };
};

const unitTexts = (units) => plain(units.map((unit) => (unit.gapBefore ? "_" : "") + unit.text));
const syllable = (text, startTime, endTime) => ({ text, startTime, endTime });

test("lines split into characters for CJK text and words elsewhere", () => {
	const { slots } = load();
	assert.deepEqual(unitTexts(slots.splitUnits("5000マイル走って 息を")), ["5000", "マ", "イ", "ル", "走", "っ", "て", "_息", "を"]);
	assert.deepEqual(unitTexts(slots.splitUnits("Let's go 開けて？")), ["Let's", "_go", "_開", "け", "て？"]);
	assert.deepEqual(unitTexts(slots.splitUnits("사랑해 너를")), ["사", "랑", "해", "_너", "를"]);
	assert.deepEqual(unitTexts(slots.splitUnits("「惑星」")), ["「惑", "星」"]);
	assert.deepEqual(unitTexts(slots.splitUnits("don't stop, ... ♪")), ["don't", "_stop,", "_...", "_♪"]);
	assert.deepEqual(unitTexts(slots.splitUnits("a ! b")), ["a", "_!", "_b"]);
	const units = slots.splitUnits("  夢 ");
	assert.deepEqual(plain(units.map(({ start, end }) => [start, end])), [[2, 3]]);
});

test("joined slots restore the original's spaces and AI word breaks", () => {
	const { slots } = load();
	assert.equal(slots.join(slots.splitUnits("夢ならば どれほど"), ["yume ", "na", "ra", "ba", "do", "re", "ho", "do"]), "yume naraba dorehodo");
	assert.equal(slots.join(slots.splitUnits("사랑해 너를"), ["sa", "rang", "hae", "neo", "reul"]), "saranghae neoreul");
	assert.equal(slots.join(slots.splitUnits("a ! b"), ["A", "", "B"]), "A B");
});

test("karaoke syllables take the slots of the units they sing", () => {
	const { slots, first } = load();
	const parts = ["yume ", "na", "ra", "ba", "do", "re", "ho", "do"];
	assert.deepEqual(plain(slots.deriveSyllableParts(["夢", "なら", "ば ", "どれ", "ほど"], parts, first.distribute)),
		["yume ", "nara", "ba ", "dore", "hodo"]);
	// A word unit sung over two syllables is spread over them.
	assert.deepEqual(plain(slots.deriveSyllableParts(["hel", "lo ", "world"], ["헬로", "월드"], first.distribute)),
		["헬", "로 ", "월드"]);
	assert.equal(slots.deriveSyllableParts(["other"], parts, first.distribute), null, "different text has other units");
});

test("records keep slots per line and the registry finds them by text", () => {
	const { slots, events } = load();
	const text = "夢ならば\n♪\n今日も";
	const record = {
		phonetic: ["yumenaraba", "♪", "kyou mo"],
		slots: slots.buildRecordSlots(3, new Map([[0, ["yume", "na", "ra", "ba"]], [2, ["kyou ", "", "mo"]]])),
	};
	assert.deepEqual(plain(record.slots.lines[1]), null);
	const lines = slots.readRecordLines(text, record);
	assert.equal(lines[1], null);
	assert.deepEqual(plain(lines[2].parts), ["kyou ", "", "mo"]);
	assert.equal(slots.remember("abc", text, record), true);
	assert.equal(slots.remember("abc", text, record), false, "the same slots do not refresh the display again");
	assert.deepEqual(plain(slots.lookup("abc", " 今日も ").parts), ["kyou ", "", "mo"]);
	assert.equal(events.filter((event) => event.type === "ivLyrics:pronunciation-first-updated").length, 1);
	assert.deepEqual(plain(slots.readRecordLines(text, { phonetic: [], slots: { v: 99, lines: [] } })), [null, null, null]);
});

test("pronunciation-first uses the slots without asking AI", async () => {
	const manager = { generateTimedPronunciation: async () => { throw new Error("must not run"); } };
	const { slots, first } = load({ manager });
	slots.remember("abc", "忘れて", { slots: slots.buildRecordSlots(1, [["와스", "레", "테"]]) });
	const lines = [{ originalText: "忘れて", phoneticText: "와스레테", syllables: [syllable("忘", 0, 1), syllable("れて", 1, 3)] }];
	const timed = first.getTimed("spotify:track:abc", lines);
	assert.deepEqual(plain(timed.get("0:line")), ["와스", "레테"]);
	assert.equal(first.getTimed("spotify:track:abc", lines), timed, "the same lines keep the same map");
	assert.equal(first.ensureTimed({ trackUri: "spotify:track:abc", lines }), null);
	const [swapped] = first.applyToLines(lines, { karaoke: true, timed });
	assert.deepEqual(swapped.syllables.map((item) => item.text), ["와스", "레테"]);
	// An edited line pronunciation no longer matches the slots.
	const edited = [{ ...lines[0], phoneticText: "와스레떼" }];
	assert.equal(first.getTimed("spotify:track:abc", edited), null);
});

test("only lines without slots are sent for AI timing", async () => {
	const requests = [];
	const manager = {
		generateTimedPronunciation: async (params) => {
			requests.push(params);
			return new Map([[0, ["X", "Y"]]]);
		},
	};
	const { slots, first } = load({ manager });
	slots.remember("abc", "忘れて", { slots: slots.buildRecordSlots(1, [["와스", "레", "테"]]) });
	const lines = [
		{ originalText: "忘れて", phoneticText: "와스레테", syllables: [syllable("忘", 0, 1), syllable("れて", 1, 3)] },
		{ originalText: "ab", phoneticText: "XY", syllables: [syllable("a", 3, 4), syllable("b", 4, 5)] },
	];
	first.ensureTimed({ trackUri: "spotify:track:abc", lines, targetLang: "ko" });
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(requests.length, 1);
	assert.deepEqual(plain(requests[0].items.map((item) => item.r)), ["XY"]);
	const timed = first.getTimed("spotify:track:abc", lines);
	assert.deepEqual(plain(timed.get("0:line")), ["와스", "레테"]);
	assert.deepEqual(plain(timed.get("1:line")), ["X", "Y"]);
});

test("the slotted request joins slots and falls back per line", async () => {
	const { slots } = load();
	const calls = [];
	const streamed = [];
	const manager = {
		generatePronunciationSlots: async (params) => {
			calls.push(["slots", plain(params.lines)]);
			params.onSlots(0, ["yume", "na", "ra", "ba"]);
			return new Map([[0, ["yume", "na", "ra", "ba"]], [2, ["x"]]]);
		},
		translateLyrics: async (params) => {
			calls.push(["line", params.text]);
			params.onLine(0, "kyou mo");
			return { phonetic: ["kyou mo"] };
		},
	};
	const result = await slots.requestPronunciation(manager, {
		text: "夢ならば\n♪\n今日も",
		lang: "en",
		onLine: (index, value) => streamed.push([index, value]),
	});
	assert.deepEqual(plain(result.phonetic), ["yumenaraba", "♪", "kyou mo"]);
	assert.deepEqual(plain(result.slots), { v: slots.VERSION, lines: [["yume", "na", "ra", "ba"], null, null] });
	assert.deepEqual(calls, [["slots", [{ i: 0, u: ["夢", "な", "ら", "ば"] }, { i: 2, u: ["今", "日", "も"] }]], ["line", "今日も"]]);
	assert.deepEqual(streamed, [[0, "yumenaraba"], [2, "kyou mo"]]);
});

test("without unit pronunciation the whole song uses the line request", async () => {
	const { slots } = load();
	const result = await slots.requestPronunciation({
		generatePronunciationSlots: async () => { throw new Error("no provider"); },
		translateLyrics: async (params) => ({ phonetic: params.text.split("\n").map((line) => line + "!") }),
	}, { text: "a\nb" });
	assert.deepEqual(plain(result), { phonetic: ["a!", "b!"] });
});

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

test("the slot prompt sends units as | fields and keeps the notation", async () => {
	const manager = await loadManager();
	const prompt = manager.buildPronunciationSlotPrompt({
		lines: [["夢", "な", "ら", "ば"], ["hold", "me"]],
		lang: "ko",
		pronunciationNotation: "latin",
		sourceLang: "ja",
	});
	assert.equal(prompt.lineCount, 2);
	assert.match(prompt.userPrompt, /<lyrics>\n夢\|な\|ら\|ば\nhold\|me\n<\/lyrics>/);
	assert.match(prompt.systemPrompt, /exactly the same number of \| separators/);
	assert.match(prompt.systemPrompt, /standard Latin alphabet/);
	assert.match(prompt.systemPrompt, /yume naraba/);
	assert.match(manager.buildPronunciationSlotPrompt({ lines: [["a"]], repair: true }).userPrompt, /wrong number of \| fields/);
});

test("answered rows keep only exact fields in the right script", async () => {
	const manager = await loadManager();
	const row = (value, expected, notation = "translation") => plain(manager.parsePronunciationSlotRow(value, expected, notation));
	assert.deepEqual(row("유메|나|라|바 |도", 5), ["유메", "나", "라", "바 ", "도"]);
	assert.deepEqual(row("쿄오||모", 3), ["쿄오", "", "모"]);
	assert.deepEqual(row("|a|b|", 2), ["a", "b"], "outer pipes");
	assert.deepEqual(row("yume | na | ra", 3, "latin"), ["yume", "na", "ra"], "padded separators carry no word breaks");
	assert.deepEqual(row("유메｜나", 2), ["유메", "나"], "full-width separator");
	assert.equal(row("a|b", 3), null, "field count");
	assert.equal(row("||", 3), null, "no sound");
	assert.equal(row("라|ㄴ", 2), null, "a lone Hangul letter is asked again");
	assert.equal(row("유메|나", 2, "latin"), null, "wrong writing system for Latin notation");
});

test("unit pronunciation streams through the lyric request and repairs misses", async () => {
	const manager = await loadManager();
	const requests = [];
	const addon = {
		id: "fake",
		generateCharacterPronunciation: async () => { throw new Error("not used"); },
		translateLyrics: async (params) => {
			const repair = /earlier answer/.test(params.phoneticPrompt.userPrompt);
			requests.push({ text: params.text, phonetic: params.wantSmartPhonetic, repair });
			const answer = params.text.split("\n").map((row) => (row === "x" ? "A" : (repair ? "B" : "B|C")));
			answer.forEach((line, index) => params.onLine(index, line));
			return { phonetic: answer };
		},
	};
	manager.getEnabledProvidersFor = (capability) => (capability === "pronunciation" ? [addon] : []);
	const seen = [];
	const result = await manager.generatePronunciationSlots({
		lines: [{ i: 0, u: ["x"] }, { i: 3, u: ["y"] }],
		lang: "en",
		onSlots: (index, parts) => seen.push([index, parts]),
	});
	assert.deepEqual(plain([...result]), [[0, ["A"]], [3, ["B"]]]);
	assert.deepEqual(plain(requests), [
		{ text: "x", phonetic: true, repair: false },
		{ text: "y", phonetic: true, repair: false },
		{ text: "y", phonetic: true, repair: true },
	]);
	assert.deepEqual(plain(seen), [[0, ["A"]], [0, ["A"]], [3, ["B"]], [3, ["B"]]]);
});
