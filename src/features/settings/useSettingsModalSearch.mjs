import { buildSettingsSearchCatalog } from "./settingsSearchCatalog.mjs";
import { useSettingsSearchIndex } from "./settingsSearchIndex.mjs";
import { buildSettingsSearchEntries, rankSettingsSearchEntries, SETTINGS_SEARCH_RESULT_LIMIT } from "./settingsSearchRanking.mjs";
import { renderSettingsSearchPanel } from "./renderSettingsSearchPanel.mjs";
import { getRecordingHotkeyControl } from "./settingsHotkeyControls.mjs";

export function useSettingsModalSearch(react, {
  host, document, activeTab, changedView, settingsContentRef, interfaceLanguage,
  getPerformanceSettingsSections, getCdSettingsSections, getSettingsText,
  translate, getAllTranslations, getDeclaredSearchIndex,
  navigateToDestination, SettingsUiIcon, SettingsOutlineIcon,
}) {
  const searchInputRef = react.useRef(null);
  const searchBoxRef = react.useRef(null);
  const [searchQuery, setSearchQuery] = react.useState("");
  const [searchPanelOpen, setSearchPanelOpen] = react.useState(true);
  const [searchActiveIndex, setSearchActiveIndex] = react.useState(0);

  // 검색어는 머리글 아래 결과 목록으로 보여 주고, 지금 보던 메뉴는 그대로 둔다.
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSearchPanelOpen(true);
    setSearchActiveIndex(0);
  };

  // 검색 지우기
  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchActiveIndex(0);
  };

  const searchableSettings = react.useMemo(() => buildSettingsSearchCatalog({
    translate,
    getPerformanceSettingsSections,
    getSettingsText,
    getCdSettingsSections,
  }), [interfaceLanguage]);

  const discoveredSearchSettings = useSettingsSearchIndex(react, {
    host,
    activeTab,
    changedView,
    containerRef: settingsContentRef,
    searchableSettings,
    translate,
    getDeclaredSearchIndex,
  });

  const searchableSettingEntries = react.useMemo(
    () => buildSettingsSearchEntries(discoveredSearchSettings, getAllTranslations),
    [discoveredSearchSettings]
  );
  const searchResults = react.useMemo(
    () => rankSettingsSearchEntries(searchQuery, searchableSettingEntries),
    [searchQuery, searchableSettingEntries]
  );

  // 검색 결과 패널 (머리글 검색 상자 아래)
  const getVisibleSearchResults = () => searchResults.slice(0, SETTINGS_SEARCH_RESULT_LIMIT);

  const pickSearchResult = (item) => {
    if (!item) return;
    setSearchPanelOpen(false);
    document?.activeElement?.blur?.();
    navigateToDestination(item.sectionKey, item.settingKey);
  };

  const handleSearchKeyDown = (event) => {
    const results = getVisibleSearchResults();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      setSearchPanelOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSearchActiveIndex((index) =>
        Math.min(results.length - 1, Math.max(0, index + direction))
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const activeIndex = Math.min(searchActiveIndex, results.length - 1);
      if (activeIndex >= 0) pickSearchResult(results[activeIndex]);
    }
  };

  const renderSearchPanel = () => renderSettingsSearchPanel(react, {
    searchQuery,
    searchPanelOpen,
    searchResults,
    searchActiveIndex,
    translate,
    pickSearchResult,
    setSearchActiveIndex,
    SettingsUiIcon,
    SettingsOutlineIcon,
  });

  // ---- Keyboard: ⌘K / Ctrl K and "/" focus the search ----
  react.useEffect(() => {
    const handleShortcut = (event) => {
      const input = searchInputRef.current;
      if (!input || event.defaultPrevented || getRecordingHotkeyControl(event)) return;
      const key = String(event.key || "").toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "k") {
        event.preventDefault();
        event.stopPropagation();
        input.focus();
        input.select();
        setSearchPanelOpen(true);
        return;
      }
      const activeElement = document.activeElement;
      const typing = activeElement && (
        /^(input|textarea|select)$/i.test(activeElement.tagName) || activeElement.isContentEditable
      );
      if (key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing) {
        event.preventDefault();
        event.stopPropagation();
        input.focus();
      }
    };
    host.addEventListener("keydown", handleShortcut, true);
    return () => host.removeEventListener("keydown", handleShortcut, true);
  }, []);

  return {
    searchQuery, searchPanelOpen, searchBoxRef, searchInputRef,
    searchableSettings, searchResults, pickSearchResult,
    handleSearchChange, setSearchPanelOpen, handleSearchKeyDown, handleClearSearch, renderSearchPanel,
  };
}
