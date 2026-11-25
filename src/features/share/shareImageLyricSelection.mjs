import { getEmbeddedAuxiliaryDisplayValues } from '../../lyrics/lyricDisplayText.mjs';

export function normalizeShareImageLyrics(lyrics) {
  return (lyrics || []).map((line, idx) => {
    const embedded = getEmbeddedAuxiliaryDisplayValues(line);
    const lyricText = typeof line?.text === 'string' ? line.text.trim() : '';
    const originalText = (typeof line?.originalText === 'string' ? line.originalText.trim() : '') || lyricText;
    const pronunciation = embedded.text || lyricText;
    const pronText = pronunciation && pronunciation !== originalText ? pronunciation : null;
    const transText = typeof embedded.text2 === 'string' ? embedded.text2.trim() || null : null;

    return {
      idx,
      originalText,
      pronText,
      transText,
      displayText: originalText || pronText || '',
    };
  }).filter(l => l.displayText && !l.displayText.startsWith('♪'));
}

// Resolve per-word reading/gloss for share export using the same word-level
// supplements as the karaoke view (segmenter + ivLyricsWordSupplements).
// Returns a Map of line idx -> [{w, reading, gloss}]. Lines without data are
// absent from the map so the renderer falls back to line rendering.
export async function resolveShareWordDetails(lines, { segmenter, supplements, options }) {
  const details = new Map();
  if (!segmenter?.segmentLyrics) return details;
  await Promise.all((lines || []).map(async (line) => {
    try {
      const text = line?.originalText || line?.displayText || '';
      if (!text.trim()) return;
      const sourceLang = supplements?.resolveSourceLanguage
        ? supplements.resolveSourceLanguage(text)
        : 'auto';
      const surfaces = segmenter.segmentLyrics(text, sourceLang);
      if (!surfaces || surfaces.length === 0) return;
      const units = surfaces.map((surface) => ({ surface }));
      const [readings, glosses] = await Promise.allSettled([
        (async () => {
          const mode = supplements?.resolveReadingMode?.(sourceLang);
          if (mode) return supplements.getWordReadings(units, sourceLang, mode, text, options);
        })(),
        (async () => {
          if (supplements?.isGlossModeActive?.(sourceLang)) {
            return supplements.getWordGlosses(units, text, sourceLang, options);
          }
        })(),
      ]);
      details.set(line.idx, units.map((unit, index) => ({
        w: unit.surface,
        reading: String(readings.value?.[index] || ''),
        gloss: String(glosses.value?.[index] || ''),
      })));
    } catch { /* per-line failure falls back to line rendering */ }
  }));
  return details;
}
