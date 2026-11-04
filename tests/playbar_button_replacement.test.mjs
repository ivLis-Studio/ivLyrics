import assert from "node:assert/strict";
import test from "node:test";
import { createPlaybarHarness } from "./fixtures/playbar_harness.mjs";

const names = ["playbar-button", "fullscreen-button"];
const assertConnected = (h) => {
  assert.equal(h.created.length, 2);
  for (const button of h.created) {
    assert.equal(button.element.isConnected, true);
    assert.equal(button.element.parentElement, h.controls());
  }
  names.forEach((name) => assert.ok(h.hideStyle(name), `${name}: native control needs a connected replacement`));
};

test("OFF at startup registers neither replacement; independent toggles retain native availability", () => {
  const h = createPlaybarHarness({ enabled: false });
  assert.equal(h.created.length, 0);
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
  assert.equal(h.historyListeners.size, 0);
  for (const name of names) {
    h.toggle(name, true);
    assert.ok(h.hideStyle(name));
    const button = h.created.at(-1);
    assert.equal(button.args[5], false, "sixth argument is registerOnCreate, not right placement");
    assert.equal(button.element.parentElement, h.controls());
    h.toggle(name, false);
    assert.equal(button.element.isConnected, false);
    assert.equal(button.deregisterCalls, 1);
    assert.equal(h.hideStyle(name), undefined);
  }
  assert.equal(h.timers.size, 0);
  assert.equal(h.historyListeners.size, 0);
  assert.ok([...h.observers].every((observer) => !observer.targets.has(h.document.body)));
});

test("replacement does not depend on extraControls class or SVG matching", () => {
  const h = createPlaybarHarness({ controlsClass: "spotify-v13-controls" });
  assertConnected(h); h.advance(3000); assertConnected(h);
  assert.equal(h.warnings.length, 0);
  assert.ok(h.controls().classList.contains("ivlyrics-playbar-controls"));
  assert.ok(h.created.some((button) => button.element.classList.contains("ivlyrics-fullscreen-btn")));
  assert.match(h.hideStyle("fullscreen-button").innerHTML, /\.ivlyrics-playbar-controls > \.ivlyrics-fullscreen-btn/);
});

test("late Playbar API and late History recover saved ON settings without DOM polling", () => {
  for (const dependency of ["api", "history"]) {
    const h = createPlaybarHarness({ apiReady: dependency !== "api", historyReady: dependency !== "history" });
    const queries = h.documentQueries; h.advance(900);
    assert.equal(h.documentQueries, queries, "dependency retries must not search the DOM");
    assert.equal(h.created.length, 0);
    names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
    if (dependency === "api") h.installApi(); else h.makeHistoryReady();
    h.advance(2000); assertConnected(h); assert.equal(h.historyListeners.size, 1);
  }
});

test("missing right container keeps native controls available until a late mount", () => {
  const h = createPlaybarHarness({ mounted: false });
  assert.equal(h.created.length, 0);
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
  h.advance(3000); h.root = h.mount(); h.flush(); assertConnected(h);
  assert.ok([...h.observers].every((observer) => [...observer.targets.values()].every((options) => !options.subtree)));
});

test("right controls and ancestor remounts recover the same buttons despite the API's cached container", () => {
  const h = createPlaybarHarness();
  const original = h.created.map((button) => button.element);
  h.controls().replaceWith(h.newControls()); h.flush(); assertConnected(h);
  const layout = h.document.createElement("footer"); h.layout.replaceWith(layout); h.layout = layout; h.flush();
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined, "detached replacements must release native controls"));
  h.root = h.mount(); h.flush(); assertConnected(h);
  assert.deepEqual(h.created.map((button) => button.element), original);
  assert.ok(h.created.every((button) => button.registerCalls === 1), "remount must not register into the API's stale container again");
});

test("moving a mounted bar rebinds ancestor observation before its new layout is removed", () => {
  const h = createPlaybarHarness();
  const section = h.document.createElement("section"), layout = h.document.createElement("footer");
  h.document.body.appendChild(section); section.appendChild(layout); layout.appendChild(h.root); h.flush();
  assertConnected(h);
  layout.remove(); h.flush();
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
  section.appendChild(layout); h.flush(); assertConnected(h);
});

test("disabling one replacement does not disable or resurrect the other during a remount", () => {
  const h = createPlaybarHarness();
  h.toggle("playbar-button", false);
  assert.equal(h.created[0].element.isConnected, false);
  assert.equal(h.hideStyle("playbar-button"), undefined);
  assert.ok(h.hideStyle("fullscreen-button"));
  h.controls().replaceWith(h.newControls()); h.flush();
  assert.equal(h.created[0].element.isConnected, false);
  assert.equal(h.created[1].element.parentElement, h.controls());
  h.toggle("fullscreen-button", false);
  assert.equal(h.controls().classList.contains("ivlyrics-playbar-controls"), false);
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
});

test("a Widget-only API waits for Button instead of moving replacements beside the track title", () => {
  const h = createPlaybarHarness({ enabled: false });
  const Button = h.window.Spicetify.Playbar.Button;
  delete h.window.Spicetify.Playbar.Button;
  names.forEach((name) => h.toggle(name, true)); h.advance(900);
  assert.equal(h.created.length, 0);
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
  h.window.Spicetify.Playbar.Button = Button; h.advance(2000); assertConnected(h);
});

test("individual button removal recovers; unrelated DOM mutations do not search globally", () => {
  const h = createPlaybarHarness(); h.advance(1000);
  h.created[0].element.remove(); h.flush(); assertConnected(h);
  const queries = h.documentQueries;
  const lyrics = h.document.createElement("section"); h.document.body.appendChild(lyrics); h.flush();
  for (let index = 0; index < 30; index++) { lyrics.appendChild(h.document.createElement("span")); h.flush(); }
  assert.equal(h.documentQueries, queries);
  assert.equal(h.timers.size, 0, "mounted controls should not have a verification polling loop");
});

test("disable during dependency wait or missing-container recovery cancels pending work", () => {
  for (const options of [{ apiReady: false }, { mounted: false }, {}]) {
    const h = createPlaybarHarness(options);
    if (h.root) { h.root.remove(); h.flush(); }
    names.forEach((name) => h.toggle(name, false));
    h.installApi(); h.mount(); h.advance(5000);
    assert.ok(h.created.every((button) => !button.element.isConnected));
    names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
    assert.equal(h.historyListeners.size, 0);
    assert.ok([...h.observers].every((observer) => !observer.targets.has(h.document.body)));
  }
});

test("registration failure releases native controls and retries; deregistration failure still removes the element", () => {
  const h = createPlaybarHarness({ enabled: false });
  const Button = h.window.Spicetify.Playbar.Button;
  let fail = true;
  h.window.Spicetify.Playbar.Button = class extends Button {
    register() { super.register(); if (fail) throw new Error("fixture register failed after insertion"); }
  };
  h.toggle("playbar-button", true);
  assert.equal(h.hideStyle("playbar-button"), undefined);
  assert.equal(h.created[0].element.isConnected, false);
  fail = false; h.advance(300); assert.ok(h.hideStyle("playbar-button"));
  h.created[0].deregister = () => { throw new Error("fixture deregister failed"); };
  h.toggle("playbar-button", false);
  assert.equal(h.hideStyle("playbar-button"), undefined);
  assert.equal(h.created[0].element.isConnected, false);
});

test("public click events, active state and existing SVGs survive reenabling", () => {
  const h = createPlaybarHarness();
  const [lyrics, fullscreen] = h.created;
  assert.match(lyrics.icon, /M13\.426 2\.574/); assert.match(fullscreen.icon, /M0\.25 3C0\.25/);
  assert.equal(lyrics.label, "Lyrics Plus"); assert.equal(fullscreen.label, "Fullscreen");
  lyrics.element.click(); assert.deepEqual(h.history.pushes, ["/ivLyrics"]); assert.equal(lyrics.active, true);
  lyrics.element.click(); assert.equal(h.history.backs, 1);
  const events = []; h.window.addEventListener("ivLyrics", (event) => events.push(event.detail));
  fullscreen.element.click(); assert.deepEqual({ ...events.at(-1) }, { type: "fullscreen-toggle" });
  names.forEach((name) => h.toggle(name, false)); h.navigate("/album/fixture");
  h.toggle("playbar-button", true); h.toggle("fullscreen-button", true);
  assertConnected(h); assert.equal(lyrics.active, false); assert.equal(h.historyListeners.size, 1);
});

test("Spotify 1.3.6 bar without main-nowPlayingBar-right still gets both replacements", () => {
  const h = createPlaybarHarness({ layout: "spotify-1.3.6", controlsClass: "Wd77zsAyau4UGFnxn60b" });
  assertConnected(h); h.advance(3000); assertConnected(h);
  assert.equal(h.warnings.length, 0);
  assert.ok(h.controls().classList.contains("ivlyrics-playbar-controls"));
  assert.ok(h.created.every((button) => button.registerCalls === 1));
  // Spotify replaces the extra controls and then the whole bar.
  h.controls().replaceWith(h.newControls()); h.flush(); assertConnected(h);
  const layout = h.document.createElement("footer"); h.layout.replaceWith(layout); h.layout = layout; h.flush();
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined, "detached replacements release native controls"));
  h.root = h.mount(); h.flush(); assertConnected(h);
  names.forEach((name) => h.toggle(name, false));
  assert.ok(h.created.every((button) => !button.element.isConnected));
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
});

test("Spotify 1.3.6 bar that mounts late is found from its player controls", () => {
  const h = createPlaybarHarness({ layout: "spotify-1.3.6", mounted: false });
  assert.equal(h.created.length, 0);
  names.forEach((name) => assert.equal(h.hideStyle(name), undefined));
  h.advance(3000); h.root = h.mount(); h.flush(); assertConnected(h);
  assert.ok([...h.observers].every((observer) => [...observer.targets.values()].every((options) => !options.subtree)));
});
