import { safeRenderText } from "./lyricDisplayText.mjs";
import { normalizeDisplayedCulturalAnnotations, partitionLyricAnnotations, renderAnnotatedLyricHTML } from "./lyricCulturalAnnotations.mjs";

export function createLyricMainContentRenderer({ react, getKaraokeLine, hasKaraokeVocalRows }) {
	return function renderLyricMainContent({
		isKara = false,
		karaokeRenderGranularity = null,
		mainText,
		line,
		position,
		liveClock = null,
		isActive,
		isEffectFocused = isActive,
		isEffectLive = isActive || isEffectFocused,
		settingsRevision = 0,
		subText = null,
		subText2 = null,
		culturalAnnotations = [],
		furiganaMapOverride = null,
		charReadings = null,
	}) {
		if (isKara) {
			return react.createElement(getKaraokeLine(), {
				// A source refresh can replace a single voice with parallel vocals (or
				// merge them back) at the same row/time. Those renderers use different
				// hooks; remount only this structural boundary, not ordinary AI updates.
				key: hasKaraokeVocalRows(line) ? "parallel-vocals" : "single-vocal",
				line,
				...(furiganaMapOverride instanceof Map ? { furiganaMapOverride } : null),
				...(charReadings instanceof Map ? { charReadings } : null),
				// Future rows are already pinned to 0 by the playback window. Completed
				// rows receive one stable position past their final glyph so the painted
				// progress remains visible without returning to the per-frame update path.
				position,
				...(liveClock ? { liveClock } : {}),
				isActive,
				isEffectFocused,
				isEffectLive,
				settingsRevision,
				phonetic: subText,
				translation: subText2,
				culturalAnnotations,
				renderGranularity: karaokeRenderGranularity,
			});
		}

		if (typeof mainText === "string") {
			return null;
		}

		return safeRenderText(mainText);
	};
}

export function createLyricsLineBlock({
	react, InterludeIndicator, getInterludeInfo, hasKaraokeVocalRows,
	getPhoneticFillUnits, renderPhoneticFillSubLine, renderLyricSubLine, renderLyricMainContent,
	formatLyricLineToCopy, actions, readSeekTitleLocale, renderMainHtml = renderAnnotatedLyricHTML,
}) {
	const { useMemo, useCallback } = react;
	const { createCopyHandler, selectLine, formatLyricsSeekTitle } = actions;

	return react.memo(function LyricsLineBlock({
		className,
		style,
		lineRef = null,
		dir = "auto",
		seekTime = null,
		mainText,
		subText = null,
		subText2 = null,
		originalText = null,
		isKara = false,
		karaokeRenderGranularity = null,
		line = null,
		position = 0,
		liveClock = null,
		isActive = false,
		isCurrentLine = isActive,
		isEffectFocused = isCurrentLine,
		isEffectLive = isActive || isEffectFocused,
		settingsRevision = 0,
		mainCopyText = null,
		mainCopySuccessKey = "notifications.lyricsCopied",
		mainCopyFailureKey = "notifications.lyricsCopyFailed",
		subCopyText = null,
		subCopySuccessKey = "notifications.translationCopied",
		subCopyFailureKey = "notifications.translationCopyFailed",
		subText2CopyText = null,
		subText2CopySuccessKey = "notifications.secondTranslationCopied",
		subText2CopyFailureKey = "notifications.secondTranslationCopyFailed",
		culturalNote = null,
		singleLineScroll = false,
		hiddenFromAccessibility = false,
		furiganaMapOverride = null,
		charReadings = null,
	}) {
		const mainLine = useMemo(() => line || (typeof mainText === "object" ? mainText : {
			text: mainText,
			originalText,
			text2: subText2,
		}), [line, mainText, originalText, subText2]);
		const displayedCulturalAnnotations = useMemo(() => normalizeDisplayedCulturalAnnotations(
			culturalNote || mainLine?.culturalNote
		), [culturalNote, mainLine?.culturalNote, settingsRevision]);
		const culturalAnnotationsByTarget = useMemo(() => partitionLyricAnnotations({
			annotations: displayedCulturalAnnotations, isKara, mainText, subText, subText2,
		}), [displayedCulturalAnnotations, isKara, mainText, subText, subText2]);
		const hasParallelKaraokeRows = useMemo(() => isKara && hasKaraokeVocalRows(mainLine), [isKara, mainLine, settingsRevision]);
		// Pronunciation fill: timed units for this row's pronunciation, only when
		// they spell exactly the pronunciation shown.
		const phoneticFillUnits = useMemo(() => isKara && !hasParallelKaraokeRows && mainLine?.phoneticUnits
			? getPhoneticFillUnits(mainLine?.phoneticUnits, mainLine?.phoneticText || mainLine?.phonetic)
			: null, [isKara, hasParallelKaraokeRows, mainLine]);
		const phoneticFillPosition = phoneticFillUnits ? position : 0;
		const phoneticFillClock = phoneticFillUnits ? liveClock : null;
		const phoneticFillActive = phoneticFillUnits ? isActive : false;
		const interludeInfo = useMemo(() => mainLine?.interludeInfo || getInterludeInfo(mainLine), [mainLine, settingsRevision]);
		const shouldRenderInterlude = interludeInfo.isInterlude;
		const shouldShowInterlude = shouldRenderInterlude && isCurrentLine;
		const lineClassName = (shouldRenderInterlude
			? `${className} lyrics-lyricsContainer-LyricsLine-interlude`
			: className) + (hasParallelKaraokeRows ? " lyrics-line-vocals" : "");

		const mainProps = useMemo(() => ({
			onContextMenu: createCopyHandler(
				mainCopyText || formatLyricLineToCopy(mainText, subText, subText2, originalText),
				mainCopySuccessKey,
				mainCopyFailureKey
			),
		}), [mainCopyText, mainText, subText, subText2, originalText, mainCopySuccessKey, mainCopyFailureKey, settingsRevision]);

		const mainHtml = useMemo(() => !shouldRenderInterlude && typeof mainText === "string" && !isKara && mainText
			? renderMainHtml(
				mainText,
				culturalAnnotationsByTarget.main
			)
			: null, [shouldRenderInterlude, mainText, isKara, culturalAnnotationsByTarget.main, settingsRevision]);

		const paragraphProps = useMemo(() => {
			const props = { ...mainProps };
			if (shouldRenderInterlude) {
				props.className = "lyrics-lyricsContainer-LyricsLine-interludeMain";
			} else if (singleLineScroll) {
				props.className = "ivlyrics-vinyl-lyric-scroll-viewport";
			} else if (mainHtml) {
				props.dangerouslySetInnerHTML = { __html: mainHtml };
			}
			return props;
		}, [mainProps, shouldRenderInterlude, singleLineScroll, mainHtml]);

		const canSeek = !hiddenFromAccessibility && Number.isFinite(seekTime);
		const titleLocale = canSeek ? readSeekTitleLocale?.() : null;
		const localizedSeekTitle = useMemo(() => titleLocale ? formatLyricsSeekTitle(seekTime) : null,
			[titleLocale, seekTime, settingsRevision]);
		const handleClick = useCallback(event => selectLine(seekTime, isKara, event), [seekTime, isKara]);
		const handleKeyDown = useCallback((event) => {
			if (!Number.isFinite(seekTime) || !["Enter", " ", "Spacebar"].includes(event.key)) return;
			event.preventDefault();
			handleClick(event);
		}, [handleClick, seekTime]);

		// Moving the row changes its outer style, not its text tree. Keep the
		// paragraph and supplements mounted with the same element identities.
		const mainContent = useMemo(() => shouldRenderInterlude
			? (shouldShowInterlude ? react.createElement(InterludeIndicator, {
				durationMs: interludeInfo.durationMs,
				kind: interludeInfo.kind || "break",
				settingsRevision,
			}) : "\u00A0")
			: renderLyricMainContent({
				isKara,
				karaokeRenderGranularity,
				mainText,
				line: mainLine,
				position: isKara ? position : 0,
				...(isKara && liveClock ? { liveClock } : {}),
				isActive,
				isEffectFocused,
				isEffectLive,
				settingsRevision,
				subText,
				subText2,
				culturalAnnotations: displayedCulturalAnnotations,
				...(furiganaMapOverride instanceof Map ? { furiganaMapOverride } : null),
				...(charReadings instanceof Map ? { charReadings } : null),
			}), [shouldRenderInterlude, shouldShowInterlude, interludeInfo, settingsRevision,
			furiganaMapOverride, charReadings,
			isKara, karaokeRenderGranularity, mainText, mainLine, position, liveClock, isActive,
			isEffectFocused, isEffectLive,
			subText, subText2, displayedCulturalAnnotations]);
		const renderedMainContent = useMemo(() => singleLineScroll && !shouldRenderInterlude
			? react.createElement(
				"span",
				{
					className: "ivlyrics-vinyl-lyric-scroll-content",
					...(mainHtml ? { dangerouslySetInnerHTML: { __html: mainHtml } } : {}),
				},
				mainHtml ? null : mainContent
			)
			: mainContent, [singleLineScroll, shouldRenderInterlude, mainHtml, mainContent]);
		const paragraph = useMemo(() => react.createElement("p", paragraphProps, renderedMainContent),
			[paragraphProps, renderedMainContent]);
		const supplements = useMemo(() => [
			!shouldRenderInterlude && !hasParallelKaraokeRows && (phoneticFillUnits ? renderPhoneticFillSubLine(
				phoneticFillUnits, phoneticFillPosition, phoneticFillActive, phoneticFillClock,
				subCopyText ? createCopyHandler(subCopyText, subCopySuccessKey, subCopyFailureKey) : null,
				singleLineScroll
			) : renderLyricSubLine(
				"lyrics-lyricsContainer-LyricsLine-phonetic", subText,
				subCopyText ? createCopyHandler(subCopyText, subCopySuccessKey, subCopyFailureKey) : null,
				singleLineScroll, culturalAnnotationsByTarget.sub
			)),
			!shouldRenderInterlude && !hasParallelKaraokeRows && renderLyricSubLine(
				"lyrics-lyricsContainer-LyricsLine-translation", subText2,
				subText2CopyText ? createCopyHandler(subText2CopyText, subText2CopySuccessKey, subText2CopyFailureKey) : null,
				singleLineScroll, culturalAnnotationsByTarget.sub2
			),
			!shouldRenderInterlude && displayedCulturalAnnotations.map((annotation) => {
				const noteText = `${annotation.marker}. ${annotation.note}`;
				return renderLyricSubLine(
					"lyrics-lyricsContainer-LyricsLine-culturalNote", noteText,
					createCopyHandler(noteText, "notifications.translationCopied", "notifications.translationCopyFailed"),
					false, [], `cultural-note-${annotation.marker}`
				);
			}),
		], [shouldRenderInterlude, hasParallelKaraokeRows, subText, subText2,
			phoneticFillUnits, phoneticFillPosition, phoneticFillActive, phoneticFillClock,
			subCopyText, subCopySuccessKey, subCopyFailureKey, subText2CopyText,
			subText2CopySuccessKey, subText2CopyFailureKey, singleLineScroll,
			culturalAnnotationsByTarget, displayedCulturalAnnotations, settingsRevision]);

		return react.createElement(
			"div",
			{
				className: lineClassName,
				style,
				dir,
				ref: lineRef,
				"aria-hidden": hiddenFromAccessibility ? true : undefined,
				onClick: canSeek ? handleClick : null,
				...(canSeek ? {
					role: "button",
					tabIndex: 0,
					title: localizedSeekTitle ?? formatLyricsSeekTitle(seekTime),
					"data-lyrics-seek-time": seekTime,
					onKeyDown: handleKeyDown,
				} : {}),
			},
			paragraph,
			...supplements
		);
	});
}
