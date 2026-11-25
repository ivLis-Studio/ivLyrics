export const DEFAULT_TRACK_POSITION_FPS = 60;
const PLAYBACK_EVENTS = ["onplaypause", "songchange", "onseek"];
const PAUSED_SETTLE_MS = 1200;
const PAUSED_POLL_MS = 250;

export function createLyricsFrameScheduler({
    getPlayer, getPlatformPaused, hostEvents, documentEvents, isHidden, isSettingsOpen,
    getFrameRate, now, requestFrame, cancelFrame, scheduleTimer, cancelTimer,
}) {
    let listenerPlayer = null;
    return {
        active: false,
        frameId: null,
        timerId: null,
        callbacks: new Set(),
        lastTime: 0,
        targetFPS: DEFAULT_TRACK_POSITION_FPS,
        boundAnimate: null,
        boundWake: null,
        pausedSignature: null,
        settleUntil: 0,
        idle: false,
        suspended: false,

        wake() {
            if (!this.active) return;
            this.settleUntil = now() + PAUSED_SETTLE_MS;
            this.idle = false;
            this.lastTime = 0;
            if (this.timerId !== null) {
                cancelTimer(this.timerId);
                this.timerId = null;
            }
            this.scheduleNext(false);
        },

        updateFrameInterval() {
            this.targetFPS = getFrameRate();
            this.frameInterval = 1000 / this.targetFPS;
        },

        start() {
            if (this.active) return;
            this.active = true;
            this.lastTime = 0;
            this.updateFrameInterval();
            this.boundAnimate ??= this.animate.bind(this);
            this.boundWake ??= this.wake.bind(this);

            listenerPlayer = getPlayer();
            for (const event of PLAYBACK_EVENTS) listenerPlayer?.addEventListener?.(event, this.boundWake);
            hostEvents.addEventListener("ivLyrics", this.boundWake);
            documentEvents.addEventListener("visibilitychange", this.boundWake);

            this.settleUntil = now() + PAUSED_SETTLE_MS;
            this.scheduleNext(false);
        },

        scheduleNext(settingsOpen) {
            // Subscribers can seek, or mount another subscriber, during a tick.
            // In that case wake() may have already queued the next frame.
            if (!this.active || this.frameId !== null || this.timerId !== null) return;

            const background = isHidden() || settingsOpen || this.idle;
            if (!background && requestFrame) {
                this.frameId = requestFrame(this.boundAnimate);
            } else {
                this.timerId = scheduleTimer(this.boundAnimate, background ? PAUSED_POLL_MS : this.frameInterval);
            }
        },

        stop() {
            if (this.frameId !== null) {
                cancelFrame(this.frameId);
                this.frameId = null;
            }
            if (this.timerId !== null) {
                cancelTimer(this.timerId);
                this.timerId = null;
            }
            this.active = false;
            this.lastTime = 0;
            this.pausedSignature = null;
            this.idle = false;
            this.suspended = false;
            for (const event of PLAYBACK_EVENTS) listenerPlayer?.removeEventListener?.(event, this.boundWake);
            listenerPlayer = null;
            hostEvents.removeEventListener("ivLyrics", this.boundWake);
            documentEvents.removeEventListener("visibilitychange", this.boundWake);
        },

        addCallback(callback) {
            this.callbacks.add(callback);
            this.start();
            this.wake();
        },

        removeCallback(callback) {
            this.callbacks.delete(callback);
            if (this.callbacks.size === 0) this.stop();
        },

        animate(timestamp) {
            if (!this.active) return;
            this.frameId = null;
            this.timerId = null;

            const settingsOpen = isSettingsOpen();
            this.updateFrameInterval();
            if (isHidden() || settingsOpen) {
                this.suspended = true;
                this.lastTime = 0;
                this.scheduleNext(settingsOpen);
                return;
            }

            const frameTime = Number.isFinite(timestamp) ? timestamp : now();
            if (this.suspended) {
                this.suspended = false;
                this.settleUntil = frameTime + PAUSED_SETTLE_MS;
            }
            const player = getPlayer();
            const paused = getPlatformPaused() ?? player?.data?.isPaused
                ?? (typeof player?.isPlaying === "function" ? !player.isPlaying() : false);
            if (paused) {
                // Some Spotify versions do not emit every seek while paused.
                const signature = `${player?.data?.item?.uri || ""}:${player?.getProgress?.()}`;
                if (signature !== this.pausedSignature) {
                    this.pausedSignature = signature;
                    this.settleUntil = frameTime + PAUSED_SETTLE_MS;
                }
                this.idle = frameTime >= this.settleUntil;
            } else {
                this.pausedSignature = null;
                this.idle = false;
            }
            if (this.idle) {
                this.lastTime = 0;
                this.scheduleNext(false);
                return;
            }

            const elapsed = this.lastTime > 0 ? frameTime - this.lastTime : Infinity;
            // Tolerate fractional timestamps around the configured interval.
            if (elapsed >= this.frameInterval - 1) {
                for (const callback of this.callbacks) {
                    try {
                        callback();
                    } catch {
                        // A failed view must not stop updates to other views.
                    }
                }
                this.lastTime = elapsed >= this.frameInterval && Number.isFinite(elapsed)
                    ? frameTime - (elapsed % this.frameInterval)
                    : frameTime;
            }
            this.scheduleNext(false);
        },
    };
}

export function createLyricsVisibilityManager(documentEvents, isHidden) {
    return {
        listeners: new Set(),
        isListening: false,
        boundHandler: null,

        init() {
            this.boundHandler = this.handleVisibilityChange.bind(this);
        },

        addListener(callback) {
            if (!this.boundHandler) this.init();
            this.listeners.add(callback);
            if (this.isListening) return;
            documentEvents.addEventListener("visibilitychange", this.boundHandler);
            this.isListening = true;
        },

        removeListener(callback) {
            this.listeners.delete(callback);
            if (this.listeners.size || !this.isListening) return;
            documentEvents.removeEventListener("visibilitychange", this.boundHandler);
            this.isListening = false;
        },

        handleVisibilityChange() {
            const visible = !isHidden();
            for (const callback of this.listeners) {
                try {
                    callback(visible);
                } catch {
                    // Other subscribers still need the visibility update.
                }
            }
        },
    };
}
