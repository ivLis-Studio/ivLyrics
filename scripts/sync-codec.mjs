// Explicit source-of-truth copy; no build-time dependency on the sibling repo.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = new URL('../SyncDataCodec.js', import.meta.url);
const destination = new URL('../../ivLyrics-backend/src/vendor/SyncDataCodec.cjs', import.meta.url);
const bytes = await readFile(source);
if (process.argv.includes('--check')) {
  if (!bytes.equals(await readFile(destination))) throw new Error('Backend sync codec differs. Run node scripts/sync-codec.mjs.');
} else {
  await mkdir(new URL('.', destination), {recursive:true});
  await writeFile(destination, bytes);
}
const goldenSource = new URL('../tests/fixtures/sync-v6-golden.json', import.meta.url);
const golden = await readFile(goldenSource);
for (const relative of [
  '../../ivLyrics-backend/test/fixtures/sync-v6-golden.json',
  '../../ivLyrics-IOS/scripts/fixtures/sync-v6-golden.json',
  '../../ivLyrics-Android/ivLyrics-Android/tests/fixtures/sync-v6-golden.json',
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
