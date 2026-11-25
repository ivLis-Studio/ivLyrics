import { findSettingsTarget } from "./settingsNavigationTarget.mjs";

export function useSettingsScrollNavigation(react, {
  prefersReducedMotion,
  scheduleTimeout = (callback, delay) => window.setTimeout(callback, delay),
  cancelTimeout = timer => clearTimeout(timer),
}) {
  const settingsContentRef = react.useRef(null);
  const pageHeadRef = react.useRef(null);
  const isProgrammaticScrollRef = react.useRef(false);
  const programmaticScrollTimerRef = react.useRef(null);
  const programmaticScrollEndCleanupRef = react.useRef(null);
  const highlightTimeoutRef = react.useRef(null);
  const highlightedSettingRef = react.useRef(null);

  const clearSettingHighlight = react.useCallback(() => {
    if (highlightTimeoutRef.current !== null) cancelTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = null;
    highlightedSettingRef.current?.classList.remove("setting-highlight-flash");
    highlightedSettingRef.current = null;
  }, []);

  const holdProgrammaticScroll = react.useCallback((delay = 1400) => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      cancelTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = scheduleTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticScrollTimerRef.current = null;
    }, delay);
  }, []);

  /**
   * Scroll the settings-content container so that the element with
   * the given data-setting-key appears right below the sticky page head.
   * Uses container.scrollTo() instead of scrollIntoView() to avoid
   * accidentally scrolling parent containers (Spotify shell, etc.).
   */
  const scrollToTarget = react.useCallback(
    (targetElement, { behavior = "smooth", highlight = true } = {}) => {
      if (!targetElement || targetElement.closest?.("[hidden]")) return false;
      if (behavior === "smooth" && prefersReducedMotion()) behavior = "auto";

      const container = settingsContentRef.current;
      if (!container) return false;

      // Keep scroll-spy locked while the smooth scroll is in flight. The
      // browser's scrollend event releases it; the timer is only a fallback.
      holdProgrammaticScroll(behavior === "smooth" ? 1800 : 120);

      if (programmaticScrollEndCleanupRef.current) {
        programmaticScrollEndCleanupRef.current();
        programmaticScrollEndCleanupRef.current = null;
      }

      if (behavior === "smooth") {
        const handleScrollEnd = () => {
          programmaticScrollEndCleanupRef.current = null;
          // Keep the clicked destination stable through the browser's final
          // layout/scrollbar update before returning control to scroll-spy.
          holdProgrammaticScroll(260);
        };
        const cleanupScrollEnd = () => {
          container.removeEventListener("scrollend", handleScrollEnd);
        };
        programmaticScrollEndCleanupRef.current = cleanupScrollEnd;
        container.addEventListener("scrollend", handleScrollEnd, { once: true });
      }

      // Calculate target position relative to the scroll container; the
      // sticky page head (title + section tabs) covers the top of it.
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      const stickyHeadOffset = pageHeadRef.current?.getBoundingClientRect?.().height || 0;
      const scrollTop =
        container.scrollTop
        + (targetRect.top - containerRect.top)
        - stickyHeadOffset
        - 12;

      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior,
      });

      clearSettingHighlight();
      if (highlight) {
        targetElement.classList.add("setting-highlight-flash");
        highlightedSettingRef.current = targetElement;
        highlightTimeoutRef.current = scheduleTimeout(clearSettingHighlight, 1800);
      }

      return true;
    },
    [holdProgrammaticScroll, clearSettingHighlight]
  );

  const scrollToSetting = react.useCallback(
    (settingKey, options) => !!settingKey && scrollToTarget(findSettingsTarget(settingsContentRef.current, settingKey), options),
    [scrollToTarget]
  );

  const disposeScrollNavigation = react.useCallback(() => {
    if (programmaticScrollTimerRef.current) {
      cancelTimeout(programmaticScrollTimerRef.current);
      programmaticScrollTimerRef.current = null;
    }
    if (programmaticScrollEndCleanupRef.current) {
      programmaticScrollEndCleanupRef.current();
      programmaticScrollEndCleanupRef.current = null;
    }
    clearSettingHighlight();
    isProgrammaticScrollRef.current = false;
  }, [clearSettingHighlight]);

  return {
    settingsContentRef,
    pageHeadRef,
    isProgrammaticScrollRef,
    scrollToSetting,
    scrollToTarget,
    clearSettingHighlight,
    disposeScrollNavigation,
  };
}

