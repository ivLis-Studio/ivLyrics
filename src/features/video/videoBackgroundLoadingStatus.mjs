import { LYRICS_GENERATION_LOADING_DELAY_MS } from "../../lyrics/lyricsGenerationStatusController.mjs";

export function createVideoBackgroundLoadingStatus({
  isMounted, readTrackUri, readPhase, statusPills, scheduleTimer, cancelTimer,
}) {
  let loadingTimer = null;
  let pendingStatus = null;
  let trackedUri = "";

  function dispose() {
    if (loadingTimer !== null) cancelTimer(loadingTimer);
    loadingTimer = null;
    pendingStatus = null;
  }

  function handle(status) {
    if (!isMounted()) return;

    const normalizedStatus = typeof status === "boolean"
      ? { phase: status ? "loading" : "idle" }
      : (status || { phase: "idle" });
    const statusTrackUri = normalizedStatus.trackUri || "";
    const currentTrackUri = readTrackUri();
    const isTrackedVideoCleanup = normalizedStatus.phase === "idle" &&
      !!statusTrackUri &&
      statusTrackUri === trackedUri;
    if (
      statusTrackUri &&
      currentTrackUri &&
      statusTrackUri !== currentTrackUri &&
      !isTrackedVideoCleanup
    ) {
      return;
    }

    if (isTrackedVideoCleanup && statusTrackUri !== currentTrackUri) {
      dispose();
      trackedUri = "";
      statusPills.hide("video-background");
      return;
    }

    const effectiveTrackUri = statusTrackUri || currentTrackUri;

    if (normalizedStatus.phase === "loading") {
      const isNewTrack = !!effectiveTrackUri &&
        !!trackedUri &&
        effectiveTrackUri !== trackedUri;
      if (isNewTrack) {
        dispose();
        statusPills.hide("video-background");
      }
      trackedUri = effectiveTrackUri;
      pendingStatus = {
        ...normalizedStatus,
        trackUri: effectiveTrackUri,
      };

      const currentPhase = readPhase();
      if (
        statusPills.isVisible("video-background") &&
        currentPhase === "loading"
      ) {
        statusPills.show("video-background", {
          label: normalizedStatus.label,
          description: normalizedStatus.description,
        });
        return;
      }

      if (statusPills.isVisible("video-background")) {
        statusPills.hide("video-background");
      }
      if (loadingTimer === null) {
        const timer = scheduleTimer(() => {
          if (loadingTimer !== timer) return;
          loadingTimer = null;
          if (!pendingStatus || !isMounted()) return;

          const latestTrackUri = readTrackUri();
          if (
            pendingStatus.trackUri &&
            latestTrackUri &&
            pendingStatus.trackUri !== latestTrackUri
          ) {
            pendingStatus = null;
            return;
          }

          statusPills.show("video-background", {
            label: pendingStatus.label,
            description: pendingStatus.description,
          });
        }, LYRICS_GENERATION_LOADING_DELAY_MS);
        loadingTimer = timer;
      }
      return;
    }

    dispose();
    if (normalizedStatus.phase === "complete") {
      if (statusPills.isVisible("video-background")) {
        statusPills.settle("video-background", "complete");
      } else {
        statusPills.hide("video-background");
      }
      return;
    }

    trackedUri = effectiveTrackUri;
    statusPills.hide("video-background");
  }

  return { handle, dispose };
}
