// Word-level supplements for karaoke lines: per-word gloss + per-word reading.
//
// Arrangement (top to bottom) per user request:
//   1. original word (karaoke animated, existing char elements)
//   2. per-word gloss (AI translation of that word in context)
//   3. per-word reading (local pronunciation conversion of that word)
//   4. full-line translation (existing line-level subText2, untouched)
//
// Only enabled for suitable source languages (ja/ko/zh). Word units are the
// existing karaoke word units (karaokeWordIndex), so highlight and annotations
// can never drift apart.
(function IvLyricsWordLevelSupplements() {
	"use strict";

	if (window.ivLyricsWordSupplements?.initialized) return;

	const SUITABLE_BASE_LANGS = new Set(["ja", "ko", "zh"]);

	const readingCache = new Map();
	const glossCache = new Map();
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
	// own entry, so clearCaches() emptying the map cannot delete a newer
	// request's bookkeeping — a settled failure always frees the key again.
	const sharePending = (map, cacheKey, start) => {
		const existing = map.get(cacheKey);
		if (existing) return existing;
		const shared = start().finally(() => {
			if (map.get(cacheKey) === shared) map.delete(cacheKey);
		});
		map.set(cacheKey, shared);
		return shared;
	};

	// Circuit breaker: the word backend is one AI gateway for every line, so
	// a few consecutive failures pause all word requests instead of firing
	// one failing request per line (console spam + wasted latency).
	const aiBreaker = { failures: 0, cooldownUntil: 0, lastError: "" };
	const AI_BREAKER_THRESHOLD = 3;
	const AI_BREAKER_COOLDOWN_MS = 120000;
	const isAiCoolingDown = () => Date.now() < aiBreaker.cooldownUntil;
	const noteAiSuccess = () => {
		aiBreaker.failures = 0;
		aiBreaker.cooldownUntil = 0;
		aiBreaker.lastError = "";
	};
	const noteAiFailure = (label, error) => {
		aiBreaker.failures += 1;
		aiBreaker.lastError = String(error?.message || error || "").slice(0, 200);
		console.warn(`[ivLyrics] Word ${label} failed:`, error?.message || error);
		if (aiBreaker.failures >= AI_BREAKER_THRESHOLD && !aiBreaker.cooldownUntil) {
			aiBreaker.cooldownUntil = Date.now() + AI_BREAKER_COOLDOWN_MS;
			console.warn("[ivLyrics] Word supplements paused for 120s after repeated AI failures.");
		}
	};
	const getAiStatus = () => ({
		coolingDown: isAiCoolingDown(),
		failures: aiBreaker.failures,
		lastError: aiBreaker.lastError,
	});

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
			const service = window.LyricsService;
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
			const service = window.LyricsService;
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
	// Chinese-only: AI readings now carry pinyin tone marks, so persisted word
	// pronunciations recorded before that change must not be served for
	// Chinese songs. Non-Chinese caches keep their existing keys.
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
	const WORD_BATCH_DEBOUNCE_MS = 350;
	const WORD_BATCH_MAX_WORDS = 500;
	const batchQueues = new Map();
	// Pill lifecycle for the top-left generation status stack: active while
	// any AI word batch is pending.
	let pendingWordBatches = 0;
	const emitWordLoading = (detail = {}) => {
		try {
			window.dispatchEvent?.(
				new CustomEvent("ivLyrics:word-supplements", { detail })
			);
		} catch { /* diagnostics must never break fetching */ }
	};
	const trackBatchStart = () => {
		pendingWordBatches += 1;
		if (pendingWordBatches === 1) emitWordLoading({ active: true });
	};
	const trackBatchSettle = (completed) => {
		pendingWordBatches = Math.max(0, pendingWordBatches - 1);
		if (pendingWordBatches === 0) emitWordLoading({ active: false, completed: !!completed });
	};
	const flushWordBatch = async (batchKey) => {
		const queue = batchQueues.get(batchKey);
		if (!queue || queue.items.length === 0) return;
		batchQueues.delete(batchKey);
		if (queue.timer) clearTimeout(queue.timer);
		const items = queue.items;
		trackBatchStart();
		if (isAiCoolingDown()) {
			items.forEach(({ resolve }) => resolve(null));
			trackBatchSettle(false);
			return;
		}
		const allWords = items.flatMap((item) => item.words);
		try {
			const allResults = await queue.run(allWords, items.map((item) => item.lineText));
			if (!Array.isArray(allResults) || allResults.length !== allWords.length) {
				throw new Error(
					`[ivLyrics] Word batch returned ${Array.isArray(allResults) ? allResults.length : "invalid"} results; expected ${allWords.length}`
				);
			}
			noteAiSuccess();
			let offset = 0;
			items.forEach((item) => {
				item.resolve(allResults.slice(offset, offset + item.words.length));
				offset += item.words.length;
			});
			trackBatchSettle(true);
		} catch (error) {
			if (items.length > 1) {
				// One malformed line can poison the whole batch count (model
				// merged/split lines). Retry each line on its own batch key so
				// healthy lines still resolve. Single-item failures stop here.
				console.warn(
					`[ivLyrics] Word batch failed for ${items.length} lines; retrying individually.`,
					error?.message || error
				);
				items.forEach((item, index) => {
					enqueueWordBatch({
						kind: queue.kind,
						batchKey: `${batchKey}::line${index}`,
						words: item.words,
						lineText: item.lineText,
						run: queue.run,
					}).then((slice) => item.resolve(slice));
				});
				trackBatchSettle(false);
				return;
			}
			noteAiFailure(queue.kind, error);
			items.forEach(({ resolve }) => resolve(null));
			trackBatchSettle(false);
		}
	};
	const enqueueWordBatch = ({ kind, batchKey, words, lineText, run }) => new Promise((resolve) => {
		let queue = batchQueues.get(batchKey);
		if (!queue || queue.kind !== kind) {
			if (queue?.timer) clearTimeout(queue.timer);
			// A colliding queue should not exist (kind is part of the key),
			// but never leave its items hanging if it does.
			queue?.items?.forEach?.(({ resolve }) => resolve(null));
			queue = { kind, run, timer: null, items: [], wordCount: 0 };
			batchQueues.set(batchKey, queue);
		}
		queue.items.push({ words, lineText, resolve });
		queue.wordCount += words.length;
		if (queue.wordCount >= WORD_BATCH_MAX_WORDS) {
			flushWordBatch(batchKey);
			return;
		}
		if (!queue.timer) {
			queue.timer = setTimeout(() => flushWordBatch(batchKey), WORD_BATCH_DEBOUNCE_MS);
		}
	});

	const normalizeLanguage = (language) => {
		try {
			if (window.ivLyricsTranslationModes?.normalizeLanguage) {
				return window.ivLyricsTranslationModes.normalizeLanguage(language);
			}
		} catch { /* fall through */ }
		return String(language ?? "").trim().toLowerCase().replace(/_/g, "-");
	};

	const baseLanguage = (language) =>
		String(language || "").toLowerCase().replace(/_/g, "-").split("-")[0];

	const getSourceLanguage = () => {
		try {
			const detected = window.Utils?.getDetectedLanguage?.();
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
		try {
			const detected = window.LyricsService?.detectLanguage?.([{ text: value }]);
			if (detected && String(detected).toLowerCase() !== "auto") {
				return String(detected);
			}
		} catch { /* fall through to script inference */ }
		if (/\p{Script=Han}/u.test(value)) return "zh";
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
		const visual = window.CONFIG?.visual || {};
		return {
			modeKey,
			mode1: visual[`translation-mode:${modeKey}`] ?? null,
			mode2: visual[`translation-mode-2:${modeKey}`] ?? null,
		};
	};

	const resolveReadingMode = (sourceLang) => {
		const helper = window.ivLyricsTranslationModes;
		if (!helper) return null;
		const { mode1, mode2 } = getConfiguredModes(sourceLang);
		for (const mode of [mode1, mode2]) {
			if (mode && helper.isPronunciationMode(mode)) return mode;
		}
		return null;
	};

	const isGlossModeActive = (sourceLang) => {
		const helper = window.ivLyricsTranslationModes;
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
				window.CONFIG?.visual?.["translate:target-language"] ||
				(typeof localStorage !== "undefined"
					? localStorage.getItem("ivLyrics:visual:translate:target-language")
					: null);
			if (configured && configured !== "auto") return configured;
		} catch { /* ignore */ }
		try {
			return (
				window.I18n?.getCurrentLanguage?.() ||
				window.CONFIG?.visual?.language ||
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
				window.CONFIG?.visual?.["translate:pronunciation-notation"] ||
				(typeof localStorage !== "undefined"
					? localStorage.getItem("ivLyrics:visual:translate:pronunciation-notation")
					: null);
			const normalized = String(configured || "").trim().toLowerCase();
			if (normalized === "ipa") return "ipa";
		} catch { /* ignore */ }
		try {
			if (typeof window.ivLyricsPronunciationNotation?.getCurrent === "function") {
				return window.ivLyricsPronunciationNotation.getCurrent() === "ipa" ? "ipa" : "latin";
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
		// AI pronunciation modes (e.g. gemini_romaji) have no local converter:
		// request per-word pronunciation from the AI provider instead.
		if (isAiReadingMode(mode)) {
			const manager = window.AIAddonManager;
			if (typeof manager?.generateWordPronunciation !== "function") {
				return units.map(() => "");
			}
			if (isAiCoolingDown()) return units.map(() => "");
			const cacheKey = `ai::${normalizeLanguage(language)}::${String(mode).toLowerCase()}::${getPronunciationNotation()}::${units
				.map((unit) => unit.surface)
				.join("\\u0001")}`;
			if (readingCache.has(cacheKey)) return readingCache.get(cacheKey);
			const notation = getPronunciationNotation();
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
			return sharePending(pendingReadings, cacheKey, async () => {
				const persisted = await persistentGet("reading", {
					targetLang: notation,
					sourceLang: language,
					words: cores,
					extra: `${mode}${zhToneCacheFlag(language)}`,
					trackId,
				});
				if (persisted) {
					const restored = reinsertSkipped(units.length, coreIndexes, persisted.values);
					readingCache.set(cacheKey, restored);
					return restored;
				}
				const batchKey = `pron::${trackId}::${normalizeLanguage(language)}::${getGlossTargetLanguage()}::${notation}`;
				const slice = await enqueueWordBatch({
					kind: "pronunciation",
					batchKey,
					words: cores,
					lineText: String(lineText || ""),
					run: (allWords, allLineTexts) => manager.generateWordPronunciation({
						words: allWords,
						lineText: allLineTexts.join("\n"),
						targetLang: getGlossTargetLanguage(),
						sourceLang: language,
						notation: getPronunciationNotation(),
					}),
				});
				if (!slice) return units.map(() => "");
				const activeReadings = cores.map((core, corePosition) => {
					const reading = String(slice[corePosition] ?? "").trim();
					const surface = units[coreIndexes[corePosition]]?.surface;
					return reading && !isEchoOf(reading, surface, core) ? reading : "";
				});
				const normalized = reinsertSkipped(units.length, coreIndexes, activeReadings);
				readingCache.set(cacheKey, normalized);
				if (readingCache.size > 400) {
					const firstKey = readingCache.keys().next().value;
					readingCache.delete(firstKey);
				}
				// Persist the active subset (same shape as the lookup key);
				// the full-width array is only the render shape.
				persistentSet("reading", {
					targetLang: getPronunciationNotation(),
					sourceLang: language,
					words: cores,
					extra: `${mode}${zhToneCacheFlag(language)}`,
					values: activeReadings,
					trackId,
				});
				return normalized;
			});
		}
		const helper = window.ivLyricsTranslationModes;
		if (!helper?.convertTraditional) return units.map(() => "");
		const cacheKey = `${normalizeLanguage(language)}::${String(mode).toLowerCase()}::${units
			.map((unit) => unit.surface)
			.join("\u0001")}`;
		if (readingCache.has(cacheKey)) return readingCache.get(cacheKey);
		const localNotation = getPronunciationNotation();
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
		return sharePending(pendingReadings, cacheKey, async () => {
			const persistedLocal = await persistentGet("reading", {
				targetLang: localNotation,
				sourceLang: language,
				words: localCores,
				extra: mode,
				trackId,
			});
			if (persistedLocal) {
				const restoredLocal = reinsertSkipped(units.length, localCoreIndexes, persistedLocal.values);
				readingCache.set(cacheKey, restoredLocal);
				return restoredLocal;
			}
			try {
				const converted = await helper.convertTraditional({
					language,
					mode,
					texts: localCores,
				});
				const activeReadings = localCores.map((core, corePosition) => {
					const reading = String(converted?.[corePosition] ?? "").trim();
					// A no-op conversion (e.g. kana in -> kana out unchanged for a
					// symbol) carries no information; hide it to reduce noise.
					const surface = units[localCoreIndexes[corePosition]]?.surface;
					return reading && !isEchoOf(reading, surface, core) ? reading : "";
				});
				const readings = reinsertSkipped(units.length, localCoreIndexes, activeReadings);
				readingCache.set(cacheKey, readings);
				if (readingCache.size > 400) {
					const firstKey = readingCache.keys().next().value;
					readingCache.delete(firstKey);
				}
				persistentSet("reading", {
					targetLang: getPronunciationNotation(),
					sourceLang: language,
					words: localCores,
					extra: mode,
					values: activeReadings,
					trackId,
				});
				return readings;
			} catch (error) {
				console.warn("[ivLyrics] Word reading conversion failed:", error?.message || error);
				return units.map(() => "");
			}
		});
	};

	const getTrackId = () => {
		try {
			const uri = window.Spicetify?.Player?.data?.item?.uri || "";
			return uri.includes(":") ? uri.split(":").pop() : uri;
		} catch {
			return "";
		}
	};

	// Explicit target wins (prefetch knows which track it is warming);
	// otherwise fall back to the currently playing track (render path).
	const resolveTrackId = (options) => {
		const explicit = options?.trackId;
		if (explicit !== undefined && explicit !== null && String(explicit).trim() !== "") {
			return String(explicit).trim();
		}
		return getTrackId();
	};

	const getWordGlosses = async (units, lineText, sourceLang, options = {}) => {
		const empty = units.map(() => "");
		// Synchronous, before any await: gloss cache keys, batch keys and
		// persistent writes must all agree on the requesting track.
		const trackId = resolveTrackId(options);
		const resolvedSourceLang = sourceLang || getSourceLanguage();
		if (!units.length || !isGlossModeActive(resolvedSourceLang)) return empty;
		const manager = window.AIAddonManager;
		if (typeof manager?.generateWordGloss !== "function") return empty;
		if (isAiCoolingDown()) return empty;
		const targetLang = getGlossTargetLanguage();
		const sourceLangKey = resolvedSourceLang;
		const cacheKey = `${trackId}::${targetLang}::${sourceLangKey}::${units
			.map((unit) => unit.surface)
			.join("\u0001")}::${String(lineText || "").slice(0, 120)}`;
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
		return sharePending(pendingGlosses, cacheKey, async () => {
			const persisted = await persistentGet("gloss", {
				targetLang,
				sourceLang: sourceLangKey,
				words: glossCores,
				extra: String(lineText || ""),
				trackId,
			});
			if (persisted) {
				const restored = reinsertSkipped(units.length, glossCoreIndexes, persisted.values);
				glossCache.set(cacheKey, restored);
				return restored;
			}
			const batchKey = `gloss::${trackId}::${targetLang}::${sourceLangKey}`;
			const slice = await enqueueWordBatch({
				kind: "gloss",
				batchKey,
				words: glossCores,
				lineText: String(lineText || ""),
				run: (allWords, allLineTexts) => manager.generateWordGloss({
					words: allWords,
					lineText: allLineTexts.join("\n"),
					targetLang,
					sourceLang: sourceLangKey,
				}),
			});
			if (!slice) return empty;
			const activeGlosses = glossCores.map((core, corePosition) => {
				const gloss = String(slice[corePosition] ?? "").trim();
				const surface = units[glossCoreIndexes[corePosition]]?.surface;
				return gloss && !isEchoOf(gloss, surface, core) ? gloss : "";
			});
			const normalized = reinsertSkipped(units.length, glossCoreIndexes, activeGlosses);
			glossCache.set(cacheKey, normalized);
			if (glossCache.size > 200) {
				const firstKey = glossCache.keys().next().value;
				glossCache.delete(firstKey);
			}
			persistentSet("gloss", {
				targetLang,
				sourceLang: sourceLangKey,
				words: glossCores,
				extra: String(lineText || ""),
				values: activeGlosses,
				trackId,
			});
			return normalized;
		});
	};

	const api = Object.freeze({
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
		// Drop all memory caches, resolve pending batches empty, and reset
		// the breaker. Persistent entries are cleared separately per track.
		clearCaches: () => {
			readingCache.clear();
			glossCache.clear();
			pendingReadings.clear();
			pendingGlosses.clear();
			for (const [batchKey, queue] of batchQueues) {
				batchQueues.delete(batchKey);
				if (queue.timer) clearTimeout(queue.timer);
				queue.items.forEach(({ resolve }) => resolve(null));
			}
			pendingWordBatches = 0;
			aiBreaker.failures = 0;
			aiBreaker.cooldownUntil = 0;
			aiBreaker.lastError = "";
			emitWordLoading({ active: false, completed: false });
		},
		// Clear memory caches and tell mounted karaoke lines to refetch.
		invalidate: () => {
			try {
				window.ivLyricsWordSupplements?.clearCaches?.();
			} catch { /* ignore */ }
			try {
				window.dispatchEvent?.(
					new CustomEvent("ivLyrics:word-supplements-invalidated")
				);
			} catch { /* ignore */ }
		},
	});

	window.ivLyricsWordSupplements = api;
})();
