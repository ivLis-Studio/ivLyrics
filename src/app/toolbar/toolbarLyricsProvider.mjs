export function createToolbarLyricsProvider({ react, ToolbarMenuItem, readProviders, getOptionsText, translate, openSearch }) {
  const LyricsProviderSelectButton = react.memo(
    ({
      selectedProvider,
      isLoading,
      isLocalTrack = false,
      hasLocalLyrics = false,
      onOpen,
    }) => {
      const providers = !isLocalTrack && selectedProvider
        ? readProviders()
        : [];
      const value = isLocalTrack
        ? (hasLocalLyrics ? getOptionsText("menu.localLyricsProvider", "Local") : "")
        : selectedProvider
          ? providers.find((provider) => provider.id === selectedProvider)?.name || selectedProvider
          : translate("menu.lyricsProviderAuto");

      return react.createElement(ToolbarMenuItem, {
        icon: isLocalTrack ? "localLyrics" : "provider",
        label: isLocalTrack
          ? getOptionsText("menu.localLyricsTools", "로컬 가사")
          : translate("menu.lyricsProviderSelect"),
        value,
        drill: true,
        disabled: isLoading && !isLocalTrack,
        onClick: onOpen,
      });
    }
  );

  // The view behind the provider item. closeModal closes the whole panel (a file
  // picker or a dialog takes over); closeView goes back to the 현재 곡 list.
  function buildLyricsProviderView({
    currentProvider,
    selectedProvider,
    isLocalTrack = false,
    trackInfo = null,
    onSelectProvider,
    onImportLocalLyricsFile,
    onApplyLocalLyrics,
    getHasLocalLyrics,
    onDeleteLocalLyrics,
    closeModal,
    closeView,
  }) {
    const providers = readProviders();
    const providerOptions = [
      { key: "auto", value: translate("menu.lyricsProviderAuto") },
      ...providers.map((provider) => ({
        key: provider.id,
        value: provider.name || provider.id,
      })),
    ];

    if (
      selectedProvider &&
      !providerOptions.some((option) => option.key === selectedProvider)
    ) {
      providerOptions.push({
        key: selectedProvider,
        value: `${selectedProvider} (${translate("menu.lyricsProviderUnavailable")})`,
      });
    }

    const currentProviderLabel =
      isLocalTrack
        ? getOptionsText("menu.localLyricsProvider", "Local")
        : (
          providers.find((provider) => provider.id === currentProvider)?.name ||
          currentProvider ||
          translate("menu.unknownLanguage")
        );

    if (isLocalTrack) {
      const hasLocalLyrics = !!getHasLocalLyrics?.();
      return {
        title: getOptionsText("menu.localLyricsTools", "로컬 가사"),
        subtitle: getOptionsText(
          "menu.localLyricsToolsSubtitle",
          "로컬 곡은 ivLyrics 서버와 분리됩니다. LRC 파일을 가져오거나 LRCLIB에서 직접 검색해 이 기기에 저장합니다."
        ),
        groups: [
          [
            {
              key: "current-local-lyrics-provider",
              type: "info",
              label: getOptionsText("menu.localLyricsCurrent", "현재 로컬 가사"),
              value: currentProviderLabel || "local",
            },
            {
              key: "local-lyrics-import",
              type: "button",
              label: getOptionsText("menu.importLrcFile", "LRC 파일 가져오기"),
              buttonText: getOptionsText("menu.import", "가져오기"),
              onClick: () => {
                closeModal?.();
                onImportLocalLyricsFile?.();
              },
            },
            {
              key: "local-lyrics-lrclib-search",
              type: "button",
              label: getOptionsText("menu.searchLrclibLocal", "LRCLIB에서 검색"),
              buttonText: getOptionsText("menu.search", "검색"),
              disabled: !trackInfo?.uri,
              onClick: () => {
                if (!trackInfo?.uri) return;
                closeModal?.();
                openSearch({
                  trackInfo,
                  onApplyLocalLyrics,
                });
              },
            },
            // 가져온 로컬 가사는 곡 캐시가 아니라 이 기기에 저장된 사용자 데이터라서,
            // 캐시 삭제로는 지워지지 않는다. 저장된 가사가 있을 때 여기서 직접 지운다.
            hasLocalLyrics && {
              key: "local-lyrics-delete",
              type: "button",
              danger: true,
              label: getOptionsText("menu.localLyricsDelete", "로컬 가사 삭제"),
              buttonText: getOptionsText("buttons.delete", "삭제"),
              onClick: () => {
                closeModal?.();
                onDeleteLocalLyrics?.();
              },
            },
          ].filter(Boolean),
        ],
      };
    }

    return {
      title: translate("menu.lyricsProviderSelect"),
      subtitle: translate("menu.lyricsProviderSelectSubtitle"),
      groups: [
        [
          {
            key: "current-lyrics-provider",
            type: "info",
            label: translate("menu.lyricsProviderCurrent"),
            value: currentProviderLabel,
          },
        ],
        [
          {
            key: "track-lyrics-provider",
            type: "choice",
            label: translate("menu.lyricsProviderSelect"),
            options: providerOptions,
            value: selectedProvider || "auto",
            onPick: async (value) => {
              await onSelectProvider?.(value === "auto" ? null : value);
              closeView?.();
            },
          },
        ],
      ],
    };
  }

  return { LyricsProviderSelectButton, buildLyricsProviderView };
}
