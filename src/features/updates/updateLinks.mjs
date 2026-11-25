export const APP_UPDATE_PAGE_URL = "https://lyrics.ivl.is/update";
export const APP_RELEASES_URL = "https://github.com/ivLis-Studio/ivLyrics/releases";

export function getAppReleaseUrl(version) {
  return `${APP_RELEASES_URL}/tag/v${encodeURIComponent(String(version ?? ""))}`;
}
