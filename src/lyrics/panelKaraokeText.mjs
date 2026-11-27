export {
    KARAOKE_JOINING_SCRIPT_REGEX, getKaraokeTextDirection, shouldWrapKaraokeByWord,
    needsKaraokeJoiningScript as shouldUseKaraokeTextRun,
} from "./karaokeTextDirection.mjs";

// Shaped-run fills are painted per display frame without rounding; a 4%
// grid held each step for several frames on a 120 Hz display.
export const formatKaraokePercent = (value) => `${Number.isInteger(value) ? value : value.toFixed(2)}%`;

export const getKaraokeSyllablesText = (syllables) => (
    Array.isArray(syllables)
        ? syllables.map((syllable) => syllable?.text || "").join("")
        : ""
);

const toKaraokeFiniteTime = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

export const getKaraokeTextRunFill = (segment, currentTime) => {
    const startTime = toKaraokeFiniteTime(segment?.startTime, 0);
    const endTime = toKaraokeFiniteTime(segment?.endTime, startTime);
    if (currentTime <= startTime) return 0;
    if (currentTime >= endTime) return 100;

    const raw = Math.max(0, Math.min(1, (currentTime - startTime) / Math.max(1, endTime - startTime)));
    return raw * 100;
};

export const buildKaraokeTextRunSegments = (syllables, preserveInlineStyles = true, buildSharedWordSegments) => {
    if (!Array.isArray(syllables) || syllables.length === 0) return [];

    const hasInlineStyles = preserveInlineStyles
        && syllables.some(syllable => syllable?.inlineStyle === true);
    const sharedSegments = !hasInlineStyles && buildSharedWordSegments?.(syllables);
    if (Array.isArray(sharedSegments)) return sharedSegments;

    const segments = [];
    let currentSegment = null;

    const flushSegment = () => {
        if (!currentSegment || currentSegment.text.length === 0) {
            currentSegment = null;
            return;
        }
        segments.push(currentSegment);
        currentSegment = null;
    };

    syllables.forEach((syllable) => {
        const text = syllable?.text || "";
        if (!text) return;

        const type = /^\s+$/u.test(text) ? "space" : "text";
        const startTime = toKaraokeFiniteTime(syllable?.startTime, currentSegment?.endTime ?? 0);
        const endTime = toKaraokeFiniteTime(syllable?.endTime, startTime);
        const hasInlineStyle = preserveInlineStyles && syllable?.inlineStyle === true;
        const styleKind = hasInlineStyle ? String(syllable?.styleKind || '') : '';
        const styleSpeaker = hasInlineStyle ? String(syllable?.styleSpeaker || '') : '';
        const styleSpeakerColor = hasInlineStyle ? String(syllable?.styleSpeakerColor || '') : '';
        const styleSpeakerFallback = hasInlineStyle ? String(syllable?.styleSpeakerFallback || '') : '';

        if (!currentSegment
            || currentSegment.type !== type
            || currentSegment.styleKind !== styleKind
            || currentSegment.styleSpeaker !== styleSpeaker
            || currentSegment.styleSpeakerColor !== styleSpeakerColor
            || currentSegment.styleSpeakerFallback !== styleSpeakerFallback) {
            flushSegment();
            currentSegment = {
                type,
                startIndex: segments.length,
                text: "",
                startTime,
                endTime,
                styleKind,
                styleSpeaker,
                styleSpeakerColor,
                styleSpeakerFallback
            };
        }

        currentSegment.text += text;
        currentSegment.startTime = Math.min(currentSegment.startTime, startTime);
        currentSegment.endTime = Math.max(currentSegment.endTime, endTime);
    });

    flushSegment();
    return segments;
};
export const splitRenderableSyllables = (syllables) => {
    if (!Array.isArray(syllables) || syllables.length === 0) return [];

    return syllables.flatMap((syllable) => {
        const text = syllable?.text || '';
        if (!text || !/\s/.test(text) || text.trim() === '') {
            return syllable;
        }

        return text
            .split(/(\r\n|\n|\r|[^\S\r\n]+)/)
            .filter((part) => part !== '')
            .map((part) => ({
                ...syllable,
                text: part
            }));
    });
};


export const getSyllablesFromLine = (line) => {
    if (line.syllables && line.syllables.length > 0) {
        return splitRenderableSyllables(line.syllables);
    }
    if (line.vocals?.lead?.syllables) {
        // lead와 background 병합
        const allSyllables = [...line.vocals.lead.syllables];
        if (line.vocals.background) {
            line.vocals.background.forEach(bg => {
                if (bg.syllables) {
                    allSyllables.push(...bg.syllables);
                }
            });
        }
        // startTime 기준 정렬 후 렌더링용으로 공백 분리
        return splitRenderableSyllables(allSyllables.sort((a, b) => a.startTime - b.startTime));
    }
    return [];
};
