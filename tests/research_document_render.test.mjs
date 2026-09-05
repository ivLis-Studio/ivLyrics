import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../SongInfoTicker.js", import.meta.url), "utf8");
const createHarness = () => {
  const slots = [];
  let cursor = 0;
  let language = "en";
  let elementCreations = 0;
  let previousBody = null;
  let renderedBody = null;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  };
  const useMemo = (factory, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((value, offset) => !Object.is(value, previous.deps[offset]))) {
      slots[index] = { value: factory(), deps };
    }
    return slots[index].value;
  };
  const react = {
    createElement(type, props, ...children) {
      elementCreations++;
      return { type, props: { ...props, ...(children.length > 0 ? {
        children: children.length === 1 ? children[0] : children,
      } : {}) } };
    },
    Fragment: Symbol("Fragment"),
    memo: (type) => ({ type }),
    useState, useMemo,
    useRef: (current) => useMemo(() => ({ current }), []),
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useEffect: () => { cursor++; },
  };
  const context = vm.createContext({
    Spicetify: { React: react },
    CONFIG: { visual: {} },
    window: {
      I18n: { t: (key) => `${language}:${key}`, getCurrentLanguage: () => language },
      dispatchEvent() {},
    },
    CustomEvent: class {}, URL,
  });
  vm.runInContext(source.replace("    return {\n        ResearchFullView,", "    globalThis.components = { ResearchFullView, ResearchDocument };\n    return {\n        ResearchFullView,"), context);
  const components = context.components;
  assert.ok(components);
  const expand = (node) => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object" || !("type" in node)) return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  return {
    render(props) {
      cursor = 0;
      const view = components.ResearchFullView.type(props);
      const body = elements(view).find((element) => element.type === components.ResearchDocument);
      return { view, body };
    },
    renderBody(body) {
      elementCreations = 0;
      // React.memo compares every prop, including the language invalidation token.
      const next = body.props;
      const previous = previousBody?.props;
      const unchanged = previous && Object.keys(next).length === Object.keys(previous).length
        && Object.keys(next).every((key) => Object.is(next[key], previous[key]));
      if (!unchanged) renderedBody = expand(components.ResearchDocument.type(next));
      previousBody = body;
      return { tree: renderedBody, elementCreations };
    },
    setActiveSection(id) {
      const index = slots.findIndex((value) => value === "thesis" || value === "overview" || value === "sources");
      assert.ok(index >= 0);
      slots[index] = id;
    },
    setLanguage(value) { language = value; },
    sectionMap: () => slots.find((slot) => slot?.value?.current instanceof Map)?.value.current
      || slots.find((slot) => Object.prototype.toString.call(slot?.value?.current) === "[object Map]")?.value.current,
  };
};

const elements = (node) => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  return [node, ...elements(node.props.children)];
};
const fixture = () => ({
  metadata: { title: "Song", artist: "Artist" },
  editorial_thesis: { one_sentence: "A **central** idea" },
  introduction: { paragraphs: ["An article paragraph with https://example.com/paper"] },
  sources: [{ url: "https://example.com/paper", title: "Paper" }],
});

test("research navigation and text scaling retain the article and its registration callback", () => {
  const harness = createHarness();
  const props = { info: fixture(), trackName: "Song", artistName: "Artist" };
  const first = harness.render(props);
  const initial = harness.renderBody(first.body);
  assert.ok(initial.elementCreations > 0);
  harness.setActiveSection("sources");
  const next = harness.render(props);
  assert.strictEqual(next.body.type, first.body.type);
  assert.strictEqual(next.body.props.register, first.body.props.register);
  assert.equal(elements(next.view).find((element) => element.props["data-research-nav-id"] === "sources").props.className, "active");
  assert.strictEqual(harness.renderBody(next.body).tree, initial.tree);
  assert.equal(harness.renderBody(next.body).elementCreations, 0);
  elements(next.view).find((element) => element.props.title === "en:research.fontIncrease").props.onClick();
  const scaled = harness.render(props);
  assert.equal(scaled.view.props.style["--research-scale"], 1.05);
  assert.equal(harness.renderBody(scaled.body).elementCreations, 0);
});

test("new article references and cover changes refresh the body while links stay intact", () => {
  const harness = createHarness();
  const props = { info: fixture(), coverUrl: "https://example.com/first.png" };
  const first = harness.renderBody(harness.render(props).body);
  const info = { ...props.info, introduction: { paragraphs: ["Replacement content"] } };
  const changed = harness.renderBody(harness.render({ ...props, info }).body);
  assert.notStrictEqual(changed.tree, first.tree);
  assert.ok(changed.elementCreations > 0);
  assert.ok(JSON.stringify(changed.tree).includes("Replacement content"));
  const covered = harness.renderBody(harness.render({ ...props, info, coverUrl: "https://example.com/second.png" }).body);
  assert.ok(covered.elementCreations > 0);
  const sourceLink = elements(covered.tree).find((element) => element.type === "a" && element.props.href === "https://example.com/paper");
  assert.equal(sourceLink.props.target, "_blank");
  assert.equal(typeof sourceLink.props.onClick, "function");
});

test("UI language changes refresh both article labels and navigation without replacing article data", () => {
  const harness = createHarness();
  const props = { info: fixture() };
  const first = harness.render(props);
  harness.renderBody(first.body);
  harness.setLanguage("ko");
  const changed = harness.render(props);
  assert.strictEqual(changed.body.props.info, first.body.props.info);
  assert.ok(harness.renderBody(changed.body).elementCreations > 0);
  assert.ok(JSON.stringify(harness.renderBody(changed.body).tree).includes("ko:research.sections.overview"));
  assert.ok(JSON.stringify(changed.view).includes("ko:research.sections.overview"));
});

test("section refs register and unregister through the same callback after parent updates", () => {
  const harness = createHarness();
  const props = { info: fixture() };
  const initial = harness.render(props);
  const first = harness.renderBody(initial.body);
  const section = elements(first.tree).find((element) => element.props["data-research-section"] === "overview");
  const node = { marker: "overview" };
  section.props.ref(node);
  assert.strictEqual(harness.sectionMap().get("overview"), node);
  harness.setActiveSection("sources");
  const next = harness.render(props);
  assert.strictEqual(next.body.props.register, initial.body.props.register);
  section.props.ref(null);
  assert.equal(harness.sectionMap().has("overview"), false);
  section.props.ref(node);
  assert.strictEqual(harness.sectionMap().get("overview"), node);
});
