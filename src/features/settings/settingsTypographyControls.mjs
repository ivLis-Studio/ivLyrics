export function createSettingsTypographyControls({
  readVisualSettings, translate, getSettingsText,
  controls: { ConfigSliderRange, ConfigColorPicker, ConfigFontSelector, ConfigFontWeightSlider, ConfigSelection },
}) {
  const createTextOutlineSettingItems = (
    settingPrefix,
    {
      labelPrefix = "",
      infoPrefix = "",
      when,
      disabled,
    } = {}
  ) => [
    {
      desc: `${labelPrefix}${translate("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness"}`,
      info: `${infoPrefix}${translate("settingsAdvanced.textOutline.width.desc") || "Visible thickness of the outline outside the glyphs (px)"}`,
      key: `${settingPrefix}-outline-width`,
      type: ConfigSliderRange,
      min: 0,
      max: 10,
      step: 0.5,
      unit: "px",
      defaultValue: Number(readVisualSettings()[`${settingPrefix}-outline-width`] ?? 0),
      when,
      disabled,
    },
    {
      desc: `${labelPrefix}${translate("settingsAdvanced.textOutline.color.label") || "Text Outline Color"}`,
      info: `${infoPrefix}${translate("settingsAdvanced.textOutline.color.desc") || "Color of the text outline (HEX code)"}`,
      key: `${settingPrefix}-outline-color`,
      type: ConfigColorPicker,
      defaultValue: readVisualSettings()[`${settingPrefix}-outline-color`] || "#000000",
      when,
      disabled,
    },
  ];

  // Keep the differences between the main and vinyl controls explicit. Labels and
  // current defaults are resolved when rendering, so language/config changes apply.
  const LYRICS_TYPOGRAPHY_SECTIONS = [
    {
      role: "original", style: "originalStyle", section: "original-style",
      size: [12, 128, 2], vinylSize: [16, 64, 1],
    },
    {
      role: "phonetic", style: "pronunciationStyle", section: "pronunciation-style",
      size: [10, 96, 2], vinylSize: [10, 40, 1],
      spacing: [-30, 20, 1], vinylSpacing: [-10, 24, 1],
    },
    {
      role: "translation", style: "translationStyle", section: "translation-style",
      size: [12, 128, 2], vinylSize: [10, 44, 1],
      spacing: [-20, 30, 2], vinylSpacing: [-10, 30, 1],
    },
  ];

  const createLyricsTypographyItems = (section, vinyl) => {
    const prefix = `${vinyl ? "fullscreen-vinyl-" : ""}${section.role}`;
    const styleKey = `settingsAdvanced.${section.style}`;
    const range = (property, label, info, [min, max, step], unit) => ({
      desc: translate(`settingsAdvanced.${label}.label`),
      info: translate(`${styleKey}.${info}.desc`),
      key: `${prefix}-${property}`,
      type: ConfigSliderRange,
      min, max, step, unit,
    });
    const items = [];
    if (vinyl) {
      items.push({
        desc: translate("settingsAdvanced.originalStyle.fontFamily"),
        info: translate(`${styleKey}.fontFamilyDesc`),
        key: `${prefix}-font-family`,
        type: ConfigFontSelector,
        defaultValue: readVisualSettings()[`${prefix}-font-family`] || "Pretendard Variable",
      });
    }
    items.push(
      range("font-size", "originalStyle.fontSize", "fontSize", vinyl ? section.vinylSize : section.size, "px"),
      {
        desc: translate("settingsAdvanced.originalStyle.fontWeight.label"),
        info: translate(`${styleKey}.fontWeight.desc`),
        key: `${prefix}-font-weight`,
        type: ConfigFontWeightSlider,
      },
      range("opacity", "originalStyle.opacity", "opacity", [vinyl ? 20 : 0, 100, 5], "%"),
    );
    const spacing = vinyl ? section.vinylSpacing : section.spacing;
    if (spacing) items.push(range("spacing", `${section.style}.gap`, "gap", spacing, "px"));
    items.push(
      range("letter-spacing", `${section.style}.letterSpacing`, "letterSpacing", [-5, 20, 0.5], "px"),
      ...createTextOutlineSettingItems(prefix),
    );
    if (!vinyl && section.role === "phonetic") {
      items.push({
        desc: translate(`${styleKey}.hyphenReplace.label`),
        info: translate(`${styleKey}.hyphenReplace.desc`),
        key: "phonetic-hyphen-replace",
        type: ConfigSelection,
        options: {
          keep: translate(`${styleKey}.hyphenReplace.options.keep`),
          space: translate(`${styleKey}.hyphenReplace.options.space`),
          remove: translate(`${styleKey}.hyphenReplace.options.remove`),
        },
      });
    }
    return items;
  };

  const getLyricsTypographyColumnLabel = (role) => {
    if (role === "original") return getSettingsText("lyricsCacheEditor.original", "Original");
    if (role === "phonetic") return getSettingsText("menu.pronunciation", "Pronunciation");
    if (role === "translation") return getSettingsText("translationMenu.translation", "Translation");
    return getSettingsText("translationMenu.furigana", "Furigana");
  };

  // Columns of the lyric-layer table: one per layer with the items (and save
  // handlers) of the former per-layer sections. Labels and current values are
  // resolved when rendering, so language and config changes apply.
  const buildLyricsTypographyColumns = ({ vinyl = false, onChange, furiganaOnChange } = {}) => {
    // The vinyl table shares the generic "Typography" section title, so search
    // names its groups after the LP view instead.
    const vinylTitle = vinyl
      ? getSettingsText("settingsUi.sections.vinylTypography", "Vinyl typography")
      : "";
    const columns = LYRICS_TYPOGRAPHY_SECTIONS.map((section) => {
      const styleKey = `settingsAdvanced.${section.style}`;
      const fontKey = `${section.role}-font-family`;
      const items = createLyricsTypographyItems(section, vinyl);
      if (!vinyl) {
        items.unshift({
          desc: translate("settingsAdvanced.originalStyle.fontFamily"),
          info: translate(`${styleKey}.fontFamilyDesc`),
          key: fontKey,
          type: ConfigFontSelector,
          defaultValue: readVisualSettings()[fontKey] || "Pretendard Variable",
        });
      }
      return {
        id: section.role,
        anchor: `${vinyl ? "vinyl-" : ""}${section.section}`,
        label: getLyricsTypographyColumnLabel(section.role),
        subtitle: translate(`${styleKey}.subtitle`),
        groupTitle: vinylTitle,
        color: `var(--settings-layer-${section.role})`,
        items,
        onChange,
      };
    });
    if (!vinyl) {
      columns.push({
        id: "furigana",
        anchor: "furigana-style",
        label: getLyricsTypographyColumnLabel("furigana"),
        subtitle: translate("settingsAdvanced.furiganaStyle.subtitle"),
        groupTitle: vinylTitle,
        color: "var(--settings-layer-furigana)",
        toggle: {
          key: "furigana-enabled",
          desc: translate("settingsAdvanced.languageDetection.furigana.label"),
          info: translate("settingsAdvanced.languageDetection.furigana.desc"),
        },
        onChange: furiganaOnChange || onChange,
        items: [
          {
            desc: translate("settingsAdvanced.furiganaStyle.fontSize.label"),
            info: translate("settingsAdvanced.furiganaStyle.fontSize.desc"),
            key: "furigana-font-size",
            type: ConfigSliderRange,
            min: 8,
            max: 48,
            step: 1,
            unit: "px",
          },
          {
            desc: translate("settingsAdvanced.furiganaStyle.fontWeight.label"),
            info: translate("settingsAdvanced.furiganaStyle.fontWeight.desc"),
            key: "furigana-font-weight",
            type: ConfigFontWeightSlider,
          },
          {
            desc: translate("settingsAdvanced.furiganaStyle.opacity.label"),
            info: translate("settingsAdvanced.furiganaStyle.opacity.desc"),
            key: "furigana-opacity",
            type: ConfigSliderRange,
            min: 0,
            max: 100,
            step: 5,
            unit: "%",
          },
          {
            desc: translate("settingsAdvanced.furiganaStyle.spacing.label"),
            info: translate("settingsAdvanced.furiganaStyle.spacing.desc"),
            key: "furigana-spacing",
            type: ConfigSliderRange,
            min: -5,
            max: 20,
            step: 1,
            unit: "px",
          },
          ...createTextOutlineSettingItems("furigana"),
        ],
      });
    }
    return columns;
  };

  const getLyricsTypographyRows = () => [
    { id: "font", label: translate("settingsAdvanced.originalStyle.fontFamily") },
    { id: "size", label: translate("settingsAdvanced.originalStyle.fontSize.label") },
    { id: "weight", label: translate("settingsAdvanced.originalStyle.fontWeight.label") },
    { id: "opacity", label: translate("settingsAdvanced.originalStyle.opacity.label") },
    { id: "spacing", label: translate("settingsAdvanced.pronunciationStyle.gap.label") },
    { id: "letterSpacing", label: translate("settingsAdvanced.originalStyle.letterSpacing.label") },
    { id: "outlineWidth", label: translate("settingsAdvanced.textOutline.width.label") || "Text Outline Thickness" },
    { id: "outlineColor", label: translate("settingsAdvanced.textOutline.color.label") || "Text Outline Color" },
    { id: "hyphen", label: translate("settingsAdvanced.pronunciationStyle.hyphenReplace.label") },
  ];

  return { createTextOutlineSettingItems, buildLyricsTypographyColumns, getLyricsTypographyRows };
}
