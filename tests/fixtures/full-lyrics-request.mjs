import { createFullLyricsRequest } from "../../src/lyrics/createFullLyricsRequest.mjs";
import { createLyricTranslationModes } from "../../src/lyrics/lyricTranslationModes.mjs";
import { isPlaybackLyricsTargetCurrent } from "../../src/core/playbackPositionService.mjs";

export function fixtureFullLyricsRequest({
    window, Utils, Spicetify, providerRequests, getTranslationTargetLanguage,
    getServicePronunciationNotation, sendLyricsToConsumers, readSavedLocalLyrics, reportError = () => {},
}) {
    const getTranslator = () => window.Translator;
    const translationModes = createLyricTranslationModes({
        getTranslator,
        checkSectionHeader: (text) => Utils.isSectionHeader(text),
    });
    const request = createFullLyricsRequest({
        getProviderGeneration: providerRequests.getRevision,
        isPlaybackCurrent: (uri) => isPlaybackLyricsTargetCurrent(
            Utils.getPlayerPlaybackSnapshot(), Spicetify.Player.data?.item?.uri, uri
        ),
        detectLanguage: (lines) => Utils.detectLanguage(lines),
        readVisual: (key) => Spicetify.LocalStorage.get(`ivLyrics:visual:${key}`),
        isSectionHeader: (text) => Utils.isSectionHeader(text),
        getTranslationTargetLanguage,
        getPronunciationNotation: getServicePronunciationNotation,
        getTranslationStyle: () => window.AIAddonManager?.getTranslationStyle?.() || "natural",
        readSavedLocalLyrics,
        getTranslationCacheId: (uri) => Utils.getTranslationCacheId(uri),
        getTranslator,
        translationModes,
        isPronunciationSyncRequested: (lyrics, source) =>
            !!window.ivLyricsPronunciationSlots?.isRequested?.(lyrics, source),
        sendLyricsToConsumers,
        debug() {},
        reportWarning() {},
        reportError,
    });
    return function getFullLyrics(info, options) {
        return request(this, info, options);
    };
}
