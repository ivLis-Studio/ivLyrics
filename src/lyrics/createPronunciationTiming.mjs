import { getPronunciationTimingContextKey, isEstimatedPronunciationTiming } from "./pronunciationTimingSource.mjs";
import { supersededAiRequest } from "../providers/ai/aiRequestCancellation.mjs";

const CACHE_KIND = "timed-pronunciation-v1";
const MAX_REMEMBERED_TRACKS = 8;

// Keep the existing persistent keys so previous alignments still load.
function hashText(text) {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36) + text.length.toString(36);
}

const roundTime = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;

export function createPronunciationTiming({
	presentation: { getLineOriginal, getUnitGroups, distribute, isValidParts, alignParts },
	getService, getSlots, needsTiming, emitStatus, notifyAvailable,
}) {
	const tracks = new Map();
	const layoutByLines = new WeakMap();
	const slotPartsByLines = new WeakMap();
	const combinedByLines = new WeakMap();
	let requestSequence = 0;

	function buildTimingItems(lines) {
		const items = [];
		(Array.isArray(lines) ? lines : []).forEach((line, lineIndex) => {
			for (const group of getUnitGroups(line)) {
				if (!group.pronunciation) continue;
				const units = group.syllables.map(syllable => {
					const start = roundTime(syllable?.startTime);
					const end = Math.max(start, roundTime(syllable?.endTime ?? syllable?.startTime));
					return [String(syllable?.text ?? ""), start, end];
				});
				if (units.some(unit => unit[0].trim())) {
					items.push({ key: `${lineIndex}:${group.key}`, r: group.pronunciation, u: units });
				}
			}
		});
		return items;
	}

	function getLayout(lines) {
		let layout = layoutByLines.get(lines);
		if (!layout) {
			const items = buildTimingItems(lines);
			layout = { items, hash: hashText(JSON.stringify(items)) };
			layoutByLines.set(lines, layout);
		}
		return layout;
	}

	const getCacheId = uri => getService("LyricsService")?.extractTrackId?.(uri) || uri;
	const getTranslationId = uri => getService("LyricsService")?.getTranslationCacheId?.(uri) || getCacheId(uri);

	function getSlotParts(trackUri, lines, context, contextKey) {
		const slots = getSlots();
		const trackId = getTranslationId(trackUri);
		const track = slots?.getTrack?.(trackId);
		if (!track) return null;
		const cached = slotPartsByLines.get(lines);
		if (cached?.track === track && cached.contextKey === contextKey) return cached.parts;
		const parts = new Map();
		for (const item of getLayout(lines).items) {
			const texts = item.u.map(unit => unit[0]);
			const source = texts.join("");
			const slot = slots.lookup(trackId, source, item.r, context);
			if (!slot) continue;
			const derived = slots.deriveSyllableParts(texts, slot.parts, distribute);
			const aligned = derived && alignParts(derived, item.r);
			if (aligned) parts.set(item.key, aligned);
		}
		const result = parts.size ? parts : null;
		slotPartsByLines.set(lines, { track, contextKey, parts: result });
		return result;
	}

	const entriesOf = track => Array.from(new Set(track?.consumers.values()));
	function hasEntry(track, entry) {
		for (const candidate of track.consumers.values()) {
			if (candidate === entry) return true;
		}
		return false;
	}

	function getTimed(trackUri, lines = null, consumer = "page", context = null) {
		if (!trackUri) return null;
		const track = tracks.get(trackUri);
		const contextKey = context ? getPronunciationTimingContextKey(context) : null;
		const hasLines = Array.isArray(lines);
		const hash = hasLines && track ? getLayout(lines).hash : null;
		const own = track?.consumers.get(consumer);
		const matches = entry => (hash === null || entry.itemsHash === hash)
			&& (contextKey === null || entry.contextKey === contextKey);
		const entry = own && matches(own) && (hasLines || own.parts) ? own
			: entriesOf(track).findLast(candidate => candidate.status === "ready" && matches(candidate));
		const aiParts = entry?.status === "ready" ? entry.parts : null;
		if (!hasLines) return aiParts;
		const slotParts = getSlotParts(trackUri, lines, context, contextKey);
		if (!slotParts || !aiParts) return slotParts || aiParts;
		const cached = combinedByLines.get(lines);
		if (cached?.aiParts === aiParts && cached.slotParts === slotParts) return cached.parts;
		const parts = new Map([...aiParts, ...slotParts]);
		combinedByLines.set(lines, { aiParts, slotParts, parts });
		return parts;
	}

	function retire(trackUri, entry) {
		if (entry.status !== "pending") return;
		entry.status = "cancelled";
		entry.controller.abort(supersededAiRequest());
		if (entry.announced) emitStatus(trackUri, entry.requestId, "cancelled");
	}

	function assign(trackUri, track, consumer, entry) {
		const previous = track.consumers.get(consumer);
		if (previous === entry) return;
		track.consumers.delete(consumer);
		if (entry) track.consumers.set(consumer, entry);
		if (previous && !hasEntry(track, previous)) retire(trackUri, previous);
	}

	function clearTrack(identifier = null) {
		for (const [uri, track] of tracks) {
			if (identifier && uri !== identifier && track.cacheId !== identifier && track.legacyCacheId !== identifier) continue;
			tracks.delete(uri);
			for (const entry of entriesOf(track)) retire(uri, entry);
		}
	}

	function releaseTimed(trackUri, entry, consumer = "page") {
		const track = tracks.get(trackUri);
		if (entry?.status === "pending" && track?.consumers.get(consumer) === entry) {
			assign(trackUri, track, consumer, null);
		}
	}

	function cancelPending() {
		for (const [uri, track] of tracks) {
			for (const [consumer, entry] of track.consumers) {
				if (entry.status === "pending") assign(uri, track, consumer, null);
			}
		}
	}

	function getStatuses(trackUri) {
		return entriesOf(tracks.get(trackUri)).filter(entry => entry.status === "pending" && entry.announced)
			.map(entry => ({ uri: trackUri, requestId: entry.requestId, phase: "generating" }));
	}

	async function readCache(args) {
		try {
			return (await getService("LyricsService")?.getWordSupplements?.(...args))?.entries;
		} catch { return null; }
	}

	function writeCache(args, parts, isCurrent) {
		try {
			getService("LyricsService")?.cacheWordSupplements?.(...args, {
				entries: Object.fromEntries(parts),
			}, isCurrent)?.catch?.(() => {});
		} catch { /* persistence never blocks display */ }
	}

	function selectValidParts(items, getParts) {
		const parts = new Map();
		items.forEach((item, index) => {
			const value = getParts(item, index);
			const aligned = isValidParts(value, item.u.length) && alignParts(value, item.r);
			if (aligned) parts.set(item.key, aligned);
		});
		return parts;
	}

	function ensureTimed({ trackUri, lines, karaokeSource = null, targetLang = "", sourceLang = "auto", notation = "", consumer = "page" } = {}) {
		if (!trackUri || !needsTiming() || isEstimatedPronunciationTiming(karaokeSource) || !Array.isArray(lines)) return null;
		const layout = getLayout(lines);
		const context = { sourceLang, targetLang, notation };
		const contextKey = getPronunciationTimingContextKey(context);
		const slots = getSlotParts(trackUri, lines, context, contextKey);
		const items = slots ? layout.items.filter(item => !slots.has(item.key)) : layout.items;
		let track = tracks.get(trackUri);
		if (items.length === 0) {
			if (track) assign(trackUri, track, consumer, null);
			return null;
		}
		track ??= { cacheId: getTranslationId(trackUri), legacyCacheId: getCacheId(trackUri), consumers: new Map() };
		tracks.delete(trackUri);
		tracks.set(trackUri, track);
		if (tracks.size > MAX_REMEMBERED_TRACKS) clearTrack(tracks.keys().next().value);
		const existing = entriesOf(track).find(entry => entry.itemsHash === layout.hash && entry.contextKey === contextKey
			&& items.every(item => entry.requestedKeys.has(item.key)));
		if (existing) {
			assign(trackUri, track, consumer, existing);
			return existing;
		}

		const entry = {
			contextKey, itemsHash: layout.hash, requestedKeys: new Set(items.map(item => item.key)),
			requestId: `pronunciation-sync-${++requestSequence}`, status: "pending", announced: false, parts: null,
			controller: new AbortController(),
		};
		assign(trackUri, track, consumer, entry);
		const signature = hashText(JSON.stringify([CACHE_KIND, targetLang, notation, items]));
		const cacheArgs = [track.cacheId, targetLang, sourceLang, CACHE_KIND, signature];
		const isCurrent = () => tracks.get(trackUri) === track && hasEntry(track, entry);
		const finish = (parts, phase) => {
			if (!isCurrent()) return;
			entry.parts = parts;
			entry.status = parts ? "ready" : "failed";
			if (entry.announced) emitStatus(trackUri, entry.requestId, phase);
			if (parts) notifyAvailable(trackUri);
		};

		(async () => {
			let cached = await readCache(cacheArgs);
			if (isCurrent() && !cached && track.legacyCacheId !== track.cacheId) {
				cached = await readCache([track.legacyCacheId, ...cacheArgs.slice(1)]);
			}
			if (!isCurrent()) return;
			if (cached && typeof cached === "object") {
				const parts = selectValidParts(items, item => cached[item.key]);
				if (parts.size) return finish(parts, "complete");
			}
			entry.announced = true;
			emitStatus(trackUri, entry.requestId, "generating");
			if (!isCurrent()) return;
			try {
				const manager = getService("AIAddonManager");
				const result = await manager?.generateTimedPronunciation?.({
					items: items.map((item, i) => ({ i, r: item.r, u: item.u })),
					lyricsText: lines.map(line => getLineOriginal(line).trim()).filter(Boolean).join("\n"),
					sourceLang, targetLang, signal: entry.controller.signal,
				});
				if (!isCurrent()) return;
				const parts = selectValidParts(items, (_item, index) => result?.get?.(index));
				if (!parts.size) throw new Error("AI returned no usable pronunciation timing");
				writeCache(cacheArgs, parts, isCurrent);
				finish(parts, "complete");
			} catch (error) {
				if (!isCurrent()) return;
				console.warn("[ivLyrics] Pronunciation timing failed:", error?.message || error);
				finish(null, "failed");
			}
		})();
		return entry;
	}

	return { buildTimingItems, ensureTimed, getTimed, getStatuses, releaseTimed, clearTrack, cancelPending };
}
