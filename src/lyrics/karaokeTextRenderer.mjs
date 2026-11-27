import {
	getKaraokeTextDirection, needsKaraokeJoiningScript, shouldWrapKaraokeByWord,
} from "./karaokeTextDirection.mjs";
import { getKaraokeFillSteps, getKaraokeFillSoftEdge } from "./karaokeFill.mjs";
import {
	getKaraokeExpressiveUnitRanges, getKaraokeExpressiveWordWindow, getKaraokeMotionProfile,
} from "./karaokeMotion.mjs";

export function createKaraokeTextRenderer({
	react, getKaraokeKindClassParts, getKaraokeInlineSpeakerClass, getKaraokeSpeakerStyle,
	splitKaraokeGraphemes, buildSharedWordSegments, applyKaraokeFillCorrectionCurve, motion,
}) {
	const { getKaraokeBounceValues, getKaraokeWordBounceValues, getKaraokeExpressiveMotion, getKaraokeExpressivePhase } = motion;
	const KARAOKE_COMPLEX_GRAPHEME_REGEX = /[\p{M}\u200C\u200D]/u;

	const shouldUseKaraokeTextRun = (text) => {
		const normalizedText = typeof text === "string" ? text : "";
		return needsKaraokeJoiningScript(normalizedText) || KARAOKE_COMPLEX_GRAPHEME_REGEX.test(normalizedText);
	};

	const shouldPreferKaraokeWhitespaceWrap = (text) => (
		/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)
		&& shouldWrapKaraokeByWord(text)
	);

	// Source timing units control fill/motion, not line breaks. Keep the units
	// between two explicit spaces together, including when a provider times each
	// CJK character separately. The CSS width limit still lets long groups wrap.
	const createKaraokeWhitespaceWrapBuilder = (elements, elementCache) => {
		let children = [];
		let startIndex = 0;
		const flush = () => {
			if (children.length === 0) return;
			if (children.length === 1) {
				elements.push(children[0]);
			} else {
				const key = `karaoke-whitespace-${startIndex}`;
				const cached = elementCache?.get(key);
				if (cached && cached.children.length === children.length
					&& children.every((child, index) => child === cached.children[index])) {
					elements.push(cached.element);
				} else {
					const element = react.createElement("span", {
						className: "lyrics-karaoke-wrap-group", key,
					}, children);
					elementCache?.set(key, { children, element });
					elements.push(element);
				}
			}
			children = [];
		};
		return {
			push(element, isSpace, index) {
				if (isSpace) {
					flush();
					elements.push(element);
				} else {
					if (children.length === 0) startIndex = index;
					children.push(element);
				}
			},
			flush,
		};
	};

	const KARAOKE_TEXT_RUN_STATE_CLASS_NAMES = {
		pending: [
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending is-complete",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending is-bouncing",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending is-bouncing is-complete",
		],
		active: [
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active is-complete",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active is-bouncing",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active is-bouncing is-complete",
		],
		done: [
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done is-complete",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done is-bouncing",
			"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done is-bouncing is-complete",
		],
	};

	const KARAOKE_WHITESPACE_CHAR_REGEX = /\s/u;

	const getCachedKaraokeStateClassName = (classNames, state, isBouncing, isComplete) => (
		classNames[state][(isBouncing ? 2 : 0) + (isComplete ? 1 : 0)]
	);

	const getKaraokeInlineStylePresentation = (charInfo) => {
		if (charInfo?.inlineStyle !== true) return null;

		const kind = String(charInfo?.styleKind || "").trim().toLowerCase();
		const kindClasses = getKaraokeKindClassParts(kind);
		const speakerClass = getKaraokeInlineSpeakerClass(
			charInfo?.styleSpeaker,
			charInfo?.styleSpeakerColor,
			charInfo?.styleSpeakerFallback
		);
		if (kindClasses.length === 0 && !speakerClass) return null;

		return {
			key: [
				kindClasses.join(" "),
				speakerClass,
				String(charInfo?.styleSpeakerColor || "").trim().toLowerCase(),
				String(charInfo?.styleSpeakerFallback || "").trim().toUpperCase(),
			].join("|"),
			className: [
				"ivlyrics-karaoke-range-style",
				...kindClasses,
				speakerClass ? `speaker-${speakerClass}` : "",
			].filter(Boolean).join(" "),
			style: getKaraokeSpeakerStyle(
				charInfo?.styleSpeaker,
				charInfo?.styleSpeakerColor,
				charInfo?.styleSpeakerFallback
			),
		};
	};

	const KARAOKE_INLINE_STYLE_MAX_RUN_LENGTH = 12;

	const wrapKaraokeInlineStyleRuns = (
		timedChars,
		elements,
		{ keyPrefix = "karaoke-inline-style", sourceIndexOffset = 0, presentationCache = null, elementCache = null, charMarkers = null } = {}
	) => {
		if (!Array.isArray(timedChars)
			|| !Array.isArray(elements)
			|| timedChars.length !== elements.length
			|| timedChars.length === 0) {
			return elements;
		}

		const result = [];
		let run = null;
		const flush = () => {
			if (!run) return;
			if (!run.presentation) {
				result.push(...run.elements);
			} else {
				const key = `${keyPrefix}-${sourceIndexOffset + run.startIndex}`;
				const cached = elementCache?.get(key);
				if (cached && cached.presentation === run.presentation
					&& cached.children.length === run.elements.length
					&& run.elements.every((element, index) => element === cached.children[index])) {
					result.push(cached.element);
					run = null;
					return;
				}
				const element = react.createElement(
					"span",
					{
						className: run.presentation.className,
						style: {
							...run.presentation.style,
							"--ivlyrics-range-index": sourceIndexOffset + run.startIndex,
						},
						key,
					},
					run.elements
				);
				elementCache?.set(key, { presentation: run.presentation, children: run.elements, element });
				result.push(element);
			}
			run = null;
		};

		for (let index = 0; index < timedChars.length; index += 1) {
			const sourceIndex = sourceIndexOffset + index;
			// The owning line replaces this cache when source data or presentation
			// settings change. Clock ticks only need the already resolved style.
			if (presentationCache && timedChars[index]?.inlineStyle === true && !presentationCache.has(sourceIndex)) {
				presentationCache.set(sourceIndex, getKaraokeInlineStylePresentation(timedChars[index]));
			}
			const presentation = presentationCache
				? presentationCache.get(sourceIndex) || null
				: getKaraokeInlineStylePresentation(timedChars[index]);
			const styleKey = presentation?.key || "";
			if (!run
				|| run.styleKey !== styleKey
				|| index - run.startIndex >= KARAOKE_INLINE_STYLE_MAX_RUN_LENGTH) {
				flush();
				run = {
					styleKey,
					presentation,
					startIndex: index,
					elements: [],
				};
			}
			run.elements.push(elements[index]);
			const markers = charMarkers?.get(sourceIndex);
			if (markers) run.elements.push(...markers);
		}
		flush();
		return result;
	};

	const buildKaraokeWordElements = (
		timedChars,
		charElements,
		{ position = 0, isActive = false, isComplete = false, wordTimed = false, wordRenderCache = null, presentationCache = null, elementCache = null, wordSupplementByKey = null, livePaint = false, motionStyle = null, expressiveWordStarts = null, preferWhitespaceWrap = false, charMarkers = null } = {}
	) => {
		if (!Array.isArray(timedChars) || !Array.isArray(charElements) || timedChars.length !== charElements.length) {
			return charElements;
		}

		const getWordSupplement = (wordKey) => {
			if (!wordSupplementByKey || wordKey === null || wordKey === undefined) return null;
			const supplement = wordSupplementByKey.get(wordKey);
			if (!supplement) return null;
			const gloss = String(supplement.gloss || "").trim();
			const reading = String(supplement.reading || "").trim();
			if (!gloss && !reading) return null;
			return { gloss, reading };
		};

		const wordElements = [];
		const whitespaceWrap = preferWhitespaceWrap ? createKaraokeWhitespaceWrapBuilder(wordElements, elementCache) : null;
		const appendWords = (...elements) => {
			for (const element of elements) {
				if (whitespaceWrap) whitespaceWrap.push(element, false, currentWordStart);
				else wordElements.push(element);
			}
		};
		let currentWord = [];
		let currentWordStart = 0;
		let currentWordUnit = null;
		const timedCharCount = timedChars.length;
		const buildWord = (wordStart, wordChildren, wordUnit, { nestedWords = null, withSupplement = true } = {}) => {
			const supplement = withSupplement ? getWordSupplement(wordUnit) : null;
			// Stack mode covers the whole line: words without annotations still
			// get the stack wrapper so their geometry matches stacked siblings.
			// (A bare word would align by baseline while stacks align by top.)
			const wantStack = withSupplement && wordSupplementByKey instanceof Map;
			// The line owns this cache, so source timing changes replace it while
			// playback only recomputes the word's visible motion.
			const cacheKey = `${wordStart}:${wordChildren.length}`;
			let wordData = wordRenderCache?.get(cacheKey);
			if (!wordData) {
				const wordChars = timedChars.slice(wordStart, wordStart + wordChildren.length);
				wordData = {
					wordChars,
					startTime: wordChars.reduce((minimum, charInfo) => {
						const value = Number.isFinite(charInfo?.karaokeFillStartTime)
							? charInfo.karaokeFillStartTime
							: charInfo?.startTime;
						return Number.isFinite(value) ? Math.min(minimum, value) : minimum;
					}, Infinity),
					endTime: wordChars.reduce((maximum, charInfo) => {
						const value = Number.isFinite(charInfo?.karaokeFillEndTime)
							? charInfo.karaokeFillEndTime
							: charInfo?.endTime;
						return Number.isFinite(value) ? Math.max(maximum, value) : maximum;
					}, -Infinity),
				};
				wordRenderCache?.set(cacheKey, wordData);
			}
			const { wordChars } = wordData;
			const { startTime, endTime } = motionStyle === "expressive" && wordTimed
				? (wordData.expressiveWindow ??= getKaraokeExpressiveWordWindow(timedChars, wordStart, wordChildren.length, true))
				: wordData;
			// In expressive mode a character-timed word can also move as one unit.
			const expressiveUnit = !nestedWords && motionStyle === "expressive" && !wordTimed
				&& expressiveWordStarts?.has(wordStart) === true;
			// Live rows receive bounce values from KaraokeLivePainter; only the
			// discrete bouncing state belongs to the element here.
			const movingWordTimed = wordTimed && !nestedWords;
			const livePaintWord = livePaint && (movingWordTimed || expressiveUnit);
			const bounce = (movingWordTimed || expressiveUnit) && Number.isFinite(startTime) && Number.isFinite(endTime)
				? (motionStyle === "expressive"
					? (livePaintWord
						? getKaraokeExpressivePhase(position, startTime, endTime)
						: getKaraokeExpressiveMotion(wordData, position, startTime, endTime, false))
					: getKaraokeWordBounceValues(position, isActive, startTime, endTime, 1,
						getKaraokeMotionProfile(timedChars, wordStart, wordChildren.length)))
				: { active: false };
			const restPending = bounce.rest === "pending";
			const children = nestedWords || wordChildren;
			const cachedWord = wordData.output;
			if (cachedWord && cachedWord.live === livePaintWord
				&& cachedWord.wordTimed === movingWordTimed && cachedWord.isComplete === isComplete
				&& cachedWord.presentationCache === presentationCache
				&& cachedWord.charMarkers === charMarkers
				&& (livePaintWord || (cachedWord.offsetY === bounce.offsetY && cachedWord.scale === bounce.scale
					&& cachedWord.glow === bounce.glow)) && cachedWord.bouncing === bounce.active
				&& cachedWord.restPending === restPending
				&& cachedWord.expressiveUnit === expressiveUnit
				&& cachedWord.stacked === wantStack
				&& cachedWord.gloss === (supplement?.gloss || "") && cachedWord.reading === (supplement?.reading || "")
				&& cachedWord.children.length === children.length
				&& children.every((element, index) => element === cachedWord.children[index])) {
				return cachedWord.element;
			}
			const style = bounce.active && !livePaintWord ? {
				"--karaoke-bounce-y": `${bounce.offsetY}${bounce.unit || "px"}`,
				"--karaoke-bounce-scale": bounce.scale,
				"--karaoke-motion-glow": bounce.glow,
			} : undefined;
			const styledWordElements = nestedWords || wrapKaraokeInlineStyleRuns(wordChars, wordChildren, {
				keyPrefix: "karaoke-word-inline-style",
				sourceIndexOffset: wordStart,
				presentationCache,
				elementCache,
				charMarkers,
			});
			const wordMain = react.createElement(
				"span",
				{
					className: `lyrics-karaoke-word${movingWordTimed ? " is-word-timed" : ""}${expressiveUnit ? " is-expressive-unit" : ""}${bounce.active ? " is-bouncing" : ""}${restPending ? " is-expressive-pending" : ""}${isComplete ? " is-complete" : ""}`,
					style,
					key: `karaoke-word-${wordStart}`,
					...(livePaintWord ? { "data-karaoke-live": `w:${wordStart}:${wordChildren.length}` } : {}),
				},
				styledWordElements
			);
			let element = wordMain;
			if (wantStack) {
				// Requested stack order: original word, per-word gloss, per-word
				// reading. Annotations are static (no karaoke fill) and hidden
				// from assistive tech to avoid duplicating the sung text.
				// Words without annotations still stack so the row stays aligned.
				const stackChildren = [wordMain];
				if (supplement?.gloss) {
					stackChildren.push(react.createElement(
						"span",
						{
							className: "lyrics-karaoke-word-gloss",
							key: `karaoke-word-gloss-${wordStart}`,
							"aria-hidden": true,
						},
						supplement.gloss
					));
				}
				if (supplement?.reading) {
					stackChildren.push(react.createElement(
						"span",
						{
							className: "lyrics-karaoke-word-reading",
							key: `karaoke-word-reading-${wordStart}`,
							"aria-hidden": true,
						},
						supplement.reading
					));
				}
				element = react.createElement(
					"span",
					{
						className: `lyrics-karaoke-word-stack${isComplete ? " is-complete" : ""}`,
						key: `karaoke-word-stack-${wordStart}`,
					},
					stackChildren
				);
			}
			wordData.output = {
				live: livePaintWord, wordTimed: movingWordTimed, isComplete, presentationCache, charMarkers, offsetY: bounce.offsetY, scale: bounce.scale,
				glow: bounce.glow, bouncing: bounce.active, restPending, expressiveUnit, children, element,
				stacked: wantStack,
				gloss: supplement?.gloss || "", reading: supplement?.reading || "",
			};
			return element;
		};
		const flushWord = () => {
			if (currentWord.length === 0) return;
			const ranges = motionStyle === "expressive"
				? getKaraokeExpressiveUnitRanges(timedChars, currentWordStart, currentWord.length)
				: null;
			if (ranges?.length > 1) {
				const parts = ranges.map(({ startIndex, charCount }) => buildWord(startIndex,
					currentWord.slice(startIndex - currentWordStart, startIndex - currentWordStart + charCount),
					currentWordUnit, { withSupplement: false }));
				// Keep one annotation stack for the source word, with independently
				// moving pieces inside it. A shared reading/gloss must not repeat.
				if (wordSupplementByKey instanceof Map) {
					appendWords(buildWord(currentWordStart, currentWord, currentWordUnit, { nestedWords: parts }));
				} else {
					appendWords(...parts);
				}
			} else {
				appendWords(buildWord(currentWordStart, currentWord, currentWordUnit));
			}
			currentWord = [];
			currentWordUnit = null;
		};

		for (let index = 0; index < timedCharCount; index++) {
			if (!(index in timedChars)) {
				continue;
			}

			const charInfo = timedChars[index];
			const char = charInfo?.char || "";
			const element = charElements[index];
			const isWhitespace = KARAOKE_WHITESPACE_CHAR_REGEX.test(char);
			const unitIndex = Number.isInteger(charInfo?.karaokeWordIndex)
				? charInfo.karaokeWordIndex
				: null;
			const unitChanged = wordTimed
				&& currentWord.length > 0
				&& unitIndex !== null
				&& currentWordUnit !== null
				&& unitIndex !== currentWordUnit;

			if (unitChanged) {
				flushWord();
			}

			if (!isWhitespace && currentWord.length === 0) {
				currentWordStart = index;
				currentWordUnit = unitIndex;
			}

			if (isWhitespace) {
				flushWord();
				const spaces = wrapKaraokeInlineStyleRuns([charInfo], [element], {
					keyPrefix: "karaoke-space-inline-style",
					sourceIndexOffset: index,
					presentationCache,
					elementCache,
					charMarkers,
				});
				for (const space of spaces) {
					if (whitespaceWrap) whitespaceWrap.push(space, true, index);
					else wordElements.push(space);
				}
				continue;
			}

			currentWord.push(element);
		}

		flushWord();
		whitespaceWrap?.flush();
		return wordElements;
	};

	const getKaraokeSegmentFill = (segment, position, isActive, isComplete) => {
		if (isComplete) {
			return 100;
		}
		if (!segment) {
			return 0;
		}

		const startTime = Number.isFinite(segment.startTime) ? segment.startTime : 0;
		const endTime = Number.isFinite(segment.endTime) ? segment.endTime : startTime;
		if (position <= startTime) {
			return 0;
		}
		if (position >= endTime) {
			return 100;
		}

		const raw = Math.max(0, Math.min(1, (position - startTime) / Math.max(1, endTime - startTime)));
		const corrected = applyKaraokeFillCorrectionCurve(raw) * 100;
		const stepSize = 100 / getKaraokeFillSteps(startTime, endTime);
		return Math.round(corrected / stepSize) * stepSize;
	};

	const getKaraokeInstantWordFill = (segment, position, isActive, isComplete) => {
		if (isComplete) return 100;
		if (!segment) return 0;
		const startTime = Number.isFinite(segment.startTime) ? segment.startTime : 0;
		return position >= startTime ? 100 : 0;
	};

	// Discrete fill state for live-painted rows. The continuous fill itself is
	// written by KaraokeLivePainter, so the state follows the source timing exactly
	// instead of the first or last rounded fill step.
	const getKaraokeLiveState = (position, startTime, endTime, isComplete) => {
		if (isComplete) return "done";
		if (!Number.isFinite(position) || position <= startTime) return "pending";
		return position >= endTime ? "done" : "active";
	};

	const buildKaraokeTextRunSegments = (timedChars, wordTimed = false, preserveInlineStyles = true) => {
		if (!Array.isArray(timedChars) || timedChars.length === 0) {
			return [];
		}
		const hasInlineStyles = preserveInlineStyles
			&& timedChars.some(charInfo => charInfo?.inlineStyle === true);
		const sharedSegments = !wordTimed && !hasInlineStyles && buildSharedWordSegments(timedChars, {
			getText: (charInfo) => charInfo?.char || "",
			getStartTime: (charInfo) => charInfo?.startTime,
			getEndTime: (charInfo) => charInfo?.endTime,
		});
		if (Array.isArray(sharedSegments)) {
			return sharedSegments;
		}

		const segments = [];
		let currentSegment = null;
		const timedCharCount = timedChars.length;

		for (let index = 0; index < timedCharCount; index++) {
			if (!(index in timedChars)) {
				continue;
			}

			const charInfo = timedChars[index];
			const char = charInfo?.char || "";
			const type = KARAOKE_WHITESPACE_CHAR_REGEX.test(char) ? "space" : "text";
			const unitIndex = Number.isInteger(charInfo?.karaokeWordIndex)
				? charInfo.karaokeWordIndex
				: null;
			const unitChanged = wordTimed
				&& type === "text"
				&& currentSegment?.type === "text"
				&& unitIndex !== null
				&& currentSegment.unitIndex !== null
				&& currentSegment.unitIndex !== unitIndex;
			const hasInlineStyle = preserveInlineStyles && charInfo?.inlineStyle === true;
			const styleKind = hasInlineStyle ? String(charInfo?.styleKind || '') : '';
			const styleSpeaker = hasInlineStyle ? String(charInfo?.styleSpeaker || '') : '';
			const styleSpeakerColor = hasInlineStyle ? String(charInfo?.styleSpeakerColor || '') : '';
			const styleSpeakerFallback = hasInlineStyle ? String(charInfo?.styleSpeakerFallback || '') : '';
			const styleChanged = currentSegment
				&& (
					currentSegment.styleKind !== styleKind
					|| currentSegment.styleSpeaker !== styleSpeaker
					|| currentSegment.styleSpeakerColor !== styleSpeakerColor
					|| currentSegment.styleSpeakerFallback !== styleSpeakerFallback
				);
			if (!currentSegment || currentSegment.type !== type || unitChanged || styleChanged) {
				if (currentSegment?.text.length > 0) {
					segments.push(currentSegment);
				}
				currentSegment = {
					type,
					unitIndex,
					startIndex: index,
					charCount: 0,
					text: "",
					startTime: Number.isFinite(charInfo?.startTime) ? charInfo.startTime : 0,
					endTime: Number.isFinite(charInfo?.endTime) ? charInfo.endTime : 0,
					styleKind,
					styleSpeaker,
					styleSpeakerColor,
					styleSpeakerFallback,
				};
			}

			currentSegment.text += char;
			currentSegment.charCount += 1;
			if (Number.isFinite(charInfo?.endTime)) {
				currentSegment.endTime = Math.max(currentSegment.endTime, charInfo.endTime);
			}
		}

		if (currentSegment?.text.length > 0) {
			segments.push(currentSegment);
		}
		return segments;
	};

	const getKaraokeTextRunPresentation = (segment) => {
		let className = "";
		let style = {};
		if (segment.styleKind || segment.styleSpeaker) {
			const kindClasses = getKaraokeKindClassParts(segment.styleKind);
			className = ` ivlyrics-karaoke-range-style${kindClasses.length ? ` ${kindClasses.join(' ')}` : ''}`;
			const speakerClass = getKaraokeInlineSpeakerClass(
				segment.styleSpeaker, segment.styleSpeakerColor, segment.styleSpeakerFallback
			);
			if (speakerClass) className += ` speaker-${speakerClass}`;
			style = getKaraokeSpeakerStyle(
				segment.styleSpeaker, segment.styleSpeakerColor, segment.styleSpeakerFallback
			);
		}
		return { className, style };
	};

	const buildKaraokeTextRunReadings = (timedChars, segments, charReadings) => {
		if (!(charReadings instanceof Map) || charReadings.size === 0) return null;
		// Editor indices count code points; shaped karaoke cells count graphemes.
		// Attach one reading to the intact run instead of splitting joining scripts.
		const offsets = [0];
		for (const charInfo of timedChars) offsets.push(offsets[offsets.length - 1] + Array.from(charInfo?.char || '').length);
		const readings = new Map();
		for (const segment of segments || []) {
			if (segment.type === 'space') continue;
			const start = offsets[segment.startIndex] ?? 0;
			const end = offsets[segment.startIndex + segment.charCount] ?? start + Array.from(segment.text || '').length;
			const parts = [];
			for (let index = start; index < end; index++) {
				const entry = charReadings.get(index);
				const text = typeof entry === 'string' ? entry : entry?.text;
				if (typeof text === 'string' && text.trim()) parts.push(text.trim());
			}
			if (parts.length) readings.set(segment.startIndex, parts.join(' '));
		}
		return readings.size ? readings : null;
	};

	const buildKaraokeTextRunElements = (
		timedChars,
		position,
		isActive,
		isComplete,
		textDirection,
		wordTimed = false,
		preserveInlineStyles = true,
		preparedSegments = null,
		presentationCache = null,
		elementCache = null,
		livePaint = false,
		readings = null,
		motionStyle = null,
		preferWhitespaceWrap = false
	) => {
		const segments = preparedSegments || buildKaraokeTextRunSegments(timedChars, wordTimed, preserveInlineStyles);
		const renderSegments = textDirection === "rtl" ? [...segments].reverse() : segments;
		const expressiveMotion = motionStyle === "expressive";

		const elements = renderSegments.map((segment) => {
			if (segment.type === "space") {
				const cached = elementCache?.get(segment);
				if (cached) return cached.element;
				const element = react.createElement(
					"span",
					{
						className: "lyrics-karaoke-text-run-space",
						key: `karaoke-text-run-space-${segment.startIndex}`,
					},
					segment.text
				);
				elementCache?.set(segment, { element });
				return element;
			}

			const segmentDirection = segment.textDirection || getKaraokeTextDirection(segment.text) || textDirection;
			// Shaped runs (including Latin combining marks and ligatures) keep the
			// same text node, source fill window, readings and selection range.
			// Live rows paint the continuous fill and bounce per display frame.
			const liveFill = livePaint && !wordTimed;
			const fillValue = wordTimed
				? getKaraokeInstantWordFill(segment, position, isActive, isComplete)
				: liveFill ? NaN : getKaraokeSegmentFill(segment, position, isActive, isComplete);
			const gradientDirection = segmentDirection === "rtl" ? "to left" : "to right";
			const segmentState = liveFill
				? getKaraokeLiveState(position,
					Number.isFinite(segment.startTime) ? segment.startTime : 0,
					Number.isFinite(segment.endTime) ? segment.endTime : (Number.isFinite(segment.startTime) ? segment.startTime : 0),
					isComplete)
				: fillValue <= 0 ? "pending" : fillValue >= 100 ? "done" : "active";
			const segmentCharCount = Number.isFinite(segment.charCount)
				? segment.charCount
				: splitKaraokeGraphemes(segment.text).length;
			const bounce = expressiveMotion
				? (livePaint
					? getKaraokeExpressivePhase(position, segment.startTime, segment.endTime)
					: getKaraokeExpressiveMotion(segment, position, segment.startTime, segment.endTime, false))
				: getKaraokeBounceValues(position, isActive, segment.startTime, segment.endTime, 1,
					getKaraokeMotionProfile(timedChars, segment.startIndex, segmentCharCount));
			const cached = elementCache?.get(segment);
			const reading = readings?.get(segment.startIndex) || '';
			if (cached && cached.live === livePaint
				&& (livePaint ? cached.segmentState === segmentState : cached.fillValue === fillValue)
				&& cached.isComplete === isComplete
				&& cached.gradientDirection === gradientDirection && cached.wordTimed === wordTimed
				&& cached.presentationCache === presentationCache && cached.reading === reading
				&& (livePaint || (cached.offsetY === bounce.offsetY && cached.scale === bounce.scale
					&& cached.glow === bounce.glow)) && cached.bouncing === bounce.active) {
				return cached.element;
			}
			const segmentStyle = {};
			if (livePaint) {
				segmentStyle["--karaoke-gradient-direction"] = gradientDirection;
			} else if (segmentState === "active") {
				const softEdge = getKaraokeFillSoftEdge(fillValue, 10);
				segmentStyle["--karaoke-gradient-direction"] = gradientDirection;
				segmentStyle["--karaoke-char-fill"] = `${fillValue}%`;
				segmentStyle["--karaoke-char-fill-soft-start"] = `${Math.max(0, fillValue - softEdge)}%`;
				segmentStyle["--karaoke-char-fill-soft-end"] = `${Math.min(100, fillValue + softEdge)}%`;
			}
			if (bounce.active && !livePaint) {
				segmentStyle["--karaoke-bounce-y"] = `${bounce.offsetY}${bounce.unit || "px"}`;
				segmentStyle["--karaoke-bounce-scale"] = bounce.scale;
				segmentStyle["--karaoke-motion-glow"] = bounce.glow;
			}

			let segmentClassName = getCachedKaraokeStateClassName(
				KARAOKE_TEXT_RUN_STATE_CLASS_NAMES,
				segmentState,
				bounce.active,
				isComplete
			);
			if (wordTimed) segmentClassName += " is-word-timed";
			if (segment.styleKind || segment.styleSpeaker) {
				let presentation = presentationCache?.get(segment);
				if (!presentation) {
					presentation = getKaraokeTextRunPresentation(segment);
					presentationCache?.set(segment, presentation);
				}
				segmentClassName += presentation.className;
				Object.assign(segmentStyle, presentation.style);
			}
			segmentStyle['--ivlyrics-range-index'] = segment.startIndex;

			const element = react.createElement(
				"span",
				{
					className: segmentClassName,
					dir: segmentDirection,
					style: segmentStyle,
					"data-outline-text": segment.text,
					key: `karaoke-text-run-segment-${segment.startIndex}`,
					...(livePaint ? { "data-karaoke-live": `s:${segment.startIndex}` } : {}),
				},
				react.createElement(
					"span",
					{ className: "lyrics-karaoke-glyph-fill" },
					segment.text
				),
				...(reading ? [react.createElement('span', { className: 'lyrics-karaoke-run-reading', dir: 'auto' }, reading)] : [])
			);
			elementCache?.set(segment, {
				live: livePaint, segmentState, fillValue, isComplete, gradientDirection, wordTimed, presentationCache,
				offsetY: bounce.offsetY, scale: bounce.scale, glow: bounce.glow, bouncing: bounce.active, reading, element,
			});
			return element;
		});
		if (!preferWhitespaceWrap) return elements;
		const wrappedElements = [];
		const whitespaceWrap = createKaraokeWhitespaceWrapBuilder(wrappedElements, elementCache);
		elements.forEach((element, index) => whitespaceWrap.push(element,
			renderSegments[index].type === "space", renderSegments[index].startIndex));
		whitespaceWrap.flush();
		return wrappedElements;
	};

	return {
		getKaraokeTextDirection, getKaraokeInstantWordFill, getKaraokeLiveState, getCachedKaraokeStateClassName,
		shouldPreferKaraokeWhitespaceWrap, shouldUseKaraokeTextRun, shouldWrapKaraokeByWord,
		buildKaraokeTextRunElements, buildKaraokeTextRunReadings, buildKaraokeTextRunSegments,
		buildKaraokeWordElements, wrapKaraokeInlineStyleRuns,
	};
}
