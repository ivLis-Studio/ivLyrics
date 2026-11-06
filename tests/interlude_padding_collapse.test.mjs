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
	// The trailing dots own the layout alone: the anchor lyric collapses with the sung rows.
	const anchor = row(result, 'Inline styled voice');
	assert.ok(anchor, 'the anchor lyric must stay rendered');
	assert.match(anchor.className, /lyrics-lyricsContainer-LyricsLine-paddingLine/);
	assert.equal(anchor.hiddenFromAccessibility, true, 'the anchor lyric must leave the accessibility tree while the trailing dots own the layout');
	// Every upcoming vocal stays readable.
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

test('keeping previous lyrics respects the configured count around a virtual instrumental marker', () => {
	for (const compact of [true, false]) {
		for (const before of [0, 1, 2, 3]) {
			const engine = createEngine(currentSource);
			engine.CONFIG.visual['instrumental-break-keep-previous'] = true;
			engine.CONFIG.visual['lines-before'] = before;
			const result = engine.render(makeLyrics(), 7200, { compact });
			const texts = ['First vocal', 'Overlapping response', 'Inline styled voice'];
			texts.forEach((text, index) => {
				assert.equal(row(result, text).hiddenFromAccessibility, texts.length - index > before,
					`${compact ? 'compact' : 'expanded'} ${before} previous: ${text}`);
			});
			const marker = result.elements.find(element => element.props.line?.isVirtualTrailingInterlude)?.props;
			assert.ok(marker?.isCurrentLine, 'the instrumental marker remains active');
			assert.equal(marker.hiddenFromAccessibility, false);
			assert.equal(row(result, '日本語の声').hiddenFromAccessibility, false, 'upcoming lyrics are unaffected');
		}
	}
});

test('keeping previous lyrics also applies to explicit instrumental rows and line-synced lyrics', () => {
	const lyrics = [lyric(1000, 1500, 'First'), lyric(2000, 2500, 'Second'),
		{ startTime: 3000, text: '♪' }, lyric(7000, 8000, 'Next')];
	for (const isKara of [true, false]) for (const before of [0, 1, 2]) {
		const engine = createEngine(currentSource);
		engine.CONFIG.visual['instrumental-break-keep-previous'] = true;
		engine.CONFIG.visual['lines-before'] = before;
		const result = engine.render(lyrics, 4000, { isKara });
		assert.equal(row(result, 'First').hiddenFromAccessibility, before < 2);
		assert.equal(row(result, 'Second').hiddenFromAccessibility, before < 1);
		assert.equal(row(result, 'Next').hiddenFromAccessibility, false);
	}
});

test('the option updates a cached interlude immediately and preserves manual browsing', () => {
	const engine = createEngine(currentSource);
	const lyrics = makeLyrics();
	engine.CONFIG.visual['lines-before'] = 1;
	const render = () => engine.render(lyrics, 7200);
	assert.equal(row(render(), 'Inline styled voice').hiddenFromAccessibility, true);
	engine.CONFIG.visual['instrumental-break-keep-previous'] = true;
	assert.equal(row(render(), 'Inline styled voice').hiddenFromAccessibility, false);
	engine.CONFIG.visual['instrumental-break-keep-previous'] = false;
	assert.equal(row(render(), 'Inline styled voice').hiddenFromAccessibility, true);
	engine.setScrolling(true);
	for (const enabled of [false, true]) {
		engine.CONFIG.visual['instrumental-break-keep-previous'] = enabled;
		assert.ok(render().elements.every(element => element.props.hiddenFromAccessibility !== true));
	}
});

test('ordinary playback remains unchanged and the last lyric can stay above the outro marker', () => {
	const engine = createEngine(currentSource);
	const lyrics = makeLyrics();
	for (const position of [2000, 8500]) {
		engine.CONFIG.visual['instrumental-break-keep-previous'] = false;
		const before = JSON.parse(JSON.stringify(engine.render(lyrics, position)));
		engine.CONFIG.visual['instrumental-break-keep-previous'] = true;
		assert.deepEqual(JSON.parse(JSON.stringify(engine.render(lyrics, position))), before);
	}
	engine.CONFIG.visual['lines-before'] = 1;
	const outro = engine.render(lyrics, 16000);
	assert.equal(row(outro, 'Final vocal').hiddenFromAccessibility, false);
	assert.ok(outro.elements.some(element => element.props.line?.isVirtualTrailingInterlude));
});
