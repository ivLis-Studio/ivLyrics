import { createOutsideTextOutlineShadow } from "#ivlyrics/lyrics/lyricsTextOutline.mjs";
import { DEFAULT_PANEL_ORIGINAL_SIZE, getPanelLineSlotHeight } from "#ivlyrics/lyrics/panelLyricsStyles.mjs";
import { readSettingFlag } from "./settingsPreviewValues.mjs";

const parsePanelNumber = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};
const parsePanelFloat = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const PANEL_PREVIEW_LINES = [
  { original: "君を好きになって", phonetic: "kimi wo suki ni natte", translation: "너를 좋아하게 되어서" },
  { original: "しまったみたいだ", phonetic: "shimatta mitai da", translation: "버린 것 같아" },
  { original: "どんな言葉を", phonetic: "donna kotoba wo", translation: "어떤 말을" },
  { original: "選んでも足りない", phonetic: "erande mo tarinai", translation: "골라도 부족해" },
  { original: "君と過ごす時間", phonetic: "kimi to sugosu jikan", translation: "너와 보내는 시간" },
  { original: "全てが宝物", phonetic: "subete ga takaramono", translation: "전부 소중해" },
  { original: "もう離れたくない", phonetic: "mou hanaretakunai", translation: "이제 떨어지고 싶지 않아" },
  { original: "ずっとそばにいて", phonetic: "zutto soba ni ite", translation: "계속 곁에 있어줘" },
  { original: "この気持ちが", phonetic: "kono kimochi ga", translation: "이 마음이" },
];

const PANEL_PREVIEW_ACTIVE_INDEX = 4;

export function createSettingsPanelPreview({ react, getVisualSettings, translate, useSettingsConfigRevision, getSupplementVisibility }) {
  const readPreviewSettings = () => {
    const visual = getVisualSettings() || {};
    const enabled = readSettingFlag(visual, "panel-lyrics-enabled", true);
    if (!enabled) return { enabled };
    const supplements = getSupplementVisibility();
    return {
      enabled,
      fontFamily: visual["panel-lyrics-font-family"] || "Pretendard Variable",
      originalFont: visual["panel-lyrics-original-font"] || "",
      phoneticFont: visual["panel-lyrics-phonetic-font"] || "",
      translationFont: visual["panel-lyrics-translation-font"] || "",
      fontScale: parsePanelNumber(visual["panel-font-scale"], 100),
      originalSize: parsePanelNumber(visual["panel-lyrics-original-size"], DEFAULT_PANEL_ORIGINAL_SIZE),
      phoneticSize: parsePanelNumber(visual["panel-lyrics-phonetic-size"], 13),
      translationSize: parsePanelNumber(visual["panel-lyrics-translation-size"], 13),
      originalOutlineWidth: parsePanelFloat(visual["panel-lyrics-original-outline-width"], 0),
      originalOutlineColor: visual["panel-lyrics-original-outline-color"] || "#000000",
      phoneticOutlineWidth: parsePanelFloat(visual["panel-lyrics-phonetic-outline-width"], 0),
      phoneticOutlineColor: visual["panel-lyrics-phonetic-outline-color"] || "#000000",
      translationOutlineWidth: parsePanelFloat(visual["panel-lyrics-translation-outline-width"], 0),
      translationOutlineColor: visual["panel-lyrics-translation-outline-color"] || "#000000",
      bgType: visual["panel-bg-type"] || "album",
      bgColor: visual["panel-bg-color"] || "#6366f1",
      bgGradient1: visual["panel-bg-gradient-1"] || "#6366f1",
      bgGradient2: visual["panel-bg-gradient-2"] || "#a855f7",
      bgOpacity: parsePanelNumber(visual["panel-bg-opacity"], 30),
      borderEnabled: readSettingFlag(visual, "panel-border-enabled", false),
      borderColor: visual["panel-border-color"] || "#ffffff",
      borderOpacity: parsePanelNumber(visual["panel-border-opacity"], 10),
      pronunciation: supplements.pronunciation,
      translation: supplements.translation,
    };
  };

  return function NowPlayingPanelPreview() {
    useSettingsConfigRevision("ivLyrics:panel-preview-update", readPreviewSettings);
    const {
      enabled, fontFamily, originalFont, phoneticFont, translationFont, fontScale,
      originalSize, phoneticSize, translationSize, originalOutlineWidth, originalOutlineColor,
      phoneticOutlineWidth, phoneticOutlineColor, translationOutlineWidth, translationOutlineColor,
      bgType, bgColor, bgGradient1, bgGradient2, bgOpacity, borderEnabled, borderColor, borderOpacity,
      pronunciation, translation,
    } = readPreviewSettings();
    if (!enabled) return null;

    const scale = fontScale / 100;
    const baseFontFamily = `'${fontFamily}', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
    // 개별 폰트가 설정되어 있으면 사용, 아니면 기본 폰트 사용
    const originalFontFamily = originalFont ? `${originalFont}, ${baseFontFamily}` : baseFontFamily;
    const phoneticFontFamily = phoneticFont ? `${phoneticFont}, ${baseFontFamily}` : baseFontFamily;
    const translationFontFamily = translationFont ? `${translationFont}, ${baseFontFamily}` : baseFontFamily;

    const previewLineSlotHeight = getPanelLineSlotHeight(originalSize, fontScale);
    const originalOutline = createOutsideTextOutlineShadow(originalOutlineWidth, originalOutlineColor);
    const phoneticOutline = pronunciation ? createOutsideTextOutlineShadow(phoneticOutlineWidth, phoneticOutlineColor) : "";
    const translationOutline = translation ? createOutsideTextOutlineShadow(translationOutlineWidth, translationOutlineColor) : "";

    // 배경 스타일 계산
    const getBackgroundStyle = () => {
      const opacityValue = bgOpacity / 100;
      switch (bgType) {
        case "transparent":
          return "transparent";
        case "custom": {
          // 사용자 지정 단색
          const customRgb = hexToRgb(bgColor);
          return `rgba(${customRgb.r}, ${customRgb.g}, ${customRgb.b}, ${opacityValue})`;
        }
        case "gradient": {
          // 그라데이션
          const grad1Rgb = hexToRgb(bgGradient1);
          const grad2Rgb = hexToRgb(bgGradient2);
          return `linear-gradient(135deg, rgba(${grad1Rgb.r}, ${grad1Rgb.g}, ${grad1Rgb.b}, ${opacityValue}) 0%, rgba(${grad2Rgb.r}, ${grad2Rgb.g}, ${grad2Rgb.b}, ${opacityValue}) 100%)`;
        }
        case "album":
        default:
          // 앨범 기반 (기본 보라색 그라데이션으로 시뮬레이션)
          return `linear-gradient(135deg, rgba(99, 102, 241, ${opacityValue}) 0%, rgba(168, 85, 247, ${opacityValue}) 100%)`;
      }
    };

    // Border 스타일 계산
    const getBorderStyle = () => {
      if (!borderEnabled) return "none";
      const borderRgb = hexToRgb(borderColor);
      const borderOpacityValue = borderOpacity / 100;
      return `1px solid rgba(${borderRgb.r}, ${borderRgb.g}, ${borderRgb.b}, ${borderOpacityValue})`;
    };

    // Hex to RGB 변환 헬퍼
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 99, g: 102, b: 241 };
    };

    const renderPreviewLine = (line, idx) =>
            react.createElement(
              "div",
              {
                key: idx,
                style: {
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  flex: `0 0 ${previewLineSlotHeight}px`,
                  minHeight: `${previewLineSlotHeight}px`,
                  gap: "2px",
                  padding: "4px 0",
                  opacity: idx === PANEL_PREVIEW_ACTIVE_INDEX ? 1 : 0.5,
                  transition: "opacity 0.3s ease",
                }
              },
              // 원문 (가장 먼저)
              react.createElement(
                "div",
                {
                  style: {
                    fontSize: `${originalSize * scale}px`,
                    fontWeight: 700,
                    color: idx === PANEL_PREVIEW_ACTIVE_INDEX ? "#ffffff" : "rgba(255, 255, 255, 0.7)",
                    lineHeight: 1.4,
                    fontFamily: originalFontFamily,
                    textShadow: originalOutline,
                  }
                },
                line.original
              ),
              // 발음 (두 번째)
              pronunciation && react.createElement(
                "div",
                {
                  style: {
                    fontSize: `${phoneticSize * scale}px`,
                    fontWeight: 400,
                    color: idx === PANEL_PREVIEW_ACTIVE_INDEX ? "rgba(255, 255, 255, 0.75)" : "rgba(255, 255, 255, 0.55)",
                    lineHeight: 1.35,
                    fontFamily: phoneticFontFamily,
                    textShadow: phoneticOutline,
                  }
                },
                line.phonetic
              ),
              // 번역 (마지막)
              translation && react.createElement(
                "div",
                {
                  style: {
                    fontSize: `${translationSize * scale}px`,
                    fontWeight: 500,
                    color: idx === PANEL_PREVIEW_ACTIVE_INDEX ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.5)",
                    lineHeight: 1.35,
                    fontFamily: translationFontFamily,
                    textShadow: translationOutline,
                  }
                },
                line.translation
              )
            );

    const previewBackgroundStyle = bgType === "transparent"
      ? "transparent"
      : `linear-gradient(rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.38)), ${getBackgroundStyle()}`;
    const previewBackdropFilter = bgType === "transparent" || bgOpacity === 0 ? "none" : "blur(20px)";

    return react.createElement(
      "div",
      {
        className: "option-list-wrapper"
      },
      react.createElement(
        "div",
        {
          style: {
            padding: "40px 16px 16px",
            position: "relative",
            overflow: "hidden",
            minHeight: "280px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            background: previewBackgroundStyle,
            backdropFilter: previewBackdropFilter,
            border: getBorderStyle(),
          }
        },
        // 미리보기 헤더
        react.createElement(
          "span",
          { className: "settings-preview-tag" },
          translate("settingsAdvanced.nowPlayingPanel.preview") || "Preview"
        ),
        // 가사 미리보기 (원어 → 발음 → 번역 순서)
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: "1 1 auto",
              gap: "4px",
              minHeight: 0,
              overflow: "hidden",
              zIndex: 1,
            }
          },
          ...PANEL_PREVIEW_LINES.map((line, idx) => renderPreviewLine(line, idx))
        )
      )
    );
  };
}
