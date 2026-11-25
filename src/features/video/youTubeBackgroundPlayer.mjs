import { disableYouTubeCaptions } from "./youTubeBackgroundTimeline.mjs";
import { watchYouTubeIframeApi } from "./youTubeIframeApi.mjs";
import { watchVideoReadinessDeadline } from "./videoReadinessDeadline.mjs";

export function startYouTubeBackgroundPlayer({
    host, document, videoId, containerRef, playerRef, youtubeHoldStateRef,
    setIsPlayerReady, reportVideoBackgroundStatus, showError, settleYouTubeHoldPrime,
    isCurrent = () => true, schedule = setTimeout, cancel = clearTimeout,
}) {
    let isCancelled = false;
    let didReportReady = false;
    let playerLifecycleFailed = false;
    let stopWaitingForApi;
    let ownedPlayer = null;
    const isActive = () => !isCancelled && !playerLifecycleFailed && isCurrent();
    const captionDisableTimers = [];
    const clearTimers = () => {
        stopWaitingForApi?.();
        stopWaitingForApi = null;
        stopReadinessDeadline();
        captionDisableTimers.splice(0).forEach(cancel);
    };
    const releasePlayer = () => {
        const player = ownedPlayer;
        ownedPlayer = null;
        if (!player || playerRef.current !== player) return;
        playerRef.current = null;
        try { player.destroy(); } catch {}
    };
    const scheduleCaptionDisable = (player) => {
        disableYouTubeCaptions(player);
        [250, 1000, 2500].forEach((delay) => {
            const timer = schedule(() => {
                if (isActive() && ownedPlayer === player && playerRef.current === player) disableYouTubeCaptions(player);
            }, delay);
            captionDisableTimers.push(timer);
        });
    };
    const failPlayerLifecycle = (error) => {
        if (!isActive() || (ownedPlayer && playerRef.current !== ownedPlayer)) return;
        playerLifecycleFailed = true;
        clearTimers();
        releasePlayer();
        if (error) {
            console.error("[VideoBackground] YouTube player failed:", error);
        }
        setIsPlayerReady(false);
        youtubeHoldStateRef.current.isHolding = false;
        youtubeHoldStateRef.current.primePending = false;
        showError();
    };
    const markPlayerReady = (player) => {
        if (!isActive() || !player
            || (ownedPlayer && (ownedPlayer !== player || playerRef.current !== player))) return false;
        ownedPlayer = player;
        playerRef.current = player;
        if (!didReportReady) {
            didReportReady = true;
            stopReadinessDeadline();
            setIsPlayerReady(true);
            reportVideoBackgroundStatus("complete");
            scheduleCaptionDisable(player);
        }
        return true;
    };

    const stopReadinessDeadline = watchVideoReadinessDeadline({
        document, schedule, cancel,
        onTimeout: () => failPlayerLifecycle(new Error("YouTube player readiness timed out.")),
    });

    // Double check cleanup
    if (playerRef.current) {
        try {
            playerRef.current.destroy();
        } catch (e) { }
        playerRef.current = null;
    }

    const initPlayer = (api) => {
        if (!isActive() || !containerRef.current) return;

        // The iframe API replaces its mount node. Keep React's container as the parent.
        const playerDiv = document.createElement('div');
        containerRef.current.innerHTML = ''; // Clear container
        containerRef.current.appendChild(playerDiv);

        try {
            const newPlayer = new api.Player(playerDiv, {
                height: "100%",
                width: "100%",
                videoId: videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    disablekb: 1,
                    fs: 0,
                    rel: 0,
                    iv_load_policy: 3,
                    cc_load_policy: 0,
                    mute: 1,
                    origin: host.location.origin,
                },
                events: {
                    onReady: (event) => {
                        if (!markPlayerReady(event?.target)) return;
                        event.target.mute();
                        event.target.playVideo();
                    },
                    onError: (event) => {
                        failPlayerLifecycle(new Error(`YouTube player error: ${event?.data ?? "unknown"}`));
                    },
                    onStateChange: (event) => {
                        if (!isActive() || (ownedPlayer && ownedPlayer !== event?.target)) return;
                        const state = event?.data;
                        settleYouTubeHoldPrime({
                            player: event?.target,
                            playerState: state,
                            holdState: youtubeHoldStateRef.current,
                        });
                        if ([1, 2, 3, 5].includes(state) && !didReportReady) {
                            markPlayerReady(event?.target);
                        }
                        if (state === api.PlayerState?.PLAYING || state === api.PlayerState?.CUED) {
                            disableYouTubeCaptions(event.target);
                        }
                    },
                },
            });
            // YT.Player returns the instance before onReady.
            if (!isActive()) {
                try { newPlayer.destroy(); } catch {}
            } else {
                ownedPlayer = newPlayer;
                playerRef.current = newPlayer;
            }
        } catch (error) {
            failPlayerLifecycle(error);
        }
    };

    stopWaitingForApi = watchYouTubeIframeApi({
        host, document, onReady: initPlayer, onError: failPlayerLifecycle, schedule, cancel,
    });

    return () => {
        if (isCancelled) return;
        isCancelled = true;
        clearTimers();
        const ownsHold = !playerRef.current || playerRef.current === ownedPlayer;
        releasePlayer();
        if (ownsHold) {
            youtubeHoldStateRef.current.isHolding = false;
            youtubeHoldStateRef.current.primePending = false;
        }
    };
}
