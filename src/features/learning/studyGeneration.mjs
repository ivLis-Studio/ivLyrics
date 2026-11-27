import { normalizeStudyDifficulty } from "./studyIdentity.mjs";
import {
    QUIZ_CHUNK_CHARS, QUIZ_CHUNK_LINES, buildStudyCategoryRequests, buildStudyChunks, getLimitedLines,
} from "./studyLyrics.mjs";
import { mergeStudyResponses, normalizeStudyPack } from "./studyPack.mjs";

export function createStudyGeneration({
    getGenerationSnapshot,
    setGenerationState,
    notifyGeneration,
    repository,
    requestStudy,
    detectSourceLanguage,
    showSuccess,
    t,
}) {
    const { replaceStudySession } = repository;

    const STUDY_CHUNK_RETRY_MIN_LINES = 1;
    const STUDY_CONCURRENT_REQUESTS = 3;
    let activeJob = null;

    const isTimeoutLikeError = (error) => {
        const message = String(error?.message || error || "");
        return /timeout|timed out|time.?out|A timeout occurred/i.test(message);
    };

    const requestStudyChunkWithRetry = async (params, lines, chunkMeta, isCurrentJob, depth = 0) => {
        if (!isCurrentJob()) return null;
        try {
            return await requestStudy({
                ...params,
                category: params.category || "lines",
                lines,
                chunkIndex: chunkMeta.chunkIndex,
                chunkTotal: chunkMeta.chunkTotal,
                chunkDepth: depth
            });
        } catch (error) {
            if (params.signal.aborted) return null;
            if (!isTimeoutLikeError(error) || lines.length <= STUDY_CHUNK_RETRY_MIN_LINES) {
                throw error;
            }

            const mid = Math.ceil(lines.length / 2);
            const left = await requestStudyChunkWithRetry(params, lines.slice(0, mid), chunkMeta, isCurrentJob, depth + 1);
            const right = await requestStudyChunkWithRetry(params, lines.slice(mid), chunkMeta, isCurrentJob, depth + 1);
            return mergeStudyResponses([left, right]);
        }
    };

    const ownsRunningJob = (jobId) => {
        const current = getGenerationSnapshot();
        return current.jobId === jobId && current.status === "loading";
    };

    const beginJob = (jobId, initialState) => {
        const previous = activeJob;
        const controller = new AbortController();
        activeJob = { jobId, controller };
        setGenerationState({ jobId, ...initialState });
        previous?.controller.abort();
        return controller.signal;
    };

    const cancelGeneration = () => {
        if (!activeJob) return;
        const { jobId, controller } = activeJob;
        activeJob = null;
        if (ownsRunningJob(jobId)) {
            setGenerationState({
                status: "idle", pack: null, error: "", loadingText: "",
                progress: { done: 0, total: 0 }, promise: null,
            });
        }
        controller.abort();
    };

    const runChunks = async ({ chunks, params, isCurrentJob, onStart, onPart }) => {
        let nextIndex = 0;
        const runNext = async () => {
            while (nextIndex < chunks.length && isCurrentJob()) {
                const index = nextIndex++;
                onStart(index + 1, chunks.length);
                const part = await requestStudyChunkWithRetry(params, chunks[index], {
                    chunkIndex: index + 1, chunkTotal: chunks.length,
                }, isCurrentJob);
                if (isCurrentJob()) onPart(part, index);
            }
        };
        await Promise.all(Array.from({ length: Math.min(STUDY_CONCURRENT_REQUESTS, chunks.length) }, runNext));
    };

    const prepareStudyInputs = ({ lines, omittedCount }, {
        trackId, trackUri, title, artist, provider, targetLang, difficulty = "normal", lyricsHash, cacheKey,
    }) => ({
        requestParams: {
            trackId, title, artist, provider, targetLang,
            difficulty: normalizeStudyDifficulty(difficulty), sourceLang: detectSourceLanguage(lines),
        },
        buildStudyPack: raw => normalizeStudyPack({
            raw, sourceLines: lines, trackId, trackUri, title, artist, provider, targetLang, difficulty,
            lyricsHash, cacheKey, omittedCount,
        }),
    });

    const startGenerationJob = (options) => {
        const { normalizedLyrics, trackId, cacheKey, force = false } = options;
        const activeGeneration = getGenerationSnapshot();
        if (!force && activeGeneration.status === "loading" && activeGeneration.cacheKey === cacheKey && activeGeneration.promise) {
            notifyGeneration();
            return activeGeneration.promise;
        }

        const jobId = (Number(activeGeneration.jobId) || 0) + 1;
        const limited = getLimitedLines(normalizedLyrics);
        const { requestParams, buildStudyPack } = prepareStudyInputs(limited, options);
        const signal = beginJob(jobId, {
            cacheKey,
            trackId,
            status: "loading",
            pack: null,
            error: "",
            loadingText: "",
            progress: { done: 0, total: 0 },
            promise: null
        });

        const promise = (async () => {
            try {
                const isCurrentJob = () => !signal.aborted && ownsRunningJob(jobId);
                if (!isCurrentJob()) return null;
                const rawParts = [];
                const categoryRequests = buildStudyCategoryRequests(limited.lines).map(request => ({
                    ...request, chunks: request.chunks.filter(chunk => chunk.length > 0),
                }));
                const requestTotal = categoryRequests.reduce((sum, { chunks }) => sum + chunks.length, 0);
                let completedRequests = 0;

                const publishPartialPack = () => {
                    if (!isCurrentJob()) return;
                    const partialRaw = mergeStudyResponses(rawParts);
                    const partialPack = buildStudyPack(partialRaw);
                    setGenerationState({
                        status: "loading",
                        pack: partialPack,
                        error: "",
                        progress: { done: completedRequests, total: requestTotal }
                    });
                };

                setGenerationState({ progress: { done: 0, total: requestTotal } });

                let offset = 0;
                for (const categoryRequest of categoryRequests) {
                    const { chunks } = categoryRequest;
                    await runChunks({
                        chunks, isCurrentJob, params: { ...requestParams, category: categoryRequest.category, signal },
                        onStart(current, total) {
                            setGenerationState({
                                loadingText: t(categoryRequest.loadingKey, categoryRequest.loadingFallback)
                                    .replace("{current}", String(current))
                                    .replace("{total}", String(total))
                            });
                        },
                        onPart(part, index) {
                            rawParts[offset + index] = part;
                            completedRequests += 1;
                            publishPartialPack();
                        },
                    });
                    if (!isCurrentJob()) return null;
                    offset += chunks.length;
                }

                if (!isCurrentJob()) return null;

                const raw = mergeStudyResponses(rawParts);
                const nextPack = await replaceStudySession(buildStudyPack(raw));

                if (!isCurrentJob()) return nextPack;

                activeJob = null;
                setGenerationState({
                    status: "ready",
                    pack: nextPack,
                    error: "",
                    loadingText: "",
                    progress: { done: requestTotal, total: requestTotal },
                    promise: null
                });
                showSuccess("generated", "학습 모드를 생성했습니다.");
                return nextPack;
            } catch (studyError) {
                if (signal.aborted) return null;
                if (getGenerationSnapshot().jobId === jobId) {
                    console.warn("[LearningMode] generation failed:", studyError);
                    setGenerationState({
                        status: "error",
                        error: studyError?.message || t("generateFailed", "학습 모드 생성에 실패했습니다."),
                        loadingText: "",
                        progress: { done: 0, total: 0 },
                        promise: null
                    });
                }
                throw studyError;
            }
        })();

        if (!signal.aborted && ownsRunningJob(jobId)) setGenerationState({ promise });

        return promise;
    };

    const startQuizGenerationJob = (options) => {
        const { normalizedLyrics, basePack, trackId, trackUri, difficulty = "normal", cacheKey } = options;
        if (!basePack) return Promise.resolve(null);

        const activeGeneration = getGenerationSnapshot();
        if (activeGeneration.status === "loading" && activeGeneration.cacheKey === cacheKey && activeGeneration.promise) {
            notifyGeneration();
            return activeGeneration.promise;
        }

        const jobId = (Number(activeGeneration.jobId) || 0) + 1;
        const limited = getLimitedLines(normalizedLyrics);
        const { requestParams, buildStudyPack } = prepareStudyInputs(limited, options);
        const chunks = buildStudyChunks(limited.lines, QUIZ_CHUNK_LINES, QUIZ_CHUNK_CHARS)
            .filter((chunk) => chunk.length > 0);
        const requestTotal = Math.max(1, chunks.length);
        let completedRequests = 0;
        const signal = beginJob(jobId, {
            cacheKey,
            trackId,
            status: "loading",
            pack: basePack,
            error: "",
            loadingText: t("loadingQuizOnly", "퀴즈만 다시 만드는 중... ({current}/{total})")
                .replace("{current}", "0")
                .replace("{total}", String(requestTotal)),
            progress: { done: 0, total: requestTotal },
            promise: null
        });

        const promise = (async () => {
            try {
                const isCurrentJob = () => !signal.aborted && ownsRunningJob(jobId);
                if (!isCurrentJob()) return null;
                const rawParts = [];

                const buildPackWithQuiz = (quizParts) => {
                    const raw = mergeStudyResponses(quizParts);
                    const quizPack = buildStudyPack(raw);
                    return {
                        ...basePack,
                        trackUri: basePack.trackUri || trackUri,
                        quizDifficulty: normalizeStudyDifficulty(difficulty),
                        quiz: quizPack.quiz,
                        updatedAt: Date.now()
                    };
                };

                const publishPartialPack = () => {
                    if (!isCurrentJob() || rawParts.length === 0) return;
                    const partialPack = buildPackWithQuiz(rawParts);
                    setGenerationState({
                        status: "loading",
                        pack: partialPack,
                        error: "",
                        progress: { done: completedRequests, total: requestTotal }
                    });
                };

                if (chunks.length === 0) {
                    throw new Error(t("noLyrics", "학습할 가사가 없습니다."));
                }
                await runChunks({
                    chunks, isCurrentJob, params: { ...requestParams, category: "quiz", signal },
                    onStart(current, total) {
                        setGenerationState({
                            loadingText: t("loadingQuizOnly", "퀴즈만 다시 만드는 중... ({current}/{total})")
                                .replace("{current}", String(current))
                                .replace("{total}", String(total))
                        });
                    },
                    onPart(part, index) {
                        rawParts[index] = part;
                        completedRequests += 1;
                        publishPartialPack();
                    },
                });
                if (!isCurrentJob()) return null;

                const candidate = buildPackWithQuiz(rawParts);
                if (!candidate.quiz.length) {
                    throw new Error(t("quizRegenerateFailed", "퀴즈를 다시 만들지 못했습니다."));
                }

                const nextPack = await replaceStudySession(candidate);

                if (!isCurrentJob()) return nextPack;

                activeJob = null;
                setGenerationState({
                    status: "ready",
                    pack: nextPack,
                    error: "",
                    loadingText: "",
                    progress: { done: requestTotal, total: requestTotal },
                    promise: null
                });
                showSuccess("quizRegenerated", "새 퀴즈를 만들었습니다.");
                return nextPack;
            } catch (quizError) {
                if (signal.aborted) return null;
                if (getGenerationSnapshot().jobId === jobId) {
                    console.warn("[LearningMode] quiz generation failed:", quizError);
                    setGenerationState({
                        status: "error",
                        pack: basePack,
                        error: quizError?.message || t("quizRegenerateFailed", "퀴즈를 다시 만들지 못했습니다."),
                        loadingText: "",
                        progress: { done: 0, total: 0 },
                        promise: null
                    });
                }
                throw quizError;
            }
        })();

        if (!signal.aborted && ownsRunningJob(jobId)) setGenerationState({ promise });
        return promise;
    };

    return { startGenerationJob, startQuizGenerationJob, cancelGeneration };
}
