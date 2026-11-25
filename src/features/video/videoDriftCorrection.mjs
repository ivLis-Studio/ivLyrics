const VIDEO_SYNC_SEEK_THRESHOLD_SECONDS = 0.5;
// Drift below the seek threshold used to be left alone, so a video that resumed
// late after a seek could stay up to half a second behind. Players that can
// change speed (the local helper video) now ease steady drift above this out,
// and the time a seek needs to resume is learned so the next seek lands on
// time. YouTube players keep to hard seeks: each one reloads the video.
const VIDEO_DRIFT_SOFT_THRESHOLD_SECONDS = 0.15;
const VIDEO_DRIFT_BACKOFF_THRESHOLD_SECONDS = 0.35;
const VIDEO_DRIFT_SAMPLE_COUNT = 6;
const VIDEO_DRIFT_MIN_SAMPLES = 4;
const VIDEO_DRIFT_SETTLE_MS = 1200;
const VIDEO_DRIFT_SOFT_INTERVAL_MS = 3000;
// More small corrections than this within the window means the player cannot
// hold sync (each one is a visible jump), so only larger drift is chased.
const VIDEO_DRIFT_BACKOFF_CORRECTIONS = 4;
const VIDEO_DRIFT_BACKOFF_WINDOW_MS = 30000;
// A seek can take well over a second to resume on a slow connection; the
// lead must be able to cover that or every seek lands behind again.
const VIDEO_DRIFT_MAX_LEAD_SECONDS = 6;
// After a seek the player buffers before it plays again. When that took longer
// than drift needs to cross the seek threshold (about 0.75 s), the next tick
// seeked again and restarted the buffering: the video never played and the
// page stuttered under a stream of seeks. A buffering seek gets this long,
// twice as long each time it still has not resumed.
const VIDEO_DRIFT_SEEK_GRACE_MS = 2500;
const VIDEO_DRIFT_MAX_SEEK_GRACE_MS = 10000;
// A YouTube background plays as a muted autoplay embed, where every seek is a
// positioned reload: the picture is black until the load plays. On a slow
// connection that takes seconds, and reloading for drift the reload itself
// caused, or while the video was only buffering, kept the background black
// almost all the time. A reload is only worth it for more drift than one
// costs (up to this much), and a load still buffering gets this long.
const VIDEO_RELOAD_MAX_TOLERANCE_SECONDS = 5;
const VIDEO_RELOAD_GRACE_MS = 6000;
const VIDEO_RELOAD_MAX_GRACE_MS = 20000;
const VIDEO_DRIFT_MAX_RATE_DELTA = 0.05;

const wrapVideoSyncTime = (targetVideoTime, duration) => {
    const parsedTarget = Number(targetVideoTime);
    const safeTarget = Number.isFinite(parsedTarget) ? Math.max(0, parsedTarget) : 0;
    const parsedDuration = Number(duration);
    if (Number.isFinite(parsedDuration) && parsedDuration > 0 && safeTarget >= parsedDuration) {
        return safeTarget % parsedDuration;
    }
    return safeTarget;
};

const createVideoDriftState = () => ({
    samples: [],
    leadSeconds: 0,
    lastSeekAt: -Infinity,
    measureLeadAfterSeek: false,
    softCorrectionTimes: [],
    softThresholdSeconds: VIDEO_DRIFT_SOFT_THRESHOLD_SECONDS,
    // Set when the user nudges the video timing: the next check lands on the
    // new position at once instead of waiting for steady drift.
    seekRequested: false,
    // A seek was sent and the video has not played steadily since.
    awaitingResume: false,
    seekGraceMs: VIDEO_DRIFT_SEEK_GRACE_MS,
    lastTargetTime: NaN,
    lastTargetAt: NaN,
    lastTargetPlaying: false,
    pendingSeekTargetTime: NaN,
    // How long a reload takes to play on this player and connection.
    seekCostSeconds: 0,
    // When a reloading player started buffering on its own (not after a seek).
    stalledSince: NaN,
});

// A new video starts with fresh samples; the learned seek lead depends on the
// player and connection, so it carries over, as does the cost of a reload.
const resetVideoDriftState = (state) => {
    if (!state) return;
    state.samples = [];
    state.lastSeekAt = -Infinity;
    state.measureLeadAfterSeek = false;
    state.softCorrectionTimes = [];
    state.softThresholdSeconds = VIDEO_DRIFT_SOFT_THRESHOLD_SECONDS;
    state.seekRequested = false;
    state.awaitingResume = false;
    state.seekGraceMs = VIDEO_DRIFT_SEEK_GRACE_MS;
    state.lastTargetTime = NaN;
    state.lastTargetAt = NaN;
    state.lastTargetPlaying = false;
    state.pendingSeekTargetTime = NaN;
    state.stalledSince = NaN;
};

// A Spotify seek, mapped skip or loop wrap changes the requested timeline,
// not the time a video needed to buffer. Compare consecutive target samples
// against normal playback progression before waiting or learning seek lead.
const recordVideoDriftTarget = (state, targetTime, now, isPlaying, durationSeconds = 0) => {
    const hasPreviousSample = Number.isFinite(state.lastTargetTime)
        && Number.isFinite(state.lastTargetAt) && Number.isFinite(now);
    const elapsed = hasPreviousSample ? Math.max(0, (now - state.lastTargetAt) / 1000) : 0;
    const advance = state.lastTargetPlaying && isPlaying ? elapsed : 0;
    const expectedTarget = state.lastTargetTime + advance;
    // Lead compensation can already have sent a seek into the next loop.
    // Do not restart that pending load when Spotify naturally reaches it.
    const pendingNextLoop = state.awaitingResume && durationSeconds > 0
        && state.pendingSeekTargetTime >= durationSeconds && expectedTarget >= durationSeconds
        && Math.abs(targetTime - wrapVideoSyncTime(expectedTarget, durationSeconds)) <= VIDEO_SYNC_SEEK_THRESHOLD_SECONDS;
    const jumped = hasPreviousSample && (now < state.lastTargetAt ||
        (!pendingNextLoop && Math.abs(targetTime - expectedTarget) > VIDEO_SYNC_SEEK_THRESHOLD_SECONDS));
    state.lastTargetTime = targetTime;
    state.lastTargetAt = now;
    state.lastTargetPlaying = isPlaying === true;
    return jumped;
};

const noteVideoDriftSeek = (state, now, measureLead, targetTime = NaN) => {
    state.lastSeekAt = now;
    state.samples = [];
    state.measureLeadAfterSeek = measureLead === true;
    state.awaitingResume = true;
    state.pendingSeekTargetTime = targetTime;
};

const getMedianValue = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Decides how to bring the video back in line with Spotify.
 * Drift is video time minus target time (positive: video ahead). Samples are
 * only taken while the video plays steadily and a seek has settled; their
 * median filters out the iframe clock's jitter.
 * @returns {{type: "none"} | {type: "seek", time: number} | {type: "rate", rate: number}}
 */
const planVideoDriftCorrection = (state, {
    currentTime,
    targetTime,
    now,
    isPlaying = false,
    isSteady = false,
    canAdjustRate = false,
    // False for players whose every seek reloads the video: a visible black gap
    // (see syncYouTubePlayerTimeline). Only drift past the seek threshold is
    // worth that.
    allowSoftSeek = true,
    // True when every seek reloads the video (a YouTube background). Such a
    // seek blanks the picture for as long as the reload takes to play.
    reloadsOnSeek = false,
    durationSeconds = 0,
}) => {
    if (!state || !Number.isFinite(targetTime)) return { type: "none" };
    const targetJumped = recordVideoDriftTarget(state, targetTime, now, isPlaying, durationSeconds);
    if (targetJumped || state.seekRequested) {
        state.awaitingResume = false;
        state.measureLeadAfterSeek = false;
        state.seekGraceMs = VIDEO_DRIFT_SEEK_GRACE_MS;
        state.samples = [];
    }
    const drift = Number.isFinite(currentTime) ? currentTime - targetTime : Infinity;
    if (state.awaitingResume && isPlaying) {
        if (!isSteady) {
            // Still buffering the last seek: seeking again would restart it.
            // A reload gets at least as long as reloads take here.
            const graceMs = reloadsOnSeek
                ? Math.max(state.seekGraceMs, VIDEO_RELOAD_GRACE_MS, state.seekCostSeconds * 1500)
                : state.seekGraceMs;
            if (!state.seekRequested && now - state.lastSeekAt < graceMs) {
                return canAdjustRate ? { type: "rate", rate: 1 } : { type: "none" };
            }
            state.seekGraceMs = Math.min(reloadsOnSeek ? VIDEO_RELOAD_MAX_GRACE_MS : VIDEO_DRIFT_MAX_SEEK_GRACE_MS,
                graceMs * 2);
        } else {
            // Playing again. However long the seek took to resume shows up as
            // the video trailing; aim that much further ahead from now on.
            state.awaitingResume = false;
            if (reloadsOnSeek && Number.isFinite(state.lastSeekAt)) {
                const cost = Math.max(0, (now - state.lastSeekAt) / 1000);
                state.seekCostSeconds = state.seekCostSeconds > 0 ? (state.seekCostSeconds + cost) / 2 : cost;
            }
            if (Number.isFinite(drift) && Math.abs(drift) > VIDEO_SYNC_SEEK_THRESHOLD_SECONDS) {
                state.leadSeconds = Math.min(VIDEO_DRIFT_MAX_LEAD_SECONDS, Math.max(0, state.leadSeconds - drift));
                // Learned once per seek: the settled samples would count this lag again.
                state.measureLeadAfterSeek = false;
            } else {
                state.seekGraceMs = VIDEO_DRIFT_SEEK_GRACE_MS;
            }
        }
    }
    // A reloading video that stalls while playing (resuming after a pause, or a
    // slow connection) is left to buffer: a reload now would only restart the
    // download from a black picture.
    if (reloadsOnSeek && isPlaying && !isSteady && !state.awaitingResume && !state.seekRequested
        && !targetJumped && Number.isFinite(drift)) {
        if (!Number.isFinite(state.stalledSince)) state.stalledSince = now;
        if (now - state.stalledSince < state.seekGraceMs) {
            state.samples = [];
            return { type: "none" };
        }
    } else {
        state.stalledSince = NaN;
    }
    // A paused background is hidden and a Spotify seek moves the target itself,
    // so both are matched at once. Otherwise a reload is only sent for drift
    // comparable to the black picture it costs (its learned lead then lands it
    // on time), never to chase each small lag a slow connection leaves.
    const seekThreshold = reloadsOnSeek && isPlaying && !targetJumped
        ? Math.max(VIDEO_SYNC_SEEK_THRESHOLD_SECONDS, Math.min(VIDEO_RELOAD_MAX_TOLERANCE_SECONDS, state.seekCostSeconds * 0.8))
        : VIDEO_SYNC_SEEK_THRESHOLD_SECONDS;
    if (state.seekRequested || Math.abs(drift) > seekThreshold) {
        state.seekRequested = false;
        state.stalledSince = NaN;
        const seekTime = Math.max(0, targetTime + (isPlaying ? state.leadSeconds : 0));
        noteVideoDriftSeek(state, now, isPlaying, seekTime);
        return { type: "seek", time: seekTime };
    }
    if (!isSteady) {
        state.samples = [];
        return canAdjustRate ? { type: "rate", rate: 1 } : { type: "none" };
    }
    if (now - state.lastSeekAt < VIDEO_DRIFT_SETTLE_MS) return { type: "none" };

    state.samples.push(drift);
    if (state.samples.length > VIDEO_DRIFT_SAMPLE_COUNT) state.samples.shift();
    if (state.samples.length < VIDEO_DRIFT_MIN_SAMPLES) return { type: "none" };
    const median = getMedianValue(state.samples);

    if (state.measureLeadAfterSeek) {
        // A seek that resumed late shows up as the video trailing (negative
        // median); land that much further ahead next time.
        state.measureLeadAfterSeek = false;
        state.leadSeconds = Math.min(VIDEO_DRIFT_MAX_LEAD_SECONDS,
            Math.max(0, state.leadSeconds - median * 0.8));
    }

    if (canAdjustRate) {
        const rateDelta = Math.abs(median) < 0.03 ? 0
            : Math.min(VIDEO_DRIFT_MAX_RATE_DELTA, Math.max(-VIDEO_DRIFT_MAX_RATE_DELTA, median * 0.5));
        return { type: "rate", rate: Math.round((1 - rateDelta) * 1000) / 1000 };
    }

    if (!allowSoftSeek || Math.abs(median) <= state.softThresholdSeconds
        || now - state.lastSeekAt < VIDEO_DRIFT_SOFT_INTERVAL_MS) {
        return { type: "none" };
    }
    state.softCorrectionTimes = state.softCorrectionTimes
        .filter((time) => now - time < VIDEO_DRIFT_BACKOFF_WINDOW_MS)
        .concat(now);
    if (state.softCorrectionTimes.length >= VIDEO_DRIFT_BACKOFF_CORRECTIONS) {
        state.softThresholdSeconds = VIDEO_DRIFT_BACKOFF_THRESHOLD_SECONDS;
    }
    const seekTime = Math.max(0, targetTime + state.leadSeconds);
    noteVideoDriftSeek(state, now, true, seekTime);
    return { type: "seek", time: seekTime };
};

export {
    VIDEO_SYNC_SEEK_THRESHOLD_SECONDS,
    VIDEO_DRIFT_SEEK_GRACE_MS,
    createVideoDriftState,
    resetVideoDriftState,
    recordVideoDriftTarget,
    noteVideoDriftSeek,
    planVideoDriftCorrection,
    wrapVideoSyncTime,
};
