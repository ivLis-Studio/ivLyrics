export function createStudyNavigation({
    state, document, requestAnimationFrame, enablePlaybackGuard, disablePlaybackGuard,
}) {
    const notify = () => {
        for (const listener of state.listeners) {
            try {
                listener(state.open);
            } catch (error) {
                console.warn("[LearningMode] listener failed:", error);
            }
        }
    };

    let learningReturnFocus = null;
    const getLearningPanel = () => document.querySelector(".ivlyrics-study-panel");
    const open = () => {
        if (!state.open) learningReturnFocus = document.activeElement;
        state.open = true;
        enablePlaybackGuard();
        notify();
        requestAnimationFrame(() => {
            if (state.open) getLearningPanel()?.focus({ preventScroll: true });
        });
    };

    const close = () => {
        const restoreFocus = getLearningPanel()?.contains(document.activeElement);
        state.open = false;
        disablePlaybackGuard();
        notify();
        if (restoreFocus && learningReturnFocus?.isConnected) {
            learningReturnFocus.focus?.({ preventScroll: true });
        }
        learningReturnFocus = null;
    };

    const toggle = () => state.open ? close() : open();

    const subscribe = (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
    };

    const dismissForUnmount = () => {
        state.open = false;
        learningReturnFocus = null;
        disablePlaybackGuard();
        notify();
    };

    return { open, close, toggle, subscribe, dismissForUnmount };
}
