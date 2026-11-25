const TRACK_RESOLUTION_WINDOW_MS = 4000;
const TRACK_RESOLUTION_INTERVAL_MS = 100;

export function createPlaybackTrackResolver({
    getPlaybackPosition, isMounted, getCurrentUri, isNarrationActive, beginTransition,
    commitTrack, commitNarration, recoverTrack, releaseUnresolved, now, scheduleTimer, cancelTimer,
}) {
    let pending = null;

    function cancel() {
        const previous = pending;
        pending = null;
        if (previous?.timer != null) cancelTimer(previous.timer);
    }

    function schedule(candidate = null, delay = 0) {
        cancel();
        const attempt = { deadline: now() + delay + TRACK_RESOLUTION_WINDOW_MS, timer: null };
        pending = attempt;
        let transitioning = false;
        let initialResolution = true;
        let recoveredUri = null;

        function resolve() {
            if (pending !== attempt) return;
            attempt.timer = null;
            if (!isMounted()) {
                cancel();
                return;
            }

            const playback = getPlaybackPosition();
            const snapshot = playback?.getPlayerPlaybackSnapshot?.() || null;
            const stableTrack = playback?.resolveStablePlaybackTrack?.(candidate, snapshot) || null;
            if (pending !== attempt) return;
            const currentUri = getCurrentUri();
            const isNarration = snapshot?.djNarration === true && !!snapshot.uri;

            if (!isNarration && stableTrack?.uri && isNarrationActive()) {
                cancel();
                commitTrack(stableTrack, snapshot);
                return;
            }

            if (isNarration) {
                if (!isNarrationActive() || currentUri !== snapshot.uri) commitNarration(stableTrack, snapshot);
                transitioning = true;
                recoveredUri = null;
                if (pending !== attempt) return;
            } else {
                if (initialResolution) {
                    transitioning = beginTransition(candidate);
                    if (pending !== attempt) return;
                }
                if ((!transitioning || recoveredUri) && snapshot?.uri && snapshot.uri !== currentUri) {
                    transitioning = beginTransition({ uri: snapshot.uri });
                    recoveredUri = null;
                    if (pending !== attempt) return;
                }
                if (stableTrack?.uri && stableTrack.uri !== currentUri) {
                    cancel();
                    commitTrack(stableTrack, snapshot);
                    return;
                }
                if (stableTrack && transitioning && recoveredUri !== stableTrack.uri) {
                    // An event can arrive before the Spotify item changes.
                    recoveredUri = stableTrack.uri;
                    recoverTrack(stableTrack);
                    if (pending !== attempt) return;
                }
            }
            initialResolution = false;
            if (now() >= attempt.deadline) {
                cancel();
                if (!isNarration && transitioning && !stableTrack) releaseUnresolved();
                return;
            }
            attempt.timer = scheduleTimer(resolve, TRACK_RESOLUTION_INTERVAL_MS);
        }

        if (delay > 0) attempt.timer = scheduleTimer(resolve, delay);
        else resolve();
    }

    return { schedule, cancel };
}
