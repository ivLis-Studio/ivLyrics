import assert from "node:assert/strict";
import test from "node:test";
import { createPanelTranslationLoader } from "../src/lyrics/panelTranslationLoader.mjs";
import { createPanelLyricPresentation } from "../src/lyrics/panelLyricPresentation.mjs";
import { createTranslationPresentation } from "../src/lyrics/translationPresentation.mjs";

const uri = "spotify:track:fixture";
const track = { uri, trackId: "fixture", title: "Fixture title", languageOverride: "ja" };
const vocal = text => ({ text, syllables: [{ text, startTime: 1000, endTime: 1400 }] });
const lyrics = [
    { text: "[Verse 1]", startTime: 0 },
    { text: "日本語 背後", startTime: 1000, vocals: {
        lead: vocal("日本語"), background: [{ text: "empty part", syllables: [] }, vocal("背後")],
    } },
    { text: "自由", startTime: 2000 },
];

function createFixture({ aiRequest, displayMode1 = "romaji", displayMode2 = "gemini_ko" }) {
    const requests = [];
    const conversions = [];
    const snapshots = [];
    const warnings = [];
    const shown = [];
    let notation = "latin";
    class Translator {
        static callGemini(args) { requests.push(args); return aiRequest(args); }
        constructor(language) { assert.equal(language, "ja"); }
        romajifyText(text, script, format) {
            conversions.push([text, script, format]);
            return { "日本語": "nihongo", "背後": "haigo", "自由": "jiyuu" }[text];
        }
    }
    const presentation = createPanelLyricPresentation({
        getDisplayComparison: () => null,
        getPhoneticHyphenMode: () => "keep",
    });
    const settings = {
        "translate:detect-language-override": "ko",
        "translation-mode:japanese": displayMode1,
        "translation-mode-2:japanese": displayMode2,
    };
    const load = createPanelTranslationLoader({
        getPanelLyricsService: () => ({
            detectLanguage: () => assert.fail("the track override already sets the source language"),
            getTranslationCacheId: () => "fixture",
        }),
        getTranslator: () => Translator,
        getVisualSetting: key => settings[key],
        getTranslationTargetLanguage: () => "ko",
        getPronunciationNotation: () => notation,
        getTranslationStyle: () => "natural",
        wantsPronunciationSlots: () => true,
        isActiveLoad: () => true,
        ...presentation,
        displayLyrics: rows => shown.push(rows),
        publishPanelLyricsSnapshot: snapshot => snapshots.push(snapshot),
        reportWarning: (message, error) => warnings.push([message, error.message]),
    });
    return {
        requests, conversions, snapshots, warnings, shown,
        load: () => load(track, lyrics, { provider: "fixture-provider" }, 1, "karaoke", "sync-data"),
        setNotation: value => { notation = value; },
    };
}

test("panel keeps traditional pronunciation alongside AI translation with the page's multi-vocal cache input", async () => {
    const h = createFixture({ aiRequest: async () => ({ vi: ["[Verse 1]", "일본어", "뒤에서", "자유"] }) });
    await h.load();
    const pageSource = createTranslationPresentation({}).getNonSectionLyricsText(lyrics);
    assert.deepEqual(h.requests.map(args => [args.trackId, args.provider, args.text, args.sourceLang]),
        [["fixture", "fixture-provider", pageSource, "ja"]]);
    assert.deepEqual(h.conversions, [
        ["日本語", "romaji", "spaced"], ["背後", "romaji", "spaced"], ["自由", "romaji", "spaced"],
    ]);
    const [_, multi, plain] = h.shown[0];
    assert.equal(multi.vocals.lead.phonetic, "nihongo");
    assert.equal(multi.vocals.lead.translation, "일본어");
    assert.equal(multi.vocals.background[0].phonetic, undefined);
    assert.equal(multi.vocals.background[1].phonetic, "haigo");
    assert.equal(multi.vocals.background[1].translation, "뒤에서");
    assert.equal(plain.phoneticText, "jiyuu");
    assert.equal(plain.text2, "자유");
    assert.equal(h.snapshots[0].translationSourceText, pageSource);
    assert.equal(h.snapshots[0].presentationComplete, true);
    assert.deepEqual(h.warnings, []);
});

test("a failed panel slot does not discard a successful pronunciation slot or mark the result complete", async () => {
    const h = createFixture({
        displayMode1: "gemini_romaji",
        aiRequest: async ({ wantSmartPhonetic }) => wantSmartPhonetic
            ? { phonetic: ["nihongo", "haigo", "jiyuu"] }
            : { translation: ["short"] },
    });
    await h.load();
    assert.equal(h.requests[0].pronunciationNotation, "latin");
    assert.equal(h.requests[0].pronunciationSlots, true);
    assert.equal(h.shown[0][1].vocals.background[1].phonetic, "haigo");
    assert.equal(h.shown[0][1].text2, "");
    assert.equal(h.snapshots[0].presentationComplete, false);
    assert.deepEqual(h.snapshots[0].translationLines, []);
    assert.equal(h.warnings.length, 1);
});

test("a cleared vocal supplement keeps later edited rows at their original positions", async () => {
    const h = createFixture({ displayMode1: "gemini_romaji", aiRequest: async ({ wantSmartPhonetic }) => wantSmartPhonetic
        ? { phonetic: ["", "haigo", "jiyuu"], userEdited: true }
        : { translation: ["일본어", "뒤에서", "자유"] } });
    await h.load();
    const [, multi, last] = h.shown[0];
    assert.equal(multi.vocals.lead.phonetic, undefined);
    assert.equal(multi.vocals.lead.translation, "일본어");
    assert.equal(multi.vocals.background[1].phonetic, "haigo");
    assert.equal(last.phoneticText, "jiyuu");
    assert.deepEqual(h.warnings, []);
    assert.equal(h.snapshots[0].presentationComplete, true);
});

test("a notation change drops the previous panel request before it can start the second slot", async () => {
    const response = Promise.withResolvers();
    const h = createFixture({ displayMode1: "gemini_romaji", aiRequest: () => response.promise });
    const loading = h.load();
    assert.equal(h.requests.length, 1);
    h.setNotation("ipa");
    response.resolve({ phonetic: ["nihongo", "haigo", "jiyuu"] });
    await loading;
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.shown, []);
    assert.deepEqual(h.snapshots, []);
});
