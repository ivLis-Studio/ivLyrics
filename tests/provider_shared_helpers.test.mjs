import assert from "node:assert/strict";
import test from "node:test";
import { measureLyricsDisplayWidth } from "../src/providers/lyrics/lyricsDisplayWidth.mjs";
import { measureLyricsDisplayWidth as lyricsPlusWidth } from "../src/providers/lyrics/lyricsPlusSoloLineLayout.mjs";
import { measureLyricsDisplayWidth as openLyricsWidth } from "../src/providers/lyrics/openLyricsJapaneseWrap.mjs";
import { groupParallelVocalLines } from "../src/providers/lyrics/lyricsTextParsers.mjs";
import { groupParallelVocalLines as lyricsPlusGroup } from "../src/providers/lyrics/lyricsPlusPayload.mjs";
import { createProviderText } from "../src/providers/providerText.mjs";
import {
    createAiAdvancedParamsSection, readAiAdvancedRequestParams, renderAiConnectionTestRow,
} from "../src/providers/ai/aiProviderSettings.mjs";
import { readStoredAddonSetting } from "../src/providers/addonSettingsStorage.mjs";

// Helpers that several providers used to repeat inline. Each test compares the
// shared copy with the former inline behavior.

// The Open Lyrics copy listed U+3000 explicitly; \s already includes it.
function formerJapaneseWrapWidth(value) {
    let width = 0;
    for (const character of String(value || '')) {
        if (/\p{Mark}/u.test(character)) continue;
        if (/[\s\u3000]/u.test(character)) width += 0.33;
        else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(character)) width += 1;
        else if (/[A-Z]/u.test(character)) width += 0.72;
        else if (/[a-z]/u.test(character)) width += 0.58;
        else if (/\p{Number}/u.test(character)) width += 0.62;
        else if (/[.,'’!?;:()-]/u.test(character)) width += 0.38;
        else width += 0.8;
    }
    return width;
}

test("both line wrappers measure with the one shared width function", () => {
    assert.strictEqual(lyricsPlusWidth, measureLyricsDisplayWidth);
    assert.strictEqual(openLyricsWidth, measureLyricsDisplayWidth);
    for (let codePoint = 0; codePoint <= 0xffff; codePoint++) {
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
        const character = String.fromCodePoint(codePoint);
        assert.equal(measureLyricsDisplayWidth(character), formerJapaneseWrapWidth(character), codePoint.toString(16));
    }
    for (const sample of ["夜に駆ける\u3000YOASOBI", "Señorita (Remix)", "😀 1, 2, 3!", "가\u0301나다", "", null]) {
        assert.equal(measureLyricsDisplayWidth(sample), formerJapaneseWrapWidth(sample));
    }
});

test("LyricsPlus groups vocal lines with the shared TTML parser rule", () => {
    assert.strictEqual(lyricsPlusGroup, groupParallelVocalLines);
    const lines = [
        { id: "late", startTime: 2000, sourceIndex: 0 },
        { id: "second", startTime: 1000, sourceIndex: 2 },
        { id: "first", startTime: 1000, sourceIndex: 1 },
        { id: "unindexed", startTime: 1000 },
    ];
    assert.deepEqual(groupParallelVocalLines(lines).map(line => line.id), ["unindexed", "first", "second", "late"]);
    assert.deepEqual(groupParallelVocalLines(null), []);
});

test("provider text resolves translations and fills English fallbacks", () => {
    const calls = [];
    const i18n = { t: (path, params) => { calls.push([path, params]); return path === "settings.aiProviders.known" ? "Translated" : path; } };
    const aiText = createProviderText(() => i18n, "settings.aiProviders.");
    assert.equal(aiText("known", "Fallback"), "Translated");
    assert.equal(aiText("missing", "{count} models", { count: 3 }), "3 models");
    assert.equal(aiText("missing", "Keep {other}", { count: 3 }), "Keep {other}");
    assert.equal(aiText("missing", "Plain"), "Plain");
    assert.deepEqual(calls[0], ["settings.aiProviders.known", undefined]);
    const lyricsText = createProviderText(() => null, "settings.lyricsProviders.");
    assert.equal(lyricsText("attribution", "Lyrics from {source}.", { source: "lrc.red" }), "Lyrics from lrc.red.");
});

const settingsFrom = (values) => (key, fallback) => (key in values ? values[key] : fallback);

test("advanced request parameters keep their defaults and opt-outs", () => {
    assert.deepEqual(readAiAdvancedRequestParams(settingsFrom({})), { max_tokens: 16000, temperature: 0.3 });
    assert.deepEqual(readAiAdvancedRequestParams(settingsFrom({
        "adv-maxTokens-value": "2048", "adv-temperature-value": "0.9",
    })), { max_tokens: 2048, temperature: 0.9 });
    assert.deepEqual(readAiAdvancedRequestParams(settingsFrom({
        "adv-maxTokens-value": "not a number", "adv-temperature-value": 0,
    })), { max_tokens: 16000, temperature: 0.3 });
    assert.deepEqual(readAiAdvancedRequestParams(settingsFrom({
        "adv-maxTokens-enabled": false, "adv-temperature-enabled": false,
    })), {});
});

function createReact() {
    const slots = [];
    let cursor = 0;
    return {
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
            return [slots[index], (next) => { slots[index] = next; }];
        },
        useCallback: (callback) => callback,
        render(component) { cursor = 0; return component(); },
    };
}
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
    : node && typeof node === "object" && "type" in node ? [node, ...elements(node.props.children)] : [];

test("the advanced parameters section reads and saves the same provider keys", () => {
    const React = createReact();
    const stored = { "adv-maxTokens-value": 4096 };
    const saved = [];
    const AdvancedParamsSection = createAiAdvancedParamsSection({
        React, getSetting: settingsFrom(stored), setSetting: (key, value) => saved.push([key, value]), aiText: (_key, fallback) => fallback,
    });
    let tree = React.render(AdvancedParamsSection);
    assert.equal(tree.props.className, "ai-addon-setting ai-addon-advanced-params");
    const toggle = elements(tree).find(node => node.props.className === "ai-addon-advanced-toggle");
    assert.equal(toggle.props["aria-expanded"], false);
    toggle.props.onClick();
    tree = React.render(AdvancedParamsSection);
    const inputs = elements(tree).filter(node => node.type === "input");
    assert.deepEqual(inputs.map(node => [node.props.type, node.props.checked ?? node.props.value]), [
        ["checkbox", true], ["number", 4096], ["checkbox", true], ["number", 0.3],
    ]);
    assert.deepEqual([inputs[3].props.step, inputs[3].props.min, inputs[3].props.max], ["0.1", "0", "2"]);
    inputs[0].props.onChange({ target: { checked: false } });
    inputs[1].props.onChange({ target: { value: "" } });
    inputs[3].props.onChange({ target: { value: "1.5" } });
    assert.deepEqual(saved, [
        ["adv-expanded", true], ["adv-maxTokens-enabled", false], ["adv-maxTokens-value", 16000], ["adv-temperature-value", 1.5],
    ]);
});

test("the connection test row marks success and failure the same way", () => {
    const React = createReact();
    const aiText = (_key, fallback) => fallback;
    const onTest = () => {};
    const status = (testStatus) => renderAiConnectionTestRow(React, { onTest, testStatus, aiText }).props.children[1];
    const row = renderAiConnectionTestRow(React, { onTest, testStatus: "", aiText });
    assert.equal(row.props.className, "ai-addon-setting");
    assert.equal(row.props.children[0].props.onClick, onTest);
    assert.equal(row.props.children[0].props.children[0], "Test Connection");
    assert.equal(row.props.children[1], "");
    assert.equal(status("✓ Connection successful").props.className, "ai-addon-test-status success");
    assert.equal(status("✗ Failed").props.className, "ai-addon-test-status error");
    assert.equal(status("Testing...").props.className, "ai-addon-test-status ");
});

test("stored add-on settings parse JSON and keep plain strings", () => {
    const store = { a: "true", b: "42", c: '{"x":1}', d: "gpt-4o", e: null };
    const read = (key, fallback) => readStoredAddonSetting(storageKey => store[storageKey], key, fallback);
    assert.equal(read("a"), true);
    assert.equal(read("b"), 42);
    assert.deepEqual(read("c"), { x: 1 });
    assert.equal(read("d"), "gpt-4o");
    assert.equal(read("e", "default"), "default");
    assert.equal(read("missing"), null);
});
