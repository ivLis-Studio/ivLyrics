import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { getAppUpdateInfo, setAppUpdateInfo } from "./updateDialogState.mjs";
import { APP_UPDATE_PAGE_URL, getAppReleaseUrl } from "./updateLinks.mjs";

const VERSION_URLS = [
  "https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/version.txt",
  "https://cdn.jsdelivr.net/gh/ivLis-Studio/ivLyrics@main/version.txt",
  "https://ghfast.top/https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/version.txt",
  "https://corsproxy.io/?url=https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/version.txt",
];
const VERSION_REQUEST_TIMEOUT_MS = 8000;
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const dismissalKey = version => `ivLyrics:update-dismissed:${version}`;

async function fetchVersionText(host, url) {
  const controller = new host.AbortController();
  const timeout = host.setTimeout(() => controller.abort(), VERSION_REQUEST_TIMEOUT_MS);
  try {
    const response = await host.fetch(url, {
      signal: controller.signal,
      cache: "no-cache",
      headers: { Accept: "text/plain, */*" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return (await response.text()).trim();
  } finally {
    host.clearTimeout(timeout);
  }
}

async function fetchStableVersion(host, t, currentVersion, displayedVersion, compareVersions) {
  let fallbackVersion;
  let invalidVersion;
  let lastError;
  for (const url of VERSION_URLS) {
    try {
      const version = await fetchVersionText(host, url);
      if (!VERSION_PATTERN.test(version)) {
        if (version) invalidVersion = version;
        continue;
      }
      // The original marker is authoritative. Mirrors can still serve a
      // cached version while other mirrors have picked up the release.
      if (url === VERSION_URLS[0]) return version;
      if (displayedVersion && compareVersions(version, displayedVersion) < 0) continue;
      if (compareVersions(version, currentVersion) > 0) return version;
      fallbackVersion ??= version;
    } catch (error) {
      lastError = error;
    }
  }
  if (fallbackVersion) return fallbackVersion;
  if (invalidVersion) throw new Error(`${t("utils.invalidVersionFormat")}: ${invalidVersion}`);
  throw lastError ?? new Error(t("utils.allUrlsFailed"));
}

function formatVersionError(error, t) {
  const message = error?.message;
  if (error?.name === "AbortError") return t("utils.requestTimeout");
  if (message?.includes("fetch") || message?.includes("NetworkError")) return t("utils.networkError");
  if (message?.includes("CORS")) return t("utils.securityRestriction");
  if (message?.includes("HTTP")) return t("utils.serverError");
  return message || t("utils.unknownError");
}

export function createAppUpdateMethods({ host, t, getStorage }) {
  let pendingVersionCheck;
  const dismissedThisSession = new Set();

  function wasDismissed(version) {
    if (dismissedThisSession.has(version)) return true;
    try {
      return !!getStorage().getItem(dismissalKey(version));
    } catch {
      return false;
    }
  }

  return {
    /**
     * Detect platform
     */
    detectPlatform() {
      const userAgent = host.navigator.userAgent.toLowerCase();
      if (userAgent.includes("win")) return "windows";
      if (userAgent.includes("mac")) return "mac";
      return "linux";
    },

    /**
     * Get install command for current platform
     */
    getInstallCommand() {
      const commands = {
        windows: "iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1 | iex",
        mac: "curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh | bash",
        linux: "curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh | bash",
      };
      return commands[this.detectPlatform()];
    },

    /**
     * Whether the one-click local updater protocol is supported on this platform.
     * Windows uses HKCU URL protocol registration, macOS uses a local app bundle,
     * and Linux uses xdg-mime with a desktop entry.
     */
    canUseUpdaterProtocol() {
      return ["windows", "mac", "linux"].includes(this.detectPlatform());
    },

    /**
     * Open the public update bridge page. Spotify's internal webview can block
     * custom protocol navigation, so the browser page performs the protocol jump.
     */
    openUpdaterProtocol() {
      try {
        const link = host.document.createElement("a");
        link.href = APP_UPDATE_PAGE_URL;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.display = "none";
        host.document.body.appendChild(link);
        link.click();
        link.remove();
        return true;
      } catch (error) {
        console.error("[Utils] Failed to open updater protocol:", error);
        return false;
      }
    },

    /**
     * Get platform name in Korean
     */
    getPlatformName() {
      const names = {
        windows: "Windows PowerShell",
        mac: t("utils.terminalMac"),
        linux: "Terminal",
      };
      return names[this.detectPlatform()];
    },

    /**
     * Check for updates from remote repository
     * @returns {Promise<{hasUpdate: boolean, currentVersion: string, latestVersion: string}>}
     */
    checkForUpdates() {
      if (pendingVersionCheck) return pendingVersionCheck;
      const currentVersion = this.currentVersion;
      const displayedUpdate = getAppUpdateInfo(host);
      const displayedVersion = displayedUpdate?.available ? displayedUpdate.latestVersion : null;
      pendingVersionCheck = fetchStableVersion(host, t, currentVersion, displayedVersion, this.compareVersions)
        .then(latestVersion => {
          const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;
          if (!hasUpdate && displayedUpdate?.available && getAppUpdateInfo(host) === displayedUpdate) {
            setAppUpdateInfo(host, null);
          }
          return { hasUpdate, currentVersion, latestVersion };
        })
        .catch(error => ({
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          error: formatVersionError(error, t),
        }))
        .finally(() => { pendingVersionCheck = undefined; });
      return pendingVersionCheck;
    },

    /**
     * Compare two version strings
     * @param {string} a - First version (e.g., "1.1.0")
     * @param {string} b - Second version (e.g., "1.0.9")
     * @returns {number} - 1 if a > b, -1 if a < b, 0 if equal
     */
    compareVersions(a, b) {
      const aParts = a.split(".").map(Number);
      const bParts = b.split(".").map(Number);

      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;

        if (aPart > bPart) return 1;
        if (aPart < bPart) return -1;
      }

      return 0;
    },

    /**
     * Show update notification if available
     */
    async showUpdateNotificationIfAvailable() {
      try {
        const updateInfo = await this.checkForUpdates();

        writeRuntimeDebug(host, "[ivLyrics] Update check result:", updateInfo);

        // Don't show notification if there was an error
        if (updateInfo.error) {
          writeRuntimeDebug(host, "[ivLyrics] Update check error:", updateInfo.error);
          return updateInfo;
        }

        if (updateInfo.hasUpdate) {
          const { latestVersion, currentVersion } = updateInfo;
          const isDismissed = wasDismissed(latestVersion);
          const existing = getAppUpdateInfo(host);

          writeRuntimeDebug(host,
            "[ivLyrics] Update available:",
            updateInfo.latestVersion,
            "Dismissed:",
            isDismissed
          );

          if (isDismissed) {
            if (existing?.available) setAppUpdateInfo(host, null);
          } else if (!existing?.available || existing.latestVersion !== latestVersion
            || existing.currentVersion !== currentVersion) {
            setAppUpdateInfo(host, {
              available: true, currentVersion, latestVersion, releaseUrl: getAppReleaseUrl(latestVersion),
            });
          }
        } else {
          writeRuntimeDebug(host, "[ivLyrics] Already up to date");
        }

        return updateInfo;
      } catch (error) {
        // Silently fail for automatic update checks to avoid spam
        return {
          hasUpdate: false,
          currentVersion: this.currentVersion,
          latestVersion: this.currentVersion,
          error: error.message,
        };
      }
    },

    /**
     * Dismiss update notification
     */
    dismissUpdate(version) {
      if (version) {
        dismissedThisSession.add(version);
        try {
          getStorage().setItem(dismissalKey(version), "dismissed");
        } catch (error) {
          writeRuntimeDebug(host, "[ivLyrics] Could not persist update dismissal:", error);
        }
      }
      const openVersion = getAppUpdateInfo(host)?.latestVersion;
      if (!version || !openVersion || openVersion === version) {
        setAppUpdateInfo(host, null);
      }
    },
  };
}
