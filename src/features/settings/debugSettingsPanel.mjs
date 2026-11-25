export function createDebugSettingsPanel({
  react, readTracker, readTrack, readCachedLyrics, readVisualSettings, readAppVersion,
  readClientId, readPlatform, readLanguage, translate, copyText, openLink, scheduleTimeout,
  notifySuccess, notifyError,
}) {
  const { useState, useEffect, useRef } = react;

  return function DebugInfoPanel() {
    const [debugInfo, setDebugInfo] = useState(null);
    const [apiLogs, setApiLogs] = useState([]);
    const [copied, setCopied] = useState(false);
    const [showApiDetails, setShowApiDetails] = useState({});
    const apiLogIds = useRef({ nextId: 0, missingIds: new WeakMap() });

    const getApiLogId = (log) => {
      if (log.id !== null && log.id !== undefined) {
        return `debug-api-${typeof log.id}-${encodeURIComponent(String(log.id))}`;
      }
      // ApiTracker retains each entry object when updating or reordering logs.
      // Object identity keeps id-less entries independent without index keys.
      const ids = apiLogIds.current;
      if (!ids.missingIds.has(log)) {
        ids.missingIds.set(log, `debug-api-missing-${++ids.nextId}`);
      }
      return ids.missingIds.get(log);
    };

    const getApiLogDate = (log) => {
      for (const value of [log.startTime, log.timestamp, log.endTime]) {
        if (typeof value !== "number" && typeof value !== "string") continue;
        if (typeof value === "string" && !value.trim()) continue;
        const date = new Date(value);
        if (Number.isFinite(date.getTime())) return date;
      }
      return null;
    };

    const getApiSummary = () => readTracker()?.getSummary() || {
      total: apiLogs.length,
      cached: apiLogs.filter(log => log.cached || log.status === "cached").length
    };

    // 현재 트랙 정보 및 가사 정보 수집
    const collectDebugInfo = () => {
      try {
        const track = readTrack();

        if (!track) {
          return {
            error: "No track currently playing",
            timestamp: new Date().toISOString()
          };
        }

        const trackId = track.uri?.split(':')[2];
        const trackUri = track.uri;

        const cachedLyrics = readCachedLyrics(trackUri);
        const visual = readVisualSettings();

        // 번역 설정
        const translateSource = visual["translate:translated-lyrics-source"];
        const targetLang = visual["translate:target-language"];

        // 가사 상태 정보
        let lyricsInfo = null;
        if (cachedLyrics) {
          lyricsInfo = {
            provider: cachedLyrics.provider || "unknown",
            hasKaraoke: !!cachedLyrics.karaoke,
            hasSynced: !!cachedLyrics.synced,
            hasUnsynced: !!cachedLyrics.unsynced,
            karaokeLineCount: cachedLyrics.karaoke?.length || 0,
            syncedLineCount: cachedLyrics.synced?.length || 0,
            unsyncedLineCount: cachedLyrics.unsynced?.length || 0,
            copyright: cachedLyrics.copyright || null,
            error: cachedLyrics.error || null
          };
        }

        return {
          timestamp: new Date().toISOString(),
          appVersion: readAppVersion(),
          track: {
            id: trackId,
            uri: trackUri,
            title: track.name,
            artist: track.artists?.map(a => a.name).join(", ") || "Unknown",
            album: track.album?.name || "Unknown",
            duration: track.duration?.milliseconds || track.duration_ms || 0,
            isLocal: track.uri?.includes("spotify:local:")
          },
          lyrics: lyricsInfo,
          settings: {
            translateSource: translateSource || "none",
            targetLang: targetLang || "none",
            karaokeEnabled: visual["karaoke-mode-enabled"] || false,
            furiganaEnabled: visual["furigana-enabled"] || false
          },
          client: {
            clientId: readClientId() || "",
            platform: readPlatform(),
            language: visual.language || "en"
          }
        };
      } catch (e) {
        return {
          error: e.message,
          timestamp: new Date().toISOString()
        };
      }
    };

    // 컴포넌트 마운트 시 및 갱신 시 디버그 정보 수집
    useEffect(() => {
      setDebugInfo(collectDebugInfo());

      // ApiTracker에서 로그 가져오기
      const tracker = readTracker();
      if (tracker) {
        setApiLogs(tracker.getLogs());

        // 리스너 등록
        const updateLogs = (logs) => setApiLogs([...logs]);
        return tracker.addListener(updateLogs);
      }
    }, []);

    // 새로고침
    const handleRefresh = () => {
      setDebugInfo(collectDebugInfo());
      const tracker = readTracker();
      if (tracker) setApiLogs(tracker.getLogs());
      setCopied(false);
    };

    // 전체 디버그 정보 (API 로그 포함) 생성
    const getFullDebugInfo = () => {
      return {
        ...debugInfo,
        apiLogs: apiLogs.map(log => ({
          ...log,
          timestamp: getApiLogDate(log)?.toISOString() ?? null
        })),
        apiSummary: getApiSummary()
      };
    };

    // 클립보드에 복사
    const handleCopy = async () => {
      if (!debugInfo) return;

      const fullDebug = getFullDebugInfo();
      const debugText = JSON.stringify(fullDebug, null, 2);

      try {
        await copyText(debugText);
        setCopied(true);
        notifySuccess(translate("settingsAdvanced.debugTab.copied"));

        // 3초 후 copied 상태 리셋
        scheduleTimeout(() => setCopied(false), 3000);
      } catch (e) {
        notifyError(translate("settingsAdvanced.debugTab.copyFailed"));
      }
    };

    // Discord로 보내기 (클립보드 복사 후 Discord 링크 열기)
    const handleSendToDiscord = async () => {
      await handleCopy();
      openLink("https://ivlis.kr/ivLyrics/discord.php", "_blank");
    };

    // API 로그 항목 토글
    const toggleApiDetail = (logId) => {
      setShowApiDetails(prev => ({ ...prev, [logId]: !prev[logId] }));
    };

    // 카테고리별 색상
    const getCategoryColor = (category) => {
      const colors = {
        lyrics: '#cbd5e1',
        metadata: '#a78bfa',
        translation: '#4ade80',
        phonetic: '#f472b6',
        youtube: '#ef4444',
        sync: '#fbbf24'
      };
      return colors[category] || '#888';
    };

    // 상태 색상
    const getStatusColor = (status) => {
      if (status === 'success') return '#4ade80';
      if (status === 'error') return '#ef4444';
      if (status === 'pending') return '#fbbf24';
      return 'var(--text-3, #888)';
    };

    if (!debugInfo) {
      return react.createElement(
        "div",
        {
          className: "info-card debug-info-panel debug-info-panel-loading",
        },
        translate("settingsAdvanced.debugTab.loading")
      );
    }

    const renderDebugHeader = () =>
      // 헤더 (새로고침 버튼 포함)
      react.createElement(
        "div",
        { className: "debug-info-header" },
        react.createElement(
          "div",
          null,
          react.createElement("h3", {
            className: "debug-info-title"
          }, translate("settingsAdvanced.debugTab.currentTrack")),
          react.createElement("p", {
            className: "debug-info-timestamp"
          }, debugInfo.timestamp)
        ),
        react.createElement(
          "button",
          {
            onClick: handleRefresh,
            className: "btn debug-action-btn",
          },
          react.createElement("svg", {
            width: 14,
            height: 14,
            viewBox: "0 0 16 16",
            fill: "currentColor",
            dangerouslySetInnerHTML: {
              __html: '<path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>'
            }
          }),
          translate("settingsAdvanced.debugTab.refresh")
        )
      );

    const renderDebugTrackInfo = () =>
      // 트랙 정보
      debugInfo.track && react.createElement(
        "div",
        { className: "debug-info-section" },
        react.createElement("div", {
          className: "debug-info-section-label"
        }, translate("settingsAdvanced.debugTab.trackInfo")),
        react.createElement("div", {
          className: "debug-info-block"
        },
          react.createElement("div", null,
            react.createElement("span", { className: "debug-info-key" }, "Title: "),
            react.createElement("span", { className: "debug-info-value" }, debugInfo.track.title)
          ),
          react.createElement("div", null,
            react.createElement("span", { className: "debug-info-key" }, "Artist: "),
            react.createElement("span", { className: "debug-info-value" }, debugInfo.track.artist)
          ),
          react.createElement("div", null,
            react.createElement("span", { className: "debug-info-key" }, "Album: "),
            react.createElement("span", { className: "debug-info-value" }, debugInfo.track.album)
          ),
          react.createElement("div", null,
            react.createElement("span", { className: "debug-info-key" }, "Track ID: "),
            react.createElement("code", {
              className: "debug-info-code"
            }, debugInfo.track.id)
          )
        )
      );

    const renderDebugApiLogs = () => {
      const summary = getApiSummary();
      const statusLabels = {
        success: translate("settingsAdvanced.debugTab.apiLogs.status.success"),
        error: translate("settingsAdvanced.debugTab.apiLogs.status.error"),
        pending: translate("settingsAdvanced.debugTab.apiLogs.status.pending"),
        cached: translate("settingsAdvanced.debugTab.apiLogs.status.cached")
      };
      // API 요청 로그 섹션
      return react.createElement(
        "div",
        { className: "debug-info-section" },
        react.createElement("div", {
          className: "debug-info-section-label debug-info-section-label-row"
        },
          react.createElement("span", null, translate("settingsAdvanced.debugTab.apiLogs.title", { count: apiLogs.length })),
          react.createElement("span", { className: "debug-info-inline-meta" },
            translate("settingsAdvanced.debugTab.apiLogs.summary", { total: summary.total, cached: summary.cached })
          )
        ),
        react.createElement("div", {
          className: "debug-api-list"
        },
          apiLogs.length === 0
            ? react.createElement("div", {
              className: "debug-api-empty"
            }, translate("settingsAdvanced.debugTab.apiLogs.empty"))
            : apiLogs.map((log, idx) => {
              const logId = getApiLogId(log);
              const expanded = !!showApiDetails[logId];
              const date = getApiLogDate(log);
              const status = log.status === "error" || log.error ? "error"
                : log.cached || log.status === "cached" ? "cached"
                  : log.status === "success" ? "success" : "pending";
              return react.createElement(
                "div",
                {
                  key: logId,
                  className: "debug-api-item",
                  style: {
                    marginBottom: idx < apiLogs.length - 1 ? "8px" : 0,
                    borderLeft: `2px solid ${getCategoryColor(log.category)}`
                  }
                },
                // 로그 헤더 (클릭 가능)
                react.createElement(
                  "button",
                  {
                    type: "button",
                    id: `${logId}-header`,
                    "aria-expanded": expanded,
                    "aria-controls": `${logId}-details`,
                    "aria-describedby": `${logId}-endpoint`,
                    onClick: () => toggleApiDetail(logId),
                    className: "debug-api-header"
                  },
                  react.createElement("span", { className: "debug-api-header-left" },
                    // 카테고리 뱃지
                    react.createElement("span", {
                      className: "debug-api-category",
                      style: {
                        background: getCategoryColor(log.category),
                        color: "#0f172a",
                      }
                    }, log.category),
                    // 상태 표시
                    react.createElement("span", {
                      className: "debug-api-status",
                      style: { color: getStatusColor(status) }
                    }, statusLabels[status]),
                    // 소요 시간
                    Number.isFinite(log.duration) && log.duration >= 0 ? react.createElement("span", {
                      className: "debug-api-duration"
                    }, `${log.duration}ms`) : null
                  ),
                  // 타임스탬프
                  react.createElement("span", {
                    className: "debug-api-timestamp"
                  }, date ? date.toLocaleTimeString(readLanguage())
                    : translate("settingsAdvanced.debugTab.apiLogs.unknownTime"))
                ),
                // 엔드포인트 URL (축약)
                react.createElement("div", {
                  id: `${logId}-endpoint`,
                  title: log.endpoint,
                  className: "debug-api-endpoint"
                }, log.endpoint?.replace(/https?:\/\/[^/]+/, '') || '-'),
                // 상세 정보 (토글)
                react.createElement(
                  "div",
                  {
                    id: `${logId}-details`,
                    className: "debug-api-details",
                    role: "region",
                    "aria-labelledby": `${logId}-header`,
                    hidden: !expanded
                  },
                  // 요청 정보
                  expanded && log.request != null && react.createElement("div", { className: "debug-api-detail-group" },
                    react.createElement("div", {
                      className: "debug-json-label"
                    }, translate("settingsAdvanced.debugTab.apiLogs.request")),
                    react.createElement("pre", {
                      className: "debug-json-block"
                    }, JSON.stringify(log.request, null, 2))
                  ),
                  // 응답 정보
                  expanded && log.response != null && react.createElement("div", { className: "debug-api-detail-group" },
                    react.createElement("div", {
                      className: "debug-json-label"
                    }, translate("settingsAdvanced.debugTab.apiLogs.response")),
                    react.createElement("pre", {
                      className: "debug-json-block"
                    }, JSON.stringify(log.response, null, 2))
                  ),
                  expanded && log.error != null && react.createElement("div", { className: "debug-api-detail-group" },
                    react.createElement("div", {
                      className: "debug-json-label"
                    }, translate("settingsAdvanced.debugTab.apiLogs.error")),
                    react.createElement("pre", {
                      className: "debug-json-block error"
                    }, typeof log.error === "string" ? log.error : JSON.stringify(log.error, null, 2))
                  )
                )
              );
            })
        )
      );
    };

    const renderDebugLyricsInfo = () =>
      // 가사 정보
      react.createElement(
        "div",
        { className: "debug-info-section" },
        react.createElement("div", {
          className: "debug-info-section-label"
        }, translate("settingsAdvanced.debugTab.lyricsInfo")),
        react.createElement("div", {
          className: "debug-info-block"
        },
          debugInfo.lyrics ? react.createElement(
            react.Fragment,
            null,
            react.createElement("div", null,
              react.createElement("span", { className: "debug-info-key" }, "Provider: "),
              react.createElement("span", {
                className: "debug-info-tag",
                style: {
                  color: "#4ade80",
                  background: "rgba(74, 222, 128, 0.12)",
                }
              }, debugInfo.lyrics.provider)
            ),
            react.createElement("div", { style: { marginTop: "8px" } },
              react.createElement("span", { className: "debug-info-key" }, "Type: "),
              debugInfo.lyrics.hasKaraoke && react.createElement("span", {
                style: { color: "#f472b6", marginRight: "8px" }
              }, `Karaoke (${debugInfo.lyrics.karaokeLineCount} lines)`),
              debugInfo.lyrics.hasSynced && react.createElement("span", {
                style: { color: "#cbd5e1", marginRight: "8px" }
              }, `Synced (${debugInfo.lyrics.syncedLineCount} lines)`),
              debugInfo.lyrics.hasUnsynced && react.createElement("span", {
                style: { color: "#fbbf24" }
              }, `Unsynced (${debugInfo.lyrics.unsyncedLineCount} lines)`)
            ),
            debugInfo.lyrics.error && react.createElement("div", { style: { marginTop: "8px" } },
              react.createElement("span", { className: "debug-info-key" }, "Error: "),
              react.createElement("span", { style: { color: "#ef4444" } }, debugInfo.lyrics.error)
            )
          ) : react.createElement("span", { className: "debug-info-empty" }, translate("settingsAdvanced.debugTab.noLyrics"))
        )
      );

    const renderDebugActions = () =>
      // 복사 버튼들
      react.createElement(
        "div",
        { className: "debug-info-actions" },
        react.createElement(
          "button",
          {
            onClick: handleCopy,
            type: "button",
            className: `btn debug-action-btn${copied ? " is-copied" : ""}`,
          },
          react.createElement("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 16 16",
            fill: "currentColor",
            dangerouslySetInnerHTML: {
              __html: copied
                ? '<path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>'
                : '<path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/>'
            }
          }),
          copied ? translate("settingsAdvanced.debugTab.copied") : translate("settingsAdvanced.debugTab.copyToClipboard")
        ),
        react.createElement(
          "button",
          {
            onClick: handleSendToDiscord,
            type: "button",
            className: "btn btn-primary debug-action-btn",
          },
          react.createElement("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 24 24",
            fill: "currentColor",
            dangerouslySetInnerHTML: {
              __html: '<path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.2 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.05-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z"/>'
            }
          }),
          translate("settingsAdvanced.debugTab.sendToDiscord")
        )
      );

    return react.createElement(
      "div",
      {
        className: "info-card debug-info-panel",
      },
      // 헤더 (새로고침 버튼 포함)
      renderDebugHeader(),
      // 트랙 정보
      renderDebugTrackInfo(),
      // API 요청 로그 섹션
      renderDebugApiLogs(),
      // 가사 정보
      renderDebugLyricsInfo(),
      // 복사 버튼들
      renderDebugActions()
    );
  };
}
