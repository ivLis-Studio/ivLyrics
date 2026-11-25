import { createCoalescedCallback } from "../core/coalescedCallback.mjs";
import { needsDynamicTrackColors } from "../lyrics/pageTrackPresentation.mjs";

const FONT_SIZE_LIMIT = { min: 16, max: 256, step: 4 };

export function attachLyricsPageSettings({
  page, browser, effects, isCurrentMount, getVisualSettings, saveConfig, getAIManager,
}) {
  let pronunciationChanged = false;
  const refreshView = page.refreshLyricsView = () => {
    if (!isCurrentMount()) return;
    if (pronunciationChanged) {
      pronunciationChanged = false;
      page.pronunciationPresentation?.invalidateTiming();
    }
    page.reRenderLyricsPage = (page.reRenderLyricsPage || 0) + 1;
    page.forceUpdate();
  };
  const queueRefresh = page.queueLyricsViewRefresh = createCoalescedCallback(refreshView);

  let fontSizeThrottled = false;
  page.onFontSizeChange = (event) => {
    if (!event.ctrlKey || !isCurrentMount() || fontSizeThrottled) return;
    fontSizeThrottled = true;
    effects.schedule(() => { fontSizeThrottled = false; }, 50);

    const visual = getVisualSettings();
    const { min, max, step } = FONT_SIZE_LIMIT;
    const direction = event.deltaY < 0 ? 1 : -1;
    const fontSize = Math.min(max, Math.max(min, visual["font-size"] + direction * step));
    visual["font-size"] = fontSize;
    saveConfig("font-size", fontSize);
    refreshView();
  };

  function applyConfigChange({ detail }) {
    switch (detail?.name) {
      case "karaoke-mode-enabled":
        page.setState({ explicitMode: -1 });
        break;
      case "spotify-fake-karaoke-enabled":
        page.reloadLyrics?.(false);
        break;
      case "pseudo-karaoke-render-advance":
        queueRefresh();
        break;
      case "pronunciation-first":
      case "pronunciation-karaoke-fill":
      case "synced-pronunciation":
        pronunciationChanged = true;
        queueRefresh();
        break;
      case "background-mode":
      case "video-fallback-background":
      case "blur-gradient-background":
      case "video-background":
        if (page.currentTrackUri && needsDynamicTrackColors(page.getEffectiveBackgroundMode(), getVisualSettings())) {
          page.fetchColors(page.currentTrackUri);
        }
        break;
      default:
        if (detail?.type === "fullscreen-presentation" && page.state.isFullscreen) {
          page.setFullscreenPresentation(detail.value);
        }
    }
  }

  effects.listen(browser, "fad-request", refreshView);
  effects.listen(browser, "ivLyrics", applyConfigChange);
  effects.listen(browser, "furigana-ready", () => {
    if (getVisualSettings()["furigana-enabled"]) queueRefresh();
  });
  const aiManager = getAIManager?.();
  effects.subscribe(handler => aiManager?.on?.("translation:style:changed", handler), queueRefresh);
}
