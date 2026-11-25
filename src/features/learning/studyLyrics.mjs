const MAX_STUDY_LINES = 80;
const MAX_STUDY_CHARS = 8000;
const STUDY_CHUNK_LINES = 4;
const STUDY_CHUNK_CHARS = 450;
const SUMMARY_CHUNK_LINES = 9;
const SUMMARY_CHUNK_CHARS = 900;
const EXPRESSION_CHUNK_LINES = 6;
const EXPRESSION_CHUNK_CHARS = 650;
export const QUIZ_CHUNK_LINES = 6;
export const QUIZ_CHUNK_CHARS = 650;

const safeText = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(safeText).join("");
    if (typeof value === "object" && value.props) return safeText(value.props.children);
    return "";
};

const normalizeLineText = (line) => {
    const value = line?.originalText || line?.text || line?.translationText || "";
    return safeText(value)
        .replace(/\s+/g, " ")
        .trim();
};

const parseLyricTimeMs = (raw) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    return value > 0 && value < 1000 ? Math.round(value * 1000) : Math.round(value);
};

export const getLineStartTime = (line) => {
    const raw = line?.startTime ?? line?.start_time ?? line?.start ?? line?.time ?? line?.t ?? line?.timestamp;
    return parseLyricTimeMs(raw);
};

export const getLineEndTime = (line) => {
    const raw = line?.endTime ?? line?.end_time ?? line?.end ?? line?.to ?? line?.endTimestamp;
    return parseLyricTimeMs(raw);
};

export const normalizeLyrics = (lyrics) => {
    if (!Array.isArray(lyrics)) return [];

    const normalized = lyrics
        .map((line, fallbackIndex) => {
            const text = normalizeLineText(line);
            const sourceIndex = Number.isFinite(line?.index)
                ? line.index
                : Number.isFinite(line?.lineNumber)
                    ? line.lineNumber
                    : fallbackIndex;
            return {
                index: sourceIndex,
                text,
                startTime: getLineStartTime(line),
                endTime: getLineEndTime(line)
            };
        })
        .filter((line) => {
            if (!line.text) return false;
            return !/(^|\b)(instrumental|no lyrics|가사 없음|기악)(\b|$)/i.test(line.text);
        });

    const startTimes = normalized.map((line) => Number(line.startTime));
    const nextStartTimes = new Array(normalized.length).fill(null);
    const greaterStartTimes = [];
    for (let index = normalized.length - 1; index >= 0; index--) {
        const currentStart = startTimes[index];
        while (
            greaterStartTimes.length > 0
            && greaterStartTimes[greaterStartTimes.length - 1] <= currentStart
        ) {
            greaterStartTimes.pop();
        }
        if (greaterStartTimes.length > 0) {
            nextStartTimes[index] = greaterStartTimes[greaterStartTimes.length - 1];
        }
        if (Number.isFinite(currentStart)) {
            greaterStartTimes.push(currentStart);
        }
    }

    return normalized.map((line, index) => {
        const nextStart = nextStartTimes[index];
        const explicitEnd = Number(line.endTime);
        return {
            ...line,
            endTime: Number.isFinite(explicitEnd) && explicitEnd > Number(line.startTime)
                ? explicitEnd
                : Number.isFinite(nextStart)
                    ? nextStart
                    : null
        };
    });
};

export const getLimitedLines = (lines) => {
    const selected = [];
    let charCount = 0;

    for (const line of lines) {
        const nextLength = line.text.length + 1;
        if (selected.length >= MAX_STUDY_LINES || charCount + nextLength > MAX_STUDY_CHARS) {
            break;
        }
        selected.push(line);
        charCount += nextLength;
    }

    return {
        lines: selected,
        omittedCount: Math.max(0, lines.length - selected.length)
    };
};

export const buildStudyChunks = (lines, maxLines = STUDY_CHUNK_LINES, maxChars = STUDY_CHUNK_CHARS) => {
    const chunks = [];
    let current = [];
    let charCount = 0;

    for (const line of lines) {
        const lineLength = String(line.text || "").length + 1;
        const shouldFlush = current.length > 0
            && (current.length >= maxLines || charCount + lineLength > maxChars);

        if (shouldFlush) {
            chunks.push(current);
            current = [];
            charCount = 0;
        }

        current.push(line);
        charCount += lineLength;
    }

    if (current.length > 0) {
        chunks.push(current);
    }

    return chunks;
};

const getPromptLineSubset = (lines, maxLines, maxChars) => {
    const selected = [];
    let charCount = 0;

    for (const line of lines) {
        const nextLength = String(line.text || "").length + 1;
        if (selected.length >= maxLines || charCount + nextLength > maxChars) {
            break;
        }
        selected.push(line);
        charCount += nextLength;
    }

    return selected;
};

export const buildStudyCategoryRequests = (lines) => [
    {
        category: "summary",
        loadingKey: "loadingSummary",
        loadingFallback: "곡의 큰 흐름을 정리하는 중...",
        chunks: [getPromptLineSubset(lines, SUMMARY_CHUNK_LINES, SUMMARY_CHUNK_CHARS)]
    },
    {
        category: "lines",
        loadingKey: "loadingLines",
        loadingFallback: "가사 카드를 만드는 중... ({current}/{total})",
        chunks: buildStudyChunks(lines, STUDY_CHUNK_LINES, STUDY_CHUNK_CHARS)
    },
    {
        category: "expressions",
        loadingKey: "loadingExpressions",
        loadingFallback: "핵심 표현을 고르는 중... ({current}/{total})",
        chunks: buildStudyChunks(lines, EXPRESSION_CHUNK_LINES, EXPRESSION_CHUNK_CHARS)
    },
    {
        category: "quiz",
        loadingKey: "loadingQuiz",
        loadingFallback: "퀴즈를 만드는 중... ({current}/{total})",
        chunks: buildStudyChunks(lines, QUIZ_CHUNK_LINES, QUIZ_CHUNK_CHARS)
    }
];
