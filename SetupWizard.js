// SetupWizard.js - First-run setup wizard for ivLyrics
// This module provides a guided setup experience for new users

const SETUP_STORAGE_KEY = "ivLyrics:setup-completed";

// SVG Icons
const WizardIcons = {
  lyrics: '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
  translation: '<path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>',
  customization: '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
  alignLeft: '<path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>',
  alignCenter: '<path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/>',
  alignRight: '<path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/>',
  colorful: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>',
  gradient: '<path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-9-4.39c1.39 0 2.78-.7 2.78-1.56S13.39 11.5 12 11.5s-2.78.7-2.78 1.55 1.39 1.56 2.78 1.56z"/>',
  blurGradient: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="12" cy="12" r="5" opacity="0.5"/>',
  solid: '<path d="M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"/>',
  video: '<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  chevronDown: '<path d="M7 10l5 5 5-5z"/>',
  externalLink: '<path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>',
};

const WIZARD_COLORS = {
  text: "var(--spice-text, #ffffff)",
  muted: "rgba(255, 255, 255, 0.62)",
  subdued: "rgba(255, 255, 255, 0.46)",
  surface: "rgba(255, 255, 255, 0.04)",
  surfaceRaised: "rgba(255, 255, 255, 0.06)",
  surfaceSelected: "rgba(29, 185, 84, 0.12)",
  border: "rgba(255, 255, 255, 0.12)",
  borderStrong: "rgba(29, 185, 84, 0.45)",
  accent: "#1db954",
  accentText: "#000000",
  warningSurface: "rgba(255, 193, 7, 0.12)",
  warningBorder: "rgba(255, 193, 7, 0.35)",
  warningText: "#ffd666",
  dangerSurface: "rgba(255, 107, 107, 0.12)",
  dangerBorder: "rgba(255, 107, 107, 0.4)",
  dangerText: "#ff8f8f",
  infoSurface: "rgba(99, 102, 241, 0.14)",
  infoBorder: "rgba(99, 102, 241, 0.32)",
};

const wizardStepStyle = {
  display: "flex",
  flexDirection: "column",
  padding: "24px",
  minHeight: "420px",
};

const wizardCenteredStepStyle = {
  ...wizardStepStyle,
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "40px 24px",
};

const wizardTitleStyle = {
  fontSize: "20px",
  fontWeight: "600",
  color: WIZARD_COLORS.text,
  marginBottom: "4px",
  textAlign: "center",
};

const wizardHeroTitleStyle = {
  fontSize: "28px",
  fontWeight: "700",
  color: WIZARD_COLORS.text,
  marginBottom: "8px",
};

const wizardSubtitleStyle = {
  fontSize: "13px",
  color: WIZARD_COLORS.subdued,
  marginBottom: "24px",
  textAlign: "center",
};

const wizardHeroSubtitleStyle = {
  fontSize: "14px",
  color: WIZARD_COLORS.muted,
  marginBottom: "36px",
};

const wizardSectionLabelStyle = {
  fontSize: "13px",
  fontWeight: "500",
  color: WIZARD_COLORS.muted,
  marginBottom: "10px",
};

const wizardPanelStyle = {
  background: WIZARD_COLORS.surface,
  border: `1px solid ${WIZARD_COLORS.border}`,
  borderRadius: 0,
};

const wizardMessageStyle = {
  ...wizardPanelStyle,
  textAlign: "center",
  padding: "16px 20px",
  maxWidth: "400px",
};

const wizardToggleVisualStyle = {
  width: "44px",
  height: "24px",
  borderRadius: 0,
  position: "relative",
  transition: "background 0.2s ease, border-color 0.2s ease",
  flex: "0 0 auto",
};

const getWizardButtonStyle = (variant = "secondary", disabled = false) => {
  if (variant === "primary") {
    return {
      padding: "10px 28px",
      fontSize: "13px",
      fontWeight: "600",
      color: WIZARD_COLORS.accentText,
      background: disabled ? "rgba(255, 255, 255, 0.12)" : WIZARD_COLORS.accent,
      border: "1px solid transparent",
      borderRadius: 0,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
    };
  }

  if (variant === "ghost") {
    return {
      padding: "10px 16px",
      fontSize: "12px",
      fontWeight: "500",
      color: WIZARD_COLORS.subdued,
      background: "transparent",
      border: "1px solid transparent",
      borderRadius: 0,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "color 0.2s ease, background 0.2s ease",
    };
  }

  return {
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: "500",
    color: WIZARD_COLORS.muted,
    background: "transparent",
    border: `1px solid ${WIZARD_COLORS.border}`,
    borderRadius: 0,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease",
  };
};

const WizardButton = ({ children, variant = "secondary", style, type = "button", ...props }) =>
  react.createElement(
    "button",
    {
      ...props,
      type,
      style: {
        ...getWizardButtonStyle(variant, props.disabled),
        ...style,
      },
    },
    children
  );

const WizardToggleVisual = ({ enabled, accentColor = WIZARD_COLORS.accent }) =>
  react.createElement(
    "div",
    {
      style: {
        ...wizardToggleVisualStyle,
        background: enabled ? accentColor : "rgba(255, 255, 255, 0.14)",
        border: `1px solid ${enabled ? accentColor : WIZARD_COLORS.border}`,
      },
    },
    react.createElement("div", {
      style: {
        width: "18px",
        height: "18px",
        background: "#ffffff",
        borderRadius: 0,
        position: "absolute",
        top: "2px",
        left: enabled ? "22px" : "2px",
        transition: "left 0.2s ease",
      },
    })
  );

const WizardNavigation = ({ onBack, onNext, nextLabel, extraActions, hideBack = false, nextDisabled = false }) =>
  react.createElement(
    "div",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        marginTop: "16px",
        paddingTop: "16px",
        borderTop: `1px solid ${WIZARD_COLORS.border}`,
      },
    },
    hideBack
      ? react.createElement("div", null)
      : react.createElement(WizardButton, { onClick: onBack }, I18n.t("setupWizard.navigation.back")),
    extraActions
      ? react.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "10px" } },
          extraActions,
          onNext &&
            react.createElement(
              WizardButton,
              { onClick: onNext, variant: "primary", disabled: nextDisabled },
              nextLabel || I18n.t("setupWizard.navigation.next")
            )
        )
      : onNext &&
        react.createElement(
          WizardButton,
          { onClick: onNext, variant: "primary", disabled: nextDisabled },
          nextLabel || I18n.t("setupWizard.navigation.next")
        )
  );

// Progress indicator component
const WizardProgress = react.memo(({ currentStep, totalSteps }) => {
  return react.createElement(
    "div",
    {
      className: "wizard-progress",
      style: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "8px",
        padding: "20px 0",
      },
    },
    Array.from({ length: totalSteps }, (_, i) =>
      react.createElement("div", {
        key: i,
        style: {
          width: i === currentStep ? "24px" : "8px",
          height: "8px",
          borderRadius: 0,
          background:
            i < currentStep
              ? WIZARD_COLORS.surfaceSelected
              : i === currentStep
                ? WIZARD_COLORS.accent
                : "rgba(255, 255, 255, 0.14)",
          transition: "all 0.3s ease",
          boxShadow: "none",
        },
      })
    ),
    react.createElement(
      "span",
      {
        style: {
          marginLeft: "12px",
          fontSize: "12px",
          color: WIZARD_COLORS.subdued,
          fontWeight: "500",
        },
      },
      `${currentStep + 1} / ${totalSteps}`
    )
  );
});

// Feature card component
const FeatureCard = ({ icon, label }) => {
  return react.createElement(
    "div",
    {
      className: "setting-row",
      style: {
        padding: "20px 16px",
        ...wizardPanelStyle,
        textAlign: "center",
      },
    },
    react.createElement(
      "div",
      {
        style: {
          width: "40px",
          height: "40px",
          margin: "0 auto 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: WIZARD_COLORS.surfaceSelected,
          borderRadius: 0,
          border: `1px solid ${WIZARD_COLORS.borderStrong}`,
        },
      },
      react.createElement("svg", {
        width: 24,
        height: 24,
        viewBox: "0 0 24 24",
        fill: "#1db954",
        dangerouslySetInnerHTML: { __html: icon },
      })
    ),
    react.createElement(
      "div",
      {
        style: {
          fontSize: "13px",
          fontWeight: "500",
          color: WIZARD_COLORS.text,
        },
      },
      label
    )
  );
};

// Welcome step - Introduction to ivLyrics
const WelcomeStep = ({ onNext }) => {
  return react.createElement(
    "div",
    {
      className: "wizard-step welcome-step",
      style: wizardCenteredStepStyle,
    },
    // Title
    react.createElement(
      "h1",
      {
        style: wizardHeroTitleStyle,
      },
      I18n.t("setupWizard.welcome.title")
    ),
    react.createElement(
      "p",
      {
        style: wizardHeroSubtitleStyle,
      },
      I18n.t("setupWizard.welcome.subtitle")
    ),
    // Features grid
    react.createElement(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "40px",
          width: "100%",
          maxWidth: "480px",
        },
      },
      react.createElement(FeatureCard, {
        icon: WizardIcons.lyrics,
        label: I18n.t("setupWizard.welcome.features.lyrics"),
      }),
      react.createElement(FeatureCard, {
        icon: WizardIcons.translation,
        label: I18n.t("setupWizard.welcome.features.translation"),
      }),
      react.createElement(FeatureCard, {
        icon: WizardIcons.customization,
        label: I18n.t("setupWizard.welcome.features.customization"),
      })
    ),
    // Start button
    react.createElement(
      WizardButton,
      {
        className: "btn btn-primary",
        onClick: onNext,
        variant: "primary",
        style: {
          padding: "14px 48px",
          fontSize: "14px",
        },
      },
      I18n.t("setupWizard.welcome.start")
    )
  );
};

// Language selection step
const LanguageStep = ({ selectedLanguage, onLanguageChange, onNext, onBack }) => {
  const languages = I18n.getAvailableLanguages();

  return react.createElement(
    "div",
    {
      className: "wizard-step language-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.language.title")
    ),
    react.createElement(
      "p",
      { style: wizardSubtitleStyle },
      I18n.t("setupWizard.language.subtitle")
    ),
    // Language grid
    react.createElement(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: "10px",
          flex: 1,
          overflowY: "auto",
          padding: "4px",
          maxHeight: "280px",
        },
      },
      languages.map((lang) =>
        react.createElement(
          "button",
          {
            key: lang.code,
            onClick: () => onLanguageChange(lang.code),
            style: {
              padding: "14px 12px",
              background:
                selectedLanguage === lang.code
                  ? WIZARD_COLORS.surfaceSelected
                  : WIZARD_COLORS.surface,
              border:
                selectedLanguage === lang.code
                  ? `1px solid ${WIZARD_COLORS.borderStrong}`
                  : `1px solid ${WIZARD_COLORS.border}`,
              borderRadius: 0,
              cursor: "pointer",
              transition: "all 0.15s ease",
              textAlign: "center",
              fontSize: "14px",
              fontWeight: "500",
              color: selectedLanguage === lang.code ? WIZARD_COLORS.accent : WIZARD_COLORS.text,
            },
          },
          lang.name
        )
      )
    ),
    react.createElement(WizardNavigation, { onBack, onNext })
  );
};



// Option button component for theme selection
const OptionButton = ({ icon, label, selected, onClick }) => {
  return react.createElement(
    "button",
    {
      onClick,
      style: {
        flex: 1,
        padding: "14px 8px",
        background: selected
          ? WIZARD_COLORS.surfaceSelected
          : WIZARD_COLORS.surface,
        border: selected
          ? `1px solid ${WIZARD_COLORS.borderStrong}`
          : `1px solid ${WIZARD_COLORS.border}`,
        borderRadius: 0,
        cursor: "pointer",
        transition: "all 0.15s ease",
        textAlign: "center",
      },
    },
    react.createElement(
      "div",
      {
        style: {
          width: "32px",
          height: "32px",
          margin: "0 auto 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      react.createElement("svg", {
        width: 20,
        height: 20,
        viewBox: "0 0 24 24",
        fill: selected ? "#1db954" : "rgba(255, 255, 255, 0.7)",
        dangerouslySetInnerHTML: { __html: icon },
      })
    ),
    react.createElement(
      "div",
      {
        style: {
          fontSize: "12px",
          fontWeight: "500",
          color: selected ? WIZARD_COLORS.accent : WIZARD_COLORS.muted,
        },
      },
      label
    )
  );
};

// Theme/Appearance step
const ThemeStep = ({ settings, onSettingChange, onNext, onBack }) => {
  const alignmentOptions = [
    { value: "left", label: I18n.t("settings.alignment.options.left"), icon: WizardIcons.alignLeft },
    { value: "center", label: I18n.t("settings.alignment.options.center"), icon: WizardIcons.alignCenter },
    { value: "right", label: I18n.t("settings.alignment.options.right"), icon: WizardIcons.alignRight },
  ];

  const backgroundOptions = [
    { value: "colorful", label: I18n.t("setupWizard.theme.backgrounds.colorful"), icon: WizardIcons.colorful },
    { value: "gradient", label: I18n.t("setupWizard.theme.backgrounds.gradient"), icon: WizardIcons.gradient },
    { value: "blurGradient", label: I18n.t("setupWizard.theme.backgrounds.blurGradient"), icon: WizardIcons.blurGradient },
    { value: "solid", label: I18n.t("setupWizard.theme.backgrounds.solid"), icon: WizardIcons.solid },
    { value: "video", label: I18n.t("setupWizard.theme.backgrounds.video"), icon: WizardIcons.video },
  ];

  return react.createElement(
    "div",
    {
      className: "wizard-step theme-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.theme.title")
    ),
    react.createElement(
      "p",
      { style: { ...wizardSubtitleStyle, marginBottom: "28px" } },
      I18n.t("setupWizard.theme.subtitle")
    ),
    // Alignment section
    react.createElement(
      "div",
      { style: { marginBottom: "24px" } },
      react.createElement(
        "div",
        {
          style: wizardSectionLabelStyle,
        },
        I18n.t("setupWizard.theme.alignment")
      ),
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "10px",
          },
        },
        alignmentOptions.map((opt) =>
          react.createElement(OptionButton, {
            key: opt.value,
            icon: opt.icon,
            label: opt.label,
            selected: settings.alignment === opt.value,
            onClick: () => onSettingChange("alignment", opt.value),
          })
        )
      )
    ),
    // Background section
    react.createElement(
      "div",
      { style: { marginBottom: "20px" } },
      react.createElement(
        "div",
        {
          style: wizardSectionLabelStyle,
        },
        I18n.t("setupWizard.theme.background")
      ),
      // First row - 2 items
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "10px",
            marginBottom: "10px",
          },
        },
        backgroundOptions.slice(0, 2).map((opt) =>
          react.createElement(OptionButton, {
            key: opt.value,
            icon: opt.icon,
            label: opt.label,
            selected: settings.background === opt.value,
            onClick: () => onSettingChange("background", opt.value),
          })
        )
      ),
      // Second row - 3 items
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "10px",
          },
        },
        backgroundOptions.slice(2).map((opt) =>
          react.createElement(OptionButton, {
            key: opt.value,
            icon: opt.icon,
            label: opt.label,
            selected: settings.background === opt.value,
            onClick: () => onSettingChange("background", opt.value),
          })
        )
      )
    ),
    // Spacer
    react.createElement("div", { style: { flex: 1 } }),
    react.createElement(WizardNavigation, { onBack, onNext })
  );
};

// Translation Tip step - Animated explanation of per-language translation settings
const TranslationTipStep = ({ onNext, onBack }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const languages = [
    { code: "KO", name: "K-POP", color: "#ff6b9d" },
    { code: "JA", name: "J-POP", color: "#74b9ff" },
    { code: "EN", name: "POP", color: "#55efc4" },
  ];

  // Animation cycle
  react.useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % languages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return react.createElement(
    "div",
    {
      className: "wizard-step translation-tip-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.translationTip.title")
    ),
    react.createElement(
      "p",
      { style: wizardSubtitleStyle },
      I18n.t("setupWizard.translationTip.subtitle")
    ),
    // Animation container
    react.createElement(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
        },
      },
      // Language cards row
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "12px",
            justifyContent: "center",
          },
        },
        languages.map((lang, i) =>
          react.createElement(
            "div",
            {
              key: lang.code,
              style: {
                width: "90px",
                padding: "16px 12px",
                background: activeIndex === i
                  ? WIZARD_COLORS.surfaceSelected
                  : WIZARD_COLORS.surface,
                border: activeIndex === i
                  ? `2px solid ${lang.color}80`
                  : `1px solid ${WIZARD_COLORS.border}`,
                borderRadius: 0,
                textAlign: "center",
                transition: "all 0.4s ease",
                transform: "none",
              },
            },
            react.createElement(
              "div",
              {
                style: {
                  fontSize: "20px",
                  fontWeight: "700",
                  color: activeIndex === i ? lang.color : "rgba(255, 255, 255, 0.4)",
                  marginBottom: "4px",
                  transition: "color 0.4s ease",
                },
              },
              lang.code
            ),
            react.createElement(
              "div",
              {
                style: {
                  fontSize: "11px",
                  color: activeIndex === i ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.4)",
                  transition: "color 0.4s ease",
                },
              },
              lang.name
            )
          )
        )
      ),
      // Arrow and toggle animation
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          },
        },
        // Animated arrow
        react.createElement(
          "svg",
          {
            width: 24,
            height: 24,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: languages[activeIndex].color,
            strokeWidth: 2,
            style: {
              transition: "stroke 0.4s ease",
              animation: "none",
            },
          },
          react.createElement("path", {
            d: "M12 5v14M5 12l7 7 7-7",
          })
        ),
        // Two separate toggle representations for Pronunciation and Translation
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            },
          },
          // Pronunciation toggle
          react.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                ...wizardPanelStyle,
              },
            },
            react.createElement(
              "span",
              {
                style: {
                  fontSize: "12px",
                  color: "rgba(255, 255, 255, 0.7)",
                  minWidth: "40px",
                },
              },
              I18n.t("setupWizard.translationTip.pronunciation")
            ),
            // Toggle switch
            react.createElement(WizardToggleVisual, {
              enabled: true,
              accentColor: languages[activeIndex].color,
            })
          ),
          // Translation toggle
          react.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                ...wizardPanelStyle,
              },
            },
            react.createElement(
              "span",
              {
                style: {
                  fontSize: "12px",
                  color: "rgba(255, 255, 255, 0.7)",
                  minWidth: "40px",
                },
              },
              I18n.t("setupWizard.translationTip.translation")
            ),
            // Toggle switch
            react.createElement(WizardToggleVisual, {
              enabled: true,
              accentColor: languages[activeIndex].color,
            })
          )
        )
      ),
      // Description text
      react.createElement(
        "div",
        {
          style: {
            ...wizardMessageStyle,
          },
        },
        react.createElement(
          "p",
          {
            style: {
              fontSize: "12px",
              color: WIZARD_COLORS.muted,
              lineHeight: "1.6",
              margin: 0,
            },
          },
          I18n.t("setupWizard.translationTip.description")
        )
      )
    ),
    react.createElement(WizardNavigation, { onBack, onNext })
  );
};

// Overlay Tip step - Desktop overlay feature introduction with animation and toggle
const OverlayTipStep = ({ overlayEnabled, onOverlayChange, onNext, onBack }) => {
  const [animPhase, setAnimPhase] = useState(0);

  // Animation cycle for floating overlay effect
  react.useEffect(() => {
    const interval = setInterval(() => {
      setAnimPhase((prev) => (prev + 1) % 3);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return react.createElement(
    "div",
    {
      className: "wizard-step overlay-tip-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.overlayTip.title")
    ),
    react.createElement(
      "p",
      { style: wizardSubtitleStyle },
      I18n.t("setupWizard.overlayTip.subtitle")
    ),
    // Animation container
    react.createElement(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
        },
      },
      // Desktop mockup with floating overlay
      react.createElement(
        "div",
        {
          style: {
            position: "relative",
            width: "280px",
            height: "180px",
            opacity: overlayEnabled ? 1 : 0.5,
            transition: "opacity 0.3s ease",
          },
        },
        // Desktop screen
        react.createElement(
          "div",
          {
            style: {
              width: "100%",
              height: "140px",
              background: WIZARD_COLORS.surfaceRaised,
              borderRadius: 0,
              border: `1px solid ${WIZARD_COLORS.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            },
          },
          // App windows inside desktop
          react.createElement("div", {
            style: {
              position: "absolute",
              left: "20px",
              top: "20px",
              width: "100px",
              height: "80px",
              background: "rgba(100, 100, 100, 0.3)",
              borderRadius: 0,
            },
          }),
          react.createElement("div", {
            style: {
              position: "absolute",
              right: "20px",
              top: "30px",
              width: "80px",
              height: "60px",
              background: "rgba(80, 80, 80, 0.3)",
              borderRadius: 0,
            },
          }),
          // Floating overlay animation
          overlayEnabled && react.createElement(
            "div",
            {
              style: {
                position: "absolute",
                right: animPhase === 0 ? "30px" : animPhase === 1 ? "40px" : "25px",
                bottom: animPhase === 0 ? "10px" : animPhase === 1 ? "20px" : "15px",
                padding: "8px 12px",
                background: WIZARD_COLORS.accent,
                borderRadius: 0,
                boxShadow: "none",
                border: `1px solid ${WIZARD_COLORS.borderStrong}`,
                transition: "all 0.5s ease",
                transform: "none",
              },
            },
            react.createElement(
              "div",
              {
                style: {
                  fontSize: "9px",
                  color: "#fff",
                  fontWeight: "600",
                  textAlign: "center",
                },
              },
              "♪ 가사가 여기에"
            )
          )
        ),
        // Desktop stand
        react.createElement("div", {
          style: {
            width: "80px",
            height: "20px",
            background: "rgba(255, 255, 255, 0.1)",
            margin: "0 auto",
            borderRadius: 0,
          },
        }),
        react.createElement("div", {
          style: {
            width: "120px",
            height: "8px",
            background: "rgba(255, 255, 255, 0.08)",
            margin: "0 auto",
            borderRadius: 0,
          },
        })
      ),
      // Interactive Toggle
      react.createElement(
        "button",
        {
          onClick: () => onOverlayChange(!overlayEnabled),
          style: {
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 24px",
            background: overlayEnabled
              ? WIZARD_COLORS.surfaceSelected
              : WIZARD_COLORS.surfaceRaised,
            borderRadius: 0,
            border: overlayEnabled
              ? `1px solid ${WIZARD_COLORS.borderStrong}`
              : `1px solid ${WIZARD_COLORS.border}`,
            cursor: "pointer",
            transition: "all 0.2s ease",
          },
        },
        react.createElement(
          "span",
          {
            style: {
              fontSize: "14px",
              fontWeight: "500",
              color: overlayEnabled ? WIZARD_COLORS.accent : WIZARD_COLORS.muted,
            },
          },
          I18n.t("setupWizard.overlayTip.enabled")
        ),
        react.createElement(WizardToggleVisual, {
          enabled: overlayEnabled,
        })
      ),
      // Description and install notice
      react.createElement(
        "div",
        {
          style: {
            ...wizardMessageStyle,
          },
        },
        react.createElement(
          "p",
          {
            style: {
              fontSize: "12px",
              color: WIZARD_COLORS.muted,
              lineHeight: "1.6",
              margin: "0 0 12px 0",
            },
          },
          I18n.t("setupWizard.overlayTip.description")
        ),
        // Requires app notice
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "10px 14px",
              background: WIZARD_COLORS.warningSurface,
              border: `1px solid ${WIZARD_COLORS.warningBorder}`,
              borderRadius: 0,
              marginBottom: "12px",
            },
          },
          react.createElement(
            "svg",
            {
              width: 16,
              height: 16,
              viewBox: "0 0 24 24",
              fill: "#ffc107",
            },
            react.createElement("path", {
              d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
            })
          ),
          react.createElement(
            "span",
            {
              style: {
                fontSize: "11px",
                color: WIZARD_COLORS.warningText,
                fontWeight: "500",
              },
            },
            I18n.t("setupWizard.overlayTip.requiresApp")
          )
        ),
        // Download button
        react.createElement(
          WizardButton,
          {
            onClick: () => {
              const url = (typeof window !== "undefined" && window.OverlaySender?.getDownloadUrl?.()) ||
                "https://ivlis.kr/ivLyrics/extensions/#overlay";
              window.open(url, "_blank");
            },
            variant: "secondary",
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: WIZARD_COLORS.text,
              background: WIZARD_COLORS.infoSurface,
              borderColor: WIZARD_COLORS.infoBorder,
            },
          },
          react.createElement("svg", {
            width: 14,
            height: 14,
            viewBox: "0 0 24 24",
            fill: "currentColor",
            dangerouslySetInnerHTML: { __html: WizardIcons.externalLink },
          }),
          I18n.t("setupWizard.overlayTip.downloadApp")
        )
      )
    ),
    react.createElement(WizardNavigation, { onBack, onNext })
  );
};

// NowPlaying Panel Tip step - Panel lyrics feature introduction with animation and toggle
const NowPlayingTipStep = ({ nowPlayingEnabled, onNowPlayingChange, onNext, onBack }) => {
  const [currentLine, setCurrentLine] = useState(0);
  const sampleLyrics = ["첫 번째 가사", "현재 재생 중인 가사", "다음 가사..."];

  // Animation cycle for lyrics scrolling
  react.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLine((prev) => (prev + 1) % sampleLyrics.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return react.createElement(
    "div",
    {
      className: "wizard-step nowplaying-tip-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.nowPlayingTip.title")
    ),
    react.createElement(
      "p",
      { style: wizardSubtitleStyle },
      I18n.t("setupWizard.nowPlayingTip.subtitle")
    ),
    // Animation container
    react.createElement(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
        },
      },
      // Spotify-like panel mockup
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "8px",
            width: "320px",
            opacity: nowPlayingEnabled ? 1 : 0.5,
            transition: "opacity 0.3s ease",
          },
        },
        // Main area (blurred)
        react.createElement(
          "div",
          {
            style: {
              flex: 1,
              height: "180px",
              background: WIZARD_COLORS.surface,
              borderRadius: 0,
              border: `1px solid ${WIZARD_COLORS.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              color: "rgba(255, 255, 255, 0.3)",
            },
          },
          "메인 화면"
        ),
        // Right panel with lyrics
        nowPlayingEnabled && react.createElement(
          "div",
          {
            style: {
              width: "120px",
              height: "180px",
              background: WIZARD_COLORS.surfaceSelected,
              borderRadius: 0,
              border: `1px solid ${WIZARD_COLORS.borderStrong}`,
              padding: "12px 8px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            },
          },
          // Panel header
          react.createElement(
            "div",
            {
              style: {
                fontSize: "9px",
                fontWeight: "600",
                color: "#1db954",
                marginBottom: "8px",
                textAlign: "center",
              },
            },
            "지금 재생 중"
          ),
          // Album art placeholder
          react.createElement("div", {
            style: {
              width: "40px",
              height: "40px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: 0,
              margin: "0 auto 8px",
            },
          }),
          // Lyrics preview
          react.createElement(
            "div",
            {
              style: {
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: "4px",
              },
            },
            sampleLyrics.map((lyric, i) =>
              react.createElement(
                "div",
                {
                  key: i,
                  style: {
                    fontSize: "8px",
                    color: currentLine === i ? "#1db954" : "rgba(255, 255, 255, 0.4)",
                    fontWeight: currentLine === i ? "600" : "400",
                    textAlign: "center",
                    transition: "all 0.3s ease",
                    transform: "none",
                  },
                },
                lyric
              )
            )
          )
        )
      ),
      // Interactive Toggle
      react.createElement(
        "button",
        {
          onClick: () => onNowPlayingChange(!nowPlayingEnabled),
          style: {
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 24px",
            background: nowPlayingEnabled
              ? WIZARD_COLORS.surfaceSelected
              : WIZARD_COLORS.surfaceRaised,
            borderRadius: 0,
            border: nowPlayingEnabled
              ? `1px solid ${WIZARD_COLORS.borderStrong}`
              : `1px solid ${WIZARD_COLORS.border}`,
            cursor: "pointer",
            transition: "all 0.2s ease",
          },
        },
        react.createElement(
          "span",
          {
            style: {
              fontSize: "14px",
              fontWeight: "500",
              color: nowPlayingEnabled ? WIZARD_COLORS.accent : WIZARD_COLORS.muted,
            },
          },
          I18n.t("setupWizard.nowPlayingTip.enabled")
        ),
        react.createElement(WizardToggleVisual, {
          enabled: nowPlayingEnabled,
        })
      ),
      // Description text
      react.createElement(
        "div",
        {
          style: {
            ...wizardMessageStyle,
          },
        },
        react.createElement(
          "p",
          {
            style: {
              fontSize: "12px",
              color: WIZARD_COLORS.muted,
              lineHeight: "1.6",
              margin: 0,
            },
          },
          I18n.t("setupWizard.nowPlayingTip.description")
        )
      )
    ),
    react.createElement(WizardNavigation, { onBack, onNext })
  );
};

const PseudoKaraokeTipStep = ({ pseudoKaraokeEnabled, onPseudoKaraokeChange, onNext, onBack }) => {
  return react.createElement(
    "div",
    {
      className: "wizard-step pseudo-karaoke-tip-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.pseudoKaraokeTip.title")
    ),
    react.createElement(
      "p",
      { style: wizardSubtitleStyle },
      I18n.t("setupWizard.pseudoKaraokeTip.subtitle")
    ),
    react.createElement(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "20px",
        },
      },
      react.createElement(
        "div",
        {
          style: {
            padding: "28px",
            background: WIZARD_COLORS.surfaceRaised,
            border: `1px solid ${WIZARD_COLORS.border}`,
            borderRadius: 0,
          },
        },
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "14px",
              marginBottom: "16px",
            },
          },
          react.createElement("svg", {
            width: 22,
            height: 22,
            viewBox: "0 0 24 24",
            fill: WIZARD_COLORS.accent,
            dangerouslySetInnerHTML: { __html: WizardIcons.lyrics },
          }),
          react.createElement(
            "strong",
            {
              style: {
                fontSize: "15px",
                color: WIZARD_COLORS.text,
                fontWeight: "600",
              },
            },
            I18n.t("setupWizard.pseudoKaraokeTip.enabled")
          )
        ),
        react.createElement(
          "p",
          {
            style: {
              margin: 0,
              fontSize: "13px",
              lineHeight: "1.7",
              color: WIZARD_COLORS.subdued,
            },
          },
          I18n.t("setupWizard.pseudoKaraokeTip.description")
        )
      ),
      react.createElement(
        "button",
        {
          onClick: () => onPseudoKaraokeChange(!pseudoKaraokeEnabled),
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "16px 22px",
            background: pseudoKaraokeEnabled
              ? WIZARD_COLORS.surfaceSelected
              : WIZARD_COLORS.surfaceRaised,
            borderRadius: 0,
            border: pseudoKaraokeEnabled
              ? `1px solid ${WIZARD_COLORS.borderStrong}`
              : `1px solid ${WIZARD_COLORS.border}`,
            cursor: "pointer",
            transition: "all 0.2s ease",
          },
        },
        react.createElement(
          "span",
          {
            style: {
              fontSize: "14px",
              fontWeight: "500",
              color: pseudoKaraokeEnabled ? WIZARD_COLORS.accent : WIZARD_COLORS.muted,
            },
          },
          I18n.t("setupWizard.pseudoKaraokeTip.enabled")
        ),
        react.createElement(WizardToggleVisual, {
          enabled: pseudoKaraokeEnabled,
        })
      )
    ),
    react.createElement(WizardNavigation, { onBack, onNext })
  );
};

// Video Test step - Check if YouTube embed requires login
const VideoTestStep = ({ onNext, onBack, onNeedHelper, onSkip }) => {
  const [loginRequired, setLoginRequired] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const playerContainerRef = react.useRef(null);
  const playerRef = react.useRef(null);
  const playerIdRef = react.useRef("yt-wizard-player-" + Math.random().toString(36).substr(2, 9));

  const handleYes = () => {
    setLoginRequired(true);
  };

  const handleNo = () => {
    // No login required, skip helper steps
    onSkip();
  };

  const handleInstallHelper = () => {
    if (typeof VideoHelperService !== "undefined") {
      VideoHelperService.openDownloadPage();
    } else {
      window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank");
    }
  };

  // Initialize YouTube Player API
  react.useEffect(() => {
    const playerId = playerIdRef.current;

    const createPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        // Wait for YT API to load
        setTimeout(createPlayer, 200);
        return;
      }

      // Create container div if not exists
      if (playerContainerRef.current && !document.getElementById(playerId)) {
        const div = document.createElement("div");
        div.id = playerId;
        div.style.width = "100%";
        div.style.height = "100%";
        playerContainerRef.current.appendChild(div);
      }

      try {
        playerRef.current = new window.YT.Player(playerId, {
          videoId: "9bZkp7q19f0",
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            rel: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            fs: 0,
            disablekb: 1,
            origin: window.location.origin,
            autoplay: 0,
            controls: 1,
          },
          events: {
            onReady: () => {
              setPlayerReady(true);
            },
            onError: (e) => {
              console.warn("[VideoTestStep] Player error:", e.data);
            },
          },
        });
      } catch (e) {
        console.error("[VideoTestStep] Failed to create player:", e);
      }
    };

    // Load YouTube IFrame API if not loaded
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        createPlayer();
      };
    } else {
      createPlayer();
    }

    // Cleanup
    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, []);

  return react.createElement(
    "div",
    {
      className: "wizard-step video-test-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.videoTest.title")
    ),
    react.createElement(
      "p",
      { style: { ...wizardSubtitleStyle, marginBottom: "20px" } },
      I18n.t("setupWizard.videoTest.subtitle")
    ),
    // YouTube Player container
    react.createElement(
      "div",
      {
        ref: playerContainerRef,
        style: {
          width: "100%",
          maxWidth: "400px",
          margin: "0 auto 20px",
          aspectRatio: "16/9",
          borderRadius: 0,
          overflow: "hidden",
          background: "rgba(0, 0, 0, 0.3)",
          border: `1px solid ${WIZARD_COLORS.border}`,
        },
      }
    ),
    // Question section
    react.createElement(
      "div",
      {
        style: {
          textAlign: "center",
          marginBottom: "16px",
        },
      },
      react.createElement(
        "p",
        {
          style: {
            fontSize: "14px",
            fontWeight: "500",
            color: WIZARD_COLORS.text,
            marginBottom: "12px",
          },
        },
        I18n.t("setupWizard.videoTest.question")
      ),
      // Yes/No buttons
      loginRequired === null &&
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "center",
            gap: "12px",
          },
        },
        react.createElement(
          WizardButton,
          {
            onClick: handleYes,
            style: {
              padding: "10px 32px",
              fontSize: "14px",
              color: WIZARD_COLORS.dangerText,
              background: WIZARD_COLORS.dangerSurface,
              borderColor: WIZARD_COLORS.dangerBorder,
            },
          },
          I18n.t("setupWizard.videoTest.yes")
        ),
        react.createElement(
          WizardButton,
          {
            onClick: handleNo,
            style: {
              padding: "10px 32px",
              fontSize: "14px",
              color: WIZARD_COLORS.accent,
              background: WIZARD_COLORS.surfaceSelected,
              borderColor: WIZARD_COLORS.borderStrong,
            },
          },
          I18n.t("setupWizard.videoTest.no")
        )
      )
    ),
    // Helper required message (shown when loginRequired is true)
    loginRequired === true &&
    react.createElement(
      "div",
      {
        style: {
          textAlign: "center",
          padding: "16px 20px",
          background: WIZARD_COLORS.warningSurface,
          borderRadius: 0,
          border: `1px solid ${WIZARD_COLORS.warningBorder}`,
          marginBottom: "16px",
        },
      },
      react.createElement(
        "p",
        {
          style: {
            fontSize: "14px",
            fontWeight: "600",
            color: WIZARD_COLORS.warningText,
            marginBottom: "8px",
          },
        },
        I18n.t("setupWizard.videoTest.helperRequired")
      ),
      react.createElement(
        "p",
        {
          style: {
            fontSize: "12px",
            color: WIZARD_COLORS.muted,
            marginBottom: "16px",
          },
        },
        I18n.t("setupWizard.videoTest.helperDesc")
      ),
      react.createElement(
        WizardButton,
        {
          onClick: handleInstallHelper,
          variant: "secondary",
          style: {
            padding: "12px 24px",
            fontSize: "13px",
            fontWeight: "600",
            color: WIZARD_COLORS.warningText,
            background: WIZARD_COLORS.warningSurface,
            borderColor: WIZARD_COLORS.warningBorder,
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "12px",
          },
        },
        react.createElement("svg", {
          width: 16,
          height: 16,
          viewBox: "0 0 24 24",
          fill: "currentColor",
          dangerouslySetInnerHTML: { __html: WizardIcons.externalLink },
        }),
        I18n.t("setupWizard.videoTest.installHelper")
      )
    ),
    // Spacer
    react.createElement("div", { style: { flex: 1 } }),
    react.createElement(WizardNavigation, {
      onBack,
      onNext: loginRequired === true ? onNeedHelper : null,
      extraActions: react.createElement(
        WizardButton,
        {
          onClick: onSkip,
          variant: "ghost",
        },
        I18n.t("setupWizard.videoTest.skip")
      ),
    })
  );
};

// Video Helper Test step - Test helper program with the same video
const VideoHelperTestStep = ({ onNext, onBack, onSkip, helperEnabled, onHelperChange }) => {
  const [testStatus, setTestStatus] = useState("idle"); // idle, testing, downloading, success, failed
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);

  const testVideoId = "9bZkp7q19f0";

  const handleEnableHelper = () => {
    onHelperChange(!helperEnabled);
  };

  const handleTestVideo = async () => {
    if (typeof VideoHelperService === "undefined") {
      setTestStatus("failed");
      return;
    }

    setTestStatus("testing");
    setDownloadPercent(0);
    setVideoUrl(null);

    // First check if helper is available
    const available = await VideoHelperService.checkHealth();
    if (!available) {
      setTestStatus("failed");
      return;
    }

    // Request the video
    const abort = VideoHelperService.requestVideo(testVideoId, {
      onProgress: (data) => {
        setTestStatus("downloading");
        setDownloadPercent(data.percent || 0);
      },
      onComplete: (url) => {
        setVideoUrl(url);
        setTestStatus("success");
      },
      onError: (message) => {
        console.error("[VideoHelperTest] Error:", message);
        setTestStatus("failed");
      },
    });
  };

  return react.createElement(
    "div",
    {
      className: "wizard-step video-helper-test-step",
      style: wizardStepStyle,
    },
    react.createElement(
      "h2",
      { style: wizardTitleStyle },
      I18n.t("setupWizard.videoHelperTest.title")
    ),
    react.createElement(
      "p",
      { style: wizardSubtitleStyle },
      I18n.t("setupWizard.videoHelperTest.subtitle")
    ),
    // Enable helper toggle
    react.createElement(
      "div",
      {
        onClick: handleEnableHelper,
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          ...wizardPanelStyle,
          marginBottom: "16px",
          cursor: "pointer",
        },
      },
      react.createElement(
        "span",
        {
          style: {
            fontSize: "14px",
            fontWeight: "500",
            color: WIZARD_COLORS.text,
          },
        },
        I18n.t("setupWizard.videoHelperTest.enableHelper")
      ),
      react.createElement(WizardToggleVisual, {
        enabled: helperEnabled,
      })
    ),
    // Test button
    helperEnabled &&
    react.createElement(
      "div",
      {
        style: {
          textAlign: "center",
          marginBottom: "20px",
        },
      },
      react.createElement(
        WizardButton,
        {
          onClick: handleTestVideo,
          disabled: testStatus === "testing" || testStatus === "downloading",
          variant: "primary",
          style: {
            padding: "14px 32px",
            fontSize: "14px",
          },
        },
        testStatus === "testing" || testStatus === "downloading"
          ? I18n.t("setupWizard.videoHelperTest.testing")
          : I18n.t("setupWizard.videoHelperTest.testVideo")
      )
    ),
    // Download progress
    testStatus === "downloading" &&
    react.createElement(
      "div",
      {
        style: {
          textAlign: "center",
          marginBottom: "16px",
        },
      },
      react.createElement(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: "300px",
            height: "8px",
            background: "rgba(255, 255, 255, 0.1)",
            borderRadius: 0,
            margin: "0 auto 8px",
            overflow: "hidden",
          },
        },
        react.createElement("div", {
          style: {
            width: `${downloadPercent}%`,
            height: "100%",
            background: WIZARD_COLORS.accent,
            borderRadius: 0,
            transition: "width 0.3s ease",
          },
        })
      ),
      react.createElement(
        "p",
        {
          style: {
            fontSize: "12px",
            color: WIZARD_COLORS.muted,
          },
        },
        I18n.t("setupWizard.videoHelperTest.downloading").replace("{percent}", Math.round(downloadPercent))
      )
    ),
    // Success message
    testStatus === "success" &&
    react.createElement(
      "div",
      {
        style: {
          textAlign: "center",
          padding: "16px 20px",
          background: WIZARD_COLORS.surfaceSelected,
          borderRadius: 0,
          border: `1px solid ${WIZARD_COLORS.borderStrong}`,
          marginBottom: "16px",
        },
      },
      react.createElement(
        "p",
        {
          style: {
            fontSize: "14px",
            fontWeight: "600",
            color: WIZARD_COLORS.accent,
            marginBottom: videoUrl ? "12px" : "0",
          },
        },
        "✓ " + I18n.t("setupWizard.videoHelperTest.success")
      ),
      // Show video preview if available
      videoUrl &&
      react.createElement(
        "div",
        {
          style: {
            maxWidth: "300px",
            margin: "0 auto",
            borderRadius: 0,
            overflow: "hidden",
          },
        },
        react.createElement("video", {
          src: videoUrl,
          style: {
            width: "100%",
            borderRadius: 0,
          },
          controls: true,
          autoPlay: true,
          muted: true,
        })
      )
    ),
    // Failed message
    testStatus === "failed" &&
    react.createElement(
      "div",
      {
        style: {
          textAlign: "center",
          padding: "16px 20px",
          background: WIZARD_COLORS.dangerSurface,
          borderRadius: 0,
          border: `1px solid ${WIZARD_COLORS.dangerBorder}`,
          marginBottom: "16px",
        },
      },
      react.createElement(
        "p",
        {
          style: {
            fontSize: "14px",
            fontWeight: "600",
            color: WIZARD_COLORS.dangerText,
          },
        },
        "✕ " + I18n.t("setupWizard.videoHelperTest.failed")
      )
    ),
    // Spacer
    react.createElement("div", { style: { flex: 1 } }),
    react.createElement(WizardNavigation, {
      onBack,
      onNext,
      extraActions: react.createElement(
        WizardButton,
        {
          onClick: onSkip,
          variant: "ghost",
        },
        I18n.t("setupWizard.videoHelperTest.skip")
      ),
    })
  );
};

// Complete step
const CompleteStep = ({ onStart, onOpenSettings }) => {
  const [showCheck, setShowCheck] = useState(false);

  react.useEffect(() => {
    const timer = setTimeout(() => setShowCheck(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return react.createElement(
    "div",
    {
      className: "wizard-step complete-step",
      style: wizardCenteredStepStyle,
    },
    // Checkmark animation
    react.createElement(
      "div",
      {
        style: {
          width: "72px",
          height: "72px",
          borderRadius: 0,
          background: WIZARD_COLORS.surfaceSelected,
          border: `2px solid ${WIZARD_COLORS.borderStrong}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "20px",
          transform: "none",
          opacity: showCheck ? 1 : 0,
          transition: "opacity 0.3s ease",
        },
      },
      react.createElement(
        "svg",
        {
          width: "32",
          height: "32",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "#1db954",
          strokeWidth: "2.5",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: {
            transform: "none",
            opacity: showCheck ? 1 : 0,
            transition: "opacity 0.2s ease 0.1s",
          },
        },
        react.createElement("polyline", {
          points: "20 6 9 17 4 12",
        })
      )
    ),
    react.createElement(
      "h2",
      {
        style: {
          fontSize: "24px",
          fontWeight: "600",
          color: WIZARD_COLORS.text,
          marginBottom: "6px",
        },
      },
      I18n.t("setupWizard.complete.title")
    ),
    react.createElement(
      "p",
      {
        style: {
          fontSize: "14px",
          color: WIZARD_COLORS.subdued,
          marginBottom: "36px",
        },
      },
      I18n.t("setupWizard.complete.subtitle")
    ),
    // Action buttons
    react.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          width: "100%",
          maxWidth: "280px",
        },
      },
      react.createElement(
        WizardButton,
        {
          onClick: onStart,
          variant: "primary",
          style: {
            padding: "14px 32px",
            fontSize: "14px",
          },
        },
        I18n.t("setupWizard.complete.startNow")
      ),
      react.createElement(
        WizardButton,
        {
          onClick: onOpenSettings,
          style: {
            padding: "12px 32px",
          },
        },
        I18n.t("setupWizard.complete.openSettings")
      )
    )
  );
};

// Main SetupWizard component
const SetupWizard = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState(I18n.getCurrentLanguage());


  const [themeSettings, setThemeSettings] = useState({
    alignment: "center",
    background: "gradient", // Default to album cover background
  });

  // Feature toggles - overlay off by default, nowplaying on by default
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [nowPlayingEnabled, setNowPlayingEnabled] = useState(true);
  const [pseudoKaraokeEnabled, setPseudoKaraokeEnabled] = useState(
    !!CONFIG?.visual?.["spotify-fake-karaoke-enabled"]
  );

  // Video test state - whether we need to show helper test step
  const [showHelperTestStep, setShowHelperTestStep] = useState(false);

  // Video helper enabled state
  const [videoHelperEnabled, setVideoHelperEnabled] = useState(false);

  // Build dynamic step list based on selected background
  const getSteps = () => {
    const baseSteps = [
      "welcome",
      "language",
      "theme",
    ];

    // If video background is selected, add video test step
    if (themeSettings.background === "video") {
      baseSteps.push("videoTest");
      // If user said login is required, add helper test step
      if (showHelperTestStep) {
        baseSteps.push("videoHelperTest");
      }
    }

    baseSteps.push("overlay", "nowPlaying", "pseudoKaraoke", "translationTip", "complete");
    return baseSteps;
  };

  const steps = getSteps();
  const totalSteps = steps.length;

  const handleLanguageChange = (langCode) => {
    setSelectedLanguage(langCode);
    I18n.setLanguage(langCode);
    // Save language setting
    if (typeof StorageManager !== "undefined") {
      StorageManager.saveConfig("language", langCode);
    }
  };

  const handleThemeChange = (key, value) => {
    setThemeSettings((prev) => ({ ...prev, [key]: value }));
    // Reset helper test step state when background changes
    if (key === "background") {
      setShowHelperTestStep(false);
    }
  };

  const saveSettings = () => {


    // Save theme settings
    if (typeof StorageManager !== "undefined" && typeof CONFIG !== "undefined") {
      // Alignment
      StorageManager.saveConfig("alignment", themeSettings.alignment);
      CONFIG.visual["alignment"] = themeSettings.alignment;

      // Background - reset all first
      const bgKeys = ["colorful", "gradient-background", "blur-gradient-background", "solid-background", "video-background"];
      bgKeys.forEach((key) => {
        StorageManager.saveConfig(key, false);
        CONFIG.visual[key] = false;
      });

      // Set selected background
      if (themeSettings.background === "colorful") {
        StorageManager.saveConfig("colorful", true);
        CONFIG.visual["colorful"] = true;
      } else if (themeSettings.background === "gradient") {
        StorageManager.saveConfig("gradient-background", true);
        CONFIG.visual["gradient-background"] = true;
      } else if (themeSettings.background === "blurGradient") {
        StorageManager.saveConfig("blur-gradient-background", true);
        CONFIG.visual["blur-gradient-background"] = true;
      } else if (themeSettings.background === "solid") {
        StorageManager.saveConfig("solid-background", true);
        CONFIG.visual["solid-background"] = true;
      } else if (themeSettings.background === "video") {
        StorageManager.saveConfig("video-background", true);
        CONFIG.visual["video-background"] = true;
      }

      // Save video helper setting (only if video background selected and helper step was shown)
      if (themeSettings.background === "video" && showHelperTestStep) {
        StorageManager.saveConfig("video-helper-enabled", videoHelperEnabled);
        CONFIG.visual["video-helper-enabled"] = videoHelperEnabled;
      }

      // Save overlay setting
      StorageManager.saveConfig("overlay-enabled", overlayEnabled);
      CONFIG.visual["overlay-enabled"] = overlayEnabled;

      // Save NowPlaying panel setting
      StorageManager.saveConfig("panel-lyrics-enabled", nowPlayingEnabled);
      CONFIG.visual["panel-lyrics-enabled"] = nowPlayingEnabled;

      // Save pseudo karaoke setting
      StorageManager.saveConfig("spotify-fake-karaoke-enabled", pseudoKaraokeEnabled);
      CONFIG.visual["spotify-fake-karaoke-enabled"] = pseudoKaraokeEnabled;
    }

    // Keep the overlay runtime flag in the same persistent settings store.
    if (typeof Spicetify !== "undefined" && Spicetify.LocalStorage) {
      StorageManager.setItem("ivLyrics:overlay-enabled", overlayEnabled ? "true" : "false");
    }

    // Mark setup as completed
    StorageManager.setItem(SETUP_STORAGE_KEY, "true");
  };

  const handleComplete = (openSettings = false) => {
    saveSettings();

    // Close wizard and refresh
    if (onComplete) {
      onComplete(openSettings);
    }

    // Reload after a short delay to apply settings
    setTimeout(() => {
      location.reload();
    }, 100);
  };

  const goNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Handler for when user needs helper (from VideoTestStep)
  const handleNeedHelper = () => {
    setShowHelperTestStep(true);
    goNext();
  };

  // Handler to skip video helper steps (user doesn't need login or wants to skip)
  const handleSkipVideoSteps = () => {
    // Find the next step after video-related steps
    const currentStepName = steps[currentStep];
    if (currentStepName === "videoTest" || currentStepName === "videoHelperTest") {
      // Find overlay step index
      const overlayIndex = steps.indexOf("overlay");
      if (overlayIndex > currentStep) {
        setCurrentStep(overlayIndex);
      } else {
        goNext();
      }
    } else {
      goNext();
    }
  };

  const renderStep = () => {
    const stepName = steps[currentStep];

    switch (stepName) {
      case "welcome":
        return react.createElement(WelcomeStep, { onNext: goNext });
      case "language":
        return react.createElement(LanguageStep, {
          selectedLanguage,
          onLanguageChange: handleLanguageChange,
          onNext: goNext,
          onBack: goBack,
        });
      case "theme":
        return react.createElement(ThemeStep, {
          settings: themeSettings,
          onSettingChange: handleThemeChange,
          onNext: goNext,
          onBack: goBack,
        });
      case "videoTest":
        return react.createElement(VideoTestStep, {
          onNext: goNext,
          onBack: goBack,
          onNeedHelper: handleNeedHelper,
          onSkip: handleSkipVideoSteps,
        });
      case "videoHelperTest":
        return react.createElement(VideoHelperTestStep, {
          onNext: goNext,
          onBack: goBack,
          onSkip: handleSkipVideoSteps,
          helperEnabled: videoHelperEnabled,
          onHelperChange: setVideoHelperEnabled,
        });
      case "overlay":
        return react.createElement(OverlayTipStep, {
          overlayEnabled,
          onOverlayChange: setOverlayEnabled,
          onNext: goNext,
          onBack: goBack,
        });
      case "nowPlaying":
        return react.createElement(NowPlayingTipStep, {
          nowPlayingEnabled,
          onNowPlayingChange: setNowPlayingEnabled,
          onNext: goNext,
          onBack: goBack,
        });
      case "pseudoKaraoke":
        return react.createElement(PseudoKaraokeTipStep, {
          pseudoKaraokeEnabled,
          onPseudoKaraokeChange: setPseudoKaraokeEnabled,
          onNext: goNext,
          onBack: goBack,
        });

      case "translationTip":
        return react.createElement(TranslationTipStep, {
          onNext: goNext,
          onBack: goBack,
        });
      case "complete":
        return react.createElement(CompleteStep, {
          onStart: () => handleComplete(false),
          onOpenSettings: () => handleComplete(true),
        });
      default:
        return null;
    }
  };

  return react.createElement(
    "div",
    {
      className: "setup-wizard-container",
      style: {
        width: "100%",
        maxWidth: "600px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      },
    },
    currentStep > 0 &&
    currentStep < totalSteps - 1 &&
    react.createElement(WizardProgress, { currentStep, totalSteps }),
    react.createElement(
      "div",
      {
        className: "wizard-content",
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
        },
      },
      renderStep()
    )
  );
};

// Function to open the setup wizard
function openSetupWizard() {
  const overlay = document.createElement("div");
  overlay.id = "ivLyrics-setup-wizard-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  `;

  const modalContainer = document.createElement("div");
  modalContainer.style.cssText = `
    background: rgba(14, 16, 20, 0.98);
    border-radius: 0;
    max-width: 90vw;
    max-height: 90vh;
    width: 600px;
    overflow-y: auto;
    overflow-x: hidden;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    position: relative;
  `;

  const closeWizard = (openSettings = false) => {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
    // Note: Settings will be opened after reload if needed
    if (openSettings) {
      localStorage.setItem("ivLyrics:return-to-settings", "true");
    }
  };

  overlay.appendChild(modalContainer);
  document.body.appendChild(overlay);

  // Render React component
  const dom =
    window.ivLyricsEnsureReactDOM?.() ||
    (typeof reactDOM !== "undefined"
      ? reactDOM
      : window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null);

  if (!dom?.render) {
    console.error("[ivLyrics] ReactDOM not available for SetupWizard");
    return;
  }

  const wizardComponent = react.createElement(SetupWizard, {
    onComplete: closeWizard,
  });

  dom.render(wizardComponent, modalContainer);
}

// Check if setup is needed
function isSetupNeeded() {
  return !StorageManager.getItem(SETUP_STORAGE_KEY);
}
