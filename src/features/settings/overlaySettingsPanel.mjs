export function createOverlaySettingsPanel({
  react, translate, getSender, listenForConnection, openDownload,
  notifySuccess, notifyError, onToggleRowPointerDown, onToggleRowClick, getConfigSlider,
}) {
  const { useState, useEffect } = react;

  return function OverlaySettings() {
    const sender = getSender();
    const [enabled, setEnabled] = useState(sender?.enabled ?? false);
    const [trimMetadata, setTrimMetadata] = useState(sender?.trimMetadata ?? false);
    const [isConnected, setIsConnected] = useState(sender?.isConnected ?? false);
    const [port, setPort] = useState(sender?.port ?? 15000);
    const [portInput, setPortInput] = useState(String(sender?.port ?? 15000));

    // 연결 상태 이벤트 리스너
    useEffect(() => {
      const handleConnection = (e) => {
        setIsConnected(e.detail.connected);
      };
      const unsubscribe = listenForConnection(handleConnection);

      // 초기 연결 상태 확인
      const sender = getSender();
      if (sender) {
        setIsConnected(sender.isConnected);
        setPort(sender.port);
        setPortInput(String(sender.port));
        // 연결 확인 폴링은 기능이 켜져 있을 때만 필요하다. 설정 모달이
        // 열렸다는 이유만으로 비활성 오버레이를 계속 탐색하지 않는다.
        sender.setSettingsOpen?.(enabled);
      }

      return () => {
        unsubscribe();
        // 설정창 닫힘 알림
        getSender()?.setSettingsOpen?.(false);
      };
    }, [enabled]);

    // 토글 핸들러
    const handleToggle = () => {
      const newValue = !enabled;
      setEnabled(newValue);
      const sender = getSender();
      if (sender) {
        sender.enabled = newValue;
        sender.setSettingsOpen?.(newValue);
      }
    };

    const handleTrimMetadata = (value) => {
      const sender = getSender();
      if (!sender) return;
      sender.trimMetadata = value;
      setTrimMetadata(value);
    };

    // 포트 변경 핸들러
    const handlePortChange = (e) => {
      setPortInput(e.target.value);
    };

    // 포트 저장 핸들러
    const handlePortSave = () => {
      const newPort = parseInt(portInput, 10);
      if (newPort === port) {
        setPortInput(String(port));
        return;
      }
      if (newPort >= 1024 && newPort <= 65535) {
        setPort(newPort);
        const sender = getSender();
        if (sender) {
          sender.port = newPort;
        }
        notifySuccess(translate("overlay.portSaved"));
      } else {
        setPortInput(String(port));
        notifyError(translate("overlay.portInvalid"));
      }
    };

    // 다운로드 URL
    const handleDownload = () => {
      const url = getSender()?.getDownloadUrl?.() || 'https://ivlis.kr/ivLyrics/extensions/#overlay';
      openDownload(url);
    };

    // 상태 텍스트
    const getStatusText = () => {
      if (isConnected) return translate("overlay.status.connected");
      return translate("overlay.status.disconnected");
    };

    const statusTone = isConnected ? "is-ok" : "is-error";

    const renderOverlayEnableRow = () =>
      // Enable/Disable Row
      react.createElement(
        "div",
        { className: "setting-row is-inline is-toggle-row" },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            {
              className: "setting-row-left",
              onPointerDown: onToggleRowPointerDown,
              onClick: onToggleRowClick,
            },
            react.createElement("div", { className: "setting-name-row" },
              react.createElement("div", { className: "setting-name" }, translate("overlay.enabled.label")),
              // Status Tag (Connected / Disconnected / Checking) only when enabled
              enabled && react.createElement("span", {
                className: `settings-pill settings-status-pill ${statusTone}`,
              }, getStatusText())
            ),
            react.createElement("div", { className: "setting-description" },
              translate("overlay.enabled.desc")
            )
          ),
          react.createElement(
            "div",
            { className: "setting-row-right" },
            // Download Button (Only if enabled AND disconnected)
            enabled && !isConnected && react.createElement(
              "button",
              {
                type: "button",
                className: "btn settings-btn is-small",
                onClick: handleDownload,
              },
              translate("overlay.download")
            ),
            // Toggle Switch
            react.createElement(
              "button",
              {
                type: "button",
                className: `switch-checkbox${enabled ? " active" : ""}`,
                onClick: handleToggle,
                "aria-checked": enabled,
                "aria-label": translate("overlay.enabled.label"),
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
      );

    const renderOverlayTrimRow = () =>
      react.createElement(
        "div",
        { className: "setting-row is-inline is-toggle-row", "data-setting-key": "overlay-trim-metadata" },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            {
              className: "setting-row-left",
              onPointerDown: onToggleRowPointerDown,
              onClick: onToggleRowClick,
            },
            react.createElement("div", { className: "setting-name-row" },
              react.createElement("div", { className: "setting-name" }, translate("overlay.trimMetadata.label"))),
            react.createElement("div", { className: "setting-description" }, translate("overlay.trimMetadata.desc"))
          ),
          react.createElement(
            "div",
            { className: "setting-row-right" },
            react.createElement(getConfigSlider(), {
              name: translate("overlay.trimMetadata.label"),
              defaultValue: trimMetadata,
              disabled: !enabled || !sender,
              onChange: handleTrimMetadata
            })
          )
        )
      );

    const renderOverlayPortRow = () =>
      // Port Setting Row (Only shown when enabled)
      enabled && react.createElement(
        "div",
        { className: "setting-row is-inline" },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            { className: "setting-row-left" },
            react.createElement("div", { className: "setting-name-row" },
              react.createElement("div", { className: "setting-name" },
                translate("overlay.port.label")
              )),
            react.createElement("div", { className: "setting-description" },
              translate("overlay.port.desc")
            )
          ),
          react.createElement(
            "div",
            { className: "setting-row-right" },
            react.createElement("input", {
              type: "text",
              inputMode: "numeric",
              autoComplete: "off",
              spellCheck: false,
              maxLength: 5,
              className: "settings-port-input",
              "aria-label": translate("overlay.port.label"),
              value: portInput,
              onChange: handlePortChange,
              onBlur: handlePortSave,
              onKeyDown: (e) => { if (e.key === 'Enter') handlePortSave(); },
            })
          )
        )
      );

    return react.createElement(
      "div",
      { className: "option-list-wrapper" },
      // Enable/Disable Row
      renderOverlayEnableRow(),
      renderOverlayTrimRow(),
      // Port Setting Row (Only shown when enabled)
      renderOverlayPortRow()
    );
  }
}
