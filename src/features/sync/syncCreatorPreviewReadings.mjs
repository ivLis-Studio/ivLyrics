const SYNC_CREATOR_PREVIEW_FULLWIDTH_CHAR_REGEX = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFF60\uFFDD-\uFFEF]/u;

const buildSyncCreatorPreviewCharReadings = (chars, pronMap, units, glyphPx = 32) => {
	// index -> { text, dx }, aligned with chars: a word unit's reading sits
	// mid-group (covered members stay blank, like the editor's grouped
	// cells). dx shifts even-width units right by half a glyph so the
	// reading centers over the whole group exactly like the editor.
	// AI results may carry only word units without a per-char map.
	if (!Array.isArray(chars) || chars.length === 0) return null;
	const unit = Math.max(12, Number(glyphPx) || 32);
	const widthOf = (char) => (SYNC_CREATOR_PREVIEW_FULLWIDTH_CHAR_REGEX.test(char ?? '') ? unit : Math.max(8, Math.round(unit * 0.55)));
	const hasMap = pronMap instanceof Map && pronMap.size > 0;
	const unitList = Array.isArray(units) ? units : [];
	const unitByStart = new Map();
	const covered = new Set();
	unitList.forEach((item) => {
		if (!item || !Number.isInteger(item.start) || !Number.isInteger(item.end) || !item.pronunciation) return;
		if (!unitByStart.has(item.start)) unitByStart.set(item.start, item);
		for (let index = item.start + 1; index <= item.end; index++) covered.add(index);
	});
	if (!hasMap && unitByStart.size === 0) return null;
	const map = new Map();
	for (let index = 0; index < chars.length; index++) {
		const char = chars[index] ?? '';
		if (/\s/u.test(char)) continue;
		const item = unitByStart.get(index);
		if (item) {
			const mid = (item.start + item.end) >> 1;
			const text = String(item.pronunciation).trim();
			if (mid >= 0 && mid < chars.length && text) {
				const evenWidth = ((item.end - item.start) % 2) === 1;
				map.set(mid, { text, dx: evenWidth ? Math.round(widthOf(chars[mid]) / 2) : 0 });
			}
			continue;
		}
		if (covered.has(index)) continue;
		const reading = hasMap ? pronMap.get(index) : null;
		if (reading) map.set(index, { text: String(reading).trim(), dx: 0 });
	}
	return map.size > 0 ? map : null;
};

// WeakMap result cache: the preview rebuilds readings every render, but the
// inputs are stable component memos, so cache hits keep the karaoke glyph
// cache (keyed partly on readings identity) effective instead of resetting.
const previewCharReadingsCache = new WeakMap();
const getCachedPreviewCharReadings = (chars, pronMap, units, glyphPx) => {
	const hit = pronMap instanceof Map ? previewCharReadingsCache.get(pronMap) : null;
	if (hit && hit.chars === chars && hit.units === units && hit.glyphPx === glyphPx) return hit.result;
	const result = buildSyncCreatorPreviewCharReadings(chars, pronMap, units, glyphPx);
	if (pronMap instanceof Map) previewCharReadingsCache.set(pronMap, { chars, units, glyphPx, result });
	return result;
};
const getSyncCreatorPreviewFuriganaMap = (cache, text, buildMap, revision, ready) => {
	if (cache.buildMap !== buildMap || cache.revision !== revision || cache.ready !== ready) {
		cache.maps.clear();
		cache.buildMap = buildMap;
		cache.revision = revision;
		cache.ready = ready;
	}
	if (!cache.maps.has(text)) {
		const map = buildMap(text);
		cache.maps.set(text, map?.size > 0 ? map : null);
		if (cache.maps.size > 40) cache.maps.delete(cache.maps.keys().next().value);
	}
	return cache.maps.get(text);
};
export {
	buildSyncCreatorPreviewCharReadings,
	getCachedPreviewCharReadings,
	getSyncCreatorPreviewFuriganaMap,
};
