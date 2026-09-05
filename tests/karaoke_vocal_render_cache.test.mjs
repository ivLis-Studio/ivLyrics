import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const currentSource = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const baselineSource = execFileSync("git", [
	"show", "31ff869ec832c29c713abcc4333faee8cdbf8524:Pages.js",
], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });

const slice = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
	return source.slice(start, end);
};
const normalize = (value) => JSON.parse(JSON.stringify(value));
const rowChildren = (tree) => tree.children[0].filter((node) => node?.props?.["data-karaoke-vocal-row-index"] !== undefined);
const childLines = (tree) => rowChildren(tree).map((row) => row.children[0].props.line);

const createRenderer = (source = currentSource) => {
	const hooks = [];
	let hookIndex = 0;
	let locale = "en";
	const segmentCalls = [];
	const CONFIG = { visual: {
		"sync-data-custom-speaker-colors-enabled": true,
		"karaoke-text-effects": true,
	} };
	const window = {
		Utils: { getDetectedLanguage: () => locale },
		LyricsWordSegmenter: { segmentGraphemes: (text, language) => {
			segmentCalls.push({ text, language });
			return Array.from(new Intl.Segmenter(language === "auto" ? undefined : language, {
				granularity: "grapheme",
			}).segment(text), (entry) => entry.segment);
		} },
	};
	const context = vm.createContext({
		CONFIG, window, console,
		getCopyableText: (value) => Array.isArray(value) ? value.join("") : String(value ?? ""),
		toFiniteTime: (value) => Number.isFinite(Number(value)) ? Number(value) : null,
		prefersReducedLyricsMotion: () => false,
		KARAOKE_PRE_SPACE_MIN_DURATION_MS: 40,
		KARAOKE_PRE_SPACE_NEXT_CHAR_RATIO: 0.35,
		KARAOKE_PRE_SPACE_MAX_DURATION_MS: 60,
		useRef: (initial) => {
			const index = hookIndex++;
			return hooks[index] ??= { current: initial };
		},
		useMemo: (build, dependencies) => {
			const index = hookIndex++;
			const previous = hooks[index];
			if (previous && previous.dependencies.length === dependencies.length
				&& dependencies.every((dependency, i) => Object.is(dependency, previous.dependencies[i]))) {
				return previous.value;
			}
			const value = build();
			hooks[index] = { value, dependencies };
			return value;
		},
		react: {
			memo: (component) => component,
			createElement: (tag, props, ...children) => ({ tag, props, children }),
		},
	});
	vm.runInContext([
		slice(source, "const getTimedSyllablesFromLine", "const getLastSyllableEndTime"),
		slice(source, "const getKaraokeLineBounds", "const KARAOKE_FILL_STEPS"),
		slice(source, "const KaraokeLine = react.memo", "const SyncedLyricsPage = react.memo"),
		"globalThis.renderVocalLine = KaraokeLine;",
	].join("\n"), context);
	return {
		CONFIG, window, segmentCalls,
		setLocale: (next) => { locale = next; },
		render: (line, position, props = {}) => {
			hookIndex = 0;
			return context.renderVocalLine({
				line, position, isActive: true, globalCharOffset: 17,
				activeGlobalCharIndex: 19, renderGranularity: "character", ...props,
			});
		},
	};
};

const makeLine = (rowCount = 4) => {
	const texts = ["Hello world", "(á 👨‍👩‍👧‍👦)", "第三の声", "مرحبا"];
	const rows = texts.slice(0, rowCount).map((text, index) => ({
		id: `voice-${index}`, role: index ? "background" : "lead", text,
		speaker: index === 1 ? "CUSTOM" : "MALE 1",
		"speaker-color": index === 1 ? "#aabbcc" : "",
		"speaker-fallback": "FEMALE 1", kind: index === 2 ? "echo" : "vocal",
		phonetic: index === 2 ? "daisan no koe" : "",
		translation: index === 3 ? "hello" : "",
		syllables: [{ text, startTime: 1000 + index * 900, endTime: 2200 + index * 900,
			...(index === 1 ? { inlineStyle: true, styleKind: "wave", styleSpeaker: "CUSTOM" } : {}),
		}],
	}));
	return {
		startTime: 1000, endTime: 6000, text: texts.slice(0, rowCount).join(" "),
		karaokeGranularity: "word", vocals: { lead: rows[0], background: rows.slice(1) },
	};
};

test("vocal rows preserve v6.5.9 anchors, character offsets and presentation across playback and seeks", () => {
	for (const rowCount of [2, 4]) {
		const current = createRenderer();
		const baseline = createRenderer(baselineSource);
		const line = makeLine(rowCount);
		for (const position of [0, 1000, 1125, 1800, 2200, 2900, 3700, 4500, 6200, 1500, 3700]) {
			for (const renderGranularity of ["character", "word"]) {
				const props = {
					isActive: position >= 1000 && position < 6000, renderGranularity,
					phonetic: rowCount === 2 ? "hello / second" : "whole stack reading",
					translation: rowCount === 2 ? "first / second" : "whole stack meaning",
					culturalAnnotations: [{ expression: "Hello", marker: 1 }, { expression: "absent", marker: 2 }],
				};
				assert.deepEqual(normalize(current.render(line, position, props)),
					normalize(baseline.render(line, position, props)), `${rowCount} rows at ${position}, ${renderGranularity}`);
			}
		}
	}
});

test("playback frames retain child line identities and perform no repeat grapheme preparation", () => {
	const current = createRenderer();
	const baseline = createRenderer(baselineSource);
	const line = makeLine();
	const initial = childLines(current.render(line, 1000));
	current.segmentCalls.length = 0;
	for (let frame = 1; frame <= 180; frame++) {
		const result = current.render(line, 1000 + frame * 16);
		childLines(result).forEach((child, index) => assert.equal(child, initial[index]));
		baseline.render(line, 1000 + frame * 16);
	}
	assert.equal(current.segmentCalls.length, 0);
	assert.ok(baseline.segmentCalls.length >= 180 * 4, "baseline must exercise real repeated segmentation");
});

test("replacement lyrics, vocal objects and settings revisions refresh row preparation", () => {
	const current = createRenderer();
	const baseline = createRenderer(baselineSource);
	let line = makeLine();
	let priorLine = childLines(current.render(line, 1200))[0];
	line = structuredClone(line);
	line.vocals.lead.text = "Replacement words";
	line.vocals.lead.syllables = [{ text: "Replacement words", startTime: 900, endTime: 3500 }];
	let result = current.render(line, 1300);
	assert.notEqual(childLines(result)[0], priorLine);
	assert.deepEqual(normalize(result), normalize(baseline.render(line, 1300)));
	priorLine = childLines(result)[0];
	line.vocals = structuredClone(line.vocals);
	line.vocals.lead.translation = "new row translation";
	result = current.render(line, 1400);
	assert.notEqual(childLines(result)[0], priorLine);
	assert.deepEqual(normalize(result), normalize(baseline.render(line, 1400)));
	priorLine = childLines(result)[0];
	line.vocals.lead.phonetic = "new row reading";
	result = current.render(line, 1500, { settingsRevision: 1 });
	assert.notEqual(childLines(result)[0], priorLine);
	assert.deepEqual(normalize(result), normalize(baseline.render(line, 1500, { settingsRevision: 1 })));
});

test("creator-color toggles and speaker helper replacement update cached presentation", () => {
	const current = createRenderer();
	const baseline = createRenderer(baselineSource);
	const line = makeLine(2);
	assert.equal(rowChildren(current.render(line, 1200))[1].props.style["--lyrics-color-active"], "#aabbcc");
	for (const enabled of [false, true]) {
		current.CONFIG.visual["sync-data-custom-speaker-colors-enabled"] = enabled;
		baseline.CONFIG.visual["sync-data-custom-speaker-colors-enabled"] = enabled;
		assert.deepEqual(normalize(current.render(line, 1300)), normalize(baseline.render(line, 1300)));
	}
	const helper = { getPresentation: () => ({ speakerClass: "duet-1", creatorColor: "#102030" }) };
	current.window.ivLyricsSpeakerColors = helper;
	baseline.window.ivLyricsSpeakerColors = helper;
	assert.deepEqual(normalize(current.render(line, 1400)), normalize(baseline.render(line, 1400)));
	helper.getPresentation = () => ({ speakerClass: "female-2", creatorColor: "#123456" });
	assert.deepEqual(normalize(current.render(line, 1500)), normalize(baseline.render(line, 1500)));
});

test("locale and shared grapheme segmenter changes invalidate timed child lines", () => {
	const current = createRenderer();
	const line = makeLine();
	let prior = childLines(current.render(line, 1200))[0];
	current.segmentCalls.length = 0;
	current.setLocale("ja");
	let result = current.render(line, 1300);
	assert.notEqual(childLines(result)[0], prior);
	assert.ok(current.segmentCalls.some((call) => call.language === "ja"));
	prior = childLines(result)[0];
	const segment = current.window.LyricsWordSegmenter.segmentGraphemes;
	current.window.LyricsWordSegmenter.segmentGraphemes = (...args) => segment(...args);
	result = current.render(line, 1400);
	assert.notEqual(childLines(result)[0], prior);
});

test("phonetic, translation and cultural annotations remain live while timed rows are reused", () => {
	const current = createRenderer();
	const baseline = createRenderer(baselineSource);
	const line = makeLine(2);
	const prior = childLines(current.render(line, 1200))[0];
	const props = {
		phonetic: "new first / new second", translation: "meaning one / meaning two",
		culturalAnnotations: [{ expression: "Hello", marker: 3 }],
	};
	const result = current.render(line, 1400, props);
	assert.equal(childLines(result)[0], prior);
	assert.deepEqual(normalize(result), normalize(baseline.render(line, 1400, props)));
});
