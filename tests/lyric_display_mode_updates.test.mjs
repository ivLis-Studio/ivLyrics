import { readKaraokeRendererDeclarations } from "./fixtures/karaoke-renderer-declarations.mjs";
import { createToolbarTranslationPreferences } from "../src/app/toolbar/toolbarTranslationPreferences.mjs";
import { karaokePageModules } from "./fixtures/karaoke-page-modules.mjs";
import { sourceUrl } from "./fixtures/source-paths.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { createAppConfig } from "../src/spicetify/createAppConfig.mjs";
import { createSyncedLyricsPages } from "../src/lyrics/createSyncedLyricsPages.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// Set IVLYRICS_DISPLAY_TEST_REVISION=5f8e57e to reproduce these regressions
// against the previous implementation without modifying the working tree.
const readSource = file => process.env.IVLYRICS_DISPLAY_TEST_REVISION
	? execFileSync("git", ["show", `${process.env.IVLYRICS_DISPLAY_TEST_REVISION}:${file}`], { cwd: root, encoding: "utf8" })
	: readFileSync(sourceUrl(file), "utf8");
const source = readKaraokeRendererDeclarations();
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
	let renderedRowElements = [];
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
		useEffect, useMemo, useRef, useState, useCallback,
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
		...karaokePageModules,
		createSyncedLyricsPages,
		compactLyricsLineMotion: karaokePageModules.createLyricsLineMotion(),
		prepareGlobalCharTimeline: karaokePageModules.createKaraokeCharacterTimelineBuilder(karaokePageModules.createKaraokeGraphemes()),
		...karaokePageModules.createLyricInterludeTiming({
			readTrackDuration: () => null,
			readLineFillEndTime: () => assert.fail("plain sync must not read karaoke fill timing"),
			readAutoBreakEnabled: () => false,
		}),
		isAutoInstrumentalBreakEnabled: () => false,
		useSyncedLyricsViewport: karaokePageModules.createSyncedLyricsViewportHook({
			react: { useMemo, useState, useRef, useCallback, useEffect },
		}),
		react, CONFIG, window, I18n: { t: key => key },
		useMemo, useState, useRef, useCallback, useEffect, useSyncedLayoutEffect: useEffect,
		// This fixture exercises display memoization, not DOM animation. Reveal
		// lifecycle and page reconciliation keys are covered in lyrics_track_reveal.
		useLyricsTrackReveal() {},
		useLyricsPlaybackPosition: () => position,
		getFrameAlignedLyricsPlaybackPosition: () => position,
		getPseudoKaraokeRenderAdvance: () => assert.fail("plain sync must not use karaoke advance"),
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
		getCurrentTrackDurationMs: () => null,
		getKaraokeLineFillEndTime: () => assert.fail("plain sync must not read karaoke fill timing"),
		createActiveTrailingKaraokeInterludeLine: () => null,
		getKaraokeSpeakerStyle: () => ({}),
		getKaraokeLineMetaClass: () => "",
		prefersReducedLyricsMotion: () => false,
		PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT: Symbol.for("ivLyrics.speakerColors.classNameContract"),
		toFiniteTime: value => value == null || !Number.isFinite(Number(value)) ? null : Number(value),
		EMPTY_GLOBAL_CHAR_STATE: { globalCharOffsets: [], activeGlobalCharIndex: -1 },
		KARAOKE_COMPLETION_POSITION_OFFSET_MS: 900,
		KARAOKE_RELEASE_WINDOW_MS: 820,
		LyricsLineBlock, IdlingIndicator: () => null, SearchBar: () => null,
		LyricsBackdropLayer: () => null, renderLyricsUnavailable: () => null,
	});
	vm.runInContext([
		section(source, source.includes("const { getUnsyncedLineRenderData") ? "const { getUnsyncedLineRenderData" : "const safeRenderText =",
			source.includes("createLyricsUnavailableView") ? "const getTrackPositionFPS" : "function renderLyricsUnavailable"),
		source.includes("const normalizeUnsyncedLyrics =") ? section(source, "const normalizeUnsyncedLyrics =", "const getCopyableText =") : "",
		section(source, "const buildPreparedSyncedLyrics =", source.includes("const lyricLineActions =") ? "const lyricLineActions =" : "const LyricsLineBlock ="),
		section(source, source.includes("const { renderLyricsItems") ? "const { renderLyricsItems" : "const renderLyricsItems =", "const getKaraokeLineBounds"),
		section(source, "const UnsyncedLyricsPage =", "const { renderLyricsUnavailable"),
		section(source, "const { SyncedLyricsPage, SyncedExpandedLyricsPage", "const readCompactMode"),
		"globalThis.pages = { compact: SyncedLyricsPage, expanded: SyncedExpandedLyricsPage, plain: UnsyncedLyricsPage };",
	].join("\n"), context);
	return {
		CONFIG,
		get originalRenders() { return originalRenders; },
		get rowElements() { return renderedRowElements; },
		setLocale(value) { locale = value; },
		setConverterReady(value) { converterReady = value; },
		render(lyrics, { time = position, settingsRevision = 0 } = {}) {
			cursor = 0;
			position = time;
			const tree = context.pages[page]({ lyrics, isKara: false, reRenderLyricsPage: settingsRevision });
			renderedRowElements = nodes(tree).filter(node => node.type === LyricsLineBlock && node.props.originalText);
			return renderedRowElements.map(node => node.props);
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
	for (const saved of [null, undefined, "", "below", "replace"]) {
		const { visual } = createAppConfig({
			storage: {
				get: (_key, fallback = true) => fallback,
				getItem: (key) => key === "ivLyrics:visual:translate:display-mode" ? saved : null,
				getPersisted: () => null,
				setItem() {},
			},
		});
		assert.equal(visual["translate:display-mode"], saved || "below");
	}
});

test("opening the translation menu refreshes a changed display mode once and leaves below mode cached", () => {
	for (const initial of ["replace", "below"]) {
		const h = createHarness("plain", { mode: initial });
		const lyrics = makeLyrics();
		let rows = h.render(lyrics);
		const stored = [];
		let refreshes = 0;
		const { prepareDisplay: open } = createToolbarTranslationPreferences({
			getVisualSettings: () => h.CONFIG.visual,
			writeSetting: (key, value) => stored.push([`ivLyrics:visual:${key}`, value]),
			refreshLyrics() {
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

for (const page of ["compact", "expanded"]) {
	test(`${page}: ordinary sync reuses row elements until a boundary or display setting changes`, () => {
		const harness = createHarness(page, { mode: "below" });
		const lyrics = [...makeLyrics(), { text: "Next lyric", originalText: "Next lyric", startTime: 6000, endTime: 8000 }];
		harness.render(lyrics, { time: 1500 });
		const originalRows = harness.rowElements;
		for (const time of [1517, 1534, 1600, 1590]) {
			harness.render(lyrics, { time });
			harness.rowElements.forEach((row, index) => assert.equal(row, originalRows[index]));
		}
		harness.render(lyrics, { time: 6001 });
		assert.notEqual(harness.rowElements[0], originalRows[0]);
		assert.match(harness.rowElements[1].props.className, /LyricsLine-active/);
		harness.CONFIG.visual["translate:display-mode"] = "replace";
		const changed = harness.render(lyrics, { time: 6001, settingsRevision: true });
		assert.equal(changed[0].mainText, pronunciation);
	});
}

test("a delayed toolbar language save cannot apply the old track's setting to the next mounted page", async () => {
	const events = [];
	let allowSave;
	const written = new Promise((resolve) => { allowSave = resolve; });
	const firstUri = "spotify:track:first";
	const secondUri = "spotify:track:second";
	let currentUri = firstUri;
	let page = { currentTrackUri: firstUri, forceUpdate() { events.push("old-page update"); } };
	const { save } = createToolbarTranslationPreferences({
		readCurrentTrackUri: () => currentUri,
		readMountedPage: () => page,
		readTrackLanguageStore: () => ({
			setLanguage(uri, language) {
				events.push(["write", uri, language]);
				return written;
			},
			clearLanguage(uri) { events.push(["clear", uri]); },
		}),
		clearTrackSnapshot: (uri) => events.push(["snapshot", uri]),
		refreshLyrics: () => events.push("refresh"),
	});
	const pending = save("track-language-override", "ja");
	currentUri = secondUri;
	page = {
		currentTrackUri: secondUri, trackLanguageOverride: "de",
		_dmResults: { retained: true }, lastProcessedUri: secondUri, lastProcessedMode: "translation",
		forceUpdate() { events.push("new-page update"); },
	};
	allowSave();
	await pending;
	assert.equal(page.trackLanguageOverride, "de");
	assert.deepEqual(page._dmResults, { retained: true });
	assert.equal(page.lastProcessedUri, secondUri);
	assert.equal(page.lastProcessedMode, "translation");
	assert.deepEqual(events, [["write", firstUri, "ja"], ["snapshot", firstUri]]);

	await save("track-language-override", "auto");
	assert.equal(page.trackLanguageOverride, null);
	assert.deepEqual(page._dmResults, {});
	assert.deepEqual(events.slice(2), [["clear", secondUri], ["snapshot", secondUri], "new-page update", "refresh"]);
});

test("rapid language selections publish the last committed setting when the final write fails", async () => {
	const pendingWrites = [], applied = [], errors = [];
	const uri = "spotify:track:current";
	const page = { currentTrackUri: uri, trackLanguageOverride: "es", forceUpdate() {} };
	const preferences = createToolbarTranslationPreferences({
		readCurrentTrackUri: () => uri,
		readMountedPage: () => page,
		readTrackLanguageStore: () => ({ setLanguage(trackUri, value, options) {
			assert.equal(trackUri, uri);
			assert.equal(options.requireCommit, true);
			const pending = Promise.withResolvers();
			pendingWrites.push({ value, ...pending });
			return pending.promise;
		} }),
		clearTrackSnapshot: () => {},
		refreshLyrics: () => applied.push(page.trackLanguageOverride),
		reportLanguageSaveError: error => errors.push(error.message),
	});
	const first = preferences.save("track-language-override", "ja", uri);
	const last = preferences.save("track-language-override", "en", uri);
	await Promise.resolve();
	assert.deepEqual(pendingWrites.map(write => write.value), ["ja"]);
	pendingWrites[0].resolve();
	await first;
	assert.deepEqual(applied, []);
	assert.deepEqual(pendingWrites.map(write => write.value), ["ja", "en"]);
	pendingWrites[1].reject(new Error("storage denied"));
	await last;
	assert.deepEqual(applied, ["ja"]);
	assert.deepEqual(errors, ["storage denied"]);
	assert.equal(preferences.readTrackLanguage(), "ja");

	await preferences.save("track-language-override", "de", "spotify:track:departed");
	assert.equal(pendingWrites.length, 2);
});
