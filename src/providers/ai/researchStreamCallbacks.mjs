export function createResearchStreamCallbacks(getManager, onProgress, signal) {
    const createParser = () => getManager()?.createResearchStreamProgressParser?.(onProgress);
    let parser = createParser();
    if (!parser) return { onRawChunk: null, resetProgress: null };

    return {
        onRawChunk(chunk) {
            if (!signal?.aborted) parser?.push(chunk);
        },
        resetProgress(details) {
            if (signal?.aborted) return;
            parser = createParser();
            onProgress(null, { ...details, reset: true });
        },
    };
}
