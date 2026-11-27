// Text, provisional rows and their cleanup belong to one request attempt.
// Providers decide when their protocol has produced a complete response.
export function createStreamingOutput({ onLine, onRawChunk, onStreamReset, onResetError }) {
    let text = '';
    let pending = '';
    let linePrefix = '';
    let emittedLines = 0;

    return {
        get text() { return text; },
        append(chunk) {
            if (!chunk) return;
            text += chunk;
            if (onLine) pending += chunk;
            if (typeof onRawChunk === 'function') onRawChunk(chunk);
        },
        emit(flush = false) {
            if (!onLine) return;
            let start = 0;
            // Scan only the text delivered since the previous emit. A long partial
            // line is joined when it is ready to send.
            try {
                for (let end = pending.indexOf('\n'); end !== -1; end = pending.indexOf('\n', start)) {
                    onLine(emittedLines, linePrefix + pending.slice(start, end));
                    emittedLines += 1;
                    linePrefix = '';
                    start = end + 1;
                }
                const remainder = linePrefix + pending.slice(start);
                if (flush && remainder) {
                    onLine(emittedLines, remainder);
                    emittedLines += 1;
                    linePrefix = '';
                } else {
                    linePrefix = remainder;
                }
                start = pending.length;
            } finally {
                pending = pending.slice(start);
            }
        },
        finish(finalText, transformResult, { replayLines = false, clearEmptyLines = true } = {}) {
            const result = typeof transformResult === 'function' ? transformResult(finalText) : finalText;
            if (Array.isArray(result) && typeof onLine === 'function') {
                if (replayLines) {
                    result.forEach((line, index) => onLine(index, line));
                } else {
                    const provisionalLines = emittedLines ? text.split('\n') : [];
                    result.forEach((line, index) => {
                        if (index >= emittedLines || provisionalLines[index] !== line) onLine(index, line);
                    });
                    for (let index = result.length; index < emittedLines; index++) {
                        if (clearEmptyLines || provisionalLines[index] !== '') onLine(index, '');
                    }
                }
            }
            return result;
        },
        reset(reason, error) {
            if (!text) return;
            try {
                if (typeof onStreamReset === 'function') {
                    onStreamReset({ reason, error: error?.message || null });
                } else if (typeof onLine === 'function') {
                    for (let index = 0; index < emittedLines; index++) onLine(index, '');
                }
            } catch (resetError) {
                onResetError?.(resetError);
            }
        },
    };
}
