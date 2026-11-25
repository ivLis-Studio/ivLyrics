// Package the entirely offline SQLite worker with the pinned wa-sqlite WASM.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

export async function buildLocalDatabaseWorker() {
  const packageRoot = dirname(require.resolve('wa-sqlite/package.json'));
  const metadata = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  if (metadata.version !== '1.0.0') throw new Error('Expected wa-sqlite 1.0.0');
  const wasm = readFileSync(resolve(packageRoot, 'dist/wa-sqlite.wasm'));
  const wasmHash = createHash('sha256').update(wasm).digest('hex');
  if (wasmHash !== '5384bc7d80d7981c2516f3ad6b02d886629985d178e5037e765d655f440bbf9f') {
    throw new Error('Unexpected SQLite WASM bytes');
  }

  const built = await build({
    absWorkingDir: root,
    entryPoints: ['.github/scripts/lrclib_local_database_worker.mjs'],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome110',
    define: { 'import.meta.url': '"file:///ivlyrics-local-database-worker.js"' },
    plugins: [{
      name: 'inline-wasm',
      setup(builder) {
        builder.onResolve({ filter: /^ivlyrics-sqlite-wasm$/ }, () => ({ path: 'wasm', namespace: 'inline' }));
        builder.onLoad({ filter: /.*/, namespace: 'inline' }, () => ({
          contents: 'export default ' + JSON.stringify(wasm.toString('base64')) + ';',
          loader: 'js',
        }));
      },
    }],
  });
  const license = readFileSync(resolve(packageRoot, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n');
  return {
    source: built.outputFiles[0].text,
    licenseNotice: '/*! wa-sqlite 1.0.0; WASM SHA-256 ' + wasmHash + '\n' + license + '\n*/',
  };
}
