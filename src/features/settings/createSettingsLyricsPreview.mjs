import { renderAnnotatedLyricHTML } from "#ivlyrics/lyrics/lyricCulturalAnnotations.mjs";
import { createLyricSubLineRenderer } from "#ivlyrics/lyrics/createLyricSubLineRenderer.mjs";
import { createLyricDisplayResolver } from "#ivlyrics/lyrics/lyricDisplayText.mjs";
import { getLyricsTypographyStyleVariables } from "#ivlyrics/lyrics/lyricsTypography.mjs";
import { isPronunciationDisplayMode } from "#ivlyrics/lyrics/translationPresentation.mjs";
import { readSettingFlag } from "./settingsPreviewValues.mjs";

export const SETTINGS_LYRICS_PREVIEW_TEXT = "此処に歌詞があります";
const SETTINGS_LYRICS_PREVIEW_LINE = Object.freeze({
  text: SETTINGS_LYRICS_PREVIEW_TEXT,
  startTime: 0,
  endTime: 1200,
  syllables: Object.freeze(
    Array.from(SETTINGS_LYRICS_PREVIEW_TEXT).map((text, index) => Object.freeze({
      text,
      startTime: index * 100,
      endTime: (index + 1) * 100,
    }))
  ),
});
const SETTINGS_LYRICS_PREVIEW_FURIGANA = new Map([
  [0, "こ"],
  [1, "こ"],
  [3, "か"],
  [4, "し"],
]);

export const getSettingsPreviewSupplementVisibility = (visual) => {
  // Missing settings keep both sample layers useful; explicit "none" is honored.
  const modes = [
    visual?.["translation-mode:japanese"] ?? "gemini_romaji",
    visual?.["translation-mode-2:japanese"] ?? "gemini",
  ].filter((mode) => mode && mode !== "none");
  return {
    pronunciation: modes.some(isPronunciationDisplayMode),
    translation: modes.some((mode) => !isPronunciationDisplayMode(mode)),
  };
};

export function createSettingsLyricsPreview({
  react, getVisualSettings, translate, getSettingsText, useSettingsConfigRevision,
  applyFurigana, getBackgroundMode, getBackgroundPreset, normalizeHexColor,
  getKaraokeLine, InterludeIndicator, getDocument,
}) {
  const getSettingsPreviewFlag = (key, fallback) => readSettingFlag(getVisualSettings(), key, fallback);
  const renderLyricSubLine = createLyricSubLineRenderer({
    react,
    getInactiveColor: () => getVisualSettings()["inactive-color"],
  });

  const getSettingsLyricsPreviewStyle = () => {
    return {
      ...getLyricsTypographyStyleVariables(getVisualSettings()),
      textAlign: getVisualSettings().alignment || "center",
    };
  };

  const syncSettingsLyricsPreviewStyles = () => {
    const preview = getDocument().getElementById("settings-live-lyrics-preview");
    if (!preview) return;

    const style = getSettingsLyricsPreviewStyle();
    Object.entries(style).forEach(([name, value]) => {
      if (name.startsWith("--")) {
        preview.style.setProperty(name, String(value));
      } else {
        preview.style[name] = value;
      }
    });
    preview.dataset.furiganaEnabled = getVisualSettings()["furigana-enabled"] === true
      ? "true"
      : "false";
  };

  const { getLyricsDisplayMode: getSettingsPreviewLyricDisplay } = createLyricDisplayResolver({
    readDisplayMode: () => getVisualSettings()["translate:display-mode"],
    applyFurigana,
  });

  const renderSettingsPreviewLine = (active, extra = null, key = undefined) => {
    const visibility = getSettingsPreviewSupplementVisibility(getVisualSettings());
    const isKara = getSettingsPreviewFlag("karaoke-mode-enabled", true);
    const phonetic = visibility.pronunciation ? translate("settingsAdvanced.livePreview.sampleTextPhonetic") : null;
    const translation = visibility.translation ? translate("settingsAdvanced.livePreview.sampleText") : null;
    const line = { ...SETTINGS_LYRICS_PREVIEW_LINE, phoneticText: phonetic, translationText: translation };
    const { mainText, subText, subText2 } = getSettingsPreviewLyricDisplay(
      isKara, line, phonetic, SETTINGS_LYRICS_PREVIEW_TEXT, translation
    );
    return react.createElement(
      "div",
      {
        key,
        className: `lyrics-lyricsContainer-LyricsLine${active ? " lyrics-lyricsContainer-LyricsLine-active" : ""}`,
        style: { "--position-index": 0, "--offset": "0px", "--animation-index": 0 },
      },
      react.createElement(
        "p",
        !isKara && typeof mainText === "string"
          ? { dangerouslySetInnerHTML: { __html: renderAnnotatedLyricHTML(mainText) } }
          : null,
        isKara && active
          ? react.createElement(getKaraokeLine(), {
            line,
            position: SETTINGS_LYRICS_PREVIEW_LINE.endTime,
            isActive: true,
            furiganaMapOverride: SETTINGS_LYRICS_PREVIEW_FURIGANA,
          })
          : isKara ? SETTINGS_LYRICS_PREVIEW_TEXT : null
      ),
      renderLyricSubLine(
        "lyrics-lyricsContainer-LyricsLine-phonetic", subText
      ),
      renderLyricSubLine(
        "lyrics-lyricsContainer-LyricsLine-translation", subText2
      ),
      extra
    );
  };

  // The live preview renders the app's own lyric markup and CSS: KaraokeLine,
  // the interlude indicator and the cultural-note paragraph.
  const SettingsLyricsPreview = ({ kind = "lyrics" }) => {
    const revision = useSettingsConfigRevision();
    const visual = getVisualSettings() || {};
    const isKara = getSettingsPreviewFlag("karaoke-mode-enabled", true);
    const mode = getBackgroundMode();
    const preset = getBackgroundPreset(mode);
    const brightness = Number(visual["background-brightness"]);
    const dim = mode === "solid-background" || mode === "none"
      ? 0
      : ((100 - (Number.isFinite(brightness) ? brightness : 30)) / 100) * 0.72;
    let tag = preset ? getSettingsText(preset.labelKey, preset.fallbackLabel) : "";
    let lines;
    if (kind === "interlude") {
      const icon = visual["instrumental-break-icon"] || "equalizer";
      tag = getSettingsText(`settingsAdvanced.instrumentalBreak.icon.options.${icon}`, tag);
      lines = [
        renderSettingsPreviewLine(false, null, "before"),
        react.createElement(
          "div",
          {
            key: "interlude",
            className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active",
            style: { "--position-index": 0, "--offset": "0px", "--animation-index": 0 },
          },
          react.createElement(
            "p",
            { className: "lyrics-lyricsContainer-LyricsLine-interludeMain" },
            react.createElement(InterludeIndicator, { durationMs: 6000, kind: "break", settingsRevision: revision })
          )
        ),
        renderSettingsPreviewLine(false, null, "after"),
      ];
    } else if (kind === "annotation") {
      tag = getSettingsText("settings.culturalAnnotations.label", tag);
      lines = [renderSettingsPreviewLine(true, getSettingsPreviewFlag("cultural-annotations-enabled", false) ? react.createElement(
        "p",
        { className: "lyrics-lyricsContainer-LyricsLine-culturalNote" },
        getSettingsText("settingsUi.preview.annotationSample", "")
      ) : null, "active")];
    } else {
      lines = [renderSettingsPreviewLine(true, null, "active")];
    }
    return react.createElement(
      "div",
      {
        className: `settings-preview-stage bg-${mode}${visual.noise ? " has-noise" : ""}`,
        style: {
          "--preview-solid": normalizeHexColor(visual["solid-background-color"]) || "#1e3a8a",
          "--preview-dim": dim,
        },
      },
      react.createElement("span", { className: "settings-preview-bg", "aria-hidden": "true" }),
      react.createElement("span", { className: "settings-preview-dim", "aria-hidden": "true" }),
      react.createElement("span", { className: "settings-preview-noise", "aria-hidden": "true" }),
      tag ? react.createElement("span", { className: "settings-preview-tag" }, tag) : null,
      react.createElement(
        "div",
        {
          className: "font-preview settings-live-preview-lyrics lyrics-lyricsContainer-LyricsContainer",
          id: "settings-live-lyrics-preview",
          style: getSettingsLyricsPreviewStyle(),
          "data-furigana-enabled": visual["furigana-enabled"] === true ? "true" : "false",
        },
        react.createElement(
          "div",
          {
            className: `settings-live-preview-stage lyrics-lyricsContainer-SyncedLyricsPage${isKara ? " is-karaoke" : ""}${isKara && getSettingsPreviewFlag("karaoke-line-transition", true) ? " karaoke-line-transition-enabled" : ""}`,
          },
          react.createElement(
            "div",
            { className: "settings-live-preview-line lyrics-lyricsContainer-SyncedLyrics" },
            ...lines
          )
        )
      )
    );
  };

  return { SettingsLyricsPreview, syncSettingsLyricsPreviewStyles };
}
