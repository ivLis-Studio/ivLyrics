import { CJK_RE, graphemesOf } from "./motionLyricModel.mjs";
import { motionType } from "./MotionLyricsType.mjs";
import { clamp } from "./motionMath.mjs";

export const UI_FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Hiragino Sans", sans-serif';
export const FALLBACK_SPEC = Object.freeze({ key: "fallback", script: "latin", kind: "impact", family: UI_FONT, load: null, weight: 800, style: "normal", spacing: 0, lineHeight: 1.08, scale: 1, canvasFont: "normal 800 100px sans-serif" });
export const fallbackMeasure = (text, size) => graphemesOf(text).reduce((sum, piece) => sum + (CJK_RE.test(piece) || /\p{Script=Hangul}/u.test(piece) ? 1 : 0.56), 0) * size;
export const DEFAULT_INFO = Object.freeze({ script: "latin", rtl: false, joined: false, lang: "", words: [] });
// Word-level stand-ins for letter effects in scripts whose letters join.
export const JOINED_FX = Object.freeze({ type: "wipe", assemble: "blur", drop: "rise", wave: "rise", track: "wipe", bounce: "pop", flicker: "wipe", cascade: "lift", ripple: "rise", swirl: "blur", rain: "rise", decode: "blur" });

export const createFontBook = () => {
	const specs = new Map();
	return (script, personality = "impact", role = "display") => {
		const key = script + "|" + personality + "|" + role;
		if (!specs.has(key)) specs.set(key, motionType?.fontSpec?.(script, personality, role) || FALLBACK_SPEC);
		return specs.get(key);
	};
};
export const casedText = (text, script, upper) => motionType?.casedText?.(text, script, upper) ?? String(text);
/** The face of a word: a shot's emphasised words may switch to handwriting (the script accent) or the serif. */
const faceOf = (type, serif, isEmph, accent) => (isEmph && accent === "script" ? "hand" : isEmph && serif ? "serif" : type);
// How much larger than its line an emphasised word is set, for accents that work by size.
export const ACCENT_SCALE = Object.freeze({ giant: 1.7, script: 1.14 });

/**
 * The faces a direction will set, each with the characters it sets, so
 * they can load before the song is composed.
 */
export const fontNeeds = (model, direction, typography, extra = []) => {
	const needs = new Map();
	const font = createFontBook();
	const add = (spec, text) => {
		if (!spec?.load) return;
		const entry = needs.get(spec.key) || { spec, sample: "" };
		if (entry.sample.length < 400) entry.sample += text;
		needs.set(spec.key, entry);
	};
	for (const shot of direction?.shots || []) {
		const type = shot.type || "impact";
		const cased = (text, script) => text + (shot.upper ? casedText(text, script, true) : "");
		for (let index = shot.from; index <= shot.to; index += 1) {
			const line = model[index];
			const info = typography?.[index] || DEFAULT_INFO;
			if (!line) continue;
			const emph = new Set(direction?.lines?.[index]?.emph || []);
			line.words.forEach((word, wordIndex) => {
				const script = info.words[wordIndex] || info.script;
				const text = cased(word.text, script);
				add(font(script, faceOf(type, shot.serif, emph.has(wordIndex), shot.accent), "display"), text);
				add(font(script, type, "light"), text);
			});
			(line.backing || []).forEach((voice, voiceIndex) => voice.words.forEach((word, position) => {
				const script = info.backing?.[voiceIndex]?.[position] || info.script;
				add(font(script, type, voice.role === "duet" ? "display" : "light"), cased(word.text, script));
			}));
		}
		if (shot.echo) add(font(motionType?.scriptOf?.(shot.echo) || "latin", type, "display"), shot.echo);
	}
	// Other texts the edit sets (the title cards and marquees of the interludes) in the song's main script's faces.
	const main = typography?.find?.(Boolean)?.script || "latin";
	for (const text of extra) {
		const value = String(text ?? "").trim();
		if (!value) continue;
		const script = motionType?.scriptOf?.(value, "", main) || main;
		add(font(script, "impact", "display"), value + casedText(value, script, true));
		add(font(script, "impact", "light"), value + casedText(value, script, true));
	}
	return needs;
};

const EMPTY_SET = new Set();
// How far past an emphasised word (in its own em) the mark of these accents
// reaches sideways (style.css: the brackets' rules, the stamp's frame, the
// pen loop, the marker): the words beside it are set clear of the mark.
const ACCENT_REACH = Object.freeze({ bracket: 0.26, stamp: 0.24, circle: 0.31, mark: 0.1, underline: 0.06 });
// However a lyric line is set (rows, a tower, upright columns), it never
// takes more than this many rows: a long line is set smaller instead.
export const MAX_LINE_ROWS = 2;

/** A line's words with the face, cased text and natural width each is set in. */
export const itemsOf = (line, ctx, options) => {
	const { size, emph = EMPTY_SET, emphScale = 1.3, light = false, type = "impact", serif = false, upper = false, accent = "" } = options;
	const info = ctx.typography[line.n] || DEFAULT_INFO;
	const items = line.words.map((word, index) => {
		const isEmph = emph.has(index);
		const script = info.words[index] || info.script;
		const role = light && !isEmph ? "light" : "display";
		const spec = ctx.font(script, faceOf(type, serif, isEmph, accent), role);
		const text = casedText(word.text, script, upper && (spec.kind === "impact" || spec.kind === "flex"));
		const wordSize = size * spec.scale * (isEmph ? emphScale * (ACCENT_SCALE[accent] || 1) : 1) * (role === "light" ? 0.94 : 1);
		return {
			index,
			spec,
			text,
			role,
			emph: isEmph,
			letters: !motionType?.JOINED?.has(script),
			size: wordSize,
			width: ctx.measure(text, wordSize, spec),
			// Words the segmenter split from one unspaced run stay close.
			gap: index ? size * (word.joined ? 0.05 + spec.spacing : 0.27 + spec.spacing) : 0,
		};
	});
	const reach = ACCENT_REACH[accent] || 0;
	if (reach) {
		items.forEach((item, index) => {
			const previous = items[index - 1];
			if (!previous || (!previous.emph && !item.emph)) return;
			const clear = (previous.emph ? previous.size * reach : 0) + (item.emph ? item.size * reach : 0) + size * 0.08;
			item.gap = Math.max(item.gap, clear);
		});
	}
	return items;
};

export const splitRows = (items, count, total) => {
	const target = total / count;
	const rows = [];
	let row = [];
	let width = 0;
	items.forEach((item, index) => {
		const remainingRows = count - rows.length - 1;
		const remainingItems = items.length - index;
		if (row.length && width + item.gap + item.width / 2 > target && remainingRows > 0 && remainingItems >= remainingRows) {
			rows.push(row);
			row = [];
			width = 0;
		}
		width += row.length ? item.gap + item.width : item.width;
		row.push(item);
	});
	if (row.length) rows.push(row);
	return rows;
};
export const rowWidth = (row) => row.reduce((sum, item, position) => sum + item.width + (position ? item.gap : 0), 0);

/** Items in up to `most` rows no wider than maxLength, and the scale that makes them fit. */
const fitRows = (items, maxLength, most) => {
	const total = rowWidth(items);
	let rows = [items];
	if (total > maxLength && items.length > 1) {
		for (let count = 2; count <= Math.min(most, items.length); count += 1) {
			rows = splitRows(items, count, total);
			if (Math.max(...rows.map(rowWidth)) <= maxLength) break;
		}
	}
	const widest = Math.max(...rows.map(rowWidth));
	return { rows, scale: widest > maxLength ? maxLength / widest : 1 };
};

// Other voices are set smaller than the lead: background vocals much smaller, a duet partner a little.
const VOICE_SCALE = Object.freeze({ background: 0.56, duet: 0.8 });

/**
 * Rows for the other voices of a line: background vocals in the companion
 * face, a duet partner in the shot's face, under the lead (above it when
 * they start first). scale is the lead's row scale; maxLength is final px.
 */
const voiceRows = (line, ctx, options, scale, maxLength) => {
	const above = [];
	const below = [];
	const info = ctx.typography[line.n] || DEFAULT_INFO;
	let index = line.words.length;
	(line.backing || []).forEach((voice, voiceIndex) => {
		const duet = voice.role === "duet";
		const role = duet ? "display" : "light";
		const size = options.size * (VOICE_SCALE[voice.role] || VOICE_SCALE.background);
		const items = voice.words.map((word, position) => {
			const script = info.backing?.[voiceIndex]?.[position] || info.script;
			const spec = ctx.font(script, options.type || "impact", role);
			const text = casedText(word.text, script, options.upper && (spec.kind === "impact" || spec.kind === "flex"));
			const itemSize = size * spec.scale;
			return {
				index: index++,
				spec,
				text,
				role,
				emph: false,
				voice: voiceIndex + 1,
				letters: !motionType?.JOINED?.has(script),
				size: itemSize,
				width: ctx.measure(text, itemSize, spec),
				gap: position ? size * (word.joined ? 0.05 + spec.spacing : 0.27 + spec.spacing) : 0,
			};
		});
		const fit = fitRows(items, maxLength / scale, MAX_LINE_ROWS);
		const target = voice.start < line.words[0].start - 250 ? above : below;
		for (const row of fit.rows) target.push({ row, scale: scale * fit.scale });
	});
	return { above, below };
};

const withVoices = (rows, scales, voices) => ({
	rows: [...voices.above.map((entry) => entry.row), ...rows, ...voices.below.map((entry) => entry.row)],
	scales: [...voices.above.map((entry) => entry.scale), ...scales, ...voices.below.map((entry) => entry.scale)],
});

/**
 * Rows of items stacked into a block centred on the origin. Each row has
 * its own scale; right-to-left lines read from the right.
 */
const stackRows = (rows, scales, align, rtl, rowGapSize) => {
	const metrics = rows.map((row, index) => {
		const scale = scales[index];
		const tallest = Math.max(...row.map((item) => item.size)) * scale;
		const lineHeight = Math.max(...row.map((item) => item.spec.lineHeight));
		return { row, scale, width: rowWidth(row) * scale, height: tallest * lineHeight, tallest };
	});
	const rowGap = rowGapSize * 0.05;
	const width = Math.max(...metrics.map((metric) => metric.width));
	const height = metrics.reduce((sum, metric) => sum + metric.height, 0) + rowGap * (metrics.length - 1);
	const words = [];
	let top = -height / 2;
	for (const metric of metrics) {
		let x = align === "left" ? -width / 2 : align === "right" ? width / 2 - metric.width : -metric.width / 2;
		metric.row.forEach((item, position) => {
			if (position) x += item.gap * metric.scale;
			const itemWidth = item.width * metric.scale;
			const itemSize = item.size * metric.scale;
			const center = x + itemWidth / 2;
			words[item.index] = {
				x: rtl ? -center : center,
				y: top + metric.height / 2 + (metric.tallest - itemSize) * 0.3,
				size: itemSize,
				width: itemWidth,
				role: item.role,
				emph: item.emph,
				voice: item.voice || 0,
				spec: item.spec,
				text: item.text,
				letters: item.letters,
			};
			x += itemWidth;
		});
		top += metric.height + rowGap;
	}
	return { words, width, height, rows: metrics.length };
};

/**
 * A line's words in up to two rows, centred on the line's origin, with
 * its other voices in smaller rows. leadWidth is the lead's own width.
 */
export const layoutBlock = (line, ctx, options) => {
	const { size, maxLength, align = "center" } = options;
	const rtl = (ctx.typography[line.n] || DEFAULT_INFO).rtl;
	const lead = fitRows(itemsOf(line, ctx, options), maxLength, MAX_LINE_ROWS);
	const { rows, scales } = withVoices(lead.rows, lead.rows.map(() => lead.scale), voiceRows(line, ctx, options, lead.scale, maxLength));
	const block = stackRows(rows, scales, align, rtl, size * lead.scale);
	return { ...block, size: size * lead.scale, rtl, leadWidth: Math.max(...lead.rows.map(rowWidth)) * lead.scale };
};

/** A line set as a justified tower: two rows (one when it is a single word), every row the same width. */
export const towerBlock = (line, ctx, width, options) => {
	const rtl = (ctx.typography[line.n] || DEFAULT_INFO).rtl;
	const sized = { ...options, size: 100 };
	const items = itemsOf(line, ctx, sized);
	const count = Math.min(MAX_LINE_ROWS, items.length);
	const rows = count <= 1 ? [items] : splitRows(items, count, rowWidth(items));
	const scaleOf = (row) => clamp(width / Math.max(1, rowWidth(row)), (ctx.F * 0.5) / 100, (ctx.F * 2.4) / 100);
	// The other voices sit under the tower, sized from its smallest row.
	const build = (scales) => {
		const all = withVoices(rows, scales, voiceRows(line, ctx, sized, Math.min(...scales), width));
		return stackRows(all.rows, all.scales, options.align || "center", rtl, ctx.F);
	};
	let scales = rows.map(scaleOf);
	let block = build(scales);
	if (block.height > ctx.H * 0.78) {
		const shrink = (ctx.H * 0.78) / block.height;
		scales = scales.map((scale) => scale * shrink);
		block = build(scales);
	}
	return { ...block, size: 100 * Math.max(...scales), rtl };
};
