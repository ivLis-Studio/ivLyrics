// Assign pronunciation to existing timed vocal units and build the display
// rows for pronunciation-first and pronunciation fill.
export function createPronunciationPresentation(readGraphemeSegmenter) {
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
			const segmenter = readGraphemeSegmenter();
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
	// left out; joined, the units give the row's pronunciation. A unit also
	// carries the range speaker of the syllable it was sung on, so the
	// pronunciation keeps the line's per-range colours.
	const buildFillUnits = (syllables, parts) => {
		const units = [];
		syllables.forEach((syllable, index) => {
			const text = parts[index] || "";
			if (!text) return;
			const startTime = Number(syllable?.startTime);
			const endTime = Number(syllable?.endTime ?? syllable?.startTime);
			if (!Number.isFinite(startTime)) return;
			const unit = {
				text,
				startTime,
				endTime: Number.isFinite(endTime) ? Math.max(startTime, endTime) : startTime,
			};
			const speaker = syllable?.inlineStyle === true ? String(syllable?.styleSpeaker || "").trim() : "";
			if (speaker) {
				unit.inlineStyle = true;
				unit.styleSpeaker = speaker;
				if (syllable.styleSpeakerColor) unit.styleSpeakerColor = String(syllable.styleSpeakerColor);
				if (syllable.styleSpeakerFallback) unit.styleSpeakerFallback = String(syllable.styleSpeakerFallback);
			}
			units.push(unit);
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

	return {
		getLineOriginal, getUnitGroups, distribute, normalizeParts, isValidParts, alignParts,
		swapLine, applyToLines, applyFillToLines,
	};
}
