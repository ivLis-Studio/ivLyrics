import assert from "node:assert/strict";
import test from "node:test";
import { createStudyRepository } from "../src/features/learning/studyRepository.mjs";
import { createStudyGeneration } from "../src/features/learning/studyGeneration.mjs";

function databaseFixture() {
    const stores = new Map();
    let connection;
    let openError;
    let abortWrite = false;
    let opened = 0;
    const indexedDB = {
        open() {
            opened++;
            const request = {};
            queueMicrotask(() => {
                if (openError) {
                    request.error = openError;
                    openError = null;
                    request.onerror();
                    return;
                }
                request.result = connection = {
                    objectStoreNames: { contains: name => stores.has(name) },
                    createObjectStore(name, { keyPath }) {
                        stores.set(name, { keyPath, rows: new Map() });
                        return { createIndex() {} };
                    },
                    close() {},
                    transaction(names, mode) {
                        const namesList = Array.isArray(names) ? names : [names];
                        const copies = new Map(namesList.map(name => [name, new Map(stores.get(name).rows)]));
                        let aborted = false;
                        const makeRequest = run => {
                            const request = {};
                            queueMicrotask(() => {
                                if (aborted) return;
                                request.result = run();
                                request.onsuccess?.();
                            });
                            return request;
                        };
                        const tx = {
                            objectStore(name) {
                                const rows = copies.get(name);
                                return {
                                    get: key => makeRequest(() => structuredClone(rows.get(key))),
                                    getAll: () => makeRequest(() => structuredClone([...rows.values()])),
                                    put: value => makeRequest(() => rows.set(value[stores.get(name).keyPath], structuredClone(value))),
                                    delete: key => makeRequest(() => rows.delete(key)),
                                };
                            },
                            abort() {
                                aborted = true;
                                tx.onabort?.();
                            },
                        };
                        setImmediate(() => {
                            if (aborted) return;
                            if (mode === "readwrite") {
                                if (abortWrite) {
                                    abortWrite = false;
                                    tx.error = new Error("fixture transaction aborted after request success");
                                    tx.abort();
                                    return;
                                }
                                for (const [name, rows] of copies) stores.get(name).rows = rows;
                            }
                            tx.oncomplete?.();
                        });
                        return tx;
                    },
                };
                if (!stores.size) request.onupgradeneeded();
                request.onsuccess();
            });
            return request;
        },
    };
    return {
        repository: () => createStudyRepository(() => indexedDB),
        abortWrite: () => { abortWrite = true; },
        rejectOpen: () => { openError = new Error("fixture open failed"); },
        close: () => connection.onclose(),
        changeVersion: () => connection.onversionchange(),
        opens: () => opened,
    };
}

const cacheKey = "study-fixture";
const studyPack = {
    cacheKey,
    trackUri: "spotify:track:fixture",
    trackId: "fixture",
    quiz: [{ id: "q", question: "First?", choices: ["A", "B"], answerIndex: 1 }],
};
const answer = { 0: { choiceIndex: 1, correct: true, answeredAt: 10 } };

test("wordbook waits for committed writes and keeps the previous value after deletion aborts", async () => {
    const fixture = databaseFixture();
    const repo = fixture.repository();
    const word = { id: "word-a", expression: "例", trackId: "fixture" };
    fixture.abortWrite();
    await assert.rejects(repo.dbPut("wordbook", word), /aborted after request success/);
    assert.deepEqual(await repo.dbGetAll("wordbook"), []);
    assert.equal(await repo.dbPut("wordbook", word), true);
    fixture.abortWrite();
    await assert.rejects(repo.dbDelete("wordbook", word.id), /aborted/);
    assert.deepEqual(await fixture.repository().dbGetAll("wordbook"), [word]);
    assert.equal(await repo.dbDelete("wordbook", word.id), true);
    assert.deepEqual(await fixture.repository().dbGetAll("wordbook"), []);
});

test("a failed or closed database connection is opened again without abandoning existing data", async () => {
    const fixture = databaseFixture();
    const repo = fixture.repository();
    fixture.rejectOpen();
    await assert.rejects(repo.dbGetAll("wordbook"), /open failed/);
    await repo.dbPut("wordbook", { id: "saved" });
    fixture.close();
    assert.deepEqual(await repo.dbGetAll("wordbook"), [{ id: "saved" }]);
    fixture.changeVersion();
    assert.deepEqual(await repo.dbGetAll("wordbook"), [{ id: "saved" }]);
    assert.equal(fixture.opens(), 4);
});

test("pack and progress replacement roll back together and reject answers from an old quiz", async () => {
    const fixture = databaseFixture();
    const repo = fixture.repository();
    const original = await repo.replaceStudySession(studyPack);
    await repo.saveProgress({ pack: original, answers: answer });
    fixture.abortWrite();
    await assert.rejects(repo.replaceStudySession({ ...studyPack, summary: "replacement" }), /aborted/);
    assert.deepEqual(await fixture.repository().readStudySession(cacheKey), { pack: original, answers: answer });

    const replacement = await repo.replaceStudySession({ ...studyPack, summary: "replacement" });
    assert.notEqual(replacement.quizRevision, original.quizRevision);
    assert.equal(await repo.saveProgress({ pack: original, answers: answer }), false);
    assert.deepEqual(await repo.readStudySession(cacheKey), { pack: replacement, answers: {} });

    fixture.abortWrite();
    await assert.rejects(repo.saveProgress({ pack: replacement, answers: answer }), /aborted/);
    assert.deepEqual((await repo.readStudySession(cacheKey)).answers, {});
    assert.equal(await repo.saveProgress({ pack: replacement, answers: answer }), true);
    assert.deepEqual((await fixture.repository().readStudySession(cacheKey)).answers, answer);
    const [progress] = await repo.dbGetAll("progress");
    assert.equal(progress.score, 1);
    assert.equal(progress.total, 1);
});

test("existing quiz records restore saved progress and legacy shuffled quizzes accept new answers", async () => {
    const repo = databaseFixture().repository();
    await repo.dbPut("studyPacks", studyPack);
    await repo.dbPut("progress", { cacheKey, trackId: studyPack.trackId, answers: answer });
    assert.deepEqual(await repo.readStudySession(cacheKey), { pack: studyPack, answers: answer });

    const second = { id: "q2", question: "Second?", choices: ["C", "D"], answerIndex: 0 };
    await repo.dbPut("studyPacks", { ...studyPack, quiz: [{ ...studyPack.quiz[0], answerIndex: 0 }, second] });
    const shuffled = await repo.readStudySession(cacheKey);
    assert.deepEqual(shuffled.answers, {});
    const choiceIndex = shuffled.pack.quiz[0].answerIndex;
    const revisedAnswers = { 0: { ...answer[0], choiceIndex } };
    assert.equal(await repo.saveProgress({ pack: shuffled.pack, answers: revisedAnswers }), true);
    assert.deepEqual(await repo.readStudySession(cacheKey), { pack: shuffled.pack, answers: revisedAnswers });
});

test("forced generation and quiz regeneration retain a saved session when generation or commit fails", async t => {
    const fixture = databaseFixture();
    const repo = fixture.repository();
    const original = await repo.replaceStudySession(studyPack);
    await repo.saveProgress({ pack: original, answers: answer });
    const args = {
        cacheKey, basePack: original, trackId: studyPack.trackId, trackUri: studyPack.trackUri,
        targetLang: "ko", normalizedLyrics: [{ index: 0, text: "One line" }],
    };
    let state = {};
    let failAI = true;
    const successes = [];
    t.mock.method(console, "warn", () => {});
    const gen = createStudyGeneration({
        getGenerationSnapshot: () => state,
        setGenerationState: update => { state = { ...state, ...update }; },
        notifyGeneration() {},
        repository: repo,
        requestStudy: async ({ category }) => {
            if (failAI) throw new Error("fixture provider unavailable");
            if (category === "quiz") {
                return { quiz: [{ question: "Replacement?", choices: ["A", "B", "C", "D"], answerIndex: 1 }] };
            }
            return { summary: "Replacement study pack" };
        },
        detectSourceLanguage: () => "en",
        showSuccess: key => successes.push(key),
        t: (key, fallback) => fallback,
    });
    await assert.rejects(gen.startGenerationJob({ ...args, force: true }), /provider unavailable/);
    assert.deepEqual(await repo.readStudySession(cacheKey), { pack: original, answers: answer });
    failAI = false;
    fixture.abortWrite();
    await assert.rejects(gen.startQuizGenerationJob(args), /aborted/);
    assert.deepEqual(await repo.readStudySession(cacheKey), { pack: original, answers: answer });
    assert.deepEqual(successes, []);
    const replacement = await gen.startQuizGenerationJob(args);
    assert.equal(replacement.quiz[0].question, "Replacement?");
    assert.deepEqual(await repo.readStudySession(cacheKey), { pack: replacement, answers: {} });
    assert.deepEqual(successes, ["quizRegenerated"]);
});
