import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const currentSource = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const currentStyles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const baselineSource = execFileSync("git", [
	"show", "e90ee9c774102d209c6ef17667ac2b42820bbb21:Pages.js",
], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
const slice = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
	return source.slice(start, end);
};
const normalize = value => JSON.parse(JSON.stringify(value));

const createHarness = (source = currentSource, options = {}) => {
	const hooks = [];
	let hookIndex = 0;
	const preparationCalls = { graphemes: 0, words: 0, density: 0 };
	const measuredMath = Object.create(Math);
	// The profile's source-unit density is the only square-root calculation in
	// these extracted functions. Count preparation work instead of wall time.
	measuredMath.sqrt = value => {
		preparationCalls.density++;
		return Math.sqrt(value);
	};
	const CONFIG = { visual: {
		"karaoke-bounce": true,
		"karaoke-text-effects": true,
		"sync-data-custom-speaker-colors-enabled": true,
		...options.visual,
	} };
	const window = {
		Utils: { getDetectedLanguage: () => options.locale || "auto" },
		matchMedia: () => ({ matches: options.systemReduced === true }),
		LyricsWordSegmenter: {
			segmentGraphemes: (text, locale) => {
				preparationCalls.graphemes++;
				return Array.from(
					new Intl.Segmenter(locale === "auto" ? undefined : locale, { granularity: "grapheme" }).segment(text),
					segment => segment.segment
				);
			},
			segmentRanges: (text, locale) => {
				preparationCalls.words++;
				return Array.from(
					new Intl.Segmenter(locale === "auto" ? undefined : locale, { granularity: "word" }).segment(text),
					segment => ({ start: segment.index, end: segment.index + segment.segment.length, text: segment.segment })
				).filter(segment => segment.text.trim());
			},
		},
	};
	const context = vm.createContext({
		CONFIG, window, console, Math: measuredMath,
		Utils: { applyFuriganaIfEnabled: text => text },
		getCopyableText: value => Array.isArray(value) ? value.join("") : String(value ?? ""),
		toFiniteTime: value => Number.isFinite(Number(value)) ? Number(value) : null,
		KARAOKE_RELEASE_WINDOW_MS: 820,
		KARAOKE_COMPLETION_POSITION_OFFSET_MS: 900,
		useRef: initial => {
			const index = hookIndex++;
			return hooks[index] ??= { current: initial };
		},
		useMemo: (build, dependencies) => {
			const index = hookIndex++;
			const previous = hooks[index];
			if (previous && previous.dependencies.length === dependencies.length
				&& dependencies.every((dependency, i) => Object.is(dependency, previous.dependencies[i]))) return previous.value;
			const value = build();
			hooks[index] = { value, dependencies };
			return value;
		},
		react: {
			Fragment: "fragment",
			memo: component => component,
			createElement: (tag, props, ...children) => ({ tag, props, children }),
		},
	});
	const reducedStart = source.indexOf("const prefersReducedLyricsMotion =");
	const reducedEnd = source.indexOf("\nconst ", reducedStart + 1);
	vm.runInContext([
		source.slice(reducedStart, reducedEnd),
		slice(source, "const getTimedSyllablesFromLine", "const getInterludeInfo"),
		slice(source, "const KARAOKE_PRE_SPACE_MIN_DURATION_MS", "const getSyncedAnimationIndex"),
		slice(source, "const getKaraokeLineBounds", "const SyncedLyricsPage = react.memo"),
		"globalThis.motionHarness = {",
		" buildKaraokeTimedChars, applyKaraokeWhitespaceCompensation, getKaraokeCharFill,",
		" getKaraokeSegmentFill, getKaraokeInstantWordFill, buildKaraokeTextRunSegments,",
		" buildSyncedLinePlaybackWindows, getSyncedLinePlaybackState, getActiveTimedLineIndex,",
		" getKaraokeBounceValues, getKaraokeWordBounceValues,",
		" getKaraokeMotionProfile: typeof getKaraokeMotionProfile === 'function' ? getKaraokeMotionProfile : null,",
		" render: KaraokeLine };",
	].join("\n"), context);
	return {
		...context.motionHarness,
		CONFIG, context, preparationCalls,
		render: (line, position, props = {}) => {
			hookIndex = 0;
			return context.motionHarness.render({
				line, position, isActive: true, globalCharOffset: 0,
				activeGlobalCharIndex: -1, renderGranularity: "character", ...props,
			});
		},
	};
};

const timingFixtures = () => [
	{ text: "작은 빛", startTime: 1000, endTime: 3300, syllables: [
		{ text: "작", startTime: 1000, endTime: 1250 },
		{ text: "은 ", startTime: 1250, endTime: 1450 },
		{ text: "빛", startTime: 1450, endTime: 3300 },
	] },
	{ text: "Gentle lights", karaokeGranularity: "word", startTime: 1000, endTime: 3100, syllables: [
		{ text: "Gentle ", startTime: 1000, endTime: 1450 },
		{ text: "lights", startTime: 1500, endTime: 3100 },
	] },
	{ text: "á 👨‍👩‍👧‍👦", startTime: 1000, endTime: 3300, syllables: [
		{ text: "a", startTime: 1000, endTime: 1300 },
		{ text: "́ ", startTime: 1300, endTime: 1400 },
		{ text: "👨‍👩‍👧‍👦", startTime: 1400, endTime: 3300 },
	] },
	{ text: "مرحبا بكم", startTime: 1000, endTime: 3000, syllables: [
		{ text: "مرحبا ", startTime: 1000, endTime: 1800 },
		{ text: "بكم", startTime: 1800, endTime: 3000 },
	] },
];
const collectNodes = (tree, predicate) => {
	const found = [];
	const visit = value => {
		if (Array.isArray(value)) { value.forEach(visit); return; }
		if (!value || typeof value !== "object") return;
		if (predicate(value)) found.push(value);
		visit(value.children);
	};
	visit(tree);
	return found;
};
const fillNodes = tree => collectNodes(tree, node => node.props?.["data-outline-text"] !== undefined);
const fillSnapshot = tree => fillNodes(tree).map(node => ({
	text: node.props["data-outline-text"],
	dir: node.props.dir,
	state: node.props.className.match(/lyrics-karaoke-(?:char|text-run-segment)--(pending|active|done)/)?.[1],
	fill: node.props.style?.["--karaoke-char-fill"],
	softStart: node.props.style?.["--karaoke-char-fill-soft-start"],
	softEnd: node.props.style?.["--karaoke-char-fill-soft-end"],
}));

test("adaptive motion preserves source graphemes, fill curves and playback/scroll timing", () => {
	for (const curve of [undefined, "[[0,0],[0.25,0.1],[0.5,0.7],[0.75,0.85],[1,1]]"]) {
		const options = { visual: { "karaoke-fill-correction-curve": curve } };
		const current = createHarness(currentSource, options);
		const baseline = createHarness(baselineSource, options);
		for (const line of timingFixtures()) {
			const currentChars = current.applyKaraokeWhitespaceCompensation(current.buildKaraokeTimedChars(line));
			const baselineChars = baseline.applyKaraokeWhitespaceCompensation(baseline.buildKaraokeTimedChars(line));
			assert.deepEqual(normalize(currentChars), normalize(baselineChars));
			const lines = [line, { text: "next", startTime: 3700, endTime: 5000 }];
			const windows = current.buildSyncedLinePlaybackWindows(lines, true);
			const baselineWindows = baseline.buildSyncedLinePlaybackWindows(lines, true);
			assert.deepEqual(normalize(windows), normalize(baselineWindows));
			for (const position of [0, 999, 1000, 1050, 1400, 2300, 3299, 3300, 3700, 4300]) {
				currentChars.forEach(char => assert.equal(
					current.getKaraokeCharFill(position, true, char.startTime, char.endTime),
					baseline.getKaraokeCharFill(position, true, char.startTime, char.endTime)
				));
				assert.equal(current.getActiveTimedLineIndex(lines, position), baseline.getActiveTimedLineIndex(lines, position));
				assert.deepEqual(normalize(current.getSyncedLinePlaybackState(windows[0], position)),
					normalize(baseline.getSyncedLinePlaybackState(baselineWindows[0], position)));
			}
		}
	}
});

test("native and word-timed sources retain character fill and joining-script text runs", () => {
	for (const line of timingFixtures()) {
		const current = createHarness();
		const baseline = createHarness(baselineSource);
		for (const position of [999, 1000, 1125, 1400, 1900, 2700, 3300, 4500]) {
			const actualTree = current.render(line, position);
			const expectedTree = baseline.render(line, position);
			assert.deepEqual(normalize(fillSnapshot(actualTree)), normalize(fillSnapshot(expectedTree)));
			assert.equal(actualTree.props.className.includes("is-word-timed"), false);
		}
	}
	const harness = createHarness();
	const joining = harness.buildKaraokeTimedChars(timingFixtures()[2]);
	assert.equal(joining[0].char, "á");
	assert.equal(joining.at(-1).char, "👨‍👩‍👧‍👦");
});

test("equal vocal timing and speaker metadata produce equal glyph motion for lead and background", () => {
	const base = timingFixtures()[0];
	const part = { text: base.text, syllables: base.syllables, speaker: "MALE 1", kind: "vocal" };
	const line = { ...base, syllables: undefined, vocals: {
		lead: { ...part, id: "a", role: "lead" },
		background: [{ ...part, id: "b", role: "background" }],
	} };
	const stackHarness = createHarness();
	for (const position of [1200, 1600, 2300, 3200, 3420]) {
		const tree = stackHarness.render(line, position);
		const rows = collectNodes(tree, node => node.props?.["data-karaoke-vocal-row-index"] !== undefined);
		assert.equal(rows.length, 2);
		const childTrees = rows.map(row => {
			const props = row.children[0].props;
			return createHarness().render(props.line, props.position, props);
		});
		assert.deepEqual(normalize(fillNodes(childTrees[0])), normalize(fillNodes(childTrees[1])));
		assert.deepEqual(normalize(rows[0].props.style), normalize(rows[1].props.style));
	}
});

const makeTimedRun = (duration, gap = 0, count = 8) => Array.from({ length: count }, (_, index) => ({
	char: "빛", startTime: 1000 + index * (duration + gap),
	endTime: 1000 + index * (duration + gap) + duration, karaokeUnitIndex: index,
}));

test("long native syllables and word-source characters remain lifted until the sound ends", () => {
	const harness = createHarness();
	for (const text of ["빛", "Glow"]) {
		const line = { text, karaokeGranularity: text === "빛" ? "character" : "word", syllables: [
			{ text, startTime: 1000, endTime: 3400 },
		] };
		const chars = harness.buildKaraokeTimedChars(line);
		const profile = harness.getKaraokeMotionProfile(chars, 0);
		assert.equal(profile.endTime, 3400);
		const bounce = position => harness.getKaraokeBounceValues(position, true, chars[0].startTime, chars[0].endTime, 1, profile);
		for (const position of [1700, 2300, 3000, 3380]) {
			assert.ok(bounce(position).offsetY < 0, `${text} must stay lifted at ${position}`);
		}
		assert.deepEqual(normalize(bounce(2300)), normalize(bounce(3000)), "the long-note plateau must not keep bobbing");
		assert.equal(bounce(profile.endTime + profile.releaseDuration + 20).active, false);
		const rendered = harness.render(line, 3000, { activeGlobalCharIndex: chars.length + 8 });
		assert.ok(Number.parseFloat(fillNodes(rendered)[0].props.style?.["--karaoke-bounce-y"]) < 0,
			"character rendering must actually use the sustained profile after early characters finish filling");
	}
});

test("dense fast units use less motion than normal units and retain the source character count", () => {
	const harness = createHarness();
	const fastChars = makeTimedRun(70);
	const normalChars = makeTimedRun(380);
	const fast = harness.getKaraokeMotionProfile(fastChars, 2);
	const normal = harness.getKaraokeMotionProfile(normalChars, 2);
	assert.ok(fast.amplitude < normal.amplitude, "fast lyric density must reduce translation amplitude");
	assert.ok(fast.scaleAmount <= normal.scaleAmount, "fast lyric density must not increase scaling");
	assert.ok(fast.releaseDuration < normal.releaseDuration, "fast phrases must settle before a normal phrase would");
	const fastPeak = harness.getKaraokeBounceValues(fast.startTime + fast.riseDuration, true, fast.startTime, fast.endTime, 1, fast);
	const normalPeak = harness.getKaraokeBounceValues(normal.startTime + normal.riseDuration, true, normal.startTime, normal.endTime, 1, normal);
	assert.ok(Math.abs(fastPeak.offsetY) < Math.abs(normalPeak.offsetY));
	assert.equal(harness.getKaraokeBounceValues(
		fast.endTime + fast.releaseDuration + 1, true, fast.startTime, fast.endTime, 1, fast
	).active, false);
	const line = { text: "빛".repeat(fastChars.length), syllables: fastChars.map(char => ({
		text: char.char, startTime: char.startTime, endTime: char.endTime,
	})) };
	const tree = harness.render(line, 1170);
	assert.equal(fillNodes(tree).length, fastChars.length, "fast passages must not collapse into word rendering");
	assert.equal(tree.props.className.includes("is-word-timed"), false);
});

test("space after a sound permits a longer release than a rapid handoff", () => {
	const harness = createHarness();
	const rapid = harness.getKaraokeMotionProfile(makeTimedRun(100), 2);
	const spacious = harness.getKaraokeMotionProfile(makeTimedRun(380, 1200), 2);
	assert.ok(spacious.releaseDuration > rapid.releaseDuration);
	const atRelease = fraction => harness.getKaraokeBounceValues(
		spacious.endTime + spacious.releaseDuration * fraction, true,
		spacious.startTime, spacious.endTime, 1, spacious
	);
	const release = [0, 0.2, 0.4, 0.6, 0.8, 1.1].map(atRelease);
	for (let index = 1; index < release.length; index++) {
		assert.ok(Math.abs(release[index].offsetY) <= Math.abs(release[index - 1].offsetY), "release must return monotonically");
	}
	assert.equal(release.at(-1).active, false);
});

test("motion profiles are cached without modifying provider timings and refresh for replacement data", () => {
	const harness = createHarness();
	const chars = Object.freeze(makeTimedRun(250).map(Object.freeze));
	const before = normalize(chars);
	const first = harness.getKaraokeMotionProfile(chars, 2);
	assert.equal(harness.getKaraokeMotionProfile(chars, 2), first);
	assert.deepEqual(normalize(chars), before);
	const replacement = makeTimedRun(1500);
	const updated = harness.getKaraokeMotionProfile(replacement, 2);
	assert.notEqual(updated, first);
	assert.equal(updated.endTime, replacement[2].endTime);
});

test("pause and bidirectional seek produce the same motion at the same source position", () => {
	const harness = createHarness();
	const chars = makeTimedRun(1500, 600);
	const profile = harness.getKaraokeMotionProfile(chars, 0);
	const sample = position => normalize(harness.getKaraokeBounceValues(position, true, 1000, 2500, 1, profile));
	const expected = new Map([800, 1000, 1100, 2200, 2600, 4000].map(position => [position, sample(position)]));
	for (const position of [1100, 2200, 2200, 2200, 2600, 4000, 1100, 800, 2600, 1000, 4000]) {
		assert.deepEqual(sample(position), expected.get(position));
	}
});

test("motion disable and reduced-motion preferences leave timed fill visible without bounce", () => {
	for (const options of [
		{ visual: { "karaoke-bounce": false } },
		{ visual: { "reduce-motion": true } },
		{ systemReduced: true },
	]) {
		const harness = createHarness(currentSource, options);
		const chars = makeTimedRun(1600);
		const profile = harness.getKaraokeMotionProfile(chars, 0);
		for (const bounce of [harness.getKaraokeBounceValues, harness.getKaraokeWordBounceValues]) {
			const value = bounce(1700, true, 1000, 2600, 1, profile);
			assert.equal(value.active, false);
			assert.equal(value.offsetY, 0);
			assert.equal(value.scale, 1);
		}
		const line = { text: "빛", syllables: [{ text: "빛", startTime: 1000, endTime: 2600 }] };
		const tree = harness.render(line, 1700);
		const glyph = fillNodes(tree)[0];
		assert.equal(glyph.props.style["--karaoke-bounce-y"], undefined);
		assert.ok(Number.parseFloat(glyph.props.style["--karaoke-char-fill"]) > 0);
	}
});

test("release glow fades out, remains smaller in fast passages, and honors text-effects disable", () => {
	const harness = createHarness();
	const normal = harness.getKaraokeMotionProfile(makeTimedRun(380, 800), 2);
	const fast = harness.getKaraokeMotionProfile(makeTimedRun(70), 2);
	assert.ok(fast.glow < normal.glow);
	const atRelease = fraction => harness.getKaraokeBounceValues(
		normal.endTime + normal.releaseDuration * fraction, true,
		normal.startTime, normal.endTime, 1, normal
	);
	const early = atRelease(0.2);
	const late = atRelease(0.8);
	assert.ok(early.glow > 0);
	assert.ok(late.glow < early.glow);
	assert.equal(atRelease(1.1).glow, 0);
	harness.CONFIG.visual["karaoke-text-effects"] = false;
	const withoutGlow = atRelease(0.2);
	assert.equal(withoutGlow.glow, 0);
	assert.equal(withoutGlow.active, true, "disabling glow must not disable the separate bounce preference");
	assert.equal(withoutGlow.offsetY, early.offsetY);
});

test("180 playback frames reuse grapheme, word and density preparation in both render modes", () => {
	for (const renderGranularity of ["character", "word"]) {
		for (const line of timingFixtures()) {
			const harness = createHarness();
			harness.render(line, 1000, { renderGranularity });
			const prepared = { ...harness.preparationCalls };
			assert.ok(prepared.graphemes > 0, "the fixture must actually prepare graphemes");
			assert.ok(prepared.density > 0, "the fixture must actually prepare source-unit density");
			for (let frame = 0; frame < 180; frame++) {
				harness.render(line, 1000 + frame * 16, { renderGranularity });
			}
			assert.deepEqual(harness.preparationCalls, prepared,
				`${renderGranularity} playback must not rerun immutable text or density preparation`);
		}
	}
});

// These are stylesheet contracts, not a substitute for computed-style QA in
// Spotify. Inspect leaf rules so the same checks also cover media-query rules.
const styleRules = Array.from(currentStyles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), match => ({
	selectors: match[1].split(",").map(selector => selector.trim()),
	declarations: Object.fromEntries(match[2].split(";").map(declaration => {
		const colon = declaration.indexOf(":");
		return colon < 0 ? [] : [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
	}).filter(entry => entry.length === 2)),
}));

test("lead and background role selectors cannot introduce unequal size, color, opacity or motion", () => {
	const roleRules = styleRules.filter(rule => rule.selectors.some(selector =>
		/\.lyrics-karaoke-part\.(?:lead|background)\b/.test(selector)));
	for (const rule of roleRules) {
		for (const property of Object.keys(rule.declarations)) {
			assert.doesNotMatch(property,
				/^(?:font(?:-size|-weight)?|opacity|color|filter|text-shadow|transform|scale|translate|animation(?:-.+)?|--karaoke-.+|--lyrics-color-.+)$/,
				`timing role must not change visual strength: ${rule.selectors.join(", ")} ${property}`);
		}
	}
});

test("word mode moves its wrapper once while its glyphs retain fill without a second transform", () => {
	const harness = createHarness();
	const tree = harness.render(timingFixtures()[1], 1250, { renderGranularity: "word" });
	const movingWords = collectNodes(tree, node =>
		node.props?.className?.startsWith("lyrics-karaoke-word ")
		&& node.props.className.includes("is-bouncing"));
	assert.ok(movingWords.length > 0, "the fixture must reach a moving word wrapper");
	for (const word of movingWords) {
		assert.ok(Number.parseFloat(word.props.style["--karaoke-bounce-y"]) < 0);
		const glyphs = fillNodes(word);
		assert.ok(glyphs.length > 1);
		for (const glyph of glyphs) {
			assert.equal(glyph.props.style["--karaoke-bounce-y"], undefined);
			assert.equal(glyph.props.className.includes("is-bouncing"), false);
			assert.match(glyph.props.className, /--(?:active|done)\b/);
		}
	}
	const glyphTransformRules = styleRules.filter(rule =>
		rule.selectors.includes(".lyrics-karaoke-word.is-word-timed .lyrics-karaoke-char")
		&& rule.declarations.transform !== undefined);
	assert.ok(glyphTransformRules.length > 0, "word glyphs need an explicit inherited-motion override");
	assert.equal(glyphTransformRules.at(-1).declarations.transform, "none");
});
