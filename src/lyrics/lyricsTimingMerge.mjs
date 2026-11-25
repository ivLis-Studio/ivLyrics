import { isTranslationNoteLine } from "./translationPresentation.mjs";

export const LRC_RED_WORD_SYNC_SOURCE = "lrcred-word-sync";

export function buildLrcRedTimingSnapshot(snapshot, trackUri, rawResult, displayLyrics, lyricsType) {
    const continuesUpgrade = snapshot?.source === LRC_RED_WORD_SYNC_SOURCE
        && snapshot.rawResult?.karaoke === rawResult.karaoke;
    return {
        ...snapshot,
        trackUri,
        rawResult,
        ...(displayLyrics ? { displayLyrics, lyricsType, karaokeSource: rawResult.karaokeSource } : {}),
        source: LRC_RED_WORD_SYNC_SOURCE,
        timingUpgradeFromRevision: (continuesUpgrade ? snapshot.timingUpgradeFromRevision : snapshot?.revision) ?? null,
        timingUpgradeApplied: !!displayLyrics,
    };
}

const readLineText = line => String(line?.originalText ?? line?.text ?? "").normalize("NFC").trim();
const isSourceLine = line => {
    const text = readLineText(line);
    return text && !isTranslationNoteLine(text);
};
export const readLyricsTimingSourceLines = lines => Array.isArray(lines) ? lines.filter(isSourceLine) : [];

function sourceMatchesTiming(source, timing) {
    return source.length === timing.length && source.every((line, index) => readLineText(line) === readLineText(timing[index]));
}

export function hasMatchingLyricsTimingSource(lyrics, timing) {
    return Boolean(timing?.length && sourceMatchesTiming(readLyricsTimingSourceLines(lyrics), timing));
}

function mergeLineTiming(line, timing) {
    const next = { ...timing, ...line, startTime: timing.startTime, endTime: timing.endTime };
    if (timing.syllables) next.syllables = timing.syllables;
    if (timing.vocals) {
        const remainingVoices = Array.isArray(line.vocals?.background) ? [...line.vocals.background] : [];
        const priorLead = line.vocals?.lead;
        next.vocals = {
            ...timing.vocals,
            lead: mergeMatchedVoice(priorLead, timing.vocals.lead),
            background: timing.vocals.background?.map(part => {
                const text = readLineText(part);
                const sameText = candidate => text && text === readLineText(candidate);
                const sameSpeaker = remainingVoices.findIndex(candidate => sameText(candidate) && candidate.speaker === part.speaker);
                const index = sameSpeaker >= 0 ? sameSpeaker : remainingVoices.findIndex(sameText);
                return index >= 0 ? mergeLineTiming(remainingVoices.splice(index, 1)[0], part) : part;
            }) || [],
        };
    } else if (timing.syllables?.length && line.vocals?.lead && readLineText(line.vocals.lead) === readLineText(timing)) {
        // A line-only response may still describe the lead of a multivocal row.
        const { text, startTime, endTime, syllables } = timing;
        next.vocals = {
            ...line.vocals,
            lead: mergeLineTiming(line.vocals.lead, { text, startTime, endTime, syllables }),
        };
    }
    return next;
}

function mergeMatchedVoice(previous, timing) {
    if (!timing) return null;
    if (!previous || !readLineText(timing) || readLineText(previous) !== readLineText(timing)) return timing;
    return mergeLineTiming(previous, timing);
}

export function mergeLyricsTiming(lyrics, timing) {
    if (!Array.isArray(lyrics) || !timing?.length) return null;
    const timedRows = readLyricsTimingSourceLines(timing);
    if (!hasMatchingLyricsTimingSource(lyrics, timedRows)) return null;
    let index = 0;
    return lyrics.map(line => isSourceLine(line) ? mergeLineTiming(line, timedRows[index++]) : line);
}

