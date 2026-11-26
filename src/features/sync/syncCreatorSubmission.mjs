import { hasReusableSyncCreatorParallelChars } from "./parallelTiming.mjs";

function inspectSyncCreatorSubmission({
    syncData,
    lyricsLines,
    lineCharOffsets,
    multiVocalMode,
    isLineCovered,
    getLineSpeaker,
    isSpeakerComplete,
}) {
    const linesByStart = new Map(syncData.lines.map(line => [line.start, line]));
    let incomplete = false;
    for (let index = 0; index < lyricsLines.length; index++) {
        if (isLineCovered(index, linesByStart)) continue;

        const lineNumber = index + 1;
        const lineData = linesByStart.get(lineCharOffsets[index]);
        if (!lineData) {
            if (multiVocalMode) {
                return { issue: { key: 'syncCreator.lineMissingSync', lineNumber, fallback: `Line ${lineNumber} has no sync yet.` } };
            }
            incomplete = true;
            continue;
        }
        if (!multiVocalMode) continue;

        const parts = lineData.parallel?.parts;
        if (Array.isArray(parts) && parts.length > 1) {
            // The delivery snapshot already includes the final vocal boundaries.
            for (const part of parts) {
                if (!hasReusableSyncCreatorParallelChars(part, part)) {
                    return { issue: { key: 'syncCreator.lineAllPartsMissingSync', lineNumber, fallback: `Sync every vocal part on line ${lineNumber}.` } };
                }
                if (!isSpeakerComplete(part)) {
                    return { issue: { key: 'syncCreator.linePartMetaRequired', lineNumber, fallback: `Select SPEAKER and text effect for every vocal part on line ${lineNumber}.` } };
                }
            }
        } else if (!isSpeakerComplete(getLineSpeaker(lineData))) {
            return { issue: { key: 'syncCreator.lineMetaRequired', lineNumber, fallback: `Select SPEAKER and text effect for line ${lineNumber}.` } };
        }
    }

    return { incomplete };
}

function createSyncCreatorSubmissionData(syncData, {
    multiVocalMode,
    trackDurationMs,
    defaultSpeaker,
    defaultKind,
    resolveSpeakerMeta,
    normalizeKind,
    sanitizeParallel,
}) {
    function applyMetadata(value, result, keepDefaults) {
        const { speaker, 'speaker-fallback': fallback, 'speaker-color': color } = resolveSpeakerMeta(value);
        const kind = normalizeKind(value.kind) || defaultKind;
        if (keepDefaults || speaker !== defaultSpeaker) result.speaker = speaker;
        else delete result.speaker;
        if (fallback) result['speaker-fallback'] = fallback;
        else delete result['speaker-fallback'];
        if (color) result['speaker-color'] = color;
        else delete result['speaker-color'];
        if (keepDefaults || kind !== defaultKind) result.kind = kind;
        else delete result.kind;
        return result;
    }

    const lines = syncData.lines.map(line => {
        const { parallel } = line;
        const normalizedParallel = parallel ? sanitizeParallel({
            ...parallel,
            parts: Array.isArray(parallel.parts)
                ? parallel.parts.map(part => applyMetadata(part, { ...part, speaker: part.speaker, kind: part.kind }, true))
                : parallel.parts,
        }) : parallel;
        return applyMetadata(line, { ...line, parallel: normalizedParallel }, multiVocalMode);
    });
    return {
        ...syncData,
        ...(trackDurationMs > 0 ? { trackDurationMs } : {}),
        lines,
    };
}

export { createSyncCreatorSubmissionData, inspectSyncCreatorSubmission };
