(() => {
	const segmenterCache = new Map();
	const JA_PARTICLES = new Set([
		"は", "が", "を", "に", "へ", "で", "と", "の", "も", "や", "か", "ね", "よ", "ぞ", "ぜ",
		"から", "まで", "だけ", "しか", "ほど", "くらい", "ぐらい", "など", "こそ", "とも", "な",
	]);
	const JA_SAFE_SUFFIXES = new Set([
		"た", "て", "ば", "ぬ", "って", "った", "いて", "いで", "んで",
		"てる", "でる", "いてる", "えてる", "たい", "ない", "れば",
	]);
	const ZH_PROTECTED = new Set([
		"我们", "你们", "他们", "她们", "它们", "这个", "那个", "这些", "那些", "这里", "那里",
		"这样", "那样", "这么", "那么", "真的", "的话", "为了", "除了", "只有", "就是", "没有",
		"一下", "一起", "已经", "非常", "特别", "重新", "超级", "无法", "第一次", "经过", "难过",
		"结果", "如果", "最后",
	]);
	const ZH_PRONOUNS = ["我们", "你们", "他们", "她们", "它们", "我", "你", "他", "她", "它"];
	const ZH_LEFT_ATOMS = new Set(["不", "没", "很", "也", "都"]);
	const ZH_LOCALIZERS = new Set(["上", "下", "里", "中", "前", "后", "内", "外"]);
	const ZH_MULTI_PREFIXES = ["一起"];

	const baseLanguage = (locale) => String(locale || "").toLowerCase().replace(/_/g, "-").split("-")[0];
	const inferLocale = (text) => {
		if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return "ja";
		if (/\p{Script=Thai}/u.test(text)) return "th";
		if (/\p{Script=Lao}/u.test(text)) return "lo";
		if (/\p{Script=Khmer}/u.test(text)) return "km";
		if (/\p{Script=Myanmar}/u.test(text)) return "my";
		if (/\p{Script=Han}/u.test(text)) return "zh";
		return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
	};
	const normalizeLocale = (locale, text = "") => {
		const explicit = String(locale || "").trim().replace(/_/g, "-");
		return explicit && explicit.toLowerCase() !== "auto" ? explicit : inferLocale(String(text));
	};
	const getSegmenters = (locale) => {
		const normalized = normalizeLocale(locale);
		if (!segmenterCache.has(normalized)) {
			let supportedLocale = normalized;
			try {
				new Intl.Segmenter(supportedLocale);
			} catch (error) {
				supportedLocale = baseLanguage(normalized) || "en";
			}
			segmenterCache.set(normalized, {
				word: new Intl.Segmenter(supportedLocale, { granularity: "word" }),
				grapheme: new Intl.Segmenter(supportedLocale, { granularity: "grapheme" }),
			});
		}
		return segmenterCache.get(normalized);
	};
	const graphemes = (text, locale) => [...getSegmenters(locale).grapheme.segment(text)].map((item) => item.segment);
	const intlWords = (text, locale) => text
		? [...getSegmenters(locale).word.segment(text)].filter((item) => item.isWordLike).map((item) => item.segment)
		: [];
	const isHiraganaString = (value) => /^\p{Script=Hiragana}+$/u.test(value);
	const isKatakanaGrapheme = (value) => /^[\p{Script=Katakana}ーヽヾ]+$/u.test(value);
	const isLatinNumGrapheme = (value) => /^[\p{Script=Latin}\p{N}]+$/u.test(value);

	let tinyJapaneseSegmenter = null;
	const createTokenRecords = (items, text) => {
		const output = [];
		let cursor = 0;
		for (const item of Array.isArray(items) ? items : []) {
			const surface = String(typeof item === "string" ? item : item?.surface ?? "");
			if (!surface) continue;
			const locatedStart = text.indexOf(surface, cursor);
			const start = Number.isInteger(item?.start) ? item.start : locatedStart;
			if (start < 0) return [];
			const end = Number.isInteger(item?.end) ? item.end : start + surface.length;
			output.push({
				surface,
				start,
				end,
				pos: item?.pos ?? null,
				posDetail: item?.posDetail ?? item?.pos_detail_1 ?? null,
				lemma: item?.lemma ?? null,
				conjugation: item?.conjugation ?? null,
			});
			cursor = end;
		}
		return output;
	};
	const defaultJapaneseTokenizer = Object.freeze({
		tokenize(text, locale) {
			if (!tinyJapaneseSegmenter && typeof globalThis.TinySegmenter === "function") {
				tinyJapaneseSegmenter = new globalThis.TinySegmenter();
			}
			const surfaces = tinyJapaneseSegmenter?.segment(text) ?? intlWords(text, locale);
			return createTokenRecords(surfaces, text);
		},
	});
	const tokenizeJapanese = (text, locale, tokenizer) => {
		try {
			const records = createTokenRecords(tokenizer?.tokenize?.(text, locale), text);
			if (records.length) return records;
		} catch (error) {
			console.warn("[ivLyrics] Japanese tokenizer failed; using Intl fallback", error);
		}
		return createTokenRecords(intlWords(text, locale), text);
	};
	const groupJapaneseTokens = (tokens) => {
		const output = [];
		for (const tokenRecord of tokens) {
			const token = tokenRecord.surface;
			if (!output.length) {
				output.push(tokenRecord);
				continue;
			}
			const previousRecord = output[output.length - 1];
			const previous = previousRecord.surface;
			const previousIsParticle = JA_PARTICLES.has(previous);
			const safeSuffix = JA_SAFE_SUFFIXES.has(token);
			const contextualSou = token === "そう" && /\p{Script=Hiragana}$/u.test(previous);
			const morphology = `${tokenRecord.pos ?? ""} ${tokenRecord.posDetail ?? ""}`.toLowerCase();
			const morphologicalSuffix = /auxiliary|suffix|conjunctive|助動詞|接続助詞|接尾/u.test(morphology);
			if (!previousIsParticle && (morphologicalSuffix || (isHiraganaString(token) && (safeSuffix || contextualSou)))) {
				output[output.length - 1] = { ...previousRecord, surface: previous + token, end: tokenRecord.end };
				continue;
			}
			output.push(tokenRecord);
		}
		return output.map(({ surface }) => surface);
	};
	const segmentJapaneseRun = (run, locale, tokenizer) => {
		const pieces = [];
		let buffer = "";
		let kind = null;
		for (const grapheme of graphemes(run, locale)) {
			const nextKind = isKatakanaGrapheme(grapheme) ? "katakana" : isLatinNumGrapheme(grapheme) ? "latin" : "japanese";
			if (kind !== null && kind !== nextKind) {
				pieces.push({ kind, text: buffer });
				buffer = "";
			}
			kind = nextKind;
			buffer += grapheme;
		}
		if (buffer) pieces.push({ kind, text: buffer });
		const output = [];
		pieces.forEach((piece) => {
			if (piece.kind === "latin") output.push(piece.text);
			else {
				const records = tokenizeJapanese(piece.text, locale, tokenizer);
				output.push(...(piece.kind === "japanese" ? groupJapaneseTokens(records) : records.map(({ surface }) => surface)));
			}
		});
		return output;
	};

	const splitChineseAspectInside = (token) => {
		const chars = Array.from(token);
		for (let index = 1; index < chars.length - 1; index += 1) {
			if (["了", "着", "过"].includes(chars[index])) {
				return [chars.slice(0, index).join(""), chars[index], chars.slice(index + 1).join("")];
			}
		}
		return null;
	};
	const splitChineseToken = (token) => {
		if (!token || Array.from(token).length <= 1 || ZH_PROTECTED.has(token)) return token ? [token] : [];
		const chars = Array.from(token);
		if (chars.length >= 2 && chars.every((char) => char === chars[0]) && /\p{Script=Han}/u.test(chars[0])) return chars;
		for (const pronoun of ZH_PRONOUNS) {
			if (token.startsWith(pronoun) && token !== pronoun) return [pronoun, ...splitChineseToken(token.slice(pronoun.length))];
		}
		for (const prefix of ZH_MULTI_PREFIXES) {
			if (token.startsWith(prefix) && token !== prefix) return [prefix, ...splitChineseToken(token.slice(prefix.length))];
		}
		const first = chars[0];
		const last = chars[chars.length - 1];
		if (ZH_LEFT_ATOMS.has(first)) return [first, ...splitChineseToken(chars.slice(1).join(""))];
		const medialAspect = splitChineseAspectInside(token);
		if (medialAspect) return medialAspect.flatMap(splitChineseToken);
		if (last === "了") return [...splitChineseToken(chars.slice(0, -1).join("")), "了"];
		for (const pronoun of ZH_PRONOUNS) {
			if (token.endsWith(pronoun) && token !== pronoun) return [...splitChineseToken(token.slice(0, -pronoun.length)), pronoun];
		}
		if (last === "的") {
			const stem = chars.slice(0, -1).join("");
			if (ZH_PRONOUNS.includes(stem)) return [stem, "的"];
		}
		if (ZH_LOCALIZERS.has(last) && chars.length >= 3) {
			return [...splitChineseToken(chars.slice(0, -1).join("")), last];
		}
		return [token];
	};
	const segmentLexicalRun = (run, locale, tokenizer) => {
		const language = baseLanguage(locale);
		if (language === "ja") return segmentJapaneseRun(run, locale, tokenizer);
		if (language === "zh") return intlWords(run, locale).flatMap(splitChineseToken);
		const words = intlWords(run, locale);
		return words.length ? words : [run];
	};

	const segmentLyricsWithTokenizer = (text, locale, tokenizer) => {
		const source = String(text || "");
		const resolvedLocale = normalizeLocale(locale, source);
		const chars = graphemes(source, resolvedLocale);
		const output = [];
		let lexical = "";
		let pendingPrefix = "";
		// Whitespace seen since the last emitted token. Trailing punctuation may
		// only be appended to the previous token while this is false: across a
		// gap the concatenation would not be a substring of the source, which
		// breaks range lookup downstream and leaves those characters unmapped.
		let pendingGap = false;
		const isLatinNum = (value) => /^[\p{Script=Latin}\p{N}]$/u.test(value);
		const isLatinJoiner = (value, previous, next) => ["'", "’", "-", "‐"].includes(value)
			&& !!previous && !!next && isLatinNum(previous) && isLatinNum(next);
		const flush = () => {
			if (!lexical) return;
			const tokens = segmentLexicalRun(lexical, resolvedLocale, tokenizer);
			if (pendingPrefix && tokens.length) {
				tokens[0] = pendingPrefix + tokens[0];
				pendingPrefix = "";
			}
			output.push(...tokens.filter(Boolean));
			lexical = "";
			pendingGap = false;
		};
		// A pending prefix followed by whitespace can no longer travel with the
		// next word, so it becomes its own token (still contiguous with the
		// source, so it stays a literal substring).
		const flushPrefix = () => {
			if (!pendingPrefix) return;
			output.push(pendingPrefix);
			pendingPrefix = "";
		};
		chars.forEach((char, index) => {
			const previous = chars[index - 1];
			const next = chars[index + 1];
			if (isLatinJoiner(char, previous, next)) {
				lexical += char;
			} else if (/^\s+$/u.test(char)) {
				flush();
				flushPrefix();
				pendingGap = true;
			} else if (/^[\p{Ps}\p{Pi}]$/u.test(char)) {
				flush();
				pendingPrefix += char;
			} else if (/^\p{P}$/u.test(char)) {
				flush();
				if (output.length && !pendingGap) {
					// The previous token and this character are adjacent in the
					// source, but a pending prefix may sit between other
					// characters, so it has to leave the token first.
					flushPrefix();
					output[output.length - 1] += char;
				} else pendingPrefix += char;
			} else if (/^\p{S}$/u.test(char)) {
				flush();
				output.push(pendingPrefix ? pendingPrefix + char : char);
				pendingPrefix = "";
				pendingGap = false;
			} else {
				lexical += char;
			}
		});
		flush();
		if (pendingPrefix) {
			if (output.length && !pendingGap) output[output.length - 1] += pendingPrefix;
			else output.push(pendingPrefix);
		}
		return output;
	};

	const segmentRangesWithTokenizer = (text, locale, tokenizer) => {
		const source = String(text || "");
		if (!source) return [];
		const ranges = [];
		let cursor = 0;
		// Every character of the line needs a word index. A character without one
		// is treated as "no unit" downstream, which merges it into the previous
		// word run and silently drops that word's annotations, so uncovered
		// stretches are mapped one grapheme at a time instead of being skipped.
		// Only reached when a token could not be located, so the common path
		// keeps its previous cost.
		let resolvedLocale = null;
		const getResolvedLocale = () => {
			if (resolvedLocale === null) resolvedLocale = normalizeLocale(locale, source);
			return resolvedLocale;
		};
		const pushFillerRanges = (from, to) => {
			if (to <= from) return;
			let offset = from;
			const fillerChars = graphemes(source.slice(from, to), getResolvedLocale());
			for (const char of fillerChars) {
				if (char && !/^\s+$/u.test(char)) {
					ranges.push({ start: offset, end: offset + char.length, text: char });
				}
				offset += char.length;
			}
		};
		for (const token of segmentLyricsWithTokenizer(source, locale, tokenizer)) {
			if (!token) continue;
			const start = source.indexOf(token, cursor);
			if (start < 0) {
				// Unlocatable token: keep making progress so the rest of the line
				// is still mapped, and give the next unmapped grapheme its own unit.
				if (cursor >= source.length) break;
				const [head] = graphemes(source.slice(cursor), getResolvedLocale());
				if (!head) break;
				if (!/^\s+$/u.test(head)) {
					ranges.push({ start: cursor, end: cursor + head.length, text: head });
				}
				cursor += head.length;
				continue;
			}
			if (start > cursor) pushFillerRanges(cursor, start);
			ranges.push({ start, end: start + token.length, text: token });
			cursor = start + token.length;
		}
		if (cursor < source.length) pushFillerRanges(cursor, source.length);
		return ranges;
	};

	const createLyricsSegmenter = ({ locale = "auto", tokenizer = defaultJapaneseTokenizer } = {}) => Object.freeze({
		segmentLyrics: (text, requestedLocale = locale) => segmentLyricsWithTokenizer(text, requestedLocale, tokenizer),
		segmentRanges: (text, requestedLocale = locale) => segmentRangesWithTokenizer(text, requestedLocale, tokenizer),
	});
	const defaultSegmenter = createLyricsSegmenter();
	const segmentLyrics = defaultSegmenter.segmentLyrics;
	const segmentRanges = defaultSegmenter.segmentRanges;
	// Karaoke rendering segments the same syllables and lines many times per
	// lyrics update (timing windows, glyph rows, fill ends, furigana maps).
	// Grapheme clusters depend only on the text and requested locale, so keep
	// recent results; callers receive their own copy.
	const GRAPHEME_CACHE_LIMIT = 4096;
	const graphemeCache = new Map();
	const segmentGraphemes = (text, locale = "auto") => {
		const source = String(text || "");
		if (!source) return [];
		const key = String(locale) + "\u0000" + source;
		let cached = graphemeCache.get(key);
		if (!cached) {
			cached = graphemes(source, normalizeLocale(locale, source));
			if (graphemeCache.size >= GRAPHEME_CACHE_LIMIT) graphemeCache.delete(graphemeCache.keys().next().value);
			graphemeCache.set(key, cached);
		}
		return cached.slice();
	};
	const api = Object.freeze({ normalizeLocale, createLyricsSegmenter, segmentLyrics, segmentRanges, segmentGraphemes });
	globalThis.LyricsWordSegmenter = api;
	if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
