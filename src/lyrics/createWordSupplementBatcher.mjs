import { supersededAiRequest } from '../providers/ai/aiRequestCancellation.mjs';

const AI_BREAKER_THRESHOLD = 3;
const AI_BREAKER_COOLDOWN_MS = 120_000;
const WORD_BATCH_DEBOUNCE_MS = 350;
const WORD_BATCH_MAX_WORDS = 500;

// Coalesce AI requests across lines and isolate failed lines for individual retry.
export function createWordSupplementBatcher({ getGeneration, emit, logger, schedule, cancelTimer }) {
	const aiBreaker = { failures: 0, cooldownUntil: 0, lastError: "" };
	const batchQueues = new Map();
	const activeBatches = new Set();
	const isAiCoolingDown = () => Date.now() < aiBreaker.cooldownUntil;

	const resetBreaker = () => {
		aiBreaker.failures = 0;
		aiBreaker.cooldownUntil = 0;
		aiBreaker.lastError = "";
	};
	const noteAiFailure = (label, error) => {
		aiBreaker.failures += 1;
		aiBreaker.lastError = String(error?.message || error || "").slice(0, 200);
		logger.warn("[ivLyrics] Word " + label + " failed:", error?.message || error);
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

	function emitWordLoading(detail) {
		try {
			emit("ivLyrics:word-supplements", detail);
		} catch { /* diagnostics must never break fetching */ }
	}
	const resolveEmpty = items => items.forEach(item => item.resolve(null));
	const filterWantedItems = items => items.filter(item => {
		if (item.isWanted()) return true;
		item.resolve(null);
		return false;
	});
	const removeQueued = (key, queue) => {
		batchQueues.delete(key);
		if (queue.timer !== null) cancelTimer(queue.timer);
	};

	async function flushWordBatch(batchKey, queue) {
		if (batchQueues.get(batchKey) !== queue) return;
		removeQueued(batchKey, queue);
		const items = filterWantedItems(queue.items);
		if (!items.length) return;
		const { generation, trackId, kind } = queue;
		if (generation !== getGeneration()) {
			resolveEmpty(items);
			return;
		}
		const controller = new AbortController();
		const batch = { trackId, controller, items };
		activeBatches.add(batch);
		const isCurrent = () => activeBatches.has(batch) && generation === getGeneration();
		let completed = false;
		try {
			if (activeBatches.size === 1) emitWordLoading({ active: true });
			if (!isCurrent()) return;
			if (isAiCoolingDown()) {
				resolveEmpty(items);
				return;
			}
			const allWords = items.flatMap(item => item.words);
			const allResults = await queue.run(allWords, items.map(item => item.lineText), controller.signal);
			if (!isCurrent()) return;
			if (!Array.isArray(allResults) || allResults.length !== allWords.length) {
				const count = Array.isArray(allResults) ? allResults.length : "invalid";
				throw new Error("[ivLyrics] Word batch returned " + count + " results; expected " + allWords.length);
			}
			resetBreaker();
			let offset = 0;
			for (const item of items) {
				item.resolve(allResults.slice(offset, offset + item.words.length));
				offset += item.words.length;
			}
			completed = true;
		} catch (error) {
			if (!isCurrent()) return;
			const remaining = filterWantedItems(items);
			if (remaining.length === 0) return;
			if (items.length > 1) {
				// A malformed model response can affect the batch count.
				logger.warn("[ivLyrics] Word batch failed; retrying " + remaining.length + " lines individually.", error?.message || error);
				remaining.forEach((item, index) => {
					enqueueWordBatch({
						kind, generation, trackId,
						batchKey: batchKey + "::line" + index,
						words: item.words, lineText: item.lineText, run: queue.run, isWanted: item.isWanted,
					}).then(item.resolve);
				});
			} else {
				noteAiFailure(kind, error);
				resolveEmpty(remaining);
			}
		} finally {
			if (activeBatches.delete(batch) && activeBatches.size === 0) {
				emitWordLoading({ active: false, completed });
			}
		}
	}

	function enqueueWordBatch({ kind, batchKey, trackId, words, lineText, run, generation, isWanted }) {
		return new Promise(resolve => {
			if (generation !== getGeneration() || !isWanted()) {
				resolve(null);
				return;
			}
			let queue = batchQueues.get(batchKey);
			if (!queue || queue.kind !== kind) {
				if (queue) {
					removeQueued(batchKey, queue);
					resolveEmpty(queue.items);
				}
				queue = { kind, run, generation, trackId, timer: null, items: [], wordCount: 0 };
				batchQueues.set(batchKey, queue);
			}
			queue.items.push({ words, lineText, resolve, isWanted });
			queue.wordCount += words.length;
			if (queue.wordCount >= WORD_BATCH_MAX_WORDS) {
				void flushWordBatch(batchKey, queue);
			} else if (queue.timer === null) {
				queue.timer = schedule(() => flushWordBatch(batchKey, queue), WORD_BATCH_DEBOUNCE_MS);
			}
		});
	}

	function clear(trackId) {
		for (const [key, queue] of batchQueues) {
			if (trackId && queue.trackId !== trackId) continue;
			removeQueued(key, queue);
			resolveEmpty(queue.items);
		}
		const retired = [];
		for (const batch of activeBatches) {
			if (trackId && batch.trackId !== trackId) continue;
			activeBatches.delete(batch);
			retired.push(batch);
		}
		if (!trackId) resetBreaker();
		for (const { controller, items } of retired) {
			resolveEmpty(items);
			controller.abort(supersededAiRequest());
		}
		if ((!trackId || retired.length > 0) && activeBatches.size === 0) {
			emitWordLoading({ active: false, completed: false });
		}
	}

	return { enqueueWordBatch, isAiCoolingDown, getAiStatus, clear };
}
