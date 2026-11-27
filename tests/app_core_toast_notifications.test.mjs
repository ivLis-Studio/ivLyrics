import assert from "node:assert/strict";
import test from "node:test";
import { createToastNotifications } from "../src/core/toastNotifications.mjs";
import { createDomHarness } from "./fixtures/playbar_harness.mjs";

function createToastHarness() {
  const h = createDomHarness();
  const createElement = h.document.createElement;
  h.document.createElement = tag => {
    const element = createElement(tag);
    element.dataset = {};
    element.style = {};
    element.removeChild = child => child.remove();
    return element;
  };
  Object.defineProperty(h.document.body, "lastChild", { get() { return this.children.at(-1); } });
  const toast = createToastNotifications(h.window);
  const container = () => h.document.querySelector(".ivlyrics-toast-container");
  return { ...h, toast, container };
}

test("a progress toast stays mounted during consecutive updates and retains its timeout", () => {
  const { toast, container, document, window, advance, flush } = createToastHarness();
  const id = toast.progress("Starting", 0);
  const first = container().children[0];
  const mutations = [];
  const observer = new window.MutationObserver(entries => mutations.push(...entries));
  observer.observe(document.body, { childList: true });

  advance(250);
  assert.equal(toast.progress("Almost done", 90), id);
  flush();
  assert.equal(mutations.length, 0);
  assert.equal(first.querySelector(".ivlyrics-toast-message").textContent, "Almost done");
  assert.equal(first.querySelector(".ivlyrics-toast-progress-bar").style.width, "90%");

  advance(59999);
  assert.ok(first.classList.contains("ivlyrics-toast-show"));
  advance(1);
  assert.ok(first.classList.contains("ivlyrics-toast-hide"));
  advance(300);
  assert.equal(first.isConnected, false);
});

test("a detached progress toast cannot dismiss or untrack its replacement", () => {
  const { toast, container, advance } = createToastHarness();

  toast.progress("First operation", 10);
  advance(500);
  container().remove();
  const second = toast.progress("Second operation", 20);
  advance(59500);
  assert.equal(container().children[0].classList.contains("ivlyrics-toast-hide"), false);

  toast.dismissProgress();
  container().remove();
  const third = toast.progress("Third operation", 30);
  advance(300);
  assert.notEqual(third, second);
  assert.equal(toast.progress("Still running", 33), third);
  assert.equal(container().children.length, 1);
});

test("an update during the dismissal animation cannot start another timeout", () => {
  const { toast, container, advance } = createToastHarness();

  const first = toast.progress("Starting", 0);
  advance(16);
  toast.dismissProgress();
  assert.equal(toast.progress("Late update", 20), first);
  advance(300);
  const second = toast.progress("Another operation", 30);
  advance(59700);
  assert.equal(container().children[0].classList.contains("ivlyrics-toast-hide"), false);
  assert.equal(toast.progress("Still running", 40), second);
});
