// All route consumers share the service and the renderer's prefetch pipeline.
let wordSupplementService = null;
let wordSupplementPrefetcher = null;

export const getWordSupplementService = () => wordSupplementService;
export const getWordSupplementPrefetcher = () => wordSupplementPrefetcher;

export function registerWordSupplementService(service) {
	wordSupplementService = service;
}

export function registerWordSupplementPrefetcher(prefetcher) {
	wordSupplementPrefetcher = prefetcher;
}
