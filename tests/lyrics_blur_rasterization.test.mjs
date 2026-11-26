import assert from "node:assert/strict";
import test from "node:test";
import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { createLyricsBackgroundStyles } from "#ivlyrics/lyrics/lyricsBackgroundStyles.mjs";

const css = readPcStylesheet();

// The selector of the rule whose declarations contain index.
function selectorAt(index) {
    const open = css.lastIndexOf("{", index);
    const start = Math.max(css.lastIndexOf("}", open - 1), css.lastIndexOf("{", open - 1)) + 1;
    return css.slice(start, open).replace(/\s+/g, " ").trim();
}

// A blur stays on the compositor, and runs again on every frame, when its
// element lists filter in will-change or is itself a moving layer. Static
// content rasterizes its blur once instead; the pixels are the same.
test("the artwork background rasterizes its blur once", () => {
    const { computeLyricsBackgroundStyle } = createLyricsBackgroundStyles({
        getVisualSettings: () => ({ "background-brightness": 60, "album-bg-blur": 20 }),
        isColorLight: () => false,
        getTrackArtwork: () => "https://i.scdn.co/image/artwork",
    });
    const style = computeLyricsBackgroundStyle({
        isSyncCreatorActive: false, isFADMode: false, effectiveBackgroundMode: "gradient-background",
        dynamicColors: null, colors: {},
    });
    assert.equal(style.filter, "brightness(0.6) blur(20px)");
    assert.equal(style.willChange, "transform, opacity");
    const rule = /^#ivLyrics-gradient-background \{([^}]*)\}/m.exec(css);
    assert.ok(rule);
    assert.match(rule[1], /will-change: transform, opacity;/);
});

test("fade blur is painted by each row's children, not by the moving row", () => {
    const uses = [...css.matchAll(/blur\(calc\(var\(--(?:manual-blur-index|blur-index)/g)];
    assert.equal(uses.length, 2);
    const childOfInactiveRow = / > \.lyrics-lyricsContainer-LyricsLine:not\(\.lyrics-lyricsContainer-LyricsLine-active\) > \*$/;
    for (const use of uses) assert.match(selectorAt(use.index), childOfInactiveRow);
    // Only the direct children read the row index; it still does not reach glyphs.
    const rule = /\.blur-enabled \.lyrics-lyricsContainer-SyncedLyrics\s+> \.lyrics-lyricsContainer-LyricsLine:not\(\.lyrics-lyricsContainer-LyricsLine-active\) > \* \{([^}]*)\}/.exec(css);
    assert.ok(rule);
    assert.match(rule[1], /--blur-index: inherit;/);
    assert.match(css, /@property --blur-index \{\s*syntax: "\*";\s*inherits: false;/);
    // Browsing keeps its own index and still wins over the playback rule.
    assert.match(selectorAt(uses.find(use => use[0].includes("manual")).index), /\.scrolling-active /);
});
