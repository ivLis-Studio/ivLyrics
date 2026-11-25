import { readSettingsPersistence as readWordSupplementSettingsPersistence } from "#ivlyrics/core/settingsRuntime.mjs";
import { getRuntimeService as getWordSupplementDependency } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { createWordSupplementService } from "#ivlyrics/lyrics/createWordSupplementService.mjs";
import { readPronunciationNotation } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { registerWordSupplementService } from "#ivlyrics/lyrics/wordSupplementRuntime.mjs";
import { readRouteDetectedLyricLanguage as readSupplementLyricLanguage } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";

// Keep the legacy API exposed to add-ons at the Spotify route boundary.
export function startWordSupplementService(host) {
	const existing = host.ivLyricsWordSupplements;
	const service = existing?.initialized ? existing : createWordSupplementService({
		getLyricsService: () => getWordSupplementDependency("LyricsService", host),
		getTranslationModes: () => getWordSupplementDependency("ivLyricsTranslationModes", host),
		getDetectedLanguage: () => readSupplementLyricLanguage(host),
		getVisualSettings: () => getWordSupplementDependency("CONFIG", host)?.visual,
		getInterfaceLanguage: () => getWordSupplementDependency("I18n", host)?.getCurrentLanguage?.(),
		getNotationService: () => readPronunciationNotation(host),
		getAiManager: () => getWordSupplementDependency("AIAddonManager", host),
		getTrackUri: () => host.Spicetify?.Player?.data?.item?.uri || "",
		readStoredSetting: key => readWordSupplementSettingsPersistence(host)?.getItem?.(key)
			|| (host.localStorage?.getItem(key) ?? null),
		emit: (type, detail) => host.dispatchEvent?.(new host.CustomEvent(type, { detail })),
	});
	registerWordSupplementService(service);
	if (service !== existing) host.ivLyricsWordSupplements = service;
}
