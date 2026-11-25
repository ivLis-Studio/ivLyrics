import assert from "node:assert/strict";
import test from "node:test";
import { useSettingsReleaseNotes } from "../src/features/settings/useSettingsReleaseNotes.mjs";

test("leaving About cancels the delay and ignores a pending release response", async () => {
    let callback;
    let cancelled = 0;
    let requestCount = 0;
    let resolveRequest;
    let content = "Loading";
    const classes = new Set(["is-loading"]);
    const container = {
        get innerHTML() { return content; },
        set innerHTML(value) { content = value; },
        classList: {
            remove: (...values) => values.forEach(value => classes.delete(value)),
            add: value => classes.add(value),
        },
    };
    const react = { useEffect: effect => { react.cleanup = effect(); } };
    const mount = () => useSettingsReleaseNotes(react, {
        activeTab: "about",
        uiTheme: "dark",
        findContainer: () => container,
        request: () => {
            requestCount++;
            return new Promise(resolve => { resolveRequest = resolve; });
        },
        translate: key => key,
        escapeHtml: String,
        escapeAttribute: String,
        sanitizeHttpUrl: () => "",
        renderMarkdown: String,
        schedule: (work, delay) => {
            assert.equal(delay, 100);
            callback = work;
            return 1;
        },
        cancel: id => {
            assert.equal(id, 1);
            cancelled++;
        },
        reportError: error => assert.fail(error),
    });

    mount();
    react.cleanup();
    await callback();
    assert.equal(requestCount, 0);
    assert.equal(cancelled, 1);

    mount();
    const stale = callback();
    const resolveStale = resolveRequest;
    react.cleanup();
    mount();
    const fresh = callback();
    resolveRequest(Response.json({ tag_name: "Current", body: "Replacement notes" }));
    await fresh;
    assert.match(content, /Replacement notes/);
    assert.equal(classes.has("is-loading"), false);

    // Both requests share the same DOM container when the theme changes.
    resolveStale(Response.json({ tag_name: "Old", body: "Obsolete notes" }));
    await stale;
    assert.match(content, /Replacement notes/);
    assert.doesNotMatch(content, /Obsolete notes/);

});
