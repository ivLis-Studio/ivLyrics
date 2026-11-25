export function renderLyricsGenerationStatus({
  react, translate, generationPills, isSyncCreatorActive, isFullscreenMarketplace,
}) {
  const generationCompleteLabel = translate("generationStatus.complete") || "완료!";
  const generationStatusDefinitions = [
    {
      key: "lyrics",
      label: translate("syncCreator.loadLyrics") || "가사 불러오기",
      description: translate("syncCreator.loadingLyrics") || "가사를 불러오는 중...",
    },
    {
      key: "translation",
      label: translate("menu.translationLabel") || translate("notifications.requestingTranslation"),
      description: translate("notifications.requestingTranslation"),
    },
    {
      key: "pronunciation",
      label: translate("menu.pronunciation") || translate("notifications.requestingPronunciation"),
      description: translate("notifications.requestingPronunciation"),
    },
    {
      key: "cultural-annotations",
      label: translate("generationStatus.culturalAnnotations") || "문화적 설명",
      description: translate("generationStatus.culturalAnnotationsLoading") || "문화적 설명을 생성하는 중...",
    },
    {
      key: "word-supplements",
      label: translate("generationStatus.wordSupplements") || "Word details",
      description: translate("generationStatus.wordSupplementsLoading") || "Loading word readings & glosses...",
    },
    {
      key: "word-sync",
      label: translate("generationStatus.wordSync") || "Word timing",
      description: translate("generationStatus.externalWordSync") || "Generating word-level timing on an external lyrics server.",
      failureLabel: translate("generationStatus.wordSyncFailed") || "Word timing failed",
      failureDescription: translate("generationStatus.externalWordSyncFailed") || "Could not generate or apply word-level timing. Keeping the current lyrics.",
    },
    {
      key: "pronunciation-sync",
      label: translate("generationStatus.pronunciationSync") || "Pronunciation timing",
      description: translate("generationStatus.pronunciationSyncLoading") || "AI is matching the pronunciation to the lyric timing...",
      failureLabel: translate("generationStatus.pronunciationSyncFailed") || "Pronunciation timing failed",
      failureDescription: translate("generationStatus.pronunciationSyncFailedDesc") || "Could not time the pronunciation with AI. Showing approximate timing.",
    },
    {
      key: "video-background",
      label: translate("settings.videoBackground.label") || translate("videoBackground.loading"),
      description: translate("videoBackground.loadingMessage"),
    },
    {
      key: "motion-direction",
      label: translate("generationStatus.motionDirection") || "Motion direction",
      description: translate("vinyl.presentation.motionDirecting") || "AI is directing the motion…",
      failureLabel: translate("generationStatus.motionDirectionFailed") || "Motion direction failed",
      failureDescription: translate("vinyl.presentation.motionDirectFailed") || "AI direction failed. Using the built-in direction.",
    },
  ];
  const generationStatuses = generationStatusDefinitions
    .map((definition) => {
      const pill = generationPills?.[definition.key];
      if (!pill || pill.phase === "idle") return null;

      const isComplete = pill.phase === "complete" || pill.phase === "exiting";
      const isFailed = pill.phase === "failed" || pill.phase === "failed-exiting";
      const label = pill.label || definition.label;
      return {
        ...definition,
        ...pill,
        isFailed,
        label,
        completeLabel: isFailed ? definition.failureLabel : generationCompleteLabel,
        description: isFailed ? definition.failureDescription : isComplete
          ? `${label} ${generationCompleteLabel}`
          : (pill.description || definition.description),
      };
    })
    .filter(Boolean);
  return generationStatuses.length > 0 &&
    !isSyncCreatorActive &&
    !isFullscreenMarketplace
    ? react.createElement(
      "div",
      {
        className: "lyrics-generation-status-stack",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "false",
      },
      generationStatuses.map((status) => react.createElement(
        "div",
        {
          key: status.key,
          className: `lyrics-translation-loading-indicator is-${status.phase}`,
          "data-kind": status.key,
          "data-phase": status.phase,
          dir: "auto",
        },
        react.createElement(
          "span",
          {
            className: "lyrics-generation-status-icon",
            "aria-hidden": "true",
          },
          react.createElement("span", {
            className: "lyrics-translation-loading-spinner",
          }),
          react.createElement(
            "svg",
            {
              className: status.isFailed ? "lyrics-generation-status-error" : "lyrics-generation-status-check",
              viewBox: "0 0 16 16",
              fill: "none",
            },
            react.createElement("path", {
              d: status.isFailed ? "M4 4 12 12 M12 4 4 12" : "M3.25 8.25 6.5 11.25 12.75 4.75",
              stroke: "currentColor",
              strokeWidth: "2.2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            })
          )
        ),
        react.createElement(
          "span",
          {
            className: "lyrics-translation-loading-label",
            "aria-hidden": "true",
          },
          react.createElement(
            "span",
            { className: "lyrics-generation-status-loading-label" },
            status.label
          ),
          react.createElement(
            "span",
            { className: "lyrics-generation-status-complete-label" },
            status.completeLabel
          )
        ),
        react.createElement(
          "span",
          { className: "lyrics-generation-status-description" },
          status.description
        )
      ))
    )
    : null;
}
