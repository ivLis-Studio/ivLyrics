const ButtonSVG = react.memo(
  ({ icon, active = true, onClick }) => {
    return react.createElement(
      "button",
      {
        className: `switch-checkbox${active ? " active" : ""}`,
        onClick,
        "aria-checked": active,
        role: "checkbox",
      },
      react.createElement("svg", {
        width: 12,
        height: 12,
        viewBox: "0 0 16 16",
        fill: "currentColor",
        dangerouslySetInnerHTML: {
          __html: icon,
        },
      })
    );
  },
  (prevProps, nextProps) => {
    // active 상태가 변경되면 리렌더링 필요
    return prevProps.active === nextProps.active;
  }
);

const SwapButton = ({ icon, disabled, onClick }) => {
  return react.createElement(
    "button",
    {
      className: "swap-button",
      onClick,
      disabled,
    },
    react.createElement("svg", {
      width: 12,
      height: 12,
      viewBox: "0 0 16 16",
      fill: "currentColor",
      dangerouslySetInnerHTML: {
        __html: icon,
      },
    })
  );
};



// 데스크탑 오버레이 설정 컴포넌트
const OverlaySettings = () => {
  const [enabled, setEnabled] = useState(window.OverlaySender?.enabled ?? false);
  const [isConnected, setIsConnected] = useState(window.OverlaySender?.isConnected ?? false);
  const [checking, setChecking] = useState(false);
  const [port, setPort] = useState(window.OverlaySender?.port ?? 15000);
  const [portInput, setPortInput] = useState(String(window.OverlaySender?.port ?? 15000));

  // 연결 상태 이벤트 리스너
  useEffect(() => {
    const handleConnection = (e) => {
      setIsConnected(e.detail.connected);
    };
    window.addEventListener('ivLyrics:overlay-connection', handleConnection);

    // 초기 연결 상태 확인
    if (window.OverlaySender) {
      setIsConnected(window.OverlaySender.isConnected);
      setPort(window.OverlaySender.port);
      setPortInput(String(window.OverlaySender.port));
      // 설정창 열림 알림 (폴링 모드 활성화)
      window.OverlaySender.setSettingsOpen?.(true);
    }

    return () => {
      window.removeEventListener('ivLyrics:overlay-connection', handleConnection);
      // 설정창 닫힘 알림
      window.OverlaySender?.setSettingsOpen?.(false);
    };
  }, []);

  // 토글 핸들러
  const handleToggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    if (window.OverlaySender) {
      window.OverlaySender.enabled = newValue;
    }
  };

  // 포트 변경 핸들러
  const handlePortChange = (e) => {
    setPortInput(e.target.value);
  };

  // 포트 저장 핸들러
  const handlePortSave = () => {
    const newPort = parseInt(portInput, 10);
    if (newPort >= 1024 && newPort <= 65535) {
      setPort(newPort);
      if (window.OverlaySender) {
        window.OverlaySender.port = newPort;
      }
      Toast?.success?.(I18n.t("overlay.portSaved"));
    } else {
      setPortInput(String(port));
      Toast?.error?.(I18n.t("overlay.portInvalid"));
    }
  };

  // 연결 확인
  const handleCheckConnection = async () => {
    if (!window.OverlaySender) return;
    setChecking(true);
    await window.OverlaySender.checkConnection();
    setIsConnected(window.OverlaySender.isConnected);
    setChecking(false);
  };

  // 앱 열기
  const handleOpenApp = () => {
    window.OverlaySender?.openOverlayApp?.();
  };

  // 다운로드 URL
  const handleDownload = () => {
    const url = window.OverlaySender?.getDownloadUrl?.() || 'https://ivlis.kr/ivLyrics/extensions/#overlay';
    window.open(url, '_blank');
  };

  // 상태 텍스트
  const getStatusText = () => {
    if (checking) return I18n.t("overlay.status.checking");
    if (isConnected) return I18n.t("overlay.status.connected");
    return I18n.t("overlay.status.disconnected");
  };

  const getStatusColor = () => {
    if (checking) return "#fbbf24";
    if (isConnected) return "#4ade80";
    return "#ef4444";
  };

  return react.createElement(
    "div",
    { className: "option-list-wrapper" },
    // Enable/Disable Row
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
            I18n.t("overlay.enabled.label"),
            // Status Tag (Connected / Disconnected / Checking) only when enabled
            enabled && react.createElement("span", {
              style: {
                marginLeft: "10px",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "12px",
                backgroundColor: isConnected ? "rgba(74, 222, 128, 0.2)" : "rgba(239, 68, 68, 0.2)",
                color: isConnected ? "#4ade80" : "#ef4444",
                border: `1px solid ${isConnected ? "rgba(74, 222, 128, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                fontWeight: "600",
                verticalAlign: "middle"
              }
            }, getStatusText())
          ),
          react.createElement("div", { className: "setting-description" },
            I18n.t("overlay.enabled.desc")
          )
        ),
        react.createElement(
          "div",
          { className: "setting-row-right", style: { display: "flex", alignItems: "center", gap: "10px" } },
          // Download Button (Only if enabled AND disconnected)
          enabled && !isConnected && react.createElement(
            "button",
            {
              className: "btn",
              onClick: handleDownload,
              style: { fontSize: "11px", padding: "4px 8px", height: "auto" }
            },
            I18n.t("overlay.download")
          ),
          // Toggle Switch
          react.createElement(
            "button",
            {
              className: `switch-checkbox${enabled ? " active" : ""}`,
              onClick: handleToggle,
              "aria-checked": enabled,
              role: "checkbox",
            },
            react.createElement("svg", {
              width: 12,
              height: 12,
              viewBox: "0 0 16 16",
              fill: "currentColor",
              dangerouslySetInnerHTML: {
                __html: enabled
                  ? '<path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>'
                  : '<path fill-rule="evenodd" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>',
              },
            })
          )
        )
      )
    ),
    // Port Setting Row (Only shown when enabled)
    enabled && react.createElement(
      "div",
      { className: "setting-row" },
      react.createElement(
        "div",
        { className: "setting-row-content" },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement("div", { className: "setting-name" },
            I18n.t("overlay.port.label")
          ),
          react.createElement("div", { className: "setting-description" },
            I18n.t("overlay.port.desc")
          )
        ),
        react.createElement(
          "div",
          { className: "setting-row-right", style: { display: "flex", alignItems: "center", gap: "8px" } },
          react.createElement("input", {
            type: "number",
            value: portInput,
            onChange: handlePortChange,
            onBlur: handlePortSave,
            onKeyDown: (e) => { if (e.key === 'Enter') handlePortSave(); },
            min: 1024,
            max: 65535,
            style: {
              width: "80px",
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: "rgba(0,0,0,0.2)",
              color: "var(--spice-text)",
              fontSize: "13px",
              textAlign: "center",
              fontFamily: "monospace"
            }
          })
        )
      )
    )
  );
};

// 로컬 캐시 관리 컴포넌트 (IndexedDB)
const LocalCacheManager = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // 캐시 통계 로드
  const loadStats = async () => {
    try {
      const cacheStats = await LyricsCache.getStats();
      setStats(cacheStats);
    } catch (e) {
      console.error('[LocalCacheManager] Failed to load stats:', e);
      setStats(null);
    }
    setLoading(false);
  };

  // 컴포넌트 마운트 시 통계 로드
  useEffect(() => {
    loadStats();
  }, []);

  // 전체 캐시 삭제
  const handleClearAll = async () => {
    try {
      // 메모리 캐시도 함께 초기화
      window.Translator.clearAllMemoryCache();
      window.Translator.clearAllInflightRequests();

      // CacheManager (Gemini 번역 메모리 캐시)도 함께 초기화
      if (typeof CacheManager !== 'undefined' && CacheManager.clear) {
        CacheManager.clear();
      }

      await LyricsCache.clearAll();
      await loadStats();

      // 캐시는 이미 지웠으므로 clearCache=false로 호출
      reloadLyrics?.(false);
      Toast.success(I18n.t("notifications.localCacheCleared"));
    } catch (e) {
      console.error('[LocalCacheManager] Clear all failed:', e);
    }
  };

  // 현재 곡 캐시 삭제
  const handleClearCurrent = async () => {
    const trackUri = Spicetify.Player.data?.item?.uri;
    const trackId = trackUri?.split(':')[2];
    if (!trackId) {
      Toast.error(I18n.t("notifications.noTrackPlaying"));
      return;
    }

    try {
      // 번역 메모리 캐시도 함께 초기화
      window.Translator.clearMemoryCache(trackId);
      window.Translator.clearInflightRequests(trackId);

      // CacheManager (Gemini 번역 메모리 캐시)도 함께 초기화
      if (typeof CacheManager !== 'undefined' && CacheManager.clearByUri) {
        CacheManager.clearByUri(trackUri);
      }

      await LyricsCache.clearTrack(trackId);
      await loadStats();

      // 캐시는 이미 지웠으므로 clearCache=false로 호출
      reloadLyrics?.(false);
      Toast.success(I18n.t("notifications.localCacheTrackCleared"));
    } catch (e) {
      console.error('[LocalCacheManager] Clear track failed:', e);
    }
  };

  // 통계 문자열 생성
  const getStatsText = () => {
    if (loading) return "Loading...";
    if (!stats) return "Cache not available";

    return I18n.t("settingsAdvanced.cacheManagement.localCache.stats")
      .replace("{lyrics}", stats.lyrics || 0)
      .replace("{translations}", stats.translations || 0)
      .replace("{metadata}", stats.metadata || 0);
  };

  const totalCount = stats ? (stats.lyrics || 0) + (stats.translations || 0) + (stats.metadata || 0) + (stats.youtube || 0) : 0;

  return react.createElement(
    "div",
    { className: "setting-row" },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" },
          I18n.t("settingsAdvanced.cacheManagement.localCache.label")
        ),
        react.createElement("div", { className: "setting-description" },
          I18n.t("settingsAdvanced.cacheManagement.localCache.desc")
        ),
        react.createElement("div", {
          className: "setting-description",
          style: { marginTop: "4px", opacity: 0.7 }
        }, getStatsText())
      ),
      react.createElement(
        "div",
        { className: "setting-row-right", style: { display: "flex", gap: "8px" } },
        react.createElement(
          "button",
          {
            className: "btn",
            onClick: handleClearCurrent,
          },
          I18n.t("settingsAdvanced.cacheManagement.localCache.clearCurrent")
        ),
        react.createElement(
          "button",
          {
            className: "btn",
            onClick: handleClearAll,
            disabled: totalCount === 0,
          },
          I18n.t("settingsAdvanced.cacheManagement.localCache.clearAll")
        )
      )
    )
  );
};

// 디버그 정보 패널 컴포넌트
const DebugInfoPanel = () => {
  const [debugInfo, setDebugInfo] = useState(null);
  const [apiLogs, setApiLogs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showApiDetails, setShowApiDetails] = useState({});

  // 현재 트랙 정보 및 가사 정보 수집
  const collectDebugInfo = () => {
    try {
      const playerData = Spicetify.Player.data;
      const track = playerData?.item;

      if (!track) {
        return {
          error: "No track currently playing",
          timestamp: new Date().toISOString()
        };
      }

      const trackId = track.uri?.split(':')[2];
      const trackUri = track.uri;

      // CACHE에서 가사 정보 가져오기
      const cachedLyrics = window.CACHE?.[trackUri];

      // CONFIG 정보
      const providersOrder = CONFIG.providersOrder || [];
      const enabledProviders = providersOrder.filter(p => CONFIG.providers[p]?.on);

      // 번역 설정
      const translateSource = CONFIG.visual["translate:translated-lyrics-source"];
      const targetLang = CONFIG.visual["translate:target-language"];

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
        appVersion: Utils.currentVersion,
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
          providersOrder: providersOrder,
          enabledProviders: enabledProviders,
          translateSource: translateSource || "none",
          targetLang: targetLang || "none",
          karaokeEnabled: CONFIG.visual["karaoke-mode-enabled"] || false,
          furiganaEnabled: CONFIG.visual["furigana-enabled"] || false
        },
        client: {
          clientId: StorageManager.getClientId(),
          platform: Utils.detectPlatform(),
          language: CONFIG.visual["language"] || "en"
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
    if (window.ApiTracker) {
      setApiLogs(window.ApiTracker.getLogs());

      // 리스너 등록
      const updateLogs = (logs) => setApiLogs([...logs]);
      window.ApiTracker.addListener(updateLogs);

      return () => {
        // 리스너 제거 (ApiTracker에 removeListener가 있다면)
        const listenerIndex = window.ApiTracker._listeners?.indexOf(updateLogs);
        if (listenerIndex > -1) {
          window.ApiTracker._listeners.splice(listenerIndex, 1);
        }
      };
    }
  }, []);

  // 새로고침
  const handleRefresh = () => {
    setDebugInfo(collectDebugInfo());
    if (window.ApiTracker) {
      setApiLogs(window.ApiTracker.getLogs());
    }
    setCopied(false);
  };

  // 전체 디버그 정보 (API 로그 포함) 생성
  const getFullDebugInfo = () => {
    const summary = window.ApiTracker?.getSummary() || {};
    return {
      ...debugInfo,
      apiLogs: apiLogs.map(log => ({
        category: log.category,
        endpoint: log.endpoint,
        request: log.request,
        response: log.response,
        status: log.status,
        error: log.error,
        duration: log.duration,
        cached: log.cached,
        timestamp: log.timestamp
      })),
      apiSummary: summary
    };
  };

  // 클립보드에 복사
  const handleCopy = async () => {
    if (!debugInfo) return;

    const fullDebug = getFullDebugInfo();
    const debugText = JSON.stringify(fullDebug, null, 2);

    try {
      await navigator.clipboard.writeText(debugText);
      setCopied(true);
      Toast.success(I18n.t("settingsAdvanced.debugTab.copied"));

      // 3초 후 copied 상태 리셋
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      Toast.error(I18n.t("settingsAdvanced.debugTab.copyFailed"));
    }
  };

  // Discord로 보내기 (클립보드 복사 후 Discord 링크 열기)
  const handleSendToDiscord = async () => {
    await handleCopy();
    window.open("https://ivlis.kr/ivLyrics/discord.php", "_blank");
  };

  // API 로그 항목 토글
  const toggleApiDetail = (logId) => {
    setShowApiDetails(prev => ({ ...prev, [logId]: !prev[logId] }));
  };

  // 카테고리별 색상
  const getCategoryColor = (category) => {
    const colors = {
      lyrics: '#60a5fa',
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
    return '#888';
  };

  if (!debugInfo) {
    return react.createElement(
      "div",
      {
        className: "info-card",
        style: {
          padding: "20px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "0 0 12px 12px",
          textAlign: "center",
          color: "rgba(255,255,255,0.5)"
        }
      },
      I18n.t("settingsAdvanced.debugTab.loading")
    );
  }

  return react.createElement(
    "div",
    {
      className: "info-card",
      style: {
        padding: "20px",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "0 0 12px 12px",
        backdropFilter: "blur(30px) saturate(150%)",
        WebkitBackdropFilter: "blur(30px) saturate(150%)",
        marginBottom: "24px"
      }
    },
    // 헤더 (새로고침 버튼 포함)
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.1)"
        }
      },
      react.createElement(
        "div",
        null,
        react.createElement("h3", {
          style: { margin: "0 0 4px", fontSize: "16px", color: "#ffffff", fontWeight: "600" }
        }, I18n.t("settingsAdvanced.debugTab.currentTrack")),
        react.createElement("p", {
          style: { margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.5)" }
        }, debugInfo.timestamp)
      ),
      react.createElement(
        "button",
        {
          onClick: handleRefresh,
          style: {
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "rgba(255, 255, 255, 0.9)",
            padding: "8px 14px",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }
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
        I18n.t("settingsAdvanced.debugTab.refresh")
      )
    ),
    // 트랙 정보
    debugInfo.track && react.createElement(
      "div",
      { style: { marginBottom: "16px" } },
      react.createElement("div", {
        style: { fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }
      }, I18n.t("settingsAdvanced.debugTab.trackInfo")),
      react.createElement("div", {
        style: {
          background: "rgba(0,0,0,0.25)",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "13px",
          lineHeight: "1.6"
        }
      },
        react.createElement("div", null,
          react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, "Title: "),
          react.createElement("span", { style: { color: "#fff" } }, debugInfo.track.title)
        ),
        react.createElement("div", null,
          react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, "Artist: "),
          react.createElement("span", { style: { color: "#fff" } }, debugInfo.track.artist)
        ),
        react.createElement("div", null,
          react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, "Album: "),
          react.createElement("span", { style: { color: "#fff" } }, debugInfo.track.album)
        ),
        react.createElement("div", null,
          react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, "Track ID: "),
          react.createElement("code", {
            style: { color: "#fbbf24", fontFamily: "monospace", fontSize: "12px" }
          }, debugInfo.track.id)
        )
      )
    ),
    // API 요청 로그 섹션
    react.createElement(
      "div",
      { style: { marginBottom: "16px" } },
      react.createElement("div", {
        style: {
          fontSize: "11px",
          color: "rgba(255,255,255,0.4)",
          marginBottom: "6px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }
      },
        react.createElement("span", null, `API 요청 로그 (${apiLogs.length})`),
        window.ApiTracker && react.createElement("span", { style: { color: "rgba(255,255,255,0.3)" } },
          `Total: ${window.ApiTracker.getSummary()?.totalRequests || 0} requests`
        )
      ),
      react.createElement("div", {
        style: {
          background: "rgba(0,0,0,0.25)",
          borderRadius: "8px",
          padding: "8px",
          maxHeight: "300px",
          overflowY: "auto"
        }
      },
        apiLogs.length === 0
          ? react.createElement("div", {
            style: { textAlign: "center", padding: "20px", color: "rgba(255,255,255,0.4)" }
          }, "아직 API 요청이 없습니다. 곡을 재생하면 여기에 표시됩니다.")
          : apiLogs.map((log, idx) => react.createElement(
            "div",
            {
              key: log.id || idx,
              style: {
                background: "rgba(0,0,0,0.3)",
                borderRadius: "6px",
                padding: "10px",
                marginBottom: idx < apiLogs.length - 1 ? "8px" : 0,
                borderLeft: `3px solid ${getCategoryColor(log.category)}`
              }
            },
            // 로그 헤더 (클릭 가능)
            react.createElement(
              "div",
              {
                onClick: () => toggleApiDetail(log.id),
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer"
                }
              },
              react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                // 카테고리 뱃지
                react.createElement("span", {
                  style: {
                    background: getCategoryColor(log.category),
                    color: "#000",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: "700",
                    textTransform: "uppercase"
                  }
                }, log.category),
                // 상태 표시
                react.createElement("span", {
                  style: {
                    color: getStatusColor(log.status),
                    fontSize: "11px",
                    fontWeight: "600"
                  }
                }, log.cached ? "📦 CACHED" : log.status?.toUpperCase() || "PENDING"),
                // 소요 시간
                log.duration && react.createElement("span", {
                  style: { color: "rgba(255,255,255,0.4)", fontSize: "11px" }
                }, `${log.duration}ms`)
              ),
              // 타임스탬프
              react.createElement("span", {
                style: { color: "rgba(255,255,255,0.3)", fontSize: "10px" }
              }, new Date(log.timestamp).toLocaleTimeString())
            ),
            // 엔드포인트 URL (축약)
            react.createElement("div", {
              style: {
                fontSize: "11px",
                color: "rgba(255,255,255,0.6)",
                marginTop: "6px",
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }
            }, log.endpoint?.replace(/https?:\/\/[^\/]+/, '') || '-'),
            // 상세 정보 (토글)
            showApiDetails[log.id] && react.createElement(
              "div",
              { style: { marginTop: "10px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "10px" } },
              // 요청 정보
              log.request && react.createElement("div", { style: { marginBottom: "8px" } },
                react.createElement("div", {
                  style: { fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }
                }, "REQUEST:"),
                react.createElement("pre", {
                  style: {
                    background: "rgba(0,0,0,0.4)",
                    padding: "8px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.7)",
                    margin: 0,
                    overflow: "auto",
                    maxHeight: "100px"
                  }
                }, JSON.stringify(log.request, null, 2))
              ),
              // 응답 정보
              log.response && react.createElement("div", null,
                react.createElement("div", {
                  style: { fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }
                }, "RESPONSE:"),
                react.createElement("pre", {
                  style: {
                    background: "rgba(0,0,0,0.4)",
                    padding: "8px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontFamily: "monospace",
                    color: log.status === 'error' ? "#ef4444" : "rgba(255,255,255,0.7)",
                    margin: 0,
                    overflow: "auto",
                    maxHeight: "100px"
                  }
                }, log.error || JSON.stringify(log.response, null, 2))
              )
            )
          ))
      )
    ),
    // 가사 정보
    react.createElement(
      "div",
      { style: { marginBottom: "16px" } },
      react.createElement("div", {
        style: { fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }
      }, I18n.t("settingsAdvanced.debugTab.lyricsInfo")),
      react.createElement("div", {
        style: {
          background: "rgba(0,0,0,0.25)",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "13px",
          lineHeight: "1.6"
        }
      },
        debugInfo.lyrics ? react.createElement(
          react.Fragment,
          null,
          react.createElement("div", null,
            react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, "Provider: "),
            react.createElement("span", {
              style: {
                color: "#4ade80",
                fontWeight: "600",
                padding: "2px 8px",
                background: "rgba(74, 222, 128, 0.15)",
                borderRadius: "4px"
              }
            }, debugInfo.lyrics.provider)
          ),
          react.createElement("div", { style: { marginTop: "8px" } },
            react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, "Type: "),
            debugInfo.lyrics.hasKaraoke && react.createElement("span", {
              style: { color: "#f472b6", marginRight: "8px" }
            }, `Karaoke (${debugInfo.lyrics.karaokeLineCount} lines)`),
            debugInfo.lyrics.hasSynced && react.createElement("span", {
              style: { color: "#60a5fa", marginRight: "8px" }
            }, `Synced (${debugInfo.lyrics.syncedLineCount} lines)`),
            debugInfo.lyrics.hasUnsynced && react.createElement("span", {
              style: { color: "#fbbf24" }
            }, `Unsynced (${debugInfo.lyrics.unsyncedLineCount} lines)`)
          ),
          debugInfo.lyrics.error && react.createElement("div", { style: { marginTop: "8px" } },
            react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, "Error: "),
            react.createElement("span", { style: { color: "#ef4444" } }, debugInfo.lyrics.error)
          )
        ) : react.createElement("span", { style: { color: "rgba(255,255,255,0.5)" } }, I18n.t("settingsAdvanced.debugTab.noLyrics"))
      )
    ),
    // 복사 버튼들
    react.createElement(
      "div",
      { style: { display: "flex", gap: "8px", marginTop: "16px" } },
      react.createElement(
        "button",
        {
          onClick: handleCopy,
          style: {
            flex: 1,
            background: copied ? "rgba(74, 222, 128, 0.15)" : "rgba(255, 255, 255, 0.08)",
            border: copied ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid rgba(255, 255, 255, 0.15)",
            color: copied ? "#4ade80" : "rgba(255, 255, 255, 0.9)",
            padding: "12px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s ease"
          }
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
        copied ? I18n.t("settingsAdvanced.debugTab.copied") : I18n.t("settingsAdvanced.debugTab.copyToClipboard")
      ),
      react.createElement(
        "button",
        {
          onClick: handleSendToDiscord,
          style: {
            flex: 1,
            background: "#5865F2",
            border: "none",
            color: "#ffffff",
            padding: "12px 16px",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px"
          }
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
        I18n.t("settingsAdvanced.debugTab.sendToDiscord")
      )
    )
  );
};

const ConfigButton = ({ name, settingKey, info, text, onChange = () => { } }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row",
    },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" }, name),
        info &&
        react.createElement("div", {
          className: "setting-description",
          dangerouslySetInnerHTML: {
            __html: info,
          },
        })
      ),
      react.createElement(
        "div",
        { className: "setting-row-right" },
        react.createElement(
          "button",
          {
            className: "btn",
            onClick: (event) => onChange(settingKey || name, event),
          },
          text
        )
      )
    )
  );
};

const ConfigSlider = react.memo(
  ({ name, defaultValue, disabled, onChange = () => { } }) => {
    const [active, setActive] = useState(defaultValue);

    useEffect(() => {
      setActive(defaultValue);
    }, [defaultValue]);

    const toggleState = useCallback(() => {
      if (disabled) return;
      setActive((prevActive) => {
        const newState = !prevActive;
        onChange(newState);
        return newState;
      });
    }, [onChange, disabled]);

    return react.createElement(ButtonSVG, {
      icon: Spicetify.SVGIcons.check,
      active,
      onClick: toggleState,
      disabled,
    });
  }
);

const ConfigSliderRange = ({
  name,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  disabled,
  onChange = () => { },
}) => {
  const [value, setValue] = useState(defaultValue);
  const sliderRef = useRef(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const updateValue = useCallback(
    (newValue) => {
      if (disabled) return;
      setValue(newValue);
      onChange(newValue);
    },
    [onChange, disabled]
  );

  const handleInput = useCallback(
    (event) => {
      const newValue = Number(event.target.value);
      updateValue(newValue);
    },
    [updateValue]
  );

  const handleChange = useCallback(
    (event) => {
      const newValue = Number(event.target.value);
      updateValue(newValue);
    },
    [updateValue]
  );

  const sliderStyle = {
    "--progress-percent": `${((value - min) / (max - min)) * 100}%`,
  };

  return react.createElement(
    "div",
    { className: `slider-container` },
    react.createElement("input", {
      ref: sliderRef,
      type: "range",
      min,
      max,
      step,
      value,
      disabled,
      onInput: handleInput,
      onChange: handleChange,
      onMouseDown: (e) => {
        if (disabled) return;
        // 마우스 다운 시 즉시 값 업데이트
        const newValue = Number(e.target.value);
        updateValue(newValue);
      },
      className: "config-slider",
      style: sliderStyle,
    }),
    react.createElement(
      "span",
      { className: "slider-value" },
      `${value}${unit}`
    )
  );
};

const ConfigColorPicker = ({ name, defaultValue, onChange = () => { } }) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const handleChange = useCallback(
    (event) => {
      const newValue = event.target.value;
      setValue(newValue);
      onChange(newValue);
    },
    [onChange]
  );

  return react.createElement(
    "div",
    { className: "color-picker-container" },
    react.createElement("input", {
      type: "color",
      value,
      onChange: handleChange,
      className: "config-color-picker",
    }),
    react.createElement("input", {
      type: "text",
      value,
      onChange: handleChange,
      className: "config-color-input",
      pattern: "^#[0-9A-Fa-f]{6}$",
      placeholder: "#000000",
    })
  );
};

const ColorPresetSelector = ({ name, defaultValue, onChange = () => { } }) => {
  const [selectedColor, setSelectedColor] = useState(defaultValue);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setSelectedColor(defaultValue);
  }, [defaultValue]);

  // 엄선된 인기 색상 (24개)
  const colorPresets = [
    { name: I18n.t("settings.colors.black"), color: "#000000" },
    { name: I18n.t("settings.colors.charcoal"), color: "#1a1a1a" },
    { name: I18n.t("settings.colors.darkSlate"), color: "#334155" },
    { name: I18n.t("settings.colors.gray"), color: "#64748b" },

    { name: I18n.t("settings.colors.darkNavy"), color: "#0f172a" },
    { name: I18n.t("settings.colors.navy"), color: "#1e3a8a" },
    { name: I18n.t("settings.colors.royalBlue"), color: "#2563eb" },
    { name: I18n.t("settings.colors.sky"), color: "#0ea5e9" },

    { name: I18n.t("settings.colors.indigo"), color: "#4f46e5" },
    { name: I18n.t("settings.colors.purple"), color: "#8b5cf6" },
    { name: I18n.t("settings.colors.fuchsia"), color: "#d946ef" },
    { name: I18n.t("settings.colors.pink"), color: "#ec4899" },

    { name: I18n.t("settings.colors.wine"), color: "#7f1d1d" },
    { name: I18n.t("settings.colors.red"), color: "#dc2626" },
    { name: I18n.t("settings.colors.orange"), color: "#f97316" },
    { name: I18n.t("settings.colors.amber"), color: "#f59e0b" },

    { name: I18n.t("settings.colors.gold"), color: "#ca8a04" },
    { name: I18n.t("settings.colors.lime"), color: "#84cc16" },
    { name: I18n.t("settings.colors.green"), color: "#22c55e" },
    { name: I18n.t("settings.colors.emerald"), color: "#10b981" },

    { name: I18n.t("settings.colors.teal"), color: "#14b8a6" },
    { name: I18n.t("settings.colors.cyan"), color: "#06b6d4" },
    { name: I18n.t("settings.colors.brown"), color: "#92400e" },
    { name: I18n.t("settings.colors.chocolate"), color: "#78350f" },
  ];

  const handleColorClick = (color) => {
    setSelectedColor(color);
    onChange(color);
  };

  // 현재 선택된 색상 찾기
  const selectedPreset = colorPresets.find((p) => p.color === selectedColor);

  return react.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "300px",
      },
    },
    // 현재 선택된 색상 표시
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 12px",
          backgroundColor: "var(--spice-button)",
          borderRadius: "8px",
          border: "1px solid var(--spice-button)",
          width: "100%",
        },
      },
      react.createElement("div", {
        style: {
          width: "32px",
          height: "32px",
          borderRadius: "6px",
          backgroundColor: selectedColor,
          border: "2px solid var(--spice-text)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          flexShrink: "0",
        },
      }),
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flex: "1",
            minWidth: "0",
            overflow: "hidden",
          },
        },
        react.createElement(
          "span",
          {
            style: {
              color: "var(--spice-text)",
              fontSize: "13px",
              fontWeight: "500",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          },
          selectedPreset ? selectedPreset.name : I18n.t("settings.colors.customColor")
        ),
        react.createElement(
          "span",
          {
            style: {
              color: "var(--spice-subtext)",
              fontSize: "11px",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            },
          },
          selectedColor.toUpperCase()
        )
      ),
      react.createElement(
        "button",
        {
          onClick: () => setShowAll(!showAll),
          style: {
            padding: "6px 12px",
            backgroundColor: "transparent",
            color: "var(--spice-text)",
            border: "1px solid var(--spice-text)",
            borderRadius: "6px",
            fontSize: "12px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            flexShrink: "0",
            whiteSpace: "nowrap",
          },
          onMouseEnter: (e) => {
            e.target.style.backgroundColor = "var(--spice-text)";
            e.target.style.color = "var(--spice-card)";
          },
          onMouseLeave: (e) => {
            e.target.style.backgroundColor = "transparent";
            e.target.style.color = "var(--spice-text)";
          },
        },
        showAll ? I18n.t("settings.colors.showLess") : I18n.t("settings.colors.showMore")
      )
    ),
    // 색상 팔레트
    showAll &&
    react.createElement(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "6px",
          padding: "12px",
          backgroundColor: "rgba(var(--spice-rgb-button), 0.3)",
          borderRadius: "8px",
          border: "1px solid var(--spice-button)",
        },
      },
      ...colorPresets.map((preset, index) =>
        react.createElement("button", {
          key: index,
          onClick: () => handleColorClick(preset.color),
          title: preset.name,
          "aria-label": preset.name,
          style: {
            width: "100%",
            aspectRatio: "1",
            borderRadius: "6px",
            backgroundColor: preset.color,
            border:
              selectedColor === preset.color
                ? "2.5px solid var(--spice-text)"
                : "1.5px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            outline: "none",
            boxShadow:
              selectedColor === preset.color
                ? "0 0 0 3px rgba(var(--spice-rgb-text), 0.2), 0 2px 4px rgba(0,0,0,0.2)"
                : "0 1px 2px rgba(0,0,0,0.1)",
          },
          onMouseEnter: (e) => {
            e.target.style.transform = "scale(1.1)";
            e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
          },
          onMouseLeave: (e) => {
            e.target.style.transform = "scale(1)";
            e.target.style.boxShadow =
              selectedColor === preset.color
                ? "0 0 0 3px rgba(var(--spice-rgb-text), 0.2), 0 2px 4px rgba(0,0,0,0.2)"
                : "0 1px 2px rgba(0,0,0,0.1)";
          },
        })
      )
    )
  );
};

const ConfigWarning = ({ message }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row",
      style: {
        backgroundColor: "rgba(var(--spice-rgb-warning), 0.25)",
      },
    },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement(
          "div",
          {
            className: "setting-name",
            style: { color: "var(--spice-text)", fontWeight: "600" },
          },
          I18n.t("settings.solidBackgroundInUse")
        ),
        react.createElement(
          "div",
          {
            className: "setting-description",
            style: { color: "var(--spice-subtext)" },
          },
          message
        )
      )
    )
  );
};

// 정보 표시용 컴포넌트 (헬퍼 프로그램 안내 등)
const ConfigInfo = ({ message, buttonText, onButtonClick }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row",
      style: {
        backgroundColor: "rgba(var(--spice-rgb-accent), 0.1)",
        borderLeft: "3px solid var(--spice-accent)",
      },
    },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement(
          "div",
          {
            className: "setting-description",
            style: {
              color: "var(--spice-text)",
              whiteSpace: "pre-line",
              lineHeight: "1.5",
            },
          },
          message
        )
      ),
      // 버튼이 있으면 표시
      buttonText && onButtonClick && react.createElement(
        "div",
        { className: "setting-row-right" },
        react.createElement(
          "button",
          {
            className: "btn",
            onClick: onButtonClick,
            style: { fontSize: "12px" }
          },
          buttonText
        )
      )
    )
  );
};

// 비디오 헬퍼 토글 컴포넌트 (연결 상태 표시 포함)
const VideoHelperToggle = ({ name, defaultValue, disabled, onChange = () => { } }) => {
  const [enabled, setEnabled] = useState(defaultValue === "true" || defaultValue === true);
  const [isConnected, setIsConnected] = useState(false);
  const [checking, setChecking] = useState(false);

  // 초기 연결 상태 확인 및 설정창 열려있는 동안 주기적 체크
  useEffect(() => {
    let isMounted = true;

    const checkConnection = async () => {
      if (!isMounted) return;
      if (typeof VideoHelperService === "undefined") return;

      // 설정 탭이 보이는지 확인 (visibility check)
      const settingsTab = document.querySelector('#ivLyrics-config-container') || document.querySelector('#ivLyrics-settings-overlay');
      if (!settingsTab) return;

      setChecking(true);
      const connected = await VideoHelperService.checkHealth();
      if (isMounted) {
        setIsConnected(connected);
        setChecking(false);
      }
    };

    // 활성화 시 즉시 체크
    if (enabled) {
      checkConnection();
    }

    // 설정창 열려있는 동안 주기적 연결 확인 (5초마다, 활성화 시만)
    const interval = setInterval(() => {
      if (enabled) checkConnection();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [enabled]);

  const handleToggle = () => {
    if (disabled) return;
    const newValue = !enabled;
    setEnabled(newValue);
    onChange(name, newValue);
    CONFIG.visual[name] = newValue;
    StorageManager.saveConfig(name, newValue);

    // 즉시 적용을 위해 이벤트 발생
    window.dispatchEvent(new CustomEvent("ivLyrics:videoHelperChanged", { detail: { enabled: newValue } }));
  };

  const handleDownload = () => {
    if (typeof VideoHelperService !== "undefined") {
      VideoHelperService.openDownloadPage();
    } else {
      window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank");
    }
  };

  const handleCheckConnection = async () => {
    if (typeof VideoHelperService !== "undefined") {
      setChecking(true);
      const connected = await VideoHelperService.checkHealth();
      setIsConnected(connected);
      setChecking(false);
      if (connected) {
        Toast?.success?.(I18n.t("settings.videoHelper.connected"));
      } else {
        Toast?.error?.(I18n.t("settings.videoHelper.disconnected"));
      }
    }
  };

  const getStatusText = () => {
    if (checking) return I18n.t("settings.videoHelper.status.checking");
    if (isConnected) return "✓ " + I18n.t("settings.videoHelper.status.connected");
    return I18n.t("settings.videoHelper.status.disconnected");
  };

  return react.createElement(
    "div",
    { className: "setting-row" },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement(
          "div",
          { className: "setting-name" },
          I18n.t("settings.videoHelper.label"),
          // 활성화 시 상태 태그 표시
          enabled && react.createElement("span", {
            style: {
              marginLeft: "10px",
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "12px",
              backgroundColor: isConnected ? "rgba(74, 222, 128, 0.2)" : "rgba(239, 68, 68, 0.2)",
              color: isConnected ? "#4ade80" : "#ef4444",
              border: `1px solid ${isConnected ? "rgba(74, 222, 128, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              fontWeight: "600",
              verticalAlign: "middle"
            }
          }, getStatusText())
        ),
        react.createElement(
          "div",
          { className: "setting-description" },
          I18n.t("settings.videoHelper.desc")
        )
      ),
      react.createElement(
        "div",
        { className: "setting-row-right", style: { display: "flex", alignItems: "center", gap: "10px" } },
        // 다운로드 버튼 (활성화 && 연결 안됨)
        enabled && !isConnected && react.createElement(
          "button",
          {
            className: "btn",
            onClick: handleDownload,
            style: { fontSize: "11px", padding: "4px 8px", height: "auto" }
          },
          I18n.t("settings.videoHelper.download")
        ),
        // 토글 스위치
        react.createElement(
          "button",
          {
            className: `switch-checkbox${enabled ? " active" : ""}`,
            onClick: handleToggle,
            "aria-checked": enabled,
            role: "checkbox",
            disabled,
          },
          react.createElement("svg", {
            width: 12,
            height: 12,
            viewBox: "0 0 16 16",
            fill: "currentColor",
            dangerouslySetInnerHTML: {
              __html: Spicetify.SVGIcons.check,
            },
          })
        )
      )
    )
  );
};

const ConfigSelection = ({
  name,
  defaultValue,
  options,
  disabled,
  onChange = () => { },
}) => {
  const [value, setValue] = useState(defaultValue);

  const setValueCallback = useCallback(
    (event) => {
      if (disabled) return;
      let value = event.target.value;
      if (!Number.isNaN(Number(value))) {
        value = Number.parseInt(value);
      }
      setValue(value);
      onChange(value);
    },
    [value, options, disabled]
  );

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  if (!Object.keys(options).length) return null;

  return react.createElement(
    "select",
    {
      value,
      disabled,
      onChange: setValueCallback,
    },
    ...Object.keys(options).map((item) =>
      react.createElement(
        "option",
        {
          key: item,
          value: item,
        },
        options[item]
      )
    )
  );
};

const ConfigInput = ({ name, settingKey, defaultValue, onChange = () => { }, inputType = "text" }) => {
  const [value, setValue] = useState(defaultValue);

  const setValueCallback = useCallback(
    (event) => {
      const value = event.target.value;
      setValue(value);
      onChange(settingKey || name, value);
    },
    [value, name, settingKey]
  );

  return react.createElement(
    "div",
    {
      className: "setting-row",
    },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" }, name)
      ),
      react.createElement(
        "div",
        { className: "setting-row-right" },
        react.createElement("input", {
          type: inputType,
          value,
          onChange: setValueCallback,
        })
      )
    )
  );
};

// Google Fonts 목록 (한글 + 인기 라틴 폰트)
const GOOGLE_FONTS = [
  "Pretendard Variable",
  "Noto Sans KR",
  "Nanum Gothic",
  "Nanum Myeongjo",
  "Black Han Sans",
  "Do Hyeon",
  "Jua",
  "Nanum Gothic Coding",
  "Gowun Batang",
  "Gowun Dodum",
  "IBM Plex Sans KR",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Inter",
  "Raleway",
  "Oswald",
  "Merriweather",
  "Playfair Display",
];

const ConfigFontSelector = ({
  name,
  info,
  settingKey,
  defaultValue,
  onChange = () => { },
}) => {
  // 커스텀 폰트 여부 판단: defaultValue가 존재하고, 문자열이며, 비어있지 않고, Google Fonts에 없는 경우만 true
  const isCustomFontValue = (val) => {
    if (!val || typeof val !== 'string') return false;
    const trimmed = val.trim();
    // "undefined" 문자열도 무효로 처리
    if (trimmed === "" || trimmed === "undefined") return false;
    return !GOOGLE_FONTS.includes(trimmed);
  };

  // 기본값 안전하게 처리 - "undefined" 문자열도 무효로 처리
  const getSafeValue = (val) => {
    if (!val || typeof val !== 'string') return "";
    const trimmed = val.trim();
    if (trimmed === "" || trimmed === "undefined") return "";
    return trimmed;
  };

  const safeDefaultValue = getSafeValue(defaultValue);

  const [useCustomFont, setUseCustomFont] = useState(() => isCustomFontValue(safeDefaultValue));
  const [selectedFont, setSelectedFont] = useState(() => {
    if (!safeDefaultValue || GOOGLE_FONTS.includes(safeDefaultValue)) {
      return GOOGLE_FONTS.includes(safeDefaultValue) ? safeDefaultValue : "Pretendard Variable";
    }
    return "Pretendard Variable";
  });
  const [customFont, setCustomFont] = useState(() => {
    if (isCustomFontValue(safeDefaultValue)) {
      return safeDefaultValue;
    }
    return "";
  });

  useEffect(() => {
    const safeVal = getSafeValue(defaultValue);
    const isCustom = isCustomFontValue(safeVal);
    setUseCustomFont(isCustom);
    if (isCustom) {
      setCustomFont(safeVal);
    } else if (safeVal && GOOGLE_FONTS.includes(safeVal)) {
      setSelectedFont(safeVal);
    }
  }, [defaultValue]);

  const handleFontChange = (event) => {
    const font = event.target.value;
    setSelectedFont(font);
    if (!useCustomFont) {
      onChange(settingKey || name, font);
    }
  };

  const handleCustomFontChange = (event) => {
    const font = event.target.value;
    setCustomFont(font);
    if (useCustomFont) {
      onChange(settingKey || name, font);
    }
  };

  const handleCheckboxChange = () => {
    const newUseCustom = !useCustomFont;
    setUseCustomFont(newUseCustom);
    if (newUseCustom) {
      onChange(settingKey || name, customFont || "");
    } else {
      onChange(settingKey || name, selectedFont);
    }
  };

  const commonStyle = {
    width: "200px",
    height: "32px",
    padding: "4px 8px",
    fontSize: "14px",
    border: "1px solid var(--spice-button-disabled)",
    borderRadius: "4px",
    backgroundColor: "var(--spice-button)",
    color: "var(--spice-text)",
    boxSizing: "border-box",
  };

  const fontSelector = react.createElement(
    "div",
    { style: { display: "flex", gap: "10px", alignItems: "center" } },
    useCustomFont
      ? react.createElement("input", {
        type: "text",
        value: customFont,
        onChange: handleCustomFontChange,
        placeholder: I18n.t("settings.fontPlaceholder") || "폰트명 입력 (예: Arial, 맑은 고딕)",
        style: commonStyle,
      })
      : react.createElement(
        "select",
        {
          value: selectedFont,
          onChange: handleFontChange,
          style: commonStyle,
        },
        GOOGLE_FONTS.map((font) =>
          react.createElement("option", { key: font, value: font }, font)
        )
      ),
    react.createElement(ButtonSVG, {
      icon: Spicetify.SVGIcons.edit,
      active: useCustomFont,
      onClick: handleCheckboxChange,
    })
  );

  // name이 있으면 전체 setting-row로 래핑, 없으면 컨트롤만 반환
  if (name) {
    return react.createElement(
      "div",
      { className: "setting-row" },
      react.createElement(
        "div",
        { className: "setting-row-content" },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement("div", { className: "setting-name" }, name),
          info &&
          react.createElement("div", {
            className: "setting-description",
            dangerouslySetInnerHTML: {
              __html: info,
            },
          })
        ),
        react.createElement(
          "div",
          { className: "setting-row-right" },
          fontSelector
        )
      )
    );
  }

  return fontSelector;
};

// NowPlaying 패널 가사 미리보기 컴포넌트
const NowPlayingPanelPreview = () => {
  const [fontFamily, setFontFamily] = useState(CONFIG.visual["panel-lyrics-font-family"] || "Pretendard Variable");
  const [originalFont, setOriginalFont] = useState(CONFIG.visual["panel-lyrics-original-font"] || "");
  const [phoneticFont, setPhoneticFont] = useState(CONFIG.visual["panel-lyrics-phonetic-font"] || "");
  const [translationFont, setTranslationFont] = useState(CONFIG.visual["panel-lyrics-translation-font"] || "");
  const [fontScale, setFontScale] = useState(parseInt(CONFIG.visual["panel-font-scale"], 10) || 100);
  const [originalSize, setOriginalSize] = useState(parseInt(CONFIG.visual["panel-lyrics-original-size"], 10) || 18);
  const [phoneticSize, setPhoneticSize] = useState(parseInt(CONFIG.visual["panel-lyrics-phonetic-size"], 10) || 13);
  const [translationSize, setTranslationSize] = useState(parseInt(CONFIG.visual["panel-lyrics-translation-size"], 10) || 13);
  const [linesCount, setLinesCount] = useState(parseInt(CONFIG.visual["panel-lyrics-lines"], 10) || 5);

  // 배경 설정
  const [bgType, setBgType] = useState(CONFIG.visual["panel-bg-type"] || "album");
  const [bgColor, setBgColor] = useState(CONFIG.visual["panel-bg-color"] || "#6366f1");
  const [bgGradient1, setBgGradient1] = useState(CONFIG.visual["panel-bg-gradient-1"] || "#6366f1");
  const [bgGradient2, setBgGradient2] = useState(CONFIG.visual["panel-bg-gradient-2"] || "#a855f7");
  const [bgOpacity, setBgOpacity] = useState(parseInt(CONFIG.visual["panel-bg-opacity"], 10) || 30);

  // Border 설정
  const [borderEnabled, setBorderEnabled] = useState(CONFIG.visual["panel-border-enabled"] ?? false);
  const [borderColor, setBorderColor] = useState(CONFIG.visual["panel-border-color"] || "#ffffff");
  const [borderOpacity, setBorderOpacity] = useState(parseInt(CONFIG.visual["panel-border-opacity"], 10) || 10);

  // 설정 변경 리스너
  useEffect(() => {
    const handlePreviewUpdate = (event) => {
      const { name, value } = event.detail || {};
      if (name === "panel-lyrics-font-family") setFontFamily(value || "Pretendard Variable");
      if (name === "panel-lyrics-original-font") setOriginalFont(value || "");
      if (name === "panel-lyrics-phonetic-font") setPhoneticFont(value || "");
      if (name === "panel-lyrics-translation-font") setTranslationFont(value || "");
      if (name === "panel-font-scale") setFontScale(parseInt(value, 10) || 100);
      if (name === "panel-lyrics-original-size") setOriginalSize(parseInt(value, 10) || 18);
      if (name === "panel-lyrics-phonetic-size") setPhoneticSize(parseInt(value, 10) || 13);
      if (name === "panel-lyrics-translation-size") setTranslationSize(parseInt(value, 10) || 13);
      if (name === "panel-lyrics-lines") setLinesCount(parseInt(value, 10) || 5);
      // 배경 설정
      if (name === "panel-bg-type") setBgType(value || "album");
      if (name === "panel-bg-color") setBgColor(value || "#6366f1");
      if (name === "panel-bg-gradient-1") setBgGradient1(value || "#6366f1");
      if (name === "panel-bg-gradient-2") setBgGradient2(value || "#a855f7");
      if (name === "panel-bg-opacity") setBgOpacity(parseInt(value, 10) || 30);
      // Border 설정
      if (name === "panel-border-enabled") setBorderEnabled(value === true || value === "true");
      if (name === "panel-border-color") setBorderColor(value || "#ffffff");
      if (name === "panel-border-opacity") setBorderOpacity(parseInt(value, 10) || 10);
    };

    window.addEventListener("ivLyrics:panel-preview-update", handlePreviewUpdate);
    return () => window.removeEventListener("ivLyrics:panel-preview-update", handlePreviewUpdate);
  }, []);

  const scale = fontScale / 100;
  const baseFontFamily = `'${fontFamily}', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  // 개별 폰트가 설정되어 있으면 사용, 아니면 기본 폰트 사용
  const originalFontFamily = originalFont ? `${originalFont}, ${baseFontFamily}` : baseFontFamily;
  const phoneticFontFamily = phoneticFont ? `${phoneticFont}, ${baseFontFamily}` : baseFontFamily;
  const translationFontFamily = translationFont ? `${translationFont}, ${baseFontFamily}` : baseFontFamily;

  // 샘플 가사 데이터 (원어 → 발음 → 번역 순서)
  const allSampleLyrics = [
    { original: "君を好きになって", phonetic: "kimi wo suki ni natte", translation: "너를 좋아하게 되어서" },
    { original: "しまったみたいだ", phonetic: "shimatta mitai da", translation: "버린 것 같아" },
    { original: "どんな言葉を", phonetic: "donna kotoba wo", translation: "어떤 말을" },
    { original: "選んでも足りない", phonetic: "erande mo tarinai", translation: "골라도 부족해" },
    { original: "君と過ごす時間", phonetic: "kimi to sugosu jikan", translation: "너와 보내는 시간" },
    { original: "全てが宝物", phonetic: "subete ga takaramono", translation: "전부 소중해" },
    { original: "もう離れたくない", phonetic: "mou hanaretakunai", translation: "이제 떨어지고 싶지 않아" },
    { original: "ずっとそばにいて", phonetic: "zutto soba ni ite", translation: "계속 곁에 있어줘" },
    { original: "この気持ちが", phonetic: "kono kimochi ga", translation: "이 마음이" },
  ];

  // 가사 줄 수에 맞춰 표시 (중앙이 active)
  const activeIndex = Math.floor(linesCount / 2);
  const sampleLyrics = allSampleLyrics.slice(0, linesCount).map((line, idx) => ({
    ...line,
    active: idx === activeIndex
  }));

  // 배경 스타일 계산
  const getBackgroundStyle = () => {
    const opacityValue = bgOpacity / 100;
    switch (bgType) {
      case "custom":
        // 사용자 지정 단색
        const customRgb = hexToRgb(bgColor);
        return `rgba(${customRgb.r}, ${customRgb.g}, ${customRgb.b}, ${opacityValue})`;
      case "gradient":
        // 그라데이션
        const grad1Rgb = hexToRgb(bgGradient1);
        const grad2Rgb = hexToRgb(bgGradient2);
        return `linear-gradient(135deg, rgba(${grad1Rgb.r}, ${grad1Rgb.g}, ${grad1Rgb.b}, ${opacityValue}) 0%, rgba(${grad2Rgb.r}, ${grad2Rgb.g}, ${grad2Rgb.b}, ${opacityValue}) 100%)`;
      case "album":
      default:
        // 앨범 기반 (기본 보라색 그라데이션으로 시뮬레이션)
        return `linear-gradient(135deg, rgba(99, 102, 241, ${opacityValue}) 0%, rgba(168, 85, 247, ${opacityValue}) 100%)`;
    }
  };

  // Border 스타일 계산
  const getBorderStyle = () => {
    if (!borderEnabled) return "none";
    const borderRgb = hexToRgb(borderColor);
    const borderOpacityValue = borderOpacity / 100;
    return `1px solid rgba(${borderRgb.r}, ${borderRgb.g}, ${borderRgb.b}, ${borderOpacityValue})`;
  };

  // Hex to RGB 변환 헬퍼
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 99, g: 102, b: 241 };
  };

  return react.createElement(
    "div",
    {
      className: "option-list-wrapper",
      style: { marginBottom: "16px" }
    },
    react.createElement(
      "div",
      {
        style: {
          padding: "16px",
          background: getBackgroundStyle(),
          backdropFilter: bgOpacity === 0 ? "none" : "blur(20px)",
          border: getBorderStyle(),
        }
      },
      // 미리보기 헤더
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            marginBottom: "12px",
            fontSize: "11px",
            fontWeight: "700",
            color: "rgba(255, 255, 255, 0.85)",
            letterSpacing: "0.02em",
          }
        },
        "🎵 " + (I18n.t("settingsAdvanced.nowPlayingPanel.preview") || "Preview")
      ),
      // 가사 미리보기 (원어 → 발음 → 번역 순서)
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }
        },
        ...sampleLyrics.map((line, idx) =>
          react.createElement(
            "div",
            {
              key: idx,
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                padding: "4px 0",
                opacity: line.active ? 1 : 0.5,
                transition: "opacity 0.3s ease",
              }
            },
            // 원문 (가장 먼저)
            react.createElement(
              "div",
              {
                style: {
                  fontSize: `${originalSize * scale}px`,
                  fontWeight: line.active ? 800 : 700,
                  color: line.active ? "#ffffff" : "rgba(255, 255, 255, 0.7)",
                  lineHeight: 1.4,
                  fontFamily: originalFontFamily,
                }
              },
              line.original
            ),
            // 발음 (두 번째)
            react.createElement(
              "div",
              {
                style: {
                  fontSize: `${phoneticSize * scale}px`,
                  fontWeight: 400,
                  color: line.active ? "rgba(255, 255, 255, 0.75)" : "rgba(255, 255, 255, 0.55)",
                  lineHeight: 1.35,
                  fontFamily: phoneticFontFamily,
                }
              },
              line.phonetic
            ),
            // 번역 (마지막)
            react.createElement(
              "div",
              {
                style: {
                  fontSize: `${translationSize * scale}px`,
                  fontWeight: 500,
                  color: line.active ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.5)",
                  lineHeight: 1.35,
                  fontFamily: translationFontFamily,
                }
              },
              line.translation
            )
          )
        )
      )
    )
  );
};

const ConfigAdjust = ({
  name,
  defaultValue,
  step,
  min,
  max,
  onChange = () => { },
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  function adjust(dir) {
    let temp = value + dir * step;
    if (temp < min) {
      temp = min;
    } else if (temp > max) {
      temp = max;
    }
    setValue(temp);
    onChange(temp);
  }
  return react.createElement(
    "div",
    { className: "adjust-container" },
    react.createElement(
      "button",
      {
        className: "adjust-button",
        onClick: () => adjust(-1),
        disabled: value === min,
        "aria-label": "Decrease",
      },
      "-"
    ),
    react.createElement("span", { className: "adjust-value" }, value),
    react.createElement(
      "button",
      {
        className: "adjust-button",
        onClick: () => adjust(1),
        disabled: value === max,
        "aria-label": "Increase",
      },
      "+"
    )
  );
};

const ConfigHotkey = ({ name, settingKey, defaultValue, onChange = () => { } }) => {
  const [value, setValue] = useState(defaultValue);
  const [trap] = useState(new Spicetify.Mousetrap());

  function record() {
    trap.handleKey = (character, modifiers, e) => {
      if (e.type === "keydown") {
        const sequence = [...new Set([...modifiers, character])];
        if (sequence.length === 1 && sequence[0] === "esc") {
          onChange(settingKey || name, "");
          setValue("");
          return;
        }
        setValue(sequence.join("+"));
      }
    };
  }

  function finishRecord() {
    trap.handleKey = () => { };
    onChange(settingKey || name, value);
  }

  return react.createElement(
    "div",
    {
      className: "setting-row",
    },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" }, name)
      ),
      react.createElement(
        "div",
        { className: "setting-row-right" },
        react.createElement("input", {
          type: "text",
          value,
          onFocus: record,
          onBlur: finishRecord,
        })
      )
    )
  );
};

const ConfigKeyList = ({ name, settingKey, defaultValue, onChange = () => { } }) => {
  const [keys, setKeys] = useState(() => {
    try {
      if (!defaultValue) return [""];
      // If it starts with [, treat as JSON array
      if (typeof defaultValue === 'string' && defaultValue.trim().startsWith('[')) {
        const parsed = JSON.parse(defaultValue);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : [""];
      }
      // Otherwise treat as single key
      return [defaultValue];
    } catch (e) {
      return [defaultValue || ""];
    }
  });

  const updateKeys = (newKeys) => {
    setKeys(newKeys);
    // Save as JSON string
    onChange(settingKey || name, JSON.stringify(newKeys.filter(k => k.trim() !== "")));
  };

  const addKey = () => {
    updateKeys([...keys, ""]);
  };

  const removeKey = (index) => {
    const newKeys = keys.filter((_, i) => i !== index);
    if (newKeys.length === 0) newKeys.push(""); // Keep at least one input
    updateKeys(newKeys);
  };

  const updateKey = (index, value) => {
    const newKeys = [...keys];
    newKeys[index] = value;
    updateKeys(newKeys);
  };

  return react.createElement(
    "div",
    {
      className: "setting-row",
    },
    react.createElement(
      "div",
      { className: "setting-row-content", style: { flexDirection: "column", alignItems: "stretch", gap: "10px" } },
      react.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        react.createElement("div", { className: "setting-name" }, name),
        react.createElement("button", {
          className: "btn",
          onClick: addKey,
          style: { width: "auto", minWidth: "60px", padding: "4px 12px", fontSize: "12px" }
        }, I18n.t("buttons.add"))
      ),
      keys.map((key, index) =>
        react.createElement("div", { key: index, style: { display: "flex", gap: "8px" } },
          react.createElement("input", {
            type: "text",
            value: key,
            placeholder: `${name} ${index + 1}`,
            onChange: (e) => updateKey(index, e.target.value),
            style: { flex: 1 }
          }),
          keys.length > 1 && react.createElement("button", {
            className: "btn",
            onClick: () => removeKey(index),
            style: { background: "#e91e63", borderColor: "#c2185b", minWidth: "36px", width: "36px", padding: 0 }
          }, "X")
        )
      )
    )
  );
};

const ServiceAction = ({ item, setTokenCallback }) => {
  // CacheButton은 LocalCacheManager로 통합되어 제거됨
  return null;
};

const ServiceOption = react.memo(
  ({
    item,
    onToggle,
    onSwap,
    isFirst = false,
    isLast = false,
    onTokenChange = null,
  }) => {
    const [token, setToken] = useState(item.token);
    const [active, setActive] = useState(item.on);

    const setTokenCallback = useCallback(
      (token) => {
        setToken(token);
        onTokenChange(item.name, token);
      },
      [item.name, onTokenChange]
    );

    const toggleActive = useCallback(() => {
      setActive((prevActive) => {
        const newState = !prevActive;
        onToggle(item.name, newState);
        return newState;
      });
    }, [item.name, onToggle]);

    return react.createElement(
      react.Fragment,
      null,
      react.createElement(
        "div",
        {
          className: "setting-row",
        },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            { className: "setting-row-left" },
            react.createElement(
              "div",
              { className: "setting-name" },
              item.name
            ),
            react.createElement("div", {
              className: "setting-description",
              dangerouslySetInnerHTML: {
                __html: item.desc,
              },
            })
          ),
          react.createElement(
            "div",
            {
              className: "setting-row-right",
              style: { display: "flex", gap: "8px", alignItems: "center" },
            },
            react.createElement(ServiceAction, {
              item,
              setTokenCallback,
            }),
            react.createElement(SwapButton, {
              icon: Spicetify.SVGIcons["chart-up"],
              onClick: () => onSwap(item.name, -1),
              disabled: isFirst,
            }),
            react.createElement(SwapButton, {
              icon: Spicetify.SVGIcons["chart-down"],
              onClick: () => onSwap(item.name, 1),
              disabled: isLast,
            }),
            react.createElement(ButtonSVG, {
              icon: Spicetify.SVGIcons.check,
              active,
              onClick: toggleActive,
            })
          )
        )
      ),
      item.token !== undefined &&
      react.createElement(
        "div",
        {
          className: "service-token-input-wrapper",
          style: {
            padding: "0 16px 12px 16px",
            background: "rgba(28, 28, 30, 0.5)",
            backdropFilter: "blur(30px) saturate(150%)",
            WebkitBackdropFilter: "blur(30px) saturate(150%)",
            borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
            borderRight: "1px solid rgba(255, 255, 255, 0.08)",
            borderBottom: "0.5px solid rgba(255, 255, 255, 0.08)",
            marginTop: "-1px",
          },
        },
        react.createElement("input", {
          type: "text",
          placeholder: `Place your ${item.name} token here`,
          value: token,
          onChange: (event) => setTokenCallback(event.target.value),
          style: {
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "#ffffff",
            fontSize: "13px",
            width: "100%",
            boxSizing: "border-box",
            fontFamily:
              "Pretendard Variable, -apple-system, BlinkMacSystemFont, sans-serif",
          },
        })
      )
    );
  }
);

const ServiceList = ({
  itemsList,
  onListChange = () => { },
  onToggle = () => { },
  onTokenChange = () => { },
}) => {
  const [items, setItems] = useState(itemsList);
  const maxIndex = items.length - 1;

  const onSwap = useCallback(
    (name, direction) => {
      const curPos = items.findIndex((val) => val === name);
      const newPos = curPos + direction;
      [items[curPos], items[newPos]] = [items[newPos], items[curPos]];
      onListChange(items);
      setItems([...items]);
    },
    [items]
  );

  const renderedItems = items.map((key, index) => {
    const item = CONFIG.providers[key];
    item.name = key;
    return react.createElement(ServiceOption, {
      item,
      key,
      isFirst: index === 0,
      isLast: index === maxIndex,
      onSwap,
      onTokenChange,
      onToggle,
    });
  });

  // ServiceList도 wrapper로 감싸기
  return react.createElement(
    "div",
    { className: "service-list-wrapper" },
    ...renderedItems
  );
};

const OptionList = ({ type, items, onChange }) => {
  const [itemList, setItemList] = useState(items);
  const [, forceUpdate] = useState();

  useEffect(() => {
    if (!type) return;

    const eventListener = (event) => {
      if (event.detail?.type !== type) return;
      setItemList(event.detail.items);
    };
    document.addEventListener("ivLyrics", eventListener);

    return () => document.removeEventListener("ivLyrics", eventListener);
  }, []);

  const renderedItems = (itemList || []).map((item, index) => {
    if (!item || (item.when && !item.when())) {
      return;
    }

    const onChangeItem = item.onChange || onChange;
    const isDisabled =
      typeof item.disabled === "function"
        ? item.disabled()
        : item.disabled || false;

    // type이 "info"인 경우 - 정보 표시만 (토글 없음)
    if (item.type === "info") {
      return react.createElement(
        "div",
        {
          key: index,
          className: "setting-row",
          "data-setting-key": item.key,
        },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            { className: "setting-row-left" },
            react.createElement("div", { className: "setting-name" }, item.desc)
          )
        )
      );
    }

    // ConfigButton, ConfigInput, ConfigHotkey, ConfigFontSelector는 자체적으로 setting-row를 만들므로 wrapper 불필요
    if (
      item.type === ConfigButton ||
      item.type === ConfigInput ||
      item.type === ConfigHotkey ||
      item.type === ConfigWarning ||
      item.type === ConfigInfo ||
      item.type === ConfigKeyList ||
      item.type === ConfigFontSelector ||
      item.type === VideoHelperToggle
    ) {
      // item.onChange가 있으면 그것을 우선 사용 (업데이트 확인, 내보내기 등 커스텀 핸들러)
      const itemOnChange = item.onChange || ((name, value, event) => {
        if (!isDisabled) {
          onChangeItem(item.key || name, value, event);
          forceUpdate({});
        }
      });

      return react.createElement(item.type, {
        ...item,
        key: index,
        name: item.desc || item.key,
        settingKey: item.key,
        text: item.text,
        disabled: isDisabled,
        defaultValue:
          item.defaultValue !== undefined
            ? item.defaultValue
            : CONFIG.visual[item.key],
        onChange: itemOnChange,
      });
    }

    // 나머지 타입들은 wrapper로 감싸기
    return react.createElement(
      "div",
      {
        key: index,
        className: "setting-row",
        "data-setting-key": item.key,
        style: isDisabled ? { opacity: 0.5, pointerEvents: "none" } : {},
      },
      react.createElement(
        "div",
        { className: "setting-row-content" },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement("div", { className: "setting-name" }, item.desc),
          item.info &&
          react.createElement("div", {
            className: "setting-description",
            dangerouslySetInnerHTML: {
              __html: item.info,
            },
          })
        ),
        react.createElement(
          "div",
          { className: "setting-row-right" },
          react.createElement(item.type, {
            ...item,
            name: item.desc,
            disabled: isDisabled,
            defaultValue:
              item.defaultValue !== undefined
                ? item.defaultValue
                : CONFIG.visual[item.key],
            onChange: (value) => {
              if (!isDisabled) {
                onChangeItem(item.key, value);
                forceUpdate({});
              }
            },
          })
        )
      )
    );
  });

  // Wrapper로 감싸서 반환
  return react.createElement(
    "div",
    { className: "option-list-wrapper" },
    ...renderedItems
  );
};

const languageCodes =
  "none,en,af,ar,bg,bn,ca,zh,cs,da,de,el,es,et,fa,fi,fr,gu,he,hi,hr,hu,id,is,it,ja,jv,id,kn,ko,lt,lv,ml,mr,ms,nl,no,pl,pt,ro,ru,sk,sl,sr,su,sv,ta,te,th,tr,uk,ur,vi,zu".split(
    ","
  );

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageOptions = languageCodes.reduce((acc, code) => {
  acc[code] = code === "none" ? "None" : displayNames.of(code);
  return acc;
}, {});

// Pre-defined styles to avoid recreation on each render
const MODAL_STYLES = {
  header: { margin: 0, fontSize: "18px", fontWeight: "600" },
  previewTitle: { marginTop: 0, marginBottom: "10px" },
};

const ConfigModal = () => {
  const [activeTab, setActiveTab] = react.useState("general");
  const [searchQuery, setSearchQuery] = react.useState("");

  // 검색어 변경 시 검색 결과 탭으로 자동 전환
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 0) {
      setActiveTab("search");
    } else {
      setActiveTab("general");
    }
  };

  // 검색 지우기
  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveTab("general");
  };

  // 스크롤 대상 설정 ID (ref 사용하여 리렌더링 방지)
  const scrollToSettingIdRef = react.useRef(null);
  const isNavigatingFromSearchRef = react.useRef(false);

  // 텍스트 하이라이트 헬퍼 함수
  const highlightText = (text, query) => {
    if (!query.trim() || !text) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + query.trim().length);
    const after = text.substring(index + query.trim().length);

    return react.createElement(
      react.Fragment,
      null,
      before,
      react.createElement("mark", { className: "search-highlight" }, match),
      after
    );
  };

  // 검색 가능한 설정 항목 정의
  const searchableSettings = react.useMemo(() => [
    // 일반 탭 - 언어
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "language",
      name: I18n.t("settings.language.label"),
      desc: I18n.t("settings.language.desc"),
      keywords: ["언어", "language", "lang", "언어 설정", "한국어", "english", "日本語", "中文"]
    },
    // 일반 탭 - 시각 효과
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "alignment",
      name: I18n.t("settings.alignment.label"),
      desc: I18n.t("settings.alignment.desc"),
      keywords: ["정렬", "alignment", "왼쪽", "가운데", "오른쪽", "left", "center", "right"]
    },
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "noise",
      name: I18n.t("settings.noise.label"),
      desc: I18n.t("settings.noise.desc"),
      keywords: ["노이즈", "noise", "그레인", "grain", "필름", "film"]
    },
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "colorful",
      name: I18n.t("settings.colorful.label"),
      desc: I18n.t("settings.colorful.desc"),
      keywords: ["컬러풀", "colorful", "배경", "background", "동적", "dynamic", "앨범 색상"]
    },
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "gradient-background",
      name: I18n.t("settings.gradientBackground.label"),
      desc: I18n.t("settings.gradientBackground.desc"),
      keywords: ["앨범", "album", "커버", "cover", "배경", "background", "gradient"]
    },
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "solid-background",
      name: I18n.t("settings.solidBackground.label"),
      desc: I18n.t("settings.solidBackground.desc"),
      keywords: ["단색", "solid", "배경", "background", "색상"]
    },
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "video-background",
      name: I18n.t("settings.videoBackground.label"),
      desc: I18n.t("settings.videoBackground.desc"),
      keywords: ["동영상", "video", "유튜브", "youtube", "배경", "background"]
    },
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "backgroundBrightness",
      name: I18n.t("settings.backgroundBrightness.label"),
      desc: I18n.t("settings.backgroundBrightness.desc"),
      keywords: ["밝기", "brightness", "배경", "background", "어둡게", "밝게"]
    },
    // 일반 탭 - 데스크탑 오버레이
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "overlay-enabled",
      name: I18n.t("overlay.enabled.label"),
      desc: I18n.t("overlay.enabled.desc"),
      keywords: ["오버레이", "overlay", "데스크탑", "desktop", "외부 앱"]
    },

    // 외관 탭
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "original-style",
      name: I18n.t("settingsAdvanced.originalStyle.title"),
      desc: I18n.t("settingsAdvanced.originalStyle.subtitle"),
      keywords: ["폰트", "font", "글꼴", "원문", "original", "스타일", "style", "크기", "size", "두께", "weight"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "pronunciation-style",
      name: I18n.t("settingsAdvanced.pronunciationStyle.title"),
      desc: I18n.t("settingsAdvanced.pronunciationStyle.subtitle"),
      keywords: ["발음", "pronunciation", "폰트", "font", "로마자", "romaji", "phonetic", "스타일"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "translation-style",
      name: I18n.t("settingsAdvanced.translationStyle.title"),
      desc: I18n.t("settingsAdvanced.translationStyle.subtitle"),
      keywords: ["번역", "translation", "폰트", "font", "스타일", "style"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "furigana-style",
      name: I18n.t("settingsAdvanced.furiganaStyle.title"),
      desc: I18n.t("settingsAdvanced.furiganaStyle.subtitle"),
      keywords: ["후리가나", "furigana", "히라가나", "hiragana", "일본어", "japanese", "한자"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "text-shadow",
      name: I18n.t("settingsAdvanced.textShadow.title"),
      desc: I18n.t("settingsAdvanced.textShadow.subtitle"),
      keywords: ["그림자", "shadow", "텍스트", "text", "가독성"]
    },

    // 동작 탭
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "auto-scroll",
      name: I18n.t("settings.autoScroll.label"),
      desc: I18n.t("settings.autoScroll.desc"),
      keywords: ["자동", "auto", "스크롤", "scroll"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "animation",
      name: I18n.t("settings.animation.label"),
      desc: I18n.t("settings.animation.desc"),
      keywords: ["애니메이션", "animation", "효과", "effect"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "karaoke",
      name: I18n.t("settings.karaoke.label"),
      desc: I18n.t("settings.karaoke.desc"),
      keywords: ["가라오케", "karaoke", "노래방", "리드", "카운트다운"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "blur-inactive",
      name: I18n.t("settings.blurInactive.label"),
      desc: I18n.t("settings.blurInactive.desc"),
      keywords: ["블러", "blur", "비활성", "inactive", "흐림"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "synced-fallback",
      name: I18n.t("settings.syncedAsFallback.label"),
      desc: I18n.t("settings.syncedAsFallback.desc"),
      keywords: ["싱크", "sync", "대체", "fallback", "싱크 가사"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "unsynced-fallback",
      name: I18n.t("settings.unsyncedAsFallback.label"),
      desc: I18n.t("settings.unsyncedAsFallback.desc"),
      keywords: ["비싱크", "unsynced", "대체", "fallback"]
    },

    // 고급 탭
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "playback",
      name: I18n.t("settingsAdvanced.playback.title"),
      desc: I18n.t("settingsAdvanced.playback.subtitle"),
      keywords: ["재생", "playback", "플레이바", "playbar", "버튼", "button"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "karaoke-mode",
      name: I18n.t("settingsAdvanced.karaokeMode.title"),
      desc: I18n.t("settingsAdvanced.karaokeMode.subtitle"),
      keywords: ["가라오케", "karaoke", "노래방", "바운스", "bounce"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "prefetch",
      name: I18n.t("settingsAdvanced.prefetch.title"),
      desc: I18n.t("settingsAdvanced.prefetch.subtitle"),
      keywords: ["미리", "prefetch", "로드", "load", "다음 곡", "next"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "community-sync",
      name: I18n.t("settingsAdvanced.communitySync.title"),
      desc: I18n.t("settingsAdvanced.communitySync.subtitle"),
      keywords: ["커뮤니티", "community", "싱크", "sync", "오프셋", "offset", "공유"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "cache-management",
      name: I18n.t("settingsAdvanced.cacheManagement.title"),
      desc: I18n.t("settingsAdvanced.cacheManagement.subtitle"),
      keywords: ["캐시", "cache", "저장", "storage", "삭제", "clear", "메모리", "memory"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "export-import",
      name: I18n.t("settingsAdvanced.exportImport.title"),
      desc: I18n.t("settingsAdvanced.exportImport.subtitle"),
      keywords: ["내보내기", "export", "가져오기", "import", "백업", "backup"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "reset-settings",
      name: I18n.t("settingsAdvanced.resetSettings.title"),
      desc: I18n.t("settingsAdvanced.resetSettings.subtitle"),
      keywords: ["초기화", "reset", "기본값", "default"]
    },

    // 제공자 탭
    {
      section: I18n.t("tabs.providers"),
      sectionKey: "translation",
      settingKey: "lyrics-providers",
      name: I18n.t("settingsAdvanced.lyricsProviders.title"),
      desc: I18n.t("settingsAdvanced.lyricsProviders.subtitle"),
      keywords: ["제공자", "provider", "가사", "lyrics", "소스", "source", "spotify", "lrclib", "musixmatch"]
    },
    {
      section: I18n.t("tabs.providers"),
      sectionKey: "translation",
      settingKey: "gemini-api",
      name: "Gemini API",
      desc: I18n.t("menu.apiSettings"),
      keywords: ["gemini", "api", "키", "key", "번역", "translation", "ai"]
    },

    // 전체화면 탭
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-mode",
      name: I18n.t("settingsAdvanced.fullscreenMode.title"),
      desc: I18n.t("settingsAdvanced.fullscreenMode.subtitle"),
      keywords: ["전체화면", "fullscreen", "단축키", "shortcut", "레이아웃", "layout"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-style",
      name: I18n.t("settingsAdvanced.fullscreenStyle.title"),
      desc: I18n.t("settingsAdvanced.fullscreenStyle.subtitle"),
      keywords: ["전체화면", "fullscreen", "앨범", "album", "크기", "size", "스타일", "style"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-ui",
      name: I18n.t("settingsAdvanced.fullscreenUI.title"),
      desc: I18n.t("settingsAdvanced.fullscreenUI.subtitle"),
      keywords: ["전체화면", "fullscreen", "시계", "clock", "컨트롤", "control", "볼륨", "volume"]
    },
  ], []);

  // 검색 결과 필터링
  const searchResults = react.useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase().trim();
    return searchableSettings.filter(setting => {
      const searchIn = [
        setting.name,
        setting.desc,
        ...setting.keywords
      ].join(" ").toLowerCase();

      return searchIn.includes(query);
    });
  }, [searchQuery, searchableSettings]);

  // 검색 결과 컴포넌트
  const SearchResults = () => {
    if (!searchQuery.trim()) {
      return null;
    }

    if (searchResults.length === 0) {
      return react.createElement(
        "div",
        { className: "search-no-results" },
        react.createElement(
          "svg",
          {
            className: "search-no-results-icon",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
          },
          react.createElement("circle", { cx: "11", cy: "11", r: "8" }),
          react.createElement("path", { d: "m21 21-4.35-4.35" })
        ),
        react.createElement("h3", { className: "search-no-results-title" }, I18n.t("search.noResults")),
        react.createElement("p", { className: "search-no-results-desc" }, I18n.t("search.noResultsDesc"))
      );
    }

    // 섹션별로 그룹화
    const groupedResults = {};
    searchResults.forEach(result => {
      if (!groupedResults[result.section]) {
        groupedResults[result.section] = [];
      }
      groupedResults[result.section].push(result);
    });

    return react.createElement(
      react.Fragment,
      null,
      react.createElement(
        "div",
        { className: "search-results-header" },
        react.createElement(
          "span",
          { className: "search-results-count" },
          I18n.t("search.resultCount").replace("{count}", searchResults.length)
        )
      ),
      Object.entries(groupedResults).map(([section, items]) =>
        react.createElement(
          "div",
          { key: section, className: "search-result-group" },
          react.createElement(
            "div",
            { className: "section-title" },
            react.createElement(
              "div",
              { className: "section-title-content" },
              react.createElement(
                "div",
                { className: "section-text" },
                react.createElement("h3", null, section)
              )
            )
          ),
          react.createElement(
            "div",
            { className: "option-list-wrapper" },
            items.map((item, index) =>
              react.createElement(
                "div",
                {
                  key: `${section}-${item.name}-${index}`,
                  className: "setting-row search-result-item",
                  onMouseDown: (e) => {
                    // blur 이벤트가 발생하기 전에 클릭을 처리하기 위해 preventDefault
                    e.preventDefault();
                  },
                  onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const targetTab = item.sectionKey;
                    const targetSettingKey = item.settingKey;
                    // 스크롤 대상 설정 (ref 사용)
                    if (targetSettingKey) {
                      scrollToSettingIdRef.current = targetSettingKey;
                      isNavigatingFromSearchRef.current = true;
                    }
                    // 바로 탭 이동
                    setActiveTab(targetTab);
                    setSearchQuery("");
                  },
                  style: { cursor: "pointer" }
                },
                react.createElement(
                  "div",
                  { className: "setting-row-content" },
                  react.createElement(
                    "div",
                    { className: "setting-row-left" },
                    react.createElement(
                      "div",
                      { className: "setting-name" },
                      highlightText(item.name, searchQuery)
                    ),
                    react.createElement(
                      "div",
                      { className: "setting-description" },
                      highlightText(item.desc, searchQuery)
                    )
                  ),
                  react.createElement(
                    "div",
                    { className: "setting-row-right" },
                    react.createElement(
                      "svg",
                      {
                        width: "16",
                        height: "16",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "#8e8e93",
                        strokeWidth: "2",
                      },
                      react.createElement("path", { d: "m9 18 6-6-6-6" })
                    )
                  )
                )
              )
            )
          )
        )
      )
    );
  };

  // Initialize line-spacing if not set
  if (CONFIG.visual["line-spacing"] === undefined) {
    CONFIG.visual["line-spacing"] = 8;
  }

  // FAD (Full Screen) 확장 프로그램 감지
  const isFadActive = react.useMemo(() => {
    return !!document.getElementById("fad-ivLyrics-container");
  }, []);

  // 탭 변경 시 콘텐츠 상단으로 스크롤 또는 특정 설정으로 스크롤
  react.useEffect(() => {
    if (activeTab && activeTab !== "search") {
      // 약간의 지연 후 스크롤 (DOM 업데이트 후)
      setTimeout(() => {
        const contentArea = document.querySelector(`#${APP_NAME}-config-container .settings-content`);
        const scrollToSettingId = scrollToSettingIdRef.current;
        const isFromSearch = isNavigatingFromSearchRef.current;

        if (scrollToSettingId && isFromSearch) {
          console.log("[ivLyrics Search] Looking for setting:", scrollToSettingId);
          // 특정 설정으로 스크롤
          const targetElement = document.querySelector(`[data-setting-key="${scrollToSettingId}"]`);
          console.log("[ivLyrics Search] Found element:", targetElement);

          if (targetElement && contentArea) {
            // 컨테이너 내에서의 상대적 위치 계산
            const containerRect = contentArea.getBoundingClientRect();
            const elementRect = targetElement.getBoundingClientRect();
            const scrollTop = contentArea.scrollTop + elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2);

            // 부드럽게 스크롤
            contentArea.scrollTo({
              top: Math.max(0, scrollTop),
              behavior: "smooth"
            });

            // 빛나는 효과 적용
            targetElement.classList.add("setting-highlight-flash");
            // 2초 후 효과 제거
            setTimeout(() => {
              targetElement.classList.remove("setting-highlight-flash");
            }, 2000);
          } else {
            console.log("[ivLyrics Search] Element not found, scrolling to top");
            if (contentArea) {
              contentArea.scrollTop = 0;
            }
          }
          // ref 초기화
          scrollToSettingIdRef.current = null;
          isNavigatingFromSearchRef.current = false;
        } else if (!isFromSearch) {
          // 일반 탭 전환시 상단으로 스크롤
          if (contentArea) {
            contentArea.scrollTop = 0;
          }
        }
      }, 200);
    }
  }, [activeTab]);

  // 컴포넌트 마운트 시 저장된 폰트 설정 로드 및 Google Font 링크 추가
  react.useEffect(() => {
    const loadFont = (fontFamily, linkIdPrefix) => {
      if (!fontFamily) return;

      // Split by comma and trim whitespace to handle multiple fonts
      const fonts = fontFamily.split(",").map((f) => f.trim().replace(/['"]/g, ""));

      fonts.forEach((font) => {
        console.log(
          `[ivLyrics] Checking font: ${font} for loading`
        );

        if (font && GOOGLE_FONTS.includes(font)) {
          // Create unique ID for each font to avoid duplicates
          const fontId = font.replace(/ /g, "-").toLowerCase();
          const linkId = `ivLyrics-google-font-${fontId}`;

          let link = document.getElementById(linkId);
          if (!link) {
            link = document.createElement("link");
            link.id = linkId;
            link.rel = "stylesheet";
            document.head.appendChild(link);
            console.log(
              `[ivLyrics] Created new link element for: ${font}`
            );

            if (font === "Pretendard Variable") {
              link.href =
                "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css";
            } else {
              link.href = `https://fonts.googleapis.com/css2?family=${font.replace(
                / /g,
                "+"
              )}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
            }
            console.log(`[ivLyrics] Font link href set to: ${link.href}`);
          }
        } else {
          console.log(
            `[ivLyrics] Font ${font} not in GOOGLE_FONTS list or invalid`
          );
        }
      });
    };

    // 기본 폰트 로드 (separate-fonts가 false일 때 사용)
    const baseFont = CONFIG.visual["font-family"];
    console.log(`[ivLyrics] Base font from CONFIG: ${baseFont}`);
    loadFont(baseFont, "ivLyrics-google-font-base");

    // 원문 폰트 로드
    const originalFont = CONFIG.visual["original-font-family"];
    console.log(`[ivLyrics] Original font from CONFIG: ${originalFont}`);
    loadFont(originalFont, "ivLyrics-google-font-original");

    // 발음 폰트 로드
    const phoneticFont = CONFIG.visual["phonetic-font-family"];
    console.log(`[ivLyrics] Phonetic font from CONFIG: ${phoneticFont}`);
    loadFont(phoneticFont, "ivLyrics-google-font-phonetic");

    // 번역 폰트 로드
    const translationFont = CONFIG.visual["translation-font-family"];
    console.log(
      `[ivLyrics] Translation font from CONFIG: ${translationFont}`
    );
    loadFont(translationFont, "ivLyrics-google-font-translation");
  }, []);

  // 외관 탭으로 전환될 때 미리보기 폰트 강제 업데이트
  react.useEffect(() => {
    if (activeTab === "appearance") {
      console.log(
        `[ivLyrics] Appearance tab activated, updating preview fonts`
      );
      // 약간의 지연을 주어 DOM이 렌더링된 후 실행
      setTimeout(() => {
        const lyricsPreview = document.getElementById("lyrics-preview");
        const phoneticPreview = document.getElementById("phonetic-preview");
        const translationPreview = document.getElementById(
          "translation-preview"
        );

        const originalFont = CONFIG.visual["original-font-family"];
        const phoneticFont = CONFIG.visual["phonetic-font-family"];
        const translationFont = CONFIG.visual["translation-font-family"];

        console.log(
          `[ivLyrics] Fonts - original: ${originalFont}, phonetic: ${phoneticFont}, translation: ${translationFont}`
        );

        if (lyricsPreview) {
          // 기본값으로 초기화
          lyricsPreview.style.fontFamily = "var(--font-family)";
          // 짧은 지연 후 실제 폰트 적용
          setTimeout(() => {
            console.log(
              `[ivLyrics] Setting lyrics preview font to: ${originalFont}`
            );
            lyricsPreview.style.fontFamily =
              originalFont || "Pretendard Variable";
          }, 10);
        }

        if (phoneticPreview) {
          phoneticPreview.style.fontFamily = "var(--font-family)";
          setTimeout(() => {
            console.log(
              `[ivLyrics] Setting phonetic preview font to: ${phoneticFont}`
            );
            phoneticPreview.style.fontFamily =
              phoneticFont || "Pretendard Variable";
          }, 10);
        }

        if (translationPreview) {
          translationPreview.style.fontFamily = "var(--font-family)";
          setTimeout(() => {
            console.log(
              `[ivLyrics] Setting translation preview font to: ${translationFont}`
            );
            translationPreview.style.fontFamily =
              translationFont || "Pretendard Variable";
          }, 10);
        }
      }, 50);
    }
  }, [activeTab]);

  // 패치노트 불러오기
  useEffect(() => {
    if (activeTab === "about") {
      const loadPatchNotes = async () => {
        const container = document.getElementById("patch-notes-container");
        if (!container) return;

        try {
          const response = await fetch(
            "https://api.github.com/repos/ivLis-Studio/ivLyrics/releases/latest"
          );

          if (!response.ok) {
            throw new Error("Failed to fetch release notes");
          }

          const data = await response.json();
          const version = data.tag_name || "Unknown";
          const publishedDate = data.published_at
            ? new Date(data.published_at).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
            : "Unknown";

          // Markdown을 HTML로 변환
          let body = data.body || I18n.t("settingsAdvanced.patchNotes.empty");

          // 마크다운 변환 (순서 중요)
          body = body
            // 코드 블록 먼저 처리 (```로 감싼 부분)
            .replace(/```[\s\S]*?```/g, (match) => {
              return `<pre style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 12px 0;"><code style="font-family: monospace; font-size: 13px; color: rgba(255,255,255,0.9);">${match.slice(3, -3).trim()}</code></pre>`;
            })
            // 헤딩 처리
            .replace(/^#### (.*?)$/gm, '<h5 style="margin: 14px 0 6px; color: #ffffff; font-size: 15px; font-weight: 600;">$1</h5>')
            .replace(/^### (.*?)$/gm, '<h4 style="margin: 16px 0 8px; color: #ffffff; font-size: 16px; font-weight: 600;">$1</h4>')
            .replace(/^## (.*?)$/gm, '<h3 style="margin: 20px 0 10px; color: #ffffff; font-size: 18px; font-weight: 700;">$1</h3>')
            .replace(/^# (.*?)$/gm, '<h2 style="margin: 24px 0 12px; color: #ffffff; font-size: 20px; font-weight: 700;">$1</h2>')
            // 인라인 코드
            .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: #fbbf24;">$1</code>')
            // 볼드와 이탤릭
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // 이미지
            .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; display: block;" />')
            // 링크
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #60a5fa; text-decoration: none; border-bottom: 1px solid rgba(96, 165, 250, 0.3); transition: border-color 0.2s;" onmouseover="this.style.borderBottomColor=\'rgba(96, 165, 250, 0.8)\'" onmouseout="this.style.borderBottomColor=\'rgba(96, 165, 250, 0.3)\'">$1</a>')
            // 체크박스 리스트
            .replace(/^- \[x\] (.*?)$/gm, '<li style="margin: 6px 0; list-style: none;"><span style="color: #4ade80; margin-right: 6px;">✓</span>$1</li>')
            .replace(/^- \[ \] (.*?)$/gm, '<li style="margin: 6px 0; list-style: none;"><span style="color: rgba(255,255,255,0.3); margin-right: 6px;">○</span>$1</li>')
            // 일반 리스트 (-, *, +)
            .replace(/^[\-\*\+] (.*?)$/gm, '<li style="margin: 6px 0; padding-left: 4px;">$1</li>')
            // 숫자 리스트
            .replace(/^\d+\. (.*?)$/gm, '<li style="margin: 6px 0; padding-left: 4px;">$1</li>')
            // 블록쿼트
            .replace(/^> (.*?)$/gm, '<blockquote style="margin: 12px 0; padding-left: 16px; border-left: 3px solid rgba(96, 165, 250, 0.5); color: rgba(255,255,255,0.7); font-style: italic;">$1</blockquote>')
            // 구분선
            .replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;" />')
            .replace(/^\*\*\*$/gm, '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;" />')
            // 줄바꿈 처리 (두 번 연속된 줄바꿈은 단락 구분)
            .replace(/\n\n/g, '</p><p style="margin: 12px 0; line-height: 1.7;">');

          // li 태그들을 ul/ol로 감싸기
          body = body.replace(/(<li[^>]*>.*?<\/li>(\s|<br\/>)*)+/gs, (match) => {
            // 체크박스나 일반 리스트인 경우
            if (match.includes('list-style: none')) {
              return `<ul style="margin: 8px 0 16px; padding-left: 8px; list-style: none;">${match}</ul>`;
            }
            return `<ul style="margin: 8px 0 16px; padding-left: 24px; list-style: disc;">${match}</ul>`;
          });

          // 시작 p 태그 추가
          if (!body.startsWith('<h') && !body.startsWith('<ul') && !body.startsWith('<pre')) {
            body = `<p style="margin: 12px 0; line-height: 1.7;">${body}`;
          }
          // 끝 p 태그 추가
          if (!body.endsWith('</p>') && !body.endsWith('</ul>') && !body.endsWith('</pre>')) {
            body = `${body}</p>`;
          }

          container.style.display = "block";
          container.style.alignItems = "flex-start";
          container.style.justifyContent = "flex-start";
          container.innerHTML = `
            <div style="width: 100%;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <div>
                  <h3 style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 700;">${version}</h3>
                  <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.5);">${publishedDate}</p>
                </div>
                <a href="${data.html_url}" target="_blank" style="
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  background: rgba(255,255,255,0.05);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 8px;
                  color: #60a5fa;
                  text-decoration: none;
                  font-size: 13px;
                  font-weight: 600;
                  transition: all 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                  ${I18n.t("settingsAdvanced.aboutTab.viewOnGithub")}
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/>
                    <path d="M10.75 1a.75.75 0 000 1.5h1.69L8.22 6.72a.75.75 0 001.06 1.06l4.22-4.22v1.69a.75.75 0 001.5 0V1h-4.25z"/>
                  </svg>
                </a>
              </div>
              <div style="line-height: 1.7; color: rgba(255,255,255,0.85); font-size: 14px;">
                ${body}
              </div>
            </div>
          `;
        } catch (error) {
          console.error("Failed to load patch notes:", error);
          container.style.display = "flex";
          container.style.alignItems = "center";
          container.style.justifyContent = "center";
          container.innerHTML = `
            <div style="text-align: center; color: rgba(255,255,255,0.5);">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-bottom: 12px; opacity: 0.3;">
                <circle cx="12" cy="12" r="10" stroke-width="2"/>
                <line x1="12" y1="8" x2="12" y2="12" stroke-width="2" stroke-linecap="round"/>
                <line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <p style="margin: 0; font-size: 14px;">${I18n.t("settingsAdvanced.aboutTab.patchNotesLoadFailed")}</p>
              <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.7;">${I18n.t("settingsAdvanced.aboutTab.checkGithubReleases")}</p>
            </div>
          `;
        }
      };

      // 짧은 지연 후 로드 (DOM이 준비되도록)
      setTimeout(loadPatchNotes, 100);
    }
  }, [activeTab]);

  const HeaderSection = () => {
    return react.createElement(
      "div",
      { className: "settings-header" },
      react.createElement(
        "div",
        { className: "settings-header-content" },
        react.createElement(
          "div",
          { className: "settings-title-section" },
          react.createElement("h1", null, "ivLyrics"),
          react.createElement(
            "span",
            { className: "settings-version" },
            `v${Utils.currentVersion}`
          )
        ),
        react.createElement(
          "div",
          { className: "settings-buttons" },
          react.createElement(
            "button",
            {
              className: "settings-github-btn",
              onClick: () =>
                window.open(
                  "https://github.com/ivLis-Studio/ivLyrics",
                  "_blank"
                ),
              title: I18n.t("settingsAdvanced.aboutTab.visitGithub"),
            },
            react.createElement("svg", {
              width: 16,
              height: 16,
              viewBox: "0 0 16 16",
              fill: "currentColor",
              dangerouslySetInnerHTML: {
                __html:
                  '<path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>',
              },
            }),
            react.createElement("span", null, "GitHub")
          ),
          react.createElement(
            "button",
            {
              className: "settings-discord-btn",
              onClick: () =>
                window.open(
                  "https://ivlis.kr/ivLyrics/discord.php",
                  "_blank"
                ),
              title: I18n.t("settingsAdvanced.aboutTab.joinDiscord"),
            },
            react.createElement("svg", {
              width: 16,
              height: 16,
              viewBox: "0 0 24 24",
              fill: "currentColor",
              dangerouslySetInnerHTML: {
                __html:
                  '<path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.2 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.05-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z"/>',
              },
            }),
            react.createElement("span", null, "Discord")
          ),
          react.createElement(
            "button",
            {
              className: "settings-coffee-btn",
              onClick: () =>
                window.open(
                  "https://buymeacoffee.com/ivlis",
                  "_blank"
                ),
              title: I18n.t("settingsAdvanced.donate.title"),
            },
            react.createElement("svg", {
              width: 16,
              height: 16,
              viewBox: "0 0 24 24",
              fill: "currentColor",
              dangerouslySetInnerHTML: {
                __html:
                  '<path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/>',
              },
            }),
            react.createElement("span", null, I18n.t("settingsAdvanced.donate.button"))
          )
        )
      )
    );
  };

  const TabButton = ({ id, label, icon, isActive, onClick }) => {
    return react.createElement(
      "button",
      {
        className: `settings-tab-btn ${isActive ? "active" : ""}`,
        "data-tab-id": id,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick(id);
        },
      },
      label
    );
  };

  // 스크롤 가능한 탭 바 컴포넌트
  const ScrollableTabBar = ({ children, activeTab }) => {
    const tabsRef = react.useRef(null);
    const [showLeftArrow, setShowLeftArrow] = react.useState(false);
    const [showRightArrow, setShowRightArrow] = react.useState(false);

    const checkScrollButtons = react.useCallback(() => {
      const container = tabsRef.current;
      if (!container) return;

      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftArrow(scrollLeft > 5);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
    }, []);

    react.useEffect(() => {
      const container = tabsRef.current;
      if (!container) return;

      checkScrollButtons();
      container.addEventListener('scroll', checkScrollButtons);
      window.addEventListener('resize', checkScrollButtons);

      // ResizeObserver로 컨테이너 크기 변화 감지
      const resizeObserver = new ResizeObserver(checkScrollButtons);
      resizeObserver.observe(container);

      return () => {
        container.removeEventListener('scroll', checkScrollButtons);
        window.removeEventListener('resize', checkScrollButtons);
        resizeObserver.disconnect();
      };
    }, [checkScrollButtons]);

    // 활성 탭이 변경되면 해당 탭으로 스크롤
    react.useEffect(() => {
      const container = tabsRef.current;
      if (!container) return;

      const activeButton = container.querySelector(`[data-tab-id="${activeTab}"]`);
      if (activeButton) {
        const containerRect = container.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();

        if (buttonRect.left < containerRect.left || buttonRect.right > containerRect.right) {
          activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    }, [activeTab]);

    const scroll = (direction) => {
      const container = tabsRef.current;
      if (!container) return;

      const scrollAmount = container.clientWidth * 0.6;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    };

    return react.createElement(
      "div",
      { className: "settings-tabs-wrapper" },
      // 왼쪽 스크롤 버튼
      react.createElement(
        "button",
        {
          className: `settings-tabs-scroll-btn left ${showLeftArrow ? 'visible' : ''}`,
          onClick: () => scroll('left'),
          "aria-label": "Scroll left",
        },
        react.createElement("svg", {
          viewBox: "0 0 16 16",
          dangerouslySetInnerHTML: {
            __html: '<path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>'
          }
        })
      ),
      // 탭 컨테이너
      react.createElement(
        "div",
        { className: "settings-tabs", ref: tabsRef },
        children
      ),
      // 오른쪽 스크롤 버튼
      react.createElement(
        "button",
        {
          className: `settings-tabs-scroll-btn right ${showRightArrow ? 'visible' : ''}`,
          onClick: () => scroll('right'),
          "aria-label": "Scroll right",
        },
        react.createElement("svg", {
          viewBox: "0 0 16 16",
          dangerouslySetInnerHTML: {
            __html: '<path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>'
          }
        })
      )
    );
  };

  const TabContainer = ({ children }) => {
    return react.createElement(
      "div",
      {
        className: "settings-content",
      },
      children
    );
  };

  const SectionTitle = ({ title, subtitle }) => {
    return react.createElement(
      "div",
      { className: "section-title" },
      react.createElement(
        "div",
        { className: "section-title-content" },
        react.createElement(
          "div",
          { className: "section-text" },
          react.createElement("h3", null, title),
          subtitle && react.createElement("p", null, subtitle)
        )
      )
    );
  };

  return react.createElement(
    "div",
    {
      id: `${APP_NAME}-config-container`,
    },
    react.createElement("style", {
      dangerouslySetInnerHTML: {
        __html: `
/* ========================================
   Glassmorphism UI - Modern Design System
   ======================================== */

/* CSS Variables */
#${APP_NAME}-config-container {
    --glass-bg: rgba(255, 255, 255, 0.03);
    --glass-bg-hover: rgba(255, 255, 255, 0.06);
    --glass-bg-active: rgba(255, 255, 255, 0.08);
    --glass-border: rgba(255, 255, 255, 0.08);
    --glass-border-light: rgba(255, 255, 255, 0.12);
    --glass-blur: blur(40px);
    --accent-primary: #7c3aed;
    --accent-primary-light: rgba(124, 58, 237, 0.15);
    --accent-gradient: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%);
    --accent-glow: rgba(124, 58, 237, 0.4);
    --text-primary: #ffffff;
    --text-secondary: rgba(255, 255, 255, 0.6);
    --text-tertiary: rgba(255, 255, 255, 0.4);
    --success: #22c55e;
    --warning: #f59e0b;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 20px;
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.1);
    --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.15);
    --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.2);
    --shadow-glow: 0 0 20px var(--accent-glow);
    --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    --transition-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 전체 컨테이너 */
#${APP_NAME}-config-container {
    padding: 0;
    height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(15, 15, 20, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%);
    font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
}

/* 헤더 영역 */
#${APP_NAME}-config-container .settings-header {
    background: var(--glass-bg);
    border-bottom: 1px solid var(--glass-border);
    padding: 24px 32px 20px;
    flex-shrink: 0;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    position: relative;
}

#${APP_NAME}-config-container .settings-header::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

#${APP_NAME}-config-container .settings-header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

#${APP_NAME}-config-container .settings-title-section {
    display: flex;
    align-items: center;
    gap: 14px;
}

#${APP_NAME}-config-container .settings-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
}

#${APP_NAME}-config-container .settings-title-section h1 {
    font-size: 28px;
    font-weight: 700;
    margin: 0;
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
}

#${APP_NAME}-config-container .settings-version {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 600;
    padding: 4px 10px;
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    backdrop-filter: blur(10px);
}

#${APP_NAME}-config-container .settings-github-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    cursor: pointer;
    transition: all var(--transition-normal);
    font-size: 13px;
    font-weight: 600;
    backdrop-filter: blur(10px);
}

#${APP_NAME}-config-container .settings-github-btn:hover {
    background: var(--glass-bg-active);
    border-color: var(--glass-border-light);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
}

#${APP_NAME}-config-container .settings-github-btn:active {
    transform: translateY(0) scale(0.98);
}

#${APP_NAME}-config-container .settings-coffee-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: linear-gradient(135deg, #FFDD00 0%, #FBB034 100%);
    border: none;
    border-radius: var(--radius-md);
    color: #000000;
    cursor: pointer;
    transition: all var(--transition-normal);
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 4px 16px rgba(255, 221, 0, 0.25);
}

#${APP_NAME}-config-container .settings-coffee-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(255, 221, 0, 0.35);
}

#${APP_NAME}-config-container .settings-coffee-btn:active {
    transform: translateY(0) scale(0.98);
}

/* 탭 영역 래퍼 (스크롤 화살표 포함) */
#${APP_NAME}-config-container .settings-tabs-wrapper {
    display: flex;
    align-items: center;
    background: var(--glass-bg);
    border-bottom: 1px solid var(--glass-border);
    flex-shrink: 0;
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    position: relative;
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 40px;
    background: linear-gradient(90deg, var(--spice-player), transparent);
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
    z-index: 10;
    opacity: 0;
    pointer-events: none;
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn.right {
    background: linear-gradient(-90deg, var(--spice-player), transparent);
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn.visible {
    opacity: 1;
    pointer-events: auto;
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn:hover {
    color: var(--text-primary);
    background: linear-gradient(90deg, var(--glass-bg-hover), transparent);
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn.right:hover {
    background: linear-gradient(-90deg, var(--glass-bg-hover), transparent);
}

#${APP_NAME}-config-container .settings-tabs-scroll-btn svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
}

/* 탭 영역 */
#${APP_NAME}-config-container .settings-tabs {
    display: flex;
    gap: 6px;
    padding: 16px 16px;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-wrap: nowrap;
    flex: 1;
}

#${APP_NAME}-config-container .settings-tabs::-webkit-scrollbar {
    display: none;
}

#${APP_NAME}-config-container .settings-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 18px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-normal);
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
    min-width: fit-content;
    flex-shrink: 0;
    position: relative;
}

#${APP_NAME}-config-container .settings-tab-btn:hover {
    background: var(--glass-bg-hover);
    color: var(--text-primary);
    border-color: var(--glass-border);
}

#${APP_NAME}-config-container .settings-tab-btn.active {
    background: var(--accent-primary-light);
    color: var(--text-primary);
    border-color: var(--accent-primary);
    box-shadow: 0 0 20px rgba(124, 58, 237, 0.2);
}

#${APP_NAME}-config-container .settings-tab-btn.active::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: var(--radius-md);
    padding: 1px;
    background: var(--accent-gradient);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.5;
}

#${APP_NAME}-config-container .tab-icon {
    font-size: 14px;
}

/* 검색 영역 */
#${APP_NAME}-config-container .settings-search-container {
    padding: 16px 32px 16px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
}

#${APP_NAME}-config-container .settings-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

#${APP_NAME}-config-container .settings-search-wrapper .settings-search-input {
    width: 100% !important;
    height: 44px !important;
    padding: 0 44px 0 44px !important;
    background: var(--glass-bg-hover) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: var(--radius-md) !important;
    color: var(--text-primary) !important;
    font-size: 14px !important;
    font-weight: 400 !important;
    outline: none !important;
    transition: all var(--transition-normal) !important;
    box-sizing: border-box !important;
    backdrop-filter: blur(10px) !important;
}

#${APP_NAME}-config-container .settings-search-input:focus {
    background: var(--glass-bg-active) !important;
    border-color: var(--accent-primary) !important;
    box-shadow: 0 0 0 3px var(--accent-primary-light), var(--shadow-glow) !important;
}

#${APP_NAME}-config-container .settings-search-input::placeholder {
    color: var(--text-tertiary) !important;
}

#${APP_NAME}-config-container .settings-search-icon {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: var(--text-tertiary);
    pointer-events: none;
    transition: color var(--transition-fast);
}

#${APP_NAME}-config-container .settings-search-wrapper:focus-within .settings-search-icon {
    color: var(--accent-primary);
}

#${APP_NAME}-config-container .settings-search-clear {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--glass-bg-active);
    border: 1px solid var(--glass-border);
    border-radius: 50%;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .settings-search-wrapper:has(.settings-search-input:not(:placeholder-shown)) .settings-search-clear {
    opacity: 1;
}

#${APP_NAME}-config-container .settings-search-clear:hover {
    background: var(--accent-primary-light);
    border-color: var(--accent-primary);
    color: var(--text-primary);
}

/* 검색 결과 영역 */
#${APP_NAME}-config-container .search-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding: 14px 18px;
    background: var(--glass-bg);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(20px);
}

#${APP_NAME}-config-container .search-results-count {
    font-size: 13px;
    color: var(--text-secondary);
}

#${APP_NAME}-config-container .search-results-highlight {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 600;
}

#${APP_NAME}-config-container .search-no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
}

#${APP_NAME}-config-container .search-no-results-icon {
    width: 56px;
    height: 56px;
    margin-bottom: 20px;
    color: var(--text-tertiary);
    opacity: 0.5;
}

#${APP_NAME}-config-container .search-no-results-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px;
}

#${APP_NAME}-config-container .search-no-results-desc {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0;
}

/* 검색 결과 아이템 */
#${APP_NAME}-config-container .search-result-item {
    margin-bottom: 0;
}

#${APP_NAME}-config-container .search-result-group {
    margin-bottom: 24px;
}

#${APP_NAME}-config-container .search-result-group .option-list-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0;
}

#${APP_NAME}-config-container .search-result-section-label {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-primary);
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 5px 10px;
    background: var(--accent-primary-light);
    border: 1px solid rgba(124, 58, 237, 0.2);
    border-radius: var(--radius-sm);
    margin-bottom: 10px;
}

/* 검색 결과 하이라이트 */
#${APP_NAME}-config-container .search-highlight,
#${APP_NAME}-config-container mark.search-highlight {
    background: var(--accent-primary-light);
    color: var(--text-primary);
    border-radius: 4px;
    padding: 2px 4px;
    border: 1px solid rgba(124, 58, 237, 0.3);
}

/* 설정 항목 빛나는 효과 애니메이션 */
@keyframes settingFlash {
    0% {
        background-color: var(--accent-primary-light);
        box-shadow: var(--shadow-glow);
    }
    50% {
        background-color: rgba(124, 58, 237, 0.1);
        box-shadow: 0 0 10px rgba(124, 58, 237, 0.2);
    }
    100% {
        background-color: transparent;
        box-shadow: none;
    }
}

#${APP_NAME}-config-container .setting-row.setting-highlight-flash {
    animation: settingFlash 2s ease-out;
    border-radius: var(--radius-md);
}

/* 콘텐츠 영역 */
#${APP_NAME}-config-container .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px 40px;
    background: transparent;
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar {
    width: 8px;
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar-track {
    background: transparent;
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar-thumb {
    background: var(--glass-border);
    border-radius: 4px;
    transition: background var(--transition-fast);
}

#${APP_NAME}-config-container .settings-content::-webkit-scrollbar-thumb:hover {
    background: var(--glass-border-light);
}

#${APP_NAME}-config-container .tab-content {
    display: none;
}

#${APP_NAME}-config-container .tab-content.active {
    display: block;
    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* 섹션 타이틀 - Glassmorphism 카드 */
#${APP_NAME}-config-container .section-title {
    margin: 28px 0 0;
    padding: 18px 20px 14px;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-top-left-radius: var(--radius-lg);
    border-top-right-radius: var(--radius-lg);
    border: 1px solid var(--glass-border);
    border-bottom: none;
    position: relative;
    overflow: hidden;
}

#${APP_NAME}-config-container .section-title::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-border-light), transparent);
}

#${APP_NAME}-config-container .section-title:first-child {
    margin-top: 0;
}

#${APP_NAME}-config-container .section-title-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

#${APP_NAME}-config-container .section-icon {
    display: none;
}

#${APP_NAME}-config-container .section-text h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
}

#${APP_NAME}-config-container .section-text p {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
}

/* 설정 행 - Glassmorphism */
#${APP_NAME}-config-container .setting-row {
    padding: 0;
    margin: 0;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-left: 1px solid var(--glass-border);
    border-right: 1px solid var(--glass-border);
    border-radius: 0;
    border-bottom: 1px solid var(--glass-border);
    transition: all var(--transition-fast);
    position: relative;
}

/* Wrapper를 통한 그룹화 */
#${APP_NAME}-config-container .option-list-wrapper,
#${APP_NAME}-config-container .service-list-wrapper {
    display: contents;
}

/* 섹션 타이틀 바로 다음의 wrapper의 첫 번째 항목 */
#${APP_NAME}-config-container .section-title + .option-list-wrapper > .setting-row:first-child,
#${APP_NAME}-config-container .section-title + .service-list-wrapper > .setting-row:first-child {
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
}

/* wrapper 내의 마지막 항목 */
#${APP_NAME}-config-container .option-list-wrapper > .setting-row:last-child,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row:last-child {
    border-bottom-left-radius: var(--radius-lg);
    border-bottom-right-radius: var(--radius-lg);
    border-bottom: 1px solid var(--glass-border);
}

/* service-token-input-wrapper가 있는 경우 */
#${APP_NAME}-config-container .service-list-wrapper > .setting-row:has(+ .service-token-input-wrapper) {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
}

#${APP_NAME}-config-container .service-list-wrapper > .service-token-input-wrapper:last-child {
    border-bottom-left-radius: var(--radius-lg);
    border-bottom-right-radius: var(--radius-lg);
    border-bottom: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .service-list-wrapper > .service-token-input-wrapper + .setting-row {
    border-top: none;
}

/* wrapper 내에 항목이 하나만 있을 때 */
#${APP_NAME}-config-container .option-list-wrapper > .setting-row:only-child,
#${APP_NAME}-config-container .service-list-wrapper > .setting-row:only-child {
    border-top: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    border-bottom: 1px solid var(--glass-border);
}

/* update-result-container가 있을 때 */
#${APP_NAME}-config-container .setting-row:has(+ #update-result-container) {
    border-bottom-left-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
    border-bottom: 1px solid var(--glass-border) !important;
}

/* font-preview-container */
#${APP_NAME}-config-container .font-preview-container {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    padding: 0;
    margin-bottom: 28px;
}

#${APP_NAME}-config-container .setting-row:hover {
    background: var(--glass-bg-hover);
}

#${APP_NAME}-config-container .setting-row:active {
    background: var(--glass-bg-active);
}

#${APP_NAME}-config-container .setting-row-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 14px 20px;
    min-height: 52px;
}

#${APP_NAME}-config-container .setting-row-left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

#${APP_NAME}-config-container .setting-name {
    font-weight: 500;
    font-size: 14px;
    color: var(--text-primary);
    line-height: 1.4;
    letter-spacing: -0.01em;
}

#${APP_NAME}-config-container .setting-description {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
}

#${APP_NAME}-config-container .setting-row-right {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

/* 슬라이더 컨트롤 */
#${APP_NAME}-config-container .slider-container {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 280px;
    position: relative;
}

#${APP_NAME}-config-container .config-slider {
    flex: 1;
    height: 28px;
    background: transparent;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    margin: 0;
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 6px;
    background: var(--glass-bg-active);
    border-radius: 3px;
    transition: background var(--transition-fast);
}

#${APP_NAME}-config-container .config-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--accent-gradient);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
    margin-top: -7px;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .config-slider:hover::-webkit-slider-thumb {
    transform: scale(1.15);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.5);
}

#${APP_NAME}-config-container .config-slider:active::-webkit-slider-thumb {
    transform: scale(1.05);
}

/* Firefox Styles */
#${APP_NAME}-config-container .config-slider::-moz-range-track {
    width: 100%;
    height: 6px;
    background: var(--glass-bg-active);
    border-radius: 3px;
    border: none;
}

#${APP_NAME}-config-container .config-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--accent-gradient);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
}

#${APP_NAME}-config-container .slider-value {
    min-width: 56px;
    text-align: center;
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    padding: 6px 10px;
    border-radius: var(--radius-sm);
}

/* 조정 버튼 (+ -) */
#${APP_NAME}-config-container .adjust-container {
    display: flex;
    align-items: center;
    gap: 8px;
}

#${APP_NAME}-config-container .adjust-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    color: var(--accent-primary);
    font-size: 18px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    user-select: none;
}

#${APP_NAME}-config-container .adjust-button:hover {
    background: var(--accent-primary-light);
    border-color: var(--accent-primary);
    transform: scale(1.05);
}

#${APP_NAME}-config-container .adjust-button:active {
    transform: scale(0.95);
}

#${APP_NAME}-config-container .adjust-value {
    min-width: 56px;
    text-align: center;
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

/* 스왑 버튼 */
#${APP_NAME}-config-container .swap-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .swap-button:hover {
    background: var(--accent-primary-light);
    border-color: var(--accent-primary);
}

#${APP_NAME}-config-container .swap-button:active {
    transform: scale(0.95);
}

#${APP_NAME}-config-container .swap-button svg {
    width: 14px;
    height: 14px;
    fill: var(--text-primary);
}

/* 컬러피커 */
#${APP_NAME}-config-container .color-picker-container {
    display: flex;
    align-items: center;
    gap: 12px;
}

#${APP_NAME}-config-container .config-color-picker {
    width: 44px;
    height: 36px;
    padding: 3px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
}

#${APP_NAME}-config-container .config-color-picker:hover {
    border-color: var(--glass-border-light);
    transform: scale(1.05);
}

#${APP_NAME}-config-container .config-color-picker:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-primary-light);
    outline: none;
}

#${APP_NAME}-config-container .config-color-input {
    width: 100px !important;
    background: var(--glass-bg-hover) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: var(--radius-sm) !important;
    padding: 8px 12px !important;
    font-size: 12px !important;
    color: var(--text-primary) !important;
    font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
    text-transform: uppercase !important;
}

/* 입력 필드 - Glassmorphism */
#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input),
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input),
#${APP_NAME}-config-container input:not(.settings-search-input),
#${APP_NAME}-config-container textarea {
    background: var(--glass-bg-hover) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: var(--radius-md) !important;
    padding: 10px 14px !important;
    width: min(280px, 100%) !important;
    outline: none !important;
    color: var(--text-primary) !important;
    transition: all var(--transition-normal) !important;
    font-size: 14px !important;
    font-family: inherit !important;
    min-height: 40px !important;
    box-sizing: border-box !important;
    font-weight: 400 !important;
    backdrop-filter: blur(10px) !important;
}

#${APP_NAME}-config-container select {
    background: var(--glass-bg-hover) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: var(--radius-md) !important;
    padding: 10px 36px 10px 14px !important;
    width: 180px !important;
    outline: none !important;
    color: var(--text-primary) !important;
    transition: all var(--transition-normal) !important;
    font-size: 14px !important;
    font-family: inherit !important;
    min-height: 40px !important;
    height: auto !important;
    box-sizing: border-box !important;
    appearance: none !important;
    background-image: url('data:image/svg+xml;utf8,<svg fill="%237c3aed" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M3 6l5 5.794L13 6z"/></svg>') !important;
    background-repeat: no-repeat !important;
    background-position: right 12px center !important;
    cursor: pointer !important;
    font-weight: 500 !important;
    backdrop-filter: blur(10px) !important;
}

#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input):hover,
#${APP_NAME}-config-container input:not(.settings-search-input):hover,
#${APP_NAME}-config-container select:hover,
#${APP_NAME}-config-container textarea:hover {
    background: var(--glass-bg-active) !important;
    border-color: var(--glass-border-light) !important;
}

#${APP_NAME}-config-container input[type="text"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container input[type="password"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container input[type="number"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container input[type="url"]:not(.settings-search-input):focus,
#${APP_NAME}-config-container input:not(.settings-search-input):focus,
#${APP_NAME}-config-container select:focus,
#${APP_NAME}-config-container textarea:focus {
    background: var(--glass-bg-active) !important;
    border-color: var(--accent-primary) !important;
    box-shadow: 0 0 0 3px var(--accent-primary-light), var(--shadow-glow) !important;
}

#${APP_NAME}-config-container input::placeholder,
#${APP_NAME}-config-container textarea::placeholder {
    color: var(--text-tertiary) !important;
    opacity: 1 !important;
}

#${APP_NAME}-config-container select option {
    background-color: #1a1a1f;
    color: var(--text-primary);
    padding: 10px 14px;
}

/* 버튼 스타일 - Glassmorphism */
#${APP_NAME}-config-container .switch,
#${APP_NAME}-config-container .btn {
    height: 40px;
    min-width: 80px;
    border-radius: var(--radius-md);
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    cursor: pointer;
    transition: all var(--transition-normal);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    font-size: 13px;
    padding: 0 18px;
    backdrop-filter: blur(10px);
}

/* 토글 스위치 - Glassmorphism */
#${APP_NAME}-config-container .switch-checkbox {
    width: 52px;
    height: 28px;
    border-radius: 14px;
    background: var(--glass-bg-active);
    border: 1px solid var(--glass-border);
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    transition: all var(--transition-normal);
    -webkit-tap-highlight-color: transparent;
    outline: none;
    overflow: hidden;
}

#${APP_NAME}-config-container .switch-checkbox::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--text-primary);
    box-shadow: var(--shadow-sm);
    transition: all var(--transition-normal);
    will-change: transform;
    transform: translateX(0);
}

#${APP_NAME}-config-container .switch-checkbox:hover {
    border-color: var(--glass-border-light);
}

#${APP_NAME}-config-container .switch-checkbox.active {
    background: var(--accent-gradient);
    border-color: transparent;
    box-shadow: 0 0 16px rgba(124, 58, 237, 0.4);
}

#${APP_NAME}-config-container .switch-checkbox.active::after {
    transform: translateX(24px);
}

#${APP_NAME}-config-container .switch-checkbox svg {
    display: none !important;
    visibility: hidden !important;
    position: absolute;
    pointer-events: none;
}

#${APP_NAME}-config-container .switch {
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
}

#${APP_NAME}-config-container .switch:hover {
    background: var(--glass-bg-active);
    border-color: var(--glass-border-light);
}

#${APP_NAME}-config-container .switch.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

#${APP_NAME}-config-container .btn {
    background: var(--glass-bg-hover);
    border: 1px solid var(--glass-border);
    color: var(--text-primary);
    font-weight: 500;
    padding: 0 18px;
    position: relative;
    overflow: hidden;
}

#${APP_NAME}-config-container .btn::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--accent-gradient);
    opacity: 0;
    transition: opacity var(--transition-fast);
}

#${APP_NAME}-config-container .btn:hover:not(:disabled) {
    background: var(--glass-bg-active);
    border-color: var(--accent-primary);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
}

#${APP_NAME}-config-container .btn:hover:not(:disabled)::before {
    opacity: 0.1;
}

#${APP_NAME}-config-container .btn:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
}

#${APP_NAME}-config-container .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* 프라이머리 버튼 */
#${APP_NAME}-config-container .btn-primary {
    background: var(--accent-gradient) !important;
    border: none !important;
    color: white !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.3);
}

#${APP_NAME}-config-container .btn-primary:hover:not(:disabled) {
    box-shadow: 0 6px 24px rgba(124, 58, 237, 0.4);
    transform: translateY(-2px);
}

/* 글꼴 미리보기 */
#${APP_NAME}-config-container .font-preview {
    background: transparent;
    border: none;
    padding: 24px;
}

#${APP_NAME}-config-container #lyrics-preview,
#${APP_NAME}-config-container #translation-preview {
    transition: all var(--transition-fast);
}

/* 정보 박스 */
#${APP_NAME}-config-container .info-box {
    padding: 20px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    margin-bottom: 24px;
    backdrop-filter: var(--glass-blur);
}

#${APP_NAME}-config-container .info-box h3 {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

#${APP_NAME}-config-container .info-box p {
    margin: 0 0 8px;
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: 13px;
}

#${APP_NAME}-config-container .info-box p:last-child {
    margin-bottom: 0;
}

/* 추가 애니메이션 */
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

/* 호버 시 빛나는 효과 */
#${APP_NAME}-config-container .setting-row::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.03), transparent);
    opacity: 0;
    transition: opacity var(--transition-normal);
    pointer-events: none;
}

#${APP_NAME}-config-container .setting-row:hover::after {
    opacity: 1;
}
`,
      },
    }),
    react.createElement(HeaderSection),
    react.createElement(
      ScrollableTabBar,
      { activeTab },
      react.createElement(TabButton, {
        id: "general",
        label: I18n.t("tabs.general"),
        icon: "",
        isActive: activeTab === "general",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "appearance",
        label: I18n.t("tabs.appearance"),
        icon: "",
        isActive: activeTab === "appearance",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "lyrics",
        label: I18n.t("tabs.behavior"),
        icon: "",
        isActive: activeTab === "lyrics",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "translation",
        label: I18n.t("tabs.providers"),
        icon: "",
        isActive: activeTab === "translation",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "advanced",
        label: I18n.t("tabs.advanced"),
        icon: "",
        isActive: activeTab === "advanced",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "fullscreen",
        label: I18n.t("tabs.fullscreen"),
        icon: "",
        isActive: activeTab === "fullscreen",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "nowplaying",
        label: I18n.t("tabs.nowplaying"),
        icon: "",
        isActive: activeTab === "nowplaying",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "debug",
        label: I18n.t("tabs.debug"),
        icon: "",
        isActive: activeTab === "debug",
        onClick: setActiveTab,
      }),
      react.createElement(TabButton, {
        id: "about",
        label: I18n.t("tabs.about"),
        icon: "",
        isActive: activeTab === "about",
        onClick: setActiveTab,
      })
    ),
    // 검색창
    react.createElement(
      "div",
      { className: "settings-search-container" },
      react.createElement(
        "div",
        { className: "settings-search-wrapper" },
        react.createElement(
          "svg",
          {
            className: "settings-search-icon",
            viewBox: "0 0 20 20",
            fill: "currentColor",
          },
          react.createElement("path", {
            fillRule: "evenodd",
            d: "M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z",
            clipRule: "evenodd",
          })
        ),
        react.createElement("input", {
          type: "text",
          className: "settings-search-input",
          placeholder: I18n.t("search.placeholder"),
          value: searchQuery,
          onChange: handleSearchChange,
        }),
        searchQuery && react.createElement(
          "button",
          {
            className: "settings-search-clear",
            onClick: handleClearSearch,
            title: I18n.t("search.clear"),
          },
          "×"
        )
      )
    ),
    react.createElement(
      TabContainer,
      null,
      // 검색 결과 탭
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "search" ? "active" : ""}`,
        },
        react.createElement(SearchResults)
      ),
      // 일반 탭 (동작 관련 설정)
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "general" ? "active" : ""}`,
        },
        // 언어 설정 섹션
        react.createElement(SectionTitle, {
          title: I18n.t("sections.language"),
          subtitle: I18n.t("settings.language.desc"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.language.label") + " (Language)",
              key: "language",
              info: I18n.t("settings.language.desc"),
              type: ConfigSelection,
              options: {
                ko: "한국어",
                en: "English",
                "zh-CN": "简体中文",
                "zh-TW": "繁體中文",
                ja: "日本語",
                hi: "हिन्दी",
                es: "Español",
                fr: "Français",
                ar: "العربية",
                fa: "فارسی",
                de: "Deutsch",
                ru: "Русский",
                pt: "Português",
                bn: "বাংলা",
                it: "Italiano",
                th: "ภาษาไทย",
                vi: "Tiếng Việt",
                id: "Bahasa Indonesia",
              },
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            // I18n 시스템에도 언어 변경 알림
            if (window.I18n && window.I18n.setLanguage) {
              window.I18n.setLanguage(value);
            }
            // 설정 페이지로 돌아오기 위해 플래그 저장
            localStorage.setItem("ivLyrics:return-to-settings", "true");
            // 자동 새로고침
            location.reload();
          },
        }),
        // 데스크탑 오버레이 섹션
        react.createElement(SectionTitle, {
          title: I18n.t("sections.desktopOverlay"),
          subtitle: I18n.t("sections.desktopOverlaySubtitle"),
        }),
        react.createElement(OverlaySettings),
        react.createElement(SectionTitle, {
          title: I18n.t("sections.visualEffects"),
          subtitle: I18n.t("sections.visualEffectsSubtitle"),
        }),
        // FAD 경고 메시지
        isFadActive &&
        react.createElement(
          "div",
          {
            className: "setting-row",
            style: {
              backgroundColor: "rgba(var(--spice-rgb-warning), 0.1)",
            },
          },
          react.createElement(
            "div",
            { className: "setting-row-content" },
            react.createElement(
              "div",
              { className: "setting-row-left" },
              react.createElement(
                "div",
                {
                  className: "setting-name",
                  style: { color: "var(--spice-text)", fontWeight: "600" },
                },
                I18n.t("sections.fadWarningTitle")
              ),
              react.createElement(
                "div",
                {
                  className: "setting-description",
                  style: { color: "var(--spice-subtext)" },
                },
                I18n.t("sections.fadWarningDesc"),
                react.createElement("br"),
                I18n.t("sections.fadWarningTip")
              )
            )
          )
        ),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.alignment.label"),
              key: "alignment",
              info: I18n.t("settings.alignment.desc"),
              type: ConfigSelection,
              disabled: isFadActive,
              options: {
                left: I18n.t("settings.alignment.options.left"),
                center: I18n.t("settings.alignment.options.center"),
                right: I18n.t("settings.alignment.options.right"),
              },
            },
            {
              desc: I18n.t("settings.noise.label"),
              key: "noise",
              info: I18n.t("settings.noise.desc"),
              type: ConfigSlider,
              disabled: isFadActive,
            },
            {
              desc: I18n.t("settings.colorful.label"),
              key: "colorful",
              info: I18n.t("settings.colorful.desc"),
              type: ConfigSlider,
              disabled: isFadActive,
            },
            {
              desc: I18n.t("settings.gradientBackground.label"),
              info: I18n.t("settings.gradientBackground.desc"),
              key: "gradient-background",
              type: ConfigSlider,
              disabled: isFadActive,
            },
            {
              desc: I18n.t("settings.solidBackground.label"),
              info: I18n.t("settings.solidBackground.desc"),
              key: "solid-background",
              type: ConfigSlider,
              disabled: isFadActive,
            },
            {
              desc: I18n.t("settings.solidBackgroundColor.label"),
              key: "solid-background-color",
              info: I18n.t("settings.solidBackgroundColor.desc"),
              type: ColorPresetSelector,
              disabled: isFadActive,
              when: () => CONFIG.visual["solid-background"],
            },
            {
              desc: I18n.t("settings.videoBackground.label"),
              info: I18n.t("settings.videoBackground.desc"),
              key: "video-background",
              type: ConfigSlider,
              disabled: isFadActive,
            },
            {
              desc: I18n.t("settings.videoHelper.label"),
              info: I18n.t("settings.videoHelper.desc"),
              key: "video-helper-enabled",
              type: VideoHelperToggle,
              disabled: isFadActive,
              when: () => CONFIG.visual["video-background"],
            },
            {
              desc: "",
              key: "video-helper-info",
              type: ConfigInfo,
              message: I18n.t("settings.videoHelper.info"),
              buttonText: I18n.t("settings.videoHelper.download"),
              onButtonClick: () => {
                window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank");
              },
              when: () => CONFIG.visual["video-background"] && !CONFIG.visual["video-helper-enabled"],
            },
            {
              desc: I18n.t("settings.videoBlur.label"),
              info: I18n.t("settings.videoBlur.desc"),
              key: "video-blur",
              type: ConfigSliderRange,
              disabled: isFadActive,
              when: () => CONFIG.visual["video-background"],
              min: 0,
              max: 40,
              step: 1,
              unit: "px",
            },
            {
              desc: I18n.t("settings.videoCover.label"),
              info: I18n.t("settings.videoCover.desc"),
              key: "video-cover",
              type: ConfigSlider,
              disabled: isFadActive,
              when: () => CONFIG.visual["video-background"],
            },
            {
              desc: "",
              key: "solid-background-warning",
              type: ConfigWarning,
              message: I18n.t("settings.solidBackgroundWarning"),
              when: () => CONFIG.visual["solid-background"],
            },
            {
              desc: I18n.t("settings.backgroundBrightness.label"),
              key: "background-brightness",
              info: I18n.t("settings.backgroundBrightness.desc"),
              type: ConfigSliderRange,
              disabled: () => isFadActive || CONFIG.visual["solid-background"],
              min: 0,
              max: 100,
              step: 1,
              unit: "%",
            },
          ],
          onChange: (name, value) => {
            // 컬러풀 배경, 앨범 커버 배경, 단색 배경, 동영상 배경은 상호 배타적으로 동작
            if (name === "colorful" && value) {
              CONFIG.visual["gradient-background"] = false;
              CONFIG.visual["solid-background"] = false;
              CONFIG.visual["video-background"] = false;
              StorageManager.saveConfig("gradient-background", false);
              StorageManager.saveConfig("solid-background", false);
              StorageManager.saveConfig("video-background", false);
            } else if (name === "gradient-background" && value) {
              CONFIG.visual["colorful"] = false;
              CONFIG.visual["solid-background"] = false;
              CONFIG.visual["video-background"] = false;
              StorageManager.saveConfig("colorful", false);
              StorageManager.saveConfig("solid-background", false);
              StorageManager.saveConfig("video-background", false);
            } else if (name === "solid-background" && value) {
              CONFIG.visual["colorful"] = false;
              CONFIG.visual["gradient-background"] = false;
              CONFIG.visual["video-background"] = false;
              StorageManager.saveConfig("colorful", false);
              StorageManager.saveConfig("gradient-background", false);
              StorageManager.saveConfig("video-background", false);
            } else if (name === "video-background" && value) {
              CONFIG.visual["colorful"] = false;
              CONFIG.visual["gradient-background"] = false;
              CONFIG.visual["solid-background"] = false;
              StorageManager.saveConfig("colorful", false);
              StorageManager.saveConfig("gradient-background", false);
              StorageManager.saveConfig("solid-background", false);
            }

            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            const configChange = new CustomEvent("ivLyrics", {
              detail: {
                type: "config",
                name: name,
                value: value,
              },
            });
            window.dispatchEvent(configChange);
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.syncMode.title"),
          subtitle: I18n.t("settingsAdvanced.syncMode.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.syncMode.linesBefore.label"),
              key: "lines-before",
              info: I18n.t("settingsAdvanced.syncMode.linesBefore.desc"),
              type: ConfigSelection,
              options: [0, 1, 2, 3, 4],
            },
            {
              desc: I18n.t("settingsAdvanced.syncMode.linesAfter.label"),
              key: "lines-after",
              info: I18n.t("settingsAdvanced.syncMode.linesAfter.desc"),
              type: ConfigSelection,
              options: [0, 1, 2, 3, 4],
            },
            {
              desc: I18n.t("settingsAdvanced.syncMode.fadeoutBlur.label"),
              key: "fade-blur",
              info: I18n.t("settingsAdvanced.syncMode.fadeoutBlur.desc"),
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.syncMode.highlightMode.label"),
              key: "highlight-mode",
              info: I18n.t("settingsAdvanced.syncMode.highlightMode.desc"),
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.syncMode.highlightIntensity.label"),
              key: "highlight-intensity",
              info: I18n.t("settingsAdvanced.syncMode.highlightIntensity.desc"),
              type: ConfigSliderRange,
              min: 30,
              max: 90,
              step: 5,
              unit: "%",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            const configChange = new CustomEvent("ivLyrics", {
              detail: {
                type: "config",
                name: name,
                value: value,
              },
            });
            window.dispatchEvent(configChange);
          },
        })
      ),
      // 외관 탭 (시각 효과 + 타이포그래피)
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "appearance" ? "active" : ""
            }`,
        },
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.livePreview.title"),
          subtitle: I18n.t("settingsAdvanced.livePreview.subtitle"),
        }),
        react.createElement(
          "div",
          {
            className: "font-preview-container",
          },
          react.createElement(
            "div",
            {
              className: "font-preview",
            },
            react.createElement(
              "div",
              {
                id: "lyrics-preview",
                style: {
                  fontSize: `${CONFIG.visual["original-font-size"] || 20}px`,
                  fontWeight: CONFIG.visual["original-font-weight"] || "400",
                  fontFamily:
                    CONFIG.visual["original-font-family"] ||
                    "Pretendard Variable",
                  textAlign: CONFIG.visual["alignment"] || "left",
                  opacity: (CONFIG.visual["original-opacity"] || 100) / 100,
                  letterSpacing: `${CONFIG.visual["original-letter-spacing"] || 0}px`,
                  textShadow: CONFIG.visual["text-shadow-enabled"]
                    ? `0 0 ${CONFIG.visual["text-shadow-blur"] || 2}px ${CONFIG.visual["text-shadow-color"] || "#000000"
                    }${Math.round(
                      (CONFIG.visual["text-shadow-opacity"] || 50) * 2.55
                    )
                      .toString(16)
                      .padStart(2, "0")}`
                    : "none",
                },
              },
              I18n.t("settingsAdvanced.livePreview.sampleTextMixed")
            ),
            react.createElement(
              "div",
              {
                id: "phonetic-preview",
                style: {
                  fontSize: `${CONFIG.visual["phonetic-font-size"] || 20}px`,
                  fontWeight: CONFIG.visual["phonetic-font-weight"] || "400",
                  fontFamily:
                    CONFIG.visual["phonetic-font-family"] ||
                    "Pretendard Variable",
                  textAlign: CONFIG.visual["alignment"] || "left",
                  lineHeight: "1.3",
                  opacity: (CONFIG.visual["phonetic-opacity"] || 70) / 100,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: `${(parseInt(CONFIG.visual["phonetic-spacing"]) || 4) - 10
                    }px`,
                  letterSpacing: `${CONFIG.visual["phonetic-letter-spacing"] || 0}px`,
                  textShadow: CONFIG.visual["text-shadow-enabled"]
                    ? `0 0 ${CONFIG.visual["text-shadow-blur"] || 2}px ${CONFIG.visual["text-shadow-color"] || "#000000"
                    }${Math.round(
                      (CONFIG.visual["text-shadow-opacity"] || 50) * 2.55
                    )
                      .toString(16)
                      .padStart(2, "0")}`
                    : "none",
                },
              },
              I18n.t("settingsAdvanced.livePreview.sampleTextPhonetic")
            ),
            react.createElement(
              "div",
              {
                id: "translation-preview",
                style: {
                  fontSize: `${CONFIG.visual["translation-font-size"] || 16}px`,
                  fontWeight: CONFIG.visual["translation-font-weight"] || "400",
                  fontFamily:
                    CONFIG.visual["translation-font-family"] ||
                    "Pretendard Variable",
                  textAlign: CONFIG.visual["alignment"] || "left",
                  lineHeight: "1.4",
                  opacity: (CONFIG.visual["translation-opacity"] || 100) / 100,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: `${parseInt(CONFIG.visual["translation-spacing"]) || 8
                    }px`,
                  letterSpacing: `${CONFIG.visual["translation-letter-spacing"] || 0}px`,
                  textShadow: CONFIG.visual["text-shadow-enabled"]
                    ? `0 0 ${CONFIG.visual["text-shadow-blur"] || 2}px ${CONFIG.visual["text-shadow-color"] || "#000000"
                    }${Math.round(
                      (CONFIG.visual["text-shadow-opacity"] || 50) * 2.55
                    )
                      .toString(16)
                      .padStart(2, "0")}`
                    : "none",
                },
              },
              I18n.t("settingsAdvanced.livePreview.sampleText")
            )
          )
        ),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.originalStyle.title"),
          subtitle: I18n.t("settingsAdvanced.originalStyle.subtitle"),
        }),
        react.createElement(
          "div",
          { className: "setting-row" },
          react.createElement(
            "div",
            { className: "setting-row-content" },
            react.createElement(
              "div",
              { className: "setting-row-left" },
              react.createElement(
                "div",
                { className: "setting-name" },
                I18n.t("settingsAdvanced.originalStyle.fontFamily")
              ),
              react.createElement(
                "div",
                { className: "setting-description" },
                I18n.t("settingsAdvanced.originalStyle.fontFamilyDesc")
              )
            ),
            react.createElement(
              "div",
              { className: "setting-row-right font-selector-container" },
              react.createElement(ConfigFontSelector, {
                name: "",
                defaultValue:
                  CONFIG.visual["original-font-family"] ||
                  "Pretendard Variable",
                onChange: (_, value) => {
                  CONFIG.visual["original-font-family"] = value;
                  StorageManager.setItem(
                    `${APP_NAME}:visual:original-font-family`,
                    value
                  );

                  if (value) {
                    const fonts = value.split(",").map((f) => f.trim().replace(/['"]/g, ""));
                    fonts.forEach((font) => {
                      if (font && GOOGLE_FONTS.includes(font)) {
                        const fontId = font.replace(/ /g, "-").toLowerCase();
                        const linkId = `ivLyrics-google-font-${fontId}`;

                        let link = document.getElementById(linkId);
                        if (!link) {
                          link = document.createElement("link");
                          link.id = linkId;
                          link.rel = "stylesheet";
                          document.head.appendChild(link);
                        }
                        if (font === "Pretendard Variable") {
                          link.href =
                            "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css";
                        } else {
                          link.href = `https://fonts.googleapis.com/css2?family=${font.replace(
                            / /g,
                            "+"
                          )}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
                        }
                      }
                    });
                  }

                  const lyricsPreview =
                    document.getElementById("lyrics-preview");
                  if (lyricsPreview) {
                    lyricsPreview.style.fontFamily = value;
                  }

                  lyricContainerUpdate?.();
                  window.dispatchEvent(
                    new CustomEvent("ivLyrics", {
                      detail: {
                        type: "config",
                        name: "original-font-family",
                        value,
                      },
                    })
                  );
                },
              })
            )
          )
        ),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.originalStyle.fontSize.label"),
              info: I18n.t("settingsAdvanced.originalStyle.fontSize.desc"),
              key: "original-font-size",
              type: ConfigSliderRange,
              min: 12,
              max: 128,
              step: 2,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.originalStyle.fontWeight.label"),
              info: I18n.t("settingsAdvanced.originalStyle.fontWeight.desc"),
              key: "original-font-weight",
              type: ConfigSelection,
              options: {
                100: "Thin (100)",
                200: "Extra Light (200)",
                300: "Light (300)",
                400: "Regular (400)",
                500: "Medium (500)",
                600: "Semi Bold (600)",
                700: "Bold (700)",
                800: "Extra Bold (800)",
                900: "Black (900)",
              },
            },
            {
              desc: I18n.t("settingsAdvanced.originalStyle.opacity.label"),
              info: I18n.t("settingsAdvanced.originalStyle.opacity.desc"),
              key: "original-opacity",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
            },
            {
              desc: I18n.t("settingsAdvanced.originalStyle.letterSpacing.label"),
              info: I18n.t("settingsAdvanced.originalStyle.letterSpacing.desc"),
              key: "original-letter-spacing",
              type: ConfigSliderRange,
              min: -5,
              max: 20,
              step: 0.5,
              unit: "px",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
            const lyricsPreview = document.getElementById("lyrics-preview");
            if (lyricsPreview) {
              if (name === "original-font-size")
                lyricsPreview.style.fontSize = `${value}px`;
              if (name === "original-font-weight")
                lyricsPreview.style.fontWeight = value;
              if (name === "original-opacity")
                lyricsPreview.style.opacity = value / 100;
              if (name === "original-letter-spacing")
                lyricsPreview.style.letterSpacing = `${value}px`;
            }
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.pronunciationStyle.title"),
          subtitle: I18n.t("settingsAdvanced.pronunciationStyle.subtitle"),
        }),
        react.createElement(
          "div",
          { className: "setting-row" },
          react.createElement(
            "div",
            { className: "setting-row-content" },
            react.createElement(
              "div",
              { className: "setting-row-left" },
              react.createElement(
                "div",
                { className: "setting-name" },
                I18n.t("settingsAdvanced.originalStyle.fontFamily")
              ),
              react.createElement(
                "div",
                { className: "setting-description" },
                I18n.t("settingsAdvanced.pronunciationStyle.fontFamilyDesc")
              )
            ),
            react.createElement(
              "div",
              { className: "setting-row-right font-selector-container" },
              react.createElement(ConfigFontSelector, {
                name: "",
                defaultValue:
                  CONFIG.visual["phonetic-font-family"] ||
                  "Pretendard Variable",
                onChange: (_, value) => {
                  CONFIG.visual["phonetic-font-family"] = value;
                  StorageManager.setItem(
                    `${APP_NAME}:visual:phonetic-font-family`,
                    value
                  );

                  if (value) {
                    const fonts = value.split(",").map((f) => f.trim().replace(/['"]/g, ""));
                    fonts.forEach((font) => {
                      if (font && GOOGLE_FONTS.includes(font)) {
                        const fontId = font.replace(/ /g, "-").toLowerCase();
                        const linkId = `ivLyrics-google-font-${fontId}`;

                        let link = document.getElementById(linkId);
                        if (!link) {
                          link = document.createElement("link");
                          link.id = linkId;
                          link.rel = "stylesheet";
                          document.head.appendChild(link);
                        }
                        if (font === "Pretendard Variable") {
                          link.href =
                            "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css";
                        } else {
                          link.href = `https://fonts.googleapis.com/css2?family=${font.replace(
                            / /g,
                            "+"
                          )}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
                        }
                      }
                    });
                  }

                  const phoneticPreview =
                    document.getElementById("phonetic-preview");
                  if (phoneticPreview) {
                    phoneticPreview.style.fontFamily = value;
                  }

                  lyricContainerUpdate?.();
                  window.dispatchEvent(
                    new CustomEvent("ivLyrics", {
                      detail: {
                        type: "config",
                        name: "phonetic-font-family",
                        value,
                      },
                    })
                  );
                },
              })
            )
          )
        ),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.originalStyle.fontSize.label"),
              info: I18n.t("settingsAdvanced.pronunciationStyle.fontSize.desc"),
              key: "phonetic-font-size",
              type: ConfigSliderRange,
              min: 10,
              max: 96,
              step: 2,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.originalStyle.fontWeight.label"),
              info: I18n.t("settingsAdvanced.pronunciationStyle.fontWeight.desc"),
              key: "phonetic-font-weight",
              type: ConfigSelection,
              options: {
                100: "Thin (100)",
                200: "Extra Light (200)",
                300: "Light (300)",
                400: "Regular (400)",
                500: "Medium (500)",
                600: "Semi Bold (600)",
                700: "Bold (700)",
                800: "Extra Bold (800)",
                900: "Black (900)",
              },
            },
            {
              desc: I18n.t("settingsAdvanced.originalStyle.opacity.label"),
              info: I18n.t("settingsAdvanced.pronunciationStyle.opacity.desc"),
              key: "phonetic-opacity",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
            },
            {
              desc: I18n.t("settingsAdvanced.pronunciationStyle.gap.label"),
              info: I18n.t("settingsAdvanced.pronunciationStyle.gap.desc"),
              key: "phonetic-spacing",
              type: ConfigSliderRange,
              min: -30,
              max: 20,
              step: 1,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.pronunciationStyle.letterSpacing.label"),
              info: I18n.t("settingsAdvanced.pronunciationStyle.letterSpacing.desc"),
              key: "phonetic-letter-spacing",
              type: ConfigSliderRange,
              min: -5,
              max: 20,
              step: 0.5,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.pronunciationStyle.hyphenReplace.label"),
              info: I18n.t("settingsAdvanced.pronunciationStyle.hyphenReplace.desc"),
              key: "phonetic-hyphen-replace",
              type: ConfigSelection,
              options: {
                keep: I18n.t("settingsAdvanced.pronunciationStyle.hyphenReplace.options.keep"),
                space: I18n.t("settingsAdvanced.pronunciationStyle.hyphenReplace.options.space"),
                remove: I18n.t("settingsAdvanced.pronunciationStyle.hyphenReplace.options.remove"),
              },
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
            const phoneticPreview = document.getElementById("phonetic-preview");
            if (phoneticPreview) {
              if (name === "phonetic-font-size")
                phoneticPreview.style.fontSize = `${value}px`;
              if (name === "phonetic-font-weight")
                phoneticPreview.style.fontWeight = value;
              if (name === "phonetic-opacity")
                phoneticPreview.style.opacity = value / 100;
              if (name === "phonetic-spacing")
                phoneticPreview.style.marginTop = `${parseInt(value) || 0}px`;
              if (name === "phonetic-letter-spacing")
                phoneticPreview.style.letterSpacing = `${value}px`;
            }
            // Reload lyrics when hyphen replacement setting changes
            if (name === "phonetic-hyphen-replace") {
              reloadLyrics?.();
            } else {
              lyricContainerUpdate?.();
            }
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.translationStyle.title"),
          subtitle: I18n.t("settingsAdvanced.translationStyle.subtitle"),
        }),
        react.createElement(
          "div",
          { className: "setting-row" },
          react.createElement(
            "div",
            { className: "setting-row-content" },
            react.createElement(
              "div",
              { className: "setting-row-left" },
              react.createElement(
                "div",
                { className: "setting-name" },
                I18n.t("settingsAdvanced.originalStyle.fontFamily")
              ),
              react.createElement(
                "div",
                { className: "setting-description" },
                I18n.t("settingsAdvanced.translationStyle.fontFamilyDesc")
              )
            ),
            react.createElement(
              "div",
              { className: "setting-row-right font-selector-container" },
              react.createElement(ConfigFontSelector, {
                name: "",
                defaultValue:
                  CONFIG.visual["translation-font-family"] ||
                  "Pretendard Variable",
                onChange: (_, value) => {
                  CONFIG.visual["translation-font-family"] = value;
                  StorageManager.setItem(
                    `${APP_NAME}:visual:translation-font-family`,
                    value
                  );

                  if (value) {
                    const fonts = value.split(",").map((f) => f.trim().replace(/['"]/g, ""));
                    fonts.forEach((font) => {
                      if (font && GOOGLE_FONTS.includes(font)) {
                        const fontId = font.replace(/ /g, "-").toLowerCase();
                        const linkId = `ivLyrics-google-font-${fontId}`;

                        let link = document.getElementById(linkId);
                        if (!link) {
                          link = document.createElement("link");
                          link.id = linkId;
                          link.rel = "stylesheet";
                          document.head.appendChild(link);
                        }
                        if (font === "Pretendard Variable") {
                          link.href =
                            "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css";
                        } else {
                          link.href = `https://fonts.googleapis.com/css2?family=${font.replace(
                            / /g,
                            "+"
                          )}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
                        }
                      }
                    });
                  }

                  const translationPreview = document.getElementById(
                    "translation-preview"
                  );
                  if (translationPreview) {
                    translationPreview.style.fontFamily = value;
                  }

                  lyricContainerUpdate?.();
                  window.dispatchEvent(
                    new CustomEvent("ivLyrics", {
                      detail: {
                        type: "config",
                        name: "translation-font-family",
                        value,
                      },
                    })
                  );
                },
              })
            )
          )
        ),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.originalStyle.fontSize.label"),
              info: I18n.t("settingsAdvanced.translationStyle.fontSize.desc"),
              key: "translation-font-size",
              type: ConfigSliderRange,
              min: 12,
              max: 128,
              step: 2,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.originalStyle.fontWeight.label"),
              info: I18n.t("settingsAdvanced.translationStyle.fontWeight.desc"),
              key: "translation-font-weight",
              type: ConfigSelection,
              options: {
                100: "Thin (100)",
                200: "Extra Light (200)",
                300: "Light (300)",
                400: "Regular (400)",
                500: "Medium (500)",
                600: "Semi Bold (600)",
                700: "Bold (700)",
                800: "Extra Bold (800)",
                900: "Black (900)",
              },
            },
            {
              desc: I18n.t("settingsAdvanced.originalStyle.opacity.label"),
              info: I18n.t("settingsAdvanced.translationStyle.opacity.desc"),
              key: "translation-opacity",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
            },
            {
              desc: I18n.t("settingsAdvanced.translationStyle.gap.label"),
              info: I18n.t("settingsAdvanced.translationStyle.gap.desc"),
              key: "translation-spacing",
              type: ConfigSliderRange,
              min: -20,
              max: 30,
              step: 2,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.translationStyle.letterSpacing.label"),
              info: I18n.t("settingsAdvanced.translationStyle.letterSpacing.desc"),
              key: "translation-letter-spacing",
              type: ConfigSliderRange,
              min: -5,
              max: 20,
              step: 0.5,
              unit: "px",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
            const translationPreview = document.getElementById(
              "translation-preview"
            );
            if (translationPreview) {
              if (name === "translation-font-size")
                translationPreview.style.fontSize = `${value}px`;
              if (name === "translation-font-weight")
                translationPreview.style.fontWeight = value;
              if (name === "translation-opacity")
                translationPreview.style.opacity = value / 100;
              if (name === "translation-spacing")
                translationPreview.style.marginTop = `${parseInt(value) || 0
                  }px`;
              if (name === "translation-letter-spacing")
                translationPreview.style.letterSpacing = `${value}px`;
            }
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.furiganaStyle.title"),
          subtitle: I18n.t("settingsAdvanced.furiganaStyle.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.furiganaStyle.fontSize.label"),
              info: I18n.t("settingsAdvanced.furiganaStyle.fontSize.desc"),
              key: "furigana-font-size",
              type: ConfigSliderRange,
              min: 8,
              max: 48,
              step: 1,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.furiganaStyle.fontWeight.label"),
              info: I18n.t("settingsAdvanced.furiganaStyle.fontWeight.desc"),
              key: "furigana-font-weight",
              type: ConfigSelection,
              options: {
                100: "Thin (100)",
                200: "Extra Light (200)",
                300: "Light (300)",
                400: "Regular (400)",
                500: "Medium (500)",
                600: "Semi Bold (600)",
                700: "Bold (700)",
                800: "Extra Bold (800)",
                900: "Black (900)",
              },
            },
            {
              desc: I18n.t("settingsAdvanced.furiganaStyle.opacity.label"),
              info: I18n.t("settingsAdvanced.furiganaStyle.opacity.desc"),
              key: "furigana-opacity",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
            },
            {
              desc: I18n.t("settingsAdvanced.furiganaStyle.spacing.label"),
              info: I18n.t("settingsAdvanced.furiganaStyle.spacing.desc"),
              key: "furigana-spacing",
              type: ConfigSliderRange,
              min: -5,
              max: 20,
              step: 1,
              unit: "px",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.textShadow.title"),
          subtitle: I18n.t("settingsAdvanced.textShadow.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.textShadow.enabled.label"),
              info: I18n.t("settingsAdvanced.textShadow.enabled.desc"),
              key: "text-shadow-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.textShadow.color.label"),
              info: I18n.t("settingsAdvanced.textShadow.color.desc"),
              key: "text-shadow-color",
              type: ConfigColorPicker,
            },
            {
              desc: I18n.t("settingsAdvanced.textShadow.opacity.label"),
              info: I18n.t("settingsAdvanced.textShadow.opacity.desc"),
              key: "text-shadow-opacity",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
            },
            {
              desc: I18n.t("settingsAdvanced.textShadow.blur.label"),
              info: I18n.t("settingsAdvanced.textShadow.blur.desc"),
              key: "text-shadow-blur",
              type: ConfigSliderRange,
              min: 0,
              max: 10,
              step: 1,
              unit: "px",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
            const lyricsPreview = document.getElementById("lyrics-preview");
            const phoneticPreview = document.getElementById("phonetic-preview");
            const translationPreview = document.getElementById(
              "translation-preview"
            );

            if (lyricsPreview || phoneticPreview || translationPreview) {
              const shadowEnabled = CONFIG.visual["text-shadow-enabled"];
              const shadowColor =
                CONFIG.visual["text-shadow-color"] || "#000000";
              const shadowOpacity = CONFIG.visual["text-shadow-opacity"] || 50;
              const shadowBlur = CONFIG.visual["text-shadow-blur"] || 2;
              const shadowAlpha = Math.round(shadowOpacity * 2.55)
                .toString(16)
                .padStart(2, "0");
              const shadow = shadowEnabled
                ? `0 0 ${shadowBlur}px ${shadowColor}${shadowAlpha}`
                : "none";
              if (lyricsPreview) lyricsPreview.style.textShadow = shadow;
              if (phoneticPreview) phoneticPreview.style.textShadow = shadow;
              if (translationPreview)
                translationPreview.style.textShadow = shadow;
            }
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        })
      ),
      // 가사 탭 (가사 동기화 및 동작)
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "lyrics" ? "active" : ""}`,
        },
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.playback.title"),
          subtitle: I18n.t("settingsAdvanced.playback.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.playback.replaceButton.label"),
              key: "playbar-button",
              info: I18n.t("settingsAdvanced.playback.replaceButton.info") || "Replaces Spotify's default lyrics button with ivLyrics",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.playback.replaceFullscreenButton.label"),
              key: "fullscreen-button",
              info: I18n.t("settingsAdvanced.playback.replaceFullscreenButton.info") || "Replaces Spotify's default fullscreen button with ivLyrics fullscreen",
              type: ConfigSlider,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.karaokeMode.title"),
          subtitle: I18n.t("settingsAdvanced.karaokeMode.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.enabled.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.enabled.desc"),
              key: "karaoke-mode-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.bounce.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.bounce.desc"),
              key: "karaoke-bounce",
              type: ConfigSlider,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.prefetch.title"),
          subtitle: I18n.t("settingsAdvanced.prefetch.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.prefetch.enabled.label"),
              info: I18n.t("settingsAdvanced.prefetch.enabled.desc"),
              key: "prefetch-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.prefetch.videoEnabled.label"),
              info: I18n.t("settingsAdvanced.prefetch.videoEnabled.desc"),
              key: "prefetch-video-enabled",
              type: ConfigSlider,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.communitySync.title"),
          subtitle: I18n.t("settingsAdvanced.communitySync.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.communitySync.enabled.label"),
              info: I18n.t("settingsAdvanced.communitySync.enabled.desc"),
              key: "community-sync-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.communitySync.autoApply.label"),
              info: I18n.t("settingsAdvanced.communitySync.autoApply.desc"),
              key: "community-sync-auto-apply",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.communitySync.autoSubmit.label"),
              info: I18n.t("settingsAdvanced.communitySync.autoSubmit.desc"),
              key: "community-sync-auto-submit",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.communitySync.minConfidence.label"),
              info: I18n.t("settingsAdvanced.communitySync.minConfidence.desc"),
              key: "community-sync-min-confidence",
              type: ConfigInput,
              inputType: "number",
              min: 0,
              max: 1,
              step: 0.1,
              defaultValue: CONFIG.visual["community-sync-min-confidence"] || 0.5,
            },
          ],
          onChange: (name, value) => {
            if (name === "community-sync-min-confidence") {
              value = Math.min(1, Math.max(0, parseFloat(value) || 0.5));
            }
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.cacheManagement.title"),
          subtitle: I18n.t("settingsAdvanced.cacheManagement.subtitle"),
        }),
        // 로컬 캐시 관리 (IndexedDB) - 메모리 캐시와 통합됨
        react.createElement(LocalCacheManager)
      ),
      // 번역 탭 (가사 제공자 포함)
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "translation" ? "active" : ""
            }`,
        },
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.lyricsProviders.title"),
          subtitle: I18n.t("settingsAdvanced.lyricsProviders.subtitle"),
        }),
        react.createElement(ServiceList, {
          itemsList: CONFIG.providersOrder,
          onListChange: (list) => {
            CONFIG.providersOrder = list;
            StorageManager.setItem(
              `${APP_NAME}:services-order`,
              JSON.stringify(list)
            );
            reloadLyrics?.();
          },
          onToggle: (name, value) => {
            CONFIG.providers[name].on = value;
            StorageManager.setItem(`${APP_NAME}:provider:${name}:on`, value);
            reloadLyrics?.();
          },
          onTokenChange: (name, value) => {
            CONFIG.providers[name].token = value;
            StorageManager.setItem(`${APP_NAME}:provider:${name}:token`, value);
            reloadLyrics?.();
          },
        })
      ),
      // 고급 탭
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "advanced" ? "active" : ""}`,
        },
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.languageDetection.title"),
          subtitle: I18n.t("settingsAdvanced.languageDetection.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.languageDetection.furigana.label"),
              info: I18n.t("settingsAdvanced.languageDetection.furigana.desc"),
              key: "furigana-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.languageDetection.japaneseThreshold.label"),
              info: I18n.t("settingsAdvanced.languageDetection.japaneseThreshold.desc"),
              key: "ja-detect-threshold",
              type: ConfigSliderRange,
              min: thresholdSizeLimit.min,
              max: thresholdSizeLimit.max,
              step: thresholdSizeLimit.step,
              unit: "%",
            },
            {
              desc: I18n.t("settingsAdvanced.languageDetection.chineseThreshold.label"),
              info: I18n.t("settingsAdvanced.languageDetection.chineseThreshold.desc"),
              key: "hans-detect-threshold",
              type: ConfigSliderRange,
              min: thresholdSizeLimit.min,
              max: thresholdSizeLimit.max,
              step: thresholdSizeLimit.step,
              unit: "%",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.api.title"),
          subtitle: I18n.t("settingsAdvanced.apiKeys.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.api.getApiKey.desc"),
              info: I18n.t("settingsAdvanced.api.getApiKey.info"),
              key: "get-api-key",
              text: I18n.t("settingsAdvanced.api.getApiKey.button"),
              type: ConfigButton,
              onChange: () => {
                window.open("https://aistudio.google.com/apikey", "_blank");
              },
            },
            {
              desc: I18n.t("settingsAdvanced.api.geminiKey.desc"),
              info: I18n.t("settingsAdvanced.api.geminiKey.info"),
              key: "gemini-api-key",
              type: ConfigKeyList,
            },

          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.exportImport.title"),
          subtitle: I18n.t("settingsAdvanced.exportImport.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.exportImport.export.label"),
              info: I18n.t("settingsAdvanced.exportImport.export.label"),
              key: "export-settings",
              text: I18n.t("settingsAdvanced.exportImport.export.button"),
              type: ConfigButton,
              onChange: async (_, event) => {
                const button = event?.target;
                if (!button) return;
                const originalText = button.textContent;
                button.textContent = I18n.t("settingsAdvanced.exportImport.export.processing");
                button.disabled = true;

                try {
                  const cfg = await StorageManager.exportConfig();
                  console.log("[Settings] Config before serialize:", cfg);
                  console.log("[Settings] Has track-sync-offsets:", "ivLyrics:track-sync-offsets" in cfg);
                  const u8 = settingsObject.serialize(cfg);
                  // download as file
                  const blob = new Blob([u8], {
                    type: "application/octet-stream",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "ivLyrics.lpconfig";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);

                  const settingRow = button.closest(".setting-row");
                  let resultContainer = settingRow?.nextElementSibling;

                  if (
                    !resultContainer ||
                    !resultContainer.id ||
                    resultContainer.id !== "export-result-container"
                  ) {
                    // 결과 컨테이너가 없으면 생성
                    resultContainer = document.createElement("div");
                    resultContainer.id = "export-result-container";
                    resultContainer.style.cssText = "margin-top: -1px;";
                    settingRow?.parentNode?.insertBefore(
                      resultContainer,
                      settingRow.nextSibling
                    );
                  }

                  resultContainer.innerHTML = `<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(96, 165, 250, 0.15);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(96, 165, 250, 0.9);
														font-size: 13px;
													">
														<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
															<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
														</svg>
														<div>
															<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.exportSuccess")}</div>
															<div style="opacity: 0.8; font-size: 12px;">${I18n.t("notifications.exportSuccessDesc")}</div>
														</div>
													</div>
												</div>`;
                } catch (e) {
                  const settingRow = button.closest(".setting-row");
                  let resultContainer = settingRow?.nextElementSibling;

                  if (
                    !resultContainer ||
                    !resultContainer.id ||
                    resultContainer.id !== "export-result-container"
                  ) {
                    // 결과 컨테이너가 없으면 생성
                    resultContainer = document.createElement("div");
                    resultContainer.id = "export-result-container";
                    resultContainer.style.cssText = "margin-top: -1px;";
                    settingRow?.parentNode?.insertBefore(
                      resultContainer,
                      settingRow.nextSibling
                    );
                  }
                  resultContainer.innerHTML = `
											<div style="
												padding: 16px 20px;
												background: rgba(255, 255, 255, 0.03);
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid rgba(255, 255, 255, 0.08);
												border-right: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom: 1px solid rgba(255, 255, 255, 0.08);
												backdrop-filter: blur(30px) saturate(150%);
												-webkit-backdrop-filter: blur(30px) saturate(150%);
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: rgba(255, 107, 107, 0.9);
													font-size: 13px;
													font-weight: 500;
												">
													<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
													</svg>
													<div>
														<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.exportFailed")}</div>
														<div style="opacity: 0.8; font-size: 12px;">${e.message || e.reason || e.toString()
                    }</div>
													</div>
												</div>
											</div>
										`;
                } finally {
                  button.textContent = originalText;
                  button.disabled = false;
                }
              },
            },

            {
              desc: I18n.t("settingsAdvanced.exportImport.import.label"),
              info: I18n.t("settingsAdvanced.exportImport.import.label"),
              key: "import-settings",
              text: I18n.t("settingsAdvanced.exportImport.import.button"),
              type: ConfigButton,
              onChange: async (_, event) => {
                const button = event?.target;
                if (!button) return;
                const originalText = button.textContent;
                button.textContent = I18n.t("settingsAdvanced.exportImport.import.processing");
                button.disabled = true;

                try {
                  const fileInput = document.createElement("input");
                  fileInput.type = "file";
                  fileInput.accept = ".lpconfig,.json";
                  fileInput.onchange = async (e) => {
                    if (!fileInput.files || fileInput.files.length === 0) {
                      button.textContent = originalText;
                      button.disabled = false;
                      return;
                    }
                    const file = fileInput.files[0];
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                      const contents = e.target.result;
                      try {
                        // check file type
                        const fileType = file.type;
                        const isLpconfig =
                          !fileType && file.name.includes("lpconfig");
                        const isJson = fileType && fileType.includes("json");
                        if (!isLpconfig && !isJson) {
                          console.log(fileType);
                          console.log(file.name);
                          throw new Error("Invalid file type " + fileType);
                        }
                        if (isJson) {
                          const arraBuffer2Text = (ab) => {
                            return new TextDecoder("utf-8").decode(ab);
                          };
                          const cfg = JSON.parse(arraBuffer2Text(contents));
                          StorageManager.importConfig(cfg);
                        } else {
                          const u8 = new Uint8Array(contents);
                          const cfg = settingsObject.deserialize(u8);
                          StorageManager.importConfig(cfg);
                        }

                        const settingRow = button.closest(".setting-row");
                        let resultContainer = settingRow?.nextElementSibling;

                        if (
                          !resultContainer ||
                          !resultContainer.id ||
                          resultContainer.id !== "export-result-container"
                        ) {
                          // 결과 컨테이너가 없으면 생성
                          resultContainer = document.createElement("div");
                          resultContainer.id = "export-result-container";
                          resultContainer.style.cssText = "margin-top: -1px;";
                          settingRow?.parentNode?.insertBefore(
                            resultContainer,
                            settingRow.nextSibling
                          );
                        }

                        resultContainer.innerHTML = `<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(96, 165, 250, 0.15);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 12px;
													border-bottom-right-radius: 12px;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(96, 165, 250, 0.9);
														font-size: 13px;
													">
														<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
															<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
														</svg>
														<div>
															<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.importSuccess")}</div>
															<div style="opacity: 0.8; font-size: 12px;">${I18n.t("notifications.importSuccessDesc")}</div>
														</div>
													</div>
												</div>`;

                        // 1.5초 후 자동 새로고침
                        setTimeout(() => {
                          location.reload();
                        }, 1500);
                      } catch (e) {
                        const settingRow = button.closest(".setting-row");
                        let resultContainer = settingRow?.nextElementSibling;

                        if (
                          !resultContainer ||
                          !resultContainer.id ||
                          resultContainer.id !== "export-result-container"
                        ) {
                          // 결과 컨테이너가 없으면 생성
                          resultContainer = document.createElement("div");
                          resultContainer.id = "export-result-container";
                          resultContainer.style.cssText = "margin-top: -1px;";
                          settingRow?.parentNode?.insertBefore(
                            resultContainer,
                            settingRow.nextSibling
                          );
                        }
                        resultContainer.innerHTML = `
											<div style="
												padding: 16px 20px;
												background: rgba(255, 255, 255, 0.03);
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid rgba(255, 255, 255, 0.08);
												border-right: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom-left-radius: 12px;
												border-bottom-right-radius: 12px;
												backdrop-filter: blur(30px) saturate(150%);
												-webkit-backdrop-filter: blur(30px) saturate(150%);
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: rgba(255, 107, 107, 0.9);
													font-size: 13px;
													font-weight: 500;
												">
													<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
													</svg>
													<div>
														<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.importFailed")}</div>
														<div style="opacity: 0.8; font-size: 12px;">${e.message || e.reason || e.toString()
                          }</div>
													</div>
												</div>
											</div>
										`;
                      } finally {
                        button.textContent = originalText;
                        button.disabled = false;
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  };
                  document.body.appendChild(fileInput);
                  fileInput.click();
                  document.body.removeChild(fileInput);
                } catch (e) {
                  button.textContent = originalText;
                  button.disabled = false;
                }
              },
            },
          ],
          onChange: () => { },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.resetSettings.title"),
          subtitle: I18n.t("settingsAdvanced.resetSettings.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.resetSettings.reset.label"),
              info: I18n.t("settingsAdvanced.resetSettings.reset.desc"),
              key: "reset-settings",
              text: I18n.t("settingsAdvanced.resetSettings.reset.button"),
              type: ConfigButton,
              onChange: async (_, event) => {
                const button = event?.target;
                if (!button) return;

                // 확인 대화상자
                const confirmed = confirm(
                  I18n.t("settingsAdvanced.resetSettings.reset.confirm")
                );

                if (!confirmed) return;

                const originalText = button.textContent;
                button.textContent = I18n.t("settingsAdvanced.resetSettings.reset.processing");
                button.disabled = true;

                const settingRow = button.closest(".setting-row");
                let resultContainer = settingRow?.nextElementSibling;

                if (
                  !resultContainer ||
                  !resultContainer.id ||
                  resultContainer.id !== "reset-result-container"
                ) {
                  resultContainer = document.createElement("div");
                  resultContainer.id = "reset-result-container";
                  resultContainer.style.cssText = "margin-top: -1px;";
                  settingRow?.parentNode?.insertBefore(
                    resultContainer,
                    settingRow.nextSibling
                  );
                }

                try {
                  // localStorage에서 ivLyrics 관련 모든 항목 제거
                  const keysToRemove = [];
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith("ivLyrics:")) {
                      keysToRemove.push(key);
                    }
                  }

                  keysToRemove.forEach((key) => {
                    localStorage.removeItem(key);
                  });

                  resultContainer.innerHTML = `<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(96, 165, 250, 0.15);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 12px;
													border-bottom-right-radius: 12px;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(96, 165, 250, 0.9);
														font-size: 13px;
													">
														<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
															<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
														</svg>
														<div>
															<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.resetSuccess")}</div>
															<div style="opacity: 0.8; font-size: 12px;">${I18n.t("notifications.importSuccessDesc")}</div>
														</div>
													</div>
												</div>`;

                  // 1.5초 후 자동 새로고침
                  setTimeout(() => {
                    window.location.reload();
                  }, 1500);
                } catch (e) {
                  resultContainer.innerHTML = `
											<div style="
												padding: 16px 20px;
												background: rgba(255, 255, 255, 0.03);
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid rgba(255, 255, 255, 0.08);
												border-right: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom-left-radius: 12px;
												border-bottom-right-radius: 12px;
												backdrop-filter: blur(30px) saturate(150%);
												-webkit-backdrop-filter: blur(30px) saturate(150%);
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: rgba(255, 107, 107, 0.9);
													font-size: 13px;
													font-weight: 500;
												">
													<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
													</svg>
													<div>
														<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.resetFailed")}</div>
														<div style="opacity: 0.8; font-size: 12px;">${e.message || e.reason || e.toString()
                    }</div>
													</div>
												</div>
											</div>
										`;

                  button.textContent = originalText;
                  button.disabled = false;
                }
              },
            },
          ],
          onChange: () => { },
        })
      ),
      // 전체화면 탭
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "fullscreen" ? "active" : ""}`,
        },
        // ===== 기본 설정 섹션 =====
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.fullscreenMode.title"),
          subtitle: I18n.t("settingsAdvanced.fullscreenMode.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.playback.fullscreenShortcut.label"),
              info: I18n.t("settingsAdvanced.fullscreenMode.shortcut.info"),
              key: "fullscreen-key",
              type: ConfigHotkey,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.browserFullscreen.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.browserFullscreen.info"),
              key: "fullscreen-browser-fullscreen",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-browser-fullscreen"] ?? false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.tvMode.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.tvMode.info"),
              key: "fullscreen-tv-mode",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-tv-mode"] ?? false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.toggleTvModeKey.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.toggleTvModeKey.info"),
              key: "toggle-tv-mode-key",
              type: ConfigHotkey,
              defaultValue: "t",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),

        // ===== 일반 모드 레이아웃 섹션 =====
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.normalMode.title"),
          subtitle: I18n.t("settingsAdvanced.normalMode.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.twoColumnLayout.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.splitView.info"),
              key: "fullscreen-two-column",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-two-column"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.invertPosition.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.invertPosition.info"),
              key: "fullscreen-layout-reverse",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-layout-reverse"] ?? false,
              when: () => CONFIG.visual["fullscreen-two-column"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.showAlbumArt.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.showAlbumArt.info"),
              key: "fullscreen-show-album",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-album"] ?? true,
              when: () => CONFIG.visual["fullscreen-two-column"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.showTrackInfo.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.showTrackInfo.info"),
              key: "fullscreen-show-info",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-info"] ?? true,
              when: () => CONFIG.visual["fullscreen-two-column"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.normalMode.showAlbumName.desc"),
              info: I18n.t("settingsAdvanced.normalMode.showAlbumName.info"),
              key: "fullscreen-show-album-name",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-album-name"] ?? false,
              when: () => CONFIG.visual["fullscreen-two-column"] !== false && CONFIG.visual["fullscreen-show-info"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.centerWhenNoLyrics.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.centerWhenNoLyrics.info"),
              key: "fullscreen-center-when-no-lyrics",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-center-when-no-lyrics"] ?? true,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),

        // ===== TV 모드 섹션 =====
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.tvMode.title"),
          subtitle: I18n.t("settingsAdvanced.tvMode.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.tvModeAlbumSize.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.tvModeAlbumSize.info"),
              key: "fullscreen-tv-album-size",
              type: ConfigSliderRange,
              min: 80,
              max: 200,
              step: 10,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-tv-album-size"] || 140,
            },
            {
              desc: I18n.t("settingsAdvanced.tvMode.showAlbumName.desc"),
              info: I18n.t("settingsAdvanced.tvMode.showAlbumName.info"),
              key: "fullscreen-tv-show-album-name",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-tv-show-album-name"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.tvMode.showControls.desc"),
              info: I18n.t("settingsAdvanced.tvMode.showControls.info"),
              key: "fullscreen-tv-show-controls",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-tv-show-controls"] ?? false,
            },
            {
              desc: I18n.t("settingsAdvanced.tvMode.showProgress.desc"),
              info: I18n.t("settingsAdvanced.tvMode.showProgress.info"),
              key: "fullscreen-tv-show-progress",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-tv-show-progress"] ?? false,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),

        // ===== 제목/아티스트 설정 섹션 =====
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.metadataDisplay.title"),
          subtitle: I18n.t("settingsAdvanced.metadataDisplay.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.trimTitle.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.trimTitle.info"),
              key: "fullscreen-trim-title",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-trim-title"] ?? false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.translateMetadata.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.translateMetadata.info"),
              key: "translate-metadata",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["translate-metadata"] ?? false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.translateMetadataMode.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.translateMetadataMode.info"),
              key: "translate-metadata-mode",
              type: ConfigSelection,
              options: {
                "translated": I18n.t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.translated"),
                "romanized": I18n.t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.romanized"),
                "original-translated": I18n.t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.originalTranslated"),
                "original-romanized": I18n.t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.originalRomanized"),
                "all": I18n.t("settingsAdvanced.fullscreenMode.translateMetadataMode.options.all")
              },
              defaultValue: CONFIG.visual["translate-metadata-mode"] || "translated",
              when: () => CONFIG.visual["translate-metadata"] === true,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.fullscreenStyle.title"),
          subtitle: I18n.t("settingsAdvanced.fullscreenStyle.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.fullscreenStyle.albumSize.desc"),
              info: I18n.t("settingsAdvanced.fullscreenStyle.albumSize.info"),
              key: "fullscreen-album-size",
              type: ConfigSliderRange,
              min: 100,
              max: 500,
              step: 10,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-album-size"] || 400,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenStyle.albumRadius.desc"),
              info: I18n.t("settingsAdvanced.fullscreenStyle.albumRadius.info"),
              key: "fullscreen-album-radius",
              type: ConfigSliderRange,
              min: 0,
              max: 50,
              step: 1,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-album-radius"] || 12,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.infoGap.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.infoGap.info"),
              key: "fullscreen-info-gap",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 1,
              unit: "px",
              defaultValue: (CONFIG.visual["fullscreen-info-gap"] !== undefined) ? CONFIG.visual["fullscreen-info-gap"] : 24,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenStyle.titleFontSize.desc"),
              info: I18n.t("settingsAdvanced.fullscreenStyle.titleFontSize.info"),
              key: "fullscreen-title-size",
              type: ConfigSliderRange,
              min: 24,
              max: 72,
              step: 2,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-title-size"] || 48,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenStyle.artistFontSize.desc"),
              info: I18n.t("settingsAdvanced.fullscreenStyle.artistFontSize.info"),
              key: "fullscreen-artist-size",
              type: ConfigSliderRange,
              min: 14,
              max: 36,
              step: 1,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-artist-size"] || 24,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenStyle.lyricsRightMargin.desc"),
              info: I18n.t("settingsAdvanced.fullscreenStyle.lyricsRightMargin.info"),
              key: "fullscreen-lyrics-right-padding",
              type: ConfigSliderRange,
              min: 0,
              max: 300,
              step: 10,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-lyrics-right-padding"] || 0,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.fullscreenUI.title"),
          subtitle: I18n.t("settingsAdvanced.fullscreenUI.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showClock.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showClock.info"),
              key: "fullscreen-show-clock",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-clock"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.clockSize.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.clockSize.info"),
              key: "fullscreen-clock-size",
              type: ConfigSliderRange,
              min: 24,
              max: 72,
              step: 2,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-clock-size"] || 48,
              when: () => CONFIG.visual["fullscreen-show-clock"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showContext.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showContext.info"),
              key: "fullscreen-show-context",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-context"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showContextImage.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showContextImage.info"),
              key: "fullscreen-show-context-image",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-context-image"] ?? true,
              when: () => CONFIG.visual["fullscreen-show-context"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showNextTrack.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showNextTrack.info"),
              key: "fullscreen-show-next-track",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-next-track"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.nextTrackTime.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.nextTrackTime.info"),
              key: "fullscreen-next-track-seconds",
              type: ConfigSliderRange,
              min: 5,
              max: 30,
              step: 1,
              unit: I18n.t("settingsAdvanced.fullscreenUI.nextTrackTime.unit"),
              defaultValue: CONFIG.visual["fullscreen-next-track-seconds"] || 15,
              when: () => CONFIG.visual["fullscreen-show-next-track"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showControls.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showControls.info"),
              key: "fullscreen-show-controls",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-controls"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showVolume.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showVolume.info"),
              key: "fullscreen-show-volume",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-volume"] ?? true,
              when: () => CONFIG.visual["fullscreen-show-controls"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showProgressBar.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showProgressBar.info"),
              key: "fullscreen-show-progress",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-progress"] ?? true,
              when: () => CONFIG.visual["fullscreen-show-controls"] !== false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showLyricsProgress.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showLyricsProgress.info"),
              key: "fullscreen-show-lyrics-progress",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-lyrics-progress"] ?? false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenUI.showQueue.desc"),
              info: I18n.t("settingsAdvanced.fullscreenUI.showQueue.info"),
              key: "fullscreen-show-queue",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-show-queue"] ?? true,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.controllerStyle.title"),
          subtitle: I18n.t("settingsAdvanced.controllerStyle.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.controllerStyle.buttonSize.desc"),
              info: I18n.t("settingsAdvanced.controllerStyle.buttonSize.info"),
              key: "fullscreen-control-button-size",
              type: ConfigSliderRange,
              min: 28,
              max: 48,
              step: 2,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-control-button-size"] || 36,
            },
            {
              desc: I18n.t("settingsAdvanced.controllerStyle.background.desc"),
              info: I18n.t("settingsAdvanced.controllerStyle.background.info"),
              key: "fullscreen-controls-background",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-controls-background"] ?? false,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.autoHide.title"),
          subtitle: I18n.t("settingsAdvanced.autoHide.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.autoHide.enabled.desc"),
              info: I18n.t("settingsAdvanced.autoHide.enabled.info"),
              key: "fullscreen-auto-hide-ui",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-auto-hide-ui"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.autoHide.delay.desc"),
              info: I18n.t("settingsAdvanced.autoHide.delay.info"),
              key: "fullscreen-auto-hide-delay",
              type: ConfigSliderRange,
              min: 1,
              max: 10,
              step: 0.5,
              unit: I18n.t("settingsAdvanced.fullscreenUI.nextTrackTime.unit"),
              defaultValue: CONFIG.visual["fullscreen-auto-hide-delay"] || 3,
              when: () => CONFIG.visual["fullscreen-auto-hide-ui"] !== false,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.tmiStyle.title"),
          subtitle: I18n.t("settingsAdvanced.tmiStyle.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.tmiStyle.fontSize.desc"),
              info: I18n.t("settingsAdvanced.tmiStyle.fontSize.info"),
              key: "fullscreen-tmi-font-size",
              type: ConfigSliderRange,
              min: 80,
              max: 150,
              step: 5,
              unit: "%",
              defaultValue: CONFIG.visual["fullscreen-tmi-font-size"] || 100,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        })
      ),
      // NowPlaying 패널 가사 탭
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "nowplaying" ? "active" : ""}`,
        },
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.nowPlayingPanel.title") || "NowPlaying Panel Lyrics",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.subtitle") || "Lyrics display settings for the Now Playing panel",
        }),
        // 미리보기 컴포넌트
        react.createElement(NowPlayingPanelPreview),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.enabled.label") || "Enable Panel Lyrics",
              key: "panel-lyrics-enabled",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.enabled.desc") || "Display current lyrics in the Now Playing panel",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.lines.label") || "Lyrics Lines",
              key: "panel-lyrics-lines",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.lines.desc") || "Number of lyrics lines to show in the panel",
              type: ConfigSelection,
              options: {
                "3": "3",
                "5": "5",
                "7": "7",
                "9": "9",
              },
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.fontFamily.label") || "Font Family",
              key: "panel-lyrics-font-family",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.fontFamily.desc") || "Font for panel lyrics",
              type: ConfigFontSelector,
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.originalFont.label") || "Original Text Font",
              key: "panel-lyrics-original-font",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.originalFont.desc") || "Font for original lyrics (empty = use default, comma-separated for multiple fonts)",
              type: ConfigFontSelector,
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.phoneticFont.label") || "Phonetic Text Font",
              key: "panel-lyrics-phonetic-font",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.phoneticFont.desc") || "Font for phonetic text (empty = use default, comma-separated for multiple fonts)",
              type: ConfigFontSelector,
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.translationFont.label") || "Translation Text Font",
              key: "panel-lyrics-translation-font",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.translationFont.desc") || "Font for translation text (empty = use default, comma-separated for multiple fonts)",
              type: ConfigFontSelector,
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.fontScale.label") || "Overall Font Scale",
              key: "panel-font-scale",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.fontScale.desc") || "Overall font scale for panel lyrics (50%-200%)",
              type: ConfigSliderRange,
              min: 50,
              max: 200,
              step: 5,
              unit: "%",
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.originalSize.label") || "Original Text Size",
              key: "panel-lyrics-original-size",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.originalSize.desc") || "Font size for original lyrics (px)",
              type: ConfigSliderRange,
              min: 10,
              max: 30,
              step: 1,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.phoneticSize.label") || "Phonetic Text Size",
              key: "panel-lyrics-phonetic-size",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.phoneticSize.desc") || "Font size for phonetic text (px)",
              type: ConfigSliderRange,
              min: 8,
              max: 24,
              step: 1,
              unit: "px",
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.translationSize.label") || "Translation Text Size",
              key: "panel-lyrics-translation-size",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.translationSize.desc") || "Font size for translation text (px)",
              type: ConfigSliderRange,
              min: 8,
              max: 24,
              step: 1,
              unit: "px",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            // 패널 가사 업데이트 이벤트 발생
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
            // 미리보기 업데이트를 위한 이벤트
            window.dispatchEvent(
              new CustomEvent("ivLyrics:panel-preview-update", {
                detail: { name, value },
              })
            );
          },
        }),
        // 배경 설정 섹션
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.nowPlayingPanel.background.title") || "Background",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.background.subtitle") || "Customize the panel background",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.background.type.label") || "Background Type",
              key: "panel-bg-type",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.background.type.desc") || "Choose background style",
              type: ConfigSelection,
              options: {
                "album": I18n.t("settingsAdvanced.nowPlayingPanel.background.type.album") || "Album Color",
                "custom": I18n.t("settingsAdvanced.nowPlayingPanel.background.type.custom") || "Custom Color",
                "gradient": I18n.t("settingsAdvanced.nowPlayingPanel.background.type.gradient") || "Gradient",
              },
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.background.color.label") || "Background Color",
              key: "panel-bg-color",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.background.color.desc") || "Custom background color",
              type: ConfigColorPicker,
              when: () => CONFIG.visual["panel-bg-type"] === "custom",
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.background.opacity.label") || "Background Opacity",
              key: "panel-bg-opacity",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.background.opacity.desc") || "Background transparency (0-100%)",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
            window.dispatchEvent(
              new CustomEvent("ivLyrics:panel-preview-update", {
                detail: { name, value },
              })
            );
          },
        }),
        // Border 설정 섹션
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.nowPlayingPanel.border.title") || "Border",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.border.subtitle") || "Customize the panel border",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.border.enabled.label") || "Enable Border",
              key: "panel-border-enabled",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.border.enabled.desc") || "Show border around the panel",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.border.color.label") || "Border Color",
              key: "panel-border-color",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.border.color.desc") || "Border color",
              type: ConfigColorPicker,
              when: () => CONFIG.visual["panel-border-enabled"] === true,
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.border.opacity.label") || "Border Opacity",
              key: "panel-border-opacity",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.border.opacity.desc") || "Border transparency (0-100%)",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
              when: () => CONFIG.visual["panel-border-enabled"] === true,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
            window.dispatchEvent(
              new CustomEvent("ivLyrics:panel-preview-update", {
                detail: { name, value },
              })
            );
          },
        })
      ),
      // 디버그 탭
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "debug" ? "active" : ""}`,
        },
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.debugTab.title"),
          subtitle: I18n.t("settingsAdvanced.debugTab.subtitle"),
        }),
        react.createElement(DebugInfoPanel)
      ),
      // 정보 탭
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "about" ? "active" : ""}`,
        },
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.appInfo.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.subtitle"),
        }),
        react.createElement(
          "div",
          {
            className: "info-card",
            style: {
              padding: "20px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "0 0 12px 12px",
              backdropFilter: "blur(30px) saturate(150%)",
              WebkitBackdropFilter: "blur(30px) saturate(150%)",
              marginBottom: "24px",
            },
          },
          react.createElement(
            "h3",
            {
              style: {
                margin: "0 0 12px",
                fontSize: "18px",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              },
            },
            react.createElement("span", null, "🎵"),
            "ivLyrics"
          ),
          react.createElement(
            "p",
            {
              style: {
                margin: "0 0 16px",
                color: "rgba(255,255,255,0.7)",
                lineHeight: "1.6",
              },
            },
            I18n.t("settingsAdvanced.aboutTab.appDescription")
          ),
          react.createElement(
            "p",
            {
              style: {
                margin: "0 0 8px",
                color: "rgba(255,255,255,0.5)",
                fontSize: "14px",
              },
            },
            `${I18n.t("settingsAdvanced.aboutTab.versionPrefix")}: ${Utils.currentVersion}`
          ),
          react.createElement("div", {
            style: {
              height: "1px",
              background: "rgba(255, 255, 255, 0.1)",
              margin: "16px 0",
            },
          }),
          react.createElement(
            "p",
            {
              style: {
                margin: "0 0 12px",
                color: "rgba(255,255,255,0.9)",
                lineHeight: "1.6",
              },
            },
            react.createElement("strong", null, I18n.t("settingsAdvanced.aboutTab.developer")),
            " ivLis Studio"
          ),
          react.createElement(
            "p",
            {
              style: {
                margin: "0 0 12px",
                color: "rgba(255,255,255,0.9)",
                lineHeight: "1.6",
              },
            },
            react.createElement("strong", null, I18n.t("settingsAdvanced.aboutTab.originalProject")),
            "lyrics-plus by khanhas"
          ),
          react.createElement(
            "p",
            {
              style: {
                margin: "0",
                color: "rgba(255,255,255,0.7)",
                fontSize: "14px",
                lineHeight: "1.6",
              },
            },
            I18n.t("settingsAdvanced.aboutTab.thanks")
          )
        ),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.clientInfo.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.clientInfo.subtitle"),
        }),
        react.createElement(
          "div",
          {
            className: "info-card",
            style: {
              padding: "20px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "0 0 12px 12px",
              backdropFilter: "blur(30px) saturate(150%)",
              WebkitBackdropFilter: "blur(30px) saturate(150%)",
              marginBottom: "24px",
            },
          },
          react.createElement(
            "p",
            {
              style: {
                margin: "0 0 8px",
                color: "rgba(255,255,255,0.7)",
                fontSize: "13px",
                lineHeight: "1.6",
              },
            },
            I18n.t("settingsAdvanced.aboutTab.clientInfo.description"),
          ),
          react.createElement(
            "div",
            {
              style: {
                marginTop: "12px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              },
            },
            react.createElement(
              "div",
              {
                style: {
                  flex: 1,
                  background: "rgba(0, 0, 0, 0.25)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.9)",
                  userSelect: "all",
                  wordBreak: "break-all",
                  lineHeight: "1.5",
                },
              },
              StorageManager.getClientId()
            ),
            react.createElement(
              "button",
              {
                onClick: () => {
                  const clientId = StorageManager.getClientId();
                  navigator.clipboard.writeText(clientId).then(() => {
                    Toast.success(I18n.t("settingsAdvanced.aboutTab.clientInfo.copied"));
                  }).catch(() => {
                    Toast.error(I18n.t("settingsAdvanced.aboutTab.clientInfo.copyFailed"));
                  });
                },
                style: {
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "rgba(255, 255, 255, 0.9)",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "600",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                },
                onMouseEnter: (e) => {
                  e.target.style.background = "rgba(255, 255, 255, 0.12)";
                },
                onMouseLeave: (e) => {
                  e.target.style.background = "rgba(255, 255, 255, 0.08)";
                },
              },
              I18n.t("settingsAdvanced.aboutTab.clientInfo.copy")
            )
          )
        ),
        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.update.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.update.subtitle"),
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.aboutTab.update.checkUpdate.desc"),
              info: I18n.t("settingsAdvanced.update.currentVersionInfo").replace("{version}", Utils.currentVersion),
              key: "check-update",
              text: I18n.t("settingsAdvanced.aboutTab.update.checkUpdate.button"),
              type: ConfigButton,
              onChange: async (_, event) => {
                const button = event?.target;
                if (!button) return;
                const originalText = button.textContent;
                button.textContent = I18n.t("settingsAdvanced.aboutTab.update.checkUpdate.checking");
                button.disabled = true;

                // setting-row 다음에 결과 컨테이너 찾기/생성
                const settingRow = button.closest(".setting-row");
                let resultContainer = settingRow?.nextElementSibling;

                if (
                  !resultContainer ||
                  !resultContainer.id ||
                  resultContainer.id !== "update-result-container"
                ) {
                  // 결과 컨테이너가 없으면 생성
                  resultContainer = document.createElement("div");
                  resultContainer.id = "update-result-container";
                  resultContainer.style.cssText = "margin-top: -1px;";
                  settingRow?.parentNode?.insertBefore(
                    resultContainer,
                    settingRow.nextSibling
                  );
                }

                if (resultContainer) resultContainer.innerHTML = "";

                try {
                  const updateInfo = await Utils.checkForUpdates();

                  if (resultContainer) {
                    let message,
                      showUpdateSection = false,
                      showCopyButton = false;
                    const platform = Utils.detectPlatform();
                    const platformName = Utils.getPlatformName();
                    const installCommand = Utils.getInstallCommand();

                    if (updateInfo.error) {
                      message = I18n.t("settingsAdvanced.update.checkFailedWithError").replace("{error}", updateInfo.error);
                      resultContainer.innerHTML = `
												<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(255, 107, 107, 0.2);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 12px;
													border-bottom-right-radius: 12px;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(255, 107, 107, 0.9);
														font-size: 13px;
														font-weight: 500;
													">
														<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
															<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
														</svg>
														<div>
															<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.updateCheckFailed")}</div>
															<div style="opacity: 0.8; font-size: 12px;">${I18n.t("notifications.checkNetworkConnection")}</div>
														</div>
													</div>
												</div>
											`;
                    } else if (updateInfo.hasUpdate) {
                      showUpdateSection = true;
                      showCopyButton = true;

                      resultContainer.innerHTML = `
												<div style="
													padding: 20px;
													background: rgba(255, 255, 255, 0.04);
													border: 1px solid rgba(74, 222, 128, 0.15);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 12px;
													border-bottom-right-radius: 12px;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="margin-bottom: 16px;">
														<div style="
															display: flex;
															align-items: center;
															gap: 12px;
															margin-bottom: 12px;
														">
															<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(74, 222, 128, 0.9)" stroke-width="2">
																<circle cx="12" cy="12" r="10"/>
																<path d="M12 6v6l4 2"/>
															</svg>
															<div>
																<div style="
																	font-size: 14px;
																	font-weight: 600;
																	color: rgba(255, 255, 255, 0.95);
																	margin-bottom: 2px;
																	letter-spacing: -0.01em;
																">${I18n.t("notifications.updateAvailable")}</div>
																<div style="
																	font-size: 12px;
																	color: rgba(255, 255, 255, 0.5);
																">${I18n.t("update.versionChange")} ${updateInfo.currentVersion} → ${updateInfo.latestVersion}</div>
															</div>
														</div>
													</div>
													
													<div style="
														background: rgba(0, 0, 0, 0.25);
														border: 1px solid rgba(255, 255, 255, 0.08);
														border-radius: 8px;
														padding: 12px 14px;
														margin-bottom: 12px;
													">
														<div style="
															font-size: 12px;
															color: rgba(255, 255, 255, 0.6);
															margin-bottom: 8px;
															font-weight: 500;
														">${platformName}</div>
														<code style="
															font-family: Consolas, Monaco, 'Courier New', monospace;
															font-size: 12px;
															color: rgba(255, 255, 255, 0.85);
															word-break: break-all;
															line-height: 1.6;
															user-select: all;
														">${installCommand}</code>
													</div>
													
													<div style="display: flex; gap: 8px;">
														<button id="copy-install-command-btn" style="
															flex: 1;
															background: rgba(255, 255, 255, 0.1);
															border: 1px solid rgba(255, 255, 255, 0.15);
															color: rgba(255, 255, 255, 0.9);
															padding: 10px 16px;
															border-radius: 8px;
															cursor: pointer;
															font-size: 13px;
															font-weight: 600;
															transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
															letter-spacing: -0.01em;
														">${I18n.t("update.copyCommand")}</button>
														<a href="https://github.com/ivLis-Studio/ivLyrics/releases/tag/v${updateInfo.latestVersion}" 
														   target="_blank"
														   style="
															flex: 1;
															background: rgba(255, 255, 255, 0.08);
															border: 1px solid rgba(255, 255, 255, 0.15);
															color: rgba(255, 255, 255, 0.9);
															padding: 10px 16px;
															border-radius: 8px;
															text-decoration: none;
															font-size: 13px;
															font-weight: 600;
															transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
															display: flex;
															align-items: center;
															justify-content: center;
															letter-spacing: -0.01em;
														">${I18n.t("update.releaseNotes")}</a>
													</div>
												</div>
											`;

                      // Add copy button handler
                      const copyBtn = resultContainer.querySelector(
                        "#copy-install-command-btn"
                      );
                      if (copyBtn) {
                        copyBtn.addEventListener("click", async () => {
                          const success = await Utils.copyToClipboard(
                            installCommand
                          );
                          if (success) {
                            copyBtn.textContent = I18n.t("settingsAdvanced.aboutTab.update.copied");
                            copyBtn.style.background =
                              "rgba(16, 185, 129, 0.15)";
                            copyBtn.style.border =
                              "1px solid rgba(16, 185, 129, 0.3)";
                            copyBtn.style.color = "rgba(16, 185, 129, 1)";
                            copyBtn.style.cursor = "default";
                            copyBtn.disabled = true;
                            Toast.success(I18n.t("settingsAdvanced.aboutTab.update.installCopied"));
                          } else {
                            Toast.error(I18n.t("settingsAdvanced.aboutTab.update.copyFailed"));
                          }
                        });
                      }
                    } else {
                      resultContainer.innerHTML = `
												<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(96, 165, 250, 0.15);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 12px;
													border-bottom-right-radius: 12px;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(96, 165, 250, 0.9);
														font-size: 13px;
													">
														<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
															<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
														</svg>
														<div>
															<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.latestVersion")}</div>
															<div style="opacity: 0.8; font-size: 12px;">${I18n.t("update.versionChange")} ${updateInfo.currentVersion}</div>
														</div>
													</div>
												</div>
											`;
                    }
                  }
                } catch (error) {
                  if (resultContainer) {
                    resultContainer.innerHTML = `
											<div style="
												padding: 16px 20px;
												background: rgba(255, 255, 255, 0.03);
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid rgba(255, 255, 255, 0.08);
												border-right: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom-left-radius: 12px;
												border-bottom-right-radius: 12px;
												backdrop-filter: blur(30px) saturate(150%);
												-webkit-backdrop-filter: blur(30px) saturate(150%);
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: rgba(255, 107, 107, 0.9);
													font-size: 13px;
													font-weight: 500;
												">
													<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
													</svg>
													<div>
														<div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.updateCheckFailed")}</div>
														<div style="opacity: 0.8; font-size: 12px;">${I18n.t("notifications.checkNetworkConnection")}</div>
													</div>
												</div>
											</div>
										`;
                  }
                } finally {
                  button.textContent = originalText;
                  button.disabled = false;
                }
              },
            },
          ],
          onChange: () => { },
        }),

        react.createElement(SectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.patchNotes.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.patchNotes.subtitle"),
        }),
        react.createElement(
          "div",
          {
            id: "patch-notes-container",
            style: {
              padding: "20px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "0 0 12px 12px",
              backdropFilter: "blur(30px) saturate(150%)",
              WebkitBackdropFilter: "blur(30px) saturate(150%)",
              marginBottom: "24px",
              minHeight: "100px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.5)",
            },
          },
          I18n.t("settingsAdvanced.aboutTab.patchNotes.loading")
        )
      )
    )
  );
};

function openConfig() {
  const configContainer = react.createElement(ConfigModal);

  // Create a full-screen overlay instead of nested modal
  const overlay = document.createElement("div");
  overlay.id = "ivLyrics-settings-overlay";
  overlay.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	`;

  const modalContainer = document.createElement("div");
  modalContainer.style.cssText = `
		background: rgba(24, 24, 24, 0.95);
		backdrop-filter: blur(40px) saturate(180%);
		-webkit-backdrop-filter: blur(40px) saturate(180%);
		border-radius: 16px;
		max-width: 90vw;
		max-height: 90vh;
		width: 800px;
		overflow: hidden;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
	`;

  // Close on outside click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      document.body.removeChild(overlay);
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  overlay.appendChild(modalContainer);
  document.body.appendChild(overlay);

  // Render React component
  const dom =
    window.ivLyricsEnsureReactDOM?.() ||
    (typeof reactDOM !== "undefined"
      ? reactDOM
      : window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null);
  if (!dom?.render) {
    return;
  }
  dom.render(configContainer, modalContainer);
}

// 언어 변경 후 자동으로 설정 페이지 열기
(function checkReturnToSettings() {
  const shouldReturn = localStorage.getItem("ivLyrics:return-to-settings");
  if (shouldReturn === "true") {
    localStorage.removeItem("ivLyrics:return-to-settings");
    // DOM이 준비된 후 설정 열기
    const tryOpenSettings = () => {
      if (typeof openConfig === "function" && document.body) {
        // 약간의 지연을 두고 설정 열기
        setTimeout(() => {
          openConfig();
        }, 500);
      } else {
        setTimeout(tryOpenSettings, 100);
      }
    };
    tryOpenSettings();
  }
})();
