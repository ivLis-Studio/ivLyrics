import { FALLBACK_CROSSFADE_MS } from "./videoBackgroundView.mjs";

export function useVideoBackgroundFallbackArt(react, trackUri, albumArtUrl) {
    const { useState, useRef, useEffect } = react;
    const useIsoLayoutEffect = react.useLayoutEffect || useEffect;
    const previousFallbackUrlRef = useRef("");
    const [previousFallbackUrl, setPreviousFallbackUrl] = useState("");
    const fallbackTransitionTimerRef = useRef(null);
    // Capture the previous artwork before the new track is revealed.  The
    // old layer is removed after a single compositor-only crossfade.
    useIsoLayoutEffect(() => {
        const previousUrl = previousFallbackUrlRef.current;
        if (previousUrl && previousUrl !== albumArtUrl) {
            setPreviousFallbackUrl(previousUrl);
            if (fallbackTransitionTimerRef.current) {
                clearTimeout(fallbackTransitionTimerRef.current);
            }
            fallbackTransitionTimerRef.current = setTimeout(() => {
                fallbackTransitionTimerRef.current = null;
                setPreviousFallbackUrl("");
            }, FALLBACK_CROSSFADE_MS + 40);
        }
        previousFallbackUrlRef.current = albumArtUrl;
    }, [trackUri, albumArtUrl]);

    useEffect(() => () => {
        if (fallbackTransitionTimerRef.current) {
            clearTimeout(fallbackTransitionTimerRef.current);
            fallbackTransitionTimerRef.current = null;
        }
    }, []);

    return previousFallbackUrl;
}
