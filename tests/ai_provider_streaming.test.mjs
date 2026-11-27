import assert from "node:assert/strict";
import test from "node:test";
import { createStreamingOutput } from "../src/providers/ai/aiStreamingOutput.mjs";
import { createResearchStreamProgressParser } from "../src/providers/ai/researchDocument.mjs";

test("lyric output delivers complete lines, flushes the tail, and reconciles provisional text", () => {
    const chunks = ["First", "\n", "\n", "Du", "et / 반주\n", "Last"];
    for (let split = 0; split <= chunks.length; split++) {
        const raw = [];
        const lines = [];
        const output = createStreamingOutput({
            onRawChunk: chunk => raw.push(chunk),
            onLine: (...line) => lines.push(line),
        });
        chunks.forEach((chunk, index) => {
            output.append(chunk);
            if (index >= split) output.emit();
        });
        output.emit(true);
        output.emit(true);
        assert.deepEqual(raw, chunks);
        assert.equal(output.text, chunks.join(""));
        assert.deepEqual(lines, [[0, "First"], [1, ""], [2, "Duet / 반주"], [3, "Last"]]);
        assert.deepEqual(output.finish(output.text, () => ["First", "", "Duet"]), ["First", "", "Duet"]);
        assert.deepEqual(lines.slice(4), [[2, "Duet"], [3, ""]]);
    }
});

test("a failing line callback keeps the unaccepted line available for the next emit", () => {
    const lines = [];
    let fail = true;
    const output = createStreamingOutput({
        onLine(index, line) {
            if (index === 1 && fail) {
                fail = false;
                throw new Error("rejected callback");
            }
            lines.push([index, line]);
        },
    });
    output.append("one\npre");
    output.emit();
    output.append("fix\ntail");
    assert.throws(() => output.emit(), /rejected callback/);
    output.emit(true);
    assert.deepEqual(lines, [[0, "one"], [1, "prefix"], [2, "tail"]]);
});

test("research emits each completed field in order across escaped strings and arbitrary chunk boundaries", () => {
    const source = {
        title: 'The "song" \\ 愛 🎶',
        facts: [{ tags: ["[verse]", "\nchorus"], count: 2, published: true }],
        excerpt: "가".repeat(4096),
        year: 2012,
        verified: false,
        source: null,
    };
    const json = `\`\`\`json\r\n${JSON.stringify(source)}\r\n\`\`\``;
    const expected = Object.entries(source).map((_, i, entries) => Object.fromEntries(entries.slice(0, i + 1)));
    for (const width of [1, 2, 7, 31, 103, json.length]) {
        const actual = [];
        const parser = createResearchStreamProgressParser(value => actual.push(value));
        for (let start = 0; start < json.length; start += width) {
            parser.push(json.slice(start, start + width));
        }
        assert.deepEqual(actual, expected);
    }
});

test("DeepL preserves batch order and byte limits for escaped and non-ASCII lyrics", async () => {
    const { default: initialize } = await import("../src/providers/ai/Addon_AI_DeepL.js");
    const batches = [];
    let addon;
    initialize({
        host: {},
        getManager: () => ({ getAddonSetting: () => "fixture-key:fx" }),
        getAiRequest: () => async (_url, request) => {
            const { text } = JSON.parse(request.body);
            batches.push(text);
            return Response.json({ translations: text.map(line => ({ text: line })) });
        },
        registerAiAddon(value) { addon = value; },
    });
    const firstBatch = Array.from({ length: 50 }, (_, i) => `line ${i}`);
    const large = '"🎶'.repeat(11000);
    const lines = [...firstBatch, large, large + "end", "Last line"];
    assert.deepEqual(await addon.translateLyrics({ text: lines.join("\n") }), { translation: lines });
    assert.deepEqual(batches, [firstBatch, [large], [large + "end", "Last line"]]);
    await assert.rejects(addon.translateLyrics({ text: "🎶".repeat(30000) }), /A lyric line is too large/);
    assert.equal(batches.length, 3);
});
