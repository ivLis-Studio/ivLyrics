import { createPanelLyricLines } from "#ivlyrics/lyrics/panelLyricLines.mjs";
import { createPanelLyricLineStyles } from "#ivlyrics/lyrics/panelLyricLineStyles.mjs";
import { rubyTextToHTML } from "#ivlyrics/lyrics/lyricTextMarkup.mjs";
import { normalizeDisplayedCulturalAnnotations, partitionLyricAnnotations, renderAnnotatedLyricHTML } from "#ivlyrics/lyrics/lyricCulturalAnnotations.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("../src/lyrics/NowPlayingPanelLyrics.js", import.meta.url), "utf8");
const lyricsServiceSource = readFileSync(new URL("../src/lyrics/LyricsService.js", import.meta.url), "utf8");

// Slices a source region between two literal markers so the real component and
// the real Utils helpers can be executed in isolation. `end` defaults to the
// next occurrence of `endMarker` after `startMarker`.
const slice = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	assert.notEqual(start, -1, `start marker not found: ${startMarker}`);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.notEqual(end, -1, `end marker not found: ${endMarker}`);
	return source.slice(start, end);
};

// Render through the public row component with only the host and React
// rendering primitives replaced. The startup extension has no app-only Utils.
const renderNormalLine = (displayText) => {
    const created = [];
    const react = {
        createElement(type, props, ...children) {
            if (typeof type === "function") return type({ ...props, children });
            const element = { type, props, children };
            created.push(element);
            return element;
        },
        memo: (render) => render,
        useMemo: (compute) => compute(),
    };
    const lineStyles = createPanelLyricLineStyles({
        react, getVisualSetting: (_key, fallback) => fallback,
        isPanelMotionReduced: () => false, getSpeakerColors: () => null,
    });
    const LyricLine = createPanelLyricLines({
        react, lineStyles, getVocalRowsFromLine: () => [], getInterludeInfo: () => ({ isInterlude: false }),
    });
    LyricLine({ line: { text: displayText } });
    const paragraph = created.find((node) => node.type === "p");
    assert.ok(paragraph, "NormalLine did not create a <p> element");
    return paragraph.props;
};

test("the panel refreshes a still-visible karaoke row when its timing changes", () => {
    const react = {
        createElement: (type, props) => ({ type, props }),
        memo: (render, areEqual) => ({ render, areEqual }),
        useMemo: compute => compute(),
    };
    const vocalRows = [];
    const lineStyles = createPanelLyricLineStyles({
        react, getVisualSetting: (_key, fallback) => fallback,
        isPanelMotionReduced: () => false, getSpeakerColors: () => null,
    });
    const LyricLine = createPanelLyricLines({
        react, lineStyles, getVocalRowsFromLine: () => vocalRows, getInterludeInfo: () => ({ isInterlude: false }),
    });
    const row = LyricLine.render({ isActive: true, line: { text: "Hello", syllables: [{ text: "Hello", startTime: 0, endTime: 500 }] } });
    const updated = { ...row.props, syllables: [{ text: "Hello", startTime: 30, endTime: 350 }] };
    assert.equal(row.type.areEqual(row.props, { ...row.props }), true);
    assert.equal(row.type.areEqual(row.props, updated), false);
});

test("Now Playing panel escapes remote lyric markup before injecting it as HTML", () => {
	const injected = "<img src=x onerror=window.__pwned=1>";
	const props = renderNormalLine(injected);

	assert.ok(
		props.dangerouslySetInnerHTML,
		"expected the panel to keep using dangerouslySetInnerHTML for furigana markup"
	);

	const html = props.dangerouslySetInnerHTML.__html;
	assert.equal(
		html,
		rubyTextToHTML(injected),
		"panel __html must match the escaping the main lyrics view applies"
	);
	assert.ok(!html.includes("<img"), "raw <img> survived into the injected HTML");
	// The handler text itself is allowed to survive as escaped literal text —
	// what must not survive is a live attribute, which only `<` escaping prevents.
	assert.ok(!html.includes('onerror="'), "onerror became a live attribute rather than literal text");
});

test("Now Playing panel still renders the furigana markup it generates itself", () => {
	const furigana = "<ruby>漢字<rt>かんじ</rt></ruby>";
	const html = renderNormalLine(furigana).dangerouslySetInnerHTML.__html;

	assert.equal(html, rubyTextToHTML(furigana));
	assert.ok(html.includes("<ruby>"), "self-generated <ruby> must keep working");
	assert.ok(html.includes("<rt>"), "self-generated <rt> must keep working");
});

test("Now Playing panel renders plain lyric text unchanged", () => {
	const plain = "아무노래";
	const html = renderNormalLine(plain).dangerouslySetInnerHTML.__html;

	assert.equal(html, rubyTextToHTML(plain));
	assert.equal(html, plain);
});

test("culture markers follow lyric text across ruby readings and translation layers", () => {
	const mainText = "<ruby>漢<rt>かん</rt></ruby>字";
	const annotations = normalizeDisplayedCulturalAnnotations([
		{ marker: 2, expression: "translation", note: "Translation note" },
		{ marker: 1, expression: "漢", note: "Original note" },
	]);
	const targets = partitionLyricAnnotations({ annotations, mainText, subText: "かん", subText2: "translation" });
	assert.deepEqual(targets.main, [annotations[0]]);
	assert.deepEqual(targets.sub2, [annotations[1]]);
	assert.equal(renderAnnotatedLyricHTML(mainText, targets.main),
		'<ruby>漢<rt>かん</rt></ruby><sup class="lyrics-cultural-marker">[1]</sup>字');
});

test("Now Playing panel lines render with the extension-only Utils from LyricsService", () => {
	// LyricsService.js publishes this object as window.Utils for extensions.
	assert.match(lyricsServiceSource, /publishRuntimeService\("Utils", Utils, window\);/);
	assert.doesNotMatch(
		slice(lyricsServiceSource, "    const Utils = {", 'publishRuntimeService("Utils"'),
		/createHTMLProps\s*\(/,
		"the extension Utils is expected to lack app-only render helpers"
	);

	const text = "<ruby>漢字<rt>かんじ</rt></ruby> <b>x</b>";
	let props;
	assert.doesNotThrow(() => {
		props = renderNormalLine(text);
	});
	assert.equal(props.dangerouslySetInnerHTML.__html, rubyTextToHTML(text));
	assert.deepEqual(Object.keys(renderNormalLine("")), ["className"]);
});

test("Now Playing panel does not call app-only Utils render helpers", () => {
	assert.doesNotMatch(panelSource, /Utils\.createHTMLProps\s*\(/);
	assert.doesNotMatch(panelSource, /Utils\.rubyTextToHTML\s*\(/);
});

test("Now Playing panel roots render behind an error boundary", () => {
	const mountSource = readFileSync(new URL("../src/lyrics/nowPlayingPanelMount.mjs", import.meta.url), "utf8");
	assert.match(panelSource, /class PanelLyricsErrorBoundary extends react\.Component/);
	assert.match(panelSource, /static getDerivedStateFromError\(\)/);
	assert.match(panelSource, /const createPanelLyricsElement = \(\) => react\.createElement\(\s*PanelLyricsErrorBoundary,/);
	assert.doesNotMatch(
		mountSource,
		/\.render\(react\.createElement\(PanelLyrics\)/,
		"panel roots must render through createPanelLyricsElement()"
	);
	assert.match(mountSource, /createReactDomMount\(getReactDOM\(\), container\)/);
	const renderCalls = mountSource.match(/\.render\(createPanelLyricsElement\(\)/g) || [];
	assert.equal(renderCalls.length, 1);
});
