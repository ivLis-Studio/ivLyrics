import {
    CHARACTER_PRONUNCIATION_CJK_LANG_RE,
    CHARACTER_PRONUNCIATION_CJK_SCRIPT_RE,
    CHARACTER_PRONUNCIATION_WORD_TEXT_RE,
    CHARACTER_PRONUNCIATION_LETTER_RE,
    CHARACTER_PRONUNCIATION_LATIN_LETTER_RE,
    getPronunciationScriptRule,
} from './pronunciationPolicy.mjs';

export function getCharacterPronunciationUnitMode(params, lines) {
    const requested = params?.unitMode || params?.characterPronunciationUnitMode;
    if (requested === 'word' || requested === 'char') {
        return requested;
    }

    const sourceLang = String(params?.sourceLang || '').toLowerCase();
    if (CHARACTER_PRONUNCIATION_CJK_LANG_RE.test(sourceLang)) {
        return 'char';
    }

    const joinedLines = (Array.isArray(lines) ? lines : []).join('\n');
    return CHARACTER_PRONUNCIATION_CJK_SCRIPT_RE.test(joinedLines) ? 'char' : 'word';
}

export function buildWordPronunciationUnits(text) {
    const chars = Array.from(String(text ?? ''));
    const units = [];
    let index = 0;

    while (index < chars.length) {
        while (index < chars.length && /\s/u.test(chars[index])) {
            index++;
        }
        if (index >= chars.length) break;

        const start = index;
        while (index < chars.length && !/\s/u.test(chars[index])) {
            index++;
        }
        const end = index - 1;
        const token = chars.slice(start, end + 1).join('');
        if (CHARACTER_PRONUNCIATION_WORD_TEXT_RE.test(token)) {
            units.push({ start, end, text: token, pronunciation: '' });
        }
    }

    return units;
}

export function normalizeCharacterPronunciationLine(text, lineIndex, unitMode, resultLines, resultLinesByIndex, { repairSlots, slotError, buildWordUnits }) {
    const sourceChars = Array.from(text);
    const resultLine = resultLinesByIndex.get(lineIndex) || resultLines[lineIndex] || {};
    const resultChars = Array.isArray(resultLine?.c)
        ? resultLine.c
        : (Array.isArray(resultLine?.chars) ? resultLine.chars : []);
    const hasResultPronunciationArray = Array.isArray(resultLine?.p) || Array.isArray(resultLine?.pronunciations);
    const resultPronunciations = Array.isArray(resultLine?.p)
        ? resultLine.p
        : (Array.isArray(resultLine?.pronunciations) ? resultLine.pronunciations : []);
    const resultUnits = Array.isArray(resultLine?.u)
        ? resultLine.u
        : (Array.isArray(resultLine?.units) ? resultLine.units : []);
    const byIndex = new Map();
    const warnings = [];

    if (unitMode === 'char' && hasResultPronunciationArray) {
        const repair = repairSlots(text, resultPronunciations);
        if (repair.needsRetry) {
            throw slotError(lineIndex, resultPronunciations.length, sourceChars.length, text);
        }
        if (repair.repaired) {
            warnings.push({
                lineIndex,
                got: resultPronunciations.length,
                expected: sourceChars.length,
                strategy: repair.strategy
            });
        }

        repair.slots.forEach((pronunciation, index) => {
            if (pronunciation) {
                byIndex.set(index, { p: pronunciation });
            }
        });
    } else {
        if (unitMode === 'char' && !resultChars.length && !resultUnits.length) {
            warnings.push({ lineIndex, reason: 'missing-p' });
        } else {
            resultChars.forEach((item, fallbackIndex) => {
                const index = Number.isInteger(Number(item?.i)) ? Number(item.i) : fallbackIndex;
                const rawPronunciation = item?.p ?? item?.pronunciation;
                const pronunciation = typeof rawPronunciation === 'string' ? rawPronunciation.trim() : '';
                if (index < 0 || index >= sourceChars.length) {
                    if (unitMode === 'char' && pronunciation) {
                        throw new Error(`Character pronunciation response used index ${index} outside line ${lineIndex} length ${sourceChars.length}.`);
                    }
                    return;
                }
                if (unitMode === 'char' && byIndex.has(index)) {
                    const existingPronunciation = byIndex.get(index)?.p ?? byIndex.get(index)?.pronunciation;
                    const existingText = typeof existingPronunciation === 'string' ? existingPronunciation.trim() : '';
                    if (pronunciation && existingText) {
                        throw new Error(`Character pronunciation response duplicated index ${index} on line ${lineIndex}.`);
                    }
                    if (!pronunciation && existingText) return;
                }
                byIndex.set(index, item);
            });
        }
    }

    const sourceUnits = unitMode === 'word'
        ? buildWordUnits(text)
        : [];
    const normalizedUnits = [];
    if (unitMode === 'word') {
        resultUnits.forEach((item, fallbackIndex) => {
            const unitIndex = Number.isInteger(Number(item?.i)) ? Number(item.i) : fallbackIndex;
            const sourceUnit = sourceUnits[unitIndex] || null;
            const start = Number.isInteger(Number(item?.s ?? item?.start))
                ? Number(item?.s ?? item?.start)
                : sourceUnit?.start;
            const end = Number.isInteger(Number(item?.e ?? item?.end))
                ? Number(item?.e ?? item?.end)
                : sourceUnit?.end;
            const pronunciation = typeof (item?.p ?? item?.pronunciation) === 'string'
                ? (item.p ?? item.pronunciation).trim()
                : '';

            if (!pronunciation || !Number.isInteger(start) || !Number.isInteger(end)) return;
            if (start < 0 || end < start || end >= sourceChars.length) return;
            normalizedUnits.push({
                start,
                end,
                text: sourceChars.slice(start, end + 1).join(''),
                pronunciation
            });
        });
        if (!normalizedUnits.length && byIndex.size > 0) {
            sourceUnits.forEach(unit => {
                const pronunciation = [];
                for (let i = unit.start; i <= unit.end; i++) {
                    const item = byIndex.get(i);
                    const rawPronunciation = item?.p ?? item?.pronunciation;
                    if (typeof rawPronunciation === 'string' && rawPronunciation.trim()) {
                        pronunciation.push(rawPronunciation.trim());
                    }
                }
                if (pronunciation.length) {
                    normalizedUnits.push({
                        ...unit,
                        pronunciation: pronunciation.join('')
                    });
                }
            });
        }
    }

    return {
        index: lineIndex,
        unitMode,
        units: normalizedUnits,
        chars: sourceChars.map((char, charIndex) => {
            const item = byIndex.get(charIndex) || {};
            const rawPronunciation = item.p ?? item.pronunciation;
            const pronunciation = unitMode === 'word'
                ? ''
                : (typeof rawPronunciation === 'string'
                ? rawPronunciation.trim()
                : '');

            return {
                i: charIndex,
                char,
                pronunciation
            };
        }),
        warnings
    };
}

export function coerceCharacterPronunciationSlot(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function characterPronunciationSlotError(lineIndex, got, expected, text) {
    const preview = String(text ?? '').slice(0, 24);
    const error = new Error(`Character pronunciation response line ${lineIndex} ("${preview}") returned ${got} slots, expected ${expected}.`);
    error.code = 'character-pronunciation-slot-mismatch';
    error.details = { lineIndex, got, expected, preview };
    return error;
}

export function repairCharacterPronunciationSlots(text, rawArray) {
    const sourceChars = Array.from(String(text ?? ''));
    const expected = sourceChars.length;
    const coerced = (Array.isArray(rawArray) ? rawArray : [])
        .map(coerceCharacterPronunciationSlot);
    const got = coerced.length;
    if (got === expected) {
        return { slots: coerced, repaired: false, strategy: 'exact' };
    }

    // Common model mistake: whitespace slots omitted entirely.
    // Reinsert "" at whitespace positions when the counts line up exactly.
    const whitespaceCount = sourceChars.filter(character => /\s/u.test(character)).length;
    if (whitespaceCount > 0 && got + whitespaceCount === expected) {
        const slots = [];
        let cursor = 0;
        sourceChars.forEach(character => {
            if (/\s/u.test(character)) {
                slots.push('');
            } else {
                slots.push(coerced[cursor++] ?? '');
            }
        });
        return { slots, repaired: true, strategy: 'reinsert-whitespace' };
    }

    // Any other count mismatch has no established source positions:
    // padding or dropping arbitrary slots shifts readings onto the
    // wrong characters (e.g. きょうは answered with 3 readings keeps
    // は unassigned). Keep it retryable — the caller runs the
    // targeted repair prompt, then smaller chunks.
    return { slots: coerced, repaired: false, strategy: 'unrepairable', needsRetry: true };
}

export function normalizeCharacterPronunciationResult(normalizeLine, result, lines, options = {}) {
    const sourceLines = (Array.isArray(lines) ? lines : [])
        .map(line => String(line ?? ''));
    const unitMode = options.unitMode === 'word' ? 'word' : 'char';
    const resultLines = Array.isArray(result?.l)
        ? result.l
        : (Array.isArray(result?.lines) ? result.lines : []);
    const resultLinesByIndex = new Map();
    resultLines.forEach((line) => {
        const lineIndex = Number(line?.i ?? line?.index);
        if (!resultLinesByIndex.has(lineIndex)) {
            resultLinesByIndex.set(lineIndex, line);
        }
    });

    const warnings = [];
    const normalizedLines = sourceLines.map((text, lineIndex) => {
        const lineResult = normalizeLine(text, lineIndex, unitMode, resultLines, resultLinesByIndex);
        if (lineResult.warnings) {
            warnings.push(...lineResult.warnings);
        }
        return lineResult;
    });

    if (unitMode === 'char' && normalizedLines.length > 0) {
        const hasAnyInput = resultLines.length > 0;
        const hasAnyPronunciation = normalizedLines.some(line => (
            (Array.isArray(line?.chars) && line.chars.some(item => item?.pronunciation))
            || (Array.isArray(line?.units) && line.units.some(item => item?.pronunciation))
        ));
        if (!hasAnyInput || (!hasAnyPronunciation && warnings.length >= normalizedLines.length)) {
            throw new Error(`Character pronunciation response line 0 missing p array.`);
        }
    }

    return {
        lines: normalizedLines,
        warnings
    };
}

export function validateCharacterPronunciationWritingSystem(result, options = {}) {
    const scriptRule = getPronunciationScriptRule(options.lang);
    if (scriptRule.id !== 'latin') {
        return result;
    }

    const values = [];
    (Array.isArray(result?.lines) ? result.lines : []).forEach((line) => {
        (Array.isArray(line?.chars) ? line.chars : []).forEach((item) => {
            if (typeof item?.pronunciation === 'string' && item.pronunciation.trim()) {
                values.push(item.pronunciation.trim());
            }
        });
        (Array.isArray(line?.units) ? line.units : []).forEach((item) => {
            if (typeof item?.pronunciation === 'string' && item.pronunciation.trim()) {
                values.push(item.pronunciation.trim());
            }
        });
    });

    const invalidValue = values.find(value => Array.from(value).some(character => (
        CHARACTER_PRONUNCIATION_LETTER_RE.test(character)
        && !CHARACTER_PRONUNCIATION_LATIN_LETTER_RE.test(character)
    )));
    if (invalidValue) {
        throw new Error(`Character pronunciation response used the wrong writing system for Latin output: ${invalidValue.slice(0, 24)}`);
    }
    return result;
}

export function isCharacterPronunciationTruncationError(error) {
    return /JSON response was truncated|output token limit|Unexpected end|unterminated/i.test(error?.message || '');
}

export function isCharacterPronunciationFormatError(error) {
    if (error?.code === 'character-pronunciation-slot-mismatch') return true;
    return /Character pronunciation response .*returned \d+ slots, expected|Character pronunciation response .*outside line|Character pronunciation response duplicated index|Character pronunciation response .*missing p array|Character pronunciation response used the wrong writing system/i.test(error?.message || '');
}

export function isCharacterPronunciationRetryableError(error, { isTruncationError, isFormatError }) {
    return isTruncationError(error) || isFormatError(error);
}
