import {
  LYRICS_PROVIDER_TYPE_COLUMNS, getSettingsAiCapabilityLabel, getSettingsAiProviderColumns,
  getLyricsProviderGranularitySupport, readLyricsProviderTypeSetting, getLocalizedProviderDescription,
} from "./settingsProviderCapabilities.mjs";

export function createSettingsProviderCards({
  react, translate, getSettingsText, SettingsUiIcon,
  readAiManager, readLyricsManager, readAiLanguage, readLyricsLanguage, readCurrentLanguage,
}) {
  const { useMemo } = react;
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
    const searchText = [
      addon.name,
      addon.author,
      description,
      ...Object.keys(addon.supports || {})
        .filter((capability) => addon.supports[capability])
        .map((capability) =>
          `${capability} ${translate(`settings.aiProviders.supports.${capability}`) || ""}`
        ),
    ].filter(Boolean).join(" ");

    const renderCapability = (cap, chip) => {
      if (!addon.supports?.[cap]) {
        return chip ? null : react.createElement("span", { key: cap, className: "settings-cap-cell" },
          react.createElement("span", { className: "settings-cap-none", "aria-hidden": "true" }));
      }
      // Endpoint-own selections live in the connection card; the row toggle is
      // the provider-level master switch for every provider, per-endpoint or not.
      const enabled = readAiManager()?.isCapabilityEnabled(addon.id, cap) === true;
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
    const manager = readLyricsManager();
    const SettingsUI = useMemo(
      () => provider.getSettingsUI ? provider.getSettingsUI() : null,
      [provider, provider.getSettingsUI]
    );

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

    const renderType = (type, chip) => {
      if (!supportedTypes[type]) {
        return chip ? null : react.createElement("span", { key: type, className: "settings-cap-cell" },
          react.createElement("span", { className: "settings-cap-none", "aria-hidden": "true" }));
      }
      const enabled = readLyricsProviderTypeSetting(manager, provider.id, type);
      const isOwner = owners?.[type] === provider.id;
      const label = `${displayName} · ${typeLabel(type)}${isOwner ? ` · ${firstTriedLabel}` : ""}`;
      const control = react.createElement("button", {
        key: type,
        type: "button",
        className: `${chip ? "settings-cap-chip" : "settings-cap-toggle"}${enabled ? " is-on" : ""}${isOwner ? " is-owner" : ""} type-${type}`,
        "aria-pressed": !!enabled,
        "aria-label": label,
        title: label,
        onClick: () => handleTypeToggle(type),
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
            `${lyricsType} ${translate(`settings.lyricsProviders.types.${lyricsType}`) || ""}`
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

  return { AddonSettingsCard, LyricsProviderCard };
}
