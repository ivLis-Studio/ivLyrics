import { createSongResearchClient } from "./songResearchClient.mjs";
import { createSongResearchDocument } from "./songResearchDocument.mjs";

/**
 * Full-screen music Research reader.
 *
 * SongInfoTMI remains as a compatibility alias for third-party integrations.
 */
export function createSongResearch({
    react, host: window, spicetify: Spicetify, config: CONFIG, i18n: I18n, storage: StorageManager, utils: Utils,
    getLyricsService, getAiManager,
}) {
    const { useEffect, useMemo, useRef, useState, useCallback } = react;
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
        const initialResearchScale = propScale ?? legacyScale ?? (CONFIG?.visual?.["fullscreen-tmi-font-size"] || 100) / 100;
        const [researchScale, setResearchScale] = useState(() => Math.min(1.5, Math.max(0.8, Number(initialResearchScale) || 1)));
        const contentRef = useRef(null);
        const navRef = useRef(null);
        const navDragRef = useRef(null);
        const suppressNavClickRef = useRef(false);
        const programmaticScrollRef = useRef(null);
        const sectionRefs = useRef(new Map());
        const uiLanguage = I18n?.getCurrentLanguage?.() || CONFIG?.visual?.language || "en";
        const normalized = useMemo(() => getAiManager()?.normalizeResearchResult
            ? getAiManager().normalizeResearchResult(info || {}, { title: trackName, artist: artistName })
            : (info || {}), [info, trackName, artistName]);
        const sectionDefinitions = useMemo(() => getSectionDefinitions(normalized), [normalized, uiLanguage]);
        const [activeSection, setActiveSection] = useState(sectionDefinitions[0]?.[0] || "overview");
        const metadata = normalized.metadata || {};
        const quality = normalized.research_quality || {};
        const provider = normalized._research?.provider;

        const changeResearchScale = (delta) => {
            setResearchScale((current) => {
                const next = Math.round(Math.min(1.5, Math.max(0.8, current + delta)) * 20) / 20;
                if (next === current) return current;
                const percent = Math.round(next * 100);
                if (CONFIG?.visual) CONFIG.visual["fullscreen-tmi-font-size"] = percent;
                StorageManager?.saveConfig?.("fullscreen-tmi-font-size", percent);
                window.dispatchEvent(new CustomEvent("ivLyrics", {
                    detail: { type: "config", name: "fullscreen-tmi-font-size", value: percent }
                }));
                return next;
            });
        };

        const register = useCallback((id, node) => {
            if (node) sectionRefs.current.set(id, node);
            else sectionRefs.current.delete(id);
        }, []);

        useEffect(() => {
            const root = contentRef.current;
            if (!root) return undefined;
            let frame = null;
            const update = () => {
                frame = null;
                if (programmaticScrollRef.current) {
                    setActiveSection(programmaticScrollRef.current.id);
                    return;
                }
                const rootTop = root.getBoundingClientRect().top;
                let closest = sectionDefinitions[0]?.[0];
                let distance = Infinity;
                for (const [id] of sectionDefinitions) {
                    const node = sectionRefs.current.get(id);
                    if (!node) continue;
                    const current = Math.abs(node.getBoundingClientRect().top - rootTop - 24);
                    if (current < distance) {
                        closest = id;
                        distance = current;
                    }
                }
                if (closest) setActiveSection(closest);
            };
            const handleScroll = () => {
                if (frame === null) frame = requestAnimationFrame(update);
            };
            root.addEventListener("scroll", handleScroll, { passive: true });
            update();
            return () => {
                root.removeEventListener("scroll", handleScroll);
                if (frame !== null) cancelAnimationFrame(frame);
            };
        }, [sectionDefinitions]);

        useEffect(() => {
            if (sectionDefinitions.some(([id]) => id === activeSection)) return;
            if (sectionDefinitions[0]?.[0]) setActiveSection(sectionDefinitions[0][0]);
        }, [activeSection, sectionDefinitions]);

        const scrollTo = (id) => {
            const node = sectionRefs.current.get(id);
            const root = contentRef.current;
            if (!node || !root) return;
            if (programmaticScrollRef.current?.timeoutId) {
                window.clearTimeout(programmaticScrollRef.current.timeoutId);
            }
            const programmaticScroll = { id, timeoutId: null };
            programmaticScrollRef.current = programmaticScroll;
            setActiveSection(id);
            const rootRect = root.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const targetTop = Math.max(0, root.scrollTop + nodeRect.top - rootRect.top - 18);
            const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
            if (typeof root.scrollTo === "function") {
                root.scrollTo({ top: targetTop, behavior });
            } else {
                root.scrollTop = targetTop;
            }
            programmaticScroll.timeoutId = window.setTimeout(() => {
                if (programmaticScrollRef.current === programmaticScroll) {
                    programmaticScrollRef.current = null;
                }
            }, behavior === "smooth" ? 700 : 0);
            window.setTimeout(() => node.focus({ preventScroll: true }), 350);
        };

        useEffect(() => () => {
            if (programmaticScrollRef.current?.timeoutId) {
                window.clearTimeout(programmaticScrollRef.current.timeoutId);
            }
            programmaticScrollRef.current = null;
        }, []);

        useEffect(() => {
            const nav = navRef.current;
            if (!nav || !activeSection) return undefined;
            const frame = requestAnimationFrame(() => {
                const activeButton = Array.from(nav.querySelectorAll("button"))
                    .find((button) => button.dataset.researchNavId === activeSection);
                if (!activeButton) return;
                const navRect = nav.getBoundingClientRect();
                const buttonRect = activeButton.getBoundingClientRect();
                const edgePadding = 12;
                let delta = 0;
                if (buttonRect.left < navRect.left + edgePadding) {
                    delta = buttonRect.left - navRect.left - edgePadding;
                } else if (buttonRect.right > navRect.right - edgePadding) {
                    delta = buttonRect.right - navRect.right + edgePadding;
                }
                if (!delta) return;
                nav.scrollBy({
                    left: delta,
                    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth"
                });
            });
            return () => cancelAnimationFrame(frame);
        }, [activeSection, sectionDefinitions.length]);

        const handleNavWheel = (event) => {
            const nav = event.currentTarget;
            if (nav.scrollWidth <= nav.clientWidth) return;
            const rawDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
            if (!rawDelta) return;
            const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? nav.clientWidth : 1;
            event.preventDefault();
            nav.scrollLeft += rawDelta * deltaScale;
        };

        const handleNavPointerDown = (event) => {
            if (event.pointerType !== "mouse" || event.button !== 0) return;
            navDragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                scrollLeft: event.currentTarget.scrollLeft,
                moved: false
            };
        };

        const handleNavPointerMove = (event) => {
            const drag = navDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const distance = event.clientX - drag.startX;
            if (!drag.moved && Math.abs(distance) < 4) return;
            if (!drag.moved) event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.moved = true;
            event.preventDefault();
            event.currentTarget.classList.add("dragging");
            event.currentTarget.scrollLeft = drag.scrollLeft - distance;
        };

        const finishNavPointerDrag = (event) => {
            const drag = navDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (drag.moved) {
                suppressNavClickRef.current = true;
                window.setTimeout(() => { suppressNavClickRef.current = false; }, 0);
            }
            navDragRef.current = null;
            event.currentTarget.classList.remove("dragging");
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
        };

        useEffect(() => {
            const nav = navRef.current;
            if (!nav) return undefined;
            const handleWheel = (event) => handleNavWheel(event);
            nav.addEventListener("wheel", handleWheel, { passive: false });
            return () => nav.removeEventListener("wheel", handleWheel);
        }, [sectionDefinitions.length]);

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
                                onClick: () => changeResearchScale(-0.05),
                                disabled: researchScale <= 0.8,
                                title: t("research.fontDecrease", "Decrease text size"),
                                "aria-label": t("research.fontDecrease", "Decrease text size")
                            }, "A−"),
                            react.createElement("button", {
                                type: "button",
                                className: "research-icon-button research-font-button",
                                onClick: () => changeResearchScale(0.05),
                                disabled: researchScale >= 1.5,
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
                onPointerDown: handleNavPointerDown,
                onPointerMove: handleNavPointerMove,
                onPointerUp: finishNavPointerDrag,
                onPointerCancel: finishNavPointerDrag
            },
                sectionDefinitions.map(([id, icon, label]) => react.createElement("button", {
                    key: id,
                    type: "button",
                    "data-research-nav-id": id,
                    className: activeSection === id ? "active" : "",
                    "aria-current": activeSection === id ? "location" : undefined,
                    onClick: (event) => {
                        if (suppressNavClickRef.current) {
                            event.preventDefault();
                            return;
                        }
                        scrollTo(id);
                    }
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
        const researchScale = propScale ?? legacyScale ?? (CONFIG?.visual?.["fullscreen-tmi-font-size"] || 100) / 100;
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
