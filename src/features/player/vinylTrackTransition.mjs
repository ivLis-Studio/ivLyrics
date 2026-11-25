// Each delay starts when the preceding stage becomes visible.
const TRACK_TRANSITION_STEPS = [
    ["record-sleeving", 180],
    ["album-departing", 680],
    ["album-arriving", 480],
    ["record-emerging", 700],
    ["record-raised", 720],
    ["handoff", 360],
    ["idle", 96],
];
const ACCENT_UPDATE_PHASES = new Set([
    "record-clearing", "record-sleeving", "album-departing", "album-arriving",
]);

function runTrackTransition(host, onPhase) {
    let cursor = 0;
    let timer = null;
    let active = true;

    const scheduleNext = () => {
        if (!active || cursor === TRACK_TRANSITION_STEPS.length) return;
        const [phase, delay] = TRACK_TRANSITION_STEPS[cursor++];
        timer = host.setTimeout(() => {
            if (!active) return;
            timer = null;
            onPhase(phase);
            scheduleNext();
        }, delay);
    };

    scheduleNext();
    return () => {
        active = false;
        if (timer !== null) host.clearTimeout(timer);
    };
}

const areSameTrackVisuals = (left, right) => left?.coverUrl === right?.coverUrl
    && left?.title === right?.title
    && left?.artist === right?.artist
    && left?.album === right?.album;

export function useVinylTrackTransition({
    react: { useState, useEffect, useRef }, host, liveTrack, liveTrackRef,
    isFullVinylPresentation, animationsEnabled, trackChangeEnabled, reducedMotion,
}) {
    const [displayedTrack, setDisplayedTrack] = useState(() => liveTrack);
    const displayedTrackRef = useRef(liveTrack);
    const [incomingTrack, setIncomingTrack] = useState(null);
    const incomingTrackRef = useRef(null);
    const [trackTransition, setTrackTransition] = useState("idle");
    // A new URI owns the animation. Metadata and artwork can hydrate
    // while its sequence runs without restarting the timer.
    useEffect(() => {
        const shownTrack = displayedTrackRef.current;
        if (
            !shownTrack?.uri
            || !isFullVinylPresentation
            || !animationsEnabled
            || !trackChangeEnabled
            || reducedMotion
            || shownTrack?.uri === liveTrack.uri
            || areSameTrackVisuals(shownTrack, liveTrack)
        ) {
            if (shownTrack?.uri !== liveTrack.uri || !areSameTrackVisuals(shownTrack, liveTrack)) {
                displayedTrackRef.current = liveTrack;
                setDisplayedTrack(liveTrack);
            }
            incomingTrackRef.current = null;
            setIncomingTrack(null);
            setTrackTransition("idle");
            return;
        }

        incomingTrackRef.current = liveTrack;
        setIncomingTrack(liveTrack);
        setTrackTransition("record-clearing");

        // The incoming cover loads in parallel with the sequence.
        return runTrackTransition(host, (phase) => {
            if (phase === "handoff") {
                const latestTrack = liveTrackRef.current?.uri === liveTrack.uri
                    ? liveTrackRef.current
                    : liveTrack;
                const incoming = incomingTrackRef.current;
                const committedTrack = {
                    ...latestTrack,
                    accent: incoming?.uri === liveTrack.uri ? incoming.accent : liveTrack.accent,
                };
                displayedTrackRef.current = committedTrack;
                setDisplayedTrack(committedTrack);
            } else if (phase === "idle") {
                incomingTrackRef.current = null;
                setIncomingTrack(null);
            }
            setTrackTransition(phase);
        });
    }, [liveTrack.uri, animationsEnabled, trackChangeEnabled, reducedMotion, isFullVinylPresentation]);

    useEffect(() => {
        const incoming = incomingTrackRef.current;
        if (incoming?.uri === liveTrack.uri && !areSameTrackVisuals(incoming, liveTrack)) {
            const updatedTrack = { ...liveTrack, accent: incoming.accent };
            incomingTrackRef.current = updatedTrack;
            setIncomingTrack(updatedTrack);
        }
        // Both copies are visible during the final handoff. Hydrate both
        // without cancelling its remaining timer or changing the LP color.
        const shownTrack = displayedTrackRef.current;
        if (shownTrack?.uri === liveTrack.uri && !areSameTrackVisuals(shownTrack, liveTrack)) {
            const updatedTrack = { ...liveTrack, accent: shownTrack.accent };
            displayedTrackRef.current = updatedTrack;
            setDisplayedTrack(updatedTrack);
        }
    }, [liveTrack.uri, liveTrack.coverUrl, liveTrack.title, liveTrack.artist, liveTrack.album]);

    // Keep the visible incoming LP's label stable. A color that arrives after
    // the record starts emerging is applied only after handoff has settled.
    useEffect(() => {
        if (!isFullVinylPresentation) return;
        if (!liveTrack.accent) return;

        const incoming = incomingTrackRef.current;
        if (incoming?.uri === liveTrack.uri && incoming.accent !== liveTrack.accent
            && ACCENT_UPDATE_PHASES.has(trackTransition)) {
            const updatedTrack = { ...incoming, accent: liveTrack.accent };
            incomingTrackRef.current = updatedTrack;
            setIncomingTrack(updatedTrack);
        }

        if (trackTransition !== "idle") return;
        const shownTrack = displayedTrackRef.current;
        if (shownTrack?.uri === liveTrack.uri && shownTrack.accent !== liveTrack.accent) {
            const updatedTrack = { ...shownTrack, accent: liveTrack.accent };
            displayedTrackRef.current = updatedTrack;
            setDisplayedTrack(updatedTrack);
        }
    }, [
        isFullVinylPresentation,
        liveTrack.uri,
        liveTrack.accent,
        trackTransition
    ]);

    return { displayedTrack, incomingTrack, trackTransition };
}
