import { readVocalOriginalText } from "../../lyrics/lyricSupplementPresentation.mjs";

function readTimestamp(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function createOverlayLyricPayload({ findDistinctSupplement, readLineSupplement }) {
  const mapLyricsForSender = (lyrics, offset, visibility = { pronunciation: true, translation: true }) => {
      const safeOffset = Number(offset);
      const normalizedOffset = Number.isFinite(safeOffset) ? safeOffset : 0;

      const mapTimedSyllables = (rawSyllables, fallbackLineEnd) => {
          if (!Array.isArray(rawSyllables)) return [];

          const timed = [];
          let nextStart = fallbackLineEnd;
          for (let index = rawSyllables.length - 1; index >= 0; index--) {
              const syllable = rawSyllables[index];
              const start = readTimestamp(syllable?.startTime);
              if (start === null) continue;
              const end = readTimestamp(syllable.endTime) ?? nextStart;
              nextStart = start;

              const text = String(syllable.text ?? '');
              if (!text) continue;
              const startTime = Math.round(start + normalizedOffset);
              const endTime = end === null
                  ? startTime + 1
                  : Math.max(startTime + 1, Math.round(end + normalizedOffset));
              timed.push({ startTime, endTime, text });
          }
          return timed.reverse();
      };

      const mapVocalPart = (part, fallbackLineEnd, fallbackRole) => {
          if (!part || typeof part !== 'object') return null;

          const syllables = mapTimedSyllables(part.syllables, fallbackLineEnd);
          if (syllables.length === 0) return null;

          const getString = (value) => typeof value === 'string' ? value : '';
          const text = readVocalOriginalText(part, syllables);
          return {
              id: getString(part.id),
              role: getString(part.role) || fallbackRole,
              speaker: getString(part.speaker),
              speakerColor: getString(part.speakerColor ?? part['speaker-color']),
              speakerFallback: getString(part.speakerFallback ?? part['speaker-fallback']),
              kind: getString(part.kind) || 'vocal',
              text,
              phonetic: visibility.pronunciation
                  ? readLineSupplement(part, 'pronunciation', text) || ''
                  : '',
              translation: visibility.translation
                  ? readLineSupplement(part, 'translation', text) || ''
                  : '',
              syllables
          };
      };

      return lyrics.map(line => {
          const originalCandidate = line?.originalText ?? line?.text ?? '';
          const originalText = typeof originalCandidate === 'string'
              ? originalCandidate
              : String(originalCandidate ?? '');
          const pronText = visibility.pronunciation ? findDistinctSupplement([
              line?.phoneticText,
              line?.pronunciationText,
              line?.pronText,
              typeof line?.text === 'string'
                  ? line.text
                  : null
          ], originalText) : null;
          const transText = visibility.translation ? findDistinctSupplement([
              line?.text2,
              line?.translation,
              line?.translationText,
              line?.transText
          ], originalText) : null;

          const rawStartTime = readTimestamp(line?.startTime);
          const rawEndTime = readTimestamp(line?.endTime);
          const startTime = Math.round((rawStartTime ?? 0) + normalizedOffset);
          const endTime = rawEndTime !== null
              ? Math.round(rawEndTime + normalizedOffset)
              : null;

          const directSyllables = Array.isArray(line?.syllables)
              ? line.syllables
              : [];
          const syllables = mapTimedSyllables(directSyllables, rawEndTime);

          const lead = mapVocalPart(line?.vocals?.lead, rawEndTime, 'lead');
          const background = Array.isArray(line?.vocals?.background)
              ? line.vocals.background
                  .map(part => mapVocalPart(part, rawEndTime, 'background'))
                  .filter(Boolean)
              : [];
          const vocals = lead
              ? { lead, background }
              : null;
          const getString = (value) => typeof value === 'string' ? value : '';

          return {
              startTime,
              endTime,
              text: originalText,
              pronText,
              transText,
              speaker: getString(line?.speaker),
              speakerColor: getString(line?.speakerColor ?? line?.['speaker-color']),
              speakerFallback: getString(line?.speakerFallback ?? line?.['speaker-fallback']),
              kind: getString(line?.kind),
              ...(vocals
                  ? { vocals }
                  : syllables.length > 0
                      ? { syllables }
                      : {})
          };
      });
  };

  return mapLyricsForSender;
}
