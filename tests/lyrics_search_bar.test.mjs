import assert from "node:assert/strict";
import test from "node:test";
import { createLyricsSearchBar } from "../src/lyrics/lyricsSearchBar.mjs";

function fixture(platform = "MacIntel") {
    const listeners = [];
    const browser = new class extends EventTarget {
        addEventListener(type, ...args) {
            listeners.push(["add", type]);
            super.addEventListener(type, ...args);
        }
        removeEventListener(type, ...args) {
            listeners.push(["remove", type]);
            super.removeEventListener(type, ...args);
        }
    }();
    let pathname = "/ivLyrics";
    let activeElement = null;
    let ranges = 0;
    browser.navigator = { platform };
    browser.NodeFilter = { SHOW_TEXT: 4 };
    browser.document = {
        createTreeWalker(root) {
            const rows = root.rows.values();
            return { nextNode: () => rows.next().value };
        },
        createRange() {
            ranges++;
            return {
                selectNodeContents(node) { this.node = node; },
                getBoundingClientRect() {
                    const { root, top } = this.node;
                    return { top: 60 + root.clientTop + top - root.scrollTop, height: 24 };
                },
            };
        },
    };
    const react = {
        PureComponent: class {
            constructor(props) { this.props = props; }
            setState(patch, callback) {
                Object.assign(this.state, patch);
                callback?.();
            }
        },
        createElement: (type, props, ...children) => ({ type, props, children }),
    };
    const SearchBar = createLyricsSearchBar({
        react, browser, readPathname: () => pathname, getSearchIcon: () => "", translate: key => key,
    });
    const mount = ({ visible = true, rows = [] } = {}) => {
        const root = {
            visible, rows: [], moves: [], scrollTop: 0, clientTop: 2,
            getClientRects() { return this.visible ? [{}] : []; },
            getBoundingClientRect: () => ({ top: 60 }),
            contains(node) { return this.rows.includes(node); },
            scrollBy(_x, y) { this.moves.push(y); this.scrollTop += y; },
            scrollTo(_x, y) { this.scrollTop = y; },
        };
        const update = (values) => {
            root.rows = values.map(({ data, top, lyric = true }) => ({
                root, data, top, parentElement: { closest: () => (lyric ? {} : null) },
            }));
        };
        update(rows);
        const view = new SearchBar({ lyricsRoot: { current: root }, lyricsRevision: rows });
        const input = {
            focus: () => { activeElement = input; },
            blur: () => { if (activeElement === input) activeElement = null; },
        };
        view.setInput(input);
        view.componentDidMount();
        return {
            view, input, root,
            replaceRows(values) {
                update(values);
                const previous = view.props;
                view.props = { ...previous, lyricsRevision: values };
                view.componentDidUpdate(previous);
            },
        };
    };
    const key = (key, options = {}, target = activeElement) => {
        const event = Object.assign(new Event("keydown", { cancelable: true }), { key }, options);
        Object.defineProperty(event, "target", { value: target });
        browser.dispatchEvent(event);
        return event.defaultPrevented;
    };
    return {
        listeners, mount, key, setRoute: (value) => { pathname = value; },
        open: () => key("F", { code: "KeyF", shiftKey: true, metaKey: platform === "MacIntel", ctrlKey: platform === "Win32" }),
        get activeElement() { return activeElement; },
        get ranges() { return ranges; },
    };
}

test("only the active visible lyrics search handles the shortcut and listeners leave with the last view", () => {
    const h = fixture();
    const visible = h.mount();
    const hidden = h.mount({ visible: false });
    assert.deepEqual(h.listeners, [["add", "keydown"], ["add", "resize"]]);
    h.setRoute("/search");
    assert.equal(h.open(), false);
    h.setRoute("/ivLyrics-test");
    assert.equal(h.open(), false);
    h.setRoute("/ivLyrics/nested");
    const edit = { closest: () => ({}) };
    assert.equal(h.key("f", { metaKey: true, shiftKey: true }, edit), false);
    assert.equal(h.open(), true);
    assert.equal(visible.view.state.hidden, false);
    assert.equal(hidden.view.state.hidden, true);
    assert.equal(h.activeElement, visible.input);

    assert.equal(h.key("Escape", { isComposing: true }), false);
    assert.equal(h.key("Escape"), true);
    assert.equal(visible.view.state.hidden, true);
    assert.equal(h.activeElement, null);
    visible.view.componentWillUnmount();
    assert.equal(h.open(), false);
    hidden.view.componentWillUnmount();
    assert.deepEqual(h.listeners.slice(2), [["remove", "keydown"], ["remove", "resize"]]);
    assert.equal(h.open(), false);
});

test("match navigation targets the scrollable lyrics, ignores controls and reuses one measuring range", () => {
    const h = fixture("Win32");
    const { view, root, replaceRows } = h.mount({ rows: [
        { data: "First match", top: 210 },
        { data: "Counter match", top: 230, lyric: false },
        { data: "Second MATCH", top: 410 },
    ] });
    assert.equal(h.key("f", { metaKey: true, shiftKey: true }), false);
    assert.equal(h.open(), true);
    view.handleChange({ target: { value: "matCH" } });
    assert.equal(view.state.matches.length, 2);
    assert.deepEqual(view.state.highlight, { top: 210, height: 24 });
    assert.equal(root.scrollTop, 110);
    assert.equal(h.key("Enter", { shiftKey: true }), true);
    assert.equal(view.state.index, 1);
    assert.deepEqual(view.state.highlight, { top: 410, height: 24 });
    assert.equal(root.scrollTop, 310);
    assert.equal(h.key("Enter"), true);
    assert.equal(view.state.index, 0);
    assert.equal(h.ranges, 1);

    replaceRows([{ data: "New match", top: 310 }]);
    assert.equal(view.state.matches[0].data, "New match");
    assert.deepEqual(view.state.highlight, { top: 310, height: 24 });
    assert.equal(h.key("Escape"), true);
    assert.deepEqual(view.state.matches, []);
    assert.equal(view.range, null);
    assert.equal(view.state.query, "matCH");
    assert.equal(h.open(), true);
    assert.equal(view.state.matches.length, 1);
    view.handleChange({ target: { value: "" } });
    assert.equal(root.scrollTop, 0);
    assert.equal(view.state.highlight, null);
    view.componentWillUnmount();
});
