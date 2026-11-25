function httpVideoUrl(value) {
    if (typeof value !== "string") return null;
    try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:" ? value : null;
    } catch {
        return null;
    }
}

const completionStatus = new Set(["completed", "alreadyexists", "already_exists"]);

async function readProgressStream(body, signal, onProgress) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let event = "";
    let lines = [];
    let receivedCompletionWithoutUrl = false;

    const finishFrame = () => {
        const eventName = event;
        const json = lines.join("\n");
        event = "";
        lines = [];
        if (!json) return null;
        let payload;
        try { payload = JSON.parse(json); } catch { return null; }
        if (!payload || typeof payload !== "object") return null;

        if (eventName === "error" || payload.status === "error") {
            const message = typeof payload.message === "string" && payload.message || "Download failed";
            if (eventName !== "complete" || !message.startsWith("WARNING")) throw new Error(message);
            return null;
        }
        if (completionStatus.has(payload.status)) {
            const url = httpVideoUrl(payload.url) || httpVideoUrl(payload.message);
            if (url) return url;
            receivedCompletionWithoutUrl = true;
            return null;
        }
        if (eventName === "progress") {
            onProgress?.({
                percent: payload.percent || 0,
                speed: payload.speed,
                eta: payload.eta,
                message: payload.message,
                status: payload.status,
            });
        }
        return null;
    };

    const parseLine = (rawLine) => {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (!line) return finishFrame();
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
        return null;
    };

    const stopReading = () => { reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", stopReading, { once: true });
    try {
        while (true) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            signal.throwIfAborted();
            buffer += decoder.decode(value, { stream: !done });
            const chunks = buffer.split("\n");
            buffer = chunks.pop();
            for (const line of chunks) {
                const url = parseLine(line);
                if (url) return { url };
            }
            if (done) {
                const url = parseLine(buffer) || finishFrame();
                return { url, receivedCompletionWithoutUrl };
            }
        }
    } finally {
        signal.removeEventListener("abort", stopReading);
        // The underlying source may take time to acknowledge cancellation.
        if (!signal.aborted) stopReading();
        reader.releaseLock();
    }
}

export async function readHelperVideoUrl(response, { signal, onProgress, readCachedVideo }) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const data = await response.json();
        const url = httpVideoUrl(data?.url);
        if (response.ok && data?.success && url) return url;
        throw new Error(data?.message || "Video request failed");
    }
    if (response.ok && contentType.includes("text/event-stream") && response.body) {
        const { url, receivedCompletionWithoutUrl } = await readProgressStream(response.body, signal, onProgress);
        if (url) return url;
        if (receivedCompletionWithoutUrl) {
            signal.throwIfAborted();
            const cached = await readCachedVideo();
            const cachedUrl = httpVideoUrl(cached?.url);
            if (cached?.success && cachedUrl) return cachedUrl;
        }
        throw new Error("Video download ended without a playable file.");
    }
    const text = await response.text();
    throw new Error("Unexpected response: " + text.substring(0, 100));
}
