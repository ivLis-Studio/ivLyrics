import { normalizeGrammarItem } from "./studyPack.mjs";

export function createStudyButton({ react, ToolbarIcon, readTooltip, t, open }) {
    const BookIcon = ToolbarIcon
        ? react.createElement(ToolbarIcon, { name: "study" })
        : react.createElement("svg", {
            width: 18,
            height: 18,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.8,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true"
        },
            react.createElement("path", { d: "M3 5a3 3 0 0 1 3-1h6v16H6a3 3 0 0 0-3 1V5Z" }),
            react.createElement("path", { d: "M21 5a3 3 0 0 0-3-1h-6v16h6a3 3 0 0 1 3 1V5Z" })
        );

    return react.memo(({ disabled = false }) => {
        const label = t("button", "학습");
        const Tooltip = readTooltip();
        const button = react.createElement("button", {
            className: "lyrics-config-button ivlyrics-study-button",
            type: "button",
            disabled,
            "aria-haspopup": "dialog",
            "aria-label": label,
            title: Tooltip ? undefined : label,
            onClick: (event) => {
                event.stopPropagation();
                if (disabled) return;
                open();
            }
        }, BookIcon);

        if (Tooltip) {
            return react.createElement(Tooltip, { label }, button);
        }

        return button;
    });
}

export function createStudyComponents(react, t) {
    const TabButton = ({ id, activeTab, onSelect, children }) => react.createElement("button", {
        className: `ivlyrics-study-tab${activeTab === id ? " active" : ""}`,
        type: "button",
        onClick: () => onSelect(id)
    }, children);

    const EmptyState = ({ children }) => react.createElement("div", {
        className: "ivlyrics-study-empty"
    }, children);

    const ReadingHints = ({ reading = "", pronunciation = "" }) => {
        const rows = [
            reading && { label: t("reading", "읽기"), value: reading },
            pronunciation && { label: t("pronunciation", "발음"), value: pronunciation }
        ].filter(Boolean);

        if (rows.length === 0) return null;

        return react.createElement("div", { className: "ivlyrics-study-reading-hints" },
            rows.map((row) => react.createElement("div", {
                key: row.label,
                className: "ivlyrics-study-reading-row"
            },
                react.createElement("span", null, row.label),
                react.createElement("strong", null, row.value)
            ))
        );
    };

    const GrammarNote = ({ item, className = "" }) => {
        const grammar = normalizeGrammarItem(item);
        if (!grammar) return null;

        return react.createElement("div", {
            className: ["ivlyrics-study-grammar-note", className].filter(Boolean).join(" ")
        },
            react.createElement("strong", null, grammar.pattern),
            grammar.explanation && react.createElement("p", null, grammar.explanation),
            grammar.note && react.createElement("small", null, grammar.note)
        );
    };

    const LyricPlayButton = ({ onClick, disabled = false }) => react.createElement("button", {
        type: "button",
        className: "ivlyrics-study-lyric-play",
        onClick,
        disabled,
        title: t("playLyric", "가사 재생")
    },
        react.createElement("span", { "aria-hidden": "true" }, "▶"),
        react.createElement("span", null, t("playLyric", "가사 재생"))
    );

    const BlankQuestion = ({ text = "" }) => {
        const parts = String(text || "").split(/(__+|\[blank\]|\{blank\}|<blank>)/gi);
        return react.createElement("div", { className: "ivlyrics-study-blank-question" },
            parts.map((part, index) => {
                const isBlank = /^(__+|\[blank\]|\{blank\}|<blank>)$/i.test(part);
                return react.createElement("span", {
                    key: `${index}-${part}`,
                    className: isBlank ? "blank" : ""
                }, isBlank ? "____" : part);
            })
        );
    };

    return { TabButton, EmptyState, ReadingHints, GrammarNote, LyricPlayButton, BlankQuestion };
}
