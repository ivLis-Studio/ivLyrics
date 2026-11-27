import { buildSettingsSearchCatalog } from "./settingsSearchCatalog.mjs";
import { useSettingsSearchIndex } from "./settingsSearchIndex.mjs";
import { buildSettingsSearchEntries, rankSettingsSearchEntries, SETTINGS_SEARCH_RESULT_LIMIT } from "./settingsSearchRanking.mjs";
import { renderSettingsSearchPanel } from "./renderSettingsSearchPanel.mjs";
import { getRecordingHotkeyControl } from "./settingsHotkeyControls.mjs";

// The query, panel visibility and highlighted result change on every key press
// and pointer move over the results. Only the search field subscribes to them,
// so typing re-renders the field instead of the whole settings window and its
// open menu (or, in the changed view, the registry of every changed menu).
function createSettingsSearchState() {
  let state = { query: "", panelOpen: true, activeIndex: 0 };
  const listeners = new Set();
  return {
    get: () => state,
    update(changes) {
      let next = state;
      for (const key of Object.keys(changes)) {
        const value = typeof changes[key] === "function" ? changes[key](next[key]) : changes[key];
        if (!Object.is(value, next[key])) next = { ...next, [key]: value };
      }
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Reads the current search state and re-renders only the calling component
// when it changes.
export function useSettingsSearchState(react, searchState) {
  const [, setRevision] = react.useState(0);
  const rendered = searchState.get();
  react.useEffect(() => {
    const rerender = () => setRevision((revision) => revision + 1);
    // A change between this render and the subscription still reaches the field.
    if (searchState.get() !== rendered) rerender();
    return searchState.subscribe(rerender);
  }, [searchState]);
  return rendered;
}

export function useSettingsModalSearch(react, {
  host, document, activeTab, changedView, settingsContentRef, interfaceLanguage,
  translate, getAllTranslations, getDeclaredSearchIndex,
  navigateToDestination, askAssistant, SettingsUiIcon, SettingsOutlineIcon,
}) {
  const searchInputRef = react.useRef(null);
  const searchBoxRef = react.useRef(null);
  const searchState = react.useMemo(createSettingsSearchState, []);
  const setSearchPanelOpen = (open) => searchState.update({ panelOpen: open });
  const setSearchActiveIndex = (index) => searchState.update({ activeIndex: index });

  // 검색어는 머리글 아래 결과 목록으로 보여 주고, 지금 보던 메뉴는 그대로 둔다.
  const handleSearchChange = (e) => {
    searchState.update({ query: e.target.value, panelOpen: true, activeIndex: 0 });
  };

  // 검색 지우기
  const handleClearSearch = () => {
    searchState.update({ query: "", activeIndex: 0 });
  };

  const searchableSettings = react.useMemo(() => buildSettingsSearchCatalog({ translate }), [interfaceLanguage]);

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
  // Ranked once per query and index, whichever of the field, the keyboard
  // handler or the panel asks first.
  const rankingRef = react.useRef(null);
  const readSearchResults = (query = searchState.get().query) => {
    const ranking = rankingRef.current;
    if (ranking?.query === query && ranking.entries === searchableSettingEntries) return ranking.results;
    const results = rankSettingsSearchEntries(query, searchableSettingEntries);
    rankingRef.current = { query, entries: searchableSettingEntries, results };
    return results;
  };

  // 검색 결과 패널 (머리글 검색 상자 아래)
  const getVisibleSearchResults = () => readSearchResults().slice(0, SETTINGS_SEARCH_RESULT_LIMIT);

  const pickSearchResult = (item) => {
    if (!item) return;
    setSearchPanelOpen(false);
    document?.activeElement?.blur?.();
    navigateToDestination(item.sectionKey, item.settingKey);
  };

  const askAssistantAbout = askAssistant ? (query) => {
    const question = String(query || "").trim();
    if (!question) return;
    searchState.update({ panelOpen: false, query: "", activeIndex: 0 });
    document?.activeElement?.blur?.();
    askAssistant(question);
  } : null;

  const handleSearchKeyDown = (event) => {
    const results = getVisibleSearchResults();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      searchState.update({
        panelOpen: true,
        activeIndex: (index) => Math.min(results.length - 1, Math.max(0, index + direction)),
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const { query, activeIndex: searchActiveIndex } = searchState.get();
      const activeIndex = Math.min(searchActiveIndex, results.length - 1);
      if (activeIndex >= 0) pickSearchResult(results[activeIndex]);
      // Nothing matched: ask the AI assistant instead.
      else askAssistantAbout?.(query);
    }
  };

  const renderSearchPanel = () => {
    const { query, panelOpen, activeIndex } = searchState.get();
    return renderSettingsSearchPanel(react, {
      searchQuery: query,
      searchPanelOpen: panelOpen,
      searchResults: readSearchResults(query),
      searchActiveIndex: activeIndex,
      translate,
      pickSearchResult,
      setSearchActiveIndex,
      askAssistant: askAssistantAbout,
      SettingsUiIcon,
      SettingsOutlineIcon,
    });
  };

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
    searchState, searchBoxRef, searchInputRef,
    searchableSettings, pickSearchResult,
    handleSearchChange, setSearchPanelOpen, handleSearchKeyDown, handleClearSearch, renderSearchPanel,
    // Current values, read when accessed.
    get searchQuery() { return searchState.get().query; },
    get searchPanelOpen() { return searchState.get().panelOpen; },
    get searchResults() { return readSearchResults(); },
  };
}
