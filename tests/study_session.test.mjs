import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStudyHistory } from "../src/features/learning/studyPack.mjs";
import { observeStudySession } from "../src/features/learning/studySession.mjs";
import { createStudyGeneration } from "../src/features/learning/studyGeneration.mjs";
import { buildCacheKey } from "../src/features/learning/studyIdentity.mjs";
import { createStudyPanel } from "../src/features/learning/createStudyPanel.mjs";

const pack = (cacheKey, title) => ({ cacheKey, trackId: cacheKey, title, quiz: [{ question: title }] });
const answers = { 0: { choiceIndex: 0, correct: true } };

test("the wordbook is available for a song without a lesson or lyrics", () => {
    const t = key => key;
    const react = {
        memo: component => component,
        useState: initial => [initial === "explain" ? "words" : (typeof initial === "function" ? initial() : initial), () => {}],
        useMemo: compute => compute(),
        useCallback: callback => callback,
        useRef: current => ({ current }),
        useEffect() {},
        createElement: (type, props, ...children) => ({ type, props, children }),
    };
    const Panel = createStudyPanel({
        react, t, components: { EmptyState: "empty-state", TabButton: "study-tab" },
        navigation: { useLearningOpenState: () => true }, repository: {}, generation: {}, playback: {},
        settings: { getTargetLanguage: () => "ko", getInitialStudyDifficulty: () => "normal", getStudyDifficultyLabel: t },
    });
    const stage = Panel({ trackUri: "spotify:track:another-song" }).children[1].children[1];
    const visible = stage.children.filter(Boolean);
    assert.ok(visible.some(node => node.props?.className?.includes("ivlyrics-study-wordbook")));
    assert.ok(visible.every(node => node.type !== "empty-state"), "lesson empty state should stay on lesson tabs");
});

function createSession(initial = {}) {
    const listeners = new Set();
    const commits = [];
    const errors = [];
    let latest = initial;
    let state = {};
    let owned = true;
    const storage = Promise.withResolvers();
    const close = observeStudySession({
        cacheKey: "first", ownsSession: () => owned, readStudySession: () => storage.promise,
        generation: {
            getGenerationSnapshot: () => latest,
            subscribeGeneration(listener) {
                listeners.add(listener);
                listener(latest);
                return () => listeners.delete(listener);
            },
        },
        updateSession: update => { state = update(state); },
        onCommitted: value => commits.push(value),
        onReadError: error => errors.push(error),
    });
    return {
        snapshot: () => state, close, commits, errors,
        async finishRead(value) { storage.resolve(value); await storage.promise; },
        leave: () => { owned = false; },
        publish(snapshot) { latest = snapshot; for (const listener of listeners) listener(snapshot); },
    };
}

test("a late saved quiz cannot replace a generation that finished after the read began", async () => {
    const session = createSession();
    const replaced = pack("first", "New quiz");
    session.publish({ cacheKey: "first", status: "loading", pack: null });
    session.publish({ cacheKey: "first", status: "ready", pack: replaced });
    await session.finishRead({ pack: pack("first", "Old quiz"), answers });
    assert.strictEqual(session.snapshot().pack, replaced);
    assert.deepEqual(session.snapshot().answers, {});
    assert.deepEqual(session.commits, [replaced]);
    session.close();
});

test("the stored quiz and answers remain available after regeneration fails", async () => {
    const saved = pack("first", "Saved quiz");
    const session = createSession({ cacheKey: "first", status: "loading", pack: null });
    await session.finishRead({ pack: saved, answers });
    session.publish({ cacheKey: "first", status: "loading", pack: pack("first", "Partial quiz") });
    session.publish({ cacheKey: "first", status: "error", error: "offline" });
    assert.strictEqual(session.snapshot().pack, saved);
    assert.deepEqual(session.snapshot().answers, answers);
    assert.equal(session.snapshot().quizStep, 1);
    assert.equal(session.snapshot().generation.error, "offline");
    assert.deepEqual(session.commits, []);
    session.close();
});

test("reopening a ready session restores saved progress and history keeps prior counts", async () => {
    const saved = { ...pack("first", "Saved quiz"), lines: [1, 2], updatedAt: 1 };
    const session = createSession({ cacheKey: "first", status: "ready", pack: saved });
    await session.finishRead({ pack: saved, answers });
    assert.deepEqual(session.snapshot().answers, answers);
    assert.deepEqual(session.commits, []);
    const history = normalizeStudyHistory([saved]);
    const next = normalizeStudyHistory([{ ...pack("second", "New song"), updatedAt: 2 }, ...history]);
    assert.deepEqual(next[1], history[0]);
    session.close();
});

test("older regenerated quizzes still reopen their original lesson difficulty", () => {
    const identity = { trackUri: "spotify:track:first", lyricsHash: "hash", targetLang: "ko" };
    const olderPack = { ...identity, cacheKey: buildCacheKey(identity), difficulty: "hard", quizDifficulty: "hard" };
    assert.equal(normalizeStudyHistory([olderPack])[0].difficulty, "normal");
});

test("an obsolete session discards its local read and generation callback", async () => {
    const session = createSession();
    session.publish({ cacheKey: "second", status: "ready", pack: pack("second", "Different song") });
    session.leave();
    session.publish({ cacheKey: "first", status: "ready", pack: pack("first", "Late generation") });
    await session.finishRead({ pack: pack("first", "Late cache"), answers });
    assert.deepEqual(session.snapshot(), {});
    assert.deepEqual(session.commits, []);
    session.close();
});

function createQuizJob(lineCount) {
    let state = {};
    const requests = [];
    const generation = createStudyGeneration({
        getGenerationSnapshot: () => state,
        setGenerationState: patch => { state = { ...state, ...patch }; },
        notifyGeneration() {}, detectSourceLanguage: () => "en", showSuccess() {},
        t: (_key, fallback) => fallback,
        repository: { async replaceStudySession(pack) { return pack; } },
        requestStudy() {
            const response = Promise.withResolvers();
            requests.push(response);
            return response.promise;
        },
    });
    const job = generation.startQuizGenerationJob({
        normalizedLyrics: Array.from({ length: lineCount }, (_, index) => ({ index, text: `Lyric line ${index}` })),
        basePack: { ...pack("first", "Previous quiz"), difficulty: "normal" },
        cacheKey: "first", trackId: "first", targetLang: "ko", difficulty: "hard",
    });
    return { job, requests, snapshot: () => state };
}

test("late chunks neither restart nor update a failed quiz job", async t => {
    t.mock.method(console, "warn", () => {});
    const { job, requests, snapshot } = createQuizJob(36);
    assert.equal(requests.length, 3);
    const failure = assert.rejects(job, /provider failed/);
    requests[0].reject(new Error("provider failed"));
    await failure;
    const failed = snapshot();
    assert.equal(failed.status, "error");
    requests[1].resolve({});
    requests[2].reject(new Error("request timeout"));
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(snapshot(), failed);
    assert.equal(requests.length, 3);
});

test("parallel quiz chunks retain source order when the final chunks arrive first", async () => {
    const { job, requests } = createQuizJob(18);
    assert.equal(requests.length, 3);
    for (const index of [2, 1, 0]) {
        requests[index].resolve({ quiz: [{ question: `Question ${index}`, lineIndex: index * 6,
            choices: ["Good", "Wrong"], answerIndex: 0 }] });
        await new Promise(resolve => setImmediate(resolve));
    }
    const result = await job;
    assert.deepEqual(result.quiz.map(item => item.question), ["Question 0", "Question 1", "Question 2"]);
    assert.equal(result.difficulty, "normal");
    assert.equal(result.quizDifficulty, "hard");
});
