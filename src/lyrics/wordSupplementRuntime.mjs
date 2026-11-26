import { trackIdentity } from "../core/trackIdentity.mjs";

// All route consumers share the service and the renderer's prefetch pipeline.
let wordSupplementService = null;
let wordSupplementPrefetcher = null;

export const getWordSupplementService = () => wordSupplementService;
export const getWordSupplementPrefetcher = () => wordSupplementPrefetcher;

export function getWordSupplementTrackId(identifier) {
	const value = String(identifier ?? "").trim();
	return trackIdentity.getTranslationCacheId(value) || (value.startsWith("spotify:") ? value.split(":").pop() : value);
}

export function registerWordSupplementService(service) {
	wordSupplementService = service;
}

export function registerWordSupplementPrefetcher(prefetcher) {
	wordSupplementPrefetcher = prefetcher;
}
