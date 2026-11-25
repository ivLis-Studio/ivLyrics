import { formatKeyboardShortcut } from "../../core/keyboardShortcut.mjs";
import { formatSyncOffset } from "./sync/syncOffsetValues.mjs";
import { resolveFullscreenShortcut } from "../../features/player/fullscreenShortcutSettings.mjs";

export const TOOLBAR_ENTRY_GROUPS = Object.freeze([
  Object.freeze(["mode", "convert", "pronunciationFirst", "sync"]),
  Object.freeze(["track", "more"]),
  Object.freeze(["settings", "fullscreen", "fullscreenAlt"]),
]);
export const TOOLBAR_MODE_KEYS = Object.freeze(["character", "word", "synced", "unsynced"]);
export const TOOLBAR_MODE_LABEL_KEYS = Object.freeze({
  character: "modes.character",
  word: "modes.word",
  synced: "modes.synced",
  unsynced: "modes.unsynced",
});

export function buildToolbarEntries({ toolbar, trackLine, offsets, getOptionsText, translate, readVisualSettings, openSettings, hideTip }) {
  const { actions } = toolbar;
  const modeLabel = TOOLBAR_MODE_LABEL_KEYS[toolbar.modeKey]
    ? translate(TOOLBAR_MODE_LABEL_KEYS[toolbar.modeKey])
    : getOptionsText("settings.lyricsMode.label", "가사 모드");
  const modeTitle = getOptionsText("settings.lyricsMode.label", "가사 모드") + " · " + modeLabel +
    (toolbar.lockInEffect ? " · " + getOptionsText("modes.locked", "고정됨") : "");
  return {
    mode: {
      panel: true,
      icon: toolbar.modeKey || "synced",
      label: modeLabel,
      ariaLabel: modeTitle,
      lock: !!toolbar.lockInEffect,
      tip: () => ({
        title: modeTitle,
        lines: [translate(toolbar.lockInEffect ? "modes.rightClickToUnlock" : "modes.rightClickToLock")],
      }),
      onContextMenu: (event) => {
        event.preventDefault();
        hideTip();
        actions?.onToggleModeLock?.();
      },
    },
    convert: {
      panel: true,
      hidden: !toolbar.showConvert,
      icon: "translation",
      label: translate("menu.translation"),
      busy: !!toolbar.isRegenerating,
      tip: () => {
        const modeKey = toolbar.friendlyLanguage || "gemini";
        const shown = [
          readVisualSettings()?.["translation-mode:" + modeKey] !== "none" && translate("menu.pronunciation"),
          readVisualSettings()?.["translation-mode-2:" + modeKey] !== "none" && translate("menu.translationLabel"),
        ].filter(Boolean);
        return { title: translate("menu.translationSettings"), lines: shown.length ? [shown.join(" · ")] : [] };
      },
    },
    pronunciationFirst: {
      // Shown only while the pronunciation supplement is on for this song.
      hidden: !toolbar.showPronunciationFirst,
      icon: "pronunciationFirst",
      label: getOptionsText("menu.pronunciationFirst", "발음 우선"),
      ariaLabel: getOptionsText("menu.pronunciationFirstTitle", "발음 우선 모드"),
      pressed: !!toolbar.pronunciationFirst,
      tip: () => ({
        title: getOptionsText("menu.pronunciationFirstTitle", "발음 우선 모드"),
        lines: [getOptionsText("menu.pronunciationFirstDesc", "원문과 발음의 위치를 바꿔 외국어 가사를 따라 읽기 쉽게 표시합니다")],
      }),
      onActivate: () => actions?.onTogglePronunciationFirst?.(),
    },
    sync: {
      panel: true,
      icon: "globalSync",
      label: translate("menu.syncAdjust"),
      dot: offsets.trackOffset !== 0 || offsets.globalOffset !== 0,
      tip: () => ({
        title: translate("menu.syncAdjustTitle"),
        lines: [[
          toolbar.canAdjustTrackSync && translate("syncAdjust.trackTitle") + " " + formatSyncOffset(offsets.trackOffset),
          translate("syncAdjust.globalTitle") + " " + formatSyncOffset(offsets.globalOffset),
        ].filter(Boolean).join(" · ")],
      }),
    },
    track: {
      panel: true,
      icon: "track",
      label: getOptionsText("menu.currentTrack", "현재 곡"),
      dot: !!toolbar.providerOverride || !!toolbar.backgroundOverride,
      tip: () => ({ title: getOptionsText("menu.currentTrack", "현재 곡"), lines: trackLine ? [trackLine] : [] }),
    },
    more: {
      panel: true,
      icon: "more",
      label: getOptionsText("menu.more", "더보기"),
      tip: () => ({
        title: getOptionsText("menu.more", "더보기"),
        lines: [[translate("learningMode.button"), translate("menu.shareImage"), translate("marketplace.title")].join(" · ")],
      }),
    },
    settings: {
      icon: "settings",
      label: translate("menu.settings"),
      onActivate: openSettings,
    },
    fullscreen: {
      hidden: !toolbar.canToggleFullscreen,
      icon: toolbar.isFullscreen ? "fullscreenExit" : "fullscreenEnter",
      // The label stays put; the icon, the pressed state and the accessible
      // name say whether the click enters or leaves fullscreen.
      label: translate("menu.fullscreen"),
      ariaLabel: toolbar.isFullscreen ? translate("menu.exitFullscreen") || "Exit Fullscreen" : translate("menu.fullscreen"),
      pressed: !!toolbar.isFullscreen,
      keys: formatKeyboardShortcut(resolveFullscreenShortcut("fullscreen-key", readVisualSettings()?.["fullscreen-key"])),
      tip: () => ({
        title: toolbar.isFullscreen ? translate("menu.exitFullscreen") || "Exit Fullscreen" : translate("menu.fullscreen"),
      }),
      onActivate: () => actions?.onToggleFullscreen?.(),
    },
    // Optional second button for the other presentation: the lyrics-page layout
    // when the main button fills the monitor, otherwise monitor fullscreen.
    fullscreenAlt: (() => {
      const mainFillsScreen = readVisualSettings()?.["fullscreen-page-ui-only"] !== true
        && readVisualSettings()?.["fullscreen-browser-fullscreen"] === true;
      const presentation = mainFillsScreen ? "page" : "screen";
      const label = presentation === "page" ? translate("menu.fullscreenInPage") : translate("menu.fullscreenScreen");
      return {
        hidden: !toolbar.canToggleFullscreen || !!toolbar.isFullscreen
          || readVisualSettings()?.["fullscreen-separate-buttons"] !== true,
        icon: presentation === "page" ? "fullscreenPage" : "fullscreenScreen",
        label,
        ariaLabel: label,
        tip: () => ({
          title: label,
          lines: [presentation === "page" ? translate("menu.fullscreenInPageHint") : translate("menu.fullscreenScreenHint")],
        }),
        onActivate: () => actions?.onToggleFullscreen?.({ presentation }),
      };
    })(),
    menu: {
      icon: toolbar.isMenuOpen ? "close" : "menu",
      label: toolbar.isMenuOpen ? translate("buttons.close") || "Close" : getOptionsText("fullscreen.menuToggleShort", "메뉴"),
      ariaLabel: toolbar.isMenuOpen ? translate("buttons.close") || "Close" : translate("fullscreen.menuToggle") || "ivLyrics",
      tip: () => ({ title: toolbar.isMenuOpen ? translate("buttons.close") || "Close" : translate("fullscreen.menuToggle") || "ivLyrics" }),
    },
  };
}
