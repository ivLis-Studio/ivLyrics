import { normalizeIvLyricsPronunciationNotation } from "../../lyrics/translationPreferences.mjs";

export function createToolbarTranslationMenu({
  react, translate, readInterfaceLanguage, getToolbarText, getVisualSettings, preferences, debug,
  ToolbarPanelSection, ToolbarPanelGroup, ToolbarToggleRow, ToolbarPanelRow, ToolbarSelect, ToolbarButton,
  RegenerateTranslationButton,
}) {
  const { useEffect, useMemo, useRef, useState } = react;

  return react.memo(({ trackUri, friendlyLanguage, detectedLanguage = null, regenerate = null, cacheEdit = null, onOpenSettings }) => {
    useEffect(() => {
      preferences.prepareDisplay();
      debug("[TranslationMenu] Language:", friendlyLanguage, "ModeKey:", friendlyLanguage || "gemini");
    }, []);

    const modeKey = friendlyLanguage || "gemini";

    // 감지된 언어를 사용자 친화적인 이름으로 변환
    const getDisplayLanguageName = (lang) => {
      if (!lang) return translate("menu.unknownLanguage");
      try {
        // 현재 UI 언어로 언어 이름 표시
        const uiLang = readInterfaceLanguage();
        const displayName = new Intl.DisplayNames([uiLang], { type: "language" }).of(lang);
        return displayName || lang;
      } catch {
        return lang;
      }
    };

    // Get target language for translation (to display)
    const getTranslationTargetDisplay = () => {
      const targetLang = getVisualSettings()?.["translate:target-language"];
      if (targetLang && targetLang !== "auto") {
        return getDisplayLanguageName(targetLang);
      }
      // If "auto", defaults to interface language.
      const interfaceLang = readInterfaceLanguage();
      const autoText = translate("settings.translationTargetLanguage.options.auto") || "Same as interface language";
      return `${autoText} (${getDisplayLanguageName(interfaceLang)})`;
    };
    const pronunciationNotationOptions = useMemo(() => [
      {
        key: "translation",
        value: translate("menu.pronunciationNotationTranslation") || "Current translation language",
      },
      {
        key: "latin",
        value: translate("menu.pronunciationNotationLatin") || "Latin (Romanization)",
      },
      {
        key: "ipa",
        value: translate("menu.pronunciationNotationIpa") || "International Phonetic Alphabet (IPA)",
      },
    ], []);

    // 지원되는 언어 목록
    const supportedLanguages = useMemo(() => [
      { key: "auto", value: translate("menu.autoDetect") || "자동 감지" },
      { key: "ja", value: getDisplayLanguageName("ja") },
      { key: "ko", value: getDisplayLanguageName("ko") },
      { key: "zh-hans", value: getDisplayLanguageName("zh-Hans") },
      { key: "zh-hant", value: getDisplayLanguageName("zh-Hant") },
      { key: "en", value: getDisplayLanguageName("en") },
      { key: "ru", value: getDisplayLanguageName("ru") },
      { key: "vi", value: getDisplayLanguageName("vi") },
      { key: "de", value: getDisplayLanguageName("de") },
      { key: "sv", value: getDisplayLanguageName("sv") },
      { key: "es", value: getDisplayLanguageName("es") },
      { key: "fr", value: getDisplayLanguageName("fr") },
      { key: "pt", value: getDisplayLanguageName("pt") },
      { key: "tr", value: getDisplayLanguageName("tr") },
      { key: "cs", value: getDisplayLanguageName("cs") },
      { key: "pl", value: getDisplayLanguageName("pl") },
      { key: "ar", value: getDisplayLanguageName("ar") },
      { key: "th", value: getDisplayLanguageName("th") },
      { key: "hi", value: getDisplayLanguageName("hi") },
      { key: "id", value: getDisplayLanguageName("id") },
      { key: "ms", value: getDisplayLanguageName("ms") },
      // Also detected since the language model; names come from Intl.
      ...["it", "nl", "uk", "bg", "sr", "hr", "ro", "hu", "fi", "da", "no", "sk", "el", "he", "fa", "ur", "bn", "pa", "ta", "tl", "ca",
        "az", "sq", "kk", "mk", "be", "lt", "lv", "et", "af", "is", "mr", "te"]
        .map((key) => ({ key, value: getDisplayLanguageName(key) })),
    ], []);

    const [isPronunciationOn, setPronunciationOn] = useState(
      () => getVisualSettings()[`translation-mode:${modeKey}`] !== "none"
    );
    const [isTranslationOn, setTranslationOn] = useState(
      () => getVisualSettings()[`translation-mode-2:${modeKey}`] !== "none"
    );
    const [pronunciationNotation, setPronunciationNotation] = useState(preferences.readPronunciationNotation);
    const [languageOverride, setLanguageOverride] = useState(preferences.readTrackLanguage);
    const languageSelection = useRef(0);

    return react.createElement(
      "div",
      { className: "ivl-tb-stack" },
      react.createElement(
        ToolbarPanelSection,
        { title: translate("menu.translationOptions") },
        react.createElement(
          ToolbarPanelGroup,
          null,
          react.createElement(ToolbarToggleRow, {
            label: translate("menu.pronunciation"),
            desc: translate("menu.pronunciationInfo"),
            checked: isPronunciationOn,
            onChange: (checked) => {
              setPronunciationOn(checked);
              void preferences.save(`translation-mode:${modeKey}`, checked);
            },
          }),
          isPronunciationOn && react.createElement(ToolbarPanelRow, {
            indent: true,
            stack: true,
            label: translate("menu.pronunciationNotation") || "Pronunciation notation",
            desc: translate("menu.pronunciationNotationInfo") || "Choose how generated pronunciation is written. Regenerate pronunciation to update the current lyrics.",
            control: react.createElement(ToolbarSelect, {
              value: pronunciationNotation,
              options: pronunciationNotationOptions,
              label: translate("menu.pronunciationNotation") || "Pronunciation notation",
              onChange: (key) => {
                setPronunciationNotation(normalizeIvLyricsPronunciationNotation(key));
                void preferences.save("translate:pronunciation-notation", key);
              },
            }),
          }),
          react.createElement(ToolbarToggleRow, {
            label: translate("menu.translationLabel"),
            desc: translate("menu.translationInfo"),
            checked: isTranslationOn,
            onChange: (checked) => {
              setTranslationOn(checked);
              void preferences.save(`translation-mode-2:${modeKey}`, checked);
            },
          }),
          react.createElement(ToolbarPanelRow, {
            stack: true,
            label: translate("menu.translationTargetLang"),
            desc: translate("menu.translationTargetLangInfo"),
            control: react.createElement(
              "span",
              { className: "ivl-tb-value-wrap" },
              react.createElement("span", { className: "ivl-tb-value ivl-tb-trunc" }, getTranslationTargetDisplay()),
              react.createElement(ToolbarButton, {
                variant: "link",
                onClick: () => onOpenSettings?.({ initialTab: "general", initialSettingKey: "language" }),
              }, getToolbarText("settings.hotkey.change", "변경"))
            ),
          })
        )
      ),
      react.createElement(
        ToolbarPanelSection,
        { title: translate("menu.detectedLanguage") },
        react.createElement(
          ToolbarPanelGroup,
          null,
          react.createElement(ToolbarPanelRow, {
            // The detected code reads as a localized name (friendlyLanguage is an
            // English config key such as "japanese").
            label: getDisplayLanguageName(detectedLanguage || friendlyLanguage),
            desc: translate("menu.detectedLanguageInfo"),
            control: languageOverride === "auto"
              ? react.createElement("span", { className: "ivl-tb-pill" }, translate("menu.autoDetect") || "자동 감지")
              : null,
          }),
          react.createElement(ToolbarPanelRow, {
            stack: true,
            label: translate("menu.overrideLanguage") || "언어 수동 설정",
            desc: translate("menu.overrideLanguageInfo") || "이 곡의 언어를 수동으로 설정합니다. 자동 감지 대신 선택한 언어로 번역됩니다.",
            control: react.createElement(ToolbarSelect, {
              value: languageOverride,
              options: supportedLanguages,
              label: translate("menu.overrideLanguage") || "언어 수동 설정",
              onChange: async (key) => {
                const selection = ++languageSelection.current;
                setLanguageOverride(key);
                await preferences.save("track-language-override", key, trackUri);
                if (selection === languageSelection.current) setLanguageOverride(preferences.readTrackLanguage());
              },
            }),
          })
        )
      ),
      (regenerate || cacheEdit) && react.createElement(
        ToolbarPanelSection,
        { title: translate("menu.regenerateTranslation") },
        react.createElement(
          ToolbarPanelGroup,
          null,
          regenerate && react.createElement(RegenerateTranslationButton, regenerate),
          cacheEdit && react.createElement(ToolbarPanelRow, {
            label: translate("lyricsCacheEditor.button"),
            control: react.createElement(ToolbarButton, {
              disabled: cacheEdit.disabled,
              onClick: cacheEdit.onOpen,
            }, translate("buttons.edit")),
          })
        )
      ),
      react.createElement(
        ToolbarPanelSection,
        { title: translate("menu.apiSettings") },
        react.createElement(
          ToolbarPanelGroup,
          null,
          react.createElement(ToolbarPanelRow, {
            label: translate("menu.apiKeySettings"),
            desc: translate("menu.apiSettingsSubtitle"),
            control: react.createElement(ToolbarButton, {
              onClick: () => onOpenSettings?.({ initialTab: "ai-providers" }),
            }, translate("menu.openSettings")),
          })
        )
      )
    );
  });
}
