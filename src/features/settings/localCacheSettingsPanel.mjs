function getSafeSettingsLocale(readLanguage) {
  let currentLanguage = null;
  try {
    currentLanguage = readLanguage();
  } catch {
    // Fall through to the browser locale.
  }

  const candidates = [
    currentLanguage,
    typeof navigator !== "undefined" ? navigator.language : null,
    "en-US",
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    try {
      if (Intl.getCanonicalLocales(candidate).length > 0) {
        return candidate;
      }
    } catch {
      // Try the next locale.
    }
  }
  return "en-US";
}

export function createLocalCacheSettingsPanel({
  react, cache, readLanguage, readTrackUri, extractTrackId, getTranslationCacheId,
  getSettingsText, translate, confirm, reloadLyrics, notifySuccess, notifyError,
}) {
  const { useState, useEffect } = react;

  return function LocalCacheManager() {
    const [stats, setStats] = useState(null);
    const [openDbInfo, setOpenDbInfo] = useState(null);
    const [openDbUpdating, setOpenDbUpdating] = useState(false);
    const [openDbError, setOpenDbError] = useState("");
    const [loading, setLoading] = useState(true);
    const settingsLocale = getSafeSettingsLocale(readLanguage);

    // 캐시 통계 로드
    const loadStats = async () => {
      setLoading(true);
      try {
        const cacheStats = await cache.getStats();
        setStats(cacheStats);
      } catch (e) {
        console.error('[LocalCacheManager] Failed to load stats:', e);
        setStats(null);
      } finally {
        setOpenDbInfo(cache.getOpenDbInfo());
        setLoading(false);
      }
    };

    // 컴포넌트 마운트 시 통계 로드
    useEffect(() => {
      loadStats();
    }, []);

    // 전체 캐시 삭제
    const handleClearAll = async () => {
      try {
        await cache.clearAll();
        await loadStats();

        // 캐시는 이미 지웠으므로 clearCache=false로 호출
        reloadLyrics(false);
        notifySuccess(translate("notifications.localCacheCleared"));
      } catch (e) {
        console.error('[LocalCacheManager] Clear all failed:', e);
        notifyError(translate("messages.error"));
      }
    };

    // 현재 곡 캐시 삭제
    const handleClearCurrent = async () => {
      const trackUri = readTrackUri();
      // 로컬 곡 URI(spotify:local:아티스트:앨범:제목:길이)는 세 번째 칸이 아티스트명이라
      // 엉뚱한 키를 지웠다. 캐시는 Spotify 트랙 ID 또는 local-uri: 키로 저장된다.
      const spotifyTrackId = extractTrackId(trackUri) || null;
      const trackId = spotifyTrackId || getTranslationCacheId(trackUri) || null;
      if (!trackId) {
        notifyError(translate("notifications.noTrackPlaying"));
        return;
      }

      // 로컬 곡은 저장된 로컬 가사가 남아 있으면 다시 불러올 때 그대로 복원되므로,
      // 확인을 받은 경우에만 함께 지운다.
      const removeLocalLyrics = !spotifyTrackId
        && cache.hasSavedLocalLyrics(trackUri)
        && confirm(getSettingsText(
          "menu.localLyricsDeleteConfirm",
          "Delete the local lyrics saved for this track? This can't be undone."
        ));

      try {
        const removedLocalLyrics = await cache.clearTrack(trackUri, trackId, removeLocalLyrics);
        await loadStats();

        // 캐시는 이미 지웠으므로 clearCache=false로 호출
        reloadLyrics(false, trackUri);
        notifySuccess(removedLocalLyrics
          ? getSettingsText("notifications.localLyricsDeleted", "Local lyrics deleted")
          : translate("notifications.localCacheTrackCleared"));
      } catch (e) {
        console.error('[LocalCacheManager] Clear track failed:', e);
        notifyError(translate("messages.error"));
      }
    };

    // 통계 문자열 생성
    const getStatsText = () => {
      if (loading) return "Loading...";
      if (!stats) return "Cache not available";

      return translate("settingsAdvanced.cacheManagement.localCache.stats")
        .replace("{lyrics}", stats.lyrics || 0)
        .replace("{translations}", stats.translations || 0)
        .replace("{metadata}", stats.metadata || 0);
    };

    const formatOpenDbRelativeTime = (timestamp) => {
      const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(timestamp || ""));
      const time = dateOnlyMatch
        ? new Date(
          Number(dateOnlyMatch[1]),
          Number(dateOnlyMatch[2]) - 1,
          Number(dateOnlyMatch[3])
        ).getTime()
        : new Date(timestamp).getTime();
      if (!Number.isFinite(time)) return "";

      const difference = time - Date.now();
      const absoluteDifference = Math.abs(difference);
      if (absoluteDifference < 60 * 1000) {
        return getSettingsText(
          "settingsAdvanced.cacheManagement.openDb.justNow",
          "방금"
        );
      }
      const units = absoluteDifference >= 24 * 60 * 60 * 1000
        ? ["day", 24 * 60 * 60 * 1000]
        : absoluteDifference >= 60 * 60 * 1000
          ? ["hour", 60 * 60 * 1000]
          : ["minute", 60 * 1000];

      try {
        return new Intl.RelativeTimeFormat(settingsLocale, { numeric: "auto" })
          .format(Math.round(difference / units[1]), units[0]);
      } catch (error) {
        return "";
      }
    };

    const formatOpenDbDate = (value) => {
      const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
      const time = dateOnlyMatch
        ? new Date(
          Number(dateOnlyMatch[1]),
          Number(dateOnlyMatch[2]) - 1,
          Number(dateOnlyMatch[3])
        ).getTime()
        : new Date(value).getTime();
      if (!Number.isFinite(time)) return value || "";
      try {
        return new Intl.DateTimeFormat(
          settingsLocale,
          {
            year: "numeric",
            month: "short",
            day: "numeric",
          }
        ).format(time);
      } catch (error) {
        return value || "";
      }
    };

    const handleRefreshOpenDb = async () => {
      const refreshOpenDbCache = cache.getOpenDbRefresh();
      if (typeof refreshOpenDbCache !== "function") {
        setOpenDbError(getSettingsText(
          "settingsAdvanced.cacheManagement.openDb.unavailable",
          "OpenDB 캐시 서비스를 사용할 수 없습니다."
        ));
        return;
      }

      setOpenDbUpdating(true);
      setOpenDbError("");
      try {
        const nextInfo = await refreshOpenDbCache();
        setOpenDbInfo(nextInfo);
        notifySuccess(getSettingsText(
          "settingsAdvanced.cacheManagement.openDb.updateSuccess",
          "OpenDB base와 delta를 다시 가져왔습니다."
        ));
      } catch (error) {
        console.error('[LocalCacheManager] OpenDB refresh failed:', error);
        const failedInfo = error?.cacheInfo || cache.getOpenDbInfo();
        setOpenDbInfo(failedInfo);
        const message = getSettingsText(
          failedInfo?.available
            ? "settingsAdvanced.cacheManagement.openDb.updateFailed"
            : "settingsAdvanced.cacheManagement.openDb.updateFailedNoCache",
          failedInfo?.available
            ? "OpenDB를 갱신하지 못했습니다. 기존 캐시는 유지됩니다."
            : "OpenDB를 갱신하지 못했고 사용할 기존 캐시가 없습니다."
        );
        setOpenDbError(message);
        notifyError(message);
      } finally {
        setOpenDbUpdating(false);
      }
    };

    const hasCachedData = stats && Object.values(stats).some(count => count > 0);

    const openDbVersionDate = openDbInfo?.dataVersionAt || openDbInfo?.latestDeltaDate || openDbInfo?.baseDate;
    const openDbVersionRelative = openDbVersionDate
      ? formatOpenDbRelativeTime(openDbVersionDate)
      : "";
    const openDbVersionText = openDbVersionDate
      ? `${formatOpenDbDate(openDbVersionDate)}${openDbVersionRelative ? ` · ${openDbVersionRelative}` : ""}`
      : getSettingsText(
        "settingsAdvanced.cacheManagement.openDb.notDownloaded",
        "아직 내려받은 인덱스가 없습니다."
      );
    const openDbLastCheckedText = openDbInfo?.lastCheckedAt
      ? formatOpenDbRelativeTime(openDbInfo.lastCheckedAt)
      : "";
    const openDbVersionSummary = getSettingsText(
      "settingsAdvanced.cacheManagement.openDb.versionSummary",
      "base {baseDate} + delta {deltaCount}"
    )
      .replace("{baseDate}", openDbInfo?.baseDate || "-")
      .replace("{deltaCount}", openDbInfo?.deltaCount || 0);
    const openDbCoverageSummary = getSettingsText(
      "settingsAdvanced.cacheManagement.openDb.coverageSummary",
      "{isrcCount} ISRC · {providerCount} providers"
    )
      .replace(
        "{isrcCount}",
        Number(openDbInfo?.distinctIsrcCount || 0).toLocaleString(
          settingsLocale
        )
      )
      .replace("{providerCount}", openDbInfo?.providerCount || 0);

    const renderLocalCacheRow = () =>
      react.createElement(
        "div",
        { className: "setting-row" },
      react.createElement(
        "div",
        { className: "setting-row-content" },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement("div", { className: "setting-name" },
            translate("settingsAdvanced.cacheManagement.localCache.label")
          ),
          react.createElement("div", { className: "setting-description" },
            translate("settingsAdvanced.cacheManagement.localCache.desc")
          ),
          react.createElement("div", {
            className: "setting-description",
            style: { marginTop: "4px", opacity: 0.7 }
          }, getStatsText())
        ),
        react.createElement(
          "div",
          { className: "setting-row-right cache-action-buttons" },
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn",
              onClick: handleClearCurrent,
            },
            translate("settingsAdvanced.cacheManagement.localCache.clearCurrent")
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn",
              onClick: handleClearAll,
              disabled: !hasCachedData,
            },
            translate("settingsAdvanced.cacheManagement.localCache.clearAll")
          )
        )
      )
      );

    const renderOpenDbCacheRow = () =>
      react.createElement(
        "div",
        { className: "setting-row opendb-cache-row" },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            { className: "setting-row-left" },
            react.createElement(
              "div",
              { className: "setting-name" },
              getSettingsText(
                "settingsAdvanced.cacheManagement.openDb.label",
                "OpenDB 인덱스 캐시"
              )
            ),
            react.createElement(
              "div",
              { className: "setting-description" },
              getSettingsText(
                "settingsAdvanced.cacheManagement.openDb.desc",
                "sync-data가 있는 가사 제공자를 찾는 base + delta 인덱스입니다."
              )
            ),
            react.createElement(
              "div",
              {
                className: "opendb-cache-status",
                role: "status",
                "aria-live": "polite",
                "aria-atomic": "true",
                "aria-busy": openDbUpdating,
              },
              react.createElement(
                "div",
                { className: "opendb-cache-status-primary" },
                react.createElement(
                  "span",
                  {
                    className: `opendb-cache-chip${
                      openDbInfo?.available && !openDbInfo?.stale && !openDbInfo?.networkUnavailable
                        ? " current"
                        : ""
                    }`,
                    dir: "auto",
                  },
                  openDbVersionText
                ),
                openDbInfo?.available && (openDbInfo?.stale || openDbInfo?.networkUnavailable) && react.createElement(
                  "span",
                  { className: "opendb-cache-chip warning", dir: "auto" },
                  getSettingsText(
                    "settingsAdvanced.cacheManagement.openDb.stale",
                    "오프라인 · 기존 캐시 사용 중"
                  )
                )
              ),
              openDbInfo?.available && react.createElement(
                "div",
                { className: "opendb-cache-meta" },
                react.createElement(
                  "span",
                  { dir: "auto" },
                  openDbVersionSummary
                ),
                react.createElement(
                  "span",
                  { dir: "auto" },
                  openDbCoverageSummary
                ),
                openDbLastCheckedText && react.createElement(
                  "span",
                  { dir: "auto" },
                  `${getSettingsText("settingsAdvanced.cacheManagement.openDb.lastChecked", "마지막 확인")} ${openDbLastCheckedText}`
                )
              )
            ),
            openDbError && react.createElement(
              "div",
              { className: "setting-description opendb-cache-error", role: "status" },
              openDbError
            )
          ),
          react.createElement(
            "div",
            { className: "setting-row-right" },
            react.createElement(
              "button",
              {
                type: "button",
                className: "btn opendb-cache-refresh-btn",
                onClick: handleRefreshOpenDb,
                disabled: openDbUpdating,
              },
              openDbUpdating
                ? getSettingsText(
                  "settingsAdvanced.cacheManagement.openDb.updating",
                  "갱신 중…"
                )
                : getSettingsText(
                  "settingsAdvanced.cacheManagement.openDb.update",
                  "base + delta 다시 가져오기"
                )
            )
          )
        )
      );

    return react.createElement(
      "div",
      { className: "option-list-wrapper cache-management-list" },
      renderLocalCacheRow(),
      renderOpenDbCacheRow()
    );
  };
}
