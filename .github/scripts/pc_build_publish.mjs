import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const appName = "ivLyrics";
const zipName = "ivLyrics.zip";
const packageNames = [appName, zipName, `${zipName}.sha256`];
const pendingName = ".ivlyrics-pending-publication";
const planName = "publication.json";
const lockName = ".ivlyrics-publish.sqlite";
const SQLITE_BUSY = 5;

async function artifactExists(path, directory) {
    const stat = await lstat(path).catch(error => {
        if (error.code !== "ENOENT") throw error;
        return null;
    });
    if (stat && !(directory ? stat.isDirectory() : stat.isFile())) {
        throw new Error(`Cannot replace build output at ${path}.`);
    }
    return Boolean(stat);
}

async function withPublishLock(directory, operation) {
    const path = join(directory, lockName);
    await artifactExists(path, false);
    // SQLite releases its filesystem lock when this process exits. Keep the
    // shared file in place so a concurrent connection cannot lock a new inode.
    const lock = new DatabaseSync(path);
    try {
        try {
            lock.exec("BEGIN IMMEDIATE");
        } catch (error) {
            if (error.errcode !== SQLITE_BUSY) throw error;
            throw new Error(`Another build is publishing to ${directory}.`, { cause: error });
        }
        return await operation();
    } finally {
        lock.close();
    }
}

async function readPublicationPlan(pending) {
    const plan = JSON.parse(await readFile(join(pending, planName), "utf8"));
    if (!/^\.ivlyrics-build-[a-zA-Z0-9]{6}$/.test(plan?.staging)
        || !Array.isArray(plan.hadOutput) || ![1, packageNames.length].includes(plan.hadOutput.length)
        || plan.hadOutput.some(value => typeof value !== "boolean")) {
        throw new Error(`Invalid build publication record at ${pending}.`);
    }
    return plan;
}

async function rollbackPublication(directory, pending) {
    if (!await artifactExists(pending, true)) return;
    const plan = await readPublicationPlan(pending);
    const staging = join(directory, plan.staging);
    if (await artifactExists(staging, true)
        || !await artifactExists(join(pending, "artifacts"), true)
        || !await artifactExists(join(pending, "previous"), true)) {
        throw new Error(`Cannot restore the previous build from ${pending}.`);
    }

    for (const [index, hadOutput] of plan.hadOutput.entries()) {
        const name = packageNames[index];
        const isDirectory = name === appName;
        const target = join(directory, name);
        const previous = join(pending, "previous", name);
        const candidate = join(pending, "artifacts", name);
        const hasTarget = await artifactExists(target, isDirectory);
        const hasPrevious = await artifactExists(previous, isDirectory);
        if (hadOutput && !hasPrevious) {
            if (!hasTarget) throw new Error(`Previous build output is missing at ${target}.`);
            continue;
        }
        if (hasTarget) {
            if (await artifactExists(candidate, isDirectory)) throw new Error(`Cannot restore build output at ${target}.`);
            await rename(target, candidate);
        }
        if (hasPrevious) await rename(previous, target);
    }

    // Removing the pending name atomically makes recovery safe to retry
    // before cleanup, even if recovery itself was interrupted.
    await rename(pending, staging);
    await rm(staging, { recursive: true, force: true });
}

export async function recoverInterruptedBuild(directory) {
    const pending = join(directory, pendingName);
    if (await artifactExists(pending, true)) {
        await withPublishLock(directory, () => rollbackPublication(directory, pending));
    }
}

export async function publishBuildFiles(directory, staging, zip) {
    const pending = join(directory, pendingName);
    const names = zip ? packageNames : [appName];
    await withPublishLock(directory, async () => {
        await rollbackPublication(directory, pending);
        const hadOutput = await Promise.all(names.map(name => artifactExists(join(directory, name), name === appName)));
        await mkdir(join(staging, "previous"));
        await writeFile(join(staging, planName), JSON.stringify({ staging: basename(staging), hadOutput }));
        await rename(staging, pending);
        try {
            for (const [index, name] of names.entries()) {
                const target = join(directory, name);
                if (hadOutput[index]) await rename(target, join(pending, "previous", name));
                await rename(join(pending, "artifacts", name), target);
            }
            await rename(pending, staging);
        } catch (error) {
            try {
                await rollbackPublication(directory, pending);
            } catch (rollbackError) {
                throw new AggregateError([error, rollbackError], `Build replacement failed. Recovery data is in ${pending}.`);
            }
            throw error;
        }
    });
}
