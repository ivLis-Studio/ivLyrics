const LRCLIB_LYRICSFILE_VERSION = '1.0';
const LRCLIB_LYRICSFILE_MAX_LENGTH = 2 * 1024 * 1024;
const LRCLIB_LYRICSFILE_MAX_DEPTH = 12;
const LRCLIB_LYRICSFILE_MAX_NODES = 20000;
const LRCLIB_LYRICSFILE_DEFAULT_LINE_DURATION_MS = 3000;

/**
 * Lyricsfile 1.0이 허용하는 YAML 하위 집합을 읽습니다.
 * 커스텀 태그, anchor/alias, 중복 키, 다중 문서 및 과도한 크기/깊이는 거부합니다.
 */
function parseLyricsfileDoubleQuotedScalar(value) {
    if (value.length < 2 || value.at(-1) !== '"') {
        throw new Error('Unterminated double-quoted YAML scalar');
    }

    let output = '';
    for (let index = 1; index < value.length - 1; index += 1) {
        const character = value[index];
        if (character !== '\\') {
            output += character;
            continue;
        }

        index += 1;
        if (index >= value.length - 1) {
            throw new Error('Invalid YAML escape sequence');
        }

        const escaped = value[index];
        const simpleEscapes = {
            '0': '\0',
            a: '\x07',
            b: '\b',
            t: '\t',
            n: '\n',
            v: '\v',
            f: '\f',
            r: '\r',
            e: '\x1b',
            ' ': ' ',
            '"': '"',
            '/': '/',
            '\\': '\\',
            N: '\u0085',
            _: '\u00a0',
            L: '\u2028',
            P: '\u2029'
        };
        if (Object.prototype.hasOwnProperty.call(simpleEscapes, escaped)) {
            output += simpleEscapes[escaped];
            continue;
        }

        const hexLength = escaped === 'x' ? 2 : (escaped === 'u' ? 4 : (escaped === 'U' ? 8 : 0));
        if (!hexLength) {
            throw new Error(`Unsupported YAML escape: \\${escaped}`);
        }

        const hex = value.slice(index + 1, index + 1 + hexLength);
        if (hex.length !== hexLength || !/^[0-9a-f]+$/i.test(hex)) {
            throw new Error('Invalid YAML Unicode escape');
        }

        const codePoint = Number.parseInt(hex, 16);
        if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
            throw new Error('Invalid YAML Unicode code point');
        }
        output += String.fromCodePoint(codePoint);
        index += hexLength;
    }

    return output;
}

function stripLyricsfilePlainScalarComment(value) {
    for (let index = 0; index < value.length; index += 1) {
        if (value[index] === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
            return value.slice(0, index).trimEnd();
        }
    }
    return value.trimEnd();
}

function parseLyricsfileYamlScalar(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return null;

    if (value.startsWith("'")) {
        if (value.length < 2 || value.at(-1) !== "'") {
            throw new Error('Unterminated single-quoted YAML scalar');
        }
        return value.slice(1, -1).replace(/''/g, "'");
    }

    if (value.startsWith('"')) {
        return parseLyricsfileDoubleQuotedScalar(value);
    }

    const plain = stripLyricsfilePlainScalarComment(value);
    if (!plain || plain === '~' || /^(?:null|Null|NULL)$/.test(plain)) return null;
    if (/^(?:true|True|TRUE)$/.test(plain)) return true;
    if (/^(?:false|False|FALSE)$/.test(plain)) return false;
    if (plain === '[]') return [];
    if (plain === '{}') return {};
    if (/^[-+]?(?:0|[1-9]\d*)$/.test(plain)) {
        const number = Number(plain);
        if (!Number.isSafeInteger(number)) {
            throw new Error('YAML integer exceeds the safe range');
        }
        return number;
    }
    if (/^[&*!]/.test(plain)) {
        throw new Error('YAML anchors, aliases, and tags are not supported');
    }

    return plain;
}

function getLyricsfileYamlIndent(line) {
    let indent = 0;
    while (line[indent] === ' ') indent += 1;
    if (line[indent] === '\t') {
        throw new Error('Tabs are not allowed for YAML indentation');
    }
    return indent;
}

function parseLyricsfileYaml(lyricsfile) {
    if (typeof lyricsfile !== 'string' || !lyricsfile.trim()) return null;
    if (lyricsfile.length > LRCLIB_LYRICSFILE_MAX_LENGTH) {
        throw new Error('Lyricsfile exceeds the size limit');
    }
    if (lyricsfile.includes('\0')) {
        throw new Error('Lyricsfile contains a null byte');
    }

    const lines = lyricsfile.replace(/\r\n?/g, '\n').split('\n');
    let nodeCount = 0;

    const isIgnorableLine = (line) => {
        const trimmed = line.trim();
        return !trimmed || trimmed.startsWith('#');
    };

    const skipIgnorableLines = (startIndex) => {
        let index = startIndex;
        while (index < lines.length && isIgnorableLine(lines[index])) index += 1;
        return index;
    };

    const parseMappingEntry = (content) => {
        const match = content.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/);
        if (!match) {
            throw new Error(`Unsupported YAML mapping entry: ${content}`);
        }
        return {
            key: match[1],
            rawValue: match[2] ?? ''
        };
    };

    const parseBlockScalar = (startIndex, parentIndent, header) => {
        const headerMatch = header.match(/^([|>])([+-]?)([1-9]?)(?:\s+#.*)?$/);
        if (!headerMatch) {
            throw new Error(`Unsupported YAML block scalar header: ${header}`);
        }

        const style = headerMatch[1];
        const chomping = headerMatch[2] || '';
        const explicitIndent = headerMatch[3] ? Number(headerMatch[3]) : null;
        let contentIndent = explicitIndent === null ? null : parentIndent + explicitIndent;
        let index = startIndex;

        if (contentIndent === null) {
            let probe = startIndex;
            while (probe < lines.length && !lines[probe].trim()) probe += 1;
            if (probe < lines.length) {
                const probeIndent = getLyricsfileYamlIndent(lines[probe]);
                if (probeIndent > parentIndent) contentIndent = probeIndent;
            }
        }

        if (contentIndent === null) {
            return ['', startIndex];
        }

        const contentLines = [];
        while (index < lines.length) {
            const rawLine = lines[index];
            if (!rawLine.trim()) {
                contentLines.push('');
                index += 1;
                continue;
            }

            const indent = getLyricsfileYamlIndent(rawLine);
            if (indent <= parentIndent) break;
            if (indent < contentIndent) {
                throw new Error('Invalid YAML block scalar indentation');
            }

            contentLines.push(rawLine.slice(contentIndent));
            index += 1;
        }

        let value;
        if (style === '|') {
            value = contentLines.join('\n');
        } else {
            value = '';
            contentLines.forEach((line, lineIndex) => {
                if (lineIndex === 0) {
                    value = line;
                    return;
                }
                const previous = contentLines[lineIndex - 1];
                value += line && previous ? ` ${line}` : `\n${line}`;
            });
        }

        if (chomping === '-') {
            value = value.replace(/\n+$/g, '');
        } else if (chomping === '+') {
            value += '\n';
        } else {
            value = `${value.replace(/\n+$/g, '')}\n`;
        }

        return [value, index];
    };

    const assertDepthAndCount = (depth) => {
        if (depth > LRCLIB_LYRICSFILE_MAX_DEPTH) {
            throw new Error('Lyricsfile nesting is too deep');
        }
        nodeCount += 1;
        if (nodeCount > LRCLIB_LYRICSFILE_MAX_NODES) {
            throw new Error('Lyricsfile contains too many nodes');
        }
    };

    const parseNode = (startIndex, indent, depth) => {
        assertDepthAndCount(depth);
        const index = skipIgnorableLines(startIndex);
        if (index >= lines.length) return [null, index];

        const actualIndent = getLyricsfileYamlIndent(lines[index]);
        if (actualIndent !== indent) {
            throw new Error('Unexpected YAML indentation');
        }

        const content = lines[index].slice(indent);
        return content === '-' || content.startsWith('- ')
            ? parseSequence(index, indent, depth)
            : parseMapping(index, indent, depth);
    };

    const parseMappingValue = (rawValue, currentIndex, indent, depth) => {
        if (rawValue) {
            if (/^[|>]/.test(rawValue)) {
                return parseBlockScalar(currentIndex + 1, indent, rawValue);
            }
            return [parseLyricsfileYamlScalar(rawValue), currentIndex + 1];
        }

        const nextIndex = skipIgnorableLines(currentIndex + 1);
        if (nextIndex >= lines.length) return [null, currentIndex + 1];

        const nextIndent = getLyricsfileYamlIndent(lines[nextIndex]);
        const nextContent = lines[nextIndex].slice(nextIndent);
        const isIndentlessSequence = nextIndent === indent
            && (nextContent === '-' || nextContent.startsWith('- '));
        if (nextIndent > indent || isIndentlessSequence) {
            return parseNode(nextIndex, nextIndent, depth + 1);
        }

        return [null, currentIndex + 1];
    };

    const parseMapping = (startIndex, indent, depth) => {
        const output = {};
        let index = startIndex;

        while (index < lines.length) {
            index = skipIgnorableLines(index);
            if (index >= lines.length) break;

            const actualIndent = getLyricsfileYamlIndent(lines[index]);
            if (actualIndent < indent) break;
            if (actualIndent > indent) {
                throw new Error('Unexpected YAML mapping indentation');
            }

            const content = lines[index].slice(indent);
            if (content === '-' || content.startsWith('- ')) break;
            if (content === '---' || content === '...') break;

            const { key, rawValue } = parseMappingEntry(content);
            if (Object.prototype.hasOwnProperty.call(output, key)) {
                throw new Error(`Duplicate YAML key: ${key}`);
            }

            const [value, nextIndex] = parseMappingValue(rawValue, index, indent, depth);
            output[key] = value;
            index = nextIndex;
        }

        return [output, index];
    };

    const parseSequence = (startIndex, indent, depth) => {
        const output = [];
        let index = startIndex;

        while (index < lines.length) {
            index = skipIgnorableLines(index);
            if (index >= lines.length) break;

            const actualIndent = getLyricsfileYamlIndent(lines[index]);
            if (actualIndent !== indent) break;

            const content = lines[index].slice(indent);
            if (content !== '-' && !content.startsWith('- ')) break;

            const itemContent = content.slice(1).trimStart();
            if (!itemContent) {
                const nextIndex = skipIgnorableLines(index + 1);
                if (nextIndex >= lines.length) {
                    output.push(null);
                    index += 1;
                    continue;
                }
                const nextIndent = getLyricsfileYamlIndent(lines[nextIndex]);
                if (nextIndent <= indent) {
                    output.push(null);
                    index += 1;
                    continue;
                }
                const [value, afterItem] = parseNode(nextIndex, nextIndent, depth + 1);
                output.push(value);
                index = afterItem;
                continue;
            }

            if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(itemContent)) {
                const itemIndex = index;
                const originalLine = lines[index];
                const mappingIndent = indent + 2;
                lines[index] = `${' '.repeat(mappingIndent)}${itemContent}`;
                try {
                    const [value, afterItem] = parseMapping(index, mappingIndent, depth + 1);
                    output.push(value);
                    index = afterItem;
                } finally {
                    lines[itemIndex] = originalLine;
                }
                continue;
            }

            output.push(parseLyricsfileYamlScalar(itemContent));
            index += 1;
        }

        return [output, index];
    };

    let startIndex = skipIgnorableLines(0);
    if (lines[startIndex]?.trim() === '---') {
        startIndex = skipIgnorableLines(startIndex + 1);
    }
    if (startIndex >= lines.length) return null;

    const rootIndent = getLyricsfileYamlIndent(lines[startIndex]);
    const [document, endIndex] = parseNode(startIndex, rootIndent, 0);
    let trailingIndex = skipIgnorableLines(endIndex);
    if (lines[trailingIndex]?.trim() === '...') {
        trailingIndex = skipIgnorableLines(trailingIndex + 1);
    }
    if (trailingIndex < lines.length) {
        throw new Error('Lyricsfile must contain exactly one YAML document');
    }

    return document;
}

function isLyricsfileObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isLyricsfileTimestamp(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

export function parseLyricsfileKaraoke(lyricsfile, fallbackDurationMs = 0, onParseError) {
    let document;
    try {
        document = parseLyricsfileYaml(lyricsfile);
    } catch (error) {
        onParseError?.(error);
        return null;
    }

    if (!isLyricsfileObject(document)
        || document.version !== LRCLIB_LYRICSFILE_VERSION
        || !isLyricsfileObject(document.metadata)
        || !Array.isArray(document.lines)
        || document.lines.length === 0) {
        return null;
    }

    const durationMs = isLyricsfileTimestamp(document.metadata.duration_ms)
        ? document.metadata.duration_ms
        : (isLyricsfileTimestamp(fallbackDurationMs) ? fallbackDurationMs : 0);
    const parsedLines = [];
    let hasWordSync = false;

    document.lines.forEach((line, sourceIndex) => {
        if (!isLyricsfileObject(line)
            || typeof line.text !== 'string'
            || !isLyricsfileTimestamp(line.start_ms)
            || (line.end_ms !== null
                && line.end_ms !== undefined
                && (!isLyricsfileTimestamp(line.end_ms) || line.end_ms < line.start_ms))) {
            return;
        }

        const words = [];
        let wordsAreValid = Array.isArray(line.words) && line.words.length > 0;
        if (wordsAreValid) {
            line.words.forEach((word, wordIndex) => {
                if (!isLyricsfileObject(word)
                    || typeof word.text !== 'string'
                    || !isLyricsfileTimestamp(word.start_ms)
                    || (word.end_ms !== null
                        && word.end_ms !== undefined
                        && (!isLyricsfileTimestamp(word.end_ms) || word.end_ms < word.start_ms))) {
                    wordsAreValid = false;
                    return;
                }
                words.push({
                    text: word.text,
                    startTime: word.start_ms,
                    explicitEndTime: word.end_ms,
                    sourceIndex: wordIndex
                });
            });
        }

        if (!wordsAreValid) words.length = 0;
        if (words.length > 0) hasWordSync = true;
        parsedLines.push({
            text: line.text,
            startTime: line.start_ms,
            explicitEndTime: line.end_ms,
            words,
            sourceIndex
        });
    });

    if (!hasWordSync || parsedLines.length === 0) return null;

    parsedLines.sort((left, right) => (
        left.startTime - right.startTime || left.sourceIndex - right.sourceIndex
    ));

    return parsedLines
        .filter(line => line.text.length > 0 || line.words.length > 0)
        .map((line, lineIndex) => {
            const sortedWords = [...line.words].sort((left, right) => (
                left.startTime - right.startTime || left.sourceIndex - right.sourceIndex
            ));
            const latestExplicitWordEnd = sortedWords.reduce((latest, word) => (
                isLyricsfileTimestamp(word.explicitEndTime)
                    ? Math.max(latest, word.explicitEndTime)
                    : latest
            ), 0);
            const nextLineStart = parsedLines[lineIndex + 1]?.startTime;
            const inferredLineEnd = isLyricsfileTimestamp(line.explicitEndTime)
                ? line.explicitEndTime
                : (latestExplicitWordEnd > line.startTime
                    ? latestExplicitWordEnd
                    : (nextLineStart > line.startTime
                        ? nextLineStart
                        : (durationMs > line.startTime
                            ? durationMs
                            : line.startTime + LRCLIB_LYRICSFILE_DEFAULT_LINE_DURATION_MS)));
            const lineEndTime = Math.max(line.startTime + 1, inferredLineEnd);

            const syllables = sortedWords.length > 0
                ? sortedWords.map((word, wordIndex) => {
                    const nextWordStart = sortedWords[wordIndex + 1]?.startTime;
                    const inferredWordEnd = isLyricsfileTimestamp(word.explicitEndTime)
                        ? word.explicitEndTime
                        : (nextWordStart >= word.startTime ? nextWordStart : lineEndTime);
                    return {
                        text: word.text,
                        startTime: word.startTime,
                        endTime: Math.max(word.startTime + 1, inferredWordEnd)
                    };
                })
                : [{
                    text: line.text,
                    startTime: line.startTime,
                    endTime: lineEndTime
                }];

            return {
                text: line.text,
                startTime: line.startTime,
                endTime: Math.max(lineEndTime, ...syllables.map(syllable => syllable.endTime)),
                syllables
            };
        });
}
