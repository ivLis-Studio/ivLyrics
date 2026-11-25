// The caller owns protocol completion. A frame returning false stops reading
// immediately, even when the peer has left the connection open.
export async function consumeSseFrames(body, { frameSeparator, onFrame, onChunk }) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reachedEnd = false;

    function drain(text, flush = false) {
        const frames = (buffer + text).split(frameSeparator);
        buffer = flush ? '' : frames.pop();
        for (const frame of frames) {
            if (onFrame(frame) === false) return false;
        }
        return true;
    }

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                reachedEnd = true;
                drain(decoder.decode(), true);
                return;
            }
            const needsMore = drain(decoder.decode(value, { stream: true }));
            onChunk();
            if (!needsMore) return;
        }
    } finally {
        // Do not delay failover waiting for a cancellation acknowledgement.
        if (!reachedEnd) reader.cancel?.()?.catch(() => {});
        reader.releaseLock?.();
    }
}

// Compatible gateways can put each data line on its own without a blank
// event delimiter. Their payloads are standalone JSON objects.
export function consumeJsonSse(body, { onEvent, onChunk }) {
    return consumeSseFrames(body, {
        frameSeparator: /\r?\n/,
        onChunk,
        onFrame(frame) {
            const line = frame.trim();
            if (!line.startsWith('data:')) return;
            const payload = line.slice(5).trimStart();
            if (!payload) return;
            if (payload === '[DONE]') return false;
            return onEvent(JSON.parse(payload));
        },
    });
}

export function hasBufferedJsonBody(response) {
    const type = String(response.headers?.get?.('content-type') || '');
    return /json/i.test(type) && !/event-stream/i.test(type);
}
