import { commitSettingsControlValue } from "./settingsControlCommit.mjs";

export function createSettingsHelperToggles({
  react, translate, getCheckIcon, getVideoHelper, getLyricsHelper, isSettingsOpen,
  openDownload, onSaveError, listenForLyricsHelperConnection,
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

  const videoHelper = {
    getService: getVideoHelper,
    probe: service => service.checkHealth(),
    download: () => {
      const service = getVideoHelper();
      if (service) service.openDownloadPage();
      else openDownload();
    },
    getStatusText: ({ checking, connected }) => {
      if (checking) return translate("settings.videoHelper.status.checking");
      if (connected) return "✓ " + translate("settings.videoHelper.status.connected");
      return translate("settings.videoHelper.status.disconnected");
    },
    labelKey: "settings.videoHelper",
  };
  const lyricsHelper = {
    getService: getLyricsHelper,
    probe: service => service.checkConnection(),
    listen: listenForLyricsHelperConnection,
    showPeriodicChecking: true,
    download: openDownload,
    downloadFallback: "Download",
    getStatusText: ({ checking, connected }) => {
      if (checking) return translate("settings.lyricsHelper.status.checking") || "Checking...";
      if (connected) return "✓ " + (translate("settings.lyricsHelper.status.connected") || "Connected");
      return translate("settings.lyricsHelper.status.disconnected") || "Not connected";
    },
    labelKey: "settings.lyricsHelper",
  };

  function useConnectionStatus(enabled, helper) {
    const [connected, setConnected] = useState(false);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
      if (!enabled) {
        setConnected(false);
        setChecking(false);
        return;
      }
      let active = true;
      let pending = false;

      const checkConnection = async (showChecking) => {
        if (pending || !active || !isSettingsOpen()) return;
        const service = helper.getService();
        if (!service) return;
        pending = true;
        if (showChecking) setChecking(true);
        try {
          const reachable = await helper.probe(service);
          if (active) setConnected(Boolean(reachable));
        } catch {
          if (active) setConnected(false);
        } finally {
          pending = false;
          if (active && showChecking) setChecking(false);
        }
      };

      const unsubscribe = helper.listen?.(event => {
        if (active) setConnected(Boolean(event.detail?.connected));
      });
      void checkConnection(true);
      const interval = scheduleCheck(() => void checkConnection(helper.showPeriodicChecking), 5000);

      return () => {
        active = false;
        cancelCheck(interval);
        unsubscribe?.();
      };
    }, [enabled, helper]);

    return { connected, checking };
  }

  function useHelperToggle({ name, settingKey, defaultValue, disabled, onChange = () => false }, helper) {
    const enabled = defaultValue === true || defaultValue === "true";
    const status = useConnectionStatus(enabled, helper);
    return renderSettingsHelperToggle({
      settingKey, enabled, isConnected: status.connected, disabled,
      label: translate(`${helper.labelKey}.label`),
      description: translate(`${helper.labelKey}.desc`),
      downloadLabel: translate(`${helper.labelKey}.download`) || helper.downloadFallback || "",
      statusText: helper.getStatusText(status),
      handleDownload: helper.download,
      handleToggle: () => {
        if (!disabled) commitSettingsControlValue(onChange, onSaveError, settingKey || name, !enabled);
      },
    });
  }

  const VideoHelperToggle = (props) => useHelperToggle(props, videoHelper);
  const LyricsHelperToggle = (props) => useHelperToggle(props, lyricsHelper);

  return { VideoHelperToggle, LyricsHelperToggle };
}
