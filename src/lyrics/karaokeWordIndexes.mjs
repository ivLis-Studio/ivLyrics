const WHITESPACE = /\s/u;

export function createKaraokeWordIndexer(getSegmenter) {
    return function assignKaraokeWordIndexes(timedChars, preferSourceUnits = false, locale = "auto") {
        if (!Array.isArray(timedChars) || timedChars.length === 0) {
            return timedChars;
        }

        const wordIndexes = new Array(timedChars.length).fill(null);
        const assignFromSourceUnits = () => {
            const unitWordIndexes = new Map();
            let nextWordIndex = 0;
            timedChars.forEach((charInfo, index) => {
                const char = String(charInfo?.char || "");
                if (!char || WHITESPACE.test(char)) return;
                const unitIndex = Number.isInteger(charInfo?.karaokeUnitIndex)
                    ? charInfo.karaokeUnitIndex
                    : index;
                if (!unitWordIndexes.has(unitIndex)) {
                    unitWordIndexes.set(unitIndex, nextWordIndex++);
                }
                wordIndexes[index] = unitWordIndexes.get(unitIndex);
            });
        };

        const buildCharTextAndOffsets = () => {
            let text = "";
            const charUtf16Offsets = [];
            timedChars.forEach(charInfo => {
                charUtf16Offsets.push(text.length);
                text += String(charInfo?.char || "");
            });
            return { text, charUtf16Offsets };
        };

        const assignRange = (charUtf16Offsets, rangeStart, rangeEnd, wordIndex) => {
            // Offsets are ordered by text position. Start at the first matching
            // glyph instead of checking every glyph for each word.
            let first = 0;
            let afterLast = charUtf16Offsets.length;
            while (first < afterLast) {
                const middle = Math.floor((first + afterLast) / 2);
                if (charUtf16Offsets[middle] >= rangeStart) afterLast = middle;
                else first = middle + 1;
            }
            for (let index = first; index < charUtf16Offsets.length && charUtf16Offsets[index] < rangeEnd; index++) {
                wordIndexes[index] = wordIndex;
            }
        };

        const segmenter = preferSourceUnits ? null : getSegmenter();
        if (preferSourceUnits) {
            assignFromSourceUnits();
        } else if (segmenter?.segmentRanges) {
            const { text, charUtf16Offsets } = buildCharTextAndOffsets();

            segmenter.segmentRanges(text, locale).forEach((segment, nextWordIndex) => {
                assignRange(charUtf16Offsets, segment.start, segment.end, nextWordIndex);
            });
        } else if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
            const { text, charUtf16Offsets } = buildCharTextAndOffsets();

            let nextWordIndex = 0;
            for (const segment of new Intl.Segmenter(locale === "auto" ? undefined : locale, { granularity: "word" }).segment(text)) {
                if (!segment.segment || /^\s+$/u.test(segment.segment)) continue;
                assignRange(charUtf16Offsets, segment.index, segment.index + segment.segment.length, nextWordIndex);
                nextWordIndex += 1;
            }
        } else {
            assignFromSourceUnits();
        }

        return timedChars.map((charInfo, index) => ({
            ...charInfo,
            karaokeWordIndex: wordIndexes[index],
        }));
    }
}
