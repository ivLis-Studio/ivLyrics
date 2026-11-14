import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const creatorSource = readFileSync(new URL("../SyncDataCreator.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pageSource = readFileSync(new URL("../Pages.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const section = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing section: ${startMarker}`);
	return source.slice(start, end);
};

test("the renderer exports its typography contract for other previews", () => {
	assert.match(
		pageSource,
		/window\.ivLyricsLyricRendererPrimitives = Object\.freeze\(\{[\s\S]*?\n\tgetLyricsTypographyStyleVariables,/,
		"the editor preview must be able to reuse the page's typography/shadow variables"
	);
});

test("the sync preview builds lyric variables from the shared typography contract", () => {
	const vars = section(
		creatorSource,
		"const livePreviewLyricVars = useMemo(() => {",
		"}, [showLivePreview, previewVisualSignature]);"
	);
	assert.match(vars, /getLyricsTypographyStyleVariables/, "font/shadow/outline metrics must not be duplicated");
	assert.doesNotMatch(vars, /"--lyrics-phonetic-font-size"/, "the preview must not keep its own metric table");
	assert.match(vars, /SYNC_CREATOR_PREVIEW_CONTAINER_VAR_EXCLUSIONS/, "the minimized page's pin must not disable the preview's glow");
});

test("preview shadow variables survive the minimized page behind the editor", () => {
	const body = section(
		creatorSource,
		"const livePreviewLyricVars = useMemo(() => {",
		"}, [showLivePreview, previewVisualSignature]);"
	);
	const start = body.indexOf("() => {") + "() => {".length;
	const run = new Function(
		"window", "document", "editorGlyphSize", "SYNC_CREATOR_PREVIEW_CONTAINER_VAR_EXCLUSIONS",
		`return (() => {${body.slice(start)}})();`
	);
	const visual = {
		"text-shadow-enabled": true,
		"text-shadow-blur": "3",
		"text-shadow-color": "#000000",
		"text-shadow-opacity": "50",
		"active-color": "#abcdef",
		"inactive-color": "#123456",
		"font-size": "40",
	};
	const result = run(
		{
			CONFIG: { visual },
			ivLyricsLyricRendererPrimitives: {
				getLyricsTypographyStyleVariables: (config) => ({
					"--lyrics-font-size": `${config["font-size"]}px`,
					"--lyrics-shadow-enabled": config["text-shadow-enabled"] ? 1 : 0,
					"--lyrics-text-shadow": config["text-shadow-enabled"] ? "0 0 3px rgba(0,0,0,.5)" : "0 0 0 transparent",
					"--lyrics-text-drop-shadow": config["text-shadow-enabled"] ? "drop-shadow(0 0 3px rgba(0,0,0,.5))" : "none",
				}),
			},
			getComputedStyle: () => ({
				// The sync creator hides the page and pins these to neutral values.
				getPropertyValue: (name) => ({
					"--lyrics-shadow-enabled": "0",
					"--lyrics-text-shadow": "0 0 0 transparent",
					"--lyrics-text-drop-shadow": "none",
					"--lyrics-active-probe": "ignored",
				}[name] ?? ""),
			}),
		},
		{ querySelector: () => ({}) },
		32,
		new Set(["--lyrics-text-shadow", "--lyrics-shadow-enabled", "--lyrics-text-drop-shadow"])
	);
	assert.equal(result["--lyrics-shadow-enabled"], 1, "the glow switch must come from the shared contract");
	assert.equal(result["--lyrics-text-shadow"], "0 0 3px rgba(0,0,0,.5)");
	assert.equal(result["--lyrics-text-drop-shadow"], "drop-shadow(0 0 3px rgba(0,0,0,.5))");
	assert.equal(result["--lyrics-original-font-size"], "32px", "the editor box still owns the glyph size");
});

test("the preview mounts the production synced page shell", () => {
	assert.match(
		creatorSource,
		/className: `sync-creator-live-preview-stage lyrics-lyricsContainer-SyncedLyricsPage is-karaoke\$\{[^}]*karaoke-line-transition-enabled/,
		"page-scoped karaoke rules need the same page classes as the app"
	);
	assert.match(
		creatorSource,
		/className: ['"]sync-creator-live-preview-rows lyrics-lyricsContainer-SyncedLyrics['"]/,
		"rows must live in the same list element the page uses"
	);
});

test("the preview passes a real settings revision instead of freezing it", () => {
	assert.doesNotMatch(creatorSource, /settingsRevision: 0/, "a frozen revision keeps stale renderer caches");
	assert.match(creatorSource, /settingsRevision: previewSettingsRevision/, "the renderer needs the live revision");
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
	const fn = section(
		creatorSource,
		"const getSyncCreatorSpeakerTextColor =",
		"const getSyncCreatorHexColorWithAlpha"
	);
	assert.match(
		fn,
		/fallbackSpeaker === 'NORMAL'[\s\S]{0,160}active-color/,
		"NORMAL must resolve to the lyric page's active colour, not the editor palette"
	);
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
