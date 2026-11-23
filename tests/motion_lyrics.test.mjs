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

const screenOf = (model, shot) => {
	let span = model[shot.to].end - model[shot.from].start;
	for (let index = shot.from + 1; index <= shot.to; index += 1) {
		const gap = model[index].start - model[index - 1].end;
		if (gap >= 5000) span -= gap;
	}
	return span;
};


// Most tests read the plan line by line: they keep every line whole (pieces have tests of their own).
const compose = (motion, type, model, direction, seed, lang = "", pieces = false) => motion.compose(model, direction, {
	width: 1440, height: 900, seed, measure, typography: type.typographyOf(model, lang), songLang: lang, pieces,
});

const plans = (seed) => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const direction = director.localDirection(model, { seed });
	return { motion, director, type, model, direction, plan: compose(motion, type, model, direction, seed) };
};

/**
 * A song where every shot uses the given entrance, staged as asked: the
 * director's restraint and range (tested on their own) would otherwise
 * swap most of them.
 */
const forced = (enter, extra = {}) => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const raw = { shots: model.map((_, index) => ({ from: index, to: index, layout: "column", enter, fx: "pop", ...extra })) };
	const checked = director.normalizeDirection(raw, model, { seed: 4 });
	const direction = { ...checked, shots: checked.shots.map((shot) => ({ ...shot, layout: "column", enter, fx: "pop", ...extra })) };
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
			if (["push", "pull", "through", "fade", "iris", "open", "corkscrew"].includes(board.enter)) {
				assert.ok(Math.abs(board.cameras[0].z - last.z) >= 300, "a dolly or dissolve entrance moves the camera in depth");
				return;
			}
			// The two boards' outlines (convex hulls of their lines' corners) do not overlap: some axis separates them.
			const hull = (points) => {
				const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
				const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
				const half = (list) => {
					const out = [];
					for (const point of list) {
						while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
						out.push(point);
					}
					return out.slice(0, -1);
				};
				return [...half(sorted), ...half([...sorted].reverse())];
			};
			const a = hull(previous.corners);
			const b = hull(board.corners);
			const axes = [a, b].flatMap((polygon) => polygon.map((point, index) => {
				const next = polygon[(index + 1) % polygon.length];
				return { x: next.y - point.y, y: point.x - next.x };
			}));
			const apart = axes.some((axis) => {
				const length = Math.hypot(axis.x, axis.y) || 1;
				const project = (polygon) => polygon.map((point) => (point.x * axis.x + point.y * axis.y) / length);
				const pa = project(a);
				const pb = project(b);
				return Math.max(...pa) <= Math.min(...pb) + 1 || Math.max(...pb) <= Math.min(...pa) + 1;
			});
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
	assert.equal(director.FX.length, 32);
	assert.equal(new Set(director.FX).size, 32);
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
	// The newer entrances: clean reveals, hinged turns and letters that fall, ripple or spiral in.
	assert.ok(motion.solidFrame("lift", 0.3).clip.startsWith("inset(") && motion.solidFrame("lift", 0.3).transform.startsWith("translateY("), "lift rises out of a mask");
	assert.ok(motion.solidFrame("swing", 0.3).transform.startsWith("translateX(-50%) rotate("), "swing hangs from its first letter");
	assert.ok(motion.solidFrame("swing", 0.3, 0, true).transform.startsWith("translateX(50%)"), "from its last in right-to-left lines");
	assert.ok(motion.solidFrame("door", 0.3).transform.includes("rotateY("), "door turns in");
	assert.ok(motion.solidFrame("smear", 0.2).filter.startsWith("blur(") && motion.solidFrame("smear", 0.2).transform.includes("scaleX("), "smear stretches");
	const opening = motion.solidFrame("open", 0.3).clip.match(/^inset\((\S+) (calc\([^)]*\)) \S+ (calc\([^)]*\))\)$/);
	assert.ok(opening && opening[2] === opening[3], "open reveals from the middle: " + motion.solidFrame("open", 0.3).clip);
	assert.ok(motion.solidFrame("glide", 0.3).opacity < motion.solidFrame("pop", 0.3).opacity, "glide comes in softer than a pop");
	assert.ok(motion.wordEntrance("glide", word, 1300) < motion.wordEntrance("pop", word, 1300), "and takes its time");
	assert.ok(motion.charFrame("cascade", { start: 1000 }, 0, 960, { count: 3 }).transform.startsWith("translateY(-"), "cascade letters fall in");
	assert.ok(motion.charFrame("ripple", { start: 1000 }, 0, 1050, { count: 3 }).transform.includes("scaleY("), "ripple letters grow up");
	assert.ok(motion.charFrame("swirl", { start: 1000 }, 0, 1000, { count: 3 }).transform.includes("rotate(-"), "swirl letters spiral in");
	for (const fx of ["cascade", "ripple", "swirl"]) assert.ok(director.LETTER_FX.includes(fx), fx + " moves letters");
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
	const checked = director.normalizeDirection(raw, model, { seed: 1 });
	// Staged as asked (the director rations slams and cuts on its own).
	const direction = { ...checked, shots: checked.shots.map((shot) => (shot.to <= 2 ? { ...shot, fx: "slam" } : shot.from === 3 ? { ...shot, layout: "tunnel", enter: "cut" } : { ...shot, enter: "pan" })) };
	const plan = compose(motion, type, model, direction, 1);
	assert.equal(plan.slams.length, 4, "the camera takes the hit on each line's first word and the emphasised one, not on every word");
	assert.equal(plan.slams.find((slam) => slam.time === model[0].words[1].start).strength, 12, "an emphasised slam hits harder");
	assert.equal(plan.slams.find((slam) => slam.time === model[0].words[0].start).strength, 6);
	assert.ok(!plan.slams.some((slam) => slam.time === model[0].words[2].start), "the words between land without a shake");
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
	// The director writes the prompt the manager sends.
	window.ivLyricsMotionDirector = load().director;
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
		for (const key of ["\"motionDirection\":", "\"motionDirecting\":", "\"motionDirectFailed\":", "\"motionDirectionFailed\":"]) assert.ok(source.includes(key), code + " has " + key);
	}
	// The AI direction's progress shows with the app's other AI tasks (top left), not over the mode switcher.
	assert.match(vinyl, /onStatus: reportMotionDirectionStatus/);
	assert.match(vinyl, /new CustomEvent\(MOTION_DIRECTION_STATUS_EVENT, \{ detail \}\)/);
	assert.match(vinyl, /const MOTION_DIRECTION_STATUS_EVENT = "ivLyrics:motion-direction:status";/);
	assert.match(index, /window\.addEventListener\("ivLyrics:motion-direction:status", this\.handleMotionDirectionStatus\)/);
	assert.match(index, /window\.removeEventListener\("ivLyrics:motion-direction:status", this\.handleMotionDirectionStatus\)/);
	assert.match(index, /key: "motion-direction",\s*label: I18n\.t\("generationStatus\.motionDirection"\)/);
	assert.match(read("MotionLyrics.js"), /status && !reports \? e\("div", \{ className: "ivlyrics-motion-status is-"/);
});

test("the marks round an emphasised word keep clear of the words beside it", () => {
	const { motion, director, type } = load();
	const model = motion.buildModel([line(["ただの", "日常を", "祝って"], 2000, { joined: true })]);
	const blockFor = (accent) => {
		const raw = { shots: [{ from: 0, to: 0, layout: "column", enter: "pan", accent }] };
		const checked = director.normalizeDirection(raw, model, { seed: 1 });
		const direction = { ...checked, shots: checked.shots.map((shot) => ({ ...shot, layout: "column", accent })), lines: [{ emph: [1], fx: "pop" }] };
		const plan = compose(motion, type, model, direction, 1, "ja");
		assert.equal(plan.boards[0].accent, accent);
		return plan.lines[0].place.block;
	};
	const gaps = (block) => block.words.slice(1).map((word, index) => (word.x - word.width / 2) - (block.words[index].x + block.words[index].width / 2));
	const plainGaps = gaps(blockFor("color"));
	assert.equal(model[0].words.length, 3, "three words");
	assert.ok(plainGaps.every((gap) => gap < 12), "joined words sit close: " + plainGaps);
	for (const accent of ["bracket", "stamp", "circle"]) {
		const block = blockFor(accent);
		const emphasised = block.words[1];
		assert.ok(emphasised.emph, "the middle word is emphasised");
		for (const gap of gaps(block)) assert.ok(gap >= emphasised.size * 0.24, accent + " leaves room for its mark: " + gap + " for a " + emphasised.size + "px word");
	}
});

test("masks that reveal a word let its shadow and glow through once it is in", () => {
	const { motion } = load();
	// The inset() values in em for a word 3em wide and 1em tall.
	const ems = (clip) => {
		const parts = clip.slice("inset(".length, -1).match(/calc\([^)]*\)|\S+/g);
		return parts.map((part, index) => {
			const across = index % 2 === 1 ? 3 : 1;
			const value = (token) => (token.endsWith("%") ? (Number(token.slice(0, -1)) / 100) * across : Number(token.replace("em", "")));
			const calc = part.match(/^calc\((\S+) ([+-]) (\S+)\)$/);
			return calc ? value(calc[1]) + (calc[2] === "-" ? -1 : 1) * value(calc[3]) : value(part);
		});
	};
	for (const fx of ["wipe", "open"]) {
		const late = motion.solidFrame(fx, 0.999).clip;
		assert.ok(ems(late).every((value) => value <= -0.5), fx + " ends past the word on every side: " + late + " " + ems(late));
		const early = motion.solidFrame(fx, 0.001).clip;
		const [top, right, bottom, left] = ems(early);
		assert.ok(right + left >= 3, fx + " starts hidden: " + early + " " + [top, right, bottom, left]);
	}
	const lift = motion.solidFrame("lift", 0.98).clip;
	assert.ok(ems(lift).every((value) => value < -0.3), "lift's mask drops away from the shadow: " + lift);
	const rising = motion.solidFrame("lift", 0.2);
	const depth = Number(rising.transform.match(/translateY\(([\d.]+)em\)/)[1]);
	assert.ok(Math.abs(ems(rising.clip)[2] - (depth - 0.2)) < 0.01, "while rising it is still masked at its baseline: " + rising.clip);
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
	assert.equal(director.LAYOUTS.length, 37);
	assert.equal(new Set(director.LAYOUTS).size, 37);
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
				// Short lines that can grow (a long line is held to two rows and set smaller).
				const build = motion.buildModel([line(["hold", "on"], 1000), line(["hold", "on", "tight"], 2400), line(["never", "let", "go"], 3800)]);
				const swell = compose(motion, type, build, director.normalizeDirection({ shots: [{ from: 0, to: 2, layout: "swell", enter: "pan" }] }, build, { seed }), seed).boards[0];
				const sizes = swell.places.map((place) => place.block.size);
				assert.ok(sizes.every((size, index) => !index || size > sizes[index - 1]) && sizes[2] > sizes[0] * 1.5, "each line outgrows the last: " + sizes);
			}
			if (layout === "radial") {
				const turns = drum.places.map((place) => place.rot);
				assert.ok(Math.abs(turns[1] - turns[0]) >= 50 && Math.abs(Math.abs(turns[1] - turns[0]) - 90) > 1, "spokes, not a square: " + turns);
			}
			for (const board of plan.boards) {
				const lineCount = board.places.length;
				if (board.layout === "constellation") {
					// A line drawn from each star to the next, when they are far enough apart to show one.
					assert.ok(board.strokes.length <= lineCount - 1, "constellation strokes");
					assert.ok(lineCount < 3 || board.strokes.length >= 1, "constellation joins its lines");
				} else if (board.layout === "grid") {
					const columns = lineCount <= 1 ? 1 : 2;
					assert.equal(board.strokes.length, (columns > 1 ? 1 : 0) + Math.ceil(lineCount / columns) - 1, "grid rules");
				} else if (board.layout === "rails") {
					assert.ok(board.strokes.length >= 3, "rails are drawn across the board");
				} else {
					assert.equal(board.strokes.length, { strip: 1, split: 1, slot: 2 }[board.layout] || 0, board.layout + " strokes");
				}
				for (const stroke of board.strokes) {
					assert.equal(stroke.stops.length, board.places.length);
					assert.ok(stroke.stops.every((stop, index) => stop >= 0 && stop <= 1 && (!index || stop >= stroke.stops[index - 1] - 1e-9)), layout + " stops: " + stroke.stops);
					assert.ok(stroke.stops[stroke.stops.length - 1] > 0, layout + " is drawn by the end");
					if (board.layout === "strip") assert.equal(stroke.rot, 0);
					else if (board.layout === "grid") assert.ok([0, 90, 180].includes(stroke.rot));
					else if (board.layout !== "constellation") assert.equal(stroke.rot, 90);
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
	assert.equal(director.ACCENTS.length, 19);
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
		neon: ".accent-neon ", chrome: ".accent-chrome ", spectrum: ".accent-spectrum ",
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
	for (const selector of [".ivlyrics-motion-flood", ".ivlyrics-motion-plate.is-band", ".ivlyrics-motion-plate.is-ring", ".ivlyrics-motion-fill", ".ivlyrics-motion-word.is-upright", ".ivlyrics-motion-line.on-color"]) {
		assert.ok(css.includes(selector), selector + " is styled");
	}
	assert.ok(!css.includes(".ivlyrics-motion-plate.is-card"), "no colour cards are styled");
	assert.match(source, /board\.accent === "circle"/);
	assert.match(source, /board\.accent === "glow"/);
	assert.match(source, /rotateY\(" \+ round\(place\.tiltY, 2\)/);
	assert.match(source, /rotateX\(" \+ round\(place\.tiltX, 2\)/);
	const window = { addEventListener() {}, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } };
	const context = vm.createContext({ window, console, setTimeout, clearTimeout, Intl, localStorage: window.localStorage, Spicetify: { LocalStorage: { get: () => null, set() {} } } });
	context.globalThis = context;
	vm.runInContext(read("AIAddonManager.js"), context);
	// The director writes the prompt from its own vocabulary (the mobile apps use it too); the manager passes it on.
	assert.throws(() => window.AIAddonManager.buildMotionDirectionPrompt({ lines: [] }), /director is unavailable/);
	window.ivLyricsMotionDirector = director;
	const prompt = window.AIAddonManager.buildMotionDirectionPrompt({ lines: [] });
	assert.equal(prompt, director.buildPrompt({ lines: [] }));
	for (const name of director.LAYOUTS) assert.ok(prompt.includes(name + " = "), "the prompt explains " + name);
	assert.ok(!prompt.includes("cards = ") && !prompt.includes("colour card"), "the AI is not offered colour cards");
	assert.ok(prompt.includes("tower = each line set in two justified rows"), "nor a tower of more than two rows");
	for (const name of director.ACCENTS) assert.ok(prompt.includes(name + " = "), "the prompt explains " + name);
	assert.ok(prompt.includes("(" + director.ACCENTS.join("|") + ")"));
	for (const [name, most] of Object.entries(director.MAX_LINES)) if (most < 6) assert.ok(prompt.includes(name + " at most " + most), name + " limit");
	assert.equal(director.VERSION, 8, "older cached directions are asked for again");
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
		// The line before stays until the next one comes in and leaves with the shot's exit as it does: never an empty screen.
		assert.equal(motion.levelsOn(board, first, 1, second.start - 60).solid, 1, "the last line is there until the next starts");
		assert.equal(first.exitAt, first.soloOut, "it leaves with the exit");
		assert.ok(motion.levelsOn(board, first, 1, first.soloOut + first.exitSpan * 0.4).solid === 1, "which plays before it fades");
		assert.equal(motion.levelsOn(board, first, 1, first.soloOut + first.exitSpan).solid, 0, "and gone once the next is in");
		assert.ok(first.soloOut + first.exitSpan <= second.start + 480, "soon after the next starts");
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

	// Colour cards dealt one over another are gone; an older (cached) answer asking for them gets another composition.
	assert.ok(!director.LAYOUTS.includes("cards"));
	const dealt = stage("cards");
	assert.ok(dealt.boards.every((board) => board.layout !== "cards" && (board.plates || []).every((plate) => plate.kind !== "card")), "no colour cards are dealt");

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

test("lines come and go instead of standing as a lyric sheet", () => {
	const { motion, director, type } = load();
	const lyrics = [];
	let start = 2000;
	for (let index = 0; index < 8; index += 1) {
		const parts = ["slow", "words", "drifting", "over", "the", "quiet", "sea"].slice(0, 4 + (index % 3));
		lyrics.push(line(parts, start, { step: 620 }));
		start += parts.length * 620 + 800;
	}
	const model = motion.buildModel(lyrics);
	for (const layout of ["column", "stairs", "wall", "zigzag", "corners", "hero", "swell", "split"]) {
		const direction = director.normalizeDirection({ shots: [{ from: 0, to: 7, layout, enter: "pan", exit: "fall", hold: "drift" }] }, model, { seed: 4, tempo: { tempo: "slow", pace: 1.4 } });
		assert.ok(direction.shots.every((shot) => screenOf(model, shot) <= director.MAX_SHOT_MS), layout + ": no composition stays longer than " + director.MAX_SHOT_MS + " ms");
		const plan = compose(motion, type, model, direction, 4);
		for (let time = plan.lines[0].start; time < plan.lines[plan.lines.length - 1].end; time += 97) {
			const progress = motion.progressAt(plan, time);
			const shown = plan.lines.filter((item) => {
				const board = plan.boards[item.board];
				const levels = motion.levelsOn(board, item, progress - item.n, time);
				return motion.boardVisibility(board, time) * Math.max(levels.ghost, levels.solid) > 0.02;
			});
			assert.ok(shown.length <= 3, layout + " at " + time + ": " + shown.map((item) => item.n));
			// Two lines back is always gone.
			assert.ok(shown.every((item) => item.n >= motion.lineIndexAt(plan, time) - 1), layout + " at " + time + " keeps an old line: " + shown.map((item) => item.n));
		}
		const [first, second] = plan.lines;
		if (first.board === second.board) {
			assert.equal(plan.boards[first.board].exit, "fall");
			const board = plan.boards[first.board];
			assert.equal(motion.levelsOn(board, second, -1, second.peekAt - 50).ghost, 0, "the next line is not there long before it is sung");
			assert.ok(motion.levelsOn(board, second, -0.2, second.start - 60).ghost > 0.2, "its outline peeks in just before");
			assert.ok(motion.levelsOn(board, first, 1, second.start + 400).solid < 0.6, "the sung line dims once the next one starts");
			assert.equal(motion.levelsOn(board, first, 1, first.exitAt + first.exitSpan + 1).solid, 0, "and is gone after its exit");
			assert.ok(first.exitAt > first.end && first.exitAt > second.start, "it leaves only after the next line is under way");
		}
	}
	// Compositions that are about their structure keep the lines round the current one.
	const reel = compose(motion, type, model, director.normalizeDirection({ shots: [{ from: 0, to: 4, layout: "reel", enter: "pan" }] }, model, { seed: 4 }), 4);
	assert.equal(reel.boards[0].preview, true);
	assert.ok(reel.lines.slice(0, 4).every((item) => !Number.isFinite(item.exitAt)));
});

test("sung lines leave with their exit and held lines keep moving", () => {
	const { motion, director } = load();
	assert.equal(director.EXITS.length, 25);
	assert.deepEqual(plain(motion.EXIT_NAMES), plain(director.EXITS), "the renderer knows every exit the director may ask for");
	assert.equal(director.HOLDS.length, 9);
	for (const exit of director.EXITS) {
		assert.deepEqual(plain(motion.exitFrame(exit, 0)), plain(motion.solidFrame("pop", 1)), exit + " starts settled");
		assert.equal(motion.exitFrame(exit, 1).opacity, 0, exit + " ends hidden");
		const middle = motion.exitFrame(exit, 0.5, 7);
		assert.ok(middle.opacity < 1 || middle.clip, exit + " is on its way out");
		assert.ok(middle.transform !== "none" || middle.clip || middle.filter, exit + " moves");
	}
	// Letter by letter: each letter takes its own turn, and they are all gone at the end.
	const letters = (exit, k) => Array.from({ length: 6 }, (_, index) => motion.exitCharFrame(exit, k, { ch: "abcdef"[index] }, index, { count: 6, seed: 11 }));
	for (const exit of Object.keys(motion.LETTER_EXITS)) {
		assert.ok(director.EXITS.includes(exit), exit + " is an exit");
		assert.ok(letters(exit, 0).every((state) => state.opacity === 1 && state.transform === "none"), exit + " starts settled");
		assert.ok(letters(exit, 1).every((state) => state.opacity === 0), exit + " ends with every letter gone");
		const middle = letters(exit, 0.45);
		const moving = middle.filter((state) => state.opacity < 1 || state.transform !== "none" || state.text);
		assert.ok(moving.length > 0 && moving.length < 6 || exit === "burst", exit + " takes the letters one by one: " + JSON.stringify(middle));
		// Words whose letters join leave the nearest whole-word way.
		assert.equal(motion.exitFrame(exit, 1).opacity, 0);
		assert.ok(motion.exitFrame(exit, 0.5, 7).opacity < 1 || motion.exitFrame(exit, 0.5, 7).clip, exit + " has a whole-word stand-in");
	}
	const erased = letters("erase", 0.3);
	assert.ok(erased[5].opacity < erased[0].opacity, "erase goes back from the end");
	const crumbled = letters("crumble", 0.3);
	assert.ok(crumbled[0].transform !== "none" && crumbled[5].transform === "none", "crumble drops the first letters first");
	assert.ok(letters("scramble", 0.4).some((state) => state.text && state.text.length === 1), "scramble flickers through other characters");
	const held = { start: 1000, end: 3000, voicesEnd: 3000, exitAt: 5000, exitSpan: 600, text: "hold me" };
	for (const hold of ["grow", "drift", "lean", "push"]) {
		assert.equal(motion.holdFrame(hold, held, 900), "", hold + " waits for the line");
		const early = motion.holdFrame(hold, held, 1500);
		const late = motion.holdFrame(hold, held, 4500);
		assert.ok(early && late && early !== late, hold + " keeps moving: " + early + " -> " + late);
	}
	assert.equal(motion.holdFrame("still", held, 2000), "");
	// Local directions use them and never repeat one shot to the next.
	const model = motion.buildModel(song());
	for (const seed of [1, 2, 3]) {
		const direction = director.localDirection(model, { seed });
		direction.shots.forEach((shot, index) => {
			assert.ok(director.EXITS.includes(shot.exit) && director.HOLDS.includes(shot.hold));
			const previous = direction.shots[index - 1];
			if (previous && !shot.repeated) assert.ok(shot.exit !== previous.exit || shot.hold !== previous.hold || shot.from === previous.from);
		});
	}
	// The AI may set them; anything else gets the local choice.
	const asked = director.normalizeDirection({ shots: [{ from: 0, to: 1, layout: "column", exit: "scatter", hold: "lean" }, { from: 2, to: 3, layout: "hero", exit: "nope", hold: 3 }] }, model, { seed: 2 });
	assert.equal(asked.shots[0].exit, "scatter");
	assert.equal(asked.shots[0].hold, "lean");
	assert.ok(director.EXITS.includes(asked.shots[1].exit) && director.HOLDS.includes(asked.shots[1].hold));
	const prompt = director.buildPrompt({ lines: [] });
	for (const name of [...director.EXITS, ...director.HOLDS]) assert.ok(prompt.includes(name + " = "), "the prompt explains " + name);
	assert.ok(prompt.includes("not shown as a lyric sheet"));
});


test("compositions from the motion-typography canon", () => {
	const { motion, director, type } = load();
	const lyrics = [
		line(["I", "will", "never", "let", "you", "go"], 2000, { step: 300 }),
		line(["hold", "on", "tonight"], 4400, { step: 400 }),
		line(["every", "word", "you", "said"], 6600, { step: 350 }),
		line(["we", "are", "burning", "bright"], 9000, { step: 380 }),
	];
	const model = motion.buildModel(lyrics);
	const stage = (layout, extra = {}) => {
		const direction = director.normalizeDirection({ shots: [{ from: 0, to: 3, layout, enter: "pan", ...extra }], lines: [{ n: 0, emph: [2] }] }, model, { seed: 8 });
		return compose(motion, type, model, direction, 8);
	};

	// A sized lockup: the stressed word large, the little words small, two rows of the same width.
	const lockup = stage("lockup").boards[0];
	assert.equal(lockup.solo, true);
	const sized = lockup.places[0].block;
	const size = (index) => sized.words[index].size;
	assert.ok(size(2) > size(0) * 2 && size(2) > size(1) * 1.5, "never outweighs I and will: " + sized.words.map((word) => Math.round(word.size)));
	assert.equal(sized.rows, 2);

	// One word at a time, all in one place.
	const flash = stage("flash");
	const flashed = flash.boards[0].places[0];
	assert.equal(flashed.flash, true);
	assert.ok(flashed.block.words.every((word) => word.x === 0 && word.y === 0), "every word in the same place");
	assert.ok(flashed.block.words[2].size > flashed.block.words[0].size * 1.8, "sized by stress");

	// A mosaic: lines attached edge to edge, some turned a quarter, the camera rolling with them.
	const chain = stage("chain").boards[0];
	assert.ok(chain.places.some((place) => Math.abs(place.rot % 180) === 90) || chain.places.length < 3, "a line turned down the side: " + chain.places.map((place) => place.rot));

	// Capitals filling the width: the words sung so far always fill it.
	const fill = stage("fill");
	const filled = fill.lines[2];
	assert.ok(filled.place.fill, "a short line fills the width");
	const scaleAt = (time) => Number(motion.fillFrame(filled, filled.place, time).match(/scale\(([\d.]+)\)/)[1]);
	assert.ok(scaleAt(filled.words[0].start + 300) > 1.5, "the first word alone fills it: " + scaleAt(filled.words[0].start + 300));
	assert.ok(Math.abs(scaleAt(filled.end + 500) - 1) < 0.01, "the whole line at its own size");
	assert.ok(filled.place.block.words.every((word) => word.text === word.text.toUpperCase()), "in capitals");

	// A seal: two rings for each line that turn and leave with it.
	const seal = stage("seal");
	const rings = seal.boards[0].plates;
	assert.equal(rings.length, seal.boards[0].places.length * 2);
	assert.ok(rings.every((plate) => plate.kind === "ring" && plate.solo && plate.spin));
	const second = seal.lines[1];
	assert.ok(motion.plateLevel(seal, seal.boards[0], rings[0], seal.lines[0].start + 200) > 0.9);
	assert.equal(motion.plateLevel(seal, seal.boards[0], rings[0], second.start + 400), 0, "the first seal goes when the next line comes");

	// Round the frame: the words at the edges, the middle open.
	const framed = stage("frame").boards[0].places[1].block.words;
	assert.ok(framed.every((word) => Math.abs(word.x) > 1440 * 0.2 || Math.abs(word.y) > 900 * 0.2), "no word in the middle: " + framed.map((word) => Math.round(word.x) + "," + Math.round(word.y)));

	// Marquee rows stream past while their line is sung.
	const marquee = stage("marquee").boards[0];
	assert.ok(marquee.fills.length >= 4 && marquee.fills.every((fill) => Number.isInteger(fill.line) && fill.speed && fill.step > 0));
	assert.ok(new Set(marquee.fills.filter((fill) => fill.line === 0).map((fill) => Math.sign(fill.speed))).size === 2, "rows stream both ways");

	// Words hung in depth line up from the line's camera.
	const deep = stage("anamorph");
	for (const item of deep.lines) {
		const words = item.place.block.words;
		assert.ok(new Set(words.map((word) => Math.round(word.z))).size > 1, "at different depths");
		for (const word of words) assert.ok(Number.isFinite((word.x * motion.PERSPECTIVE_PX) / (motion.PERSPECTIVE_PX - word.z)));
		// Each word appears at the size of its neighbours from the line's camera.
		const apparent = words.map((word) => (word.size * motion.PERSPECTIVE_PX) / (motion.PERSPECTIVE_PX - word.z));
		assert.ok(Math.max(...apparent) / Math.min(...apparent) < 1.6, "they read as one line: " + apparent.map(Math.round));
	}

	// Larger than the screen, the view slides along to the word being sung.
	const bleed = stage("bleed");
	const huge = bleed.lines[0];
	if (huge.place.travel > 0) {
		const at = (time) => Number(motion.travelFrame(huge, huge.place, time).match(/translateX\((-?[\d.]+)px\)/)[1]);
		assert.notEqual(at(huge.words[0].start + 50), at(huge.end + 400), "the view travels");
	}

	// Lines slide along their rails into place.
	const rails = stage("rails");
	const railed = rails.lines[1];
	assert.ok(rails.boards[0].strokes.length >= 3 && Math.abs(rails.boards[0].dutch) >= 10, "a slanted grid of rules");
	assert.ok(motion.lineMotion(rails.boards[0], railed, railed.start - 300, 0, 60).includes("translate("), "on its way along the rail");
	assert.ok(!motion.lineMotion(rails.boards[0], railed, railed.start + 1200, 0, 60).includes("translate("), "then in place");

	// Margins: lines along the edges of the screen.
	const margin = stage("margin").boards[0];
	assert.ok(margin.places.every((place) => Math.abs(place.x) + place.block.width / 2 > 1440 * 0.3), "at the edges: " + margin.places.map((place) => Math.round(place.x)));

	// The way into a board through a growing circle or a band.
	const opened = { ...stage("column"), boards: null };
	const iris = director.normalizeDirection({ shots: [{ from: 0, to: 1, layout: "column", enter: "pan" }, { from: 2, to: 3, layout: "column", enter: "iris" }] }, model, { seed: 8 });
	const irisPlan = compose(motion, type, model, { ...iris, shots: iris.shots.map((shot, index) => ({ ...shot, enter: index ? "iris" : "pan" })) }, 8);
	const into = irisPlan.boards[1];
	const radius = (time) => Number((motion.revealClip(irisPlan, into, time).match(/circle\(([\d.]+)px/) || [0, Infinity])[1]);
	assert.ok(radius(into.appear + 50) < radius((into.appear + irisPlan.lines[into.first].arrive) / 2), "the circle grows");
	assert.equal(motion.revealClip(irisPlan, into, irisPlan.lines[into.first].arrive + 10), "", "and is gone once the board is in");
	assert.ok(Math.abs(into.cameras[0].z - irisPlan.boards[0].cameras[irisPlan.boards[0].cameras.length - 1].z) >= 300, "in place, a little deeper");
	void opened;
});

test("new word entrances, exits and holds", () => {
	const { motion } = load();
	const context = { count: 4, wordStart: 1000, seed: 3, sway: 1, pace: 1 };
	const decoding = motion.charFrame("decode", { start: 1000, ch: "가" }, 0, 900, context);
	assert.ok(decoding.text && decoding.text !== "가" && /\p{Script=Hangul}/u.test(decoding.text), "decode flickers through letters of the same script: " + decoding.text);
	assert.equal(motion.charFrame("decode", { start: 1000, ch: "A" }, 0, 1000, context).text, undefined, "and locks on");
	assert.ok(motion.charFrame("rain", { start: 1000 }, 1, 900, context).transform.startsWith("translateY("), "rain letters fall or rise into line");
	assert.ok(motion.solidFrame("brush", 0.4).clip.startsWith("polygon("), "brush pulls a slanted edge across");
	assert.ok(motion.solidFrame("shutter", 0.4).clip.startsWith("inset(calc("), "shutter opens from the middle line");
	const held = { start: 1000, end: 3000, voicesEnd: 3000, exitAt: 5000, exitSpan: 600, text: "hold me" };
	for (const hold of ["wobble", "swivel"]) {
		assert.notEqual(motion.holdFrame(hold, held, 1600), motion.holdFrame(hold, held, 2300), hold + " keeps moving");
	}
	assert.ok(motion.exitFrame("glitch", 0.5, 9).clip.startsWith("inset("));
	assert.ok(motion.exitFrame("drip", 0.5).transform.includes("scale("));
});

test("a line need not reach the screen at once: long lines in phrases, punchy lines word by word", () => {
	const { motion, director, type } = load();
	const texts = (line, pieces) => pieces.map(([from, to]) => line.words.slice(from, to + 1).map((word) => word.text).join(" "));
	const covers = (line, pieces) => pieces.every(([from, to], index) => from <= to && (!index || from === pieces[index - 1][1] + 1)) && pieces[0][0] === 0 && pieces[pieces.length - 1][1] === line.words.length - 1;
	const [long, short, comma, korean] = motion.buildModel([
		line(["Lanterns", "rising", "over", "quiet", "streets", "and", "every", "single", "window", "glows"], 1000, { step: 300 }),
		line(["hold", "on", "tight"], 5000),
		line(["Hold", "on,", "I'm", "coming", "home", "tonight"], 8000, { step: 300 }),
		line(["너를", "처음", "만난", "그날", "밤을", "아직도", "기억해"], 12000, { step: 350 }),
	]);
	// A long line is broken even in a "line" shot, a short one never.
	const lanterns = motion.piecesOf(long, "line");
	assert.ok(lanterns.length >= 3 && covers(long, lanterns), "a long line in phrases: " + texts(long, lanterns).join(" / "));
	assert.ok(texts(long, lanterns).every((text) => !/\b(and|the|over)$/.test(text)), "no phrase ends on a little word: " + texts(long, lanterns).join(" / "));
	assert.deepEqual(plain(motion.piecesOf(short, "line")), [[0, 2]]);
	assert.deepEqual(plain(motion.piecesOf(short, "phrase")), [[0, 2]], "three words stay together");
	// Phrases break where the line breaks itself.
	const held = motion.piecesOf(comma, "phrase");
	assert.equal(texts(comma, held)[0], "Hold on,", "at the comma: " + texts(comma, held).join(" / "));
	const breath = motion.buildModel([{ startTime: 0, originalText: "one two three four five six", syllables: [
		{ text: "one", startTime: 0, endTime: 300 }, { text: "two", startTime: 300, endTime: 600 }, { text: "three", startTime: 600, endTime: 900 },
		{ text: "four", startTime: 1700, endTime: 2000 }, { text: "five", startTime: 2000, endTime: 2300 }, { text: "six", startTime: 2300, endTime: 2600 },
	] }])[0];
	assert.deepEqual(plain(motion.piecesOf(breath, "phrase")), [[0, 2], [3, 5]], "at a breath between words");
	const eojeol = motion.piecesOf(korean, "phrase");
	assert.ok(eojeol.length >= 2 && covers(korean, eojeol), "Korean in phrases of whole words: " + texts(korean, eojeol).join(" / "));
	// Word by word, a Japanese particle stays with its word.
	const japanese = motion.buildModel([line(["月", "を", "見て", "いた"], 1000, { joined: true })])[0];
	assert.ok(japanese.words.length >= 2);
	const kana = motion.piecesOf(japanese, "word");
	assert.ok(kana.every(([from, to]) => !/^[をはがにでのと]$/.test(japanese.words.slice(from, to + 1).map((word) => word.text).join(""))), "particles do not stand alone");
	assert.equal(motion.piecesOf(short, "word").length, 3);

	// The direction and typography follow the pieces.
	const model = [long, short, comma];
	const typography = type.typographyOf(model, "en");
	const raw = { shots: [{ from: 0, to: 0, layout: "column", split: "phrase" }, { from: 1, to: 2, layout: "stairs", split: "word" }], lines: { 0: { emph: [8], fx: "pop" }, 2: { emph: [3] } } };
	const { model: pieces, direction, typography: pieceTypography } = motion.expandPieces(model, raw, typography);
	assert.equal(pieces.length, pieceTypography.length);
	assert.ok(pieces.every((piece) => piece.words.length && piece.index === model[piece.source].index && pieceTypography[pieces.indexOf(piece)].words.length === piece.words.length), "every piece keeps its line's translation and faces");
	const window = pieces.findIndex((piece) => piece.source === 0 && piece.words.some((word) => word.text === "window"));
	assert.deepEqual(plain(direction.lines[window].emph), [pieces[window].words.findIndex((word) => word.text === "window")], "the emphasised word goes with its piece");
	assert.ok(pieces.filter((piece) => piece.source === 0).every((_, part) => direction.lines[pieces.findIndex((piece) => piece.source === 0) + part]?.fx === "pop"), "and the line's effect with every piece");
	assert.equal(direction.shots[0].from, 0);
	assert.equal(direction.shots[direction.shots.length - 1].to, pieces.length - 1);
	// Open-ended compositions take more single words (they are small and leave with their line).
	const roomy = new Set(["column", "zigzag", "collage", "stairs", "strip", "rails", "chain"]);
	const holds = (shot) => (shot.split === "word" && roomy.has(shot.layout) ? 10 : director.MAX_LINES[shot.layout]);
	assert.ok(direction.shots.every((shot) => shot.to - shot.from + 1 <= holds(shot)), "a shot with more pieces than its composition holds goes on in the next board");
	// A board breaks between two lines rather than inside one.
	const punchy = motion.buildModel([["go", "get", "it", "now"], ["never", "look", "back"], ["we", "run", "this", "town"], ["one", "more", "time"]].map((parts, index) => line(parts, 1000 + index * 1600, { step: 280 })));
	const boards = motion.expandPieces(punchy, { shots: [{ from: 0, to: 3, layout: "chain", split: "word" }] }, type.typographyOf(punchy, "en"));
	assert.ok(boards.direction.shots.length > 1);
	assert.ok(boards.direction.shots.slice(1).every((shot) => shot.continued && shot.enter === "pan"), "and goes on in the next board");
	assert.ok(boards.direction.shots.every((shot) => shot.to === boards.model.length - 1 || boards.model[shot.to].source !== boards.model[shot.to + 1].source),
		"every board ends with a line: " + boards.direction.shots.map((shot) => shot.from + "-" + shot.to));

	// Other voices go with the piece being sung when they come in.
	const voiced = motion.buildModel([{
		startTime: 0, originalText: "we were young and we were wild and free",
		vocals: {
			lead: { text: "we were young and we were wild and free", syllables: ["we", "were", "young", "and", "we", "were", "wild", "and", "free"].map((text, index) => ({ text, startTime: index * 400, endTime: index * 400 + 380 })) },
			background: [{ text: "so free", syllables: [{ text: "so", startTime: 3000, endTime: 3300 }, { text: "free", startTime: 3300, endTime: 3700 }] }],
		},
	}]);
	const parted = motion.expandPieces(voiced, { shots: [{ from: 0, to: 0, layout: "column", split: "phrase" }] }, type.typographyOf(voiced, "en")).model;
	assert.ok(parted.length >= 2);
	assert.equal(parted.filter((piece) => piece.backing.length).length, 1);
	assert.ok(parted[parted.length - 1].backing.length === 1, "the echo sings with the last phrase");
});

test("pieces set in every composition, and how they come and go", () => {
	const { motion, director, type } = load();
	const lyrics = [];
	let start = 2000;
	for (const parts of [
		["Lanterns", "rising", "over", "quiet", "streets", "and", "every", "single", "window", "glows"],
		["you", "can", "freeze", "the", "night"],
		["we", "are", "burning", "bright", "tonight"],
		["hold", "on"],
	]) {
		lyrics.push(line(parts, start, { step: 320 }));
		start += parts.length * 320 + 700;
	}
	const model = motion.buildModel(lyrics);
	for (const split of ["phrase", "word"]) {
		for (const layout of director.LAYOUTS) {
			const direction = director.normalizeDirection({ shots: [{ from: 0, to: 3, layout, enter: "pan", split }] }, model, { seed: 4 });
			const plan = compose(motion, type, model, direction, 4, "", true);
			assert.ok(plan.lines.length > model.length, layout + " " + split + " sets pieces");
			assert.deepEqual(plain([...new Set(plan.lines.map((piece) => piece.source))]), plain(model.map((_, index) => index)), "every line, in order");
			for (const piece of plan.lines) {
				const label = layout + " " + split + " piece " + piece.n;
				assert.equal(piece.place.block.words.length, piece.shown.length, label + " sets every word");
				assert.ok(piece.place.block.rows <= 2, label + " in at most two rows");
				assert.ok([piece.camera.x, piece.camera.y, piece.camera.z, piece.place.x, piece.place.y].every(Number.isFinite), label + " is placed");
				const board = plan.boards[piece.board];
				const upright = piece.camera.roll - board.dutch - (board.roll + piece.place.rot);
				assert.ok(Math.abs(upright - Math.round(upright / 360) * 360) < 0.01, label + " is upright");
				assert.ok(piece.arrive < piece.start && piece.leave > piece.arrive, label + " is reached in time");
			}
		}
	}
	// Word by word, a line builds up until the next line; phrases make way for each other.
	// Compositions that turn from line to line turn whole lines, never the words of one.
	for (const layout of ["chain", "zigzag"]) {
		const plan = compose(motion, type, model, director.normalizeDirection({ shots: [{ from: 0, to: 3, layout, enter: "pan", split: "word" }] }, model, { seed: 4 }), 4, "", true);
		for (const piece of plan.lines) {
			const line = plan.lines.filter((other) => other.source === piece.source && other.board === piece.board);
			assert.ok(line.every((other) => other.place.rot === piece.place.rot && other.camera.roll === piece.camera.roll), layout + ": the words of line " + piece.source + " stay on one line");
		}
		assert.ok(new Set(plan.lines.map((piece) => piece.place.rot)).size > 1, layout + " still turns between lines");
	}
	const built = compose(motion, type, model, director.normalizeDirection({ shots: [{ from: 0, to: 3, layout: "column", enter: "pan", split: "word" }] }, model, { seed: 4 }), 4, "", true);
	const words = built.lines.filter((piece) => piece.source === 1);
	const nextLine = built.lines.find((piece) => piece.source === 2);
	const board = built.boards[words[0].board];
	const lastWord = words[words.length - 1];
	if (words.every((piece) => piece.board === words[0].board)) {
		assert.ok(motion.levelsOn(board, words[0], 0, lastWord.start + 50).solid > 0.95, "the first word is still there when the last is sung");
	}
	assert.ok(words.every((piece) => !Number.isFinite(piece.exitAt) || piece.exitAt >= nextLine.start), "the words leave once the next line is under way");
	const phrased = compose(motion, type, model, director.normalizeDirection({ shots: [{ from: 0, to: 0, layout: "column", enter: "pan", split: "phrase" }, { from: 1, to: 3, layout: "stairs", enter: "pan" }] }, model, { seed: 4 }), 4, "", true);
	const [first, second] = phrased.lines.filter((piece) => piece.source === 0);
	assert.ok(first.exitAt < first.end + 2500 && first.exitAt >= second.start, "a phrase leaves soon after the next phrase has begun");
});

test("the director breaks long lines and sets punchy ones word by word now and then", () => {
	const { motion, director } = load();
	const make = (count, parts, step) => motion.buildModel(Array.from({ length: count }, (_, index) => line(parts.map((part) => part + index), 2000 + index * (parts.length * step + 600), { step })));
	const long = make(16, ["lanterns", "rising", "over", "quiet", "streets", "and", "every", "window"], 380);
	const longSplits = director.localDirection(long, { seed: 3, tempo: { tempo: "mid", pace: 1 } }).shots.map((shot) => shot.split);
	assert.ok(longSplits.filter((split) => split === "phrase").length >= longSplits.length * 0.6, "long lines in phrases: " + longSplits);
	const punchy = make(24, ["go", "get", "it", "now"], 240);
	let words = 0;
	for (let seed = 1; seed <= 8; seed += 1) words += director.localDirection(punchy, { seed, tempo: { tempo: "fast", pace: 0.82 } }).shots.filter((shot) => shot.split === "word").length;
	assert.ok(words > 0, "fast punchy lines go word by word at times");
	let slowWords = 0;
	for (let seed = 1; seed <= 8; seed += 1) slowWords += director.localDirection(punchy, { seed, tempo: { tempo: "slow", pace: 1.4 } }).shots.filter((shot) => shot.split === "word").length;
	assert.equal(slowWords, 0, "never in a ballad");
	assert.equal(director.normalizeDirection({ shots: [{ from: 0, to: 3, layout: "column", split: "word" }] }, punchy, { seed: 1 }).shots[0].split, "word", "the AI may ask");
	assert.ok(director.SPLITS.includes(director.normalizeDirection({ shots: [{ from: 0, to: 3, layout: "column", split: "chunks" }] }, punchy, { seed: 1 }).shots[0].split));
	const prompt = director.buildPrompt({ lines: [] });
	for (const name of director.SPLITS) assert.ok(prompt.includes(name + " = "), "the prompt explains " + name);
	assert.ok(prompt.includes('"split"'));
});

test("a lyric line never takes more than two rows, however it is set", () => {
	const { motion, director, type } = load();
	const latin = motion.buildModel([
		line(["Lanterns", "rising", "over", "quiet", "streets", "and", "every", "single", "window", "glows", "for", "you", "tonight"], 1000, { step: 180 }),
		line(["we", "keep", "on", "running", "through", "the", "longest", "night", "of", "our", "lives", "together"], 4000, { step: 200 }),
		line(["one", "two", "three", "four", "five", "six", "seven", "eight"], 7000, { step: 220 }),
		line(["hold", "on"], 9500),
	]);
	const japanese = motion.buildModel([
		line([..."夢ならばどれほどよかったでしょう未だにあなたのことを夢にみる"], 1000, { step: 120 }),
		line([..."忘れた物を取りに帰るように古びた思い出の埃を払う"], 6000, { step: 120 }),
	]);
	for (const [model, lang] of [[latin, "en"], [japanese, "ja"]]) {
		for (const layout of director.LAYOUTS) {
			for (const seed of [2, 9]) {
				const direction = director.normalizeDirection({ shots: [{ from: 0, to: model.length - 1, layout, enter: "pan" }] }, model, { seed });
				const plan = compose(motion, type, model, direction, seed, lang);
				for (const board of plan.boards) {
					for (const place of board.places) assert.ok(place.block.rows <= 2, board.layout + " (asked " + layout + ") sets a line in " + place.block.rows + " rows");
				}
			}
		}
	}
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
test("a voice sung on into the next line keeps both lines on screen, even on a phone", () => {
	const { motion, director, type } = load();
	const spaced = (parts) => parts.map((part, index) => (index < parts.length - 1 ? part + " " : part));
	// Some lines end with an answer (an echo, a call and response) that is still sung when the next line comes in.
	const answered = new Set([1, 4, 6]);
	const lyrics = [];
	let start = 2000;
	for (let index = 0; index < 8; index += 1) {
		const lead = ["call", "me", "line" + index];
		const entry = { startTime: start, text: "mixed", vocals: { lead: { text: lead.join(" "), role: "lead", speaker: "v1", syllables: timed(spaced(lead), start, 320) }, background: [] } };
		if (answered.has(index)) entry.vocals.background.push({ role: "background", text: "oh yeah", syllables: timed(spaced(["oh", "yeah"]), start + 900, 340) });
		lyrics.push(entry);
		start += answered.has(index) ? 1250 : 2200;
	}
	const model = motion.buildModel(lyrics);
	model.slice(0, -1).forEach((line, index) => assert.equal(director.singsInto(line, model[index + 1]), answered.has(index), "line " + index));
	// An AI that cuts right after each answered line, in one-at-a-time compositions.
	const raw = { shots: [{ from: 0, to: 1, layout: "slot" }, { from: 2, to: 4, layout: "poster" }, { from: 5, to: 6, layout: "spread" }, { from: 7, to: 7, layout: "hero" }] };
	const direction = director.normalizeDirection(raw, model, { seed: 2 });
	const shotOf = (index) => direction.shots.findIndex((shot) => shot.from <= index && index <= shot.to);
	for (const index of answered) assert.equal(shotOf(index), shotOf(index + 1), "no cut between line " + index + " and the line it is sung into");
	const plan = motion.compose(model, direction, { width: 844, height: 390, seed: 2, measure, typography: type.typographyOf(model, "en"), songLang: "en" });
	for (const index of answered) assert.equal(plan.boards[plan.lines[index].board].solo, false, "one-at-a-time compositions give way");
	let checked = 0;
	for (const index of answered) {
		const line = plan.lines[index];
		const board = plan.boards[line.board];
		line.shown.slice(line.words.length).forEach((word, offset) => {
			const spot = line.place.block.words[line.words.length + offset];
			for (let time = word.start + 20; time < word.end; time += 50) {
				const seen = seenFrom(motion, motion.cameraPose(plan, time, null), onLine(board, line.place, spot.x, spot.y));
				const solid = motion.boardVisibility(board, time) * motion.levelsOn(board, line, motion.progressAt(plan, time) - line.n, time).solid;
				assert.ok(Math.abs(seen.x) <= 422 && Math.abs(seen.y) <= 195, "line " + index + " '" + word.text + "' in frame at " + time + ": " + Math.round(seen.x) + ", " + Math.round(seen.y));
				assert.ok(solid >= 0.35, "and solid: " + solid);
				checked += 1;
			}
		});
		assert.ok(plan.lines[index + 1].share, "the next line shares the frame while the answer is sung");
	}
	assert.ok(checked > 20);
	// Once the answer is over the camera settles on the new line (before it moves on).
	const next = plan.lines[2];
	const shared = motion.cameraPose(plan, next.share.until - 1, null);
	const settled = motion.cameraPose(plan, Math.min(next.leave - 5, next.share.until + 520), null);
	assert.ok(Math.hypot(settled.x - next.camera.x, settled.y - next.camera.y) < Math.hypot(shared.x - next.camera.x, shared.y - next.camera.y), "and turns back to the new line");
	assert.ok(Math.hypot(settled.x - next.camera.x, settled.y - next.camera.y) < 60, "settling on it");
});

test("hits stay rare, quiet songs have none, and the AI's choices keep moving within the song's palette", () => {
	const { motion, director } = load();
	const lyrics = [];
	let start = 2000;
	for (let index = 0; index < 48; index += 1) {
		lyrics.push(line(["word" + index, "keeps", "moving", "on"], start, { step: 380 }));
		start += 4 * 380 + (index % 4 === 3 ? 2400 : 500);
	}
	const model = motion.buildModel(lyrics);
	const energy = model.map((_, index) => (index % 6 === 0 ? 0.92 : 0.4));
	// An AI that slams every word, flash-cuts every shot and repeats one look.
	const lazy = { shots: [], lines: model.map((_, n) => ({ n, fx: "slam" })) };
	for (let from = 0; from < model.length; from += 3) lazy.shots.push({ from, to: Math.min(model.length - 1, from + 2), layout: "column", enter: "cut", fx: "slam", accent: "stamp" });
	for (const tempo of ["slow", "mid", "fast"]) {
		const direction = director.normalizeDirection({ ...lazy, mood: tempo === "slow" ? "melancholic" : "energetic" }, model, { seed: 5, tempo: { tempo, pace: 1 }, energy });
		const shots = direction.shots;
		const count = shots.length;
		const hits = shots.filter((shot) => director.HARD_FX.includes(shot.fx));
		const limit = tempo === "slow" ? 0 : Math.max(1, Math.floor(count / (tempo === "mid" ? 12 : 8)));
		assert.ok(hits.length <= limit, tempo + ": " + hits.length + " slams or zooms in " + count + " shots");
		const lineHits = Object.values(direction.lines).filter((entry) => director.HARD_FX.includes(entry.fx)).length;
		assert.ok(lineHits <= (tempo === "slow" ? 0 : Math.max(1, Math.floor(model.length / 16))), tempo + " line slams: " + lineHits);
		const cuts = shots.filter((shot, index) => index && director.HARD_ENTERS.includes(shot.enter));
		assert.ok(cuts.length <= Math.max(1, Math.floor(count / (tempo === "slow" ? 10 : 6))), tempo + " cuts: " + cuts.length);
		for (const shot of cuts) assert.ok(model[shot.from].start - model[shot.from - 1].end >= 1200, "a cut only after a pause");
		assert.ok(shots.filter((shot) => shot.accent === "stamp").length <= Math.max(1, Math.floor(count / 6)), tempo + " stamps");
		shots.forEach((shot, index) => {
			const previous = shots[index - 1];
			if (!previous) return;
			for (const kind of ["layout", "fx", "accent"]) assert.notEqual(shot[kind], previous[kind], tempo + " shot " + index + ": " + kind + " follows itself");
			assert.ok(!(director.HARD_FX.includes(shot.fx) && (director.HARD_FX.includes(previous.fx) || director.PUNCHY_FX.includes(previous.fx))), "never two hits running");
		});
		for (const kind of ["layout", "enter", "fx", "accent"]) {
			const share = { layout: 0.16, enter: 0.22, fx: 0.2, accent: 0.2 }[kind];
			const tally = new Map();
			shots.forEach((shot, index) => { if (kind !== "enter" || index) tally.set(shot[kind], (tally.get(shot[kind]) || 0) + 1); });
			const most = Math.max(...tally.values());
			assert.ok(most <= Math.max(2, Math.ceil(count * share)), tempo + " " + kind + " used " + most + " times in " + count + " shots");
		}
		assert.ok(new Set(shots.map((shot) => shot.layout)).size >= 8, tempo + " compositions");
		assert.ok(new Set(shots.map((shot) => shot.fx)).size >= 6, tempo + " word effects");
		if (tempo === "slow") {
			assert.ok(shots.every((shot) => !director.HARD_FX.includes(shot.fx)), "a ballad never slams");
			assert.ok(shots.filter((shot) => director.PUNCHY_FX.includes(shot.fx)).length <= Math.max(1, Math.ceil(count * 0.08)), "and barely pops");
		}
	}
	// A returning section keeps the look the AI gave it the first time, as refined.
	const chorus = motion.buildModel([
		line(["sing", "it", "loud"], 1000), line(["all", "night", "long"], 2600),
		line(["verse", "goes", "on"], 6000), line(["and", "on", "again"], 7600),
		line(["sing", "it", "loud"], 11000), line(["all", "night", "long"], 12600),
	]);
	const look = { layout: "column", enter: "pan", fx: "slam", accent: "stamp" };
	const back = director.normalizeDirection({ shots: [{ from: 0, to: 1, ...look }, { from: 2, to: 3, ...look }, { from: 4, to: 5, ...look }] }, chorus, { seed: 3, tempo: { tempo: "mid", pace: 1 } });
	for (const kind of ["layout", "fx", "accent"]) assert.equal(back.shots[2][kind], back.shots[0][kind], "the chorus comes back with its " + kind);
	assert.notEqual(back.shots[1].layout, back.shots[0].layout);
});

test("the newer camera moves: twist, crane, swoop, corkscrew, hop and drift", () => {
	const mid = (plan, index) => (plan.lines[index].leave + plan.lines[index + 1].arrive) / 2;
	// Over the long pause after line 4, where neither move is held back by the words.
	const duration = (plan) => plan.lines[5].arrive - plan.lines[4].leave;
	const twist = forced("twist", { dutch: 0 });
	const turn = Math.abs(twist.plan.boards[1].roll - twist.plan.boards[0].roll);
	assert.ok(Math.abs(turn - 45) < 1e-6, "a twist turns the screen 45 degrees: " + turn);
	const crane = forced("crane");
	assert.ok(Math.abs(crane.motion.cameraPose(crane.plan, mid(crane.plan, 1), null).pitch) > 20, "a crane lifts and tilts over");
	const swoop = forced("swoop");
	const banked = swoop.motion.cameraPose(swoop.plan, mid(swoop.plan, 1), null);
	assert.ok(Math.abs(banked.yaw) > 20 && Math.abs(banked.pitch) > 12, "a swoop banks down and round");
	const corkscrew = forced("corkscrew");
	assert.equal(Math.abs(corkscrew.plan.lines[1].move.extraRoll), 360, "a corkscrew turns a full circle");
	assert.ok(Math.abs(corkscrew.plan.boards[1].cameras[0].z - corkscrew.plan.boards[0].cameras[0].z) >= 300, "while it dollies in");
	const hop = forced("hop");
	const lifted = hop.motion.cameraPose(hop.plan, mid(hop.plan, 1), null);
	assert.ok(lifted.z - hop.plan.lines[1].camera.z > 350, "a hop leaps back to see both boards");
	const pan = forced("pan");
	const drift = forced("drift");
	assert.ok(duration(drift.plan) > duration(pan.plan), "a drift takes its time");
	for (const entrance of ["drift", "crane", "twist", "swoop", "corkscrew", "hop"]) {
		const { motion, plan } = forced(entrance);
		for (let time = plan.lines[0].arrive - 3000; time < plan.lines[plan.lines.length - 1].end; time += 97) {
			const pose = motion.cameraPose(plan, time, null);
			assert.ok([pose.x, pose.y, pose.z, pose.roll, pose.yaw, pose.pitch].every(Number.isFinite), entrance + " at " + time);
		}
		const landed = motion.cameraPose(plan, plan.lines[2].arrive + 1, null);
		const off = ((landed.roll - plan.lines[2].camera.roll) % 360 + 540) % 360 - 180;
		assert.ok(Math.abs(off) < 6, entrance + " lands upright: " + off);
	}
});

test("editorial compositions: a wave, a star chart, a grid and the corners", () => {
	const { motion, director, type } = load();
	const model = motion.buildModel(song());
	const stage = (layout, from = 0, to = 3) => {
		const checked = director.normalizeDirection({ shots: [{ from, to, layout, enter: "pan" }] }, model, { seed: 6 });
		return compose(motion, type, model, checked, 6).boards.find((board) => board.layout === layout);
	};
	const wave = stage("wave", 0, 4);
	const turns = wave.places.map((place) => place.rot);
	assert.ok(turns.some((rot) => Math.abs(rot) > 2) && turns.every((rot) => Math.abs(rot) <= 11), "lines tilt with the wave: " + turns);
	assert.ok(new Set(wave.places.map((place) => Math.sign(Math.round(place.y)))).size >= 2, "above and below the middle");
	const corners = stage("corners");
	const quarters = new Set(corners.places.map((place) => Math.sign(place.x) + ":" + Math.sign(place.y)));
	assert.ok(corners.places.length >= 3 && quarters.size === corners.places.length, "one line in each corner");
	assert.ok(corners.places.every((place) => place.block.size < model[0].words.length * 1000), "set small");
	const grid = stage("grid");
	const lefts = new Set(grid.places.map((place) => Math.round(place.x - place.block.width / 2)));
	assert.equal(lefts.size, 2, "two columns aligned on their left edges");
	const chart = stage("constellation", 0, 4);
	assert.ok(chart.strokes.length >= 2, "lines drawn between the stars");
	assert.ok(chart.strokes.every((stroke, index) => stroke.stops.indexOf(1) > index), "each drawn as the next line is sung");
});

test("a long sideways stretch turns the background back to landscape, and it follows the camera again after", () => {
	const { motion, director, type } = load();
	const lyrics = [];
	for (let index = 0; index < 12; index += 1) lyrics.push(line(["side" + index, "ways", "line"], 2000 + index * 2200, { step: 500 }));
	const model = motion.buildModel(lyrics);
	// A quarter turn into a long board (about 14 seconds sideways), then a quarter turn back.
	const raw = { shots: [
		{ from: 0, to: 1, layout: "column", enter: "pan", dutch: 0 },
		{ from: 2, to: 7, layout: "column", enter: "roll", dutch: 0 },
		{ from: 8, to: 11, layout: "column", enter: "roll", dutch: 0 },
	] };
	const checked = director.normalizeDirection(raw, model, { seed: 2 });
	const direction = { ...checked, shots: checked.shots.map((shot, index) => ({ ...shot, ...raw.shots[index] })) };
	const plan = compose(motion, type, model, direction, 2);
	const sideways = (roll) => { const turn = ((roll % 180) + 180) % 180; return Math.min(turn, 180 - turn); };
	const tilt = (roll) => { const turn = ((roll % 360) + 360) % 360; return Math.min(turn, 360 - turn); };
	assert.ok(sideways(plan.lines[3].camera.roll) > 80, "the middle board is on its side");
	const [righting] = plan.uprights;
	assert.ok(righting && righting.from >= plan.lines[2].arrive + 5000 && righting.from < plan.lines[2].arrive + 7300, "one sideways stretch is long enough: " + (righting && righting.from - plan.lines[2].arrive));
	const at = (time) => motion.backgroundFrame(plan, motion.cameraPose(plan, time, null), time);
	// The video turns over with the camera on the way in.
	const into = (plan.lines[1].leave + plan.lines[2].arrive) / 2;
	assert.ok(tilt(at(into).rotate) > 20, "it turns with the camera at first: " + at(into).rotate);
	assert.ok(sideways(at(righting.from - 100).rotate) > 70, "and stays on its side a while");
	const righted = at(righting.until + 200);
	assert.ok(tilt(righted.rotate) < 7, "then rights itself (but for its own slow sway): " + righted.rotate);
	assert.ok(righted.scale < at(righting.from - 100).scale, "and covers the screen with less zoom");
	assert.ok(tilt(at(plan.lines[11].end).rotate) < 7, "the video is upright at the end: " + at(plan.lines[11].end).rotate);
	// Upside down only on the way over, never for long.
	let upsideSince = null;
	for (let time = plan.lines[0].start; time < plan.lines[11].end + 3000; time += 50) {
		if (tilt(at(time).rotate) > 135) {
			upsideSince ??= time;
			assert.ok(time - upsideSince < 2600, "never upside down for long, from " + upsideSince);
		} else upsideSince = null;
	}
	assert.equal(motion.backgroundFrame(plan, motion.cameraPose(plan, righting.until + 200, null)).rotate,
		-motion.cameraPose(plan, righting.until + 200, null).roll, "without a time it is the plain camera turn");
});

test("a flip turns the video over with the camera, then it rights itself soon after landing", () => {
	const { motion, director, type } = load();
	const lyrics = [];
	for (let index = 0; index < 9; index += 1) lyrics.push(line(["flip" + index, "over", "line"], 2000 + index * 2200, { step: 500 }));
	const model = motion.buildModel(lyrics);
	const raw = { shots: [
		{ from: 0, to: 2, layout: "column", enter: "pan", dutch: 0 },
		{ from: 3, to: 5, layout: "column", enter: "flip", dutch: 0 },
		{ from: 6, to: 8, layout: "column", enter: "pan", dutch: 0 },
	] };
	const checked = director.normalizeDirection(raw, model, { seed: 3 });
	const direction = { ...checked, shots: checked.shots.map((shot, index) => ({ ...shot, ...raw.shots[index] })) };
	const plan = compose(motion, type, model, direction, 3);
	const tilt = (roll) => { const turn = ((roll % 360) + 360) % 360; return Math.min(turn, 360 - turn); };
	assert.ok(tilt(plan.lines[4].camera.roll) > 170, "the middle board is upside down");
	const at = (time) => motion.backgroundFrame(plan, motion.cameraPose(plan, time, null), time);
	assert.ok(tilt(at(plan.lines[3].arrive).rotate) > 150, "the video has turned over with the camera: " + at(plan.lines[3].arrive).rotate);
	const [righting] = plan.uprights;
	assert.ok(righting, "the flip is righted");
	assert.ok(Math.abs(righting.from - (plan.lines[3].arrive + 700)) < 1, "soon after the camera has landed");
	// While the board is held (the far plane swings a little more while the camera travels).
	for (let time = righting.until + 50; time < plan.lines[5].leave; time += 250) {
		const held = plan.lines.some((item) => time >= item.arrive && time <= item.leave);
		if (!held) continue;
		assert.ok(tilt(at(time).rotate) < 7, "upright behind the flipped board at " + time + ": " + at(time).rotate);
	}
});

test("the video background keeps moving, and is upright in interludes", () => {
	const { motion, director, type } = load();
	const model = motion.buildModel([
		line(["one", "two", "three"], 2000), line(["four", "five", "six"], 4000),
		line(["seven", "eight"], 16000), line(["nine", "ten"], 18000),
	]);
	const raw = { shots: [{ from: 0, to: 1, layout: "column", enter: "pan", dutch: 0 }, { from: 2, to: 3, layout: "column", enter: "roll", dutch: 0 }] };
	const checked = director.normalizeDirection(raw, model, { seed: 4 });
	const direction = { ...checked, shots: checked.shots.map((shot, index) => ({ ...shot, ...raw.shots[index] })) };
	const plan = compose(motion, type, model, direction, 4);
	const at = (time) => motion.backgroundFrame(plan, motion.cameraPose(plan, time, null), time);
	const tilt = (roll) => { const turn = ((roll % 360) + 360) % 360; return Math.min(turn, 360 - turn); };
	let still = 0;
	let samples = 0;
	let previous = null;
	for (let time = 2000; time < 19000; time += 100) {
		const frame = at(time);
		if (previous) {
			samples += 1;
			if (Math.abs(frame.rotate - previous.rotate) < 0.05 && Math.abs(frame.scale - previous.scale) < 0.0005) still += 1;
		}
		previous = frame;
		if (motion.restAt(plan, time) > 0.99) assert.ok(tilt(frame.rotate) < 7, "upright in the interlude at " + time + ": " + frame.rotate);
	}
	assert.ok(still / samples < 0.05, "it never stands still: " + still + " of " + samples);
});

test("the camera eases in on a held line only as far as its ends stay on screen", () => {
	const { motion, director, type } = load();
	// Big type set as wide as the composition allows (a hero line, a poster) on a narrow window.
	const wide = (text, size) => [...text].length * size * 0.95;
	const lyrics = [];
	for (let index = 0; index < 4; index += 1) lyrics.push(line([..."耳障りな泣き声は誰だ耳障りな"].slice(0, 6 + index * 2), 2000 + index * 5000, { step: 300 }));
	const model = motion.buildModel(lyrics);
	const rotate = (x, y, degrees) => {
		const r = (degrees * Math.PI) / 180;
		return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
	};
	let checked = 0;
	for (const layout of ["hero", "poster"]) {
		for (const W of [800, 1000]) {
			const raw = { shots: [{ from: 0, to: 3, layout, enter: "pan", dutch: 0 }] };
			const normalized = director.normalizeDirection(raw, model, { seed: 1 });
			const direction = { ...normalized, shots: normalized.shots.map((shot) => ({ ...shot, layout, enter: "pan", dutch: 0 })) };
			const plan = motion.compose(model, direction, { width: W, height: Math.round(W * 0.6), seed: 1, measure: wide, typography: type.typographyOf(model, "ja"), songLang: "ja" });
			for (const held of plan.lines) {
				const board = plan.boards[held.board];
				const ends = [-1, 1].map((side) => {
					const local = rotate((side * held.place.block.width) / 2, 0, held.place.rot);
					const world = rotate(held.place.x + local.x, held.place.y + local.y, board.roll);
					return { x: world.x + board.origin.x, y: world.y + board.origin.y, z: held.worldZ };
				});
				// While it is held (not while the next line shares the frame, or the board is revealed).
				const until = Math.min(held.leave, held.reveal ? held.reveal.start : Infinity, held.end + 3000);
				for (let time = held.arrive; time < until; time += 100) {
					const pose = motion.cameraPose(plan, time, null);
					for (const end of ends) {
						const seen = rotate(end.x - pose.x, end.y - pose.y, -pose.roll);
						const scale = motion.PERSPECTIVE_PX / (motion.PERSPECTIVE_PX - (end.z - pose.z));
						assert.ok(Math.abs(seen.x * scale) <= W * 0.47, layout + " line " + held.n + " stays in frame at " + time + ": " + Math.round(Math.abs(seen.x * scale)) + " of " + W / 2);
						checked += 1;
					}
				}
			}
		}
	}
	assert.ok(checked > 100, "lines were checked: " + checked);
});

test("lyrics text breaks the words even when the syllables differ from it a little", () => {
	const { motion } = load();
	// The syllables carry no spaces and leave out the dash the text has.
	const syllables = timed(["Ко", "ти", "ки", "17", "SEVEN", "TEEN"], 0, 300);
	const words = motion.buildWords({ originalText: "Котики - 17 SEVENTEEN", syllables }).map((word) => word.text);
	assert.deepEqual(plain(words), ["Котики", "17", "SEVENTEEN"], "not one long word: " + words);
	const cased = motion.buildWords({ originalText: "hold ON tight", syllables: timed(["Hold", "on", "tight,"], 0, 300) }).map((word) => word.text);
	assert.deepEqual(plain(cased), ["Hold", "on", "tight,"], "case and a trailing comma do not stop the match");
	const other = motion.buildWords({ originalText: "something else entirely", syllables: timed(["ab", "cd"], 0, 300) }).map((word) => word.text);
	assert.deepEqual(plain(other), ["abcd"], "an unrelated text adds no breaks");
});

test("motion colours follow the cover, the AI only adds a second colour apart from it", () => {
	const { motion } = load();
	const hue = (hex) => {
		const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const d = max - min;
		const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
		return h / 6;
	};
	const blueCover = "#1d3f8a";
	const [first, second] = motion.paletteFrom(blueCover, ["#ff3b7a", "#ff5c8a"]);
	assert.ok(Math.abs(hue(first) - hue(blueCover)) < 0.02, "a blue cover stays blue: " + first);
	assert.ok(Math.abs(hue(second) - hue("#ff3b7a")) < 0.02, "the AI's pink is kept as the second colour");
	const [, own] = motion.paletteFrom(blueCover, ["#2a4fa0"]);
	assert.ok(Math.abs(hue(own) - hue(blueCover)) > 0.3, "an AI colour too close to the cover is not used twice: " + own);
	const [grey] = motion.paletteFrom("#777777", []);
	assert.ok(hue(grey) > 0.5 && hue(grey) < 0.7, "a grey cover gets a quiet blue, not a pink: " + grey);
	assert.ok(Math.abs(hue(motion.paletteFrom("var(--spice-button-active, #ff809d)", ["#33cc88"])[0]) - hue("#33cc88")) < 0.02,
		"without a cover colour the AI leads");
});

test("the AI reads the song's structure and energy and directs from a concept and a kit", () => {
	const { motion, director } = load();
	const texts = [["city", "lights", "calling"], ["I", "run", "tonight"], ["hold", "on", "to", "me"], ["we", "burn", "so", "bright"], ["quiet", "now"], ["hold", "on", "to", "me"], ["we", "burn", "so", "bright"]];
	let at = 2000;
	const model = motion.buildModel(texts.map((parts, index) => {
		const entry = line(parts, at, { step: 380 });
		at += parts.length * 380 + (index === 3 ? 6000 : 700);
		return entry;
	}));
	const energy = [0.2, 0.3, 0.8, 0.9, 0.1, 0.85, 1];
	const lines = director.promptLines(model, { energy });
	assert.deepEqual(plain(lines.map((entry) => entry.energy)), [2, 3, 7, 8, 1, 8, 9], "energy 0 to 9");
	assert.deepEqual(plain(lines.map((entry) => entry.chorus)), [false, false, true, true, false, true, true], "the recurring block");
	assert.deepEqual(plain(lines.map((entry) => entry.repeats)), [null, null, null, null, null, 2, 3], "repeated lines name the first time");
	assert.equal(director.promptLines(model)[0].energy, null, "no energy without the analysis");
	const cuts = director.promptShots(model);
	assert.ok(cuts.some((cut) => cut.chorus) && cuts.some((cut) => cut.repeated), "the suggested cuts mark the chorus and its return");
	const prompt = director.buildPrompt({ title: "Night Run", lines, cuts, tempo: { tempo: "mid" } });
	assert.ok(prompt.includes("#5 [") && prompt.includes("{energy 8, chorus, = #2"), "each line says what the song says about it");
	assert.ok(prompt.includes("Suggested shots from the song's structure") && /\d+-\d+ C R/.test(prompt));
	for (const needle of ['"concept"', '"kit"', '"sections"', "1. concept", "2. kit", "3. sections", "signature look"]) assert.ok(prompt.includes(needle), "the prompt asks for " + needle);
	for (const quota of ["at least 10 different layouts", "at least 8 in a song", "at least 5 different ones", "at least 6 different exits"]) assert.ok(!prompt.includes(quota), "no quota: " + quota);

	// Whatever has to be replaced (a layout following itself, too many of one fx) comes from the AI's own kit.
	const many = motion.buildModel(Array.from({ length: 24 }, (_, index) => line(["line" + index, "goes", "on"], 2000 + index * 2200, { step: 380 })));
	const kit = { layouts: ["lockup", "column", "stairs", "chain", "rails", "frame"], fx: ["lift", "wipe", "blur", "rise", "track"], accents: ["underline", "circle", "color"], exits: ["sink", "fade", "dissolve"], enters: ["pan", "drift", "crane", "rise"], holds: ["drift", "grow", "float"] };
	const shots = [];
	// (The effect changes from shot to shot, so these are not one composition running on.)
	for (let from = 0; from < many.length; from += 2) shots.push({ from, to: from + 1, layout: "lockup", enter: "pan", fx: from % 4 ? "wipe" : "lift", accent: "underline", exit: "sink", hold: "drift" });
	const refined = director.normalizeDirection({ concept: "a quiet diary", kit, shots }, many, { seed: 4, tempo: { tempo: "mid", pace: 1 } });
	assert.equal(refined.concept, "a quiet diary");
	const kitted = refined.shots.filter((shot) => shot.source === "ai");
	assert.ok(kitted.length >= 10);
	for (const [kind, key] of [["layout", "layouts"], ["fx", "fx"], ["accent", "accents"], ["exit", "exits"], ["hold", "holds"]]) {
		const outside = kitted.filter((shot) => !kit[key].includes(shot[kind]));
		assert.ok(outside.length <= Math.ceil(kitted.length * 0.2), kind + " stays in the kit: " + kitted.map((shot) => shot[kind]).join(" "));
	}
	refined.shots.forEach((shot, index) => { if (index) assert.notEqual(shot.layout, refined.shots[index - 1].layout, "and still never follows itself"); });
});

test("instrumental breaks, the intro and the outro play scenes of their own", () => {
	const { motion, director, type } = load();
	const lyrics = [];
	let at = 9000;
	for (let index = 0; index < 12; index += 1) {
		lyrics.push(line(["we", "keep", "on", "going" + index], at, { step: 400 }));
		// A long break after line 5 (twenty seconds), a short one after line 8.
		at += 4 * 400 + (index === 5 ? 21000 : index === 8 ? 6500 : 600);
	}
	const model = motion.buildModel(lyrics);
	const plan = (raw, title = "Night Run") => motion.compose(model, director.normalizeDirection(raw, model, { seed: 7 }), {
		width: 1440, height: 900, seed: 7, measure, typography: type.typographyOf(model, ""), title, artist: "Demo",
	});
	const scenes = plan(null).interludes;
	assert.ok(scenes.length >= 4, scenes.map((scene) => scene.kind + ":" + scene.style).join(" "));
	const [first] = scenes;
	assert.equal(first.kind, "intro");
	assert.equal(first.style, "title", "the intro opens on the title card");
	assert.equal(first.title.title, "NIGHT RUN", "in capitals");
	assert.equal(first.cue, model[0].start, "and counts in the first line");
	const breaks = scenes.filter((scene) => scene.kind === "break");
	assert.ok(breaks.length >= 2, "a long break plays more than one scene: " + breaks.map((scene) => scene.style));
	assert.equal(breaks[breaks.length - 1].cue, model[6].start, "the last counts in the lyrics' return");
	assert.ok(breaks.every((scene) => motion.INTERLUDE_STYLES.includes(scene.style)));
	scenes.forEach((scene, index) => { if (index && scenes[index - 1].kind !== "intro") assert.notEqual(scene.style, scenes[index - 1].style, "never the same scene twice running"); });
	const outro = scenes[scenes.length - 1];
	assert.equal(outro.kind, "outro");
	assert.equal(outro.style, "title", "the outro ends on the title card");
	// No scene while lyrics are sung.
	const built = plan(null);
	for (const scene of built.interludes) {
		for (const piece of built.lines) assert.ok(scene.end <= piece.start - 150 || scene.start >= piece.end + 150 || scene.kind === "outro", scene.style + " overlaps line " + piece.n);
	}
	// The cue dots count the lyrics in one beat at a time.
	assert.ok(built.cues.length >= 2 && built.cues.every((cue) => cue.at > cue.from && cue.step >= 380 && cue.step <= 900));
	// The AI may name the scene for the break after its shot; without a title there is no title card or marquee.
	const named = plan({ shots: [{ from: 0, to: 5, layout: "column", interlude: "grid" }, { from: 6, to: 11, layout: "stairs" }] });
	assert.equal(named.interludes.find((scene) => scene.kind === "break").style, "grid");
	const untitled = plan(null, "");
	assert.ok(untitled.interludes.every((scene) => scene.style !== "title" && scene.style !== "marquee"));
	assert.ok(director.INTERLUDES.every((name) => motion.INTERLUDE_STYLES.includes(name)));
	assert.ok(director.buildPrompt({ lines: [] }).includes('"interlude"'));
});

test("a chorus the AI set line by line in one look stays one composition", () => {
	const { motion, director } = load();
	const model = motion.buildModel([["sing", "it", "loud"], ["all", "night", "long"], ["sing", "it", "loud"], ["all", "night", "long"], ["then", "the", "verse"], ["goes", "on"]]
		.map((parts, index) => line(parts, 1000 + index * 1500, { step: 380 })));
	const look = { layout: "lockup", fx: "assemble", accent: "trail", exit: "sweep", enter: "pan" };
	const raw = { shots: [0, 1, 2, 3].map((n) => ({ from: n, to: n, ...look })).concat([{ from: 4, to: 5, layout: "column", fx: "lift", accent: "color", exit: "fade" }]) };
	const direction = director.normalizeDirection(raw, model, { seed: 2, tempo: { tempo: "mid", pace: 1 } });
	assert.deepEqual(plain(direction.shots.map((shot) => [shot.from, shot.to, shot.layout])), [[0, 3, "lockup"], [4, 5, "column"]]);
	assert.ok(director.buildPrompt({ lines: [] }).includes("never a whole song of them"));
});

test("a chorus of long lines the AI set line by line keeps its look shot after shot", () => {
	const { motion, director } = load();
	const parts = ["kimi", "no", "zen", "zen", "zense", "kara", "boku", "wa", "kimi", "wo", "sagashi", "hajimeta", "yo"];
	const model = motion.buildModel(Array.from({ length: 6 }, (_, index) => line(parts.map((part) => part + index), 1000 + index * 5200, { step: 380 })));
	const look = { layout: "lockup", fx: "assemble", accent: "trail", exit: "sweep" };
	const raw = { shots: [0, 1, 2, 3].map((n) => ({ from: n, to: n, enter: n % 2 ? "drift" : "push", ...look })).concat([{ from: 4, to: 5, layout: "column", fx: "lift", accent: "color", exit: "fade" }]) };
	const direction = director.normalizeDirection(raw, model, { seed: 2, tempo: { tempo: "mid", pace: 1 } });
	const chorus = direction.shots.filter((shot) => shot.to <= 3);
	assert.equal(chorus.length, 4, "too long to merge");
	assert.ok(chorus.every((shot) => shot.layout === "lockup" && shot.fx === "assemble" && shot.accent === "trail"), chorus.map((shot) => shot.layout + "/" + shot.fx + "/" + shot.accent).join(" "));
});

test("the motion camera keeps the background's own dimming and blur and gives them back", () => {
	const { motion } = load();
	const cover = "brightness(0.5) blur(20px)";
	let state = { base: cover, written: null };
	state = motion.cameraFilter(state, cover, 0);
	assert.equal(state.written, cover, "nothing of its own is taken away");
	state = motion.cameraFilter(state, state.written, 3.5);
	assert.equal(state.written, cover + " blur(3.5px)", "the camera's blur comes after the cover's own");
	state = motion.cameraFilter(state, state.written, 0);
	assert.equal(state.written, cover);
	// The app changes the dimming while the camera runs: that becomes the background's own.
	state = motion.cameraFilter(state, "brightness(0.8) blur(10px)", 2);
	assert.equal(state.base, "brightness(0.8) blur(10px)");
	assert.equal(state.written, "brightness(0.8) blur(10px) blur(2px)");
	assert.equal(motion.cameraFilter({ base: "", written: null }, "", 0).written, "", "a background without a filter of its own keeps none");
	const source = read("MotionLyrics.js");
	assert.ok(!/background\.style\.filter = "";/.test(source), "leaving motion never wipes the background's filter");
	assert.match(source, /background\.style\.filter = backgroundFilter\.base/);
});





