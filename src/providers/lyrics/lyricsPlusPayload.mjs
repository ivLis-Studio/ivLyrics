import {
    isUsablePayload, joinSyllableText, normalizeDisplayText, normalizeInlineText,
    toFiniteMilliseconds, toPositiveMilliseconds,
} from "./lyricsPlusInput.mjs";
import { getSpeakerPresentation } from "./lyricsPlusSpeakers.mjs";
import { splitLongSoloVocalLines } from "./lyricsPlusSoloLineLayout.mjs";

const SYLLABLE_TIMING_TOLERANCE_MS = 1500;

function parseSyllable(item) {
    const startTime = toFiniteMilliseconds(item?.time);
    if (!Number.isFinite(startTime)) return null;
    const duration = toPositiveMilliseconds(item?.duration) || 1;
    const text = normalizeInlineText(item?.text);
    if (!text) return null;

    return {
        text,
        startTime,
        endTime: startTime + duration,
        isBackground: item?.isBackground === true
    };
}

function isSyllableWithinLine(syllable, lineStart, lineEnd) {
    if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return true;
    return syllable.startTime >= lineStart - SYLLABLE_TIMING_TOLERANCE_MS
        && syllable.endTime <= lineEnd + SYLLABLE_TIMING_TOLERANCE_MS;
}

function stripBackgroundParentheses(value) {
    return normalizeDisplayText(String(value || '').replace(/[()（）]/g, ''));
}

function stripBackgroundSyllableParentheses(syllables) {
    return (syllables || [])
        .map(syllable => ({
            ...syllable,
            text: String(syllable?.text || '').replace(/[()（）]/g, '')
        }))
        .filter(syllable => syllable.text.length > 0);
}

function createVocalPart(id, role, syllables, presentation, textOverride = '') {
    if (!Array.isArray(syllables) || syllables.length === 0) return null;
    const text = normalizeDisplayText(textOverride) || joinSyllableText(syllables);
    if (!text) return null;

    const starts = syllables.map(item => item.startTime).filter(Number.isFinite);
    const ends = syllables.map(item => item.endTime).filter(Number.isFinite);
    if (!starts.length || !ends.length) return null;

    return {
        id,
        role,
        ...presentation,
        kind: 'vocal',
        text,
        syllables: syllables.map(({ isBackground: _isBackground, ...syllable }) => syllable),
        startTime: Math.min(...starts),
        endTime: Math.max(...ends)
    };
}

export function groupParallelVocalLines(lines) {
    // Timing overlap does not make separate source lines background vocals.
    // Preserve the provider's line boundaries and explicit background parts;
    // the renderer advances each line using its own ending timestamp.
    return [...(lines || [])].sort((left, right) => (
        left.startTime - right.startTime
        || (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0)
    ));
}

export function parseLyricsPayload(payload, durationMs = 0) {
    if (!isUsablePayload(payload)) {
        return { karaoke: null, synced: null, unsynced: null };
    }

    const singerOrder = new Map();
    const speakerPresentations = new Map();
    const agents = payload?.metadata?.agents || {};
    const songParts = Array.isArray(payload?.metadata?.songParts) ? payload.metadata.songParts : [];

    const parseSourceLine = (sourceLine, lineIndex) => {
        const rawStart = toFiniteMilliseconds(sourceLine?.time);
        const rawDuration = toPositiveMilliseconds(sourceLine?.duration);
        const rawEnd = Number.isFinite(rawStart) && Number.isFinite(rawDuration)
            ? rawStart + rawDuration
            : null;
        const rawSyllables = (Array.isArray(sourceLine?.syllabus)
            ? sourceLine.syllabus.map(parseSyllable).filter(Boolean)
            : [])
            .filter(syllable => isSyllableWithinLine(syllable, rawStart, rawEnd));
        const leadSyllables = rawSyllables.filter(item => !item.isBackground);
        const backgroundSyllables = stripBackgroundSyllableParentheses(
            rawSyllables.filter(item => item.isBackground)
        );
        const sourceText = normalizeDisplayText(sourceLine?.text);
        const leadText = joinSyllableText(leadSyllables);
        const backgroundText = stripBackgroundParentheses(joinSyllableText(backgroundSyllables));
        const text = backgroundSyllables.length > 0
            ? [leadText, backgroundText].filter(Boolean).join(' ')
            : sourceText || joinSyllableText(rawSyllables);
        if (!text) return null;

        const syllableStarts = rawSyllables.map(item => item.startTime).filter(Number.isFinite);
        const syllableEnds = rawSyllables.map(item => item.endTime).filter(Number.isFinite);
        const startCandidates = [rawStart, ...syllableStarts].filter(Number.isFinite);
        const endCandidates = [
            Number.isFinite(rawStart) && Number.isFinite(rawDuration) ? rawStart + rawDuration : null,
            ...syllableEnds
        ].filter(Number.isFinite);
        const startTime = startCandidates.length ? Math.min(...startCandidates) : null;
        const endTime = endCandidates.length ? Math.max(...endCandidates) : null;
        const lineKey = String(sourceLine?.element?.key || `line-${lineIndex + 1}`);
        const singer = String(sourceLine?.element?.singer || '');
        const rawSongPartIndex = sourceLine?.element?.songPartIndex;
        const songPartIndex = rawSongPartIndex !== null
            && rawSongPartIndex !== undefined
            && rawSongPartIndex !== ''
            && Number.isInteger(Number(rawSongPartIndex))
            ? Number(rawSongPartIndex)
            : null;
        const songPart = Number.isInteger(songPartIndex) ? songParts[songPartIndex] : null;
        const presentation = getSpeakerPresentation(
            singer,
            singerOrder,
            agents,
            speakerPresentations
        );

        let leadPart = createVocalPart(`${lineKey}-lead`, 'lead', leadSyllables, presentation);
        const backgroundParts = [];
        if (backgroundSyllables.length > 0) {
            const backgroundPart = createVocalPart(
                `${lineKey}-background-1`,
                'background',
                backgroundSyllables,
                presentation,
                backgroundText
            );
            if (backgroundPart) backgroundParts.push(backgroundPart);
        }

        if (!leadPart && backgroundParts.length > 0) {
            const promoted = backgroundParts.shift();
            leadPart = { ...promoted, id: `${lineKey}-lead`, role: 'lead' };
        }

        const line = {
            sourceIndex: lineIndex,
            startTime,
            endTime,
            text,
            originalText: text,
            ...presentation,
            kind: 'vocal',
            lyricsPlusLineKey: lineKey,
            lyricsPlusSongPartIndex: songPartIndex,
            lyricsPlusSongPart: normalizeDisplayText(songPart?.name),
            hasWordTiming: rawSyllables.length > 0
        };

        if (leadPart && backgroundParts.length > 0) {
            line.vocals = { lead: leadPart, background: backgroundParts };
        } else if (leadPart) {
            line.syllables = leadPart.syllables;
        } else if (rawSyllables.length > 0) {
            line.syllables = rawSyllables.map(({ isBackground: _isBackground, ...syllable }) => syllable);
        }

        return line;
    };

    const parsedLines = payload.lyrics.map(parseSourceLine).filter(Boolean);

    const timedLines = parsedLines
        .filter(line => Number.isFinite(line.startTime))
        .sort((left, right) => left.startTime - right.startTime || left.sourceIndex - right.sourceIndex);

    timedLines.forEach((line, index) => {
        const nextStart = timedLines[index + 1]?.startTime;
        if (!Number.isFinite(line.endTime) || line.endTime <= line.startTime) {
            line.endTime = Number.isFinite(nextStart)
                ? Math.max(line.startTime + 1, nextStart)
                : Math.max(line.startTime + 1, durationMs || line.startTime + 3000);
        }
    });

    const payloadType = normalizeDisplayText(payload?.type).toLowerCase();
    const isWordType = payloadType === 'word';
    const isLineType = payloadType === 'line';
    const isPlainType = payloadType === 'none'
        || payloadType === 'plain'
        || payloadType === 'unsynced';
    const inferTypeFromContent = !isWordType && !isLineType && !isPlainType;
    const hasCompleteTiming = timedLines.length === parsedLines.length;
    const hasCompleteWordTiming = hasCompleteTiming
        && (isWordType || inferTypeFromContent)
        && timedLines.every(line => line.hasWordTiming);
    const groupedKaraokeLines = hasCompleteWordTiming
        ? groupParallelVocalLines(timedLines)
        : [];
    const karaokeLines = hasCompleteWordTiming
        ? splitLongSoloVocalLines(groupedKaraokeLines)
        : [];
    const karaoke = hasCompleteWordTiming
        ? karaokeLines.map(line => {
            const karaokeLine = { ...line };
            delete karaokeLine.sourceIndex;
            delete karaokeLine.hasWordTiming;
            if (!karaokeLine.vocals && !karaokeLine.syllables?.length) {
                karaokeLine.syllables = [{
                    text: karaokeLine.text,
                    startTime: karaokeLine.startTime,
                    endTime: karaokeLine.endTime
                }];
            }
            return karaokeLine;
        })
        : null;

    const synced = hasCompleteTiming && !isPlainType ? timedLines.map(line => ({
        startTime: line.startTime,
        endTime: line.endTime,
        text: line.text,
        originalText: line.originalText,
        speaker: line.speaker,
        'speaker-color': line['speaker-color'],
        'speaker-fallback': line['speaker-fallback'],
        kind: line.kind,
        lyricsPlusLineKey: line.lyricsPlusLineKey,
        lyricsPlusSinger: line.lyricsPlusSinger,
        lyricsPlusAgentType: line.lyricsPlusAgentType,
        lyricsPlusAgentName: line.lyricsPlusAgentName,
        lyricsPlusAgentAlias: line.lyricsPlusAgentAlias,
        lyricsPlusSongPartIndex: line.lyricsPlusSongPartIndex,
        lyricsPlusSongPart: line.lyricsPlusSongPart
    })) : [];
    const unsynced = parsedLines
        .sort((left, right) => left.sourceIndex - right.sourceIndex)
        .map(line => ({
            text: line.text,
            originalText: line.originalText,
            lyricsPlusLineKey: line.lyricsPlusLineKey,
            lyricsPlusSinger: line.lyricsPlusSinger,
            lyricsPlusAgentType: line.lyricsPlusAgentType,
            lyricsPlusAgentName: line.lyricsPlusAgentName,
            lyricsPlusAgentAlias: line.lyricsPlusAgentAlias,
            lyricsPlusSongPartIndex: line.lyricsPlusSongPartIndex,
            lyricsPlusSongPart: line.lyricsPlusSongPart
        }));

    return {
        karaoke: karaoke?.length ? karaoke : null,
        karaokeGranularity: karaoke?.length ? 'word' : null,
        synced: synced.length ? synced : null,
        unsynced: unsynced.length ? unsynced : null
    };
}
