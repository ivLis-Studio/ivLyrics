const KARAOKE_COMBINING_MARK_REGEX = /\p{M}/u;
const KARAOKE_VARIATION_OR_MODIFIER_REGEX = /[\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0100}-\u{E01EF}]/u;

export function createKaraokeGraphemes({
	getSharedSegmenter = () => undefined,
	getIntl = () => globalThis.Intl,
	warn = (...args) => console.warn(...args),
} = {}) {
	const splitKaraokeGraphemes = (value, locale = "auto") => {
		const text = String(value || "");
		if (!text) return [];

		const shared = getSharedSegmenter();
		if (shared?.segmentGraphemes) {
			try {
				return shared.segmentGraphemes(text, locale);
			} catch (error) {
				warn("[ivLyrics] Shared grapheme segmenter failed; using local fallback", error);
			}
		}

		const intl = getIntl();
		if (typeof intl?.Segmenter === "function") {
			try {
				const requestedLocale = locale && locale !== "auto" ? locale : undefined;
				return Array.from(
					new intl.Segmenter(requestedLocale, { granularity: "grapheme" }).segment(text),
					(segment) => segment.segment
				);
			} catch (error) {
				warn("[ivLyrics] Intl grapheme segmentation failed; using Unicode fallback", error);
			}
		}

		const clusters = [];
		for (const codePoint of Array.from(text)) {
			const previous = clusters[clusters.length - 1] || "";
			const joinsPrevious = clusters.length > 0 && (
				KARAOKE_COMBINING_MARK_REGEX.test(codePoint)
				|| KARAOKE_VARIATION_OR_MODIFIER_REGEX.test(codePoint)
				|| codePoint === "\u200D"
				|| previous.endsWith("\u200D")
			);
			if (joinsPrevious) {
				clusters[clusters.length - 1] += codePoint;
			} else {
				clusters.push(codePoint);
			}
		}
		return clusters;
	};

	const coalesceKaraokeTimedGraphemes = (timedChars, locale = "auto") => {
		if (!Array.isArray(timedChars) || timedChars.length === 0) return [];

		const text = timedChars.map((charInfo) => String(charInfo?.char || "")).join("");
		const graphemes = splitKaraokeGraphemes(text, locale);
		if (graphemes.length === timedChars.length
			&& graphemes.every((grapheme, index) => grapheme === String(timedChars[index]?.char || ""))) {
			return timedChars;
		}

		const sourceRanges = [];
		let sourceOffset = 0;
		timedChars.forEach((charInfo) => {
			const char = String(charInfo?.char || "");
			sourceRanges.push({
				charInfo,
				start: sourceOffset,
				end: sourceOffset + char.length,
			});
			sourceOffset += char.length;
		});

		let graphemeOffset = 0;
		let sourceIndex = 0;
		return graphemes.map((grapheme) => {
			const graphemeStart = graphemeOffset;
			const graphemeEnd = graphemeStart + grapheme.length;
			graphemeOffset = graphemeEnd;

			while (sourceIndex < sourceRanges.length && sourceRanges[sourceIndex].end <= graphemeStart) {
				sourceIndex += 1;
			}
			let first;
			let hasContributor = false;
			let earliestStart = Infinity;
			let latestEnd = -Infinity;
			for (let index = sourceIndex; index < sourceRanges.length; index += 1) {
				const range = sourceRanges[index];
				if (range.start >= graphemeEnd) break;
				if (range.end <= graphemeStart) continue;
				const contributor = range.charInfo;
				if (!hasContributor) {
					first = contributor;
					hasContributor = true;
				}
				const startTime = contributor?.startTime;
				const endTime = contributor?.endTime;
				if (Number.isFinite(startTime)) earliestStart = Math.min(earliestStart, startTime);
				if (Number.isFinite(endTime)) latestEnd = Math.max(latestEnd, endTime);
			}
			return {
				...first,
				char: grapheme,
				startTime: earliestStart !== Infinity ? earliestStart : (first?.startTime || 0),
				endTime: latestEnd !== -Infinity ? latestEnd : (first?.endTime || first?.startTime || 0),
			};
		});
	};

	return { splitKaraokeGraphemes, coalesceKaraokeTimedGraphemes };
}
