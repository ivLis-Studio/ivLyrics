(function initializeIvLyricsPlaybackClock(root, factory) {
    "use strict";

    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.ivLyricsPlaybackClock = api;
    }
})(typeof window !== "undefined" ? window : globalThis, function createPlaybackClockApi() {
    "use strict";

    const VERSION = 2;
    const DEFAULT_SNAP_THRESHOLD_MS = 500;
    const DEFAULT_DISCONTINUITY_THRESHOLD_MS = 1000;
    const DEFAULT_DISCONTINUITY_CONFIRMATION_MS = 120;
    const DEFAULT_SMOOTHING_TIME_CONSTANT_MS = 300;
    const DEFAULT_LOCAL_SAMPLE_INTERVAL_MS = 50;
    const DEFAULT_IDLE_SAMPLE_INTERVAL_MS = 500;

    const toFiniteNumber = (value, fallback = Number.NaN) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    };

    const toNonNegativeNumber = (value, fallback = 0) => {
        const numeric = toFiniteNumber(value, fallback);
        return Math.max(0, numeric);
    };

    const getPlayerItem = (playerData, playerState) => (
        playerState?.item || playerData?.item || playerData?.track || null
    );

    const getPlayerUri = (playerData, playerState) => {
        const stateUri = String(playerState?.item?.uri || "").trim();
        if (stateUri) return stateUri;
        return String(playerData?.item?.uri || playerData?.track?.uri || "").trim();
    };

    const getPlaybackId = (playerData, playerState) => String(
        playerState?.playbackId || playerData?.playbackId || ""
    ).trim();

    const getPlaybackIdentityKey = (uri, playbackId) => {
        if (!uri && !playbackId) return "";
        return `${uri}\u0000${playbackId}`;
    };

    const resolveStablePlayerItem = (playerData, playbackSnapshot, candidateItem = null) => {
        const publicItem = playerData?.item || playerData?.track || null;
        const publicUri = String(publicItem?.uri || "").trim();
        const snapshotUri = String(playbackSnapshot?.uri || "").trim();
        const snapshotItem = playbackSnapshot?.item || null;
        const snapshotItemUri = String(snapshotItem?.uri || "").trim();
        const stableUri = snapshotUri || publicUri;

        if (!stableUri) {
            return null;
        }
        if (snapshotItem && snapshotItemUri === stableUri && snapshotItem?.metadata) {
            return snapshotItem;
        }
        if (snapshotUri && publicUri && snapshotUri !== publicUri) {
            return null;
        }
        if (publicItem && publicUri === stableUri) {
            return publicItem;
        }
        if (candidateItem && String(candidateItem.uri || "").trim() === stableUri) {
            return candidateItem;
        }
        return null;
    };

    const getRestrictionReasons = (playerData, playerState) => {
        const restrictions = playerState?.restrictions || playerData?.restrictions || {};
        return [
            ...(Array.isArray(restrictions.disallowSeekingReasons)
                ? restrictions.disallowSeekingReasons
                : []),
            ...(Array.isArray(restrictions.disallowSkippingNextReasons)
                ? restrictions.disallowSkippingNextReasons
                : []),
            ...(Array.isArray(restrictions.disallowSkippingPrevReasons)
                ? restrictions.disallowSkippingPrevReasons
                : [])
        ].map(reason => String(reason || "").toLowerCase());
    };

    const isDjNarrationPlayback = (playerData, playerState = null) => {
        const item = getPlayerItem(playerData, playerState) || {};
        const provider = String(item.provider || "").trim().toLowerCase();
        const type = String(item.type || "").trim().toLowerCase();
        const uri = String(item.uri || "").trim().toLowerCase();
        const restrictionReasons = getRestrictionReasons(playerData, playerState);

        return (
            provider.startsWith("narration") ||
            uri.startsWith("spotify:media:") ||
            restrictionReasons.some(reason => reason.includes("narration")) ||
            (
                type === "unknown" &&
                !uri.startsWith("spotify:track:") &&
                !uri.startsWith("spotify:local:")
            )
        );
    };

    const isAutomixPlayback = (playerData, playerState = null) => {
        const itemMetadata = getPlayerItem(playerData, playerState)?.metadata || {};
        const contextMetadata = playerState?.context?.metadata || playerData?.context?.metadata || {};
        const itemProductType = String(itemMetadata.agentic_product_type || "").trim().toLowerCase();
        const contextProductType = String(contextMetadata.agentic_product_type || "").trim().toLowerCase();
        const itemAutomixMode = String(itemMetadata["audio.automix_mode"] || "").trim().toLowerCase();
        const contextAutomixMode = String(contextMetadata["automix.mode"] || "").trim().toLowerCase();
        const lexiconSetType = String(contextMetadata.lexicon_set_type || "").trim().toLowerCase();
        const mixerEnabled = String(contextMetadata.mixer_enabled || "").trim().toLowerCase();

        return (
            itemProductType === "dj" ||
            contextProductType === "dj" ||
            lexiconSetType === "your_dj" ||
            (itemAutomixMode && itemAutomixMode !== "off" && itemAutomixMode !== "none") ||
            (contextAutomixMode && contextAutomixMode !== "off" && contextAutomixMode !== "none") ||
            mixerEnabled === "true"
        );
    };

    const createPlaybackClock = (options = {}) => {
        const now = typeof options.now === "function"
            ? options.now
            : () => (typeof performance !== "undefined" ? performance.now() : Date.now());
        const wallNow = typeof options.wallNow === "function" ? options.wallNow : Date.now;
        const schedule = typeof options.schedule === "function" ? options.schedule : setTimeout;
        const cancel = typeof options.cancel === "function" ? options.cancel : clearTimeout;
        const snapThresholdMs = toNonNegativeNumber(
            options.snapThresholdMs,
            DEFAULT_SNAP_THRESHOLD_MS
        );
        const discontinuityThresholdMs = toNonNegativeNumber(
            options.discontinuityThresholdMs,
            DEFAULT_DISCONTINUITY_THRESHOLD_MS
        );
        const discontinuityConfirmationMs = toNonNegativeNumber(
            options.discontinuityConfirmationMs,
            DEFAULT_DISCONTINUITY_CONFIRMATION_MS
        );
        const smoothingTimeConstantMs = Math.max(1, toNonNegativeNumber(
            options.smoothingTimeConstantMs,
            DEFAULT_SMOOTHING_TIME_CONSTANT_MS
        ));
        const localSampleIntervalMs = Math.max(16, toNonNegativeNumber(
            options.localSampleIntervalMs,
            DEFAULT_LOCAL_SAMPLE_INTERVAL_MS
        ));
        const idleSampleIntervalMs = Math.max(100, toNonNegativeNumber(
            options.idleSampleIntervalMs,
            DEFAULT_IDLE_SAMPLE_INTERVAL_MS
        ));

        let destroyed = false;
        let started = false;
        let pollTimer = null;
        let pollPending = false;
        let currentIdentityKey = "";
        let localAnchor = null;
        let lastStateReading = null;
        let pendingStateDiscontinuity = null;
        let predictedProgress = null;
        let lastSnapshot = null;
        let forceSnap = false;
        let sampleGeneration = 0;

        const readContext = () => {
            const playerData = options.getPlayerData?.() || null;
            const playerState = options.getPlayerState?.() || null;
            const uri = getPlayerUri(playerData, playerState);
            const playbackId = getPlaybackId(playerData, playerState);
            const identityKey = getPlaybackIdentityKey(uri, playbackId);
            const pausedFromState = playerState?.isPaused;
            const pausedFromData = playerData?.isPaused;
            const isPlaying = typeof pausedFromState === "boolean"
                ? !pausedFromState
                : (typeof pausedFromData === "boolean"
                    ? !pausedFromData
                    : !!options.isPlaying?.());
            const duration = toNonNegativeNumber(
                playerState?.duration ??
                playerState?.item?.duration?.milliseconds ??
                playerData?.item?.duration?.milliseconds ??
                options.getDuration?.(),
                0
            );

            return {
                playerData,
                playerState,
                uri,
                playbackId,
                identityKey,
                isPlaying,
                duration,
                isLocal: !!options.isLocalPlayback?.(),
                automix: isAutomixPlayback(playerData, playerState),
                djNarration: isDjNarrationPlayback(playerData, playerState)
            };
        };

        const clampToDuration = (position, duration) => {
            let clamped = toNonNegativeNumber(position, 0);
            if (duration > 0) {
                clamped = Math.min(clamped, duration);
            }
            return clamped;
        };

        const getStateProgress = (context, currentWallTime) => {
            const state = context.playerState;
            const basePosition = toFiniteNumber(state?.positionAsOfTimestamp);
            if (!Number.isFinite(basePosition)) return Number.NaN;

            const timestamp = toFiniteNumber(state?.timestamp);
            if (context.isPlaying && (!Number.isFinite(timestamp) || timestamp <= 0)) {
                return Number.NaN;
            }
            const speed = Math.max(0, toFiniteNumber(state?.speed, 1));
            const elapsed = context.isPlaying && Number.isFinite(timestamp) && timestamp > 0
                ? Math.max(0, currentWallTime - timestamp) * speed
                : 0;
            return clampToDuration(basePosition + elapsed, context.duration);
        };

        const getPublicProgress = (context) => {
            const progress = toFiniteNumber(options.getPublicProgress?.());
            return Number.isFinite(progress)
                ? clampToDuration(progress, context.duration)
                : Number.NaN;
        };

        const resetIdentityState = (identityKey) => {
            currentIdentityKey = identityKey;
            if (localAnchor?.identityKey !== identityKey) {
                localAnchor = null;
            }
            lastStateReading = null;
            pendingStateDiscontinuity = null;
            predictedProgress = null;
            forceSnap = true;
        };

        const observeStateProgress = (context, position, sampledAt, publicProgress) => {
            if (!Number.isFinite(position)) {
                pendingStateDiscontinuity = null;
                return { position, guarded: false };
            }

            if (
                !lastStateReading ||
                lastStateReading.identityKey !== context.identityKey
            ) {
                lastStateReading = {
                    identityKey: context.identityKey,
                    position,
                    sampledAt,
                    isPlaying: context.isPlaying
                };
                pendingStateDiscontinuity = null;
                return { position, guarded: false };
            }

            const elapsed = Math.max(0, sampledAt - lastStateReading.sampledAt);
            const expected = lastStateReading.position + (
                lastStateReading.isPlaying && context.isPlaying ? elapsed : 0
            );
            const drift = position - expected;
            if (Math.abs(drift) < discontinuityThresholdMs) {
                lastStateReading = {
                    identityKey: context.identityKey,
                    position,
                    sampledAt,
                    isPlaying: context.isPlaying
                };
                pendingStateDiscontinuity = null;
                return { position, guarded: false };
            }

            const direction = Math.sign(drift);
            const pendingElapsed = pendingStateDiscontinuity?.identityKey === context.identityKey
                ? Math.max(0, sampledAt - pendingStateDiscontinuity.detectedAt)
                : 0;
            const pendingExpected = pendingStateDiscontinuity?.identityKey === context.identityKey
                ? pendingStateDiscontinuity.position + (
                    pendingStateDiscontinuity.isPlaying && context.isPlaying
                        ? Math.max(0, sampledAt - pendingStateDiscontinuity.sampledAt)
                        : 0
                )
                : Number.NaN;
            const matchesPending = (
                pendingStateDiscontinuity?.identityKey === context.identityKey &&
                pendingStateDiscontinuity.direction === direction &&
                Number.isFinite(pendingExpected) &&
                Math.abs(position - pendingExpected) < discontinuityThresholdMs
            );
            const publicCorroborates = Number.isFinite(publicProgress) &&
                Math.abs(publicProgress - position) < snapThresholdMs;
            const discontinuityConfirmed = forceSnap || publicCorroborates || (
                matchesPending && pendingElapsed >= discontinuityConfirmationMs
            );

            if (discontinuityConfirmed) {
                localAnchor = null;
                predictedProgress = null;
                forceSnap = true;
                lastStateReading = {
                    identityKey: context.identityKey,
                    position,
                    sampledAt,
                    isPlaying: context.isPlaying
                };
                pendingStateDiscontinuity = null;
                return { position, guarded: false };
            }

            pendingStateDiscontinuity = {
                identityKey: context.identityKey,
                position,
                sampledAt,
                detectedAt: matchesPending
                    ? pendingStateDiscontinuity.detectedAt
                    : sampledAt,
                direction,
                isPlaying: context.isPlaying
            };
            return { position: clampToDuration(expected, context.duration), guarded: true };
        };

        const getLocalAnchorProgress = (context, sampledAt) => {
            if (!localAnchor || localAnchor.identityKey !== context.identityKey) {
                return Number.NaN;
            }
            const elapsed = context.isPlaying
                ? Math.max(0, sampledAt - localAnchor.sampledAt)
                : 0;
            return clampToDuration(localAnchor.position + elapsed, context.duration);
        };

        const normalizeProgress = (context, measured, sampledAt) => {
            const safeMeasured = clampToDuration(measured, context.duration);
            if (
                forceSnap ||
                !predictedProgress ||
                predictedProgress.identityKey !== context.identityKey ||
                !context.isPlaying
            ) {
                forceSnap = false;
                predictedProgress = {
                    identityKey: context.identityKey,
                    position: safeMeasured,
                    sampledAt,
                    isPlaying: context.isPlaying
                };
                return safeMeasured;
            }

            const elapsed = Math.max(0, sampledAt - predictedProgress.sampledAt);
            let predicted = predictedProgress.position + (
                predictedProgress.isPlaying ? elapsed : 0
            );
            const error = safeMeasured - predicted;

            if (Math.abs(error) >= snapThresholdMs) {
                predicted = safeMeasured;
            } else {
                const alpha = 1 - Math.exp(-elapsed / smoothingTimeConstantMs);
                predicted += error * alpha;
            }

            predicted = clampToDuration(predicted, context.duration);
            predictedProgress = {
                identityKey: context.identityKey,
                position: predicted,
                sampledAt,
                isPlaying: context.isPlaying
            };
            return predicted;
        };

        const getSnapshot = () => {
            if (!started && options.autoStart !== false) {
                start();
            }

            const sampledAt = now();
            const currentWallTime = wallNow();
            const context = readContext();
            if (context.identityKey !== currentIdentityKey) {
                resetIdentityState(context.identityKey);
            }

            const stateProgress = getStateProgress(context, currentWallTime);
            const publicProgress = getPublicProgress(context);
            const stateObservation = observeStateProgress(
                context,
                stateProgress,
                sampledAt,
                publicProgress
            );
            const localProgress = context.isLocal
                ? getLocalAnchorProgress(context, sampledAt)
                : Number.NaN;

            let measured = localProgress;
            let source = "local-position-state";
            if (!Number.isFinite(measured)) {
                measured = stateObservation.position;
                source = stateObservation.guarded
                    ? "guarded-player-state"
                    : "player-state";
            }
            if (!Number.isFinite(measured)) {
                measured = publicProgress;
                source = "public-progress";
            }
            if (!Number.isFinite(measured)) {
                measured = 0;
                source = "unavailable";
            }

            const position = normalizeProgress(context, measured, sampledAt);
            lastSnapshot = {
                version: VERSION,
                uri: context.uri || null,
                playbackId: context.playbackId || null,
                identityKey: context.identityKey,
                item: context.playerState?.item || null,
                position,
                duration: context.duration,
                isPlaying: context.isPlaying,
                isLocal: context.isLocal,
                automix: context.automix,
                djNarration: context.djNarration,
                source,
                sampledAt
            };
            return { ...lastSnapshot };
        };

        const scheduleNextPoll = (delay) => {
            if (destroyed || options.autoStart === false) return;
            if (pollTimer !== null) cancel(pollTimer);
            pollTimer = schedule(() => {
                pollTimer = null;
                pollLocalPosition();
            }, delay);
        };

        const pollLocalPosition = async () => {
            if (destroyed || pollPending) return;

            const before = readContext();
            if (!before.isLocal || typeof options.getLocalPositionState !== "function") {
                scheduleNextPoll(idleSampleIntervalMs);
                return;
            }

            pollPending = true;
            const requestGeneration = sampleGeneration;
            const requestStartedAt = now();
            try {
                const result = await options.getLocalPositionState();
                const resolvedAt = now();
                const after = readContext();
                if (
                    before.identityKey &&
                    before.identityKey === after.identityKey &&
                    requestGeneration === sampleGeneration
                ) {
                    const position = toFiniteNumber(result?.position ?? result);
                    if (Number.isFinite(position)) {
                        const sampledAt = requestStartedAt + (resolvedAt - requestStartedAt) / 2;
                        const sampledPosition = clampToDuration(position, after.duration);
                        const shouldReplaceAnchor = (
                            !localAnchor ||
                            localAnchor.identityKey !== after.identityKey ||
                            localAnchor.position !== sampledPosition ||
                            !after.isPlaying
                        );
                        if (shouldReplaceAnchor) {
                            localAnchor = {
                                identityKey: after.identityKey,
                                position: sampledPosition,
                                sampledAt
                            };
                        }
                    }
                }
            } catch (error) {
                options.onError?.(error);
            } finally {
                pollPending = false;
                const context = readContext();
                scheduleNextPoll(context.isLocal && context.isPlaying
                    ? localSampleIntervalMs
                    : idleSampleIntervalMs);
            }
        };

        function start() {
            if (started || destroyed) return;
            started = true;
            if (options.autoStart !== false) {
                pollLocalPosition();
            }
        }

        const invalidate = () => {
            sampleGeneration += 1;
            localAnchor = null;
            lastStateReading = null;
            pendingStateDiscontinuity = null;
            predictedProgress = null;
            forceSnap = true;
            if (started) scheduleNextPoll(0);
        };

        const handleSongChange = () => {
            invalidate();
        };

        const destroy = () => {
            destroyed = true;
            if (pollTimer !== null) {
                cancel(pollTimer);
                pollTimer = null;
            }
            localAnchor = null;
            lastStateReading = null;
            pendingStateDiscontinuity = null;
            predictedProgress = null;
            lastSnapshot = null;
        };

        return {
            version: VERSION,
            start,
            destroy,
            invalidate,
            handleSongChange,
            getProgress() {
                return getSnapshot().position;
            },
            getSnapshot,
            getLastSnapshot() {
                return lastSnapshot ? { ...lastSnapshot } : null;
            }
        };
    };

    const createSpotifyPlaybackClock = (spicetify, options = {}) => {
        const playerApi = () => spicetify?.Platform?.PlayerAPI;
        const clock = createPlaybackClock({
            ...options,
            getPlayerData: () => spicetify?.Player?.data || null,
            getPlayerState: () => playerApi()?._state || null,
            getPublicProgress: () => spicetify?.Player?.getProgress?.(),
            getDuration: () => spicetify?.Player?.getDuration?.(),
            isPlaying: () => spicetify?.Player?.isPlaying?.() === true,
            isLocalPlayback: () => (
                spicetify?.Platform?.PlaybackAPI?._isLocal === true &&
                typeof playerApi()?._contextPlayer?.getPositionState === "function"
            ),
            getLocalPositionState: () => playerApi()?._contextPlayer?.getPositionState?.({}),
            onError: options.onError || (() => {})
        });
        const wake = () => clock.invalidate();
        const player = spicetify?.Player;
        for (const event of ["onplaypause", "onseek"]) {
            player?.addEventListener?.(event, wake);
        }
        const destroy = clock.destroy;
        clock.destroy = () => {
            for (const event of ["onplaypause", "onseek"]) {
                player?.removeEventListener?.(event, wake);
            }
            destroy();
        };
        return clock;
    };

    return {
        VERSION,
        createPlaybackClock,
        createSpotifyPlaybackClock,
        getPlaybackIdentityKey,
        getPlayerUri,
        resolveStablePlayerItem,
        isAutomixPlayback,
        isDjNarrationPlayback
    };
});
