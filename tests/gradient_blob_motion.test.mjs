import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const css = readPcStylesheet();

// The colour-gradient blobs also stay mounted under a playing video background. Animating top/left
// there re-ran layout and repainted the heavily blurred layers on every frame; translate() keeps the
// same path on the compositor (blob size is a fixed fraction of the container, so left / size = x).
test("colour-gradient blob keyframes only animate transform", () => {
  const blocks = [...css.matchAll(/@keyframes blob-move-(\d) \{([\s\S]*?)\n\}/g)];
  assert.equal(blocks.length, 6);
  for (const [, id, body] of blocks) {
    const properties = [...new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]))];
    assert.deepEqual(properties, ["transform"], "blob " + id + " animates " + properties.join(", "));
    assert.match(body, /translate\(/, "blob " + id + " moves with translate()");
  }
  assert.match(css, /\.gradient-blob \{[^}]*\btop: 0;[^}]*\bleft: 0;/);
});

test("blob translation matches the former container-relative position", () => {
  const blob = /\.color-gradient-bg \.blob-1 \{[^}]*\bwidth: (\d+)%/.exec(css);
  assert.ok(blob);
  const first = /@keyframes blob-move-1 \{\s*0%, 100% \{ transform: translate\((-?[\d.]+)%, (-?[\d.]+)%\) scale\(1\); \}/.exec(css);
  assert.ok(first);
  const size = Number(blob[1]) / 100;
  // Formerly top: -20%; left: -20% of the container.
  assert.equal(Number(first[1]) * size, -20);
  assert.equal(Number(first[2]) * size, -20);
});
