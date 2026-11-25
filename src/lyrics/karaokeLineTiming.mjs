import { getLastTimedSyllableEndTime } from "./lyricPlaybackTimeline.mjs";
import { getCopyableText } from "./lyricDisplayText.mjs";
import { toFiniteTime } from "./lyricInterludeTiming.mjs";

const KARAOKE_PRE_SPACE_MIN_DURATION_MS = 40;
const KARAOKE_PRE_SPACE_NEXT_CHAR_RATIO = 0.35;
const KARAOKE_PRE_SPACE_MAX_DURATION_MS = 60;

const getTimedSyllablesFromLine = (line) => {
	const syllables = [];
	const appendSyllables = (items) => {
		if (Array.isArray(items)) {
			syllables.push(...items);
		}
	};

	appendSyllables(line?.syllables);
	appendSyllables(line?.vocals?.lead?.syllables);

	if (Array.isArray(line?.vocals?.background)) {
		line.vocals.background.forEach((entry) => appendSyllables(entry?.syllables));
	}

	return syllables;
};

const getKaraokeLineBounds = (line) => {
	const syllables = getTimedSyllablesFromLine(line);
	if (syllables.length === 0) {
		const startTime = Number.isFinite(line?.startTime) ? line.startTime : 0;
		const endTime = Number.isFinite(line?.endTime) ? line.endTime : startTime;
		return { startTime, endTime };
	}

	let startTime = Infinity;
	let endTime = -Infinity;

	for (const syllable of syllables) {
		if (!syllable) continue;
		const syllableStart = Number.isFinite(syllable.startTime) ? syllable.startTime : null;
		const syllableEnd = Number.isFinite(syllable.endTime) ? syllable.endTime : syllableStart;

		if (syllableStart !== null) {
			startTime = Math.min(startTime, syllableStart);
			endTime = Math.max(endTime, syllableEnd ?? syllableStart);
		}
	}

	if (!Number.isFinite(startTime)) {
		startTime = Number.isFinite(line?.startTime) ? line.startTime : 0;
	}
	if (!Number.isFinite(endTime)) {
		endTime = Number.isFinite(line?.endTime) ? line.endTime : startTime;
	}

	return { startTime, endTime };
};

const applyKaraokeWhitespaceCompensation = (timedChars) => {
	if (!Array.isArray(timedChars) || timedChars.length < 2) {
		return timedChars;
	}

	let didChange = false;
	const compensatedChars = timedChars.map((charInfo, index) => {
		const nextCharInfo = timedChars[index + 1];
		if (!nextCharInfo) {
			return charInfo;
		}

		const currentChar = charInfo?.char || "";
		const nextChar = nextCharInfo?.char || "";
		const duration = Math.max(0, (charInfo?.endTime || 0) - (charInfo?.startTime || 0));
		const nextCharDuration = Math.max(0, (nextCharInfo?.endTime || 0) - (nextCharInfo?.startTime || 0));
		const isPreWhitespaceChar = currentChar && !/\s/u.test(currentChar) && /\s/u.test(nextChar);

		if (!isPreWhitespaceChar || duration >= KARAOKE_PRE_SPACE_MIN_DURATION_MS) {
			return charInfo;
		}

		const compensatedDuration = Math.max(
			KARAOKE_PRE_SPACE_MIN_DURATION_MS,
			Math.min(
				KARAOKE_PRE_SPACE_MAX_DURATION_MS,
				nextCharDuration * KARAOKE_PRE_SPACE_NEXT_CHAR_RATIO
			)
		);

		didChange = true;
		return {
			...charInfo,
			endTime: charInfo.startTime + compensatedDuration,
		};
	});

	return didChange ? compensatedChars : timedChars;
};

const getActiveKaraokeTimedCharIndex = (timedChars, position) => {
	if (!Array.isArray(timedChars) || timedChars.length === 0) {
		return -1;
	}

	let activeCharIndex = -1;
	let lastPassedCharIndex = -1;
	let lastPassedCharEndTime = 0;
	let lastPassedCharDuration = 100;
	const timedCharCount = timedChars.length;

	for (let index = 0; index < timedCharCount; index++) {
		const charInfo = timedChars[index];
		const charStart = Number.isFinite(charInfo?.karaokeFillStartTime)
			? charInfo.karaokeFillStartTime
			: (Number.isFinite(charInfo?.startTime) ? charInfo.startTime : 0);
		const charEnd = Number.isFinite(charInfo?.karaokeFillEndTime)
			? charInfo.karaokeFillEndTime
			: (Number.isFinite(charInfo?.endTime) ? charInfo.endTime : charStart);

		if (position >= charStart && position < charEnd) {
			activeCharIndex = index;
		}

		if (position >= charEnd && charEnd > lastPassedCharEndTime) {
			lastPassedCharEndTime = charEnd;
			lastPassedCharIndex = index;
			lastPassedCharDuration = Math.max(1, charEnd - charStart) || 100;
		}
	}

	if (activeCharIndex === -1 && lastPassedCharIndex !== -1) {
		const timeDiff = position - lastPassedCharEndTime;
		const simulateDuration = Math.max(40, lastPassedCharDuration * 0.01);
		const virtualProgress = Math.floor(timeDiff / simulateDuration);

		if (timeDiff < 2000) {
			activeCharIndex = lastPassedCharIndex + 1 + virtualProgress;
		}
	}

	return activeCharIndex;
};

export function createKaraokeLineTiming({ splitKaraokeGraphemes, coalesceKaraokeTimedGraphemes, getLocale }) {
	const buildKaraokeFuriganaMap = (processedText) => {
		const furiganaMap = new Map();
		if (typeof processedText !== "string" || !processedText.includes("<ruby>")) {
			return furiganaMap;
		}

		const rubyRegex = /<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/g;
		let currentPos = 0;
		let lastMatchEnd = 0;
		let match;

		rubyRegex.lastIndex = 0;

		while ((match = rubyRegex.exec(processedText)) !== null) {
			const kanjiSequence = match[1];
			const reading = match[2];
			const beforeMatch = processedText.substring(lastMatchEnd, match.index);
			const plainTextBefore = beforeMatch.replace(/<[^>]+>/g, "");
			currentPos += splitKaraokeGraphemes(plainTextBefore, "ja").length;

			const kanjiChars = splitKaraokeGraphemes(kanjiSequence, "ja");
			if (kanjiChars.length === 1) {
				furiganaMap.set(currentPos, reading);
			} else {
				const readingChars = splitKaraokeGraphemes(reading, "ja");
				const charsPerKanji = Math.max(1, Math.floor(readingChars.length / kanjiChars.length));
				kanjiChars.forEach((_, idx) => {
					const nextReading = idx === kanjiChars.length - 1
						? readingChars.slice(idx * charsPerKanji).join("")
						: readingChars.slice(idx * charsPerKanji, (idx + 1) * charsPerKanji).join("");
					furiganaMap.set(currentPos + idx, nextReading);
				});
			}

			currentPos += kanjiChars.length;
			lastMatchEnd = match.index + match[0].length;
		}

		return furiganaMap;
	};

	const buildKaraokeTimedChars = (line) => {
		const timedChars = [];
		const sourceSyllables = getTimedSyllablesFromLine(line);
		const lyricsLocale = getLocale();

		if (sourceSyllables.length > 0) {
			sourceSyllables.forEach((syllable, karaokeUnitIndex) => {
				if (!syllable || !syllable.text) return;

				const charArray = splitKaraokeGraphemes(syllable.text || "", lyricsLocale);
				const syllableStart = Number.isFinite(syllable.startTime) ? syllable.startTime : (line.startTime || 0);
				const syllableEnd = Number.isFinite(syllable.endTime) ? syllable.endTime : syllableStart + 500;
				const charDuration = Math.max(1, (syllableEnd - syllableStart) / Math.max(1, charArray.length));

				charArray.forEach((char, charIndex) => {
					const charStart = syllableStart + (charIndex * charDuration);
					timedChars.push({
						char,
						startTime: charStart,
						endTime: charStart + charDuration,
						karaokeUnitIndex,
						...(syllable.inlineStyle === true ? {
							inlineStyle: true,
							styleKind: syllable.styleKind || '',
							styleSpeaker: syllable.styleSpeaker || '',
							styleSpeakerColor: syllable.styleSpeakerColor || '',
							styleSpeakerFallback: syllable.styleSpeakerFallback || ''
						} : null),
					});
				});
			});
		}

		if (timedChars.length > 0) {
			// Some providers emit a base letter and its combining mark as separate
			// timed syllables. Re-segment the complete line so those boundaries cannot
			// detach Arabic harakat, Thai tone marks, Indic vowel signs, or ZWJ emoji.
			return coalesceKaraokeTimedGraphemes(timedChars, lyricsLocale);
		}

		// A karaoke track can contain line-timed rows. Presentation stores the
		// pronunciation in `text`, so those rows must use the preserved original.
		const fallbackChars = splitKaraokeGraphemes(getCopyableText(line?.originalText ?? line?.text) || "", lyricsLocale);
		const { startTime, endTime } = getKaraokeLineBounds(line);
		const totalDuration = Math.max(1, endTime - startTime || 500);
		const charDuration = Math.max(1, totalDuration / Math.max(1, fallbackChars.length || 1));

		return fallbackChars.map((char, index) => ({
			char,
			startTime: startTime + (index * charDuration),
			endTime: startTime + ((index + 1) * charDuration),
			karaokeUnitIndex: index,
		}));
	};

	const getLastSyllableEndTime = (line) => getLastTimedSyllableEndTime(getTimedSyllablesFromLine(line), line?.endTime);

	const computeKaraokeLineFillEndTime = (line) => {
		const timedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line));
		const timedCharEndTime = timedChars.reduce((maxEndTime, charInfo) => {
			const endTime = toFiniteTime(charInfo?.endTime);
			return endTime === null ? maxEndTime : Math.max(maxEndTime, endTime);
		}, -Infinity);

		if (Number.isFinite(timedCharEndTime)) {
			return timedCharEndTime;
		}

		const lineBounds = getKaraokeLineBounds(line);
		return toFiniteTime(lineBounds.endTime) ?? getLastSyllableEndTime(line);
	};

	// Playback windows, cumulative vocal ends and the trailing-interlude check
	// each need a line's fill end, and every lyrics update (translation and
	// pronunciation streams included) asks again for every line. Rebuilding the
	// line's timed glyphs for each request repeated the same work three or four
	// times. Display copies of a line share its timing arrays, so the cache is
	// keyed by them; any changed input is recomputed.
	const karaokeLineFillEndTimeCache = new WeakMap();

	const getKaraokeLineFillEndTime = (line) => {
		if (!line || typeof line !== "object") return computeKaraokeLineFillEndTime(line);
		const syllables = line.syllables;
		const vocals = line.vocals;
		const key = (syllables && typeof syllables === "object") ? syllables
			: (vocals && typeof vocals === "object") ? vocals : line;
		const locale = getLocale();
		const cached = karaokeLineFillEndTimeCache.get(key);
		if (cached && cached.syllables === syllables && cached.vocals === vocals
			&& Object.is(cached.startTime, line.startTime) && Object.is(cached.endTime, line.endTime)
			&& cached.text === line.text && cached.originalText === line.originalText
			&& cached.locale === locale) {
			return cached.value;
		}
		const value = computeKaraokeLineFillEndTime(line);
		karaokeLineFillEndTimeCache.set(key, {
			syllables, vocals, startTime: line.startTime, endTime: line.endTime,
			text: line.text, originalText: line.originalText, locale, value,
		});
		return value;
	};

	return { buildKaraokeFuriganaMap, buildKaraokeTimedChars, getKaraokeLineFillEndTime };
}

export {
	getTimedSyllablesFromLine, getKaraokeLineBounds, applyKaraokeWhitespaceCompensation, getActiveKaraokeTimedCharIndex,
};
