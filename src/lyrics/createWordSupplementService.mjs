import { LRUCache } from "../core/LRUCache.mjs";
import { createWordSupplementBatcher } from "./createWordSupplementBatcher.mjs";
import { getWordSupplementTrackId } from "./wordSupplementRuntime.mjs";

// Fetch and cache per-word readings and glosses for karaoke and share images.
export function createWordSupplementService({
	getLyricsService, getTranslationModes, getDetectedLanguage, getVisualSettings,
	getInterfaceLanguage, getNotationService, getAiManager, getTrackUri, readStoredSetting,
	emit, logger = console, schedule = setTimeout, cancelTimer = clearTimeout,
}) {
	const SUITABLE_BASE_LANGS = new Set(["ja", "ko", "zh"]);

	const readingCache = new LRUCache(400);
	const glossCache = new LRUCache(200);
	// Clearing every track also resets the shared batcher and breaker.
	let cacheGeneration = 0;
	// In-flight promises keyed like the memory caches. Caches only store
	// completed results, so without sharing, the supplement retry effect
	// (and a prefetch racing a line mount) would enqueue the same words a
	// second time while the original batch promise is still pending.
	const pendingReadings = new Map();
	const pendingGlosses = new Map();
	// Share one promise per cache key while a request is in flight: callers
	// arriving before settlement join it instead of enqueuing a duplicate
	// batch (empty results are also the loading state, so the retry effect
	// cannot tell them apart on its own). The token guard only removes our
	// own entry, so an invalidation retires that request without clearing a
	// newer entry under the same key.
	const sharePending = (map, cacheKey, wanted, start) => {
		const existing = map.get(cacheKey);
		if (existing) {
			existing.consumers.add(wanted);
			return existing.promise;
		}
		const request = { consumers: new Set([wanted]), promise: null };
		const isCurrent = () => map.get(cacheKey) === request;
		const isWanted = () => isCurrent() && Array.from(request.consumers).some(consumer => !consumer || consumer());
		map.set(cacheKey, request);
		request.promise = start({ isCurrent, isWanted }).finally(() => {
			if (isCurrent()) map.delete(cacheKey);
		});
		return request.promise;
	};

	const wordBatcher = createWordSupplementBatcher({
		getGeneration: () => cacheGeneration,
		emit, logger, schedule, cancelTimer,
	});
	const { enqueueWordBatch, isAiCoolingDown, getAiStatus } = wordBatcher;

	// Persistent cache (IndexedDB, same store/expiry as line translations):
	// per-line entries keyed by content hash, so lyric edits never serve
	// stale words and restarts never regenerate.
	const hashWords = (parts) => {
		const text = (Array.isArray(parts) ? parts : [parts])
			.map((part) => String(part ?? ""))
			.join("\\u0001");
		let hash = 2166136261;
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return (hash >>> 0).toString(36);
	};
	// Every caller resolves its track identity once, at entry, and passes it
	// through: prefetching track B while A plays must not key caches by A,
	// and a cache write that lands after playback changed must still use the
	// requesting track's ID.
	const persistentGet = async (kind, { targetLang, sourceLang, words, extra = "", trackId = "" }) => {
		try {
			if (!trackId) return null;
			const service = getLyricsService();
			if (typeof service?.getWordSupplements !== "function") return null;
			const sourceHash = hashWords([kind, targetLang, sourceLang, extra, ...words]);
			const data = await service.getWordSupplements(trackId, targetLang, sourceLang, kind, sourceHash);
			if (Array.isArray(data) && data.length === words.length) {
				return { sourceHash, values: data.map((value) => String(value ?? "")) };
			}
		} catch { /* cache miss behaves like absence */ }
		return null;
	};
	const persistentSet = (kind, { targetLang, sourceLang, words, extra = "", values, trackId = "" }) => {
		try {
			if (!trackId || !Array.isArray(values) || values.length !== words.length) return;
			const service = getLyricsService();
			if (typeof service?.cacheWordSupplements !== "function") return;
			const sourceHash = hashWords([kind, targetLang, sourceLang, extra, ...words]);
			service.cacheWordSupplements(
				trackId,
				targetLang,
				sourceLang,
				kind,
				sourceHash,
				values.map((value) => String(value ?? ""))
			)?.catch?.(() => {});
		} catch { /* persistence must never break rendering */ }
	};

	// Same-language passthrough: a word already readable/written in the
	// output language carries no information as an annotation (e.g. English
	// "bad" inside a Japanese line shown to an English reader). Skip it so
	// the column stays clean — and never pay AI tokens for it.
	const LATIN_SCRIPT_LANGS = new Set([
		"en", "es", "fr", "de", "it", "pt", "nl", "id", "ms", "vi", "tr",
		"sv", "da", "fi", "no", "nb", "nn", "hu", "ro", "cs", "pl", "sk",
		"sl", "hr", "sr", "bs", "ca", "gl", "eu", "cy", "ga", "mt", "sw",
		"tl", "haw", "la",
	]);
	const isLatinWord = (word) => {
		const value = String(word ?? "");
		if (!/[\p{Script=Latin}]/u.test(value)) return false;
		return /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]*$/u.test(value);
	};
	const isGlossPassthrough = (word, targetLang) =>
		isLatinWord(word) && LATIN_SCRIPT_LANGS.has(baseLanguage(targetLang));
	const isReadingPassthrough = (word, notation) =>
		String(notation || "latin").trim().toLowerCase() !== "ipa" && isLatinWord(word);
	const sameText = (left, right) =>
		String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
	// Include the Chinese pinyin tone format in the reading context so
	// entries made before tone marks were supported cannot be restored.
	const CHINESE_TONES_LANG_RE = /^(zh|cmn|yue|cn|tw|hk)(?:-|$)/i;
	const zhToneCacheFlag = (lang) =>
		CHINESE_TONES_LANG_RE.test(String(lang || "").trim().toLowerCase()) ? ":zh-tones" : "";
	// Split units into AI-worthy words; reinsert "" for passthrough words.
	const partitionWords = (units, skip) => {
		const active = [];
		const activeIndexes = [];
		units.forEach((unit, index) => {
			if (skip(unit.surface)) return;
			active.push(unit.surface);
			activeIndexes.push(index);
		});
		return { active, activeIndexes };
	};
	// Lyric word units can carry surrounding punctuation: a quoted
	// “日々” arrives as one unit. Converters and AI prompts need the
	// bare core — quotes break exact-match prefix stripping and same-text
	// filtering, which empties both the gloss and the reading for the word.
	const stripEdgePunctuation = (value) => String(value ?? "")
		.replace(/^[^\p{L}\p{N}]+/u, "")
		.replace(/[^\p{L}\p{N}]+$/u, "");
	// Map a partition to its query cores, dropping punctuation-only units
	// (e.g. a lone quote char) whose core is empty.
	const coreActiveWords = (partition) => {
		const coreIndexes = [];
		const cores = [];
		partition.active.forEach((surface, position) => {
			const core = stripEdgePunctuation(surface);
			if (!core) return;
			coreIndexes.push(partition.activeIndexes[position]);
			cores.push(core);
		});
		return { coreIndexes, cores };
	};
	// Hide echoes of the queried word, whether the backend echoed the raw
	// unit (“日々”) or its core (日々).
	const isEchoOf = (value, surface, core) =>
		sameText(value, core) || sameText(value, surface);
	const reinsertSkipped = (unitCount, activeIndexes, activeValues) => {
		const output = new Array(unitCount).fill("");
		activeIndexes.forEach((unitIndex, activePosition) => {
			output[unitIndex] = String(activeValues?.[activePosition] ?? "");
		});
		return output;
	};
	// Track-level batching: lines mounting together (one track load) share a
	// single AI request per kind instead of one request per line. Without
	// this, N lines x 2 kinds x provider retries x provider fallback = spam.
	const normalizeLanguage = (language) => {
		try {
			const helper = getTranslationModes();
			if (helper?.normalizeLanguage) {
				return helper.normalizeLanguage(language);
			}
		} catch { /* fall through */ }
		return String(language ?? "").trim().toLowerCase().replace(/_/g, "-");
	};

	const baseLanguage = (language) =>
		String(language || "").toLowerCase().replace(/_/g, "-").split("-")[0];

	const getSourceLanguage = () => {
		try {
			const detected = getDetectedLanguage();
			if (detected) return String(detected);
		} catch { /* ignore */ }
		return "auto";
	};

	// Global detection can be "auto" in some views (e.g. before the page
	// pipeline runs). Infer from the line text so per-line stacks still work.
	// Kana and Hangul are unambiguous: a line containing them is Japanese
	// or Korean no matter how many English words surround them (mixed lines
	// like "これが all I see" must not resolve to English).
	const inferLanguageFromText = (text) => {
		const value = String(text ?? "");
		if (!value.trim()) return "auto";
		if (/[\u3040-\u30ff]/u.test(value)) return "ja";
		if (/[\uac00-\ud7af]/u.test(value)) return "ko";
		const hasHan = /\p{Script=Han}/u.test(value);
		try {
			const detected = getLyricsService()?.detectLanguage?.([{ text: value }]);
			if (detected && String(detected).toLowerCase() !== "auto") {
				const normalized = String(detected);
				// A line containing Han is CJK no matter how much Latin
				// surrounds it: single-line detection votes by per-character
				// majority, so a kanji hook with an English tail (e.g.
				// "限界突破 I'm goin' nonstop") resolves to "en" and the line
				// is filtered before any word request is ever sent. Ignore
				// Latin votes for Han lines and fall through below.
				if (!(hasHan && LATIN_SCRIPT_LANGS.has(baseLanguage(normalized)))) {
					return normalized;
				}
			}
		} catch { /* fall through to script inference */ }
		if (hasHan) {
			// Kanji alone cannot tell Japanese from Chinese. Prefer the
			// song's language when it is CJK, else the CJK language the
			// user actually configured supplements for, else the legacy
			// default.
			try {
				const global = getSourceLanguage();
				if (isSuitableSourceLanguage(global)) return String(global);
			} catch { /* ignore */ }
			try {
				const configured = preferredConfiguredCjkLanguage();
				if (configured) return configured;
			} catch { /* ignore */ }
			return "zh";
		}
		return "auto";
	};

	// Song-level detection wins when available; per-line inference rescues
	// views where the global value is still "auto". This also keeps
	// mixed-language songs correct line by line.
	const resolveSourceLanguage = (lineText = "") => {
		const global = getSourceLanguage();
		if (isSuitableSourceLanguage(global)) return global;
		const inferred = inferLanguageFromText(lineText);
		if (isSuitableSourceLanguage(inferred)) return inferred;
		return global;
	};

	const isSuitableSourceLanguage = (language) => {
		const normalized = normalizeLanguage(language ?? getSourceLanguage());
		return SUITABLE_BASE_LANGS.has(baseLanguage(normalized));
	};

	// For Han-only lines (no kana/Hangul) the script alone cannot tell
	// Japanese from Chinese. Pick the CJK language the user configured
	// word supplements for so the line uses the right mode slots instead
	// of the legacy hardcoded default. Returns null when zero or more
	// than one CJK language is configured (ambiguous).
	const preferredConfiguredCjkLanguage = () => {
		const candidates = [
			{ code: "ja", key: "japanese" },
			{ code: "ko", key: "korean" },
			{ code: "zh", key: "chinese" },
		];
		let found = null;
		try {
			const visual = getVisualSettings() || {};
			for (const { code, key } of candidates) {
				const modes = [visual[`translation-mode:${key}`], visual[`translation-mode-2:${key}`]];
				const wanted = modes.some((mode) => mode && String(mode).trim().toLowerCase() !== "none");
				if (wanted) {
					if (found) return null;
					found = code;
				}
			}
		} catch { return null; }
		return found;
	};

	const getFriendlyModeKey = (sourceLang) => {
		try {
			const base = baseLanguage(sourceLang || getSourceLanguage());
			if (!base || base === "auto") return "gemini";
			const name = new Intl.DisplayNames(["en"], { type: "language" }).of(base);
			return (name || "gemini").toLowerCase();
		} catch {
			return "gemini";
		}
	};

	const getConfiguredModes = (sourceLang) => {
		const modeKey = getFriendlyModeKey(sourceLang);
		const visual = getVisualSettings() || {};
		return {
			modeKey,
			mode1: visual[`translation-mode:${modeKey}`] ?? null,
			mode2: visual[`translation-mode-2:${modeKey}`] ?? null,
		};
	};

	const resolveReadingMode = (sourceLang) => {
		const helper = getTranslationModes();
		if (!helper) return null;
		const { mode1, mode2 } = getConfiguredModes(sourceLang);
		for (const mode of [mode1, mode2]) {
			if (mode && helper.isPronunciationMode(mode)) return mode;
		}
		return null;
	};

	const isGlossModeActive = (sourceLang) => {
		const helper = getTranslationModes();
		if (!helper) return false;
		const resolved = sourceLang || getSourceLanguage();
		const { mode1, mode2 } = getConfiguredModes(resolved);
		return [mode1, mode2].some(
			(mode) => mode && mode !== "none" && !helper.isPronunciationMode(mode)
		);
	};

	const getGlossTargetLanguage = () => {
		try {
			const configured =
				getVisualSettings()?.["translate:target-language"] ||
				readStoredSetting("ivLyrics:visual:translate:target-language");
			if (configured && configured !== "auto") return configured;
		} catch { /* ignore */ }
		try {
			return (
				getInterfaceLanguage() ||
				getVisualSettings()?.language ||
				"en"
			);
		} catch {
			return "en";
		}
	};

	// Group timed chars by karaokeWordIndex into ordered word units.
	// Returns [{ wordKey, surface }] where wordKey is the karaokeWordIndex
	// (or char index fallback) and surface is the exact source substring.
	const getWordUnits = (timedChars) => {
		if (!Array.isArray(timedChars) || timedChars.length === 0) return [];
		const groups = new Map();
		const order = [];
		timedChars.forEach((charInfo, charIndex) => {
			const char = String(charInfo?.char ?? "");
			if (!char || /^\s+$/u.test(char)) return;
			const wordKey = Number.isInteger(charInfo?.karaokeWordIndex)
				? charInfo.karaokeWordIndex
				: `c${charIndex}`;
			if (!groups.has(wordKey)) {
				groups.set(wordKey, { wordKey, surface: "" });
				order.push(wordKey);
			}
			groups.get(wordKey).surface += char;
		});
		return order
			.map((wordKey) => groups.get(wordKey))
			.filter((unit) => unit && unit.surface);
	};

	const getLineKey = (line, units) => {
		const explicit =
			line?.syncId ?? line?.id ?? line?.startTime ?? line?.text ?? "";
		return `${String(explicit)}::${units.map((unit) => unit.surface).join("\u0001")}`;
	};

	const getPronunciationNotation = () => {
		try {
			const configured =
				getVisualSettings()?.["translate:pronunciation-notation"] ||
				readStoredSetting("ivLyrics:visual:translate:pronunciation-notation");
			const normalized = String(configured || "").trim().toLowerCase();
			if (normalized === "ipa") return "ipa";
		} catch { /* ignore */ }
		try {
			const notation = getNotationService();
			if (typeof notation?.getCurrent === "function") {
				return notation.getCurrent() === "ipa" ? "ipa" : "latin";
			}
		} catch { /* ignore */ }
		return "latin";
	};

	const isAiReadingMode = (mode) =>
		String(mode ?? "").trim().toLowerCase().startsWith("gemini");

	const getWordReadings = async (units, language, mode, lineText = "", options = {}) => {
		if (!units.length || !language || !mode) return units.map(() => "");
		// Synchronous, before any await: cache reads/writes below must keep
		// this track's identity even if playback changes mid-flight.
		const trackId = resolveTrackId(options);
		const generation = cacheGeneration;
		const notation = getPronunciationNotation();
		const targetLang = getGlossTargetLanguage();
		const sourceText = String(lineText || "");
		// AI pronunciation modes (e.g. gemini_romaji) have no local converter:
		// request per-word pronunciation from the AI provider instead.
		if (isAiReadingMode(mode)) {
			const manager = getAiManager();
			if (typeof manager?.generateWordPronunciation !== "function") {
				return units.map(() => "");
			}
			if (isAiCoolingDown()) return units.map(() => "");
			const cacheKey = JSON.stringify([
				trackId, "ai", normalizeLanguage(language), String(mode).toLowerCase(),
				targetLang, notation, sourceText, units.map((unit) => unit.surface)
			]);
			const cacheExtra = JSON.stringify([mode, targetLang, sourceText, zhToneCacheFlag(language)]);
			if (readingCache.has(cacheKey)) return readingCache.get(cacheKey);
			const { active, activeIndexes } = partitionWords(units, (surface) =>
				isReadingPassthrough(surface, notation)
			);
			if (active.length === 0) {
				const skipped = units.map(() => "");
				readingCache.set(cacheKey, skipped);
				return skipped;
			}
			const { coreIndexes, cores } = coreActiveWords({ active, activeIndexes });
			if (cores.length === 0) {
				const skipped = units.map(() => "");
				readingCache.set(cacheKey, skipped);
				return skipped;
			}
			return sharePending(pendingReadings, cacheKey, options.wanted, async ({ isCurrent, isWanted }) => {
				const persisted = await persistentGet("reading", {
					targetLang: notation,
					sourceLang: language,
					words: cores,
					extra: cacheExtra,
					trackId,
				});
				if (!isCurrent()) return units.map(() => "");
				if (persisted) {
					const restored = reinsertSkipped(units.length, coreIndexes, persisted.values);
					readingCache.set(cacheKey, restored);
					return restored;
				}
				const batchKey = JSON.stringify(["pron", trackId, normalizeLanguage(language), targetLang, notation, mode]);
				const slice = await enqueueWordBatch({
					kind: "pronunciation",
					batchKey,
					generation,
					isWanted,
					words: cores,
					lineText: sourceText,
					run: (allWords, allLineTexts) => manager.generateWordPronunciation({
						words: allWords,
						lineText: allLineTexts.join("\n"),
						targetLang,
						sourceLang: language,
						notation,
					}),
				});
				if (!slice || !isCurrent()) return units.map(() => "");
				const activeReadings = cores.map((core, corePosition) => {
					const reading = String(slice[corePosition] ?? "").trim();
					const surface = units[coreIndexes[corePosition]]?.surface;
					return reading && !isEchoOf(reading, surface, core) ? reading : "";
				});
				const normalized = reinsertSkipped(units.length, coreIndexes, activeReadings);
				// An all-empty reply (echoes, blanks) is not worth caching:
				// keep the retry path effective for this line.
				if (!normalized.some((value) => String(value ?? "").trim())) return normalized;
				readingCache.set(cacheKey, normalized);
				// Persist the active subset (same shape as the lookup key);
				// the full-width array is only the render shape.
				persistentSet("reading", {
					targetLang: notation,
					sourceLang: language,
					words: cores,
					extra: cacheExtra,
					values: activeReadings,
					trackId,
				});
				return normalized;
			});
		}
		const helper = getTranslationModes();
		if (!helper?.convertTraditional) return units.map(() => "");
		const cacheKey = JSON.stringify([
			trackId, "local", normalizeLanguage(language), String(mode).toLowerCase(),
			notation, units.map((unit) => unit.surface)
		]);
		if (readingCache.has(cacheKey)) return readingCache.get(cacheKey);
		const localNotation = notation;
		const localPartition = partitionWords(units, (surface) =>
			isReadingPassthrough(surface, localNotation)
		);
		if (localPartition.active.length === 0) {
			const skippedLocal = units.map(() => "");
			readingCache.set(cacheKey, skippedLocal);
			return skippedLocal;
		}
		const { coreIndexes: localCoreIndexes, cores: localCores } = coreActiveWords(localPartition);
		if (localCores.length === 0) {
			const skippedLocal = units.map(() => "");
			readingCache.set(cacheKey, skippedLocal);
			return skippedLocal;
		}
		return sharePending(pendingReadings, cacheKey, options.wanted, async ({ isCurrent, isWanted }) => {
			const persistedLocal = await persistentGet("reading", {
				targetLang: localNotation,
				sourceLang: language,
				words: localCores,
				extra: mode,
				trackId,
			});
			if (!isCurrent()) return units.map(() => "");
			if (persistedLocal) {
				const restoredLocal = reinsertSkipped(units.length, localCoreIndexes, persistedLocal.values);
				readingCache.set(cacheKey, restoredLocal);
				return restoredLocal;
			}
			if (!isWanted()) return units.map(() => "");
			try {
				const converted = await helper.convertTraditional({
					language,
					mode,
					texts: localCores,
				});
				if (!isCurrent()) return units.map(() => "");
				const activeReadings = localCores.map((core, corePosition) => {
					const reading = String(converted?.[corePosition] ?? "").trim();
					// A no-op conversion (e.g. kana in -> kana out unchanged for a
					// symbol) carries no information; hide it to reduce noise.
					const surface = units[localCoreIndexes[corePosition]]?.surface;
					return reading && !isEchoOf(reading, surface, core) ? reading : "";
				});
				const readings = reinsertSkipped(units.length, localCoreIndexes, activeReadings);
				// Same no-cache rule as the AI branch above.
				if (!readings.some((value) => String(value ?? "").trim())) return readings;
				readingCache.set(cacheKey, readings);
				persistentSet("reading", {
					targetLang: localNotation,
					sourceLang: language,
					words: localCores,
					extra: mode,
					values: activeReadings,
					trackId,
				});
				return readings;
			} catch (error) {
				logger.warn("[ivLyrics] Word reading conversion failed:", error?.message || error);
				return units.map(() => "");
			}
		});
	};

	// Explicit target wins (prefetch knows which track it is warming);
	// otherwise fall back to the currently playing track (render path).
	const resolveTrackId = (options) => {
		const explicit = getWordSupplementTrackId(options?.trackId);
		if (explicit) return explicit;
		try {
			return getWordSupplementTrackId(getTrackUri());
		} catch {
			return "";
		}
	};

	const getWordGlosses = async (units, lineText, sourceLang, options = {}) => {
		const empty = units.map(() => "");
		const generation = cacheGeneration;
		const sourceText = String(lineText || "");
		// Synchronous, before any await: gloss cache keys, batch keys and
		// persistent writes must all agree on the requesting track.
		const trackId = resolveTrackId(options);
		const resolvedSourceLang = sourceLang || getSourceLanguage();
		if (!units.length || !isGlossModeActive(resolvedSourceLang)) return empty;
		const manager = getAiManager();
		if (typeof manager?.generateWordGloss !== "function") return empty;
		if (isAiCoolingDown()) return empty;
		const targetLang = getGlossTargetLanguage();
		const sourceLangKey = resolvedSourceLang;
		const cacheKey = JSON.stringify([trackId, targetLang, sourceLangKey, units.map((unit) => unit.surface), sourceText]);
		if (glossCache.has(cacheKey)) return glossCache.get(cacheKey);
		const glossPartition = partitionWords(units, (surface) =>
			isGlossPassthrough(surface, targetLang)
		);
		if (glossPartition.active.length === 0) {
			glossCache.set(cacheKey, empty);
			return empty;
		}
		const { coreIndexes: glossCoreIndexes, cores: glossCores } = coreActiveWords(glossPartition);
		if (glossCores.length === 0) {
			glossCache.set(cacheKey, empty);
			return empty;
		}
		return sharePending(pendingGlosses, cacheKey, options.wanted, async ({ isCurrent, isWanted }) => {
			const persisted = await persistentGet("gloss", {
				targetLang,
				sourceLang: sourceLangKey,
				words: glossCores,
				extra: sourceText,
				trackId,
			});
			if (!isCurrent()) return empty;
			if (persisted) {
				const restored = reinsertSkipped(units.length, glossCoreIndexes, persisted.values);
				glossCache.set(cacheKey, restored);
				return restored;
			}
			const batchKey = `gloss::${trackId}::${targetLang}::${sourceLangKey}`;
			const slice = await enqueueWordBatch({
				kind: "gloss",
				batchKey,
				generation,
				isWanted,
				words: glossCores,
				lineText: sourceText,
				run: (allWords, allLineTexts) => manager.generateWordGloss({
					words: allWords,
					lineText: allLineTexts.join("\n"),
					targetLang,
					sourceLang: sourceLangKey,
				}),
			});
			if (!slice || !isCurrent()) return empty;
			const activeGlosses = glossCores.map((core, corePosition) => {
				const gloss = String(slice[corePosition] ?? "").trim();
				const surface = units[glossCoreIndexes[corePosition]]?.surface;
				return gloss && !isEchoOf(gloss, surface, core) ? gloss : "";
			});
			const normalized = reinsertSkipped(units.length, glossCoreIndexes, activeGlosses);
			// Same no-cache rule as the reading branches above.
			if (!normalized.some((value) => String(value ?? "").trim())) return normalized;
			glossCache.set(cacheKey, normalized);
			persistentSet("gloss", {
				targetLang,
				sourceLang: sourceLangKey,
				words: glossCores,
				extra: sourceText,
				values: activeGlosses,
				trackId,
			});
			return normalized;
		});
	};

	function clearCaches(identifier) {
		const trackId = getWordSupplementTrackId(identifier);
		const caches = [readingCache, glossCache, pendingReadings, pendingGlosses];
		if (trackId) {
			const prefix = `[${JSON.stringify(trackId)},`;
			for (const cache of caches) {
				for (const key of cache.keys()) {
					if (key.startsWith(prefix)) cache.delete(key);
				}
			}
			return;
		}
		cacheGeneration += 1;
		for (const cache of caches) cache.clear();
		wordBatcher.clear();
	}

	return Object.freeze({
		initialized: true,
		isSuitableSourceLanguage,
		getSourceLanguage,
		inferLanguageFromText,
		resolveSourceLanguage,
		resolveReadingMode,
		isGlossModeActive,
		getGlossTargetLanguage,
		getPronunciationNotation,
		isAiCoolingDown,
		getAiStatus,
		getWordUnits,
		getLineKey,
		getWordReadings,
		getWordGlosses,
		clearCaches,
		invalidate: (identifier) => {
			const trackId = getWordSupplementTrackId(identifier);
			clearCaches(trackId);
			try {
				emit("ivLyrics:word-supplements-invalidated", trackId ? { trackId } : undefined);
			} catch { /* ignore */ }
		},
	});
}
