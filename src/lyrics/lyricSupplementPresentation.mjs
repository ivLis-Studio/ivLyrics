import { isPronunciationDisplayMode } from "./translationPresentation.mjs";
import { areLiterallyEquivalentLyrics } from "./translationTextComparison.mjs";
import { hasStyleDependentLyricTranslation, matchesLyricTranslationStyle, normalizeLyricSourceLanguage } from "./lyricPresentationIdentity.mjs";
import { isEditedLyricSupplement } from "./lyricSupplementEdits.mjs";

export const getLyricSupplementVisibility = (presentationContext = null) => {
    const hasExplicitModes = !!presentationContext && (
        presentationContext.displayMode1 != null
        || presentationContext.displayMode2 != null
    );
    if (!hasExplicitModes) {
        return { pronunciation: true, translation: true };
    }

    const activeModes = [
        presentationContext?.displayMode1,
        presentationContext?.displayMode2
    ].filter(mode => mode && mode !== 'none');
    return {
        pronunciation: activeModes.some(isPronunciationDisplayMode),
        translation: activeModes.some(mode => !isPronunciationDisplayMode(mode))
    };
};

export function getLyricSupplementRetention(previous, next, visibility = getLyricSupplementVisibility(next)) {
    const previousSource = previous?.playbackPreferences?.configuredSourceLanguage;
    const nextSource = next?.playbackPreferences?.configuredSourceLanguage;
    if (previousSource !== undefined && nextSource !== undefined && previousSource !== nextSource) {
        return { pronunciation: false, translation: false };
    }
    return next && hasStyleDependentLyricTranslation(next)
        && !matchesLyricTranslationStyle(previous || {}, next.translationStyle || "natural")
        ? { ...visibility, translation: false }
        : visibility;
}

export const readVocalOriginalText = (part, syllables = part?.syllables) => {
    return (typeof part?.text === 'string' ? part.text : '')
        || (Array.isArray(syllables) ? syllables.map(syllable => syllable?.text ?? '').join('') : '');
};

function mapChangedLyrics(lyrics, mapLine) {
    let mapped = lyrics;
    for (let index = 0; index < lyrics.length; index++) {
        const line = lyrics[index];
        const next = mapLine(line, index);
        if (next !== line) {
            if (mapped === lyrics) mapped = lyrics.slice();
            mapped[index] = next;
        }
    }
    return mapped;
}

export function createLyricSupplementPresentation({ getDisplayComparison, hashSourceText }) {
  const areTextsEquivalent = (left, right) => {
      if (typeof left !== 'string' || typeof right !== 'string') return false;
      const compare = getDisplayComparison();
      if (typeof compare === 'function') {
          return compare(left, right);
      }
      return areLiterallyEquivalentLyrics(left, right);
  };

  const readDistinctSupplement = (value, originalText) => {
      if (typeof value !== 'string') return '';
      const text = value.trim();
      return text && !areTextsEquivalent(text, originalText) ? text : '';
  };

  const findDistinctSupplement = (values, originalText) => {
      for (const value of values) {
          const supplement = readDistinctSupplement(value, originalText);
          if (supplement) return supplement;
      }
      return null;
  };

  const readLineOriginalText = (line) => {
      const value = line?.originalText ?? line?.text ?? '';
      return typeof value === 'string' ? value : String(value ?? '');
  };

  const readLineSupplement = (line, type, originalText = readLineOriginalText(line)) => {
      const candidates = type === 'pronunciation'
          ? [
              line?.phonetic,
              line?.phoneticText,
              line?.pronunciationText,
              line?.pronText,
              typeof line?.text === 'string'
                  ? line.text
                  : null
          ]
          : [
              line?.text2,
              line?.translation,
              line?.translationText,
              line?.transText
          ];

      return findDistinctSupplement(candidates, originalText);
  };

  const getPresentationKey = (trackInfo, lyrics, presentationContext = null) => {
      const context = presentationContext || {};
      const sourceText = String(
          context.translationSourceText
          || lyrics.map(readLineOriginalText).join('\n')
      ).normalize('NFC');
      return JSON.stringify([
          trackInfo?.uri || '',
          context.provider || '',
          context.displayMode1 || 'none',
          context.displayMode2 || 'none',
          context.pronunciationNotation || 'translation',
          context.translationTargetLanguage || '',
          normalizeLyricSourceLanguage(context.detectedLanguage),
          hashSourceText(sourceText)
      ]);
  };

  // Preserve completed supplements when another view publishes the same lyrics.
  const preserveAuxiliaryLyrics = (
      previousLyrics,
      nextLyrics,
      visibility = { pronunciation: true, translation: true }
  ) => {
      if (
          previousLyrics === nextLyrics
          || !Array.isArray(previousLyrics)
          || !Array.isArray(nextLyrics)
          || previousLyrics.length !== nextLyrics.length
          || (!visibility.pronunciation && !visibility.translation)
      ) {
          return {
              lyrics: nextLyrics,
              preservedPronunciationCount: 0,
              preservedTranslationCount: 0
          };
      }

      let preservedPronunciationCount = 0;
      let preservedTranslationCount = 0;
      const preserveLine = (previousLine, line, isVocal = false, retention = visibility) => {
          if (!previousLine || !line || previousLine === line) return line;
          const getOriginalText = isVocal ? readVocalOriginalText : readLineOriginalText;
          const previousOriginal = getOriginalText(previousLine).normalize('NFC').trim();
          const nextOriginal = getOriginalText(line).normalize('NFC').trim();
          if (!previousOriginal || previousOriginal !== nextOriginal) {
              return line;
          }

          if (isVocal && (
              (previousLine.id && line.id && previousLine.id !== line.id)
              || (previousLine.speaker || '') !== (line.speaker || '')
          )) return line;
          const previousStartTime = Number(isVocal ? previousLine.syllables?.[0]?.startTime : previousLine.startTime);
          const nextStartTime = Number(isVocal ? line.syllables?.[0]?.startTime : line.startTime);
          if (
              Number.isFinite(previousStartTime)
              && Number.isFinite(nextStartTime)
              && Math.abs(previousStartTime - nextStartTime) > 2
          ) {
              return line;
          }

          const retainPronunciation = retention.pronunciation && !isEditedLyricSupplement(line, 'phonetic');
          const retainTranslation = retention.translation && !isEditedLyricSupplement(line, 'translation');
          const previousPronunciation = retainPronunciation
              ? readLineSupplement(previousLine, 'pronunciation')
              : null;
          const nextPronunciation = retainPronunciation
              ? readLineSupplement(line, 'pronunciation')
              : null;
          const previousTranslation = retainTranslation
              ? readLineSupplement(previousLine, 'translation')
              : null;
          const nextTranslation = retainTranslation
              ? readLineSupplement(line, 'translation')
              : null;
          let nextLine = line;

          if (!nextPronunciation && previousPronunciation) {
              nextLine = {
                  ...nextLine,
                  [isVocal ? 'phonetic' : 'phoneticText']: previousPronunciation
              };
              preservedPronunciationCount += 1;
          }
          if (!nextTranslation && previousTranslation) {
              nextLine = {
                  ...nextLine,
                  [isVocal ? 'translation' : 'text2']: previousTranslation
              };
              preservedTranslationCount += 1;
          }

          if (!isVocal && previousLine.vocals && line.vocals && previousLine.vocals !== line.vocals) {
              const previousVocals = previousLine.vocals;
              const vocalRetention = { pronunciation: retainPronunciation, translation: retainTranslation };
              const lead = preserveLine(previousVocals.lead, line.vocals.lead, true, vocalRetention);
              const previousBackground = Array.isArray(previousVocals.background) ? previousVocals.background : [];
              const nextBackground = line.vocals.background;
              const background = Array.isArray(nextBackground) && previousBackground !== nextBackground
                  ? mapChangedLyrics(nextBackground, (part, index) => {
                      if (!part || typeof part !== 'object') return part;
                      const previousPart = part.id
                          ? previousBackground.find(candidate => candidate?.id === part.id)
                          : previousBackground[index];
                      return preserveLine(previousPart, part, true, vocalRetention);
                  })
                  : nextBackground;
              if (lead !== line.vocals.lead || background !== nextBackground) {
                  nextLine = { ...nextLine, vocals: { ...line.vocals, lead, background } };
              }
          }
          return nextLine;
      };
      const lyrics = mapChangedLyrics(nextLyrics, (line, index) => preserveLine(previousLyrics[index], line));

      return {
          lyrics,
          preservedPronunciationCount,
          preservedTranslationCount
      };
  };

  return { findDistinctSupplement, readLineSupplement, getPresentationKey, preserveAuxiliaryLyrics };
}
