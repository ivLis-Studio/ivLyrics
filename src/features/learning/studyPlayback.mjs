import { getPlayableLyricsUri } from "../../core/playbackPositionService.mjs";
import { createStudyAudio } from "./studyAudio.mjs";

const DEFAULT_LYRIC_PLAY_MS = 6500;
const MIN_LYRIC_PLAY_MS = 1000;
const MAX_LYRIC_PLAY_MS = 15000;
const PLAYBACK_END_REWIND_RATIO = 0.985;
const PLAYBACK_END_REWIND_COOLDOWN_MS = 2500;
const CLIP_TRACK_SWITCH_DELAY_MS = 450;
const CLIP_TRACK_SWITCH_RETRY_MS = 150;
const CLIP_TRACK_SWITCH_RETRIES = 10;
const CLIP_POSITION_TOLERANCE_MS = 750;

function matchesPlayback(expected, current) {
    if (!expected?.uri || expected.uri !== current.uri) return false;
    if (expected.playbackId && current.playbackId) return expected.playbackId === current.playbackId;
    return !expected.itemUid || !current.itemUid || expected.itemUid === current.itemUid;
}

const positiveDuration = (value) => {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

export function createStudyPlayback({ host, isOpen, readPlayer, readPlaybackSnapshot = () => null, readToast, t }) {
    let activeClip = null;
    let activeGuard = null;

    const readPlayback = () => {
        const player = readPlayer();
        const snapshot = readPlaybackSnapshot();
        const data = player?.data;
        const uri = getPlayableLyricsUri(snapshot, data?.item?.uri);
        const item = snapshot?.item?.uri === uri ? snapshot.item : (data?.item?.uri === uri ? data.item : null);
        const playbackId = snapshot?.playbackId || (data?.item?.uri === uri ? data.playbackId : null);
        let position = snapshot?.position;
        try {
            position ??= player?.getProgress?.();
        } catch {
            // The public player can be between two playback instances.
        }
        const duration = positiveDuration(snapshot?.duration)
            || positiveDuration(player?.getDuration?.())
            || positiveDuration(item?.duration?.milliseconds)
            || positiveDuration(item?.metadata?.duration_ms)
            || positiveDuration(item?.duration_ms);
        return {
            player, uri, playbackId, itemUid: item?.uid,
            position: position == null ? NaN : Number(position),
            duration,
            isPlaying: snapshot?.isPlaying ?? Boolean(player?.isPlaying?.()),
        };
    };

    const getCurrentPlayerUri = () => readPlayback().uri || "";
    const resumePlayer = player => player?.togglePlay?.();
    const seekPlayer = (player, positionMs) => {
        if (typeof player?.seek !== "function") return false;
        try {
            player.seek(positionMs);
            return true;
        } catch (error) {
            console.warn("[LearningMode] failed to seek player:", error);
            return false;
        }
    };

    const pausePlayer = (player) => {
        try {
            if (typeof player?.pause === "function") {
                player.pause();
                return;
            }
            if (player?.isPlaying?.()) {
                player.togglePlay?.();
            }
        } catch (error) {
            console.warn("[LearningMode] failed to pause player:", error);
        }
    };

    const clearLyricPlaybackTimer = () => {
        if (activeClip?.timer != null) host.clearTimeout(activeClip.timer);
        activeClip = null;
    };

    const getLyricPlaybackDuration = (startTime, endTime) => {
        const end = Number(endTime);
        if (Number.isFinite(end) && end > startTime + 300) {
            return Math.max(MIN_LYRIC_PLAY_MS, Math.min(MAX_LYRIC_PLAY_MS, end - startTime));
        }
        return DEFAULT_LYRIC_PLAY_MS;
    };

    const scheduleLyricPlaybackStop = (clip, duration) => {
        clip.timer = host.setTimeout(() => {
            if (activeClip !== clip) return;
            activeClip = null;
            if (!isOpen()) return;
            const current = readPlayback();
            if (!matchesPlayback(clip.playback, current) || !current.isPlaying) return;
            // Some hosts do not emit a seek event. Relinquish playback if the
            // listener has moved away from this clip in the meantime.
            const { position } = current;
            if (Number.isFinite(position) && (
                position < clip.startTime - CLIP_POSITION_TOLERANCE_MS
                || position > clip.startTime + duration + CLIP_POSITION_TOLERANCE_MS
            )) return;
            pausePlayer(current.player);
        }, duration);
    };

    const audio = createStudyAudio({ host, isOpen, readPlayback, matchesPlayback, pausePlayer, resumePlayer, clearLyricPlaybackTimer });
    const rewindCurrentTrackNearEnd = (guard) => {
        if (activeClip || audio.isSpeaking()) return;
        const playback = readPlayback();
        const { uri, duration, position: progress, isPlaying, player } = playback;
        if (!uri || !isPlaying || duration <= 0 || !Number.isFinite(progress) || progress <= 0) return;

        const isNearEnd = progress >= duration * PLAYBACK_END_REWIND_RATIO
            || duration - progress <= 1200;
        if (!isNearEnd) return;

        const now = Date.now();
        if (matchesPlayback(guard.lastPlayback, playback) && now - guard.lastRewindAt < PLAYBACK_END_REWIND_COOLDOWN_MS) return;

        guard.lastPlayback = playback;
        guard.lastRewindAt = now;
        seekPlayer(player, 0);
    };

    const enablePlaybackGuard = () => {
        if (activeGuard) return;
        const guard = { progressTimer: null, lastPlayback: null, lastRewindAt: 0 };
        activeGuard = guard;

        guard.progressTimer = host.setInterval(() => {
            if (activeGuard !== guard) return;
            if (!isOpen()) {
                disablePlaybackGuard();
                return;
            }
            rewindCurrentTrackNearEnd(guard);
        }, 500);
    };

    const disablePlaybackGuard = () => {
        const guard = activeGuard;
        activeGuard = null;
        if (guard?.progressTimer != null) host.clearInterval(guard.progressTimer);
        clearLyricPlaybackTimer();
        audio.cancelSpeech(true);
    };

    const playLyricAt = (entry) => {
        if (!isOpen()) return;
        const startTime = Number(entry?.startTime);
        const uri = String(entry?.trackUri || "");
        if (!uri || !Number.isFinite(startTime) || startTime < 0) {
            readToast()?.error?.(t("lyricPlaybackUnavailable", "싱크 시간이 없어 가사를 재생할 수 없습니다."));
            return;
        }

        clearLyricPlaybackTimer();
        audio.cancelSpeech();
        const clip = { startTime, timer: null, retries: CLIP_TRACK_SWITCH_RETRIES, playback: null };
        activeClip = clip;
        const previous = readPlayback();
        const durationMs = getLyricPlaybackDuration(startTime, entry?.endTime);
        const fail = (error) => {
            if (activeClip !== clip) return;
            clearLyricPlaybackTimer();
            if (error) console.warn("[LearningMode] failed to play lyric track:", error);
            readToast()?.error?.(t("lyricPlaybackFailed", "가사 위치로 재생하지 못했습니다."));
        };
        const seekAndPlay = (current) => {
            if (activeClip !== clip || !isOpen()) return;
            current ??= readPlayback();
            const { uri: currentUri, duration, player, isPlaying } = current;
            if (currentUri !== uri) {
                if (currentUri && currentUri !== previous.uri) {
                    clearLyricPlaybackTimer();
                } else if (clip.retries > 0) {
                    clip.retries--;
                    clip.timer = host.setTimeout(seekAndPlay, CLIP_TRACK_SWITCH_RETRY_MS);
                } else {
                    fail();
                }
                return;
            }
            const remaining = duration > 0 ? duration - startTime : durationMs;
            if (remaining <= 0 || !seekPlayer(player, startTime)) {
                fail();
                return;
            }
            clip.playback = current;
            try {
                if (!isPlaying) resumePlayer(player);
            } catch (error) { }
            scheduleLyricPlaybackStop(clip, Math.min(durationMs, remaining));
        };

        if (previous.uri === uri) {
            seekAndPlay(previous);
            return;
        }

        try {
            const { player } = previous;
            if (typeof player?.playUri !== "function") {
                fail();
                return;
            }
            const opening = player.playUri(uri);
            clip.timer = host.setTimeout(seekAndPlay, CLIP_TRACK_SWITCH_DELAY_MS);
            Promise.resolve(opening).catch(fail);
        } catch (error) {
            fail(error);
        }
    };

    return {
        enablePlaybackGuard, disablePlaybackGuard, getCurrentPlayerUri, clearLyricPlaybackTimer,
        playLyricAt, detectSpeechLang: audio.detectSpeechLang, speakText: audio.speakText, playQuizSound: audio.playQuizSound,
    };
}
