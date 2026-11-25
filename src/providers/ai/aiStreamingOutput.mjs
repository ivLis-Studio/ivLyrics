function emitStreamingLines(accumulated, onLine, state, flush) {
    if (!onLine) return;

    for (let newline = accumulated.indexOf('\n', state.offset); newline !== -1;
        newline = accumulated.indexOf('\n', state.offset)) {
        onLine(state.index, accumulated.slice(state.offset, newline));
        state.index += 1;
        state.offset = newline + 1;
    }

    if (flush && state.offset < accumulated.length) {
        onLine(state.index, accumulated.slice(state.offset));
        state.index += 1;
        state.offset = accumulated.length;
    }
}

// Text, provisional rows and their cleanup belong to one request attempt.
// Providers decide when their protocol has produced a complete response.
export function createStreamingOutput({ onLine, onRawChunk, onStreamReset, onResetError }) {
    let text = '';
    const state = { index: 0, offset: 0 };

    return {
        get text() { return text; },
        append(chunk) {
            if (!chunk) return;
            text += chunk;
            if (typeof onRawChunk === 'function') onRawChunk(chunk);
        },
        emit(flush = false) {
            emitStreamingLines(text, onLine, state, flush);
        },
        finish(finalText, transformResult, { replayLines = false, clearEmptyLines = true } = {}) {
            const result = typeof transformResult === 'function' ? transformResult(finalText) : finalText;
            if (Array.isArray(result) && typeof onLine === 'function') {
                if (replayLines) {
                    result.forEach((line, index) => onLine(index, line));
                } else {
                    const provisionalLines = state.index ? text.split('\n') : [];
                    result.forEach((line, index) => {
                        if (index >= state.index || provisionalLines[index] !== line) onLine(index, line);
                    });
                    for (let index = result.length; index < state.index; index++) {
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
                    for (let index = 0; index < state.index; index++) onLine(index, '');
                }
            } catch (resetError) {
                onResetError?.(resetError);
            }
        },
    };
}
