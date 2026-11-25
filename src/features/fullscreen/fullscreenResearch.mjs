import { createFullscreenResearchSessionHook } from "./fullscreenResearchSession.mjs";

export function createFullscreenResearch({
    react, host: window, document, spicetify: Spicetify, i18n: I18n, toast: Toast,
    getPersistence, getSongResearch, getAiManager, isPlaybackCurrent,
}) {
    const { useEffect, useRef } = react;
    const RESEARCH_TOKEN_CONSENT_STORAGE_KEY = "ivLyrics:research-token-consent:v1";
    const hasResearchTokenConsent = () => {
        try {
            const value = getPersistence()?.getItem?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY)
                ?? Spicetify.LocalStorage?.get?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY)
                ?? window.localStorage?.getItem?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY);
            return value === "true" || value === "1";
        } catch (_) {
            return false;
        }
    };
    const saveResearchTokenConsent = () => {
        try {
            const persistence = getPersistence();
            if (persistence?.setItem) {
                persistence.setItem(RESEARCH_TOKEN_CONSENT_STORAGE_KEY, "true");
            } else if (Spicetify.LocalStorage?.set) {
                Spicetify.LocalStorage.set(RESEARCH_TOKEN_CONSENT_STORAGE_KEY, "true");
            } else {
                window.localStorage?.setItem?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY, "true");
            }
        } catch (error) {
            console.warn("[Research] Failed to remember token consent:", error);
        }
    };

    const ResearchTokenConsentDialog = react.memo(({ onAgree, onCancel }) => {
        const dialogRef = useRef(null);
        const agreeButtonRef = useRef(null);

        useEffect(() => {
            const previouslyFocused = document.activeElement;
            const focusFrame = window.requestAnimationFrame(() => agreeButtonRef.current?.focus?.());
            const handleKeyDown = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    onCancel();
                    return;
                }

                if (event.key !== "Tab") return;
                const focusable = Array.from(dialogRef.current?.querySelectorAll?.("button:not(:disabled)") || []);
                if (focusable.length === 0) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            };

            window.addEventListener("keydown", handleKeyDown, true);
            return () => {
                window.cancelAnimationFrame(focusFrame);
                window.removeEventListener("keydown", handleKeyDown, true);
                previouslyFocused?.focus?.();
            };
        }, [onCancel]);

        return react.createElement("div", {
            className: "research-consent-overlay",
            onMouseDown: (event) => {
                if (event.target === event.currentTarget) onCancel();
            }
        },
            react.createElement("section", {
                ref: dialogRef,
                className: "research-consent-dialog",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "research-consent-title",
                "aria-describedby": "research-consent-description research-consent-note"
            },
                react.createElement("div", {
                    className: "research-consent-icon",
                    "aria-hidden": "true"
                },
                    react.createElement("svg", {
                        viewBox: "0 0 24 24",
                        width: 24,
                        height: 24,
                        fill: "none",
                        stroke: "currentColor",
                        strokeWidth: 1.8,
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    },
                        react.createElement("path", { d: "M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z" }),
                        react.createElement("path", { d: "M12 9v4" }),
                        react.createElement("path", { d: "M12 17h.01" })
                    )
                ),
                react.createElement("span", { className: "research-consent-eyebrow" }, I18n.t("research.title")),
                react.createElement("h2", { id: "research-consent-title" }, I18n.t("research.tokenConsentTitle")),
                react.createElement("p", {
                    id: "research-consent-description",
                    className: "research-consent-description"
                }, I18n.t("research.tokenConsentBody")),
                react.createElement("div", { className: "research-consent-note" },
                    react.createElement("span", { className: "research-consent-note-dot", "aria-hidden": "true" }),
                    react.createElement("p", { id: "research-consent-note" }, I18n.t("research.tokenConsentNote"))
                ),
                react.createElement("div", { className: "research-consent-actions" },
                    react.createElement("button", {
                        type: "button",
                        className: "research-consent-button research-consent-button-secondary",
                        onClick: onCancel
                    }, I18n.t("research.cancel")),
                    react.createElement("button", {
                        ref: agreeButtonRef,
                        type: "button",
                        className: "research-consent-button research-consent-button-primary",
                        onClick: onAgree
                    }, I18n.t("research.tokenConsentAgree"))
                )
            )
        );
    });

    const useFullscreenResearch = createFullscreenResearchSessionHook({
        react, readPlayer: () => Spicetify.Player, isPlaybackCurrent, getSongResearch, hasResearchTokenConsent,
        saveResearchTokenConsent,
        hasResearchProvider: () => getAiManager()?.getEnabledProvidersFor('research')?.length > 0,
        notifyMissingProvider: () => Toast.error(I18n.t("tmi.requireKey")),
    });

    return { ResearchTokenConsentDialog, useFullscreenResearch };
}
