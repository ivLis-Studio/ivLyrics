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
  pronunciation: "M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  translate: "M4 5h8M8 3v2M6 5c0 4 2 7 6 9M11 5c-.4 3.4-2.2 6.2-5.5 8M14 21l3.5-9L21 21M15.5 18h4",
  metadata: "M4 4h7l9 9-7 7-9-9V4Zm4 4h.01",
  tmi: "M21 12a9 9 0 0 1-9 9H5l1.8-3.2A9 9 0 1 1 21 12Zm-9-1v5M12 7h.01",
  lyricsStudy: "M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z",
  characterPronunciation: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
  wordSupplements: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5M4 20h16",
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

// 데스크탑 오버레이 설정 컴포넌트
const OverlaySettings = () => {
  const [enabled, setEnabled] = useState(window.OverlaySender?.enabled ?? false);
  const [trimMetadata, setTrimMetadata] = useState(window.OverlaySender?.trimMetadata ?? false);
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

  const handleTrimMetadata = (value) => {
    if (!window.OverlaySender) return;
    window.OverlaySender.trimMetadata = value;
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
      if (window.OverlaySender) {
        window.OverlaySender.port = newPort;
      }
      Toast?.success?.(I18n.t("overlay.portSaved"));
    } else {
      setPortInput(String(port));
      Toast?.error?.(I18n.t("overlay.portInvalid"));
    }
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

  const statusTone = checking ? "is-pending" : isConnected ? "is-ok" : "is-error";

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
            onPointerDown: handleSettingsToggleRowPointerDown,
            onClick: handleSettingsToggleRowClick,
          },
          react.createElement("div", { className: "setting-name-row" },
            react.createElement("div", { className: "setting-name" }, I18n.t("overlay.enabled.label")),
            // Status Tag (Connected / Disconnected / Checking) only when enabled
            enabled && react.createElement("span", {
              className: `settings-pill settings-status-pill ${statusTone}`,
            }, getStatusText())
          ),
          react.createElement("div", { className: "setting-description" },
            I18n.t("overlay.enabled.desc")
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
            I18n.t("overlay.download")
          ),
          // Toggle Switch
          react.createElement(
            "button",
            {
              type: "button",
              className: `switch-checkbox${enabled ? " active" : ""}`,
              onClick: handleToggle,
              "aria-checked": enabled,
              "aria-label": I18n.t("overlay.enabled.label"),
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
            onPointerDown: handleSettingsToggleRowPointerDown,
            onClick: handleSettingsToggleRowClick,
          },
          react.createElement("div", { className: "setting-name-row" },
            react.createElement("div", { className: "setting-name" }, I18n.t("overlay.trimMetadata.label"))),
          react.createElement("div", { className: "setting-description" }, I18n.t("overlay.trimMetadata.desc"))
        ),
        react.createElement(
          "div",
          { className: "setting-row-right" },
          react.createElement(ConfigSlider, {
            name: I18n.t("overlay.trimMetadata.label"),
            defaultValue: trimMetadata,
            disabled: !enabled || !window.OverlaySender,
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
              I18n.t("overlay.port.label")
            )),
          react.createElement("div", { className: "setting-description" },
            I18n.t("overlay.port.desc")
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
            "aria-label": I18n.t("overlay.port.label"),
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
};

function getAboutAccountThemeTokens() {
  const isLightTheme = resolveEffectiveSettingsUiTheme() === "light";

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
                border: "1px solid var(--settings-accent-line)",
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
            borderRadius: "6px",
            background: editing ? "var(--settings-ink)" : themeTokens.subtleButtonBackground,
            color: editing ? "var(--settings-ink-text)" : themeTokens.subtleButtonText,
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

  const renderAccountLinkedCard = () =>
react.createElement(
    "div",
    {
      className: "info-card settings-account-card",
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
              : "#5865f2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: "1px solid var(--settings-line)",
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
  const renderAccountUnlinkedCard = () =>
react.createElement(
      "div",
      {
        className: "info-card settings-account-card",
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
              borderRadius: "10px",
              background: "#5865f2",
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
          type: "button",
          className: "btn btn-primary settings-account-login",
        },
        loginLoading ? copy.loggingIn : copy.loginButton
      )
    );
  const renderAccountLoadingCard = () =>
react.createElement(
      "div",
      {
        className: "info-card settings-account-card",
        style: {
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
  if (loading) {
    return renderAccountLoadingCard();
  }

  if (!accountInfo) {
    return renderAccountUnlinkedCard();
  }

  return renderAccountLinkedCard();
};

// AI Addon 개별 카드 컴포넌트 (아코디언 스타일 - LyricsProviderCard와 동일 스타일)
// Capability chips follow the lyrics menu (pronunciation, then translation),
// then the remaining features; unknown capabilities keep their declared order.
const AI_ADDON_CAPABILITY_ORDER = Object.freeze([
  "pronunciation", "translate", "metadata", "tmi", "researchWebSearch",
  "lyricsStudy", "characterPronunciation", "culturalAnnotations", "wordSupplements",
]);

const getOrderedAddonCapabilities = (supports) => {
  if (!supports || typeof supports !== "object") return [];
  const supported = Object.keys(supports).filter((capability) => supports[capability]);
  return [
    ...AI_ADDON_CAPABILITY_ORDER.filter((capability) => supported.includes(capability)),
    ...supported.filter((capability) => !AI_ADDON_CAPABILITY_ORDER.includes(capability)),
  ];
};

const AddonSettingsCard = ({
  addon,
  isEnabled,
  onToggle,
  isExpanded,
  onExpandToggle,
  variant = "row",
  capabilityColumns,
  owners,
  onCapabilityChange,
}) => {
  const SettingsUI = useMemo(
    () => addon.getSettingsUI ? addon.getSettingsUI() : null,
    [addon, addon.getSettingsUI]
  );

  const readCapabilities = () => {
    const caps = {};
    if (window.AIAddonManager && addon.supports) {
      Object.keys(addon.supports).forEach(cap => {
        if (addon.supports[cap]) {
          caps[cap] = window.AIAddonManager.isCapabilityEnabled(addon.id, cap);
        }
      });
    }
    return caps;
  };
  const [capabilities, setCapabilities] = useState(readCapabilities);

  useEffect(() => {
    if (window.AIAddonManager && addon.supports) {
      setCapabilities(readCapabilities());
    }
  }, [addon.id, isExpanded]); // isExpanded가 변경될 때도 상태 동기화 확인

  const toggleCapability = (cap) => {
    if (window.AIAddonManager) {
      const newValue = !capabilities[cap];
      setCapabilities(prev => ({ ...prev, [cap]: newValue }));
      window.AIAddonManager.setCapabilityEnabled(addon.id, cap, newValue);
      onCapabilityChange?.(cap, newValue);
    }
  };

  const getLocalizedDescription = (desc) => {
    if (!desc) return '';
    if (typeof desc === 'string') return desc;
    const storedLang = (Spicetify.LocalStorage.get("ivLyrics:visual:language") || window.I18n?.getCurrentLanguage?.() || 'en')
      .replace(/"/g, '');
    const baseLang = storedLang.split('-')[0] || 'en';
    const normalizedZh = baseLang === 'zh'
      ? ((/tw|hant/i.test(storedLang) || storedLang === 'zh-TW') ? 'zh-TW' : 'zh-CN')
      : null;
    return desc[storedLang] || (normalizedZh && desc[normalizedZh]) || desc[baseLang] || desc.en || Object.values(desc)[0] || '';
  };

  const displayName = addon.name || addon.id;
  const description = getLocalizedDescription(addon.description);

  // 연결 카드: 제공자별 API 키·모델 등 Addon 고유 설정 UI.
  // 검색 결과가 중복되지 않도록 작업 표의 행만 검색 앵커를 가진다.
  if (variant === "connection") {
    const words = String(displayName || "AI").replace(/[^A-Za-z0-9가-힣 ]/g, " ").trim().split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "AI").slice(0, 2)).toUpperCase();
    const meta = [addon.version ? `v${addon.version}` : "", addon.author || ""].filter(Boolean).join(" · ");
    return react.createElement("div", {
      className: `settings-connection-card${isExpanded ? " is-open" : ""}${isEnabled ? "" : " is-off"}`,
      id: `ivlyrics-ai-connection-${addon.id}`,
    },
      react.createElement("button", {
        type: "button",
        className: "settings-connection-head",
        "aria-expanded": !!isExpanded,
        disabled: !SettingsUI,
        onClick: onExpandToggle,
      },
        react.createElement("span", { className: "settings-connection-avatar", "aria-hidden": "true" }, initials),
        react.createElement("span", { className: "settings-connection-name" },
          react.createElement("b", null, displayName,
            meta ? react.createElement("span", { className: "settings-connection-meta" }, meta) : null),
          description ? react.createElement("small", null, description) : null
        ),
        react.createElement("span", { className: `settings-pill${isEnabled ? " is-ok" : ""}` },
          isEnabled ? getSettingsText("misc.enabled", "Enabled") : getSettingsText("misc.disabled", "Disabled")),
        react.createElement(SettingsUiIcon, { name: "down", size: 16, className: "settings-connection-chevron" })
      ),
      isExpanded && SettingsUI && react.createElement("div", { className: "settings-connection-body" },
        react.createElement(SettingsUI)
      )
    );
  }

  // 작업별 제공자 표의 한 행: 켜기/끄기, 기능 칸, 연결 카드로 이동
  const columns = Array.isArray(capabilityColumns)
    ? capabilityColumns
    : getSettingsAiProviderColumns([addon]);
  const capabilityLabel = getSettingsAiCapabilityLabel;
  const connectionLabel = getSettingsText("settingsUi.sections.aiConnections.title", "Connection");
  const firstTriedLabel = getSettingsText("settingsUi.providers.firstTried", "Tried first");
  const searchText = [
    addon.name,
    addon.author,
    description,
    ...Object.keys(addon.supports || {})
      .filter((capability) => addon.supports[capability])
      .map((capability) =>
        `${capability} ${I18n.t(`settings.aiProviders.supports.${capability}`) || ""}`
      ),
  ].filter(Boolean).join(" ");

  const renderCapability = (cap, chip) => {
    if (!addon.supports?.[cap]) {
      return chip ? null : react.createElement("span", { key: cap, className: "settings-cap-cell" },
        react.createElement("span", { className: "settings-cap-none", "aria-hidden": "true" }));
    }
    // Endpoint-own selections live in the connection card; the row toggle is
    // the provider-level master switch for every provider, per-endpoint or not.
    const enabled = capabilities[cap] === true;
    const isOwner = owners?.[cap] === addon.id;
    const label = `${displayName} · ${capabilityLabel(cap)}`;
    const title = isOwner ? `${label} · ${firstTriedLabel}` : label;
    const className = [
      chip ? "settings-cap-chip" : "settings-cap-toggle",
      enabled ? "is-on" : "",
      isOwner ? "is-owner" : "",
    ].filter(Boolean).join(" ");
    const content = chip
      ? capabilityLabel(cap)
      : react.createElement(SettingsUiIcon, { name: "check", size: 13 });
    const control = react.createElement("button", {
      key: cap,
      type: "button",
      className,
      "aria-pressed": enabled,
      "aria-label": title,
      title,
      onClick: () => toggleCapability(cap),
    }, content);
    return chip ? control : react.createElement("span", { key: cap, className: "settings-cap-cell" }, control);
  };

  return react.createElement("div", {
    className: `lyrics-provider-card settings-provider-row${isExpanded ? " expanded" : ""}${isEnabled ? "" : " disabled"}`,
    "data-setting-key": `ai-provider:${addon.id}`,
    "data-search-text": searchText,
  },
    react.createElement("div", { className: "settings-provider-name" },
      react.createElement("span", { className: "lyrics-provider-name" }, displayName),
      description ? react.createElement("span", { className: "lyrics-provider-summary" }, description) : null
    ),
    react.createElement("div", { className: "settings-provider-switch" },
      react.createElement("label", { className: "lyrics-provider-toggle" },
        react.createElement("input", {
          type: "checkbox",
          role: "switch",
          checked: !!isEnabled,
          "aria-label": displayName,
          onChange: (e) => onToggle(e.target.checked)
        }),
        react.createElement("span", { className: "toggle-slider" })
      )
    ),
    ...columns.map((cap) => renderCapability(cap, false)),
    react.createElement("button", {
      type: "button",
      className: "settings-provider-more",
      "aria-label": `${displayName} · ${connectionLabel}`,
      title: connectionLabel,
      disabled: !SettingsUI,
      onClick: onExpandToggle,
    }, react.createElement(SettingsUiIcon, { name: "right", size: 16 })),
    react.createElement("div", { className: "settings-provider-chips" },
      ...columns.map((cap) => renderCapability(cap, true))
    )
  );
};

// 가사 제공자 카드 컴포넌트 (제공자 표의 한 행)
const LyricsProviderCard = ({ provider, isEnabled, onToggle, isExpanded, onExpandToggle, owners, onTypeChange }) => {
  const SettingsUI = useMemo(
    () => provider.getSettingsUI ? provider.getSettingsUI() : null,
    [provider, provider.getSettingsUI]
  );

  const getLocalizedDescription = (desc) => {
    if (!desc) return '';
    if (typeof desc === 'string') return desc;
    const storedLang = (StorageManager.getItem("ivLyrics:visual:language") || window.I18n?.getCurrentLanguage?.() || 'en')
      .replace(/"/g, '');
    const baseLang = storedLang.split('-')[0] || 'en';
    const normalizedZh = baseLang === 'zh'
      ? ((/tw|hant/i.test(storedLang) || storedLang === 'zh-TW') ? 'zh-TW' : 'zh-CN')
      : null;
    return desc[storedLang] || (normalizedZh && desc[normalizedZh]) || desc[baseLang] || desc.en || Object.values(desc)[0] || '';
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
    onTypeChange?.(type, value);
  };

  const {
    character: showCharacterToggle,
    word: showWordToggle
  } = getLyricsProviderGranularitySupport(provider);
  const typeStates = {
    character: { supported: showCharacterToggle, enabled: enableCharacter },
    word: { supported: showWordToggle, enabled: enableWord },
    synced: { supported: !!provider.supports?.synced, enabled: enableSynced },
    unsynced: { supported: !!provider.supports?.unsynced, enabled: enableUnsynced },
  };
  const displayName = provider.name || provider.id;
  const description = getLocalizedDescription(provider.description);
  const typeLabel = (type) => I18n.t(`settings.lyricsProviders.supports.${type}`) || type;
  const detailLabel = getSettingsText("shareImage.advancedSettings", "Advanced Settings");
  const firstTriedLabel = getSettingsText("settingsUi.providers.firstTried", "Tried first");

  const renderType = (type, chip) => {
    const state = typeStates[type];
    if (!state.supported) {
      return chip ? null : react.createElement("span", { key: type, className: "settings-cap-cell" },
        react.createElement("span", { className: "settings-cap-none", "aria-hidden": "true" }));
    }
    const isOwner = owners?.[type] === provider.id;
    const label = `${displayName} · ${typeLabel(type)}${isOwner ? ` · ${firstTriedLabel}` : ""}`;
    const control = react.createElement("button", {
      key: type,
      type: "button",
      className: `${chip ? "settings-cap-chip" : "settings-cap-toggle"}${state.enabled ? " is-on" : ""}${isOwner ? " is-owner" : ""} type-${type}`,
      "aria-pressed": !!state.enabled,
      "aria-label": label,
      title: label,
      onClick: () => handleTypeToggle(type, !state.enabled),
    }, chip ? typeLabel(type) : react.createElement(SettingsUiIcon, { name: "check", size: 13 }));
    return chip ? control : react.createElement("span", { key: type, className: "settings-cap-cell" }, control);
  };

  return react.createElement("div", {
    className: `lyrics-provider-card settings-provider-row${isExpanded ? " expanded" : ""}${isEnabled ? "" : " disabled"}`,
    "data-setting-key": `lyrics-provider:${provider.id}`,
    "data-search-text": [
      provider.name,
      provider.author,
      description,
      ...Object.keys(provider.supports || {})
        .filter((lyricsType) => provider.supports[lyricsType])
        .map((lyricsType) =>
          `${lyricsType} ${I18n.t(`settings.lyricsProviders.types.${lyricsType}`) || ""}`
        ),
    ].filter(Boolean).join(" "),
  },
    react.createElement("div", { className: "settings-provider-name" },
      react.createElement("span", { className: "lyrics-provider-name" }, displayName),
      description ? react.createElement("span", { className: "lyrics-provider-summary" }, description) : null
    ),
    react.createElement("div", { className: "settings-provider-switch" },
      react.createElement("label", { className: "lyrics-provider-toggle" },
        react.createElement("input", {
          type: "checkbox",
          role: "switch",
          checked: !!isEnabled,
          "aria-label": displayName,
          onChange: (e) => onToggle(e.target.checked)
        }),
        react.createElement("span", { className: "toggle-slider" })
      )
    ),
    ...LYRICS_PROVIDER_TYPE_COLUMNS.map((type) => renderType(type, false)),
    react.createElement("button", {
      type: "button",
      className: "settings-provider-more is-disclosure",
      "aria-expanded": !!isExpanded,
      "aria-label": `${displayName} · ${detailLabel}`,
      title: detailLabel,
      disabled: !SettingsUI,
      onClick: onExpandToggle,
    }, react.createElement(SettingsUiIcon, { name: "down", size: 16 })),
    react.createElement("div", { className: "settings-provider-chips" },
      ...LYRICS_PROVIDER_TYPE_COLUMNS.map((type) => renderType(type, true))
    ),
    isExpanded && SettingsUI && react.createElement("div", { className: "lyrics-provider-card-body" },
      react.createElement(SettingsUI)
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

// Section frame shared by every settings menu. The title is the scroll-spy,
// section-tab and search anchor; the body holds the rows. It is plain markup
// so the provider tabs can render their own sections.
const renderSettingsSectionShell = ({
  sectionKey, title, subtitle, view, hidden, className = "", children,
}) =>
  react.createElement(
    "section",
    {
      key: sectionKey,
      className: `settings-section${className ? ` ${className}` : ""}`,
      "data-section-key": sectionKey,
      "data-view": view || undefined,
      hidden: hidden ? true : undefined,
    },
    react.createElement(
      "div",
      { className: "section-title", "data-setting-key": sectionKey },
      react.createElement(
        "div",
        { className: "section-title-content" },
        react.createElement(
          "div",
          { className: "section-text" },
          react.createElement("h3", null, title),
          subtitle ? react.createElement("p", null, subtitle) : null
        )
      )
    ),
    react.createElement(
      "div",
      { className: "settings-section-body" },
      ...(Array.isArray(children) ? children : [children])
    )
  );

// Lyrics types a provider can be limited to, in lookup order.
const LYRICS_PROVIDER_TYPE_COLUMNS = Object.freeze(["character", "word", "synced", "unsynced"]);

const SETTINGS_AI_CAPABILITY_LABELS = Object.freeze({
  pronunciation: ["settings.aiProviders.supports.pronunciation", "Pronunciation"],
  translate: ["settings.aiProviders.supports.translate", "Translation"],
  metadata: ["settings.aiProviders.supports.metadata", "Metadata"],
  tmi: ["settings.aiProviders.supports.tmi", "TMI"],
  researchWebSearch: ["settings.aiProviders.supports.researchWebSearch", "Research web search"],
  lyricsStudy: ["settings.aiProviders.supports.lyricsStudy", "Learning"],
  characterPronunciation: ["settings.aiProviders.supports.characterPronunciation", "Character pronunciation"],
  culturalAnnotations: ["settings.aiProviders.supports.culturalAnnotations", "Cultural context"],
  wordSupplements: ["settings.aiProviders.supports.wordSupplements", "Word details"],
});

const getSettingsAiCapabilityLabel = (capability) => {
  const [key, fallback] = SETTINGS_AI_CAPABILITY_LABELS[capability]
    || [`settings.aiProviders.supports.${capability}`, capability];
  return I18n.t(key) || fallback;
};

// Columns of the AI provider table: every capability an add-on declares, in
// the provider cards' order (pronunciation before translation).
const getSettingsAiProviderColumns = (providers) => {
  const supports = {};
  (providers || []).forEach((provider) => {
    Object.keys(provider?.supports || {}).forEach((capability) => {
      if (provider.supports[capability]) supports[capability] = true;
    });
  });
  return typeof getOrderedAddonCapabilities === "function"
    ? getOrderedAddonCapabilities(supports)
    : Object.keys(supports);
};

const SETTINGS_PROVIDER_GLYPHS = Object.freeze({
  character: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
  word: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5",
  synced: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3 2",
  unsynced: "M5 6h14M5 12h14M5 18h9",
  translate: "M4 5h8M8 3v2M6 5c0 4 2 7 6 9M11 5c-.4 3.4-2.2 6.2-5.5 8M14 21l3.5-9L21 21M15.5 18h4",
  pronunciation: "M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  metadata: "M4 4h7l9 9-7 7-9-9V4Zm4 4h.01",
  tmi: "M21 12a9 9 0 0 1-9 9H5l1.8-3.2A9 9 0 1 1 21 12Zm-9-1v5M12 7h.01",
  researchWebSearch: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35",
  lyricsStudy: "M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z",
  characterPronunciation: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
  culturalAnnotations: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-20c3 3 4.5 6.3 4.5 10S15 19 12 22M12 2C9 5 7.5 8.3 7.5 12S9 19 12 22M2 12h20",
  wordSupplements: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5M4 20h16",
  arrow: "m9 6 6 6-6 6",
});

const renderSettingsProviderGlyph = (name) =>
  SETTINGS_PROVIDER_GLYPHS[name]
    ? react.createElement("svg", {
      className: "settings-provider-glyph",
      width: 15,
      height: 15,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    }, react.createElement("path", { d: SETTINGS_PROVIDER_GLYPHS[name] }))
    : null;

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

// Return the existing DOM tree directly; do not introduce a remounting wrapper.
const renderSettingsProviderItems = ({
  sortedProviders, dragState, enabledProviders, expandedProviders,
  handleDragOver, handleDrop, handleDragStart, clearDragState, moveProvider,
  handleToggleEnabled, toggleExpanded, translationKey, Card, providerProp,
  onExpandProvider, cardProps
}) => (
  sortedProviders.map((provider, providerIndex) =>
    react.createElement("div", {
      key: provider.id,
      role: "listitem",
      className: [
        "lyrics-provider-item",
        dragState.sourceId === provider.id ? "dragging" : "",
        dragState.targetId === provider.id ? `drag-over-${dragState.position}` : "",
        enabledProviders[provider.id] === false ? "is-off" : "",
      ].filter(Boolean).join(" "),
      onDragOver: (event) => handleDragOver(event, provider.id),
      onDrop: (event) => handleDrop(event, provider.id),
    },
      react.createElement(ProviderDragHandle, {
        provider,
        label: `${provider.name || provider.id}: ${I18n.t(`${translationKey}.moveUp`) || "Move Up"} / ${I18n.t(`${translationKey}.moveDown`) || "Move Down"}`,
        onDragStart: handleDragStart,
        onDragEnd: clearDragState,
        onMove: moveProvider,
      }),
      react.createElement("span", {
        className: "provider-order-index",
        "aria-hidden": "true",
      }, providerIndex + 1),
      // Provider 카드
      react.createElement(Card, {
        ...(cardProps || {}),
        [providerProp]: provider,
        isEnabled: enabledProviders[provider.id] !== false,
        onToggle: (enabled) => handleToggleEnabled(provider.id, enabled),
        isExpanded: expandedProviders.has(provider.id),
        onExpandToggle: () => (onExpandProvider || toggleExpanded)(provider.id)
      })
    )
  )
);

// Column header of a provider table. Its cells use the same grid as the rows.
const renderSettingsProviderTableHead = ({
  columns, labelFor, owners, providerNames, noneLabel, providerLabel,
}) =>
  react.createElement("div", { className: "settings-provider-head" },
    react.createElement("span", { className: "settings-provider-head-spacer", "aria-hidden": "true" }),
    react.createElement("div", { className: "settings-provider-head-cells" },
      react.createElement("span", { className: "settings-provider-head-label" }, providerLabel),
      react.createElement("span", { "aria-hidden": "true" }),
      ...columns.map((column) => {
        const ownerId = owners ? owners[column] : null;
        const ownerName = ownerId ? (providerNames[ownerId] || ownerId) : "";
        return react.createElement("span", {
          key: column,
          className: "settings-provider-head-cap",
          title: labelFor(column),
        },
          renderSettingsProviderGlyph(column),
          react.createElement("span", { className: "settings-provider-head-text" }, labelFor(column)),
          owners ? react.createElement("span", {
            className: `settings-provider-owner${ownerId ? "" : " is-none"}`,
            title: ownerName || noneLabel,
          }, ownerName || noneLabel) : null
        );
      }),
      react.createElement("span", { "aria-hidden": "true" })
    )
  );

const renderSettingsProviderLegend = () =>
  react.createElement("div", { className: "settings-provider-legend", "aria-hidden": "true" },
    react.createElement("span", null,
      react.createElement("i", { className: "is-on" }),
      I18n.t("misc.enabled") || "Enabled"),
    react.createElement("span", null,
      react.createElement("i", { className: "is-owner" }),
      I18n.t("settingsUi.providers.firstTried") || "Tried first")
  );

// 가사 제공자 설정 탭 컴포넌트
const LyricsProvidersTab = () => {
  const [providers, setProviders] = useState([]);
  const [providerOrder, setProviderOrder] = useState([]);
  const [enabledProviders, setEnabledProviders] = useState({});
  const [expandedProviders, setExpandedProviders] = useState(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [dragState, setDragState] = useState({ sourceId: null, targetId: null, position: "before" });
  // Lookup toggles and per-type switches only change how the chain and the
  // "tried first" marks read; re-render to redraw them.
  const [, setDisplayRevision] = useState(0);
  const preferSyncDataProviderEnabled =
    window.LyricsAddonManager?.isPreferSyncDataProviderEnabled?.()
    ?? (CONFIG.visual["prefer-sync-data-provider"] !== false);
  const preferLyricsTypeOverProviderOrderEnabled =
    window.LyricsAddonManager?.isPreferLyricsTypeOverProviderOrderEnabled?.()
    ?? (CONFIG.visual["prefer-lyrics-type-over-provider-order"] !== false);

  useEffect(() => {
    let disposed = false;
    let retryTimer = null;
    const loadProviders = () => {
      if (disposed) return;
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
        retryTimer = setTimeout(loadProviders, 100);
      }
    };
    loadProviders();
    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
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
  const typeLabel = (type) => I18n.t(`settings.lyricsProviders.supports.${type}`) || type;
  const isTypeSupported = (provider, type) => (
    type === "synced" || type === "unsynced"
      ? !!provider?.supports?.[type]
      : !!getLyricsProviderGranularitySupport(provider)[type]
  );
  // Same defaults as the provider rows, including the legacy karaoke switch.
  const isTypeEnabled = (provider, type) => {
    const manager = window.LyricsAddonManager;
    if (typeof manager?.getAddonSetting !== "function") return true;
    let fallback = true;
    if (type === "character" || type === "word") {
      const legacy = manager.getAddonSetting(provider.id, "enable_karaoke", null);
      fallback = legacy === null || legacy === undefined ? true : legacy !== false;
    }
    return !!(manager.getAddonSetting(provider.id, `enable_${type}`, fallback) ?? true);
  };
  const typeOwners = {};
  LYRICS_PROVIDER_TYPE_COLUMNS.forEach((type) => {
    const owner = sortedProviders.find((provider) =>
      enabledProviders[provider.id] !== false && isTypeSupported(provider, type) && isTypeEnabled(provider, type));
    typeOwners[type] = owner ? owner.id : null;
  });

  const lookupSteps = [];
  if (preferSyncDataProviderEnabled) {
    lookupSteps.push({
      id: "sync",
      label: I18n.t("settings.lyricsProviders.supports.ivLyricsSync") || "ivLyrics Sync",
      accent: true,
    });
  }
  if (preferLyricsTypeOverProviderOrderEnabled) {
    LYRICS_PROVIDER_TYPE_COLUMNS.forEach((type) => lookupSteps.push({ id: `type-${type}`, label: typeLabel(type) }));
  } else {
    sortedProviders
      .filter((provider) => enabledProviders[provider.id] !== false)
      .forEach((provider) => lookupSteps.push({ id: `provider-${provider.id}`, label: provider.name || provider.id }));
  }

  return react.createElement("div", { className: "settings-provider-tab lyrics-providers-section", style: { display: "contents" } },
    renderSettingsSectionShell({
      sectionKey: "lyrics-lookup",
      title: I18n.t("settingsUi.sections.lyricsLookup.title") || "Lookup order",
      subtitle: I18n.t("settingsUi.sections.lyricsLookup.subtitle") || "Choose what to check first when looking for lyrics.",
      children: react.createElement("div", { className: "settings-group settings-lookup-group" },
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
            setDisplayRevision((revision) => revision + 1);
          },
        }),
        lookupSteps.length > 0 && react.createElement("div", {
          className: "settings-lookup-chain",
          "aria-live": "polite",
        },
          ...lookupSteps.flatMap((step, index) => [
            index > 0 ? react.createElement("span", {
              key: `arrow-${step.id}`,
              className: "settings-lookup-arrow",
              "aria-hidden": "true",
            }, renderSettingsProviderGlyph("arrow")) : null,
            react.createElement("span", {
              key: step.id,
              className: `settings-lookup-step${step.accent ? " is-accent" : ""}`,
            }, step.label),
          ])
        )
      ),
    }),
    renderSettingsSectionShell({
      sectionKey: "lyrics-provider-list",
      title: I18n.t("settings.lyricsProviders.title") || "Lyrics Providers",
      subtitle: I18n.t("settings.lyricsProviders.description") || "Select and prioritize lyrics providers. Providers at the top are tried first.",
      children: providers.length > 0
        ? react.createElement("div", {
          className: "settings-group settings-provider-table",
          style: { "--provider-caps": LYRICS_PROVIDER_TYPE_COLUMNS.length },
        },
          react.createElement("div", { className: "settings-provider-caption" },
            react.createElement("b", null, I18n.t("settings.lyricsProviders.allowedTypes") || "Allowed Lyrics Types")),
          renderSettingsProviderTableHead({
            columns: LYRICS_PROVIDER_TYPE_COLUMNS,
            labelFor: typeLabel,
            providerLabel: I18n.t("settingsUi.groups.providers") || "Providers",
          }),
          // Provider 목록
          react.createElement("div", { className: "lyrics-providers-list", role: "list" },
            renderSettingsProviderItems({
              sortedProviders, dragState, enabledProviders, expandedProviders,
              handleDragOver, handleDrop, handleDragStart, clearDragState, moveProvider,
              handleToggleEnabled, toggleExpanded,
              translationKey: "settings.lyricsProviders", Card: LyricsProviderCard, providerProp: "provider",
              cardProps: {
                owners: typeOwners,
                onTypeChange: () => setDisplayRevision((revision) => revision + 1),
              },
            })
          ),
          renderSettingsProviderLegend()
        )
        // Provider가 없을 때
        : react.createElement("div", { className: "no-providers-message" },
          react.createElement("p", null, I18n.t("settings.lyricsProviders.noProviders") || "등록된 가사 제공자가 없습니다.")
        ),
    })
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

// AI 제공자 설정 탭 컴포넌트. 문화적 배경 설명 섹션은 설정 창이 children으로 넘긴다.
const AIProvidersTab = ({ children } = {}) => {
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
  // Capability switches change which provider is tried first per column.
  const [, setCapabilityRevision] = useState(0);

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

  // The row's arrow opens the provider's connection card and brings it into
  // view inside the settings scroller (never scrolls Spotify's own shell).
  const revealConnection = (providerId) => {
    setExpandedProviders(prev => {
      if (prev.has(providerId)) return prev;
      const next = new Set(prev);
      next.add(providerId);
      return next;
    });
    const bringIntoView = () => {
      const card = document.getElementById?.(`ivlyrics-ai-connection-${providerId}`);
      const scroller = card?.closest?.(".settings-content");
      if (!card || !scroller) return;
      const pageHead = scroller.querySelector(".settings-page-head");
      const offset = (pageHead ? pageHead.getBoundingClientRect().height : 0) + 12;
      const top = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      card.classList.remove("is-flash");
      void card.offsetWidth;
      card.classList.add("is-flash");
      card.querySelector(".settings-connection-head")?.focus({ preventScroll: true });
    };
    window.requestAnimationFrame?.(() => window.requestAnimationFrame?.(bringIntoView));
  };

  const { moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState } =
    createSettingsProviderOrderControls(
      "AIAddonManager", providers, providerOrder, setProviderOrder, dragState, setDragState
    );

  // 정렬된 provider 목록
  const sortedProviders = buildOrderedProviderList(providers, providerOrder);
  const capabilityColumns = getSettingsAiProviderColumns(sortedProviders);
  // Mirrors AIAddonManager.getEnabledProvidersFor: the provider-level flag
  // is the master switch (ceiling) for every provider, including per-endpoint
  // add-ons, whose endpoints decide their own choices underneath it.
  const isCapabilityOn = (provider, capability) => {
    if (!provider?.supports?.[capability]) return false;
    return window.AIAddonManager?.isCapabilityEnabled?.(provider.id, capability) ?? true;
  };
  const owners = {};
  capabilityColumns.forEach((capability) => {
    const owner = sortedProviders.find((provider) =>
      enabledProviders[provider.id] !== false && isCapabilityOn(provider, capability));
    owners[capability] = owner ? owner.id : null;
  });
  const providerNames = {};
  sortedProviders.forEach((provider) => { providerNames[provider.id] = provider.name || provider.id; });
  const connectionProviders = sortedProviders.filter((provider) => typeof provider.getSettingsUI === "function");

  return react.createElement("div", { className: "settings-provider-tab ai-providers-section", style: { display: "contents" } },
    renderSettingsSectionShell({
      sectionKey: "ai-tasks",
      title: I18n.t("settingsUi.sections.aiTasks.title") || "Providers by task",
      subtitle: I18n.t("settings.aiProviders.description") || "Select and prioritize AI providers. Providers at the top are tried first. On failure, the next provider is automatically used.",
      children: providers.length > 0
        ? react.createElement("div", {
          className: "settings-group settings-provider-table is-ai",
          style: { "--provider-caps": capabilityColumns.length },
        },
          react.createElement("div", { className: "settings-provider-caption" },
            react.createElement("b", null, I18n.t("settings.aiProviders.enabledCapabilities") || "Enabled Capabilities"),
            react.createElement("span", null, I18n.t("settings.aiProviders.capabilitiesDesc") || "Select which features this provider handles")),
          renderSettingsProviderTableHead({
            columns: capabilityColumns,
            labelFor: getSettingsAiCapabilityLabel,
            owners,
            providerNames,
            noneLabel: I18n.t("misc.none") || "None",
            providerLabel: I18n.t("settingsUi.groups.providers") || "Providers",
          }),
          // Provider 목록
          react.createElement("div", { className: "lyrics-providers-list", role: "list" },
            renderSettingsProviderItems({
              sortedProviders, dragState, enabledProviders, expandedProviders,
              handleDragOver, handleDrop, handleDragStart, clearDragState, moveProvider,
              handleToggleEnabled, toggleExpanded,
              translationKey: "settings.aiProviders", Card: AddonSettingsCard, providerProp: "addon",
              onExpandProvider: revealConnection,
              cardProps: {
                capabilityColumns,
                owners,
                onCapabilityChange: () => setCapabilityRevision((revision) => revision + 1),
              },
            })
          ),
          renderSettingsProviderLegend()
        )
        // Provider가 없을 때
        : react.createElement("div", { className: "no-providers-message" },
          react.createElement("p", null, I18n.t("settings.aiProviders.noProviders") || "등록된 AI 제공자가 없습니다.")
        ),
    }),
    renderSettingsSectionShell({
      sectionKey: "ai-translation",
      title: I18n.t("settings.aiProviders.translationStyle.title") || "Translation style",
      subtitle: I18n.t("settings.aiProviders.translationStyle.description")
        || "Choose how closely AI translations follow the original wording. Line structure and meaning are preserved in every mode.",
      children: react.createElement("div", {
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
      ),
    }),
    children,
    renderSettingsSectionShell({
      sectionKey: "ai-request",
      title: I18n.t("settingsUi.sections.aiRequest.title") || "Requests",
      children: react.createElement(OptionList, {
        items: [
          {
            desc: I18n.t("settings.aiProviders.retryCount.label") || "Retries per provider",
            key: "ai-provider-retry-count",
            info: I18n.t("settings.aiProviders.retryCount.description")
              || "Number of additional attempts after a failed request. Set to 0 to switch to the next provider immediately.",
            type: ConfigSliderRange,
            presentation: "stepper",
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
    }),
    connectionProviders.length > 0 && renderSettingsSectionShell({
      sectionKey: "ai-connections",
      title: I18n.t("settingsUi.sections.aiConnections.title") || "Connections",
      subtitle: I18n.t("settingsUi.sections.aiConnections.subtitle") || "Manage the connection details each provider needs, such as API keys and models.",
      className: "is-bare",
      children: react.createElement("div", { className: "settings-connections" },
        connectionProviders.map((provider) =>
          react.createElement(AddonSettingsCard, {
            key: provider.id,
            addon: provider,
            variant: "connection",
            isEnabled: enabledProviders[provider.id] !== false,
            onToggle: (enabled) => handleToggleEnabled(provider.id, enabled),
            isExpanded: expandedProviders.has(provider.id),
            onExpandToggle: () => toggleExpanded(provider.id),
          })
        )
      ),
    })
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
// 로컬 곡에 가져온 가사(local-lyrics 저장소)는 곡 캐시가 아니라 사용자가 저장한 데이터다.
const LOCAL_LYRICS_STORAGE_KEY = "ivLyrics:local-lyrics";

const readSavedLocalLyricsStore = () => {
  try {
    const store = JSON.parse(StorageManager.getItem(LOCAL_LYRICS_STORAGE_KEY) || "{}");
    return store && typeof store === "object" ? store : {};
  } catch (error) {
    console.warn("[LocalCacheManager] Failed to read local lyrics:", error);
    return {};
  }
};

const hasSavedLocalLyrics = (trackUri) => !!trackUri && !!readSavedLocalLyricsStore()[trackUri];

const deleteSavedLocalLyrics = (trackUri) => {
  if (!hasSavedLocalLyrics(trackUri)) return false;
  if (typeof window.lyricContainer?.deleteLocalLyrics === "function") {
    window.lyricContainer.deleteLocalLyrics(trackUri);
  } else {
    const store = readSavedLocalLyricsStore();
    delete store[trackUri];
    StorageManager.setItem(LOCAL_LYRICS_STORAGE_KEY, JSON.stringify(store));
  }
  window.LyricsService?.clearLyricsSnapshot?.(trackUri);
  window.dispatchEvent(new CustomEvent("ivLyrics:local-lyrics-updated", {
    detail: { trackUri, deleted: true },
  }));
  return true;
};

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
    // 로컬 곡 URI(spotify:local:아티스트:앨범:제목:길이)는 세 번째 칸이 아티스트명이라
    // 엉뚱한 키를 지웠다. 캐시는 Spotify 트랙 ID 또는 local-uri: 키로 저장된다.
    const spotifyTrackId = Utils.extractTrackId?.(trackUri) || null;
    const trackId = spotifyTrackId || Utils.getTranslationCacheId?.(trackUri) || null;
    if (!trackId) {
      Toast.error(I18n.t("notifications.noTrackPlaying"));
      return;
    }

    // 로컬 곡은 저장된 로컬 가사가 남아 있으면 다시 불러올 때 그대로 복원되므로,
    // 확인을 받은 경우에만 함께 지운다.
    const removeLocalLyrics = !spotifyTrackId
      && hasSavedLocalLyrics(trackUri)
      && window.confirm(getSettingsText(
        "menu.localLyricsDeleteConfirm",
        "Delete the local lyrics saved for this track? This can't be undone."
      ));

    try {
      const removedLocalLyrics = removeLocalLyrics && deleteSavedLocalLyrics(trackUri);

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
      Toast.success(removedLocalLyrics
        ? getSettingsText("notifications.localLyricsDeleted", "Local lyrics deleted")
        : I18n.t("notifications.localCacheTrackCleared"));
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

// 디버그 정보 패널 컴포넌트
const DebugInfoPanel = () => {
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

  const getApiSummary = () => window.ApiTracker?.getSummary() || {
    total: apiLogs.length,
    cached: apiLogs.filter(log => log.cached || log.status === "cached").length
  };

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
          language: CONFIG.visual.language || "en"
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
    const tracker = window.ApiTracker;
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
    if (window.ApiTracker) {
      setApiLogs(window.ApiTracker.getLogs());
    }
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
    return 'var(--text-3, #888)';
  };

  if (!debugInfo) {
    return react.createElement(
      "div",
      {
        className: "info-card debug-info-panel debug-info-panel-loading",
      },
      I18n.t("settingsAdvanced.debugTab.loading")
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
    );

  const renderDebugTrackInfo = () =>
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
    );

  const renderDebugApiLogs = () => {
    const summary = getApiSummary();
    const statusLabels = {
      success: I18n.t("settingsAdvanced.debugTab.apiLogs.status.success"),
      error: I18n.t("settingsAdvanced.debugTab.apiLogs.status.error"),
      pending: I18n.t("settingsAdvanced.debugTab.apiLogs.status.pending"),
      cached: I18n.t("settingsAdvanced.debugTab.apiLogs.status.cached")
    };
    // API 요청 로그 섹션
    return react.createElement(
      "div",
      { className: "debug-info-section" },
      react.createElement("div", {
        className: "debug-info-section-label debug-info-section-label-row"
      },
        react.createElement("span", null, I18n.t("settingsAdvanced.debugTab.apiLogs.title", { count: apiLogs.length })),
        react.createElement("span", { className: "debug-info-inline-meta" },
          I18n.t("settingsAdvanced.debugTab.apiLogs.summary", { total: summary.total, cached: summary.cached })
        )
      ),
      react.createElement("div", {
        className: "debug-api-list"
      },
        apiLogs.length === 0
          ? react.createElement("div", {
            className: "debug-api-empty"
          }, I18n.t("settingsAdvanced.debugTab.apiLogs.empty"))
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
                }, date ? date.toLocaleTimeString(I18n.getCurrentLanguage())
                  : I18n.t("settingsAdvanced.debugTab.apiLogs.unknownTime"))
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
                  }, I18n.t("settingsAdvanced.debugTab.apiLogs.request")),
                  react.createElement("pre", {
                    className: "debug-json-block"
                  }, JSON.stringify(log.request, null, 2))
                ),
                // 응답 정보
                expanded && log.response != null && react.createElement("div", { className: "debug-api-detail-group" },
                  react.createElement("div", {
                    className: "debug-json-label"
                  }, I18n.t("settingsAdvanced.debugTab.apiLogs.response")),
                  react.createElement("pre", {
                    className: "debug-json-block"
                  }, JSON.stringify(log.response, null, 2))
                ),
                expanded && log.error != null && react.createElement("div", { className: "debug-api-detail-group" },
                  react.createElement("div", {
                    className: "debug-json-label"
                  }, I18n.t("settingsAdvanced.debugTab.apiLogs.error")),
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
        copied ? I18n.t("settingsAdvanced.debugTab.copied") : I18n.t("settingsAdvanced.debugTab.copyToClipboard")
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
        I18n.t("settingsAdvanced.debugTab.sendToDiscord")
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

// ---------------------------------------------------------------------------
// Shared controls of the settings window
// ---------------------------------------------------------------------------

const getSettingsStepDecimals = (step) => {
  const text = String(step ?? "");
  return text.includes(".") ? text.split(".")[1].length : 0;
};

const formatSettingsNumber = (value, step) => {
  const number = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(number)) return "";
  const decimals = getSettingsStepDecimals(step);
  return decimals
    ? number.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")
    : String(Math.round(number));
};

const snapSettingsNumber = (value, min, max, step) => {
  const safeStep = Number(step) > 0 ? Number(step) : 1;
  const low = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const high = Number.isFinite(Number(max)) ? Number(max) : Infinity;
  const base = Number.isFinite(low) ? low : 0;
  const snapped = Math.round((Number(value) - base) / safeStep) * safeStep + base;
  return Number(Math.min(high, Math.max(low, snapped)).toFixed(getSettingsStepDecimals(safeStep)));
};

const getSettingsFineKeyLabel = () =>
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "") ? "⌥" : "Alt";

const getSettingsWeightSample = () => {
  const language = String(window.I18n?.getCurrentLanguage?.() || "").toLowerCase();
  if (language.startsWith("ko")) return "가";
  if (language.startsWith("ja")) return "あ";
  if (language.startsWith("zh")) return "字";
  return "Aa";
};

// Typed numbers commit on Enter or blur; the wheel never edits them because
// they are text fields. Escape is handled by the settings window: it puts the
// value from before the edit back and leaves the field.
const SettingsNumberField = ({
  value, min, max, step = 1, unit = "", label, disabled, onCommit = () => { }, className = "",
}) => {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : formatSettingsNumber(value, step);
  const commitDraft = (text) => {
    setDraft(null);
    const raw = String(text ?? "").replace(",", ".").trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) return;
    const next = snapSettingsNumber(parsed, min, max, step);
    if (!settingValuesEqual(next, value)) onCommit(next);
  };
  const stepBy = (event, direction) => {
    const base = Number(draft !== null ? draft : value);
    const start = Number.isFinite(base) ? base : Number(min) || 0;
    const next = snapSettingsNumber(start + direction * (Number(step) || 1) * (event.shiftKey ? 10 : 1), min, max, step);
    const formatted = formatSettingsNumber(next, step);
    setDraft(formatted);
    event.currentTarget.dataset.ivBefore = formatted;
    if (!settingValuesEqual(next, value)) onCommit(next);
  };
  return react.createElement(
    "label",
    { className: `settings-value-chip${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}` },
    react.createElement("input", {
      type: "text",
      inputMode: "decimal",
      className: "settings-value-input",
      value: shown,
      disabled,
      spellCheck: false,
      autoComplete: "off",
      "aria-label": label,
      onFocus: (event) => {
        setDraft(formatSettingsNumber(value, step));
        event.target.select?.();
      },
      onChange: (event) => setDraft(event.target.value),
      onBlur: (event) => commitDraft(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          stepBy(event, event.key === "ArrowUp" ? 1 : -1);
        }
      },
    }),
    unit ? react.createElement("span", { className: "settings-unit", "aria-hidden": "true" }, unit) : null
  );
};

// − value + for small whole-number ranges and numeric option lists.
const SettingsStepper = ({ value, values, min, max, step = 1, label, disabled, onChange = () => { } }) => {
  const list = Array.isArray(values) ? values : null;
  const index = list ? list.findIndex((candidate) => String(candidate) === String(value)) : -1;
  const numeric = Number(value);
  const atMin = list ? index <= 0 : Number.isFinite(Number(min)) && numeric <= Number(min);
  const atMax = list ? index === list.length - 1 || index < 0 : Number.isFinite(Number(max)) && numeric >= Number(max);
  const move = (direction) => {
    if (disabled) return;
    if (list) {
      const next = list[Math.min(list.length - 1, Math.max(0, (index < 0 ? 0 : index) + direction))];
      if (next !== undefined && String(next) !== String(value)) onChange(next);
      return;
    }
    const next = snapSettingsNumber((Number.isFinite(numeric) ? numeric : Number(min) || 0) + direction * (Number(step) || 1), min, max, step);
    if (!settingValuesEqual(next, value)) onChange(next);
  };
  return react.createElement(
    "div",
    { className: "settings-stepper", role: "group", "aria-label": label },
    react.createElement(
      "button",
      { type: "button", className: "settings-stepper-btn", "aria-label": `${label} −`, disabled: disabled || atMin, onClick: () => move(-1) },
      react.createElement(SettingsUiIcon, { name: "minus", size: 15 })
    ),
    react.createElement("output", { className: "settings-stepper-value", "aria-live": "polite" }, String(value ?? "")),
    react.createElement(
      "button",
      { type: "button", className: "settings-stepper-btn", "aria-label": `${label} +`, disabled: disabled || atMax, onClick: () => move(1) },
      react.createElement(SettingsUiIcon, { name: "plus", size: 15 })
    )
  );
};

const handleSettingsRadioKeys = (event, options, index, select) => {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  let next = null;
  if (event.key in keys) next = (Math.max(0, index) + keys[event.key] + options.length) % options.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = options.length - 1;
  if (next === null) return;
  event.preventDefault();
  select(options[next].value);
  const group = event.currentTarget.closest('[role="radiogroup"]');
  group?.querySelectorAll('[role="radio"]')?.[next]?.focus?.();
};

// Slide toggle for two to four short choices.
const SettingsSegmented = ({ options, value, onChange = () => { }, label, disabled, compact = false, className = "" }) => {
  const index = options.findIndex((option) => String(option.value) === String(value));
  return react.createElement(
    "div",
    {
      className: `settings-seg${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`,
      role: "radiogroup",
      "aria-label": label,
      "aria-disabled": disabled ? true : undefined,
      style: { "--count": options.length, "--index": Math.max(0, index) },
    },
    react.createElement("span", {
      className: `settings-seg-thumb${index < 0 ? " is-empty" : ""}`,
      "aria-hidden": "true",
    }),
    ...options.map((option, optionIndex) => {
      const active = optionIndex === index;
      return react.createElement(
        "button",
        {
          key: String(option.value),
          type: "button",
          role: "radio",
          "aria-checked": active,
          tabIndex: active || (index < 0 && optionIndex === 0) ? 0 : -1,
          className: `settings-seg-option${active ? " is-on" : ""}`,
          disabled,
          title: option.label,
          "data-setting-key": option.anchor || undefined,
          onClick: () => {
            if (!active) onChange(option.value);
          },
          onKeyDown: (event) => handleSettingsRadioKeys(event, options, index, onChange),
        },
        option.color ? react.createElement("i", { className: "settings-seg-swatch", style: { "--swatch": option.color } }) : null,
        option.icon ? react.createElement(SettingsUiIcon, { name: option.icon, size: 15 }) : null,
        react.createElement("span", { className: "settings-seg-text" }, option.label)
      );
    })
  );
};

// Radio cards for a few choices with longer labels or a description.
const SettingsChoiceCards = ({ options, value, onChange = () => { }, label, disabled, className = "" }) => {
  const index = options.findIndex((option) => String(option.value) === String(value));
  return react.createElement(
    "div",
    { className: `settings-cards${className ? ` ${className}` : ""}`, role: "radiogroup", "aria-label": label },
    ...options.map((option, optionIndex) => {
      const active = optionIndex === index;
      return react.createElement(
        "button",
        {
          key: String(option.value),
          type: "button",
          role: "radio",
          "aria-checked": active,
          tabIndex: active || (index < 0 && optionIndex === 0) ? 0 : -1,
          className: `settings-card-opt${active ? " is-on" : ""}${option.description ? "" : " is-plain"}`,
          disabled,
          "data-setting-key": option.anchor || undefined,
          onClick: () => {
            if (!active) onChange(option.value);
          },
          onKeyDown: (event) => handleSettingsRadioKeys(event, options, index, onChange),
        },
        option.visual || null,
        react.createElement(
          "span",
          { className: "settings-card-title" },
          react.createElement("span", { className: "settings-card-label" }, option.label),
          react.createElement(
            "span",
            { className: "settings-card-check", "aria-hidden": "true" },
            react.createElement(SettingsUiIcon, { name: "check", size: 10 })
          )
        ),
        option.description
          ? react.createElement("span", { className: "settings-card-desc" }, option.description)
          : null
      );
    })
  );
};

// Compact number for table cells: drag sideways to adjust (Shift faster,
// Alt/Option finer), click to type, arrow keys step.
const SettingsScrubField = ({
  value, min = 0, max = 100, step = 1, unit = "", label, weight = false, disabled, onChange = () => { },
}) => {
  const low = Number(min);
  const high = Number(max);
  const toNumber = (input) => {
    const number = Number(input);
    return input !== "" && input !== null && input !== undefined && Number.isFinite(number) ? number : low;
  };
  const [current, setCurrent] = useState(() => toNumber(value));
  const [draft, setDraft] = useState(null);
  const [dragging, setDragging] = useState(false);
  const currentRef = useRef(current);
  const committedRef = useRef(current);
  const dragRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    dragRef.current = null;
    const next = toNumber(value);
    committedRef.current = next;
    currentRef.current = next;
    setCurrent(next);
    setDragging(false);
  }, [value]);

  const showValue = (next) => {
    if (next === currentRef.current) return;
    currentRef.current = next;
    setCurrent(next);
  };
  const emit = (next) => {
    if (disabled) return;
    showValue(next);
    if (next === committedRef.current) return;
    committedRef.current = next;
    onChange(next);
  };
  const span = high - low || 1;
  const percent = Math.min(100, Math.max(0, ((current - low) / span) * 100));
  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    dragRef.current = null;
    setDragging(false);
    if (event?.type !== "pointerup" || disabled) {
      showValue(committedRef.current);
    } else if (drag.moved) {
      emit(currentRef.current);
    } else {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }
  };
  useEffect(() => {
    if (disabled) finishDrag();
  }, [disabled]);
  useEffect(() => {
    const cancel = () => finishDrag();
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      dragRef.current = null;
    };
  }, []);
  const commitDraft = (text) => {
    setDraft(null);
    const raw = String(text ?? "").replace(",", ".").trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) return;
    emit(snapSettingsNumber(parsed, low, high, step));
  };
  const hint = getSettingsText("settingsUi.controls.scrubHint", "Drag sideways to adjust · Shift faster · {fineKey} finer")
    .replace("{fineKey}", getSettingsFineKeyLabel());
  return react.createElement(
    "div",
    {
      className: `settings-scrub${weight ? " is-weight" : ""}${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`,
      style: { "--scrub-percent": `${percent}%` },
      title: `${label} · ${hint}`,
      onPointerDown: (event) => {
        if (disabled || event.button !== 0 || dragRef.current || document.activeElement === inputRef.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = { x: event.clientX, last: event.clientX, value: currentRef.current, moved: false, pointerId: event.pointerId };
        setDragging(true);
      },
      onPointerMove: (event) => {
        const drag = dragRef.current;
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.moved && Math.abs(event.clientX - drag.x) <= 2) return;
        drag.moved = true;
        // Apply each movement separately so changing Shift/Alt mid-drag never jumps.
        const speed = event.shiftKey ? 4 : event.altKey ? 0.2 : 1;
        drag.value = Math.min(high, Math.max(low, drag.value + (event.clientX - drag.last) * (span / 240) * speed));
        drag.last = event.clientX;
        // Keep high-frequency motion local; saving also refreshes every
        // settings row and the playing lyrics, so do that once on release.
        showValue(snapSettingsNumber(drag.value, low, high, step));
      },
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onLostPointerCapture: finishDrag,
    },
    react.createElement("span", { className: "settings-scrub-bar", "aria-hidden": "true" }),
    react.createElement("input", {
      ref: inputRef,
      type: "text",
      inputMode: "decimal",
      className: "settings-scrub-input",
      value: draft !== null ? draft : formatSettingsNumber(current, step),
      disabled,
      spellCheck: false,
      autoComplete: "off",
      "aria-label": label,
      onFocus: (event) => setDraft(event.target.value),
      onChange: (event) => setDraft(event.target.value),
      onBlur: (event) => commitDraft(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const next = snapSettingsNumber(currentRef.current + (event.key === "ArrowUp" ? 1 : -1) * (Number(step) || 1) * (event.shiftKey ? 10 : 1), low, high, step);
          const formatted = formatSettingsNumber(next, step);
          setDraft(formatted);
          event.currentTarget.dataset.ivBefore = formatted;
          emit(next);
        }
      },
    }),
    weight
      ? react.createElement("span", { className: "settings-scrub-tail", "aria-hidden": "true" }, FONT_WEIGHT_NAMES[current] || "")
      : unit
        ? react.createElement("span", { className: "settings-scrub-tail", "aria-hidden": "true" }, String(unit).trim())
        : null
  );
};

const SETTINGS_CUSTOM_FONT_OPTION = "__ivlyrics_custom_font__";

// Compact font choice for table cells: the font list, the current custom
// font, and manual input (the same values ConfigFontSelector accepts).
const SettingsFontPicker = ({ value, label, disabled, allowEmpty = false, onChange = () => { } }) => {
  const safeValue = typeof value === "string" && value.trim() && value.trim() !== "undefined" ? value.trim() : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(safeValue);
  useEffect(() => {
    if (!editing) setDraft(safeValue);
  }, [safeValue, editing]);
  const shown = safeValue || (allowEmpty ? "" : "Pretendard Variable");
  const manualLabel = getSettingsText("settings.fontSelector.custom", "Manual input");
  if (editing) {
    const finish = (text) => {
      setEditing(false);
      const next = String(text ?? "").trim();
      if (next && next !== safeValue) onChange(next);
    };
    return react.createElement("input", {
      className: "settings-font-input config-text-input",
      type: "text",
      value: draft,
      autoFocus: true,
      disabled,
      spellCheck: false,
      placeholder: I18n.t("settings.fontPlaceholder") || "Enter font name (e.g., Arial, Roboto)",
      "aria-label": `${label} ${manualLabel}`,
      onChange: (event) => setDraft(event.target.value),
      onBlur: (event) => finish(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      },
    });
  }
  const options = [];
  if (allowEmpty) options.push(["", getSettingsText("misc.default", "Default")]);
  GOOGLE_FONTS.forEach((font) => options.push([font, font]));
  if (shown && !GOOGLE_FONTS.includes(shown)) options.push([shown, shown]);
  options.push([SETTINGS_CUSTOM_FONT_OPTION, `${manualLabel}…`]);
  return react.createElement(
    "label",
    { className: `settings-select is-compact${disabled ? " is-disabled" : ""}`, title: shown || getSettingsText("misc.default", "Default") },
    react.createElement(
      "select",
      {
        className: "config-select",
        value: shown,
        disabled,
        "aria-label": label,
        style: shown ? { fontFamily: `"${shown.split(",")[0].replace(/["']/g, "").trim()}", inherit` } : undefined,
        onChange: (event) => {
          const next = event.target.value;
          if (next === SETTINGS_CUSTOM_FONT_OPTION) {
            setDraft(safeValue);
            setEditing(true);
            return;
          }
          if (next !== shown) onChange(next);
        },
      },
      ...options.map(([optionValue, optionLabel]) =>
        react.createElement("option", { key: optionValue || "default", value: optionValue }, optionLabel)
      )
    ),
    react.createElement(SettingsUiIcon, { name: "down", size: 14, className: "settings-select-chevron" })
  );
};


const ConfigButton = ({ name, settingKey, info, text, searchable = true, onChange = () => { } }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row",
      "data-setting-key": settingKey,
      "data-search-exclude": searchable === false ? "true" : undefined,
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
    const activeRef = useRef(defaultValue);

    useEffect(() => {
      activeRef.current = defaultValue;
      setActive(defaultValue);
    }, [defaultValue]);

    const toggleState = useCallback(() => {
      if (disabled) return;
      const newState = !activeRef.current;
      activeRef.current = newState;
      setActive(newState);
      // Persist from the input event, not a replayable React state updater.
      onChange(newState);
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
  settingKey,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  disabled,
  className = "",
  ariaValueFormatter,
  variant = "range",
  onChange = () => { },
}) => {
  const toNumber = (input) => {
    const number = Number(input);
    return input !== "" && input !== null && input !== undefined && Number.isFinite(number)
      ? number
      : Number(min) || 0;
  };
  const [value, setValue] = useState(() => toNumber(defaultValue));
  const currentRef = useRef(value);
  const committedRef = useRef(value);
  const dragRef = useRef(null);
  useEffect(() => {
    dragRef.current = null;
    const next = toNumber(defaultValue);
    currentRef.current = next;
    committedRef.current = next;
    setValue(next);
  }, [defaultValue]);

  const showValue = (next) => {
    currentRef.current = next;
    setValue(next);
  };
  const updateValue = useCallback(
    (newValue) => {
      if (disabled) return;
      currentRef.current = newValue;
      setValue(newValue);
      if (newValue === committedRef.current) return;
      committedRef.current = newValue;
      onChange(newValue);
    },
    [onChange, disabled]
  );

  const handleInput = useCallback(
    (event) => {
      if (disabled) return;
      const next = Number(event.target.value);
      if (dragRef.current) showValue(next);
      else updateValue(next);
    },
    [updateValue, disabled]
  );
  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    dragRef.current = null;
    if (event?.type === "pointerup" && !disabled) updateValue(currentRef.current);
    else showValue(committedRef.current);
  };
  useEffect(() => {
    if (disabled) finishDrag();
  }, [disabled]);
  useEffect(() => {
    const cancel = () => finishDrag();
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      dragRef.current = null;
    };
  }, []);

  const span = max - min || 1;
  const progress = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const unitText = String(unit || "").trim();
  const defaultNumber = settingKey && hasSettingDefault(settingKey) && getSettingDefaultValue(settingKey) !== ""
    ? Number(getSettingDefaultValue(settingKey))
    : NaN;
  const showDefault = Number.isFinite(defaultNumber) && defaultNumber >= min && defaultNumber <= max;
  const isWeight = variant === "weight";

  if (variant === "stepper") {
    return react.createElement(SettingsStepper, {
      value,
      min,
      max,
      step,
      label: name,
      disabled,
      onChange: updateValue,
    });
  }

  const slider = react.createElement(
    "div",
    {
      className: `slider-container settings-range${isWeight ? " settings-weight" : ""}${className ? ` ${className}` : ""}${disabled ? " disabled" : ""}`,
    },
    isWeight
      ? react.createElement("span", {
        className: "settings-weight-sample",
        style: { fontWeight: value },
        "aria-hidden": "true",
      }, getSettingsWeightSample())
      : null,
    react.createElement(
      "div",
      { className: "settings-range-track" },
      react.createElement("input", {
        type: "range",
        min,
        max,
        step,
        value,
        disabled,
        onChange: handleInput,
        onPointerDown: (event) => {
          if (disabled || event.button !== 0 || dragRef.current) return;
          dragRef.current = { pointerId: event.pointerId };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        },
        onPointerUp: finishDrag,
        onPointerCancel: finishDrag,
        onLostPointerCapture: finishDrag,
        "aria-label": name,
        "aria-valuetext": ariaValueFormatter
          ? ariaValueFormatter(Number(value))
          : `${value}${unit}`,
        className: "config-slider",
        style: { "--progress-percent": `${progress}%` },
      }),
      showDefault
        ? react.createElement("span", {
          className: "settings-range-default",
          style: { "--default-percent": ((defaultNumber - min) / span) * 100 },
          "aria-hidden": "true",
        })
        : null
    ),
    isWeight
      ? react.createElement("span", { className: "settings-weight-name" }, FONT_WEIGHT_NAMES[value] || String(value))
      : react.createElement(SettingsNumberField, {
        value,
        min,
        max,
        step,
        unit: unitText,
        label: name,
        disabled,
        onCommit: updateValue,
      })
  );

  if (variant !== "fps") return slider;

  // Frame cap: a large readout, the slider and the common refresh rates.
  const presets = [30, 60, 90, 120, 144, 165, 240].filter((mark) => mark >= min && mark <= max);
  return react.createElement(
    "div",
    { className: "settings-fps" },
    react.createElement(
      "div",
      { className: "settings-fps-top" },
      react.createElement(
        "div",
        { className: "settings-fps-value", "aria-hidden": "true" },
        String(value),
        react.createElement("small", null, unitText)
      ),
      slider
    ),
    react.createElement(
      "div",
      { className: "settings-presets", role: "group", "aria-label": name },
      ...presets.map((mark) =>
        react.createElement(
          "button",
          {
            key: mark,
            type: "button",
            className: `settings-preset-btn${Number(value) === mark ? " is-on" : ""}`,
            "aria-pressed": Number(value) === mark,
            disabled,
            onClick: () => updateValue(mark),
          },
          String(mark)
        )
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
    variant: "weight",
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
  const ariaParams = { name: label || "" };
  const pickerLabel = I18n.t("settingsUi.controls.colorPickerAriaLabel", ariaParams).trim();
  const hexLabel = I18n.t("settingsUi.controls.colorHexAriaLabel", ariaParams).trim();

  return react.createElement(
    "div",
    { className: `config-color-control${isValid ? "" : " invalid"}` },
    react.createElement(
      "span",
      { className: "config-color-swatch", style: { "--swatch-color": normalizedColor || "transparent" } },
      react.createElement("input", {
        type: "color",
        value: normalizedColor || "#000000",
        onChange: (event) => {
          const nextColor = event.target.value.toLowerCase();
          onDraftChange(nextColor);
          onCommit(nextColor);
        },
        className: "config-color-picker",
        "aria-label": pickerLabel,
        title: pickerLabel,
      })
    ),
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
      "aria-label": hexLabel,
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
      const changed = normalizedColor !== committedValueRef.current;
      committedValueRef.current = normalizedColor;
      setValue(normalizedColor);
      if (changed) onChange(normalizedColor);
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
      className: "setting-row settings-note-row",
      "data-setting-key": settingKey,
      "data-control": "note",
    },
    react.createElement(
      "div",
      { className: "settings-note is-warn" },
      react.createElement(SettingsUiIcon, { name: "warn", size: 16 }),
      react.createElement(
        "div",
        { className: "settings-note-body" },
        react.createElement("div", { className: "setting-name" }, I18n.t("settings.solidBackgroundInUse")),
        react.createElement("div", { className: "setting-description" }, message)
      )
    )
  );
};

// 정보 표시용 컴포넌트 (헬퍼 프로그램 안내 등)
const ConfigInfo = ({ message, buttonText, onButtonClick, settingKey }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row config-info-row settings-note-row",
      "data-setting-key": settingKey,
      "data-control": "note",
    },
    react.createElement(
      "div",
      { className: "settings-note is-info" },
      react.createElement(SettingsUiIcon, { name: "info", size: 16 }),
      react.createElement(
        "div",
        { className: "settings-note-body" },
        react.createElement("div", { className: "setting-description config-info-message" }, message),
        buttonText && onButtonClick && react.createElement(
          "div",
          { className: "settings-note-actions" },
          react.createElement(
            "button",
            { type: "button", className: "btn btn-sm", onClick: onButtonClick },
            buttonText
          )
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

  const renderPresetRow = (preset) =>
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
                    border: "1px solid var(--settings-line-2)",
                    background: "var(--settings-surface-2)",
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
              );

  const renderPresetsSaveBlock = () =>
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
      );
  const renderPresetsSavedListBlock = () =>
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
          : presets.map((preset) => renderPresetRow(preset))
      );
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
      renderPresetsSaveBlock(),
      renderPresetsSavedListBlock()
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
          className: `setting-description settings-status-box is-${messageType || "info"}`,
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
  presentation,
  iconMap,
  swatchMap,
  visualMap,
  cardsClassName = "",
  compact = false,
  onChange = () => { },
}) => {
  const [value, setValue] = useState(defaultValue);

  const setValueCallback = useCallback(
    (rawValue) => {
      if (disabled) return;
      let value = rawValue;
      if (!Number.isNaN(Number(value))) {
        value = Number.parseInt(value);
      }
      setValue(value);
      onChange(value);
    },
    [disabled, onChange]
  );

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const entries = getSettingsSelectionEntries(options);
  if (!entries.length) return null;

  const kind = compact ? "select" : resolveSettingsSelectionPresentation(entries, presentation);
  const choices = entries.map(([optionKey, optionLabel]) => ({
    value: optionKey,
    label: optionLabel,
    icon: iconMap?.[optionKey],
    color: swatchMap?.[optionKey],
    visual: visualMap?.[optionKey],
  }));

  if (kind === "seg") {
    return react.createElement(SettingsSegmented, {
      options: choices,
      value: value === undefined || value === null ? "" : String(value),
      label: name,
      disabled,
      onChange: setValueCallback,
    });
  }
  if (kind === "cards") {
    return react.createElement(SettingsChoiceCards, {
      options: choices,
      value: value === undefined || value === null ? "" : String(value),
      label: name,
      disabled,
      className: cardsClassName,
      onChange: setValueCallback,
    });
  }
  if (kind === "stepper") {
    return react.createElement(SettingsStepper, {
      value: value === undefined || value === null ? "" : String(value),
      values: entries.map(([optionKey]) => optionKey),
      label: name,
      disabled,
      onChange: setValueCallback,
    });
  }

  return react.createElement(
    "label",
    { className: `settings-select${compact ? " is-compact" : ""}${disabled ? " is-disabled" : ""}` },
    react.createElement(
      "select",
      {
        className: "config-select",
        value,
        disabled,
        "aria-label": name,
        onChange: (event) => setValueCallback(event.target.value),
      },
      ...entries.map(([optionKey, optionLabel]) =>
        react.createElement(
          "option",
          {
            key: optionKey,
            value: optionKey,
          },
          optionLabel
        )
      )
    ),
    react.createElement(SettingsUiIcon, { name: "down", size: 14, className: "settings-select-chevron" })
  );
};

const getSettingsSelectionEntries = (options) =>
  Object.keys(options || {}).map((optionKey) => [optionKey, String(options[optionKey])]);

const SETTINGS_WIDE_GLYPH_PATTERN = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;
const measureSettingsLabelUnits = (text) =>
  Array.from(String(text || "")).reduce(
    (sum, character) => sum + (SETTINGS_WIDE_GLYPH_PATTERN.test(character) ? 1 : 0.58),
    0
  );

// One place decides how a choice is shown, so rows can lay out the control
// inline (slide toggle, list) or under the label (cards).
const resolveSettingsSelectionPresentation = (entries, presentation) => {
  if (presentation) return presentation;
  if (!entries.length) return "select";
  if (entries.length > 5) {
    return entries.every(([optionKey]) => /^-?d+$/.test(optionKey)) ? "stepper" : "select";
  }
  if (entries.length <= 4) {
    const budget = (360 / entries.length / 14 - 1) * 1.75;
    return entries.every(([, optionLabel]) => measureSettingsLabelUnits(optionLabel) <= budget)
      ? "seg"
      : "cards";
  }
  return "select";
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
    // Same markup as the in-lyrics break indicator (Pages.js, shared bundle scope).
    createBreakIconChildren(icon)
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
      className: `setting-row instrumental-break-picker-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
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
      className: `setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
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
        className: `setting-row config-font-setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
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

const getLyricsTypographyColumnLabel = (role) => {
  if (role === "original") return getSettingsText("lyricsCacheEditor.original", "Original");
  if (role === "phonetic") return getSettingsText("menu.pronunciation", "Pronunciation");
  if (role === "translation") return getSettingsText("translationMenu.translation", "Translation");
  return getSettingsText("translationMenu.furigana", "Furigana");
};

// Columns of the lyric-layer table: one per layer with the items (and save
// handlers) of the former per-layer sections. Labels and current values are
// resolved when rendering, so language and config changes apply.
const buildLyricsTypographyColumns = ({ vinyl = false, onChange, furiganaOnChange } = {}) => {
  const columns = LYRICS_TYPOGRAPHY_SECTIONS.map((section) => {
    const styleKey = `settingsAdvanced.${section.style}`;
    const fontKey = `${section.role}-font-family`;
    const items = createLyricsTypographyItems(section, vinyl);
    if (!vinyl) {
      items.unshift({
        desc: I18n.t("settingsAdvanced.originalStyle.fontFamily"),
        info: I18n.t(`${styleKey}.fontFamilyDesc`),
        key: fontKey,
        type: ConfigFontSelector,
        defaultValue: CONFIG.visual[fontKey] || "Pretendard Variable",
      });
    }
    return {
      id: section.role,
      anchor: `${vinyl ? "vinyl-" : ""}${section.section}`,
      label: getLyricsTypographyColumnLabel(section.role),
      subtitle: I18n.t(`${styleKey}.subtitle`),
      color: `var(--settings-layer-${section.role})`,
      items,
      onChange,
    };
  });
  if (!vinyl) {
    columns.push({
      id: "furigana",
      anchor: "furigana-style",
      label: getLyricsTypographyColumnLabel("furigana"),
      subtitle: I18n.t("settingsAdvanced.furiganaStyle.subtitle"),
      color: "var(--settings-layer-furigana)",
      toggle: {
        key: "furigana-enabled",
        desc: I18n.t("settingsAdvanced.languageDetection.furigana.label"),
        info: I18n.t("settingsAdvanced.languageDetection.furigana.desc"),
      },
      onChange: furiganaOnChange || onChange,
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
    });
  }
  return columns;
};

const getLyricsTypographyRows = () => [
  { id: "font", label: I18n.t("settingsAdvanced.originalStyle.fontFamily") },
  { id: "size", label: I18n.t("settingsAdvanced.originalStyle.fontSize.label") },
  { id: "weight", label: I18n.t("settingsAdvanced.originalStyle.fontWeight.label") },
  { id: "opacity", label: I18n.t("settingsAdvanced.originalStyle.opacity.label") },
  { id: "spacing", label: I18n.t("settingsAdvanced.pronunciationStyle.gap.label") },
  { id: "letterSpacing", label: I18n.t("settingsAdvanced.originalStyle.letterSpacing.label") },
  { id: "outlineWidth", label: I18n.t("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness" },
  { id: "outlineColor", label: I18n.t("settingsAdvanced.textOutline.color.label") || "Text Outline Color" },
  { id: "hyphen", label: I18n.t("settingsAdvanced.pronunciationStyle.hyphenReplace.label") },
];

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
  useSettingsConfigRevision("ivLyrics:panel-preview-update");
  const visual = CONFIG.visual || {};
  if (!getSettingsPreviewFlag("panel-lyrics-enabled", true)) return null;

  const parsePanelNumber = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };
  const parsePanelFloat = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const fontFamily = visual["panel-lyrics-font-family"] || "Pretendard Variable";
  const originalFont = visual["panel-lyrics-original-font"] || "";
  const phoneticFont = visual["panel-lyrics-phonetic-font"] || "";
  const translationFont = visual["panel-lyrics-translation-font"] || "";
  const fontScale = parsePanelNumber(visual["panel-font-scale"], 100);
  const originalSize = parsePanelNumber(visual["panel-lyrics-original-size"], 26);
  const phoneticSize = parsePanelNumber(visual["panel-lyrics-phonetic-size"], 13);
  const translationSize = parsePanelNumber(visual["panel-lyrics-translation-size"], 13);
  const originalOutlineWidth = parsePanelFloat(visual["panel-lyrics-original-outline-width"], 0);
  const originalOutlineColor = visual["panel-lyrics-original-outline-color"] || "#000000";
  const phoneticOutlineWidth = parsePanelFloat(visual["panel-lyrics-phonetic-outline-width"], 0);
  const phoneticOutlineColor = visual["panel-lyrics-phonetic-outline-color"] || "#000000";
  const translationOutlineWidth = parsePanelFloat(visual["panel-lyrics-translation-outline-width"], 0);
  const translationOutlineColor = visual["panel-lyrics-translation-outline-color"] || "#000000";

  // 배경 설정
  const bgType = visual["panel-bg-type"] || "album";
  const bgColor = visual["panel-bg-color"] || "#6366f1";
  const bgGradient1 = visual["panel-bg-gradient-1"] || "#6366f1";
  const bgGradient2 = visual["panel-bg-gradient-2"] || "#a855f7";
  const bgOpacity = parsePanelNumber(visual["panel-bg-opacity"], 30);

  // Border 설정
  const borderEnabled = getSettingsPreviewFlag("panel-border-enabled", false);
  const borderColor = visual["panel-border-color"] || "#ffffff";
  const borderOpacity = parsePanelNumber(visual["panel-border-opacity"], 10);
  const supplements = getSettingsPreviewSupplementVisibility();

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
  const previewLineSlotHeight = Math.round(Math.max(52, Math.min(72, (originalSize || 26) * (scale > 0 ? scale : 1) * 2.9)));
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

  const renderPreviewLine = (line, idx) =>
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
                  fontWeight: 700,
                  color: line.active ? "#ffffff" : "rgba(255, 255, 255, 0.7)",
                  lineHeight: 1.4,
                  fontFamily: originalFontFamily,
                  textShadow: createOutsideTextOutlineShadow(originalOutlineWidth, originalOutlineColor),
                }
              },
              line.original
            ),
            // 발음 (두 번째)
            supplements.pronunciation && react.createElement(
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
            supplements.translation && react.createElement(
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
          );

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
          padding: "40px 16px 16px",
          position: "relative",
          overflow: "hidden",
          minHeight: "280px",
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
        "span",
        { className: "settings-preview-tag" },
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
        ...sampleLyrics.map((line, idx) => renderPreviewLine(line, idx))
      )
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
  const dragCleanupRef = useRef(null);

  useEffect(() => {
    dragCleanupRef.current?.();
    const nextPoints = normalizeKaraokeFillCurvePoints(defaultValue);
    pendingPointsRef.current = nextPoints;
    setPoints(nextPoints);
    return () => dragCleanupRef.current?.();
  }, [defaultValue, disabled]);

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
    if (disabled || event.button !== 0 || pointIndex <= 0 || pointIndex >= points.length - 1) {
      return;
    }

    dragCleanupRef.current?.();
    const originalPoints = pendingPointsRef.current;
    const pointerId = event.pointerId;
    event.preventDefault();
    updatePointFromPointer(pointIndex, event);

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId === pointerId) updatePointFromPointer(pointIndex, moveEvent);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("blur", handleCancel);
      dragCleanupRef.current = null;
    };
    const handlePointerUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      commitPoints(pendingPointsRef.current);
    };
    const handleCancel = (cancelEvent) => {
      if (cancelEvent.type === "pointercancel" && cancelEvent.pointerId !== pointerId) return;
      cleanup();
      pendingPointsRef.current = originalPoints;
      setPoints(originalPoints);
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handleCancel);
    window.addEventListener("blur", handleCancel);
  };

  const resetCurve = () => {
    commitPoints(KARAOKE_FILL_CURVE_DEFAULT_POINTS);
  };

  return react.createElement(
    "div",
    {
      className: `setting-row karaoke-fill-curve-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
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
            disabled,
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
      className: `setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
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
      className: `setting-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
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


const getSettingsRowKind = (item) => {
  if (item.type === ConfigSlider) return "toggle";
  if (item.type === ConfigFontWeightSlider) return "weight";
  if (item.type === ConfigSliderRange) {
    if (item.presentation === "stepper") return "stepper";
    if (item.presentation === "fps") return "fps";
    return "range";
  }
  if (item.type === ConfigSelection) {
    return resolveSettingsSelectionPresentation(getSettingsSelectionEntries(item.options), item.presentation);
  }
  if (item.type === ConfigColorPicker) return "color";
  if (item.type === ColorPresetSelector) return "color-presets";
  return "custom";
};

// Controls that need the full row width sit under their label.
const SETTINGS_STACKED_ROW_KINDS = new Set(["cards", "color-presets", "fps", "custom"]);

const settingsToggleRowPointers = new WeakMap();

const handleSettingsToggleRowPointerDown = (event) => {
  settingsToggleRowPointers.set(event.currentTarget, { x: event.clientX, y: event.clientY });
};

// On/off rows toggle from their label and description too. A press that
// wandered (drag, text selection) is not a click.
const handleSettingsToggleRowClick = (event) => {
  const area = event.currentTarget;
  if (event.target?.closest?.("a, button, input, select, textarea, label, [role='switch']")) return;
  const down = settingsToggleRowPointers.get(area);
  if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
  const selection = window.getSelection?.();
  if (selection && String(selection)) return;
  const row = area.closest(".setting-row");
  if (!row || row.classList.contains("is-disabled")) return;
  const toggle = row.querySelector(".setting-row-right .switch-checkbox");
  if (toggle && !toggle.disabled) toggle.click();
};

const SETTINGS_SELF_RENDERED_ITEM_TYPES = () => [
  ConfigButton,
  ConfigInput,
  ConfigHotkey,
  ConfigWarning,
  ConfigInfo,
  ConfigKeyList,
  ConfigFontSelector,
  ConfigInstrumentalBreakIconPicker,
  ConfigKaraokeFillCurveEditor,
  VideoHelperToggle,
  LyricsHelperToggle,
];

const renderSettingsJumpLink = (jump) =>
  jump && react.createElement(
    "button",
    {
      type: "button",
      className: "settings-jump-link",
      onClick: jump.onClick,
    },
    react.createElement("span", null, jump.label),
    react.createElement(SettingsUiIcon, { name: "right", size: 13 })
  );

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

  const selfRenderedTypes = SETTINGS_SELF_RENDERED_ITEM_TYPES();
  const resetLabel = getSettingsText("creatorProfile.resetDecoration", "Reset to default");

  const renderedItems = (itemList || []).map((item, index) => {
    if (!item || (item.when && !item.when())) {
      return;
    }

    const onChangeItem = item.onChange || onChange;
    // Changed-setting rows disappear as they are reset. Keep each control's
    // local state with its setting instead of reusing the following row's state.
    const rowKey = item.key || index;
    const isDisabled =
      typeof item.disabled === "function"
        ? item.disabled()
        : item.disabled || false;

    // type이 "info"인 경우 - 정보 표시만 (토글 없음)
    if (item.type === "info") {
      return react.createElement(
        "div",
        {
          key: rowKey,
          className: "setting-row is-inline",
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
    if (selfRenderedTypes.includes(item.type)) {
      // item.onChange가 있으면 그것을 우선 사용 (업데이트 확인, 내보내기 등 커스텀 핸들러)
      const itemOnChange = item.onChange || ((name, value, event) => {
        if (!isDisabled) {
          onChangeItem(item.key || name, value, event);
          forceUpdate({});
        }
      });

      const selfRenderedRow = react.createElement(item.type, {
        ...item,
        key: rowKey,
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
      if (!item.jump) return selfRenderedRow;
      return react.createElement(
        react.Fragment,
        { key: rowKey },
        selfRenderedRow,
        react.createElement("div", { className: "settings-jump-row" }, renderSettingsJumpLink(item.jump))
      );
    }

    const kind = getSettingsRowKind(item);
    const stacked = SETTINGS_STACKED_ROW_KINDS.has(kind) || item.layout === "stack";
    const changed = isSettingChanged(item.key);
    const canReset = kind !== "toggle" && !item.noReset && hasSettingDefault(item.key);
    const controlProps = {
      ...item,
      name: item.desc,
      settingKey: item.key,
      disabled: isDisabled,
      presentation: kind === "custom" ? item.presentation : kind,
      variant: kind === "stepper" || kind === "fps" ? kind : item.variant,
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
    };
    delete controlProps.key;

    return react.createElement(
      "div",
      {
        key: rowKey,
        className: [
          "setting-row",
          stacked ? "is-stack" : "is-inline",
          kind === "toggle" ? "is-toggle-row" : "",
          changed ? "is-changed" : "",
          isDisabled ? "is-disabled" : "",
        ].filter(Boolean).join(" "),
        "data-setting-key": item.key,
        "data-control": kind,
        "data-search-exclude": item.searchable === false ? "true" : undefined,
      },
      react.createElement(
        "div",
        { className: "setting-row-content" },
        react.createElement(
          "div",
          {
            className: "setting-row-left",
            onPointerDown: kind === "toggle" ? handleSettingsToggleRowPointerDown : undefined,
            onClick: kind === "toggle" ? handleSettingsToggleRowClick : undefined,
          },
          react.createElement(
            "div",
            { className: "setting-name-row" },
            react.createElement("div", { className: "setting-name" }, item.desc),
            item.cost && react.createElement("span", { className: "settings-cost-tag" }, "GPU")
          ),
          item.info &&
          react.createElement("div", {
            className: "setting-description",
            dangerouslySetInnerHTML: {
              __html: item.info,
            },
          }),
          renderSettingsJumpLink(item.jump)
        ),
        react.createElement(
          "div",
          { className: "setting-row-right" },
          react.createElement(item.type, controlProps),
          canReset && react.createElement(
            "button",
            {
              type: "button",
              className: "settings-reset-btn",
              title: resetLabel,
              "aria-label": `${item.desc} · ${resetLabel}`,
              "aria-hidden": changed ? undefined : "true",
              tabIndex: changed ? 0 : -1,
              disabled: isDisabled,
              onClick: () => {
                if (isDisabled) return;
                onChangeItem(item.key, getSettingDefaultValue(item.key));
                forceUpdate({});
                window.dispatchEvent(new CustomEvent("ivLyrics:settings-refresh", {
                  detail: { key: item.key },
                }));
              },
            },
            react.createElement(SettingsUiIcon, { name: "reset", size: 14 })
          )
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

const getEffectiveReducedMotionPreference = () =>
  CONFIG.visual["reduce-motion"] === true;

const saveSettingsTranslationTargetLanguage = (name, value) => {
  if (settingValuesEqual(CONFIG.visual[name], value)) return;
  CONFIG.visual[name] = value;
  StorageManager.saveConfig(name, value);
  // The existing config channel refreshes panel lyrics and shared snapshots.
  window.dispatchEvent(new CustomEvent("ivLyrics", {
    detail: { type: "config", name, value },
  }));
  // Rebuild the current presentation without deleting saved lyrics or
  // restarting Spotify (which also closes this settings window).
  if (Spicetify.Player.data?.item?.uri) reloadLyrics?.(false);
};

const getSettingsMotionDurationMs = () =>
  getEffectiveReducedMotionPreference() ? 24 : 280;

const getSettingsText = (key, fallback) => {
  const value = I18n?.t?.(key);
  return !value || value === key ? fallback : value;
};

// ---------------------------------------------------------------------------
// Settings window design system
// ---------------------------------------------------------------------------

// Defaults of the CONFIG.visual settings, read from the CONFIG literal in
// index.js with empty storage. They drive the changed-settings counter, the
// per-row reset button and the default marker on sliders. The background
// presets are one choice (see SETTINGS_DEFAULT_BACKGROUND_MODE) and the
// interface language depends on the environment, so neither is listed.
// tests/settings_defaults_parity.test.mjs keeps this table in sync with index.js.
const SETTINGS_DEFAULT_VALUES = Object.freeze({
  "playbar-button": false, "fullscreen-button": false, "panel-lyrics-enabled": true,
  "panel-font-scale": "100", "panel-lyrics-font-family": "Pretendard Variable",
  "panel-lyrics-original-font": "", "panel-lyrics-phonetic-font": "", "panel-lyrics-translation-font": "",
  "panel-lyrics-original-size": "26", "panel-lyrics-phonetic-size": "13",
  "panel-lyrics-translation-size": "13", "panel-lyrics-original-outline-width": "0",
  "panel-lyrics-original-outline-color": "#000000", "panel-lyrics-phonetic-outline-width": "0",
  "panel-lyrics-phonetic-outline-color": "#000000", "panel-lyrics-translation-outline-width": "0",
  "panel-lyrics-translation-outline-color": "#000000", "panel-bg-type": "album",
  "panel-bg-color": "#6366f1", "panel-bg-gradient-1": "#6366f1", "panel-bg-gradient-2": "#a855f7",
  "panel-bg-opacity": "30", "panel-border-enabled": false, "panel-border-color": "#ffffff",
  "panel-border-opacity": "10", "multi-vocal-speaker-color-male-1": "#a8ccff",
  "multi-vocal-speaker-color-male-2": "#9ae8d4", "multi-vocal-speaker-color-male-3": "#bfe8ff",
  "multi-vocal-speaker-color-male-4": "#7fb5e6", "multi-vocal-speaker-color-male-5": "#6cb8b8",
  "multi-vocal-speaker-color-female-1": "#ffb8c7", "multi-vocal-speaker-color-female-2": "#ffd6b3",
  "multi-vocal-speaker-color-female-3": "#f6c8ff", "multi-vocal-speaker-color-female-4": "#e6b4d4",
  "multi-vocal-speaker-color-female-5": "#f6e5a5", "multi-vocal-speaker-color-duet-1": "#e4d8ff",
  "multi-vocal-speaker-color-duet-2": "#d6e4ff", "multi-vocal-speaker-color-duet-3": "#ffddf2",
  "multi-vocal-speaker-color-duet-4": "#bfaeff", "multi-vocal-speaker-color-duet-5": "#9d8cf2",
  "sync-data-custom-speaker-colors-enabled": true, "album-bg-blur": "20", "reduce-motion": false,
  "performance-frame-rate": 60, "instrumental-break-icon": "equalizer",
  "instrumental-break-show-label": false, "instrumental-break-auto-detect": true,
  "instrumental-break-label-font-family": "", "instrumental-break-label-font-size": "",
  "instrumental-break-label-font-weight": "", "instrumental-break-label-opacity": "",
  "instrumental-break-label-outline-width": "0", "instrumental-break-label-outline-color": "#000000",
  "instrumental-break-animation-speed": 100, "background-brightness": 30, "video-helper-enabled": false,
  "lyrics-helper-enabled": false, "video-blur": "5", "video-cover": false, "video-scale": 105,
  "video-fallback-background": "album-cover", "solid-background-color": "#1e3a8a", "noise": true,
  "alignment": "center", "lines-before": 0, "lines-after": 2,
  "original-font-family": "Pretendard Variable", "phonetic-font-family": "Pretendard Variable",
  "translation-font-family": "Pretendard Variable",
  "cultural-annotations-font-family": "Pretendard Variable",
  "cultural-annotations-vinyl-font-family": "Pretendard Variable", "original-outline-width": "0",
  "original-outline-color": "#000000", "phonetic-outline-width": "0", "phonetic-outline-color": "#000000",
  "translation-outline-width": "0", "translation-outline-color": "#000000", "furigana-outline-width": "0",
  "furigana-outline-color": "#000000", "cultural-annotations-outline-width": "0",
  "cultural-annotations-outline-color": "#000000", "cultural-annotations-vinyl-outline-width": "0",
  "cultural-annotations-vinyl-outline-color": "#000000", "original-font-weight": 600,
  "original-font-size": 44, "translation-font-weight": 300, "translation-font-size": 22,
  "cultural-annotations-font-weight": 300, "cultural-annotations-font-size": 14,
  "cultural-annotations-vinyl-font-weight": 300, "cultural-annotations-vinyl-font-size": 12,
  "translation-spacing": "0", "phonetic-font-weight": "100", "phonetic-font-size": "16",
  "phonetic-opacity": "70", "phonetic-spacing": "-1", "phonetic-hyphen-replace": "keep",
  "original-letter-spacing": "0", "phonetic-letter-spacing": "0", "translation-letter-spacing": "0",
  "furigana-font-weight": "300", "furigana-font-size": "14", "furigana-opacity": "80",
  "furigana-spacing": "2", "text-shadow-enabled": true, "text-shadow-color": "#000000",
  "text-shadow-opacity": 50, "text-shadow-blur": 2, "original-opacity": 95, "translation-opacity": 85,
  "cultural-annotations-opacity": 60, "cultural-annotations-vinyl-opacity": 60,
  "translate:target-language": "auto", "cultural-annotations-enabled": false, "furigana-enabled": false,
  "ja-detect-threshold": 40, "hans-detect-threshold": 40, "fade-blur": true, "highlight-mode": false,
  "highlight-intensity": 70, "karaoke-bounce": true, "karaoke-motion-style": "classic",
  "karaoke-line-transition": true,
  "karaoke-text-effects": true, "karaoke-mode-enabled": true, "sync-creator-auto-boundary-chars": true,
  "karaoke-fill-correction-curve": "[[0,0],[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]]",
  "spotify-fake-karaoke-enabled": false, "pseudo-karaoke-render-advance": 250,
  "prefer-sync-data-provider": true, "prefer-lyrics-type-over-provider-order": true,
  "prefetch-enabled": true, "prefetch-video-enabled": true, "prefetch-word-details-enabled": true,
  "quick-sync-controls-enabled": true, "seek-fade-compensation": false, "fullscreen-key": "f12",
  "translate-metadata": false,
  "translate-metadata-mode": "translated", "fullscreen-two-column": true,
  "fullscreen-layout-reverse": false, "fullscreen-show-album": true, "fullscreen-show-info": true,
  "fullscreen-center-when-no-lyrics": true, "fullscreen-album-size": "400",
  "fullscreen-album-radius": "12", "fullscreen-album-open-lp": true,
  "fullscreen-vinyl-album-size": 100,
  "fullscreen-vinyl-record-size": 100, "fullscreen-vinyl-background-blur": 0,
  "fullscreen-vinyl-animations": true, "fullscreen-vinyl-track-change-animation": true,
  "fullscreen-vinyl-rotation-speed": 100, "fullscreen-vinyl-center-rotation": true,
  "fullscreen-vinyl-lyrics-enabled": true, "fullscreen-focus-presentation": "vinyl",
  "fullscreen-cd-disc-size": 100, "fullscreen-cd-rotation-enabled": true,
  "fullscreen-cd-rotation-speed": 100, "fullscreen-cd-visualizer-enabled": true,
  "fullscreen-cd-visualizer-style": "bars", "fullscreen-cd-visualizer-color-mode": "album",
  "fullscreen-cd-visualizer-album-gradient": true,
  "fullscreen-cd-visualizer-color": "#ffffff", "fullscreen-cd-visualizer-sensitivity": 100,
  "fullscreen-cd-visualizer-density": 64, "fullscreen-cd-visualizer-thickness": 2,
  "fullscreen-cd-visualizer-mirror": false,
  "fullscreen-vinyl-tonearm-style": "s", "fullscreen-vinyl-tonearm-finish": "white",
  "fullscreen-vinyl-tonearm-size": 100, "fullscreen-vinyl-original-font-family": "Pretendard Variable",
  "fullscreen-vinyl-original-font-size": 31, "fullscreen-vinyl-original-font-weight": 600,
  "fullscreen-vinyl-original-opacity": 95, "fullscreen-vinyl-original-letter-spacing": 0,
  "fullscreen-vinyl-original-outline-width": "0", "fullscreen-vinyl-original-outline-color": "#000000",
  "fullscreen-vinyl-phonetic-font-family": "Pretendard Variable",
  "fullscreen-vinyl-phonetic-font-size": 11, "fullscreen-vinyl-phonetic-font-weight": 100,
  "fullscreen-vinyl-phonetic-opacity": 70, "fullscreen-vinyl-phonetic-spacing": -1,
  "fullscreen-vinyl-phonetic-letter-spacing": 0, "fullscreen-vinyl-phonetic-outline-width": "0",
  "fullscreen-vinyl-phonetic-outline-color": "#000000",
  "fullscreen-vinyl-translation-font-family": "Pretendard Variable",
  "fullscreen-vinyl-translation-font-size": 15, "fullscreen-vinyl-translation-font-weight": 300,
  "fullscreen-vinyl-translation-opacity": 85, "fullscreen-vinyl-translation-spacing": 0,
  "fullscreen-vinyl-translation-letter-spacing": 0, "fullscreen-vinyl-translation-outline-width": "0",
  "fullscreen-vinyl-translation-outline-color": "#000000",
  "fullscreen-video-stage-original-font-family": "Pretendard Variable",
  "fullscreen-video-stage-phonetic-font-family": "Pretendard Variable",
  "fullscreen-video-stage-translation-font-family": "Pretendard Variable",
  "fullscreen-video-stage-cultural-font-family": "Pretendard Variable",
  "fullscreen-video-stage-lyric-background-color": "#000000",
  "fullscreen-video-stage-lyric-background-opacity": 46, "fullscreen-title-size": "48",
  "fullscreen-title-outline-width": "0", "fullscreen-title-outline-color": "#000000",
  "fullscreen-artist-size": "24", "fullscreen-artist-outline-width": "0",
  "fullscreen-artist-outline-color": "#000000", "fullscreen-show-clock": true,
  "fullscreen-clock-size": 48, "fullscreen-clock-outline-width": "0",
  "fullscreen-clock-outline-color": "#000000", "fullscreen-show-context": true,
  "fullscreen-show-next-track": true, "fullscreen-next-track-seconds": 15,
  "fullscreen-show-controls": true, "fullscreen-show-volume": true, "fullscreen-show-progress": true,
  "fullscreen-show-lyrics-progress": false, "fullscreen-control-button-size": 36,
  "fullscreen-controls-background": false, "fullscreen-auto-hide-ui": true,
  "fullscreen-auto-hide-delay": 3, "fullscreen-browser-fullscreen": false,
  "fullscreen-page-ui-only": false, "fullscreen-hide-overlay": true, "fullscreen-tmi-font-size": 100,
  "fullscreen-tmi-outline-width": "0", "fullscreen-tmi-outline-color": "#000000",
  "fullscreen-tv-mode": false, "fullscreen-tv-album-size": 140, "fullscreen-tv-show-album-name": true,
  "fullscreen-tv-show-controls": false, "fullscreen-tv-show-progress": false,
  "fullscreen-show-album-name": false, "fullscreen-trim-title": false,
  "fullscreen-show-context-image": true, "fullscreen-info-gap": 24, "fullscreen-show-queue": true,
});

// Keys index.js does not seed; the settings controls fall back to these values.
const SETTINGS_FALLBACK_DEFAULT_VALUES = Object.freeze({
  "toggle-tv-mode-key": "t", "sync-creator-char-forward-key": "right",
  "sync-creator-char-forward-alt-key": "", "sync-creator-char-back-key": "left",
  "sync-creator-char-back-alt-key": "", "sync-creator-word-forward-key": ".",
  "sync-creator-word-forward-alt-key": "", "sync-creator-word-back-key": ",",
  "sync-creator-word-back-alt-key": "", "sync-creator-syllable-key": ";",
  "sync-creator-syllable-alt-key": "", "sync-creator-drag-key": "/",
  "sync-creator-drag-alt-key": "numpaddivide",
});

const SETTINGS_DEFAULT_BACKGROUND_MODE = "gradient-background";
const SETTINGS_BACKGROUND_MODE_KEY = "__background-mode";

const hasSettingDefault = (key) =>
  typeof key === "string" && (
    Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULT_VALUES, key)
    || Object.prototype.hasOwnProperty.call(SETTINGS_FALLBACK_DEFAULT_VALUES, key)
  );

const getSettingDefaultValue = (key) =>
  key === SETTINGS_BACKGROUND_MODE_KEY
    ? SETTINGS_DEFAULT_BACKGROUND_MODE
    : Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULT_VALUES, key)
    ? SETTINGS_DEFAULT_VALUES[key]
    : SETTINGS_FALLBACK_DEFAULT_VALUES[key];

// Stored values mix numbers and numeric strings ("100" / 100), booleans and
// "true"/"false", and upper/lower case colors; compare what the user sees.
const normalizeSettingComparable = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = String(value).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text.toLowerCase();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return String(Number(text));
  return text;
};

const settingValuesEqual = (first, second) =>
  normalizeSettingComparable(first) === normalizeSettingComparable(second);

const getCurrentSettingValue = (key) => {
  if (key === SETTINGS_BACKGROUND_MODE_KEY) return getCurrentSettingsBackgroundMode();
  const value = CONFIG?.visual?.[key];
  return value === undefined ? getSettingDefaultValue(key) : value;
};

const isSettingChanged = (key) => {
  if (key === SETTINGS_BACKGROUND_MODE_KEY) {
    return getCurrentSettingsBackgroundMode() !== SETTINGS_DEFAULT_BACKGROUND_MODE;
  }
  if (!hasSettingDefault(key)) return false;
  return !settingValuesEqual(getCurrentSettingValue(key), getSettingDefaultValue(key));
};

const SETTINGS_UI_ICON_PATHS = Object.freeze({
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35",
  close: "M6 6l12 12M18 6 6 18",
  right: "m9 6 6 6-6 6",
  left: "m15 6-6 6 6 6",
  down: "m6 9 6 6 6-6",
  up: "m6 15 6-6 6 6",
  reset: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
  check: "m5 12.5 4.5 4.5L19 7.5",
  grip: "M9 6.5h.01M15 6.5h.01M9 12h.01M15 12h.01M9 17.5h.01M15 17.5h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v.01M11 11.5h1v5h1",
  warn: "M12 9v4m0 3.5v.01M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  sun: "M12 3v1.5M12 19.5V21M4.6 4.6l1.1 1.1M18.3 18.3l1.1 1.1M3 12h1.5M19.5 12H21M4.6 19.4l1.1-1.1M18.3 5.7l1.1-1.1M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z",
  moon: "M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7Z",
  dot: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  dock: "M4 5h16v14H4zM15 5v14",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  alignLeft: "M4 6h16M4 10h10M4 14h16M4 18h10",
  alignCenter: "M4 6h16M7 10h10M4 14h16M7 18h10",
  alignRight: "M4 6h16M10 10h10M4 14h16M10 18h10",
  layers: "M12 3 2.5 8 12 13l9.5-5L12 3ZM2.5 13 12 18l9.5-5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3 2",
  context: "M4 6.5h16v11H4zM8 10.5h8M8 13.5h5",
  next: "M5 6v12l9-6-9-6ZM18 6v12",
  controls: "M6.5 9v6M17.5 9v6M10 8.5v7l5-3.5-5-3.5Z",
  lprogress: "M7 4v16M11 8h7M11 12h5M11 16h7",
  queue: "M4 6h11M4 11h11M4 16h7M17 13v7l4-2.5",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  discord: "M8.5 11.5h.01M15.5 11.5h.01M7 6.5c1.5-.7 3-1 5-1s3.5.3 5 1c1.6 2.7 2.3 5.5 2 9-1.4 1.1-2.8 1.8-4.2 2.1l-.9-1.6c-.7.2-1.3.3-1.9.3s-1.2-.1-1.9-.3l-.9 1.6C7.8 17.3 6.4 16.6 5 15.5c-.3-3.5.4-6.3 2-9Z",
  coffee: "M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Zm11 1h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M11 3v3",
});

const SettingsUiIcon = ({ name, className = "", size = 16 }) =>
  react.createElement("svg", {
    className: `settings-ui-icon${className ? ` ${className}` : ""}`,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
  }, react.createElement("path", { d: SETTINGS_UI_ICON_PATHS[name] || SETTINGS_UI_ICON_PATHS.dot }));

// A tiny observable for values that change while scrolling (active section,
// current menu). Components subscribe to it so the settings tree itself does
// not re-render on every scroll-spy update.
const createSettingsSignal = (initialValue) => {
  let currentValue = initialValue;
  const listeners = new Set();
  return {
    get: () => currentValue,
    set: (nextValue) => {
      if (Object.is(nextValue, currentValue)) return;
      currentValue = nextValue;
      listeners.forEach((listener) => {
        try {
          listener(currentValue);
        } catch (error) {
          console.error(error);
        }
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const useSettingsSignal = (signal) => {
  const [value, setValue] = react.useState(() => (signal ? signal.get() : undefined));
  react.useEffect(() => {
    if (!signal) return undefined;
    setValue(signal.get());
    return signal.subscribe(setValue);
  }, [signal]);
  return value;
};

// Read current CONFIG after config or optional preview notifications, once per frame.
const useSettingsConfigRevision = (previewEvent = null) => {
  const [revision, setRevision] = react.useState(0);
  react.useEffect(() => {
    let frameId = null;
    let stopped = false;
    const schedule = () => {
      if (stopped || frameId != null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (!stopped) setRevision((value) => value + 1);
      });
    };
    const handleConfig = (event) => {
      if (event?.detail?.type === "config") schedule();
    };
    window.addEventListener("ivLyrics", handleConfig);
    if (previewEvent) window.addEventListener(previewEvent, schedule);
    return () => {
      stopped = true;
      window.removeEventListener("ivLyrics", handleConfig);
      if (previewEvent) window.removeEventListener(previewEvent, schedule);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [previewEvent]);
  return revision;
};

const SettingsSection = ({ sectionKey, title, subtitle, view, hidden, className = "", children }) =>
  renderSettingsSectionShell({
    sectionKey,
    title,
    subtitle,
    view,
    hidden,
    className,
    children,
  });
const isSettingsEditableField = (element) => {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  if (element.classList?.contains("settings-search-input")) return false;
  return ["text", "number", "search", "url", "email", "password", "tel", ""].includes(element.type || "");
};

// The preview opens by default only where it shows what is being edited.
const SETTINGS_PREVIEW_MENUS = new Set(["appearance", "fullscreen", "nowplaying"]);
const SETTINGS_DOCK_STORAGE_KEY = "ivLyrics:settings-dock";

const readSettingsDockPreferences = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_DOCK_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
};

const writeSettingsDockPreferences = (preferences) => {
  try {
    localStorage.setItem(SETTINGS_DOCK_STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    // Storage may be unavailable; the choice then lasts for this window only.
  }
};

const SettingsWordmark = () => react.createElement(
  "h1",
  { className: "settings-wordmark", "aria-label": "ivLyrics", lang: "en", dir: "ltr" },
  react.createElement("span", { className: "settings-wordmark-iv", "aria-hidden": "true" }, "iv"),
  react.createElement("span", { className: "settings-wordmark-lyrics", "aria-hidden": "true" }, "Lyrics")
);

const SettingsCrumbs = ({ menuLabel, sections, signal }) => {
  const activeKey = useSettingsSignal(signal);
  const section = (sections || []).find((candidate) => candidate.key === activeKey);
  return react.createElement(
    "div",
    { className: "settings-crumbs" },
    react.createElement("span", null, menuLabel),
    section ? react.createElement(SettingsUiIcon, { name: "right", size: 12 }) : null,
    section ? react.createElement("span", null, section.label) : null
  );
};

const isSettingsTocNeeded = (sections, content, toc) => {
  if (!sections || sections.length < 2) return false;
  if (!content || !toc || content.clientHeight <= 0) return true;
  const rendered = Array.from(content.querySelectorAll(".tab-content.active .settings-section"))
    .filter((section) => !section.closest("[hidden]") && section.getClientRects().length > 0);
  if (rendered.length < 2) return false;
  // Ignore the page's trailing scroll padding. Removing the strip must not
  // change the decision, including when it alone pushed a short page over.
  const tocHeight = toc.hidden ? 0 : toc.offsetHeight + (parseFloat(getComputedStyle(toc).marginTop) || 0);
  const bottom = rendered[rendered.length - 1].getBoundingClientRect().bottom
    - content.getBoundingClientRect().top + content.scrollTop - tocHeight;
  return bottom > content.clientHeight + 1;
};

// Section tabs of a menu. A plain mouse wheel over the strip scrolls it
// sideways (eased for wheel notches, 1:1 for trackpads). A wheel gesture that
// was already scrolling the page keeps doing so, and one that scrolled the
// strip does not spill into the page when it reaches an end.
const SettingsToc = ({ sections, signal, onSelect, pageWheelRef, contentRef, label }) => {
  const activeKey = useSettingsSignal(signal);
  const tocRef = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const content = contentRef?.current;
    const toc = tocRef.current;
    if (!content || !toc) return undefined;
    let frameId = null;
    const update = () => {
      frameId = null;
      const next = isSettingsTocNeeded(sections, content, toc);
      if (!next && toc.contains(document.activeElement)) content.focus({ preventScroll: true });
      setVisible(next);
    };
    const schedule = () => {
      if (frameId == null) frameId = requestAnimationFrame(update);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(content);
    const page = content.querySelector(".settings-page");
    if (page) observer?.observe(page);
    window.addEventListener("resize", schedule);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [sections, contentRef]);

  const syncEdges = useCallback(() => {
    const toc = tocRef.current;
    if (!toc) return;
    const overflow = toc.scrollWidth > toc.clientWidth + 1;
    toc.classList.toggle("is-overflow", overflow);
    toc.classList.toggle("at-start", overflow && toc.scrollLeft <= 1);
    toc.classList.toggle("at-end", overflow && toc.scrollLeft + toc.clientWidth >= toc.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const toc = tocRef.current;
    if (!toc) return undefined;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let wheelTarget = null;
    let wheelFrame = 0;
    let stripWheelAt = -1e9;
    const settle = () => {
      const difference = wheelTarget - toc.scrollLeft;
      if (Math.abs(difference) < 1) {
        toc.scrollLeft = wheelTarget;
        wheelTarget = null;
        wheelFrame = 0;
        return;
      }
      toc.scrollLeft += Math.sign(difference) * Math.max(1, Math.abs(difference) * 0.24);
      wheelFrame = requestAnimationFrame(settle);
    };
    const handleWheel = (event) => {
      if (event.ctrlKey) return;
      const max = toc.scrollWidth - toc.clientWidth;
      if (max <= 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const now = performance.now();
      if (now - (pageWheelRef?.current?.at ?? -1e9) < 320 && now - stripWheelAt > 320) return;
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? toc.clientWidth : 1;
      const delta = event.deltaY * unit;
      const from = wheelTarget === null ? toc.scrollLeft : wheelTarget;
      // At an end, a gesture that is still moving the strip stays on it.
      if ((delta < 0 && from <= 0) || (delta > 0 && from >= max - 1)) {
        if (now - stripWheelAt < 320) {
          event.preventDefault();
          stripWheelAt = now;
        }
        return;
      }
      event.preventDefault();
      stripWheelAt = now;
      if (Math.abs(delta) < 40 || reducedMotion?.matches) {
        if (wheelFrame) cancelAnimationFrame(wheelFrame);
        wheelFrame = 0;
        wheelTarget = null;
        toc.scrollLeft = Math.max(0, Math.min(max, toc.scrollLeft + delta));
        return;
      }
      wheelTarget = Math.max(0, Math.min(max, from + delta));
      if (!wheelFrame) wheelFrame = requestAnimationFrame(settle);
    };
    toc.addEventListener("scroll", syncEdges, { passive: true });
    toc.addEventListener("wheel", handleWheel, { passive: false });
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(syncEdges) : null;
    resizeObserver?.observe(toc);
    syncEdges();
    return () => {
      toc.removeEventListener("scroll", syncEdges);
      toc.removeEventListener("wheel", handleWheel);
      resizeObserver?.disconnect();
      if (wheelFrame) cancelAnimationFrame(wheelFrame);
    };
  }, [syncEdges, pageWheelRef]);

  // Keep the current tab in view when the strip scrolls sideways.
  useEffect(() => {
    const toc = tocRef.current;
    if (!toc) return;
    syncEdges();
    const link = toc.querySelector(".settings-toc-item.is-active");
    if (!link || toc.scrollWidth <= toc.clientWidth + 1) return;
    const left = link.offsetLeft - toc.offsetLeft;
    const pad = 28;
    if (left - pad < toc.scrollLeft) {
      toc.scrollTo({ left: Math.max(0, left - pad), behavior: "smooth" });
    } else if (left + link.offsetWidth + pad > toc.scrollLeft + toc.clientWidth) {
      toc.scrollTo({ left: left + link.offsetWidth + pad - toc.clientWidth, behavior: "smooth" });
    }
  }, [activeKey, sections, visible, syncEdges]);

  return react.createElement(
    "nav",
    {
      className: "settings-toc", ref: tocRef, "aria-label": label,
      hidden: !visible,
      style: visible ? undefined : { display: "none" },
    },
    ...(sections || []).map((section) =>
      react.createElement(
        "button",
        {
          key: section.key,
          type: "button",
          className: `settings-toc-item${section.key === activeKey ? " is-active" : ""}`,
          "aria-current": section.key === activeKey ? "location" : undefined,
          onClick: () => onSelect(section.key),
        },
        section.label
      )
    )
  );
};

const getSettingsPreviewKind = (menu, section) => {
  if (menu === "fullscreen") return "fullscreen";
  if (menu === "nowplaying") return "panel";
  if (section === "instrumental-break") return "interlude";
  if (section === "cultural-annotations") return "annotation";
  return "lyrics";
};

const getSettingsLayerLegend = () => [
  ["original", getSettingsText("lyricsCacheEditor.original", "Original")],
  ["phonetic", getSettingsText("menu.pronunciation", "Pronunciation")],
  ["translation", getSettingsText("translationMenu.translation", "Translation")],
  ["furigana", getSettingsText("translationMenu.furigana", "Furigana")],
];

// All four layers share one editor. Keep their color key informational and
// offer one explicit action rather than four buttons to the same matrix.
const SettingsPreviewLayerControls = ({ onNavigate }) => {
  const title = getSettingsText("settingsUi.sections.lyricLayers.title", "Lyric layers");
  const edit = getSettingsText("buttons.edit", "Edit");
  return react.createElement(
    "div",
    { className: "settings-preview-layers", role: "group", "aria-label": title },
    react.createElement(
      "div",
      { className: "settings-preview-layer-heading" },
      react.createElement("span", null, title),
      react.createElement(
        "button",
        {
          type: "button",
          className: "settings-preview-edit-link",
          "aria-label": `${title} · ${edit}`,
          onClick: () => onNavigate("appearance", "lyric-layers"),
        },
        react.createElement("span", null, edit),
        react.createElement(SettingsUiIcon, { name: "right", size: 12 })
      )
    ),
    react.createElement(
      "ul",
      { className: "settings-preview-legend" },
      ...getSettingsLayerLegend().map(([role, label]) => react.createElement(
        "li",
        {
          key: role,
          className: "settings-preview-layer-label",
          "data-layer": role,
          style: { "--layer-color": `var(--settings-layer-${role})` },
        },
        react.createElement("i", { "aria-hidden": "true" }),
        react.createElement("span", null, label)
      ))
    )
  );
};

const getSettingsPreviewSupplementVisibility = () => {
  const visual = CONFIG.visual || {};
  // Missing settings keep both sample layers useful; explicit "none" is honored.
  const modes = [
    visual["translation-mode:japanese"] ?? "gemini_romaji",
    visual["translation-mode-2:japanese"] ?? "gemini",
  ].filter((mode) => mode && mode !== "none");
  return {
    pronunciation: modes.some(isPronunciationDisplayMode),
    translation: modes.some((mode) => !isPronunciationDisplayMode(mode)),
  };
};

const renderSettingsPreviewLine = (active, extra = null, key = undefined) => {
  const visibility = getSettingsPreviewSupplementVisibility();
  const isKara = getSettingsPreviewFlag("karaoke-mode-enabled", true);
  const phonetic = visibility.pronunciation ? I18n.t("settingsAdvanced.livePreview.sampleTextPhonetic") : null;
  const translation = visibility.translation ? I18n.t("settingsAdvanced.livePreview.sampleText") : null;
  const line = { ...SETTINGS_LYRICS_PREVIEW_LINE, phoneticText: phonetic, translationText: translation };
  const { mainText, subText, subText2 } = getLyricsDisplayMode(
    isKara, line, phonetic, SETTINGS_LYRICS_PREVIEW_TEXT, translation
  );
  return react.createElement(
    "div",
    {
      key,
      className: `lyrics-lyricsContainer-LyricsLine${active ? " lyrics-lyricsContainer-LyricsLine-active" : ""}`,
      style: { "--position-index": 0, "--offset": "0px", "--animation-index": 0 },
    },
    react.createElement(
      "p",
      !isKara && typeof mainText === "string"
        ? { dangerouslySetInnerHTML: { __html: renderAnnotatedLyricHTML(mainText) } }
        : null,
      isKara && active
        ? react.createElement(KaraokeLine, {
          line,
          position: SETTINGS_LYRICS_PREVIEW_LINE.endTime,
          isActive: true,
          furiganaMapOverride: SETTINGS_LYRICS_PREVIEW_FURIGANA,
        })
        : isKara ? SETTINGS_LYRICS_PREVIEW_TEXT : null
    ),
    renderLyricSubLine(
      "lyrics-lyricsContainer-LyricsLine-phonetic", subText
    ),
    renderLyricSubLine(
      "lyrics-lyricsContainer-LyricsLine-translation", subText2
    ),
    extra
  );
};

// The live preview renders the app's own lyric markup and CSS: KaraokeLine,
// the interlude indicator from Pages.js and the cultural-note paragraph.
const SettingsLyricsPreview = ({ kind = "lyrics" }) => {
  const revision = useSettingsConfigRevision();
  const visual = CONFIG.visual || {};
  const isKara = getSettingsPreviewFlag("karaoke-mode-enabled", true);
  const mode = getCurrentSettingsBackgroundMode();
  const preset = SETTINGS_BACKGROUND_PRESETS.find((candidate) => candidate.id === mode);
  const brightness = Number(visual["background-brightness"]);
  const dim = mode === "solid-background" || mode === "none"
    ? 0
    : ((100 - (Number.isFinite(brightness) ? brightness : 30)) / 100) * 0.72;
  let tag = preset ? getSettingsText(preset.labelKey, preset.fallbackLabel) : "";
  let lines;
  if (kind === "interlude") {
    const icon = visual["instrumental-break-icon"] || "equalizer";
    tag = getSettingsText(`settingsAdvanced.instrumentalBreak.icon.options.${icon}`, tag);
    lines = [
      renderSettingsPreviewLine(false, null, "before"),
      react.createElement(
        "div",
        {
          key: "interlude",
          className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active",
          style: { "--position-index": 0, "--offset": "0px", "--animation-index": 0 },
        },
        react.createElement(
          "p",
          { className: "lyrics-lyricsContainer-LyricsLine-interludeMain" },
          react.createElement(InterludeIndicator, { durationMs: 6000, kind: "break", settingsRevision: revision })
        )
      ),
      renderSettingsPreviewLine(false, null, "after"),
    ];
  } else if (kind === "annotation") {
    tag = getSettingsText("settings.culturalAnnotations.label", tag);
    lines = [renderSettingsPreviewLine(true, getSettingsPreviewFlag("cultural-annotations-enabled", false) ? react.createElement(
      "p",
      { className: "lyrics-lyricsContainer-LyricsLine-culturalNote" },
      getSettingsText("settingsUi.preview.annotationSample", "")
    ) : null, "active")];
  } else {
    lines = [renderSettingsPreviewLine(true, null, "active")];
  }
  return react.createElement(
    "div",
    {
      className: `settings-preview-stage bg-${mode}${visual.noise ? " has-noise" : ""}`,
      style: {
        "--preview-solid": normalizeSettingsHexColor(visual["solid-background-color"]) || "#1e3a8a",
        "--preview-dim": dim,
      },
    },
    react.createElement("span", { className: "settings-preview-bg", "aria-hidden": "true" }),
    react.createElement("span", { className: "settings-preview-dim", "aria-hidden": "true" }),
    react.createElement("span", { className: "settings-preview-noise", "aria-hidden": "true" }),
    tag ? react.createElement("span", { className: "settings-preview-tag" }, tag) : null,
    react.createElement(
      "div",
      {
        className: "font-preview settings-live-preview-lyrics lyrics-lyricsContainer-LyricsContainer",
        id: "settings-live-lyrics-preview",
        style: getSettingsLyricsPreviewStyle(),
        "data-furigana-enabled": visual["furigana-enabled"] === true ? "true" : "false",
      },
      react.createElement(
        "div",
        {
          className: `settings-live-preview-stage lyrics-lyricsContainer-SyncedLyricsPage${isKara ? " is-karaoke" : ""}${isKara && getSettingsPreviewFlag("karaoke-line-transition", true) ? " karaoke-line-transition-enabled" : ""}`,
        },
        react.createElement(
          "div",
          { className: "settings-live-preview-line lyrics-lyricsContainer-SyncedLyrics" },
          ...lines
        )
      )
    )
  );
};

const getSettingsPreviewNumber = (key, fallback) => {
  const value = Number(CONFIG.visual?.[key]);
  return Number.isFinite(value) && CONFIG.visual?.[key] !== "" ? value : fallback;
};

const getSettingsPreviewFlag = (key, fallback) => {
  const value = CONFIG.visual?.[key];
  return value === undefined || value === null ? fallback : value !== false && value !== "false";
};

// Same hue wheel as the CD canvas (CdVisualizer.js RAINBOW_HUES).
const SETTINGS_CD_RAINBOW_HUES = [330, 20, 48, 140, 188, 228, 276, 330];
const SETTINGS_CD_STYLE_ORDER = ["bars", "blocks", "spikes", "line", "wave", "dots", "aura", "pulse", "particles"];
const settingsCdRainbowColor = (fraction, mirror = false) => {
  const hues = SETTINGS_CD_RAINBOW_HUES;
  const turn = ((Number(fraction) % 1) + 1) % 1;
  const position = mirror ? (turn <= 0.5 ? turn * 2 : (1 - turn) * 2) * (hues.length - 2) : turn * (hues.length - 1);
  const index = Math.min(hues.length - 2, Math.floor(position));
  let delta = hues[index + 1] - hues[index];
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return `hsl(${Math.round((hues[index] + delta * (position - index) + 360) % 360)}, 82%, 68%)`;
};

// Static schematics, not simulated audio. The even-odd paths leave the centre
// transparent, including in the small presentation picker and shape cards.
const SettingsCdDiscPreview = ({
  visualizer = true, style = "bars", color = "#b8cfdd", density = 64, thickness = 2,
  mirror = false, rainbow = false, albumGradient = false, variant = "full", rotation = false, rotationSpeed = 100,
} = {}) => {
  const mini = variant === "mini";
  const ring = (outer, inner) => `M ${100 - outer} 100 a ${outer} ${outer} 0 1 0 ${outer * 2} 0 a ${outer} ${outer} 0 1 0 ${-outer * 2} 0 M ${100 - inner} 100 a ${inner} ${inner} 0 1 0 ${inner * 2} 0 a ${inner} ${inner} 0 1 0 ${-inner * 2} 0`;
  // Thumbnails use fewer, balanced bands so each shape reads at 48 px.
  const count = mini ? ({ spikes: 16, blocks: 20 }[style] || 24) : Math.max(24, Math.min(128, Number(density) || 64));
  const width = Math.max(1, Math.min(6, Number(thickness) || 2)) * (mini ? 2.6 : 1);
  const disc = mini ? 58 : 76, base = mini ? 66 : 83, span = mini ? 30 : 10;
  const at = (angle, radius) => [100 + Math.sin(angle) * radius, 100 - Math.cos(angle) * radius];
  const round = (value) => Math.round(value * 100) / 100;
  const angleOf = (index) => index / count * Math.PI * 2;
  const level = (index) => {
    const band = mirror ? Math.min(index, count - index) : index;
    if (!mini) return (Math.sin(band * 0.73) + 1) / 2;
    const angle = angleOf(band);
    return 0.5 + 0.3 * Math.sin(3 * angle + 0.6) + 0.2 * Math.sin(5 * angle + 1.9);
  };
  const tipOf = (index) => base + 2 + level(index) * (span - 2);
  const points = Array.from({ length: count }, (_, index) => ({ angle: angleOf(index), radius: tipOf(index), point: at(angleOf(index), tipOf(index)) }));
  const tone = (index) => rainbow ? settingsCdRainbowColor(index / count, mirror) : color;
  const gradientId = `ivl-cd-rainbow-${mini ? "mini" : "full"}-${mirror ? "m" : "c"}`;
  const albumPatternId = `ivl-cd-album-${mini ? "mini" : "full"}`;
  const paint = rainbow ? `url(#${gradientId})` : albumGradient ? `url(#${albumPatternId})` : color;
  const contour = (scale = 1) => {
    const tips = Array.from({ length: count }, (_, index) => at(angleOf(index), base + 2 + level(index) * (span - 2) * scale));
    const mid = (a, b) => [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)];
    return `M ${mid(tips[count - 1], tips[0]).join(" ")} ${tips.map((tip, index) =>
      `Q ${round(tip[0])} ${round(tip[1])} ${mid(tip, tips[(index + 1) % count]).join(" ")}`).join(" ")} Z`;
  };
  const circlePath = (radius) => `M ${100 - radius} 100 a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  const shapes = () => {
    if (style === "line") {
      if (!rainbow) return [react.createElement("path", { key: "line", d: `${points.map(({ point }, index) => `${index ? "L" : "M"}${point.join(" ")}`).join(" ")} Z` })];
      return points.map(({ point }, index) => {
        const next = points[(index + 1) % count].point;
        return react.createElement("line", { key: index, x1: point[0], y1: point[1], x2: next[0], y2: next[1], stroke: tone(index) });
      });
    }
    if (style === "dots") {
      return points.map(({ point }, index) => react.createElement("circle", { key: index, cx: point[0], cy: point[1], r: width, fill: rainbow ? tone(index) : undefined }));
    }
    if (style === "wave") {
      return [
        react.createElement("path", { key: "fill", d: `${contour()} ${circlePath(base)}`, fillRule: "evenodd", fill: paint, fillOpacity: 0.26, stroke: "none" }),
        react.createElement("path", { key: "crest", d: contour(), fill: "none", stroke: paint }),
      ];
    }
    if (style === "aura") {
      return [[1, 0.16], [0.66, 0.22], [0.36, 0.3]].map(([scale, opacity]) =>
        react.createElement("path", { key: scale, d: `${contour(scale)} ${circlePath(disc)}`, fillRule: "evenodd", fill: paint, fillOpacity: opacity, stroke: "none" }));
    }
    if (style === "blocks") {
      const levels = mini ? 3 : 5;
      const start = base + 1.5, pitch = (span - 1.5) / (levels - 0.3), block = pitch * 0.7;
      const blockWidth = Math.min(width * 2.2 + 1, base * Math.PI * 2 / count * 0.72);
      return points.map(({ angle }, index) => {
        const lit = Math.max(1, Math.round(level(index) * levels));
        const [x1, y1] = at(angle, start), [x2, y2] = at(angle, start + lit * pitch - (pitch - block));
        return react.createElement("line", { key: index, x1, y1, x2, y2, stroke: tone(index), strokeWidth: blockWidth, strokeLinecap: "butt", strokeDasharray: `${round(block)} ${round(pitch - block)}` });
      });
    }
    if (style === "spikes") {
      const half = Math.PI / count * Math.min(1, 0.55 + Math.max(1, Math.min(6, Number(thickness) || 2)) * 0.075);
      return points.map(({ angle, radius }, index) => react.createElement("path", {
        key: index, fill: tone(index), stroke: "none",
        d: `M ${at(angle - half, base + 0.5).map(round).join(" ")} L ${at(angle, radius).map(round).join(" ")} L ${at(angle + half, base + 0.5).map(round).join(" ")} Z`,
      }));
    }
    if (style === "pulse") {
      return [[0.08, 1, 1.5], [0.36, 0.7, 1.2], [0.66, 0.42, 0.95], [0.94, 0.2, 0.7]].map(([reach, opacity, scale], index) =>
        react.createElement("circle", { key: index, cx: 100, cy: 100, r: round(base + reach * span), fill: "none", stroke: paint, strokeOpacity: opacity, strokeWidth: round(width * scale) }));
    }
    if (style === "particles") {
      const stride = Math.max(2, Math.round(count / 16));
      return [0, 1, 2].flatMap((generation) => points.filter((_, index) => index % stride === generation % stride).map(({ angle }, index) => {
        const band = index * stride + (generation % stride);
        const [x, y] = at(angle, base + 3 + (span - 4) * (0.12 + generation * 0.36) * (0.55 + 0.45 * level(band)));
        return react.createElement("circle", { key: `${generation}-${band}`, cx: round(x), cy: round(y), r: round(width * (1 - generation * 0.22)), fill: tone(band), fillOpacity: 1 - generation * 0.3 });
      }));
    }
    return points.map(({ angle, radius }, index) => react.createElement("line", {
      key: index, x1: at(angle, base)[0], y1: at(angle, base)[1], x2: at(angle, radius)[0], y2: at(angle, radius)[1], stroke: rainbow ? tone(index) : undefined,
    }));
  };
  const filled = style === "dots" || style === "spikes" || style === "particles";
  return react.createElement(
    "svg",
    {
      className: mini ? "settings-cd-style-thumb" : "settings-cd-disc-preview", viewBox: "0 0 200 200",
      width: mini ? 48 : "100%", height: mini ? 48 : "100%", "aria-hidden": "true", focusable: "false",
      "data-cd-style": style, "data-cd-mirror": mirror ? "true" : undefined, style: { display: "block", overflow: "visible" },
    },
    rainbow && visualizer ? react.createElement("defs", null,
      react.createElement("linearGradient", { id: gradientId, x1: 0, y1: 0, x2: mirror ? 0 : 1, y2: 1 },
        ...(mirror ? SETTINGS_CD_RAINBOW_HUES.slice(0, -1) : SETTINGS_CD_RAINBOW_HUES).map((hue, index, hues) =>
          react.createElement("stop", { key: index, offset: round(index / (hues.length - 1)), stopColor: `hsl(${hue}, 82%, 68%)` })))) : null,
    albumGradient && !rainbow && visualizer ? react.createElement("defs", null,
      ...["#c8ab83", "#557784", "#a5bfbc", "#c8ab83"].map((shade, index, shades) =>
        react.createElement("radialGradient", {
          key: index, id: `${albumPatternId}-${index}`, gradientUnits: "userSpaceOnUse",
          cx: at(index / shades.length * Math.PI * 2, 75)[0],
          cy: at(index / shades.length * Math.PI * 2, 75)[1], r: 145,
        }, react.createElement("stop", { offset: 0, stopColor: shade, stopOpacity: 1 }),
        react.createElement("stop", { offset: 1, stopColor: shade, stopOpacity: 0 }))),
      react.createElement("pattern", { id: albumPatternId, width: 200, height: 200, patternUnits: "userSpaceOnUse" },
        react.createElement("rect", { width: 200, height: 200, fill: "#557784" }),
        ...[0, 1, 2, 3].map(index => react.createElement("rect", {
          key: index, width: 200, height: 200, fill: `url(#${albumPatternId}-${index})`, opacity: .85,
        })))) : null,
    ...(mini ? [
      react.createElement("path", { key: "disc", d: ring(disc, 14), fillRule: "evenodd", fill: "currentColor", opacity: 0.2 }),
      react.createElement("circle", { key: "hub", cx: 100, cy: 100, r: 24, fill: "none", stroke: "currentColor", strokeWidth: 3, opacity: 0.32 }),
    ] : [
      react.createElement("path", { key: "disc", d: ring(76, 19), fillRule: "evenodd", fill: "#557784" }),
      react.createElement("path", { key: "art", className: `settings-cd-artwork${rotation ? " is-spinning" : ""}`,
        style: { "--cd-rotation-period": `${24 * 100 / Math.max(25, Math.min(200, Number(rotationSpeed) || 100))}s` },
        d: "M27 81 Q67 21 131 43 Q171 57 173 92 L120 83 Q77 57 27 81", fill: "#c8ab83", opacity: 0.65 }),
      react.createElement("path", { key: "rim", d: ring(76, 74), fillRule: "evenodd", fill: "#dce2e8", opacity: 0.7 }),
      react.createElement("path", { key: "hub-ring", d: ring(25, 9), fillRule: "evenodd", fill: "#dce2e8", opacity: 0.28 }),
      react.createElement("circle", { key: "hub-outer", cx: 100, cy: 100, r: 19, fill: "none", stroke: "#e3eaf0", strokeWidth: 0.8, opacity: 0.65 }),
      react.createElement("circle", { key: "hub-inner", cx: 100, cy: 100, r: 9, fill: "none", stroke: "#e3eaf0", strokeWidth: 0.8, opacity: 0.65 }),
    ]),
    visualizer ? react.createElement("g", {
      fill: filled ? paint : "none", stroke: filled ? "none" : paint, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round",
    }, ...shapes()) : null
  );
};

// Schematic fullscreen layout that follows the fullscreen settings.
const SettingsFullscreenPreview = ({ view = "basic" }) => {
  useSettingsConfigRevision();
  const visual = CONFIG.visual || {};
  const flag = getSettingsPreviewFlag;
  const number = getSettingsPreviewNumber;
  const bars = (count, prefix) => react.createElement(
    "div",
    { className: "settings-fs-lyrics" },
    ...Array.from({ length: count }, (_, index) =>
      react.createElement("i", {
        key: `${prefix}-${index}`,
        className: index === 1 ? "is-on" : "",
        style: { width: `${[62, 84, 70, 54, 66][index % 5]}%` },
      })
    )
  );
  const tvMode = view === "tv" || (view === "basic" && flag("fullscreen-tv-mode", false));
  const focused = view === "vinyl";
  const twoColumn = flag("fullscreen-two-column", true);
  const reverse = flag("fullscreen-layout-reverse", false);
  const controlsPosition = visual["fullscreen-controls-position"] || "left-panel";
  const controls = flag("fullscreen-show-controls", true);
  const progress = flag("fullscreen-show-progress", true);
  const hasArtColumn = twoColumn && (flag("fullscreen-show-album", true) || flag("fullscreen-show-info", true) || controlsPosition === "left-panel");
  const info = (albumNameKey = "fullscreen-show-album-name") => react.createElement(
    "div",
    { className: "settings-fs-info" },
    react.createElement("b", null),
    react.createElement("small", null),
    flag(albumNameKey, true) ? react.createElement("em", null) : null
  );
  // Match the runtime hierarchy: volume is below the buttons, and the bottom bar
  // keeps its timeline inside the surface that owns the background.
  const player = (placement, showControls, showProgress, showVolume = false) => {
    if (!showControls && !showProgress) return null;
    const inSurface = placement === "bottom" || (placement === "left" && showControls);
    const progressRow = showProgress ? react.createElement("div", { className: "settings-fs-progress-row" },
        react.createElement("small", null, "1:24"),
        react.createElement("span", { className: "settings-fs-progress" }),
        react.createElement("small", null, "3:42")) : null;
    const surface = showControls || (showProgress && inSurface) ? react.createElement("div", {
        className: `settings-fs-control-surface${!tvMode && !focused && flag("fullscreen-controls-background", false) ? " has-bg" : ""}`,
      },
      inSurface ? progressRow : null,
      showControls ? react.createElement("span", { className: "settings-fs-controls" },
        ...(tvMode || focused ? [0, 1, 2] : [0, 1, 2, 3, 4, 5, 6]).map(index =>
          react.createElement("i", { key: index, className: index === (tvMode || focused ? 1 : 3) ? "is-play" : "" }))) : null,
      showControls && showVolume ? react.createElement("span", { className: "settings-fs-volume" }) : null) : null;
    return react.createElement("div", { key: `player-${placement}`, className: `settings-fs-player is-${placement}` },
      // TV puts its timeline below the transport, the bottom bar inside the
      // surface, and normal and LP above it.
      ...(tvMode ? [surface, progressRow] : inSurface ? [surface] : [progressRow, surface])
    );
  };
  const artChildren = (art) => [
    flag("fullscreen-show-album", true) ? art : null,
    flag("fullscreen-show-info", true) ? info() : null,
    // FullscreenOverlay retains an independent progress-only row in its
    // album column, even when the main player controls are turned off.
    controlsPosition === "left-panel" || !controls
      ? player("left", controlsPosition === "left-panel" && controls, progress, flag("fullscreen-show-volume", true)) : null,
  ];
  const nodes = [];
  if (view === "cd") {
    const colorMode = visual["fullscreen-cd-visualizer-color-mode"] || "album";
    const color = colorMode === "custom" ? normalizeSettingsHexColor(visual["fullscreen-cd-visualizer-color"]) || "#ffffff"
      : colorMode === "white" ? "#ffffff" : "#b8cfdd";
    if (hasArtColumn) nodes.push(react.createElement("div", { key: "cd-art", className: `settings-fs-el settings-fs-col settings-fs-col-art${reverse ? " is-right" : ""}` },
      ...artChildren(react.createElement("div", { className: "settings-fs-cd", style: { "--cd-size": number("fullscreen-cd-disc-size", 100) / 100 } },
        react.createElement(SettingsCdDiscPreview, {
          visualizer: flag("fullscreen-cd-visualizer-enabled", true),
          style: visual["fullscreen-cd-visualizer-style"] || "bars", color,
          density: number("fullscreen-cd-visualizer-density", 64),
          thickness: number("fullscreen-cd-visualizer-thickness", 2),
          mirror: flag("fullscreen-cd-visualizer-mirror", false),
          rainbow: colorMode === "rainbow",
          albumGradient: colorMode === "album" && flag("fullscreen-cd-visualizer-album-gradient", true),
          rotation: flag("fullscreen-cd-rotation-enabled", true) && !flag("reduce-motion", false),
          rotationSpeed: number("fullscreen-cd-rotation-speed", 100),
        })))));
    nodes.push(react.createElement("div", { key: "cd-lyrics", className: `settings-fs-el settings-fs-col settings-fs-col-lyrics${twoColumn ? "" : " is-single"}${reverse && twoColumn ? " is-left" : ""}` }, bars(5, "cd")));
  } else if (view === "vinyl") {
    const armStyle = visual["fullscreen-vinyl-tonearm-style"] || "s";
    const finish = { white: "#f2f2f2", silver: "#b9bec7", black: "#1d1f24" }[visual["fullscreen-vinyl-tonearm-finish"] || "white"] || "#f2f2f2";
    const vinylAnimations = flag("fullscreen-vinyl-animations", true);
    nodes.push(react.createElement(
      "div",
      {
        key: "record",
        className: `settings-fs-record${vinylAnimations ? " is-spin" : ""}`,
        style: {
          "--record": number("fullscreen-vinyl-record-size", 100),
          "--rpm": number("fullscreen-vinyl-rotation-speed", 100),
        },
      },
      react.createElement("span", {
        className: `settings-fs-record-label${vinylAnimations && flag("fullscreen-vinyl-center-rotation", true) ? " is-spin" : ""}`,
        style: { "--label": number("fullscreen-vinyl-album-size", 100) },
      })
    ));
    nodes.push(react.createElement("span", {
      key: "arm",
      className: `settings-fs-arm is-${armStyle}`,
      style: { "--arm": number("fullscreen-vinyl-tonearm-size", 100), "--arm-color": finish },
    }));
    if (flag("fullscreen-vinyl-lyrics-enabled", true)) {
      nodes.push(react.createElement("div", { key: "vinyl-lyrics", className: "settings-fs-el settings-fs-vinyl-lyrics" }, bars(2, "vinyl")));
    }
  } else if (tvMode) {
    nodes.push(react.createElement("div", { key: "tv-lyrics", className: "settings-fs-el settings-fs-tv-lyrics" }, bars(4, "tv")));
    nodes.push(react.createElement(
      "div",
      { key: "tv-info", className: "settings-fs-el settings-fs-tv-info" },
      react.createElement("span", { className: "settings-fs-album", style: { "--album": number("fullscreen-tv-album-size", 140) * 1.4 } }),
      info("fullscreen-tv-show-album-name")
    ));
  } else {
    if (hasArtColumn) nodes.push(react.createElement(
      "div",
      { key: "art", className: `settings-fs-el settings-fs-col settings-fs-col-art${reverse ? " is-right" : ""}` },
      ...artChildren(react.createElement("span", { className: `settings-fs-album${flag("fullscreen-album-shadow", true) ? " has-shadow" : ""}` }))
    ));
    nodes.push(react.createElement(
      "div",
      { key: "lyrics", className: `settings-fs-el settings-fs-col settings-fs-col-lyrics${twoColumn ? "" : " is-single"}${reverse && twoColumn ? " is-left" : ""}` },
      bars(5, "main")
    ));
  }
  if (!focused && (flag("fullscreen-show-clock", true) || flag("fullscreen-show-next-track", true))) {
    nodes.push(react.createElement("div", { key: "top-right", className: "settings-fs-el settings-fs-top-right" },
      flag("fullscreen-show-clock", true) ? react.createElement("span", { className: "settings-fs-clock" }, flag("fullscreen-clock-show-seconds", false) ? "21:47:08" : "21:47") : null,
      flag("fullscreen-show-next-track", true) ? react.createElement("span", { className: "settings-fs-next" }, react.createElement("i"), react.createElement("b")) : null));
  }
  if (!focused && !tvMode && flag("fullscreen-show-context", true)) {
    nodes.push(react.createElement(
      "span",
      { key: "context", className: "settings-fs-el settings-fs-context" },
      flag("fullscreen-show-context-image", true) ? react.createElement("i") : null,
      react.createElement("b")
    ));
  }
  const lyricProgress = !focused && flag("fullscreen-show-lyrics-progress", false)
    ? react.createElement("span", { key: "lprog", className: `settings-fs-el settings-fs-lprog${tvMode ? " is-tv" : ""}` },
      react.createElement("i"), react.createElement("small", null, "4 / 12")) : null;
  if (!tvMode) nodes.push(lyricProgress);
  if (!focused && flag("fullscreen-show-queue", true)) {
    nodes.push(react.createElement("span", { key: "queue", className: "settings-fs-el settings-fs-queue" }, react.createElement("i"), react.createElement("i"), react.createElement("i"), react.createElement("i")));
  }
  if (tvMode) {
    const tvPlayer = player("tv", flag("fullscreen-tv-show-controls", true), flag("fullscreen-tv-show-progress", true));
    if (tvPlayer || lyricProgress) nodes.push(react.createElement("div", { key: "tv-controls", className: "settings-fs-el settings-fs-tv-stack" }, lyricProgress, tvPlayer));
  }
  else if (focused) nodes.push(player("stage", controls, progress));
  else if (controlsPosition === "bottom") nodes.push(player("bottom", controls, progress, flag("fullscreen-show-volume", true)));
  nodes.push(react.createElement("span", { key: "menu", className: "settings-fs-el settings-fs-menu", "aria-hidden": "true" }, "≡"));
  const backgroundMode = getCurrentSettingsBackgroundMode();
  const brightness = number("background-brightness", 30);
  return react.createElement(
    "div",
    {
      className: `settings-preview-stage settings-fs-stage bg-${backgroundMode}${visual.noise ? " has-noise" : ""}`,
      "data-preview-mode": focused ? "vinyl" : view === "cd" ? "cd" : tvMode ? "tv" : "normal",
      style: {
        "--preview-solid": normalizeSettingsHexColor(visual["solid-background-color"]) || "#1e3a8a",
        "--preview-dim": backgroundMode === "solid-background" || backgroundMode === "none" ? 0 : (100 - brightness) / 100 * 0.72,
        "--clock": number("fullscreen-clock-size", 48),
        "--album": number("fullscreen-album-size", 400),
        "--radius": number("fullscreen-album-radius", 12),
        "--title": tvMode ? number("fullscreen-tv-album-size", 140) * 0.26 : number("fullscreen-title-size", 48),
        "--artist": tvMode ? number("fullscreen-tv-album-size", 140) * 0.16 : number("fullscreen-artist-size", 24),
        "--btn": tvMode || focused ? 36 : number("fullscreen-control-button-size", 36),
        "--info-gap": number("fullscreen-info-gap", 24) * 0.17 + "px",
      },
    },
    react.createElement("span", { className: "settings-preview-bg", "aria-hidden": "true" }),
    react.createElement("span", { className: "settings-preview-dim", "aria-hidden": "true" }),
    react.createElement("span", { className: "settings-preview-noise", "aria-hidden": "true" }),
    ...nodes
  );
};

const getSettingsMatrixRowId = (key) => {
  const text = String(key || "");
  if (/-hyphen-replace$/.test(text)) return "hyphen";
  if (/-letter-spacing$/.test(text)) return "letterSpacing";
  if (/-outline-width$/.test(text)) return "outlineWidth";
  if (/-outline-color$/.test(text)) return "outlineColor";
  if (/-font-family$|-font$/.test(text)) return "font";
  if (/-font-weight$/.test(text)) return "weight";
  if (/-opacity$/.test(text)) return "opacity";
  if (/-spacing$/.test(text)) return "spacing";
  if (/-font-size$|-size$|-font-scale$/.test(text)) return "size";
  return text;
};

const getSettingsMatrixValue = (item) => {
  const current = CONFIG.visual?.[item.key];
  if (current !== undefined && current !== null && current !== "") return current;
  return item.defaultValue !== undefined ? item.defaultValue : current;
};

const isSettingsMatrixToggleOn = (toggle) => {
  if (!toggle) return true;
  const value = CONFIG.visual?.[toggle.key];
  return value === true || value === "true";
};

// Layers × properties table (lyric layers, panel lyrics, cultural notes, LP).
// It follows its own width: a table, a table with labels above the cells,
// or one layer at a time behind layer tabs in narrow windows.
const SettingsLayerMatrix = ({ columns, rows, onChange, label, muted = false, masterKey }) => {
  useSettingsConfigRevision();
  const isMuted = muted || (masterKey ? !isSettingsMatrixToggleOn({ key: masterKey }) : false);
  const rootRef = useRef(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const [mode, setMode] = useState("table");
  const [activeColumn, setActiveColumn] = useState(columns[0]?.id);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width || root.clientWidth;
      const next = width <= 520 ? "tabs" : width < 780 ? "stacked" : "table";
      setMode((previous) => (previous === next ? previous : next));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Search and the changed view open the layer that holds the setting.
  useEffect(() => {
    const handleReveal = (event) => {
      const key = event.detail?.key;
      const column = columnsRef.current.find((candidate) =>
        candidate.anchor === key
        || candidate.toggle?.key === key
        || candidate.items.some((item) => item.key === key));
      if (column) setActiveColumn(column.id);
    };
    window.addEventListener("ivLyrics:settings-reveal", handleReveal);
    return () => window.removeEventListener("ivLyrics:settings-reveal", handleReveal);
  }, []);

  const resetLabel = getSettingsText("creatorProfile.resetDecoration", "Reset to default");
  const handlerFor = (column) => column.onChange || onChange;
  const rowLabels = new Map(rows.map((row) => [row.id, row.label]));
  const cellFor = (column, rowId) => column.items.find((item) => (item.row || getSettingsMatrixRowId(item.key)) === rowId);

  const renderControl = (column, item, ariaLabel, disabled) => {
    const commit = (value) => handlerFor(column)(item.key, value);
    const value = getSettingsMatrixValue(item);
    if (item.type === ConfigFontSelector) {
      return react.createElement(SettingsFontPicker, {
        value, label: ariaLabel, disabled, allowEmpty: getSettingDefaultValue(item.key) === "", onChange: commit,
      });
    }
    if (item.type === ConfigFontWeightSlider) {
      return react.createElement(SettingsScrubField, {
        value, min: 100, max: 900, step: 100, label: ariaLabel, weight: true, disabled, onChange: commit,
      });
    }
    if (item.type === ConfigSliderRange) {
      return react.createElement(SettingsScrubField, {
        value, min: item.min, max: item.max, step: item.step, unit: item.unit, label: ariaLabel, disabled, onChange: commit,
      });
    }
    if (item.type === ConfigColorPicker) {
      return react.createElement(ConfigColorPicker, { name: ariaLabel, defaultValue: value, onChange: commit });
    }
    if (item.type === ConfigSelection) {
      return react.createElement(ConfigSelection, {
        name: ariaLabel, defaultValue: value, options: item.options, compact: true, disabled, onChange: commit,
      });
    }
    return null;
  };

  const renderHead = (column, last) =>
    react.createElement(
      "div",
      {
        key: `head-${column.id}`,
        className: `settings-matrix-head${last ? " is-last" : ""}`,
        role: "columnheader",
        "data-setting-key": column.anchor || undefined,
        style: { "--layer-color": column.color },
      },
      react.createElement(
        "div",
        { className: "settings-matrix-layer" },
        react.createElement(
          "span",
          { className: "settings-matrix-layer-name" },
          react.createElement("i", { "aria-hidden": "true" }),
          column.label
        ),
        column.toggle
          ? react.createElement(ConfigSlider, {
            name: column.toggle.desc,
            defaultValue: isSettingsMatrixToggleOn(column.toggle),
            onChange: (value) => handlerFor(column)(column.toggle.key, value),
          })
          : null
      ),
      column.subtitle ? react.createElement("div", { className: "settings-matrix-layer-sub" }, column.subtitle) : null
    );

  if (mode === "tabs") {
    const column = columns.find((candidate) => candidate.id === activeColumn) || columns[0];
    const listItems = [
      ...(column.toggle ? [{ ...column.toggle, type: ConfigSlider, defaultValue: isSettingsMatrixToggleOn(column.toggle) }] : []),
      ...column.items.map((item) => ({
        ...item,
        when: column.toggle ? () => isSettingsMatrixToggleOn(column.toggle) : item.when,
      })),
    ];
    return react.createElement(
      "div",
      { ref: rootRef, className: `settings-matrix is-tabs${isMuted ? " is-muted" : ""}`, "data-section-content": "true" },
      react.createElement(
        "div",
        { className: "settings-matrix-switcher" },
        react.createElement(SettingsSegmented, {
          options: columns.map((candidate) => ({
            value: candidate.id,
            label: candidate.label,
            color: candidate.color,
            anchor: candidate.anchor,
          })),
          value: column.id,
          label,
          onChange: setActiveColumn,
        })
      ),
      react.createElement(OptionList, {
        key: column.id,
        items: listItems,
        onChange: handlerFor(column),
      })
    );
  }

  const cells = [react.createElement("div", { key: "corner", className: "settings-matrix-head is-corner", role: "columnheader" })];
  columns.forEach((column, index) => cells.push(renderHead(column, index === columns.length - 1)));
  rows.forEach((row) => {
    if (!columns.some((column) => cellFor(column, row.id))) return;
    cells.push(react.createElement("div", { key: `label-${row.id}`, className: "settings-matrix-label", role: "rowheader" }, row.label));
    columns.forEach((column, index) => {
      const item = cellFor(column, row.id);
      const last = index === columns.length - 1;
      if (!item) {
        cells.push(react.createElement("div", {
          key: `${row.id}-${column.id}`,
          className: `settings-matrix-cell is-empty${last ? " is-last" : ""}`,
          role: "cell",
          "aria-hidden": "true",
        }));
        return;
      }
      const off = column.toggle ? !isSettingsMatrixToggleOn(column.toggle) : false;
      const changed = isSettingChanged(item.key);
      const ariaLabel = `${column.label} · ${rowLabels.get(row.id) || item.desc}`;
      cells.push(react.createElement(
        "div",
        {
          key: `${row.id}-${column.id}`,
          className: `settings-matrix-cell${changed ? " is-changed" : ""}${off ? " is-off" : ""}${last ? " is-last" : ""}`,
          role: "cell",
          "data-setting-key": item.key,
          style: { "--layer-color": column.color },
        },
        react.createElement("span", { className: "settings-visually-hidden setting-name" }, ariaLabel),
        renderControl(column, item, ariaLabel, off),
        hasSettingDefault(item.key)
          ? react.createElement(
            "button",
            {
              type: "button",
              className: "settings-reset-btn is-cell",
              title: resetLabel,
              "aria-label": `${ariaLabel} · ${resetLabel}`,
              "aria-hidden": changed ? undefined : "true",
              tabIndex: changed ? 0 : -1,
              onClick: () => {
                handlerFor(column)(item.key, getSettingDefaultValue(item.key));
                window.dispatchEvent(new CustomEvent("ivLyrics:settings-refresh", { detail: { key: item.key } }));
              },
            },
            react.createElement(SettingsUiIcon, { name: "reset", size: 12 })
          )
          : null
      ));
    });
  });

  return react.createElement(
    "div",
    {
      ref: rootRef,
      className: `settings-matrix is-${mode}${isMuted ? " is-muted" : ""}`,
      role: "table",
      "aria-label": label,
      "data-section-content": "true",
      style: { "--columns": columns.length },
    },
    ...cells
  );
};

// Lines shown before and after the current line in synced mode.
const SettingsLineWindow = ({ items, onChange }) => {
  useSettingsConfigRevision();
  const [beforeItem, afterItem] = items;
  const count = (key) => Math.max(0, Math.min(10, Math.floor(Number(CONFIG.visual?.[key])) || 0));
  const before = count(beforeItem.key);
  const after = count(afterItem.key);
  const lines = [];
  for (let index = before; index >= 1; index -= 1) {
    lines.push(react.createElement("span", {
      key: `before-${index}`,
      className: "settings-linewin-line",
      style: { "--w": `${50 + ((index * 13) % 30)}%`, "--o": Math.max(0.14, 0.25 + 0.12 * (3 - index)) },
    }));
  }
  lines.push(react.createElement("span", { key: "active", className: "settings-linewin-line is-active", style: { "--w": "82%" } }));
  for (let index = 1; index <= after; index += 1) {
    lines.push(react.createElement("span", {
      key: `after-${index}`,
      className: "settings-linewin-line",
      style: { "--w": `${45 + ((index * 17) % 35)}%`, "--o": Math.max(0.14, 0.55 - 0.12 * index) },
    }));
  }
  const values = Array.from({ length: 11 }, (_, index) => String(index));
  return react.createElement(
    "div",
    { className: "settings-linewin", "data-section-content": "true" },
    react.createElement("div", { className: "settings-linewin-visual", "aria-hidden": "true" }, ...lines),
    react.createElement(
      "div",
      { className: "settings-linewin-controls" },
      ...[beforeItem, afterItem].map((item) =>
        react.createElement(
          "div",
          {
            key: item.key,
            className: `settings-linewin-control${isSettingChanged(item.key) ? " is-changed" : ""}`,
            "data-setting-key": item.key,
            title: item.info || undefined,
          },
          react.createElement("span", { className: "setting-name" }, item.desc),
          react.createElement(SettingsStepper, {
            value: String(Number(CONFIG.visual?.[item.key]) || 0),
            values,
            label: item.desc,
            onChange: (value) => onChange(item.key, Number.parseInt(value, 10)),
          })
        )
      )
    )
  );
};

// Sync Creator shortcuts: one row per action, primary and secondary keys.
const SettingsHotkeyTable = ({ rows, columns, onChange }) =>
  react.createElement(
    "div",
    { className: "settings-hotkey-table", role: "table", "data-section-content": "true" },
    react.createElement("div", { className: "settings-hotkey-head", role: "columnheader" }),
    ...columns.map((column) =>
      react.createElement("div", { key: column, className: "settings-hotkey-head", role: "columnheader" }, column)
    ),
    ...rows.flatMap((row) => [
      react.createElement("div", { key: `${row.id}-label`, className: "settings-hotkey-label", role: "rowheader" }, row.label),
      ...row.items.map((item, index) =>
        react.createElement(
          "div",
          {
            key: item.key,
            className: `settings-hotkey-cell${isSettingChanged(item.key) ? " is-changed" : ""}`,
            role: "cell",
          },
          react.createElement(ConfigHotkey, {
            name: `${row.label} (${columns[index]})`,
            settingKey: item.key,
            defaultValue: item.defaultValue,
            onChange: (key, value) => onChange(key || item.key, value),
          })
        )
      ),
    ])
  );

// Fullscreen UI elements as on/off tiles; a tile's own settings show below it.
const SettingsTiles = ({ chips, onChange }) => {
  useSettingsConfigRevision();
  const enabledLabel = getSettingsText("misc.enabled", "Enabled");
  const disabledLabel = getSettingsText("misc.disabled", "Disabled");
  return react.createElement(
    "div",
    { className: "settings-tiles-stack", "data-section-content": "true" },
    react.createElement(
      "div",
      { className: "settings-tiles" },
      ...chips.map((chip) => {
        const on = getSettingsPreviewFlag(chip.item.key, chip.item.defaultValue !== false);
        return react.createElement(
          "button",
          {
            key: chip.item.key,
            type: "button",
            role: "switch",
            "aria-checked": on,
            className: `settings-tile${on ? " is-on" : ""}${isSettingChanged(chip.item.key) ? " is-changed" : ""}`,
            "data-setting-key": chip.item.key,
            title: chip.item.info || undefined,
            onClick: () => onChange(chip.item.key, !on),
          },
          react.createElement(
            "span",
            { className: "settings-tile-top" },
            react.createElement("span", { className: "settings-tile-icon", "aria-hidden": "true" }, react.createElement(SettingsUiIcon, { name: chip.icon, size: 16 })),
            react.createElement("span", { className: "settings-tile-state" }, on ? enabledLabel : disabledLabel)
          ),
          react.createElement("span", { className: "setting-name settings-tile-label" }, chip.item.desc)
        );
      })
    ),
    ...chips
      .filter((chip) => chip.children.length && getSettingsPreviewFlag(chip.item.key, chip.item.defaultValue !== false))
      .map((chip) =>
        react.createElement(
          "div",
          { key: `${chip.item.key}-details`, className: "settings-group settings-tile-details" },
          react.createElement("div", { className: "settings-group-title" }, chip.item.desc),
          react.createElement(OptionList, { items: chip.children, onChange })
        )
      )
  );
};

// One definition for the Performance controls, their search destinations and
// changed-setting ownership. Other menus keep styling details, not these toggles.
const getPerformanceSettingsSections = () => {
  const option = (key, labelKey, descriptionKey, extra = {}) => ({
    key,
    desc: I18n.t(labelKey),
    info: I18n.t(descriptionKey),
    type: ConfigSlider,
    i18nKeys: [labelKey, descriptionKey],
    ...extra,
  });
  return [
    {
      sectionKey: "performance-rendering",
      titleKey: "settingsAdvanced.performance.rendering.title",
      subtitleKey: "settingsAdvanced.performance.rendering.subtitle",
      items: [
        option("performance-frame-rate", "settingsAdvanced.performance.frameRate.label", "settingsAdvanced.performance.frameRate.desc", {
          type: ConfigSliderRange, presentation: "fps",
          defaultValue: Number(CONFIG.visual["performance-frame-rate"] ?? 60),
          min: 10, max: 240, step: 1, unit: I18n.t("settingsAdvanced.performance.frameRate.unit"),
        }),
        option("reduce-motion", "settings.reduceMotion.label", "settings.reduceMotion.desc", {
          defaultValue: CONFIG.visual["reduce-motion"] ?? false,
        }),
        option("karaoke-bounce", "settingsAdvanced.karaokeMode.bounce.label", "settingsAdvanced.karaokeMode.bounce.desc", { cost: true }),
        option("karaoke-line-transition", "settingsAdvanced.karaokeMode.lineTransition.label", "settingsAdvanced.karaokeMode.lineTransition.desc", { cost: true }),
        option("karaoke-text-effects", "settingsAdvanced.performance.textEffects.label", "settingsAdvanced.performance.textEffects.desc", {
          cost: true, defaultValue: CONFIG.visual["karaoke-text-effects"] ?? true,
        }),
      ],
    },
    {
      sectionKey: "performance-visual-cost",
      titleKey: "settingsAdvanced.performance.visualCost.title",
      subtitleKey: "settingsAdvanced.performance.visualCost.subtitle",
      items: [
        option("fade-blur", "settingsAdvanced.syncMode.fadeoutBlur.label", "settingsAdvanced.syncMode.fadeoutBlur.desc", { cost: true }),
        option("highlight-mode", "settingsAdvanced.syncMode.highlightMode.label", "settingsAdvanced.syncMode.highlightMode.desc", { cost: true }),
        option("text-shadow-enabled", "settingsAdvanced.textShadow.enabled.label", "settingsAdvanced.textShadow.enabled.desc", { cost: true }),
        // Video is an exclusive background choice, not an independent effect
        // toggle. Keep one editor in Appearance and offer a shortcut here.
        option("video-background-settings", "settings.videoBackground.label", "settings.videoBackground.desc", {
          type: ConfigButton, text: I18n.t("tabs.appearance"), searchable: false,
        }),
      ],
    },
    {
      sectionKey: "performance-background-work",
      titleKey: "settingsAdvanced.performance.backgroundWork.title",
      subtitleKey: "settingsAdvanced.performance.backgroundWork.subtitle",
      searchKeys: ["settingsAdvanced.prefetch.title", "settingsAdvanced.prefetch.subtitle"],
      items: [
        option("prefetch-enabled", "settingsAdvanced.prefetch.enabled.label", "settingsAdvanced.prefetch.enabled.desc"),
        option("prefetch-video-enabled", "settingsAdvanced.prefetch.videoEnabled.label", "settingsAdvanced.prefetch.videoEnabled.desc"),
        option("prefetch-word-details-enabled", "settingsAdvanced.prefetch.wordDetailsEnabled.label", "settingsAdvanced.prefetch.wordDetailsEnabled.desc"),
      ],
    },
  ];
};

// One catalog owns CD controls, search aliases and changed-setting destinations.
// Keep conditional rows in the catalog so saved custom colours remain reachable
// even when the visualizer is off or another colour mode is selected.
const isCdSettingsKey = (key) => typeof key === "string" && (
  key.startsWith("fullscreen-cd-") || key === "cd-mode" || key === "cd-visualizer"
);

// Search only needs metadata, not references to inactive input components.
const getCdSettingsSections = ({ controls = true } = {}) => {
  const option = (key, name, extra = {}) => ({
    key: `fullscreen-cd-${key}`,
    desc: I18n.t(`vinyl.cd.${name}Label`),
    info: I18n.t(`vinyl.cd.${name}Desc`),
    i18nKeys: [`vinyl.cd.${name}Label`, `vinyl.cd.${name}Desc`],
    ...extra,
  });
  const slider = (key, name, fallback, min, max, step, unit = "%", extra = {}) => option(key, name, {
    type: controls ? ConfigSliderRange : null, min, max, step, unit,
    defaultValue: CONFIG.visual[`fullscreen-cd-${key}`] ?? fallback,
    ...extra,
  });
  const visualizerOff = () => !getSettingsPreviewFlag("fullscreen-cd-visualizer-enabled", true);
  // Pulse rings are circular and level-driven, so density and mirroring would
  // have no visible effect there; their saved values are kept for other shapes.
  const pulseShapeOrOff = () => visualizerOff() || CONFIG.visual["fullscreen-cd-visualizer-style"] === "pulse";
  const choices = (key, name, values, group, fallback, extra = {}) => option(key, name, {
    type: controls ? ConfigSelection : null, presentation: "cards", disabled: visualizerOff,
    options: Object.fromEntries(values.map((value) => [value, I18n.t(`vinyl.cd.${group}.${value}`)])),
    defaultValue: CONFIG.visual[`fullscreen-cd-${key}`] || fallback,
    i18nKeys: [`vinyl.cd.${name}Label`, `vinyl.cd.${name}Desc`, ...values.map((value) => `vinyl.cd.${group}.${value}`)],
    ...extra,
  });
  const mirrored = getSettingsPreviewFlag("fullscreen-cd-visualizer-mirror", false);
  const swatch = (background) => react.createElement("span", { className: "settings-cd-color-swatch", style: { background }, "aria-hidden": "true" });
  return [
    {
      sectionKey: "cd-mode", titleKey: "vinyl.cd.mode", subtitleKey: "vinyl.cd.subtitle",
      items: [
        slider("disc-size", "discSize", 100, 70, 140, 5),
        option("rotation-enabled", "rotation", { type: controls ? ConfigSlider : null, defaultValue: getSettingsPreviewFlag("fullscreen-cd-rotation-enabled", true) }),
        slider("rotation-speed", "rotationSpeed", 100, 25, 200, 5, "%", {
          disabled: () => !getSettingsPreviewFlag("fullscreen-cd-rotation-enabled", true),
        }),
      ],
    },
    {
      sectionKey: "cd-visualizer", titleKey: "vinyl.cd.visualizerTitle", subtitleKey: "vinyl.cd.visualizerDesc",
      items: [
        option("visualizer-enabled", "enabled", { type: controls ? ConfigSlider : null, defaultValue: getSettingsPreviewFlag("fullscreen-cd-visualizer-enabled", true) }),
        choices("visualizer-style", "style", SETTINGS_CD_STYLE_ORDER, "styles", "bars", {
          cardsClassName: "settings-cd-style-cards",
          visualMap: controls ? Object.fromEntries(SETTINGS_CD_STYLE_ORDER.map((value) => [value, react.createElement(SettingsCdDiscPreview, {
            variant: "mini", style: value, color: "currentColor", density: 24, thickness: 2, mirror: mirrored,
          })])) : undefined,
        }),
        option("visualizer-mirror", "mirror", {
          type: controls ? ConfigSlider : null, defaultValue: mirrored, disabled: pulseShapeOrOff,
        }),
        choices("visualizer-color-mode", "colorMode", ["album", "white", "custom", "rainbow"], "colorModes", "album", {
          cardsClassName: "settings-cd-color-cards",
          visualMap: controls ? {
            album: swatch("radial-gradient(circle at 15% 20%, #c8925a, transparent 70%), radial-gradient(circle at 85% 80%, #4d7472, transparent 70%), #8c8160"),
            white: swatch("#ffffff"),
            custom: swatch(normalizeSettingsHexColor(CONFIG.visual["fullscreen-cd-visualizer-color"]) || "#ffffff"),
            rainbow: swatch(`linear-gradient(90deg, ${SETTINGS_CD_RAINBOW_HUES.map((hue) => `hsl(${hue}, 82%, 68%)`).join(", ")})`),
          } : undefined,
        }),
        option("visualizer-color", "color", {
          type: controls ? ConfigColorPicker : null, defaultValue: CONFIG.visual["fullscreen-cd-visualizer-color"] || "#ffffff",
          when: () => !visualizerOff() && CONFIG.visual["fullscreen-cd-visualizer-color-mode"] === "custom",
        }),
        option("visualizer-album-gradient", "albumGradient", {
          type: controls ? ConfigSlider : null,
          defaultValue: getSettingsPreviewFlag("fullscreen-cd-visualizer-album-gradient", true),
          disabled: visualizerOff,
          when: () => (CONFIG.visual["fullscreen-cd-visualizer-color-mode"] || "album") === "album",
        }),
        slider("visualizer-sensitivity", "sensitivity", 100, 25, 200, 5, "%", { disabled: visualizerOff }),
        slider("visualizer-density", "density", 64, 24, 128, 8, "", { disabled: pulseShapeOrOff }),
        slider("visualizer-thickness", "thickness", 2, 1, 6, 0.5, "px", { disabled: visualizerOff }),
      ],
    },
  ];
};

const getCanonicalSettingsDestination = (() => {
  let performanceKeys = null;
  return (tabId, settingKey) => {
    if (!settingKey) return { tabId, settingKey };
    if (isCdSettingsKey(settingKey)) {
      return { tabId: "fullscreen", settingKey };
    }
    if (settingKey === "video-background") return { tabId: "appearance", settingKey };
    if (settingKey === "prefetch") {
      return { tabId: "performance", settingKey: "performance-background-work" };
    }
    // Ownership is static; don't rebuild translated controls for every row in
    // the registry or every navigation event.
    performanceKeys ??= new Set(getPerformanceSettingsSections().flatMap((section) => [
      section.sectionKey,
      ...section.items.filter((item) => item.searchable !== false).map((item) => item.key),
    ]));
    return { tabId: performanceKeys.has(settingKey) ? "performance" : tabId, settingKey };
  };
})();

// How many GPU-heavy display effects are on, plus the frame cap.
const SettingsLoadMeter = ({ costKeys, frameKey }) => {
  useSettingsConfigRevision();
  const on = costKeys.filter((key) => getSettingsPreviewFlag(key, false)).length;
  const fps = getSettingsPreviewNumber(frameKey, 60);
  const score = (on + (fps > 120 ? 2 : fps > 60 ? 1 : 0)) / (costKeys.length + 2);
  const lit = Math.max(1, Math.round(score * 8));
  const level = score < 0.34 ? " is-low" : score > 0.67 ? " is-high" : "";
  return react.createElement(
    "div",
    { className: "settings-group settings-load-group", "data-section-content": "true" },
    react.createElement(
      "div",
      { className: "settings-load-meter" },
      react.createElement(
        "div",
        { className: `settings-load-bars${level}`, "aria-hidden": "true" },
        ...Array.from({ length: 8 }, (_, index) =>
          react.createElement("i", { key: index, className: index < lit ? "is-on" : "" })
        )
      ),
      react.createElement(
        "div",
        { className: "settings-load-text" },
        react.createElement("b", null, getSettingsText("settingsAdvanced.performance.visualCost.title", "Visual cost")),
        react.createElement(
          "small",
          null,
          getSettingsText("settingsUi.performance.loadSummary", "GPU-heavy effects on: {on}/{total} · {fps} FPS")
            .replace("{on}", String(on))
            .replace("{total}", String(costKeys.length))
            .replace("{fps}", String(fps))
        )
      )
    )
  );
};


const SettingsDock = ({ open, onToggle, menu, signal, fullscreenView, onNavigate }) => {
  const section = useSettingsSignal(signal);
  const kind = getSettingsPreviewKind(menu, section);
  const title = getSettingsText("settingsAdvanced.livePreview.title", "Live Preview");
  let preview;
  if (kind === "panel") preview = react.createElement(NowPlayingPanelPreview);
  else if (kind === "fullscreen") preview = react.createElement(SettingsFullscreenPreview, { view: fullscreenView });
  else preview = react.createElement(SettingsLyricsPreview, { kind });
  return react.createElement(
    "aside",
    { className: `settings-dock${open ? "" : " is-collapsed"}`, "aria-label": title },
    react.createElement(
      "div",
      { className: "settings-dock-head" },
      open
        ? react.createElement(
          "div",
          { className: "settings-dock-copy" },
          react.createElement("h2", null, title),
          react.createElement("p", null, getSettingsText("settingsAdvanced.livePreview.subtitle", "Instantly see your style changes"))
        )
        : null,
      react.createElement(
        "button",
        {
          type: "button",
          className: "settings-icon-btn settings-dock-toggle",
          "aria-expanded": open,
          "aria-label": title,
          title,
          onClick: onToggle,
        },
        react.createElement(SettingsUiIcon, { name: "dock", size: 16 })
      )
    ),
    open
      ? react.createElement(
        "div",
        { className: "settings-dock-body" },
        preview,
        kind === "lyrics" || kind === "annotation"
          ? react.createElement(SettingsPreviewLayerControls, { onNavigate })
          : null,
        react.createElement(
          "p",
          { className: "settings-dock-foot" },
          getSettingsText("settingsUi.preview.sampleNote", "Shown with sample data; not your current track.")
        )
      )
      : null
  );
};



const SETTINGS_UI_THEME_STORAGE_KEY = "ivLyrics:settings-ui-theme";

const getSettingsUiTheme = () => {
  const storedTheme = window.ivLyricsStoragePersistence?.getItem(SETTINGS_UI_THEME_STORAGE_KEY)
    ?? localStorage.getItem(SETTINGS_UI_THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  // The settings window offers light and dark only. An older "auto" choice
  // (or no choice) is settled from the system/Spotify theme; ConfigModal then
  // stores the result.
  return getSystemSettingsUiTheme();
};

const querySystemThemeMatchMedia = (query) => {
  try {
    return window.matchMedia?.(query) ?? null;
  } catch (error) {
    return null;
  }
};

const parseThemeCssColorToLuminance = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().toLowerCase();
  if (!text || text === "transparent" || text === "inherit" || text === "initial") {
    return null;
  }

  let red = null;
  let green = null;
  let blue = null;

  const hexMatch = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      red = parseInt(hex[0] + hex[0], 16);
      green = parseInt(hex[1] + hex[1], 16);
      blue = parseInt(hex[2] + hex[2], 16);
    } else {
      red = parseInt(hex.slice(0, 2), 16);
      green = parseInt(hex.slice(2, 4), 16);
      blue = parseInt(hex.slice(4, 6), 16);
    }
  } else {
    const rgbMatch = text.match(/^rgba?\(\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)/);
    if (!rgbMatch) {
      return null;
    }
    const channel = (part) => part.endsWith("%")
      ? (parseFloat(part) / 100) * 255
      : parseFloat(part);
    red = channel(rgbMatch[1]);
    green = channel(rgbMatch[2]);
    blue = channel(rgbMatch[3]);
  }

  if (![red, green, blue].every((channel) => Number.isFinite(channel))) {
    return null;
  }

  const toLinear = (channel) => {
    const normalized = Math.min(255, Math.max(0, channel)) / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
};

// Spotify's Chromium build can report prefers-color-scheme: dark even when the
// OS uses a light theme (forced dark mode / dark app-mode). When the media
// queries are inconclusive, fall back to the brightness of the actually
// applied Spotify theme so Auto still responds to theming instead of sticking
// to dark.
const getSpicetifyAppliedUiTheme = () => {
  try {
    const candidates = [];
    const colorScheme = window.Spicetify?.Config?.color_scheme;
    if (colorScheme && typeof colorScheme === "object") {
      for (const key of ["main", "sidebar", "player", "card", "background"]) {
        if (typeof colorScheme[key] === "string") {
          candidates.push(colorScheme[key]);
        }
      }
    }

    let computed = null;
    try {
      computed = window.getComputedStyle?.(document.documentElement);
    } catch (error) {
      computed = null;
    }
    if (computed) {
      for (const variable of ["--spice-main", "--spice-sidebar", "--spice-player", "--spice-card"]) {
        try {
          const cssValue = computed.getPropertyValue(variable);
          if (cssValue && cssValue.trim()) {
            candidates.push(cssValue);
          }
        } catch (error) {
          // Ignore unreadable variables and keep trying the next candidate.
        }
      }
    }

    for (const candidate of candidates) {
      const luminance = parseThemeCssColorToLuminance(candidate);
      if (luminance !== null) {
        return luminance > 0.5 ? "light" : "dark";
      }
    }
  } catch (error) {
    // Fall through to null below.
  }
  return null;
};

const getSystemSettingsUiTheme = () => {
  const lightQuery = querySystemThemeMatchMedia("(prefers-color-scheme: light)");
  if (lightQuery?.matches === true) {
    return "light";
  }

  const darkQuery = querySystemThemeMatchMedia("(prefers-color-scheme: dark)");
  if (darkQuery?.matches === true) {
    return "dark";
  }

  // Neither query matched: the OS reports no preference, or this Chromium
  // build does not expose it. Prefer the applied Spotify theme over a
  // hard-coded dark fallback.
  try {
    return getSpicetifyAppliedUiTheme() ?? "dark";
  } catch (error) {
    return "dark";
  }
};

const getEffectiveSettingsUiTheme = (themePreference, systemTheme) =>
  themePreference === "auto" ? systemTheme : themePreference;

const resolveEffectiveSettingsUiTheme = (themePreference) => {
  const preference = themePreference ?? getSettingsUiTheme();
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return getSystemSettingsUiTheme();
};

const subscribeSystemSettingsUiTheme = (callback) => {
  if (typeof callback !== "function" || typeof window === "undefined") {
    return () => {};
  }

  const emit = () => {
    try {
      callback(getSystemSettingsUiTheme());
    } catch (error) {
      // Ignore subscriber failures so one listener never breaks the rest.
    }
  };

  const cleanups = [];
  for (const query of ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]) {
    const media = querySystemThemeMatchMedia(query);
    if (!media) {
      continue;
    }

    const handleChange = () => emit();
    try {
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", handleChange);
        cleanups.push(() => {
          try {
            media.removeEventListener("change", handleChange);
          } catch (error) {
            // Ignore cleanup failures in hardened runtimes.
          }
        });
      } else if (typeof media.addListener === "function") {
        media.addListener(handleChange);
        cleanups.push(() => {
          try {
            media.removeListener?.(handleChange);
          } catch (error) {
            // Ignore cleanup failures in hardened runtimes.
          }
        });
      }
    } catch (error) {
      // Ignore unsubscribable queries and keep the remaining listeners.
    }
  }

  return () => {
    cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        // Ignore cleanup failures in hardened runtimes.
      }
    });
  };
};

const getSettingsUiThemeDebugInfo = () => {
  let preference = null;
  let systemTheme = null;
  let effectiveTheme = null;
  let matchMediaLight = null;
  let matchMediaDark = null;
  let spicetifyTheme = null;
  try {
    preference = getSettingsUiTheme();
  } catch (error) {
    preference = `error: ${error?.message || error}`;
  }
  try {
    matchMediaLight = querySystemThemeMatchMedia("(prefers-color-scheme: light)")?.matches ?? null;
  } catch (error) {
    matchMediaLight = `error: ${error?.message || error}`;
  }
  try {
    matchMediaDark = querySystemThemeMatchMedia("(prefers-color-scheme: dark)")?.matches ?? null;
  } catch (error) {
    matchMediaDark = `error: ${error?.message || error}`;
  }
  try {
    spicetifyTheme = getSpicetifyAppliedUiTheme();
  } catch (error) {
    spicetifyTheme = `error: ${error?.message || error}`;
  }
  try {
    systemTheme = getSystemSettingsUiTheme();
  } catch (error) {
    systemTheme = `error: ${error?.message || error}`;
  }
  try {
    effectiveTheme = resolveEffectiveSettingsUiTheme(preference);
  } catch (error) {
    effectiveTheme = `error: ${error?.message || error}`;
  }
  return {
    preference,
    systemTheme,
    effectiveTheme,
    matchMediaLight,
    matchMediaDark,
    spicetifyTheme,
  };
};

try {
  window.ivLyricsGetSystemSettingsUiTheme = getSystemSettingsUiTheme;
  window.ivLyricsGetEffectiveSettingsUiTheme = getEffectiveSettingsUiTheme;
  window.ivLyricsResolveSettingsUiTheme = resolveEffectiveSettingsUiTheme;
  window.ivLyricsSubscribeSystemSettingsUiTheme = subscribeSystemSettingsUiTheme;
  window.ivLyricsThemeDebug = () => {
    const info = getSettingsUiThemeDebugInfo();
    try {
      console.info("[ivLyrics] theme debug:", info);
    } catch (error) {
      // Console may be unavailable in hardened runtimes.
    }
    return info;
  };
} catch (error) {
  // Ignore failures when window is not extensible (hardened runtimes).
}

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
    fallbackLabel: "CD mode",
    descriptionKey: "vinyl.presentation.compactDescription",
    fallbackDescription:
      "Show a circular album cover with a centre hole and a surrounding visualizer.",
    icon:
      '<path d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0" fill="currentColor" fill-opacity=".15" fill-rule="evenodd" stroke="none"/><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4" stroke-opacity=".45"/><circle cx="12" cy="12" r="2"/><path d="M4.5 7.5 8 5M16 19l3.5-2.5" stroke-opacity=".65"/>',
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
  useEffect(() => {
    setSelectedMode(normalizeFullscreenPresentationPreset(defaultValue));
  }, [defaultValue]);
  const selectedIndex = FULLSCREEN_PRESENTATION_PRESETS.findIndex(preset => preset.id === selectedMode);

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
            tabIndex: selectedMode === preset.id ? 0 : -1,
            onClick: () => applyMode(preset.id),
            onKeyDown: (event) => handleSettingsRadioKeys(
              event,
              FULLSCREEN_PRESENTATION_PRESETS.map(option => ({ value: option.id })),
              selectedIndex,
              applyMode
            ),
          },
          react.createElement(
            "div",
            { className: "settings-choice-icon" },
            react.createElement("svg", {
              className: preset.id === "compact-vinyl" ? "settings-cd-presentation-preview" : undefined,
              width: preset.id === "compact-vinyl" ? 30 : 20,
              height: preset.id === "compact-vinyl" ? 30 : 20,
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
  if (CONFIG.visual.colorful) return "colorful";
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


// Release notes follow the settings theme through its CSS variables.
const SETTINGS_RELEASE_LINK_STYLE = "color: var(--settings-accent-text, #7aadff); text-decoration: none; border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.24));";
const SETTINGS_RELEASE_CODE_STYLE = "background: var(--settings-surface-3, rgba(255,255,255,0.1)); padding: 2px 6px; border-radius: 4px; font-family: var(--settings-mono, monospace); font-size: 0.9em; color: var(--settings-text, #ededef);";
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
    preStyle: "background: var(--settings-bg, rgba(0,0,0,0.3)); border: 1px solid var(--settings-line, rgba(255,255,255,0.08)); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 12px 0;",
    blockCodeStyle: "font-family: var(--settings-mono, monospace); font-size: 12.5px; color: var(--settings-text-2, rgba(255,255,255,0.9));",
    blockquoteStyle: "margin: 12px 0; padding-left: 16px; border-left: 2px solid var(--settings-line-3, rgba(255, 255, 255, 0.24)); color: var(--settings-text-3, rgba(255,255,255,0.7));",
    hrStyle: "border: none; border-top: 1px solid var(--settings-line, rgba(255,255,255,0.1)); margin: 20px 0;",
    headingStyles: {
      1: { tag: "h2", style: "margin: 22px 0 10px; color: var(--settings-text, #fff); font-size: 17px; font-weight: 600;" },
      2: { tag: "h3", style: "margin: 18px 0 8px; color: var(--settings-text, #fff); font-size: 15px; font-weight: 600;" },
      3: { tag: "h4", style: "margin: 14px 0 6px; color: var(--settings-text, #fff); font-size: 14px; font-weight: 600;" },
      4: { tag: "h5", style: "margin: 12px 0 6px; color: var(--settings-text, #fff); font-size: 13.5px; font-weight: 600;" },
    },
  });
}


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

// Menus the search index reads. The changed-settings view repeats rows from
// other menus, so indexing it would duplicate every result.
const SETTINGS_SEARCHABLE_TAB_SELECTOR =
  '.tab-content[data-tab-id]:not([data-tab-id="search"]):not([data-tab-id="changed"])';

const ConfigModal = ({
  onRequestClose = () => {},
  initialTab: requestedInitialTab = "general",
  initialSettingKey: requestedInitialSettingKey = null,
}) => {
  const { tabId: initialTab, settingKey: initialSettingKey } =
    getCanonicalSettingsDestination(requestedInitialTab, requestedInitialSettingKey);
  const [activeTab, setActiveTab] = react.useState(initialTab || "general");
  const [searchQuery, setSearchQuery] = react.useState("");
  const [searchPanelOpen, setSearchPanelOpen] = react.useState(true);
  const [searchActiveIndex, setSearchActiveIndex] = react.useState(0);
  const [changedView, setChangedView] = react.useState(false);
  const shouldReduceMotion = getEffectiveReducedMotionPreference();
  // Light or dark only. getSettingsUiTheme settles an older "auto" choice
  // from the system/Spotify theme once; the effect below stores the result.
  const [uiTheme, setUiTheme] = react.useState(getSettingsUiTheme);
  const uiThemePreference = uiTheme;

  // 검색어는 머리글 아래 결과 목록으로 보여 주고, 지금 보던 메뉴는 그대로 둔다.
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSearchPanelOpen(true);
    setSearchActiveIndex(0);
  };

  // 검색 지우기
  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchActiveIndex(0);
  };

  react.useEffect(() => {
    persistSettingsUiTheme(uiTheme);
  }, [uiTheme]);

  react.useEffect(() => {
    const overlay = document.getElementById("ivLyrics-settings-overlay");
    overlay?.setAttribute("data-ui-theme", uiTheme);
    overlay?.setAttribute("data-ui-theme-preference", uiThemePreference);
  }, [uiTheme, uiThemePreference]);

  const settingsContentRef = react.useRef(null);
  const pageHeadRef = react.useRef(null);
  const isProgrammaticScrollRef = react.useRef(false);
  const programmaticScrollTimerRef = react.useRef(null);
  const programmaticScrollEndCleanupRef = react.useRef(null);
  const highlightTimeoutRef = react.useRef(null);
  const highlightedSettingRef = react.useRef(null);

  const clearSettingHighlight = react.useCallback(() => {
    if (highlightTimeoutRef.current !== null) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = null;
    highlightedSettingRef.current?.classList.remove("setting-highlight-flash");
    highlightedSettingRef.current = null;
  }, []);

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
   * the given data-setting-key appears right below the sticky page head.
   * Uses container.scrollTo() instead of scrollIntoView() to avoid
   * accidentally scrolling parent containers (Spotify shell, etc.).
   */
  const scrollToSetting = react.useCallback(
    (settingKey, { behavior = "smooth", highlight = true } = {}) => {
      if (!settingKey) return false;
      if (behavior === "smooth" && getEffectiveReducedMotionPreference()) behavior = "auto";

      const container = settingsContentRef.current;
      if (!container) return false;

      const activePanel = container.querySelector(".tab-content.active");
      if (!activePanel) return false;

      const targetElement = Array.from(
        activePanel.querySelectorAll("[data-setting-key]")
      ).find((element) => element.getAttribute("data-setting-key") === String(settingKey));
      if (!targetElement) return false;
      // A target in a hidden view (fullscreen modes) is revealed by the caller first.
      if (targetElement.closest?.("[hidden]")) return false;

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

      // Calculate target position relative to the scroll container; the
      // sticky page head (title + section tabs) covers the top of it.
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      const stickyHeadOffset = pageHeadRef.current?.getBoundingClientRect?.().height || 0;
      const scrollTop =
        container.scrollTop
        + (targetRect.top - containerRect.top)
        - stickyHeadOffset
        - 12;

      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior,
      });

      clearSettingHighlight();
      if (highlight) {
        targetElement.classList.add("setting-highlight-flash");
        highlightedSettingRef.current = targetElement;
        highlightTimeoutRef.current = window.setTimeout(clearSettingHighlight, 1800);
      }

      return true;
    },
    [holdProgrammaticScroll, clearSettingHighlight]
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
  const searchableSettings = react.useMemo(() => {
    // 일반 탭 - 언어
    const buildGeneralLanguageSettings = () => [
      {
        section: I18n.t("tabs.general"),
        sectionKey: "general",
        settingKey: "language",
        name: I18n.t("settings.language.label"),
        desc: I18n.t("settings.language.desc"),
        i18nKeys: ["tabs.general", "settings.language.label", "settings.language.desc"]
      },
    ];
    // 일반 탭 - 시각 효과
    const buildAppearanceVisualSettings = () => [
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
        settingKey: "video-fallback-background",
        name: I18n.t("settings.videoFallback.label"),
        desc: I18n.t("settings.videoFallback.desc"),
        i18nKeys: ["tabs.appearance", "settings.videoFallback.label", "settings.videoFallback.desc"]
      },
      {
        section: I18n.t("tabs.appearance"),
        sectionKey: "appearance",
        settingKey: "background-brightness",
        name: I18n.t("settings.backgroundBrightness.label"),
        desc: I18n.t("settings.backgroundBrightness.desc"),
        i18nKeys: ["tabs.appearance", "sections.visualEffects", "settings.backgroundBrightness.label", "settings.backgroundBrightness.desc"]
      },
    ];
    const buildPerformanceSettings = () => getPerformanceSettingsSections().flatMap((section) => [
      {
        section: I18n.t("tabs.performance"), sectionKey: "performance",
        settingKey: section.sectionKey,
        name: I18n.t(section.titleKey), desc: I18n.t(section.subtitleKey),
        i18nKeys: ["tabs.performance", section.titleKey, section.subtitleKey, ...(section.searchKeys || [])],
      },
      ...section.items.filter((item) => item.searchable !== false).map((item) => ({
        section: I18n.t("tabs.performance"), sectionKey: "performance",
        settingKey: item.key, name: item.desc, desc: item.info || "",
        i18nKeys: ["tabs.performance", section.titleKey, ...item.i18nKeys],
      })),
    ]);
    // 일반 탭 - 데스크탑 오버레이
    const buildGeneralOverlaySettings = () => [
      {
        section: I18n.t("tabs.general"),
        sectionKey: "general",
        settingKey: "overlay-enabled",
        name: I18n.t("overlay.enabled.label"),
        desc: I18n.t("overlay.enabled.desc"),
        i18nKeys: ["tabs.general", "overlay.enabled.label", "overlay.enabled.desc"]
      },
      {
        section: I18n.t("tabs.general"),
        sectionKey: "general",
        settingKey: "overlay-trim-metadata",
        name: I18n.t("overlay.trimMetadata.label"),
        desc: I18n.t("overlay.trimMetadata.desc"),
        i18nKeys: ["tabs.general", "sections.desktopOverlay", "overlay.trimMetadata.label", "overlay.trimMetadata.desc"]
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

    ];
    // 외관 탭
    const buildAppearanceTabSettings = () => [
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

    ];
    // 동작 탭
    const buildBehaviorTabSettings = () => [
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

    ];
    // 고급 탭
    const buildAdvancedTabSettings = () => [
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
        settingKey: "seek-fade-compensation",
        name: I18n.t("settingsAdvanced.playback.seekFadeCompensation.label"),
        desc: I18n.t("settingsAdvanced.playback.seekFadeCompensation.info"),
        i18nKeys: [
          "tabs.behavior",
          "settingsAdvanced.playback.seekFadeCompensation.label",
          "settingsAdvanced.playback.seekFadeCompensation.info",
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
        settingKey: "karaoke-motion-style",
        name: I18n.t("settingsAdvanced.karaokeMode.motionStyle.label"),
        desc: I18n.t("settingsAdvanced.karaokeMode.motionStyle.desc"),
        i18nKeys: [
          "tabs.behavior",
          "settingsAdvanced.karaokeMode.motionStyle.label",
          "settingsAdvanced.karaokeMode.motionStyle.desc",
          "settingsAdvanced.karaokeMode.motionStyle.options.classic",
          "settingsAdvanced.karaokeMode.motionStyle.options.expressive",
        ]
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

    ];
    // 전체화면 탭
    const buildFullscreenTabSettings = () => [
      ...getCdSettingsSections({ controls: false }).flatMap((section) => [
        {
          section: I18n.t("tabs.fullscreen"), sectionKey: "fullscreen", settingKey: section.sectionKey,
          name: I18n.t(section.titleKey), desc: I18n.t(section.subtitleKey),
          i18nKeys: ["tabs.fullscreen", "vinyl.cd.mode", section.titleKey, section.subtitleKey],
        },
        ...section.items.map((item) => ({
          section: I18n.t("tabs.fullscreen"), sectionKey: "fullscreen", settingKey: item.key,
          name: item.desc, desc: item.info,
          i18nKeys: ["tabs.fullscreen", "vinyl.cd.mode", section.titleKey, ...item.i18nKeys],
        })),
      ]),
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
        settingKey: "fullscreen-album-open-lp",
        name: I18n.t("vinyl.settings.albumClickOpensModeLabel"),
        desc: I18n.t("vinyl.settings.albumClickOpensModeDesc"),
        i18nKeys: ["tabs.fullscreen", "vinyl.mode", "vinyl.settings.albumClickOpensModeLabel", "vinyl.settings.albumClickOpensModeDesc"]
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
          "vinyl.presentation.videoLabel",
          "vinyl.settings.backgroundBlurLabel",
          "vinyl.settings.backgroundBlurDesc",
          "vinyl.settings.trackChangeAnimationLabel",
          "vinyl.settings.trackChangeAnimationDesc",
          "vinyl.settings.rotationSpeedLabel",
          "vinyl.settings.rotationSpeedDesc"
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
    ];

    return [
      ...buildGeneralLanguageSettings(),
      ...buildAppearanceVisualSettings(),
      ...buildPerformanceSettings(),
      ...buildGeneralOverlaySettings(),
      ...buildAppearanceTabSettings(),
      ...buildBehaviorTabSettings(),
      ...buildAdvancedTabSettings(),
      ...buildFullscreenTabSettings(),
    ];
  }, []);

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
        if (!existing.sectionLabel && candidate.sectionLabel) {
          existing.sectionLabel = candidate.sectionLabel;
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
        .querySelectorAll(SETTINGS_SEARCHABLE_TAB_SELECTOR)
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
            if (node.getAttribute("data-search-exclude") === "true") return;
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
              sectionLabel: isSectionTitle ? "" : currentSectionLabel,
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
      .querySelectorAll(SETTINGS_SEARCHABLE_TAB_SELECTOR)
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
  }, [activeTab, changedView, searchableSettings]);

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

  // 검색 결과 패널 (머리글 검색 상자 아래)
  const getVisibleSearchResults = () => searchResults.slice(0, 60);

  const pickSearchResult = (item) => {
    if (!item) return;
    setSearchPanelOpen(false);
    if (typeof document !== "undefined") {
      document.activeElement?.blur?.();
    }
    navigateToDestination(item.sectionKey, item.settingKey);
  };

  const handleSearchKeyDown = (event) => {
    const results = getVisibleSearchResults();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      setSearchPanelOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSearchActiveIndex((index) =>
        Math.min(results.length - 1, Math.max(0, index + direction))
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const activeIndex = Math.min(searchActiveIndex, results.length - 1);
      if (activeIndex >= 0) pickSearchResult(results[activeIndex]);
    }
  };

  const renderSearchPanel = () => {
    if (!searchQuery.trim() || !searchPanelOpen) {
      return null;
    }

    const results = getVisibleSearchResults();
    const activeIndex = Math.min(searchActiveIndex, Math.max(0, results.length - 1));
    const meta = react.createElement(
      "div",
      { className: "settings-search-meta" },
      react.createElement(
        "span",
        { className: "search-results-count" },
        I18n.t("search.resultCount").replace("{count}", searchResults.length)
      ),
      react.createElement("span", { "aria-hidden": "true" }, "↑↓ · Enter · Esc")
    );

    if (results.length === 0) {
      return react.createElement(
        "div",
        { className: "settings-search-panel", role: "listbox", "aria-label": I18n.t("search.placeholder") },
        meta,
        react.createElement(
          "div",
          { className: "search-no-results" },
          react.createElement(SettingsUiIcon, { name: "search", size: 20, className: "search-no-results-icon" }),
          react.createElement("h3", { className: "search-no-results-title" }, I18n.t("search.noResults")),
          react.createElement("p", { className: "search-no-results-desc" }, I18n.t("search.noResultsDesc"))
        )
      );
    }

    // 번역명이 같아도 섞이지 않도록 실제 탭 ID 기준으로 그룹화한다.
    const groups = [];
    const groupByKey = new Map();
    results.forEach((result, index) => {
      const groupKey = result.sectionKey || result.section;
      if (!groupByKey.has(groupKey)) {
        const group = { key: groupKey, section: result.section, items: [] };
        groupByKey.set(groupKey, group);
        groups.push(group);
      }
      groupByKey.get(groupKey).items.push({ result, index });
    });

    return react.createElement(
      "div",
      {
        className: "settings-search-panel",
        role: "listbox",
        "aria-label": I18n.t("search.placeholder"),
      },
      meta,
      react.createElement(
        "div",
        { className: "settings-search-list" },
        ...groups.map((group) =>
          react.createElement(
            "div",
            { key: group.key, className: "search-result-group", role: "group", "aria-label": group.section },
            react.createElement("div", { className: "settings-search-group-label" }, group.section),
            ...group.items.map(({ result, index }) => {
              const context = result.sectionLabel || result.desc || "";
              return react.createElement(
                "button",
                {
                  key: result.resultKey,
                  type: "button",
                  role: "option",
                  "aria-selected": index === activeIndex,
                  className: `settings-search-result search-result-item${index === activeIndex ? " is-active" : ""}`,
                  onMouseDown: (event) => event.preventDefault(),
                  onMouseMove: () => {
                    if (index !== activeIndex) setSearchActiveIndex(index);
                  },
                  onClick: () => pickSearchResult(result),
                },
                react.createElement(
                  "span",
                  { className: "settings-search-result-icon", "aria-hidden": "true" },
                  react.createElement(SettingsOutlineIcon, { name: result.sectionKey, size: 15 })
                ),
                react.createElement(
                  "span",
                  { className: "settings-search-result-main" },
                  react.createElement("b", null, highlightText(result.name, searchQuery)),
                  context
                    ? react.createElement("small", null, highlightText(context, searchQuery))
                    : null
                )
              );
            })
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

  // Pending scroll target when switching menus. Each menu keeps its own
  // scroll position while the settings window stays open.
  const pendingTabScrollRef = react.useRef(initialSettingKey || null);
  const pendingScrollTopRef = react.useRef(null);
  const scrollMemoryRef = react.useRef(new Map());
  const [fullscreenView, setFullscreenView] = react.useState(() => isCdSettingsKey(initialSettingKey) ? "cd" : "basic");
  const [navigationRevision, setNavigationRevision] = react.useState(0);

  react.useEffect(() => {
    if (!activeTab || changedView) return;

    let cancelled = false;
    let attempt = 0;
    let frameId = null;

    const tryScroll = () => {
      if (cancelled) return;
      attempt++;

      const targetKey = pendingTabScrollRef.current;
      if (targetKey) {
        // Open whatever hides the target first: a fullscreen view or a
        // lyric-layer column that is shown as a tab in narrow windows.
        const container = settingsContentRef.current;
        const target = container && Array.from(
          container.querySelectorAll(".tab-content.active [data-setting-key]")
        ).find((element) => element.getAttribute("data-setting-key") === String(targetKey));
        const hiddenView = target?.closest?.("[data-view][hidden]");
        if (hiddenView) {
          setFullscreenView(hiddenView.getAttribute("data-view"));
          frameId = requestAnimationFrame(tryScroll);
          return;
        }
        // A narrow matrix still renders every layer's tab/anchor. Finding the
        // anchor does not mean its controls are selected, so reveal first.
        if (attempt === 1) {
          window.dispatchEvent(new CustomEvent("ivLyrics:settings-reveal", {
            detail: { key: targetKey },
          }));
          frameId = requestAnimationFrame(tryScroll);
          return;
        }
        const ok = scrollToSetting(targetKey, {
          behavior: attempt <= 2 ? "smooth" : "auto",
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

      const scrollTop = pendingScrollTopRef.current;
      if (scrollTop !== null) {
        const c = settingsContentRef.current;
        if (c) c.scrollTo({ top: scrollTop, behavior: "auto" });
        pendingScrollTopRef.current = null;
      }
    };

    frameId = requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab, changedView, navigationRevision, scrollToSetting]);

  react.useEffect(() => {
    return () => {
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      if (programmaticScrollEndCleanupRef.current) {
        programmaticScrollEndCleanupRef.current();
        programmaticScrollEndCleanupRef.current = null;
      }
      clearSettingHighlight();
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
          const releaseLink = releaseUrl
            ? `<a class="btn btn-sm settings-release-link" href="${escapeSettingsReleaseAttribute(releaseUrl)}" target="_blank" rel="noopener noreferrer">
                  ${viewOnGithubLabel}
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/>
                    <path d="M10.75 1a.75.75 0 000 1.5h1.69L8.22 6.72a.75.75 0 001.06 1.06l4.22-4.22v1.69a.75.75 0 001.5 0V1h-4.25z"/>
                  </svg>
                </a>`
            : `<span class="btn btn-sm settings-release-link is-disabled">
                  ${viewOnGithubLabel}
                </span>`;
          container.classList.remove("is-loading", "is-error");
          container.innerHTML = `
            <div class="settings-release">
              <div class="settings-release-head">
                <div>
                  <h3>${version}</h3>
                  <p>${publishedDate}</p>
                </div>
                ${releaseLink}
              </div>
              <div class="settings-release-body">
                ${body}
              </div>
            </div>
          `;
        } catch (error) {
          console.error("Failed to load patch notes:", error);
          container.classList.remove("is-loading");
          container.classList.add("is-error");
          const patchNotesLoadFailed = escapeSettingsReleaseHtml(
            I18n.t("settingsAdvanced.aboutTab.patchNotesLoadFailed")
          );
          const checkGithubReleases = escapeSettingsReleaseHtml(
            I18n.t("settingsAdvanced.aboutTab.checkGithubReleases")
          );

          container.innerHTML = `
            <div class="settings-release-error">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke-width="2"/>
                <line x1="12" y1="8" x2="12" y2="12" stroke-width="2" stroke-linecap="round"/>
                <line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <p>${patchNotesLoadFailed}</p>
              <p class="settings-release-error-hint">${checkGithubReleases}</p>
            </div>
          `;
        }
      };

      // 짧은 지연 후 로드 (DOM이 준비되도록)
      setTimeout(loadPatchNotes, 100);
    }
	  }, [activeTab, uiTheme]);

  const tabMeta = {
    general: {
      label: I18n.t("tabs.general"),
      description: getSettingsText(
        "settingsUi.nav.generalDesc",
        "Language, translation target, and desktop overlay behavior"
      ),
    },
    appearance: {
      label: I18n.t("tabs.appearance"),
      description: getSettingsText(
        "settingsUi.nav.appearanceDesc",
        "Background, sync presentation, motion, and text styles"
      ),
    },
    performance: {
      label: I18n.t("tabs.performance"),
      description: getSettingsText(
        "settingsUi.nav.performanceDesc",
        "Frame rate, motion, and visual cost controls"
      ),
    },
    lyrics: {
      label: I18n.t("tabs.behavior"),
      description: getSettingsText(
        "settingsUi.nav.lyricsDesc",
        "Playback buttons, karaoke behavior, prefetch, sync sharing, and helper integrations"
      ),
    },
    fullscreen: {
      label: I18n.t("tabs.fullscreen"),
      description: getSettingsText(
        "settingsUi.nav.fullscreenDesc",
        "Fullscreen layout, metadata display, controller UI, and TV mode presentation"
      ),
    },
    nowplaying: {
      label: I18n.t("tabs.nowplaying"),
      description: getSettingsText(
        "settingsUi.nav.nowplayingDesc",
        "Panel lyrics typography, background, border, and preview behavior"
      ),
    },
    "lyrics-providers": {
      label: I18n.t("tabs.lyricsProviders") || "Lyrics Providers",
      description: getSettingsText(
        "settingsUi.nav.lyricsProvidersDesc",
        "Choose, order, and scope each lyrics source"
      ),
    },
    "ai-providers": {
      label: I18n.t("tabs.aiProviders"),
      description: getSettingsText(
        "settingsUi.nav.aiProvidersDesc",
        "Configure AI translation providers, models, and keys"
      ),
    },
    advanced: {
      label: I18n.t("tabs.advanced"),
      description: getSettingsText(
        "settingsUi.nav.advancedDesc",
        "Language detection, import/export, database tools, and reset operations"
      ),
    },
    debug: {
      label: I18n.t("tabs.debug"),
      description: getSettingsText(
        "settingsUi.nav.debugDesc",
        "Inspect track, lyrics, and runtime state for troubleshooting"
      ),
    },
    about: {
      label: I18n.t("tabs.about"),
      description: getSettingsText(
        "settingsUi.nav.aboutDesc",
        "Account, update status, client info, and release notes"
      ),
    },
  };

  const activeTabMeta = tabMeta[activeTab] || tabMeta.general;

  const sidebarTabs = [
    { id: "general", icon: "general", group: "general" },
    { id: "lyrics-providers", icon: "lyrics-providers", group: "sources" },
    { id: "ai-providers", icon: "ai-providers", group: "sources" },
    { id: "appearance", icon: "appearance", group: "screen" },
    { id: "performance", icon: "performance", group: "screen" },
    { id: "lyrics", icon: "lyrics", group: "screen" },
    { id: "fullscreen", icon: "fullscreen", group: "screen" },
    { id: "nowplaying", icon: "nowplaying", group: "screen" },
    { id: "advanced", icon: "advanced", group: "system" },
    { id: "debug", icon: "debug", group: "system" },
    { id: "about", icon: "about", group: "system" },
  ].map((tab) => ({ ...tab, ...tabMeta[tab.id] }));
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

  const rootRef = react.useRef(null);
  const searchInputRef = react.useRef(null);
  const searchBoxRef = react.useRef(null);
  const pinnedSectionRef = react.useRef(null);
  const pageWheelRef = react.useRef({ at: -1e9 });
  const activeSectionSignal = react.useMemo(() => createSettingsSignal(null), []);
  const [sectionsByTab, setSectionsByTab] = react.useState({});
  const [dockPreferences, setDockPreferences] = react.useState(readSettingsDockPreferences);
  const [settingsRegistry, setSettingsRegistry] = react.useState(null);
  const [changedCounts, setChangedCounts] = react.useState(() => ({ total: 0, byTab: {} }));
  const [, setConfigRevision] = react.useState(0);

  // ---- Section tabs: discovered from the rendered sections, so provider
  // components and sections emptied by their conditions stay in step. ----
  react.useEffect(() => {
    const container = settingsContentRef.current;
    if (!container || changedView) return undefined;

    let frameId = null;
    const discover = () => {
      frameId = null;
      const tabNode = container.querySelector(".tab-content.active");
      if (!tabNode) return;
      const seen = new Set();
      const sections = Array.from(tabNode.querySelectorAll(".settings-section"))
        .map((sectionElement) => {
          if (sectionElement.closest("[hidden]") || sectionElement.getClientRects().length === 0) return null;
          const key = sectionElement.getAttribute("data-section-key");
          const label = sectionElement.querySelector(":scope > .section-title h3")?.textContent?.trim();
          if (!key || !label || seen.has(key)) return null;
          seen.add(key);
          return { key, label };
        })
        .filter(Boolean);
      setSectionsByTab((previous) => {
        const before = previous[activeTab];
        if (
          before
          && before.length === sections.length
          && before.every((section, index) =>
            section.key === sections[index].key && section.label === sections[index].label)
        ) {
          return previous;
        }
        return { ...previous, [activeTab]: sections };
      });
    };
    const schedule = () => {
      if (frameId == null) frameId = requestAnimationFrame(discover);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true });
    schedule();
    return () => {
      observer.disconnect();
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab, changedView, fullscreenView]);

  const activeSections = changedView ? [] : sectionsByTab[activeTab] || [];

  // ---- Navigation (rail, search, changed view, section links) ----
  const rememberScroll = () => {
    const container = settingsContentRef.current;
    if (!container) return;
    scrollMemoryRef.current.set(changedView ? "changed" : activeTab, container.scrollTop);
  };

  const navigateToDestination = react.useCallback(
    (tabId, settingKey) => {
      const destination = getCanonicalSettingsDestination(tabId, settingKey);
      rememberScroll();
      pinnedSectionRef.current = null;
      setChangedView(false);
      pendingTabScrollRef.current = destination.settingKey || null;
      // Conditional inputs may not have a DOM anchor (for example, the custom
      // colour in Album colour mode). Still open their canonical CD subview.
      if (destination.tabId === "fullscreen" && isCdSettingsKey(destination.settingKey)) {
        setFullscreenView("cd");
      }
      if (destination.tabId !== activeTab || changedView) {
        pendingScrollTopRef.current = destination.settingKey ? null : (scrollMemoryRef.current.get(destination.tabId) ?? 0);
        setActiveTab(destination.tabId);
      }
      setNavigationRevision((revision) => revision + 1);
    },
    [activeTab, changedView]
  );

  const openMenu = (tabId) => {
    if (tabId === activeTab && !changedView) return;
    navigateToDestination(tabId, null);
  };

  const toggleChangedView = () => {
    rememberScroll();
    pinnedSectionRef.current = null;
    if (changedView) {
      pendingScrollTopRef.current = scrollMemoryRef.current.get(activeTab) ?? 0;
      setChangedView(false);
      setNavigationRevision((revision) => revision + 1);
      return;
    }
    setChangedView(true);
    requestAnimationFrame(() => {
      settingsContentRef.current?.scrollTo({ top: scrollMemoryRef.current.get("changed") ?? 0, behavior: "auto" });
    });
  };

  const selectSection = (sectionKey) => {
    pinnedSectionRef.current = sectionKey;
    activeSectionSignal.set(sectionKey);
    scrollToSetting(sectionKey, { highlight: false });
  };

  const selectFullscreenView = (view) => {
    if (view === fullscreenView) return;
    pinnedSectionRef.current = null;
    setFullscreenView(view);
    settingsContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  // ---- Scroll-spy: highlights the section tab and the breadcrumb ----
  react.useEffect(() => {
    const container = settingsContentRef.current;
    if (!container || changedView) return undefined;

    let frameId = null;
    let settleTimer = null;
    const update = () => {
      frameId = null;
      const head = pageHeadRef.current;
      head?.classList.toggle("is-stuck", container.scrollTop > 4);
      if (isProgrammaticScrollRef.current) return;
      const sections = Array.from(container.querySelectorAll(".tab-content.active .settings-section"))
        .filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
      if (!sections.length) {
        activeSectionSignal.set(null);
        return;
      }
      const containerTop = container.getBoundingClientRect().top;
      const anchorLine = containerTop + (head ? head.getBoundingClientRect().height : 0) + 56;
      let active = sections[0];
      for (const element of sections) {
        if (element.getBoundingClientRect().top <= anchorLine) active = element;
        else break;
      }
      if (
        container.scrollTop > 4
        && container.scrollTop + container.clientHeight >= container.scrollHeight - 4
      ) {
        active = sections[sections.length - 1];
      }
      const pinned = pinnedSectionRef.current;
      if (pinned) {
        active = sections.find((element) => element.getAttribute("data-section-key") === pinned) || active;
      }
      activeSectionSignal.set(active.getAttribute("data-section-key"));
    };
    const schedule = () => {
      if (frameId == null) frameId = requestAnimationFrame(update);
    };
    const handleScrollEnd = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, 320);
    };
    // A tab click pins its section (short pages cannot scroll it to the top)
    // until the reader scrolls by hand.
    const unpin = (event) => {
      if (event?.type === "wheel" && !event.target?.closest?.(".settings-toc")) {
        pageWheelRef.current.at = performance.now();
      }
      if (event?.target?.closest?.(".settings-toc")) return;
      if (!pinnedSectionRef.current) return;
      if (event?.type === "keydown" && !/^(Arrow|Page|Home|End| )/.test(event.key)) return;
      pinnedSectionRef.current = null;
      schedule();
    };
    container.addEventListener("scroll", schedule, { passive: true });
    container.addEventListener("scrollend", handleScrollEnd, { passive: true });
    container.addEventListener("wheel", unpin, { passive: true });
    container.addEventListener("touchstart", unpin, { passive: true });
    container.addEventListener("keydown", unpin);
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      container.removeEventListener("scroll", schedule);
      container.removeEventListener("scrollend", handleScrollEnd);
      container.removeEventListener("wheel", unpin);
      container.removeEventListener("touchstart", unpin);
      container.removeEventListener("keydown", unpin);
      window.removeEventListener("resize", schedule);
      clearTimeout(settleTimer);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [activeTab, changedView, fullscreenView, sectionsByTab]);

  // ---- Keyboard: ⌘K / Ctrl K and "/" focus the search ----
  react.useEffect(() => {
    const handleShortcut = (event) => {
      const input = searchInputRef.current;
      if (!input) return;
      const key = String(event.key || "").toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "k") {
        event.preventDefault();
        event.stopPropagation();
        input.focus();
        input.select();
        setSearchPanelOpen(true);
        return;
      }
      const activeElement = document.activeElement;
      const typing = activeElement && (
        /^(input|textarea|select)$/i.test(activeElement.tagName) || activeElement.isContentEditable
      );
      if (key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing) {
        event.preventDefault();
        event.stopPropagation();
        input.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut, true);
    return () => window.removeEventListener("keydown", handleShortcut, true);
  }, []);

  // ---- Small manners shared by every field in the window ----
  react.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    // A focused number field must not swallow the page scroll; the wheel
    // would otherwise change its value without the reader noticing.
    const handleWheel = (event) => {
      const field = document.activeElement;
      if (field && field.tagName === "INPUT" && field.type === "number" && field.contains(event.target)) {
        field.blur();
      }
    };
    // Escape (handled by openConfig) restores the value from before the edit.
    const handleFocusIn = (event) => {
      if (isSettingsEditableField(event.target)) {
        event.target.dataset.ivBefore = event.target.value;
      }
    };
    // Text cut off with an ellipsis shows its full wording on hover.
    const handlePointerOver = (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      let node = event.target instanceof Element ? event.target : null;
      for (let depth = 0; node && depth < 3 && node !== root; depth += 1, node = node.parentElement) {
        if (node.hasAttribute("title") && !node.hasAttribute("data-auto-title")) return;
        if (getComputedStyle(node).textOverflow !== "ellipsis") continue;
        if (node.scrollWidth > node.clientWidth + 1) {
          node.title = node.textContent.trim();
          node.setAttribute("data-auto-title", "");
        } else if (node.hasAttribute("data-auto-title")) {
          node.removeAttribute("title");
          node.removeAttribute("data-auto-title");
        }
        return;
      }
    };
    const handlePointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) setSearchPanelOpen(false);
    };
    root.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    root.addEventListener("focusin", handleFocusIn, true);
    root.addEventListener("pointerover", handlePointerOver, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      root.removeEventListener("wheel", handleWheel, { capture: true });
      root.removeEventListener("focusin", handleFocusIn, true);
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  // ---- Changed settings: counted against the index.js defaults ----
  react.useEffect(() => {
    const handleRefresh = () => setConfigRevision((revision) => revision + 1);
    window.addEventListener("ivLyrics:settings-refresh", handleRefresh);
    return () => window.removeEventListener("ivLyrics:settings-refresh", handleRefresh);
  }, []);

  react.useEffect(() => {
    setSettingsRegistry(buildSettingsRegistry());
  }, []);

  react.useEffect(() => {
    if (!settingsRegistry) return undefined;
    let frameId = null;
    const recount = () => {
      frameId = null;
      const byTab = {};
      let total = 0;
      settingsRegistry.forEach((entry) => {
        if (!isSettingChanged(entry.key)) return;
        total += 1;
        byTab[entry.tabId] = (byTab[entry.tabId] || 0) + 1;
      });
      setChangedCounts((previous) => {
        const same = previous.total === total
          && Object.keys(byTab).length === Object.keys(previous.byTab).length
          && Object.keys(byTab).every((tabId) => previous.byTab[tabId] === byTab[tabId]);
        return same ? previous : { total, byTab };
      });
    };
    const schedule = (event) => {
      if (event?.detail?.type !== "config" || frameId != null) return;
      frameId = requestAnimationFrame(recount);
    };
    window.addEventListener("ivLyrics", schedule);
    recount();
    return () => {
      window.removeEventListener("ivLyrics", schedule);
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [settingsRegistry]);

  const dockOpen = !changedView && (
    dockPreferences[activeTab] ?? SETTINGS_PREVIEW_MENUS.has(activeTab)
  );
  const toggleDock = () => {
    setDockPreferences((previous) => {
      const next = { ...previous, [activeTab]: !dockOpen };
      writeSettingsDockPreferences(next);
      return next;
    });
  };

  const changedViewTitle = getSettingsText("settingsUi.changed.title", "Changed settings");

  const renderHeaderSection = () => {
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
    const themeOptions = [
      {
        id: "light",
        label: getSettingsText("settingsUi.theme.lightShort", "Light"),
        title: getSettingsText("settingsUi.theme.light", "Switch to light mode"),
        icon: "sun",
      },
      {
        id: "dark",
        label: getSettingsText("settingsUi.theme.darkShort", "Dark"),
        title: getSettingsText("settingsUi.theme.dark", "Switch to dark mode"),
        icon: "moon",
      },
    ];
    const themeIndex = Math.max(0, themeOptions.findIndex((option) => option.id === uiTheme));
    const searchLabel = I18n.t("search.placeholder");
    const searchExpanded = Boolean(searchQuery.trim() && searchPanelOpen);

    return react.createElement(
      "header",
      { className: "settings-topbar" },
      react.createElement(
        "div",
        { className: "settings-topbar-title" },
        react.createElement(SettingsWordmark),
        react.createElement(SettingsCrumbs, {
          menuLabel: changedView ? getSettingsText("settingsUi.changed.button", "Changed") : activeTabMeta.label,
          sections: activeSections,
          signal: activeSectionSignal,
        })
      ),
      react.createElement(
        "div",
        {
          className: `settings-search settings-search-wrapper${searchQuery ? " has-query" : ""}`,
          role: "search",
          ref: searchBoxRef,
        },
        react.createElement(SettingsUiIcon, { name: "search", size: 16, className: "settings-search-icon" }),
        react.createElement("input", {
          ref: searchInputRef,
          type: "search",
          className: "settings-search-input",
          placeholder: searchLabel,
          "aria-label": searchLabel,
          "aria-expanded": searchExpanded,
          autoComplete: "off",
          spellCheck: false,
          value: searchQuery,
          onChange: handleSearchChange,
          onFocus: () => setSearchPanelOpen(true),
          onKeyDown: handleSearchKeyDown,
        }),
        searchQuery && react.createElement(
          "button",
          {
            className: "settings-search-clear",
            type: "button",
            onClick: () => {
              handleClearSearch();
              searchInputRef.current?.focus();
            },
            title: I18n.t("search.clear"),
            "aria-label": I18n.t("search.clear"),
          },
          react.createElement(SettingsUiIcon, { name: "close", size: 14 })
        ),
        react.createElement("kbd", { className: "settings-kbd", "aria-hidden": "true" }, isMac ? "⌘K" : "Ctrl K"),
        renderSearchPanel()
      ),
      react.createElement(
        "div",
        { className: "settings-topbar-tools" },
        react.createElement(
          "button",
          {
            type: "button",
            className: `settings-changed-chip${changedCounts.total ? "" : " is-zero"}`,
            "aria-pressed": changedView,
            onClick: toggleChangedView,
          },
          react.createElement(SettingsUiIcon, { name: "dot", size: 14 }),
          react.createElement("span", null, getSettingsText("settingsUi.changed.button", "Changed")),
          react.createElement("b", null, String(changedCounts.total))
        ),
        react.createElement(
          "div",
          {
            className: "settings-seg settings-theme-control",
            role: "radiogroup",
            "aria-label": getSettingsText("settingsUi.theme.selector", "Settings theme"),
            style: { "--count": themeOptions.length, "--index": themeIndex },
          },
          react.createElement("span", { className: "settings-seg-thumb", "aria-hidden": "true" }),
          ...themeOptions.map((themeOption, optionIndex) =>
            react.createElement(
              "button",
              {
                key: themeOption.id,
                className: `settings-seg-option settings-theme-option${uiTheme === themeOption.id ? " is-on active" : ""}`,
                type: "button",
                role: "radio",
                title: themeOption.title,
                "aria-label": themeOption.label,
                "aria-checked": uiTheme === themeOption.id,
                tabIndex: optionIndex === themeIndex ? 0 : -1,
                onClick: () => setUiTheme(themeOption.id),
                onKeyDown: (event) =>
                  handleSettingsRadioKeys(
                    event,
                    themeOptions.map((option) => ({ value: option.id })),
                    themeIndex,
                    (value) => setUiTheme(value)
                  ),
              },
              react.createElement(SettingsUiIcon, { name: themeOption.icon, size: 15 }),
              react.createElement("span", { className: "settings-seg-text" }, themeOption.label)
            )
          )
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
          react.createElement(SettingsUiIcon, { name: "close", size: 16 })
        )
      )
    );
  };

  const renderRail = () => {
    const spicetifyVersion = window.Spicetify?.Config?.version;
    const spotifyVersion = window.Spicetify?.Platform?.version;
    return react.createElement(
      "nav",
      {
        className: "settings-rail",
        "aria-label": getSettingsText("menu.settings", "Settings"),
      },
      ...sidebarGroups.map((group) => {
        const groupTabs = sidebarTabs.filter((tab) => tab.group === group.id);
        if (!groupTabs.length) return null;
        const labelId = `${APP_NAME}-settings-rail-${group.id}`;
        return react.createElement(
          "section",
          { key: group.id, className: "settings-rail-group", "aria-labelledby": labelId },
          react.createElement("div", { id: labelId, className: "settings-rail-group-label" }, group.label),
          ...groupTabs.map((tab) => {
            const current = activeTab === tab.id && !changedView;
            const count = changedCounts.byTab[tab.id] || 0;
            return react.createElement(
              "button",
              {
                key: tab.id,
                type: "button",
                className: `settings-rail-item${current ? " is-active" : ""}${count ? " is-modified" : ""}`,
                title: tab.label,
                "aria-current": current ? "page" : undefined,
                onClick: () => openMenu(tab.id),
              },
              react.createElement(SettingsOutlineIcon, { name: tab.icon, className: "settings-rail-icon", size: 16 }),
              react.createElement("span", { className: "settings-rail-label" }, tab.label),
              count
                ? react.createElement("span", { className: "settings-rail-count" }, String(count))
                : null
            );
          })
        );
      }),
      react.createElement(
        "div",
        { className: "settings-rail-foot" },
        react.createElement("b", null, `ivLyrics v${Utils.currentVersion}`),
        react.createElement(
          "span",
          null,
          [
            spotifyVersion ? `Spotify ${spotifyVersion}` : "Spotify",
            spicetifyVersion ? `Spicetify ${spicetifyVersion}` : "Spicetify",
          ].join(" · ")
        ),
        settingsRegistry
          ? react.createElement(
            "span",
            null,
            getSettingsText("settingsUi.footer.counts", "{settings} settings · {menus} menus")
              .replace("{settings}", String(settingsRegistry.length))
              .replace("{menus}", String(sidebarTabs.length))
          )
          : null
      )
    );
  };

  const fullscreenViews = [
    { value: "basic", label: getSettingsText("settingsUi.fullscreenViews.basic", "Basics") },
    { value: "normal", label: getSettingsText("settingsUi.fullscreenViews.normal", "Normal mode") },
    { value: "tv", label: getSettingsText("settingsUi.fullscreenViews.tv", "TV mode") },
    { value: "cd", label: I18n.t("vinyl.cd.mode") },
    { value: "vinyl", label: I18n.t("vinyl.mode") || "LP" },
  ];

  const renderPageHead = () =>
    react.createElement(
      "div",
      { className: "settings-page-head", ref: pageHeadRef },
      react.createElement(
        "div",
        { className: "settings-page-title-row" },
        react.createElement(
          "h2",
          { className: "settings-page-title" },
          changedView ? changedViewTitle : activeTabMeta.label
        )
      ),
      react.createElement(
        "p",
        { className: "settings-page-desc" },
        changedView
          ? getSettingsText("settingsUi.changed.desc", "Only the settings that differ from their defaults.")
          : activeTabMeta.description
      ),
      !changedView && activeTab === "fullscreen"
        ? react.createElement(SettingsSegmented, {
          className: "settings-view-switch",
          options: fullscreenViews,
          value: fullscreenView,
          label: activeTabMeta.label,
          onChange: selectFullscreenView,
        })
        : null,
      !changedView
        ? react.createElement(SettingsToc, {
          sections: activeSections,
          signal: activeSectionSignal,
          onSelect: selectSection,
          pageWheelRef,
          contentRef: settingsContentRef,
          label: activeTabMeta.label,
        })
        : null
    );

  // ---- Background (visual effects) ----
  const handleBackgroundVisualChange = (name, value) => {
    CONFIG.visual[name] = value;
    StorageManager.saveConfig(name, value);
    if (name === "alignment") syncSettingsLyricsPreviewStyles();
    lyricContainerUpdate?.();
    window.dispatchEvent(
      new CustomEvent("ivLyrics", {
        detail: { type: "config", name, value },
      })
    );
  };

  const applyBackgroundMode = (modeId) => {
    SETTINGS_BACKGROUND_PRESETS
      .map((preset) => preset.id)
      .filter((id) => id !== "none")
      .forEach((optionId) => {
        const isEnabled = optionId === modeId;
        CONFIG.visual[optionId] = isEnabled;
        StorageManager.saveConfig(optionId, isEnabled);
      });
    lyricContainerUpdate?.();
    window.dispatchEvent(
      new CustomEvent("ivLyrics", {
        detail: { type: "config", name: "background-mode", value: modeId },
      })
    );
  };

  const buildBackgroundModeItems = (selectedMode) => {
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
          desc: I18n.t("settings.videoFallback.label"),
          info: I18n.t("settings.videoFallback.desc"),
          key: "video-fallback-background",
          type: ConfigSelection,
          options: {
            "album-cover": I18n.t("settings.gradientBackground.label"),
            "blur-gradient": I18n.t("settings.blurGradientBackground.label"),
            solid: I18n.t("settings.solidBackground.label"),
          },
        },
        {
          desc: I18n.t("settings.solidBackgroundColor.label"),
          info: I18n.t("settings.solidBackgroundColor.desc"),
          key: "solid-background-color",
          type: ColorPresetSelector,
          when: () => CONFIG.visual["video-fallback-background"] === "solid",
        },
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
    return modeSpecificItems;
  };

  const buildBackgroundLayoutItems = () => [
    {
      desc: I18n.t("settings.alignment.label"),
      key: "alignment",
      info: I18n.t("settings.alignment.desc"),
      type: ConfigSelection,
      disabled: isFadActive,
      presentation: "seg",
      iconMap: { left: "alignLeft", center: "alignCenter", right: "alignRight" },
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
  ];

  const getBackgroundPresetOptions = () =>
    Object.fromEntries(
      SETTINGS_BACKGROUND_PRESETS.map((preset) => [
        preset.id,
        getSettingsText(preset.labelKey, preset.fallbackLabel),
      ])
    );

  // Every background setting, for the changed-settings registry.
  const getBackgroundRegistryItems = () => {
    const items = [{
      item: {
        desc: I18n.t("sections.visualEffects"),
        key: SETTINGS_BACKGROUND_MODE_KEY,
        type: ConfigSelection,
        presentation: "select",
        options: getBackgroundPresetOptions(),
        defaultValue: getCurrentSettingsBackgroundMode(),
      },
      onChange: (_name, value) => applyBackgroundMode(value),
    }];
    const seen = new Set();
    ["gradient-background", "solid-background", "video-background"].forEach((mode) => {
      buildBackgroundModeItems(mode).forEach((item) => {
        if (seen.has(item.key)) return;
        seen.add(item.key);
        items.push({ item, onChange: handleBackgroundVisualChange });
      });
    });
    buildBackgroundLayoutItems().forEach((item) => items.push({ item, onChange: handleBackgroundVisualChange }));
    return items;
  };

  // This component owns stateful helper controls. Keep its type stable across
  // ConfigModal renders so their mount effects cannot trigger a remount loop.
  const BackgroundExperienceSection = react.useMemo(() => function BackgroundExperienceSectionContent() {
    const [selectedMode, setSelectedMode] = react.useState(
      getCurrentSettingsBackgroundMode()
    );
    useSettingsConfigRevision();

    const applyMode = (modeId) => {
      setSelectedMode(modeId);
      applyBackgroundMode(modeId);
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

    const modeSpecificItems = buildBackgroundModeItems(selectedMode);
    const solidColor = normalizeSettingsHexColor(CONFIG.visual["solid-background-color"]) || "#1e3a8a";

    return react.createElement(
      react.Fragment,
      null,
      react.createElement(
        "div",
        { className: "settings-panel settings-modes-panel", "data-setting-key": SETTINGS_BACKGROUND_MODE_KEY },
        react.createElement(SettingsChoiceCards, {
          className: "settings-mode-grid",
          label: I18n.t("sections.visualEffects"),
          value: selectedMode,
          disabled: isFadActive,
          onChange: applyMode,
          options: SETTINGS_BACKGROUND_PRESETS.map((preset) => ({
            value: preset.id,
            anchor: preset.id === "none" ? undefined : preset.id,
            label: getSettingsText(preset.labelKey, preset.fallbackLabel),
            description: getSettingsText(preset.descriptionKey, preset.fallbackDescription),
            visual: react.createElement("span", {
              className: `settings-mode-visual vis-${preset.id}`,
              style: preset.id === "solid-background" ? { "--solid": solidColor } : undefined,
              "aria-hidden": "true",
            }),
          })),
        })
      ),
      modeSpecificItems.length > 0 &&
        react.createElement(
          "div",
          { className: "settings-group" },
          react.createElement(
            "div",
            { className: "settings-group-title" },
            getSettingsText("settingsUi.background.finetune", "Background Details")
          ),
          react.createElement(OptionList, {
            items: modeSpecificItems,
            onChange: handleBackgroundVisualChange,
          })
        ),
      react.createElement(
        "div",
        { className: "settings-group" },
        react.createElement(
          "div",
          { className: "settings-group-title" },
          getSettingsText("settingsUi.background.layout", "Layout & Motion")
        ),
        react.createElement(OptionList, {
          items: buildBackgroundLayoutItems(),
          onChange: handleBackgroundVisualChange,
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

  // 시각 설정 변경: 설정을 저장하고 가사 컨테이너를 갱신한 뒤 config 이벤트를 발생
  const handleVisualConfigChange = (name, value) => {
    CONFIG.visual[name] = value;
    StorageManager.saveConfig(name, value);
    lyricContainerUpdate?.();
    window.dispatchEvent(
      new CustomEvent("ivLyrics", {
        detail: { type: "config", name, value },
      })
    );
  };

  // 외형 미리보기 설정 변경: setItem으로 저장하고 미리보기 스타일을 동기화한 뒤 config 이벤트를 발생
  const handleAppearancePreviewChange = (name, value) => {
    CONFIG.visual[name] = value;
    StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);
    syncSettingsLyricsPreviewStyles();
    lyricContainerUpdate?.();
    window.dispatchEvent(
      new CustomEvent("ivLyrics", {
        detail: { type: "config", name, value },
      })
    );
  };

  // 나우플레잉 패널 설정 변경: 설정 저장 후 config 이벤트와 미리보기 이벤트를 함께 발생
  const handleNowPlayingPanelChange = (name, value) => {
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
  };

  const renderGeneralTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "general" ? "active" : ""}`,
        "data-tab-id": "general",
      },
      // 언어 설정 섹션
      react.createElement(
        SettingsSection,
        {
          sectionKey: "language",
          title: I18n.t("sections.language"),
          subtitle: I18n.t("settings.language.desc"),
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.language.label"),
              key: "language",
              info: I18n.t("settings.language.desc"),
              type: ConfigSelection,
              presentation: "select",
              options: Object.fromEntries(
                I18n.getAvailableLanguages().map(language => [language.code, language.name])
              ),
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
            },
            {
              desc: I18n.t("settings.translationTargetLanguage.label"),
              key: "translate:target-language",
              info: I18n.t("settings.translationTargetLanguage.desc"),
              type: ConfigSelection,
              presentation: "select",
              options: {
                auto: I18n.t("settings.translationTargetLanguage.options.auto"),
                ...Object.fromEntries(
                  I18n.getAvailableLanguages().map(language => [language.code, language.name])
                ),
              },
              onChange: saveSettingsTranslationTargetLanguage,
            },
          ],
        })
      ),
      // 데스크탑 오버레이 섹션
      react.createElement(
        SettingsSection,
        {
          sectionKey: "overlay-enabled",
          title: I18n.t("sections.desktopOverlay"),
          subtitle: I18n.t("sections.desktopOverlaySubtitle"),
        },
        react.createElement(OverlaySettings)
      )
    );

  const renderPerformanceTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "performance" ? "active" : ""}`,
        "data-tab-id": "performance",
      },
      react.createElement(SettingsLoadMeter, {
        costKeys: [
          "karaoke-bounce", "karaoke-line-transition", "karaoke-text-effects",
          "fade-blur", "highlight-mode", "text-shadow-enabled", "video-background",
        ],
        frameKey: "performance-frame-rate",
      }),
      ...getPerformanceSettingsSections().map((section) =>
        react.createElement(
          SettingsSection,
          {
            key: section.sectionKey,
            sectionKey: section.sectionKey,
            title: I18n.t(section.titleKey),
            subtitle: I18n.t(section.subtitleKey),
          },
          react.createElement(OptionList, {
            items: section.items.map((item) => item.key === "video-background-settings"
              ? { ...item, onChange: () => navigateToDestination("appearance", "video-background") }
              : item),
            onChange: handlePerformanceSettingChange,
          })
        )
      )
    );

  const renderLyricsTab = () => {
    const renderLyricsPlaybackSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "playback",
          sectionKey: "playback",
          title: I18n.t("settingsAdvanced.playback.title"),
          subtitle: I18n.t("settingsAdvanced.playback.subtitle"),
        },
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
            {
              desc: I18n.t("settingsAdvanced.playback.seekFadeCompensation.label"),
              key: "seek-fade-compensation",
              info: I18n.t("settingsAdvanced.playback.seekFadeCompensation.info"),
              type: ConfigSlider,
              defaultValue: CONFIG.visual["seek-fade-compensation"] === true,
            },
          ],
          onChange: handleVisualConfigChange,
        })
      ),
    ];
    const syncCreatorHotkeyRows = [
      {
        id: "char-forward",
        label: getSettingsText("syncCreator.shortcuts.charForward", "Advance one character"),
        items: [
          { key: "sync-creator-char-forward-key", defaultValue: CONFIG.visual["sync-creator-char-forward-key"] ?? "right" },
          { key: "sync-creator-char-forward-alt-key", defaultValue: CONFIG.visual["sync-creator-char-forward-alt-key"] ?? "" },
        ],
      },
      {
        id: "char-back",
        label: getSettingsText("syncCreator.shortcuts.charBack", "Revert one character"),
        items: [
          { key: "sync-creator-char-back-key", defaultValue: CONFIG.visual["sync-creator-char-back-key"] ?? "left" },
          { key: "sync-creator-char-back-alt-key", defaultValue: CONFIG.visual["sync-creator-char-back-alt-key"] ?? "" },
        ],
      },
      {
        id: "word-forward",
        label: getSettingsText("syncCreator.shortcuts.wordForward", "Advance one word"),
        items: [
          { key: "sync-creator-word-forward-key", defaultValue: CONFIG.visual["sync-creator-word-forward-key"] ?? "." },
          { key: "sync-creator-word-forward-alt-key", defaultValue: CONFIG.visual["sync-creator-word-forward-alt-key"] ?? "" },
        ],
      },
      {
        id: "word-back",
        label: getSettingsText("syncCreator.shortcuts.wordBack", "Revert one word"),
        items: [
          { key: "sync-creator-word-back-key", defaultValue: CONFIG.visual["sync-creator-word-back-key"] ?? "," },
          { key: "sync-creator-word-back-alt-key", defaultValue: CONFIG.visual["sync-creator-word-back-alt-key"] ?? "" },
        ],
      },
      {
        id: "syllable",
        label: getSettingsText("syncCreator.shortcuts.syllable", "Advance one syllable"),
        items: [
          { key: "sync-creator-syllable-key", defaultValue: CONFIG.visual["sync-creator-syllable-key"] ?? ";" },
          { key: "sync-creator-syllable-alt-key", defaultValue: CONFIG.visual["sync-creator-syllable-alt-key"] ?? "" },
        ],
      },
      {
        id: "drag",
        label: getSettingsText("syncCreator.shortcuts.drag", "Hold to drag"),
        items: [
          { key: "sync-creator-drag-key", defaultValue: CONFIG.visual["sync-creator-drag-key"] ?? "/" },
          { key: "sync-creator-drag-alt-key", defaultValue: CONFIG.visual["sync-creator-drag-alt-key"] ?? "numpaddivide" },
        ],
      },
    ];
    const syncCreatorHotkeyColumns = [
      getSettingsText("settings.shortcuts.primary", "Primary"),
      getSettingsText("settings.shortcuts.secondary", "Secondary"),
    ];
    const renderLyricsSyncControlsSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "sync-creator-settings",
          sectionKey: "sync-creator-settings",
          title: getSettingsText("settings.syncCreatorSettings.title", "Sync Creator Settings"),
          subtitle: getSettingsText("settings.syncCreatorSettings.subtitle", "Configure Sync Creator keyboard behavior and recording shortcuts."),
        },
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
          ],
          onChange: handleVisualConfigChange,
        }),
        react.createElement(SettingsHotkeyTable, {
          rows: syncCreatorHotkeyRows,
          columns: syncCreatorHotkeyColumns,
          onChange: handleVisualConfigChange,
          settingsRegistryItems: syncCreatorHotkeyRows.flatMap((row) =>
            row.items.map((item, index) => ({
              item: {
                ...item,
                desc: `${row.label} (${syncCreatorHotkeyColumns[index]})`,
                type: ConfigHotkey,
              },
              onChange: handleVisualConfigChange,
            }))
          ),
        })
      ),
    ];
    const renderLyricsLanguageSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "karaoke-mode",
          sectionKey: "karaoke-mode",
          title: I18n.t("settingsAdvanced.karaokeMode.title"),
          subtitle: I18n.t("settingsAdvanced.karaokeMode.subtitle"),
        },
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.enabled.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.enabled.desc"),
              key: "karaoke-mode-enabled",
              type: ConfigSlider,
            },
            {
              desc: I18n.t("settingsAdvanced.karaokeMode.motionStyle.label"),
              info: I18n.t("settingsAdvanced.karaokeMode.motionStyle.desc"),
              key: "karaoke-motion-style",
              type: ConfigSelection,
              defaultValue: CONFIG.visual["karaoke-motion-style"] === "expressive" ? "expressive" : "classic",
              options: {
                classic: I18n.t("settingsAdvanced.karaokeMode.motionStyle.options.classic"),
                expressive: I18n.t("settingsAdvanced.karaokeMode.motionStyle.options.expressive"),
              },
              // Expressive motion is a style of the bounce, so it needs the bounce on.
              when: () => CONFIG.visual["karaoke-bounce"] !== false,
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
              when: () => CONFIG.visual["spotify-fake-karaoke-enabled"] === true,
            },
          ],
          onChange: handleVisualConfigChange,
        })
      ),
    ];
    const renderLyricsCacheSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "cache-management",
          sectionKey: "cache-management",
          title: I18n.t("settingsAdvanced.cacheManagement.title"),
          subtitle: I18n.t("settingsAdvanced.cacheManagement.subtitle"),
        },
        // 로컬 캐시 관리 (IndexedDB) - 메모리 캐시와 통합됨
        react.createElement(LocalCacheManager)
      ),
    ];
    const renderLyricsHelperSection = () => [
      // 헬퍼 연동 섹션
      react.createElement(
        SettingsSection,
        {
          key: "lyrics-helper",
          sectionKey: "lyrics-helper",
          title: I18n.t("settings.lyricsHelper.sectionTitle") || "Helper Integration",
          subtitle: I18n.t("settings.lyricsHelper.sectionSubtitle") || "Send lyrics to external helper applications",
        },
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
    ];

    return react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "lyrics" ? "active" : ""}`,
        "data-tab-id": "lyrics",
      },
      ...renderLyricsPlaybackSection(),
      ...renderLyricsLanguageSection(),
      ...renderLyricsSyncControlsSection(),
      ...renderLyricsCacheSection(),
      ...renderLyricsHelperSection(),
    );
  };

  const renderLyricsProvidersTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "lyrics-providers" ? "active" : ""}`,
        "data-tab-id": "lyrics-providers",
      },
      react.createElement(LyricsProvidersTab)
    );

  const handleCulturalSettingChange = (name, value) => {
    CONFIG.visual[name] = value;
    StorageManager.saveConfig(name, value);
    if (name.endsWith("font-family")) loadGoogleFontFamily(value);
    lyricContainerUpdate?.();
    window.dispatchEvent(new CustomEvent("ivLyrics", {
      detail: { type: "config", name, value },
    }));
  };

  const renderCulturalAnnotationsSection = () => {
    const vinylModeLabel = I18n.t("vinyl.mode") || "LP";
    const columns = [
      {
        id: "normal",
        label: getSettingsText("settingsUi.fullscreenViews.normal", "Normal mode"),
        color: "var(--settings-layer-translation)",
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
        ],
      },
      {
        id: "vinyl",
        label: vinylModeLabel,
        color: "var(--settings-layer-base)",
        items: [
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
      },
    ];
    return react.createElement(
      SettingsSection,
      {
        key: "cultural-annotations",
        sectionKey: "cultural-annotations",
        title: I18n.t("settings.culturalAnnotations.label"),
        subtitle: I18n.t("settings.culturalAnnotations.desc"),
      },
      react.createElement(
        "div",
        { className: "settings-group settings-matrix-group", "data-setting-key": "cultural-annotations-group" },
        react.createElement(OptionList, {
          items: [
            {
              desc: I18n.t("settings.culturalAnnotations.label"),
              key: "cultural-annotations-enabled",
              type: ConfigSlider,
              defaultValue: CONFIG.visual["cultural-annotations-enabled"] ?? false,
            },
          ],
          onChange: handleCulturalSettingChange,
        }),
        react.createElement(SettingsLayerMatrix, {
          columns,
          rows: [
            { id: "font", label: I18n.t("settings.culturalAnnotations.fontFamily.label") },
            { id: "size", label: I18n.t("settings.culturalAnnotations.fontSize.label") },
            { id: "weight", label: I18n.t("settings.culturalAnnotations.fontWeight.label") },
            { id: "opacity", label: I18n.t("settings.culturalAnnotations.opacity.label") },
            { id: "outlineWidth", label: I18n.t("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness" },
            { id: "outlineColor", label: I18n.t("settingsAdvanced.textOutline.color.label") || "Text Outline Color" },
          ],
          onChange: handleCulturalSettingChange,
          label: I18n.t("settings.culturalAnnotations.label"),
          masterKey: "cultural-annotations-enabled",
        })
      )
    );
  };

  const renderAiProvidersTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "ai-providers" ? "active" : ""}`,
        "data-tab-id": "ai-providers",
      },
      react.createElement(AIProvidersTab, null, renderCulturalAnnotationsSection()),
      react.createElement(
        "p",
        { className: "settings-footnote" },
        react.createElement(SettingsUiIcon, { name: "info", size: 15 }),
        react.createElement("span", null, I18n.t("settingsUi.aiAutosave"))
      )
    );

  const renderDebugTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "debug" ? "active" : ""}`,
        "data-tab-id": "debug",
      },
      react.createElement(
        SettingsSection,
        {
          sectionKey: "debug-overview",
          title: I18n.t("settingsAdvanced.debugTab.title"),
          subtitle: I18n.t("settingsAdvanced.debugTab.subtitle"),
        },
        react.createElement(DebugInfoPanel)
      )
    );

  const renderNowPlayingTab = () => {
    const panelLayer = (role, labelKey, fallbackLabel, fontKey, fontFallbackLabel, sizeKey, sizeFallback, sizeMin, sizeMax) => ({
      id: role,
      label: getSettingsText(labelKey, fallbackLabel),
      color: `var(--settings-layer-${role})`,
      items: [
        {
          desc: I18n.t(`settingsAdvanced.nowPlayingPanel.${fontKey}.label`) || fontFallbackLabel,
          key: `panel-lyrics-${role}-font`,
          info: I18n.t(`settingsAdvanced.nowPlayingPanel.${fontKey}.desc`) || "",
          type: ConfigFontSelector,
        },
        {
          desc: I18n.t(`settingsAdvanced.nowPlayingPanel.${sizeKey}.label`) || sizeFallback,
          key: `panel-lyrics-${role}-size`,
          info: I18n.t(`settingsAdvanced.nowPlayingPanel.${sizeKey}.desc`) || "",
          type: ConfigSliderRange,
          min: sizeMin,
          max: sizeMax,
          step: 1,
          unit: "px",
        },
        ...createTextOutlineSettingItems(`panel-lyrics-${role}`, {
          labelPrefix: `${I18n.t(`settingsAdvanced.nowPlayingPanel.${fontKey}.label`) || fontFallbackLabel} · `,
        }),
      ],
    });
    const panelColumns = [
      {
        id: "base",
        label: getSettingsText("misc.default", "Default"),
        color: "var(--settings-layer-base)",
        items: [
          {
            desc: I18n.t("settingsAdvanced.nowPlayingPanel.fontFamily.label") || "Font Family",
            key: "panel-lyrics-font-family",
            info: I18n.t("settingsAdvanced.nowPlayingPanel.fontFamily.desc") || "Font for panel lyrics",
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
        ],
      },
      panelLayer("original", "lyricsCacheEditor.original", "Original", "originalFont", "Original Text Font", "originalSize", "Original Text Size", 10, 30),
      panelLayer("phonetic", "menu.pronunciation", "Pronunciation", "phoneticFont", "Phonetic Text Font", "phoneticSize", "Phonetic Text Size", 8, 24),
      panelLayer("translation", "translationMenu.translation", "Translation", "translationFont", "Translation Text Font", "translationSize", "Translation Text Size", 8, 24),
    ];
    const renderNowPlayingPanelSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "panel-lyrics-general",
          sectionKey: "panel-lyrics-general",
          title: I18n.t("settingsAdvanced.nowPlayingPanel.title") || "NowPlaying Panel Lyrics",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.subtitle") || "Lyrics display settings for the Now Playing panel",
        },
        react.createElement(
          "div",
          { className: "settings-group settings-matrix-group" },
          react.createElement(OptionList, {
            items: [
              {
                desc: I18n.t("settingsAdvanced.nowPlayingPanel.enabled.label") || "Enable Panel Lyrics",
                key: "panel-lyrics-enabled",
                info: I18n.t("settingsAdvanced.nowPlayingPanel.enabled.desc") || "Display current lyrics in the Now Playing panel",
                type: ConfigSlider,
              },
            ],
            onChange: handleNowPlayingPanelChange,
          }),
          react.createElement(SettingsLayerMatrix, {
            columns: panelColumns,
            rows: [
              { id: "font", label: I18n.t("settingsAdvanced.originalStyle.fontFamily") },
              { id: "size", label: I18n.t("settingsAdvanced.originalStyle.fontSize.label") },
              { id: "outlineWidth", label: I18n.t("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness" },
              { id: "outlineColor", label: I18n.t("settingsAdvanced.textOutline.color.label") || "Text Outline Color" },
            ],
            onChange: handleNowPlayingPanelChange,
            label: I18n.t("settingsAdvanced.nowPlayingPanel.title") || "NowPlaying Panel Lyrics",
          })
        )
      ),
    ];
    const renderNowPlayingBackgroundSection = () => [
      // 배경 설정 섹션
      react.createElement(
        SettingsSection,
        {
          key: "panel-background",
          sectionKey: "panel-background",
          title: I18n.t("settingsAdvanced.nowPlayingPanel.background.title") || "Background",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.background.subtitle") || "Customize the panel background",
        },
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
          onChange: handleNowPlayingPanelChange,
        })
      ),
    ];
    const renderNowPlayingBorderSection = () => [
      // Border 설정 섹션
      react.createElement(
        SettingsSection,
        {
          key: "panel-border",
          sectionKey: "panel-border",
          title: I18n.t("settingsAdvanced.nowPlayingPanel.border.title") || "Border",
          subtitle: I18n.t("settingsAdvanced.nowPlayingPanel.border.subtitle") || "Customize the panel border",
        },
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
          onChange: handleNowPlayingPanelChange,
        })
      ),
    ];

    return react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "nowplaying" ? "active" : ""}`,
        "data-tab-id": "nowplaying",
      },
      ...renderNowPlayingPanelSection(),
      ...renderNowPlayingBackgroundSection(),
      ...renderNowPlayingBorderSection(),
    );
  };

  const renderAppearanceInstrumentalBreakSection = () =>
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
              when: () => CONFIG.visual["instrumental-break-show-label"] === true,
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
              when: () => CONFIG.visual["instrumental-break-show-label"] === true,
            },
            {
              desc: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.label") || "Text Label Weight",
              key: "instrumental-break-label-font-weight",
              info: I18n.t("settingsAdvanced.instrumentalBreak.labelStyle.fontWeight.desc") || "Font weight for the text label",
              type: ConfigFontWeightSlider,
              defaultValue: getInstrumentalBreakLabelStyleDefault("font-weight", null, 200),
              when: () => CONFIG.visual["instrumental-break-show-label"] === true,
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
              when: () => CONFIG.visual["instrumental-break-show-label"] === true,
            },
            ...createTextOutlineSettingItems("instrumental-break-label", {
              when: () => CONFIG.visual["instrumental-break-show-label"] === true,
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
        });

  const getMultiVocalRegistryItems = () => {
    const helper = getMultiVocalColorHelper();
    return MULTI_VOCAL_COLOR_GROUPS.flatMap((group) =>
      group.speakers.map((speaker) => {
        const key = helper.getSettingKey?.(speaker) || `multi-vocal-speaker-color-${speaker.toLowerCase().replace(/\s+/g, "-")}`;
        return {
          item: {
            desc: `${I18n.t(group.labelKey) || group.fallbackLabel} · ${speaker}`,
            key,
            type: ConfigColorPicker,
            defaultValue: helper.getTextColor?.(speaker) || CONFIG.visual[key],
          },
          onChange: (_name, value) => {
            const saved = helper.setTextColor?.(speaker, value) || value;
            helper.applyCssVariables?.();
            lyricContainerUpdate?.();
            window.dispatchEvent(new CustomEvent("ivLyrics", {
              detail: { type: "config", name: key, value: saved },
            }));
          },
        };
      })
    );
  };

  const renderAppearanceTab = () => {
    const renderAppearanceVisualEffectsSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "background-experience",
          sectionKey: "background-experience",
          title: I18n.t("sections.visualEffects"),
          subtitle: I18n.t("sections.visualEffectsSubtitle"),
        },
        isFadActive &&
          react.createElement(
            "div",
            { className: "settings-note is-info", "data-section-content": "true" },
            react.createElement(SettingsUiIcon, { name: "info", size: 16 }),
            react.createElement(
              "div",
              { className: "settings-note-body" },
              react.createElement("b", null, I18n.t("sections.fadWarningTitle")),
              " ",
              I18n.t("sections.fadWarningDesc"),
              react.createElement("br"),
              I18n.t("sections.fadWarningTip")
            )
          ),
        react.createElement(BackgroundExperienceSection, {
          isFadActive,
          settingsRegistryItems: getBackgroundRegistryItems,
        })
      ),
    ];
    const renderAppearanceLyricLayersSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "lyric-layers",
          sectionKey: "lyric-layers",
          title: getSettingsText("settingsUi.sections.lyricLayers.title", "Lyric layers"),
          subtitle: getSettingsText(
            "settingsUi.sections.lyricLayers.subtitle",
            "Compare and adjust the original, pronunciation, translation and furigana fonts in one place."
          ),
        },
        react.createElement(
          "div",
          { className: "settings-group settings-matrix-group" },
          react.createElement(SettingsLayerMatrix, {
            columns: buildLyricsTypographyColumns({
              onChange: saveLyricsTypographySetting,
              furiganaOnChange: handleAppearancePreviewChange,
            }),
            rows: getLyricsTypographyRows(),
            onChange: saveLyricsTypographySetting,
            label: getSettingsText("settingsUi.sections.lyricLayers.title", "Lyric layers"),
          })
        )
      ),
    ];
    const renderAppearanceSyncModeSection = () => {
      const lineWindowItems = [
        {
          desc: I18n.t("settingsAdvanced.syncMode.linesBefore.label"),
          key: "lines-before",
          info: I18n.t("settingsAdvanced.syncMode.linesBefore.desc"),
          type: ConfigSelection,
          options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
        {
          desc: I18n.t("settingsAdvanced.syncMode.linesAfter.label"),
          key: "lines-after",
          info: I18n.t("settingsAdvanced.syncMode.linesAfter.desc"),
          type: ConfigSelection,
          options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
      ];
      return [
        react.createElement(
          SettingsSection,
          {
            key: "sync-mode",
            sectionKey: "sync-mode",
            title: I18n.t("settingsAdvanced.syncMode.title"),
            subtitle: I18n.t("settingsAdvanced.syncMode.subtitle"),
          },
          react.createElement(
            "div",
            { className: "settings-group" },
            react.createElement(SettingsLineWindow, {
              items: lineWindowItems,
              onChange: handleVisualConfigChange,
              settingsRegistryItems: lineWindowItems.map((item) => ({ item, onChange: handleVisualConfigChange })),
            })
          ),
          react.createElement(OptionList, {
            items: [
              {
                desc: I18n.t("settingsAdvanced.syncMode.highlightIntensity.label"),
                key: "highlight-intensity",
                info: I18n.t("settingsAdvanced.syncMode.highlightIntensity.desc"),
                type: ConfigSliderRange,
                min: 30,
                max: 90,
                step: 5,
                unit: "%",
                when: () => CONFIG.visual["highlight-mode"] === true,
              },
            ],
            onChange: handleVisualConfigChange,
          })
        ),
      ];
    };
    const renderAppearanceMultiVocalSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "multi-vocal-colors",
          sectionKey: "multi-vocal-colors",
          title: I18n.t("settingsAdvanced.multiVocalColors.title") || "Multi-vocal Colors",
          subtitle: I18n.t("settingsAdvanced.multiVocalColors.subtitle") || "Customize male, female, and duet speaker colors.",
        },
        react.createElement(
          "div",
          { className: "settings-group" },
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
            onChange: handleVisualConfigChange,
          }),
          react.createElement(ConfigMultiVocalColorSettings, {
            settingsRegistryItems: getMultiVocalRegistryItems,
          })
        )
      ),
    ];
    const renderAppearanceInstrumentalSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "instrumental-break",
          sectionKey: "instrumental-break",
          title: I18n.t("settingsAdvanced.instrumentalBreak.title") || "Instrumental Marker",
          subtitle: I18n.t("settingsAdvanced.instrumentalBreak.subtitle") || "Replace long blank or note-only lyric gaps with an icon",
        },
        renderAppearanceInstrumentalBreakSection()
      ),
    ];
    const renderAppearanceTextShadowSection = () => [
      react.createElement(
        SettingsSection,
        {
          key: "text-shadow",
          sectionKey: "text-shadow",
          title: I18n.t("settingsAdvanced.textShadow.title"),
          subtitle: I18n.t("settingsAdvanced.textShadow.subtitle"),
        },
        react.createElement(OptionList, {
          items: [
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
          onChange: handleAppearancePreviewChange,
        })
      ),
    ];

    return react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "appearance" ? "active" : ""}`,
        "data-tab-id": "appearance",
      },
      ...renderAppearanceVisualEffectsSection(),
      ...renderAppearanceLyricLayersSection(),
      ...renderAppearanceTextShadowSection(),
      ...renderAppearanceSyncModeSection(),
      ...renderAppearanceMultiVocalSection(),
      ...renderAppearanceInstrumentalSection(),
    );
  };

  const renderAdvancedExportImportSection = () =>
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
													background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
													border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12));
													border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: var(--settings-text, rgba(248, 250, 252, 0.9));
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
												background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: var(--danger, rgba(255, 107, 107, 0.9));
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

                        // A settings file can point AI endpoints at a different
                        // host while API keys already stored locally stay in
                        // place, so the next request would send the existing key
                        // there. Confirm before overwriting, like every other
                        // destructive path in this screen.
                        const settingCount = Object.keys(cfg).length;
                        const confirmed = window.confirm(
                          I18n.t("settingsAdvanced.exportImport.import.confirm", { count: settingCount })
                        );
                        if (!confirmed) {
                          button.textContent = originalText;
                          button.disabled = false;
                          return;
                        }

                        await StorageManager.importConfig(cfg);

                        const resultContainer = getSettingsResultContainer(button, "export-result-container");

                        resultContainer.innerHTML = `<div style="
													padding: 16px 20px;
													background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
													border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12));
													border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: var(--settings-text, rgba(248, 250, 252, 0.9));
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
												background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-bottom-left-radius: 0;
												border-bottom-right-radius: 0;
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: var(--danger, rgba(255, 107, 107, 0.9));
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
        });
  const renderAdvancedDbExportImportSection = () =>
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
                    background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
                    border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12));
                    border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                    border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                    border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                  ">
                    <div style="
                      display: flex;
                      align-items: center;
                      gap: 12px;
                      color: var(--settings-text, rgba(248, 250, 252, 0.9));
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
                      background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
                      border: 1px solid rgba(255, 107, 107, 0.2);
                      border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                      border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                      border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                    ">
                      <div style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        color: var(--danger, rgba(255, 107, 107, 0.9));
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
                          background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
                          border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12));
                          border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom-left-radius: 0;
                          border-bottom-right-radius: 0;
                        ">
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            color: var(--settings-text, rgba(248, 250, 252, 0.9));
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
                            background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
                            border: 1px solid rgba(255, 107, 107, 0.2);
                            border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                            border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                            border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          ">
                            <div style="
                              display: flex;
                              align-items: center;
                              gap: 12px;
                              color: var(--danger, rgba(255, 107, 107, 0.9));
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
        });
  const renderAdvancedTab = () => {
    const renderAdvancedLanguageDetectionSection = () => [
        react.createElement(SettingsSection, {
          key: "language-detection",
          sectionKey: "language-detection",
          title: I18n.t("settingsAdvanced.languageDetection.title"),
          subtitle: I18n.t("settingsAdvanced.languageDetection.subtitle"),
        },
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
          onChange: handleVisualConfigChange,
        })
        ),
    ];
    const renderAdvancedCloudSyncSection = () => [
        react.createElement(SettingsSection, {
          key: "cloud-sync",
          sectionKey: "cloud-sync",
          title: I18n.t("settingsAdvanced.cloudSync.title"),
          subtitle: I18n.t("settingsAdvanced.cloudSync.monthlyRequired"),
        },
        react.createElement(ConfigCloudSync)
        ),
    ];
    const renderAdvancedExportImportGroup = () => [
        react.createElement(SettingsSection, {
          key: "export-import",
          sectionKey: "export-import",
          title: I18n.t("settingsAdvanced.exportImport.title"),
          subtitle: I18n.t("settingsAdvanced.exportImport.subtitle"),
        },
        renderAdvancedExportImportSection()
        ),
    ];
    const renderAdvancedSettingsPresetsSection = () => [
        react.createElement(SettingsSection, {
          key: "settings-presets",
          sectionKey: "settings-presets",
          title: I18n.t("settingsAdvanced.settingsPresets.title"),
          subtitle: I18n.t("settingsAdvanced.settingsPresets.subtitle"),
        },
        react.createElement(ConfigSettingsPresets)
        ),
    ];
    const renderAdvancedDbExportImportGroup = () => [
        react.createElement(SettingsSection, {
          key: "db-export-import",
          sectionKey: "db-export-import",
          title: I18n.t("settingsAdvanced.dbExportImport.title"),
          subtitle: I18n.t("settingsAdvanced.dbExportImport.subtitle"),
        },
        renderAdvancedDbExportImportSection()
        ),
    ];
    const renderAdvancedResetSection = () => [
        react.createElement(SettingsSection, {
          key: "reset-settings",
          sectionKey: "reset-settings",
          title: I18n.t("settingsAdvanced.resetSettings.title"),
          subtitle: I18n.t("settingsAdvanced.resetSettings.subtitle"),
        },
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
													background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
													border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12));
													border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: var(--settings-text, rgba(248, 250, 252, 0.9));
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
												background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-bottom-left-radius: 0;
												border-bottom-right-radius: 0;
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: var(--danger, rgba(255, 107, 107, 0.9));
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
    ];

    return react.createElement(
      "div",
        {
          className: `tab-content ${activeTab === "advanced" ? "active" : ""}`,
          "data-tab-id": "advanced",
        },
      ...renderAdvancedLanguageDetectionSection(),
      ...renderAdvancedSettingsPresetsSection(),
      ...renderAdvancedCloudSyncSection(),
      ...renderAdvancedExportImportGroup(),
      ...renderAdvancedDbExportImportGroup(),
      ...renderAdvancedResetSection(),
    );
  };

  const renderFullscreenUiSection = () => {
    const items = [
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
          ];
    const itemsByKey = new Map(items.map((item) => [item.key, item]));
    const chip = (key, icon, children) => ({
      item: itemsByKey.get(key),
      icon,
      children: children.map((childKey) => itemsByKey.get(childKey)).filter(Boolean),
    });
    return react.createElement(SettingsTiles, {
      chips: [
        chip("fullscreen-show-clock", "clock", ["fullscreen-clock-size", "fullscreen-clock-outline-width", "fullscreen-clock-outline-color"]),
        chip("fullscreen-show-context", "context", ["fullscreen-show-context-image"]),
        chip("fullscreen-show-next-track", "next", ["fullscreen-next-track-seconds"]),
        chip("fullscreen-show-lyrics-progress", "lprogress", []),
        chip("fullscreen-show-queue", "queue", []),
      ],
      onChange: handleVisualConfigChange,
      settingsRegistryItems: items.map((item) => ({ item, onChange: handleVisualConfigChange })),
    });
  };
  const renderFullscreenStyleSection = () =>
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
          onChange: handleVisualConfigChange,
        });
  const renderFullscreenTab = () => {
    // ===== 기본 설정 섹션 =====
    const renderFullscreenBasicSection = () => [
          react.createElement(SettingsSection, {
            key: "fullscreen-mode",
            sectionKey: "fullscreen-mode",
            title: I18n.t("settingsAdvanced.fullscreenMode.title"),
            subtitle: I18n.t("settingsAdvanced.fullscreenMode.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
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
            onChange: handleVisualConfigChange,
          })
          ),
    ];
    // CD owns its appearance and visualizer controls, independently of LP.
    const renderFullscreenCdSection = () => getCdSettingsSections().map((section) =>
      react.createElement(SettingsSection, {
        key: section.sectionKey, sectionKey: section.sectionKey,
        title: I18n.t(section.titleKey), subtitle: I18n.t(section.subtitleKey),
        view: "cd", hidden: fullscreenView !== "cd",
      }, react.createElement(OptionList, { items: section.items, onChange: saveVinylSetting }))
    );
    // ===== LP 모드 섹션 =====
    const renderFullscreenVinylSection = () => [
          react.createElement(SettingsSection, {
            key: "vinyl-mode",
            sectionKey: "vinyl-mode",
            title: I18n.t("vinyl.mode"),
            subtitle: I18n.t("vinyl.settings.subtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
          react.createElement(FullscreenPresentationPicker, {
            defaultValue:
              CONFIG.visual["fullscreen-focus-presentation"] || "vinyl",
            onChange: saveVinylSetting,
          }),
          react.createElement(OptionList, {
            items: [
              {
                desc: I18n.t("vinyl.settings.albumClickOpensModeLabel"),
                info: I18n.t("vinyl.settings.albumClickOpensModeDesc"),
                key: "fullscreen-album-open-lp",
                type: ConfigSlider,
                defaultValue: CONFIG.visual["fullscreen-album-open-lp"] !== false,
              },
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
                desc: I18n.t("vinyl.settings.trackChangeAnimationLabel"),
                info: I18n.t("vinyl.settings.trackChangeAnimationDesc"),
                key: "fullscreen-vinyl-track-change-animation",
                type: ConfigSlider,
                defaultValue: CONFIG.visual["fullscreen-vinyl-track-change-animation"] !== false,
              },
              {
                desc: I18n.t("vinyl.settings.rotationSpeedLabel"),
                info: I18n.t("vinyl.settings.rotationSpeedDesc"),
                key: "fullscreen-vinyl-rotation-speed",
                type: ConfigSliderRange,
                min: 25,
                max: 200,
                step: 5,
                unit: "%",
                defaultValue: CONFIG.visual["fullscreen-vinyl-rotation-speed"] ?? 100,
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

          ),
          react.createElement(SettingsSection, {
            key: "vinyl-tonearm",
            sectionKey: "vinyl-tonearm",
            title: I18n.t("vinyl.settings.tonearmTitle"),
            subtitle: I18n.t("vinyl.settings.tonearmSubtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
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
                presentation: "seg",
                swatchMap: { white: "#f2f2f2", silver: "#b9bec7", black: "#1d1f24" },
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

          ),
          react.createElement(SettingsSection, {
            key: "vinyl-typography",
            sectionKey: "vinyl-typography",
            title: I18n.t("sections.typography"),
            subtitle: I18n.t("vinyl.settings.typographySubtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
          react.createElement(
            "div",
            { className: "settings-group settings-matrix-group" },
            react.createElement(SettingsLayerMatrix, {
              columns: buildLyricsTypographyColumns({ vinyl: true, onChange: saveVinylSetting }),
              rows: getLyricsTypographyRows(),
              onChange: saveVinylSetting,
              label: I18n.t("sections.typography"),
            })
          ),

          ),
          react.createElement(SettingsSection, {
            key: "video-stage-typography",
            sectionKey: "video-stage-typography",
            title: I18n.t("vinyl.settings.videoStageTypographyTitle"),
            subtitle: I18n.t("vinyl.settings.videoStageTypographySubtitle"),
            view: "vinyl",
            hidden: fullscreenView !== "vinyl",
          },
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
          })
          ),
    ];
    // ===== 일반 모드 레이아웃 섹션 =====
    const renderFullscreenNormalLayoutSection = () => [
          react.createElement(SettingsSection, {
            key: "normal-mode",
            sectionKey: "normal-mode",
            title: I18n.t("settingsAdvanced.normalMode.title"),
            subtitle: I18n.t("settingsAdvanced.normalMode.subtitle"),
            view: "normal",
            hidden: fullscreenView !== "normal",
          },
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
            onChange: handleVisualConfigChange,
          })
          ),
    ];
    // ===== TV 모드 섹션 =====
    const renderFullscreenTvModeSection = () => [
          react.createElement(SettingsSection, {
            key: "tv-mode",
            sectionKey: "tv-mode",
            title: I18n.t("settingsAdvanced.tvMode.title"),
            subtitle: I18n.t("settingsAdvanced.tvMode.subtitle"),
            view: "tv",
            hidden: fullscreenView !== "tv",
          },
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
            onChange: handleVisualConfigChange,
          })
          ),
    ];
    // ===== 제목/아티스트 설정 섹션 =====
    const renderFullscreenTitleArtistSection = () => [
          react.createElement(SettingsSection, {
            key: "metadata-display",
            sectionKey: "metadata-display",
            title: I18n.t("settingsAdvanced.metadataDisplay.title"),
            subtitle: I18n.t("settingsAdvanced.metadataDisplay.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
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
            onChange: handleVisualConfigChange,
          }),
          ),
          react.createElement(SettingsSection, {
            key: "fullscreen-style",
            sectionKey: "fullscreen-style",
            title: I18n.t("settingsAdvanced.fullscreenStyle.title"),
            subtitle: I18n.t("settingsAdvanced.fullscreenStyle.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          renderFullscreenStyleSection(),
          ),
          react.createElement(SettingsSection, {
            key: "fullscreen-ui",
            sectionKey: "fullscreen-ui",
            title: I18n.t("settingsAdvanced.fullscreenUI.title"),
            subtitle: I18n.t("settingsAdvanced.fullscreenUI.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          renderFullscreenUiSection(),
          ),
          react.createElement(SettingsSection, {
            key: "controller-style",
            sectionKey: "controller-style",
            title: I18n.t("settingsAdvanced.controllerStyle.title"),
            subtitle: I18n.t("settingsAdvanced.controllerStyle.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
          react.createElement(OptionList, {
            items: [
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
            onChange: handleVisualConfigChange,
          }),
          ),
          react.createElement(SettingsSection, {
            key: "auto-hide",
            sectionKey: "auto-hide",
            title: I18n.t("settingsAdvanced.autoHide.title"),
            subtitle: I18n.t("settingsAdvanced.autoHide.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
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
            onChange: handleVisualConfigChange,
          }),
          ),
          react.createElement(SettingsSection, {
            key: "tmi-style",
            sectionKey: "tmi-style",
            title: I18n.t("settingsAdvanced.tmiStyle.title"),
            subtitle: I18n.t("settingsAdvanced.tmiStyle.subtitle"),
            view: "basic",
            hidden: fullscreenView !== "basic",
          },
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
            onChange: handleVisualConfigChange,
          })
          ),
    ];

    return react.createElement(
      "div",
        {
          className: `tab-content ${activeTab === "fullscreen" ? "active" : ""}`,
          "data-tab-id": "fullscreen",
        },
      ...renderFullscreenBasicSection(),
      ...renderFullscreenTitleArtistSection(),
      ...renderFullscreenNormalLayoutSection(),
      ...renderFullscreenTvModeSection(),
      ...renderFullscreenCdSection(),
      ...renderFullscreenVinylSection(),
    );
  };

  const renderAboutUpdateSection = () =>
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
                    if (updateInfo.error) {
                      resultContainer.innerHTML = `
												<div style="
													padding: 16px 20px;
													background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
													border: 1px solid rgba(255, 107, 107, 0.2);
													border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: var(--danger, rgba(255, 107, 107, 0.9));
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
													background: var(--settings-surface-2, rgba(255, 255, 255, 0.04));
													border: 1px solid rgba(74, 222, 128, 0.15);
													border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
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
																	color: var(--settings-text, rgba(255, 255, 255, 0.95));
																	margin-bottom: 2px;
																	letter-spacing: -0.01em;
																">${safeUpdateAvailable}</div>
																<div style="
																	font-size: 12px;
																	color: var(--settings-text-3, rgba(255, 255, 255, 0.5));
																">${safeVersionChange} ${safeCurrentVersion} → ${safeLatestVersion}</div>
															</div>
														</div>
													</div>
													
													<div style="
														background: var(--settings-bg, rgba(0, 0, 0, 0.25));
														border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
														border-radius: 8px;
														padding: 12px 14px;
														margin-bottom: 12px;
													">
														<div style="
															font-size: 12px;
															color: var(--settings-text-3, rgba(255, 255, 255, 0.6));
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
															background: var(--settings-surface-3, rgba(255, 255, 255, 0.1));
															border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.15));
															color: var(--settings-text, rgba(255, 255, 255, 0.9));
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
															background: var(--settings-surface-3, rgba(255, 255, 255, 0.08));
															border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.15));
															color: var(--settings-text, rgba(255, 255, 255, 0.9));
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
													background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
													border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12));
													border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
													border-bottom-left-radius: 0;
													border-bottom-right-radius: 0;
												">
													<div style="
														display: flex;
														align-items: center;
														gap: 12px;
														color: var(--settings-text, rgba(248, 250, 252, 0.9));
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
												background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
												border: 1px solid rgba(255, 107, 107, 0.2);
												border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
												border-bottom-left-radius: 0;
												border-bottom-right-radius: 0;
											">
												<div style="
													display: flex;
													align-items: center;
													gap: 12px;
													color: var(--danger, rgba(255, 107, 107, 0.9));
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
        });
  const renderAboutClientInfoSection = () =>
    react.createElement(
      "div",
      { className: "settings-group info-card about-info-card about-client-card", "data-section-content": "true" },
      react.createElement(
        "p",
        { className: "about-info-description about-info-description-compact" },
        I18n.t("settingsAdvanced.aboutTab.clientInfo.description"),
      ),
      react.createElement(
        "div",
        { className: "about-client-id-row" },
        react.createElement(
          "code",
          { className: "about-client-id-box" },
          Spicetify.LocalStorage.get("ivLyrics:user-hash")
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "btn about-client-copy-btn",
            onClick: () => {
              const clientId = Spicetify.LocalStorage.get("ivLyrics:user-hash");
              navigator.clipboard.writeText(clientId).then(() => {
                Toast.success(I18n.t("settingsAdvanced.aboutTab.clientInfo.copied"));
              }).catch(() => {
                Toast.error(I18n.t("settingsAdvanced.aboutTab.clientInfo.copyFailed"));
              });
            },
          },
          I18n.t("settingsAdvanced.aboutTab.clientInfo.copy")
        )
      )
    );

  const renderAboutAppInfoSection = () =>
    react.createElement(
      "div",
      { className: "settings-group info-card about-info-card", "data-section-content": "true" },
      react.createElement(
        "div",
        { className: "settings-app-card" },
        react.createElement("span", { className: "settings-app-logo", "aria-hidden": "true" }, "iv"),
        react.createElement(
          "div",
          { className: "settings-app-card-main" },
          react.createElement("h3", { className: "about-info-title" }, "ivLyrics"),
          react.createElement(
            "p",
            { className: "about-info-description" },
            `${I18n.t("settingsAdvanced.aboutTab.versionPrefix")} ${Utils.currentVersion} · ${I18n.t("settingsAdvanced.aboutTab.appDescription")}`
          )
        )
      ),
      react.createElement(
        "dl",
        { className: "settings-kv about-info-meta" },
        react.createElement("dt", null, String(I18n.t("settingsAdvanced.aboutTab.developer")).replace(/[:：]s*$/, "")),
        react.createElement("dd", { className: "about-info-line" }, "ivLis Studio"),
        react.createElement("dt", null, String(I18n.t("settingsAdvanced.aboutTab.originalProject")).replace(/[:：]s*$/, "")),
        react.createElement("dd", { className: "about-info-line" }, "lyrics-plus by khanhas")
      ),
      react.createElement(
        "div",
        { className: "settings-group-foot" },
        react.createElement("p", { className: "about-info-note" }, I18n.t("settingsAdvanced.aboutTab.thanks")),
        react.createElement(
          "div",
          { className: "settings-group-foot-actions" },
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn btn-sm settings-github-btn",
              title: I18n.t("settingsAdvanced.aboutTab.visitGithub"),
              onClick: () => window.open("https://github.com/ivLis-Studio/ivLyrics", "_blank"),
            },
            react.createElement(SettingsUiIcon, { name: "github", size: 15 }),
            react.createElement("span", null, I18n.t("settingsAdvanced.aboutTab.viewOnGithub"))
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn btn-sm settings-discord-btn",
              onClick: () => window.open("https://ivlis.kr/ivLyrics/discord.php", "_blank"),
            },
            react.createElement(SettingsUiIcon, { name: "discord", size: 15 }),
            react.createElement("span", null, I18n.t("settingsAdvanced.aboutTab.joinDiscord"))
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn btn-sm settings-coffee-btn",
              title: I18n.t("settingsAdvanced.donate.title"),
              onClick: () => window.open("https://buymeacoffee.com/ivlis", "_blank"),
            },
            react.createElement(SettingsUiIcon, { name: "coffee", size: 15 }),
            react.createElement("span", null, I18n.t("settingsAdvanced.donate.button"))
          )
        )
      )
    );

  const renderAboutTab = () =>
    react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "about" ? "active" : ""}`,
        "data-tab-id": "about",
      },
      // Discord 계정 연동 섹션 (최상단)
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-account",
          title: I18n.t("settingsAdvanced.aboutTab.account.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.account.subtitle"),
        },
        react.createElement(AccountSection)
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-update",
          title: I18n.t("settingsAdvanced.aboutTab.update.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.update.subtitle"),
        },
        renderAboutUpdateSection()
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-app-info",
          title: I18n.t("settingsAdvanced.aboutTab.appInfo.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.subtitle"),
        },
        renderAboutAppInfoSection()
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-client-info",
          title: I18n.t("settingsAdvanced.aboutTab.clientInfo.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.clientInfo.subtitle"),
        },
        renderAboutClientInfoSection()
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-patch-notes",
          title: I18n.t("settingsAdvanced.aboutTab.patchNotes.title"),
          subtitle: I18n.t("settingsAdvanced.aboutTab.patchNotes.subtitle"),
        },
        react.createElement(
          "div",
          {
            id: "patch-notes-container",
            className: "settings-group settings-patch-notes is-loading",
            "data-section-content": "true",
          },
          I18n.t("settingsAdvanced.aboutTab.patchNotes.loading")
        )
      )
    );

  const renderTabContent = (tabId) => {
    switch (tabId) {
      case "general": return renderGeneralTab();
      case "lyrics-providers": return renderLyricsProvidersTab();
      case "ai-providers": return renderAiProvidersTab();
      case "appearance": return renderAppearanceTab();
      case "performance": return renderPerformanceTab();
      case "lyrics": return renderLyricsTab();
      case "fullscreen": return renderFullscreenTab();
      case "nowplaying": return renderNowPlayingTab();
      case "advanced": return renderAdvancedTab();
      case "debug": return renderDebugTab();
      case "about": return renderAboutTab();
      default: return renderGeneralTab();
    }
  };

  // Every setting with an index.js default, found by walking the menus'
  // element trees (the same item definitions and save handlers the menus use).
  function buildSettingsRegistry() {
    const entries = [];
    const seen = new Set();
    const add = (tabId, section, item, onChange, labelPrefix) => {
      if (!item || !item.key || seen.has(item.key)) return;
      if (item.key !== SETTINGS_BACKGROUND_MODE_KEY && !hasSettingDefault(item.key)) return;
      if (getCanonicalSettingsDestination(tabId, item.key).tabId !== tabId) return;
      seen.add(item.key);
      entries.push({
        key: item.key,
        tabId,
        sectionKey: section?.sectionKey || null,
        sectionTitle: section?.title || "",
        item: labelPrefix && !String(item.desc || "").startsWith(labelPrefix)
          ? { ...item, desc: `${labelPrefix} · ${item.desc}` }
          : item,
        onChange: item.onChange || onChange,
      });
    };
    const walk = (node, tabId, section) => {
      if (Array.isArray(node)) {
        node.forEach((child) => walk(child, tabId, section));
        return;
      }
      if (!node || typeof node !== "object" || !node.props) return;
      const props = node.props;
      let nextSection = section;
      if (node.type === SettingsSection) {
        nextSection = { sectionKey: props.sectionKey, title: props.title };
      }
      if (node.type === OptionList) {
        (props.items || []).forEach((item) => add(tabId, nextSection, item, props.onChange));
      }
      if (node.type === SettingsLayerMatrix) {
        (props.columns || []).forEach((column) => {
          const handler = column.onChange || props.onChange;
          if (column.toggle) add(tabId, nextSection, { ...column.toggle, type: ConfigSlider }, handler);
          (column.items || []).forEach((item) => add(tabId, nextSection, item, handler, column.label));
        });
      }
      // A function is evaluated only here, when the registry is built.
      const registryItems = typeof props.settingsRegistryItems === "function"
        ? props.settingsRegistryItems()
        : props.settingsRegistryItems;
      if (Array.isArray(registryItems)) {
        registryItems.forEach(({ item, onChange }) => add(tabId, nextSection, item, onChange));
      }
      walk(props.children, tabId, nextSection);
    };
    sidebarTabs.forEach((tab) => {
      try {
        walk(renderTabContent(tab.id), tab.id, null);
      } catch (error) {
        console.warn("[ivLyrics] settings registry skipped", tab.id, error);
      }
    });
    return entries;
  }

  const resetChangedEntries = (entries) => {
    entries.forEach((entry) => {
      try {
        entry.onChange(entry.key, getSettingDefaultValue(entry.key));
      } catch (error) {
        console.error("[ivLyrics] Failed to reset setting", entry.key, error);
      }
    });
    window.dispatchEvent(new CustomEvent("ivLyrics:settings-refresh", { detail: { reset: true } }));
  };

  const renderChangedView = () => {
    const changedEntries = buildSettingsRegistry().filter((entry) => isSettingChanged(entry.key));
    if (!changedEntries.length) {
      return react.createElement(
        "div",
        { className: "tab-content active settings-changed-view", "data-tab-id": "changed" },
        react.createElement(
          "div",
          { className: "settings-empty-state" },
          react.createElement("span", { className: "settings-empty-icon", "aria-hidden": "true" }, react.createElement(SettingsUiIcon, { name: "check", size: 22 })),
          react.createElement("b", null, getSettingsText("settingsUi.changed.emptyTitle", "No changed settings")),
          react.createElement("span", null, getSettingsText("settingsUi.changed.emptyDesc", "Every setting is at its default."))
        )
      );
    }
    const resetLabel = getSettingsText("creatorProfile.resetDecoration", "Reset to default");
    return react.createElement(
      "div",
      { className: "tab-content active settings-changed-view", "data-tab-id": "changed" },
      react.createElement(
        "div",
        { className: "settings-changed-tools" },
        react.createElement(
          "span",
          { className: "settings-pill is-accent" },
          getSettingsText("settingsUi.changed.count", "{count}").replace("{count}", String(changedEntries.length))
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "btn btn-sm",
            onClick: () => {
              const message = getSettingsText("settingsUi.changed.resetConfirm", "Reset {count} settings to their defaults?")
                .replace("{count}", String(changedEntries.length));
              // eslint-disable-next-line no-alert
              if (!window.confirm(message)) return;
              resetChangedEntries(changedEntries);
            },
          },
          react.createElement(SettingsUiIcon, { name: "reset", size: 15 }),
          react.createElement("span", null, resetLabel)
        )
      ),
      ...sidebarTabs.map((tab) => {
        const entries = changedEntries.filter((entry) => entry.tabId === tab.id);
        if (!entries.length) return null;
        return react.createElement(
          "section",
          { key: tab.id, className: "settings-changed-menu" },
          react.createElement(
            "h3",
            { className: "settings-changed-menu-title" },
            react.createElement(SettingsOutlineIcon, { name: tab.icon, size: 15 }),
            tab.label
          ),
          react.createElement(OptionList, {
            items: entries.map((entry) => ({
              ...entry.item,
              defaultValue: entry.key === SETTINGS_BACKGROUND_MODE_KEY
                ? getCurrentSettingsBackgroundMode()
                : entry.item.defaultValue,
              when: undefined,
              onChange: (_name, value, event) => entry.onChange(entry.key, value, event),
              jump: {
                label: entry.sectionTitle || tab.label,
                onClick: () => navigateToDestination(entry.tabId, entry.key),
              },
            })),
          })
        );
      })
    );
  };

  return react.createElement(
    "div",
    {
      id: `${APP_NAME}-config-container`,
      ref: rootRef,
      className: `settings-app${shouldReduceMotion ? " motion-reduced" : ""}`,
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
      "div",
      { className: "settings-body" },
      renderRail(),
      react.createElement(
        "main",
        {
          className: "settings-content",
          ref: settingsContentRef,
          tabIndex: -1,
          "aria-label": changedView ? changedViewTitle : activeTabMeta.label,
        },
        react.createElement(
          "div",
          { className: "settings-page" },
          renderPageHead(),
          changedView ? renderChangedView() : renderTabContent(activeTab)
        )
      ),
      react.createElement(SettingsDock, {
        open: dockOpen,
        onToggle: toggleDock,
        menu: activeTab,
        signal: activeSectionSignal,
        fullscreenView,
        onNavigate: navigateToDestination,
      })
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
    try {
      dom.unmountComponentAtNode?.(modalContainer);
    } finally {
      // React cleanup failures must not leave an invisible, pointer-blocking scrim.
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

      // In a field, Escape first undoes the edit (back to the value it had
      // when it was focused) and leaves the field; the next Escape closes.
      const field = isSettingsEditableField(e.target) ? e.target : null;
      if (field) {
        const before = field.dataset?.ivBefore;
        if (before !== undefined && field.value !== before) {
          const prototype = field.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
          if (setValue) setValue.call(field, before);
          else field.value = before;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
        field.blur();
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
