// Serialize access to the local model and prioritize interactive work.
export function createLocalModelScheduler({
    getPlayingTrackId, supersededError, timeoutError, jobBudgetMs, getIdleUnloadMinutes, isModelLoaded, unloadModel,
}) {
    const queue = [];
    const jobs = new Map();
    let pumping = false;
    let idleTimer = null;

    function clearIdleTimer() {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = null;
    }

    function scheduleIdleUnload() {
        clearIdleTimer();
        const minutes = getIdleUnloadMinutes();
        if (!minutes || !isModelLoaded()) return;
        idleTimer = setTimeout(() => {
            idleTimer = null;
            if (!pumping && !queue.length) void runTask(unloadModel).catch(() => {});
        }, minutes * 60_000);
    }

    // kind 'lyrics' is a request from the app; 'test' is the settings card's test translation.
    function startJob({ kind, trackId = null, text = '', onScreen = false }) {
        const controller = new AbortController();
        const deadline = Date.now() + jobBudgetMs;
        let timer;
        let rejectStopped = null;
        const whenStopped = new Promise((_, reject) => { rejectStopped = reject; });
        whenStopped.catch(() => {});
        const id = trackId ? String(trackId) : null;
        const job = {
            kind,
            onScreen,
            trackId: id,
            // Lyrics on screen without a track id are told apart by their text.
            identity: id ? `track:${id}` : (onScreen ? `text:${text}` : null),
            signal: controller.signal,
            stopped: false,
            stopReason: null,
            // Set by the first failed block, so the request's other blocks skip the engine.
            failure: null,
            whenStopped,
            assertActive() {
                if (!job.stopped && Date.now() >= deadline) job.stop(timeoutError());
                if (job.stopped) throw job.stopReason;
            },
            stop(reason) {
                if (job.stopped) return;
                job.stopped = true;
                job.stopReason = reason;
                clearTimeout(timer);
                rejectStopped(reason);
                // Blocks that have not started are dropped; the running one is aborted.
                dropQueuedBlocks(job, reason);
                controller.abort(reason);
            }
        };
        if (kind === 'lyrics') stopSupersededJobs(job);
        timer = setTimeout(() => job.stop(timeoutError()), Math.max(0, deadline - Date.now()));
        jobs.set(job, timer);
        return job;
    }

    function dropQueuedBlocks(job, reason) {
        for (let index = queue.length - 1; index >= 0; index--) {
            if (queue[index].job === job) queue.splice(index, 1)[0].reject(reason);
        }
    }

    function stopSupersededJobs(job) {
        if (!job.identity) return;
        const playingTrackId = getPlayingTrackId();
        // A request without a line callback is either another view of the playing
        // song or a prefetch for an upcoming one. Only a prefetch replaces older
        // prefetches, and only when it is certain which song is playing.
        if (!job.onScreen && (!playingTrackId || job.trackId === playingTrackId)) return;
        for (const other of jobs.keys()) {
            if (other.kind !== 'lyrics' || other.onScreen !== job.onScreen) continue;
            if (!other.identity || other.identity === job.identity) continue;
            // The playing song's translation is never stopped.
            if (playingTrackId && other.trackId === playingTrackId) continue;
            other.stop(supersededError());
        }
    }

    function finishJob(job) {
        clearTimeout(jobs.get(job));
        jobs.delete(job);
    }

    function priorityOf(entry, playingTrackId) {
        const { job } = entry;
        if (!job) return 0;
        // The settings card's test is a single line someone is waiting for.
        if (job.kind === 'test') return 1;
        if (playingTrackId && job.trackId === playingTrackId) return 2;
        return job.onScreen ? 3 : 4;
    }

    function takeNextTask() {
        if (!queue.length) return null;
        const playingTrackId = queue.length > 1 ? getPlayingTrackId() : null;
        let best = 0;
        for (let index = 1; index < queue.length; index++) {
            if (priorityOf(queue[index], playingTrackId) < priorityOf(queue[best], playingTrackId)) best = index;
        }
        return queue.splice(best, 1)[0];
    }

    // Settings actions pass no job and run before any translation work.
    function runTask(task, job = null) {
        if (job?.stopped) return Promise.reject(job.stopReason);
        return new Promise((resolve, reject) => {
            queue.push({ task, job, resolve, reject });
            void pump();
        });
    }

    async function pump() {
        if (pumping) return;
        pumping = true;
        clearIdleTimer();
        try {
            for (let next = takeNextTask(); next; next = takeNextTask()) {
                try {
                    next.resolve(await next.task());
                } catch (error) {
                    next.reject(error);
                }
            }
        } finally {
            pumping = false;
            scheduleIdleUnload();
        }
    }

    return {
        startJob, finishJob, runTask, dropQueuedBlocks, clearIdleTimer,
        rescheduleIdleUnload() {
            if (!pumping) scheduleIdleUnload();
        }
    };
}
