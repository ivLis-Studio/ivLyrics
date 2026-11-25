import { trackIdentity } from "../../core/trackIdentity.mjs";
import { supersededAiRequest } from "../../providers/ai/aiRequestCancellation.mjs";

export function createFullscreenResearchSessionHook({
    react, readPlayer, isPlaybackCurrent, getSongResearch, hasResearchTokenConsent,
    saveResearchTokenConsent, hasResearchProvider, notifyMissingProvider,
}) {
    const { useState, useEffect, useCallback, useRef } = react;
    const useLayoutEffect = react.useLayoutEffect || useEffect;

    return function useFullscreenResearch(trackUri, enabled = true) {
        const [view, setView] = useState(null);
        const [researchConsentAccepted, setResearchConsentAccepted] = useState(hasResearchTokenConsent);
        const [consentTrackUri, setConsentTrackUri] = useState(null);
        const current = useRef(null);

        const releaseResearch = useCallback(() => {
            const session = current.current;
            if (!session) return;
            current.current = null;
            session.request?.abort(supersededAiRequest());
            try {
                // A repeat change made during Research belongs to the listener.
                if (session.changedRepeat && Number(session.player?.getRepeat?.()) === 2) {
                    session.player?.setRepeat?.(session.previousRepeat);
                }
            } catch (error) {
                console.warn("[Research] Failed to restore repeat mode:", error);
            }
        }, []);

        const closeTmiMode = useCallback(() => {
            releaseResearch();
            setView(null);
        }, [releaseResearch]);
        const closeResearchConsent = useCallback(() => setConsentTrackUri(null), []);

        const loadResearch = useCallback(async (session, regenerate = false) => {
            session.request?.abort(supersededAiRequest());
            const request = session.request = new AbortController();
            const isCurrent = () => current.current === session && session.request === request
                && !request.signal.aborted && isPlaybackCurrent(session.trackUri);
            function update(patch) {
                setView(previous => isCurrent() ? { ...previous, ...patch, session } : previous);
            }

            update({ data: null, loading: true, fallback: false });
            try {
                const data = await getSongResearch()?.fetchSongInfo(session.trackId, regenerate, {
                    signal: request.signal,
                    onProgress: (partial, details = {}) => {
                        if (!isCurrent()) return;
                        const fallback = details.webSearchStatus === "fallback" ? { fallback: true }
                            : details.webSearchStatus === "searching" ? { fallback: false } : {};
                        update({ ...fallback, data: details.reset ? null : (partial || null) });
                    },
                });
                if (isCurrent()) update({ data, loading: false });
            } catch (error) {
                if (!isCurrent()) return;
                console.error("[Research] Fetch error:", error);
                update({ data: null, loading: false });
            }
        }, []);

        const beginResearch = useCallback(() => {
            if (!enabled || current.current || !isPlaybackCurrent(trackUri)) return;
            const trackId = trackIdentity.getTranslationCacheId(trackUri) || trackUri?.split(":")[2];
            if (!trackId) return;
            const player = readPlayer();
            const session = { trackUri, trackId, player, previousRepeat: null, changedRepeat: false, request: null };
            current.current = session;
            try {
                const repeat = Number(player?.getRepeat?.());
                if (repeat !== 2) {
                    session.previousRepeat = [0, 1].includes(repeat) ? repeat : null;
                    player?.setRepeat?.(2);
                    session.changedRepeat = session.previousRepeat !== null;
                }
            } catch (error) {
                console.warn("[Research] Failed to enable repeat-one mode:", error);
            }
            return loadResearch(session);
        }, [enabled, trackUri, loadResearch]);

        const openTmiMode = useCallback(() => {
            if (!enabled || current.current || consentTrackUri || !isPlaybackCurrent(trackUri)) return;
            if (!hasResearchProvider()) {
                notifyMissingProvider();
                return;
            }
            if (!researchConsentAccepted) {
                setConsentTrackUri(trackUri);
                return;
            }
            return beginResearch();
        }, [beginResearch, consentTrackUri, enabled, researchConsentAccepted, trackUri]);

        const acceptResearchConsent = useCallback(() => {
            if (!enabled || consentTrackUri !== trackUri || !isPlaybackCurrent(trackUri)) return;
            saveResearchTokenConsent();
            setResearchConsentAccepted(true);
            closeResearchConsent();
            return beginResearch();
        }, [beginResearch, closeResearchConsent, consentTrackUri, enabled, trackUri]);

        const handleRegenerate = useCallback(() => {
            const session = current.current;
            if (enabled && session?.trackUri === trackUri && isPlaybackCurrent(trackUri)) {
                return loadResearch(session, true);
            }
        }, [enabled, trackUri, loadResearch]);

        const researchTrackUri = view?.session?.trackUri;
        const ownsPlayback = enabled && (!(researchTrackUri || consentTrackUri) || isPlaybackCurrent(trackUri));
        useLayoutEffect(() => {
            if (current.current && (!ownsPlayback || current.current.trackUri !== trackUri)) closeTmiMode();
            if (consentTrackUri && (!ownsPlayback || consentTrackUri !== trackUri)) closeResearchConsent();
        }, [trackUri, ownsPlayback, consentTrackUri, closeTmiMode, closeResearchConsent]);

        useLayoutEffect(() => releaseResearch, [releaseResearch]);

        useEffect(() => {
            if (!enabled || !(researchTrackUri || consentTrackUri)) return undefined;
            const player = readPlayer();
            const handleSongChange = () => {
                if (current.current && !isPlaybackCurrent(current.current.trackUri)) closeTmiMode();
                if (consentTrackUri && !isPlaybackCurrent(consentTrackUri)) closeResearchConsent();
            };
            player?.addEventListener?.("songchange", handleSongChange);
            return () => player?.removeEventListener?.("songchange", handleSongChange);
        }, [enabled, researchTrackUri, consentTrackUri, closeTmiMode, closeResearchConsent]);

        const visible = ownsPlayback && view?.session?.trackUri === trackUri && current.current === view.session ? view : null;
        return {
            tmiMode: !!visible,
            tmiData: visible?.data ?? null,
            tmiLoading: visible?.loading === true,
            tmiWebSearchFallback: visible?.fallback === true,
            showResearchConsent: ownsPlayback && !!consentTrackUri && consentTrackUri === trackUri,
            openTmiMode, closeResearchConsent, acceptResearchConsent, handleRegenerate, closeTmiMode,
        };
    };
}
