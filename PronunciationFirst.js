// Pronunciation-first display mode.
//
// The lyric page keeps its slots (the original row and its typography, the
// smaller pronunciation row and its typography) and only swaps the values
// shown in them: the pronunciation fills the original row, and the original
// moves to the pronunciation row. Lines without a pronunciation are left as
// they are.
//
// Karaoke rows also need timing for the pronunciation. Each sung unit
// (character or word) of a line, with its timing, is sent to AI together with
// the line's existing pronunciation; AI returns the part of the pronunciation
// sung during each unit, which then keeps that unit's timing. Until that
// arrives (or when no AI provider can do it) the pronunciation is spread over
// the units in proportion to their length.
//
// The same unit timing also drives the optional pronunciation fill: with
// pronunciation-first off, the pronunciation row under each karaoke line is
// filled along these units (no bounce, glow or other karaoke effects).
(function IvLyricsPronunciationFirst() {
	"use strict";

	if (window.ivLyricsPronunciationFirst?.initialized) return;

	const SETTING = "pronunciation-first";
	const FILL_SETTING = "pronunciation-karaoke-fill";
	const STORAGE_KEY = "ivLyrics:visual:" + SETTING;
	const CACHE_KIND = "timed-pronunciation-v1";
	const CHANGED_EVENT = "ivLyrics:pronunciation-first-changed";
	const UPDATED_EVENT = "ivLyrics:pronunciation-first-updated";
	const STATUS_EVENT = "ivLyrics:pronunciation-sync:status";
	const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);
	const MAX_REMEMBERED_TRACKS = 8;

	const getConfig = () => (typeof CONFIG !== "undefined" ? CONFIG : window.CONFIG);

	const readStoredSetting = (setting = SETTING) => {
		try {
			const key = "ivLyrics:visual:" + setting;
			const value = window.ivLyricsStoragePersistence?.getItem?.(key)
				?? localStorage.getItem(key);
			return value === true || value === "true";
		} catch {
			return false;
		}
	};

	const readSetting = (setting) => {
		const visual = getConfig()?.visual;
		if (visual && Object.prototype.hasOwnProperty.call(visual, setting)) return visual[setting] === true;
		return readStoredSetting(setting);
	};

	const isEnabled = () => readSetting(SETTING);

	/** Pronunciation fill along karaoke timing while pronunciation-first is off. */
	const isFillEnabled = () => !isEnabled() && readSetting(FILL_SETTING);

	/** Whether either display needs AI unit timing for the pronunciation. */
	const needsTiming = () => isEnabled() || readSetting(FILL_SETTING);

	const setEnabled = (enabled) => {
		const value = enabled === true;
		const config = getConfig();
		if (config?.visual) config.visual[SETTING] = value;
		try {
			if (typeof StorageManager !== "undefined" && StorageManager?.saveConfig) {
				StorageManager.saveConfig(SETTING, value);
			} else if (window.ivLyricsStoragePersistence?.setItem) {
				window.ivLyricsStoragePersistence.setItem(STORAGE_KEY, String(value));
			} else {
				localStorage.setItem(STORAGE_KEY, String(value));
			}
		} catch (error) {
			console.warn("[ivLyrics] Could not save pronunciation-first mode:", error);
		}
		window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { enabled: value } }));
		window.dispatchEvent(new CustomEvent("ivLyrics", { detail: { type: "config", name: SETTING, value } }));
		return value;
	};

	const toggle = () => setEnabled(!isEnabled());

	// ---------------------------------------------------------------------
	// Line text helpers
	// ---------------------------------------------------------------------

	const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

	const firstText = (...values) => {
		for (const value of values) {
			const text = trimmed(value);
			if (text) return text;
		}
		return "";
	};

	const syllableText = (syllables) => (Array.isArray(syllables)
		? syllables.map((syllable) => String(syllable?.text ?? "")).join("")
		: "");

	const getLinePronunciation = (line) => firstText(
		line?.phoneticText,
		line?.phonetic,
		line?.pronunciationText,
		line?.pronText
	);

	// Presentation lines keep the pronunciation in "text" as well, so the
	// original comes from "originalText" first.
	const getLineOriginal = (line) => {
		if (typeof line?.originalText === "string") return line.originalText;
		const fromSyllables = syllableText(line?.syllables);
		if (fromSyllables.trim()) return fromSyllables;
		return typeof line?.text === "string" ? line.text : "";
	};

	const getPartText = (part) => firstText(part?.text) || syllableText(part?.syllables).trim();
	const getPartPronunciation = (part) => firstText(part?.phonetic, part?.phoneticText, part?.pronText);
	const hasSyllables = (value) => Array.isArray(value) && value.length > 0;

	// Timed groups of one line: its own syllables, or each vocal part.
	const getUnitGroups = (line) => {
		const lead = line?.vocals?.lead;
		if (hasSyllables(lead?.syllables)) {
			const background = Array.isArray(line.vocals.background) ? line.vocals.background : [];
			const hasBackgroundText = background.some((part) => hasSyllables(part?.syllables) && getPartText(part));
			const groups = [{
				key: "lead",
				syllables: lead.syllables,
				pronunciation: getPartPronunciation(lead) || (hasBackgroundText ? "" : getLinePronunciation(line)),
			}];
			background.forEach((part, index) => {
				if (!hasSyllables(part?.syllables)) return;
				groups.push({ key: "bg:" + index, syllables: part.syllables, pronunciation: getPartPronunciation(part) });
			});
			return groups;
		}
		if (hasSyllables(line?.syllables)) {
			return [{ key: "line", syllables: line.syllables, pronunciation: getLinePronunciation(line) }];
		}
		return [];
	};

	// ---------------------------------------------------------------------
	// Distribution
	// ---------------------------------------------------------------------

	const SOUND_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
	const WHITESPACE = /\s/u;

	const splitGraphemes = (text) => {
		const source = String(text ?? "");
		if (!source) return [];
		try {
			const segmenter = window.LyricsWordSegmenter?.segmentGraphemes;
			if (typeof segmenter === "function") return segmenter(source);
		} catch { /* fall through */ }
		return Array.from(source);
	};

	const soundWeight = (text) => splitGraphemes(text).filter((grapheme) => SOUND_CHARACTER.test(grapheme)).length;

	// Spread a pronunciation over timed units in proportion to how much each
	// unit is sung. Spaces stay with the part before them.
	const distribute = (unitTexts, pronunciation) => {
		const texts = Array.isArray(unitTexts) ? unitTexts.map((text) => String(text ?? "")) : [];
		const parts = texts.map(() => "");
		const characters = splitGraphemes(String(pronunciation ?? "").trim());
		if (!parts.length || !characters.length) return parts;
		const weights = texts.map(soundWeight);
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		if (totalWeight === 0) {
			const target = Math.max(0, texts.findIndex((text) => text.trim()));
			parts[target] = characters.join("");
			return parts;
		}
		const visibleTotal = characters.filter((character) => !WHITESPACE.test(character)).length;
		const bounds = [];
		let accumulated = 0;
		for (const weight of weights) {
			accumulated += weight;
			bounds.push(Math.round((visibleTotal * accumulated) / totalWeight));
		}
		let unit = 0;
		let seen = 0;
		for (const character of characters) {
			if (!WHITESPACE.test(character)) {
				while (unit < bounds.length - 1 && seen >= bounds[unit]) unit += 1;
				seen += 1;
			}
			parts[unit] += character;
		}
		return parts;
	};

	// Remove duplicated spaces at unit boundaries and spaces around the line.
	const normalizeParts = (parts, length) => {
		const result = Array.from({ length }, (_, index) => String(parts?.[index] ?? "").replace(/\s+/gu, " "));
		let previousEndsWithSpace = true;
		for (let index = 0; index < result.length; index += 1) {
			if (!result[index]) continue;
			if (previousEndsWithSpace) result[index] = result[index].replace(/^ +/u, "");
			if (result[index]) previousEndsWithSpace = result[index].endsWith(" ");
		}
		for (let index = result.length - 1; index >= 0; index -= 1) {
			if (!result[index]) continue;
			result[index] = result[index].replace(/ +$/u, "");
			if (result[index]) break;
		}
		return result;
	};

	const isValidParts = (parts, length) => Array.isArray(parts)
		&& parts.length === length
		&& parts.every((part) => typeof part === "string")
		&& parts.some((part) => part.trim());

	// Lays an AI split back onto the pronunciation itself: each unit keeps the
	// letters AI gave it, and the pronunciation's own spaces return after the
	// letter they follow. AI sometimes drops or moves word spaces; the shown
	// pronunciation must not change. Null when the letters differ.
	const alignParts = (parts, pronunciation) => {
		const letters = (value) => splitGraphemes(String(value ?? "").normalize("NFC"))
			.filter((character) => !WHITESPACE.test(character));
		const counts = parts.map((part) => letters(part).length);
		const expected = parts.flatMap(letters);
		const source = splitGraphemes(String(pronunciation ?? "").normalize("NFC").trim());
		const visible = source.filter((character) => !WHITESPACE.test(character));
		if (expected.length !== visible.length || expected.some((character, index) => character !== visible[index])) {
			return null;
		}
		const aligned = parts.map(() => "");
		let unit = 0;
		let used = 0;
		let last = -1;
		for (const character of source) {
			if (WHITESPACE.test(character)) {
				if (last >= 0) aligned[last] += character;
				continue;
			}
			while (unit < counts.length - 1 && used >= counts[unit]) {
				unit += 1;
				used = 0;
			}
			aligned[unit] += character;
			used += 1;
			last = unit;
		}
		return aligned;
	};

	// ---------------------------------------------------------------------
	// Swapping
	// ---------------------------------------------------------------------

	const swapSyllables = (syllables, parts) => syllables.map((syllable, index) => ({
		...syllable,
		text: parts[index] ?? "",
	}));

	const getGroupParts = (timed, lineIndex, group) => {
		const stored = timed?.get?.(lineIndex + ":" + group.key);
		const length = group.syllables.length;
		const aligned = isValidParts(stored, length) ? alignParts(stored, group.pronunciation) : null;
		const parts = aligned || distribute(group.syllables.map((syllable) => syllable?.text), group.pronunciation);
		return normalizeParts(parts, length);
	};

	const withoutPronunciationAliases = (value) => {
		delete value.phonetic;
		delete value.pronunciationText;
		delete value.pronText;
		return value;
	};

	const swapVocalPart = (part, parts, pronunciation) => {
		const next = withoutPronunciationAliases({
			...part,
			syllables: swapSyllables(part.syllables, parts),
			text: pronunciation,
		});
		delete next.phoneticText;
		next.phonetic = getPartText(part);
		return next;
	};

	/**
	 * @param {object} line Presentation line.
	 * @param {number} lineIndex Index in the presentation array.
	 * @param {{karaoke?: boolean, lineLevel?: boolean, timed?: Map}} options
	 */
	const swapLine = (line, lineIndex, options = {}) => {
		if (!line || typeof line !== "object") return line;
		const pronunciation = getLinePronunciation(line);
		const karaoke = options.karaoke === true;
		const next = { ...line };
		let changed = false;

		if (karaoke) {
			for (const group of getUnitGroups(line)) {
				if (!group.pronunciation) continue;
				const parts = getGroupParts(options.timed, lineIndex, group);
				if (group.key === "line") {
					next.syllables = swapSyllables(group.syllables, parts);
				} else if (group.key === "lead") {
					next.vocals = { ...(next.vocals || line.vocals) };
					next.vocals.lead = swapVocalPart(line.vocals.lead, parts, group.pronunciation);
				} else {
					const index = Number(group.key.slice(3));
					next.vocals = { ...(next.vocals || line.vocals) };
					const background = (next.vocals.background || []).slice();
					background[index] = swapVocalPart(line.vocals.background[index], parts, group.pronunciation);
					next.vocals.background = background;
				}
				changed = true;
			}
		}

		if (pronunciation && (karaoke || options.lineLevel !== false)) {
			const original = getLineOriginal(line);
			next.originalText = pronunciation;
			next.text = original;
			withoutPronunciationAliases(next);
			// Parallel vocal rows carry their own swapped sub-lines; a
			// line-level original would be split across them a second time.
			if (karaoke && hasSyllables(line?.vocals?.lead?.syllables)) delete next.phoneticText;
			else next.phoneticText = original;
			changed = true;
		}

		if (!changed) return line;
		delete next.furigana;
		delete next.furiganaText;
		next.pronunciationFirst = true;
		return next;
	};

	const swapCache = new WeakMap();
	const arrayCache = new WeakMap();

	/**
	 * Returns a display copy of the lines with original and pronunciation
	 * swapped. Unchanged lines and repeated calls keep object identity.
	 */
	const applyToLines = (lines, options = {}) => {
		if (!Array.isArray(lines) || lines.length === 0) return lines;
		const timed = options.timed || null;
		const signature = (options.karaoke === true ? "k" : "l") + (options.lineLevel === false ? "0" : "1");
		const cachedArray = arrayCache.get(lines);
		if (cachedArray && cachedArray.timed === timed && cachedArray.signature === signature) return cachedArray.result;
		let changed = false;
		const result = lines.map((line, index) => {
			if (!line || typeof line !== "object") return line;
			const cached = swapCache.get(line);
			if (cached && cached.index === index && cached.timed === timed && cached.signature === signature) {
				if (cached.value !== line) changed = true;
				return cached.value;
			}
			const value = swapLine(line, index, { ...options, timed });
			swapCache.set(line, { index, timed, signature, value });
			if (value !== line) changed = true;
			return value;
		});
		const output = changed ? result : lines;
		arrayCache.set(lines, { timed, signature, result: output });
		return output;
	};

	// ---------------------------------------------------------------------
	// Pronunciation fill
	// ---------------------------------------------------------------------

	// Units of one pronunciation row: the part of the pronunciation sung
	// during each karaoke unit, with that unit's timing. Empty parts are
	// left out; joined, the units give the row's pronunciation.
	const buildFillUnits = (syllables, parts) => {
		const units = [];
		syllables.forEach((syllable, index) => {
			const text = parts[index] || "";
			if (!text) return;
			const startTime = Number(syllable?.startTime);
			const endTime = Number(syllable?.endTime ?? syllable?.startTime);
			if (!Number.isFinite(startTime)) return;
			units.push({ text, startTime, endTime: Number.isFinite(endTime) ? Math.max(startTime, endTime) : startTime });
		});
		return units;
	};

	const fillLine = (line, lineIndex, timed) => {
		if (!line || typeof line !== "object") return line;
		const groups = getUnitGroups(line);
		// A lead without timed background voices is drawn as the line itself.
		const parallel = groups.some((group) => group.key.startsWith("bg:"));
		let next = null;
		for (const group of groups) {
			if (!group.pronunciation) continue;
			const units = buildFillUnits(group.syllables, getGroupParts(timed, lineIndex, group));
			if (!units.length) continue;
			next ??= { ...line };
			if (group.key === "line" || (group.key === "lead" && !parallel)) {
				next.phoneticUnits = units;
			} else if (group.key === "lead") {
				next.vocals = { ...(next.vocals || line.vocals) };
				next.vocals.lead = { ...line.vocals.lead, phoneticUnits: units };
			} else {
				const index = Number(group.key.slice(3));
				next.vocals = { ...(next.vocals || line.vocals) };
				const background = (next.vocals.background || []).slice();
				background[index] = { ...line.vocals.background[index], phoneticUnits: units };
				next.vocals.background = background;
			}
		}
		return next || line;
	};

	const fillArrayCache = new WeakMap();

	/**
	 * Display copy of karaoke lines whose pronunciation rows carry timed
	 * units ("phoneticUnits"); the text shown is unchanged.
	 */
	const applyFillToLines = (lines, options = {}) => {
		if (!Array.isArray(lines) || lines.length === 0) return lines;
		const timed = options.timed || null;
		const cached = fillArrayCache.get(lines);
		if (cached && cached.timed === timed) return cached.result;
		let changed = false;
		const result = lines.map((line, index) => {
			const value = fillLine(line, index, timed);
			if (value !== line) changed = true;
			return value;
		});
		const output = changed ? result : lines;
		fillArrayCache.set(lines, { timed, result: output });
		return output;
	};

	// ---------------------------------------------------------------------
	// AI timing
	// ---------------------------------------------------------------------

	const hashText = (text) => {
		let hash = 2166136261;
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return (hash >>> 0).toString(36) + text.length.toString(36);
	};

	const roundTime = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);

	/** Units and pronunciation of every timed group that has a pronunciation. */
	const buildTimingItems = (lines) => {
		const items = [];
		(Array.isArray(lines) ? lines : []).forEach((line, lineIndex) => {
			for (const group of getUnitGroups(line)) {
				if (!group.pronunciation) continue;
				const units = group.syllables.map((syllable) => {
					const start = roundTime(syllable?.startTime);
					const end = Math.max(start, roundTime(syllable?.endTime ?? syllable?.startTime));
					return [String(syllable?.text ?? ""), start, end];
				});
				if (!units.some((unit) => unit[0].trim())) continue;
				items.push({ key: lineIndex + ":" + group.key, r: group.pronunciation, u: units });
			}
		});
		return items;
	};

	const timedByTrack = new Map();
	let requestSequence = 0;

	// Content hash of the timing items of a lines array. A stored split is
	// only used for lines with the same units and pronunciation, so a new
	// pronunciation or new timing never shows a split made for older lines.
	const itemsHashCache = new WeakMap();
	const itemsHashOf = (lines, items = null) => {
		if (!Array.isArray(lines)) return "";
		let hash = itemsHashCache.get(lines);
		if (hash === undefined) {
			hash = hashText(JSON.stringify(items || buildTimingItems(lines)));
			itemsHashCache.set(lines, hash);
		}
		return hash;
	};

	const rememberTrack = (trackUri, entry) => {
		timedByTrack.delete(trackUri);
		timedByTrack.set(trackUri, entry);
		while (timedByTrack.size > MAX_REMEMBERED_TRACKS) {
			timedByTrack.delete(timedByTrack.keys().next().value);
		}
	};

	/** AI unit timing for the track, when it was made for the given lines. */
	const getTimed = (trackUri, lines = null) => {
		const entry = timedByTrack.get(trackUri);
		if (entry?.status !== "ready") return null;
		if (lines && itemsHashOf(lines) !== entry.itemsHash) return null;
		return entry.parts;
	};

	const emitStatus = (trackUri, requestId, phase) => {
		window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { uri: trackUri, requestId, phase } }));
	};

	const getStatuses = (trackUri) => {
		const entry = timedByTrack.get(trackUri);
		return entry?.status === "pending" && entry.announced
			? [{ uri: trackUri, requestId: entry.requestId, phase: "generating" }]
			: [];
	};

	const readCache = async (trackId, targetLang, sourceLang, signature) => {
		try {
			const data = await window.LyricsService?.getWordSupplements?.(trackId, targetLang, sourceLang, CACHE_KIND, signature);
			if (data && typeof data === "object" && data.entries && typeof data.entries === "object") {
				return new Map(Object.entries(data.entries));
			}
		} catch { /* a miss behaves like no cache */ }
		return null;
	};

	const writeCache = (trackId, targetLang, sourceLang, signature, parts) => {
		try {
			window.LyricsService?.cacheWordSupplements?.(trackId, targetLang, sourceLang, CACHE_KIND, signature, {
				entries: Object.fromEntries(parts),
			})?.catch?.(() => {});
		} catch { /* persistence never blocks display */ }
	};

	/**
	 * Requests AI unit timing for karaoke lines once per pronunciation
	 * revision. Lines keep their proportional timing until it arrives.
	 */
	const ensureTimed = ({ trackUri, lines, karaokeSource = null, targetLang = "", sourceLang = "auto", notation = "" } = {}) => {
		if (!trackUri || !needsTiming() || PSEUDO_KARAOKE_SOURCES.has(karaokeSource)) return null;
		const items = buildTimingItems(lines);
		if (items.length === 0) return null;
		const signature = hashText(JSON.stringify([CACHE_KIND, targetLang, notation, items]));
		const existing = timedByTrack.get(trackUri);
		const itemsHash = itemsHashOf(lines, items);
		if (existing?.signature === signature) return existing;

		requestSequence += 1;
		const entry = {
			signature,
			itemsHash,
			requestId: "pronunciation-sync-" + requestSequence,
			status: "pending",
			announced: false,
			parts: null,
		};
		rememberTrack(trackUri, entry);
		const trackId = window.LyricsService?.extractTrackId?.(trackUri) || trackUri;
		const isCurrent = () => timedByTrack.get(trackUri) === entry;
		const finish = (parts, phase) => {
			if (!isCurrent()) return;
			entry.parts = parts;
			entry.status = parts ? "ready" : "failed";
			if (entry.announced) emitStatus(trackUri, entry.requestId, phase);
			if (parts) window.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: { trackUri } }));
		};

		(async () => {
			const cached = await readCache(trackId, targetLang, sourceLang, signature);
			if (cached) {
				finish(cached, "complete");
				return;
			}
			const manager = window.AIAddonManager;
			if (!isCurrent()) return;
			entry.announced = true;
			emitStatus(trackUri, entry.requestId, "generating");
			if (typeof manager?.generateTimedPronunciation !== "function") {
				finish(null, "failed");
				return;
			}
			try {
				const lyricsText = (Array.isArray(lines) ? lines : [])
					.map((line) => getLineOriginal(line).trim())
					.filter(Boolean)
					.join("\n");
				const result = await manager.generateTimedPronunciation({
					items: items.map((item, index) => ({ i: index, r: item.r, u: item.u })),
					lyricsText,
					sourceLang,
					targetLang,
				});
				const parts = new Map();
				items.forEach((item, index) => {
					const value = result?.get?.(index);
					if (isValidParts(value, item.u.length)) parts.set(item.key, value);
				});
				if (parts.size === 0) throw new Error("AI returned no usable pronunciation timing");
				writeCache(trackId, targetLang, sourceLang, signature, parts);
				finish(parts, "complete");
			} catch (error) {
				console.warn("[ivLyrics] Pronunciation timing failed:", error?.message || error);
				finish(null, "failed");
			}
		})();
		return entry;
	};

	const clearTrack = (trackUri) => {
		if (trackUri) timedByTrack.delete(trackUri);
		else timedByTrack.clear();
	};

	window.ivLyricsPronunciationFirst = Object.freeze({
		initialized: true,
		SETTING,
		FILL_SETTING,
		CHANGED_EVENT,
		UPDATED_EVENT,
		STATUS_EVENT,
		isEnabled,
		isFillEnabled,
		needsTiming,
		setEnabled,
		toggle,
		getUnitGroups,
		distribute,
		normalizeParts,
		alignParts,
		swapLine,
		applyToLines,
		applyFillToLines,
		buildTimingItems,
		ensureTimed,
		getTimed,
		getStatuses,
		clearTrack,
	});
})();
