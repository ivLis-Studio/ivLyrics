/**
 * Full-screen music Research reader.
 *
 * SongInfoTMI remains as a compatibility alias for third-party integrations.
 */
const SongResearch = (() => {
    "use strict";

    const react = Spicetify.React;
    const { useEffect, useMemo, useRef, useState, useCallback } = react;
    const researchCache = new Map();
    const researchInFlight = new Map();
    const MAX_RESEARCH_CACHE_ENTRIES = 100;

    const t = (key, fallback) => {
        const value = window.I18n?.t?.(key);
        return value && value !== key ? value : fallback;
    };

    const asText = (value) => {
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return value.trim();
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        return "";
    };

    const asTextArray = (value) => Array.isArray(value)
        ? value.map(asText).filter(Boolean)
        : [];

    const hasValue = (value) => {
        if (Array.isArray(value)) return value.some(hasValue);
        if (value && typeof value === "object") return Object.values(value).some(hasValue);
        return Boolean(asText(value));
    };

    const getCachedResearch = (key) => {
        if (!researchCache.has(key)) return null;
        const value = researchCache.get(key);
        researchCache.delete(key);
        researchCache.set(key, value);
        return value;
    };

    const cacheResearch = (key, value) => {
        researchCache.delete(key);
        researchCache.set(key, value);
        while (researchCache.size > MAX_RESEARCH_CACHE_ENTRIES) {
            researchCache.delete(researchCache.keys().next().value);
        }
    };

    const subscribeToResearchRequest = (entry, listener) => {
        if (!entry || typeof listener !== "function") return () => {};
        entry.listeners.add(listener);
        if (entry.hasProgress) {
            try {
                listener(entry.latestProgress, entry.latestDetails);
            } catch (error) {
                console.warn("[SongResearch] Progress replay failed:", error);
            }
        }
        return () => entry.listeners.delete(listener);
    };

    const publishResearchProgress = (entry, partial, details = {}) => {
        entry.hasProgress = true;
        entry.latestProgress = partial;
        entry.latestDetails = details;
        for (const listener of Array.from(entry.listeners)) {
            try {
                listener(partial, details);
            } catch (error) {
                console.warn("[SongResearch] Progress listener failed:", error);
            }
        }
    };

    const getTrackContext = (trackId, context = {}) => {
        const item = Spicetify.Player.data?.item || {};
        const metadata = item.metadata || {};
        const trackUri = item.uri || (trackId ? `spotify:track:${trackId}` : "");
        const snapshot = trackUri ? window.LyricsService?.getLyricsSnapshot?.(trackUri) : null;
        const snapshotLyrics = snapshot?.currentLyrics
            || snapshot?.displayLyrics
            || snapshot?.synced
            || snapshot?.karaoke
            || snapshot?.rawResult?.synced
            || snapshot?.rawResult?.karaoke
            || snapshot?.rawResult?.unsynced
            || [];
        const artists = Array.isArray(item.artists)
            ? item.artists.map((artist) => artist?.name).filter(Boolean).join(", ")
            : "";
        return {
            trackId,
            title: asText(context.title || item.name || metadata.title),
            artist: asText(context.artist || artists || metadata.artist_name),
            album: asText(context.album || item.album?.name || metadata.album_title),
            releaseDate: asText(context.releaseDate || metadata.release_date || metadata.album_release_date),
            isrc: asText(context.isrc || metadata.isrc),
            spotifyUrl: asText(context.spotifyUrl || (trackId ? `https://open.spotify.com/track/${trackId}` : "")),
            lyrics: Array.isArray(context.lyrics) && context.lyrics.length > 0
                ? context.lyrics
                : (Array.isArray(snapshotLyrics) ? snapshotLyrics : [])
        };
    };

    async function fetchResearch(trackId, regenerate = false, context = {}) {
        const configuredTargetLang = CONFIG.visual["translate:target-language"];
        const lang = configuredTargetLang && configuredTargetLang !== "auto"
            ? configuredTargetLang
            : (window.I18n?.getCurrentLanguage?.() || CONFIG.visual["language"] || Spicetify.Locale?.getLocale()?.split("-")[0] || "en");
        const schema = window.AIAddonManager?.RESEARCH_CACHE_VERSION || "research-v7";
        const cacheKey = `${schema}:${trackId}:${lang || "auto"}`;

        const activeRequest = researchInFlight.get(cacheKey);
        if (activeRequest) {
            const unsubscribe = subscribeToResearchRequest(activeRequest, context.onProgress);
            try {
                return await activeRequest.promise;
            } finally {
                unsubscribe();
            }
        }

        if (!regenerate) {
            const cached = getCachedResearch(cacheKey);
            if (cached) return cached;
        }

        const request = {
            listeners: new Set(),
            latestProgress: null,
            latestDetails: {},
            hasProgress: false,
            promise: null
        };
        const unsubscribe = subscribeToResearchRequest(request, context.onProgress);
        request.promise = Promise.resolve().then(async () => {
            try {
                const lyricsService = window.LyricsService;
                if (!lyricsService?.getResearch && !lyricsService?.getTMI) {
                    return { error: true, message: "LyricsService.getResearch is not available." };
                }
                const input = {
                    ...getTrackContext(trackId, context),
                    lang,
                    ignoreCache: regenerate,
                    onProgress: (partial, details = {}) => publishResearchProgress(request, partial, details)
                };
                const result = lyricsService.getResearch
                    ? await lyricsService.getResearch(input)
                    : await lyricsService.getTMI(input);
                if (result) {
                    const normalized = window.AIAddonManager?.normalizeResearchResult
                        ? window.AIAddonManager.normalizeResearchResult(result, input)
                        : result;
                    cacheResearch(cacheKey, normalized);
                    return normalized;
                }
            } catch (error) {
                console.warn("[SongResearch] fetchResearch failed:", error);
                return { error: true, message: error.message || "Research generation failed" };
            }

            return { error: true, message: "Research data is unavailable." };
        });
        researchInFlight.set(cacheKey, request);

        try {
            return await request.promise;
        } finally {
            unsubscribe();
            if (researchInFlight.get(cacheKey) === request) {
                researchInFlight.delete(cacheKey);
            }
        }
    }

    const ICON_PATHS = {
        research: "M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z M8.5 11.5l1.7 1.7 3.8-4.2",
        thesis: "M8 3h8a2 2 0 0 1 2 2v14l-6-3-6 3V5a2 2 0 0 1 2-2Z",
        info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 10v6 M12 7h.01",
        listen: "M4 13v-2a8 8 0 0 1 16 0v2 M4 13h3v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 1-2Z M20 13h-3v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-1-2Z",
        title: "M4 7V4h16v3 M9 20h6 M12 4v16",
        lyrics: "M9 18V5l10-2v13 M9 9l10-2 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M16 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
        chorus: "M4 14a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4 M7 18h10 M9 22h6 M8 6l4-4 4 4",
        ending: "M5 5h14v14H5z M9 9l6 6 M15 9l-6 6",
        music: "M3 18v-6 M8 18V6 M13 18v-9 M18 18V3 M22 18H1",
        artist: "M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
        trivia: "M12 3l1.1 3.4L16.5 7.5l-3.4 1.1L12 12l-1.1-3.4L7.5 7.5l3.4-1.1L12 3Z M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z M18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9L18 13Z",
        compare: "M7 7h11l-3-3 M18 7l-3 3 M17 17H6l3 3 M6 17l3-3",
        culture: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20",
        visual: "M3 5h18v14H3z M7 15l3-3 3 3 2-2 4 4 M8 9h.01",
        critique: "M4 19.5V4a2 2 0 0 1 2-2h12v17.5l-7 3-7-3Z M8 7h8 M8 11h6",
        source: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
        quality: "M12 3l7 3v5c0 4.6-2.9 8.8-7 10-4.1-1.2-7-5.4-7-10V6l7-3Z M9 12l2 2 4-4",
        refresh: "M20 11a8 8 0 1 0-2.34 5.66 M20 4v7h-7",
        close: "M6 6l12 12 M18 6 6 18",
        external: "M14 3h7v7 M10 14 21 3 M21 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7"
    };

    const Icon = ({ name, size = 16 }) => react.createElement("svg", {
        className: "research-icon",
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true"
    }, react.createElement("path", { d: ICON_PATHS[name] || ICON_PATHS.info }));

    const getSafeHttpUrl = (value) => {
        const text = asText(value);
        if (!text) return "";
        try {
            const parsed = new URL(text);
            return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
        } catch {
            return "";
        }
    };

    const splitTrailingUrlPunctuation = (value) => {
        let url = value;
        let suffix = "";
        while (/[.,;:!?，。！？、\]\}]/u.test(url.slice(-1))) {
            suffix = url.slice(-1) + suffix;
            url = url.slice(0, -1);
        }
        while (url.endsWith(")")) {
            const openingCount = (url.match(/\(/g) || []).length;
            const closingCount = (url.match(/\)/g) || []).length;
            if (closingCount <= openingCount) break;
            suffix = ")" + suffix;
            url = url.slice(0, -1);
        }
        return { url, suffix };
    };

    const LinkifiedText = ({ value, keyPrefix }) => {
        const text = asText(value);
        if (!text) return null;
        const parts = [];
        const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"']+/gi;
        let cursor = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > cursor) parts.push(text.slice(cursor, match.index));
            const isMarkdownLink = Boolean(match[2]);
            const rawUrl = isMarkdownLink ? match[2] : match[0];
            const { url, suffix } = isMarkdownLink
                ? { url: rawUrl, suffix: "" }
                : splitTrailingUrlPunctuation(rawUrl);
            const safeUrl = getSafeHttpUrl(url);
            if (safeUrl) {
                parts.push(react.createElement("a", {
                    key: `${keyPrefix}-url-${match.index}`,
                    className: "research-inline-link",
                    href: safeUrl,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    onClick: (event) => {
                        event.preventDefault();
                        window.open(safeUrl, "_blank", "noopener,noreferrer");
                    }
                }, isMarkdownLink ? match[1] : url));
                if (suffix) parts.push(suffix);
            } else {
                parts.push(match[0]);
            }
            cursor = match.index + match[0].length;
        }
        if (cursor < text.length) parts.push(text.slice(cursor));
        return parts.length > 0 ? parts : text;
    };

    const InlineText = ({ children }) => {
        const text = asText(children);
        if (!text) return null;
        const tokens = text.split(/(~~[^~]+~~|\*\*[^*]+\*\*)/g).filter(Boolean);
        return tokens.map((token, index) => {
            if (token.startsWith("~~") && token.endsWith("~~")) {
                return react.createElement("del", { key: index },
                    react.createElement(LinkifiedText, { value: token.slice(2, -2), keyPrefix: `del-${index}` })
                );
            }
            if (token.startsWith("**") && token.endsWith("**")) {
                return react.createElement("strong", { key: index },
                    react.createElement(LinkifiedText, { value: token.slice(2, -2), keyPrefix: `strong-${index}` })
                );
            }
            return react.createElement(LinkifiedText, { key: index, value: token, keyPrefix: `text-${index}` });
        });
    };

    const getYouTubeVideoId = (value) => {
        const safeUrl = getSafeHttpUrl(value);
        if (!safeUrl) return "";
        try {
            const parsed = new URL(safeUrl);
            const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
            if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || "";
            if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return "";
            if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
            const segments = parsed.pathname.split("/").filter(Boolean);
            return ["embed", "shorts", "live"].includes(segments[0]) ? (segments[1] || "") : "";
        } catch {
            return "";
        }
    };

    const ResearchMedia = ({ coverUrl, metadata, sources, media }) => {
        const spotifyUrl = getSafeHttpUrl(metadata?.spotify_url);
        const mediaItems = [];
        const seen = new Set();
        const addMedia = (item) => {
            if (!item?.src || seen.has(item.src) || mediaItems.length >= 6) return;
            seen.add(item.src);
            mediaItems.push(item);
        };

        if (coverUrl) addMedia({
            key: "artwork",
            src: coverUrl,
            href: spotifyUrl,
            label: t("research.labels.artwork", "Artwork"),
            caption: metadata?.album || "",
            className: "research-media-artwork"
        });

        const candidates = [
            metadata?.youtube_url && {
                type: "youtube",
                title: t("research.labels.mv", "Music video"),
                url: metadata.youtube_url
            },
            ...(Array.isArray(media) ? media : []),
            ...(Array.isArray(sources) ? sources : [])
                .filter((source) => getYouTubeVideoId(source?.url))
                .map((source) => ({
                    type: "youtube",
                    title: source.title,
                    publisher: source.publisher,
                    caption: source.relevance,
                    url: source.url
                }))
        ].filter(Boolean);

        candidates.forEach((candidate, index) => {
            const href = getSafeHttpUrl(candidate.url || candidate.source_url);
            const youtubeVideoId = getYouTubeVideoId(href);
            const imageUrl = youtubeVideoId
                ? `https://i.ytimg.com/vi/${encodeURIComponent(youtubeVideoId)}/hqdefault.jpg`
                : getSafeHttpUrl(candidate.image_url || candidate.thumbnail_url);
            if (!imageUrl) return;
            addMedia({
                key: `media-${index}`,
                src: imageUrl,
                href,
                label: asText(candidate.title) || (youtubeVideoId ? t("research.labels.mv", "Music video") : t("research.labels.artwork", "Artwork")),
                caption: asText(candidate.caption || candidate.publisher || candidate.credit),
                className: youtubeVideoId ? "research-media-video" : "research-media-image"
            });
        });

        if (mediaItems.length === 0) return null;

        return react.createElement("div", { className: "research-media-grid" },
            mediaItems.map((item) => {
                const content = react.createElement(react.Fragment, null,
                    react.createElement("img", {
                        src: item.src,
                        alt: "",
                        loading: "lazy",
                        onError: (event) => event.currentTarget.closest(".research-media-item")?.classList.add("is-unavailable")
                    }),
                    react.createElement("span", null,
                        react.createElement("span", { className: "research-media-copy" },
                            react.createElement("strong", null, item.label),
                            item.caption && react.createElement("small", null, react.createElement(InlineText, null, item.caption))
                        ),
                        item.href && react.createElement(Icon, { name: "external", size: 13 })
                    )
                );
                if (!item.href) return react.createElement("div", {
                    key: item.key,
                    className: `research-media-item ${item.className}`
                }, content);
                return react.createElement("a", {
                    key: item.key,
                    className: `research-media-item ${item.className}`,
                    href: item.href,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    onClick: (event) => {
                        event.preventDefault();
                        window.open(item.href, "_blank", "noopener,noreferrer");
                    }
                }, content);
            })
        );
    };

    const Paragraphs = ({ items, className = "" }) => {
        const paragraphs = asTextArray(items);
        if (paragraphs.length === 0) return null;
        return react.createElement("div", { className: `research-paragraphs ${className}`.trim() },
            paragraphs.map((paragraph, index) => react.createElement("p", { key: index },
                react.createElement(InlineText, null, paragraph)
            ))
        );
    };

    const EditorialNote = ({ text }) => asText(text) && react.createElement("aside", {
        className: "research-editorial-note"
    },
        react.createElement("span", { className: "research-editorial-note-label" }, t("research.editorialNote", "Editor's note")),
        react.createElement("p", null, react.createElement(InlineText, null, text))
    );

    const StatusBadge = ({ status }) => {
        const normalized = ["verified", "interpretation", "uncertain", "disputed"].includes(status) ? status : "uncertain";
        return react.createElement("span", { className: `research-status research-status-${normalized}` },
            t(`research.status.${normalized}`, normalized)
        );
    };

    const SourceFootnote = ({ url, className = "" }) => {
        const safeUrl = getSafeHttpUrl(url);
        if (!safeUrl) return null;
        return react.createElement("sup", { className: `research-source-footnote ${className}`.trim() },
            react.createElement("a", {
                href: safeUrl,
                target: "_blank",
                rel: "noopener noreferrer",
                onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    window.open(safeUrl, "_blank", "noopener,noreferrer");
                }
            }, `[${t("research.labels.sourceFootnote", "source")}]`)
        );
    };

    const FactGrid = ({ entries }) => {
        const rows = (Array.isArray(entries) ? entries : []).filter((entry) => hasValue(entry));
        if (rows.length === 0) return null;
        return react.createElement("dl", { className: "research-fact-grid" },
            rows.map((entry, index) => react.createElement("div", { className: "research-fact-row", key: index },
                react.createElement("dt", null, asText(entry?.label)),
                react.createElement("dd", null,
                    react.createElement("span", null, react.createElement(InlineText, null, entry?.value)),
                    entry?.verification_status && react.createElement(StatusBadge, { status: entry.verification_status })
                )
            ))
        );
    };

    const DetailGrid = ({ entries }) => {
        const visible = (Array.isArray(entries) ? entries : []).filter((entry) => asText(entry?.value));
        if (visible.length === 0) return null;
        return react.createElement("dl", {
            className: "research-detail-grid",
            "data-count": Math.min(visible.length, 6)
        },
            visible.map((entry, index) => react.createElement("div", { key: index },
                react.createElement("dt", null, entry.label),
                react.createElement("dd", null, react.createElement(InlineText, null, entry.value))
            ))
        );
    };

    const EditorialCard = ({ title, subtitle, paragraphs, note, status, children, className = "" }) => react.createElement("article", {
        className: `research-card ${className}`.trim()
    },
        (title || subtitle || status) && react.createElement("header", { className: "research-card-header" },
            react.createElement("div", null,
                title && react.createElement("h4", null, react.createElement(InlineText, null, title)),
                subtitle && react.createElement("p", null, react.createElement(InlineText, null, subtitle))
            ),
            status && react.createElement(StatusBadge, { status })
        ),
        react.createElement(Paragraphs, { items: paragraphs }),
        children,
        react.createElement(EditorialNote, { text: note })
    );

    const TriviaStories = ({ trivia }) => {
        const items = (Array.isArray(trivia?.items) ? trivia.items : []).filter(hasValue);
        if (items.length === 0) return null;
        return react.createElement("div", { className: "research-trivia-stories" },
            items.map((item, index) => {
                const sourceUrl = getSafeHttpUrl(item?.source_url);
                return react.createElement("article", { className: "research-trivia-story", key: index },
                    react.createElement("header", null,
                        react.createElement("div", null,
                            react.createElement("span", { className: "research-trivia-index" }, String(index + 1).padStart(2, "0")),
                            react.createElement("h4", null,
                                react.createElement(InlineText, null, item?.title || t("research.fact", "Fact")),
                                react.createElement(SourceFootnote, { url: sourceUrl })
                            ),
                            item?.verification_status && react.createElement(StatusBadge, { status: item.verification_status })
                        ),
                    ),
                    item?.body && react.createElement("p", null, react.createElement(InlineText, null, item.body)),
                    item?.why_interesting && react.createElement("blockquote", { className: "research-trivia-significance" },
                        react.createElement(InlineText, null, item.why_interesting)
                    ),
                    react.createElement(EditorialNote, { text: item?.editorial_note })
                );
            })
        );
    };

    const ResearchTimeline = ({ items }) => {
        const entries = (Array.isArray(items) ? items : []).filter(hasValue);
        if (entries.length === 0) return null;
        return react.createElement("div", { className: "research-timeline-wrap" },
            react.createElement("h3", { className: "research-subsection-title" }, t("research.labels.timeline", "Timeline")),
            react.createElement("ol", { className: "research-timeline" },
                entries.map((item, index) => {
                    const sourceUrl = getSafeHttpUrl(item?.source_url);
                    return react.createElement("li", { key: index },
                        react.createElement("span", { className: "research-timeline-marker", "aria-hidden": "true" }),
                        react.createElement("time", null, item?.date),
                        react.createElement("span", { className: "research-timeline-event" },
                            react.createElement(InlineText, null, item?.event),
                            react.createElement(SourceFootnote, { url: sourceUrl })
                        )
                    );
                })
            )
        );
    };

    const formatResearchTime = (milliseconds) => {
        const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = String(totalSeconds % 60).padStart(2, "0");
        return `${minutes}:${seconds}`;
    };

    const seekToResearchMoment = (milliseconds) => {
        const requested = Number(milliseconds);
        if (!Number.isFinite(requested) || requested < 0) return;
        const duration = Number(Spicetify.Player?.getDuration?.());
        const target = Number.isFinite(duration) && duration > 0
            ? Math.min(requested, duration)
            : requested;
        window.Utils?.clearSafePlayerProgressCorrection?.();
        Spicetify.Player?.seek?.(target);
    };

    const ResearchHook = ({ hook }) => {
        const surprise = asText(hook?.surprise);
        const whyItMatters = asText(hook?.why_it_matters);
        if (!surprise && !whyItMatters) return null;
        return react.createElement("aside", { className: "research-hook-card" },
            react.createElement("span", { className: "research-subsection-kicker" }, t("research.labels.surprise", "The song's twist")),
            surprise && react.createElement("h4", null,
                react.createElement(InlineText, null, surprise),
                react.createElement(SourceFootnote, { url: hook?.source_url })
            ),
            whyItMatters && react.createElement("p", null, react.createElement(InlineText, null, whyItMatters)),
            hook?.verification_status && react.createElement(StatusBadge, { status: hook.verification_status })
        );
    };

    const ListeningGuide = ({ guide }) => {
        const moments = (Array.isArray(guide?.moments) ? guide.moments : []).filter((moment) =>
            Number.isFinite(Number(moment?.timestamp_ms)) && (asText(moment?.title) || asText(moment?.listen_for) || asText(moment?.why_it_matters))
        );
        if (moments.length === 0) return null;
        return react.createElement(react.Fragment, null,
            react.createElement(Paragraphs, { items: guide?.introduction ? [guide.introduction] : [] }),
            react.createElement("ol", { className: "research-listening-list" }, moments.map((moment, index) => {
                const timestamp = Number(moment.timestamp_ms);
                const buttonLabel = `${t("research.labels.listenHere", "Listen from here")} ${formatResearchTime(timestamp)}`;
                return react.createElement("li", { className: "research-listening-moment", key: `${timestamp}:${index}` },
                    react.createElement("button", {
                        type: "button",
                        className: "research-listen-button",
                        onClick: () => seekToResearchMoment(timestamp),
                        "aria-label": buttonLabel,
                        title: buttonLabel
                    },
                        react.createElement("span", { className: "research-listen-index" }, String(index + 1).padStart(2, "0")),
                        react.createElement("span", { className: "research-listen-time" }, formatResearchTime(timestamp)),
                        react.createElement("span", { className: "research-listen-copy" },
                            react.createElement("strong", null, react.createElement(InlineText, null, moment.title || moment.lyric)),
                            moment.lyric && react.createElement("q", null, react.createElement(InlineText, null, moment.lyric)),
                            moment.listen_for && react.createElement("span", null,
                                react.createElement("b", null, t("research.labels.listenFor", "Listen for")),
                                react.createElement(InlineText, null, moment.listen_for)
                            ),
                            moment.why_it_matters && react.createElement("small", null, react.createElement(InlineText, null, moment.why_it_matters))
                        )
                    )
                );
            })),
            react.createElement(EditorialNote, { text: guide?.editorial_note })
        );
    };

    const CreationStory = ({ story }) => {
        const stages = (Array.isArray(story?.stages) ? story.stages : []).filter((stage) => getSafeHttpUrl(stage?.source_url) && hasValue(stage));
        if (stages.length === 0) return null;
        return react.createElement("div", { className: "research-subsection research-creation-story" },
            react.createElement("h3", { className: "research-subsection-title" }, story?.headline || t("research.labels.creationStory", "How the song was made")),
            react.createElement(Paragraphs, { items: story?.paragraphs }),
            react.createElement("ol", { className: "research-story-flow" }, stages.map((stage, index) => react.createElement("li", { key: index },
                react.createElement("span", { className: "research-story-marker", "aria-hidden": "true" }),
                react.createElement("div", null,
                    stage.phase && react.createElement("span", { className: "research-story-phase" }, stage.phase),
                    react.createElement("h4", null,
                        react.createElement(InlineText, null, stage.title),
                        react.createElement(SourceFootnote, { url: stage.source_url })
                    ),
                    stage.body && react.createElement("p", null, react.createElement(InlineText, null, stage.body))
                )
            ))),
            react.createElement(EditorialNote, { text: story?.editorial_note })
        );
    };

    const CreatorQuotes = ({ quotes }) => {
        const items = (Array.isArray(quotes) ? quotes : []).filter((item) => asText(item?.quote) && asText(item?.speaker) && getSafeHttpUrl(item?.source_url));
        if (items.length === 0) return null;
        return react.createElement("div", { className: "research-subsection research-creator-voices" },
            react.createElement("h3", { className: "research-subsection-title" }, t("research.labels.creatorVoices", "In the creator's words")),
            react.createElement("div", { className: "research-quote-list" }, items.map((item, index) => react.createElement("figure", { className: "research-creator-quote", key: index },
                react.createElement("blockquote", null,
                    react.createElement(InlineText, null, item.quote),
                    react.createElement(SourceFootnote, { url: item.source_url })
                ),
                item.translation && react.createElement("p", null, react.createElement(InlineText, null, item.translation)),
                react.createElement("figcaption", null,
                    react.createElement("strong", null, item.speaker),
                    react.createElement("span", null, [item.role, item.date, item.context].filter(Boolean).join(" · "))
                )
            )))
        );
    };

    const CreativeConnections = ({ connections }) => {
        const groups = [
            ["people", "", connections?.people],
            ["samples", t("research.labels.sample", "Sample"), connections?.samples],
            ["covers", t("research.labels.cover", "Cover"), connections?.covers]
        ];
        const items = groups.flatMap(([type, typeLabel, values]) => (Array.isArray(values) ? values : [])
            .filter((item) => (getSafeHttpUrl(item?.source_url) || getSafeHttpUrl(item?.spotify_url)) && hasValue(item))
            .map((item) => ({ ...item, type, typeLabel })));
        if (items.length === 0) return null;
        return react.createElement("div", { className: "research-subsection research-connections" },
            react.createElement("h3", { className: "research-subsection-title" }, connections?.headline || t("research.labels.creativeConnections", "Creative connections")),
            react.createElement("div", { className: "research-connection-grid" }, items.map((item, index) => {
                const spotifyUrl = getSafeHttpUrl(item.spotify_url);
                const title = item.title || item.artist;
                return react.createElement("article", { className: "research-connection-item", key: `${item.type}:${index}` },
                    item.typeLabel && react.createElement("span", { className: "research-connection-type" }, item.typeLabel),
                    react.createElement("h4", null,
                        spotifyUrl ? react.createElement("a", {
                            href: spotifyUrl,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            onClick: (event) => {
                                event.preventDefault();
                                window.open(spotifyUrl, "_blank", "noopener,noreferrer");
                            }
                        }, title) : react.createElement(InlineText, null, title),
                        react.createElement(SourceFootnote, { url: item.source_url })
                    ),
                    item.role && react.createElement("span", { className: "research-connection-role" }, item.role),
                    item.artist && item.artist !== title && react.createElement("span", { className: "research-connection-role" }, item.artist),
                    item.connection && react.createElement("p", null, react.createElement(InlineText, null, item.connection)),
                    item.notable_work && react.createElement("small", null,
                        react.createElement("b", null, t("research.labels.notableWork", "Notable work")),
                        react.createElement(InlineText, null, item.notable_work)
                    )
                );
            })),
            react.createElement(EditorialNote, { text: connections?.editorial_note })
        );
    };

    const Afterlife = ({ afterlife }) => {
        const events = (Array.isArray(afterlife?.events) ? afterlife.events : []).filter((item) => getSafeHttpUrl(item?.source_url) && hasValue(item));
        if (events.length === 0) return null;
        return react.createElement("div", { className: "research-subsection research-afterlife" },
            react.createElement("h3", { className: "research-subsection-title" }, afterlife?.headline || t("research.labels.afterlife", "Life after release")),
            react.createElement(Paragraphs, { items: afterlife?.paragraphs }),
            react.createElement("ol", { className: "research-afterlife-list" }, events.map((item, index) => react.createElement("li", { key: index },
                item.date && react.createElement("time", null, item.date),
                react.createElement("div", null,
                    react.createElement("h4", null,
                        react.createElement(InlineText, null, item.title),
                        react.createElement(SourceFootnote, { url: item.source_url })
                    ),
                    item.body && react.createElement("p", null, react.createElement(InlineText, null, item.body)),
                    item.impact && react.createElement("blockquote", null, react.createElement(InlineText, null, item.impact))
                )
            ))),
            react.createElement(EditorialNote, { text: afterlife?.editorial_note })
        );
    };

    const MythChecks = ({ items }) => {
        const myths = (Array.isArray(items) ? items : []).filter((item) => asText(item?.claim) && asText(item?.explanation) && getSafeHttpUrl(item?.source_url));
        if (myths.length === 0) return null;
        return react.createElement("div", { className: "research-subsection research-myths" },
            react.createElement("h3", { className: "research-subsection-title" }, t("research.labels.mythCheck", "Myth vs. fact")),
            react.createElement("div", { className: "research-myth-list" }, myths.map((item, index) => react.createElement("article", { className: "research-myth-item", key: index },
                react.createElement("header", null,
                    react.createElement("h4", null,
                        react.createElement(InlineText, null, item.claim),
                        react.createElement(SourceFootnote, { url: item.source_url })
                    ),
                    react.createElement(StatusBadge, { status: item.verdict })
                ),
                react.createElement("p", null, react.createElement(InlineText, null, item.explanation))
            )))
        );
    };

    const Section = ({ id, icon, label, headline, children, note, register }) => react.createElement("section", {
        id: `research-${id}`,
        className: "research-section",
        ref: (node) => register(id, node),
        "data-research-section": id,
        tabIndex: -1
    },
        react.createElement("header", { className: "research-section-header" },
            react.createElement("div", { className: "research-section-label-row" },
                react.createElement("span", { className: "research-section-icon" }, react.createElement(Icon, { name: icon, size: 14 })),
                react.createElement("span", { className: "research-section-kicker" }, label)
            ),
            headline && react.createElement("h3", null, react.createElement(InlineText, null, headline))
        ),
        react.createElement("div", { className: "research-section-body" }, children),
        react.createElement(EditorialNote, { text: note })
    );

    const ResearchQuality = ({ quality }) => {
        const groups = [
            ["verified_facts", t("research.quality.verified", "Verified")],
            ["interpretations", t("research.quality.interpretations", "Interpretations")],
            ["uncertain_items", t("research.quality.uncertain", "Uncertain")],
            ["conflicting_information", t("research.quality.conflicts", "Conflicts")],
            ["missing_information", t("research.quality.missing", "Missing")]
        ].filter(([key]) => asTextArray(quality?.[key]).length > 0);
        if (groups.length === 0) return react.createElement("p", { className: "research-muted" }, t("research.quality.empty", "No additional research notes"));
        return react.createElement("div", { className: "research-quality-grid" },
            groups.map(([key, label]) => react.createElement("div", { className: `research-quality-group quality-${key}`, key },
                react.createElement("h4", null, label),
                react.createElement("ul", null, asTextArray(quality[key]).map((item, index) =>
                    react.createElement("li", { key: index }, react.createElement(InlineText, null, item))
                ))
            ))
        );
    };

    const SourceList = ({ sources }) => {
        const safeSources = (Array.isArray(sources) ? sources : [])
            .map((source) => window.AIAddonManager?.normalizeResearchSource?.(source) || source)
            .filter((source) => source?.url);
        if (safeSources.length === 0) return react.createElement("p", { className: "research-muted" }, t("research.sourcesEmpty", "No source links were returned"));
        return react.createElement("ol", { className: "research-source-list" },
            safeSources.map((source, index) => react.createElement("li", { key: `${source.url}:${index}` },
                react.createElement("a", {
                    href: source.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    onClick: (event) => {
                        event.preventDefault();
                        window.open(source.url, "_blank", "noopener,noreferrer");
                    }
                },
                    react.createElement("span", { className: "research-source-index" }, String(index + 1).padStart(2, "0")),
                    react.createElement("span", { className: "research-source-copy" },
                        react.createElement("strong", null, source.title || source.publisher || source.url),
                        react.createElement("small", null, [source.publisher, source.source_type].filter(Boolean).join(" · ") || new URL(source.url).hostname),
                        source.relevance && react.createElement("span", null, source.relevance)
                    ),
                    react.createElement(Icon, { name: "external", size: 14 })
                )
            ))
        );
    };

    const getSectionDefinitions = (info) => {
        const sections = [
            ["thesis", "thesis", t("research.thesis", "Central thesis"), info.editorial_thesis],
            ["overview", "thesis", t("research.sections.overview", "Overview"), info.introduction],
            ["information", "info", t("research.sections.information", "Information"), info.basic_information],
            ["listening", "listen", t("research.sections.listeningGuide", "Listening guide"), info.listening_guide?.moments],
            ["trivia", "trivia", t("research.sections.trivia", "Fun Facts"), info.trivia],
            ["title", "title", t("research.sections.title", "Title"), info.title_analysis],
            ["lyrics", "lyrics", t("research.sections.lyrics", "Lyrics"), info.lyric_analysis],
            ["chorus", "chorus", t("research.sections.chorus", "Chorus"), info.chorus_analysis],
            ["ending", "ending", t("research.sections.ending", "Ending"), info.ending_analysis],
            ["music", "music", t("research.sections.music", "Music"), info.music_analysis],
            ["artist", "artist", t("research.sections.artist", "Artist"), info.artist_context],
            ["comparison", "compare", t("research.sections.comparison", "Comparison"), info.comparative_analysis],
            ["culture", "culture", t("research.sections.culture", "Culture"), info.cultural_context],
            ["visual", "visual", t("research.sections.visual", "Visual world"), info.visual_world],
            ["critique", "critique", t("research.sections.critique", "Critique"), info.final_critique],
            ["sources", "source", t("research.sections.sources", "Sources"), info.sources],
            ["quality", "quality", t("research.sections.quality", "Research notes"), info.research_quality]
        ];
        return sections.filter(([, , , content]) => hasValue(content));
    };

    const ResearchDocument = react.memo(({ info, register, coverUrl }) => {
        const thesis = info.editorial_thesis || {};
        const intro = info.introduction || {};
        const basic = info.basic_information || {};
        const listening = info.listening_guide || {};
        const trivia = info.trivia || {};
        const media = Array.isArray(info.media_gallery) ? info.media_gallery : [];
        const title = info.title_analysis || {};
        const lyrics = info.lyric_analysis || {};
        const chorus = info.chorus_analysis || {};
        const ending = info.ending_analysis || {};
        const music = info.music_analysis || {};
        const artist = info.artist_context || {};
        const comparison = info.comparative_analysis || {};
        const culture = info.cultural_context || {};
        const visual = info.visual_world || {};
        const critique = info.final_critique || {};
        const sections = [];

        if (hasValue(thesis)) sections.push(react.createElement(Section, {
            key: "thesis", id: "thesis", icon: "thesis", label: t("research.thesis", "Central thesis"), register
        }, react.createElement("div", { className: "research-thesis-card" },
            react.createElement("blockquote", null, react.createElement(InlineText, null, thesis.one_sentence || thesis.expanded)),
            thesis.one_sentence && thesis.expanded && react.createElement("p", null, react.createElement(InlineText, null, thesis.expanded)),
            react.createElement(ResearchHook, { hook: thesis.hook })
        )));

        if (hasValue(intro)) sections.push(react.createElement(Section, {
            key: "overview", id: "overview", icon: "thesis", label: t("research.sections.overview", "Overview"),
            headline: intro.headline, note: intro.editorial_note, register
        }, react.createElement(Paragraphs, { items: intro.paragraphs })));

        if (hasValue(basic)) sections.push(react.createElement(Section, {
            key: "information", id: "information", icon: "info", label: t("research.sections.information", "Information"), register
        }, react.createElement(FactGrid, { entries: basic.table }), react.createElement(Paragraphs, { items: basic.paragraphs })));

        if (Array.isArray(listening.moments) && listening.moments.length > 0) sections.push(react.createElement(Section, {
            key: "listening", id: "listening", icon: "listen", label: t("research.sections.listeningGuide", "Listening guide"),
            headline: listening.headline, register
        }, react.createElement(ListeningGuide, { guide: listening })));

        if (hasValue(trivia)) sections.push(react.createElement(Section, {
            key: "trivia", id: "trivia", icon: "trivia", label: t("research.sections.trivia", "Fun Facts"),
            headline: trivia.headline, note: trivia.editorial_note, register
        },
            trivia.introduction && react.createElement(Paragraphs, { items: [trivia.introduction], className: "research-trivia-introduction" }),
            react.createElement(TriviaStories, { trivia }),
            react.createElement(ResearchTimeline, { items: trivia.timeline }),
            react.createElement(Afterlife, { afterlife: trivia.afterlife }),
            react.createElement(MythChecks, { items: trivia.myth_checks }),
            react.createElement(ResearchMedia, {
                coverUrl,
                metadata: info.metadata,
                sources: info.sources,
                media
            })
        ));

        if (hasValue(title)) sections.push(react.createElement(Section, {
            key: "title", id: "title", icon: "title", label: t("research.sections.title", "Title"),
            headline: title.headline, note: title.editorial_note, register
        },
            react.createElement(DetailGrid, { entries: [
                { label: t("research.labels.original", "Original"), value: title.original },
                { label: t("research.labels.reading", "Reading"), value: title.reading },
                { label: t("research.labels.meaning", "Meaning"), value: title.korean_meaning }
            ] }),
            react.createElement(Paragraphs, { items: title.paragraphs }),
            react.createElement(DetailGrid, { entries: [
                { label: t("research.labels.lyricConnection", "Lyric connection"), value: title.title_to_lyric_connection },
                { label: t("research.labels.endingConnection", "Ending connection"), value: title.title_to_ending_connection }
            ] })
        ));

        if (hasValue(lyrics)) sections.push(react.createElement(Section, {
            key: "lyrics", id: "lyrics", icon: "lyrics", label: t("research.sections.lyrics", "Lyrics"),
            headline: lyrics.headline, note: lyrics.editorial_note, register
        },
            react.createElement(DetailGrid, { entries: [
                { label: t("research.labels.speaker", "Speaker"), value: lyrics.narrative?.speaker },
                { label: t("research.labels.listener", "Listener"), value: lyrics.narrative?.listener },
                { label: t("research.labels.relationship", "Relationship"), value: lyrics.narrative?.relationship },
                { label: t("research.labels.emotionalArc", "Emotional arc"), value: lyrics.narrative?.emotional_arc }
            ] }),
            react.createElement(Paragraphs, { items: lyrics.narrative?.paragraphs }),
            react.createElement(Paragraphs, { items: lyrics.paragraphs }),
            Array.isArray(lyrics.motifs) && lyrics.motifs.length > 0 && react.createElement("div", { className: "research-card-grid" },
                lyrics.motifs.filter(hasValue).map((item, index) => react.createElement(EditorialCard, {
                    key: `motif-${index}`,
                    title: item.keyword,
                    subtitle: [item.reading, item.korean_meaning].filter(Boolean).join(" · "),
                    paragraphs: item.paragraphs,
                    note: item.editorial_note,
                    className: "research-motif-card"
                }, react.createElement(DetailGrid, { entries: [
                    { label: t("research.labels.literal", "Literal"), value: item.literal_meaning },
                    { label: t("research.labels.symbolic", "Symbolic"), value: item.symbolic_meaning }
                ] })))
            ),
            Array.isArray(lyrics.japanese_expressions) && lyrics.japanese_expressions.length > 0 && react.createElement("div", { className: "research-expression-list" },
                lyrics.japanese_expressions.filter(hasValue).map((item, index) => react.createElement(EditorialCard, {
                    key: `expression-${index}`,
                    title: item.original,
                    subtitle: [item.reading, item.korean_meaning].filter(Boolean).join(" · "),
                    paragraphs: item.paragraphs,
                    note: item.editorial_note,
                    className: "research-expression-card"
                }, react.createElement(DetailGrid, { entries: [
                    { label: t("research.labels.literal", "Literal"), value: item.literal_meaning },
                    { label: t("research.labels.contextual", "In context"), value: item.contextual_meaning },
                    { label: t("research.labels.nuance", "Nuance"), value: item.nuance },
                    { label: t("research.labels.role", "Role in song"), value: item.role_in_song }
                ] })))
            )
        ));

        const leadingGenericSections = [
            ["chorus", "chorus", t("research.sections.chorus", "Chorus"), chorus, [
                [t("research.labels.repeatedPhrases", "Repeated phrases"), asTextArray(chorus.repeated_phrases).join(" · ")],
                [t("research.labels.change", "Change"), chorus.first_to_last_change]
            ]],
            ["ending", "ending", t("research.sections.ending", "Ending"), ending, [
                [t("research.labels.finalLyric", "Final lyric"), ending.final_lyric],
                [t("research.labels.reading", "Reading"), ending.reading],
                [t("research.labels.meaning", "Meaning"), ending.korean_meaning],
                [t("research.labels.titleConnection", "Title connection"), ending.title_connection],
                [t("research.labels.openingConnection", "Opening connection"), ending.opening_connection],
                [t("research.labels.reinterpretation", "Reinterpretation"), ending.reinterpretation]
            ]],
            ["music", "music", t("research.sections.music", "Music"), music, [
                [t("research.labels.genre", "Genre"), asTextArray(music.genre).join(" · ")],
                ["BPM", music.bpm],
                [t("research.labels.tempo", "Tempo"), music.tempo],
                [t("research.labels.rhythm", "Rhythm"), music.rhythm],
                [t("research.labels.instrumentation", "Instrumentation"), music.instrumentation],
                [t("research.labels.vocal", "Vocal"), music.vocal],
                [t("research.labels.harmony", "Harmony"), music.harmony],
                [t("research.labels.arrangement", "Arrangement"), music.arrangement],
                [t("research.labels.structure", "Structure"), music.structure],
                [t("research.labels.lyricMusic", "Lyrics and music"), music.lyric_music_relationship]
            ]]
        ];
        const trailingGenericSections = [
            ["culture", "culture", t("research.sections.culture", "Culture"), culture, [
                [t("research.labels.history", "Historical context"), culture.historical_context],
                [t("research.labels.genreContext", "Genre context"), culture.genre_context],
                [t("research.labels.popCulture", "Pop culture"), culture.pop_culture_context]
            ]],
            ["visual", "visual", t("research.sections.visual", "Visual world"), visual, [
                [t("research.labels.aesthetic", "Aesthetic"), asTextArray(visual.aesthetic_keywords).join(" · ")],
                [t("research.labels.mv", "Music video"), visual.mv_analysis],
                [t("research.labels.artwork", "Artwork"), visual.album_art_analysis],
                [t("research.labels.visualInterpretation", "Interpretation"), visual.visual_interpretation]
            ]],
            ["critique", "critique", t("research.sections.critique", "Critique"), critique, [
                [t("research.labels.core", "Core reading"), critique.core_interpretation],
                [t("research.labels.literary", "Literary"), critique.literary_interpretation],
                [t("research.labels.musical", "Musical"), critique.music_interpretation],
                [t("research.labels.career", "Career"), critique.career_interpretation]
            ]]
        ];

        const appendGenericSections = (definitions) => {
            for (const [id, icon, label, data, details] of definitions) {
                if (!hasValue(data)) continue;
                sections.push(react.createElement(Section, {
                    key: id, id, icon, label, headline: data.headline, note: data.editorial_note, register
                },
                    id === "visual" && !hasValue(trivia) && react.createElement(ResearchMedia, {
                        coverUrl,
                        metadata: info.metadata,
                        sources: info.sources,
                        media
                    }),
                    data.one_line && react.createElement("blockquote", { className: "research-one-line" }, react.createElement(InlineText, null, data.one_line)),
                    react.createElement(Paragraphs, { items: data.paragraphs }),
                    react.createElement(DetailGrid, { entries: details.map(([detailLabel, value]) => ({ label: detailLabel, value })) }),
                    id === "music" && react.createElement(CreationStory, { story: data.creation_story }),
                    id === "music" && react.createElement(CreatorQuotes, { quotes: data.creator_quotes }),
                    data.ending && react.createElement("p", { className: "research-ending" }, react.createElement(InlineText, null, data.ending))
                ));
            }
        };

        appendGenericSections(leadingGenericSections);

        if (hasValue(artist)) sections.push(react.createElement(Section, {
            key: "artist", id: "artist", icon: "artist", label: t("research.sections.artist", "Artist"),
            headline: artist.headline, note: artist.editorial_note, register
        },
            react.createElement(DetailGrid, { entries: [
                { label: t("research.labels.background", "Background"), value: artist.background },
                { label: t("research.labels.ageAtRelease", "Age at release"), value: artist.age_at_release },
                { label: t("research.labels.careerStage", "Career stage"), value: artist.career_stage },
                { label: t("research.labels.significance", "Significance"), value: artist.career_significance }
            ] }),
            react.createElement(Paragraphs, { items: artist.paragraphs }),
            react.createElement(CreativeConnections, { connections: artist.creative_connections }),
            Array.isArray(artist.trivia) && artist.trivia.length > 0 && react.createElement("div", { className: "research-trivia-list" },
                artist.trivia.filter(hasValue).map((item, index) => react.createElement(EditorialCard, {
                    key: index,
                    title: `${String(index + 1).padStart(2, "0")} · ${t("research.fact", "Fact")}`,
                    paragraphs: [typeof item === "string" ? item : item.fact],
                    note: item?.editorial_note,
                    status: item?.verification_status
                }))
            )
        ));

        if (hasValue(comparison)) sections.push(react.createElement(Section, {
            key: "comparison", id: "comparison", icon: "compare", label: t("research.sections.comparison", "Comparison"),
            headline: comparison.headline, register
        },
            react.createElement("div", { className: "research-comparison-list" },
                (comparison.works || []).filter(hasValue).map((work, index) => react.createElement(EditorialCard, {
                    key: index,
                    title: work.title || work.title_original,
                    subtitle: work.release_context,
                    paragraphs: work.paragraphs,
                    note: work.editorial_note
                }, react.createElement(DetailGrid, { entries: [
                    { label: t("research.labels.similarities", "Similarities"), value: work.similarities },
                    { label: t("research.labels.differences", "Differences"), value: work.differences },
                    { label: t("research.labels.whyItMatters", "Why it matters"), value: work.why_it_matters }
                ] })))
            ),
            react.createElement(Paragraphs, { items: comparison.overall_comparison })
        ));

        appendGenericSections(trailingGenericSections);

        if (hasValue(info.sources)) sections.push(react.createElement(Section, {
            key: "sources", id: "sources", icon: "source", label: t("research.sections.sources", "Sources"), register
        }, react.createElement(SourceList, { sources: info.sources })));

        if (hasValue(info.research_quality)) sections.push(react.createElement(Section, {
            key: "quality", id: "quality", icon: "quality", label: t("research.sections.quality", "Research notes"), register
        }, react.createElement(ResearchQuality, { quality: info.research_quality })));

        return sections;
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
        const uiLanguage = window.I18n?.getCurrentLanguage?.() || CONFIG?.visual?.language || "en";
        const normalized = useMemo(() => window.AIAddonManager?.normalizeResearchResult
            ? window.AIAddonManager.normalizeResearchResult(info || {}, { title: trackName, artist: artistName })
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
                window.StorageManager?.saveConfig?.("fullscreen-tmi-font-size", percent);
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

        if (info?.error) {
            const isQuotaError = /429|quota|RESOURCE_EXHAUSTED/i.test(info.message || "");
            return react.createElement("div", {
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
            );
        }

        return react.createElement("div", {
            className: "research-view",
            style: { "--research-scale": researchScale },
            lang: normalized.language || undefined,
            role: "document",
            "aria-labelledby": "research-document-title",
            "aria-busy": isGenerating
        },
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
            ),
            sectionDefinitions.length > 0 && react.createElement("nav", {
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
            ),
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
})();

window.SongResearch = SongResearch;
window.SongInfoTMI = SongResearch;
