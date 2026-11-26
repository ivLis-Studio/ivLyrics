import { scheduleSettingsDestination } from "./settingsNavigationTarget.mjs";
import { useSettingsScrollNavigation } from "./useSettingsScrollNavigation.mjs";
import { useSettingsVisibleSections } from "./useSettingsVisibleSections.mjs";

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
  } = useSettingsScrollNavigation(react, {
    prefersReducedMotion,
    scheduleTimeout: (callback, delay) => host.setTimeout(callback, delay),
    cancelTimeout: timer => host.clearTimeout(timer),
  });

  const pinnedSectionRef = react.useRef(null);
  const pageWheelRef = react.useRef({ at: -1e9 });
  const activeSectionSignal = react.useMemo(() => createSettingsSignal(null), []);

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
      requestFrame: callback => host.requestAnimationFrame(callback),
      cancelFrame: id => host.cancelAnimationFrame(id),
      finish() {
        if (isCurrent()) pendingNavigationRef.current = null;
      },
    });
  }, [activeTab, changedView, navigationRevision, scrollToTarget]);

  react.useEffect(() => disposeScrollNavigation, [disposeScrollNavigation]);

  const activeSections = useSettingsVisibleSections(react, {
    host, activeTab, changedView, fullscreenView,
    settingsContentRef, pageHeadRef, isProgrammaticScrollRef,
    activeSectionSignal, pinnedSectionRef, pageWheelRef,
  });

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

  return {
    activeTab, changedView, fullscreenView,
    settingsContentRef, pageHeadRef, pendingNavigationRef, pageWheelRef,
    activeSections, activeSectionSignal,
    navigateToDestination, openMenu, toggleChangedView, selectSection, selectFullscreenView,
  };
}
