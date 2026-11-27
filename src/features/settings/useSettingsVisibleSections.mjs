function readVisibleSections(container) {
  const tab = container.querySelector(".tab-content.active");
  const seen = new Set();
  const sections = [];
  for (const element of tab?.querySelectorAll(".settings-section") ?? []) {
    if (element.closest("[hidden]") || element.getClientRects().length === 0) continue;
    const key = element.getAttribute("data-section-key");
    const label = element.querySelector(":scope > .section-title h3")?.textContent?.trim();
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    sections.push({ key, label, element });
  }
  return sections;
}

export function useSettingsVisibleSections(react, {
  host, activeTab, changedView, fullscreenView,
  settingsContentRef, pageHeadRef, isProgrammaticScrollRef,
  activeSectionSignal, pinnedSectionRef, pageWheelRef,
}) {
  const [sectionsByTab, setSectionsByTab] = react.useState({});

  react.useEffect(() => {
    const container = settingsContentRef.current;
    if (!container || changedView) return undefined;

    let sections = [];
    let layoutDirty = true;
    let frameId = null;
    let settleTimer = null;
    let disposed = false;

    const update = () => {
      frameId = null;
      if (disposed) return;

      if (layoutDirty) {
        layoutDirty = false;
        sections = readVisibleSections(container);
        const items = sections.map(({ key, label }) => ({ key, label }));
        setSectionsByTab(previous => {
          const before = previous[activeTab];
          if (before?.length === items.length
            && before.every(({ key, label }, index) => key === items[index].key && label === items[index].label)) {
            return previous;
          }
          return { ...previous, [activeTab]: items };
        });
      }

      const head = pageHeadRef.current;
      if (isProgrammaticScrollRef.current) return;
      if (sections.length === 0) {
        activeSectionSignal.set(null);
        return;
      }

      const pinnedKey = pinnedSectionRef.current;
      const pinned = pinnedKey && sections.find(section => section.key === pinnedKey);
      if (pinned) {
        activeSectionSignal.set(pinned.key);
        return;
      }
      const scrollTop = container.scrollTop;
      if (scrollTop > 4 && scrollTop + container.clientHeight >= container.scrollHeight - 4) {
        activeSectionSignal.set(sections.at(-1).key);
        return;
      }
      const anchor = container.getBoundingClientRect().top + (head?.getBoundingClientRect().height ?? 0) + 56;
      let active = sections[0];
      for (const section of sections) {
        if (section.element.getBoundingClientRect().top > anchor) break;
        active = section;
      }
      activeSectionSignal.set(active.key);
    };

    const schedule = () => {
      if (!disposed && frameId === null) frameId = host.requestAnimationFrame(update);
    };
    const invalidateLayout = () => {
      layoutDirty = true;
      schedule();
    };
    const handleScrollEnd = () => {
      host.clearTimeout(settleTimer);
      settleTimer = host.setTimeout(schedule, 320);
    };
    // A section click can pin the last section even on a short settings page.
    const unpin = (event) => {
      if (event.target?.closest?.(".settings-toc")) return;
      if (event.type === "wheel") pageWheelRef.current.at = host.performance.now();
      if (!pinnedSectionRef.current) return;
      if (event.type === "keydown" && !/^(Arrow|Page|Home|End| )/.test(event.key)) return;
      pinnedSectionRef.current = null;
      schedule();
    };

    const observer = new host.MutationObserver(invalidateLayout);
    // Fullscreen sections toggle hidden in place, and labels can change
    // without being remounted.
    observer.observe(container, { childList: true, subtree: true, characterData: true, attributeFilter: ["hidden"] });
    container.addEventListener("scroll", schedule, { passive: true });
    container.addEventListener("scrollend", handleScrollEnd, { passive: true });
    container.addEventListener("wheel", unpin, { passive: true });
    container.addEventListener("touchstart", unpin, { passive: true });
    container.addEventListener("keydown", unpin);
    host.addEventListener("resize", invalidateLayout);
    schedule();

    return () => {
      disposed = true;
      observer.disconnect();
      container.removeEventListener("scroll", schedule);
      container.removeEventListener("scrollend", handleScrollEnd);
      container.removeEventListener("wheel", unpin);
      container.removeEventListener("touchstart", unpin);
      container.removeEventListener("keydown", unpin);
      host.removeEventListener("resize", invalidateLayout);
      if (settleTimer != null) host.clearTimeout(settleTimer);
      if (frameId != null) host.cancelAnimationFrame(frameId);
    };
  }, [host, activeTab, changedView, fullscreenView, settingsContentRef, pageHeadRef,
    isProgrammaticScrollRef, activeSectionSignal, pinnedSectionRef, pageWheelRef]);

  return changedView ? [] : sectionsByTab[activeTab] || [];
}
