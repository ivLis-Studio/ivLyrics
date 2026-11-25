import { SYNC_CREATOR_KANJI_REGEX } from './syncCreatorPronunciationReadings.mjs';

export function useSyncCreatorFurigana({
	react, browser, lyricsLanguage, lyricsLines, getConverter, parseMapping, renderRuby,
}) {
	const { useState, useEffect, useMemo, useCallback } = react;
	const [furiganaRevision, setFuriganaRevision] = useState(0);

	useEffect(() => {
		const handleReady = () => setFuriganaRevision(value => value + 1);
		browser.addEventListener('furigana-ready', handleReady);
		const converter = getConverter();
		if (typeof converter?.init === 'function' && !converter.isAvailable?.()) {
			converter.init().then(handleReady).catch(() => {});
		}
		return () => browser.removeEventListener('furigana-ready', handleReady);
	}, [browser, getConverter]);

	const enabled = useMemo(() => (
		lyricsLanguage === 'ja'
		&& lyricsLines.some(line => SYNC_CREATOR_KANJI_REGEX.test(line))
		&& typeof getConverter()?.convertToFurigana === 'function'
	), [lyricsLanguage, lyricsLines, furiganaRevision, getConverter]);

	// Both the reading map and the plain lyric preview use the same converter
	// and refresh on its readiness event even if the original lyric is intact.
	const convertLine = useCallback((lineText) => {
		if (!enabled || !lineText || !SYNC_CREATOR_KANJI_REGEX.test(lineText)) return null;
		const converted = getConverter()?.convertToFurigana?.(lineText);
		return converted && converted !== lineText && converted.includes('<ruby>') ? converted : null;
	}, [enabled, furiganaRevision, getConverter]);

	const getSyncCreatorFuriganaMap = useCallback((lineText) => {
		try {
			const ruby = convertLine(lineText);
			return (ruby && parseMapping(ruby)) || new Map();
		} catch {
			return new Map();
		}
	}, [convertLine, parseMapping]);

	const getSyncCreatorFuriganaReact = useCallback((lineText) => {
		try {
			const ruby = convertLine(lineText);
			return (ruby && renderRuby(ruby)) || lineText;
		} catch {
			return lineText;
		}
	}, [convertLine, renderRuby]);

	return { getSyncCreatorFuriganaMap, getSyncCreatorFuriganaReact, furiganaRevision };
}
