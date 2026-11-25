import { rangesToCharRefs } from './syncCreatorVocalLayout.mjs';
import { SYNC_CREATOR_JAPANESE_KANA_REGEX } from './syncCreatorLyricText.mjs';

export const SYNC_CREATOR_KANJI_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const SYNC_CREATOR_JAPANESE_ATTACH_KANA_REGEX = /^[\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u3093\u3095\u3096\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f3\u30f5\u30f6\u30fc\uff67-\uff70\uff9d]$/u;
const SYNC_CREATOR_HANGUL_JAMO_ONLY_REGEX = /^[\u3131-\u3163\u1100-\u11ff]+$/u;

const SYNC_CREATOR_HANGUL_CODA_BY_JAMO = new Map([
	['ㄱ', 1], ['ㄲ', 2], ['ㄳ', 3], ['ㄴ', 4], ['ㄵ', 5], ['ㄶ', 6], ['ㄷ', 7], ['ㄹ', 8],
	['ㄺ', 9], ['ㄻ', 10], ['ㄼ', 11], ['ㄽ', 12], ['ㄾ', 13], ['ㄿ', 14], ['ㅀ', 15], ['ㅁ', 16],
	['ㅂ', 17], ['ㅄ', 18], ['ㅅ', 19], ['ㅆ', 20], ['ㅇ', 21], ['ㅈ', 22], ['ㅊ', 23], ['ㅋ', 24],
	['ㅌ', 25], ['ㅍ', 26], ['ㅎ', 27]
]);

const mergeSyncCreatorPronunciationText = (base, addition) => {
	const baseText = String(base || '');
	let additionText = String(addition || '');
	if (!baseText || !additionText) return baseText + additionText;

	const firstAdditionChar = Array.from(additionText)[0] || '';
	const codaIndex = SYNC_CREATOR_HANGUL_CODA_BY_JAMO.get(firstAdditionChar);
	if (!codaIndex) {
		return baseText + additionText;
	}

	const baseChars = Array.from(baseText);
	const lastChar = baseChars[baseChars.length - 1] || '';
	const lastCode = lastChar.charCodeAt(0);
	const hangulOffset = lastCode - 0xac00;
	if (hangulOffset < 0 || hangulOffset >= 11172 || hangulOffset % 28 !== 0) {
		return baseText + additionText;
	}

	baseChars[baseChars.length - 1] = String.fromCharCode(lastCode + codaIndex);
	additionText = additionText.slice(firstAdditionChar.length);
	return baseChars.join('') + additionText;
};

const normalizeSyncCreatorPronunciationUnits = (lineData, lineChars) => {
	const chars = Array.isArray(lineChars) ? lineChars : [];
	if (lineData?.unitMode && lineData.unitMode !== 'word') {
		return [];
	}

	const rawUnits = Array.isArray(lineData?.units)
		? lineData.units
		: (Array.isArray(lineData?.u) ? lineData.u : []);

	return rawUnits
		.map((unit) => {
			const start = Number(unit?.start ?? unit?.s);
			const end = Number(unit?.end ?? unit?.e);
			const pronunciation = typeof (unit?.pronunciation ?? unit?.p) === 'string'
				? (unit.pronunciation ?? unit.p).trim()
				: '';

			if (!pronunciation || !Number.isInteger(start) || !Number.isInteger(end)) {
				return null;
			}
			if (start < 0 || end < start || end >= chars.length) {
				return null;
			}

			return {
				start,
				end,
				pronunciation,
				text: chars.slice(start, end + 1).join('')
			};
		})
		.filter(Boolean)
		.sort((a, b) => a.start - b.start || a.end - b.end);
};

const buildSyncCreatorVisualPronunciationUnits = (lineChars, pronunciationMap) => {
	const chars = Array.isArray(lineChars) ? lineChars : [];
	if (!chars.length || !(pronunciationMap instanceof Map) || pronunciationMap.size === 0) {
		return [];
	}

	const lineText = chars.join('');
	if (!SYNC_CREATOR_JAPANESE_KANA_REGEX.test(lineText) && !SYNC_CREATOR_KANJI_REGEX.test(lineText)) {
		return [];
	}

	const units = [];
	const appendToPreviousUnit = (index, pronunciation = '') => {
		const previous = units[units.length - 1];
		if (!previous) return false;
		previous.end = index;
		previous.text += chars[index] || '';
		if (pronunciation) {
			previous.pronunciation = mergeSyncCreatorPronunciationText(previous.pronunciation, pronunciation);
		}
		return true;
	};

	for (let index = 0; index < chars.length; index++) {
		const char = chars[index] || '';
		const pronunciation = String(pronunciationMap.get(index) || '').trim();
		if (/\s/u.test(char)) {
			continue;
		}

		const shouldAttachToPrevious =
			SYNC_CREATOR_JAPANESE_ATTACH_KANA_REGEX.test(char) ||
			(SYNC_CREATOR_JAPANESE_KANA_REGEX.test(char) && SYNC_CREATOR_HANGUL_JAMO_ONLY_REGEX.test(pronunciation));

		if (shouldAttachToPrevious && appendToPreviousUnit(index, pronunciation)) {
			continue;
		}

		if (!pronunciation) {
			continue;
		}

		units.push({
			start: index,
			end: index,
			text: char,
			pronunciation
		});
	}

	return units.filter(unit => unit.pronunciation);
};

export const hasSyncCreatorCharacterPronunciation = (result) => (
	Array.isArray(result?.lines) && result.lines.some(line => (
		(Array.isArray(line?.chars) && line.chars.some(item => item?.pronunciation))
		|| (Array.isArray(line?.units) && line.units.some(item => item?.pronunciation))
	))
);

export const isSyncCreatorCharacterPronunciationCompatible = (result, lyricsLines) => {
	const sourceLines = Array.isArray(lyricsLines) ? lyricsLines : [];
	if (!Array.isArray(result?.lines) || result.lines.length !== sourceLines.length) return false;

	return sourceLines.every((text, lineIndex) => {
		const resultLine = result.lines.find(line => Number(line?.index) === lineIndex)
			|| result.lines[lineIndex];
		const sourceChars = Array.from(String(text || ''));
		if (!Array.isArray(resultLine?.chars) || resultLine.chars.length !== sourceChars.length) {
			return false;
		}
		return resultLine.chars.every((item, charIndex) => (
			Number(item?.i ?? charIndex) === charIndex
			&& String(item?.char ?? '') === sourceChars[charIndex]
		));
	});
};

const indexPronunciationUnits = (units) => {
	const unitByStart = new Map();
	const covered = new Set();
	for (const unit of units) {
		unitByStart.set(unit.start, unit);
		for (let index = unit.start + 1; index <= unit.end; index++) covered.add(index);
	}
	return { unitByStart, covered };
};

export function useSyncCreatorPronunciationReadings({
	react, lyricsLines, characterPronunciations, showCharacterPronunciations, isCharacterPronunciationPrimary,
	line: {
		index: currentLineIndex, start: currentLineStart, mergedIndexes: currentMergedLineIndexes,
		fullChars: currentFullLineChars, chars: currentLineChars, charRefs: currentLineCharRefs,
		text: currentLineText, syllableSegments: currentLineSyllableSegments,
	},
	vocals: { activePart: activeParallelPart, hasParts: hasCurrentParallelParts, parts: currentParallelParts },
	getFuriganaMap: getSyncCreatorFuriganaMap,
}) {
	const { useMemo } = react;
	const currentLineCharacterPronunciationData = useMemo(() => {
		if (!showCharacterPronunciations || !Array.isArray(characterPronunciations?.lines)) {
			return null;
		}

		return characterPronunciations.lines.find(line => Number(line?.index) === currentLineIndex)
			|| characterPronunciations.lines[currentLineIndex]
			|| null;
	}, [showCharacterPronunciations, characterPronunciations, currentLineIndex]);
	// Shared merged-aware pronunciation lookup by local char index within
	// currentFullLineChars. The active line and the inactive parallel previews
	// use the same method so selecting a part never drops its readings.
	const currentFullLinePronunciationByLocal = useMemo(() => {
		const map = new Map();
		if (!showCharacterPronunciations || !characterPronunciations || !Array.isArray(characterPronunciations.lines)) {
			return map;
		}
		const mergedIndexes = Array.isArray(currentMergedLineIndexes) && currentMergedLineIndexes.length > 0
			? currentMergedLineIndexes
			: [currentLineIndex];
		const linesByIndex = new Map();
		characterPronunciations.lines.forEach((line) => {
			const idx = Number(line?.index);
			if (Number.isInteger(idx) && !linesByIndex.has(idx)) linesByIndex.set(idx, line);
		});
		let offset = 0;
		mergedIndexes.forEach((lyricsIndex) => {
			const lineChars = Array.from(lyricsLines[lyricsIndex] || '');
			const lineData = linesByIndex.get(lyricsIndex) || characterPronunciations.lines[lyricsIndex] || null;
			if (lineData && Array.isArray(lineData.chars)) {
				lineData.chars.forEach((item, fallbackIndex) => {
					const sourceIndex = Number.isInteger(Number(item?.i)) ? Number(item.i) : fallbackIndex;
					const pronunciation = typeof item?.pronunciation === 'string' ? item.pronunciation.trim() : '';
					if (pronunciation && Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < lineChars.length) {
						map.set(offset + sourceIndex, pronunciation);
					}
				});
			}
			offset += lineChars.length;
		});
		return map;
	}, [showCharacterPronunciations, characterPronunciations, currentMergedLineIndexes, currentLineIndex, lyricsLines]);
	const currentLinePronunciationUnits = useMemo(
		() => activeParallelPart ? [] : normalizeSyncCreatorPronunciationUnits(currentLineCharacterPronunciationData, currentLineChars),
		[activeParallelPart, currentLineCharacterPronunciationData, currentLineChars]
	);
	const currentLineEffectiveSyllableSegments = useMemo(() => {
		if (currentLinePronunciationUnits.length > 0) {
			return currentLinePronunciationUnits.map(unit => ({
				start: unit.start,
				end: unit.end
			}));
		}
		return currentLineSyllableSegments;
	}, [currentLinePronunciationUnits, currentLineSyllableSegments]);
	const currentLineCharacterPronunciationMap = useMemo(() => {
		if (currentFullLinePronunciationByLocal.size === 0) {
			return new Map();
		}

		if (!activeParallelPart) {
			return new Map(currentFullLinePronunciationByLocal);
		}

		const partIndexMap = new Map(currentLineCharRefs.map((ref, displayIndex) => [ref.localIndex, displayIndex]));
		const map = new Map();
		currentFullLinePronunciationByLocal.forEach((pronunciation, localIndex) => {
			const index = partIndexMap.get(localIndex);
			if (pronunciation && Number.isInteger(index)) {
				map.set(index, pronunciation);
			}
		});
		return map;
	}, [activeParallelPart, currentFullLinePronunciationByLocal, currentLineCharRefs]);
	const hasCurrentLineCharacterPronunciation = currentLineCharacterPronunciationMap.size > 0 || currentLinePronunciationUnits.length > 0;
	const usePrimaryCharacterPronunciation = isCharacterPronunciationPrimary && hasCurrentLineCharacterPronunciation;
	const currentLineRenderedPronunciationUnits = useMemo(() => {
		if (currentLinePronunciationUnits.length > 0) {
			return currentLinePronunciationUnits;
		}
		return buildSyncCreatorVisualPronunciationUnits(currentLineChars, currentLineCharacterPronunciationMap);
	}, [
		currentLinePronunciationUnits,
		currentLineChars,
		currentLineCharacterPronunciationMap
	]);
	const {
		unitByStart: currentLineRenderedPronunciationUnitByStart,
		covered: currentLineRenderedPronunciationCoveredIndexes,
	} = useMemo(
		() => indexPronunciationUnits(currentLineRenderedPronunciationUnits),
		[currentLineRenderedPronunciationUnits]
	);
	// Per-part readings for inactive parallel previews. The active part already
	// renders furigana + AI pronunciation via currentLine* maps; inactive parts
	// previously rendered plain text only, so their readings were missing.
	// This memo slices the same sources per part (read-only, no timestamps).
	const currentParallelPartReadingMaps = useMemo(() => {
		const maps = new Map();
		if (!hasCurrentParallelParts || !Array.isArray(currentFullLineChars) || currentFullLineChars.length === 0) {
			return maps;
		}
		const fullPronByLocal = currentFullLinePronunciationByLocal;
		const hasAnyPron = fullPronByLocal.size > 0;
		for (const part of currentParallelParts) {
			if (!part || typeof part.id !== 'string') continue;
			const refs = rangesToCharRefs(part.ranges, currentFullLineChars, currentLineStart);
			if (refs.length === 0) continue;
			const partChars = refs.map((ref) => ref.char);
			let furiganaMap = new Map();
			try {
				if (typeof getSyncCreatorFuriganaMap === 'function' && partChars.join('')) {
					furiganaMap = getSyncCreatorFuriganaMap(partChars.join('')) || new Map();
				}
			} catch { furiganaMap = new Map(); }
			const pronMap = new Map();
			if (hasAnyPron) {
				refs.forEach((ref, displayIndex) => {
					const pronunciation = fullPronByLocal.get(ref.localIndex);
					if (pronunciation) pronMap.set(displayIndex, pronunciation);
				});
			}
			if (furiganaMap.size === 0 && pronMap.size === 0) continue;
			let units = [];
			try {
				if (typeof buildSyncCreatorVisualPronunciationUnits === 'function') {
					units = buildSyncCreatorVisualPronunciationUnits(partChars, pronMap) || [];
				}
			} catch { units = []; }
			const { unitByStart, covered } = indexPronunciationUnits(units);
			maps.set(part.id, {
				id: part.id, role: part.role || '', partChars, furiganaMap, pronMap, units, unitByStart, covered,
				hasFurigana: furiganaMap.size > 0,
				hasPron: pronMap.size > 0 || units.length > 0
			});
		}
		return maps;
	}, [hasCurrentParallelParts, currentParallelParts, currentFullLineChars, currentLineStart, currentFullLinePronunciationByLocal, getSyncCreatorFuriganaMap]);
	const useFixedPrimaryCharacterCells = usePrimaryCharacterPronunciation
		&& currentLineRenderedPronunciationUnits.length === 0
		&& /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(currentLineText);
	return {
		currentLineEffectiveSyllableSegments,
		currentLineCharacterPronunciationMap,
		hasCurrentLineCharacterPronunciation,
		usePrimaryCharacterPronunciation,
		currentLineRenderedPronunciationUnits,
		currentLineRenderedPronunciationUnitByStart,
		currentLineRenderedPronunciationCoveredIndexes,
		currentParallelPartReadingMaps,
		useFixedPrimaryCharacterCells,
	};
}
