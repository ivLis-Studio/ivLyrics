const transitionsByDocument = new WeakMap();
const TRANSITION_CLASS = "is-lp-view-transition";

function finish(document, request) {
    if (transitionsByDocument.get(document) !== request) return false;
    transitionsByDocument.delete(document);
    request.root.classList.remove(TRANSITION_CLASS, request.directionClass);
    return true;
}

export function cancelFullscreenAlbumTransition(document, { pendingOnly = false } = {}) {
    const request = transitionsByDocument.get(document);
    if (!request || (pendingOnly && request.committed)) return;
    finish(document, request);
    request.transition?.skipTransition?.();
}

export function createFullscreenAlbumViewTransition({ document, host, getReactDOM, canAnimate }) {
    const owner = {};
    return {
        run(direction, updateMode) {
            cancelFullscreenAlbumTransition(document);
            if (!canAnimate() || typeof document.startViewTransition !== "function") return false;

            const request = {
                owner, root: document.documentElement, directionClass: `is-lp-view-${direction}`,
                transition: null, committed: false,
            };
            transitionsByDocument.set(document, request);
            request.root.classList.add(TRANSITION_CLASS, request.directionClass);
            const isCurrent = () => transitionsByDocument.get(document) === request;
            const complete = () => finish(document, request);

            try {
                const transition = document.startViewTransition(() => {
                    // A skipped browser transition still invokes its update callback.
                    if (!isCurrent() || request.committed) return;
                    request.committed = true;
                    const reactDom = getReactDOM();
                    if (typeof reactDom?.flushSync === "function") {
                        reactDom.flushSync(updateMode);
                        return;
                    }
                    updateMode();
                    return new Promise(resolve => host.requestAnimationFrame(resolve));
                });
                request.transition = transition;
                Promise.resolve(transition.ready).catch(() => {});
                Promise.resolve(transition.finished).then(complete, complete);
                if (!isCurrent()) transition.skipTransition?.();
            } catch {
                if (complete() && !request.committed) updateMode();
            }
            return true;
        },
        cancel(options) {
            if (transitionsByDocument.get(document)?.owner === owner) {
                cancelFullscreenAlbumTransition(document, options);
            }
        },
    };
}
