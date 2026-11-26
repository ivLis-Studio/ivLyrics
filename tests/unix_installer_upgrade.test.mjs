import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';

const installer = fileURLToPath(new URL('../updater/install.sh', import.meta.url));
const uninstaller = fileURLToPath(new URL('../updater/uninstall.sh', import.meta.url));
const previous = '7.1.16';
const latest = '7.1.17';
const canRun = process.platform !== 'win32'
    && spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status === 0;
const canRunUninstall = canRun && spawnSync('python3', ['-c', 'import pty'], { stdio: 'ignore' }).status === 0;
const builtVersion = process.env.IVLYRICS_TEST_PACKAGE_VERSION;

function runUninstaller(env) {
    const result = spawnSync('python3', ['-c', String.raw`
import os, pty, select, sys

pid, fd = pty.fork()
if pid == 0:
    os.execv('/bin/bash', ['/bin/bash', sys.argv[1]])

output = bytearray()
confirmed = False
while True:
    if select.select([fd], [], [], 0.1)[0]:
        try:
            output.extend(os.read(fd, 65536))
        except OSError:
            pass
        if not confirmed and b'Are you sure you want to uninstall ivLyrics?' in output:
            confirmed = True
            os.write(fd, b'y\n')
    finished, status = os.waitpid(pid, os.WNOHANG)
    if finished:
        os.close(fd)
        sys.stdout.buffer.write(output)
        sys.exit(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1)
`, uninstaller], {
        env: { ...env, TERM: 'dumb' }, encoding: 'utf8', timeout: 15000,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
}

function installerFixture(context, {
    brokenArchive = false, installedVersion = previous, registered = Boolean(installedVersion),
    failApply = false, rejectRoute = false, rejectApp = false, skipRegistrationWrite = false,
    badHash = false, needsBackup = false, incomplete = false, useProxy = false,
    multilineApps = false, githubDownloadFails = false, githubTimeout = '', proxyVersion = useProxy ? latest : "",
    differentMirrorArchive = false, uninstallFailure = '', compactGithubMetadata = false,
    archive = null, releaseVersion = latest,
    manifest = { name: 'ivLyrics', subfiles_extension: ['startup.js'] }, failProtocolRegistration = false,
    macosDefaultHandler = null, macosHandlerDelay = 0, macosStaleHandlerReappears = false,
} = {}) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ivlyrics-unix-installer-')));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const bin = join(root, 'bin');
    const home = join(root, 'home');
    const profile = join(root, 'active profile with spaces');
    const apps = join(profile, 'CustomApps');
    const app = join(apps, 'ivLyrics');
    const legacyBundle = join(home, 'Library/Application Support/ivLyrics/Updater/ivLyrics Updater.app');
    const backupBundle = join(root, 'archived profile/ivLyrics Updater.app');
    const secondBackupBundle = join(root, 'older archived profile/ivLyrics Updater.app');
    const activeConfig = join(profile, 'config-xpui.ini');
    const log = join(root, 'events');
    mkdirSync(bin);
    mkdirSync(home);
    mkdirSync(installedVersion ? app : apps, { recursive: true });
    writeFileSync(activeConfig, '');
    writeFileSync(log, '');
    writeFileSync(join(root, 'custom-apps'), registered ? 'other|ivLyrics\n' : 'other\n');
    const protocolFailure = join(root, 'protocol-failure');
    if (failProtocolRegistration) writeFileSync(protocolFailure, 'unavailable');
    writeFileSync(join(root, 'handler-delay'), `${macosHandlerDelay}\n`);
    if (macosDefaultHandler) {
        mkdirSync(backupBundle, { recursive: true });
        writeFileSync(join(backupBundle, 'marker'), 'existing bundle');
        writeFileSync(join(root, 'default-handler'), `${macosDefaultHandler}\n${backupBundle}\n`);
    }
    if (macosStaleHandlerReappears) {
        mkdirSync(secondBackupBundle, { recursive: true });
        writeFileSync(join(root, 'stale-handler-lookups'), [backupBundle, secondBackupBundle, backupBundle, ''].join('\n'));
    }
    const metadata = {
        url: 'https://api.github.com/repos/ivLis-Studio/ivLyrics/releases/123',
        tag_name: useProxy ? 'invalid' : `v${releaseVersion}`,
        assets: ['ivLyrics.zip.sha256', 'ivLyrics.zip'].map(name => ({
            name, browser_download_url: `https://release.example.test/${name}`,
        })),
    };
    writeFileSync(join(root, 'release.json'), JSON.stringify(metadata, null, compactGithubMetadata ? 0 : 2));
    if (installedVersion) {
        writeFileSync(join(app, 'version.txt'), installedVersion);
        writeFileSync(join(app, 'index.js'), 'original app');
        mkdirSync(join(app, 'updater/unix'), { recursive: true });
        writeFileSync(join(app, 'updater/unix/unregister-updater-protocol.sh'),
            'printf "unregister\\n" >> "$IVL_TEST_ROOT/events"\n');
        if (!incomplete) {
            writeFileSync(join(app, 'manifest.json'), '{"name":"ivLyrics"}');
            writeFileSync(join(app, 'style.css'), 'body {}');
        }
    }

    const command = (name, code) => writeFileSync(join(bin, name), '#!/bin/bash\n' + code, { mode: 0o755 });
    command('spicetify', String.raw`
case "$*" in
    '-c') printf '%s/config-xpui.ini\n' "$IVL_TEST_PROFILE" ;;
    'config custom_apps')
        if [ "$IVL_TEST_MULTILINE_APPS" = true ]; then
            tr '|' '\n' < "$IVL_TEST_ROOT/custom-apps" | while IFS= read -r app; do printf '%s\r\n' "$app"; done
        else
            cat "$IVL_TEST_ROOT/custom-apps"
        fi
        ;;
    'config custom_apps ivLyrics')
        if [ "$IVL_TEST_SKIP_REGISTRATION_WRITE" = true ]; then
            printf 'warning  Failed to save config: permission denied\n' >&2
            exit 0
        fi
        printf 'other|ivLyrics\n' > "$IVL_TEST_ROOT/custom-apps"
        ;;
    'config custom_apps ivLyrics-')
        if [ "$IVL_TEST_UNINSTALL_FAILURE" = config-not-saved ]; then
            printf 'warning  Failed to save config: permission denied\n' >&2
            exit 0
        fi
        printf 'other\n' > "$IVL_TEST_ROOT/custom-apps"
        [ "$IVL_TEST_UNINSTALL_FAILURE" != config ]
        ;;
    '-n auto')
        printf 'auto\n' >> "$IVL_TEST_ROOT/events"
        [ "$IVL_TEST_BACKUP_NEEDED" = true ] && touch "$IVL_TEST_ROOT/backed-up"
        ;;
    apply)
        case "|$(cat "$IVL_TEST_ROOT/custom-apps")|" in
            *'|ivLyrics|'*) version=$(cat "$IVL_TEST_PROFILE/CustomApps/ivLyrics/version.txt" 2>/dev/null) ;;
            *) version='' ;;
        esac
        printf 'apply:%s\n' "$version" >> "$IVL_TEST_ROOT/events"
        if [ "$IVL_TEST_PAUSE_APPLY" = true ] && [ "$version" = "$IVL_TEST_RELEASE_VERSION" ]; then
            while :; do /bin/sleep .05; done
        fi
        if [ -z "$version" ] && [ "$IVL_TEST_UNINSTALL_FAILURE" = version-mismatch ]; then
            printf 'error  Spotify version mismatch with Spicetify.\n' >&2
            exit 0
        fi
        if [ "$IVL_TEST_BACKUP_NEEDED" = true ] && [ ! -f "$IVL_TEST_ROOT/backed-up" ]; then
            exit 1
        fi
        if [ "$version" = "$IVL_TEST_ROUTE_REJECTED" ]; then
            printf 'error  Spotify version mismatch with Spicetify.\n' >&2
            exit 0
        fi
        if [ "$version" = "$IVL_TEST_APP_REJECTED" ]; then
            printf '\033[31merror\033[0m  Custom app "ivLyrics" does not have index.js\n' >&2
            printf 'success  Refreshed custom apps\n'
            exit 0
        fi
        printf 'error  Custom app "other" not found\n' >&2
        [ "$version" != "$IVL_TEST_APPLY_FAIL" ]
        ;;
    *) exit 1 ;;
esac`);
    command('curl', String.raw`
while [ "$#" -gt 0 ]; do
    case "$1" in
        https://*) url=$1 ;;
        -o) shift; output=$1 ;;
    esac
    shift
done
case "$url" in
    https://api.github.com) [ "$IVL_TEST_OFFLINE" != true ] ;;
    https://api.github.com/repos/ivLis-Studio/ivLyrics/releases/latest)
        cat "$IVL_TEST_ROOT/release.json"
        if [ "$IVL_TEST_GITHUB_TIMEOUT" = metadata ]; then exit 28; fi
        ;;
    https://release.example.test/ivLyrics.zip)
        [ "$IVL_TEST_PROXY" = false ] && [ "$IVL_TEST_GITHUB_DOWNLOAD_FAILS" = false ] &&
            cp "$IVL_TEST_ROOT/archive.zip" "$output"
        ;;
    https://release.example.test/ivLyrics.zip.sha256)
        [ "$IVL_TEST_PROXY" = false ] || exit 1
        cat "$IVL_TEST_ROOT/checksum"
        if [ "$IVL_TEST_GITHUB_TIMEOUT" = checksum ]; then exit 28; fi
        ;;
    'https://ivlis.kr/ivLyrics/proxy.php?action=version')
        [ -n "$IVL_TEST_PROXY_VERSION" ] || exit 1
        read -r hash file < "$IVL_TEST_ROOT/mirror-checksum"
        printf '{"zip_available":true, "tag_name":"v%s", "sha256":"%s"}\n' "$IVL_TEST_PROXY_VERSION" "$hash"
        ;;
    'https://ivlis.kr/ivLyrics/proxy.php?action=download')
        cp "$IVL_TEST_ROOT/mirror.zip" "$output"
        ;;
    *) exit 1 ;;
esac`);
    command('pgrep', 'printf "probe\n" >> "$IVL_TEST_ROOT/events"\nexit 1\n');
    command('pkill', 'exit 1\n');
    command('sleep', 'exit 0\n');
    command('clear', 'exit 0\n');
    command('xdg-mime', String.raw`
if [ "$*" = 'query default x-scheme-handler/ivlyrics-updater' ]; then
    printf '%s\n' 'ivlyrics-updater.desktop'
    exit 0
fi
[ "$*" = 'default ivlyrics-updater.desktop x-scheme-handler/ivlyrics-updater' ] || exit 1
printf 'register\n' >> "$IVL_TEST_ROOT/events"
`);
    command('update-desktop-database', 'exit 0\n');
    command('lsregister', String.raw`
printf '%s\n' "$@" >> "$IVL_TEST_ROOT/launch-services"
if [ "$1" = '-f' ]; then
    printf 'register\n' >> "$IVL_TEST_ROOT/events"
    [ ! -f "$IVL_TEST_ROOT/protocol-failure" ] || exit 1
    printf '%s\n' "$2" > "$IVL_TEST_ROOT/registered-handler"
elif [ "$1" = '-u' ]; then
    if [ -f "$IVL_TEST_ROOT/default-handler" ] && [ "$(tail -n +2 "$IVL_TEST_ROOT/default-handler")" = "$2" ]; then
        rm "$IVL_TEST_ROOT/default-handler"
    fi
    if [ -f "$IVL_TEST_ROOT/registered-handler" ] && [ "$(cat "$IVL_TEST_ROOT/registered-handler")" = "$2" ]; then
        rm "$IVL_TEST_ROOT/registered-handler"
    fi
fi
`);
    command('osascript', String.raw`
[ "$*" = '-l JavaScript - ivlyrics-updater://update' ] || exit 1
cat > /dev/null
read -r delay < "$IVL_TEST_ROOT/handler-delay"
if [ "$delay" -gt 0 ] && [ -f "$IVL_TEST_ROOT/registered-handler" ]; then
    printf '%s\n' "$((delay - 1))" > "$IVL_TEST_ROOT/handler-delay"
    exit 0
fi
if [ -s "$IVL_TEST_ROOT/stale-handler-lookups" ] && [ -f "$IVL_TEST_ROOT/registered-handler" ]; then
    printf 'kr.ivlis.ivlyrics.updater\n'
    head -1 "$IVL_TEST_ROOT/stale-handler-lookups"
    sed -n '2,$p' "$IVL_TEST_ROOT/stale-handler-lookups" > "$IVL_TEST_ROOT/remaining-lookups"
    mv "$IVL_TEST_ROOT/remaining-lookups" "$IVL_TEST_ROOT/stale-handler-lookups"
    exit 0
fi
if [ -f "$IVL_TEST_ROOT/default-handler" ]; then
    cat "$IVL_TEST_ROOT/default-handler"
elif [ -f "$IVL_TEST_ROOT/registered-handler" ]; then
    if [ -f "$IVL_TEST_ROOT/blocked-selection" ] &&
        cmp -s "$IVL_TEST_ROOT/blocked-selection" "$IVL_TEST_ROOT/registered-handler"; then
        exit 0
    fi
    printf 'kr.ivlis.ivlyrics.updater\n'
    cat "$IVL_TEST_ROOT/registered-handler"
fi
`);
    if (archive && process.platform === 'darwin') {
        mkdirSync(legacyBundle, { recursive: true });
    }

    const data = value => Buffer.from(value);
    const files = {
        'ivLyrics/index.js': data('new app'),
        'ivLyrics/manifest.json': data(JSON.stringify(manifest)),
        'ivLyrics/style.css': data('body {}'),
        'ivLyrics/version.txt': data(releaseVersion + '\n'),
        'ivLyrics/updater/unix/register-updater-protocol.sh': data([
            'printf "register\\n" >> "$IVL_TEST_ROOT/events"',
            'if [ "$IVL_TEST_PAUSE_PROTOCOL" = true ]; then while :; do /bin/sleep .05; done; fi',
            'if [ -f "$IVL_TEST_ROOT/protocol-failure" ]; then',
            '    printf "Fixture desktop registration failed.\\n" >&2',
            '    exit 1',
            'fi',
            '',
        ].join('\n')),
        'ivLyrics/docs/preview.bin': Buffer.alloc(2000),
    };
    if (!brokenArchive) files['ivLyrics/startup.js'] = data('console.log("startup")');
    const zip = archive ?? zipSync(files, { level: 0 });
    writeFileSync(join(root, 'archive.zip'), zip);
    const hash = badHash ? '0'.repeat(64) : createHash('sha256').update(zip).digest('hex');
    writeFileSync(join(root, 'checksum'), `${hash}  ivLyrics.zip\n`);
    const mirror = differentMirrorArchive
        ? zipSync({ ...files, 'ivLyrics/index.js': data('alternate build') }, { level: 0 }) : zip;
    const mirrorHash = differentMirrorArchive ? createHash('sha256').update(mirror).digest('hex') : hash;
    writeFileSync(join(root, 'mirror.zip'), mirror);
    writeFileSync(join(root, 'mirror-checksum'), `${mirrorHash}  ivLyrics.zip\n`);
    const env = {
        ...process.env,
        HOME: home,
        PATH: bin + delimiter + process.env.PATH,
        IVL_TEST_ROOT: root,
        IVL_TEST_PROFILE: profile,
        IVL_TEST_APPLY_FAIL: failApply ? releaseVersion : 'none',
        IVL_TEST_ROUTE_REJECTED: rejectRoute ? releaseVersion : 'none',
        IVL_TEST_BACKUP_NEEDED: String(needsBackup),
        IVL_TEST_PROXY: String(useProxy),
        IVL_TEST_RELEASE_VERSION: releaseVersion,
        IVL_TEST_PROXY_VERSION: proxyVersion,
        IVL_TEST_GITHUB_DOWNLOAD_FAILS: String(githubDownloadFails),
        IVL_TEST_GITHUB_TIMEOUT: githubTimeout,
        IVL_TEST_MULTILINE_APPS: String(multilineApps),
        IVL_TEST_APP_REJECTED: rejectApp ? releaseVersion : 'never',
        IVL_TEST_SKIP_REGISTRATION_WRITE: String(skipRegistrationWrite),
        IVL_TEST_UNINSTALL_FAILURE: uninstallFailure,
        XDG_DATA_HOME: join(root, 'desktop data'),
    };
    return {
        root, app, apps, legacyBundle, backupBundle, secondBackupBundle,
        desktopFile: join(env.XDG_DATA_HOME, 'applications', 'ivlyrics-updater.desktop'),
        run: (args, overrides) => spawnSync('bash', [installer, ...(args || [])], {
            encoding: 'utf8', timeout: 15000, env: { ...env, ...overrides },
        }),
        runProtocolRegistration: () => spawnSync('bash', [
            join(app, 'updater/unix/register-updater-protocol.sh'), app,
        ], { encoding: 'utf8', timeout: 15000, env }),
        startPausedInstall: (phase = 'APPLY') => spawn('bash', [installer], {
            detached: true, stdio: 'ignore', env: { ...env, [`IVL_TEST_PAUSE_${phase}`]: 'true' },
        }),
        uninstall: () => runUninstaller(env),
        readEvents: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
        readApps: () => readFileSync(join(root, 'custom-apps'), 'utf8').trim(),
        readLaunchServices: () => existsSync(join(root, 'launch-services'))
            ? readFileSync(join(root, 'launch-services'), 'utf8').trimEnd().split('\n')
            : [],
        repairProtocolRegistration: () => rmSync(protocolFailure),
    };
}

test('the Unix installer upgrades the CustomApps beside the active Spicetify config', { skip: !canRun }, context => {
    const fx = installerFixture(context);
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
    assert.ok(existsSync(join(fx.app, 'startup.js')));
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register']);
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);
});

test('the Unix installer obtains both GitHub assets from compact release metadata', { skip: !canRun }, context => {
    const fx = installerFixture(context, { compactGithubMetadata: true });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Found version: v7\.1\.17 \(via GitHub\)/);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register']);
});

test('a redundant Unix update does not probe or stop Spotify', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: latest });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Already up to date/);
    assert.deepEqual(fx.readEvents(), []);
});

test('a failed Unix upgrade preserves existing registration when Spicetify lists one app per line', { skip: !canRun }, context => {
    const fx = installerFixture(context, { multilineApps: true, failApply: true });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8'), previous);
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, `apply:${previous}`]);
});

test('a lagging release leaves the newer Unix installation and Spotify alone', { skip: !canRun }, context => {
    const installedVersion = '7.1.100';
    const fx = installerFixture(context, { installedVersion, badHash: true, useProxy: true });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Installed version 7\.1\.100 is newer/);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), installedVersion);
    assert.deepEqual(fx.readEvents(), []);
    assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);
});

test('malformed GitHub metadata falls back to the verified proxy archive', { skip: !canRun }, context => {
    const fx = installerFixture(context, { useProxy: true });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /via proxy/);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register']);
});

test('timed-out GitHub metadata is discarded before using a verified proxy archive', { skip: !canRun }, context => {
    const fx = installerFixture(context, { githubTimeout: 'metadata', proxyVersion: latest });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Found version: .*via proxy/);
    assert.doesNotMatch(result.stdout, /Found version: .*via GitHub/);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
});

test('a timed-out checksum response cannot replace the current installation', { skip: !canRun }, context => {
    const fx = installerFixture(context, { githubTimeout: 'checksum' });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.deepEqual(fx.readEvents(), []);
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), previous);
    assert.ok(!existsSync(join(fx.apps, '.ivLyrics-install.lock')));
});

test('a GitHub archive download failure falls back to the same version on the mirror', { skip: !canRun }, context => {
    const fx = installerFixture(context, { githubDownloadFails: true, proxyVersion: latest });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /via proxy/);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register']);
});

test('a lagging mirror cannot substitute another version after a GitHub download failure', { skip: !canRun }, context => {
    const fx = installerFixture(context, { githubDownloadFails: true, proxyVersion: previous });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), previous);
    assert.deepEqual(fx.readEvents(), []);
});

test('a mirror with the same version and a different valid ZIP is rejected before applying', { skip: !canRun }, context => {
    const fx = installerFixture(context, { githubDownloadFails: true, proxyVersion: latest, differentMirrorArchive: true });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Proxy checksum does not match the GitHub release/);
    assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'original app');
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.deepEqual(fx.readEvents(), []);
});

if (builtVersion) {
    test('the packaged build replaces a legacy install and keeps its active Spicetify registration', { skip: !canRun }, context => {
        const archive = readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url));
        const files = unzipSync(archive, { filter: file => file.name.startsWith('ivLyrics/updater/') });
        const fx = installerFixture(context, {
            archive, releaseVersion: builtVersion, githubDownloadFails: true, proxyVersion: builtVersion,
        });
        const result = fx.run();
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), builtVersion);
        const manifest = JSON.parse(readFileSync(join(fx.app, 'manifest.json'), 'utf8'));
        assert.deepEqual(manifest.subfiles_extension, ['startup.js']);
        assert.ok(existsSync(join(fx.app, 'startup.js')));
        assert.deepEqual(readFileSync(join(fx.app, 'updater/unix/ivlyrics-updater.sh')),
            Buffer.from(files['ivLyrics/updater/unix/ivlyrics-updater.sh']));
        assert.equal(fx.readApps(), 'other|ivLyrics');
        assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${builtVersion}`, 'register']);
        const handler = join(fx.app, 'updater/unix/ivlyrics-updater.sh');
        if (process.platform === 'darwin') {
            const bundle = join(fx.app, 'updater/macos/ivLyrics Updater.app');
            const plist = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(bundle, 'Contents', 'Info.plist')], { encoding: 'utf8' });
            assert.equal(plist.status, 0, plist.stderr);
            const signature = spawnSync('/usr/bin/codesign', ['--verify', '--strict', bundle], { encoding: 'utf8' });
            assert.equal(signature.status, 0, signature.stderr);
            const info = JSON.parse(plist.stdout);
            assert.equal(info.CFBundleIdentifier, 'kr.ivlis.ivlyrics.updater');
            assert.deepEqual(info.CFBundleURLTypes, [{
                CFBundleURLName: 'ivLyrics Updater',
                CFBundleURLSchemes: ['ivlyrics-updater'],
            }]);
            const script = spawnSync('/usr/bin/osadecompile', [join(bundle, 'Contents', 'Resources', 'Scripts', 'main.scpt')], { encoding: 'utf8' });
            assert.equal(script.status, 0, script.stderr);
            assert.ok(script.stdout.includes(`set updaterScript to "${handler}"`), script.stdout);
            assert.ok(script.stdout.includes('runUpdater(theURL)'), script.stdout);
            assert.ok(!existsSync(fx.legacyBundle));
            assert.deepEqual(fx.readLaunchServices(), ['-f', bundle, '-u', fx.legacyBundle]);
        } else {
            const desktop = readFileSync(fx.desktopFile, 'utf8').split('\n');
            assert.ok(desktop.includes(`Exec=/bin/bash "${handler}" %u`));
            assert.ok(desktop.includes('MimeType=x-scheme-handler/ivlyrics-updater;'));
        }
    });

    test('a rejected macOS handler registration can be repaired without applying the release twice', {
        skip: !canRun || process.platform !== 'darwin',
    }, context => {
        const archive = readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url));
        const fx = installerFixture(context, {
            archive, releaseVersion: builtVersion, failProtocolRegistration: true,
        });
        const failed = fx.run();
        assert.equal(failed.status, 1, failed.stdout + failed.stderr);
        assert.match(failed.stdout, /Updater protocol registration failed/);
        assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), builtVersion);
        assert.equal(fx.readApps(), 'other|ivLyrics');
        assert.ok(existsSync(fx.legacyBundle), 'the legacy updater must remain available after registration fails');
        assert.ok(!existsSync(join(fx.app, 'updater/macos/ivLyrics Updater.app')));
        fx.repairProtocolRegistration();
        const repaired = fx.run();
        assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
        assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${builtVersion}`, 'register', 'register']);
    });

    test('failed macOS handler selection restores the previous bundle and displaced registrations', {
        skip: !canRun || process.platform !== 'darwin',
    }, context => {
        const archive = readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url));
        const fx = installerFixture(context, { archive, releaseVersion: builtVersion });
        const bundle = join(fx.app, 'updater/macos/ivLyrics Updater.app');
        const installed = fx.run();
        assert.equal(installed.status, 0, installed.stdout + installed.stderr);
        writeFileSync(join(bundle, 'previous-marker'), 'previous bundle');
        mkdirSync(fx.backupBundle, { recursive: true });
        mkdirSync(fx.secondBackupBundle, { recursive: true });
        writeFileSync(join(fx.root, 'default-handler'), `kr.ivlis.ivlyrics.updater\n${fx.backupBundle}\n`);
        writeFileSync(join(fx.root, 'stale-handler-lookups'), `${fx.backupBundle}\n${fx.secondBackupBundle}\n`);
        writeFileSync(join(fx.root, 'blocked-selection'), `${bundle}\n`);
        rmSync(join(fx.root, 'registered-handler'));
        rmSync(join(fx.root, 'launch-services'));

        const failed = fx.runProtocolRegistration();

        assert.equal(failed.status, 1, failed.stdout + failed.stderr);
        assert.match(failed.stderr, /macOS has not selected the installed app/);
        assert.equal(readFileSync(join(bundle, 'previous-marker'), 'utf8'), 'previous bundle');
        assert.deepEqual(fx.readLaunchServices(), [
            '-f', bundle, '-u', fx.backupBundle, '-u', fx.secondBackupBundle, '-u', bundle,
            '-f', fx.secondBackupBundle, '-f', fx.backupBundle,
        ]);
        assert.equal(readFileSync(join(fx.root, 'registered-handler'), 'utf8').trim(), fx.backupBundle);
    });

    test('a macOS upgrade keeps its existing launcher available until the replacement registers', {
        skip: !canRun || process.platform !== 'darwin',
    }, context => {
        const archive = readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url));
        const fx = installerFixture(context, {
            archive, releaseVersion: builtVersion, failProtocolRegistration: true,
        });
        const bundle = join(fx.app, 'updater/macos/ivLyrics Updater.app');
        const marker = join(bundle, 'previous-marker');
        mkdirSync(bundle, { recursive: true });
        writeFileSync(marker, 'previous launcher');
        writeFileSync(join(fx.root, 'default-handler'), `kr.ivlis.ivlyrics.updater\n${bundle}\n`);

        const failed = fx.run();
        assert.equal(failed.status, 1, failed.stdout + failed.stderr);
        assert.match(failed.stdout, /Updater protocol registration failed/);
        assert.equal(existsSync(marker), true, 'the in-app launcher must survive replacing the install directory');
        assert.equal(readFileSync(marker, 'utf8'), 'previous launcher');
        assert.ok(!fx.readLaunchServices().includes('-u'));
        assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), builtVersion);

        fx.repairProtocolRegistration();
        const repaired = fx.run();
        assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
        assert.ok(existsSync(join(bundle, 'Contents/Info.plist')));
        assert.ok(!existsSync(marker));
        assert.deepEqual(fx.readEvents().filter(event => event.startsWith('apply:')), [`apply:${builtVersion}`]);
    });

    test('the macOS installer removes only the stale ivLyrics handler registration', {
        skip: !canRun || process.platform !== 'darwin',
    }, context => {
        const archive = readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url));
        const fx = installerFixture(context, {
            archive, releaseVersion: builtVersion, macosDefaultHandler: 'kr.ivlis.ivlyrics.updater', macosHandlerDelay: 2,
        });
        const result = fx.run();
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.deepEqual(fx.readLaunchServices(), [
            '-f', join(fx.app, 'updater/macos/ivLyrics Updater.app'), '-u', fx.backupBundle, '-u', fx.legacyBundle,
        ]);
        assert.equal(readFileSync(join(fx.backupBundle, 'marker'), 'utf8'), 'existing bundle');
    });

    test('the macOS installer waits when Launch Services reports an earlier stale handler again', {
        skip: !canRun || process.platform !== 'darwin',
    }, context => {
        const archive = readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url));
        const fx = installerFixture(context, {
            archive, releaseVersion: builtVersion, macosStaleHandlerReappears: true,
        });
        const result = fx.run();
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.deepEqual(fx.readLaunchServices(), [
            '-f', join(fx.app, 'updater/macos/ivLyrics Updater.app'),
            '-u', fx.backupBundle, '-u', fx.secondBackupBundle, '-u', fx.legacyBundle,
        ]);
    });

    test('the macOS installer reports a URL assigned to another application without unregistering it', {
        skip: !canRun || process.platform !== 'darwin',
    }, context => {
        const archive = readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url));
        const fx = installerFixture(context, {
            archive, releaseVersion: builtVersion, macosDefaultHandler: 'test.another.handler',
        });
        const result = fx.run();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /Updater protocol registration failed/);
        assert.match(result.stderr, /macOS has assigned ivlyrics-updater:\/\/ to another application/);
        assert.deepEqual(fx.readLaunchServices(), []);
        assert.ok(existsSync(fx.legacyBundle));
    });
}

test('a forced Unix install can restore the published version over a newer local build', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: '7.2.0' });
    const result = fx.run(['--force']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register']);
});

test('a current Unix install that is absent from custom_apps is reapplied without downloading', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: latest, registered: false, badHash: true });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'original app');
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`]);
});

test('a failed Unix registration repair leaves the current package and other apps intact', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: latest, registered: false, failApply: true, badHash: true });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(fx.readApps(), 'other');
    assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'original app');
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'apply:']);
    assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);
});

test('an incomplete Unix install is repaired even if its version marker is current', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: latest, incomplete: true });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(existsSync(join(fx.app, 'startup.js')));
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register']);
});

test('a current legacy install with a missing declared subfile is repaired', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: latest });
    writeFileSync(join(fx.app, 'manifest.json'), JSON.stringify({
        name: 'ivLyrics', subfiles: ['langs/LangEn.js'], subfiles_extension: [],
    }, null, 2));
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'new app');
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register']);
});

test('a complete multiline legacy manifest remains current without downloading a release', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: latest, badHash: true });
    writeFileSync(join(fx.app, 'manifest.json'), JSON.stringify({
        name: 'ivLyrics', subfiles: ['langs/LangEn.js', 'Settings.js'], subfiles_extension: ['LyricsService.js'],
    }, null, '\t'));
    mkdirSync(join(fx.app, 'langs'));
    for (const path of ['langs/LangEn.js', 'Settings.js', 'LyricsService.js']) {
        writeFileSync(join(fx.app, path), 'void 0');
    }
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Already up to date/);
    assert.deepEqual(fx.readEvents(), []);
});

test('a Unix archive missing a declared legacy entry leaves the existing installation untouched', { skip: !canRun }, context => {
    const fx = installerFixture(context, { manifest: {
        name: 'ivLyrics', subfiles: ['Pages.js'], subfiles_extension: ['startup.js'],
    } });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /missing required files/);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8'), previous);
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.deepEqual(fx.readEvents(), []);
});

test('a failed Unix protocol registration keeps the applied update and can be retried without reapplying', { skip: !canRun }, context => {
    const fx = installerFixture(context, { failProtocolRegistration: true });
    const failed = fx.run();
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.match(failed.stdout + failed.stderr, /Fixture desktop registration failed/);
    assert.doesNotMatch(failed.stdout, /updated successfully/);
    assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false, failed.stdout + failed.stderr);
    fx.repairProtocolRegistration();
    const repaired = fx.run();
    assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
    assert.match(repaired.stdout, /Updater protocol registered/);
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register', 'register']);
});

test('a failed Unix first install removes the new app and its config entry', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: null, failApply: true });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(existsSync(fx.app), false);
    assert.equal(fx.readApps(), 'other');
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'auto', 'apply:']);
});

test('Unix installation rejects a successful config command that did not register the app', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: null, skipRegistrationWrite: true });
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Could not register ivLyrics/);
    assert.equal(existsSync(fx.app), false);
    assert.equal(fx.readApps(), 'other');
    assert.deepEqual(fx.readEvents(), ['probe', 'probe']);
});

test('the Unix first install can prepare Spicetify when it needs a Spotify backup', { skip: !canRun }, context => {
    const fx = installerFixture(context, { installedVersion: null, needsBackup: true });
    const result = fx.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(existsSync(join(fx.app, 'startup.js')));
    assert.equal(fx.readApps(), 'other|ivLyrics');
    assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'auto', `apply:${latest}`, 'register']);
});

test('a Unix install leaves another operation’s lock and files alone', { skip: !canRun }, context => {
    const fx = installerFixture(context);
    const lock = join(fx.apps, '.ivLyrics-install.lock');
    mkdirSync(lock);
    const result = fx.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Another installation or removal may be in progress/);
    assert.equal(existsSync(lock), true);
    assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'original app');
    assert.deepEqual(fx.readEvents(), []);
});

for (const installedVersion of [previous, null]) {
    test(`a killed Unix ${installedVersion ? 'upgrade' : 'first install'} is recovered on the next launch while offline`,
        { skip: !canRun, timeout: 15000 }, async context => {
            const fx = installerFixture(context, { installedVersion });
            const child = fx.startPausedInstall();
            const exited = once(child, 'exit');
            context.after(() => {
                if (child.exitCode == null && child.signalCode == null) process.kill(-child.pid, 'SIGKILL');
            });
            for (let attempt = 0; attempt < 200 && !fx.readEvents().includes(`apply:${latest}`); attempt++) await wait(20);
            assert.ok(fx.readEvents().includes(`apply:${latest}`), "first installer did not reach the live apply step");
            const competing = fx.run();
            assert.equal(competing.status, 1);
            assert.match(competing.stdout, /Another installation or removal may be in progress/);
            assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
            process.kill(-child.pid, 'SIGKILL');
            assert.deepEqual(await exited, [null, 'SIGKILL']);

            const recovered = fx.run([], { IVL_TEST_OFFLINE: 'true' });
            assert.equal(recovered.status, 1);
            assert.match(recovered.stdout, /Recovered interrupted ivLyrics installation/);
            assert.match(recovered.stdout, /No network connection/);
            assert.equal(existsSync(fx.app), Boolean(installedVersion));
            if (installedVersion) assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'original app');
            assert.equal(fx.readApps(), installedVersion ? 'other|ivLyrics' : 'other');
            assert.equal(fx.readEvents().at(-1), `apply:${installedVersion ?? ''}`);
            assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);

            const retry = fx.run();
            assert.equal(retry.status, 0, retry.stdout + retry.stderr);
            assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
        });
}

test('a Unix restart keeps the applied release if the updater registration was interrupted',
    { skip: !canRun, timeout: 15000 }, async context => {
        const fx = installerFixture(context);
        const child = fx.startPausedInstall('PROTOCOL');
        const exited = once(child, 'exit');
        context.after(() => {
            if (child.exitCode == null && child.signalCode == null) process.kill(-child.pid, 'SIGKILL');
        });
        for (let attempt = 0; attempt < 200 && !fx.readEvents().includes('register'); attempt++) await wait(20);
        assert.ok(fx.readEvents().includes('register'), "installer did not finish applying the release");
        process.kill(-child.pid, 'SIGKILL');
        assert.deepEqual(await exited, [null, 'SIGKILL']);

        const recovered = fx.run();
        assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
        assert.match(recovered.stdout, /Already up to date/);
        assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8').trim(), latest);
        assert.deepEqual(fx.readEvents(), ['probe', 'probe', `apply:${latest}`, 'register', 'register']);
        assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);
    });

for (const [failure, options, message] of [
    ['checksum mismatch', { badHash: true }, /Download failed/],
    ['missing startup entry point', { brokenArchive: true }, /missing required files/],
    ['Spicetify apply failure', { failApply: true }, /Rolling back/],
    ['Spicetify rejects the custom app route with exit code zero', { rejectRoute: true }, /Rolling back/],
    ['Spicetify skips refreshing the ivLyrics files with exit code zero', { rejectApp: true }, /Rolling back/],
]) {
    test(`a Unix upgrade preserves the previous installation after ${failure}`, { skip: !canRun }, context => {
        const fx = installerFixture(context, options);
        const result = fx.run();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, message);
        assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'original app');
        assert.equal(readFileSync(join(fx.app, 'version.txt'), 'utf8'), previous);
        assert.equal(existsSync(join(fx.app, 'startup.js')), false);
        assert.equal(fx.readApps(), 'other|ivLyrics');
        assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);
        assert.deepEqual(fx.readEvents(), options.failApply || options.rejectRoute || options.rejectApp
            ? ['probe', 'probe', `apply:${latest}`, `apply:${previous}`]
            : []);
    });
}

for (const [failure, message, expectedEvents] of [
    ['config', /Could not remove ivLyrics from custom_apps/, []],
    ['config-not-saved', /Could not remove ivLyrics from custom_apps/, []],
    ['version-mismatch', /Spicetify could not apply removal/, ['apply:', `apply:${previous}`]],
]) {
    test(`a failed Unix removal restores registration after ${failure}`, { skip: !canRunUninstall }, context => {
        const fx = installerFixture(context, { uninstallFailure: failure, multilineApps: true });
        const result = fx.uninstall();
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, message);
        assert.equal(readFileSync(join(fx.app, 'index.js'), 'utf8'), 'original app');
        assert.equal(fx.readApps(), 'other|ivLyrics');
        assert.deepEqual(fx.readEvents(), expectedEvents);
        assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);
    });
}

test('Unix removal deletes files and unregisters the protocol after a successful apply', { skip: !canRunUninstall }, context => {
    const fx = installerFixture(context);
    const result = fx.uninstall();
    assert.equal(result.status, 0, result.output);
    assert.equal(existsSync(fx.app), false);
    assert.equal(fx.readApps(), 'other');
    assert.deepEqual(fx.readEvents(), ['apply:', 'unregister']);
    assert.equal(existsSync(join(fx.apps, '.ivLyrics-install.lock')), false);
});

function runUnixProtocolFixture(context, registered, uri = 'ivlyrics-updater://update', {
    linked = false, missingConfig = false, profileName = 'custom Spicetify', relativeRegistration = false,
    desktopOwner = 'ivlyrics-updater.desktop', previousLauncher = null,
} = {}) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ivlyrics-unix-protocol-')));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const profile = join(root, profileName);
    const app = join(profile, 'CustomApps', 'ivLyrics');
    const updater = join(app, 'updater', 'unix');
    if (linked) {
        const storage = join(root, 'linked app storage');
        mkdirSync(join(profile, 'CustomApps'), { recursive: true });
        mkdirSync(join(storage, 'updater', 'unix'), { recursive: true });
        symlinkSync(storage, app, 'dir');
    } else {
        mkdirSync(updater, { recursive: true });
    }
    if (!missingConfig) writeFileSync(join(profile, 'config-xpui.ini'), '');
    const handler = join(updater, 'ivlyrics-updater.sh');
    const register = join(updater, 'register-updater-protocol.sh');
    copyFileSync(new URL('../updater/unix/ivlyrics-updater.sh', import.meta.url), handler);
    copyFileSync(new URL('../updater/unix/register-updater-protocol.sh', import.meta.url), register);
    const bootstrap = join(root, 'installer.sh');
    writeFileSync(bootstrap, '# ivLyrics Installer for macOS/Linux\n#' + ' '.repeat(512) +
        '\nprintf "%s\\n" "$SPICETIFY_CONFIG" "${SPICETIFY_STATE:-}" "${XDG_STATE_HOME:-}" > "$IVL_TEST_ROOT/installer-environment"\n');
    const desktopFile = join(root, 'desktop', 'applications', 'ivlyrics-updater.desktop');
    if (previousLauncher !== null) {
        mkdirSync(dirname(desktopFile), { recursive: true });
        writeFileSync(desktopFile, previousLauncher);
    }

    const result = spawnSync('bash', ['-c', String.raw`
set -e
uname() { printf 'Linux\n'; }
curl() { [ "$1" = -fsSLo ] && cp "$IVL_TEST_INSTALLER" "$2"; }
xdg-mime() {
    case "$*" in
        'default ivlyrics-updater.desktop x-scheme-handler/ivlyrics-updater') return 0 ;;
        'query default x-scheme-handler/ivlyrics-updater') printf '%s\n' "$IVL_TEST_DESKTOP_OWNER" ;;
        *) return 1 ;;
    esac
}
update-desktop-database() { :; }
export -f uname curl xdg-mime update-desktop-database
if [ "$IVL_TEST_REGISTER" = true ]; then
    SPICETIFY_STATE='backup $(literal) path' XDG_STATE_HOME='custom XDG state' bash "$2" "$3"
fi
unset SPICETIFY_CONFIG
export SPICETIFY_STATE="$IVL_TEST_ROOT/launcher state"
exec bash "$1" "$4"`, 'protocol-fixture', handler, register, relativeRegistration ? relative(root, app) : app, uri], {
        encoding: 'utf8',
        timeout: 15000,
        cwd: root,
        env: {
            ...process.env,
            XDG_STATE_HOME: join(root, 'state'),
            XDG_DATA_HOME: join(root, 'desktop'),
            IVL_TEST_ROOT: root,
            IVL_TEST_INSTALLER: bootstrap,
            IVL_TEST_REGISTER: String(registered),
            IVL_TEST_DESKTOP_OWNER: desktopOwner,
        },
    });
    const marker = join(root, 'installer-environment');
    const environment = existsSync(marker) ? readFileSync(marker, 'utf8').trimEnd().split('\n') : null;
    const launcher = existsSync(desktopFile) ? readFileSync(desktopFile, 'utf8') : null;
    return { root, profile, environment, result, launcher };
}

test('an older Unix protocol registration still finds the installed config', { skip: !canRun }, context => {
    const { root, profile, environment, result } = runUnixProtocolFixture(context, false);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(environment, [profile, join(root, 'launcher state'), join(root, 'state')]);
});

test('a Unix protocol update uses the registered Spicetify and XDG state paths from a different launch environment', { skip: !canRun }, context => {
    const { root, profile, environment, result } = runUnixProtocolFixture(context, true);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(environment, [profile, join(root, 'backup $(literal) path'), join(root, 'custom XDG state')]);
});

test('a Unix protocol update follows the profile that owns a linked app', { skip: !canRun }, context => {
    const { root, profile, environment, result } = runUnixProtocolFixture(context, true, undefined, { linked: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(environment, [profile, join(root, 'backup $(literal) path'), join(root, 'custom XDG state')]);
});

test('Linux launcher keeps a linked profile path with literal desktop entry characters', { skip: !canRun }, context => {
    const profileName = 'Mix 100% $Archive \\2026 "Disc" `take`';
    const { root, profile, result, launcher } = runUnixProtocolFixture(context, true, undefined, {
        linked: true, profileName, relativeRegistration: true,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const escaped = ['Mix 100%%', String.raw`\\$Archive`, String.raw`\\\\2026`, String.raw`\\"Disc\\"`, '\\\\`take\\\\`'].join(' ');
    assert.ok(launcher.includes(`Exec=/bin/bash "${root}/${escaped}/CustomApps/ivLyrics/updater/unix/ivlyrics-updater.sh" %u\n`), launcher);
    assert.equal(profile, join(root, profileName));
});

test('Linux protocol registration reports and rolls back an unselected handler', { skip: !canRun }, context => {
    const previousLauncher = '[Desktop Entry]\nName=Existing updater\n';
    const { result, environment, launcher } = runUnixProtocolFixture(context, true, undefined, {
        desktopOwner: 'other.desktop', previousLauncher,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Linux has not selected ivLyrics Updater/);
    assert.equal(launcher, previousLauncher);
    assert.equal(environment, null);
});

test('a Unix protocol update stops when its registered profile config is gone', { skip: !canRun }, context => {
    const { result, environment } = runUnixProtocolFixture(context, true, undefined, { missingConfig: true });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /The registered Spicetify config is missing/);
    assert.equal(environment, null);
});

test('the Unix updater rejects an unsupported URI without invoking the installer', { skip: !canRun }, context => {
    const { result, environment } = runUnixProtocolFixture(context, false, 'https://example.test/');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Unsupported updater action/);
    assert.equal(environment, null);
});
