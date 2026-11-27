import assert from "node:assert/strict";
import test from "node:test";
import { getSyncCreatorPreviewVocalRowLine, useSyncCreatorLivePreview } from "#ivlyrics/features/sync/syncCreatorLivePreview.mjs";
import { buildSyncCreatorPreviewLines } from "#ivlyrics/features/sync/syncCreatorPreviewLines.mjs";
import { sanitizeSyncCreatorLastCharEnds } from "#ivlyrics/features/sync/timingValidation.mjs";

// The karaoke renderer prepares a line (timed glyphs, furigana, glyph element
// cache, live paint data) once per line object. The preview clock renders about
// every 16 ms, so a multi-vocal line must hand it the same row objects on every
// frame, and a row must never outlive the preview line and voice it was built for.

const lyricsLines = ["ABCD", "End"];
const lineCharOffsets = [0, 4];
const lineMetadata = {
	normalizeSpeaker: speaker => speaker || "NORMAL", defaultSpeaker: "NORMAL",
	normalizeKind: kind => kind || "vocal", defaultKind: "vocal", normalizeStyleRanges: () => [],
};
const duet = ({ echoTimes = [1.2, 1.3], echoSpeaker = "DUET 2", echoKind = "whisper" } = {}) => ({ lines: [
	{ start: 0, end: 3, chars: [1, 1.1, ...echoTimes], parallel: { parts: [
		{ id: "lead", role: "lead", speaker: "DUET 1", ranges: [{ start: 0, end: 1 }], chars: [1, 1.1] },
		{ id: "echo", role: "background", speaker: echoSpeaker, kind: echoKind, ranges: [{ start: 2, end: 3 }], chars: echoTimes },
	] } },
	{ start: 4, end: 6, chars: [4, 4.1, 4.2] },
] });
const buildLines = syncData => buildSyncCreatorPreviewLines({
	lyricsLines, lineCharOffsets, syncBody: sanitizeSyncCreatorLastCharEnds(syncData),
	getMergedLineIndexesForStart: index => [index], ...lineMetadata,
});
// The row the preview built on every frame before rows were kept.
const rowAsBuiltPerFrame = (line, part) => ({
	...line,
	interludeInfo: undefined,
	text: part.text,
	originalText: part.text,
	syllables: part.syllables,
	vocals: undefined,
	speaker: part.speaker,
	"speaker-color": part["speaker-color"] || "",
	"speaker-fallback": part["speaker-fallback"] || "",
	kind: part.kind || line.kind,
});
const deepFreeze = (value) => {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const child of Object.values(value)) deepFreeze(child);
	return value;
};
const find = (node, type) => {
	if (Array.isArray(node)) return node.flatMap(child => find(child, type));
	if (!node || typeof node !== "object") return [];
	return [...(node.type === type ? [node] : []), ...find(node.children, type)];
};
const renderPreview = (syncData, { freezeMemos = false } = {}) => {
	const liveClock = { getPosition: () => 1400 };
	const react = {
		Component: class {},
		createElement: (type, props, ...children) => ({ type, props, children }),
		// A frozen memo turns any write into the preview's data into a TypeError.
		useMemo: compute => (freezeMemos ? deepFreeze(compute()) : compute()),
		useRef: current => ({ current }),
		useEffect: () => {},
	};
	const { renderLivePreviewOverlay } = useSyncCreatorLivePreview({
		react, mode: "preview", setMode: () => {}, syncData, lyricsLines, lineCharOffsets,
		getMergedLineIndexesForStart: index => [index],
		materializeSyncCreatorParallelDrafts: data => data,
		lineMetadata,
		playbackTimeline: [{ startTime: 1000, lineIndex: 0 }, { startTime: 4000, lineIndex: 1 }],
		currentLineIndex: 0,
		positionStore: { get: liveClock.getPosition },
		SyncCreatorLivePreviewClock: "clock",
		getLiveClock: () => liveClock,
		currentLineChars: ["A", "B", "C", "D"],
		getRenderer: () => ({ LyricsLineBlock: "line", IdlingIndicator: "prelude" }),
		getVisualSettings: () => ({}),
		getDocument: () => ({ addEventListener() {}, removeEventListener() {}, querySelector: () => null }),
		translate: key => key,
	});
	const overlayAt = renderLivePreviewOverlay().props.render;
	return position => find(overlayAt(position), "line").map(node => node.props.line);
};

test("a multi-vocal preview line hands the renderer the same rows on every clock frame", () => {
	const rowsAt = renderPreview(duet());
	const first = rowsAt(1400);
	assert.deepEqual(first.map(row => row.text), ["AB", "CD"]);
	for (const position of [1416, 1433, 1450, 1466]) {
		const rows = rowsAt(position);
		assert.equal(rows.length, first.length);
		rows.forEach((row, index) => assert.equal(row, first[index], "frame " + position + " keeps row " + index));
	}
	// The kept rows hold exactly what the per-frame construction produced.
	const [line] = buildLines(duet());
	assert.deepEqual(first, [line.vocals.lead, ...line.vocals.background].map(part => rowAsBuiltPerFrame(line, part)));
});

test("a row belongs to one preview line and voice", () => {
	const [line] = buildLines(duet());
	const [rebuilt] = buildLines(duet());
	// Every build makes its own parts, so a row can never come from an earlier build.
	assert.notEqual(rebuilt.vocals.lead, line.vocals.lead);
	assert.notEqual(rebuilt.vocals.background[0], line.vocals.background[0]);
	assert.notEqual(line.vocals.lead, line.vocals.background[0]);
	const lead = getSyncCreatorPreviewVocalRowLine(line, line.vocals.lead);
	assert.equal(getSyncCreatorPreviewVocalRowLine(line, line.vocals.lead), lead);
	assert.notEqual(getSyncCreatorPreviewVocalRowLine(rebuilt, rebuilt.vocals.lead), lead);
	const echo = getSyncCreatorPreviewVocalRowLine(line, line.vocals.background[0]);
	assert.notEqual(echo, lead);
	assert.deepEqual(echo, rowAsBuiltPerFrame(line, line.vocals.background[0]));
	// Another line holding the same parts (an interlude's display copy) gets its own row.
	const copy = { ...line, startTime: line.startTime + 5, kind: "shout" };
	const copied = getSyncCreatorPreviewVocalRowLine(copy, line.vocals.lead);
	assert.notEqual(copied, lead);
	assert.deepEqual(copied, rowAsBuiltPerFrame(copy, line.vocals.lead));
	assert.deepEqual(getSyncCreatorPreviewVocalRowLine(line, line.vocals.lead), rowAsBuiltPerFrame(line, line.vocals.lead));
	// Defaults are unchanged: missing colours become "", a part without a kind takes the line's.
	const bare = { text: "XY", syllables: [], speaker: "NORMAL" };
	assert.deepEqual(getSyncCreatorPreviewVocalRowLine({ kind: "vocal", text: "XY" }, bare), rowAsBuiltPerFrame({ kind: "vocal", text: "XY" }, bare));
});

test("edited timing, speaker or effect reaches the preview rows at once", () => {
	const before = renderPreview(duet())(1400);
	const retimed = renderPreview(duet({ echoTimes: [1.25, 1.35] }))(1400);
	assert.notEqual(retimed[1], before[1]);
	assert.deepEqual(before[1].syllables.map(syllable => syllable.startTime), [1200, 1300]);
	assert.deepEqual(retimed[1].syllables.map(syllable => syllable.startTime), [1250, 1350]);
	const restyled = renderPreview(duet({ echoSpeaker: "DUET 3", echoKind: "shout" }))(1400);
	assert.equal(restyled[1].speaker, "DUET 3");
	assert.equal(restyled[1].kind, "shout");
	assert.equal(before[1].speaker, "DUET 2");
	assert.equal(before[1].kind, "whisper");
});

test("the preview never writes to its lines, parts or syllables", () => {
	const rowsAt = renderPreview(duet(), { freezeMemos: true });
	const first = rowsAt(1400);
	assert.equal(first.length, 2);
	assert.ok(Object.isFrozen(first[0].syllables) && Object.isFrozen(first[0].syllables[0]));
	for (const position of [700, 1416, 3200, 4100, 1400]) assert.doesNotThrow(() => rowsAt(position));
	assert.deepEqual(rowsAt(1400), first);
});

