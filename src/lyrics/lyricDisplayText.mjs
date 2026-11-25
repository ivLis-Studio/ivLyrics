export const safeRenderText = (value) => {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		// Handle React elements
		if (value && typeof value === 'object' && value.$$typeof) {
			return value; // React element, return as-is
		}
		// Handle line objects for karaoke
		if (value.text) return value.text;
		if (value.syllables) return value;
		if (value.vocals) return value;
		// Fallback: return empty string for other objects
		return "";
	}
	return String(value);
};

// Unified function to handle lyrics display mode logic
const getFirstTrimmedString = (...values) => {
	for (const value of values) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return "";
};

export const getEmbeddedAuxiliaryDisplayValues = (line) => {
	const phoneticText = getFirstTrimmedString(
		line?.phoneticText,
		line?.phonetic,
		line?.pronunciationText,
		line?.pronText
	);
	const translationText = getFirstTrimmedString(
		line?.translationText,
		line?.translation,
		line?.transText
	);
	const displayTranslationText = typeof line?.text2 === "string" && line.text2.trim()
		? line.text2.trim()
		: translationText;
	if (!phoneticText && !translationText) {
		const hasExplicitOriginalText = line?.originalText !== null && line?.originalText !== undefined;
		return {
			// A raw provider may supply both fields with the same original lyric.
			// Generic `text` is not a typed pronunciation value, so never promote it
			// into the pronunciation slot when no explicit supplement exists.
			text: null,
			originalText: hasExplicitOriginalText ? line?.originalText : line?.text,
			text2: line?.text2,
		};
	}

	return {
		// Keep the two semantic slots independent. Promoting a translation into
		// `text` makes the shared line renderer display it as pronunciation.
		text: phoneticText || null,
		originalText: line?.originalText || line?.text || "",
		text2: displayTranslationText || null,
	};
};

export const normalizeUnsyncedLyrics = (lyrics) => {
	if (!lyrics) {
		return [];
	}
	if (Array.isArray(lyrics)) {
		return lyrics.filter(item => item !== null && item !== undefined);
	}
	if (typeof lyrics === "string") {
		return lyrics.split("\n").map((text, index) => ({ text, index }));
	}
	return [];
};

export const getCopyableText = (value) => {
	if (value === null || value === undefined) {
		return "";
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (typeof value === "object") {
		if (Array.isArray(value)) {
			return value.map(getCopyableText).join("");
		}

		if (value.props?.children !== undefined) {
			return getCopyableText(value.props.children);
		}

		if (typeof value.text === "string") {
			return value.text;
		}
	}

	return safeRenderText(value) || "";
};

function selectLyricsDisplay(displayMode, isKara, line, text, originalText, text2, applyFurigana) {
	if (isKara) {
		// Only typed fields can supply karaoke pronunciation. A provider may
		// repeat the original lyric in both text and originalText.
		const pronunciation = line?.phoneticText || line?.phonetic;
		return {
			mainText: line,
			subText: pronunciation ? safeRenderText(pronunciation) : null,
			subText2: safeRenderText(line?.translationText || line?.translation || text2),
		};
	}

	if (displayMode === "replace" && (text || text2)) {
		// Preserve the existing pronunciation-first order for two supplements.
		return {
			mainText: safeRenderText(text || text2),
			subText: text && text2 ? safeRenderText(text2) : null,
			subText2: null,
		};
	}

	const original = safeRenderText(originalText);
	const mainText = typeof original === "string" ? applyFurigana(original) : original;
	return {
		mainText,
		subText: displayMode === "below" && text ? safeRenderText(text) : null,
		subText2: displayMode === "below" && text2 ? safeRenderText(text2) : null,
	};
}

export function createLyricDisplayResolver({ readDisplayMode, applyFurigana }) {
	const getLyricsDisplayMode = (isKara, line, text, originalText, text2) =>
		selectLyricsDisplay(readDisplayMode(), isKara, line, text, originalText, text2, applyFurigana);

	const getUnsyncedLineRenderData = (text, originalText, text2) => {
		const displayMode = readDisplayMode();
		const { mainText: lineText, subText, subText2: showMode2Translation } =
			selectLyricsDisplay(displayMode, false, null, text, originalText, text2, applyFurigana);

		const belowOrigin = (typeof originalText === "object"
			? originalText?.props?.children?.[0]
			: originalText)?.replace(/\s+/g, "");
		const belowTxt = (typeof text === "object"
			? text?.props?.children?.[0]
			: text)?.replace(/\s+/g, "");

		const showTranslatedBelow = displayMode === "below";
		const replaceOriginal = displayMode === "replace";
		const belowMode = showTranslatedBelow && originalText && belowOrigin !== belowTxt;
		const showMode2 = !!showMode2Translation && (showTranslatedBelow || replaceOriginal);

		return {
			lineText,
			subText,
			showMode2Translation,
			belowMode,
			showMode2,
		};
	};

	const buildLyricDisplayState = (isKara, line, text, originalText, text2) => {
		const { mainText, subText, subText2 } = getLyricsDisplayMode(
			isKara,
			line,
			text,
			originalText,
			text2
		);

		return {
			mainText,
			subText,
			subText2,
			hasSubLine: !!subText || !!subText2 || !!line?.culturalNote,
			originalText,
		};
	};

	return { getLyricsDisplayMode, getUnsyncedLineRenderData, buildLyricDisplayState };
}

export const getPlainLyricsLineText = (line) => {
  if (typeof line === "string") return line;
  if (!line || typeof line !== "object") return "";
  return String(
    line.originalText ??
    line.text ??
    line.mainText ??
    line.line ??
    ""
  ).trim();
};

export const getPlainLyricsLines = (...sources) => {
  for (const source of sources) {
    if (typeof source === "string") {
      const lines = source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text) => ({ text }));
      if (lines.length > 0) return lines;
      continue;
    }

    if (!Array.isArray(source)) continue;
    const lines = source
      .map(getPlainLyricsLineText)
      .filter(Boolean)
      .map((text) => ({ text }));
    if (lines.length > 0) return lines;
  }

  return [];
};
