import {
    STUDY_DIFFICULTIES, buildCacheKey, buildWordId, getTrackId, hashValue, normalizeStudyDifficulty,
} from "./studyIdentity.mjs";
import { normalizeLyrics } from "./studyLyrics.mjs";
import {
    normalizeGrammarList, normalizePronunciation, normalizeStudyHistory,
} from "./studyPack.mjs";
import { renderExplainTab, renderHistoryTab, renderWordsTab } from "./renderStudyReferenceTabs.mjs";
import { renderQuizTab } from "./renderStudyQuiz.mjs";
import { createStudySessionHook } from "./studySession.mjs";

export function createStudyPanel({
    react, host, navigation, repository, generation, playback, settings, components, t, readAIManager, readToast, readPlayer,
}) {
    const { useCallback, useEffect, useMemo, useState } = react;
    const { useLearningOpenState, dismissForUnmount, close } = navigation;
    const { dbPut, dbGetAll, dbDelete } = repository;
    const { getEnabledStudyProviderCount, startGenerationJob, startQuizGenerationJob } = generation;
    const { getCurrentPlayerUri, clearLyricPlaybackTimer, playLyricAt, detectSpeechLang, speakText, playQuizSound } = playback;
    const { THEME_STORAGE_KEY, DIFFICULTY_STORAGE_KEY, getInitialStudyTheme, getInitialStudyDifficulty,
        getTargetLanguage, getQuizTypeLabel, getStudyDifficultyLabel, setStoredValue } = settings;
    const { TabButton, EmptyState } = components;
    const useStudySession = createStudySessionHook({ react, repository, generation, t });

    return react.memo(({
        trackUri = "",
        title = "",
        artist = "",
        provider = "",
        lyrics = [],
        activeLineIndex = 0
    }) => {
        const isOpen = useLearningOpenState();
        const [activeTab, setActiveTab] = useState("explain");
        const [wordbook, setWordbook] = useState([]);
        const [wordQuery, setWordQuery] = useState("");
        const [wordScope, setWordScope] = useState("all");
        const [savedWordFeedback, setSavedWordFeedback] = useState({});
        const [eventLineIndex, setEventLineIndex] = useState(activeLineIndex || 0);
        const [studyTheme, setStudyTheme] = useState(getInitialStudyTheme);
        const [studyDifficulty, setStudyDifficulty] = useState(getInitialStudyDifficulty);
        const [quizDifficulty, setQuizDifficulty] = useState(getInitialStudyDifficulty);
        const [studyHistory, setStudyHistory] = useState([]);
        const [libraryError, setLibraryError] = useState("");

        const normalizedLyrics = useMemo(() => normalizeLyrics(lyrics), [lyrics]);
        const lyricsHash = useMemo(
            () => hashValue(normalizedLyrics.map((line) => `${line.index}:${line.text}`).join("\n")),
            [normalizedLyrics]
        );
        const targetLang = useMemo(() => getTargetLanguage(), [isOpen, trackUri]);
        const trackId = useMemo(() => getTrackId(trackUri), [trackUri]);
        const cacheKey = useMemo(
            () => buildCacheKey({ trackUri, lyricsHash, targetLang, difficulty: studyDifficulty }),
            [trackUri, lyricsHash, targetLang, studyDifficulty]
        );
        const addCommittedPack = useCallback((pack) => {
            setStudyHistory(previous => normalizeStudyHistory([pack, ...previous]));
        }, []);
        const {
            pack, status, error: sessionError, loadingText, generationProgress,
            answers, quizStep, setQuizStep, persistQuizAnswers,
        } = useStudySession({ isOpen, cacheKey, onCommitted: addCommittedPack });
        const error = sessionError || libraryError;
        const displayedLineIndex = Number.isFinite(eventLineIndex) ? eventLineIndex : activeLineIndex || 0;
        const hasLyrics = normalizedLyrics.length > 0;

        const toggleStudyTheme = useCallback(() => {
            setStudyTheme((current) => {
                const next = current === "dark" ? "light" : "dark";
                try {
                    setStoredValue(THEME_STORAGE_KEY, next);
                } catch (error) { }
                return next;
            });
        }, []);

        const selectStudyDifficulty = useCallback((difficulty) => {
            const next = normalizeStudyDifficulty(difficulty);
            setStudyDifficulty(next);
            try {
                setStoredValue(DIFFICULTY_STORAGE_KEY, next);
            } catch (error) { }
        }, []);

        useEffect(() => dismissForUnmount, []);

        useEffect(() => {
            if (isOpen) setEventLineIndex(activeLineIndex || 0);
        }, [isOpen, activeLineIndex, trackUri]);

        useEffect(() => {
            if (!isOpen) return;
            const handler = (event) => {
                if (typeof event.detail?.index === "number") {
                    setEventLineIndex(event.detail.index);
                }
            };
            host.addEventListener("ivLyrics:lyric-index-changed", handler);
            return () => host.removeEventListener("ivLyrics:lyric-index-changed", handler);
        }, [isOpen]);

        useEffect(() => {
            if (!isOpen) return;
            setWordQuery("");
            setSavedWordFeedback({});
        }, [isOpen, cacheKey]);

        useEffect(() => {
            if (!isOpen) return;
            let cancelled = false;
            setLibraryError("");
            const reportError = (error) => {
                if (cancelled) return;
                console.warn("[LearningMode] failed to load library:", error);
                setLibraryError(t("loadFailed", "학습 데이터를 불러오지 못했습니다."));
            };
            void dbGetAll("wordbook").then(words => {
                if (cancelled) return;
                setWordbook(words
                    .map((word) => ({
                        ...word,
                        pronunciation: normalizePronunciation(word.pronunciation || word.phonetic || word.romanization || word.romaji),
                    }))
                    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)));
            }, reportError);
            void dbGetAll("studyPacks").then(packs => {
                if (!cancelled) setStudyHistory(previous => normalizeStudyHistory([...previous, ...packs]));
            }, reportError);
            return () => { cancelled = true; };
        }, [isOpen]);

        const currentLineStudy = useMemo(() => {
            if (!pack?.lines?.length) return null;
            return pack.lines.find((line) => line.index === displayedLineIndex) || null;
        }, [pack, displayedLineIndex]);

        useEffect(() => {
            if (!pack?.cacheKey) return;
            setQuizDifficulty(normalizeStudyDifficulty(pack.quizDifficulty || pack.difficulty || studyDifficulty));
        }, [pack?.cacheKey]);

        const filteredWordbook = useMemo(() => {
            const query = wordQuery.trim().toLowerCase();
            const scoped = wordbook.filter((word) => {
                if (wordScope === "current") return word.trackId === trackId;
                if (wordScope === "synced") return Number.isFinite(Number(word.startTime));
                return true;
            });
            if (!query) return scoped;
            return scoped.filter((word) => [
                word.expression,
                word.meaning,
                word.reading,
                word.pronunciation,
                word.sourceText,
                word.title,
                word.artist,
                word.note
            ].some((value) => String(value || "").toLowerCase().includes(query)));
        }, [trackId, wordScope, wordbook, wordQuery]);

        const wordbookStats = useMemo(() => ({
            total: wordbook.length,
            current: wordbook.filter((word) => word.trackId === trackId).length,
            withReading: wordbook.filter((word) => word.reading || word.pronunciation).length,
            withSource: wordbook.filter((word) => word.sourceText).length,
            withSync: wordbook.filter((word) => Number.isFinite(Number(word.startTime))).length
        }), [trackId, wordbook]);
        const grammarItems = useMemo(() => {
            if (!pack?.lines?.length) return [];
            const seen = new Set();
            const items = [];
            for (const line of pack.lines) {
                for (const grammar of normalizeGrammarList(line.grammar)) {
                    const key = `${grammar.pattern}|${grammar.explanation}`.toLowerCase();
                    if (!grammar.pattern || seen.has(key)) continue;
                    seen.add(key);
                    items.push({
                        ...grammar,
                        sourceText: line.sourceText || "",
                        translation: line.translation || "",
                        lineExplanation: line.explanation || "",
                        startTime: line.startTime,
                        endTime: line.endTime,
                        lineIndex: line.index
                    });
                    if (items.length >= 8) return items;
                }
            }
            return items;
        }, [pack]);

        const savedWordIds = useMemo(() => new Set(wordbook.map((word) => word.id)), [wordbook]);
        const getWordIdForEntry = useCallback((entry) => {
            const expression = String(entry?.expression || entry?.term || "").trim();
            const meaning = String(entry?.meaning || "").trim();
            return expression ? buildWordId({ targetLang, trackId, expression, meaning }) : "";
        }, [targetLang, trackId]);

        const addWord = useCallback(async (entry) => {
            const expression = String(entry.expression || entry.term || "").trim();
            if (!expression || !trackId) return;

            const meaning = String(entry.meaning || "").trim();
            const item = {
                id: buildWordId({ targetLang, trackId, expression, meaning }),
                expression,
                meaning,
                note: String(entry.note || "").trim(),
                sourceText: String(entry.sourceText || "").trim(),
                grammar: normalizeGrammarList(entry.grammar),
                sourceLang: detectSpeechLang([
                    expression,
                    entry.reading,
                    entry.hiragana,
                    entry.furigana,
                    entry.kana,
                    entry.sourceText
                ].filter(Boolean).join(" ")),
                pronunciation: normalizePronunciation(entry.pronunciation || entry.phonetic || entry.romanization || entry.romaji),
                reading: String(entry.reading || entry.hiragana || entry.furigana || entry.kana || "").trim(),
                trackId,
                trackUri,
                title,
                artist,
                lineIndex: Number.isFinite(entry.lineIndex) ? entry.lineIndex : null,
                startTime: Number.isFinite(Number(entry.startTime)) ? Number(entry.startTime) : null,
                endTime: Number.isFinite(Number(entry.endTime)) ? Number(entry.endTime) : null,
                targetLang,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            try {
                await dbPut("wordbook", item);
                setWordbook((prev) => {
                    const rest = prev.filter((word) => word.id !== item.id);
                    return [item, ...rest];
                });
                setSavedWordFeedback((prev) => ({ ...prev, [item.id]: "saved" }));
                setTimeout(() => {
                    setSavedWordFeedback((prev) => {
                        if (!prev[item.id]) return prev;
                        const next = { ...prev };
                        delete next[item.id];
                        return next;
                    });
                }, 1600);
                readToast()?.success?.(t("wordSaved", "단어장에 저장했습니다."));
            } catch (wordError) {
                console.warn("[LearningMode] failed to save word:", wordError);
                readToast()?.error?.(t("wordSaveFailed", "단어를 저장하지 못했습니다."));
            }
        }, [artist, targetLang, title, trackId, trackUri]);

        const removeWord = useCallback(async (id) => {
            try {
                await dbDelete("wordbook", id);
                setWordbook((prev) => prev.filter((word) => word.id !== id));
                return true;
            } catch (wordError) {
                console.warn("[LearningMode] failed to remove word:", wordError);
                return false;
            }
        }, []);

        const toggleWord = useCallback(async (entry) => {
            const id = getWordIdForEntry(entry);
            if (!id) return;
            if (savedWordIds.has(id)) {
                if (!await removeWord(id)) return;
                setSavedWordFeedback((prev) => ({ ...prev, [id]: "removed" }));
                setTimeout(() => {
                    setSavedWordFeedback((prev) => {
                        if (!prev[id]) return prev;
                        const next = { ...prev };
                        delete next[id];
                        return next;
                    });
                }, 1000);
                return;
            }
            await addWord(entry);
        }, [addWord, getWordIdForEntry, removeWord, savedWordIds]);

        const generateStudy = useCallback(async ({ force = false } = {}) => {
            if (!hasLyrics || !cacheKey || !trackId) {
                readToast()?.error?.(t("noLyrics", "학습할 가사가 없습니다."));
                return;
            }

            if (typeof readAIManager()?.generateLyricsStudy !== "function" || getEnabledStudyProviderCount() === 0) {
                readToast()?.error?.(t("noProvider", "설정에서 학습을 지원하는 AI 제공자를 활성화해주세요."));
                return;
            }

            setWordQuery("");

            startGenerationJob({
                normalizedLyrics,
                trackId,
                trackUri,
                title,
                artist,
                provider,
                targetLang,
                difficulty: studyDifficulty,
                lyricsHash,
                cacheKey,
                force
            }).catch(() => {});
        }, [artist, cacheKey, hasLyrics, lyricsHash, normalizedLyrics, provider, studyDifficulty, targetLang, title, trackId, trackUri]);

        const regenerateQuiz = useCallback(() => {
            if (!pack || !hasLyrics || !cacheKey || !trackId) {
                readToast()?.error?.(t("noQuiz", "생성된 퀴즈가 없습니다."));
                return;
            }

            if (typeof readAIManager()?.generateLyricsStudy !== "function" || getEnabledStudyProviderCount() === 0) {
                readToast()?.error?.(t("noProvider", "설정에서 학습을 지원하는 AI 제공자를 활성화해주세요."));
                return;
            }

            setActiveTab("quiz");
            startQuizGenerationJob({
                normalizedLyrics,
                basePack: pack,
                trackId,
                trackUri,
                title,
                artist,
                provider,
                targetLang,
                difficulty: quizDifficulty,
                lyricsHash,
                cacheKey
            }).catch(() => {});
        }, [artist, cacheKey, hasLyrics, lyricsHash, normalizedLyrics, pack, provider, quizDifficulty, targetLang, title, trackId, trackUri]);

        const openHistoryItem = useCallback((item) => {
            if (!item) return;
            selectStudyDifficulty(item.difficulty || "normal");
            setActiveTab("explain");

            const uri = item.trackUri || (item.trackId ? `spotify:track:${item.trackId}` : "");
            if (!uri) {
                readToast()?.error?.(t("historyMissingTrack", "이 곡으로 이동할 수 없습니다."));
                return;
            }

            if (uri === getCurrentPlayerUri()) return;

            clearLyricPlaybackTimer();
            try {
                readPlayer()?.playUri?.(uri);
            } catch (historyError) {
                console.warn("[LearningMode] failed to open history track:", historyError);
                readToast()?.error?.(t("historyPlayFailed", "곡으로 이동하지 못했습니다."));
            }
        }, [selectStudyDifficulty]);

        const answerQuiz = useCallback((quizIndex, choiceIndex) => {
            if (status === "loading" || !pack?.quiz?.[quizIndex]) return;
            if (answers?.[quizIndex]) return;

            const item = pack.quiz[quizIndex];
            const correct = choiceIndex === item.answerIndex;
            const nextAnswers = {
                ...answers,
                [quizIndex]: {
                    choiceIndex,
                    correct,
                    answeredAt: Date.now()
                }
            };

            persistQuizAnswers(nextAnswers, () => playQuizSound(correct));
        }, [answers, pack, persistQuizAnswers, status]);

        if (!isOpen) {
            return null;
        }

        const answeredValues = Object.values(answers || {});
        const correctCount = answeredValues.filter((answer) => answer?.correct).length;
        const totalQuiz = pack?.quiz?.length || 0;
        const allQuizAnswered = totalQuiz > 0 && pack.quiz.every((_, index) => answers[index]);
        const quizFinished = allQuizAnswered && quizStep >= totalQuiz;
        const currentQuizIndex = totalQuiz > 0 ? Math.min(quizStep, totalQuiz - 1) : 0;
        const currentQuiz = totalQuiz > 0 ? pack.quiz[currentQuizIndex] : null;
        const currentQuizAnswer = !quizFinished && currentQuiz ? answers[currentQuizIndex] : null;
        const wrongQuizCount = answeredValues.filter((answer) => answer && !answer.correct).length;
        const quizProgressPercent = totalQuiz > 0 ? (quizFinished ? 100 : ((currentQuizIndex + 1) / totalQuiz) * 100) : 0;
        const wrongQuizItems = pack?.quiz?.filter((item, index) => answers[index] && !answers[index].correct).slice(-3) || [];
        const wrongQuizReviewItems = pack?.quiz?.map((item, index) => ({
            item,
            index,
            answer: answers[index]
        })).filter((entry) => entry.answer && !entry.answer.correct) || [];
        const quizResultPercent = totalQuiz > 0 ? Math.round((correctCount / totalQuiz) * 100) : 0;
        const quizResultMessage = correctCount === totalQuiz
            ? t("quizResultPerfect", "완벽합니다. 틀린 문제가 없습니다.")
            : quizResultPercent >= 70
                ? t("quizResultGood", "좋습니다. 틀린 문제만 한 번 더 보면 됩니다.")
                : t("quizResultNeedsReview", "오답노트부터 다시 보고 한 번 더 풀어보세요.");
        const goNextQuiz = () => {
            if (currentQuizIndex < totalQuiz - 1) {
                setQuizStep(currentQuizIndex + 1);
            }
        };
        const finishOrNextQuiz = () => {
            if (currentQuizIndex < totalQuiz - 1) {
                setQuizStep(currentQuizIndex + 1);
                return;
            }
            const firstUnansweredIndex = pack?.quiz?.findIndex((_, index) => !answers[index]) ?? -1;
            if (firstUnansweredIndex >= 0) {
                setQuizStep(firstUnansweredIndex);
                return;
            }
            setQuizStep(totalQuiz);
        };
        const resetQuiz = () => {
            if (status === "loading") return;
            persistQuizAnswers({}, () => setQuizStep(0));
        };
        const retryWrongQuiz = () => {
            if (status === "loading") return;
            const wrongIndexes = wrongQuizReviewItems.map((entry) => entry.index);
            if (!wrongIndexes.length) {
                resetQuiz();
                return;
            }
            const nextAnswers = { ...answers };
            for (const index of wrongIndexes) {
                delete nextAnswers[index];
            }
            persistQuizAnswers(nextAnswers, () => setQuizStep(wrongIndexes[0]));
        };
        const handleQuizKeyDown = (event) => {
            if (activeTab !== "quiz" || !currentQuiz || quizFinished) return;
            const key = String(event.key || "").toLowerCase();
            const letterIndex = ["a", "b", "c", "d"].indexOf(key);
            const numberIndex = ["1", "2", "3", "4"].indexOf(key);
            const choiceIndex = letterIndex >= 0 ? letterIndex : numberIndex;

            if (choiceIndex >= 0 && choiceIndex < currentQuiz.choices.length && !currentQuizAnswer) {
                event.preventDefault();
                answerQuiz(currentQuizIndex, choiceIndex);
                return;
            }

            if ((key === "enter" || key === "arrowright") && currentQuizAnswer) {
                event.preventDefault();
                finishOrNextQuiz();
            }
        };
        const generationPercent = generationProgress.total > 0
            ? Math.round((generationProgress.done / generationProgress.total) * 100)
            : 0;
        const progressPercent = status === "loading"
            ? generationPercent
            : totalQuiz > 0
                ? Math.round((answeredValues.length / totalQuiz) * 100)
                : (pack ? 100 : 0);
        const difficultyOptions = STUDY_DIFFICULTIES.map((id) => ({
            id,
            label: getStudyDifficultyLabel(id)
        }));
        const historyCount = studyHistory.length;

        const renderStudyHeader = () => react.createElement("div", { className: "ivlyrics-study-header" },
                react.createElement("div", { className: "ivlyrics-study-title-wrap" },
                    react.createElement("div", { className: "ivlyrics-study-eyebrow" }, t("eyebrow", "AI Learning")),
                    react.createElement("h2", { className: "ivlyrics-study-title" }, t("title", "AI 학습 모드")),
                    react.createElement("p", { className: "ivlyrics-study-track" }, [title, artist].filter(Boolean).join(" - "))
                ),
                react.createElement("div", { className: "ivlyrics-study-header-actions" },
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-theme-toggle",
                        onClick: toggleStudyTheme,
                        "aria-label": studyTheme === "dark"
                            ? t("lightMode", "라이트 모드")
                            : t("darkMode", "다크 모드"),
                        title: studyTheme === "dark"
                            ? t("lightMode", "라이트 모드")
                            : t("darkMode", "다크 모드")
                    }, studyTheme === "dark" ? "☀" : "☾"),
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-close",
                        onClick: close,
                        "aria-label": t("close", "닫기")
                    }, "x")
                )
            );

        const renderStudyRail = () => react.createElement("nav", { className: "ivlyrics-study-rail", "aria-label": t("title", "AI 학습 모드") },
                    react.createElement("div", { className: "ivlyrics-study-tabs", role: "tablist" },
                        react.createElement(TabButton, { id: "explain", activeTab, onSelect: setActiveTab }, t("tabExplain", "오늘의 해설")),
                        react.createElement(TabButton, { id: "quiz", activeTab, onSelect: setActiveTab }, t("tabQuiz", "퀴즈")),
                        react.createElement(TabButton, { id: "words", activeTab, onSelect: setActiveTab }, t("tabWords", "단어장")),
                        react.createElement(TabButton, { id: "history", activeTab, onSelect: setActiveTab }, t("tabHistory", "학습 기록"))
                    ),
                    react.createElement("div", { className: "ivlyrics-study-rail-card" },
                        react.createElement("span", null, t("lessonProgress", "진행")),
                        react.createElement("strong", null, `${progressPercent}%`),
                        react.createElement("div", { className: "ivlyrics-study-rail-progress" },
                            react.createElement("div", {
                                style: { width: `${Math.max(0, Math.min(100, progressPercent))}%` }
                            })
                        ),
                        react.createElement("p", null,
                            status === "loading"
                                ? (loadingText || t("loading", "가사를 분석하는 중..."))
                                : totalQuiz > 0
                                ? t("score", "{score}/{total} 정답").replace("{score}", correctCount).replace("{total}", totalQuiz)
                                : t("readyState", "학습 준비 완료")
                        ),
                        pack && react.createElement("div", { className: "ivlyrics-study-rail-stats" },
                            react.createElement("div", null,
                                react.createElement("span", null, t("summary", "곡 요약")),
                                react.createElement("strong", null, pack.summary ? "1" : "0")
                            ),
                            react.createElement("div", null,
                                react.createElement("span", null, t("tabQuiz", "퀴즈")),
                                react.createElement("strong", null, totalQuiz)
                            ),
                            react.createElement("div", null,
                                react.createElement("span", null, t("tabWords", "단어장")),
                                react.createElement("strong", null, wordbook.length)
                            )
                        ),
                        react.createElement("div", { className: "ivlyrics-study-difficulty" },
                            react.createElement("div", { className: "ivlyrics-study-difficulty-head" },
                                react.createElement("span", null, t("difficulty", "난이도")),
                                react.createElement("small", null, t("difficultyHint", "생성 전에 원하는 설명 깊이를 고르세요."))
                            ),
                            react.createElement("div", { className: "ivlyrics-study-difficulty-options" },
                                difficultyOptions.map((item) => react.createElement("button", {
                                    key: item.id,
                                    type: "button",
                                    className: studyDifficulty === item.id ? "active" : "",
                                    onClick: () => selectStudyDifficulty(item.id),
                                    disabled: status === "loading"
                                }, item.label))
                            )
                        ),
                        react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-secondary",
                            onClick: () => generateStudy({ force: Boolean(pack) }),
                            disabled: status === "loading" || !hasLyrics
                        }, pack ? t("regenerate", "다시 생성") : t("generate", "생성")),
                        pack && react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-secondary subtle",
                            onClick: regenerateQuiz,
                            disabled: status === "loading" || !hasLyrics
                        }, t("quizRegenerate", "새 문제 만들기"))
                    )
                );

        const isLessonTab = activeTab === "explain" || activeTab === "quiz";
        const renderStudyStage = () => react.createElement("main", { className: "ivlyrics-study-stage" },
                    isLessonTab && !hasLyrics && react.createElement(EmptyState, null, t("noLyrics", "학습할 가사가 없습니다.")),
                    isLessonTab && hasLyrics && !pack && status !== "loading" && react.createElement(EmptyState, null,
                        react.createElement("p", null, t("empty", "현재 곡의 학습 데이터가 없습니다.")),
                        react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-primary",
                            onClick: () => generateStudy()
                        }, t("generate", "생성"))
                    ),
                    isLessonTab && status === "loading" && !pack && react.createElement(EmptyState, null,
                        react.createElement("div", { className: "ivlyrics-study-spinner" }),
                        react.createElement("p", null, loadingText || t("loading", "가사를 분석하는 중..."))
                    ),
                    error && react.createElement("div", { className: "ivlyrics-study-error" }, error),
                    status === "loading" && pack && react.createElement("div", { className: "ivlyrics-study-loading-banner" },
                        react.createElement("div", { className: "ivlyrics-study-spinner" }),
                        react.createElement("p", null, loadingText || t("loading", "가사를 분석하는 중..."))
                    ),
                    activeTab === "history" && renderHistoryTab(react, t, components, {
                        historyCount, studyHistory, cacheKey, openHistoryItem, getStudyDifficultyLabel,
                    }),
                    pack && activeTab === "explain" && renderExplainTab(react, t, components, {
                        currentLineStudy, playLyricAt, trackUri, getWordIdForEntry, savedWordIds,
                        savedWordFeedback, toggleWord, pack, status, grammarItems,
                    }),
                    pack && activeTab === "quiz" && renderQuizTab(react, t, components, {
                        currentQuiz, currentQuizIndex, currentQuizAnswer, playLyricAt, trackUri,
                        answerQuiz, wrongQuizItems, setQuizStep, pack, goNextQuiz,
                        totalQuiz, finishOrNextQuiz, quizResultPercent, quizResultMessage, correctCount,
                        wrongQuizReviewItems, setActiveTab, retryWrongQuiz, regenerateQuiz, status,
                        resetQuiz, difficultyOptions, quizDifficulty, setQuizDifficulty, hasLyrics,
                        quizFinished, getQuizTypeLabel, wrongQuizCount, quizProgressPercent,
                    }),
                    activeTab === "words" && renderWordsTab(react, t, components, {
                        wordbook, wordQuery, setWordQuery, wordbookStats, wordScope,
                        setWordScope, filteredWordbook, removeWord, speakText, detectSpeechLang,
                        targetLang, playLyricAt,
                    })
                );

        return react.createElement("aside", {
            className: `ivlyrics-study-panel theme-${studyTheme}`,
            role: "dialog",
            "aria-label": t("title", "AI 학습 모드"),
            onKeyDown: (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                    return;
                }
                handleQuizKeyDown(event);
            },
            tabIndex: -1
        },
            renderStudyHeader(),
            react.createElement("div", { className: "ivlyrics-study-body" },
                renderStudyRail(),
                renderStudyStage()
            )
        );
    });
}
