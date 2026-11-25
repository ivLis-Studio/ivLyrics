import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { readKaraokeRendererDeclarations } from "./fixtures/karaoke-renderer-declarations.mjs";
import { getRuntimeService as getPageRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { createSyncCreatorVocalStyles } from "#ivlyrics/features/sync/syncCreatorVocalStyles.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { getSyncCreatorPreviewVariables, useSyncCreatorLivePreview } from "#ivlyrics/features/sync/syncCreatorLivePreview.mjs";

const creatorSource = readFileSync(new URL("../src/features/sync/SyncDataCreator.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const previewSource = readFileSync(new URL("../src/features/sync/syncCreatorLivePreview.mjs", import.meta.url), "utf8");
const pageSource = readKaraokeRendererDeclarations();
const styles = readPcStylesheet();

const section = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing section: ${startMarker}`);
	return source.slice(start, end);
};

test("the page and creator use the shared renderer code", () => {
	assert.match(
		pageSource,
		/import \{ getLyricsTypographyStyleVariables as getPageLyricsTypography \} from "#ivlyrics\/lyrics\/lyricsTypography\.mjs";/,
		"the page must import its typography variables from the shared module"
	);
	assert.match(creatorSource, /getRenderer: readLyricRenderer/);
	const composer = readFileSync(new URL("../src/spicetify/composePageMenus.js", import.meta.url), "utf8");
	assert.match(composer, /readLyricRenderer: \(\) => lyricRendererPrimitives/);
});

test("the sync preview builds lyric variables from the shared typography contract", () => {
	const vars = section(previewSource, "export function getSyncCreatorPreviewVariables", "export function useSyncCreatorLivePreview");
	assert.match(vars, /getLyricsTypographyStyleVariables/, "font/shadow/outline metrics must not be duplicated");
	assert.doesNotMatch(vars, /"--lyrics-phonetic-font-size"/, "the preview must not keep its own metric table");
	assert.match(vars, /SYNC_CREATOR_PREVIEW_CONTAINER_VAR_EXCLUSIONS/, "the minimized page's pin must not disable the preview's glow");
});

test("preview shadow variables survive the minimized page behind the editor", () => {
	const visual = {
		"text-shadow-enabled": true,
		"text-shadow-blur": "3",
		"text-shadow-color": "#000000",
		"text-shadow-opacity": "50",
		"active-color": "#abcdef",
		"inactive-color": "#123456",
		"font-size": "40",
	};
	const result = getSyncCreatorPreviewVariables({
		visualConfig: visual,
		readComputedStyle: () => ({
			// The sync creator hides the page and pins these to neutral values.
			getPropertyValue: (name) => ({
				"--lyrics-shadow-enabled": "0",
				"--lyrics-text-shadow": "0 0 0 transparent",
				"--lyrics-text-drop-shadow": "none",
				"--lyrics-active-probe": "ignored",
			}[name] ?? ""),
		}),
		getLyricsContainer: () => ({}),
		editorGlyphSize: 32,
	});
	assert.equal(result["--lyrics-shadow-enabled"], 1, "the glow switch must come from the shared contract");
	assert.equal(result["--lyrics-text-shadow"], "0 0 3px rgba(0, 0, 0, 0.5)");
	assert.equal(result["--lyrics-text-drop-shadow"], "drop-shadow(0 0 3px rgba(0, 0, 0, 0.5))");
	assert.equal(result["--lyrics-original-font-size"], "32px", "the editor box still owns the glyph size");
});

test("the preview mounts the production synced page shell", () => {
	assert.match(
		previewSource,
		/className: `sync-creator-live-preview-stage lyrics-lyricsContainer-SyncedLyricsPage is-karaoke\$\{[^}]*karaoke-line-transition-enabled/,
		"page-scoped karaoke rules need the same page classes as the app"
	);
	assert.match(
		previewSource,
		/className: ['"]sync-creator-live-preview-rows lyrics-lyricsContainer-SyncedLyrics['"]/,
		"rows must live in the same list element the page uses"
	);
});

test("the preview passes a real settings revision instead of freezing it", () => {
	assert.doesNotMatch(previewSource, /settingsRevision: 0/, "a frozen revision keeps stale renderer caches");
	assert.match(previewSource, /settingsRevision: previewSettingsRevision/, "the renderer needs the live revision");
});

test("the live preview uses the playback line, both vocals and the original Escape handler", () => {
	const changes = [];
	const listeners = new Map();
	let cleanup;
	const syncData = { lines: [
		{ start: 0, end: 3, chars: [1, 1.1, 1.2, 1.3], parallel: { parts: [
			{ id: 'lead', role: 'lead', ranges: [{ start: 0, end: 1 }], chars: [1, 1.1] },
			{ id: 'echo', role: 'background', ranges: [{ start: 2, end: 3 }], chars: [1.2, 1.3] },
		] } },
		{ start: 4, end: 6, chars: [4, 4.1, 4.2] },
	] };
	const liveClock = { getPosition: () => 1400 };
	const react = {
		Component: class {},
		createElement: (type, props, ...children) => ({ type, props, children }),
		useMemo: compute => compute(),
		useRef: current => ({ current }),
		useEffect: effect => { cleanup = effect(); },
	};
	const { renderLivePreviewOverlay } = useSyncCreatorLivePreview({
		react,
		mode: 'preview',
		setMode: mode => changes.push(mode),
		syncData,
		lyricsLines: ['ABCD', 'End'],
		lineCharOffsets: [0, 4],
		getMergedLineIndexesForStart: index => [index],
		materializeSyncCreatorParallelDrafts: data => data,
		lineMetadata: {
			normalizeSpeaker: speaker => speaker || 'NORMAL', defaultSpeaker: 'NORMAL',
			normalizeKind: kind => kind || 'vocal', defaultKind: 'vocal', normalizeStyleRanges: () => [],
		},
		playbackTimeline: [{ startTime: 1000, lineIndex: 0 }, { startTime: 4000, lineIndex: 1 }],
		currentLineIndex: 0,
		positionStore: { get: liveClock.getPosition },
		SyncCreatorLivePreviewClock: 'clock',
		getLiveClock: () => liveClock,
		currentLineChars: ['A', 'B', 'C', 'D'],
		getRenderer: () => ({ LyricsLineBlock: 'line', IdlingIndicator: 'prelude' }),
		getVisualSettings: () => ({}),
		getDocument: () => ({
			addEventListener: (event, handler) => listeners.set(event, handler),
			removeEventListener: event => listeners.delete(event),
			querySelector: () => null,
		}),
		translate: key => key,
	});
	const find = (node, type) => {
		if (Array.isArray(node)) return node.flatMap(child => find(child, type));
		if (!node || typeof node !== "object") return [];
		return [...(node.type === type ? [node] : []), ...find(node.children, type)];
	};
	const overlayAt = renderLivePreviewOverlay().props.render;
	assert.equal(find(overlayAt(700), 'prelude').length, 1);
	const duet = find(overlayAt(1400), 'line');
	assert.deepEqual(duet.map(node => node.props.mainText), ['AB', 'CD']);
	assert.ok(duet.every(node => node.props.position === 1400 && node.props.liveClock === liveClock));
	assert.equal(find(overlayAt(4100), 'line')[0].props.mainText, 'End');
	listeners.get('keydown')({ key: 'Escape' });
	assert.deepEqual(changes, ['idle']);
	cleanup();
	assert.equal(listeners.size, 0);
});

test("the preview page shell resets only the page layout it borrows", () => {
	assert.match(
		styles,
		/\.sync-creator-live-preview-stage\.lyrics-lyricsContainer-SyncedLyricsPage\s*\{[^}]*height: auto[^}]*\}/,
		"the borrowed page grid must not clip or zero-height the preview"
	);
	assert.match(
		styles,
		/\.sync-creator-live-preview-rows\.lyrics-lyricsContainer-SyncedLyrics\s*\{[^}]*height: auto[^}]*\}/,
		"the borrowed zero-height list must expand inside the preview"
	);
	assert.match(
		styles,
		/\.lyrics-lyricsContainer-SyncedLyrics:not\(\.settings-live-preview-line\):not\(\.sync-creator-live-preview-rows\)::before/,
		"the page hover hit-area must not be added inside the preview"
	);
});

test("the editor field uses the app's lyric colour for NORMAL lines", () => {
	// The lyric pages have no NORMAL speaker palette entry: a NORMAL line is
	// painted with the listener's active lyric colour. The editor stage used to
	// paint it with the hardcoded #f2f4f7 palette white, so the field showed a
	// white base the preview (and the app) never show.
	let activeColor = '#123456';
	const { getSyncCreatorSpeakerTextColor } = createSyncCreatorVocalStyles({
		getSpeakerColors: () => ({ getTextColor: () => '#ffffff' }),
		getActiveColor: () => activeColor,
		translate: () => '',
	});
	assert.equal(getSyncCreatorSpeakerTextColor('NORMAL'), '#123456');
	activeColor = '#abcdef';
	assert.equal(getSyncCreatorSpeakerTextColor('NORMAL 1'), '#abcdef');
	activeColor = '';
	assert.equal(getSyncCreatorSpeakerTextColor('NORMAL'), 'var(--spice-text)');
});

test("a NORMAL range resets the line speaker's colour to the page colours", () => {
	// The row carries the line speaker's colour (e.g. DUET 4). A range that
	// explicitly selects NORMAL must fall back to the page's lyric colours;
	// otherwise it inherits the row colour and the range is invisible.
	assert.match(
		styles,
		/\.lyrics-lyricsContainer-SyncedLyrics\s*\{[^}]*--iv-page-lyrics-color-active:\s*var\(--lyrics-color-active\)/,
		"the list must capture the page-level active colour"
	);
	assert.match(
		styles,
		/\.lyrics-lyricsContainer-SyncedLyrics\s*\{[^}]*--iv-page-lyrics-color-inactive:\s*var\(--lyrics-color-inactive\)/,
		"the list must capture the page-level inactive colour"
	);
	assert.match(
		styles,
		/\.ivlyrics-karaoke-range-style\.speaker-normal\s*\{[^}]*--lyrics-color-active:\s*var\(--iv-page-lyrics-color-active\)/,
		"NORMAL ranges must reset the active colour"
	);
	assert.match(
		styles,
		/\.ivlyrics-karaoke-range-style\.speaker-normal\s*\{[^}]*--lyrics-color-inactive:\s*var\(--iv-page-lyrics-color-inactive\)/,
		"NORMAL ranges must reset the inactive colour"
	);
});

test("a NORMAL range keeps a speaker class so it can reset the row colour", () => {
	// The app's speaker resolver has no NORMAL palette entry, so it returns an
	// empty class. Without a class the renderer drops the range entirely and the
	// glyphs inherit the line speaker's colour.
	const code = [
		'const PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT = Symbol.for("ivLyrics.speakerColors.classNameContract");',
		section(pageSource, "const KARAOKE_TEXT_EFFECT_KIND_CLASSES = new Set([", "const getKaraokeLineMetaClass"),
		section(pageSource, "const getKaraokeSpeakerPresentation =", "const PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT"),
		section(pageSource, "const normalizeKaraokeSpeakerClass =", "const KARAOKE_TEXT_EFFECT_KIND_CLASSES = new Set(["),
		section(pageSource, "const getKaraokeInlineStylePresentation =", "const wrapKaraokeInlineStyleRuns ="),
		"globalThis.pick = getKaraokeInlineStylePresentation;",
	].join("\n");
	const context = vm.createContext({
		getPageRuntimeService,
		CONFIG: { visual: { "karaoke-text-effects": true, "sync-data-custom-speaker-colors-enabled": true } },
		window: {
			ivLyricsSpeakerColors: {
				getPresentation: (speaker) => ({
					speakerClass: String(speaker || "").toUpperCase() === "NORMAL" ? "" : "duet-4",
					creatorColor: "",
				}),
			},
		},
		console,
		prefersReducedLyricsMotion: () => false,
	});
	vm.runInContext(code, context);
	const presentation = context.pick({ inlineStyle: true, styleKind: "", styleSpeaker: "NORMAL" });
	assert.ok(presentation, "a NORMAL range must still produce a presentation");
	assert.match(presentation.className, /\bspeaker-normal\b/, "the reset class is required");
	assert.match(
		pageSource,
		/const getKaraokeTextRunPresentation[\s\S]{0,500}getKaraokeInlineSpeakerClass/,
		"shaped text runs need the same class fallback"
	);
});

test("shadow-based word effects reach the glyphs of the shared renderer", () => {
	// The renderer wraps a styled word in .ivlyrics-karaoke-range-style, but the
	// glyphs inside reset text-shadow to none. Effects that animate text-shadow
	// would then only show in the editor's own char spans, never in the app or
	// the preview, because the animated value cannot cross that reset.
	assert.match(
		styles,
		/\.lyrics-karaoke-line\s+\.ivlyrics-karaoke-range-style:not\(\.text-effects-disabled\):is\(\.sparkle, \.echo, \.glow, \.glitch\)[^{]*\.lyrics-karaoke-char[^{]*\{[^}]*text-shadow: inherit/,
		"the range wrapper's animated shadow must be inherited by the glyph"
	);
	assert.match(
		styles,
		/\.lyrics-karaoke-line\s+\.ivlyrics-karaoke-range-style:not\(\.text-effects-disabled\):is\(\.sparkle, \.echo, \.glow, \.glitch\)[^{]*\.lyrics-karaoke-text-run-segment[^{]*\{[^}]*text-shadow: inherit/,
		"shaped text runs need the same hand-off"
	);
});
