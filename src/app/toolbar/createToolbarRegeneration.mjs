import { joinToolbarClasses } from "./createToolbarControls.mjs";

const OPTION_LANGUAGE_ICON = `<path d="M8 1.25a6.75 6.75 0 1 1 0 13.5 6.75 6.75 0 0 1 0-13.5Zm0 1a5.75 5.75 0 0 0-4.61 9.18h1.44c-.2-.6-.33-1.27-.38-1.97H2.83v-1h1.6c.06-.98.29-1.9.65-2.7H3.86v-1h1.8A5.73 5.73 0 0 1 8 2.25Zm1.34 2.5H6.66c-.42.8-.69 1.72-.76 2.7h4.2c-.07-.98-.34-1.9-.76-2.7Zm.99 3.7H5.67c.06.7.2 1.37.42 1.97h3.82c.22-.6.36-1.27.42-1.97Zm-.58 2.97H6.25c.49.88 1.12 1.33 1.75 1.33s1.26-.45 1.75-1.33Zm2.86-1.97h-1.62c-.05.7-.18 1.37-.38 1.97h1.44a5.72 5.72 0 0 0 .56-1.97Zm-.02-1c-.07-.98-.3-1.9-.66-2.7h1.22a5.72 5.72 0 0 1 .68 2.7H12.6Zm-1.66-3.7c-.5-.98-1.16-1.5-1.93-1.5s-1.43.52-1.93 1.5h3.86Z"/>`;

export const getRegenerateTranslationChoiceItems = (translate, {
  targets = {},
  includeCulturalAnnotations = false,
  includeWordSupplements = false,
}) => {
  const items = [];
  if (targets.needPhonetic) {
    items.push({ key: "regenerate-phonetic-only", target: "phonetic", label: translate("menu.regeneratePronunciationOnly") });
  }
  if (targets.needTranslation) {
    items.push({ key: "regenerate-translation-only", target: "translation", label: translate("menu.regenerateTranslationOnly") });
  }
  if (includeCulturalAnnotations) {
    items.push({ key: "regenerate-cultural-annotations", target: "cultural-annotations", label: translate("settings.culturalAnnotations.label") });
  }
  if (includeWordSupplements) {
    items.push({ key: "regenerate-word-supplements", target: "word-supplements", label: translate("menu.regenerateWordDetails") || "Word details" });
  }
  return items;
};

export function createToolbarRegeneration({
  react, translate, ConfigButton, SettingRowDescription, openOptionsModal, ToolbarButton, ToolbarGlyph, ToolbarPanelRow,
}) {
  const { useState, useRef, useEffect } = react;

  const getChoiceItems = (options) => getRegenerateTranslationChoiceItems(translate, options);

  function openRegenerateTranslationChoiceModal({
    onSelect,
    targets = {},
    includeCulturalAnnotations = false,
    includeWordSupplements = false,
  }) {
    let closeModal = null;
    const targetItems = getChoiceItems({
      targets,
      includeCulturalAnnotations,
      includeWordSupplements,
    }).map(({ key, label, target }) => ({
      desc: react.createElement(SettingRowDescription, {
        icon: OPTION_LANGUAGE_ICON,
        text: label,
      }),
      key,
      type: ConfigButton,
      text: translate("menu.regenerateAction"),
      onChange: () => {
        closeModal?.();
        onSelect?.(target);
      },
    }));

    const items = [
      {
        section: translate("menu.regenerateTranslationOptions"),
        subtitle: translate("menu.regenerateTranslationOptionsSubtitle"),
        items: targetItems,
      },
    ];

    closeModal = openOptionsModal(
      translate("menu.regenerateTranslationOptions"),
      items,
      () => {}
    );
  }

  // 번역 재생성 in the conversion panel: one button per target. The panel stays
  // open, and the button that started a regeneration spins until it finishes.
  const getToolbarRegenerationKinds = (target) => target === "all"
    ? ["phonetic", "translation"]
    : [target];

  const RegenerateTranslationButton = react.memo(
    ({ choices = [], onRegenerate, isEnabled, busyTargets = [] }) => {
      const [pendingTargets, setPendingTargets] = useState([]);
      const pendingRef = useRef(new Set());
      const mountedRef = useRef(true);
      useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
      }, []);
      const isBusy = target => getToolbarRegenerationKinds(target)
        .some(kind => busyTargets.includes(kind) || pendingTargets.includes(kind));

      return react.createElement(ToolbarPanelRow, {
        stack: true,
        className: "ivl-tb-regen",
        desc: translate("menu.regenerateTranslationOptionsSubtitle"),
        control: react.createElement(
          "div",
          { className: "ivl-tb-chips" },
          choices.map((choice) => react.createElement(
            ToolbarButton,
            {
              key: choice.key,
              className: joinToolbarClasses("ivl-tb-chip", isBusy(choice.target) && "is-busy"),
              disabled: !isEnabled || isBusy(choice.target),
              "aria-busy": isBusy(choice.target),
              onClick: async () => {
                const kinds = getToolbarRegenerationKinds(choice.target);
                if (kinds.some(kind => pendingRef.current.has(kind) || busyTargets.includes(kind))) return;
                kinds.forEach(kind => pendingRef.current.add(kind));
                setPendingTargets([...pendingRef.current]);
                try {
                  await onRegenerate?.(choice.target);
                } catch (error) {
                  console.warn("[ivLyrics] Regeneration action failed:", error);
                } finally {
                  kinds.forEach(kind => pendingRef.current.delete(kind));
                  if (mountedRef.current) setPendingTargets([...pendingRef.current]);
                }
              },
            },
            react.createElement(ToolbarGlyph, { name: "refresh", size: 14 }),
            react.createElement("span", null, choice.label)
          ))
        ),
      });
    }
  );

  return { openRegenerateTranslationChoiceModal, getRegenerateTranslationChoiceItems: getChoiceItems, RegenerateTranslationButton };
}
