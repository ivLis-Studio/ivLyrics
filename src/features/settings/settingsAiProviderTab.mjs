import { getSettingsAiCapabilityLabel, getSettingsAiProviderColumns } from "./settingsProviderCapabilities.mjs";
import { useSettingsProviderList } from "./useSettingsProviderList.mjs";
import { renderSettingsSectionShell } from "./settingsSectionShell.mjs";

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

export function createSettingsAiProviderTab({
  react, translate, readManager, schedule, cancel, requestFrame, cancelFrame, findConnectionCard,
  listView: { renderSettingsProviderItems, renderSettingsProviderTableHead, renderSettingsProviderLegend },
  AddonSettingsCard, OptionList, ConfigSliderRange,
}) {
  const { useLayoutEffect, useRef, useState } = react;
  const AIProvidersTab = ({ children } = {}) => {
    const [translationStyle, setTranslationStyle] = useState(() => readManager()?.getTranslationStyle?.() || "natural");
    const [providerRetryCount, setProviderRetryCount] = useState(() => readManager()?.getProviderRetryCount?.() ?? 2);
    // Capability switches change which provider is tried first.
    const [, setCapabilityRevision] = useState(0);

    const pendingRevealsRef = useRef(null);
    useLayoutEffect(() => {
      const pending = new Set();
      pendingRevealsRef.current = pending;
      return () => {
        pendingRevealsRef.current = null;
        for (const reveal of pending) {
          if (reveal.frameId != null) cancelFrame(reveal.frameId);
        }
        pending.clear();
      };
    }, []);

    const {
      providers, sortedProviders, enabledProviders, expandedProviders, setExpandedProviders, dragState,
      moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState,
      handleToggleEnabled, toggleExpanded,
    } = useSettingsProviderList({
      react, readManager, schedule, cancel,
      observeSettings: ["provider:capability:changed"],
      onReady: (manager, isActive) => {
        setTranslationStyle(manager.getTranslationStyle?.() || "natural");
        setProviderRetryCount(manager.getProviderRetryCount?.() ?? 2);
        const unsubscribeStyle = manager.on?.("translation:style:changed", ({ style }) => {
          if (isActive()) setTranslationStyle(style || "natural");
        });
        const unsubscribeRetryCount = manager.on?.("provider:retry-count:changed", ({ retryCount }) => {
          if (isActive()) setProviderRetryCount(Number(retryCount) || 0);
        });
        return () => {
          if (typeof unsubscribeStyle === "function") unsubscribeStyle();
          if (typeof unsubscribeRetryCount === "function") unsubscribeRetryCount();
        };
      },
    });

    const handleTranslationStyleChange = (style) => {
      const nextStyle = readManager()?.setTranslationStyle?.(style) || style;
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
        const card = findConnectionCard(providerId);
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
      const pending = pendingRevealsRef.current;
      if (!pending) return;
      const reveal = { frameId: null };
      pending.add(reveal);
      reveal.frameId = requestFrame(() => {
        if (!pending.has(reveal)) return;
        // Wait for the expanded card to commit before measuring its position.
        reveal.frameId = requestFrame(() => {
          if (pending.delete(reveal)) bringIntoView();
        });
      });
    };

    const capabilityColumns = getSettingsAiProviderColumns(sortedProviders);
    // Mirrors AIAddonManager.getEnabledProvidersFor: the provider-level flag
    // is the master switch (ceiling) for every provider, including per-endpoint
    // add-ons, whose endpoints decide their own choices underneath it.
    const isCapabilityOn = (provider, capability) => {
      if (!provider?.supports?.[capability]) return false;
      return readManager()?.isCapabilityEnabled?.(provider.id, capability) ?? true;
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
      renderSettingsSectionShell(react, {
        sectionKey: "ai-tasks",
        title: translate("settingsUi.sections.aiTasks.title") || "Providers by task",
        subtitle: translate("settings.aiProviders.description") || "Select and prioritize AI providers. Providers at the top are tried first. On failure, the next provider is automatically used.",
        children: providers.length > 0
          ? react.createElement("div", {
            className: "settings-group settings-provider-table is-ai",
            style: { "--provider-caps": capabilityColumns.length },
          },
            react.createElement("div", { className: "settings-provider-caption" },
              react.createElement("b", null, translate("settings.aiProviders.enabledCapabilities") || "Enabled Capabilities"),
              react.createElement("span", null, translate("settings.aiProviders.capabilitiesDesc") || "Select which features this provider handles")),
            renderSettingsProviderTableHead({
              columns: capabilityColumns,
              labelFor: (capability) => getSettingsAiCapabilityLabel(translate, capability),
              owners,
              providerNames,
              noneLabel: translate("misc.none") || "None",
              providerLabel: translate("settingsUi.groups.providers") || "Providers",
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
            react.createElement("p", null, translate("settings.aiProviders.noProviders") || "등록된 AI 제공자가 없습니다.")
          ),
      }),
      renderSettingsSectionShell(react, {
        sectionKey: "ai-translation",
        title: translate("settings.aiProviders.translationStyle.title") || "Translation style",
        subtitle: translate("settings.aiProviders.translationStyle.description")
          || "Choose how closely AI translations follow the original wording. Line structure and meaning are preserved in every mode.",
        children: react.createElement("div", {
          className: "ai-translation-style-options",
          role: "radiogroup",
          "aria-label": translate("settings.aiProviders.translationStyle.title") || "Translation style"
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
                  translate(option.labelKey) || option.labelFallback
                )
              ),
              react.createElement("span", { className: "ai-translation-style-option-description" },
                translate(option.descriptionKey) || option.descriptionFallback
              )
            );
          })
        ),
      }),
      children,
      renderSettingsSectionShell(react, {
        sectionKey: "ai-request",
        title: translate("settingsUi.sections.aiRequest.title") || "Requests",
        children: react.createElement(OptionList, {
          items: [
            {
              desc: translate("settings.aiProviders.retryCount.label") || "Retries per provider",
              key: "ai-provider-retry-count",
              info: translate("settings.aiProviders.retryCount.description")
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
            const nextValue = readManager()?.setProviderRetryCount?.(value)
              ?? (Number.isFinite(numericValue) ? numericValue : 2);
            setProviderRetryCount(nextValue);
          },
        }),
      }),
      connectionProviders.length > 0 && renderSettingsSectionShell(react, {
        sectionKey: "ai-connections",
        title: translate("settingsUi.sections.aiConnections.title") || "Connections",
        subtitle: translate("settingsUi.sections.aiConnections.subtitle") || "Manage the connection details each provider needs, such as API keys and models.",
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

  return AIProvidersTab;
}
