#!/usr/bin/env node
// Builds the mobile motion lyrics page: one self-contained HTML file the iOS
// and Android apps load in a WebView (mobile/motion/MotionLyricsMobileHost.js
// explains how it runs). The motion scripts and their rules in style.css are
// taken as they are, so the apps play exactly the desktop presentation.
//
//   node .github/scripts/build_motion_mobile.mjs --out <file> [--out <file>...]
//   node .github/scripts/build_motion_mobile.mjs --check <file> [--check <file>...]
//
// The output depends only on the sources (no dates), so --check tells whether
// an app's copy is the current build.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Load order: the segmenters and Preact, the host (it stands in for the
// desktop app the motion scripts read), then the motion scripts.
export const SCRIPTS = Object.freeze([
	"TinySegmenter.js",
	"LyricsWordSegmenter.js",
	"third_party/preact/preact.umd.js",
	"third_party/preact/hooks.umd.js",
	"mobile/motion/MotionLyricsMobileHost.js",
	"MotionLyricsShapes.js",
	"MotionLyricsType.js",
	"MotionLyricsDirector.js",
	"MotionLyrics.js",
]);
const CSS_START = "/* Motion lyrics (MotionLyrics.js): boards of lyric lines placed in a 3D world";
const CSS_END = "/* The video background turns and zooms with the motion camera. */";
const PRETENDARD = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

const read = (name) => readFileSync(resolve(ROOT, name), "utf8");

/** The motion rules of style.css. */
export const motionCss = (styleCss = read("style.css")) => {
	const start = styleCss.indexOf(CSS_START);
	const end = styleCss.indexOf(CSS_END);
	if (start < 0 || end <= start) throw new Error("The motion lyrics rules were not found in style.css");
	return styleCss.slice(start, end).trimEnd() + "\n";
};

const inlineScript = (name) => {
	const source = read(name).replace(/\n\/\/# sourceMappingURL=.*\s*$/u, "\n");
	if (/<\/script|<!--/iu.test(source)) throw new Error(name + " cannot be inlined: it holds a script end tag or an HTML comment");
	return "<script>\n// " + name + "\n" + source.trimEnd() + "\n</script>";
};

const notice = (text) => text.trim().replace(/-->/gu, "-- >");

export const buildPage = () => {
	const css = motionCss() + "\n" + read("mobile/motion/motion-mobile.css");
	if (/<\/style/iu.test(css)) throw new Error("The styles cannot be inlined: they hold a style end tag");
	const scripts = SCRIPTS.map(inlineScript);
	const digest = createHash("sha256").update(css).update(scripts.join("\n")).digest("hex").slice(0, 16);
	return [
		"<!doctype html>",
		"<html lang=\"en\" data-motion-build=\"" + digest + "\">",
		"<head>",
		"<meta charset=\"utf-8\">",
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover\">",
		"<!-- ivLyrics motion lyrics for the mobile apps. Built by .github/scripts/build_motion_mobile.mjs in the ivLyrics repository; edit the sources there, not this file. -->",
		"<!-- Preact (third_party/preact):\n" + notice(read("third_party/preact/LICENSE")) + "\n-->",
		"<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
		"<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
		"<link rel=\"stylesheet\" href=\"" + PRETENDARD + "\">",
		"<style>\n" + css.trimEnd() + "\n</style>",
		"</head>",
		"<body>",
		"<div id=\"ivlyrics-motion-root\"></div>",
		...scripts,
		"<script>ivLyricsMotionHost.start();</script>",
		"</body>",
		"</html>",
		"",
	].join("\n");
};

const main = () => {
	const args = process.argv.slice(2);
	const targets = { out: [], check: [] };
	for (let index = 0; index < args.length; index += 2) {
		const kind = args[index].replace(/^--/u, "");
		if (!targets[kind] || !args[index + 1]) throw new Error("Usage: build_motion_mobile.mjs --out <file> | --check <file>");
		targets[kind].push(resolve(args[index + 1]));
	}
	if (!targets.out.length && !targets.check.length) throw new Error("Usage: build_motion_mobile.mjs --out <file> | --check <file>");
	const page = buildPage();
	for (const file of targets.out) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, page);
		console.log("wrote " + file + " (" + Buffer.byteLength(page) + " bytes)");
	}
	let stale = 0;
	for (const file of targets.check) {
		const current = readFileSync(file, "utf8") === page;
		console.log((current ? "current " : "STALE   ") + file);
		if (!current) stale += 1;
	}
	if (stale) process.exitCode = 1;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
