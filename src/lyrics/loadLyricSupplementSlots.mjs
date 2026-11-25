import { isLyricsSectionHeader } from "./translationTextComparison.mjs";
import { hasValidTranslationLines, isUserEditedTranslation, readTranslationOutput } from "./translationCache.mjs";

const normalizeResultLines = (result) => {
    if (Array.isArray(result)) {
        return result.map((line) => {
            if (line && typeof line === 'object') {
                return String(line.text ?? line.value ?? '');
            }
            return String(line ?? '');
        });
    }
    if (typeof result === 'string') {
        return result.replace(/\r\n?/g, '\n').split('\n');
    }
    return null;
};

export function getActiveLyricSupplementSlots(modes, translationModes) {
    return modes.map((mode, index) => ({ slot: index + 1, mode }))
        .filter(({ mode }) => translationModes.isActiveMode(mode));
}

export async function loadLyricSupplementSlots({
    info, lyrics, karaokeSource, translationRequests, provider, detectedLanguage, pronunciationNotation, activeSlots,
    isCurrentRequest, translationModes, getTranslator, getTranslationCacheId,
    isPronunciationSyncRequested, reportWarning,
}) {
    const { getTargetField, isAiMode, needsTraditionalConverter, convertTraditional } = translationModes;
    const texts = translationRequests.map((request) => request.text || "");
    const lyricsText = texts.join("\n");
    let traditionalTranslatorPromise = null;
    const getTraditionalTranslator = () => {
        if (!traditionalTranslatorPromise) {
            traditionalTranslatorPromise = Promise.resolve().then(() => {
                const converter = getTranslator();
                if (typeof converter === 'function') return new converter(detectedLanguage);
                return converter;
            });
        }
        return traditionalTranslatorPromise;
    };

    const processSlot = async ({ slot, mode }) => {
        const targetField = getTargetField(mode);
        let output;
        let userEdited = false;
        if (isAiMode(mode)) {
            const translator = getTranslator();
            if (typeof translator?.callGemini !== 'function') {
                throw new Error('AI translator is not available');
            }
            const response = await translator.callGemini({
                trackId: getTranslationCacheId(info.uri),
                artist: info.artist,
                title: info.title,
                text: lyricsText,
                wantSmartPhonetic: targetField === 'phonetic',
                pronunciationNotation: targetField === 'phonetic' ? pronunciationNotation : null,
                sourceLang: detectedLanguage || 'auto',
                provider,
                pronunciationSlots: targetField === 'phonetic'
                    && isPronunciationSyncRequested(lyrics, karaokeSource)
            });
            if (!isCurrentRequest()) return { stale: true };
            const phonetic = targetField === 'phonetic';
            userEdited = isUserEditedTranslation(response);
            if (userEdited && !hasValidTranslationLines(response, lyricsText, phonetic)) {
                throw new Error(`Incomplete ${targetField} edit`);
            }
            output = readTranslationOutput(response, phonetic);
        } else {
            const translator = needsTraditionalConverter(detectedLanguage, mode)
                ? await getTraditionalTranslator()
                : null;
            if (!isCurrentRequest()) return { stale: true };
            output = await convertTraditional({
                language: detectedLanguage,
                mode,
                texts,
                translator
            });
            if (!isCurrentRequest()) return { stale: true };
        }

        const rows = normalizeResultLines(output);
        const lines = userEdited ? rows : rows?.filter(line => !isLyricsSectionHeader(line));
        const outputIsComplete = userEdited || (lines
            && lines.length >= translationRequests.length
            && translationRequests.every((request, index) => {
                if (!String(request.text || '').trim()) return true;
                const value = String(lines[index] ?? '').trim();
                return !!value;
            }));
        if (!outputIsComplete) {
            throw new Error(`Incomplete ${targetField} result`);
        }
        return { slot, mode, targetField, lines, ...(userEdited && { userEdited }) };
    };

    const results = [];
    // Slot order determines precedence, and a superseded request must not
    // start another provider call. Each slot can still fail independently.
    for (const slot of activeSlots) {
        if (!isCurrentRequest()) break;
        try {
            const value = await processSlot(slot);
            if (value.stale) break;
            results.push(value);
        } catch (error) {
            if (!isCurrentRequest()) break;
            reportWarning(slot.mode, error);
        }
    }
    return results;
}
