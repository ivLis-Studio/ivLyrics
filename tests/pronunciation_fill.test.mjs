import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Pronunciation fill: with pronunciation-first off, karaoke lines carry the
// timed units of their pronunciation row and the singing row fills along them.
const source = readFileSync(new URL("../PronunciationFirst.js", import.meta.url), "utf8");
const pages = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const settings = readFileSync(new URL("../Settings.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const syllable = (text, startTime, endTime) => ({ text, startTime, endTime });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const load = ({ first = false, fill = true, synced = true, manager = null } = {}) => {
	const window = {
		CONFIG: { visual: { "pronunciation-first": first, "pronunciation-karaoke-fill": fill, "synced-pronunciation": synced } },
		dispatchEvent: () => {},
		AIAddonManager: manager,
		LyricsService: {
			extractTrackId: (uri) => String(uri).split(":").pop(),
			getWordSupplements: async () => null,
			cacheWordSupplements: async () => true,
		},
	};
	const context = vm.createContext({
		window,
		CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
		localStorage: { getItem: () => null, setItem: () => {} },
		console: { warn: () => {}, log: () => {} },
		setTimeout,
	});
	vm.runInContext(source, context);
	return { api: window.ivLyricsPronunciationFirst, window };
};

const karaokeLine = () => ({
	startTime: 1000,
	originalText: "忘れて",
	phoneticText: "와스레테",
	syllables: [syllable("忘", 1000, 1400), syllable("れ", 1400, 1600), syllable("て", 1600, 2000)],
});

test("the fill applies only while pronunciation-first is off, and either asks for AI timing", () => {
	assert.equal(load({ first: false, fill: true }).api.isFillEnabled(), true);
	assert.equal(load({ first: true, fill: true }).api.isFillEnabled(), false, "pronunciation-first takes precedence");
	assert.equal(load({ first: false, fill: false }).api.needsTiming(), false);
	assert.equal(load({ first: true, fill: false }).api.needsTiming(), true);
	assert.equal(load({ fill: true, synced: false }).api.isFillEnabled(), false, "the fill needs synced pronunciation");
	assert.equal(load({ fill: true, synced: false }).api.needsTiming(), false);
	assert.equal(load({ first: false, fill: true }).api.needsTiming(), true);
});

test("karaoke lines carry timed pronunciation units without changing what is shown", () => {
	const { api } = load();
	const lines = [karaokeLine(), { startTime: 3000, originalText: "Hello", syllables: [syllable("Hello", 3000, 3500)] }];
	const timed = new Map([["0:line", ["와스", "레", "테"]]]);
	const filled = api.applyFillToLines(lines, { timed });
	assert.deepEqual(plain(filled[0].phoneticUnits), [syllable("와스", 1000, 1400), syllable("레", 1400, 1600), syllable("테", 1600, 2000)]);
	assert.equal(filled[0].phoneticText, "와스레테", "the pronunciation row text is unchanged");
	assert.equal(filled[0].originalText, "忘れて", "the original row is unchanged");
	assert.equal(filled[0].pronunciationFirst, undefined);
	assert.equal(filled[1], lines[1], "lines without a pronunciation keep their identity");
	assert.equal(lines[0].phoneticUnits, undefined, "stored lines are not mutated");
	assert.equal(api.applyFillToLines(lines, { timed }), filled, "repeated calls return the same display array");
	const approximate = api.applyFillToLines(lines, { timed: null });
	assert.equal(approximate[0].phoneticUnits.map((unit) => unit.text).join(""), "와스레테", "proportional split until AI timing arrives");
});

test("a lone lead fills the line row and parallel voices fill their own rows", () => {
	const { api } = load();
	const lead = { syllables: [syllable("a", 0, 500), syllable("b", 500, 1000)], phonetic: "" };
	const [solo] = api.applyFillToLines([{ originalText: "ab", phoneticText: "에이 비", vocals: { lead, background: [] } }]);
	assert.equal(solo.phoneticUnits.map((unit) => unit.text).join(""), "에이 비");
	const background = [{ syllables: [syllable("c", 600, 900)], phonetic: "시" }];
	const [parallel] = api.applyFillToLines([{
		originalText: "ab (c)", phoneticText: "에이비 시",
		vocals: { lead: { ...lead, phonetic: "에이비" }, background },
	}]);
	assert.equal(parallel.phoneticUnits, undefined, "a parallel line has no single row");
	assert.equal(parallel.vocals.lead.phoneticUnits.map((unit) => unit.text).join(""), "에이비");
	assert.deepEqual(plain(parallel.vocals.background[0].phoneticUnits), [syllable("시", 600, 900)]);
	assert.equal(background[0].phoneticUnits, undefined);
});

+test("an AI split keeps the pronunciation's own spaces and never its changed letters", () => {
	const { api } = load();
	assert.deepEqual(plain(api.alignParts(["와라우", "요오", "니 나", "쿠"], "와라우 요오니 나쿠")), ["와라우 ", "요오", "니 나", "쿠"]);
	assert.deepEqual(plain(api.alignParts(["센넨", "츠즈쿠", "니주우", "요지노", "타비에"], "센넨 츠즈쿠 니주우요지노 타비에")),
		["센넨 ", "츠즈쿠 ", "니주우", "요지노 ", "타비에"], "dropped word spaces return");
	assert.deepEqual(plain(api.alignParts(["", "와스 ", "레테"], "와스레테")), ["", "와스", "레테"], "moved spaces follow the pronunciation");
	assert.equal(api.alignParts(["지분", "라시", "사나", "은테"], "지분라시사난테"), null, "changed letters are rejected");
	const line = {
		startTime: 0, originalText: "笑うように泣く", phoneticText: "와라우 요오니 나쿠",
		syllables: [syllable("笑う", 0, 400), syllable("よう", 400, 800), syllable("に泣", 800, 1200), syllable("く", 1200, 1600)],
	};
	const [filled] = api.applyFillToLines([line], { timed: new Map([["0:line", ["와라우", "요오", "니 나", "쿠"]]]) });
	assert.deepEqual(plain(filled.phoneticUnits.map((unit) => unit.text)), ["와라우 ", "요오", "니 나", "쿠"]);
	const [swapped] = api.applyToLines([line], { karaoke: true, timed: new Map([["0:line", ["와라우", "요오", "니 나", "쿠"]]]) });
	assert.equal(swapped.syllables.map((unit) => unit.text).join(""), "와라우 요오니 나쿠", "pronunciation-first shows the same spacing");
	const [rejected] = api.applyFillToLines([line], { timed: new Map([["0:line", ["와라", "우요오", "니", "나쿠쿠"]]]) });
	assert.equal(rejected.phoneticUnits.map((unit) => unit.text).join(""), "와라우 요오니 나쿠", "a changed split falls back to the proportional split");
});


test("a stored split is only used for the lines it was made for", async () => {
	const manager = { generateTimedPronunciation: async () => new Map([[0, ["와스", "레", "테"]]]) };
	const { api } = load({ manager });
	const lines = [karaokeLine()];
	assert.ok(api.ensureTimed({ trackUri: "spotify:track:x", lines, targetLang: "ko" }), "the fill alone asks AI for unit timing");
	await tick();
	await tick();
	assert.deepEqual(plain(api.getTimed("spotify:track:x", lines).get("0:line")), ["와스", "레", "테"]);
	assert.ok(api.getTimed("spotify:track:x", [karaokeLine()]), "equal content in a new array keeps the split");
	const regenerated = [{ ...karaokeLine(), phoneticText: "와수레테" }];
	assert.equal(api.getTimed("spotify:track:x", regenerated), null, "a new pronunciation never shows the old split");
	const retimed = [{ ...karaokeLine(), syllables: [syllable("忘れ", 1000, 1600), syllable("て", 1600, 2000)] }];
	assert.equal(api.getTimed("spotify:track:x", retimed), null, "new unit timing never shows the old split");
	assert.ok(api.getTimed("spotify:track:x"), "callers without lines keep the previous behaviour");
});

// ---------------------------------------------------------------------------
// Rendering (Pages.js)
// ---------------------------------------------------------------------------

const extract = (name) => {
	const start = pages.indexOf("const " + name + " = ");
	assert.ok(start >= 0, name);
	const end = pages.indexOf("\n};\n", start);
	const semicolon = pages.indexOf(";\n", start);
	return pages.slice(start, semicolon < end && !pages.slice(start, semicolon).includes("=>") ? semicolon + 2 : end + 4);
};

const renderHarness = () => {
	const effects = [];
	const attached = [];
	const block = pages.slice(pages.indexOf("const PHONETIC_FILL_ATTRIBUTE"), pages.indexOf("const playLyricsTrackReveal = "));
	const context = vm.createContext({
		react: {
			createElement: (tag, props, ...children) => ({ tag, props: props || {}, children: children.flat() }),
			memo: (component) => component,
			useLayoutEffect: (effect) => effects.push(effect),
		},
		useRef: (value) => ({ current: value }),
		useEffect: () => {},
		performance: { now: () => 0 },
		CONFIG: { visual: { "inactive-color": "gray" } },
		applyKaraokeFillCorrectionCurve: (value) => value,
		attached,
	});
	vm.runInContext([
		extract("getKaraokeFillSoftEdge"), extract("getKaraokeLiveFill"), extract("setKaraokeLiveValue"),
		extract("paintKaraokeLiveUnit"), extract("paintKaraokeLiveEntry"),
		"const KaraokeLivePainter = { attach: (entry) => attached.push(entry), release: () => {} };",
		block,
		"globalThis.api = { getPhoneticFillUnits, PhoneticFillText, renderPhoneticFillSubLine, paintKaraokeLiveEntry };",
	].join("\n"), context);
	return { api: context.api, effects, attached };
};

const units = [syllable("와스", 1000, 1400), syllable("레", 1400, 1600), syllable("테 ", 1600, 2000)];
const spans = (tree) => tree.children.filter((child) => child?.props?.["data-phonetic-fill"] !== undefined);

test("fill units are used only when they spell the row's pronunciation", () => {
	const { api } = renderHarness();
	assert.equal(api.getPhoneticFillUnits(units, "와스레테"), units);
	assert.equal(api.getPhoneticFillUnits(units, " 와스레테  "), units);
	assert.equal(api.getPhoneticFillUnits(units, "와수레테"), null);
	assert.equal(api.getPhoneticFillUnits(null, "와스레테"), null);
	assert.equal(api.getPhoneticFillUnits(units, ""), null);
});

test("the singing row shows unit states; other rows keep the row color", () => {
	const { api } = renderHarness();
	const active = spans(api.PhoneticFillText({ units, position: 1500, active: true }));
	assert.deepEqual(active.map((span) => span.props.className.replace("lyrics-phonetic-fill-unit ", "")),
		["lyrics-phonetic-fill-unit--done", "lyrics-phonetic-fill-unit--active", "lyrics-phonetic-fill-unit--pending"]);
	assert.equal(active[1].props["data-text"], "레");
	assert.equal(active[1].props.style["--karaoke-char-fill"], "50.00%", "without a live clock the row paints its own fill");
	assert.deepEqual(active.map((span) => span.children.join("")), ["와스", "레", "테 "], "the text is the pronunciation");
	const idle = spans(api.PhoneticFillText({ units, position: 1500, active: false }));
	assert.ok(idle.every((span) => span.props.className === "lyrics-phonetic-fill-unit" && !span.props.style));
	const live = spans(api.PhoneticFillText({ units, position: 1500, active: true, liveClock: { getPosition: () => 1500 } }));
	assert.equal(live[1].props.style, null, "a live row leaves the fill edge to the painter");
});

test("the live painter writes the active unit's fill edge from the clock", () => {
	const { api, effects, attached } = renderHarness();
	let clock = 1450;
	const tree = api.PhoneticFillText({ units, position: 1450, active: true, liveClock: { getPosition: () => clock } });
	const elements = spans(tree).map((span) => ({
		attribute: String(span.props["data-phonetic-fill"]),
		values: new Map(),
		getAttribute() { return this.attribute; },
		style: { setProperty(name, value) { elements.find((e) => e.style === this).values.set(name, value); }, removeProperty() {} },
	}));
	tree.props.ref.current = { querySelectorAll: () => elements };
	effects.forEach((effect) => effect());
	assert.equal(attached.length, 1, "the row joins the shared painter");
	assert.equal(elements[1].values.get("--karaoke-char-fill"), "25.00%");
	assert.equal(elements[0].values.size, 0, "finished and future units are left to their state class");
	clock = 1550;
	api.paintKaraokeLiveEntry(attached[0], 16);
	assert.equal(elements[1].values.get("--karaoke-char-fill"), "75.00%");
});

test("styles, settings, defaults and wiring are present", () => {
	assert.match(styles, /\.lyrics-phonetic-fill-unit--active::after \{[^}]*content: attr\(data-text\);[^}]*text-shadow: none;[^}]*mask-image/s);
	assert.match(styles, /\.lyrics-phonetic-fill-unit--done \{\s*color: var\(--lyrics-color-active\);/);
	assert.match(settings, /"pronunciation-karaoke-fill": false/);
	assert.match(settings, /key: "pronunciation-karaoke-fill",\s*type: ConfigSlider/);
	assert.match(index, /"pronunciation-karaoke-fill": StorageManager\.get\(\s*"ivLyrics:visual:pronunciation-karaoke-fill",\s*false/);
	assert.match(index, /api\.applyFillToLines\(lyrics, \{ timed \}\)/);
	assert.match(pages, /phoneticUnits: part\.phoneticUnits \|\| null/);
	assert.doesNotMatch(pages.slice(pages.indexOf("const PhoneticFillText"), pages.indexOf("const renderPhoneticFillSubLine")),
		/bounce|glow|expressive/i, "the fill applies no other karaoke effect");
});
