import { lyricsWordSegmenter } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";
import { readSettingsPersistence, readSettingsStorage } from "../core/settingsRuntime.mjs";
import { createLyricsRenderer } from "../lyrics/Pages.js";
import { getRuntimeService, publishRuntimeService } from "./runtimeServices.mjs";

export function mountLyricsRenderer({
  host, document, localStorage, react, spicetify, config, i18n, getUtils, getToast, getMarketplacePage,
}) {
  const read = (name) => getRuntimeService(name, host);
  const renderer = createLyricsRenderer({
    react, window: host, document, localStorage, spicetify, config, i18n, getUtils, getToast, getMarketplacePage,
    services: {
      getPlaylistPicker: () => read("PlaylistPicker"),
      getStoragePersistence: () => readSettingsPersistence(host),
      getRuntimeI18n: () => read("I18n"),
      getRuntimeStorage: () => readSettingsStorage(host),
      getSpeakerColors: () => read("ivLyricsSpeakerColors"),
      getWordSegmenter: () => lyricsWordSegmenter,
      getLyricsService: () => read("LyricsService"),
      getReactDOM: () => host.Spicetify?.ReactDOM ?? host.ReactDOM ?? null,
      readPlayerTrackUri: () => read("Spicetify")?.Player?.data?.item?.uri,
      translateSeekTitle: (key, values) => host.I18n?.t?.(key, values),
      reportWordStackDebug: (detail) => { host.__ivLyricsLastWordStack = detail; },
      publishCompatibility: (name, service) => publishRuntimeService(name, service, host),
    },
  });

  host.ivLyricsNoLyricsAnimation = renderer.NoLyricsAnimation;
  host.LyricsPageRenderer = renderer.LyricsPageRenderer;
  publishRuntimeService("ivLyricsLyricRendererPrimitives", renderer.lyricRendererPrimitives, host);
  return renderer;
}
