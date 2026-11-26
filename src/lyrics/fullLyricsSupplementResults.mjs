import { formatPhoneticHyphen } from "./phoneticHyphen.mjs";
import { setEditedLyricSupplements } from "./lyricSupplementEdits.mjs";

const SUPPLEMENT_ALIASES = {
    phonetic: ['phonetic', 'phoneticText', 'pronunciationText', 'pronText'],
    translation: ['translation', 'text2', 'translationText', 'transText'],
};

function clearSupplementAliases(target, field) {
    for (const name of SUPPLEMENT_ALIASES[field]) delete target[name];
}

export function mergeFullLyricsSupplementResults(lyrics, translationRequests, successfulSlots, phoneticHyphenMode) {
    const requestResultsByLine = new Map();
    successfulSlots.forEach(({ slot, targetField, lines, userEdited }) => {
        translationRequests.forEach((request, requestIndex) => {
            const text = String(lines[requestIndex] ?? '').trim();
            const value = targetField === 'phonetic' ? formatPhoneticHyphen(text, phoneticHyphenMode) : text;
            const entry = {
                ...request,
                slot, targetField, userEdited, value,
            };
            const entries = requestResultsByLine.get(request.lineIndex) || [];
            entries.push(entry);
            requestResultsByLine.set(request.lineIndex, entries);
        });
    });

    const mergeSlotResultsIntoLine = (line, idx) => {
        const isKaraokeLine = Array.isArray(line.syllables)
            || Array.isArray(line.vocals?.lead?.syllables);
        const originalText = isKaraokeLine && line.originalText
            ? line.originalText
            : (line.text || line.originalText || '');
        const requestEntries = requestResultsByLine.get(idx) || [];
        const getSlotText = (field) => {
            const bySlot = new Map();
            requestEntries.forEach(({ targetField, value, slot, userEdited }) => {
                if (targetField !== field || (!value && !userEdited)) return;
                const result = bySlot.get(slot) || { values: [], userEdited };
                if (value) result.values.push(value);
                bySlot.set(slot, result);
            });
            const ordered = [...bySlot.entries()]
                .sort((left, right) => left[0] - right[0]);
            const last = ordered.at(-1)?.[1];
            return { text: last?.values.join(' / ') || null, userEdited: last?.userEdited === true };
        };
        // If both configured modes target the same semantic
        // field, the later slot has the same precedence as
        // page optimizeTranslations; distinct fields remain
        // independent and are both retained.
        const phonetic = getSlotText('phonetic');
        const translation = getSlotText('translation');
        const finalOriginal = line.originalText || originalText;
        const vocalPartEntries = requestEntries.filter(entry => entry.vocalPart);
        let vocals = line.vocals;
        if (vocalPartEntries.length > 0 && line.vocals?.lead) {
            const nextVocals = {
                ...line.vocals,
                lead: { ...line.vocals.lead },
                background: Array.isArray(line.vocals.background)
                    ? line.vocals.background.map(part => ({ ...part }))
                    : line.vocals.background
            };

            vocalPartEntries.forEach((entry) => {
                const target = entry.vocalPart.role === 'lead'
                    ? nextVocals.lead
                    : nextVocals.background?.[entry.vocalPart.index];
                if (!target) return;
                if (entry.userEdited) clearSupplementAliases(target, entry.targetField);
                if (entry.value) target[entry.targetField] = entry.value;
            });

            vocals = nextVocals;
        }

        const result = {
            ...line,
            vocals,
            originalText: finalOriginal,
            text: isKaraokeLine ? finalOriginal : (phonetic.text || (phonetic.userEdited ? finalOriginal : originalText)),
        };
        if (phonetic.userEdited) clearSupplementAliases(result, 'phonetic');
        if (translation.userEdited) clearSupplementAliases(result, 'translation');
        result.phoneticText = phonetic.text || result.phoneticText || null;
        result.text2 = translation.text || result.text2 || null;
        result.translation = translation.text || result.translation || null;
        result.translationText = translation.text || result.translationText || null;
        return setEditedLyricSupplements(result, phonetic.userEdited, translation.userEdited);
    };
    return lyrics.map(mergeSlotResultsIntoLine);
}

