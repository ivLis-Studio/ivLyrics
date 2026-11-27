import { SETTINGS_SEARCH_RESULT_LIMIT } from "./settingsSearchRanking.mjs";

// 텍스트 하이라이트 헬퍼 함수. The query's pattern is built once per panel
// render and shared by every result name and description.
function createSearchHighlighter(react, query) {
  const unchanged = (text) => text;
  if (!query.trim()) return unchanged;

  const tokens = [...new Set(
    query
      .normalize("NFKC")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  )].sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return unchanged;

  const escapedTokens = tokens.map((token) =>
    token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const tokenPattern = new RegExp(`(${escapedTokens.join("|")})`, "giu");
  const normalizedTokens = new Set(tokens.map((token) => token.toLocaleLowerCase()));

  return (text) => text ? react.createElement(
    react.Fragment,
    null,
    ...String(text).split(tokenPattern).map((part, index) =>
      normalizedTokens.has(part.normalize("NFKC").toLocaleLowerCase())
        ? react.createElement("mark", { key: index, className: "search-highlight" }, part)
        : part
    )
  ) : text;
}

export function renderSettingsSearchPanel(react, {
  searchQuery, searchPanelOpen, searchResults, searchActiveIndex,
  translate, pickSearchResult, setSearchActiveIndex, askAssistant, SettingsUiIcon, SettingsOutlineIcon,
}) {
  if (!searchQuery.trim() || !searchPanelOpen) {
    return null;
  }

  // Questions in plain words ("how do I hide the controller?") rarely match a
  // setting name; the last row hands the query to the AI settings assistant.
  const askRow = askAssistant ? react.createElement(
    "div",
    { className: "settings-search-ask-row" },
    react.createElement(
      "button",
      {
        type: "button",
        className: "settings-search-result settings-search-ask",
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => askAssistant(searchQuery),
      },
      react.createElement(
        "span",
        { className: "settings-search-result-icon", "aria-hidden": "true" },
        react.createElement(SettingsOutlineIcon, { name: "assistant", size: 15 })
      ),
      react.createElement(
        "span",
        { className: "settings-search-result-main" },
        react.createElement("b", null, translate("settingsUi.assistant.askAi") || "Ask the AI assistant"),
        react.createElement("small", null, searchQuery.trim())
      )
    )
  ) : null;

  const results = searchResults.slice(0, SETTINGS_SEARCH_RESULT_LIMIT);
  const activeIndex = Math.min(searchActiveIndex, Math.max(0, results.length - 1));
  const meta = react.createElement(
    "div",
    { className: "settings-search-meta" },
    react.createElement(
      "span",
      { className: "search-results-count" },
      translate("search.resultCount").replace("{count}", searchResults.length)
    ),
    react.createElement("span", { "aria-hidden": "true" }, "↑↓ · Enter · Esc")
  );

  if (results.length === 0) {
    return react.createElement(
      "div",
      { className: "settings-search-panel", role: "listbox", "aria-label": translate("search.placeholder") },
      meta,
      react.createElement(
        "div",
        { className: "search-no-results" },
        react.createElement(SettingsUiIcon, { name: "search", size: 20, className: "search-no-results-icon" }),
        react.createElement("h3", { className: "search-no-results-title" }, translate("search.noResults")),
        react.createElement("p", { className: "search-no-results-desc" }, translate("search.noResultsDesc"))
      ),
      askRow
    );
  }

  // 번역명이 같아도 섞이지 않도록 실제 탭 ID 기준으로 그룹화한다.
  const groups = [];
  const groupByKey = new Map();
  results.forEach((result, index) => {
    const groupKey = result.sectionKey || result.section;
    if (!groupByKey.has(groupKey)) {
      const group = { key: groupKey, section: result.section, items: [] };
      groupByKey.set(groupKey, group);
      groups.push(group);
    }
    groupByKey.get(groupKey).items.push({ result, index });
  });
  const highlight = createSearchHighlighter(react, searchQuery);

  return react.createElement(
    "div",
    {
      className: "settings-search-panel",
      role: "listbox",
      "aria-label": translate("search.placeholder"),
    },
    meta,
    react.createElement(
      "div",
      { className: "settings-search-list" },
      ...groups.map((group) =>
        react.createElement(
          "div",
          { key: group.key, className: "search-result-group", role: "group", "aria-label": group.section },
          react.createElement("div", { className: "settings-search-group-label" }, group.section),
          ...group.items.map(({ result, index }) => {
            const context = result.sectionLabel || result.desc || "";
            return react.createElement(
              "button",
              {
                key: result.resultKey,
                type: "button",
                role: "option",
                "aria-selected": index === activeIndex,
                className: `settings-search-result search-result-item${index === activeIndex ? " is-active" : ""}`,
                onMouseDown: (event) => event.preventDefault(),
                onMouseMove: () => {
                  if (index !== activeIndex) setSearchActiveIndex(index);
                },
                onClick: () => pickSearchResult(result),
              },
              react.createElement(
                "span",
                { className: "settings-search-result-icon", "aria-hidden": "true" },
                react.createElement(SettingsOutlineIcon, { name: result.sectionKey, size: 15 })
              ),
              react.createElement(
                "span",
                { className: "settings-search-result-main" },
                react.createElement("b", null, highlight(result.name)),
                context
                  ? react.createElement("small", null, highlight(context))
                  : null
              )
            );
          })
        )
      ),
      askRow
    )
  );
}
