import assert from "node:assert/strict";
import test from "node:test";
import { useSettingsModalSearch } from "../src/features/settings/useSettingsModalSearch.mjs";
import { createSettingsSearchField } from "../src/features/settings/settingsModalChrome.mjs";
import { renderSettingsSearchPanel } from "../src/features/settings/renderSettingsSearchPanel.mjs";

// The settings window keeps the search query, panel visibility and highlighted
// result outside its own state. A key press, an arrow key or a pointer move over
// the results re-renders the search field only, not the open menu (or, in the
// changed view, the registry of every changed menu).

function createHookRuntime() {
  const slots = [];
  const effects = [];
  const calls = { setState: 0 };
  let cursor = 0;
  const useMemo = (factory, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[index] = { value: factory(), deps };
    }
    return slots[index].value;
  };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: Symbol.for("Fragment"),
    useMemo,
    useRef: (current) => useMemo(() => ({ current }), []),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => {
        calls.setState++;
        slots[index] = typeof next === "function" ? next(slots[index]) : next;
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && deps && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      const record = { deps, cleanup: previous?.cleanup };
      slots[index] = record;
      effects.push(() => {
        record.cleanup?.();
        record.cleanup = effect();
      });
    },
  };
  return {
    react, calls,
    render(component) { cursor = 0; return component(); },
    runEffects() { for (const effect of effects.splice(0)) effect(); },
  };
}

const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node && typeof node === "object" && "type" in node ? [node, ...elements(node.props.children)] : [];

const SettingsUiIcon = function SettingsUiIcon() {};
const SettingsOutlineIcon = function SettingsOutlineIcon() {};
const translate = (key) => key;

function createSearch() {
  const parent = createHookRuntime();
  const navigations = [];
  const questions = [];
  const options = {
    host: {
      addEventListener() {}, removeEventListener() {},
      requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
      MutationObserver: class { observe() {} disconnect() {} },
    },
    document: { activeElement: null },
    activeTab: "general", changedView: false, interfaceLanguage: "en",
    settingsContentRef: { current: { querySelectorAll: () => [] } },
    translate, getAllTranslations: () => [],
    getDeclaredSearchIndex: () => ({ entries: [], routing: new Map() }),
    navigateToDestination: (...destination) => navigations.push(destination),
    askAssistant: (question) => questions.push(question),
    SettingsUiIcon, SettingsOutlineIcon,
  };
  const renderParent = () => parent.render(() => useSettingsModalSearch(parent.react, options));
  renderParent();
  parent.runEffects(); // the search index scan (a legitimate window update)
  let search = renderParent();

  const field = createHookRuntime();
  const SettingsSearchField = createSettingsSearchField(field.react);
  const renderField = () => field.render(() => SettingsSearchField({ search, translate, SettingsUiIcon }));
  renderField();
  field.runEffects(); // subscribe
  parent.calls.setState = 0;
  field.calls.setState = 0;
  return {
    parent, field, navigations, questions, renderField,
    get search() { return search; },
    rerenderParent() { search = renderParent(); return search; },
  };
}

const inputOf = (tree) => elements(tree).find((node) => node.props.className === "settings-search-input");
const resultsOf = (tree) => elements(tree).filter((node) => node.props.role === "option");
// Results are grouped by menu, so read the selection by result key.
const selectedKey = (tree) => resultsOf(tree).filter((node) => node.props["aria-selected"]).map((node) => node.props.key);

test("typing, hovering a result and arrow keys re-render the search field only", () => {
  const h = createSearch();
  inputOf(h.renderField()).props.onChange({ target: { value: "settings" } });
  assert.equal(h.parent.calls.setState, 0, "typing does not update the settings window");
  assert.equal(h.field.calls.setState, 1, "the search field renders the new query");

  const tree = h.renderField();
  const results = resultsOf(tree);
  assert.ok(results.length > 1, "the query has results to move between");
  assert.deepEqual(selectedKey(tree), [h.search.searchResults[0].resultKey]);
  results[1].props.onMouseMove();
  assert.equal(h.parent.calls.setState, 0, "hovering a result does not update the settings window");
  assert.equal(h.field.calls.setState, 2);
  assert.deepEqual(selectedKey(h.renderField()), [results[1].props.key]);

  const hovered = h.search.searchResults.findIndex((result) => result.resultKey === results[1].props.key);
  inputOf(h.renderField()).props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(h.parent.calls.setState, 0, "arrow keys do not update the settings window");
  assert.equal(h.field.calls.setState, 3);
  assert.deepEqual(selectedKey(h.renderField()), [h.search.searchResults[hovered + 1].resultKey]);

  // The hook API still reports the live values to its callers.
  assert.equal(h.search.searchQuery, "settings");
  assert.equal(h.search.searchPanelOpen, true);
  assert.ok(h.search.searchResults.length >= results.length);
  assert.strictEqual(h.search.searchResults, h.search.searchResults, "one ranking per query");

  const picked = h.search.searchResults[hovered + 1];
  inputOf(h.renderField()).props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.deepEqual(h.navigations, [[picked.sectionKey, picked.settingKey]]);
  assert.equal(h.search.searchPanelOpen, false);
  assert.equal(h.parent.calls.setState, 0);
});

test("a query without results is handed to the assistant and the field is cleared", () => {
  const h = createSearch();
  inputOf(h.renderField()).props.onChange({ target: { value: "zzzz-nothing-matches" } });
  assert.equal(h.search.searchResults.length, 0);
  inputOf(h.renderField()).props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.deepEqual(h.questions, ["zzzz-nothing-matches"]);
  assert.equal(h.search.searchQuery, "");
  assert.equal(h.search.searchPanelOpen, false);
  assert.equal(inputOf(h.renderField()).props.value, "");
  assert.equal(h.parent.calls.setState, 0);
});

test("a change between the field's render and its subscription still reaches it", () => {
  const h = createSearch();
  const field = createHookRuntime();
  const SettingsSearchField = createSettingsSearchField(field.react);
  field.render(() => SettingsSearchField({ search: h.search, translate, SettingsUiIcon }));
  h.search.handleSearchChange({ target: { value: "lyrics" } });
  field.runEffects();
  assert.equal(field.calls.setState, 1);
});

// The markup the header rendered inline before the field became a component.
function legacySearchBox(react, search, SettingsUiIcon) {
  const { searchQuery, searchPanelOpen, searchBoxRef, searchInputRef,
    handleSearchChange, setSearchPanelOpen, handleSearchKeyDown, handleClearSearch, renderSearchPanel } = search;
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
  const searchLabel = translate("search.placeholder");
  const searchExpanded = Boolean(searchQuery.trim() && searchPanelOpen);
  return react.createElement(
    "div",
    { className: `settings-search settings-search-wrapper${searchQuery ? " has-query" : ""}`, role: "search", ref: searchBoxRef },
    react.createElement(SettingsUiIcon, { name: "search", size: 16, className: "settings-search-icon" }),
    react.createElement("input", {
      ref: searchInputRef, type: "search", className: "settings-search-input",
      placeholder: searchLabel, "aria-label": searchLabel, "aria-expanded": searchExpanded,
      autoComplete: "off", spellCheck: false, value: searchQuery,
      onChange: handleSearchChange, onFocus: () => setSearchPanelOpen(true), onKeyDown: handleSearchKeyDown,
    }),
    searchQuery && react.createElement(
      "button",
      {
        className: "settings-search-clear", type: "button",
        onClick: () => { handleClearSearch(); searchInputRef.current?.focus(); },
        title: translate("search.clear"), "aria-label": translate("search.clear"),
      },
      react.createElement(SettingsUiIcon, { name: "close", size: 14 })
    ),
    react.createElement("kbd", { className: "settings-kbd", "aria-hidden": "true" }, isMac ? "⌘K" : "Ctrl K"),
    renderSearchPanel()
  );
}

// Same element types, props, refs and handlers; inline closures are compared
// by behavior below, since a new closure is created on every render anyway.
function assertSameTree(actual, expected, path = "root") {
  if (typeof expected === "function") {
    assert.equal(typeof actual, "function", path);
    if (expected.name && !/^on[A-Z]/.test(path.split(".").at(-1))) assert.strictEqual(actual, expected, path);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.equal(actual.length, expected.length, path);
    expected.forEach((item, index) => assertSameTree(actual[index], item, `${path}[${index}]`));
    return;
  }
  if (expected && typeof expected === "object") {
    if ("current" in expected && Object.keys(expected).length === 1) {
      assert.strictEqual(actual, expected, path);
      return;
    }
    assert.ok(actual && typeof actual === "object", path);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) assertSameTree(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.strictEqual(actual, expected, path);
}

test("the search field renders the header's former inline markup in every state", () => {
  const h = createSearch();
  const states = [
    () => {},
    () => h.search.handleSearchChange({ target: { value: "settings" } }),
    () => h.search.setSearchPanelOpen(false),
    () => h.search.setSearchPanelOpen(true),
    () => h.search.handleSearchChange({ target: { value: "zzzz-nothing-matches" } }),
    () => h.search.handleClearSearch(),
  ];
  for (const apply of states) {
    apply();
    assertSameTree(h.renderField(), legacySearchBox(h.field.react, h.search, SettingsUiIcon));
  }
  // The inline handlers keep their behavior.
  h.search.handleSearchChange({ target: { value: "settings" } });
  h.search.setSearchPanelOpen(false);
  const tree = h.renderField();
  inputOf(tree).props.onFocus();
  assert.equal(h.search.searchPanelOpen, true);
  const focused = [];
  h.search.searchInputRef.current = { focus: () => focused.push(true) };
  elements(tree).find((node) => node.props.className === "settings-search-clear").props.onClick();
  assert.equal(h.search.searchQuery, "");
  assert.deepEqual(focused, [true]);
});

// The former highlighter, rebuilt for every result name and description.
function legacyHighlightText(react, text, query) {
  if (!query.trim() || !text) return text;
  const tokens = [...new Set(query.normalize("NFKC").trim().split(/\s+/).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return text;
  const escapedTokens = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const tokenPattern = new RegExp(`(${escapedTokens.join("|")})`, "giu");
  const normalizedTokens = new Set(tokens.map((token) => token.toLocaleLowerCase()));
  return react.createElement(react.Fragment, null, ...String(text).split(tokenPattern).map((part, index) =>
    normalizedTokens.has(part.normalize("NFKC").toLocaleLowerCase())
      ? react.createElement("mark", { key: index, className: "search-highlight" }, part)
      : part));
}

test("search highlighting is unchanged and builds one pattern per panel render", () => {
  const react = createHookRuntime().react;
  const results = [
    { resultKey: "a", sectionKey: "general", section: "General", name: "Lyrics font size", desc: "Font (size) of the lyrics" },
    { resultKey: "b", sectionKey: "general", section: "General", name: "Ｌｙｒｉｃｓ width", sectionLabel: "Layout lyrics" },
    { resultKey: "c", sectionKey: "appearance", section: "Appearance", name: "Background", desc: "" },
    { resultKey: "d", sectionKey: "appearance", section: "Appearance", name: "a.b*c", desc: "Regex [chars] a.b*c" },
  ];
  const OriginalRegExp = globalThis.RegExp;
  for (const query of ["lyrics", "LYRICS size", "a.b*c", "(size)", "  ", "ｌｙｒｉｃｓ"]) {
    let constructed = 0;
    globalThis.RegExp = class CountingRegExp extends OriginalRegExp {
      static get [Symbol.species]() { return OriginalRegExp; }
      constructor(...args) { super(...args); constructed++; }
    };
    let panel;
    try {
      panel = renderSettingsSearchPanel(react, {
        searchQuery: query, searchPanelOpen: true, searchResults: results, searchActiveIndex: 0,
        translate: () => "{count}", pickSearchResult() {}, setSearchActiveIndex() {}, askAssistant: null,
        SettingsUiIcon, SettingsOutlineIcon,
      });
    } finally {
      globalThis.RegExp = OriginalRegExp;
    }
    if (!query.trim()) {
      assert.equal(panel, null);
      continue;
    }
    assert.equal(constructed, 1, `one pattern for "${query}"`);
    const options = elements(panel).filter((node) => node.props.role === "option");
    assert.equal(options.length, results.length);
    options.forEach((option, index) => {
      const result = results[index];
      const main = elements(option).find((node) => node.props.className === "settings-search-result-main");
      const [name, context] = main.props.children;
      assert.deepEqual(name.props.children, [legacyHighlightText(react, result.name, query)]);
      const expectedContext = result.sectionLabel || result.desc || "";
      if (expectedContext) assert.deepEqual(context.props.children, [legacyHighlightText(react, expectedContext, query)]);
      else assert.equal(context, null);
    });
  }
});

