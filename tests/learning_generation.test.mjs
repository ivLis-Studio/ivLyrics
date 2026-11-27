import assert from "node:assert/strict";
import test from "node:test";
import { createStudyGeneration } from "../src/features/learning/studyGeneration.mjs";
import { createStudyNavigation } from "../src/features/learning/studyNavigation.mjs";

const args = {
    normalizedLyrics: [{ index: 0, text: "First line" }, { index: 1, text: "Second line" }],
    trackId: "first", trackUri: "spotify:track:first", cacheKey: "first", targetLang: "ko",
};
const quiz = { quiz: [{ question: "Question", lineIndex: 0, choices: ["Good", "Wrong"], answerIndex: 0 }] };
const basePack = { ...quiz, difficulty: "normal" };

function harness(requestStudy) {
    let state = {};
    const requests = [], commits = [], toasts = [], progress = [];
    const generation = createStudyGeneration({
        getGenerationSnapshot: () => state,
        setGenerationState: patch => {
            state = { ...state, ...patch };
            if (patch.progress) progress.push({ status: state.status, ...patch.progress });
        },
        notifyGeneration() {},
        detectSourceLanguage: () => "en",
        showSuccess: key => toasts.push(key),
        t: (_key, fallback) => fallback,
        repository: { async replaceStudySession(pack) { commits.push(pack); return pack; } },
        requestStudy(params) {
            requests.push(params);
            return requestStudy(params);
        },
    });
    return { ...generation, requests, commits, toasts, progress, snapshot: () => state };
}

test("splitting a timed-out study request preserves order, progress and the success toast", async () => {
    const h = harness(params => {
        if (params.category === "lines" && params.lines.length > 1) throw new Error("request timeout");
        return quiz;
    });
    await h.startGenerationJob(args);
    const lines = h.requests.filter(params => params.category === "lines");
    assert.deepEqual(lines.map(({ lines, chunkDepth, chunkIndex, chunkTotal }) => [
        lines.map(line => line.index), chunkDepth, chunkIndex, chunkTotal,
    ]), [[[0, 1], 0, 1, 1], [[0], 1, 1, 1], [[1], 1, 1, 1]]);
    const signal = h.requests[0].signal;
    assert.ok(signal instanceof AbortSignal);
    assert.ok(h.requests.every(params => params.signal === signal));
    assert.equal(signal.aborted, false);
    const total = new Set(h.requests.map(params => params.category)).size;
    assert.deepEqual(h.progress.map(({ done }) => done), [0, 0, ...Array.from({ length: total }, (_, i) => i + 1), total]);
    assert.equal(h.snapshot().status, "ready");
    assert.equal(h.commits.length, 1);
    assert.deepEqual(h.toasts, ["generated"]);
});

test("replacing a study with quiz generation aborts outstanding requests without retrying or publishing stale state", async () => {
    const h = harness(params => {
        if (params.trackId === "second") return quiz;
        return new Promise((resolve, reject) => params.signal?.addEventListener("abort", () => {
            reject(new Error("timeout while aborting"));
        }, { once: true }));
    });
    const oldJob = h.startGenerationJob(args);
    assert.equal(h.startGenerationJob(args), oldJob);
    const original = h.requests[0].signal;
    const replacement = h.startQuizGenerationJob({ ...args, trackId: "second", cacheKey: "second", basePack, difficulty: "hard" });
    assert.equal(original.aborted, true);
    assert.equal(await oldJob, null);
    const result = await replacement;
    assert.equal(h.requests.filter(params => params.trackId === "first").length, 1);
    assert.notEqual(h.requests.at(-1).signal, original);
    assert.deepEqual(h.progress.filter(entry => entry.status === "ready"), [{ status: "ready", done: 1, total: 1 }]);
    assert.equal(result.quizDifficulty, "hard");
    assert.deepEqual(h.toasts, ["quizRegenerated"]);
    assert.deepEqual(h.commits, [result]);
});

test("closing or unmounting aborts generation and ignores a late provider result", async () => {
    for (const [method, start] of [["close", "startQuizGenerationJob"], ["dismissForUnmount", "startGenerationJob"]]) {
        const pending = Promise.withResolvers();
        const h = harness(() => pending.promise);
        const state = { open: true, listeners: new Set() };
        const navigation = createStudyNavigation({
            state, document: { querySelector: () => null }, requestAnimationFrame: () => {},
            enablePlaybackGuard() {}, disablePlaybackGuard() {}, cancelGeneration: h.cancelGeneration,
        });
        const job = h[start]({ ...args, basePack });
        const signal = h.requests[0].signal;
        navigation[method]();
        assert.equal(state.open, false);
        assert.equal(signal.aborted, true);
        const cancelled = h.snapshot();
        assert.equal(cancelled.status, "idle");
        assert.equal(cancelled.loadingText, "");
        assert.equal(cancelled.promise, null);
        pending.resolve(quiz);
        assert.equal(await job, null);
        assert.equal(h.snapshot(), cancelled);
        assert.deepEqual(h.commits, []);
        assert.deepEqual(h.toasts, []);
    }
});
