import { getTranslationSourceCacheHash } from "./translationPresentation.mjs";
import { isUserEditedTranslation, readTranslationResultLines } from "./translationCache.mjs";

export function createCacheEditorReader({
  buildTranslationLineRequests, getLegacyNonSectionLyricsText, getTranslationResultCacheHash, getPronunciationSlots,
}) {
  function mapLegacyCacheLinesToEditor(lines, baseLyrics, sourceRequests) {
    const legacyRequests = buildTranslationLineRequests(baseLyrics, {
      splitVocalParts: false,
    });
    if (!Array.isArray(lines) || lines.length !== legacyRequests.length) {
      return null;
    }

    const firstEditorIndexByLine = new Map();
    sourceRequests.forEach((request, index) => {
      if (!firstEditorIndexByLine.has(request.lineIndex)) {
        firstEditorIndexByLine.set(request.lineIndex, index);
      }
    });

    const editorLines = Array.from({ length: sourceRequests.length }, () => "");
    legacyRequests.forEach((request, index) => {
      const editorIndex = firstEditorIndexByLine.get(request.lineIndex);
      if (editorIndex !== undefined) {
        editorLines[editorIndex] = String(lines[index] ?? "");
      }
    });
    return editorLines;
  }

  async function getCacheEditorTranslation({
    trackId,
    targetLanguage,
    isPhonetic,
    sourceHash,
    provider,
    baseLyrics,
    sourceRequests,
    cache,
    canRead,
  }) {
    const sourceText = sourceRequests.map((request) => request.text).join("\n");
    const legacyText = getLegacyNonSectionLyricsText(baseLyrics);
    const legacyHash = getTranslationResultCacheHash(legacyText, isPhonetic);
    const plainSourceHash = getTranslationSourceCacheHash(sourceText);
    const plainLegacyHash = getTranslationSourceCacheHash(legacyText);
    const providers = provider ? [provider, null] : [null];
    const candidates = [];
    const seen = new Set();
    const addCandidate = (candidateProvider, hash, splitVocalParts) => {
      const key = `${candidateProvider || ""}:${hash || ""}:${splitVocalParts}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ provider: candidateProvider, hash, splitVocalParts });
    };

    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, sourceHash, true)
    );
    // Recover entries saved by older cache editors that did not include the
    // pronunciation notation or translation style in the key.
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, plainSourceHash, true)
    );
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, legacyHash, false)
    );
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, plainLegacyHash, false)
    );
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, null, false)
    );

    for (const candidate of candidates) {
      if (!canRead()) return null;
      const record = await cache.getTranslation(
        trackId,
        targetLanguage,
        isPhonetic,
        candidate.provider,
        candidate.hash
      );
      if (!canRead()) return null;
      const cacheLines = readTranslationResultLines(record, isPhonetic)?.map(line => String(line ?? ""));
      if (!cacheLines || (!isUserEditedTranslation(record) && !cacheLines.some(line => line.trim()))) {
        continue;
      }

      if (candidate.splitVocalParts) {
        if (cacheLines.length === sourceRequests.length) {
          return {
            lines: cacheLines,
            slots: isPhonetic ? getCacheEditorSlots(sourceText, record, cacheLines) : [],
          };
        }
        continue;
      }

      const mappedLines = mapLegacyCacheLinesToEditor(
        cacheLines,
        baseLyrics,
        sourceRequests
      );
      if (mappedLines) {
        return { lines: mappedLines, slots: [] };
      }
    }

    return { lines: [], slots: [] };
  }

  // Unit pronunciation stored with the line pronunciation, for lines whose
  // stored line is still exactly the joined units.
  function getCacheEditorSlots(sourceText, cache, lines) {
    const slotsApi = getPronunciationSlots();
    if (!slotsApi || !cache?.slots) return [];
    return slotsApi.readRecordLines(sourceText, cache).map((entry, index) =>
      entry && slotsApi.join(entry.units, entry.parts) === String(lines[index] ?? "")
        ? entry
        : null
    );
  }

  return getCacheEditorTranslation;
}

export function buildCacheEditorText(lines, expectedCount) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const normalizedLines = Array.from({ length: expectedCount }, (_, index) => {
    const line = safeLines[index];
    return typeof line === "string" ? line : String(line ?? "");
  });
  return normalizedLines.join("\n");
}

export function normalizeCacheEditorLines(text, expectedCount) {
  const normalizedText = String(text ?? "").replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");

  if (lines.length > expectedCount) {
    return null;
  }

  while (lines.length < expectedCount) {
    lines.push("");
  }

  return lines;
}

export function captureEditorPronunciationSlots(slotsApi, lines, slots) {
  if (!slotsApi || !Array.isArray(slots)) return null;
  const slotsByLine = new Map();
  slots.forEach((entry, index) => {
    if (
      entry &&
      index < lines.length &&
      slotsApi.join(entry.units, entry.parts) === lines[index]
    ) {
      slotsByLine.set(index, entry.parts);
    }
  });
  return slotsApi.buildRecordSlots?.(lines.length, slotsByLine) || null;
}
