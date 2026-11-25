const SLOTS = [
    { value: "mode1", mode: "lastMode1", options: "lastGenerationOptions1" },
    { value: "mode2", mode: "lastMode2", options: "lastGenerationOptions2" },
];

export function prepareLyricSupplementResults(cached, {
    modes, generationOptions, provider, rendererVersion, lyricsShapeSignature, pronunciationNotation,
}) {
    const results = cached || { mode1: null, mode2: null };
    const sourceChanged = results.lastProvider !== provider || results.lastRendererVersion !== rendererVersion
        || results.lastLyricsShapeSignature !== lyricsShapeSignature;
    const notationChanged = results.lastPronunciationNotation !== pronunciationNotation;

    for (const [index, slot] of SLOTS.entries()) {
        const mode = modes[index];
        const options = generationOptions[index];
        if (sourceChanged || results[slot.mode] !== mode || results[slot.options] !== options
            || (notationChanged && mode === "gemini_romaji")) {
            results[slot.value] = null;
        }
        results[slot.mode] = mode;
        results[slot.options] = options;
    }
    results.lastProvider = provider;
    results.lastRendererVersion = rendererVersion;
    results.lastLyricsShapeSignature = lyricsShapeSignature;
    results.lastPronunciationNotation = pronunciationNotation;
    return results;
}

export function runProgressiveLyricSupplements({
    modes, results, isCurrent, request, onProgress, onCombined, reportError,
}) {
    if (!isCurrent()) return;
    const active = [];
    for (const [index, { value }] of SLOTS.entries()) {
        const mode = modes[index];
        if (mode && mode !== "none") active.push({ mode, value, index });
        else results[value] = null;
    }

    // Only completed slots belong to the reusable results object. The same
    // track can acquire a new presentation while the provider is still streaming.
    const pending = new Set(active.filter(({ value }) => !results[value]));
    const previews = new Map();
    const visible = value => previews.get(value) ?? results[value];
    let published = false;

    const publish = () => {
        published = true;
        onCombined(visible("mode1"), visible("mode2"), active.every(({ value }) => !!results[value]));
    };

    if (!pending.size) {
        publish();
        return;
    }

    const settle = (slot, result) => {
        if (!isCurrent()) return;
        pending.delete(slot);
        const hadPreview = previews.delete(slot.value);
        if (result) results[slot.value] = result;
        if (result || hadPreview || (!pending.size && !published)) publish();
    };

    for (const slot of pending) {
        if (!isCurrent()) break;
        const requestSlot = async () => request(slot.mode, (partial, detail) => {
            if (!isCurrent() || !pending.has(slot)) return;
            const reset = detail?.reset === true;
            if (!reset && !partial) return;
            previews.set(slot.value, reset ? null : partial);
            onProgress(visible("mode1"), visible("mode2"));
        });
        requestSlot().then(result => settle(slot, result), error => {
            if (isCurrent() && active.length > 1) reportError(slot.index + 1, error);
            settle(slot, null);
        });
    }
}

const STREAM_BATCH_MS = 50;

export function createStreamingLyricsBuffer({ scheduleTimer, cancelTimer, onFlush }) {
    let pending = null;

    function enqueue(payload) {
        if (pending) {
            pending.payload = payload;
            return;
        }
        const batch = { payload, timer: null };
        pending = batch;
        batch.timer = scheduleTimer(() => {
            if (pending !== batch) return;
            pending = null;
            onFlush(batch.payload);
        }, STREAM_BATCH_MS);
    }

    function clear() {
        if (!pending) return;
        const batch = pending;
        pending = null;
        cancelTimer(batch.timer);
    }

    function clearForPresentation(sequence) {
        if (pending?.payload.presentationSeq === sequence) clear();
    }

    return { enqueue, clear, clearForPresentation };
}
