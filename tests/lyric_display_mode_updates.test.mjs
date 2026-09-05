import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const root = fileURLToPath(new URL("..", import.meta.url));
// Set IVLYRICS_DISPLAY_TEST_REVISION=5f8e57e to reproduce these regressions
// against the previous implementation without modifying the working tree.
const readSource = file => process.env.IVLYRICS_DISPLAY_TEST_REVISION
	? execFileSync("git", ["show", `${process.env.IVLYRICS_DISPLAY_TEST_REVISION}:${file}`], { cwd: root, encoding: "utf8" })
	: readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const source = readSource("Pages.js");
const section = (text, startMarker, endMarker) => {
	const start = text.indexOf(startMarker);
	const end = text.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
	return text.slice(start, end);
};
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
	: tree?.type ? [tree, ...nodes(tree.children)] : [];
const sameDependencies = (a, b) => a && b && a.length === b.length
	&& a.every((value, index) => Object.is(value, b[index]));

// Execute the actual page components, full synced engine, display helpers and
// render-item projection. Persist hook slots just as React does: a useMemo
// callback does not run when its dependency identities have not changed.
// Browser layout/effects and the final DOM child renderer are outside this test.
const createHarness = (page, { mode = "replace", scrolling = false } = {}) => {
	const hooks = [];
	let cursor = 0;
	let position = 1200;
	let locale = "en";
	let converterReady = false;
	let originalRenders = 0;
	const useMemo = (factory, dependencies) => {
		const index = cursor++;
		if (!hooks[index] || !sameDependencies(hooks[index].dependencies, dependencies)) {
			hooks[index] = { value: factory(), dependencies };
		}
		return hooks[index].value;
	};
	const useState = initial => {
		const index = cursor++;
		hooks[index] ??= { value: typeof initial === "function" ? initial() : initial };
		return [hooks[index].value, next => {
			hooks[index].value = typeof next === "function" ? next(hooks[index].value) : next;
		}];
	};
	const useRef = current => useMemo(() => ({ current }), []);
	const useCallback = (callback, dependencies) => useMemo(() => callback, dependencies);
	const useEffect = () => { cursor++; };
	const react = {
		memo: component => component,
		createElement: (type, props, ...children) => ({ type, props, children }),
	};
	const CONFIG = { visual: {
		"translate:display-mode": mode,
		"lines-before": 3,
		"lines-after": 3,
	} };
	const window = {
		Utils: { getDetectedLanguage: () => locale },
		FuriganaConverter: { isAvailable: () => converterReady },
	};
	const LyricsLineBlock = () => null;
	const context = vm.createContext({
		react, CONFIG, window, I18n: { t: key => key },
		useMemo, useState, useRef, useCallback, useEffect, useSyncedLayoutEffect: useEffect,
		useLyricsPlaybackPosition: () => position,
		useScrollActivity: () => ({ isScrolling: scrolling, handleContainerClick() {} }),
		Utils: {
			applyFuriganaIfEnabled(text) {
				originalRenders++;
				return CONFIG.visual["furigana-enabled"] && converterReady && locale === "ja"
					? `<ruby>${text}<rt>reading</rt></ruby>` : text;
			},
			formatLyricLineToCopy: (...parts) => parts.filter(Boolean).join("\n"),
		},
		emptyLine: { startTime: 0, endTime: 0, text: [] },
		getInterludeInfo: () => ({ isInterlude: false }),
		createActiveTrailingKaraokeInterludeLine: () => null,
		getKaraokeSpeakerStyle: () => ({}),
		getKaraokeLineMetaClass: () => "",
		toFiniteTime: value => value == null || !Number.isFinite(Number(value)) ? null : Number(value),
		EMPTY_GLOBAL_CHAR_STATE: { globalCharOffsets: [], activeGlobalCharIndex: -1 },
		KARAOKE_COMPLETION_POSITION_OFFSET_MS: 900,
		KARAOKE_RELEASE_WINDOW_MS: 820,
		LyricsLineBlock, IdlingIndicator: () => null, SearchBar: () => null,
	});
	vm.runInContext([
		section(source, "const safeRenderText =", "function renderLyricsUnavailable"),
		section(source, "const normalizeUnsyncedLyrics =", "const getCopyableText ="),
		section(source, "const buildPreparedSyncedLyrics =", "const LyricsLineBlock ="),
		section(source, "const renderLyricsItems =", "// Global animation manager"),
		section(source, "const SyncedLyricsPage =", "// Global SearchBar manager"),
		section(source, "const SyncedExpandedLyricsPage =", "const LoadingIcon ="),
		"globalThis.pages = { compact: SyncedLyricsPage, expanded: SyncedExpandedLyricsPage, plain: UnsyncedLyricsPage };",
	].join("\n"), context);
	return {
		CONFIG,
		get originalRenders() { return originalRenders; },
		setLocale(value) { locale = value; },
		setConverterReady(value) { converterReady = value; },
		render(lyrics, { time = position, settingsRevision = 0 } = {}) {
			cursor = 0;
			position = time;
			const tree = context.pages[page]({ lyrics, isKara: false, reRenderLyricsPage: settingsRevision });
			return nodes(tree).filter(node => node.type === LyricsLineBlock && node.props.originalText)
				.map(node => node.props);
		},
	};
};

const original = "작은 빛이 머문다";
const pronunciation = "jageun bichi meomunda";
const translation = "A little light stays";
const makeLyrics = ({ phonetic = true, translated = true } = {}) => [{
	text: original, originalText: original, startTime: 1000, endTime: 6000,
	...(phonetic ? { phoneticText: pronunciation } : {}),
	...(translated ? { translationText: translation } : {}),
}];
const assertBelow = (rows, { phonetic = true, translated = true } = {}) => {
	assert.equal(rows.length, 1);
	assert.equal(rows[0].mainText, original, "below mode must preserve the original as the main text");
	assert.equal(rows[0].subText || null, phonetic ? pronunciation : null);
	assert.equal(rows[0].subText2 || null, translated ? translation : null);
};

for (const page of ["compact", "expanded", "plain"]) {
	test(`${page}: replace to below refreshes cached rows with the same lyric array`, () => {
		for (const supplements of [{}, { phonetic: false }, { translated: false }]) {
			const h = createHarness(page);
			const lyrics = makeLyrics(supplements);
			const before = JSON.stringify(lyrics);
			assert.equal(h.render(lyrics)[0].mainText, supplements.phonetic === false ? translation : pronunciation);
			h.CONFIG.visual["translate:display-mode"] = "below";
			assertBelow(h.render(lyrics, { settingsRevision: 1 }), supplements);
			assert.equal(JSON.stringify(lyrics), before, "display changes must not overwrite provider lyrics");
		}
	});

	test(`${page}: explicit replacement can be selected again without reloading lyrics`, () => {
		const h = createHarness(page, { mode: "below" });
		const lyrics = makeLyrics();
		assertBelow(h.render(lyrics));
		h.CONFIG.visual["translate:display-mode"] = "replace";
		const rows = h.render(lyrics, { settingsRevision: 1 });
		assert.equal(rows[0].mainText, pronunciation, "explicit replacement retains pronunciation-first ordering");
		assert.equal(rows[0].originalText, original);
		h.CONFIG.visual["translate:display-mode"] = "below";
		assertBelow(h.render(lyrics, { settingsRevision: 2 }));
	});

	test(`${page}: late auxiliary results honor the current below setting`, async () => {
		const h = createHarness(page);
		const raw = makeLyrics({ phonetic: false, translated: false });
		assert.equal(h.render(raw)[0].mainText, original);
		let finishPhonetic;
		const phoneticResult = new Promise(resolve => { finishPhonetic = resolve; });
		h.CONFIG.visual["translate:display-mode"] = "below";
		assertBelow(h.render(raw, { settingsRevision: 1 }), { phonetic: false, translated: false });
		finishPhonetic(raw.map(line => ({ ...line, phoneticText: pronunciation })));
		const withPhonetic = await phoneticResult;
		assertBelow(h.render(withPhonetic), { translated: false });
		const withBoth = await Promise.resolve(withPhonetic.map(line => ({ ...line, translationText: translation })));
		assertBelow(h.render(withBoth));
		assert.equal(raw[0].phoneticText, undefined);
		assert.equal(raw[0].translationText, undefined);
	});

	test(`${page}: playback and unrelated revisions retain prepared display text`, () => {
		const h = createHarness(page, { mode: "below" });
		const lyrics = makeLyrics();
		assertBelow(h.render(lyrics));
		const prepared = h.originalRenders;
		assert.ok(prepared > 0, "the initial render must execute text preparation");
		for (let frame = 0; frame < 180; frame++) {
			assertBelow(h.render(lyrics, { time: 1200 + frame * 16, settingsRevision: frame % 2 }));
		}
		assert.equal(h.originalRenders, prepared, "playback must not defeat the display preparation cache");
	});

	test(`${page}: original-text preparation follows furigana readiness and locale changes`, () => {
		const h = createHarness(page, { mode: "below" });
		const lyrics = makeLyrics();
		assertBelow(h.render(lyrics));
		h.CONFIG.visual["furigana-enabled"] = true;
		h.setLocale("ja");
		assertBelow(h.render(lyrics));
		h.setConverterReady(true);
		assert.match(h.render(lyrics)[0].mainText, /^<ruby>/);
		h.setLocale("en");
		assertBelow(h.render(lyrics));
		h.setLocale("ja");
		assert.match(h.render(lyrics)[0].mainText, /^<ruby>/);
		h.CONFIG.visual["furigana-enabled"] = false;
		assertBelow(h.render(lyrics));
	});
}

test("compact manual-scroll rows also restore originals when switching to below", () => {
	const h = createHarness("compact", { scrolling: true });
	const lyrics = makeLyrics();
	assert.equal(h.render(lyrics)[0].mainText, pronunciation);
	h.CONFIG.visual["translate:display-mode"] = "below";
	assertBelow(h.render(lyrics, { settingsRevision: 1 }));
});

test("default display mode is below while saved explicit display choices are preserved", () => {
	const field = section(readSource("index.js"), '    "translate:display-mode":', '    "translate:target-language":');
	for (const saved of [null, undefined, "", "below", "replace"]) {
		const value = vm.runInNewContext(`({${field}})["translate:display-mode"]`, {
			StorageManager: { getItem(key) {
				assert.equal(key, "ivLyrics:visual:translate:display-mode");
				return saved;
			} },
		});
		assert.equal(value, saved || "below");
	}
});

test("opening the translation menu refreshes a changed display mode once and leaves below mode cached", () => {
	const menu = section(readSource("OptionsMenu.js"), "const TranslationMenu =", "const LyricsProviderSelectButton =");
	// Run the actual beginning of the click callback. The following modal-option
	// construction has no role in changing the display preference or refreshing it.
	const openBody = section(menu, "  const open = () => {", "    // Determine the correct mode key");
	for (const initial of ["replace", "below"]) {
		const h = createHarness("plain", { mode: initial });
		const lyrics = makeLyrics();
		let rows = h.render(lyrics);
		const stored = [];
		let refreshes = 0;
		const open = vm.runInNewContext(`(() => { ${openBody} }; return open; })()`, {
			CONFIG: h.CONFIG, APP_NAME: "ivLyrics",
			StorageManager: { setItem: (key, value) => stored.push([key, value]) },
			lyricContainerUpdate() {
				assert.equal(h.CONFIG.visual["translate:display-mode"], "below");
				assert.deepEqual(stored.at(-1), ["ivLyrics:visual:translate:display-mode", "below"]);
				rows = h.render(lyrics, { settingsRevision: ++refreshes });
			},
		});
		open();
		assert.equal(refreshes, initial === "replace" ? 1 : 0);
		assertBelow(rows);
		const prepared = h.originalRenders;
		open();
		assert.equal(refreshes, initial === "replace" ? 1 : 0, "reopening below must not request another refresh");
		assert.equal(h.originalRenders, prepared);
		assert.deepEqual(stored, Array.from({ length: 2 }, () => ["ivLyrics:visual:translate:display-mode", "below"]));
	}
});
