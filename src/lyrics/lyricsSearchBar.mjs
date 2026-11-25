import { isIvLyricsRoute } from "../spicetify/lyricsRoute.mjs";

const CAPTURE = { capture: true };
const LYRIC_ROW = ".lyrics-lyricsContainer-LyricsLine";
const SEARCH_SCROLL_INSET = 100;
const EDITABLE_OR_DIALOG = 'input, textarea, select, [role="textbox"], [role="combobox"], [role="dialog"]';

export function createLyricsSearchBar({ react, browser, readPathname, getSearchIcon, translate }) {
    const { document } = browser;
    const views = new Set();
    const useMeta = /Mac|iPod|iPhone|iPad/.test(browser.navigator?.platform || "");

    function onKeyDown(event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
        const toggle = event.shiftKey && !event.altKey && !event.repeat
            && (useMeta ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
            && (event.code === "KeyF" || event.key?.toLowerCase() === "f");
        const searchKey = event.key === "Escape" || event.key === "Enter";
        if ((!toggle && !searchKey) || !isIvLyricsRoute(readPathname())) return;

        const activeViews = [...views];
        const focused = activeViews.find(view => !view.state.hidden && view.input === event.target);
        if (toggle) {
            if (!focused && (event.target?.isContentEditable || event.target?.closest?.(EDITABLE_OR_DIALOG))) return;
            const view = focused ?? activeViews.findLast(candidate => candidate.root?.getClientRects().length);
            if (!view?.input) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            view.toggle();
        } else if (focused && (event.key === "Escape" || focused.state.matches.length)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.key === "Escape") focused.close();
            else focused.advance(event.shiftKey ? -1 : 1);
        }
    }

    function refreshHighlights() {
        for (const view of views) {
            if (!view.state.hidden && view.state.matches.length) view.refreshHighlight();
        }
    }

    return class LyricsSearchBar extends react.PureComponent {
        state = { hidden: true, query: "", matches: [], index: 0, highlight: null };
        input = null;
        range = null;
        get root() { return this.props.lyricsRoot.current; }
        setInput = (input) => { this.input = input; };
        handleChange = (event) => this.search(event.target.value, 0, true);

        componentDidMount() {
            if (!views.size) {
                browser.addEventListener("keydown", onKeyDown, CAPTURE);
                browser.addEventListener("resize", refreshHighlights);
            }
            views.add(this);
        }

        componentDidUpdate(previous) {
            if (!this.state.hidden && previous.lyricsRevision !== this.props.lyricsRevision) {
                this.search(this.state.query, this.state.index);
            }
        }

        componentWillUnmount() {
            views.delete(this);
            this.range = null;
            if (!views.size) {
                browser.removeEventListener("keydown", onKeyDown, CAPTURE);
                browser.removeEventListener("resize", refreshHighlights);
            }
        }

        toggle() {
            if (!this.state.hidden) {
                this.close();
                return;
            }
            this.setState({ hidden: false }, () => {
                if (this.state.hidden) return;
                this.input?.focus({ preventScroll: true });
                this.search(this.state.query, this.state.index);
            });
        }

        close() {
            this.input?.blur();
            this.range = null;
            this.setState({ hidden: true, matches: [], highlight: null });
        }

        search(query, preferredIndex, scroll = false) {
            const root = this.root;
            const matches = [];
            const needle = query.toLowerCase();
            if (root && needle) {
                const walker = document.createTreeWalker(root, browser.NodeFilter.SHOW_TEXT);
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    if (node.data.toLowerCase().includes(needle) && node.parentElement?.closest(LYRIC_ROW)) {
                        matches.push(node);
                    }
                }
            } else if (root && scroll) {
                root.scrollTo(0, 0);
            }
            const index = Math.max(0, Math.min(preferredIndex, matches.length - 1));
            const highlight = this.measure(matches[index], scroll);
            this.setState({ query, matches, index, highlight });
        }

        advance(direction) {
            const { index, matches, query } = this.state;
            const next = (index + direction + matches.length) % matches.length;
            if (!this.root?.contains(matches[next])) {
                this.search(query, next, true);
                return;
            }
            this.setState({ index: next, highlight: this.measure(matches[next], true) });
        }

        refreshHighlight() {
            const { matches, index, query } = this.state;
            if (!this.root?.contains(matches[index])) this.search(query, index);
            else this.setState({ highlight: this.measure(matches[index]) });
        }

        measure(node, scroll) {
            const root = this.root;
            if (!node || !root?.contains(node)) return null;
            this.range ??= document.createRange();
            this.range.selectNodeContents(node);
            const rect = this.range.getBoundingClientRect();
            const relativeTop = rect.top - root.getBoundingClientRect().top - root.clientTop;
            const top = relativeTop + root.scrollTop;
            if (scroll) root.scrollBy(0, relativeTop - SEARCH_SCROLL_INSET);
            return { top, height: rect.height };
        }

        render() {
            const { hidden, query, matches, index, highlight } = this.state;
            return react.createElement(react.Fragment, null,
                react.createElement("div", { className: `lyrics-Searchbar${hidden ? " hidden" : ""}` },
                    react.createElement("input", {
                        ref: this.setInput, value: query, onChange: this.handleChange, "aria-label": translate("menu.searchLyrics"),
                    }),
                    react.createElement("svg", {
                        width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true",
                        dangerouslySetInnerHTML: { __html: getSearchIcon() },
                    }),
                    react.createElement("span", { hidden: !matches.length }, `${index + 1}/${matches.length}`),
                ),
                !hidden && highlight && react.createElement("div", {
                    className: "lyrics-Searchbar-highlight", "aria-hidden": "true",
                    style: {
                        "--search-highlight-top": `${highlight.top}px`,
                        "--search-highlight-height": `${highlight.height}px`,
                    },
                }),
            );
        }
    };
}
