#!/usr/bin/env node
// Builds the Pronunciation Lab page for the mobile apps: one HTML file the iOS,
// Android and LSPatch apps load in a hidden WebView
// (src/providers/ai/pronunciationLabMobileBridge.mjs explains how it runs).
// The engine is shared with the Spicetify provider. The pronunciation-lab
// library itself is never copied into the page: the page imports the newest
// release from jsDelivr at run time.
//
//   node .github/scripts/build_pronunciation_lab_mobile.mjs --out <file> [--out <file>...]
//   node .github/scripts/build_pronunciation_lab_mobile.mjs --check <file> [--check <file>...]
//
// The output depends only on the sources (no dates), so --check tells whether
// an app's copy is the current build.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BRIDGE_ENTRY = "src/providers/ai/pronunciationLabMobileBridge.mjs";

const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

export const bridgeScript = () => buildSync({
	absWorkingDir: ROOT,
	stdin: {
		contents: "import { installPronunciationLabBridge } from \"./" + BRIDGE_ENTRY + "\";\ninstallPronunciationLabBridge();\n",
		resolveDir: ROOT,
		sourcefile: "pronunciation-lab-page.mjs",
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	charset: "utf8",
	keepNames: true,
	legalComments: "inline",
	logLevel: "silent",
}).outputFiles[0].text.replace(/\n\/\/# sourceMappingURL=.*\s*$/u, "\n");

export const buildPage = () => {
	const script = bridgeScript();
	if (/<\/script|<!--/iu.test(script)) throw new Error("The bridge cannot be inlined: it holds a script end tag or an HTML comment");
	const digest = createHash("sha256").update(script).digest("hex").slice(0, 16);
	return [
		"<!doctype html>",
		"<html lang=\"en\" data-pronunciation-lab-build=\"" + digest + "\">",
		"<head>",
		"<meta charset=\"utf-8\">",
		"<!-- ivLyrics Pronunciation Lab bridge for the mobile apps. Built by .github/scripts/build_pronunciation_lab_mobile.mjs in the ivLyrics repository; edit the sources there, not this file. -->",
		"<!-- pronunciation-lab (https://github.com/ivLis-Studio/pronunciation-lab, GPL-3.0) is not part of this page. The page imports the newest release from jsDelivr at run time. -->",
		"</head>",
		"<body>",
		"<script>\n" + script.trimEnd() + "\n</script>",
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
		if (!targets[kind] || !args[index + 1]) throw new Error("Usage: build_pronunciation_lab_mobile.mjs --out <file> | --check <file>");
		targets[kind].push(resolve(args[index + 1]));
	}
	if (!targets.out.length && !targets.check.length) throw new Error("Usage: build_pronunciation_lab_mobile.mjs --out <file> | --check <file>");
	const page = buildPage();
	for (const file of targets.out) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, page);
		console.log("wrote " + file + " (" + Buffer.byteLength(page) + " bytes)");
	}
	let stale = 0;
	for (const file of targets.check) {
		const current = readText(file) === page;
		console.log((current ? "current " : "STALE   ") + file);
		if (!current) stale += 1;
	}
	if (stale) process.exitCode = 1;
};

if (import.meta.main ?? (process.argv[1] && import.meta.url === import.meta.resolve(pathToFileURL(process.argv[1]).href))) main();
