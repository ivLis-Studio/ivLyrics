import { getRuntimeService as getAppService, publishRuntimeService as publishAppService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { readSettingsPersistence as readFullscreenSettingsPersistence } from "#ivlyrics/core/settingsRuntime.mjs";
import { createFullscreenOverlay } from "#ivlyrics/features/fullscreen/FullscreenOverlay.js";

import { createVinylPlayerMode } from "#ivlyrics/features/player/VinylPlayerMode.js";
import { createPageVinylLyricRenderer } from "#ivlyrics/features/player/VinylActiveLyricRenderer.js";

export function startPageFullscreen({
  host: window, document, spicetify: Spicetify, config: CONFIG, i18n: I18n, toast: Toast,
  lyricRendererPrimitives, cdVisualizer: CdVisualizer, playlistPicker: PlaylistPicker,
  getSongResearch, getReactDOM,
}) {
  const VinylActiveLyricRenderer = createPageVinylLyricRenderer({
    react: Spicetify.React, host: window, document, primitives: lyricRendererPrimitives,
    getVisualSettings: () => CONFIG?.visual,
  });
  if (VinylActiveLyricRenderer) {
    publishAppService("ivLyricsActiveLyricLineRenderer", VinylActiveLyricRenderer, window);
  }
  const VinylPlayerMode = createVinylPlayerMode({
    react: Spicetify.React, host: window, document, i18n: I18n, spicetify: Spicetify,
    getActiveLyricRenderer: () => VinylActiveLyricRenderer,
    getCdVisualizer: () => CdVisualizer,
  });
  publishAppService("ivLyricsVinylPlayerMode", VinylPlayerMode, window);

  const FullscreenOverlay = createFullscreenOverlay({
    react: Spicetify.React, host: window, document, spicetify: Spicetify, config: CONFIG, i18n: I18n, toast: Toast,
    getPlaylistPicker: () => PlaylistPicker,
    getPersistence: () => readFullscreenSettingsPersistence(window),
    getSongResearch: getSongResearch,
    getAiManager: () => getAppService("AIAddonManager", window),
    getVinylMode: () => VinylPlayerMode,
    getReactDOM: getReactDOM,
  });

  publishAppService("FullscreenOverlay", FullscreenOverlay, window);
  return FullscreenOverlay;
}
