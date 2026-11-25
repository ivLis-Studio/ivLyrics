const getParenthesisClose = (char) => {
    if (char === '(') return ')';
    if (char === '\uFF08') return '\uFF09';
    return '';
};

const isParenthesisClose = (char) => char === ')' || char === '\uFF09';

const isStandaloneParentheticalLine = (line) => {
    const chars = Array.from(String(line || '').trim());
    if (chars.length < 2 || !getParenthesisClose(chars[0])) return false;

    const expectedStack = [];
    for (let index = 0; index < chars.length; index++) {
        const char = chars[index];
        const expectedClose = getParenthesisClose(char);
        if (expectedClose) {
            expectedStack.push(expectedClose);
            continue;
        }
        if (isParenthesisClose(char)) {
            if (!expectedStack.length || expectedStack[expectedStack.length - 1] !== char) {
                return false;
            }
            expectedStack.pop();
            if (expectedStack.length === 0 && index < chars.length - 1) {
                return false;
            }
        }
    }

    return expectedStack.length === 0;
};

const stripStandaloneParentheticalLine = (line) => {
    let value = String(line || '').normalize('NFC').trim();
    let changed = false;

    while (isStandaloneParentheticalLine(value)) {
        const chars = Array.from(value);
        value = chars.slice(1, -1).join('').trim();
        changed = true;
    }

    return changed ? value : String(line || '').normalize('NFC');
};

const stripLeadingParenthesis = (line) => {
    const value = String(line || '').normalize('NFC');
    const chars = Array.from(value);
    const index = chars.findIndex(char => !/\s/u.test(char));
    if (index < 0 || !getParenthesisClose(chars[index])) return value;
    return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
};

const stripTrailingParenthesis = (line, closeChar) => {
    const value = String(line || '').normalize('NFC');
    const chars = Array.from(value);
    for (let index = chars.length - 1; index >= 0; index--) {
        if (/\s/u.test(chars[index])) continue;
        if (chars[index] !== closeChar) return value;
        return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
    }
    return value;
};

const normalizeStandaloneParentheticalBlocks = (lines) => {
    const normalizedLines = Array.isArray(lines) ? [...lines] : [];

    for (let index = 0; index < normalizedLines.length; index++) {
        const trimmed = String(normalizedLines[index] || '').trim();
        if (!trimmed) continue;

        const openChar = Array.from(trimmed)[0] || '';
        const closeChar = getParenthesisClose(openChar);
        if (!closeChar || trimmed.includes(closeChar)) continue;

        let closeLineIndex = -1;
        for (let candidate = index + 1; candidate < normalizedLines.length; candidate++) {
            const candidateTrimmed = String(normalizedLines[candidate] || '').trim();
            if (!candidateTrimmed) continue;
            if (candidateTrimmed.endsWith(closeChar)) {
                closeLineIndex = candidate;
                break;
            }
        }

        if (closeLineIndex < 0) continue;

        normalizedLines[index] = stripLeadingParenthesis(normalizedLines[index]).trim();
        normalizedLines[closeLineIndex] = stripTrailingParenthesis(normalizedLines[closeLineIndex], closeChar).trim();
    }

    return normalizedLines;
};

const normalizeStandaloneParentheticalLines = (text) => (
    normalizeStandaloneParentheticalBlocks(
        String(text || '')
            .normalize('NFC')
            .split('\n')
            .map(line => stripStandaloneParentheticalLine(line))
    ).join('\n')
);

const trimCharRangeWhitespace = (chars, start, end, pushHidden = () => {}) => {
    let nextStart = start;
    let nextEnd = end;

    while (nextStart <= nextEnd && /\s/u.test(chars[nextStart] || '')) {
        pushHidden(nextStart);
        nextStart++;
    }

    const trailingHiddenIndexes = [];
    while (nextEnd >= nextStart && /\s/u.test(chars[nextEnd] || '')) {
        trailingHiddenIndexes.push(nextEnd);
        nextEnd--;
    }
    trailingHiddenIndexes.reverse().forEach(pushHidden);

    return { start: nextStart, end: nextEnd };
};

const stripStandaloneParentheticalCharRange = (chars, start, end, pushHidden = () => {}) => {
    const sourceChars = Array.isArray(chars) ? chars : [];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= sourceChars.length || start > end) {
        return { start, end, changed: false };
    }

    let nextStart = start;
    let nextEnd = end;
    let changed = false;
    const pendingHiddenIndexes = [];
    const queueHidden = (index) => pendingHiddenIndexes.push(index);

    ({ start: nextStart, end: nextEnd } = trimCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
    while (
        nextStart < nextEnd
        && isStandaloneParentheticalLine(sourceChars.slice(nextStart, nextEnd + 1).join(''))
    ) {
        queueHidden(nextStart);
        queueHidden(nextEnd);
        nextStart++;
        nextEnd--;
        changed = true;
        ({ start: nextStart, end: nextEnd } = trimCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
    }

    if (changed) {
        [...new Set(pendingHiddenIndexes)]
            .sort((a, b) => a - b)
            .forEach(pushHidden);
    }

    return { start: nextStart, end: nextEnd, changed };
};

export {
    normalizeStandaloneParentheticalLines,
    stripStandaloneParentheticalCharRange,
};
