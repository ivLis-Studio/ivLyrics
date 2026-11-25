import assert from "node:assert/strict";
import test from "node:test";
import { createLyricsCacheEditModal } from "../src/lyrics/LyricsCacheEditModal.mjs";
import { createLyricsCacheEditor } from "../src/lyrics/createLyricsCacheEditor.mjs";
import { createTranslationPresentation } from "../src/lyrics/translationPresentation.mjs";
import { buildRecordSlots, join, readRecordLines } from "../src/lyrics/pronunciationSlotFormat.mjs";

const nodes = (node) => node && typeof node === "object"
    ? [node, ...node.children.flatMap(nodes)]
    : [];

test("the cache editor changes timed pronunciation cells and shifts plain lines", () => {
    const changes = [];
    const translationChanges = [];
    const units = [{ text: "一" }, { text: "二" }];
    const entry = { units, parts: ["one", "two"] };
    const Modal = createLyricsCacheEditModal({
        react: { createElement: (type, props, ...children) => ({ type, props, children }) },
        translate: (key) => key,
        readPronunciationSlots: () => ({ join: (_units, parts) => parts.join(" ") }),
        readTheme: () => "light",
    });
    const view = Modal({
        isOpen: true,
        expectedLineCount: 3,
        originalLines: ["一二", "三", "四"],
        pronunciationText: "one two\nthree\nfour",
        pronunciationSlots: [entry, null, null],
        translationText: "first\nsecond\nthird",
        onPronunciationChange: (...args) => changes.push(args),
        onTranslationChange: (...args) => translationChanges.push(args),
    });
    assert.equal(view.props["data-ui-theme"], "light");
    const rendered = nodes(view);
    const inputs = rendered.filter(({ type }) => type === "input");
    assert.equal(inputs[1].props.value, "two");
    inputs[1].props.onChange({ target: { value: "new\nvalue" } });
    assert.deepEqual(changes[0], ["one new value\nthree\nfour", [{ units, parts: ["one", "new value"] }, null, null]]);
    assert.deepEqual(entry.parts, ["one", "two"], "editing a cell preserves the previous state");

    const release = rendered.find(({ props }) => props?.title === "lyricsCacheEditor.editAsLineHint");
    release.props.onClick();
    assert.deepEqual(changes[1], ["one two\nthree\nfour", [null, null, null]]);

    const shifts = rendered.filter(({ props }) => props?.title === "lyricsCacheEditor.shiftDown");
    shifts[0].props.onClick();
    assert.deepEqual(changes[2], ["\none two\nthree", [null, null, null]]);
    shifts[1].props.onClick();
    assert.equal(translationChanges[0][0], "\nfirst\nsecond");
    assert.equal(shifts.at(-1).props.disabled, true);
});

function editorFixture() {
    const tracks = new Map(), writes = [], successes = [], refreshed = [];
    const revisions = new Map();
    const page = {
        state: { uri: "spotify:track:fixture", provider: "fixture-provider", lines: [{ text: "日本" }, { text: "自由" }] },
        _isComponentMounted: true,
        isPlaybackUriCurrent(uri) { return uri === (this.playbackUri || this.state.uri); },
        getCurrentMode: () => 1,
        getTranslationTargetLanguage: () => "ko",
        setState(update) {
            const patch = typeof update === "function" ? update(this.state) : update;
            if (patch) this.state = { ...this.state, ...patch };
        },
        lyricsSource(state) { refreshed.push(state.uri); },
    };
    let activePage = page;
    let diskRevision = 0;
    const key = (id, lang, isPhonetic, provider, hash) => JSON.stringify([id, lang, isPhonetic, provider, hash]);
    const cache = {
        getTranslationRevision: () => diskRevision,
        async getTranslation(...args) { return tracks.get(key(...args)) || null; },
        async setTranslations(id, lang, provider, entries, canWrite) {
            if (!canWrite()) return false;
            writes.push(entries);
            for (const { isPhonetic, sourceHash, data } of entries) tracks.set(key(id, lang, isPhonetic, provider, sourceHash), data);
            return true;
        },
    };
    const translator = {
        clearMemoryCache(id) { revisions.set(id, (revisions.get(id) || 0) + 1); },
        getCacheRevision: id => revisions.get(id),
    };
    const editor = createLyricsCacheEditor({
        page, readActivePage: () => activePage,
        ...createTranslationPresentation({}), resolveModeSpecificLyrics: state => state.lines,
        getTranslationCacheId: uri => uri.split(":").at(-1),
        getTranslationResultCacheHash: (source, isPhonetic) => `${source}:${isPhonetic}`,
        getCache: () => cache, getLyricsService: () => null, getTranslator: () => translator,
        getPronunciationSlots: () => ({ buildRecordSlots, join, readRecordLines }),
        clearMemoryCacheByUri() {}, translate: name => name,
        notifyError: name => assert.fail(name), notifySuccess: name => successes.push(name),
    });
    const seed = (isPhonetic, record, provider = "fixture-provider") => tracks.set(key("fixture", "ko", isPhonetic, provider, `日本\n自由:${isPhonetic}`), record);
    return {
        page, cache, editor, writes, successes, refreshed, seed, translator,
        setActivePage(nextPage) { activePage = nextPage; },
        invalidateDiskCache() { tracks.clear(); diskRevision++; },
    };
}

test("saving cleared pronunciation lines preserves untouched translation and hides the old provider fallback", async () => {
    const fixture = editorFixture();
    fixture.seed(true, { phonetic: ["니혼", "지유"] });
    fixture.seed(true, { phonetic: ["legacy", "fallback"] }, null);
    await fixture.editor.open();
    fixture.page.setState({ lyricsEditPronunciationText: "" });
    await fixture.editor.save();
    assert.equal(fixture.page.state.isLyricsEditModalOpen, false);
    assert.deepEqual(fixture.writes, [[{
        isPhonetic: true, sourceHash: "日本\n自由:true", data: { phonetic: ["", ""], userEdited: true },
    }]]);
    assert.deepEqual(fixture.refreshed, [fixture.page.state.uri]);
    await fixture.editor.open();
    assert.equal(fixture.page.state.lyricsEditPronunciationText, "\n");
    assert.equal(fixture.page.state.lyricsEditHasPronunciationCache, true);
    assert.equal(fixture.page.state.lyricsEditHasTranslationCache, false);
});

test("removing timed cells without changing the joined reading saves only the edited pronunciation", async () => {
    const fixture = editorFixture();
    fixture.seed(true, {
        phonetic: ["니혼", "지유"], slots: buildRecordSlots(2, [["니", "혼"], ["지", "유"]]),
    });
    await fixture.editor.open();
    const [, preserved] = fixture.page.state.lyricsEditPronunciationSlots;
    fixture.page.setState({ lyricsEditPronunciationSlots: [null, preserved] });
    await fixture.editor.save();
    assert.deepEqual(fixture.writes[0][0].data, {
        phonetic: ["니혼", "지유"], slots: buildRecordSlots(2, [null, ["지", "유"]]), userEdited: true,
    });
});

test("a failed two-field save keeps edits available and announces only a successful retry", async () => {
    const fixture = editorFixture();
    const commit = fixture.cache.setTranslations;
    fixture.cache.setTranslations = async () => false;
    await fixture.editor.open();
    fixture.page.setState({ lyricsEditPronunciationText: "니혼", lyricsEditTranslationText: "일본" });
    await fixture.editor.save();
    assert.equal(fixture.page.state.isLyricsEditModalOpen, true);
    assert.equal(fixture.page.state.isLyricsEditSaving, false);
    assert.equal(fixture.page.state.lyricsEditError, "lyricsCacheEditor.saveFailed");
    assert.equal(fixture.page.state.lyricsEditPronunciationText, "니혼");
    assert.deepEqual(fixture.successes, []);
    assert.deepEqual(fixture.refreshed, []);
    fixture.cache.setTranslations = commit;
    await fixture.editor.save();
    assert.deepEqual(fixture.writes.map(entries => entries.length), [2]);
    assert.deepEqual(fixture.successes, ["lyricsCacheEditor.saved"]);
});

test("a stale editor save cannot report an error in the next track's modal", async () => {
    const fixture = editorFixture();
    const pending = Promise.withResolvers();
    fixture.cache.setTranslations = () => pending.promise;
    await fixture.editor.open();
    fixture.page.setState({ lyricsEditTranslationText: "일본" });
    const save = fixture.editor.save();
    fixture.editor.close({ force: true });
    fixture.page.setState({ uri: "spotify:track:next" });
    await fixture.editor.open();
    pending.resolve(false);
    await save;
    assert.equal(fixture.page.state.isLyricsEditModalOpen, true);
    assert.equal(fixture.page.state.lyricsEditError, "");
    assert.deepEqual(fixture.successes, []);
});

test("closing or leaving during the first read stops legacy cache fallback", async () => {
    const fixture = editorFixture();
    const pending = Promise.withResolvers();
    const requests = [];
    fixture.cache.getTranslation = (...args) => {
        requests.push(args);
        return pending.promise;
    };
    const open = fixture.editor.open();
    assert.equal(requests.length, 2);
    fixture.page.playbackUri = "spotify:track:next";
    fixture.editor.close({ force: true });
    pending.resolve(null);
    await open;
    assert.equal(requests.length, 2);
    assert.equal(fixture.page.state.isLyricsEditModalOpen, false);
});

test("a queued editor update cannot open the modal for a song that has already changed", async () => {
    const fixture = editorFixture();
    const { page } = fixture;
    const apply = page.setState.bind(page);
    const updates = [];
    page.setState = update => updates.push(update);
    await fixture.editor.open();
    page.playbackUri = "spotify:track:next";
    for (const update of updates) apply(update);
    assert.equal(page.state.isLyricsEditModalOpen, undefined);
});

test("a confirmed save refreshes the replacement route if it is showing the original track", async () => {
    const fixture = editorFixture();
    const pending = Promise.withResolvers();
    const commit = fixture.cache.setTranslations;
    fixture.cache.setTranslations = async (...args) => {
        await pending.promise;
        return commit(...args);
    };
    await fixture.editor.open();
    fixture.page.setState({ lyricsEditTranslationText: "일본" });
    const save = fixture.editor.save();
    fixture.page._isComponentMounted = false;
    fixture.editor.cancelPending();
    const cleared = [];
    const replacement = {
        ...fixture.page, _isComponentMounted: true, lastProcessedMode: 1,
        clearTranslationRequestsForCacheRemoval: uri => cleared.push(uri),
    };
    fixture.setActivePage(replacement);
    pending.resolve();
    await save;
    assert.deepEqual(fixture.refreshed, [replacement.state.uri]);
    assert.deepEqual(cleared, [replacement.state.uri]);
    assert.equal(replacement.lastProcessedMode, null);
    assert.equal(fixture.writes.length, 1);
    assert.deepEqual(fixture.successes, []);
});

test("clearing the disk cache during an edit prevents its outdated save from restoring records", async () => {
    const fixture = editorFixture();
    fixture.seed(true, { phonetic: ["니혼", "지유"] });
    await fixture.editor.open();
    fixture.page.setState({ lyricsEditPronunciationText: "새 발음" });
    fixture.invalidateDiskCache();
    await fixture.editor.save();
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.successes, []);
    assert.equal(fixture.page.state.lyricsEditError, "lyricsCacheEditor.saveFailed");
    await fixture.editor.open();
    assert.equal(fixture.page.state.lyricsEditPronunciationText, "\n");
});
