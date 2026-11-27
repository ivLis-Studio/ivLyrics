const VERSION = 2;
const DEFAULT_SNAP_THRESHOLD_MS = 500;
const DEFAULT_DISCONTINUITY_THRESHOLD_MS = 1000;
const DEFAULT_DISCONTINUITY_CONFIRMATION_MS = 120;
const DEFAULT_SMOOTHING_TIME_CONSTANT_MS = 300;
// While playing, a correction may speed the shown position up or slow it
// down by at most this share of the elapsed time. Unbounded, a reading a
// few hundred milliseconds behind (Spotify re-anchors its state now and
// then) froze or even rewound the karaoke fill for a moment, and one
// ahead made it race to catch up: the fill stalled and then jumped.
const DEFAULT_MAX_CORRECTION_RATE = 0.3;
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

const SEEK_AND_SKIP_RESTRICTIONS = [
    "disallowSeekingReasons",
    "disallowSkippingNextReasons",
    "disallowSkippingPrevReasons"
];
const isNarrationReason = reason => String(reason || "").toLowerCase().includes("narration");
const normalizePlaybackFlag = value => value ? String(value).trim().toLowerCase() : "";

const hasNarrationRestriction = (restrictions) => {
    if (!restrictions) return false;
    for (const key of SEEK_AND_SKIP_RESTRICTIONS) {
        const reasons = restrictions[key];
        if (Array.isArray(reasons) && reasons.some(isNarrationReason)) return true;
    }
    return false;
};

const isDjNarrationPlayback = (playerData, playerState = null) => {
    const item = getPlayerItem(playerData, playerState);
    const provider = normalizePlaybackFlag(item?.provider);
    const type = normalizePlaybackFlag(item?.type);
    const uri = normalizePlaybackFlag(item?.uri);

    return (
        provider.startsWith("narration") ||
        uri.startsWith("spotify:media:") ||
        hasNarrationRestriction(playerState?.restrictions || playerData?.restrictions) ||
        (
            type === "unknown" &&
            !uri.startsWith("spotify:track:") &&
            !uri.startsWith("spotify:local:")
        )
    );
};

const isAutomixPlayback = (playerData, playerState = null) => {
    const itemMetadata = getPlayerItem(playerData, playerState)?.metadata;
    const contextMetadata = playerState?.context?.metadata || playerData?.context?.metadata;
    const itemProductType = normalizePlaybackFlag(itemMetadata?.agentic_product_type);
    const contextProductType = normalizePlaybackFlag(contextMetadata?.agentic_product_type);
    const itemAutomixMode = normalizePlaybackFlag(itemMetadata?.["audio.automix_mode"]);
    const contextAutomixMode = normalizePlaybackFlag(contextMetadata?.["automix.mode"]);
    const lexiconSetType = normalizePlaybackFlag(contextMetadata?.lexicon_set_type);
    const mixerEnabled = normalizePlaybackFlag(contextMetadata?.mixer_enabled);

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
    const maxCorrectionRate = Math.min(0.9, toNonNegativeNumber(
        options.maxCorrectionRate,
        DEFAULT_MAX_CORRECTION_RATE
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
    let playbackIdentity = { uri: "", playbackId: "", key: "" };
    let localAnchor = null;
    let lastStateReading = null;
    let pendingStateDiscontinuity = null;
    let lastSnapshot = null;
    let forceSnap = false;
    let sampleGeneration = 0;

    const readContext = () => {
        const playerData = options.getPlayerData?.() || null;
        const playerState = options.getPlayerState?.() || null;
        const uri = getPlayerUri(playerData, playerState);
        const playbackId = getPlaybackId(playerData, playerState);
        if (uri !== playbackIdentity.uri || playbackId !== playbackIdentity.playbackId) {
            playbackIdentity = { uri, playbackId, key: getPlaybackIdentityKey(uri, playbackId) };
        }
        const identityKey = playbackIdentity.key;
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
        forceSnap = true;
    };

    const acceptStateReading = (context, position, sampledAt) => {
        lastStateReading ??= {};
        lastStateReading.identityKey = context.identityKey;
        lastStateReading.position = position;
        lastStateReading.sampledAt = sampledAt;
        lastStateReading.isPlaying = context.isPlaying;
        pendingStateDiscontinuity = null;
        return position;
    };

    const observeStateProgress = (context, position, sampledAt) => {
        if (!Number.isFinite(position)) {
            pendingStateDiscontinuity = null;
            return position;
        }

        if (lastStateReading?.identityKey !== context.identityKey) {
            return acceptStateReading(context, position, sampledAt);
        }

        const elapsed = Math.max(0, sampledAt - lastStateReading.sampledAt);
        const expected = lastStateReading.position + (
            lastStateReading.isPlaying && context.isPlaying ? elapsed : 0
        );
        const drift = position - expected;
        if (Math.abs(drift) < discontinuityThresholdMs) {
            return acceptStateReading(context, position, sampledAt);
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
        let discontinuityConfirmed = forceSnap || (
            matchesPending && pendingElapsed >= discontinuityConfirmationMs
        );
        if (!discontinuityConfirmed) {
            const publicProgress = getPublicProgress(context);
            discontinuityConfirmed = Number.isFinite(publicProgress) &&
                Math.abs(publicProgress - position) < snapThresholdMs;
        }

        if (discontinuityConfirmed) {
            localAnchor = null;
            forceSnap = true;
            return acceptStateReading(context, position, sampledAt);
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
        return clampToDuration(expected, context.duration);
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
        if (forceSnap || lastSnapshot?.identityKey !== context.identityKey || !context.isPlaying) {
            forceSnap = false;
            return safeMeasured;
        }

        const elapsed = Math.max(0, sampledAt - lastSnapshot.sampledAt);
        let predicted = lastSnapshot.position + (lastSnapshot.isPlaying ? elapsed : 0);
        const error = safeMeasured - predicted;

        if (Math.abs(error) >= snapThresholdMs) {
            predicted = safeMeasured;
        } else {
            const alpha = 1 - Math.exp(-elapsed / smoothingTimeConstantMs);
            const correction = error * alpha;
            // Playing, the position keeps moving forward at a steady pace
            // while it converges; it never stops or runs backwards.
            const limit = lastSnapshot.isPlaying ? elapsed * maxCorrectionRate : Infinity;
            predicted += Math.max(-limit, Math.min(limit, correction));
        }

        return clampToDuration(predicted, context.duration);
    };

    const updateSnapshot = () => {
        if (!started && options.autoStart !== false) {
            start();
        }

        const sampledAt = now();
        const currentWallTime = wallNow();
        const context = readContext();
        const automix = isAutomixPlayback(context.playerData, context.playerState);
        const djNarration = isDjNarrationPlayback(context.playerData, context.playerState);
        if (context.identityKey !== currentIdentityKey) {
            resetIdentityState(context.identityKey);
        }

        const stateProgress = getStateProgress(context, currentWallTime);
        const observedProgress = observeStateProgress(context, stateProgress, sampledAt);
        const localProgress = context.isLocal
            ? getLocalAnchorProgress(context, sampledAt)
            : Number.NaN;

        let measured = localProgress;
        let source = "local-position-state";
        if (!Number.isFinite(measured)) {
            measured = observedProgress;
            source = pendingStateDiscontinuity
                ? "guarded-player-state"
                : "player-state";
        }
        if (!Number.isFinite(measured)) {
            measured = getPublicProgress(context);
            source = "public-progress";
        }
        if (!Number.isFinite(measured)) {
            measured = 0;
            source = "unavailable";
        }

        const position = normalizeProgress(context, measured, sampledAt);
        const item = context.playerState?.item || null;
        // The last published position is also the next prediction's anchor.
        // Snapshot callers receive copies, so the internal record can be reused.
        lastSnapshot ??= { version: VERSION };
        lastSnapshot.uri = context.uri || null;
        lastSnapshot.playbackId = context.playbackId || null;
        lastSnapshot.identityKey = context.identityKey;
        lastSnapshot.item = item;
        lastSnapshot.position = position;
        lastSnapshot.duration = context.duration;
        lastSnapshot.isPlaying = context.isPlaying;
        lastSnapshot.isLocal = context.isLocal;
        lastSnapshot.automix = automix;
        lastSnapshot.djNarration = djNarration;
        lastSnapshot.source = source;
        lastSnapshot.sampledAt = sampledAt;
        return lastSnapshot;
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
        lastSnapshot = null;
    };

    return {
        version: VERSION,
        start,
        destroy,
        invalidate,
        handleSongChange,
        getProgress() {
            return updateSnapshot().position;
        },
        getSnapshot() {
            return { ...updateSnapshot() };
        },
        getLastSnapshot() {
            return lastSnapshot ? { ...lastSnapshot } : null;
        }
    };
};

const createSpotifyPlaybackClock = (spicetify, options = {}) => {
    const playerApi = () => spicetify?.Platform?.PlayerAPI;
    const readPlayerValue = (method) => {
        try {
            return spicetify?.Player?.[method]?.();
        } catch {
            // Spicetify can expose these methods before its PlayerAPI is ready.
            return undefined;
        }
    };
    const clock = createPlaybackClock({
        ...options,
        getPlayerData: () => spicetify?.Player?.data || null,
        getPlayerState: () => playerApi()?._state || null,
        getPublicProgress: () => readPlayerValue("getProgress"),
        getDuration: () => readPlayerValue("getDuration"),
        isPlaying: () => readPlayerValue("isPlaying") === true,
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

export {
    createPlaybackClock,
    createSpotifyPlaybackClock,
    resolveStablePlayerItem,
};

// The startup bundle keeps this API available to installed add-ons.
export default function publishPlaybackClockCompatibility() {
    globalThis.ivLyricsPlaybackClock = {
        VERSION,
        createPlaybackClock,
        createSpotifyPlaybackClock,
        getPlaybackIdentityKey,
        getPlayerUri,
        resolveStablePlayerItem,
        isAutomixPlayback,
        isDjNarrationPlayback,
    };
}
