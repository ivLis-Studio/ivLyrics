import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { normalizeProgressTiming as normalizeOverlayProgressTiming } from "./OverlayProtocol.js";

// Overlays that run their own clock for every kind of lyrics (protocol 3)
// need progress only when the playback state changes, the position jumps,
// or a heartbeat is due. Protocol 2 overlays (1.3.0 and 1.3.1) run it only
// for word-timed lyrics: line-timed ones moved only when progress arrived,
// late and skipping lines, so they keep every 250 ms anchor while playing,
// as do older overlays and the helper.
const PROGRESS_DRIFT_TOLERANCE_MS = 250;
const PROGRESS_HEARTBEAT_MS = { playing: 2000, paused: 10000 };
const LEGACY_PAUSED_HEARTBEAT_MS = 2000;

export function createOverlayProgress({ host, playback, getSpicetify, getOverlayProgressIsPlaying, resolveSpotifyImageUrl }) {
    const cleanupWorker = (worker) => {
        if (!worker) return;
        try {
            worker.postMessage('stop');
        } catch (e) { }
        try {
            worker.terminate();
        } catch (e) { }
    };

    return {
        syncProgressConnection() {
            // An in-flight probe may resolve after destroy. Only the installed
            // runtime may create another worker or reconnect timer.
            if (!this._runtimeListenerSetup) {
                this.stopProgressSync();
                return;
            }
            if (this.isConnected && this.enabled) {
                if (this._connectionCheckTimer) clearTimeout(this._connectionCheckTimer);
                this._connectionCheckTimer = null;
                this.startProgressSync();
            } else {
                this.clearConnectionRecovery();
                this.stopProgressSync();
                if (this.enabled) this.scheduleConnectionCheck(this.getProbeDelay());
            }
        },

        getSourceFields(trackUri) {
            return this.SOURCE_ID ? { source: this.SOURCE_ID, trackUri: trackUri || null } : {};
        },

        // How often unchanged progress repeats; 0 sends every 250 ms tick.
        getProgressHeartbeat(isPlaying) {
            if (this.CONTINUOUS_PROGRESS || this._receiverProtocol < 2) {
                return isPlaying ? 0 : LEGACY_PAUSED_HEARTBEAT_MS;
            }
            if (this._receiverProtocol < 3) {
                return isPlaying ? 0 : PROGRESS_HEARTBEAT_MS.paused;
            }
            return isPlaying ? PROGRESS_HEARTBEAT_MS.playing : PROGRESS_HEARTBEAT_MS.paused;
        },

        async sendProgressPayload(endpoint, payload, trackUri, clockPlaying = payload.isPlaying) {
            const runtimeGeneration = this._runtimeGeneration;
            const progressGeneration = this._progressGeneration;
            const worker = this._worker;
            const now = Date.now();
            const heartbeat = this.getProgressHeartbeat(payload.isPlaying);
            // Position and remaining time advance by themselves. Any other
            // field (track, play state, queue, metadata) is a change sent now.
            const { position, remaining, currentTrack, ...state } = payload;
            const stateKey = JSON.stringify([trackUri, clockPlaying, state]);
            const last = this._lastProgress;
            if (last && heartbeat > 0 && !currentTrack && stateKey === last.stateKey) {
                const expected = last.position + (clockPlaying ? now - last.sentAt : 0);
                // A paused clock does not drift. A new position is a seek,
                // even if Spotify does not emit an onseek event for it.
                const tolerance = clockPlaying ? PROGRESS_DRIFT_TOLERANCE_MS : 0;
                const jumped = Math.abs(position - expected) > tolerance;
                if (!jumped && now - last.sentAt < heartbeat) return;
            }
            // Protocol 2 overlays keep the display for about two heartbeats
            // and return a receipt naming the lyrics they hold for us.
            const named = !!this.SOURCE_ID && this._receiverProtocol >= 2;
            const body = named ? { ...payload, heartbeatMs: heartbeat } : payload;
            const result = await this.sendToEndpoint(endpoint, body, { receipt: named });
            if (result && runtimeGeneration === this._runtimeGeneration
                && progressGeneration === this._progressGeneration && worker === this._worker) {
                if (currentTrack) this._lastProgressUri = trackUri;
                this._lastProgress = { stateKey, position, sentAt: now };
                if (typeof result === 'object') this.handleReceipt(result, trackUri);
            }
        },

        startProgressSync() {
            if (this._worker) return;
            if (!this.enabled || !this.isConnected) return;

            const blob = new Blob([`
              let interval = null;
              self.onmessage = function(e) {
                if (e.data === 'start') {
                  if (interval) clearInterval(interval);
                  interval = setInterval(() => {
                    self.postMessage('tick');
                  }, 250);
                } else if (e.data === 'stop') {
                  if (interval) clearInterval(interval);
                  interval = null;
                }
              };
            `], { type: 'application/javascript' });

            const workerUrl = URL.createObjectURL(blob);
            try {
                this._worker = new Worker(workerUrl);
            } finally {
                URL.revokeObjectURL(workerUrl);
            }

            const worker = this._worker;
            const player = getSpicetify().Player;
            // An explicit seek should send its next clock reading even if
            // the change is smaller than the drift tolerance.
            const onSeek = () => {
                if (this._worker === worker) this.invalidateProgress({ includeTrack: false });
            };
            player?.addEventListener?.('onseek', onSeek);
            this._removeProgressSeekListener = () => player?.removeEventListener?.('onseek', onSeek);

            worker.onmessage = async () => {
                if (this._worker !== worker || !this.enabled) return;
                if (this._isSendingProgress) return;
                if (!this.isConnected) return;

                // 전역 딜레이 변경 체크
                const visual = getRuntimeService('CONFIG', host)?.visual;
                if (visual) {
                    if (this.lastConfigDelay === undefined) {
                        this.lastConfigDelay = visual.delay;
                    }
                    if (this.lastConfigDelay !== visual.delay) {
                        this.lastConfigDelay = visual.delay;
                        this.resendWithNewOffset('lyrics-delay');
                    }
                }

                this._isSendingProgress = true;
                try {
                    const { trackUri, payload, clockPlaying } = this.buildProgressPayload();
                    await this.sendProgressPayload(this.PROGRESS_ENDPOINT, payload, trackUri, clockPlaying);
                } finally {
                    if (this._worker === worker) this._isSendingProgress = false;
                }
            };

            worker.postMessage('start');
        },

        buildProgressPayload() {
            const playbackSnapshot = playback.getPlayerPlaybackSnapshot();
            const currentItem = playback.resolveStablePlaybackTrack(null, playbackSnapshot);
            const currentUri = playbackSnapshot.uri ?? currentItem?.uri;
            const { position, duration, remaining } = normalizeOverlayProgressTiming(
                currentUri ? playbackSnapshot.position : 0,
                currentUri ? playbackSnapshot.duration || getSpicetify().Player.getDuration() : 0
            );

            // Keep offering track details until the receiver accepts them.
            // Read the trim preference once for the whole synchronous payload.
            let trimMetadata;
            const formatMetadata = text => this.formatMetadataText(text,
                trimMetadata ??= this.USES_DISPLAY_METADATA && this.trimMetadata);
            let currentTrack = null;
            const title = currentItem?.metadata?.title || currentItem?.name;
            if (currentUri && currentItem?.uri === currentUri && title && this._lastProgressUri !== currentUri) {
                try {
                    const imageUrl = currentItem?.metadata?.image_xlarge_url
                        || currentItem?.metadata?.image_url
                        || currentItem?.metadata?.image_large_url;
                    currentTrack = {
                        title: formatMetadata(title),
                        artist: formatMetadata(currentItem?.metadata?.artist_name || ''),
                        album: currentItem?.metadata?.album_title || '',
                        albumArt: resolveSpotifyImageUrl(imageUrl)
                    };
                } catch (e) { }
            }

            let nextTrack = null;
            try {
                const next = getSpicetify().Queue?.nextTracks?.[0];
                const metadata = next?.contextTrack?.metadata;
                if (metadata) {
                    nextTrack = {
                        title: formatMetadata(metadata.title || ''),
                        artist: formatMetadata(metadata.artist_name || ''),
                        albumArt: resolveSpotifyImageUrl(metadata.image_url || metadata.image_xlarge_url)
                    };
                }
            } catch (e) { }

            const isPlaying = !!currentUri && getOverlayProgressIsPlaying(playbackSnapshot);
            return {
                trackUri: currentUri,
                // Fullscreen can hide the overlay while the Spotify clock
                // continues. The receiver gets isPlaying, dedupe uses the clock.
                clockPlaying: !!currentUri && (playbackSnapshot.isPlaying ?? isPlaying),
                payload: {
                    ...this.getSourceFields(currentUri),
                    position,
                    isPlaying,
                    duration,
                    remaining,
                    currentTrack,
                    nextTrack
                }
            };
        },

        invalidateProgress({ includeTrack = true } = {}) {
            this._progressGeneration += 1;
            this._lastProgress = null;
            if (includeTrack) this._lastProgressUri = null;
        },

        stopProgressSync() {
            this.invalidateProgress();
            const worker = this._worker;
            this._worker = null;
            this._isSendingProgress = false;
            try { this._removeProgressSeekListener?.(); } catch {}
            this._removeProgressSeekListener = null;
            cleanupWorker(worker);
        },
    };
}
