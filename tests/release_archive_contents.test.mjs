import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const prefix = 'ivLyrics/';
const git = (...args) => execFileSync('git', args, {
  cwd: repository,
  maxBuffer: 128 * 1024 * 1024,
});

// Worktree attributes apply the proposed export policy before it is committed.
// Archive data and tar inspection stay in memory; neither changes the index.
const archive = git('archive', '--format=tar', '--worktree-attributes', `--prefix=${prefix}`, 'HEAD');
const tar = (...args) => execFileSync('tar', args, {
  input: archive,
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
});
const archivedPaths = new Set(tar('-tf', '-').trim().split('\n'));
const archivedFile = (path) => tar('-xOf', '-', `${prefix}${path}`);

test('release archives omit source folders while their files remain in the repository', () => {
  const trackedSources = git('ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', 'third_party')
    .toString('utf8').split('\0').filter(Boolean);

  for (const folder of ['third_party']) {
    const sources = trackedSources.filter((path) => path.startsWith(`${folder}/`));
    assert.ok(sources.length > 0, `${folder}/ must remain tracked source`);
    for (const path of sources) {
      assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} must remain in the checkout`);
    }
    const leakedPaths = [...archivedPaths].filter((path) =>
      path === `${prefix}${folder}` || path.startsWith(`${prefix}${folder}/`));
    assert.deepEqual(leakedPaths, [], `${folder}/ must not appear in a release archive`);
  }
});

test('release archives omit the local database worker source while it remains in the repository', () => {
  const workerSource = '.github/scripts/lrclib_local_database_worker.mjs';
  assert.ok(existsSync(new URL(`../${workerSource}`, import.meta.url)), `${workerSource} must remain in the checkout`);
  assert.equal(archivedPaths.has(`${prefix}${workerSource}`), false, `${workerSource} must not appear in a release archive`);
});

test('release archives retain the compiled local database bundle and every manifest runtime file', () => {
  const manifest = JSON.parse(archivedFile('manifest.json'));
  assert.ok(Array.isArray(manifest.subfiles) && manifest.subfiles.length > 0);
  assert.ok(Array.isArray(manifest.subfiles_extension) && manifest.subfiles_extension.length > 0);
  assert.ok(manifest.subfiles_extension.includes('LrclibLocalDatabaseRuntime.js'));

  const runtimeFiles = new Set([
    'manifest.json', 'index.js', 'style.css', 'version.txt', 'LrclibLocalDatabaseRuntime.js',
    'README.md', 'README_EN.md', 'marketplace.md', 'LICENSE', 'TinySegmenter.LICENSE.txt',
    ...manifest.subfiles,
    ...manifest.subfiles_extension,
  ]);
  for (const path of runtimeFiles) {
    assert.ok(archivedPaths.has(`${prefix}${path}`), `${path} must ship in release archives`);
  }
  assert.ok(archivedFile('LrclibLocalDatabaseRuntime.js').trim().length > 0,
    'the shipped local database runtime must not be empty');
});

const originalLicense = readFileSync(new URL('../third_party/spicetify-visualizer.LICENSE', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n').trim();

for (const path of ['README.md', 'README_EN.md']) {
  test(`${path} ends with the original visualizer MIT copyright, permission, and warranty notice`, () => {
    assert.match(originalLicense, /^MIT License\n\nCopyright \(c\) 2026 Konsl\n/);
    assert.match(originalLicense, /Permission is hereby granted, free of charge,/);
    assert.match(originalLicense, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,/);

    // Check the proposed README directly even before the parent commit. HEAD's
    // archived README is older then; this same check also runs in a clean CI checkout.
    const readme = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const noticeOffset = readme.indexOf(originalLicense);
    assert.ok(noticeOffset >= 0, `${path} must reproduce the entire original visualizer MIT license verbatim`);
    const trailingContent = readme.slice(noticeOffset + originalLicense.length).trim();
    assert.match(trailingContent, /^(?:```|<\/details>|\s)*$/,
      `${path} must place the license notice at the bottom, followed only by closing Markdown or HTML markup`);
  });
}
