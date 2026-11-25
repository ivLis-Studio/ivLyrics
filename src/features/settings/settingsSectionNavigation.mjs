import { useSettingsSignal } from "./settingsSignals.mjs";

function isSettingsTocNeeded(sections, content, toc, getComputedStyle) {
  if (!sections || sections.length < 2) return false;
  if (!content || !toc || content.clientHeight <= 0) return true;
  const rendered = Array.from(content.querySelectorAll(".tab-content.active .settings-section"))
    .filter((section) => !section.closest("[hidden]") && section.getClientRects().length > 0);
  if (rendered.length < 2) return false;
  // Ignore the page's trailing scroll padding. Removing the strip must not
  // change the decision, including when it alone pushed a short page over.
  const tocHeight = toc.hidden ? 0 : toc.offsetHeight + (parseFloat(getComputedStyle(toc).marginTop) || 0);
  const bottom = rendered[rendered.length - 1].getBoundingClientRect().bottom
    - content.getBoundingClientRect().top + content.scrollTop - tocHeight;
  return bottom > content.clientHeight + 1;
}

// Section tabs of a menu. A plain mouse wheel over the strip scrolls it
// sideways (eased for wheel notches, 1:1 for trackpads). A wheel gesture that
// was already scrolling the page keeps doing so, and one that scrolled the
// strip does not spill into the page when it reaches an end.
export function createSettingsSectionNavigation({
  react, document, host, requestFrame, cancelFrame, getTime, getComputedStyle, observeResize,
}) {
  const { useRef, useState, useEffect, useCallback } = react;

  return function SettingsToc({ sections, signal, onSelect, pageWheelRef, contentRef, label }) {
    const activeKey = useSettingsSignal(react, signal);
    const tocRef = useRef(null);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
      const content = contentRef?.current;
      const toc = tocRef.current;
      if (!content || !toc) return undefined;
      let frameId = null;
      const update = () => {
        frameId = null;
        const next = isSettingsTocNeeded(sections, content, toc, getComputedStyle);
        if (!next && toc.contains(document.activeElement)) content.focus({ preventScroll: true });
        setVisible(next);
      };
      const schedule = () => {
        if (frameId == null) frameId = requestFrame(update);
      };
      const observer = observeResize(schedule);
      observer?.observe(content);
      const page = content.querySelector(".settings-page");
      if (page) observer?.observe(page);
      host.addEventListener("resize", schedule);
      update();
      return () => {
        observer?.disconnect();
        host.removeEventListener("resize", schedule);
        if (frameId != null) cancelFrame(frameId);
      };
    }, [sections, contentRef]);

    const syncEdges = useCallback(() => {
      const toc = tocRef.current;
      if (!toc) return;
      const overflow = toc.scrollWidth > toc.clientWidth + 1;
      toc.classList.toggle("is-overflow", overflow);
      toc.classList.toggle("at-start", overflow && toc.scrollLeft <= 1);
      toc.classList.toggle("at-end", overflow && toc.scrollLeft + toc.clientWidth >= toc.scrollWidth - 1);
    }, []);

    useEffect(() => {
      const toc = tocRef.current;
      if (!toc) return undefined;
      const reducedMotion = host.matchMedia?.("(prefers-reduced-motion: reduce)");
      let wheelTarget = null;
      let wheelFrame = 0;
      let stripWheelAt = -1e9;
      const settle = () => {
        const difference = wheelTarget - toc.scrollLeft;
        if (Math.abs(difference) < 1) {
          toc.scrollLeft = wheelTarget;
          wheelTarget = null;
          wheelFrame = 0;
          return;
        }
        toc.scrollLeft += Math.sign(difference) * Math.max(1, Math.abs(difference) * 0.24);
        wheelFrame = requestFrame(settle);
      };
      const handleWheel = (event) => {
        if (event.ctrlKey) return;
        const max = toc.scrollWidth - toc.clientWidth;
        if (max <= 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        const now = getTime();
        if (now - (pageWheelRef?.current?.at ?? -1e9) < 320 && now - stripWheelAt > 320) return;
        const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? toc.clientWidth : 1;
        const delta = event.deltaY * unit;
        const from = wheelTarget === null ? toc.scrollLeft : wheelTarget;
        // At an end, a gesture that is still moving the strip stays on it.
        if ((delta < 0 && from <= 0) || (delta > 0 && from >= max - 1)) {
          if (now - stripWheelAt < 320) {
            event.preventDefault();
            stripWheelAt = now;
          }
          return;
        }
        event.preventDefault();
        stripWheelAt = now;
        if (Math.abs(delta) < 40 || reducedMotion?.matches) {
          if (wheelFrame) cancelFrame(wheelFrame);
          wheelFrame = 0;
          wheelTarget = null;
          toc.scrollLeft = Math.max(0, Math.min(max, toc.scrollLeft + delta));
          return;
        }
        wheelTarget = Math.max(0, Math.min(max, from + delta));
        if (!wheelFrame) wheelFrame = requestFrame(settle);
      };
      toc.addEventListener("scroll", syncEdges, { passive: true });
      toc.addEventListener("wheel", handleWheel, { passive: false });
      const resizeObserver = observeResize(syncEdges);
      resizeObserver?.observe(toc);
      syncEdges();
      return () => {
        toc.removeEventListener("scroll", syncEdges);
        toc.removeEventListener("wheel", handleWheel);
        resizeObserver?.disconnect();
        if (wheelFrame) cancelFrame(wheelFrame);
      };
    }, [syncEdges, pageWheelRef]);

    // Keep the current tab in view when the strip scrolls sideways.
    useEffect(() => {
      const toc = tocRef.current;
      if (!toc) return;
      syncEdges();
      const link = toc.querySelector(".settings-toc-item.is-active");
      if (!link || toc.scrollWidth <= toc.clientWidth + 1) return;
      const left = link.offsetLeft - toc.offsetLeft;
      const pad = 28;
      if (left - pad < toc.scrollLeft) {
        toc.scrollTo({ left: Math.max(0, left - pad), behavior: "smooth" });
      } else if (left + link.offsetWidth + pad > toc.scrollLeft + toc.clientWidth) {
        toc.scrollTo({ left: left + link.offsetWidth + pad - toc.clientWidth, behavior: "smooth" });
      }
    }, [activeKey, sections, visible, syncEdges]);

    return react.createElement(
      "nav",
      {
        className: "settings-toc", ref: tocRef, "aria-label": label,
        hidden: !visible,
        style: visible ? undefined : { display: "none" },
      },
      ...(sections || []).map((section) =>
        react.createElement(
          "button",
          {
            key: section.key,
            type: "button",
            className: `settings-toc-item${section.key === activeKey ? " is-active" : ""}`,
            "aria-current": section.key === activeKey ? "location" : undefined,
            onClick: () => onSelect(section.key),
          },
          section.label
        )
      )
    );
  };
}
