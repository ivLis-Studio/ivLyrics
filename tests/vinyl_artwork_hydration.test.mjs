import assert from "node:assert/strict";
import test from "node:test";
import { createHarness, first, second } from "./fixtures/vinyl-controls-harness.mjs";

const phases = [
  [0, "record-clearing"], [179, "record-clearing"],
  [180, "record-sleeving"], [859, "record-sleeving"],
  [860, "album-departing"], [1339, "album-departing"],
  [1340, "album-arriving"], [2039, "album-arriving"],
  [2040, "record-emerging"], [2759, "record-emerging"],
  [2760, "record-raised"], [3119, "record-raised"],
  [3120, "handoff"], [3215, "handoff"], [3216, "idle"],
];
const assertPhase = (h, phase) => phase === "idle"
  ? assert.doesNotMatch(h.tree.props.className, /is-track-/)
  : assert.ok(h.tree.props.className.split(" ").includes(`is-track-${phase}`), phase);

test("late same-URI artwork and metadata retain every original handoff deadline", () => {
  for (const hydrateAt of [90, 1450, 2200, 2800, 3140]) {
    const h = createHarness();
    h.render({ track: { ...second, coverUrl: "" } });
    const hydrated = { ...second, coverUrl: "hydrated.png", title: "Hydrated title", album: "Hydrated album" };
    const events = [...phases.map(([at, phase]) => ({ at, phase })), { at: hydrateAt, hydrate: true }]
      .sort((a, b) => a.at - b.at);
    let now = 0;
    for (const event of events) {
      h.advance(event.at - now);
      now = event.at;
      if (event.hydrate) h.render({ track: hydrated });
      else assertPhase(h, event.phase);
      const shown = event.at < 3120 ? first : event.at >= hydrateAt ? hydrated : { ...second, coverUrl: "" };
      assert.equal(h.player().title, shown.title, `displayed title at ${event.at}`);
      assert.equal(h.player().coverUrl, shown.coverUrl, `displayed cover at ${event.at}`);
      if (event.at >= hydrateAt && event.at < 3216) {
        assert.equal(h.player().incomingTrack?.coverUrl, hydrated.coverUrl);
        assert.equal(h.player().incomingTrack?.title, hydrated.title);
      }
    }
    assert.equal(h.timerCount, 0);
    h.unmount();
  }
});

test("incoming hydration matching outgoing visuals cannot cancel a different URI's handoff", () => {
  const h = createHarness();
  h.render({ track: second });
  h.advance(200);
  const hydrated = { ...first, uri: second.uri };
  h.render({ track: hydrated });
  assertPhase(h, "record-sleeving");
  assert.equal(h.player().incomingTrack?.uri, second.uri);
  h.advance(1140);
  assertPhase(h, "album-arriving");
  h.advance(1876);
  assertPhase(h, "idle");
  assert.equal(h.player().coverUrl, hydrated.coverUrl);
  assert.equal(h.timerCount, 0);
  h.unmount();
});

test("failed or indefinitely pending artwork never stalls the sleeve animation", () => {
  const h = createHarness();
  h.render({ track: second });
  let now = 0;
  for (const [at, phase] of phases) {
    h.advance(at - now);
    now = at;
    assertPhase(h, phase);
  }
  assert.equal(h.player().coverUrl, second.coverUrl);
  assert.equal(h.timerCount, 0);
  h.unmount();
});

test("rapid URI changes and returning to the outgoing track cancel all stale commits", () => {
  for (const returnToFirst of [false, true]) {
    const h = createHarness();
    h.render({ track: second });
    h.advance(2200);
    h.render({ track: { ...second, coverUrl: "second-new.png" } });
    const latest = returnToFirst ? first : { ...second, uri: "spotify:track:third", title: "Third", coverUrl: "third.png" };
    h.render({ track: latest });
    h.advance(10000);
    assertPhase(h, "idle");
    assert.equal(h.player().title, latest.title);
    assert.equal(h.player().coverUrl, latest.coverUrl);
    assert.equal(h.player().incomingTrack, null);
    assert.equal(h.timerCount, 0);
    h.unmount();
  }
});

test("idle same-URI artwork updates immediately and disabling motion cancels hydration work", () => {
  const h = createHarness();
  h.render({ track: { ...first, coverUrl: "first-new.png" } });
  assert.equal(h.player().coverUrl, "first-new.png");
  assert.equal(h.timerCount, 0);
  h.render({ track: second });
  h.advance(2800);
  h.render({ track: { ...second, coverUrl: "second-new.png" }, vinylSettings: { trackChangeAnimation: false } });
  assert.equal(h.player().coverUrl, "second-new.png");
  assert.equal(h.player().incomingTrack, null);
  assert.equal(h.timerCount, 0);
  h.unmount();
});

test("artwork hydration keeps the raised LP accent stable until the handoff finishes", () => {
  const h = createHarness();
  const incoming = { ...second, accent: "#224466" };
  h.render({ track: incoming });
  h.advance(2200);
  h.render({ track: { ...incoming, coverUrl: "second-new.png", accent: "#cc5577" } });
  assert.equal(h.player().incomingTrack.accent, incoming.accent);
  h.advance(920);
  assertPhase(h, "handoff");
  assert.equal(h.player().coverUrl, "second-new.png");
  assert.equal(h.player().style["--iv-vinyl-accent"], incoming.accent);
  h.advance(96);
  assertPhase(h, "idle");
  assert.equal(h.player().style["--iv-vinyl-accent"], "#cc5577");
  h.unmount();
});

test("unmount during artwork hydration releases every outstanding transition timer", () => {
  const h = createHarness();
  h.render({ track: second });
  h.advance(200);
  h.render({ track: { ...second, coverUrl: "second-new.png" } });
  h.unmount();
  h.advance(10000);
  assert.equal(h.timerCount, 0);
});
