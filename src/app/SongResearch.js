import { createSongResearchClient } from "./songResearchClient.mjs";
import { createSongResearchDocument } from "./songResearchDocument.mjs";
import { createSettingsEventChannel, createVisualSettingsActions } from "../core/visualSettingsActions.mjs";
import {
    getResearchFontSize, RESEARCH_FONT_SIZE_KEY, RESEARCH_FONT_SIZE_MAX, RESEARCH_FONT_SIZE_MIN, useResearchFontSize,
} from "./researchReaderSettings.mjs";
import { useResearchNavigation } from "./useResearchNavigation.mjs";

/**
 * Full-screen music Research reader.
 *
 * SongInfoTMI remains as a compatibility alias for third-party integrations.
 */
export function createSongResearch({
    react, host: window, spicetify: Spicetify, config: CONFIG, i18n: I18n, storage: StorageManager, utils: Utils,
    getLyricsService, getAiManager,
}) {
    const { useMemo } = react;
    const t = (key, fallback) => {
        const value = I18n?.t?.(key);
        return value && value !== key ? value : fallback;
    };

    const { fetchResearch, researchCache } = createSongResearchClient({
        spicetify: Spicetify, config: CONFIG, i18n: I18n, getLyricsService, getAiManager,
    });
    const { Icon, StatusBadge, getSectionDefinitions, ResearchDocument } = createSongResearchDocument({
        react, host: window, spicetify: Spicetify, utils: Utils, t, getAiManager,
    });
    const { publishSettingsConfigChange, subscribeSettingsConfig } = createSettingsEventChannel(
        window, (type, detail) => new CustomEvent(type, { detail }),
    );
    const { saveVisualSetting } = createVisualSettingsActions({
        getVisualSettings: () => CONFIG.visual,
        persistConfig: (name, value) => StorageManager?.saveConfig?.(name, value),
    });
    const fontSettings = {
        save: value => saveVisualSetting(RESEARCH_FONT_SIZE_KEY, value),
        publish: value => publishSettingsConfigChange(RESEARCH_FONT_SIZE_KEY, value),
        subscribe: subscribeSettingsConfig,
    };

    const ResearchWebSearchFallbackNotice = () => react.createElement("aside", {
        className: "research-loading-notice research-loading-notice-warning research-web-search-fallback",
        role: "status"
    },
        react.createElement("span", { className: "research-loading-notice-icon", "aria-hidden": "true" }, react.createElement(Icon, { name: "info", size: 14 })),
        react.createElement("div", null,
            react.createElement("strong", null, t("research.webSearchFallbackTitle", "Web search unavailable")),
            react.createElement("p", null, t("research.webSearchFallbackWarning", "Web search failed, so Research is continuing without it. The result may contain more inaccuracies"))
        )
    );

    const ResearchFullView = react.memo(({ info, isGenerating = false, webSearchFallback = false, onClose, trackName, artistName, coverUrl, onRegenerate, tmiScale: legacyScale, researchScale: propScale }) => {
        const { fontSize, changeFontSize } = useResearchFontSize(
            react, getResearchFontSize(CONFIG?.visual, propScale ?? legacyScale), fontSettings,
        );
        const researchScale = fontSize / 100;
        const uiLanguage = I18n?.getCurrentLanguage?.() || CONFIG?.visual?.language || "en";
        const normalized = useMemo(() => getAiManager()?.normalizeResearchResult
            ? getAiManager().normalizeResearchResult(info || {}, { title: trackName, artist: artistName })
            : (info || {}), [info, trackName, artistName]);
        const sectionDefinitions = useMemo(() => getSectionDefinitions(normalized), [normalized, uiLanguage]);
        const { activeSection, register, contentRef, navRef, selectSection, navPointerHandlers } =
            useResearchNavigation(react, window, sectionDefinitions, !info?.error);
        const metadata = normalized.metadata || {};
        const quality = normalized.research_quality || {};
        const provider = normalized._research?.provider;

        const renderResearchErrorState = (isQuotaError) =>
            react.createElement("div", {
                className: "research-view research-state-view",
                style: { "--research-scale": researchScale },
                role: "alert"
            },
                react.createElement("div", { className: "research-state-icon" }, react.createElement(Icon, { name: "research", size: 28 })),
                react.createElement("span", { className: "research-eyebrow" }, t("research.title", "Research")),
                react.createElement("h2", null, t("research.errorTitle", "Research could not be completed")),
                react.createElement("p", null, isQuotaError ? t("research.errorQuota", "API quota exceeded") : t("research.errorFetch", "An error occurred while creating the research document")),
                info.message && react.createElement("small", { className: "research-error-detail" }, info.message),
                isQuotaError && react.createElement("small", null, t("research.errorQuotaHint", "Try again later or choose another AI provider in settings")),
                react.createElement("div", { className: "research-state-actions" },
                    onRegenerate && react.createElement("button", { type: "button", className: "research-action research-action-primary", onClick: onRegenerate }, react.createElement(Icon, { name: "refresh" }), t("research.regenerate", "Research again")),
                    react.createElement("button", { type: "button", className: "research-action", onClick: onClose }, t("research.close", "Close"))
                )
            )
        ;

        if (info?.error) {
            const isQuotaError = /429|quota|RESOURCE_EXHAUSTED/i.test(info.message || "");
            return renderResearchErrorState(isQuotaError);
        }

        const renderResearchHero = () =>
            react.createElement("header", { className: "research-hero" },
                coverUrl && react.createElement("img", { src: coverUrl, className: "research-hero-cover", alt: "" }),
                react.createElement("div", { className: "research-hero-scrim", "aria-hidden": "true" }),
                react.createElement("div", { className: "research-toolbar" },
                    react.createElement("div", { className: "research-toolbar-actions" },
                        react.createElement("span", { className: "research-eyebrow" }, react.createElement(Icon, { name: "research", size: 14 }), t("research.eyebrow", "Editorial Research")),
                        react.createElement("div", { className: "research-font-controls", role: "group", "aria-label": t("research.fontControls", "Text size") },
                            react.createElement("button", {
                                type: "button",
                                className: "research-icon-button research-font-button",
                                onClick: () => changeFontSize(-1),
                                disabled: fontSize <= RESEARCH_FONT_SIZE_MIN,
                                title: t("research.fontDecrease", "Decrease text size"),
                                "aria-label": t("research.fontDecrease", "Decrease text size")
                            }, "A−"),
                            react.createElement("button", {
                                type: "button",
                                className: "research-icon-button research-font-button",
                                onClick: () => changeFontSize(1),
                                disabled: fontSize >= RESEARCH_FONT_SIZE_MAX,
                                title: t("research.fontIncrease", "Increase text size"),
                                "aria-label": t("research.fontIncrease", "Increase text size")
                            }, "A+")
                        ),
                        onRegenerate && react.createElement("button", { type: "button", className: "research-icon-button", onClick: onRegenerate, title: t("research.regenerate", "Research again"), "aria-label": t("research.regenerate", "Research again") }, react.createElement(Icon, { name: "refresh" })),
                        react.createElement("button", { type: "button", className: "research-icon-button", onClick: onClose, title: t("research.close", "Close"), "aria-label": t("research.close", "Close") }, react.createElement(Icon, { name: "close" }))
                    )
                ),
                react.createElement("div", { className: "research-hero-copy" },
                    coverUrl && react.createElement("img", { src: coverUrl, className: "research-hero-artwork", alt: "" }),
                    react.createElement("div", { className: "research-hero-details" },
                        react.createElement("h1", { id: "research-document-title" }, metadata.title || trackName),
                        react.createElement("p", { className: "research-hero-artist" }, metadata.artist || artistName),
                        react.createElement("div", { className: "research-hero-meta" },
                            [metadata.album, metadata.release_date, ...(metadata.genre || []).slice(0, 2)].filter(Boolean).map((item, index) => react.createElement("span", { key: index }, item)),
                            provider && react.createElement("span", { className: "research-provider" }, provider),
                            quality.confidence && quality.confidence !== "none" && react.createElement(StatusBadge, { status: quality.confidence === "very_high" || quality.confidence === "high" ? "verified" : quality.confidence === "medium" ? "interpretation" : "uncertain" })
                        )
                    )
                )
            )
        ;

        const renderResearchNav = () =>
            react.createElement("nav", {
                className: "research-nav",
                ref: navRef,
                "aria-label": t("research.contents", "Contents"),
                ...navPointerHandlers
            },
                sectionDefinitions.map(([id, icon, label]) => react.createElement("button", {
                    key: id,
                    type: "button",
                    "data-research-nav-id": id,
                    className: activeSection === id ? "active" : "",
                    "aria-current": activeSection === id ? "location" : undefined,
                    onClick: (event) => selectSection(event, id)
                }, react.createElement(Icon, { name: icon, size: 14 }), react.createElement("span", null, label)))
            )
        ;

        const renderResearchContent = () =>
            react.createElement("main", { className: "research-content", ref: contentRef },
                isGenerating && webSearchFallback && react.createElement(ResearchWebSearchFallbackNotice),
                // Language changes must refresh labels even when article data is unchanged.
                react.createElement(ResearchDocument, { info: normalized, register, coverUrl, uiLanguage }),
                isGenerating && react.createElement("div", {
                    className: "research-generating-status",
                    role: "status",
                    "aria-live": "polite"
                },
                    react.createElement("span", { className: "research-generating-dots", "aria-hidden": "true" },
                        react.createElement("span"),
                        react.createElement("span"),
                        react.createElement("span")
                    ),
                    react.createElement("span", null, t("research.generating", "Generating…"))
                ),
                react.createElement("footer", { className: "research-document-footer" },
                    react.createElement(Icon, { name: "quality", size: 14 }),
                    react.createElement("span", null, t("research.disclaimer", "AI-generated research may contain inaccuracies. Check the linked sources before relying on factual claims"))
                )
            )
        ;

        return react.createElement("div", {
            className: "research-view",
            style: { "--research-scale": researchScale },
            lang: normalized.language || undefined,
            role: "document",
            "aria-labelledby": "research-document-title",
            "aria-busy": isGenerating
        },
            renderResearchHero(),
            sectionDefinitions.length > 0 && renderResearchNav(),
            renderResearchContent()
        );
    });

    const ResearchLoadingView = react.memo(({ onClose, webSearchFallback = false, tmiScale: legacyScale, researchScale: propScale }) => {
        const researchScale = getResearchFontSize(CONFIG?.visual, propScale ?? legacyScale) / 100;
        return react.createElement("div", {
            className: "research-view research-loading-view",
            style: { "--research-scale": researchScale },
            role: "status",
            "aria-live": "polite"
        },
            react.createElement("div", { className: "research-loading-toolbar" },
                react.createElement("div", { className: "research-toolbar-actions" },
                    react.createElement("span", { className: "research-eyebrow" }, react.createElement(Icon, { name: "research", size: 14 }), t("research.eyebrow", "Editorial Research")),
                    react.createElement("button", { type: "button", className: "research-icon-button", onClick: onClose, "aria-label": t("research.cancel", "Cancel") }, react.createElement(Icon, { name: "close" }))
                )
            ),
            react.createElement("div", { className: "research-loading-body" },
                react.createElement("div", { className: "research-loading-mark" },
                    react.createElement("span"), react.createElement("span"), react.createElement("span")
                ),
                react.createElement("h2", null, t("research.loadingTitle", "Reading between the lines")),
                react.createElement("p", null, t("research.loading", "Researching the lyrics, sound, artist, and cultural context")),
                react.createElement("div", { className: "research-loading-notices" },
                    react.createElement("aside", { className: "research-loading-notice", role: "note" },
                        react.createElement("span", { className: "research-loading-notice-icon", "aria-hidden": "true" }, react.createElement(Icon, { name: "quality", size: 14 })),
                        react.createElement("p", null, t("research.aiGeneratedNotice", "This information is generated by AI and may contain inaccuracies"))
                    ),
                    webSearchFallback && react.createElement(ResearchWebSearchFallbackNotice)
                ),
                react.createElement("div", { className: "research-loading-skeleton", "aria-hidden": "true" },
                    react.createElement("span"), react.createElement("span"), react.createElement("span"), react.createElement("span")
                )
            )
        );
    });

    return {
        ResearchFullView,
        ResearchLoadingView,
        fetchResearch,
        researchCache,
        // Compatibility aliases
        TMIFullView: ResearchFullView,
        TMILoadingView: ResearchLoadingView,
        fetchSongInfo: fetchResearch,
        tmiCache: researchCache
    };
}
