import { SETTINGS_LYRICS_PREVIEW_TEXT as WIZARD_LYRICS_PREVIEW_TEXT } from "#ivlyrics/features/settings/createSettingsLyricsPreview.mjs";
import { createFluentModalHost as createSetupWizardModalHost } from "#ivlyrics/app/modal/fluentModalHost.mjs";
import { getSettingsSurfaceTheme as getSetupWizardTheme } from "#ivlyrics/features/settings/settingsSurfaceTheme.mjs";
import { ensureSetupWizardStyles } from "./setupWizardStyles.mjs";
import { createSetupWizardVideoSteps } from "./setupWizardVideoSteps.mjs";
import { createSetupWizardWelcome } from "./setupWizardWelcome.mjs";
import { handleSettingsRadioKeys as handleSetupWizardRadioKeys } from "#ivlyrics/features/settings/settingsChoiceControls.mjs";

export function createSetupWizard({
  react, host: window, document, i18n: I18n, config: CONFIG, storage: StorageManager, videoHelper: VideoHelperService,
  getOverlaySender, getReactDOM, reload,
}) {
  const { useState } = react;

  // First-run settings. Three short pages share the settings window's tokens and keep changes in a draft.
  const SETUP_STORAGE_KEY = "ivLyrics:setup-completed";

  const WizardIcons = {
    lyrics: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    translation: '<path d="m4 5 7 0M7 3v2c0 7-4 10-4 10m0-6c1 3 3 5 6 7m4 4 4-12 4 12m-6-4h4"/>',
    alignLeft: '<path d="M4 5h16M4 10h10M4 15h16M4 20h10"/>',
    alignCenter: '<path d="M4 5h16M7 10h10M4 15h16M7 20h10"/>',
    alignRight: '<path d="M4 5h16M10 10h10M4 15h16M10 20h10"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20.9 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    overlay: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4M6 9h12m-12 4h8"/>',
    externalLink: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
    mic: '<rect x="8" y="2" width="8" height="12" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  };
  const wizardSvg = (name, size = 20) => react.createElement("svg", {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
    dangerouslySetInnerHTML: { __html: WizardIcons[name] || WizardIcons.lyrics },
  });

  const WIZARD_COLORS = {
    text: "var(--text)", muted: "var(--text-2)", subdued: "var(--text-3)",
    surface: "var(--surface)", surfaceRaised: "var(--surface-2)", surfaceSelected: "var(--accent-soft)",
    border: "var(--line-2)", borderStrong: "var(--accent-line)", accent: "var(--accent-text)",
    accentText: "var(--accent-ink)", warningSurface: "var(--warn-soft)", warningBorder: "var(--line-2)",
    warningText: "var(--warn)", dangerSurface: "var(--danger-soft)", dangerBorder: "var(--line-2)",
    dangerText: "var(--danger)", infoSurface: "var(--info-soft)", infoBorder: "var(--line-2)",
  };
  const wizardStepStyle = { display: "flex", flexDirection: "column", padding: "16px", minWidth: 0 };
  const wizardTitleStyle = { fontSize: "18px", fontWeight: 600, color: WIZARD_COLORS.text, margin: "0 0 6px" };
  const wizardSubtitleStyle = { fontSize: "13px", color: WIZARD_COLORS.muted, lineHeight: 1.6, margin: "0 0 16px" };
  const wizardPanelStyle = { background: WIZARD_COLORS.surface, border: `1px solid ${WIZARD_COLORS.border}`, borderRadius: 8 };

  const WizardButton = ({ children, variant = "secondary", className = "", ...props }) =>
    react.createElement("button", { type: "button", ...props, className: "wizard-button wizard-button-" + variant + " " + className }, children);
  const WizardToggleVisual = ({ enabled }) => react.createElement("span", {
    className: "wizard-switch" + (enabled ? " is-on" : ""), "aria-hidden": true,
  }, react.createElement("span"));
  const WizardNavigation = ({ onBack, onNext, nextLabel, extraActions, hideBack = false, nextDisabled = false }) =>
    react.createElement("div", { className: "wizard-diagnostic-nav" },
      !hideBack && react.createElement(WizardButton, { onClick: onBack }, I18n.t("setupWizard.navigation.back")),
      extraActions,
      onNext && react.createElement(WizardButton, { onClick: onNext, variant: "primary", disabled: nextDisabled },
        nextLabel || I18n.t("setupWizard.navigation.next")));

  const wizardBackgroundOptions = [
    ["colorful", "colorful"], ["gradient", "gradient-background"], ["blurGradient", "blur-gradient-background"],
    ["solid", "solid-background"], ["video", "video-background"], ["none", null],
  ];
  const getWizardBackgroundLabel = (background) => I18n.t(background === "none" ? "settingsUi.background.none" : "setupWizard.theme.backgrounds." + background);
  function getWizardBackground(visual) {
    if (visual["video-background"]) return "video";
    if (visual["solid-background"]) return "solid";
    if (visual["blur-gradient-background"]) return "blurGradient";
    if (visual.colorful) return "colorful";
    return visual["gradient-background"] ? "gradient" : "none";
  }
  const WizardToggleRow = ({ icon, title, description, enabled, onToggle }) =>
    react.createElement("button", { type: "button", className: "wizard-toggle", role: "switch",
      "aria-checked": enabled, onClick: onToggle },
      wizardSvg(icon), react.createElement("span", { className: "wizard-toggle-copy" },
        react.createElement("strong", null, title),
        description && react.createElement("span", null, description)),
      react.createElement(WizardToggleVisual, { enabled }));

  const { useWizardWelcomeLanguage, WizardWelcomeText } = createSetupWizardWelcome({
    react, host: window, document,
    schedule: (...args) => setInterval(...args), cancel: (timer) => clearInterval(timer),
  });
  const { VideoTestStep, VideoHelperTestStep } = createSetupWizardVideoSteps({
    react, host: window, document, i18n: I18n, videoHelper: VideoHelperService,
    style: { WIZARD_COLORS, wizardStepStyle, wizardTitleStyle, wizardSubtitleStyle, wizardPanelStyle },
    controls: { WizardButton, WizardIcons, WizardNavigation, WizardToggleVisual },
  });

  const SetupWizard = ({ onComplete, onDismiss, onThemeChange }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedLanguage, setSelectedLanguage] = useState(I18n.getCurrentLanguage());
    const [languageInteracted, setLanguageInteracted] = useState(false);
    const welcomeLanguage = useWizardWelcomeLanguage(currentStep === 0, selectedLanguage, languageInteracted);
    const [outputLanguage, setOutputLanguage] = useState(CONFIG.visual["translate:target-language"] || "auto");
    const [uiTheme, setUiTheme] = useState(getSetupWizardTheme());
    const changedUiTheme = react.useRef(false);
    const [themeSettings, setThemeSettings] = useState(() => ({
      alignment: CONFIG.visual.alignment || "center",
      background: getWizardBackground(CONFIG.visual),
    }));
    const [overlayEnabled, setOverlayEnabled] = useState(() => {
      const stored = StorageManager.getItem("ivLyrics:overlay-enabled");
      return stored != null ? stored !== "false" : (getOverlaySender()?.enabled ?? false);
    });
    const [nowPlayingEnabled, setNowPlayingEnabled] = useState(CONFIG.visual["panel-lyrics-enabled"] !== false);
    const [pseudoKaraokeEnabled, setPseudoKaraokeEnabled] = useState(!!CONFIG.visual["spotify-fake-karaoke-enabled"]);
    const [videoHelperEnabled, setVideoHelperEnabled] = useState(!!CONFIG.visual["video-helper-enabled"]);
    const [videoCheck, setVideoCheck] = useState(null);
    const [saveFailed, setSaveFailed] = useState(false);
    const pageRef = react.useRef(null);
    const finishing = react.useRef(false);
    const steps = ["language", "appearance", "playback"];
    const languages = I18n.getAvailableLanguages();
    react.useEffect(() => {
      if (currentStep !== 0) setLanguageInteracted(true);
      pageRef.current?.scrollTo?.({ top: 0 });
      pageRef.current?.querySelector("h2")?.focus({ preventScroll: true });
    }, [currentStep]);

    const changeTheme = (theme) => {
      setUiTheme(theme);
      changedUiTheme.current = true;
      onThemeChange?.(theme);
    };
    const changeLanguage = (code) => {
      setLanguageInteracted(true);
      setSelectedLanguage(code);
      I18n.setLanguage(code, { persist: false });
    };
    const changeAppearance = (key, value) => {
      setThemeSettings((previous) => ({ ...previous, [key]: value }));
      if (key === "background") setVideoCheck(null);
    };
    const complete = (openSettings = false) => {
      if (finishing.current) return;
      finishing.current = true;
      const values = {
        language: selectedLanguage, "translate:target-language": outputLanguage,
        alignment: themeSettings.alignment, "overlay-enabled": overlayEnabled,
        "panel-lyrics-enabled": nowPlayingEnabled, "spotify-fake-karaoke-enabled": pseudoKaraokeEnabled,
        "video-helper-enabled": videoHelperEnabled,
      };
      for (const [background, key] of wizardBackgroundOptions) {
        if (key) values[key] = themeSettings.background === background;
      }
      try {
        StorageManager.saveConfigs(values, {
          "ivLyrics:overlay-enabled": overlayEnabled,
          ...(changedUiTheme.current ? { "ivLyrics:settings-ui-theme": uiTheme } : {}),
          [SETUP_STORAGE_KEY]: "true",
        });
      } catch (error) {
        console.error("[ivLyrics] Could not save the initial settings:", error);
        finishing.current = false;
        setSaveFailed(true);
        return;
      }
      Object.assign(CONFIG.visual, values);
      onComplete?.(openSettings);
    };
    const title = (key) => react.createElement("h2", { tabIndex: -1 }, I18n.t(key));
    const languageField = (key, value, onChange, includeAuto = false) =>
      react.createElement("label", { className: "wizard-field" },
        react.createElement("span", null, I18n.t(key)),
        react.createElement("select", { value,
          onFocus: () => setLanguageInteracted(true), onPointerDown: () => setLanguageInteracted(true),
          onChange: (event) => onChange(event.target.value) },
          includeAuto && react.createElement("option", { value: "auto" }, I18n.t("settings.translationTargetLanguage.options.auto")),
          languages.map((language) => react.createElement("option", { key: language.code, value: language.code }, language.name))));

    const languagePage = () => react.createElement("section", { className: "wizard-page" },
      title("setupWizard.language.title"),
      react.createElement("div", { className: "wizard-card" },
        languageField("settings.language.label", selectedLanguage, changeLanguage),
        languageField("settings.translationTargetLanguage.label", outputLanguage, setOutputLanguage, true)),
      react.createElement("div", { className: "wizard-preview", "aria-hidden": true },
        react.createElement("strong", null, WIZARD_LYRICS_PREVIEW_TEXT),
        react.createElement("span", null, I18n.t("settingsAdvanced.livePreview.sampleTextPhonetic")),
        react.createElement("span", null, I18n.t("settingsAdvanced.livePreview.sampleText"))),
      react.createElement("p", { className: "wizard-note" }, I18n.t("setupWizard.quick.languageHint")));

    const appearancePage = () => {
      const selectedBackgroundLabel = getWizardBackgroundLabel(themeSettings.background);
      return react.createElement("section", { className: "wizard-page" },
        title("setupWizard.theme.subtitle"),
        react.createElement("div", { className: "wizard-display-layout" },
          react.createElement("div", {
            className: "wizard-scene", "data-mode": themeSettings.background, "aria-hidden": true,
            style: { textAlign: themeSettings.alignment },
          },
            react.createElement("p", null, selectedBackgroundLabel),
            react.createElement("strong", null, I18n.t("settingsAdvanced.livePreview.sampleText")),
            react.createElement("span", null, "ivLyrics")),
          react.createElement("div", { className: "wizard-display-controls" },
            react.createElement("span", { className: "wizard-label", id: "wizard-alignment-label" }, I18n.t("setupWizard.theme.alignment")),
            react.createElement("div", { className: "wizard-options", role: "radiogroup", "aria-labelledby": "wizard-alignment-label" },
              ["left", "center", "right"].map((alignment, index) => react.createElement("button", {
                key: alignment, type: "button", className: "wizard-option", role: "radio",
                "aria-checked": themeSettings.alignment === alignment,
                tabIndex: themeSettings.alignment === alignment ? 0 : -1,
                onKeyDown: (event) => handleSetupWizardRadioKeys(event, ["left", "center", "right"].map((value) => ({ value })), index, (value) => changeAppearance("alignment", value)),
                onClick: () => changeAppearance("alignment", alignment),
              }, wizardSvg("align" + alignment[0].toUpperCase() + alignment.slice(1), 16),
              I18n.t("settings.alignment.options." + alignment)))),
            react.createElement("span", { className: "wizard-label", id: "wizard-background-label" }, I18n.t("setupWizard.theme.background")),
            react.createElement("div", { className: "wizard-options wizard-backgrounds", role: "radiogroup", "aria-labelledby": "wizard-background-label" },
              wizardBackgroundOptions.map(([background], index) => react.createElement("button", {
                key: background, type: "button", className: "wizard-option", role: "radio",
                "aria-checked": themeSettings.background === background,
                tabIndex: themeSettings.background === background ? 0 : -1,
                onKeyDown: (event) => handleSetupWizardRadioKeys(event, wizardBackgroundOptions.map(([value]) => ({ value })), index, (value) => changeAppearance("background", value)),
                onClick: () => changeAppearance("background", background),
              }, react.createElement("span", { className: "wizard-swatch wizard-scene", "data-mode": background, "aria-hidden": true, style: { minHeight: 26, padding: 0 } }),
              getWizardBackgroundLabel(background)))))),
        themeSettings.background === "video" && react.createElement(WizardButton, {
          variant: "ghost", "aria-expanded": !!videoCheck, "aria-controls": "wizard-video-check",
          onClick: () => setVideoCheck(videoCheck ? null : "video"),
        }, I18n.t("setupWizard.videoTest.title")),
        videoCheck && react.createElement("div", { className: "wizard-diagnostic", id: "wizard-video-check" },
          videoCheck === "helper"
            ? react.createElement(VideoHelperTestStep, {
                onNext: () => setVideoCheck(null), onBack: () => setVideoCheck("video"), onSkip: () => setVideoCheck(null),
                helperEnabled: videoHelperEnabled, onHelperChange: setVideoHelperEnabled,
              })
            : react.createElement(VideoTestStep, {
                onBack: () => setVideoCheck(null), onSkip: () => setVideoCheck(null),
                onNeedHelper: () => setVideoCheck("helper"),
              })));
    };
    const playbackPage = () => react.createElement("section", { className: "wizard-page" },
      title("setupWizard.complete.title"),
      react.createElement("p", { className: "wizard-note" }, I18n.t("setupWizard.complete.subtitle")),
      react.createElement("div", { className: "wizard-card" },
        react.createElement(WizardToggleRow, { icon: "panel", title: I18n.t("setupWizard.nowPlayingTip.enabled"),
          description: I18n.t("setupWizard.nowPlayingTip.subtitle"), enabled: nowPlayingEnabled,
          onToggle: () => setNowPlayingEnabled((value) => !value) }),
        react.createElement(WizardToggleRow, { icon: "overlay", title: I18n.t("setupWizard.overlayTip.title"),
          description: I18n.t("setupWizard.overlayTip.requiresApp"), enabled: overlayEnabled,
          onToggle: () => setOverlayEnabled((value) => !value) }),
        react.createElement(WizardToggleRow, { icon: "mic", title: I18n.t("setupWizard.pseudoKaraokeTip.title"),
          description: I18n.t("setupWizard.pseudoKaraokeTip.subtitle"), enabled: pseudoKaraokeEnabled,
          onToggle: () => setPseudoKaraokeEnabled((value) => !value) })),
      overlayEnabled && react.createElement(WizardButton, {
        variant: "ghost", onClick: () => window.open(getOverlaySender()?.getDownloadUrl?.() || "https://ivlis.kr/ivLyrics/extensions/#overlay", "_blank", "noopener,noreferrer"),
      }, I18n.t("setupWizard.overlayTip.downloadApp")));

    return react.createElement("div", { className: "setup-wizard-container" },
      react.createElement("header", { className: "wizard-topbar" },
        react.createElement("span", { className: "wizard-brand" }, wizardSvg("lyrics"), "ivLyrics"),
        react.createElement("div", { className: "wizard-top-actions" },
          react.createElement("div", { className: "wizard-theme", role: "group", "aria-label": I18n.t("settingsUi.theme.selector") },
            ["light", "dark"].map((theme) => react.createElement("button", {
              key: theme, type: "button", className: "wizard-icon-button", "aria-pressed": uiTheme === theme,
              title: I18n.t("settingsUi.theme." + theme), "aria-label": I18n.t("settingsUi.theme." + theme),
              onClick: () => changeTheme(theme),
            }, wizardSvg(theme === "light" ? "sun" : "moon", 18)))),
          react.createElement("button", { type: "button", className: "wizard-icon-button", onClick: onDismiss,
            title: I18n.t("buttons.close"), "aria-label": I18n.t("buttons.close") }, wizardSvg("close", 20)))),
      react.createElement("div", { className: "wizard-intro", "data-welcome-language": currentStep === 0 ? welcomeLanguage : undefined },
        currentStep === 0
          ? react.createElement(WizardWelcomeText, { tag: "h1", field: "greeting", language: welcomeLanguage,
              id: "ivlyrics-setup-title", "aria-label": I18n.t("setupWizard.language.title") })
          : react.createElement("h1", { id: "ivlyrics-setup-title" }, I18n.t("setupWizard.quick.title")),
        currentStep === 0 && !languageInteracted
          ? react.createElement(WizardWelcomeText, { tag: "p", field: "instruction", language: welcomeLanguage,
              id: "ivlyrics-setup-description", "aria-label": I18n.t("setupWizard.quick.subtitle") })
          : react.createElement("p", { id: "ivlyrics-setup-description" }, I18n.t("setupWizard.quick.subtitle"))),
      react.createElement("ol", { className: "wizard-progress", "aria-label": I18n.t("setupWizard.quick.title") },
        steps.map((step, index) => react.createElement("li", { key: step, className: index < currentStep ? "is-done" : "" },
          react.createElement("button", { type: "button", onClick: () => setCurrentStep(index),
            "aria-current": currentStep === index ? "step" : undefined },
            react.createElement("span", { className: "wizard-step-number", "aria-hidden": true }, index < currentStep ? "✓" : "0" + (index + 1)),
            I18n.t("setupWizard.quick." + step))))),
      react.createElement("main", { className: "wizard-pages", ref: pageRef, key: currentStep },
        [languagePage, appearancePage, playbackPage][currentStep]()),
      saveFailed && react.createElement("p", { className: "wizard-note", role: "alert", style: { color: WIZARD_COLORS.dangerText } },
        I18n.t("messages.error") || "Could not save settings. Try again."),
      react.createElement("footer", { className: "wizard-footer" },
        react.createElement(WizardButton, { variant: "ghost", onClick: currentStep ? () => setCurrentStep(currentStep - 1) : onDismiss },
          I18n.t(currentStep ? "setupWizard.navigation.back" : "setupWizard.apiKey.skip")),
        react.createElement("div", { className: "wizard-footer-actions" },
          currentStep === 2 && react.createElement(WizardButton, { onClick: () => complete(true) }, I18n.t("setupWizard.complete.openSettings")),
          react.createElement(WizardButton, { variant: "primary", onClick: () => currentStep < 2 ? setCurrentStep(currentStep + 1) : complete() },
            I18n.t(currentStep === 2 ? "setupWizard.complete.startNow" : "setupWizard.navigation.next")))));
  };

  function openSetupWizard() {
    if (document.getElementById("ivLyrics-setup-wizard-overlay")) return;
    const dom = getReactDOM();
    if (!dom?.render) return;
    ensureSetupWizardStyles(document);
    const previousLanguage = I18n.getCurrentLanguage();
    let completed = false;
    let host;
    host = createSetupWizardModalHost({
      overlayId: "ivLyrics-setup-wizard-overlay", shellClassName: "ivlyrics-setup-shell",
      closeOnBackdrop: false,
      onBeforeClose: () => {
        dom.unmountComponentAtNode?.(host.shell);
        if (!completed) I18n.setLanguage(previousLanguage, { persist: false });
      },
    });
    host.shell.setAttribute("aria-labelledby", "ivlyrics-setup-title");
    host.shell.setAttribute("aria-describedby", "ivlyrics-setup-description");
    const complete = (openSettings) => {
      completed = true;
      host.closeModal(true);
      reload(openSettings ? { initialTab: "general" } : undefined);
    };
    dom.render(react.createElement(SetupWizard, {
      onComplete: complete, onDismiss: () => host.closeModal(),
      onThemeChange: (theme) => { host.overlay.dataset.uiTheme = theme; host.shell.dataset.uiTheme = theme; },
    }), host.shell);
  }
  function isSetupNeeded() {
    return !StorageManager.getItem(SETUP_STORAGE_KEY);
  }

  return { SetupWizard, openSetupWizard, isSetupNeeded };
}
