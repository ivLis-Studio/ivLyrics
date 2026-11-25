import {
    hasSameLrcRedLyrics as sameLyricsLines,
    normalizeLrcRedIsrc as normalizeIsrc,
    parseLrcRedWordSyncResponse,
    withParsedLrcRedLyrics as withParsedLyrics,
} from "./lrcRedWordTiming.mjs";

const SYNC_RETRY_MS = 10 * 60 * 1000;

export function createLrcRedWordSyncQueue({
    isEnabled, getFreshLyrics, requestSync, publishWordSyncStatus, deliverUpgrade, debug,
}) {
    // One generation at a time, at most four pending recordings. Repeated
    // playback, prefetch and cache lookups share the same job and cooldown.
    const wordSyncJobs = new Map();
    let syncQueue = Promise.resolve();
    let pendingSyncs = 0;
    let syncUnavailableUntil = 0;
    let wordSyncSequence = 0;

    const requestWordSync = (isrc, durationMs, checkFresh) => {
        const existing = wordSyncJobs.get(isrc);
        if (existing && (!existing.settled || Date.now() < existing.retryAt)) return existing;
        if (pendingSyncs >= 4 || Date.now() < syncUnavailableUntil) return null;
        wordSyncJobs.delete(isrc);
        for (const [key, job] of wordSyncJobs) {
            if (wordSyncJobs.size < 32) break;
            if (job.settled) wordSyncJobs.delete(key);
        }
        const job = {
            id: `lrcred-${++wordSyncSequence}`, deliveries: new Map(), phase: 'queued',
            settled: false, retryAt: Infinity, parsed: null, promise: null,
        };
        const hasCurrentDelivery = () => [...job.deliveries.values()].some(delivery => delivery.isCurrent());
        pendingSyncs++;
        job.promise = syncQueue.then(async () => {
            if (Date.now() < syncUnavailableUntil || !hasCurrentDelivery()) return null;
            // A persisted line-only result may predate another client's sync.
            // Read the current TTML before spending another generation on it.
            if (checkFresh) {
                try {
                    const current = await getFreshLyrics(isrc, durationMs);
                    if (current.karaoke.length) return current;
                } catch { /* A missing/invalid TTML can still be generated. */ }
            }
            if (!hasCurrentDelivery()) return null;
            job.phase = 'generating';
            for (const [uri, delivery] of job.deliveries) showProgress(job, uri, delivery);
            if (!hasCurrentDelivery()) return null;
            return requestSync(isrc, async response => {
                if (!response.ok) {
                    if (response.status === 429 || response.status === 503) {
                        const retryAfter = response.headers?.get?.('Retry-After');
                        const seconds = Number(retryAfter);
                        const retryAt = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : Date.now() + (seconds || 0) * 1000;
                        syncUnavailableUntil = Math.max(Date.now() + SYNC_RETRY_MS, retryAt || 0);
                    }
                    throw new Error(`Word sync failed (${response.status})`);
                }
                // Keep the timeout and loading state through the whole body,
                // then use these new timings directly instead of re-fetching.
                return parseLrcRedWordSyncResponse(await response.json(), isrc);
            });
        }).catch(error => {
            debug('[lrc.red Lyrics Addon] Automatic word sync unavailable', { isrc, error: error.message });
            return null;
        }).then(parsed => {
            job.parsed = parsed;
            job.settled = true;
            job.retryAt = parsed ? Date.now() + 60 * 60 * 1000
                : job.phase === 'generating' ? Date.now() + SYNC_RETRY_MS : 0;
            pendingSyncs--;
            return parsed;
        });
        syncQueue = job.promise;
        wordSyncJobs.set(isrc, job);
        return job;
    };

    function showProgress(job, uri, delivery) {
        if (!delivery.isCurrent() || delivery.notified) return;
        delivery.notified = true;
        publishWordSyncStatus(job, uri, 'generating');
    }

    const queueWordSync = (info, result, durationMs, checkFresh = false, isRequestCurrent = () => true) => {
        const isrc = normalizeIsrc(result.lrcred?.isrc);
        if (!isEnabled() || !isRequestCurrent() || !isrc || result.karaoke?.length || result.syncDataApplied || result.error) return;
        const job = requestWordSync(isrc, durationMs, checkFresh);
        if (!job || (job.settled && !job.parsed)) return;
        const uri = info.uri;
        const previous = job.deliveries.get(uri);
        if (previous?.isCurrent() && (!previous.finished || previous.completed)) return;
        const ownsDelivery = () => job.deliveries.get(uri) === delivery;
        const delivery = {
            finished: false,
            completed: false,
            notified: !!previous?.notified && !previous.finished,
            isCurrent: () => ownsDelivery() && isEnabled() && isRequestCurrent(),
        };
        job.deliveries.set(uri, delivery);
        if (!job.settled && job.phase === 'generating') showProgress(job, uri, delivery);
        job.promise.then(async parsed => {
            let completed = false;
            try {
                if (!delivery.isCurrent() || !parsed || !sameLyricsLines(result, parsed)) return;
                const upgraded = { ...withParsedLyrics(result, parsed), karaokeGranularity: 'word' };
                completed = await deliverUpgrade(info, upgraded, delivery.isCurrent);
            } catch (error) {
                debug('[lrc.red Lyrics Addon] Could not deliver word sync', { error: error.message });
            } finally {
                delivery.finished = true;
                delivery.completed = completed;
                if (ownsDelivery() && delivery.notified) {
                    const phase = !delivery.isCurrent() ? 'cancelled' : completed ? 'complete' : 'failed';
                    publishWordSyncStatus(job, uri, phase);
                }
            }
        });
    };

    return {
        queueWordSync,
        readWordLyrics: isrc => wordSyncJobs.get(isrc)?.parsed,
        getWordSyncStatuses(uri) {
            if (!isEnabled()) return [];
            return [...wordSyncJobs.values()]
                .filter(job => {
                    const delivery = job.deliveries.get(uri);
                    return delivery?.notified && !delivery.finished && delivery.isCurrent();
                })
                .map(job => ({ uri, requestId: job.id, phase: 'generating' }));
        },
    };
}
