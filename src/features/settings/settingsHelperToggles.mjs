export function createSettingsHelperToggles({
  react, translate, getCheckIcon, getVideoHelper, getLyricsHelper, isSettingsOpen,
  openDownload, saveLyricsHelperSetting, publish, listenForLyricsHelperConnection,
  scheduleCheck, cancelCheck,
}) {
  const { useState, useEffect } = react;

  const renderSettingsHelperToggle = ({
    settingKey, enabled, isConnected, disabled, label, description, downloadLabel,
    statusText, handleDownload, handleToggle
  }) => {
    return react.createElement(
      "div",
      { className: "setting-row", "data-setting-key": settingKey },
      react.createElement(
        "div",
        { className: "setting-row-content" },
        react.createElement(
          "div",
          { className: "setting-row-left" },
          react.createElement(
            "div",
            { className: "setting-name" },
            label,
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
            }, statusText)
          ),
          react.createElement(
            "div",
            { className: "setting-description" },
            description
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
            downloadLabel
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
                __html: getCheckIcon(),
              },
            })
          )
        )
      )
    );
  };

  const VideoHelperToggle = ({ name, settingKey, defaultValue, disabled, onChange = () => { } }) => {
    const [enabled, setEnabled] = useState(defaultValue === "true" || defaultValue === true);
    const [isConnected, setIsConnected] = useState(false);
    const [checking, setChecking] = useState(false);

    // 초기 연결 상태 확인 및 설정창 열려있는 동안 주기적 체크
    useEffect(() => {
      let isMounted = true;
      let checkInProgress = false;

      const checkConnection = async ({ showChecking = false } = {}) => {
        if (!isMounted || checkInProgress) return;
        const service = getVideoHelper();
        if (service === undefined) return;

        if (!isSettingsOpen()) return;

        checkInProgress = true;
        if (showChecking) setChecking(true);
        try {
          const connected = await service.checkHealth();
          if (isMounted) {
            setIsConnected(connected);
          }
        } finally {
          checkInProgress = false;
          if (isMounted && showChecking) {
            setChecking(false);
          }
        }
      };

      // 활성화 시 즉시 체크
      if (enabled) {
        checkConnection({ showChecking: true });
      } else {
        setIsConnected(false);
        setChecking(false);
      }

      // 주기 확인은 상태 배지를 "확인 중"으로 되돌리지 않는다.
      const interval = scheduleCheck(() => {
        if (enabled) checkConnection();
      }, 5000);

      return () => {
        isMounted = false;
        cancelCheck(interval);
      };
    }, [enabled]);

    const handleToggle = () => {
      if (disabled) return;
      const newValue = !enabled;
      setEnabled(newValue);
      onChange(settingKey || name, newValue);

      // 즉시 적용을 위해 이벤트 발생
      publish("ivLyrics:videoHelperChanged", { enabled: newValue });
    };

    const handleDownload = () => {
      const service = getVideoHelper();
      if (service !== undefined) {
        service.openDownloadPage();
      } else {
        openDownload();
      }
    };

    const getStatusText = () => {
      if (checking) return translate("settings.videoHelper.status.checking");
      if (isConnected) return "✓ " + translate("settings.videoHelper.status.connected");
      return translate("settings.videoHelper.status.disconnected");
    };

    return renderSettingsHelperToggle({
      settingKey, enabled, isConnected, disabled, handleDownload, handleToggle,
      label: translate("settings.videoHelper.label"),
      description: translate("settings.videoHelper.desc"),
      downloadLabel: translate("settings.videoHelper.download"),
      statusText: getStatusText()
    });
  };

  // Lyrics Helper Toggle - 가사 헬퍼 연결 토글
  const LyricsHelperToggle = ({ name, settingKey, defaultValue, disabled, onChange = () => { } }) => {
    const [enabled, setEnabled] = useState(defaultValue === "true" || defaultValue === true);
    const [isConnected, setIsConnected] = useState(false);
    const [checking, setChecking] = useState(false);

    // 초기 연결 상태 확인 및 설정창 열려있는 동안 주기적 체크
    useEffect(() => {
      let isMounted = true;

      const checkConnection = async () => {
        if (!isMounted) return;
        const sender = getLyricsHelper();
        if (sender === undefined) return;

        if (!isSettingsOpen()) return;

        setChecking(true);
        const connected = await sender.checkConnection();
        if (isMounted) {
          setIsConnected(connected);
          setChecking(false);
        }
      };

      // 활성화 시 즉시 체크
      if (enabled) {
        checkConnection();
      }

      // lyricsHelperSender 연결 이벤트 리스너
      const handleConnectionChange = (e) => {
        if (isMounted) {
          setIsConnected(e.detail?.connected || false);
        }
      };
      const unsubscribe = listenForLyricsHelperConnection(handleConnectionChange);

      // 설정창 열려있는 동안 주기적 연결 확인 (5초마다, 활성화 시만)
      const interval = scheduleCheck(() => {
        if (enabled) checkConnection();
      }, 5000);

      return () => {
        isMounted = false;
        cancelCheck(interval);
        unsubscribe();
      };
    }, [enabled]);

    const handleToggle = () => {
      if (disabled) return;
      const newValue = !enabled;
      setEnabled(newValue);
      onChange(name, newValue);
      saveLyricsHelperSetting(name, newValue);

      // lyricsHelperSender 활성화/비활성화
      const sender = getLyricsHelper();
      if (sender) sender.enabled = newValue;

      publish("ivLyrics:lyricsHelperChanged", { enabled: newValue });
    };

    const handleDownload = () => {
      openDownload();
    };

    const getStatusText = () => {
      if (checking) return translate("settings.lyricsHelper.status.checking") || "Checking...";
      if (isConnected) return "✓ " + (translate("settings.lyricsHelper.status.connected") || "Connected");
      return translate("settings.lyricsHelper.status.disconnected") || "Not connected";
    };

    return renderSettingsHelperToggle({
      settingKey, enabled, isConnected, disabled, handleDownload, handleToggle,
      label: translate("settings.lyricsHelper.label"),
      description: translate("settings.lyricsHelper.desc"),
      downloadLabel: translate("settings.lyricsHelper.download") || "Download",
      statusText: getStatusText()
    });
  };

  return { VideoHelperToggle, LyricsHelperToggle };
}
