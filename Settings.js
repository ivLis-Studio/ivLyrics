const ButtonSVG = react.memo(
  ({ icon, active = true, onClick, disabled = false, label }) => {
    return react.createElement(
      "button",
      {
        type: "button",
        className: `switch-checkbox${active ? " active" : ""}`,
        onClick,
        disabled,
        "aria-checked": active,
        "aria-label": label,
        role: "switch",
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

function buildOrderedProviderList(providers, providerOrder) {
  const safeProviders = Array.isArray(providers) ? providers : [];
  const safeProviderOrder = Array.isArray(providerOrder) ? providerOrder : [];
  const providersById = new Map(safeProviders.map((provider) => [provider.id, provider]));
  const orderedIds = new Set(safeProviderOrder);
  const sortedProviders = [];

  safeProviderOrder.forEach((id) => {
    const provider = providersById.get(id);
    if (provider) {
      sortedProviders.push(provider);
    }
  });

  safeProviders.forEach((provider) => {
    if (!orderedIds.has(provider.id)) {
      sortedProviders.push(provider);
    }
  });

  return sortedProviders;
}

function reorderProviderList(providers, providerOrder, sourceId, targetId, position = "before") {
  const orderedIds = buildOrderedProviderList(providers, providerOrder).map((provider) => provider.id);
  if (!sourceId || !targetId || sourceId === targetId) return orderedIds;

  const sourceIndex = orderedIds.indexOf(sourceId);
  if (sourceIndex === -1) return orderedIds;
  orderedIds.splice(sourceIndex, 1);

  const targetIndex = orderedIds.indexOf(targetId);
  if (targetIndex === -1) return orderedIds;
  orderedIds.splice(targetIndex + (position === "after" ? 1 : 0), 0, sourceId);
  return orderedIds;
}

const ProviderDragHandle = ({ provider, label, onDragStart, onDragEnd, onMove }) =>
  react.createElement("button", {
    type: "button",
    className: "provider-drag-handle",
    draggable: true,
    title: label,
    "aria-label": label,
    onDragStart: (event) => onDragStart(event, provider.id),
    onDragEnd,
    onKeyDown: (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      onMove(provider.id, event.key === "ArrowUp" ? "up" : "down");
    },
  },
    react.createElement("svg", {
      width: 16,
      height: 20,
      viewBox: "0 0 16 20",
      fill: "currentColor",
      "aria-hidden": "true",
    },
      [4, 10, 16].flatMap((y) => [5, 11].map((x) =>
        react.createElement("circle", { key: `${x}-${y}`, cx: x, cy: y, r: 1.35 })
      ))
    )
  );

const SETTINGS_OUTLINE_ICONS = Object.freeze({
  general: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6",
  "lyrics-providers": "M9 18V5l10-2v13M9 8l10-2M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10-2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  "ai-providers": "M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Zm13-1 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z",
  appearance: "M12 3a9 9 0 0 0 0 18h1.4a2.1 2.1 0 0 0 0-4.2h-1a1.7 1.7 0 0 1 0-3.4H15a6 6 0 0 0 0-12h-3ZM7.5 9h.01M9.5 6h.01M15 6.5h.01M17 10h.01",
  performance: "M4.3 18a9 9 0 1 1 15.4 0M12 12l4-4M7 18h10",
  lyrics: "M5 7h8M5 12h6M5 17h8M16 8l4 4-4 4V8Z",
  fullscreen: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5",
  nowplaying: "M3 5h18v14H3V5Zm11 0v14M17 9h1M17 13h1",
  advanced: "M4 7h6M14 7h6M4 17h10M18 17h2M10 4v6M14 14v6",
  debug: "M9 9h6v8a3 3 0 0 1-6 0V9Zm3-5v5M8 4l2 2M16 4l-2 2M5 11h4M15 11h4M5 16h4M15 16h4",
  about: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6M12 7h.01",
  karaoke: "M12 14a4 4 0 0 0 4-4V5a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Zm-7-4a7 7 0 0 0 14 0M12 17v4M9 21h6",
  character: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
  word: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5",
  synced: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2",
  unsynced: "M5 6h14M5 12h14M5 18h9",
  ivsync: "M20 7h-5V2M4 17h5v5M5.5 8a8 8 0 0 1 13-2L20 7M4 17l1.5 1A8 8 0 0 0 18.5 16",
  translate: "M4 5h8M8 3v2M6 5c0 4 2 7 6 9M11 5c-.4 3.4-2.2 6.2-5.5 8M14 21l3.5-9L21 21M15.5 18h4",
  metadata: "M4 4h7l9 9-7 7-9-9V4Zm4 4h.01",
  tmi: "M21 12a9 9 0 0 1-9 9H5l1.8-3.2A9 9 0 1 1 21 12Zm-9-1v5M12 7h.01",
  lyricsStudy: "M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z",
  characterPronunciation: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
  culturalAnnotations: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-20c3 3 4.5 6.3 4.5 10S15 19 12 22M12 2C9 5 7.5 8.3 7.5 12S9 19 12 22M2 12h20",
});

const SettingsOutlineIcon = ({ name, className = "", size = 16 }) =>
  react.createElement("svg", {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  }, react.createElement("path", { d: SETTINGS_OUTLINE_ICONS[name] || SETTINGS_OUTLINE_ICONS.general }));

const ProviderSupportIconChip = ({ type, label }) =>
  react.createElement("span", {
    className: `support-icon-chip support-icon-${type}`,
    role: "img",
    "aria-label": label,
    title: label,
  }, react.createElement(SettingsOutlineIcon, { name: type, size: 14 }));

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
      // 연결 확인 폴링은 기능이 켜져 있을 때만 필요하다. 설정 모달이
      // 열렸다는 이유만으로 비활성 오버레이를 계속 탐색하지 않는다.
      window.OverlaySender.setSettingsOpen?.(enabled);
    }

    return () => {
      window.removeEventListener('ivLyrics:overlay-connection', handleConnection);
      // 설정창 닫힘 알림
      window.OverlaySender?.setSettingsOpen?.(false);
    };
  }, [enabled]);

  // 토글 핸들러
  const handleToggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    if (window.OverlaySender) {
      window.OverlaySender.enabled = newValue;
      window.OverlaySender.setSettingsOpen?.(newValue);
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

function getAboutAccountThemeTokens() {
  const isLightTheme = getSettingsUiTheme() === "light";

  return {
    textPrimary: "var(--text-primary, #f6f8fb)",
    textSecondary: "var(--text-secondary, rgba(246, 248, 251, 0.72))",
    textTertiary: "var(--text-tertiary, rgba(246, 248, 251, 0.48))",
    panelBackground: isLightTheme ? "rgba(15, 23, 42, 0.04)" : "rgba(255, 255, 255, 0.03)",
    panelBorder: isLightTheme ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.1)",
    inputBackground: isLightTheme ? "rgba(255, 255, 255, 0.82)" : "rgba(0, 0, 0, 0.2)",
    inputBorder: isLightTheme ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.1)",
    subtleButtonBackground: isLightTheme ? "rgba(15, 23, 42, 0.06)" : "rgba(255, 255, 255, 0.05)",
    subtleButtonBackgroundHover: isLightTheme ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.1)",
    subtleButtonBorder: isLightTheme ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.15)",
    subtleButtonBorderHover: isLightTheme ? "rgba(15, 23, 42, 0.2)" : "rgba(255, 255, 255, 0.25)",
    subtleButtonText: isLightTheme ? "rgba(15, 23, 42, 0.82)" : "rgba(255, 255, 255, 0.8)",
    subtleButtonTextHover: "var(--text-primary, #f6f8fb)",
    emptyText: isLightTheme ? "rgba(15, 23, 42, 0.46)" : "#888",
    sectionDivider: isLightTheme ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.1)",
  };
}

const SettingsBackup = () => null;

function getDiscordAccountCopy() {
  const baseKey = "settingsAdvanced.aboutTab.account";
  return {
    provider: "Discord",
    description:
      I18n.t(`${baseKey}.description`) ||
      "Connect your ivLyrics contributions and nickname with Discord.",
    info:
      I18n.t(`${baseKey}.info`) ||
      "Sign in with Discord to manage your creator profile. Existing anonymous contributions are not transferred automatically without ownership verification.",
    loginButton:
      I18n.t(`${baseKey}.loginButton`) || "Sign In With Discord",
    loggingIn:
      I18n.t(`${baseKey}.loggingIn`) || "Opening browser...",
    loading:
      I18n.t(`${baseKey}.loading`) || "Loading Discord account information...",
    linked:
      I18n.t(`${baseKey}.linked`) || "Connected",
    refresh:
      I18n.t(`${baseKey}.refresh`) || "Refresh",
    linkedAt:
      I18n.t(`${baseKey}.linkedAt`) || "Linked",
    lastLoginAt:
      I18n.t(`${baseKey}.lastSync`) || "Last login",
    switchAccount:
      I18n.t(`${baseKey}.manageAccount`) || "Change Account",
    startHint:
      I18n.t(`${baseKey}.startHint`) || "Complete the Discord sign-in flow in your browser.",
    failed:
      I18n.t(`${baseKey}.failed`) || "Discord login failed.",
    loadFailed:
      I18n.t(`${baseKey}.loadFailed`) || "Failed to load account information.",
    logout:
      I18n.t(`${baseKey}.logout`) || "Log Out",
    logoutFailed:
      I18n.t(`${baseKey}.logoutFailed`) ||
      "Failed to sign out from Discord.",
    logoutSuccess:
      I18n.t(`${baseKey}.logoutSuccess`) ||
      "Signed out from Discord and created a new user hash.",
  };
}

function formatEpochLabel(epochSeconds) {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toLocaleString();
}

// 닉네임 설정 컴포넌트
const NicknameSection = ({ userHash }) => {
  const [nickname, setNickname] = useState("");
  const [inputNickname, setInputNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const themeTokens = getAboutAccountThemeTokens();

  const fetchNickname = async () => {
    try {
      if (Utils.isDiscordUserHash?.(userHash) && !Utils.getAuthToken?.()) {
        setNickname("");
        setInputNickname("");
        return;
      }

      const res = await fetch(
        `${Utils.getAccountApiBase()}/nickname?userHash=${encodeURIComponent(userHash)}`,
        {
          cache: "no-store",
          headers: Utils.getApiHeaders({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          }),
        }
      );
      const data = await res.json();
      if (data.nickname) {
        setNickname(data.nickname);
        setInputNickname(data.nickname);
      } else {
        setNickname("");
        setInputNickname("");
      }
    } catch (e) {
      console.error("Failed to fetch nickname:", e);
    }
  };

  useEffect(() => {
    fetchNickname();
  }, [userHash]);

  const handleSave = async () => {
    if (!inputNickname.trim()) {
      Toast.error(I18n.t("settingsAdvanced.aboutTab.account.nickname.enter"));
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${Utils.getAccountApiBase()}/nickname`, {
        method: "POST",
        headers: Utils.getApiHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ userHash, nickname: inputNickname }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNickname(data.nickname);
        setInputNickname(data.nickname);
        setEditing(false);
        Toast.success(I18n.t("settingsAdvanced.aboutTab.account.nickname.changed"));
        window.SyncDataService?.clearCache?.();
      } else {
        Toast.error(data.error || I18n.t("settingsAdvanced.aboutTab.account.nickname.failed"));
      }
    } catch (e) {
      Toast.error(I18n.t("settingsAdvanced.aboutTab.account.nickname.error"));
    } finally {
      setLoading(false);
    }
  };

  return react.createElement(
    "div",
    {
      style: {
        padding: "16px",
        background: themeTokens.panelBackground,
        borderRadius: "12px",
        border: `1px solid ${themeTokens.panelBorder}`,
        marginTop: "16px",
        marginBottom: "16px",
      },
    },
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        },
      },
      react.createElement(
        "div",
        { style: { minWidth: 0 } },
        react.createElement(
          "div",
          { style: { fontSize: "12px", color: themeTokens.textTertiary, marginBottom: "4px" } },
          I18n.t("settingsAdvanced.aboutTab.account.nickname.label")
        ),
        editing
          ? react.createElement("input", {
              type: "text",
              value: inputNickname,
              onChange: (e) => setInputNickname(e.target.value),
              placeholder: I18n.t("settingsAdvanced.aboutTab.account.nickname.placeholder"),
              autoFocus: true,
              maxLength: 20,
              style: {
                background: themeTokens.inputBackground,
                border: "1px solid #5865f2",
                borderRadius: "6px",
                color: themeTokens.textPrimary,
                padding: "8px 10px",
                fontSize: "14px",
                width: "180px",
                maxWidth: "100%",
              },
            })
          : react.createElement(
              "div",
              { style: { fontSize: "16px", fontWeight: "600", color: themeTokens.textPrimary } },
              nickname || I18n.t("settingsAdvanced.aboutTab.account.nickname.none")
            )
      ),
      react.createElement(
        "button",
        {
          onClick: editing ? handleSave : () => setEditing(true),
          disabled: loading,
          style: {
            padding: "8px 12px",
            borderRadius: "8px",
            background: editing ? "#5865f2" : themeTokens.subtleButtonBackground,
            color: editing ? "#fff" : themeTokens.subtleButtonText,
            border: "none",
            fontSize: "12px",
            cursor: "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          },
        },
        loading
          ? I18n.t("settingsAdvanced.aboutTab.account.nickname.saving")
          : editing
            ? I18n.t("settingsAdvanced.aboutTab.account.nickname.save")
            : I18n.t("settingsAdvanced.aboutTab.account.nickname.change")
      )
    )
  );
};

function getCreatorPrivacyCopy() {
  const baseKey = "settingsAdvanced.aboutTab.account.creatorPrivacy";
  return {
    title: I18n.t(`${baseKey}.title`) || "Private creator profile",
    description:
      I18n.t(`${baseKey}.description`) ||
      "Private profiles remain in contributor lists, but your name, photo, and profile links are hidden.",
    publicLabel: I18n.t(`${baseKey}.public`) || "Public",
    privateLabel: I18n.t(`${baseKey}.private`) || "Private",
    loading: I18n.t(`${baseKey}.loading`) || "Loading privacy setting...",
    loadFailed:
      I18n.t(`${baseKey}.loadFailed`) || "Failed to load creator profile privacy.",
    saveFailed:
      I18n.t(`${baseKey}.saveFailed`) || "Failed to update creator profile privacy.",
    savedPublic:
      I18n.t(`${baseKey}.savedPublic`) || "Your creator profile is now public.",
    savedPrivate:
      I18n.t(`${baseKey}.savedPrivate`) || "Your creator profile is now private.",
  };
}

const CreatorPrivacySection = ({ userHash }) => {
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const themeTokens = getAboutAccountThemeTokens();
  const copy = getCreatorPrivacyCopy();

  const loadPrivacy = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await Utils.fetchSyncCreatorPrivacy();
      setIsPrivate(data?.isPrivate === true || data?.profilePublic === false);
    } catch (privacyError) {
      console.error("Failed to load creator profile privacy:", privacyError);
      setError(privacyError.message || copy.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrivacy();
  }, [userHash]);

  const handleToggle = async () => {
    if (loading || saving) return;

    const nextPrivate = !isPrivate;
    try {
      setSaving(true);
      setError(null);
      const data = await Utils.setSyncCreatorPrivacy(nextPrivate);
      const savedPrivate = data?.isPrivate === true || data?.profilePublic === false;
      setIsPrivate(savedPrivate);
      window.SyncDataService?.clearCache?.();
      window.dispatchEvent(
        new CustomEvent("ivLyrics:creator-privacy-changed", {
          detail: {
            isPrivate: savedPrivate,
            profilePublic: !savedPrivate,
          },
        })
      );
      Toast.success(savedPrivate ? copy.savedPrivate : copy.savedPublic);
    } catch (privacyError) {
      console.error("Failed to update creator profile privacy:", privacyError);
      const message = privacyError.message || copy.saveFailed;
      setError(message);
      Toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving;
  const statusLabel = loading ? copy.loading : (isPrivate ? copy.privateLabel : copy.publicLabel);

  return react.createElement(
    "div",
    {
      style: {
        marginTop: "4px",
        padding: "18px 2px 2px",
        borderTop: `1px solid ${themeTokens.panelBorder}`,
      },
    },
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
        },
      },
      react.createElement(
        "div",
        { style: { minWidth: 0, flex: 1 } },
        react.createElement(
          "div",
          {
            style: {
              color: themeTokens.textPrimary,
              fontSize: "14px",
              fontWeight: "700",
              marginBottom: "5px",
            },
          },
          copy.title
        ),
        react.createElement(
          "p",
          {
            style: {
              margin: 0,
              color: themeTokens.textSecondary,
              fontSize: "12px",
              lineHeight: "1.55",
              maxWidth: "620px",
            },
          },
          copy.description
        )
      ),
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          },
        },
        react.createElement(
          "span",
          {
            style: {
              color: error ? "#f87171" : themeTokens.textSecondary,
              fontSize: "12px",
              fontWeight: "700",
              whiteSpace: "nowrap",
            },
          },
          error || statusLabel
        ),
        react.createElement(
          "button",
          {
            type: "button",
            role: "switch",
            "aria-checked": isPrivate,
            "aria-label": copy.title,
            disabled,
            onClick: handleToggle,
            style: {
              width: "42px",
              height: "24px",
              padding: "2px",
              borderRadius: "999px",
              border: `1px solid ${isPrivate ? "rgba(34, 197, 94, 0.55)" : themeTokens.subtleButtonBorder}`,
              background: isPrivate ? "rgba(34, 197, 94, 0.2)" : themeTokens.subtleButtonBackground,
              cursor: disabled ? "wait" : "pointer",
              opacity: disabled ? 0.55 : 1,
              transition: "background 160ms ease, border-color 160ms ease, opacity 160ms ease",
              flexShrink: 0,
            },
          },
          react.createElement("span", {
            "aria-hidden": "true",
            style: {
              display: "block",
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: isPrivate ? "#22c55e" : themeTokens.textTertiary,
              transform: isPrivate ? "translateX(18px)" : "translateX(0)",
              transition: "transform 180ms cubic-bezier(.2,.8,.2,1), background 160ms ease",
            },
          })
        )
      )
    )
  );
};

const AccountSection = () => {
  const [accountInfo, setAccountInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [error, setError] = useState(null);
  const themeTokens = getAboutAccountThemeTokens();
  const copy = getDiscordAccountCopy();

  const loadAccountInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await Utils.fetchAccountProfile();
      if (data.authenticated && data.linked && data.account) {
        setAccountInfo(data.account);
      } else {
        setAccountInfo(null);
      }
    } catch (err) {
      console.error("Failed to load Discord account info:", err);
      setError(err.message || copy.loadFailed);
      setAccountInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccountInfo();

    const handleAccountChanged = () => {
      loadAccountInfo();
    };
    window.addEventListener("ivLyrics:account-changed", handleAccountChanged);

    return () => {
      window.removeEventListener("ivLyrics:account-changed", handleAccountChanged);
    };
  }, []);

  const openLoginPage = async () => {
    try {
      setLoginLoading(true);
      await Utils.startDiscordLogin();
      Toast.success(copy.startHint);
    } catch (err) {
      Toast.error(err.message || copy.failed);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRefresh = () => {
    loadAccountInfo();
  };

  const handleLogout = async () => {
    try {
      setLogoutLoading(true);
      await Utils.logoutDiscordSession();
      const nextUserHash = Utils.resetUserHash();
      setAccountInfo(null);
      setError(null);
      window.SyncDataService?.clearCache?.();
      window.dispatchEvent(
        new CustomEvent("ivLyrics:account-changed", {
          detail: {
            linked: false,
            userHash: nextUserHash,
          },
        })
      );
      Toast.success(copy.logoutSuccess);
      Utils.restoreAccountSettings({
        initialTab: "about",
        initialSettingKey: "about-account",
      });
    } catch (err) {
      console.error("Failed to log out from Discord:", err);
      Toast.error(err.message || copy.logoutFailed);
    } finally {
      setLogoutLoading(false);
    }
  };

  if (loading) {
    return react.createElement(
      "div",
      {
        className: "info-card",
        style: {
          padding: "20px",
          background: "linear-gradient(145deg, rgba(88, 101, 242, 0.1) 0%, rgba(46, 51, 122, 0.16) 100%)",
          border: "1px solid rgba(88, 101, 242, 0.22)",
          borderRadius: "0 0 12px 12px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "110px",
        },
      },
      react.createElement(
        "span",
        { style: { color: themeTokens.textSecondary, fontSize: "14px" } },
        copy.loading
      )
    );
  }

  if (!accountInfo) {
    return react.createElement(
      "div",
      {
        className: "info-card",
        style: {
          padding: "20px",
          background: "linear-gradient(145deg, rgba(88, 101, 242, 0.1) 0%, rgba(46, 51, 122, 0.16) 100%)",
          border: "1px solid rgba(88, 101, 242, 0.22)",
          borderRadius: "0 0 12px 12px",
          backdropFilter: "blur(30px) saturate(150%)",
          WebkitBackdropFilter: "blur(30px) saturate(150%)",
          marginBottom: "24px",
        },
      },
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "16px",
          },
        },
        react.createElement(
          "div",
          {
            style: {
              width: "52px",
              height: "52px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #5865f2 0%, #7983f5 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              flexShrink: 0,
            },
          },
          react.createElement(
            "svg",
            {
              width: "24",
              height: "24",
              viewBox: "0 0 24 24",
              fill: "currentColor",
            },
            react.createElement("path", {
              d: "M20.317 4.369A19.791 19.791 0 0 0 15.126 3c-.23.408-.499.957-.682 1.384a18.27 18.27 0 0 0-4.888 0A13.67 13.67 0 0 0 8.874 3a19.736 19.736 0 0 0-5.19 1.368C.533 9.067-.321 13.65.106 18.168a19.9 19.9 0 0 0 6.357 3.208c.513-.693.97-1.425 1.36-2.197-.748-.284-1.462-.634-2.134-1.04.178-.13.353-.267.522-.408 4.118 1.88 8.59 1.88 12.66 0 .17.141.344.278.523.408-.673.407-1.388.757-2.136 1.041.39.771.847 1.503 1.36 2.196a19.873 19.873 0 0 0 6.36-3.209c.5-5.238-.854-9.78-3.16-13.799ZM8.02 15.331c-1.24 0-2.26-1.131-2.26-2.525 0-1.394 1-2.525 2.26-2.525 1.26 0 2.279 1.15 2.26 2.525 0 1.394-1 2.525-2.26 2.525Zm7.96 0c-1.24 0-2.26-1.131-2.26-2.525 0-1.394 1-2.525 2.26-2.525 1.26 0 2.279 1.15 2.26 2.525 0 1.394-1 2.525-2.26 2.525Z",
            })
          )
        ),
        react.createElement(
          "div",
          { style: { flex: 1 } },
          react.createElement(
            "h3",
            {
              style: {
                margin: "0 0 4px",
                fontSize: "17px",
                color: themeTokens.textPrimary,
                fontWeight: "700",
              },
            },
            copy.provider
          ),
          react.createElement(
            "p",
            {
              style: {
                margin: 0,
                fontSize: "13px",
                color: themeTokens.textSecondary,
              },
            },
            copy.description
          )
        )
      ),
      react.createElement(
        "p",
        {
          style: {
            margin: "0 0 16px",
            fontSize: "13px",
            color: themeTokens.textSecondary,
            lineHeight: "1.7",
          },
        },
        copy.info
      ),
      error &&
        react.createElement(
          "p",
          {
            style: {
              margin: "0 0 12px",
              fontSize: "12px",
              color: "#f87171",
            },
          },
          error
        ),
      react.createElement(
        "button",
        {
          onClick: openLoginPage,
          disabled: loginLoading || logoutLoading,
          style: {
            width: "100%",
            padding: "12px 20px",
            background: "linear-gradient(135deg, #5865f2 0%, #7983f5 100%)",
            border: "none",
            borderRadius: "10px",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: "700",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          },
        },
        loginLoading ? copy.loggingIn : copy.loginButton
      )
    );
  }

  return react.createElement(
    "div",
    {
      className: "info-card",
      style: {
        padding: "20px",
        background: "linear-gradient(145deg, rgba(88, 101, 242, 0.1) 0%, rgba(34, 197, 94, 0.08) 100%)",
        border: "1px solid rgba(88, 101, 242, 0.22)",
        borderRadius: "0 0 12px 12px",
        backdropFilter: "blur(30px) saturate(150%)",
        WebkitBackdropFilter: "blur(30px) saturate(150%)",
        marginBottom: "24px",
      },
    },
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "16px",
        },
      },
      react.createElement(
        "div",
        {
          style: {
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            background: accountInfo.profileImage
              ? `url(${accountInfo.profileImage}) center/cover no-repeat`
              : "linear-gradient(135deg, #5865f2 0%, #7983f5 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: "2px solid rgba(88, 101, 242, 0.25)",
            color: "#fff",
            fontSize: "18px",
            fontWeight: "700",
          },
        },
        !accountInfo.profileImage && (accountInfo.displayName || "D").slice(0, 1).toUpperCase()
      ),
      react.createElement(
        "div",
        { style: { flex: 1, minWidth: 0 } },
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "4px",
              flexWrap: "wrap",
            },
          },
          react.createElement(
            "h3",
            {
              style: {
                margin: 0,
                fontSize: "17px",
                color: themeTokens.textPrimary,
                fontWeight: "700",
              },
            },
            accountInfo.displayName || accountInfo.username || copy.provider
          ),
          react.createElement(
            "span",
            {
              style: {
                fontSize: "10px",
                padding: "3px 8px",
                borderRadius: "999px",
                backgroundColor: "rgba(34, 197, 94, 0.14)",
                color: "#4ade80",
                border: "1px solid rgba(34, 197, 94, 0.24)",
                fontWeight: "700",
              },
            },
            copy.linked
          )
        ),
        react.createElement(
          "p",
          {
            style: {
              margin: 0,
              fontSize: "13px",
              color: themeTokens.textSecondary,
            },
          },
          `@${accountInfo.username || "discord"}`
        )
      ),
      react.createElement(
        "button",
        {
          onClick: handleRefresh,
          title: copy.refresh,
          style: {
            padding: "8px",
            background: themeTokens.subtleButtonBackground,
            border: `1px solid ${themeTokens.subtleButtonBorder}`,
            borderRadius: "8px",
            color: themeTokens.subtleButtonText,
            cursor: "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        },
        react.createElement(
          "svg",
          {
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
          },
          react.createElement("polyline", { points: "23 4 23 10 17 10" }),
          react.createElement("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
        )
      )
    ),
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          gap: "16px",
          fontSize: "12px",
          color: themeTokens.textTertiary,
          marginBottom: "16px",
          flexWrap: "wrap",
        },
      },
      accountInfo.linkedAt &&
        react.createElement(
          "span",
          null,
          `${copy.linkedAt}: ${formatEpochLabel(accountInfo.linkedAt)}`
        ),
      accountInfo.lastLoginAt &&
        react.createElement(
          "span",
          null,
          `${copy.lastLoginAt}: ${formatEpochLabel(accountInfo.lastLoginAt)}`
        )
    ),
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          gap: "10px",
          marginBottom: "16px",
          flexWrap: "wrap",
        },
      },
      react.createElement(
        "button",
        {
          onClick: openLoginPage,
          disabled: loginLoading || logoutLoading,
          style: {
            flex: "1 1 220px",
            padding: "10px 16px",
            background: themeTokens.subtleButtonBackground,
            border: `1px solid ${themeTokens.subtleButtonBorder}`,
            borderRadius: "8px",
            color: themeTokens.subtleButtonText,
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
          },
        },
        loginLoading ? copy.loggingIn : copy.switchAccount
      ),
      react.createElement(
        "button",
        {
          onClick: handleLogout,
          disabled: loginLoading || logoutLoading,
          style: {
            flex: "1 1 160px",
            padding: "10px 16px",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "8px",
            color: "#f87171",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
          },
        },
        copy.logout
      )
    ),
    react.createElement(NicknameSection, { userHash: Utils.getUserHash() }),
    react.createElement(CreatorPrivacySection, { userHash: Utils.getUserHash() }),
    react.createElement(SettingsBackup, { userHash: Utils.getUserHash() })
  );
};

// AI Addon 개별 카드 컴포넌트 (아코디언 스타일 - LyricsProviderCard와 동일 스타일)
const AddonSettingsCard = ({ addon, isEnabled, onToggle, isExpanded, onExpandToggle }) => {
  const SettingsUI = useMemo(
    () => addon.getSettingsUI ? addon.getSettingsUI() : null,
    [addon, addon.getSettingsUI]
  );

  const [capabilities, setCapabilities] = useState({});

  useEffect(() => {
    if (window.AIAddonManager && addon.supports) {
      const initialCaps = {};
      Object.keys(addon.supports).forEach(cap => {
        if (addon.supports[cap]) {
          initialCaps[cap] = window.AIAddonManager.isCapabilityEnabled(addon.id, cap);
        }
      });
      setCapabilities(initialCaps);
    }
  }, [addon.id, isExpanded]); // isExpanded가 변경될 때도 상태 동기화 확인

  const toggleCapability = (cap) => {
    if (window.AIAddonManager) {
      const newValue = !capabilities[cap];
      setCapabilities(prev => ({ ...prev, [cap]: newValue }));
      window.AIAddonManager.setCapabilityEnabled(addon.id, cap, newValue);
    }
  };

  const getLocalizedDescription = (desc) => {
    if (typeof desc === 'string') return desc;
    const storedLang = (Spicetify.LocalStorage.get("ivLyrics:visual:language") || window.I18n?.getCurrentLanguage?.() || 'en')
      .replace(/"/g, '');
    const baseLang = storedLang.split('-')[0] || 'en';
    const normalizedZh = baseLang === 'zh'
      ? ((/tw|hant/i.test(storedLang) || storedLang === 'zh-TW') ? 'zh-TW' : 'zh-CN')
      : null;
    return desc[storedLang] || (normalizedZh && desc[normalizedZh]) || desc[baseLang] || desc['en'] || Object.values(desc)[0] || '';
  };

  // 아코디언 헤더 클릭 핸들러
  const handleHeaderClick = (e) => {
    // 버튼, 체크박스 클릭은 무시
    if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
    onExpandToggle();
  };

  // 지원 기능 뱃지 렌더링
  const renderSupportBadges = () => {
    const badges = [];
    if (addon.supports?.translate) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "translate", type: "translate", label: I18n.t("settings.aiProviders.supports.translate") || "Translation" }));
    }
    if (addon.supports?.metadata) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "metadata", type: "metadata", label: I18n.t("settings.aiProviders.supports.metadata") || "Metadata" }));
    }
    if (addon.supports?.tmi) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "tmi", type: "tmi", label: I18n.t("settings.aiProviders.supports.tmi") || "Research" }));
    }
    if (addon.supports?.lyricsStudy) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "lyricsStudy", type: "lyricsStudy", label: I18n.t("settings.aiProviders.supports.lyricsStudy") || "Lyrics study" }));
    }
    if (addon.supports?.characterPronunciation) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "characterPronunciation", type: "characterPronunciation", label: I18n.t("settings.aiProviders.supports.characterPronunciation") || "Pronunciation" }));
    }
    if (addon.supports?.culturalAnnotations) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "culturalAnnotations", type: "culturalAnnotations", label: I18n.t("settings.aiProviders.supports.culturalAnnotations") || "Cultural context" }));
    }
    return badges;
  };

  const hasCapabilities = addon.supports && Object.keys(addon.supports).some(k => addon.supports[k]);

  return react.createElement("div", {
    className: `lyrics-provider-card ${isExpanded ? 'expanded' : ''} ${isEnabled ? '' : 'disabled'}`,
    "data-setting-key": `ai-provider:${addon.id}`,
    "data-search-text": [
      addon.name,
      addon.author,
      getLocalizedDescription(addon.description),
      ...Object.keys(addon.supports || {})
        .filter((capability) => addon.supports[capability])
        .map((capability) =>
          `${capability} ${I18n.t(`settings.aiProviders.supports.${capability}`) || ""}`
        ),
    ].filter(Boolean).join(" "),
  },
    // 카드 헤더
    react.createElement("div", {
      className: "lyrics-provider-card-header",
      onClick: handleHeaderClick
    },
      // 왼쪽: 활성화 토글, 아이콘, 이름
      react.createElement("div", { className: "lyrics-provider-card-header-left" },
        react.createElement("label", { className: "lyrics-provider-toggle" },
          react.createElement("input", {
            type: "checkbox",
            checked: isEnabled,
            onChange: (e) => onToggle(e.target.checked)
          }),
          react.createElement("span", { className: "toggle-slider" })
        ),
        react.createElement("div", { className: "lyrics-provider-title-group" },
          react.createElement("span", { className: "lyrics-provider-name" }, addon.name),
          react.createElement("div", { className: "lyrics-provider-title-meta" },
            react.createElement("span", null, `v${addon.version}`),
            react.createElement("span", { className: "lyrics-provider-title-meta-divider" }, "•"),
            react.createElement("span", null, addon.author)
          ),
          react.createElement(
            "div",
            { className: "lyrics-provider-summary" },
            getLocalizedDescription(addon.description)
          )
        )
      ),
      // 오른쪽: 지원 뱃지, 확장 아이콘
      react.createElement("div", { className: "lyrics-provider-card-header-right" },
        react.createElement("div", { className: "support-badges" }, renderSupportBadges()),
        react.createElement("svg", {
          className: `lyrics-provider-expand-icon ${isExpanded ? 'expanded' : ''}`,
          width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
          stroke: "currentColor", strokeWidth: "2"
        },
          react.createElement("polyline", { points: "6 9 12 15 18 9" })
        )
      )
    ),
    // 확장 영역 (설정 UI + Capabilities)
    isExpanded && (hasCapabilities || SettingsUI) && react.createElement("div", { className: "lyrics-provider-card-body" },
      // Capabilities Toggles (자동 렌더링)
      hasCapabilities && react.createElement("div", { className: "ai-addon-settings-group" },
        react.createElement("div", { className: "ai-addon-capabilities-title" },
          I18n.t("settings.aiProviders.enabledCapabilities") || "Enabled Capabilities"
        ),
        react.createElement("div", { className: "ai-addon-caps-container" },
          Object.keys(addon.supports).map(cap =>
            addon.supports[cap] && react.createElement("div", {
              key: cap,
              className: `ai-addon-cap-chip ${capabilities[cap] ? 'active' : ''} cap-${cap}`,
              onClick: () => toggleCapability(cap)
            },
              capabilities[cap] && react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }, react.createElement("polyline", { points: "20 6 9 17 4 12" })),
              I18n.t(`settings.aiProviders.supports.${cap}`) || cap
            )
          )
        ),
        react.createElement("div", { className: "ai-addon-capabilities-desc" },
          I18n.t("settings.aiProviders.capabilitiesDesc") || "Select which features this provider handles"
        )
      ),
      // 개별 Addon Custom UI
      SettingsUI && react.createElement(SettingsUI)
    )
  );
};

const getLyricsProviderGranularitySupport = (provider) => {
  const declared = new Set(
    (Array.isArray(provider?.supports?.karaokeGranularities)
      ? provider.supports.karaokeGranularities
      : [])
      .map(value => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'char' || normalized === 'letter') return 'character';
        if (normalized === 'token') return 'word';
        return normalized;
      })
  );
  if (provider?.supports?.character === true || provider?.supports?.karaokeCharacter === true) {
    declared.add('character');
  }
  if (provider?.supports?.word === true || provider?.supports?.karaokeWord === true) {
    declared.add('word');
  }
  const legacyGeneric = declared.size === 0 && provider?.supports?.karaoke === true;
  return {
    character: declared.has('character') || legacyGeneric,
    word: declared.has('word') || legacyGeneric
  };
};

// 가사 제공자 카드 컴포넌트
const LyricsProviderCard = ({ provider, isEnabled, onToggle, isExpanded, onExpandToggle }) => {
  const SettingsUI = useMemo(
    () => provider.getSettingsUI ? provider.getSettingsUI() : null,
    [provider, provider.getSettingsUI]
  );

  const getLocalizedDescription = (desc) => {
    if (typeof desc === 'string') return desc;
    const storedLang = (StorageManager.getItem("ivLyrics:visual:language") || window.I18n?.getCurrentLanguage?.() || 'en')
      .replace(/"/g, '');
    const baseLang = storedLang.split('-')[0] || 'en';
    const normalizedZh = baseLang === 'zh'
      ? ((/tw|hant/i.test(storedLang) || storedLang === 'zh-TW') ? 'zh-TW' : 'zh-CN')
      : null;
    return desc[storedLang] || (normalizedZh && desc[normalizedZh]) || desc[baseLang] || desc['en'] || Object.values(desc)[0] || '';
  };

  const handleHeaderClick = (e) => {
    if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
    onExpandToggle();
  };

  // 지원 유형 뱃지 렌더링
  const renderSupportBadges = () => {
    const badges = [];
    const { character: supportsCharacter, word: supportsWord } = getLyricsProviderGranularitySupport(provider);
    if (supportsCharacter) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "character", type: "character", label: I18n.t("settings.lyricsProviders.supports.character") || "Character-synced" }));
    }
    if (supportsWord) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "word", type: "word", label: I18n.t("settings.lyricsProviders.supports.word") || "Word-synced" }));
    }
    if (provider.supports?.synced) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "synced", type: "synced", label: I18n.t("settings.lyricsProviders.supports.synced") || "Synced" }));
    }
    if (provider.supports?.unsynced) {
      badges.push(react.createElement(ProviderSupportIconChip, { key: "unsynced", type: "unsynced", label: I18n.t("settings.lyricsProviders.supports.unsynced") || "Plain" }));
    }
    return badges;
  };

  // 상세 설정 상태 (가사 유형별 활성화 여부)
  const getLegacyKaraokeFallback = () => {
    const legacy = window.LyricsAddonManager?.getAddonSetting(provider.id, 'enable_karaoke', null);
    return legacy === null || legacy === undefined ? true : legacy !== false;
  };
  const [enableCharacter, setEnableCharacter] = useState(() =>
    window.LyricsAddonManager?.getAddonSetting(provider.id, 'enable_character', getLegacyKaraokeFallback()) ?? true
  );
  const [enableWord, setEnableWord] = useState(() =>
    window.LyricsAddonManager?.getAddonSetting(provider.id, 'enable_word', getLegacyKaraokeFallback()) ?? true
  );
  const [enableSynced, setEnableSynced] = useState(() =>
    window.LyricsAddonManager?.getAddonSetting(provider.id, 'enable_synced', true) ?? true
  );
  const [enableUnsynced, setEnableUnsynced] = useState(() =>
    window.LyricsAddonManager?.getAddonSetting(provider.id, 'enable_unsynced', true) ?? true
  );

  const handleTypeToggle = (type, value) => {
    if (!window.LyricsAddonManager) return;

    if (type === 'character') {
      setEnableCharacter(value);
      window.LyricsAddonManager.setAddonSetting(provider.id, 'enable_character', value);
    } else if (type === 'word') {
      setEnableWord(value);
      window.LyricsAddonManager.setAddonSetting(provider.id, 'enable_word', value);
    } else if (type === 'synced') {
      setEnableSynced(value);
      window.LyricsAddonManager.setAddonSetting(provider.id, 'enable_synced', value);
    } else if (type === 'unsynced') {
      setEnableUnsynced(value);
      window.LyricsAddonManager.setAddonSetting(provider.id, 'enable_unsynced', value);
    }
  };

  const {
    character: showCharacterToggle,
    word: showWordToggle
  } = getLyricsProviderGranularitySupport(provider);
  const showSyncedToggle = provider.supports?.synced;
  const showUnsyncedToggle = provider.supports?.unsynced;

  return react.createElement("div", {
    className: `lyrics-provider-card ${isExpanded ? 'expanded' : ''} ${isEnabled ? '' : 'disabled'}`,
    "data-setting-key": `lyrics-provider:${provider.id}`,
    "data-search-text": [
      provider.name,
      provider.author,
      getLocalizedDescription(provider.description),
      ...Object.keys(provider.supports || {})
        .filter((lyricsType) => provider.supports[lyricsType])
        .map((lyricsType) =>
          `${lyricsType} ${I18n.t(`settings.lyricsProviders.types.${lyricsType}`) || ""}`
        ),
    ].filter(Boolean).join(" "),
  },
    // 카드 헤더
    react.createElement("div", {
      className: "lyrics-provider-card-header",
      onClick: handleHeaderClick
    },
      // 왼쪽: 활성화 토글, 아이콘, 이름
      react.createElement("div", { className: "lyrics-provider-card-header-left" },
        react.createElement("label", { className: "lyrics-provider-toggle" },
          react.createElement("input", {
            type: "checkbox",
            checked: isEnabled,
            onChange: (e) => onToggle(e.target.checked)
          }),
          react.createElement("span", { className: "toggle-slider" })
        ),
        react.createElement("div", { className: "lyrics-provider-title-group" },
          react.createElement("span", { className: "lyrics-provider-name" }, provider.name),
          react.createElement("div", { className: "lyrics-provider-title-meta" },
            react.createElement("span", null, `v${provider.version}`),
            react.createElement("span", { className: "lyrics-provider-title-meta-divider" }, "•"),
            react.createElement("span", null, provider.author)
          ),
          react.createElement(
            "div",
            { className: "lyrics-provider-summary" },
            getLocalizedDescription(provider.description)
          )
        )
      ),
      // 오른쪽: 지원 뱃지, 확장 아이콘
      react.createElement("div", { className: "lyrics-provider-card-header-right" },
        react.createElement("div", { className: "support-badges" }, renderSupportBadges()),
        react.createElement("svg", {
          className: `lyrics-provider-expand-icon ${isExpanded ? 'expanded' : ''}`,
          width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
          stroke: "currentColor", strokeWidth: "2"
        },
          react.createElement("polyline", { points: "6 9 12 15 18 9" })
        )
      )
    ),
    // 확장 영역 (설정 UI)
    isExpanded && react.createElement("div", { className: "lyrics-provider-card-body" },
      // 가사 유형별 필터 토글 영역
      react.createElement("div", { className: "lyrics-type-toggles-container" },
        react.createElement("div", { className: "lyrics-type-toggles-title" }, I18n.t("settings.lyricsProviders.allowedTypes") || "Allowed Lyrics Types"),
        react.createElement("div", { className: "lyrics-type-toggles" },
          showCharacterToggle && react.createElement("button", {
            type: "button",
            onClick: () => handleTypeToggle('character', !enableCharacter),
            className: `lyrics-type-toggle-chip type-character ${enableCharacter ? "active" : ""}`
          },
            enableCharacter && react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }, react.createElement("polyline", { points: "20 6 9 17 4 12" })),
            I18n.t("settings.lyricsProviders.types.character") || "Character-synced Lyrics"
          ),
          showWordToggle && react.createElement("button", {
            type: "button",
            onClick: () => handleTypeToggle('word', !enableWord),
            className: `lyrics-type-toggle-chip type-word ${enableWord ? "active" : ""}`
          },
            enableWord && react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }, react.createElement("polyline", { points: "20 6 9 17 4 12" })),
            I18n.t("settings.lyricsProviders.types.word") || "Word-synced Lyrics"
          ),
          showSyncedToggle && react.createElement("button", {
            type: "button",
            onClick: () => handleTypeToggle('synced', !enableSynced),
            className: `lyrics-type-toggle-chip type-synced ${enableSynced ? "active" : ""}`
          },
            enableSynced && react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }, react.createElement("polyline", { points: "20 6 9 17 4 12" })),
            I18n.t("settings.lyricsProviders.types.synced") || "Synced Lyrics"
          ),
          showUnsyncedToggle && react.createElement("button", {
            type: "button",
            onClick: () => handleTypeToggle('unsynced', !enableUnsynced),
            className: `lyrics-type-toggle-chip type-unsynced ${enableUnsynced ? "active" : ""}`
          },
            enableUnsynced && react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }, react.createElement("polyline", { points: "20 6 9 17 4 12" })),
            I18n.t("settings.lyricsProviders.types.unsynced") || "Unsynced Lyrics"
          )
        )
      ),
      SettingsUI && react.createElement(SettingsUI)
    )
  );
};

// Both provider tabs keep the same reorder gestures and persistence contract.
const createSettingsProviderOrderControls = (
  managerName, providers, providerOrder, setProviderOrder, dragState, setDragState
) => {
  const moveProvider = (providerId, direction) => {
    const currentOrder = buildOrderedProviderList(providers, providerOrder).map((provider) => provider.id);
    const currentIndex = currentOrder.indexOf(providerId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];

    setProviderOrder(newOrder);
    if (window[managerName]) {
      window[managerName].setProviderOrder(newOrder);
    }
  };

  const handleDragStart = (event, providerId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", providerId);
    setDragState({ sourceId: providerId, targetId: null, position: "before" });
  };

  const handleDragOver = (event, targetId) => {
    if (!dragState.sourceId || dragState.sourceId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    if (dragState.targetId !== targetId || dragState.position !== position) {
      setDragState((current) => ({ ...current, targetId, position }));
    }
  };

  const handleDrop = (event, targetId) => {
    event.preventDefault();
    const sourceId = dragState.sourceId || event.dataTransfer.getData("text/plain");
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const newOrder = reorderProviderList(providers, providerOrder, sourceId, targetId, position);
    setProviderOrder(newOrder);
    window[managerName]?.setProviderOrder?.(newOrder);
    setDragState({ sourceId: null, targetId: null, position: "before" });
  };

  const clearDragState = () => {
    setDragState({ sourceId: null, targetId: null, position: "before" });
  };

  return { moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState };
};

// Return the existing DOM tree directly; do not introduce a remounting wrapper.
const renderSettingsProviderItems = ({
  sortedProviders, dragState, enabledProviders, expandedProviders,
  handleDragOver, handleDrop, handleDragStart, clearDragState, moveProvider,
  handleToggleEnabled, toggleExpanded, translationKey, Card, providerProp
}) => (
  sortedProviders.map((provider, providerIndex) =>
    react.createElement("div", {
      key: provider.id,
      role: "listitem",
      className: [
        "lyrics-provider-item",
        dragState.sourceId === provider.id ? "dragging" : "",
        dragState.targetId === provider.id ? `drag-over-${dragState.position}` : "",
      ].filter(Boolean).join(" "),
      onDragOver: (event) => handleDragOver(event, provider.id),
      onDrop: (event) => handleDrop(event, provider.id),
    },
      react.createElement("span", {
        className: "provider-order-index",
        "aria-hidden": "true",
      }, providerIndex + 1),
      react.createElement(ProviderDragHandle, {
        provider,
        label: `${provider.name || provider.id}: ${I18n.t(`${translationKey}.moveUp`) || "Move Up"} / ${I18n.t(`${translationKey}.moveDown`) || "Move Down"}`,
        onDragStart: handleDragStart,
        onDragEnd: clearDragState,
        onMove: moveProvider,
      }),
      // Provider 카드
      react.createElement(Card, {
        [providerProp]: provider,
        isEnabled: enabledProviders[provider.id] !== false,
        onToggle: (enabled) => handleToggleEnabled(provider.id, enabled),
        isExpanded: expandedProviders.has(provider.id),
        onExpandToggle: () => toggleExpanded(provider.id)
      })
    )
  )
);

// 가사 제공자 설정 탭 컴포넌트
const LyricsProvidersTab = () => {
  const [providers, setProviders] = useState([]);
  const [providerOrder, setProviderOrder] = useState([]);
  const [enabledProviders, setEnabledProviders] = useState({});
  const [expandedProviders, setExpandedProviders] = useState(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [dragState, setDragState] = useState({ sourceId: null, targetId: null, position: "before" });
  const preferSyncDataProviderEnabled =
    window.LyricsAddonManager?.isPreferSyncDataProviderEnabled?.()
    ?? (CONFIG.visual["prefer-sync-data-provider"] !== false);
  const preferLyricsTypeOverProviderOrderEnabled =
    window.LyricsAddonManager?.isPreferLyricsTypeOverProviderOrderEnabled?.()
    ?? (CONFIG.visual["prefer-lyrics-type-over-provider-order"] !== false);

  useEffect(() => {
    const loadProviders = () => {
      if (window.LyricsAddonManager) {
        const providerList = window.LyricsAddonManager.getAddons();
        setProviders(providerList);

        const order = window.LyricsAddonManager.getProviderOrder();
        setProviderOrder(order);

        const enabled = {};
        providerList.forEach(p => {
          enabled[p.id] = window.LyricsAddonManager.isProviderEnabled(p.id);
        });
        setEnabledProviders(enabled);
      } else {
        setTimeout(loadProviders, 100);
      }
    };
    loadProviders();
  }, [refreshKey]);

  const handleToggleEnabled = (providerId, enabled) => {
    if (window.LyricsAddonManager) {
      window.LyricsAddonManager.setProviderEnabled(providerId, enabled);
      setEnabledProviders(prev => ({ ...prev, [providerId]: enabled }));
    }
  };

  const toggleExpanded = (providerId) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const { moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState } =
    createSettingsProviderOrderControls(
      "LyricsAddonManager", providers, providerOrder, setProviderOrder, dragState, setDragState
    );

  // 정렬된 provider 목록
  const sortedProviders = buildOrderedProviderList(providers, providerOrder);

  return react.createElement("div", { className: "settings-section lyrics-providers-section" },
    // 통합 컨테이너
    react.createElement("div", { className: "lyrics-providers-container" },
      react.createElement(OptionList, {
        items: [
          {
            desc: I18n.t("settings.lyricsProviders.preferSyncDataProvider.label") || "Prioritize providers with sync data",
            info: I18n.t("settings.lyricsProviders.preferSyncDataProvider.desc") || "When sync data is available for the current track, try its matching lyrics provider before the normal provider order.",
            key: "prefer-sync-data-provider",
            type: ConfigSlider,
            defaultValue: preferSyncDataProviderEnabled,
          },
          {
            desc: I18n.t("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.label") || "Prioritize lyrics type over provider order",
            info: I18n.t("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.desc") || "Try karaoke lyrics across all providers first, then synced lyrics, then plain lyrics. Provider order is preserved within each type.",
            key: "prefer-lyrics-type-over-provider-order",
            type: ConfigSlider,
            defaultValue: preferLyricsTypeOverProviderOrderEnabled,
          },
        ],
        onChange: (name, value) => {
          if (
            name === "prefer-sync-data-provider"
            && typeof window.LyricsAddonManager?.setPreferSyncDataProviderEnabled === "function"
          ) {
            window.LyricsAddonManager.setPreferSyncDataProviderEnabled(value);
          } else if (
            name === "prefer-lyrics-type-over-provider-order"
            && typeof window.LyricsAddonManager?.setPreferLyricsTypeOverProviderOrderEnabled === "function"
          ) {
            window.LyricsAddonManager.setPreferLyricsTypeOverProviderOrderEnabled(value);
          } else {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            window.LyricsAddonManager?._triggerLyricsRefresh?.();
          }
          window.dispatchEvent(new CustomEvent("ivLyrics", {
            detail: { type: "config", name, value },
          }));
        },
      }),

      // Provider 목록
      providers.length > 0 && react.createElement("div", { className: "lyrics-providers-list", role: "list" },
        renderSettingsProviderItems({
          sortedProviders, dragState, enabledProviders, expandedProviders,
          handleDragOver, handleDrop, handleDragStart, clearDragState, moveProvider,
          handleToggleEnabled, toggleExpanded,
          translationKey: "settings.lyricsProviders", Card: LyricsProviderCard, providerProp: "provider"
        })
      ),

      // Provider가 없을 때
      providers.length === 0 && react.createElement("div", { className: "no-providers-message" },
        react.createElement("p", null, I18n.t("settings.lyricsProviders.noProviders") || "등록된 가사 제공자가 없습니다.")
      )
    )
  );
};

const AI_TRANSLATION_STYLE_OPTIONS = [
  {
    id: "natural",
    labelKey: "settings.aiProviders.translationStyle.natural.label",
    descriptionKey: "settings.aiProviders.translationStyle.natural.description",
    labelFallback: "Natural (Default)",
    descriptionFallback: "Natural wording that preserves the original meaning and tone."
  },
  {
    id: "literal",
    labelKey: "settings.aiProviders.translationStyle.literal.label",
    descriptionKey: "settings.aiProviders.translationStyle.literal.description",
    labelFallback: "Literal",
    descriptionFallback: "Stays close to the original wording and order."
  },
  {
    id: "adaptive",
    labelKey: "settings.aiProviders.translationStyle.adaptive.label",
    descriptionKey: "settings.aiProviders.translationStyle.adaptive.description",
    labelFallback: "Adaptive",
    descriptionFallback: "Uses surrounding lines for the smoothest connected phrasing."
  }
];

// AI 제공자 설정 탭 컴포넌트 (LyricsProvidersTab과 동일 스타일)
const AIProvidersTab = () => {
  const [providers, setProviders] = useState([]);
  const [providerOrder, setProviderOrder] = useState([]);
  const [enabledProviders, setEnabledProviders] = useState({});
  const [expandedProviders, setExpandedProviders] = useState(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [dragState, setDragState] = useState({ sourceId: null, targetId: null, position: "before" });
  const [translationStyle, setTranslationStyle] = useState(
    () => window.AIAddonManager?.getTranslationStyle?.() || "natural"
  );
  const [providerRetryCount, setProviderRetryCount] = useState(
    () => window.AIAddonManager?.getProviderRetryCount?.() ?? 2
  );
  const [culturalAnnotationsEnabled, setCulturalAnnotationsEnabled] = useState(() => {
    const value = CONFIG.visual["cultural-annotations-enabled"];
    return value === true || value === "true";
  });
  const [culturalDetailsExpanded, setCulturalDetailsExpanded] = useState(false);
  const vinylModeLabel = I18n.t("vinyl.mode") || "LP";

  useEffect(() => {
    let retryTimer = null;
    let unsubscribeStyle = null;
    let unsubscribeRetryCount = null;
    let disposed = false;

    const loadProviders = () => {
      if (disposed) return;

      if (window.AIAddonManager) {
        const providerList = window.AIAddonManager.getAddons();
        setProviders(providerList);

        const order = window.AIAddonManager.getProviderOrder();
        setProviderOrder(order);

        const enabled = {};
        providerList.forEach(p => {
          enabled[p.id] = window.AIAddonManager.isProviderEnabled(p.id);
        });
        setEnabledProviders(enabled);
        setTranslationStyle(window.AIAddonManager.getTranslationStyle?.() || "natural");
        setProviderRetryCount(window.AIAddonManager.getProviderRetryCount?.() ?? 2);

        unsubscribeStyle = window.AIAddonManager.on?.("translation:style:changed", ({ style }) => {
          if (!disposed) setTranslationStyle(style || "natural");
        });
        unsubscribeRetryCount = window.AIAddonManager.on?.("provider:retry-count:changed", ({ retryCount }) => {
          if (!disposed) setProviderRetryCount(Number(retryCount) || 0);
        });
      } else {
        retryTimer = setTimeout(loadProviders, 100);
      }
    };
    loadProviders();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (typeof unsubscribeStyle === "function") unsubscribeStyle();
      if (typeof unsubscribeRetryCount === "function") unsubscribeRetryCount();
    };
  }, [refreshKey]);

  const handleTranslationStyleChange = (style) => {
    const nextStyle = window.AIAddonManager?.setTranslationStyle?.(style) || style;
    setTranslationStyle(nextStyle);
  };

  const handleTranslationStyleKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % AI_TRANSLATION_STYLE_OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + AI_TRANSLATION_STYLE_OPTIONS.length) % AI_TRANSLATION_STYLE_OPTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = AI_TRANSLATION_STYLE_OPTIONS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextOption = AI_TRANSLATION_STYLE_OPTIONS[nextIndex];
    handleTranslationStyleChange(nextOption.id);
    event.currentTarget.parentElement
      ?.querySelector(`[data-translation-style="${nextOption.id}"]`)
      ?.focus();
  };

  const handleToggleEnabled = (providerId, enabled) => {
    if (window.AIAddonManager) {
      window.AIAddonManager.setProviderEnabled(providerId, enabled);
      setEnabledProviders(prev => ({ ...prev, [providerId]: enabled }));
    }
  };

  const toggleExpanded = (providerId) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const { moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState } =
    createSettingsProviderOrderControls(
      "AIAddonManager", providers, providerOrder, setProviderOrder, dragState, setDragState
    );

  const handleCulturalSettingChange = (name, value) => {
    CONFIG.visual[name] = value;
    StorageManager.saveConfig(name, value);
    if (name === "cultural-annotations-enabled") {
      const enabled = value === true || value === "true";
      setCulturalAnnotationsEnabled(enabled);
      if (!enabled) setCulturalDetailsExpanded(false);
    }
    if (name.endsWith("font-family")) loadGoogleFontFamily(value);
    lyricContainerUpdate?.();
    window.dispatchEvent(new CustomEvent("ivLyrics", {
      detail: { type: "config", name, value },
    }));
  };

  // 정렬된 provider 목록
  const sortedProviders = buildOrderedProviderList(providers, providerOrder);

  return react.createElement("div", { className: "settings-section lyrics-providers-section" },
    // 통합 컨테이너
    react.createElement("div", { className: "lyrics-providers-container" },
      react.createElement("section", {
        className: "ai-translation-style-panel",
        "aria-labelledby": "ai-translation-style-title"
      },
        react.createElement("div", { className: "ai-translation-style-header" },
          react.createElement("div", {
            id: "ai-translation-style-title",
            className: "ai-translation-style-title"
          }, I18n.t("settings.aiProviders.translationStyle.title") || "Translation style"),
          react.createElement("p", { className: "ai-translation-style-description" },
            I18n.t("settings.aiProviders.translationStyle.description")
              || "Choose how closely AI translations follow the original wording. Line structure and meaning are preserved in every mode."
          )
        ),
        react.createElement("div", {
          className: "ai-translation-style-options",
          role: "radiogroup",
          "aria-label": I18n.t("settings.aiProviders.translationStyle.title") || "Translation style"
        },
          AI_TRANSLATION_STYLE_OPTIONS.map((option, index) => {
            const active = translationStyle === option.id;
            return react.createElement("button", {
              key: option.id,
              type: "button",
              role: "radio",
              "aria-checked": active,
              tabIndex: active ? 0 : -1,
              className: `ai-translation-style-option${active ? " active" : ""}`,
              "data-translation-style": option.id,
              onClick: () => handleTranslationStyleChange(option.id),
              onKeyDown: (event) => handleTranslationStyleKeyDown(event, index)
            },
              react.createElement("span", { className: "ai-translation-style-option-heading" },
                react.createElement("span", { className: "ai-translation-style-indicator", "aria-hidden": "true" }),
                react.createElement("span", { className: "ai-translation-style-option-label" },
                  I18n.t(option.labelKey) || option.labelFallback
                )
              ),
              react.createElement("span", { className: "ai-translation-style-option-description" },
                I18n.t(option.descriptionKey) || option.descriptionFallback
              )
            );
          })
        )
      ),
      react.createElement(OptionList, {
        items: [
          {
            desc: I18n.t("settings.aiProviders.retryCount.label") || "Retries per provider",
            key: "ai-provider-retry-count",
            info: I18n.t("settings.aiProviders.retryCount.description")
              || "Number of additional attempts after a failed request. Set to 0 to switch to the next provider immediately.",
            type: ConfigSliderRange,
            defaultValue: providerRetryCount,
            min: 0,
            max: 5,
            step: 1,
            showStepMarkers: true,
          },
        ],
        onChange: (_name, value) => {
          const numericValue = Number(value);
          const nextValue = window.AIAddonManager?.setProviderRetryCount?.(value)
            ?? (Number.isFinite(numericValue) ? numericValue : 2);
          setProviderRetryCount(nextValue);
        },
      }),
      react.createElement("div", {
        className: `cultural-annotation-group${culturalAnnotationsEnabled ? " is-enabled" : ""}${culturalDetailsExpanded ? " is-expanded" : ""}`,
        "data-setting-key": "cultural-annotations-group",
      },
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.culturalAnnotations.label"),
              key: "cultural-annotations-enabled",
              info: I18n.t("settings.culturalAnnotations.desc"),
              type: ConfigSlider,
              defaultValue: CONFIG.visual["cultural-annotations-enabled"] ?? false,
            },
          ],
          onChange: handleCulturalSettingChange,
        }),
        culturalAnnotationsEnabled && react.createElement("button", {
          type: "button",
          className: `cultural-details-toggle${culturalDetailsExpanded ? " expanded" : ""}`,
          "aria-expanded": culturalDetailsExpanded,
          "aria-controls": "cultural-annotation-details",
          onClick: () => setCulturalDetailsExpanded((expanded) => !expanded),
        },
          react.createElement("span", null, I18n.t("shareImage.advancedSettings") || "Detailed settings"),
          react.createElement("svg", {
            width: 16,
            height: 16,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          }, react.createElement("polyline", { points: "6 9 12 15 18 9" }))
        ),
        culturalAnnotationsEnabled && culturalDetailsExpanded && react.createElement("div", {
          id: "cultural-annotation-details",
          className: "cultural-annotation-details",
        }, react.createElement(OptionList, {
        items: [
          {
            desc: I18n.t("settings.culturalAnnotations.fontFamily.label"),
            key: "cultural-annotations-font-family",
            info: I18n.t("settings.culturalAnnotations.fontFamily.desc"),
            type: ConfigFontSelector,
            defaultValue: CONFIG.visual["cultural-annotations-font-family"] || "Pretendard Variable",
          },
          {
            desc: I18n.t("settings.culturalAnnotations.fontSize.label"),
            key: "cultural-annotations-font-size",
            info: I18n.t("settings.culturalAnnotations.fontSize.desc"),
            type: ConfigSliderRange,
            min: 12,
            max: 48,
            step: 1,
            unit: "px",
          },
          {
            desc: I18n.t("settings.culturalAnnotations.fontWeight.label"),
            key: "cultural-annotations-font-weight",
            info: I18n.t("settings.culturalAnnotations.fontWeight.desc"),
            type: ConfigFontWeightSlider,
          },
          {
            desc: I18n.t("settings.culturalAnnotations.opacity.label"),
            key: "cultural-annotations-opacity",
            info: I18n.t("settings.culturalAnnotations.opacity.desc"),
            type: ConfigSliderRange,
            min: 20,
            max: 100,
            step: 1,
            unit: "%",
          },
          ...createTextOutlineSettingItems("cultural-annotations"),
          {
            desc: `${vinylModeLabel} · ${I18n.t("settings.culturalAnnotations.fontFamily.label")}`,
            key: "cultural-annotations-vinyl-font-family",
            info: `${vinylModeLabel}: ${I18n.t("settings.culturalAnnotations.fontFamily.desc")}`,
            type: ConfigFontSelector,
            defaultValue: CONFIG.visual["cultural-annotations-vinyl-font-family"] || "Pretendard Variable",
          },
          {
            desc: `${vinylModeLabel} · ${I18n.t("settings.culturalAnnotations.fontSize.label")}`,
            key: "cultural-annotations-vinyl-font-size",
            info: `${vinylModeLabel}: ${I18n.t("settings.culturalAnnotations.fontSize.desc")}`,
            type: ConfigSliderRange,
            min: 10,
            max: 32,
            step: 1,
            unit: "px",
          },
          {
            desc: `${vinylModeLabel} · ${I18n.t("settings.culturalAnnotations.fontWeight.label")}`,
            key: "cultural-annotations-vinyl-font-weight",
            info: `${vinylModeLabel}: ${I18n.t("settings.culturalAnnotations.fontWeight.desc")}`,
            type: ConfigFontWeightSlider,
          },
          {
            desc: `${vinylModeLabel} · ${I18n.t("settings.culturalAnnotations.opacity.label")}`,
            key: "cultural-annotations-vinyl-opacity",
            info: `${vinylModeLabel}: ${I18n.t("settings.culturalAnnotations.opacity.desc")}`,
            type: ConfigSliderRange,
            min: 20,
            max: 100,
            step: 1,
            unit: "%",
          },
          ...createTextOutlineSettingItems("cultural-annotations-vinyl", {
            labelPrefix: `${vinylModeLabel} · `,
            infoPrefix: `${vinylModeLabel}: `,
          }),
        ],
          onChange: handleCulturalSettingChange,
        }))
      ),
      // Provider 목록
      providers.length > 0 && react.createElement("div", { className: "lyrics-providers-list", role: "list" },
        renderSettingsProviderItems({
          sortedProviders, dragState, enabledProviders, expandedProviders,
          handleDragOver, handleDrop, handleDragStart, clearDragState, moveProvider,
          handleToggleEnabled, toggleExpanded,
          translationKey: "settings.aiProviders", Card: AddonSettingsCard, providerProp: "addon"
        })
      ),

      // Provider가 없을 때
      providers.length === 0 && react.createElement("div", { className: "no-providers-message" },
        react.createElement("p", null, I18n.t("settings.aiProviders.noProviders") || "등록된 AI 제공자가 없습니다.")
      )
    )
  );
};

const getSafeSettingsLocale = () => {
  let currentLanguage = null;
  try {
    currentLanguage = window.I18n?.getCurrentLanguage?.();
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
};

// 로컬 캐시 관리 컴포넌트 (IndexedDB)
const LocalCacheManager = () => {
  const [stats, setStats] = useState(null);
  const [openDbInfo, setOpenDbInfo] = useState(null);
  const [openDbUpdating, setOpenDbUpdating] = useState(false);
  const [openDbError, setOpenDbError] = useState("");
  const [loading, setLoading] = useState(true);
  const settingsLocale = getSafeSettingsLocale();

  // 캐시 통계 로드
  const loadStats = async () => {
    setLoading(true);
    try {
      const cacheStats = await LyricsCache.getStats();
      setStats(cacheStats);
    } catch (e) {
      console.error('[LocalCacheManager] Failed to load stats:', e);
      setStats(null);
    } finally {
      setOpenDbInfo(window.SyncDataService?.getOpenDbCacheInfo?.() || null);
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
      // 메모리 캐시도 함께 초기화
      window.Translator?.clearAllMemoryCache?.();
      window.Translator?.clearAllInflightRequests?.();
      window.lyricContainer?.clearAllCulturalAnnotations?.({ updateState: true });

      // CacheManager (Gemini 번역 메모리 캐시)도 함께 초기화 (window에서 접근)
      if (window.CacheManager?.clear) {
        window.CacheManager.clear();
      }

      // CACHE 객체(가사 캐시)도 함께 초기화
      if (window.CACHE) {
        Object.keys(window.CACHE).forEach(key => delete window.CACHE[key]);
      }

      // _dmResults (번역/발음 결과 캐시)도 초기화
      if (window.lyricContainer?._dmResults) {
        window.lyricContainer._dmResults = {};
      }

      // 진행 중인 Gemini 요청도 취소
      if (window.lyricContainer?._inflightGemini) {
        window.lyricContainer._inflightGemini.clear();
      }

      // SyncDataService 메모리 캐시 초기화
      window.SyncDataService?.clearCache(undefined, { preserveOpenDb: true });

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
      window.Translator?.clearMemoryCache?.(trackId);
      window.Translator?.clearInflightRequests?.(trackId);
      window.lyricContainer?.clearCulturalAnnotationsForTrack?.(trackUri, {
        updateState: true,
      });

      // CacheManager (Gemini 번역 메모리 캐시)도 함께 초기화 (window에서 접근)
      if (window.CacheManager?.clearByUri) {
        window.CacheManager.clearByUri(trackUri);
      }

      // CACHE 객체(가사 캐시)에서 해당 트랙 삭제
      if (window.CACHE && window.CACHE[trackUri]) {
        delete window.CACHE[trackUri];
      }

      // _dmResults (번역/발음 결과 캐시)에서 해당 트랙 삭제
      if (window.lyricContainer?._dmResults && window.lyricContainer._dmResults[trackUri]) {
        delete window.lyricContainer._dmResults[trackUri];
      }

      // 진행 중인 Gemini 요청에서 해당 트랙 취소
      if (window.lyricContainer?._inflightGemini) {
        for (const [key] of window.lyricContainer._inflightGemini) {
          if (key.includes(trackUri)) {
            window.lyricContainer._inflightGemini.delete(key);
          }
        }
      }

      // SyncDataService 메모리 캐시 초기화
      window.SyncDataService?.clearCache(trackId, { preserveOpenDb: true });

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
    const refreshOpenDbCache = window.SyncDataService?.refreshOpenDbCache;
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
      Toast.success(getSettingsText(
        "settingsAdvanced.cacheManagement.openDb.updateSuccess",
        "OpenDB base와 delta를 다시 가져왔습니다."
      ));
    } catch (error) {
      console.error('[LocalCacheManager] OpenDB refresh failed:', error);
      const failedInfo =
        error?.cacheInfo
        || window.SyncDataService?.getOpenDbCacheInfo?.()
        || null;
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
      Toast.error(message);
    } finally {
      setOpenDbUpdating(false);
    }
  };

  const totalCount = stats ? (stats.lyrics || 0) + (stats.translations || 0) + (stats.metadata || 0) + (stats.youtube || 0) : 0;

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

  return react.createElement(
    "div",
    { className: "option-list-wrapper cache-management-list" },
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
        { className: "setting-row-right cache-action-buttons" },
        react.createElement(
          "button",
          {
            type: "button",
            className: "btn",
            onClick: handleClearCurrent,
          },
          I18n.t("settingsAdvanced.cacheManagement.localCache.clearCurrent")
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "btn",
            onClick: handleClearAll,
            disabled: totalCount === 0,
          },
          I18n.t("settingsAdvanced.cacheManagement.localCache.clearAll")
        )
      )
    )
    ),
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
          translateSource: translateSource || "none",
          targetLang: targetLang || "none",
          karaokeEnabled: CONFIG.visual["karaoke-mode-enabled"] || false,
          furiganaEnabled: CONFIG.visual["furigana-enabled"] || false
        },
        client: {
          clientId: Spicetify.LocalStorage.get("ivLyrics:user-hash") || "",
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
    return '#888';
  };

  if (!debugInfo) {
    return react.createElement(
      "div",
      {
        className: "info-card debug-info-panel debug-info-panel-loading",
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
      className: "info-card debug-info-panel",
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
      { className: "debug-info-header" },
      react.createElement(
        "div",
        null,
        react.createElement("h3", {
          className: "debug-info-title"
        }, I18n.t("settingsAdvanced.debugTab.currentTrack")),
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
        I18n.t("settingsAdvanced.debugTab.refresh")
      )
    ),
    // 트랙 정보
    debugInfo.track && react.createElement(
      "div",
      { className: "debug-info-section" },
      react.createElement("div", {
        className: "debug-info-section-label"
      }, I18n.t("settingsAdvanced.debugTab.trackInfo")),
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
    ),
    // API 요청 로그 섹션
    react.createElement(
      "div",
      { className: "debug-info-section" },
      react.createElement("div", {
        className: "debug-info-section-label debug-info-section-label-row"
      },
        react.createElement("span", null, `API 요청 로그 (${apiLogs.length})`),
        window.ApiTracker && react.createElement("span", { className: "debug-info-inline-meta" },
          `Total: ${window.ApiTracker.getSummary()?.totalRequests || 0} requests`
        )
      ),
      react.createElement("div", {
        className: "debug-api-list"
      },
        apiLogs.length === 0
          ? react.createElement("div", {
            className: "debug-api-empty"
          }, "아직 API 요청이 없습니다. 곡을 재생하면 여기에 표시됩니다.")
          : apiLogs.map((log, idx) => react.createElement(
            "div",
            {
              key: log.id || idx,
              className: "debug-api-item",
              style: {
                marginBottom: idx < apiLogs.length - 1 ? "8px" : 0,
                borderLeft: `2px solid ${getCategoryColor(log.category)}`
              }
            },
            // 로그 헤더 (클릭 가능)
            react.createElement(
              "div",
              {
                onClick: () => toggleApiDetail(log.id),
                className: "debug-api-header"
              },
              react.createElement("div", { className: "debug-api-header-left" },
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
                  style: { color: getStatusColor(log.status) }
                }, log.cached ? "CACHED" : log.status?.toUpperCase() || "PENDING"),
                // 소요 시간
                log.duration && react.createElement("span", {
                  className: "debug-api-duration"
                }, `${log.duration}ms`)
              ),
              // 타임스탬프
              react.createElement("span", {
                className: "debug-api-timestamp"
              }, new Date(log.timestamp).toLocaleTimeString())
            ),
            // 엔드포인트 URL (축약)
            react.createElement("div", {
              className: "debug-api-endpoint"
            }, log.endpoint?.replace(/https?:\/\/[^\/]+/, '') || '-'),
            // 상세 정보 (토글)
            showApiDetails[log.id] && react.createElement(
              "div",
              { className: "debug-api-details" },
              // 요청 정보
              log.request && react.createElement("div", { className: "debug-api-detail-group" },
                react.createElement("div", {
                  className: "debug-json-label"
                }, "REQUEST:"),
                react.createElement("pre", {
                  className: "debug-json-block"
                }, JSON.stringify(log.request, null, 2))
              ),
              // 응답 정보
              log.response && react.createElement("div", null,
                react.createElement("div", {
                  className: "debug-json-label"
                }, "RESPONSE:"),
                react.createElement("pre", {
                  className: `debug-json-block ${log.status === 'error' ? 'error' : ''}`
                }, log.error || JSON.stringify(log.response, null, 2))
              )
            )
          ))
      )
    ),
    // 가사 정보
    react.createElement(
      "div",
      { className: "debug-info-section" },
      react.createElement("div", {
        className: "debug-info-section-label"
      }, I18n.t("settingsAdvanced.debugTab.lyricsInfo")),
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
        ) : react.createElement("span", { className: "debug-info-empty" }, I18n.t("settingsAdvanced.debugTab.noLyrics"))
      )
    ),
    // 복사 버튼들
    react.createElement(
      "div",
      { className: "debug-info-actions" },
      react.createElement(
        "button",
        {
          onClick: handleCopy,
          className: "btn debug-action-btn",
          style: {
            background: copied ? "rgba(74, 222, 128, 0.15)" : "rgba(255, 255, 255, 0.08)",
            border: copied ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid rgba(255, 255, 255, 0.15)",
            color: copied ? "#4ade80" : "rgba(255, 255, 255, 0.9)",
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
          className: "btn btn-primary debug-action-btn",
          style: {
            background: "#5865F2",
            border: "none",
            color: "#ffffff",
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
      "data-setting-key": settingKey,
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
      label: name,
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
  className = "",
  showStepMarkers = false,
  ariaValueFormatter,
  onChange = () => { },
}) => {
  const [value, setValue] = useState(defaultValue);
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

  const sliderStyle = {
    "--progress-percent": `${((value - min) / (max - min)) * 100}%`,
  };
  const stepValues = showStepMarkers
    ? Array.from(
      { length: Math.floor((max - min) / step) + 1 },
      (_, index) => min + index * step
    )
    : [];

  return react.createElement(
    "div",
    {
      className: `slider-container${showStepMarkers ? " has-step-markers" : ""}${className ? ` ${className}` : ""}${disabled ? " disabled" : ""}`,
    },
    react.createElement("input", {
      type: "range",
      min,
      max,
      step,
      value,
      disabled,
      onInput: handleInput,
      "aria-label": name,
      "aria-valuetext": ariaValueFormatter
        ? ariaValueFormatter(Number(value))
        : `${value}${unit}`,
      className: "config-slider",
      style: sliderStyle,
    }),
    react.createElement(
      "output",
      { className: "slider-value" },
      `${value}${unit}`
    ),
    showStepMarkers && react.createElement(
      "div",
      { className: "slider-step-markers", "aria-hidden": "true" },
      stepValues.map((stepValue) =>
        react.createElement("span", {
          key: stepValue,
          className: `slider-step-marker${Number(value) === stepValue ? " active" : ""}`,
        })
      )
    )
  );
};

const FONT_WEIGHT_NAMES = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

const ConfigFontWeightSlider = (props) =>
  react.createElement(ConfigSliderRange, {
    ...props,
    min: 100,
    max: 900,
    step: 100,
    unit: "",
    showStepMarkers: true,
    className: `font-weight-slider${props.className ? ` ${props.className}` : ""}`,
    ariaValueFormatter: (value) => `${value} ${FONT_WEIGHT_NAMES[value] || ""}`.trim(),
  });

const normalizeSettingsHexColor = (value) => {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map((character) => character + character).join("")}`.toLowerCase();
  }
  return "";
};

const ConfigColorControl = ({
  value,
  label,
  onDraftChange = () => { },
  onCommit = () => { },
}) => {
  const normalizedColor = normalizeSettingsHexColor(value);
  const isValid = Boolean(normalizedColor);

  return react.createElement(
    "div",
    { className: `config-color-control${isValid ? "" : " invalid"}` },
    react.createElement("input", {
      type: "color",
      value: normalizedColor || "#000000",
      onChange: (event) => {
        const nextColor = event.target.value.toLowerCase();
        onDraftChange(nextColor);
        onCommit(nextColor);
      },
      className: "config-color-picker",
      "aria-label": `${label || "Color"} 색상 선택`,
      title: `${label || "Color"} 색상 선택`,
    }),
    react.createElement("input", {
      type: "text",
      value: value || "",
      onChange: (event) => onDraftChange(event.target.value),
      onBlur: (event) => onCommit(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      },
      className: "config-color-input",
      pattern: "^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$",
      placeholder: "#000000",
      spellCheck: false,
      "aria-label": `${label || "Color"} HEX 값`,
      "aria-invalid": !isValid,
    })
  );
};

const ConfigColorPicker = ({ name, defaultValue, onChange = () => { } }) => {
  const initialColor = normalizeSettingsHexColor(defaultValue) || "#000000";
  const [value, setValue] = useState(initialColor);
  const committedValueRef = useRef(initialColor);

  useEffect(() => {
    const nextColor = normalizeSettingsHexColor(defaultValue) || "#000000";
    committedValueRef.current = nextColor;
    setValue(nextColor);
  }, [defaultValue]);

  const handleCommit = useCallback(
    (nextValue) => {
      const normalizedColor = normalizeSettingsHexColor(nextValue);
      if (!normalizedColor) {
        setValue(committedValueRef.current);
        return;
      }
      committedValueRef.current = normalizedColor;
      setValue(normalizedColor);
      onChange(normalizedColor);
    },
    [onChange]
  );

  return react.createElement(
    "div",
    { className: "color-picker-container" },
    react.createElement(ConfigColorControl, {
      value,
      label: name,
      onDraftChange: setValue,
      onCommit: handleCommit,
    })
  );
};

const createTextOutlineSettingItems = (
  settingPrefix,
  {
    labelPrefix = "",
    infoPrefix = "",
    when,
    disabled,
  } = {}
) => [
  {
    desc: `${labelPrefix}${I18n.t("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness"}`,
    info: `${infoPrefix}${I18n.t("settingsAdvanced.textOutline.width.desc") || "Visible thickness of the outline outside the glyphs (px)"}`,
    key: `${settingPrefix}-outline-width`,
    type: ConfigSliderRange,
    min: 0,
    max: 10,
    step: 0.5,
    unit: "px",
    defaultValue: Number(CONFIG.visual[`${settingPrefix}-outline-width`] ?? 0),
    when,
    disabled,
  },
  {
    desc: `${labelPrefix}${I18n.t("settingsAdvanced.textOutline.color.label") || "Text Outline Color"}`,
    info: `${infoPrefix}${I18n.t("settingsAdvanced.textOutline.color.desc") || "Color of the text outline (HEX code)"}`,
    key: `${settingPrefix}-outline-color`,
    type: ConfigColorPicker,
    defaultValue: CONFIG.visual[`${settingPrefix}-outline-color`] || "#000000",
    when,
    disabled,
  },
];

const MULTI_VOCAL_COLOR_GROUPS = [
  {
    id: "male",
    labelKey: "settingsAdvanced.multiVocalColors.maleGroup",
    fallbackLabel: "Male",
    speakers: ["MALE 1", "MALE 2", "MALE 3", "MALE 4", "MALE 5"],
  },
  {
    id: "female",
    labelKey: "settingsAdvanced.multiVocalColors.femaleGroup",
    fallbackLabel: "Female",
    speakers: ["FEMALE 1", "FEMALE 2", "FEMALE 3", "FEMALE 4", "FEMALE 5"],
  },
  {
    id: "duet",
    labelKey: "settingsAdvanced.multiVocalColors.duetGroup",
    fallbackLabel: "Duet",
    speakers: ["DUET 1", "DUET 2", "DUET 3", "DUET 4", "DUET 5"],
  },
];

const getMultiVocalColorHelper = () => window.ivLyricsSpeakerColors || {
  defaultColors: {
    "MALE 1": "#a8ccff",
    "MALE 2": "#9ae8d4",
    "MALE 3": "#bfe8ff",
    "MALE 4": "#7fb5e6",
    "MALE 5": "#6cb8b8",
    "FEMALE 1": "#ffb8c7",
    "FEMALE 2": "#ffd6b3",
    "FEMALE 3": "#f6c8ff",
    "FEMALE 4": "#e6b4d4",
    "FEMALE 5": "#f6e5a5",
    "DUET 1": "#e4d8ff",
    "DUET 2": "#d6e4ff",
    "DUET 3": "#ffddf2",
    "DUET 4": "#bfaeff",
    "DUET 5": "#9d8cf2",
  },
  normalizeColor(value) {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return `#${color.slice(1).split("").map((char) => char + char).join("")}`.toLowerCase();
    }
    return "";
  },
  getSettingKey(speaker) {
    return `multi-vocal-speaker-color-${String(speaker || "").toLowerCase().replace(/\s+/g, "-")}`;
  },
  getTextColor(speaker) {
    const key = this.getSettingKey(speaker);
    return this.normalizeColor(CONFIG.visual[key]) || this.defaultColors[speaker] || "#ffffff";
  },
  setTextColor(speaker, color) {
    const normalized = this.normalizeColor(color);
    if (!normalized) return "";
    const key = this.getSettingKey(speaker);
    CONFIG.visual[key] = normalized;
    StorageManager.saveConfig(key, normalized);
    return normalized;
  },
  resetToDefaults() {
    Object.entries(this.defaultColors).forEach(([speaker, color]) => {
      const key = this.getSettingKey(speaker);
      CONFIG.visual[key] = color;
      StorageManager.removeItem(`ivLyrics:visual:${key}`);
    });
  },
  applyCssVariables() {},
};

const ConfigMultiVocalColorSettings = () => {
  const helper = getMultiVocalColorHelper();
  const allSpeakers = MULTI_VOCAL_COLOR_GROUPS.flatMap((group) => group.speakers);
  const buildCurrentColors = () => Object.fromEntries(
    allSpeakers.map((speaker) => [
      speaker,
      helper.getTextColor?.(speaker) || helper.defaultColors?.[speaker] || "#ffffff",
    ])
  );
  const [colors, setColors] = useState(buildCurrentColors);

  const dispatchColorUpdate = (name, value) => {
    lyricContainerUpdate?.();
    window.dispatchEvent(new CustomEvent("ivLyrics", {
      detail: { type: "config", name, value },
    }));
  };

  const commitColor = (speaker, value) => {
    const normalized = helper.normalizeColor?.(value);
    if (!normalized) {
      setColors((prev) => ({
        ...prev,
        [speaker]: helper.getTextColor?.(speaker) || helper.defaultColors?.[speaker] || "#ffffff",
      }));
      Toast?.error?.(I18n.t("settingsAdvanced.multiVocalColors.invalidColor") || "Enter a valid hex color.");
      return;
    }

    const savedColor = helper.setTextColor?.(speaker, normalized) || normalized;
    helper.applyCssVariables?.();
    setColors((prev) => ({ ...prev, [speaker]: savedColor }));
    dispatchColorUpdate(helper.getSettingKey?.(speaker) || `multi-vocal-speaker-color-${speaker.toLowerCase().replace(/\s+/g, "-")}`, savedColor);
  };

  const resetColors = () => {
    helper.resetToDefaults?.();
    helper.applyCssVariables?.();
    setColors(buildCurrentColors());
    dispatchColorUpdate("multi-vocal-speaker-color-reset", "default");
    Toast?.success?.(I18n.t("settingsAdvanced.multiVocalColors.resetDone") || "Multi-vocal colors were reset.");
  };

  return react.createElement(
    "div",
    { className: "option-list-wrapper multi-vocal-color-settings", "data-setting-key": "multi-vocal-colors" },
    react.createElement(
      "div",
      { className: "setting-row multi-vocal-color-setting-row" },
      react.createElement(
        "div",
        { className: "setting-row-content multi-vocal-color-content" },
        react.createElement(
          "div",
          { className: "multi-vocal-color-header" },
          react.createElement(
            "div",
            { className: "multi-vocal-color-copy" },
            react.createElement("div", { className: "setting-name" }, I18n.t("settingsAdvanced.multiVocalColors.description") || "Customize the lyric color for each multi-vocal speaker."),
            react.createElement("div", { className: "setting-description" }, I18n.t("settingsAdvanced.multiVocalColors.subtitle") || "These colors are used in karaoke lyrics, the Now Playing panel, and the sync creator.")
          ),
          react.createElement(
            "button",
            { className: "btn", type: "button", onClick: resetColors, style: { whiteSpace: "nowrap" } },
            I18n.t("settingsAdvanced.multiVocalColors.reset") || "Reset"
          )
        ),
        react.createElement(
          "div",
          { className: "multi-vocal-color-groups" },
          ...MULTI_VOCAL_COLOR_GROUPS.map((group) =>
            react.createElement(
              "div",
              { key: group.id, className: "multi-vocal-color-group" },
              react.createElement(
                "div",
                { className: "multi-vocal-color-group-title" },
                I18n.t(group.labelKey) || group.fallbackLabel
              ),
              ...group.speakers.map((speaker) => {
                const color = colors[speaker] || helper.defaultColors?.[speaker] || "#ffffff";
                return react.createElement(
                  "div",
                  { key: speaker, className: "multi-vocal-color-row" },
                  react.createElement("span", { className: "multi-vocal-color-speaker" }, speaker),
                  react.createElement(ConfigColorControl, {
                    value: color,
                    label: speaker,
                    onDraftChange: (nextColor) => setColors((prev) => ({ ...prev, [speaker]: nextColor })),
                    onCommit: (nextColor) => commitColor(speaker, nextColor),
                  })
                );
              })
            )
          )
        )
      )
    )
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
    { className: "color-preset-selector" },
    // 현재 선택된 색상 표시
    react.createElement(
      "div",
      { className: "color-preset-summary" },
      react.createElement("div", {
        className: "color-preset-swatch",
        style: { backgroundColor: selectedColor },
      }),
      react.createElement(
        "div",
        { className: "color-preset-meta" },
        react.createElement(
          "span",
          { className: "color-preset-name" },
          selectedPreset ? selectedPreset.name : I18n.t("settings.colors.customColor")
        ),
        react.createElement(
          "span",
          { className: "color-preset-code" },
          selectedColor.toUpperCase()
        )
      ),
      react.createElement(
        "button",
        {
          className: "btn color-preset-toggle-btn",
          type: "button",
          onClick: () => setShowAll(!showAll),
        },
        showAll ? I18n.t("settings.colors.showLess") : I18n.t("settings.colors.showMore")
      )
    ),
    // 색상 팔레트
    showAll &&
    react.createElement(
      "div",
      { className: "color-preset-grid" },
      ...colorPresets.map((preset, index) =>
        react.createElement("button", {
          key: index,
          type: "button",
          className: "color-preset-grid-item",
          onClick: () => handleColorClick(preset.color),
          title: preset.name,
          "aria-label": preset.name,
          "data-selected": selectedColor === preset.color ? "true" : "false",
          style: {
            backgroundColor: preset.color,
          },
        })
      )
    )
  );
};

const ConfigWarning = ({ message, settingKey }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row",
      "data-setting-key": settingKey,
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
const ConfigInfo = ({ message, buttonText, onButtonClick, settingKey }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row config-info-row",
      "data-setting-key": settingKey,
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
            className: "setting-description config-info-message",
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
            style: { fontSize: "12px" },
          },
          buttonText
        )
      )
    )
  );
};

const SETTINGS_PRESETS_STORAGE_KEY = "ivLyrics:settings-presets";
const SETTINGS_PRESET_EXCLUDED_KEYS = new Set([
  "gemini-api-key",
  "gemini-api-key-romaji",
]);

const getSettingsPresetText = (key, fallback) =>
  I18n.t(`settingsAdvanced.settingsPresets.${key}`) || fallback;

const formatSettingsPresetText = (key, fallback, replacements = {}) => {
  let text = getSettingsPresetText(key, fallback);
  Object.entries(replacements).forEach(([name, value]) => {
    text = text.split(`{${name}}`).join(String(value));
  });
  return text;
};

const createSettingsPresetId = () => {
  if (window.crypto?.randomUUID) {
    return `preset-${window.crypto.randomUUID()}`;
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeSettingsPreset = (preset) => {
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) return null;
  if (!preset.settings || typeof preset.settings !== "object" || Array.isArray(preset.settings)) return null;

  const name = String(preset.name || "").trim();
  if (!name) return null;

  const now = new Date().toISOString();
  return {
    id: String(preset.id || createSettingsPresetId()),
    name,
    createdAt: preset.createdAt || preset.updatedAt || now,
    updatedAt: preset.updatedAt || preset.createdAt || now,
    settings: Object.entries(preset.settings).reduce((acc, [key, value]) => {
      if (SETTINGS_PRESET_EXCLUDED_KEYS.has(key)) return acc;
      acc[key] = value;
      return acc;
    }, {}),
  };
};

const loadSettingsPresets = () => {
  try {
    const rawValue = StorageManager.getItem(SETTINGS_PRESETS_STORAGE_KEY);
    if (!rawValue) return [];

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeSettingsPreset)
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } catch (error) {
    console.error("[ivLyrics] Failed to load settings presets:", error);
    return [];
  }
};

const saveSettingsPresets = (presets) => {
  StorageManager.setItem(SETTINGS_PRESETS_STORAGE_KEY, JSON.stringify(presets));
};

const captureSettingsPresetValues = () => {
  const snapshot = {};
  Object.entries(CONFIG.visual || {}).forEach(([key, value]) => {
    if (SETTINGS_PRESET_EXCLUDED_KEYS.has(key)) return;
    if (typeof value === "undefined" || typeof value === "function") return;

    try {
      snapshot[key] = JSON.parse(JSON.stringify(value));
    } catch (error) {
      snapshot[key] = String(value);
    }
  });
  return snapshot;
};

const applySettingsPresetValues = (settings) => {
  Object.entries(settings || {}).forEach(([name, value]) => {
    if (!name || SETTINGS_PRESET_EXCLUDED_KEYS.has(name)) return;

    CONFIG.visual[name] = value;
    StorageManager.saveConfig(name, value);

    if (name === "language" && window.I18n?.setLanguage) {
      window.I18n.setLanguage(value);
    }

    window.dispatchEvent(
      new CustomEvent("ivLyrics", {
        detail: { type: "config", name, value },
      })
    );
  });

  lyricContainerUpdate?.();
  window.dispatchEvent(
    new CustomEvent("ivLyrics:panel-preview-update", {
      detail: { source: "settings-preset" },
    })
  );
};

const formatSettingsPresetDate = (value) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(window.I18n?.getCurrentLanguage?.() || undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return String(value);
  }
};

const ConfigSettingsPresets = () => {
  const [presets, setPresets] = useState(loadSettingsPresets);
  const [presetName, setPresetName] = useState("");

  const persistPresets = useCallback((nextPresets) => {
    const normalizedPresets = nextPresets
      .map(normalizeSettingsPreset)
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    saveSettingsPresets(normalizedPresets);
    setPresets(normalizedPresets);
  }, []);

  const handleSave = useCallback(() => {
    const name = presetName.trim();
    if (!name) {
      Toast?.error?.(getSettingsPresetText("nameRequired", "Enter a preset name."));
      return;
    }

    const existingPreset = presets.find(
      (preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );

    if (
      existingPreset &&
      !window.confirm(formatSettingsPresetText(
        "confirmOverwrite",
        "A preset named \"{name}\" already exists. Overwrite it?",
        { name }
      ))
    ) {
      return;
    }

    const now = new Date().toISOString();
    const settings = captureSettingsPresetValues();
    const nextPreset = {
      id: existingPreset?.id || createSettingsPresetId(),
      name,
      createdAt: existingPreset?.createdAt || now,
      updatedAt: now,
      settings,
    };

    const nextPresets = existingPreset
      ? presets.map((preset) => preset.id === existingPreset.id ? nextPreset : preset)
      : [nextPreset, ...presets];

    try {
      persistPresets(nextPresets);
      setPresetName("");
      Toast?.success?.(formatSettingsPresetText(
        "saved",
        "Preset \"{name}\" saved.",
        { name }
      ));
    } catch (error) {
      console.error("[ivLyrics] Failed to save settings preset:", error);
      Toast?.error?.(getSettingsPresetText("saveFailed", "Failed to save preset."));
    }
  }, [presetName, presets, persistPresets]);

  const handleApply = useCallback((preset) => {
    if (!preset) return;
    if (
      !window.confirm(formatSettingsPresetText(
        "confirmApply",
        "Apply preset \"{name}\" and reload the page?",
        { name: preset.name }
      ))
    ) {
      return;
    }

    try {
      applySettingsPresetValues(preset.settings);
      Toast?.success?.(formatSettingsPresetText(
        "applied",
        "Preset \"{name}\" applied.",
        { name: preset.name }
      ));
      queueReloadIntoIvLyrics({
        reopenSettings: true,
        initialTab: "advanced",
        initialSettingKey: "settings-presets",
        delay: 700,
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to apply settings preset:", error);
      Toast?.error?.(getSettingsPresetText("applyFailed", "Failed to apply preset."));
    }
  }, []);

  const handleDelete = useCallback((preset) => {
    if (!preset) return;
    if (
      !window.confirm(formatSettingsPresetText(
        "confirmDelete",
        "Delete preset \"{name}\"?",
        { name: preset.name }
      ))
    ) {
      return;
    }

    try {
      persistPresets(presets.filter((item) => item.id !== preset.id));
      Toast?.success?.(formatSettingsPresetText(
        "deleted",
        "Preset \"{name}\" deleted.",
        { name: preset.name }
      ));
    } catch (error) {
      console.error("[ivLyrics] Failed to delete settings preset:", error);
      Toast?.error?.(getSettingsPresetText("deleteFailed", "Failed to delete preset."));
    }
  }, [presets, persistPresets]);

  return react.createElement(
    "div",
    {
      className: "setting-row",
    },
    react.createElement(
      "div",
      {
        className: "setting-row-content",
        style: {
          flexDirection: "column",
          alignItems: "stretch",
          gap: "14px",
        },
      },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement(
          "div",
          { className: "setting-name" },
          getSettingsPresetText("nameLabel", "Preset name")
        ),
        react.createElement(
          "div",
          { className: "setting-description" },
          getSettingsPresetText(
            "excludedSecrets",
            "Current visual and behavior settings are saved. API keys are excluded."
          )
        )
      ),
      react.createElement(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: "10px",
          },
        },
        react.createElement("input", {
          className: "config-text-input",
          type: "text",
          value: presetName,
          placeholder: getSettingsPresetText("namePlaceholder", "My preset"),
          onChange: (event) => setPresetName(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              handleSave();
            }
          },
        }),
        react.createElement(
          "button",
          {
            className: "btn",
            type: "button",
            onClick: handleSave,
          },
          getSettingsPresetText("saveCurrent", "Save current")
        )
      ),
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          },
        },
        react.createElement(
          "div",
          {
            className: "setting-name",
            style: { fontSize: "13px" },
          },
          getSettingsPresetText("savedPresets", "Saved presets")
        ),
        presets.length === 0
          ? react.createElement(
              "div",
              {
                className: "setting-description",
                style: {
                  padding: "12px 0",
                },
              },
              getSettingsPresetText("empty", "No presets saved yet.")
            )
          : presets.map((preset) =>
              react.createElement(
                "div",
                {
                  key: preset.id,
                  style: {
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "12px",
                    alignItems: "center",
                    padding: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    background: "rgba(255, 255, 255, 0.04)",
                    borderRadius: "8px",
                  },
                },
                react.createElement(
                  "div",
                  { style: { minWidth: 0 } },
                  react.createElement(
                    "div",
                    {
                      className: "setting-name",
                      style: {
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                      title: preset.name,
                    },
                    preset.name
                  ),
                  react.createElement(
                    "div",
                    { className: "setting-description" },
                    `${formatSettingsPresetText(
                      "settingsCount",
                      "{count} settings",
                      { count: Object.keys(preset.settings || {}).length }
                    )} · ${formatSettingsPresetText(
                      "updatedAt",
                      "Updated {date}",
                      { date: formatSettingsPresetDate(preset.updatedAt) }
                    )}`
                  )
                ),
                react.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    },
                  },
                  react.createElement(
                    "button",
                    {
                      className: "btn",
                      type: "button",
                      onClick: () => handleApply(preset),
                    },
                    getSettingsPresetText("apply", "Apply")
                  ),
                  react.createElement(
                    "button",
                    {
                      className: "btn",
                      type: "button",
                      onClick: () => handleDelete(preset),
                      style: {
                        background: "rgba(239, 68, 68, 0.14)",
                        borderColor: "rgba(239, 68, 68, 0.28)",
                        color: "#fca5a5",
                      },
                    },
                    getSettingsPresetText("delete", "Delete")
                  )
                )
              )
            )
      )
    )
  );
};

const getCloudSyncText = (key, fallback) =>
  I18n.t(`settingsAdvanced.cloudSync.${key}`) || fallback;

const formatCloudSyncText = (key, fallback, replacements = {}) => {
  let value = getCloudSyncText(key, fallback);
  Object.entries(replacements).forEach(([name, replacement]) => {
    value = value.split(`{${name}}`).join(String(replacement));
  });
  return value;
};

const ConfigCloudSync = () => {
  const [cloud, setCloud] = useState({ loading: false, exists: false, revision: 0, updatedAt: null });
  const [busyAction, setBusyAction] = useState("");
  const [supportChecking, setSupportChecking] = useState(false);
  const [message, setMessage] = useState(() =>
    getCloudSyncText("monthlyRequired", "Cloud sync is available to Monthly Supporters only."));
  const [messageType, setMessageType] = useState("info");

  const describeError = useCallback((error) => {
    if (error?.code === "monthly_supporter_required") {
      return getCloudSyncText("monthlyRequired", "Cloud sync is available to Monthly Supporters only.");
    }
    if (error?.code === "revision_conflict") {
      return getCloudSyncText("conflict", "Cloud settings changed on another device. Refresh before uploading again.");
    }
    if (error?.status === 401 || error?.code === "discord_login_required") {
      return getCloudSyncText("loginRequired", "Sign in with Discord to use cloud sync.");
    }
    return formatCloudSyncText("failed", "Cloud sync failed: {error}", {
      error: error?.message || String(error || "Unknown error"),
    });
  }, []);

  const handleCloudFailure = useCallback((error) => {
    if (error?.code === "monthly_supporter_required") {
      const discordId = Utils.getUserHash();
      Utils.setCachedDiscordSupportTier(discordId, "none");
    }
    const messageText = describeError(error);
    setMessage(messageText);
    setMessageType("error");
    Toast?.error?.(messageText);
  }, [describeError]);

  const ensureMonthlySupporter = useCallback(async () => {
    const authToken = Utils.getAuthToken();
    const discordId = Utils.getUserHash();
    if (!authToken || !Utils.isDiscordUserHash(discordId)) {
      const loginMessage = getCloudSyncText("loginRequired", "Sign in with Discord to use cloud sync.");
      setMessage(loginMessage);
      setMessageType("warning");
      Toast?.error?.(loginMessage);
      return false;
    }

    setSupportChecking(true);
    setMessage(getCloudSyncText("checking", "Checking cloud settings…"));
    setMessageType("info");
    try {
      const tier = await Utils.fetchDiscordSupportTier(discordId, { forceRefresh: true });
      if (tier !== "monthly") {
        const monthlyMessage = getCloudSyncText("monthlyRequired", "Cloud sync is available to Monthly Supporters only.");
        setMessage(monthlyMessage);
        setMessageType("warning");
        Toast?.error?.(monthlyMessage);
        return false;
      }
      return true;
    } catch (error) {
      const failureMessage = formatCloudSyncText("failed", "Cloud sync failed: {error}", {
        error: error?.message || String(error || "Unknown error"),
      });
      setMessage(failureMessage);
      setMessageType("error");
      Toast?.error?.(failureMessage);
      return false;
    } finally {
      setSupportChecking(false);
    }
  }, []);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!await ensureMonthlySupporter()) return null;
    if (!quiet) setCloud((current) => ({ ...current, loading: true }));
    try {
      const result = await Utils.fetchCloudSettings();
      const next = {
        loading: false,
        exists: result.exists,
        revision: result.revision,
        updatedAt: result.data?.updatedAt || null,
      };
      setCloud(next);
      if (!quiet) {
        setMessage(result.exists
          ? formatCloudSyncText("remoteFound", "Cloud revision {revision} is available.", { revision: result.revision })
          : getCloudSyncText("empty", "No PC settings have been saved to the cloud yet."));
        setMessageType("info");
      }
      return result;
    } catch (error) {
      setCloud((current) => ({ ...current, loading: false }));
      handleCloudFailure(error);
      return null;
    }
  }, [ensureMonthlySupporter, handleCloudFailure]);

  const upload = useCallback(async () => {
    setBusyAction("upload");
    try {
      const current = await refresh({ quiet: true });
      if (!current) return;
      const settings = await StorageManager.exportCloudConfig();
      const saved = await Utils.saveCloudSettings(settings, current.revision);
      setCloud({
        loading: false,
        exists: true,
        revision: saved.revision,
        updatedAt: saved.data?.updatedAt || null,
      });
      setMessage(formatCloudSyncText("uploaded", "PC settings uploaded as revision {revision}.", { revision: saved.revision }));
      setMessageType("success");
    } catch (error) {
      handleCloudFailure(error);
    } finally {
      setBusyAction("");
    }
  }, [handleCloudFailure, refresh]);

  const download = useCallback(async () => {
    if (!await ensureMonthlySupporter()) return;
    if (!window.confirm(getCloudSyncText("confirmDownload", "Apply cloud PC settings and reload ivLyrics?"))) return;
    setBusyAction("download");
    try {
      const result = await Utils.fetchCloudSettings();
      if (!result.exists || !result.data?.settings) {
        setMessage(getCloudSyncText("empty", "No PC settings have been saved to the cloud yet."));
        setMessageType("warning");
        return;
      }
      await StorageManager.importCloudConfig(result.data.settings);
      setMessage(getCloudSyncText("downloaded", "Cloud PC settings were applied. Reloading ivLyrics…"));
      setMessageType("success");
      queueReloadIntoIvLyrics({
        reopenSettings: true,
        initialTab: "advanced",
        initialSettingKey: "cloud-sync",
        delay: 700,
      });
    } catch (error) {
      handleCloudFailure(error);
    } finally {
      setBusyAction("");
    }
  }, [ensureMonthlySupporter, handleCloudFailure]);

  const remove = useCallback(async () => {
    if (!window.confirm(getCloudSyncText("confirmDelete", "Permanently delete your cloud PC settings?"))) return;
    setBusyAction("delete");
    try {
      await Utils.deleteCloudSettings();
      setCloud({ loading: false, exists: false, revision: 0, updatedAt: null });
      setMessage(getCloudSyncText("deleted", "Cloud PC settings were deleted."));
      setMessageType("success");
    } catch (error) {
      handleCloudFailure(error);
    } finally {
      setBusyAction("");
    }
  }, [handleCloudFailure]);

  const updatedLabel = cloud.updatedAt
    ? formatCloudSyncText("updatedAt", "Updated {date}", {
      date: formatSettingsPresetDate(Number(cloud.updatedAt) * 1000),
    })
    : getCloudSyncText("notSaved", "Not saved yet");
  const disabled = Boolean(busyAction) || cloud.loading || supportChecking;
  const deleteDisabled = disabled || !Utils.getAuthToken();

  return react.createElement(
    "div",
    {
      className: "setting-row",
      "data-setting-key": "cloud-sync",
      style: {
        borderColor: "rgba(167, 139, 250, 0.42)",
        background: "linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(236, 72, 153, 0.06))",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.025)",
      },
    },
    react.createElement(
      "div",
      {
        className: "setting-row-content",
        style: { flexDirection: "column", alignItems: "stretch", gap: "14px" },
      },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" }, getCloudSyncText("platform", "PC settings")),
        react.createElement(
          "div",
          { className: "setting-description" },
          `${updatedLabel}${cloud.exists ? ` · rev ${cloud.revision}` : ""}`
        )
      ),
      react.createElement(
        "div",
        {
          role: messageType === "warning" || messageType === "error" ? "alert" : "status",
          "aria-live": messageType === "warning" || messageType === "error" ? "assertive" : "polite",
          className: "setting-description",
          style: {
            padding: "10px 12px",
            borderRadius: "8px",
            border: `1px solid ${messageType === "error" ? "rgba(248,113,113,.42)" : messageType === "warning" ? "rgba(251,191,36,.42)" : messageType === "success" ? "rgba(74,222,128,.3)" : "rgba(255,255,255,.1)"}`,
            background: messageType === "error" ? "rgba(127,29,29,.24)" : messageType === "warning" ? "rgba(120,53,15,.22)" : messageType === "success" ? "rgba(20,83,45,.18)" : "rgba(255,255,255,.04)",
            color: messageType === "error" ? "#fecaca" : messageType === "warning" ? "#fde68a" : undefined,
            fontWeight: messageType === "warning" || messageType === "error" ? "600" : undefined,
          },
        },
        messageType === "warning" || messageType === "error"
          ? react.createElement(
            react.Fragment,
            null,
            react.createElement("span", { "aria-hidden": "true", style: { marginRight: "7px" } }, "⚠"),
            cloud.loading ? getCloudSyncText("checking", "Checking cloud settings…") : message
          )
          : cloud.loading ? getCloudSyncText("checking", "Checking cloud settings…") : message
      ),
      react.createElement(
        "div",
        { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        react.createElement("button", { className: "btn", type: "button", disabled, onClick: upload },
          busyAction === "upload" ? getCloudSyncText("uploading", "Uploading…") : getCloudSyncText("upload", "Upload current settings")),
        react.createElement("button", { className: "btn", type: "button", disabled: disabled || !cloud.exists, onClick: download },
          busyAction === "download" ? getCloudSyncText("downloading", "Applying…") : getCloudSyncText("download", "Apply cloud settings")),
        react.createElement("button", { className: "btn", type: "button", disabled, onClick: () => refresh() },
          getCloudSyncText("refresh", "Refresh")),
        react.createElement("button", {
          className: "btn",
          type: "button",
          disabled: deleteDisabled,
          onClick: remove,
          style: { background: "rgba(239,68,68,.14)", borderColor: "rgba(239,68,68,.28)", color: "#fca5a5" },
        }, busyAction === "delete" ? getCloudSyncText("deleting", "Deleting…") : getCloudSyncText("delete", "Delete cloud data"))
      ),
      react.createElement("div", { className: "setting-description" },
        getCloudSyncText("excluded", "API keys, account tokens, caches, presets, and per-track offsets stay on this device."))
    )
  );
};

// 비디오 헬퍼 토글 컴포넌트 (연결 상태 표시 포함)
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
              __html: Spicetify.SVGIcons.check,
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
      if (typeof VideoHelperService === "undefined") return;

      // 설정 탭이 보이는지 확인 (visibility check)
      const settingsTab = document.querySelector('#ivLyrics-config-container') || document.querySelector('#ivLyrics-settings-overlay');
      if (!settingsTab) return;

      checkInProgress = true;
      if (showChecking) setChecking(true);
      try {
        const connected = await VideoHelperService.checkHealth();
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
    onChange(settingKey || name, newValue);

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


  const getStatusText = () => {
    if (checking) return I18n.t("settings.videoHelper.status.checking");
    if (isConnected) return "✓ " + I18n.t("settings.videoHelper.status.connected");
    return I18n.t("settings.videoHelper.status.disconnected");
  };

  return renderSettingsHelperToggle({
    settingKey, enabled, isConnected, disabled, handleDownload, handleToggle,
    label: I18n.t("settings.videoHelper.label"),
    description: I18n.t("settings.videoHelper.desc"),
    downloadLabel: I18n.t("settings.videoHelper.download"),
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
      if (typeof window.lyricsHelperSender === "undefined") return;

      // 설정 탭이 보이는지 확인
      const settingsTab = document.querySelector('#ivLyrics-config-container') || document.querySelector('#ivLyrics-settings-overlay');
      if (!settingsTab) return;

      setChecking(true);
      const connected = await window.lyricsHelperSender.checkConnection();
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
    window.addEventListener('ivLyrics:lyrics-helper-connection', handleConnectionChange);

    // 설정창 열려있는 동안 주기적 연결 확인 (5초마다, 활성화 시만)
    const interval = setInterval(() => {
      if (enabled) checkConnection();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('ivLyrics:lyrics-helper-connection', handleConnectionChange);
    };
  }, [enabled]);

  const handleToggle = () => {
    if (disabled) return;
    const newValue = !enabled;
    setEnabled(newValue);
    onChange(name, newValue);
    CONFIG.visual[name] = newValue;
    StorageManager.saveConfig(name, newValue);

    // lyricsHelperSender 활성화/비활성화
    if (window.lyricsHelperSender) {
      window.lyricsHelperSender.enabled = newValue;
    }

    window.dispatchEvent(new CustomEvent("ivLyrics:lyricsHelperChanged", { detail: { enabled: newValue } }));
  };

  const handleDownload = () => {
    window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank");
  };


  const getStatusText = () => {
    if (checking) return I18n.t("settings.lyricsHelper.status.checking") || "Checking...";
    if (isConnected) return "✓ " + (I18n.t("settings.lyricsHelper.status.connected") || "Connected");
    return I18n.t("settings.lyricsHelper.status.disconnected") || "Not connected";
  };

  return renderSettingsHelperToggle({
    settingKey, enabled, isConnected, disabled, handleDownload, handleToggle,
    label: I18n.t("settings.lyricsHelper.label"),
    description: I18n.t("settings.lyricsHelper.desc"),
    downloadLabel: I18n.t("settings.lyricsHelper.download") || "Download",
    statusText: getStatusText()
  });
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
      className: "config-select",
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

const createInstrumentalBreakPreviewChildren = (icon) => {
  const span = (key, props = {}) => react.createElement("span", { key, ...props });

  switch (icon) {
    case "dotWave":
      return [0, 1, 2, 3, 4].map((index) => span(index));
    case "ripples":
    case "orbit":
    case "vinyl":
      return span("main");
    case "diamonds":
    case "stack":
      return [0, 1, 2].map((index) => span(index));
    case "signal":
      return react.createElement(
        "svg",
        { viewBox: "0 0 112 32", "aria-hidden": "true" },
        react.createElement("path", {
          d: "M2 18 H20 L26 9 L34 25 L43 14 L50 18 H68 L74 9 L82 25 L91 14 L98 18 H110",
        })
      );
    case "spark":
      return [0, 1, 2, 3, 4, 5, 6, 7].map((index) => span(index, { style: { "--i": index } }));
    case "splitBars":
    case "strings":
      return [0, 1, 2, 3].map((index) => span(index));
    case "reels":
      return [0, 1].map((index) => span(index));
    case "piano":
      return [0, 1, 2, 3, 4].map((index) => span(index));
    case "bloom":
      return [0, 1, 2, 3].map((index) => span(index));
    case "scan":
    case "arcs":
    case "pulseDot":
    case "metronome":
    case "beat":
    case "triangle":
    case "morph":
    case "speaker":
    case "crossfade":
      return null;
    case "equalizer":
    default:
      return [0, 1, 2, 3].map((index) => span(index));
  }
};

const getInstrumentalBreakPreviewStyle = () => {
  const speed = Number(CONFIG?.visual?.["instrumental-break-animation-speed"] ?? 100);
  const safeSpeed = Number.isFinite(speed) ? Math.max(50, Math.min(200, speed)) : 100;
  const duration = Math.round(1100 * (100 / safeSpeed));

  return {
    "--break-duration": `${duration}ms`,
    "--break-duration-fast": `${Math.round(duration * 0.72)}ms`,
    "--break-duration-slow": `${Math.round(duration * 1.65)}ms`,
    "--break-duration-xslow": `${Math.round(duration * 3.8)}ms`,
  };
};

const getInstrumentalBreakLabelStyleDefault = (settingSuffix, originalKey, fallbackValue) => {
  const settingValue = CONFIG?.visual?.[`instrumental-break-label-${settingSuffix}`];
  if (settingValue !== undefined && settingValue !== null && settingValue !== "") {
    return settingValue;
  }

  const originalValue = originalKey ? CONFIG?.visual?.[originalKey] : undefined;
  return originalValue !== undefined && originalValue !== null && originalValue !== ""
    ? originalValue
    : fallbackValue;
};

const InstrumentalBreakIconPreview = ({ icon }) => {
  return react.createElement(
    "span",
    {
      className: `lyrics-break-icon lyrics-break-icon-${icon}`,
      style: getInstrumentalBreakPreviewStyle(),
      "aria-hidden": "true",
    },
    createInstrumentalBreakPreviewChildren(icon)
  );
};

const ConfigInstrumentalBreakIconPicker = ({
  name,
  settingKey,
  info,
  defaultValue,
  options = {},
  disabled,
  onChange = () => { },
}) => {
  const optionKeys = useMemo(() => Object.keys(options), [options]);
  const fallbackValue = optionKeys.includes("equalizer") ? "equalizer" : optionKeys[0];
  const normalizeValue = useCallback(
    (value) => optionKeys.includes(value) ? value : fallbackValue,
    [optionKeys, fallbackValue]
  );
  const [value, setValue] = useState(normalizeValue(defaultValue));

  useEffect(() => {
    setValue(normalizeValue(defaultValue));
  }, [defaultValue, normalizeValue]);

  const handleSelect = useCallback(
    (nextValue) => {
      if (disabled || !optionKeys.includes(nextValue)) return;
      setValue(nextValue);
      onChange(settingKey || name, nextValue);
    },
    [disabled, optionKeys, onChange, settingKey, name]
  );

  if (!optionKeys.length) return null;

  const selectedLabel = options[value] || value;

  return react.createElement(
    "div",
    {
      className: "setting-row instrumental-break-picker-row",
      "data-setting-key": settingKey,
      style: disabled ? { opacity: 0.5, pointerEvents: "none" } : {},
    },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" }, name),
        info && react.createElement("div", {
          className: "setting-description",
          dangerouslySetInnerHTML: { __html: info },
        })
      ),
      react.createElement(
        "div",
        { className: "setting-row-right instrumental-break-picker-control" },
        react.createElement(
          "div",
          { className: "instrumental-break-selected-preview" },
          react.createElement(
            "span",
            { className: "instrumental-break-selected-stage" },
            react.createElement(InstrumentalBreakIconPreview, { icon: value })
          ),
          react.createElement("span", { className: "instrumental-break-selected-label" }, selectedLabel)
        ),
        react.createElement(
          "div",
          { className: "instrumental-break-preview-grid" },
          ...optionKeys.map((key) => {
            const isSelected = key === value;

            return react.createElement(
              "button",
              {
                key,
                type: "button",
                className: `instrumental-break-preview-option${isSelected ? " active" : ""}`,
                onClick: () => handleSelect(key),
                "aria-pressed": isSelected,
                "aria-label": options[key] || key,
                title: options[key] || key,
              },
              react.createElement(
                "span",
                { className: "instrumental-break-option-stage" },
                react.createElement(InstrumentalBreakIconPreview, { icon: key })
              ),
              react.createElement("span", { className: "instrumental-break-option-label" }, options[key] || key)
            );
          })
        )
      )
    )
  );
};

const ConfigInput = ({ name, settingKey, defaultValue, onChange = () => { }, inputType = "text" }) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  const setValueCallback = useCallback(
    (event) => {
      const nextValue = event.target.value;
      setValue(nextValue);
      onChange(settingKey || name, nextValue);
    },
    [name, settingKey, onChange]
  );

  return react.createElement(
    "div",
    {
      className: "setting-row",
      "data-setting-key": settingKey,
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
          className: "config-text-input",
          type: inputType,
          value: value ?? "",
          onChange: setValueCallback,
          "aria-label": name,
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
  disabled,
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
  const fontChangeSourceRef = useRef(null);

  useEffect(() => {
    const safeVal = getSafeValue(defaultValue);
    const localChangeSource = fontChangeSourceRef.current;
    fontChangeSourceRef.current = null;

    if (localChangeSource === "custom") {
      setUseCustomFont(true);
      setCustomFont(safeVal);
      return;
    }

    if (localChangeSource === "preset") {
      setUseCustomFont(false);
      if (safeVal && GOOGLE_FONTS.includes(safeVal)) setSelectedFont(safeVal);
      return;
    }

    const isCustom = isCustomFontValue(safeVal);
    setUseCustomFont(isCustom);
    if (isCustom) {
      setCustomFont(safeVal);
    } else if (safeVal && GOOGLE_FONTS.includes(safeVal)) {
      setSelectedFont(safeVal);
    }
  }, [defaultValue]);

  const handleFontChange = (event) => {
    if (disabled) return;
    const font = event.target.value;
    setSelectedFont(font);
    if (!useCustomFont) {
      fontChangeSourceRef.current = "preset";
      onChange(settingKey || name, font);
    }
  };

  const handleCustomFontChange = (event) => {
    if (disabled) return;
    const font = event.target.value;
    setCustomFont(font);
    if (useCustomFont) {
      fontChangeSourceRef.current = "custom";
      onChange(settingKey || name, font);
    }
  };

  const handleModeChange = (nextMode) => {
    if (disabled) return;
    const nextUseCustom = nextMode === "custom";
    if (nextUseCustom === useCustomFont) return;

    setUseCustomFont(nextUseCustom);
    if (!nextUseCustom) {
      fontChangeSourceRef.current = "preset";
      onChange(settingKey || name, selectedFont);
    } else if (customFont.trim()) {
      fontChangeSourceRef.current = "custom";
      onChange(settingKey || name, customFont.trim());
    }
  };

  const fontSelector = react.createElement(
    "div",
    { className: "config-font-selector" },
    react.createElement(
      "div",
      {
        className: "config-font-mode",
        role: "group",
        "aria-label": getSettingsText("settings.fontSelector.mode", "Font input mode"),
      },
      react.createElement(
        "button",
        {
          type: "button",
          className: `config-font-mode-button${useCustomFont ? "" : " active"}`,
          onClick: () => handleModeChange("preset"),
          disabled,
          "aria-pressed": !useCustomFont,
        },
        getSettingsText("settings.fontSelector.preset", "Font list")
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: `config-font-mode-button${useCustomFont ? " active" : ""}`,
          onClick: () => handleModeChange("custom"),
          disabled,
          "aria-pressed": useCustomFont,
        },
        getSettingsText("settings.fontSelector.custom", "Manual input")
      )
    ),
    react.createElement(
      "div",
      { className: "config-font-field" },
      useCustomFont
        ? react.createElement("input", {
          className: "config-font-selector-control config-text-input",
          type: "text",
          value: customFont,
          onChange: handleCustomFontChange,
          disabled,
          placeholder: I18n.t("settings.fontPlaceholder") || "Enter font name (e.g., Arial, Roboto)",
          "aria-label": `${name || "Font"} ${getSettingsText("settings.fontSelector.custom", "Manual input")}`,
          spellCheck: false,
        })
        : react.createElement(
          "select",
          {
            className: "config-font-selector-control config-select",
            value: selectedFont,
            onChange: handleFontChange,
            disabled,
            "aria-label": `${name || "Font"} ${getSettingsText("settings.fontSelector.preset", "Font list")}`,
          },
          GOOGLE_FONTS.map((font) =>
            react.createElement("option", { key: font, value: font }, font)
          )
        )
    )
  );

  // name이 있으면 전체 setting-row로 래핑, 없으면 컨트롤만 반환
  if (name) {
    return react.createElement(
      "div",
      {
        className: "setting-row config-font-setting-row",
        "data-setting-key": settingKey,
        style: disabled ? { opacity: 0.5, pointerEvents: "none" } : {},
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
          fontSelector
        )
      )
    );
  }

  return fontSelector;
};

const loadGoogleFontFamily = (fontFamily) => {
  if (!fontFamily) return;

  const fonts = fontFamily.split(",").map((font) => font.trim().replace(/['"]/g, ""));
  fonts.forEach((font) => {
    if (!font || !GOOGLE_FONTS.includes(font)) return;

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
  });
};

// Keep the differences between the main and vinyl controls explicit. Labels and
// current defaults are resolved when rendering, so language/config changes apply.
const LYRICS_TYPOGRAPHY_SECTIONS = [
  {
    role: "original", style: "originalStyle", section: "original-style",
    size: [12, 128, 2], vinylSize: [16, 64, 1],
  },
  {
    role: "phonetic", style: "pronunciationStyle", section: "pronunciation-style",
    size: [10, 96, 2], vinylSize: [10, 40, 1],
    spacing: [-30, 20, 1], vinylSpacing: [-10, 24, 1],
  },
  {
    role: "translation", style: "translationStyle", section: "translation-style",
    size: [12, 128, 2], vinylSize: [10, 44, 1],
    spacing: [-20, 30, 2], vinylSpacing: [-10, 30, 1],
  },
];

const createLyricsTypographyItems = (section, vinyl) => {
  const prefix = `${vinyl ? "fullscreen-vinyl-" : ""}${section.role}`;
  const styleKey = `settingsAdvanced.${section.style}`;
  const range = (property, label, info, [min, max, step], unit) => ({
    desc: I18n.t(`settingsAdvanced.${label}.label`),
    info: I18n.t(`${styleKey}.${info}.desc`),
    key: `${prefix}-${property}`,
    type: ConfigSliderRange,
    min, max, step, unit,
  });
  const items = [];
  if (vinyl) {
    items.push({
      desc: I18n.t("settingsAdvanced.originalStyle.fontFamily"),
      info: I18n.t(`${styleKey}.fontFamilyDesc`),
      key: `${prefix}-font-family`,
      type: ConfigFontSelector,
      defaultValue: CONFIG.visual[`${prefix}-font-family`] || "Pretendard Variable",
    });
  }
  items.push(
    range("font-size", "originalStyle.fontSize", "fontSize", vinyl ? section.vinylSize : section.size, "px"),
    {
      desc: I18n.t("settingsAdvanced.originalStyle.fontWeight.label"),
      info: I18n.t(`${styleKey}.fontWeight.desc`),
      key: `${prefix}-font-weight`,
      type: ConfigFontWeightSlider,
    },
    range("opacity", "originalStyle.opacity", "opacity", [vinyl ? 20 : 0, 100, 5], "%"),
  );
  const spacing = vinyl ? section.vinylSpacing : section.spacing;
  if (spacing) items.push(range("spacing", `${section.style}.gap`, "gap", spacing, "px"));
  items.push(
    range("letter-spacing", `${section.style}.letterSpacing`, "letterSpacing", [-5, 20, 0.5], "px"),
    ...createTextOutlineSettingItems(prefix),
  );
  if (!vinyl && section.role === "phonetic") {
    items.push({
      desc: I18n.t(`${styleKey}.hyphenReplace.label`),
      info: I18n.t(`${styleKey}.hyphenReplace.desc`),
      key: "phonetic-hyphen-replace",
      type: ConfigSelection,
      options: {
        keep: I18n.t(`${styleKey}.hyphenReplace.options.keep`),
        space: I18n.t(`${styleKey}.hyphenReplace.options.space`),
        remove: I18n.t(`${styleKey}.hyphenReplace.options.remove`),
      },
    });
  }
  return items;
};

// Return the existing elements directly; a new component wrapper would change
// the settings subtree's identity and can reset a control's local state.
const renderLyricsTypographySections = ({ vinyl = false, onChange }) =>
  LYRICS_TYPOGRAPHY_SECTIONS.flatMap((section) => {
    const styleKey = `settingsAdvanced.${section.style}`;
    const fontKey = `${section.role}-font-family`;
    const children = [react.createElement(SettingsSectionTitle, {
      title: I18n.t(`${styleKey}.title`),
      subtitle: I18n.t(`${styleKey}.subtitle`),
      sectionKey: `${vinyl ? "vinyl-" : ""}${section.section}`,
    })];
    if (!vinyl) {
      children.push(react.createElement("div", { className: "setting-row" },
        react.createElement("div", { className: "setting-row-content" },
          react.createElement("div", { className: "setting-row-left" },
            react.createElement("div", { className: "setting-name" },
              I18n.t("settingsAdvanced.originalStyle.fontFamily")),
            react.createElement("div", { className: "setting-description" },
              I18n.t(`${styleKey}.fontFamilyDesc`)),
          ),
          react.createElement("div", { className: "setting-row-right font-selector-container" },
            react.createElement(ConfigFontSelector, {
              name: "",
              defaultValue: CONFIG.visual[fontKey] || "Pretendard Variable",
              onChange: (_, value) => onChange(fontKey, value),
            }),
          ),
        ),
      ));
    }
    children.push(react.createElement(OptionList, {
      items: createLyricsTypographyItems(section, vinyl),
      onChange,
    }));
    return children;
  });

const SETTINGS_LYRICS_PREVIEW_TEXT = "此処に歌詞があります";
const SETTINGS_LYRICS_PREVIEW_LINE = Object.freeze({
  text: SETTINGS_LYRICS_PREVIEW_TEXT,
  startTime: 0,
  endTime: 1200,
  syllables: Object.freeze(
    Array.from(SETTINGS_LYRICS_PREVIEW_TEXT).map((text, index) => Object.freeze({
      text,
      startTime: index * 100,
      endTime: (index + 1) * 100,
    }))
  ),
});
const SETTINGS_LYRICS_PREVIEW_FURIGANA = new Map([
  [0, "こ"],
  [1, "こ"],
  [3, "か"],
  [4, "し"],
]);

const getSettingsLyricsPreviewStyle = () => {
  return {
    ...getLyricsTypographyStyleVariables(CONFIG.visual),
    textAlign: CONFIG.visual.alignment || "center",
  };
};

const syncSettingsLyricsPreviewStyles = () => {
  const preview = document.getElementById("settings-live-lyrics-preview");
  if (!preview) return;

  const style = getSettingsLyricsPreviewStyle();
  Object.entries(style).forEach(([name, value]) => {
    if (name.startsWith("--")) {
      preview.style.setProperty(name, String(value));
    } else {
      preview.style[name] = value;
    }
  });
  preview.dataset.furiganaEnabled = CONFIG.visual["furigana-enabled"] === true
    ? "true"
    : "false";
};

// NowPlaying 패널 가사 미리보기 컴포넌트
const NowPlayingPanelPreview = () => {
  const parsePanelNumber = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };
  const parsePanelFloat = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const [fontFamily, setFontFamily] = useState(CONFIG.visual["panel-lyrics-font-family"] || "Pretendard Variable");
  const [originalFont, setOriginalFont] = useState(CONFIG.visual["panel-lyrics-original-font"] || "");
  const [phoneticFont, setPhoneticFont] = useState(CONFIG.visual["panel-lyrics-phonetic-font"] || "");
  const [translationFont, setTranslationFont] = useState(CONFIG.visual["panel-lyrics-translation-font"] || "");
  const [fontScale, setFontScale] = useState(parsePanelNumber(CONFIG.visual["panel-font-scale"], 100));
  const [originalSize, setOriginalSize] = useState(parsePanelNumber(CONFIG.visual["panel-lyrics-original-size"], 26));
  const [phoneticSize, setPhoneticSize] = useState(parsePanelNumber(CONFIG.visual["panel-lyrics-phonetic-size"], 13));
  const [translationSize, setTranslationSize] = useState(parsePanelNumber(CONFIG.visual["panel-lyrics-translation-size"], 13));
  const [originalOutlineWidth, setOriginalOutlineWidth] = useState(parsePanelFloat(CONFIG.visual["panel-lyrics-original-outline-width"], 0));
  const [originalOutlineColor, setOriginalOutlineColor] = useState(CONFIG.visual["panel-lyrics-original-outline-color"] || "#000000");
  const [phoneticOutlineWidth, setPhoneticOutlineWidth] = useState(parsePanelFloat(CONFIG.visual["panel-lyrics-phonetic-outline-width"], 0));
  const [phoneticOutlineColor, setPhoneticOutlineColor] = useState(CONFIG.visual["panel-lyrics-phonetic-outline-color"] || "#000000");
  const [translationOutlineWidth, setTranslationOutlineWidth] = useState(parsePanelFloat(CONFIG.visual["panel-lyrics-translation-outline-width"], 0));
  const [translationOutlineColor, setTranslationOutlineColor] = useState(CONFIG.visual["panel-lyrics-translation-outline-color"] || "#000000");

  // 배경 설정
  const [bgType, setBgType] = useState(CONFIG.visual["panel-bg-type"] || "album");
  const [bgColor, setBgColor] = useState(CONFIG.visual["panel-bg-color"] || "#6366f1");
  const [bgGradient1, setBgGradient1] = useState(CONFIG.visual["panel-bg-gradient-1"] || "#6366f1");
  const [bgGradient2, setBgGradient2] = useState(CONFIG.visual["panel-bg-gradient-2"] || "#a855f7");
  const [bgOpacity, setBgOpacity] = useState(parsePanelNumber(CONFIG.visual["panel-bg-opacity"], 30));

  // Border 설정
  const [borderEnabled, setBorderEnabled] = useState(CONFIG.visual["panel-border-enabled"] ?? false);
  const [borderColor, setBorderColor] = useState(CONFIG.visual["panel-border-color"] || "#ffffff");
  const [borderOpacity, setBorderOpacity] = useState(parsePanelNumber(CONFIG.visual["panel-border-opacity"], 10));

  // 설정 변경 리스너
  useEffect(() => {
    const handlePreviewUpdate = (event) => {
      const { name, value } = event.detail || {};
      if (name === "panel-lyrics-font-family") setFontFamily(value || "Pretendard Variable");
      if (name === "panel-lyrics-original-font") setOriginalFont(value || "");
      if (name === "panel-lyrics-phonetic-font") setPhoneticFont(value || "");
      if (name === "panel-lyrics-translation-font") setTranslationFont(value || "");
      if (name === "panel-font-scale") setFontScale(parsePanelNumber(value, 100));
      if (name === "panel-lyrics-original-size") setOriginalSize(parsePanelNumber(value, 26));
      if (name === "panel-lyrics-phonetic-size") setPhoneticSize(parsePanelNumber(value, 13));
      if (name === "panel-lyrics-translation-size") setTranslationSize(parsePanelNumber(value, 13));
      if (name === "panel-lyrics-original-outline-width") setOriginalOutlineWidth(parsePanelFloat(value, 0));
      if (name === "panel-lyrics-original-outline-color") setOriginalOutlineColor(value || "#000000");
      if (name === "panel-lyrics-phonetic-outline-width") setPhoneticOutlineWidth(parsePanelFloat(value, 0));
      if (name === "panel-lyrics-phonetic-outline-color") setPhoneticOutlineColor(value || "#000000");
      if (name === "panel-lyrics-translation-outline-width") setTranslationOutlineWidth(parsePanelFloat(value, 0));
      if (name === "panel-lyrics-translation-outline-color") setTranslationOutlineColor(value || "#000000");
      // 배경 설정
      if (name === "panel-bg-type") setBgType(value || "album");
      if (name === "panel-bg-color") setBgColor(value || "#6366f1");
      if (name === "panel-bg-gradient-1") setBgGradient1(value || "#6366f1");
      if (name === "panel-bg-gradient-2") setBgGradient2(value || "#a855f7");
      if (name === "panel-bg-opacity") setBgOpacity(parsePanelNumber(value, 30));
      // Border 설정
      if (name === "panel-border-enabled") setBorderEnabled(value === true || value === "true");
      if (name === "panel-border-color") setBorderColor(value || "#ffffff");
      if (name === "panel-border-opacity") setBorderOpacity(parsePanelNumber(value, 10));
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

  const activeIndex = 4;
  const previewLineSlotHeight = Math.round(Math.max(68, Math.min(96, originalSize * scale * 3.6)));
  const sampleLyrics = allSampleLyrics.map((line, idx) => ({
    ...line,
    active: idx === activeIndex
  }));

  // 배경 스타일 계산
  const getBackgroundStyle = () => {
    const opacityValue = bgOpacity / 100;
    switch (bgType) {
      case "transparent":
        return "transparent";
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

  const previewBackgroundStyle = bgType === "transparent"
    ? "transparent"
    : `linear-gradient(rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.38)), ${getBackgroundStyle()}`;
  const previewBackdropFilter = bgType === "transparent" || bgOpacity === 0 ? "none" : "blur(20px)";

  return react.createElement(
    "div",
    {
      className: "option-list-wrapper"
    },
    react.createElement(
      "div",
      {
        style: {
          padding: "16px",
          position: "relative",
          overflow: "hidden",
          aspectRatio: "1 / 1",
           boxSizing: "border-box",
           display: "flex",
           flexDirection: "column",
          background: previewBackgroundStyle,
          backdropFilter: previewBackdropFilter,
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
            position: "absolute",
            top: "16px",
            left: "16px",
            right: "16px",
            zIndex: 2,
            marginBottom: 0,
            fontSize: "11px",
            fontWeight: "700",
            color: "rgba(255, 255, 255, 0.85)",
            letterSpacing: "0.02em",
          }
        },
        I18n.t("settingsAdvanced.nowPlayingPanel.preview") || "Preview"
      ),
      // 가사 미리보기 (원어 → 발음 → 번역 순서)
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: "1 1 auto",
            gap: "4px",
            minHeight: 0,
            overflow: "hidden",
            zIndex: 1,
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
                justifyContent: "center",
                flex: `0 0 ${previewLineSlotHeight}px`,
                minHeight: `${previewLineSlotHeight}px`,
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
                  textShadow: createOutsideTextOutlineShadow(originalOutlineWidth, originalOutlineColor),
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
                  textShadow: createOutsideTextOutlineShadow(phoneticOutlineWidth, phoneticOutlineColor),
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
                  textShadow: createOutsideTextOutlineShadow(translationOutlineWidth, translationOutlineColor),
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

const KARAOKE_FILL_CURVE_DEFAULT_POINTS = [
  { x: 0, y: 0 },
  { x: 0.25, y: 0.25 },
  { x: 0.5, y: 0.5 },
  { x: 0.75, y: 0.75 },
  { x: 1, y: 1 },
];

const clampKaraokeCurveValue = (value, fallback = 0) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numberValue));
};

const normalizeKaraokeFillCurvePoints = (value) => {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  const points = KARAOKE_FILL_CURVE_DEFAULT_POINTS.map((defaultPoint, index) => {
    const source = Array.isArray(parsed) ? parsed[index] : null;
    const sourceX = Array.isArray(source) ? source[0] : source?.x;
    const sourceY = Array.isArray(source) ? source[1] : source?.y;
    return {
      x: defaultPoint.x,
      y: clampKaraokeCurveValue(sourceY, defaultPoint.y),
    };
  });

  points[0].y = 0;
  points[points.length - 1].y = 1;
  for (let index = 1; index < points.length - 1; index += 1) {
    points[index].y = Math.max(points[index - 1].y, points[index].y);
  }
  for (let index = points.length - 2; index > 0; index -= 1) {
    points[index].y = Math.min(points[index + 1].y, points[index].y);
  }

  return points;
};

const serializeKaraokeFillCurvePoints = (points) => JSON.stringify(
  normalizeKaraokeFillCurvePoints(points).map((point) => [
    Math.round(point.x * 1000) / 1000,
    Math.round(point.y * 1000) / 1000,
  ])
);

const evaluateKaraokeFillCurvePoints = (points, inputValue) => {
  const normalizedValue = clampKaraokeCurveValue(inputValue);
  const safePoints = normalizeKaraokeFillCurvePoints(points);
  if (normalizedValue <= 0) return 0;
  if (normalizedValue >= 1) return 1;

  let segmentIndex = 0;
  for (let index = 0; index < safePoints.length - 1; index += 1) {
    if (normalizedValue >= safePoints[index].x && normalizedValue <= safePoints[index + 1].x) {
      segmentIndex = index;
      break;
    }
  }

  const p0 = safePoints[Math.max(0, segmentIndex - 1)];
  const p1 = safePoints[segmentIndex];
  const p2 = safePoints[segmentIndex + 1];
  const p3 = safePoints[Math.min(safePoints.length - 1, segmentIndex + 2)];
  const localProgress = (normalizedValue - p1.x) / Math.max(0.0001, p2.x - p1.x);
  const rawControlY = (p1.y + p2.y) / 2 + (p2.y - p0.y + p3.y - p1.y) / 8;
  const controlY = Math.max(p1.y, Math.min(p2.y, rawControlY));
  const oneMinusProgress = 1 - localProgress;
  const curvedValue =
    oneMinusProgress * oneMinusProgress * p1.y +
    2 * oneMinusProgress * localProgress * controlY +
    localProgress * localProgress * p2.y;

  return clampKaraokeCurveValue(curvedValue);
};

const ConfigKaraokeFillCurveEditor = ({
  name,
  settingKey,
  defaultValue,
  info,
  disabled = false,
  onChange = () => { },
}) => {
  const graphRef = useRef(null);
  const [points, setPoints] = useState(() => normalizeKaraokeFillCurvePoints(defaultValue));
  const pendingPointsRef = useRef(points);

  useEffect(() => {
    const nextPoints = normalizeKaraokeFillCurvePoints(defaultValue);
    pendingPointsRef.current = nextPoints;
    setPoints(nextPoints);
  }, [defaultValue]);

  const viewBox = { width: 320, height: 180, padding: 22 };
  const plotWidth = viewBox.width - viewBox.padding * 2;
  const plotHeight = viewBox.height - viewBox.padding * 2;
  const toSvgPoint = (point) => ({
    x: viewBox.padding + point.x * plotWidth,
    y: viewBox.padding + (1 - point.y) * plotHeight,
  });
  const curvePath = Array.from({ length: 49 }, (_, index) => {
    const x = index / 48;
    const y = evaluateKaraokeFillCurvePoints(points, x);
    const svgX = viewBox.padding + x * plotWidth;
    const svgY = viewBox.padding + (1 - y) * plotHeight;
    return `${index === 0 ? "M" : "L"} ${svgX.toFixed(2)} ${svgY.toFixed(2)}`;
  }).join(" ");
  const defaultPath = `M ${viewBox.padding} ${viewBox.height - viewBox.padding} L ${viewBox.width - viewBox.padding} ${viewBox.padding}`;

  const commitPoints = (nextPoints) => {
    const normalizedPoints = normalizeKaraokeFillCurvePoints(nextPoints);
    pendingPointsRef.current = normalizedPoints;
    setPoints(normalizedPoints);
    onChange(settingKey || "karaoke-fill-correction-curve", serializeKaraokeFillCurvePoints(normalizedPoints));
  };

  const updatePointFromPointer = (pointIndex, event) => {
    if (disabled || pointIndex <= 0 || pointIndex >= points.length - 1 || !graphRef.current) {
      return;
    }

    const rect = graphRef.current.getBoundingClientRect();
    const basePoints = pendingPointsRef.current || points;
    const rawY = 1 - ((event.clientY - rect.top - viewBox.padding * (rect.height / viewBox.height)) /
      Math.max(1, plotHeight * (rect.height / viewBox.height)));
    const minY = basePoints[pointIndex - 1].y;
    const maxY = basePoints[pointIndex + 1].y;
    const nextPoints = basePoints.map((point, index) => (
      index === pointIndex
        ? { ...point, y: Math.max(minY, Math.min(maxY, clampKaraokeCurveValue(rawY, point.y))) }
        : point
    ));
    const normalizedPoints = normalizeKaraokeFillCurvePoints(nextPoints);
    pendingPointsRef.current = normalizedPoints;
    setPoints(normalizedPoints);
  };

  const startDrag = (pointIndex, event) => {
    if (disabled || pointIndex <= 0 || pointIndex >= points.length - 1) {
      return;
    }

    event.preventDefault();
    updatePointFromPointer(pointIndex, event);

    const handlePointerMove = (moveEvent) => updatePointFromPointer(pointIndex, moveEvent);
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      commitPoints(pendingPointsRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const resetCurve = () => {
    commitPoints(KARAOKE_FILL_CURVE_DEFAULT_POINTS);
  };

  return react.createElement(
    "div",
    {
      className: "setting-row karaoke-fill-curve-row",
      "data-setting-key": settingKey,
      style: disabled ? { opacity: 0.5, pointerEvents: "none" } : {},
    },
    react.createElement(
      "div",
      { className: "setting-row-content" },
      react.createElement(
        "div",
        { className: "setting-row-left" },
        react.createElement("div", { className: "setting-name" }, name),
        info && react.createElement("div", { className: "setting-description" }, info)
      ),
      react.createElement(
        "div",
        { className: "setting-row-right karaoke-fill-curve-control" },
        react.createElement(
          "svg",
          {
            ref: graphRef,
            className: "karaoke-fill-curve-graph",
            viewBox: `0 0 ${viewBox.width} ${viewBox.height}`,
            role: "img",
            "aria-label": name,
          },
          [0, 0.25, 0.5, 0.75, 1].map((tick) => react.createElement("line", {
            key: `grid-x-${tick}`,
            className: "karaoke-fill-curve-grid-line",
            x1: viewBox.padding + tick * plotWidth,
            y1: viewBox.padding,
            x2: viewBox.padding + tick * plotWidth,
            y2: viewBox.height - viewBox.padding,
          })),
          [0, 0.25, 0.5, 0.75, 1].map((tick) => react.createElement("line", {
            key: `grid-y-${tick}`,
            className: "karaoke-fill-curve-grid-line",
            x1: viewBox.padding,
            y1: viewBox.padding + tick * plotHeight,
            x2: viewBox.width - viewBox.padding,
            y2: viewBox.padding + tick * plotHeight,
          })),
          react.createElement("path", {
            className: "karaoke-fill-curve-default-path",
            d: defaultPath,
          }),
          react.createElement("path", {
            className: "karaoke-fill-curve-path",
            d: curvePath,
          }),
          points.map((point, index) => {
            const svgPoint = toSvgPoint(point);
            return react.createElement("g", {
              key: `point-${index}`,
              className: `karaoke-fill-curve-point${index === 0 || index === points.length - 1 ? " is-fixed" : ""}`,
              onPointerDown: (event) => startDrag(index, event),
            },
              react.createElement("circle", {
                cx: svgPoint.x,
                cy: svgPoint.y,
                r: index === 0 || index === points.length - 1 ? 5 : 7,
              }),
              react.createElement("text", {
                x: svgPoint.x,
                y: Math.max(13, svgPoint.y - 10),
              }, `${Math.round(point.y * 100)}%`)
            );
          })
        ),
        react.createElement(
          "button",
          {
            className: "btn karaoke-fill-curve-reset",
            type: "button",
            onClick: resetCurve,
          },
          getSettingsText("settings.syncCreatorSettings.fillCurve.reset", "Reset")
        )
      )
    )
  );
};

const SETTINGS_HOTKEY_LABELS = {
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  meta: "⌘",
  command: "⌘",
  cmd: "⌘",
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  space: "Space",
  enter: "Enter",
  return: "Enter",
  esc: "Esc",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  numpaddivide: "Num /",
};

const normalizeSettingsHotkeyEvent = (event) => {
  const aliases = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    " ": "space",
    Spacebar: "space",
    Enter: "enter",
    Escape: "esc",
    Esc: "esc",
    Control: "ctrl",
    Meta: "meta",
    Alt: "alt",
    Shift: "shift",
    Del: "delete",
  };
  const baseKey = event.code === "NumpadDivide"
    ? "numpaddivide"
    : aliases[event.key] || String(event.key || "").toLowerCase();

  if (!baseKey || ["ctrl", "alt", "shift", "meta"].includes(baseKey)) return "";

  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("meta");
  parts.push(baseKey);
  return [...new Set(parts)].join("+");
};

const getSettingsHotkeyTokens = (value) => String(value || "")
  .split("+")
  .map((token) => token.trim().toLowerCase())
  .filter(Boolean);

const ConfigHotkey = ({ name, settingKey, defaultValue, onChange = () => { } }) => {
  const [value, setValue] = useState(defaultValue || "");
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);

  useEffect(() => {
    setValue(defaultValue || "");
  }, [defaultValue]);

  const commitHotkey = useCallback((nextValue) => {
    setValue(nextValue);
    onChange(settingKey || name, nextValue);
  }, [name, onChange, settingKey]);

  useEffect(() => {
    if (!isRecording) return undefined;

    const handleRecordingKeyDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (event.key === "Escape") {
        setIsRecording(false);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        commitHotkey("");
        setIsRecording(false);
        return;
      }

      const nextValue = normalizeSettingsHotkeyEvent(event);
      if (!nextValue) return;

      commitHotkey(nextValue);
      setIsRecording(false);
    };

    window.addEventListener("keydown", handleRecordingKeyDown, true);
    return () => window.removeEventListener("keydown", handleRecordingKeyDown, true);
  }, [commitHotkey, isRecording]);

  const tokens = getSettingsHotkeyTokens(value);
  const startRecording = () => {
    setIsRecording(true);
    recorderRef.current?.focus();
  };

  return react.createElement(
    "div",
    {
      className: "setting-row",
      "data-setting-key": settingKey,
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
        react.createElement(
          "div",
          { className: "config-hotkey-control" },
          react.createElement(
            "button",
            {
              ref: recorderRef,
              type: "button",
              className: `config-hotkey-recorder${isRecording ? " recording" : ""}`,
              onClick: startRecording,
              onBlur: () => setIsRecording(false),
              "aria-label": isRecording
                ? `${name}: ${getSettingsText("settings.hotkey.recording", "Press a key combination")}`
                : `${name}: ${value || getSettingsText("settings.hotkey.unassigned", "Not assigned")}`,
              "aria-pressed": isRecording,
              title: getSettingsText("settings.hotkey.hint", "Click, then press the desired key combination"),
            },
            isRecording
              ? react.createElement(
                "span",
                { className: "config-hotkey-recording-state" },
                react.createElement("span", { className: "config-hotkey-recording-dot", "aria-hidden": "true" }),
                getSettingsText("settings.hotkey.recording", "Press a key combination")
              )
              : tokens.length > 0
                ? react.createElement(
                  "span",
                  { className: "config-hotkey-keycaps", "aria-hidden": "true" },
                  ...tokens.map((token, index) =>
                    react.createElement(
                      "kbd",
                      { className: "config-hotkey-keycap", key: `${token}-${index}` },
                      SETTINGS_HOTKEY_LABELS[token] || (token.length === 1 ? token.toUpperCase() : token)
                    )
                  )
                )
                : react.createElement(
                  "span",
                  { className: "config-hotkey-empty" },
                  getSettingsText("settings.hotkey.unassigned", "Not assigned")
                ),
            react.createElement(
              "span",
              { className: "config-hotkey-edit-label", "aria-hidden": "true" },
              isRecording ? "Esc" : getSettingsText("settings.hotkey.change", "Change")
            )
          ),
          value && !isRecording && react.createElement(
            "button",
            {
              type: "button",
              className: "config-hotkey-clear",
              onClick: () => commitHotkey(""),
              "aria-label": `${name} ${getSettingsText("settings.hotkey.clear", "Clear shortcut")}`,
              title: getSettingsText("settings.hotkey.clear", "Clear shortcut"),
            },
            "×"
          ),
          react.createElement(
            "span",
            { className: "settings-visually-hidden", "aria-live": "polite" },
            isRecording
              ? getSettingsText("settings.hotkey.recording", "Press a key combination")
              : value
                ? `${getSettingsText("settings.hotkey.saved", "Saved")}: ${value}`
                : getSettingsText("settings.hotkey.unassigned", "Not assigned")
          )
        )
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
      "data-setting-key": settingKey,
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


const OptionList = ({ type, items, onChange }) => {
  const [itemList, setItemList] = useState(items);
  const [, forceUpdate] = useState();

  useEffect(() => {
    setItemList(items);
  }, [items]);

  useEffect(() => {
    if (!type) return;

    const eventListener = (event) => {
      if (event.detail?.type !== type) return;
      setItemList(event.detail.items);
    };
    document.addEventListener("ivLyrics", eventListener);

    return () => document.removeEventListener("ivLyrics", eventListener);
  }, []);

  useEffect(() => {
    const configListener = (event) => {
      if (event.detail?.type !== "config") return;
      forceUpdate({});
    };

    window.addEventListener("ivLyrics", configListener);
    return () => window.removeEventListener("ivLyrics", configListener);
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
      item.type === ConfigInstrumentalBreakIconPicker ||
      item.type === ConfigKaraokeFillCurveEditor ||
      item.type === VideoHelperToggle ||
      item.type === LyricsHelperToggle
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

// Pre-defined styles to avoid recreation on each render
const MODAL_STYLES = {
  header: { margin: 0, fontSize: "18px", fontWeight: "600" },
  previewTitle: { marginTop: 0, marginBottom: "10px" },
};

const getEffectiveReducedMotionPreference = () =>
  CONFIG.visual["reduce-motion"] === true;

const getSettingsMotionDurationMs = () =>
  getEffectiveReducedMotionPreference() ? 24 : 280;

const getSettingsText = (key, fallback) => {
  const value = I18n?.t?.(key);
  return !value || value === key ? fallback : value;
};

const SETTINGS_UI_THEME_STORAGE_KEY = "ivLyrics:settings-ui-theme";

const getSettingsUiTheme = () => {
  const storedTheme = window.ivLyricsStoragePersistence?.getItem(SETTINGS_UI_THEME_STORAGE_KEY)
    ?? localStorage.getItem(SETTINGS_UI_THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "auto") {
    return storedTheme;
  }

  return "auto";
};

const getSystemSettingsUiTheme = () => {
  try {
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches
      ? "light"
      : "dark";
  } catch (error) {
    return "dark";
  }
};

const getEffectiveSettingsUiTheme = (themePreference, systemTheme) =>
  themePreference === "auto" ? systemTheme : themePreference;

const persistSettingsUiTheme = (theme) => {
  if (window.ivLyricsStoragePersistence) {
    window.ivLyricsStoragePersistence.setItem(SETTINGS_UI_THEME_STORAGE_KEY, theme);
  } else {
    localStorage.setItem(SETTINGS_UI_THEME_STORAGE_KEY, theme);
  }
};

const SETTINGS_BACKGROUND_PRESETS = [
  {
    id: "none",
    labelKey: "settingsUi.background.none",
    fallbackLabel: "Minimal",
    descriptionKey: "settingsUi.background.noneDesc",
    fallbackDescription: "Keep Spotify's base surface and apply only the core lyric layout.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 10h10M7 14h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "colorful",
    labelKey: "settings.colorful.label",
    fallbackLabel: "Colorful",
    descriptionKey: "settings.colorful.desc",
    fallbackDescription: "Use the vivid ivLyrics color treatment.",
    icon:
      '<circle cx="8" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 11l3-1.5M10.5 13l3 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "gradient-background",
    labelKey: "settings.gradientBackground.label",
    fallbackLabel: "Album Gradient",
    descriptionKey: "settings.gradientBackground.desc",
    fallbackDescription: "Build a soft gradient from the current album art.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 17c2.2-4.5 5-6.8 8.2-6.8 2.1 0 4.2 1 5.8 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "blur-gradient-background",
    labelKey: "settings.blurGradientBackground.label",
    fallbackLabel: "Blur Gradient",
    descriptionKey: "settings.blurGradientBackground.desc",
    fallbackDescription: "Use a deeper, more atmospheric blur with gradient color.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 12h.01M18 12h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
  {
    id: "solid-background",
    labelKey: "settings.solidBackground.label",
    fallbackLabel: "Solid Color",
    descriptionKey: "settings.solidBackground.desc",
    fallbackDescription: "Use one fixed color with predictable contrast.",
    icon:
      '<rect x="4" y="6" width="16" height="12" rx="3" fill="currentColor"/><path d="M7 10h10" stroke="rgba(255,255,255,0.75)" stroke-width="1.7" stroke-linecap="round"/>',
  },
  {
    id: "video-background",
    labelKey: "settings.videoBackground.label",
    fallbackLabel: "Community Video",
    descriptionKey: "settings.videoBackground.desc",
    fallbackDescription: "Play synchronized YouTube video backgrounds behind lyrics.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/>',
  },
];

const FULLSCREEN_PRESENTATION_PRESETS = Object.freeze([
  {
    id: "compact-vinyl",
    labelKey: "vinyl.presentation.compactLabel",
    fallbackLabel: "Compact vinyl",
    descriptionKey: "vinyl.presentation.compactDescription",
    fallbackDescription:
      "Keep the standard lyric layout and show a partially exposed record behind the album cover.",
    icon:
      '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
  },
  {
    id: "vinyl",
    labelKey: "vinyl.presentation.vinylLabel",
    fallbackLabel: "Full vinyl",
    descriptionKey: "vinyl.presentation.vinylDescription",
    fallbackDescription:
      "Show the full record player with the focused lyric at the bottom.",
    icon:
      '<rect x="3" y="5" width="9" height="14" rx="2"/><circle cx="15" cy="12" r="6"/><circle cx="15" cy="12" r="1.5"/>',
  },
  {
    id: "video",
    labelKey: "vinyl.presentation.videoLabel",
    fallbackLabel: "Video stage",
    descriptionKey: "vinyl.presentation.videoDescription",
    fallbackDescription:
      "Show the synchronized YouTube video with the focused lyric at the bottom.",
    icon:
      '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  },
]);

const normalizeFullscreenPresentationPreset = (value) => {
  const normalized = String(value || "").trim();
  return FULLSCREEN_PRESENTATION_PRESETS.some(
    (preset) => preset.id === normalized
  )
    ? normalized
    : "vinyl";
};

const FullscreenPresentationPicker = ({ defaultValue, onChange }) => {
  const [selectedMode, setSelectedMode] = react.useState(() =>
    normalizeFullscreenPresentationPreset(defaultValue)
  );

  const applyMode = (modeId) => {
    const normalized = normalizeFullscreenPresentationPreset(modeId);
    setSelectedMode(normalized);
    onChange?.("fullscreen-focus-presentation", normalized);
  };

  return react.createElement(
    "div",
    {
      className: "fullscreen-presentation-picker",
      "data-setting-key": "fullscreen-focus-presentation",
    },
    react.createElement(
      "div",
      { className: "fullscreen-presentation-picker-heading" },
      react.createElement(
        "strong",
        null,
        getSettingsText(
          "vinyl.presentation.settingsTitle",
          "Focused lyric layout"
        )
      ),
      react.createElement(
        "span",
        null,
        getSettingsText(
          "vinyl.presentation.settingsDescription",
          "Choose the visual used when the album opens focused lyrics."
        )
      )
    ),
    react.createElement(
      "div",
      {
        className: "settings-card-grid fullscreen-presentation-grid",
        role: "radiogroup",
        "aria-label": getSettingsText(
          "vinyl.presentation.settingsTitle",
          "Focused lyric layout"
        ),
      },
      FULLSCREEN_PRESENTATION_PRESETS.map((preset) =>
        react.createElement(
          "button",
          {
            key: preset.id,
            className: `settings-choice-card ${
              selectedMode === preset.id ? "active" : ""
            }`,
            type: "button",
            role: "radio",
            "aria-checked": selectedMode === preset.id,
            onClick: () => applyMode(preset.id),
          },
          react.createElement(
            "div",
            { className: "settings-choice-icon" },
            react.createElement("svg", {
              width: 20,
              height: 20,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.7,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              dangerouslySetInnerHTML: { __html: preset.icon },
            })
          ),
          react.createElement(
            "div",
            { className: "settings-choice-content" },
            react.createElement(
              "strong",
              null,
              getSettingsText(preset.labelKey, preset.fallbackLabel)
            ),
            react.createElement(
              "span",
              null,
              getSettingsText(
                preset.descriptionKey,
                preset.fallbackDescription
              )
            )
          )
        )
      )
    )
  );
};

const getCurrentSettingsBackgroundMode = () => {
  if (CONFIG.visual["video-background"]) return "video-background";
  if (CONFIG.visual["solid-background"]) return "solid-background";
  if (CONFIG.visual["blur-gradient-background"]) return "blur-gradient-background";
  if (CONFIG.visual["gradient-background"]) return "gradient-background";
  if (CONFIG.visual["colorful"]) return "colorful";
  return "none";
};

window.ivLyricsBackgroundPresets = SETTINGS_BACKGROUND_PRESETS;
window.ivLyricsGetBackgroundPresetLabel = (modeId) => {
  const preset = SETTINGS_BACKGROUND_PRESETS.find((item) => item.id === modeId);
  return preset
    ? getSettingsText(preset.labelKey, preset.fallbackLabel)
    : modeId;
};
window.ivLyricsGetCurrentSettingsBackgroundMode = getCurrentSettingsBackgroundMode;

const applySettingsMotionClasses = () => {
  const reduceMotion = getEffectiveReducedMotionPreference();
  document
    .getElementById("ivLyrics-settings-overlay")
    ?.classList.toggle("motion-reduced", reduceMotion);
  document
    .getElementById(`${APP_NAME}-config-container`)
    ?.classList.toggle("motion-reduced", reduceMotion);
};

const SettingsSidebarShell = ({ sidebarRef, children }) =>
  react.createElement(
    "aside",
    {
      className: "settings-sidebar",
      ref: sidebarRef,
      "aria-label": "Settings navigation",
    },
    children
  );

const SettingsMainPanelShell = ({
  contentRef,
  badge,
  label,
  description,
  children,
}) =>
  react.createElement(
    "section",
    {
      className: "settings-main-panel",
      "aria-label": label || "Settings content",
    },
    react.createElement(
      "div",
      {
        className: "settings-content",
        ref: contentRef,
      },
      react.createElement(
        "div",
        { className: "settings-panel-hero" },
        react.createElement("span", { className: "settings-panel-badge" }, badge),
        react.createElement(
          "div",
          { className: "settings-panel-copy" },
          react.createElement("h2", null, label),
          react.createElement("p", null, description)
        )
      ),
      children
    )
  );

const SETTINGS_RELEASE_LINK_STYLE = "color: rgba(248, 250, 252, 0.92); text-decoration: none; border-bottom: 1px solid rgba(255, 255, 255, 0.24); transition: border-color 0.2s;";
const SETTINGS_RELEASE_CODE_STYLE = "background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: #fbbf24;";
const SETTINGS_RELEASE_PARAGRAPH_STYLE = "margin: 12px 0; line-height: 1.7;";

function escapeSettingsReleaseHtml(value) {
  return Utils.escapeHtml(value);
}

function escapeSettingsReleaseAttribute(value) {
  return Utils.escapeAttribute(value);
}

function sanitizeSettingsReleaseUrl(url) {
  return Utils.sanitizeHttpUrl(url);
}

function renderSettingsReleaseMarkdown(markdown) {
  return Utils.renderSafeMarkdownToHTML(markdown, {
    linkStyle: SETTINGS_RELEASE_LINK_STYLE,
    codeStyle: SETTINGS_RELEASE_CODE_STYLE,
    paragraphStyle: SETTINGS_RELEASE_PARAGRAPH_STYLE,
    imageStyle: "max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; display: block;",
    preStyle: "background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 12px 0;",
    blockCodeStyle: "font-family: monospace; font-size: 13px; color: rgba(255,255,255,0.9);",
    blockquoteStyle: "margin: 12px 0; padding-left: 16px; border-left: 3px solid rgba(255, 255, 255, 0.24); color: rgba(255,255,255,0.7); font-style: italic;",
    hrStyle: "border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;",
    headingStyles: {
      1: { tag: "h2", style: "margin: 24px 0 12px; color: #ffffff; font-size: 20px; font-weight: 700;" },
      2: { tag: "h3", style: "margin: 20px 0 10px; color: #ffffff; font-size: 18px; font-weight: 700;" },
      3: { tag: "h4", style: "margin: 16px 0 8px; color: #ffffff; font-size: 16px; font-weight: 600;" },
      4: { tag: "h5", style: "margin: 14px 0 6px; color: #ffffff; font-size: 15px; font-weight: 600;" },
    },
  });
}

// Keep navigation ownership separate from the content order. A section only
// appears here when it genuinely belongs to another settings section; every
// unlisted section remains a direct child of its top-level tab.
const SETTINGS_SECTION_PARENT_BY_KEY = Object.freeze({
  "performance-visual-cost": "performance-rendering",
  "performance-background-work": "performance-rendering",
  "settings-presets": "export-import",
  "db-export-import": "export-import",
  "vinyl-tonearm": "vinyl-mode",
  "vinyl-typography": "vinyl-mode",
  "vinyl-original-style": "vinyl-typography",
  "vinyl-pronunciation-style": "vinyl-typography",
  "vinyl-translation-style": "vinyl-typography",
  "fullscreen-ui": "fullscreen-style",
  "controller-style": "fullscreen-style",
  "auto-hide": "fullscreen-style",
  "tmi-style": "fullscreen-style",
  "panel-background": "panel-lyrics-general",
  "panel-border": "panel-lyrics-general",
  "about-client-info": "about-app-info",
  "about-update": "about-app-info",
  "about-patch-notes": "about-app-info",
});

const buildSettingsNavigationTree = (items = []) => {
  const nodes = items.map((item) => ({ ...item, children: [] }));
  const nodesByKey = new Map(nodes.map((node) => [node.settingKey, node]));
  const roots = [];

  nodes.forEach((node) => {
    const parentKey =
      node.parentSettingKey || SETTINGS_SECTION_PARENT_BY_KEY[node.settingKey];
    const parent = parentKey ? nodesByKey.get(parentKey) : null;
    if (!parent || parent === node || parent.tabId !== node.tabId) {
      roots.push(node);
      return;
    }
    parent.children.push(node);
  });

  const annotate = (node, ancestors = []) => {
    const breadcrumbLabels = [...ancestors, node.label].filter(Boolean);
    return {
      ...node,
      depth: Math.max(0, breadcrumbLabels.length - 1),
      breadcrumb: breadcrumbLabels.join(" › "),
      children: node.children.map((child) => annotate(child, breadcrumbLabels)),
    };
  };

  return roots.map((root) => annotate(root));
};

const settingsNavigationNodeContains = (node, settingKey) =>
  node.settingKey === settingKey ||
  node.children.some((child) => settingsNavigationNodeContains(child, settingKey));

// Keep headings mounted when scroll-spy updates the selected sidebar item.
// Replacing their component type also needlessly invalidates the search index.
const SettingsSectionTitle = ({ title, subtitle, sectionKey }) => {
  const parentSectionKey = sectionKey
    ? SETTINGS_SECTION_PARENT_BY_KEY[sectionKey]
    : null;
  return react.createElement(
    "div",
    {
      className: "section-title",
      ...(sectionKey ? { "data-setting-key": sectionKey } : {}),
      ...(parentSectionKey
        ? { "data-parent-setting-key": parentSectionKey }
        : {}),
    },
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

// Reuse only the result immediately after this setting row, preserving its position.
const getSettingsResultContainer = (button, id, rowClass) => {
  const settingRow = button.closest(".setting-row");
  let resultContainer = settingRow?.nextElementSibling;
  if (!resultContainer || !resultContainer.id || resultContainer.id !== id) {
    resultContainer = document.createElement("div");
    resultContainer.id = id;
    resultContainer.style.cssText = "margin-top: -1px;";
    settingRow?.parentNode?.insertBefore(resultContainer, settingRow.nextSibling);
    if (rowClass) settingRow?.classList.add(rowClass);
  }
  return resultContainer;
};

const ConfigModal = ({
  onRequestClose = () => {},
  initialTab = "general",
  initialSettingKey = null,
}) => {
  const [activeTab, setActiveTab] = react.useState(initialTab || "general");
  const [searchQuery, setSearchQuery] = react.useState("");
  const searchOriginTabRef = react.useRef(initialTab || "general");
  const shouldReduceMotion = getEffectiveReducedMotionPreference();
  const [uiThemePreference, setUiThemePreference] = react.useState(getSettingsUiTheme);
  const [systemUiTheme, setSystemUiTheme] = react.useState(getSystemSettingsUiTheme);
  const uiTheme = getEffectiveSettingsUiTheme(uiThemePreference, systemUiTheme);

  // 검색어 변경 시 검색 결과 탭으로 자동 전환
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim()) {
      if (activeTab !== "search") {
        searchOriginTabRef.current = activeTab;
      }
      setActiveTab("search");
    } else if (activeTab === "search") {
      setActiveTab(searchOriginTabRef.current || "general");
    }
  };

  // 검색 지우기
  const handleClearSearch = () => {
    setSearchQuery("");
    if (activeTab === "search") {
      setActiveTab(searchOriginTabRef.current || "general");
    }
  };

  react.useEffect(() => {
    persistSettingsUiTheme(uiThemePreference);
  }, [uiThemePreference]);

  react.useEffect(() => {
    const overlay = document.getElementById("ivLyrics-settings-overlay");
    overlay?.setAttribute("data-ui-theme", uiTheme);
    overlay?.setAttribute("data-ui-theme-preference", uiThemePreference);
  }, [uiTheme, uiThemePreference]);

  react.useEffect(() => {
    if (uiThemePreference !== "auto" || !window.matchMedia) {
      return undefined;
    }

    let systemThemeQuery;
    try {
      systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
    } catch (error) {
      return undefined;
    }

    const handleSystemThemeChange = (event) => {
      setSystemUiTheme(event.matches ? "light" : "dark");
    };
    handleSystemThemeChange(systemThemeQuery);

    if (systemThemeQuery.addEventListener) {
      systemThemeQuery.addEventListener("change", handleSystemThemeChange);
      return () => systemThemeQuery.removeEventListener("change", handleSystemThemeChange);
    }

    systemThemeQuery.addListener?.(handleSystemThemeChange);
    return () => systemThemeQuery.removeListener?.(handleSystemThemeChange);
  }, [uiThemePreference]);

  const settingsContentRef = react.useRef(null);
  const settingsSidebarRef = react.useRef(null);
  const pendingSidebarScrollRef = react.useRef(null);
  const shouldRestoreSidebarScrollRef = react.useRef(false);
  const isProgrammaticScrollRef = react.useRef(false);
  const programmaticScrollTimerRef = react.useRef(null);
  const programmaticScrollEndCleanupRef = react.useRef(null);
  const highlightTimeoutRef = react.useRef(null);

  const holdProgrammaticScroll = react.useCallback((delay = 1400) => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticScrollTimerRef.current = null;
    }, delay);
  }, []);

  /**
   * Scroll the settings-content container so that the element with
   * the given data-setting-key appears at the top of the visible area.
   * Uses container.scrollTo() instead of scrollIntoView() to avoid
   * accidentally scrolling parent containers (Spotify shell, etc.).
   */
  const scrollToSetting = react.useCallback(
    (settingKey, { behavior = "smooth", highlight = true } = {}) => {
      if (!settingKey) return false;

      const container = settingsContentRef.current;
      if (!container) return false;

      const activePanel = container.querySelector(".tab-content.active");
      if (!activePanel) return false;

      const targetElement = Array.from(
        activePanel.querySelectorAll("[data-setting-key]")
      ).find((element) => element.getAttribute("data-setting-key") === String(settingKey));
      if (!targetElement) return false;

      // Keep scroll-spy locked while the smooth scroll is in flight. The
      // browser's scrollend event releases it; the timer is only a fallback.
      holdProgrammaticScroll(behavior === "smooth" ? 1800 : 120);

      if (programmaticScrollEndCleanupRef.current) {
        programmaticScrollEndCleanupRef.current();
        programmaticScrollEndCleanupRef.current = null;
      }

      if (behavior === "smooth") {
        const handleScrollEnd = () => {
          programmaticScrollEndCleanupRef.current = null;
          // Keep the clicked destination stable through the browser's final
          // layout/scrollbar update before returning control to scroll-spy.
          holdProgrammaticScroll(260);
        };
        const cleanupScrollEnd = () => {
          container.removeEventListener("scrollend", handleScrollEnd);
        };
        programmaticScrollEndCleanupRef.current = cleanupScrollEnd;
        container.addEventListener("scrollend", handleScrollEnd, { once: true });
      }

      // Calculate target position relative to the scroll container
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      const stickyPreview = activePanel.querySelector(".settings-live-preview-sticky");
      const targetFollowsPreview = stickyPreview
        && typeof Node !== "undefined"
        && Boolean(
          stickyPreview.compareDocumentPosition(targetElement)
          & Node.DOCUMENT_POSITION_FOLLOWING
        );
      const stickyPreviewOffset = targetFollowsPreview
        ? stickyPreview.getBoundingClientRect().height + 12
        : 0;
      const scrollTop =
        container.scrollTop
        + (targetRect.top - containerRect.top)
        - stickyPreviewOffset
        - 12;

      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior,
      });

      if (highlight) {
        targetElement.classList.add("setting-highlight-flash");
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        highlightTimeoutRef.current = window.setTimeout(() => {
          targetElement.classList.remove("setting-highlight-flash");
        }, 1800);
      }

      return true;
    },
    [holdProgrammaticScroll]
  );

  // 텍스트 하이라이트 헬퍼 함수
  const highlightText = (text, query) => {
    if (!query.trim() || !text) return text;

    const tokens = [...new Set(
      query
        .normalize("NFKC")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    )].sort((a, b) => b.length - a.length);
    if (tokens.length === 0) return text;

    const escapedTokens = tokens.map((token) =>
      token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const tokenPattern = new RegExp(`(${escapedTokens.join("|")})`, "giu");
    const normalizedTokens = new Set(tokens.map((token) => token.toLocaleLowerCase()));

    return react.createElement(
      react.Fragment,
      null,
      ...String(text).split(tokenPattern).map((part, index) =>
        normalizedTokens.has(part.normalize("NFKC").toLocaleLowerCase())
          ? react.createElement("mark", { key: index, className: "search-highlight" }, part)
          : part
      )
    );
  };

  // 검색 가능한 설정 항목 정의
  // i18nKeys: 모든 언어의 번역을 검색 대상에 포함시키기 위한 i18n 키 경로 배열
  const searchableSettings = react.useMemo(() => [
    // 일반 탭 - 언어
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "language",
      name: I18n.t("settings.language.label"),
      desc: I18n.t("settings.language.desc"),
      i18nKeys: ["tabs.general", "settings.language.label", "settings.language.desc"]
    },
    // 일반 탭 - 시각 효과
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "alignment",
      name: I18n.t("settings.alignment.label"),
      desc: I18n.t("settings.alignment.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.alignment.label", "settings.alignment.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "noise",
      name: I18n.t("settings.noise.label"),
      desc: I18n.t("settings.noise.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.noise.label", "settings.noise.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "reduce-motion",
      name: I18n.t("settings.reduceMotion.label"),
      desc: I18n.t("settings.reduceMotion.desc"),
      i18nKeys: ["tabs.appearance", "sections.motion", "settings.reduceMotion.label", "settings.reduceMotion.desc"]
    },
    {
      section: I18n.t("tabs.performance"),
      sectionKey: "performance",
      settingKey: "performance-frame-rate",
      name: I18n.t("settingsAdvanced.performance.frameRate.label"),
      desc: I18n.t("settingsAdvanced.performance.frameRate.desc"),
      i18nKeys: ["tabs.performance", "settingsAdvanced.performance.rendering.title", "settingsAdvanced.performance.frameRate.label", "settingsAdvanced.performance.frameRate.desc"]
    },
    {
      section: I18n.t("tabs.performance"),
      sectionKey: "performance",
      settingKey: "karaoke-line-transition",
      name: I18n.t("settingsAdvanced.karaokeMode.lineTransition.label"),
      desc: I18n.t("settingsAdvanced.karaokeMode.lineTransition.desc"),
      i18nKeys: ["tabs.performance", "settingsAdvanced.performance.rendering.title", "settingsAdvanced.karaokeMode.lineTransition.label", "settingsAdvanced.karaokeMode.lineTransition.desc"]
    },
    {
      section: I18n.t("tabs.performance"),
      sectionKey: "performance",
      settingKey: "karaoke-text-effects",
      name: I18n.t("settingsAdvanced.performance.textEffects.label"),
      desc: I18n.t("settingsAdvanced.performance.textEffects.desc"),
      i18nKeys: ["tabs.performance", "settingsAdvanced.performance.rendering.title", "settingsAdvanced.performance.textEffects.label", "settingsAdvanced.performance.textEffects.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "colorful",
      name: I18n.t("settings.colorful.label"),
      desc: I18n.t("settings.colorful.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.colorful.label", "settings.colorful.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "gradient-background",
      name: I18n.t("settings.gradientBackground.label"),
      desc: I18n.t("settings.gradientBackground.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.gradientBackground.label", "settings.gradientBackground.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "solid-background",
      name: I18n.t("settings.solidBackground.label"),
      desc: I18n.t("settings.solidBackground.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.solidBackground.label", "settings.solidBackground.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "video-background",
      name: I18n.t("settings.videoBackground.label"),
      desc: I18n.t("settings.videoBackground.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.videoBackground.label", "settings.videoBackground.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "background-brightness",
      name: I18n.t("settings.backgroundBrightness.label"),
      desc: I18n.t("settings.backgroundBrightness.desc"),
      i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.backgroundBrightness.label", "settings.backgroundBrightness.desc"]
    },
    // 일반 탭 - 데스크탑 오버레이
    {
      section: I18n.t("tabs.general"),
      sectionKey: "general",
      settingKey: "overlay-enabled",
      name: I18n.t("overlay.enabled.label"),
      desc: I18n.t("overlay.enabled.desc"),
      i18nKeys: ["tabs.general", "overlay.enabled.label", "overlay.enabled.desc"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "sync-mode",
      name: I18n.t("settingsAdvanced.syncMode.title"),
      desc: I18n.t("settingsAdvanced.syncMode.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.syncMode.title", "settingsAdvanced.syncMode.subtitle", "sections.visualEffects"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "multi-vocal-colors",
      name: I18n.t("settingsAdvanced.multiVocalColors.title"),
      desc: I18n.t("settingsAdvanced.multiVocalColors.subtitle"),
      i18nKeys: [
        "tabs.appearance",
        "settingsAdvanced.multiVocalColors.title",
        "settingsAdvanced.multiVocalColors.subtitle",
        "settingsAdvanced.multiVocalColors.description",
        "settingsAdvanced.multiVocalColors.useCreatorColors.label",
        "settingsAdvanced.multiVocalColors.useCreatorColors.desc",
      ],
      keywords: ["multi vocal speaker color male female duet karaoke creator custom sync data"]
    },

    // 외관 탭
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "original-style",
      name: I18n.t("settingsAdvanced.originalStyle.title"),
      desc: I18n.t("settingsAdvanced.originalStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.originalStyle.title", "settingsAdvanced.originalStyle.subtitle"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "pronunciation-style",
      name: I18n.t("settingsAdvanced.pronunciationStyle.title"),
      desc: I18n.t("settingsAdvanced.pronunciationStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.pronunciationStyle.title", "settingsAdvanced.pronunciationStyle.subtitle"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "translation-style",
      name: I18n.t("settingsAdvanced.translationStyle.title"),
      desc: I18n.t("settingsAdvanced.translationStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.translationStyle.title", "settingsAdvanced.translationStyle.subtitle"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "furigana-style",
      name: I18n.t("settingsAdvanced.furiganaStyle.title"),
      desc: I18n.t("settingsAdvanced.furiganaStyle.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.furiganaStyle.title", "settingsAdvanced.furiganaStyle.subtitle"]
    },
    {
      section: I18n.t("tabs.appearance"),
      sectionKey: "appearance",
      settingKey: "text-shadow",
      name: I18n.t("settingsAdvanced.textShadow.title"),
      desc: I18n.t("settingsAdvanced.textShadow.subtitle"),
      i18nKeys: ["tabs.appearance", "settingsAdvanced.textShadow.title", "settingsAdvanced.textShadow.subtitle"]
    },

    // 동작 탭
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "auto-scroll",
      name: I18n.t("settings.autoScroll.label"),
      desc: I18n.t("settings.autoScroll.desc"),
      i18nKeys: ["tabs.behavior", "settings.autoScroll.label", "settings.autoScroll.desc"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "animation",
      name: I18n.t("settings.animation.label"),
      desc: I18n.t("settings.animation.desc"),
      i18nKeys: ["tabs.behavior", "settings.animation.label", "settings.animation.desc"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "karaoke",
      name: I18n.t("settings.karaoke.label"),
      desc: I18n.t("settings.karaoke.desc"),
      i18nKeys: ["tabs.behavior", "settings.karaoke.label", "settings.karaoke.desc"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "blur-inactive",
      name: I18n.t("settings.blurInactive.label"),
      desc: I18n.t("settings.blurInactive.desc"),
      i18nKeys: ["tabs.behavior", "settings.blurInactive.label", "settings.blurInactive.desc"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "synced-fallback",
      name: I18n.t("settings.syncedAsFallback.label"),
      desc: I18n.t("settings.syncedAsFallback.desc"),
      i18nKeys: ["tabs.behavior", "settings.syncedAsFallback.label", "settings.syncedAsFallback.desc"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "unsynced-fallback",
      name: I18n.t("settings.unsyncedAsFallback.label"),
      desc: I18n.t("settings.unsyncedAsFallback.desc"),
      i18nKeys: ["tabs.behavior", "settings.unsyncedAsFallback.label", "settings.unsyncedAsFallback.desc"]
    },

    // 고급 탭
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "playback",
      name: I18n.t("settingsAdvanced.playback.title"),
      desc: I18n.t("settingsAdvanced.playback.subtitle"),
      i18nKeys: ["tabs.behavior", "settingsAdvanced.playback.title", "settingsAdvanced.playback.subtitle"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "quick-sync-controls-enabled",
      name: I18n.t("settingsAdvanced.playback.quickSyncControls.label"),
      desc: I18n.t("settingsAdvanced.playback.quickSyncControls.info"),
      i18nKeys: [
        "tabs.behavior",
        "settingsAdvanced.playback.quickSyncControls.label",
        "settingsAdvanced.playback.quickSyncControls.info",
      ]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "sync-creator-settings",
      name: getSettingsText("settings.syncCreatorSettings.title", "Sync Creator Settings"),
      desc: getSettingsText("settings.syncCreatorSettings.subtitle", "Configure Sync Creator keyboard behavior and recording shortcuts."),
      i18nKeys: [
        "tabs.behavior",
        "settings.syncCreatorSettings.title",
        "settings.syncCreatorSettings.subtitle",
        "settings.syncCreatorSettings.autoBoundaryChars.label",
        "settings.syncCreatorSettings.autoBoundaryChars.desc",
        "settings.syncCreatorSettings.fillCurve.label",
        "settings.syncCreatorSettings.fillCurve.desc",
        "settings.syncCreatorSettings.fillCurve.reset"
      ],
      keywords: ["sync creator shortcuts hotkeys keybinds karaoke recording syllable word character drag slash punctuation space special characters fill curve graph correction easing quadratic"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "karaoke-mode",
      name: I18n.t("settingsAdvanced.karaokeMode.title"),
      desc: I18n.t("settingsAdvanced.karaokeMode.subtitle"),
      i18nKeys: ["tabs.behavior", "settingsAdvanced.karaokeMode.title", "settingsAdvanced.karaokeMode.subtitle"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "prefetch",
      name: I18n.t("settingsAdvanced.prefetch.title"),
      desc: I18n.t("settingsAdvanced.prefetch.subtitle"),
      i18nKeys: ["tabs.behavior", "settingsAdvanced.prefetch.title", "settingsAdvanced.prefetch.subtitle"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "cache-management",
      name: I18n.t("settingsAdvanced.cacheManagement.title"),
      desc: I18n.t("settingsAdvanced.cacheManagement.subtitle"),
      i18nKeys: ["tabs.behavior", "settingsAdvanced.cacheManagement.title", "settingsAdvanced.cacheManagement.subtitle"]
    },
    {
      section: I18n.t("tabs.behavior"),
      sectionKey: "lyrics",
      settingKey: "lyrics-helper",
      name: I18n.t("settings.lyricsHelper.sectionTitle") || "Helper Integration",
      desc:
        I18n.t("settings.lyricsHelper.sectionSubtitle") ||
        "Send lyrics to external helper applications",
      i18nKeys: ["tabs.behavior", "settings.lyricsHelper.sectionTitle", "settings.lyricsHelper.sectionSubtitle"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "language-detection",
      name: I18n.t("settingsAdvanced.languageDetection.title"),
      desc: I18n.t("settingsAdvanced.languageDetection.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.languageDetection.title", "settingsAdvanced.languageDetection.subtitle"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "cloud-sync",
      name: I18n.t("settingsAdvanced.cloudSync.title"),
      desc: I18n.t("settingsAdvanced.cloudSync.monthlyRequired"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.cloudSync.title", "settingsAdvanced.cloudSync.monthlyRequired"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "export-import",
      name: I18n.t("settingsAdvanced.exportImport.title"),
      desc: I18n.t("settingsAdvanced.exportImport.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.exportImport.title", "settingsAdvanced.exportImport.subtitle"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "settings-presets",
      name: I18n.t("settingsAdvanced.settingsPresets.title"),
      desc: I18n.t("settingsAdvanced.settingsPresets.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.settingsPresets.title", "settingsAdvanced.settingsPresets.subtitle"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "db-export-import",
      name: I18n.t("settingsAdvanced.dbExportImport.title"),
      desc: I18n.t("settingsAdvanced.dbExportImport.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.dbExportImport.title", "settingsAdvanced.dbExportImport.subtitle"]
    },
    {
      section: I18n.t("tabs.advanced"),
      sectionKey: "advanced",
      settingKey: "reset-settings",
      name: I18n.t("settingsAdvanced.resetSettings.title"),
      desc: I18n.t("settingsAdvanced.resetSettings.subtitle"),
      i18nKeys: ["tabs.advanced", "settingsAdvanced.resetSettings.title", "settingsAdvanced.resetSettings.subtitle"]
    },

    // 전체화면 탭
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-mode",
      name: I18n.t("settingsAdvanced.fullscreenMode.title"),
      desc: I18n.t("settingsAdvanced.fullscreenMode.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.fullscreenMode.title", "settingsAdvanced.fullscreenMode.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "vinyl-mode",
      name: I18n.t("vinyl.mode"),
      desc: I18n.t("vinyl.settings.subtitle"),
      i18nKeys: [
        "tabs.fullscreen",
        "vinyl.mode",
        "vinyl.settings.subtitle",
        "vinyl.presentation.settingsTitle",
        "vinyl.presentation.settingsDescription",
        "vinyl.presentation.vinylLabel",
        "vinyl.presentation.compactLabel",
        "vinyl.presentation.videoLabel",
        "vinyl.settings.backgroundBlurLabel",
        "vinyl.settings.backgroundBlurDesc"
      ]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "normal-mode",
      name: I18n.t("settingsAdvanced.normalMode.title"),
      desc: I18n.t("settingsAdvanced.normalMode.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.normalMode.title", "settingsAdvanced.normalMode.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "tv-mode",
      name: I18n.t("settingsAdvanced.tvMode.title"),
      desc: I18n.t("settingsAdvanced.tvMode.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.tvMode.title", "settingsAdvanced.tvMode.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "metadata-display",
      name: I18n.t("settingsAdvanced.metadataDisplay.title"),
      desc: I18n.t("settingsAdvanced.metadataDisplay.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.metadataDisplay.title", "settingsAdvanced.metadataDisplay.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-style",
      name: I18n.t("settingsAdvanced.fullscreenStyle.title"),
      desc: I18n.t("settingsAdvanced.fullscreenStyle.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.fullscreenStyle.title", "settingsAdvanced.fullscreenStyle.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "fullscreen-ui",
      name: I18n.t("settingsAdvanced.fullscreenUI.title"),
      desc: I18n.t("settingsAdvanced.fullscreenUI.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.fullscreenUI.title", "settingsAdvanced.fullscreenUI.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "controller-style",
      name: I18n.t("settingsAdvanced.controllerStyle.title"),
      desc: I18n.t("settingsAdvanced.controllerStyle.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.controllerStyle.title", "settingsAdvanced.controllerStyle.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "auto-hide",
      name: I18n.t("settingsAdvanced.autoHide.title"),
      desc: I18n.t("settingsAdvanced.autoHide.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.autoHide.title", "settingsAdvanced.autoHide.subtitle"]
    },
    {
      section: I18n.t("tabs.fullscreen"),
      sectionKey: "fullscreen",
      settingKey: "tmi-style",
      name: I18n.t("settingsAdvanced.tmiStyle.title"),
      desc: I18n.t("settingsAdvanced.tmiStyle.subtitle"),
      i18nKeys: ["tabs.fullscreen", "settingsAdvanced.tmiStyle.title", "settingsAdvanced.tmiStyle.subtitle"]
    },
    {
      section: I18n.t("tabs.nowplaying"),
      sectionKey: "nowplaying",
      settingKey: "panel-lyrics-general",
      name: I18n.t("settingsAdvanced.nowPlayingPanel.title"),
      desc: I18n.t("settingsAdvanced.nowPlayingPanel.subtitle"),
      i18nKeys: ["tabs.nowplaying", "settingsAdvanced.nowPlayingPanel.title", "settingsAdvanced.nowPlayingPanel.subtitle"]
    },
    {
      section: I18n.t("tabs.nowplaying"),
      sectionKey: "nowplaying",
      settingKey: "panel-background",
      name: I18n.t("settingsAdvanced.nowPlayingPanel.background.title"),
      desc: I18n.t("settingsAdvanced.nowPlayingPanel.background.subtitle"),
      i18nKeys: ["tabs.nowplaying", "settingsAdvanced.nowPlayingPanel.background.title", "settingsAdvanced.nowPlayingPanel.background.subtitle"]
    },
    {
      section: I18n.t("tabs.nowplaying"),
      sectionKey: "nowplaying",
      settingKey: "panel-border",
      name: I18n.t("settingsAdvanced.nowPlayingPanel.border.title"),
      desc: I18n.t("settingsAdvanced.nowPlayingPanel.border.subtitle"),
      i18nKeys: ["tabs.nowplaying", "settingsAdvanced.nowPlayingPanel.border.title", "settingsAdvanced.nowPlayingPanel.border.subtitle"]
    },
    {
      section: I18n.t("tabs.lyricsProviders") || "Lyrics Providers",
      sectionKey: "lyrics-providers",
      settingKey: "lyrics-providers",
      name: I18n.t("tabs.lyricsProviders") || "Lyrics Providers",
      desc: I18n.t("settings.lyricsProviders.description") || "Choose and order lyrics providers",
      i18nKeys: ["tabs.lyricsProviders", "settings.lyricsProviders.title", "settings.lyricsProviders.description"]
    },
    {
      section: I18n.t("tabs.lyricsProviders") || "Lyrics Providers",
      sectionKey: "lyrics-providers",
      settingKey: "prefer-sync-data-provider",
      name: I18n.t("settings.lyricsProviders.preferSyncDataProvider.label") || "Prioritize providers with sync data",
      desc: I18n.t("settings.lyricsProviders.preferSyncDataProvider.desc") || "Try the matching lyrics provider first when sync data is available",
      i18nKeys: [
        "tabs.lyricsProviders",
        "settings.lyricsProviders.preferSyncDataProvider.label",
        "settings.lyricsProviders.preferSyncDataProvider.desc"
      ]
    },
    {
      section: I18n.t("tabs.lyricsProviders") || "Lyrics Providers",
      sectionKey: "lyrics-providers",
      settingKey: "prefer-lyrics-type-over-provider-order",
      name: I18n.t("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.label") || "Prioritize lyrics type over provider order",
      desc: I18n.t("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.desc") || "Try karaoke across all providers before synced and plain lyrics",
      i18nKeys: [
        "tabs.lyricsProviders",
        "settings.lyricsProviders.preferLyricsTypeOverProviderOrder.label",
        "settings.lyricsProviders.preferLyricsTypeOverProviderOrder.desc"
      ]
    },
    {
      section: I18n.t("tabs.aiProviders"),
      sectionKey: "ai-providers",
      settingKey: "ai-providers",
      name: I18n.t("tabs.aiProviders"),
      desc: I18n.t("settings.aiProviders.description") || "Configure AI providers and capabilities",
      i18nKeys: [
        "tabs.aiProviders",
        "settings.aiProviders.title",
        "settings.aiProviders.description",
        "settings.aiProviders.translationStyle.title",
        "settings.aiProviders.translationStyle.description",
        "settings.aiProviders.translationStyle.natural.label",
        "settings.aiProviders.translationStyle.literal.label",
        "settings.aiProviders.translationStyle.adaptive.label",
        "settings.aiProviders.retryCount.label",
        "settings.aiProviders.retryCount.description"
      ]
    },
    {
      section: I18n.t("tabs.aiProviders"),
      sectionKey: "ai-providers",
      settingKey: "ai-provider-retry-count",
      name: I18n.t("settings.aiProviders.retryCount.label") || "Retries per provider",
      desc: I18n.t("settings.aiProviders.retryCount.description")
        || "Number of additional attempts after a failed request. Set to 0 to switch to the next provider immediately.",
      i18nKeys: [
        "tabs.aiProviders",
        "settings.aiProviders.retryCount.label",
        "settings.aiProviders.retryCount.description"
      ]
    },
    {
      section: I18n.t("tabs.about"),
      sectionKey: "about",
      settingKey: "about-account",
      name: I18n.t("settingsAdvanced.aboutTab.account.title"),
      desc: I18n.t("settingsAdvanced.aboutTab.account.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.account.title", "settingsAdvanced.aboutTab.account.subtitle"]
    },
    {
      section: I18n.t("tabs.about"),
      sectionKey: "about",
      settingKey: "about-app-info",
      name: I18n.t("settingsAdvanced.aboutTab.appInfo.title"),
      desc: I18n.t("settingsAdvanced.aboutTab.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.appInfo.title", "settingsAdvanced.aboutTab.subtitle"]
    },
    {
      section: I18n.t("tabs.about"),
      sectionKey: "about",
      settingKey: "about-client-info",
      name: I18n.t("settingsAdvanced.aboutTab.clientInfo.title"),
      desc: I18n.t("settingsAdvanced.aboutTab.clientInfo.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.clientInfo.title", "settingsAdvanced.aboutTab.clientInfo.subtitle"]
    },
    {
      section: I18n.t("tabs.about"),
      sectionKey: "about",
      settingKey: "about-update",
      name: I18n.t("settingsAdvanced.aboutTab.update.title"),
      desc: I18n.t("settingsAdvanced.aboutTab.update.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.update.title", "settingsAdvanced.aboutTab.update.subtitle"]
    },
    {
      section: I18n.t("tabs.about"),
      sectionKey: "about",
      settingKey: "about-patch-notes",
      name: I18n.t("settingsAdvanced.aboutTab.patchNotes.title"),
      desc: I18n.t("settingsAdvanced.aboutTab.patchNotes.subtitle"),
      i18nKeys: ["tabs.about", "settingsAdvanced.aboutTab.patchNotes.title", "settingsAdvanced.aboutTab.patchNotes.subtitle"]
    },
    {
      section: I18n.t("tabs.debug"),
      sectionKey: "debug",
      settingKey: "debug-overview",
      name: I18n.t("settingsAdvanced.debugTab.title"),
      desc: I18n.t("settingsAdvanced.debugTab.subtitle"),
      i18nKeys: ["tabs.debug", "settingsAdvanced.debugTab.title", "settingsAdvanced.debugTab.subtitle"]
    },
  ], []);

  const [discoveredSearchSettings, setDiscoveredSearchSettings] = react.useState([]);
  const discoveredSearchSignatureRef = react.useRef("");

  // 실제로 렌더된 설정 행을 색인한다. 수동 목록은 다국어 별칭과 보조 설명으로만
  // 사용하므로 설정이 추가되거나 키가 바뀌어도 검색 목적지가 어긋나지 않는다.
  react.useEffect(() => {
    const container = settingsContentRef.current;
    if (!container) return;

    const manualByDestination = new Map(
      searchableSettings.map((setting) => [
        `${setting.sectionKey}:${setting.settingKey}`,
        setting,
      ])
    );
    let frameId = null;
    let disposed = false;

    const readOwnedText = (node, selector) => {
      const isSettingRow = node.classList.contains("setting-row");
      const ownedElement = Array.from(node.querySelectorAll(selector)).find((candidate) => {
        if (isSettingRow) {
          return candidate.closest(".setting-row") === node;
        }
        if (candidate.closest(".setting-row")) return false;
        return candidate.closest("[data-setting-key]") === node;
      });
      return ownedElement?.textContent?.replace(/\s+/g, " ").trim() || "";
    };

    const readNodeTextWithoutNestedSettings = (node) => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll("[data-setting-key]").forEach((nestedNode) => {
        nestedNode.remove();
      });
      return clone.textContent?.replace(/\s+/g, " ").trim() || "";
    };

    const scanRenderedSettings = () => {
      frameId = null;
      if (disposed) return;

      const tabLabels = {
        general: I18n.t("tabs.general"),
        appearance: I18n.t("tabs.appearance"),
        performance: I18n.t("tabs.performance"),
        lyrics: I18n.t("tabs.behavior"),
        "lyrics-providers": I18n.t("tabs.lyricsProviders") || "Lyrics Providers",
        "ai-providers": I18n.t("tabs.aiProviders") || "AI Providers",
        fullscreen: I18n.t("tabs.fullscreen"),
        nowplaying: I18n.t("tabs.nowplaying"),
        advanced: I18n.t("tabs.advanced"),
        debug: I18n.t("tabs.debug"),
        about: I18n.t("tabs.about"),
      };
      const tabI18nKeys = {
        general: "tabs.general",
        appearance: "tabs.appearance",
        performance: "tabs.performance",
        lyrics: "tabs.behavior",
        "lyrics-providers": "tabs.lyricsProviders",
        "ai-providers": "tabs.aiProviders",
        fullscreen: "tabs.fullscreen",
        nowplaying: "tabs.nowplaying",
        advanced: "tabs.advanced",
        debug: "tabs.debug",
        about: "tabs.about",
      };
      const standaloneTabs = new Set(["lyrics-providers", "ai-providers"]);
      const settingsByResultKey = new Map();

      const mergeSearchSetting = (candidate) => {
        const existing = settingsByResultKey.get(candidate.resultKey);
        if (!existing) {
          settingsByResultKey.set(candidate.resultKey, candidate);
          return;
        }

        if (candidate.preferVisibleText && candidate.name) {
          existing.name = candidate.name;
        }
        if (candidate.preferVisibleText && candidate.desc) {
          existing.desc = candidate.desc;
        }
        existing.i18nKeys = [...new Set([
          ...(existing.i18nKeys || []),
          ...(candidate.i18nKeys || []),
        ])];
        existing.directKeywords = [...new Set([
          ...(existing.directKeywords || []),
          ...(candidate.directKeywords || []),
        ])];
        existing.contextKeywords = [...new Set([
          ...(existing.contextKeywords || []),
          ...(candidate.contextKeywords || []),
        ])];
      };

      // Keep the complete manually maintained index available while only the
      // active tab is mounted. Visible controls from the active tab enrich the
      // matching entries below without forcing every settings panel to exist.
      searchableSettings.forEach((setting) => {
        mergeSearchSetting({
          resultKey: `${setting.sectionKey}:${setting.settingKey || "__tab__"}`,
          section: setting.section,
          sectionKey: setting.sectionKey,
          settingKey: setting.settingKey || null,
          navItemId: setting.settingKey || setting.sectionKey,
          name: setting.name,
          desc: setting.desc || "",
          i18nKeys: setting.i18nKeys || [],
          directKeywords: [
            ...(setting.keywords || []),
            setting.name || "",
            setting.desc || "",
          ].filter(Boolean),
          contextKeywords: [setting.section || ""].filter(Boolean),
          preferVisibleText: false,
        });
      });

      container
        .querySelectorAll('.tab-content[data-tab-id]:not([data-tab-id="search"])')
        .forEach((tabNode) => {
          const tabId = tabNode.getAttribute("data-tab-id");
          if (!tabId) return;

          const tabLabel = tabLabels[tabId] || tabId;
          if (!standaloneTabs.has(tabId)) {
            mergeSearchSetting({
              resultKey: `${tabId}:__tab__`,
              section: tabLabel,
              sectionKey: tabId,
              settingKey: null,
              navItemId: tabId,
              name: tabLabel,
              desc: "",
              i18nKeys: tabI18nKeys[tabId] ? [tabI18nKeys[tabId]] : [],
              directKeywords: [tabLabel],
              contextKeywords: [],
              isTabResult: true,
            });
          }

          let currentSectionKey = "";
          let currentSectionLabel = "";
          let currentSectionDescription = "";
          let unanchoredRowIndex = 0;

          tabNode.querySelectorAll("[data-setting-key], .setting-row").forEach((node) => {
            const explicitSettingKey = node.getAttribute("data-setting-key") || "";
            const isSectionTitle = node.classList.contains("section-title");
            if (isSectionTitle) {
              currentSectionKey = explicitSettingKey || currentSectionKey;
              currentSectionLabel = readOwnedText(node, "h3") || currentSectionLabel;
              currentSectionDescription =
                readOwnedText(node, "p") || currentSectionDescription;
            }

            const ancestorSettingKey = explicitSettingKey
              ? ""
              : node.closest("[data-setting-key]")?.getAttribute("data-setting-key") || "";
            const settingKey =
              explicitSettingKey || ancestorSettingKey || currentSectionKey || null;
            const resultKey = explicitSettingKey
              ? `${tabId}:${explicitSettingKey}`
              : `${tabId}:${settingKey || "top"}:row-${unanchoredRowIndex++}`;

            const manualSetting = settingKey
              ? manualByDestination.get(`${tabId}:${settingKey}`)
              : null;
            const visibleName = readOwnedText(
              node,
              ".setting-name, .lyrics-provider-name, h3"
            );
            const visibleDescription = readOwnedText(
              node,
              ".setting-description, .lyrics-provider-summary, p"
            );
            const fallbackVisibleText = !visibleName && !visibleDescription
              ? readNodeTextWithoutNestedSettings(node)
              : "";
            const declaredSearchText = node.getAttribute("data-search-text") || "";
            if (
              !explicitSettingKey &&
              !visibleName &&
              !visibleDescription &&
              !fallbackVisibleText &&
              !declaredSearchText
            ) {
              return;
            }

            const name =
              visibleName ||
              manualSetting?.name ||
              fallbackVisibleText ||
              currentSectionLabel ||
              settingKey ||
              tabLabel;
            const description =
              visibleDescription ||
              manualSetting?.desc ||
              (isSectionTitle ? currentSectionDescription : currentSectionLabel) ||
              "";

            mergeSearchSetting({
              resultKey,
              section: tabLabel,
              sectionKey: tabId,
              settingKey,
              navItemId: standaloneTabs.has(tabId)
                ? tabId
                : currentSectionKey || tabId,
              name,
              desc: description,
              i18nKeys: manualSetting?.i18nKeys || [],
              directKeywords: [
                ...(manualSetting?.keywords || []),
                manualSetting?.name || "",
                manualSetting?.desc || "",
                declaredSearchText,
                fallbackVisibleText,
              ].filter(Boolean),
              contextKeywords: [
                tabLabel,
                currentSectionLabel,
                currentSectionDescription,
              ].filter(Boolean),
              preferVisibleText: !isSectionTitle,
            });
          });
        });

      const nextSettings = Array.from(settingsByResultKey.values()).map(
        (setting, order) => ({ ...setting, order })
      );

      const signature = JSON.stringify(
        nextSettings.map((setting) => [
          setting.resultKey,
          setting.sectionKey,
          setting.settingKey,
          setting.navItemId,
          setting.name,
          setting.desc,
          setting.directKeywords.join(" "),
          setting.contextKeywords.join(" "),
        ])
      );
      if (signature !== discoveredSearchSignatureRef.current) {
        discoveredSearchSignatureRef.current = signature;
        setDiscoveredSearchSettings(nextSettings);
      }
    };

    const scheduleScan = () => {
      if (frameId != null) return;
      frameId = requestAnimationFrame(scanRenderedSettings);
    };

    const observer = new MutationObserver(scheduleScan);
    container
      .querySelectorAll('.tab-content[data-tab-id]:not([data-tab-id="search"])')
      .forEach((tabNode) => {
        observer.observe(tabNode, {
          childList: true,
          subtree: true,
        });
      });
    scheduleScan();

    return () => {
      disposed = true;
      observer.disconnect();
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab, searchableSettings]);

  const normalizeSettingsSearchText = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const searchableSettingEntries = react.useMemo(() => {
    return discoveredSearchSettings.map((setting) => {
      const directTranslations = [];
      const contextTranslations = [];
      (setting.i18nKeys || []).forEach((key) => {
        const translations = I18n.getAllTranslations?.(key) || [];
        if (setting.isTabResult || !/^(tabs|sections)\./.test(key)) {
          directTranslations.push(...translations);
        } else {
          contextTranslations.push(...translations);
        }
      });
      const directKeywords = (setting.directKeywords || []).join(" ");
      const contextKeywords = (setting.contextKeywords || []).join(" ");
      const directSearchText = normalizeSettingsSearchText([
        setting.name,
        setting.desc,
        setting.settingKey,
        directTranslations.join(" "),
        directKeywords,
      ].join(" "));
      const contextSearchText = normalizeSettingsSearchText([
        setting.section,
        contextTranslations.join(" "),
        contextKeywords,
      ].join(" "));

      return {
        setting,
        directSearchText,
        contextSearchText,
        searchText: `${directSearchText} ${contextSearchText}`.trim(),
        normalizedName: normalizeSettingsSearchText(setting.name),
        normalizedDescription: normalizeSettingsSearchText(setting.desc),
      };
    });
  }, [discoveredSearchSettings]);

  // 공백과 입력 순서에 상관없이 모든 검색어가 포함된 실제 설정만 반환한다.
  const searchResults = react.useMemo(() => {
    const query = normalizeSettingsSearchText(searchQuery);
    if (!query) return [];

    const tokens = [...new Set(query.split(" ").filter(Boolean))];
    const rankEntry = (entry) => {
      if (entry.normalizedName === query) return 0;
      if (entry.normalizedName.startsWith(query)) return 1;
      if (tokens.every((token) => entry.normalizedName.includes(token))) return 2;
      if (tokens.every((token) => entry.normalizedDescription.includes(token))) return 3;
      if (tokens.every((token) => entry.directSearchText.includes(token))) return 4;
      return 5;
    };

    return searchableSettingEntries
      .filter(({ directSearchText, searchText }) => {
        const directMatch = tokens.every((token) => directSearchText.includes(token));
        if (directMatch) return true;

        return (
          tokens.length > 1 &&
          tokens.some((token) => directSearchText.includes(token)) &&
          tokens.every((token) => searchText.includes(token))
        );
      })
      .map((entry) => ({ entry, rank: rankEntry(entry) }))
      .sort((a, b) =>
        a.rank - b.rank || a.entry.setting.order - b.entry.setting.order
      )
      .map(({ entry }) => entry.setting);
  }, [searchQuery, searchableSettingEntries]);

  // 검색 결과 컴포넌트
  const renderSearchResults = () => {
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

    // 번역명이 같아도 섞이지 않도록 실제 탭 ID 기준으로 그룹화한다.
    const groupedResults = new Map();
    searchResults.forEach(result => {
      const groupKey = result.sectionKey || result.section;
      if (!groupedResults.has(groupKey)) {
        groupedResults.set(groupKey, {
          section: result.section,
          items: [],
        });
      }
      groupedResults.get(groupKey).items.push(result);
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
      Array.from(groupedResults.entries()).map(([groupKey, group]) =>
        react.createElement(
          "div",
          { key: groupKey, className: "search-result-group" },
          react.createElement(
            "div",
            { className: "section-title" },
            react.createElement(
              "div",
              { className: "section-title-content" },
              react.createElement(
                "div",
                { className: "section-text" },
                react.createElement("h3", null, group.section)
              )
            )
          ),
          react.createElement(
            "div",
            { className: "option-list-wrapper" },
            group.items.map((item) =>
              react.createElement(
                "div",
                {
                  key: item.resultKey,
                  className: "setting-row search-result-item",
                  role: "button",
                  tabIndex: 0,
                  onMouseDown: (e) => {
                    // blur 이벤트가 발생하기 전에 클릭을 처리하기 위해 preventDefault
                    e.preventDefault();
                  },
                  onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigateToDestination(
                      item.sectionKey,
                      item.settingKey,
                      item.navItemId || resolveNavItemId(item.sectionKey, item.settingKey),
                      true
                    );
                  },
                  onKeyDown: (e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    navigateToDestination(
                      item.sectionKey,
                      item.settingKey,
                      item.navItemId || resolveNavItemId(item.sectionKey, item.settingKey),
                      true
                    );
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

  // Pending scroll target when switching tabs
  const pendingTabScrollRef = react.useRef(initialSettingKey || null);
  const shouldResetContentScrollRef = react.useRef(false);

  react.useEffect(() => {
    if (!activeTab || activeTab === "search") return;

    let cancelled = false;
    let attempt = 0;
    let frameId = null;

    const tryScroll = () => {
      if (cancelled) return;
      attempt++;

      const targetKey = pendingTabScrollRef.current;
      if (targetKey) {
        const ok = scrollToSetting(targetKey, {
          behavior: attempt <= 1 ? "smooth" : "auto",
        });
        if (ok) {
          pendingTabScrollRef.current = null;
          return;
        }
        if (attempt < 12) {
          frameId = requestAnimationFrame(tryScroll);
          return;
        }
        pendingTabScrollRef.current = null;
        return;
      }

      if (shouldResetContentScrollRef.current) {
        const c = settingsContentRef.current;
        if (c) c.scrollTo({ top: 0, behavior: "auto" });
        shouldResetContentScrollRef.current = false;
      }
    };

    frameId = requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab, scrollToSetting]);

  react.useEffect(() => {
    return () => {
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      if (programmaticScrollEndCleanupRef.current) {
        programmaticScrollEndCleanupRef.current();
        programmaticScrollEndCleanupRef.current = null;
      }
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // 컴포넌트 마운트 시 저장된 폰트 설정 로드 및 Google Font 링크 추가
  react.useEffect(() => {
    const loadFont = (fontFamily, linkIdPrefix) => {
      if (!fontFamily) return;

      // Split by comma and trim whitespace to handle multiple fonts
      const fonts = fontFamily.split(",").map((f) => f.trim().replace(/['"]/g, ""));

      fonts.forEach((font) => {
        window.__ivLyricsDebugLog?.(
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
            window.__ivLyricsDebugLog?.(
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
            window.__ivLyricsDebugLog?.(`[ivLyrics] Font link href set to: ${link.href}`);
          }
        } else {
          window.__ivLyricsDebugLog?.(
            `[ivLyrics] Font ${font} not in GOOGLE_FONTS list or invalid`
          );
        }
      });
    };

    // 기본 폰트 로드 (separate-fonts가 false일 때 사용)
    const baseFont = CONFIG.visual["font-family"];
    window.__ivLyricsDebugLog?.(`[ivLyrics] Base font from CONFIG: ${baseFont}`);
    loadFont(baseFont, "ivLyrics-google-font-base");

    // 원문 폰트 로드
    const originalFont = CONFIG.visual["original-font-family"];
    window.__ivLyricsDebugLog?.(`[ivLyrics] Original font from CONFIG: ${originalFont}`);
    loadFont(originalFont, "ivLyrics-google-font-original");

    // 발음 폰트 로드
    const phoneticFont = CONFIG.visual["phonetic-font-family"];
    window.__ivLyricsDebugLog?.(`[ivLyrics] Phonetic font from CONFIG: ${phoneticFont}`);
    loadFont(phoneticFont, "ivLyrics-google-font-phonetic");

    // 번역 폰트 로드
    const translationFont = CONFIG.visual["translation-font-family"];
    window.__ivLyricsDebugLog?.(
      `[ivLyrics] Translation font from CONFIG: ${translationFont}`
    );
    loadFont(translationFont, "ivLyrics-google-font-translation");

    const instrumentalBreakLabelFont = CONFIG.visual["instrumental-break-label-font-family"];
    loadFont(instrumentalBreakLabelFont, "ivLyrics-google-font-instrumental-label");
  }, []);

  // 외관 탭으로 전환될 때 미리보기 폰트 강제 업데이트
  react.useEffect(() => {
    if (activeTab === "appearance") {
      window.__ivLyricsDebugLog?.(
        `[ivLyrics] Appearance tab activated, updating lyrics preview`
      );
      const frameId = requestAnimationFrame(syncSettingsLyricsPreviewStyles);
      return () => cancelAnimationFrame(frameId);
    }
	  }, [activeTab, uiTheme]);

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
          const version = escapeSettingsReleaseHtml(data.tag_name || "Unknown");
          const publishedDate = escapeSettingsReleaseHtml(data.published_at
            ? new Date(data.published_at).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
            : "Unknown");

          // Render release notes through the local sanitizer before assigning innerHTML.
          const releaseUrl = sanitizeSettingsReleaseUrl(data.html_url);
          const body = renderSettingsReleaseMarkdown(
            data.body || I18n.t("settingsAdvanced.patchNotes.empty")
          );
          const viewOnGithubLabel = escapeSettingsReleaseHtml(
            I18n.t("settingsAdvanced.aboutTab.viewOnGithub")
          );
          const releaseLinkStyle = `
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  background: rgba(255,255,255,0.05);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 8px;
                  color: rgba(248, 250, 252, 0.92);
                  text-decoration: none;
                  font-size: 13px;
                  font-weight: 600;
                  transition: all 0.2s;
                `;
          const releaseLink = releaseUrl
            ? `<a href="${escapeSettingsReleaseAttribute(releaseUrl)}" target="_blank" rel="noopener noreferrer" style="${releaseLinkStyle}" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                  ${viewOnGithubLabel}
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/>
                    <path d="M10.75 1a.75.75 0 000 1.5h1.69L8.22 6.72a.75.75 0 001.06 1.06l4.22-4.22v1.69a.75.75 0 001.5 0V1h-4.25z"/>
                  </svg>
                </a>`
            : `<span style="${releaseLinkStyle}; opacity: 0.55; cursor: default;">
                  ${viewOnGithubLabel}
                </span>`;
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
                ${releaseLink}
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
          const patchNotesLoadFailed = escapeSettingsReleaseHtml(
            I18n.t("settingsAdvanced.aboutTab.patchNotesLoadFailed")
          );
          const checkGithubReleases = escapeSettingsReleaseHtml(
            I18n.t("settingsAdvanced.aboutTab.checkGithubReleases")
          );

          container.innerHTML = `
            <div style="text-align: center; color: rgba(255,255,255,0.5);">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-bottom: 12px; opacity: 0.3;">
                <circle cx="12" cy="12" r="10" stroke-width="2"/>
                <line x1="12" y1="8" x2="12" y2="12" stroke-width="2" stroke-linecap="round"/>
                <line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <p style="margin: 0; font-size: 14px;">${patchNotesLoadFailed}</p>
              <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.7;">${checkGithubReleases}</p>
            </div>
          `;
        }
      };

      // 짧은 지연 후 로드 (DOM이 준비되도록)
      setTimeout(loadPatchNotes, 100);
    }
	  }, [activeTab, uiTheme]);

  const renderHeaderSection = () => {
    const themeOptions = [
      {
        id: "light",
        label: getSettingsText("settingsUi.theme.lightShort", "Light"),
        title: getSettingsText("settingsUi.theme.light", "Switch to light mode"),
        icon: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2.5v2M12 19.5v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2.5 12h2M19.5 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path>',
      },
      {
        id: "dark",
        label: getSettingsText("settingsUi.theme.darkShort", "Dark"),
        title: getSettingsText("settingsUi.theme.dark", "Switch to dark mode"),
        icon: '<path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3z"></path>',
      },
      {
        id: "auto",
        label: getSettingsText("settingsUi.theme.autoShort", "Auto"),
        title: getSettingsText("settingsUi.theme.auto", "Use system theme"),
        icon: '<rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path>',
      },
    ];

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
            "div",
            {
              className: "settings-theme-control",
              role: "group",
              "aria-label": getSettingsText("settingsUi.theme.selector", "Settings theme"),
            },
            themeOptions.map((themeOption) =>
              react.createElement(
                "button",
                {
                  key: themeOption.id,
                  className: `settings-theme-option${uiThemePreference === themeOption.id ? " active" : ""}`,
                  type: "button",
                  title: themeOption.title,
                  "aria-label": themeOption.label,
                  "aria-pressed": uiThemePreference === themeOption.id,
                  onClick: () => setUiThemePreference(themeOption.id),
                },
                react.createElement("svg", {
                  width: 14,
                  height: 14,
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: 1.8,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  "aria-hidden": "true",
                  dangerouslySetInnerHTML: { __html: themeOption.icon },
                }),
                react.createElement("span", null, themeOption.label)
              )
            )
          ),
          react.createElement(
            "button",
            {
              className: "settings-github-btn",
              type: "button",
              onClick: () =>
                window.open(
                  "https://github.com/ivLis-Studio/ivLyrics",
                  "_blank"
                ),
              title: I18n.t("settingsAdvanced.aboutTab.visitGithub"),
              "aria-label": I18n.t("settingsAdvanced.aboutTab.visitGithub"),
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
              type: "button",
              onClick: () =>
                window.open(
                  "https://ivlis.kr/ivLyrics/discord.php",
                  "_blank"
                ),
              title: I18n.t("settingsAdvanced.aboutTab.joinDiscord"),
              "aria-label": I18n.t("settingsAdvanced.aboutTab.joinDiscord"),
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
              type: "button",
              onClick: () =>
                window.open(
                  "https://buymeacoffee.com/ivlis",
                  "_blank"
                ),
              title: I18n.t("settingsAdvanced.donate.title"),
              "aria-label": I18n.t("settingsAdvanced.donate.title"),
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
          ),
          react.createElement(
            "button",
            {
              className: "settings-close-btn",
              type: "button",
              onClick: onRequestClose,
              title: getSettingsText("settingsUi.close", "Close settings"),
              "aria-label": getSettingsText("settingsUi.close", "Close settings"),
            },
            react.createElement("span", null, "×")
          )
        )
      )
    );
  };

  const tabMeta = {
    general: {
      label: I18n.t("tabs.general"),
      badge: getSettingsText("settingsUi.nav.badges.workspace", "Workspace"),
      description: getSettingsText(
        "settingsUi.nav.generalDesc",
        "Language, translation target, and desktop overlay behavior"
      ),
    },
    appearance: {
      label: I18n.t("tabs.appearance"),
      badge: getSettingsText("settingsUi.nav.badges.typography", "Typography"),
      description: getSettingsText(
        "settingsUi.nav.appearanceDesc",
        "Background, sync presentation, motion, and text styles"
      ),
    },
    performance: {
      label: I18n.t("tabs.performance"),
      badge: getSettingsText("settingsUi.nav.badges.performance", "FPS"),
      description: getSettingsText(
        "settingsUi.nav.performanceDesc",
        "Frame rate, motion, and visual cost controls"
      ),
    },
    lyrics: {
      label: I18n.t("tabs.behavior"),
      badge: getSettingsText("settingsUi.nav.badges.behavior", "Playback"),
      description: getSettingsText(
        "settingsUi.nav.lyricsDesc",
        "Playback buttons, karaoke behavior, prefetch, sync sharing, and helper integrations"
      ),
    },
    fullscreen: {
      label: I18n.t("tabs.fullscreen"),
      badge: getSettingsText("settingsUi.nav.badges.surface", "Surface"),
      description: getSettingsText(
        "settingsUi.nav.fullscreenDesc",
        "Fullscreen layout, metadata display, controller UI, and TV mode presentation"
      ),
    },
    nowplaying: {
      label: I18n.t("tabs.nowplaying"),
      badge: getSettingsText("settingsUi.nav.badges.surface", "Surface"),
      description: getSettingsText(
        "settingsUi.nav.nowplayingDesc",
        "Panel lyrics typography, background, border, and preview behavior"
      ),
    },
    "lyrics-providers": {
      label: I18n.t("tabs.lyricsProviders") || "Lyrics Providers",
      badge: getSettingsText("settingsUi.nav.badges.providers", "Providers"),
      description: getSettingsText(
        "settingsUi.nav.lyricsProvidersDesc",
        "Choose, order, and scope each lyrics source"
      ),
    },
    "ai-providers": {
      label: I18n.t("tabs.aiProviders"),
      badge: getSettingsText("settingsUi.nav.badges.providers", "Providers"),
      description: getSettingsText(
        "settingsUi.nav.aiProvidersDesc",
        "Configure AI translation providers, models, and keys"
      ),
    },
    advanced: {
      label: I18n.t("tabs.advanced"),
      badge: getSettingsText("settingsUi.nav.badges.system", "System"),
      description: getSettingsText(
        "settingsUi.nav.advancedDesc",
        "Language detection, import/export, database tools, and reset operations"
      ),
    },
    debug: {
      label: I18n.t("tabs.debug"),
      badge: getSettingsText("settingsUi.nav.badges.system", "System"),
      description: getSettingsText(
        "settingsUi.nav.debugDesc",
        "Inspect track, lyrics, and runtime state for troubleshooting"
      ),
    },
    about: {
      label: I18n.t("tabs.about"),
      badge: getSettingsText("settingsUi.nav.badges.system", "System"),
      description: getSettingsText(
        "settingsUi.nav.aboutDesc",
        "Account, update status, client info, and release notes"
      ),
    },
  };

  const activeTabMeta = tabMeta[activeTab] || tabMeta.general;

  const sidebarTabs = [
    {
      id: "general",
      icon: "general",
      group: "general",
      label: I18n.t("tabs.general"),
      badge: tabMeta.general.badge,
      description: tabMeta.general.description,
    },
    {
      id: "lyrics-providers",
      icon: "lyrics-providers",
      group: "sources",
      label: I18n.t("tabs.lyricsProviders"),
      badge: tabMeta["lyrics-providers"].badge,
      description: tabMeta["lyrics-providers"].description,
      standalone: true,
    },
    {
      id: "ai-providers",
      icon: "ai-providers",
      group: "sources",
      label: I18n.t("tabs.aiProviders"),
      badge: tabMeta["ai-providers"].badge,
      description: tabMeta["ai-providers"].description,
      standalone: true,
    },
    {
      id: "appearance",
      icon: "appearance",
      group: "general",
      label: I18n.t("tabs.appearance"),
      badge: tabMeta.appearance.badge,
      description: tabMeta.appearance.description,
    },
    {
      id: "performance",
      icon: "performance",
      group: "general",
      label: I18n.t("tabs.performance"),
      badge: tabMeta.performance.badge,
      description: tabMeta.performance.description,
    },
    {
      id: "lyrics",
      icon: "lyrics",
      group: "screen",
      label: I18n.t("tabs.behavior"),
      badge: tabMeta.lyrics.badge,
      description: tabMeta.lyrics.description,
    },
    {
      id: "fullscreen",
      icon: "fullscreen",
      group: "screen",
      label: I18n.t("tabs.fullscreen"),
      badge: tabMeta.fullscreen.badge,
      description: tabMeta.fullscreen.description,
    },
    {
      id: "nowplaying",
      icon: "nowplaying",
      group: "screen",
      label: I18n.t("tabs.nowplaying"),
      badge: tabMeta.nowplaying.badge,
      description: tabMeta.nowplaying.description,
    },
    {
      id: "advanced",
      icon: "advanced",
      group: "system",
      label: I18n.t("tabs.advanced"),
      badge: tabMeta.advanced.badge,
      description: tabMeta.advanced.description,
    },
    {
      id: "debug",
      icon: "debug",
      group: "system",
      label: I18n.t("tabs.debug"),
      badge: tabMeta.debug.badge,
      description: tabMeta.debug.description,
    },
    {
      id: "about",
      icon: "about",
      group: "system",
      label: I18n.t("tabs.about"),
      badge: tabMeta.about.badge,
      description: tabMeta.about.description,
    },
  ];
  const sidebarGroups = [
    {
      id: "general",
      label: I18n.t("tabs.general") || "General",
    },
    {
      id: "sources",
      label: getSettingsText("settingsUi.nav.badges.providers", "Sources"),
    },
    {
      id: "screen",
      label: getSettingsText("settingsUi.nav.badges.surface", "Screen"),
    },
    {
      id: "system",
      label: getSettingsText("settingsUi.nav.badges.system", "System"),
    },
  ];
  const [sidebarSectionsByTab, setSidebarSectionsByTab] = react.useState({});
  const [expandedGroupIds, setExpandedGroupIds] = react.useState(() => {
    const initialGroup = sidebarTabs.find(
      (tab) => tab.id === (initialTab || "general") && !tab.standalone
    );
    return initialGroup ? [initialGroup.id] : [];
  });
  const resolveNavItemId = (tabId, settingKey) => settingKey || tabId;
  const [activeNavItemId, setActiveNavItemId] = react.useState(() =>
    resolveNavItemId(initialTab || "general", initialSettingKey || (initialTab || "general"))
  );
  const activeNavItemIdRef = react.useRef(activeNavItemId);

  react.useEffect(() => {
    activeNavItemIdRef.current = activeNavItemId;
  }, [activeNavItemId]);

  /* ==========================================================
   *  Sidebar ↔ Content Synchronisation  (complete rewrite)
   * ========================================================== */

  // ---- 1. Section discovery (build sidebarSectionsByTab) ----
  react.useEffect(() => {
    const container = settingsContentRef.current;
    if (!container) return;

    // Wait one frame so the DOM for the new activeTab is rendered
    const frameId = requestAnimationFrame(() => {
      const tabNodes = Array.from(
        container.querySelectorAll(".tab-content[data-tab-id]")
      );
      if (tabNodes.length === 0) return;

      const next = {};
      tabNodes.forEach((tabNode) => {
        const tabId = tabNode.getAttribute("data-tab-id");
        if (!tabId || tabId === "search") return;

        const seen = new Set();
        next[tabId] = Array.from(
          tabNode.querySelectorAll(".section-title[data-setting-key]")
        )
          .map((el) => {
            const key = el.getAttribute("data-setting-key");
            if (!key || seen.has(key)) return null;
            const h3 = el.querySelector("h3");
            const p = el.querySelector("p");
            const label = h3?.textContent?.trim();
            if (!label) return null;
            seen.add(key);
            return {
              id: key,
              settingKey: key,
              label,
              description: p?.textContent?.trim() || "",
              tabId,
              parentSettingKey:
                el.getAttribute("data-parent-setting-key") || null,
            };
          })
          .filter(Boolean);
      });

      setSidebarSectionsByTab((previous) => ({ ...previous, ...next }));
    });

    return () => cancelAnimationFrame(frameId);
  }, [activeTab]);

  // Derived helpers (remain the same)
  const activeSidebarTab =
    sidebarTabs.find((tab) => tab.id === activeTab) ||
    sidebarTabs.find((tab) => tab.id === "general") ||
    sidebarTabs[0];
  const activeSectionItems =
    activeTab === "search" ? [] : sidebarSectionsByTab[activeTab] || [];

  const activeNavItem =
    activeTab === "search"
      ? {
          label: I18n.t("search.placeholder"),
          description: I18n.t("search.noResultsDesc"),
          badge: I18n.t("search.resultCount")
            .replace("{count}", searchResults.length || 0),
        }
      : activeSectionItems.find((item) => item.settingKey === activeNavItemId) ||
        activeSidebarTab || {
          label: activeTabMeta?.label,
          description: activeTabMeta?.description,
          badge: activeTabMeta?.badge,
        };

  const activeNavigationGroup =
    activeTab === "search"
      ? activeNavItem
      : activeSidebarTab || {
          label: activeTabMeta?.label,
          description: activeTabMeta?.description,
          badge: activeTabMeta?.badge,
        };

  // ---- 2. navigateToDestination (click handler) ----
  const navigateToDestination = react.useCallback(
    (tabId, settingKey, navItemId, clearSearch = false) => {
      // preserve sidebar scroll position
      if (settingsSidebarRef.current) {
        pendingSidebarScrollRef.current = settingsSidebarRef.current.scrollTop;
        shouldRestoreSidebarScrollRef.current = true;
      }

      if (navItemId) {
        setActiveNavItemId(navItemId);
      }
      if (clearSearch || (activeTab === "search" && tabId !== "search")) {
        setSearchQuery("");
      }

      // Different tab → switch tab and schedule scroll
      if (tabId !== activeTab) {
        if (settingKey) {
          holdProgrammaticScroll();
          pendingTabScrollRef.current = settingKey;
          shouldResetContentScrollRef.current = false;
        } else {
          pendingTabScrollRef.current = null;
          shouldResetContentScrollRef.current = true;
        }
        setActiveTab(tabId);
        return;
      }

      // Same tab → scroll directly
      if (settingKey) {
        holdProgrammaticScroll();
        requestAnimationFrame(() => {
          scrollToSetting(settingKey);
        });
      } else if (settingsContentRef.current) {
        holdProgrammaticScroll();
        settingsContentRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [activeTab, holdProgrammaticScroll, scrollToSetting]
  );

  // ---- 3. Keep activeNavItemId valid for the current tab ----
  react.useEffect(() => {
    if (activeTab === "search") return;

    const items = sidebarSectionsByTab[activeTab] || [];
    if (items.length === 0) {
      if (activeNavItemId !== activeTab) setActiveNavItemId(activeTab);
      return;
    }

    const valid = items.some((i) => i.settingKey === activeNavItemId);
    if (!valid) {
      setActiveNavItemId(items[0].settingKey);
    }
  }, [activeNavItemId, activeTab, sidebarSectionsByTab]);

  // ---- 4. Auto-expand the sidebar group for the active tab ----
  react.useEffect(() => {
    const currentTab = sidebarTabs.find((tab) => tab.id === activeTab);
    if (activeTab === "search" || !currentTab?.id) {
      return;
    }
    if (currentTab.standalone) {
      setExpandedGroupIds([]);
      return;
    }
    setExpandedGroupIds([currentTab.id]);
  }, [activeTab]);

  // ---- 5. Scroll-spy: update sidebar highlight on user scroll ----
  react.useEffect(() => {
    if (activeTab === "search") return;

    let frameId = null;
    const container = settingsContentRef.current;

    const updateActiveSection = () => {
      const currentContainer = settingsContentRef.current;
      if (!currentContainer || isProgrammaticScrollRef.current) return;

      const nodes = Array.from(
        currentContainer.querySelectorAll(
          ".tab-content.active .section-title[data-setting-key]"
        )
      );
      if (nodes.length === 0) return;

      const containerTop = currentContainer.getBoundingClientRect().top;
      const defaultAnchorLine =
        containerTop + Math.min(120, Math.max(72, currentContainer.clientHeight * 0.2));
      const stickyPreview = currentContainer.querySelector(
        ".tab-content.active .settings-live-preview-sticky"
      );
      const stickyPreviewRect = stickyPreview?.getBoundingClientRect();
      const stickyPreviewIsPinned = stickyPreviewRect
        && stickyPreviewRect.top <= containerTop + 1
        && stickyPreviewRect.bottom > containerTop;
      const anchorLine = stickyPreviewIsPinned
        ? Math.max(defaultAnchorLine, stickyPreviewRect.bottom + 12)
        : defaultAnchorLine;

      let bestNode = nodes[0];
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= anchorLine) {
          bestNode = node;
        } else {
          break;
        }
      }

      const key = bestNode?.getAttribute("data-setting-key");
      if (key && key !== activeNavItemIdRef.current) {
        setActiveNavItemId(key);
      }
    };

    const scheduleUpdate = () => {
      if (isProgrammaticScrollRef.current) {
        // `scrollend` (with the safety timer in scrollToSetting) owns the
        // unlock. Intermediate section positions must never update selection.
        return;
      }
      if (frameId != null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        updateActiveSection();
      });
    };

    container?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      container?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frameId != null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [activeTab, holdProgrammaticScroll, searchQuery, sidebarSectionsByTab]);

  // ---- 6. Restore sidebar scroll position after tab / group changes ----
  react.useLayoutEffect(() => {
    if (
      !shouldRestoreSidebarScrollRef.current ||
      pendingSidebarScrollRef.current == null ||
      !settingsSidebarRef.current
    ) {
      return;
    }
    settingsSidebarRef.current.scrollTop = pendingSidebarScrollRef.current;
    pendingSidebarScrollRef.current = null;
    shouldRestoreSidebarScrollRef.current = false;
  }, [activeTab, expandedGroupIds]);

  // Keep the selected branch visible when a compact settings window turns the
  // sidebar into a short, independently scrolling region.
  react.useEffect(() => {
    let frameId = null;
    const revealActiveNavigationItem = () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        const sidebar = settingsSidebarRef.current;
        const activeControl =
          sidebar?.querySelector(".settings-nav-subitem.active") ||
          sidebar?.querySelector(".settings-nav-card.active") ||
          sidebar?.querySelector(".settings-nav-group-toggle.active");
        if (!sidebar || !activeControl) return;

        const sidebarRect = sidebar.getBoundingClientRect();
        const activeRect = activeControl.getBoundingClientRect();
        const inset = 8;
        let scrollDelta = 0;
        if (activeRect.top < sidebarRect.top + inset) {
          scrollDelta = activeRect.top - sidebarRect.top - inset;
        } else if (activeRect.bottom > sidebarRect.bottom - inset) {
          scrollDelta = activeRect.bottom - sidebarRect.bottom + inset;
        }
        if (Math.abs(scrollDelta) > 0.5) {
          sidebar.scrollTo({
            top: Math.max(0, sidebar.scrollTop + scrollDelta),
            behavior: "auto",
          });
        }
      });
    };

    revealActiveNavigationItem();
    window.addEventListener("resize", revealActiveNavigationItem);
    return () => {
      window.removeEventListener("resize", revealActiveNavigationItem);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeNavItemId, activeTab, expandedGroupIds]);

  // This component owns stateful helper controls. Keep its type stable across
  // ConfigModal renders so their mount effects cannot trigger a remount loop.
  const BackgroundExperienceSection = react.useMemo(() => function BackgroundExperienceSectionContent() {
    const [selectedMode, setSelectedMode] = react.useState(
      getCurrentSettingsBackgroundMode()
    );

    const dispatchVisualUpdate = (name, value) => {
      lyricContainerUpdate?.();
      window.dispatchEvent(
        new CustomEvent("ivLyrics", {
          detail: { type: "config", name, value },
        })
      );
    };

    const applyMode = (modeId) => {
      setSelectedMode(modeId);
      const optionKeys = SETTINGS_BACKGROUND_PRESETS
        .map((preset) => preset.id)
        .filter((id) => id !== "none");

      optionKeys.forEach((optionId) => {
        const isEnabled = optionId === modeId;
        CONFIG.visual[optionId] = isEnabled;
        StorageManager.saveConfig(optionId, isEnabled);
      });

      dispatchVisualUpdate("background-mode", modeId);
    };

    const handleVisualChange = (name, value) => {
      CONFIG.visual[name] = value;
      StorageManager.saveConfig(name, value);
      if (name === "alignment") syncSettingsLyricsPreviewStyles();
      dispatchVisualUpdate(name, value);
    };

    react.useEffect(() => {
      const handleConfigChange = (event) => {
        if (event.detail?.type !== "config") return;
        const changedName = event.detail?.name;
        const isBackgroundModeChange =
          changedName === "background-mode" ||
          SETTINGS_BACKGROUND_PRESETS.some((preset) => preset.id === changedName);
        if (isBackgroundModeChange) {
          setSelectedMode(getCurrentSettingsBackgroundMode());
        }
      };

      window.addEventListener("ivLyrics", handleConfigChange);
      return () => window.removeEventListener("ivLyrics", handleConfigChange);
    }, []);

    const modeSpecificItems = [];

    if (
      selectedMode === "gradient-background" ||
      selectedMode === "blur-gradient-background"
    ) {
      modeSpecificItems.push({
        desc: I18n.t("settings.albumBgBlur.label"),
        info: I18n.t("settings.albumBgBlur.desc"),
        key: "album-bg-blur",
        type: ConfigSliderRange,
        min: 0,
        max: 100,
        step: 5,
        unit: "px",
      });
    }

    if (selectedMode === "solid-background") {
      modeSpecificItems.push(
        {
          desc: I18n.t("settings.solidBackgroundColor.label"),
          key: "solid-background-color",
          info: I18n.t("settings.solidBackgroundColor.desc"),
          type: ColorPresetSelector,
        },
        {
          desc: "",
          key: "solid-background-warning",
          type: ConfigWarning,
          message: I18n.t("settings.solidBackgroundWarning"),
        }
      );
    }

    if (selectedMode === "video-background") {
      modeSpecificItems.push(
        {
          desc: I18n.t("settings.videoHelper.label"),
          info: I18n.t("settings.videoHelper.desc"),
          key: "video-helper-enabled",
          type: VideoHelperToggle,
          disabled: isFadActive,
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
          when: () => !CONFIG.visual["video-helper-enabled"],
        },
        {
          desc: I18n.t("settings.videoBlur.label"),
          info: I18n.t("settings.videoBlur.desc"),
          key: "video-blur",
          type: ConfigSliderRange,
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
        },
        {
          desc: I18n.t("settings.videoScale.label"),
          info: I18n.t("settings.videoScale.desc"),
          key: "video-scale",
          type: ConfigSliderRange,
          min: 50,
          max: 200,
          step: 1,
          unit: "%",
        }
      );
    }

    if (selectedMode !== "solid-background" && selectedMode !== "none") {
      modeSpecificItems.push({
        desc: I18n.t("settings.backgroundBrightness.label"),
        key: "background-brightness",
        info: I18n.t("settings.backgroundBrightness.desc"),
        type: ConfigSliderRange,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
      });
    }

    return react.createElement(
      react.Fragment,
      null,
      react.createElement(
        "div",
        { className: "settings-card-grid background-mode-grid" },
        SETTINGS_BACKGROUND_PRESETS.map((preset) =>
          react.createElement(
            "button",
            {
              key: preset.id,
              className: `settings-choice-card ${
                selectedMode === preset.id ? "active" : ""
              }`,
              onClick: () => applyMode(preset.id),
              type: "button",
            },
            react.createElement(
              "div",
              { className: "settings-choice-icon" },
              react.createElement("svg", {
                width: 20,
                height: 20,
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                dangerouslySetInnerHTML: { __html: preset.icon },
              })
            ),
            react.createElement(
              "div",
              { className: "settings-choice-content" },
              react.createElement(
                "strong",
                null,
                getSettingsText(preset.labelKey, preset.fallbackLabel)
              ),
              react.createElement(
                "span",
                null,
                getSettingsText(preset.descriptionKey, preset.fallbackDescription)
              )
            )
          )
        )
      ),
      react.createElement(
        "div",
        { className: "settings-subsection-label" },
        getSettingsText("settingsUi.background.layout", "Layout & Motion")
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
        ],
        onChange: handleVisualChange,
      }),
      modeSpecificItems.length > 0 &&
        react.createElement(
          react.Fragment,
          null,
          react.createElement(
            "div",
            { className: "settings-subsection-label" },
            getSettingsText("settingsUi.background.finetune", "Background Details")
          ),
          react.createElement(OptionList, {
            items: modeSpecificItems,
            onChange: handleVisualChange,
          })
        )
    );
  }, [isFadActive]);

  const performanceBackgroundKeys = new Set(
    SETTINGS_BACKGROUND_PRESETS.map((preset) => preset.id).filter((id) => id !== "none")
  );

  const handlePerformanceSettingChange = (name, value) => {
    if (performanceBackgroundKeys.has(name)) {
      if (value) {
        SETTINGS_BACKGROUND_PRESETS.forEach((preset) => {
          if (preset.id === "none") return;
          const isEnabled = preset.id === name;
          CONFIG.visual[preset.id] = isEnabled;
          StorageManager.saveConfig(preset.id, isEnabled);
        });
        lyricContainerUpdate?.();
        window.dispatchEvent(
          new CustomEvent("ivLyrics", {
            detail: { type: "config", name: "background-mode", value: name },
          })
        );
        return;
      }
    }

    CONFIG.visual[name] = value;
    StorageManager.saveConfig(name, value);
    if (name === "reduce-motion") {
      applySettingsMotionClasses();
    }
    lyricContainerUpdate?.();
    window.dispatchEvent(
      new CustomEvent("ivLyrics", {
        detail: { type: "config", name, value },
      })
    );
  };

  const toggleNavigationGroup = react.useCallback((groupId) => {
    setExpandedGroupIds((prevGroupIds) =>
      prevGroupIds.includes(groupId)
        ? prevGroupIds.filter((id) => id !== groupId)
        : [...prevGroupIds, groupId]
    );
  }, []);

  const renderSidebarNavigation = () => {
    const renderSectionNodes = (nodes) =>
      nodes.map((item) => {
        const isItemActive =
          activeTab === item.tabId && activeNavItemId === item.settingKey;
        const hasChildren = item.children.length > 0;
        const containsActiveItem = settingsNavigationNodeContains(
          item,
          activeNavItemId
        );

        return react.createElement(
          "div",
          {
            key: `${item.tabId}:${item.settingKey}`,
            className: `settings-nav-tree-node${
              containsActiveItem ? " has-active-path" : ""
            }`,
            role: "treeitem",
            "aria-level": item.depth + 1,
            ...(hasChildren ? { "aria-expanded": true } : {}),
            "data-nav-depth": item.depth,
            "data-setting-key": item.settingKey,
          },
          react.createElement(
            "button",
            {
              className: `settings-nav-subitem${
                hasChildren ? " has-children" : ""
              }${containsActiveItem && !isItemActive ? " in-active-path" : ""}${
                isItemActive ? " active" : ""
              }`,
              type: "button",
              "aria-current": isItemActive ? "location" : undefined,
              "aria-label": item.breadcrumb || item.label,
              onClick: () =>
                navigateToDestination(
                  item.tabId,
                  item.settingKey,
                  resolveNavItemId(item.tabId, item.settingKey)
                ),
              title: [item.breadcrumb, item.description].filter(Boolean).join(" — "),
            },
            react.createElement(
              "span",
              { className: "settings-nav-subitem-label" },
              item.label
            )
          ),
          hasChildren &&
            react.createElement(
              "div",
              {
                className: "settings-nav-tree-children",
                role: "group",
                "aria-label": item.label,
              },
              renderSectionNodes(item.children)
            )
        );
      });

    const renderSidebarTab = (tab) => {
      const sectionItems = sidebarSectionsByTab[tab.id] || [];
      // Section items are discovered from each tab's DOM after that tab is
      // rendered. Keep non-standalone tabs as groups before discovery so their
      // disclosure indicator is present on the initial sidebar render too.
      const hasSubmenu = !tab.standalone;
      const isExpanded = expandedGroupIds.includes(tab.id);
      const isTabActive = activeTab === tab.id;
      const submenuId = `${APP_NAME}-settings-nav-${tab.id}`;
      const navIcon = react.createElement(SettingsOutlineIcon, {
        name: tab.icon || tab.id,
        className: "settings-nav-icon",
        size: 16,
      });

      if (!hasSubmenu) {
        return react.createElement(
          "button",
          {
            key: tab.id,
            className: `settings-nav-card ${isTabActive ? "active" : ""}`,
            type: "button",
            "aria-current": isTabActive ? "page" : undefined,
            onClick: () =>
              navigateToDestination(tab.id, null, resolveNavItemId(tab.id)),
          },
          navIcon,
          react.createElement(
            "strong",
            { className: "settings-nav-card-title" },
            tab.label
          ),
          react.createElement(
            "span",
            { className: "settings-nav-card-badge", "aria-hidden": "true" },
            tab.badge || ""
          )
        );
      }

      return react.createElement(
        "div",
        {
          key: tab.id,
          className: "settings-nav-group",
        },
        react.createElement(
          "button",
          {
            className: `settings-nav-group-toggle ${
              isExpanded ? "expanded" : ""
            } ${isTabActive ? "active" : ""}`,
            type: "button",
            onClick: () => {
              if (activeTab !== tab.id) {
                navigateToDestination(tab.id, null, resolveNavItemId(tab.id));
                setExpandedGroupIds([tab.id]);
                return;
              }

              toggleNavigationGroup(tab.id);
            },
            "aria-expanded": isExpanded,
            "aria-controls": isExpanded ? submenuId : undefined,
          },
          navIcon,
          react.createElement(
            "span",
            { className: "settings-nav-group-title" },
            tab.label
          ),
          react.createElement(
            "span",
            { className: "settings-nav-group-indicator", "aria-hidden": "true" },
            react.createElement(
              "svg",
              {
                viewBox: "0 0 16 16",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.5,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              },
              react.createElement("path", {
                d: isExpanded ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4",
              })
            )
          )
        ),
        isExpanded &&
          react.createElement(
            "div",
            {
              id: submenuId,
              className: "settings-nav-group-items",
              role: "tree",
              "aria-label": tab.label,
            },
            renderSectionNodes(buildSettingsNavigationTree(sectionItems))
          )
      );
    };

    return react.createElement(
      "div",
      { className: "settings-sidebar-nav", role: "navigation" },
      sidebarGroups.map((group) => {
        const groupTabs = sidebarTabs.filter((tab) => tab.group === group.id);
        if (groupTabs.length === 0) return null;
        const labelId = `${APP_NAME}-settings-nav-category-${group.id}`;
        return react.createElement(
          "section",
          {
            key: group.id,
            className: "settings-nav-category",
            "aria-labelledby": labelId,
          },
          react.createElement(
            "div",
            {
              id: labelId,
              className: "settings-nav-category-label",
            },
            group.label
          ),
          react.createElement(
            "div",
            { className: "settings-nav-category-items" },
            groupTabs.map(renderSidebarTab)
          )
        );
      })
    );
  };

  const saveLyricsTypographySetting = (name, value) => {
    CONFIG.visual[name] = value;
    StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
    if (name.endsWith("font-family")) loadGoogleFontFamily(value);
    syncSettingsLyricsPreviewStyles();
    if (name === "phonetic-hyphen-replace") {
      reloadLyrics?.();
    } else {
      lyricContainerUpdate?.();
    }
    window.dispatchEvent(new CustomEvent("ivLyrics", {
      detail: { type: "config", name, value },
    }));
  };

  const saveVinylSetting = (name, value) => {
    CONFIG.visual[name] = value;
    StorageManager.saveConfig(name, value);
    if (name.endsWith("font-family")) loadGoogleFontFamily(value);
    lyricContainerUpdate?.();
    window.dispatchEvent(
      new CustomEvent("ivLyrics", {
        detail: { type: "config", name, value },
      })
    );
  };

  return react.createElement(
    "div",
    {
      id: `${APP_NAME}-config-container`,
      className: shouldReduceMotion ? "motion-reduced" : "",
      "data-ui-theme": uiTheme,
      "data-ui-theme-preference": uiThemePreference,
    },
    react.createElement("style", {
      dangerouslySetInnerHTML: {
        __html: SETTINGS_MODAL_CSS,
      },
    }),
    renderHeaderSection(),
    react.createElement(
      SettingsSidebarShell,
      { sidebarRef: settingsSidebarRef },
      react.createElement(
        "div",
        { className: "settings-search-container" },
        react.createElement(
          "div",
          { className: `settings-search-wrapper${searchQuery ? " has-query" : ""}` },
          react.createElement(
            "svg",
            {
              className: "settings-search-icon",
              viewBox: "0 0 20 20",
              fill: "currentColor",
              "aria-hidden": "true",
            },
            react.createElement("path", {
              fillRule: "evenodd",
              d: "M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z",
              clipRule: "evenodd",
            })
          ),
          react.createElement("input", {
            type: "search",
            className: "settings-search-input",
            placeholder: I18n.t("search.placeholder"),
            "aria-label": I18n.t("search.placeholder"),
            value: searchQuery,
            onChange: handleSearchChange,
            onKeyDown: (event) => {
              if (event.key === "Escape" && searchQuery) {
                event.preventDefault();
                event.stopPropagation();
                handleClearSearch();
              }
            },
          }),
          searchQuery && react.createElement(
            "button",
            {
              className: "settings-search-clear",
              type: "button",
              onClick: handleClearSearch,
              title: I18n.t("search.clear"),
              "aria-label": I18n.t("search.clear"),
            },
            "×"
          )
        )
      ),
      renderSidebarNavigation()
    ),
    react.createElement(
      SettingsMainPanelShell,
      {
        contentRef: settingsContentRef,
        badge: activeNavigationGroup?.badge || activeTabMeta?.badge,
        label: activeNavigationGroup?.label || activeTabMeta?.label,
        description:
          activeNavigationGroup?.description || activeTabMeta?.description,
      },
      // 검색 결과 탭
      activeTab === "search" &&
        react.createElement(
          "div",
          {
            className: `tab-content ${activeTab === "search" ? "active" : ""}`,
            "data-tab-id": "search",
          },
        renderSearchResults()
      ),
      // 일반 탭 (동작 관련 설정)
      activeTab === "general" &&
        react.createElement(
          "div",
          {
            className: `tab-content ${activeTab === "general" ? "active" : ""}`,
            "data-tab-id": "general",
          },
        // 언어 설정 섹션
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("sections.language"),
          subtitle: I18n.t("settings.language.desc"),
          sectionKey: "language",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.language.label") + " (Language)",
              key: "language",
              info: I18n.t("settings.language.desc"),
              type: ConfigSelection,
              options: Object.fromEntries(
                I18n.getAvailableLanguages().map(language => [language.code, language.name])
              ),
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            // I18n 시스템에도 언어 변경 알림
            if (window.I18n && window.I18n.setLanguage) {
              window.I18n.setLanguage(value);
            }
            queueReloadIntoIvLyrics({
              reopenSettings: true,
              initialTab: "general",
            });
          },
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.translationTargetLanguage.label"),
              key: "translate:target-language",
              info: I18n.t("settings.translationTargetLanguage.desc"),
              type: ConfigSelection,
              options: {
                auto: I18n.t("settings.translationTargetLanguage.options.auto"),
                ...Object.fromEntries(
                  I18n.getAvailableLanguages().map(language => [language.code, language.name])
                ),
              },
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            queueReloadIntoIvLyrics({
              reopenSettings: true,
              initialTab: "general",
            });
          },
        }),
        // 데스크탑 오버레이 섹션
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("sections.desktopOverlay"),
          subtitle: I18n.t("sections.desktopOverlaySubtitle"),
          sectionKey: "overlay-enabled",
        }),
        react.createElement(OverlaySettings)
      ),
      // 외관 탭 (시각 효과 + 타이포그래피)
      activeTab === "appearance" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "appearance" ? "active" : ""
            }`,
          "data-tab-id": "appearance",
        },
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("sections.visualEffects"),
          subtitle: I18n.t("sections.visualEffectsSubtitle"),
          sectionKey: "background-experience",
        }),
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
        react.createElement(BackgroundExperienceSection, { isFadActive }),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.syncMode.title"),
          subtitle: I18n.t("settingsAdvanced.syncMode.subtitle"),
          sectionKey: "sync-mode",
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
        }),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.multiVocalColors.title") || "Multi-vocal Colors",
          subtitle: I18n.t("settingsAdvanced.multiVocalColors.subtitle") || "Customize male, female, and duet speaker colors.",
          sectionKey: "multi-vocal-colors",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.multiVocalColors.useCreatorColors.label") || "Use sync creator custom colors",
              key: "sync-data-custom-speaker-colors-enabled",
              info: I18n.t("settingsAdvanced.multiVocalColors.useCreatorColors.desc") || "Use custom speaker colors embedded by sync creators. When disabled, CUSTOM speakers use the fallback selected by the sync creator.",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["sync-data-custom-speaker-colors-enabled"] ?? true,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(new CustomEvent("ivLyrics", {
              detail: { type: "config", name, value },
            }));
          },
        }),
        react.createElement(ConfigMultiVocalColorSettings),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.instrumentalBreak.title") || "Instrumental Marker",
          subtitle: I18n.t("settingsAdvanced.instrumentalBreak.subtitle") || "Replace long blank or note-only lyric gaps with an icon",
          sectionKey: "instrumental-break",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.autoDetect.label") || "Auto-detect instrumental gaps",
              key: "instrumental-break-auto-detect",
              info: I18n.t("settingsAdvanced.instrumentalBreak.autoDetect.desc") || "After a karaoke lyric line finishes, show an instrumental marker for a long gap before the next line.",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["instrumental-break-auto-detect"] ?? true,
            },
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.icon.label") || "Icon Design",
              key: "instrumental-break-icon",
              info: I18n.t("settingsAdvanced.instrumentalBreak.icon.desc") || "Choose the animation shown for instrumental gaps longer than 0.5 seconds",
              type: ConfigInstrumentalBreakIconPicker,
              options: {
                equalizer: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.equalizer") || "01 Equalizer",
                dotWave: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.dotWave") || "02 Dot Wave",
                ripples: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.ripples") || "03 Ripples",
                orbit: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.orbit") || "04 Orbit",
                diamonds: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.diamonds") || "05 Diamonds",
                scan: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.scan") || "06 Scan",
                arcs: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.arcs") || "07 Arcs",
                signal: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.signal") || "08 Signal",
                pulseDot: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.pulseDot") || "09 Pulse Dot",
                stack: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.stack") || "10 Stack",
                spark: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.spark") || "11 Spark",
                splitBars: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.splitBars") || "12 Split Bars",
                metronome: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.metronome") || "13 Metronome",
                vinyl: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.vinyl") || "14 Vinyl",
                beat: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.beat") || "15 Beat",
                reels: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.reels") || "16 Reels",
                triangle: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.triangle") || "17 Triangle",
                morph: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.morph") || "18 Morph",
                strings: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.strings") || "19 Strings",
                piano: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.piano") || "20 Piano",
                bloom: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.bloom") || "21 Bloom",
                speaker: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.speaker") || "22 Speaker",
                crossfade: I18n.t("settingsAdvanced.instrumentalBreak.icon.options.crossfade") || "23 Crossfade",
              },
            },
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.showLabel.label") || "Show Text Label",
              key: "instrumental-break-show-label",
              info: I18n.t("settingsAdvanced.instrumentalBreak.showLabel.desc") || "Show Intro, Break, or Outro next to the icon based on lyric position",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontFamily.label") || "Text Label Font",
              key: "instrumental-break-label-font-family",
              info: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontFamily.desc") || "Select the font for the Intro, Break, or Outro label",
              type: ConfigFontSelector,
              defaultValue: getInstrumentalBreakLabelStyleDefault("font-family", "original-font-family", "Pretendard Variable"),
              disabled: () => CONFIG.visual["instrumental-break-show-label"] !== true,
            },
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontSize.label") || "Text Label Size",
              key: "instrumental-break-label-font-size",
              info: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontSize.desc") || "Font size for the text label",
              type: ConfigSliderRange,
              min: 12,
              max: 128,
              step: 2,
              unit: "px",
              defaultValue: getInstrumentalBreakLabelStyleDefault("font-size", null, 20),
              disabled: () => CONFIG.visual["instrumental-break-show-label"] !== true,
            },
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.label") || "Text Label Weight",
              key: "instrumental-break-label-font-weight",
              info: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.desc") || "Font weight for the text label",
              type: ConfigFontWeightSlider,
              defaultValue: getInstrumentalBreakLabelStyleDefault("font-weight", null, 200),
              disabled: () => CONFIG.visual["instrumental-break-show-label"] !== true,
            },
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.opacity.label") || "Text Label Opacity",
              key: "instrumental-break-label-opacity",
              info: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.opacity.desc") || "Opacity for the text label",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
              defaultValue: getInstrumentalBreakLabelStyleDefault("opacity", null, 65),
              disabled: () => CONFIG.visual["instrumental-break-show-label"] !== true,
            },
            ...createTextOutlineSettingItems("instrumental-break-label", {
              disabled: () => CONFIG.visual["instrumental-break-show-label"] !== true,
            }),
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.speed.label") || "Animation Speed",
              key: "instrumental-break-animation-speed",
              info: I18n.t("settingsAdvanced.instrumentalBreak.speed.desc") || "Adjust the animation speed for the instrumental marker",
              type: ConfigSliderRange,
              min: 50,
              max: 200,
              step: 5,
              unit: "%",
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            if (name === "instrumental-break-label-font-family") {
              loadGoogleFontFamily(value);
            }
            StorageManager.saveConfig(name, value);
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement("div", {
          className: "settings-live-preview-spacer",
          "aria-hidden": "true",
        }),
        react.createElement(
          "div",
          {
            className: "settings-live-preview-sticky",
          },
          react.createElement(SettingsSectionTitle, {
            title: I18n.t("settingsAdvanced.livePreview.title"),
            subtitle: I18n.t("settingsAdvanced.livePreview.subtitle"),
            sectionKey: "live-preview",
          }),
          react.createElement(
            "div",
            {
              className: "font-preview-container",
            },
            react.createElement(
              "div",
              {
                className: "font-preview settings-live-preview-lyrics lyrics-lyricsContainer-LyricsContainer",
                id: "settings-live-lyrics-preview",
                style: getSettingsLyricsPreviewStyle(),
                "data-furigana-enabled": CONFIG.visual["furigana-enabled"] === true
                  ? "true"
                  : "false",
              },
              react.createElement(
                "div",
                {
                  className: `settings-live-preview-stage lyrics-lyricsContainer-SyncedLyricsPage is-karaoke${CONFIG.visual["karaoke-line-transition"] ? " karaoke-line-transition-enabled" : ""}`,
                },
                react.createElement(
                  "div",
                  { className: "settings-live-preview-line lyrics-lyricsContainer-SyncedLyrics" },
                  react.createElement(
                    "div",
                    {
                      className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active",
                      style: {
                        "--position-index": 0,
                        "--offset": "0px",
                        "--animation-index": 0,
                      },
                    },
                    react.createElement(
                      "p",
                      null,
                      react.createElement(KaraokeLine, {
                        line: SETTINGS_LYRICS_PREVIEW_LINE,
                        position: SETTINGS_LYRICS_PREVIEW_LINE.endTime,
                        isActive: true,
                        furiganaMapOverride: SETTINGS_LYRICS_PREVIEW_FURIGANA,
                      })
                    ),
                    react.createElement(
                      "p",
                      { className: "lyrics-lyricsContainer-LyricsLine-phonetic" },
                      I18n.t("settingsAdvanced.livePreview.sampleTextPhonetic")
                    ),
                    react.createElement(
                      "p",
                      { className: "lyrics-lyricsContainer-LyricsLine-translation" },
                      I18n.t("settingsAdvanced.livePreview.sampleText")
                    )
                  )
                )
              )
            )
          )
        ),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("sections.motion"),
          subtitle: I18n.t("settings.reduceMotion.desc"),
          sectionKey: "reduce-motion",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.reduceMotion.label"),
              info: I18n.t("settings.reduceMotion.desc"),
              key: "reduce-motion",
              defaultValue: CONFIG.visual["reduce-motion"] ?? false,
              type: ConfigSlider,
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
            applySettingsMotionClasses();
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        ...renderLyricsTypographySections({ onChange: saveLyricsTypographySetting }),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.furiganaStyle.title"),
          subtitle: I18n.t("settingsAdvanced.furiganaStyle.subtitle"),
          sectionKey: "furigana-style",
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
              type: ConfigFontWeightSlider,
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
            ...createTextOutlineSettingItems("furigana"),
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
            syncSettingsLyricsPreviewStyles();
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        }),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.textShadow.title"),
          subtitle: I18n.t("settingsAdvanced.textShadow.subtitle"),
          sectionKey: "text-shadow",
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
            syncSettingsLyricsPreviewStyles();
            lyricContainerUpdate?.();
            window.dispatchEvent(
              new CustomEvent("ivLyrics", {
                detail: { type: "config", name, value },
              })
            );
          },
        })
      ),
      // 성능 탭
      activeTab === "performance" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "performance" ? "active" : ""}`,
          "data-tab-id": "performance",
        },
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.performance.rendering.title"),
          subtitle: I18n.t("settingsAdvanced.performance.rendering.subtitle"),
          sectionKey: "performance-rendering",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.performance.frameRate.label"),
              info: I18n.t("settingsAdvanced.performance.frameRate.desc"),
              key: "performance-frame-rate",
              type: ConfigSliderRange,
              defaultValue: Number(CONFIG.visual["performance-frame-rate"] ?? 60),
              min: 10,
              max: 240,
              step: 1,
              unit: I18n.t("settingsAdvanced.performance.frameRate.unit"),
            },
            {
              desc: I18n.t("settings.reduceMotion.label"),
              info: I18n.t("settings.reduceMotion.desc"),
              key: "reduce-motion",
              defaultValue: CONFIG.visual["reduce-motion"] ?? false,
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.bounce.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.bounce.desc"),
              key: "karaoke-bounce",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.lineTransition.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.lineTransition.desc"),
              key: "karaoke-line-transition",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.performance.textEffects.label"),
              info: I18n.t("settingsAdvanced.performance.textEffects.desc"),
              key: "karaoke-text-effects",
              defaultValue: CONFIG.visual["karaoke-text-effects"] ?? true,
              type: ConfigSlider,
            },
          ],
          onChange: handlePerformanceSettingChange,
        }),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.performance.visualCost.title"),
          subtitle: I18n.t("settingsAdvanced.performance.visualCost.subtitle"),
          sectionKey: "performance-visual-cost",
        }),
        react.createElement(OptionList, {
          items: [
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
              desc: I18n.t("settingsAdvanced.textShadow.enabled.label"),
              info: I18n.t("settingsAdvanced.textShadow.enabled.desc"),
              key: "text-shadow-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settings.blurGradientBackground.label"),
              key: "blur-gradient-background",
              info: I18n.t("settings.blurGradientBackground.desc"),
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settings.videoBackground.label"),
              key: "video-background",
              info: I18n.t("settings.videoBackground.desc"),
              type: ConfigSlider,
            },
          ],
          onChange: handlePerformanceSettingChange,
        }),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.performance.backgroundWork.title"),
          subtitle: I18n.t("settingsAdvanced.performance.backgroundWork.subtitle"),
          sectionKey: "performance-background-work",
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
          onChange: handlePerformanceSettingChange,
        })
      ),
      // 가사 탭 (가사 동기화 및 동작)
      activeTab === "lyrics" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "lyrics" ? "active" : ""}`,
          "data-tab-id": "lyrics",
        },
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.playback.title"),
          subtitle: I18n.t("settingsAdvanced.playback.subtitle"),
          sectionKey: "playback",
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
            {
              desc: I18n.t("settingsAdvanced.playback.quickSyncControls.label"),
              key: "quick-sync-controls-enabled",
              info: I18n.t("settingsAdvanced.playback.quickSyncControls.info"),
              type: ConfigSlider,
              defaultValue: CONFIG.visual["quick-sync-controls-enabled"] ?? true,
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
        react.createElement(SettingsSectionTitle, {
          title: getSettingsText("settings.syncCreatorSettings.title", "Sync Creator Settings"),
          subtitle: getSettingsText("settings.syncCreatorSettings.subtitle", "Configure Sync Creator keyboard behavior and recording shortcuts."),
          sectionKey: "sync-creator-settings",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: getSettingsText("settings.syncCreatorSettings.autoBoundaryChars.label", "Auto-handle spaces and punctuation"),
              info: getSettingsText("settings.syncCreatorSettings.autoBoundaryChars.desc", "When using keyboard sync, automatically include nearby spaces and punctuation. Turn this off to time those characters manually."),
              key: "sync-creator-auto-boundary-chars",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["sync-creator-auto-boundary-chars"] ?? true,
            },
            {
              desc: getSettingsText("settings.syncCreatorSettings.fillCurve.label", "Karaoke fill correction curve"),
              info: getSettingsText("settings.syncCreatorSettings.fillCurve.desc", "Drag the three middle points to adjust how word and character fill progresses during karaoke playback. The default diagonal line keeps the current timing."),
              key: "karaoke-fill-correction-curve",
              type: ConfigKaraokeFillCurveEditor,
              defaultValue: CONFIG.visual["karaoke-fill-correction-curve"],
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.charForward", "Advance one character")} (${getSettingsText("settings.shortcuts.primary", "Primary")})`,
              key: "sync-creator-char-forward-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-char-forward-key"] ?? "right",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.charForward", "Advance one character")} (${getSettingsText("settings.shortcuts.secondary", "Secondary")})`,
              key: "sync-creator-char-forward-alt-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-char-forward-alt-key"] ?? "",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.charBack", "Revert one character")} (${getSettingsText("settings.shortcuts.primary", "Primary")})`,
              key: "sync-creator-char-back-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-char-back-key"] ?? "left",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.charBack", "Revert one character")} (${getSettingsText("settings.shortcuts.secondary", "Secondary")})`,
              key: "sync-creator-char-back-alt-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-char-back-alt-key"] ?? "",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.wordForward", "Advance one word")} (${getSettingsText("settings.shortcuts.primary", "Primary")})`,
              key: "sync-creator-word-forward-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-word-forward-key"] ?? ".",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.wordForward", "Advance one word")} (${getSettingsText("settings.shortcuts.secondary", "Secondary")})`,
              key: "sync-creator-word-forward-alt-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-word-forward-alt-key"] ?? "",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.wordBack", "Revert one word")} (${getSettingsText("settings.shortcuts.primary", "Primary")})`,
              key: "sync-creator-word-back-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-word-back-key"] ?? ",",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.wordBack", "Revert one word")} (${getSettingsText("settings.shortcuts.secondary", "Secondary")})`,
              key: "sync-creator-word-back-alt-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-word-back-alt-key"] ?? "",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.syllable", "Advance one syllable")} (${getSettingsText("settings.shortcuts.primary", "Primary")})`,
              key: "sync-creator-syllable-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-syllable-key"] ?? ";",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.syllable", "Advance one syllable")} (${getSettingsText("settings.shortcuts.secondary", "Secondary")})`,
              key: "sync-creator-syllable-alt-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-syllable-alt-key"] ?? "",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.drag", "Hold to drag")} (${getSettingsText("settings.shortcuts.primary", "Primary")})`,
              key: "sync-creator-drag-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-drag-key"] ?? "/",
            },
            {
              desc: `${getSettingsText("syncCreator.shortcuts.drag", "Hold to drag")} (${getSettingsText("settings.shortcuts.secondary", "Secondary")})`,
              key: "sync-creator-drag-alt-key",
              type: ConfigHotkey,
              defaultValue: CONFIG.visual["sync-creator-drag-alt-key"] ?? "numpaddivide",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.karaokeMode.title"),
          subtitle: I18n.t("settingsAdvanced.karaokeMode.subtitle"),
          sectionKey: "karaoke-mode",
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
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.lineTransition.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.lineTransition.desc"),
              key: "karaoke-line-transition",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.spotifyFakeKaraoke.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.spotifyFakeKaraoke.desc"),
              key: "spotify-fake-karaoke-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.pseudoKaraokeRenderAdvance.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.pseudoKaraokeRenderAdvance.desc"),
              key: "pseudo-karaoke-render-advance",
              type: ConfigSliderRange,
              min: 0,
              max: 500,
              step: 10,
              unit: "ms",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.prefetch.title"),
          subtitle: I18n.t("settingsAdvanced.prefetch.subtitle"),
          sectionKey: "prefetch",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.cacheManagement.title"),
          subtitle: I18n.t("settingsAdvanced.cacheManagement.subtitle"),
          sectionKey: "cache-management",
        }),
        // 로컬 캐시 관리 (IndexedDB) - 메모리 캐시와 통합됨
        react.createElement(LocalCacheManager),
        // 헬퍼 연동 섹션
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settings.lyricsHelper.sectionTitle") || "Helper Integration",
          subtitle: I18n.t("settings.lyricsHelper.sectionSubtitle") || "Send lyrics to external helper applications",
          sectionKey: "lyrics-helper",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.lyricsHelper.label"),
              info: I18n.t("settings.lyricsHelper.desc"),
              key: "lyrics-helper-enabled",
              type: LyricsHelperToggle,
              disabled: isFadActive,
            },
            {
              desc: "",
              key: "lyrics-helper-info",
              type: ConfigInfo,
              message: I18n.t("settings.lyricsHelper.info") || "Helper app allows external applications to display synced lyrics",
              buttonText: I18n.t("settings.lyricsHelper.download") || "Download Helper",
              onButtonClick: () => {
                window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank");
              },
              when: () => !CONFIG.visual["lyrics-helper-enabled"],
            },
          ],
          onChange: (name, value) => {
            CONFIG.visual[name] = value;
            StorageManager.saveConfig(name, value);
            // lyricsHelperSender 활성/비활성
            if (name === "lyrics-helper-enabled") {
              if (window.lyricsHelperSender) {
                window.lyricsHelperSender.enabled = value;
              }
            }
          },
        })
      ),
      // 고급 탭
      activeTab === "advanced" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "advanced" ? "active" : ""}`,
          "data-tab-id": "advanced",
        },
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.languageDetection.title"),
          subtitle: I18n.t("settingsAdvanced.languageDetection.subtitle"),
          sectionKey: "language-detection",
        }),
        react.createElement(OptionList, {
          items: [
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

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.cloudSync.title"),
          subtitle: I18n.t("settingsAdvanced.cloudSync.monthlyRequired"),
          sectionKey: "cloud-sync",
        }),
        react.createElement(ConfigCloudSync),

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.exportImport.title"),
          subtitle: I18n.t("settingsAdvanced.exportImport.subtitle"),
          sectionKey: "export-import",
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
                  const fileName = "ivLyrics-settings.json";
                  const saveTarget = await Utils.requestSaveFileTarget(fileName, {
                    description: "ivLyrics Settings",
                    mimeType: "application/json",
                    extensions: [".json"],
                  });
                  if (saveTarget.canceled) return;

                  const cfg = await StorageManager.exportConfig();
                  const serializedConfig = JSON.stringify(cfg, null, 2);
                  const blob = new Blob([serializedConfig], {
                    type: "application/json",
                  });
                  await Utils.saveBlobAs(blob, fileName, saveTarget);

                  const resultContainer = getSettingsResultContainer(button, "export-result-container");

                  resultContainer.innerHTML = `<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(255, 255, 255, 0.12);
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
														color: rgba(248, 250, 252, 0.9);
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
                  const resultContainer = getSettingsResultContainer(button, "export-result-container");
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
                  fileInput.accept = ".json,application/json";
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
                        if (typeof contents !== "string") {
                          throw new Error(I18n.t("settingsAdvanced.aboutTab.account.backup.invalidFormat"));
                        }

                        const cfg = JSON.parse(contents);
                        if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
                          throw new Error(I18n.t("settingsAdvanced.aboutTab.account.backup.invalidFormat"));
                        }
                        await StorageManager.importConfig(cfg);

                        const resultContainer = getSettingsResultContainer(button, "export-result-container");

                        resultContainer.innerHTML = `<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(255, 255, 255, 0.12);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(248, 250, 252, 0.9);
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
                        queueReloadIntoIvLyrics({
                          reopenSettings: true,
                          initialTab: "general",
                          delay: 1500,
                        });
                      } catch (e) {
                        const resultContainer = getSettingsResultContainer(button, "export-result-container");
                        resultContainer.innerHTML = `
											<div style="
												padding: 16px 20px;
												background: rgba(255, 255, 255, 0.03);
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid rgba(255, 255, 255, 0.08);
												border-right: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom-left-radius: 0;
												border-bottom-right-radius: 0;
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
                    reader.readAsText(file, "utf-8");
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

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.settingsPresets.title"),
          subtitle: I18n.t("settingsAdvanced.settingsPresets.subtitle"),
          sectionKey: "settings-presets",
        }),
        react.createElement(ConfigSettingsPresets),

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.dbExportImport.title"),
          subtitle: I18n.t("settingsAdvanced.dbExportImport.subtitle"),
          sectionKey: "db-export-import",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.dbExportImport.export.label"),
              info: I18n.t("settingsAdvanced.dbExportImport.export.label"),
              key: "export-db",
              text: I18n.t("settingsAdvanced.dbExportImport.export.button"),
              type: ConfigButton,
              onChange: async (_, event) => {
                const button = event?.target;
                if (!button) return;
                const originalText = button.textContent;
                button.textContent = I18n.t("settingsAdvanced.dbExportImport.export.processing");
                button.disabled = true;

                try {
                  const fileName = "ivLyrics-db.json";
                  const saveTarget = await Utils.requestSaveFileTarget(fileName, {
                    description: "ivLyrics Database",
                    mimeType: "application/json",
                    extensions: [".json"],
                  });
                  if (saveTarget.canceled) return;

                  const data = await DBExportManager.exportAllDBs();
                  const json = JSON.stringify(data, null, 2);
                  const blob = new Blob([json], { type: "application/json" });
                  await Utils.saveBlobAs(blob, fileName, saveTarget);

                  const resultContainer = getSettingsResultContainer(button, "db-export-result-container");

                  resultContainer.innerHTML = `<div style="
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.12);
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
                      color: rgba(248, 250, 252, 0.9);
                      font-size: 13px;
                    ">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                      </svg>
                      <div>
                        <div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.dbExportSuccess")}</div>
                        <div style="opacity: 0.8; font-size: 12px;">${I18n.t("notifications.dbExportSuccessDesc")}</div>
                      </div>
                    </div>
                  </div>`;
                } catch (e) {
                  const resultContainer = getSettingsResultContainer(button, "db-export-result-container");
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
                          <div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.dbExportFailed")}</div>
                          <div style="opacity: 0.8; font-size: 12px;">${e.message || e.reason || e.toString()}</div>
                        </div>
                      </div>
                    </div>`;
                } finally {
                  button.textContent = originalText;
                  button.disabled = false;
                }
              },
            },

            {
              desc: I18n.t("settingsAdvanced.dbExportImport.import.label"),
              info: I18n.t("settingsAdvanced.dbExportImport.import.label"),
              key: "import-db",
              text: I18n.t("settingsAdvanced.dbExportImport.import.button"),
              type: ConfigButton,
              onChange: async (_, event) => {
                const button = event?.target;
                if (!button) return;
                const originalText = button.textContent;
                button.textContent = I18n.t("settingsAdvanced.dbExportImport.import.processing");
                button.disabled = true;

                try {
                  const fileInput = document.createElement("input");
                  fileInput.type = "file";
                  fileInput.accept = ".json,application/json";
                  fileInput.onchange = async (e) => {
                    if (!fileInput.files || fileInput.files.length === 0) {
                      button.textContent = originalText;
                      button.disabled = false;
                      return;
                    }

                    const confirmed = confirm(
                      I18n.t("settingsAdvanced.dbExportImport.import.confirm")
                    );
                    if (!confirmed) {
                      button.textContent = originalText;
                      button.disabled = false;
                      return;
                    }

                    const file = fileInput.files[0];
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                      const contents = e.target.result;
                      try {
                        if (typeof contents !== "string") {
                          throw new Error(I18n.t("settingsAdvanced.aboutTab.account.backup.invalidFormat"));
                        }
                        const data = JSON.parse(contents);
                        await DBExportManager.importAllDBs(data);

                        const resultContainer = getSettingsResultContainer(button, "db-import-result-container");

                        resultContainer.innerHTML = `<div style="
                          padding: 16px 20px;
                          background: rgba(255, 255, 255, 0.03);
                          border: 1px solid rgba(255, 255, 255, 0.12);
                          border-left: 1px solid rgba(255, 255, 255, 0.08);
                          border-right: 1px solid rgba(255, 255, 255, 0.08);
                          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                          border-bottom-left-radius: 0;
                          border-bottom-right-radius: 0;
                          backdrop-filter: blur(30px) saturate(150%);
                          -webkit-backdrop-filter: blur(30px) saturate(150%);
                        ">
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            color: rgba(248, 250, 252, 0.9);
                            font-size: 13px;
                          ">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                            </svg>
                            <div>
                              <div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.dbImportSuccess")}</div>
                              <div style="opacity: 0.8; font-size: 12px;">${I18n.t("notifications.dbImportSuccessDesc")}</div>
                            </div>
                          </div>
                        </div>`;

                        queueReloadIntoIvLyrics({
                          reopenSettings: true,
                          initialTab: "general",
                          delay: 1500,
                        });
                      } catch (e) {
                        const resultContainer = getSettingsResultContainer(button, "db-import-result-container");
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
                                <div style="font-weight: 600; margin-bottom: 2px;">${I18n.t("notifications.dbImportFailed")}</div>
                                <div style="opacity: 0.8; font-size: 12px;">${e.message || e.reason || e.toString()}</div>
                              </div>
                            </div>
                          </div>`;
                      } finally {
                        button.textContent = originalText;
                        button.disabled = false;
                      }
                    };
                    reader.readAsText(file, "utf-8");
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

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.resetSettings.title"),
          subtitle: I18n.t("settingsAdvanced.resetSettings.subtitle"),
          sectionKey: "reset-settings",
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

                const resultContainer = getSettingsResultContainer(button, "reset-result-container");

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

                  await window.ivLyricsStoragePersistence?.clear?.();

                  resultContainer.innerHTML = `<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(255, 255, 255, 0.12);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(248, 250, 252, 0.9);
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
                  queueReloadIntoIvLyrics({
                    reopenSettings: true,
                    initialTab: "general",
                    delay: 1500,
                  });
                } catch (e) {
                  resultContainer.innerHTML = `
											<div style="
												padding: 16px 20px;
												background: rgba(255, 255, 255, 0.03);
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid rgba(255, 255, 255, 0.08);
												border-right: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom: 1px solid rgba(255, 255, 255, 0.08);
												border-bottom-left-radius: 0;
												border-bottom-right-radius: 0;
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
      // 가사 제공자 탭
      activeTab === "lyrics-providers" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "lyrics-providers" ? "active" : ""}`,
          "data-tab-id": "lyrics-providers",
        },
        react.createElement(
          "div",
          { "data-setting-key": "lyrics-providers" },
          react.createElement(LyricsProvidersTab)
        )
      ),
      // AI 제공자 탭
      activeTab === "ai-providers" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "ai-providers" ? "active" : ""}`,
          "data-tab-id": "ai-providers",
        },
        react.createElement(
          "div",
          { "data-setting-key": "ai-providers" },
          react.createElement(AIProvidersTab)
        )
      ),
      // 전체화면 탭
      activeTab === "fullscreen" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "fullscreen" ? "active" : ""}`,
          "data-tab-id": "fullscreen",
        },
        // ===== 기본 설정 섹션 =====
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.fullscreenMode.title"),
          subtitle: I18n.t("settingsAdvanced.fullscreenMode.subtitle"),
          sectionKey: "fullscreen-mode",
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
              desc: I18n.t("settingsAdvanced.fullscreenMode.pageUiOnly.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.pageUiOnly.info"),
              key: "fullscreen-page-ui-only",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-page-ui-only"] ?? false,
            },
            {
              desc: I18n.t("settingsAdvanced.fullscreenMode.hideOverlay.desc"),
              info: I18n.t("settingsAdvanced.fullscreenMode.hideOverlay.info"),
              key: "fullscreen-hide-overlay",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-hide-overlay"] ?? true,
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

        // ===== LP 모드 섹션 =====
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("vinyl.mode"),
          subtitle: I18n.t("vinyl.settings.subtitle"),
          sectionKey: "vinyl-mode",
        }),
        react.createElement(FullscreenPresentationPicker, {
          defaultValue:
            CONFIG.visual["fullscreen-focus-presentation"] || "vinyl",
          onChange: saveVinylSetting,
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("vinyl.settings.albumSizeLabel"),
              info: I18n.t("vinyl.settings.albumSizeDesc"),
              key: "fullscreen-vinyl-album-size",
              type: ConfigSliderRange,
              min: 70,
              max: 140,
              step: 5,
              unit: "%",
              defaultValue: CONFIG.visual["fullscreen-vinyl-album-size"] ?? 100,
            },
            {
              desc: I18n.t("vinyl.settings.recordSizeLabel"),
              info: I18n.t("vinyl.settings.recordSizeDesc"),
              key: "fullscreen-vinyl-record-size",
              type: ConfigSliderRange,
              min: 70,
              max: 140,
              step: 5,
              unit: "%",
              defaultValue: CONFIG.visual["fullscreen-vinyl-record-size"] ?? 100,
            },
            {
              desc: I18n.t("vinyl.settings.backgroundBlurLabel"),
              info: I18n.t("vinyl.settings.backgroundBlurDesc"),
              key: "fullscreen-vinyl-background-blur",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 5,
              unit: "px",
              defaultValue: CONFIG.visual["fullscreen-vinyl-background-blur"] ?? 0,
            },
            {
              desc: I18n.t("vinyl.settings.animationsLabel"),
              info: I18n.t("vinyl.settings.animationsDesc"),
              key: "fullscreen-vinyl-animations",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-vinyl-animations"] !== false,
            },
            {
              desc: I18n.t("vinyl.settings.centerRotationLabel"),
              info: I18n.t("vinyl.settings.centerRotationDesc"),
              key: "fullscreen-vinyl-center-rotation",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-vinyl-center-rotation"] !== false,
            },
            {
              desc: I18n.t("vinyl.settings.lyricsLabel"),
              info: I18n.t("vinyl.settings.lyricsDesc"),
              key: "fullscreen-vinyl-lyrics-enabled",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["fullscreen-vinyl-lyrics-enabled"] !== false,
            },
          ],
          onChange: saveVinylSetting,
        }),

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("vinyl.settings.tonearmTitle"),
          subtitle: I18n.t("vinyl.settings.tonearmSubtitle"),
          sectionKey: "vinyl-tonearm",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("vinyl.settings.tonearmStyleLabel"),
              info: I18n.t("vinyl.settings.tonearmStyleDesc"),
              key: "fullscreen-vinyl-tonearm-style",
              type: ConfigSelection,
              options: {
                s: I18n.t("vinyl.settings.tonearmStyleS"),
                straight: I18n.t("vinyl.settings.tonearmStyleStraight"),
                j: I18n.t("vinyl.settings.tonearmStyleJ"),
                linear: I18n.t("vinyl.settings.tonearmStyleLinear"),
              },
              defaultValue: CONFIG.visual["fullscreen-vinyl-tonearm-style"] || "s",
            },
            {
              desc: I18n.t("vinyl.settings.tonearmFinishLabel"),
              info: I18n.t("vinyl.settings.tonearmFinishDesc"),
              key: "fullscreen-vinyl-tonearm-finish",
              type: ConfigSelection,
              options: {
                white: I18n.t("vinyl.settings.tonearmFinishWhite"),
                silver: I18n.t("vinyl.settings.tonearmFinishSilver"),
                black: I18n.t("vinyl.settings.tonearmFinishBlack"),
              },
              defaultValue: CONFIG.visual["fullscreen-vinyl-tonearm-finish"] || "white",
            },
            {
              desc: I18n.t("vinyl.settings.tonearmSizeLabel"),
              info: I18n.t("vinyl.settings.tonearmSizeDesc"),
              key: "fullscreen-vinyl-tonearm-size",
              type: ConfigSliderRange,
              min: 80,
              max: 120,
              step: 5,
              unit: "%",
              defaultValue: CONFIG.visual["fullscreen-vinyl-tonearm-size"] ?? 100,
            },
          ],
          onChange: saveVinylSetting,
        }),

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("sections.typography"),
          subtitle: I18n.t("vinyl.settings.typographySubtitle"),
          sectionKey: "vinyl-typography",
        }),
        ...renderLyricsTypographySections({ vinyl: true, onChange: saveVinylSetting }),

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("vinyl.settings.videoStageTypographyTitle"),
          subtitle: I18n.t("vinyl.settings.videoStageTypographySubtitle"),
          sectionKey: "video-stage-typography",
        }),
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.originalStyle.fontFamily"),
              info: I18n.t("settingsAdvanced.originalStyle.fontFamilyDesc"),
              key: "fullscreen-video-stage-original-font-family",
              type: ConfigFontSelector,
              defaultValue:
                CONFIG.visual["fullscreen-video-stage-original-font-family"] ||
                CONFIG.visual["fullscreen-vinyl-original-font-family"] ||
                "Pretendard Variable",
            },
            {
              desc: I18n.t("settingsAdvanced.pronunciationStyle.title"),
              info: I18n.t("settingsAdvanced.pronunciationStyle.fontFamilyDesc"),
              key: "fullscreen-video-stage-phonetic-font-family",
              type: ConfigFontSelector,
              defaultValue:
                CONFIG.visual["fullscreen-video-stage-phonetic-font-family"] ||
                CONFIG.visual["fullscreen-vinyl-phonetic-font-family"] ||
                "Pretendard Variable",
            },
            {
              desc: I18n.t("settingsAdvanced.translationStyle.title"),
              info: I18n.t("settingsAdvanced.translationStyle.fontFamilyDesc"),
              key: "fullscreen-video-stage-translation-font-family",
              type: ConfigFontSelector,
              defaultValue:
                CONFIG.visual["fullscreen-video-stage-translation-font-family"] ||
                CONFIG.visual["fullscreen-vinyl-translation-font-family"] ||
                "Pretendard Variable",
            },
            {
              desc: I18n.t("settings.culturalAnnotations.fontFamily.label"),
              info: I18n.t("settings.culturalAnnotations.fontFamily.desc"),
              key: "fullscreen-video-stage-cultural-font-family",
              type: ConfigFontSelector,
              defaultValue:
                CONFIG.visual["fullscreen-video-stage-cultural-font-family"] ||
                CONFIG.visual["cultural-annotations-vinyl-font-family"] ||
                "Pretendard Variable",
            },
            {
              desc: I18n.t("vinyl.settings.videoStageBackgroundColorLabel"),
              info: I18n.t("vinyl.settings.videoStageBackgroundColorDesc"),
              key: "fullscreen-video-stage-lyric-background-color",
              type: ConfigColorPicker,
              defaultValue:
                CONFIG.visual["fullscreen-video-stage-lyric-background-color"] ||
                "#000000",
            },
            {
              desc: I18n.t("vinyl.settings.videoStageBackgroundOpacityLabel"),
              info: I18n.t("vinyl.settings.videoStageBackgroundOpacityDesc"),
              key: "fullscreen-video-stage-lyric-background-opacity",
              type: ConfigSliderRange,
              min: 0,
              max: 100,
              step: 1,
              unit: "%",
              defaultValue:
                CONFIG.visual["fullscreen-video-stage-lyric-background-opacity"] ??
                46,
            },
          ],
          onChange: saveVinylSetting,
        }),

        // ===== 일반 모드 레이아웃 섹션 =====
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.normalMode.title"),
          subtitle: I18n.t("settingsAdvanced.normalMode.subtitle"),
          sectionKey: "normal-mode",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.tvMode.title"),
          subtitle: I18n.t("settingsAdvanced.tvMode.subtitle"),
          sectionKey: "tv-mode",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.metadataDisplay.title"),
          subtitle: I18n.t("settingsAdvanced.metadataDisplay.subtitle"),
          sectionKey: "metadata-display",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.fullscreenStyle.title"),
          subtitle: I18n.t("settingsAdvanced.fullscreenStyle.subtitle"),
          sectionKey: "fullscreen-style",
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
            ...createTextOutlineSettingItems("fullscreen-title"),
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
            ...createTextOutlineSettingItems("fullscreen-artist"),
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.fullscreenUI.title"),
          subtitle: I18n.t("settingsAdvanced.fullscreenUI.subtitle"),
          sectionKey: "fullscreen-ui",
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
            ...createTextOutlineSettingItems("fullscreen-clock", {
              when: () => CONFIG.visual["fullscreen-show-clock"] !== false,
            }),
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.controllerStyle.title"),
          subtitle: I18n.t("settingsAdvanced.controllerStyle.subtitle"),
          sectionKey: "controller-style",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.autoHide.title"),
          subtitle: I18n.t("settingsAdvanced.autoHide.subtitle"),
          sectionKey: "auto-hide",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.tmiStyle.title"),
          subtitle: I18n.t("settingsAdvanced.tmiStyle.subtitle"),
          sectionKey: "tmi-style",
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
            ...createTextOutlineSettingItems("fullscreen-tmi"),
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
      activeTab === "nowplaying" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "nowplaying" ? "active" : ""}`,
          "data-tab-id": "nowplaying",
        },
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.nowPlayingPanel.title") || "NowPlaying Panel Lyrics",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.subtitle") || "Lyrics display settings for the Now Playing panel",
          sectionKey: "panel-lyrics-general",
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
            ...createTextOutlineSettingItems("panel-lyrics-original", {
              labelPrefix: `${I18n.t("settingsAdvanced.nowPlayingPanel.originalFont.label") || "Original Text"} · `,
            }),
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
            ...createTextOutlineSettingItems("panel-lyrics-phonetic", {
              labelPrefix: `${I18n.t("settingsAdvanced.nowPlayingPanel.phoneticFont.label") || "Phonetic Text"} · `,
            }),
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
            ...createTextOutlineSettingItems("panel-lyrics-translation", {
              labelPrefix: `${I18n.t("settingsAdvanced.nowPlayingPanel.translationFont.label") || "Translation Text"} · `,
            }),
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.nowPlayingPanel.background.title") || "Background",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.background.subtitle") || "Customize the panel background",
          sectionKey: "panel-background",
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
                "gradient": I18n.t("settingsAdvanced.nowPlayingPanel.background.type.gradient") || "Custom Gradient",
                "custom": I18n.t("settingsAdvanced.nowPlayingPanel.background.type.custom") || "Solid Color",
                "transparent": I18n.t("settingsAdvanced.nowPlayingPanel.background.type.transparent") || "Transparent",
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
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.background.gradient1.label") || "Gradient Color 1",
              key: "panel-bg-gradient-1",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.background.gradient1.desc") || "First gradient color",
              type: ConfigColorPicker,
              when: () => CONFIG.visual["panel-bg-type"] === "gradient",
            },
            {
              desc: I18n.t("settingsAdvanced.nowPlayingPanel.background.gradient2.label") || "Gradient Color 2",
              key: "panel-bg-gradient-2",
              info: I18n.t("settingsAdvanced.nowPlayingPanel.background.gradient2.desc") || "Second gradient color",
              type: ConfigColorPicker,
              when: () => CONFIG.visual["panel-bg-type"] === "gradient",
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
              when: () => CONFIG.visual["panel-bg-type"] !== "transparent",
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
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.nowPlayingPanel.border.title") || "Border",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.border.subtitle") || "Customize the panel border",
          sectionKey: "panel-border",
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
      activeTab === "debug" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "debug" ? "active" : ""}`,
          "data-tab-id": "debug",
        },
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.debugTab.title"),
          subtitle: I18n.t("settingsAdvanced.debugTab.subtitle"),
          sectionKey: "debug-overview",
        }),
        react.createElement(DebugInfoPanel)
      ),
      // 정보 탭
      activeTab === "about" &&
      react.createElement(
        "div",
        {
          className: `tab-content ${activeTab === "about" ? "active" : ""}`,
          "data-tab-id": "about",
        },
        // Discord 계정 연동 섹션 (최상단)
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.account.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.account.subtitle"),
          sectionKey: "about-account",
        }),
        react.createElement(AccountSection),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.appInfo.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.subtitle"),
          sectionKey: "about-app-info",
        }),
        react.createElement(
          "div",
          {
            className: "info-card about-info-card",
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
              className: "about-info-title",
              style: {
                margin: "0 0 12px",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              },
            },
            "ivLyrics"
          ),
          react.createElement(
            "p",
            {
              className: "about-info-description",
              style: {
                margin: "0 0 16px",
                lineHeight: "1.6",
              },
            },
            I18n.t("settingsAdvanced.aboutTab.appDescription")
          ),
          react.createElement(
            "p",
            {
              className: "about-info-meta",
              style: {
                margin: "0 0 8px",
                fontSize: "14px",
              },
            },
            `${I18n.t("settingsAdvanced.aboutTab.versionPrefix")}: ${Utils.currentVersion}`
          ),
          react.createElement("div", {
            className: "about-info-divider",
            style: {
              height: "1px",
              margin: "16px 0",
            },
          }),
          react.createElement(
            "p",
            {
              className: "about-info-line",
              style: {
                margin: "0 0 12px",
                lineHeight: "1.6",
              },
            },
            react.createElement("strong", null, I18n.t("settingsAdvanced.aboutTab.developer")),
            " ivLis Studio"
          ),
          react.createElement(
            "p",
            {
              className: "about-info-line",
              style: {
                margin: "0 0 12px",
                lineHeight: "1.6",
              },
            },
            react.createElement("strong", null, I18n.t("settingsAdvanced.aboutTab.originalProject")),
            "lyrics-plus by khanhas"
          ),
          react.createElement(
            "p",
            {
              className: "about-info-note",
              style: {
                margin: "0",
                fontSize: "14px",
                lineHeight: "1.6",
              },
            },
            I18n.t("settingsAdvanced.aboutTab.thanks")
          )
        ),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.clientInfo.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.clientInfo.subtitle"),
          sectionKey: "about-client-info",
        }),
        react.createElement(
          "div",
          {
            className: "info-card about-info-card about-client-card",
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
              className: "about-info-description about-info-description-compact",
              style: {
                margin: "0 0 8px",
                fontSize: "13px",
                lineHeight: "1.6",
              },
            },
            I18n.t("settingsAdvanced.aboutTab.clientInfo.description"),
          ),
          react.createElement(
            "div",
            {
              className: "about-client-id-row",
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
                className: "about-client-id-box",
                style: {
                  flex: 1,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: "13px",
                  userSelect: "all",
                  wordBreak: "break-all",
                  lineHeight: "1.5",
                },
              },
              Spicetify.LocalStorage.get("ivLyrics:user-hash")
            ),
            react.createElement(
              "button",
              {
                className: "btn about-client-copy-btn",
                onClick: () => {
                  const clientId = Spicetify.LocalStorage.get("ivLyrics:user-hash");
                  navigator.clipboard.writeText(clientId).then(() => {
                    Toast.success(I18n.t("settingsAdvanced.aboutTab.clientInfo.copied"));
                  }).catch(() => {
                    Toast.error(I18n.t("settingsAdvanced.aboutTab.clientInfo.copyFailed"));
                  });
                },
                style: {
                  padding: "10px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                },
              },
              I18n.t("settingsAdvanced.aboutTab.clientInfo.copy")
            )
          )
        ),
        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.update.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.update.subtitle"),
          sectionKey: "about-update",
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
                const resultContainer = getSettingsResultContainer(button, "update-result-container", "has-update-result");

                if (resultContainer) resultContainer.innerHTML = "";

                try {
                  const updateInfo = await Utils.checkForUpdates();

                  if (resultContainer) {
                    let message,
                      showUpdateSection = false;

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
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
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
                      const safeUpdateAvailable = escapeSettingsReleaseHtml(
                        I18n.t("notifications.updateAvailable")
                      );
                      const safeVersionChange = escapeSettingsReleaseHtml(
                        I18n.t("update.versionChange")
                      );
                      const safeCurrentVersion = escapeSettingsReleaseHtml(
                        updateInfo.currentVersion
                      );
                      const safeLatestVersion = escapeSettingsReleaseHtml(
                        updateInfo.latestVersion
                      );
                      const safeUpdatePageInfo = escapeSettingsReleaseHtml(
                        I18n.t("settingsAdvanced.aboutTab.update.protocol.info")
                      );
                      const updatePageHref = "https://lyrics.ivl.is/update";
                      const releaseNotesUrl = sanitizeSettingsReleaseUrl(
                        `https://github.com/ivLis-Studio/ivLyrics/releases/tag/v${encodeURIComponent(String(updateInfo.latestVersion ?? ""))}`
                      );
                      const releaseNotesHref = releaseNotesUrl
                        ? escapeSettingsReleaseAttribute(releaseNotesUrl)
                        : "https://github.com/ivLis-Studio/ivLyrics/releases";
                      const releaseNotesLabel = escapeSettingsReleaseHtml(
                        I18n.t("update.releaseNotes")
                      );
                      const updatePageLabel = escapeSettingsReleaseHtml(
                        I18n.t("settingsAdvanced.aboutTab.update.protocol.button")
                      );

                      resultContainer.innerHTML = `
												<div style="
													padding: 20px;
													background: rgba(255, 255, 255, 0.04);
													border: 1px solid rgba(74, 222, 128, 0.15);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
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
																">${safeUpdateAvailable}</div>
																<div style="
																	font-size: 12px;
																	color: rgba(255, 255, 255, 0.5);
																">${safeVersionChange} ${safeCurrentVersion} → ${safeLatestVersion}</div>
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
														">${safeUpdatePageInfo}</div>
													</div>
													
													<div style="display: flex; gap: 8px;">
														<a href="${updatePageHref}"
														   target="_blank"
														   rel="noopener noreferrer"
														   style="
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
														">${updatePageLabel}</a>
														<a href="${releaseNotesHref}"
														   target="_blank"
														   rel="noopener noreferrer"
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
														">${releaseNotesLabel}</a>
													</div>
												</div>
											`;
                    } else {
                      const latestVersionLabel = escapeSettingsReleaseHtml(
                        I18n.t("notifications.latestVersion")
                      );
                      const safeVersionChange = escapeSettingsReleaseHtml(
                        I18n.t("update.versionChange")
                      );
                      const safeCurrentVersion = escapeSettingsReleaseHtml(
                        updateInfo.currentVersion
                      );

                      resultContainer.innerHTML = `
												<div style="
													padding: 16px 20px;
													background: rgba(255, 255, 255, 0.03);
													border: 1px solid rgba(255, 255, 255, 0.12);
													border-left: 1px solid rgba(255, 255, 255, 0.08);
													border-right: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom: 1px solid rgba(255, 255, 255, 0.08);
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
													backdrop-filter: blur(30px) saturate(150%);
													-webkit-backdrop-filter: blur(30px) saturate(150%);
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: rgba(248, 250, 252, 0.9);
														font-size: 13px;
													">
														<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
															<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
														</svg>
														<div>
															<div style="font-weight: 600; margin-bottom: 2px;">${latestVersionLabel}</div>
															<div style="opacity: 0.8; font-size: 12px;">${safeVersionChange} ${safeCurrentVersion}</div>
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
												border-bottom-left-radius: 0;
												border-bottom-right-radius: 0;
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
            {
              desc: I18n.t("settingsAdvanced.aboutTab.update.protocol.desc"),
              info: I18n.t("settingsAdvanced.aboutTab.update.protocol.info"),
              key: "open-updater",
              text: I18n.t("settingsAdvanced.aboutTab.update.protocol.button"),
              type: ConfigButton,
              onChange: async () => {
                const opened = Utils.openUpdaterProtocol("update");
                if (opened) {
                  Toast.success(I18n.t("settingsAdvanced.aboutTab.update.protocol.opening"));
                } else {
                  Toast.error(I18n.t("settingsAdvanced.aboutTab.update.protocol.failed"));
                }
              },
            },
          ],
          onChange: () => { },
        }),

        react.createElement(SettingsSectionTitle, {
          title: I18n.t("settingsAdvanced.aboutTab.patchNotes.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.patchNotes.subtitle"),
          sectionKey: "about-patch-notes",
        }),
        react.createElement(
          "div",
	          {
	            id: "patch-notes-container",
	            style: {
	              padding: "20px",
	              background: "var(--glass-bg)",
	              border: "1px solid var(--glass-border)",
	              borderRadius: "0 0 12px 12px",
	              backdropFilter: "blur(30px) saturate(150%)",
	              WebkitBackdropFilter: "blur(30px) saturate(150%)",
              marginBottom: "24px",
              minHeight: "100px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
	              color: "var(--text-secondary)",
	            },
	          },
          I18n.t("settingsAdvanced.aboutTab.patchNotes.loading")
        )
      )
    )
  );
};

function openConfig(options = {}) {
  const { initialTab = "general", initialSettingKey = null } = options || {};
  const existingOverlay = document.getElementById("ivLyrics-settings-overlay");
  if (existingOverlay) {
    return;
  }

  // Create a full-screen overlay instead of nested modal
  const overlay = document.createElement("div");
  overlay.id = "ivLyrics-settings-overlay";
  overlay.className = "ivlyrics-settings-overlay is-entering";
  if (getEffectiveReducedMotionPreference()) {
    overlay.classList.add("motion-reduced");
  }

  const modalContainer = document.createElement("div");
  modalContainer.className = "ivlyrics-settings-modal-shell";
  modalContainer.setAttribute("role", "dialog");
  modalContainer.setAttribute("aria-modal", "true");
  modalContainer.setAttribute("aria-label", "ivLyrics Settings");
  modalContainer.tabIndex = -1;
  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  const dom =
    window.ivLyricsEnsureReactDOM?.() ||
    (typeof reactDOM !== "undefined"
      ? reactDOM
      : window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null);
  if (!dom?.render) {
    return;
  }

  const setSettingsVisibility = (isOpen) => {
    document.documentElement.classList.toggle("ivlyrics-settings-open", isOpen);
    document.body?.classList.toggle("ivlyrics-settings-open", isOpen);
    window.dispatchEvent(new CustomEvent("ivLyrics:settings-visibility", {
      detail: { open: isOpen },
    }));
  };

  let isClosing = false;
  const finalizeClose = () => {
    dom.unmountComponentAtNode?.(modalContainer);
    if (overlay.parentNode) {
      overlay.remove();
    }
    setSettingsVisibility(false);
    window.removeEventListener("keydown", handleModalKeydown, true);
    if (window.ivLyricsCloseConfig === closeOverlay) {
      window.ivLyricsCloseConfig = null;
    }
    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  };

  const closeOverlay = (immediate = false) => {
    if (isClosing) {
      return;
    }

    isClosing = true;
    overlay.classList.remove("is-open");
    overlay.classList.remove("is-entering");
    overlay.classList.add("is-closing");

    if (immediate === true || getEffectiveReducedMotionPreference()) {
      finalizeClose();
      return;
    }

    window.setTimeout(finalizeClose, getSettingsMotionDurationMs());
  };
  window.ivLyricsCloseConfig = closeOverlay;

  // Close on outside click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeOverlay();
    }
  });

  // Close on escape key
  const getFocusableElements = () => Array.from(modalContainer.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

  let escapeReleaseGuardCleanup = null;
  const guardEscapeUntilKeyup = () => {
    if (escapeReleaseGuardCleanup) return;

    let fallbackTimer = null;
    const cleanup = () => {
      window.removeEventListener("keydown", suppressEscape, true);
      window.removeEventListener("keyup", suppressEscape, true);
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      escapeReleaseGuardCleanup = null;
    };
    const suppressEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.type === "keyup") {
        cleanup();
      }
    };

    escapeReleaseGuardCleanup = cleanup;
    window.addEventListener("keydown", suppressEscape, true);
    window.addEventListener("keyup", suppressEscape, true);
    fallbackTimer = window.setTimeout(cleanup, 1500);
  };

  const handleModalKeydown = (e) => {
    if (e.key === "Escape") {
      guardEscapeUntilKeyup();

      if (e.target?.closest?.(".config-hotkey-recorder.recording")) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();

      const searchInput = e.target?.closest?.(".settings-search-input");
      if (searchInput?.value) {
        searchInput
          .closest(".settings-search-wrapper")
          ?.querySelector(".settings-search-clear")
          ?.click();
        return;
      }

      closeOverlay(true);
      return;
    }

    if (e.key === "Tab") {
      const focusable = getFocusableElements();
      if (!focusable.length) {
        e.preventDefault();
        modalContainer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  // Capture Escape at the earliest DOM stage so Spotify/native fullscreen
  // handlers cannot run before the settings surface has handled it.
  window.addEventListener("keydown", handleModalKeydown, true);

  overlay.appendChild(modalContainer);
  document.body.appendChild(overlay);
  setSettingsVisibility(true);
  window.requestAnimationFrame(() => {
    overlay.classList.remove("is-entering");
    overlay.classList.add("is-open");
    const focusTarget = modalContainer.querySelector(
      '.settings-close-btn, button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusTarget ?? modalContainer).focus?.();
  });

  dom.render(
    react.createElement(ConfigModal, {
      onRequestClose: closeOverlay,
      initialTab,
      initialSettingKey,
    }),
    modalContainer
  );
}

function queueReloadIntoIvLyrics(options = {}) {
  const {
    reopenSettings = false,
    initialTab = "general",
    initialSettingKey = null,
    delay = 0,
  } = options;

  try {
    if (reopenSettings) {
      const payload = { initialTab };
      if (initialSettingKey) {
        payload.initialSettingKey = initialSettingKey;
      }
      localStorage.setItem("ivLyrics:return-to-settings", JSON.stringify(payload));
    }
  } catch (error) {
    console.error("[ivLyrics] Failed to queue settings reopen:", error);
  }

  try {
    localStorage.setItem(
      "ivLyrics:restore-route-after-reload",
      JSON.stringify({
        path: "/ivLyrics",
        expiresAt: Date.now() + 15000,
      })
    );
  } catch (error) {
    console.error("[ivLyrics] Failed to queue ivLyrics route restore:", error);
  }

  try {
    const history = Spicetify?.Platform?.History;
    if (history?.replace) {
      history.replace("/");
    } else {
      history?.push?.("/");
    }
  } catch (error) {
    console.error("[ivLyrics] Failed to navigate to a safe reload route:", error);
  }

  window.setTimeout(() => {
    window.location.reload();
  }, Math.max(150, Number(delay) || 0));
}

window.ivLyricsOpenConfig = openConfig;

// 언어 변경 후 자동으로 설정 페이지 열기
(function checkReturnToSettings() {
  const rawValue = localStorage.getItem("ivLyrics:return-to-settings");
  if (!rawValue) return;

  let pendingOptions = null;
  if (rawValue === "true") {
    pendingOptions = { initialTab: "general" };
  } else {
    try {
      pendingOptions = JSON.parse(rawValue);
    } catch (error) {
      pendingOptions = { initialTab: "general" };
    }
  }

  localStorage.removeItem("ivLyrics:return-to-settings");

  const tryOpenSettings = () => {
    if (typeof openConfig === "function" && document.body) {
      setTimeout(() => {
        openConfig(pendingOptions || {});
      }, 500);
    } else {
      setTimeout(tryOpenSettings, 100);
    }
  };

  tryOpenSettings();
})();
