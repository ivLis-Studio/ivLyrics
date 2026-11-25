export function createSetupWizardWelcome({
  react, host: window, document, schedule: setInterval, cancel: clearInterval,
}) {
  const { useState } = react;

  // These two greetings are intentionally bilingual. Form labels and the saved
  // language never rotate; screen readers keep one stable, localized heading.
  const WIZARD_WELCOME_COPY = {
    en: { greeting: "Hello", instruction: "Choose your language to get started." },
    ko: { greeting: "안녕하세요", instruction: "사용할 언어를 선택해주세요." },
  };
  const getWizardWelcomeLanguage = (language) => /^ko(?:[-_]|$)/i.test(language || "") ? "ko" : "en";
  const useWizardWelcomeLanguage = (active, language, settled) => {
    const initialLanguage = getWizardWelcomeLanguage(language);
    const [welcomeLanguage, setWelcomeLanguage] = useState(initialLanguage);
    react.useEffect(() => {
      if (!active || settled) return;
      const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      let timer = null;
      const refresh = () => {
        if (timer !== null) clearInterval(timer);
        timer = null;
        if (document.hidden || motion?.matches) {
          setWelcomeLanguage(initialLanguage);
          return;
        }
        timer = setInterval(() => setWelcomeLanguage((value) => value === "ko" ? "en" : "ko"), 3500);
      };
      refresh();
      document.addEventListener("visibilitychange", refresh);
      motion?.addEventListener?.("change", refresh);
      return () => {
        if (timer !== null) clearInterval(timer);
        document.removeEventListener("visibilitychange", refresh);
        motion?.removeEventListener?.("change", refresh);
      };
    }, [active, initialLanguage, settled]);
    return settled ? initialLanguage : welcomeLanguage;
  };
  const WizardWelcomeText = ({ tag, field, language, ...props }) =>
    react.createElement(tag, { ...props, className: "wizard-welcome-copy" },
      ["en", "ko"].map((code) => react.createElement("span", {
        key: code, lang: code, "aria-hidden": true,
        className: code === language ? "is-current" : "",
      }, WIZARD_WELCOME_COPY[code][field])));

  return { useWizardWelcomeLanguage, WizardWelcomeText };
}
