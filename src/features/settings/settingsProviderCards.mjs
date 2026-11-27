import {
  LYRICS_PROVIDER_TYPE_COLUMNS, getSettingsAiCapabilityLabel, getSettingsAiProviderColumns,
  getLyricsProviderGranularitySupport, readLyricsProviderTypeSetting, getLocalizedProviderDescription,
} from "./settingsProviderCapabilities.mjs";

export function createSettingsProviderCards({
  react, translate, getSettingsText, SettingsUiIcon,
  readAiManager, readLyricsManager, readAiLanguage, readLyricsLanguage, readCurrentLanguage,
}) {
  const { useMemo } = react;
  const useProviderSettingsUI = (provider) =>
    useMemo(() => provider.getSettingsUI ? provider.getSettingsUI() : null, [provider, provider.getSettingsUI]);

  const renderProviderIdentity = (displayName, description, isEnabled, onToggle) => [
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
          onChange: (event) => onToggle(event.target.checked),
        }),
        react.createElement("span", { className: "toggle-slider" })
      )
    ),
  ];

  const renderProviderCapability = ({ key, enabled, isOwner, label, title, onClick, typeClass = "" }, chip) => {
    if (!onClick) {
      return chip ? null : react.createElement("span", { key, className: "settings-cap-cell" },
        react.createElement("span", { className: "settings-cap-none", "aria-hidden": "true" }));
    }
    const control = react.createElement("button", {
      key,
      type: "button",
      className: `${chip ? "settings-cap-chip" : "settings-cap-toggle"}${enabled ? " is-on" : ""}${isOwner ? " is-owner" : ""}${typeClass}`,
      "aria-pressed": !!enabled,
      "aria-label": title,
      title,
      onClick,
    }, chip ? label : react.createElement(SettingsUiIcon, { name: "check", size: 13 }));
    return chip ? control : react.createElement("span", { key, className: "settings-cap-cell" }, control);
  };

  const providerSearchText = (provider, description, translationPrefix) => [
    provider.name,
    provider.author,
    description,
    ...Object.keys(provider.supports || {})
      .filter((key) => provider.supports[key])
      .map((key) => `${key} ${translate(`${translationPrefix}.${key}`) || ""}`),
  ].filter(Boolean).join(" ");

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
    const SettingsUI = useProviderSettingsUI(addon);

    const toggleCapability = (cap) => {
      const manager = readAiManager();
      if (manager) {
        const newValue = !manager.isCapabilityEnabled(addon.id, cap);
        manager.setCapabilityEnabled(addon.id, cap, newValue);
        onCapabilityChange?.(cap, newValue);
      }
    };

    const displayName = addon.name || addon.id;
    const description = getLocalizedProviderDescription(addon.description, readAiLanguage, readCurrentLanguage);

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
    const capabilityLabel = (capability) => getSettingsAiCapabilityLabel(translate, capability);
    const connectionLabel = getSettingsText("settingsUi.sections.aiConnections.title", "Connection");
    const firstTriedLabel = getSettingsText("settingsUi.providers.firstTried", "Tried first");
    const manager = readAiManager();
    const capabilities = columns.map((key) => {
      if (!addon.supports?.[key]) return { key };
      // The row button is the provider-level master switch. Endpoint settings
      // remain in the connection card.
      const enabled = manager?.isCapabilityEnabled(addon.id, key) === true;
      const isOwner = owners?.[key] === addon.id;
      const label = capabilityLabel(key);
      const title = `${displayName} · ${label}${isOwner ? ` · ${firstTriedLabel}` : ""}`;
      return { key, enabled, isOwner, label, title, onClick: () => toggleCapability(key) };
    });

    return react.createElement("div", {
      className: `lyrics-provider-card settings-provider-row${isExpanded ? " expanded" : ""}${isEnabled ? "" : " disabled"}`,
      "data-setting-key": `ai-provider:${addon.id}`,
      "data-search-text": providerSearchText(addon, description, "settings.aiProviders.supports"),
    },
      ...renderProviderIdentity(displayName, description, isEnabled, onToggle),
      ...capabilities.map((capability) => renderProviderCapability(capability, false)),
      react.createElement("button", {
        type: "button",
        className: "settings-provider-more",
        "aria-label": `${displayName} · ${connectionLabel}`,
        title: connectionLabel,
        disabled: !SettingsUI,
        onClick: onExpandToggle,
      }, react.createElement(SettingsUiIcon, { name: "right", size: 16 })),
      react.createElement("div", { className: "settings-provider-chips" },
        ...capabilities.map((capability) => renderProviderCapability(capability, true))
      )
    );
  };

  // 가사 제공자 카드 컴포넌트 (제공자 표의 한 행)
  const LyricsProviderCard = ({ provider, isEnabled, onToggle, isExpanded, onExpandToggle, owners, onTypeChange }) => {
    const manager = readLyricsManager();
    const SettingsUI = useProviderSettingsUI(provider);

    const handleTypeToggle = (type) => {
      const manager = readLyricsManager();
      if (!manager) return;
      const value = !readLyricsProviderTypeSetting(manager, provider.id, type);
      manager.setAddonSetting(provider.id, `enable_${type}`, value);
      onTypeChange?.(type, value);
    };

    const supportedTypes = { ...provider.supports, ...getLyricsProviderGranularitySupport(provider) };
    const displayName = provider.name || provider.id;
    const description = getLocalizedProviderDescription(provider.description, readLyricsLanguage, readCurrentLanguage);
    const typeLabel = (type) => translate(`settings.lyricsProviders.supports.${type}`) || type;
    const detailLabel = getSettingsText("shareImage.advancedSettings", "Advanced Settings");
    const firstTriedLabel = getSettingsText("settingsUi.providers.firstTried", "Tried first");

    const types = LYRICS_PROVIDER_TYPE_COLUMNS.map((key) => {
      if (!supportedTypes[key]) return { key };
      const enabled = readLyricsProviderTypeSetting(manager, provider.id, key);
      const isOwner = owners?.[key] === provider.id;
      const label = typeLabel(key);
      const title = `${displayName} · ${label}${isOwner ? ` · ${firstTriedLabel}` : ""}`;
      return { key, enabled, isOwner, label, title, onClick: () => handleTypeToggle(key), typeClass: ` type-${key}` };
    });

    return react.createElement("div", {
      className: `lyrics-provider-card settings-provider-row${isExpanded ? " expanded" : ""}${isEnabled ? "" : " disabled"}`,
      "data-setting-key": `lyrics-provider:${provider.id}`,
      "data-search-text": providerSearchText(provider, description, "settings.lyricsProviders.types"),
    },
      ...renderProviderIdentity(displayName, description, isEnabled, onToggle),
      ...types.map((type) => renderProviderCapability(type, false)),
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
        ...types.map((type) => renderProviderCapability(type, true))
      ),
      isExpanded && SettingsUI && react.createElement("div", { className: "lyrics-provider-card-body" },
        react.createElement(SettingsUI)
      )
    );
  };

  return { AddonSettingsCard, LyricsProviderCard };
}
