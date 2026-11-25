import { getTranslationSourceCacheHash } from "./translationPresentation.mjs";

const getTranslationOutputFromCache = (cached, isPhonetic = false) => {
  if (!cached) {
    return null;
  }
  return isPhonetic ? cached.phonetic : cached.translation || cached.vi;
};

const normalizeTranslationOutputLines = (outText) => {
  if (Array.isArray(outText)) {
    return outText;
  }
  if (typeof outText === "string") {
    return outText.replace(/\r\n?/g, "\n").split("\n");
  }
  return null;
};

export const isUserEditedTranslation = record => record?.userEdited === true;

export function readTranslationOutput(record, isPhonetic = false) {
  const output = getTranslationOutputFromCache(record, isPhonetic);
  if (isUserEditedTranslation(record) || !Array.isArray(output) || output.length !== 1 || typeof output[0] !== "string"
      || !output[0].trim().startsWith("{")) return output;
  try {
    const nested = getTranslationOutputFromCache(JSON.parse(output[0]), isPhonetic);
    return Array.isArray(nested) ? nested : output;
  } catch {
    return output;
  }
}

export const readTranslationResultLines = (record, isPhonetic = false) =>
  normalizeTranslationOutputLines(readTranslationOutput(record, isPhonetic));

export function hasValidTranslationLines(record, text, isPhonetic = false) {
  const resultLines = readTranslationResultLines(record, isPhonetic);
  const sourceLines = normalizeTranslationOutputLines(String(text ?? ""));
  if (!resultLines || resultLines.length !== sourceLines.length) return false;
  if (isUserEditedTranslation(record)) return resultLines.every(line => typeof line === "string");
  const hasText = line => !!String(line ?? "").trim();
  return resultLines.some(hasText)
    && sourceLines.every((line, index) => !hasText(line) || hasText(resultLines[index]));
}

function createTranslationCache({ getCache, getTranslationStyle, getPronunciationCacheTag, rememberPronunciationSlots }) {
  const getTranslationResultCacheHash = (text, isPhonetic = false) => {
    const sourceHash = getTranslationSourceCacheHash(text);
    if (isPhonetic) {
      return `${sourceHash}:${getPronunciationCacheTag()}`;
    }

    const translationStyle =
      getTranslationStyle();
    return translationStyle !== "natural"
      ? `${sourceHash}:style=${translationStyle}`
      : sourceHash;
  };

  const getCachedTranslationForText = async ({
    trackId,
    lang,
    isPhonetic = false,
    provider = null,
    text,
    canUse = () => true,
  }) => {
    const cacheApi = getCache();
    if (!cacheApi?.getTranslation || !trackId || !lang || !String(text || "").trim()) {
      return null;
    }

    try {
      const sourceHash = getTranslationResultCacheHash(text, isPhonetic);
      const cached = await cacheApi.getTranslation(trackId, lang, isPhonetic, provider, sourceHash);
      if (!canUse() || !hasValidTranslationLines(cached, text, isPhonetic)) return null;
      if (isPhonetic) {
        rememberPronunciationSlots(trackId, text, cached);
      }
      return cached;
    } catch (error) {
      return null;
    }
  };

  return { getTranslationResultCacheHash, getCachedTranslationForText };
}

export {
  createTranslationCache,
  getTranslationOutputFromCache,
  normalizeTranslationOutputLines,
};
