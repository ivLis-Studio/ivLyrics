import { asText, asTextArray, hasValue } from "./researchText.mjs";

const RESEARCH_SECTIONS = {
    thesis: ["thesis", "research.thesis", "Central thesis", "editorial_thesis"],
    overview: ["thesis", "research.sections.overview", "Overview", "introduction"],
    information: ["info", "research.sections.information", "Information", "basic_information"],
    listening: ["listen", "research.sections.listeningGuide", "Listening guide", "listening_guide"],
    trivia: ["trivia", "research.sections.trivia", "Fun Facts", "trivia"],
    title: ["title", "research.sections.title", "Title", "title_analysis"],
    lyrics: ["lyrics", "research.sections.lyrics", "Lyrics", "lyric_analysis"],
    chorus: ["chorus", "research.sections.chorus", "Chorus", "chorus_analysis"],
    ending: ["ending", "research.sections.ending", "Ending", "ending_analysis"],
    music: ["music", "research.sections.music", "Music", "music_analysis"],
    artist: ["artist", "research.sections.artist", "Artist", "artist_context"],
    comparison: ["compare", "research.sections.comparison", "Comparison", "comparative_analysis"],
    culture: ["culture", "research.sections.culture", "Culture", "cultural_context"],
    visual: ["visual", "research.sections.visual", "Visual world", "visual_world"],
    critique: ["critique", "research.sections.critique", "Critique", "final_critique"],
    sources: ["source", "research.sections.sources", "Sources", "sources"],
    quality: ["quality", "research.sections.quality", "Research notes", "research_quality"],
};

export function createSongResearchDocument({ react, host: window, spicetify: Spicetify, utils: Utils, t, getAiManager }) {
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
        while (/[.,;:!?，。！？、\]}]/u.test(url.slice(-1))) {
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
        Utils?.clearSafePlayerProgressCorrection?.();
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
            .map((source) => getAiManager()?.normalizeResearchSource?.(source) || source)
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

    const getSectionDefinitions = (info) => Object.entries(RESEARCH_SECTIONS)
        .map(([id, [icon, key, fallback, field]]) => [
            id, icon, t(key, fallback), id === "listening" ? info[field]?.moments : info[field],
        ])
        .filter(([, , , content]) => hasValue(content));

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
        const hasTrivia = hasValue(trivia);
        const renderSection = (id, props, ...children) => {
            const [icon, key, fallback] = RESEARCH_SECTIONS[id];
            return react.createElement(Section, { key: id, id, icon, label: t(key, fallback), ...props, register }, ...children);
        };

        if (hasValue(thesis)) sections.push(renderSection("thesis", null, react.createElement("div", { className: "research-thesis-card" },
            react.createElement("blockquote", null, react.createElement(InlineText, null, thesis.one_sentence || thesis.expanded)),
            thesis.one_sentence && thesis.expanded && react.createElement("p", null, react.createElement(InlineText, null, thesis.expanded)),
            react.createElement(ResearchHook, { hook: thesis.hook })
        )));

        if (hasValue(intro)) sections.push(renderSection("overview", { headline: intro.headline, note: intro.editorial_note }, react.createElement(Paragraphs, { items: intro.paragraphs })));

        if (hasValue(basic)) sections.push(renderSection("information", null, react.createElement(FactGrid, { entries: basic.table }), react.createElement(Paragraphs, { items: basic.paragraphs })));

        if (Array.isArray(listening.moments) && listening.moments.length > 0) sections.push(renderSection("listening", { headline: listening.headline }, react.createElement(ListeningGuide, { guide: listening })));

        if (hasTrivia) sections.push(renderSection("trivia", { headline: trivia.headline, note: trivia.editorial_note },
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

        if (hasValue(title)) sections.push(renderSection("title", { headline: title.headline, note: title.editorial_note },
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

        if (hasValue(lyrics)) sections.push(renderSection("lyrics", { headline: lyrics.headline, note: lyrics.editorial_note },
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
            ["chorus", chorus, () => [
                [t("research.labels.repeatedPhrases", "Repeated phrases"), asTextArray(chorus.repeated_phrases).join(" · ")],
                [t("research.labels.change", "Change"), chorus.first_to_last_change]
            ]],
            ["ending", ending, () => [
                [t("research.labels.finalLyric", "Final lyric"), ending.final_lyric],
                [t("research.labels.reading", "Reading"), ending.reading],
                [t("research.labels.meaning", "Meaning"), ending.korean_meaning],
                [t("research.labels.titleConnection", "Title connection"), ending.title_connection],
                [t("research.labels.openingConnection", "Opening connection"), ending.opening_connection],
                [t("research.labels.reinterpretation", "Reinterpretation"), ending.reinterpretation]
            ]],
            ["music", music, () => [
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
            ["culture", culture, () => [
                [t("research.labels.history", "Historical context"), culture.historical_context],
                [t("research.labels.genreContext", "Genre context"), culture.genre_context],
                [t("research.labels.popCulture", "Pop culture"), culture.pop_culture_context]
            ]],
            ["visual", visual, () => [
                [t("research.labels.aesthetic", "Aesthetic"), asTextArray(visual.aesthetic_keywords).join(" · ")],
                [t("research.labels.mv", "Music video"), visual.mv_analysis],
                [t("research.labels.artwork", "Artwork"), visual.album_art_analysis],
                [t("research.labels.visualInterpretation", "Interpretation"), visual.visual_interpretation]
            ]],
            ["critique", critique, () => [
                [t("research.labels.core", "Core reading"), critique.core_interpretation],
                [t("research.labels.literary", "Literary"), critique.literary_interpretation],
                [t("research.labels.musical", "Musical"), critique.music_interpretation],
                [t("research.labels.career", "Career"), critique.career_interpretation]
            ]]
        ];

        const appendGenericSections = (definitions) => {
            for (const [id, data, getDetails] of definitions) {
                if (!hasValue(data)) continue;
                sections.push(renderSection(id, { headline: data.headline, note: data.editorial_note },
                    id === "visual" && !hasTrivia && react.createElement(ResearchMedia, {
                        coverUrl,
                        metadata: info.metadata,
                        sources: info.sources,
                        media
                    }),
                    data.one_line && react.createElement("blockquote", { className: "research-one-line" }, react.createElement(InlineText, null, data.one_line)),
                    react.createElement(Paragraphs, { items: data.paragraphs }),
                    react.createElement(DetailGrid, { entries: getDetails().map(([detailLabel, value]) => ({ label: detailLabel, value })) }),
                    id === "music" && react.createElement(CreationStory, { story: data.creation_story }),
                    id === "music" && react.createElement(CreatorQuotes, { quotes: data.creator_quotes }),
                    data.ending && react.createElement("p", { className: "research-ending" }, react.createElement(InlineText, null, data.ending))
                ));
            }
        };

        appendGenericSections(leadingGenericSections);

        if (hasValue(artist)) sections.push(renderSection("artist", { headline: artist.headline, note: artist.editorial_note },
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

        if (hasValue(comparison)) sections.push(renderSection("comparison", { headline: comparison.headline },
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

        if (hasValue(info.sources)) sections.push(renderSection("sources", null, react.createElement(SourceList, { sources: info.sources })));

        if (hasValue(info.research_quality)) sections.push(renderSection("quality", null, react.createElement(ResearchQuality, { quality: info.research_quality })));

        return sections;
    });

    return { Icon, StatusBadge, getSectionDefinitions, ResearchDocument };
}
