import { TOOLBAR_MODE_KEYS, TOOLBAR_MODE_LABEL_KEYS } from "./toolbarEntries.mjs";
import { joinToolbarClasses, moveToolbarFocus } from "./createToolbarControls.mjs";

export function createToolbarPanelViews({
  react, translate, getOptionsText, controls, TranslationMenu, SyncAdjustButtonFluent,
  CurrentTrackMenu, ToolbarMoreMenu, buildLyricsProviderView, buildTrackBackgroundView,
}) {
  const { useRef } = react;
  const { ToolbarButton, ToolbarGlyph, ToolbarNote, ToolbarOptionList, ToolbarPanelGroup, ToolbarPanelRow, ToolbarToggleRow } = controls;

  const isToolbarModeAvailable = (modeKey, lyrics) => {
    if (modeKey === "character" || modeKey === "word") return !!lyrics.hasKaraoke && !!lyrics.karaokeEnabled;
    if (modeKey === "synced") return !!lyrics.hasSynced;
    if (modeKey === "unsynced") return !!lyrics.hasUnsynced;
    return false;
  };

  // Why a mode cannot be chosen for the current song. Nothing is claimed while
  // the song's lyrics are still loading.
  const getToolbarModeUnavailableReason = (modeKey, lyrics) => {
    if (lyrics.isLoading) return "";
    if (modeKey === "character" || modeKey === "word") {
      if (!lyrics.hasKaraoke) return getOptionsText("modes.unavailableNoKaraoke", "이 곡에는 노래방 싱크가 없습니다");
      if (!lyrics.karaokeEnabled) return getOptionsText("modes.unavailableKaraokeOff", "노래방 모드 사용이 꺼져 있습니다");
      return "";
    }
    if (modeKey === "synced") return getOptionsText("modes.unavailableNoSynced", "이 곡에는 동기화 가사가 없습니다");
    return getOptionsText("messages.noLyrics", "사용 가능한 가사가 없음");
  };

  // 가사 모드 panel: the four modes, each with the reason it cannot be used for
  // this song, and the switch that replaced locking by right-click.
  const LyricsModeMenu = ({ modeKey, lockedModeKey, lockInEffect, lyrics, onSelectMode, onSetModeLock }) => {
    const listRef = useRef(null);
    const label = getOptionsText("settings.lyricsMode.label", "가사 모드");
    const canLock = TOOLBAR_MODE_KEYS.some((key) => isToolbarModeAvailable(key, lyrics));
    return react.createElement(
      "div",
      { className: "ivl-tb-stack" },
      react.createElement(
        "div",
        {
          ref: listRef,
          className: "ivl-tb-group ivl-tb-choices",
          role: "radiogroup",
          "aria-label": label,
          onKeyDown: (event) => moveToolbarFocus(event, listRef.current, ".ivl-tb-choice"),
        },
        TOOLBAR_MODE_KEYS.map((key) => {
          const isAvailable = isToolbarModeAvailable(key, lyrics);
          const reason = isAvailable ? "" : getToolbarModeUnavailableReason(key, lyrics);
          const isOn = isAvailable && key === modeKey;
          return react.createElement(
            "button",
            {
              key,
              type: "button",
              role: "radio",
              className: joinToolbarClasses("ivl-tb-choice", isOn && "is-on"),
              "aria-checked": isOn,
              disabled: !isAvailable,
              onClick: () => onSelectMode?.(key),
            },
            react.createElement("span", { className: "ivl-tb-choice-ico" }, react.createElement(ToolbarGlyph, { name: key, size: 18 })),
            react.createElement(
              "span",
              { className: "ivl-tb-choice-main" },
              react.createElement(
                "span",
                { className: "ivl-tb-choice-label" },
                react.createElement("span", null, translate(TOOLBAR_MODE_LABEL_KEYS[key])),
                lockInEffect && lockedModeKey === key
                  ? react.createElement(
                    "span",
                    { className: "ivl-tb-pill is-accent" },
                    react.createElement(ToolbarGlyph, { name: "lock", size: 11 }),
                    getOptionsText("modes.locked", "고정됨")
                  )
                  : null
              ),
              reason ? react.createElement("small", null, reason) : null
            ),
            react.createElement("span", { className: "ivl-tb-choice-check", "aria-hidden": "true" }, react.createElement(ToolbarGlyph, { name: "check", size: 16 }))
          );
        })
      ),
      react.createElement(
        ToolbarPanelGroup,
        null,
        react.createElement(ToolbarToggleRow, {
          label: getOptionsText("modes.lockSelected", "선택한 모드로 고정"),
          desc: getOptionsText("modes.lockSelectedDesc", "다른 곡에서도 이 모드를 쓸 수 있으면 항상 이 모드로 보여 줍니다."),
          checked: !!lockInEffect,
          disabled: !canLock,
          onChange: (checked) => onSetModeLock?.(checked),
        })
      )
    );
  };

  // Renders a view description (see the builders above) with the panel parts.
  const ToolbarModelView = ({ view }) =>
    react.createElement(
      "div",
      { className: "ivl-tb-stack" },
      (view?.groups || []).filter((rows) => rows.length > 0).map((rows, index) => react.createElement(
        ToolbarPanelGroup,
        { key: index, className: rows.every((row) => row.type === "choice") ? "is-options" : "" },
        rows.map((row) => {
          if (row.type === "choice") {
            return react.createElement(ToolbarOptionList, {
              key: row.key,
              label: row.label,
              options: row.options,
              value: row.value,
              onPick: row.onPick,
            });
          }
          if (row.type === "button") {
            return react.createElement(ToolbarPanelRow, {
              key: row.key,
              label: row.label,
              desc: row.desc,
              control: react.createElement(ToolbarButton, {
                variant: row.danger ? "danger" : "",
                disabled: row.disabled,
                onClick: row.onClick,
              }, row.buttonText),
            });
          }
          return react.createElement(ToolbarPanelRow, {
            key: row.key,
            label: row.label,
            control: react.createElement("span", { className: "ivl-tb-value ivl-tb-trunc" }, row.value),
          });
        })
      )),
      view?.note
        ? react.createElement(ToolbarNote, {
          actions: view.note.onAction
            ? react.createElement(ToolbarButton, { onClick: view.note.onAction }, view.note.actionLabel)
            : null,
        }, view.note.text)
        : null
    );

  return function buildPanelView(id, {
    toolbar, actions, lyricsState, trackLine, offsets, trackViews, openTrackView, leaveTrackView, closePanel, openSettingsFromPanel,
  }) {
    if (id === "mode") {
      return {
        title: getOptionsText("settings.lyricsMode.label", "가사 모드"),
        body: react.createElement(LyricsModeMenu, {
          modeKey: toolbar.modeKey,
          lockedModeKey: toolbar.lockedModeKey,
          lockInEffect: toolbar.lockInEffect,
          lyrics: lyricsState,
          onSelectMode: actions?.onSelectMode,
          onSetModeLock: actions?.onSetModeLock,
        }),
      };
    }
    if (id === "convert") {
      return {
        title: translate("menu.translationSettings"),
        subtitle: translate("menu.translationOptionsSubtitle"),
        body: react.createElement(TranslationMenu, {
          key: `${toolbar.trackUri || ""}:${toolbar.friendlyLanguage || "gemini"}`,
          trackUri: toolbar.trackUri,
          friendlyLanguage: toolbar.friendlyLanguage,
          detectedLanguage: toolbar.detectedLanguage,
          regenerate: {
            choices: actions?.getRegenerateChoices?.() || [],
            onRegenerate: actions?.onRegenerate,
            isEnabled: !!toolbar.canRegenerate,
            busyTargets: [
              toolbar.isPronunciationRegenerating && "phonetic",
              toolbar.isTranslationRegenerating && "translation",
              toolbar.isCulturalAnnotationsRegenerating && "cultural-annotations",
              toolbar.isWordSupplementsRegenerating && "word-supplements",
            ].filter(Boolean),
          },
          cacheEdit: toolbar.hasLyrics
            ? {
              disabled: !!toolbar.isLyricsEditBusy,
              onOpen: () => {
                closePanel();
                actions?.onOpenLyricsEditor?.();
              },
            }
            : null,
          onOpenSettings: openSettingsFromPanel,
        }),
      };
    }
    if (id === "sync") {
      const hasOffsets = (toolbar.canAdjustTrackSync && offsets.trackOffset !== 0) || offsets.globalOffset !== 0;
      return {
        title: translate("menu.syncAdjustTitle"),
        subtitle: translate("syncAdjust.info"),
        body: react.createElement(SyncAdjustButtonFluent, {
          offsets,
          includeTrackOffset: !!toolbar.canAdjustTrackSync,
          quickSyncEnabled: toolbar.quickSyncEnabled !== false,
          trackUri: toolbar.syncTrackUri,
          onQuickSyncChange: (value) => actions?.onVisualConfigChange?.("quick-sync-controls-enabled", value),
        }),
        footer: react.createElement(
          "div",
          { className: "ivl-tb-foot-row" },
          react.createElement(
            ToolbarButton,
            {
              disabled: !hasOffsets,
              onClick: () => {
                if (toolbar.canAdjustTrackSync && offsets.trackOffset !== 0) offsets.changeTrackOffset(0);
                if (offsets.globalOffset !== 0) offsets.changeGlobalOffset(0);
              },
            },
            react.createElement(ToolbarGlyph, { name: "reset", size: 15 }),
            react.createElement("span", null, translate("syncAdjust.reset"))
          )
        ),
      };
    }
    if (id === "track") {
      const view = trackViews[trackViews.length - 1];
      if (view === "provider" || view === "background") {
        const info = view === "provider" && toolbar.isLocalTrack ? actions?.getCurrentTrackInfo?.() : null;
        const localTrack = toolbar.trackUri && (!info?.uri || info.uri === toolbar.trackUri)
          ? { ...info, uri: toolbar.trackUri } : null;
        const built = view === "provider"
          ? buildLyricsProviderView({
            currentProvider: toolbar.currentProvider,
            selectedProvider: toolbar.providerOverride,
            isLocalTrack: toolbar.isLocalTrack,
            trackInfo: localTrack,
            onSelectProvider: provider => actions?.onSelectProvider?.(provider, toolbar.trackUri),
            onImportLocalLyricsFile: () => actions?.onImportLocalLyricsFile?.(toolbar.trackUri),
            onApplyLocalLyrics: actions?.onApplyLocalLyrics,
            getHasLocalLyrics: () => actions?.getHasLocalLyrics?.(toolbar.trackUri),
            onDeleteLocalLyrics: () => actions?.onDeleteLocalLyrics?.({ trackUri: toolbar.trackUri }),
            closeModal: closePanel,
            closeView: leaveTrackView,
          })
          : buildTrackBackgroundView({
            overrideMode: toolbar.backgroundOverride,
            effectiveMode: toolbar.effectiveBackground,
            onSelectBackground: mode => actions?.onSelectBackground?.(mode, toolbar.trackUri),
            onOpenSettings: openSettingsFromPanel,
          });
        return { title: built.title, subtitle: built.subtitle, body: react.createElement(ToolbarModelView, { view: built }) };
      }
      return {
        title: getOptionsText("menu.currentTrack", "현재 곡"),
        subtitle: trackLine,
        body: react.createElement(CurrentTrackMenu, { toolbar, actions, onOpenView: openTrackView, closePanel }),
      };
    }
    if (id === "more") {
      return {
        title: getOptionsText("menu.more", "더보기"),
        body: react.createElement(ToolbarMoreMenu, { toolbar, actions, closePanel }),
      };
    }
    return null;
  };
}
