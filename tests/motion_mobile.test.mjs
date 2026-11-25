import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { SCRIPTS, buildPage, motionCss, readMotionScript } from "../.github/scripts/build_motion_mobile.mjs";
import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";

const scripts = new Map(SCRIPTS.map((name) => [name, readMotionScript(name)]));

// The mobile page in a bare window: Preact is replaced by a recorder, the app by a message list.
const load = () => {
	let clock = 1000;
	const posted = [];
	const rendered = [];
	const rootStyle = new Map();
	const classes = new Set();
	const container = { id: "ivlyrics-motion-root" };
	const window = {
		navigator: { language: "ko" },
		performance: { now: () => clock },
		setTimeout,
		clearTimeout,
		requestAnimationFrame: () => 0,
		addEventListener() {},
		preact: {
			h: (type, props) => ({ type, props }),
			render: (node) => rendered.push(node),
		},
		preactHooks: { useEffect() {}, useLayoutEffect() {}, useMemo() {}, useRef() {}, useState() {} },
		ivLyricsMotionNative: { postMessage: (message) => posted.push(JSON.parse(message)) },
		document: {
			documentElement: {
				style: { setProperty: (name, value) => rootStyle.set(name, value) },
				classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
			},
			body: { appendChild() {} },
			createElement: () => ({ style: {}, className: "", hidden: false }),
			getElementById: (id) => (id === container.id ? container : null),
		},
	};
	const context = vm.createContext({ window, Intl, console, navigator: window.navigator, setTimeout, clearTimeout });
	context.globalThis = context;
	for (const name of SCRIPTS) {
		if (name.startsWith("third_party/preact/")) continue;
		vm.runInContext(scripts.get(name), context);
	}
	return { window, host: window.ivLyricsMotionHost, posted, rendered, rootStyle, classes, advance: (ms) => { clock += ms; } };
};

const words = (parts, start, step = 300) => parts.map((text, index) => ({ text, startTime: start + index * step, endTime: start + (index + 1) * step }));
const song = (overrides = {}) => ({
	uri: "spotify:track:abc123",
	title: "Song",
	artist: "Singer",
	accent: "#3366ff",
	language: "en",
	lyrics: [
		{ text: "Every road will lead me back", startTime: 1000, endTime: 2800, syllables: words(["Every ", "road ", "will ", "lead ", "me ", "back"], 1000), text2: "모든 길은" },
		{ text: "to you", startTime: 3200, endTime: 3800, syllables: words(["to ", "you"], 3200) },
	],
	...overrides,
});

test("the page is one self-contained file holding the desktop motion scripts and rules", () => {
	const page = buildPage();
	assert.equal(page, buildPage(), "the build has no dates or random parts");
	assert.match(page, /^<!doctype html>\n<html lang="en" data-motion-build="[0-9a-f]{16}">/);
	let from = 0;
	for (const name of SCRIPTS) {
		const at = page.indexOf("<script>\n// " + name + "\n", from);
		assert.ok(at >= from, name + " is inlined in order");
		from = at + 1;
	}
	assert.ok(!/<script[^>]*\ssrc=/.test(page), "no script is fetched");
	assert.ok(page.includes(scripts.get("MotionLyrics.js").trimEnd()), "the shared motion entry is bundled inline");
	assert.ok(page.trimEnd().endsWith("<script>ivLyricsMotionHost.start();</script>\n</body>\n</html>"));
	const css = motionCss();
	assert.ok(css.startsWith("/* Motion lyrics (MotionLyrics.js)"));
	for (const selector of [".ivlyrics-motion-stage {", ".ivlyrics-motion-word", ".ivlyrics-motion-hud {", ".ivlyrics-motion-subtitle {"]) assert.ok(css.includes(selector), selector);
	assert.ok(!css.includes(".fullscreen-motion-notice"), "desktop-only rules stay out");
	assert.ok(page.includes(css.trimEnd()));
	assert.ok(readPcStylesheet().includes(css), "PC and mobile consume the same motion rules");
	assert.ok(page.includes("Copyright (c) 2015-present Jason Miller"), "Preact's licence travels with it");
});

test("the mobile asset check accepts CRLF and runs through a linked checkout path", context => {
	const folder = mkdtempSync(join(tmpdir(), "ivlyrics-motion-page-"));
	context.after(() => rmSync(folder, { recursive: true, force: true }));
	const page = join(folder, "MotionLyricsPage.html");
	const windowsPage = buildPage().replace(/\r?\n/g, "\r\n");
	writeFileSync(page, windowsPage);
	const linkedCheckout = join(folder, "linked checkout");
	symlinkSync(fileURLToPath(new URL("../", import.meta.url)), linkedCheckout, "junction");
	const script = join(linkedCheckout, ".github", "scripts", "build_motion_mobile.mjs");
	const result = spawnSync(process.execPath, [script, "--check", page], { encoding: "utf8" });
	assert.ifError(result.error);
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /current /);
	writeFileSync(page, windowsPage.replace('lang="en"', 'lang="ko"'));
	const stale = spawnSync(process.execPath, [script, "--check", page], { encoding: "utf8" });
	assert.ifError(stale.error);
	assert.equal(stale.status, 1, stale.stdout + stale.stderr);
	assert.match(stale.stdout, /STALE /);
});

test("the host shows the desktop Stage for songs with real word timing and tells the app", () => {
	const { window, host, posted, rendered } = load();
	host.start();
	assert.deepEqual(posted.at(-1), { type: "ready", version: window.ivLyricsMotionDirector.VERSION });
	assert.equal(rendered.at(-1), null, "nothing to show without a song");

	host.setTrack(song());
	assert.deepEqual(posted.at(-1), { type: "eligible", uri: "spotify:track:abc123", value: true });
	const stage = rendered.at(-1);
	assert.equal(stage.type, window.ivLyricsMotionLyrics.Stage);
	assert.equal(stage.props.trackUri, "spotify:track:abc123");
	assert.equal(stage.props.accent, "#3366ff");
	assert.equal(stage.props.isPlaying, false);
	assert.equal(stage.props.lyrics.length, 2);
	assert.equal(window.LyricsService.detectLanguage(), "en");
	assert.equal(window.Utils.getPlayerPlaybackSnapshot().uri, "spotify:track:abc123");

	const renders = rendered.length;
	host.setTrack(song());
	assert.equal(rendered.length, renders, "the same song again changes nothing");

	// Line-synced lyrics cannot play: the words would leave the singing.
	host.setTrack(song({ uri: "spotify:track:lines", lyrics: [{ text: "No word timing", startTime: 1000, endTime: 3000, syllables: [] }] }));
	assert.deepEqual(posted.at(-1), { type: "eligible", uri: "spotify:track:lines", value: false });
	assert.equal(rendered.at(-1), null);
	host.setTrack(song({ karaokeSource: "line-timing-pseudo" }));
	assert.equal(posted.at(-1).value, false, "estimated timing is turned down too");
	host.setTrack(null);
	assert.deepEqual(posted.at(-1), { type: "eligible", uri: "", value: false });
});

test("the playback clock runs between reports, eases small drift and takes seeks at once", () => {
	const { window, host, rendered, advance } = load();
	host.start();
	host.setTrack(song());
	host.setPlayback({ position: 5000, playing: false });
	advance(400);
	assert.equal(host.positionAt(window.performance.now()), 5000, "paused: the position holds");

	host.setPlayback({ position: 5000, playing: true });
	assert.equal(rendered.at(-1).props.isPlaying, true);
	advance(250);
	assert.equal(host.positionAt(window.performance.now()), 5250);
	assert.equal(window.ivLyricsLyricRendererPrimitives.getFrameAlignedLyricsPlaybackPosition(window.performance.now() + 16), 5266, "frames read their own time");
	assert.equal(window.Spicetify.Player.getProgress(), 5250);

	// The app's report is 40 ms ahead: the clock moves a fifth of the way, not all of it.
	host.setPlayback({ position: 5290, playing: true });
	assert.equal(host.positionAt(window.performance.now()), 5258);
	// A seek is taken as reported.
	host.setPlayback({ position: 42000, playing: true });
	assert.equal(host.positionAt(window.performance.now()), 42000);
	// Half speed.
	host.setPlayback({ position: 42000, playing: true, rate: 0.5 });
	advance(1000);
	assert.equal(host.positionAt(window.performance.now()), 42500);
	// Pausing without a position freezes the clock where it is.
	host.setPlayback({ playing: false });
	advance(900);
	assert.equal(host.positionAt(window.performance.now()), 42500);
	assert.equal(rendered.at(-1).props.isPlaying, false);
});

test("AI directions and the direction cache go through the app", async () => {
	const { window, host, posted } = load();
	host.start();
	const manager = window.AIAddonManager;
	assert.equal(manager.getEnabledProvidersFor("motionDirection").length, 0, "no provider until the app has one");
	host.configure({ ai: true, labels: { directing: "연출 중", failed: "실패" }, insets: { top: 12, right: 0, bottom: 21.5, left: 59 }, hud: false });
	assert.equal(manager.getEnabledProvidersFor("motionDirection").length, 1);
	assert.equal(manager.getEnabledProvidersFor("translate").length, 0);
	assert.equal(window.I18n.t("vinyl.presentation.motionDirecting"), "연출 중");
	assert.equal(window.I18n.t("vinyl.presentation.motionDirectFailed"), "실패");
	assert.equal(window.I18n.t("anything.else"), "");

	const lines = [{ n: 0, words: ["Every", "road"], start: 1, duration: 2, pause: 1, translation: "" }];
	const asked = manager.generateMotionDirection({ title: "Song", artist: "Singer", lines, tempo: { tempo: "fast" }, language: "en" });
	const request = posted.at(-1);
	assert.equal(request.type, "direct");
	assert.equal(request.prompt, window.ivLyricsMotionDirector.buildPrompt({ title: "Song", artist: "Singer", lines, tempo: { tempo: "fast" }, language: "en" }), "the desktop prompt");
	// Providers wrap the answer in prose or a code fence at times.
	host.resolve(request.id, { ok: true, value: "Here is the edit:\n```json\n{\"mood\":\"calm\",\"shots\":[{\"from\":0,\"to\":0,\"layout\":\"hero\"}]}\n```" });
	assert.deepEqual(JSON.parse(JSON.stringify(await asked)), { mood: "calm", shots: [{ from: 0, to: 0, layout: "hero" }] });

	const empty = manager.generateMotionDirection({ lines });
	host.resolve(posted.at(-1).id, { ok: true, value: "{\"mood\":\"calm\"}" });
	await assert.rejects(empty, /no shots/);
	const failed = manager.generateMotionDirection({ lines });
	host.resolve(posted.at(-1).id, { ok: false, error: "HTTP 429" });
	await assert.rejects(failed, /HTTP 429/);
	const prose = manager.generateMotionDirection({ lines });
	host.resolve(posted.at(-1).id, { ok: true, value: "I cannot help with that." });
	await assert.rejects(prose, /no direction/);

	const cache = window.LyricsCache;
	const miss = cache.getMotionDirection("abc123", "hash-v4");
	assert.deepEqual({ type: posted.at(-1).type, key: posted.at(-1).key }, { type: "cacheGet", key: "motion-direction:abc123:hash-v4" });
	host.resolve(posted.at(-1).id, { ok: true, value: "" });
	assert.equal(await miss, null);
	const hit = cache.getMotionDirection("abc123", "hash-v4");
	host.resolve(posted.at(-1).id, { ok: true, value: "{\"raw\":{\"shots\":[]},\"version\":4}" });
	assert.deepEqual(JSON.parse(JSON.stringify(await hit)), { raw: { shots: [] }, version: 4 });
	await cache.setMotionDirection("abc123", "hash-v4", { raw: { shots: [1] }, version: 4 });
	assert.deepEqual(posted.at(-1), { type: "cacheSet", key: "motion-direction:abc123:hash-v4", value: "{\"raw\":{\"shots\":[1]},\"version\":4}" });
	host.resolve(999, { ok: true, value: "late" });
});


test("the app's comfort settings and \"direct again\" reach the stage", () => {
	const { host, rendered } = load();
	host.start();
	host.setTrack(song({ cover: "https://i.scdn.co/image/abc" }));
	let stage = rendered.at(-1);
	assert.equal(stage.props.motion, null, "the desktop defaults until the app says otherwise");
	assert.equal(stage.props.retake, 0);
	assert.equal(stage.props.cover, "https://i.scdn.co/image/abc", "the cover's colours go to the AI");
	host.configure({ motion: { intensity: "calm", rotation: "off", safe: true } });
	stage = rendered.at(-1);
	assert.deepEqual({ ...stage.props.motion }, { intensity: "calm", rotation: "off", safe: true });
	const comfort = stage.props.motion;
	host.configure({ motion: { intensity: "calm", rotation: "off", safe: true } });
	assert.equal(rendered.at(-1).props.motion, comfort, "the same settings keep the same object (no new edit)");
	host.redirect();
	host.redirect();
	assert.equal(rendered.at(-1).props.retake, 2, "each \"direct again\" asks for a new edit");
	host.setTrack(song({ uri: "spotify:track:next" }));
	assert.equal(rendered.at(-1).props.retake, 0, "a new song starts from its first edit");
});

test("the app's safe area and labels reach the page", () => {
	const { host, rootStyle, classes } = load();
	host.start();
	host.configure({ insets: { top: 12, right: 0, bottom: 21.5, left: 59 }, hud: false });
	assert.equal(rootStyle.get("--iv-inset-top"), "12px");
	assert.equal(rootStyle.get("--iv-inset-bottom"), "21.5px");
	assert.equal(rootStyle.get("--iv-inset-left"), "59px");
	assert.ok(classes.has("no-hud"));
	host.configure({ hud: true, insets: { top: -4 } });
	assert.ok(!classes.has("no-hud"));
	assert.equal(rootStyle.get("--iv-inset-top"), "0px");
	const css = readMotionScript("src/features/motion/mobile/motion-mobile.css");
	for (const name of ["--iv-inset-top", "--iv-inset-right", "--iv-inset-bottom", "--iv-inset-left"]) assert.ok(css.includes("var(" + name), name + " is used");
});
