// Prefetch word supplements for whole karaoke lines using the exact same
// timed-char pipeline as KaraokeLine, so warmed memory/persistent caches hit
// on mount. Vocal-row sublines warm on mount instead (row construction needs
// live render data). Best effort per line: failures stay silent.
export function createWordSupplementPrefetcher({ getService, getVisualSettings, getDetectedLanguage, prepareTimedChars }) {
	return function prefetchWordSupplementsForLyrics(karaokeLines, { locale = "auto", sourceLang = "auto", trackId = "", force = false, wanted } = {}) {
		const api = getService();
		if (!api || !Array.isArray(karaokeLines) || karaokeLines.length === 0) return Promise.resolve(false);
		// Explicit user actions (e.g. Regenerate) bypass the prefetch toggle;
		// automatic prefetch still honors it.
		if (!force && getVisualSettings()?.["prefetch-word-details-enabled"] === false) return Promise.resolve(false);
		const lyricsLocale = locale && locale !== "auto"
			? locale
			: String(getDetectedLanguage() || "auto");
		// Render-path callers omit trackId and keep the current-player default;
		// prefetch passes the target track so its warm caches hit on mount.
		const supplementOptions = trackId ? { trackId: String(trackId) } : {};
		if (wanted) {
			supplementOptions.wanted = () => wanted() && (force || (
				getVisualSettings()?.["prefetch-enabled"] !== false
				&& getVisualSettings()?.["prefetch-word-details-enabled"] !== false
			));
			if (!supplementOptions.wanted()) return Promise.resolve(false);
		}
		const jobs = [];
		for (const line of karaokeLines) {
			try {
				if (!line) continue;
				const timedChars = prepareTimedChars(line, lyricsLocale);
				const units = api.getWordUnits(timedChars);
				if (!units.length) continue;
				const timedText = timedChars.map((charInfo) => String(charInfo?.char ?? "")).join("");
				const lang = api.isSuitableSourceLanguage(sourceLang)
					? sourceLang
					: api.resolveSourceLanguage(timedText);
				if (!api.isSuitableSourceLanguage(lang)) continue;
				const readingMode = api.resolveReadingMode(lang);
				if (readingMode) {
					jobs.push(api.getWordReadings(units, lang, readingMode, timedText, supplementOptions).catch(() => []));
				}
				jobs.push(api.getWordGlosses(units, timedText, lang, supplementOptions).catch(() => []));
			} catch { /* per-line best effort */ }
		}
		if (!jobs.length) return Promise.resolve(false);
		return Promise.all(jobs).then(results => results.some(values =>
			Array.isArray(values) && values.some(value => String(value ?? "").trim())
		));
	};
}
