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
// Row clocks can be pinned outside their fill/release window. The recursive
// output-equivalence suite checks those rendered glyphs; retain all row data,
// anchor, presentation and active-character contracts in this shallow harness.
const normalize = (tree) => JSON.parse(JSON.stringify(tree, (key, value) => {
	if (key === "position") return undefined;
	if (value?.props?.className === "lyrics-vocal-main") return value.children[0];
	if (key === "className" && typeof value === "string") return value.split(" ").filter(name => name !== "lyrics-line-vocals").join(" ");
	return value;
}));
const rowChildren = (tree) => tree.children[0].filter((node) => node?.props?.["data-karaoke-vocal-row-index"] !== undefined);
const vocalContent = (row) => row.children[0].props?.className === "lyrics-vocal-main"
	? row.children[0].children[0] : row.children[0];
const childLines = (tree) => rowChildren(tree).map((row) => vocalContent(row).props.line);

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
		KARAOKE_COMPLETION_POSITION_OFFSET_MS: 900,
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

test("focused vocal stacks keep their final anchor after release and when seeking into silence", () => {
	for (const renderGranularity of ["character", "word"]) {
		const renderer = createRenderer();
		const line = makeLine();
		const anchor = (position, props = {}) => renderer.render(line, position, {
			renderGranularity, isEffectFocused: true, ...props,
		}).props["data-karaoke-vocal-anchor-position"];
		assert.equal(anchor(4000), 3);
		assert.equal(anchor(5100, { isActive: false }), 3, "release completion must not return to the first row");
		assert.equal(anchor(6900, { isActive: false }), 3, "hold the anchor throughout silence");
		assert.equal(anchor(6900, { isActive: false, isEffectFocused: false }), undefined, "hand off when the next line is focused");
		assert.equal(anchor(0, { isActive: false }), undefined, "seeking before the lyric clears the old anchor");
		const fresh = createRenderer().render(line, 6900, {
			renderGranularity, isActive: false, isEffectFocused: true,
		});
		assert.equal(fresh.props["data-karaoke-vocal-anchor-position"], 3, "direct seek and continuous playback agree");
	}
});

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


test("each vocal keeps a single presentation wrapper inside its measured anchor", () => {
 const tree = createRenderer().render(makeLine(), 2200);
 assert.match(tree.props.className, /lyrics-karaoke-stack/);
 const rows = rowChildren(tree);
 assert.equal(rows.length, 4);
 for (const row of rows) {
  const wrapper = row.children[0];
  assert.equal(wrapper.props.className, "lyrics-vocal-main");
  assert.equal(wrapper.children.length, 1);
  assert.ok(wrapper.children[0].props.line);
  assert.equal(wrapper.props.style, undefined, "no per-frame presentation styles");
  assert.equal(wrapper.props["data-karaoke-vocal-row-index"], undefined);
 }
});


const makePunctuationCalls = (starts, punctuationDuration) => {
 const voices = starts.map((startTime, index) => ({
  text: index === starts.length - 1 ? "アイリスアウト" : "ア、",
  syllables: index === starts.length - 1
   ? [{ text: "アイリスアウト", startTime, endTime: startTime + 1300 }]
   : [{ text: "ア", startTime, endTime: startTime + 1 },
      { text: "、", startTime: startTime + 1, endTime: startTime + 1 + punctuationDuration }],
 }));
 return { startTime: starts[0], endTime: starts.at(-1) + 1300,
  text: voices.map(row => row.text).join(""), syllables: [],
  vocals: { lead: voices[0], background: voices.slice(1) } };
};

test("one-millisecond calls advance on each onset without the long comma holding an earlier anchor", () => {
 // Three actual source timing patterns; rendering can tick after the 1ms sound.
 for (const [starts, punctuationDuration] of [
  [[102014,102203,102482,102673,102897],1183],
  [[109112,109317,109563,109770,110047],1048],
  [[115402,115559,115833,115991,116284],500],
 ]) for (const renderGranularity of ["character", "word"]) {
  const line = makePunctuationCalls(starts, punctuationDuration);
  const original = JSON.stringify(line);
  const renderer = createRenderer();
  const render = position => renderer.render(line, position, { renderGranularity, isEffectFocused: true });
  const childReferences = childLines(render(starts[0] - 1));
  for (let index = 0; index < starts.length; index++) {
   for (const position of [starts[index], starts[index] + 16, (starts[index + 1] || starts[index] + 300) - 1]) {
    const result = render(position);
    assert.equal(result.props["data-karaoke-vocal-anchor-position"], index, `${renderGranularity} at ${position}`);
    childLines(result).forEach((child, voice) => assert.equal(child, childReferences[voice]));
   }
  }
  assert.equal(render(line.endTime + 900).props["data-karaoke-vocal-anchor-position"], 4);
  assert.equal(JSON.stringify(line), original, "only the scroll envelope may change, never source fill/effect timing");
  const final = childLines(render(starts[4]));
  assert.equal(final[0].syllables[1].endTime, starts[0] + 1 + punctuationDuration);
 }
});

test("a punctuation call sequence keeps its quick arrival budget for precentering and the final word", () => {
 const starts = [115402,115559,115833,115991,116284];
 const line = makePunctuationCalls(starts, 500);
 const renderer = createRenderer();
 const windowAt = (position, extra = {}) => renderer.render(line, position, { isEffectFocused: true, ...extra })
  .props["data-karaoke-vocal-anchor-window-ms"];
 assert.equal(windowAt(starts[0] - 200, { isActive: false }), 157);
 assert.equal(windowAt(starts[1]), 157);
 assert.equal(windowAt(starts[2]), 158);
 assert.equal(windowAt(starts[3]), 158);
 assert.equal(windowAt(starts[4]), 293, "the final word must not fall back to the slow whole-line duration");
});

test("punctuation trimming preserves simultaneous calls and genuine spoken overlap", () => {
 const starts = [1000,1000,1200,1400,1600];
 const simultaneous = makePunctuationCalls(starts, 1000);
 let renderer = createRenderer();
 assert.equal(renderer.render(simultaneous, 1017).props["data-karaoke-vocal-anchor-position"], 1);
 assert.equal(renderer.render(simultaneous, 1217).props["data-karaoke-vocal-anchor-position"], 2);
 const overlap = makePunctuationCalls([1000,1200,1400,1600,1800], 1200);
 overlap.vocals.lead.syllables[0].endTime = 1700;
 overlap.vocals.lead.syllables[1].startTime = 1700;
 renderer = createRenderer();
 assert.equal(renderer.render(overlap, 1217).props["data-karaoke-vocal-anchor-position"], 1);
 assert.equal(renderer.render(overlap, 1417).props["data-karaoke-vocal-anchor-position"], 1,
  "the first voice is still singing; retain the midpoint instead of forcing the latest row");
 assert.equal(renderer.render(overlap, 1617).props["data-karaoke-vocal-anchor-position"], 2);
});


test("ordinary spaced vocal phrases retain their existing anchors and motion windows", () => {
 const line = makePunctuationCalls([1000,1400,1800,2200,2600], 1000);
 const renderer = createRenderer();
 const baseline = createRenderer(baselineSource);
 for (let position = 900; position < 2800; position += 17) {
  const actual = renderer.render(line, position).props;
  const expected = baseline.render(line, position).props;
  for (const key of ["data-karaoke-vocal-anchor-position", "data-karaoke-vocal-anchor-window-ms"]) {
   assert.equal(actual[key], expected[key], `${key} at ${position}`);
  }
 }
});
