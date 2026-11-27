import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import test, { after } from 'node:test';
import { Script } from 'node:vm';
import { unzipSync } from 'fflate';
import { buildPc } from '../.github/scripts/build_pc.mjs';
import { readPcStylesheet } from '../.github/scripts/pc_stylesheet.mjs';
import { recoverInterruptedBuild } from '../.github/scripts/pc_build_publish.mjs';

const prefix = 'ivLyrics/';
const outputNames = ['.ivlyrics-publish.sqlite', 'ivLyrics', 'ivLyrics.zip', 'ivLyrics.zip.sha256'];
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const releaseVersion = process.env.IVLYRICS_TEST_PACKAGE_VERSION;
const version = releaseVersion || '123.45.6';
const testBuild = releaseVersion ? null : mkdtempSync(join(tmpdir(), 'ivlyrics-package-test-'));
if (testBuild) {
  after(() => rmSync(testBuild, { recursive: true, force: true }));
  await buildPc({ directory: testBuild, version, zip: true });
}
const packageFile = (name) => testBuild ? readFileSync(join(testBuild, name)) : read(`dist/${name}`);
const archive = packageFile('ivLyrics.zip');
const files = unzipSync(archive);
const archivedFile = (path) => {
  assert.ok(files[prefix + path]?.length, `missing or empty: ${path}`);
  return Buffer.from(files[prefix + path]).toString('utf8');
};
const manifest = JSON.parse(archivedFile('manifest.json'));

test('the existing updaters can locate, verify and extract the package', () => {
  const hash = createHash('sha256').update(archive).digest('hex');
  assert.equal(packageFile('ivLyrics.zip.sha256').toString(), hash + '  ivLyrics.zip\n');
  assert.ok(Object.keys(files).every((path) => path.startsWith(prefix) &&
    !path.split('/').includes('..') && !path.includes('\\')));
  assert.equal(archivedFile('version.txt'), version + '\n');
  assert.equal(archivedFile('blacklist.json'), read('blacklist.json').toString('utf8').replace(/\r\n/g, '\n'));
  assert.equal(archivedFile('style.css'), readPcStylesheet());
  for (const path of [
    'index.js', 'style.css', 'updater/unix/register-updater-protocol.sh', 'updater/unix/ivlyrics-updater.sh',
    'updater/unix/linux-desktop-entry.sh',
    'updater/unix/ivlyrics-updater.applescript', 'updater/windows/register-updater-protocol.ps1',
    'updater/windows/ivlyrics-updater.ps1', 'updater/windows/updater-path-utils.ps1',
    manifest.preview, manifest.readme, 'docs/assets/preview_readme_en.png', 'docs/assets/preview_readme_ko.png',
  ]) archivedFile(path);
});

test('an output collision leaves the prior app directory and install ZIP intact', async context => {
  const directory = mkdtempSync(join(tmpdir(), 'ivlyrics-failed-package-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'ivLyrics'));
  writeFileSync(join(directory, 'ivLyrics/version.txt'), version + '\n');
  writeFileSync(join(directory, 'ivLyrics.zip'), archive);
  mkdirSync(join(directory, 'ivLyrics.zip.sha256'));
  writeFileSync(join(directory, 'ivLyrics.zip.sha256/marker'), 'keep');

  const replacement = version === '1234.56.7' ? '1234.56.8' : '1234.56.7';
  await assert.rejects(buildPc({ directory, version: replacement, zip: true }), /Cannot replace build output/);
  assert.equal(readFileSync(join(directory, 'ivLyrics/version.txt'), 'utf8'), version + '\n');
  assert.deepEqual(readFileSync(join(directory, 'ivLyrics.zip')), archive);
  assert.equal(readFileSync(join(directory, 'ivLyrics.zip.sha256/marker'), 'utf8'), 'keep');
  assert.deepEqual(readdirSync(directory).sort(), outputNames);
});

test('concurrent package builds leave one coherent directory, ZIP and checksum', async context => {
  const directory = mkdtempSync(join(tmpdir(), 'ivlyrics-concurrent-package-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const versions = ['1234.56.7', '1234.56.8'];
  const results = await Promise.allSettled(versions.map(candidate => buildPc({ directory, version: candidate, zip: true })));
  assert.ok(results.some(result => result.status === 'fulfilled'));
  for (const result of results) {
    if (result.status === 'rejected') assert.match(result.reason.message, /Another build is publishing/);
  }
  const outputVersion = readFileSync(join(directory, 'ivLyrics/version.txt'), 'utf8');
  assert.ok(versions.includes(outputVersion.trim()));
  const outputArchive = readFileSync(join(directory, 'ivLyrics.zip'));
  assert.equal(Buffer.from(unzipSync(outputArchive)[prefix + 'version.txt']).toString(), outputVersion);
  assert.equal(readFileSync(join(directory, 'ivLyrics.zip.sha256'), 'utf8'),
    createHash('sha256').update(outputArchive).digest('hex') + '  ivLyrics.zip\n');
  assert.deepEqual(readdirSync(directory).sort(), outputNames);
});

test('a killed publisher releases the lock and its replacement can be rolled back', async context => {
  const directory = mkdtempSync(join(tmpdir(), 'ivlyrics-interrupted-package-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'ivLyrics'));
  writeFileSync(join(directory, 'ivLyrics/version.txt'), version + '\n');
  writeFileSync(join(directory, 'ivLyrics.zip'), archive);
  writeFileSync(join(directory, 'ivLyrics.zip.sha256'), packageFile('ivLyrics.zip.sha256'));

  const replacement = version === '1234.56.7' ? '1234.56.8' : '1234.56.7';
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    import { join } from 'node:path';
    const [moduleUrl, directory, version] = process.argv.slice(1);
    const fs = createRequire(moduleUrl)('node:fs/promises');
    const rename = fs.rename;
    fs.rename = async (from, to) => {
      await rename(from, to);
      if (to === join(directory, 'ivLyrics.zip')) {
        process.stdout.write('Replaced ZIP before checksum\\n', () => process.kill(process.pid, 'SIGKILL'));
        await new Promise(() => {});
      }
    };
    syncBuiltinESMExports();
    const { buildPc } = await import(moduleUrl);
    await buildPc({ directory, version, zip: true });
  `, new URL('../.github/scripts/build_pc.mjs', import.meta.url).href, directory, replacement], {
    encoding: 'utf8', timeout: 20000,
  });
  assert.ifError(child.error);
  assert.notEqual(child.status, 0);
  assert.match(child.stdout, /Replaced ZIP before checksum/, child.stderr);
  assert.equal(readFileSync(join(directory, 'ivLyrics/version.txt'), 'utf8'), replacement + '\n');
  assert.notDeepEqual(readFileSync(join(directory, 'ivLyrics.zip')), archive);

  await recoverInterruptedBuild(directory);
  await recoverInterruptedBuild(directory);
  assert.equal(readFileSync(join(directory, 'ivLyrics/version.txt'), 'utf8'), version + '\n');
  assert.deepEqual(readFileSync(join(directory, 'ivLyrics.zip')), archive);
  assert.deepEqual(readFileSync(join(directory, 'ivLyrics.zip.sha256')), packageFile('ivLyrics.zip.sha256'));
  assert.deepEqual(readdirSync(directory).sort(), outputNames);
});

test('prebuilt assets preserve the page and extension entry points and offline SQLite', () => {
  assert.deepEqual(manifest.subfiles, []);
  assert.deepEqual(manifest.subfiles_extension, ['startup.js']);
  const page = archivedFile('index.js');
  const startup = archivedFile('startup.js');
  // The Spicetify route module evaluates index.js inside a strict module
  // function and resolves its render binding from that same scope.
  assert.doesNotThrow(() => new Script(`(function() { "use strict";\n${page}\nreturn render; })`));
  assert.match(page, /function render\(\) \{ return __ivLyricsPage\.render\(\); \}/);
  assert.doesNotThrow(() => new Script(startup));
  assert.ok(!startup.includes('IvLyricsLocalLrclibWorkerSource'));
  assert.ok(startup.includes('ivlyrics-local-database-worker.js'));
  assert.ok(startup.includes('wa-sqlite 1.0.0; WASM SHA-256'));
  for (const bundle of [page, startup]) {
    assert.ok(bundle.includes(`window.ivLyricsVersion = "${version}"`));
    assert.ok(!bundle.includes('IVLYRICS_BUILD_VERSION'));
    assert.ok(!bundle.includes('sourceMappingURL='));
  }
});

test('only runtime payload and documentation are shipped with license notices', () => {
  for (const path of ['LICENSE', 'third_party/lyrics-plus.LGPL-2.1.txt', 'third_party/TinySegmenter.LICENSE.txt',
    'third_party/spicetify-visualizer.LICENSE', 'third_party/preact/LICENSE', 'README.md', 'README_EN.md']) {
    assert.equal(archivedFile(path), read(path).toString().replace(/\r\n/g, '\n'));
  }
  assert.ok(!files[prefix + 'TinySegmenter.LICENSE.txt']);
  assert.ok(!files[prefix + 'NOTICE.md']);
  for (const dir of ['src', 'mobile', '.github', 'node_modules', 'tests', 'langs']) {
    assert.ok(!Object.keys(files).some((path) => path.startsWith(prefix + dir + '/')));
  }
});

test('relative links in packaged guides resolve within the install archive', () => {
  for (const path of ['README.md', 'README_EN.md', manifest.readme, 'updater/README.md']) {
    const guide = archivedFile(path);
    for (const [, target] of guide.matchAll(/\]\(([^\s()]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|[#/])/i.test(target)) continue;
      const resolved = posix.join(posix.dirname(path), target.split(/[?#]/, 1)[0]);
      assert.ok(files[prefix + resolved]?.length, `${path} links to missing archive file ${resolved}`);
    }
  }
});

const originalLicense = readFileSync(new URL('../third_party/spicetify-visualizer.LICENSE', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n').trim();

// Each README ends with its unofficial project notice, shown expanded after the license notices.
const unofficialNoticeHeadings = {
  'README.md': '## 비공식 프로젝트·저작권·이용 안내',
  'README_EN.md': '## Unofficial project, copyright, and terms',
};

for (const path of ['README.md', 'README_EN.md']) {
  test(`${path} closes its license notices with the original visualizer MIT copyright, permission, and warranty notice`, () => {
    assert.match(originalLicense, /^MIT License\n\nCopyright \(c\) 2026 Konsl\n/);
    assert.match(originalLicense, /Permission is hereby granted, free of charge,/);
    assert.match(originalLicense, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,/);

    const readme = archivedFile(path);
    const noticeOffset = readme.indexOf(originalLicense);
    assert.ok(noticeOffset >= 0, `${path} must reproduce the entire original visualizer MIT license verbatim`);
    // Only closing markup may follow the license text, then the final unofficial project notice section.
    const [closingMarkup, ...laterSections] = readme.slice(noticeOffset + originalLicense.length).split(/^(?=## )/m);
    assert.match(closingMarkup, /^(?:```|<\/details>|\s)*$/,
      `${path} must close the license notice before any other content`);
    assert.deepEqual(laterSections.map((section) => section.split('\n', 1)[0]), [unofficialNoticeHeadings[path]],
      `${path} may follow the license notice only with the unofficial project notice`);
  });
}
