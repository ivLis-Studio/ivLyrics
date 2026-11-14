// Motion lyrics type: which script each lyric word is written in, and the
// display faces that set it.
//
// Every script ivLyrics' languages use has a heavy display face (impact, the
// face nearly everything is set in), a serif for a few emphasised words, a
// rounded face for playful shots and a sturdy sans companion ("light", a
// semi-bold, never hairline: lyrics must read over video). All come from
// Google Fonts. Words in a line take the line's script so mixed lines
// (English inside a Korean line) stay in one family; Latin glyphs exist in
// every face. Scripts whose letters join or stack (Arabic, Hebrew,
// Devanagari, Bengali) are never split into letters, and right-to-left lines
// are laid out from the right.
(function IvLyricsMotionType(root) {
	"use strict";

	if (root.ivLyricsMotionType?.initialized) return;

	const PERSONALITIES = Object.freeze(["impact", "serif", "round"]);
	const FONT_WAIT_MS = 3200;
	const BASE_FALLBACK = '"Pretendard Variable", Pretendard, "Noto Sans", "Apple SD Gothic Neo", "Hiragino Sans", sans-serif';

	// Character tests, in the order a line's script is decided.
	const TESTS = Object.freeze({
		hangul: /\p{Script=Hangul}/u,
		kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
		han: /\p{Script=Han}/u,
		arabic: /\p{Script=Arabic}/u,
		hebrew: /\p{Script=Hebrew}/u,
		thai: /\p{Script=Thai}/u,
		devanagari: /\p{Script=Devanagari}/u,
		bengali: /\p{Script=Bengali}/u,
		cyrillic: /\p{Script=Cyrillic}/u,
		greek: /\p{Script=Greek}/u,
		latin: /\p{Script=Latin}/u,
	});
	const SCRIPTS = Object.freeze(["latin", "cyrillic", "greek", "ko", "ja", "zh-hans", "zh-hant", "arabic", "hebrew", "thai", "devanagari", "bengali"]);
	const RTL = new Set(["arabic", "hebrew"]);
	// Joined or stacked letters: splitting them into separate boxes breaks shaping.
	const JOINED = new Set(["arabic", "hebrew", "devanagari", "bengali"]);
	const CASED = new Set(["latin", "cyrillic", "greek"]);

	const face = (family, weight = 400, extra = {}) => ({ family, weight, style: "normal", spacing: 0, lineHeight: 1.04, scale: 1, ...extra });
	const pretendard = face("Pretendard Variable", 640, { external: true, spacing: -0.012, lineHeight: 1.14 });
	// Handwriting and brush faces for the "script" accent: one emphasised word against the heavy type.
	const HAND = Object.freeze({
		latin: face("Kaushan Script", 400, { lineHeight: 1.1, scale: 1.08 }),
		cyrillic: face("Caveat", 700, { lineHeight: 1.08, scale: 1.22 }),
		ko: face("Nanum Brush Script", 400, { lineHeight: 1.08, scale: 1.42 }),
		ja: face("Yusei Magic", 400, { lineHeight: 1.12, scale: 1.02 }),
		"zh-hans": face("Ma Shan Zheng", 400, { lineHeight: 1.1, scale: 1.12 }),
		"zh-hant": face("LXGW WenKai TC", 700, { lineHeight: 1.12 }),
		arabic: face("Aref Ruqaa", 700, { lineHeight: 1.5 }),
		hebrew: face("Amatic SC", 700, { lineHeight: 1.1, scale: 1.25 }),
		thai: face("Itim", 400, { lineHeight: 1.4 }),
		devanagari: face("Kalam", 700, { lineHeight: 1.4 }),
		bengali: face("Galada", 400, { lineHeight: 1.4 }),
	});

	/** Faces per script: impact (heavy display), serif (emphasised words), round and light (semi-bold companion). */
	const FACES = Object.freeze({
		latin: {
			impact: face("Anton", 400, { spacing: 0.004, lineHeight: 1.02 }),
			serif: face("Playfair Display", 800, { style: "italic", spacing: -0.01, lineHeight: 1.08, scale: 0.94 }),
			round: face("Baloo 2", 800, { lineHeight: 1.0, scale: 0.98 }),
			light: pretendard,
		},
		cyrillic: {
			impact: face("Oswald", 700, { lineHeight: 1.06 }),
			serif: face("Playfair Display", 800, { style: "italic", spacing: -0.01, lineHeight: 1.08, scale: 0.94 }),
			round: face("Rubik", 800, { lineHeight: 1.06, scale: 0.92 }),
			light: face("Noto Sans", 600, { spacing: -0.01, lineHeight: 1.16 }),
		},
		greek: {
			impact: face("Roboto Condensed", 800, { lineHeight: 1.06 }),
			serif: face("GFS Didot", 400, { lineHeight: 1.1 }),
			round: face("Comfortaa", 700, { lineHeight: 1.08, scale: 0.92 }),
			light: face("Noto Sans", 600, { spacing: -0.01, lineHeight: 1.16 }),
		},
		ko: {
			impact: face("Black Han Sans", 400, { lineHeight: 1.08 }),
			serif: face("Nanum Myeongjo", 800, { spacing: -0.02, lineHeight: 1.14, scale: 0.96 }),
			round: face("Jua", 400, { lineHeight: 1.1 }),
			light: pretendard,
		},
		ja: {
			impact: face("Dela Gothic One", 400, { lineHeight: 1.12, scale: 0.94 }),
			serif: face("Shippori Mincho B1", 800, { lineHeight: 1.14, scale: 0.96 }),
			round: face("Zen Maru Gothic", 900, { lineHeight: 1.12, scale: 0.96 }),
			light: face("Zen Kaku Gothic New", 700, { lineHeight: 1.18 }),
		},
		"zh-hans": {
			impact: face("ZCOOL QingKe HuangYou", 400, { lineHeight: 1.08, scale: 1.04 }),
			serif: face("Noto Serif SC", 900, { lineHeight: 1.14, scale: 0.94 }),
			round: face("ZCOOL KuaiLe", 400, { lineHeight: 1.1 }),
			light: face("Noto Sans SC", 600, { lineHeight: 1.18 }),
		},
		"zh-hant": {
			impact: face("Noto Sans TC", 900, { lineHeight: 1.12, scale: 0.94 }),
			serif: face("Noto Serif TC", 900, { lineHeight: 1.14, scale: 0.94 }),
			round: face("Chiron GoRound TC", 800, { lineHeight: 1.12, scale: 0.96 }),
			light: face("Noto Sans TC", 600, { lineHeight: 1.18 }),
		},
		arabic: {
			impact: face("Lalezar", 400, { lineHeight: 1.36, scale: 0.94 }),
			serif: face("Amiri", 700, { lineHeight: 1.5, scale: 0.98 }),
			round: face("Baloo Bhaijaan 2", 800, { lineHeight: 1.3, scale: 0.94 }),
			light: face("Vazirmatn", 600, { lineHeight: 1.4 }),
		},
		hebrew: {
			impact: face("Secular One", 400, { lineHeight: 1.14 }),
			serif: face("Frank Ruhl Libre", 900, { lineHeight: 1.12 }),
			round: face("Fredoka", 700, { lineHeight: 1.1 }),
			light: face("Rubik", 600, { lineHeight: 1.18 }),
		},
		thai: {
			impact: face("Kanit", 800, { lineHeight: 1.36, scale: 0.94 }),
			serif: face("Trirong", 800, { lineHeight: 1.4, scale: 0.92 }),
			round: face("Mitr", 600, { lineHeight: 1.36, scale: 0.94 }),
			light: face("Sarabun", 600, { lineHeight: 1.42 }),
		},
		devanagari: {
			impact: face("Teko", 700, { lineHeight: 1.1, scale: 1.2 }),
			serif: face("Martel", 900, { lineHeight: 1.46, scale: 0.9 }),
			round: face("Baloo 2", 800, { lineHeight: 1.24, scale: 0.96 }),
			light: face("Hind", 600, { lineHeight: 1.36 }),
		},
		bengali: {
			impact: face("Hind Siliguri", 700, { lineHeight: 1.34, scale: 0.98 }),
			serif: face("Noto Serif Bengali", 900, { lineHeight: 1.4, scale: 0.92 }),
			round: face("Baloo Da 2", 800, { lineHeight: 1.28, scale: 0.96 }),
			light: face("Hind Siliguri", 600, { lineHeight: 1.38 }),
		},
	});

	const quote = (family) => '"' + family + '"';

	/**
	 * The face a word is set in. Roles: "display" (the personality's face) or
	 * "light" (the companion sans). Unknown personalities (an older AI answer
	 * asking for "thin") are set in the impact face.
	 */
	const fontSpec = (script, personality = "impact", role = "display") => {
		const faces = FACES[script] || FACES.latin;
		// A script without a handwriting face keeps its heavy one.
		const hand = role !== "light" && personality === "hand" ? HAND[FACES[script] ? script : "latin"] : null;
		const kind = hand ? "hand" : role === "light" ? "light" : PERSONALITIES.includes(personality) ? personality : "impact";
		const base = hand || faces[kind];
		const stack = [quote(base.family), quote(faces.light.family), BASE_FALLBACK].join(", ");
		const key = [script, kind, base.family, base.weight, base.style].join("|");
		return {
			key,
			script,
			kind,
			family: stack,
			load: base.external ? null : { family: base.family, weight: base.weight, style: base.style },
			weight: base.weight,
			style: base.style,
			spacing: base.spacing,
			lineHeight: base.lineHeight,
			scale: base.scale,
			canvasFont: base.style + " " + base.weight + " 100px " + stack,
		};
	};

	const counts = (text) => {
		const result = {};
		for (const char of String(text ?? "")) {
			for (const [name, test] of Object.entries(TESTS)) {
				if (test.test(char)) {
					result[name] = (result[name] || 0) + 1;
					break;
				}
			}
		}
		return result;
	};

	/** "zh-hant" etc. from a detected song language (LyricsService codes). */
	const hanScriptFor = (lang) => {
		const code = String(lang || "").toLowerCase();
		if (code.startsWith("ja")) return "ja";
		if (code.startsWith("ko")) return "ko";
		if (/^zh-(hant|tw|hk|mo)/.test(code)) return "zh-hant";
		return "zh-hans";
	};

	/**
	 * The script a text is written in. Text without letters (numbers,
	 * symbols) takes the fallback; English lines in a Korean song are Latin,
	 * so they get a Latin display face, as typography edits contrast them.
	 */
	const scriptOf = (text, lang = "", fallback = "latin") => {
		const found = counts(text);
		if (found.kana) return "ja";
		if (found.hangul && found.hangul >= (found.han || 0)) return "ko";
		if (found.han) return hanScriptFor(lang);
		let best = null;
		for (const name of ["arabic", "hebrew", "thai", "devanagari", "bengali", "cyrillic", "greek"]) {
			if (found[name] && (!best || found[name] > found[best])) best = name;
		}
		if (best) return best;
		return found.latin ? "latin" : fallback;
	};

	const LANG_TAGS = Object.freeze({ ko: "ko", ja: "ja", "zh-hans": "zh-Hans", "zh-hant": "zh-Hant", arabic: "ar", hebrew: "he", thai: "th", devanagari: "hi", bengali: "bn", greek: "el", cyrillic: "ru" });
	const langTagOf = (script, songLang = "") => {
		const code = String(songLang || "").toLowerCase().split("-")[0];
		if (script === "arabic" && ["fa", "ur", "ps", "ku"].includes(code)) return code;
		if ((script === "cyrillic" || script === "latin") && /^[a-z]{2,3}$/.test(code)) return code;
		return LANG_TAGS[script] || "";
	};

	/**
	 * Script facts for each line and word. A word's own script decides only
	 * when it differs from the line in a way the line's face cannot set
	 * (a Japanese word inside a Korean line); Latin words follow the line.
	 */
	const typographyOf = (model, songLang = "") => {
		const songScript = scriptOf((Array.isArray(model) ? model : []).map((line) => line.text).join(" "), songLang, "latin");
		return (Array.isArray(model) ? model : []).map((line) => {
			const script = scriptOf(line.text, songLang, songScript);
			const wordScript = (word) => {
				const own = scriptOf(word.text, songLang, script);
				return own === "latin" || own === script ? script : own;
			};
			const words = line.words.map(wordScript);
			// Other voices (background vocals, a duet partner) set in the line's faces.
			const backing = (Array.isArray(line.backing) ? line.backing : []).map((voice) => voice.words.map(wordScript));
			return {
				script,
				rtl: RTL.has(script),
				joined: JOINED.has(script) || words.some((value) => JOINED.has(value)) || backing.some((list) => list.some((value) => JOINED.has(value))),
				lang: langTagOf(script, songLang),
				words,
				backing,
			};
		});
	};

	const casedText = (text, script, upper) => (upper && CASED.has(script) ? String(text).toLocaleUpperCase() : String(text));

	// ---------------------------------------------------------------------
	// Loading and measuring
	// ---------------------------------------------------------------------

	const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-");
	const cssUrl = (load) => {
		const family = load.family.replace(/ /g, "+");
		const axis = load.style === "italic" ? ":ital,wght@1," + load.weight : load.weight === 400 ? "" : ":wght@" + load.weight;
		return "https://fonts.googleapis.com/css2?family=" + family + axis + "&display=swap";
	};
	const linkLoads = new Map();

	const loadCss = (document, load) => {
		const id = "ivlyrics-motion-font-" + slug(load.family + "-" + load.weight + "-" + load.style);
		if (linkLoads.has(id)) return linkLoads.get(id);
		const promise = new Promise((resolve) => {
			let link = document.getElementById(id);
			if (link?.sheet) {
				resolve(true);
				return;
			}
			if (!link) {
				link = document.createElement("link");
				link.id = id;
				link.rel = "stylesheet";
				link.href = cssUrl(load);
				document.head.appendChild(link);
			}
			link.addEventListener("load", () => resolve(true), { once: true });
			link.addEventListener("error", () => {
				linkLoads.delete(id);
				resolve(false);
			}, { once: true });
			root.setTimeout(() => resolve(false), FONT_WAIT_MS);
		});
		linkLoads.set(id, promise);
		return promise;
	};

	/**
	 * Loads the faces a song needs, each for the characters it sets
	 * (Google Fonts serves only the unicode ranges those touch). The wait is
	 * bounded; fallbacks render until a face arrives.
	 * @param {Map<string, {spec: object, sample: string}>} needs
	 */
	const ensureFonts = (document, needs) => {
		if (!document?.head || typeof document.createElement !== "function") return Promise.resolve(false);
		const fonts = document.fonts;
		const jobs = [];
		for (const { spec, sample } of needs.values()) {
			if (!spec.load) continue;
			const text = String(sample || "Aa").slice(0, 400) || "Aa";
			jobs.push(loadCss(document, spec.load).then((ok) => {
				if (!ok || typeof fonts?.load !== "function") return false;
				return fonts.load(spec.style + " " + spec.weight + " 64px " + quote(spec.load.family), text).then(() => true, () => false);
			}));
		}
		const wait = new Promise((resolve) => root.setTimeout(resolve, FONT_WAIT_MS, false));
		return Promise.race([Promise.all(jobs).then((results) => results.every(Boolean)), wait]);
	};

	const graphemeCount = (text) => {
		if (typeof Intl?.Segmenter === "function") {
			let count = 0;
			for (const _ of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(String(text))) count += 1;
			return count;
		}
		return Array.from(String(text)).length;
	};
	const WIDE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

	/** Width of text in a face at a size (canvas, cached; an estimate without a canvas). */
	const createMeasurer = (document) => {
		const canvas = document?.createElement?.("canvas");
		const context = canvas?.getContext?.("2d");
		const cache = new Map();
		return (text, size, spec) => {
			const safe = spec || fontSpec("latin");
			const key = safe.key + "\u0001" + text;
			let width = cache.get(key);
			if (width === undefined) {
				const letters = graphemeCount(text);
				if (context) {
					context.font = safe.canvasFont;
					width = context.measureText(text).width;
				} else {
					let estimate = 0;
					for (const char of String(text)) estimate += WIDE_RE.test(char) ? 100 : safe.kind === "impact" && safe.script === "latin" ? 46 : 56;
					width = estimate;
				}
				width += safe.spacing * 100 * letters;
				cache.set(key, width);
			}
			return (width * size) / 100;
		};
	};

	root.ivLyricsMotionType = Object.freeze({
		initialized: true,
		PERSONALITIES,
		SCRIPTS,
		FACES,
		RTL,
		JOINED,
		CASED,
		fontSpec,
		scriptOf,
		typographyOf,
		langTagOf,
		casedText,
		ensureFonts,
		createMeasurer,
		cssUrl,
	});
})(typeof window !== "undefined" ? window : globalThis);

