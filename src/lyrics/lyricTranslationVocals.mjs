import { isLyricsSectionHeader } from "./translationTextComparison.mjs";

export const getTranslationPartText = (part) => {
  const directText = typeof part?.text === "string" ? part.text.trim() : "";
  if (directText) {
    return directText;
  }

  if (Array.isArray(part?.syllables)) {
    return part.syllables.map((syllable) => syllable?.text || "").join("").trim();
  }

  return "";
};

export const getDisplayedVocalParts = (line) => {
  if (!Array.isArray(line?.vocals?.lead?.syllables) || line.vocals.lead.syllables.length === 0) {
    return null;
  }

  const parts = [];
  const leadText = getTranslationPartText(line.vocals.lead);
  if (leadText) {
    parts.push({
      role: "lead",
      index: -1,
      text: leadText,
    });
  }

  if (Array.isArray(line.vocals.background)) {
    line.vocals.background.forEach((part, index) => {
      if (!Array.isArray(part?.syllables) || part.syllables.length === 0) {
        return;
      }

      const text = getTranslationPartText(part);
      if (text) {
        parts.push({
          role: "background",
          index,
          text,
        });
      }
    });
  }

  return parts.length > 1 ? parts : null;
};

export function buildLyricTranslationRequests(lyrics, { splitVocalParts = true, isSectionHeader = isLyricsSectionHeader } = {}) {
  if (!Array.isArray(lyrics)) return [];
  return lyrics.flatMap((line, lineIndex) => {
    const text = String(line?.originalText || line?.text || "").trim();
    if (!text || isSectionHeader(text)) return [];
    const vocalParts = splitVocalParts ? getDisplayedVocalParts(line) : null;
    return vocalParts
      ? vocalParts.map(vocalPart => ({ lineIndex, vocalPart, text: vocalPart.text }))
      : [{ lineIndex, vocalPart: null, text }];
  });
}
