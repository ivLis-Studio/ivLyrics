import { TRACK_SYNC_OFFSETS_STORAGE_KEY } from "./trackSyncOffsetStore.mjs";
import { SETTINGS_IMPORT_JOURNAL_KEY } from "./settingsImportJournal.mjs";

export const SETTINGS_NAMESPACE = "ivLyrics";
export const STORAGE_KEYS_METADATA_KEY = `${SETTINGS_NAMESPACE}:storage-keys`;
export const SETTINGS_RECOVERY_RECORD_KEY = `${SETTINGS_NAMESPACE}:settings-backup:v1`;
export const SETTINGS_RESET_RECORD_KEY = `${SETTINGS_NAMESPACE}:settings-reset-revisions`;
const CURRENT_STORAGE_PREFIX = `${SETTINGS_NAMESPACE}:`;
const LEGACY_STORAGE_PREFIX = "lyrics-plus:";
const RECOVERABLE_PREFIXES = ["visual:", "ai:", "lyrics:", "marketplace:", "learningMode:"]
  .map(prefix => CURRENT_STORAGE_PREFIX + prefix);
const RECOVERABLE_KEYS = new Set([
  "setup-completed", "settings-ui-theme", "settings-presets", "overlay-enabled", "overlay-port", "storage-keys",
].map(name => CURRENT_STORAGE_PREFIX + name));

export function isRecoverableSettingKey(key) {
  return typeof key === "string"
    && (RECOVERABLE_KEYS.has(key) || RECOVERABLE_PREFIXES.some(prefix => key.startsWith(prefix)));
}

const PRIVATE_OR_TRANSIENT_STORAGE_KEYS = new Set([
  STORAGE_KEYS_METADATA_KEY,
  SETTINGS_RECOVERY_RECORD_KEY,
  SETTINGS_RESET_RECORD_KEY,
  SETTINGS_IMPORT_JOURNAL_KEY,
  `${SETTINGS_NAMESPACE}:user-hash`,
  `${SETTINGS_NAMESPACE}:client-id`,
  `${SETTINGS_NAMESPACE}:auth-token`,
  `${SETTINGS_NAMESPACE}:discord-login-pending`,
  `${SETTINGS_NAMESPACE}:return-to-settings`,
  `${SETTINGS_NAMESPACE}:restore-route-after-reload`,
  `${SETTINGS_NAMESPACE}:cloud-save-device-id`,
  `${SETTINGS_NAMESPACE}:ai:bing-translate:proxy-client-address`,
]);
const CLOUD_SYNC_EXCLUDED_STORAGE_KEYS = new Set([
  `${SETTINGS_NAMESPACE}:settings-presets`,
  `${SETTINGS_NAMESPACE}:ai:addon:chatgpt:fallback-providers`,
  `${SETTINGS_NAMESPACE}:ai:addon:chatgpt:extra-endpoints`,
  `${SETTINGS_NAMESPACE}:ai:addon:nvidia-nim:extra-endpoints`,
]);
const CLOUD_SYNC_EXCLUDED_KEY_SUFFIXES = ['extra-endpoints'];
const CLOUD_SYNC_FORBIDDEN_KEY_PATTERN = /(apikey|token|password|secret|credential|clientid|userhash)/i;
const CLOUD_SYNC_SAFE_TOKEN_LIMIT_PATTERN = /max(?:output)?tokens?/gi;
const isCloudSyncCredentialLikeKey = (key) => {
  if (typeof key !== "string") return false;
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const credentialCandidate = normalized.replace(CLOUD_SYNC_SAFE_TOKEN_LIMIT_PATTERN, "");
  return CLOUD_SYNC_FORBIDDEN_KEY_PATTERN.test(credentialCandidate);
};
export const isCloudSyncSettingKey = (key) => (
  isSettingsBackupKey(key) &&
  !CLOUD_SYNC_EXCLUDED_STORAGE_KEYS.has(key) &&
  !CLOUD_SYNC_EXCLUDED_KEY_SUFFIXES.some((suffix) => key === suffix || key.endsWith(`:${suffix}`)) &&
  !isCloudSyncCredentialLikeKey(key)
);
const OBSOLETE_LEGACY_STORAGE_KEYS = new Set([
  `${SETTINGS_NAMESPACE}:provider:lrclib:on`,
  `${SETTINGS_NAMESPACE}:provider:ivlyrics:on`,
  `${SETTINGS_NAMESPACE}:provider:spotify:on`,
  `${SETTINGS_NAMESPACE}:provider:local:on`,
  `${SETTINGS_NAMESPACE}:services-order`,
  `${SETTINGS_NAMESPACE}:lock-mode`,
  `${SETTINGS_NAMESPACE}:visual:global-delay`,
]);

export function isSettingsBackupKey(key) {
  return typeof key === "string"
    && key.startsWith(CURRENT_STORAGE_PREFIX)
    && key !== TRACK_SYNC_OFFSETS_STORAGE_KEY
    && !OBSOLETE_LEGACY_STORAGE_KEYS.has(key)
    && !PRIVATE_OR_TRANSIENT_STORAGE_KEYS.has(key);
}

export function isSettingsBackupFile(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const keys = Object.keys(config);
  return keys.length === 0 || keys.some(key => key.startsWith(CURRENT_STORAGE_PREFIX) || key.startsWith(LEGACY_STORAGE_PREFIX));
}

const IMPORT_PROVIDER_ORDER_KEYS = new Set([
  `${SETTINGS_NAMESPACE}:ai:provider-order`,
  `${SETTINGS_NAMESPACE}:lyrics:provider-order`,
]);
// AI addon settings keep the API endpoint (`base-url`) and the API key
// (`api-keys`) as two independent keys, and a request pairs the two. An
// imported settings file can therefore redirect where a credential the user
// already stored is sent, without that credential ever appearing in the file.
// Imported endpoints are therefore restricted to http(s), matching the scheme
// check the rest of the app already applies to provider URLs.
const IMPORT_ENDPOINT_KEY_PATTERN = /(^|:)(base-url|baseurl|api-base|apiurl)$/i;
const isImportedEndpointValueSafe = (value) => {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};
export function normalizeImportedConfig(config, { getI18n, logger = console } = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("Invalid ivLyrics settings backup.");
  }

  const normalizedConfig = {};
  const entries = Object.entries(config);

  // Keep current-format values when a backup contains both current and
  // pre-rebrand keys. This also prevents an older duplicate from overwriting
  // the value that was exported by a newer version.
  entries.forEach(([key, value]) => {
    if (key.startsWith(CURRENT_STORAGE_PREFIX)) {
      normalizedConfig[key] = value;
    }
  });
  entries.forEach(([key, value]) => {
    if (!key.startsWith(LEGACY_STORAGE_PREFIX)) return;
    const migratedKey = `${CURRENT_STORAGE_PREFIX}${key.slice(LEGACY_STORAGE_PREFIX.length)}`;
    if (
      !OBSOLETE_LEGACY_STORAGE_KEYS.has(migratedKey) &&
      !Object.prototype.hasOwnProperty.call(normalizedConfig, migratedKey)
    ) {
      normalizedConfig[migratedKey] = value;
    }
  });

  OBSOLETE_LEGACY_STORAGE_KEYS.forEach((key) => {
    delete normalizedConfig[key];
  });
  PRIVATE_OR_TRANSIENT_STORAGE_KEYS.forEach((key) => {
    delete normalizedConfig[key];
  });

  const languageKey = `${SETTINGS_NAMESPACE}:visual:language`;
  const quickSyncControlsKey =
    `${SETTINGS_NAMESPACE}:visual:quick-sync-controls-enabled`;

  if (Object.prototype.hasOwnProperty.call(normalizedConfig, languageKey)) {
    const importedLanguage = String(normalizedConfig[languageKey] ?? "").trim();
    let availableLanguages = [];

    try {
      availableLanguages = (getI18n?.()?.getAvailableLanguages?.() || [])
        .map((language) => language?.code)
        .filter((language) => typeof language === "string" && language);
    } catch (error) {
      logger.warn("[ivLyrics] Failed to read the supported UI languages.", error);
    }

    if (availableLanguages.includes(importedLanguage)) {
      normalizedConfig[languageKey] = importedLanguage;
    } else {
      const currentLanguage = getI18n?.()?.getCurrentLanguage?.();
      normalizedConfig[languageKey] =
        availableLanguages.includes(currentLanguage)
          ? currentLanguage
          : availableLanguages[0] || "ko";
      logger.warn(
        `[ivLyrics] Replaced unsupported imported language: ${importedLanguage || "(empty)"}`
      );
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      normalizedConfig,
      quickSyncControlsKey
    )
  ) {
    const importedValue = normalizedConfig[quickSyncControlsKey];
    const normalizedValue =
      typeof importedValue === "boolean"
        ? String(importedValue)
        : typeof importedValue === "string" &&
          ["true", "false"].includes(importedValue.trim().toLowerCase())
          ? importedValue.trim().toLowerCase()
          : "true";
    normalizedConfig[quickSyncControlsKey] = normalizedValue;
  }

  IMPORT_PROVIDER_ORDER_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedConfig, key)) return;

    let order = normalizedConfig[key];
    if (typeof order === "string") {
      try {
        order = JSON.parse(order);
      } catch (error) {
        order = null;
      }
    }

    if (!Array.isArray(order)) {
      normalizedConfig[key] = "[]";
      logger.warn(`[ivLyrics] Reset invalid imported provider order: ${key}`);
      return;
    }

    normalizedConfig[key] = JSON.stringify(
      Array.from(
        new Set(order.filter((id) => typeof id === "string" && id.length > 0))
      )
    );
  });

  Object.entries(normalizedConfig).forEach(([key, value]) => {
    if (key === TRACK_SYNC_OFFSETS_STORAGE_KEY) return;
    if (IMPORT_ENDPOINT_KEY_PATTERN.test(key)) {
      if (isImportedEndpointValueSafe(value)) return;
      delete normalizedConfig[key];
      logger.warn(`[ivLyrics] Ignored imported endpoint with unsafe value: ${key}`);
      return;
    }
    if (typeof value === "string") return;
    if (typeof value === "boolean" || (
      typeof value === "number" && Number.isFinite(value)
    )) {
      normalizedConfig[key] = String(value);
      return;
    }
    delete normalizedConfig[key];
    logger.warn(`[ivLyrics] Ignored invalid imported setting: ${key}`);
  });

  return normalizedConfig;
}
