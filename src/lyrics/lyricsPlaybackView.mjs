import { DEFAULT_TRACK_POSITION_FPS } from "./lyricsFrameScheduler.mjs";
import { normalizeGlobalSyncOffset } from "../core/globalSyncOffset.mjs";

export function getLyricsTrackFrameRate(visual) {
    const configured = Number(visual?.["performance-frame-rate"]);
    return Number.isFinite(configured) ? Math.max(10, Math.min(240, Math.round(configured))) : DEFAULT_TRACK_POSITION_FPS;
}

export function createLyricsViewClock({
    getSafePlayerProgress, getPublicProgress, getSnapshot, getDelay, getPronunciationLead, readGlobalOffset,
}) {
    let trackOffset = 0;
    let globalOffset = 0;

    function getFrameAlignedPlayerPosition(frameTime) {
        const sample = getSnapshot();
        const position = Number(sample?.position);
        if (!Number.isFinite(position)) return Number(getSafePlayerProgress() ?? getPublicProgress()) || 0;
        if (sample.isPlaying && Number.isFinite(frameTime) && Number.isFinite(sample.sampledAt)) {
            return position - Math.max(0, sample.sampledAt - frameTime);
        }
        return position;
    }

    return {
        // React consumes discrete row/glyph state in whole milliseconds. The
        // glyph painter below keeps continuous time at the display refresh rate.
        getDiscretePosition(track = 0, global = readGlobalOffset()) {
            const position = getSafePlayerProgress() ?? (getPublicProgress() || 0);
            const delay = getDelay() + track + global + getPronunciationLead();
            return Math.round(position + delay);
        },

        getFrameAlignedLyricsPlaybackPosition(frameTime = NaN) {
            return getFrameAlignedPlayerPosition(frameTime) + getDelay() + trackOffset + globalOffset + getPronunciationLead();
        },

        updateOffsets(track, global) {
            trackOffset = track;
            globalOffset = global;
        },
    };
}

export function createLyricsPlaybackHooks({
    react, hostEvents, frameScheduler, visibilityManager, clock, readTrackUri, readTrackOffset, readGlobalOffset,
}) {
    const { useEffect, useRef, useState } = react;
    const useLayoutEffect = react.useLayoutEffect || useEffect;

    function useTrackOffset(trackUri) {
        const [savedOffset, setSavedOffset] = useState(null);
        useEffect(() => {
            if (!trackUri) return undefined;
            let canApplyStoredValue = true;
            const applyOffset = (offset) => setSavedOffset({ trackUri, offset: Number(offset) || 0 });
            const onOffsetChange = ({ detail }) => {
                if (detail?.trackUri !== trackUri) return;
                canApplyStoredValue = false;
                applyOffset(detail.offset);
            };
            hostEvents.addEventListener("ivLyrics:offset-changed", onOffsetChange);
            Promise.resolve().then(() => readTrackOffset(trackUri)).catch(() => 0).then(offset => {
                if (canApplyStoredValue) applyOffset(offset);
            });
            return () => {
                canApplyStoredValue = false;
                hostEvents.removeEventListener("ivLyrics:offset-changed", onOffsetChange);
            };
        }, [trackUri]);
        return savedOffset?.trackUri === trackUri ? savedOffset.offset : 0;
    }

    function useGlobalOffset() {
        const [offset, setOffset] = useState(readGlobalOffset);
        useEffect(() => {
            const onOffsetChange = ({ detail }) => setOffset(normalizeGlobalSyncOffset(detail?.offset));
            hostEvents.addEventListener("ivLyrics:global-offset-changed", onOffsetChange);
            return () => hostEvents.removeEventListener("ivLyrics:global-offset-changed", onOffsetChange);
        }, []);
        return offset;
    }

    function useTrackPosition(callback) {
        const callbackRef = useRef(callback);
        useLayoutEffect(() => { callbackRef.current = callback; }, [callback]);
        useEffect(() => {
            let mounted = true;
            let visible = true;
            const update = () => {
                if (mounted && visible) callbackRef.current?.();
            };
            const updateVisibility = (isVisible) => { visible = isVisible; };
            frameScheduler.addCallback(update);
            update();
            visibilityManager.addListener(updateVisibility);
            return () => {
                mounted = false;
                frameScheduler.removeCallback(update);
                visibilityManager.removeListener(updateVisibility);
            };
        }, []);
    }

    function useLyricsPlaybackObserver(observe, trackUri = readTrackUri()) {
        const trackOffset = useTrackOffset(trackUri);
        const globalOffset = useGlobalOffset();
        useLayoutEffect(() => clock.updateOffsets(trackOffset, globalOffset), [trackOffset, globalOffset]);
        const refresh = () => { observe(clock.getDiscretePosition(trackOffset, globalOffset)); };
        useEffect(refresh, [observe, trackUri, trackOffset, globalOffset]);
        useTrackPosition(refresh);
    }

    function useLyricsPlaybackPosition(trackUri) {
        const [position, setPosition] = useState(() => clock.getDiscretePosition());
        useLyricsPlaybackObserver(setPosition, trackUri);
        return position;
    }

    return { useLyricsPlaybackPosition, useLyricsPlaybackObserver };
}
