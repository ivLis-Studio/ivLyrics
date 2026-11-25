import { createLyricTranslationModes } from "./lyricTranslationModes.mjs";
import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";

export default function installTranslationModeHelper(browser = globalThis.window) {
    return publishRuntimeService("ivLyricsTranslationModes", createLyricTranslationModes({
        getTranslator: () => getRuntimeService("Translator", browser),
        checkSectionHeader: (text) => browser.Utils?.isSectionHeader?.(text),
    }), browser);
}
