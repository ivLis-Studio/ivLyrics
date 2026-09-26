import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

// Reuse the real engine harness from the equivalence suite (engine factory,
// frozen baselines, fixtures) but skip its baseline comparisons: this file
// asserts the intentional interlude collapse behavior directly, since the
// frozen baselines are patched to share that rule.
const helperUrl = new URL('./renderer_settings_equivalence.test.mjs', import.meta.url);
const helper = readFileSync(helperUrl, 'utf8');
const harness = helper.slice(helper.indexOf('const repoRoot'), helper.indexOf('test("renderer output'))
	.replaceAll('import.meta.url', JSON.stringify(helperUrl.href));
const { createEngine, currentSource, makeLyrics, lyric } = new Function(
	'assert', 'execFileSync', 'readFileSync', 'fileURLToPath', 'vm', harness +
	'\nreturn { createEngine, currentSource, makeLyrics, lyric };'
)(assert, execFileSync, readFileSync, fileURLToPath, vm);

const row = (result, text) => result.elements.find((element) => element.props.line?.text === text)?.props;

test('an instrumental break collapses already sung rows out of layout and accessibility', () => {
	const engine = createEngine(currentSource);
	// makeLyrics() sings from 1000 to 4700 and resumes at 8000, so 7200 sits in
	// the auto-detected break whose marker owns the layout.
	const result = engine.render(makeLyrics(), 7200);
	assert.ok(result.elements.some((element) => element.props.line?.interludeInfo?.isInterlude),
		'fixture must place the active row inside an interlude');
	for (const text of ['First vocal', 'Overlapping response']) {
		const props = row(result, text);
		assert.ok(props, `${text} must stay rendered`);
		assert.match(props.className, /lyrics-lyricsContainer-LyricsLine-paddingLine/);
		assert.match(props.className, /lyrics-lyricsContainer-LyricsLine-paddingBefore/);
		assert.equal(props.hiddenFromAccessibility, true, `${text} must leave the accessibility tree`);
	}
	// The layout anchor that hosts the break and every upcoming vocal stay readable.
	assert.equal(row(result, 'Inline styled voice').hiddenFromAccessibility, false);
	assert.equal(row(result, '日本語の声').hiddenFromAccessibility, false);
});

test('manual scrolling during the same break keeps every row readable', () => {
	const engine = createEngine(currentSource);
	engine.setScrolling(true);
	const result = engine.render(makeLyrics(), 7200);
	assert.ok(result.elements.every((element) => element.props.hiddenFromAccessibility !== true),
		'manual browsing must never hide a row, even inside an interlude');
});

test('an explicit instrumental marker collapses the finished line too', () => {
	const engine = createEngine(currentSource);
	const result = engine.render([lyric(1000, 2500, 'Song'), { startTime: 3000, text: '♪' }], 4000, { isKara: false });
	assert.ok(result.elements.some((element) => element.props.line?.interludeInfo?.isInterlude),
		'explicit marker must prepare an interlude');
	const props = row(result, 'Song');
	assert.ok(props, 'the finished line must stay rendered');
	assert.match(props.className, /lyrics-lyricsContainer-LyricsLine-paddingLine/);
	assert.equal(props.hiddenFromAccessibility, true);
});
