const REVEAL_ROW_LIMIT = 12;

export function playLyricsTrackReveal(page, onFinish = () => {}) {
    if (!page) return null;
    const bounds = page.getBoundingClientRect();
    if (bounds.height <= 0 || bounds.width <= 0) return null;

    const rows = [];
    for (const row of page.querySelectorAll(".lyrics-lyricsContainer-LyricsLine")) {
        if (row.classList.contains("lyrics-lyricsContainer-LyricsLine-paddingLine")
            || row.getAttribute("aria-hidden") === "true") continue;
        const rect = row.getBoundingClientRect();
        if (rect.height > 0 && rect.width > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom) {
            rows.push({ row, top: rect.top });
            if (rows.length === REVEAL_ROW_LIMIT) break;
        }
    }
    rows.sort((left, right) => left.top - right.top);

    const activeAnimations = new Map();
    for (const [index, { row }] of rows.entries()) {
        if (typeof row.animate !== "function") continue;
        // Individual translate composes with the row's centering transform.
        const animation = row.animate([
            { translate: "0 24px" },
            { translate: "0 -1px", offset: 0.72 },
            { translate: "0 0" },
        ], {
            duration: 420,
            delay: Math.min(index * 26, 170),
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "backwards",
        });
        const finish = () => {
            if (!activeAnimations.delete(animation)) return;
            animation.cancel();
            if (!activeAnimations.size) onFinish();
        };
        activeAnimations.set(animation, finish);
        animation.addEventListener("finish", finish, { once: true });
    }

    if (!activeAnimations.size) return null;
    return () => {
        for (const [animation, finish] of activeAnimations) {
            animation.removeEventListener("finish", finish);
            animation.cancel();
        }
        activeAnimations.clear();
    };
}

// The reveal runs on the existing DOM after centering has committed.
export function createLyricsTrackRevealHook({
    react, host, readPlayer, prefersReducedMotion, requestFrame, cancelFrame,
}) {
    const { useRef } = react;
    const useLayoutEffect = react.useLayoutEffect || react.useEffect;

    return function useLyricsTrackReveal(pageRef, trackRevealKey, hasLyrics) {
        const revealedTrackRef = useRef(null);
        useLayoutEffect(() => {
            if (!trackRevealKey || !hasLyrics || revealedTrackRef.current === trackRevealKey) return;
            const page = pageRef.current;
            if (!page) return;
            revealedTrackRef.current = trackRevealKey;
            if (prefersReducedMotion()) return;

            let listening = true;
            let frame = null;
            let stopAnimations = null;
            const player = readPlayer();
            const motionQuery = host.matchMedia?.("(prefers-reduced-motion: reduce)");
            const subscriptions = [
                [player, "onseek"], [page, "pointerdown", { passive: true }],
                [page, "wheel", { passive: true }], [host, "ivLyrics"], [motionQuery, "change"],
            ];

            function stopListening() {
                if (!listening) return;
                listening = false;
                for (const [target, event] of subscriptions) target?.removeEventListener?.(event, cancel);
            }
            function cancel() {
                stopListening();
                if (frame !== null) {
                    cancelFrame(frame);
                    frame = null;
                }
                stopAnimations?.();
                stopAnimations = null;
            }

            for (const [target, event, options] of subscriptions) target?.addEventListener?.(event, cancel, options);
            frame = requestFrame(() => {
                frame = null;
                if (!listening) return;
                if (pageRef.current === page && page.isConnected && !prefersReducedMotion()) {
                    stopAnimations = playLyricsTrackReveal(page, stopListening);
                }
                if (!stopAnimations) stopListening();
            });
            return cancel;
        }, [pageRef, trackRevealKey, hasLyrics]);
    };
}
