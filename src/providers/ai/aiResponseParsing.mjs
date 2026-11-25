/**
 * Parse plain text lines from API response
 */
export function parseTextLines(text, expectedSourceLines, providerName) {
    if (text === null || text === undefined) {
        throw new Error(`[${providerName}] Empty response from API`);
    }

    const sourceLines = Array.isArray(expectedSourceLines)
        ? expectedSourceLines.map(line => String(line ?? ''))
        : null;
    const expectedLineCount = sourceLines
        ? sourceLines.length
        : Number(expectedSourceLines);
    let lines = String(text).replace(/\r\n?/g, '\n').split('\n');

    let firstNonBlank = 0;
    let lastNonBlank = lines.length - 1;
    while (firstNonBlank <= lastNonBlank && !lines[firstNonBlank].trim()) firstNonBlank += 1;
    while (lastNonBlank >= firstNonBlank && !lines[lastNonBlank].trim()) lastNonBlank -= 1;

    const openingFence = lines[firstNonBlank]?.trim() || '';
    const closingFence = lines[lastNonBlank]?.trim() || '';
    if (/^```[a-z0-9_-]*$/i.test(openingFence) && closingFence === '```') {
        lines = lines.slice(firstNonBlank + 1, lastNonBlank);
    }

    const candidates = [lines];
    if (lines[0]?.trim() === '') candidates.push(lines.slice(1));
    if (lines[lines.length - 1]?.trim() === '') candidates.push(lines.slice(0, -1));
    if (lines[0]?.trim() === '' && lines[lines.length - 1]?.trim() === '') {
        candidates.push(lines.slice(1, -1));
    }

    const validLines = candidates.find(candidate => candidate.length === expectedLineCount);
    if (!validLines) {
        throw new Error(`[${providerName}] Invalid response line count: expected ${expectedLineCount}, got ${lines.length}`);
    }
    if (validLines.every(line => !String(line).trim())) {
        throw new Error(`[${providerName}] Empty response from API`);
    }
    if (sourceLines) {
        const missingLineIndex = validLines.findIndex((line, index) => sourceLines[index].trim() && !String(line).trim());
        if (missingLineIndex >= 0) {
            throw new Error(`[${providerName}] Empty response line at index ${missingLineIndex + 1}`);
        }
    }

    return validLines;
}

export function extractJSON(text) {
    const truncatedMessage = 'AI JSON response was truncated. The provider or model likely hit its output token limit. Try a higher max output token setting, a different provider, or shorter lyrics.';
    const isProbablyTruncatedJSON = (value, error) => {
        const trimmed = String(value || '').trim();
        if (/Unexpected end|unterminated/i.test(error?.message || '')) return true;
        if (!trimmed.includes('{')) return false;
        return !trimmed.endsWith('}') || trimmed.lastIndexOf('}') < trimmed.lastIndexOf('{');
    };
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch (directError) {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (matchError) {
                if (isProbablyTruncatedJSON(cleaned, matchError)) throw new Error(truncatedMessage);
                throw new Error('Failed to parse JSON response');
            }
        }
        if (isProbablyTruncatedJSON(cleaned, directError)) throw new Error(truncatedMessage);
        throw new Error('No valid JSON found in response');
    }
}
