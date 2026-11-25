import { reuseLyricsPresentation } from "./translationPresentation.mjs";
import { rubyTextToHTML } from "./lyricTextMarkup.mjs";

export const normalizeDisplayedCulturalAnnotations = (value) => {
	const values = Array.isArray(value) ? value : value ? [value] : [];
	return values
		.map((annotation, index) => {
			if (typeof annotation === "string") {
				const note = annotation.trim();
				return note ? { marker: index + 1, expression: "", note } : null;
			}

			const marker = Number(annotation?.marker);
			const expression = String(annotation?.expression || "").trim();
			const note = String(annotation?.note || "").trim();
			if (!Number.isInteger(marker) || marker < 1 || !note) return null;
			return { marker, expression, note };
		})
		.filter(Boolean)
		.sort((a, b) => a.marker - b.marker);
};

const getRubySourceText = (value) => String(value || "")
	.replace(/<rt>[\s\S]*?<\/rt>/gi, "")
	.replace(/<rp>[\s\S]*?<\/rp>/gi, "")
	.replace(/<\/?ruby>/gi, "");

const getCulturalMarkerHTML = (marker) =>
	`<sup class="lyrics-cultural-marker">[${marker}]</sup>`;

const getCulturalMarkerRawOffset = (text, annotation) => {
	const expression = annotation?.expression;
	const sourceText = getRubySourceText(text);
	const expressionStart = expression ? sourceText.indexOf(expression) : -1;
	if (expressionStart < 0) return text.length;

	const sourceEnd = expressionStart + expression.length;
	let sourceOffset = 0;
	let rawOffset = text.length;
	let skipUntil = "";
	for (let index = 0; index < text.length; index += 1) {
		const remaining = text.slice(index).toLowerCase();
		if (skipUntil) {
			const closingIndex = remaining.indexOf(skipUntil);
			if (closingIndex < 0) break;
			index += closingIndex + skipUntil.length - 1;
			skipUntil = "";
			continue;
		}
		if (remaining.startsWith("<rt>")) {
			skipUntil = "</rt>";
			index += 3;
			continue;
		}
		if (remaining.startsWith("<rp>")) {
			skipUntil = "</rp>";
			index += 3;
			continue;
		}
		if (text[index] === "<") {
			const tagEnd = text.indexOf(">", index);
			if (tagEnd >= 0) {
				index = tagEnd;
				continue;
			}
		}

		sourceOffset += 1;
		if (sourceOffset === sourceEnd) {
			rawOffset = index + 1;
			break;
		}
	}

	const openRubyIndex = text.lastIndexOf("<ruby>", rawOffset);
	const closedRubyIndex = text.lastIndexOf("</ruby>", rawOffset);
	if (openRubyIndex > closedRubyIndex) {
		const rubyEnd = text.indexOf("</ruby>", rawOffset);
		if (rubyEnd >= 0) rawOffset = rubyEnd + "</ruby>".length;
	}
	return rawOffset;
};

export const renderAnnotatedLyricHTML = (text, annotations = []) => {
	const normalizedText = String(text || "");
	if (!Array.isArray(annotations) || annotations.length === 0) {
		return rubyTextToHTML(normalizedText);
	}

	const markerInsertions = annotations
		.map((annotation) => ({
			annotation,
			rawOffset: getCulturalMarkerRawOffset(normalizedText, annotation),
			token: `\uE000iv-cultural-${annotation.marker}\uE001`,
		}))
		.sort((a, b) => b.rawOffset - a.rawOffset || b.annotation.marker - a.annotation.marker);
	let markedText = normalizedText;
	for (const insertion of markerInsertions) {
		markedText =
			`${markedText.slice(0, insertion.rawOffset)}` +
			`${insertion.token}${markedText.slice(insertion.rawOffset)}`;
	}

	let html = rubyTextToHTML(markedText);
	for (const insertion of markerInsertions) {
		html = html.replace(
			insertion.token,
			getCulturalMarkerHTML(insertion.annotation.marker)
		);
	}
	return html;
};

export function partitionLyricAnnotations({ annotations, isKara, mainText, subText, subText2 }) {
	const targets = { main: [], sub: [], sub2: [] };
	if (!isKara) {
		for (const annotation of annotations) {
			const expressionMatches = (text) =>
				typeof text === "string" &&
				annotation.expression &&
				getRubySourceText(text).includes(annotation.expression);
			const target = expressionMatches(mainText)
				? "main"
				: expressionMatches(subText)
					? "sub"
					: expressionMatches(subText2)
						? "sub2"
						: "main";
			targets[target].push(annotation);
		}
	}
	return targets;
}

export function getKaraokeCulturalMarkers({ culturalAnnotations, timedChars, timedText, useTextRun }) {
	const culturalMarkersByCharIndex = new Map();
	const fallbackCulturalAnnotations = [];
	for (const annotation of culturalAnnotations || []) {
		const expressionStart = annotation.expression
			? timedText.indexOf(annotation.expression)
			: -1;
		if (useTextRun || expressionStart < 0) {
			fallbackCulturalAnnotations.push(annotation);
			continue;
		}

		const expressionEnd = expressionStart + annotation.expression.length;
		let textOffset = 0;
		let markerCharIndex = -1;
		for (let index = 0; index < timedChars.length; index += 1) {
			textOffset += String(timedChars[index]?.char || "").length;
			if (textOffset >= expressionEnd) {
				markerCharIndex = index;
				break;
			}
		}
		if (markerCharIndex < 0) {
			fallbackCulturalAnnotations.push(annotation);
			continue;
		}

		const markers = culturalMarkersByCharIndex.get(markerCharIndex) || [];
		markers.push(annotation);
		culturalMarkersByCharIndex.set(markerCharIndex, markers);
	}
	return { culturalMarkersByCharIndex, fallbackCulturalAnnotations };
}

export function applyCulturalAnnotationsToLyrics(lyrics, notesByIndex) {
  if (!Array.isArray(lyrics)) return [];
  const annotated = lyrics.map((line, index) => {
    if (!line || typeof line !== "object") return line;
    const note = notesByIndex?.get(index) || null;
    if (note) {
      return line.culturalNote === note ? line : { ...line, culturalNote: note };
    }
    if (!line.culturalNote) return line;
    const { culturalNote: _ignoredCulturalNote, ...lineWithoutCulturalNote } = line;
    return lineWithoutCulturalNote;
  });
  return reuseLyricsPresentation(lyrics, annotated);
}
