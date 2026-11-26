import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lyrics/panelLyricsStyles.mjs", import.meta.url), "utf8");

// The Now Playing panel's blob background runs wherever the panel is open,
// not only on the lyrics page. Its keyframes used to animate top/left, which
// re-ran layout every frame; translate() keeps the same path on the
// compositor (blob size is a fixed fraction of the container, so x = left / size).
const FORMER = {
    1: [92, [[-28, -28], [4, 46], [44, 24], [20, -10], [-12, 18]]],
    2: [82, [[46, 56], [16, -18], [-18, 36], [40, 68]]],
    3: [62, [[58, -12], [-24, 58], [36, 38]]],
    4: [84, [[-34, 66], [58, 48], [36, -22], [-12, 28], [18, 78]]],
    5: [58, [[68, 48], [28, 78], [-12, 18], [48, -16]]],
    6: [100, [[24, 24], [-24, -22], [58, 58]]],
};
const keyframes = id => new RegExp("@keyframes ivlyrics-panel-blob-" + id + " \\{([\\s\\S]*?)\\n\\}").exec(source)?.[1];

test("panel blob keyframes only animate transform", () => {
    const blocks = [...source.matchAll(/@keyframes ivlyrics-panel-blob-(\d) \{([\s\S]*?)\n\}/g)];
    assert.equal(blocks.length, 6);
    for (const [, id, body] of blocks) {
        const properties = [...new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map(match => match[1]))];
        assert.deepEqual(properties, ["transform"], "blob " + id + " animates " + properties.join(", "));
    }
    assert.match(source, /\.ivlyrics-panel-bg-blob \{[^}]*\btop: 0;[^}]*\bleft: 0;/);
});

test("panel blob translation matches the former container-relative position", () => {
    for (const [id, [size, former]] of Object.entries(FORMER)) {
        assert.match(source, new RegExp("\\.ivlyrics-panel-bg-blob\\.blob-" + id + " \\{ width: " + size + "%; height: " + size + "%;"));
        const steps = [...keyframes(id).matchAll(/translate\((-?[\d.]+)%, (-?[\d.]+)%\)/g)]
            .map(match => [Number(match[1]), Number(match[2])]);
        assert.equal(steps.length, former.length, "blob " + id);
        steps.forEach(([x, y], index) => {
            const [top, left] = former[index];
            assert.ok(Math.abs(x * size / 100 - left) < 1e-3, "blob " + id + " step " + index + " left");
            assert.ok(Math.abs(y * size / 100 - top) < 1e-3, "blob " + id + " step " + index + " top");
        });
    }
});

test("panel blob blur is rasterized with the blob, not re-run every frame", () => {
    const blob = /\.ivlyrics-panel-bg-blob \{([^}]*)\}/.exec(source)[1];
    assert.doesNotMatch(blob, /filter|background/);
    assert.match(blob, /will-change: transform;/);
    const layer = /\.ivlyrics-panel-bg-blob::before \{([^}]*)\}/.exec(source)[1];
    assert.match(layer, /filter: blur\(var\(--ivlyrics-panel-blob-blur, 34px\)\);/);
    assert.match(layer, /background: var\(--ivlyrics-panel-blob-fill\);/);
    for (const [id, blur] of [[3, 28], [4, 30], [5, 26], [6, 38]]) {
        assert.match(source, new RegExp("\\.ivlyrics-panel-bg-blob\\.blob-" + id + " \\{[^}]*--ivlyrics-panel-blob-blur: " + blur + "px;"));
    }
});
