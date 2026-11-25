import { readVocalOriginalText } from "../../lyrics/lyricSupplementPresentation.mjs";

export function createOverlayLyricPayload({ findDistinctSupplement, readLineSupplement }) {
  const mapLyricsForSender = (lyrics, offset, visibility = { pronunciation: true, translation: true }) => {
      const safeOffset = Number(offset);
      const normalizedOffset = Number.isFinite(safeOffset) ? safeOffset : 0;

      const mapTimedSyllables = (rawSyllables, fallbackLineEnd) => {
          if (!Array.isArray(rawSyllables)) return [];

          return rawSyllables
              .map((syllable, index) => {
                  const rawSyllableStart = Number(syllable?.startTime);
                  if (!Number.isFinite(rawSyllableStart)) return null;

                  const nextSyllableStart = Number(rawSyllables[index + 1]?.startTime);
                  const rawSyllableEnd = Number(syllable?.endTime);
                  const fallbackEnd = Number.isFinite(nextSyllableStart)
                      ? nextSyllableStart
                      : fallbackLineEnd;
                  const resolvedEnd = Number.isFinite(rawSyllableEnd)
                      ? rawSyllableEnd
                      : fallbackEnd;
                  const syllableStart = Math.round(rawSyllableStart + normalizedOffset);
                  const syllableEnd = Number.isFinite(resolvedEnd)
                      ? Math.max(syllableStart + 1, Math.round(resolvedEnd + normalizedOffset))
                      : syllableStart + 1;
                  const syllableText = typeof syllable?.text === 'string'
                      ? syllable.text
                      : String(syllable?.text ?? '');

                  if (!syllableText) return null;
                  return {
                      startTime: syllableStart,
                      endTime: syllableEnd,
                      text: syllableText
                  };
              })
              .filter(Boolean);
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

          const rawStartTime = Number(line?.startTime);
          const rawEndTime = line?.endTime == null ? null : Number(line.endTime);
          const startTime = Math.round((Number.isFinite(rawStartTime) ? rawStartTime : 0) + normalizedOffset);
          const endTime = rawEndTime !== null && Number.isFinite(rawEndTime)
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
