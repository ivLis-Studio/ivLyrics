const documentRequests = new WeakMap();

function startRequest(document, owner) {
    const root = document.documentElement;
    // A different app or an embedded player may already own fullscreen.
    if (document.fullscreenElement || typeof root?.requestFullscreen !== "function") return;
    const hasRootFullscreen = () => document.fullscreenElement === root || root.matches?.(":fullscreen") === true;

    const request = { owner, phase: "entering", exit };
    documentRequests.set(document, request);
    document.addEventListener("fullscreenchange", onChange);

    function finish() {
        if (documentRequests.get(document) !== request) return false;
        document.removeEventListener("fullscreenchange", onChange);
        documentRequests.delete(document);
        return true;
    }

    function exit() {
        if (request.phase !== "active" || document.fullscreenElement !== root) return;
        request.phase = "exiting";
        function completeExit() {
            if (hasRootFullscreen()) {
                // Retain ownership if exit failed or another fullscreen layer
                // covers the root. The next session can adopt and release it.
                request.phase = "active";
                return;
            }
            const nextOwner = request.owner;
            if (!finish()) return;
            if (nextOwner) startRequest(document, nextOwner);
        }
        try {
            Promise.resolve(document.exitFullscreen()).then(completeExit, completeExit);
        } catch {
            completeExit();
        }
    }

    function didEnter() {
        if (request.phase !== "entering") return;
        if (!hasRootFullscreen()) {
            finish();
            return;
        }
        request.phase = "active";
        if (!request.owner) exit();
    }

    function onChange() {
        if (request.phase === "entering") {
            if (hasRootFullscreen()) didEnter();
            return;
        }
        if (request.phase !== "active") return;
        if (hasRootFullscreen()) {
            // Only the topmost element can be exited through the document API.
            if (!request.owner) exit();
            return;
        }
        if (finish()) request.owner?.onExit();
    }

    function fail(error) {
        if (request.phase === "entering" && finish()) request.owner?.onError?.(error);
    }

    try {
        Promise.resolve(root.requestFullscreen()).then(didEnter, fail);
    } catch (error) {
        fail(error);
    }
}

export function claimBrowserFullscreen(document, { onExit, onError }) {
    const owner = { onExit, onError };
    const request = documentRequests.get(document);
    if (request) request.owner = owner;
    else startRequest(document, owner);

    return () => {
        const current = documentRequests.get(document);
        if (current?.owner !== owner) return;
        current.owner = null;
        current.exit();
    };
}
