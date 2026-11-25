import { normalizeQuizType, shouldShowQuizSource } from "./studyPack.mjs";

export function renderQuizTab(react, t, { BlankQuestion, LyricPlayButton, ReadingHints, EmptyState }, {
    currentQuiz, currentQuizIndex, currentQuizAnswer, playLyricAt, trackUri,
    answerQuiz, wrongQuizItems, setQuizStep, pack, goNextQuiz,
    totalQuiz, finishOrNextQuiz, quizResultPercent, quizResultMessage, correctCount,
    wrongQuizReviewItems, setActiveTab, retryWrongQuiz, regenerateQuiz, status,
    resetQuiz, difficultyOptions, quizDifficulty, setQuizDifficulty, hasLyrics,
    quizFinished, getQuizTypeLabel, wrongQuizCount, quizProgressPercent,
}) {
    const renderCurrentQuizSection = () => react.createElement("section", {
                key: currentQuiz.id || currentQuizIndex,
                className: [
                    "ivlyrics-study-card",
                    "ivlyrics-study-quiz",
                    `quiz-type-${normalizeQuizType(currentQuiz.type)}`,
                    currentQuizAnswer?.correct ? "is-correct" : "",
                    currentQuizAnswer && !currentQuizAnswer.correct ? "is-wrong" : ""
                ].filter(Boolean).join(" ")
            },
                react.createElement("div", { className: "ivlyrics-study-quiz-prompt" },
                    normalizeQuizType(currentQuiz.type) === "blank"
                        ? react.createElement(BlankQuestion, { text: currentQuiz.question })
                        : react.createElement("p", null, currentQuiz.question),
                    shouldShowQuizSource(currentQuiz) && react.createElement("div", { className: "ivlyrics-study-source-card compact" },
                        react.createElement("div", { className: "ivlyrics-study-source-head" },
                            react.createElement("span", null, t("sourceLine", "가사 원문")),
                            Number.isFinite(Number(currentQuiz.startTime)) && react.createElement(LyricPlayButton, {
                                onClick: () => playLyricAt({
                                    trackUri,
                                    startTime: currentQuiz.startTime,
                                    endTime: currentQuiz.endTime,
                                    sourceText: currentQuiz.sourceText
                                })
                            })
                        ),
                        react.createElement("blockquote", null, currentQuiz.sourceText),
                        react.createElement(ReadingHints, {
                            reading: currentQuiz.reading,
                            pronunciation: currentQuiz.pronunciation
                        })
                    )
                ),
                react.createElement("div", { className: "ivlyrics-study-choice-grid" },
                    currentQuiz.choices.map((choice, choiceIndex) => {
                        const isAnswered = !!currentQuizAnswer;
                        const isCorrect = currentQuiz.answerIndex === choiceIndex;
                        const selected = currentQuizAnswer?.choiceIndex === choiceIndex;
                        const letter = String.fromCharCode(65 + choiceIndex);
                        return react.createElement("button", {
                            key: `${currentQuizIndex}-${choiceIndex}`,
                            type: "button",
                            disabled: status === "loading" || isAnswered,
                            className: [
                                "ivlyrics-study-choice",
                                selected ? "selected" : "",
                                isAnswered && isCorrect ? "correct" : "",
                                isAnswered && selected && !isCorrect ? "wrong" : ""
                            ].filter(Boolean).join(" "),
                            onClick: () => answerQuiz(currentQuizIndex, choiceIndex)
                        },
                            react.createElement("span", { className: "ivlyrics-study-choice-letter" }, letter),
                            react.createElement("strong", null, choice),
                            isAnswered && isCorrect && react.createElement("span", { className: "ivlyrics-study-choice-mark" }, "✓"),
                            isAnswered && selected && !isCorrect && react.createElement("span", { className: "ivlyrics-study-choice-mark" }, "×")
                        );
                    })
                ),
                currentQuizAnswer && react.createElement("div", {
                    className: [
                        "ivlyrics-study-quiz-explanation",
                        currentQuizAnswer.correct ? "correct" : "wrong"
                    ].join(" ")
                },
                    react.createElement("strong", null,
                        currentQuizAnswer.correct
                            ? t("quizCorrect", "정답입니다")
                            : t("quizWrong", "해설")
                    ),
                    currentQuiz.explanation && react.createElement("p", null, currentQuiz.explanation)
                ),
                wrongQuizItems.length > 0 && react.createElement("div", { className: "ivlyrics-study-wrong-strip" },
                    react.createElement("span", null, t("wrongReview", "다시 볼 표현")),
                    wrongQuizItems.map((item, index) => react.createElement("button", {
                        key: `${item.id || item.lineIndex || index}-${index}`,
                        type: "button",
                        onClick: () => setQuizStep(Math.max(0, pack.quiz.indexOf(item)))
                    }, item.sourceText || item.question))
                ),
                react.createElement("div", { className: "ivlyrics-study-quiz-footer" },
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-secondary subtle",
                        onClick: goNextQuiz,
                        disabled: currentQuizIndex >= totalQuiz - 1
                    }, t("skipQuiz", "건너뛰기")),
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-primary dark",
                        onClick: finishOrNextQuiz,
                        disabled: !currentQuizAnswer
                    }, currentQuizIndex >= totalQuiz - 1 ? t("quizDone", "완료") : t("nextQuiz", "다음 문제"))
                )
            );

    const renderQuizResultSection = () => react.createElement("section", {
                className: "ivlyrics-study-card ivlyrics-study-quiz-result"
            },
                react.createElement("div", { className: "ivlyrics-study-result-hero" },
                    react.createElement("span", { className: "ivlyrics-study-result-kicker" }, t("quizResult", "결과")),
                    react.createElement("strong", null, `${quizResultPercent}%`),
                    react.createElement("p", null, quizResultMessage)
                ),
                react.createElement("div", { className: "ivlyrics-study-result-stats" },
                    react.createElement("div", null,
                        react.createElement("span", null, t("quizAccuracy", "정답률")),
                        react.createElement("strong", null, `${quizResultPercent}%`)
                    ),
                    react.createElement("div", null,
                        react.createElement("span", null, t("quizCorrectCount", "정답")),
                        react.createElement("strong", null, `${correctCount}/${totalQuiz}`)
                    ),
                    react.createElement("div", null,
                        react.createElement("span", null, t("quizWrongCount", "오답")),
                        react.createElement("strong", null, wrongQuizReviewItems.length)
                    )
                ),
                wrongQuizReviewItems.length > 0
                    ? react.createElement("div", { className: "ivlyrics-study-review-list" },
                        react.createElement("div", { className: "ivlyrics-study-review-head" },
                            react.createElement("h3", null, t("quizReviewTitle", "오답노트")),
                            react.createElement("p", null, t("quizReviewHint", "틀린 문제의 가사와 정답을 다시 확인하세요."))
                        ),
                        wrongQuizReviewItems.map(({ item, index, answer }) => react.createElement("article", {
                            key: `${item.id || index}-review`,
                            className: "ivlyrics-study-review-item"
                        },
                            item.sourceText && react.createElement("div", { className: "ivlyrics-study-review-source" },
                                react.createElement("blockquote", null, item.sourceText),
                                Number.isFinite(Number(item.startTime)) && react.createElement(LyricPlayButton, {
                                    onClick: () => playLyricAt({
                                        trackUri,
                                        startTime: item.startTime,
                                        endTime: item.endTime,
                                        sourceText: item.sourceText
                                    })
                                })
                            ),
                            react.createElement("p", { className: "ivlyrics-study-review-question" }, item.question),
                            react.createElement("div", { className: "ivlyrics-study-review-answers" },
                                react.createElement("span", { className: "wrong" },
                                    t("quizYourAnswer", "내 답"),
                                    ": ",
                                    item.choices?.[answer.choiceIndex] || "-"
                                ),
                                react.createElement("span", { className: "correct" },
                                    t("quizCorrectAnswer", "정답"),
                                    ": ",
                                    item.choices?.[item.answerIndex] || "-"
                                )
                            ),
                            item.explanation && react.createElement("p", { className: "ivlyrics-study-review-explanation" }, item.explanation),
                            react.createElement("button", {
                                type: "button",
                                className: "ivlyrics-study-mini",
                                onClick: () => setQuizStep(index)
                            }, t("quizReviewQuestion", "문제 보기"))
                        ))
                    )
                    : react.createElement("div", { className: "ivlyrics-study-no-wrong" }, t("quizNoWrong", "틀린 문제가 없습니다.")),
                react.createElement("div", { className: "ivlyrics-study-result-actions" },
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-secondary subtle",
                        onClick: () => setActiveTab("words")
                    }, t("quizGoWordbook", "단어장 보기")),
                    wrongQuizReviewItems.length > 0 && react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-secondary",
                        onClick: retryWrongQuiz
                    }, t("quizRetryWrong", "오답 다시 풀기")),
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-secondary",
                        onClick: regenerateQuiz,
                        disabled: status === "loading"
                    }, t("quizRegenerate", "새 문제 만들기")),
                    react.createElement("button", {
                        type: "button",
                        className: "ivlyrics-study-primary dark",
                        onClick: resetQuiz,
                        disabled: status === "loading"
                    }, t("quizRetry", "다시 풀기"))
                )
            );

    return react.createElement("div", { className: "ivlyrics-study-section ivlyrics-study-quiz-stage" },
            react.createElement("div", { className: "ivlyrics-study-quiz-tools" },
                react.createElement("div", { className: "ivlyrics-study-quiz-difficulty" },
                    react.createElement("span", null, t("difficulty", "난이도")),
                    react.createElement("div", { className: "ivlyrics-study-difficulty-options compact" },
                        difficultyOptions.map((item) => react.createElement("button", {
                            key: `quiz-${item.id}`,
                            type: "button",
                            className: quizDifficulty === item.id ? "active" : "",
                            onClick: () => setQuizDifficulty(item.id),
                            disabled: status === "loading"
                        }, item.label))
                    )
                ),
                react.createElement("button", {
                    type: "button",
                    className: "ivlyrics-study-secondary subtle",
                    onClick: regenerateQuiz,
                    disabled: status === "loading" || !hasLyrics
                }, t("quizRegenerate", "새 문제 만들기"))
            ),
            totalQuiz > 0 && react.createElement("div", { className: "ivlyrics-study-quiz-topline" },
                react.createElement("div", null,
                    react.createElement("span", { className: "ivlyrics-study-quiz-badge" },
                        quizFinished
                            ? t("quizResult", "결과")
                            : getQuizTypeLabel(currentQuiz?.type)
                    ),
                    react.createElement("span", null,
                        quizFinished
                            ? t("quizResult", "결과")
                            : t("quizStep", "{current}/{total} 문제")
                                .replace("{current}", currentQuizIndex + 1)
                                .replace("{total}", totalQuiz)
                    )
                ),
                react.createElement("div", { className: "ivlyrics-study-quiz-score-row" },
                    react.createElement("span", { className: "correct" }, `✓ ${correctCount}`),
                    react.createElement("span", { className: "wrong" }, `× ${wrongQuizCount}`)
                ),
                react.createElement("div", { className: "ivlyrics-study-quiz-progress" },
                    react.createElement("div", { style: { width: `${quizProgressPercent}%` } })
                )
            ),
            totalQuiz === 0 && react.createElement(EmptyState, null,
                react.createElement("p", null, t("noQuiz", "생성된 퀴즈가 없습니다.")),
                react.createElement("button", {
                    type: "button",
                    className: "ivlyrics-study-primary",
                    onClick: regenerateQuiz,
                    disabled: status === "loading"
                }, t("quizRegenerate", "새 문제 만들기"))
            ),
            quizFinished && totalQuiz > 0 && renderQuizResultSection(),
            currentQuiz && !quizFinished && renderCurrentQuizSection()
    );
}
