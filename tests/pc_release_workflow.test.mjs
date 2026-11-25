import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const releaseScript = fileURLToPath(new URL('../.github/scripts/pc_release.sh', import.meta.url));
const generateNotes = fileURLToPath(new URL('../.github/scripts/generate_release_notes.py', import.meta.url));
const releaseWorkflow = readFileSync(new URL('../.github/workflows/pc-release.yml', import.meta.url), 'utf8');
const tools = [['bash', '--version'], ['git', '--version'], ['python3', '--version'], ['sha256sum', '--version'], ['unzip', '-v']];
const canRun = process.platform !== 'win32' && tools.every(([tool, arg]) =>
    spawnSync(tool, [arg], { stdio: 'ignore' }).status === 0);

function fixture(context) {
    const root = mkdtempSync(join(tmpdir(), 'ivlyrics-release-workflow-'));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const repo = join(root, 'repo');
    const origin = join(root, 'origin.git');
    const bin = join(root, 'bin');
    const gh = join(root, 'gh');
    const output = join(root, 'outputs');
    for (const path of [repo, origin, bin, gh]) mkdirSync(path);
    writeFileSync(output, '');
    writeFileSync(join(gh, 'latest'), 'v7.1.17');
    writeFileSync(join(gh, 'trace'), '');
    copyFileSync(new URL('./fixtures/pc-release-gh.mjs', import.meta.url), join(bin, 'gh.mjs'));
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexec node "$(dirname "$0")/gh.mjs" "$@"\n', { mode: 0o755 });
    const env = {
        ...process.env,
        PATH: bin + delimiter + process.env.PATH,
        IVL_RELEASE_FIXTURE: gh,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: 'fixture/ivLyrics',
        GITHUB_REF_NAME: 'main',
        DEFAULT_BRANCH: 'main',
        RELEASE_VERSION: '7.2.0',
        RELEASE_TAG: 'v7.2.0',
        RELEASE_TITLE: '7.2.0 - Fixture release',
        PRERELEASE: 'false',
        DRY_RUN: 'false',
        AI_BASE_URL: '',
        AI_API_KEY: '',
        AI_MODEL: '',
    };

    function execute(command, args, overrides = {}) {
        return spawnSync(command, args, { cwd: repo, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 20_000 });
    }
    function git(...args) {
        const result = execute('git', args);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        return result.stdout.trim();
    }
    const run = (mode, overrides) => execute('bash', [releaseScript, mode], overrides);
    git('init', '-q', '-b', 'main');
    git('init', '-q', '--bare', origin);
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.test');
    writeFileSync(join(repo, 'version.txt'), '7.1.17\n');
    git('add', '.');
    git('commit', '-qm', 'Legacy PC release');
    git('tag', 'v7.1.17');
    mkdirSync(join(repo, '.github', 'scripts'), { recursive: true });
    writeFileSync(join(repo, '.github', 'scripts', 'build_pc.mjs'), '// ZIP builder fixture\n');
    copyFileSync(new URL('../.github/release-notes-template.md', import.meta.url), join(repo, '.github', 'release-notes-template.md'));
    git('add', '.');
    git('commit', '-qm', 'refactor: package the PC client');
    env.RELEASE_SHA = git('rev-parse', 'HEAD');
    git('remote', 'add', 'origin', origin);
    git('push', '--quiet', 'origin', 'main', '--tags');

    const archiveDir = join(repo, 'release-artifact', 'dist');
    const metadataDir = join(repo, 'release-artifact', 'notes');
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(metadataDir, { recursive: true });
    const artifact = process.env.IVLYRICS_TEST_PACKAGE_VERSION === env.RELEASE_VERSION
        ? readFileSync(new URL('../dist/ivLyrics.zip', import.meta.url))
        : zipSync({ 'ivLyrics/version.txt': Buffer.from(env.RELEASE_VERSION + '\n') });
    env.RELEASE_PACKAGE_SHA256 = createHash('sha256').update(artifact).digest('hex');
    const writeArchive = (directory, archive) => {
        writeFileSync(join(directory, 'ivLyrics.zip'), archive);
        writeFileSync(join(directory, 'ivLyrics.zip.sha256'), createHash('sha256').update(archive).digest('hex') + '  ivLyrics.zip\n');
    };
    writeArchive(archiveDir, artifact);
    const replacement = zipSync({
        'ivLyrics/version.txt': Buffer.from(env.RELEASE_VERSION + '\n'),
        'ivLyrics/index.js': Buffer.from('A different build of the same version'),
    });
    const notes = '# Fixture release\n';
    const notesPath = join(metadataDir, 'release-notes.md');
    writeFileSync(notesPath, notes);
    const metadata = join(metadataDir, `ivLyrics-${env.RELEASE_TAG}-release.json`);
    const writeMetadata = (commit, releaseTitle = env.RELEASE_TITLE) => writeFileSync(metadata, JSON.stringify({
        version: env.RELEASE_VERSION, tag: env.RELEASE_TAG, commit, releaseTitle,
        releaseNotesSha256: createHash('sha256').update(readFileSync(notesPath)).digest('hex'),
    }));
    writeMetadata(env.RELEASE_SHA);

    return {
        env, git, run, notes, notesPath, root, repo, writeMetadata, execute,
        outputs: () => readFileSync(output, 'utf8'),
        stable: () => git('--git-dir', origin, 'show', 'refs/heads/main:version.txt'),
        trace: () => readFileSync(join(gh, 'trace'), 'utf8'),
        releaseInfo: () => JSON.parse(readFileSync(join(gh, env.RELEASE_TAG, 'release.json'), 'utf8')),
        releaseExists: () => existsSync(join(gh, env.RELEASE_TAG, 'release.json')),
        replaceActionsArchive: () => writeArchive(archiveDir, replacement),
        replacePublishedArchive: () => writeArchive(join(gh, env.RELEASE_TAG), replacement),
        setReleaseHistory: entries => writeFileSync(join(gh, 'history.json'), JSON.stringify(entries)),
        setLatest: tag => writeFileSync(join(gh, 'latest'), tag),
        resetLatestReads: () => writeFileSync(join(gh, 'latest-reads'), '0'),
    };
}

function succeeded(result) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
}

function failed(result, message) {
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, message);
}

test('a dry run uses the selected commit even when the version has a legacy tag', { skip: !canRun }, context => {
    const fx = fixture(context);
    succeeded(fx.run('select-source', { RELEASE_VERSION: '7.1.17', DRY_RUN: 'true' }));
    assert.match(fx.outputs(), new RegExp(`sha=${fx.env.RELEASE_SHA}\\n`));
    failed(fx.run('select-source', { RELEASE_VERSION: '7.1.17' }), /predates install ZIP builds/);
    assert.equal(fx.git('rev-parse', 'HEAD'), fx.env.RELEASE_SHA);
    const preview = join(fx.root, 'preview');
    succeeded(fx.execute('python3', [generateNotes], {
        RELEASE_VERSION: '7.1.17', RELEASE_TAG: 'v7.1.17', RELEASE_NOTES_DIR: preview, RELEASE_NOTES_REQUIRE_AI: 'false',
    }));
    const summary = JSON.parse(readFileSync(join(preview, 'ivLyrics-v7.1.17-release.json'), 'utf8'));
    assert.equal(summary.commit, fx.env.RELEASE_SHA);
    assert.equal(summary.commitCount, 2);
});

test('a publishing retry switches to the existing tested tag', { skip: !canRun }, context => {
    const fx = fixture(context);
    fx.git('tag', '-a', fx.env.RELEASE_TAG, '-m', 'Tested version');
    writeFileSync(join(fx.repo, 'follow-up.txt'), 'later work');
    fx.git('add', 'follow-up.txt');
    fx.git('commit', '-qm', 'Follow-up changes');
    succeeded(fx.run('select-source'));
    assert.equal(fx.git('rev-parse', 'HEAD'), fx.env.RELEASE_SHA);
    assert.match(fx.outputs(), new RegExp(`sha=${fx.env.RELEASE_SHA}\\n`));
});

test('release notes use a public baseline and include changes from an unpublished tag', { skip: !canRun }, context => {
    const fx = fixture(context);
    fx.git('tag', 'v7.1.18');
    writeFileSync(join(fx.repo, 'prerelease.txt'), 'prerelease change');
    fx.git('add', 'prerelease.txt');
    fx.git('commit', '-qm', 'feat: add a prerelease change');
    fx.git('tag', 'v7.1.19');
    writeFileSync(join(fx.repo, 'released.txt'), 'subsequent change');
    fx.git('add', 'released.txt');
    fx.git('commit', '-qm', 'fix: add the follow-up change');
    fx.setReleaseHistory([
        { tag_name: 'v7.1.19', draft: false, prerelease: true },
        { tag_name: 'v7.1.18', draft: true, prerelease: false },
        { tag_name: 'v7.1.17', draft: false, prerelease: false },
    ]);
    for (const [prerelease, baseline, commitCount] of [['false', 'v7.1.17', 3], ['true', 'v7.1.19', 1]]) {
        const dir = join(fx.root, `notes-${prerelease}`);
        succeeded(fx.execute('python3', [generateNotes], {
            RELEASE_NOTES_USE_RELEASE_HISTORY: 'true', RELEASE_NOTES_REQUIRE_AI: 'false', RELEASE_NOTES_DIR: dir,
            RELEASE_SHA: fx.git('rev-parse', 'HEAD'), PRERELEASE: prerelease,
        }));
        const metadata = JSON.parse(readFileSync(join(dir, `ivLyrics-${fx.env.RELEASE_TAG}-release.json`), 'utf8'));
        assert.equal(metadata.previousTag, baseline);
        assert.equal(metadata.commitCount, commitCount);
    }
});

test('an interrupted draft can resume with its saved notes without contacting the release-note provider', { skip: !canRun }, context => {
    const fx = fixture(context);
    failed(fx.run('publish', { IVL_CORRUPT_UPLOADED_ZIP: 'true' }), /archive does not match the tested ZIP/);
    assert.equal(fx.releaseInfo().isDraft, true);
    const recovered = join(fx.root, 'recovered-draft-notes');
    const trace = fx.trace();
    succeeded(fx.execute('python3', [generateNotes], {
        RELEASE_NOTES_REUSE_PUBLISHED: 'true', RELEASE_NOTES_REQUIRE_AI: 'true', RELEASE_NOTES_DIR: recovered,
        RELEASE_NOTES_USE_RELEASE_HISTORY: 'true', IVL_RELEASE_HISTORY_FAILED: 'true',
    }));
    assert.doesNotMatch(fx.trace().slice(trace.length), /api --paginate/);
    const restoredNotes = readFileSync(join(recovered, 'release-notes.md'), 'utf8');
    const metadata = JSON.parse(readFileSync(join(recovered, `ivLyrics-${fx.env.RELEASE_TAG}-release.json`), 'utf8'));
    assert.equal(restoredNotes, fx.notes);
    assert.equal(metadata.releaseTitle, fx.env.RELEASE_TITLE);
    assert.equal(metadata.releaseNotesSha256, createHash('sha256').update(restoredNotes).digest('hex'));
    succeeded(fx.run('publish'));
    assert.equal(fx.releaseInfo().isDraft, false);
});

test('the publish job checks for existing notes even when it reuses the original build outputs', () => {
    const publishJob = releaseWorkflow.slice(releaseWorkflow.indexOf('\n  publish:'));
    assert.match(publishJob, /^\s+RELEASE_NOTES_REUSE_PUBLISHED: "true"$/m);
});

test('only a missing release allows a recovery attempt to generate new notes', { skip: !canRun }, context => {
    const fx = fixture(context);
    const notesDir = join(fx.root, 'notes');
    const env = { RELEASE_NOTES_REUSE_PUBLISHED: 'true', RELEASE_NOTES_DIR: notesDir };
    failed(fx.execute('python3', [generateNotes], { ...env, IVL_RELEASE_VIEW_FAILED: 'true' }),
        /GitHub release lookup is unavailable/);
    assert.equal(existsSync(notesDir), false);
    succeeded(fx.execute('python3', [generateNotes], env));
    assert.equal(existsSync(join(notesDir, 'release-notes.md')), true);
});

test('publishing an existing draft uses the title and notes from the verified artifact', { skip: !canRun }, context => {
    const fx = fixture(context);
    failed(fx.run('publish', { IVL_CORRUPT_UPLOADED_ZIP: 'true' }), /archive does not match the tested ZIP/);
    assert.equal(fx.releaseInfo().isDraft, true);
    const releaseTitle = '7.2.0 - Verified artifact';
    const notes = '# Verified notes\n\n- The draft was regenerated.\n';
    writeFileSync(fx.notesPath, notes);
    fx.writeMetadata(fx.env.RELEASE_SHA, releaseTitle);
    succeeded(fx.run('publish', { RELEASE_TITLE: releaseTitle }));
    assert.deepEqual(fx.releaseInfo(), { isDraft: false, isPrerelease: false, name: releaseTitle, body: notes });
});

test('verified publication, update marker, and recovery from an already published release', { skip: !canRun }, context => {
    const fx = fixture(context);
    succeeded(fx.run('publish'));
    assert.equal(fx.releaseInfo().isDraft, false);
    assert.equal(fx.stable(), '7.1.17', 'publishing by itself does not advance the updater');
    assert.match(fx.outputs(), /published=true/);

    const trace = fx.trace();
    succeeded(fx.run('publish'));
    assert.match(fx.outputs(), /published=false/);
    assert.doesNotMatch(fx.trace().slice(trace.length), /release (upload|edit|create)/);
    const recovered = join(fx.root, 'recovered-notes');
    succeeded(fx.execute('python3', [generateNotes], {
        RELEASE_NOTES_REUSE_PUBLISHED: 'true', RELEASE_NOTES_REQUIRE_AI: 'true', RELEASE_NOTES_DIR: recovered,
    }));
    assert.equal(readFileSync(join(recovered, 'release-notes.md'), 'utf8'), fx.notes);

    fx.resetLatestReads();
    failed(fx.run('advance-update-marker', { IVL_CHANGE_LATEST: '3' }), /latest stable release changed/);
    assert.equal(fx.stable(), '7.1.17');
    fx.resetLatestReads();

    fx.git('switch', '-c', 'concurrent-change');
    writeFileSync(join(fx.repo, 'concurrent.txt'), 'preserve this default branch change\n');
    fx.git('add', 'concurrent.txt');
    fx.git('commit', '-qm', 'Unrelated change while advertising the release');
    const concurrentCommit = fx.git('rev-parse', 'HEAD');
    fx.git('push', 'origin', 'concurrent-change');
    fx.git('switch', '--detach', fx.env.RELEASE_SHA);
    const hooks = join(fx.repo, '.git', 'hooks');
    fx.git('config', 'core.hooksPath', hooks);
    writeFileSync(join(hooks, 'pre-push'), `#!/bin/sh
set -eu
git --git-dir="$2" update-ref refs/heads/main ${concurrentCommit}
rm -- "$0"
`, { mode: 0o755 });

    succeeded(fx.run('advance-update-marker'));
    assert.equal(fx.stable(), fx.env.RELEASE_VERSION);
    assert.equal(fx.git('show', 'origin/main:concurrent.txt'), 'preserve this default branch change');
    assert.equal(fx.git('rev-parse', 'HEAD'), fx.env.RELEASE_SHA, 'the notification step uses the tested checkout');
});

test('artifact, tag, and uploaded ZIP mismatches stop publication', { skip: !canRun }, context => {
    const fx = fixture(context);
    const legacy = fx.git('rev-parse', 'v7.1.17^{commit}');
    fx.writeMetadata(legacy);
    failed(fx.run('publish'), /metadata does not match the tested source/);
    assert.equal(fx.releaseExists(), false);
    fx.writeMetadata(fx.env.RELEASE_SHA);

    fx.git('tag', '-a', fx.env.RELEASE_TAG, legacy, '-m', 'Different commit on origin');
    fx.git('push', 'origin', `refs/tags/${fx.env.RELEASE_TAG}`);
    failed(fx.run('publish'), /remote release tag does not point to the tested commit/);
    assert.equal(fx.releaseExists(), false);

    fx.git('tag', '-f', '-a', fx.env.RELEASE_TAG, fx.env.RELEASE_SHA, '-m', 'Tested commit on origin');
    fx.git('push', 'origin', `+refs/tags/${fx.env.RELEASE_TAG}`);
    const corrupted = fx.run('publish', { IVL_CORRUPT_UPLOADED_ZIP: 'true' });
    assert.equal(corrupted.status, 1, corrupted.stdout + corrupted.stderr);
    assert.equal(fx.releaseInfo().isDraft, true);
    assert.equal(fx.stable(), '7.1.17');
    assert.doesNotMatch(fx.trace(), /release edit/);
});

test('publication rejects a same-version ZIP and checksum that differ from the build output', { skip: !canRun }, context => {
    const fx = fixture(context);
    fx.replaceActionsArchive();
    failed(fx.run('publish'), /archive does not match the tested ZIP/);
    assert.equal(fx.releaseExists(), false);
    assert.equal(fx.stable(), '7.1.17');
});

test('publication refuses notes that differ from the checked release metadata', { skip: !canRun }, context => {
    const fx = fixture(context);
    writeFileSync(fx.notesPath, '# Unverified notes\n');
    failed(fx.run('publish'), /release notes do not match/i);
    assert.equal(fx.releaseExists(), false);
    assert.equal(fx.stable(), '7.1.17');
});

test('the updater marker stays put if published assets have changed since verification', { skip: !canRun }, context => {
    const fx = fixture(context);
    succeeded(fx.run('publish'));
    fx.replacePublishedArchive();
    failed(fx.run('advance-update-marker'), /archive does not match the tested ZIP/);
    assert.equal(fx.stable(), '7.1.17');
});

test('retrying the marker push verifies the public assets again', { skip: !canRun }, context => {
    const fx = fixture(context);
    succeeded(fx.run('publish'));
    fx.replaceActionsArchive();
    const hooks = join(fx.repo, '.git', 'hooks');
    fx.git('config', 'core.hooksPath', hooks);
    writeFileSync(join(hooks, 'pre-push'), `#!/bin/sh
set -eu
cp release-artifact/dist/ivLyrics.zip release-artifact/dist/ivLyrics.zip.sha256 "$IVL_RELEASE_FIXTURE/$RELEASE_TAG/"
rm -- "$0"
exit 1
`, { mode: 0o755 });

    failed(fx.run('advance-update-marker'), /archive does not match the tested ZIP/);
    assert.equal(fx.stable(), '7.1.17');
});

test('a prerelease leaves version.txt and the stable release untouched', { skip: !canRun }, context => {
    const fx = fixture(context);
    succeeded(fx.run('publish', { PRERELEASE: 'true' }));
    assert.equal(fx.releaseInfo().isPrerelease, true);
    failed(fx.run('advance-update-marker', { PRERELEASE: 'true' }), /prerelease cannot update the stable version/);
    assert.equal(fx.stable(), '7.1.17');
});

test('a lagging version.txt cannot make an older build the latest stable release', { skip: !canRun }, context => {
    const fx = fixture(context);
    fx.setLatest('v7.10.0');
    failed(fx.run('publish'), /older than the latest GitHub release \(7\.10\.0\)/);
    assert.equal(fx.stable(), '7.1.17');
    assert.equal(fx.releaseExists(), false);
    assert.equal(fx.git('ls-remote', '--tags', 'origin', fx.env.RELEASE_TAG), '');
    assert.doesNotMatch(fx.trace(), /release (create|upload|edit)/);
});

test('a newer stable release during upload leaves the older build as a draft', { skip: !canRun }, context => {
    const fx = fixture(context);
    failed(fx.run('publish', { IVL_CHANGE_LATEST: '2' }), /older than the latest GitHub release/);
    assert.equal(fx.releaseInfo().isDraft, true);
    assert.equal(fx.stable(), '7.1.17');
    assert.doesNotMatch(fx.trace(), /release edit/);
});
