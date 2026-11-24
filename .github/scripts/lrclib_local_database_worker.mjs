// This worker is bundled with its pinned SQLite WASM. It never uses a server.
import SQLiteFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { Base } from 'wa-sqlite/src/VFS.js';
import wasmBase64 from 'ivlyrics-sqlite-wasm';

const fail = code => Object.assign(new Error(code), { code });
const DATABASE_NAME = 'lrclib.sqlite3';
const PAGE_CACHE_BYTES = 8 * 1024 * 1024;

class ReadOnlyFileVFS extends Base {
  name = 'ivlyrics-file';
  files = new Set();
  constructor(file) { super(); this.file = file; this.reader = new FileReaderSync(); }
  xOpen(name, id, flags, out) {
    if (!(flags & SQLite.SQLITE_OPEN_READONLY) || !(flags & SQLite.SQLITE_OPEN_MAIN_DB)
        || (name !== DATABASE_NAME && !String(name).endsWith('/' + DATABASE_NAME))) return SQLite.SQLITE_CANTOPEN;
    this.files.add(id);
    out.setInt32(0, SQLite.SQLITE_OPEN_READONLY, true);
    return SQLite.SQLITE_OK;
  }
  xClose(id) { this.files.delete(id); return SQLite.SQLITE_OK; }
  xRead(id, destination, offset) {
    if (!this.files.has(id) || !Number.isSafeInteger(offset) || offset < 0 || destination.length > 2 * 1024 * 1024) return SQLite.SQLITE_IOERR;
    try {
      // File.slice addresses the original file, including offsets above 4 GB.
      // Only the requested SQLite pages are copied, not the whole database.
      const bytes = new Uint8Array(this.reader.readAsArrayBuffer(this.file.slice(offset, offset + destination.length)));
      destination.fill(0);
      destination.set(bytes);
      return bytes.length === destination.length ? SQLite.SQLITE_OK : SQLite.SQLITE_IOERR_SHORT_READ;
    } catch { return SQLite.SQLITE_IOERR; }
  }
  xFileSize(id, out) {
    if (!this.files.has(id)) return SQLite.SQLITE_IOERR;
    out.setBigInt64(0, BigInt(this.file.size), true);
    return SQLite.SQLITE_OK;
  }
  xAccess(name, _flags, out) {
    out.setInt32(0, name === DATABASE_NAME || String(name).endsWith('/' + DATABASE_NAME) ? 1 : 0, true);
    return SQLite.SQLITE_OK;
  }
  xWrite() { return SQLite.SQLITE_READONLY; }
  xTruncate() { return SQLite.SQLITE_READONLY; }
  xDelete() { return SQLite.SQLITE_READONLY; }
  xDeviceCharacteristics() { return SQLite.SQLITE_IOCAP_IMMUTABLE; }
}

let sqlite, db, vfs, hasLyricsfile = false, deadline = 0, trackIndex = '';
const identifier = name => '"' + String(name).replace(/"/g, '""') + '"';
const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[æœøłđðþß]/g, char => ({ æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ß: 'ss' })[char])
  .replace(/[`~!@#$%^&*()_|+\-=?;:",.<>\{\}\[\]\\\/\x00\n]/g, ' ').replace(/\s+/g, ' ').trim();

async function rows(sql, bindings = []) {
  const result = [];
  for await (const statement of sqlite.statements(db, sql)) {
    sqlite.bind_collection(statement, bindings);
    const columns = sqlite.column_names(statement);
    while (await sqlite.step(statement) === SQLite.SQLITE_ROW) {
      if (result.length >= 64) throw fail('invalidDatabase');
      result.push(Object.fromEntries(sqlite.row(statement).map((value, index) => [columns[index], value])));
    }
  }
  return result;
}

async function close() {
  if (db) { await sqlite.close(db); db = null; }
  if (vfs) { sqlite.vfs_unregister?.(vfs); vfs = null; }
}

async function open(file) {
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 100
      || typeof FileReaderSync !== 'function') throw fail('invalidFile');
  const header = new Uint8Array(new FileReaderSync().readAsArrayBuffer(file.slice(0, 100)));
  if (new TextDecoder().decode(header.slice(0, 16)) !== 'SQLite format 3\0') throw fail('invalidFile');
  const pageSize = header[16] === 0 && header[17] === 1 ? 65536 : header[16] * 256 + header[17];
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) || file.size % pageSize) throw fail('invalidDatabase');
  await close();
  if (!sqlite) {
    const bytes = Uint8Array.from(atob(wasmBase64), char => char.charCodeAt(0));
    const module = await SQLiteFactory({ wasmBinary: bytes, print() {}, printErr() {} });
    sqlite = SQLite.Factory(module);
  }
  vfs = new ReadOnlyFileVFS(file);
  sqlite.vfs_register(vfs, false);
  db = await sqlite.open_v2(DATABASE_NAME, SQLite.SQLITE_OPEN_READONLY, vfs.name);
  deadline = Date.now() + 2500;
  sqlite.progress_handler(db, 1000, () => Date.now() > deadline ? 1 : 0, null);
  await sqlite.exec(db, `PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA mmap_size=0; PRAGMA cache_size=-${PAGE_CACHE_BYTES / 1024}; PRAGMA temp_store=MEMORY;`);
  const tables = await rows("SELECT name, type FROM sqlite_master WHERE name IN ('tracks','lyrics')");
  if (tables.length !== 2 || tables.some(table => table.type !== 'table')) throw fail('invalidDatabase');
  const trackColumns = (await rows('PRAGMA table_info(tracks)')).map(row => row.name);
  const lyricColumns = (await rows('PRAGMA table_info(lyrics)')).map(row => row.name);
  if (!['id', 'name', 'name_lower', 'artist_name', 'artist_name_lower', 'album_name', 'album_name_lower', 'duration', 'last_lyrics_id']
      .every(column => trackColumns.includes(column))
      || !['id', 'plain_lyrics', 'synced_lyrics', 'instrumental'].every(column => lyricColumns.includes(column))) throw fail('invalidDatabase');
  // Do not turn a missing index into a full scan of a 100+ GB dump.
  trackIndex = '';
  for (const index of await rows('PRAGMA index_list(tracks)')) {
    if (index.partial) continue;
    const columns = await rows(`PRAGMA index_info(${identifier(index.name)})`);
    if (columns[0]?.name === 'name_lower') {
      trackIndex = index.name;
      if (columns[1]?.name === 'artist_name_lower') break;
    }
  }
  if (!trackIndex) throw fail('invalidDatabase');
  hasLyricsfile = lyricColumns.includes('lyricsfile');
  return { size: file.size };
}

async function lookup(info) {
  if (!db) return null;
  const title = normalize(info?.title || info?.name);
  const artist = normalize(info?.artist);
  const duration = Number(info?.duration) / 1000;
  if (!title || !artist || !Number.isFinite(duration) || duration <= 0) return null;
  const album = normalize(info.album);
  const artists = [...new Set([artist, normalize(String(info.artist).split(/[&,]/)[0])])];
  deadline = Date.now() + 2000;
  for (const candidateArtist of artists) {
    for (const includeAlbum of album ? [true, false] : [false]) {
      const bindings = [title, candidateArtist, duration - 15, duration + 15];
      if (includeAlbum) bindings.push(album);
      bindings.push(duration);
      const candidates = await rows(`SELECT t.id, t.name AS trackName, t.artist_name AS artistName,
        t.album_name AS albumName, t.duration, l.instrumental, l.plain_lyrics AS plainLyrics,
        l.synced_lyrics AS syncedLyrics, ${hasLyricsfile ? 'l.lyricsfile' : 'NULL'} AS lyricsfile
        FROM tracks AS t INDEXED BY ${identifier(trackIndex)} JOIN lyrics AS l ON l.id=t.last_lyrics_id
        WHERE t.name_lower=? AND t.artist_name_lower=? AND t.duration>=? AND t.duration<=?
        ${includeAlbum ? 'AND t.album_name_lower=?' : ''}
        ORDER BY (l.synced_lyrics IS NOT NULL) DESC, ABS(t.duration-?) ASC, t.id ASC LIMIT 8`, bindings);
      const candidate = candidates.find(row => row.instrumental || row.syncedLyrics?.trim() || row.plainLyrics?.trim() || row.lyricsfile?.trim());
      if (candidate) return { ...candidate, instrumental: candidate.instrumental === 1 };
    }
  }
  return null;
}

// SQLite calls on this connection may never overlap, even at await boundaries.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.catch(() => {}).then(async () => {
    try {
      const result = data.action === 'open' ? await open(data.file)
        : data.action === 'lookup' ? await lookup(data.info)
          : data.action === 'close' ? await close() : null;
      self.postMessage({ id: data.id, result });
    } catch (error) {
      self.postMessage({ id: data.id, error: { code: error?.code || 'invalidDatabase', message: 'Local LRCLIB database operation failed' } });
    }
  });
};
