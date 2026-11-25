import { scheduleSettingsDestination } from "./settingsNavigationTarget.mjs";
import { useSettingsScrollNavigation } from "./useSettingsScrollNavigation.mjs";

// A tiny observable for values that change while scrolling (active section,
// current menu). Components subscribe to it so the settings tree itself does
// not re-render on every scroll-spy update.
const createSettingsSignal = (initialValue) => {
  let currentValue = initialValue;
  const listeners = new Set();
  return {
    get: () => currentValue,
    set: (nextValue) => {
      if (Object.is(nextValue, currentValue)) return;
      currentValue = nextValue;
      listeners.forEach((listener) => {
        try {
          listener(currentValue);
        } catch (error) {
          console.error(error);
        }
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export function useSettingsTabNavigation(react, {
  host, initialTab, initialSettingKey, prefersReducedMotion,
  getCanonicalSettingsDestination, isCdSettingsKey,
}) {
  const [activeTab, setActiveTab] = react.useState(initialTab || "general");
  const [changedView, setChangedView] = react.useState(false);
  const {
    settingsContentRef, pageHeadRef, isProgrammaticScrollRef, scrollToSetting, scrollToTarget, disposeScrollNavigation,
  } = useSettingsScrollNavigation(react, { prefersReducedMotion });

  const pinnedSectionRef = react.useRef(null);
  const pageWheelRef = react.useRef({ at: -1e9 });
  const activeSectionSignal = react.useMemo(() => createSettingsSignal(null), []);
  const [sectionsByTab, setSectionsByTab] = react.useState({});

  const pendingNavigationRef = react.useRef(initialSettingKey ? {
    tabId: initialTab || "general", changedView: false, settingKey: initialSettingKey,
  } : null);
  const scrollMemoryRef = react.useRef(new Map());
  const [fullscreenView, setFullscreenView] = react.useState(() => isCdSettingsKey(initialSettingKey) ? "cd" : "basic");
  const [navigationRevision, setNavigationRevision] = react.useState(0);

  react.useEffect(() => {
    const destination = pendingNavigationRef.current;
    if (!destination || destination.tabId !== activeTab || destination.changedView !== changedView) return;
    const isCurrent = () => pendingNavigationRef.current === destination;
    return scheduleSettingsDestination({
      destination, isCurrent,
      readContainer: () => settingsContentRef.current,
      selectFullscreenView: setFullscreenView,
      revealSetting: key => host.dispatchEvent(new CustomEvent("ivLyrics:settings-reveal", { detail: { key } })),
      scrollToTarget,
      requestFrame: callback => requestAnimationFrame(callback),
      cancelFrame: id => cancelAnimationFrame(id),
      finish() {
        if (isCurrent()) pendingNavigationRef.current = null;
      },
    });
  }, [activeTab, changedView, navigationRevision, scrollToTarget]);

  react.useEffect(() => disposeScrollNavigation, [disposeScrollNavigation]);

  // ---- Section tabs: discovered from the rendered sections, so provider
  // components and sections emptied by their conditions stay in step. ----
  react.useEffect(() => {
    const container = settingsContentRef.current;
    if (!container || changedView) return undefined;

    let frameId = null;
    const discover = () => {
      frameId = null;
      const tabNode = container.querySelector(".tab-content.active");
      if (!tabNode) return;
      const seen = new Set();
      const sections = Array.from(tabNode.querySelectorAll(".settings-section"))
        .map((sectionElement) => {
          if (sectionElement.closest("[hidden]") || sectionElement.getClientRects().length === 0) return null;
          const key = sectionElement.getAttribute("data-section-key");
          const label = sectionElement.querySelector(":scope > .section-title h3")?.textContent?.trim();
          if (!key || !label || seen.has(key)) return null;
          seen.add(key);
          return { key, label };
        })
        .filter(Boolean);
      setSectionsByTab((previous) => {
        const before = previous[activeTab];
        if (
          before
          && before.length === sections.length
          && before.every((section, index) =>
            section.key === sections[index].key && section.label === sections[index].label)
        ) {
          return previous;
        }
        return { ...previous, [activeTab]: sections };
      });
    };
    const schedule = () => {
      if (frameId == null) frameId = requestAnimationFrame(discover);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab, changedView, fullscreenView]);

  const activeSections = changedView ? [] : sectionsByTab[activeTab] || [];

  // ---- Navigation (rail, search, changed view, section links) ----
  const rememberScroll = () => {
    const container = settingsContentRef.current;
    if (!container) return;
    scrollMemoryRef.current.set(changedView ? "changed" : activeTab, container.scrollTop);
  };

  function queueNavigation(destination) {
    pendingNavigationRef.current = destination;
    disposeScrollNavigation();
    setNavigationRevision(revision => revision + 1);
  }

  const navigateToDestination = react.useCallback(
    (tabId, settingKey) => {
      const destination = getCanonicalSettingsDestination(tabId, settingKey);
      rememberScroll();
      pinnedSectionRef.current = null;
      const changesMenu = destination.tabId !== activeTab || changedView;
      const needsScroll = destination.settingKey || changesMenu;
      queueNavigation(needsScroll ? {
        ...destination,
        changedView: false,
        top: scrollMemoryRef.current.get(destination.tabId) ?? 0,
      } : null);
      setChangedView(false);
      // Conditional CD inputs may have no anchor until their option is enabled.
      if (destination.tabId === "fullscreen" && isCdSettingsKey(destination.settingKey)) {
        setFullscreenView("cd");
      }
      if (changesMenu) setActiveTab(destination.tabId);
    },
    [activeTab, changedView, disposeScrollNavigation]
  );

  const openMenu = (tabId) => {
    if (tabId === activeTab && !changedView) return;
    navigateToDestination(tabId, null);
  };

  const toggleChangedView = () => {
    rememberScroll();
    pinnedSectionRef.current = null;
    const nextChangedView = !changedView;
    queueNavigation({
      tabId: activeTab,
      changedView: nextChangedView,
      top: scrollMemoryRef.current.get(nextChangedView ? "changed" : activeTab) ?? 0,
    });
    setChangedView(nextChangedView);
  };

  const selectSection = (sectionKey) => {
    pendingNavigationRef.current = null;
    pinnedSectionRef.current = sectionKey;
    activeSectionSignal.set(sectionKey);
    scrollToSetting(sectionKey, { highlight: false });
  };

  const selectFullscreenView = (view) => {
    if (view === fullscreenView) return;
    pendingNavigationRef.current = null;
    disposeScrollNavigation();
    pinnedSectionRef.current = null;
    setFullscreenView(view);
    settingsContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  // ---- Scroll-spy: highlights the section tab and the breadcrumb ----
  react.useEffect(() => {
    const container = settingsContentRef.current;
    if (!container || changedView) return undefined;

    let frameId = null;
    let settleTimer = null;
    const update = () => {
      frameId = null;
      const head = pageHeadRef.current;
      head?.classList.toggle("is-stuck", container.scrollTop > 4);
      if (isProgrammaticScrollRef.current) return;
      const sections = Array.from(container.querySelectorAll(".tab-content.active .settings-section"))
        .filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
      if (!sections.length) {
        activeSectionSignal.set(null);
        return;
      }
      const containerTop = container.getBoundingClientRect().top;
      const anchorLine = containerTop + (head ? head.getBoundingClientRect().height : 0) + 56;
      let active = sections[0];
      for (const element of sections) {
        if (element.getBoundingClientRect().top <= anchorLine) active = element;
        else break;
      }
      if (
        container.scrollTop > 4
        && container.scrollTop + container.clientHeight >= container.scrollHeight - 4
      ) {
        active = sections[sections.length - 1];
      }
      const pinned = pinnedSectionRef.current;
      if (pinned) {
        active = sections.find((element) => element.getAttribute("data-section-key") === pinned) || active;
      }
      activeSectionSignal.set(active.getAttribute("data-section-key"));
    };
    const schedule = () => {
      if (frameId == null) frameId = requestAnimationFrame(update);
    };
    const handleScrollEnd = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, 320);
    };
    // A tab click pins its section (short pages cannot scroll it to the top)
    // until the reader scrolls by hand.
    const unpin = (event) => {
      if (event?.type === "wheel" && !event.target?.closest?.(".settings-toc")) {
        pageWheelRef.current.at = performance.now();
      }
      if (event?.target?.closest?.(".settings-toc")) return;
      if (!pinnedSectionRef.current) return;
      if (event?.type === "keydown" && !/^(Arrow|Page|Home|End| )/.test(event.key)) return;
      pinnedSectionRef.current = null;
      schedule();
    };
    container.addEventListener("scroll", schedule, { passive: true });
    container.addEventListener("scrollend", handleScrollEnd, { passive: true });
    container.addEventListener("wheel", unpin, { passive: true });
    container.addEventListener("touchstart", unpin, { passive: true });
    container.addEventListener("keydown", unpin);
    host.addEventListener("resize", schedule);
    schedule();

    return () => {
      container.removeEventListener("scroll", schedule);
      container.removeEventListener("scrollend", handleScrollEnd);
      container.removeEventListener("wheel", unpin);
      container.removeEventListener("touchstart", unpin);
      container.removeEventListener("keydown", unpin);
      host.removeEventListener("resize", schedule);
      clearTimeout(settleTimer);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab, changedView, fullscreenView, sectionsByTab]);

  return {
    activeTab, changedView, fullscreenView,
    settingsContentRef, pageHeadRef, pendingNavigationRef, pageWheelRef,
    activeSections, activeSectionSignal,
    navigateToDestination, openMenu, toggleChangedView, selectSection, selectFullscreenView,
  };
}
