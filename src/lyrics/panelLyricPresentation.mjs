import { isPronunciationDisplayMode } from "./translationPresentation.mjs";
import { getTranslationPartText as getPartText } from "./lyricTranslationVocals.mjs";
import { setEditedLyricSupplements } from "./lyricSupplementEdits.mjs";
import { areLiterallyEquivalentLyrics, lyricsTextComparison } from "./translationTextComparison.mjs";
import {
    getLyricLanguageMode, matchesLyricSupplementSettings, readLyricDisplayModes, resolveLyricSourceLanguage,
} from "./lyricPresentationIdentity.mjs";
import { isKaraokePlaybackEnabled } from "./selectPlaybackLyrics.mjs";
import { LRC_RED_WORD_SYNC_SOURCE, mergeLyricsTiming } from "./lyricsTimingMerge.mjs";

export const getPanelSupplementVisibility = (displayMode1, displayMode2, hasExplicitModes = true) => {
    if (!hasExplicitModes) {
        return { pronunciation: false, translation: false };
    }
    const modes = [displayMode1, displayMode2].filter(mode => mode && mode !== 'none');
    return {
        pronunciation: modes.some(isPronunciationDisplayMode),
        translation: modes.some(mode => !isPronunciationDisplayMode(mode))
    };
};

export function matchesPanelSupplementSettings(snapshot, readSetting, preferences) {
    const language = resolveLyricSourceLanguage(
        snapshot.trackInfo?.languageOverride,
        readSetting("translate:detect-language-override"),
        () => snapshot.detectedLanguage
    );
    const [displayMode1, displayMode2] = readLyricDisplayModes(getLyricLanguageMode(language), readSetting);
    return language === (snapshot.detectedLanguage || null) && matchesLyricSupplementSettings(snapshot, {
        displayMode1, displayMode2,
        translationTargetLanguage: preferences.getTranslationTargetLanguage(),
        pronunciationNotation: preferences.getPronunciationNotation(),
        translationStyle: preferences.getTranslationStyle(),
    });
}

export function readInitialPanelLyrics(uri, snapshot, cache, readSetting, preferences, sanitize) {
    const allowKaraoke = isKaraokePlaybackEnabled(readSetting("karaoke-mode-enabled", true));
    const shared = Array.isArray(snapshot?.displayLyrics)
        && (allowKaraoke || !isPanelKaraokeSnapshot(snapshot));
    const complete = shared && snapshot.presentationComplete === true
        && matchesPanelSupplementSettings(snapshot, readSetting, preferences);
    const cacheMatches = uri && cache.trackUri === uri && (allowKaraoke || !isPanelKaraokeSnapshot(cache));
    const cached = cacheMatches ? cache : null;
    const lyrics = shared ? snapshot.displayLyrics : cached?.lyrics || [];
    return {
        trackUri: shared || cached ? uri : null,
        loadedUri: complete ? uri : null,
        provider: (shared ? snapshot.provider || snapshot.rawResult?.provider : cached?.provider) || null,
        lyricsNotFound: complete && lyrics.length === 0,
        lyrics: sanitize(lyrics, getPanelSupplementVisibility(snapshot?.displayMode1, snapshot?.displayMode2, complete)),
        karaokeSource: (shared ? snapshot.karaokeSource : cached?.karaokeSource) || null,
    };
}

export function isPanelKaraokeSnapshot(snapshot) {
    return snapshot.lyricsType ? snapshot.lyricsType === "karaoke" : Boolean(snapshot.karaokeSource);
}

export function resolveSharedPanelLyrics({ detail, currentUri, currentLyrics, readSetting, preferences, sanitize }) {
    const timingUpgrade = detail.source === LRC_RED_WORD_SYNC_SOURCE;
    if (!timingUpgrade && !["ivlyrics-page", "external-update", "now-playing-panel"].includes(detail.source)) return null;
    if (!currentUri || detail.trackUri !== currentUri || !Array.isArray(detail.displayLyrics)) return null;
    if (timingUpgrade && !detail.timingUpgradeApplied) return null;
    if ((timingUpgrade || isPanelKaraokeSnapshot(detail))
        && !isKaraokePlaybackEnabled(readSetting("karaoke-mode-enabled", true))) return null;

    const provider = detail.provider || detail.rawResult?.provider || null;
    const hasSupplementModes = detail.displayMode1 != null || detail.displayMode2 != null;
    if (timingUpgrade && currentLyrics.trackUri === currentUri && currentLyrics.lyrics.length) {
        if (provider && currentLyrics.provider && provider !== currentLyrics.provider) return null;
        // The timing publisher can carry a different view's partial presentation.
        // Match the original text and keep the supplements already on this panel.
        const timing = sanitize(detail.rawResult?.karaoke || detail.displayLyrics, getPanelSupplementVisibility(null, null));
        const lyrics = mergeLyricsTiming(currentLyrics.lyrics, timing);
        return lyrics ? { lyrics, provider: provider || currentLyrics.provider, timingUpgrade, hasSupplementModes } : null;
    }

    if (hasSupplementModes && detail.source !== "external-update"
        && !matchesPanelSupplementSettings(detail, readSetting, preferences)) return null;
    const visibility = getPanelSupplementVisibility(detail.displayMode1, detail.displayMode2, hasSupplementModes);
    return { lyrics: sanitize(detail.displayLyrics, visibility), provider, timingUpgrade, hasSupplementModes };
}

export function createPanelLyricPresentation({
    getDisplayComparison, getPhoneticHyphenMode, getPanelSpeakerPresentation, getPanelSpeakerStyle, splitRenderableSyllables,
}) {
    const arePanelTextsEquivalent = (left, right) => {
        if (typeof left !== 'string' || typeof right !== 'string') return false;
        const comparison = getDisplayComparison();
        if (comparison?.areEquivalent) return comparison.areEquivalent(left, right);
        return areLiterallyEquivalentLyrics(left, right);
    };

    const getDistinctPanelSupplement = (value, originalText, visible) => {
        if (!visible || typeof value !== 'string') return '';
        const text = value.trim();
        return text && !arePanelTextsEquivalent(text, originalText) ? text : '';
    };

    const sanitizePanelLyricsSupplements = (lyrics, visibility) => (
        Array.isArray(lyrics) ? lyrics.map((line) => {
            if (!line || typeof line !== 'object') return line;
            const originalText = String(line.originalText || line.text || '');
            const sanitizePart = (part) => {
                if (!part || typeof part !== 'object') return part;
                const partText = String(part.text || (Array.isArray(part.syllables)
                    ? part.syllables.map(syllable => syllable?.text || '').join('')
                    : ''));
                const nextPart = { ...part };
                const phonetic = getDistinctPanelSupplement(
                    part.phonetic ?? part.phoneticText ?? part.pronText,
                    partText,
                    visibility.pronunciation
                );
                const translation = getDistinctPanelSupplement(
                    part.translation ?? part.translationText ?? part.transText,
                    partText,
                    visibility.translation
                );
                if (phonetic) nextPart.phonetic = phonetic;
                else delete nextPart.phonetic;
                delete nextPart.phoneticText;
                delete nextPart.pronText;
                if (translation) nextPart.translation = translation;
                else delete nextPart.translation;
                delete nextPart.translationText;
                delete nextPart.transText;
                return nextPart;
            };
            const vocals = line.vocals?.lead ? {
                ...line.vocals,
                lead: sanitizePart(line.vocals.lead),
                background: Array.isArray(line.vocals.background)
                    ? line.vocals.background.map(sanitizePart)
                    : line.vocals.background
            } : line.vocals;
            const phoneticText = getDistinctPanelSupplement(
                line.phoneticText ?? line.pronunciationText ?? line.pronText,
                originalText,
                visibility.pronunciation
            );
            const translationText = getDistinctPanelSupplement(
                line.text2 ?? line.translation ?? line.translationText ?? line.transText,
                originalText,
                visibility.translation
            );
            const nextLine = {
                ...line,
                vocals,
                phoneticText,
                text2: translationText,
                translationText
            };
            delete nextLine.phonetic;
            delete nextLine.pronunciationText;
            delete nextLine.pronText;
            delete nextLine.translation;
            delete nextLine.transText;
            return nextLine;
        }) : []
    );

    const getVocalRowsFromLine = (line) => {
        if (!Array.isArray(line?.vocals?.lead?.syllables) || line.vocals.lead.syllables.length === 0) return null;
        const rows = [{
            key: line.vocals.lead.id || 'lead',
            role: line.vocals.lead.role || 'lead',
            speaker: line.vocals.lead.speaker || '',
            speakerColor: line.vocals.lead['speaker-color'] || '',
            speakerFallback: line.vocals.lead['speaker-fallback'] || '',
            kind: line.vocals.lead.kind || 'vocal',
            speakerClass: getPanelSpeakerPresentation(line.vocals.lead.speaker, line.vocals.lead['speaker-color'], line.vocals.lead['speaker-fallback']).speakerClass,
            speakerStyle: getPanelSpeakerStyle(line.vocals.lead.speaker, line.vocals.lead['speaker-color'], line.vocals.lead['speaker-fallback']),
            phonetic: getDistinctPanelSupplement(
                line.vocals.lead.phonetic,
                getPartText(line.vocals.lead),
                true
            ),
            translation: getDistinctPanelSupplement(
                line.vocals.lead.translation,
                getPartText(line.vocals.lead),
                true
            ),
            text: getPartText(line.vocals.lead),
            syllables: splitRenderableSyllables(line.vocals.lead.syllables)
        }];

        if (Array.isArray(line.vocals.background)) {
            line.vocals.background.forEach((part, index) => {
                if (Array.isArray(part?.syllables) && part.syllables.length > 0) {
                    rows.push({
                        key: part.id || `background-${index}`,
                        role: part.role || 'background',
                        speaker: part.speaker || '',
                        speakerColor: part['speaker-color'] || '',
                        speakerFallback: part['speaker-fallback'] || '',
                        kind: part.kind || 'vocal',
                        speakerClass: getPanelSpeakerPresentation(part.speaker, part['speaker-color'], part['speaker-fallback']).speakerClass,
                        speakerStyle: getPanelSpeakerStyle(part.speaker, part['speaker-color'], part['speaker-fallback']),
                        phonetic: getDistinctPanelSupplement(part.phonetic, getPartText(part), true),
                        translation: getDistinctPanelSupplement(part.translation, getPartText(part), true),
                        text: getPartText(part),
                        syllables: splitRenderableSyllables(part.syllables)
                    });
                }
            });
        }

        return rows.length > 1 ? rows : null;
    };

    const applyPanelTranslationResults = (lyrics, requests, phoneticLines, translationLines, {
        userEditedPhonetic = false, userEditedTranslation = false,
    } = {}) => {
        const resultsByLine = new Map();
        const areTextsEquivalent = (leftValue, rightValue) => {
            const comparison = getDisplayComparison();
            if (comparison?.areEquivalent) return comparison.areEquivalent(leftValue, rightValue);
            if (!comparison?.normalize) return lyricsTextComparison.areEquivalent(leftValue, rightValue);
            const left = comparison.normalize(leftValue);
            const right = comparison.normalize(rightValue);
            return !!left && !!right && (left === right || left.replace(/[\s\p{Z}]+/gu, '') === right.replace(/[\s\p{Z}]+/gu, ''));
        };
        const isNoteLine = (text) => {
            const value = String(text || '').trim();
            return !value || /^[\s♪♩♫♬·•・。、…~-]+$/.test(value);
        };
        const processPhoneticHyphen = (text) => {
            const mode = getPhoneticHyphenMode();
            if (mode === 'space') return String(text || '').replace(/-/g, ' ');
            if (mode === 'remove') return String(text || '').replace(/-/g, '');
            return String(text || '');
        };
        requests.forEach((request, index) => {
            let phonetic = processPhoneticHyphen(String(phoneticLines[index] || '').trim());
            let translation = String(translationLines[index] || '').trim();
            if (isNoteLine(phonetic) || areTextsEquivalent(phonetic, request.text)) {
                phonetic = '';
            }
            if (isNoteLine(translation) || areTextsEquivalent(translation, request.text)) {
                translation = '';
            }
            if (phonetic && translation &&
                areTextsEquivalent(phonetic, translation)) {
                phonetic = '';
            }
            const results = resultsByLine.get(request.lineIndex) || [];
            results.push({
                ...request,
                phonetic,
                translation
            });
            resultsByLine.set(request.lineIndex, results);
        });

        return lyrics.map((line, lineIndex) => {
            const results = resultsByLine.get(lineIndex) || [];
            const isKaraokeLine = Array.isArray(line?.syllables)
                || Array.isArray(line?.vocals?.lead?.syllables);
            const originalText = line?.originalText || line?.text || '';
            const hasVocalResults = results.some(result => result.vocalPart) && line?.vocals?.lead;

            let vocals = line?.vocals;
            if (hasVocalResults) {
                vocals = {
                    ...line.vocals,
                    lead: { ...line.vocals.lead },
                    background: Array.isArray(line.vocals.background)
                        ? line.vocals.background.map(part => ({ ...part }))
                        : []
                };
                delete vocals.lead.phonetic;
                delete vocals.lead.translation;
                vocals.background.forEach((part) => {
                    delete part.phonetic;
                    delete part.translation;
                });
                results.forEach((result) => {
                    if (!result.vocalPart) return;
                    const targetPart = result.vocalPart.role === 'lead'
                        ? vocals.lead
                        : vocals.background[result.vocalPart.index];
                    if (!targetPart) return;
                    if (result.phonetic) targetPart.phonetic = result.phonetic;
                    if (result.translation) targetPart.translation = result.translation;
                });
            }

            const hasGeneratedResults = results.length > 0;
            const phoneticText = results.map(result => result.phonetic).filter(Boolean).join(' / ')
                || (hasGeneratedResults ? '' : line?.phoneticText)
                || '';
            const translationText = results.map(result => result.translation).filter(Boolean).join(' / ')
                || (hasGeneratedResults ? '' : line?.text2)
                || '';

            return setEditedLyricSupplements({
                ...line,
                vocals,
                originalText,
                text: isKaraokeLine ? originalText : (phoneticText || (userEditedPhonetic ? originalText : line?.text) || ''),
                phoneticText,
                text2: translationText
            }, hasGeneratedResults && userEditedPhonetic, hasGeneratedResults && userEditedTranslation);
        });
    };

    return {
        getDistinctPanelSupplement,
        sanitizePanelLyricsSupplements,
        getVocalRowsFromLine,
        applyPanelTranslationResults,
    };
}
