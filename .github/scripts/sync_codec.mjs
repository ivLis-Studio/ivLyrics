// Copies the canonical sync v6 codec and golden vectors into the sibling repositories.
// node .github/scripts/sync_codec.mjs          # copy
// node .github/scripts/sync_codec.mjs --check  # verify only
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSyncDataCodec } from '../../src/features/sync/SyncDataCodec.mjs';
const destination = new URL('../../../ivLyrics-backend/src/vendor/SyncDataCodec.cjs', import.meta.url);
// Keep the original CommonJS side of the vendor interface byte-for-byte.
const bytes = Buffer.from(`/* Canonical ivLyrics sync v6 codec. No host, UI, network or storage dependency.
 * The backend vendors this exact file as SyncDataCodec.cjs. Golden vectors are
 * shared with the backend; older native readers use the legacy GET view.
 * Update both copies through .github/scripts/sync_codec.mjs.
 */
(function (root, factory) {
  const api = factory();
  if (root) root.SyncDataCodec = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window, ${createSyncDataCodec.toString()});
`);
if (process.argv.includes('--check')) {
  if (!bytes.equals(await readFile(destination))) throw new Error('Backend sync codec differs. Run node .github/scripts/sync_codec.mjs.');
} else {
  await mkdir(new URL('.', destination), {recursive:true});
  await writeFile(destination, bytes);
}
const goldenSource = new URL('../../tests/fixtures/sync-v6-golden.json', import.meta.url);
const golden = await readFile(goldenSource);
for (const relative of [
  '../../../ivLyrics-backend/test/fixtures/sync-v6-golden.json',
  '../../../ivLyrics-IOS/scripts/fixtures/sync-v6-golden.json',
  '../../../ivLyrics-Android/ivLyrics-Android/tests/fixtures/sync-v6-golden.json',
]) {
  const destination = new URL(relative, import.meta.url);
  if (process.argv.includes('--check')) {
    if (!golden.equals(await readFile(destination))) throw new Error('Sync v6 golden vectors differ: ' + relative);
  } else {
    await mkdir(new URL('.', destination), { recursive: true });
    await writeFile(destination, golden);
  }
}
console.log('Sync v6 codec SHA256:', createHash('sha256').update(bytes).digest('hex'));
