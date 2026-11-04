import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const productionSource = readFileSync(new URL("../../PlaybarButton.js", import.meta.url), "utf8");

// The release test runner has no npm dependencies. Model connected DOM trees,
// matching selectors and queued MutationObserver delivery, not selector hits.
export function createDomHarness() {
  const observers = new Set();
  const timers = new Map();
  let now = 0, nextTimer = 0, documentQueries = 0;
  class EventSurface {
    listeners = new Map();
    addEventListener(type, callback, options) {
      const capture = options === true || !!options?.capture;
      const entries = this.listeners.get(type) || [];
      if (!entries.some((entry) => entry.callback === callback && entry.capture === capture)) entries.push({ callback, capture });
      this.listeners.set(type, entries);
    }
    removeEventListener(type, callback, options) {
      const capture = options === true || !!options?.capture;
      this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry.callback !== callback || entry.capture !== capture));
    }
    dispatchEvent(event) {
      event.target ??= this;
      for (const { callback } of [...(this.listeners.get(event.type) || [])]) {
        callback(event);
        if (event.immediatePropagationStopped) break;
      }
      return !event.defaultPrevented;
    }
  }
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() {}
    stopImmediatePropagation() { this.immediatePropagationStopped = true; }
  }
  const recordMutation = (target, addedNodes, removedNodes) => {
    for (const observer of observers) {
      if ([...observer.targets].some(([node, options]) => node === target || (options.subtree && node.contains(target)))) {
        observer.records.push({ type: "childList", target, addedNodes, removedNodes });
      }
    }
  };
  class Element extends EventSurface {
    nodeType = 1;
    children = [];
    parentNode = null;
    attributes = new Map();
    constructor(tagName) {
      super(); this.tagName = tagName.toUpperCase();
      const names = new Set();
      this.classList = {
        add: (...values) => values.forEach((value) => names.add(value)),
        remove: (...values) => values.forEach((value) => names.delete(value)),
        contains: (value) => names.has(value),
        toggle(value, force = !names.has(value)) { if (force) names.add(value); else names.delete(value); return force; },
        [Symbol.iterator]: () => names[Symbol.iterator](),
      };
    }
    get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
    get isConnected() { return this.parentNode?.isConnected === true; }
    get className() { return [...this.classList].join(" "); }
    set className(value) { this.classList.remove(...this.classList); this.classList.add(...value.split(/\s+/).filter(Boolean)); }
    get id() { return this.attributes.get("id") || ""; }
    set id(value) { this.attributes.set("id", value); }
    setAttribute(key, value) { if (key === "class") this.className = value; else this.attributes.set(key, String(value)); }
    getAttribute(key) { return key === "class" ? this.className : this.attributes.get(key) ?? null; }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    appendChild(node) {
      node.remove(); this.children.push(node); node.parentNode = this;
      recordMutation(this, [node], []); return node;
    }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    prepend(...nodes) {
      for (const node of [...nodes].reverse()) {
        node.remove(); this.children.unshift(node); node.parentNode = this;
        recordMutation(this, [node], []);
      }
    }
    remove() {
      if (!this.parentNode) return;
      const parent = this.parentNode;
      parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null;
      recordMutation(parent, [], [this]);
    }
    replaceWith(node) {
      const parent = this.parentNode, index = parent.children.indexOf(this);
      this.remove(); node.remove(); parent.children.splice(index, 0, node); node.parentNode = parent;
      recordMutation(parent, [node], []);
    }
    matches(selector) {
      return selector.split(",").some((part) => {
        const tokens = part.trim().split(/\s+/);
        const simple = (node, token) => {
          if (!node || !token) return false;
          const tag = token.match(/^[a-z][\w-]*/i)?.[0], id = token.match(/#([\w-]+)/)?.[1];
          const classes = [...token.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
          const attrs = [...token.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
          return (!tag || node.tagName === tag.toUpperCase()) && (!id || node.id === id)
            && classes.every((name) => node.classList.contains(name))
            && attrs.every(([, key, value]) => value === undefined ? node.getAttribute(key) !== null : node.getAttribute(key) === value);
        };
        let node = this;
        if (!simple(node, tokens.pop())) return false;
        while (tokens.length) {
          const token = tokens.pop(); node = node.parentElement;
          if (token === ">") { if (!simple(node, tokens.pop())) return false; }
          else { while (node && !simple(node, token)) node = node.parentElement; if (!node) return false; }
        }
        return true;
      });
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    focus() { if (this.isConnected) document.activeElement = this; }
    click() { this.onclick?.(); this.dispatchEvent(new CustomEvent("click")); }
  }
  const document = new EventSurface();
  Object.assign(document, {
    isConnected: true, children: [], createElement: (tag) => new Element(tag),
    getElementById: (id) => document.documentElement.querySelector(`#${id}`),
    querySelector(selector) { documentQueries++; return document.documentElement.querySelector(selector); },
    contains: (node) => document.documentElement.contains(node),
  });
  document.documentElement = new Element("html"); document.documentElement.parentNode = document;
  document.children.push(document.documentElement);
  document.head = document.documentElement.appendChild(new Element("head"));
  document.body = document.documentElement.appendChild(new Element("body")); document.activeElement = document.body;
  class MutationObserver {
    targets = new Map(); records = [];
    constructor(callback) { this.callback = callback; observers.add(this); }
    observe(node, options) { this.targets.set(node, options); }
    disconnect() { this.targets.clear(); this.records = []; }
  }
  const flush = () => {
    for (let pass = 0; pass < 100; pass++) {
      const pending = [...observers].filter((observer) => observer.records.length);
      if (!pending.length) return;
      for (const observer of pending) { const records = observer.records.splice(0); if (records.length) observer.callback(records); }
    }
    assert.fail("MutationObserver failed to settle");
  };
  const window = new EventSurface();
  Object.assign(window, {
    document, HTMLElement: Element, CustomEvent, MutationObserver,
    setTimeout(callback, delay = 0, ...args) { const id = ++nextTimer; timers.set(id, { callback, args, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id), requestAnimationFrame: (callback) => window.setTimeout(callback, 16),
  });
  const context = vm.createContext({ window, document, HTMLElement: Element, CustomEvent, MutationObserver,
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, console });
  const advance = (ms) => {
    const end = now + ms;
    for (let pass = 0; pass < 1000; pass++) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) { now = end; flush(); return; }
      const [id, timer] = next; timers.delete(id); now = timer.at; timer.callback(...timer.args); flush();
    }
    assert.fail("Timers failed to settle");
  };
  return { window, document, context, timers, observers, flush, advance, CustomEvent, get documentQueries() { return documentQueries; } };
}

// Same six arguments and cached insertion container as Spicetify 2.45.3.
// Set IVLYRICS_PLAYBAR_WRAPPER to rerun the suite with the installed API itself.
function installPlaybarApi(h) {
  const { window, document, context } = h;
  if (process.env.IVLYRICS_PLAYBAR_WRAPPER) {
    const wrapper = readFileSync(process.env.IVLYRICS_PLAYBAR_WRAPPER, "utf8");
    const start = wrapper.indexOf("Spicetify.Playbar = (() => {"), end = wrapper.indexOf("(async function checkForUpdate()", start);
    assert.ok(start >= 0 && end > start, "installed wrapper Playbar boundary changed");
    const source = wrapper.slice(start, end);
    assert.match(source, /return \{ Button, Widget \};\s*\}\)\(\);\s*$/);
    vm.runInContext(source, context);
  } else {
    const cachedContainer = document.querySelector(".main-nowPlayingBar-right > div"), stash = new Set();
    class Button {
      constructor(label, icon, onClick = () => {}, disabled = false, active = false, registerOnCreate = true) {
        this.element = document.createElement("button"); this.element.classList.add("main-genericButton-button");
        this.label = label; this.icon = icon; this.onClick = onClick;
        this.element.onclick = () => this.onClick(this); this.element.disabled = disabled; this.active = active;
        if (registerOnCreate) this.register();
      }
      set active(value) {
        this._active = value;
        this.element.classList.toggle("main-genericButton-buttonActive", value);
        this.element.classList.toggle("main-genericButton-buttonActiveDot", value);
      }
      get active() { return this._active; }
      register() { stash.add(this.element); cachedContainer?.prepend(this.element); }
      deregister() { stash.delete(this.element); this.element.remove(); }
    }
    window.Spicetify.Playbar = { Button, Widget: class { constructor() { assert.fail("Widget changes placement"); } } };
  }
  const ApiButton = window.Spicetify.Playbar.Button;
  window.Spicetify.Playbar.Button = class extends ApiButton {
    constructor(...args) { super(...args); this.args = args; h.created.push(this); }
    register() { this.registerCalls = (this.registerCalls || 0) + 1; return super.register(); }
    deregister() { this.deregisterCalls = (this.deregisterCalls || 0) + 1; return super.deregister(); }
  };
}

export function createPlaybarHarness({ enabled = true, apiReady = true, historyReady = true,
  mounted = true, controlsClass = "main-nowPlayingBar-extraControls", layout = "legacy", source = productionSource } = {}) {
  const h = createDomHarness();
  const { document, window, context } = h;
  h.created = []; h.warnings = [];
  const historyListeners = new Set();
  const history = { location: { pathname: "/" }, pushes: [], backs: 0,
    listen(callback) { historyListeners.add(callback); return () => historyListeners.delete(callback); },
    push(path) { history.pushes.push(path); h.navigate(path); }, goBack() { history.backs++; },
  };
  const storage = new Map(["playbar-button", "fullscreen-button"].map((name) => [`ivLyrics:visual:${name}`, String(enabled)]));
  window.Spicetify = { Platform: { History: historyReady ? history : null }, SVGIcons: {}, LocalStorage: { get: (key) => storage.get(key) ?? null } };
  context.Spicetify = window.Spicetify;
  context.console = { warn: (...args) => h.warnings.push(args), log() {}, debug() {} };
  const left = document.createElement("div"); left.className = "main-nowPlayingBar-left";
  const widget = document.createElement("div"); widget.className = "main-nowPlayingWidget-nowPlaying";
  left.appendChild(widget); document.body.appendChild(left);
  h.layout = document.createElement("footer"); document.body.appendChild(h.layout);
  h.newControls = () => {
    const controls = document.createElement("div"); controls.className = controlsClass;
    for (const id of ["lyrics-button", "fullscreen-mode-button"]) {
      const button = document.createElement("button"); button.setAttribute("data-testid", id);
      button.className = "main-genericButton-button"; controls.appendChild(button);
    }
    return controls;
  };
  // "legacy": Spicetify-mapped .main-nowPlayingBar-right. "spotify-1.3.6": the same
  // three-column bar with unmapped class names, identified only by test ids.
  h.mount = () => {
    const root = document.createElement("div");
    if (layout === "legacy") {
      root.className = "main-nowPlayingBar-right";
      root.appendChild(h.newControls()); h.layout.appendChild(root); return root;
    }
    const bar = document.createElement("aside"); bar.setAttribute("data-testid", "now-playing-bar");
    const row = document.createElement("div"); row.className = "dhrE1Mg11rVzWEJ5Xy84";
    const left = document.createElement("div"); left.className = "GT3btISbKLXrhHILRLON";
    const center = document.createElement("div"); center.className = "Fv_NJY1uLWlqyJ8IKpAP";
    const player = document.createElement("div"); player.setAttribute("data-testid", "player-controls");
    root.className = "_rXd41iaM5t1x5IDLxCJ";
    center.appendChild(player); root.appendChild(h.newControls());
    row.append(left, center, root); bar.appendChild(row); h.layout.appendChild(bar);
    return root;
  };
  h.root = mounted ? h.mount() : null;
  h.installApi = () => installPlaybarApi(h);
  if (apiReady) h.installApi();
  h.toggle = (name, value) => {
    storage.set(`ivLyrics:visual:${name}`, String(value));
    window.dispatchEvent(new h.CustomEvent("ivLyrics", { detail: { type: "config", name, value } })); h.flush();
  };
  h.navigate = (pathname) => { history.location = { pathname }; for (const listener of historyListeners) listener(history.location); h.flush(); };
  h.history = history; h.historyListeners = historyListeners;
  h.makeHistoryReady = () => { window.Spicetify.Platform.History = history; };
  h.hideStyle = (name) => document.head.children.find((node) => node.classList.contains(`ivLyrics:visual:${name}`));
  h.controls = () => layout === "legacy"
    ? document.querySelector(".main-nowPlayingBar-right > div")
    : document.querySelector('[data-testid="player-controls"]')?.parentElement?.parentElement?.children.at(-1)?.children[0] || null;
  vm.runInContext(source, context); h.flush();
  return h;
}
