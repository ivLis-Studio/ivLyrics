import {
    normalizeStandaloneParentheticalLines as normalizeSyncCreatorStandaloneParentheticalLines,
    stripStandaloneParentheticalCharRange as stripSyncCreatorStandaloneParentheticalCharRange,
} from "./syncParentheticalText.mjs";

const SYNC_CREATOR_PARALLEL_HINT_REGEX = /[()（）/|／｜]/u;
const SYNC_CREATOR_JAPANESE_KANA_REGEX = /[\u3040-\u30ff\uff66-\uff9f]/u;

const getSyncCreatorFlatLyricsCharsFromLines = (lines) => (
	(Array.isArray(lines) ? lines : [])
		.map(line => String(line || '').trim().normalize('NFC'))
		.filter(Boolean)
		.flatMap(line => Array.from(line))
);

const getSyncCreatorFlatLyricsCharsFromText = text => (
	getSyncCreatorFlatLyricsCharsFromLines(String(text || '').normalize('NFC').split('\n'))
);

const detectSyncCreatorParallelVocalHints = (text) => {
	const normalized = normalizeSyncCreatorStandaloneParentheticalLines(text);
	if (!normalized.trim()) return false;
	return normalized
		.split('\n')
		.some(line => {
			const trimmed = line.trim();
			return trimmed.length > 1 && SYNC_CREATOR_PARALLEL_HINT_REGEX.test(trimmed);
		});
};

function createSyncCreatorLyricDocument(text) {
    const lyricsLines = text
        ? text.split('\n').filter(line => line.trim()).map(line => line.normalize('NFC'))
        : [];
    const lineCharOffsets = [];
    const lineIndexByStart = new Map();
    const lineChars = [];
    let totalChars = 0;

    for (const [index, line] of lyricsLines.entries()) {
        const chars = Array.from(line);
        lineCharOffsets.push(totalChars);
        lineIndexByStart.set(totalChars, index);
        lineChars.push(chars);
        totalChars += chars.length;
    }

    function getLineEndAtIndex(index) {
        const lineStart = lineCharOffsets[index];
        const count = lineChars[index]?.length ?? 0;
        return Number.isInteger(lineStart) && count > 0 ? lineStart + count - 1 : -1;
    }

    return {
        lyricsLines,
        lineChars,
        lineCharOffsets,
        lineIndexByStart,
        getLineEndAtIndex,
        totalChars,
        // Rendered lines keep their spacing. The codec uses the trimmed source.
        lyricsFullTextChars: getSyncCreatorFlatLyricsCharsFromLines(lyricsLines),
    };
}

const SYNC_CREATOR_RTL_STRONG_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const SYNC_CREATOR_LTR_STRONG_CHAR_REGEX = /[A-Za-z\u00C0-\u02AF\u0370-\u052F\u1E00-\u1EFF]/u;
const getSyncCreatorTextLayout = (text) => {
	const normalizedText = typeof text === 'string' ? text : '';
	let rtlCount = 0;
	let ltrCount = 0;

	for (const char of normalizedText) {
		if (SYNC_CREATOR_RTL_STRONG_CHAR_REGEX.test(char)) {
			rtlCount++;
			continue;
		}
		if (SYNC_CREATOR_LTR_STRONG_CHAR_REGEX.test(char)) {
			ltrCount++;
		}
	}

	return { direction: rtlCount > ltrCount ? 'rtl' : 'ltr', useTextRun: rtlCount > 0 };
};

function resolveSyncCreatorLyricsLanguage({ lyricsLines, trackName, artistName, utils, getLyricsService }) {
	if (!lyricsLines.length) return null;
	const selectedOrDetected = String(utils?.getDetectedLanguage?.() || '').trim();
	if (selectedOrDetected && selectedOrDetected !== 'auto') return selectedOrDetected;

	const lyricObjects = lyricsLines.map(text => ({ text }));
	const detected = getLyricsService()?.detectLanguage?.(lyricObjects) || utils?.detectLanguage?.(lyricObjects);
	if (detected) return detected;
	const hasKana = lyricsLines.some(line => SYNC_CREATOR_JAPANESE_KANA_REGEX.test(line))
		|| SYNC_CREATOR_JAPANESE_KANA_REGEX.test(trackName)
		|| SYNC_CREATOR_JAPANESE_KANA_REGEX.test(artistName);
	return hasKana ? 'ja' : null;
}

const getSyncCreatorCodeUnitOffsets = (chars) => {
	const offsets = [0];
	let offset = 0;
	(Array.isArray(chars) ? chars : []).forEach((char) => {
		offset += String(char || '').length;
		offsets.push(offset);
	});
	return offsets;
};

const getSyncCreatorCharIndexFromCodeUnitOffset = (offsets, offset) => {
	if (!Array.isArray(offsets) || offsets.length < 2) {
		return 0;
	}

	const safeOffset = Math.max(0, Math.min(offset, offsets[offsets.length - 1]));
	for (let index = 0; index < offsets.length - 1; index++) {
		if (safeOffset >= offsets[index] && safeOffset < offsets[index + 1]) {
			return index;
		}
	}
	return Math.max(0, offsets.length - 2);
};

export {
    getSyncCreatorTextLayout,
    getSyncCreatorCodeUnitOffsets,
    getSyncCreatorCharIndexFromCodeUnitOffset,
    SYNC_CREATOR_PARALLEL_HINT_REGEX,
    SYNC_CREATOR_JAPANESE_KANA_REGEX,
    createSyncCreatorLyricDocument,
    resolveSyncCreatorLyricsLanguage,
    detectSyncCreatorParallelVocalHints,
    getSyncCreatorFlatLyricsCharsFromText,
    normalizeSyncCreatorStandaloneParentheticalLines,
    stripSyncCreatorStandaloneParentheticalCharRange,
};
