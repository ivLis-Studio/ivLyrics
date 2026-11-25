import { clampSyncOffset } from "#ivlyrics/core/globalSyncOffset.mjs";

export { clampSyncOffset };

export const formatSyncOffset = (value) => {
  const safeOffset = clampSyncOffset(value);
  return `${safeOffset > 0 ? "+" : ""}${safeOffset}ms`;
};

export const COMMUNITY_VIDEO_SYNC_MAX_SECONDS = 3600;

export const normalizeCommunityVideoSyncSeconds = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  const clamped = Math.max(0, Math.min(COMMUNITY_VIDEO_SYNC_MAX_SECONDS, parsed));
  return Math.round(clamped * 1000) / 1000;
};

export const clampCommunityVideoSyncSeconds = (value, videoDurationSeconds) => {
  const normalized = normalizeCommunityVideoSyncSeconds(value);
  const parsedDuration = Number(videoDurationSeconds);
  const maxSeconds = Number.isFinite(parsedDuration) && parsedDuration > 0
    ? Math.min(COMMUNITY_VIDEO_SYNC_MAX_SECONDS, parsedDuration)
    : COMMUNITY_VIDEO_SYNC_MAX_SECONDS;
  return Math.max(0, Math.min(maxSeconds, normalized));
};

export const formatCommunityVideoSyncSeconds = (value) => {
  const normalized = normalizeCommunityVideoSyncSeconds(value);
  return `${normalized.toFixed(3)}s`;
};
