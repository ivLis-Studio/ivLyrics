export function renderHistoryTab(react, t, { EmptyState }, {
    historyCount, studyHistory, cacheKey, openHistoryItem, getStudyDifficultyLabel,
}) {
    return react.createElement("div", { className: "ivlyrics-study-section ivlyrics-study-history" },
            react.createElement("section", { className: "ivlyrics-study-wordbook-hero ivlyrics-study-history-hero" },
                react.createElement("div", null,
                    react.createElement("span", null, t("tabHistory", "학습 기록")),
                    react.createElement("h3", null, t("studyHistoryTitle", "생성한 곡"))
                ),
                react.createElement("strong", null,
                    t("studyHistoryCount", "{count}곡").replace("{count}", historyCount)
                )
            ),
            studyHistory.length === 0 && react.createElement(EmptyState, null, t("studyHistoryEmpty", "아직 생성한 학습 곡이 없습니다.")),
            studyHistory.length > 0 && react.createElement("div", { className: "ivlyrics-study-history-grid" },
                studyHistory.map((item) => {
                    const isCurrent = item.cacheKey === cacheKey;
                    return react.createElement("article", {
                        key: item.cacheKey,
                        className: `ivlyrics-study-history-card${isCurrent ? " active" : ""}`
                    },
                        react.createElement("button", {
                            type: "button",
                            onClick: () => openHistoryItem(item)
                        },
                            react.createElement("div", null,
                                react.createElement("strong", null, item.title || t("unknownSong", "제목 없음")),
                                item.artist && react.createElement("span", null, item.artist)
                            ),
                            react.createElement("div", { className: "ivlyrics-study-history-meta" },
                                isCurrent && react.createElement("em", { className: "current" }, t("studyHistoryCurrent", "현재 학습")),
                                react.createElement("em", null, getStudyDifficultyLabel(item.difficulty)),
                                react.createElement("em", null, `${item.quizCount} ${t("tabQuiz", "퀴즈")}`),
                                item.updatedAt && react.createElement("em", null, new Date(item.updatedAt).toLocaleDateString())
                            )
                        )
                    );
                })
            )
    );
}

export function renderExplainTab(react, t, { LyricPlayButton, ReadingHints, GrammarNote }, {
    currentLineStudy, playLyricAt, trackUri, getWordIdForEntry, savedWordIds,
    savedWordFeedback, toggleWord, pack, status, grammarItems,
}) {
    return react.createElement("div", { className: "ivlyrics-study-section" },
            currentLineStudy && react.createElement("section", { className: "ivlyrics-study-card ivlyrics-study-current" },
                react.createElement("h3", null, t("currentLine", "지금 가사")),
                currentLineStudy.sourceText && react.createElement("div", { className: "ivlyrics-study-source-card" },
                    react.createElement("div", { className: "ivlyrics-study-source-head" },
                        react.createElement("span", null, t("sourceLine", "가사 원문")),
                        Number.isFinite(Number(currentLineStudy.startTime)) && react.createElement(LyricPlayButton, {
                            onClick: () => playLyricAt({
                                trackUri,
                                startTime: currentLineStudy.startTime,
                                endTime: currentLineStudy.endTime,
                                sourceText: currentLineStudy.sourceText
                            })
                        })
                    ),
                    react.createElement("blockquote", null, currentLineStudy.sourceText),
                    react.createElement(ReadingHints, {
                        reading: currentLineStudy.reading,
                        pronunciation: currentLineStudy.pronunciation
                    })
                ),
                currentLineStudy.translation && react.createElement("p", { className: "ivlyrics-study-translation" }, currentLineStudy.translation),
                currentLineStudy.explanation && react.createElement("p", null, currentLineStudy.explanation),
                currentLineStudy.grammar?.length > 0 && react.createElement("div", { className: "ivlyrics-study-grammar-stack" },
                    currentLineStudy.grammar.map((item, index) => react.createElement(GrammarNote, {
                        key: index,
                        item
                    }))
                ),
                currentLineStudy.vocabulary?.length > 0 && react.createElement("div", { className: "ivlyrics-study-vocab-list" },
                    currentLineStudy.vocabulary.map((word, index) => {
                        const wordId = getWordIdForEntry(word);
                        const saved = savedWordIds.has(wordId);
                        const feedback = savedWordFeedback[wordId];
                        return react.createElement("button", {
                            key: `${word.term}-${index}`,
                            type: "button",
                            className: [
                                "ivlyrics-study-word-chip",
                                saved ? "saved" : "",
                                feedback ? "feedback" : ""
                            ].filter(Boolean).join(" "),
                            onClick: () => toggleWord({
                                ...word,
                                lineIndex: currentLineStudy.index,
                                sourceText: currentLineStudy.sourceText,
                                startTime: currentLineStudy.startTime,
                                endTime: currentLineStudy.endTime,
                                grammar: currentLineStudy.grammar
                            })
                        },
                            feedback === "removed" ? `− ${t("removedWord", "삭제됨")}` : feedback ? `✓ ${t("savedWord", "저장됨")}` : saved ? `✓ ${word.term}` : word.term,
                            !feedback && (word.reading ? ` (${word.reading})` : word.pronunciation ? ` (${word.pronunciation})` : ""),
                            !feedback && word.meaning ? ` - ${word.meaning}` : ""
                        );
                    })
                )
            ),
            !currentLineStudy && pack.lines?.length > 0 && react.createElement("div", { className: "ivlyrics-study-note" },
                status === "loading"
                    ? t("linePending", "지금 가사 카드는 아직 만드는 중입니다.")
                    : t("lineOutOfRange", "지금 가사는 분석 범위 밖입니다.")
            ),
            pack.summary && react.createElement("section", { className: "ivlyrics-study-card" },
                react.createElement("h3", null, t("summary", "곡 요약")),
                react.createElement("p", null, pack.summary)
            ),
            pack.omittedCount > 0 && react.createElement("div", { className: "ivlyrics-study-note" },
                t("omitted", "{count}개의 가사 조각은 분석 범위 밖입니다.").replace("{count}", pack.omittedCount)
            ),
            grammarItems.length > 0 && react.createElement("section", { className: "ivlyrics-study-card ivlyrics-study-grammar-card" },
                react.createElement("div", { className: "ivlyrics-study-section-head" },
                    react.createElement("div", null,
                        react.createElement("h3", null, t("grammarPatterns", "문법 포인트")),
                        react.createElement("p", null, t("grammarPatternsHint", "가사에서 바로 써먹을 수 있는 구조만 골랐습니다."))
                    ),
                    react.createElement("span", null, grammarItems.length)
                ),
                react.createElement("div", { className: "ivlyrics-study-grammar-lessons" },
                    grammarItems.map((item, index) => react.createElement("article", {
                        key: `${item.pattern}-${index}`,
                        className: "ivlyrics-study-grammar-lesson"
                    },
                        react.createElement("div", { className: "ivlyrics-study-grammar-index" }, String(index + 1).padStart(2, "0")),
                        react.createElement("div", { className: "ivlyrics-study-grammar-body" },
                            react.createElement("div", { className: "ivlyrics-study-grammar-title-row" },
                                react.createElement(GrammarNote, { item }),
                                Number.isFinite(Number(item.startTime)) && react.createElement(LyricPlayButton, {
                                    onClick: () => playLyricAt({
                                        trackUri,
                                        startTime: item.startTime,
                                        endTime: item.endTime,
                                        sourceText: item.sourceText
                                    })
                                })
                            ),
                            item.sourceText && react.createElement("blockquote", null, item.sourceText),
                            item.translation && react.createElement("p", { className: "ivlyrics-study-grammar-translation" }, item.translation),
                            item.lineExplanation && react.createElement("p", { className: "ivlyrics-study-grammar-context" }, item.lineExplanation)
                        )
                    ))
                )
            ),
            pack.keyExpressions?.length > 0 && react.createElement("section", { className: "ivlyrics-study-card ivlyrics-study-expansion-card" },
                react.createElement("div", { className: "ivlyrics-study-section-head" },
                    react.createElement("div", null,
                        react.createElement("h3", null, t("keyExpressions", "표현 확장")),
                        react.createElement("p", null, t("expressionExpansionHint", "가사 속 단어를 다른 상황에서도 쓰게 만드는 확장 노트입니다."))
                    ),
                    react.createElement("span", null, pack.keyExpressions.length)
                ),
                pack.keyExpressions.map((item, index) => react.createElement("article", {
                    key: `${item.expression}-${index}`,
                    className: "ivlyrics-study-expression"
                },
                    react.createElement("div", { className: "ivlyrics-study-expression-main" },
                        react.createElement("div", null,
                            react.createElement("strong", null, item.expression),
                            item.meaning && react.createElement("span", null, item.meaning)
                        ),
                        Number.isFinite(Number(item.startTime)) && react.createElement(LyricPlayButton, {
                            onClick: () => playLyricAt({ ...item, trackUri: item.trackUri || trackUri })
                        })
                    ),
                    item.sourceText && react.createElement("p", { className: "ivlyrics-study-source-inline" }, item.sourceText),
                    react.createElement(ReadingHints, {
                        reading: item.reading,
                        pronunciation: item.pronunciation
                    }),
                    item.note && react.createElement("p", null, item.note),
                    (item.alternatives?.length > 0 || item.forms?.length > 0 || item.relatedWords?.length > 0) && react.createElement("div", { className: "ivlyrics-study-expression-groups" },
                        item.alternatives?.length > 0 && react.createElement("div", null,
                            react.createElement("span", null, t("alternatives", "대체 표현")),
                            react.createElement("div", null, item.alternatives.map((value) => react.createElement("em", { key: value }, value)))
                        ),
                        item.forms?.length > 0 && react.createElement("div", null,
                            react.createElement("span", null, t("forms", "활용형")),
                            react.createElement("div", null, item.forms.map((value) => react.createElement("em", { key: value }, value)))
                        ),
                        item.relatedWords?.length > 0 && react.createElement("div", null,
                            react.createElement("span", null, t("relatedWords", "비슷한 단어")),
                            react.createElement("div", null, item.relatedWords.map((value) => react.createElement("em", { key: value }, value)))
                        )
                    ),
                    react.createElement("div", { className: "ivlyrics-study-expression-actions" },
                        react.createElement("button", {
                            type: "button",
                            className: [
                                "ivlyrics-study-mini",
                                savedWordIds.has(getWordIdForEntry(item)) ? "saved" : "",
                                savedWordFeedback[getWordIdForEntry(item)] ? "feedback" : ""
                            ].filter(Boolean).join(" "),
                            onClick: () => toggleWord({ ...item, lineIndex: item.lineIndexes?.[0] ?? null })
                        }, savedWordFeedback[getWordIdForEntry(item)] === "removed"
                            ? t("removedWord", "삭제됨")
                            : savedWordFeedback[getWordIdForEntry(item)]
                            ? t("savedWord", "저장됨")
                            : savedWordIds.has(getWordIdForEntry(item))
                                ? t("savedWord", "저장됨")
                                : t("saveWord", "저장"))
                    )
                ))
            )
    );
}

export function renderWordsTab(react, t, { EmptyState, LyricPlayButton, ReadingHints, GrammarNote }, {
    wordbook, wordQuery, setWordQuery, wordbookStats, wordScope,
    setWordScope, filteredWordbook, removeWord, speakText, detectSpeechLang,
    targetLang, playLyricAt,
}) {
    return react.createElement("div", { className: "ivlyrics-study-section ivlyrics-study-wordbook" },
            react.createElement("section", { className: "ivlyrics-study-wordbook-hero" },
                react.createElement("div", null,
                    react.createElement("span", null, t("tabWords", "단어장")),
                    react.createElement("h3", null, t("wordbookTitle", "저장한 표현"))
                ),
                react.createElement("strong", null,
                    t("wordCount", "{count}개").replace("{count}", wordbook.length)
                )
            ),
            react.createElement("div", { className: "ivlyrics-study-word-tools" },
                react.createElement("label", { className: "ivlyrics-study-word-search" },
                    react.createElement("span", null, "⌕"),
                    react.createElement("input", {
                        type: "search",
                        value: wordQuery,
                        placeholder: t("wordSearch", "표현, 뜻, 가사 검색"),
                        onChange: (event) => setWordQuery(event.target.value)
                    })
                ),
                react.createElement("div", { className: "ivlyrics-study-word-stat-row" },
                    react.createElement("span", null, t("wordStatAll", "전체 {count}").replace("{count}", wordbookStats.total)),
                    react.createElement("span", null, t("wordStatCurrent", "현재 곡 {count}").replace("{count}", wordbookStats.current)),
                    react.createElement("span", null, t("wordStatReading", "읽기 {count}").replace("{count}", wordbookStats.withReading)),
                    react.createElement("span", null, t("wordStatSource", "가사 {count}").replace("{count}", wordbookStats.withSource)),
                    react.createElement("span", null, t("wordStatSynced", "싱크 {count}").replace("{count}", wordbookStats.withSync))
                ),
                react.createElement("div", { className: "ivlyrics-study-word-scope", role: "tablist" },
                    [
                        { id: "all", label: t("wordScopeAll", "전체") },
                        { id: "current", label: t("wordScopeCurrent", "현재 곡") },
                        { id: "synced", label: t("wordScopeSynced", "싱크 있음") }
                    ].map((item) => react.createElement("button", {
                        key: item.id,
                        type: "button",
                        className: wordScope === item.id ? "active" : "",
                        onClick: () => setWordScope(item.id),
                        role: "tab",
                        "aria-selected": wordScope === item.id
                    }, item.label))
                )
            ),
            wordbook.length === 0 && react.createElement(EmptyState, null, t("noWords", "저장된 단어가 없습니다.")),
            wordbook.length > 0 && filteredWordbook.length === 0 && react.createElement(EmptyState, null, t("noWordResults", "검색 결과가 없습니다.")),
            filteredWordbook.length > 0 && react.createElement("div", { className: "ivlyrics-study-word-grid" },
                filteredWordbook.map((word) => react.createElement("article", {
                    key: word.id,
                    className: "ivlyrics-study-word-card"
                },
                    react.createElement("div", { className: "ivlyrics-study-word-head" },
                        react.createElement("div", null,
                            react.createElement("strong", null, word.expression),
                            word.meaning && react.createElement("span", null, word.meaning),
                            (word.title || word.artist) && react.createElement("em", null,
                                [word.title, word.artist].filter(Boolean).join(" - ")
                            )
                        ),
                        react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-word-remove",
                            onClick: () => removeWord(word.id),
                            "aria-label": t("removeWord", "삭제")
                        }, "×")
                    ),
                    react.createElement("div", { className: "ivlyrics-study-word-actions" },
                        react.createElement("button", {
                            type: "button",
                            className: "ivlyrics-study-lyric-play ivlyrics-study-speech-play",
                            onClick: () => speakText(word.expression, word.sourceLang || detectSpeechLang([
                                word.expression,
                                word.reading,
                                word.sourceText
                            ].filter(Boolean).join(" "), word.targetLang || targetLang))
                        },
                            react.createElement("span", { "aria-hidden": "true" }, "▶"),
                            react.createElement("span", null, t("speak", "발음 듣기"))
                        ),
                        word.trackUri && Number.isFinite(Number(word.startTime)) && react.createElement(LyricPlayButton, {
                            onClick: () => playLyricAt(word)
                        })
                    ),
                    react.createElement(ReadingHints, {
                        reading: word.reading,
                        pronunciation: word.pronunciation
                    }),
                    word.grammar?.length > 0 && react.createElement("div", { className: "ivlyrics-study-word-grammar" },
                        word.grammar.map((item, index) => react.createElement(GrammarNote, {
                            key: index,
                            item
                        }))
                    ),
                    word.sourceText && react.createElement("p", { className: "ivlyrics-study-word-source" }, word.sourceText),
                    word.note && react.createElement("p", { className: "ivlyrics-study-word-note" }, word.note)
                ))
            )
    );
}
