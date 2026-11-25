// Coalesce AI requests across lines and isolate failed lines for individual retry.
export function createWordSupplementBatcher({ getGeneration, emit, logger, schedule, cancelTimer }) {
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
		logger.warn(`[ivLyrics] Word ${label} failed:`, error?.message || error);
		if (aiBreaker.failures >= AI_BREAKER_THRESHOLD && !aiBreaker.cooldownUntil) {
			aiBreaker.cooldownUntil = Date.now() + AI_BREAKER_COOLDOWN_MS;
			logger.warn("[ivLyrics] Word supplements paused for 120s after repeated AI failures.");
		}
	};
	const getAiStatus = () => ({
		coolingDown: isAiCoolingDown(),
		failures: aiBreaker.failures,
		lastError: aiBreaker.lastError,
	});

	const WORD_BATCH_DEBOUNCE_MS = 350;
	const WORD_BATCH_MAX_WORDS = 500;
	const batchQueues = new Map();
	// Pill lifecycle for the top-left generation status stack: active while
	// any AI word batch is pending.
	let pendingWordBatches = 0;
	const emitWordLoading = (detail = {}) => {
		try {
			emit("ivLyrics:word-supplements", detail);
		} catch { /* diagnostics must never break fetching */ }
	};
	const trackBatchStart = (generation) => {
		if (generation !== getGeneration()) return;
		pendingWordBatches += 1;
		if (pendingWordBatches === 1) emitWordLoading({ active: true });
	};
	const trackBatchSettle = (completed, generation) => {
		if (generation !== getGeneration()) return;
		pendingWordBatches = Math.max(0, pendingWordBatches - 1);
		if (pendingWordBatches === 0) emitWordLoading({ active: false, completed: !!completed });
	};
	const filterWantedItems = (items) => items.filter(item => {
		if (item.isWanted()) return true;
		item.resolve(null);
		return false;
	});
	const flushWordBatch = async (batchKey) => {
		const queue = batchQueues.get(batchKey);
		if (!queue || queue.items.length === 0) return;
		batchQueues.delete(batchKey);
		if (queue.timer) cancelTimer(queue.timer);
		const items = filterWantedItems(queue.items);
		if (!items.length) return;
		const generation = queue.generation;
		trackBatchStart(generation);
		if (isAiCoolingDown()) {
			items.forEach(({ resolve }) => resolve(null));
			trackBatchSettle(false, generation);
			return;
		}
		const allWords = items.flatMap((item) => item.words);
		try {
			const allResults = await queue.run(allWords, items.map((item) => item.lineText));
			if (generation !== getGeneration()) {
				items.forEach(({ resolve }) => resolve(null));
				return;
			}
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
			trackBatchSettle(true, generation);
		} catch (error) {
			if (generation !== getGeneration()) {
				items.forEach(({ resolve }) => resolve(null));
				return;
			}
			const remaining = filterWantedItems(items);
			if (remaining.length === 0) {
				trackBatchSettle(false, generation);
				return;
			}
			if (items.length > 1) {
				// One malformed line can poison the whole batch count (model
				// merged/split lines). Retry each line on its own batch key so
				// healthy lines still resolve. Single-item failures stop here.
				logger.warn(
					`[ivLyrics] Word batch failed; retrying ${remaining.length} lines individually.`,
					error?.message || error
				);
				remaining.forEach((item, index) => {
					enqueueWordBatch({
						kind: queue.kind,
						batchKey: `${batchKey}::line${index}`,
						words: item.words,
						lineText: item.lineText,
						run: queue.run,
						generation,
						isWanted: item.isWanted,
					}).then((slice) => item.resolve(slice));
				});
				trackBatchSettle(false, generation);
				return;
			}
			noteAiFailure(queue.kind, error);
			remaining.forEach(({ resolve }) => resolve(null));
			trackBatchSettle(false, generation);
		}
	};
	const enqueueWordBatch = ({ kind, batchKey, words, lineText, run, generation, isWanted }) => new Promise((resolve) => {
		if (generation !== getGeneration() || !isWanted()) {
			resolve(null);
			return;
		}
		let queue = batchQueues.get(batchKey);
		if (!queue || queue.kind !== kind) {
			if (queue?.timer) cancelTimer(queue.timer);
			// A colliding queue should not exist (kind is part of the key),
			// but never leave its items hanging if it does.
			queue?.items?.forEach?.(({ resolve }) => resolve(null));
			queue = { kind, run, generation, timer: null, items: [], wordCount: 0 };
			batchQueues.set(batchKey, queue);
		}
		queue.items.push({ words, lineText, resolve, isWanted });
		queue.wordCount += words.length;
		if (queue.wordCount >= WORD_BATCH_MAX_WORDS) {
			flushWordBatch(batchKey);
			return;
		}
		if (!queue.timer) {
			queue.timer = schedule(() => flushWordBatch(batchKey), WORD_BATCH_DEBOUNCE_MS);
		}
	});

	const clear = () => {
		for (const [batchKey, queue] of batchQueues) {
			batchQueues.delete(batchKey);
			if (queue.timer) cancelTimer(queue.timer);
			queue.items.forEach(({ resolve }) => resolve(null));
		}
		pendingWordBatches = 0;
		aiBreaker.failures = 0;
		aiBreaker.cooldownUntil = 0;
		aiBreaker.lastError = "";
		emitWordLoading({ active: false, completed: false });
	};

	return { enqueueWordBatch, isAiCoolingDown, getAiStatus, clear };
}
