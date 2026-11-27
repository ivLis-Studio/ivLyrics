import { KARAOKE_JOINING_SCRIPT_REGEX } from "./karaokeTextDirection.mjs";
import { getCopyableText } from "./lyricDisplayText.mjs";
import { splitLineByVocalRowShape } from "./vocalRowText.mjs";
import { getKaraokeCulturalMarkers } from "./lyricCulturalAnnotations.mjs";
import { prepareKaraokeGlyphUpdates, getKaraokeGlyphUpdates } from "./karaokeGlyphUpdates.mjs";
import { getKaraokeFillSoftEdge } from "./karaokeFill.mjs";
import { KARAOKE_LIVE_ATTRIBUTE } from "./karaokeLivePainter.mjs";
import { KARAOKE_VOCAL_STACK_CENTER_THRESHOLD } from "./lyricsScrollGeometry.mjs";
import { getPhoneticFillUnits } from "./karaokePhoneticFill.mjs";
import {
	classifyKaraokeExpressiveUnits, getKaraokeMotionProfile, getKaraokeExpressiveGlyphWindow,
	isKaraokeExpressiveEmphasisUnit, KARAOKE_BOUNCE_IDLE, KARAOKE_EXPRESSIVE_MOTION_STYLE, KARAOKE_EXPRESSIVE_SETTLE_MS,
} from "./karaokeMotion.mjs";
import { KARAOKE_TEXT_EFFECT_KIND_CLASSES, PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT } from "./karaokeLinePresentation.mjs";
import {
	getTimedSyllablesFromLine, getKaraokeLineBounds, applyKaraokeWhitespaceCompensation, getActiveKaraokeTimedCharIndex,
} from "./karaokeLineTiming.mjs";
import {
	getKaraokeVocalRowRenderPosition, prepareKaraokeVocalAnchorWindows, getKaraokeVocalAnchorLineKey,
	getKaraokeVocalAnchorPosition, getKaraokeVocalAnchorWindowMs, getStableVocalAnchorPosition,
} from "./karaokeVocalTiming.mjs";

const KARAOKE_CHAR_STATE_CLASS_NAMES = {
	pending: [
		"lyrics-karaoke-char lyrics-karaoke-char--pending",
		"lyrics-karaoke-char lyrics-karaoke-char--pending is-complete",
		"lyrics-karaoke-char lyrics-karaoke-char--pending is-bouncing",
		"lyrics-karaoke-char lyrics-karaoke-char--pending is-bouncing is-complete",
	],
	active: [
		"lyrics-karaoke-char lyrics-karaoke-char--active",
		"lyrics-karaoke-char lyrics-karaoke-char--active is-complete",
		"lyrics-karaoke-char lyrics-karaoke-char--active is-bouncing",
		"lyrics-karaoke-char lyrics-karaoke-char--active is-bouncing is-complete",
	],
	done: [
		"lyrics-karaoke-char lyrics-karaoke-char--done",
		"lyrics-karaoke-char lyrics-karaoke-char--done is-complete",
		"lyrics-karaoke-char lyrics-karaoke-char--done is-bouncing",
		"lyrics-karaoke-char lyrics-karaoke-char--done is-bouncing is-complete",
	],
};


export function createKaraokeLine({
	react, PhoneticFillText, motion, getKaraokeCharFill, useKaraokeLivePainting, useKaraokeWordStackSupplements,
	getVisualSettings, getLocale, getSpeakerColors, getSegmenter, getWordSegmentBuilder,
	isFuriganaReady, applyFurigana, prefersReducedLyricsMotion, getKaraokeVocalRows,
	buildKaraokeFuriganaMap, buildKaraokeTimedChars, buildKaraokeVocalRowRenderData, splitKaraokeGraphemes,
	assignKaraokeWordIndexes, textRenderer,
}) {
	const { useMemo, useRef } = react;
	const {
		getKaraokeBounceValues, getKaraokeExpressiveMotion, getKaraokeExpressivePhase, isKaraokeExpressiveMotionEnabled,
	} = motion;
	const {
		getKaraokeKindClassParts, getKaraokeTextDirection,
		getKaraokeInstantWordFill, getKaraokeLiveState, getCachedKaraokeStateClassName,
		shouldPreferKaraokeWhitespaceWrap, shouldUseKaraokeTextRun, shouldWrapKaraokeByWord,
		buildKaraokeTextRunElements, buildKaraokeTextRunReadings, buildKaraokeTextRunSegments,
		buildKaraokeWordElements, wrapKaraokeInlineStyleRuns,
	} = textRenderer;

	const KaraokeLine = react.memo(({ line, position, isActive, isEffectFocused = isActive, isEffectLive = isActive || isEffectFocused, settingsRevision = 0, phonetic = null, translation = null, furiganaMapOverride = null, charReadings = null, culturalAnnotations = null, renderGranularity = null, liveClock = null, livePositionMap = null }) => {
	  if (!line) {
	          return "";
	  }

	  const wordTimed = renderGranularity
		? renderGranularity === "word"
		: line.karaokeGranularity === "word";
		// Rows that follow the live playback clock leave continuous glyph values to
		// KaraokeLivePainter; every other row renders exactly as before.
		const livePaint = !!liveClock;
		const liveRootRef = useRef(null);
		const liveDataRef = useRef(null);
		liveDataRef.current = null;
		useKaraokeLivePainting(liveClock, livePositionMap, liveRootRef, liveDataRef);

		const lyricsLocale = getLocale();
		const speakerColors = getSpeakerColors();
		const creatorSpeakerColorEnabled = line.vocals
			? (speakerColors?.isCreatorColorEnabled?.()
				?? (getVisualSettings()?.["sync-data-custom-speaker-colors-enabled"] !== false))
			: false;
		// Playback only changes the active row and fill. Keep each child line stable
		// so its own character/furigana preparation can survive playback updates.
		const vocalRows = useMemo(() => getKaraokeVocalRows(line), [
			line, line.vocals, settingsRevision, creatorSpeakerColorEnabled,
			speakerColors, speakerColors?.getPresentation,
			speakerColors?.[PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT],
		]);
	  // The focused block remains the scroll anchor after its glyphs finish.
	  // Dropping it with the release clock re-centers the first vocal row during
	  // a pause, then moves the entire page again at the next lyric hand-off.
	  const shouldUseVocalRowAnchor = (isActive || isEffectFocused)
	          && Array.isArray(vocalRows)
	          && vocalRows.length >= KARAOKE_VOCAL_STACK_CENTER_THRESHOLD;
		const vocalRowRenderData = useMemo(() => Array.isArray(vocalRows)
			? prepareKaraokeVocalAnchorWindows(vocalRows.map((row) => ({
				...buildKaraokeVocalRowRenderData(line, row, true),
				hasInlineEffects: Array.isArray(row.syllables) && row.syllables.some(syllable => (
					syllable?.inlineStyle === true
					&& KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(String(syllable?.styleKind || "").trim().toLowerCase())
				)),
			})))
				: null, [line, vocalRows, lyricsLocale, getSegmenter()?.segmentGraphemes]);
		const vocalActiveCharIndexes = useMemo(() => shouldUseVocalRowAnchor
			? vocalRowRenderData.map(({ timedChars }) => getActiveKaraokeTimedCharIndex(timedChars, position))
			: null, [shouldUseVocalRowAnchor, vocalRowRenderData, position]);
		// Each voice row clamps the shared clock to its own render window.
		const vocalRowLivePositionMaps = useMemo(() => livePaint && Array.isArray(vocalRowRenderData)
			? vocalRowRenderData.map((rowData) => (value) => getKaraokeVocalRowRenderPosition(rowData,
				livePositionMap ? livePositionMap(value) : value))
			: null, [livePaint, vocalRowRenderData, livePositionMap]);
	  const vocalAnchorKey = useMemo(() => shouldUseVocalRowAnchor
	          ? getKaraokeVocalAnchorLineKey(line) : null, [shouldUseVocalRowAnchor, line]);
	  const vocalAnchorStateRef = useRef({ key: null, anchorPosition: -1, lastPlaybackPosition: NaN });
	  let nextVocalAnchorPosition = shouldUseVocalRowAnchor
	          ? getKaraokeVocalAnchorPosition(vocalRowRenderData, position, vocalActiveCharIndexes)
	          : -1;
	  if (shouldUseVocalRowAnchor && isEffectFocused && nextVocalAnchorPosition < 0
	          && (vocalAnchorStateRef.current.anchorPosition < 0
	                  || vocalAnchorStateRef.current.key !== vocalAnchorKey
	                  || position < vocalAnchorStateRef.current.lastPlaybackPosition - 250)) {
	          // A seek can land in the silence without a previously visited row.
	          // Use the last started voice so seeking and continuous playback agree.
	          nextVocalAnchorPosition = vocalRowRenderData.findLastIndex(row => position >= row.renderStartTime);
	  }
	  const activeVocalAnchorPosition = shouldUseVocalRowAnchor
	          ? getStableVocalAnchorPosition(vocalAnchorStateRef, vocalAnchorKey, position, nextVocalAnchorPosition)
	          : -1;
	  const activeVocalRowIndex = Number.isFinite(activeVocalAnchorPosition) && activeVocalAnchorPosition >= 0
	          ? Math.round(activeVocalAnchorPosition)
	          : -1;
	  const activeVocalAnchorWindowMs = shouldUseVocalRowAnchor
	          ? getKaraokeVocalAnchorWindowMs(vocalRowRenderData,
	                  activeVocalAnchorPosition < 0 && Number.isFinite(vocalRowRenderData[0]?.anchorEndTime)
	                          ? 0 : activeVocalAnchorPosition)
	          : null;

		const vocalAuxiliaryData = useMemo(() => {
			if (!vocalRows) return null;
			const rowPhonetics = splitLineByVocalRowShape(phonetic, vocalRows);
			const rowTranslations = splitLineByVocalRowShape(translation, vocalRows);
			const hasRowPhoneticSubline = vocalRows.some((row, rowIndex) => row.phonetic || rowPhonetics[rowIndex]);
			const hasRowTranslationSubline = vocalRows.some((row, rowIndex) => row.translation || rowTranslations[rowIndex]);
			const stackPhonetic = !hasRowPhoneticSubline && typeof phonetic === "string" ? phonetic.trim() : "";
			const stackTranslation = !hasRowTranslationSubline && typeof translation === "string" ? translation.trim() : "";
			const culturalAnnotationsByRow = vocalRows.map(() => []);
			for (const annotation of culturalAnnotations || []) {
				const matchingRowIndex = vocalRowRenderData.findIndex(({ line: rowLine }) =>
					annotation.expression &&
					getCopyableText(rowLine.originalText || rowLine.text).includes(annotation.expression)
				);
				const rowIndex = matchingRowIndex >= 0 ? matchingRowIndex : vocalRows.length - 1;
				culturalAnnotationsByRow[rowIndex].push(annotation);
			}
			return { rowPhonetics, rowTranslations, stackPhonetic, stackTranslation, culturalAnnotationsByRow };
		}, [vocalRows, vocalRowRenderData, phonetic, translation, culturalAnnotations, settingsRevision]);

	  if (vocalRows) {
			const { rowPhonetics, rowTranslations, stackPhonetic, stackTranslation, culturalAnnotationsByRow } = vocalAuxiliaryData;
			  const stackChildren = vocalRows.map((row, rowIndex) => {
	                  const rowRenderData = vocalRowRenderData[rowIndex];
				const rowLine = rowRenderData.line;
				const rowHasInlineEffects = rowRenderData.hasInlineEffects;
	                  const classParts = [
	                          "lyrics-karaoke-part",
	                          row.role === "background" ? "background" : "lead",
							  ...(rowHasInlineEffects ? [] : getKaraokeKindClassParts(row.kind || "vocal")),
	                          shouldUseVocalRowAnchor && rowIndex === activeVocalRowIndex ? "active-vocal-row" : "",
	                          row.speakerClass ? `speaker-${row.speakerClass}` : "",
	                  ].filter(Boolean);
				const rowPhonetic = row.phonetic || rowPhonetics[rowIndex] || "";
				const rowTranslation = row.translation || rowTranslations[rowIndex] || "";
				const rowPhoneticUnits = row.phoneticUnits ? getPhoneticFillUnits(row.phoneticUnits, rowPhonetic) : null;
				const rowPosition = getKaraokeVocalRowRenderPosition(rowRenderData, position);

				return react.createElement(
	                          "span",
	                          {
	                                  key: row.key || rowIndex,
	                                  className: classParts.join(" "),
	                                  style: row.speakerStyle,
	                                  "data-karaoke-vocal-row-index": rowIndex,
	                          },
	                          react.createElement("span", { className: "lyrics-vocal-main" }, react.createElement(KaraokeLine, {
	                                  line: rowLine,
	                                  position: rowPosition,
						isActive,
						isEffectFocused,
						isEffectLive,
						settingsRevision,
						culturalAnnotations: culturalAnnotationsByRow[rowIndex],
						renderGranularity,
						...(vocalRowLivePositionMaps ? { liveClock, livePositionMap: vocalRowLivePositionMaps[rowIndex] } : {}),
						})),
					rowPhonetic && react.createElement(
						"span",
						{ className: "lyrics-lyricsContainer-LyricsLine-phonetic lyrics-karaoke-part-subline" },
						rowPhoneticUnits ? react.createElement(PhoneticFillText, {
							units: rowPhoneticUnits,
							position: rowPosition,
							active: isActive,
							...(vocalRowLivePositionMaps ? { liveClock, livePositionMap: vocalRowLivePositionMaps[rowIndex] } : {}),
						}) : rowPhonetic
					),
					rowTranslation && react.createElement(
						"span",
						{ className: "lyrics-lyricsContainer-LyricsLine-translation lyrics-karaoke-part-subline" },
						rowTranslation
					)
				);
			});

			if (stackPhonetic) {
				stackChildren.push(react.createElement(
					"span",
					{ key: "stack-phonetic", className: "lyrics-lyricsContainer-LyricsLine-phonetic lyrics-karaoke-part-subline lyrics-karaoke-stack-subline" },
					stackPhonetic
				));
			}

			if (stackTranslation) {
				stackChildren.push(react.createElement(
					"span",
					{ key: "stack-translation", className: "lyrics-lyricsContainer-LyricsLine-translation lyrics-karaoke-part-subline lyrics-karaoke-stack-subline" },
					stackTranslation
				));
			}

	          return react.createElement(
	                  "span",
	                  {
	                          className: "lyrics-karaoke-stack",
	                          "data-karaoke-vocal-row-count": vocalRows.length,
	                          "data-karaoke-vocal-anchor-position": shouldUseVocalRowAnchor && activeVocalAnchorPosition >= 0
	                                  ? activeVocalAnchorPosition
	                                  : undefined,
	                          "data-karaoke-vocal-anchor-window-ms": Number.isFinite(activeVocalAnchorWindowMs)
	                                  ? Math.round(activeVocalAnchorWindowMs)
	                                  : undefined,
	                          "data-active-karaoke-vocal-row-index": shouldUseVocalRowAnchor ? activeVocalRowIndex : undefined,
	                  },
	                  stackChildren
	          );
	  }

		const furiganaEnabled = getVisualSettings()?.["furigana-enabled"] === true;
		const furiganaReady = isFuriganaReady();
		// The active row renders at the playback clock rate; scan the readings in
		// place instead of copying them into a new array on every render.
		let hasCharReadings = false;
		if (charReadings instanceof Map) {
			for (const entry of charReadings.values()) {
				if (typeof entry === 'string' ? entry : entry?.text) {
					hasCharReadings = true;
					break;
				}
			}
		}
		const expressiveMotion = isKaraokeExpressiveMotionEnabled();
		const { furiganaMap, timedChars, motionProfiles, endTime, wrapByWord, preferWhitespaceWrap, textDirection, useTextRun, preserveInlineStyles, timedText, wordStartTimes, wordRenderCache, textRunSegments, hasInlinePresentation } = useMemo(() => {
			const sourceSyllables = Array.isArray(line.syllables) && line.syllables.length > 0
				? line.syllables
				: getTimedSyllablesFromLine(line);
			const rawLineText = sourceSyllables.map((syllable) => syllable?.text || "").join("")
				|| getCopyableText(line.originalText ?? line.text)
				|| "";
			const processedText = furiganaMapOverride instanceof Map
				? ""
				: applyFurigana(rawLineText);
			const compensatedTimedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line));
			const detectedTextDirection = getKaraokeTextDirection(rawLineText);

			const renderTimedChars = wordTimed
				? assignKaraokeWordIndexes(compensatedTimedChars, line.karaokeGranularity === "word", lyricsLocale)
				: compensatedTimedChars;
			const useTextRun = shouldUseKaraokeTextRun(rawLineText);
			const preserveInlineStyles = !KARAOKE_JOINING_SCRIPT_REGEX.test(rawLineText);
			const wordStartTimes = new Map();
			if (wordTimed) {
				renderTimedChars.forEach((charInfo) => {
					const wordIndex = Number.isInteger(charInfo?.karaokeWordIndex) ? charInfo.karaokeWordIndex : null;
					const startTime = Number.isFinite(charInfo?.karaokeFillStartTime) ? charInfo.karaokeFillStartTime : charInfo?.startTime;
					if (wordIndex !== null && Number.isFinite(startTime)) {
						wordStartTimes.set(wordIndex, Math.min(wordStartTimes.get(wordIndex) ?? Infinity, startTime));
					}
				});
			}

			return {
				furiganaMap: furiganaMapOverride instanceof Map
					? furiganaMapOverride
					: buildKaraokeFuriganaMap(processedText),
				timedChars: renderTimedChars,
				motionProfiles: renderTimedChars.map((_, index) => getKaraokeMotionProfile(renderTimedChars, index)),
				endTime: compensatedTimedChars.reduce(
					(maxEndTime, charInfo) => Math.max(maxEndTime, Number.isFinite(charInfo?.endTime) ? charInfo.endTime : 0),
					getKaraokeLineBounds(line).endTime
				),
				wrapByWord: shouldWrapKaraokeByWord(rawLineText, expressiveMotion ? KARAOKE_EXPRESSIVE_MOTION_STYLE : null),
				preferWhitespaceWrap: shouldPreferKaraokeWhitespaceWrap(rawLineText),
				textDirection: detectedTextDirection,
				useTextRun,
				preserveInlineStyles,
				hasInlinePresentation: preserveInlineStyles && renderTimedChars.some(charInfo => charInfo?.inlineStyle === true),
				timedText: renderTimedChars.map(charInfo => String(charInfo?.char || "")).join(""),
				wordStartTimes,
				wordRenderCache: new Map(),
				textRunSegments: useTextRun
					? buildKaraokeTextRunSegments(renderTimedChars, wordTimed, preserveInlineStyles).map(segment => segment.type === "space" ? segment : ({
						...segment,
						charCount: Number.isFinite(segment.charCount) ? segment.charCount : splitKaraokeGraphemes(segment.text).length,
						textDirection: getKaraokeTextDirection(segment.text) || detectedTextDirection,
					}))
					: null,
			};
		}, [line, furiganaEnabled, furiganaReady, furiganaMapOverride, wordTimed, lyricsLocale, settingsRevision, expressiveMotion,
			getSegmenter()?.segmentGraphemes, getSegmenter()?.segmentRanges,
			getWordSegmentBuilder()]);
		const configuredCreatorColorsEnabled = getVisualSettings()?.["sync-data-custom-speaker-colors-enabled"] !== false;
		const inlineCreatorColorsEnabled = hasInlinePresentation
			? (speakerColors?.isCreatorColorEnabled?.() ?? configuredCreatorColorsEnabled) : false;
		const inlineTextEffectsEnabled = getVisualSettings()?.["karaoke-text-effects"] !== false;
		const inlineReducedMotion = hasInlinePresentation && prefersReducedLyricsMotion();
		const presentationCaches = useMemo(() => ({
			characters: hasInlinePresentation ? new Map() : null,
			textRuns: hasInlinePresentation ? new Map() : null,
		}), [
			timedChars, hasInlinePresentation, settingsRevision, configuredCreatorColorsEnabled, inlineCreatorColorsEnabled,
			inlineTextEffectsEnabled, inlineReducedMotion, speakerColors, speakerColors?.getPresentation,
			speakerColors?.isCreatorColorEnabled, speakerColors?.[PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT],
			speakerColors?.[PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT]?.getClassName,
		]);
		// Keep completed glyphs on the active paint path while the parent line fades
		// out. Gating this by isActive made the fill disappear in a single frame at
		// every line hand-off.
		const isComplete = endTime > 0 && position >= endTime;
		const wordStack = useKaraokeWordStackSupplements({ line, timedChars, timedText, wordTimed, settingsRevision });
		// Word stacks need per-word DOM nodes; the string-based text-run fast path
		// cannot host them, so stacked lines use the glyph/word path instead.
		const effectiveUseTextRun = useTextRun && (!wordStack || hasCharReadings);
		const textRunReadings = useMemo(() => effectiveUseTextRun
			? buildKaraokeTextRunReadings(timedChars, textRunSegments, charReadings) : null,
			[effectiveUseTextRun, timedChars, textRunSegments, charReadings]);
		const { culturalMarkersByCharIndex, fallbackCulturalAnnotations } = useMemo(() => getKaraokeCulturalMarkers({
			culturalAnnotations, timedChars, timedText, useTextRun: effectiveUseTextRun,
		}), [timedChars, timedText, effectiveUseTextRun, culturalAnnotations, settingsRevision]);
		// Put markers beside the timed glyph. Wrapping just an annotated glyph
		// replaces its DOM node and interrupts the live painter when notes arrive.
		const charMarkers = useMemo(() => culturalMarkersByCharIndex.size
			? new Map(Array.from(culturalMarkersByCharIndex, ([index, annotations]) => [
				index, annotations.map(({ marker }) => react.createElement("sup", {
					key: `karaoke-cultural-marker-${index}-${marker}`,
					className: "lyrics-cultural-marker",
				}, `[${marker}]`)),
			]))
			: null, [culturalMarkersByCharIndex]);
		// Retain only the latest output per glyph. Timing still runs at the chosen
		// cadence, while unchanged fill/release values reuse their complete subtree.
		const glyphElementCache = useMemo(() => [], [timedChars, furiganaMap, charReadings]);
		// Expressive springs keep moving after a glyph's fill ends, so they are
		// scheduled until their settle window closes.
		const expressiveUnits = useMemo(() => expressiveMotion && !wordTimed && !effectiveUseTextRun
			? classifyKaraokeExpressiveUnits(timedChars, wrapByWord)
			: null, [timedChars, expressiveMotion, wordTimed, effectiveUseTextRun, wrapByWord]);
		const glyphMotionProfiles = useMemo(() => expressiveUnits
			? timedChars.map((charInfo, index) => {
				const glyphWindow = getKaraokeExpressiveGlyphWindow(charInfo);
				// Glyphs of a word that moves as one unit only need fill updates.
				return glyphWindow && expressiveUnits.charModes[index] !== "word"
					? { ...glyphWindow, releaseDuration: KARAOKE_EXPRESSIVE_SETTLE_MS }
					: null;
			})
			: motionProfiles, [timedChars, motionProfiles, expressiveUnits]);
		const glyphUpdates = useMemo(() => effectiveUseTextRun ? null
			: prepareKaraokeGlyphUpdates(timedChars, glyphMotionProfiles, wordTimed, wordStartTimes),
			[timedChars, glyphElementCache, effectiveUseTextRun, glyphMotionProfiles]);
		const liveLineData = useMemo(() => livePaint ? {
			timedChars,
			motionProfiles,
			wordTimed,
			segmentsByStart: effectiveUseTextRun && Array.isArray(textRunSegments)
				? new Map(textRunSegments.filter((segment) => segment.type !== "space")
					.map((segment) => [segment.startIndex, segment]))
				: null,
			// Expressive springs run in the painter, once per display frame.
			...(expressiveMotion ? { expressive: true, expressiveUnits } : {}),
		} : null, [livePaint, timedChars, motionProfiles, wordTimed, effectiveUseTextRun, textRunSegments, expressiveMotion, expressiveUnits]);
		liveDataRef.current = liveLineData;
		const wrapperElementCache = useMemo(() => new Map(), [timedChars, presentationCaches]);
		const glyphBounceEnabled = !wordTimed && getVisualSettings()["karaoke-bounce"] && Number.isFinite(position);

		const renderChar = (charInfo, index) => {
			const wordIndex = Number.isInteger(charInfo?.karaokeWordIndex)
				? charInfo.karaokeWordIndex
				: null;
			const wordStartTime = wordIndex === null ? null : wordStartTimes.get(wordIndex);
			const fillStartTime = Number.isFinite(charInfo?.karaokeFillStartTime) ? charInfo.karaokeFillStartTime : charInfo.startTime;
			const fillEndTime = Number.isFinite(charInfo?.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo.endTime;
			// Live glyphs get their fill per display frame; React only keeps the state.
			const liveFill = livePaint && !wordTimed;
			const fillRatio = wordTimed
				? getKaraokeInstantWordFill(
					{ startTime: Number.isFinite(wordStartTime) ? wordStartTime : charInfo?.startTime },
					position,
					isActive,
					isComplete
				) / 100
				: liveFill ? NaN : getKaraokeCharFill(position, isActive, fillStartTime, fillEndTime, isComplete);
			const charState = liveFill
				? getKaraokeLiveState(position, fillStartTime, fillEndTime, isComplete)
				: fillRatio <= 0 ? "pending" : fillRatio >= 1 ? "done" : "active";
			const motionProfile = motionProfiles[index];
			const expressiveMode = expressiveUnits ? expressiveUnits.charModes[index] : null;
			const expressiveProfile = expressiveMode && expressiveMode !== "word" ? glyphMotionProfiles[index] : null;
			const bounce = expressiveMode === "word"
				? KARAOKE_BOUNCE_IDLE
				: expressiveProfile
				? (liveFill
					? getKaraokeExpressivePhase(position, expressiveProfile.startTime, expressiveProfile.endTime)
					: getKaraokeExpressiveMotion(charInfo, position, expressiveProfile.startTime, expressiveProfile.endTime,
						expressiveMode === "emphasis"
							|| isKaraokeExpressiveEmphasisUnit(expressiveProfile.startTime, expressiveProfile.endTime)))
				: !glyphBounceEnabled || !motionProfile
				|| position < motionProfile.startTime
				|| position >= motionProfile.endTime + motionProfile.releaseDuration
				? KARAOKE_BOUNCE_IDLE : getKaraokeBounceValues(
				position,
				isActive,
				fillStartTime,
				fillEndTime,
				1,
				motionProfile
			);
			const charReadingEntry = (charReadings instanceof Map && charReadings.get(index)) || null;
			const charReading = typeof charReadingEntry === 'string' ? charReadingEntry : (charReadingEntry?.text || '');
			const charReadingDx = (charReadingEntry && typeof charReadingEntry === 'object' && Number.isFinite(charReadingEntry.dx)) ? charReadingEntry.dx : 0;
			const cachedGlyph = glyphElementCache[index];
			if (cachedGlyph && cachedGlyph.live === livePaint && cachedGlyph.isComplete === isComplete
				&& (livePaint
					? cachedGlyph.charState === charState
					: cachedGlyph.fillRatio === fillRatio && cachedGlyph.offsetY === bounce.offsetY
						&& cachedGlyph.scale === bounce.scale && cachedGlyph.glow === bounce.glow)
				&& cachedGlyph.bouncing === bounce.active
				&& cachedGlyph.reading === charReading && cachedGlyph.readingDx === charReadingDx) {
				return cachedGlyph.element;
			}
			const karaokeStyle = {};
			if (charState === "active" && !livePaint) {
				const fillValue = Math.max(0, Math.min(100, fillRatio * 100));
				const softEdge = getKaraokeFillSoftEdge(fillValue, 16);
				karaokeStyle["--karaoke-char-fill"] = `${fillValue}%`;
				karaokeStyle["--karaoke-char-fill-soft-start"] = `${Math.max(0, fillValue - softEdge)}%`;
				karaokeStyle["--karaoke-char-fill-soft-end"] = `${Math.min(100, fillValue + softEdge)}%`;
			}
			if (bounce.active && !livePaint) {
				karaokeStyle["--karaoke-bounce-y"] = `${bounce.offsetY}${bounce.unit || "px"}`;
				karaokeStyle["--karaoke-bounce-scale"] = bounce.scale;
				karaokeStyle["--karaoke-motion-glow"] = bounce.glow;
			}
			const liveKey = liveFill ? { [KARAOKE_LIVE_ATTRIBUTE]: `g:${index}` } : null;
			const className = getCachedKaraokeStateClassName(
				KARAOKE_CHAR_STATE_CLASS_NAMES,
				charState,
				bounce.active,
				isComplete
			);
			const charNode = charReading
			? react.createElement(
				"span",
				{
					className,
					style: karaokeStyle,
					"data-outline-text": charInfo.char,
					key: `karaoke-char-${index}`,
					...liveKey,
				},
				react.createElement(
					"span",
					{ className: "lyrics-karaoke-glyph-fill" },
					charInfo.char
				),
				react.createElement(
					"span",
					charReadingDx
						? { className: "lyrics-karaoke-char-reading", style: { transform: `translateX(calc(-50% + ${charReadingDx}px))` } }
						: { className: "lyrics-karaoke-char-reading" },
					charReading
				)
			)
			: react.createElement(
				"span",
				{
					className,
					style: karaokeStyle,
					"data-outline-text": charInfo.char,
					key: `karaoke-char-${index}`,
					...liveKey,
				},
				react.createElement(
					"span",
					{ className: "lyrics-karaoke-glyph-fill" },
					charInfo.char
				)
			);
			const reading = furiganaMap.get(index);

			const renderedCharNode = reading
				? react.createElement(
					"ruby",
					{
						className: `lyrics-karaoke-ruby lyrics-karaoke-ruby--${charState}`,
						style: karaokeStyle,
						key: `karaoke-ruby-${index}`,
						...liveKey,
					},
					charNode,
					react.createElement("rt", null, reading)
				)
				: charNode;
			glyphElementCache[index] = {
				live: livePaint, charState, fillRatio, isComplete, offsetY: bounce.offsetY, scale: bounce.scale,
				glow: bounce.glow, bouncing: bounce.active, reading: charReading, readingDx: charReadingDx, element: renderedCharNode,
			};
			return renderedCharNode;
		};
		let charElements = effectiveUseTextRun ? [] : glyphUpdates.elements;
		if (glyphUpdates) {
			const updates = getKaraokeGlyphUpdates(glyphUpdates, position, isComplete);
			if (updates === null) {
				charElements = timedChars.map(renderChar);
			} else {
				for (const index of updates) {
					const element = renderChar(timedChars[index], index);
					if (element === charElements[index]) continue;
					// Never mutate the child array retained by an earlier React tree.
					if (charElements === glyphUpdates.elements) charElements = charElements.slice();
					charElements[index] = element;
				}
			}
			glyphUpdates.elements = charElements;
		}
		const lineChildren = effectiveUseTextRun
			? buildKaraokeTextRunElements(
				timedChars,
				position,
				isActive,
				isComplete,
				textDirection,
				wordTimed,
				preserveInlineStyles,
				textRunSegments,
				presentationCaches.textRuns,
				wrapperElementCache,
				livePaint,
				textRunReadings,
				expressiveMotion ? KARAOKE_EXPRESSIVE_MOTION_STYLE : null,
				preferWhitespaceWrap
			)
			: (wrapByWord || wordTimed)
			? buildKaraokeWordElements(timedChars, charElements, {
				position,
				isActive,
				isComplete,
				wordTimed,
				wordRenderCache,
				charMarkers,
				presentationCache: presentationCaches.characters,
				elementCache: wrapperElementCache,
				wordSupplementByKey: wordStack?.supplementByKey || null,
				livePaint,
				motionStyle: expressiveMotion ? KARAOKE_EXPRESSIVE_MOTION_STYLE : null,
				expressiveWordStarts: expressiveUnits?.wordStarts || null,
				preferWhitespaceWrap,
			})
			: wrapKaraokeInlineStyleRuns(timedChars, charElements, {
				charMarkers,
				presentationCache: presentationCaches.characters,
				elementCache: wrapperElementCache,
			});

		return react.createElement(
			"span",
			{
				className: `lyrics-karaoke-line${wrapByWord || wordTimed || effectiveUseTextRun ? " has-word-wrap" : ""}${wordTimed ? " is-word-timed" : ""}${effectiveUseTextRun ? " is-text-run" : ""}${wordStack ? " has-word-stack" : ""}${wordStack?.hasReading ? " has-word-stack-readings" : ""}${textDirection === "rtl" ? " is-rtl" : ""}${isActive ? " is-active" : ""}${isEffectLive ? " is-effect-live" : ""}${isEffectFocused ? " is-effect-focused" : ""}${isComplete ? " is-complete" : ""}${hasCharReadings ? " has-char-readings" : ""}${Number(getVisualSettings()?.["original-outline-width"]) > 0 ? " has-glyph-outline" : ""}${expressiveMotion ? " is-motion-expressive" : ""}`,
				dir: effectiveUseTextRun ? (textDirection === "rtl" ? "ltr" : textDirection) : undefined,
				...(livePaint ? { ref: liveRootRef } : {}),
			},
			lineChildren,
			fallbackCulturalAnnotations.map((annotation) => react.createElement(
					"sup",
					{
						key: `karaoke-cultural-fallback-${annotation.marker}`,
						className: "lyrics-cultural-marker",
					},
					`[${annotation.marker}]`
				))
		);
	});
	return KaraokeLine;
}
