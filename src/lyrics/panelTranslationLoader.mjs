import { getLyricLanguageMode, readLyricDisplayModes, readLyricPlaybackPreferences, resolveLyricSourceLanguage } from "./lyricPresentationIdentity.mjs";
import { createLyricTranslationModes } from "./lyricTranslationModes.mjs";
import { buildLyricTranslationRequests } from "./lyricTranslationVocals.mjs";
import { getActiveLyricSupplementSlots, loadLyricSupplementSlots } from "./loadLyricSupplementSlots.mjs";
import { getPanelSupplementVisibility } from "./panelLyricPresentation.mjs";
import { isLyricsSectionHeader } from "./translationTextComparison.mjs";
import { mergeLyricsTiming } from "./lyricsTimingMerge.mjs";
import { retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";

export function createPanelTranslationLoader({
    getPanelLyricsService, getTranslator, getVisualSetting,
    getTranslationTargetLanguage, getPronunciationNotation, getTranslationStyle,
    wantsPronunciationSlots, isActiveLoad, sanitizePanelLyricsSupplements, applyPanelTranslationResults,
    displayLyrics, publishPanelLyricsSnapshot, reportWarning = console.warn,
}) {
    const translationModes = createLyricTranslationModes({ getTranslator, checkSectionHeader: isLyricsSectionHeader });

    return async function loadTranslation(trackInfo, lyrics, rawResult, loadSeq, lyricsType, karaokeSource, isSourceCurrent = () => true) {
        const { uri, languageOverride } = trackInfo;
        const { provider } = rawResult;
        if (!isActiveLoad(loadSeq, uri) || !isSourceCurrent()) return;

        try {
            const service = getPanelLyricsService();
            const readPlaybackPreferences = () => readLyricPlaybackPreferences(getVisualSetting, languageOverride);
            const playbackPreferences = readPlaybackPreferences();
            const { configuredSourceLanguage, karaokeEnabled } = playbackPreferences;
            const detectedLanguage = resolveLyricSourceLanguage(
                languageOverride, configuredSourceLanguage, () => service?.detectLanguage?.(lyrics)
            );
            const modeKey = getLyricLanguageMode(detectedLanguage);
            const readModes = () => readLyricDisplayModes(modeKey, key => getVisualSetting(key) || "none");
            const [displayMode1, displayMode2] = readModes();
            const translationTargetLanguage = getTranslationTargetLanguage();
            const pronunciationNotation = getPronunciationNotation();
            const translationStyle = getTranslationStyle();
            const trackId = service?.getTranslationCacheId?.(uri) || trackInfo.trackId;
            const getCacheRevision = () => getTranslator()?.getCacheRevision?.(trackId);
            const cacheRevision = getCacheRevision();

            const isCurrentRequest = () => {
                if (!isActiveLoad(loadSeq, uri) || !isSourceCurrent() || getCacheRevision() !== cacheRevision) return false;
                const [nextMode1, nextMode2] = readModes();
                const nextPlaybackPreferences = readPlaybackPreferences();
                return displayMode1 === nextMode1 && displayMode2 === nextMode2
                    && configuredSourceLanguage === nextPlaybackPreferences.configuredSourceLanguage
                    && karaokeEnabled === nextPlaybackPreferences.karaokeEnabled
                    && getTranslationTargetLanguage() === translationTargetLanguage
                    && getPronunciationNotation() === pronunciationNotation
                    && getTranslationStyle() === translationStyle;
            };
            const visibleLyrics = sanitizePanelLyricsSupplements(
                lyrics, getPanelSupplementVisibility(displayMode1, displayMode2)
            );
            const translationRequests = buildLyricTranslationRequests(lyrics);
            const activeSlots = translationRequests.length
                ? getActiveLyricSupplementSlots([displayMode1, displayMode2], translationModes)
                : [];
            const results = activeSlots.length ? await loadLyricSupplementSlots({
                info: trackInfo, lyrics, karaokeSource, translationRequests, provider, detectedLanguage,
                pronunciationNotation, activeSlots, isCurrentRequest, translationModes, getTranslator,
                getTranslationCacheId: () => trackId,
                isPronunciationSyncRequested: wantsPronunciationSlots,
                reportWarning: (mode, error) => reportWarning(`[PanelLyrics] Supplement ${mode} failed:`, error),
            }) : [];
            if (!isCurrentRequest()) return;

            // The later configured slot wins when both modes produce the same field.
            const phoneticResult = results.findLast(result => result.targetField === "phonetic");
            const phoneticLines = phoneticResult?.lines || [];
            const translationResult = results.findLast(result => result.targetField === "translation");
            const translationLines = translationResult?.lines || [];
            let display = results.length
                ? applyPanelTranslationResults(visibleLyrics, translationRequests, phoneticLines, translationLines, {
                    userEditedPhonetic: phoneticResult?.userEdited === true,
                    userEditedTranslation: translationResult?.userEdited === true,
                })
                : visibleLyrics;
            if (karaokeEnabled) {
                const timing = retainLrcRedWordTiming(rawResult, service?.getLyricsSnapshot?.(uri)?.rawResult);
                const upgraded = timing !== rawResult && mergeLyricsTiming(display, timing.karaoke);
                if (upgraded) {
                    display = upgraded;
                    lyricsType = "karaoke";
                    karaokeSource = timing.karaokeSource;
                }
            }
            displayLyrics(display, karaokeSource);
            publishPanelLyricsSnapshot({
                trackUri: uri,
                trackInfo,
                displayLyrics: display,
                provider,
                karaokeSource,
                lyricsType,
                playbackPreferences,
                displayMode1,
                displayMode2,
                detectedLanguage,
                translationTargetLanguage,
                pronunciationNotation,
                translationStyle,
                translationSourceText: translationRequests.map(request => request.text).join("\n"),
                presentationComplete: results.length === activeSlots.length,
                phoneticLines,
                translationLines,
            });
        } catch (error) {
            if (isActiveLoad(loadSeq, uri)) reportWarning("[PanelLyrics] Failed to apply lyric supplements:", error);
        }
    };
}
