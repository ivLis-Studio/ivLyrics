import { isAiMode, isPronunciationMode } from "./lyricTranslationModes.mjs";

export function isLyricPresentationSetting(name) {
    return typeof name === "string" && (name.startsWith("translation-mode") || [
        "translate:target-language",
        "translate:pronunciation-notation",
        "translate:detect-language-override",
        "phonetic-hyphen-replace",
        "karaoke-mode-enabled",
    ].includes(name));
}

export function resolveLyricSourceLanguage(trackOverride, configuredLanguage, detect) {
    return trackOverride
        || (configuredLanguage && configuredLanguage !== "off" ? configuredLanguage : detect())
        || null;
}

export function getLyricLanguageMode(language) {
    if (language) {
        try {
            return new Intl.DisplayNames(["en"], { type: "language" })
                .of(String(language).split("-")[0])?.toLowerCase() || "gemini";
        } catch {
            // Unknown language codes use the generic mode.
        }
    }
    return "gemini";
}

export function getLyricDisplayModes(visual, languageMode) {
    return readLyricDisplayModes(languageMode, (key) => visual[key]);
}

export function readLyricDisplayModes(languageMode, readSetting) {
    return [readSetting(`translation-mode:${languageMode}`), readSetting(`translation-mode-2:${languageMode}`)];
}

export function hasStyleDependentLyricTranslation({ displayMode1, displayMode2 }) {
    return [displayMode1, displayMode2].some(mode => isAiMode(mode) && !isPronunciationMode(mode));
}

export function matchesLyricTranslationStyle(snapshot, style) {
    return style === undefined || (snapshot.translationStyle || "natural") === style;
}

export function matchesLyricSupplementSettings(snapshot, {
    displayMode1, displayMode2, translationTargetLanguage, pronunciationNotation, translationStyle,
}) {
    return (snapshot.displayMode1 || "none") === (displayMode1 || "none")
        && (snapshot.displayMode2 || "none") === (displayMode2 || "none")
        && (snapshot.translationTargetLanguage || "") === translationTargetLanguage
        && (snapshot.pronunciationNotation || "translation") === pronunciationNotation
        && matchesLyricTranslationStyle(snapshot, translationStyle);
}

export function matchesLyricPresentation(snapshot, {
    lyricsType, displayMode1, displayMode2, detectedLanguage,
    getTargetLanguage, getPronunciationNotation, getTranslationStyle, getSourceText,
}) {
    return snapshot?.presentationComplete === true
        && snapshot.lyricsType === lyricsType
        && (snapshot.detectedLanguage || "") === (detectedLanguage || "")
        && matchesLyricSupplementSettings(snapshot, {
            displayMode1, displayMode2,
            translationTargetLanguage: getTargetLanguage(),
            pronunciationNotation: getPronunciationNotation(),
            translationStyle: getTranslationStyle?.(),
        })
        && (!snapshot.translationSourceText || snapshot.translationSourceText === getSourceText());
}

export function getSharedLyricPresentationKey(provider, modes, generationOptions, notation, rendererVersion) {
    return JSON.stringify([provider || "", ...modes.map((mode) => mode || "none"), ...generationOptions, notation, rendererVersion]);
}

