export const EMPTY_GLOBAL_CHAR_STATE = {
    globalCharOffsets: [],
    activeGlobalCharIndex: -1,
};

const DEFAULT_SYLLABLE_DURATION_MS = 500;
const GAP_ADVANCE_LIMIT_MS = 2000;

function firstEntryAfter(entries, position, timeField) {
    let start = 0;
    let end = entries.length;
    while (start < end) {
        const middle = (start + end) >> 1;
        if (entries[middle][timeField] <= position) start = middle + 1;
        else end = middle;
    }
    return start;
}

export function createKaraokeCharacterTimelineBuilder({ splitKaraokeGraphemes, coalesceKaraokeTimedGraphemes }) {
    function getVocalCharacters(syllables) {
        const characters = [];
        for (const syllable of syllables) {
            if (!syllable?.text) continue;
            const graphemes = splitKaraokeGraphemes(syllable.text);
            if (!graphemes.length) continue;
            const start = syllable.startTime || 0;
            const end = syllable.endTime || start + DEFAULT_SYLLABLE_DURATION_MS;
            const duration = (end - start) / graphemes.length;
            for (let index = 0; index < graphemes.length; index++) {
                const startTime = start + index * duration;
                characters.push({ char: graphemes[index], startTime, endTime: startTime + duration });
            }
        }
        return coalesceKaraokeTimedGraphemes(characters);
    }

    return function prepareGlobalCharTimeline(lyrics) {
        const globalCharOffsets = new Array(lyrics.length);
        const chars = [];
        const entries = [];
        const appendVocal = (syllables) => {
            if (!Array.isArray(syllables) || !syllables.length) return;
            for (const { startTime, endTime } of getVocalCharacters(syllables)) {
                const duration = Math.max(1, endTime - startTime);
                chars.push(startTime, endTime, duration);
                entries.push({ startTime, endTime, duration, charIndex: entries.length });
            }
        };

        for (let lineIndex = 0; lineIndex < lyrics.length; lineIndex++) {
            const line = lyrics[lineIndex];
            globalCharOffsets[lineIndex] = entries.length;
            appendVocal(line?.syllables);
            appendVocal(line?.vocals?.lead?.syllables);
            const background = line?.vocals?.background;
            if (Array.isArray(background)) {
                for (const vocal of background) appendVocal(vocal?.syllables);
            }
        }

        const activeEntries = entries.slice().sort((a, b) => a.startTime - b.startTime || a.charIndex - b.charIndex);
        const activePrefixMaxEnd = new Float64Array(activeEntries.length);
        let furthestEnd = -Infinity;
        for (let index = 0; index < activeEntries.length; index++) {
            furthestEnd = Math.max(furthestEnd, activeEntries[index].endTime);
            activePrefixMaxEnd[index] = furthestEnd;
        }
        // At equal end times the first source character wins the gap transition.
        const passedEntries = entries.sort((a, b) => a.endTime - b.endTime || b.charIndex - a.charIndex);
        return { globalCharOffsets, chars, activeEntries, activePrefixMaxEnd, passedEntries };
    };
}

function getActiveCharacterIndex({ activeEntries, activePrefixMaxEnd }, position) {
    if (!Array.isArray(activeEntries) || activePrefixMaxEnd?.length !== activeEntries.length) return -1;
    let activeIndex = -1;
    const firstFutureEntry = firstEntryAfter(activeEntries, position, "startTime");
    for (let index = firstFutureEntry - 1; index >= 0 && activePrefixMaxEnd[index] > position; index--) {
        const entry = activeEntries[index];
        if (position < entry.endTime) activeIndex = Math.max(activeIndex, entry.charIndex);
    }
    return activeIndex;
}

function getGapIndex(position, lastIndex, endTime, duration) {
    const gap = position - endTime;
    if (lastIndex === -1 || !(gap < GAP_ADVANCE_LIMIT_MS)) return -1;
    return lastIndex + 1 + Math.floor(gap / Math.max(40, (duration || 100) * 0.01));
}

function queryPackedCharacterTimeline(chars, position, activeIndex) {
    let lastIndex = -1;
    let lastEnd = 0;
    let lastDuration = 100;
    for (let offset = 0, index = 0; offset < chars.length; offset += 3, index++) {
        const start = chars[offset];
        const end = chars[offset + 1];
        if (position >= start && position < end) activeIndex = index;
        if (position >= end && end > lastEnd) {
            lastIndex = index;
            lastEnd = end;
            lastDuration = chars[offset + 2];
        }
    }
    return activeIndex !== -1 ? activeIndex : getGapIndex(position, lastIndex, lastEnd, lastDuration);
}

export function queryGlobalCharTimeline(timeline, position) {
    const { globalCharOffsets, passedEntries } = timeline;
    let activeGlobalCharIndex = getActiveCharacterIndex(timeline, position);
    if (!Array.isArray(passedEntries) || !passedEntries.length) {
        // Older page bundles can still hand us an array of packed times.
        activeGlobalCharIndex = queryPackedCharacterTimeline(timeline.chars, position, activeGlobalCharIndex);
    } else if (activeGlobalCharIndex === -1) {
        // During a sung character the most recent end time cannot affect output.
        const entry = passedEntries[firstEntryAfter(passedEntries, position, "endTime") - 1];
        if (entry && entry.endTime > 0) {
            activeGlobalCharIndex = getGapIndex(position, entry.charIndex, entry.endTime, entry.duration);
        }
    }
    return { globalCharOffsets, activeGlobalCharIndex };
}
