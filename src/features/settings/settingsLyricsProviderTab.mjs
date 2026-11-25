import {
  LYRICS_PROVIDER_TYPE_COLUMNS, getLyricsProviderGranularitySupport, readLyricsProviderTypeSetting,
} from "./settingsProviderCapabilities.mjs";
import { useSettingsProviderList } from "./useSettingsProviderList.mjs";
import { renderSettingsSectionShell } from "./settingsSectionShell.mjs";

export function createSettingsLyricsProviderTab({
  react, translate, readManager, schedule, cancel, getVisualSettings, saveSetting, notifyConfigChange,
  listView: { renderSettingsProviderItems, renderSettingsProviderTableHead, renderSettingsProviderLegend, renderSettingsProviderGlyph },
  LyricsProviderCard, OptionList, ConfigSlider,
}) {
  const { useState } = react;

  const LyricsProvidersTab = () => {
    const {
      providers, sortedProviders, enabledProviders, expandedProviders, dragState,
      moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState,
      handleToggleEnabled, toggleExpanded,
    } = useSettingsProviderList({ react, readManager, schedule, cancel,
      observeSettings: ["addon:setting:changed", "provider:sync-data-priority:changed", "provider:lyrics-type-priority:changed"],
    });
    // Changes to lookup policy and per-type switches update the chain and its owners.
    const [, setDisplayRevision] = useState(0);
    const manager = readManager();
    const preferSyncDataProviderEnabled =
      manager?.isPreferSyncDataProviderEnabled?.()
      ?? (getVisualSettings()["prefer-sync-data-provider"] !== false);
    const preferLyricsTypeOverProviderOrderEnabled =
      manager?.isPreferLyricsTypeOverProviderOrderEnabled?.()
      ?? (getVisualSettings()["prefer-lyrics-type-over-provider-order"] !== false);

    const typeLabel = (type) => translate(`settings.lyricsProviders.supports.${type}`) || type;
    const isTypeSupported = (provider, type) => (
      type === "synced" || type === "unsynced"
        ? !!provider?.supports?.[type]
        : !!getLyricsProviderGranularitySupport(provider)[type]
    );
    // Same defaults as the provider rows, including the legacy karaoke switch.
    const isTypeEnabled = (provider, type) => !!readLyricsProviderTypeSetting(readManager(), provider.id, type);
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
        label: translate("settings.lyricsProviders.supports.ivLyricsSync") || "ivLyrics Sync",
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
      renderSettingsSectionShell(react, {
        sectionKey: "lyrics-lookup",
        title: translate("settingsUi.sections.lyricsLookup.title") || "Lookup order",
        subtitle: translate("settingsUi.sections.lyricsLookup.subtitle") || "Choose what to check first when looking for lyrics.",
        children: react.createElement("div", { className: "settings-group settings-lookup-group" },
          react.createElement(OptionList, {
            items: [
              {
                desc: translate("settings.lyricsProviders.preferSyncDataProvider.label") || "Prioritize providers with sync data",
                info: translate("settings.lyricsProviders.preferSyncDataProvider.desc") || "When sync data is available for the current track, try its matching lyrics provider before the normal provider order.",
                key: "prefer-sync-data-provider",
                type: ConfigSlider,
                defaultValue: preferSyncDataProviderEnabled,
              },
              {
                desc: translate("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.label") || "Prioritize lyrics type over provider order",
                info: translate("settings.lyricsProviders.preferLyricsTypeOverProviderOrder.desc") || "Try karaoke lyrics across all providers first, then synced lyrics, then plain lyrics. Provider order is preserved within each type.",
                key: "prefer-lyrics-type-over-provider-order",
                type: ConfigSlider,
                defaultValue: preferLyricsTypeOverProviderOrderEnabled,
              },
            ],
            onChange: (name, value) => {
              const manager = readManager();
              if (
                name === "prefer-sync-data-provider"
                && typeof manager?.setPreferSyncDataProviderEnabled === "function"
              ) {
                manager.setPreferSyncDataProviderEnabled(value);
              } else if (
                name === "prefer-lyrics-type-over-provider-order"
                && typeof manager?.setPreferLyricsTypeOverProviderOrderEnabled === "function"
              ) {
                manager.setPreferLyricsTypeOverProviderOrderEnabled(value);
              } else {
                getVisualSettings()[name] = value;
                saveSetting(name, value);
                manager?._triggerLyricsRefresh?.();
              }
              notifyConfigChange(name, value);
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
      renderSettingsSectionShell(react, {
        sectionKey: "lyrics-provider-list",
        title: translate("settings.lyricsProviders.title") || "Lyrics Providers",
        subtitle: translate("settings.lyricsProviders.description") || "Select and prioritize lyrics providers. Providers at the top are tried first.",
        children: providers.length > 0
          ? react.createElement("div", {
            className: "settings-group settings-provider-table",
            style: { "--provider-caps": LYRICS_PROVIDER_TYPE_COLUMNS.length },
          },
            react.createElement("div", { className: "settings-provider-caption" },
              react.createElement("b", null, translate("settings.lyricsProviders.allowedTypes") || "Allowed Lyrics Types")),
            renderSettingsProviderTableHead({
              columns: LYRICS_PROVIDER_TYPE_COLUMNS,
              labelFor: typeLabel,
              providerLabel: translate("settingsUi.groups.providers") || "Providers",
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
            react.createElement("p", null, translate("settings.lyricsProviders.noProviders") || "등록된 가사 제공자가 없습니다.")
          ),
      })
    );
  };

  return LyricsProvidersTab;
}
