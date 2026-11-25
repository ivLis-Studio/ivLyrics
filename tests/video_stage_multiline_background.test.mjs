import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const styles = readPcStylesheet();
const normalize = value => value.trim().replace(/\s+/g, " ");
// Keep every occurrence: the same :has() selectors also occur in later
// text-shadow rules, so the last matching block is not the background override.
const rules = [...styles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selectors, body], index) => ({
    selectors: selectors.split(",").map(normalize),
    declarations: [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)]
      .map(([, property, value]) => ({ property, value: normalize(value) })),
    index,
  }));

const video = ".fullscreen-vinyl-overlay.is-presentation-video .fullscreen-vinyl-active-lyric";
const paragraph = `${video} .lyrics-lyricsContainer-LyricsLine > p`;
const groupedParagraph = `${paragraph}:has(.lyrics-karaoke-stack)`;
const singleParagraph = `${paragraph}:has(.lyrics-karaoke-line)`;
const rulesFor = selector => rules.filter(rule => rule.selectors.includes(selector));
const backgrounds = rule => rule.declarations.filter(({ property }) => /^background(?:-|$)/.test(property));
const backgroundsFor = selector => rulesFor(selector).flatMap(backgrounds);
const configuredBackground = {
  property: "background",
  value: "color-mix(in srgb, var(--iv-video-stage-lyric-background-color, #000000) " +
    "var(--iv-video-stage-lyric-background-opacity, 46%), transparent)",
};
const groupBackgroundRules = rules.filter(rule => backgrounds(rule).length &&
  rule.selectors.some(selector => selector.endsWith("p:has(.lyrics-karaoke-stack)")));

test("only the multi-vocal video paragraph receives the transparent group background", () => {
  assert.equal(groupBackgroundRules.length, 1, "one dedicated stack-paragraph background rule must exist");
  const [override] = groupBackgroundRules;
  assert.deepEqual(override.selectors, [groupedParagraph],
    "the override must target the direct paragraph only inside the active video stage");
  assert.deepEqual(backgrounds(override), [{ property: "background", value: "transparent" }]);
  const originalRules = rulesFor(paragraph).filter(rule => backgrounds(rule).length);
  assert.equal(originalRules.length, 1, "the generic paragraph keeps one configured background rule");
  assert.ok(override.index > originalRules[0].index, "the scoped override follows the generic paragraph background");
});

test("the multiline background override leaves geometry, typography and motion untouched", () => {
  assert.equal(groupBackgroundRules.length, 1, "the scoped background override must exist");
  assert.deepEqual(groupBackgroundRules[0].declarations,
    [{ property: "background", value: "transparent" }],
    "the new rule may change only the background, without layout or text-style declarations");
});

test("plain and single-vocal video paragraphs retain the configurable background", () => {
  assert.deepEqual(backgroundsFor(paragraph), [configuredBackground],
    "plain lyrics still use the user's video-stage background color and opacity");
  assert.deepEqual(backgroundsFor(singleParagraph), [],
    "a single karaoke line inherits the generic paragraph background without a transparent override");
});

test("reading, translation and cultural-note boxes retain their configurable backgrounds", () => {
  for (const kind of ["phonetic", "translation", "culturalNote"]) {
    const selector = `${video} .lyrics-lyricsContainer-LyricsLine-${kind}`;
    assert.deepEqual(backgroundsFor(selector), [configuredBackground],
      `${kind} keeps its own configured background, independent of its transparent ancestor`);
  }
});

test("later shared karaoke text-shadow rules do not repaint the transparent group", () => {
  const shadowRules = rulesFor(groupedParagraph)
    .filter(rule => rule.declarations.some(({ property }) => property === "text-shadow"));
  assert.equal(shadowRules.length, 2, "inspect both existing :has() shadow rules, including the later outline override");
  for (const rule of shadowRules) {
    assert.ok(rule.selectors.includes(singleParagraph), "the existing shadow rule still covers single karaoke lines");
    assert.deepEqual(backgrounds(rule), [], "shared shadow selectors must not reset either paragraph background");
    for (const override of groupBackgroundRules) {
      assert.ok(rule.index > override.index, "shadow rules follow the dedicated background override");
    }
  }
  assert.deepEqual(shadowRules.flatMap(rule => rule.declarations
    .filter(({ property }) => property === "text-shadow").map(({ value }) => value)), [
    "none !important",
    "var(--iv-vinyl-original-outline-shadow, 0 0 0 transparent) !important",
  ], "the existing shadow and outline cascade remains intact");
  assert.deepEqual(backgroundsFor(groupedParagraph), [{ property: "background", value: "transparent" }],
    "later duplicate selectors leave the scoped group background transparent");
});
