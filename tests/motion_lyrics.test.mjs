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
	vm.runInContext(read("MotionLyricsType.js"), context);
	vm.runInContext(read("MotionLyricsDirector.js"), context);
	vm.runInContext(read("MotionLyrics.js"), context);
	return { motion: window.ivLyricsMotionLyrics, director: window.ivLyricsMotionDirector, shapes: window.ivLyricsMotionShapes, type: window.ivLyricsMotionType, window };
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

const compose = (motion, type, model, direction, seed, lang = "") => motion.compose(model, direction, {
	width: 1440, height: 900, seed, measure, typography: type.typographyOf(model, lang), songLang: lang,
});

const plans = (seed) => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const direction = director.localDirection(model, { seed });
	return { motion, director, type, model, direction, plan: compose(motion, type, model, direction, seed) };
};

/** A song where every shot uses the given entrance. */
const forced = (enter, extra = {}) => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const raw = { shots: model.map((_, index) => ({ from: index, to: index, layout: "column", enter, fx: "pop", ...extra })) };
	const direction = director.normalizeDirection(raw, model, { seed: 4 });
	return { motion, model, direction, plan: compose(motion, type, model, direction, 4) };
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
	assert.deepEqual(plain(motion.buildWords(lead).map((word) => word.text)), ["lead"], "the lead voice leads the line");
	assert.equal(motion.buildModel([line(["a"], 0, { translation: "에이" })])[0].translation, "에이");
});

test("every script ivLyrics speaks gets its own display faces", () => {
	const { type } = load();
	const cases = [
		["月に話しかけてた", "ja", "ja", "Dela Gothic One"],
		["我爱你到永远", "zh-hans", "zh-hans", "ZCOOL QingKe HuangYou"],
		["我愛你到永遠", "zh-hant", "zh-hant", "Noto Sans TC"],
		["風が吹く", "", "ja", "Dela Gothic One"],
		["사랑해 너만을", "ko", "ko", "Black Han Sans"],
		["Я тебя люблю", "ru", "cyrillic", "Oswald"],
		["أحبك يا قلبي", "ar", "arabic", "Lalezar"],
		["دوستت دارم", "fa", "arabic", "Lalezar"],
		["ฉันรักเธอ", "th", "thai", "Kanit"],
		["मैं तुमसे प्यार करता हूँ", "hi", "devanagari", "Teko"],
		["আমি তোমাকে ভালোবাসি", "bn", "bengali", "Hind Siliguri"],
		["Anh yêu em nhiều lắm", "vi", "latin", "Anton"],
		["Seni çok seviyorum", "tr", "latin", "Anton"],
		["שלום עולם", "he", "hebrew", "Secular One"],
		["Σ' αγαπώ", "el", "greek", "Roboto Condensed"],
	];
	for (const [text, lang, script, face] of cases) {
		assert.equal(type.scriptOf(text, lang), script, text);
		assert.ok(type.fontSpec(script, "impact").family.startsWith('"' + face + '"'), text + " is set in " + face);
		for (const personality of type.PERSONALITIES) {
			const spec = type.fontSpec(script, personality);
			assert.ok(spec.family && spec.canvasFont.includes("100px") && spec.lineHeight > 0.9, script + " " + personality);
		}
	}
	assert.equal(type.langTagOf("arabic", "fa"), "fa");
	assert.equal(type.langTagOf("zh-hant", ""), "zh-Hant");
	assert.equal(type.fontSpec("latin", "thin").kind, "impact", "thin type is gone: older answers get the heavy face");
	for (const script of type.SCRIPTS) {
		const companion = type.fontSpec(script, "impact", "light");
		assert.ok(companion.weight >= 600, script + " companion face is sturdy, never hairline: " + companion.weight);
		for (const personality of type.PERSONALITIES) assert.ok(type.fontSpec(script, personality).spacing < 0.05, script + " " + personality + " is not tracked wide");
	}
	assert.equal(type.casedText("hello", "latin", true), "HELLO");
	assert.equal(type.casedText("안녕", "ko", true), "안녕");
	assert.ok(type.cssUrl({ family: "Playfair Display", weight: 800, style: "italic" }).includes("family=Playfair+Display:ital,wght@1,800"));
	const model = [{ text: "사랑해 baby", words: [{ text: "사랑해" }, { text: "baby" }] }, { text: "one more time", words: [{ text: "one" }, { text: "more" }, { text: "time" }] }];
	const lines = type.typographyOf(model, "ko");
	assert.deepEqual(plain(lines[0].words), ["ko", "ko"], "English in a Korean line keeps the line's face");
	assert.equal(lines[1].script, "latin", "an English line gets a Latin face");
});

test("right-to-left lines read from the right and joined scripts keep their words whole", () => {
	const { motion, director, type } = load();
	const lyrics = [line(["أحبك", "يا", "قلبي"], 1000, { step: 500 }), line(["मैं", "तुमसे", "प्यार"], 4000, { step: 500 })];
	const model = motion.buildModel(lyrics);
	const typography = type.typographyOf(model, "ar");
	assert.equal(typography[0].rtl, true);
	assert.equal(typography[1].joined, true);
	const raw = { shots: [{ from: 0, to: 1, layout: "column", fx: "type", type: "impact" }] };
	const plan = compose(motion, type, model, director.normalizeDirection(raw, model, { seed: 2 }), 2, "ar");
	const arabic = plan.lines[0].place.block.words;
	assert.ok(arabic[0].x > arabic[1].x && arabic[1].x > arabic[2].x, "the first Arabic word is on the right");
	assert.ok(arabic.every((word) => word.letters === false), "Arabic letters are never split");
	assert.equal(plan.lines[0].fx, "wipe", "letter effects become a word-level wipe");
	assert.equal(plan.lines[1].fx, "wipe");
	assert.ok(plan.lines[0].place.block.words[0].spec.family.startsWith('"Lalezar"'));
	const needs = motion.fontNeeds(model, director.normalizeDirection(raw, model, { seed: 2 }), typography);
	const families = [...needs.values()].map((entry) => entry.spec.load?.family);
	assert.ok(families.includes("Lalezar") && families.includes("Teko"), "the faces load before composing: " + families);
	assert.ok([...needs.values()].every((entry) => entry.sample.length > 0), "with the characters they set");
});

test("the tempo is measured from the singing and the beat, and paces the song", () => {
	const { motion, director } = load();
	const slowSong = motion.buildModel([line(["I", "remember", "you"], 0, { step: 1100 }), line(["in", "the", "quiet", "night"], 6000, { step: 900 })]);
	const rapSong = motion.buildModel(Array.from({ length: 4 }, (_, index) => line(["I", "keep", "it", "moving", "never", "stopping", "on", "the", "beat", "tonight"], index * 3000, { step: 170 })));
	const koreanRap = motion.buildModel([line([..."빠르게달려가는내모습을봐"], 0, { step: 110 })]);
	assert.equal(director.tempoOf(slowSong).tempo, "slow");
	assert.equal(director.tempoOf(rapSong).tempo, "rap");
	assert.equal(director.tempoOf(koreanRap).tempo, "rap");
	assert.ok(director.syllablesOf("beautiful day") >= 4 && director.syllablesOf("夢ならば") === 4);
	const beats = { times: Float64Array.from({ length: 40 }, (_, index) => index * 400), strengths: new Float32Array(40) };
	const mid = motion.buildModel([line(["We", "are", "dancing", "now"], 0, { step: 300 })]);
	assert.equal(director.tempoOf(mid, beats).bpm, 150);
	const slow = director.localDirection(slowSong, { seed: 1 });
	assert.equal(slow.tempo.tempo, "slow");
	assert.ok(slow.shots.every((shot) => !["whip", "cut", "spin", "tumble", "through", "panel"].includes(shot.enter) || shot.from === 0), "slow songs glide");
	const rap = director.localDirection(rapSong, { seed: 1 });
	assert.ok(rap.shots.every((shot) => director.TYPES.includes(shot.type) && typeof shot.serif === "boolean"));
	assert.ok(slow.tempo.pace > 1 && rap.tempo.pace < 1);
});

test("the local director groups lines into shots and brings a returning section back with its look", () => {
	const { motion, director } = load();
	const model = motion.buildModel(song());
	const direction = director.localDirection(model, { seed: 9 });
	assert.equal(direction.source, "local");
	assert.ok(director.MOODS.includes(direction.mood));
	assert.ok(director.TEMPOS.includes(direction.tempo.tempo));
	let next = 0;
	for (const shot of direction.shots) {
		assert.equal(shot.from, next, "shots are contiguous");
		assert.ok(shot.to >= shot.from && shot.to - shot.from + 1 <= director.MAX_LINES[shot.layout], "fits its layout: " + shot.layout);
		assert.ok(director.LAYOUTS.includes(shot.layout) && director.ENTERS.includes(shot.enter) && director.FX.includes(shot.fx)
			&& director.ACCENTS.includes(shot.accent) && director.TYPES.includes(shot.type));
		assert.equal(typeof shot.upper, "boolean");
		next = shot.to + 1;
	}
	assert.equal(next, model.length, "every line is in a shot");
	assert.ok(direction.shots.some((shot) => shot.to > shot.from), "lines share shots");
	const first = direction.shots.find((shot) => shot.from === 0);
	const again = direction.shots.find((shot) => shot.from === 5);
	assert.ok(again, "the returning chorus starts its own shot");
	assert.deepEqual([again.layout, again.fx, again.accent, again.type, again.motifs], [first.layout, first.fx, first.accent, first.type, first.motifs], "the returning chorus looks the same");
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
			{ from: 0, to: 1, layout: "spiral", enter: "push", fx: "assemble", type: "serif", upper: true, bars: true, rule: "yes", motifs: ["moon", "custom", "unknown"], echo: "road" },
			{ from: 1, to: 2, layout: "nonsense", enter: "teleport", fx: "slam", accent: "box", type: "comic", dutch: 40, echo: "not in the lyrics" },
			{ from: 5, to: 9, layout: "hero", enter: "orbit" },
		],
		lines: [{ n: 0, emph: [1, 1, 9, -1, 3], fx: "glitch" }, { n: 99, emph: [0] }, { n: 2, fx: "bogus" }],
		shapes: { custom: { d: "M10 10L90 50L10 90Z", style: "stroke" }, evil: { d: "M0 0<script>" }, moon: { d: "M0 0L1 1L2 2Z" } },
		tempo: { tempo: "rap" },
	};
	const direction = director.normalizeDirection(raw, model, { seed: 3 });
	assert.equal(direction.source, "ai");
	assert.equal(direction.mood, "dreamy");
	assert.notEqual(direction.tempo.tempo, "rap", "tempo is measured, not taken from the AI");
	assert.deepEqual(plain(direction.palette), ["#ff5ca0", "#5cd6ff"]);
	assert.deepEqual(Object.keys(direction.shapes), ["custom"], "unsafe or library-named shapes are dropped");
	const [first, second] = direction.shots;
	assert.deepEqual(plain(first.motifs), ["moon", "custom"]);
	assert.deepEqual([first.type, first.upper, first.bars, first.rule], ["serif", true, true, false], "flags must be booleans");
	assert.equal(first.echo, "road");
	assert.equal(second.from, 2, "an overlapping shot starts after the previous one");
	assert.ok(director.LAYOUTS.includes(second.layout) && director.ENTERS.includes(second.enter) && director.TYPES.includes(second.type), "invalid names fall back");
	assert.equal(second.dutch, 12, "tilt is clamped");
	assert.equal(second.echo, null, "echo must come from the lyrics");
	assert.ok(direction.shots.filter((shot) => shot.layout === "hero").every((shot) => shot.to - shot.from < 2), "a long hero shot is split");
	const covered = direction.shots.flatMap((shot) => Array.from({ length: shot.to - shot.from + 1 }, (_, index) => shot.from + index));
	assert.deepEqual(covered, model.map((_, index) => index), "the gap the AI left is filled");
	assert.ok(direction.shots.some((shot) => shot.source === "local"));
	assert.deepEqual(plain(direction.lines[0]), { emph: [1, 3], fx: "glitch" }, "word indexes are checked");
	assert.equal(direction.lines[99], undefined);
	assert.ok(direction.coverage > 0.5 && direction.coverage < 1);
	assert.equal(director.normalizeDirection(null, model, { seed: 3 }).source, "local");
	assert.equal(director.normalizeDirection({ shots: "x" }, model, { seed: 3 }).coverage, 0);
	const prompt = director.promptLines(model);
	assert.equal(prompt.length, model.length);
	assert.deepEqual(plain(prompt[0].words), ["Every", "road", "will", "lead", "me", "back"]);
	assert.ok(!director.vocabulary().types.includes("thin") && director.vocabulary().types.includes("serif") && director.vocabulary().enters.includes("orbit"));
	const thin = director.normalizeDirection({ shots: [{ from: 0, to: 9, layout: "column", type: "thin" }] }, model, { seed: 3 });
	assert.ok(thin.shots.every((shot) => shot.type === "impact"), "an older answer asking for thin type gets the heavy face");
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
			for (const word of line.place.block.words) assert.ok([word.x, word.y, word.size].every(Number.isFinite) && word.spec && word.text);
			assert.ok(line.place.block.width <= 1440 * 0.9, "fits the screen");
		}
		plan.boards.slice(1).forEach((board, offset) => {
			const previous = plan.boards[offset];
			const last = previous.cameras[previous.cameras.length - 1];
			if (["push", "pull", "through", "fade"].includes(board.enter)) {
				assert.ok(Math.abs(board.cameras[0].z - last.z) >= 300, "a dolly or dissolve entrance moves the camera in depth");
				return;
			}
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

test("the camera arrives before each line, upright and facing it, and leaves after its last word", () => {
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
		const turn = ((settled.roll - line.camera.roll) % 360 + 540) % 360 - 180;
		assert.ok(Math.abs(turn) < 3, "read upright: " + settled.roll + " vs " + line.camera.roll);
		assert.ok(Math.abs(settled.yaw) < 4 && Math.abs(settled.pitch) < 4, "facing the line: " + settled.yaw + " " + settled.pitch);
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

test("each entrance moves the camera its own way", () => {
	const mid = (plan, index) => (plan.lines[index].leave + plan.lines[index + 1].arrive) / 2;
	const duration = (plan) => plan.lines[1].arrive - plan.lines[1].leave;
	const pan = forced("pan");
	const whip = forced("whip");
	assert.ok(duration(whip.plan) < duration(pan.plan), "a whip is quicker than a pan");
	const orbit = forced("orbit");
	assert.ok(Math.abs(orbit.motion.cameraPose(orbit.plan, mid(orbit.plan, 1), null).yaw) > 40, "an orbit swings the camera around");
	const tumble = forced("tumble");
	assert.ok(Math.abs(tumble.motion.cameraPose(tumble.plan, mid(tumble.plan, 1), null).pitch) > 35, "a tumble goes over the top");
	const spin = forced("spin");
	const spinLine = spin.plan.lines[1];
	assert.equal(Math.abs(spinLine.move.extraRoll), 360, "a barrel roll");
	const landed = spin.motion.cameraPose(spin.plan, spin.plan.lines[2].arrive - 1, null);
	const turn = ((landed.roll - spin.plan.lines[2].camera.roll) % 360 + 540) % 360 - 180;
	assert.ok(Math.abs(turn) < 4, "and lands upright");
	const panel = forced("panel");
	assert.ok(panel.plan.panels.length >= panel.plan.boards.length - 1, "a colour panel sweeps across");
	const sweep = panel.motion.panelAt(panel.plan, mid(panel.plan, 1));
	assert.ok(sweep && Math.abs(sweep.position) < 0.2, "it covers the screen at the cut");
	const before = panel.motion.cameraPose(panel.plan, panel.plan.lines[1].move.cutAt - 5, null);
	const after = panel.motion.cameraPose(panel.plan, panel.plan.lines[1].move.cutAt + 5, null);
	assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 1000, "the camera cuts behind the panel");
	const fade = forced("fade");
	const [a, b] = fade.plan.boards;
	assert.ok(Math.hypot(b.origin.x - a.origin.x, b.origin.y - a.origin.y) < 900 && b.origin.z < a.origin.z, "a dissolve stays in place");
	assert.ok(fade.motion.boardVisibility(a, fade.plan.lines[2].arrive) < 0.1, "the old board is gone when the camera arrives");
	const through = forced("through");
	assert.ok(through.plan.lines[1].move.waypoint, "a dive aims at the last sung word");
	assert.ok(through.plan.flashes.length > 0);
	const cut = forced("cut");
	assert.ok(cut.plan.flashes.length >= cut.plan.boards.length - 1);
	const bars = forced("pan", { bars: true, rule: true, type: "round", upper: true });
	assert.ok(bars.motion.barsLevel(bars.plan, bars.plan.lines[1].start) > 0.9, "letterbox bars");
	assert.ok(bars.plan.boards.every((board) => board.rule && board.type === "round"));
	const cased = bars.plan.lines[0].place.block.words.map((word) => word.text);
	assert.deepEqual(plain(cased), ["Every", "road", "will", "lead", "me", "back"], "only the impact face is set in capitals");
	const impact = forced("pan", { type: "impact", upper: true });
	assert.deepEqual(plain(impact.plan.lines[0].place.block.words.map((word) => word.text)), ["EVERY", "ROAD", "WILL", "LEAD", "ME", "BACK"]);
	assert.equal(impact.plan.lines[7].place.block.words[0].text, "月に", "only cased scripts change");
	for (const entrance of ["pan", "whip", "spin", "orbit", "tumble", "fade", "through", "panel", "roll", "flip"]) {
		const { motion, plan } = forced(entrance);
		for (let time = plan.lines[0].arrive - 3000; time < plan.lines[plan.lines.length - 1].end; time += 97) {
			const pose = motion.cameraPose(plan, time, null);
			assert.ok([pose.x, pose.y, pose.z, pose.roll, pose.yaw, pose.pitch].every(Number.isFinite), entrance + " at " + time);
		}
	}
});

test("the next board waits faintly before the camera leaves, and the last one lingers", () => {
	const { motion, plan } = plans(11);
	for (const board of plan.boards.slice(1)) {
		const previous = plan.boards[board.index - 1];
		const lastLine = plan.lines[board.first - 1];
		const firstLine = plan.lines[board.first];
		if (["cut", "panel", "fade"].includes(board.enter)) continue;
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
	assert.equal(director.FX.length, 18);
	for (const fx of director.FX) {
		for (const pace of [0.72, 1, 1.4]) {
			assert.deepEqual(plain(motion.solidFrame(fx, motion.wordEntrance(fx, word, 0, pace))), { opacity: 0, transform: "none", filter: "", clip: "", shadow: "" }, fx + " waits");
			assert.deepEqual(plain(motion.solidFrame(fx, motion.wordEntrance(fx, word, 5000, pace))), { opacity: 1, transform: "none", filter: "", clip: "", shadow: "" }, fx + " settles");
		}
		const char = { start: 1000, end: 1100 };
		const context = { count: 4, wordStart: 1000, seed: 1, sway: 0, pace: 1 };
		assert.equal(motion.charFrame(fx, char, 0, 500, context).opacity, 0, fx + " letter waits");
		assert.deepEqual(plain(motion.charFrame(fx, char, 0, 5000, context)), { opacity: 1, transform: "none" }, fx + " letter settles");
	}
	const slam = motion.solidFrame("slam", motion.wordEntrance("slam", word, 1040));
	assert.ok(slam.transform.startsWith("scale(") && slam.opacity > 0, "slam starts big");
	assert.ok(motion.wordEntrance("stretch", word, 1300) < 1, "stretch lasts the held note");
	assert.ok(motion.solidFrame("blur", 0.3).filter.startsWith("blur("), "blur pulls focus");
	assert.ok(motion.solidFrame("wipe", 0.5).clip.startsWith("inset("), "wipe reveals");
	assert.ok(motion.solidFrame("wipe", 0.5, 0, true).clip !== motion.solidFrame("wipe", 0.5, 0, false).clip, "from the right in right-to-left lines");
	assert.ok(motion.solidFrame("glitch", 0.5, 7).shadow.includes("rgba"), "glitch splits colour");
	assert.ok(motion.wordEntrance("blur", word, 1300, 1.4) < motion.wordEntrance("blur", word, 1300, 1), "slow songs enter slower");
	assert.ok(motion.charFrame("track", { start: 1000 }, 0, 1100, { count: 5, wordStart: 1000 }).transform.startsWith("translateX(-"), "track closes in");
});

test("the background turns with the camera and never shows an edge", () => {
	const { motion } = load();
	const plan = { W: 1920, H: 1080 };
	for (let roll = -400; roll <= 400; roll += 17) {
		for (const extra of [{ sway: null, yaw: 0, pitch: 0 }, { sway: { u: 0.5, dx: 900, dy: -300, board: true }, yaw: 70, pitch: 0 }, { sway: { u: 0.3, dx: 0, dy: 700, board: true, whip: true }, yaw: -20, pitch: -60 }]) {
			const frame = motion.backgroundFrame(plan, { roll, dolly: 900, beat: 0, ...extra });
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
	const swung = motion.backgroundFrame(plan, { roll: 0, yaw: 60, pitch: 0 });
	assert.ok(swung.x < -500, "the far plane slides against an orbit");
});

test("lines turned away or behind the camera are hidden by their real depth", () => {
	const { motion } = load();
	const pose = { x: 0, y: 0, z: 0, roll: 0, yaw: 0, pitch: 0 };
	assert.equal(motion.viewDepth(pose, { x: 500, y: 0, z: 0 }), 0);
	assert.equal(motion.viewDepth(pose, { x: 0, y: 0, z: 300 }), 300);
	const turned = motion.viewDepth({ ...pose, yaw: 60 }, { x: -1000, y: 0, z: 0 });
	assert.ok(turned > 800, "a line to the side comes close when the camera turns towards it: " + turned);
});

test("the plan reports the slams and cuts the camera reacts to", () => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const raw = { shots: [{ from: 0, to: 2, layout: "column", fx: "slam" }, { from: 3, to: 9, layout: "tunnel", enter: "cut" }], lines: [{ n: 0, emph: [1] }] };
	const plan = compose(motion, type, model, director.normalizeDirection(raw, model, { seed: 1 }), 1);
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
	const direction = await manager.generateMotionDirection({ title: "月の椀", artist: "sakanaction", lines, vocabulary: { motifs: ["moon", "ring"] }, tempo: { tempo: "slow", sps: 2.4, bpm: 76 }, language: "ja" });
	assert.deepEqual(plain(direction.shots), [{ from: 0, to: 0, layout: "hero" }]);
	assert.deepEqual(calls.map(([id]) => id), ["broken", "good"], "falls back to the next provider");
	const prompt = calls[0][1];
	for (const needle of ["#0 [1.0s 2.0s] 月に | 話しかけてた -> 達에게".replace("達", "달"), "月の椀", "sakanaction", "(language: ja)", "Tempo: slow (2.4 syllables per second, 76 BPM)", "column", "tower", "orbit", "through", "panel", "glitch", "track", "flicker", "spark", "\"type\"", "\"upper\"", "\"bars\"", "\"rule\"", "moon|ring", "\"shots\"", "\"echo\""]) {
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
	const order = ["MotionLyricsShapes.js", "MotionLyricsType.js", "MotionLyricsDirector.js", "MotionLyrics.js", "VinylPlayerMode.js"].map((name) => manifest.subfiles.indexOf(name));
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

test("other voices sing with their line in smaller rows, on their own timing", () => {
	const { motion, director, type } = load();
	const spaced = (parts) => parts.map((part, index) => (index < parts.length - 1 ? part + " " : part));
	const voiced = (leadParts, start, background) => ({
		startTime: start,
		text: "lead and other voices mixed",
		vocals: { lead: { text: leadParts.join(" "), speaker: "v1", syllables: timed(spaced(leadParts), start, 400) }, background },
	});
	const lyrics = [
		voiced(["Every", "road", "will", "lead"], 2000, [{ role: "background", text: "lead me", syllables: timed(spaced(["lead", "me"]), 3400, 300) }]),
		voiced(["back", "to", "you"], 5000, [{ role: "lead", speaker: "v2", text: "to you", syllables: timed(spaced(["to", "you"]), 5300, 300) }]),
		voiced(["Hold", "on"], 8000, [{ role: "background", text: "oh", syllables: timed(["oh"], 7300, 400) }]),
		{ startTime: 10000, text: "ah", vocals: { lead: { syllables: [] }, background: [{ role: "background", text: "ah", syllables: timed(["ah"], 10000, 500) }] } },
	];
	const model = motion.buildModel(lyrics);
	assert.equal(model.length, 4);
	assert.equal(model[0].text, "Every road will lead", "the line's own words are the lead's");
	assert.deepEqual(plain(model[0].backing.map((voice) => [voice.role, voice.text])), [["background", "lead me"]]);
	assert.equal(model[0].end, 4000, "the line lasts as long as any voice in it");
	assert.equal(model[1].backing[0].role, "duet", "another lead part is a duet partner");
	assert.equal(model[2].start, 7300, "a voice that comes first starts the line");
	assert.equal(model[3].text, "ah", "a line only other voices sing is led by the first of them");
	assert.deepEqual(plain(director.promptLines(model)[0].words), ["Every", "road", "will", "lead"], "the AI reads the lead");
	const typography = type.typographyOf(model, "en");
	assert.deepEqual(plain(typography[0].backing), [["latin", "latin"]]);
	const direction = director.localDirection(model, { seed: 6 });
	const needs = motion.fontNeeds(model, direction, typography);
	const sampled = (map) => [...map.values()].reduce((sum, need) => sum + need.sample.length, 0);
	const bare = model.map((entry) => ({ ...entry, backing: [] }));
	assert.ok(sampled(needs) > sampled(motion.fontNeeds(bare, direction, typography)), "the other voices' letters load too");
	const plan = compose(motion, type, model, direction, 6, "en");
	const [first, second, third] = plan.lines;
	assert.equal(first.shown.length, 6);
	assert.equal(first.place.block.words.length, 6, "every voice's words are placed");
	const lead = first.place.block.words.slice(0, 4);
	const backing = first.place.block.words.slice(4);
	assert.ok(backing.every((word) => word.voice === 1 && !word.emph));
	assert.ok(Math.max(...backing.map((word) => word.size)) < Math.min(...lead.map((word) => word.size)) * 0.7, "background vocals are set smaller");
	assert.ok(Math.min(...backing.map((word) => word.y)) > Math.max(...lead.map((word) => word.y)), "under the lead");
	const duetRatio = second.place.block.words[3].size / second.place.block.words[0].size;
	assert.ok(duetRatio > 0.7 && duetRatio < 0.95, "a duet partner a little smaller: " + duetRatio);
	assert.ok(third.place.block.words[2].y < third.place.block.words[0].y, "a voice that comes first sits above");
	assert.equal(motion.wordEntrance(first.fx, first.shown[5], first.shown[5].start - 200), 0, "each voice lands on its own timing");
	assert.equal(motion.wordEntrance(first.fx, first.shown[5], first.shown[5].start + 3000), 1);

	// Lines sung over each other stay in one shot.
	const overlap = motion.buildModel([
		line(["one", "two"], 0), line(["three", "four"], 1100), line(["five", "six"], 2200), line(["seven", "eight"], 2700),
	]);
	const shots = director.localDirection(overlap, { seed: 1 }).shots;
	assert.ok(shots.some((shot) => shot.from <= 2 && shot.to >= 3), "the overlapping lines share a shot");
});

test("an interlude lets the lyrics go soon after the last word and brings them back before they are sung", () => {
	const { motion, director, type } = load();
	const model = motion.buildModel([
		line(["Every", "road", "will", "lead"], 2000), line(["me", "back"], 4000),
		line(["to", "you"], 20000), line(["again", "and", "again"], 22000),
	]);
	const direction = director.localDirection(model, { seed: 5 });
	const plan = compose(motion, type, model, direction, 5);
	const [, before, after] = plan.lines;
	assert.ok(before.rest, "a long gap is an interlude");
	assert.notEqual(before.board, after.board);
	const board = plan.boards[before.board];
	assert.ok(before.rest.start - before.end <= 1500, "the lyrics leave about a second after the last word");
	assert.ok(motion.boardVisibility(board, before.end + 300) > 0.9, "the last word stays a moment");
	assert.equal(motion.boardVisibility(board, before.rest.start + 1100), 0, "then the board is gone");
	const next = plan.boards[after.board];
	const middle = (before.rest.start + 1000 + before.rest.end) / 2;
	assert.equal(motion.boardVisibility(next, middle), 0, "the next board is not there yet");
	assert.ok(motion.boardVisibility(next, after.arrive + 200) > 0.9, "and is back before its first word");
	assert.ok(motion.restAt(plan, middle) > 0.99 && motion.restAt(plan, after.arrive) === 0, "only the video in between");
	assert.ok(motion.cameraPose(plan, middle, null).dolly < -100, "the camera keeps moving over the video");
	const a = motion.cameraPose(plan, before.leave - 1, null);
	const b = motion.cameraPose(plan, before.leave + 1, null);
	assert.ok(Math.abs(a.roll - b.roll) < 0.5 && Math.hypot(a.x - b.x, a.y - b.y) < 20 && Math.abs(a.dolly - b.dolly) < 5, "and hands over smoothly to the next move");
	for (let time = before.end; time < after.arrive; time += 53) {
		const pose = motion.cameraPose(plan, time, null);
		assert.ok([pose.x, pose.y, pose.z, pose.roll, pose.yaw, pose.pitch, pose.dolly].every(Number.isFinite));
	}
	const last = plan.boards[plan.boards.length - 1];
	const final = plan.lines[plan.lines.length - 1];
	assert.ok(motion.boardVisibility(last, final.end + 1000) > 0.9 && motion.boardVisibility(last, final.end + 6000) === 0, "the outro fades the last board");
	assert.ok(motion.restAt(plan, final.end + 6000) > 0.99);
	assert.ok(plan.lines.every((entry, index) => !entry.rest || !Number.isFinite(entry.rest.end) || plan.lines[index + 1].start - entry.end >= 5000), "short pauses keep their lyrics");

	// One shot spanning the interlude: the board hides and comes back.
	const together = compose(motion, type, model, director.normalizeDirection({ shots: [{ from: 0, to: 3, layout: "column", enter: "push" }] }, model, { seed: 5 }), 5);
	const shared = together.boards[0];
	const rest = together.lines[1].rest;
	assert.equal(shared.rests.length, 1);
	assert.equal(motion.boardVisibility(shared, (rest.start + 1000 + rest.end) / 2), 0);
	assert.ok(motion.boardVisibility(shared, together.lines[2].arrive) > 0.9);
});

test("serif sets a few words and the odd shot, never two shots running", () => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const raw = { shots: model.map((_, index) => ({ from: index, to: index, layout: "column", type: "serif" })) };
	const direction = director.normalizeDirection(raw, model, { seed: 2 });
	const serifShots = direction.shots.filter((shot) => shot.type === "serif").length;
	assert.ok(serifShots >= 1 && serifShots <= Math.max(1, Math.round(direction.shots.length * 0.15)), "the AI's serif shots are capped: " + serifShots);
	direction.shots.forEach((shot, index) => assert.ok(!(shot.type === "serif" && direction.shots[index - 1]?.type === "serif"), "no two serif shots running"));
	assert.ok(direction.shots.every((shot) => shot.serif === true), "the others keep serif for their emphasised words");
	let total = 0;
	let serif = 0;
	const lineBudget = Math.max(3, Math.round(model.length * 0.18));
	for (let seed = 1; seed <= 40; seed += 1) {
		const local = director.localDirection(model, { seed });
		const serifLines = local.shots.filter((shot) => shot.type === "serif").reduce((sum, shot) => sum + shot.to - shot.from + 1, 0);
		assert.ok(serifLines <= lineBudget + 2, "seed " + seed + ": " + serifLines + " serif lines");
		local.shots.forEach((shot, index) => {
			assert.ok(!(shot.type === "serif" && local.shots[index - 1]?.type === "serif"), "seed " + seed);
			total += 1;
			if (shot.type === "serif") serif += 1;
		});
	}
	assert.ok(serif / total <= 0.18, "serif shots stay rare: " + serif + " / " + total);
	const staged = (flag) => {
		const shaped = director.normalizeDirection({ shots: [{ from: 0, to: 1, layout: "column", type: "impact", serif: flag }], lines: [{ n: 0, emph: [1] }] }, model, { seed: 2 });
		const plan = compose(motion, type, model, shaped, 2);
		return { words: plan.lines[0].place.block.words, needs: motion.fontNeeds(model, shaped, type.typographyOf(model, "")) };
	};
	const withSerif = staged(true);
	assert.equal(withSerif.words[1].spec.kind, "serif", "an emphasised word goes serif");
	assert.notEqual(withSerif.words[0].spec.kind, "serif", "its neighbours stay heavy");
	assert.ok([...withSerif.needs.keys()].some((key) => key.includes("|serif|")), "and its face loads");
	assert.equal(staged(false).words[1].spec.kind, "impact");
});


