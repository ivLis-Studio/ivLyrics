const IV_LYRICS_COMPARISON_APOSTROPHE_REGEX = /[\u0060\u00B4\u02B9\u02BB\u02BC\u02BE\u02BF\u055A\u07F4\u07F5\u2018\u2019\u201B\u2032\u275B\u275C\uFF07]/gu;

const normalizeIvLyricsComparableText = (value) => String(value || "")
  .normalize("NFKC")
  .toLowerCase()
  // Some apostrophe-like characters are Unicode letters, so normalize them
  // before removing punctuation. Otherwise identical contractions can differ.
  .replace(IV_LYRICS_COMPARISON_APOSTROPHE_REGEX, "'")
  .replace(/[\p{P}\p{S}\p{M}\p{Cf}]/gu, "")
  .replace(/[\s\p{Z}]+/gu, " ")
  .trim();

const areIvLyricsTextsEquivalent = (leftValue, rightValue) => {
  const left = normalizeIvLyricsComparableText(leftValue);
  const right = normalizeIvLyricsComparableText(rightValue);
  if (!left || !right) return false;
  if (left === right) return true;

  // AI providers sometimes insert visual word spacing into CJK lyrics or
  // around an apostrophe. Those spaces do not add another displayable line.
  return left.replace(/[\s\p{Z}]+/gu, "") === right.replace(/[\s\p{Z}]+/gu, "");
};

export const lyricsTextComparison = Object.freeze({
  normalize: normalizeIvLyricsComparableText,
  areEquivalent: areIvLyricsTextsEquivalent,
});

const SECTION_PATTERNS = [
  /^\s*\[\s*(verse|chorus|bridge|intro|outro|pre-?chorus|hook|refrain)\s*(\d+)?\s*(:|：)?\s*.*\]\s*$/i,
  /^\s*\[\s*(절|후렴|브릿지|인트로|아웃트로|간주|부분)\s*(\d+)?\s*(:|：)?\s*.*\]\s*$/i,
  /^\s*\[\s*(ヴァース|コーラス|ブリッジ|イントロ|アウトロ)\s*(\d+)?\s*(:|：)?\s*.*\]\s*$/i,
  /^\s*\[\s*(verse|chorus|bridge|intro|outro)\s*(\d+)?\s*(:|：)?\s*[^,[\]]*\]\s*$/i,
];

export function isLyricsSectionHeader(text) {
  if (typeof text !== "string" || !text) return false;
  const line = text.trim();
  return /^\[.*\]$/.test(line) && SECTION_PATTERNS.some(pattern => pattern.test(line));
}

// The standalone sender uses literal comparison until the page installs the
// broader display comparison. Preserve accents and punctuation in that mode.
export function areLiterallyEquivalentLyrics(left, right) {
  const normalize = (text) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
  return normalize(left) === normalize(right);
}
