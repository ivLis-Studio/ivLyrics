import { getRuntimeService as getAppService, publishRuntimeService as publishAppService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { readSettingsPersistence as readAppSettingsPersistence } from "#ivlyrics/core/settingsRuntime.mjs";
import { createSetupWizard } from "#ivlyrics/app/SetupWizard.js";
import { createSongResearch } from "#ivlyrics/app/SongResearch.js";
import { createNoticeSystem } from "#ivlyrics/app/NoticeSystem.js";
import { requestAppRouteReload } from "#ivlyrics/spicetify/routeReload.mjs";

export function startPageApp({
  host: window, document, react, spicetify: Spicetify, config: CONFIG, i18n: I18n,
  storage: StorageManager, utils: Utils, videoHelper: VideoHelperService, getReactDOM,
}) {
  const { openSetupWizard, isSetupNeeded } = createSetupWizard({
    react, host: window, document, i18n: I18n, config: CONFIG, storage: StorageManager,
    videoHelper: VideoHelperService,
    getOverlaySender: () => getAppService("OverlaySender", window),
    getReactDOM,
    reload: settingsReturn => requestAppRouteReload({
      host: window, getHistory: () => Spicetify?.Platform?.History, settingsReturn,
    }),
  });

  const SongResearch = createSongResearch({
    react: Spicetify.React, host: window, spicetify: Spicetify, config: CONFIG, i18n: I18n, storage: StorageManager, utils: Utils,
    getLyricsService: () => getAppService("LyricsService", window),
    getAiManager: () => getAppService("AIAddonManager", window),
  });
  publishAppService("SongResearch", SongResearch, window);
  publishAppService("SongInfoTMI", SongResearch, window);

  const { api: NoticeSystem, showNoticeIfNeeded } = createNoticeSystem({
    host: window, document, spicetify: Spicetify, i18n: I18n,
    readVersion: () => Utils.getCurrentVersion?.() || CONFIG.version || window.ivLyricsVersion || "0.0.0",
    getPersistence: () => readAppSettingsPersistence(window),
    getStorage: () => window.localStorage,
    getReactDOM: () => Spicetify.ReactDOM || window.ReactDOM,
    request: (...args) => fetch(...args),
  });
  publishAppService("NoticeSystem", NoticeSystem, window);
  publishAppService("showNoticeIfNeeded", showNoticeIfNeeded, window);
  return { openSetupWizard, isSetupNeeded, SongResearch, showNoticeIfNeeded };
}
