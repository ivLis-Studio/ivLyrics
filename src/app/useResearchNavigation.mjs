const SCROLL_LOCK_MS = 700;
const FOCUS_DELAY_MS = 350;

export function useResearchNavigation(react, host, sections, enabled) {
    const { useRef, useCallback, useEffect, useState } = react;
    const useLayoutEffect = react.useLayoutEffect ?? useEffect;
    const contentRef = useRef(null);
    const navRef = useRef(null);
    const sectionRefs = useRef(new Map());
    const navigation = useRef(null);
    const navDrag = useRef(null);
    const suppressClick = useRef(null);
    const [activeSection, setActiveSection] = useState(sections[0]?.[0] || "overview");
    const reducedMotion = () => host.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const register = useCallback((id, node) => {
        if (node) sectionRefs.current.set(id, node);
        else sectionRefs.current.delete(id);
    }, []);

    const cancelNavigation = useCallback(() => {
        const pending = navigation.current;
        navigation.current = null;
        if (!pending) return;
        if (pending.scrollTimer !== null) host.clearTimeout(pending.scrollTimer);
        if (pending.focusTimer !== null) host.clearTimeout(pending.focusTimer);
    }, [host]);

    useLayoutEffect(() => () => {
        cancelNavigation();
        if (suppressClick.current !== null) host.clearTimeout(suppressClick.current);
        suppressClick.current = null;
        navDrag.current = null;
    }, [enabled, host, cancelNavigation]);

    useEffect(() => {
        const root = contentRef.current;
        if (!enabled || !root) return;
        let frame = null;
        const update = () => {
            frame = null;
            const pending = navigation.current;
            if (pending) {
                if (!sectionRefs.current.has(pending.id)) cancelNavigation();
                else if (pending.scrollTimer !== null) {
                    setActiveSection(pending.id);
                    return;
                }
            }
            const anchor = root.getBoundingClientRect().top + 24;
            let closest = sections[0]?.[0];
            let distance = Infinity;
            for (const [id] of sections) {
                const node = sectionRefs.current.get(id);
                if (!node) continue;
                const current = Math.abs(node.getBoundingClientRect().top - anchor);
                if (current < distance) {
                    closest = id;
                    distance = current;
                }
            }
            if (closest) setActiveSection(closest);
        };
        const handleScroll = () => {
            if (frame === null) frame = host.requestAnimationFrame(update);
        };
        root.addEventListener("scroll", handleScroll, { passive: true });
        update();
        return () => {
            root.removeEventListener("scroll", handleScroll);
            if (frame !== null) host.cancelAnimationFrame(frame);
        };
    }, [enabled, sections, host, cancelNavigation]);

    useEffect(() => {
        if (sections.some(([id]) => id === activeSection)) return;
        if (sections[0]?.[0]) setActiveSection(sections[0][0]);
    }, [activeSection, sections]);

    useEffect(() => {
        const nav = navRef.current;
        if (!enabled || !nav || !activeSection) return;
        const frame = host.requestAnimationFrame(() => {
            const button = Array.from(nav.querySelectorAll("button"))
                .find(candidate => candidate.dataset.researchNavId === activeSection);
            if (!button) return;
            const navRect = nav.getBoundingClientRect();
            const rect = button.getBoundingClientRect();
            const edgePadding = 12;
            let delta = 0;
            if (rect.left < navRect.left + edgePadding) delta = rect.left - navRect.left - edgePadding;
            else if (rect.right > navRect.right - edgePadding) delta = rect.right - navRect.right + edgePadding;
            if (delta) nav.scrollBy({ left: delta, behavior: reducedMotion() ? "auto" : "smooth" });
        });
        return () => host.cancelAnimationFrame(frame);
    }, [enabled, activeSection, sections.length, host]);

    useEffect(() => {
        const nav = navRef.current;
        if (!enabled || !nav) return;
        const handleWheel = (event) => {
            if (nav.scrollWidth <= nav.clientWidth) return;
            const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
            if (!delta) return;
            const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? nav.clientWidth : 1;
            event.preventDefault();
            nav.scrollLeft += delta * scale;
        };
        nav.addEventListener("wheel", handleWheel, { passive: false });
        return () => nav.removeEventListener("wheel", handleWheel);
    }, [enabled, sections.length > 0]);

    function selectSection(event, id) {
        if (suppressClick.current !== null) {
            event.preventDefault();
            return;
        }
        const root = contentRef.current;
        const node = sectionRefs.current.get(id);
        if (!root || !node) return;
        cancelNavigation();
        const pending = { id, scrollTimer: null, focusTimer: null };
        navigation.current = pending;
        setActiveSection(id);
        const top = Math.max(0, root.scrollTop + node.getBoundingClientRect().top - root.getBoundingClientRect().top - 18);
        const behavior = reducedMotion() ? "auto" : "smooth";
        if (typeof root.scrollTo === "function") root.scrollTo({ top, behavior });
        else root.scrollTop = top;

        const releaseWhenSettled = () => {
            if (navigation.current === pending && pending.scrollTimer === null && pending.focusTimer === null) {
                navigation.current = null;
            }
        };
        pending.scrollTimer = host.setTimeout(() => {
            pending.scrollTimer = null;
            releaseWhenSettled();
        }, behavior === "smooth" ? SCROLL_LOCK_MS : 0);
        pending.focusTimer = host.setTimeout(() => {
            pending.focusTimer = null;
            if (navigation.current === pending && contentRef.current === root) {
                const currentNode = sectionRefs.current.get(id);
                if (currentNode && root.contains(currentNode)) currentNode.focus({ preventScroll: true });
            }
            releaseWhenSettled();
        }, FOCUS_DELAY_MS);
    }

    function handlePointerDown(event) {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        navDrag.current = {
            pointerId: event.pointerId, startX: event.clientX,
            scrollLeft: event.currentTarget.scrollLeft, moved: false,
        };
    }

    function handlePointerMove(event) {
        const drag = navDrag.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const distance = event.clientX - drag.startX;
        if (!drag.moved && Math.abs(distance) < 4) return;
        if (!drag.moved) event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.moved = true;
        event.preventDefault();
        event.currentTarget.classList.add("dragging");
        event.currentTarget.scrollLeft = drag.scrollLeft - distance;
    }

    function finishPointerDrag(event) {
        const drag = navDrag.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.moved) {
            if (suppressClick.current !== null) host.clearTimeout(suppressClick.current);
            suppressClick.current = host.setTimeout(() => { suppressClick.current = null; }, 0);
        }
        navDrag.current = null;
        event.currentTarget.classList.remove("dragging");
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }

    return {
        activeSection, register, contentRef, navRef, selectSection,
        navPointerHandlers: {
            onPointerDown: handlePointerDown, onPointerMove: handlePointerMove,
            onPointerUp: finishPointerDrag, onPointerCancel: finishPointerDrag,
        },
    };
}
