import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = readFileSync(new URL('../.github/scripts/lrclib_local_database_worker.mjs', import.meta.url), 'utf8');
const buildSource = readFileSync(new URL('../.github/scripts/build_lrclib_local_runtime.mjs', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../LrclibLocalDatabaseRuntime.js', import.meta.url), 'utf8');
const DATABASE_NAME = 'lrclib.sqlite3';
const MAX_READ_BYTES = 2 * 1024 * 1024;
const WASM_SHA256 = '5384bc7d80d7981c2516f3ad6b02d886629985d178e5037e765d655f440bbf9f';
const SQLite = Object.freeze({
    SQLITE_OK: 0,
    SQLITE_READONLY: 8,
    SQLITE_IOERR: 10,
    SQLITE_CANTOPEN: 14,
    SQLITE_IOERR_SHORT_READ: 522,
    SQLITE_OPEN_READONLY: 0x1,
    SQLITE_OPEN_READWRITE: 0x2,
    SQLITE_OPEN_CREATE: 0x4,
    SQLITE_OPEN_MAIN_DB: 0x100,
    SQLITE_OPEN_TEMP_DB: 0x200,
    SQLITE_OPEN_MAIN_JOURNAL: 0x800,
    SQLITE_OPEN_WAL: 0x80000,
    SQLITE_ACCESS_EXISTS: 0,
    SQLITE_ACCESS_READWRITE: 1,
    SQLITE_ACCESS_READ: 2,
    SQLITE_IOCAP_IMMUTABLE: 0x2000,
});
const READONLY_MAIN = SQLite.SQLITE_OPEN_READONLY | SQLite.SQLITE_OPEN_MAIN_DB;

function sourceSlice(startMarker, endMarker) {
    const start = workerSource.indexOf(startMarker);
    assert.notEqual(start, -1, `missing worker declaration: ${startMarker}`);
    const end = workerSource.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(end, -1, `missing worker boundary: ${endMarker}`);
    return workerSource.slice(start, end);
}

const vfsDeclaration = sourceSlice('class ReadOnlyFileVFS extends Base {', '\nlet sqlite,');

// Do not dump the 800 KB generated assignment or its WASM literal on a failure.
function evaluate(source, context, filename) {
    try {
        new vm.Script(source, { filename }).runInContext(context, { timeout: 1000 });
    } catch (error) {
        throw new Error(`${filename}: ${error.name}: ${error.message}`);
    }
}

function createVfs({ size = 100 * 1024 ** 3 + 123, readSlice } = {}) {
    const slices = [], reads = [];
    let fullFileReads = 0;
    const file = {
        size,
        slice(start, end) {
            const part = Object.freeze({ start, end });
            slices.push(part);
            return part;
        },
        arrayBuffer() {
            fullFileReads++;
            throw new Error('reading the whole database is forbidden');
        },
    };
    class FileReaderSync {
        readAsArrayBuffer(part) {
            assert.ok(slices.includes(part), 'FileReaderSync must receive a slice of the selected file');
            reads.push(part);
            if (readSlice) return readSlice(part);
            const length = Math.max(0, Math.min(part.end, size) - Math.min(part.start, size));
            return Uint8Array.from({ length }, (_, index) => (part.start + index) % 251).buffer;
        }
    }
    const context = vm.createContext({ Base: class {}, SQLite, DATABASE_NAME, FileReaderSync });
    evaluate(`${vfsDeclaration}\nglobalThis.TestVFS = ReadOnlyFileVFS;`, context, 'ReadOnlyFileVFS.slice.js');
    return {
        vfs: new context.TestVFS(file), file, slices, reads,
        get fullFileReads() { return fullFileReads; },
    };
}

function openMain(harness, id = 1, name = DATABASE_NAME) {
    const out = new DataView(new ArrayBuffer(4));
    assert.equal(harness.vfs.xOpen(name, id, READONLY_MAIN, out), SQLite.SQLITE_OK);
    assert.equal(out.getInt32(0, true), SQLite.SQLITE_OPEN_READONLY);
    return id;
}

test('VFS opens the selected main database read-only by basename or absolute path', () => {
    const h = createVfs();
    for (const [index, name] of [DATABASE_NAME, `/fixtures/${DATABASE_NAME}`].entries()) {
        const id = openMain(h, index + 1, name);
        const out = new DataView(new ArrayBuffer(8));
        assert.equal(h.vfs.xFileSize(id, out), SQLite.SQLITE_OK);
        assert.equal(out.getBigInt64(0, true), BigInt(h.file.size));
    }
    assert.equal(h.slices.length, 0, 'opening a handle does not read the database');
    assert.equal(h.fullFileReads, 0);
});

test('VFS rejects other filenames, sidecars, writable opens and non-main database opens', () => {
    const h = createVfs();
    const cases = [
        ...[null, undefined, '', 'other.sqlite3', 'not-lrclib.sqlite3',
            ...['-wal', '-shm', '-journal'].flatMap(suffix => [DATABASE_NAME + suffix, `/fixtures/${DATABASE_NAME}${suffix}`])]
            .map(name => ({ name, flags: READONLY_MAIN })),
        ...[0, SQLite.SQLITE_OPEN_MAIN_DB, SQLite.SQLITE_OPEN_READONLY,
            SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_MAIN_DB,
            SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_MAIN_DB,
            SQLite.SQLITE_OPEN_READONLY | SQLite.SQLITE_OPEN_TEMP_DB,
            SQLite.SQLITE_OPEN_READONLY | SQLite.SQLITE_OPEN_MAIN_JOURNAL,
            SQLite.SQLITE_OPEN_READONLY | SQLite.SQLITE_OPEN_WAL]
            .map(flags => ({ name: DATABASE_NAME, flags })),
    ];
    for (const [index, { name, flags }] of cases.entries()) {
        const bytes = new Uint8Array(4).fill(0xa5);
        const id = index + 1;
        assert.equal(h.vfs.xOpen(name, id, flags, new DataView(bytes.buffer)), SQLite.SQLITE_CANTOPEN,
            `name=${String(name)}, flags=${flags}`);
        assert.deepEqual(bytes, new Uint8Array(4).fill(0xa5), 'failed opens leave output flags untouched');
        assert.equal(h.vfs.xRead(id, new Uint8Array(4), 0), SQLite.SQLITE_IOERR, 'failed handles cannot read');
    }
    assert.equal(h.slices.length, 0);
    assert.equal(h.reads.length, 0);
});

test('VFS reads only the requested slice and preserves bytes outside the destination view', () => {
    const h = createVfs();
    const id = openMain(h);
    const backing = new Uint8Array(32).fill(0xa5);
    const destination = backing.subarray(7, 23);
    const offset = 8193;
    assert.equal(h.vfs.xRead(id, destination, offset), SQLite.SQLITE_OK);
    assert.deepEqual(h.slices, [{ start: offset, end: offset + destination.length }]);
    assert.deepEqual(h.reads, h.slices);
    assert.deepEqual(destination, Uint8Array.from({ length: 16 }, (_, index) => (offset + index) % 251));
    assert.deepEqual(backing.subarray(0, 7), new Uint8Array(7).fill(0xa5));
    assert.deepEqual(backing.subarray(23), new Uint8Array(9).fill(0xa5));
    assert.equal(h.fullFileReads, 0);
});

test('VFS keeps page reads bounded, including the 2 MiB maximum', () => {
    const h = createVfs();
    const id = openMain(h);
    for (const length of [512, 4096, 65536, MAX_READ_BYTES]) {
        const destination = new Uint8Array(length);
        assert.equal(h.vfs.xRead(id, destination, 4096), SQLite.SQLITE_OK, `read length ${length}`);
        assert.deepEqual(h.slices.at(-1), { start: 4096, end: 4096 + length });
        assert.equal(destination[0], 4096 % 251);
        assert.equal(destination.at(-1), (4096 + length - 1) % 251);
    }
    assert.equal(h.slices.length, 4);
    assert.equal(h.reads.length, 4);
    assert.equal(h.fullFileReads, 0);
});

test('VFS preserves requested offsets across and well above the 4 GiB boundary', () => {
    const h = createVfs();
    const id = openMain(h);
    for (const offset of [2 ** 32 - 8, 2 ** 32, 2 ** 32 + 0x123456, 100 * 1024 ** 3]) {
        const destination = new Uint8Array(32);
        assert.equal(h.vfs.xRead(id, destination, offset), SQLite.SQLITE_OK, `offset ${offset}`);
        assert.deepEqual(h.slices.at(-1), { start: offset, end: offset + 32 });
        assert.deepEqual(destination, Uint8Array.from({ length: 32 }, (_, index) => (offset + index) % 251));
    }
    assert.equal(h.fullFileReads, 0);
});

test('VFS returns IOERR_SHORT_READ and zero-fills the unread tail at EOF', () => {
    const h = createVfs({ size: 16 });
    const id = openMain(h);
    const backing = new Uint8Array(12).fill(0xa5);
    const destination = backing.subarray(2, 10);
    assert.equal(h.vfs.xRead(id, destination, 13), SQLite.SQLITE_IOERR_SHORT_READ);
    assert.deepEqual(destination, Uint8Array.of(13, 14, 15, 0, 0, 0, 0, 0));
    assert.deepEqual(h.slices, [{ start: 13, end: 21 }]);
    assert.deepEqual(backing.subarray(0, 2), Uint8Array.of(0xa5, 0xa5));
    assert.deepEqual(backing.subarray(10), Uint8Array.of(0xa5, 0xa5));
    assert.equal(h.fullFileReads, 0);
});

test('VFS zero-fills the whole destination for reads at or beyond EOF', () => {
    const h = createVfs({ size: 16 });
    const id = openMain(h);
    for (const offset of [16, 32, 2 ** 32 + 17]) {
        const destination = new Uint8Array(8).fill(0xa5);
        assert.equal(h.vfs.xRead(id, destination, offset), SQLite.SQLITE_IOERR_SHORT_READ);
        assert.deepEqual(destination, new Uint8Array(8));
        assert.deepEqual(h.slices.at(-1), { start: offset, end: offset + 8 });
    }
});

test('VFS rejects invalid offsets, oversized reads and unopened handles before touching the file', () => {
    const h = createVfs();
    const id = openMain(h);
    const destination = new Uint8Array(4).fill(0xa5);
    for (const offset of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '0', 0n, null, undefined]) {
        assert.equal(h.vfs.xRead(id, destination, offset), SQLite.SQLITE_IOERR, `offset ${String(offset)}`);
        assert.deepEqual(destination, new Uint8Array(4).fill(0xa5));
    }
    const oversized = new Uint8Array(MAX_READ_BYTES + 1).fill(0xa5);
    assert.equal(h.vfs.xRead(id, oversized, 0), SQLite.SQLITE_IOERR);
    assert.equal(oversized.every(byte => byte === 0xa5), true);
    assert.equal(h.vfs.xRead(999, destination, 0), SQLite.SQLITE_IOERR);
    assert.equal(h.slices.length, 0);
    assert.equal(h.reads.length, 0);
    assert.equal(h.fullFileReads, 0);
});

test('VFS converts slice and FileReaderSync failures to IOERR', () => {
    for (const failure of ['slice', 'reader']) {
        const h = createVfs({ readSlice() { throw new Error('unreadable slice'); } });
        const id = openMain(h);
        if (failure === 'slice') h.file.slice = () => { throw new Error('file unavailable'); };
        const destination = new Uint8Array(8).fill(0xa5);
        assert.equal(h.vfs.xRead(id, destination, 0), SQLite.SQLITE_IOERR, failure);
        assert.deepEqual(destination, new Uint8Array(8).fill(0xa5));
        assert.equal(h.fullFileReads, 0);
    }
});

test('VFS reports 64-bit file sizes and closes each handle independently', () => {
    const h = createVfs();
    const first = openMain(h, 11), second = openMain(h, 12);
    const size = new DataView(new ArrayBuffer(8));
    assert.equal(h.vfs.xFileSize(first, size), SQLite.SQLITE_OK);
    assert.equal(size.getBigInt64(0, true), BigInt(h.file.size));
    assert.equal(h.vfs.xClose(first), SQLite.SQLITE_OK);
    assert.equal(h.vfs.xRead(first, new Uint8Array(4), 0), SQLite.SQLITE_IOERR);
    size.setBigInt64(0, -1n, true);
    assert.equal(h.vfs.xFileSize(first, size), SQLite.SQLITE_IOERR);
    assert.equal(size.getBigInt64(0, true), -1n);
    assert.equal(h.vfs.xRead(second, new Uint8Array(4), 0), SQLite.SQLITE_OK);
    assert.equal(h.vfs.xFileSize(second, size), SQLite.SQLITE_OK);
    assert.equal(size.getBigInt64(0, true), BigInt(h.file.size));
    assert.equal(h.vfs.xClose(second), SQLite.SQLITE_OK);
    assert.equal(h.vfs.xRead(second, new Uint8Array(4), 0), SQLite.SQLITE_IOERR);
});

test('VFS rejects writes, truncation and deletion and advertises immutable storage', () => {
    const h = createVfs();
    const id = openMain(h);
    const originalSize = h.file.size;
    assert.equal(h.vfs.xWrite(id, Uint8Array.of(1, 2, 3), 0), SQLite.SQLITE_READONLY);
    assert.equal(h.vfs.xTruncate(id, 0), SQLite.SQLITE_READONLY);
    for (const suffix of ['', '-wal', '-journal']) {
        assert.equal(h.vfs.xDelete(DATABASE_NAME + suffix, 1), SQLite.SQLITE_READONLY);
    }
    assert.equal(h.vfs.xDeviceCharacteristics(id), SQLite.SQLITE_IOCAP_IMMUTABLE);
    assert.equal(h.file.size, originalSize);
    assert.equal(h.slices.length, 0, 'mutation requests must not touch the file');
    const destination = new Uint8Array(4);
    assert.equal(h.vfs.xRead(id, destination, 0), SQLite.SQLITE_OK);
    assert.deepEqual(destination, Uint8Array.of(0, 1, 2, 3));
});

test('VFS access reports only the main database and no WAL, SHM or journal sidecars', () => {
    const h = createVfs();
    const out = new DataView(new ArrayBuffer(4));
    for (const name of [DATABASE_NAME, `/fixtures/${DATABASE_NAME}`]) {
        for (const flags of [SQLite.SQLITE_ACCESS_EXISTS, SQLite.SQLITE_ACCESS_READ]) {
            out.setInt32(0, -1, true);
            assert.equal(h.vfs.xAccess(name, flags, out), SQLite.SQLITE_OK);
            assert.equal(out.getInt32(0, true), 1);
        }
    }
    for (const name of [null, '', 'other.sqlite3', ...['-wal', '-shm', '-journal']
        .flatMap(suffix => [DATABASE_NAME + suffix, `/fixtures/${DATABASE_NAME}${suffix}`])]) {
        for (const flags of [SQLite.SQLITE_ACCESS_EXISTS, SQLite.SQLITE_ACCESS_READ, SQLite.SQLITE_ACCESS_READWRITE]) {
            out.setInt32(0, -1, true);
            assert.equal(h.vfs.xAccess(name, flags, out), SQLite.SQLITE_OK);
            assert.equal(out.getInt32(0, true), 0, `${String(name)}, access=${flags}`);
        }
    }
    assert.equal(h.slices.length, 0);
    assert.equal(h.fullFileReads, 0);
});

test('worker imports local build dependencies and never requests whole-file ArrayBuffers', () => {
    const imports = [...workerSource.matchAll(/^import\s+.+?\s+from\s+['"]([^'"]+)['"];?$/gm)]
        .map(match => match[1]);
    assert.deepEqual(imports, [
        'wa-sqlite/dist/wa-sqlite.mjs', 'wa-sqlite', 'wa-sqlite/src/VFS.js', 'ivlyrics-sqlite-wasm',
    ]);
    assert.equal(/\b(?:fetch|importScripts|XMLHttpRequest|WebSocket)\s*\(/.test(workerSource), false);
    assert.equal(/\bimport\s*\(/.test(workerSource), false);
    assert.equal(/\.\s*arrayBuffer\s*\(/.test(workerSource), false);
    assert.equal(/readAsArrayBuffer\s*\(\s*file\s*\)/.test(workerSource), false);
});

test('runtime builder pins wa-sqlite and its WASM and inlines the dependency graph', () => {
    assert.equal(/metadata\.version\s*!==\s*['"]1\.0\.0['"]/.test(buildSource), true);
    assert.equal(buildSource.includes(`wasmHash !== '${WASM_SHA256}'`), true);
    assert.equal(/bundle:\s*true/.test(buildSource), true);
    assert.equal(/format:\s*['"]iife['"]/.test(buildSource), true);
    assert.equal(/platform:\s*['"]browser['"]/.test(buildSource), true);
    assert.equal(buildSource.includes("wasm.toString('base64')"), true);
    assert.equal(runtimeSource.includes(`wa-sqlite 1.0.0; WASM SHA-256 ${WASM_SHA256}`), true);
});

test('bundled worker supplies the pinned WASM without network loading before engine startup', { timeout: 5000 }, async () => {
    const wrapper = vm.createContext({ window: {} }, { codeGeneration: { strings: false, wasm: false } });
    evaluate(runtimeSource, wrapper, 'LrclibLocalDatabaseRuntime.js');
    const bundled = wrapper.window.IvLyricsLocalLrclibWorkerSource;
    assert.equal(typeof bundled, 'string');
    assert.equal(/\bimport\s*(?:\(|['"{*])/.test(bundled), false, 'no unresolved or remote imports');
    assert.equal(/\bimportScripts\s*\(/.test(bundled), false, 'no runtime library loading');

    const networkCalls = [], slices = [];
    const network = name => () => {
        networkCalls.push(name);
        throw new Error(`unexpected network API: ${name}`);
    };
    let reachedStartup;
    const startup = new Promise(resolve => { reachedStartup = resolve; });
    const self = {
        location: { href: 'blob:https://ivlyrics.test/local-worker' },
        postMessage(message) { reachedStartup({ error: message.error?.code || 'unexpected worker reply' }); },
    };
    const header = new Uint8Array(100);
    header.set(Buffer.from('SQLite format 3\0'));
    header[16] = 2; // A valid 512-byte page size; no SQLite engine or fixture is needed.
    const file = {
        size: 512,
        slice(start, end) {
            const part = { start, end };
            slices.push(part);
            return part;
        },
        arrayBuffer() { throw new Error('whole-file reads are forbidden'); },
    };
    const context = vm.createContext({
        self, atob, URL, TextDecoder, TextEncoder,
        console: { log() {}, warn() {}, error() {} },
        fetch: network('fetch'), importScripts: network('importScripts'),
        XMLHttpRequest: network('XMLHttpRequest'), WebSocket: network('WebSocket'),
        FileReaderSync: class {
            readAsArrayBuffer(part) {
                assert.equal(slices.includes(part), true);
                assert.deepEqual(part, { start: 0, end: 100 });
                return header.buffer;
            }
        },
        WebAssembly: {
            RuntimeError: WebAssembly.RuntimeError,
            instantiate(bytes) {
                reachedStartup({ bytes: Buffer.from(bytes) });
                // Stop before compilation. Browser engine/query acceptance runs separately.
                return new Promise(() => {});
            },
            instantiateStreaming: network('WebAssembly.instantiateStreaming'),
        },
    }, { codeGeneration: { strings: false, wasm: false } });
    evaluate(bundled, context, 'LrclibLocalDatabaseWorker.bundle.js');
    assert.equal(typeof self.onmessage, 'function');
    assert.deepEqual(networkCalls, [], 'loading the bundled declarations does not fetch libraries');
    self.onmessage({ data: { id: 1, action: 'open', file } });
    const result = await startup;
    assert.equal(result.error, undefined, 'worker must reach WASM instantiation');
    assert.deepEqual(networkCalls, [], 'the embedded WASM bypasses the library fetch fallback');
    assert.deepEqual(slices, [{ start: 0, end: 100 }]);
    assert.deepEqual(result.bytes.subarray(0, 8), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    assert.equal(createHash('sha256').update(result.bytes).digest('hex'), WASM_SHA256);
});
