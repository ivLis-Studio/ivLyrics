import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createSyncCreatorOverlay } from "../src/features/sync/syncCreatorOverlay.mjs";
import { bundleFixtureImports } from "./fixtures/legacy-page-source.mjs";
import { createDomHarness } from "./fixtures/playbar_harness.mjs";

const fluentHostSource = bundleFixtureImports(
  'import { openFluentReactModal } from "#ivlyrics/app/modal/fluentModalHost.mjs";\nwindow.openFluentReactModal = openFluentReactModal;',
  "fluentModalLifecycle",
);

const syncOverlayId = "ivLyrics-sync-creator-overlay";
const fluentOverlayId = "test-fluent-overlay";
const createElement = (type, props, children) => ({ type, props: { ...props, children } });
const react = { createElement, Component: class {} };

function createSyncFixture(renderer) {
  const harness = createDomHarness();
  const { window, document } = harness;
  const visibility = [];
  window.addEventListener("ivLyrics:sync-creator-visibility", event => visibility.push(event.detail.active));
  const open = createSyncCreatorOverlay({
    react, host: window, document,
    readReactDom: () => renderer,
    readUtils: () => ({ extractTrackId: () => "track", requireDiscordAuth: async () => {} }),
    getEditor: () => function Editor() {},
    translate: key => key,
    notifyError: assert.fail,
  });
  return { ...harness, visibility, open };
}

test("sync creator uses one root and honors Escape claimed by recording controls", async () => {
  let rendered;
  let roots = 0;
  let unmounts = 0;
  const { CustomEvent, document, open, visibility } = createSyncFixture({
    createRoot() {
      roots++;
      return { render: node => { rendered = node; }, unmount: () => { unmounts++; } };
    },
  });
  const trackInfo = { uri: "spotify:track:track" };
  await open(trackInfo);
  await open(trackInfo);
  assert.equal(roots, 1);
  assert.equal(rendered.props.children.props.trackInfo, trackInfo);
  document.dispatchEvent(new CustomEvent("keydown", { key: "Escape", defaultPrevented: true }));
  assert.ok(document.getElementById(syncOverlayId));
  document.dispatchEvent(new CustomEvent("keydown", { key: "Escape" }));
  assert.equal(unmounts, 1);
  assert.equal(document.getElementById(syncOverlayId), null);
  assert.deepEqual(visibility, [true, true, false]);
});

test("sync creator clears visibility and listeners after render and unmount failures", async () => {
  const renderError = new Error("fixture render failure");
  const unmountError = new Error("fixture unmount failure");
  let failRender = true;
  let close;
  const { document, open, visibility } = createSyncFixture({
    render(node) {
      if (failRender) throw renderError;
      close = node.props.onClose;
    },
    unmountComponentAtNode() {
      if (!failRender) throw unmountError;
    },
  });
  await assert.rejects(open({}), error => error === renderError);
  assert.equal(document.getElementById(syncOverlayId), null);
  assert.equal(document.listeners.get("keydown").length, 0);
  failRender = false;
  await open({});
  assert.throws(close, error => error === unmountError);
  assert.equal(document.getElementById(syncOverlayId), null);
  assert.equal(document.listeners.get("keydown").length, 0);
  assert.equal(document.body.classList.contains("ivlyrics-sync-creator-active"), false);
  assert.deepEqual(visibility, [true, false, true, false]);
});

test("Escape closes the mounted sync creator through its draft flush handler", async () => {
  const { promise, resolve } = Promise.withResolvers();
  let editorProps;
  let closeRequests = 0;
  const { CustomEvent, document, open } = createSyncFixture({
    createRoot() {
      return {
        render(node) { editorProps = node.props.children.props; },
        unmount() {},
      };
    },
  });
  await open({ uri: "spotify:track:track" });
  editorProps.registerCloseRequest(async () => {
    closeRequests++;
    await promise;
    editorProps.onClose();
  });
  document.dispatchEvent(new CustomEvent("keydown", { key: "Escape" }));
  assert.equal(closeRequests, 1);
  assert.ok(document.getElementById(syncOverlayId));
  resolve();
  await promise;
  assert.equal(document.getElementById(syncOverlayId), null);
});

function createFluentFixture(renderer) {
  const harness = createDomHarness();
  const { window, document, context } = harness;
  const createDomElement = document.createElement;
  document.createElement = tag => Object.assign(createDomElement(tag), { dataset: {}, style: {} });
  context.localStorage = { getItem: () => null };
  context.AbortController = AbortController;
  window.Spicetify = { ReactDOM: renderer };
  vm.runInContext(fluentHostSource, context);
  const opener = document.body.appendChild(document.createElement("button"));
  opener.focus();
  const open = (render = () => ({})) => window.openFluentReactModal({ react, overlayId: fluentOverlayId, render });
  return { ...harness, opener, open };
}

test("fluent dialogs wait for content and replacing an exiting dialog restores the original opener", () => {
  let commit;
  let contentButton;
  let unmounts = 0;
  const { document, opener, open, advance } = createFluentFixture({
    createRoot(shell) {
      return {
        render(node) {
          commit = () => {
            contentButton = shell.appendChild(document.createElement("button"));
            node.props.onCommit();
          };
        },
        unmount() { unmounts++; },
      };
    },
  });
  const closeFirst = open();
  advance(32);
  const firstOverlay = document.getElementById(fluentOverlayId);
  assert.equal(firstOverlay.classList.contains("is-open"), false);
  assert.equal(document.activeElement, opener);
  commit();
  advance(16);
  assert.equal(document.activeElement, contentButton);
  assert.equal(firstOverlay.classList.contains("is-open"), true);
  closeFirst();
  const closeSecond = open();
  assert.equal(firstOverlay.isConnected, false);
  assert.equal(unmounts, 1);
  commit();
  advance(16);
  assert.equal(document.activeElement, contentButton);
  closeSecond(true);
  advance(180);
  assert.equal(unmounts, 2);
  assert.equal(document.getElementById(fluentOverlayId), null);
  assert.equal(document.activeElement, opener);
  assert.equal(document.listeners.get("keydown").length, 0);
});

test("fluent dialog removes a legacy root and restores focus even when unmount throws", () => {
  const failure = new Error("fixture unmount failure");
  const { document, opener, open, advance } = createFluentFixture({
    render(_node, shell) { shell.appendChild(document.createElement("button")); },
    unmountComponentAtNode() { throw failure; },
  });
  const close = open();
  advance(16);
  assert.notEqual(document.activeElement, opener);
  assert.throws(() => close(true), error => error === failure);
  assert.equal(document.getElementById(fluentOverlayId), null);
  assert.equal(document.listeners.get("keydown").length, 0);
  assert.equal(document.activeElement, opener);
});

test("a fluent dialog aborts local work as closing starts, before the animation unmounts it", () => {
  let signal;
  let inFlight = true;
  const { document, open, advance } = createFluentFixture({
    render() {},
    unmountComponentAtNode() { assert.equal(inFlight, false); },
  });
  const close = open((_close, lifetime) => {
    signal = lifetime;
    signal.addEventListener("abort", () => { inFlight = false; });
    return {};
  });
  assert.equal(signal.aborted, false);
  close();
  assert.equal(signal.aborted, true);
  assert.ok(document.getElementById(fluentOverlayId));
  advance(180);
  assert.equal(document.getElementById(fluentOverlayId), null);
});
