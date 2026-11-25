export const KaraokeWordTiming = (() => {
    const LETTER_REGEX = /\p{Letter}/u;
    const LATIN_LETTER_REGEX = /\p{Script=Latin}/u;
    const JOINING_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u0870-\u089F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u{1EE00}-\u{1EEFF}]/u;
    const WHITESPACE_REGEX = /^\s+$/u;

    const isLatinWordText = (text) => {
        const normalizedText = typeof text === "string" ? text : "";
        let hasLatinLetter = false;
        for (const character of Array.from(normalizedText)) {
            if (!LETTER_REGEX.test(character)) continue;
            if (!LATIN_LETTER_REGEX.test(character)) return false;
            hasLatinLetter = true;
        }
        return hasLatinLetter;
    };

    const isJoiningWordText = (text) => {
        const normalizedText = typeof text === "string" ? text : "";
        return JOINING_SCRIPT_REGEX.test(normalizedText);
    };

    const isContinuousWordText = (text) => (
        isLatinWordText(text) || isJoiningWordText(text)
    );

    const hasContinuousWordRun = (text) => {
        const normalizedText = typeof text === "string" ? text : "";
        return normalizedText.split(/\s+/u).some(isContinuousWordText);
    };

    const toFiniteTime = (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    };

    const createSegment = (entries, type) => {
        const firstEntry = entries[0];
        const firstFiniteStart = entries.find((entry) => Number.isFinite(Number(entry.startTime)));
        const startTime = toFiniteTime(firstEntry?.startTime, toFiniteTime(firstFiniteStart?.startTime, 0));
        const endTime = entries.reduce(
            (maximum, entry) => Math.max(maximum, toFiniteTime(entry.endTime, maximum)),
            startTime
        );
        return {
            type,
            startIndex: firstEntry?.sourceIndex ?? 0,
            text: entries.map((entry) => entry.text).join(""),
            startTime,
            endTime: Math.max(startTime, endTime),
        };
    };

    const resolveTimingAccessors = (options) => {
        const getText = typeof options.getText === "function"
            ? options.getText
            : (item) => item?.text ?? item?.char ?? "";
        const getStartTime = typeof options.getStartTime === "function"
            ? options.getStartTime
            : (item) => item?.startTime;
        const getEndTime = typeof options.getEndTime === "function"
            ? options.getEndTime
            : (item) => item?.endTime;
        return { getText, getStartTime, getEndTime };
    };

    const buildTimedSegments = (items, options = {}) => {
        if (!Array.isArray(items) || items.length === 0) return [];

        const { getText, getStartTime, getEndTime } = resolveTimingAccessors(options);
        const segments = [];
        let wordEntries = [];
        let spaceEntries = [];

        const flushSpaces = () => {
            if (spaceEntries.length === 0) return;
            segments.push(createSegment(spaceEntries, "space"));
            spaceEntries = [];
        };
        const flushWord = () => {
            if (wordEntries.length === 0) return;
            const wordText = wordEntries.map((entry) => entry.text).join("");
            if (isContinuousWordText(wordText)) {
                segments.push(createSegment(wordEntries, "text"));
            } else {
                wordEntries.forEach((entry) => segments.push(createSegment([entry], "text")));
            }
            wordEntries = [];
        };

        items.forEach((item, sourceIndex) => {
            const itemText = String(getText(item, sourceIndex) || "");
            if (!itemText) return;
            const entry = {
                text: itemText,
                startTime: getStartTime(item, sourceIndex),
                endTime: getEndTime(item, sourceIndex),
                sourceIndex,
            };
            if (WHITESPACE_REGEX.test(itemText)) {
                flushWord();
                spaceEntries.push(entry);
                return;
            }
            flushSpaces();
            wordEntries.push(entry);
        });

        flushWord();
        flushSpaces();
        return segments;
    };

    const applyLatinWordFillTiming = (items, options = {}) => {
        if (!Array.isArray(items) || items.length === 0) return [];

        const { getText, getStartTime, getEndTime } = resolveTimingAccessors(options);
        const result = [...items];
        let wordEntries = [];

        const flushWord = () => {
            if (wordEntries.length === 0) return;
            const wordText = wordEntries.map((entry) => entry.text).join("");
            if (isLatinWordText(wordText)) {
                const wordStartTime = toFiniteTime(wordEntries[0].startTime, 0);
                const wordEndTime = wordEntries.reduce(
                    (maximum, entry) => Math.max(maximum, toFiniteTime(entry.endTime, maximum)),
                    wordStartTime
                );
                const duration = Math.max(0, wordEndTime - wordStartTime);
                const totalUnits = wordEntries.reduce((total, entry) => total + entry.units, 0);
                let completedUnits = 0;
                wordEntries.forEach((entry) => {
                    const fillStartTime = wordStartTime + duration * (completedUnits / totalUnits);
                    completedUnits += entry.units;
                    const fillEndTime = wordStartTime + duration * (completedUnits / totalUnits);
                    result[entry.sourceIndex] = {
                        ...entry.item,
                        karaokeFillStartTime: fillStartTime,
                        karaokeFillEndTime: Math.max(fillStartTime, fillEndTime),
                    };
                });
            }
            wordEntries = [];
        };

        items.forEach((item, sourceIndex) => {
            const itemText = String(getText(item, sourceIndex) || "");
            if (!itemText || WHITESPACE_REGEX.test(itemText)) {
                flushWord();
                return;
            }
            wordEntries.push({
                item,
                sourceIndex,
                text: itemText,
                startTime: getStartTime(item, sourceIndex),
                endTime: getEndTime(item, sourceIndex),
                units: Math.max(1, Array.from(itemText).length),
            });
        });
        flushWord();
        return result;
    };

    return Object.freeze({
        isLatinWordText,
        isJoiningWordText,
        isContinuousWordText,
        hasContinuousWordRun,
        buildTimedSegments,
        applyLatinWordFillTiming,
    });
})();
