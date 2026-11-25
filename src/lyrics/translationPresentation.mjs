import { isLyricsSectionHeader, lyricsTextComparison } from "./translationTextComparison.mjs";
import { isPronunciationMode as isPronunciationDisplayMode } from "./lyricTranslationModes.mjs";
import { buildLyricTranslationRequests, getTranslationPartText } from "./lyricTranslationVocals.mjs";
import { isEditedLyricSupplement, setEditedLyricSupplements } from "./lyricSupplementEdits.mjs";

const getTranslationSourceCacheHash = (text) => {
  const value = String(text || "").normalize("NFC");
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return `src-${(hash >>> 0).toString(36)}-${value.length.toString(36)}`;
};

const cloneTranslationVocals = (vocals) => {
  if (!vocals?.lead) {
    return vocals;
  }

  return {
    ...vocals,
    lead: { ...vocals.lead },
    background: Array.isArray(vocals.background)
      ? vocals.background.map((part) => ({ ...part }))
      : vocals.background,
  };
};

const hasSameLyricsPresentationFields = (previous, next) => {
  if (previous === next) return true;
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") return false;
  const keys = Object.keys(next);
  return Object.keys(previous).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(previous, key) && Object.is(previous[key], next[key]));
};

// Streamed supplements change only a few rows at a time. Share unchanged
// presentation nodes without walking (or hashing) the syllable/timing payload.
const reuseLyricsPresentation = (previous, next) => {
  if (!Array.isArray(previous) || !Array.isArray(next)) return next;
  let unchanged = previous.length === next.length;
  const result = next.map((line, index) => {
    const before = previous[index];
    let candidate = line;
    if (before?.vocals && line?.vocals && before.vocals !== line.vocals) {
      const lead = hasSameLyricsPresentationFields(before.vocals.lead, line.vocals.lead)
        ? before.vocals.lead : line.vocals.lead;
      let background = line.vocals.background;
      if (Array.isArray(background) && Array.isArray(before.vocals.background)) {
        background = background.map((part, partIndex) =>
          hasSameLyricsPresentationFields(before.vocals.background[partIndex], part)
            ? before.vocals.background[partIndex] : part);
        if (background.length === before.vocals.background.length
          && background.every((part, partIndex) => part === before.vocals.background[partIndex])) {
          background = before.vocals.background;
        }
      }
      const vocals = { ...line.vocals };
      if (Object.prototype.hasOwnProperty.call(vocals, "lead")) vocals.lead = lead;
      if (Object.prototype.hasOwnProperty.call(vocals, "background")) vocals.background = background;
      candidate = { ...line, vocals: hasSameLyricsPresentationFields(before.vocals, vocals) ? before.vocals : vocals };
    }
    const shared = hasSameLyricsPresentationFields(before, candidate) ? before : candidate;
    if (shared !== before) unchanged = false;
    return shared;
  });
  return unchanged ? previous : result;
};

const withoutVocalSupplementField = (vocals, field) => {
  if (!vocals?.lead || !field) {
    return vocals;
  }
  if (!Object.prototype.hasOwnProperty.call(vocals.lead, field)
    && (!Array.isArray(vocals.background)
      || !vocals.background.some(part => Object.prototype.hasOwnProperty.call(part || {}, field)))) {
    return vocals;
  }

  const nextVocals = cloneTranslationVocals(vocals);
  delete nextVocals.lead[field];
  if (Array.isArray(nextVocals.background)) {
    nextVocals.background.forEach((part) => delete part[field]);
  }
  return nextVocals;
};

const assignTranslationVocalResult = (vocals, vocalPart, targetField, value) => {
  if (!vocals || !vocalPart || !targetField || !value) {
    return;
  }

  const target = vocalPart.role === "lead"
    ? vocals.lead
    : vocals.background?.[vocalPart.index];
  if (!target) {
    return;
  }

  target[targetField] = value;
};

const mergeVocalTranslationFields = (baseVocals, modeVocals, targetField, transformValue = (value) => value) => {
  if (!baseVocals?.lead || !modeVocals?.lead || !targetField) {
    return baseVocals;
  }

  let nextVocals = baseVocals;
  const ensureVocals = () => {
    if (nextVocals === baseVocals) {
      nextVocals = cloneTranslationVocals(baseVocals);
    }
    return nextVocals;
  };
  const applyPart = (sourcePart, getTargetPart) => {
    const rawValue = sourcePart?.[targetField];
    const baseTargetPart = getTargetPart(baseVocals);
    const transformedValue = transformValue(
      typeof rawValue === "string" ? rawValue : String(rawValue || ""),
      baseTargetPart,
      sourcePart
    );
    const value = typeof transformedValue === "string" ? transformedValue.trim() : String(transformedValue || "").trim();
    if (!value) {
      if (baseTargetPart && Object.prototype.hasOwnProperty.call(baseTargetPart, targetField)) {
        const targetPart = getTargetPart(ensureVocals());
        if (targetPart) delete targetPart[targetField];
      }
      return;
    }
    if (baseTargetPart?.[targetField] === value) return;

    const targetPart = getTargetPart(ensureVocals());
    if (targetPart) {
      targetPart[targetField] = value;
    }
  };

  applyPart(modeVocals.lead, (vocals) => vocals.lead);

  if (Array.isArray(modeVocals.background) && Array.isArray(baseVocals.background)) {
    modeVocals.background.forEach((part, index) => {
      applyPart(part, (vocals) => vocals.background?.[index]);
    });
  }

  return nextVocals;
};

const isTranslationNoteLine = (text) => {
  const t = String(text || "").trim();
  if (!t) return true;
  return /^[\s♪♩♫♬·•・。.、…~-]+$/.test(t);
};

function createTranslationPresentation({
  isSectionHeader = isLyricsSectionHeader,
  areEquivalent = lyricsTextComparison.areEquivalent,
  normalizeForComparison = lyricsTextComparison.normalize,
  getPhoneticHyphenMode,
}) {
  const buildTranslationLineRequests = (lyrics, options) =>
    buildLyricTranslationRequests(lyrics, { isSectionHeader, splitVocalParts: options?.splitVocalParts !== false });

  const getNonSectionLyricsText = (lyrics = []) =>
    buildTranslationLineRequests(lyrics)
      .map((request) => request.text || "")
      .join("\n");

  const getLegacyNonSectionLyricsText = (lyrics = []) =>
    lyrics
      .map((line) => line?.originalText || line?.text || "")
      .filter((line) => line && !isSectionHeader(line))
      .join("\n");

  const getLyricsProcessingShapeSignature = (lyrics = []) => {
    if (!Array.isArray(lyrics)) return "0:0:src-0-0:";
    const requests = buildTranslationLineRequests(lyrics);
    const sourceHash = getTranslationSourceCacheHash(
      requests.map((request) => request.text || "").join("\n")
    );
    const vocalShape = lyrics.map((line) => {
      if (!line?.vocals?.lead) return "s";
      const backgroundCount = Array.isArray(line.vocals.background)
        ? line.vocals.background.length
        : 0;
      return `v${backgroundCount + 1}`;
    }).join(".");
    return `${lyrics.length}:${requests.length}:${sourceHash}:${vocalShape}`;
  };

  const mapTranslationLinesToLyrics = (lyrics = [], linesInput = [], options = {}) => {
    if (!Array.isArray(lyrics) || !Array.isArray(linesInput)) {
      return null;
    }

    const targetField = options?.targetField || null;
    const splitVocalParts = options?.splitVocalParts !== false;
    const userEdited = options?.userEdited === true;
    const translationRequests = buildTranslationLineRequests(lyrics, { splitVocalParts });
    const requestResultsByLine = new Map();
    let resultLineIndex = 0;

    const readNextResultLine = () => {
      while (
        !userEdited && resultLineIndex < linesInput.length &&
        linesInput[resultLineIndex] !== undefined &&
        linesInput[resultLineIndex] !== null &&
        isSectionHeader(String(linesInput[resultLineIndex]).trim())
      ) {
        resultLineIndex++;
      }

      return String(linesInput[resultLineIndex++] ?? "").trim();
    };

    translationRequests.forEach((request) => {
      const entry = {
        ...request,
        resultText: readNextResultLine(),
      };
      const entries = requestResultsByLine.get(request.lineIndex) || [];
      entries.push(entry);
      requestResultsByLine.set(request.lineIndex, entries);
    });

    return lyrics.map((line, lineIndex) => {
      const originalText = line?.originalText || line?.text || "";

      if (isSectionHeader(originalText)) {
        return {
          ...line,
          text: null,
          originalText,
        };
      }

      if (originalText.trim() === "") {
        return {
          ...line,
          text: "",
          originalText,
        };
      }

      const requestEntries = requestResultsByLine.get(lineIndex) || [];
      const translatedText = requestEntries
        .map((entry) => areEquivalent(entry.resultText, entry.text)
          ? ""
          : entry.resultText)
        .filter(Boolean)
        .join(" / ");

      const vocalEntries = requestEntries.filter((entry) => entry.vocalPart);
      let vocals = line?.vocals;
      if (targetField && vocalEntries.length > 0 && line?.vocals?.lead) {
        vocals = cloneTranslationVocals(line.vocals);
        delete vocals.lead[targetField];
        if (Array.isArray(vocals.background)) {
          vocals.background.forEach((part) => delete part[targetField]);
        }
        vocalEntries.forEach((entry) => {
          const value = areEquivalent(entry.resultText, entry.text)
            ? ""
            : entry.resultText;
          assignTranslationVocalResult(vocals, entry.vocalPart, targetField, value);
        });
      }

      return setEditedLyricSupplements({
        ...line,
        vocals,
        text: userEdited ? translatedText : (translatedText || line?.text || ""),
        originalText,
      }, userEdited && targetField === "phonetic", userEdited && targetField === "translation");
    });
  };

  const areTranslationTextsSimilar = (text1, text2) => {
    if (!text1 || !text2) return false;
    const norm1 = normalizeForComparison(text1);
    const norm2 = normalizeForComparison(text2);
    if (!norm1 || !norm2) return false;
    if (areEquivalent(text1, text2)) return true;
    const words1 = norm1.split(" ").filter((w) => w.length > 2);
    const words2 = norm2.split(" ").filter((w) => w.length > 2);
    if (words1.length === 0 || words2.length === 0) return false;
    const words2Set = new Set(words2);
    const commonWords = words1.filter((word) => words2Set.has(word));
    const similarity =
      commonWords.length / Math.max(words1.length, words2.length);
    return similarity > 0.85;
  };

  const composeLyricSupplements = (
    originalLyrics,
    mode1,
    mode2,
    displayMode1,
    displayMode2
  ) => {
    // Determine which mode is phonetic (romaji) and which is translation
    const mode1IsPhonetic = isPronunciationDisplayMode(displayMode1);
    const mode2IsPhonetic = isPronunciationDisplayMode(displayMode2);
    const phoneticModeEnabled = mode1IsPhonetic || mode2IsPhonetic;
    const translationModeEnabled = Boolean(
      (displayMode1 && displayMode1 !== "none" && !mode1IsPhonetic) ||
      (displayMode2 && displayMode2 !== "none" && !mode2IsPhonetic)
    );

    // Process each line to determine what to display
    return originalLyrics.map((line, i) => {
      // React 31 방지: null/undefined 체크 및 안전한 텍스트 추출
      if (!line) {
        return { text: null, text2: null, originalText: "" };
      }

      // Safely extract original text
      const originalText =
        typeof line === "object" ? line.originalText || line.text || "" : String(line || "");
      let translation1 = "";
      let translation2 = "";

      // Safely extract translations with boundary check
      if (mode1 && Array.isArray(mode1) && i < mode1.length && mode1[i]) {
        translation1 =
          typeof mode1[i] === "object"
            ? mode1[i].text || ""
            : String(mode1[i] || "");
      }
      if (mode2 && Array.isArray(mode2) && i < mode2.length && mode2[i]) {
        translation2 =
          typeof mode2[i] === "object"
            ? mode2[i].text || ""
            : String(mode2[i] || "");
      }

      // If original is a note/placeholder line, never show sub-lines
      if (isTranslationNoteLine(originalText)) {
        let vocals = withoutVocalSupplementField(line?.vocals, "phonetic");
        vocals = withoutVocalSupplementField(vocals, "translation");
        const noteLine = {
          ...line,
          vocals,
          originalText,
          text: null,
          text2: null,
          phoneticText: null,
          translationText: null,
        };
        delete noteLine.phonetic;
        delete noteLine.pronunciationText;
        delete noteLine.pronText;
        delete noteLine.translation;
        delete noteLine.transText;
        return noteLine;
      }

      // Ignore translations that are notes-only
      if (isTranslationNoteLine(translation1)) translation1 = "";
      if (isTranslationNoteLine(translation2)) translation2 = "";

      const normalizedTrans1 = normalizeForComparison(translation1);
      const normalizedTrans2 = normalizeForComparison(translation2);

      const trans1SameAsOriginal =
        normalizedTrans1 && areEquivalent(translation1, originalText);
      const trans2SameAsOriginal =
        normalizedTrans2 && areEquivalent(translation2, originalText);
      const translationsSame =
        normalizedTrans1 &&
        normalizedTrans2 &&
        (areEquivalent(translation1, translation2) ||
          areTranslationTextsSimilar(translation1, translation2));

      let finalText = null; // This will be phonetic (romaji/발음)
      let finalText2 = null; // This will be translation (번역)

      // Helper function to process phonetic hyphen replacement
      const processPhoneticHyphen = (text) => {
        if (!text || typeof text !== "string") return text;
        const hyphenMode = getPhoneticHyphenMode() || "keep";
        if (hyphenMode === "keep") return text;
        if (hyphenMode === "space") return text.replace(/-/g, " ");
        if (hyphenMode === "remove") return text.replace(/-/g, "");
        return text;
      };

      // Assign to correct slots based on mode types
      let phoneticText = "";
      let translationText = "";
      let phoneticSameAsOriginal = false;
      let translationSameAsOriginal = false;

      if (mode1IsPhonetic) {
        phoneticText = processPhoneticHyphen(translation1);
        phoneticSameAsOriginal = Boolean(trans1SameAsOriginal);
      } else if (mode1) {
        translationText = translation1;
        translationSameAsOriginal = Boolean(trans1SameAsOriginal);
      }

      if (mode2IsPhonetic) {
        phoneticText = processPhoneticHyphen(translation2);
        phoneticSameAsOriginal = Boolean(trans2SameAsOriginal);
      } else if (mode2) {
        translationText = translation2;
        translationSameAsOriginal = Boolean(trans2SameAsOriginal);
      }

      // Deduplication logic
      if (translationsSame) {
        const combinedText = translation1 || translation2;
        const bothPhonetic = mode1IsPhonetic && mode2IsPhonetic;
        if (bothPhonetic) {
          if (!phoneticSameAsOriginal) {
            finalText = processPhoneticHyphen(combinedText);
          }
        } else if (!translationSameAsOriginal && !trans1SameAsOriginal && !trans2SameAsOriginal) {
          // When pronunciation and translation unexpectedly return identical text,
          // keep a single copy in the translation slot. This prevents translated
          // prose from being presented as pronunciation.
          finalText2 = combinedText;
        }
      } else {
        // Compare each semantic result with the original associated with that
        // same result. Mode order may be translation-first or pronunciation-first.
        if (!phoneticSameAsOriginal && phoneticText) finalText = phoneticText;
        if (!translationSameAsOriginal && translationText) finalText2 = translationText;
      }

      // Provider/cached lines may already contain supplement fields. The
      // language rule is authoritative: disabled supplements must not leak
      // back into the renderer from the base line or a previous presentation.
      let finalVocals = line?.vocals;
      if (!phoneticModeEnabled) {
        finalVocals = withoutVocalSupplementField(finalVocals, "phonetic");
      }
      if (!translationModeEnabled) {
        finalVocals = withoutVocalSupplementField(finalVocals, "translation");
      }
      const mergeModeVocalResults = (modeLine, isPhoneticMode) => {
        const targetField = isPhoneticMode ? "phonetic" : "translation";
        finalVocals = mergeVocalTranslationFields(
          finalVocals,
          modeLine?.vocals,
          targetField,
          (value, originalPart) => {
            const processedValue = isPhoneticMode
              ? processPhoneticHyphen(value)
              : value;
            const text = String(processedValue || "").trim();
            return isTranslationNoteLine(text)
              || areEquivalent(text, getTranslationPartText(originalPart))
              ? ""
              : text;
          }
        );
      };

      if (mode1 && Array.isArray(mode1) && i < mode1.length && mode1[i]) {
        mergeModeVocalResults(mode1[i], mode1IsPhonetic);
      }
      if (mode2 && Array.isArray(mode2) && i < mode2.length && mode2[i]) {
        mergeModeVocalResults(mode2[i], mode2IsPhonetic);
      }

      // Create safe line object ensuring all properties are valid
      const finalPhoneticText = finalText ? String(finalText) : null;
      const finalTranslationText = finalText2 ? String(finalText2) : null;
      const safeLine = {
        ...(line && typeof line === "object" ? line : {}),
        vocals: finalVocals,
        originalText: String(originalText),
        phoneticText: finalPhoneticText,
        text: finalPhoneticText,
        text2: finalTranslationText,
        translationText: finalTranslationText,
      };

      if (!finalPhoneticText) {
        delete safeLine.phonetic;
        delete safeLine.pronunciationText;
        delete safeLine.pronText;
      }
      if (!finalTranslationText) {
        delete safeLine.translation;
        delete safeLine.transText;
      }

      const phoneticModeLine = mode2IsPhonetic && mode2?.[i] ? mode2[i] : mode1IsPhonetic ? mode1?.[i] : null;
      const translationModeLine = !mode2IsPhonetic && mode2?.[i] ? mode2[i] : !mode1IsPhonetic ? mode1?.[i] : null;
      return setEditedLyricSupplements(safeLine, isEditedLyricSupplement(phoneticModeLine, "phonetic"),
        isEditedLyricSupplement(translationModeLine, "translation"));
    });

  };

  return {
    buildTranslationLineRequests,
    composeLyricSupplements,
    getLegacyNonSectionLyricsText,
    getLyricsProcessingShapeSignature,
    getNonSectionLyricsText,
    mapTranslationLinesToLyrics,
  };
}

export {
  createTranslationPresentation,
  getTranslationSourceCacheHash,
  isPronunciationDisplayMode,
  isTranslationNoteLine,
  mergeVocalTranslationFields,
  reuseLyricsPresentation,
  withoutVocalSupplementField,
};
