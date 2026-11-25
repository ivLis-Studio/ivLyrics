import { createRubyHtmlProps as createPanelLineHTMLProps } from "./lyricTextMarkup.mjs";
import { createBreakIconChildren, getInstrumentalBreakLabel } from "./lyricInterludePresentation.mjs";
import {
    KARAOKE_JOINING_SCRIPT_REGEX, formatKaraokePercent, getKaraokeTextDirection, shouldUseKaraokeTextRun,
    shouldWrapKaraokeByWord, getKaraokeSyllablesText, getKaraokeTextRunFill, buildKaraokeTextRunSegments, getSyllablesFromLine,
} from "./panelKaraokeText.mjs";
import {
    VOCAL_STACK_CENTER_THRESHOLD, observePanelVocalAnchor, splitLineByVocalRowShape,
} from "./panelVocalLayout.mjs";
import { TEXT_EFFECT_KIND_CLASSES } from "./panelLyricLineStyles.mjs";

export function createPanelLyricLines({
    react, host, readPlaybackPosition, lineStyles, getVocalRowsFromLine, buildSharedWordSegments,
    getInstrumentalBreakSettings, getInterludeInfo, translatePanelText,
}) {
    const { memo, useEffect, useLayoutEffect, useMemo, useRef } = react;
    const { getPanelSpeakerPresentation, getPanelSpeakerStyle, getTextEffectKindClassParts, wrapPanelInlineStyleRuns } = lineStyles;

    const buildKaraokeWordGroupElements = (items, wordElements, keyPrefix) => {
        if (!Array.isArray(items) || !Array.isArray(wordElements) || items.length !== wordElements.length) {
            return wordElements;
        }

        const groupedElements = [];
        let currentWord = [];
        let currentWordStart = 0;

        const flushWord = () => {
            if (currentWord.length === 0) {
                return;
            }

            const wordItems = items.slice(currentWordStart, currentWordStart + currentWord.length);
            const styledWordElements = wrapPanelInlineStyleRuns(wordItems, currentWord, {
                keyPrefix: keyPrefix + "-word-inline-style",
                sourceIndexOffset: currentWordStart
            });
            groupedElements.push(react.createElement("span", {
                key: keyPrefix + "-word-group-" + currentWordStart,
                className: "ivlyrics-panel-karaoke-word-group"
            }, styledWordElements));
            currentWord = [];
        };

        items.forEach((syllable, idx) => {
            const text = syllable?.text || "";
            const element = wordElements[idx];
            if (!element) {
                return;
            }

            if (/\r|\n/.test(text)) {
                flushWord();
                groupedElements.push(element);
                return;
            }

            const isWhitespace = text.trim() === "";
            if (!isWhitespace && currentWord.length === 0) {
                currentWordStart = idx;
            }

            if (isWhitespace) {
                if (currentWord.length > 0) {
                    currentWord.push(element);
                    flushWord();
                } else {
                    groupedElements.push(...wrapPanelInlineStyleRuns([syllable], [element], {
                        keyPrefix: keyPrefix + "-space-inline-style",
                        sourceIndexOffset: idx
                    }));
                }
                return;
            }

            currentWord.push(element);
        });

        flushWord();
        return groupedElements;
    };

    const KaraokeWord = memo(({ syllable, idx, isLinePast, isLineActive }) => {
        const wordRef = useRef(null);
        const text = syllable.text || '';

        // 외부에서 시간 업데이트 시 기존 단어 단위 하이라이트만 갱신 (리렌더링 없음)
        useLayoutEffect(() => {
            if (!wordRef.current) return;

            let lastShouldBeSung = null;

            const updateSungState = () => {
                const el = wordRef.current;
                if (!el) return;

                if (isLinePast) {
                    if (!el.classList.contains('sung')) {
                        el.classList.add('sung');
                    }
                    return;
                }

                const currentTime = readPlaybackPosition() || 0;
                const fillStartTime = Number.isFinite(syllable?.karaokeFillStartTime)
                    ? syllable.karaokeFillStartTime
                    : syllable.startTime;
                const shouldBeSung = currentTime >= fillStartTime;
                if (shouldBeSung === lastShouldBeSung) return;

                if (shouldBeSung && !el.classList.contains('sung')) {
                    el.classList.add('sung');
                } else if (!shouldBeSung && el.classList.contains('sung')) {
                    el.classList.remove('sung');
                }
                lastShouldBeSung = shouldBeSung;
            };

            // 초기 상태 설정
            updateSungState();

            // 활성 라인만 고빈도 시간 이벤트를 구독해 패널 전체 비용을 제한한다.
            if (!isLineActive || isLinePast) return undefined;
            host.addEventListener('ivlyrics-panel-time-update', updateSungState);
            return () => {
                host.removeEventListener('ivlyrics-panel-time-update', updateSungState);
            };
        }, [syllable, isLinePast, isLineActive]);

        // 텍스트가 비어있으면 렌더링하지 않음
        if (!text) return null;

        if (/\r|\n/.test(text)) {
            return react.createElement("span", {
                key: `line-break-${idx}`,
                className: "ivlyrics-panel-karaoke-line-break",
                "aria-hidden": "true"
            });
        }

        // 공백만 있는 경우 공백 span 반환
        if (text.trim() === '') {
            return react.createElement("span", {
                key: `space-${idx}`,
                className: "ivlyrics-panel-karaoke-space"
            }, " ");
        }

        // 텍스트에 공백이 포함된 경우 그대로 렌더링 (공백 유지)
        return react.createElement("span", {
            key: idx,
            ref: wordRef,
            className: [
                'ivlyrics-panel-karaoke-word',
                isLinePast ? 'sung' : ''
            ].filter(Boolean).join(' '),
            style: { '--ivlyrics-range-index': idx }
        }, text);
    });

    const KaraokeTextRunSegment = memo(({ segment, idx, isLinePast, isLineActive, textDirection }) => {
        const segmentRef = useRef(null);
        const text = segment?.text || "";
        const segmentDirection = getKaraokeTextDirection(text) || textDirection || "ltr";
        const gradientDirection = segmentDirection === "rtl" ? "to left" : "to right";

        useLayoutEffect(() => {
            if (!segmentRef.current || !text || segment?.type === "space") return;

            let lastState = null;
            let lastFill = null;

            const updateSegmentState = () => {
                const el = segmentRef.current;
                if (!el) return;

                const currentTime = readPlaybackPosition() || 0;
                const fill = isLinePast
                    ? 100
                    : (isLineActive ? getKaraokeTextRunFill(segment, currentTime) : 0);
                const isDone = fill >= 100;
                const isActive = fill > 0 && fill < 100;
                const state = isDone ? "done" : (isActive ? "active" : "pending");
                const stateChanged = state !== lastState;
                if (!stateChanged && (!isActive || fill === lastFill)) return;

                lastState = state;
                lastFill = fill;

                if (stateChanged) {
                    el.classList.toggle("sung", isDone);
                    el.classList.toggle("active", isActive);
                }

                if (isActive) {
                    const softEdge = 10;
                    if (stateChanged) {
                        el.style.setProperty("--ivlyrics-panel-karaoke-gradient-direction", gradientDirection);
                    }
                    el.style.setProperty("--ivlyrics-panel-karaoke-fill", formatKaraokePercent(fill));
                    el.style.setProperty("--ivlyrics-panel-karaoke-fill-soft-start", formatKaraokePercent(Math.max(0, fill - softEdge)));
                    el.style.setProperty("--ivlyrics-panel-karaoke-fill-soft-end", formatKaraokePercent(Math.min(100, fill + softEdge)));
                } else if (stateChanged) {
                    el.style.removeProperty("--ivlyrics-panel-karaoke-gradient-direction");
                    el.style.removeProperty("--ivlyrics-panel-karaoke-fill");
                    el.style.removeProperty("--ivlyrics-panel-karaoke-fill-soft-start");
                    el.style.removeProperty("--ivlyrics-panel-karaoke-fill-soft-end");
                }
            };

            updateSegmentState();
            if (!isLineActive || isLinePast) return undefined;
            host.addEventListener("ivlyrics-panel-time-update", updateSegmentState);
            return () => {
                host.removeEventListener("ivlyrics-panel-time-update", updateSegmentState);
            };
        }, [segment, text, isLinePast, isLineActive, gradientDirection]);

        if (!text) return null;
        if (segment?.type === "space") {
            return react.createElement("span", {
                key: "text-run-space-" + idx,
                className: "ivlyrics-panel-karaoke-text-run-space"
            }, text);
        }

        const segmentSpeakerPresentation = getPanelSpeakerPresentation(
            segment.styleSpeaker,
            segment.styleSpeakerColor,
            segment.styleSpeakerFallback
        );
        const segmentSpeakerStyle = getPanelSpeakerStyle(
            segment.styleSpeaker,
            segment.styleSpeakerColor,
            segment.styleSpeakerFallback
        );

        return react.createElement("span", {
            key: "text-run-" + idx,
            ref: segmentRef,
            className: [
                'ivlyrics-panel-karaoke-text-run-segment',
                isLinePast ? 'sung' : '',
                segment.styleKind || segment.styleSpeaker ? 'ivlyrics-panel-range-style' : '',
                segmentSpeakerPresentation.speakerClass ? `speaker-${segmentSpeakerPresentation.speakerClass}` : '',
                ...getTextEffectKindClassParts(segment.styleKind || '')
            ].filter(Boolean).join(' '),
            style: {
                ...segmentSpeakerStyle,
                ...(segmentSpeakerPresentation.speakerClass ? {
                    '--ivlyrics-range-color': 'var(--ivlyrics-panel-karaoke-color)'
                } : {}),
                '--ivlyrics-range-index': idx
            },
            dir: segmentDirection
        }, text);
    });
    // ============================================
    // 노래방 라인 컴포넌트 (syllables 포함)
    // ============================================
    const KaraokeLine = memo(({ syllables, vocalRows, isActive, isPast, phonetic, translation, lineClass, lineStyle, textEffectRevision = 0 }) => {
        const isVocalStack = Array.isArray(vocalRows) && vocalRows.length > 1;
        const shouldUseVocalRowAnchor = isActive && isVocalStack && vocalRows.length >= VOCAL_STACK_CENTER_THRESHOLD;
        const vocalStackRef = useRef(null);
        const vocalAnchorStateRef = useRef({ key: "", anchorPosition: -1, lastPlaybackPosition: NaN });
        const rowPhonetics = isVocalStack ? splitLineByVocalRowShape(phonetic, vocalRows) : [];
        const rowTranslations = isVocalStack ? splitLineByVocalRowShape(translation, vocalRows) : [];
        const hasRowPhoneticSubline = isVocalStack && vocalRows.some((row, rowIndex) => row.phonetic || rowPhonetics[rowIndex]);
        const hasRowTranslationSubline = isVocalStack && vocalRows.some((row, rowIndex) => row.translation || rowTranslations[rowIndex]);
        const stackPhonetic = isVocalStack && !hasRowPhoneticSubline && typeof phonetic === "string" ? phonetic.trim() : "";
        const stackTranslation = isVocalStack && !hasRowTranslationSubline && typeof translation === "string" ? translation.trim() : "";

        useEffect(() => observePanelVocalAnchor({
            stackElement: vocalStackRef.current,
            host, readPlaybackPosition, vocalAnchorStateRef, vocalRows, shouldUseVocalRowAnchor,
        }), [shouldUseVocalRowAnchor, vocalRows, textEffectRevision]);

        const renderKaraokeSyllables = (items, keyPrefix, className) => {
            const joinedText = getKaraokeSyllablesText(items);

            if (shouldUseKaraokeTextRun(joinedText)) {
                const textDirection = getKaraokeTextDirection(joinedText);
                const preserveInlineStyles = !KARAOKE_JOINING_SCRIPT_REGEX.test(joinedText);
                const segments = buildKaraokeTextRunSegments(items, preserveInlineStyles, buildSharedWordSegments);
                const renderSegments = textDirection === "rtl" ? [...segments].reverse() : segments;

                return react.createElement("div", {
                    className: className + " is-text-run " + (textDirection === "rtl" ? "is-rtl" : ""),
                    dir: textDirection === "rtl" ? "ltr" : textDirection
                },
                    renderSegments.map((segment, idx) =>
                        react.createElement(KaraokeTextRunSegment, {
                            key: keyPrefix + "-text-run-" + segment.startIndex + "-" + idx,
                            segment,
                            idx,
                            isLinePast: isPast,
                            isLineActive: isActive,
                            textDirection
                        })
                    )
                );
            }

            const wrapByWord = shouldWrapKaraokeByWord(joinedText);
            const wordElements = items.map((syllable, idx) =>
                react.createElement(KaraokeWord, {
                    key: keyPrefix + "-" + idx,
                    syllable,
                    idx,
                    isLinePast: isPast,
                    isLineActive: isActive
                })
            );
            const renderElements = wrapByWord
                ? buildKaraokeWordGroupElements(items, wordElements, keyPrefix)
                : wrapPanelInlineStyleRuns(items, wordElements, { keyPrefix });

            return react.createElement("div", {
                className: className + (wrapByWord ? " has-word-wrap" : "")
            },
                renderElements
            );
        };

        const stackChildren = isVocalStack ? vocalRows.map((row, rowIndex) => {
            const rowHasInlineEffects = Array.isArray(row.syllables)
                && row.syllables.some(syllable => (
                    syllable?.inlineStyle === true
                    && TEXT_EFFECT_KIND_CLASSES.has(String(syllable?.styleKind || '').trim().toLowerCase())
                ));
            const rowKindClasses = rowHasInlineEffects ? [] : getTextEffectKindClassParts(row.kind);
            const rowKey = row.key || "row-" + rowIndex;
            const rowRole = row.role === "background" ? "background" : "lead";
            const speakerClassName = row.speakerClass ? "speaker-" + row.speakerClass : "";
            const rowClassName = ["ivlyrics-panel-line-karaoke-row", rowRole, ...rowKindClasses, speakerClassName].filter(Boolean).join(" ");
            const partClassName = ["ivlyrics-panel-line-karaoke-part", rowRole, ...rowKindClasses, speakerClassName].filter(Boolean).join(" ");

            return react.createElement("div", {
                key: rowKey,
                className: partClassName,
                style: row.speakerStyle,
                "data-panel-vocal-row-index": rowIndex
            },
                renderKaraokeSyllables(row.syllables, rowKey, rowClassName),
                (row.phonetic || rowPhonetics[rowIndex]) && react.createElement("div", {
                    className: "ivlyrics-panel-line-phonetic"
                }, row.phonetic || rowPhonetics[rowIndex]),
                (row.translation || rowTranslations[rowIndex]) && react.createElement("div", {
                    className: "ivlyrics-panel-line-translation"
                }, row.translation || rowTranslations[rowIndex])
            );
        }) : null;

        if (stackChildren && stackPhonetic) {
            stackChildren.push(react.createElement("div", {
                key: "stack-phonetic",
                className: "ivlyrics-panel-line-phonetic ivlyrics-panel-line-karaoke-stack-subline"
            }, stackPhonetic));
        }

        if (stackChildren && stackTranslation) {
            stackChildren.push(react.createElement("div", {
                key: "stack-translation",
                className: "ivlyrics-panel-line-translation ivlyrics-panel-line-karaoke-stack-subline"
            }, stackTranslation));
        }

        const karaokeContent = isVocalStack
            ? react.createElement("div", {
                className: "ivlyrics-panel-line-karaoke ivlyrics-panel-line-karaoke-stack",
                ref: vocalStackRef,
                "data-panel-vocal-row-count": vocalRows.length
            }, stackChildren)
            : renderKaraokeSyllables(syllables, "main", "ivlyrics-panel-line-karaoke");

        return react.createElement("div", { className: lineClass, style: lineStyle },
            // 노래방 가사 (글자별 타이밍)
            karaokeContent,
            // 발음
            !(Array.isArray(vocalRows) && vocalRows.length > 1) && phonetic && react.createElement("div", {
                className: "ivlyrics-panel-line-phonetic"
            }, phonetic),
            // 번역
            !(Array.isArray(vocalRows) && vocalRows.length > 1) && translation && react.createElement("div", {
                className: "ivlyrics-panel-line-translation"
            }, translation)
        );
    }, (prevProps, nextProps) => {
        // Timing can change while the same lyric and active row remain visible.
        return prevProps.isActive === nextProps.isActive &&
            prevProps.isPast === nextProps.isPast &&
            prevProps.lineClass === nextProps.lineClass &&
            prevProps.lineStyle === nextProps.lineStyle &&
            prevProps.textEffectRevision === nextProps.textEffectRevision &&
            prevProps.phonetic === nextProps.phonetic &&
            prevProps.translation === nextProps.translation &&
            prevProps.syllables === nextProps.syllables &&
            prevProps.vocalRows === nextProps.vocalRows;
    });

    const InterludeLine = memo(({ kind, lineClass }) => {
        const settings = getInstrumentalBreakSettings();
        const label = getInstrumentalBreakLabel(kind || "break", translatePanelText);

        return react.createElement("div", { className: `${lineClass} interlude` },
            react.createElement("div", {
                className: `ivlyrics-panel-line-interlude lyrics-break-indicator lyrics-break-kind-${kind || "break"}`,
                "aria-label": settings.showLabel ? label : undefined,
                "aria-hidden": settings.showLabel ? undefined : "true",
                style: settings.style
            },
                react.createElement("span", {
                    className: `lyrics-break-icon lyrics-break-icon-${settings.icon}`
                }, createBreakIconChildren(react, settings.icon)),
                settings.showLabel && react.createElement("span", { className: "lyrics-break-label" }, label)
            )
        );
    }, (prevProps, nextProps) => {
        return prevProps.lineClass === nextProps.lineClass &&
            prevProps.durationMs === nextProps.durationMs &&
            prevProps.kind === nextProps.kind &&
            prevProps.settingsRevision === nextProps.settingsRevision;
    });

    // ============================================
    // 일반 가사 라인 컴포넌트
    // ============================================
    const NormalLine = memo(({ displayText, phonetic, translation, lineClass, lineStyle }) => {
        return react.createElement("div", { className: lineClass, style: lineStyle },
            react.createElement("p", {
                className: "ivlyrics-panel-line-text",
                ...createPanelLineHTMLProps(displayText)
            }, displayText ? undefined : " "),
            phonetic && react.createElement("div", {
                className: "ivlyrics-panel-line-phonetic"
            }, phonetic),
            translation && react.createElement("div", {
                className: "ivlyrics-panel-line-translation"
            }, translation)
        );
    }, (prevProps, nextProps) => {
        return prevProps.lineClass === nextProps.lineClass &&
            prevProps.lineStyle === nextProps.lineStyle &&
            prevProps.displayText === nextProps.displayText &&
            prevProps.phonetic === nextProps.phonetic &&
            prevProps.translation === nextProps.translation;
    });

    // ============================================
    // 가사 라인 컴포넌트 (Apple Music 스타일)
    // 노래방 가사와 일반 가사 모두 지원
    // ============================================
    const LyricLine = memo(({ line, lineIndex, lineCount, isActive, isPast, isFuture, translation, phonetic, isPlaceholder, instrumentalBreakRevision = 0, textEffectRevision = 0 }) => {
        const vocalRows = useMemo(() => getVocalRowsFromLine(line), [line]);
        const hasVocalStack = Array.isArray(vocalRows) && vocalRows.length > 1;
        const speakerPresentation = getPanelSpeakerPresentation(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']);
        const speakerClass = speakerPresentation.speakerClass;
        const lineStyle = getPanelSpeakerStyle(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']);
        const hasInlineEffects = useMemo(
            () => getSyllablesFromLine(line).some(syllable => (
                syllable?.inlineStyle === true
                && TEXT_EFFECT_KIND_CLASSES.has(String(syllable?.styleKind || '').trim().toLowerCase())
            )),
            [line]
        );
        const lineKindClasses = hasInlineEffects ? [] : getTextEffectKindClassParts(line?.kind);
        const lineClass = `ivlyrics-panel-line ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''} ${isPlaceholder ? 'placeholder' : ''} ${hasVocalStack ? 'vocal-stack' : ''} ${lineKindClasses.join(' ')} ${speakerClass ? `speaker-${speakerClass}` : ''}`;
        const interludeInfo = isPlaceholder ? { isInterlude: false, durationMs: 0 } : (line?.interludeInfo || getInterludeInfo(line, null, lineIndex, lineCount));

        // 노래방 가사인지 확인
        const syllables = useMemo(() => vocalRows?.[0]?.syllables || getSyllablesFromLine(line), [line, vocalRows]);
        const isKaraoke = syllables.length > 0;
        const displayText = line.originalText || line.text || '';

        if (interludeInfo.isInterlude) {
            if (!isActive) {
                return react.createElement("div", {
                    className: `${lineClass} interlude`,
                    "aria-hidden": "true"
                });
            }

            return react.createElement(InterludeLine, {
                durationMs: interludeInfo.durationMs,
                kind: interludeInfo.kind || "break",
                lineClass,
                settingsRevision: instrumentalBreakRevision
            });
        }

        // 노래방 가사인 경우
        if (isKaraoke) {
            return react.createElement(KaraokeLine, {
                syllables,
                vocalRows,
                isActive,
                isPast,
                phonetic,
                translation,
                lineClass,
                lineStyle,
                textEffectRevision
            });
        }

        // 일반 가사
        return react.createElement(NormalLine, {
            displayText,
            phonetic,
            translation,
            lineClass,
            lineStyle
        });
    }, (prevProps, nextProps) => {
        // currentTime 제거됨 - 라인 상태 변경 시에만 리렌더링
        return prevProps.isActive === nextProps.isActive &&
            prevProps.isPast === nextProps.isPast &&
            prevProps.isFuture === nextProps.isFuture &&
            prevProps.isPlaceholder === nextProps.isPlaceholder &&
            prevProps.translation === nextProps.translation &&
            prevProps.phonetic === nextProps.phonetic &&
            prevProps.lineIndex === nextProps.lineIndex &&
            prevProps.lineCount === nextProps.lineCount &&
            prevProps.instrumentalBreakRevision === nextProps.instrumentalBreakRevision &&
            prevProps.textEffectRevision === nextProps.textEffectRevision &&
            prevProps.line === nextProps.line;
    });

    return LyricLine;
}
