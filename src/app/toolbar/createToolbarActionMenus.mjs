import { readLearningMode } from "#ivlyrics/features/learning/learningModeRuntime.mjs";
import { readActiveCommunityVideo } from "#ivlyrics/features/video/videoSyncRuntimeState.mjs";
import { SETTINGS_BACKGROUND_PRESETS, getSettingsBackgroundPresetLabel } from "#ivlyrics/features/settings/settingsBackgroundPresets.mjs";
import { createToolbarLyricsProvider } from "./toolbarLyricsProvider.mjs";

export function createToolbarActionMenus({
  react, host, translate, notify, getOptionsText, readVisualSettings, extractTrackId, readProviders,
  dialogs, ToolbarMenuItem, ToolbarMenuList,
}) {
  const { openLocalLyricsLrclibSearchModal, openCommunityVideoSelector, openShareImageModal, openSyncDataCreator } = dialogs;
  const { LyricsProviderSelectButton, buildLyricsProviderView } = createToolbarLyricsProvider({
    react, ToolbarMenuItem, getOptionsText, readProviders, translate,
    openSearch: openLocalLyricsLrclibSearchModal,
  });

  const getBackgroundPresetLabel = (modeId) => getSettingsBackgroundPresetLabel(modeId, getOptionsText);

  const getTrackBackgroundOptions = () => {
    return [
      {
        key: "inherit",
        value: getOptionsText("menu.trackBackgroundUseGlobal", "기본 설정 사용"),
      },
      ...SETTINGS_BACKGROUND_PRESETS.map((preset) => ({
        key: preset.id,
        value: getBackgroundPresetLabel(preset.id),
      })),
    ];
  };

  // 현재 곡 > 개별 배경: drills into the background view below, which keeps the
  // choices and handler of the dialog it replaces.
  const TrackBackgroundButton = react.memo(
    ({ trackUri, overrideMode, onOpen }) =>
      react.createElement(ToolbarMenuItem, {
        icon: "background",
        label: getOptionsText("menu.trackBackground", "개별 배경"),
        value: overrideMode
          ? getBackgroundPresetLabel(overrideMode)
          : getOptionsText("menu.trackBackgroundUseGlobal", "기본 설정 사용"),
        drill: true,
        onClick: () => {
          if (!trackUri) {
            notify("error", translate("notifications.noTrackPlaying"));
            return;
          }
          onOpen?.();
        },
      })
  );

  function buildTrackBackgroundView({ overrideMode, effectiveMode, onSelectBackground, onOpenSettings }) {
    const backgroundOptions = getTrackBackgroundOptions();
    const selectedKey = overrideMode || "inherit";
    const selectedOption =
      backgroundOptions.find((option) => option.key === selectedKey) ||
      backgroundOptions[0];

    return {
      title: getOptionsText("menu.trackBackgroundTitle", "개별 배경"),
      subtitle: getOptionsText(
        "menu.trackBackgroundSubtitle",
        "이 곡에서만 사용할 배경 종류를 선택합니다. 블러, 밝기, 영상 배율 같은 세부 옵션은 기본 배경 설정을 따릅니다."
      ),
      groups: [
        [
          {
            key: "current-track-background",
            type: "info",
            label: getOptionsText("menu.trackBackgroundCurrent", "현재 적용 배경"),
            value: getBackgroundPresetLabel(effectiveMode || "none"),
          },
        ],
        [
          {
            key: "track-background-mode",
            type: "choice",
            label: getOptionsText("menu.trackBackgroundSelect", "이 곡의 배경"),
            options: backgroundOptions,
            value: selectedOption?.key,
            onPick: async (value) => {
              await onSelectBackground?.(value === "inherit" ? null : value);
            },
          },
        ],
      ],
      note: {
        text: getOptionsText(
          "menu.trackBackgroundSelectInfo",
          "기본 설정 사용을 선택하면 설정 > 외관 > 시각효과의 배경을 그대로 사용합니다."
        ),
        actionLabel: translate("menu.openSettings"),
        onAction: () => onOpenSettings?.({ initialTab: "appearance", initialSettingKey: "background-experience" }),
      },
    };
  }

  // 현재 곡 > 영상 선택, listed while the video background is in use.
  const CommunityVideoButton = react.memo(({ trackUri, videoInfo, onVideoSelect, defaultStartTime = 0, enabled = readVisualSettings()["video-background"], onBeforeOpen }) => {
    // 비디오 배경이 비활성화되어 있으면 항목 숨김
    if (!enabled) {
      return null;
    }

    const handleClick = () => {
      onBeforeOpen?.();
      const activeVideoInfo = readActiveCommunityVideo(host);
      const activeVideoId = activeVideoInfo?.trackUri === trackUri
        ? activeVideoInfo.youtubeVideoId
        : null;
      openCommunityVideoSelector(
        trackUri,
        activeVideoId || videoInfo?.youtubeVideoId,
        onVideoSelect,
        defaultStartTime
      );
    };

    return react.createElement(ToolbarMenuItem, {
      icon: "communityVideo",
      label: translate("communityVideo.selectVideo"),
      onClick: handleClick,
    });
  });

  // 더보기 > 가사 이미지 공유. Track details are read when the dialog opens.
  const ShareImageButton = react.memo(({ lyrics, getTrackInfo, onBeforeOpen }) => {
    const handleClick = () => {
      const trackInfo = lyrics?.length ? getTrackInfo?.(lyrics) : null;
      onBeforeOpen?.();
      if (!trackInfo) {
        notify("error", translate("notifications.shareImageNoLyrics"));
        return;
      }
      openShareImageModal(lyrics, trackInfo);
    };

    return react.createElement(ToolbarMenuItem, {
      icon: "shareImage",
      label: translate("menu.shareImage"),
      onClick: handleClick,
    });
  });

  // 현재 곡 > 노래방 싱크 생성. A local track cannot be submitted (it has no
  // Spotify trackId); a song without karaoke sync carries the invitation that
  // used to float beside the toolbar.
  const SyncDataCreatorButton = react.memo(({ trackUri, getTrackInfo, hasKaraokeSync = true, onBeforeOpen }) => {
    const hasTrackId = !!extractTrackId(trackUri);
    const disabledTooltip = translate("syncCreator.trackIdRequired") || "Spotify trackId가 없는 로컬 곡은 노래방 싱크를 등록할 수 없습니다.";

    const handleClick = () => {
      if (!hasTrackId) {
        notify("error", disabledTooltip);
        return;
      }
      onBeforeOpen?.();
      void openSyncDataCreator(getTrackInfo?.() || { uri: trackUri }, null);
    };

    return react.createElement(ToolbarMenuItem, {
      icon: "syncCreator",
      label: translate("syncCreator.buttonTooltip") || "Create Karaoke Sync",
      desc: !hasTrackId
        ? disabledTooltip
        : hasKaraokeSync
          ? null
          : translate("syncCreator.clickHereHint") || null,
      disabled: !hasTrackId,
      onClick: handleClick,
    });
  });

  // 현재 곡 panel: provider (or local lyrics), the song's own background, video
  // selection while the video background is used, and the karaoke sync creator.
  const CurrentTrackMenu = ({ toolbar, actions, onOpenView, closePanel }) => {
    const hasLocalLyrics = toolbar.isLocalTrack && !!actions.getHasLocalLyrics?.();
    return react.createElement(
      ToolbarMenuList,
      { label: getOptionsText("menu.currentTrack", "현재 곡") },
      react.createElement(LyricsProviderSelectButton, {
        selectedProvider: toolbar.providerOverride,
        isLoading: toolbar.isLyricsLoading,
        isLocalTrack: toolbar.isLocalTrack,
        hasLocalLyrics,
        onOpen: () => onOpenView("provider"),
      }),
      react.createElement(TrackBackgroundButton, {
        trackUri: toolbar.trackUri,
        overrideMode: toolbar.backgroundOverride,
        onOpen: () => onOpenView("background"),
      }),
      react.createElement(CommunityVideoButton, {
        trackUri: toolbar.trackUri,
        enabled: toolbar.videoEnabled,
        videoInfo: toolbar.videoInfo,
        defaultStartTime: toolbar.videoStartTime,
        onVideoSelect: actions.onVideoSelect,
        onBeforeOpen: closePanel,
      }),
      react.createElement(SyncDataCreatorButton, {
        trackUri: toolbar.trackUri,
        getTrackInfo: actions.getSyncCreatorTrackInfo,
        hasKaraokeSync: toolbar.hasKaraoke,
        onBeforeOpen: closePanel,
      })
    );
  };

  // 더보기 panel: open learning, share an image or visit the marketplace.
  const ToolbarMoreMenu = ({ toolbar, actions, closePanel }) => {
    const learning = readLearningMode(host);
    return react.createElement(
      ToolbarMenuList,
      { label: getOptionsText("menu.more", "더보기") },
      typeof learning?.open === "function"
        ? react.createElement(ToolbarMenuItem, {
          icon: "study",
          label: translate("learningMode.button"),
          desc: translate("learningMode.title"),
          popup: "dialog",
          disabled: !toolbar.hasLyrics || toolbar.isLyricsLoading,
          onClick: () => {
            closePanel();
            learning.open();
          },
        })
        : null,
      react.createElement(ShareImageButton, {
        lyrics: toolbar.lyrics,
        getTrackInfo: actions.getShareTrackInfo,
        onBeforeOpen: closePanel,
      }),
      react.createElement("div", { className: "ivl-tb-mi-sep", role: "separator" }),
      react.createElement(ToolbarMenuItem, {
        icon: "marketplace",
        label: translate("marketplace.title"),
        current: !!toolbar.showMarketplace,
        onClick: () => {
          closePanel();
          actions.onToggleMarketplace?.();
        },
      })
    );
  };

  return { CurrentTrackMenu, ToolbarMoreMenu, SyncDataCreatorButton, buildTrackBackgroundView, buildLyricsProviderView };
}
