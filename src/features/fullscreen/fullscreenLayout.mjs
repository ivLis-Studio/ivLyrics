// Album sizes up to the former 500px slider cap render exactly as set.
// Larger sizes fit the window so the cover cannot push the title, artist
// and controls (or the lyrics column) off screen; they never go below 500.
const FULLSCREEN_ALBUM_FIXED_MAX = 500;

export function fitFullscreenAlbumSize(configuredSize, viewportWidth, viewportHeight, twoColumn = true) {
    const size = Number(configuredSize);
    if (!Number.isFinite(size) || size <= FULLSCREEN_ALBUM_FIXED_MAX) return size;
    const heightLimit = Number.isFinite(viewportHeight) && viewportHeight > 0
        ? viewportHeight - 280 : size;
    const widthLimit = Number.isFinite(viewportWidth) && viewportWidth > 0
        ? viewportWidth / (twoColumn ? 2 : 1) - 112 : size;
    return Math.max(FULLSCREEN_ALBUM_FIXED_MAX, Math.min(size, heightLimit, widthLimit));
}

function createMeasurementFrame(view, measure) {
    let pending = null;
    let disposed = false;
    const run = () => {
        pending = null;
        if (!disposed) measure();
    };
    const cancel = () => {
        if (pending !== null) view.cancelAnimationFrame(pending);
        pending = null;
    };
    return {
        get disposed() { return disposed; },
        schedule() {
            if (!disposed && pending === null) pending = view.requestAnimationFrame(run);
        },
        flush() {
            cancel();
            run();
        },
        dispose() {
            disposed = true;
            cancel();
        },
    };
}

// Wrapped controls need their full natural height in the album stack, even
// while max-height animates to zero. Observe the in-flow children only;
// an absolute playlist popover must not change the collapse distance.
export function observeFullscreenControllerHeight(container, fallbackView) {
    const view = container.ownerDocument?.defaultView || fallbackView;
    const property = "--iv-fullscreen-controls-height";
    const pixels = value => Number.parseFloat(value) || 0;
    const measurement = createMeasurementFrame(view, () => {
        if (!container.isConnected) return;
        const style = view.getComputedStyle(container);
        const childHeights = [];
        for (const child of container.children) {
            // offsetHeight ignores the ancestor's hidden-state scale.
            const naturalHeight = child.offsetHeight;
            if (!(naturalHeight > 0)) continue;
            const childStyle = view.getComputedStyle(child);
            childHeights.push(naturalHeight + pixels(childStyle.marginTop) + pixels(childStyle.marginBottom));
        }
        let height = pixels(style.paddingTop) + pixels(style.paddingBottom)
            + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth)
            + Math.max(0, childHeights.length - 1) * pixels(style.rowGap);
        for (const childHeight of childHeights) height += childHeight;
        if (height <= 0) return;
        const value = `${Math.ceil(height)}px`;
        if (container.style.getPropertyValue(property) !== value) container.style.setProperty(property, value);
    });
    const { schedule } = measurement;
    const resizeObserver = typeof view.ResizeObserver === "function"
        ? new view.ResizeObserver(schedule) : null;
    const observeChildren = () => {
        if (measurement.disposed) return;
        resizeObserver?.disconnect();
        for (const child of container.children) resizeObserver?.observe(child);
        measurement.flush();
    };
    const mutationObserver = typeof view.MutationObserver === "function"
        ? new view.MutationObserver(observeChildren) : null;
    mutationObserver?.observe(container, { childList: true });
    if (!resizeObserver) view.addEventListener("resize", schedule);
    observeChildren();
    return () => {
        measurement.dispose();
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        if (!resizeObserver) view.removeEventListener("resize", schedule);
        container.style.removeProperty(property);
    };
}

// Center standard fullscreen lyrics beside the outer edge of the album or
// CD spectrum. Measure its stable frame, never the rotating artwork bounds.
// Keep observation away from the frequently changing karaoke subtree.
export function observeFullscreenAlbumLyricsRegion(panel, readAlignment, fallbackView) {
    const root = panel?.closest?.(".lyrics-lyricsContainer-LyricsContainer");
    if (!root) return () => {};
    const view = panel.ownerDocument?.defaultView || fallbackView;
    const attribute = "data-album-centered-lyrics";
    const leftVariable = "--lyrics-fullscreen-region-left";
    const rightVariable = "--lyrics-fullscreen-region-right";
    const excludedClasses = [
        "tv-mode-active", "portrait-mode", "fullscreen-single-column",
        "fullscreen-focus-active", "fullscreen-no-lyrics", "marketplace-active",
    ];
    const observedVisuals = new Set();
    let resizeObserver = null;
    const reset = () => {
        if (root.hasAttribute(attribute)) root.removeAttribute(attribute);
        for (const name of [leftVariable, rightVariable]) {
            if (root.style.getPropertyValue(name)) root.style.removeProperty(name);
        }
    };
    const measurement = createMeasurementFrame(view, () => {
        const visuals = new Set(panel.querySelectorAll(
            ".lyrics-fullscreen-album-art, .ivlyrics-compact-album-record, .ivlyrics-cd-size"
        ));
        for (const visual of observedVisuals) {
            if (!visuals.has(visual)) {
                resizeObserver?.unobserve(visual);
                observedVisuals.delete(visual);
            }
        }
        for (const visual of visuals) {
            if (!observedVisuals.has(visual)) {
                resizeObserver?.observe(visual);
                observedVisuals.add(visual);
            }
        }
        if (!root.isConnected || !panel.isConnected ||
            !root.classList.contains("fullscreen-active") ||
            excludedClasses.some(name => root.classList.contains(name)) ||
            panel.classList.contains("tmi-mode") ||
            (readAlignment() || "center") !== "center") {
            reset();
            return;
        }
        const rootBox = root.getBoundingClientRect();
        const reversed = root.classList.contains("layout-reversed");
        let edge = reversed ? Infinity : -Infinity;
        let hasVisibleVisual = false;
        for (const visual of visuals) {
            const box = visual.getBoundingClientRect();
            if (!(box.width > 0 && box.height > 0 && Number.isFinite(box.left) && Number.isFinite(box.right))) continue;
            const style = view.getComputedStyle(visual);
            if (style.visibility !== "hidden" && style.visibility !== "collapse" &&
                style.display !== "none" && Number.parseFloat(style.opacity) !== 0) {
                edge = reversed ? Math.min(edge, box.left) : Math.max(edge, box.right);
                hasVisibleVisual = true;
            }
        }
        if (rootBox.width <= 0 || rootBox.height <= 0 || !hasVisibleVisual) {
            reset();
            return;
        }
        const inset = reversed ? rootBox.right - edge : edge - rootBox.left;
        if (!Number.isFinite(inset) || inset <= 0 || inset >= rootBox.width) {
            reset();
            return;
        }
        const insets = reversed ? [0, inset] : [inset, 0];
        for (const [index, name] of [leftVariable, rightVariable].entries()) {
            const value = `${Math.round(insets[index] * 1000) / 1000}px`;
            if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
        }
        if (root.getAttribute(attribute) !== "true") root.setAttribute(attribute, "true");
    });
    const { schedule } = measurement;
    if (typeof view.ResizeObserver === "function") {
        resizeObserver = new view.ResizeObserver(schedule);
        resizeObserver.observe(root);
        resizeObserver.observe(panel);
    }
    const mutationObserver = typeof view.MutationObserver === "function"
        ? new view.MutationObserver(schedule)
        : null;
    mutationObserver?.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    mutationObserver?.observe(panel, {
        attributes: true, attributeFilter: ["class", "style", "hidden"],
        childList: true, subtree: true,
    });
    // ResizeObserver does not report CSS transforms. Recheck their settled
    // visual edges after hover and controls-hidden transitions, without polling.
    panel.addEventListener("transitionend", schedule);
    panel.addEventListener("transitioncancel", schedule);
    view.addEventListener("resize", schedule);
    schedule();
    return () => {
        measurement.dispose();
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        observedVisuals.clear();
        panel.removeEventListener("transitionend", schedule);
        panel.removeEventListener("transitioncancel", schedule);
        view.removeEventListener("resize", schedule);
        reset();
    };
}

// Fit TV metadata only when its content, fonts or available space changes.
// Playback updates must not measure or resize this stationary caption.
export function observeTvMetadataFit(container, fallbackView) {
    const stack = container.firstElementChild;
    if (!stack) return () => {};
    const view = container.ownerDocument?.defaultView || fallbackView;
    const fonts = container.ownerDocument?.fonts;
    const property = "--fullscreen-tv-metadata-scale";
    let force = true;
    let lastSize = "";
    const dimensions = () => [container.clientWidth, container.clientHeight,
        stack.offsetWidth, stack.offsetHeight].join(":");
    const setScale = (scale) => container.style.setProperty(property, String(scale));
    const measurement = createMeasurementFrame(view, () => {
        if (!container.isConnected) return;
        if (!force && dimensions() === lastSize) return;
        force = false;
        const height = container.clientHeight;
        if (height <= 0 || container.clientWidth <= 0) return;
        setScale(1);
        if (stack.offsetHeight > height) {
            // Font scaling can change the title's wrapping. Search the
            // actual layout instead of assuming height scales linearly.
            let low = 0.4, high = 1;
            for (let step = 0; step < 8; step++) {
                const middle = (low + high) / 2;
                setScale(middle);
                if (stack.offsetHeight <= height) low = middle;
                else high = middle;
            }
            setScale(Math.floor(low * 1000) / 1000);
        }
        lastSize = dimensions();
    });
    const schedule = (contentChanged = false) => {
        if (measurement.disposed) return;
        force ||= contentChanged;
        measurement.schedule();
    };
    const resizeObserver = typeof view.ResizeObserver === "function"
        ? new view.ResizeObserver(() => schedule()) : null;
    resizeObserver?.observe(container);
    resizeObserver?.observe(stack);
    const contentChanged = () => schedule(true);
    const mutationObserver = typeof view.MutationObserver === "function"
        ? new view.MutationObserver(contentChanged) : null;
    // Observe the content, not our own scale property on its parent.
    mutationObserver?.observe(stack, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ["style"],
    });
    view.addEventListener("resize", contentChanged);
    fonts?.addEventListener?.("loadingdone", contentChanged);
    fonts?.ready?.then(contentChanged);
    measurement.flush();
    return () => {
        measurement.dispose();
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        view.removeEventListener("resize", contentChanged);
        fonts?.removeEventListener?.("loadingdone", contentChanged);
        container.style.removeProperty(property);
    };
}
