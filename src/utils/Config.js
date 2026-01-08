// Configuration and Storage Manager for ivLyrics

const APP_NAME = "ivLyrics";

const __storageKeys = localStorage.getItem(`${APP_NAME}:storage-keys`);
const StorageKeys = new Set(__storageKeys ? JSON.parse(__storageKeys) : []);
/**
 *
 * @param {string} newKey
 */
const saveStorageKeys = (newKey) => {
  if (typeof newKey !== "string") return;
  if (!newKey.startsWith(APP_NAME)) return;
  StorageKeys.add(newKey);
  try {
    localStorage.setItem(
      `${APP_NAME}:storage-keys`,
      JSON.stringify(Array.from(StorageKeys))
    );
  } catch (e) {
    console.error("Failed to save storage keys:", e);
  }
};
const StorageManager = {
  get(key, defaultVal = true) {
    saveStorageKeys(key);
    try {
      const value = localStorage.getItem(key);
      return value !== null ? value === "true" : defaultVal;
    } catch (error) {
      return defaultVal;
    }
  },

  getPersisted(key) {
    saveStorageKeys(key);
    // Try Spicetify LocalStorage first (more reliable)
    try {
      const value = Spicetify?.LocalStorage?.get(key);
      if (typeof value === "string") return value;
    } catch (error) {
      // Error ignored
    }

    // Fallback to regular localStorage
    try {
      return localStorage.getItem(key);
    } catch (error) {
      // Error ignored
    }

    return null;
  },

  /**
   *
   * @deprecated Use saveConfig instead for unified saving
   */
  setPersisted(key, value) {
    saveStorageKeys(key);
    const stringValue = String(value);
    let success = false;

    // Try Spicetify LocalStorage first
    try {
      Spicetify?.LocalStorage?.set(key, stringValue);
      success = true;
    } catch (error) {
      // Error ignored
    }

    // Fallback to regular localStorage
    try {
      localStorage.setItem(key, stringValue);
      success = true;
    } catch (error) {
      // Error ignored
    }

    if (!success) {
      // Failed to persist data
    }
  },

  // Unified config save method to reduce duplication
  saveConfig(name, value) {
    saveStorageKeys(`${APP_NAME}:visual:${name}`);
    if (name === "gemini-api-key" || name === "gemini-api-key-romaji") {
      // Save sensitive keys to both storages for persistence
      this.setPersisted(`${APP_NAME}:visual:${name}`, value);
    } else if (name === "language") {
      // Language setting needs to be saved to both storages for I18n system
      this.setPersisted(`${APP_NAME}:visual:${name}`, value);
    } else {
      localStorage.setItem(`${APP_NAME}:visual:${name}`, value);
    }
  },

  getItem(key) {
    saveStorageKeys(key);
    return localStorage.getItem(key);
  },
  setItem(key, value) {
    saveStorageKeys(key);
    return localStorage.setItem(key, value);
  },
  removeItem(key) {
    saveStorageKeys(key);
    return localStorage.removeItem(key);
  },
  getItemRaw(key) {
    return localStorage.getItem(key);
  },
  setItemRaw(key, value) {
    return localStorage.setItem(key, value);
  },
  removeItemRaw(key) {
    return localStorage.removeItem(key);
  },
  SpicetifyLocalStorageGet(key) {
    saveStorageKeys(key);
    return Spicetify.LocalStorage.get(key);
  },
  SpicetifyLocalStorageGetRaw(key) {
    return Spicetify.LocalStorage.get(key);
  },

  // Generate or retrieve client ID
  getClientId() {
    const CLIENT_ID_KEY = `${APP_NAME}:client-id`;
    let clientId = this.getItemRaw(CLIENT_ID_KEY);

    if (!clientId) {
      // Generate new UUID v4
      clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });

      // Save to both storages for persistence
      this.setPersisted(CLIENT_ID_KEY, clientId);
      console.log("[ivLyrics] Generated new Client ID:", clientId);
    }

    return clientId;
  },

  async exportConfig() {
    const config = {};
    const CLIENT_ID_KEY = `${APP_NAME}:client-id`;

    StorageKeys.forEach((key) => {
      // Client ID는 내보내기에서 제외
      if (key === CLIENT_ID_KEY) return;

      const val = StorageManager.getItem(key);
      if (val !== null) config[key] = val;
    });

    // IndexedDB의 track-sync-offsets를 포함
    const trackSyncOffsets = await TrackSyncDB.getAllOffsets();
    if (Object.keys(trackSyncOffsets).length > 0) {
      config["ivLyrics:track-sync-offsets"] = JSON.stringify(trackSyncOffsets);
      console.log("[ivLyrics] Exporting track-sync-offsets from IndexedDB:", trackSyncOffsets);
    } else {
      console.log("[ivLyrics] No track-sync-offsets found in IndexedDB");
    }

    console.log("[ivLyrics] Exported config keys:", Object.keys(config));

    return config;
  },
  async importConfig(config) {
    const CLIENT_ID_KEY = `${APP_NAME}:client-id`;

    // track-sync-offsets를 IndexedDB로 가져오기
    if (config["ivLyrics:track-sync-offsets"]) {
      try {
        const offsetsObj = JSON.parse(config["ivLyrics:track-sync-offsets"]);
        await TrackSyncDB.importOffsets(offsetsObj);
        console.log("[ivLyrics] Imported track-sync-offsets to IndexedDB");
        delete config["ivLyrics:track-sync-offsets"]; // localStorage에 저장하지 않음
      } catch (error) {
        console.error("[ivLyrics] Failed to import track-sync-offsets:", error);
      }
    }

    // Client ID가 있다면 삭제 (불러오기에서 제외)
    if (config[CLIENT_ID_KEY]) {
      delete config[CLIENT_ID_KEY];
      console.log("[ivLyrics] Client ID excluded from import");
    }

    // 나머지 설정을 localStorage에 저장
    Object.entries(config).forEach(([key, value]) => {
      StorageManager.setItemRaw(key, value);
      saveStorageKeys(key);
    });
  },
};

const KARAOKE = 0;
const SYNCED = 1;
const UNSYNCED = 2;

const CONFIG = {
  visual: {
    language:
      StorageManager.getItem("ivLyrics:visual:language") || "ko",
    "playbar-button": StorageManager.get(
      "ivLyrics:visual:playbar-button",
      false
    ),
    "fullscreen-button": StorageManager.get(
      "ivLyrics:visual:fullscreen-button",
      false
    ),
    "panel-lyrics-enabled": StorageManager.get(
      "ivLyrics:visual:panel-lyrics-enabled",
      true
    ),
    "panel-lyrics-lines":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-lines") || "5",
    "panel-font-scale":
      StorageManager.getItem("ivLyrics:visual:panel-font-scale") || "100",
    "panel-lyrics-font-family":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-font-family") ||
      "Pretendard Variable",
    "panel-lyrics-original-font":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-original-font") || "",
    "panel-lyrics-phonetic-font":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-phonetic-font") || "",
    "panel-lyrics-translation-font":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-translation-font") || "",
    "panel-lyrics-original-size":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-original-size") || "18",
    "panel-lyrics-phonetic-size":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-phonetic-size") || "13",
    "panel-lyrics-translation-size":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-translation-size") || "13",
    "panel-bg-type":
      StorageManager.getItem("ivLyrics:visual:panel-bg-type") || "album",
    "panel-bg-color":
      StorageManager.getItem("ivLyrics:visual:panel-bg-color") || "#6366f1",
    "panel-bg-gradient-1":
      StorageManager.getItem("ivLyrics:visual:panel-bg-gradient-1") || "#6366f1",
    "panel-bg-gradient-2":
      StorageManager.getItem("ivLyrics:visual:panel-bg-gradient-2") || "#a855f7",
    "panel-bg-opacity":
      StorageManager.getItem("ivLyrics:visual:panel-bg-opacity") || "30",
    "panel-border-enabled": StorageManager.get(
      "ivLyrics:visual:panel-border-enabled",
      false
    ),
    "panel-border-color":
      StorageManager.getItem("ivLyrics:visual:panel-border-color") || "#ffffff",
    "panel-border-opacity":
      StorageManager.getItem("ivLyrics:visual:panel-border-opacity") || "10",
    colorful: StorageManager.get("ivLyrics:visual:colorful", false),
    "gradient-background": StorageManager.get(
      "ivLyrics:visual:gradient-background"
    ),
    "background-brightness":
      StorageManager.getItem("ivLyrics:visual:background-brightness") ||
      "30",
    "solid-background": StorageManager.get(
      "ivLyrics:visual:solid-background",
      false
    ),
    "video-background": StorageManager.get(
      "ivLyrics:visual:video-background",
      false
    ),
    "video-helper-enabled": StorageManager.get(
      "ivLyrics:visual:video-helper-enabled",
      false
    ),
    "video-blur":
      StorageManager.getItem("ivLyrics:visual:video-blur") || "5",
    "video-cover": StorageManager.get(
      "ivLyrics:visual:video-cover",
      false
    ),
    "solid-background-color":
      StorageManager.getItem("ivLyrics:visual:solid-background-color") ||
      "#1e3a8a",
    noise: StorageManager.get("ivLyrics:visual:noise"),
    "background-color":
      StorageManager.getItem("ivLyrics:visual:background-color") ||
      "var(--spice-main)",
    "active-color":
      StorageManager.getItem("ivLyrics:visual:active-color") ||
      "var(--spice-text)",
    "inactive-color":
      StorageManager.getItem("ivLyrics:visual:inactive-color") ||
      "rgba(var(--spice-rgb-subtext),0.5)",
    "highlight-color":
      StorageManager.getItem("ivLyrics:visual:highlight-color") ||
      "var(--spice-button)",
    alignment:
      StorageManager.getItem("ivLyrics:visual:alignment") || "center",
    "lines-before":
      StorageManager.getItem("ivLyrics:visual:lines-before") || "0",
    "lines-after":
      StorageManager.getItem("ivLyrics:visual:lines-after") || "2",
    "font-size": StorageManager.getItem("ivLyrics:visual:font-size") || "32",
    "font-family":
      StorageManager.getItem("ivLyrics:visual:font-family") ||
      "Pretendard Variable",
    "original-font-family":
      StorageManager.getItem("ivLyrics:visual:original-font-family") ||
      "Pretendard Variable",
    "phonetic-font-family":
      StorageManager.getItem("ivLyrics:visual:phonetic-font-family") ||
      "Pretendard Variable",
    "translation-font-family":
      StorageManager.getItem("ivLyrics:visual:translation-font-family") ||
      "Pretendard Variable",
    "original-font-weight":
      StorageManager.getItem("ivLyrics:visual:original-font-weight") ||
      "400",
    "original-font-size":
      StorageManager.getItem("ivLyrics:visual:original-font-size") || "32",
    "translation-font-weight":
      StorageManager.getItem("ivLyrics:visual:translation-font-weight") ||
      "300",
    "translation-font-size":
      StorageManager.getItem("ivLyrics:visual:translation-font-size") ||
      "24",
    "translation-spacing":
      StorageManager.getItem("ivLyrics:visual:translation-spacing") || "8",
    "phonetic-font-weight":
      StorageManager.getItem("ivLyrics:visual:phonetic-font-weight") ||
      "400",
    "phonetic-font-size":
      StorageManager.getItem("ivLyrics:visual:phonetic-font-size") || "20",
    "phonetic-opacity":
      StorageManager.getItem("ivLyrics:visual:phonetic-opacity") || "70",
    "phonetic-spacing":
      StorageManager.getItem("ivLyrics:visual:phonetic-spacing") || "4",
    "phonetic-hyphen-replace":
      StorageManager.getItem("ivLyrics:visual:phonetic-hyphen-replace") || "keep",
    "original-letter-spacing":
      StorageManager.getItem("ivLyrics:visual:original-letter-spacing") || "0",
    "phonetic-letter-spacing":
      StorageManager.getItem("ivLyrics:visual:phonetic-letter-spacing") || "0",
    "translation-letter-spacing":
      StorageManager.getItem("ivLyrics:visual:translation-letter-spacing") || "0",
    "furigana-font-weight":
      StorageManager.getItem("ivLyrics:visual:furigana-font-weight") ||
      "300",
    "furigana-font-size":
      StorageManager.getItem("ivLyrics:visual:furigana-font-size") || "14",
    "furigana-opacity":
      StorageManager.getItem("ivLyrics:visual:furigana-opacity") || "80",
    "furigana-spacing":
      StorageManager.getItem("ivLyrics:visual:furigana-spacing") || "2",
    "text-shadow-enabled": StorageManager.get(
      "ivLyrics:visual:text-shadow-enabled",
      true
    ),
    "text-shadow-color":
      StorageManager.getItem("ivLyrics:visual:text-shadow-color") ||
      "#000000",
    "text-shadow-opacity":
      StorageManager.getItem("ivLyrics:visual:text-shadow-opacity") || "50",
    "text-shadow-blur":
      StorageManager.getItem("ivLyrics:visual:text-shadow-blur") || "2",
    "original-opacity":
      StorageManager.getItem("ivLyrics:visual:original-opacity") || "100",
    "translation-opacity":
      StorageManager.getItem("ivLyrics:visual:translation-opacity") || "85",
    "translate:translated-lyrics-source":
      StorageManager.getItem(
        "ivLyrics:visual:translate:translated-lyrics-source"
      ) || "geminiKo",
    "translate:display-mode":
      StorageManager.getItem("ivLyrics:visual:translate:display-mode") ||
      "replace",
    "translate:detect-language-override":
      StorageManager.getItem(
        "ivLyrics:visual:translate:detect-language-override"
      ) || "off",
    "translation-mode:english":
      StorageManager.getItem("ivLyrics:visual:translation-mode:english") ||
      "none",
    "translation-mode:japanese":
      StorageManager.getItem("ivLyrics:visual:translation-mode:japanese") ||
      "none",
    "translation-mode:korean":
      StorageManager.getItem("ivLyrics:visual:translation-mode:korean") ||
      "none",
    "translation-mode:chinese":
      StorageManager.getItem("ivLyrics:visual:translation-mode:chinese") ||
      "none",
    "translation-mode:russian":
      StorageManager.getItem("ivLyrics:visual:translation-mode:russian") ||
      "none",
    "translation-mode:vietnamese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode:vietnamese"
      ) || "none",
    "translation-mode:german":
      StorageManager.getItem("ivLyrics:visual:translation-mode:german") ||
      "none",
    "translation-mode:spanish":
      StorageManager.getItem("ivLyrics:visual:translation-mode:spanish") ||
      "none",
    "translation-mode:french":
      StorageManager.getItem("ivLyrics:visual:translation-mode:french") ||
      "none",
    "translation-mode:italian":
      StorageManager.getItem("ivLyrics:visual:translation-mode:italian") ||
      "none",
    "translation-mode:portuguese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode:portuguese"
      ) || "none",
    "translation-mode:dutch":
      StorageManager.getItem("ivLyrics:visual:translation-mode:dutch") ||
      "none",
    "translation-mode:polish":
      StorageManager.getItem("ivLyrics:visual:translation-mode:polish") ||
      "none",
    "translation-mode:turkish":
      StorageManager.getItem("ivLyrics:visual:translation-mode:turkish") ||
      "none",
    "translation-mode:arabic":
      StorageManager.getItem("ivLyrics:visual:translation-mode:arabic") ||
      "none",
    "translation-mode:hindi":
      StorageManager.getItem("ivLyrics:visual:translation-mode:hindi") ||
      "none",
    "translation-mode:thai":
      StorageManager.getItem("ivLyrics:visual:translation-mode:thai") ||
      "none",
    "translation-mode:indonesian":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode:indonesian"
      ) || "none",
    "translation-mode:gemini":
      StorageManager.getItem("ivLyrics:visual:translation-mode:gemini") ||
      "none",
    "translation-mode-2:english":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:english") ||
      "none",
    "translation-mode-2:japanese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:japanese"
      ) || "none",
    "translation-mode-2:korean":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:korean") ||
      "none",
    "translation-mode-2:chinese":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:chinese") ||
      "none",
    "translation-mode-2:russian":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:russian") ||
      "none",
    "translation-mode-2:vietnamese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:vietnamese"
      ) || "none",
    "translation-mode-2:german":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:german") ||
      "none",
    "translation-mode-2:spanish":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:spanish") ||
      "none",
    "translation-mode-2:french":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:french") ||
      "none",
    "translation-mode-2:italian":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:italian") ||
      "none",
    "translation-mode-2:portuguese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:portuguese"
      ) || "none",
    "translation-mode-2:dutch":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:dutch") ||
      "none",
    "translation-mode-2:polish":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:polish") ||
      "none",
    "translation-mode-2:turkish":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:turkish") ||
      "none",
    "translation-mode-2:arabic":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:arabic") ||
      "none",
    "translation-mode-2:hindi":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:hindi") ||
      "none",
    "translation-mode-2:thai":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:thai") ||
      "none",
    "translation-mode-2:indonesian":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:indonesian"
      ) || "none",
    "translation-mode-2:gemini":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:gemini") ||
      "none",
    "gemini-api-key":
      StorageManager.getPersisted("ivLyrics:visual:gemini-api-key") || "",
    "gemini-api-key-romaji":
      StorageManager.getPersisted("ivLyrics:visual:gemini-api-key-romaji") ||
      "",
    translate: StorageManager.get("ivLyrics:visual:translate", false),
    "furigana-enabled": StorageManager.get(
      "ivLyrics:visual:furigana-enabled",
      false
    ),
    "ja-detect-threshold":
      StorageManager.getItem("ivLyrics:visual:ja-detect-threshold") || "40",
    "hans-detect-threshold":
      StorageManager.getItem("ivLyrics:visual:hans-detect-threshold") ||
      "40",
    "fade-blur": StorageManager.get("ivLyrics:visual:fade-blur"),
    "highlight-mode": StorageManager.get("ivLyrics:visual:highlight-mode", false),
    "highlight-intensity":
      StorageManager.getItem("ivLyrics:visual:highlight-intensity") || "70",
    "karaoke-bounce": StorageManager.get(
      "ivLyrics:visual:karaoke-bounce",
      true
    ),
    "karaoke-mode-enabled": StorageManager.get(
      "ivLyrics:visual:karaoke-mode-enabled",
      true
    ),
    // Prefetch settings
    "prefetch-enabled": StorageManager.get(
      "ivLyrics:visual:prefetch-enabled",
      true
    ),
    "prefetch-video-enabled": StorageManager.get(
      "ivLyrics:visual:prefetch-video-enabled",
      true
    ),
    // Community sync settings
    "community-sync-enabled": StorageManager.get(
      "ivLyrics:visual:community-sync-enabled",
      true
    ),
    "community-sync-auto-apply": StorageManager.get(
      "ivLyrics:visual:community-sync-auto-apply",
      true
    ),
    "community-sync-min-confidence":
      Number(StorageManager.getItem("ivLyrics:visual:community-sync-min-confidence")) || 0.5,
    "community-sync-auto-submit": StorageManager.get(
      "ivLyrics:visual:community-sync-auto-submit",
      false
    ),
    "fullscreen-key":
      StorageManager.getItem("ivLyrics:visual:fullscreen-key") || "f12",
    "synced-compact": StorageManager.get("ivLyrics:visual:synced-compact"),
    // 메타데이터 번역 (제목/아티스트)
    "translate-metadata": StorageManager.get(
      "ivLyrics:visual:translate-metadata",
      false
    ),
    "translate-metadata-mode":
      StorageManager.getItem("ivLyrics:visual:translate-metadata-mode") || "translated",
    // Fullscreen settings
    "fullscreen-two-column": StorageManager.get(
      "ivLyrics:visual:fullscreen-two-column",
      true
    ),
    "fullscreen-layout-reverse": StorageManager.get(
      "ivLyrics:visual:fullscreen-layout-reverse",
      false
    ),
    "fullscreen-show-album": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-album",
      true
    ),
    "fullscreen-show-info": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-info",
      true
    ),
    "fullscreen-center-when-no-lyrics": StorageManager.get(
      "ivLyrics:visual:fullscreen-center-when-no-lyrics",
      true
    ),
    "fullscreen-album-size":
      StorageManager.getItem("ivLyrics:visual:fullscreen-album-size") ||
      "400",
    "fullscreen-album-radius":
      StorageManager.getItem("ivLyrics:visual:fullscreen-album-radius") ||
      "12",
    "fullscreen-title-size":
      StorageManager.getItem("ivLyrics:visual:fullscreen-title-size") ||
      "48",
    "fullscreen-artist-size":
      StorageManager.getItem("ivLyrics:visual:fullscreen-artist-size") ||
      "24",
    "fullscreen-lyrics-right-padding":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-lyrics-right-padding")) ||
      0,
    // Fullscreen UI elements
    "fullscreen-show-clock": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-clock",
      true
    ),
    "fullscreen-clock-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-clock-size")) ||
      48,
    "fullscreen-show-context": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-context",
      true
    ),
    "fullscreen-show-next-track": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-next-track",
      true
    ),
    "fullscreen-next-track-seconds":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-next-track-seconds")) ||
      15,
    "fullscreen-show-controls": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-controls",
      true
    ),
    "fullscreen-show-volume": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-volume",
      true
    ),
    "fullscreen-show-progress": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-progress",
      true
    ),
    "fullscreen-show-lyrics-progress": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-lyrics-progress",
      false
    ),
    // Fullscreen control styles
    "fullscreen-control-button-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-control-button-size")) ||
      36,
    "fullscreen-controls-background": StorageManager.get(
      "ivLyrics:visual:fullscreen-controls-background",
      false
    ),
    // Fullscreen auto-hide
    "fullscreen-auto-hide-ui": StorageManager.get(
      "ivLyrics:visual:fullscreen-auto-hide-ui",
      true
    ),
    "fullscreen-auto-hide-delay":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-auto-hide-delay")) ||
      3,
    // Browser fullscreen (monitor fill)
    "fullscreen-browser-fullscreen": StorageManager.get(
      "ivLyrics:visual:fullscreen-browser-fullscreen",
      false
    ),
    // TMI font size
    "fullscreen-tmi-font-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-tmi-font-size")) ||
      100,
    // TV Mode settings
    "fullscreen-tv-mode": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-mode",
      false
    ),
    "fullscreen-tv-album-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-tv-album-size")) ||
      140,
    "fullscreen-tv-show-album-name": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-show-album-name",
      true
    ),
    "fullscreen-tv-show-controls": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-show-controls",
      false
    ),
    "fullscreen-tv-show-progress": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-show-progress",
      false
    ),
    // Normal mode album name display
    "fullscreen-show-album-name": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-album-name",
      false
    ),
    // Title trim setting
    "fullscreen-trim-title": StorageManager.get(
      "ivLyrics:visual:fullscreen-trim-title",
      false
    ),
    // Context image setting
    "fullscreen-show-context-image": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-context-image",
      true
    ),
    // Info gap setting
    "fullscreen-info-gap":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-info-gap")) || 24,
    // Queue panel setting
    "fullscreen-show-queue": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-queue",
      true
    ),

    delay: 0,
  },
  providers: {
    lrclib: {
      on: StorageManager.get("ivLyrics:provider:lrclib:on"),
      get desc() { return window.I18n ? I18n.t("providerDescriptions.lrclib") : "Lyrics from lrclib.net"; },
      modes: [SYNCED, UNSYNCED],
    },
    ivlyrics: {
      on: StorageManager.get("ivLyrics:provider:ivlyrics:on", true),
      get desc() { return window.I18n ? I18n.t("providerDescriptions.ivLyrics") : "Lyrics from ivLyrics API"; },
      modes: [KARAOKE, SYNCED, UNSYNCED],
    },
    spotify: {
      on: StorageManager.get("ivLyrics:provider:spotify:on"),
      get desc() { return window.I18n ? I18n.t("providerDescriptions.spotify") : "Lyrics from Spotify"; },
      modes: [SYNCED, UNSYNCED],
    },
    local: {
      on: StorageManager.get("ivLyrics:provider:local:on"),
      get desc() { return window.I18n ? I18n.t("providerDescriptions.cache") : "Cached lyrics"; },
      modes: [SYNCED, UNSYNCED],
    },
  },
  providersOrder: StorageManager.getItem("ivLyrics:services-order"),
  get modes() { return window.I18n ? [I18n.t("modes.karaoke"), I18n.t("modes.synced"), I18n.t("modes.unsynced")] : ["Karaoke", "Synced", "Unsynced"]; },
  locked: StorageManager.getItem("ivLyrics:lock-mode") || "-1",
};

try {
  CONFIG.providersOrder = JSON.parse(CONFIG.providersOrder);
  if (
    !Array.isArray(CONFIG.providersOrder) ||
    Object.keys(CONFIG.providers).length !== CONFIG.providersOrder.length
  ) {
    throw "";
  }
} catch {
  CONFIG.providersOrder = ["ivlyrics", "spotify", "lrclib", "local"];
  StorageManager.setItem(
    "ivLyrics:services-order",
    JSON.stringify(CONFIG.providersOrder)
  );
}

CONFIG.locked = Number.parseInt(CONFIG.locked);
CONFIG.visual["lines-before"] = Number.parseInt(CONFIG.visual["lines-before"]);
CONFIG.visual["lines-after"] = Number.parseInt(CONFIG.visual["lines-after"]);
CONFIG.visual["font-size"] = Number.parseInt(CONFIG.visual["font-size"]);
CONFIG.visual["original-font-weight"] = Number.parseInt(
  CONFIG.visual["original-font-weight"]
);
CONFIG.visual["original-font-size"] = Number.parseInt(
  CONFIG.visual["original-font-size"]
);
CONFIG.visual["translation-font-weight"] = Number.parseInt(
  CONFIG.visual["translation-font-weight"]
);
CONFIG.visual["translation-font-size"] = Number.parseInt(
  CONFIG.visual["translation-font-size"]
);
CONFIG.visual["text-shadow-opacity"] = Number.parseInt(
  CONFIG.visual["text-shadow-opacity"]
);
CONFIG.visual["text-shadow-blur"] = Number.parseInt(
  CONFIG.visual["text-shadow-blur"]
);
CONFIG.visual["original-opacity"] = Number.parseInt(
  CONFIG.visual["original-opacity"]
);
CONFIG.visual["translation-opacity"] = Number.parseInt(
  CONFIG.visual["translation-opacity"]
);
CONFIG.visual["background-brightness"] = Number.parseInt(
  CONFIG.visual["background-brightness"]
);
CONFIG.visual["ja-detect-threshold"] = Number.parseInt(
  CONFIG.visual["ja-detect-threshold"]
);
CONFIG.visual["hans-detect-threshold"] = Number.parseInt(
  CONFIG.visual["hans-detect-threshold"]
);
CONFIG.visual["highlight-intensity"] = Number.parseInt(
  CONFIG.visual["highlight-intensity"]
);

// Global cache object
window.CACHE = window.CACHE || {};

// Extension에서 접근 가능하도록 window에 노출
window.CONFIG = CONFIG;
window.StorageManager = StorageManager;
