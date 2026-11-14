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
		assert.ok(Math.abs(settled.yaw - line.camera.yaw) < 4 && Math.abs(settled.pitch - line.camera.pitch) < 4, "facing the line: " + settled.yaw + " " + settled.pitch);
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

// A point on a line's own plane (lx, ly from its centre) in world space, as the engine places it.
const turnX = (p, degrees) => { const r = (degrees * Math.PI) / 180; return { x: p.x, y: p.y * Math.cos(r) - p.z * Math.sin(r), z: p.y * Math.sin(r) + p.z * Math.cos(r) }; };
const turnY = (p, degrees) => { const r = (degrees * Math.PI) / 180; return { x: p.x * Math.cos(r) + p.z * Math.sin(r), y: p.y, z: -p.x * Math.sin(r) + p.z * Math.cos(r) }; };
const turnZ = (p, degrees) => { const r = (degrees * Math.PI) / 180; return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r), z: p.z }; };
const onLine = (board, place, lx, ly) => {
	let p = turnZ(turnY(turnX({ x: lx, y: ly, z: 0 }, place.tiltX || 0), place.tiltY || 0), place.rot);
	p = turnZ({ x: p.x + place.x, y: p.y + place.y, z: p.z + place.z }, board.roll);
	return { x: p.x + board.origin.x, y: p.y + board.origin.y, z: p.z + board.origin.z };
};
// Where the camera sees a world point: screen offset from the centre (px) and depth.
const seenFrom = (motion, pose, point) => {
	let p = turnZ({ x: point.x - pose.x, y: point.y - pose.y, z: point.z - pose.z }, -pose.roll);
	p = turnX(turnY(p, pose.yaw || 0), pose.pitch || 0);
	const scale = motion.PERSPECTIVE_PX / (motion.PERSPECTIVE_PX - p.z);
	return { x: p.x * scale, y: p.y * scale, depth: p.z };
};

test("every composition sets its lines where the camera reads them", () => {
	const { motion, director, type } = load();
	assert.equal(director.LAYOUTS.length, 23);
	assert.equal(new Set(director.LAYOUTS).size, 23);
	assert.deepEqual(Object.keys(director.MAX_LINES).sort(), [...director.LAYOUTS].sort());
	const model = motion.buildModel(song());
	for (const layout of director.LAYOUTS) {
		for (const [seed, dutch] of [[2, 0], [5, 9], [11, -6]]) {
			const direction = director.normalizeDirection({ shots: [{ from: 0, to: 9, layout, enter: "pan", dutch }] }, model, { seed });
			assert.ok(direction.shots.every((shot) => shot.layout === layout && shot.to - shot.from + 1 <= director.MAX_LINES[layout]), layout + " holds its lines");
			const plan = compose(motion, type, model, direction, seed);
			assert.equal(plan.lines.length, model.length);
			for (const line of plan.lines) {
				const board = plan.boards[line.board];
				const label = layout + " seed " + seed + " line " + line.n;
				const upright = line.camera.roll - board.dutch - (board.roll + line.place.rot);
				assert.ok(Math.abs(upright - Math.round(upright / 360) * 360) < 0.01, label + " is upright");
				assert.ok([line.camera.x, line.camera.y, line.camera.z, line.camera.yaw, line.camera.pitch, line.place.x, line.place.y, line.place.z].every(Number.isFinite), label + " is placed");
				assert.equal(line.place.block.words.length, line.shown.length, label + " sets every word");
				const centre = seenFrom(motion, line.camera, line.center);
				assert.ok(Math.abs(centre.x) <= 1440 * 0.42 && Math.abs(centre.y) <= 900 * 0.42, label + " is in the frame: " + centre.x + ", " + centre.y);
				assert.ok(Math.abs(centre.depth - motion.viewDepth(line.camera, line.center)) < 0.01);
				const settled = motion.cameraPose(plan, line.start + 1, null);
				assert.ok(Math.abs(settled.yaw - line.camera.yaw) < 4 && Math.abs(settled.pitch - line.camera.pitch) < 4, label + " is faced when it starts");
				if (layout === "carousel" || layout === "reel") {
					// On a drum the camera turns to look at the line squarely, tilted shots too.
					for (const [lx, ly] of [[260, 0], [-260, 0], [0, 80], [0, -80]]) {
						assert.ok(Math.abs(motion.viewDepth(line.camera, onLine(board, line.place, lx, ly))) < 0.5, label + " is faced squarely");
					}
				} else {
					assert.equal(line.camera.yaw, 0);
					assert.equal(line.camera.pitch, 0);
				}
			}
			const drum = plan.boards.find((board) => board.places.length >= 3);
			if (layout === "carousel") {
				const tilts = drum.places.map((place) => place.tiltY);
				assert.ok(Math.abs(tilts[0] - tilts[tilts.length - 1]) > 20 && Math.abs(tilts[0] - tilts[tilts.length - 1]) <= 90, "the lines go round the drum: " + tilts);
				assert.ok(plan.lines.some((line) => Math.abs(line.camera.yaw) > 8), "and the camera swings round to them");
			}
			if (layout === "reel") {
				const tilts = drum.places.map((place) => place.tiltX);
				assert.ok(tilts.every((tilt, index) => !index || tilt < tilts[index - 1]), "the reel rolls one way: " + tilts);
				assert.ok(Math.abs(tilts[0] - tilts[tilts.length - 1]) <= 121, "within a third of a turn");
			}
			if (layout === "crawl") {
				const tilt = drum.places[0].tiltX;
				assert.equal(Math.abs(tilt), 36);
				assert.ok(drum.places.every((place) => place.tiltX === tilt), "one tilted plane");
				const depths = drum.places.map((place) => place.z);
				assert.ok(depths.every((z, index) => !index || (tilt > 0 ? z > depths[index - 1] : z < depths[index - 1])), "the lines lie along it: " + depths);
			}
			if (layout === "swell") {
				const sizes = drum.places.map((place) => place.block.size);
				assert.ok(sizes[sizes.length - 1] > sizes[0] * 1.5, "each line outgrows the last: " + sizes);
			}
			if (layout === "radial") {
				const turns = drum.places.map((place) => place.rot);
				assert.ok(Math.abs(turns[1] - turns[0]) >= 50 && Math.abs(Math.abs(turns[1] - turns[0]) - 90) > 1, "spokes, not a square: " + turns);
			}
			for (const board of plan.boards) {
				assert.equal(board.strokes.length, { strip: 1, split: 1, slot: 2 }[board.layout] || 0, board.layout + " strokes");
				for (const stroke of board.strokes) {
					assert.equal(stroke.stops.length, board.places.length);
					assert.ok(stroke.stops.every((stop, index) => stop > 0 && stop <= 1 && (!index || stop >= stroke.stops[index - 1] - 1e-9)), layout + " stops: " + stroke.stops);
					assert.equal(stroke.rot, board.layout === "strip" ? 0 : 90);
					const first = plan.lines[board.first];
					const last = plan.lines[board.last];
					assert.equal(motion.strokeLevel(plan, board, stroke, first.start - 400), 0, "nothing drawn before the first line");
					let level = 0;
					for (let time = first.start - 400; time <= last.end + 2000; time += 90) {
						const now = motion.strokeLevel(plan, board, stroke, time);
						assert.ok(now >= level - 1e-9, "it only grows");
						level = now;
					}
					assert.ok(Math.abs(level - stroke.stops[stroke.stops.length - 1]) < 1e-6, "and reaches the last line");
				}
			}
			for (let time = plan.lines[0].arrive - 3000; time < plan.lines[plan.lines.length - 1].end + 4000; time += 211) {
				const pose = motion.cameraPose(plan, time, null);
				assert.ok([pose.x, pose.y, pose.z, pose.roll, pose.yaw, pose.pitch].every(Number.isFinite), layout + " at " + time);
				const back = motion.backgroundFrame(plan, pose);
				assert.ok([back.rotate, back.scale, back.x, back.y].every(Number.isFinite) && back.scale < 4, layout + " background at " + time);
			}
		}
	}
	const facing = motion.facingOf({ tiltY: 30 }, 0);
	assert.ok(Math.abs(facing.yaw + 30) < 1e-9 && Math.abs(facing.pitch) < 1e-9, "a line turned 30 degrees is met by turning the camera back");
	const rolled = motion.facingOf({ tiltX: -25 }, 0);
	assert.ok(Math.abs(rolled.pitch - 25) < 1e-9 && Math.abs(rolled.yaw) < 1e-9);
});

test("the local director moves through many compositions and accents", () => {
	const { motion, director } = load();
	// A long song with no returning section, sung over itself here and there.
	const lyrics = [];
	let start = 2000;
	for (let index = 0; index < 54; index += 1) {
		if (index % 9 === 8) {
			// A short held line on its own, between pauses.
			lyrics.push(line(["stay" + index], start + 3000, { step: 1500 }));
			start += 3000 + 1500 + 3700;
			continue;
		}
		const parts = ["verse" + index, "keeps", "moving", "onward", "tonight", "again"].slice(0, 2 + (index % 4));
		lyrics.push(line(parts, start, { step: 420 }));
		start += parts.length * 420 + (index % 5 === 4 ? 2600 : index % 7 === 3 ? -300 : 700);
	}
	const model = motion.buildModel(lyrics);
	const layouts = new Set();
	const accents = new Set();
	for (let seed = 1; seed <= 24; seed += 1) {
		const direction = director.localDirection(model, { seed, tempo: { tempo: "mid", pace: 1 } });
		const used = new Set(direction.shots.map((shot) => shot.layout));
		assert.ok(used.size >= 7, "seed " + seed + " uses " + used.size + " compositions of " + direction.shots.length + " shots");
		assert.ok(new Set(direction.shots.map((shot) => shot.accent)).size >= 5, "seed " + seed + " accents");
		direction.shots.forEach((shot, index) => {
			const previous = direction.shots[index - 1];
			layouts.add(shot.layout);
			accents.add(shot.accent);
			assert.ok(director.ACCENTS.includes(shot.accent));
			if (previous) {
				assert.notEqual(shot.layout, previous.layout, "seed " + seed + ": a composition never follows itself");
				assert.notEqual(shot.accent, previous.accent, "seed " + seed + ": nor an accent");
			}
			const emphasised = Array.from({ length: shot.to - shot.from + 1 }, (_, offset) => direction.lines[shot.from + offset]).some((entry) => entry?.emph?.length);
			assert.ok(emphasised, "seed " + seed + " shot " + index + " shows its accent on a word");
		});
	}
	// Upright type needs Korean, Japanese or Chinese lines; every other composition is reached here.
	assert.deepEqual([...layouts].sort(), [...director.LAYOUTS].filter((name) => name !== "pillar").sort(), "every composition is reached");
	const japanese = motion.buildModel([[..."夢ならばどれほど"], [..."未だにあなたを"], [..."忘れた物を取りに"], [..."古びた思い出の"], [..."戻らない幸せが"], [..."最後にあなたが"]].map((parts, index) => line(parts, 1000 + index * 4200, { step: 300 })));
	let pillars = 0;
	for (let seed = 1; seed <= 30; seed += 1) pillars += director.localDirection(japanese, { seed, tempo: { tempo: "slow", pace: 1.4 } }).shots.filter((shot) => shot.layout === "pillar").length;
	assert.ok(pillars > 0, "Japanese lines can stand upright");
	assert.equal(director.ACCENTS.length, 16);
	assert.deepEqual([...accents].sort(), [...director.ACCENTS].sort(), "every accent is reached");
	// Voices facing each other and the build before a chorus steer the choice.
	const tally = (make, name) => {
		let hits = 0;
		for (let seed = 1; seed <= 60; seed += 1) {
			const direction = director.localDirection(make(), { seed, tempo: { tempo: "mid", pace: 1 } });
			if (direction.shots[0].layout === name) hits += 1;
		}
		return hits;
	};
	const answer = () => motion.buildModel([line(["I", "call", "you"], 0), line(["you", "call", "me"], 900), line(["we", "both", "know"], 1800), line(["it", "is", "over"], 2700)]);
	const apart = () => motion.buildModel([line(["I", "call", "you"], 0), line(["you", "call", "me"], 2200), line(["we", "both", "know"], 4400), line(["it", "is", "over"], 6600)]);
	assert.ok(tally(answer, "split") > tally(apart, "split"), "overlapping voices face each other more often");
});

test("every accent has its look, and the AI is told about every composition and accent", () => {
	const { motion, director } = load();
	const css = read("style.css");
	const looks = {
		color: ".accent-color ", outline: ".accent-outline ", underline: ".ivlyrics-motion-box.is-underline", mark: ".ivlyrics-motion-box.is-mark",
		spark: ".ivlyrics-motion-spark", glow: ".accent-glow ", gradient: ".accent-gradient ", stamp: ".ivlyrics-motion-box.is-stamp", circle: ".ivlyrics-motion-loop path",
		extrude: ".accent-extrude ", sticker: ".accent-sticker ", script: ".accent-script ", giant: ".accent-giant ", trail: ".ivlyrics-motion-trail",
		scribble: ".ivlyrics-motion-loop path", bracket: ".ivlyrics-motion-box.is-bracket",
	};
	assert.deepEqual(Object.keys(looks).sort(), [...director.ACCENTS].sort());
	for (const [name, selector] of Object.entries(looks)) assert.ok(css.includes(selector), name + " is styled by " + selector);
	// No accent sets an opaque box behind a word.
	assert.ok(!director.ACCENTS.includes("box") && !director.ACCENTS.includes("bubble"));
	assert.ok(!css.includes(".accent-box") && !css.includes(".is-bubble"));
	assert.equal(director.normalizeDirection({ shots: [{ from: 0, to: 0, layout: "column", accent: "box" }] }, motion.buildModel([line(["one", "two"], 0)]), { seed: 1 }).shots[0].accent === "box", false, "an older answer asking for a box gets another accent");
	// A gradient word animated letter by letter paints its letters, not the word as well (the letters would show twice).
	assert.ok(css.includes(".accent-gradient .ivlyrics-motion-word.is-emph .ivlyrics-motion-solid:not(.has-letters),"));
	assert.ok(css.includes(".ivlyrics-motion-stroke"));
	const source = read("MotionLyrics.js");
	assert.match(source, /BOX_ACCENTS = new Set\(\["underline", "mark", "stamp", "bracket"\]\)/);
	assert.match(source, /solid\.classList\.add\("has-letters"\)/);
	assert.match(source, /board\.accent === "scribble"/);
	assert.match(source, /board\.accent === "trail"/);
	for (const selector of [".ivlyrics-motion-flood", ".ivlyrics-motion-plate.is-card", ".ivlyrics-motion-plate.is-band", ".ivlyrics-motion-plate.is-ring", ".ivlyrics-motion-fill", ".ivlyrics-motion-word.is-upright", ".ivlyrics-motion-line.on-color"]) {
		assert.ok(css.includes(selector), selector + " is styled");
	}
	assert.match(source, /board\.accent === "circle"/);
	assert.match(source, /board\.accent === "glow"/);
	assert.match(source, /rotateY\(" \+ round\(place\.tiltY, 2\)/);
	assert.match(source, /rotateX\(" \+ round\(place\.tiltX, 2\)/);
	const window = { addEventListener() {}, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } };
	const context = vm.createContext({ window, console, setTimeout, clearTimeout, Intl, localStorage: window.localStorage, Spicetify: { LocalStorage: { get: () => null, set() {} } } });
	context.globalThis = context;
	vm.runInContext(read("AIAddonManager.js"), context);
	// Without the director's vocabulary the prompt falls back to the manager's own copy: both must agree.
	const fallback = window.AIAddonManager.buildMotionDirectionPrompt({ lines: [] });
	const informed = window.AIAddonManager.buildMotionDirectionPrompt({ lines: [], vocabulary: director.vocabulary() });
	for (const prompt of [fallback, informed]) {
		for (const name of director.LAYOUTS) assert.ok(prompt.includes(name + " = "), "the prompt explains " + name);
		for (const name of director.ACCENTS) assert.ok(prompt.includes(name + " = "), "the prompt explains " + name);
		assert.ok(prompt.includes("(" + director.ACCENTS.join("|") + ")"));
		for (const [name, most] of Object.entries(director.MAX_LINES)) if (most < 6) assert.ok(prompt.includes(name + " at most " + most), name + " limit");
	}
	assert.equal(director.VERSION, 4, "older cached directions are asked for again");
	assert.equal(typeof motion.strokeLevel, "function");
});

test("compositions after typography edits: one line at a time, colour grounds, type as an object", () => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const stage = (layout, extra = {}) => {
		const direction = director.normalizeDirection({ shots: [{ from: 0, to: 9, layout, enter: "pan", ...extra }], lines: [{ n: 0, emph: [1] }] }, model, { seed: 3 });
		return compose(motion, type, model, direction, 3);
	};
	for (const layout of ["slot", "poster", "spread"]) {
		const plan = stage(layout);
		const board = plan.boards[0];
		assert.equal(board.solo, true, layout + " shows one line at a time");
		assert.ok(board.places.every((place) => place.x === 0 && place.y === 0), layout + " keeps its lines in one place");
		const [first, second] = plan.lines;
		assert.deepEqual(plain(motion.levelsOn(board, second, -1, first.start)), { ghost: 0, solid: 1 }, "nothing waits on screen");
		assert.equal(motion.levelsOn(board, first, 0, first.start).solid, 1);
		assert.equal(motion.levelsOn(board, first, 1, second.start).solid, 0, "the last line is gone when the next starts");
	}
	// Lines sung over each other cannot take turns in one place.
	const duet = motion.buildModel([line(["one", "two", "three"], 0), line(["four", "five"], 900), line(["six", "seven"], 3000)]);
	const together = compose(motion, type, duet, director.normalizeDirection({ shots: [{ from: 0, to: 2, layout: "slot" }] }, duet, { seed: 1 }), 1);
	assert.equal(together.boards[0].layout, "split");
	assert.equal(together.boards[0].solo, false);

	const slot = stage("slot").boards[0];
	assert.deepEqual(plain(slot.plates.map((plate) => plate.kind)), ["band"]);
	const poster = stage("poster");
	assert.equal(poster.floods.length, poster.lines.length, "a colour field for every line");
	assert.ok(poster.floods.every((flood, index) => !index || flood.start >= poster.floods[index - 1].end - 1), "one at a time");
	const sung = poster.lines[1];
	const field = motion.floodAt(poster, sung.start + 200);
	assert.equal(field.level, 1);
	assert.equal(field.color, sung.place.flood);
	assert.notEqual(poster.lines[0].place.flood, sung.place.flood, "the colour changes with the line");
	assert.equal(motion.floodAt(poster, poster.lines[0].arrive - 5000), null);
	assert.ok(motion.floodAt(poster, poster.floods[0].start + 30).level < 1, "the first field opens from a band");
	assert.equal(sung.place.ground, sung.place.flood === "ink" ? "dark" : "color");
	assert.equal(motion.floodAt(stage("column"), 3000), null);

	const cards = stage("cards");
	const deck = cards.boards[0];
	assert.equal(deck.plates.length, deck.places.length);
	assert.ok(deck.plates.every((plate, index) => plate.kind === "card" && plate.line === index && plate.w > deck.places[index].block.width && Math.abs(plate.x - deck.places[index].x) < 0.01));
	assert.ok(deck.places.every((place, index) => place.cover && (!index || place.z > deck.places[index - 1].z)), "each card lands on the last");
	const dealt = cards.lines[1];
	assert.equal(motion.plateLevel(cards, deck, deck.plates[1], dealt.start - 400), 0);
	assert.ok(Math.abs(motion.plateLevel(cards, deck, deck.plates[1], dealt.start + 600) - 1) < 0.01);
	assert.equal(motion.levelsOn(deck, dealt, -1, dealt.start - 400).ghost, 0, "a line waits unseen until its card lands");
	assert.ok(motion.levelsOn(deck, dealt, -0.2, dealt.start - 100).ghost > 0);

	const wall = stage("wordwall").boards[0];
	assert.ok(wall.fills.length >= 8 && wall.fills.every((fill) => fill.text && fill.size > 0 && [fill.x, fill.y].every(Number.isFinite)), "outlined copies tile the wall");
	assert.ok(Math.abs(wall.dutch) >= 7 && Math.abs(wall.dutch) <= 12, "set askew: " + wall.dutch);
	assert.ok(wall.fills.some((fill) => fill.text === model[0].text));

	const arch = stage("arch").boards[0];
	const bent = arch.places[0].block.words;
	assert.ok(bent[0].rot < 0 && bent[bent.length - 1].rot > 0 && bent[0].y > 0, "words stand on the curve: " + bent.map((word) => Math.round(word.rot)));
	assert.ok(arch.places[1].rot > arch.places[0].rot, "the next line goes on round the circle");
	assert.deepEqual(plain(arch.plates.map((plate) => plate.kind)), ["ring"]);

	const spread = stage("spread").boards[0].places[0].block;
	assert.ok(spread.width > 1440 * 0.5, "words reach across the screen: " + spread.width);
	assert.ok(new Set(spread.words.map((word) => Math.sign(word.y))).size === 2, "one higher, the next lower");

	const pillars = stage("pillar");
	const upright = pillars.boards.filter((board) => board.layout === "pillar");
	assert.ok(upright.length > 0 && upright.length < pillars.boards.length, "only Korean, Japanese and Chinese lines stand upright");
	for (const board of upright) {
		for (const place of board.places) assert.ok(place.block.words.every((word) => word.vertical && word.height >= word.width), "letters stand one under another");
	}
	assert.ok(pillars.boards.filter((board) => board.layout !== "pillar").every((board) => board.places.every((place) => place.block.words.every((word) => !word.vertical))));
	assert.equal(stage("pillar", { accent: "underline" }).boards.find((board) => board.layout === "pillar").accent, "color", "accents that need a baseline give way");
});

test("accents after typography edits: handwriting, a giant word and drawn marks", () => {
	const { motion, director, type } = load();
	assert.ok(type.fontSpec("ko", "hand").family.startsWith('"Nanum Brush Script"'));
	assert.ok(type.fontSpec("latin", "hand").family.startsWith('"Kaushan Script"'));
	assert.equal(type.fontSpec("ja", "hand").kind, "hand");
	assert.equal(type.fontSpec("greek", "hand").kind, "impact", "a script without a handwriting face keeps its heavy one");
	assert.equal(type.fontSpec("ko", "hand", "light").kind, "light");
	const model = motion.buildModel(song());
	const staged = (accent) => {
		const direction = director.normalizeDirection({ shots: [{ from: 0, to: 1, layout: "column", accent, upper: true }], lines: [{ n: 0, emph: [1] }] }, model, { seed: 2 });
		return { direction, words: compose(motion, type, model, direction, 2).lines[0].place.block.words };
	};
	const plainWords = staged("color").words;
	const script = staged("script");
	assert.equal(script.words[1].spec.kind, "hand", "the emphasised word is handwritten");
	assert.equal(script.words[1].text, "road", "and keeps its case");
	assert.equal(script.words[0].spec.kind, "impact");
	assert.ok([...motion.fontNeeds(model, script.direction, type.typographyOf(model, "")).keys()].some((key) => key.includes("|hand|")), "its face loads");
	const giant = staged("giant").words;
	assert.ok(giant[1].size / giant[0].size > (plainWords[1].size / plainWords[0].size) * 1.5, "a giant word towers over its line");
	assert.deepEqual(plain(motion.deepOf("#ff9ec4")).length, 7);
	const [, , light] = [0, 0, parseInt(motion.deepOf("#ff9ec4").slice(1, 3), 16) + parseInt(motion.deepOf("#ff9ec4").slice(3, 5), 16) + parseInt(motion.deepOf("#ff9ec4").slice(5, 7), 16)];
	assert.ok(light < 440, "a ground is deep enough for white type");
});



