import { normalizeIvLyricsPronunciationNotation } from "../../lyrics/translationPreferences.mjs";
import { createTrackPreferenceWriter } from "../../core/trackPreferenceWriter.mjs";
import { REQUIRE_TRACK_OVERRIDE_COMMIT } from "../../core/trackOverrideStore.mjs";

export function createToolbarTranslationPreferences({
    getVisualSettings, readSetting, writeSetting, readCurrentTrackUri,
    readMountedPage, readTrackLanguageStore, clearTrackSnapshot, refreshLyrics, reportLanguageSaveError,
}) {
    const displayModeKey = "translate:display-mode";
    const notationKey = "translate:pronunciation-notation";
    const writeLanguage = createTrackPreferenceWriter();

    const ownsTrack = (page, trackUri) => !!trackUri && readCurrentTrackUri() === trackUri
        && (!page?.currentTrackUri || page.currentTrackUri === trackUri)
        && page?._isComponentMounted !== false;

    function resetTranslationPresentation(page) {
        if (!page || page._isComponentMounted === false) return;
        page._dmResults = {};
        page.lastProcessedUri = null;
        page.lastProcessedMode = null;
        page.forceUpdate();
    }

    function prepareDisplay() {
        const visual = getVisualSettings();
        const displayModeChanged = visual[displayModeKey] !== "below";
        visual[displayModeKey] = "below";
        writeSetting(displayModeKey, "below");
        if (displayModeChanged) refreshLyrics();
    }

    async function saveTrackLanguage(value, trackUri = readCurrentTrackUri()) {
        if (!ownsTrack(readMountedPage(), trackUri)) return;
        const language = value === "auto" ? null : value;
        try {
            const store = readTrackLanguageStore();
            await writeLanguage(trackUri, () => language
                ? store.setLanguage(trackUri, language, REQUIRE_TRACK_OVERRIDE_COMMIT)
                : store.clearLanguage(trackUri, REQUIRE_TRACK_OVERRIDE_COMMIT),
            () => applyTrackLanguage(trackUri, language));
        } catch (error) {
            reportLanguageSaveError?.(error);
        }
    }

    function applyTrackLanguage(trackUri, language) {
        clearTrackSnapshot(trackUri);
        const page = readMountedPage();
        if (!ownsTrack(page, trackUri)) return;
        if (page) {
            page._trackLanguagePreferenceRevision = (page._trackLanguagePreferenceRevision ?? 0) + 1;
            page.trackLanguageOverride = language;
            page.clearTranslationRequestsForCacheRemoval?.(trackUri);
        }
        resetTranslationPresentation(page);
        refreshLyrics();
    }

    async function save(name, value, trackUri) {
        if (name === "track-language-override") {
            await saveTrackLanguage(value, trackUri);
            return;
        }
        const visual = getVisualSettings();

        if (name === notationKey) {
            const normalized = normalizeIvLyricsPronunciationNotation(value);
            visual[name] = normalized;
            writeSetting(name, normalized);
            return;
        }

        if (name.startsWith("translation-mode:") && !name.includes("mode-2")) {
            value = value ? "gemini_romaji" : "none";
        } else if (name.startsWith("translation-mode-2:")) {
            value = value ? "gemini_ko" : "none";
        }

        visual[name] = value;
        writeSetting(name, value);
        if (name.startsWith("translation-mode")) resetTranslationPresentation(readMountedPage());
        refreshLyrics();
    }

    return {
        prepareDisplay, save,
        readTrackLanguage() {
            const page = readMountedPage();
            return ownsTrack(page, readCurrentTrackUri()) ? page?.trackLanguageOverride || "auto" : "auto";
        },
        readPronunciationNotation: () => normalizeIvLyricsPronunciationNotation(
            getVisualSettings()?.[notationKey] || readSetting(notationKey),
        ),
    };
}
