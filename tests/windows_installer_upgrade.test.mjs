import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const canRun = process.platform === 'win32' ||
    spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { stdio: 'ignore' }).status === 0;
const builtVersion = process.env.IVLYRICS_TEST_PACKAGE_VERSION;

test('Windows installation and removal validate or restore the active profile', { skip: !canRun }, context => {
    const root = mkdtempSync(join(tmpdir(), 'ivlyrics-windows-upgrade-'));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const complete = builtVersion
        ? fileURLToPath(new URL('../dist/ivLyrics.zip', import.meta.url))
        : join(root, 'complete.zip');
    const broken = join(root, 'broken.zip');
    const mirror = join(root, 'mirror.zip');
    const files = {
        'ivLyrics/index.js': Buffer.from('function render() {}'),
        'ivLyrics/manifest.json': Buffer.from('{"name":"ivLyrics","subfiles_extension":["startup.js"]}'),
        'ivLyrics/style.css': Buffer.from('body {}'),
        'ivLyrics/version.txt': Buffer.from((builtVersion || '7.1.17') + '\n'),
        'ivLyrics/updater/windows/register-updater-protocol.ps1': readFileSync(new URL('../updater/windows/register-updater-protocol.ps1', import.meta.url)),
        'ivLyrics/updater/windows/ivlyrics-updater.ps1': readFileSync(new URL('../updater/windows/ivlyrics-updater.ps1', import.meta.url)),
        'ivLyrics/padding.bin': Buffer.alloc(1500),
    };
    writeFileSync(broken, zipSync(files, { level: 0 }));
    writeFileSync(mirror, zipSync({ ...files, 'ivLyrics/startup.js': Buffer.from('void 1') }, { level: 0 }));
    if (!builtVersion) {
        writeFileSync(complete, zipSync({ ...files, 'ivLyrics/startup.js': Buffer.from('void 0') }, { level: 0 }));
    }
    const result = spawnSync(shell, [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', fileURLToPath(new URL('./fixtures/windows-installer-upgrade.ps1', import.meta.url)),
        '-Installer', fileURLToPath(new URL('../updater/install.ps1', import.meta.url)),
        '-Uninstaller', fileURLToPath(new URL('../updater/uninstall.ps1', import.meta.url)),
        '-CompleteZip', complete, '-BrokenZip', broken, '-MirrorZip', mirror,
        ...(builtVersion ? ['-Version', builtVersion] : []),
    ], { encoding: 'utf8', timeout: 90_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS a silent config write failure aborts installation/);
    assert.match(result.stdout, /PASS first-install rollback/);
    assert.match(result.stdout, /PASS offline recovery of an interrupted first install/);
    assert.match(result.stdout, /PASS offline recovery of an interrupted upgrade/);
    assert.match(result.stdout, /PASS clean install and version check/);
    assert.match(result.stdout, /PASS a lagging release leaves the newer installation intact/);
    assert.match(result.stdout, /PASS forced reinstall uses the verified proxy archive/);
    assert.match(result.stdout, /PASS registered updater retains the selected profile and state paths/);
    assert.match(result.stdout, /PASS missing custom app registration repaired in place/);
    assert.match(result.stdout, /PASS interrupted install repair/);
    assert.match(result.stdout, /PASS fallback after GitHub asset download failure/);
    assert.match(result.stdout, /PASS a same-version mirror must match the published checksum/);
    assert.match(result.stdout, /PASS package and checksum validation/);
    assert.match(result.stdout, /PASS upgrade rollback/);
    assert.match(result.stdout, /PASS a route injection failure rolls back even with exit code zero/);
    assert.match(result.stdout, /PASS a skipped app refresh rolls back even with exit code zero/);
    if (process.platform === 'win32') assert.match(result.stdout, /PASS NTFS junction rollback and upgrade/);
    assert.match(result.stdout, /PASS removal retains installation after exit-code/);
    assert.match(result.stdout, /PASS a silent config write failure aborts removal/);
    assert.match(result.stdout, /PASS removal retains installation after version-mismatch/);
    assert.match(result.stdout, /PASS removal rejects an active installation and can be retried/);
});
