import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

const load = () => {
	const window = { navigator: { language: "ko" } };
	const context = vm.createContext({ window, Intl, console, navigator: window.navigator });
	context.globalThis = context;
	vm.runInContext(read("TinySegmenter.js"), context);
	vm.runInContext(read("LyricsWordSegmenter.js"), context);
	window.LyricsWordSegmenter = context.LyricsWordSegmenter;
	vm.runInContext(read("MotionLyrics.js"), context);
	return window.ivLyricsMotionLyrics;
};

const timed = (parts, start = 1000, step = 400) => parts.map((text, index) => ({ text, startTime: start + index * step, endTime: start + (index + 1) * step }));
// Like real lines, the original text carries the spaces between words.
const line = (parts, start, options = {}) => ({
	startTime: start,
	originalText: parts.join(parts.every((part) => [...part].length === 1) ? "" : " "),
	syllables: timed(parts, start, options.step || 400),
	...options.extra,
});
const measure = (text, size) => [...text].length * size * 0.6;

test("words keep the line's spaces and attach punctuation and particles", () => {
	const motion = load();
	const english = motion.buildWords({ originalText: "I could not see", syllables: timed(["I", "could", "not", "see"]) });
	assert.deepEqual(plain(english.map((word) => word.text)), ["I", "could", "not", "see"], "spaces from the line text");
	const spaced = motion.buildWords({ syllables: timed(["Hold ", "me ", "close!"]) });
	assert.deepEqual(plain(spaced.map((word) => word.text)), ["Hold", "me", "close!"], "spaces from the syllables");
	const japanese = motion.buildWords({ syllables: timed([..."夢閉じ込めたパンドラの箱を"], 0, 100) });
	const texts = japanese.map((word) => word.text);
	assert.equal(texts.join(""), "夢閉じ込めたパンドラの箱を");
	assert.ok(texts.length >= 2 && texts.length <= 5, "a few words: " + texts);
	assert.ok(texts.every((text) => !/^[\p{Script=Hiragana}]$/u.test(text)), "no lone particle: " + texts);
	const word = japanese[0];
	assert.equal(word.start, 0);
	assert.equal(word.chars[1].start, 100, "characters keep their own timing");
	const multi = motion.buildWords({ originalText: "beautiful", syllables: [{ text: "beau", startTime: 0, endTime: 300 }, { text: "ti", startTime: 300, endTime: 400 }, { text: "ful", startTime: 400, endTime: 700 }] });
	assert.deepEqual(plain(multi.map((item) => item.text)), ["beautiful"], "syllables of one word stay one word");
});

test("only real word or character timing plays motion lyrics", () => {
	const motion = load();
	const lines = [line(["a", "b"], 0)];
	assert.equal(motion.hasRealTiming(lines, true, null), true);
	assert.equal(motion.hasRealTiming(lines, true, "line-timing-pseudo"), false);
	assert.equal(motion.hasRealTiming(lines, true, "audio-analysis-pseudo"), false);
	assert.equal(motion.hasRealTiming(lines, false, null), false);
	assert.equal(motion.hasRealTiming([{ startTime: 0, text: "x" }], true, null), false);
	const lead = { vocals: { lead: { syllables: timed(["lead"]) }, background: [{ syllables: timed(["bg"]) }] } };
	assert.deepEqual(plain(motion.buildWords(lead).map((word) => word.text)), ["lead"], "the lead voice plays");
});

const song = () => {
	const lines = [];
	let start = 2000;
	const texts = [
		["Every", "road", "will", "lead", "me", "back"],
		["to", "you"],
		["Lanterns", "rising", "over", "quiet", "streets", "and", "every", "single", "window", "glows"],
		[..."夢ならばどれほど"],
		["to", "you"],
		["Hold", "on"],
	];
	for (const parts of texts) {
		lines.push(line(parts, start, { step: parts.length > 8 ? 180 : 420 }));
		start += parts.length * (parts.length > 8 ? 180 : 420) + 900;
	}
	return lines;
};

test("the plan is deterministic, dense lines stay rows and repeated lines repeat their scene", () => {
	const motion = load();
	const model = motion.buildModel(song());
	const options = { width: 1440, height: 900, seed: motion.hashString("spotify:track:x"), measure };
	const first = motion.direct(model, options);
	const second = motion.direct(motion.buildModel(song()), options);
	assert.deepEqual(plain(first.scenes.map((scene) => [scene.template, scene.slot, scene.transition])),
		plain(second.scenes.map((scene) => [scene.template, scene.slot, scene.transition])));
	assert.equal(first.scenes[2].template, "row", "ten quick words stay a row");
	assert.equal(first.scenes[4].template, first.scenes[1].template, "a repeated line keeps its template");
	assert.deepEqual(plain(first.scenes[4].layout), plain(first.scenes[1].layout), "and its layout");
	for (const scene of first.scenes) {
		assert.ok(motion.TEMPLATES.includes(scene.template));
		assert.equal(scene.layout.length, scene.words.length);
		for (const place of scene.layout) assert.ok([place.x, place.y, place.z, place.size].every(Number.isFinite));
	}
	assert.ok(first.scenes.slice(1).every((scene) => motion.TRANSITIONS.includes(scene.transition.type)));
});

test("the camera settles before each line and words are read upright", () => {
	const motion = load();
	for (const seed of [1, 7, 42, 99, 1234]) {
		const plan = motion.direct(motion.buildModel(song()), { width: 1440, height: 900, seed, measure });
		plan.scenes.forEach((scene, index) => {
			assert.equal(scene.arrive, scene.start - 80);
			const next = plan.scenes[index + 1];
			if (next) {
				assert.ok(scene.leave < next.arrive, "leaves before the next arrival");
				assert.ok(scene.leave >= scene.words.at(-1).start + 120 || next.arrive - scene.leave === 260,
					"does not leave before the last word unless lines touch");
			}
			// Every word but a last one sung during the move is read close to upright.
			const words = next ? scene.words.filter((word) => word.start < scene.leave) : scene.words;
			for (const word of words) {
				const pose = motion.cameraPose(plan, word.start + 1);
				assert.ok(Math.abs(pose.roll - scene.slot.roll) < 2, "seed " + seed + " line " + index + " roll " + pose.roll + " vs " + scene.slot.roll);
			}
		});
		const rolls = plan.scenes.map((scene) => scene.slot.roll);
		assert.ok(rolls.every((roll) => Math.abs(roll) <= 270), "never far from upright: " + rolls);
	}
});

test("words fly in at their time, fill while sung and old lines fade", () => {
	const motion = load();
	const plan = motion.direct(motion.buildModel(song()), { width: 1440, height: 900, seed: 5, measure });
	const scene = plan.scenes[0];
	const word = scene.words[1];
	assert.equal(motion.wordFrame(scene, 1, scene.previewAt - 1), null, "hidden before the line's preview");
	const waiting = motion.wordFrame(scene, 1, word.start - 200);
	assert.ok(waiting.opacity > 0 && waiting.opacity <= 0.5, "faint while it waits: " + waiting.opacity);
	assert.equal(waiting.active, false);
	const flyFrom = motion.wordFrame(scene, 1, word.start - 90);
	assert.deepEqual([flyFrom.x, flyFrom.y, flyFrom.z, flyFrom.rot, flyFrom.scale], [waiting.x, waiting.y, waiting.z, waiting.rot, waiting.scale],
		"waits exactly where it flies in from");
	assert.equal(flyFrom.opacity, waiting.opacity, "and lights up from there without a jump");
	const during = motion.wordFrame(scene, 1, word.start + (word.end - word.start) / 2);
	assert.equal(during.active, true);
	assert.ok(during.fill > 0.4 && during.fill < 0.6, "half sung: " + during.fill);
	const after = motion.wordFrame(scene, 1, word.end + 10);
	assert.equal(after.sung, true);
	assert.equal(after.opacity, 1);
	assert.equal(motion.sceneOpacity(plan, 0, scene.start), 1);
	assert.equal(motion.sceneOpacity(plan, 0, plan.scenes[1].arrive + 600), 0, "gone after the next line settles");
	const next = plan.scenes[1];
	assert.equal(next.previewAt, scene.leave, "the next line shows once the camera heads for it");
	assert.equal(motion.wordFrame(next, 0, scene.leave - 1), null);
	assert.ok(motion.wordFrame(next, 0, scene.leave + 400).opacity > 0);
	const char = { start: 1000, end: 1100 };
	assert.equal(motion.charFrame(char, 0, 900), null);
	assert.equal(motion.charFrame(char, 0, 900, 0.4).opacity, 0.4, "a waiting letter keeps its preview opacity");
	assert.equal(motion.charFrame(char, 0, 1050).active, true);
});

test("word breaks of word-timed Japanese follow the syllables", () => {
	const motion = load();
	const words = (parts) => motion.buildWords({ originalText: parts.join(""), syllables: timed(parts, 0, 300) }).map((word) => word.text);
	assert.deepEqual(plain(words(["街", "に", "立ち", "尽くし", "てた"])), ["街に", "立ち尽くしてた"], "verb ending stays on its verb");
	assert.deepEqual(plain(words(["混ざり", "合って", "ひとつの", "色", "となる"])), ["混ざり", "合って", "ひとつの", "色", "となる"],
		"no word split inside a syllable");
	assert.deepEqual(plain(words(["朝をじっと", "待", "った"])), ["朝を", "じっと", "待った"], "long syllables keep the segmenter's breaks");
});

test("the beat pushes the camera without changing the plan", () => {
	const motion = load();
	const model = motion.buildModel(song());
	const plan = motion.direct(model, { width: 1440, height: 900, seed: 3, measure });
	const time = plan.scenes[0].start + 200;
	const still = motion.cameraPose(plan, time, null);
	const pulses = { times: Float64Array.from([time - 20]), strengths: Float32Array.from([1]) };
	const punched = motion.cameraPose(plan, time, pulses);
	assert.ok(punched.z < still.z, "pushes in on the beat");
	assert.deepEqual(plain(motion.cameraPose(plan, time + 2000, pulses)), plain(motion.cameraPose(plan, time + 2000, null)), "and settles");
});

test("motion is a fullscreen presentation next to the video stage", () => {
	const vinyl = read("VinylPlayerMode.js");
	const overlay = read("FullscreenOverlay.js");
	const index = read("index.js");
	const settings = read("Settings.js");
	const shortcuts = read("GlobalShortcuts.js");
	const manifest = JSON.parse(read("manifest.json"));
	assert.ok(manifest.subfiles.indexOf("MotionLyrics.js") >= 0 && manifest.subfiles.indexOf("MotionLyrics.js") < manifest.subfiles.indexOf("VinylPlayerMode.js"));
	assert.match(vinyl, /const PRESENTATION_MODES = Object\.freeze\(\[[^\]]*"motion"/);
	assert.match(vinyl, /id: "motion",\s*labelKey: "vinyl\.presentation\.motionLabel"/);
	assert.match(vinyl, /MotionLyrics\.hasRealTiming\(activeLyrics, activeLyricsKaraoke, karaokeSource\)/);
	assert.match(overlay, /const FOCUSED_PRESENTATION_IDS = new Set\(\[[^\]]*"motion"/);
	assert.match(index, /const IVLYRICS_FULLSCREEN_PRESENTATION_IDS = Object\.freeze\(\[[^\]]*"motion"/);
	assert.match(index, /fullscreenPresentation === "video" \|\| fullscreenPresentation === "motion"/);
	assert.match(settings, /id: "motion",\s*labelKey: "vinyl\.presentation\.motionLabel"/);
	assert.match(shortcuts, /"5": "motion"/);
});
