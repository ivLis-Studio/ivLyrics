import { clampSyncOffset } from "./globalSyncOffset.mjs";

export function createTrackSyncOffsetEdits({ readOffset, writeOffset, publishOffset, reportError }) {
    const edits = new Map();
    const pendingWrites = new Map();
    const reads = new Map();
    let writing = false;

    async function getOffset(uri) {
        const edit = edits.get(uri);
        if (edit) return edit.offset;
        const existing = reads.get(uri);
        if (existing) return existing.promise;

        const read = {};
        read.promise = Promise.resolve().then(() => readOffset(uri)).then(offset =>
            edits.get(uri)?.offset ?? read.settledOffset ?? offset
        ).finally(() => reads.delete(uri));
        reads.set(uri, read);
        return read.promise;
    }

    function settleEdit(uri, edit, offset) {
        if (edits.get(uri) !== edit) return;
        edits.delete(uri);
        const read = reads.get(uri);
        if (read) read.settledOffset = offset;
        publishOffset(uri, offset);
    }

    async function restoreStoredOffset(uri, edit) {
        let offset = 0;
        try {
            offset = await readOffset(uri);
        } catch (error) {
            reportError("[ivLyrics] Failed to reload the stored track offset:", error);
        }
        settleEdit(uri, edit, offset);
    }

    async function writePendingOffsets() {
        writing = true;
        try {
            while (pendingWrites.size) {
                const [uri, edit] = pendingWrites.entries().next().value;
                pendingWrites.delete(uri);
                let saved = false;
                try {
                    saved = await writeOffset(uri, edit.offset);
                } catch (error) {
                    reportError("[ivLyrics] Failed to persist track sync offset:", error);
                }
                if (edits.get(uri) !== edit) continue;
                if (saved) settleEdit(uri, edit, edit.offset);
                else void restoreStoredOffset(uri, edit);
            }
        } finally {
            writing = false;
        }
    }

    function queueOffset(uri, value) {
        if (!uri) return;
        const edit = { offset: clampSyncOffset(value) };
        edits.set(uri, edit);
        pendingWrites.set(uri, edit);
        publishOffset(uri, edit.offset);
        if (!writing) void writePendingOffsets();
    }

    return { getOffset, queueOffset };
}
