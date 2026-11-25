import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const styles = readPcStylesheet();
const baselineStyles = execFileSync("git", ["show", "3353a5d:style.css"], {
	cwd: repoRoot,
	encoding: "utf8",
});
const completedColor = "--iv-karaoke-completed-color";
const glyphFill = ".lyrics-karaoke-glyph-fill";
const wrappers = [".lyrics-karaoke-char", ".lyrics-karaoke-text-run-segment"];
const normalize = value => value.trim().replace(/\s+/g, " ");

// Inspect all declarations, including later duplicate rules. A nested paint
// layer can override an inherited color while its parent still animates an
// unused copy, so checking only the final background-color misses the waste.
const readRules = css => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
	.map(([, selector, body]) => ({
		selector: normalize(selector),
		declarations: body.split(";").filter(value => value.includes(":"))
			.map(value => {
				const separator = value.indexOf(":");
				return [normalize(value.slice(0, separator)), normalize(value.slice(separator + 1))];
			}),
	}));
const currentRules = readRules(styles);
const baselineRules = readRules(baselineStyles);
const rulesFor = (rules, selector) => rules.filter(rule => rule.selector === selector);
const propertyDeclarations = (rules, property) => rules.flatMap(rule => rule.declarations
	.filter(([name]) => name === property)
	.map(([, value]) => ({ selector: rule.selector, value })));

test("completed lyric color animates only on the layer that paints it", () => {
	assert.deepEqual(
		propertyDeclarations(currentRules, completedColor).map(({ selector }) => selector),
		[glyphFill],
		"the glyph's motion/shaping wrapper must not animate an unused inherited color"
	);
	const colorTransitions = currentRules.flatMap(rule => rule.declarations
		.filter(([name, value]) => name.startsWith("transition") && value.includes(completedColor))
		.map(() => rule.selector));
	assert.deepEqual(colorTransitions, [glyphFill]);
	const colorConsumers = currentRules.flatMap(rule => rule.declarations
		.filter(([, value]) => value.includes(`var(${completedColor}`))
		.map(([property]) => ({ selector: rule.selector, property })));
	assert.equal(colorConsumers.length, 1);
	assert.equal(colorConsumers[0].property, "background-color");
	assert.deepEqual(colorConsumers[0].selector.split(",").map(normalize), [
		`.lyrics-karaoke-char--done > ${glyphFill}`,
		`.lyrics-karaoke-text-run-segment--done > ${glyphFill}`,
		`.lyrics-karaoke-line.is-complete ${glyphFill}`,
	]);
});

test("glyph fill keeps the shipped colors, completion curve and exit delay", () => {
	const paintRules = rules => rules.filter(rule => rule.selector.includes(glyphFill)
		|| rule.selector === `@property ${completedColor}`);
	assert.ok(paintRules(currentRules).length > 3, "pending, active and completed paint rules are present");
	assert.deepEqual(paintRules(currentRules), paintRules(baselineRules),
		"the rendered layer, including the configurable 80ms exit delay, remains unchanged");
	const transition = rulesFor(currentRules, glyphFill)[0].declarations
		.find(([name]) => name === "transition")[1];
	assert.equal(transition,
		`${completedColor} 520ms cubic-bezier(0.16, 1, 0.3, 1) var(--lyrics-detail-exit-delay, 0ms)`);
});

test("character and shaped-run wrappers retain their original layout and 75ms motion", () => {
	for (const wrapper of wrappers) {
		const previous = rulesFor(baselineRules, wrapper);
		assert.equal(previous.length, 1, `${wrapper} has its original base rule`);
		const expected = previous.map(rule => ({
			...rule,
			declarations: rule.declarations.filter(([name]) => name !== completedColor)
				.map(([name, value]) => [name, name === "transition" ? "transform 75ms linear" : value]),
		}));
		assert.deepEqual(rulesFor(currentRules, wrapper), expected,
			`${wrapper} keeps its shaping, dimensions, clipping and bounce transform`);
	}
});

test("idle lyric-page glyphs drop only their identity transform", () => {
	const selectorsWith = (property, value) => currentRules
		.filter(rule => rule.declarations.some(([name, declared]) => name === property && declared === value))
		.flatMap(rule => rule.selector.split(",").map(normalize));
	// An identity transform split every row into per-glyph paint chunks. Idle
	// glyphs on the lyric pages drop it, while moving glyphs and rows with an
	// outline (whose per-glyph stacking contexts order the outline copies) keep
	// the base rule. Other renderers are not matched at all.
	const idle = selectorsWith("transform", "none");
	for (const page of [".lyrics-lyricsContainer-SyncedLyrics", ".lyrics-lyricsContainer-UnsyncedLyricsPage"]) {
		for (const wrapper of [...wrappers, ".lyrics-karaoke-word.is-word-timed"]) {
			assert.ok(idle.includes(`${page} .lyrics-karaoke-line:not(.has-glyph-outline) ${wrapper}:not(.is-bouncing)`),
				`${page} ${wrapper}`);
		}
	}
	const glyphSelector = /\.lyrics-karaoke-(char|text-run-segment|word)\b[^ ]*$/;
	assert.deepEqual(idle.filter(selector => glyphSelector.test(selector) && !selector.includes(":not(.has-glyph-outline)")),
		[".lyrics-karaoke-word.is-word-timed .lyrics-karaoke-char"],
		"only the word-mode glyph override applies outside the lyric pages");
	// Live rows are painted on every display frame; non-live renderers keep
	// their 75 ms smoothing on the transform and the glow.
	const untransitioned = selectorsWith("transition", "none");
	for (const wrapper of [...wrappers, ".lyrics-karaoke-word.is-word-timed"]) {
		assert.ok(untransitioned.includes(`${wrapper}[data-karaoke-live]`), wrapper);
	}
	const glyphTransitions = untransitioned.filter(selector => /\.lyrics-karaoke-(char|text-run-segment|word)\b/.test(selector));
	assert.ok(glyphTransitions.every(selector => selector.includes("[data-karaoke-live]")), glyphTransitions.join("\n"));
	const glow = rulesFor(currentRules, [
		".lyrics-karaoke-char.is-bouncing::after",
		".lyrics-karaoke-text-run-segment.is-bouncing::after",
		".lyrics-karaoke-word.is-word-timed.is-bouncing .lyrics-karaoke-char::after",
	].join(", "));
	assert.equal(glow.length, 1);
	assert.ok(glow[0].declarations.some(([name, value]) => name === "transition" && value === "opacity 75ms linear"));
});
