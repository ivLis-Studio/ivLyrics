import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [group, command, tag, ...args] = process.argv.slice(2);
const root = process.env.IVL_RELEASE_FIXTURE;
const trace = join(root, 'trace');
appendFileSync(trace, `${group} ${command}\n`);

if (group === 'api' && command === '--paginate' && tag.endsWith('/releases?per_page=100')) {
    if (process.env.IVL_RELEASE_HISTORY_FAILED === 'true') {
        console.error('GitHub release history is unavailable');
        process.exit(1);
    }
    const entries = JSON.parse(readFileSync(join(root, 'history.json'), 'utf8'));
    const stableOnly = args[args.indexOf('--jq') + 1].includes('.prerelease == false');
    for (const entry of entries) {
        if (!entry.draft && (!stableOnly || !entry.prerelease)) console.log(entry.tag_name);
    }
    process.exit(0);
}

if (group === 'api' && command.endsWith('/releases/latest')) {
    const countPath = join(root, 'latest-reads');
    const readCount = Number(existsSync(countPath) ? readFileSync(countPath, 'utf8') : 0) + 1;
    writeFileSync(countPath, String(readCount));
    console.log(process.env.IVL_CHANGE_LATEST === String(readCount)
        ? 'v9.0.0' : readFileSync(join(root, 'latest'), 'utf8').trim());
    process.exit(0);
}
if (group !== 'release') throw new Error('Unexpected fixture command');

const releaseDir = join(root, tag);
const infoPath = join(releaseDir, 'release.json');
const info = existsSync(infoPath) ? JSON.parse(readFileSync(infoPath, 'utf8')) : null;
const valueAfter = flag => args[args.indexOf(flag) + 1];

switch (command) {
case 'view':
    if (process.env.IVL_RELEASE_VIEW_FAILED === 'true') {
        console.error('GitHub release lookup is unavailable');
        process.exit(1);
    }
    if (!info) {
        console.error('release not found');
        process.exit(1);
    }
    console.log(args.includes('--jq') ? String(info[valueAfter('--jq').slice(1)]) : JSON.stringify(info));
    break;
case 'create':
    if (info) throw new Error('Release already exists');
    mkdirSync(releaseDir);
    writeFileSync(infoPath, JSON.stringify({
        isDraft: true,
        isPrerelease: false,
        name: valueAfter('--title'),
        body: readFileSync(valueAfter('--notes-file'), 'utf8'),
    }));
    break;
case 'upload':
    copyFileSync(args[0], join(releaseDir, 'ivLyrics.zip'));
    copyFileSync(args[1], join(releaseDir, 'ivLyrics.zip.sha256'));
    break;
case 'download': {
    const destination = valueAfter('--dir');
    copyFileSync(join(releaseDir, 'ivLyrics.zip'), join(destination, 'ivLyrics.zip'));
    copyFileSync(join(releaseDir, 'ivLyrics.zip.sha256'), join(destination, 'ivLyrics.zip.sha256'));
    if (process.env.IVL_CORRUPT_UPLOADED_ZIP === 'true') appendFileSync(join(destination, 'ivLyrics.zip'), 'corrupt');
    break;
}
case 'edit':
    if (!info?.isDraft) throw new Error('Only a draft may be published');
    info.isDraft = false;
    info.isPrerelease = args.includes('--prerelease=true');
    if (args.includes('--title')) info.name = valueAfter('--title');
    if (args.includes('--notes-file')) info.body = readFileSync(valueAfter('--notes-file'), 'utf8');
    writeFileSync(infoPath, JSON.stringify(info));
    if (args.includes('--latest=true')) writeFileSync(join(root, 'latest'), tag);
    break;
default:
    throw new Error(`Unexpected release command: ${command}`);
}
