import { checkAbort, error, normalizeError } from './localLrclibErrors.mjs';
import { isOwnedFile } from './localLrclibReferenceStore.mjs';

const DIRECTORY = 'ivlyrics-lrclib-local';
const QUOTA_INTERVAL = 16 * 1024 * 1024;
const WRITE_CHUNK = 1024 * 1024;
const SQLITE_HEADER = Array.from('SQLite format 3\0', char => char.charCodeAt(0));
const hasSqliteHeader = bytes => bytes.length >= SQLITE_HEADER.length
    && SQLITE_HEADER.every((byte, index) => bytes[index] === byte);

export function createLocalLrclibFiles(root, { stage }) {
    function uniqueId() {
        if (typeof root.crypto?.randomUUID === 'function') return root.crypto.randomUUID().replace(/-/g, '');
        if (!root.crypto?.getRandomValues) throw error('unsupported');
        return Array.from(root.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function getDirectory(create = false) {
        const storage = root.navigator?.storage;
        if (!storage?.getDirectory) throw error('unsupported');
        const directory = await storage.getDirectory();
        return directory.getDirectoryHandle(DIRECTORY, { create });
    }
    async function removeOwned(record, directory) {
        if (!isOwnedFile(record)) return false;
        try {
            const ownDirectory = directory || await getDirectory();
            await ownDirectory.removeEntry(record.opfsName);
            return true;
        } catch (reason) {
            // Keep the journal entry on transient failures so restart can retry.
            return reason?.name === 'NotFoundError';
        }
    }
    async function fileType(file) {
        if (!file || !Number.isSafeInteger(file.size) || file.size < 2
            || typeof file.slice !== 'function' || typeof file.name !== 'string') throw error('invalidFile');
        let bytes;
        try { bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()); }
        catch (reason) { throw normalizeError(reason, 'invalidFile'); }
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
        if (hasSqliteHeader(bytes)) return 'sqlite';
        throw error('invalidFile');
    }

    async function decompress(file, signal, temporary, onProgress) {
        if (typeof root.DecompressionStream !== 'function' || typeof root.TransformStream !== 'function'
            || typeof file.stream !== 'function') throw error('unsupported');
        const directory = await getDirectory(true);
        checkAbort(signal);
        let consumed = 0;
        let written = 0;
        let sampledAt = -QUOTA_INTERVAL;
        let remaining = Infinity;
        let lastProgress = 0;
        let prefix = null;
        async function ensureSpace(length) {
            if (written - sampledAt >= QUOTA_INTERVAL || remaining - (written - sampledAt) < length) {
                const estimate = await root.navigator.storage.estimate?.();
                checkAbort(signal);
                sampledAt = written;
                remaining = Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage)
                    ? Math.max(0, estimate.quota - estimate.usage) : Infinity;
            }
            if (remaining - (written - sampledAt) < length) throw error('noSpace');
        }
        await ensureSpace(1);
        temporary.record = { kind: 'opfs', opfsName: `ivlyrics-lrclib-${uniqueId()}.sqlite3` };
        temporary.directory = directory;
        // Commit recovery metadata before a file (or a large closed output) can
        // survive a reload. Successful activation removes this entry atomically.
        await stage(temporary.record, signal);
        checkAbort(signal);
        const handle = await directory.getFileHandle(temporary.record.opfsName, { create: true });
        checkAbort(signal);
        let writer;
        let reader;
        const abort = () => { if (reader) void reader.cancel().catch(() => {}); };
        signal.addEventListener('abort', abort, { once: true });
        try {
            writer = await handle.createWritable();
            checkAbort(signal);
            reader = file.stream().pipeThrough(new root.TransformStream({
                transform(chunk, controller) { consumed += chunk.byteLength; controller.enqueue(chunk); }
            })).pipeThrough(new root.DecompressionStream('gzip')).getReader();
            while (true) {
                checkAbort(signal);
                const result = await reader.read();
                checkAbort(signal);
                if (result.done) break;
                let value = result.value;
                if (written === 0) {
                    if (prefix) {
                        const joined = new Uint8Array(prefix.length + value.length);
                        joined.set(prefix);
                        joined.set(value, prefix.length);
                        value = joined;
                    }
                    if (value.length < SQLITE_HEADER.length) {
                        prefix = value;
                        continue;
                    }
                    if (!hasSqliteHeader(value)) throw error('invalidFile');
                    prefix = null;
                }
                for (let offset = 0; offset < value.byteLength; offset += WRITE_CHUNK) {
                    const chunk = value.subarray(offset, offset + WRITE_CHUNK);
                    await ensureSpace(chunk.byteLength);
                    checkAbort(signal);
                    await writer.write(chunk);
                    written += chunk.byteLength;
                    checkAbort(signal);
                }
                const now = Date.now();
                if (now - lastProgress >= 100) {
                    lastProgress = now;
                    onProgress({ bytesWritten: written, progress: Math.min(0.99, consumed / file.size) });
                }
            }
            if (written < SQLITE_HEADER.length) throw error('invalidFile');
            await writer.close();
            writer = null;
            checkAbort(signal);
            onProgress({ bytesWritten: written, progress: 0.99 });
            return await handle.getFile();
        } catch (reason) {
            if (writer) { try { await writer.abort(); } catch (_) { /* Cleanup continues below. */ } }
            throw signal.aborted ? error('canceled') : normalizeError(reason, 'invalidFile');
        } finally {
            signal.removeEventListener('abort', abort);
            if (reader) {
                try { await reader.cancel(); } catch (_) { /* Already errored/closed. */ }
                reader.releaseLock();
            }
        }
    }

    return { getDirectory, fileType, decompress, removeOwned, uniqueId };
}
