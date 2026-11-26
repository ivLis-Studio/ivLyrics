import assert from "node:assert/strict";
import { createSongResearch } from "../src/app/SongResearch.js";
import test from "node:test";

const createHarness = ({ replayStateUpdaters = false } = {}) => {
  const slots = [];
  const effects = [];
  const timers = new Map();
  const writes = [];
  const host = new EventTarget();
  const visual = { "fullscreen-tmi-font-size": 100 };
  let timerId = 0;
  let failSave = false;
  let cursor = 0;
  let language = "en";
  let elementCreations = 0;
  let previousBody = null;
  let renderedBody = null;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => {
      const previous = slots[index];
      if (replayStateUpdaters && typeof next === "function") next(previous);
      slots[index] = typeof next === "function" ? next(previous) : next;
    }];
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
    useEffect: (effect, deps) => {
      const index = cursor++;
      const old = slots[index];
      if (old && deps.length === old.deps.length && deps.every((value, i) => Object.is(value, old.deps[i]))) return;
      const slot = { deps };
      slots[index] = slot;
      effects.push(() => { old?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  host.setTimeout = (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; };
  host.clearTimeout = (id) => timers.delete(id);
  host.matchMedia = () => ({ matches: false });
  const { ResearchFullView } = createSongResearch({
    react, spicetify: { React: react }, config: { visual }, host,
    storage: {
      saveConfig(key, value) {
        if (failSave) throw new Error("read only");
        writes.push([key, value]);
      },
    },
    i18n: { t: (key) => `${language}:${key}`, getCurrentLanguage: () => language },
    getAiManager: () => null,
  });
  const expand = (node) => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object" || !("type" in node)) return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  return {
    render(props, attach = () => {}) {
      cursor = 0;
      const view = ResearchFullView.type(props);
      const body = elements(view).find((element) => typeof element.props.register === "function" && Boolean(element.props.info));
      attach(view, body);
      effects.splice(0).forEach(effect => effect());
      return { view, body };
    },
    renderBody(body) {
      elementCreations = 0;
      // React.memo compares every prop, including the language invalidation token.
      const next = body.props;
      const previous = previousBody?.props;
      const unchanged = previous && Object.keys(next).length === Object.keys(previous).length
        && Object.keys(next).every((key) => Object.is(next[key], previous[key]));
      if (!unchanged) renderedBody = expand(body.type.type(next));
      previousBody = body;
      return { tree: renderedBody, elementCreations };
    },
    setActiveSection(id) {
      const index = slots.findIndex((value) => value === "thesis" || value === "overview" || value === "sources");
      assert.ok(index >= 0);
      slots[index] = id;
    },
    setLanguage(value) { language = value; },
    setStoredScale(value) {
      visual["fullscreen-tmi-font-size"] = value;
      host.dispatchEvent(new CustomEvent("ivLyrics", {
        detail: { type: "config", name: "fullscreen-tmi-font-size", value },
      }));
    },
    failSave(value) { failSave = value; },
    getStoredScale: () => visual["fullscreen-tmi-font-size"],
    writes, timers,
    runTimers(delay) {
      for (const [id, entry] of [...timers]) {
        if (entry.delay !== delay || !timers.delete(id)) continue;
        entry.callback();
      }
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
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

test("reader text size commits once per click, accepts a new setting, and rolls back failed storage", (t) => {
  t.mock.method(console, "error", () => {});
  const harness = createHarness({ replayStateUpdaters: true });
  const props = { info: fixture(), tmiScale: 1 };
  const key = "fullscreen-tmi-font-size";
  const getIncrease = (view) => elements(view).find(element => element.props.title === "en:research.fontIncrease").props.onClick;
  const increase = getIncrease(harness.render(props).view);
  increase();
  increase();
  assert.deepEqual(harness.writes, [[key, 105], [key, 110]]);
  assert.equal(harness.render(props).view.props.style["--research-scale"], 1.1);

  harness.setStoredScale(130);
  assert.equal(harness.render(props).view.props.style["--research-scale"], 1.3);
  const updatedProps = { ...props, researchScale: 1.4 };
  const updated = harness.render(updatedProps).view;
  assert.equal(updated.props.style["--research-scale"], 1.4);
  harness.failSave(true);
  getIncrease(updated)();
  assert.equal(harness.getStoredScale(), 130);
  assert.equal(harness.render(updatedProps).view.props.style["--research-scale"], 1.4);
  harness.failSave(false);
  getIncrease(harness.render(updatedProps).view)();
  assert.deepEqual(harness.writes.at(-1), [key, 145]);
  assert.equal(harness.render(props).view.props.style["--research-scale"], 1);
});

test("only the latest section can take delayed focus, and closing the reader clears navigation work", () => {
  const harness = createHarness();
  const props = { info: fixture() };
  const focused = [];
  const overview = { getBoundingClientRect: () => ({ top: 48 }), focus: () => focused.push("overview") };
  const sources = { getBoundingClientRect: () => ({ top: 160 }), focus: () => focused.push("sources") };
  const root = Object.assign(new EventTarget(), {
    scrollTop: 0,
    contains: target => [overview, sources].includes(target),
    getBoundingClientRect: () => ({ top: 20 }),
    scrollTo: ({ top }) => { root.scrollTop = top; },
  });
  const attach = (view, body) => {
    elements(view).find(element => element.type === "main").props.ref.current = root;
    body.props.register("overview", overview);
    body.props.register("sources", sources);
  };
  const clickSection = (view, id) => elements(view)
    .find(element => element.props["data-research-nav-id"] === id).props.onClick({ preventDefault() {} });
  const { view } = harness.render(props, attach);
  clickSection(view, "overview");
  clickSection(view, "sources");
  harness.runTimers(350);
  assert.deepEqual(focused, ["sources"]);

  clickSection(view, "overview");
  harness.unmount();
  assert.equal(harness.timers.size, 0);
  harness.runTimers(350);
  assert.deepEqual(focused, ["sources"]);
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
