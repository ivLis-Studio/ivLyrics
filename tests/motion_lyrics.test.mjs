import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

const load = () => {
	const window = { navigator: { language: "ko" } };
	const context = vm.createContext({ window, Intl, console, navigator: window.navigator, setTimeout, clearTimeout });
	context.globalThis = context;
	vm.runInContext(read("TinySegmenter.js"), context);
	vm.runInContext(read("LyricsWordSegmenter.js"), context);
	window.LyricsWordSegmenter = context.LyricsWordSegmenter;
	vm.runInContext(read("MotionLyricsShapes.js"), context);
	vm.runInContext(read("MotionLyricsDirector.js"), context);
	vm.runInContext(read("MotionLyrics.js"), context);
	return { motion: window.ivLyricsMotionLyrics, director: window.ivLyricsMotionDirector, shapes: window.ivLyricsMotionShapes, window };
};

const timed = (parts, start = 1000, step = 400) => parts.map((text, index) => ({ text, startTime: start + index * step, endTime: start + (index + 1) * step }));
// Like real lines, the original text carries the spaces between words.
const line = (parts, start, options = {}) => ({
	startTime: start,
	originalText: parts.join(parts.every((part) => [...part].length === 1) || options.joined ? "" : " "),
	syllables: timed(parts, start, options.step || 400),
	text2: options.translation || "",
});
const measure = (text, size) => [...text].length * size * 0.6;

const song = () => {
	const lines = [];
	let start = 2000;
	const texts = [
		["Every", "road", "will", "lead", "me", "back"],
		["to", "you"],
		["Lanterns", "rising", "over", "quiet", "streets", "and", "every", "single", "window", "glows"],
		[..."夢ならばどれほど"],
		["Hold", "on"],
		["Every", "road", "will", "lead", "me", "back"],
		["to", "you"],
		["月に", "話しかけてた"],
		["君の", "横顔は"],
		["まるで", "夜の", "花"],
	];
	texts.forEach((parts, index) => {
		const step = parts.length > 8 ? 180 : 420;
		lines.push(line(parts, start, { step, joined: index >= 7 }));
		start += parts.length * step + (index === 4 ? 5200 : 900);
	});
	return lines;
};

const plans = (seed) => {
	const { motion, director } = load();
	const model = motion.buildModel(song());
	const direction = director.localDirection(model, { seed });
	return { motion, director, model, direction, plan: motion.compose(model, direction, { width: 1440, height: 900, seed, measure }) };
};

test("words keep the line's spaces and attach punctuation and particles", () => {
	const { motion } = load();
	const english = motion.buildWords({ originalText: "I could not see", syllables: timed(["I", "could", "not", "see"]) });
	assert.deepEqual(plain(english.map((word) => word.text)), ["I", "could", "not", "see"], "spaces from the line text");
	assert.ok(english.every((word) => word.joined === false), "spaced words are not joined");
	const spaced = motion.buildWords({ syllables: timed(["Hold ", "me ", "close!"]) });
	assert.deepEqual(plain(spaced.map((word) => word.text)), ["Hold", "me", "close!"], "spaces from the syllables");
	const japanese = motion.buildWords({ syllables: timed([..."夢閉じ込めたパンドラの箱を"], 0, 100) });
	const texts = japanese.map((word) => word.text);
	assert.equal(texts.join(""), "夢閉じ込めたパンドラの箱を");
	assert.ok(texts.length >= 2 && texts.length <= 5, "a few words: " + texts);
	assert.ok(texts.every((text) => !/^[\p{Script=Hiragana}]$/u.test(text)), "no lone particle: " + texts);
	assert.equal(japanese[0].joined, false);
	assert.ok(japanese.slice(1).every((word) => word.joined), "segmenter words of one run stay close together");
	assert.equal(japanese[0].chars[1].start, 100, "characters keep their own timing");
	const multi = motion.buildWords({ originalText: "beautiful", syllables: [{ text: "beau", startTime: 0, endTime: 300 }, { text: "ti", startTime: 300, endTime: 400 }, { text: "ful", startTime: 400, endTime: 700 }] });
	assert.deepEqual(plain(multi.map((item) => item.text)), ["beautiful"], "syllables of one word stay one word");
});

test("word breaks of word-timed Japanese follow the syllables", () => {
	const { motion } = load();
	const words = (parts) => motion.buildWords({ originalText: parts.join(""), syllables: timed(parts, 0, 300) }).map((word) => word.text);
	assert.deepEqual(plain(words(["街", "に", "立ち", "尽くし", "てた"])), ["街に", "立ち尽くしてた"], "verb ending stays on its verb");
	assert.deepEqual(plain(words(["混ざり", "合って", "ひとつの", "色", "となる"])), ["混ざり", "合って", "ひとつの", "色", "となる"],
		"no word split inside a syllable");
	assert.deepEqual(plain(words(["朝をじっと", "待", "った"])), ["朝を", "じっと", "待った"], "long syllables keep the segmenter's breaks");
});

test("only real word or character timing plays motion lyrics", () => {
	const { motion } = load();
	const lines = [line(["a", "b"], 0)];
	assert.equal(motion.hasRealTiming(lines, true, null), true);
	assert.equal(motion.hasRealTiming(lines, true, "line-timing-pseudo"), false);
	assert.equal(motion.hasRealTiming(lines, true, "audio-analysis-pseudo"), false);
	assert.equal(motion.hasRealTiming(lines, false, null), false);
	assert.equal(motion.hasRealTiming([{ startTime: 0, text: "x" }], true, null), false);
	const lead = { vocals: { lead: { syllables: timed(["lead"]) }, background: [{ syllables: timed(["bg"]) }] } };
	assert.deepEqual(plain(motion.buildWords(lead).map((word) => word.text)), ["lead"], "the lead voice plays");
	assert.equal(motion.buildModel([line(["a"], 0, { translation: "에이" })])[0].translation, "에이");
});

test("the local director groups lines into shots and brings a returning section back with its look", () => {
	const { motion, director } = load();
	const model = motion.buildModel(song());
	const direction = director.localDirection(model, { seed: 9 });
	assert.equal(direction.source, "local");
	assert.ok(director.MOODS.includes(direction.mood));
	let next = 0;
	for (const shot of direction.shots) {
		assert.equal(shot.from, next, "shots are contiguous");
		assert.ok(shot.to >= shot.from && shot.to - shot.from + 1 <= director.MAX_LINES[shot.layout], "fits its layout: " + shot.layout);
		assert.ok(director.LAYOUTS.includes(shot.layout) && director.ENTERS.includes(shot.enter) && director.FX.includes(shot.fx) && director.ACCENTS.includes(shot.accent));
		next = shot.to + 1;
	}
	assert.equal(next, model.length, "every line is in a shot");
	assert.ok(direction.shots.some((shot) => shot.to > shot.from), "lines share shots");
	const first = direction.shots.find((shot) => shot.from === 0);
	const again = direction.shots.find((shot) => shot.from === 5);
	assert.ok(again, "the returning chorus starts its own shot");
	assert.deepEqual([again.layout, again.fx, again.accent, again.motifs], [first.layout, first.fx, first.accent, first.motifs], "the returning chorus looks the same");
	assert.deepEqual(plain(director.localDirection(model, { seed: 9 })), plain(direction), "deterministic");
	const moon = direction.shots.find((shot) => shot.from <= 7 && 7 <= shot.to);
	assert.ok(moon.motifs.includes("moon"), "月 brings a moon: " + moon.motifs);
});

test("an AI direction is checked and completed before it is staged", () => {
	const { motion, director } = load();
	const model = motion.buildModel(song());
	const raw = {
		mood: "dreamy",
		palette: ["#FF5CA0", "nope", "#5cd6ff"],
		shots: [
			{ from: 0, to: 1, layout: "spiral", enter: "push", fx: "assemble", motifs: ["moon", "custom", "unknown"], echo: "road" },
			{ from: 1, to: 2, layout: "nonsense", enter: "teleport", fx: "slam", accent: "box", dutch: 40, echo: "not in the lyrics" },
			{ from: 5, to: 9, layout: "hero", enter: "cut" },
		],
		lines: [{ n: 0, emph: [1, 1, 9, -1, 3], fx: "stretch" }, { n: 99, emph: [0] }, { n: 2, fx: "bogus" }],
		shapes: { custom: { d: "M10 10L90 50L10 90Z", style: "stroke" }, evil: { d: "M0 0<script>" }, moon: { d: "M0 0L1 1L2 2Z" } },
	};
	const direction = director.normalizeDirection(raw, model, { seed: 3 });
	assert.equal(direction.source, "ai");
	assert.equal(direction.mood, "dreamy");
	assert.deepEqual(plain(direction.palette), ["#ff5ca0", "#5cd6ff"]);
	assert.deepEqual(Object.keys(direction.shapes), ["custom"], "unsafe or library-named shapes are dropped");
	const [first, second] = direction.shots;
	assert.deepEqual(plain(first.motifs), ["moon", "custom"]);
	assert.equal(first.echo, "road");
	assert.equal(second.from, 2, "an overlapping shot starts after the previous one");
	assert.ok(director.LAYOUTS.includes(second.layout) && director.ENTERS.includes(second.enter), "invalid names fall back");
	assert.equal(second.dutch, 12, "tilt is clamped");
	assert.equal(second.echo, null, "echo must come from the lyrics");
	assert.ok(direction.shots.filter((shot) => shot.layout === "hero").every((shot) => shot.to - shot.from < 2), "a long hero shot is split");
	const covered = direction.shots.flatMap((shot) => Array.from({ length: shot.to - shot.from + 1 }, (_, index) => shot.from + index));
	assert.deepEqual(covered, model.map((_, index) => index), "the gap the AI left is filled");
	assert.ok(direction.shots.some((shot) => shot.source === "local"));
	assert.deepEqual(plain(direction.lines[0]), { emph: [1, 3], fx: "stretch" }, "word indexes are checked");
	assert.equal(direction.lines[99], undefined);
	assert.ok(direction.coverage > 0.5 && direction.coverage < 1);
	assert.equal(director.normalizeDirection(null, model, { seed: 3 }).source, "local");
	assert.equal(director.normalizeDirection({ shots: "x" }, model, { seed: 3 }).coverage, 0);
	const prompt = director.promptLines(model);
	assert.equal(prompt.length, model.length);
	assert.deepEqual(plain(prompt[0].words), ["Every", "road", "will", "lead", "me", "back"]);
});

test("motif shapes from the AI are plain bounded paths", () => {
	const { shapes } = load();
	assert.equal(shapes.sanitizePath("M10 10 L90 90 Z"), "M10 10 L90 90 Z");
	assert.equal(shapes.sanitizePath("M0 0 C 10 20, 30 40, 50 60 A 10 10 0 0 1 90 90 Z").startsWith("M0 0"), true);
	assert.equal(shapes.sanitizePath("L10 10 L20 20"), null, "starts with a move");
	assert.equal(shapes.sanitizePath("M0 0 L10 10 url(#x)"), null);
	assert.equal(shapes.sanitizePath("M0 0 L5000 10 L1 1"), null, "stays near the box");
	assert.equal(shapes.sanitizePath("M0 0 " + "L1 1 ".repeat(200)), null, "short");
	const custom = shapes.sanitizeShapes({ a: "M0 0L10 10L20 0Z", b: { d: "M0 0L1 1L2 2Z", style: "stroke" }, c: "M0 0L1 1L2 0Z", d: "M0 0L1 1L2 0Z" });
	assert.deepEqual(Object.keys(custom), ["a", "b", "c"], "at most three");
	assert.equal(custom.b[0].mode, "stroke");
	for (const name of shapes.NAMES) assert.ok(shapes.MOTIFS[name].every((part) => shapes.sanitizePath(part.d)), "library path " + name);
});

test("boards share the world without overlapping, and every line is read upright", () => {
	for (const seed of [1, 7, 42, 99, 1234]) {
		const { motion, plan } = plans(seed);
		const again = plans(seed).plan;
		assert.deepEqual(plain(plan.lines.map((line) => line.camera)), plain(again.lines.map((line) => line.camera)), "deterministic");
		for (const line of plan.lines) {
			const board = plan.boards[line.board];
			const upright = line.camera.roll - board.dutch - (board.roll + line.place.rot);
			assert.ok(Math.abs(upright - Math.round(upright / 360) * 360) < 0.01, "seed " + seed + " line " + line.n + " is upright");
			for (const word of line.place.block.words) assert.ok([word.x, word.y, word.size].every(Number.isFinite));
			assert.ok(line.place.block.width <= 1440 * 0.9, "fits the screen");
		}
		plan.boards.slice(1).forEach((board, offset) => {
			const previous = plan.boards[offset];
			if (["push", "pull"].includes(board.enter)) {
				assert.ok(Math.abs(board.origin.z - previous.origin.z) > 1500, "a dolly entrance stacks the boards in depth");
				return;
			}
			const last = previous.cameras[previous.cameras.length - 1];
			const frame = (corner) => {
				const radians = (-(last.roll - previous.dutch) * Math.PI) / 180;
				const x = corner.x - last.x;
				const y = corner.y - last.y;
				return { x: x * Math.cos(radians) - y * Math.sin(radians), y: x * Math.sin(radians) + y * Math.cos(radians) };
			};
			const box = (corners) => {
				const points = corners.map(frame);
				return { left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)) };
			};
			const a = box(previous.corners);
			const b = box(board.corners);
			const apart = a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
			assert.ok(apart, "seed " + seed + " board " + board.index + " (" + board.enter + ") clears the previous one");
		});
	}
});

test("the camera arrives before each line and leaves after its last word", () => {
	const { motion, plan } = plans(5);
	plan.lines.forEach((line, index) => {
		const next = plan.lines[index + 1];
		assert.equal(line.arrive, line.start - 110);
		if (!next) {
			assert.equal(line.leave, Infinity);
			return;
		}
		assert.ok(line.leave < next.arrive || line.move.type === "cut", "leaves before the next arrival");
		assert.ok(line.leave >= line.lastWordStart + 140 || next.arrive - line.leave <= 220, "stays for the last word");
		const settled = motion.cameraPose(plan, line.start + 1, null);
		assert.ok(Math.abs(settled.roll - line.camera.roll) < 3, "read upright: " + settled.roll + " vs " + line.camera.roll);
		assert.ok(Math.hypot(settled.x - line.camera.x, settled.y - line.camera.y) < 40, "framed on the line");
	});
	const pause = plan.lines.find((line) => line.reveal);
	assert.ok(pause, "a long pause pulls back to show the board");
	const before = motion.cameraPose(plan, pause.reveal.start - 1, null);
	const during = motion.cameraPose(plan, Math.min(pause.reveal.end - 1, pause.reveal.start + 1700), null);
	assert.ok(during.z > before.z + 50, "the camera pulls back");
	assert.equal(motion.progressAt(plan, plan.lines[0].arrive - 99999), -1);
	assert.equal(motion.progressAt(plan, plan.lines[2].start), 2);
});

test("the next board waits faintly before the camera leaves, and the last one lingers", () => {
	const { motion, plan } = plans(11);
	for (const board of plan.boards.slice(1)) {
		const previous = plan.boards[board.index - 1];
		const lastLine = plan.lines[board.first - 1];
		const firstLine = plan.lines[board.first];
		if (board.enter === "cut") {
			assert.ok(motion.boardVisibility(board, lastLine.leave - 500) === 0, "a cut does not show its board early");
			continue;
		}
		assert.ok(board.appear < lastLine.leave, "shows before the camera leaves");
		assert.ok(motion.boardVisibility(board, lastLine.leave) > 0.5);
		assert.ok(motion.boardVisibility(previous, firstLine.arrive + 300) > 0.9, "the previous board stays a moment");
		assert.ok(motion.boardVisibility(previous, previous.fadeEnd + 1) === 0, "then fades");
	}
	const levels = [-2, -1, 0, 1, 2, 4].map((distance) => motion.lineLevels(distance));
	assert.ok(levels[0].ghost < levels[1].ghost && levels[1].ghost < levels[2].ghost, "the next lines are clearer as they come");
	assert.ok(levels[2].solid === 1 && levels[3].solid < 1 && levels[4].solid < levels[3].solid && levels[5].solid > 0, "sung lines stay as dim echoes");
});

test("sung words enter with their effect and settle exactly in place", () => {
	const { motion, director } = load();
	const word = { start: 1000, end: 1600 };
	for (const fx of director.FX) {
		assert.deepEqual(plain(motion.solidFrame(fx, motion.wordEntrance(fx, word, 0))), { opacity: 0, transform: "none" }, fx + " waits");
		assert.deepEqual(plain(motion.solidFrame(fx, motion.wordEntrance(fx, word, 5000))), { opacity: 1, transform: "none" }, fx + " settles");
		const char = { start: 1000, end: 1100 };
		assert.equal(motion.charFrame(fx, char, 0, 500, 1).opacity, 0, fx + " letter waits");
		assert.deepEqual(plain(motion.charFrame(fx, char, 0, 5000, 1, 0)), { opacity: 1, transform: "none" }, fx + " letter settles");
	}
	const slam = motion.solidFrame("slam", motion.wordEntrance("slam", word, 1040));
	assert.ok(slam.transform.startsWith("scale(") && slam.opacity > 0, "slam starts big");
	assert.ok(motion.wordEntrance("stretch", word, 1300) < 1, "stretch lasts the held note");
});

test("the background turns with the camera and never shows an edge", () => {
	const { motion } = load();
	const plan = { W: 1920, H: 1080 };
	for (let roll = -400; roll <= 400; roll += 17) {
		for (const sway of [null, { u: 0.5, dx: 900, dy: -300, board: true }]) {
			const frame = motion.backgroundFrame(plan, { roll, dolly: 900, beat: 0, sway });
			assert.equal(frame.rotate, -roll);
			const radians = (frame.rotate * Math.PI) / 180;
			for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
				const x = (cx * plan.W) / 2 - frame.x;
				const y = (cy * plan.H) / 2 - frame.y;
				const lx = (x * Math.cos(-radians) - y * Math.sin(-radians)) / frame.scale;
				const ly = (x * Math.sin(-radians) + y * Math.cos(-radians)) / frame.scale;
				assert.ok(Math.abs(lx) <= plan.W / 2 + 0.5 && Math.abs(ly) <= plan.H / 2 + 0.5, "roll " + roll + " covers the corner");
			}
		}
	}
	assert.ok(motion.coverScale(90, 1920, 1080) > 1.7, "a quarter turn needs a bigger layer");
});

test("the plan reports the slams and cuts the camera reacts to", () => {
	const { motion, director } = load();
	const model = motion.buildModel(song());
	const raw = { shots: [{ from: 0, to: 2, layout: "column", fx: "slam" }, { from: 3, to: 9, layout: "tunnel", enter: "cut" }], lines: [{ n: 0, emph: [1] }] };
	const plan = motion.compose(model, director.normalizeDirection(raw, model, { seed: 1 }), { width: 1440, height: 900, seed: 1, measure });
	assert.ok(plan.slams.length >= model.slice(0, 3).reduce((sum, line) => sum + line.words.length, 0));
	assert.equal(plan.slams.find((slam) => slam.time === model[0].words[1].start).strength, 14, "an emphasised slam hits harder");
	assert.equal(plan.flashes.length, 1);
	const cut = plan.lines[2];
	assert.equal(cut.move.type, "cut");
	const before = motion.cameraPose(plan, plan.lines[3].arrive - 5, null);
	const after = motion.cameraPose(plan, plan.lines[3].arrive + 1, null);
	assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 1000, "a cut jumps");
});

test("the AI manager asks providers for a motion direction and rejects answers without shots", async () => {
	const window = { addEventListener() {}, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } };
	const context = vm.createContext({ window, console, setTimeout, clearTimeout, Intl, localStorage: window.localStorage, Spicetify: { LocalStorage: { get: () => null, set() {} } } });
	context.globalThis = context;
	vm.runInContext(read("AIAddonManager.js"), context);
	const manager = window.AIAddonManager;
	const calls = [];
	const provider = (id, answer) => ({
		id, name: id, author: "t", description: "t", version: "1", getSettingsUI: () => null,
		supports: { translate: true },
		async generateMotionDirection(params) {
			calls.push([id, params.motionDirectionPrompt]);
			return answer;
		},
	});
	assert.equal(manager.register(provider("broken", { mood: "calm" })), true);
	assert.equal(manager.register(provider("good", { shots: [{ from: 0, to: 0, layout: "hero" }] })), true);
	assert.equal(manager.getAddon("good").supports.motionDirection, true, "the method alone opts in");
	manager.getEnabledProvidersFor = () => [manager.getAddon("broken"), manager.getAddon("good")];
	const lines = [{ n: 0, words: ["月に", "話しかけてた"], start: 1, duration: 2, pause: 1, translation: "달에게" }];
	const direction = await manager.generateMotionDirection({ title: "月の椀", artist: "sakanaction", lines, vocabulary: { motifs: ["moon", "ring"] } });
	assert.deepEqual(plain(direction.shots), [{ from: 0, to: 0, layout: "hero" }]);
	assert.deepEqual(calls.map(([id]) => id), ["broken", "good"], "falls back to the next provider");
	const prompt = calls[0][1];
	for (const needle of ["#0 [1.0s 2.0s] 月に | 話しかけてた -> 달에게", "月の椀", "sakanaction", "column", "zigzag", "spiral", "wall", "tunnel", "collage", "hero", "moon|ring", "\"shots\"", "\"echo\""]) {
		assert.ok(prompt.includes(needle), "prompt mentions " + needle);
	}
	await assert.rejects(() => manager.generateMotionDirection({ lines: [] }));
});

test("motion is a fullscreen presentation next to the video stage, wired to AI, cache and settings", () => {
	const vinyl = read("VinylPlayerMode.js");
	const overlay = read("FullscreenOverlay.js");
	const index = read("index.js");
	const settings = read("Settings.js");
	const shortcuts = read("GlobalShortcuts.js");
	const service = read("LyricsService.js");
	const background = read("VideoBackground.js");
	const manifest = JSON.parse(read("manifest.json"));
	const order = ["MotionLyricsShapes.js", "MotionLyricsDirector.js", "MotionLyrics.js", "VinylPlayerMode.js"].map((name) => manifest.subfiles.indexOf(name));
	assert.ok(order.every((position, at) => position >= 0 && (at === 0 || position > order[at - 1])), "loaded in order: " + order);
	assert.match(vinyl, /const PRESENTATION_MODES = Object\.freeze\(\[[^\]]*"motion"/);
	assert.match(vinyl, /MotionLyrics\.hasRealTiming\(activeLyrics, activeLyricsKaraoke, karaokeSource\)/);
	assert.match(vinyl, /react\.createElement\(MotionLyrics\.Stage, \{[^}]*title: liveTrack\.title,\s*artist: liveTrack\.artist/);
	assert.match(overlay, /const FOCUSED_PRESENTATION_IDS = new Set\(\[[^\]]*"motion"/);
	assert.match(index, /const IVLYRICS_FULLSCREEN_PRESENTATION_IDS = Object\.freeze\(\[[^\]]*"motion"/);
	assert.match(settings, /id: "motion",\s*labelKey: "vinyl\.presentation\.motionLabel"/);
	assert.match(settings, /"wordSupplements", "motionDirection",/);
	assert.match(settings, /motionDirection: \["settings\.aiProviders\.supports\.motionDirection", "Motion direction"\]/);
	assert.match(shortcuts, /"5": "motion"/);
	assert.match(service, /async getMotionDirection\(trackId, sourceHash\)/);
	assert.match(service, /async setMotionDirection\(trackId, sourceHash, data\)/);
	assert.match(background, /className: "ivlyrics-video-background-camera"/);
	for (const name of ["ChatGPT", "Gemini", "Claude", "OpenRouter", "Groq", "Perplexity", "Paxsenix", "Pollinations"]) {
		const source = read("Addon_AI_" + name + ".js");
		assert.match(source, /motionDirection: true/, name + " declares motion direction");
		assert.match(source, /async generateMotionDirection\(params\) \{[\s\S]*?params\.motionDirectionPrompt/, name + " runs the central prompt");
	}
	const languages = ["Ar", "Bn", "Cs", "De", "En", "Es", "Fa", "Fr", "Hi", "Id", "It", "Ja", "Ko", "Ms", "Pt", "Ru", "Sv", "Th", "Tr", "Vi", "ZhCN", "ZhTW"];
	for (const code of languages) {
		const source = read("langs/Lang" + code + ".js");
		for (const key of ["\"motionDirection\":", "\"motionDirecting\":", "\"motionDirectFailed\":"]) assert.ok(source.includes(key), code + " has " + key);
	}
});

