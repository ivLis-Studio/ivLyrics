import { readLanguageTable } from "./fixtures/language-source.mjs";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { assertNoInternals, button, createHarness, deferred, settle, texts } from "./local_model_harness.mjs";

const allNodes = (tree) => tree && typeof tree === "object" ? [tree, ...tree.children.flatMap(allNodes)] : [];
const visible = (h) => texts(h.render()).join("\n");
const open = async (options) => {
    const h = createHarness(options);
    h.render();
    await settle();
    return h;
};
const run = async (h) => {
    await button(h.render(), "Test translation").props.onClick();
    return visible(h);
};
const emit = (onData, timings, text = "한글 😀 translation", finish = "stop") => {
    onData({ choices: [{ delta: { content: text } }] });
    onData({ choices: [{ delta: {}, finish_reason: finish }] });
    // Exact wllama/llama.cpp streaming shape: terminal stats, without a choice or text.
    if (timings !== undefined) onData({ choices: [], usage: { completion_tokens: timings?.predicted_n }, timings });
};

test("test uses actual output-token statistics and decode time, excluding load/prefill/queue time", async () => {
    let h;
    h = await open({
        load: () => { h.advance(20_000); },
        completion: ({ onData, options }) => {
            assert.equal(options.stream_options.include_usage, true);
            h.advance(12_000); // 10 s prompt prefill + 2 s decode
            onData({ choices: [], timings: { predicted_n: 1, predicted_ms: 1 } }); // interim stats are replaced
            emit(onData, { predicted_n: 8, predicted_ms: 2000, prompt_n: 700, prompt_ms: 10_000 });
        }
    });
    const text = await run(h);
    assert.match(text, /Total: 32\.0s/);
    assert.match(text, /4\.0 output tokens\/s · 8 tokens · 2\.00s decoding/);
    assert.match(text, /excludes download, loading and prompt processing/);
    assert.match(text, /If this feels slow, try Local Medium, a smaller preset/);
    const resultRegion = allNodes(h.render()).find((node) => node.props["aria-atomic"] === true);
    assertNoInternals(texts(resultRegion).join("\n"));
    assert.ok(allNodes(h.render()).some((node) => node.props.role === "status" && node.props["aria-live"] === "polite"));
    assert.equal(await h.addon.testConnection(), true, "existing manager contract stays boolean");
});

test("missing, zero and invalid runtime statistics never produce a made-up or non-finite speed", async () => {
    for (const timings of [undefined, null, {}, { predicted_n: 0, predicted_ms: 2 },
        { predicted_n: -1, predicted_ms: 2 }, { predicted_n: 1.5, predicted_ms: 2 },
        { predicted_n: "8", predicted_ms: 2 }, { predicted_n: 8, predicted_ms: 0 },
        { predicted_n: 8, predicted_ms: -1 }, { predicted_n: 8, predicted_ms: Infinity },
        { predicted_n: 8, predicted_ms: NaN }, { predicted_n: 8, predicted_ms: Number.MIN_VALUE }]) {
        const h = await open({ completion: ({ onData }) => emit(onData, timings) });
        const text = await run(h);
        assert.match(text, /Output speed unavailable for this test/);
        assert.doesNotMatch(text, /output tokens\/s|NaN|Infinity/);
    }
});

test("the hint suggests a smaller existing localized preset, with none below Light", async () => {
    for (const [quality, smaller] of [["high", "Local Medium"], ["medium", "Local Light"], ["light", null]]) {
        const h = await open({ cached: [quality], settings: { quality },
            completion: ({ onData }) => emit(onData, { predicted_n: 3, predicted_ms: 1500 }) });
        const text = await run(h);
        assert.match(text, /2\.0 output tokens\/s/);
        if (smaller) assert.ok(text.includes(`If this feels slow, try ${smaller}`));
        else assert.doesNotMatch(text, /smaller preset/);
        assert.doesNotMatch(text, /too slow|fast enough|recommended speed/i);
    }
});

test("repeated, unmeasured, failed and empty completions replace earlier speed results", async () => {
    let mode = "measured";
    const h = await open({ completion: ({ onData }) => {
        if (mode === "failed") throw new Error("inference failed");
        emit(onData, mode === "unmeasured" ? undefined : { predicted_n: 10, predicted_ms: 1000 }, mode === "empty" ? " " : "Translation");
    } });
    assert.match(await run(h), /10\.0 output tokens\/s/);
    mode = "unmeasured";
    assert.match(await run(h), /Output speed unavailable/);
    for (mode of ["failed", "empty"]) {
        const text = await run(h);
        assert.match(text, /✗/);
        assert.doesNotMatch(text, /output tokens\/s|Output speed unavailable|smaller preset|Total:/);
    }
});

test("changing tier, processor, target language or freeing memory cancels a test without a stale result", async () => {
    for (const action of ["tier", "processor", "language", "unload", "delete", "unmount"]) {
        const gate = deferred();
        let started = false;
        let signal;
        const h = await open({ cached: ["high", "medium"], config: { "translate:target-language": "ko" },
            completion: async ({ onData, signal: currentSignal }) => {
                started = true;
                signal = currentSignal;
                await gate.promise; // Simulate a delayed callback even after cancellation.
                emit(onData, { predicted_n: 30, predicted_ms: 1000 });
            }
        });
        const pending = button(h.render(), "Test translation").props.onClick();
        await h.until(() => started);
        assert.equal(button(h.render(), "…").props.disabled, true);
        const nodes = allNodes(h.render());
        if (action === "tier") nodes.find((node) => node.props["data-tier"] === "medium").props.onClick();
        if (action === "processor") void nodes.find((node) => node.type === "select").props.onChange({ target: { value: "cpu" } });
        if (action === "language") { h.window.CONFIG.visual["translate:target-language"] = "ja"; h.render(); }
        if (action === "unload") button(h.render(), "Free memory").props.onClick();
        if (action === "delete") {
            button(h.render(), "Delete model").props.onClick();
            button(h.render(), "Click again to delete").props.onClick();
        }
        if (action === "unmount") h.unmount();
        assert.equal(signal.aborted, true, action);
        gate.resolve();
        await pending;
        await settle();
        assert.doesNotMatch(visible(h), /30\.0 output tokens\/s|✓|✗/, action);
    }
});

test("all 22 locales translate the metric and retain every required placeholder", () => {
    const files = readdirSync(new URL("../src/i18n/langs/", import.meta.url)).filter((name) => /^Lang.*\.js$/.test(name));
    assert.equal(files.length, 22);
    for (const file of files) {
        const root = readLanguageTable(file);
        assert.ok(root, file);
        const strings = root.settings.aiProviders.localModel;
        for (const [key, params] of [["testTotalTime", ["seconds"]], ["testSpeed", ["speed", "tokens", "seconds"]],
            ["testSpeedUnavailable", []], ["testSpeedScope", []], ["testSmallerHint", ["tier"]]]) {
            assert.ok(strings[key]?.trim(), `${file}: ${key}`);
            assert.deepEqual([...strings[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), params.sort(), `${file}: ${key}`);
            assertNoInternals(strings[key], `${file}: ${key}`);
        }
    }
});
